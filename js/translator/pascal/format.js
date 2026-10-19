// Pascal: numbers as text and back, the way Free Pascal 3.2.2 shows them.
//
// Write and Str for reals: a number of significant digits per type, the
// exponent with a fixed number of digits, fixed notation for x:w:d. The
// digits are the exact value correctly rounded to the full precision of the
// type; shorter output rounds that digit string with the rule of Free
// Pascal (roundDigits). Val reads integers and reals with the error
// position of Free Pascal. Everything here follows the output of fpc
// 3.2.2 (docs/internals/pascal.md), not its sources.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Pascal = T.pascal;
    if (Pascal.strReal)
        return;

    var big = T.big;
    var numbers = T.numbers;

    // Width when Write has none.
    var NO_WIDTH = -32767;
    Pascal.NO_WIDTH = NO_WIDTH;

    // Significant digits of the full form and digits of the exponent;
    // decimals - the most decimals of the exponent form (Currency fills
    // any width with zeros).
    var KINDS = {
        f32: { digits: 10, exponent: 2, decimals: 9 },
        f64: { digits: 17, exponent: 3, decimals: 16 },
        f80: { digits: 21, exponent: 4, decimals: 20 },
        comp: { digits: 19, exponent: 4, decimals: 18 },
        currency: { digits: 19, exponent: 2, decimals: 255 }
    };

    // More decimals than this are cut (Str(0.5:0:300) gives 216).
    var MAX_DECIMALS = 216;
    // Longer fixed notation turns into the exponent form.
    var MAX_FIXED_LENGTH = 255;

    function zeros(count) {
        return count > 0 ? new Array(count + 1).join('0') : '';
    }

    function spaces(count) {
        return count > 0 ? new Array(count + 1).join(' ') : '';
    }

    function padLeft(text, width) {
        return width > text.length ? spaces(width - text.length) + text : text;
    }

    // Digits of |value| for a kind: { digits, exponent }, value = 0.digits *
    // 10^exponent (no digits for zero). The significant digits of the value
    // are cut to kind.digits and rounded, a half to even. They end where the
    // value ends, and rounding up drops the zeros its carry leaves at the
    // end, while a zero digit of the value itself stays: roundDigits
    // depends on that. Comp and Currency are whole numbers of units (1 and
    // 1/10000) in Free Pascal: their digits come from that number.
    function fullDigits(value, kindName) {
        var magnitude = Math.abs(value);
        var units = kindName === 'currency'
            ? Math.round(magnitude * 10000)
            : (kindName === 'comp' ? Math.round(magnitude) : -1);
        if (magnitude === 0 || units === 0)
            return { digits: '', exponent: 1 };
        if (units > 0 && units <= 9007199254740991) {
            var text = String(units);
            return { digits: text.replace(/0+$/, ''), exponent: text.length - (kindName === 'currency' ? 4 : 0) };
        }
        var exact = numbers.exactDigits(magnitude);
        var count = KINDS[kindName].digits;
        var digits = exact.digits;
        var exponent = exact.exponent;
        if (digits.length > count) {
            var kept = digits.substring(0, count);
            var next = digits.charCodeAt(count) - 48;
            var tie = next === 5 && digits.length === count + 1;
            if (next > 5 || (next === 5 && (!tie || (kept.charCodeAt(count - 1) - 48) % 2 === 1))) {
                var rounded = increment(kept, count);
                kept = rounded.digits.replace(/0+$/, '');
                exponent += rounded.carry;
            }
            digits = kept;
        }
        return { digits: digits, exponent: exponent };
    }

    // kept + 1 in the last digit: { digits, carry } - carry 1 if all were 9.
    function increment(kept, length) {
        var chars = kept.split('');
        for (var index = chars.length - 1; index >= 0; --index) {
            if (chars[index] !== '9') {
                chars[index] = String.fromCharCode(chars[index].charCodeAt(0) + 1);
                return { digits: chars.join(''), carry: 0 };
            }
            chars[index] = '0';
        }
        return { digits: ('1' + chars.join('')).substring(0, Math.max(length, 1)), carry: 1 };
    }

    // The digits of fullDigits rounded to count digits. A digit of 5 or
    // more rounds up; so does a 4 when at least three digits follow it, all
    // but the last two of them are 9 and the second to last is 8 or 9: a
    // value with the digits ...4999...98 is shown as ...5. Free Pascal does
    // so (found by comparing a few hundred thousand outputs of fpc 3.2.2),
    // except for Currency (plain).
    function roundDigits(digits, count, plain) {
        if (count >= digits.length)
            return { digits: digits + zeros(count - digits.length), carry: 0 };
        if (count < 0)
            return { digits: '', carry: 0 };
        var next = digits.charCodeAt(count) - 48;
        var up = next >= 5;
        if (next === 4 && !plain && digits.length - count >= 4 && digits.charCodeAt(digits.length - 2) - 48 >= 8) {
            up = true;
            for (var index = count + 1; index < digits.length - 2 && up; ++index)
                up = digits.charAt(index) === '9';
        }
        var kept = digits.substring(0, count);
        if (!up)
            return { digits: kept, carry: 0 };
        return increment(kept, count);
    }

    function isNegative(value) {
        return value < 0 || (value === 0 && 1 / value < 0);
    }

    function fullWidth(kind) {
        // sign, digit, point, decimals, E, exponent sign, exponent digits
        return 5 + (kind.digits - 1) + kind.exponent;
    }

    function exponentForm(value, kindName, width) {
        var kind = KINDS[kindName];
        var decimals = Math.max(1, Math.min(kind.decimals, width - (5 + kind.exponent)));
        var full = fullDigits(value, kindName);
        var rounded = roundDigits(full.digits, decimals + 1, kindName === 'currency');
        var exponent = value === 0 ? 0 : full.exponent + rounded.carry - 1;
        var power = String(Math.abs(exponent));
        var text = (isNegative(value) ? '-' : ' ') + rounded.digits.charAt(0) + '.' + rounded.digits.substring(1) +
            'E' + (exponent < 0 ? '-' : '+') + zeros(kind.exponent - power.length) + power;
        return padLeft(text, width);
    }

    function fixedForm(value, kindName, width, decimals) {
        decimals = Math.min(decimals, MAX_DECIMALS);
        var full = fullDigits(value, kindName);
        var exponent = full.exponent;
        var count = exponent + decimals;
        var digits;
        if (count < 0 || value === 0) {
            digits = '';
        } else {
            var rounded = roundDigits(full.digits, count, kindName === 'currency');
            digits = rounded.digits;
            exponent += rounded.carry;
        }
        var whole, fraction;
        if (exponent > 0) {
            var padded = digits + zeros(exponent - digits.length);
            whole = padded.substring(0, exponent).replace(/^0+(?=\d)/, '');
            fraction = padded.substring(exponent);
        } else {
            whole = '0';
            fraction = zeros(-exponent) + digits;
        }
        fraction = (fraction + zeros(decimals)).substring(0, decimals);
        var text = (isNegative(value) ? '-' : '') + (whole || '0') + (decimals > 0 ? '.' + fraction : '');
        if (text.length > MAX_FIXED_LENGTH)
            return exponentForm(value, kindName, width);
        return padLeft(text, width);
    }

    // Write(x:width:decimals) and Str: width NO_WIDTH - none, decimals < 0
    // - none (the exponent form). kindName: f32, f64, f80, comp, currency.
    Pascal.strReal = function (width, decimals, value, kindName) {
        var kind = KINDS[kindName] || KINDS.f80;
        if (KINDS[kindName] === undefined)
            kindName = 'f80';
        if (width === NO_WIDTH)
            width = decimals < 0 ? fullWidth(kind) : 0;
        if (value !== value || value === Infinity || value === -Infinity) {
            var name = value !== value ? 'Nan' : (value > 0 ? '+Inf' : '-Inf');
            return padLeft(name, width);
        }
        if (decimals < 0)
            return exponentForm(value, kindName, width);
        return fixedForm(value, kindName, width, decimals);
    };

    // The digits of a finite |value| as Write sees them: { digits, exponent },
    // value = 0.digits * 10^exponent. With count - rounded to count significant
    // digits (padded with zeros), without - the digits of the full form
    // without trailing zeros. Zero has no digits and the exponent 1.
    Pascal.realDigits = function (value, kindName, count) {
        var full = fullDigits(value, KINDS[kindName] ? kindName : 'f80');
        if (count === undefined)
            return full;
        var rounded = roundDigits(full.digits, count, kindName === 'currency');
        return { digits: rounded.digits, exponent: full.exponent + rounded.carry };
    };

    // Rounds a digit string (0.digits) to count digits the way Write does
    // (plain - without the rule for ...4999...98): { digits, carry }, carry
    // 1 when the rounding adds a digit in front.
    Pascal.roundDigitString = function (digits, count, plain) {
        return roundDigits(digits, count, plain);
    };

    // Comp and Currency keep whole units (1 and 1/10000): a value stored in
    // them is rounded to a unit, a half to even. Currency first drops the
    // binary noise of the product (0.00015 * 10000 is 1.4999999999999998).
    Pascal.toUnits = function (value, scale) {
        if (value !== value || value === Infinity || value === -Infinity)
            return value;
        var scaled = value * scale;
        if (scale !== 1)
            scaled = Number(scaled.toPrecision(15));
        var whole = Math.floor(scaled);
        var rest = scaled - whole;
        if (rest > 0.5 || (rest === 0.5 && whole % 2 !== 0))
            whole += 1;
        return whole / scale;
    };

    // Str takes the width of an integer as a byte (300 - 44) and limits
    // the width of a real to 255; Write pads to any width.
    Pascal.strWidth = function (width, real) {
        if (width <= 255)
            return width;
        return real ? 255 : width & 255;
    };

    Pascal.strInt = function (value, width, unsigned) {
        var text = typeof value === 'number' ? String(value) : (unsigned ? T.u64.str(value) : T.i64.str(value));
        return padLeft(text, width === undefined ? 0 : width);
    };

    Pascal.pad = function (text, width) {
        return padLeft(text, width === undefined ? 0 : width);
    };

    // --- Val: text to a number. The result is { value, code }: code - the
    // position (from 1) of the character that is wrong, 0 - none.

    var DIGIT_VALUES = {};
    '0123456789abcdef'.split('').forEach(function (digit, index) {
        DIGIT_VALUES[digit] = index;
        DIGIT_VALUES[digit.toUpperCase()] = index;
    });

    function isBlank(character) {
        return character === ' ' || character === '\t';
    }

    // An integer of kind ik (i8 ... u64). Spaces and tabs before it, a sign,
    // a base prefix ($ x 0x - 16, % - 2, & - 8), digits; a NUL character
    // ends the text. The number must fit 64 bits (signed decimals - Int64,
    // other bases and unsigned kinds - QWord); then it wraps to the size of
    // the kind, as with range checks off.
    Pascal.valInt = function (text, ik) {
        var signed = ik.charAt(0) === 'i';
        var bits = Number(ik.substring(1));
        var end = text.indexOf('\0');
        var length = end < 0 ? text.length : end;
        if (length === 0)
            return { value: 0, code: 1 };
        var position = 1;
        while (position <= length && isBlank(text.charAt(position - 1)))
            ++position;
        var negative = false;
        var character = text.charAt(position - 1);
        if (character === '-' || character === '+') {
            negative = character === '-';
            ++position;
        }
        var base = 10;
        character = text.charAt(position - 1);
        if (character === '$' || character === 'x' || character === 'X') {
            base = 16;
            ++position;
        } else if (character === '%') {
            base = 2;
            ++position;
        } else if (character === '&') {
            base = 8;
            ++position;
        } else if (character === '0' && (text.charAt(position) === 'x' || text.charAt(position) === 'X')) {
            base = 16;
            position += 2;
        }
        if (position > length || (negative && !signed))
            return { value: 0, code: position };
        var limit = signed && base === 10 ? big.add(big.sub(big.pow(2, 63), 1), negative ? 1 : 0)
                                          : big.sub(big.pow(2, 64), 1);
        var value = 0;
        for (; position <= length; ++position) {
            character = text.charAt(position - 1);
            var digit = DIGIT_VALUES[character];
            if (digit === undefined || digit >= base)
                return { value: 0, code: position };
            value = big.add(big.mul(value, base), digit);
            if (big.cmp(value, limit) > 0)
                return { value: 0, code: position };
        }
        if (negative)
            value = big.neg(value);
        // Wraps to the size of the kind (two's complement).
        var modulus = big.pow(2, bits);
        value = big.mod(value, modulus);
        if (signed && big.cmp(value, big.pow(2, bits - 1)) >= 0)
            value = big.sub(value, modulus);
        return { value: T.bigToI64(value, signed || ik !== 'u64'), code: 0 };
    };

    // A real: spaces before it, a sign, INF or NAN (any case), or digits
    // with a point and an exponent; nothing may follow. Too big a number is
    // an infinity, too small - zero.
    Pascal.valReal = function (text) {
        var length = text.length;
        var position = 1;
        while (position <= length && text.charAt(position - 1) === ' ')
            ++position;
        if (position > length)
            return { value: 0, code: position };
        var negative = false;
        var character = text.charAt(position - 1);
        if (character === '-' || character === '+') {
            negative = character === '-';
            ++position;
        }
        var word = text.substring(position - 1).toUpperCase();
        if (word === 'INF')
            return { value: negative ? -Infinity : Infinity, code: 0 };
        if (word === 'NAN')
            return { value: NaN, code: 0 };
        var mantissa = '';
        while (position <= length && /[0-9]/.test(text.charAt(position - 1)))
            mantissa += text.charAt(position++ - 1);
        if (position <= length && text.charAt(position - 1) === '.') {
            mantissa += '.';
            ++position;
            while (position <= length && /[0-9]/.test(text.charAt(position - 1)))
                mantissa += text.charAt(position++ - 1);
        }
        var exponent = '';
        if (position <= length) {
            character = text.charAt(position - 1);
            if (character !== 'e' && character !== 'E')
                return { value: 0, code: position };
            ++position;
            if (position > length)
                return { value: 0, code: position };
            character = text.charAt(position - 1);
            if (character === '-' || character === '+') {
                exponent = character === '-' ? '-' : '';
                ++position;
            }
            for (; position <= length; ++position) {
                character = text.charAt(position - 1);
                if (!/[0-9]/.test(character))
                    return { value: 0, code: position };
                exponent += character;
            }
        }
        if (mantissa === '' || mantissa === '.')
            mantissa = '0';
        var value = Number(mantissa.replace(/\.$/, '') + (/[0-9]/.test(exponent) ? 'e' + exponent : ''));
        return { value: negative ? -value : value, code: 0 };
    };
})(globalThis);
