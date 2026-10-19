// WAT: the WebAssembly 2.0 instructions without SIMD - the binary code,
// the kind of the immediate operands and the types of simple instructions.
//
// W.OPS[name] = { name, code (0xFC00 + n for the prefix 0xFC), imm,
// params, results }. imm: '' - no operands; parser.js and binary.js parse
// the other kinds. params/results - only for instructions with fixed types.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var W = T.wat;
    if (W.OPS)
        return;

    var OPS = {};
    var BY_CODE = {};

    function op(name, code, imm, params, results) {
        var entry = { name: name, code: code, imm: imm || '', params: params || null, results: results || null };
        OPS[name] = entry;
        BY_CODE[code] = entry;
    }

    // Control and other instructions with special types.
    op('unreachable', 0x00);
    op('nop', 0x01, '', [], []);
    op('block', 0x02, 'block');
    op('loop', 0x03, 'block');
    op('if', 0x04, 'block');
    op('br', 0x0C, 'label');
    op('br_if', 0x0D, 'label');
    op('br_table', 0x0E, 'labels');
    op('return', 0x0F);
    op('call', 0x10, 'func');
    op('call_indirect', 0x11, 'call_indirect');
    op('drop', 0x1A);
    op('select', 0x1B, 'select');
    op('local.get', 0x20, 'local');
    op('local.set', 0x21, 'local');
    op('local.tee', 0x22, 'local');
    op('global.get', 0x23, 'global');
    op('global.set', 0x24, 'global');
    op('table.get', 0x25, 'table');
    op('table.set', 0x26, 'table');
    op('memory.size', 0x3F, 'memory', [], ['i32']);
    op('memory.grow', 0x40, 'memory', ['i32'], ['i32']);
    op('i32.const', 0x41, 'i32', [], ['i32']);
    op('i64.const', 0x42, 'i64', [], ['i64']);
    op('f32.const', 0x43, 'f32', [], ['f32']);
    op('f64.const', 0x44, 'f64', [], ['f64']);
    op('ref.null', 0xD0, 'heaptype');
    op('ref.is_null', 0xD1);
    op('ref.func', 0xD2, 'func');

    // Memory: [name, code, value type, width in bytes (2^align)].
    var memory = [
        ['i32.load', 0x28, 'i32', 2], ['i64.load', 0x29, 'i64', 3], ['f32.load', 0x2A, 'f32', 2], ['f64.load', 0x2B, 'f64', 3],
        ['i32.load8_s', 0x2C, 'i32', 0], ['i32.load8_u', 0x2D, 'i32', 0], ['i32.load16_s', 0x2E, 'i32', 1],
        ['i32.load16_u', 0x2F, 'i32', 1], ['i64.load8_s', 0x30, 'i64', 0], ['i64.load8_u', 0x31, 'i64', 0],
        ['i64.load16_s', 0x32, 'i64', 1], ['i64.load16_u', 0x33, 'i64', 1], ['i64.load32_s', 0x34, 'i64', 2],
        ['i64.load32_u', 0x35, 'i64', 2]
    ];
    memory.forEach(function (item) {
        op(item[0], item[1], 'memarg', ['i32'], [item[2]]);
        OPS[item[0]].natural = item[3];
    });
    var stores = [
        ['i32.store', 0x36, 'i32', 2], ['i64.store', 0x37, 'i64', 3], ['f32.store', 0x38, 'f32', 2], ['f64.store', 0x39, 'f64', 3],
        ['i32.store8', 0x3A, 'i32', 0], ['i32.store16', 0x3B, 'i32', 1], ['i64.store8', 0x3C, 'i64', 0],
        ['i64.store16', 0x3D, 'i64', 1], ['i64.store32', 0x3E, 'i64', 2]
    ];
    stores.forEach(function (item) {
        op(item[0], item[1], 'memarg', ['i32', item[2]], []);
        OPS[item[0]].natural = item[3];
    });

    // Numbers: families in the order of the codes.
    function family(prefix, start, names, params, results) {
        names.forEach(function (name, index) {
            op(prefix + '.' + name, start + index, '', params, results);
        });
    }
    family('i32', 0x45, ['eqz'], ['i32'], ['i32']);
    family('i32', 0x46, ['eq', 'ne', 'lt_s', 'lt_u', 'gt_s', 'gt_u', 'le_s', 'le_u', 'ge_s', 'ge_u'], ['i32', 'i32'], ['i32']);
    family('i64', 0x50, ['eqz'], ['i64'], ['i32']);
    family('i64', 0x51, ['eq', 'ne', 'lt_s', 'lt_u', 'gt_s', 'gt_u', 'le_s', 'le_u', 'ge_s', 'ge_u'], ['i64', 'i64'], ['i32']);
    family('f32', 0x5B, ['eq', 'ne', 'lt', 'gt', 'le', 'ge'], ['f32', 'f32'], ['i32']);
    family('f64', 0x61, ['eq', 'ne', 'lt', 'gt', 'le', 'ge'], ['f64', 'f64'], ['i32']);
    family('i32', 0x67, ['clz', 'ctz', 'popcnt'], ['i32'], ['i32']);
    family('i32', 0x6A, ['add', 'sub', 'mul', 'div_s', 'div_u', 'rem_s', 'rem_u', 'and', 'or', 'xor', 'shl', 'shr_s',
                         'shr_u', 'rotl', 'rotr'], ['i32', 'i32'], ['i32']);
    family('i64', 0x79, ['clz', 'ctz', 'popcnt'], ['i64'], ['i64']);
    family('i64', 0x7C, ['add', 'sub', 'mul', 'div_s', 'div_u', 'rem_s', 'rem_u', 'and', 'or', 'xor', 'shl', 'shr_s',
                         'shr_u', 'rotl', 'rotr'], ['i64', 'i64'], ['i64']);
    family('f32', 0x8B, ['abs', 'neg', 'ceil', 'floor', 'trunc', 'nearest', 'sqrt'], ['f32'], ['f32']);
    family('f32', 0x92, ['add', 'sub', 'mul', 'div', 'min', 'max', 'copysign'], ['f32', 'f32'], ['f32']);
    family('f64', 0x99, ['abs', 'neg', 'ceil', 'floor', 'trunc', 'nearest', 'sqrt'], ['f64'], ['f64']);
    family('f64', 0xA0, ['add', 'sub', 'mul', 'div', 'min', 'max', 'copysign'], ['f64', 'f64'], ['f64']);

    // Conversions: the name 'to.op_from' -> the types by the name.
    var conversions = [
        'i32.wrap_i64', 'i32.trunc_f32_s', 'i32.trunc_f32_u', 'i32.trunc_f64_s', 'i32.trunc_f64_u', 'i64.extend_i32_s',
        'i64.extend_i32_u', 'i64.trunc_f32_s', 'i64.trunc_f32_u', 'i64.trunc_f64_s', 'i64.trunc_f64_u',
        'f32.convert_i32_s', 'f32.convert_i32_u', 'f32.convert_i64_s', 'f32.convert_i64_u', 'f32.demote_f64',
        'f64.convert_i32_s', 'f64.convert_i32_u', 'f64.convert_i64_s', 'f64.convert_i64_u', 'f64.promote_f32',
        'i32.reinterpret_f32', 'i64.reinterpret_f64', 'f32.reinterpret_i32', 'f64.reinterpret_i64'
    ];
    function sourceType(name) {
        return /_([if](32|64))(_[su])?$/.exec(name)[1];
    }
    conversions.forEach(function (name, index) {
        op(name, 0xA7 + index, '', [sourceType(name)], [name.substring(0, 3)]);
    });
    op('i32.extend8_s', 0xC0, '', ['i32'], ['i32']);
    op('i32.extend16_s', 0xC1, '', ['i32'], ['i32']);
    op('i64.extend8_s', 0xC2, '', ['i64'], ['i64']);
    op('i64.extend16_s', 0xC3, '', ['i64'], ['i64']);
    op('i64.extend32_s', 0xC4, '', ['i64'], ['i64']);
    ['i32.trunc_sat_f32_s', 'i32.trunc_sat_f32_u', 'i32.trunc_sat_f64_s', 'i32.trunc_sat_f64_u',
     'i64.trunc_sat_f32_s', 'i64.trunc_sat_f32_u', 'i64.trunc_sat_f64_s', 'i64.trunc_sat_f64_u'].forEach(function (name, index) {
        op(name, 0xFC00 + index, '', [sourceType(name)], [name.substring(0, 3)]);
    });

    // The prefix 0xFC: bulk operations on memory and tables.
    op('memory.init', 0xFC08, 'data', ['i32', 'i32', 'i32'], []);
    op('data.drop', 0xFC09, 'data', [], []);
    op('memory.copy', 0xFC0A, 'memory2', ['i32', 'i32', 'i32'], []);
    op('memory.fill', 0xFC0B, 'memory', ['i32', 'i32', 'i32'], []);
    op('table.init', 0xFC0C, 'table_init');
    op('elem.drop', 0xFC0D, 'elem', [], []);
    op('table.copy', 0xFC0E, 'table_copy');
    op('table.grow', 0xFC0F, 'table');
    op('table.size', 0xFC10, 'table', [], ['i32']);
    op('table.fill', 0xFC11, 'table');

    // Old instruction names (before 2019) - an error with a hint.
    W.OBSOLETE = {
        'get_local': 'local.get', 'set_local': 'local.set', 'tee_local': 'local.tee', 'get_global': 'global.get',
        'set_global': 'global.set', 'current_memory': 'memory.size', 'grow_memory': 'memory.grow'
    };

    W.OPS = OPS;
    W.OPS_BY_CODE = BY_CODE;
    W.VALUE_TYPES = { i32: true, i64: true, f32: true, f64: true, funcref: true, externref: true };
    W.isRef = function (type) {
        return type === 'funcref' || type === 'externref';
    };
})(globalThis);
