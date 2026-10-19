// Java: String.format and printf (java.util.Formatter): %d %s %f %e %g %x
// %o %c %b %h %n %%, width, precision, the flags - + 0 , ( # and space.
// Floats in %f/%e round half up by the shortest digits of the number, as
// in Java (2.675 -> "2.68").
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Java = T.java;
    if (Java.format)
        return;

    var i64 = T.i64;

    function fail(name, message) {
        return Java.rt.exception(name, message);
    }

    function repeat(text, count) {
        var result = '';
        for (var index = 0; index < count; ++index)
            result += text;
        return result;
    }
    // The digits of a float rounded half up by the shortest notation:
    // { digits, exponent } - value = 0.digits * 10^exponent; count - digits
    // after the point (fixed) or significant (significant).
    function roundShortest(value, count, mode) {
        var shortest = T.numbers.shortest(value);
        var digits = shortest.digits;
        var exponent = shortest.exponent;
        if (value === 0)
            return { digits: '0', exponent: 1 };
        var keep = mode === 'fixed' ? exponent + count : count;
        if (keep < 0)
            return { digits: '0', exponent: 1 };
        if (keep >= digits.length)
            return { digits: digits, exponent: exponent };
        var head = digits.substring(0, keep);
        var up = digits.charAt(keep) >= '5';
        if (up) {
            var chars = ('0' + head).split('');
            var index = chars.length - 1;
            while (index >= 0) {
                if (chars[index] === '9') {
                    chars[index] = '0';
                    --index;
                } else {
                    chars[index] = String.fromCharCode(chars[index].charCodeAt(0) + 1);
                    break;
                }
            }
            head = chars.join('');
            if (head.charAt(0) === '0')
                head = head.substring(1);
            else
                ++exponent;
        }
        head = head.replace(/0+$/, '');
        return { digits: head.length === 0 ? '0' : head, exponent: head.length === 0 ? 1 : exponent };
    }

    function fixedText(value, precision) {
        var rounded = roundShortest(Math.abs(value), precision, 'fixed');
        var digits = rounded.digits, exponent = rounded.exponent;
        var whole, fraction;
        if (exponent <= 0) {
            whole = '0';
            fraction = repeat('0', -exponent) + digits;
        } else {
            whole = digits.substring(0, exponent) + repeat('0', Math.max(0, exponent - digits.length));
            fraction = digits.substring(exponent);
        }
        fraction = (fraction + repeat('0', precision)).substring(0, precision);
        return whole.replace(/^0+(?=\d)/, '') + (precision > 0 ? '.' + fraction : '');
    }

    function scientificText(value, precision, upper) {
        var abs = Math.abs(value);
        var rounded = abs === 0 ? { digits: '0', exponent: 1 } : roundShortest(abs, precision + 1, 'significant');
        var digits = (rounded.digits + repeat('0', precision + 1)).substring(0, precision + 1);
        var exponent = abs === 0 ? 0 : rounded.exponent - 1;
        var power = String(Math.abs(exponent));
        if (power.length < 2)
            power = '0' + power;
        return digits.charAt(0) + (precision > 0 ? '.' + digits.substring(1) : '') + (upper ? 'E' : 'e') +
            (exponent < 0 ? '-' : '+') + power;
    }

    function groupDigits(text) {
        var dot = text.indexOf('.');
        var whole = dot >= 0 ? text.substring(0, dot) : text;
        var rest = dot >= 0 ? text.substring(dot) : '';
        // Without a regular expression: V4 inserts the comma twice.
        var sign = /^[^0-9]*/.exec(whole)[0];
        var digits = whole.substring(sign.length);
        var grouped = '';
        for (var index = 0; index < digits.length; ++index) {
            if (index > 0 && (digits.length - index) % 3 === 0)
                grouped += ',';
            grouped += digits.charAt(index);
        }
        return sign + grouped + rest;
    }
    // The kind of an argument: int, long, double, char, boolean, string, null, object.
    function argumentKind(value) {
        if (value === null || value === undefined)
            return 'null';
        switch (typeof value) {
        case 'number':
            return 'int';
        case 'boolean':
            return 'boolean';
        case 'string':
            return 'string';
        }
        var name = Java.rt.className(value);
        switch (name) {
        case 'java.lang.Long':
            return 'long';
        case 'java.lang.Short':
        case 'java.lang.Byte':
            return 'short';
        case 'java.lang.Double':
            return 'double';
        case 'java.lang.Float':
            return 'float';
        case 'java.lang.Character':
            return 'char';
        }
        return 'object';
    }

    function pad(text, spec, zeroAllowed) {
        if (spec.width <= text.length)
            return text;
        var fill = spec.width - text.length;
        if (spec.flags.indexOf('-') >= 0)
            return text + repeat(' ', fill);
        if (zeroAllowed && spec.flags.indexOf('0') >= 0) {
            var sign = /^[+\-( ]/.test(text) ? text.charAt(0) : '';
            var prefix = /^[+\-( ]?0[xX]/.test(text) ? text.substring(0, sign.length + 2) : sign;
            return prefix + repeat('0', fill) + text.substring(prefix.length);
        }
        return repeat(' ', fill) + text;
    }

    // The sign and the flags + space ( of a number.
    function signed(text, negative, spec) {
        var flags = spec.flags;
        if (negative)
            return flags.indexOf('(') >= 0 ? '(' + text + ')' : '-' + text;
        if (flags.indexOf('+') >= 0)
            return '+' + text;
        if (flags.indexOf(' ') >= 0)
            return ' ' + text;
        return text;
    }

    function badConversion(conversion, value) {
        return fail('java.util.IllegalFormatConversionException', conversion + ' != ' + Java.rt.className(value));
    }
    // An integer: %d %o %x %X.
    function integerConversion(value, conversion, spec) {
        var kind = argumentKind(value);
        var number = kind === 'int' ? value : (kind === 'long' || kind === 'short' ? value.value : null);
        if (number === null)
            throw badConversion(conversion, value);
        var isLong = kind === 'long';
        var text;
        if (conversion === 'd') {
            text = isLong ? i64.str(number) : String(number);
            var negative = text.charAt(0) === '-';
            if (negative)
                text = text.substring(1);
            if (spec.flags.indexOf(',') >= 0)
                text = groupDigits(text);
            return pad(signed(text, negative, spec), spec, true);
        }
        var radix = conversion === 'o' ? 8 : 16;
        if (isLong)
            text = T.u64.str(T.u64.fromSigned(number), radix);
        else
            text = ((kind === 'short' ? number & (Java.rt.className(value) === 'java.lang.Byte' ? 0xFF : 0xFFFF) : number) >>> 0).toString(radix);
        if (spec.flags.indexOf('#') >= 0)
            text = (radix === 8 ? '0' : '0x') + text;
        if (conversion === 'X')
            text = text.toUpperCase();
        return pad(text, spec, true);
    }

    // A float: %f %e %E %g %G.
    function floatConversion(value, conversion, spec) {
        var kind = argumentKind(value);
        if (kind !== 'double' && kind !== 'float')
            throw badConversion(conversion, value);
        var number = value.value;
        var upper = conversion === 'E' || conversion === 'G';
        if (number !== number || !isFinite(number)) {
            var special = number !== number ? 'NaN' : 'Infinity';
            return pad(number !== number ? special : signed(special, number < 0, spec), spec, false);
        }
        var precision = spec.precision < 0 ? 6 : spec.precision;
        var negative = number < 0 || (number === 0 && 1 / number < 0);
        var text;
        if (conversion === 'f') {
            text = fixedText(number, precision);
        } else if (conversion === 'e' || conversion === 'E') {
            text = scientificText(number, precision, upper);
        } else {
            if (precision === 0)
                precision = 1;
            var abs = Math.abs(number);
            var rounded = abs === 0 ? 0 : Number(scientificText(abs, precision - 1, false));
            if (rounded !== 0 && (rounded < 1e-4 || rounded >= Math.pow(10, precision))) {
                text = scientificText(number, precision - 1, upper);
            } else {
                var exponent = rounded === 0 ? 0 : Math.floor(Math.log10(rounded) + 1e-12);
                text = fixedText(number, Math.max(0, precision - 1 - exponent));
            }
        }
        if (spec.flags.indexOf(',') >= 0)
            text = groupDigits(text);
        return pad(signed(text, negative, spec), spec, true);
    }
    var SPECIFIER = /%(\d+\$)?([-#+ 0,(<]*)(\d+)?(\.\d+)?([a-zA-Z%])/g;

    Java.format = function (format, args) {
        var list = args === null || args === undefined ? [] : Array.prototype.slice.call(args);
        var out = '';
        var last = 0;
        var ordinary = 0;
        var previous = null;
        SPECIFIER.lastIndex = 0;
        var match;
        while ((match = SPECIFIER.exec(format)) !== null) {
            out += format.substring(last, match.index);
            last = SPECIFIER.lastIndex;
            var conversion = match[5];
            var spec = { flags: match[2] || '', width: match[3] ? Number(match[3]) : -1,
                         precision: match[4] ? Number(match[4].substring(1)) : -1 };
            if (conversion === 'n') {
                out += '\n';
                continue;
            }
            if (conversion === '%') {
                out += pad('%', spec, false);
                continue;
            }
            var index;
            if (match[1])
                index = Number(match[1].slice(0, -1)) - 1;
            else if (spec.flags.indexOf('<') >= 0)
                index = previous;
            else
                index = ordinary++;
            if (index === null || index >= list.length)
                throw fail('java.util.MissingFormatArgumentException', "Format specifier '" + match[0] + "'");
            previous = index;
            out += convert(list[index], conversion, spec);
        }
        var rest = format.substring(last);
        var stray = rest.indexOf('%');
        if (stray >= 0)
            throw fail('java.util.UnknownFormatConversionException', "Conversion = '" + (rest.charAt(stray + 1) || '%') + "'");
        return out + rest;
    };

    function convert(value, conversion, spec) {
        var lower = conversion.toLowerCase();
        var upper = conversion !== lower;
        var text;
        switch (lower) {
        case 'd':
        case 'o':
        case 'x':
            return integerConversion(value, conversion, spec);
        case 'f':
        case 'e':
        case 'g':
            return floatConversion(value, conversion, spec);
        case 's':
            text = Java.rt.str(value);
            break;
        case 'b':
            text = value === null || value === undefined ? 'false' : (typeof value === 'boolean' ? String(value) : 'true');
            break;
        case 'h':
            text = value === null || value === undefined ? 'null' : (Java.rt.hashCode(value) >>> 0).toString(16);
            break;
        case 'c': {
            var kind = argumentKind(value);
            if (kind === 'null')
                text = 'null';
            else if (kind === 'char')
                text = String.fromCharCode(value.value);
            else if (kind === 'int')
                text = String.fromCodePoint(value);
            else
                throw badConversion(conversion, value);
            break;
        }
        default:
            throw fail('java.util.UnknownFormatConversionException', "Conversion = '" + conversion + "'");
        }
        if (spec.precision >= 0)
            text = text.substring(0, spec.precision);
        if (upper)
            text = text.toUpperCase();
        return pad(text, spec, false);
    }
})(globalThis);
