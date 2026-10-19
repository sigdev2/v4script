// WAT: a module instance - linking the imports (checking the kind, the
// type and the limits), memory, tables, globals, translation into
// JavaScript and running the chunk, elem and data segments, the start
// function (in the order of the 2.0 spec: a trap in a segment keeps what
// is written already).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var W = T.wat;
    if (W.instantiate)
        return;

    var rt = W.rt;

    function limitsMatch(actualMin, actualMax, expected) {
        if (actualMin < expected.min)
            return false;
        if (expected.max !== null && (actualMax === null || actualMax > expected.max))
            return false;
        return true;
    }

    // An import: a value of the required kind and type or a link error.
    function link(session, module, entry, context) {
        var kind = entry.kind;
        var expected;
        switch (kind) {
        case 'func':
            expected = module.types[module.funcs[entry.index].typeIndex];
            break;
        case 'table':
            expected = module.tables[entry.index].type;
            break;
        case 'memory':
            expected = module.mems[entry.index].type;
            break;
        case 'global':
            expected = module.globals[entry.index].type;
            break;
        }
        var found = session.resolveImport(entry, kind, expected, context);
        if (found === undefined || found === null)
            throw W.unknownImport(entry);
        if (found.kind !== kind)
            throw W.incompatible(entry, 'expected ' + kind + ', found ' + found.kind);
        var value = found.value;
        switch (kind) {
        case 'func':
            if (value.$sig !== rt.signature(expected))
                throw W.incompatible(entry, 'expected ' + rt.signature(expected) + ', found ' + value.$sig);
            break;
        case 'table':
            if (value.type !== expected.ref || !limitsMatch(value.e.length, value.max, expected))
                throw W.incompatible(entry);
            break;
        case 'memory':
            if (!limitsMatch(value.pages, value.max, expected))
                throw W.incompatible(entry);
            break;
        case 'global':
            if (value.type !== expected.type || value.mutable !== expected.mutable)
                throw W.incompatible(entry);
            break;
        }
        return value;
    }

    // A module checked and translated already (compiled - from compileModule).
    W.instantiate = function (session, module, compiled, source) {
        var env = session.env;
        var data = { f: [], m: [], t: [], g: [], e: [], d: [], k: compiled.consts };
        var instance = { module: module, exports: {}, data: data, chunk: null, id: module.id };
        // The memory for WASI and js.string: the export "memory" or memory 0.
        var context = {
            memory: function () {
                var exported = instance.exports.memory;
                if (exported !== undefined && exported.kind === 'memory')
                    return exported.value;
                return data.m[0] || null;
            }
        };
        module.imports.forEach(function (entry) {
            var value = link(session, module, entry, context);
            var space = { func: 'f', table: 't', memory: 'm', global: 'g' }[entry.kind];
            data[space][entry.index] = value;
        });
        module.mems.forEach(function (memory, index) {
            if (memory.import === null) {
                if (memory.type.min > rt.MAX_PAGES)
                    throw new rt.Trap('memory of ' + memory.type.min + ' pages is too large (at most ' + rt.MAX_PAGES + ')');
                data.m[index] = new rt.Memory(memory.type.min, memory.type.max);
            }
        });
        module.tables.forEach(function (table, index) {
            if (table.import === null)
                data.t[index] = new rt.Table(table.type.ref, table.type.min, table.type.max);
        });
        module.globals.forEach(function (item, index) {
            if (item.import === null && compiled.globalCells[index])
                data.g[index] = new rt.Global(item.type.type, item.type.mutable, W.isRef(item.type.type) ? null : 0);
        });
        module.datas.forEach(function (segment, index) {
            data.d[index] = segment.bytes;
        });
        var chunk = env.compileChunk(compiled.statements, ['$W', '$T', '$D'], [rt, T, data], source || '');
        instance.chunk = chunk;
        instance.funcs = chunk.funcs;
        module.funcs.forEach(function (func, index) {
            if (func.import === null) {
                var fn = chunk.funcs[index];
                rt.markFunction(fn, module.types[func.typeIndex]);
                if (func.name)
                    fn.$name = func.name;
            }
        });
        module.exports.forEach(function (entry) {
            var value;
            switch (entry.kind) {
            case 'func': value = chunk.funcs[entry.index]; break;
            case 'table': value = data.t[entry.index]; break;
            case 'memory': value = data.m[entry.index]; break;
            case 'global': value = data.g[entry.index]; break;
            }
            instance.exports[entry.name] = { kind: entry.kind, value: value };
        });
        chunk.init();
        var offsets = chunk.offsets();
        module.elems.forEach(function (segment, index) {
            if (segment.mode === 'active') {
                var values = data.e[index];
                data.t[segment.table].init(values, offsets.elems[index], 0, values.length);
                data.e[index] = [];
            } else if (segment.mode === 'declarative') {
                data.e[index] = [];
            }
        });
        module.datas.forEach(function (segment, index) {
            if (segment.mode === 'active') {
                var bytes = data.d[index];
                data.m[segment.memory].init(bytes, offsets.datas[index], 0, bytes.length);
                data.d[index] = [];
            }
        });
        if (module.start !== null)
            chunk.funcs[module.start.index]();
        return instance;
    };

    // A module from text: parsing, checking, translation (without running).
    W.prepareModule = function (fields, options) {
        var module = W.parseModule(fields, options);
        W.validate(module, options.source);
        var compiled = W.compileModule(module, options.source);
        return { module: module, compiled: compiled };
    };
})(globalThis);
