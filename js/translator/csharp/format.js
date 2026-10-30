// C#: numbers as text and back, as .NET does it with the invariant
// culture - the standard formats (C, D, E, F, G, N, P, R, X, B), custom
// formats ("0.00", "#,##0", "0.###E+0", sections), composite formatting
// (string.Format) and parsing with NumberStyles. A number is first a
// buffer of decimal digits: doubles in standard formats are rounded
// exactly with ties to even, in custom formats from 15 significant digits
// (7 for floats) with ties away from zero; integers and decimals round
// ties away from zero.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    if (CS.formatNumber)
        return;

    var i64 = T.i64, u64 = T.u64, big = T.big;

    function rt() {
        return CS.rt;
    }

    function formatError(message) {
        return rt().exception('System.FormatException', message);
    }

    function badSpecifier() {
        return formatError('Format specifier was invalid.');
    }

    // --- Digit buffers: { negative, digits (no leading zeros), scale,
    // floating } - the value is 0.digits * 10^scale; zero has no digits.

    function buffer(negative, digits, scale, floating) {
        var start = 0;
        while (start < digits.length && digits.charAt(start) === '0')
            ++start;
        if (start > 0) {
            digits = digits.substring(start);
            scale -= start;
        }
        var end = digits.length;
        while (end > 0 && digits.charAt(end - 1) === '0')
            --end;
        digits = digits.substring(0, end);
        if (digits.length === 0)
            scale = 0;
        return { negative: negative, digits: digits, scale: scale, floating: floating };
    }

    // The exact decimal digits of a double: toExponential(100) is exact
    // between 1e-20 and 1e100, T.big outside.
    function exactDigits(value) {
        var magnitude = Math.abs(value);
        if (magnitude === 0)
            return { digits: '', scale: 0 };
        if (magnitude >= 1e-20 && magnitude < 1e100) {
            var exact = T.numbers.exactDigits(magnitude);
            return { digits: exact.digits, scale: exact.exponent };
        }
        // value = mantissa * 2^exponent
        var exponent = 0;
        var mantissa = magnitude;
        while (mantissa >= 9007199254740992) {
            mantissa /= 2;
            ++exponent;
        }
        while (mantissa !== Math.floor(mantissa)) {
            mantissa *= 2;
            --exponent;
        }
        var text;
        var scale;
        if (exponent >= 0) {
            text = big.str(big.mul(big.fromFloat(mantissa), big.pow(2, exponent)));
            scale = text.length;
        } else {
            text = big.str(big.mul(big.fromFloat(mantissa), big.pow(5, -exponent)));
            scale = text.length + exponent;
        }
        return { digits: text.replace(/0+$/, ''), scale: scale };
    }

    // Digits rounded at position count (digits kept): ties to even
    // (even = true) or away from zero; the rest only decides.
    function roundDigits(digits, scale, count, even) {
        if (count >= digits.length)
            return { digits: digits, scale: scale };
        if (count < 0)
            return { digits: '', scale: 0 };
        var head = digits.substring(0, count);
        var next = digits.charAt(count);
        var up;
        if (next > '5')
            up = true;
        else if (next < '5')
            up = false;
        else if (!even || count + 1 < digits.length)
            up = true;
        else
            up = count > 0 && (head.charCodeAt(count - 1) - 48) % 2 === 1;
        if (!up)
            return { digits: head, scale: scale };
        var chars = head.split('');
        var index = chars.length - 1;
        while (index >= 0 && chars[index] === '9') {
            chars[index] = '0';
            --index;
        }
        if (index < 0)
            return { digits: '1' + chars.join(''), scale: scale + 1 };
        chars[index] = String.fromCharCode(chars[index].charCodeAt(0) + 1);
        return { digits: chars.join(''), scale: scale };
    }

    // The shortest digits of a float or a double.
    function shortestDigits(value, single) {
        var parts = single ? CS.floatDigits(Math.abs(value)) : T.numbers.shortest(value);
        return { digits: parts.digits === '0' ? '' : parts.digits, scale: parts.exponent };
    }

    function integerBuffer(kind, value) {
        var text;
        if (kind === 'u64')
            text = u64.str(value);
        else if (kind === 'i64')
            text = i64.str(value);
        else
            text = String(value);
        var negative = text.charAt(0) === '-';
        if (negative)
            text = text.substring(1);
        return buffer(negative, text, text.length, false);
    }

    function decimalBuffer(value) {
        var text = big.str(value.m);
        return buffer(value.n, text, text.length - value.s, false);
    }

    var FLOAT_KINDS = { f32: true, f64: true };
    var INTEGER_BITS = { i8: 8, u8: 8, i16: 16, u16: 16, i32: 32, u32: 32, i64: 64, u64: 64 };

    // A standard format: a letter and up to nine digits; anything else is
    // custom (letter '').
    function parseSpecifier(format) {
        if (format === null || format === undefined || format.length === 0)
            return { letter: 'G', precision: -1 };
        var first = format.charCodeAt(0);
        if ((first >= 65 && first <= 90) || (first >= 97 && first <= 122)) {
            if (format.length === 1)
                return { letter: format.charAt(0), precision: -1 };
            if (format.length <= 10 && /^[0-9]+$/.test(format.substring(1)))
                return { letter: format.charAt(0), precision: Number(format.substring(1)) };
        }
        return { letter: '', precision: -1 };
    }

    // --- Writing a buffer (NumberToString of .NET)

    // The buffer cut at count digits: ties away from zero unless the digits
    // are already rounded (floating point in standard formats).
    function cut(number, count, rounded) {
        var result = rounded ? { digits: number.digits.substring(0, Math.max(count, 0)), scale: number.scale }
                             : roundDigits(number.digits, number.scale, count, false);
        var digits = result.digits.replace(/0+$/, '');
        number.digits = digits;
        number.scale = digits.length === 0 ? 0 : result.scale;
        if (digits.length === 0 && !number.floating)
            number.negative = false;
    }

    function digitAt(number, index) {
        return index < number.digits.length ? number.digits.charAt(index) : '0';
    }

    // Without \B(?=...) in replace: V4 inserts twice (v4-pitfalls.md).
    function groupInteger(text) {
        var out = '';
        for (var index = 0; index < text.length; ++index) {
            if (index > 0 && (text.length - index) % 3 === 0)
                out += ',';
            out += text.charAt(index);
        }
        return out;
    }

    CS.groupInteger = groupInteger;

    function fixedText(number, decimals, grouped) {
        var whole;
        if (number.scale > 0) {
            whole = '';
            for (var index = 0; index < number.scale; ++index)
                whole += digitAt(number, index);
        } else {
            whole = '0';
        }
        if (grouped)
            whole = groupInteger(whole);
        if (decimals <= 0)
            return whole;
        var fraction = '';
        for (var position = 0; position < decimals; ++position) {
            var digit = number.scale + position;
            fraction += digit < 0 ? '0' : digitAt(number, digit);
        }
        return whole + '.' + fraction;
    }

    function exponentText(value, letter, minDigits, positiveSign) {
        var text = String(Math.abs(value));
        while (text.length < minDigits)
            text = '0' + text;
        return letter + (value < 0 ? '-' : (positiveSign ? '+' : '')) + text;
    }

    function scientificText(number, count, letter) {
        var text = digitAt(number, 0);
        if (count !== 1)
            text += '.';
        for (var index = 1; index < count; ++index)
            text += digitAt(number, index);
        var exponent = number.digits.length === 0 ? 0 : number.scale - 1;
        return text + exponentText(exponent, letter, 3, true);
    }

    function generalText(number, maxDigits, letter, noScientific) {
        var position = number.scale;
        var scientific = false;
        if (!noScientific && (position > maxDigits || position < -3)) {
            position = 1;
            scientific = true;
        }
        var text = '';
        var index = 0;
        if (position > 0) {
            for (; position > 0; --position)
                text += index < number.digits.length ? number.digits.charAt(index++) : '0';
        } else {
            text = '0';
        }
        if (index < number.digits.length || position < 0) {
            text += '.';
            for (; position < 0; ++position)
                text += '0';
            text += number.digits.substring(index);
        }
        if (scientific)
            text += exponentText(number.scale - 1, letter, 2, true);
        return text;
    }

    function standardText(number, letter, precision, rounded, decimalGeneral) {
        var upper = letter.toUpperCase();
        var text;
        switch (upper) {
        case 'C': {
            var decimals = precision < 0 ? 2 : precision;
            cut(number, number.scale + decimals, rounded);
            text = '¤' + fixedText(number, decimals, true);
            return number.negative ? '(' + text + ')' : text;
        }
        case 'F': {
            var places = precision < 0 ? 2 : precision;
            cut(number, number.scale + places, rounded);
            return (number.negative ? '-' : '') + fixedText(number, places, false);
        }
        case 'N': {
            var count = precision < 0 ? 2 : precision;
            cut(number, number.scale + count, rounded);
            return (number.negative ? '-' : '') + fixedText(number, count, true);
        }
        case 'E': {
            var digits = (precision < 0 ? 6 : precision) + 1;
            cut(number, digits, rounded);
            return (number.negative ? '-' : '') + scientificText(number, digits, letter === 'e' ? 'e' : 'E');
        }
        case 'G':
        case 'R': {
            var maxDigits = precision;
            if (maxDigits < 1) {
                if (decimalGeneral && precision === -1)
                    return (number.negative && number.digits.length > 0 ? '-' : '') +
                        generalText(number, 0, letter === 'g' || letter === 'r' ? 'e' : 'E', true);
                maxDigits = number.digits.length;
            }
            cut(number, maxDigits, rounded);
            return (number.negative ? '-' : '') + generalText(number, maxDigits, letter === 'g' || letter === 'r' ? 'e' : 'E', false);
        }
        case 'P': {
            var percent = precision < 0 ? 2 : precision;
            if (number.digits.length > 0)
                number.scale += 2;
            cut(number, number.scale + percent, rounded);
            return (number.negative ? '-' : '') + fixedText(number, percent, true) + ' %';
        }
        }
        throw badSpecifier();
    }

    // --- Custom formats (NumberToStringFormat of .NET)

    function findSection(format, section) {
        if (section === 0)
            return 0;
        var src = 0;
        for (;;) {
            if (src >= format.length)
                return 0;
            var ch = format.charAt(src++);
            if (ch === '\'' || ch === '"') {
                while (src < format.length && format.charAt(src++) !== ch) {
                }
            } else if (ch === '\\') {
                if (src < format.length)
                    ++src;
            } else if (ch === ';') {
                if (--section !== 0)
                    continue;
                if (src < format.length && format.charAt(src) !== ';')
                    return src;
                return 0;
            }
        }
    }

    function customText(number, format) {
        var section = findSection(format, number.digits.length === 0 ? 2 : (number.negative ? 1 : 0));
        var digitCount, decimalPos, firstDigit, lastDigit, scientific, thousandPos, thousandCount = 0, thousandSeps;
        var scaleAdjust, src, ch;
        for (;;) {
            digitCount = 0;
            decimalPos = -1;
            firstDigit = 0x7FFFFFFF;
            lastDigit = 0;
            scientific = false;
            thousandPos = -1;
            thousandSeps = false;
            scaleAdjust = 0;
            src = section;
            while (src < format.length && (ch = format.charAt(src++)) !== ';') {
                switch (ch) {
                case '#':
                    ++digitCount;
                    break;
                case '0':
                    if (firstDigit === 0x7FFFFFFF)
                        firstDigit = digitCount;
                    ++digitCount;
                    lastDigit = digitCount;
                    break;
                case '.':
                    if (decimalPos < 0)
                        decimalPos = digitCount;
                    break;
                case ',':
                    if (digitCount > 0 && decimalPos < 0) {
                        if (thousandPos >= 0) {
                            if (thousandPos === digitCount) {
                                ++thousandCount;
                                break;
                            }
                            thousandSeps = true;
                        }
                        thousandPos = digitCount;
                        thousandCount = 1;
                    }
                    break;
                case '%':
                    scaleAdjust += 2;
                    break;
                case '‰':
                    scaleAdjust += 3;
                    break;
                case '\'':
                case '"':
                    while (src < format.length && format.charAt(src++) !== ch) {
                    }
                    break;
                case '\\':
                    if (src < format.length)
                        ++src;
                    break;
                case 'E':
                case 'e':
                    if (format.charAt(src) === '0' ||
                        ((format.charAt(src) === '+' || format.charAt(src) === '-') && format.charAt(src + 1) === '0')) {
                        while (++src < format.length && format.charAt(src) === '0') {
                        }
                        scientific = true;
                    }
                    break;
                }
            }
            if (decimalPos < 0)
                decimalPos = digitCount;
            if (thousandPos >= 0) {
                if (thousandPos === decimalPos)
                    scaleAdjust -= thousandCount * 3;
                else
                    thousandSeps = true;
            }
            if (number.digits.length > 0) {
                number.scale += scaleAdjust;
                var position = scientific ? digitCount : number.scale + digitCount - decimalPos;
                cut(number, position, false);
                if (number.digits.length === 0) {
                    var zeroSection = findSection(format, 2);
                    if (zeroSection !== section) {
                        section = zeroSection;
                        continue;
                    }
                }
            } else {
                if (!number.floating)
                    number.negative = false;
                number.scale = 0;
            }
            break;
        }
        firstDigit = firstDigit < decimalPos ? decimalPos - firstDigit : 0;
        lastDigit = lastDigit > decimalPos ? decimalPos - lastDigit : 0;
        var digPos, adjust;
        if (scientific) {
            digPos = decimalPos;
            adjust = 0;
        } else {
            digPos = number.scale > decimalPos ? number.scale : decimalPos;
            adjust = number.scale - decimalPos;
        }
        src = section;
        // The positions of group separators, counted from the decimal point.
        var separators = [];
        if (thousandSeps) {
            var totalDigits = digPos + (adjust < 0 ? adjust : 0);
            var numDigits = firstDigit > totalDigits ? firstDigit : totalDigits;
            for (var groupTotal = 3; numDigits > groupTotal; groupTotal += 3)
                separators.push(groupTotal);
        }
        var separatorIndex = separators.length - 1;
        var out = '';
        if (number.negative && section === 0 && number.scale !== 0)
            out += '-';
        var decimalWritten = false;
        var cur = 0;
        var digits = number.digits;
        var nextDigit = function () { return cur < digits.length ? digits.charAt(cur++) : null; };
        var separatorAfter = function () {
            if (thousandSeps && digPos > 1 && separatorIndex >= 0 && digPos === separators[separatorIndex] + 1) {
                out += ',';
                --separatorIndex;
            }
        };
        while (src < format.length && (ch = format.charAt(src++)) !== ';') {
            if (adjust > 0 && (ch === '#' || ch === '0' || ch === '.')) {
                while (adjust > 0) {
                    var leading = nextDigit();
                    out += leading === null ? '0' : leading;
                    separatorAfter();
                    --digPos;
                    --adjust;
                }
            }
            switch (ch) {
            case '#':
            case '0': {
                var written;
                if (adjust < 0) {
                    ++adjust;
                    written = digPos <= firstDigit ? '0' : null;
                } else {
                    written = nextDigit();
                    if (written === null)
                        written = digPos > lastDigit ? '0' : null;
                }
                if (written !== null) {
                    out += written;
                    separatorAfter();
                }
                --digPos;
                break;
            }
            case '.':
                if (digPos !== 0 || decimalWritten)
                    break;
                if (lastDigit < 0 || (decimalPos < digitCount && cur < digits.length)) {
                    out += '.';
                    decimalWritten = true;
                }
                break;
            case '‰':
                out += '‰';
                break;
            case '%':
                out += '%';
                break;
            case ',':
                break;
            case '\'':
            case '"':
                while (src < format.length && format.charAt(src) !== ch)
                    out += format.charAt(src++);
                if (src < format.length)
                    ++src;
                break;
            case '\\':
                if (src < format.length)
                    out += format.charAt(src++);
                break;
            case 'E':
            case 'e': {
                if (!scientific) {
                    out += ch;
                    if (src < format.length) {
                        if (format.charAt(src) === '+' || format.charAt(src) === '-')
                            out += format.charAt(src++);
                        while (src < format.length && format.charAt(src) === '0')
                            out += format.charAt(src++);
                    }
                    break;
                }
                var positiveSign = false;
                var minDigits = 0;
                if (format.charAt(src) === '0') {
                    ++minDigits;
                } else if (format.charAt(src) === '+' && format.charAt(src + 1) === '0') {
                    positiveSign = true;
                } else if (format.charAt(src) === '-' && format.charAt(src + 1) === '0') {
                    // E-0: a sign only for negative exponents.
                } else {
                    out += ch;
                    break;
                }
                while (++src < format.length && format.charAt(src) === '0')
                    ++minDigits;
                if (minDigits > 10)
                    minDigits = 10;
                var exponent = digits.length === 0 ? 0 : number.scale - decimalPos;
                out += exponentText(exponent, ch, minDigits, positiveSign);
                scientific = false;
                break;
            }
            default:
                out += ch;
            }
        }
        if (number.negative && section === 0 && number.scale === 0 && out.length > 0)
            out = '-' + out;
        return out;
    }

    // --- Formatting of a value of a kind

    function specialText(value) {
        if (value !== value)
            return 'NaN';
        return value > 0 ? 'Infinity' : '-Infinity';
    }

    function floatingText(value, single, format) {
        var spec = parseSpecifier(format);
        if (!isFinite(value)) {
            if (spec.letter !== '' && 'CcEeFfGgNnPpRr'.indexOf(spec.letter) < 0)
                throw badSpecifier();
            return specialText(value);
        }
        var negative = value < 0 || (value === 0 && 1 / value < 0);
        if (spec.letter === '') {
            var exact = exactDigits(value);
            var rounded = roundDigits(exact.digits, exact.scale, single ? 7 : 15, true);
            return customText(buffer(negative, rounded.digits, rounded.scale, true), format);
        }
        var upper = spec.letter.toUpperCase();
        var precision = spec.precision;
        var digits;
        if (upper === 'R' || (upper === 'G' && precision <= 0)) {
            digits = shortestDigits(value, single);
            var number = buffer(negative, digits.digits, digits.scale, true);
            return (negative ? '-' : '') + generalText(number, Math.max(number.digits.length, single ? 9 : 17),
                                                       spec.letter === 'g' || spec.letter === 'r' ? 'e' : 'E', false);
        }
        if ('CEFGNP'.indexOf(upper) < 0)
            throw badSpecifier();
        var exactValue = exactDigits(value);
        var count;
        switch (upper) {
        case 'E':
            count = (precision < 0 ? 6 : precision) + 1;
            break;
        case 'G':
            count = precision;
            break;
        case 'P':
            count = exactValue.scale + 2 + (precision < 0 ? 2 : precision);
            break;
        default:
            count = exactValue.scale + (precision < 0 ? 2 : precision);
        }
        digits = roundDigits(exactValue.digits, exactValue.scale, count, true);
        return standardText(buffer(negative, digits.digits, digits.scale, true), spec.letter, precision, true, false);
    }

    function integerText(kind, value, format) {
        var spec = parseSpecifier(format);
        var upper = spec.letter.toUpperCase();
        if (upper === 'G' && spec.precision <= 0 || upper === 'R' || (upper === 'D' && spec.precision <= 0))
            return kind === 'u64' ? u64.str(value) : (kind === 'i64' ? i64.str(value) : String(value));
        if (upper === 'D') {
            var number = integerBuffer(kind, value);
            var text = number.digits.length === 0 ? '0' : number.digits + new Array(number.scale - number.digits.length + 1).join('0');
            while (text.length < spec.precision)
                text = '0' + text;
            return (number.negative ? '-' : '') + text;
        }
        if (upper === 'X' || upper === 'B') {
            var bits = INTEGER_BITS[kind];
            var radix = upper === 'X' ? 16 : 2;
            var raw;
            if (bits === 64)
                raw = u64.str(u64.fromSigned(value), radix);
            else
                raw = ((value < 0 ? value + Math.pow(2, bits) : value) >>> 0).toString(radix);
            if (spec.letter === 'X')
                raw = raw.toUpperCase();
            while (raw.length < spec.precision)
                raw = '0' + raw;
            return raw;
        }
        if (spec.letter === '')
            return customText(integerBuffer(kind, value), format);
        return standardText(integerBuffer(kind, value), spec.letter, spec.precision, false, false);
    }

    function decimalText(value, format) {
        var spec = parseSpecifier(format);
        if (spec.letter === '')
            return customText(decimalBuffer(value), format);
        var upper = spec.letter.toUpperCase();
        if ('CEFGNPR'.indexOf(upper) < 0)
            throw badSpecifier();
        if (upper === 'R')
            spec = { letter: spec.letter === 'r' ? 'g' : 'G', precision: -1 };
        var number = decimalBuffer(value);
        if ((spec.letter === 'G' || spec.letter === 'g') && spec.precision === -1) {
            // Trailing zeros of the scale stay: 1.50m is "1.50".
            var digits = big.str(value.m);
            var scale = digits.length - value.s;
            var text = scale > 0 ? digits.substring(0, scale) : '0';
            if (value.s > 0) {
                var padded = scale < 0 ? new Array(-scale + 1).join('0') + digits : digits.substring(Math.max(scale, 0));
                text += '.' + padded;
            }
            return (value.n && !big.eq(value.m, 0) ? '-' : '') + text;
        }
        return standardText(number, spec.letter, spec.precision, false, true);
    }

    // value.ToString(format) of a numeric kind.
    CS.formatNumber = function (kind, value, format) {
        if (FLOAT_KINDS[kind])
            return floatingText(value, kind === 'f32', format);
        if (kind === 'decimal')
            return decimalText(value, format);
        return integerText(kind, value, format);
    };

    // --- Composite formatting: string.Format

    function invalidFormat(offset, reason) {
        return formatError('Input string was not in a correct format. Failure to parse near offset ' + offset + '. ' + reason);
    }

    var UNCLOSED = 'Format item ends prematurely.';
    var DIGIT = 'Expected an ASCII digit.';

    // format with args (an array of objects): the holes {index,width:format}.
    CS.composite = function (format, args) {
        if (format === null || format === undefined)
            throw rt().exception('System.ArgumentNullException', 'Value cannot be null. (Parameter \'format\')');
        var out = '';
        var pos = 0;
        var length = format.length;
        function moveNext() {
            ++pos;
            if (pos >= length)
                throw invalidFormat(pos, UNCLOSED);
            return format.charAt(pos);
        }
        for (;;) {
            var ch;
            for (;;) {
                if (pos >= length)
                    return out;
                var open = format.indexOf('{', pos), close = format.indexOf('}', pos);
                var next = open < 0 ? close : (close < 0 ? open : Math.min(open, close));
                if (next < 0) {
                    out += format.substring(pos);
                    return out;
                }
                out += format.substring(pos, next);
                pos = next;
                var brace = format.charAt(pos);
                ch = moveNext();
                if (brace === ch) {
                    out += ch;
                    ++pos;
                    continue;
                }
                if (brace !== '{')
                    throw invalidFormat(pos, 'Unexpected closing brace without a corresponding opening brace.');
                break;
            }
            var width = 0;
            var leftJustify = false;
            var itemFormat = null;
            var index = ch.charCodeAt(0) - 48;
            if (index < 0 || index > 9)
                throw invalidFormat(pos, DIGIT);
            ch = moveNext();
            if (ch !== '}') {
                while (ch >= '0' && ch <= '9' && index < 1000000) {
                    index = index * 10 + ch.charCodeAt(0) - 48;
                    ch = moveNext();
                }
                while (ch === ' ')
                    ch = moveNext();
                if (ch === ',') {
                    do {
                        ch = moveNext();
                    } while (ch === ' ');
                    if (ch === '-') {
                        leftJustify = true;
                        ch = moveNext();
                    }
                    width = ch.charCodeAt(0) - 48;
                    if (width < 0 || width > 9)
                        throw invalidFormat(pos, DIGIT);
                    ch = moveNext();
                    while (ch >= '0' && ch <= '9' && width < 1000000) {
                        width = width * 10 + ch.charCodeAt(0) - 48;
                        ch = moveNext();
                    }
                    while (ch === ' ')
                        ch = moveNext();
                }
                if (ch !== '}') {
                    if (ch !== ':')
                        throw invalidFormat(pos, UNCLOSED);
                    var start = pos;
                    for (;;) {
                        ch = moveNext();
                        if (ch === '}')
                            break;
                        if (ch === '{')
                            throw invalidFormat(pos, UNCLOSED);
                    }
                    itemFormat = format.substring(start + 1, pos);
                }
            }
            ++pos;
            if (index >= args.length)
                throw formatError('Index (zero based) must be greater than or equal to zero and less than the size of the argument list.');
            var text = rt().formatObject(args[index], itemFormat);
            var padding = width - text.length;
            if (!leftJustify && padding > 0)
                out += new Array(padding + 1).join(' ');
            out += text;
            if (leftJustify && padding > 0)
                out += new Array(padding + 1).join(' ');
        }
    };

    // --- Parsing

    var STYLE = { leadingWhite: 1, trailingWhite: 2, leadingSign: 4, trailingSign: 8, parentheses: 16, decimalPoint: 32,
                  thousands: 64, exponent: 128, currency: 256, hex: 512, binary: 1024 };
    CS.NUMBER_STYLES = { Integer: 7, HexNumber: 515, Number: 111, Float: 167, Currency: 383, Any: 511 };

    function isWhite(code) {
        return code === 32 || (code >= 9 && code <= 13);
    }

    // The parts of a number in text by the styles, or null when it does
    // not match: { negative, digits, scale (digits before the point),
    // exponent } or { special: 'NaN' | 'Infinity' }.
    function scanNumber(text, styles, floating) {
        var pos = 0;
        var end = text.length;
        while (end > 0 && text.charCodeAt(end - 1) === 0)
            --end;
        if (styles & STYLE.leadingWhite)
            while (pos < end && isWhite(text.charCodeAt(pos)))
                ++pos;
        if (styles & STYLE.trailingWhite)
            while (end > pos && isWhite(text.charCodeAt(end - 1)))
                --end;
        var body = text.substring(pos, end);
        if (floating) {
            var lower = body.toLowerCase();
            if (lower === 'nan' || lower === '+nan' || lower === '-nan')
                return { special: 'NaN' };
            if (lower === 'infinity' || lower === '+infinity' || lower === '∞' || lower === '+∞')
                return { special: 'Infinity' };
            if (lower === '-infinity' || lower === '-∞')
                return { special: '-Infinity' };
        }
        pos = 0;
        end = body.length;
        var negative = false;
        var signSeen = false;
        var parenthesis = false;
        if ((styles & STYLE.leadingSign) && pos < end && (body.charAt(pos) === '-' || body.charAt(pos) === '+')) {
            negative = body.charAt(pos) === '-';
            signSeen = true;
            ++pos;
        } else if ((styles & STYLE.parentheses) && pos < end && body.charAt(pos) === '(') {
            parenthesis = true;
            negative = true;
            ++pos;
        }
        if ((styles & STYLE.currency) && body.charAt(pos) === '¤')
            ++pos;
        if (styles & STYLE.hex) {
            var hexMatch = /^[0-9A-Fa-f]+/.exec(body.substring(pos));
            if (hexMatch === null || pos + hexMatch[0].length !== end)
                return null;
            return { hex: hexMatch[0] };
        }
        if (styles & STYLE.binary) {
            var binaryMatch = /^[01]+/.exec(body.substring(pos));
            if (binaryMatch === null || pos + binaryMatch[0].length !== end)
                return null;
            return { binary: binaryMatch[0] };
        }
        var digits = '';
        var scale = 0;
        var sawDigit = false;
        var sawPoint = false;
        while (pos < end) {
            var ch = body.charAt(pos);
            if (ch >= '0' && ch <= '9') {
                sawDigit = true;
                if (digits.length > 0 || ch !== '0')
                    digits += ch;
                if (!sawPoint && (digits.length > 0))
                    ++scale;
                else if (sawPoint && digits.length === 0)
                    --scale;
                ++pos;
            } else if (ch === '.' && (styles & STYLE.decimalPoint) && !sawPoint) {
                sawPoint = true;
                ++pos;
            } else if (ch === ',' && (styles & STYLE.thousands) && !sawPoint && sawDigit) {
                ++pos;
            } else {
                break;
            }
        }
        if (!sawDigit)
            return null;
        var exponent = 0;
        if ((styles & STYLE.exponent) && pos < end && (body.charAt(pos) === 'e' || body.charAt(pos) === 'E')) {
            var exponentMatch = /^[eE]([-+]?)([0-9]+)/.exec(body.substring(pos));
            if (exponentMatch !== null) {
                exponent = Number(exponentMatch[2]);
                if (exponent > 100000)
                    exponent = 100000;
                if (exponentMatch[1] === '-')
                    exponent = -exponent;
                pos += exponentMatch[0].length;
            }
        }
        if ((styles & STYLE.currency) && body.charAt(pos) === '¤')
            ++pos;
        if (!signSeen && !parenthesis && (styles & STYLE.trailingSign) && pos < end && (body.charAt(pos) === '-' || body.charAt(pos) === '+')) {
            negative = body.charAt(pos) === '-';
            ++pos;
        }
        if (parenthesis) {
            if (body.charAt(pos) !== ')')
                return null;
            ++pos;
        }
        if (pos !== end)
            return null;
        return { negative: negative, digits: digits, scale: scale, exponent: exponent };
    }

    var OVERFLOW_NAMES = { i8: 'a signed byte', u8: 'an unsigned byte', i16: 'an Int16', u16: 'a UInt16', i32: 'an Int32',
                           u32: 'a UInt32', i64: 'an Int64', u64: 'a UInt64', decimal: 'a Decimal', char: 'a character' };
    var LIMITS = { i8: [-128, 127], u8: [0, 255], i16: [-32768, 32767], u16: [0, 65535], i32: [-2147483648, 2147483647],
                   u32: [0, 4294967295] };

    function overflowError(kind) {
        return rt().exception('System.OverflowException', 'Value was either too large or too small for ' + OVERFLOW_NAMES[kind] + '.');
    }

    function parseFailure(text) {
        return formatError("The input string '" + text + "' was not in a correct format.");
    }

    function nullArgument(name) {
        return rt().exception('System.ArgumentNullException', 'Value cannot be null. (Parameter \'' + name + '\')');
    }

    // An integer of a kind from text: { value } or { error }.
    function parseIntegerResult(text, styles, kind) {
        if (text === null || text === undefined)
            return { error: nullArgument('s') };
        var parts = scanNumber(text, styles, false);
        if (parts === null)
            return { error: parseFailure(text) };
        var bits = INTEGER_BITS[kind];
        if (parts.hex !== undefined || parts.binary !== undefined) {
            var raw = (parts.hex !== undefined ? parts.hex : parts.binary).replace(/^0+(?=.)/, '');
            var radix = parts.hex !== undefined ? 16 : 2;
            if (raw.length > 64)
                return { error: overflowError(kind) };
            var unsigned = big.parse(raw, radix);
            if (big.cmp(unsigned, big.pow(2, bits)) >= 0)
                return { error: overflowError(kind) };
            var signedKind = kind.charAt(0) === 'i';
            if (signedKind && big.cmp(unsigned, big.pow(2, bits - 1)) >= 0)
                unsigned = big.sub(unsigned, big.pow(2, bits));
            if (bits === 64)
                return { value: T.bigToI64(unsigned, signedKind) };
            return { value: big.toFloat(unsigned) };
        }
        // Digits after the point must be zeros; the exponent moves the point.
        var scale = parts.scale + parts.exponent;
        var digits = parts.digits;
        if (scale < digits.length) {
            var fraction = digits.substring(Math.max(scale, 0));
            if (/[1-9]/.test(fraction))
                return { error: overflowError(kind) };
            digits = digits.substring(0, Math.max(scale, 0));
        } else {
            digits += new Array(scale - digits.length + 1).join('0');
        }
        if (digits.length === 0)
            digits = '0';
        if (digits.length > 40)
            return { error: overflowError(kind) };
        var magnitude = big.parse(digits, 10);
        var value = parts.negative ? big.neg(magnitude) : magnitude;
        if (bits === 64) {
            var low = kind === 'i64' ? big.neg(big.pow(2, 63)) : 0;
            var high = kind === 'i64' ? big.sub(big.pow(2, 63), 1) : big.sub(big.pow(2, 64), 1);
            if (big.cmp(value, low) < 0 || big.cmp(value, high) > 0)
                return { error: overflowError(kind) };
            return { value: T.bigToI64(value, kind === 'i64') };
        }
        var limits = LIMITS[kind];
        var number = big.toFloat(value);
        if (number < limits[0] || number > limits[1])
            return { error: overflowError(kind) };
        return { value: number + 0 };
    }

    CS.parseInteger = function (text, styles, kind) {
        var result = parseIntegerResult(text, styles, kind);
        if (result.error !== undefined)
            throw result.error;
        return result.value;
    };

    CS.tryParseInteger = function (text, styles, kind) {
        if (text === null || text === undefined)
            return null;
        var result = parseIntegerResult(text, styles, kind);
        return result.error !== undefined ? null : result.value;
    };

    function parseFloatingResult(text, styles, single) {
        if (text === null || text === undefined)
            return { error: nullArgument('s') };
        var parts = scanNumber(text, styles, true);
        if (parts === null || parts.hex !== undefined || parts.binary !== undefined)
            return { error: parseFailure(text) };
        if (parts.special !== undefined)
            return { value: parts.special === 'NaN' ? NaN : (parts.special === 'Infinity' ? Infinity : -Infinity) };
        var value;
        if (parts.digits.length === 0) {
            value = 0;
        } else {
            var exponent = parts.scale + parts.exponent - 1;
            value = Number(parts.digits.charAt(0) + '.' + (parts.digits.substring(1) || '0') + 'e' + exponent);
        }
        if (parts.negative)
            value = -value;
        return { value: single ? Math.fround(value) : value };
    }

    CS.parseFloating = function (text, styles, single) {
        var result = parseFloatingResult(text, styles, single);
        if (result.error !== undefined)
            throw result.error;
        return result.value;
    };

    CS.tryParseFloating = function (text, styles, single) {
        if (text === null || text === undefined)
            return null;
        var result = parseFloatingResult(text, styles, single);
        return result.error !== undefined ? null : result.value;
    };

    // A decimal: at most 29 significant digits are kept, rounded half to
    // even beyond; too large a value overflows.
    function parseDecimalResult(text, styles) {
        if (text === null || text === undefined)
            return { error: nullArgument('s') };
        var parts = scanNumber(text, styles, false);
        if (parts === null || parts.hex !== undefined || parts.binary !== undefined)
            return { error: parseFailure(text) };
        var decimal = CS.decimal;
        var scale = parts.scale + parts.exponent;
        var digits = parts.digits;
        if (digits.length === 0)
            return { value: decimal.make(parts.negative, 0, Math.max(0, Math.min(28, -scale + (parts.digits.length)))) };
        if (scale > 29)
            return { error: overflowError('decimal') };
        // value = 0.digits * 10^scale: mantissa = digits, decimal scale = digits.length - scale.
        var decimalScale = digits.length - scale;
        var mantissa;
        if (decimalScale < 0) {
            mantissa = big.parse(digits + new Array(-decimalScale + 1).join('0'), 10);
            decimalScale = 0;
        } else {
            mantissa = big.parse(digits, 10);
        }
        var previous = decimal.onOverflow;
        try {
            decimal.onOverflow = function () { return overflowError('decimal'); };
            return { value: decimal.make(parts.negative, mantissa, decimalScale) };
        } catch (error) {
            if (rt().isException(error))
                return { error: error };
            throw error;
        } finally {
            decimal.onOverflow = previous;
        }
    }

    CS.parseDecimal = function (text, styles) {
        var result = parseDecimalResult(text, styles);
        if (result.error !== undefined)
            throw result.error;
        return result.value;
    };

    CS.tryParseDecimal = function (text, styles) {
        if (text === null || text === undefined)
            return null;
        var result = parseDecimalResult(text, styles);
        return result.error !== undefined ? null : result.value;
    };
})(globalThis);
