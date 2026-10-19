// Pascal: types. A type is an object with kind; a type has run-time helpers
// (zero, clone, assign) - the translated code calls them through chunk
// constants. The representation of values: docs/internals/pascal.md.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Pascal = T.pascal;
    if (Pascal.types)
        return;

    var big = T.big;
    var MAX_SAFE = 9007199254740991;

    var typeCounter = 0;

    function Type(kind, props) {
        this.kind = kind;
        this.id = ++typeCounter;
        for (var key in props) {
            if (Object.prototype.hasOwnProperty.call(props, key))
                this[key] = props[key];
        }
    }
    Pascal.Type = Type;

    // --- Integers

    var INT_KINDS = {
        i8: { lo: -128, hi: 127, size: 1 },
        u8: { lo: 0, hi: 255, size: 1 },
        i16: { lo: -32768, hi: 32767, size: 2 },
        u16: { lo: 0, hi: 65535, size: 2 },
        i32: { lo: -2147483648, hi: 2147483647, size: 4 },
        u32: { lo: 0, hi: 4294967295, size: 4 },
        i64: { lo: big.neg(big.pow(2, 63)), hi: big.sub(big.pow(2, 63), 1), size: 8 },
        u64: { lo: 0, hi: big.sub(big.pow(2, 64), 1), size: 8 }
    };

    function intType(name, ik) {
        var spec = INT_KINDS[ik];
        return new Type('int', { name: name, ik: ik, lo: spec.lo, hi: spec.hi, size: spec.size });
    }

    var t = {};
    t.shortint = intType('ShortInt', 'i8');
    t.byte = intType('Byte', 'u8');
    t.smallint = intType('SmallInt', 'i16');
    t.word = intType('Word', 'u16');
    t.longint = intType('LongInt', 'i32');
    t.cardinal = intType('Cardinal', 'u32');
    t.int64 = intType('Int64', 'i64');
    t.qword = intType('QWord', 'u64');

    t.boolean = new Type('bool', { name: 'Boolean', size: 1 });
    t.bytebool = new Type('bool', { name: 'ByteBool', size: 1 });
    t.wordbool = new Type('bool', { name: 'WordBool', size: 2 });
    t.longbool = new Type('bool', { name: 'LongBool', size: 4 });

    t.char = new Type('char', { name: 'Char', lo: 0, hi: 255, size: 1 });
    t.widechar = new Type('char', { name: 'WideChar', lo: 0, hi: 65535, size: 2, wide: true });

    t.single = new Type('real', { name: 'Single', rk: 'f32', size: 4 });
    t.double = new Type('real', { name: 'Double', rk: 'f64', size: 8 });
    // Extended is stored as a Double; printed in the Extended format.
    t.extended = new Type('real', { name: 'Extended', rk: 'f80', size: 10 });
    t.real = t.double;
    t.comp = new Type('real', { name: 'Comp', rk: 'f80', print: 'comp', size: 8 });
    t.currency = new Type('real', { name: 'Currency', rk: 'f64', print: 'currency', size: 8 });

    t.ansistring = new Type('string', { name: 'AnsiString', short: null, size: 8 });
    t.shortstring = new Type('string', { name: 'ShortString', short: 255, size: 256 });

    t.pointer = new Type('pointer', { name: 'Pointer', to: null, size: 8 });
    t.nil = new Type('nil', { name: 'Pointer', size: 8 });
    t.js = new Type('js', { name: 'JSValue', size: 8 });
    t.variant = t.js;
    t.text = new Type('file', { name: 'Text', of: null, text: true, size: 8 });
    t.file = new Type('file', { name: 'File', of: null, text: false, size: 8 });
    t.void = new Type('void', { name: 'untyped', size: 0 });
    // The type of the expression [a, b..c] while it is unknown which set is needed.
    t.emptyset = new Type('set', { name: 'set', of: null, lo: 0, hi: -1, small: true, size: 32 });
    Pascal.t = t;

    // The integer type for a subrange lo..hi (as FPC: the smallest in size).
    function intKindFor(lo, hi) {
        if (big.cmp(lo, 0) >= 0) {
            if (big.cmp(hi, 255) <= 0)
                return 'u8';
            if (big.cmp(hi, 65535) <= 0)
                return 'u16';
            if (big.cmp(hi, 4294967295) <= 0)
                return 'u32';
            if (big.cmp(hi, INT_KINDS.i64.hi) <= 0)
                return 'i64';
            return 'u64';
        }
        if (big.cmp(lo, -128) >= 0 && big.cmp(hi, 127) <= 0)
            return 'i8';
        if (big.cmp(lo, -32768) >= 0 && big.cmp(hi, 32767) <= 0)
            return 'i16';
        if (big.cmp(lo, -2147483648) >= 0 && big.cmp(hi, 2147483647) <= 0)
            return 'i32';
        return 'i64';
    }
    Pascal.intKindFor = intKindFor;

    // A subrange of a base ordinal type.
    function subrange(base, lo, hi, name) {
        if (base.kind === 'int') {
            var ik = intKindFor(lo, hi);
            return new Type('int', { name: name || null, ik: ik, lo: lo, hi: hi, size: INT_KINDS[ik].size, subrangeOf: base });
        }
        if (base.kind === 'char')
            return new Type('char', { name: name || null, lo: lo, hi: hi, size: base.size, wide: base.wide, subrangeOf: base.subrangeOf || base });
        if (base.kind === 'enum')
            return new Type('enum', { name: name || null, items: base.items, lo: lo, hi: hi, size: base.size,
                                      subrangeOf: base.subrangeOf || base });
        if (base.kind === 'bool')
            return new Type('bool', { name: name || null, lo: lo, hi: hi, size: 1, subrangeOf: base });
        throw new Error('bad subrange base');
    }
    Pascal.subrange = subrange;

    // --- Type properties

    var types = {
        isOrdinal: function (type) {
            return type.kind === 'int' || type.kind === 'char' || type.kind === 'bool' || type.kind === 'enum';
        },
        isInteger: function (type) {
            return type.kind === 'int';
        },
        isReal: function (type) {
            return type.kind === 'real';
        },
        isNumeric: function (type) {
            return type.kind === 'int' || type.kind === 'real';
        },
        isString: function (type) {
            return type.kind === 'string';
        },
        isStringLike: function (type) {
            return type.kind === 'string' || type.kind === 'char';
        },
        isWide: function (type) {
            return type.kind === 'int' && (type.ik === 'i64' || type.ik === 'u64');
        },
        // Values are objects with a constant identity: an assignment copies into them.
        isAggregate: function (type) {
            return type.kind === 'record' || type.kind === 'array' || (type.kind === 'class' && type.isObject === true);
        },
        isClass: function (type) {
            return type.kind === 'class' && !type.isObject;
        },
        // Reference values that have nil.
        isNullable: function (type) {
            return type.kind === 'pointer' || type.kind === 'nil' || (type.kind === 'class' && !type.isObject) ||
                type.kind === 'classref' || type.kind === 'proc' || type.kind === 'js';
        },
        // The bounds of an ordinal type: [lo, hi] - numbers or T.big.
        lo: function (type) {
            switch (type.kind) {
            case 'int':
            case 'char':
                return type.lo;
            case 'bool':
                return type.lo !== undefined ? type.lo : 0;
            case 'enum':
                return type.lo;
            }
            return 0;
        },
        hi: function (type) {
            switch (type.kind) {
            case 'int':
            case 'char':
                return type.hi;
            case 'bool':
                return type.hi !== undefined ? type.hi : 1;
            case 'enum':
                return type.hi;
            }
            return 0;
        },
        // The base of a subrange.
        base: function (type) {
            return type.subrangeOf || type;
        },
        // The number of elements of an ordinal type (for arrays and sets).
        count: function (type) {
            return big.toFloat(big.sub(types.hi(type), types.lo(type))) + 1;
        },
        // The kind of a number for the core operations (i8...u64, f32, f64).
        numberKind: function (type) {
            if (type.kind === 'int')
                return type.ik;
            if (type.kind === 'real')
                return type.rk === 'f32' ? 'f32' : 'f64';
            if (type.kind === 'char')
                return type.wide ? 'u16' : 'u8';
            if (type.kind === 'enum')
                return 'i32';
            return null;
        },
        sizeOf: function (type) {
            switch (type.kind) {
            case 'array':
                return type.length * types.sizeOf(type.of);
            case 'record':
                return recordSize(type);
            case 'set':
                return type.small ? 4 : 32;
            case 'enum':
                return type.size || 4;
            case 'class':
                return 8;
            }
            return type.size !== undefined ? type.size : 8;
        },
        alignOf: function (type) {
            switch (type.kind) {
            case 'array':
                return types.alignOf(type.of);
            case 'record':
                return type.fields.reduce(function (most, field) { return Math.max(most, types.alignOf(field.type)); }, 1);
            case 'string':
                return type.short !== null ? 1 : 8;
            case 'set':
                return type.small ? 4 : 1;
            case 'real':
                return type.rk === 'f80' ? 16 : type.size;
            }
            return Math.min(8, Math.max(1, types.sizeOf(type)));
        }
    };
    Pascal.types = types;

    function recordSize(type) {
        if (type.computedSize !== undefined)
            return type.computedSize;
        var offset = 0;
        var align = 1;
        var place = function (fields) {
            fields.forEach(function (field) {
                var fieldAlign = type.packed ? 1 : types.alignOf(field.type);
                align = Math.max(align, fieldAlign);
                offset = Math.ceil(offset / fieldAlign) * fieldAlign + types.sizeOf(field.type);
            });
        };
        place(type.fields.filter(function (field) { return !field.variant; }));
        if (type.variantFields !== undefined) {
            var start = offset, largest = offset;
            type.variantFields.forEach(function (group) {
                offset = start;
                place(group);
                largest = Math.max(largest, offset);
            });
            offset = largest;
        }
        if (!type.packed)
            offset = Math.ceil(offset / align) * align;
        type.computedSize = offset;
        return offset;
    }

    // --- A type name for messages (as FPC)

    types.display = function (type) {
        if (type === null || type === undefined)
            return 'untyped';
        if (type.name)
            return type.name;
        switch (type.kind) {
        case 'int':
        case 'char':
        case 'enum':
        case 'bool':
            return type.subrangeOf ? types.display(type.subrangeOf) : type.kind;
        case 'string':
            return type.short !== null ? 'ShortString' : 'AnsiString';
        case 'array':
            return 'Array[' + big.str(types.lo(type.index)) + '..' + big.str(types.hi(type.index)) + '] Of ' + types.display(type.of);
        case 'dynarray':
            return '{Dynamic} Array Of ' + types.display(type.of);
        case 'openarray':
            return '{Open} Array Of ' + types.display(type.of);
        case 'arrayofconst':
            return 'Array Of Const';
        case 'set':
            return type.of === null ? 'Set' : 'Set Of ' + types.display(type.of);
        case 'pointer':
            return type.to === null ? 'Pointer' : '^' + types.display(type.to);
        case 'record':
            return '<record type>';
        case 'proc':
            return '<procedure variable type of ' + (type.result ? 'function' : 'procedure') + '(' +
                type.params.map(function (param) { return (param.mode ? param.mode.charAt(0).toUpperCase() + param.mode.substring(1) + ' ' : '') + types.display(param.type); }).join(';') + ')' +
                (type.result ? ':' + types.display(type.result) : '') + (type.ofObject ? ' of object' : '') + ';Register>';
        case 'classref':
            return 'Class Of ' + types.display(type.of);
        case 'file':
            return type.text ? 'Text' : (type.of ? 'File Of ' + types.display(type.of) : 'File');
        case 'nil':
            return 'Pointer';
        case 'js':
            return 'JSValue';
        }
        return type.kind;
    };

    // --- Default values and copies (run-time helpers)

    var TYPED_ARRAYS = {
        i8: global.Int8Array, u8: global.Uint8Array, i16: global.Int16Array, u16: global.Uint16Array,
        i32: global.Int32Array, u32: global.Uint32Array, f32: global.Float32Array, f64: global.Float64Array
    };

    // The typed array constructor for the elements of a type or null.
    types.typedArray = function (type) {
        if (type.kind === 'int' && type.ik !== 'i64' && type.ik !== 'u64')
            return TYPED_ARRAYS[type.ik];
        if (type.kind === 'char')
            return type.wide ? TYPED_ARRAYS.u16 : TYPED_ARRAYS.u8;
        if (type.kind === 'real')
            return type.rk === 'f32' ? TYPED_ARRAYS.f32 : TYPED_ARRAYS.f64;
        if (type.kind === 'enum')
            return TYPED_ARRAYS.i32;
        return null;
    };

    // The zero value of a type (as the global variables of FPC).
    Type.prototype.zero = function () {
        switch (this.kind) {
        case 'int':
        case 'char':
        case 'enum':
        case 'real':
            return 0;
        case 'bool':
            return false;
        case 'string':
            return '';
        case 'set':
            return this.small ? 0 : EMPTY_BIG_SET;
        case 'array':
            return this.makeArray();
        case 'dynarray':
            return this.empty();
        case 'record':
            return this.makeRecord();
        case 'class':
            return this.isObject ? this.makeObject() : null;
        case 'file':
            return this.makeFile();
        case 'js':
            return null;
        }
        return null;
    };

    var EMPTY_BIG_SET = [0, 0, 0, 0, 0, 0, 0, 0];
    Object.freeze(EMPTY_BIG_SET);
    Pascal.EMPTY_BIG_SET = EMPTY_BIG_SET;

    // An empty dynamic array (nil): shared by the type, length 0.
    Type.prototype.empty = function () {
        if (this.emptyValue === undefined) {
            var Typed = types.typedArray(this.of);
            this.emptyValue = Typed ? new Typed(0) : [];
            Object.freeze(this.emptyValue);
        }
        return this.emptyValue;
    };

    // An array of the given length of the zero values of the element.
    Type.prototype.newArray = function (length) {
        var Typed = types.typedArray(this.of);
        if (Typed)
            return new Typed(length);
        var element = this.of;
        var result = new Array(length);
        var simple = !types.isAggregate(element) && element.kind !== 'file' && element.kind !== 'dynarray';
        if (simple) {
            var value = element.zero();
            for (var index = 0; index < length; ++index)
                result[index] = value;
        } else {
            for (var at = 0; at < length; ++at)
                result[at] = element.zero();
        }
        return result;
    };

    Type.prototype.makeArray = function () {
        return this.newArray(this.length);
    };

    Type.prototype.makeRecord = function () {
        var object = new (this.recordConstructor())();
        return object;
    };

    // The constructor of record objects: the fields in one order (one hidden class).
    Type.prototype.recordConstructor = function () {
        if (this.ctor !== undefined)
            return this.ctor;
        var fields = this.allFields();
        var record = this;
        var Ctor = function () {
            for (var index = 0; index < fields.length; ++index)
                this[fields[index].js] = fields[index].type.zero();
        };
        Ctor.prototype.$type = record;
        this.ctor = Ctor;
        return Ctor;
    };

    Type.prototype.allFields = function () {
        if (this.kind !== 'record')
            return [];
        return this.fields;
    };

    // A copy of an aggregate value (a record, a static array).
    Type.prototype.clone = function (value) {
        if (this.kind === 'array') {
            var element = this.of;
            if (ArrayBuffer.isView(value))
                return value.slice();
            var copy = new Array(value.length);
            for (var index = 0; index < value.length; ++index)
                copy[index] = types.isAggregate(element) ? element.clone(value[index]) : value[index];
            return copy;
        }
        if (this.kind === 'record') {
            var made = new (this.recordConstructor())();
            this.assign(made, value);
            return made;
        }
        if (this.kind === 'class' && this.isObject) {
            var object = this.makeObject();
            this.assign(object, value);
            return object;
        }
        return value;
    };

    // An assignment of an aggregate: copies the values of src into the object dst.
    Type.prototype.assign = function (dst, src) {
        if (dst === src)
            return dst;
        if (this.kind === 'array') {
            var element = this.of;
            if (ArrayBuffer.isView(dst)) {
                dst.set(src);
                return dst;
            }
            if (types.isAggregate(element)) {
                for (var index = 0; index < dst.length; ++index)
                    element.assign(dst[index], src[index]);
            } else {
                for (var at = 0; at < dst.length; ++at)
                    dst[at] = src[at];
            }
            return dst;
        }
        var fields = this.kind === 'record' ? this.fields : this.instanceFields();
        for (var fieldIndex = 0; fieldIndex < fields.length; ++fieldIndex) {
            var field = fields[fieldIndex];
            if (types.isAggregate(field.type))
                field.type.assign(dst[field.js], src[field.js]);
            else
                dst[field.js] = src[field.js];
        }
        return dst;
    };

    // The value of a typed record constant: fields by JavaScript names.
    Type.prototype.fromFields = function (values) {
        var made = this.makeRecord();
        var fields = this.fields;
        for (var index = 0; index < fields.length; ++index) {
            var field = fields[index];
            if (!Object.prototype.hasOwnProperty.call(values, field.js))
                continue;
            if (types.isAggregate(field.type))
                field.type.assign(made[field.js], values[field.js]);
            else
                made[field.js] = values[field.js];
        }
        return made;
    };

    // The value of a typed array constant from the elements in order.
    Type.prototype.build = function (items) {
        var made = this.newArray(items.length);
        var element = this.of;
        for (var index = 0; index < items.length; ++index) {
            if (types.isAggregate(element))
                element.assign(made[index], items[index]);
            else
                made[index] = items[index];
        }
        return made;
    };

    Type.prototype.makeFile = function () {
        return Pascal.makeFile ? Pascal.makeFile(this) : null;
    };

    // --- Compatibility

    // Ordinal types of one base (Integer and Byte, Char and 'a'..'z', one
    // enum).
    types.sameOrdinalBase = function (left, right) {
        if (left.kind !== right.kind)
            return false;
        if (left.kind === 'enum')
            return types.base(left) === types.base(right);
        return true;
    };

    // Equal types (for var parameters and overloads).
    types.equal = function (left, right) {
        if (left === right)
            return true;
        if (left === null || right === null || left.kind !== right.kind)
            return false;
        switch (left.kind) {
        case 'int':
            return left.ik === right.ik && big.eq(left.lo, right.lo) && big.eq(left.hi, right.hi) &&
                !left.subrangeOf === !right.subrangeOf;
        case 'char':
            return !!left.wide === !!right.wide && left.lo === right.lo && left.hi === right.hi;
        case 'bool':
            return left.size === right.size;
        case 'real':
            return left.rk === right.rk && left.name === right.name;
        case 'string':
            return left.short === right.short;
        case 'enum':
            return types.base(left) === types.base(right) && left.lo === right.lo && left.hi === right.hi;
        case 'pointer':
            return left.to === null || right.to === null ? left.to === right.to : types.equal(left.to, right.to);
        case 'dynarray':
        case 'openarray':
            return types.equal(left.of, right.of);
        case 'set':
            return left.of !== null && right.of !== null &&
                types.sameOrdinalBase(types.base(left.of), types.base(right.of));
        case 'proc':
            return types.sameSignature(left, right) && !!left.ofObject === !!right.ofObject;
        case 'classref':
            return left.of === right.of;
        case 'file':
            return left.text === right.text &&
                (left.of === right.of || (left.of && right.of && types.equal(left.of, right.of)));
        case 'js':
            return true;
        }
        return false;
    };

    types.sameSignature = function (left, right) {
        if (left.params.length !== right.params.length)
            return false;
        for (var index = 0; index < left.params.length; ++index) {
            var leftParam = left.params[index], rightParam = right.params[index];
            if ((leftParam.mode || '') !== (rightParam.mode || ''))
                return false;
            if (leftParam.type === null || rightParam.type === null) {
                if (leftParam.type !== rightParam.type)
                    return false;
                continue;
            }
            if (!types.equal(leftParam.type, rightParam.type))
                return false;
        }
        if (!left.result !== !right.result)
            return false;
        return !left.result || types.equal(left.result, right.result);
    };

    // The class classType is base or its descendant.
    types.inherits = function (classType, base) {
        for (var ancestor = classType; ancestor !== null && ancestor !== undefined; ancestor = ancestor.parent) {
            if (ancestor === base)
                return true;
        }
        return false;
    };

    // The range of values of an integer type as numbers (to choose fast arithmetic).
    types.range = function (type) {
        if (type.kind === 'int')
            return [big.toFloat(type.lo), big.toFloat(type.hi)];
        if (type.kind === 'char' || type.kind === 'enum')
            return [big.toFloat(types.lo(type)), big.toFloat(types.hi(type))];
        if (type.kind === 'bool')
            return [0, 1];
        return [-Infinity, Infinity];
    };

    types.isSafeRange = function (range) {
        return range[0] >= -MAX_SAFE && range[1] <= MAX_SAFE;
    };

    types.MAX_SAFE = MAX_SAFE;
})(globalThis);
