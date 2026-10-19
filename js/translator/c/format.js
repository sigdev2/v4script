// C: printf and scanf - parsing the format string as glibc does (inf/nan
// in lower case, an exact half in %f to even, (nil) and (null)).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var C = T.c;
    if (C.format)
        return;

    var rt = C.runtime;
    var i64 = T.i64, u64 = T.u64, utf8 = T.utf8, numbers = T.numbers, big = T.big;

    // Kinds of values of variable arguments: a string, a js_value, a
    // function and a boolean are pointers and integers too.
    function baseKind(tag) {
        switch (tag) {
        case 'str':
        case 'js':
        case 'fn':
            return 'ptr';
        case 'bool':
            return 'i32';
        }
        return tag;
    }
    C.baseKind = baseKind;

    // Variable arguments one by one; missing ones are zeros (undefined
    // behavior in C).
    function Arguments(list, start) {
        this.v = list === null || list === undefined ? [] : list.v;
        this.t = list === null || list === undefined ? [] : list.t;
        this.i = start || 0;
    }
    Arguments.prototype.next = function (kind) {
        if (this.i >= this.v.length) {
            ++this.i;
            return kind === 'f64' ? 0 : 0;
        }
        var value = this.v[this.i];
        var tag = this.t[this.i++];
        return rt.convertKind(value, baseKind(tag), kind);
    };
    C.Arguments = Arguments;

    var SIGNED = { '': 'i32', hh: 'i8', h: 'i16', l: 'i64', ll: 'i64', q: 'i64', j: 'i64', z: 'i64', t: 'i64', L: 'i64' };
    var UNSIGNED = { '': 'u32', hh: 'u8', h: 'u16', l: 'u64', ll: 'u64', q: 'u64', j: 'u64', z: 'u64', t: 'u64', L: 'u64' };

    function repeat(text, count) {
        var result = '';
        for (var index = 0; index < count; ++index)
            result += text;
        return result;
    }

    // Padding to the width: the prefix (sign, 0x) goes before the zeros.
    function pad(prefix, body, spec, zeroAllowed) {
        var length = prefix.length + body.length;
        if (spec.width <= length)
            return prefix + body;
        var fill = spec.width - length;
        if (spec.minus)
            return prefix + body + repeat(' ', fill);
        if (spec.zero && zeroAllowed)
            return prefix + repeat('0', fill) + body;
        return repeat(' ', fill) + prefix + body;
    }

    function integerDigits(value, kind, radix) {
        var text;
        if (kind === 'i64')
            text = i64.str(value, radix);
        else if (kind === 'u64')
            text = u64.str(value, radix);
        else
            text = value.toString(radix);
        return text;
    }

    function formatInteger(spec, value, kind, radix, signed, upper) {
        var digits = integerDigits(value, kind, radix);
        var negative = digits.charAt(0) === '-';
        if (negative)
            digits = digits.substring(1);
        if (upper)
            digits = digits.toUpperCase();
        if (spec.precision === 0 && digits === '0')
            digits = '';
        if (spec.precision > digits.length)
            digits = repeat('0', spec.precision - digits.length) + digits;
        var prefix = '';
        if (signed)
            prefix = negative ? '-' : (spec.plus ? '+' : (spec.space ? ' ' : ''));
        if (spec.hash) {
            if (radix === 8 && digits.charAt(0) !== '0')
                digits = '0' + digits;
            else if (radix === 16 && digits !== '' && /[^0]/.test(digits))
                prefix = upper ? '0X' : '0x';
        }
        return pad(prefix, digits, spec, spec.precision < 0);
    }

    // %a: a hexadecimal mantissa, as glibc does (0x1.8p+1).
    var scratch = new DataView(new ArrayBuffer(8));
    function hexFloat(value, precision, upper) {
        scratch.setFloat64(0, value);
        var high = scratch.getUint32(0) & 0x7FFFFFFF;
        var low = scratch.getUint32(4);
        var exponent = high >>> 20;
        var mantissaHigh = high & 0xFFFFF;
        var lead;
        if (exponent === 0) {
            if (mantissaHigh === 0 && low === 0) {
                lead = '0';
                exponent = 0;
            } else {
                lead = '0';
                exponent = -1022;
            }
        } else {
            lead = '1';
            exponent -= 1023;
        }
        var digits = ('00000' + mantissaHigh.toString(16)).slice(-5) + ('00000000' + low.toString(16)).slice(-8);
        if (precision < 0) {
            digits = digits.replace(/0+$/, '');
        } else if (precision < 13) {
            // Rounding to even by the dropped digits.
            var kept = digits.substring(0, precision);
            var rest = digits.substring(precision);
            var first = parseInt(rest.charAt(0), 16);
            var tail = /[^0]/.test(rest.substring(1));
            var lastOdd = precision > 0 ? parseInt(kept.charAt(precision - 1), 16) % 2 === 1 : Number(lead) % 2 === 1;
            if (first > 8 || (first === 8 && (tail || lastOdd))) {
                var chars = (lead + kept).split('').map(function (ch) { return parseInt(ch, 16); });
                var position = chars.length - 1;
                while (position >= 0) {
                    if (chars[position] === 15) {
                        chars[position] = 0;
                        --position;
                    } else {
                        ++chars[position];
                        break;
                    }
                }
                var joined = chars.map(function (digit) { return digit.toString(16); }).join('');
                lead = joined.substring(0, joined.length - precision) || '0';
                kept = joined.substring(joined.length - precision);
            }
            digits = kept;
        } else {
            digits += repeat('0', precision - 13);
        }
        var text = '0x' + lead + (digits.length > 0 ? '.' + digits : '') + 'p' + (exponent < 0 ? '-' : '+') + Math.abs(exponent);
        return upper ? text.toUpperCase() : text;
    }

    function formatFloat(spec, value, conversion) {
        var upper = conversion === 'F' || conversion === 'E' || conversion === 'G' || conversion === 'A';
        var negative = value < 0 || (value === 0 && 1 / value < 0);
        var body;
        var finite = isFinite(value);
        if (value !== value) {
            body = 'nan';
            negative = false;
        } else if (!finite) {
            body = 'inf';
        } else {
            var abs = Math.abs(value);
            var precision = spec.precision;
            switch (conversion) {
            case 'f':
            case 'F':
                body = numbers.fixed(abs, precision < 0 ? 6 : precision, true);
                if (spec.hash && body.indexOf('.') < 0)
                    body += '.';
                break;
            case 'e':
            case 'E':
                body = numbers.exponential(abs, precision < 0 ? 6 : precision, true, 2, upper);
                if (spec.hash && body.indexOf('.') < 0)
                    body = body.replace(/[eE]/, '.$&');
                break;
            case 'g':
            case 'G':
                body = numbers.general(abs, precision < 0 ? 6 : (precision === 0 ? 1 : precision), true, spec.hash, 2, upper);
                if (spec.hash && body.indexOf('.') < 0)
                    body = /[eE]/.test(body) ? body.replace(/[eE]/, '.$&') : body + '.';
                break;
            default:
                body = hexFloat(abs, precision, upper);
                break;
            }
        }
        if (upper)
            body = body.toUpperCase();
        var prefix = negative ? '-' : (spec.plus ? '+' : (spec.space ? ' ' : ''));
        if (conversion === 'a' || conversion === 'A') {
            // Zeros go after 0x.
            if (finite && spec.zero && !spec.minus && spec.width > prefix.length + body.length) {
                var fill = spec.width - prefix.length - body.length;
                return prefix + body.substring(0, 2) + repeat('0', fill) + body.substring(2);
            }
        }
        return pad(prefix, body, spec, finite);
    }

    // A wide character string (an int of 4 bytes each) as UTF-8 bytes.
    function wideString(memory, address, limit) {
        var result = '';
        var count = 0;
        for (var at = address; ; at += 4) {
            memory.check(at, 4);
            var code = memory.I32[at >> 2];
            if (code === 0)
                break;
            var encoded = utf8.encodeRune(code);
            if (limit >= 0 && count + encoded.length > limit)
                break;
            result += encoded;
            count += encoded.length;
        }
        return result;
    }

    // Stores through a pointer for %n and scanf: the kind by the length modifier.
    function storeKind(memory, address, kind, value) {
        var size = kind === 'i64' || kind === 'u64' || kind === 'f64' ? 8 : (kind === 'i16' || kind === 'u16' ? 2 : (kind === 'i8' || kind === 'u8' ? 1 : 4));
        memory.check(address, size);
        switch (kind) {
        case 'i8':
        case 'u8':
            memory.U8[address] = typeof value === 'number' ? value & 255 : value.lo & 255;
            return;
        case 'i16':
        case 'u16':
            memory.U16[address >> 1] = typeof value === 'number' ? value & 65535 : value.lo & 65535;
            return;
        case 'i64':
        case 'u64':
            memory.store64(address, typeof value === 'number' && !Number.isInteger(value) ? Math.trunc(value) : value);
            return;
        case 'f32':
            memory.F32[address >> 2] = value;
            return;
        case 'f64':
            memory.F64[address >> 3] = value;
            return;
        }
        memory.I32[address >> 2] = typeof value === 'number' ? value | 0 : value.lo;
    }
    C.storeKind = storeKind;

    // printf: format - the bytes of the format string, args - Arguments.
    // The result is bytes.
    C.format = function (memory, format, args) {
        var out = '';
        var index = 0;
        var length = format.length;
        while (index < length) {
            var percent = format.indexOf('%', index);
            if (percent < 0) {
                out += format.substring(index);
                break;
            }
            out += format.substring(index, percent);
            var start = percent;
            index = percent + 1;
            var spec = { minus: false, plus: false, space: false, hash: false, zero: false, width: 0, precision: -1 };
            for (;;) {
                var flag = format.charAt(index);
                if (flag === '-')
                    spec.minus = true;
                else if (flag === '+')
                    spec.plus = true;
                else if (flag === ' ')
                    spec.space = true;
                else if (flag === '#')
                    spec.hash = true;
                else if (flag === '0')
                    spec.zero = true;
                else if (flag === "'")
                    ;
                else
                    break;
                ++index;
            }
            if (format.charAt(index) === '*') {
                ++index;
                var star = args.next('i32');
                if (star < 0) {
                    spec.minus = true;
                    star = -star;
                }
                spec.width = star;
            } else {
                var widthText = /^\d*/.exec(format.substring(index, index + 12))[0];
                spec.width = widthText.length > 0 ? Number(widthText) : 0;
                index += widthText.length;
            }
            if (format.charAt(index) === '.') {
                ++index;
                if (format.charAt(index) === '*') {
                    ++index;
                    var precision = args.next('i32');
                    spec.precision = precision < 0 ? -1 : precision;
                } else {
                    var precisionText = /^\d*/.exec(format.substring(index, index + 12))[0];
                    spec.precision = precisionText.length > 0 ? Number(precisionText) : 0;
                    index += precisionText.length;
                }
            }
            var size = '';
            var two = format.substring(index, index + 2);
            if (two === 'hh' || two === 'll') {
                size = two;
                index += 2;
            } else if ('hlLqjzt'.indexOf(format.charAt(index)) >= 0 && index < length) {
                size = format.charAt(index);
                ++index;
            }
            var conversion = format.charAt(index++);
            var kind;
            switch (conversion) {
            case 'd':
            case 'i':
                kind = SIGNED[size];
                out += formatInteger(spec, args.next(kind), kind, 10, true, false);
                break;
            case 'u':
            case 'o':
            case 'x':
            case 'X':
                kind = UNSIGNED[size];
                out += formatInteger(spec, args.next(kind), kind, conversion === 'u' ? 10 : (conversion === 'o' ? 8 : 16), false,
                                     conversion === 'X');
                break;
            case 'c': {
                var code = args.next('i32');
                out += pad('', size === 'l' ? utf8.encodeRune(code) : String.fromCharCode(code & 255), spec, false);
                break;
            }
            case 's': {
                var address = args.next('ptr');
                var text;
                if (address === 0) {
                    text = spec.precision < 0 || spec.precision >= 6 ? '(null)' : '';
                } else if (size === 'l') {
                    text = wideString(memory, address, spec.precision);
                } else {
                    text = memory.cstring(address);
                    if (spec.precision >= 0 && text.length > spec.precision)
                        text = text.substring(0, spec.precision);
                }
                out += pad('', text, spec, false);
                break;
            }
            case 'p': {
                var pointer = args.next('ptr');
                out += pointer === 0 ? pad('', '(nil)', spec, false)
                                     : pad('0x', pointer.toString(16), spec, spec.precision < 0);
                break;
            }
            case 'f':
            case 'F':
            case 'e':
            case 'E':
            case 'g':
            case 'G':
            case 'a':
            case 'A':
                out += formatFloat(spec, args.next('f64'), conversion);
                break;
            case 'n': {
                var target = args.next('ptr');
                storeKind(memory, target, SIGNED[size], out.length);
                break;
            }
            case '%':
                out += '%';
                break;
            default:
                // An unknown conversion as it is (glibc does the same).
                out += format.substring(start, index);
                if (conversion === '')
                    index = length;
                break;
            }
        }
        return out;
    };

    // --- scanf

    function isSpace(code) {
        return code === 32 || (code >= 9 && code <= 13);
    }

    var FLOAT_PATTERN = /^[+-]?(?:inf(?:inity)?|nan(?:\([0-9a-zA-Z_]*\))?|0[xX](?:[0-9a-fA-F]+\.?[0-9a-fA-F]*|\.[0-9a-fA-F]+)(?:[pP][+-]?\d+)?|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/i;

    // A float from the start of a text: { value, length } or null.
    function parseFloatPrefix(text) {
        var match = FLOAT_PATTERN.exec(text);
        if (match === null)
            return null;
        var token = match[0];
        // "1e" without exponent digits is just "1".
        var lower = token.toLowerCase();
        var negative = lower.charAt(0) === '-';
        var unsigned = lower.replace(/^[+-]/, '');
        var value;
        if (unsigned.indexOf('inf') === 0) {
            value = Infinity;
        } else if (unsigned.indexOf('nan') === 0) {
            value = NaN;
        } else if (unsigned.indexOf('0x') === 0) {
            var hex = unsigned;
            if (!/p/.test(hex))
                hex += 'p0';
            if (/^0x\.?p/.test(hex))
                return { value: 0, length: (negative || lower.charAt(0) === '+' ? 1 : 0) + 1 };
            value = T.rat.toFloat(T.rat.parse(hex.replace(/\.p/, 'p')));
        } else {
            value = Number(unsigned);
        }
        return { value: negative ? -value : value, length: token.length };
    }
    C.parseFloatPrefix = parseFloatPrefix;

    // An integer from the start of a text in a base (0 - by the prefix):
    // { value (big), length, negative } or null.
    function parseIntegerPrefix(text, base) {
        var index = 0;
        var negative = false;
        if (text.charAt(0) === '+' || text.charAt(0) === '-') {
            negative = text.charAt(0) === '-';
            index = 1;
        }
        if ((base === 0 || base === 16) && /^0[xX][0-9a-fA-F]/.test(text.substring(index))) {
            base = 16;
            index += 2;
        } else if (base === 0) {
            base = text.charAt(index) === '0' ? 8 : 10;
        }
        var digits = '';
        while (index < text.length) {
            var digit = parseInt(text.charAt(index), 36);
            if (!(digit < base))
                break;
            digits += text.charAt(index);
            ++index;
        }
        if (digits === '')
            return null;
        var value = big.parse(digits, base);
        return { value: negative ? big.neg(value) : value, length: index, negative: negative };
    }
    C.parseIntegerPrefix = parseIntegerPrefix;

    // scanf over the bytes of input from the position start: { count, end };
    // count -1 - the input ended before the first conversion.
    C.scan = function (memory, input, start, format, args) {
        var position = start;
        var count = 0;
        var index = 0;
        var converted = false;
        function atEnd() {
            return position >= input.length;
        }
        function skipSpaces() {
            while (!atEnd() && isSpace(input.charCodeAt(position)))
                ++position;
        }
        function result() {
            return { count: count, end: position };
        }
        while (index < format.length) {
            var code = format.charCodeAt(index);
            if (isSpace(code)) {
                skipSpaces();
                ++index;
                continue;
            }
            if (code !== 37) {
                if (atEnd())
                    return { count: converted ? count : -1, end: position };
                if (input.charCodeAt(position) !== code)
                    return result();
                ++position;
                ++index;
                continue;
            }
            ++index;
            if (format.charAt(index) === '%') {
                skipSpaces();
                if (atEnd())
                    return { count: converted ? count : -1, end: position };
                if (input.charAt(position) !== '%')
                    return result();
                ++position;
                ++index;
                continue;
            }
            var suppress = false;
            if (format.charAt(index) === '*') {
                suppress = true;
                ++index;
            }
            var widthText = /^\d*/.exec(format.substring(index, index + 12))[0];
            var width = widthText.length > 0 ? Number(widthText) : -1;
            index += widthText.length;
            var size = '';
            var two = format.substring(index, index + 2);
            if (two === 'hh' || two === 'll') {
                size = two;
                index += 2;
            } else if ('hlLqjzt'.indexOf(format.charAt(index)) >= 0 && index < format.length) {
                size = format.charAt(index);
                ++index;
            }
            var conversion = format.charAt(index++);
            if (conversion === 'n') {
                if (!suppress)
                    storeKind(memory, args.next('ptr'), SIGNED[size], position - start);
                continue;
            }
            if (conversion !== 'c' && conversion !== '[')
                skipSpaces();
            if (atEnd())
                return { count: converted || count > 0 ? count : -1, end: position };
            var available = width >= 0 ? input.substring(position, position + width) : input.substring(position);
            switch (conversion) {
            case 'd':
            case 'i':
            case 'u':
            case 'o':
            case 'x':
            case 'X':
            case 'p': {
                var base = conversion === 'd' || conversion === 'u' ? 10 : (conversion === 'i' ? 0 : (conversion === 'o' ? 8 : 16));
                var parsed = parseIntegerPrefix(available, base);
                if (parsed === null)
                    return result();
                position += parsed.length;
                converted = true;
                if (!suppress) {
                    var kind = conversion === 'p' ? 'u64' : (conversion === 'd' || conversion === 'i' ? SIGNED[size] : UNSIGNED[size]);
                    var value = T.bigToI64(parsed.value, kind.charAt(0) === 'i');
                    if (kind !== 'i64' && kind !== 'u64')
                        value = rt.convertKind(value, 'i64', kind);
                    storeKind(memory, args.next('ptr'), kind === 'u64' && conversion === 'p' ? 'u64' : kind, value);
                    ++count;
                }
                break;
            }
            case 'f':
            case 'F':
            case 'e':
            case 'E':
            case 'g':
            case 'G':
            case 'a':
            case 'A': {
                var number = parseFloatPrefix(available);
                if (number === null)
                    return result();
                position += number.length;
                converted = true;
                if (!suppress) {
                    var floatKind = size === 'l' || size === 'L' ? 'f64' : 'f32';
                    storeKind(memory, args.next('ptr'), floatKind, floatKind === 'f32' ? Math.fround(number.value) : number.value);
                    ++count;
                }
                break;
            }
            case 's': {
                var end = 0;
                while (end < available.length && !isSpace(available.charCodeAt(end)))
                    ++end;
                if (end === 0)
                    return result();
                var word = available.substring(0, end);
                position += end;
                converted = true;
                if (!suppress) {
                    memory.writeBytes(args.next('ptr'), word, true);
                    ++count;
                }
                break;
            }
            case 'c': {
                var length = width >= 0 ? width : 1;
                if (available.length < length)
                    return { count: count > 0 || converted ? count : -1, end: position };
                var chars = available.substring(0, length);
                position += length;
                converted = true;
                if (!suppress) {
                    memory.writeBytes(args.next('ptr'), chars, false);
                    ++count;
                }
                break;
            }
            case '[': {
                var negate = false;
                if (format.charAt(index) === '^') {
                    negate = true;
                    ++index;
                }
                var set = '';
                if (format.charAt(index) === ']') {
                    set += ']';
                    ++index;
                }
                while (index < format.length && format.charAt(index) !== ']')
                    set += format.charAt(index++);
                ++index;
                var matches = function (ch) {
                    for (var at = 0; at < set.length; ++at) {
                        if (set.charAt(at + 1) === '-' && at + 2 < set.length) {
                            if (ch >= set.charAt(at) && ch <= set.charAt(at + 2))
                                return true;
                            at += 2;
                        } else if (set.charAt(at) === ch) {
                            return true;
                        }
                    }
                    return false;
                };
                var taken = 0;
                while (taken < available.length && matches(available.charAt(taken)) !== negate)
                    ++taken;
                if (taken === 0)
                    return result();
                var run = available.substring(0, taken);
                position += taken;
                converted = true;
                if (!suppress) {
                    memory.writeBytes(args.next('ptr'), run, true);
                    ++count;
                }
                break;
            }
            default:
                return result();
            }
        }
        return result();
    };
})(globalThis);
