// C#: System.Decimal - a sign, a 96-bit integer and a scale 0..28, as
// .NET has it. The arithmetic is exact on T.big integers and rounds as
// .NET does: half to even when a result does not fit, the scale of a
// quotient as VarDecDiv chooses it (the natural scale, more digits for
// an inexact quotient, trailing zeros removed then). Used by the
// translator for constants and by the run time.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp = T.csharp || {};
    if (CS.decimal)
        return;

    var big = T.big;
    var MAX_SCALE = 28;
    var LIMIT = big.pow(2, 96);
    var POWERS = [1];
    for (var power = 1; power <= 60; ++power)
        POWERS.push(big.mul(POWERS[power - 1], 10));

    function pow10(count) {
        return count < POWERS.length ? POWERS[count] : big.pow(10, count);
    }

    // Immutable: negative, mantissa (a non-negative T.big integer), scale.
    function Decimal(negative, mantissa, scale) {
        this.n = negative;
        this.m = mantissa;
        this.s = scale;
    }
    Decimal.prototype.valueOf = function () { return NaN; };
    Decimal.prototype.toString = function () { return decimal.str(this); };

    // The error of a result that does not fit (the run time throws
    // System.OverflowException, the translator a compile error).
    function overflow() {
        if (decimal.onOverflow !== null)
            throw decimal.onOverflow();
        throw new RangeError('Value was either too large or too small for a Decimal.');
    }

    // value / 10^count rounded half to even (exact integers).
    function divRoundEven(value, count) {
        if (count === 0)
            return value;
        var divisor = pow10(count);
        var quotient = big.quot(value, divisor);
        var remainder = big.rem(value, divisor);
        var twice = big.mul(remainder, 2);
        var order = big.cmp(twice, divisor);
        if (order > 0 || (order === 0 && big.toFloat(big.rem(quotient, 2)) === 1))
            quotient = big.add(quotient, 1);
        return quotient;
    }

    // A result exact at a scale: the scale goes down (rounding half to
    // even) until the mantissa fits 96 bits and the scale is at most 28.
    function fit(negative, mantissa, scale) {
        if (scale > MAX_SCALE) {
            mantissa = divRoundEven(mantissa, scale - MAX_SCALE);
            scale = MAX_SCALE;
        }
        while (big.cmp(mantissa, LIMIT) >= 0) {
            if (scale === 0)
                overflow();
            // The smallest reduction that fits, rounding once.
            var reduce = 1;
            while (reduce < scale && big.cmp(divRoundEven(mantissa, reduce), LIMIT) >= 0)
                ++reduce;
            mantissa = divRoundEven(mantissa, reduce);
            scale -= reduce;
        }
        return new Decimal(negative, mantissa, scale);
    }

    function signed(value) {
        return value.n ? big.neg(value.m) : value.m;
    }

    function fromSigned(value, scale) {
        var negative = big.sign(value) < 0;
        return fit(negative, negative ? big.neg(value) : value, scale);
    }

    var decimal = {
        Decimal: Decimal,
        MAX_SCALE: MAX_SCALE,
        onOverflow: null,
        is: function (value) { return value instanceof Decimal; },

        make: function (negative, mantissa, scale) {
            return fit(negative, mantissa, scale);
        },

        // An integer (a number, an Int64 or a T.big value).
        fromInteger: function (value) {
            if (T.i64.is(value))
                value = T.i64ToBig(value, true);
            return fromSigned(value, 0);
        },

        fromUnsigned: function (value) {
            if (T.i64.is(value))
                value = T.i64ToBig(value, false);
            return fromSigned(value, 0);
        },

        // A double: 15 significant digits, as .NET converts.
        fromDouble: function (value, digits) {
            if (!isFinite(value))
                overflow();
            if (value === 0)
                return new Decimal(false, 0, 0);
            var text = Math.abs(value).toPrecision(digits || 15);
            var parsed = decimal.parse((value < 0 ? '-' : '') + text);
            if (parsed === null)
                overflow();
            return decimal.normalize(parsed);
        },

        // "-12.5", "1e3", ".5"; null if it does not fit.
        parse: function (text) {
            var match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
            if (match === null || (match[2] === '' && (match[3] === undefined || match[3] === '')))
                return null;
            var digits = (match[2] || '') + (match[3] || '');
            var scale = (match[3] || '').length - Number(match[4] || 0);
            var mantissa = big.parse(digits.replace(/^0+(?=\d)/, '') || '0', 10);
            var negative = match[1] === '-';
            if (scale < 0) {
                mantissa = big.mul(mantissa, pow10(-scale));
                scale = 0;
            }
            var previous = decimal.onOverflow;
            try {
                decimal.onOverflow = function () { return null; };
                return fit(negative, mantissa, scale);
            } catch (error) {
                if (error === null)
                    return null;
                throw error;
            } finally {
                decimal.onOverflow = previous;
            }
        },

        // Trailing zeros removed (1.500 -> 1.5).
        normalize: function (value) {
            var mantissa = value.m, scale = value.s;
            while (scale > 0 && big.sign(mantissa) !== 0 && big.sign(big.rem(mantissa, 10)) === 0) {
                mantissa = big.quot(mantissa, 10);
                --scale;
            }
            if (big.sign(mantissa) === 0)
                scale = 0;
            return new Decimal(value.n, mantissa, scale);
        },

        isZero: function (value) {
            return big.sign(value.m) === 0;
        },

        sign: function (value) {
            return big.sign(value.m) === 0 ? 0 : (value.n ? -1 : 1);
        },

        neg: function (value) {
            return new Decimal(!value.n, value.m, value.s);
        },

        add: function (left, right) {
            var scale = Math.max(left.s, right.s);
            var sum = big.add(big.mul(signed(left), pow10(scale - left.s)), big.mul(signed(right), pow10(scale - right.s)));
            return fromSigned(sum, scale);
        },

        sub: function (left, right) {
            return decimal.add(left, decimal.neg(right));
        },

        mul: function (left, right) {
            return fit(left.n !== right.n, big.mul(left.m, right.m), left.s + right.s);
        },

        div: function (left, right) {
            if (big.sign(right.m) === 0)
                throw decimal.onDivideByZero !== undefined ? decimal.onDivideByZero() : new RangeError('Attempted to divide by zero.');
            var negative = left.n !== right.n;
            var natural = left.s - right.s;
            // Exact at the natural scale: the result as it is.
            if (big.sign(big.rem(natural >= 0 ? left.m : big.mul(left.m, pow10(-natural)), right.m)) === 0) {
                var exact = big.quot(natural >= 0 ? left.m : big.mul(left.m, pow10(-natural)), right.m);
                return fit(negative, exact, Math.max(natural, 0));
            }
            // Inexact: as many digits as fit, rounded half to even, then the
            // trailing zeros go.
            var scale = Math.max(natural, 0);
            var best = null, bestScale = scale;
            for (var candidate = scale; candidate <= MAX_SCALE; ++candidate) {
                var shift = candidate - natural;
                var numerator = shift >= 0 ? big.mul(left.m, pow10(shift)) : left.m;
                var denominator = shift >= 0 ? right.m : big.mul(right.m, pow10(-shift));
                var quotient = big.quot(numerator, denominator);
                var remainder = big.rem(numerator, denominator);
                var twice = big.mul(remainder, 2);
                var order = big.cmp(twice, denominator);
                if (order > 0 || (order === 0 && big.toFloat(big.rem(quotient, 2)) === 1))
                    quotient = big.add(quotient, 1);
                if (big.cmp(quotient, LIMIT) >= 0)
                    break;
                best = quotient;
                bestScale = candidate;
                if (big.sign(remainder) === 0)
                    break;
            }
            if (best === null)
                overflow();
            return decimal.normalize(new Decimal(negative, best, bestScale));
        },

        // The remainder with the sign of the dividend; the scale is the
        // larger one.
        rem: function (left, right) {
            if (big.sign(right.m) === 0)
                throw decimal.onDivideByZero !== undefined ? decimal.onDivideByZero() : new RangeError('Attempted to divide by zero.');
            var scale = Math.max(left.s, right.s);
            var dividend = big.mul(left.m, pow10(scale - left.s));
            var divisor = big.mul(right.m, pow10(scale - right.s));
            return fit(left.n, big.rem(dividend, divisor), scale);
        },

        cmp: function (left, right) {
            var scale = Math.max(left.s, right.s);
            return big.cmp(big.mul(signed(left), pow10(scale - left.s)), big.mul(signed(right), pow10(scale - right.s)));
        },

        eq: function (left, right) {
            return decimal.cmp(left, right) === 0;
        },

        // Rounding to a number of decimals: even (ToEven), away
        // (AwayFromZero), zero (ToZero), floor, ceiling.
        round: function (value, decimals, mode) {
            if (value.s <= decimals)
                return value;
            var divisor = pow10(value.s - decimals);
            var quotient = big.quot(value.m, divisor);
            var remainder = big.rem(value.m, divisor);
            var up = false;
            if (big.sign(remainder) !== 0) {
                var order = big.cmp(big.mul(remainder, 2), divisor);
                switch (mode) {
                case 'away':
                    up = order >= 0;
                    break;
                case 'zero':
                    up = false;
                    break;
                case 'floor':
                    up = value.n;
                    break;
                case 'ceiling':
                    up = !value.n;
                    break;
                default:
                    up = order > 0 || (order === 0 && big.toFloat(big.rem(quotient, 2)) === 1);
                }
            }
            if (up)
                quotient = big.add(quotient, 1);
            return new Decimal(value.n, quotient, decimals);
        },

        // The integer part (towards zero) as a T.big integer.
        truncate: function (value) {
            var whole = big.quot(value.m, pow10(value.s));
            return value.n ? big.neg(whole) : whole;
        },

        toNumber: function (value) {
            return Number(decimal.str(value));
        },

        // Invariant text: digits, the point by the scale, no sign for zero.
        str: function (value) {
            var digits = big.str(value.m);
            if (value.s > 0) {
                while (digits.length <= value.s)
                    digits = '0' + digits;
                digits = digits.substring(0, digits.length - value.s) + '.' + digits.substring(digits.length - value.s);
            }
            return (value.n && big.sign(value.m) !== 0 ? '-' : '') + digits;
        },

        hash: function (value) {
            var normal = decimal.normalize(value);
            var number = decimal.toNumber(normal);
            var text = String(number);
            var hash = 0;
            for (var index = 0; index < text.length; ++index)
                hash = (Math.imul(hash, 31) + text.charCodeAt(index)) | 0;
            return hash;
        },

        ZERO: new Decimal(false, 0, 0),
        ONE: new Decimal(false, 1, 0),
        MAX: new Decimal(false, big.sub(LIMIT, 1), 0)
    };

    CS.decimal = decimal;
})(globalThis);
