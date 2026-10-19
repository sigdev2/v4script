// Pascal: numbers as text in SysUtils - FloatToStrF, FloatToStr,
// FormatFloat and Format - the way Free Pascal 3.2.2 shows them (the rules
// were taken from its output, see docs/internals/pascal.md). Strings are
// byte strings; settings is a TFormatSettings object (JavaScript fields in
// lower case).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Pascal = T.pascal;
    if (Pascal.floatToStrF)
        return;

    var i64 = T.i64;
    var u64 = T.u64;

    var FF_GENERAL = 0, FF_EXPONENT = 1, FF_FIXED = 2, FF_NUMBER = 3, FF_CURRENCY = 4;

    // The most significant digits FloatToStrF shows for a value type; it
    // never shows fewer than two.
    var MAX_PRECISION = { f32: 10, f64: 17, f80: 17 };
    // The most decimals of ffFixed and ffCurrency; ffNumber shows one less.
    var MAX_DECIMALS = 18;
    // FormatFloat works with this many significant digits.
    var FORMAT_DIGITS = 17;
    // FormatFloat shows a number with more integer digits in the general
    // format.
    var FORMAT_MAX_EXPONENT = 18;

    function chr(code) {
        return String.fromCharCode(code);
    }

    function repeat(text, count) {
        return count > 0 ? new Array(count + 1).join(text) : '';
    }

    function isSpecial(value) {
        return value !== value || value === Infinity || value === -Infinity;
    }

    function specialName(value) {
        return value !== value ? 'Nan' : (value > 0 ? '+Inf' : '-Inf');
    }

    function precisionOf(precision, kind) {
        return Math.max(2, Math.min(precision, MAX_PRECISION[kind] || MAX_PRECISION.f80));
    }

    // Separators every three digits of an integer part.
    function group(digits, ts) {
        var result = '';
        for (var index = 0; index < digits.length; ++index) {
            if (index > 0 && (digits.length - index) % 3 === 0)
                result += ts;
            result += digits.charAt(index);
        }
        return result;
    }

    // ffGeneral: precision significant digits without trailing zeros; the
    // exponent form when the integer part has more digits than that or the
    // number is below 0.00001.
    function general(value, precision, kind, ds) {
        if (isSpecial(value))
            return specialName(value);
        if (value === 0)
            return '0';
        var count = precisionOf(precision, kind);
        var rounded = Pascal.realDigits(value, kind, count);
        var digits = rounded.digits.replace(/0+$/, '');
        var exponent = rounded.exponent;
        var sign = value < 0 ? '-' : '';
        if (exponent > count || exponent < -4) {
            var power = exponent - 1;
            return sign + digits.charAt(0) + (digits.length > 1 ? ds + digits.substring(1) : '') + 'E' +
                (power < 0 ? '-' : '') + Math.abs(power);
        }
        if (exponent <= 0)
            return sign + '0' + ds + repeat('0', -exponent) + digits;
        var padded = digits + repeat('0', exponent - digits.length);
        var fraction = padded.substring(exponent);
        return sign + padded.substring(0, exponent) + (fraction !== '' ? ds + fraction : '');
    }

    // ffExponent: precision significant digits, the exponent with a sign
    // and at least exponentDigits (up to 4) digits; an exponent of 0 with
    // no digits is left out.
    function exponential(value, precision, exponentDigits, kind, ds) {
        if (isSpecial(value))
            return specialName(value);
        var count = precisionOf(precision, kind);
        var rounded = value === 0 ? { digits: repeat('0', count), exponent: 1 } : Pascal.realDigits(value, kind, count);
        var power = value === 0 ? 0 : rounded.exponent - 1;
        var minimum = Math.max(0, Math.min(exponentDigits, 4));
        var powerText = power === 0 ? '' : String(Math.abs(power));
        powerText = repeat('0', minimum - powerText.length) + powerText;
        var text = (value < 0 ? '-' : '') + rounded.digits.charAt(0) + ds + rounded.digits.substring(1);
        if (powerText !== '')
            text += 'E' + (power < 0 ? '-' : '+') + powerText;
        return text;
    }

    // The fixed form of Str(x:0:decimals) in parts (a number too long for
    // it comes in the exponent form with a space in front, which only
    // Currency keeps). A negative zero loses its sign unless
    // keepZeroSign(hasPoint) says to keep it.
    function fixedParts(value, decimals, kind, keepZeroSign) {
        var text = isSpecial(value) ? specialName(value) : Pascal.strReal(0, Math.max(0, decimals), value, kind);
        if (keepZeroSign === neverKeep)
            text = text.replace(/^ +/, '');
        var negative = text.charAt(0) === '-';
        var body = negative ? text.substring(1) : text;
        var point = body.indexOf('.');
        if (negative && /^[0.]*$/.test(body) && !keepZeroSign(point >= 0))
            negative = false;
        return {
            negative: negative,
            whole: point < 0 ? body : body.substring(0, point),
            fraction: point < 0 ? null : body.substring(point + 1)
        };
    }

    function joinParts(parts, ds, ts, grouped) {
        var whole = grouped ? group(parts.whole, ts) : parts.whole;
        return whole + (parts.fraction !== null ? ds + parts.fraction : '');
    }

    function neverKeep() {
        return false;
    }

    // Currency keeps the minus of a zero without decimals.
    function keepWithoutPoint(hasPoint) {
        return !hasPoint;
    }

    function currency(value, decimals, kind, settings, ds, ts) {
        var parts = fixedParts(value, Math.min(decimals, MAX_DECIMALS), kind, keepWithoutPoint);
        var number = joinParts(parts, ds, ts, true);
        var symbol = settings.currencystring;
        if (!parts.negative) {
            switch (settings.currencyformat) {
            case 0: return symbol + number;
            case 1: return number + symbol;
            case 2: return symbol + ' ' + number;
            default: return number + ' ' + symbol;
            }
        }
        switch (settings.negcurrformat) {
        case 0: return '(' + symbol + number + ')';
        case 1: return '-' + symbol + number;
        case 2: return symbol + '-' + number;
        case 3: return symbol + number + '-';
        case 4: return '(' + number + symbol + ')';
        case 5: return '-' + number + symbol;
        case 6: return number + '-' + symbol;
        case 7: return number + symbol + '-';
        case 8: return '-' + number + ' ' + symbol;
        case 9: return '-' + symbol + ' ' + number;
        case 10: return number + ' ' + symbol + '-';
        case 11: return symbol + ' ' + number + '-';
        case 12: return symbol + ' -' + number;
        case 13: return number + '- ' + symbol;
        case 14: return '(' + symbol + ' ' + number + ')';
        default: return '(' + number + ' ' + symbol + ')';
        }
    }

    // format: 0 ffGeneral, 1 ffExponent, 2 ffFixed, 3 ffNumber, 4 ffCurrency;
    // kind: f32, f64, f80 - the type of the value.
    Pascal.floatToStrF = function (value, format, precision, digits, kind, settings) {
        var ds = chr(settings.decimalseparator);
        var ts = chr(settings.thousandseparator);
        switch (format) {
        case FF_GENERAL:
            return general(value, precision, kind, ds);
        case FF_EXPONENT:
            return exponential(value, precision, digits, kind, ds);
        case FF_FIXED: {
            var fixed = fixedParts(value, Math.min(digits, MAX_DECIMALS), kind, neverKeep);
            return (fixed.negative ? '-' : '') + joinParts(fixed, ds, ts, false);
        }
        case FF_NUMBER: {
            var number = fixedParts(value, Math.min(digits, MAX_DECIMALS - 1), kind, neverKeep);
            return (number.negative ? '-' : '') + joinParts(number, ds, ts, true);
        }
        case FF_CURRENCY:
            return currency(value, digits, kind, settings, ds, ts);
        }
        return '';
    };

    // FloatToStr: ffGeneral with 15 digits (fewer for Single).
    Pascal.floatToStr = function (value, kind, settings) {
        return general(value, 15, kind, chr(settings.decimalseparator));
    };

    // --- FormatFloat

    // The sections of a format: positive;negative;zero (a ; inside quotes
    // does not count).
    function splitSections(format) {
        var sections = [''];
        var quote = null;
        for (var index = 0; index < format.length; ++index) {
            var character = format.charAt(index);
            if (quote !== null) {
                if (character === quote)
                    quote = null;
            } else if (character === '"' || character === '\'') {
                quote = character;
            } else if (character === ';') {
                sections.push('');
                continue;
            }
            sections[sections.length - 1] += character;
        }
        return sections;
    }

    // A section as items: literal text, placeholders of the integer part
    // and of the decimals, the point and the exponent.
    function parseSection(section) {
        var items = [];
        var info = {
            items: items, intCount: 0, firstIntZero: -1, fracCount: 0, lastFracZero: 0, point: false,
            thousands: false, exponent: null
        };
        var index = 0;
        while (index < section.length) {
            var character = section.charAt(index);
            if (character === '"' || character === '\'') {
                var end = section.indexOf(character, index + 1);
                if (end < 0)
                    end = section.length;
                items.push({ k: 'text', text: section.substring(index + 1, end) });
                index = end + 1;
                continue;
            }
            if (character === '0' || character === '#') {
                if (info.point) {
                    ++info.fracCount;
                    if (character === '0')
                        info.lastFracZero = info.fracCount;
                    items.push({ k: 'frac', position: info.fracCount });
                } else {
                    if (character === '0' && info.firstIntZero < 0)
                        info.firstIntZero = info.intCount;
                    items.push({ k: 'int', position: info.intCount++ });
                }
            } else if (character === '.' && !info.point) {
                info.point = true;
                items.push({ k: 'point' });
            } else if (character === ',') {
                info.thousands = true;
            } else if ((character === 'E' || character === 'e') && info.exponent === null &&
                       /^[+-]0/.test(section.substring(index + 1, index + 3))) {
                var zeros = 0;
                while (section.charAt(index + 2 + zeros) === '0')
                    ++zeros;
                info.exponent = { letter: character, always: section.charAt(index + 1) === '+', digits: zeros };
                items.push({ k: 'exponent' });
                index += 2 + zeros;
                continue;
            } else {
                items.push({ k: 'text', text: character });
            }
            ++index;
        }
        return info;
    }

    // The digits of |value| for FormatFloat: { digits, exponent } as in
    // Pascal.realDigits, without trailing zeros. A NaN has no digits and
    // the exponent -32768, an infinity - 32767: FormatFloat shows them so.
    function formatDigits(value) {
        if (value !== value)
            return { digits: '', exponent: -32768 };
        if (value === Infinity || value === -Infinity)
            return { digits: '', exponent: 32767 };
        if (value === 0)
            return { digits: '', exponent: 0 };
        var rounded = Pascal.realDigits(value, 'f80', FORMAT_DIGITS);
        return { digits: rounded.digits.replace(/0+$/, ''), exponent: rounded.exponent };
    }

    // The digits of the integer part, of the decimals and the exponent text
    // of |value| for a section.
    function sectionNumber(info, value) {
        var source = formatDigits(value);
        var result = { whole: '', fraction: '', power: '' };
        if (info.exponent !== null) {
            var count = info.intCount + info.fracCount;
            var digits = repeat('0', count);
            var exponent = source.exponent;
            if (source.digits !== '') {
                var rounded = Pascal.roundDigitString(source.digits, count, true);
                digits = (rounded.digits + digits).substring(0, count);
                exponent += rounded.carry;
            }
            var power = value === 0 ? 0 : exponent - info.intCount;
            result.whole = digits.substring(0, info.intCount);
            result.fraction = digits.substring(info.intCount);
            while (result.fraction.length > info.lastFracZero && /0$/.test(result.fraction))
                result.fraction = result.fraction.substring(0, result.fraction.length - 1);
            var powerText = String(Math.abs(power));
            result.power = info.exponent.letter + (power < 0 ? '-' : (info.exponent.always ? '+' : '')) +
                repeat('0', info.exponent.digits - powerText.length) + powerText;
            return result;
        }
        // Digits rounded away keep the exponent of the number: its leading
        // zeros stay among the decimals.
        var shown = source.digits;
        var at = source.exponent;
        var keep = at + info.fracCount;
        if (keep < 0) {
            shown = '';
        } else if (shown !== '') {
            var cut = Pascal.roundDigitString(shown, keep, true);
            shown = cut.digits.replace(/0+$/, '');
            at += cut.carry;
        }
        var whole = at > 0 ? (shown + repeat('0', at - shown.length)).substring(0, at) : '';
        var minInt = info.firstIntZero < 0 ? 0 : info.intCount - info.firstIntZero;
        result.whole = repeat('0', minInt - whole.length) + whole;
        for (var position = 1; position <= info.fracCount; ++position) {
            var index = at + position - 1;
            if (index < 0)
                result.fraction += '0';
            else if (index < shown.length)
                result.fraction += shown.charAt(index);
            else if (position <= info.lastFracZero)
                result.fraction += '0';
            else
                break;
        }
        return result;
    }

    // The text of a section for |value|. Digits beyond the placeholders of the
    // integer part go to the first one; with no placeholders they stand
    // before the point.
    function formatSection(info, value, ds, ts) {
        var number = sectionNumber(info, value);
        var whole = number.whole;
        var extra = whole.length - info.intCount;
        var out = '';
        var wholeDone = false;
        info.items.forEach(function (item) {
            switch (item.k) {
            case 'text':
                out += item.text;
                break;
            case 'int':
                out += wholeDigits(item.position === 0 ? 0 : extra + item.position, extra + item.position + 1);
                wholeDone = true;
                break;
            case 'point':
                if (!wholeDone && info.intCount === 0) {
                    out += wholeDigits(0, whole.length);
                    wholeDone = true;
                }
                if (number.fraction !== '')
                    out += ds;
                break;
            case 'frac':
                out += number.fraction.charAt(item.position - 1);
                break;
            case 'exponent':
                out += number.power;
                break;
            }
        });
        return out;

        // whole[from, to) with the separators of these places.
        function wholeDigits(from, to) {
            var text = '';
            for (var index = Math.max(from, 0); index < Math.min(to, whole.length); ++index) {
                if (info.thousands && index > 0 && (whole.length - index) % 3 === 0)
                    text += ts;
                text += whole.charAt(index);
            }
            return text;
        }
    }

    // FormatFloat(format, value): kind - the type of the value (f80). An empty
    // section shows the number in the general format; so does a fixed one
    // for a number too big.
    Pascal.formatFloat = function (format, value, kind, settings) {
        var ds = chr(settings.decimalseparator);
        var ts = chr(settings.thousandseparator);
        var sections = splitSections(format);
        var zero = value === 0 || value !== value;
        var section, sign = '';
        if (zero && sections.length >= 3) {
            section = sections[2];
        } else if (value < 0 && sections.length >= 2) {
            section = sections[1];
        } else {
            section = sections[0];
            sign = value < 0 ? '-' : '';
        }
        if (section === '')
            return general(value, 15, kind, ds);
        var info = parseSection(section);
        if (info.exponent === null && formatDigits(value).exponent > FORMAT_MAX_EXPONENT)
            return general(value, 15, kind, ds);
        return sign + formatSection(info, Math.abs(value), ds, ts);
    };

    // --- Format

    function formatError(rt, kind, fmt) {
        var messages = {
            invalid: 'Invalid format specifier : "%s"',
            index: 'Invalid argument index in format "%s"'
        };
        var text = messages[kind].replace('%s', fmt);
        var made = rt.session.makeException('econverterror', text);
        if (made !== null) {
            made.stack = new Error(text).stack;
            throw made;
        }
        throw new T.LanguageError(text);
    }

    // vtype of array of const: 0 Integer, 2 Char, 3 Extended, 5 Pointer,
    // 9 WideChar, 13 JavaScript value, 16 Int64, 17 QWord, strings 4, 11,
    // 15, 18.
    var VT_INTEGER = 0, VT_CHAR = 2, VT_EXTENDED = 3, VT_POINTER = 5, VT_WIDECHAR = 9, VT_JS = 13, VT_INT64 = 16,
        VT_QWORD = 17;
    var INTEGER_TYPES = [VT_INTEGER, VT_INT64, VT_QWORD];
    var TEXT_TYPES = [4, 11, 15, 18, VT_CHAR, VT_WIDECHAR, VT_JS];

    function zeroPad(text, count) {
        return repeat('0', count - text.length) + text;
    }

    // Format(fmt, args): %[index:][-][width][.precision]type; index, width
    // and precision may be * (the next argument). args: [{ vtype, v }]
    // (array of const).
    Pascal.format = function (rt, fmt, args, settings) {
        var result = '';
        var length = fmt.length;
        var pos = 0;
        var next = 0;
        while (pos < length) {
            var character = fmt.charAt(pos++);
            if (character !== '%') {
                result += character;
                continue;
            }
            // A % at the end shows nothing.
            if (pos >= length)
                break;
            if (fmt.charAt(pos) === '%') {
                result += '%';
                ++pos;
                continue;
            }
            var value = readNumber();
            if (fmt.charAt(pos) === ':') {
                next = value === undefined ? 0 : value;
                value = undefined;
                ++pos;
            }
            var left = false;
            if (fmt.charAt(pos) === '-') {
                left = true;
                ++pos;
            }
            if (value === undefined)
                value = readNumber();
            var width = value === undefined ? -1 : value;
            var precision = -1;
            if (fmt.charAt(pos) === '.') {
                ++pos;
                value = readNumber();
                precision = value === undefined ? 0 : value;
            }
            if (pos >= length)
                formatError(rt, 'invalid', fmt);
            var text = convert(fmt.charAt(pos++).toUpperCase(), precision);
            if (width > text.length)
                text = left ? text + repeat(' ', width - text.length) : repeat(' ', width - text.length) + text;
            result += text;
        }
        return result;

        function readNumber() {
            if (fmt.charAt(pos) === '*') {
                ++pos;
                var arg = take(INTEGER_TYPES);
                return arg.vtype === VT_INTEGER ? arg.v : i64.low32(arg.v);
            }
            var start = pos;
            while (pos < length && fmt.charAt(pos) >= '0' && fmt.charAt(pos) <= '9')
                ++pos;
            return pos > start ? Number(fmt.substring(start, pos)) : undefined;
        }

        // The next argument; it must be of one of the vtypes.
        function take(vtypes) {
            var arg = args[next];
            if (arg === undefined || vtypes.indexOf(arg.vtype) < 0)
                formatError(rt, 'index', fmt);
            ++next;
            return arg;
        }

        function real() {
            return take([VT_EXTENDED]).v;
        }

        function convert(type, precision) {
            var arg, text;
            switch (type) {
            case 'D':
                arg = take(INTEGER_TYPES);
                text = arg.vtype === VT_INTEGER ? String(arg.v)
                                                : i64.str(arg.vtype === VT_QWORD ? i64.fromUnsigned(arg.v) : arg.v);
                return text.charAt(0) === '-' ? '-' + zeroPad(text.substring(1), precision) : zeroPad(text, precision);
            case 'U':
                arg = take(INTEGER_TYPES);
                text = arg.vtype === VT_INTEGER ? String(arg.v >>> 0)
                                                : u64.str(arg.vtype === VT_INT64 ? u64.fromSigned(arg.v) : arg.v);
                return zeroPad(text, precision);
            case 'X':
                arg = take(INTEGER_TYPES);
                if (arg.vtype === VT_INTEGER)
                    return zeroPad((arg.v >>> 0).toString(16).toUpperCase(), Math.min(precision, 16));
                text = u64.str(arg.vtype === VT_INT64 ? u64.fromSigned(arg.v) : arg.v, 16).toUpperCase();
                return zeroPad(text, Math.min(precision, 31));
            case 'E':
                return Pascal.floatToStrF(real(), FF_EXPONENT, precision < 0 ? 9999 : precision, 3, 'f80', settings);
            case 'F':
                return Pascal.floatToStrF(real(), FF_FIXED, 9999, precision < 0 ? 2 : precision, 'f80', settings);
            case 'G':
                return Pascal.floatToStrF(real(), FF_GENERAL, precision < 0 ? 9999 : precision, 3, 'f80', settings);
            case 'N':
                return Pascal.floatToStrF(real(), FF_NUMBER, 9999, precision < 0 ? 2 : precision, 'f80', settings);
            case 'M':
                return Pascal.floatToStrF(real(), FF_CURRENCY, 9999,
                                          precision < 0 ? settings.currencydecimals : precision, 'f80', settings);
            case 'S':
                arg = take(TEXT_TYPES);
                if (arg.vtype === VT_CHAR)
                    text = chr(arg.v);
                else if (arg.vtype === VT_WIDECHAR)
                    text = T.utf8.encodeRune(arg.v);
                else if (arg.vtype === VT_JS)
                    text = rt.jbytes(arg.v);
                else
                    text = arg.v;
                return precision >= 0 ? text.substring(0, precision) : text;
            case 'P':
                take([VT_POINTER]);
                return repeat('0', 16);
            }
            // An unknown type letter shows nothing.
            return '';
        }
    };
})(globalThis);
