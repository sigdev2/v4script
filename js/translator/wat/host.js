// WAT: modules that the host gives to import: WASI preview1, spectest
// (specification tests), js (helpers for JavaScript values), host modules
// by name, "'" (string constants), wasm:js-string; any other name is a path
// in the global object of JavaScript ("console", "Math").
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var W = T.wat;
    if (W.host)
        return;

    var rt = W.rt;
    var hasOwn = Object.prototype.hasOwnProperty;

    function type(params, results) {
        return { params: params, results: results };
    }

    function sameType(left, right) {
        return W.sameTypes(left.params, right.params) && W.sameTypes(left.results, right.results);
    }

    // An import of the wrong kind or type.
    function incompatible(entry, detail) {
        return W.error('unlinkable', 'incompatible import type' + (detail ? ': ' + detail : '') + ' (' +
                       JSON.stringify(entry.module) + ' ' + JSON.stringify(entry.name) + ')', entry.line, 0);
    }
    W.incompatible = incompatible;

    function unknown(entry) {
        return W.error('unlinkable', 'unknown import ' + JSON.stringify(entry.module) + ' ' + JSON.stringify(entry.name),
                       entry.line, 0);
    }
    W.unknownImport = unknown;

    // --- spectest

    function spectest(session) {
        if (session.spectestModule !== undefined)
            return session.spectestModule;
        var exports = {};
        function printer(types) {
            var fn = function () {
                var args = arguments;
                types.forEach(function (kind, index) {
                    session.printLine(rt.format(args[index], kind) + ' : ' + kind);
                });
            };
            return rt.markFunction(fn, type(types, []));
        }
        exports.print = { kind: 'func', value: rt.markFunction(function () {}, type([], [])) };
        exports.print_i32 = { kind: 'func', value: printer(['i32']) };
        exports.print_i64 = { kind: 'func', value: printer(['i64']) };
        exports.print_f32 = { kind: 'func', value: printer(['f32']) };
        exports.print_f64 = { kind: 'func', value: printer(['f64']) };
        exports.print_i32_f32 = { kind: 'func', value: printer(['i32', 'f32']) };
        exports.print_f64_f64 = { kind: 'func', value: printer(['f64', 'f64']) };
        exports.global_i32 = { kind: 'global', value: new rt.Global('i32', false, 666) };
        exports.global_i64 = { kind: 'global', value: new rt.Global('i64', false, 666) };
        exports.global_f32 = { kind: 'global', value: new rt.Global('f32', false, Math.fround(666.6)) };
        exports.global_f64 = { kind: 'global', value: new rt.Global('f64', false, 666.6) };
        exports.table = { kind: 'table', value: new rt.Table('funcref', 10, 20) };
        exports.memory = { kind: 'memory', value: new rt.Memory(1, 2) };
        session.spectestModule = exports;
        return exports;
    }

    // --- WASI preview1

    var EBADF = 8, EINVAL = 28, ENOSYS = 52, ESPIPE = 70, SUCCESS = 0;

    var WASI_TYPES = {
        args_get: type(['i32', 'i32'], ['i32']),
        args_sizes_get: type(['i32', 'i32'], ['i32']),
        environ_get: type(['i32', 'i32'], ['i32']),
        environ_sizes_get: type(['i32', 'i32'], ['i32']),
        clock_res_get: type(['i32', 'i32'], ['i32']),
        clock_time_get: type(['i32', 'i64', 'i32'], ['i32']),
        fd_write: type(['i32', 'i32', 'i32', 'i32'], ['i32']),
        fd_read: type(['i32', 'i32', 'i32', 'i32'], ['i32']),
        fd_close: type(['i32'], ['i32']),
        fd_seek: type(['i32', 'i64', 'i32', 'i32'], ['i32']),
        fd_fdstat_get: type(['i32', 'i32'], ['i32']),
        fd_fdstat_set_flags: type(['i32', 'i32'], ['i32']),
        fd_prestat_get: type(['i32', 'i32'], ['i32']),
        fd_prestat_dir_name: type(['i32', 'i32', 'i32'], ['i32']),
        proc_exit: type(['i32'], []),
        random_get: type(['i32', 'i32'], ['i32']),
        sched_yield: type([], ['i32'])
    };

    var PROGRAM_NAME = [109, 97, 105, 110];   // "main"

    function wasiFunction(session, name, context) {
        function memory() {
            var found = context.memory();
            if (found === null)
                throw new rt.Trap('WASI: the module has no memory');
            return found;
        }
        function view() {
            return memory().dv;
        }
        switch (name) {
        case 'args_sizes_get':
            return function (argc, size) {
                view().setUint32(argc >>> 0, 1, true);
                view().setUint32(size >>> 0, PROGRAM_NAME.length + 1, true);
                return SUCCESS;
            };
        case 'args_get':
            return function (argv, buffer) {
                var wasmMemory = memory();
                wasmMemory.dv.setUint32(argv >>> 0, buffer >>> 0, true);
                for (var index = 0; index < PROGRAM_NAME.length; ++index)
                    wasmMemory.U8[(buffer >>> 0) + index] = PROGRAM_NAME[index];
                wasmMemory.U8[(buffer >>> 0) + PROGRAM_NAME.length] = 0;
                return SUCCESS;
            };
        case 'environ_sizes_get':
            return function (count, size) {
                view().setUint32(count >>> 0, 0, true);
                view().setUint32(size >>> 0, 0, true);
                return SUCCESS;
            };
        case 'environ_get':
            return function () {
                return SUCCESS;
            };
        case 'clock_res_get':
            return function (id, result) {
                if (id < 0 || id > 3)
                    return EINVAL;
                view().setUint32(result >>> 0, 1000000, true);
                view().setUint32((result >>> 0) + 4, 0, true);
                return SUCCESS;
            };
        case 'clock_time_get':
            return function (id, precision, result) {
                if (id < 0 || id > 3)
                    return EINVAL;
                var nanoseconds = id === 0 ? Date.now() * 1e6 : session.monotonic() * 1e6;
                var value = T.bigToI64(T.big.fromFloat(nanoseconds), false);
                var dv = view();
                dv.setInt32(result >>> 0, rt.loOf(value), true);
                dv.setInt32((result >>> 0) + 4, rt.hiOf(value), true);
                return SUCCESS;
            };
        case 'fd_write':
            return function (fd, iovs, count, written) {
                if (fd !== 1 && fd !== 2)
                    return EBADF;
                var wasmMemory = memory();
                var total = 0;
                for (var index = 0; index < count; ++index) {
                    var base = wasmMemory.dv.getUint32((iovs >>> 0) + index * 8, true);
                    var length = wasmMemory.dv.getUint32((iovs >>> 0) + index * 8 + 4, true);
                    wasmMemory.check(base, length);
                    session.writeBytes(fd, wasmMemory.U8, base, length);
                    total += length;
                }
                wasmMemory.dv.setUint32(written >>> 0, total, true);
                return SUCCESS;
            };
        case 'fd_read':
            // Standard input: lines of the host as UTF-8 bytes; 0 bytes at
            // the end of input.
            return function (fd, iovs, count, read) {
                if (fd !== 0)
                    return EBADF;
                var wasmMemory = memory();
                if (session.pendingInput.length === 0) {
                    session.flushOutput();
                    var line = session.env.input.readLine();
                    if (line !== null)
                        session.pendingInput = T.utf8.encode(line + '\n');
                }
                var total = 0;
                for (var index = 0; index < count && session.pendingInput.length > 0; ++index) {
                    var base = wasmMemory.dv.getUint32((iovs >>> 0) + index * 8, true);
                    var length = wasmMemory.dv.getUint32((iovs >>> 0) + index * 8 + 4, true);
                    var take = Math.min(length, session.pendingInput.length);
                    wasmMemory.check(base, take);
                    for (var offset = 0; offset < take; ++offset)
                        wasmMemory.U8[base + offset] = session.pendingInput.charCodeAt(offset);
                    session.pendingInput = session.pendingInput.substring(take);
                    total += take;
                }
                wasmMemory.dv.setUint32(read >>> 0, total, true);
                return SUCCESS;
            };
        case 'fd_close':
            return function (fd) {
                return fd >= 0 && fd <= 2 ? SUCCESS : EBADF;
            };
        case 'fd_seek':
            return function (fd) {
                return fd >= 0 && fd <= 2 ? ESPIPE : EBADF;
            };
        case 'fd_fdstat_get':
            return function (fd, result) {
                if (fd < 0 || fd > 2)
                    return EBADF;
                var wasmMemory = memory();
                wasmMemory.check(result >>> 0, 24);
                for (var index = 0; index < 24; ++index)
                    wasmMemory.U8[(result >>> 0) + index] = 0;
                wasmMemory.U8[result >>> 0] = 2;   // character device
                // Rights: all.
                wasmMemory.dv.setInt32((result >>> 0) + 8, -1, true);
                wasmMemory.dv.setInt32((result >>> 0) + 12, -1, true);
                wasmMemory.dv.setInt32((result >>> 0) + 16, -1, true);
                wasmMemory.dv.setInt32((result >>> 0) + 20, -1, true);
                return SUCCESS;
            };
        case 'fd_fdstat_set_flags':
            return function (fd) {
                return fd >= 0 && fd <= 2 ? SUCCESS : EBADF;
            };
        case 'fd_prestat_get':
        case 'fd_prestat_dir_name':
            return function () {
                return EBADF;
            };
        case 'proc_exit':
            return function (code) {
                throw new rt.Exit(code);
            };
        case 'random_get':
            return function (buffer, length) {
                var wasmMemory = memory();
                wasmMemory.check(buffer >>> 0, length >>> 0);
                for (var index = 0; index < length >>> 0; ++index)
                    wasmMemory.U8[(buffer >>> 0) + index] = Math.floor(Math.random() * 256);
                return SUCCESS;
            };
        case 'sched_yield':
            return function () {
                return SUCCESS;
            };
        }
        return null;
    }

    function wasi(session, entry, kind, expected, context) {
        if (kind !== 'func')
            throw unknown(entry);
        var known = WASI_TYPES[entry.name];
        if (known !== undefined) {
            if (!sameType(known, expected))
                throw incompatible(entry, 'expected ' + rt.signature(known));
            return rt.markFunction(wasiFunction(session, entry.name, context), known);
        }
        // The rest of WASI (files, sockets, poll_oneoff) is "not supported".
        if (expected.results.length === 1 && expected.results[0] === 'i32') {
            return rt.markFunction(function () {
                return ENOSYS;
            }, expected);
        }
        throw unknown(entry);
    }

    // --- JavaScript values

    // A UTF-8 string from the memory of the module.
    function stringFrom(context, pointer, length) {
        var wasmMemory = context.memory();
        if (wasmMemory === null)
            throw new rt.Trap('the module has no memory');
        pointer = pointer >>> 0;
        length = length >>> 0;
        wasmMemory.check(pointer, length);
        return T.utf8.decode(T.utf8.fromBytes(Array.prototype.slice.call(wasmMemory.U8, pointer, pointer + length)));
    }

    // A string into memory: how many bytes it needs (at most capacity are written).
    function stringInto(context, value, pointer, capacity) {
        var wasmMemory = context.memory();
        if (wasmMemory === null)
            throw new rt.Trap('the module has no memory');
        var bytes = T.utf8.encode(String(value));
        pointer = pointer >>> 0;
        var count = Math.min(bytes.length, capacity >>> 0);
        wasmMemory.check(pointer, count);
        for (var index = 0; index < count; ++index)
            wasmMemory.U8[pointer + index] = bytes.charCodeAt(index);
        return bytes.length;
    }

    function jsHelper(session, name, context) {
        var env = session.env;
        switch (name) {
        case 'global':
            return function () { return env.global; };
        case 'get':
            return function (object, key) { return object[key]; };
        case 'set':
            return function (object, key, value) { object[key] = value; };
        case 'call':
            return function (object, key) {
                var method = object[key];
                if (typeof method !== 'function')
                    throw new TypeError(String(key) + ' is not a function');
                return method.apply(object, Array.prototype.slice.call(arguments, 2));
            };
        case 'invoke':
            return function (fn) {
                if (typeof fn !== 'function')
                    throw new TypeError(String(fn) + ' is not a function');
                return fn.apply(undefined, Array.prototype.slice.call(arguments, 1));
            };
        case 'new':
            return function (constructor) {
                var args = Array.prototype.slice.call(arguments, 1);
                var Bound = Function.prototype.bind.apply(constructor, [null].concat(args));
                return new Bound();
            };
        case 'string':
            return function (pointer, length) { return stringFrom(context, pointer, length); };
        case 'write_string':
            return function (value, pointer, capacity) { return stringInto(context, value, pointer, capacity); };
        case 'length':
            return function (value) { return value === null || value === undefined ? 0 : value.length; };
        case 'index':
            return function (object, index) { return object[index]; };
        case 'set_index':
            return function (object, index, value) { object[index] = value; };
        case 'array':
            return function () { return Array.prototype.slice.call(arguments); };
        case 'object':
            return function () { return {}; };
        case 'typeof':
            return function (value) { return value === null ? 'null' : typeof value; };
        case 'equals':
            return function (left, right) { return left === right; };
        }
        return null;
    }

    // A function of a host module: arguments and results are converted by
    // the types of the import.
    function hostModuleFunction(session, module, name) {
        var fn = module.find(name);
        if (fn === null)
            return null;
        return function () {
            session.flushOutput();
            return fn.invoke(Array.prototype.slice.call(arguments));
        };
    }

    function findHostModule(session, name) {
        var modules = session.env.modules;
        for (var index = 0; index < modules.length; ++index) {
            if (modules[index].name === name)
                return modules[index];
        }
        return null;
    }

    // wasm:js-string - the built-in string functions (the JS String
    // Builtins proposal), strings are externref.
    function isString(value) {
        return typeof value === 'string';
    }
    function castString(value) {
        if (!isString(value))
            throw new rt.Trap('not a string');
        return value;
    }
    var STRING_BUILTINS = {
        cast: [type(['externref'], ['externref']), function (value) { return castString(value); }],
        test: [type(['externref'], ['i32']), function (value) { return isString(value) ? 1 : 0; }],
        fromCharCode: [type(['i32'], ['externref']), function (code) { return String.fromCharCode(code & 0xFFFF); }],
        fromCodePoint: [type(['i32'], ['externref']), function (code) {
            code = code >>> 0;
            if (code > 0x10FFFF)
                throw new rt.Trap('invalid code point');
            return code < 0x10000 ? String.fromCharCode(code)
                                  : String.fromCharCode(0xD800 + ((code - 0x10000) >> 10), 0xDC00 + ((code - 0x10000) & 1023));
        }],
        charCodeAt: [type(['externref', 'i32'], ['i32']), function (value, index) {
            var text = castString(value);
            index = index >>> 0;
            if (index >= text.length)
                throw new rt.Trap('string offset out of bounds');
            return text.charCodeAt(index);
        }],
        codePointAt: [type(['externref', 'i32'], ['i32']), function (value, index) {
            var text = castString(value);
            index = index >>> 0;
            if (index >= text.length)
                throw new rt.Trap('string offset out of bounds');
            var code = text.charCodeAt(index);
            var next = text.charCodeAt(index + 1);
            if (code >= 0xD800 && code <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF)
                return 0x10000 + ((code - 0xD800) << 10) + (next - 0xDC00);
            return code;
        }],
        length: [type(['externref'], ['i32']), function (value) { return castString(value).length; }],
        concat: [type(['externref', 'externref'], ['externref']), function (left, right) { return castString(left) + castString(right); }],
        substring: [type(['externref', 'i32', 'i32'], ['externref']), function (value, start, end) {
            var text = castString(value);
            start = start >>> 0;
            end = end >>> 0;
            if (start > text.length || start > end)
                return '';
            return text.substring(start, Math.min(end, text.length));
        }],
        equals: [type(['externref', 'externref'], ['i32']), function (left, right) {
            if ((left !== null && !isString(left)) || (right !== null && !isString(right)))
                throw new rt.Trap('not a string');
            return left === right ? 1 : 0;
        }],
        compare: [type(['externref', 'externref'], ['i32']), function (left, right) {
            castString(left);
            castString(right);
            return left < right ? -1 : (left > right ? 1 : 0);
        }]
    };

    // A value from the global object by the path "a.b.c"; undefined - none.
    function lookup(root, path) {
        var value = root;
        var parts = path.split('.');
        for (var index = 0; index < parts.length; ++index) {
            if (value === null || value === undefined)
                return undefined;
            if (parts[index] === 'globalThis' && index === 0)
                continue;
            value = value[parts[index]];
        }
        return value;
    }

    // The import entry of the kind kind with the expected type expected (a
    // function - a type, a global - { type, mutable }). context: memory() -
    // the memory of the importing module. undefined - not a host module.
    W.host = {
        resolve: function (session, entry, kind, expected, context) {
            var moduleName = entry.module;
            var name = entry.name;
            var before = function () { session.flushOutput(); };
            if (moduleName === 'spectest') {
                var spec = spectest(session);
                if (!hasOwn.call(spec, name))
                    throw unknown(entry);
                return spec[name];
            }
            if (moduleName === 'wasi_snapshot_preview1' || moduleName === 'wasi_unstable')
                return { kind: 'func', value: wasi(session, entry, kind, expected, context) };
            if (moduleName === "'") {
                if (kind !== 'global')
                    throw unknown(entry);
                return { kind: 'global', value: new rt.Global('externref', false, name) };
            }
            if (moduleName === 'wasm:js-string') {
                if (kind !== 'func' || !hasOwn.call(STRING_BUILTINS, name))
                    throw unknown(entry);
                var builtin = STRING_BUILTINS[name];
                if (!sameType(builtin[0], expected))
                    throw incompatible(entry, 'expected ' + rt.signature(builtin[0]));
                return { kind: 'func', value: rt.markFunction(builtin[1], builtin[0]) };
            }
            var hostModule = moduleName === 'js' ? null : findHostModule(session, moduleName);
            if (moduleName === 'js' || hostModule !== null) {
                if (kind !== 'func')
                    throw unknown(entry);
                var helper = moduleName === 'js' ? jsHelper(session, name, context)
                                                 : hostModuleFunction(session, hostModule, name);
                if (helper === null)
                    throw unknown(entry);
                return { kind: 'func', value: rt.hostFunction(helper, null, expected, before) };
            }
            // A path in the global JavaScript object.
            var owner = lookup(session.env.global, moduleName);
            if (owner === undefined || owner === null || (typeof owner !== 'object' && typeof owner !== 'function'))
                return undefined;
            if (!(name in Object(owner)))
                throw unknown(entry);
            var value = owner[name];
            if (kind === 'func') {
                if (typeof value !== 'function')
                    throw incompatible(entry, 'not a function');
                if (value.$wasm !== undefined && sameType(value.$wasm.$type, expected))
                    return { kind: 'func', value: value.$wasm };
                return { kind: 'func', value: rt.hostFunction(value, owner, expected, before) };
            }
            if (kind === 'global') {
                if (value instanceof rt.Global)
                    return { kind: 'global', value: value };
                if (expected.mutable)
                    throw incompatible(entry, 'a JavaScript value is not a mutable global');
                return { kind: 'global', value: new rt.Global(expected.type, false, rt.fromJS(value, expected.type)) };
            }
            if (kind === 'memory' && value instanceof rt.Memory)
                return { kind: 'memory', value: value };
            if (kind === 'table' && value instanceof rt.Table)
                return { kind: 'table', value: value };
            throw incompatible(entry);
        }
    };
})(globalThis);
