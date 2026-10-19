// Go: formatting values as the package fmt does (%v, %d, %s, %q, %x, %f,
// %e, %g, %t, %c, %U, %p, %T, flags and width). Strings are UTF-8 bytes.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Go = T.go;
    var rt = Go.runtime;
    if (rt.format)
        return;

    var utf8 = T.utf8;
    var numbers = T.numbers;
    var i64 = T.i64, u64 = T.u64;

    var INTEGER_KINDS = { int: 1, int8: 1, int16: 1, int32: 1, int64: 1, uint: 1, uint8: 1, uint16: 1, uint32: 1,
                          uint64: 1, uintptr: 1 };
    var UNSIGNED = { uint: 1, uint8: 1, uint16: 1, uint32: 1, uint64: 1, uintptr: 1 };

    function isWideKind(kind) {
        return kind === 'int' || kind === 'int64' || kind === 'uint' || kind === 'uint64' || kind === 'uintptr';
    }

    // An integer as a string in a base.
    function integerText(desc, value, base) {
        if (isWideKind(desc.kind))
            return (UNSIGNED[desc.kind] ? u64 : i64).str(value, base);
        return value.toString(base);
    }

    function isNegative(desc, value) {
        if (typeof value === 'number')
            return value < 0;
        return !UNSIGNED[desc.kind] && value.hi < 0;
    }

    // The number of runes (fmt measures width in runes).
    function runeWidth(text) {
        return utf8.runeCount(text);
    }

    function pad(text, flags, zeroAllowed) {
        if (flags.width === undefined)
            return text;
        var width = runeWidth(text);
        if (width >= flags.width)
            return text;
        var count = flags.width - width;
        if (flags.minus)
            return text + spaces(count);
        if (flags.zero && zeroAllowed) {
            // Zeros go after the sign.
            var sign = /^[+\- ]/.test(text) ? text.charAt(0) : '';
            var rest = sign ? text.substring(1) : text;
            var prefix = '';
            if (/^0[xXbBoO]/.test(rest) && flags.sharp) {
                prefix = rest.substring(0, 2);
                rest = rest.substring(2);
            }
            return sign + prefix + repeat('0', count) + rest;
        }
        return spaces(count) + text;
    }

    function spaces(count) {
        return repeat(' ', count);
    }

    function repeat(text, count) {
        var result = '';
        for (var index = 0; index < count; ++index)
            result += text;
        return result;
    }

    function sign(text, negative, flags) {
        if (negative)
            return '-' + text;
        if (flags.plus)
            return '+' + text;
        if (flags.space)
            return ' ' + text;
        return text;
    }

    // --- Integers

    function formatInteger(desc, value, verb, flags) {
        var negative = isNegative(desc, value);
        var magnitude = negative ? (isWideKind(desc.kind) ? i64.neg(value) : -value) : value;
        var text;
        switch (verb) {
        case 'v':
        case 'd':
            text = integerText(desc, magnitude, 10).replace(/^-/, '');
            break;
        case 'b':
            text = integerText(desc, magnitude, 2).replace(/^-/, '');
            if (flags.sharp)
                text = '0b' + text;
            break;
        case 'o':
        case 'O':
            text = integerText(desc, magnitude, 8).replace(/^-/, '');
            if (verb === 'O')
                text = '0o' + text;
            else if (flags.sharp && text !== '0')
                text = '0' + text;
            break;
        case 'x':
        case 'X':
            text = integerText(desc, magnitude, 16).replace(/^-/, '');
            if (verb === 'X')
                text = text.toUpperCase();
            if (flags.sharp)
                text = (verb === 'X' ? '0X' : '0x') + text;
            break;
        case 'c':
            return pad(rt.runeString(typeof value === 'number' ? value : 0xFFFD), flags, false);
        case 'q':
            return pad(quoteRune(typeof value === 'number' ? value : 0xFFFD, flags.plus), flags, false);
        case 'U': {
            var hex = integerText(desc, value, 16).toUpperCase();
            while (hex.length < 4)
                hex = '0' + hex;
            text = 'U+' + hex;
            if (flags.sharp && typeof value === 'number' && value >= 0 && value <= 0x10FFFF)
                text += " '" + rt.runeString(value) + "'";
            return pad(text, flags, false);
        }
        case 'e':
        case 'E':
        case 'f':
        case 'F':
        case 'g':
        case 'G':
            return null;
        default:
            return null;
        }
        if (flags.precision !== undefined) {
            if (flags.precision === 0 && text === '0')
                text = '';
            var digits = text.replace(/^0[xXbBoO]/, '');
            var prefix = text.substring(0, text.length - digits.length);
            while (digits.length < flags.precision)
                digits = '0' + digits;
            text = prefix + digits;
        }
        return pad(sign(text, negative, flags), flags, flags.precision === undefined);
    }

    // --- Floats

    function formatFloat(value, verb, flags, size) {
        var text;
        var even = true;
        if (value !== value) {
            text = 'NaN';
            return pad(flags.plus ? '+NaN' : (flags.space ? ' NaN' : 'NaN'), flags, false);
        }
        if (value === Infinity || value === -Infinity) {
            text = value > 0 ? (flags.plus ? '+Inf' : (flags.space ? ' Inf' : '+Inf')) : '-Inf';
            if (value > 0 && !flags.plus && !flags.space && verb !== 'v')
                text = '+Inf';
            return pad(text, flags, false);
        }
        var negative = value < 0 || (value === 0 && 1 / value < 0);
        var magnitude = Math.abs(value);
        var precision = flags.precision;
        switch (verb) {
        case 'v':
        case 'g':
        case 'G':
            if (precision === undefined)
                text = shortestG(magnitude, size, verb === 'G');
            else
                text = numbers.general(magnitude, precision === 0 ? 1 : precision, even, flags.sharp, 2, verb === 'G');
            if (flags.sharp && text.indexOf('.') < 0 && !/[eE]/.test(text))
                text += '.';
            break;
        case 'f':
        case 'F':
            text = numbers.fixed(magnitude, precision === undefined ? 6 : precision, even);
            if (flags.sharp && text.indexOf('.') < 0)
                text += '.';
            break;
        case 'e':
        case 'E':
            text = numbers.exponential(magnitude, precision === undefined ? 6 : precision, even, 2, verb === 'E');
            break;
        case 'b': {
            text = String(magnitude);
            break;
        }
        case 'x':
        case 'X':
            text = hexFloat(magnitude, precision, verb === 'X');
            break;
        default:
            return null;
        }
        return pad(sign(text, negative, flags), flags, true);
    }

    // %v of a float: the shortest digits; an exponent when it is < -4 or >= 6, as
    // strconv.FormatFloat(x, 'g', -1, 64): 1e+06, 123456.
    function shortestG(magnitude, size, upper) {
        if (magnitude === 0)
            return '0';
        if (size === 32)
            magnitude = Math.fround(magnitude);
        var digits;
        if (size === 32) {
            // The shortest digits of a float32: the lowest precision at which
            // fround gives the same value.
            for (var precision = 1; precision <= 9; ++precision) {
                var candidate = Number(magnitude.toPrecision(precision));
                if (Math.fround(candidate) === magnitude) {
                    digits = numbers.shortest(candidate);
                    break;
                }
            }
        } else {
            digits = numbers.shortest(magnitude);
        }
        var exponent = digits.exponent - 1;
        var eprec = 6;
        if (exponent < -4 || exponent >= eprec) {
            var mantissa = digits.digits.charAt(0) + (digits.digits.length > 1 ? '.' + digits.digits.substring(1) : '');
            var power = String(Math.abs(exponent));
            if (power.length < 2)
                power = '0' + power;
            return mantissa + (upper ? 'E' : 'e') + (exponent < 0 ? '-' : '+') + power;
        }
        if (exponent < 0)
            return '0.' + repeat('0', -exponent - 1) + digits.digits;
        if (digits.digits.length <= exponent + 1)
            return digits.digits + repeat('0', exponent + 1 - digits.digits.length);
        return digits.digits.substring(0, exponent + 1) + '.' + digits.digits.substring(exponent + 1);
    }
    rt.shortestFloat = shortestG;

    function hexFloat(magnitude, precision, upper) {
        if (magnitude === 0)
            return upper ? '0X0P+00' : '0x0p+00';
        var exponent = Math.floor(Math.log2(magnitude));
        var mantissa = magnitude / Math.pow(2, exponent);
        while (mantissa >= 2) {
            mantissa /= 2;
            ++exponent;
        }
        while (mantissa < 1) {
            mantissa *= 2;
            --exponent;
        }
        var fraction = (mantissa - 1).toString(16).substring(2);
        if (precision !== undefined)
            fraction = (fraction + repeat('0', precision)).substring(0, precision);
        var text = '0x1' + (fraction ? '.' + fraction : '') + 'p' + (exponent < 0 ? '-' : '+') +
            (Math.abs(exponent) < 10 ? '0' : '') + Math.abs(exponent);
        return upper ? text.toUpperCase() : text;
    }

    // --- Strings

    // A Go string in quotes: non-printable characters as escapes, non-ASCII
    // as it is (with the + flag as a \u escape).
    function quoteString(bytes, ascii) {
        var result = '"';
        for (var index = 0; index < bytes.length;) {
            var rune = utf8.decodeRune(bytes, index);
            var code = rune[0];
            if (code === 0xFFFD && rune[1] === 1 && bytes.charCodeAt(index) !== 0xEF) {
                result += '\\x' + hex2(bytes.charCodeAt(index));
                index += 1;
                continue;
            }
            index += rune[1];
            result += escapeRune(code, '"', ascii);
        }
        return result + '"';
    }
    rt.quoteString = quoteString;

    function hex2(value) {
        return (value < 16 ? '0' : '') + value.toString(16);
    }

    function escapeRune(code, quote, ascii) {
        switch (code) {
        case 7:
            return '\\a';
        case 8:
            return '\\b';
        case 12:
            return '\\f';
        case 10:
            return '\\n';
        case 13:
            return '\\r';
        case 9:
            return '\\t';
        case 11:
            return '\\v';
        case 92:
            return '\\\\';
        }
        if (String.fromCharCode(code) === quote)
            return '\\' + quote;
        if (code < 32 || code === 127)
            return '\\x' + hex2(code);
        if (code < 128)
            return String.fromCharCode(code);
        if (ascii || !isPrint(code)) {
            if (code < 0x10000)
                return '\\u' + ('000' + code.toString(16)).slice(-4);
            return '\\U' + ('0000000' + code.toString(16)).slice(-8);
        }
        return utf8.encodeRune(code);
    }

    function isPrint(code) {
        return !(code >= 0x80 && code < 0xA0) && code !== 0xAD && !(code >= 0x2028 && code <= 0x2029) &&
            !(code >= 0xD800 && code <= 0xDFFF) && code !== 0xFEFF && !(code >= 0xFFF9 && code <= 0xFFFB);
    }

    function quoteRune(code, ascii) {
        return "'" + escapeRune(code, "'", ascii) + "'";
    }
    rt.quoteRune = quoteRune;

    function formatString(text, verb, flags) {
        switch (verb) {
        case 'v':
        case 's':
            if (flags.precision !== undefined)
                text = truncateRunes(text, flags.precision);
            return pad(text, flags, false);
        case 'q':
            if (flags.precision !== undefined)
                text = truncateRunes(text, flags.precision);
            if (flags.sharp && text.indexOf('`') < 0 && /^[^\x00-\x08\x0a-\x1f\x7f]*$/.test(text))
                return pad('`' + text + '`', flags, false);
            return pad(quoteString(text, flags.plus), flags, false);
        case 'x':
        case 'X': {
            var hex = '';
            for (var index = 0; index < text.length; ++index) {
                if (flags.space && index > 0)
                    hex += ' ';
                if (flags.sharp && (flags.space || index === 0))
                    hex += verb === 'X' ? '0X' : '0x';
                hex += hex2(text.charCodeAt(index));
            }
            return pad(verb === 'X' ? hex.toUpperCase().replace(/0X/g, '0X') : hex, flags, false);
        }
        }
        return null;
    }

    function truncateRunes(text, count) {
        var index = 0;
        for (var runes = 0; runes < count && index < text.length; ++runes)
            index += utf8.decodeRune(text, index)[1];
        return text.substring(0, index);
    }

    // --- Values by type description

    var NIL_TEXT = '<nil>';

    // A value of the type desc with the verb verb. depth > 0 - nested
    // (inside a slice, a struct): %v strings without quotes, as in Go.
    function format(desc, value, verb, flags, depth) {
        depth = depth || 0;
        if (depth > 64)
            return '...';
        if (desc === null)
            return verb === 'T' ? NIL_TEXT : (verb === 'v' || verb === 's' ? pad(NIL_TEXT, flags, false) : '%!' + verb + '(<nil>)');
        // An interface value - its dynamic type.
        if (desc.kind === 'iface') {
            if (value === null)
                return verb === 'v' || verb === 's' ? pad(NIL_TEXT, flags, false) : '%!' + verb + '(<nil>)';
            return format(value.$t, rt.valueOf(value), verb, flags, depth);
        }
        if (desc.str === 'js.Value')
            return pad(utf8.encode(Go.jsText(value.ref)), flags, false);
        // error and Stringer
        if (!flags.sharpV && (verb === 'v' || verb === 's' || verb === 'q' || verb === 'x' || verb === 'X')) {
            var text = methodText(desc, value);
            if (text !== null)
                return formatString(text, verb, flags);
        }
        switch (desc.kind) {
        case 'bool':
            if (verb === 'v' || verb === 't')
                return pad(value ? 'true' : 'false', flags, false);
            break;
        case 'string': {
            if (flags.sharpV)
                return quoteString(value, false);
            var stringText = formatString(value, verb, flags);
            if (stringText !== null)
                return stringText;
            break;
        }
        case 'float32':
        case 'float64': {
            var floatText = formatFloat(value, verb, flags, desc.kind === 'float32' ? 32 : 64);
            if (floatText !== null)
                return floatText;
            break;
        }
        case 'ptr':
            return formatPointer(desc, value, verb, flags, depth);
        case 'struct':
            if (verb === 'v' || INTEGER_KINDS[verb] === undefined)
                return formatStruct(desc, value, verb, flags, depth);
            break;
        case 'slice':
        case 'array': {
            var items = desc.kind === 'slice' ? (value.a === null ? null : rt.toArray(value)) : value;
            if ((verb === 's' || verb === 'q' || verb === 'x' || verb === 'X') && desc.elem.kind === 'uint8')
                return formatString(utf8.fromBytes(items || []), verb, flags);
            if (flags.sharpV) {
                if (desc.kind === 'slice' && items === null)
                    return desc.str + '(nil)';
                return desc.str + '{' + items.map(function (item) { return format(desc.elem, item, verb, flags, depth + 1); }).join(', ') + '}';
            }
            if (verb === 'p' && desc.kind === 'slice')
                return pad('0x' + fakeAddress(value), flags, false);
            return pad('[' + (items || []).map(function (item) {
                return format(desc.elem, item, verb, withoutWidth(flags), depth + 1);
            }).join(' ') + ']', flags, false);
        }
        case 'map':
            return formatMap(desc, value, verb, flags, depth);
        case 'chan':
        case 'func':
            if (value === null)
                return flags.sharpV ? '(' + desc.str + ')(nil)' : pad(verb === 'v' ? NIL_TEXT : '%!' + verb + '(' + desc.str + '=<nil>)', flags, false);
            if (verb === 'v' || verb === 'p')
                return pad('0x' + fakeAddress(value), flags, false);
            break;
        default:
            if (INTEGER_KINDS[desc.kind] !== undefined) {
                if (flags.sharpV)
                    return desc.named ? desc.str + '(' + integerText(desc, value, 10) + ')' : integerText(desc, value, 10);
                var formatted = formatInteger(desc, value, verb, flags);
                if (formatted !== null)
                    return formatted;
                if ('eEfFgG'.indexOf(verb) >= 0)
                    break;
            }
        }
        return '%!' + verb + '(' + desc.str + '=' + format(desc, value, 'v', {}, depth + 1) + ')';
    }
    rt.format = format;

    function withoutWidth(flags) {
        if (flags.width === undefined)
            return flags;
        var copy = {};
        Object.keys(flags).forEach(function (key) { copy[key] = flags[key]; });
        // Go applies the width to every element - kept so.
        return copy;
    }

    // The text of Error() or String() if the type has such a method.
    function methodText(desc, value) {
        var set = desc.methodSet;
        if (set === undefined)
            return null;
        if (set.Error === true) {
            var receiver = boxed(desc, value);
            return receiver.Error();
        }
        if (set.String === true) {
            var target = boxed(desc, value);
            return target.String();
        }
        return null;
    }

    // A value on which a method can be called: a struct object (or a value
    // with its own methods) as it is, anything else in the box of its type.
    function boxed(desc, value) {
        if (value !== null && typeof value === 'object' && !(value instanceof rt.Box) &&
            (desc.box === undefined || (desc.kind === 'ptr' && desc.elem.kind === 'struct')))
            return value;
        return new desc.box(value);
    }

    var addresses = new WeakMap();
    var nextAddress = 0xc000010000;
    function fakeAddress(object) {
        if (object === null || (typeof object !== 'object' && typeof object !== 'function'))
            return '0';
        var address = addresses.get(object);
        if (address === undefined) {
            address = nextAddress;
            nextAddress += 0x20;
            addresses.set(object, address);
        }
        return address.toString(16);
    }
    rt.fakeAddress = fakeAddress;

    function formatPointer(desc, value, verb, flags, depth) {
        if (value === null) {
            if (flags.sharpV)
                return '(' + desc.str + ')(nil)';
            return pad(verb === 'v' || verb === 's' ? NIL_TEXT : (verb === 'p' ? '0x0' : '%!' + verb + '(' + desc.str + '=<nil>)'), flags, false);
        }
        if (verb === 'p')
            return pad('0x' + fakeAddress(value), flags, false);
        // A pointer to a struct, an array, a slice, a map at the top level -
        // &{...}.
        var elem = desc.elem;
        if (depth === 0 && (verb === 'v' || verb === 's') &&
            (elem.kind === 'struct' || elem.kind === 'array' || elem.kind === 'slice' || elem.kind === 'map')) {
            var target = elem.kind === 'struct' || elem.kind === 'array' ? value : value.v;
            return '&' + format(elem, target, verb, flags, depth + 1);
        }
        if (flags.sharpV)
            return '(' + desc.str + ')(0x' + fakeAddress(value) + ')';
        if (verb === 'v' || verb === 'x' || verb === 'X' || verb === 'd')
            return pad('0x' + fakeAddress(value), flags, false);
        return '%!' + verb + '(' + desc.str + '=0x' + fakeAddress(value) + ')';
    }

    function formatStruct(desc, value, verb, flags, depth) {
        var parts = desc.fields.map(function (field) {
            var text = format(field.desc, value[field.js], verb, flags, depth + 1);
            if (flags.sharpV)
                return field.name + ':' + text;
            return flags.plusV ? field.name + ':' + text : text;
        });
        if (flags.sharpV)
            return desc.str + '{' + parts.join(', ') + '}';
        return '{' + parts.join(' ') + '}';
    }

    function compareKeys(desc, left, right) {
        switch (desc.kind) {
        case 'string':
            return left < right ? -1 : (left > right ? 1 : 0);
        case 'bool':
            return left === right ? 0 : (left ? 1 : -1);
        case 'float32':
        case 'float64':
            return left < right ? -1 : (left > right ? 1 : 0);
        case 'iface': {
            if (left === null || right === null)
                return left === right ? 0 : (left === null ? -1 : 1);
            if (left.$t !== right.$t)
                return left.$t.id - right.$t.id;
            return compareKeys(left.$t, rt.valueOf(left), rt.valueOf(right));
        }
        case 'struct':
            for (var index = 0; index < desc.fields.length; ++index) {
                var field = desc.fields[index];
                var order = compareKeys(field.desc, left[field.js], right[field.js]);
                if (order !== 0)
                    return order;
            }
            return 0;
        case 'array':
            for (var position = 0; position < left.length; ++position) {
                var itemOrder = compareKeys(desc.elem, left[position], right[position]);
                if (itemOrder !== 0)
                    return itemOrder;
            }
            return 0;
        }
        if (INTEGER_KINDS[desc.kind] !== undefined)
            return (UNSIGNED[desc.kind] ? u64 : i64).cmp(left, right);
        return 0;
    }

    function formatMap(desc, value, verb, flags, depth) {
        if (value === null && flags.sharpV)
            return desc.str + '(nil)';
        var entries = rt.mapEntries(value).slice();
        entries.sort(function (left, right) { return compareKeys(desc.key, left[0], right[0]); });
        var parts = entries.map(function (entry) {
            return format(desc.key, entry[0], verb, flags, depth + 1) + ':' + format(desc.elem, entry[1], verb, flags, depth + 1);
        });
        if (flags.sharpV)
            return desc.str + '{' + parts.join(', ') + '}';
        return pad('map[' + parts.join(' ') + ']', flags, false);
    }

    // --- Println, Print, Printf
    //
    // The arguments are an array of interface values (boxes or objects).

    function argument(value, verb, flags) {
        if (value === null) {
            if (verb === 'T')
                return pad(NIL_TEXT, flags, false);
            if (verb === 'v' || verb === 's')
                return pad(NIL_TEXT, flags, false);
            return '%!' + verb + '(<nil>)';
        }
        var desc = value.$t;
        if (verb === 'T')
            return pad(desc.str, flags, false);
        if (verb === 'p' && desc.kind !== 'ptr' && desc.kind !== 'slice' && desc.kind !== 'map' &&
            desc.kind !== 'chan' && desc.kind !== 'func')
            return '%!p(' + desc.str + '=' + format(desc, rt.valueOf(value), 'v', {}, 0) + ')';
        return format(desc, rt.valueOf(value), verb, flags, 0);
    }

    rt.sprint = function (args) {
        var text = '';
        for (var index = 0; index < args.length; ++index) {
            var value = args[index];
            var isString = value !== null && value.$t.kind === 'string';
            var previousString = index > 0 && args[index - 1] !== null && args[index - 1].$t.kind === 'string';
            if (index > 0 && !isString && !previousString)
                text += ' ';
            text += argument(value, 'v', {});
        }
        return text;
    };

    rt.sprintln = function (args) {
        var parts = [];
        for (var index = 0; index < args.length; ++index)
            parts.push(argument(args[index], 'v', {}));
        return parts.join(' ') + '\n';
    };

    rt.sprintf = function (formatText, args) {
        var result = '';
        var argIndex = 0;
        var length = formatText.length;
        var reordered = false;
        for (var index = 0; index < length;) {
            var char = formatText.charAt(index);
            if (char !== '%') {
                var next = formatText.indexOf('%', index);
                if (next < 0)
                    next = length;
                result += formatText.substring(index, next);
                index = next;
                continue;
            }
            ++index;
            var flags = {};
            // Flags
            for (; index < length; ++index) {
                var flag = formatText.charAt(index);
                if (flag === '+')
                    flags.plus = true;
                else if (flag === '-')
                    flags.minus = true;
                else if (flag === '#')
                    flags.sharp = true;
                else if (flag === ' ')
                    flags.space = true;
                else if (flag === '0')
                    flags.zero = true;
                else
                    break;
            }
            // [n] - the argument number
            var explicit = /^\[(\d+)\]/.exec(formatText.substring(index));
            if (explicit !== null) {
                argIndex = Number(explicit[1]) - 1;
                index += explicit[0].length;
                reordered = true;
            }
            // Width
            if (formatText.charAt(index) === '*') {
                ++index;
                var widthArg = args[argIndex++];
                var widthValue = widthArg !== null && widthArg !== undefined && INTEGER_KINDS[widthArg.$t.kind] ? Number(i64.toFloat(rt.valueOf(widthArg))) : null;
                if (widthValue === null) {
                    result += '%!(BADWIDTH)';
                } else {
                    if (widthValue < 0) {
                        flags.minus = true;
                        widthValue = -widthValue;
                    }
                    flags.width = widthValue;
                }
            } else {
                var width = /^\d+/.exec(formatText.substring(index));
                if (width !== null) {
                    flags.width = Number(width[0]);
                    index += width[0].length;
                }
            }
            // Precision
            if (formatText.charAt(index) === '.') {
                ++index;
                explicit = /^\[(\d+)\]/.exec(formatText.substring(index));
                if (explicit !== null) {
                    argIndex = Number(explicit[1]) - 1;
                    index += explicit[0].length;
                    reordered = true;
                }
                if (formatText.charAt(index) === '*') {
                    ++index;
                    var precisionArg = args[argIndex++];
                    var precisionValue = precisionArg !== null && precisionArg !== undefined && INTEGER_KINDS[precisionArg.$t.kind]
                        ? Number(i64.toFloat(rt.valueOf(precisionArg))) : null;
                    if (precisionValue === null || precisionValue < 0)
                        result += '%!(BADPREC)';
                    else
                        flags.precision = precisionValue;
                } else {
                    var precision = /^\d+/.exec(formatText.substring(index));
                    flags.precision = precision !== null ? Number(precision[0]) : 0;
                    if (precision !== null)
                        index += precision[0].length;
                }
            }
            explicit = /^\[(\d+)\]/.exec(formatText.substring(index));
            if (explicit !== null) {
                argIndex = Number(explicit[1]) - 1;
                index += explicit[0].length;
                reordered = true;
            }
            if (index >= length) {
                result += '%!(NOVERB)';
                break;
            }
            // The verb is a rune.
            var verbRune = utf8.decodeRune(formatText, index);
            var verb = String.fromCodePoint(verbRune[0]);
            index += verbRune[1];
            if (verb === '%') {
                result += '%';
                continue;
            }
            if (argIndex >= args.length || argIndex < 0) {
                result += '%!' + verb + '(MISSING)';
                continue;
            }
            var arg = args[argIndex++];
            if (verb === 'v') {
                // %#v - Go syntax, %+v - field names; the flags # and +
                // themselves do not apply to the values inside.
                if (flags.sharp) {
                    flags.sharpV = true;
                    flags.sharp = false;
                }
                if (flags.plus) {
                    flags.plusV = true;
                    flags.plus = false;
                }
            }
            if (verb === 'w')
                verb = 'v';
            result += argument(arg, verb, flags);
        }
        if (!reordered && argIndex < args.length) {
            result += '%!(EXTRA ' + args.slice(argIndex).map(function (arg) {
                return arg === null ? '<nil>' : arg.$t.str + '=' + argument(arg, 'v', {});
            }).join(', ') + ')';
        }
        return result;
    };

    // A value for the console (the result of a unit): as %v.
    rt.formatResult = function (desc, value) {
        return utf8.decode(format(desc, value, 'v', {}, 0));
    };
})(globalThis);
