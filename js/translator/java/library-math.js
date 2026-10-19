// Java: java.math - BigInteger (natives over T.big) and BigDecimal (in
// Java: an unscaled integer and a scale), RoundingMode, MathContext.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Java = T.java;
    if (Java.library.units['java.math'])
        return;

    var big = T.big;

    Java.addLibrary('java.math', 'java.math', String.raw`
public class BigInteger extends Number implements Comparable<BigInteger> {
    public static final BigInteger ZERO = valueOf(0);
    public static final BigInteger ONE = valueOf(1);
    public static final BigInteger TWO = valueOf(2);
    public static final BigInteger TEN = valueOf(10);
    public native BigInteger(String value);
    public native BigInteger(String value, int radix);
    public static native BigInteger valueOf(long value);
    public native BigInteger add(BigInteger other);
    public native BigInteger subtract(BigInteger other);
    public native BigInteger multiply(BigInteger other);
    public native BigInteger divide(BigInteger other);
    public native BigInteger remainder(BigInteger other);
    public native BigInteger mod(BigInteger modulus);
    public BigInteger[] divideAndRemainder(BigInteger other) { return new BigInteger[] { divide(other), remainder(other) }; }
    public native BigInteger pow(int exponent);
    public native BigInteger modPow(BigInteger exponent, BigInteger modulus);
    public native BigInteger modInverse(BigInteger modulus);
    public native BigInteger gcd(BigInteger other);
    public native BigInteger sqrt();
    public native BigInteger negate();
    public native BigInteger abs();
    public native int signum();
    public BigInteger min(BigInteger other) { return compareTo(other) <= 0 ? this : other; }
    public BigInteger max(BigInteger other) { return compareTo(other) >= 0 ? this : other; }
    public native BigInteger shiftLeft(int n);
    public native BigInteger shiftRight(int n);
    public native BigInteger and(BigInteger other);
    public native BigInteger or(BigInteger other);
    public native BigInteger xor(BigInteger other);
    public native BigInteger andNot(BigInteger other);
    public native BigInteger not();
    public native boolean testBit(int n);
    public BigInteger setBit(int n) { return or(ONE.shiftLeft(n)); }
    public BigInteger clearBit(int n) { return andNot(ONE.shiftLeft(n)); }
    public BigInteger flipBit(int n) { return xor(ONE.shiftLeft(n)); }
    public native int bitLength();
    public native int bitCount();
    public native int getLowestSetBit();
    public native boolean isProbablePrime(int certainty);
    public BigInteger nextProbablePrime() {
        if (signum() < 0)
            throw new ArithmeticException("start < 0: " + this);
        BigInteger candidate = add(ONE);
        if (candidate.compareTo(TWO) <= 0)
            return TWO;
        if (!candidate.testBit(0))
            candidate = candidate.add(ONE);
        while (!candidate.isProbablePrime(100))
            candidate = candidate.add(TWO);
        return candidate;
    }
    public native int compareTo(BigInteger other);
    public native boolean equals(Object other);
    public native int hashCode();
    public native String toString();
    public native String toString(int radix);
    public native int intValue();
    public native long longValue();
    public native double doubleValue();
    public int intValueExact() {
        if (bitLength() > 31)
            throw new ArithmeticException("BigInteger out of int range");
        return intValue();
    }
    public long longValueExact() {
        if (bitLength() > 63)
            throw new ArithmeticException("BigInteger out of long range");
        return longValue();
    }
}

public enum RoundingMode { UP, DOWN, CEILING, FLOOR, HALF_UP, HALF_DOWN, HALF_EVEN, UNNECESSARY }

public final class MathContext {
    public static final MathContext UNLIMITED = new MathContext(0, RoundingMode.HALF_UP);
    public static final MathContext DECIMAL32 = new MathContext(7, RoundingMode.HALF_EVEN);
    public static final MathContext DECIMAL64 = new MathContext(16, RoundingMode.HALF_EVEN);
    public static final MathContext DECIMAL128 = new MathContext(34, RoundingMode.HALF_EVEN);
    private final int precision;
    private final RoundingMode roundingMode;
    public MathContext(int precision) { this(precision, RoundingMode.HALF_UP); }
    public MathContext(int precision, RoundingMode roundingMode) {
        if (precision < 0)
            throw new IllegalArgumentException("Digits < 0");
        this.precision = precision;
        this.roundingMode = roundingMode;
    }
    public int getPrecision() { return precision; }
    public RoundingMode getRoundingMode() { return roundingMode; }
    public boolean equals(Object other) {
        return other instanceof MathContext mc && mc.precision == precision && mc.roundingMode == roundingMode;
    }
    public int hashCode() { return roundingMode.hashCode() + (precision << 2); }
    public String toString() { return "precision=" + precision + " roundingMode=" + roundingMode; }
}

public class BigDecimal extends Number implements Comparable<BigDecimal> {
    public static final BigDecimal ZERO = new BigDecimal(BigInteger.ZERO, 0);
    public static final BigDecimal ONE = new BigDecimal(BigInteger.ONE, 0);
    public static final BigDecimal TWO = new BigDecimal(BigInteger.TWO, 0);
    public static final BigDecimal TEN = new BigDecimal(BigInteger.TEN, 0);
    public static final int ROUND_UP = 0, ROUND_DOWN = 1, ROUND_CEILING = 2, ROUND_FLOOR = 3, ROUND_HALF_UP = 4,
        ROUND_HALF_DOWN = 5, ROUND_HALF_EVEN = 6, ROUND_UNNECESSARY = 7;

    private final BigInteger unscaled;
    private final int scale;

    public BigDecimal(BigInteger unscaled, int scale) {
        this.unscaled = unscaled;
        this.scale = scale;
    }
    public BigDecimal(BigInteger value) { this(value, 0); }
    public BigDecimal(int value) { this(BigInteger.valueOf(value), 0); }
    public BigDecimal(long value) { this(BigInteger.valueOf(value), 0); }
    public BigDecimal(double value) { this(exactText(value)); }
    public BigDecimal(String text) {
        String digits = text;
        int exponent = 0;
        int e = Math.max(digits.indexOf('e'), digits.indexOf('E'));
        if (e >= 0) {
            try {
                exponent = Integer.parseInt(digits.substring(e + 1).startsWith("+") ? digits.substring(e + 2) : digits.substring(e + 1));
            } catch (NumberFormatException ex) {
                throw new NumberFormatException("Character array is missing \"exponent\" mark 'e' or 'E'.");
            }
            digits = digits.substring(0, e);
        }
        int dot = digits.indexOf('.');
        int fraction = 0;
        if (dot >= 0) {
            fraction = digits.length() - dot - 1;
            digits = digits.substring(0, dot) + digits.substring(dot + 1);
        }
        if (digits.isEmpty() || digits.equals("-") || digits.equals("+") || !digits.matches("[+-]?[0-9]+"))
            throw new NumberFormatException("Character " + (digits.isEmpty() ? "array" : digits.replaceAll("[+0-9-]", "").isEmpty() ? "array" : digits.replaceAll("[+0-9-]", "").charAt(0)) + " is neither a decimal digit number, decimal point, nor \"e\" notation exponential mark.");
        this.unscaled = new BigInteger(digits.startsWith("+") ? digits.substring(1) : digits);
        this.scale = fraction - exponent;
    }
    private static native String exactText(double value);

    public static BigDecimal valueOf(long value) { return new BigDecimal(BigInteger.valueOf(value), 0); }
    public static BigDecimal valueOf(long unscaled, int scale) { return new BigDecimal(BigInteger.valueOf(unscaled), scale); }
    public static BigDecimal valueOf(double value) { return new BigDecimal(Double.toString(value)); }

    public BigInteger unscaledValue() { return unscaled; }
    public int scale() { return scale; }
    public int signum() { return unscaled.signum(); }
    public int precision() {
        if (unscaled.signum() == 0)
            return 1;
        return unscaled.abs().toString().length();
    }

    private static BigInteger tenPower(int n) { return BigInteger.TEN.pow(n); }
    private BigInteger scaledTo(int newScale) { return unscaled.multiply(tenPower(newScale - scale)); }

    public BigDecimal add(BigDecimal other) {
        int target = Math.max(scale, other.scale);
        return new BigDecimal(scaledTo(target).add(other.scaledTo(target)), target);
    }
    public BigDecimal add(BigDecimal other, MathContext mc) { return add(other).round(mc); }
    public BigDecimal subtract(BigDecimal other) {
        int target = Math.max(scale, other.scale);
        return new BigDecimal(scaledTo(target).subtract(other.scaledTo(target)), target);
    }
    public BigDecimal subtract(BigDecimal other, MathContext mc) { return subtract(other).round(mc); }
    public BigDecimal multiply(BigDecimal other) { return new BigDecimal(unscaled.multiply(other.unscaled), scale + other.scale); }
    public BigDecimal multiply(BigDecimal other, MathContext mc) { return multiply(other).round(mc); }
    public BigDecimal negate() { return new BigDecimal(unscaled.negate(), scale); }
    public BigDecimal abs() { return signum() < 0 ? negate() : this; }
    public BigDecimal plus() { return this; }
    public BigDecimal pow(int n) {
        if (n < 0 || n > 999999999)
            throw new ArithmeticException("Invalid operation");
        return new BigDecimal(unscaled.pow(n), scale * n);
    }

    // num / den with the rounding mode.
    static BigInteger divideRounded(BigInteger num, BigInteger den, RoundingMode mode) {
        BigInteger[] qr = num.divideAndRemainder(den);
        BigInteger q = qr[0], r = qr[1];
        if (r.signum() == 0)
            return q;
        int sign = num.signum() * den.signum();
        int half = r.abs().shiftLeft(1).compareTo(den.abs());
        boolean increment;
        switch (mode) {
        case UNNECESSARY:
            throw new ArithmeticException("Rounding necessary");
        case UP:
            increment = true;
            break;
        case DOWN:
            increment = false;
            break;
        case CEILING:
            increment = sign > 0;
            break;
        case FLOOR:
            increment = sign < 0;
            break;
        case HALF_UP:
            increment = half >= 0;
            break;
        case HALF_DOWN:
            increment = half > 0;
            break;
        default:
            increment = half > 0 || (half == 0 && q.testBit(0));
        }
        return increment ? q.add(BigInteger.valueOf(sign)) : q;
    }

    public BigDecimal setScale(int newScale, RoundingMode mode) {
        if (newScale >= scale)
            return new BigDecimal(scaledTo(newScale), newScale);
        return new BigDecimal(divideRounded(unscaled, tenPower(scale - newScale), mode), newScale);
    }
    public BigDecimal setScale(int newScale, int mode) { return setScale(newScale, RoundingMode.values()[mode]); }
    public BigDecimal setScale(int newScale) { return setScale(newScale, RoundingMode.UNNECESSARY); }

    public BigDecimal round(MathContext mc) {
        int digits = mc.getPrecision();
        if (digits == 0 || precision() <= digits)
            return this;
        BigDecimal rounded = setScale(scale - (precision() - digits), mc.getRoundingMode());
        if (rounded.precision() > digits)
            rounded = rounded.setScale(rounded.scale - 1, mc.getRoundingMode());
        return rounded;
    }

    public BigDecimal stripTrailingZeros() {
        if (unscaled.signum() == 0)
            return new BigDecimal(BigInteger.ZERO, 0);
        BigInteger value = unscaled;
        int newScale = scale;
        while (true) {
            BigInteger[] qr = value.divideAndRemainder(BigInteger.TEN);
            if (qr[1].signum() != 0)
                break;
            value = qr[0];
            newScale--;
        }
        return new BigDecimal(value, newScale);
    }

    // The exact quotient or an ArithmeticException; the scale is the
    // preferred one (this.scale - divisor.scale) if the quotient fits it.
    public BigDecimal divide(BigDecimal divisor) {
        if (divisor.signum() == 0)
            throw new ArithmeticException(signum() == 0 ? "Division undefined" : "Division by zero");
        int preferred = scale - divisor.scale;
        BigInteger num = unscaled, den = divisor.unscaled;
        BigInteger g = num.gcd(den);
        if (g.signum() != 0) {
            num = num.divide(g);
            den = den.divide(g);
        }
        if (den.signum() < 0) {
            num = num.negate();
            den = den.negate();
        }
        int twos = 0, fives = 0;
        BigInteger rest = den;
        BigInteger five = BigInteger.valueOf(5);
        while (rest.mod(BigInteger.TWO).signum() == 0) {
            rest = rest.divide(BigInteger.TWO);
            twos++;
        }
        while (rest.mod(five).signum() == 0) {
            rest = rest.divide(five);
            fives++;
        }
        if (!rest.equals(BigInteger.ONE))
            throw new ArithmeticException("Non-terminating decimal expansion; no exact representable decimal result.");
        int extra = Math.max(twos, fives);
        BigInteger quotient = num.multiply(tenPower(extra)).divide(den);
        BigDecimal result = new BigDecimal(quotient, preferred + extra);
        // Extra zeros down to the preferred scale.
        while (result.scale > preferred) {
            BigInteger[] qr = result.unscaled.divideAndRemainder(BigInteger.TEN);
            if (qr[1].signum() != 0)
                break;
            result = new BigDecimal(qr[0], result.scale - 1);
        }
        return result;
    }
    public BigDecimal divide(BigDecimal divisor, int newScale, RoundingMode mode) {
        if (divisor.signum() == 0)
            throw new ArithmeticException(signum() == 0 ? "Division undefined" : "Division by zero");
        int shift = newScale + divisor.scale - scale;
        BigInteger num = unscaled, den = divisor.unscaled;
        if (shift >= 0)
            num = num.multiply(tenPower(shift));
        else
            den = den.multiply(tenPower(-shift));
        return new BigDecimal(divideRounded(num, den, mode), newScale);
    }
    public BigDecimal divide(BigDecimal divisor, int newScale, int mode) { return divide(divisor, newScale, RoundingMode.values()[mode]); }
    public BigDecimal divide(BigDecimal divisor, RoundingMode mode) { return divide(divisor, scale, mode); }
    public BigDecimal divide(BigDecimal divisor, MathContext mc) {
        if (mc.getPrecision() == 0)
            return divide(divisor);
        if (divisor.signum() == 0)
            throw new ArithmeticException(signum() == 0 ? "Division undefined" : "Division by zero");
        int preferred = scale - divisor.scale;
        // A scale with spare digits, then rounding to the precision.
        int adjusted = (precision() - scale) - (divisor.precision() - divisor.scale);
        int workScale = mc.getPrecision() - adjusted + 2;
        BigDecimal result = divide(divisor, Math.max(workScale, preferred), RoundingMode.DOWN);
        BigDecimal exact = divide(divisor, Math.max(workScale, preferred) + 3, RoundingMode.DOWN);
        if (exact.compareTo(result) != 0 || signum() == 0)
            result = exact;
        result = result.round(mc);
        while (result.scale > preferred) {
            BigInteger[] qr = result.unscaled.divideAndRemainder(BigInteger.TEN);
            if (qr[1].signum() != 0)
                break;
            result = new BigDecimal(qr[0], result.scale - 1);
        }
        return result;
    }
    public BigDecimal divideToIntegralValue(BigDecimal divisor) {
        BigDecimal quotient = divide(divisor, 0, RoundingMode.DOWN);
        int preferred = scale - divisor.scale;
        return preferred > 0 ? quotient.setScale(preferred) : quotient;
    }
    public BigDecimal remainder(BigDecimal divisor) { return subtract(divideToIntegralValue(divisor).multiply(divisor)); }
    public BigDecimal[] divideAndRemainder(BigDecimal divisor) {
        BigDecimal quotient = divideToIntegralValue(divisor);
        return new BigDecimal[] { quotient, subtract(quotient.multiply(divisor)) };
    }

    public BigDecimal movePointLeft(int n) { return new BigDecimal(unscaled, scale + n).fixNegativeScale(); }
    public BigDecimal movePointRight(int n) { return new BigDecimal(unscaled, scale - n).fixNegativeScale(); }
    private BigDecimal fixNegativeScale() { return scale < 0 ? setScale(0) : this; }
    public BigDecimal scaleByPowerOfTen(int n) { return new BigDecimal(unscaled, scale - n); }
    public BigDecimal ulp() { return new BigDecimal(BigInteger.ONE, scale); }
    public BigDecimal min(BigDecimal other) { return compareTo(other) <= 0 ? this : other; }
    public BigDecimal max(BigDecimal other) { return compareTo(other) >= 0 ? this : other; }

    public int compareTo(BigDecimal other) {
        int target = Math.max(scale, other.scale);
        return scaledTo(target).compareTo(other.scaledTo(target));
    }
    public boolean equals(Object other) { return other instanceof BigDecimal d && d.scale == scale && d.unscaled.equals(unscaled); }
    public int hashCode() { return 31 * unscaled.hashCode() + scale; }

    public BigInteger toBigInteger() { return scale <= 0 ? scaledTo(0) : unscaled.divide(tenPower(scale)); }
    public BigInteger toBigIntegerExact() {
        if (scale > 0 && unscaled.mod(tenPower(scale)).signum() != 0)
            throw new ArithmeticException("Rounding necessary");
        return toBigInteger();
    }
    public int intValue() { return toBigInteger().intValue(); }
    public long longValue() { return toBigInteger().longValue(); }
    public int intValueExact() { return toBigIntegerExact().intValueExact(); }
    public long longValueExact() { return toBigIntegerExact().longValueExact(); }
    public double doubleValue() { return Double.parseDouble(toString()); }
    public float floatValue() { return (float) doubleValue(); }

    public String toPlainString() {
        String digits = unscaled.abs().toString();
        String sign = unscaled.signum() < 0 ? "-" : "";
        if (scale <= 0)
            return sign + digits + (unscaled.signum() == 0 ? "" : "0".repeat(-scale));
        if (digits.length() <= scale)
            return sign + "0." + "0".repeat(scale - digits.length()) + digits;
        return sign + digits.substring(0, digits.length() - scale) + "." + digits.substring(digits.length() - scale);
    }
    // As in the JDK: scientific notation for a negative scale or an exponent below -6.
    public String toString() {
        String digits = unscaled.abs().toString();
        String sign = unscaled.signum() < 0 ? "-" : "";
        long adjusted = -(long) scale + (digits.length() - 1);
        if (scale >= 0 && adjusted >= -6)
            return toPlainString();
        String mantissa = digits.length() > 1 ? digits.charAt(0) + "." + digits.substring(1) : digits;
        return sign + mantissa + "E" + (adjusted >= 0 ? "+" : "") + adjusted;
    }
    public String toEngineeringString() { return toString(); }
}
`);

    function rt() {
        return Java.rt;
    }

    function make(classType, value) {
        var object = new classType();
        object.$v = value;
        return object;
    }

    function result(value) {
        return make(rt().byName('java.math.BigInteger'), value);
    }

    function parse(text, radix) {
        if (text === null || text === undefined)
            throw rt().exception('java.lang.NullPointerException');
        if (radix < 2 || radix > 36)
            throw rt().exception('java.lang.NumberFormatException', 'Radix out of range');
        if (text.length === 0)
            throw rt().exception('java.lang.NumberFormatException', 'Zero length BigInteger');
        var digits = text.replace(/^[+-]/, '');
        var value = digits.length === 0 || /[^0-9a-zA-Z]/.test(digits) ? null : big.parse(text.charAt(0) === '+' ? digits : text, radix);
        if (value === null)
            throw rt().exception('java.lang.NumberFormatException', 'For input string: "' + text + '"' +
                                 (radix !== 10 ? ' under radix ' + radix : ''));
        return value;
    }

    function other(value) {
        return rt().nonNull(value).$v;
    }

    function divisor(value) {
        var operand = other(value);
        if (big.sign(operand) === 0)
            throw rt().exception('java.lang.ArithmeticException', 'BigInteger divide by zero');
        return operand;
    }

    function modulus(value) {
        var operand = other(value);
        if (big.sign(operand) <= 0)
            throw rt().exception('java.lang.ArithmeticException', 'BigInteger: modulus not positive');
        return operand;
    }

    var TWO_64 = big.pow(2, 64), TWO_63 = big.pow(2, 63), TWO_32 = big.pow(2, 32), TWO_31 = big.pow(2, 31);

    // The low bits digits in two's complement (intValue, longValue).
    function lowBits(value, modulus, half) {
        var low = big.mod(value, modulus);
        return big.cmp(low, half) >= 0 ? big.sub(low, modulus) : low;
    }

    function isqrt(value) {
        if (big.sign(value) === 0)
            return 0;
        var root = big.shl(1, Math.ceil(big.bitLength(value) / 2));
        for (;;) {
            var next = big.shr(big.add(root, big.quot(value, root)), 1);
            if (big.cmp(next, root) >= 0)
                return root;
            root = next;
        }
    }

    function modPow(base, exponent, modulus) {
        var result = 1;
        base = big.mod(base, modulus);
        while (big.sign(exponent) > 0) {
            if (big.cmp(big.and(exponent, 1), 1) === 0)
                result = big.mod(big.mul(result, base), modulus);
            base = big.mod(big.mul(base, base), modulus);
            exponent = big.shr(exponent, 1);
        }
        return big.mod(result, modulus);
    }

    function gcd(first, second) {
        first = big.sign(first) < 0 ? big.neg(first) : first;
        second = big.sign(second) < 0 ? big.neg(second) : second;
        while (big.sign(second) !== 0) {
            var remainder = big.mod(first, second);
            first = second;
            second = remainder;
        }
        return first;
    }

    // Miller - Rabin with the first primes as bases (exact for numbers up
    // to 3.3e24).
    function isPrime(value) {
        if (big.cmp(value, 2) < 0)
            return false;
        var small = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41];
        for (var primeIndex = 0; primeIndex < small.length; ++primeIndex) {
            if (big.cmp(value, small[primeIndex]) === 0)
                return true;
            if (big.sign(big.mod(value, small[primeIndex])) === 0)
                return false;
        }
        var oddPart = big.sub(value, 1), twos = 0;
        while (big.sign(big.and(oddPart, 1)) === 0) {
            oddPart = big.shr(oddPart, 1);
            ++twos;
        }
        var minusOne = big.sub(value, 1);
        outer:
        for (var baseIndex = 0; baseIndex < small.length; ++baseIndex) {
            var witness = modPow(small[baseIndex], oddPart, value);
            if (big.cmp(witness, 1) === 0 || big.cmp(witness, minusOne) === 0)
                continue;
            for (var round = 1; round < twos; ++round) {
                witness = big.mod(big.mul(witness, witness), value);
                if (big.cmp(witness, minusOne) === 0)
                    continue outer;
            }
            return false;
        }
        return true;
    }

    Java.natives['java.math.BigInteger'] = {
        '<init>(String)': function (text) { return make(this, parse(text, 10)); },
        '<init>(String,int)': function (text, radix) { return make(this, parse(text, radix)); },
        'valueOf(long)': function (value) { return result(T.i64ToBig(value, true)); },
        'add(BigInteger)': function (operand) { return result(big.add(this.$v, other(operand))); },
        'subtract(BigInteger)': function (operand) { return result(big.sub(this.$v, other(operand))); },
        'multiply(BigInteger)': function (operand) { return result(big.mul(this.$v, other(operand))); },
        'divide(BigInteger)': function (operand) { return result(big.quot(this.$v, divisor(operand))); },
        'remainder(BigInteger)': function (operand) { return result(big.rem(this.$v, divisor(operand))); },
        'mod(BigInteger)': function (modulusValue) { return result(big.mod(this.$v, modulus(modulusValue))); },
        'pow(int)': function (exponent) {
            if (exponent < 0)
                throw rt().exception('java.lang.ArithmeticException', 'Negative exponent');
            return result(big.pow(this.$v, exponent));
        },
        'modPow(BigInteger,BigInteger)': function (exponent, modulusValue) {
            var modulusBig = modulus(modulusValue), exponentBig = other(exponent);
            if (big.sign(exponentBig) < 0)
                throw rt().exception('java.lang.ArithmeticException', 'BigInteger: negative exponent');
            return result(modPow(this.$v, exponentBig, modulusBig));
        },
        'modInverse(BigInteger)': function (modulusValue) {
            var modulusBig = modulus(modulusValue);
            // The extended Euclid algorithm.
            var r0 = modulusBig, r1 = big.mod(this.$v, modulusBig), t0 = 0, t1 = 1;
            while (big.sign(r1) !== 0) {
                var quotient = big.quot(r0, r1);
                var r2 = big.sub(r0, big.mul(quotient, r1));
                r0 = r1;
                r1 = r2;
                var t2 = big.sub(t0, big.mul(quotient, t1));
                t0 = t1;
                t1 = t2;
            }
            if (big.cmp(r0, 1) !== 0)
                throw rt().exception('java.lang.ArithmeticException', 'BigInteger not invertible.');
            return result(big.mod(t0, modulusBig));
        },
        'gcd(BigInteger)': function (operand) { return result(gcd(this.$v, other(operand))); },
        'sqrt()': function () {
            if (big.sign(this.$v) < 0)
                throw rt().exception('java.lang.ArithmeticException', 'Negative BigInteger');
            return result(isqrt(this.$v));
        },
        'negate()': function () { return result(big.neg(this.$v)); },
        'abs()': function () { return big.sign(this.$v) < 0 ? result(big.neg(this.$v)) : this; },
        'signum()': function () { return big.sign(this.$v); },
        'shiftLeft(int)': function (shift) {
            return result(shift >= 0 ? big.shl(this.$v, shift) : big.shr(this.$v, -shift));
        },
        'shiftRight(int)': function (shift) {
            return result(shift >= 0 ? big.shr(this.$v, shift) : big.shl(this.$v, -shift));
        },
        'and(BigInteger)': function (operand) { return result(big.and(this.$v, other(operand))); },
        'or(BigInteger)': function (operand) { return result(big.or(this.$v, other(operand))); },
        'xor(BigInteger)': function (operand) { return result(big.xor(this.$v, other(operand))); },
        'andNot(BigInteger)': function (operand) { return result(big.andNot(this.$v, other(operand))); },
        'not()': function () { return result(big.not(this.$v)); },
        'testBit(int)': function (bit) {
            if (bit < 0)
                throw rt().exception('java.lang.ArithmeticException', 'Negative bit address');
            return big.sign(big.and(big.shr(this.$v, bit), 1)) !== 0;
        },
        'bitLength()': function () { return big.bitLength(this.$v); },
        'bitCount()': function () {
            var magnitude = big.sign(this.$v) < 0 ? big.not(this.$v) : this.$v;
            var text = big.str(magnitude, 2);
            var count = 0;
            for (var index = 0; index < text.length; ++index)
                count += text.charAt(index) === '1' ? 1 : 0;
            return count;
        },
        'getLowestSetBit()': function () {
            if (big.sign(this.$v) === 0)
                return -1;
            var count = 0;
            while (big.sign(big.and(big.shr(this.$v, count), 1)) === 0)
                ++count;
            return count;
        },
        'isProbablePrime(int)': function (certainty) {
            if (certainty <= 0)
                return true;
            var magnitude = big.sign(this.$v) < 0 ? big.neg(this.$v) : this.$v;
            return isPrime(magnitude);
        },
        'compareTo(BigInteger)': function (operand) { return big.cmp(this.$v, other(operand)); },
        'equals(Object)': function (other) {
            return other !== null && other !== undefined && other.$v !== undefined && rt().is(other, rt().byName('java.math.BigInteger')) &&
                big.cmp(this.$v, other.$v) === 0;
        },
        // As in the JDK: by the 32-bit words of the modulus, the high ones first.
        'hashCode()': function () {
            var sign = big.sign(this.$v);
            if (sign === 0)
                return 0;
            var hex = big.str(sign < 0 ? big.neg(this.$v) : this.$v, 16);
            while (hex.length % 8 !== 0)
                hex = '0' + hex;
            var hash = 0;
            for (var index = 0; index < hex.length; index += 8)
                hash = (Math.imul(31, hash) + parseInt(hex.substring(index, index + 8), 16)) | 0;
            return Math.imul(hash, sign);
        },
        'toString()': function () { return big.str(this.$v, 10); },
        'toString(int)': function (radix) { return big.str(this.$v, radix < 2 || radix > 36 ? 10 : radix); },
        'intValue()': function () { return big.toFloat(lowBits(this.$v, TWO_32, TWO_31)) | 0; },
        'longValue()': function () { return T.bigToI64(lowBits(this.$v, TWO_64, TWO_63), true); },
        'doubleValue()': function () { return Number(big.str(this.$v, 10)); }
    };

    // The exact decimal notation of a double: mantissa * 2^exponent.
    Java.natives['java.math.BigDecimal'] = {
        'exactText(double)': function (value) {
            if (value !== value || value === Infinity || value === -Infinity)
                throw rt().exception('java.lang.NumberFormatException', 'Infinite or NaN');
            if (value === 0)
                return '0';
            var negative = value < 0;
            var bits = new DataView(new ArrayBuffer(8));
            bits.setFloat64(0, Math.abs(value));
            var hi = bits.getUint32(0), lo = bits.getUint32(4);
            var exponent = (hi >>> 20) & 2047;
            var mantissa = big.add(big.mul(hi & 0xFFFFF, 4294967296), lo);
            if (exponent === 0)
                exponent = 1;
            else
                mantissa = big.add(mantissa, big.pow(2, 52));
            exponent -= 1075;
            while (exponent < 0 && big.sign(big.and(mantissa, 1)) === 0) {
                mantissa = big.shr(mantissa, 1);
                ++exponent;
            }
            var text;
            if (exponent >= 0) {
                text = big.str(big.shl(mantissa, exponent), 10);
            } else {
                var digits = big.str(big.mul(mantissa, big.pow(5, -exponent)), 10);
                var scale = -exponent;
                while (digits.length <= scale)
                    digits = '0' + digits;
                text = digits.substring(0, digits.length - scale) + '.' + digits.substring(digits.length - scale);
            }
            return (negative ? '-' : '') + text;
        }
    };
})(globalThis);
