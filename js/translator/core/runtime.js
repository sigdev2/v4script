// The shared part of running the translated languages: integers of a
// given width, unbounded integers, UTF-8 strings as bytes, number output,
// language errors, fibers.
//
// Loaded with every translated language; a second time does nothing.
// Everything lives in the non-enumerable global V4ScriptTranslator. Design:
// docs/internals/translator.md.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    if (T === undefined) {
        T = {};
        Object.defineProperty(global, 'V4ScriptTranslator', { value: T, configurable: true, writable: true });
    }
    if (T.runtime)
        return;
    T.runtime = true;
    T.global = global;

    var TWO16 = 65536;
    var TWO32 = 4294967296;
    var MAX_SAFE = 9007199254740991;

    // --- 64-bit integers
    //
    // A value is a number while |x| <= 2^53 - 1, otherwise an Int64 (hi, lo
    // - int32). The representation is unique: equal values are either both
    // numbers or both objects. valueOf is NaN: adding an object gives NaN,
    // and the fast branch of the translated code goes to the slow one.

    function Int64(hi, lo) {
        this.hi = hi | 0;
        this.lo = lo | 0;
    }
    Int64.prototype.valueOf = function () { return NaN; };
    Int64.prototype.toString = function () { return i64.str(this); };

    function hiOf(value) {
        return typeof value === 'number' ? Math.floor(value / TWO32) | 0 : value.hi;
    }

    function loOf(value) {
        return typeof value === 'number' ? value | 0 : value.lo;
    }

    function makeSigned(hi, lo) {
        if (hi >= -2097152 && hi <= 2097151) {
            var value = hi * TWO32 + (lo >>> 0);
            if (value >= -MAX_SAFE)
                return value;
        }
        return new Int64(hi, lo);
    }

    function makeUnsigned(hi, lo) {
        if ((hi >>> 0) < 2097152)
            return (hi >>> 0) * TWO32 + (lo >>> 0);
        return new Int64(hi, lo);
    }

    // A pair (hi, lo) - the result of operations without allocations.
    var rh = 0, rl = 0;

    function pairAdd(ah, al, bh, bl) {
        var low = (al >>> 0) + (bl >>> 0);
        rh = (ah + bh + (low >= TWO32 ? 1 : 0)) | 0;
        rl = low | 0;
    }

    function pairNeg(high, low) {
        pairAdd(~high, ~low, 0, 1);
    }

    function pairMul(ah, al, bh, bl) {
        var a48 = ah >>> 16, a32 = ah & 0xFFFF, a16 = al >>> 16, a00 = al & 0xFFFF;
        var b48 = bh >>> 16, b32 = bh & 0xFFFF, b16 = bl >>> 16, b00 = bl & 0xFFFF;
        var c48 = 0, c32 = 0, c16 = 0, c00 = 0;
        c00 += a00 * b00;
        c16 += c00 >>> 16;
        c00 &= 0xFFFF;
        c16 += a16 * b00;
        c32 += c16 >>> 16;
        c16 &= 0xFFFF;
        c16 += a00 * b16;
        c32 += c16 >>> 16;
        c16 &= 0xFFFF;
        c32 += a32 * b00;
        c48 += c32 >>> 16;
        c32 &= 0xFFFF;
        c32 += a16 * b16;
        c48 += c32 >>> 16;
        c32 &= 0xFFFF;
        c32 += a00 * b32;
        c48 += c32 >>> 16;
        c32 &= 0xFFFF;
        c48 += a48 * b00 + a32 * b16 + a16 * b32 + a00 * b48;
        c48 &= 0xFFFF;
        rh = (c48 << 16) | c32;
        rl = (c16 << 16) | c00;
    }

    function unsignedLess(ah, al, bh, bl) {
        return (ah >>> 0) < (bh >>> 0) || ((ah >>> 0) === (bh >>> 0) && (al >>> 0) < (bl >>> 0));
    }

    // Unsigned 64 by 64 bit division; the quotient in rh/rl, the remainder in qh/ql.
    var qh = 0, ql = 0;

    function pairDivUnsigned(nh, nl, dh, dl) {
        var quotientHigh = 0, quotientLow = 0, remHigh = 0, remLow = 0;
        for (var bit = 63; bit >= 0; --bit) {
            remHigh = (remHigh << 1) | (remLow >>> 31);
            remLow = (remLow << 1) | (bit >= 32 ? (nh >>> (bit - 32)) & 1 : (nl >>> bit) & 1);
            if (!unsignedLess(remHigh, remLow, dh, dl)) {
                pairAdd(remHigh, remLow, ~dh, ~dl);
                pairAdd(rh, rl, 0, 1);
                remHigh = rh;
                remLow = rl;
                if (bit >= 32)
                    quotientHigh |= 1 << (bit - 32);
                else
                    quotientLow |= 1 << bit;
            }
        }
        rh = quotientHigh;
        rl = quotientLow;
        qh = remHigh;
        ql = remLow;
    }

    function pairShiftLeft(high, low, count) {
        count &= 63;
        if (count === 0) {
            rh = high; rl = low;
        } else if (count < 32) {
            rh = (high << count) | (low >>> (32 - count));
            rl = low << count;
        } else {
            rh = low << (count - 32);
            rl = 0;
        }
    }

    function pairShiftRight(high, low, count, arithmetic) {
        count &= 63;
        if (count === 0) {
            rh = high; rl = low;
        } else if (count < 32) {
            rl = (low >>> count) | (high << (32 - count));
            rh = arithmetic ? high >> count : high >>> count;
        } else {
            rl = arithmetic ? high >> (count - 32) : high >>> (count - 32);
            rh = arithmetic ? high >> 31 : 0;
        }
    }

    // Decimal (and any other) notation: division by a small number in
    // 16-bit digits - exact in double.
    function pairToString(high, low, radix, signed) {
        var negative = signed && high < 0;
        if (negative) {
            pairNeg(high, low);
            high = rh;
            low = rl;
        }
        var limbs = [high >>> 16, high & 0xFFFF, low >>> 16, low & 0xFFFF];
        var digits = '';
        var chunk = radix === 10 ? 10000 : radix * radix * radix;
        var chunkDigits = radix === 10 ? 4 : 3;
        for (;;) {
            var remainder = 0;
            var zero = true;
            for (var index = 0; index < 4; ++index) {
                var current = remainder * TWO16 + limbs[index];
                limbs[index] = Math.floor(current / chunk);
                remainder = current % chunk;
                if (limbs[index] !== 0)
                    zero = false;
            }
            var part = remainder.toString(radix);
            if (zero) {
                digits = part + digits;
                break;
            }
            while (part.length < chunkDigits)
                part = '0' + part;
            digits = part + digits;
        }
        return (negative ? '-' : '') + digits;
    }

    var i64 = {
        Int64: Int64,
        MAX_SAFE: MAX_SAFE,
        is: function (value) { return value instanceof Int64; },
        make: makeSigned,
        add: function (left, right) {
            pairAdd(hiOf(left), loOf(left), hiOf(right), loOf(right));
            return makeSigned(rh, rl);
        },
        sub: function (left, right) {
            pairNeg(hiOf(right), loOf(right));
            pairAdd(hiOf(left), loOf(left), rh, rl);
            return makeSigned(rh, rl);
        },
        mul: function (left, right) {
            pairMul(hiOf(left), loOf(left), hiOf(right), loOf(right));
            return makeSigned(rh, rl);
        },
        neg: function (value) {
            pairNeg(hiOf(value), loOf(value));
            return makeSigned(rh, rl);
        },
        // Division dropping the fraction; the divisor is not zero.
        div: function (dividend, divisor) {
            return i64.divmod(dividend, divisor, false);
        },
        mod: function (dividend, divisor) {
            return i64.divmod(dividend, divisor, true);
        },
        divmod: function (dividend, divisor, wantRemainder) {
            var dividendHigh = hiOf(dividend), dividendLow = loOf(dividend);
            var divisorHigh = hiOf(divisor), divisorLow = loOf(divisor);
            var negativeDividend = dividendHigh < 0, negativeDivisor = divisorHigh < 0;
            if (negativeDividend) {
                pairNeg(dividendHigh, dividendLow);
                dividendHigh = rh; dividendLow = rl;
            }
            if (negativeDivisor) {
                pairNeg(divisorHigh, divisorLow);
                divisorHigh = rh; divisorLow = rl;
            }
            pairDivUnsigned(dividendHigh, dividendLow, divisorHigh, divisorLow);
            if (wantRemainder) {
                if (negativeDividend) {
                    pairNeg(qh, ql);
                    return makeSigned(rh, rl);
                }
                return makeSigned(qh, ql);
            }
            if (negativeDividend !== negativeDivisor)
                pairNeg(rh, rl);
            return makeSigned(rh, rl);
        },
        and: function (left, right) { return makeSigned(hiOf(left) & hiOf(right), loOf(left) & loOf(right)); },
        or: function (left, right) { return makeSigned(hiOf(left) | hiOf(right), loOf(left) | loOf(right)); },
        xor: function (left, right) { return makeSigned(hiOf(left) ^ hiOf(right), loOf(left) ^ loOf(right)); },
        andNot: function (left, right) { return makeSigned(hiOf(left) & ~hiOf(right), loOf(left) & ~loOf(right)); },
        not: function (value) { return makeSigned(~hiOf(value), ~loOf(value)); },
        // A shift by count >= 64 gives zero (or -1 to the right for a negative value).
        shl: function (value, count) {
            if (count >= 64)
                return 0;
            pairShiftLeft(hiOf(value), loOf(value), count);
            return makeSigned(rh, rl);
        },
        shr: function (value, count) {
            if (count >= 64)
                return hiOf(value) < 0 ? -1 : 0;
            pairShiftRight(hiOf(value), loOf(value), count, true);
            return makeSigned(rh, rl);
        },
        cmp: function (left, right) {
            if (typeof left === 'number' && typeof right === 'number')
                return left < right ? -1 : (left > right ? 1 : 0);
            var leftHigh = hiOf(left), rightHigh = hiOf(right);
            if (leftHigh !== rightHigh)
                return leftHigh < rightHigh ? -1 : 1;
            var leftLow = loOf(left) >>> 0, rightLow = loOf(right) >>> 0;
            return leftLow < rightLow ? -1 : (leftLow > rightLow ? 1 : 0);
        },
        eq: function (left, right) {
            return left === right ||
                (typeof left === 'object' && typeof right === 'object' && left.hi === right.hi && left.lo === right.lo);
        },
        lt: function (left, right) { return i64.cmp(left, right) < 0; },
        le: function (left, right) { return i64.cmp(left, right) <= 0; },
        gt: function (left, right) { return i64.cmp(left, right) > 0; },
        ge: function (left, right) { return i64.cmp(left, right) >= 0; },
        str: function (value, radix) {
            radix = radix || 10;
            if (typeof value === 'number')
                return value.toString(radix);
            return pairToString(value.hi, value.lo, radix, true);
        },
        // A key for dictionaries: a number or a string.
        key: function (value) {
            return typeof value === 'number' ? value : 'i64:' + value.hi + ':' + value.lo;
        },
        toFloat: function (value) {
            return typeof value === 'number' ? value : value.hi * TWO32 + (value.lo >>> 0);
        },
        // A float to an integer dropping the fraction; out of range and NaN
        // give the smallest value, as on x86.
        fromFloat: function (value) {
            if (value >= -MAX_SAFE && value <= MAX_SAFE)
                return Math.trunc(value);
            if (!(value > -9223372036854775808 && value < 9223372036854775808))
                return new Int64(-2147483648, 0);
            var high = Math.floor(value / TWO32);
            return makeSigned(high | 0, (value - high * TWO32) | 0);
        },
        // The low 32 bits, signed.
        low32: function (value) { return typeof value === 'number' ? value | 0 : value.lo; },
        // The unsigned value with the same bits.
        fromUnsigned: function (value) { return typeof value === 'number' ? value : makeSigned(value.hi, value.lo); },
        parse: function (text, radix) {
            return bigToI64(big.parse(text, radix || 10), true);
        }
    };

    var u64 = {
        make: makeUnsigned,
        add: function (left, right) {
            pairAdd(hiOf(left), loOf(left), hiOf(right), loOf(right));
            return makeUnsigned(rh, rl);
        },
        sub: function (left, right) {
            pairNeg(hiOf(right), loOf(right));
            pairAdd(hiOf(left), loOf(left), rh, rl);
            return makeUnsigned(rh, rl);
        },
        mul: function (left, right) {
            pairMul(hiOf(left), loOf(left), hiOf(right), loOf(right));
            return makeUnsigned(rh, rl);
        },
        neg: function (value) {
            pairNeg(hiOf(value), loOf(value));
            return makeUnsigned(rh, rl);
        },
        div: function (dividend, divisor) {
            pairDivUnsigned(hiOf(dividend), loOf(dividend), hiOf(divisor), loOf(divisor));
            return makeUnsigned(rh, rl);
        },
        mod: function (dividend, divisor) {
            pairDivUnsigned(hiOf(dividend), loOf(dividend), hiOf(divisor), loOf(divisor));
            return makeUnsigned(qh, ql);
        },
        and: function (left, right) { return makeUnsigned(hiOf(left) & hiOf(right), loOf(left) & loOf(right)); },
        or: function (left, right) { return makeUnsigned(hiOf(left) | hiOf(right), loOf(left) | loOf(right)); },
        xor: function (left, right) { return makeUnsigned(hiOf(left) ^ hiOf(right), loOf(left) ^ loOf(right)); },
        andNot: function (left, right) { return makeUnsigned(hiOf(left) & ~hiOf(right), loOf(left) & ~loOf(right)); },
        not: function (value) { return makeUnsigned(~hiOf(value), ~loOf(value)); },
        shl: function (value, count) {
            if (count >= 64)
                return 0;
            pairShiftLeft(hiOf(value), loOf(value), count);
            return makeUnsigned(rh, rl);
        },
        shr: function (value, count) {
            if (count >= 64)
                return 0;
            pairShiftRight(hiOf(value), loOf(value), count, false);
            return makeUnsigned(rh, rl);
        },
        cmp: function (left, right) {
            if (typeof left === 'number' && typeof right === 'number')
                return left < right ? -1 : (left > right ? 1 : 0);
            var leftHigh = hiOf(left) >>> 0, rightHigh = hiOf(right) >>> 0;
            if (leftHigh !== rightHigh)
                return leftHigh < rightHigh ? -1 : 1;
            var leftLow = loOf(left) >>> 0, rightLow = loOf(right) >>> 0;
            return leftLow < rightLow ? -1 : (leftLow > rightLow ? 1 : 0);
        },
        eq: i64.eq,
        lt: function (left, right) { return u64.cmp(left, right) < 0; },
        le: function (left, right) { return u64.cmp(left, right) <= 0; },
        gt: function (left, right) { return u64.cmp(left, right) > 0; },
        ge: function (left, right) { return u64.cmp(left, right) >= 0; },
        str: function (value, radix) {
            radix = radix || 10;
            if (typeof value === 'number')
                return value.toString(radix);
            return pairToString(value.hi, value.lo, radix, false);
        },
        key: i64.key,
        toFloat: function (value) {
            return typeof value === 'number' ? value : (value.hi >>> 0) * TWO32 + (value.lo >>> 0);
        },
        fromFloat: function (value) {
            if (value >= 0 && value <= MAX_SAFE)
                return Math.trunc(value);
            if (!(value >= 0 && value < 18446744073709551616))
                return value < 0 && value > -MAX_SAFE ? u64.fromSigned(Math.trunc(value)) : new Int64(-2147483648, 0);
            var high = Math.floor(value / TWO32);
            return makeUnsigned(high | 0, (value - high * TWO32) | 0);
        },
        fromSigned: function (value) { return makeUnsigned(hiOf(value), loOf(value)); },
        parse: function (text, radix) {
            return bigToI64(big.parse(text, radix || 10), false);
        }
    };

    T.i64 = i64;
    T.u64 = u64;

    // --- Unbounded integers
    //
    // A hybrid too: a number while |x| <= 2^53 - 1, otherwise a Big (a sign
    // and digits of 2^24 from the lowest). Go constants and the integers of
    // Haskell, Erlang and Scheme need them.

    var BASE = 16777216;   // 2^24: the product of two digits is exact in double

    function Big(sign, limbs) {
        this.sign = sign;      // 1 or -1
        this.limbs = limbs;    // without leading zeros, not empty
    }
    Big.prototype.valueOf = function () { return NaN; };
    Big.prototype.toString = function () { return big.str(this); };

    function trim(limbs) {
        var length = limbs.length;
        while (length > 1 && limbs[length - 1] === 0)
            --length;
        limbs.length = length;
        return limbs;
    }

    function limbsOf(value) {
        if (typeof value !== 'number')
            return value.limbs;
        value = Math.abs(value);
        var limbs = [];
        do {
            limbs.push(value % BASE);
            value = Math.floor(value / BASE);
        } while (value > 0);
        return limbs;
    }

    function signOf(value) {
        return typeof value === 'number' ? (value < 0 ? -1 : 1) : value.sign;
    }

    function fromLimbs(sign, limbs) {
        trim(limbs);
        if (limbs.length <= 3) {
            var value = 0;
            for (var index = limbs.length - 1; index >= 0; --index)
                value = value * BASE + limbs[index];
            if (value <= MAX_SAFE)
                return sign < 0 ? -value : value;
        }
        return new Big(sign, limbs);
    }

    function compareLimbs(left, right) {
        if (left.length !== right.length)
            return left.length < right.length ? -1 : 1;
        for (var index = left.length - 1; index >= 0; --index) {
            if (left[index] !== right[index])
                return left[index] < right[index] ? -1 : 1;
        }
        return 0;
    }

    function addLimbs(left, right) {
        var result = [];
        var carry = 0;
        for (var index = 0; index < Math.max(left.length, right.length); ++index) {
            var sum = (left[index] || 0) + (right[index] || 0) + carry;
            result.push(sum % BASE);
            carry = sum >= BASE ? 1 : 0;
        }
        if (carry)
            result.push(carry);
        return result;
    }

    // left >= right
    function subLimbs(left, right) {
        var result = [];
        var borrow = 0;
        for (var index = 0; index < left.length; ++index) {
            var difference = left[index] - (right[index] || 0) - borrow;
            borrow = difference < 0 ? 1 : 0;
            result.push(difference < 0 ? difference + BASE : difference);
        }
        return trim(result);
    }

    function mulLimbs(left, right) {
        var result = [];
        for (var index = 0; index < left.length + right.length; ++index)
            result.push(0);
        for (var leftIndex = 0; leftIndex < left.length; ++leftIndex) {
            var carry = 0;
            var leftLimb = left[leftIndex];
            if (leftLimb === 0)
                continue;
            for (var rightIndex = 0; rightIndex < right.length; ++rightIndex) {
                var current = result[leftIndex + rightIndex] + leftLimb * right[rightIndex] + carry;
                carry = Math.floor(current / BASE);
                result[leftIndex + rightIndex] = current - carry * BASE;
            }
            var position = leftIndex + right.length;
            while (carry > 0) {
                var value = result[position] + carry;
                carry = Math.floor(value / BASE);
                result[position] = value - carry * BASE;
                ++position;
            }
        }
        return trim(result);
    }

    function divSmall(limbs, divisor) {
        var result = [];
        var remainder = 0;
        for (var index = limbs.length - 1; index >= 0; --index) {
            var current = remainder * BASE + limbs[index];
            result[index] = Math.floor(current / divisor);
            remainder = current - result[index] * divisor;
        }
        return { quotient: trim(result), remainder: remainder };
    }

    function shiftLimbsLeft(limbs, bits) {
        var whole = Math.floor(bits / 24), part = bits % 24;
        var result = [];
        for (var index = 0; index < whole; ++index)
            result.push(0);
        var carry = 0;
        for (var limbIndex = 0; limbIndex < limbs.length; ++limbIndex) {
            var value = limbs[limbIndex] * Math.pow(2, part) + carry;
            carry = Math.floor(value / BASE);
            result.push(value - carry * BASE);
        }
        if (carry)
            result.push(carry);
        return trim(result);
    }

    function shiftLimbsRight(limbs, bits) {
        var whole = Math.floor(bits / 24), part = bits % 24;
        if (whole >= limbs.length)
            return [0];
        var result = [];
        var divisor = Math.pow(2, part);
        for (var index = whole; index < limbs.length; ++index) {
            var low = Math.floor(limbs[index] / divisor);
            var high = index + 1 < limbs.length ? (limbs[index + 1] % divisor) * (BASE / divisor) : 0;
            result.push(low + high);
        }
        return trim(result);
    }

    function bitLength(limbs) {
        var top = limbs[limbs.length - 1];
        var bits = 0;
        while (top > 0) {
            ++bits;
            top = Math.floor(top / 2);
        }
        return (limbs.length - 1) * 24 + bits;
    }

    // Long division bit by bit: slow but simple; milliseconds for numbers
    // of thousands of bits.
    function divLimbs(dividend, divisor) {
        if (compareLimbs(dividend, divisor) < 0)
            return { quotient: [0], remainder: dividend.slice() };
        if (divisor.length === 1) {
            var small = divSmall(dividend, divisor[0]);
            return { quotient: small.quotient, remainder: [small.remainder] };
        }
        var shift = bitLength(dividend) - bitLength(divisor);
        var shifted = shiftLimbsLeft(divisor, shift);
        var remainder = dividend.slice();
        var quotient = [0];
        for (var bit = shift; bit >= 0; --bit) {
            if (compareLimbs(remainder, shifted) >= 0) {
                remainder = subLimbs(remainder, shifted);
                quotient = addLimbs(quotient, shiftLimbsLeft([1], bit));
            }
            shifted = shiftLimbsRight(shifted, 1);
        }
        return { quotient: trim(quotient), remainder: trim(remainder) };
    }

    function isZeroLimbs(limbs) {
        return limbs.length === 1 && limbs[0] === 0;
    }

    // Two's complement of count digits (for bitwise operations).
    function toTwos(value, count) {
        var limbs = limbsOf(value).slice();
        while (limbs.length < count)
            limbs.push(0);
        if (signOf(value) < 0 && !isZeroLimbs(limbsOf(value))) {
            for (var index = 0; index < count; ++index)
                limbs[index] = BASE - 1 - limbs[index];
            for (var position = 0; position < count; ++position) {
                limbs[position] += 1;
                if (limbs[position] < BASE)
                    break;
                limbs[position] = 0;
            }
        }
        return limbs;
    }

    function fromTwos(limbs) {
        var negative = limbs[limbs.length - 1] >= BASE / 2;
        if (!negative)
            return fromLimbs(1, limbs);
        var magnitude = limbs.map(function (limb) { return BASE - 1 - limb; });
        for (var position = 0; position < magnitude.length; ++position) {
            magnitude[position] += 1;
            if (magnitude[position] < BASE)
                break;
            magnitude[position] = 0;
        }
        return fromLimbs(-1, magnitude);
    }

    function bitwise(left, right, operation) {
        var count = Math.max(limbsOf(left).length, limbsOf(right).length) + 1;
        var leftTwos = toTwos(left, count), rightTwos = toTwos(right, count);
        var result = [];
        for (var index = 0; index < count; ++index)
            result.push(operation(leftTwos[index], rightTwos[index]) & (BASE - 1));
        return fromTwos(result);
    }

    var big = {
        Big: Big,
        is: function (value) { return value instanceof Big; },
        add: function (left, right) {
            if (typeof left === 'number' && typeof right === 'number') {
                var sum = left + right;
                if (sum >= -MAX_SAFE && sum <= MAX_SAFE)
                    return sum;
            }
            var leftSign = signOf(left), rightSign = signOf(right);
            var leftLimbs = limbsOf(left), rightLimbs = limbsOf(right);
            if (leftSign === rightSign)
                return fromLimbs(leftSign, addLimbs(leftLimbs, rightLimbs));
            var order = compareLimbs(leftLimbs, rightLimbs);
            if (order === 0)
                return 0;
            return order > 0
                ? fromLimbs(leftSign, subLimbs(leftLimbs, rightLimbs))
                : fromLimbs(rightSign, subLimbs(rightLimbs, leftLimbs));
        },
        sub: function (left, right) {
            return big.add(left, big.neg(right));
        },
        neg: function (value) {
            if (typeof value === 'number')
                return value === 0 ? 0 : -value;
            return fromLimbs(-value.sign, value.limbs.slice());
        },
        mul: function (left, right) {
            if (typeof left === 'number' && typeof right === 'number') {
                var product = left * right;
                if (product >= -MAX_SAFE && product <= MAX_SAFE)
                    return product === 0 ? 0 : product;
            }
            var limbs = mulLimbs(limbsOf(left), limbsOf(right));
            return isZeroLimbs(limbs) ? 0 : fromLimbs(signOf(left) * signOf(right), limbs);
        },
        // Division dropping the fraction (as in C); the remainder has the
        // sign of the dividend. The divisor is not zero.
        quot: function (dividend, divisor) {
            if (typeof dividend === 'number' && typeof divisor === 'number')
                return Math.trunc(dividend / divisor) || 0;
            var result = divLimbs(limbsOf(dividend), limbsOf(divisor));
            return isZeroLimbs(result.quotient) ? 0 : fromLimbs(signOf(dividend) * signOf(divisor), result.quotient);
        },
        rem: function (dividend, divisor) {
            if (typeof dividend === 'number' && typeof divisor === 'number')
                return (dividend % divisor) || 0;
            var result = divLimbs(limbsOf(dividend), limbsOf(divisor));
            return isZeroLimbs(result.remainder) ? 0 : fromLimbs(signOf(dividend), result.remainder);
        },
        // Division rounding down (Haskell div, Python //); the remainder has
        // the sign of the divisor.
        div: function (dividend, divisor) {
            var quotient = big.quot(dividend, divisor);
            var remainder = big.rem(dividend, divisor);
            if (big.sign(remainder) !== 0 && big.sign(remainder) !== big.sign(divisor))
                quotient = big.sub(quotient, 1);
            return quotient;
        },
        mod: function (dividend, divisor) {
            var remainder = big.rem(dividend, divisor);
            if (big.sign(remainder) !== 0 && big.sign(remainder) !== big.sign(divisor))
                remainder = big.add(remainder, divisor);
            return remainder;
        },
        sign: function (value) {
            if (typeof value === 'number')
                return value > 0 ? 1 : (value < 0 ? -1 : 0);
            return value.sign;
        },
        cmp: function (left, right) {
            if (typeof left === 'number' && typeof right === 'number')
                return left < right ? -1 : (left > right ? 1 : 0);
            var leftSign = big.sign(left), rightSign = big.sign(right);
            if (leftSign !== rightSign)
                return leftSign < rightSign ? -1 : 1;
            var order = compareLimbs(limbsOf(left), limbsOf(right));
            return leftSign < 0 ? -order : order;
        },
        eq: function (left, right) {
            return left === right ||
                (typeof left === 'object' && typeof right === 'object' && big.cmp(left, right) === 0);
        },
        shl: function (value, count) {
            if (count === 0 || big.sign(value) === 0)
                return value;
            return fromLimbs(signOf(value), shiftLimbsLeft(limbsOf(value), count));
        },
        // A right shift rounding down (as >> in two's complement).
        shr: function (value, count) {
            if (count === 0)
                return value;
            if (big.sign(value) >= 0)
                return fromLimbs(1, shiftLimbsRight(limbsOf(value), count));
            return big.neg(big.add(fromLimbs(1, shiftLimbsRight(limbsOf(big.sub(big.neg(value), 1)), count)), 1));
        },
        and: function (left, right) { return bitwise(left, right,
            function (leftLimb, rightLimb) { return leftLimb & rightLimb; }); },
        or: function (left, right) { return bitwise(left, right,
            function (leftLimb, rightLimb) { return leftLimb | rightLimb; }); },
        xor: function (left, right) { return bitwise(left, right,
            function (leftLimb, rightLimb) { return leftLimb ^ rightLimb; }); },
        andNot: function (left, right) { return bitwise(left, right,
            function (leftLimb, rightLimb) { return leftLimb & ~rightLimb; }); },
        not: function (value) { return big.sub(big.neg(value), 1); },
        bitLength: function (value) {
            return bitLength(limbsOf(big.sign(value) < 0 ? big.sub(big.neg(value), 1) : value));
        },
        pow: function (base, exponent) {
            var result = 1;
            while (exponent > 0) {
                if (exponent % 2 === 1)
                    result = big.mul(result, base);
                base = big.mul(base, base);
                exponent = Math.floor(exponent / 2);
            }
            return result;
        },
        str: function (value, radix) {
            radix = radix || 10;
            if (typeof value === 'number')
                return value.toString(radix);
            var chunk = radix === 10 ? 10000000 : Math.pow(radix, radix <= 4 ? 10 : 4);
            var chunkDigits = Math.round(Math.log(chunk) / Math.log(radix));
            var limbs = value.limbs;
            var parts = [];
            while (!isZeroLimbs(limbs)) {
                var step = divSmall(limbs, chunk);
                parts.push(step.remainder);
                limbs = step.quotient;
            }
            var text = '';
            for (var index = parts.length - 1; index >= 0; --index) {
                var part = parts[index].toString(radix);
                if (index !== parts.length - 1) {
                    while (part.length < chunkDigits)
                        part = '0' + part;
                }
                text += part;
            }
            return (value.sign < 0 ? '-' : '') + (text || '0');
        },
        // Parses digits (without a sign and a prefix); null - wrong digits.
        parse: function (text, radix) {
            radix = radix || 10;
            var result = 0;
            var negative = false;
            if (text.charAt(0) === '-' || text.charAt(0) === '+') {
                negative = text.charAt(0) === '-';
                text = text.substring(1);
            }
            if (text.length === 0)
                return null;
            for (var index = 0; index < text.length; ++index) {
                var digit = parseInt(text.charAt(index), 36);
                if (!(digit < radix))
                    return null;
                result = big.add(big.mul(result, radix), digit);
            }
            return negative ? big.neg(result) : result;
        },
        // The exact integer of a double (an integer value).
        fromFloat: function (value) {
            value = Math.trunc(value);
            if (value >= -MAX_SAFE && value <= MAX_SAFE)
                return value || 0;
            var negative = value < 0;
            value = Math.abs(value);
            var limbs = [];
            while (value > 0) {
                var limb = value % BASE;
                limbs.push(limb);
                value = (value - limb) / BASE;
            }
            return fromLimbs(negative ? -1 : 1, limbs);
        },
        toFloat: function (integer) {
            if (typeof integer === 'number')
                return integer;
            var value = 0;
            for (var index = integer.limbs.length - 1; index >= 0; --index)
                value = value * BASE + integer.limbs[index];
            return integer.sign * value;
        }
    };
    T.big = big;

    // --- Exact fractions
    //
    // Rat - num/den, den > 0, in lowest terms; num and den are T.big
    // integers. The exact constants of Go (0.1 + 0.2 == 0.3) and the
    // fractions of Scheme need them.

    function Rat(num, den) {
        this.num = num;
        this.den = den;
    }

    function gcd(first, second) {
        first = big.sign(first) < 0 ? big.neg(first) : first;
        second = big.sign(second) < 0 ? big.neg(second) : second;
        while (big.sign(second) !== 0) {
            var remainder = big.rem(first, second);
            first = second;
            second = remainder;
        }
        return first;
    }

    function makeRat(num, den) {
        if (big.sign(den) === 0)
            throw new Error('division by zero');
        if (big.sign(den) < 0) {
            num = big.neg(num);
            den = big.neg(den);
        }
        var divisor = gcd(num, den);
        if (big.cmp(divisor, 1) !== 0) {
            num = big.quot(num, divisor);
            den = big.quot(den, divisor);
        }
        return new Rat(num, den);
    }

    var rat = {
        Rat: Rat,
        is: function (value) { return value instanceof Rat; },
        make: makeRat,
        fromInt: function (value) { return new Rat(value, 1); },
        // The exact value of a double.
        fromFloat: function (value) {
            if (!isFinite(value))
                throw new Error('not finite');
            if (Number.isInteger(value))
                return new Rat(big.fromFloat(value), 1);
            var den = 1;
            var scaled = value;
            while (!Number.isInteger(scaled)) {
                scaled *= 2;
                den = big.mul(den, 2);
            }
            return makeRat(big.fromFloat(scaled), den);
        },
        // "1.25e-3", "0x1.8p3" - exactly.
        parse: function (text) {
            text = text.replace(/_/g, '');
            var hex = /^([+-]?)0[xX]([0-9a-fA-F]*)(?:\.([0-9a-fA-F]*))?[pP]([+-]?\d+)$/.exec(text);
            if (hex !== null) {
                var digits = (hex[2] || '') + (hex[3] || '');
                var mantissa = big.parse(digits || '0', 16);
                var exponent = Number(hex[4]) - 4 * (hex[3] || '').length;
                var value = exponent >= 0 ? makeRat(big.shl(mantissa, exponent), 1) : makeRat(mantissa, big.pow(2, -exponent));
                return hex[1] === '-' ? rat.neg(value) : value;
            }
            var match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
            if (match === null)
                return null;
            var whole = (match[2] || '') + (match[3] || '');
            var scale = (match[3] || '').length - Number(match[4] || 0);
            var num = big.parse(whole || '0', 10);
            var result = scale >= 0 ? makeRat(num, big.pow(10, scale)) : makeRat(big.mul(num, big.pow(10, -scale)), 1);
            return match[1] === '-' ? rat.neg(result) : result;
        },
        add: function (left, right) {
            return makeRat(big.add(big.mul(left.num, right.den), big.mul(right.num, left.den)),
                           big.mul(left.den, right.den));
        },
        sub: function (left, right) {
            return makeRat(big.sub(big.mul(left.num, right.den), big.mul(right.num, left.den)),
                           big.mul(left.den, right.den));
        },
        mul: function (left, right) { return makeRat(big.mul(left.num, right.num), big.mul(left.den, right.den)); },
        div: function (left, right) { return makeRat(big.mul(left.num, right.den), big.mul(left.den, right.num)); },
        neg: function (value) { return new Rat(big.neg(value.num), value.den); },
        sign: function (value) { return big.sign(value.num); },
        cmp: function (left, right) { return big.cmp(big.mul(left.num, right.den), big.mul(right.num, left.den)); },
        isInteger: function (value) { return big.cmp(value.den, 1) === 0; },
        // The integer part (towards zero).
        trunc: function (value) { return big.quot(value.num, value.den); },
        // The nearest double (rounding to even).
        toFloat: function (fraction) {
            var sign = big.sign(fraction.num);
            if (sign === 0)
                return 0;
            var numerator = sign < 0 ? big.neg(fraction.num) : fraction.num;
            var denominator = fraction.den;
            // quotient = floor(numerator * 2^-exponent / denominator) with 56 bits.
            var exponent = big.bitLength(numerator) - big.bitLength(denominator) - 56;
            var quotient, remainder;
            for (var attempt = 0; attempt < 3; ++attempt) {
                var scaledNumerator = exponent < 0 ? big.shl(numerator, -exponent) : numerator;
                var scaledDenominator = exponent > 0 ? big.shl(denominator, exponent) : denominator;
                quotient = big.quot(scaledNumerator, scaledDenominator);
                remainder = big.rem(scaledNumerator, scaledDenominator);
                var bits = big.bitLength(quotient);
                if (bits === 56)
                    break;
                exponent += bits - 56;
            }
            var sticky = big.sign(remainder) !== 0;
            var low = big.toFloat(big.and(quotient, 7));
            var mantissa = big.toFloat(big.shr(quotient, 3));
            if (low > 4 || (low === 4 && (sticky || mantissa % 2 === 1)))
                mantissa += 1;
            var value = mantissa * Math.pow(2, exponent + 3);
            if (exponent + 3 < -1074 + 53 && !isFinite(1 / value))
                value = mantissa * Math.pow(2, (exponent + 3) / 2) * Math.pow(2, (exponent + 3) / 2);
            return sign < 0 ? -value : value;
        },
        str: function (value) {
            return big.cmp(value.den, 1) === 0 ? big.str(value.num) : big.str(value.num) + '/' + big.str(value.den);
        }
    };
    T.rat = rat;

    // An unbounded integer in 64 bits: the low 64 bits, signed or unsigned.
    function bigToI64(value, signed) {
        if (value === null)
            return null;
        var limbs = toTwos(value, 3);
        var low = limbs[0] + (limbs[1] & 0xFF) * BASE;
        var high = (limbs[1] >>> 8) + limbs[2] * 65536;
        return signed ? makeSigned(high | 0, low | 0) : makeUnsigned(high | 0, low | 0);
    }
    T.bigToI64 = bigToI64;

    T.i64ToBig = function (value, signed) {
        if (typeof value === 'number')
            return value;
        var hi = signed ? value.hi : value.hi >>> 0;
        return big.add(big.mul(hi, TWO32), value.lo >>> 0);
    };

    // --- UTF-8 strings as bytes
    //
    // Go, Rust, Nim, Zig and C treat a string as UTF-8 bytes. Such a string
    // is kept in a JavaScript string where every character is a byte
    // (0..255): length, index and slice work on bytes. It is converted when
    // it goes out (output, JavaScript).

    var utf8 = {
        encode: function (text) {
            text = String(text);
            if (!/[^\x00-\x7f]/.test(text))
                return text;
            var bytes = [];
            for (var index = 0; index < text.length; ++index) {
                var code = text.charCodeAt(index);
                if (code >= 0xD800 && code <= 0xDBFF && index + 1 < text.length) {
                    var next = text.charCodeAt(index + 1);
                    if (next >= 0xDC00 && next <= 0xDFFF) {
                        code = 0x10000 + ((code - 0xD800) << 10) + (next - 0xDC00);
                        ++index;
                    }
                }
                utf8.appendRune(bytes, code);
            }
            return utf8.fromBytes(bytes);
        },
        appendRune: function (bytes, code) {
            if (code < 0 || code > 0x10FFFF || (code >= 0xD800 && code <= 0xDFFF))
                code = 0xFFFD;
            if (code < 0x80) {
                bytes.push(code);
            } else if (code < 0x800) {
                bytes.push(0xC0 | (code >> 6), 0x80 | (code & 63));
            } else if (code < 0x10000) {
                bytes.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
            } else {
                bytes.push(0xF0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63),
                           0x80 | (code & 63));
            }
        },
        encodeRune: function (code) {
            var bytes = [];
            utf8.appendRune(bytes, code);
            return utf8.fromBytes(bytes);
        },
        fromBytes: function (bytes) {
            var text = '';
            for (var start = 0; start < bytes.length; start += 4096)
                text += String.fromCharCode.apply(null, Array.prototype.slice.call(bytes, start, start + 4096));
            return text;
        },
        // The rune at the position index: [rune, length in bytes]; an
        // invalid sequence is U+FFFD of length 1.
        decodeRune: function (bytes, index) {
            var first = bytes.charCodeAt(index);
            if (first < 0x80)
                return [first, 1];
            var length = first >= 0xF0 ? 4 : (first >= 0xE0 ? 3 : (first >= 0xC0 ? 2 : 0));
            if (length === 0 || index + length > bytes.length || first > 0xF4)
                return [0xFFFD, 1];
            var code = first & (0xFF >> (length + 1));
            for (var offset = 1; offset < length; ++offset) {
                var next = bytes.charCodeAt(index + offset);
                if ((next & 0xC0) !== 0x80)
                    return [0xFFFD, 1];
                code = (code << 6) | (next & 63);
            }
            var minimum = length === 2 ? 0x80 : (length === 3 ? 0x800 : 0x10000);
            if (code < minimum || code > 0x10FFFF || (code >= 0xD800 && code <= 0xDFFF))
                return [0xFFFD, 1];
            return [code, length];
        },
        decode: function (bytes) {
            if (!/[^\x00-\x7f]/.test(bytes))
                return bytes;
            var text = '';
            for (var index = 0; index < bytes.length;) {
                var rune = utf8.decodeRune(bytes, index);
                text += String.fromCodePoint(rune[0]);
                index += rune[1];
            }
            return text;
        },
        runeCount: function (bytes) {
            var count = 0;
            for (var index = 0; index < bytes.length; ++count)
                index += utf8.decodeRune(bytes, index)[1];
            return count;
        },
        isValid: function (bytes) {
            for (var index = 0; index < bytes.length;) {
                var rune = utf8.decodeRune(bytes, index);
                if (rune[0] === 0xFFFD && !(rune[1] === 3 && bytes.charCodeAt(index) === 0xEF))
                    return false;
                index += rune[1];
            }
            return true;
        }
    };
    T.utf8 = utf8;

    // --- Numbers as text
    //
    // Languages print floats differently (2.0, 2, 2.0E10, 1e+06), and
    // round exact halves to even or away from zero. Here is the shared
    // base: the shortest digits and digits with a given precision.

    var numbers = {
        // The shortest digits that restore the number: { digits, exponent }
        // - value = 0.d1d2... * 10^exponent; zero is '0' and 1.
        shortest: function (value) {
            value = Math.abs(value);
            if (value === 0)
                return { digits: '0', exponent: 1 };
            var text = value.toExponential();
            var marker = text.indexOf('e');
            var digits = text.substring(0, marker).replace('.', '');
            return { digits: digits, exponent: Number(text.substring(marker + 1)) + 1 };
        },
        // Digits with a precision: count significant digits (mode
        // 'significant') or count after the point ('fixed'). An exact half
        // goes to even (even = true) or away from zero.
        rounded: function (value, count, mode, even) {
            value = Math.abs(value);
            if (value === 0) {
                var zeros = mode === 'fixed' ? count + 1 : Math.max(count, 1);
                return { digits: new Array(zeros + 1).join('0'), exponent: mode === 'fixed' ? 1 : 1 };
            }
            var exact = numbers.exactDigits(value);
            // The position of the last digit kept in exact.digits.
            var keep = mode === 'fixed' ? exact.exponent + count : Math.max(count, 1);
            var digits = exact.digits;
            var exponent = exact.exponent;
            if (keep < 0)
                return { digits: mode === 'fixed' ? new Array(count + 2).join('0') : '0', exponent: mode === 'fixed' ? 1 : exponent };
            if (keep >= digits.length) {
                while (digits.length < keep)
                    digits += '0';
                return { digits: digits, exponent: exponent };
            }
            var head = digits.substring(0, keep);
            var rest = digits.substring(keep);
            var up = false;
            if (rest.charAt(0) > '5') {
                up = true;
            } else if (rest.charAt(0) === '5') {
                var tie = /^50*$/.test(rest);
                if (!tie)
                    up = true;
                else if (even)
                    up = head.length > 0 && Number(head.charAt(head.length - 1)) % 2 === 1;
                else
                    up = true;
            }
            if (up) {
                var chars = (head.length === 0 ? '0' : head).split('');
                if (head.length === 0) {
                    chars = ['1'];
                    ++exponent;
                    head = '1';
                } else {
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
                    if (index < 0) {
                        head = '1' + head;
                        ++exponent;
                        if (mode !== 'fixed')
                            head = head.substring(0, head.length - 1);
                    }
                }
            }
            if (head.length === 0)
                head = '0';
            return { digits: head, exponent: exponent };
        },
        // The decimal digits of a double, exact up to 101 significant ones
        // (rounded after that - plenty for rounding decisions): value =
        // 0.digits * 10^exponent.
        exactDigits: function (value) {
            var text = value.toExponential(100);
            var marker = text.indexOf('e');
            var digits = text.substring(0, marker).replace('.', '').replace(/0+$/, '');
            return { digits: digits || '0', exponent: Number(text.substring(marker + 1)) + 1 };
        },
        // %f: count digits after the point.
        fixed: function (value, count, even) {
            if (!isFinite(value))
                return numbers.special(value);
            var negative = value < 0 || (value === 0 && 1 / value < 0);
            var result = numbers.rounded(value, count, 'fixed', even);
            var digits = result.digits;
            var exponent = result.exponent;
            var whole, fraction;
            if (exponent <= 0) {
                var padded = new Array(-exponent + 1).join('0') + digits;
                whole = '0';
                fraction = padded;
            } else {
                while (digits.length < exponent)
                    digits += '0';
                whole = digits.substring(0, exponent);
                fraction = digits.substring(exponent);
            }
            while (fraction.length < count)
                fraction += '0';
            fraction = fraction.substring(0, count);
            whole = whole.replace(/^0+(?=\d)/, '');
            return (negative ? '-' : '') + whole + (count > 0 ? '.' + fraction : '');
        },
        // %e: a mantissa with count digits after the point and an exponent;
        // the exponent has at least exponentDigits digits.
        exponential: function (value, count, even, exponentDigits, upper) {
            if (!isFinite(value))
                return numbers.special(value);
            var negative = value < 0 || (value === 0 && 1 / value < 0);
            var result = value === 0 ? { digits: new Array(count + 2).join('0'), exponent: 1 }
                                 : numbers.rounded(value, count + 1, 'significant', even);
            var digits = result.digits;
            while (digits.length < count + 1)
                digits += '0';
            var exponent = value === 0 ? 0 : result.exponent - 1;
            var power = String(Math.abs(exponent));
            while (power.length < (exponentDigits === undefined ? 2 : exponentDigits))
                power = '0' + power;
            return (negative ? '-' : '') + digits.charAt(0) + (count > 0 ? '.' + digits.substring(1, count + 1) : '') +
                (upper ? 'E' : 'e') + (exponent < 0 ? '-' : '+') + power;
        },
        special: function (value) {
            return value !== value ? 'NaN' : (value > 0 ? '+Inf' : '-Inf');
        },
        // %g as in C: count significant digits, without trailing zeros (unless keepZeros).
        general: function (value, count, even, keepZeros, exponentDigits, upper) {
            if (!isFinite(value))
                return numbers.special(value);
            if (count === 0)
                count = 1;
            var exponent = value === 0 ? 0 : numbers.rounded(value, count, 'significant', even).exponent - 1;
            var text;
            if (exponent < -4 || exponent >= count) {
                text = numbers.exponential(value, count - 1, even, exponentDigits, upper);
                if (!keepZeros)
                    text = text.replace(/\.?0+([eE])/, '$1');
            } else {
                text = numbers.fixed(value, Math.max(0, count - 1 - exponent), even);
                if (!keepZeros && text.indexOf('.') >= 0)
                    text = text.replace(/\.?0+$/, '');
            }
            return text;
        }
    };
    T.numbers = numbers;

    // --- Language errors
    //
    // What the translated code and the run time throw (a Go panic, a Java
    // exception): with the place where it was thrown - the stack is needed
    // to find the line of the unit.

    function LanguageError(message, value) {
        this.message = message;
        this.value = value;
        this.stack = new Error(message).stack;
    }
    LanguageError.prototype.toString = function () { return this.message; };
    T.LanguageError = LanguageError;

    // A translation error (syntax, types): the line and the column in the source text.
    function CompileError(message, line, column, source) {
        this.message = message;
        this.line = line || 0;
        this.column = column || 0;
        this.source = source || '';
        if (T.debug)
            this.stack = new Error(message).stack;
    }
    CompileError.prototype.toString = function () { return this.message; };
    T.CompileError = CompileError;

    // --- Fibers
    //
    // Goroutines, Erlang processes, async: generator functions that pause
    // (yield) while they wait for a channel, a message or time. The
    // scheduler runs the ready ones in turn; when all of them wait for time,
    // it goes on by a timer of the unit environment (setTimeout), and the
    // run of the unit ends before the program does - as with JavaScript
    // timers.

    var GENERATOR = Object.getPrototypeOf(Object.getPrototypeOf((function* () {})()));

    T.isGenerator = function (value) {
        return value !== null && typeof value === 'object' && Object.getPrototypeOf(Object.getPrototypeOf(value)) === GENERATOR;
    };

    function Fiber(scheduler, generator, name) {
        this.scheduler = scheduler;
        this.generator = generator;
        this.name = name || '';
        this.done = false;
        this.result = undefined;
        this.waiting = false;
        this.wake = 0;
        // The value the fiber resumes with (received from a channel).
        this.resumeValue = undefined;
        this.onDone = null;
    }

    function Scheduler(options) {
        this.options = options || {};
        this.reset();
    }

    Scheduler.prototype.reset = function () {
        this.ready = [];
        this.sleeping = [];
        this.current = null;
        this.main = null;
        this.timer = null;
        this.generation = (this.generation || 0) + 1;
        this.running = false;
    };

    Scheduler.prototype.spawn = function (generator, name) {
        var fiber = new Fiber(this, generator, name);
        this.ready.push(fiber);
        return fiber;
    };

    // The current fiber pauses until ready(fiber); called before
    // yield.
    Scheduler.prototype.park = function () {
        var fiber = this.current;
        if (fiber === null)
            throw new LanguageError('cannot block outside of a fiber');
        fiber.waiting = true;
        return fiber;
    };

    Scheduler.prototype.wakeUp = function (fiber, value) {
        if (!fiber.waiting)
            return;
        fiber.waiting = false;
        fiber.resumeValue = value;
        this.ready.push(fiber);
    };

    Scheduler.prototype.sleep = function (milliseconds) {
        var fiber = this.park();
        fiber.wake = Date.now() + Math.max(0, milliseconds);
        // Ordered insertion into a new array: sort in V4 breaks an array that
        // shift has taken from (elements repeat, others vanish).
        var index = this.sleeping.length;
        while (index > 0 && this.sleeping[index - 1].wake > fiber.wake)
            --index;
        this.sleeping = this.sleeping.slice(0, index).concat([fiber], this.sleeping.slice(index));
        return fiber;
    };

    Scheduler.prototype.step = function (fiber) {
        var previous = this.current;
        this.current = fiber;
        try {
            var value = fiber.resumeValue;
            fiber.resumeValue = undefined;
            var state = fiber.generator.next(value);
            if (state.done) {
                fiber.done = true;
                fiber.result = state.value;
                if (fiber.onDone !== null)
                    fiber.onDone(fiber);
            } else if (!fiber.waiting) {
                // yield without a wait - let others run.
                this.ready.push(fiber);
            }
        } finally {
            this.current = previous;
        }
    };

    // Runs the ready fibers until until() returns true or all of them
    // wait. Returns true if until came true.
    Scheduler.prototype.runUntil = function (until) {
        for (;;) {
            if (until())
                return true;
            this.wakeSleepers(false);
            if (this.ready.length === 0)
                return false;
            this.step(this.ready.shift());
        }
    };

    Scheduler.prototype.wakeSleepers = function (force) {
        var now = Date.now();
        while (this.sleeping.length > 0 && (force || this.sleeping[0].wake <= now)) {
            var fiber = this.sleeping.shift();
            this.wakeUp(fiber, undefined);
            force = false;
        }
    };

    // A generator called from a plain function: runs at once, together with
    // other fibers, until it ends. Sleeping fibers wake up without a wait:
    // a plain function cannot yield to the event loop.
    Scheduler.prototype.runNested = function (generator) {
        var fiber = this.spawn(generator, 'nested');
        // The nested one goes first in the queue: it continues its caller.
        this.ready.pop();
        this.ready.unshift(fiber);
        var self = this;
        for (;;) {
            if (this.runUntil(function () { return fiber.done; }))
                return fiber.result;
            if (this.sleeping.length === 0)
                throw this.deadlock();
            var wait = this.sleeping[0].wake - Date.now();
            if (wait > 0) {
                var until = Date.now() + wait;
                while (Date.now() < until) {
                    // A busy wait: plain code cannot yield the thread. The
                    // watchdog interrupts one that is too long.
                }
            }
            self.wakeSleepers(true);
        }
    };

    Scheduler.prototype.deadlock = function () {
        return this.options.deadlock ? this.options.deadlock() : new LanguageError('all fibers are asleep - deadlock');
    };

    // The main fiber of the program: runs to the end or until all fibers
    // wait for time; then it goes on by a timer. onFinish(error) - when the
    // main one ended (at once or later).
    Scheduler.prototype.runMain = function (generator, schedule, onFinish) {
        var fiber = this.spawn(generator, 'main');
        this.main = fiber;
        var generation = this.generation;
        var self = this;
        function proceed() {
            if (self.generation !== generation)
                return 'stale';
            self.timer = null;
            self.runUntil(function () { return fiber.done; });
            if (fiber.done) {
                self.ready = [];
                self.sleeping = [];
                onFinish(null, fiber.result);
                return 'done';
            }
            if (self.sleeping.length === 0) {
                self.ready = [];
                throw self.deadlock();
            }
            var delay = Math.max(0, self.sleeping[0].wake - Date.now());
            self.timer = schedule(function () {
                try {
                    proceed();
                } catch (error) {
                    self.ready = [];
                    self.sleeping = [];
                    onFinish(error);
                }
            }, delay);
            return 'waiting';
        }
        return proceed();
    };

    T.Scheduler = Scheduler;
})(globalThis);
