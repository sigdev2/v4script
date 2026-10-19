// WAT: numbers of the text format - integers of a given width and floats
// with exact rounding (decimal and hexadecimal notation right into f32/f64,
// without double rounding through double), number notation for output.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var W = T.wat;
    if (W.numbers)
        return;

    var big = T.big;

    function digitsOf(text) {
        return text.replace(/_/g, '');
    }

    // An unsigned integer from a token (decimal or 0x...); null - not an integer.
    function parseNatural(text) {
        if (!/^(?:[0-9](?:_?[0-9])*|0x[0-9A-Fa-f](?:_?[0-9A-Fa-f])*)$/.test(text))
            return null;
        var clean = digitsOf(text);
        return clean.substring(0, 2) === '0x' ? big.parse(clean.substring(2), 16) : big.parse(clean, 10);
    }

    // A signed or unsigned integer: { value (T.big), signed }.
    function parseInteger(text) {
        var sign = text.charAt(0);
        var signed = sign === '-' || sign === '+';
        var value = parseNatural(signed ? text.substring(1) : text);
        if (value === null)
            return null;
        return { value: sign === '-' ? big.neg(value) : value, signed: signed };
    }

    var TWO32 = 4294967296;

    var numbers = {
        // u32 - indices, limits, offset and align. null - not a number.
        u32: function (text) {
            var value = parseNatural(text);
            if (value === null)
                return null;
            if (big.cmp(value, TWO32 - 1) > 0)
                return undefined;
            return value;
        },
        // i32 as int32; undefined - out of range, null - not an integer.
        i32: function (text) {
            var parsed = parseInteger(text);
            if (parsed === null)
                return null;
            var value = parsed.value;
            if (big.cmp(value, -2147483648) < 0 || big.cmp(value, TWO32 - 1) > 0)
                return undefined;
            return value | 0;
        },
        i64: function (text) {
            var parsed = parseInteger(text);
            if (parsed === null)
                return null;
            var value = parsed.value;
            if (big.cmp(value, big.neg(big.pow(2, 63))) < 0 || big.cmp(value, big.sub(big.pow(2, 64), 1)) > 0)
                return undefined;
            return T.bigToI64(value, true);
        }
    };

    // Exact rounding of num/den (positive T.big) to a number with precision
    // bits of mantissa and an exponent not below emin; ±Infinity if above
    // emax.
    function roundRatio(num, den, precision, emin, emax) {
        var order = big.bitLength(num) - big.bitLength(den);
        // 2^order <= num/den < 2^(order+1)
        if (big.cmp(order >= 0 ? num : big.shl(num, -order), order >= 0 ? big.shl(den, order) : den) < 0)
            --order;
        if (order > emax + 1)
            return Infinity;
        var ulp = Math.max(order, emin) - (precision - 1);
        var scaledNum = ulp < 0 ? big.shl(num, -ulp) : num;
        var scaledDen = ulp > 0 ? big.shl(den, ulp) : den;
        var quotient = big.quot(scaledNum, scaledDen);
        var remainder = big.rem(scaledNum, scaledDen);
        var twice = big.cmp(big.shl(remainder, 1), scaledDen);
        if (twice > 0 || (twice === 0 && big.toFloat(big.and(quotient, 1)) === 1))
            quotient = big.add(quotient, 1);
        var mantissa = big.toFloat(quotient);   // at most 2^precision: exact
        if (mantissa === 0)
            return 0;
        // Rounding may have carried a one into the next exponent.
        if ((mantissa >= Math.pow(2, precision) ? order + 1 : order) > emax)
            return Infinity;
        var result = mantissa;
        var exponent = ulp;
        while (exponent > 0) {
            var step = Math.min(exponent, 1000);
            result *= Math.pow(2, step);
            exponent -= step;
        }
        while (exponent < 0) {
            var down = Math.max(exponent, -1000);
            result *= Math.pow(2, down);
            exponent -= down;
        }
        return result;
    }

    var FORMATS = {
        f32: { p: 24, emin: -126, emax: 127, payloadBits: 23 },
        f64: { p: 53, emin: -1022, emax: 1023, payloadBits: 52 }
    };

    // A float from a token: { value, nan: null | 'canonical' | payload }.
    // undefined - out of range, null - not a number.
    numbers.float = function (text, kind) {
        var format = FORMATS[kind];
        var negative = text.charAt(0) === '-';
        var body = text.charAt(0) === '-' || text.charAt(0) === '+' ? text.substring(1) : text;
        if (body === 'inf')
            return { value: negative ? -Infinity : Infinity, nan: null };
        if (body === 'nan')
            return { value: NaN, nan: 'canonical', negative: negative };
        if (body.substring(0, 4) === 'nan:') {
            if (!/^nan:0x[0-9A-Fa-f](?:_?[0-9A-Fa-f])*$/.test(body))
                return null;
            var payload = big.parse(digitsOf(body.substring(6)), 16);
            if (big.sign(payload) === 0 || big.bitLength(payload) > format.payloadBits)
                return undefined;
            return { value: NaN, nan: big.toFloat(payload), negative: negative };
        }
        var num, den;
        var hex = /^0x([0-9A-Fa-f](?:_?[0-9A-Fa-f])*)(?:\.((?:[0-9A-Fa-f](?:_?[0-9A-Fa-f])*)?))?(?:[pP]([+-]?[0-9](?:_?[0-9])*))?$/.exec(body);
        var dec = hex === null ? /^([0-9](?:_?[0-9])*)(?:\.((?:[0-9](?:_?[0-9])*)?))?(?:[eE]([+-]?[0-9](?:_?[0-9])*))?$/.exec(body) : null;
        if (hex === null && dec === null)
            return null;
        var match = hex || dec;
        var whole = digitsOf(match[1]);
        var fraction = match[2] !== undefined ? digitsOf(match[2]) : '';
        var exponentText = match[3] !== undefined ? digitsOf(match[3]) : '0';
        var exponent = Number(exponentText);
        if (!isFinite(exponent) || Math.abs(exponent) > 1e9)
            exponent = exponentText.charAt(0) === '-' ? -1e9 : 1e9;
        var mantissa = big.parse((whole + fraction).replace(/^0+(?=.)/, ''), hex !== null ? 16 : 10);
        if (big.sign(mantissa) === 0)
            return { value: negative ? -0 : 0, nan: null };
        var value;
        if (hex !== null) {
            var shift = exponent - 4 * fraction.length;
            var digits = big.bitLength(mantissa);
            if (shift + digits > format.emax + 2)
                value = Infinity;
            else if (shift + digits < format.emin - format.p - 2)
                value = 0;
            else
                value = roundRatio(shift >= 0 ? big.shl(mantissa, shift) : mantissa, shift < 0 ? big.shl(1, -shift) : 1,
                                   format.p, format.emin, format.emax);
        } else {
            var power = exponent - fraction.length;
            var length = big.str(mantissa).length;
            if (power + length > 400)
                value = Infinity;
            else if (power + length < -400)
                value = 0;
            else if (kind === 'f64' && length <= 15 && Math.abs(power) <= 22)
                value = power >= 0 ? big.toFloat(mantissa) * Math.pow(10, power) : big.toFloat(mantissa) / Math.pow(10, -power);
            else
                value = roundRatio(power >= 0 ? big.mul(mantissa, big.pow(10, power)) : mantissa,
                                   power < 0 ? big.pow(10, -power) : 1, format.p, format.emin, format.emax);
        }
        if (value === Infinity)
            return undefined;
        return { value: negative ? -value : value, nan: null };
    };

    // --- Output

    var f32Buffer = new Float32Array(1);

    // The shortest notation of an f32 that reads back to the same value.
    numbers.formatF32 = function (value) {
        if (value !== value || value === Infinity || value === -Infinity || value === 0)
            return numbers.formatF64(value);
        for (var precision = 1; precision <= 9; ++precision) {
            var text = value.toPrecision(precision);
            f32Buffer[0] = Number(text);
            if (f32Buffer[0] === value)
                return numbers.formatF64(Number(text));
        }
        return numbers.formatF64(value);
    };

    numbers.formatF64 = function (value) {
        if (value !== value)
            return 'nan';
        if (value === Infinity)
            return 'inf';
        if (value === -Infinity)
            return '-inf';
        if (value === 0 && 1 / value < 0)
            return '-0';
        return String(value);
    };

    W.numbers = numbers;
})(globalThis);
