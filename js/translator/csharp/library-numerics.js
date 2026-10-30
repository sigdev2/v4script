// C#: System.Numerics - BigInteger, a struct over an integer of T.big (the
// field _value; null in default(BigInteger) is zero). The natives work on
// those integers only.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    if (CS.library.units['system.numerics/BigInteger'])
        return;

    // The interfaces of generic math. The numeric types of System name
    // them; their members for those types are natives (CS.numericMember).
    CS.addLibrary('system.numerics.math', String.raw`
using System.Globalization;
namespace System.Numerics;

public interface IAdditionOperators<TSelf, TOther, TResult> where TSelf : IAdditionOperators<TSelf, TOther, TResult>
{
    static abstract TResult operator +(TSelf left, TOther right);
}
public interface ISubtractionOperators<TSelf, TOther, TResult> where TSelf : ISubtractionOperators<TSelf, TOther, TResult>
{
    static abstract TResult operator -(TSelf left, TOther right);
}
public interface IMultiplyOperators<TSelf, TOther, TResult> where TSelf : IMultiplyOperators<TSelf, TOther, TResult>
{
    static abstract TResult operator *(TSelf left, TOther right);
}
public interface IDivisionOperators<TSelf, TOther, TResult> where TSelf : IDivisionOperators<TSelf, TOther, TResult>
{
    static abstract TResult operator /(TSelf left, TOther right);
}
public interface IModulusOperators<TSelf, TOther, TResult> where TSelf : IModulusOperators<TSelf, TOther, TResult>
{
    static abstract TResult operator %(TSelf left, TOther right);
}
public interface IUnaryNegationOperators<TSelf, TResult> where TSelf : IUnaryNegationOperators<TSelf, TResult>
{
    static abstract TResult operator -(TSelf value);
}
public interface IUnaryPlusOperators<TSelf, TResult> where TSelf : IUnaryPlusOperators<TSelf, TResult>
{
    static abstract TResult operator +(TSelf value);
}
public interface IIncrementOperators<TSelf> where TSelf : IIncrementOperators<TSelf>
{
    static abstract TSelf operator ++(TSelf value);
}
public interface IDecrementOperators<TSelf> where TSelf : IDecrementOperators<TSelf>
{
    static abstract TSelf operator --(TSelf value);
}
public interface IEqualityOperators<TSelf, TOther, TResult> where TSelf : IEqualityOperators<TSelf, TOther, TResult>
{
    static abstract TResult operator ==(TSelf left, TOther right);
    static abstract TResult operator !=(TSelf left, TOther right);
}
public interface IComparisonOperators<TSelf, TOther, TResult> : IEqualityOperators<TSelf, TOther, TResult>
    where TSelf : IComparisonOperators<TSelf, TOther, TResult>
{
    static abstract TResult operator <(TSelf left, TOther right);
    static abstract TResult operator >(TSelf left, TOther right);
    static abstract TResult operator <=(TSelf left, TOther right);
    static abstract TResult operator >=(TSelf left, TOther right);
}
public interface IBitwiseOperators<TSelf, TOther, TResult> where TSelf : IBitwiseOperators<TSelf, TOther, TResult>
{
    static abstract TResult operator &(TSelf left, TOther right);
    static abstract TResult operator |(TSelf left, TOther right);
    static abstract TResult operator ^(TSelf left, TOther right);
    static abstract TResult operator ~(TSelf value);
}
public interface IShiftOperators<TSelf, TOther, TResult> where TSelf : IShiftOperators<TSelf, TOther, TResult>
{
    static abstract TResult operator <<(TSelf value, TOther shiftAmount);
    static abstract TResult operator >>(TSelf value, TOther shiftAmount);
    static abstract TResult operator >>>(TSelf value, TOther shiftAmount);
}
public interface IAdditiveIdentity<TSelf, TResult> where TSelf : IAdditiveIdentity<TSelf, TResult>
{
    static abstract TResult AdditiveIdentity { get; }
}
public interface IMultiplicativeIdentity<TSelf, TResult> where TSelf : IMultiplicativeIdentity<TSelf, TResult>
{
    static abstract TResult MultiplicativeIdentity { get; }
}
public interface IMinMaxValue<TSelf> where TSelf : IMinMaxValue<TSelf>
{
    static abstract TSelf MinValue { get; }
    static abstract TSelf MaxValue { get; }
}

public interface INumberBase<TSelf> : IAdditionOperators<TSelf, TSelf, TSelf>, IAdditiveIdentity<TSelf, TSelf>,
    IDecrementOperators<TSelf>, IDivisionOperators<TSelf, TSelf, TSelf>, IEquatable<TSelf>, IEqualityOperators<TSelf, TSelf, bool>,
    IIncrementOperators<TSelf>, IMultiplicativeIdentity<TSelf, TSelf>, IMultiplyOperators<TSelf, TSelf, TSelf>, IFormattable,
    IParsable<TSelf>, ISubtractionOperators<TSelf, TSelf, TSelf>, IUnaryPlusOperators<TSelf, TSelf>,
    IUnaryNegationOperators<TSelf, TSelf>
    where TSelf : INumberBase<TSelf>
{
    static abstract TSelf One { get; }
    static abstract int Radix { get; }
    static abstract TSelf Zero { get; }
    static abstract TSelf Abs(TSelf value);
    static virtual TSelf CreateChecked<TOther>(TOther value) where TOther : INumberBase<TOther> =>
        throw new NotSupportedException("Specified method is not supported.");
    static virtual TSelf CreateSaturating<TOther>(TOther value) where TOther : INumberBase<TOther> =>
        throw new NotSupportedException("Specified method is not supported.");
    static virtual TSelf CreateTruncating<TOther>(TOther value) where TOther : INumberBase<TOther> =>
        throw new NotSupportedException("Specified method is not supported.");
    static abstract bool IsCanonical(TSelf value);
    static abstract bool IsComplexNumber(TSelf value);
    static abstract bool IsEvenInteger(TSelf value);
    static abstract bool IsFinite(TSelf value);
    static abstract bool IsImaginaryNumber(TSelf value);
    static abstract bool IsInfinity(TSelf value);
    static abstract bool IsInteger(TSelf value);
    static abstract bool IsNaN(TSelf value);
    static abstract bool IsNegative(TSelf value);
    static abstract bool IsNegativeInfinity(TSelf value);
    static abstract bool IsNormal(TSelf value);
    static abstract bool IsOddInteger(TSelf value);
    static abstract bool IsPositive(TSelf value);
    static abstract bool IsPositiveInfinity(TSelf value);
    static abstract bool IsRealNumber(TSelf value);
    static abstract bool IsSubnormal(TSelf value);
    static abstract bool IsZero(TSelf value);
    static abstract TSelf MaxMagnitude(TSelf x, TSelf y);
    static abstract TSelf MaxMagnitudeNumber(TSelf x, TSelf y);
    static abstract TSelf MinMagnitude(TSelf x, TSelf y);
    static abstract TSelf MinMagnitudeNumber(TSelf x, TSelf y);
    static abstract TSelf Parse(string s, NumberStyles style, IFormatProvider provider);
    static abstract bool TryParse(string s, NumberStyles style, IFormatProvider provider, out TSelf result);
}

public interface INumber<TSelf> : IComparable, IComparable<TSelf>, IComparisonOperators<TSelf, TSelf, bool>,
    IModulusOperators<TSelf, TSelf, TSelf>, INumberBase<TSelf>
    where TSelf : INumber<TSelf>
{
    static virtual TSelf Clamp(TSelf value, TSelf min, TSelf max)
    {
        if (min > max)
            throw new ArgumentException("'" + min + "' cannot be greater than " + max + ".");
        TSelf result = value;
        result = TSelf.Max(result, min);
        result = TSelf.Min(result, max);
        return result;
    }
    static virtual TSelf CopySign(TSelf value, TSelf sign)
    {
        TSelf result = value;
        if (TSelf.IsNegative(value) != TSelf.IsNegative(sign))
            result = -result;
        return result;
    }
    static virtual TSelf Max(TSelf x, TSelf y) => x >= y ? x : y;
    static virtual TSelf MaxNumber(TSelf x, TSelf y) => TSelf.Max(x, y);
    static virtual TSelf Min(TSelf x, TSelf y) => x <= y ? x : y;
    static virtual TSelf MinNumber(TSelf x, TSelf y) => TSelf.Min(x, y);
    static virtual int Sign(TSelf value)
    {
        if (value == TSelf.Zero)
            return 0;
        return TSelf.IsNegative(value) ? -1 : 1;
    }
}

public interface ISignedNumber<TSelf> : INumberBase<TSelf> where TSelf : ISignedNumber<TSelf>
{
    static abstract TSelf NegativeOne { get; }
}
public interface IUnsignedNumber<TSelf> : INumberBase<TSelf> where TSelf : IUnsignedNumber<TSelf>
{
}

public interface IBinaryNumber<TSelf> : IBitwiseOperators<TSelf, TSelf, TSelf>, INumber<TSelf> where TSelf : IBinaryNumber<TSelf>
{
    static virtual TSelf AllBitsSet => ~TSelf.Zero;
    static abstract bool IsPow2(TSelf value);
    static abstract TSelf Log2(TSelf value);
}

public interface IBinaryInteger<TSelf> : IBinaryNumber<TSelf>, IShiftOperators<TSelf, int, TSelf> where TSelf : IBinaryInteger<TSelf>
{
    static virtual (TSelf Quotient, TSelf Remainder) DivRem(TSelf left, TSelf right)
    {
        TSelf quotient = left / right;
        return (quotient, left - quotient * right);
    }
    static abstract TSelf LeadingZeroCount(TSelf value);
    static abstract TSelf PopCount(TSelf value);
    static abstract TSelf RotateLeft(TSelf value, int rotateAmount);
    static abstract TSelf RotateRight(TSelf value, int rotateAmount);
    static abstract TSelf TrailingZeroCount(TSelf value);
}

public interface IFloatingPointConstants<TSelf> : INumberBase<TSelf> where TSelf : IFloatingPointConstants<TSelf>
{
    static abstract TSelf E { get; }
    static abstract TSelf Pi { get; }
    static abstract TSelf Tau { get; }
}

public interface IFloatingPoint<TSelf> : IFloatingPointConstants<TSelf>, INumber<TSelf>, ISignedNumber<TSelf>
    where TSelf : IFloatingPoint<TSelf>
{
    static abstract TSelf Ceiling(TSelf x);
    static abstract TSelf Floor(TSelf x);
    static abstract TSelf Round(TSelf x);
    static abstract TSelf Round(TSelf x, int digits);
    static abstract TSelf Round(TSelf x, MidpointRounding mode);
    static abstract TSelf Round(TSelf x, int digits, MidpointRounding mode);
    static abstract TSelf Truncate(TSelf x);
}

public interface IRootFunctions<TSelf> : IFloatingPointConstants<TSelf> where TSelf : IRootFunctions<TSelf>
{
    static abstract TSelf Cbrt(TSelf x);
    static abstract TSelf Hypot(TSelf x, TSelf y);
    static abstract TSelf RootN(TSelf x, int n);
    static abstract TSelf Sqrt(TSelf x);
}
public interface IPowerFunctions<TSelf> : INumberBase<TSelf> where TSelf : IPowerFunctions<TSelf>
{
    static abstract TSelf Pow(TSelf x, TSelf y);
}
public interface IExponentialFunctions<TSelf> : IFloatingPointConstants<TSelf> where TSelf : IExponentialFunctions<TSelf>
{
    static abstract TSelf Exp(TSelf x);
    static abstract TSelf Exp10(TSelf x);
    static abstract TSelf Exp2(TSelf x);
}
public interface ILogarithmicFunctions<TSelf> : INumberBase<TSelf> where TSelf : ILogarithmicFunctions<TSelf>
{
    static abstract TSelf Log(TSelf x);
    static abstract TSelf Log(TSelf x, TSelf newBase);
    static abstract TSelf Log10(TSelf x);
    static abstract TSelf Log2(TSelf x);
}
public interface ITrigonometricFunctions<TSelf> : IFloatingPointConstants<TSelf> where TSelf : ITrigonometricFunctions<TSelf>
{
    static abstract TSelf Acos(TSelf x);
    static abstract TSelf Asin(TSelf x);
    static abstract TSelf Atan(TSelf x);
    static abstract TSelf Cos(TSelf x);
    static abstract TSelf Sin(TSelf x);
    static abstract TSelf Tan(TSelf x);
}
public interface IHyperbolicFunctions<TSelf> : IFloatingPointConstants<TSelf> where TSelf : IHyperbolicFunctions<TSelf>
{
    static abstract TSelf Acosh(TSelf x);
    static abstract TSelf Asinh(TSelf x);
    static abstract TSelf Atanh(TSelf x);
    static abstract TSelf Cosh(TSelf x);
    static abstract TSelf Sinh(TSelf x);
    static abstract TSelf Tanh(TSelf x);
}
public interface IFloatingPointIeee754<TSelf> : IExponentialFunctions<TSelf>, IFloatingPoint<TSelf>, IHyperbolicFunctions<TSelf>,
    ILogarithmicFunctions<TSelf>, IPowerFunctions<TSelf>, IRootFunctions<TSelf>, ITrigonometricFunctions<TSelf>
    where TSelf : IFloatingPointIeee754<TSelf>
{
    static abstract TSelf Epsilon { get; }
    static abstract TSelf NaN { get; }
    static abstract TSelf NegativeInfinity { get; }
    static abstract TSelf NegativeZero { get; }
    static abstract TSelf PositiveInfinity { get; }
    static abstract TSelf Atan2(TSelf y, TSelf x);
    static abstract TSelf FusedMultiplyAdd(TSelf left, TSelf right, TSelf addend);
    static abstract TSelf Ieee754Remainder(TSelf left, TSelf right);
    static abstract int ILogB(TSelf x);
    static abstract TSelf ScaleB(TSelf x, int n);
}
public interface IBinaryFloatingPointIeee754<TSelf> : IBinaryNumber<TSelf>, IFloatingPointIeee754<TSelf>
    where TSelf : IBinaryFloatingPointIeee754<TSelf>
{
}
`);

    CS.addLibrary('system.numerics', String.raw`
using System.Globalization;
namespace System.Numerics;

public readonly struct BigInteger : IComparable, IComparable<BigInteger>, IEquatable<BigInteger>, IFormattable,
    IBinaryInteger<BigInteger>, ISignedNumber<BigInteger>
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

    // Generic math.
    private static extern object FromNumber<TOther>(TOther value, int mode);
    private static extern int BitCount(object value, int which);
    public static BigInteger CreateChecked<TOther>(TOther value) where TOther : INumberBase<TOther> => Of(FromNumber(value, 0));
    public static BigInteger CreateSaturating<TOther>(TOther value) where TOther : INumberBase<TOther> => Of(FromNumber(value, 1));
    public static BigInteger CreateTruncating<TOther>(TOther value) where TOther : INumberBase<TOther> => Of(FromNumber(value, 2));
    public static BigInteger AdditiveIdentity => Zero;
    public static BigInteger MultiplicativeIdentity => One;
    public static BigInteger NegativeOne => MinusOne;
    public static int Radix => 2;
    public static BigInteger operator >>>(BigInteger value, int shift) => value >> shift;
    public static bool IsCanonical(BigInteger value) => true;
    public static bool IsComplexNumber(BigInteger value) => false;
    public static bool IsEvenInteger(BigInteger value) => value.IsEven;
    public static bool IsFinite(BigInteger value) => true;
    public static bool IsImaginaryNumber(BigInteger value) => false;
    public static bool IsInfinity(BigInteger value) => false;
    public static bool IsInteger(BigInteger value) => true;
    public static bool IsNaN(BigInteger value) => false;
    public static bool IsNegative(BigInteger value) => value.Sign < 0;
    public static bool IsNegativeInfinity(BigInteger value) => false;
    public static bool IsNormal(BigInteger value) => !value.IsZero;
    public static bool IsOddInteger(BigInteger value) => !value.IsEven;
    public static bool IsPositive(BigInteger value) => value.Sign >= 0;
    public static bool IsPositiveInfinity(BigInteger value) => false;
    public static bool IsRealNumber(BigInteger value) => true;
    public static bool IsSubnormal(BigInteger value) => false;
    static bool INumberBase<BigInteger>.IsZero(BigInteger value) => value.IsZero;
    public static bool IsPow2(BigInteger value) => value.IsPowerOfTwo;
    public static BigInteger Log2(BigInteger value)
    {
        if (value.Sign < 0)
            throw new ArgumentOutOfRangeException("value", "Value must be positive.");
        return value.IsZero ? Zero : new BigInteger(value.GetBitLength() - 1);
    }
    public static BigInteger MaxMagnitude(BigInteger x, BigInteger y)
    {
        int order = Abs(x).CompareTo(Abs(y));
        return order > 0 || (order == 0 && y.Sign < 0) ? x : y;
    }
    public static BigInteger MaxMagnitudeNumber(BigInteger x, BigInteger y) => MaxMagnitude(x, y);
    public static BigInteger MinMagnitude(BigInteger x, BigInteger y)
    {
        int order = Abs(x).CompareTo(Abs(y));
        return order < 0 || (order == 0 && x.Sign < 0) ? x : y;
    }
    public static BigInteger MinMagnitudeNumber(BigInteger x, BigInteger y) => MinMagnitude(x, y);
    public static BigInteger Clamp(BigInteger value, BigInteger min, BigInteger max)
    {
        if (min > max)
            throw new ArgumentException("'" + min + "' cannot be greater than " + max + ".");
        return value < min ? min : (value > max ? max : value);
    }
    public static BigInteger CopySign(BigInteger value, BigInteger sign) => sign.Sign < 0 ? -Abs(value) : Abs(value);
    static int INumber<BigInteger>.Sign(BigInteger value) => value.Sign;
    public static BigInteger PopCount(BigInteger value) => new BigInteger(BitCount(value._value, 0));
    public static BigInteger LeadingZeroCount(BigInteger value) => new BigInteger(BitCount(value._value, 1));
    public static BigInteger TrailingZeroCount(BigInteger value) => new BigInteger(BitCount(value._value, 2));
    public static BigInteger RotateLeft(BigInteger value, int rotateAmount) => value << rotateAmount;
    public static BigInteger RotateRight(BigInteger value, int rotateAmount) => value >> rotateAmount;
    public static BigInteger Parse(string s, NumberStyles style, IFormatProvider provider) => Parse(s, style);
    public static bool TryParse(string s, NumberStyles style, IFormatProvider provider, out BigInteger result)
    {
        object parsed = s == null ? null : FromText(s, (style & NumberStyles.AllowHexSpecifier) != 0);
        result = parsed == null ? Zero : Of(parsed);
        return parsed != null;
    }
    public static bool TryParse(string s, IFormatProvider provider, out BigInteger result) => TryParse(s, out result);

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
        'FromNumber<TOther>(TOther, int)': function (type, number, mode) {
            var source = canonical(type, number);
            if (source === null)
                throw rt().exception('System.NotSupportedException', 'Specified method is not supported.');
            if (source.int !== undefined)
                return source.int;
            if (source.decimal !== undefined)
                return big.parse(decimal.str(decimal.round(source.decimal, 0, 'zero')).replace(/\..*$/, ''), 10);
            if (!isFinite(source.float)) {
                if (mode === 1 && source.float !== source.float)
                    return 0;
                throw rt().exception('System.OverflowException', 'Value was either too large or too small for a BigInteger.');
            }
            return big.fromFloat(source.float);
        },
        // PopCount (0), LeadingZeroCount (1), TrailingZeroCount (2) of the
        // two's complement in 32-bit words, as .NET counts them.
        'BitCount(object, int)': function (number, which) {
            number = value(number);
            var words = Math.max(1, Math.ceil((big.bitLength(big.sign(number) < 0 ? big.not(number) : number) + 1) / 32));
            if (big.sign(number) >= 0)
                words = Math.max(1, Math.ceil(big.bitLength(number) / 32));
            var bits = words * 32;
            var unsigned = big.sign(number) < 0 ? big.add(number, big.pow(2, bits)) : number;
            var text = big.str(unsigned, 2);
            if (which === 0)
                return bitCount(text);
            if (which === 1)
                return big.sign(unsigned) === 0 ? 32 : bits - text.length;
            return text === '0' ? 32 : text.length - 1 - text.lastIndexOf('1');
        },
        'BitLength(object)': function (number) {
            number = value(number);
            var bits = big.sign(number) < 0 ? big.bitLength(big.not(number)) : big.bitLength(number);
            return T.i64.fromFloat(bits);
        }
    };

    // --- Generic math of the numeric types of System
    //
    // INumber<int> and the other interfaces of generic math have no C#
    // implementation in Int32, Double...: T.Zero, a + b with T = int and
    // int.CreateChecked(x) through a type parameter end in $cs.callStatic,
    // which takes the member from here by its C# name.

    var i64 = T.i64, u64 = T.u64, decimal = CS.decimal;
    var KINDS = { 'System.SByte': 'i8', 'System.Byte': 'u8', 'System.Int16': 'i16', 'System.UInt16': 'u16', 'System.Char': 'u16',
                  'System.Int32': 'i32', 'System.UInt32': 'u32', 'System.Int64': 'i64', 'System.UInt64': 'u64',
                  'System.Single': 'f32', 'System.Double': 'f64', 'System.Decimal': 'decimal' };
    var BITS = { i8: 8, u8: 8, i16: 16, u16: 16, i32: 32, u32: 32, i64: 64, u64: 64 };
    var SIGNED = { i8: true, i16: true, i32: true, i64: true };
    var OVERFLOW = 'Arithmetic operation resulted in an overflow.';

    function overflowError() {
        return rt().exception('System.OverflowException', OVERFLOW);
    }

    function divideByZero() {
        return rt().exception('System.DivideByZeroException', 'Attempted to divide by zero.');
    }

    function wrapSmall(kind, x) {
        switch (kind) {
        case 'i8':
            return (x << 24) >> 24;
        case 'u8':
            return x & 255;
        case 'i16':
            return (x << 16) >> 16;
        case 'u16':
            return x & 65535;
        case 'i32':
            return x | 0;
        }
        return x >>> 0;
    }

    // An integer of the kind from an unbounded integer, by its low bits.
    function wrapBig(kind, value) {
        if (kind === 'i64' || kind === 'u64')
            return T.bigToI64(value, kind === 'i64');
        return wrapSmall(kind, i64.low32(T.bigToI64(value, true)));
    }

    function toBig(kind, value) {
        if (kind === 'i64' || kind === 'u64')
            return T.i64ToBig(value, kind === 'i64');
        return value;
    }

    function rangeOf(kind) {
        var bits = BITS[kind];
        if (SIGNED[kind])
            return [big.neg(big.pow(2, bits - 1)), big.sub(big.pow(2, bits - 1), 1)];
        return [0, big.sub(big.pow(2, bits), 1)];
    }

    // The bits of an integer as an unsigned unbounded integer.
    function unsignedBits(kind, value) {
        var integer = toBig(kind, value);
        return big.sign(integer) < 0 ? big.add(integer, big.pow(2, BITS[kind])) : integer;
    }

    function mathNative(key) {
        return natives['System.Math'][key];
    }

    var KEYWORDS = { i8: 'sbyte', u8: 'byte', i16: 'short', u16: 'ushort', i32: 'int', u32: 'uint', i64: 'long', u64: 'ulong',
                     f32: 'float', f64: 'double', decimal: 'decimal' };

    // Arithmetic of a kind: the operations the members below are made of.
    function arithmetic(kind) {
        if (BITS[kind] !== undefined && BITS[kind] <= 32) {
            return {
                add: function (a, b) { return wrapSmall(kind, a + b); },
                sub: function (a, b) { return wrapSmall(kind, a - b); },
                mul: function (a, b) { return wrapSmall(kind, kind === 'i32' || kind === 'u32' ? Math.imul(a, b) : a * b); },
                div: function (a, b) {
                    if (b === 0)
                        throw divideByZero();
                    if (kind === 'i32' && a === -2147483648 && b === -1)
                        throw overflowError();
                    return wrapSmall(kind, Math.trunc(a / b));
                },
                rem: function (a, b) {
                    if (b === 0)
                        throw divideByZero();
                    if (kind === 'i32' && a === -2147483648 && b === -1)
                        throw overflowError();
                    return wrapSmall(kind, a % b);
                },
                neg: function (a) { return wrapSmall(kind, -a); },
                cmp: function (a, b) { return a < b ? -1 : (a > b ? 1 : 0); },
                and: function (a, b) { return wrapSmall(kind, a & b); },
                or: function (a, b) { return wrapSmall(kind, a | b); },
                xor: function (a, b) { return wrapSmall(kind, a ^ b); },
                not: function (a) { return wrapSmall(kind, ~a); },
                // Shifts of the small types go through int: (byte)(value << n).
                shl: function (a, n) { return wrapSmall(kind, a << (n & 31)); },
                shr: function (a, n) { return wrapSmall(kind, kind === 'u32' ? a >>> (n & 31) : a >> (n & 31)); },
                ushr: function (a, n) { return wrapSmall(kind, a >>> (n & 31)); },
                zero: 0,
                one: 1,
                isNeg: function (a) { return a < 0; },
                integer: true
            };
        }
        if (kind === 'i64' || kind === 'u64') {
            var ops = kind === 'i64' ? i64 : u64;
            return {
                add: ops.add,
                sub: ops.sub,
                mul: ops.mul,
                div: function (a, b) {
                    if (ops.eq(b, 0))
                        throw divideByZero();
                    if (kind === 'i64' && ops.eq(b, -1) && ops.eq(a, rangeValue(kind, 0)))
                        throw overflowError();
                    return ops.div(a, b);
                },
                rem: function (a, b) {
                    if (ops.eq(b, 0))
                        throw divideByZero();
                    if (kind === 'i64' && ops.eq(b, -1))
                        return 0;
                    return ops.mod(a, b);
                },
                neg: ops.neg,
                cmp: ops.cmp,
                and: ops.and,
                or: ops.or,
                xor: ops.xor,
                not: ops.not,
                shl: function (a, n) { return ops.shl(a, n & 63); },
                shr: function (a, n) { return ops.shr(a, n & 63); },
                ushr: function (a, n) { return kind === 'i64' ? CS.rt.lushr(a, n & 63) : ops.shr(a, n & 63); },
                zero: 0,
                one: 1,
                isNeg: function (a) { return kind === 'i64' && i64.cmp(a, 0) < 0; },
                integer: true
            };
        }
        if (kind === 'f32' || kind === 'f64') {
            var round = kind === 'f32' ? Math.fround : function (x) { return x; };
            return {
                add: function (a, b) { return round(a + b); },
                sub: function (a, b) { return round(a - b); },
                mul: function (a, b) { return round(a * b); },
                div: function (a, b) { return round(a / b); },
                rem: function (a, b) { return round(a % b); },
                neg: function (a) { return -a; },
                cmp: function (a, b) { return a < b ? -1 : (a > b ? 1 : (a === b ? 0 : (a !== a ? (b !== b ? 0 : -1) : 1))); },
                zero: 0,
                one: 1,
                isNeg: function (a) { return a < 0 || (a === 0 && 1 / a < 0) || a !== a; },
                round: round,
                integer: false
            };
        }
        var dec = CS.rt.dec;
        return {
            add: dec.add,
            sub: dec.sub,
            mul: dec.mul,
            div: dec.div,
            rem: dec.rem,
            neg: decimal.neg,
            cmp: decimal.cmp,
            zero: decimal.ZERO,
            one: decimal.ONE,
            isNeg: function (a) { return a.n; },
            integer: false
        };
    }

    // MinValue (which 0) and MaxValue (which 1) of an integer kind.
    function rangeValue(kind, which) {
        return wrapBig(kind, rangeOf(kind)[which]);
    }

    // A value of a numeric type as { int: unbounded integer } or
    // { float: number } or { decimal: Decimal }; null for other types.
    function canonical(type, value) {
        var kind = KINDS[type.$name];
        if (kind === undefined) {
            if (type.$name === 'System.Numerics.BigInteger')
                return { int: value._value === null || value._value === undefined ? 0 : value._value };
            return null;
        }
        if (kind === 'f32' || kind === 'f64')
            return { float: value };
        if (kind === 'decimal')
            return { decimal: value };
        return { int: toBig(kind, value) };
    }

    var CASTS = { i32: 'd2i', u32: 'd2u', i64: 'd2l', u64: 'd2ul' };

    // CreateChecked, CreateSaturating, CreateTruncating of a kind.
    function create(kind, mode, otherType, value) {
        var source = canonical(otherType, value);
        if (source === null)
            throw rt().exception('System.NotSupportedException', 'Specified method is not supported.');
        if (kind === 'f32' || kind === 'f64') {
            var number = source.float !== undefined ? source.float
                : (source.decimal !== undefined ? decimal.toNumber(source.decimal) : Number(big.str(source.int, 10)));
            return kind === 'f32' ? Math.fround(number) : number;
        }
        if (kind === 'decimal')
            return createDecimal(mode, source, otherType);
        var integer;
        if (source.float !== undefined) {
            var x = source.float;
            if (mode === 'truncating') {
                var cast = CS.rt[CASTS[kind] || 'd2i'](x);
                return CASTS[kind] !== undefined ? cast : wrapSmall(kind, cast);
            }
            if (x !== x) {
                if (mode === 'checked')
                    throw overflowError();
                // .NET 8 saturates by comparisons: NaN is the cast (as on x64).
                var castNaN = CS.rt[CASTS[kind] || 'd2i'](x);
                return CASTS[kind] !== undefined ? castNaN : wrapSmall(kind, castNaN);
            }
            if (!isFinite(x)) {
                if (mode === 'checked')
                    throw overflowError();
                return rangeValue(kind, x > 0 ? 1 : 0);
            }
            integer = big.fromFloat(Math.trunc(x));
        } else if (source.decimal !== undefined) {
            integer = big.parse(decimal.str(decimal.round(source.decimal, 0, 'zero')).replace(/\..*$/, ''), 10);
        } else {
            integer = source.int;
        }
        var range = rangeOf(kind);
        if (big.cmp(integer, range[0]) < 0 || big.cmp(integer, range[1]) > 0) {
            if (mode === 'checked')
                throw overflowError();
            if (mode === 'saturating')
                return rangeValue(kind, big.cmp(integer, range[0]) < 0 ? 0 : 1);
        }
        return wrapBig(kind, integer);
    }

    function createDecimal(mode, source, otherType) {
        var tooBig = function (negative) {
            if (mode !== 'saturating')
                throw rt().exception('System.OverflowException', 'Value was either too large or too small for a Decimal.');
            return negative ? decimal.neg(decimal.MAX) : decimal.MAX;
        };
        if (source.decimal !== undefined)
            return source.decimal;
        if (source.float !== undefined) {
            var x = source.float;
            if (x !== x)
                return mode === 'saturating' ? decimal.ZERO : tooBig(false);
            if (!isFinite(x) || Math.abs(x) >= 7.922816251426434e28)
                return tooBig(x < 0);
            return otherType.$name === 'System.Single' ? CS.rt.dec.fromSingle(x) : decimal.fromDouble(x);
        }
        var parsed = decimal.parse(big.str(source.int, 10));
        return parsed === null ? tooBig(big.sign(source.int) < 0) : parsed;
    }

    function bitCount(text) {
        var count = 0;
        for (var index = 0; index < text.length; ++index)
            count += text.charAt(index) === '1' ? 1 : 0;
        return count;
    }

    // An int result as the kind (PopCount returns TSelf).
    function asKind(kind, number) {
        return kind === 'i64' || kind === 'u64' ? i64.fromFloat(number) : number;
    }

    function members(kind) {
        var a = arithmetic(kind);
        var keyword = KEYWORDS[kind];
        var isFloat = kind === 'f32' || kind === 'f64';
        var isDecimal = kind === 'decimal';
        var table = {
            op_Addition: a.add,
            op_Subtraction: a.sub,
            op_Multiply: a.mul,
            op_Division: a.div,
            op_Modulus: a.rem,
            op_UnaryNegation: a.neg,
            op_UnaryPlus: function (x) { return x; },
            op_Increment: function (x) { return a.add(x, a.one); },
            op_Decrement: function (x) { return a.sub(x, a.one); },
            op_Equality: function (x, y) { return isFloat ? x === y : a.cmp(x, y) === 0; },
            op_Inequality: function (x, y) { return isFloat ? x !== y : a.cmp(x, y) !== 0; },
            op_LessThan: function (x, y) { return isFloat ? x < y : a.cmp(x, y) < 0; },
            op_GreaterThan: function (x, y) { return isFloat ? x > y : a.cmp(x, y) > 0; },
            op_LessThanOrEqual: function (x, y) { return isFloat ? x <= y : a.cmp(x, y) <= 0; },
            op_GreaterThanOrEqual: function (x, y) { return isFloat ? x >= y : a.cmp(x, y) >= 0; },
            get_Zero: function () { return a.zero; },
            get_One: function () { return a.one; },
            get_AdditiveIdentity: function () { return a.zero; },
            get_MultiplicativeIdentity: function () { return a.one; },
            get_Radix: function () { return isDecimal ? 10 : 2; },
            Abs: mathNative('Abs(' + keyword + ')') || function (x) { return a.isNeg(x) ? a.neg(x) : x; },
            Max: mathNative('Max(' + keyword + ', ' + keyword + ')'),
            Min: mathNative('Min(' + keyword + ', ' + keyword + ')'),
            Clamp: mathNative('Clamp(' + keyword + ', ' + keyword + ', ' + keyword + ')'),
            Sign: mathNative('Sign(' + keyword + ')') || function (x) { return a.cmp(x, a.zero); },
            IsZero: function (x) { return a.cmp(x, a.zero) === 0; },
            IsNegative: a.isNeg,
            IsPositive: function (x) { return !a.isNeg(x); },
            IsCanonical: function () { return true; },
            IsComplexNumber: function () { return false; },
            IsImaginaryNumber: function () { return false; },
            IsRealNumber: function (x) { return !(isFloat && x !== x); },
            IsNaN: function (x) { return isFloat && x !== x; },
            IsInfinity: function (x) { return isFloat && (x === Infinity || x === -Infinity); },
            IsPositiveInfinity: function (x) { return isFloat && x === Infinity; },
            IsNegativeInfinity: function (x) { return isFloat && x === -Infinity; },
            IsFinite: function (x) { return !isFloat || isFinite(x); },
            IsInteger: function (x) {
                if (isFloat)
                    return isFinite(x) && Math.trunc(x) === x;
                if (isDecimal)
                    return decimal.cmp(decimal.round(x, 0, 'zero'), x) === 0;
                return true;
            },
            IsEvenInteger: function (x) { return table.IsInteger(x) && a.cmp(a.rem(x, isDecimal ? decimal.parse('2') : 2), a.zero) === 0; },
            IsOddInteger: function (x) { return table.IsInteger(x) && a.cmp(a.rem(x, isDecimal ? decimal.parse('2') : 2), a.zero) !== 0; },
            IsNormal: function (x) {
                if (!isFloat)
                    return a.cmp(x, a.zero) !== 0;
                return isFinite(x) && x !== 0 && Math.abs(x) >= (kind === 'f32' ? 1.1754943508222875e-38 : 2.2250738585072014e-308);
            },
            IsSubnormal: function (x) {
                return isFloat && x !== 0 && isFinite(x) && Math.abs(x) < (kind === 'f32' ? 1.1754943508222875e-38 : 2.2250738585072014e-308);
            },
            MaxMagnitude: function (x, y) { return magnitude(a, isFloat, x, y, true); },
            MinMagnitude: function (x, y) { return magnitude(a, isFloat, x, y, false); },
            MaxMagnitudeNumber: function (x, y) { return isFloat && x !== x ? y : (isFloat && y !== y ? x : magnitude(a, isFloat, x, y, true)); },
            MinMagnitudeNumber: function (x, y) { return isFloat && x !== x ? y : (isFloat && y !== y ? x : magnitude(a, isFloat, x, y, false)); },
            MaxNumber: function (x, y) { return isFloat && x !== x ? y : (isFloat && y !== y ? x : table.Max(x, y)); },
            MinNumber: function (x, y) { return isFloat && x !== x ? y : (isFloat && y !== y ? x : table.Min(x, y)); },
            CopySign: mathNative('CopySign(' + keyword + ', ' + keyword + ')') || function (x, sign) {
                var result = a.isNeg(x) !== a.isNeg(sign) ? a.neg(x) : x;
                if (a.isNeg(result) !== a.isNeg(sign) && a.cmp(x, a.zero) !== 0)
                    throw overflowError();
                return result;
            },
            CreateChecked: function (otherType, value) { return create(kind, 'checked', otherType, value); },
            CreateSaturating: function (otherType, value) { return create(kind, 'saturating', otherType, value); },
            CreateTruncating: function (otherType, value) { return create(kind, 'truncating', otherType, value); },
            Parse: function () {
                var typeName = this.$name;
                var table = natives[typeName];
                if (arguments.length === 2)
                    return table['Parse(string, IFormatProvider)'](arguments[0], arguments[1]);
                return table['Parse(string, NumberStyles, IFormatProvider)'](arguments[0], arguments[1], arguments[2]);
            },
            TryParse: function () {
                var table = natives[this.$name];
                var name = CS.KEYWORD_OF[this.$name];
                if (arguments.length === 3)
                    return table['TryParse(string, IFormatProvider, out ' + name + ')'](arguments[0], arguments[1], arguments[2]);
                return table['TryParse(string, NumberStyles, IFormatProvider, out ' + name + ')'](arguments[0], arguments[1], arguments[2],
                                                                                                  arguments[3]);
            }
        };
        if (a.integer) {
            var bits = BITS[kind];
            table.get_MinValue = function () { return rangeValue(kind, 0); };
            table.get_MaxValue = function () { return rangeValue(kind, 1); };
            table.get_AllBitsSet = function () { return a.not(a.zero); };
            table.op_BitwiseAnd = a.and;
            table.op_BitwiseOr = a.or;
            table.op_ExclusiveOr = a.xor;
            table.op_OnesComplement = a.not;
            table.op_LeftShift = a.shl;
            table.op_RightShift = a.shr;
            table.op_UnsignedRightShift = a.ushr;
            table.PopCount = function (x) { return asKind(kind, bitCount(big.str(unsignedBits(kind, x), 2))); };
            table.LeadingZeroCount = function (x) {
                var value = unsignedBits(kind, x);
                return asKind(kind, big.sign(value) === 0 ? bits : bits - big.str(value, 2).length);
            };
            table.TrailingZeroCount = function (x) {
                var text = big.str(unsignedBits(kind, x), 2);
                if (text === '0')
                    return asKind(kind, bits);
                return asKind(kind, text.length - 1 - text.lastIndexOf('1'));
            };
            table.IsPow2 = function (x) {
                var value = toBig(kind, x);
                return big.sign(value) > 0 && bitCount(big.str(value, 2)) === 1;
            };
            table.Log2 = function (x) {
                var value = toBig(kind, x);
                if (big.sign(value) < 0)
                    throw CS.argRange('value', 'Value must be positive.');
                return asKind(kind, big.sign(value) === 0 ? 0 : big.str(value, 2).length - 1);
            };
            var rotate = function (x, amount) {
                var value = unsignedBits(kind, x);
                amount = ((amount % bits) + bits) % bits;
                var modulus = big.pow(2, bits);
                var shifted = big.add(big.mod(big.shl(value, amount), modulus), big.shr(value, bits - amount));
                return wrapBig(kind, big.mod(shifted, modulus));
            };
            table.RotateLeft = rotate;
            table.RotateRight = function (x, amount) { return rotate(x, -amount); };
            table.DivRem = function (x, y) {
                var quotient = a.div(x, y);
                var type = this;
                var Tuple = rt().inst(rt().type('System.ValueTuple`2'), [type, type]);
                return rt().tuple(Tuple, [quotient, a.sub(x, a.mul(quotient, y))]);
            };
            if (SIGNED[kind])
                table.get_NegativeOne = function () { return a.neg(a.one); };
        } else {
            var r = isFloat ? a.round : null;
            table.get_NegativeOne = function () { return a.neg(a.one); };
            table.get_E = function () { return isDecimal ? decimal.parse('2.7182818284590452353602874713') : r(Math.E); };
            table.get_Pi = function () { return isDecimal ? decimal.parse('3.1415926535897932384626433833') : r(Math.PI); };
            table.get_Tau = function () { return isDecimal ? decimal.parse('6.2831853071795864769252867666') : r(2 * Math.PI); };
            if (isDecimal) {
                table.get_MinValue = function () { return decimal.neg(decimal.MAX); };
                table.get_MaxValue = function () { return decimal.MAX; };
            } else {
                table.get_MinValue = function () { return kind === 'f32' ? -3.4028234663852886e38 : -Number.MAX_VALUE; };
                table.get_MaxValue = function () { return kind === 'f32' ? 3.4028234663852886e38 : Number.MAX_VALUE; };
            }
            // MathF has fewer overloads: floats use the double ones, rounded.
            var mathKeyword = kind === 'f32' ? 'double' : keyword;
            var mathKey = function (name, count) {
                var list = [];
                for (var index = 0; index < count; ++index)
                    list.push(mathKeyword);
                return name + '(' + list.join(', ') + ')';
            };
            var viaMath = function (name, count) {
                var native = mathNative(mathKey(name, count));
                return isFloat && native !== undefined ? function () { return r(native.apply(null, arguments)); } : native;
            };
            table.Ceiling = viaMath('Ceiling', 1);
            table.Floor = viaMath('Floor', 1);
            table.Truncate = viaMath('Truncate', 1);
            var rounding = function (suffix) {
                var native = mathNative('Round(' + mathKeyword + suffix + ')');
                return function () {
                    var result = native.apply(null, arguments);
                    return isFloat ? r(result) : result;
                };
            };
            var roundings = [rounding(''), rounding(', int'), rounding(', int, MidpointRounding')];
            table.Round = function () { return roundings[arguments.length - 1].apply(null, arguments); };
            table.RoundMode = rounding(', MidpointRounding');
            if (isFloat) {
                var unary = { Sqrt: Math.sqrt, Cbrt: Math.cbrt, Exp: Math.exp, Log10: Math.log10, Log2: Math.log2, Sin: Math.sin,
                              Cos: Math.cos, Tan: Math.tan, Asin: Math.asin, Acos: Math.acos, Atan: Math.atan, Sinh: Math.sinh,
                              Cosh: Math.cosh, Tanh: Math.tanh, Asinh: Math.asinh, Acosh: Math.acosh, Atanh: Math.atanh };
                Object.keys(unary).forEach(function (name) {
                    var fn = unary[name];
                    table[name] = function (x) { return r(fn(x)); };
                });
                table.Exp10 = function (x) { return r(Math.pow(10, x)); };
                table.Exp2 = function (x) { return r(Math.pow(2, x)); };
                table.Log = function (x, newBase) {
                    if (arguments.length === 1)
                        return r(Math.log(x));
                    return r(mathNative('Log(double, double)')(x, newBase));
                };
                table.Pow = function (x, y) { return r(mathNative('Pow(double, double)')(x, y)); };
                table.Hypot = function (x, y) { return r(Math.hypot(x, y)); };
                table.RootN = function (x, n) {
                    if (n % 2 !== 0 && x < 0)
                        return r(-Math.pow(-x, 1 / n));
                    return r(Math.pow(x, 1 / n));
                };
                table.Atan2 = function (y, x) { return r(Math.atan2(y, x)); };
                table.FusedMultiplyAdd = function (x, y, z) { return r(x * y + z); };
                table.Ieee754Remainder = function (x, y) { return r(mathNative('IEEERemainder(double, double)')(x, y)); };
                table.ILogB = mathNative('ILogB(double)');
                table.ScaleB = function (x, n) { return r(mathNative('ScaleB(double, int)')(x, n)); };
                table.get_Epsilon = function () { return kind === 'f32' ? 1.401298464324817e-45 : Number.MIN_VALUE; };
                table.get_NaN = function () { return NaN; };
                table.get_NegativeInfinity = function () { return -Infinity; };
                table.get_PositiveInfinity = function () { return Infinity; };
                table.get_NegativeZero = function () { return -0; };
                table.IsPow2 = function (x) {
                    if (!(x > 0) || !isFinite(x))
                        return false;
                    var exponent = Math.floor(Math.log2(x));
                    return Math.pow(2, exponent) === x || Math.pow(2, exponent + 1) === x;
                };
            }
        }
        return table;
    }

    // MaxMagnitude and MinMagnitude: by the absolute value; equal ones -
    // the positive (for Max) or the negative (for Min).
    function magnitude(a, isFloat, x, y, max) {
        if (isFloat && (x !== x || y !== y))
            return x !== x ? x : y;
        var ax = a.isNeg(x) ? a.neg(x) : x, ay = a.isNeg(y) ? a.neg(y) : y;
        // The minimum of a signed integer stays negative: the largest magnitude.
        if (!isFloat && a.isNeg(ax))
            return max ? x : y;
        if (!isFloat && a.isNeg(ay))
            return max ? y : x;
        var order = a.cmp(ax, ay);
        if (order === 0)
            return max ? (a.isNeg(x) ? y : x) : (a.isNeg(x) ? x : y);
        return (order > 0) === max ? x : y;
    }

    var memberTables = Object.create(null);

    // A member of generic math of a numeric type by its C# name, or null;
    // jsName tells Round(x, digits) from Round(x, mode).
    CS.numericMember = function (type, name, jsName) {
        var kind = KINDS[type.$name];
        if (kind === undefined || name === undefined)
            return null;
        var table = memberTables[type.$name] || (memberTables[type.$name] = members(kind));
        if (name === 'Round' && /MidpointRounding/.test(jsName || '') && !/Int32/.test(jsName || ''))
            name = 'RoundMode';
        var member = table[name];
        return typeof member === 'function' ? member : null;
    };
})(globalThis);
