// C#: System.Numerics - BigInteger, a struct over an integer of T.big (the
// field _value; null in default(BigInteger) is zero). The natives work on
// those integers only.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    if (CS.library.units['system.numerics/BigInteger'])
        return;

    CS.addLibrary('system.numerics', String.raw`
using System.Globalization;
namespace System.Numerics;

public readonly struct BigInteger : IComparable, IComparable<BigInteger>, IEquatable<BigInteger>, IFormattable
{
    private readonly object _value;

    private BigInteger(object value, bool raw) { _value = value; }
    public BigInteger(int value) { _value = FromInt64(value); }
    public BigInteger(uint value) { _value = FromInt64(value); }
    public BigInteger(long value) { _value = FromInt64(value); }
    public BigInteger(ulong value) { _value = FromUInt64(value); }
    public BigInteger(double value) { _value = FromDouble(value); }
    public BigInteger(float value) { _value = FromDouble(value); }
    public BigInteger(decimal value) { _value = FromDecimal(value); }

    private static extern object FromInt64(long value);
    private static extern object FromUInt64(ulong value);
    private static extern object FromDouble(double value);
    private static extern object FromDecimal(decimal value);
    private static extern object FromText(string value, bool hex);
    private static extern object Op(int operation, object left, object right);
    private static extern object Shift(object value, int count);
    private static extern int Cmp(object left, object right);
    private static extern object PowOf(object value, int exponent);
    private static extern object ModPowOf(object value, object exponent, object modulus);
    private static extern long ToInt64(object value, long min, long max, string type);
    private static extern ulong ToUInt64(object value);
    private static extern double ToDouble(object value);
    private static extern decimal ToDecimal(object value);
    private static extern string Text(object value, string format);
    private static extern int Hash(object value);
    private static extern double Ln(object value);
    private static extern long BitLength(object value);

    private static BigInteger Of(object value) => new BigInteger(value, true);

    public static BigInteger Zero => Of(0);
    public static BigInteger One => Of(1);
    public static BigInteger MinusOne => Of(-1);
    public bool IsZero => Cmp(_value, 0) == 0;
    public bool IsOne => Cmp(_value, 1) == 0;
    public bool IsEven => Cmp(Op(5, _value, 1), 0) == 0;
    public bool IsPowerOfTwo => Sign > 0 && Cmp(Op(5, _value, Op(1, _value, 1)), 0) == 0;
    public int Sign => Cmp(_value, 0);

    public static BigInteger Parse(string value)
    {
        if (value == null)
            throw new ArgumentNullException("value");
        object parsed = FromText(value, false);
        if (parsed == null)
            throw new FormatException("The value could not be parsed.");
        return Of(parsed);
    }
    public static BigInteger Parse(string value, NumberStyles style)
    {
        if (value == null)
            throw new ArgumentNullException("value");
        object parsed = FromText(value, (style & NumberStyles.AllowHexSpecifier) != 0);
        if (parsed == null)
            throw new FormatException("The value could not be parsed.");
        return Of(parsed);
    }
    public static BigInteger Parse(string value, IFormatProvider provider) => Parse(value);
    public static bool TryParse(string value, out BigInteger result)
    {
        object parsed = value == null ? null : FromText(value, false);
        result = parsed == null ? Zero : Of(parsed);
        return parsed != null;
    }

    public static BigInteger Abs(BigInteger value) => value.Sign < 0 ? -value : value;
    public static BigInteger Negate(BigInteger value) => -value;
    public static BigInteger Add(BigInteger left, BigInteger right) => left + right;
    public static BigInteger Subtract(BigInteger left, BigInteger right) => left - right;
    public static BigInteger Multiply(BigInteger left, BigInteger right) => left * right;
    public static BigInteger Divide(BigInteger dividend, BigInteger divisor) => dividend / divisor;
    public static BigInteger Remainder(BigInteger dividend, BigInteger divisor) => dividend % divisor;
    public static BigInteger DivRem(BigInteger dividend, BigInteger divisor, out BigInteger remainder)
    {
        remainder = dividend % divisor;
        return dividend / divisor;
    }
    public static (BigInteger Quotient, BigInteger Remainder) DivRem(BigInteger left, BigInteger right) => (left / right, left % right);
    public static BigInteger Pow(BigInteger value, int exponent)
    {
        if (exponent < 0)
            throw new ArgumentOutOfRangeException("exponent", "The number must be greater than or equal to zero.");
        return Of(PowOf(value._value, exponent));
    }
    public static BigInteger ModPow(BigInteger value, BigInteger exponent, BigInteger modulus)
    {
        if (exponent.Sign < 0)
            throw new ArgumentOutOfRangeException("exponent", "The number must be greater than or equal to zero.");
        if (modulus.IsZero)
            throw new DivideByZeroException();
        return Of(ModPowOf(value._value, exponent._value, modulus._value));
    }
    public static BigInteger GreatestCommonDivisor(BigInteger left, BigInteger right)
    {
        left = Abs(left);
        right = Abs(right);
        while (!right.IsZero)
            (left, right) = (right, left % right);
        return left;
    }
    public static BigInteger Max(BigInteger left, BigInteger right) => left >= right ? left : right;
    public static BigInteger Min(BigInteger left, BigInteger right) => left <= right ? left : right;
    public static int Compare(BigInteger left, BigInteger right) => Cmp(left._value, right._value);
    public static double Log(BigInteger value) => Ln(value._value);
    public static double Log(BigInteger value, double baseValue) => Ln(value._value) / Math.Log(baseValue);
    public static double Log10(BigInteger value) => Ln(value._value) / Math.Log(10);
    public long GetBitLength() => BitLength(_value);

    public static BigInteger operator +(BigInteger value) => value;
    public static BigInteger operator -(BigInteger value) => Of(Op(1, 0, value._value));
    public static BigInteger operator ~(BigInteger value) => Of(Op(1, Op(1, 0, value._value), 1));
    public static BigInteger operator ++(BigInteger value) => Of(Op(0, value._value, 1));
    public static BigInteger operator --(BigInteger value) => Of(Op(1, value._value, 1));
    public static BigInteger operator +(BigInteger left, BigInteger right) => Of(Op(0, left._value, right._value));
    public static BigInteger operator -(BigInteger left, BigInteger right) => Of(Op(1, left._value, right._value));
    public static BigInteger operator *(BigInteger left, BigInteger right) => Of(Op(2, left._value, right._value));
    public static BigInteger operator /(BigInteger left, BigInteger right) => Of(Op(3, left._value, right._value));
    public static BigInteger operator %(BigInteger left, BigInteger right) => Of(Op(4, left._value, right._value));
    public static BigInteger operator &(BigInteger left, BigInteger right) => Of(Op(5, left._value, right._value));
    public static BigInteger operator |(BigInteger left, BigInteger right) => Of(Op(6, left._value, right._value));
    public static BigInteger operator ^(BigInteger left, BigInteger right) => Of(Op(7, left._value, right._value));
    public static BigInteger operator <<(BigInteger value, int shift) => Of(Shift(value._value, shift));
    public static BigInteger operator >>(BigInteger value, int shift) => Of(Shift(value._value, -shift));
    public static bool operator ==(BigInteger left, BigInteger right) => Cmp(left._value, right._value) == 0;
    public static bool operator !=(BigInteger left, BigInteger right) => Cmp(left._value, right._value) != 0;
    public static bool operator <(BigInteger left, BigInteger right) => Cmp(left._value, right._value) < 0;
    public static bool operator >(BigInteger left, BigInteger right) => Cmp(left._value, right._value) > 0;
    public static bool operator <=(BigInteger left, BigInteger right) => Cmp(left._value, right._value) <= 0;
    public static bool operator >=(BigInteger left, BigInteger right) => Cmp(left._value, right._value) >= 0;

    public static implicit operator BigInteger(int value) => new BigInteger(value);
    public static implicit operator BigInteger(uint value) => new BigInteger(value);
    public static implicit operator BigInteger(long value) => new BigInteger(value);
    public static implicit operator BigInteger(ulong value) => new BigInteger(value);
    public static implicit operator BigInteger(short value) => new BigInteger(value);
    public static implicit operator BigInteger(ushort value) => new BigInteger(value);
    public static implicit operator BigInteger(byte value) => new BigInteger(value);
    public static implicit operator BigInteger(sbyte value) => new BigInteger(value);
    public static implicit operator BigInteger(char value) => new BigInteger((int)value);
    public static explicit operator BigInteger(double value) => new BigInteger(value);
    public static explicit operator BigInteger(float value) => new BigInteger(value);
    public static explicit operator BigInteger(decimal value) => new BigInteger(value);
    public static explicit operator int(BigInteger value) => (int)ToInt64(value._value, int.MinValue, int.MaxValue, "Int32");
    public static explicit operator uint(BigInteger value) => (uint)ToInt64(value._value, 0, uint.MaxValue, "UInt32");
    public static explicit operator short(BigInteger value) => (short)ToInt64(value._value, short.MinValue, short.MaxValue, "Int16");
    public static explicit operator ushort(BigInteger value) => (ushort)ToInt64(value._value, 0, ushort.MaxValue, "UInt16");
    public static explicit operator byte(BigInteger value) => (byte)ToInt64(value._value, 0, 255, "Byte");
    public static explicit operator sbyte(BigInteger value) => (sbyte)ToInt64(value._value, -128, 127, "SByte");
    public static explicit operator char(BigInteger value) => (char)ToInt64(value._value, 0, 65535, "Char");
    public static explicit operator long(BigInteger value) => ToInt64(value._value, long.MinValue, long.MaxValue, "Int64");
    public static explicit operator ulong(BigInteger value) => ToUInt64(value._value);
    public static explicit operator double(BigInteger value) => ToDouble(value._value);
    public static explicit operator float(BigInteger value) => (float)ToDouble(value._value);
    public static explicit operator decimal(BigInteger value) => ToDecimal(value._value);

    public int CompareTo(BigInteger other) => Cmp(_value, other._value);
    public int CompareTo(long other) => Cmp(_value, FromInt64(other));
    public int CompareTo(object obj)
    {
        if (obj == null)
            return 1;
        if (obj is BigInteger other)
            return CompareTo(other);
        throw new ArgumentException("The parameter must be a BigInteger.", "obj");
    }
    public bool Equals(BigInteger other) => Cmp(_value, other._value) == 0;
    public bool Equals(long other) => Cmp(_value, FromInt64(other)) == 0;
    public override bool Equals(object obj) => obj is BigInteger other && Equals(other);
    public override int GetHashCode() => Hash(_value);
    public override string ToString() => Text(_value, null);
    public string ToString(string format) => Text(_value, format);
    public string ToString(IFormatProvider provider) => Text(_value, null);
    public string ToString(string format, IFormatProvider provider) => Text(_value, format);
}
`);

    var natives = CS.natives;
    var big = T.big;

    function rt() {
        return CS.rt;
    }

    function value(raw) {
        return raw === null || raw === undefined ? 0 : raw;
    }

    function overflow(type) {
        return rt().exception('System.OverflowException', 'Value was either too large or too small for ' +
                              (type === 'Decimal' ? 'a Decimal.' : 'an ' + type + '.'));
    }

    // value^exponent mod modulus by squaring; the sign of the result is
    // that of value (the remainder of .NET).
    function modPow(base, exponent, modulus) {
        var result = 1;
        base = big.rem(base, modulus);
        while (big.sign(exponent) > 0) {
            if (big.sign(big.and(exponent, 1)) !== 0)
                result = big.rem(big.mul(result, base), modulus);
            exponent = big.shr(exponent, 1);
            base = big.rem(big.mul(base, base), modulus);
        }
        return big.rem(result, modulus);
    }

    // The standard formats: D, G, R (digits), N and F (with decimals), X
    // (two's complement, the sign digit when needed), E.
    function format(raw, text) {
        var number = value(raw);
        var match = /^([A-Za-z])(\d*)$/.exec(text || '');
        if (match === null)
            return big.str(number, 10);
        var kind = match[1].toUpperCase();
        var precision = match[2] === '' ? null : Number(match[2]);
        var negative = big.sign(number) < 0;
        var digits = big.str(negative ? big.neg(number) : number, 10);
        switch (kind) {
        case 'D':
            while (precision !== null && digits.length < precision)
                digits = '0' + digits;
            return (negative ? '-' : '') + digits;
        case 'N':
        case 'F': {
            var places = precision === null ? 2 : precision;
            var whole = kind === 'N' ? CS.groupInteger(digits) : digits;
            return (negative ? '-' : '') + whole + (places > 0 ? '.' + new Array(places + 1).join('0') : '');
        }
        case 'X': {
            var hex;
            if (!negative) {
                hex = big.str(number, 16);
                if (/^[89a-f]/.test(hex))
                    hex = '0' + hex;
            } else {
                var width = big.str(big.neg(number), 16).length + 1;
                hex = big.str(big.add(big.shl(1, 4 * width), number), 16);
                while (hex.length > 1 && hex.charAt(0) === 'f' && /^[89a-f]/.test(hex.charAt(1)))
                    hex = hex.substring(1);
            }
            while (precision !== null && hex.length < precision)
                hex = (negative ? 'f' : '0') + hex;
            return match[1] === 'X' ? hex.toUpperCase() : hex;
        }
        case 'E': {
            var count = precision === null ? 6 : precision;
            var exponent = digits.length - 1;
            // count + 1 significant digits, the rest rounded away from zero.
            var kept = digits.substring(0, count + 1);
            if (digits.length > count + 1 && digits.charAt(count + 1) >= '5') {
                kept = big.str(big.add(big.parse(kept, 10), 1), 10);
                if (kept.length > count + 1) {
                    kept = kept.substring(0, count + 1);
                    ++exponent;
                }
            }
            kept += new Array(count + 2).join('0');
            var mantissa = kept.charAt(0) + (count > 0 ? '.' + kept.substring(1, count + 1) : '');
            return (negative ? '-' : '') + mantissa + (match[1] === 'E' ? 'E' : 'e') + '+' + ('00' + exponent).slice(-3);
        }
        }
        return (negative ? '-' : '') + digits;
    }

    natives['System.Numerics.BigInteger'] = {
        'FromInt64(long)': function (number) { return T.i64ToBig(number, true); },
        'FromUInt64(ulong)': function (number) { return T.i64ToBig(number, false); },
        'FromDouble(double)': function (number) {
            if (!isFinite(number))
                throw rt().exception('System.OverflowException', 'Value was either too large or too small for a BigInteger.');
            return big.fromFloat(number);
        },
        'FromDecimal(decimal)': function (number) {
            var text = CS.decimal.str(number).replace(/\..*$/, '');
            return big.parse(text, 10);
        },
        'FromText(string, bool)': function (text, hex) {
            text = text.trim();
            if (hex) {
                if (!/^[0-9A-Fa-f]+$/.test(text))
                    return null;
                var parsed = big.parse(text, 16);
                // Hexadecimal is two's complement: a high first digit is negative.
                return parseInt(text.charAt(0), 16) >= 8 ? big.sub(parsed, big.shl(1, 4 * text.length)) : parsed;
            }
            if (!/^[+-]?\d+$/.test(text))
                return null;
            return big.parse(text, 10);
        },
        'Op(int, object, object)': function (operation, left, right) {
            left = value(left);
            right = value(right);
            switch (operation) {
            case 0:
                return big.add(left, right);
            case 1:
                return big.sub(left, right);
            case 2:
                return big.mul(left, right);
            case 3:
            case 4:
                if (big.sign(right) === 0)
                    throw rt().exception('System.DivideByZeroException', 'Attempted to divide by zero.');
                return operation === 3 ? big.quot(left, right) : big.rem(left, right);
            case 5:
                return big.and(left, right);
            case 6:
                return big.or(left, right);
            case 7:
                return big.xor(left, right);
            }
            throw new Error('BigInteger operation ' + operation);
        },
        'Shift(object, int)': function (number, count) {
            number = value(number);
            return count >= 0 ? big.shl(number, count) : big.shr(number, -count);
        },
        'Cmp(object, object)': function (left, right) { return big.cmp(value(left), value(right)); },
        'PowOf(object, int)': function (number, exponent) { return big.pow(value(number), exponent); },
        'ModPowOf(object, object, object)': function (number, exponent, modulus) {
            return modPow(value(number), value(exponent), big.sign(value(modulus)) < 0 ? big.neg(modulus) : modulus);
        },
        'ToInt64(object, long, long, string)': function (number, min, max, type) {
            number = value(number);
            if (big.cmp(number, T.i64ToBig(min, true)) < 0 || big.cmp(number, T.i64ToBig(max, true)) > 0)
                throw overflow(type);
            return T.bigToI64(number, true);
        },
        'ToUInt64(object)': function (number) {
            number = value(number);
            if (big.sign(number) < 0 || big.bitLength(number) > 64)
                throw overflow('UInt64');
            return T.bigToI64(number, false);
        },
        'ToDouble(object)': function (number) { return Number(big.str(value(number), 10)); },
        'ToDecimal(object)': function (number) {
            var parsed = CS.decimal.parse(big.str(value(number), 10));
            if (parsed === null)
                throw overflow('Decimal');
            return parsed;
        },
        'Text(object, string)': function (number, text) { return format(number, text); },
        'Hash(object)': function (number) {
            var text = big.str(value(number), 16);
            var hash = 0;
            for (var index = 0; index < text.length; ++index)
                hash = (Math.imul(hash, 31) + text.charCodeAt(index)) | 0;
            return hash;
        },
        'Ln(object)': function (number) {
            number = value(number);
            if (big.sign(number) < 0)
                return NaN;
            if (big.sign(number) === 0)
                return -Infinity;
            // The top 53 bits and the scale: exact enough for doubles.
            var bits = big.bitLength(number);
            var shift = Math.max(0, bits - 60);
            return Math.log(big.toFloat(big.shr(number, shift))) + shift * Math.LN2;
        },
        'BitLength(object)': function (number) {
            number = value(number);
            var bits = big.sign(number) < 0 ? big.bitLength(big.not(number)) : big.bitLength(number);
            return T.i64.fromFloat(bits);
        }
    };
})(globalThis);
