// Scheme: the numeric tower - unbounded exact integers, exact fractions,
// inexact doubles, complex numbers; parsing and printing numbers.
//
// The representation (docs/internals/scheme.md):
//  - an exact integer is a JavaScript number with an integer value
//    (|x| <= 2^53 - 1) or a T.big.Big;
//  - an exact fraction is a T.rat.Rat (the denominator > 1);
//  - an inexact number is a JavaScript number with a fraction (and NaN,
//    ±Infinity) or a Flo if the value is an integer (2.0, -0.0): so 2 and
//    2.0 differ, and floats with a fraction need no object per operation;
//  - a complex number is a Cpx(re, im), the imaginary part is not an exact zero.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var S = T.scheme;
    if (S.N)
        return;

    var big = T.big;
    var rat = T.rat;
    var Big = big.Big;
    var Rat = rat.Rat;
    var MAX = 9007199254740991;

    function Flo(value) {
        this.v = value;
    }
    function Cpx(re, im) {
        this.re = re;
        this.im = im;
    }

    // An inexact number from a double.
    function flo(value) {
        return Number.isInteger(value) ? new Flo(value) : value;
    }

    // 0 - an exact integer, 1 - a fraction, 2 - inexact, 3 - complex, -1 - not a number.
    function kind(value) {
        if (typeof value === 'number')
            return Number.isInteger(value) ? 0 : 2;
        if (value instanceof Flo)
            return 2;
        if (value instanceof Big)
            return 0;
        if (value instanceof Rat)
            return 1;
        if (value instanceof Cpx)
            return 3;
        return -1;
    }

    function isNumber(value) {
        return typeof value === 'number' || value instanceof Flo || value instanceof Big || value instanceof Rat ||
            value instanceof Cpx;
    }
    function isExactInteger(value) {
        return (typeof value === 'number' && Number.isInteger(value)) || value instanceof Big;
    }
    function isExact(value) {
        var type = kind(value);
        if (type === 3)
            return isExact(value.re) && isExact(value.im);
        return type === 0 || type === 1;
    }
    function isFlonum(value) {
        return (typeof value === 'number' && !Number.isInteger(value)) || value instanceof Flo;
    }
    function isReal(value) {
        var type = kind(value);
        return type >= 0 && type <= 2;
    }

    // --- Errors

    function typeError(name, what, value) {
        return S.error(name + ': not ' + what, [value]);
    }
    function checkNumber(name, value) {
        if (!isNumber(value))
            throw typeError(name, 'a number', value);
        return value;
    }
    function checkReal(name, value) {
        if (!isReal(value))
            throw typeError(name, isNumber(value) ? 'a real number' : 'a number', value);
        return value;
    }
    function divideByZero(name) {
        return S.error(name + ': divide by zero', []);
    }

    // --- Conversions

    function fv(value) {
        if (typeof value === 'number')
            return value;
        if (value instanceof Flo)
            return value.v;
        if (value instanceof Big)
            return big.toFloat(value);
        if (value instanceof Rat)
            return rat.toFloat(value);
        return NaN;
    }

    function toRat(value) {
        return value instanceof Rat ? value : new Rat(value, 1);
    }

    function normRat(fraction) {
        return big.cmp(fraction.den, 1) === 0 ? fraction.num : fraction;
    }

    // The exact value of an inexact number.
    function exactOfFloat(value, name) {
        if (!isFinite(value))
            throw S.error((name || 'exact') + ': no exact representation', [flo(value)]);
        if (Number.isInteger(value))
            return big.fromFloat(value);
        return normRat(rat.fromFloat(value));
    }

    function exact(value) {
        switch (kind(value)) {
        case 0:
        case 1:
            return value;
        case 2:
            return exactOfFloat(fv(value));
        case 3:
            return makeRect(exact(value.re), exact(value.im));
        }
        throw typeError('exact', 'a number', value);
    }

    function inexact(value) {
        switch (kind(value)) {
        case 0:
        case 1:
            return flo(fv(value));
        case 2:
            return value;
        case 3:
            return makeRect(inexact(value.re), inexact(value.im));
        }
        throw typeError('inexact', 'a number', value);
    }

    function re(value) { return value instanceof Cpx ? value.re : value; }
    function im(value) { return value instanceof Cpx ? value.im : 0; }

    function isExactZero(value) {
        return value === 0;
    }

    function makeRect(real, imaginary) {
        if (isExactZero(imaginary))
            return real;
        return new Cpx(real, imaginary);
    }

    // --- Addition, subtraction, multiplication

    function add(left, right) {
        var leftKind = kind(left), rightKind = kind(right);
        if (leftKind < 0)
            throw typeError('+', 'a number', left);
        if (rightKind < 0)
            throw typeError('+', 'a number', right);
        switch (leftKind > rightKind ? leftKind : rightKind) {
        case 0:
            return big.add(left, right);
        case 1:
            return normRat(rat.add(toRat(left), toRat(right)));
        case 2:
            return flo(fv(left) + fv(right));
        }
        return makeRect(add(re(left), re(right)), add(im(left), im(right)));
    }

    function neg(value) {
        switch (kind(value)) {
        case 0:
            return big.neg(value);
        case 1:
            return rat.neg(value);
        case 2:
            return flo(-fv(value));
        case 3:
            return new Cpx(neg(value.re), neg(value.im));
        }
        throw typeError('-', 'a number', value);
    }

    function sub(left, right) {
        var leftKind = kind(left), rightKind = kind(right);
        if (leftKind < 0)
            throw typeError('-', 'a number', left);
        if (rightKind < 0)
            throw typeError('-', 'a number', right);
        switch (leftKind > rightKind ? leftKind : rightKind) {
        case 0:
            return big.sub(left, right);
        case 1:
            return normRat(rat.sub(toRat(left), toRat(right)));
        case 2:
            return flo(fv(left) - fv(right));
        }
        return makeRect(sub(re(left), re(right)), sub(im(left), im(right)));
    }

    function mul(left, right) {
        var leftKind = kind(left), rightKind = kind(right);
        if (leftKind < 0)
            throw typeError('*', 'a number', left);
        if (rightKind < 0)
            throw typeError('*', 'a number', right);
        switch (leftKind > rightKind ? leftKind : rightKind) {
        case 0: {
            var product = big.mul(left, right);
            return product === 0 ? 0 : product;
        }
        case 1:
            return normRat(rat.mul(toRat(left), toRat(right)));
        case 2:
            return flo(fv(left) * fv(right));
        }
        var leftReal = re(left), leftImaginary = im(left), rightReal = re(right), rightImaginary = im(right);
        return makeRect(sub(mul(leftReal, rightReal), mul(leftImaginary, rightImaginary)),
                        add(mul(leftReal, rightImaginary), mul(leftImaginary, rightReal)));
    }

    function div(left, right) {
        var leftKind = kind(left), rightKind = kind(right);
        if (leftKind < 0)
            throw typeError('/', 'a number', left);
        if (rightKind < 0)
            throw typeError('/', 'a number', right);
        if (isExactZero(right))
            throw divideByZero('/');
        switch (leftKind > rightKind ? leftKind : rightKind) {
        case 0:
            if (typeof left === 'number' && typeof right === 'number' && left % right === 0)
                return left / right || 0;
            return normRat(rat.make(left, right));
        case 1:
            return normRat(rat.div(toRat(left), toRat(right)));
        case 2:
            return flo(fv(left) / fv(right));
        }
        var leftReal = re(left), leftImaginary = im(left), rightReal = re(right), rightImaginary = im(right);
        var denominator = add(mul(rightReal, rightReal), mul(rightImaginary, rightImaginary));
        if (isExactZero(denominator))
            throw divideByZero('/');
        return makeRect(div(add(mul(leftReal, rightReal), mul(leftImaginary, rightImaginary)), denominator),
                        div(sub(mul(leftImaginary, rightReal), mul(leftReal, rightImaginary)), denominator));
    }

    // --- Comparisons

    // Comparison of reals: -1, 0, 1; NaN if there is a NaN.
    function cmp(left, right, name) {
        if (typeof left === 'number' && typeof right === 'number')
            return left < right ? -1 : (left > right ? 1 : (left === right ? 0 : NaN));
        var leftKind = kind(left), rightKind = kind(right);
        if (leftKind < 0 || leftKind > 2)
            throw typeError(name || '<', isNumber(left) ? 'a real number' : 'a number', left);
        if (rightKind < 0 || rightKind > 2)
            throw typeError(name || '<', isNumber(right) ? 'a real number' : 'a number', right);
        if (leftKind === 0 && rightKind === 0)
            return big.cmp(left, right);
        if (leftKind === 2 || rightKind === 2) {
            var leftFloat = fv(left), rightFloat = fv(right);
            if (leftFloat !== leftFloat || rightFloat !== rightFloat)
                return NaN;
            // An exact number with an inexact one compares exactly if the
            // inexact one is finite: otherwise 2^53 + 1 and 2^53 would be equal.
            if (leftKind === 2 && rightKind === 2)
                return leftFloat < rightFloat ? -1 : (leftFloat > rightFloat ? 1 : 0);
            if (!isFinite(leftFloat) || !isFinite(rightFloat))
                return leftFloat < rightFloat ? -1 : (leftFloat > rightFloat ? 1 : 0);
            return rat.cmp(toRat(leftKind === 2 ? exactOfFloat(leftFloat) : left),
                           toRat(rightKind === 2 ? exactOfFloat(rightFloat) : right));
        }
        return rat.cmp(toRat(left), toRat(right));
    }

    function numEq(left, right) {
        if (typeof left === 'number' && typeof right === 'number')
            return left === right;
        var leftKind = kind(left), rightKind = kind(right);
        if (leftKind < 0)
            throw typeError('=', 'a number', left);
        if (rightKind < 0)
            throw typeError('=', 'a number', right);
        if (leftKind === 3 || rightKind === 3)
            return cmp(re(left), re(right), '=') === 0 && cmp(im(left), im(right), '=') === 0;
        return cmp(left, right, '=') === 0;
    }

    function sign(value, name) {
        switch (kind(value)) {
        case 0:
            return big.sign(value);
        case 1:
            return rat.sign(value);
        case 2: {
            var floatValue = fv(value);
            return floatValue > 0 ? 1 : (floatValue < 0 ? -1 : (floatValue === 0 ? 0 : NaN));
        }
        }
        throw typeError(name || 'positive?', isNumber(value) ? 'a real number' : 'a number', value);
    }

    function isZero(value) {
        if (value === 0)
            return true;
        var type = kind(value);
        if (type === 3)
            return false;
        if (type < 0)
            throw typeError('zero?', 'a number', value);
        return sign(value) === 0;
    }

    // --- Integers (exact ones and inexact ones with an integer value)

    function isInteger(value) {
        var type = kind(value);
        if (type === 0)
            return true;
        if (type === 2) {
            var floatValue = fv(value);
            return Number.isInteger(floatValue);
        }
        return false;
    }
    function isRational(value) {
        var type = kind(value);
        if (type === 0 || type === 1)
            return true;
        return type === 2 && isFinite(fv(value));
    }

    function checkInteger(name, value) {
        if (!isInteger(value))
            throw typeError(name, 'an integer', value);
        return value;
    }

    // Integer division: mode - 'truncate' or 'floor'; part - 'q', 'r'.
    function intDiv(name, dividend, divisor, mode, part) {
        checkInteger(name, dividend);
        checkInteger(name, divisor);
        if (isZero(divisor))
            throw divideByZero(name);
        if (kind(dividend) === 0 && kind(divisor) === 0) {
            if (mode === 'truncate')
                return part === 'q' ? big.quot(dividend, divisor) : big.rem(dividend, divisor);
            return part === 'q' ? big.div(dividend, divisor) : big.mod(dividend, divisor);
        }
        var floatDividend = fv(dividend), floatDivisor = fv(divisor);
        var remainder = floatDividend % floatDivisor;
        if (mode === 'floor' && remainder !== 0 && (remainder < 0) !== (floatDivisor < 0))
            remainder += floatDivisor;
        if (part === 'r')
            return flo(remainder);
        return flo(Math.round((floatDividend - remainder) / floatDivisor));
    }

    function gcd2(first, second) {
        if (kind(first) === 0 && kind(second) === 0) {
            first = big.sign(first) < 0 ? big.neg(first) : first;
            second = big.sign(second) < 0 ? big.neg(second) : second;
            while (big.sign(second) !== 0) {
                var remainder = big.rem(first, second);
                first = second;
                second = remainder;
            }
            return first;
        }
        var firstFloat = Math.abs(fv(first)), secondFloat = Math.abs(fv(second));
        while (secondFloat !== 0) {
            var floatRemainder = firstFloat % secondFloat;
            firstFloat = secondFloat;
            secondFloat = floatRemainder;
        }
        return flo(firstFloat);
    }

    function abs(value) {
        if (sign(value, 'abs') < 0)
            return neg(value);
        if (value instanceof Flo && Object.is(value.v, -0))
            return new Flo(0);
        return value;
    }

    function roundEven(value) {
        if (!isFinite(value) || Number.isInteger(value))
            return value;
        var floor = Math.floor(value), diff = value - floor;
        var result = diff < 0.5 ? floor : (diff > 0.5 ? floor + 1 : (floor % 2 === 0 ? floor : floor + 1));
        return result === 0 && value < 0 ? -0 : result;
    }

    // floor, ceiling, round, truncate.
    function rounding(name, value) {
        switch (kind(value)) {
        case 0:
            return value;
        case 1: {
            var floor = big.div(value.num, value.den);
            if (name === 'floor')
                return floor;
            if (name === 'ceiling')
                return big.add(floor, 1);
            if (name === 'truncate')
                return big.sign(value.num) < 0 ? big.add(floor, 1) : floor;
            // round: to the nearest, a half to even.
            var twice = rat.cmp(rat.sub(value, new Rat(floor, 1)), new Rat(1, 2));
            if (twice < 0)
                return floor;
            if (twice > 0)
                return big.add(floor, 1);
            return big.sign(big.mod(floor, 2)) === 0 ? floor : big.add(floor, 1);
        }
        case 2: {
            var floatValue = fv(value);
            var result = name === 'floor' ? Math.floor(floatValue) : name === 'ceiling' ? Math.ceil(floatValue)
                : name === 'truncate' ? Math.trunc(floatValue) : roundEven(floatValue);
            return flo(result);
        }
        }
        throw typeError(name, isNumber(value) ? 'a real number' : 'a number', value);
    }

    function numerator(value) {
        switch (kind(value)) {
        case 0:
            return value;
        case 1:
            return value.num;
        case 2:
            return inexact(numerator(exact(value)));
        }
        throw typeError('numerator', 'a rational number', value);
    }
    function denominator(value) {
        switch (kind(value)) {
        case 0:
            return 1;
        case 1:
            return value.den;
        case 2:
            return inexact(denominator(exact(value)));
        }
        throw typeError('denominator', 'a rational number', value);
    }

    // The integer square root: the largest root with root*root <= value (value >= 0, exact).
    function isqrtExact(value) {
        var root;
        if (typeof value === 'number') {
            // Math.sqrt rounds: the root of k*k - 1 may become k.
            root = Math.floor(Math.sqrt(value));
        } else {
            root = big.shl(1, Math.ceil(big.bitLength(value) / 2));
            for (;;) {
                var next = big.shr(big.add(root, big.quot(value, root)), 1);
                if (big.cmp(next, root) >= 0)
                    break;
                root = next;
            }
        }
        while (big.cmp(big.mul(root, root), value) > 0)
            root = big.sub(root, 1);
        while (big.cmp(big.mul(big.add(root, 1), big.add(root, 1)), value) <= 0)
            root = big.add(root, 1);
        return root;
    }

    // --- Complex functions (the parts are doubles)

    function cpx(real, imaginary) {
        return makeRect(flo(real), imaginary === 0 && !Object.is(imaginary, -0) ? new Flo(0) : flo(imaginary));
    }
    function complexParts(value) {
        return [fv(re(value)), fv(im(value))];
    }
    function cexp(real, imaginary) {
        var modulus = Math.exp(real);
        return [modulus * Math.cos(imaginary), modulus * Math.sin(imaginary)];
    }
    function clog(real, imaginary) {
        return [Math.log(Math.hypot(real, imaginary)), Math.atan2(imaginary, real)];
    }
    function cmul(left, right) {
        return [left[0] * right[0] - left[1] * right[1], left[0] * right[1] + left[1] * right[0]];
    }
    function cdiv(left, right) {
        var divisor = right[0] * right[0] + right[1] * right[1];
        return [(left[0] * right[0] + left[1] * right[1]) / divisor,
                (left[1] * right[0] - left[0] * right[1]) / divisor];
    }
    function csqrt(real, imaginary) {
        if (imaginary === 0 && real >= 0)
            return [Math.sqrt(real), imaginary];
        var modulus = Math.sqrt(Math.hypot(real, imaginary));
        var halfAngle = Math.atan2(imaginary, real) / 2;
        return [modulus * Math.cos(halfAngle), modulus * Math.sin(halfAngle)];
    }
    function fromParts(parts) {
        return makeRect(flo(parts[0]), flo(parts[1]));
    }

    function sqrt(value) {
        switch (kind(value)) {
        case 0:
            if (big.sign(value) >= 0) {
                var root = isqrtExact(value);
                if (big.cmp(big.mul(root, root), value) === 0)
                    return root;
                return flo(Math.sqrt(fv(value)));
            }
            return makeRect(0, sqrt(big.neg(value)));
        case 1: {
            if (rat.sign(value) < 0)
                return makeRect(0, sqrt(rat.neg(value)));
            var sn = isqrtExact(value.num), sd = isqrtExact(value.den);
            if (big.cmp(big.mul(sn, sn), value.num) === 0 && big.cmp(big.mul(sd, sd), value.den) === 0)
                return normRat(rat.make(sn, sd));
            return flo(Math.sqrt(fv(value)));
        }
        case 2: {
            var floatValue = fv(value);
            if (floatValue < 0)
                return makeRect(0, flo(Math.sqrt(-floatValue)));
            return flo(Math.sqrt(floatValue));
        }
        case 3: {
            var parts = complexParts(value);
            return fromParts(csqrt(parts[0], parts[1]));
        }
        }
        throw typeError('sqrt', 'a number', value);
    }

    function exactIntegerSqrt(value) {
        if (!isExactInteger(value) || big.sign(value) < 0)
            throw typeError('exact-integer-sqrt', 'an exact nonnegative integer', value);
        var root = isqrtExact(value);
        return new S.Values([root, big.sub(value, big.mul(root, root))]);
    }

    function expt(base, exponent) {
        checkNumber('expt', base);
        checkNumber('expt', exponent);
        var exponentKind = kind(exponent);
        if (exponentKind === 0) {
            var baseKind = kind(base);
            if (baseKind === 0 || baseKind === 1 || (baseKind === 3 && isExact(base))) {
                var negative = big.sign(exponent) < 0;
                var remaining = negative ? big.neg(exponent) : exponent;
                if (negative && isZero(base))
                    throw divideByZero('expt');
                var result = 1, factor = base;
                if (typeof remaining !== 'number')
                    remaining = big.toFloat(remaining);
                if (baseKind === 0 && remaining > 1e7 && !(base === 1 || base === -1 || base === 0))
                    throw S.error('expt: exponent too large', [exponent]);
                while (remaining > 0) {
                    if (remaining % 2 === 1)
                        result = mul(result, factor);
                    remaining = Math.floor(remaining / 2);
                    if (remaining > 0)
                        factor = mul(factor, factor);
                }
                return negative ? div(1, result) : result;
            }
            if (baseKind === 2)
                return flo(Math.pow(fv(base), fv(exponent)));
        }
        if (isZero(base)) {
            if (isZero(exponent))
                return isExact(base) && isExact(exponent) ? 1 : new Flo(1);
            if (kind(exponent) !== 3 && sign(exponent) > 0)
                return isExact(base) ? 0 : new Flo(0);
        }
        if (kind(base) !== 3 && kind(exponent) !== 3 && (sign(base) >= 0 || isInteger(exponent)))
            return flo(Math.pow(fv(base), fv(exponent)));
        // exp(exponent * log base)
        var baseParts = complexParts(base), exponentParts = complexParts(exponent);
        var logBase = clog(baseParts[0], baseParts[1]);
        var product = cmul(exponentParts, logBase);
        return fromParts(cexp(product[0], product[1]));
    }

    function exp(value) {
        if (kind(value) === 3) {
            var parts = complexParts(value);
            return fromParts(cexp(parts[0], parts[1]));
        }
        return flo(Math.exp(fv(checkNumber('exp', value))));
    }

    function log(value, base) {
        if (base !== undefined)
            return div(log(value), log(base));
        checkNumber('log', value);
        if (kind(value) !== 3 && sign(value) >= 0)
            return flo(Math.log(fv(value)));
        var parts = complexParts(value);
        return fromParts(clog(parts[0], parts[1]));
    }

    function trig(name, value) {
        checkNumber(name, value);
        if (kind(value) !== 3) {
            var floatValue = fv(value);
            switch (name) {
            case 'sin': return flo(Math.sin(floatValue));
            case 'cos': return flo(Math.cos(floatValue));
            case 'tan': return flo(Math.tan(floatValue));
            case 'asin':
                if (floatValue >= -1 && floatValue <= 1)
                    return flo(Math.asin(floatValue));
                break;
            case 'acos':
                if (floatValue >= -1 && floatValue <= 1)
                    return flo(Math.acos(floatValue));
                break;
            case 'atan': return flo(Math.atan(floatValue));
            }
        }
        var parts = complexParts(value);
        var real = parts[0], imaginary = parts[1];
        var result;
        switch (name) {
        case 'sin':
            result = [Math.sin(real) * Math.cosh(imaginary), Math.cos(real) * Math.sinh(imaginary)];
            break;
        case 'cos':
            result = [Math.cos(real) * Math.cosh(imaginary), -Math.sin(real) * Math.sinh(imaginary)];
            break;
        case 'tan':
            result = cdiv([Math.sin(real) * Math.cosh(imaginary), Math.cos(real) * Math.sinh(imaginary)],
                          [Math.cos(real) * Math.cosh(imaginary), -Math.sin(real) * Math.sinh(imaginary)]);
            break;
        case 'asin': {
            // -i log(iz + sqrt(1 - z^2))
            var asinRoot = csqrt(1 - (real * real - imaginary * imaginary), -2 * real * imaginary);
            var asinLog = clog(-imaginary + asinRoot[0], real + asinRoot[1]);
            result = [asinLog[1], -asinLog[0]];
            break;
        }
        case 'acos': {
            var acosRoot = csqrt(1 - (real * real - imaginary * imaginary), -2 * real * imaginary);
            var acosLog = clog(-imaginary + acosRoot[0], real + acosRoot[1]);
            result = [Math.PI / 2 - acosLog[1], acosLog[0]];
            break;
        }
        default: {
            // atan: (i/2) (log(1 - iz) - log(1 + iz))
            var logPlus = clog(1 + imaginary, -real), logMinus = clog(1 - imaginary, real);
            var difference = [logPlus[0] - logMinus[0], logPlus[1] - logMinus[1]];
            result = [-difference[1] / 2, difference[0] / 2];
        }
        }
        return fromParts(result);
    }

    function atan2(y, x) {
        checkReal('atan', y);
        checkReal('atan', x);
        return flo(Math.atan2(fv(y), fv(x)));
    }

    function magnitude(value) {
        if (kind(value) === 3) {
            if (isExact(value)) {
                var squares = add(mul(value.re, value.re), mul(value.im, value.im));
                return sqrt(squares);
            }
            return flo(Math.hypot(fv(value.re), fv(value.im)));
        }
        return abs(checkReal('magnitude', value));
    }
    function angle(value) {
        if (kind(value) === 3)
            return flo(Math.atan2(fv(value.im), fv(value.re)));
        checkReal('angle', value);
        if (isExact(value))
            return sign(value) < 0 ? Math.PI : 0;
        return flo(Math.atan2(0, fv(value)));
    }
    function makePolar(modulus, argument) {
        checkReal('make-polar', modulus);
        checkReal('make-polar', argument);
        if (isExactZero(argument))
            return modulus;
        var modulusFloat = fv(modulus), argumentFloat = fv(argument);
        return makeRect(flo(modulusFloat * Math.cos(argumentFloat)), flo(modulusFloat * Math.sin(argumentFloat)));
    }

    // --- Printing

    // An inexact number as chibi prints it: %.15g, %.16g, %.17g - the first
    // that reads back to the same number; without a point and an exponent
    // it gets ".0".
    function floatString(value) {
        if (value !== value)
            return '+nan.0';
        if (value === Infinity)
            return '+inf.0';
        if (value === -Infinity)
            return '-inf.0';
        var text;
        for (var precision = 15; precision <= 17; ++precision) {
            text = T.numbers.general(value, precision, true, false, 2, false);
            if (Number(text) === value)
                break;
        }
        if (Object.is(value, -0))
            text = '-0';
        if (text.indexOf('.') < 0 && text.indexOf('e') < 0)
            text += '.0';
        return text;
    }

    function realString(value, radix) {
        if (typeof value === 'number') {
            if (Number.isInteger(value))
                return radix === 10 ? String(value) : value.toString(radix);
            return radix === 10 || !isFinite(value) ? floatString(value) : value.toString(radix);
        }
        if (value instanceof Flo)
            return radix === 10
                ? floatString(value.v)
                : (value.v.toString(radix) + (Number.isInteger(value.v) ? '.0' : ''));
        if (value instanceof Big)
            return big.str(value, radix);
        if (value instanceof Rat)
            return big.str(value.num, radix) + '/' + big.str(value.den, radix);
        return null;
    }

    function numberToString(value, radix) {
        radix = radix || 10;
        if (value instanceof Cpx) {
            var imText = realString(value.im, radix);
            var imag = fv(value.im);
            if (imText.charAt(0) !== '-' && imText.charAt(0) !== '+')
                imText = '+' + imText;
            if (imag !== imag)
                imText = '+nan.0';
            return realString(value.re, radix) + imText + 'i';
        }
        return realString(value, radix);
    }

    // --- Parsing

    var DIGITS = { 2: /^[01]+$/, 8: /^[0-7]+$/, 10: /^[0-9]+$/, 16: /^[0-9a-fA-F]+$/ };

    // An unsigned real (with a possible sign in sign): a number or null.
    function parseUreal(text, radix, exactness, negative) {
        var digits = DIGITS[radix];
        var value;
        var slash = text.indexOf('/');
        if (slash >= 0) {
            var numeratorText = text.substring(0, slash), denominatorText = text.substring(slash + 1);
            if (!digits.test(numeratorText) || !digits.test(denominatorText))
                return null;
            var den = big.parse(denominatorText, radix);
            if (big.sign(den) === 0) {
                if (exactness === 'i')
                    return flo(big.sign(big.parse(numeratorText, radix)) === 0
                        ? NaN
                        : (negative ? -Infinity : Infinity));
                return null;
            }
            value = normRat(rat.make(big.parse(numeratorText, radix), den));
            if (negative)
                value = neg(value);
            return exactness === 'i' ? inexact(value) : value;
        }
        if (digits.test(text)) {
            value = big.parse(text, radix);
            if (negative)
                value = big.neg(value);
            return exactness === 'i' ? inexact(value) : value;
        }
        if (radix !== 10 || !/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(text))
            return null;
        if (exactness === 'e') {
            var exactValue = normRat(rat.parse(text));
            return negative ? neg(exactValue) : exactValue;
        }
        var parsed = Number(text);
        return flo(negative ? -parsed : parsed);
    }

    function parseReal(text, radix, exactness) {
        if (text.length === 0)
            return null;
        var negative = false;
        var first = text.charAt(0);
        if (first === '+' || first === '-') {
            negative = first === '-';
            var rest = text.substring(1).toLowerCase();
            if (rest === 'inf.0')
                return exactness === 'e' ? null : flo(negative ? -Infinity : Infinity);
            if (rest === 'nan.0')
                return exactness === 'e' ? null : NaN;
            text = text.substring(1);
            if (text.length === 0)
                return null;
        }
        return parseUreal(text, radix, exactness, negative);
    }

    // The text of a number -> a number or null (string->number and reading).
    function parseNumber(text, radix) {
        radix = radix || 10;
        var exactness = null;
        var radixSet = false;
        while (text.charAt(0) === '#') {
            var prefix = text.charAt(1).toLowerCase();
            if (prefix === 'x' || prefix === 'o' || prefix === 'b' || prefix === 'd') {
                if (radixSet)
                    return null;
                radixSet = true;
                radix = { x: 16, o: 8, b: 2, d: 10 }[prefix];
            } else if (prefix === 'e' || prefix === 'i') {
                if (exactness !== null)
                    return null;
                exactness = prefix;
            } else {
                return null;
            }
            text = text.substring(2);
        }
        if (text.length === 0)
            return null;
        var last = text.charAt(text.length - 1);
        if (last === 'i' || last === 'I') {
            var body = text.substring(0, text.length - 1);
            if (body === '+' || body === '-')
                return makeRect(0, body === '+' ? 1 : -1);
            // The sign of the imaginary part: the last + or - not at the start and not after e.
            var split = -1;
            for (var index = body.length - 1; index > 0; --index) {
                var character = body.charAt(index);
                if ((character === '+' || character === '-') && !/[eE]/.test(body.charAt(index - 1)))  {
                    split = index;
                    break;
                }
                if ((character === '+' || character === '-') && radix === 16) {
                    split = index;
                    break;
                }
            }
            var realPart = split > 0 ? parseReal(body.substring(0, split), radix, exactness) : 0;
            var imagText = split > 0 ? body.substring(split) : body;
            if (imagText.charAt(0) !== '+' && imagText.charAt(0) !== '-')
                return null;
            var imagPart = imagText.length === 1 ? (imagText === '+' ? 1 : -1) : parseReal(imagText, radix, exactness);
            if (realPart === null || imagPart === null)
                return null;
            if (exactness === 'i') {
                realPart = inexact(realPart);
                imagPart = inexact(imagPart);
            }
            return makeRect(realPart, imagPart);
        }
        var at = text.indexOf('@');
        if (at > 0) {
            var magnitudeValue = parseReal(text.substring(0, at), radix, exactness);
            var angleValue = parseReal(text.substring(at + 1), radix, exactness);
            if (magnitudeValue === null || angleValue === null)
                return null;
            return makePolar(magnitudeValue, angleValue);
        }
        return parseReal(text, radix, exactness);
    }

    // --- eqv? for numbers

    function eqvNumbers(left, right) {
        var leftKind = kind(left), rightKind = kind(right);
        if (leftKind !== rightKind)
            return false;
        if (leftKind === 2) {
            var leftFloat = fv(left), rightFloat = fv(right);
            return Object.is(leftFloat, rightFloat);
        }
        if (leftKind === 3)
            return eqvNumbers(left.re, right.re) && eqvNumbers(left.im, right.im);
        return numEq(left, right);
    }

    // The key of a number for eqv?/equal? hash tables.
    function hashKey(value) {
        if (typeof value === 'number')
            return Number.isInteger(value) ? value : 'f' + value;
        if (value instanceof Flo)
            return 'f' + (Object.is(value.v, -0) ? '-0' : value.v);
        return 'n' + numberToString(value, 10);
    }

    S.Flo = Flo;
    S.Cpx = Cpx;
    S.N = {
        MAX: MAX,
        flo: flo,
        kind: kind,
        fv: fv,
        isNumber: isNumber,
        isExactInteger: isExactInteger,
        isExact: isExact,
        isFlonum: isFlonum,
        isReal: isReal,
        isInteger: isInteger,
        isRational: isRational,
        checkNumber: checkNumber,
        checkReal: checkReal,
        checkInteger: checkInteger,
        typeError: typeError,
        divideByZero: divideByZero,
        add: add,
        sub: sub,
        mul: mul,
        div: div,
        neg: neg,
        cmp: cmp,
        numEq: numEq,
        sign: sign,
        isZero: isZero,
        intDiv: intDiv,
        gcd: gcd2,
        abs: abs,
        rounding: rounding,
        roundEven: roundEven,
        numerator: numerator,
        denominator: denominator,
        exact: exact,
        inexact: inexact,
        sqrt: sqrt,
        isqrt: isqrtExact,
        exactIntegerSqrt: exactIntegerSqrt,
        expt: expt,
        exp: exp,
        log: log,
        trig: trig,
        atan2: atan2,
        makeRect: makeRect,
        makePolar: makePolar,
        realPart: function (value) { checkNumber('real-part', value); return re(value); },
        imagPart: function (value) { checkNumber('imag-part', value); return im(value); },
        magnitude: magnitude,
        angle: angle,
        numberToString: numberToString,
        floatString: floatString,
        parse: parseNumber,
        eqv: eqvNumbers,
        hashKey: hashKey,
        exactOfFloat: exactOfFloat
    };
})(globalThis);
