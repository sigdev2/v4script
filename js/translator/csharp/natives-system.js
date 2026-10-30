// C#: the natives of System - Object, ValueType, Enum, the primitive
// types (their values are JavaScript numbers, booleans and strings: the
// receiver is this), String, Array, Delegate, Nullable - and the setup of
// the primitive types for the run time (CS.typeSetup: text, equality,
// hash codes, defaults, boxes). The key of a native is Name(parameter
// types) as csc writes them; see CS.nativeKey.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    CS.natives = CS.natives || {};
    CS.typeSetup = CS.typeSetup || {};
    if (CS.natives['System.Object'])
        return;

    var natives = CS.natives;
    var setup = CS.typeSetup;
    var i64 = T.i64, u64 = T.u64, big = T.big;
    var decimal = CS.decimal;

    function rt() {
        return CS.rt;
    }

    function fail(name, message) {
        return rt().exception(name, message);
    }

    function argNull(name) {
        return fail('System.ArgumentNullException', "Value cannot be null. (Parameter '" + name + "')");
    }

    function argRange(name, message) {
        return fail('System.ArgumentOutOfRangeException', message + " (Parameter '" + name + "')");
    }

    function argError(message, name) {
        return fail('System.ArgumentException', name === undefined ? message : message + " (Parameter '" + name + "')");
    }
    CS.argNull = argNull;
    CS.argRange = argRange;
    CS.argError = argError;

    function indexRange(name) {
        return argRange(name || 'index', 'Index was out of range. Must be non-negative and less than the size of the collection.');
    }
    CS.indexRange = indexRange;

    function stringArray(items) {
        return rt().arrayOf(rt().type('System.String'), items);
    }
    CS.stringArray = stringArray;

    function unboxed(value) {
        return value !== null && typeof value === 'object' && value.$boxed === true ? value.v : value;
    }

    // --- Characters (UTF-16 code units)

    function isWhiteSpaceCode(code) {
        return code === 32 || (code >= 9 && code <= 13) || code === 0x85 || code === 0xa0 || code === 0x1680 ||
            (code >= 0x2000 && code <= 0x200a) || code === 0x2028 || code === 0x2029 || code === 0x202f || code === 0x205f ||
            code === 0x3000;
    }

    function isDigitCode(code) {
        return (code >= 48 && code <= 57) || (code >= 0x660 && code <= 0x669) || (code >= 0x6f0 && code <= 0x6f9) ||
            (code >= 0x966 && code <= 0x96f) || (code >= 0xff10 && code <= 0xff19);
    }

    function isLetterCode(code) {
        if (code < 128)
            return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
        if (code === 0xaa || code === 0xb5 || code === 0xba)
            return true;
        if (code < 0xc0 || code === 0xd7 || code === 0xf7)
            return false;
        if (code >= 0xd800 && code <= 0xdfff)
            return false;
        var text = String.fromCharCode(code);
        if (text.toUpperCase() !== text.toLowerCase())
            return true;
        return code === 0xdf || (code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf) ||
            (code >= 0x3041 && code <= 0x30ff && code !== 0x30fb && code !== 0x3099 && code !== 0x309a) ||
            (code >= 0xac00 && code <= 0xd7a3) || (code >= 0x05d0 && code <= 0x05ea) || (code >= 0x0620 && code <= 0x064a) ||
            (code >= 0x0e01 && code <= 0x0e30) || (code >= 0x0904 && code <= 0x0939) || (code >= 0x1100 && code <= 0x11ff) ||
            (code >= 0x01bb && code <= 0x01c3) || (code >= 0x0138 && code <= 0x0149);
    }

    function isUpperCode(code) {
        var text = String.fromCharCode(code);
        return text !== text.toLowerCase() && text === text.toUpperCase() || (code >= 0x2160 && code <= 0x216f);
    }

    function isLowerCode(code) {
        if (code === 0xdf || code === 0xaa || code === 0xba)
            return code === 0xdf;
        var text = String.fromCharCode(code);
        return text !== text.toUpperCase() && text === text.toLowerCase() || code === 0x138 || code === 0x149;
    }

    // Punctuation (Pc, Pd, Ps, Pe, Pi, Pf, Po) of ASCII and Latin-1, general
    // punctuation and CJK symbols.
    function isPunctuationCode(code) {
        if (code < 128)
            return '!"#%&\'()*,-./:;?@[\\]_{}'.indexOf(String.fromCharCode(code)) >= 0;
        return code === 0xa1 || code === 0xa7 || code === 0xab || code === 0xb6 || code === 0xb7 || code === 0xbb || code === 0xbf ||
            (code >= 0x2010 && code <= 0x2027) || (code >= 0x2030 && code <= 0x205e && code !== 0x2044 && code !== 0x2052) ||
            (code >= 0x3001 && code <= 0x3003) || (code >= 0x3008 && code <= 0x3011);
    }

    function isSymbolCode(code) {
        if (code < 128)
            return '$+<=>^`|~'.indexOf(String.fromCharCode(code)) >= 0;
        return (code >= 0xa2 && code <= 0xa6) || code === 0xa8 || code === 0xa9 || code === 0xac || (code >= 0xae && code <= 0xb1) ||
            code === 0xb4 || code === 0xb8 || code === 0xd7 || code === 0xf7 || (code >= 0x20a0 && code <= 0x20bf) ||
            (code >= 0x2100 && code <= 0x214f && !isLetterCode(code)) || (code >= 0x2190 && code <= 0x23ff) ||
            (code >= 0x2500 && code <= 0x27bf) || code === 0x2044 || code === 0x2052;
    }

    function isSeparatorCode(code) {
        return code === 32 || code === 0xa0 || code === 0x1680 || (code >= 0x2000 && code <= 0x200a) || code === 0x2028 ||
            code === 0x2029 || code === 0x202f || code === 0x205f || code === 0x3000;
    }

    function isControlCode(code) {
        return code < 32 || (code >= 0x7f && code < 0xa0);
    }

    var NUMBER_VALUES = { 0xb2: 2, 0xb3: 3, 0xb9: 1, 0xbc: 0.25, 0xbd: 0.5, 0xbe: 0.75 };

    function numericValue(code) {
        if (code >= 48 && code <= 57)
            return code - 48;
        if (isDigitCode(code)) {
            var bases = [0x660, 0x6f0, 0x966, 0xff10];
            for (var index = 0; index < bases.length; ++index) {
                if (code >= bases[index] && code <= bases[index] + 9)
                    return code - bases[index];
            }
        }
        if (NUMBER_VALUES[code] !== undefined)
            return NUMBER_VALUES[code];
        if (code >= 0x2160 && code <= 0x216b)
            return code - 0x215f;
        return -1;
    }

    CS.isWhiteSpaceCode = isWhiteSpaceCode;
    CS.isLetterCode = isLetterCode;
    CS.isDigitCode = isDigitCode;

    function upperChar(code) {
        var mapped = String.fromCharCode(code).toUpperCase();
        return mapped.length === 1 ? mapped.charCodeAt(0) : code;
    }

    function lowerChar(code) {
        var mapped = String.fromCharCode(code).toLowerCase();
        return mapped.length === 1 ? mapped.charCodeAt(0) : code;
    }

    function charAt(text, index) {
        if (text === null || text === undefined)
            throw argNull('s');
        if (!(index >= 0 && index < text.length))
            throw argRange('index', 'Index was out of range. Must be non-negative and less than the size of the collection.');
        return text.charCodeAt(index);
    }

    // --- Object, ValueType

    natives['System.Object'] = {
        'Equals(object)': function (other) { return this === other; },
        'ReferenceEquals(object, object)': function (left, right) {
            return (left === undefined ? null : left) === (right === undefined ? null : right);
        },
        'GetHashCode()': function () {
            switch (typeof this) {
            case 'string':
                return stringHash(this);
            case 'number':
                return this | 0;
            case 'boolean':
                return this ? 1 : 0;
            }
            return rt().identityHash(this);
        },
        'ToString()': function () { return rt().typeName(rt().typeOf(this)); },
        'GetType()': function () { return rt().typeObject(rt().typeOf(this)); },
        'MemberwiseClone()': function () {
            var copy = Object.create(Object.getPrototypeOf(this));
            var self = this;
            Object.keys(this).forEach(function (key) { copy[key] = self[key]; });
            return copy;
        }
    };

    function fieldValuesEqual(left, right) {
        if (left === right)
            return true;
        if (left === null || left === undefined || right === null || right === undefined)
            return false;
        if (typeof left === 'number' && typeof right === 'number')
            return left !== left && right !== right;
        if (typeof left === 'object' && typeof left.Equals$1 === 'function') {
            if (left instanceof decimal.Decimal)
                return right instanceof decimal.Decimal && decimal.eq(left, right);
            if (i64.is(left) || i64.is(right))
                return i64.is(left) && i64.is(right) && i64.eq(left, right);
            if (left.constructor !== undefined && left.constructor.$struct)
                return left.Equals$1(right);
        }
        return false;
    }

    function fieldHash(value) {
        if (value === null || value === undefined)
            return 0;
        switch (typeof value) {
        case 'number':
            return value === (value | 0) ? value : doubleHash(value);
        case 'string':
            return stringHash(value);
        case 'boolean':
            return value ? 1 : 0;
        }
        if (i64.is(value))
            return value.lo ^ value.hi;
        if (value instanceof decimal.Decimal)
            return decimal.hash(value);
        return typeof value.GetHashCode$0 === 'function' ? value.GetHashCode$0() : 0;
    }

    natives['System.ValueType'] = {
        'Equals(object)': function (other) {
            if (other === null || other === undefined || other.constructor !== this.constructor)
                return false;
            var names = this.$fieldNames || Object.keys(this);
            for (var index = 0; index < names.length; ++index) {
                if (!fieldValuesEqual(this[names[index]], other[names[index]]))
                    return false;
            }
            return true;
        },
        'GetHashCode()': function () {
            var names = this.$fieldNames || Object.keys(this);
            var hash = 0;
            for (var index = 0; index < names.length; ++index)
                hash = (Math.imul(hash, 31) + fieldHash(this[names[index]])) | 0;
            return hash;
        },
        'ToString()': function () { return rt().typeName(this.constructor); }
    };

    // --- Enums: the methods know the enum type (installed per type by
    // defineEnum), on a box through $t.

    function enumAware(fn) {
        var wrapper = function () {
            var type = this !== null && typeof this === 'object' && this.$t !== undefined ? this.$t : null;
            var value = type !== null ? this.v : this;
            return fn.apply(value, [type].concat(Array.prototype.slice.call(arguments)));
        };
        wrapper.$enumAware = fn;
        return wrapper;
    }
    CS.enumAware = enumAware;

    function enumValue(value) {
        return unboxed(value);
    }

    function enumType(type) {
        return type.$type !== undefined ? type.$type : type;
    }

    function parseEnum(type, text, ignoreCase, throwing) {
        if (text === null || text === undefined) {
            if (throwing)
                throw argNull('value');
            return null;
        }
        var meta = type.$meta;
        var parts = text.split(',');
        var result = 0;
        for (var index = 0; index < parts.length; ++index) {
            var part = parts[index].replace(/^\s+|\s+$/g, '');
            var found = -1;
            for (var position = 0; position < meta.names.length; ++position) {
                var name = meta.names[position];
                if (name === part || (ignoreCase && name.toLowerCase() === part.toLowerCase())) {
                    found = position;
                    break;
                }
            }
            if (found >= 0) {
                result |= typeof meta.values[found] === 'number' ? meta.values[found] : 0;
            } else if (/^[-+]?\d+$/.test(part)) {
                result |= Number(part);
            } else {
                if (throwing)
                    throw argError("Requested value '" + text + "' was not found.");
                return null;
            }
        }
        return result;
    }

    function enumValuesArray(type) {
        var meta = type.$meta;
        var pairs = meta.values.map(function (value, index) { return { value: value, index: index }; });
        // By the unsigned value, as .NET sorts them.
        pairs.sort(function (a, b) {
            var x = typeof a.value === 'number' ? a.value >>> 0 : 0, y = typeof b.value === 'number' ? b.value >>> 0 : 0;
            return x - y || a.index - b.index;
        });
        var seen = Object.create(null);
        return pairs.filter(function (pair) {
            if (seen[pair.value] === true)
                return false;
            seen[pair.value] = true;
            return true;
        });
    }

    natives['System.Enum'] = {
        'HasFlag(Enum)': enumAware(function (type, flag) {
            if (flag === null || flag === undefined)
                throw argNull('flag');
            var bits = enumValue(flag);
            return (this & bits) === bits;
        }),
        'CompareTo(object)': enumAware(function (type, other) {
            if (other === null || other === undefined)
                return 1;
            var against = enumValue(other);
            var left = this >>> 0 === this ? this : this, right = against;
            return left < right ? -1 : (left > right ? 1 : 0);
        }),
        'Equals(object)': enumAware(function (type, other) {
            return other !== null && other !== undefined && other.$t === type && other.v === this;
        }),
        'GetHashCode()': enumAware(function () { return typeof this === 'number' ? this | 0 : i64.low32(this); }),
        'ToString()': enumAware(function (type) { return rt().enumName(type, this); }),
        'ToString(string)': enumAware(function (type, format) { return enumFormat(type, this, format); }),
        'ToString(string, IFormatProvider)': enumAware(function (type, format) { return enumFormat(type, this, format); }),
        'Parse<TEnum>(string)': function (type, text) { return parseEnum(type, text, false, true); },
        'Parse<TEnum>(string, bool)': function (type, text, ignoreCase) { return parseEnum(type, text, ignoreCase, true); },
        'Parse(Type, string)': function (typeObject, text) {
            var type = enumType(typeObject);
            return rt().box(type, parseEnum(type, text, false, true));
        },
        'TryParse<TEnum>(string, out TEnum)': function (type, text, result) {
            var value = parseEnum(type, text, false, false);
            result.v = value === null ? 0 : value;
            return value !== null;
        },
        'TryParse<TEnum>(string, bool, out TEnum)': function (type, text, ignoreCase, result) {
            var value = parseEnum(type, text, ignoreCase, false);
            result.v = value === null ? 0 : value;
            return value !== null;
        },
        'GetValues<TEnum>()': function (type) {
            return rt().arrayOf(type, enumValuesArray(type).map(function (pair) { return pair.value; }));
        },
        'GetValues(Type)': function (typeObject) {
            var type = enumType(typeObject);
            return rt().arrayOf(type, enumValuesArray(type).map(function (pair) { return pair.value; }));
        },
        'GetNames<TEnum>()': function (type) {
            return stringArray(enumValuesArray(type).map(function (pair) { return type.$meta.names[pair.index]; }));
        },
        'GetNames(Type)': function (typeObject) {
            var type = enumType(typeObject);
            return stringArray(enumValuesArray(type).map(function (pair) { return type.$meta.names[pair.index]; }));
        },
        'GetName<TEnum>(TEnum)': function (type, value) {
            var index = type.$meta.values.indexOf(value);
            return index < 0 ? null : type.$meta.names[index];
        },
        'GetName(Type, object)': function (typeObject, value) {
            var type = enumType(typeObject);
            var index = type.$meta.values.indexOf(enumValue(value));
            return index < 0 ? null : type.$meta.names[index];
        },
        'GetUnderlyingType(Type)': function (typeObject) {
            var type = enumType(typeObject);
            var names = { i8: 'System.SByte', u8: 'System.Byte', i16: 'System.Int16', u16: 'System.UInt16', i32: 'System.Int32',
                          u32: 'System.UInt32', i64: 'System.Int64', u64: 'System.UInt64' };
            return rt().typeObject(rt().type(names[CS.NUMERIC[type.$meta.underlying || 'int']] || 'System.Int32'));
        },
        'ToObject(Type, object)': function (typeObject, value) {
            return rt().box(enumType(typeObject), Number(rt().toJS(value)) | 0);
        },
        'ToObject(Type, int)': function (typeObject, value) { return rt().box(enumType(typeObject), value); },
        'IsDefined<TEnum>(TEnum)': function (type, value) { return type.$meta.values.indexOf(value) >= 0; },
        'IsDefined(Type, object)': function (typeObject, value) {
            var type = enumType(typeObject);
            if (typeof value === 'string')
                return type.$meta.names.indexOf(value) >= 0;
            return type.$meta.values.indexOf(enumValue(value)) >= 0;
        },
        'Format(Type, object, string)': function (typeObject, value, format) {
            return enumFormat(enumType(typeObject), enumValue(value), format);
        }
    };

    function enumFormat(type, value, format) {
        if (format === null || format === undefined || format === '' || format === 'G' || format === 'g')
            return rt().enumName(type, value);
        switch (format) {
        case 'D':
        case 'd':
            return typeof value === 'number' ? String(value) : i64.str(value);
        case 'X':
        case 'x': {
            var widths = { i8: 2, u8: 2, i16: 4, u16: 4, i32: 8, u32: 8, i64: 16, u64: 16 };
            var width = widths[type.$meta.underlying ? CS.NUMERIC[type.$meta.underlying] : 'i32'] || 8;
            var hex = width === 16 ? u64.str(u64.fromSigned(value), 16)
                                   : ((value < 0 ? value + Math.pow(2, width * 4) : value) >>> 0).toString(16);
            while (hex.length < width)
                hex = '0' + hex;
            return format === 'X' ? hex.toUpperCase() : hex;
        }
        case 'F':
        case 'f':
            return rt().enumName(type, value, true);
        }
        throw fail('System.FormatException', "Format String can be only 'G', 'g', 'X', 'x', 'F', 'f', 'D' or 'd'.");
    }

    // --- Hash codes as .NET computes them

    var conversion = new DataView(new ArrayBuffer(8));

    function doubleHash(value) {
        if (value === 0 || value !== value)
            return value !== value ? 0x7ff00000 ^ 0 : 0;
        conversion.setFloat64(0, value);
        return conversion.getInt32(0) ^ conversion.getInt32(4);
    }

    function floatHash(value) {
        conversion.setFloat32(0, value);
        var bits = conversion.getInt32(0);
        if ((((bits - 1) & 0x7fffffff) >>> 0) >= 0x7f800000)
            bits &= 0x7f800000;
        return bits;
    }

    function stringHash(text) {
        var hash = 0x15051505 | 0, other = hash;
        for (var index = 0; index < text.length; index += 2) {
            hash = (((hash << 5) + hash + (hash >> 27)) ^ text.charCodeAt(index)) | 0;
            if (index + 1 < text.length)
                other = (((other << 5) + other + (other >> 27)) ^ text.charCodeAt(index + 1)) | 0;
        }
        return (hash + Math.imul(other, 1566083941)) | 0;
    }
    CS.stringHash = stringHash;
    CS.doubleHash = doubleHash;

    // --- The primitive types

    function compareNumbers(left, right) {
        return left < right ? -1 : (left > right ? 1 : 0);
    }

    function compareDoubles(left, right) {
        if (left < right)
            return -1;
        if (left > right)
            return 1;
        if (left === right)
            return 0;
        if (left !== left)
            return right !== right ? 0 : -1;
        return 1;
    }

    var KINDS = {
        'System.SByte': { kind: 'i8', keyword: 'sbyte', min: -128, max: 127 },
        'System.Byte': { kind: 'u8', keyword: 'byte', min: 0, max: 255 },
        'System.Int16': { kind: 'i16', keyword: 'short', min: -32768, max: 32767 },
        'System.UInt16': { kind: 'u16', keyword: 'ushort', min: 0, max: 65535 },
        'System.Int32': { kind: 'i32', keyword: 'int', min: -2147483648, max: 2147483647 },
        'System.UInt32': { kind: 'u32', keyword: 'uint', min: 0, max: 4294967295 },
        'System.Int64': { kind: 'i64', keyword: 'long' },
        'System.UInt64': { kind: 'u64', keyword: 'ulong' },
        'System.Single': { kind: 'f32', keyword: 'float' },
        'System.Double': { kind: 'f64', keyword: 'double' },
        'System.Decimal': { kind: 'decimal', keyword: 'decimal' }
    };

    function shortName(name) {
        return name.substring(name.indexOf('.') + 1);
    }

    function valueCompare(kind) {
        switch (kind) {
        case 'i64':
            return function (left, right) { return i64.cmp(left, right); };
        case 'u64':
            return function (left, right) { return u64.cmp(left, right); };
        case 'f32':
        case 'f64':
            return compareDoubles;
        case 'decimal':
            return function (left, right) { var order = decimal.cmp(left, right); return order < 0 ? -1 : (order > 0 ? 1 : 0); };
        }
        return compareNumbers;
    }

    function valueEquals(kind) {
        switch (kind) {
        case 'i64':
        case 'u64':
            return function (left, right) { return left === right || (i64.is(left) && i64.is(right) && i64.eq(left, right)); };
        case 'f32':
        case 'f64':
            return function (left, right) { return left === right || (left !== left && right !== right); };
        case 'decimal':
            return function (left, right) { return decimal.eq(left, right); };
        }
        return function (left, right) { return left === right; };
    }

    function valueHash(kind) {
        switch (kind) {
        case 'i64':
        case 'u64':
            return function (value) { return typeof value === 'number' ? (value | 0) ^ (Math.floor(value / 4294967296) | 0) : value.lo ^ value.hi; };
        case 'f64':
            return doubleHash;
        case 'f32':
            return floatHash;
        case 'decimal':
            return function (value) { return decimal.hash(value); };
        }
        return function (value) { return value | 0; };
    }

    function valueText(kind) {
        switch (kind) {
        case 'i64':
            return function (value) { return i64.str(value); };
        case 'u64':
            return function (value) { return u64.str(value); };
        case 'f64':
            return function (value) { return CS.formatDouble(value, false); };
        case 'f32':
            return function (value) { return CS.formatDouble(value, true); };
        case 'decimal':
            return function (value) { return decimal.str(value); };
        }
        return function (value) { return String(value); };
    }

    var STYLE_INTEGER = 7, STYLE_FLOAT = 167 | 64, STYLE_NUMBER = 111;

    function parser(kind) {
        if (kind === 'f32' || kind === 'f64')
            return {
                parse: function (text, styles) { return CS.parseFloating(text, styles === undefined ? STYLE_FLOAT : styles, kind === 'f32'); },
                tryParse: function (text, styles) {
                    return CS.tryParseFloating(text, styles === undefined ? STYLE_FLOAT : styles, kind === 'f32');
                },
                zero: 0
            };
        if (kind === 'decimal')
            return {
                parse: function (text, styles) { return CS.parseDecimal(text, styles === undefined ? STYLE_NUMBER : styles); },
                tryParse: function (text, styles) { return CS.tryParseDecimal(text, styles === undefined ? STYLE_NUMBER : styles); },
                zero: decimal.ZERO
            };
        return {
            parse: function (text, styles) { return CS.parseInteger(text, styles === undefined ? STYLE_INTEGER : styles, kind); },
            tryParse: function (text, styles) { return CS.tryParseInteger(text, styles === undefined ? STYLE_INTEGER : styles, kind); },
            zero: 0
        };
    }

    // The natives shared by the numeric types.
    function numericNatives(name) {
        var info = KINDS[name];
        var kind = info.kind, keyword = info.keyword;
        var compare = valueCompare(kind), equals = valueEquals(kind), hash = valueHash(kind), text = valueText(kind);
        var parse = parser(kind);
        var selfBoxed = kind === 'i32';
        function sameType(other) {
            if (selfBoxed)
                return typeof other === 'number';
            return other !== null && typeof other === 'object' && other.$boxed === true && other.$t.$name === name;
        }
        function format(value, spec) {
            return CS.formatNumber(kind, value, spec);
        }
        var table = {};
        table['CompareTo(object)'] = function (other) {
            if (other === null || other === undefined)
                return 1;
            if (!sameType(other))
                throw argError('Object must be of type ' + shortName(name) + '.');
            return compare(this, unboxed(other));
        };
        table['CompareTo(' + keyword + ')'] = function (other) { return compare(this, other); };
        table['Equals(' + keyword + ')'] = function (other) { return equals(this, other); };
        table['Equals(object)'] = function (other) { return sameType(other) && equals(this, unboxed(other)); };
        table['GetHashCode()'] = function () { return hash(this); };
        table['ToString()'] = function () { return text(this); };
        table['ToString(string)'] = function (spec) { return format(this, spec); };
        table['ToString(IFormatProvider)'] = function () { return text(this); };
        table['ToString(string, IFormatProvider)'] = function (spec) { return format(this, spec); };
        table['Parse(string)'] = function (value) { return parse.parse(value); };
        table['Parse(string, IFormatProvider)'] = function (value) { return parse.parse(value); };
        table['Parse(string, NumberStyles)'] = function (value, styles) { return parse.parse(value, styles); };
        table['Parse(string, NumberStyles, IFormatProvider)'] = function (value, styles) { return parse.parse(value, styles); };
        table['TryParse(string, out ' + keyword + ')'] = function (value, result) {
            var parsed = parse.tryParse(value);
            result.v = parsed === null ? parse.zero : parsed;
            return parsed !== null;
        };
        table['TryParse(string, IFormatProvider, out ' + keyword + ')'] = function (value, provider, result) {
            return table['TryParse(string, out ' + keyword + ')'](value, result);
        };
        table['TryParse(string, NumberStyles, IFormatProvider, out ' + keyword + ')'] = function (value, styles, provider, result) {
            var parsed = parse.tryParse(value, styles);
            result.v = parsed === null ? parse.zero : parsed;
            return parsed !== null;
        };
        return table;
    }

    function popCount32(value) {
        value = value - ((value >>> 1) & 0x55555555);
        value = (value & 0x33333333) + ((value >>> 2) & 0x33333333);
        return (Math.imul((value + (value >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24);
    }

    function trailingZeros32(value) {
        if (value === 0)
            return 32;
        var count = 0;
        while ((value & 1) === 0) {
            value >>>= 1;
            ++count;
        }
        return count;
    }

    function hi64(value) {
        return typeof value === 'number' ? Math.floor(value / 4294967296) | 0 : value.hi;
    }

    function lo64(value) {
        return typeof value === 'number' ? value | 0 : value.lo;
    }

    Object.keys(KINDS).forEach(function (name) {
        natives[name] = numericNatives(name);
    });

    var int32 = natives['System.Int32'];
    int32['PopCount(int)'] = function (value) { return popCount32(value); };
    int32['LeadingZeroCount(int)'] = function (value) { return Math.clz32(value); };
    int32['TrailingZeroCount(int)'] = function (value) { return trailingZeros32(value); };
    int32['Log2(int)'] = function (value) {
        if (value < 0)
            throw argRange('value', "value ('" + value + "') must be a non-negative value.");
        return value === 0 ? 0 : 31 - Math.clz32(value);
    };
    int32['RotateLeft(int, int)'] = function (value, count) { return (value << (count & 31)) | (value >>> ((32 - count) & 31)); };
    int32['RotateRight(int, int)'] = function (value, count) { return (value >>> (count & 31)) | (value << ((32 - count) & 31)); };

    var uint32 = natives['System.UInt32'];
    uint32['PopCount(uint)'] = function (value) { return popCount32(value); };
    uint32['LeadingZeroCount(uint)'] = function (value) { return Math.clz32(value); };
    uint32['TrailingZeroCount(uint)'] = function (value) { return trailingZeros32(value); };
    uint32['RotateLeft(uint, int)'] = function (value, count) { return ((value << (count & 31)) | (value >>> ((32 - count) & 31))) >>> 0; };
    uint32['RotateRight(uint, int)'] = function (value, count) { return ((value >>> (count & 31)) | (value << ((32 - count) & 31))) >>> 0; };

    function longBits(signed) {
        var make = signed ? function (hi, lo) { return i64.fromUnsigned(u64.or(u64.shl(u64.fromSigned(hi), 32), lo >>> 0)); }
                          : function (hi, lo) { return u64.or(u64.shl(u64.fromSigned(hi), 32), lo >>> 0); };
        return {
            pop: function (value) { return popCount32(hi64(value)) + popCount32(lo64(value)); },
            lead: function (value) { var hi = hi64(value); return hi !== 0 ? Math.clz32(hi) : 32 + Math.clz32(lo64(value)); },
            trail: function (value) { var lo = lo64(value); return lo !== 0 ? trailingZeros32(lo) : 32 + trailingZeros32(hi64(value)); },
            rotl: function (value, count) {
                count &= 63;
                var unsigned = u64.fromSigned(value);
                var result = u64.or(u64.shl(unsigned, count), u64.shr(unsigned, (64 - count) & 63));
                if (count === 0)
                    result = unsigned;
                return signed ? i64.fromUnsigned(result) : result;
            },
            make: make
        };
    }
    var signedBits = longBits(true), unsignedBits = longBits(false);
    var int64 = natives['System.Int64'];
    int64['PopCount(long)'] = function (value) { return signedBits.pop(value); };
    int64['LeadingZeroCount(long)'] = function (value) { return signedBits.lead(value); };
    int64['TrailingZeroCount(long)'] = function (value) { return signedBits.trail(value); };
    int64['RotateLeft(long, int)'] = function (value, count) { return signedBits.rotl(value, count); };
    int64['RotateRight(long, int)'] = function (value, count) { return signedBits.rotl(value, 64 - (count & 63)); };
    var uint64 = natives['System.UInt64'];
    uint64['PopCount(ulong)'] = function (value) { return unsignedBits.pop(value); };
    uint64['LeadingZeroCount(ulong)'] = function (value) { return unsignedBits.lead(value); };
    uint64['TrailingZeroCount(ulong)'] = function (value) { return unsignedBits.trail(value); };

    function floatingStatics(table, keyword) {
        table['IsNaN(' + keyword + ')'] = function (value) { return value !== value; };
        table['IsInfinity(' + keyword + ')'] = function (value) { return value === Infinity || value === -Infinity; };
        table['IsPositiveInfinity(' + keyword + ')'] = function (value) { return value === Infinity; };
        table['IsNegativeInfinity(' + keyword + ')'] = function (value) { return value === -Infinity; };
        table['IsFinite(' + keyword + ')'] = function (value) { return isFinite(value); };
        table['IsNegative(' + keyword + ')'] = function (value) { return value < 0 || (value === 0 && 1 / value < 0); };
        table['IsInteger(' + keyword + ')'] = function (value) { return isFinite(value) && value === Math.floor(value); };
        table['IsNormal(' + keyword + ')'] = function (value) {
            return isFinite(value) && value !== 0 && Math.abs(value) >= (keyword === 'float' ? 1.1754943508222875e-38 : 2.2250738585072014e-308);
        };
        table['IsSubnormal(' + keyword + ')'] = function (value) {
            return value !== 0 && Math.abs(value) < (keyword === 'float' ? 1.1754943508222875e-38 : 2.2250738585072014e-308);
        };
    }
    floatingStatics(natives['System.Double'], 'double');
    floatingStatics(natives['System.Single'], 'float');

    // Decimal: constructors and rounding.
    var decimalTable = natives['System.Decimal'];
    decimalTable['.ctor(int, int, int, bool, byte)'] = function (lo, mid, hi, negative, scale) {
        if (scale > 28)
            throw argRange('scale', 'Decimal can only round to between 0 and 28 digits of precision.');
        var mantissa = big.add(big.add(big.fromFloat(lo >>> 0), big.mul(big.fromFloat(mid >>> 0), big.pow(2, 32))),
                               big.mul(big.fromFloat(hi >>> 0), big.pow(2, 64)));
        return decimal.make(negative, mantissa, scale);
    };
    decimalTable['.ctor(int)'] = function (value) { return decimal.fromInteger(value); };
    decimalTable['.ctor(long)'] = function (value) { return decimal.fromInteger(value); };
    decimalTable['.ctor(double)'] = function (value) { return rt().dec.fromDouble(value); };
    decimalTable['GetScale(decimal)'] = function (value) { return value.s; };
    var ROUNDING = ['even', 'away', 'zero', 'floor', 'ceiling'];
    function decimalRound(value, decimals, mode) {
        if (decimals < 0 || decimals > 28)
            throw argRange('decimals', 'Decimal can only round to between 0 and 28 digits of precision.');
        if (mode < 0 || mode > 4)
            throw argError("The value '" + mode + "' is not a valid MidpointRounding value.", 'mode');
        return decimal.round(value, decimals, ROUNDING[mode]);
    }
    CS.decimalRound = decimalRound;
    decimalTable['Round(decimal)'] = function (value) { return decimalRound(value, 0, 0); };
    decimalTable['Round(decimal, int)'] = function (value, decimals) { return decimalRound(value, decimals, 0); };
    decimalTable['Round(decimal, MidpointRounding)'] = function (value, mode) { return decimalRound(value, 0, mode); };
    decimalTable['Round(decimal, int, MidpointRounding)'] = decimalRound;
    decimalTable['Truncate(decimal)'] = function (value) { return decimal.round(value, 0, 'zero'); };
    decimalTable['Floor(decimal)'] = function (value) { return decimal.round(value, 0, 'floor'); };
    decimalTable['Ceiling(decimal)'] = function (value) { return decimal.round(value, 0, 'ceiling'); };
    decimalTable['GetBits(decimal)'] = function (value) {
        var mantissa = value.m;
        var words = [];
        for (var index = 0; index < 3; ++index) {
            words.push(big.toFloat(big.rem(mantissa, big.pow(2, 32))) | 0);
            mantissa = big.quot(mantissa, big.pow(2, 32));
        }
        words.push((value.s << 16) | (value.n ? 0x80000000 : 0));
        return rt().arrayOf(rt().type('System.Int32'), words);
    };

    // The run-time setup of the numeric types.
    Object.keys(KINDS).forEach(function (name) {
        var kind = KINDS[name].kind;
        var text = valueText(kind), equals = valueEquals(kind), hash = valueHash(kind), compare = valueCompare(kind);
        setup[name] = function (ctor) {
            ctor.$format = text;
            ctor.$formatWith = function (value, format) { return CS.formatNumber(kind, value, format); };
            ctor.$equals = equals;
            ctor.$hash = hash;
            ctor.$compare = compare;
            ctor.$default = kind === 'decimal' ? function () { return decimal.ZERO; } : function () { return 0; };
            if (kind === 'i32')
                ctor.$box = function (value) { return value; };
            ctor.prototype.GetType$0 = function () { return rt().typeObject(ctor); };
            var typed = { i8: Int8Array, u8: Uint8Array, i16: Int16Array, u16: Uint16Array, i32: Int32Array, u32: Uint32Array,
                          f32: Float32Array, f64: Float64Array }[kind];
            if (typed !== undefined)
                ctor.$typed = typed;
        };
    });

    // --- Boolean and Char

    function parseBoolean(text) {
        if (text === null || text === undefined)
            throw argNull('value');
        var trimmed = text.replace(/^[\s\u0000]+|[\s\u0000]+$/g, '').toLowerCase();
        if (trimmed === 'true')
            return true;
        if (trimmed === 'false')
            return false;
        return null;
    }

    natives['System.Boolean'] = {
        'CompareTo(object)': function (other) {
            if (other === null || other === undefined)
                return 1;
            if (typeof other !== 'boolean')
                throw argError('Object must be of type Boolean.');
            return this === other ? 0 : (this === false ? -1 : 1);
        },
        'CompareTo(bool)': function (other) { return this === other ? 0 : (this === false ? -1 : 1); },
        'Equals(bool)': function (other) { return this === other; },
        'Equals(object)': function (other) { return typeof other === 'boolean' && this === other; },
        'GetHashCode()': function () { return this ? 1 : 0; },
        'ToString()': function () { return this ? 'True' : 'False'; },
        'ToString(IFormatProvider)': function () { return this ? 'True' : 'False'; },
        'Parse(string)': function (text) {
            var value = parseBoolean(text);
            if (value === null)
                throw fail('System.FormatException', "String '" + text + "' was not recognized as a valid Boolean.");
            return value;
        },
        'TryParse(string, out bool)': function (text, result) {
            var value = text === null || text === undefined ? null : parseBoolean(text);
            result.v = value === true;
            return value !== null;
        }
    };

    setup['System.Boolean'] = function (ctor) {
        ctor.$format = function (value) { return value ? 'True' : 'False'; };
        ctor.$equals = function (left, right) { return left === right; };
        ctor.$hash = function (value) { return value ? 1 : 0; };
        ctor.$compare = function (left, right) { return left === right ? 0 : (left ? 1 : -1); };
        ctor.$default = function () { return false; };
        ctor.$box = function (value) { return value; };
    };

    function charTest(test) {
        return function (code) { return test(code); };
    }

    function charTestAt(test) {
        return function (text, index) { return test(charAt(text, index)); };
    }

    var charTable = natives['System.Char'] = {
        'CompareTo(object)': function (other) {
            if (other === null || other === undefined)
                return 1;
            if (!(other !== null && typeof other === 'object' && other.$boxed === true && other.$t.$name === 'System.Char'))
                throw argError('Object must be of type Char.');
            return this - other.v;
        },
        'CompareTo(char)': function (other) { return this - other; },
        'Equals(char)': function (other) { return this === other; },
        'Equals(object)': function (other) {
            return other !== null && typeof other === 'object' && other.$boxed === true && other.$t.$name === 'System.Char' && other.v === this;
        },
        'GetHashCode()': function () { return this | (this << 16); },
        'ToString()': function () { return String.fromCharCode(this); },
        'ToString(char)': function (code) { return String.fromCharCode(code); },
        'Parse(string)': function (text) {
            if (text === null || text === undefined)
                throw argNull('s');
            if (text.length !== 1)
                throw fail('System.FormatException', 'String must be exactly one character long.');
            return text.charCodeAt(0);
        },
        'TryParse(string, out char)': function (text, result) {
            if (text === null || text === undefined || text.length !== 1) {
                result.v = 0;
                return false;
            }
            result.v = text.charCodeAt(0);
            return true;
        },
        'IsLetterOrDigit(char)': function (code) { return isLetterCode(code) || isDigitCode(code); },
        'IsLetterOrDigit(string, int)': function (text, index) { var code = charAt(text, index); return isLetterCode(code) || isDigitCode(code); },
        'IsSurrogate(char)': function (code) { return code >= 0xd800 && code <= 0xdfff; },
        'IsHighSurrogate(char)': function (code) { return code >= 0xd800 && code <= 0xdbff; },
        'IsLowSurrogate(char)': function (code) { return code >= 0xdc00 && code <= 0xdfff; },
        'IsAscii(char)': function (code) { return code < 128; },
        'IsAsciiDigit(char)': function (code) { return code >= 48 && code <= 57; },
        'IsAsciiLetter(char)': function (code) { return (code >= 65 && code <= 90) || (code >= 97 && code <= 122); },
        'IsAsciiLetterOrDigit(char)': function (code) { return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57); },
        'IsAsciiHexDigit(char)': function (code) { return (code >= 48 && code <= 57) || (code >= 65 && code <= 70) || (code >= 97 && code <= 102); },
        'IsAsciiLetterLower(char)': function (code) { return code >= 97 && code <= 122; },
        'IsAsciiLetterUpper(char)': function (code) { return code >= 65 && code <= 90; },
        'IsBetween(char, char, char)': function (code, low, high) { return code >= low && code <= high; },
        'ToUpper(char)': upperChar,
        'ToLower(char)': lowerChar,
        'ToUpperInvariant(char)': upperChar,
        'ToLowerInvariant(char)': lowerChar,
        'GetNumericValue(char)': numericValue,
        'ConvertFromUtf32(int)': function (code) {
            if (code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff))
                throw argRange('utf32', 'A valid UTF32 value is between 0x000000 and 0x10ffff, inclusive, and should not include surrogate codepoint values (0x00d800 ~ 0x00dfff).');
            if (code < 0x10000)
                return String.fromCharCode(code);
            code -= 0x10000;
            return String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
        },
        'ConvertToUtf32(char, char)': function (high, low) {
            if (!(high >= 0xd800 && high <= 0xdbff))
                throw argRange('highSurrogate', 'A valid high surrogate character is between 0xd800 and 0xdbff, inclusive.');
            if (!(low >= 0xdc00 && low <= 0xdfff))
                throw argRange('lowSurrogate', 'A valid low surrogate character is between 0xdc00 and 0xdfff, inclusive.');
            return ((high - 0xd800) << 10) + (low - 0xdc00) + 0x10000;
        },
        'ConvertToUtf32(string, int)': function (text, index) {
            var code = charAt(text, index);
            if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
                var low = text.charCodeAt(index + 1);
                if (low >= 0xdc00 && low <= 0xdfff)
                    return ((code - 0xd800) << 10) + (low - 0xdc00) + 0x10000;
            }
            if (code >= 0xd800 && code <= 0xdfff)
                throw argError('Found a high surrogate char without a following low surrogate at index: ' + index +
                               '. The input may not be in this encoding, or may not contain valid Unicode (UTF-16) characters.', 's');
            return code;
        }
    };
    [['IsDigit', isDigitCode], ['IsLetter', isLetterCode], ['IsUpper', isUpperCode], ['IsLower', isLowerCode],
     ['IsWhiteSpace', isWhiteSpaceCode], ['IsPunctuation', isPunctuationCode], ['IsSymbol', isSymbolCode],
     ['IsControl', isControlCode], ['IsSeparator', isSeparatorCode], ['IsNumber', function (code) { return numericValue(code) >= 0; }]
    ].forEach(function (pair) {
        charTable[pair[0] + '(char)'] = charTest(pair[1]);
        charTable[pair[0] + '(string, int)'] = charTestAt(pair[1]);
    });

    setup['System.Char'] = function (ctor) {
        ctor.$format = function (value) { return String.fromCharCode(value); };
        ctor.$equals = function (left, right) { return left === right; };
        ctor.$hash = function (value) { return value | (value << 16); };
        ctor.$compare = function (left, right) { return left - right; };
        ctor.$default = function () { return 0; };
        ctor.$typed = Uint16Array;
        ctor.prototype.GetType$0 = function () { return rt().typeObject(ctor); };
    };

    // --- String

    function charsToString(chars, start, count) {
        var out = '';
        for (var position = start; position < start + count; position += 8192)
            out += String.fromCharCode.apply(null, Array.prototype.slice.call(chars, position, Math.min(start + count, position + 8192)));
        return out;
    }
    CS.charsToString = charsToString;

    function checkNotNull(value, name) {
        if (value === null || value === undefined)
            throw argNull(name);
        return value;
    }

    function isTrimmed(code, chars) {
        if (chars === null)
            return isWhiteSpaceCode(code);
        for (var index = 0; index < chars.length; ++index) {
            if (chars[index] === code)
                return true;
        }
        return false;
    }

    function trim(text, chars, start, end) {
        if (chars !== null && chars.length === 0)
            chars = null;
        var from = 0, to = text.length;
        if (start)
            while (from < to && isTrimmed(text.charCodeAt(from), chars))
                ++from;
        if (end)
            while (to > from && isTrimmed(text.charCodeAt(to - 1), chars))
                --to;
        return text.substring(from, to);
    }
    CS.trimString = function (text) { return trim(text, null, true, true); };

    // StringComparison: 0, 1 current culture, 2, 3 invariant, 4 ordinal, 5 ordinal ignoring case.
    function checkComparison(comparison) {
        if (!(comparison >= 0 && comparison <= 5))
            throw argError('The string comparison type passed in is currently not supported.', 'comparisonType');
    }

    function compareWith(left, right, comparison) {
        checkComparison(comparison);
        switch (comparison) {
        case 4:
            return CS.compareOrdinal(left, right);
        case 5:
            return CS.compareOrdinalIgnoreCase(left, right);
        default:
            return CS.collate(left, right, comparison === 1 || comparison === 3);
        }
    }
    CS.compareStrings = compareWith;

    function equalsWith(left, right, comparison) {
        checkComparison(comparison);
        if (left === right)
            return true;
        if (left === null || left === undefined || right === null || right === undefined)
            return false;
        if (comparison === 4)
            return false;
        return compareWith(left, right, comparison) === 0;
    }

    function foldFor(text, comparison) {
        return comparison === 1 || comparison === 3 || comparison === 5 ? CS.upperInvariant(text) : text;
    }

    function indexOfString(text, value, start, count, comparison) {
        checkNotNull(value, 'value');
        if (start < 0 || start > text.length)
            throw argRange('startIndex', 'Index was out of range. Must be non-negative and less than or equal to the size of the collection.');
        if (count < 0 || start > text.length - count)
            throw argRange('count', 'Count must be positive and count must refer to a location within the string/array/collection.');
        var region = foldFor(text.substring(0, start + count), comparison);
        var found = region.indexOf(foldFor(value, comparison), start);
        if (found >= 0 && found + value.length > start + count)
            return -1;
        return found;
    }

    function indexOfChar(text, code, start, count) {
        if (start < 0 || start > text.length)
            throw argRange('startIndex', 'Index was out of range. Must be non-negative and less than or equal to the size of the collection.');
        if (count < 0 || start > text.length - count)
            throw argRange('count', 'Count must be positive and count must refer to a location within the string/array/collection.');
        var found = text.indexOf(String.fromCharCode(code), start);
        return found >= 0 && found < start + count ? found : -1;
    }

    function indexOfAny(text, chars, start, count) {
        checkNotNull(chars, 'anyOf');
        if (start < 0 || start > text.length)
            throw argRange('startIndex', 'Index was out of range. Must be non-negative and less than or equal to the size of the collection.');
        for (var index = start; index < start + count && index < text.length; ++index) {
            var code = text.charCodeAt(index);
            for (var position = 0; position < chars.length; ++position) {
                if (chars[position] === code)
                    return index;
            }
        }
        return -1;
    }

    function substring(text, start, length) {
        if (start < 0)
            throw argRange('startIndex', 'StartIndex cannot be less than zero.');
        if (length === undefined) {
            if (start > text.length)
                throw argRange('startIndex', 'startIndex cannot be larger than length of string.');
            return text.substring(start);
        }
        if (start > text.length)
            throw argRange('startIndex', 'startIndex cannot be larger than length of string.');
        if (length < 0)
            throw argRange('length', 'Length cannot be less than zero.');
        if (start > text.length - length)
            throw argRange('length', 'Index and length must refer to a location within the string.');
        return text.substring(start, start + length);
    }

    var REMOVE_EMPTY = 1, TRIM_ENTRIES = 2;

    function checkSplitOptions(options) {
        if ((options & ~3) !== 0)
            throw argError('Value of flags is invalid.', 'options');
    }

    function soleValue(text, options, count) {
        if (count !== 0) {
            var candidate = (options & TRIM_ENTRIES) !== 0 ? trim(text, null, true, true) : text;
            if ((options & REMOVE_EMPTY) === 0 || candidate.length !== 0)
                return stringArray([candidate]);
        }
        return stringArray([]);
    }

    // The split by separator positions [start, length] as String.Split does it.
    function splitAt(text, positions, count, options) {
        if (count < 0)
            throw argRange('count', 'Count cannot be less than zero.');
        checkSplitOptions(options);
        if (count <= 1 || text.length === 0) {
            var candidate = text;
            if ((options & TRIM_ENTRIES) !== 0 && count > 0)
                candidate = trim(candidate, null, true, true);
            if ((options & REMOVE_EMPTY) !== 0 && candidate.length === 0)
                count = 0;
            return stringArray(count === 0 ? [] : [candidate]);
        }
        var list = positions(text);
        if (list.length === 0)
            return soleValue(text, options, count);
        var result = [];
        var current = 0;
        var index;
        if (options === 0) {
            var replaces = Math.min(list.length, count - 1);
            for (index = 0; index < replaces; ++index) {
                result.push(text.substring(current, list[index][0]));
                current = list[index][0] + list[index][1];
            }
            result.push(text.substring(current));
            return stringArray(result);
        }
        var entry;
        for (index = 0; index < list.length; ++index) {
            entry = text.substring(current, list[index][0]);
            if ((options & TRIM_ENTRIES) !== 0)
                entry = trim(entry, null, true, true);
            if (entry.length !== 0 || (options & REMOVE_EMPTY) === 0)
                result.push(entry);
            current = list[index][0] + list[index][1];
            if (result.length === count - 1) {
                if ((options & REMOVE_EMPTY) !== 0) {
                    while (++index < list.length) {
                        entry = text.substring(current, list[index][0]);
                        if ((options & TRIM_ENTRIES) !== 0)
                            entry = trim(entry, null, true, true);
                        if (entry.length !== 0)
                            break;
                        current = list[index][0] + list[index][1];
                    }
                }
                break;
            }
        }
        entry = text.substring(current);
        if ((options & TRIM_ENTRIES) !== 0)
            entry = trim(entry, null, true, true);
        if (entry.length !== 0 || (options & REMOVE_EMPTY) === 0)
            result.push(entry);
        return stringArray(result);
    }

    function charPositions(chars) {
        return function (text) {
            var list = [];
            for (var index = 0; index < text.length; ++index) {
                var code = text.charCodeAt(index);
                if (chars === null || chars.length === 0 ? isWhiteSpaceCode(code) : Array.prototype.indexOf.call(chars, code) >= 0)
                    list.push([index, 1]);
            }
            return list;
        };
    }

    function stringPositions(separators) {
        var usable = separators.filter(function (separator) { return separator !== null && separator !== undefined && separator.length > 0; });
        return function (text) {
            var list = [];
            for (var index = 0; index < text.length; ++index) {
                for (var position = 0; position < usable.length; ++position) {
                    var separator = usable[position];
                    if (text.charCodeAt(index) === separator.charCodeAt(0) && text.substring(index, index + separator.length) === separator) {
                        list.push([index, separator.length]);
                        index += separator.length - 1;
                        break;
                    }
                }
            }
            return list;
        };
    }

    function splitByString(text, separator, count, options) {
        if (separator === null || separator === undefined || separator.length === 0) {
            if (count < 0)
                throw argRange('count', 'Count cannot be less than zero.');
            checkSplitOptions(options);
            return soleValue(text, options, count);
        }
        return splitAt(text, stringPositions([separator]), count, options);
    }

    function splitByStrings(text, separators, count, options) {
        if (separators === null || separators === undefined || separators.length === 0)
            return splitAt(text, charPositions(null), count, options);
        return splitAt(text, stringPositions(Array.prototype.slice.call(separators)), count, options);
    }

    function joinValues(separator, values, start, count) {
        var parts = [];
        for (var index = start; index < start + count; ++index) {
            var value = values[index];
            parts.push(value === null || value === undefined ? '' : (typeof value === 'string' ? value : rt().objectString(value)));
        }
        return parts.join(separator === null || separator === undefined ? '' : separator);
    }

    function concatObjects(list) {
        var out = '';
        for (var index = 0; index < list.length; ++index)
            out += rt().objectString(list[index]);
        return out;
    }

    function replaceAll(text, oldValue, newValue) {
        return text.split(oldValue).join(newValue === null || newValue === undefined ? '' : newValue);
    }

    function padding(width, code) {
        return new Array(width + 1).join(String.fromCharCode(code));
    }

    natives['System.String'] = {
        '.ctor(char, int)': function (code, count) {
            if (count < 0)
                throw argRange('count', 'Non-negative number required.');
            return padding(count, code);
        },
        '.ctor(char[])': function (chars) {
            return chars === null || chars === undefined ? '' : charsToString(chars, 0, chars.length);
        },
        '.ctor(char[], int, int)': function (chars, start, length) {
            checkNotNull(chars, 'value');
            if (start < 0)
                throw argRange('startIndex', 'StartIndex cannot be less than zero.');
            if (length < 0)
                throw argRange('length', 'Length cannot be less than zero.');
            if (start > chars.length - length)
                throw argRange('startIndex', 'Index was out of range. Must be non-negative and less than the size of the collection.');
            return charsToString(chars, start, length);
        },
        '.ctor(ReadOnlySpan<char>)': function (span) {
            if (span._text !== null && span._text !== undefined)
                return span._text.substr(span._start, span._length);
            return span._length === 0 ? '' : charsToString(span._array, span._start, span._length);
        },
        'get_Length()': function () { return this.length; },
        'get_Item(int)': function (index) {
            if (!(index >= 0 && index < this.length))
                throw rt().indexError();
            return this.charCodeAt(index);
        },
        'Equals(object)': function (other) { return typeof other === 'string' && other === String(this); },
        'Equals(string)': function (other) { return other === String(this); },
        'Equals(string, StringComparison)': function (other, comparison) { return equalsWith(String(this), other, comparison); },
        'Equals(string, string)': function (left, right) { return (left === undefined ? null : left) === (right === undefined ? null : right); },
        'Equals(string, string, StringComparison)': equalsWith,
        'GetHashCode()': function () { return stringHash(this); },
        'ToString()': function () { return String(this); },
        'Clone()': function () { return String(this); },
        'CompareTo(object)': function (other) {
            if (other === null || other === undefined)
                return 1;
            if (typeof other !== 'string')
                throw argError('Object must be of type String.');
            return CS.collate(String(this), other, false);
        },
        'CompareTo(string)': function (other) { return CS.collate(String(this), other, false); },
        'Compare(string, string)': function (left, right) { return CS.collate(left, right, false); },
        'Compare(string, string, bool)': function (left, right, ignoreCase) { return CS.collate(left, right, ignoreCase); },
        'Compare(string, string, StringComparison)': compareWith,
        'Compare(string, int, string, int, int)': function (left, leftIndex, right, rightIndex, length) {
            if (left === null || right === null)
                return CS.collate(left, right, false);
            return CS.collate(left.substr(leftIndex, length), right.substr(rightIndex, length), false);
        },
        'CompareOrdinal(string, string)': CS.compareOrdinal,
        'IsNullOrEmpty(string)': function (value) { return value === null || value === undefined || value.length === 0; },
        'IsNullOrWhiteSpace(string)': function (value) {
            if (value === null || value === undefined)
                return true;
            for (var index = 0; index < value.length; ++index) {
                if (!isWhiteSpaceCode(value.charCodeAt(index)))
                    return false;
            }
            return true;
        },
        'Concat(object)': function (value) { return rt().objectString(value); },
        'Concat(object, object)': function (a, b) { return concatObjects([a, b]); },
        'Concat(object, object, object)': function (a, b, c) { return concatObjects([a, b, c]); },
        'Concat(object[])': function (values) { return concatObjects(checkNotNull(values, 'args')); },
        'Concat(string, string)': function (a, b) { return rt().s(a) + rt().s(b); },
        'Concat(string, string, string)': function (a, b, c) { return rt().s(a) + rt().s(b) + rt().s(c); },
        'Concat(string, string, string, string)': function (a, b, c, d) { return rt().s(a) + rt().s(b) + rt().s(c) + rt().s(d); },
        'Concat(string[])': function (values) { return joinValues('', checkNotNull(values, 'values'), 0, values.length); },
        'Join(string, string[])': function (separator, values) { return joinValues(separator, checkNotNull(values, 'value'), 0, values.length); },
        'Join(string, object[])': function (separator, values) { return joinValues(separator, checkNotNull(values, 'values'), 0, values.length); },
        'Join(char, string[])': function (separator, values) {
            return joinValues(String.fromCharCode(separator), checkNotNull(values, 'value'), 0, values.length);
        },
        'Join(char, object[])': function (separator, values) {
            return joinValues(String.fromCharCode(separator), checkNotNull(values, 'values'), 0, values.length);
        },
        'Join(string, string[], int, int)': function (separator, values, start, count) {
            checkNotNull(values, 'value');
            if (start < 0)
                throw argRange('startIndex', 'StartIndex cannot be less than zero.');
            if (count < 0)
                throw argRange('count', 'Count cannot be less than zero.');
            if (start > values.length - count)
                throw argRange('startIndex', 'Index and count must refer to a location within the buffer.');
            return joinValues(separator, values, start, count);
        },
        'Format(string, object)': function (format, a) { return CS.composite(format, [a]); },
        'Format(string, object, object)': function (format, a, b) { return CS.composite(format, [a, b]); },
        'Format(string, object, object, object)': function (format, a, b, c) { return CS.composite(format, [a, b, c]); },
        'Format(string, object[])': function (format, args) { return CS.composite(format, checkNotNull(args, 'args')); },
        'Format(IFormatProvider, string, object[])': function (provider, format, args) { return CS.composite(format, checkNotNull(args, 'args')); },
        'Contains(string)': function (value) { return this.indexOf(checkNotNull(value, 'value')) >= 0; },
        'Contains(char)': function (code) { return this.indexOf(String.fromCharCode(code)) >= 0; },
        'Contains(string, StringComparison)': function (value, comparison) {
            checkComparison(comparison);
            return foldFor(String(this), comparison).indexOf(foldFor(checkNotNull(value, 'value'), comparison)) >= 0;
        },
        'Contains(char, StringComparison)': function (code, comparison) {
            checkComparison(comparison);
            return foldFor(String(this), comparison).indexOf(foldFor(String.fromCharCode(code), comparison)) >= 0;
        },
        'StartsWith(string)': function (value) { return this.substring(0, checkNotNull(value, 'value').length) === value; },
        'StartsWith(char)': function (code) { return this.length > 0 && this.charCodeAt(0) === code; },
        'StartsWith(string, StringComparison)': function (value, comparison) {
            checkNotNull(value, 'value');
            checkComparison(comparison);
            return foldFor(this.substring(0, value.length), comparison) === foldFor(value, comparison);
        },
        'StartsWith(string, bool, CultureInfo)': function (value, ignoreCase) {
            checkNotNull(value, 'value');
            var start = this.substring(0, value.length);
            return ignoreCase ? CS.upperInvariant(start) === CS.upperInvariant(value) : start === value;
        },
        'EndsWith(string)': function (value) {
            checkNotNull(value, 'value');
            return value.length <= this.length && this.substring(this.length - value.length) === value;
        },
        'EndsWith(char)': function (code) { return this.length > 0 && this.charCodeAt(this.length - 1) === code; },
        'EndsWith(string, StringComparison)': function (value, comparison) {
            checkNotNull(value, 'value');
            checkComparison(comparison);
            return value.length <= this.length && foldFor(this.substring(this.length - value.length), comparison) === foldFor(value, comparison);
        },
        'IndexOf(char)': function (code) { return this.indexOf(String.fromCharCode(code)); },
        'IndexOf(char, int)': function (code, start) { return indexOfChar(String(this), code, start, this.length - start); },
        'IndexOf(char, int, int)': function (code, start, count) { return indexOfChar(String(this), code, start, count); },
        'IndexOf(string)': function (value) { return indexOfString(String(this), value, 0, this.length, 0); },
        'IndexOf(string, int)': function (value, start) { return indexOfString(String(this), value, start, this.length - start, 0); },
        'IndexOf(string, int, int)': function (value, start, count) { return indexOfString(String(this), value, start, count, 0); },
        'IndexOf(string, StringComparison)': function (value, comparison) {
            checkComparison(comparison);
            return indexOfString(String(this), value, 0, this.length, comparison);
        },
        'IndexOf(string, int, StringComparison)': function (value, start, comparison) {
            checkComparison(comparison);
            return indexOfString(String(this), value, start, this.length - start, comparison);
        },
        'IndexOf(char, StringComparison)': function (code, comparison) {
            checkComparison(comparison);
            return indexOfString(String(this), String.fromCharCode(code), 0, this.length, comparison);
        },
        'IndexOfAny(char[])': function (chars) { return indexOfAny(String(this), chars, 0, this.length); },
        'IndexOfAny(char[], int)': function (chars, start) { return indexOfAny(String(this), chars, start, this.length - start); },
        'IndexOfAny(char[], int, int)': function (chars, start, count) { return indexOfAny(String(this), chars, start, count); },
        'LastIndexOf(char)': function (code) { return this.lastIndexOf(String.fromCharCode(code)); },
        'LastIndexOf(char, int)': function (code, start) {
            if (this.length === 0)
                return -1;
            if (start < 0 || start >= this.length)
                throw argRange('startIndex', 'Index was out of range. Must be non-negative and less than the size of the collection.');
            return this.lastIndexOf(String.fromCharCode(code), start);
        },
        'LastIndexOf(string)': function (value) { return this.lastIndexOf(checkNotNull(value, 'value')); },
        'LastIndexOf(string, int)': function (value, start) {
            checkNotNull(value, 'value');
            if (this.length === 0)
                return value.length === 0 ? 0 : -1;
            if (start < 0 || start > this.length)
                throw argRange('startIndex', 'Index was out of range. Must be non-negative and less than the size of the collection.');
            if (start === this.length)
                start = this.length - 1;
            var found = this.lastIndexOf(value, start - value.length + 1);
            return found;
        },
        'LastIndexOf(string, StringComparison)': function (value, comparison) {
            checkNotNull(value, 'value');
            checkComparison(comparison);
            return foldFor(String(this), comparison).lastIndexOf(foldFor(value, comparison));
        },
        'LastIndexOfAny(char[])': function (chars) {
            checkNotNull(chars, 'anyOf');
            for (var index = this.length - 1; index >= 0; --index) {
                if (Array.prototype.indexOf.call(chars, this.charCodeAt(index)) >= 0)
                    return index;
            }
            return -1;
        },
        'Substring(int)': function (start) { return substring(String(this), start); },
        'Substring(int, int)': function (start, length) { return substring(String(this), start, length); },
        'Split(char, StringSplitOptions)': function (code, options) { return splitAt(String(this), charPositions([code]), 2147483647, options); },
        'Split(char, int, StringSplitOptions)': function (code, count, options) { return splitAt(String(this), charPositions([code]), count, options); },
        'Split(char[])': function (chars) { return splitAt(String(this), charPositions(chars), 2147483647, 0); },
        'Split(char[], int)': function (chars, count) { return splitAt(String(this), charPositions(chars), count, 0); },
        'Split(char[], StringSplitOptions)': function (chars, options) { return splitAt(String(this), charPositions(chars), 2147483647, options); },
        'Split(char[], int, StringSplitOptions)': function (chars, count, options) { return splitAt(String(this), charPositions(chars), count, options); },
        'Split(string, StringSplitOptions)': function (separator, options) { return splitByString(String(this), separator, 2147483647, options); },
        'Split(string, int, StringSplitOptions)': function (separator, count, options) { return splitByString(String(this), separator, count, options); },
        'Split(string[], StringSplitOptions)': function (separators, options) { return splitByStrings(String(this), separators, 2147483647, options); },
        'Split(string[], int, StringSplitOptions)': function (separators, count, options) { return splitByStrings(String(this), separators, count, options); },
        'Replace(char, char)': function (oldCode, newCode) { return replaceAll(String(this), String.fromCharCode(oldCode), String.fromCharCode(newCode)); },
        'Replace(string, string)': function (oldValue, newValue) {
            checkNotNull(oldValue, 'oldValue');
            if (oldValue.length === 0)
                throw argError('String cannot be of zero length.', 'oldValue');
            return replaceAll(String(this), oldValue, newValue);
        },
        'Replace(string, string, StringComparison)': function (oldValue, newValue, comparison) {
            checkNotNull(oldValue, 'oldValue');
            if (oldValue.length === 0)
                throw argError('String cannot be of zero length.', 'oldValue');
            checkComparison(comparison);
            if (comparison !== 1 && comparison !== 3 && comparison !== 5)
                return replaceAll(String(this), oldValue, newValue);
            var text = String(this), folded = CS.upperInvariant(text), key = CS.upperInvariant(oldValue);
            var out = '', position = 0, found;
            while ((found = folded.indexOf(key, position)) >= 0) {
                out += text.substring(position, found) + rt().s(newValue);
                position = found + oldValue.length;
            }
            return out + text.substring(position);
        },
        'Insert(int, string)': function (start, value) {
            checkNotNull(value, 'value');
            if (start < 0 || start > this.length)
                throw argRange('startIndex', 'Index was out of range. Must be non-negative and less than or equal to the size of the collection.');
            return this.substring(0, start) + value + this.substring(start);
        },
        'Remove(int)': function (start) {
            if (start < 0)
                throw argRange('startIndex', 'StartIndex cannot be less than zero.');
            if (start >= this.length)
                throw argRange('startIndex', 'startIndex must be less than length of string.');
            return this.substring(0, start);
        },
        'Remove(int, int)': function (start, count) {
            if (start < 0)
                throw argRange('startIndex', 'StartIndex cannot be less than zero.');
            if (count < 0)
                throw argRange('count', 'Count cannot be less than zero.');
            if (count > this.length - start)
                throw argRange('count', 'Index and count must refer to a location within the string.');
            return this.substring(0, start) + this.substring(start + count);
        },
        'ToUpper()': function () { return CS.upperInvariant(String(this)); },
        'ToLower()': function () { return CS.lowerInvariant(String(this)); },
        'ToUpperInvariant()': function () { return CS.upperInvariant(String(this)); },
        'ToLowerInvariant()': function () { return CS.lowerInvariant(String(this)); },
        'ToUpper(CultureInfo)': function () { return CS.upperInvariant(String(this)); },
        'ToLower(CultureInfo)': function () { return CS.lowerInvariant(String(this)); },
        'Trim()': function () { return trim(String(this), null, true, true); },
        'Trim(char)': function (code) { return trim(String(this), [code], true, true); },
        'Trim(char[])': function (chars) { return trim(String(this), chars, true, true); },
        'TrimStart()': function () { return trim(String(this), null, true, false); },
        'TrimStart(char)': function (code) { return trim(String(this), [code], true, false); },
        'TrimStart(char[])': function (chars) { return trim(String(this), chars, true, false); },
        'TrimEnd()': function () { return trim(String(this), null, false, true); },
        'TrimEnd(char)': function (code) { return trim(String(this), [code], false, true); },
        'TrimEnd(char[])': function (chars) { return trim(String(this), chars, false, true); },
        'PadLeft(int)': function (width) { return natives['System.String']['PadLeft(int, char)'].call(this, width, 32); },
        'PadLeft(int, char)': function (width, code) {
            if (width < 0)
                throw argRange('totalWidth', 'Non-negative number required.');
            return width > this.length ? padding(width - this.length, code) + this : String(this);
        },
        'PadRight(int)': function (width) { return natives['System.String']['PadRight(int, char)'].call(this, width, 32); },
        'PadRight(int, char)': function (width, code) {
            if (width < 0)
                throw argRange('totalWidth', 'Non-negative number required.');
            return width > this.length ? this + padding(width - this.length, code) : String(this);
        },
        'ToCharArray()': function () {
            var codes = new Uint16Array(this.length);
            for (var index = 0; index < this.length; ++index)
                codes[index] = this.charCodeAt(index);
            return rt().arrayOf(rt().type('System.Char'), codes);
        },
        'ToCharArray(int, int)': function (start, length) {
            if (start < 0 || start > this.length || start > this.length - length)
                throw argRange('startIndex', 'Index was out of range. Must be non-negative and less than the size of the collection.');
            if (length < 0)
                throw argRange('length', 'Index was out of range. Must be non-negative and less than the size of the collection.');
            var codes = new Uint16Array(length);
            for (var index = 0; index < length; ++index)
                codes[index] = this.charCodeAt(start + index);
            return rt().arrayOf(rt().type('System.Char'), codes);
        },
        'CopyTo(int, char[], int, int)': function (sourceIndex, destination, destinationIndex, count) {
            checkNotNull(destination, 'destination');
            if (count < 0)
                throw argRange('count', 'Count cannot be less than zero.');
            if (sourceIndex < 0)
                throw argRange('sourceIndex', 'Index was out of range. Must be non-negative and less than the size of the collection.');
            if (count > this.length - sourceIndex)
                throw argRange('sourceIndex', 'Index and count must refer to a location within the string.');
            if (destinationIndex > destination.length - count || destinationIndex < 0)
                throw argRange('destinationIndex', 'Index and count must refer to a location within the string.');
            for (var index = 0; index < count; ++index)
                destination[destinationIndex + index] = this.charCodeAt(sourceIndex + index);
        },
        'Normalize()': function () { return typeof this.normalize === 'function' ? this.normalize('NFC') : String(this); },
        'IsNormalized()': function () { return typeof this.normalize !== 'function' || this.normalize('NFC') === String(this); },
        'Copy(string)': function (value) { return checkNotNull(value, 'str'); },
        'Intern(string)': function (value) { return checkNotNull(value, 'str'); },
        'GetTypeCode()': function () { return 18; },
        'Create(int, char)': function (length, code) { return padding(length, code); }
    };

    setup['System.String'] = function (ctor) {
        ctor.$format = function (value) { return value; };
        ctor.$equals = function (left, right) { return left === right; };
        ctor.$hash = stringHash;
        ctor.$compare = function (left, right) { return CS.collate(left, right, false); };
        ctor.$default = function () { return null; };
        ctor.$box = function (value) { return value; };
    };

    // --- Comparers of the run time (Comparer<T>.Default, EqualityComparer<T>.Default)

    function comparableName() {
        return rt().memberName('System.IComparable`1', 'CompareTo', 1);
    }

    function plainComparableName() {
        return rt().memberName('System.IComparable', 'CompareTo', 1);
    }

    // A comparison function of the default comparer of a type.
    CS.compareOf = function (type) {
        if (type.$compareFn !== undefined)
            return type.$compareFn;
        var fn;
        if (type.$compare !== undefined) {
            fn = type.$compare;
        } else if (type.$kind === 'enum') {
            fn = function (left, right) { return left < right ? -1 : (left > right ? 1 : 0); };
        } else if (type.$def !== null && type.$def !== undefined && type.$def.$name === 'System.Nullable`1') {
            var inner = CS.compareOf(type.$args[0]);
            fn = function (left, right) {
                if (left === null || left === undefined)
                    return right === null || right === undefined ? 0 : -1;
                if (right === null || right === undefined)
                    return 1;
                return inner(left, right);
            };
        } else {
            var generic = rt().isAssignable(type, rt().inst(rt().type('System.IComparable`1'), [type]));
            var name = generic ? comparableName() : plainComparableName();
            var boxing = type.$struct && !generic;
            fn = function (left, right) {
                if (left === null || left === undefined)
                    return right === null || right === undefined ? 0 : -1;
                if (right === null || right === undefined)
                    return 1;
                var method = left[name];
                if (typeof method !== 'function') {
                    var plain = left[plainComparableName()];
                    if (typeof plain !== 'function')
                        throw fail('System.InvalidOperationException', 'Failed to compare two elements in the array.',
                                   fail('System.ArgumentException', 'At least one object must implement IComparable.'));
                    return plain.call(left, rt().toObject(type, right));
                }
                return method.call(left, boxing ? rt().box(type, right) : right);
            };
        }
        type.$compareFn = fn;
        return fn;
    };

    function equatableName() {
        return rt().memberName('System.IEquatable`1', 'Equals', 1);
    }

    CS.equalsFn = function (type) {
        if (type.$equalsFn !== undefined)
            return type.$equalsFn;
        var fn;
        if (type.$equals !== undefined) {
            fn = type.$equals;
        } else if (type.$kind === 'enum') {
            fn = function (left, right) { return left === right; };
        } else if (type.$def !== null && type.$def !== undefined && type.$def.$name === 'System.Nullable`1') {
            var inner = CS.equalsFn(type.$args[0]);
            fn = function (left, right) {
                if (left === null || left === undefined || right === null || right === undefined)
                    return (left === null || left === undefined) && (right === null || right === undefined);
                return inner(left, right);
            };
        } else {
            var generic = rt().isAssignable(type, rt().inst(rt().type('System.IEquatable`1'), [type]));
            var name = generic ? equatableName() : 'Equals$1';
            fn = function (left, right) {
                if (left === null || left === undefined)
                    return right === null || right === undefined;
                if (right === null || right === undefined)
                    return false;
                if (!generic && type.$struct)
                    return left.Equals$1(rt().box(type, right));
                return left[name](right);
            };
        }
        type.$equalsFn = fn;
        return fn;
    };

    CS.hashFn = function (type) {
        if (type.$hash !== undefined)
            return type.$hash;
        if (type.$kind === 'enum')
            return function (value) { return typeof value === 'number' ? value | 0 : i64.low32(value); };
        if (type.$def !== null && type.$def !== undefined && type.$def.$name === 'System.Nullable`1') {
            var inner = CS.hashFn(type.$args[0]);
            return function (value) { return value === null || value === undefined ? 0 : inner(value); };
        }
        return function (value) { return value === null || value === undefined ? 0 : value.GetHashCode$0(); };
    };

    natives['System.Collections.Generic.DefaultComparer`1'] = {
        'Compare(T, T)': function (left, right) { return CS.compareOf(this.constructor.$args[0])(left, right); }
    };

    natives['System.Collections.Generic.DefaultEqualityComparer`1'] = {
        'Equals(T, T)': function (left, right) { return CS.equalsFn(this.constructor.$args[0])(left, right); },
        'GetHashCode(T)': function (value) { return CS.hashFn(this.constructor.$args[0])(value); }
    };

    natives['System.Collections.Comparer'] = {
        'Compare(object, object)': function (left, right) {
            if (left === right)
                return 0;
            if (left === null || left === undefined)
                return -1;
            if (right === null || right === undefined)
                return 1;
            if (typeof left === 'string' && typeof right === 'string')
                return CS.collate(left, right, false);
            var name = plainComparableName();
            if (typeof left[name] === 'function')
                return left[name](right);
            throw fail('System.ArgumentException', 'At least one object must implement IComparable.');
        }
    };

    // --- Sorting: the introspective sort of .NET (equal keys end up where
    // .NET puts them); items move with their keys.

    function introSort(keys, items, lo, length, compare) {
        if (length < 2)
            return;
        var depthLimit = 2 * (31 - Math.clz32(length) + 1);
        sortRange(keys, items, lo, length, depthLimit, compare);
    }
    CS.introSort = function (keys, index, length, compare, items) {
        introSort(keys, items || null, index, length, compare);
    };

    function swap(keys, items, i, j) {
        var key = keys[i];
        keys[i] = keys[j];
        keys[j] = key;
        if (items !== null) {
            var item = items[i];
            items[i] = items[j];
            items[j] = item;
        }
    }

    function swapIfGreater(keys, items, compare, i, j) {
        if (i !== j && compare(keys[i], keys[j]) > 0)
            swap(keys, items, i, j);
    }

    function sortRange(keys, items, lo, length, depthLimit, compare) {
        var partitionSize = length;
        while (partitionSize > 1) {
            if (partitionSize <= 16) {
                if (partitionSize === 2) {
                    swapIfGreater(keys, items, compare, lo, lo + 1);
                    return;
                }
                if (partitionSize === 3) {
                    swapIfGreater(keys, items, compare, lo, lo + 1);
                    swapIfGreater(keys, items, compare, lo, lo + 2);
                    swapIfGreater(keys, items, compare, lo + 1, lo + 2);
                    return;
                }
                insertionSort(keys, items, lo, partitionSize, compare);
                return;
            }
            if (depthLimit === 0) {
                heapSort(keys, items, lo, partitionSize, compare);
                return;
            }
            --depthLimit;
            var pivotIndex = pickPivotAndPartition(keys, items, lo, partitionSize, compare);
            sortRange(keys, items, pivotIndex + 1, lo + partitionSize - (pivotIndex + 1), depthLimit, compare);
            partitionSize = pivotIndex - lo;
        }
    }

    function pickPivotAndPartition(keys, items, lo, length, compare) {
        var hi = lo + length - 1;
        var middle = lo + ((hi - lo) >> 1);
        swapIfGreater(keys, items, compare, lo, middle);
        swapIfGreater(keys, items, compare, lo, hi);
        swapIfGreater(keys, items, compare, middle, hi);
        var pivot = keys[middle];
        swap(keys, items, middle, hi - 1);
        var left = lo, right = hi - 1;
        while (left < right) {
            while (compare(keys[++left], pivot) < 0) {
            }
            while (compare(pivot, keys[--right]) < 0) {
            }
            if (left >= right)
                break;
            swap(keys, items, left, right);
        }
        if (left !== hi - 1)
            swap(keys, items, left, hi - 1);
        return left;
    }

    function heapSort(keys, items, lo, n, compare) {
        var i;
        for (i = n >> 1; i >= 1; --i)
            downHeap(keys, items, i, n, lo, compare);
        for (i = n; i > 1; --i) {
            swap(keys, items, lo, lo + i - 1);
            downHeap(keys, items, 1, i - 1, lo, compare);
        }
    }

    function downHeap(keys, items, i, n, lo, compare) {
        var d = keys[lo + i - 1];
        var dItem = items !== null ? items[lo + i - 1] : null;
        while (i <= n >> 1) {
            var child = 2 * i;
            if (child < n && compare(keys[lo + child - 1], keys[lo + child]) < 0)
                ++child;
            if (!(compare(d, keys[lo + child - 1]) < 0))
                break;
            keys[lo + i - 1] = keys[lo + child - 1];
            if (items !== null)
                items[lo + i - 1] = items[lo + child - 1];
            i = child;
        }
        keys[lo + i - 1] = d;
        if (items !== null)
            items[lo + i - 1] = dItem;
    }

    function insertionSort(keys, items, lo, length, compare) {
        for (var i = lo; i < lo + length - 1; ++i) {
            var t = keys[i + 1];
            var tItem = items !== null ? items[i + 1] : null;
            var j = i;
            while (j >= lo && compare(t, keys[j]) < 0) {
                keys[j + 1] = keys[j];
                if (items !== null)
                    items[j + 1] = items[j];
                --j;
            }
            keys[j + 1] = t;
            if (items !== null)
                items[j + 1] = tItem;
        }
    }

    function guardedCompare(compare) {
        return function (left, right) {
            try {
                return compare(left, right);
            } catch (error) {
                if (T.debug)
                    T.debug(error);
                var converted = rt().caught(error);
                if (rt().is(converted, rt().type('System.InvalidOperationException')))
                    throw converted;
                throw fail('System.InvalidOperationException', 'Failed to compare two elements in the array.', converted);
            }
        };
    }

    natives['System.Collections.Generic.ArraySortHelper`1'] = {
        'Sort(T[], int, int, Comparison<T>)': function (keys, index, length, comparison) {
            introSort(keys, null, index, length, guardedCompare(comparison));
        }
    };

    // --- Arrays

    function elementType(array) {
        return array.$t !== undefined ? array.$t.$elem : rt().type('System.Object');
    }

    function dataOf(array) {
        return array instanceof CS.MultiArray ? array.a : array;
    }

    function checkArray(array, name) {
        if (array === null || array === undefined)
            throw argNull(name || 'array');
        return array;
    }

    function rangeCheck(array, index, length) {
        if (index < 0)
            throw argRange('index', 'Non-negative number required.');
        if (length < 0)
            throw argRange('length', 'Non-negative number required.');
        if (array.length - index < length)
            throw argError('Offset and length were out of bounds for the array or count is greater than the number of elements from index to the end of the source collection.');
    }

    function defaultCompare(type) {
        return CS.compareOf(type);
    }

    // Sorting with the default comparer: numbers fast (NaN first as in
    // .NET), the rest by the introspective sort.
    function sortDefault(array, index, length, items) {
        var type = elementType(array);
        if (items === null && ArrayBuffer.isView(array) && type.$kind !== 'enum') {
            var view = array.subarray(index, index + length);
            view.sort();
            if (array instanceof Float64Array || array instanceof Float32Array) {
                var nans = 0;
                while (nans < view.length && view[view.length - 1 - nans] !== view[view.length - 1 - nans])
                    ++nans;
                if (nans > 0) {
                    view.copyWithin(nans, 0, view.length - nans);
                    view.fill(NaN, 0, nans);
                }
            }
            return;
        }
        introSort(array, items, index, length, guardedCompare(defaultCompare(type)));
    }

    function comparerFn(comparer, type) {
        if (comparer === null || comparer === undefined)
            return defaultCompare(type);
        var name = rt().memberName('System.Collections.Generic.IComparer`1', 'Compare', 2);
        return function (left, right) { return comparer[name](left, right); };
    }

    function arrayIndexOf(array, value, start, count) {
        var equals = CS.equalsFn(elementType(array));
        for (var index = start; index < start + count; ++index) {
            if (equals(array[index], value))
                return index;
        }
        return -1;
    }

    function arrayLastIndexOf(array, value, start, count) {
        var equals = CS.equalsFn(elementType(array));
        for (var index = start; index > start - count; --index) {
            if (equals(array[index], value))
                return index;
        }
        return -1;
    }

    function binarySearch(array, index, length, value, compare) {
        var lo = index, hi = index + length - 1;
        while (lo <= hi) {
            var middle = lo + ((hi - lo) >> 1);
            var order;
            try {
                order = compare(array[middle], value);
            } catch (error) {
                throw fail('System.InvalidOperationException', 'Failed to compare two elements in the array.', rt().caught(error));
            }
            if (order === 0)
                return middle;
            if (order < 0)
                lo = middle + 1;
            else
                hi = middle - 1;
        }
        return ~lo;
    }

    function copyArray(source, sourceIndex, destination, destinationIndex, length) {
        checkArray(source, 'sourceArray');
        checkArray(destination, 'destinationArray');
        var from = dataOf(source), to = dataOf(destination);
        if (length < 0)
            throw argRange('length', 'Non-negative number required.');
        if (sourceIndex < 0)
            throw argRange('sourceIndex', "Number was less than the array's lower bound in the first dimension.");
        if (destinationIndex < 0)
            throw argRange('destinationIndex', "Number was less than the array's lower bound in the first dimension.");
        if (from.length - sourceIndex < length)
            throw argError("Source array was not long enough. Check the source index, length, and the array's lower bounds.", 'sourceArray');
        if (to.length - destinationIndex < length)
            throw argError("Destination array was not long enough. Check the destination index, length, and the array's lower bounds.", 'destinationArray');
        var sourceType = elementType(source), destinationType = elementType(destination);
        if (source.$t !== undefined && destination.$t !== undefined && sourceType !== destinationType) {
            if (sourceType.$struct !== destinationType.$struct || (sourceType.$struct && destinationType.$name !== 'System.Object'))
                throw fail('System.ArrayTypeMismatchException', 'Source array type cannot be assigned to destination array type.');
        }
        var boxing = sourceType.$struct && !destinationType.$struct;
        var copying = sourceType.$mutable && !boxing;
        if (ArrayBuffer.isView(from) && ArrayBuffer.isView(to) && from.constructor === to.constructor) {
            if (from === to)
                to.copyWithin(destinationIndex, sourceIndex, sourceIndex + length);
            else
                to.set(from.subarray(sourceIndex, sourceIndex + length), destinationIndex);
            return;
        }
        var values = Array.prototype.slice.call(from, sourceIndex, sourceIndex + length);
        for (var index = 0; index < length; ++index) {
            var value = values[index];
            if (boxing)
                value = rt().box(sourceType, value);
            else if (copying && value !== null)
                value = value.$copy();
            else if (!sourceType.$struct && destinationType.$struct)
                value = rt().unbox(destinationType, value);
            to[destinationIndex + index] = value;
        }
    }
    CS.copyArray = copyArray;

    function clearArray(array, index, length) {
        var data = dataOf(checkArray(array));
        if (index < 0 || length < 0 || index > data.length - length)
            throw fail('System.IndexOutOfRangeException', 'Index was outside the bounds of the array.');
        var type = elementType(array);
        for (var position = index; position < index + length; ++position)
            data[position] = rt().defaultOf(type);
    }

    function newArrayOfType(type, lengths) {
        if (lengths.length === 1)
            return rt().newArray(type, lengths[0]);
        return rt().newMultiArray(type, Array.prototype.slice.call(lengths));
    }

    function getValue(array, indices) {
        var type = elementType(array);
        if (array instanceof CS.MultiArray)
            return rt().box(type, array.a[rt().multiIndex(array, indices)]);
        if (indices.length !== 1)
            throw argError('Array was not a one-dimensional array.');
        return rt().box(type, rt().elementAt(array, indices[0]));
    }

    function setValue(array, value, indices) {
        var type = elementType(array);
        var stored = type.$struct ? rt().unbox(type, value) : rt().cast(value, type);
        if (array instanceof CS.MultiArray) {
            array.a[rt().multiIndex(array, indices)] = stored;
            return;
        }
        if (!(indices[0] >= 0 && indices[0] < array.length))
            throw rt().indexError();
        array[indices[0]] = stored;
    }

    function notSupported() {
        throw fail('System.NotSupportedException', 'Collection was of a fixed size.');
    }

    function enumeratorOf(array) {
        var type = elementType(array);
        var Enumerator = rt().inst(rt().type('System.SZGenericArrayEnumerator`1'), [type]);
        return new Enumerator().$ctor$1(dataOf(array));
    }

    natives['System.Array'] = {
        'get_Length()': function () { return dataOf(this).length; },
        'get_LongLength()': function () { return dataOf(this).length; },
        'get_Rank()': function () { return this instanceof CS.MultiArray ? this.d.length : 1; },
        'GetLength(int)': function (dimension) {
            var dims = this instanceof CS.MultiArray ? this.d : [this.length];
            if (!(dimension >= 0 && dimension < dims.length))
                throw fail('System.IndexOutOfRangeException', 'Index was outside the bounds of the array.');
            return dims[dimension];
        },
        'GetUpperBound(int)': function (dimension) { return natives['System.Array']['GetLength(int)'].call(this, dimension) - 1; },
        'GetLowerBound(int)': function (dimension) {
            natives['System.Array']['GetLength(int)'].call(this, dimension);
            return 0;
        },
        'GetValue(int)': function (index) { return getValue(this, [index]); },
        'GetValue(int[])': function (indices) { return getValue(this, indices); },
        'SetValue(object, int)': function (value, index) { setValue(this, value, [index]); },
        'SetValue(object, int[])': function (value, indices) { setValue(this, value, indices); },
        'Clone()': function () { return rt().cloneArray(this); },
        'CopyTo(Array, int)': function (destination, index) { copyArray(this, 0, destination, index, dataOf(this).length); },
        'GetEnumerator()': function () { return enumeratorOf(this); },
        'ICollection.get_Count()': function () { return dataOf(this).length; },
        'IList.get_Item(int)': function (index) { return getValue(this, [index]); },
        'IList.set_Item(int, object)': function (index, value) { setValue(this, value, [index]); },
        'IList.Add(object)': notSupported,
        'IList.Contains(object)': function (value) { return natives['System.Array']['IndexOf(Array, object)'](this, value) >= 0; },
        'IList.IndexOf(object)': function (value) { return natives['System.Array']['IndexOf(Array, object)'](this, value); },
        'IList.Clear()': notSupported,
        'Empty<T>()': function (type) {
            if (type.$emptyArray === undefined)
                type.$emptyArray = rt().newArray(type, 0);
            return type.$emptyArray;
        },
        'Sort(Array)': function (array) {
            checkArray(array);
            sortDefault(array, 0, array.length, null);
        },
        'Sort<T>(T[])': function (type, array) {
            checkArray(array);
            sortDefault(array, 0, array.length, null);
        },
        'Sort<T>(T[], Comparison<T>)': function (type, array, comparison) {
            checkArray(array);
            if (comparison === null || comparison === undefined)
                throw argNull('comparison');
            introSort(array, null, 0, array.length, guardedCompare(comparison));
        },
        'Sort<T>(T[], IComparer<T>)': function (type, array, comparer) {
            checkArray(array);
            if (comparer === null || comparer === undefined)
                sortDefault(array, 0, array.length, null);
            else
                introSort(array, null, 0, array.length, guardedCompare(comparerFn(comparer, type)));
        },
        'Sort<T>(T[], int, int)': function (type, array, index, length) {
            checkArray(array);
            rangeCheck(array, index, length);
            sortDefault(array, index, length, null);
        },
        'Sort<T>(T[], int, int, IComparer<T>)': function (type, array, index, length, comparer) {
            checkArray(array);
            rangeCheck(array, index, length);
            if (comparer === null || comparer === undefined)
                sortDefault(array, index, length, null);
            else
                introSort(array, null, index, length, guardedCompare(comparerFn(comparer, type)));
        },
        'Sort<TKey, TValue>(TKey[], TValue[])': function (keyType, valueType, keys, items) {
            checkArray(keys, 'keys');
            if (items === null || items === undefined) {
                sortDefault(keys, 0, keys.length, null);
                return;
            }
            if (items.length < keys.length)
                throw argError('The items array is not long enough.');
            introSort(keys, items, 0, keys.length, guardedCompare(defaultCompare(keyType)));
        },
        'Reverse(Array)': function (array) { reverse(checkArray(array), 0, array.length); },
        'Reverse(Array, int, int)': function (array, index, length) { reverse(checkArray(array), index, length); },
        'Reverse<T>(T[])': function (type, array) { reverse(checkArray(array), 0, array.length); },
        'Reverse<T>(T[], int, int)': function (type, array, index, length) { reverse(checkArray(array), index, length); },
        'IndexOf(Array, object)': function (array, value) {
            checkArray(array);
            var data = dataOf(array);
            var type = elementType(array);
            for (var index = 0; index < data.length; ++index) {
                if (rt().objectEquals(rt().toObject(type, data[index]), value))
                    return index;
            }
            return -1;
        },
        'IndexOf<T>(T[], T)': function (type, array, value) { return arrayIndexOf(checkArray(array), value, 0, array.length); },
        'IndexOf<T>(T[], T, int)': function (type, array, value, start) {
            checkArray(array);
            if (start < 0 || start > array.length)
                throw argRange('startIndex', 'Index was out of range. Must be non-negative and less than or equal to the size of the collection.');
            return arrayIndexOf(array, value, start, array.length - start);
        },
        'IndexOf<T>(T[], T, int, int)': function (type, array, value, start, count) {
            checkArray(array);
            if (start < 0 || start > array.length)
                throw argRange('startIndex', 'Index was out of range. Must be non-negative and less than or equal to the size of the collection.');
            if (count < 0 || count > array.length - start)
                throw argRange('count', 'Count must be positive and count must refer to a location within the string/array/collection.');
            return arrayIndexOf(array, value, start, count);
        },
        'LastIndexOf<T>(T[], T)': function (type, array, value) {
            return arrayLastIndexOf(checkArray(array), value, array.length - 1, array.length);
        },
        'LastIndexOf<T>(T[], T, int)': function (type, array, value, start) {
            checkArray(array);
            if (array.length > 0 && (start < 0 || start >= array.length))
                throw argRange('startIndex', 'Index was out of range. Must be non-negative and less than the size of the collection.');
            return arrayLastIndexOf(array, value, start, start + 1);
        },
        'BinarySearch<T>(T[], T)': function (type, array, value) {
            return binarySearch(checkArray(array), 0, array.length, value, defaultCompare(type));
        },
        'BinarySearch<T>(T[], T, IComparer<T>)': function (type, array, value, comparer) {
            return binarySearch(checkArray(array), 0, array.length, value, comparerFn(comparer, type));
        },
        'BinarySearch<T>(T[], int, int, T)': function (type, array, index, length, value) {
            checkArray(array);
            rangeCheck(array, index, length);
            return binarySearch(array, index, length, value, defaultCompare(type));
        },
        'BinarySearch(Array, object)': function (array, value) {
            checkArray(array);
            var type = elementType(array);
            var compare = defaultCompare(type);
            return binarySearch(array, 0, array.length, type.$struct ? rt().unbox(type, value) : value, compare);
        },
        'Copy(Array, Array, int)': function (source, destination, length) { copyArray(source, 0, destination, 0, length); },
        'Copy(Array, int, Array, int, int)': copyArray,
        'Copy(Array, Array, long)': function (source, destination, length) {
            copyArray(source, 0, destination, 0, typeof length === 'number' ? length : i64.toFloat(length));
        },
        'ConstrainedCopy(Array, int, Array, int, int)': copyArray,
        'Clear(Array)': function (array) { clearArray(array, 0, dataOf(checkArray(array)).length); },
        'Clear(Array, int, int)': clearArray,
        'Fill<T>(T[], T)': function (type, array, value) {
            checkArray(array);
            for (var index = 0; index < array.length; ++index)
                array[index] = type.$mutable ? value.$copy() : value;
        },
        'Fill<T>(T[], T, int, int)': function (type, array, value, start, count) {
            checkArray(array);
            if (start < 0 || start > array.length)
                throw argRange('startIndex', 'Index was out of range. Must be non-negative and less than or equal to the size of the collection.');
            if (count < 0 || start > array.length - count)
                throw argRange('count', 'Count must be positive and count must refer to a location within the string/array/collection.');
            for (var index = start; index < start + count; ++index)
                array[index] = type.$mutable ? value.$copy() : value;
        },
        'Resize<T>(ref T[], int)': function (type, ref, size) {
            if (size < 0)
                throw argRange('newSize', 'Non-negative number required.');
            var old = ref.v;
            var array = rt().newArray(type, size);
            if (old !== null && old !== undefined) {
                for (var index = 0; index < Math.min(size, old.length); ++index)
                    array[index] = old[index];
            }
            ref.v = array;
        },
        'CreateInstance(Type, int)': function (typeObject, length) { return newArrayOfType(typeObject.$type, [length]); },
        'CreateInstance(Type, int[])': function (typeObject, lengths) { return newArrayOfType(typeObject.$type, lengths); }
    };

    function reverse(array, index, length) {
        var data = dataOf(array);
        if (index < 0)
            throw argRange('index', 'Non-negative number required.');
        if (length < 0)
            throw argRange('length', 'Non-negative number required.');
        if (data.length - index < length)
            throw argError('Offset and length were out of bounds for the array or count is greater than the number of elements from index to the end of the source collection.');
        for (var lo = index, hi = index + length - 1; lo < hi; ++lo, --hi) {
            var value = data[lo];
            data[lo] = data[hi];
            data[hi] = value;
        }
    }

    // The generic collection interfaces on arrays (IList<T> and others).
    setup['System.Array'] = function (ctor) {
        var targets = [Array.prototype, Object.getPrototypeOf(Int8Array.prototype)];
        var name = function (iface, member, arity) { return rt().memberName(iface, member, arity); };
        var members = [
            [name('System.Collections.Generic.IEnumerable`1', 'GetEnumerator', 0), function () { return enumeratorOf(this); }],
            [name('System.Collections.Generic.ICollection`1', 'get_Count', 0), function () { return this.length; }],
            [name('System.Collections.Generic.ICollection`1', 'get_IsReadOnly', 0), function () { return true; }],
            [name('System.Collections.Generic.ICollection`1', 'Add', 1), notSupported],
            [name('System.Collections.Generic.ICollection`1', 'Clear', 0), notSupported],
            [name('System.Collections.Generic.ICollection`1', 'Remove', 1), notSupported],
            [name('System.Collections.Generic.ICollection`1', 'Contains', 1), function (value) {
                return arrayIndexOf(this, value, 0, this.length) >= 0;
            }],
            [name('System.Collections.Generic.ICollection`1', 'CopyTo', 2), function (destination, index) {
                copyArray(this, 0, destination, index, this.length);
            }],
            [name('System.Collections.Generic.IList`1', 'get_Item', 1), function (index) {
                if (!(index >= 0 && index < this.length))
                    throw indexRange();
                return this[index];
            }],
            [name('System.Collections.Generic.IList`1', 'set_Item', 2), function (index, value) {
                if (!(index >= 0 && index < this.length))
                    throw indexRange();
                this[index] = value;
            }],
            [name('System.Collections.Generic.IList`1', 'IndexOf', 1), function (value) { return arrayIndexOf(this, value, 0, this.length); }],
            [name('System.Collections.Generic.IList`1', 'Insert', 2), notSupported],
            [name('System.Collections.Generic.IList`1', 'RemoveAt', 1), notSupported],
            [name('System.Collections.Generic.IReadOnlyCollection`1', 'get_Count', 0), function () { return this.length; }],
            [name('System.Collections.Generic.IReadOnlyList`1', 'get_Item', 1), function (index) {
                if (!(index >= 0 && index < this.length))
                    throw indexRange();
                return this[index];
            }]
        ];
        targets.forEach(function (target) {
            members.forEach(function (pair) {
                Object.defineProperty(target, pair[0], { value: pair[1], writable: true, configurable: true, enumerable: false });
            });
        });
    };

    // --- Delegates

    natives['System.Delegate'] = {
        'DynamicInvoke(object[])': function (args) {
            var values = args === null || args === undefined ? [] : Array.prototype.map.call(args, unboxed);
            return this.apply(null, values);
        },
        'get_Target()': function () { return this.$target === undefined ? null : this.$target; },
        'get_Method()': function () {
            var Info = rt().type('System.Reflection.RuntimeMethodInfo');
            var info = new Info();
            info.$fn = this.$method || this;
            info.$name = this.$method !== undefined && this.$method.$csName !== undefined ? this.$method.$csName : 'Invoke';
            return info;
        },
        'GetInvocationList()': function () {
            return rt().arrayOf(rt().type('System.Delegate'), (this.$list || [this]).slice());
        },
        'Clone()': function () { return this; },
        'Equals(object)': function (other) { return rt().delegateEquals(this, other); },
        'GetHashCode()': function () { return this.$t !== undefined ? stringHash(this.$t.$id) : 0; },
        'Combine(Delegate, Delegate)': function (left, right) { return rt().combine(left, right); },
        'Combine(Delegate[])': function (list) {
            var result = null;
            for (var index = 0; index < (list || []).length; ++index)
                result = rt().combine(result, list[index]);
            return result;
        },
        'Remove(Delegate, Delegate)': function (source, value) { return rt().removeDelegate(source, value); },
        'RemoveAll(Delegate, Delegate)': function (source, value) {
            var result = source, previous;
            do {
                previous = result;
                result = rt().removeDelegate(result, value);
            } while (result !== previous && result !== null);
            return result;
        }
    };

    // --- Nullable<T>: the receiver is the value or null.

    natives['System.Nullable`1'] = {
        'get_HasValue()': function () { return this !== null && this !== undefined; },
        'get_Value()': function () { return rt().nullableValue(this); },
        'GetValueOrDefault()': function () { return this === null || this === undefined ? 0 : this.valueOf(); },
        'GetValueOrDefault(T)': function (value) { return this === null || this === undefined ? value : this.valueOf(); },
        'Equals(object)': function (other) {
            if (this === null || this === undefined)
                return other === null || other === undefined;
            return rt().objectEquals(other, this.valueOf()) || unboxed(other) === this.valueOf();
        },
        'GetHashCode()': function () { return this === null || this === undefined ? 0 : fieldHash(this.valueOf()); },
        'ToString()': function () { return this === null || this === undefined ? '' : rt().objectString(this.valueOf()); }
    };

    natives['System.Nullable'] = {
        'GetUnderlyingType(Type)': function (typeObject) {
            checkNotNull(typeObject, 'nullableType');
            var type = typeObject.$type;
            if (type.$def !== null && type.$def !== undefined && type.$def.$name === 'System.Nullable`1')
                return rt().typeObject(type.$args[0]);
            return null;
        }
    };
})(globalThis);
