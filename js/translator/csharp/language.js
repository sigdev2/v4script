// C#: the language session - a unit as a C# script (types, top-level
// variables and functions shared by the units, statements), the library
// on demand, types from host files, the run of a unit and its value.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    if (CS.language)
        return;

    var J = T.J;
    var CHUNK_PARAMS = ['$cs', '$T', '$D', '$K'];

    // Types the run time needs in any program.
    var CORE_TYPES = ['System.Object', 'System.ValueType', 'System.Enum', 'System.String', 'System.Int32', 'System.Boolean',
                      'System.Char', 'System.Double', 'System.Int64', 'System.Exception', 'System.Array', 'System.Delegate',
                      'System.Nullable`1', 'System.Type'];

    var INSTALLED_TYPES = ['System.String', 'System.Int32', 'System.Boolean', 'System.Array', 'System.MulticastDelegate'];

    function Session(env) {
        this.env = env;
        this.runtime = new CS.Runtime(this);
        CS.rt = this.runtime;
        this.symtab = new CS.Symtab(this);
        // Host modules are static classes of the library; the global ones
        // are imported with using static into every unit.
        this.hostStatics = [];
        var self = this;
        env.modules.forEach(function (module) {
            var name = CS.hostLibrary(module);
            if (module.global)
                self.hostStatics.push(name);
        });
        // Types from host files: name -> { file, text, types }.
        this.modules = Object.create(null);
        this.missingModules = Object.create(null);
        this.anonymousTypes = Object.create(null);
        this.asyncNames = Object.create(null);
        var symtab = this.symtab;
        CORE_TYPES.forEach(function (name) { symtab.typeNamed(name); });
        Object.keys(CS.SPECIAL_NAMES).forEach(function (keyword) { symtab.special(keyword); });
        this.sessionClass = this.createSessionClass();
        this.compileLibrary();
        // The types whose methods live on the prototypes of JavaScript
        // values: calls on strings, numbers and arrays need them at once.
        var runtime = this.runtime;
        INSTALLED_TYPES.forEach(function (name) { runtime.type(name); });
    }

    // The class of the top-level variables and functions of the units.
    Session.prototype.createSessionClass = function () {
        var sym = new CS.TypeSymbol('<Script>', 'class', this.symtab.global);
        sym.jsId = '$session';
        sym.state = 'complete';
        sym.baseType = CS.objectType();
        sym.mods = { static: true };
        sym.isSession = true;
        sym.usedMethodNames = Object.create(null);
        sym.usedFieldNames = Object.create(null);
        sym.fieldOrder = [];
        sym.interfaceMap = [];
        var checker = new CS.Checker(this, '');
        sym.checker = checker;
        sym.unitScope = checker.namespaceScope(this.symtab.global, [], null, true);
        sym.scope = sym.unitScope.child('type', { sym: sym });
        this.runtime.defineType('$session', { name: '<Script>', kind: 'class', generic: 0 }, null, null, []);
        return sym;
    };

    // --- The library

    // Library units parsed since the last time: their types are lazy
    // properties of $K; a type is translated at its first use at run time.
    Session.prototype.compileLibrary = function () {
        var self = this;
        var units = this.symtab.pendingUnits;
        this.symtab.pendingUnits = [];
        units.forEach(function (record) {
            var load = function () { self.compileUnit(record); };
            (function register(list) {
                list.forEach(function (sym) {
                    self.runtime.lazyType(sym.jsId, CS.runtimeName(sym), load);
                    register(Object.keys(sym.nestedTypes).map(function (key) { return sym.nestedTypes[key]; }));
                });
            })(record.types);
        });
    };

    // A library unit: its types in one chunk; the bodies of methods are
    // translated at their first call.
    Session.prototype.compileUnit = function (record) {
        if (record.compiled)
            return;
        record.compiled = true;
        var saved = CS.symtab;
        CS.symtab = this.symtab;
        try {
            var checker = record.checker;
            record.types.forEach(function (sym) { checker.checkTypeBodies(sym, true); });
            var generator = new CS.Generator(this, T.LIBRARY_SOURCE);
            var types = [];
            record.types.forEach(function (sym) { generator.collectTypes(sym, types); });
            var body = this.typesCode(generator, types);
            this.compileLibrary();
            this.env.compileChunk(generator.chunkPrologue().concat(body), CHUNK_PARAMS,
                                  [this.runtime, T, generator.constants, this.runtime.K], '', { library: true });
        } catch (error) {
            if (error instanceof T.CompileError && error.source === T.LIBRARY_SOURCE && error.message.indexOf('[') !== 0)
                error.message = '[' + record.id + '] ' + error.message;
            throw error;
        } finally {
            CS.symtab = saved;
        }
    };

    // The definitions of types (base types first), then their setup.
    Session.prototype.typesCode = function (generator, types) {
        var body = [];
        var ordered = generator.orderTypes(types);
        ordered.forEach(function (sym) {
            body = body.concat(generator.typeDefinition(sym, '$c' + sym.jsId.replace(/[^A-Za-z0-9_]/g, '_')));
            var setup = CS.typeSetup[CS.runtimeName(sym)];
            if (setup !== undefined)
                body.push(J.expr(J.call(generator.constant(setup), [J.mem(J.id('$K'), sym.jsId), J.id('$cs')])));
        });
        return body;
    };

    // A library method at its first call: checked, translated, put into
    // its holder in place of the stub.
    Session.prototype.compileLazyMethod = function (sym, method, holder) {
        if (method.compiled !== undefined) {
            holder[method.jsName] = method.compiled;
            return method.compiled;
        }
        var saved = CS.symtab;
        CS.symtab = this.symtab;
        try {
            method.lazy = false;
            var checker = sym.checker;
            if (method.isCtor)
                checker.checkConstructor(method);
            else
                checker.checkMethodBody(method);
            // [V4Fiber]: a library method that waits is a generator.
            if (method.fiber && method.fn)
                method.fn.fiber = true;
            var generator = new CS.Generator(this, T.LIBRARY_SOURCE);
            var code = method.isCtor ? generator.constructorFunction(method, sym) : generator.methodFunction(method, sym);
            this.compileLibrary();
            var fn = this.env.compileChunk(generator.chunkPrologue().concat([J.ret(code)]), CHUNK_PARAMS,
                                           [this.runtime, T, generator.constants, this.runtime.K], '', { library: true });
            method.compiled = fn;
            holder[method.jsName] = fn;
            return fn;
        } catch (error) {
            if (error instanceof T.CompileError && error.source === T.LIBRARY_SOURCE && error.message.indexOf('[') !== 0)
                error.message = '[' + sym.qname + '.' + method.name + '] ' + error.message;
            throw error;
        } finally {
            CS.symtab = saved;
        }
    };

    // A library type for the run time by its full name.
    Session.prototype.loadLibraryType = function (name) {
        try {
            this.symtab.typeNamed(name);
        } catch (error) {
            return;
        }
        this.compileLibrary();
    };

    // The whole library at once - for checking it in tests: every error
    // of the sources and every missing native.
    Session.prototype.compileWholeLibrary = function () {
        var self = this;
        var errors = [];
        var push = errors.push;
        // Errors of the translator itself come with their place.
        errors.push = function (message) {
            return push.call(errors, message);
        };
        function describe(error) {
            if (error instanceof T.CompileError || error.stack === undefined)
                return error.message;
            return error.message + ' @' + String(error.stack).split('\n').slice(1, 4).join(' <').replace(/\s+/g, ' ');
        }
        CS.missingNatives = [];
        try {
            Object.keys(CS.library.index).forEach(function (name) {
                try {
                    self.symtab.typeNamed(name);
                } catch (error) {
                    errors.push(name + ': ' + describe(error));
                }
            });
            this.compileLibrary();
            var methods = 0;
            for (var index = 0; index < this.symtab.units.length; ++index) {
                var record = this.symtab.units[index];
                try {
                    this.compileUnit(record);
                } catch (error) {
                    errors.push('[' + record.id + '] ' + describe(error));
                    continue;
                }
                (function each(list) {
                    list.forEach(function (sym) {
                        sym.memberList.concat(sym.ctors).forEach(function (member) {
                            var list = member.symbolKind === 'method' ? [member]
                                : [member.getter, member.setter, member.adder, member.remover].filter(function (item) {
                                    return item !== null && item !== undefined;
                                });
                            list.forEach(function (method) {
                                if (!method.lazy || method.isExtern || method.isAbstract || method.synthetic ||
                                    (method.accessorOf !== null && method.accessorOf !== undefined && method.accessorOf.isAuto))
                                    return;
                                try {
                                    self.compileLazyMethod(sym, method, {});
                                } catch (error) {
                                    errors.push('[' + sym.qname + '.' + method.name + '] ' + describe(error));
                                }
                                ++methods;
                            });
                        });
                        each(Object.keys(sym.nestedTypes).map(function (key) { return sym.nestedTypes[key]; }));
                    });
                })(record.types);
            }
            CS.missingNatives.forEach(function (key) { errors.push('missing native ' + key); });
        } finally {
            CS.missingNatives = undefined;
        }
        if (errors.length > 0)
            throw new Error(errors.length + ' errors in the C# library:\n' + errors.join('\n'));
        return this.symtab.units.length + ' units, ' + methods + ' methods';
    };

    // The symbol of a type of the run time (by its id).
    Session.prototype.symbolOfType = function (ctor) {
        var found = null;
        var id = ctor.$id;
        this.symtab.units.forEach(function (record) {
            (function each(list) {
                list.forEach(function (sym) {
                    if (sym.jsId === id)
                        found = sym;
                    each(Object.keys(sym.nestedTypes).map(function (key) { return sym.nestedTypes[key]; }));
                });
            })(record.types);
        });
        if (found === null && this.typesById !== undefined)
            found = this.typesById[id] || null;
        return found;
    };

    // --- Anonymous types

    // new { A, B }: one generic class per list of names.
    Session.prototype.anonymousType = function (names) {
        var key = names.join(',');
        var found = this.anonymousTypes[key];
        if (found !== undefined)
            return found;
        var sym = new CS.TypeSymbol('<>f__AnonymousType' + Object.keys(this.anonymousTypes).length, 'class', this.symtab.global);
        sym.isAnonymous = true;
        sym.anonymousMembers = names;
        sym.state = 'complete';
        sym.baseType = CS.objectType();
        sym.mods = { sealed: true };
        sym.typeParams = names.map(function (name, index) { return CS.TypeParamSymbol('T' + index, sym, index); });
        sym.allTypeParams = sym.typeParams;
        sym.fieldOrder = [];
        sym.interfaceMap = [];
        sym.usedMethodNames = Object.create(null);
        sym.usedFieldNames = Object.create(null);
        names.forEach(function (name, index) {
            var property = CS.PropertySymbol(name, CS.typeParam(sym.typeParams[index]), sym, { public: true });
            property.isAuto = true;
            var field = CS.FieldSymbol('<' + name + '>i__Field', property.type, sym, { readonly: true });
            field.jsName = name;
            field.backingOf = property;
            property.backingField = field;
            var getter = CS.MethodSymbol('get_' + name, sym, { public: true });
            getter.accessorOf = property;
            getter.returnType = property.type;
            getter.jsName = 'get_' + name + '$0';
            property.getter = getter;
            property.jsName = name;
            sym.addMember(property);
            sym.fieldOrder.push(field);
        });
        this.runtime.defineAnonymous(sym.jsId, names);
        this.anonymousTypes[key] = sym;
        return sym;
    };

    // --- The unit

    Session.prototype.runBlock = function (code) {
        var env = this.env;
        env.scheduler.reset();
        CS.symtab = this.symtab;
        CS.rt = this.runtime;
        this.runtime.resetRun();
        this.refreshModules();
        var unit = CS.parse(code, '', true);
        var compiled = this.compileUnitCode(unit);
        var run = env.compileChunk(compiled.body, CHUNK_PARAMS, [this.runtime, T, compiled.constants, this.runtime.K], '');
        try {
            var result = run();
            if (compiled.async || this.runtime.hasPendingFibers())
                return this.runAsync(result, compiled);
            return this.finish(result, compiled);
        } catch (error) {
            if (error instanceof CS.ProgramExit && error.status === 0)
                return undefined;
            throw error;
        }
    };

    // The value of a unit: the last expression without a semicolon; an int
    // returned by the top-level code is the exit code.
    Session.prototype.finish = function (result, compiled) {
        if (compiled.exitCode) {
            if (typeof result === 'number' && result !== 0)
                throw new CS.ProgramExit(result);
            return undefined;
        }
        return result;
    };

    // Checks and translates a unit; its declarations join the shared scope
    // only if it succeeds.
    Session.prototype.compileUnitCode = function (unit) {
        var sessionSym = this.sessionClass;
        var savedMembers = copyMembers(sessionSym);
        var replaced = [];
        try {
            var result = this.checkUnit(unit, replaced);
            this.compileLibrary();
            return result;
        } catch (error) {
            sessionSym.members = savedMembers.members;
            sessionSym.memberList = savedMembers.memberList;
            sessionSym.usedMethodNames = savedMembers.used;
            replaced.forEach(function (item) {
                if (item.old === undefined)
                    delete item.ns.types[item.key];
                else
                    item.ns.types[item.key] = item.old;
            });
            throw error;
        }
    };

    function copyMembers(sym) {
        var members = Object.create(null);
        Object.keys(sym.members).forEach(function (name) { members[name] = sym.members[name].slice(); });
        var used = Object.create(null);
        Object.keys(sym.usedMethodNames).forEach(function (name) { used[name] = true; });
        return { members: members, memberList: sym.memberList.slice(), used: used };
    }

    Session.prototype.checkUnit = function (unit, replaced) {
        var self = this;
        var checker = new CS.Checker(this, '');
        var sessionSym = this.sessionClass;
        var unitScope = checker.namespaceScope(this.symtab.global, unit.usings, null, true);
        var sessionScope = unitScope.child('type', { sym: sessionSym });
        // Types into their namespaces (replacing those of earlier units).
        var types = [];
        var namespaces = [];
        checker.enteredHere = [];
        unit.members.forEach(function (member) {
            if (member.k === 'type' || member.k === 'namespace')
                namespaces.push(member);
        });
        // Remember what a type replaces, to restore it if the unit fails.
        var global = this.symtab.global;
        var recordReplaced = function (ns, key) {
            replaced.push({ ns: ns, key: key, old: ns.types[key] });
        };
        namespaces.forEach(function (member) {
            if (member.k === 'type')
                recordReplaced(global, CS.arityKey(member.name, (member.typeParams || []).length));
        });
        checker.enterNamespaceMembers(namespaces, global, unitScope, types);
        types.forEach(function (sym) {
            if (sym.container !== global && sym.container.kind === 'namespace')
                replaced.push({ ns: sym.container, key: CS.arityKey(sym.name, sym.typeParams.length), old: undefined, keep: true });
        });
        var statements = unit.members.filter(function (member) { return member.k !== 'type' && member.k !== 'namespace'; });
        // Top-level functions and typed variables: members of the session class.
        var functions = [];
        statements.forEach(function (statement) {
            if (statement.k === 'localFunction')
                functions.push(self.declareSessionFunction(checker, statement, sessionScope));
        });
        statements.forEach(function (statement) {
            if (statement.k === 'local' && statement.type !== null && !statement.isConst)
                statement.vars.forEach(function (variable) {
                    var type = checker.resolveType(statement.type, sessionScope);
                    self.declareSessionField(variable, type, statement);
                });
        });
        // The headers and members of the types, then their bodies.
        var all = [];
        types.forEach(function (sym) { (function collect(item) {
            all.push(item);
            Object.keys(item.nestedTypes).forEach(function (key) { collect(item.nestedTypes[key]); });
        })(sym); });
        all.forEach(function (sym) { sym.complete(); });
        checker.functions = [];
        all.forEach(function (sym) { checker.checkTypeBodies(sym, false); });
        // The top-level statements: the body of the run function.
        var hasReturnValue = containsReturnValue(statements);
        var run = CS.MethodSymbol('<Main>$', sessionSym, { static: true });
        run.returnType = hasReturnValue ? CS.intType() : CS.VOID;
        var fn = checker.functionInfo(run, 'method', null);
        fn.topLevel = true;
        fn.isAsync = containsAwait(statements);
        if (fn.isAsync)
            fn.returnType = run.returnType;
        var runScope = sessionScope.child('method', { method: run, fn: fn });
        var blockScope = runScope.child('block', {});
        checker.registerFunction(fn, runScope);
        var bound = [];
        var valueStatement = null;
        checker.declareLabels(statements, blockScope);
        statements.forEach(function (statement, index) {
            if (statement.k === 'localFunction')
                return;
            if (statement.k === 'local' && !statement.isConst && !statement.isUsing && !statement.refKind) {
                bound = bound.concat(self.bindSessionVariables(checker, statement, blockScope));
                return;
            }
            var result = checker.bindStatement(statement, blockScope);
            if (statement.unitValue && index === statements.length - 1 && result.k === 'expr' && result.expr.type !== undefined &&
                result.expr.type.kind !== 'void')
                valueStatement = result;
            bound.push(result);
        });
        // The bodies of the top-level functions (they see all variables).
        functions.forEach(function (method) { self.checkSessionFunction(checker, method); });
        // A whole program: Main of the first class that has one.
        var main = statements.some(function (statement) { return statement.k !== 'localFunction'; }) ? null : this.mainMethod(types);
        this.markFibers(checker.functions);
        return this.generateUnit(types.concat(all.filter(function (sym) { return types.indexOf(sym) < 0; })), functions, bound, fn,
                                 valueStatement, main, hasReturnValue);
    };

    // A syntax node in the top-level statements (not in lambdas, local
    // functions and types) for which test is true.
    function findNode(statements, test) {
        var found = false;
        var seen = new Set();
        (function walk(node) {
            if (found || node === null || typeof node !== 'object' || seen.has(node))
                return;
            seen.add(node);
            if (Array.isArray(node)) {
                node.forEach(walk);
                return;
            }
            // Syntax nodes only: the checker attaches symbols to some.
            if (typeof node.k !== 'string')
                return;
            if (test(node)) {
                found = true;
                return;
            }
            if (node.k === 'lambda' || node.k === 'localFunction' || node.k === 'type')
                return;
            Object.keys(node).forEach(function (key) {
                if (key !== 'line' && key !== 'column' && key !== 'sym' && key !== 'method')
                    walk(node[key]);
            });
        })(statements.filter(function (statement) { return statement.k !== 'localFunction'; }));
        return found;
    }

    function containsReturnValue(statements) {
        return findNode(statements, function (node) { return node.k === 'return' && node.expr !== null; });
    }

    function containsAwait(statements) {
        return findNode(statements, function (node) {
            return node.k === 'await' || (node.k === 'foreach' && node.isAwait) || (node.k === 'using' && node.isAwait) ||
                (node.k === 'local' && node.isAwaitUsing);
        });
    }

    // A top-level function: a static method of the session class; one with
    // the same signature replaces the old one.
    Session.prototype.declareSessionFunction = function (checker, node, scope) {
        var sessionSym = this.sessionClass;
        var mods = { static: true, public: true };
        if (node.mods.async)
            mods.async = true;
        var method = CS.MethodSymbol(node.name, sessionSym, mods);
        method.node = node;
        method.sessionFunction = true;
        var methodScope = checker.methodScope(method, scope, node.typeParams);
        checker.declareConstraints(method.typeParams, node.constraints, methodScope, method);
        method.returnType = checker.resolveType(node.returnType, methodScope, { allowVoid: true });
        method.params = checker.parameters(node.params, methodScope, method);
        method.scope = methodScope;
        node.method = method;
        var signature = CS.signatureKey(method, null);
        var list = (sessionSym.members[node.name] || []).filter(function (other) {
            if (other.symbolKind !== 'method')
                checker.error(node, 'CS0128', "A local variable or function named '" + node.name + "' is already defined in this scope");
            if (other.declaredInUnit === checker && CS.signatureKey(other, null) === signature)
                checker.error(node, 'CS0128', "A local variable or function named '" + node.name + "' is already defined in this scope");
            return CS.signatureKey(other, null) !== signature;
        });
        method.declaredInUnit = checker;
        list.push(method);
        sessionSym.members[node.name] = list;
        sessionSym.memberList = sessionSym.memberList.filter(function (member) {
            return !(member.symbolKind === 'method' && member.name === node.name && CS.signatureKey(member, null) === signature);
        });
        sessionSym.memberList.push(method);
        this.sessionMethodName(method);
        return method;
    };

    // name$arity, with the parameter types if other overloads have that arity.
    Session.prototype.sessionMethodName = function (method) {
        var sessionSym = this.sessionClass;
        var base = T.propertyName(method.name) + '$' + method.params.length;
        var clash = (sessionSym.members[method.name] || []).some(function (other) {
            return other !== method && other.params.length === method.params.length;
        });
        method.jsName = clash ? base + '$' + method.params.map(function (param) {
            return CS.typeName(param.type).replace(/[^A-Za-z0-9_]/g, '_');
        }).join('$') + (method.typeParams.length > 0 ? '$' + method.typeParams.length : '') : base;
    };

    Session.prototype.checkSessionFunction = function (checker, method) {
        var fn = checker.functionInfo(method, 'method', null);
        method.scope.fn = fn;
        method.body = checker.bindFunctionBody(method, method.node, method.scope, fn);
        method.fn = fn;
    };

    // A top-level variable: a static field of the session class (a new
    // declaration replaces the old variable).
    Session.prototype.declareSessionField = function (variable, type, node) {
        var sessionSym = this.sessionClass;
        var existing = sessionSym.members[variable.name];
        if (existing !== undefined && existing.some(function (member) { return member.symbolKind === 'method'; }))
            throw new T.CompileError("error CS0128: A local variable or function named '" + variable.name +
                                     "' is already defined in this scope", variable.line, variable.column, '');
        var field = CS.FieldSymbol(variable.name, type, sessionSym, { static: true, public: true });
        field.jsName = 's$' + T.propertyName(variable.name);
        field.node = variable;
        sessionSym.members[variable.name] = [field];
        sessionSym.memberList = sessionSym.memberList.filter(function (member) { return member.name !== variable.name; });
        sessionSym.memberList.push(field);
        variable.sessionField = field;
        return field;
    };

    // var x = ...; Type y = ...; at the top level: assignments of the fields.
    Session.prototype.bindSessionVariables = function (checker, statement, scope) {
        var self = this;
        var result = [];
        statement.vars.forEach(function (variable) {
            var field = variable.sessionField;
            var value = null;
            if (field === undefined) {
                if (variable.init === null)
                    checker.error(variable, 'CS0818', 'Implicitly-typed variables must be initialized');
                value = checker.bindExpr(variable.init, scope);
                if (value.k === 'literal' && value.type.kind === 'null')
                    checker.error(variable, 'CS0815', 'Cannot assign <null> to an implicitly-typed variable');
                value = checker.requireValue(value, variable.init);
                if (value.type.kind === 'void')
                    checker.error(variable, 'CS0815', 'Cannot assign void to an implicitly-typed variable');
                field = self.declareSessionField(variable, value.type, statement);
            } else if (variable.init !== null) {
                value = variable.init.k === 'arrayInit' ? checker.bindArrayInitializer(variable.init, field.type, scope)
                                                        : checker.bindAs(variable.init, scope, field.type);
            }
            var target = CS.bound('field', variable, { receiver: null, field: field, ownerType: null, type: field.type });
            var assigned = value !== null ? value : checker.defaultOf(field.type, variable);
            result.push(CS.bound('expr', variable, { expr: CS.bound('assign', variable, { target: target, value: assigned,
                                                                                         type: field.type }) }));
        });
        return result;
    };

    // static void Main(string[] args) or Main() of the first class.
    Session.prototype.mainMethod = function (types) {
        for (var index = 0; index < types.length; ++index) {
            var sym = types[index];
            var list = (sym.members.Main || []).filter(function (method) {
                return method.symbolKind === 'method' && method.isStatic && (method.params.length === 0 ||
                    (method.params.length === 1 && method.params[0].type.kind === 'array' &&
                     CS.isSpecial(method.params[0].type.elem, 'string')));
            });
            if (list.length > 0)
                return list[0];
            var nested = Object.keys(sym.nestedTypes).map(function (key) { return sym.nestedTypes[key]; });
            var inner = this.mainMethod(nested);
            if (inner !== null)
                return inner;
        }
        return null;
    };

    // --- Fibers

    // Functions that wait (Thread.Sleep, Task.Wait...) without async are
    // fibers: generators that their callers call with yield*. A fixed point
    // over the functions of the unit.
    Session.prototype.markFibers = function (functions) {
        var names = this.asyncNames;
        function waits(call) {
            var method = call.method;
            if (method.fiber)
                return true;
            return !method.isStatic && names[method.jsName] === true && (method.isVirtual || method.isAbstract ||
                                                                         method.isOverride || method.owner.kind === 'interface');
        }
        var changed = true;
        while (changed) {
            changed = false;
            (functions || []).forEach(function (fn) {
                if (fn.fiber || fn.isAsync || fn.iterator || fn.init || !fn.calls.some(waits))
                    return;
                if (fn.method && fn.method.isCtor)
                    return;
                fn.fiber = true;
                changed = true;
                if (fn.method && fn.kind === 'method') {
                    fn.method.fiber = true;
                    if (!fn.method.isStatic)
                        names[fn.method.jsName] = true;
                } else if (fn.kind === 'local' && fn.method) {
                    fn.method.fiber = true;
                }
            });
        }
    };

    // A delegate of this type may wait when called (a lambda that waits).
    Session.prototype.mayWait = function (type) {
        return false;
    };

    // --- Translation of a unit

    Session.prototype.generateUnit = function (types, functions, statements, fn, valueStatement, main, exitCode) {
        var self = this;
        var generator = new CS.Generator(this, '');
        var all = [];
        types.forEach(function (sym) { generator.collectTypes(sym, all); });
        var unique = all.filter(function (sym, index) { return all.indexOf(sym) === index; });
        var body = this.typesCode(generator, unique);
        var session = J.mem(J.id('$K'), '$session');
        functions.forEach(function (method) {
            body.push(J.at(J.expr(J.assign(J.mem(session, method.jsName), generator.methodFunction(method, self.sessionClass))),
                           method.node.line));
        });
        // The run function.
        var context = generator.pushFunction('method', this.sessionClass, { isStatic: true });
        context.isStatic = true;
        generator.valueStatement = valueStatement;
        var code = [];
        if (valueStatement !== null)
            code.push(J.let_('$value', J.undef()));
        var runBody;
        if (fn.isAsync) {
            var inner = generator.pushFunction('lambda', this.sessionClass, { isStatic: true });
            inner.generator = true;
            inner.async = true;
            inner.isStatic = true;
            var asyncStatements = generator.statements(statements);
            if (main !== null)
                asyncStatements.push(J.expr(this.mainCall(generator, main)));
            if (valueStatement !== null)
                asyncStatements.push(J.ret(J.id('$value')));
            var generatorCode = generator.functionCode(inner, [], asyncStatements, true);
            generator.fn = context;
            // The value of the unit is the text that $cs.show made.
            var resultType = valueStatement !== null ? generator.typeRef(CS.stringType()) : J.nul();
            code.push(J.ret(J.call(generator.rt('async'), [generatorCode, resultType])));
            runBody = code;
        } else {
            code = code.concat(generator.statements(statements));
            if (main !== null) {
                var call = this.mainCall(generator, main);
                if (main.isAsync)
                    code.push(J.ret(call));
                else if (CS.isSpecial(main.returnType, 'int'))
                    code.push(J.ret(call));
                else
                    code.push(J.expr(call));
            }
            if (valueStatement !== null)
                code.push(J.ret(J.id('$value')));
            runBody = code;
        }
        var block = generator.functionCode(context, [], runBody, false);
        generator.fn = null;
        body.push(J.ret(block));
        var prologue = generator.chunkPrologue();
        return { body: prologue.concat(body), constants: generator.constants, async: fn.isAsync || (main !== null && main.isAsync),
                 exitCode: exitCode || (main !== null && CS.isSpecial(main.returnType, 'int')) };
    };

    Session.prototype.mainCall = function (generator, main) {
        var args = main.params.length === 1
            ? [J.call(generator.rt('arrayOf'), [generator.typeRef(CS.stringType()), J.arr([])])] : [];
        return J.call(J.mem(generator.typeSymRef(main.owner), main.jsName), args);
    };

    // A unit that waits: the scheduler runs it until it ends or all fibers
    // wait for time; then it goes on in timers.
    Session.prototype.runAsync = function (result, compiled) {
        var self = this;
        var env = this.env;
        var runtime = this.runtime;
        var value;
        var main = function* () {
            var outcome = result;
            if (runtime.isTask(result))
                outcome = yield* runtime.await(result);
            yield* runtime.awaitFibers();
            return outcome;
        };
        var state = env.scheduler.runMain(main(), function (callback, delay) {
            return env.schedule(function () {
                CS.rt = runtime;
                CS.symtab = self.symtab;
                try {
                    callback();
                } finally {
                    env.out.flush();
                    env.err.flush();
                }
            }, delay);
        }, function (error, outcome) {
            if (error !== null && error !== undefined) {
                if (!(error instanceof CS.ProgramExit && error.status === 0))
                    env.reportLate(error);
                return;
            }
            value = outcome;
        });
        if (state !== 'done')
            return undefined;
        return this.finish(value, compiled);
    };

    // --- Types from host files: the type Name comes from Name.cs

    Session.prototype.refreshModules = function () {
        var self = this;
        this.missingModules = Object.create(null);
        Object.keys(this.modules).forEach(function (name) {
            var module = self.modules[name];
            if (self.env.readModule(module.file) !== module.text)
                delete self.modules[name];
        });
    };

    Session.prototype.moduleType = function (name) {
        var module = this.modules[name];
        if (module === undefined) {
            if (this.missingModules[name] || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
                return null;
            var file = name + '.cs';
            var text = this.env.readModule(file);
            if (text === null || text === undefined) {
                this.missingModules[name] = true;
                return null;
            }
            module = this.loadModule(file, text);
        }
        return module.types[name] || null;
    };

    // The types of a host file live in a namespace of their own: they see
    // the library, not the declarations of the units.
    Session.prototype.loadModule = function (file, text) {
        var self = this;
        var unit = CS.parse(text, file, false);
        var checker = new CS.Checker(this, file);
        var moduleNs = new CS.NamespaceSymbol('', null);
        var unitScope = checker.namespaceScope(moduleNs, unit.usings, null, true);
        var module = { file: file, text: text, types: Object.create(null) };
        unit.members.forEach(function (member) {
            if (member.k !== 'type' && member.k !== 'namespace')
                checker.error(member, 'CS0116', 'A namespace cannot directly contain members such as fields, methods or statements');
        });
        var types = [];
        checker.enterNamespaceMembers(unit.members, moduleNs, unitScope, types);
        types.forEach(function (sym) {
            module.types[sym.name] = sym;
            self.modules[sym.name] = module;
        });
        try {
            var all = [];
            types.forEach(function (sym) { (function collect(item) {
                all.push(item);
                Object.keys(item.nestedTypes).forEach(function (key) { collect(item.nestedTypes[key]); });
            })(sym); });
            all.forEach(function (sym) { sym.complete(); });
            checker.functions = [];
            all.forEach(function (sym) { checker.checkTypeBodies(sym, false); });
            this.markFibers(checker.functions);
            var generator = new CS.Generator(this, file);
            var body = this.typesCode(generator, all);
            this.compileLibrary();
            this.env.compileChunk(generator.chunkPrologue().concat(body), CHUNK_PARAMS,
                                  [this.runtime, T, generator.constants, this.runtime.K], file);
        } catch (error) {
            types.forEach(function (sym) { delete self.modules[sym.name]; });
            throw error;
        }
        return module;
    };

    // --- Errors

    // bare - without "Unhandled exception." (threads print their own way).
    Session.prototype.describeError = function (error, bare) {
        if (error instanceof CS.ProgramExit)
            return error.message;
        if (error instanceof CS.FatalError)
            return error.message;
        var converted;
        try {
            converted = this.runtime.caught(error);
        } catch (fatal) {
            if (fatal instanceof CS.FatalError)
                return fatal.message;
            converted = error;
        }
        if (this.runtime.isException(converted))
            return (bare ? '' : 'Unhandled exception. ') + this.runtime.exceptionText(converted);
        if (converted !== null && typeof converted === 'object' && converted.message !== undefined)
            return String(converted.message);
        return String(converted);
    };

    Session.prototype.deadlock = function () {
        return new T.LanguageError('deadlock: all tasks and threads are waiting', null);
    };

    CS.Session = Session;
    CS.language = {
        id: 'csharp',
        name: 'C#',
        createSession: function (env) {
            return new Session(env);
        }
    };
    T.languages.csharp = CS.language;
})(globalThis);
