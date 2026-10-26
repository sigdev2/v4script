// C: the language session - the shared scope of the units, macros,
// typedefs, memory, the function table, built-in headers and the run of
// a unit.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var C = T.c;
    if (C.language)
        return;

    var rt = C.runtime;
    var types = C.types;
    var i64 = T.i64, u64 = T.u64, utf8 = T.utf8;

    var CHUNK_PARAMS = ['$c', '$T', '$D', '$M', '$F', '$G'];

    var PREDEFINED = [
        '#define __STDC__ 1', '#define __STDC_VERSION__ 201710L', '#define __STDC_HOSTED__ 1', '#define __x86_64__ 1',
        '#define __linux__ 1', '#define __LP64__ 1', '#define __CHAR_BIT__ 8', '#define __SIZEOF_SHORT__ 2',
        '#define __SIZEOF_INT__ 4', '#define __SIZEOF_LONG__ 8', '#define __SIZEOF_LONG_LONG__ 8',
        '#define __SIZEOF_POINTER__ 8', '#define __SIZEOF_FLOAT__ 4', '#define __SIZEOF_DOUBLE__ 8',
        '#define __V4SCRIPT__ 1'
    ].join('\n') + '\n';

    // Library variables: name -> the session field with the address.
    var NATIVE_GLOBALS = { errno: 'errnoAddress', stdin: 'stdinPointer', stdout: 'stdoutPointer', stderr: 'stderrPointer' };

    function Session(env) {
        var self = this;
        this.env = env;
        this.memory = new rt.Memory();
        this.memory.runNested = function (generator) {
            return env.scheduler.runNested(generator);
        };
        this.scope = new C.Scope(null);
        this.scope.kind = 'file';
        this.scope.names.__builtin_va_list = { kind: 'typedef', name: '__builtin_va_list', type: types.valist, fromSession: true };
        this.typedefs = Object.create(null);
        this.typedefs.__builtin_va_list = 'typedef';
        this.macros = Object.create(null);
        this.functionsByName = Object.create(null);
        this.literals = new Map();
        this.argvAddress = 0;
        this.asyncPossible = false;
        this.currentFileScope = this.scope;
        this.errnoAddress = this.memory.allocateStatic(4, 4);
        // Headers of the host modules: <name.h>, included in every unit when
        // the module is global.
        this.hostHeaders = env.modules.map(function (module) {
            var header = C.hostHeader(module);
            return { file: module.names.snake + '.h', text: header.text, names: header.names, global: module.global };
        });
        this.natives = C.libc(this);
        this.stdinPointer = this.pointerTo(this.stdinAddress);
        this.stdoutPointer = this.pointerTo(this.stdoutAddress);
        this.stderrPointer = this.pointerTo(this.stderrAddress);
        // Helpers of the translated code.
        this.c = Object.create(rt);
        this.c.show = function (type, value) {
            return self.show(type, value, 0);
        };
        this.prelude();
    }

    // Text of a built-in header (C library, js.h, host modules) or undefined.
    Session.prototype.builtInHeader = function (name) {
        if (C.headers[name] !== undefined)
            return C.headers[name];
        for (var index = 0; index < this.hostHeaders.length; ++index) {
            if (this.hostHeaders[index].file === name)
                return this.hostHeaders[index].text;
        }
        return undefined;
    };

    Session.prototype.pointerTo = function (address) {
        var slot = this.memory.allocateStatic(8, 8);
        this.memory.storePointer(slot, address);
        return slot;
    };

    // Built-in headers once per session, as if every unit started with
    // #include of all of them.
    Session.prototype.prelude = function () {
        var self = this;
        var included = Object.create(null);
        var implicit = C.implicitHeaders.concat(this.hostHeaders.filter(function (header) { return header.global; })
                                                    .map(function (header) { return header.file; }));
        var text = PREDEFINED + implicit.map(function (name) { return '#include <' + name + '>'; }).join('\n') + '\n';
        var tokens = C.preprocess(text, '<built-in>', {
            macros: this.macros,
            include: function (name) {
                var header = self.builtInHeader(name);
                if (header === undefined)
                    return null;
                var first = !included[name];
                included[name] = true;
                return { text: first ? header : '', file: name, library: true };
            }
        });
        var typedefs = Object.create(null);
        typedefs.__builtin_va_list = 'typedef';
        var unit = C.parse(tokens, typedefs);
        var checker = new C.Checker(this, '');
        checker.scope = this.scope;
        unit.items.forEach(function (item) { checker.declaration(item); });
        this.commitNames(this.scope, unit.typedefs);
    };

    Session.prototype.preprocessOptions = function () {
        var self = this;
        var env = this.env;
        // Built-in headers are declared once by the prelude; an include of a
        // header of a module that is not global declares it now.
        function builtIn(name) {
            if (name === 'assert.h')
                return C.headers[name];
            var host = null;
            self.hostHeaders.forEach(function (header) {
                if (header.file === name && !header.global)
                    host = header.text;
            });
            return host !== null ? host : '';
        }
        return {
            macros: this.macros,
            onceFiles: {},
            include: function (name, system) {
                var isBuiltIn = self.builtInHeader(name) !== undefined;
                if (isBuiltIn && system)
                    return { text: builtIn(name), file: name, library: true };
                var text = env.readModule(name.replace(/^\.\//, ''));
                if (text !== null)
                    return { text: text, file: name, library: false };
                if (isBuiltIn)
                    return { text: builtIn(name), file: name, library: true };
                return null;
            },
            warn: function (directive, message) {
                env.warn.write('warning: ' + message + '\n');
            }
        };
    };

    // --- For checking and translation

    Session.prototype.functionObject = function (name, type, node) {
        var object = this.functionsByName[name];
        if (object !== undefined) {
            object.type = type;
            return object;
        }
        var index = this.memory.registerFunction(name);
        object = { kind: 'func', name: name, type: type, index: index, async: false, addressTaken: false,
                   library: !!(node && node.file && this.builtInHeader(node.file) !== undefined) };
        var native = this.natives[name];
        if (native !== undefined) {
            this.memory.define(index, native);
            object.native = true;
            if (C.libcAsync[name]) {
                object.async = true;
                object.nativeAsync = true;
            }
        }
        this.functionsByName[name] = object;
        return object;
    };

    Session.prototype.functionType = function (address) {
        var index = this.memory.functionIndex(address);
        var object = this.functionsByName[this.memory.functionNames[index]];
        return object !== undefined ? object.type : null;
    };

    Session.prototype.lookupGlobal = function (name) {
        var object = this.currentFileScope.lookup(name);
        return object !== null && object.kind === 'var' && object.storage === 'global' ? object : null;
    };

    // The address of a global or static variable. A global of the same name
    // and size from an earlier unit (or an earlier run of this one) gets
    // the same address.
    Session.prototype.allocateObject = function (object) {
        if (object.address !== undefined)
            return;
        if (object.storage === 'global') {
            var field = NATIVE_GLOBALS[object.name];
            if (field !== undefined && object.extern) {
                object.address = this[field];
                return;
            }
            var previous = this.scope.names[object.name];
            if (previous !== undefined && previous !== object && previous.kind === 'var' && previous.address !== undefined &&
                previous.type.size === object.type.size && previous.address !== this[NATIVE_GLOBALS[object.name]]) {
                object.address = previous.address;
                return;
            }
        }
        object.address = this.memory.allocateStatic(Math.max(object.type.size, 1), object.type.align);
    };

    // A string literal: one address per text.
    Session.prototype.literal = function (bytes, wide) {
        var list = typeof bytes === 'string' ? bytes.split('').map(function (ch) { return ch.charCodeAt(0); }) : bytes;
        var key = (wide ? 'w' : 'n') + list.join(',');
        var address = this.literals.get(key);
        if (address !== undefined)
            return address;
        var memory = this.memory;
        if (wide) {
            address = memory.allocateStatic((list.length + 1) * 4, 4);
            list.forEach(function (code, index) { memory.I32[(address >> 2) + index] = code; });
        } else {
            address = memory.allocateStatic(list.length + 1, 1);
            memory.writeBytes(address, list, true);
        }
        this.literals.set(key, address);
        return address;
    };

    Session.prototype.sourceName = function (file) {
        if (this.builtInHeader(file) !== undefined || file.charAt(0) === '<')
            return T.LIBRARY_SOURCE;
        return file;
    };

    // argv: { "main", NULL }.
    Session.prototype.argv = function () {
        if (this.argvAddress === 0) {
            var name = this.literal(utf8.encode('main'), false);
            this.argvAddress = this.memory.allocateStatic(16, 8);
            this.memory.storePointer(this.argvAddress, name);
        }
        return this.argvAddress;
    };

    // --- The unit

    Session.prototype.snapshotFunctions = function () {
        var names = this.functionsByName;
        return Object.keys(names).map(function (name) {
            var object = names[name];
            return [object, object.type, object.definedBy, object.info, object.async, object.addressTaken, object.isStatic];
        });
    };

    Session.prototype.restoreFunctions = function (snapshot) {
        snapshot.forEach(function (item) {
            var object = item[0];
            object.type = item[1];
            object.definedBy = item[2];
            object.info = item[3];
            object.async = item[4];
            object.addressTaken = item[5];
            object.isStatic = item[6];
        });
    };

    Session.prototype.commitNames = function (scope, typedefs) {
        var target = this.scope;
        Object.keys(scope.names).forEach(function (name) {
            var object = scope.names[name];
            object.fromSession = true;
            target.names[name] = object;
        });
        if (scope !== target) {
            Object.keys(scope.tags).forEach(function (tag) {
                target.tags[tag] = scope.tags[tag];
            });
        }
        var known = this.typedefs;
        Object.keys(typedefs).forEach(function (name) {
            known[name] = typedefs[name];
        });
    };

    // An expression whose value the unit shows: not an assignment and not a
    // call of printf and the like.
    function isShownExpression(expr) {
        while (expr.k === 'paren')
            expr = expr.expr;
        if (expr.type.kind === 'void' || expr.k === 'assign' || expr.k === 'postinc' || expr.k === 'preinc')
            return false;
        if (expr.k === 'call' && expr.direct !== undefined && expr.direct.library && C.isInteger(expr.type))
            return false;
        return true;
    }

    Session.prototype.check = function (checker, unit) {
        var info = new C.FunctionInfo(null, C.functionType(types.void, [], false, false));
        info.params = [];
        checker.func = info;
        var main = null;
        unit.items.forEach(function (item) {
            if (item.k === 'funcdef') {
                checker.functionDefinition(item);
                if (item.object.name === 'main')
                    main = item.object;
            } else if (item.k === 'decl' || item.k === 'staticassert') {
                checker.declaration(item);
            } else {
                checker.statement(item);
            }
        });
        if (main !== null) {
            var mainType = main.type;
            if (!C.isInteger(mainType.returns) && mainType.returns.kind !== 'void')
                checker.error(main.info.node.declarator, "'main' must return 'int'");
        }
        var last = unit.items.length > 0 ? unit.items[unit.items.length - 1] : null;
        var valueStatement = main === null && last !== null && last.k === 'exprstmt' && isShownExpression(last.expr) ? last : null;
        return { info: info, valueStatement: valueStatement, main: main };
    };

    // Functions that wait (sleep) or call such functions are generators.
    Session.prototype.computeAsync = function (infos) {
        var names = this.functionsByName;
        infos.forEach(function (info) {
            info.async = false;
            if (info.object !== null) {
                info.object.async = false;
                info.object.nativeAsync = false;
                info.object.native = false;
                info.object.library = false;
            }
        });
        var possible = false;
        for (;;) {
            var changed = false;
            infos.forEach(function (info) {
                if (info.async)
                    return;
                var async = info.blocking || (info.dynamicCalls && possible) ||
                    info.calls.some(function (object) { return object.async; });
                if (async) {
                    info.async = true;
                    if (info.object !== null)
                        info.object.async = true;
                    changed = true;
                }
            });
            var nowPossible = Object.keys(names).some(function (name) {
                return names[name].async && names[name].addressTaken;
            });
            if (nowPossible !== possible) {
                possible = nowPossible;
                changed = true;
            }
            if (!changed)
                break;
        }
        this.asyncPossible = possible;
    };

    Session.prototype.compile = function (code) {
        var savedMacros = Object.assign(Object.create(null), this.macros);
        var savedFunctions = this.snapshotFunctions();
        var scope = new C.Scope(this.scope);
        scope.kind = 'file';
        this.currentFileScope = scope;
        var unit, generator, body, top;
        try {
            var tokens = C.preprocess(code, '', this.preprocessOptions());
            unit = C.parse(tokens, Object.assign(Object.create(null), this.typedefs));
            var checker = new C.Checker(this, '');
            checker.scope = scope;
            top = this.check(checker, unit);
            this.computeAsync(checker.functions.concat([top.info]));
            generator = new C.Generator(checker, this);
            body = generator.unit(unit, top);
        } catch (error) {
            var macros = this.macros;
            Object.keys(macros).forEach(function (name) { delete macros[name]; });
            Object.keys(savedMacros).forEach(function (name) { macros[name] = savedMacros[name]; });
            this.restoreFunctions(savedFunctions);
            throw error;
        } finally {
            this.currentFileScope = this.scope;
        }
        this.commitNames(scope, unit.typedefs);
        return { body: body, constants: generator.constants, async: top.info.async };
    };

    Session.prototype.runBlock = function (code) {
        var env = this.env;
        env.scheduler.reset();
        this.memory.sp = this.memory.stackTop;
        this.resetLibrary();
        var compiled = this.compile(code);
        var memory = this.memory;
        var run = env.compileChunk(compiled.body, CHUNK_PARAMS,
                                   [this.c, T, compiled.constants, memory, memory.functions, memory.generators], '');
        try {
            var result = run();
            if (compiled.async)
                return this.runAsync(result);
            this.runExitHandlers(true);
            return result;
        } catch (error) {
            // main returning a status is exit(status): the atexit functions
            // run (exit itself has run them already).
            if (error instanceof rt.CExit)
                this.runExitHandlers(true);
            if (error instanceof rt.CExit && error.exitCode === 0)
                return undefined;
            throw error;
        } finally {
            this.flushOutput();
        }
    };

    // A unit with sleep: up to the end or a wait; then by the timers of the unit.
    Session.prototype.runAsync = function (generator) {
        var self = this;
        var env = this.env;
        var value;
        var state = env.scheduler.runMain(generator, function (callback, delay) {
            return env.schedule(function () {
                try {
                    callback();
                } finally {
                    self.flushOutput();
                    env.out.flush();
                    env.err.flush();
                }
            }, delay);
        }, function (error, result) {
            if (error === null || error === undefined || error instanceof rt.CExit) {
                try {
                    self.runExitHandlers(true);
                } catch (exitError) {
                    error = exitError;
                }
            }
            if (error !== null && error !== undefined) {
                if (!(error instanceof rt.CExit && error.exitCode === 0)) {
                    self.flushOutput();
                    env.reportLate(error);
                }
                return;
            }
            value = result;
        });
        return state === 'done' ? value : undefined;
    };

    Session.prototype.describeError = function (error) {
        if (error instanceof T.LanguageError)
            return error.message;
        if (error instanceof RangeError && /stack|call depth|recursion/i.test(String(error.message)))
            return 'Segmentation fault (stack overflow)';
        if (error !== null && typeof error === 'object' && error.message !== undefined)
            return (error.name ? error.name + ': ' : '') + error.message;
        return String(error);
    };

    Session.prototype.deadlock = function () {
        return new rt.CError('deadlock', 1);
    };

    // --- The value of a unit in JavaScript

    Session.prototype.loadValue = function (type, address) {
        var memory = this.memory;
        if (type.kind === 'array' || C.isRecord(type))
            return address;
        var kind = C.kindOf(type);
        memory.check(address, Math.max(1, type.size));
        switch (kind) {
        case 'ptr':
            return memory.loadPointer(address);
        case 'i64':
        case 'u64':
            return memory.load64(address, kind === 'i64');
        case 'i8':
            return memory.I8[address];
        case 'u8':
            return memory.U8[address];
        case 'i16':
            return memory.I16[address >> 1];
        case 'u16':
            return memory.U16[address >> 1];
        case 'i32':
            return memory.I32[address >> 2];
        case 'u32':
            return memory.U32[address >> 2];
        case 'f32':
            return memory.F32[address >> 2];
        case 'f64':
            return memory.F64[address >> 3];
        }
        return undefined;
    };

    Session.prototype.show = function (type, value, depth) {
        var self = this;
        if (type.kind === 'void')
            return undefined;
        if (type === types.bool)
            return value !== 0;
        if (C.isJsValue(type))
            return this.fromHandle(value);
        if (C.isCharPointer(type))
            return value === 0 ? '(null)' : utf8.decode(this.memory.cstring(value));
        if (type.kind === 'pointer')
            return value === 0 ? 'NULL' : '0x' + (value >>> 0).toString(16);
        if (type.kind === 'array') {
            if (C.isInteger(type.of) && type.of.size === 1) {
                var text = '';
                for (var at = 0; at < type.length; ++at) {
                    var byte = this.memory.U8[value + at];
                    if (byte === 0)
                        break;
                    text += String.fromCharCode(byte);
                }
                return utf8.decode(text);
            }
            var items = [];
            var count = Math.min(type.length, 1000);
            for (var index = 0; index < count; ++index) {
                var address = value + index * type.of.size;
                items.push(depth > 8 ? null : this.show(type.of, this.loadValue(type.of, address), depth + 1));
            }
            return items;
        }
        if (C.isRecord(type)) {
            var object = {};
            (function fill(record, base) {
                record.fields.forEach(function (field) {
                    if (field.name === null) {
                        if (field.anonymous && C.isRecord(field.type))
                            fill(field.type, base + field.offset);
                        return;
                    }
                    if (field.bits !== null && field.bits !== undefined) {
                        var unit = self.loadValue(field.type, base + field.offset) >>> 0;
                        var raw = Math.floor(unit / Math.pow(2, field.bitOffset)) % Math.pow(2, field.bits);
                        if (field.type.signed && raw >= Math.pow(2, field.bits - 1))
                            raw -= Math.pow(2, field.bits);
                        object[field.name] = raw;
                        return;
                    }
                    object[field.name] = depth > 8 ? null
                                                    : self.show(field.type, self.loadValue(field.type, base + field.offset), depth + 1);
                });
            })(type, value);
            return object;
        }
        var kind = C.kindOf(type);
        if (kind === 'i64')
            return typeof value === 'number' ? value : i64.str(value);
        if (kind === 'u64')
            return typeof value === 'number' ? value : u64.str(value);
        return value;
    };

    C.language = {
        id: 'c',
        name: 'C',
        createSession: function (env) {
            return new Session(env);
        }
    };
    T.languages.c = C.language;
})(globalThis);
