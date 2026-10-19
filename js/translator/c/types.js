// C: types, sizes and alignment (as on 64-bit Linux: long and pointers
// are 8 bytes), struct layout, promotions and the usual arithmetic
// conversions.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var C = T.c;
    if (C.types)
        return;

    function integer(name, size, signed, rank, num) {
        return { kind: 'int', name: name, size: size, align: size, signed: signed, rank: rank, num: num };
    }

    var types = {
        void: { kind: 'void', name: 'void', size: 1, align: 1 },
        bool: integer('_Bool', 1, false, 0, 'u8'),
        char: integer('char', 1, true, 1, 'i8'),
        schar: integer('signed char', 1, true, 1, 'i8'),
        uchar: integer('unsigned char', 1, false, 1, 'u8'),
        short: integer('short', 2, true, 2, 'i16'),
        ushort: integer('unsigned short', 2, false, 2, 'u16'),
        int: integer('int', 4, true, 3, 'i32'),
        uint: integer('unsigned int', 4, false, 3, 'u32'),
        long: integer('long', 8, true, 4, 'i64'),
        ulong: integer('unsigned long', 8, false, 4, 'u64'),
        llong: integer('long long', 8, true, 5, 'i64'),
        ullong: integer('unsigned long long', 8, false, 5, 'u64'),
        float: { kind: 'float', name: 'float', size: 4, align: 4, num: 'f32' },
        double: { kind: 'float', name: 'double', size: 8, align: 8, num: 'f64' },
        ldouble: { kind: 'float', name: 'long double', size: 8, align: 8, num: 'f64' },
        // A JavaScript value (js_value): a handle pointer.
        valist: { kind: 'valist', name: 'va_list', size: 8, align: 8 }
    };
    C.types = types;

    // A set of specifier words -> a type.
    var WORD_SETS = {
        'void': 'void', '_Bool': 'bool', 'char': 'char', 'signed char': 'schar', 'unsigned char': 'uchar',
        'short': 'short', 'short int': 'short', 'signed short': 'short', 'signed short int': 'short',
        'unsigned short': 'ushort', 'unsigned short int': 'ushort',
        'int': 'int', 'signed': 'int', 'signed int': 'int',
        'unsigned': 'uint', 'unsigned int': 'uint',
        'long': 'long', 'long int': 'long', 'signed long': 'long', 'signed long int': 'long',
        'unsigned long': 'ulong', 'unsigned long int': 'ulong',
        'long long': 'llong', 'long long int': 'llong', 'signed long long': 'llong', 'signed long long int': 'llong',
        'unsigned long long': 'ullong', 'unsigned long long int': 'ullong',
        'float': 'float', 'double': 'double', 'long double': 'ldouble'
    };
    var WORD_ORDER = ['signed', 'unsigned', 'short', 'long', 'char', 'int', '_Bool', 'float', 'double', 'void', '_Complex'];

    C.typeFromWords = function (words) {
        var sorted = words.slice().sort(function (left, right) {
            return WORD_ORDER.indexOf(left) - WORD_ORDER.indexOf(right);
        });
        var key = sorted.join(' ');
        var name = WORD_SETS[key];
        return name === undefined ? null : types[name];
    };

    C.pointer = function (to) {
        return { kind: 'pointer', to: to, size: 8, align: 8 };
    };

    C.array = function (of, length) {
        var size = length === null || length < 0 ? 0 : of.size * length;
        return { kind: 'array', of: of, length: length, size: size, align: of.align };
    };

    C.functionType = function (returns, params, variadic, unspecified) {
        return { kind: 'function', returns: returns, params: params, variadic: !!variadic, unspecified: !!unspecified,
                 size: 1, align: 1 };
    };

    var recordCounter = 0;
    C.record = function (kind, tag) {
        return { kind: kind, tag: tag, fields: null, size: 0, align: 1, complete: false, id: ++recordCounter };
    };

    C.enumType = function (tag) {
        return { kind: 'enum', tag: tag, size: 4, align: 4, signed: true, rank: 3, num: 'i32', complete: false,
                 name: 'enum ' + (tag || '(anonymous)') };
    };

    // Layout: fields { name, type, bits }; the result is offset, and for
    // bit fields also bitOffset and bits.
    C.layoutRecord = function (record, fields) {
        var offset = 0, align = 1, size = 0;
        var bitUnit = null;
        var laid = [];
        fields.forEach(function (field) {
            var type = field.type;
            if (field.bits !== null && field.bits !== undefined) {
                var unitSize = type.size;
                if (field.bits === 0) {
                    bitUnit = null;
                    offset = Math.ceil(offset / unitSize) * unitSize;
                    return;
                }
                if (record.kind === 'union') {
                    laid.push({ name: field.name, type: type, offset: 0, bitOffset: 0, bits: field.bits });
                    size = Math.max(size, unitSize);
                    align = Math.max(align, type.align);
                    return;
                }
                // The field fits into the current cell of its type - it goes there.
                if (bitUnit !== null && bitUnit.size === unitSize && bitUnit.used + field.bits <= unitSize * 8) {
                    laid.push({ name: field.name, type: type, offset: bitUnit.offset, bitOffset: bitUnit.used, bits: field.bits });
                    bitUnit.used += field.bits;
                } else {
                    offset = Math.ceil(offset / type.align) * type.align;
                    bitUnit = { offset: offset, size: unitSize, used: field.bits };
                    laid.push({ name: field.name, type: type, offset: offset, bitOffset: 0, bits: field.bits });
                    offset += unitSize;
                }
                align = Math.max(align, type.align);
                return;
            }
            bitUnit = null;
            if (record.kind === 'union') {
                laid.push({ name: field.name, type: type, offset: 0, bits: null });
                size = Math.max(size, type.size);
            } else {
                offset = Math.ceil(offset / type.align) * type.align;
                laid.push({ name: field.name, type: type, offset: offset, bits: null });
                offset += type.size;
            }
            align = Math.max(align, type.align);
        });
        if (record.kind !== 'union')
            size = offset;
        record.fields = laid;
        record.align = align;
        record.size = Math.ceil(size / align) * align;
        record.complete = true;
    };

    C.isInteger = function (type) {
        return type.kind === 'int' || type.kind === 'enum';
    };
    C.isFloat = function (type) {
        return type.kind === 'float';
    };
    C.isArithmetic = function (type) {
        return C.isInteger(type) || C.isFloat(type);
    };
    C.isPointer = function (type) {
        return type.kind === 'pointer';
    };
    C.isScalar = function (type) {
        return C.isArithmetic(type) || type.kind === 'pointer';
    };
    C.isRecord = function (type) {
        return type.kind === 'struct' || type.kind === 'union';
    };
    C.isVoid = function (type) {
        return type.kind === 'void';
    };

    // Integer promotion: everything up to int becomes int.
    C.promote = function (type) {
        if (type.kind === 'enum')
            return types.int;
        if (type.kind === 'int' && type.rank < 3)
            return types.int;
        return type;
    };

    // The usual arithmetic conversions.
    C.commonType = function (left, right) {
        if (left.kind === 'float' || right.kind === 'float') {
            if (left === types.ldouble || right === types.ldouble)
                return types.ldouble;
            if (left === types.double || right === types.double)
                return types.double;
            return types.float;
        }
        left = C.promote(left);
        right = C.promote(right);
        if (left === right)
            return left;
        if (left.signed === right.signed)
            return left.rank >= right.rank ? left : right;
        var unsigned = left.signed ? right : left;
        var signed = left.signed ? left : right;
        if (unsigned.rank >= signed.rank)
            return unsigned;
        if (signed.size > unsigned.size)
            return signed;
        // A signed type of the same size - its unsigned variant.
        return signed === types.long ? types.ulong : (signed === types.llong ? types.ullong : types.uint);
    };

    C.compatible = function (left, right) {
        if (left === right)
            return true;
        if (left.kind !== right.kind)
            return (left.kind === 'enum' && right === types.int) || (right.kind === 'enum' && left === types.int);
        switch (left.kind) {
        case 'pointer':
            return C.compatible(left.to, right.to);
        case 'array':
            return (left.length === null || right.length === null || left.length === right.length) &&
                C.compatible(left.of, right.of);
        case 'function':
            if (!C.compatible(left.returns, right.returns))
                return false;
            if (left.unspecified || right.unspecified)
                return true;
            return left.params.length === right.params.length && left.variadic === right.variadic &&
                left.params.every(function (param, index) { return C.compatible(param, right.params[index]); });
        case 'int':
        case 'float':
            return left.name === right.name;
        }
        return left === right;
    };

    C.typeString = function (type) {
        switch (type.kind) {
        case 'void':
        case 'int':
        case 'float':
            return type.name;
        case 'valist':
            return 'va_list';
        case 'enum':
            return type.name;
        case 'struct':
        case 'union':
            return type.kind + ' ' + (type.tag || '(anonymous)');
        case 'pointer':
            if (type.to.kind === 'function')
                return C.typeString(type.to.returns) + ' (*)(' + paramsString(type.to) + ')';
            if (type.to.kind === 'array')
                return C.typeString(type.to.of) + ' (*)[' + type.to.length + ']';
            return C.typeString(type.to) + ' *';
        case 'array':
            return C.typeString(type.of) + ' [' + (type.length === null ? '' : type.length) + ']';
        case 'function':
            return C.typeString(type.returns) + ' (' + paramsString(type) + ')';
        }
        return '?';
    };

    function paramsString(fn) {
        var parts = fn.params.map(C.typeString);
        if (fn.variadic)
            parts.push('...');
        if (parts.length === 0 && !fn.unspecified)
            parts.push('void');
        return parts.join(', ');
    }

    // The kind of a number for T.ops; a pointer is 'ptr' (a number without truncation).
    C.numKind = function (type) {
        if (type.kind === 'int' || type.kind === 'enum' || type.kind === 'float')
            return type.num;
        if (type.kind === 'pointer')
            return 'ptr';
        return null;
    };
})(globalThis);
