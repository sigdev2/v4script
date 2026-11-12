// Kotlin: the language session - the run time and the JDK library of Java
// (a Java session inside), the Kotlin library on demand (declarations by
// name; functions translated at their first call), the builtins mapped to
// Java classes, units as scripts with shared declarations, main, the value
// of a unit, host modules and host files.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Kt = T.kotlin;
    var Java = T.java;
    if (Kt.language)
        return;

    var J = T.J;
    var CHUNK_PARAMS = ['$j', '$kt', '$T', '$D', '$K'];

    // Natives of the library: owner (package or class) -> key -> function.
    Kt.natives = Kt.natives || Object.create(null);

    var BUILTIN_SOURCES = ['kotlin.builtins', 'kotlin.collections.builtins'];
    // Library classes the checker and the translator name directly.
    var NAMED_CLASSES = { KClass: 'kotlin.reflect.KClass', KProperty: 'kotlin.reflect.KProperty', IntRange: 'kotlin.ranges.IntRange',
                          LongRange: 'kotlin.ranges.LongRange', CharRange: 'kotlin.ranges.CharRange',
                          UIntRange: 'kotlin.ranges.UIntRange', ULongRange: 'kotlin.ranges.ULongRange',
                          IntIterator: 'kotlin.collections.IntIterator' };

    function Session(env) {
        this.env = env;
        Kt.session = this;
        this.javaSession = Java.language.createSession(env);
        this.runtime = this.javaSession.runtime;
        this.asyncNames = this.javaSession.asyncNames;
        this.K = this.runtime.K;
        this.javaClasses = new Map();
        this.packages = Object.create(null);
        this.loadedUnits = Object.create(null);
        this.loadedNames = Object.create(null);
        this.facades = Object.create(null);
        this.functionCounter = 0;
        // Declarations of the units (committed) and of the unit being checked (pending).
        this.user = { classes: Object.create(null), funs: Object.create(null), props: Object.create(null),
                      aliases: Object.create(null) };
        this.pending = null;
        this.userNames = Object.create(null);
        this.modules = Object.create(null);
        this.missingModules = Object.create(null);
        this.kclasses = new Map();
        this.propertyObjects = Object.create(null);
        this.K.$kts = {};
        this.ktRuntime = new Kt.Runtime(this);
        this.hostPackages = [];
        this.hostGlobals = [];
        this.loadBuiltins();
        this.loadHostModules();
    }

    // The globals of the translator point at this session while it works.
    Session.prototype.activate = function () {
        Kt.session = this;
        Java.rt = this.runtime;
        Java.symtab = this.javaSession.symtab;
    };

    // --- The library

    Session.prototype.packageTable = function (pkg) {
        var table = this.packages[pkg];
        if (table === undefined) {
            table = this.packages[pkg] = { classes: Object.create(null), funs: Object.create(null), props: Object.create(null),
                                           aliases: Object.create(null) };
        }
        return table;
    };

    // The library declarations named name in pkg (parsed once).
    Session.prototype.ensureLoaded = function (pkg, name) {
        var key = pkg + '/' + name;
        if (this.loadedNames[key] === true)
            return;
        this.loadedNames[key] = true;
        var self = this;
        Kt.libraryUnits(pkg, name).forEach(function (unitId) { self.loadUnit(unitId); });
    };

    Session.prototype.loadUnit = function (unitId) {
        if (this.loadedUnits[unitId] === true)
            return;
        this.loadedUnits[unitId] = true;
        var unit = Kt.library.units[unitId];
        var saved = this.activeLibraryUnit;
        this.activeLibraryUnit = unit;
        try {
            var tree = Kt.parse(unit.text, T.LIBRARY_SOURCE);
            var checker = new Kt.Checker(this, T.LIBRARY_SOURCE);
            var file = checker.fileScope(unit.pkg, tree.imports, true);
            var self = this;
            tree.items.forEach(function (item) { self.enterLibraryItem(item, unit.pkg, file, checker); });
        } catch (error) {
            if (error instanceof T.CompileError && error.message.indexOf('[') !== 0)
                error.message = '[' + unit.source + ' ' + unit.name + '] ' + error.message;
            throw error;
        } finally {
            this.activeLibraryUnit = saved;
        }
    };

    Session.prototype.enterLibraryItem = function (item, pkg, file, checker) {
        var table = this.packageTable(pkg);
        var self = this;
        switch (item.k) {
        case 'class': {
            var sym = checker.enterClass(item, null, file, pkg, true);
            sym.checker = checker;
            table.classes[sym.name] = sym;
            this.setupLibraryClass(sym);
            return;
        }
        case 'fun': {
            var fn = checker.functionSymbol(item, null, file);
            fn.pkg = pkg;
            fn.library = true;
            fn.checker = checker;
            fn.jsName = T.jsName(fn.name) + '$' + (++this.functionCounter);
            (table.funs[fn.name] = table.funs[fn.name] || []).push(fn);
            this.installFunction(fn);
            return;
        }
        case 'property': {
            var prop = checker.propertySymbol(item, null, file);
            prop.pkg = pkg;
            prop.library = true;
            prop.checker = checker;
            var id = ++this.functionCounter;
            prop.jsName = 'p$' + T.jsName(prop.name) + '$' + id;
            prop.getterName = 'get$' + T.jsName(prop.name) + '$' + id;
            prop.setterName = prop.mutable ? 'set$' + T.jsName(prop.name) + '$' + id : null;
            (table.props[prop.name] = table.props[prop.name] || []).push(prop);
            this.installProperty(prop);
            return;
        }
        case 'typealias':
            table.aliases[item.name] = this.aliasSymbol(item, file, checker);
            return;
        }
        void self;
        throw new Error('Kotlin library: unexpected ' + item.k);
    };

    Session.prototype.aliasSymbol = function (item, scope, checker) {
        var alias = { kind: 'alias', name: item.name, node: item, scope: scope, type: null, typeParams: [] };
        var aliasScope = scope.child('signature');
        alias.typeParams = checker.declareTypeParams(item.typeParams, alias, aliasScope);
        alias.scope = aliasScope;
        return alias;
    };

    // The facade object of the top-level functions of a package.
    Session.prototype.facadeId = function (pkg) {
        var id = '$kf_' + (pkg === '' ? 'root' : pkg.replace(/\./g, '_'));
        if (this.facades[id] === undefined) {
            this.facades[id] = true;
            this.K[id] = {};
        }
        return id;
    };

    // A stub that translates a library function at its first call.
    Session.prototype.installFunction = function (fn) {
        var holder = this.K[this.facadeId(fn.pkg)];
        var self = this;
        holder[fn.jsName] = this.ktRuntime.lazyFunction(holder, fn.jsName, function (target) {
            return self.compileLazyFunction(fn, target);
        });
    };

    Session.prototype.installProperty = function (prop) {
        var holder = this.K[this.facadeId(prop.pkg)];
        var self = this;
        var load = function (target) { return self.compileLibraryAccessor(prop, target, 'get'); };
        holder[prop.getterName] = this.runtime.lazyMethod(holder, prop.getterName, load, false);
        if (prop.setterName !== null) {
            var store = function (target) { return self.compileLibraryAccessor(prop, target, 'set'); };
            holder[prop.setterName] = this.runtime.lazyMethod(holder, prop.setterName, store, false);
        }
        // Reads of a plain top-level val go through its getter (the field is made there).
        prop.customGetter = true;
    };

    // A library function at its first call: checked, translated, its own chunk.
    Session.prototype.compileLazyFunction = function (fn, holder) {
        if (fn.compiled !== undefined) {
            holder[fn.jsName] = fn.compiled;
            return fn.compiled;
        }
        var saved = { kt: Kt.session };
        this.activate();
        try {
            var code;
            if (fn.external || (fn.node !== null && fn.node.body === null)) {
                code = this.nativeFunction(fn);
                if (code === null)
                    throw new Error('Kotlin native is missing: ' + Kt.nativeKey(fn));
                fn.compiled = code;
                holder[fn.jsName] = code;
                return code;
            }
            var checker = fn.checker || (fn.owner !== null ? fn.owner.checker : null);
            if (fn.owner !== null)
                fn.owner.complete();
            var start = checker.functions.length;
            checker.checkFunctionBody(fn);
            this.markWaiting(checker.functions.slice(start));
            checker.functions.length = start;
            var generator = new Kt.Generator(this, T.LIBRARY_SOURCE);
            code = generator.functionCode(fn, fn.owner);
            var compiled = this.compile([J.ret(code)], generator, '', { library: true });
            fn.compiled = compiled;
            holder[fn.jsName] = compiled;
            return compiled;
        } catch (error) {
            if (error instanceof T.CompileError && error.source === T.LIBRARY_SOURCE && error.message.indexOf('[') !== 0)
                error.message = '[' + (fn.owner !== null ? fn.owner.fqName : fn.pkg) + '.' + fn.name + '] ' + error.message;
            throw error;
        } finally {
            Kt.session = saved.kt;
        }
    };

    // The getter or setter of a library top-level property.
    Session.prototype.compileLibraryAccessor = function (prop, holder, which) {
        var name = which === 'get' ? prop.getterName : prop.setterName;
        var self = this;
        this.activate();
        var node = prop.node;
        prop.checker.checkProperty(prop);
        var generator = new Kt.Generator(this, T.LIBRARY_SOURCE);
        var code;
        if (prop.mods.external) {
            code = generator.constant(this.nativeProperty(prop, which));
        } else if (which === 'get' && node.getter !== null && node.getter.body !== null) {
            code = generator.accessorFunction(null, prop, node.getter);
        } else if (which === 'set' && node.setter !== null && node.setter.body !== null) {
            code = generator.accessorFunction(null, prop, node.setter);
        } else if (which === 'get' && node.init !== null) {
            // A val with an initializer: computed once.
            var fn = generator.pushFunction('function', {});
            var field = J.mem(J.mem(J.id('$K'), this.facadeId(prop.pkg)), prop.jsName);
            var fill = generator.withPre(function () { return generator.valueAs(node.init, prop.type); }, function (value) {
                return J.expr(J.assign(field, value));
            });
            var body = [J.if_(J.bin('===', field, J.undef()), J.block(fill)), J.ret(field)];
            generator.popFunction();
            code = generator.functionCode(null, null, fn, [], body);
        } else {
            throw new Error('Kotlin library property without a getter: ' + prop.name);
        }
        void self;
        var compiled = this.compile([J.ret(code)], generator, '', { library: true });
        holder[name] = compiled;
        return compiled;
    };

    Session.prototype.chunkArgs = function (generator) {
        return [this.runtime, this.ktRuntime, T, generator.constants, this.K];
    };

    // A chunk of translated code; the Java classes it reached are registered first.
    Session.prototype.compile = function (body, generator, source, options) {
        this.javaSession.compileLibrary();
        return this.env.compileChunk(body, CHUNK_PARAMS, this.chunkArgs(generator), source || '', options);
    };

    // A library class: compiled (with lazy methods) at its first use at run time.
    Session.prototype.setupLibraryClass = function (sym) {
        var self = this;
        var register = function (cls, top) {
            self.runtime.lazyClass(cls.jsId, cls.binaryName || cls.fqName, function () { self.compileLibraryClass(top); });
            Object.keys(cls.nested).forEach(function (name) { register(cls.nested[name], top); });
        };
        var mapping = this.javaMapping(sym.node);
        if (mapping !== null) {
            this.mapBuiltin(sym, mapping);
            // A companion of a builtin (String.Companion) is a class of its own.
            Object.keys(sym.nested).forEach(function (name) {
                var nested = sym.nested[name];
                if (self.javaMapping(nested.node) === null)
                    register(nested, nested);
            });
            return;
        }
        register(sym, sym);
    };

    // tools/run-samples.mjs --library: every declaration of the library
    // translated at once (errors in its sources, missing natives).
    Session.prototype.compileWholeLibrary = function () {
        var self = this;
        var errors = [];
        var functions = 0;
        this.activate();
        function attempt(what, action) {
            try {
                action();
            } catch (error) {
                errors.push(what + ': ' + error.message);
            }
        }
        Object.keys(Kt.library.units).forEach(function (unitId) {
            if (!Kt.library.units[unitId].whole)
                attempt(unitId, function () { self.loadUnit(unitId); });
        });
        Object.keys(this.packages).forEach(function (pkg) {
            var table = self.packages[pkg];
            var holder = self.K[self.facadeId(pkg)];
            Object.keys(table.funs).forEach(function (name) {
                table.funs[name].forEach(function (fn) {
                    ++functions;
                    attempt(pkg + '.' + name, function () { self.compileLazyFunction(fn, holder); });
                });
            });
            Object.keys(table.props).forEach(function (name) {
                table.props[name].forEach(function (prop) {
                    attempt(pkg + '.' + name, function () {
                        self.compileLibraryAccessor(prop, holder, 'get');
                        if (prop.setterName !== null)
                            self.compileLibraryAccessor(prop, holder, 'set');
                    });
                });
            });
            Object.keys(table.classes).forEach(function (name) {
                var sym = table.classes[name];
                attempt(sym.fqName, function () {
                    sym.complete();
                    if (sym.java === null || sym.java === undefined)
                        self.compileLibraryClass(sym);
                    (function each(cls) {
                        Object.keys(cls.members).forEach(function (memberName) {
                            cls.members[memberName].forEach(function (member) {
                                if (member.kind !== 'fun' || member.node === null || member.node === undefined || member.synthetic ||
                                    member.isAbstract || member.intrinsic !== null && member.intrinsic !== undefined ||
                                    cls.java !== null && cls.java !== undefined)
                                    return;
                                ++functions;
                                attempt(cls.fqName + '.' + memberName, function () { self.compileLazyFunction(member, {}); });
                            });
                        });
                        Object.keys(cls.nested).forEach(function (nestedName) { each(cls.nested[nestedName]); });
                    })(sym);
                });
            });
        });
        if (errors.length > 0)
            throw new Error(errors.length + ' errors in the Kotlin library:\n' + errors.join('\n'));
        return Object.keys(Kt.library.units).length + ' declarations, ' + functions + ' functions';
    };

    Session.prototype.compileLibraryClass = function (sym) {
        if (sym.compiledClass)
            return;
        sym.compiledClass = true;
        this.activate();
        sym.complete();
        var checker = sym.checker;
        var start = checker.functions.length;
        checker.checkClassBody(sym);
        this.markWaiting(checker.functions.slice(start));
        checker.functions.length = start;
        var generator = new Kt.Generator(this, T.LIBRARY_SOURCE);
        var classes = generator.collectClasses(sym, []);
        var body = this.classesCode(generator, classes);
        this.compile(body, generator, '', { library: true });
    };

    // Class definitions (supertypes first), finishClass, enum entries.
    Session.prototype.classesCode = function (generator, classes) {
        var body = [];
        var ordered = generator.orderClasses(classes);
        ordered.forEach(function (sym) {
            body = body.concat(generator.classDefinition(sym, '$c' + sym.jsId.replace(/[^A-Za-z0-9_]/g, '_')));
        });
        ordered.forEach(function (sym) {
            body.push(J.expr(J.call(J.mem(J.id('$j'), 'finishClass'), [J.mem(J.id('$K'), sym.jsId)])));
        });
        return body;
    };

    // @JvmMapped("java.class", "kind") of a builtin, or null.
    Session.prototype.javaMapping = function (node) {
        var annotations = node.annotations || [];
        for (var index = 0; index < annotations.length; ++index) {
            var annotation = annotations[index];
            if (annotation.name === 'JvmMapped') {
                var args = annotation.args.map(function (arg) {
                    return arg.value.k === 'string' ? arg.value.parts.map(function (part) { return part.value; }).join('') : null;
                });
                return { java: args[0], kind: args[1] || null };
            }
        }
        return null;
    };

    // A builtin: the Java class at run time, a primitive or an array.
    Session.prototype.mapBuiltin = function (sym, mapping) {
        var self = this;
        sym.mappedBuiltin = true;
        if (mapping.kind === 'array') {
            sym.arrayDescriptor = mapping.java;
        } else if (mapping.java.indexOf('kotlin.') === 0) {
            sym.prim = mapping.kind;
        } else {
            var javaSym = this.javaSession.symtab.lookupQualified(mapping.java);
            if (javaSym === null)
                throw new Error('Kotlin builtin ' + sym.name + ': no Java class ' + mapping.java);
            sym.java = javaSym;
            sym.jsId = javaSym.jsId;
            if (mapping.kind !== null)
                sym.prim = mapping.kind;
        }
        var complete = sym.completer;
        sym.completer = function (target) {
            complete(target);
            self.finishBuiltin(target);
        };
        // Nested builtins (Map.Entry).
        Object.keys(sym.nested).forEach(function (name) {
            var nested = sym.nested[name];
            var nestedMapping = self.javaMapping(nested.node);
            if (nestedMapping !== null)
                self.mapBuiltin(nested, nestedMapping);
        });
    };

    // The JavaScript names of the members of a builtin: those of the Java methods.
    Session.prototype.finishBuiltin = function (sym) {
        var self = this;
        if (sym.prim !== null && sym.arrayDescriptor === undefined)
            Kt.primitiveMembers(sym);
        // @Intrinsic members (String.length, Array.get) of every builtin.
        Object.keys(sym.members).forEach(function (name) {
            sym.members[name].forEach(function (member) {
                if (member.node !== null && member.node !== undefined && member.node.annotations !== undefined &&
                    (member.intrinsic === null || member.intrinsic === undefined)) {
                    var intrinsic = self.annotationValue(member.node, 'Intrinsic');
                    if (intrinsic !== null)
                        member.intrinsic = intrinsic;
                }
            });
        });
        if (sym.java === null || sym.java === undefined)
            return;
        var javaType = Java.classType(sym.java, []);
        Object.keys(sym.members).forEach(function (name) {
            sym.members[name].forEach(function (member) {
                if (member.intrinsic !== null && member.intrinsic !== undefined)
                    return;
                if (member.node !== null && member.node !== undefined && member.node.annotations !== undefined) {
                    var intrinsic = self.annotationValue(member.node, 'Intrinsic');
                    if (intrinsic !== null) {
                        member.intrinsic = intrinsic;
                        return;
                    }
                }
                if (member.node !== null && member.node !== undefined && member.node.k === 'fun' && member.node.body !== null)
                    return;
                if (member.kind === 'prop' && member.node !== null && member.node !== undefined &&
                    (member.node.init !== null || member.node.getter !== null))
                    return;
                var javaName = member.node !== null && member.node !== undefined ? self.annotationValue(member.node, 'JvmName') : null;
                if (member.kind === 'fun') {
                    var method = self.javaMethodFor(javaType, javaName || member.name, member);
                    if (method === null)
                        throw new Error('Kotlin builtin ' + sym.name + '.' + member.name + ': no Java method');
                    member.jsName = method.jsName;
                    member.javaMethod = method;
                } else {
                    var getter = null;
                    var candidates = javaName !== null ? [javaName] : [member.name, 'get' + member.name.charAt(0).toUpperCase() + member.name.substring(1),
                                                                       member.name];
                    for (var index = 0; index < candidates.length && getter === null; ++index)
                        getter = self.javaMethodFor(javaType, candidates[index], { params: [], name: candidates[index] });
                    if (getter === null)
                        throw new Error('Kotlin builtin ' + sym.name + '.' + member.name + ': no Java getter');
                    member.getterName = getter.jsName;
                    member.hasField = false;
                    member.isOpen = true;
                }
            });
        });
    };

    Session.prototype.annotationValue = function (node, name) {
        var annotations = node.annotations || [];
        for (var index = 0; index < annotations.length; ++index) {
            var annotation = annotations[index];
            if (annotation.name === name && annotation.args.length > 0 && annotation.args[0].value.k === 'string')
                return annotation.args[0].value.parts.map(function (part) { return part.value; }).join('');
        }
        return null;
    };

    // The Java method for a Kotlin member: by name and the number of
    // parameters; with overloads (remove(int), remove(Object)) by the kinds.
    Session.prototype.javaMethodFor = function (javaType, name, member) {
        var found = Java.findMethods(javaType, name).map(function (item) { return item.method; }).filter(function (method) {
            return !method.isStatic && method.params.length === member.params.length;
        });
        if (found.length <= 1)
            return found[0] || null;
        var wanted = member.params.map(function (param) {
            var type = Kt.resolved(param.type);
            return Kt.isPrimitive(type) ? 'prim' : 'ref';
        });
        var exact = found.filter(function (method) {
            return method.params.every(function (javaParam, index) {
                var kind = Java.resolved(javaParam).kind === 'prim' ? 'prim' : 'ref';
                return kind === wanted[index];
            });
        });
        return exact[0] || found[0];
    };

    // The builtins: their sources, the symbols in Kt.builtins.
    Session.prototype.loadBuiltins = function () {
        var self = this;
        Kt.builtins = Object.create(null);
        this.activate();
        BUILTIN_SOURCES.forEach(function (id) {
            Kt.library.order.forEach(function (unitId) {
                if (Kt.library.units[unitId].source === id)
                    self.loadUnit(unitId);
            });
        });
        ['kotlin', 'kotlin.collections'].forEach(function (pkg) {
            var table = self.packageTable(pkg);
            Object.keys(table.classes).forEach(function (name) {
                var sym = table.classes[name];
                if (Kt.builtins[name] === undefined)
                    Kt.builtins[name] = sym;
                Object.keys(sym.nested).forEach(function (nestedName) {
                    if (Kt.builtins[nestedName] === undefined)
                        Kt.builtins[nestedName] = sym.nested[nestedName];
                });
            });
        });
        Kt.builtins.Nothing.isNothing = true;
        Object.keys(NAMED_CLASSES).forEach(function (name) {
            Object.defineProperty(Kt.builtins, name, {
                configurable: true,
                enumerable: true,
                get: function () {
                    var cls = self.libraryClass(NAMED_CLASSES[name]);
                    Object.defineProperty(Kt.builtins, name, { value: cls, configurable: true, enumerable: true });
                    return cls;
                }
            });
        });
    };

    // A library class by its full name (loaded on demand).
    Session.prototype.libraryClass = function (fqName) {
        var cls = this.lookupClass(fqName);
        if (cls === null)
            throw new Error('Kotlin library class is missing: ' + fqName);
        return cls;
    };

    // --- Lookups for the checker

    Session.prototype.isPackage = function (name) {
        if (Kt.isLibraryPackage(name))
            return true;
        var packages = Java.library.packages;
        if (packages[name] !== undefined)
            return true;
        var prefix = name + '.';
        return Object.keys(packages).some(function (pkg) { return pkg.indexOf(prefix) === 0; }) ||
            this.hostPackages.indexOf(name) >= 0;
    };

    // A class by its full name: of the units, the library, Java.
    Session.prototype.lookupClass = function (fqName) {
        var parts = fqName.split('.');
        // The longest package prefix that has the class.
        for (var split = parts.length - 1; split >= 0; --split) {
            var pkg = parts.slice(0, split).join('.');
            var name = parts[split];
            if (name === undefined)
                continue;
            var cls = null;
            if (pkg === '') {
                cls = this.userClass(name);
            } else {
                this.ensureLoaded(pkg, name);
                var table = this.packages[pkg];
                if (table !== undefined && table.classes[name] !== undefined)
                    cls = table.classes[name];
            }
            if (cls === null && pkg !== '') {
                var javaSym = this.javaSession.symtab.lookupQualified(pkg + '.' + name);
                if (javaSym !== null)
                    cls = Kt.javaClass(javaSym);
            }
            if (cls !== null) {
                // The rest are nested classes.
                for (var index = split + 1; index < parts.length && cls !== null; ++index) {
                    cls.complete();
                    cls = cls.nested[parts[index]] || (cls.java !== null && cls.java !== undefined && cls.java.memberTypes[parts[index]]
                        ? Kt.javaClass(cls.java.memberTypes[parts[index]]) : null);
                }
                return cls;
            }
        }
        return null;
    };

    Session.prototype.lookupAlias = function (pkg, name) {
        this.ensureLoaded(pkg, name);
        var table = this.packages[pkg];
        if (table !== undefined && table.aliases[name] !== undefined)
            return table.aliases[name];
        if (pkg === '')
            return this.userAlias(name);
        return null;
    };

    Session.prototype.userClass = function (name) {
        if (this.pending !== null && this.pending.classes[name] !== undefined)
            return this.pending.classes[name];
        if (this.user.classes[name] !== undefined)
            return this.user.classes[name];
        var module = this.moduleClass(name);
        return module;
    };

    Session.prototype.userAlias = function (name) {
        if (this.pending !== null && this.pending.aliases[name] !== undefined)
            return this.pending.aliases[name];
        return this.user.aliases[name] || null;
    };

    // A class or an alias in a package by a simple name.
    Session.prototype.packageClass = function (pkg, name, file) {
        if (pkg === '' && (file === null || !file.library)) {
            var cls = this.userClass(name);
            if (cls !== null)
                return cls;
            return this.userAlias(name);
        }
        this.ensureLoaded(pkg, name);
        var table = this.packages[pkg];
        if (table !== undefined) {
            if (table.classes[name] !== undefined)
                return table.classes[name];
            if (table.aliases[name] !== undefined)
                return table.aliases[name];
        }
        if (Java.library.packages[pkg] !== undefined && Java.library.index[pkg + '.' + name] !== undefined) {
            var javaSym = this.javaSession.symtab.lookupQualified(pkg + '.' + name);
            if (javaSym !== null)
                return Kt.javaClass(javaSym);
        }
        return null;
    };

    // Top-level declarations named name in a package: { fn } | { member } | { classRef } | { alias }.
    Session.prototype.packageDeclarations = function (pkg, name, file) {
        var result = [];
        if (pkg === '' && (file === null || !file.library)) {
            var pending = this.pending;
            var seen = [];
            var add = function (fn) {
                var signature = Kt.userSignature(fn);
                if (seen.indexOf(signature) >= 0)
                    return;
                seen.push(signature);
                result.push({ fn: fn, map: new Map() });
            };
            if (pending !== null)
                (pending.funs[name] || []).forEach(add);
            (this.user.funs[name] || []).forEach(add);
            var prop = pending !== null && pending.props[name] !== undefined ? pending.props[name] : this.user.props[name];
            if (prop !== undefined)
                result.push({ member: prop, map: new Map() });
            var cls = this.userClass(name);
            if (cls !== null)
                result.push({ classRef: cls });
            var alias = this.userAlias(name);
            if (alias !== null)
                result.push({ alias: alias });
            return result;
        }
        this.ensureLoaded(pkg, name);
        var table = this.packages[pkg];
        if (table !== undefined) {
            (table.funs[name] || []).forEach(function (fn) { result.push({ fn: fn, map: new Map() }); });
            (table.props[name] || []).forEach(function (member) { result.push({ member: member, map: new Map() }); });
            if (table.classes[name] !== undefined)
                result.push({ classRef: table.classes[name] });
            if (table.aliases[name] !== undefined)
                result.push({ alias: table.aliases[name] });
        }
        if (result.length === 0 && Java.library.index[pkg + '.' + name] !== undefined) {
            var javaSym = this.javaSession.symtab.lookupQualified(pkg + '.' + name);
            if (javaSym !== null)
                result.push({ classRef: Kt.javaClass(javaSym) });
        }
        return result;
    };

    // An explicit import: a class, top-level functions and properties, members of an object.
    Session.prototype.importedDeclarations = function (path) {
        var name = path[path.length - 1];
        var pkg = path.slice(0, -1).join('.');
        var result = this.packageDeclarations(pkg, name, null);
        if (result.length > 0)
            return result;
        var cls = this.lookupClass(path.join('.'));
        if (cls !== null)
            return [{ classRef: cls }];
        // import Object.member
        var owner = this.lookupClass(pkg);
        if (owner !== null)
            return this.objectMembers(owner, name);
        return [];
    };

    // Members of an object (or of the companion of a class) for imports.
    Session.prototype.objectMembers = function (owner, name) {
        owner.complete();
        var target = owner.kind === 'object' ? owner : owner.companion;
        if (target === null || target === undefined) {
            if (owner.java !== null && owner.java !== undefined)
                return Kt.javaMembers(owner, name, true).map(function (member) { return { member: member, map: new Map(), staticOf: owner }; });
            return [];
        }
        target.complete();
        return (target.members[name] || []).map(function (member) {
            return { member: member, map: new Map(), objectOf: target };
        });
    };

    // Packages a unit sees without import: those of Kotlin and of the global host modules.
    Session.prototype.defaultImports = function () {
        if (this.defaultPackages === undefined) {
            var self = this;
            this.defaultPackages = Kt.DEFAULT_IMPORTS.concat(this.hostGlobals.map(function (fqName) {
                return fqName.slice(0, fqName.lastIndexOf('.'));
            })).filter(function (pkg, index, list) { return list.indexOf(pkg) === index; });
        }
        return this.defaultPackages;
    };

    // Members of global host modules (functions without the object name).
    Session.prototype.globalHostMembers = function (name) {
        var self = this;
        var result = [];
        this.hostGlobals.forEach(function (fqName) {
            var cls = self.lookupClass(fqName);
            if (cls !== null)
                self.objectMembers(cls, name).forEach(function (item) { result.push(item); });
        });
        return result;
    };

    // --- Helpers of the translator and the run time

    Session.prototype.unitInstance = function () {
        var cls = Kt.builtins.Unit;
        cls.complete();
        return this.K[cls.jsId].$instance;
    };

    // A class of the run time by the full name (Kotlin or Java).
    Session.prototype.runtimeClass = function (name) {
        var cls = this.lookupClass(name);
        if (cls === null)
            return this.runtime.byName(name);
        cls.complete();
        var resolved = cls;
        if (resolved.kind === 'alias')
            resolved = Kt.resolved(this.aliasType(resolved)).sym;
        return this.K[resolved.jsId];
    };

    Session.prototype.aliasType = function (alias) {
        if (alias.type === null) {
            var checker = new Kt.Checker(this, T.LIBRARY_SOURCE);
            alias.type = checker.resolveType(alias.node.type, alias.scope);
        }
        return alias.type;
    };

    // The constructor (message) or () of an exception class.
    Session.prototype.exceptionConstructor = function (name, withMessage) {
        var cls = this.lookupClass(name);
        if (cls === null) {
            var javaSym = this.javaSession.symtab.classNamed(name).complete();
            var ctor = javaSym.ctors.filter(function (item) { return item.params.length === (withMessage ? 1 : 0); })[0];
            return ctor.jsName;
        }
        cls.complete();
        var ctors = cls.ctors.filter(function (item) {
            return item.params.length === (withMessage ? 1 : 0) || (withMessage && item.params.length >= 1 && item.params.slice(1).every(function (param) { return param.hasDefault; })) ||
                (!withMessage && item.params.every(function (param) { return param.hasDefault; }));
        });
        return (ctors[0] || cls.ctors[0]).jsName;
    };

    Session.prototype.newArrayList = function () {
        var ArrayList = this.runtime.byName('java.util.ArrayList');
        return new ArrayList().$init0();
    };

    Session.prototype.arrayIterator = function (array) {
        var fn = this.libraryFunction('kotlin.collections', 'v4ArrayIterator');
        return fn(array);
    };

    // A library function by package and name (its first declaration).
    Session.prototype.libraryFunction = function (pkg, name) {
        this.ensureLoaded(pkg, name);
        var fn = this.packageTable(pkg).funs[name][0];
        var holder = this.K[this.facadeId(pkg)];
        return function () { return holder[fn.jsName].apply(holder, arguments); };
    };

    Session.prototype.rangeConstructor = function (classType) {
        void classType;
        return '$init';
    };

    // The KClass object of a class constructor or an array descriptor.
    Session.prototype.kclassObject = function (classType) {
        var known = this.kclasses.get(classType);
        if (known !== undefined)
            return known;
        var cls = this.libraryClass('kotlin.reflect.KClassImpl');
        cls.complete();
        var object = new this.K[cls.jsId]();
        object.$runtimeClass = classType;
        object[cls.ctors[0].jsName]();
        this.kclasses.set(classType, object);
        return object;
    };

    // A KProperty for delegates: the name.
    Session.prototype.propertyObject = function (name) {
        if (this.propertyObjects[name] === undefined) {
            var cls = this.libraryClass('kotlin.reflect.KPropertyImpl');
            cls.complete();
            var object = new this.K[cls.jsId]();
            object[cls.ctors[0].jsName](name);
            this.propertyObjects[name] = object;
        }
        return this.propertyObjects[name];
    };

    // A descriptor of a type for is/as at run time.
    Session.prototype.typeDescriptor = function (type) {
        var self = this;
        type = Kt.resolved(type);
        var nullable = Kt.isNullable(type);
        var name = Kt.typeString(Kt.makeNotNull(type));
        var fqName = function (sym) { return sym.fqName; };
        if (type.kind === 'fun')
            return { kind: 'function', nullable: nullable, name: 'kotlin.Function' + type.params.length, javaName: 'kotlin.jvm.functions.Function' + type.params.length };
        if (type.kind !== 'class')
            return { kind: 'any', nullable: true, name: name, javaName: 'java.lang.Object' };
        var sym = type.sym;
        if (sym === Kt.builtins.Any)
            return { kind: 'any', nullable: nullable, name: 'kotlin.Any', javaName: 'java.lang.Object' };
        if (sym === Kt.builtins.String)
            return { kind: 'string', nullable: nullable, name: 'kotlin.String', javaName: 'java.lang.String' };
        if (sym === Kt.builtins.Int)
            return { kind: 'int', nullable: nullable, name: 'kotlin.Int', javaName: 'java.lang.Integer' };
        if (sym === Kt.builtins.Boolean)
            return { kind: 'boolean', nullable: nullable, name: 'kotlin.Boolean', javaName: 'java.lang.Boolean' };
        if (sym.arrayDescriptor !== undefined)
            return { kind: 'array', nullable: nullable, descriptor: sym === Kt.builtins.Array ? '[Ljava.lang.Object;' : sym.arrayDescriptor,
                     name: 'kotlin.' + sym.name, javaName: sym.arrayDescriptor };
        var javaName = sym.java !== null && sym.java !== undefined ? sym.java.qname : (sym.binaryName || sym.fqName);
        return { kind: 'class', nullable: nullable, name: (sym.mappedBuiltin ? 'kotlin.' : '') + (sym.mappedBuiltin ? sym.name : fqName(sym)),
                 javaName: javaName, ctor: function () { return self.K[sym.jsId]; } };
    };

    // --- Natives

    // The key of a native: owner/name(parameter types).
    Kt.nativeKey = function (member) {
        var owner = member.owner !== null && member.owner !== undefined ? member.owner.fqName : (member.pkg || '');
        var receiver = member.receiver !== null && member.receiver !== undefined ? Kt.typeString(member.receiver) + '.' : '';
        var params = member.kind === 'fun' ? '(' + member.params.map(function (param) {
            return (param.vararg ? 'vararg ' : '') + Kt.typeString(param.vararg ? Kt.varargElement(param.type) : param.type);
        }).join(',') + ')' : '';
        return owner + '/' + receiver + member.name + params;
    };

    Session.prototype.nativeFunction = function (fn) {
        var key = Kt.nativeKey(fn);
        var owner = key.substring(0, key.indexOf('/'));
        var table = Kt.natives[owner];
        if (table === undefined)
            return null;
        var native = table[key.substring(key.indexOf('/') + 1)];
        return native === undefined ? null : native;
    };

    Session.prototype.nativeProperty = function (prop, which) {
        var key = Kt.nativeKey(prop);
        var owner = key.substring(0, key.indexOf('/'));
        var table = Kt.natives[owner] || {};
        var native = table[(which === 'set' ? 'set:' : '') + key.substring(key.indexOf('/') + 1)];
        if (native === undefined)
            throw new Error('Kotlin native is missing: ' + key);
        return native;
    };

    Session.prototype.nativeFor = function (member) {
        var native = member.kind === 'fun' ? this.nativeFunction(member) : null;
        if (native === null && member.kind === 'prop') {
            try {
                native = this.nativeProperty(member, 'get');
            } catch (error) {
                native = null;
            }
        }
        return native;
    };

    // --- Host modules: an object Title in the package of the module

    var KOTLIN_PARAMETER = { string: 'String', number: 'Double', int: 'Long', bool: 'Boolean', value: 'Any?', array: 'Any?' };
    var KOTLIN_RESULT = { void: 'Unit', string: 'String', number: 'Double', int: 'Long', bool: 'Boolean', value: 'JsValue',
                          array: 'List<JsValue>' };

    Session.prototype.loadHostModules = function () {
        var self = this;
        this.env.modules.forEach(function (module) {
            var title = module.names.title;
            var lines = ['package ' + module.name, '', 'import js.*', '', 'public object ' + title + ' {'];
            var natives = {};
            module.functions.forEach(function (fn) {
                if (fn.getter) {
                    lines.push('    public external val ' + fn.name + ': ' + KOTLIN_RESULT[fn.result]);
                    natives[fn.name] = Java.hostMethod(fn, []);
                    return;
                }
                for (var count = fn.required; count <= fn.parameters.length; ++count) {
                    var declared = fn.parameters.slice(0, count);
                    lines.push('    public external fun ' + fn.name + '(' + declared.map(function (parameter) {
                        return parameter.name + ': ' + KOTLIN_PARAMETER[parameter.type];
                    }).join(', ') + '): ' + KOTLIN_RESULT[fn.result]);
                    natives[fn.name + '(' + declared.map(function (parameter) { return KOTLIN_PARAMETER[parameter.type]; }).join(',') + ')'] =
                        Java.hostMethod(fn, declared);
                }
            });
            lines.push('}');
            var id = 'host:' + module.name;
            if (Kt.library.units[id] === undefined)
                Kt.addLibrary(id, lines.join('\n'));
            Kt.natives[module.name + '.' + title] = natives;
            self.hostPackages.push(module.name);
            if (module.global)
                self.hostGlobals.push(module.name + '.' + title);
        });
    };

    // --- The unit

    // The JavaScript name of a top-level function of the units: the same
    // signature keeps the name (a new unit replaces the function).
    Kt.userSignature = function (fn) {
        return (fn.receiver !== null ? Kt.typeString(fn.receiver) + '.' : '') + fn.name + '(' + fn.params.map(function (param) {
            return Kt.typeString(param.type);
        }).join(',') + ')';
    };

    Session.prototype.userFunctionName = function (fn) {
        var signature = Kt.userSignature(fn);
        if (this.userNames[signature] !== undefined)
            return this.userNames[signature];
        var name = T.jsName(fn.name) + '$' + (fn.params.length + (fn.receiver !== null ? 1 : 0)) + '$' + (++this.functionCounter);
        this.userNames[signature] = name;
        return name;
    };

    Session.prototype.enterUnit = function (checker, unit, file) {
        var self = this;
        var pending = this.pending;
        unit.items.forEach(function (item) {
            switch (item.k) {
            case 'class': {
                if (pending.classes[item.name] !== undefined)
                    checker.error(item, 'conflicting declarations: class ' + item.name + '.');
                var sym = checker.enterClass(item, null, file, '', false);
                sym.checker = checker;
                pending.classes[item.name] = sym;
                break;
            }
            case 'typealias':
                pending.aliases[item.name] = self.aliasSymbol(item, file, checker);
                break;
            }
        });
        unit.items.forEach(function (item) {
            switch (item.k) {
            case 'fun': {
                var fn = checker.functionSymbol(item, null, file);
                fn.pkg = '';
                fn.checker = checker;
                (pending.funs[fn.name] = pending.funs[fn.name] || []).forEach(function (other) {
                    if (Kt.userSignature(other) === Kt.userSignature(fn))
                        checker.error(item, 'conflicting overloads: ' + checker.signatureText(fn) + '.');
                });
                pending.funs[fn.name].push(fn);
                item.sym = fn;
                break;
            }
            case 'property':
                if (item.destructure !== null) {
                    item.destructure.forEach(function (part) {
                        if (part.name === '_')
                            return;
                        var prop = Kt.PropSym(part.name, null, item.mods);
                        prop.node = null;
                        prop.mutable = item.valVar === 'var';
                        prop.type = null;
                        prop.inferType = true;
                        prop.destructured = item;
                        prop.signatureScope = file.child('signature', { prop: prop });
                        self.declareTopProperty(prop, part);
                        part.prop = prop;
                    });
                    break;
                }
                var prop = checker.propertySymbol(item, null, file);
                prop.checker = checker;
                self.declareTopProperty(prop, item);
                item.sym = prop;
                break;
            }
        });
    };

    Session.prototype.declareTopProperty = function (prop, node) {
        var id = ++this.functionCounter;
        prop.pkg = '';
        prop.jsName = 'p$' + T.jsName(prop.name) + '$' + id;
        prop.getterName = 'get$' + T.jsName(prop.name) + '$' + id;
        prop.setterName = prop.mutable ? 'set$' + T.jsName(prop.name) + '$' + id : null;
        this.pending.props[prop.name] = prop;
        void node;
    };

    // The statements of a unit in order; the value statement or null.
    Session.prototype.checkUnit = function (checker, unit, file) {
        var self = this;
        var pending = this.pending;
        Object.keys(pending.classes).forEach(function (name) { pending.classes[name].complete(); });
        Object.keys(pending.funs).forEach(function (name) {
            pending.funs[name].forEach(function (fn) { fn.jsName = self.userFunctionName(fn); });
        });
        Object.keys(pending.classes).forEach(function (name) { checker.checkClassBody(pending.classes[name]); });
        Object.keys(pending.funs).forEach(function (name) {
            pending.funs[name].forEach(function (fn) { checker.checkFunctionBody(fn); });
        });
        var runScope = file.child('function', { fn: null, run: true });
        checker.facts = new Map();
        var run = checker.pushFunction({ kind: 'run', sym: null, returns: null, label: null, node: unit, returnTypes: [], scope: runScope });
        unit.runContext = run;
        unit.items.forEach(function (item) {
            switch (item.k) {
            case 'class':
            case 'fun':
            case 'typealias':
                return;
            case 'property':
                if (item.destructure !== null) {
                    self.checkTopDestructuring(checker, item, runScope);
                    return;
                }
                checker.checkProperty(item.sym);
                return;
            }
            checker.statement(item, runScope);
        });
        checker.popFunction();
        var last = unit.items.length > 0 ? unit.items[unit.items.length - 1] : null;
        if (last !== null && checker.isExpression(last) && last.type !== undefined && !Kt.isClass(last.type, 'Unit') &&
            Kt.resolved(last.type).kind !== 'nothing' && !last.jumps)
            return last;
        return null;
    };

    Session.prototype.checkTopDestructuring = function (checker, item, scope) {
        var type = checker.expr(item.init, null, scope);
        item.components = item.destructure.map(function (part, index) {
            if (part.name === '_')
                return { call: null, prop: null };
            var holder = { k: 'componentCall', line: part.line, column: part.column };
            var result = checker.operatorCall(holder, 'component' + (index + 1), item.init, type, [], scope, null);
            var componentType = result.type;
            if (part.type !== null)
                componentType = checker.resolveType(part.type, scope);
            part.prop.type = componentType;
            return { call: result, prop: part.prop };
        });
    };

    // main() or main(args) declared in the unit.
    Session.prototype.mainFunction = function (unit) {
        for (var index = 0; index < unit.items.length; ++index) {
            var item = unit.items[index];
            if (item.k === 'fun' && item.name === 'main' && item.receiver === null && item.sym !== undefined) {
                var fn = item.sym;
                if (fn.params.length === 0)
                    return fn;
                if (fn.params.length === 1 && Kt.isClass(fn.params[0].type, 'Array'))
                    return fn;
            }
        }
        return null;
    };

    // The code of a unit: classes, functions, properties; the run function.
    Session.prototype.unitCode = function (unit, valueItem) {
        var self = this;
        var pending = this.pending;
        var generator = new Kt.Generator(this, '');
        var classes = [];
        Object.keys(pending.classes).forEach(function (name) { generator.collectClasses(pending.classes[name], classes); });
        var body = this.classesCode(generator, classes);
        classes.forEach(function (sym) {
            if (sym.kind === 'enum')
                body.push(J.expr(J.call(J.mem(J.id('$j'), 'initClass'), [J.mem(J.id('$K'), sym.jsId)])));
        });
        var holder = J.mem(J.id('$K'), '$kts');
        Object.keys(pending.funs).forEach(function (name) {
            pending.funs[name].forEach(function (fn) {
                body.push(J.at(J.expr(J.assign(J.mem(holder, fn.jsName), generator.functionCode(fn, null))), fn.node.line));
            });
        });
        Object.keys(pending.props).forEach(function (name) {
            var prop = pending.props[name];
            body.push(J.expr(J.assign(J.mem(holder, prop.jsName), generator.defaultValue(prop.type))));
            self.topAccessors(generator, prop, holder).forEach(function (statement) { body.push(statement); });
        });
        var main = this.mainFunction(unit);
        var waits = !!unit.runContext.waits || (main !== null && !!main.waits);
        var fn = generator.pushFunction('function', { checkerContext: unit.runContext, generator: waits, fiber: waits, run: true });
        var statements = [];
        unit.items.forEach(function (item) {
            switch (item.k) {
            case 'class':
            case 'fun':
            case 'typealias':
                return;
            case 'property':
                statements = statements.concat(self.topPropertyInit(generator, item, holder));
                return;
            }
            if (item === valueItem) {
                var value = generator.capture(function () { return generator.expression(item); });
                statements = statements.concat(value.pre);
                var kind = Kt.isPrimitive(item.type) ? Kt.primKind(item.type) : 'ref';
                statements.push(J.at(J.expr(J.assign(J.id('$value'), J.call(J.mem(J.id('$kt'), 'show'), [value.js, J.str(kind)]))), item.line));
                return;
            }
            statements = statements.concat(generator.statement(item));
        });
        if (main !== null) {
            var args = main.params.length === 1 ? [J.call(J.mem(J.id('$j'), 'arrayOf'), [J.str('[Ljava.lang.String;'), J.arr([])])] : [];
            var mainCall = main.waits ? generator.fiberCall(holder, main.jsName, args) : J.call(J.mem(holder, main.jsName), args);
            statements.push(J.expr(main.suspend ? J.call(J.mem(J.id('$kt'), 'runSuspendMain'), [mainCall]) : mainCall));
        }
        if (valueItem !== null) {
            statements.unshift(J.let_('$value', J.undef()));
            statements.push(J.ret(J.id('$value')));
        }
        generator.popFunction();
        var block = generator.functionCode(null, null, fn, [], statements);
        block.name = '$block';
        body.push(J.ret(block));
        return { body: body, constants: generator.constants, generator: generator };
    };

    // The initialization of a top-level property in the order of the statements.
    Session.prototype.topPropertyInit = function (generator, item, holder) {
        if (item.destructure !== null) {
            var temp = generator.temp();
            var out = generator.withPre(function () { return generator.expression(item.init); }, function (value) {
                return J.expr(J.assign(temp, value));
            });
            item.components.forEach(function (component) {
                if (component.call === null)
                    return;
                var value = generator.componentValue(component.call, temp, item.init.type, component.prop.type);
                out.push(J.expr(J.assign(J.mem(holder, component.prop.jsName), value)));
            });
            return out;
        }
        var prop = item.sym;
        if (item.init !== null && !prop.isConst && !prop.customGetter) {
            var statements = generator.capture(function () {
                return J.assign(J.mem(holder, prop.jsName), generator.valueAs(item.init, prop.type));
            });
            return statements.pre.concat([J.at(J.expr(statements.js), item.line)]);
        }
        if (item.delegate !== null) {
            return generator.withPre(function () { return generator.expression(item.delegate); }, function (value) {
                return J.at(J.expr(J.assign(J.mem(holder, prop.jsName + '$delegate'), value)), item.line);
            });
        }
        return [];
    };

    Session.prototype.topAccessors = function (generator, prop, holder) {
        var out = [];
        var node = prop.node;
        if (node === null)
            return out;
        if (prop.customGetter && node.getter !== null && node.getter.body !== null)
            out.push(J.expr(J.assign(J.mem(holder, prop.getterName), generator.accessorFunction(null, prop, node.getter))));
        else if (prop.delegated)
            out.push(J.expr(J.assign(J.mem(holder, prop.getterName), generator.delegateGetter(null, prop))));
        if (prop.mutable && node.setter !== null && node.setter.body !== null)
            out.push(J.expr(J.assign(J.mem(holder, prop.setterName), generator.accessorFunction(null, prop, node.setter))));
        else if (prop.mutable && prop.delegated)
            out.push(J.expr(J.assign(J.mem(holder, prop.setterName), generator.delegateSetter(null, prop))));
        if (prop.customSetter)
            prop.hasCustomSetter = true;
        return out;
    };

    // Fibers (as in Java): a function waits if it calls a native that waits
    // (Thread.sleep, join...) or a function that waits; a call on an object
    // - if an override with the same name waits somewhere (asyncNames,
    // shared with the Java library); a call of a function value - if a
    // lambda waits somewhere ($invoke). A fixed point over the functions.
    Session.prototype.markWaiting = function (functions) {
        var names = this.asyncNames;
        var changed = true;
        while (changed) {
            changed = false;
            functions.forEach(function (context) {
                if (context.waits || (context.sym !== null && context.sym !== undefined && context.sym.isCtor) ||
                    !context.calls.some(function (call) { return Kt.mayWait(call.fn, names); }))
                    return;
                context.waits = true;
                changed = true;
                var sym = context.sym;
                if (sym !== null && sym !== undefined) {
                    sym.waits = true;
                    if (sym.owner !== null && sym.owner !== undefined && !sym.isStatic && sym.jsName !== null)
                        names[sym.jsName] = true;
                }
                if (context.kind === 'lambda' || (context.kind === 'function' && sym === null)) {
                    names.$invoke = true;
                    var sam = context.node.samConversion;
                    if (sam !== undefined && sam !== null)
                        names[sam.fn.jsName] = true;
                }
            });
        }
    };

    Kt.mayWait = function (fn, names) {
        if (fn.waits || (fn.java !== null && fn.java !== undefined && fn.java.async))
            return true;
        if (fn.intrinsic === 'invoke')
            return names.$invoke === true;
        // A library function not translated yet that calls a lambda (repeat, forEach).
        if (names.$invoke === true && fn.library && fn.java === null && fn.compiled === undefined &&
            fn.params.some(function (param) { return Kt.resolved(param.type).kind === 'fun'; }))
            return true;
        return !fn.isStatic && fn.owner !== null && fn.owner !== undefined && fn.jsName !== null && names[fn.jsName] === true;
    };

    // A successful unit: its declarations replace the old ones.
    Session.prototype.commit = function () {
        var self = this;
        var pending = this.pending;
        Object.keys(pending.classes).forEach(function (name) { self.user.classes[name] = pending.classes[name]; });
        Object.keys(pending.aliases).forEach(function (name) { self.user.aliases[name] = pending.aliases[name]; });
        Object.keys(pending.props).forEach(function (name) { self.user.props[name] = pending.props[name]; });
        Object.keys(pending.funs).forEach(function (name) {
            var list = self.user.funs[name] || [];
            pending.funs[name].forEach(function (fn) {
                var signature = Kt.userSignature(fn);
                list = list.filter(function (other) { return Kt.userSignature(other) !== signature; });
                list.push(fn);
            });
            self.user.funs[name] = list;
        });
    };

    Session.prototype.runBlock = function (code) {
        var env = this.env;
        env.scheduler.reset();
        this.activate();
        this.runtime.resetThreads();
        this.refreshModules();
        var unit = Kt.parse(code, '');
        var checker = new Kt.Checker(this, '');
        var file = checker.fileScope('', unit.imports, false);
        this.pending = { classes: Object.create(null), funs: Object.create(null), props: Object.create(null),
                         aliases: Object.create(null) };
        var compiled;
        try {
            this.enterUnit(checker, unit, file);
            var valueItem = this.checkUnit(checker, unit, file);
            this.markWaiting(checker.functions);
            compiled = this.unitCode(unit, valueItem);
            this.commit();
        } finally {
            this.pending = null;
        }
        var run = this.compile(compiled.body, compiled.generator, '');
        try {
            var result = run();
            if (T.isGenerator(result) || this.runtime.hasPendingThreads())
                return this.runAsync(result);
            return result;
        } catch (error) {
            if (error instanceof Java.SystemExit && error.status === 0)
                return undefined;
            throw error;
        }
    };

    Session.prototype.runAsync = function (block) {
        var self = this;
        var env = this.env;
        var runtime = this.runtime;
        var value;
        var main = function* () {
            var result = T.isGenerator(block) ? yield* block : block;
            yield* runtime.awaitThreads();
            return result;
        };
        var state = env.scheduler.runMain(main(), function (callback, delay) {
            return env.schedule(function () {
                self.activate();
                try {
                    callback();
                } finally {
                    env.out.flush();
                    env.err.flush();
                }
            }, delay);
        }, function (error, result) {
            if (error !== null && error !== undefined) {
                if (!(error instanceof Java.SystemExit && error.status === 0))
                    env.reportLate(error);
                return;
            }
            value = result;
        });
        return state === 'done' ? value : undefined;
    };

    // --- Host files: a class or object Name from the file Name.kt

    Session.prototype.refreshModules = function () {
        var self = this;
        this.missingModules = Object.create(null);
        Object.keys(this.modules).forEach(function (name) {
            var module = self.modules[name];
            if (self.env.readModule(module.file) !== module.text)
                delete self.modules[name];
        });
    };

    Session.prototype.moduleClass = function (name) {
        var module = this.modules[name];
        if (module === undefined) {
            if (this.missingModules[name] || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || this.loadingModule === name)
                return null;
            var file = name + '.kt';
            var text = this.env.readModule(file);
            if (text === null || text === undefined) {
                this.missingModules[name] = true;
                return null;
            }
            module = this.loadModule(name, file, text);
        }
        return module.classes[name] || null;
    };

    Session.prototype.loadModule = function (name, file, text) {
        var self = this;
        var savedPending = this.pending;
        this.loadingModule = name;
        var unit = Kt.parse(text, file);
        var checker = new Kt.Checker(this, file);
        var scope = checker.fileScope('', unit.imports, false);
        var module = { file: file, text: text, classes: Object.create(null) };
        try {
            unit.items.forEach(function (item) {
                if (item.k !== 'class')
                    checker.error(item, 'expecting a class or an object declaration.');
                var sym = checker.enterClass(item, null, scope, '', false);
                sym.checker = checker;
                module.classes[item.name] = sym;
            });
            Object.keys(module.classes).forEach(function (className) { self.modules[className] = module; });
            this.loadingModule = null;
            var syms = Object.keys(module.classes).map(function (className) { return module.classes[className]; });
            syms.forEach(function (sym) { sym.complete(); });
            syms.forEach(function (sym) { checker.checkClassBody(sym); });
            this.markWaiting(checker.functions);
            var generator = new Kt.Generator(this, file);
            var classes = [];
            syms.forEach(function (sym) { generator.collectClasses(sym, classes); });
            var body = this.classesCode(generator, classes);
            this.compile(body, generator, file);
        } catch (error) {
            Object.keys(module.classes).forEach(function (className) { delete self.modules[className]; });
            throw error;
        } finally {
            this.loadingModule = null;
            this.pending = savedPending;
        }
        return module;
    };

    // --- Errors

    Session.prototype.describeError = function (error, bare) {
        if (error instanceof Java.SystemExit)
            return error.message;
        if (error instanceof this.ktRuntime.Jump)
            return 'Internal error: a jump out of its function';
        var converted = this.runtime.caught(error);
        if (this.runtime.isThrowable(converted))
            return (bare ? '' : 'Exception in thread "main" ') + this.runtime.str(converted);
        if (converted !== null && typeof converted === 'object' && converted.message !== undefined)
            return String(converted.message);
        return String(converted);
    };

    Session.prototype.deadlock = function () {
        return new T.LanguageError('deadlock: all threads are waiting', null);
    };

    Kt.language = {
        id: 'kotlin',
        name: 'Kotlin',
        createSession: function (env) {
            return new Session(env);
        }
    };
    T.languages.kotlin = Kt.language;
})(globalThis);
