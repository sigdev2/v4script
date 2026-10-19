// Java: the language session - a unit as a jshell snippet (classes,
// methods, top-level variables and statements), the shared scope of the
// units, the library on demand, the run of a unit.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Java = T.java;
    if (Java.language)
        return;

    var J = T.J;
    var CHUNK_PARAMS = ['$j', '$T', '$D', '$K'];

    // java.lang classes the run time needs in any program.
    var CORE_CLASSES = ['java.lang.Object', 'java.lang.String', 'java.lang.Integer', 'java.lang.Boolean', 'java.lang.Long',
                        'java.lang.Double', 'java.lang.Float', 'java.lang.Short', 'java.lang.Byte', 'java.lang.Character',
                        'java.lang.Class', 'java.lang.Enum', 'java.lang.Record', 'java.lang.System', 'java.lang.Throwable',
                        'java.lang.NullPointerException', 'java.lang.ArithmeticException',
                        'java.lang.ArrayIndexOutOfBoundsException', 'java.lang.ClassCastException'];

    function Session(env) {
        this.env = env;
        this.runtime = new Java.Runtime(this);
        Java.rt = this.runtime;
        // Host modules are library classes; global ones are imported
        // statically into every unit, and their package needs no import.
        this.hostImports = [];
        var hostSelf = this;
        env.modules.forEach(function (module) {
            var qname = Java.hostLibrary(module);
            if (module.global) {
                hostSelf.hostImports.push(qname);
                if (Java.AUTO_PACKAGES.indexOf(module.name) < 0)
                    Java.AUTO_PACKAGES.push(module.name);
            }
        });
        this.symtab = new Java.Symtab(this);
        this.userClasses = Object.create(null);
        // The names of methods that have an override that is a fiber.
        this.asyncNames = Object.create(null);
        // Classes from host files: class name -> { file, text, classes }.
        this.modules = Object.create(null);
        this.missingModules = Object.create(null);
        this.pending = null;
        var self = this;
        CORE_CLASSES.forEach(function (name) { self.symtab.classNamed(name); });
        this.compileLibrary();
        this.sessionClass = this.createSessionClass();
    }

    // The class that holds the top-level variables and methods of the units.
    Session.prototype.createSessionClass = function () {
        var sym = new Java.ClassSymbol('$main', '$main', 'class');
        sym.jsId = '$session';
        sym.state = 'complete';
        sym.superclass = Java.objectType();
        sym.thisType = Java.classType(sym, []);
        sym.mods = { final: true };
        sym.isSession = true;
        this.runtime.defineClass(this.runtime.K, '$session', null, [], { name: '$main', simpleName: '$main', flavor: 'class' });
        return sym;
    };
    // --- Top-level names (for checking)

    Session.prototype.userClass = function (name) {
        if (this.pending !== null && this.pending.classes[name] !== undefined)
            return this.pending.classes[name];
        return this.userClasses[name] || null;
    };

    Session.prototype.userVariable = function (name) {
        if (this.pending !== null && this.pending.fields[name] !== undefined)
            return this.pending.fields[name];
        return this.sessionClass.fields[name] || null;
    };

    // Top-level methods: the new ones of a unit replace the old ones with the same signature.
    Session.prototype.userMethods = function (name) {
        var result = [];
        var signatures = [];
        var add = function (method) {
            var signature = Java.erasedParams(method, null);
            if (signatures.indexOf(signature) >= 0)
                return;
            signatures.push(signature);
            result.push({ method: method, map: null, type: null });
        };
        if (this.pending !== null)
            (this.pending.methods[name] || []).forEach(add);
        (this.sessionClass.methods[name] || []).forEach(add);
        return result;
    };

    // The JavaScript name of a top-level method: name$count[$types].
    Session.prototype.methodJsName = function (method) {
        var base = T.jsName(method.name) + '$' + method.params.length;
        var others = (this.sessionClass.methods[method.name] || []).concat(this.pending.methods[method.name] || []);
        var signature = Java.erasedParams(method, null);
        var clash = others.some(function (other) {
            return other !== method && other.params.length === method.params.length && Java.erasedParams(other, null) !== signature;
        });
        if (!clash)
            return base;
        return base + '$' + method.params.map(function (param) {
            return Java.typeString(Java.erasure(param)).replace(/\[\]/g, 'Arr').replace(/[^A-Za-z0-9_]/g, '_');
        }).join('$');
    };
    // --- The library

    // Class definitions (supertypes first), then finishClass and $clinit.
    Session.prototype.classesCode = function (generator, classes) {
        var body = [];
        var ordered = generator.orderClasses(classes);
        ordered.forEach(function (sym) {
            body = body.concat(generator.classDefinition(sym, '$c' + sym.jsId.replace(/[^A-Za-z0-9_]/g, '_')));
        });
        ordered.forEach(function (sym) {
            body.push(J.expr(J.call(J.mem(J.id('$j'), 'finishClass'), [J.mem(J.id('$K'), sym.jsId)])));
        });
        classes.forEach(function (sym) {
            body.push(J.expr(J.call(J.mem(J.id('$j'), 'initClass'), [J.mem(J.id('$K'), sym.jsId)])));
        });
        return body;
    };

    // Library compilation units parsed since the last time: their classes
    // are lazy properties of $K for now. The bodies are checked and
    // translated when a class of the unit is first used at run time: a
    // program of a couple of lines does not need the whole library that the
    // signatures of String refer to.
    Session.prototype.compileLibrary = function () {
        var self = this;
        var symtab = this.symtab;
        var units = symtab.pendingUnits;
        symtab.pendingUnits = [];
        units.forEach(function (record) {
            var load = function () { self.compileUnit(record); };
            (function register(list) {
                list.forEach(function (sym) {
                    self.runtime.lazyClass(sym.jsId, sym.binaryName || sym.qname, load);
                    register(Object.keys(sym.memberTypes).map(function (name) { return sym.memberTypes[name]; }));
                });
            })(record.classes);
        });
    };

    // Translation of a library compilation unit: one chunk for all its
    // classes (their static fields refer to each other).
    Session.prototype.compileUnit = function (record) {
        if (record.compiled)
            return;
        record.compiled = true;
        var saved = Java.symtab;
        Java.symtab = this.symtab;
        try {
            (function lazy(list) {
                list.forEach(function (sym) {
                    sym.lazyMethods = true;
                    lazy(Object.keys(sym.memberTypes).map(function (name) { return sym.memberTypes[name]; }));
                });
            })(record.classes);
            record.classes.forEach(function (sym) { record.checker.checkClassBody(sym); });
            var generator = new Java.Generator(this, T.LIBRARY_SOURCE);
            var classes = [];
            record.classes.forEach(function (sym) { generator.collectClasses(sym, classes); });
            var body = this.classesCode(generator, classes);
            // Checking the bodies may have pulled in new compilation units.
            this.compileLibrary();
            this.env.compileChunk(body, CHUNK_PARAMS, [this.runtime, T, generator.constants, this.runtime.K], '', { library: true });
        } catch (error) {
            // An error in the library sources - with the name of the compilation unit.
            if (error instanceof T.CompileError && error.source === T.LIBRARY_SOURCE && error.message.indexOf('[') !== 0)
                error.message = '[' + record.id + '] ' + error.message;
            throw error;
        } finally {
            Java.symtab = saved;
        }
    };

    // A library method at its first call: the body is checked, translated,
    // gets its own code chunk; the function replaces the stub in holder.
    Session.prototype.compileLazyMethod = function (sym, method, holder) {
        if (method.compiled !== undefined) {
            holder[method.jsName] = method.compiled;
            return method.compiled;
        }
        var saved = Java.symtab;
        Java.symtab = this.symtab;
        try {
            method.lazy = false;
            sym.checker.checkMethodBody(method);
            var generator = new Java.Generator(this, T.LIBRARY_SOURCE);
            var code = generator.methodCode(method, sym);
            this.compileLibrary();
            var fn = this.env.compileChunk([J.ret(code)], CHUNK_PARAMS, [this.runtime, T, generator.constants, this.runtime.K], '',
                                           { library: true });
            method.compiled = fn;
            holder[method.jsName] = fn;
            return fn;
        } catch (error) {
            if (error instanceof T.CompileError && error.source === T.LIBRARY_SOURCE && error.message.indexOf('[') !== 0)
                error.message = '[' + sym.qname + '.' + method.name + '] ' + error.message;
            throw error;
        } finally {
            Java.symtab = saved;
        }
    };

    // A library class by its full name for the run time.
    Session.prototype.loadLibraryClass = function (qname) {
        if (this.symtab.lookupQualified(qname) !== null)
            this.compileLibrary();
    };

    // All library compilation units at once - for checking the library in tests.
    Session.prototype.compileWholeLibrary = function () {
        var self = this;
        Object.keys(Java.library.index).forEach(function (qname) { self.symtab.lookupQualified(qname); });
        this.compileLibrary();
        // Translating a compilation unit or a method may pull in new
        // compilation units - they are at the end of the list.
        var methods = 0;
        for (var index = 0; index < this.symtab.units.length; ++index) {
            var record = this.symtab.units[index];
            this.compileUnit(record);
            (function each(list) {
                list.forEach(function (sym) {
                    Object.keys(sym.methods).forEach(function (name) {
                        sym.methods[name].forEach(function (method) {
                            if (method.lazy) {
                                self.compileLazyMethod(sym, method, {});
                                ++methods;
                            }
                        });
                    });
                    each(Object.keys(sym.memberTypes).map(function (name) { return sym.memberTypes[name]; }));
                });
            })(record.classes);
        }
        return this.symtab.units.length + ' units, ' + methods + ' methods';
    };
    // --- The unit

    // The declarations of a unit: classes, top-level methods and variables
    // go into the pending layer (into the shared scope after the check
    // succeeds).
    Session.prototype.enterBlock = function (checker, unit, top) {
        var self = this;
        var pending = this.pending;
        unit.items.forEach(function (item) {
            if (item.k === 'class') {
                if (pending.classes[item.name] !== undefined)
                    checker.error(item, 'duplicate class: ' + item.name);
                pending.classes[item.name] = checker.enterClass(item, null, top, '', false);
            }
        });
        var sessionSym = this.sessionClass;
        sessionSym.classEnv = top.child('class', { cls: sessionSym });
        unit.items.forEach(function (item) {
            if (item.k === 'method') {
                item.mods.static = true;
                var method = checker.methodSymbol(item, sessionSym, false);
                (pending.methods[method.name] = pending.methods[method.name] || []).forEach(function (other) {
                    if (Java.erasedParams(other, null) === Java.erasedParams(method, null))
                        checker.error(item, 'method ' + checker.methodText(method) + ' is already defined in this block');
                });
                pending.methods[method.name].push(method);
                item.sym = method;
            } else if (item.k === 'local') {
                item.vars.forEach(function (variable) {
                    var type = checker.resolveType(variable.type, top, true);
                    variable.sessionField = { name: variable.name, declared: type, node: variable, mods: item.mods };
                    if (type !== null)
                        self.declareSessionField(variable, type, item.mods);
                });
            }
        });
    };

    Session.prototype.declareSessionField = function (variable, type, mods) {
        var field = Java.FieldSymbol(variable.name, type, this.sessionClass, { static: true, final: !!mods.final });
        field.jsName = 's$' + T.propertyName(variable.name);
        field.node = null;
        this.pending.fields[variable.name] = field;
        variable.field = field;
        return field;
    };
    // The method whose body checks the top-level statements.
    Session.prototype.runMethod = function () {
        return { kind: 'method', name: '<run>', owner: this.sessionClass, isStatic: true, isInit: false, params: [], paramNames: [],
                 returns: Java.types.void, topLevel: true };
    };

    Session.prototype.checkBlock = function (checker, unit, top) {
        var self = this;
        var pending = this.pending;
        Object.keys(pending.classes).forEach(function (name) {
            pending.classes[name].complete();
        });
        Object.keys(pending.methods).forEach(function (name) {
            pending.methods[name].forEach(function (method) { method.jsName = self.methodJsName(method); });
        });
        Object.keys(pending.classes).forEach(function (name) {
            checker.checkClassBody(pending.classes[name]);
        });
        Object.keys(pending.methods).forEach(function (name) {
            pending.methods[name].forEach(function (method) { checker.checkMethodBody(method); });
        });
        var run = this.runMethod();
        var runEnv = this.sessionClass.classEnv.child('method', { method: run, isStatic: true, topLevel: true }).child('block');
        checker.captures = [];
        var runInfo = { run: true };
        checker.enterFunction(runInfo);
        unit.items.forEach(function (item, index) {
            if (item.k === 'class' || item.k === 'method')
                return;
            if (item.k === 'local') {
                self.checkTopVariables(checker, item, runEnv);
                return;
            }
            if (item.k === 'expr')
                item.valueAllowed = true;
            checker.statement(item, runEnv);
        });
        checker.leaveFunction();
        checker.checkCaptures();
        var main = this.mainMethod(unit);
        if (main !== null)
            runInfo.calls.push({ method: main, virtual: false });
        this.markAsync(checker.functions);
        unit.runAsync = runInfo.async;
        var last = unit.items.length > 0 ? unit.items[unit.items.length - 1] : null;
        return last !== null && last.k === 'expr' && Java.resolved(last.expr.type).kind !== 'void' ? last : null;
    };

    Session.prototype.checkTopVariables = function (checker, item, env) {
        var self = this;
        item.vars.forEach(function (variable) {
            var info = variable.sessionField;
            if (info.declared === null) {
                if (variable.init === null)
                    checker.error(variable, 'cannot infer type for local variable ' + variable.name + " (cannot use 'var' on variable without initializer)");
                checker.expr(variable.init, env);
                var type = Java.finalType(variable.init.type);
                if (type.kind === 'null' || type.kind === 'void')
                    checker.error(variable, 'cannot infer type for local variable ' + variable.name);
                self.declareSessionField(variable, type, item.mods);
            } else if (variable.init !== null) {
                checker.exprAs(variable.init, env, info.declared);
            }
        });
    };
    // The code of a unit: classes, top-level methods and fields, the function $block.
    Session.prototype.blockCode = function (unit, valueStatement) {
        var self = this;
        var pending = this.pending;
        var generator = new Java.Generator(this, '');
        var classes = [];
        Object.keys(pending.classes).forEach(function (name) { generator.collectClasses(pending.classes[name], classes); });
        var body = this.classesCode(generator, classes);
        var session = J.mem(J.id('$K'), '$session');
        Object.keys(pending.methods).forEach(function (name) {
            pending.methods[name].forEach(function (method) {
                body.push(J.at(J.expr(J.assign(J.mem(session, method.jsName), generator.methodCode(method, self.sessionClass))), method.node.line));
            });
        });
        Object.keys(pending.fields).forEach(function (name) {
            var field = pending.fields[name];
            body.push(J.expr(J.assign(J.mem(session, field.jsName), generator.defaultValue(field.type))));
        });
        var fn = generator.pushFunction(this.sessionClass, 'method', null);
        fn.method = this.runMethod();
        fn.async = !!unit.runAsync;
        generator.valueStatement = valueStatement;
        var statements = [];
        unit.items.forEach(function (item) {
            if (item.k === 'class' || item.k === 'method')
                return;
            if (item.k === 'local') {
                item.vars.forEach(function (variable) {
                    if (variable.init === null)
                        return;
                    var value = generator.valueAs(variable.init, variable.field.type);
                    statements.push(J.at(J.expr(J.assign(J.mem(session, variable.field.jsName), value)), variable.line));
                });
                return;
            }
            statements = statements.concat(generator.statement(item));
        });
        var main = this.mainMethod(unit);
        if (main !== null) {
            var noArgs = J.call(generator.rt('arrayOf'), [J.str('[Ljava.lang.String;'), J.arr([])]);
            var mainCall = fn.async ? J.yield_(J.call(generator.rt('fiberCall'), [generator.classRef(main.owner), J.str(main.jsName), J.arr([noArgs])]), true)
                                    : J.call(J.mem(generator.classRef(main.owner), main.jsName), [noArgs]);
            statements.push(J.expr(mainCall));
        }
        if (valueStatement !== null)
            statements.unshift(J.let_('$value', J.undef()));
        if (valueStatement !== null)
            statements.push(J.ret(J.id('$value')));
        var block = generator.functionCode(fn, [], statements);
        block.name = '$block';
        body.push(J.ret(block));
        return { body: body, constants: generator.constants };
    };
    // main(String[]) of the first class of the unit that has it: a whole
    // program pasted into a unit runs as java Main.java does.
    Session.prototype.mainMethod = function (unit) {
        for (var index = 0; index < unit.items.length; ++index) {
            var item = unit.items[index];
            if (item.k !== 'class' || !item.sym)
                continue;
            var found = (item.sym.methods.main || []).filter(function (method) {
                if (!method.isStatic || method.params.length !== 1)
                    return false;
                var param = Java.resolved(method.params[0]);
                return param.kind === 'array' && Java.typeString(param.elem) === 'String';
            });
            if (found.length > 0)
                return found[0];
        }
        return null;
    };

    // Fibers: a function waits (a generator) if it calls a fiber - the
    // native sleep, join, wait or a function that waits; a call on an object
    // - if an override with the same name waits somewhere (asyncNames,
    // shared by the units). A fixed point over the functions of the unit.
    // Constructors do not wait.
    Session.prototype.markAsync = function (functions) {
        var names = this.asyncNames;
        function asyncCall(call) {
            return !!call.method.async || (call.virtual && !call.method.isStatic && names[call.method.jsName] === true);
        }
        var changed = true;
        while (changed) {
            changed = false;
            (functions || []).forEach(function (info) {
                if (info.async || (info.method && info.method.isCtor) || !info.calls.some(asyncCall))
                    return;
                info.async = true;
                changed = true;
                if (info.method) {
                    info.method.async = true;
                    if (!info.method.isStatic)
                        names[info.method.jsName] = true;
                } else if (info.lambda) {
                    info.lambda.async = true;
                    names[info.functional.method.jsName] = true;
                }
            });
        }
    };

    // A successful unit: its declarations go into the shared scope.
    Session.prototype.commit = function () {
        var self = this;
        var pending = this.pending;
        var sessionSym = this.sessionClass;
        Object.keys(pending.classes).forEach(function (name) { self.userClasses[name] = pending.classes[name]; });
        Object.keys(pending.fields).forEach(function (name) { sessionSym.fields[name] = pending.fields[name]; });
        Object.keys(pending.methods).forEach(function (name) {
            var list = sessionSym.methods[name] || [];
            pending.methods[name].forEach(function (method) {
                var signature = Java.erasedParams(method, null);
                list = list.filter(function (other) { return Java.erasedParams(other, null) !== signature; });
                list.push(method);
            });
            sessionSym.methods[name] = list;
        });
    };

    Session.prototype.runBlock = function (code) {
        var env = this.env;
        env.scheduler.reset();
        Java.symtab = this.symtab;
        Java.rt = this.runtime;
        this.runtime.resetThreads();
        this.refreshModules();
        var unit = Java.parse(code, '');
        var checker = new Java.Checker(this, '');
        this.pending = { classes: Object.create(null), fields: Object.create(null), methods: Object.create(null) };
        var compiled;
        try {
            var top = checker.topEnv('', unit.imports);
            this.enterBlock(checker, unit, top);
            var valueStatement = this.checkBlock(checker, unit, top);
            this.compileLibrary();
            compiled = this.blockCode(unit, valueStatement);
            this.commit();
        } finally {
            this.pending = null;
        }
        var run = env.compileChunk(compiled.body, CHUNK_PARAMS, [this.runtime, T, compiled.constants, this.runtime.K], '');
        try {
            var result = run();
            // A fiber unit or started threads: to the end or until all of
            // them wait for time; then by the timers of the unit.
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
                Java.rt = runtime;
                Java.symtab = self.symtab;
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

    // --- Host files: the class Name comes from the host file Name.java

    // A replaced file is loaded again; missing ones are looked up again.
    Session.prototype.refreshModules = function () {
        var self = this;
        this.missingModules = Object.create(null);
        Object.keys(this.modules).forEach(function (name) {
            var module = self.modules[name];
            if (self.env.readModule(module.file) !== module.text)
                delete self.modules[name];
        });
    };

    // The top-level class named name from the host file name.java or null.
    // The file is parsed, checked and run (defines the classes) at the
    // first use of the name.
    Session.prototype.moduleClass = function (name) {
        var module = this.modules[name];
        if (module === undefined) {
            if (this.missingModules[name] || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name))
                return null;
            var file = name + '.java';
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
        var unit = Java.parse(text, file);
        var checker = new Java.Checker(this, file);
        var top = checker.topEnv('', unit.imports);
        top.module = true;
        var module = { file: file, text: text, classes: Object.create(null) };
        unit.items.forEach(function (item) {
            if (item.k !== 'class')
                checker.error(item, 'class, interface, enum, or record expected');
            module.classes[item.name] = checker.enterClass(item, null, top, '', false);
        });
        // Names before the check: the classes of a file refer to each other.
        Object.keys(module.classes).forEach(function (className) { self.modules[className] = module; });
        try {
            var syms = Object.keys(module.classes).map(function (className) { return module.classes[className]; });
            syms.forEach(function (sym) { sym.complete(); });
            syms.forEach(function (sym) { checker.checkClassBody(sym); });
            this.markAsync(checker.functions);
            var generator = new Java.Generator(this, file);
            var classes = [];
            syms.forEach(function (sym) { generator.collectClasses(sym, classes); });
            var body = this.classesCode(generator, classes);
            this.compileLibrary();
            this.env.compileChunk(body, CHUNK_PARAMS, [this.runtime, T, generator.constants, this.runtime.K], file);
        } catch (error) {
            Object.keys(module.classes).forEach(function (className) { delete self.modules[className]; });
            throw error;
        }
        return module;
    };

    // bare - without "Exception in thread "main"" (a thread prints its own name).
    Session.prototype.describeError = function (error, bare) {
        if (error instanceof Java.SystemExit)
            return error.message;
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

    Java.language = {
        id: 'java',
        name: 'Java',
        createSession: function (env) {
            return new Session(env);
        }
    };
    T.languages.java = Java.language;
})(globalThis);
