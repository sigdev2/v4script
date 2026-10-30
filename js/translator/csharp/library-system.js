// C#: the System library - sources in C#, natives in natives-system.js. A
// type is parsed when it is first looked up and translated when it is
// first used.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    if (CS.library.units['system.core/Object'])
        return;

    CS.addLibrary('system.core', String.raw`
namespace System;

[V4Primitive("object")]
public class Object
{
    public Object() { }
    public virtual extern bool Equals(object obj);
    public static bool Equals(object objA, object objB)
    {
        if (objA == objB)
            return true;
        if (objA == null || objB == null)
            return false;
        return objA.Equals(objB);
    }
    public static extern bool ReferenceEquals(object objA, object objB);
    public virtual extern int GetHashCode();
    public virtual extern string ToString();
    public extern Type GetType();
    protected extern object MemberwiseClone();
}

public abstract class ValueType
{
    protected ValueType() { }
    public override extern bool Equals(object obj);
    public override extern int GetHashCode();
    public override extern string ToString();
}

public abstract class Enum : ValueType, IComparable, IFormattable
{
    protected Enum() { }
    public extern bool HasFlag(Enum flag);
    public extern int CompareTo(object target);
    public override extern bool Equals(object obj);
    public override extern int GetHashCode();
    public override extern string ToString();
    public extern string ToString(string format);
    public extern string ToString(string format, IFormatProvider provider);
    public static extern TEnum Parse<TEnum>(string value) where TEnum : struct;
    public static extern TEnum Parse<TEnum>(string value, bool ignoreCase) where TEnum : struct;
    public static extern object Parse(Type enumType, string value);
    public static extern bool TryParse<TEnum>(string value, out TEnum result) where TEnum : struct;
    public static extern bool TryParse<TEnum>(string value, bool ignoreCase, out TEnum result) where TEnum : struct;
    public static extern TEnum[] GetValues<TEnum>() where TEnum : struct;
    public static extern Array GetValues(Type enumType);
    public static extern string[] GetNames<TEnum>() where TEnum : struct;
    public static extern string[] GetNames(Type enumType);
    public static extern string GetName<TEnum>(TEnum value) where TEnum : struct;
    public static extern string GetName(Type enumType, object value);
    public static extern Type GetUnderlyingType(Type enumType);
    public static extern object ToObject(Type enumType, object value);
    public static extern object ToObject(Type enumType, int value);
    public static extern bool IsDefined<TEnum>(TEnum value) where TEnum : struct;
    public static extern bool IsDefined(Type enumType, object value);
    public static extern string Format(Type enumType, object value, string format);
}

public struct Void { }

public interface IFormatProvider
{
    object GetFormat(Type formatType);
}

public interface IFormattable
{
    string ToString(string format, IFormatProvider formatProvider);
}

public interface IComparable
{
    int CompareTo(object obj);
}

public interface IComparable<in T>
{
    int CompareTo(T other);
}

public interface IEquatable<T>
{
    bool Equals(T other);
}

public interface ICloneable
{
    object Clone();
}

public interface IDisposable
{
    void Dispose();
}

public interface IAsyncDisposable
{
    System.Threading.Tasks.ValueTask DisposeAsync();
}

public interface IConvertible { }

public interface ISpanFormattable : IFormattable { }

[V4Primitive("boolean")]
public readonly struct Boolean : IComparable, IComparable<bool>, IEquatable<bool>, IConvertible
{
    public static readonly string TrueString = "True";
    public static readonly string FalseString = "False";
    public extern int CompareTo(object obj);
    public extern int CompareTo(bool value);
    public extern bool Equals(bool obj);
    public override extern bool Equals(object obj);
    public override extern int GetHashCode();
    public override extern string ToString();
    public extern string ToString(IFormatProvider provider);
    public static extern bool Parse(string value);
    public static extern bool TryParse(string value, out bool result);
}

[V4Primitive("value")]
public readonly struct Char : IComparable, IComparable<char>, IEquatable<char>, IConvertible
{
    public const char MaxValue = '￿';
    public const char MinValue = '\0';
    public extern int CompareTo(object value);
    public extern int CompareTo(char value);
    public extern bool Equals(char obj);
    public override extern bool Equals(object obj);
    public override extern int GetHashCode();
    public override extern string ToString();
    public static extern string ToString(char c);
    public static extern char Parse(string s);
    public static extern bool TryParse(string s, out char result);
    public static extern bool IsDigit(char c);
    public static extern bool IsDigit(string s, int index);
    public static extern bool IsLetter(char c);
    public static extern bool IsLetter(string s, int index);
    public static extern bool IsLetterOrDigit(char c);
    public static extern bool IsLetterOrDigit(string s, int index);
    public static extern bool IsUpper(char c);
    public static extern bool IsUpper(string s, int index);
    public static extern bool IsLower(char c);
    public static extern bool IsLower(string s, int index);
    public static extern bool IsWhiteSpace(char c);
    public static extern bool IsWhiteSpace(string s, int index);
    public static extern bool IsPunctuation(char c);
    public static extern bool IsSymbol(char c);
    public static extern bool IsControl(char c);
    public static extern bool IsSeparator(char c);
    public static extern bool IsNumber(char c);
    public static extern bool IsSurrogate(char c);
    public static extern bool IsHighSurrogate(char c);
    public static extern bool IsLowSurrogate(char c);
    public static extern bool IsAscii(char c);
    public static extern bool IsAsciiDigit(char c);
    public static extern bool IsAsciiLetter(char c);
    public static extern bool IsAsciiLetterOrDigit(char c);
    public static extern bool IsAsciiHexDigit(char c);
    public static extern bool IsAsciiLetterLower(char c);
    public static extern bool IsAsciiLetterUpper(char c);
    public static extern bool IsBetween(char c, char minInclusive, char maxInclusive);
    public static extern char ToUpper(char c);
    public static extern char ToLower(char c);
    public static extern char ToUpperInvariant(char c);
    public static extern char ToLowerInvariant(char c);
    public static extern double GetNumericValue(char c);
    public static extern string ConvertFromUtf32(int utf32);
    public static extern int ConvertToUtf32(char highSurrogate, char lowSurrogate);
    public static extern int ConvertToUtf32(string s, int index);
}

[V4Primitive("value")]
public readonly struct SByte : IComparable, IComparable<sbyte>, IEquatable<sbyte>, IFormattable, IConvertible
{
    public const sbyte MaxValue = 127;
    public const sbyte MinValue = -128;
    public extern int CompareTo(object obj);
    public extern int CompareTo(sbyte value);
    public extern bool Equals(sbyte obj);
    public override extern bool Equals(object obj);
    public override extern int GetHashCode();
    public override extern string ToString();
    public extern string ToString(string format);
    public extern string ToString(IFormatProvider provider);
    public extern string ToString(string format, IFormatProvider provider);
    public static extern sbyte Parse(string s);
    public static extern sbyte Parse(string s, IFormatProvider provider);
    public static extern bool TryParse(string s, out sbyte result);
}

[V4Primitive("value")]
public readonly struct Byte : IComparable, IComparable<byte>, IEquatable<byte>, IFormattable, IConvertible
{
    public const byte MaxValue = 255;
    public const byte MinValue = 0;
    public extern int CompareTo(object obj);
    public extern int CompareTo(byte value);
    public extern bool Equals(byte obj);
    public override extern bool Equals(object obj);
    public override extern int GetHashCode();
    public override extern string ToString();
    public extern string ToString(string format);
    public extern string ToString(IFormatProvider provider);
    public extern string ToString(string format, IFormatProvider provider);
    public static extern byte Parse(string s);
    public static extern byte Parse(string s, IFormatProvider provider);
    public static extern bool TryParse(string s, out byte result);
}

[V4Primitive("value")]
public readonly struct Int16 : IComparable, IComparable<short>, IEquatable<short>, IFormattable, IConvertible
{
    public const short MaxValue = 32767;
    public const short MinValue = -32768;
    public extern int CompareTo(object obj);
    public extern int CompareTo(short value);
    public extern bool Equals(short obj);
    public override extern bool Equals(object obj);
    public override extern int GetHashCode();
    public override extern string ToString();
    public extern string ToString(string format);
    public extern string ToString(IFormatProvider provider);
    public extern string ToString(string format, IFormatProvider provider);
    public static extern short Parse(string s);
    public static extern short Parse(string s, IFormatProvider provider);
    public static extern bool TryParse(string s, out short result);
}

[V4Primitive("value")]
public readonly struct UInt16 : IComparable, IComparable<ushort>, IEquatable<ushort>, IFormattable, IConvertible
{
    public const ushort MaxValue = 65535;
    public const ushort MinValue = 0;
    public extern int CompareTo(object obj);
    public extern int CompareTo(ushort value);
    public extern bool Equals(ushort obj);
    public override extern bool Equals(object obj);
    public override extern int GetHashCode();
    public override extern string ToString();
    public extern string ToString(string format);
    public extern string ToString(IFormatProvider provider);
    public extern string ToString(string format, IFormatProvider provider);
    public static extern ushort Parse(string s);
    public static extern ushort Parse(string s, IFormatProvider provider);
    public static extern bool TryParse(string s, out ushort result);
}

[V4Primitive("number")]
public readonly struct Int32 : IComparable, IComparable<int>, IEquatable<int>, IFormattable, IConvertible, ISpanFormattable
{
    public const int MaxValue = 2147483647;
    public const int MinValue = -2147483648;
    public extern int CompareTo(object value);
    public extern int CompareTo(int value);
    public extern bool Equals(int obj);
    public override extern bool Equals(object obj);
    public override extern int GetHashCode();
    public override extern string ToString();
    public extern string ToString(string format);
    public extern string ToString(IFormatProvider provider);
    public extern string ToString(string format, IFormatProvider provider);
    public static extern int Parse(string s);
    public static extern int Parse(string s, IFormatProvider provider);
    public static extern int Parse(string s, System.Globalization.NumberStyles style);
    public static extern int Parse(string s, System.Globalization.NumberStyles style, IFormatProvider provider);
    public static extern bool TryParse(string s, out int result);
    public static extern bool TryParse(string s, IFormatProvider provider, out int result);
    public static extern bool TryParse(string s, System.Globalization.NumberStyles style, IFormatProvider provider, out int result);
    public static int Max(int x, int y) => x >= y ? x : y;
    public static int Min(int x, int y) => x <= y ? x : y;
    public static int Abs(int value) => Math.Abs(value);
    public static int Clamp(int value, int min, int max) => Math.Clamp(value, min, max);
    public static int Sign(int value) => Math.Sign(value);
    public static bool IsEvenInteger(int value) => (value & 1) == 0;
    public static bool IsOddInteger(int value) => (value & 1) != 0;
    public static bool IsPow2(int value) => value > 0 && (value & (value - 1)) == 0;
    public static bool IsNegative(int value) => value < 0;
    public static bool IsPositive(int value) => value >= 0;
    public static extern int PopCount(int value);
    public static extern int LeadingZeroCount(int value);
    public static extern int TrailingZeroCount(int value);
    public static extern int Log2(int value);
    public static extern int RotateLeft(int value, int rotateAmount);
    public static extern int RotateRight(int value, int rotateAmount);
}

[V4Primitive("value")]
public readonly struct UInt32 : IComparable, IComparable<uint>, IEquatable<uint>, IFormattable, IConvertible
{
    public const uint MaxValue = 4294967295;
    public const uint MinValue = 0;
    public extern int CompareTo(object obj);
    public extern int CompareTo(uint value);
    public extern bool Equals(uint obj);
    public override extern bool Equals(object obj);
    public override extern int GetHashCode();
    public override extern string ToString();
    public extern string ToString(string format);
    public extern string ToString(IFormatProvider provider);
    public extern string ToString(string format, IFormatProvider provider);
    public static extern uint Parse(string s);
    public static extern uint Parse(string s, IFormatProvider provider);
    public static extern bool TryParse(string s, out uint result);
    public static extern uint PopCount(uint value);
    public static extern uint LeadingZeroCount(uint value);
    public static extern uint TrailingZeroCount(uint value);
    public static extern uint RotateLeft(uint value, int rotateAmount);
    public static extern uint RotateRight(uint value, int rotateAmount);
}

[V4Primitive("value")]
public readonly struct Int64 : IComparable, IComparable<long>, IEquatable<long>, IFormattable, IConvertible
{
    public const long MaxValue = 9223372036854775807;
    public const long MinValue = -9223372036854775808;
    public extern int CompareTo(object obj);
    public extern int CompareTo(long value);
    public extern bool Equals(long obj);
    public override extern bool Equals(object obj);
    public override extern int GetHashCode();
    public override extern string ToString();
    public extern string ToString(string format);
    public extern string ToString(IFormatProvider provider);
    public extern string ToString(string format, IFormatProvider provider);
    public static extern long Parse(string s);
    public static extern long Parse(string s, IFormatProvider provider);
    public static extern long Parse(string s, System.Globalization.NumberStyles style);
    public static extern bool TryParse(string s, out long result);
    public static long Max(long x, long y) => x >= y ? x : y;
    public static long Min(long x, long y) => x <= y ? x : y;
    public static long Abs(long value) => Math.Abs(value);
    public static extern long PopCount(long value);
    public static extern long LeadingZeroCount(long value);
    public static extern long TrailingZeroCount(long value);
    public static extern long RotateLeft(long value, int rotateAmount);
    public static extern long RotateRight(long value, int rotateAmount);
}

[V4Primitive("value")]
public readonly struct UInt64 : IComparable, IComparable<ulong>, IEquatable<ulong>, IFormattable, IConvertible
{
    public const ulong MaxValue = 18446744073709551615;
    public const ulong MinValue = 0;
    public extern int CompareTo(object obj);
    public extern int CompareTo(ulong value);
    public extern bool Equals(ulong obj);
    public override extern bool Equals(object obj);
    public override extern int GetHashCode();
    public override extern string ToString();
    public extern string ToString(string format);
    public extern string ToString(IFormatProvider provider);
    public extern string ToString(string format, IFormatProvider provider);
    public static extern ulong Parse(string s);
    public static extern ulong Parse(string s, IFormatProvider provider);
    public static extern bool TryParse(string s, out ulong result);
    public static extern ulong PopCount(ulong value);
    public static extern ulong LeadingZeroCount(ulong value);
    public static extern ulong TrailingZeroCount(ulong value);
}

[V4Primitive("value")]
public readonly struct Single : IComparable, IComparable<float>, IEquatable<float>, IFormattable, IConvertible
{
    public const float MaxValue = 3.40282347E+38f;
    public const float MinValue = -3.40282347E+38f;
    public const float Epsilon = 1.401298E-45f;
    public const float NaN = 0f / 0f;
    public const float PositiveInfinity = 1f / 0f;
    public const float NegativeInfinity = -1f / 0f;
    public const float Pi = 3.14159265f;
    public const float E = 2.71828183f;
    public extern int CompareTo(object value);
    public extern int CompareTo(float value);
    public extern bool Equals(float obj);
    public override extern bool Equals(object obj);
    public override extern int GetHashCode();
    public override extern string ToString();
    public extern string ToString(string format);
    public extern string ToString(IFormatProvider provider);
    public extern string ToString(string format, IFormatProvider provider);
    public static extern float Parse(string s);
    public static extern float Parse(string s, IFormatProvider provider);
    public static extern bool TryParse(string s, out float result);
    public static extern bool TryParse(string s, System.Globalization.NumberStyles style, IFormatProvider provider, out float result);
    public static extern bool IsNaN(float f);
    public static extern bool IsInfinity(float f);
    public static extern bool IsPositiveInfinity(float f);
    public static extern bool IsNegativeInfinity(float f);
    public static extern bool IsFinite(float f);
    public static extern bool IsNegative(float f);
    public static extern bool IsInteger(float f);
}

[V4Primitive("value")]
public readonly struct Double : IComparable, IComparable<double>, IEquatable<double>, IFormattable, IConvertible
{
    public const double MaxValue = 1.7976931348623157E+308;
    public const double MinValue = -1.7976931348623157E+308;
    public const double Epsilon = 4.94065645841247E-324;
    public const double NaN = 0.0 / 0.0;
    public const double PositiveInfinity = 1.0 / 0.0;
    public const double NegativeInfinity = -1.0 / 0.0;
    public const double Pi = 3.14159265358979323846;
    public const double E = 2.7182818284590452354;
    public const double Tau = 6.28318530717958647692;
    public extern int CompareTo(object value);
    public extern int CompareTo(double value);
    public extern bool Equals(double obj);
    public override extern bool Equals(object obj);
    public override extern int GetHashCode();
    public override extern string ToString();
    public extern string ToString(string format);
    public extern string ToString(IFormatProvider provider);
    public extern string ToString(string format, IFormatProvider provider);
    public static extern double Parse(string s);
    public static extern double Parse(string s, IFormatProvider provider);
    public static extern double Parse(string s, System.Globalization.NumberStyles style);
    public static extern double Parse(string s, System.Globalization.NumberStyles style, IFormatProvider provider);
    public static extern bool TryParse(string s, out double result);
    public static extern bool TryParse(string s, IFormatProvider provider, out double result);
    public static extern bool TryParse(string s, System.Globalization.NumberStyles style, IFormatProvider provider, out double result);
    public static extern bool IsNaN(double d);
    public static extern bool IsInfinity(double d);
    public static extern bool IsPositiveInfinity(double d);
    public static extern bool IsNegativeInfinity(double d);
    public static extern bool IsFinite(double d);
    public static extern bool IsNegative(double d);
    public static extern bool IsInteger(double d);
    public static extern bool IsNormal(double d);
    public static extern bool IsSubnormal(double d);
    public static double Max(double x, double y) => Math.Max(x, y);
    public static double Min(double x, double y) => Math.Min(x, y);
    public static double Abs(double value) => Math.Abs(value);
    public static double Sqrt(double x) => Math.Sqrt(x);
    public static double Round(double x) => Math.Round(x);
    public static double Floor(double x) => Math.Floor(x);
    public static double Ceiling(double x) => Math.Ceiling(x);
    public static double Truncate(double x) => Math.Truncate(x);
    public static double Clamp(double value, double min, double max) => Math.Clamp(value, min, max);
    public static double Pow(double x, double y) => Math.Pow(x, y);
}

[V4Primitive("value")]
public readonly struct Decimal : IComparable, IComparable<decimal>, IEquatable<decimal>, IFormattable, IConvertible
{
    public const decimal MaxValue = 79228162514264337593543950335m;
    public const decimal MinValue = -79228162514264337593543950335m;
    public const decimal One = 1m;
    public const decimal Zero = 0m;
    public const decimal MinusOne = -1m;
    public extern Decimal(int lo, int mid, int hi, bool isNegative, byte scale);
    public extern Decimal(int value);
    public extern Decimal(long value);
    public extern Decimal(double value);
    public extern int CompareTo(object value);
    public extern int CompareTo(decimal value);
    public extern bool Equals(decimal value);
    public override extern bool Equals(object value);
    public override extern int GetHashCode();
    public override extern string ToString();
    public extern string ToString(string format);
    public extern string ToString(IFormatProvider provider);
    public extern string ToString(string format, IFormatProvider provider);
    public byte Scale => GetScale(this);
    private static extern byte GetScale(decimal value);
    public static extern decimal Parse(string s);
    public static extern decimal Parse(string s, IFormatProvider provider);
    public static extern decimal Parse(string s, System.Globalization.NumberStyles style);
    public static extern decimal Parse(string s, System.Globalization.NumberStyles style, IFormatProvider provider);
    public static extern bool TryParse(string s, out decimal result);
    public static extern bool TryParse(string s, System.Globalization.NumberStyles style, IFormatProvider provider, out decimal result);
    public static decimal Add(decimal d1, decimal d2) => d1 + d2;
    public static decimal Subtract(decimal d1, decimal d2) => d1 - d2;
    public static decimal Multiply(decimal d1, decimal d2) => d1 * d2;
    public static decimal Divide(decimal d1, decimal d2) => d1 / d2;
    public static decimal Remainder(decimal d1, decimal d2) => d1 % d2;
    public static decimal Negate(decimal d) => -d;
    public static extern decimal Round(decimal d);
    public static extern decimal Round(decimal d, int decimals);
    public static extern decimal Round(decimal d, MidpointRounding mode);
    public static extern decimal Round(decimal d, int decimals, MidpointRounding mode);
    public static extern decimal Truncate(decimal d);
    public static extern decimal Floor(decimal d);
    public static extern decimal Ceiling(decimal d);
    public static extern int[] GetBits(decimal d);
    public static int Compare(decimal d1, decimal d2) => d1.CompareTo(d2);
    public static double ToDouble(decimal d) => (double)d;
    public static int ToInt32(decimal d) => (int)d;
    public static long ToInt64(decimal d) => (long)d;
    public static decimal Abs(decimal value) => Math.Abs(value);
    public static decimal Max(decimal x, decimal y) => Math.Max(x, y);
    public static decimal Min(decimal x, decimal y) => Math.Min(x, y);
}

public enum MidpointRounding
{
    ToEven = 0,
    AwayFromZero = 1,
    ToZero = 2,
    ToNegativeInfinity = 3,
    ToPositiveInfinity = 4
}

public enum StringComparison
{
    CurrentCulture = 0,
    CurrentCultureIgnoreCase = 1,
    InvariantCulture = 2,
    InvariantCultureIgnoreCase = 3,
    Ordinal = 4,
    OrdinalIgnoreCase = 5
}

[Flags]
public enum StringSplitOptions
{
    None = 0,
    RemoveEmptyEntries = 1,
    TrimEntries = 2
}

public enum TypeCode
{
    Empty = 0, Object = 1, DBNull = 2, Boolean = 3, Char = 4, SByte = 5, Byte = 6, Int16 = 7, UInt16 = 8, Int32 = 9,
    UInt32 = 10, Int64 = 11, UInt64 = 12, Single = 13, Double = 14, Decimal = 15, DateTime = 16, String = 18
}

[V4Primitive("string")]
public sealed class String : IComparable, IComparable<string>, IEquatable<string>, ICloneable, IConvertible,
    System.Collections.Generic.IEnumerable<char>, System.Collections.IEnumerable
{
    public static readonly string Empty = "";
    private String() { }
    public extern String(char c, int count);
    public extern String(char[] value);
    public extern String(char[] value, int startIndex, int length);
    public extern int Length { get; }
    [System.Runtime.CompilerServices.IndexerName("Chars")]
    public extern char this[int index] { get; }
    public override extern bool Equals(object obj);
    public extern bool Equals(string value);
    public extern bool Equals(string value, StringComparison comparisonType);
    public static extern bool Equals(string a, string b);
    public static extern bool Equals(string a, string b, StringComparison comparisonType);
    public override extern int GetHashCode();
    public override extern string ToString();
    public extern object Clone();
    public extern int CompareTo(object value);
    public extern int CompareTo(string strB);
    public static extern int Compare(string strA, string strB);
    public static extern int Compare(string strA, string strB, bool ignoreCase);
    public static extern int Compare(string strA, string strB, StringComparison comparisonType);
    public static extern int Compare(string strA, int indexA, string strB, int indexB, int length);
    public static extern int CompareOrdinal(string strA, string strB);
    public static extern bool IsNullOrEmpty(string value);
    public static extern bool IsNullOrWhiteSpace(string value);
    public static extern string Concat(object arg0);
    public static extern string Concat(object arg0, object arg1);
    public static extern string Concat(object arg0, object arg1, object arg2);
    public static extern string Concat(params object[] args);
    public static extern string Concat(string str0, string str1);
    public static extern string Concat(string str0, string str1, string str2);
    public static extern string Concat(string str0, string str1, string str2, string str3);
    public static extern string Concat(params string[] values);
    public static string Concat<T>(System.Collections.Generic.IEnumerable<T> values)
    {
        var builder = new System.Text.StringBuilder();
        foreach (var value in values)
            builder.Append(value?.ToString());
        return builder.ToString();
    }
    public static extern string Join(string separator, params string[] value);
    public static extern string Join(string separator, params object[] values);
    public static extern string Join(char separator, params string[] value);
    public static extern string Join(char separator, params object[] values);
    public static extern string Join(string separator, string[] value, int startIndex, int count);
    public static string Join(string separator, System.Collections.Generic.IEnumerable<string> values)
    {
        var builder = new System.Text.StringBuilder();
        bool first = true;
        foreach (var value in values)
        {
            if (!first)
                builder.Append(separator);
            builder.Append(value);
            first = false;
        }
        return builder.ToString();
    }
    public static string Join<T>(string separator, System.Collections.Generic.IEnumerable<T> values)
    {
        var builder = new System.Text.StringBuilder();
        bool first = true;
        foreach (var value in values)
        {
            if (!first)
                builder.Append(separator);
            if (value != null)
                builder.Append(value.ToString());
            first = false;
        }
        return builder.ToString();
    }
    public static string Join<T>(char separator, System.Collections.Generic.IEnumerable<T> values) => Join(separator.ToString(), values);
    public static extern string Format(string format, object arg0);
    public static extern string Format(string format, object arg0, object arg1);
    public static extern string Format(string format, object arg0, object arg1, object arg2);
    public static extern string Format(string format, params object[] args);
    public static extern string Format(IFormatProvider provider, string format, params object[] args);
    public extern bool Contains(string value);
    public extern bool Contains(char value);
    public extern bool Contains(string value, StringComparison comparisonType);
    public extern bool Contains(char value, StringComparison comparisonType);
    public extern bool StartsWith(string value);
    public extern bool StartsWith(char value);
    public extern bool StartsWith(string value, StringComparison comparisonType);
    public extern bool StartsWith(string value, bool ignoreCase, System.Globalization.CultureInfo culture);
    public extern bool EndsWith(string value);
    public extern bool EndsWith(char value);
    public extern bool EndsWith(string value, StringComparison comparisonType);
    public extern int IndexOf(char value);
    public extern int IndexOf(char value, int startIndex);
    public extern int IndexOf(char value, int startIndex, int count);
    public extern int IndexOf(string value);
    public extern int IndexOf(string value, int startIndex);
    public extern int IndexOf(string value, int startIndex, int count);
    public extern int IndexOf(string value, StringComparison comparisonType);
    public extern int IndexOf(string value, int startIndex, StringComparison comparisonType);
    public extern int IndexOf(char value, StringComparison comparisonType);
    public extern int IndexOfAny(char[] anyOf);
    public extern int IndexOfAny(char[] anyOf, int startIndex);
    public extern int IndexOfAny(char[] anyOf, int startIndex, int count);
    public extern int LastIndexOf(char value);
    public extern int LastIndexOf(char value, int startIndex);
    public extern int LastIndexOf(string value);
    public extern int LastIndexOf(string value, int startIndex);
    public extern int LastIndexOf(string value, StringComparison comparisonType);
    public extern int LastIndexOfAny(char[] anyOf);
    public extern string Substring(int startIndex);
    public extern string Substring(int startIndex, int length);
    public extern string[] Split(char separator, StringSplitOptions options = StringSplitOptions.None);
    public extern string[] Split(char separator, int count, StringSplitOptions options = StringSplitOptions.None);
    public extern string[] Split(params char[] separator);
    public extern string[] Split(char[] separator, int count);
    public extern string[] Split(char[] separator, StringSplitOptions options);
    public extern string[] Split(char[] separator, int count, StringSplitOptions options);
    public extern string[] Split(string separator, StringSplitOptions options = StringSplitOptions.None);
    public extern string[] Split(string separator, int count, StringSplitOptions options = StringSplitOptions.None);
    public extern string[] Split(string[] separator, StringSplitOptions options);
    public extern string[] Split(string[] separator, int count, StringSplitOptions options);
    public extern string Replace(char oldChar, char newChar);
    public extern string Replace(string oldValue, string newValue);
    public extern string Replace(string oldValue, string newValue, StringComparison comparisonType);
    public extern string Insert(int startIndex, string value);
    public extern string Remove(int startIndex);
    public extern string Remove(int startIndex, int count);
    public extern string ToUpper();
    public extern string ToLower();
    public extern string ToUpperInvariant();
    public extern string ToLowerInvariant();
    public extern string ToUpper(System.Globalization.CultureInfo culture);
    public extern string ToLower(System.Globalization.CultureInfo culture);
    public extern string Trim();
    public extern string Trim(char trimChar);
    public extern string Trim(params char[] trimChars);
    public extern string TrimStart();
    public extern string TrimStart(char trimChar);
    public extern string TrimStart(params char[] trimChars);
    public extern string TrimEnd();
    public extern string TrimEnd(char trimChar);
    public extern string TrimEnd(params char[] trimChars);
    public extern string PadLeft(int totalWidth);
    public extern string PadLeft(int totalWidth, char paddingChar);
    public extern string PadRight(int totalWidth);
    public extern string PadRight(int totalWidth, char paddingChar);
    public extern char[] ToCharArray();
    public extern char[] ToCharArray(int startIndex, int length);
    public extern void CopyTo(int sourceIndex, char[] destination, int destinationIndex, int count);
    public extern string Normalize();
    public extern bool IsNormalized();
    public static extern string Copy(string str);
    public static extern string Intern(string str);
    public CharEnumerator GetEnumerator() => new CharEnumerator(this);
    System.Collections.Generic.IEnumerator<char> System.Collections.Generic.IEnumerable<char>.GetEnumerator() => new CharEnumerator(this);
    System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => new CharEnumerator(this);
    public extern TypeCode GetTypeCode();
    public static extern string Create(int length, char c);
}

public sealed class CharEnumerator : System.Collections.Generic.IEnumerator<char>, System.Collections.IEnumerator, IDisposable, ICloneable
{
    private string _str;
    private int _index = -1;
    internal CharEnumerator(string str) { _str = str; }
    public object Clone() => MemberwiseClone();
    public bool MoveNext()
    {
        if (_index < _str.Length - 1)
        {
            _index++;
            return true;
        }
        _index = _str.Length;
        return false;
    }
    public void Dispose() { }
    object System.Collections.IEnumerator.Current => Current;
    public char Current
    {
        get
        {
            if (_index == -1)
                throw new InvalidOperationException("Enumeration has not started. Call MoveNext.");
            if (_index >= _str.Length)
                throw new InvalidOperationException("Enumeration already finished.");
            return _str[_index];
        }
    }
    public void Reset() { _index = -1; }
}

// The enumerator of T[] through IEnumerable<T> and IEnumerable.
internal sealed class SZGenericArrayEnumerator<T> : System.Collections.Generic.IEnumerator<T>
{
    private readonly T[] _array;
    private int _index;
    internal SZGenericArrayEnumerator(T[] array)
    {
        _array = array;
        _index = -1;
    }
    public bool MoveNext()
    {
        int index = _index + 1;
        if (index >= _array.Length)
        {
            _index = _array.Length;
            return false;
        }
        _index = index;
        return true;
    }
    public T Current
    {
        get
        {
            if (_index < 0)
                throw new InvalidOperationException("Enumeration has not started. Call MoveNext.");
            if (_index >= _array.Length)
                throw new InvalidOperationException("Enumeration already finished.");
            return _array[_index];
        }
    }
    object System.Collections.IEnumerator.Current => Current;
    void System.Collections.IEnumerator.Reset() => _index = -1;
    public void Dispose() { }
}

[V4Primitive("array")]
public abstract class Array : ICloneable, System.Collections.IList, System.Collections.ICollection, System.Collections.IEnumerable
{
    protected Array() { }
    public extern int Length { get; }
    public extern long LongLength { get; }
    public extern int Rank { get; }
    public extern int GetLength(int dimension);
    public extern int GetUpperBound(int dimension);
    public extern int GetLowerBound(int dimension);
    public extern object GetValue(int index);
    public extern object GetValue(params int[] indices);
    public extern void SetValue(object value, int index);
    public extern void SetValue(object value, params int[] indices);
    public extern object Clone();
    public extern void CopyTo(Array array, int index);
    public extern System.Collections.IEnumerator GetEnumerator();
    extern int System.Collections.ICollection.Count { get; }
    extern object System.Collections.IList.this[int index] { get; set; }
    extern int System.Collections.IList.Add(object value);
    extern bool System.Collections.IList.Contains(object value);
    extern int System.Collections.IList.IndexOf(object value);
    extern void System.Collections.IList.Clear();
    public bool IsReadOnly => false;
    public bool IsFixedSize => true;
    public static extern T[] Empty<T>();
    public static extern void Sort(Array array);
    public static extern void Sort<T>(T[] array);
    public static extern void Sort<T>(T[] array, Comparison<T> comparison);
    public static extern void Sort<T>(T[] array, System.Collections.Generic.IComparer<T> comparer);
    public static extern void Sort<T>(T[] array, int index, int length);
    public static extern void Sort<T>(T[] array, int index, int length, System.Collections.Generic.IComparer<T> comparer);
    public static extern void Sort<TKey, TValue>(TKey[] keys, TValue[] items);
    public static extern void Reverse(Array array);
    public static extern void Reverse(Array array, int index, int length);
    public static extern void Reverse<T>(T[] array);
    public static extern void Reverse<T>(T[] array, int index, int length);
    public static extern int IndexOf(Array array, object value);
    public static extern int IndexOf<T>(T[] array, T value);
    public static extern int IndexOf<T>(T[] array, T value, int startIndex);
    public static extern int IndexOf<T>(T[] array, T value, int startIndex, int count);
    public static extern int LastIndexOf<T>(T[] array, T value);
    public static extern int LastIndexOf<T>(T[] array, T value, int startIndex);
    public static extern int BinarySearch<T>(T[] array, T value);
    public static extern int BinarySearch<T>(T[] array, T value, System.Collections.Generic.IComparer<T> comparer);
    public static extern int BinarySearch<T>(T[] array, int index, int length, T value);
    public static extern int BinarySearch(Array array, object value);
    public static extern void Copy(Array sourceArray, Array destinationArray, int length);
    public static extern void Copy(Array sourceArray, int sourceIndex, Array destinationArray, int destinationIndex, int length);
    public static extern void Copy(Array sourceArray, Array destinationArray, long length);
    public static extern void ConstrainedCopy(Array sourceArray, int sourceIndex, Array destinationArray, int destinationIndex, int length);
    public static extern void Clear(Array array);
    public static extern void Clear(Array array, int index, int length);
    public static extern void Fill<T>(T[] array, T value);
    public static extern void Fill<T>(T[] array, T value, int startIndex, int count);
    public static extern void Resize<T>(ref T[] array, int newSize);
    public static extern Array CreateInstance(Type elementType, int length);
    public static extern Array CreateInstance(Type elementType, params int[] lengths);
    public static bool Exists<T>(T[] array, Predicate<T> match) => FindIndex(array, match) >= 0;
    public static bool TrueForAll<T>(T[] array, Predicate<T> match)
    {
        foreach (var item in array)
            if (!match(item))
                return false;
        return true;
    }
    public static T Find<T>(T[] array, Predicate<T> match)
    {
        foreach (var item in array)
            if (match(item))
                return item;
        return default(T);
    }
    public static T FindLast<T>(T[] array, Predicate<T> match)
    {
        for (int i = array.Length - 1; i >= 0; i--)
            if (match(array[i]))
                return array[i];
        return default(T);
    }
    public static int FindIndex<T>(T[] array, Predicate<T> match) => FindIndex(array, 0, array.Length, match);
    public static int FindIndex<T>(T[] array, int startIndex, Predicate<T> match) => FindIndex(array, startIndex, array.Length - startIndex, match);
    public static int FindIndex<T>(T[] array, int startIndex, int count, Predicate<T> match)
    {
        if (array == null)
            throw new ArgumentNullException("array");
        if (match == null)
            throw new ArgumentNullException("match");
        for (int i = startIndex; i < startIndex + count; i++)
            if (match(array[i]))
                return i;
        return -1;
    }
    public static int FindLastIndex<T>(T[] array, Predicate<T> match)
    {
        for (int i = array.Length - 1; i >= 0; i--)
            if (match(array[i]))
                return i;
        return -1;
    }
    public static T[] FindAll<T>(T[] array, Predicate<T> match)
    {
        var list = new System.Collections.Generic.List<T>();
        foreach (var item in array)
            if (match(item))
                list.Add(item);
        return list.ToArray();
    }
    public static TOutput[] ConvertAll<TInput, TOutput>(TInput[] array, Converter<TInput, TOutput> converter)
    {
        var result = new TOutput[array.Length];
        for (int i = 0; i < array.Length; i++)
            result[i] = converter(array[i]);
        return result;
    }
    public static void ForEach<T>(T[] array, Action<T> action)
    {
        foreach (var item in array)
            action(item);
    }
    public static System.Collections.ObjectModel.ReadOnlyCollection<T> AsReadOnly<T>(T[] array) =>
        new System.Collections.ObjectModel.ReadOnlyCollection<T>(array);
}

public abstract class Delegate : ICloneable
{
    protected Delegate() { }
    public extern object DynamicInvoke(params object[] args);
    public extern object Target { get; }
    public extern System.Reflection.MethodInfo Method { get; }
    public extern Delegate[] GetInvocationList();
    public extern object Clone();
    public override extern bool Equals(object obj);
    public override extern int GetHashCode();
    public static extern Delegate Combine(Delegate a, Delegate b);
    public static extern Delegate Combine(params Delegate[] delegates);
    public static extern Delegate Remove(Delegate source, Delegate value);
    public static extern Delegate RemoveAll(Delegate source, Delegate value);
}

[V4Primitive("function")]
public abstract class MulticastDelegate : Delegate
{
    protected MulticastDelegate() { }
}

public delegate void Action();
public delegate void Action<in T>(T obj);
public delegate void Action<in T1, in T2>(T1 arg1, T2 arg2);
public delegate void Action<in T1, in T2, in T3>(T1 arg1, T2 arg2, T3 arg3);
public delegate void Action<in T1, in T2, in T3, in T4>(T1 arg1, T2 arg2, T3 arg3, T4 arg4);
public delegate void Action<in T1, in T2, in T3, in T4, in T5>(T1 arg1, T2 arg2, T3 arg3, T4 arg4, T5 arg5);
public delegate void Action<in T1, in T2, in T3, in T4, in T5, in T6>(T1 arg1, T2 arg2, T3 arg3, T4 arg4, T5 arg5, T6 arg6);
public delegate void Action<in T1, in T2, in T3, in T4, in T5, in T6, in T7>(T1 arg1, T2 arg2, T3 arg3, T4 arg4, T5 arg5, T6 arg6, T7 arg7);
public delegate void Action<in T1, in T2, in T3, in T4, in T5, in T6, in T7, in T8>(T1 arg1, T2 arg2, T3 arg3, T4 arg4, T5 arg5, T6 arg6, T7 arg7, T8 arg8);
public delegate TResult Func<out TResult>();
public delegate TResult Func<in T, out TResult>(T arg);
public delegate TResult Func<in T1, in T2, out TResult>(T1 arg1, T2 arg2);
public delegate TResult Func<in T1, in T2, in T3, out TResult>(T1 arg1, T2 arg2, T3 arg3);
public delegate TResult Func<in T1, in T2, in T3, in T4, out TResult>(T1 arg1, T2 arg2, T3 arg3, T4 arg4);
public delegate TResult Func<in T1, in T2, in T3, in T4, in T5, out TResult>(T1 arg1, T2 arg2, T3 arg3, T4 arg4, T5 arg5);
public delegate TResult Func<in T1, in T2, in T3, in T4, in T5, in T6, out TResult>(T1 arg1, T2 arg2, T3 arg3, T4 arg4, T5 arg5, T6 arg6);
public delegate TResult Func<in T1, in T2, in T3, in T4, in T5, in T6, in T7, out TResult>(T1 arg1, T2 arg2, T3 arg3, T4 arg4, T5 arg5, T6 arg6, T7 arg7);
public delegate TResult Func<in T1, in T2, in T3, in T4, in T5, in T6, in T7, in T8, out TResult>(T1 arg1, T2 arg2, T3 arg3, T4 arg4, T5 arg5, T6 arg6, T7 arg7, T8 arg8);
public delegate bool Predicate<in T>(T obj);
public delegate int Comparison<in T>(T x, T y);
public delegate TOutput Converter<in TInput, out TOutput>(TInput input);
public delegate void EventHandler(object sender, EventArgs e);
public delegate void EventHandler<TEventArgs>(object sender, TEventArgs e);

public class EventArgs
{
    public static readonly EventArgs Empty = new EventArgs();
    public EventArgs() { }
}

public struct Nullable<T> where T : struct
{
    public extern bool HasValue { get; }
    public extern T Value { get; }
    public extern T GetValueOrDefault();
    public extern T GetValueOrDefault(T defaultValue);
    public override extern bool Equals(object other);
    public override extern int GetHashCode();
    public override extern string ToString();
}

public static class Nullable
{
    public static extern Type GetUnderlyingType(Type nullableType);
}

public abstract class Attribute
{
    protected Attribute() { }
}

public sealed class FlagsAttribute : Attribute { }
public sealed class ObsoleteAttribute : Attribute
{
    public ObsoleteAttribute() { }
    public ObsoleteAttribute(string message) { }
    public ObsoleteAttribute(string message, bool error) { }
}
public sealed class SerializableAttribute : Attribute { }
public sealed class AttributeUsageAttribute : Attribute
{
    public AttributeUsageAttribute(AttributeTargets validOn) { }
    public bool AllowMultiple { get; set; }
    public bool Inherited { get; set; }
}
public enum AttributeTargets { All = 32767, Class = 4, Method = 64, Property = 128, Field = 256 }
public sealed class V4PrimitiveAttribute : Attribute
{
    public V4PrimitiveAttribute(string kind) { }
}
public sealed class V4FiberAttribute : Attribute { }
public sealed class STAThreadAttribute : Attribute { }
public sealed class ParamArrayAttribute : Attribute { }

public readonly struct Index : IEquatable<Index>
{
    private readonly int _value;
    public Index(int value, bool fromEnd = false)
    {
        if (value < 0)
            throw new ArgumentOutOfRangeException("value", "Non-negative number required.");
        _value = fromEnd ? ~value : value;
    }
    public static Index Start => new Index(0);
    public static Index End => new Index(0, true);
    public int Value => _value < 0 ? ~_value : _value;
    public bool IsFromEnd => _value < 0;
    public static Index FromStart(int value) => new Index(value);
    public static Index FromEnd(int value) => new Index(value, true);
    public int GetOffset(int length) => _value < 0 ? length + _value + 1 : _value;
    public bool Equals(Index other) => _value == other._value;
    public override bool Equals(object value) => value is Index other && _value == other._value;
    public override int GetHashCode() => _value;
    public override string ToString() => IsFromEnd ? "^" + Value.ToString() : Value.ToString();
    public static implicit operator Index(int value) => FromStart(value);
}

public readonly struct Range : IEquatable<Range>
{
    private readonly Index _start;
    private readonly Index _end;
    public Range(Index start, Index end)
    {
        _start = start;
        _end = end;
    }
    public Index Start => _start;
    public Index End => _end;
    public static Range All => new Range(Index.Start, Index.End);
    public static Range StartAt(Index start) => new Range(start, Index.End);
    public static Range EndAt(Index end) => new Range(Index.Start, end);
    public bool Equals(Range other) => _start.Equals(other._start) && _end.Equals(other._end);
    public override bool Equals(object value) => value is Range other && Equals(other);
    public override int GetHashCode() => _start.GetHashCode() * 31 + _end.GetHashCode();
    public override string ToString() => _start.ToString() + ".." + _end.ToString();
}
`);
})(globalThis);
