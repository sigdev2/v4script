// Generic math: INumber<T> and the other interfaces of System.Numerics
// over the numeric types (with their overflow rules), CreateChecked,
// CreateSaturating and CreateTruncating, BigInteger, and an own type
// with operator interfaces.
using System.Numerics;

Console.WriteLine(Sum<int>([1, 2, 3]) + " " + Sum<byte>([200, 100]) + " " + Sum<short>([30000, 30000]) + " " + Sum<uint>([4000000000, 1000000000]) + " " + Sum<ulong>([ulong.MaxValue, 2]));
Console.WriteLine(Sum<float>([0.1f, 0.2f]) + " " + Sum<double>([0.1, 0.2]) + " " + Sum<decimal>([0.1m, 0.2m]) + " " + Sum<char>(['a', (char)1]));
Console.WriteLine(Product<int>([1, 2, 3, 4]) + " " + Product<long>([100000, 100000, 100000, 100000]) + " " + Product<int>([65536, 65536]));
Console.WriteLine(MaxOf<int>([3, 9, 2]) + " " + MaxOf<double>([1.5, -2, 8.25]) + " " + MaxOf<decimal>([1.1m, 0.9m]) + " " + MaxOf<char>(['x', 'b']));
Console.WriteLine(Describe(-5) + Describe(0) + Describe(7L) + Describe(2.5) + Describe(-0.0) + Describe(-3m) + Describe((byte)4));
Console.WriteLine(int.CreateChecked(3.9) + " " + int.CreateSaturating(1e20) + " " + int.CreateSaturating(-1e20) + " " + int.CreateTruncating(300L) + " " + byte.CreateTruncating(300) + " " + byte.CreateSaturating(-5) + " " + sbyte.CreateTruncating(200));
Console.WriteLine(double.CreateChecked(7) + " " + decimal.CreateChecked(2.5) + " " + float.CreateChecked(1L << 40) + " " + long.CreateChecked(12.7m) + " " + ulong.CreateSaturating(-1) + " " + int.CreateSaturating(double.NaN));
try { int.CreateChecked(3e9); } catch (OverflowException e) { Console.WriteLine(e.Message); }
try { byte.CreateChecked(-1); } catch (OverflowException e) { Console.WriteLine(e.Message); }
try { decimal.CreateChecked(double.PositiveInfinity); } catch (OverflowException e) { Console.WriteLine(e.Message); }
Console.WriteLine(Convert<int, double>(5) + " " + Convert<double, int>(7.99) + " " + Convert<long, decimal>(long.MaxValue) + " " + Convert<decimal, float>(1.25m));
Console.WriteLine(int.PopCount(255) + " " + long.PopCount(-1) + " " + int.LeadingZeroCount(1) + " " + uint.TrailingZeroCount(8) + " " + int.Log2(1000) + " " + int.IsPow2(64) + " " + ulong.RotateLeft(1, 65) + " " + byte.RotateRight(1, 1));
Console.WriteLine(Bits<int>(12) + " " + Bits<long>(-1) + " " + Bits<byte>(255) + " " + Bits<ushort>(1));
Console.WriteLine(Clamp<int>(15, 0, 10) + " " + Clamp<double>(-2.5, -1, 1) + " " + Clamp<decimal>(5m, 1m, 3m));
try { Clamp<int>(1, 5, 3); } catch (ArgumentException e) { Console.WriteLine(e.Message); }
Console.WriteLine(int.Abs(-4) + " " + double.Abs(-2.5) + " " + int.Sign(-9) + " " + double.Sign(0.0) + " " + int.Max(3, 4) + " " + double.Min(1, 2) + " " + int.MaxMagnitude(-5, 3) + " " + double.MinMagnitude(-1, 2));
try { int.Abs(int.MinValue); } catch (OverflowException e) { Console.WriteLine(e.Message); }
Console.WriteLine(double.Pi + " " + float.E + " " + double.Tau + " " + double.Sqrt(2) + " " + float.Sqrt(2) + " " + double.Pow(2, 10) + " " + double.Log2(8) + " " + double.Exp10(2) + " " + double.Hypot(3, 4));
Console.WriteLine(Hyp<double>(3, 4) + " " + Hyp<float>(1, 1) + " " + Area<double>(2) + " " + Area<float>(2));
Console.WriteLine(Rounds<double>(2.5) + " " + Rounds<decimal>(2.5m) + " " + Rounds<float>(-1.5f) + " " + double.Round(2.345, 2) + " " + decimal.Round(2.345m, 2, MidpointRounding.AwayFromZero) + " " + double.Floor(-1.5) + " " + decimal.Ceiling(1.2m));
Console.WriteLine(Parse<int>("42") + " " + Parse<double>("2.5") + " " + Parse<decimal>("1.10") + " " + int.IsEvenInteger(4) + " " + double.IsInteger(3.0) + " " + double.IsOddInteger(3.0) + " " + decimal.IsInteger(1.5m) + " " + double.IsNormal(1e-310) + " " + double.IsSubnormal(1e-310));
Console.WriteLine(MinMax<int>() + " " + MinMax<byte>() + " " + MinMax<long>() + " " + MinMax<char>().Length + " " + MinMax<decimal>());
Console.WriteLine(Fib<int>(40) + " " + Fib<long>(80) + " " + Fib<double>(80) + " " + Fib<decimal>(100) + " " + Fib<BigInteger>(100));
var (q, r) = int.DivRem(17, 5);
Console.WriteLine(q + " " + r + " " + DivRemOf<long>(-17, 5) + " " + Increment<int>(int.MaxValue) + " " + Increment<double>(0.5) + " " + Negate<int>(int.MinValue) + " " + Negate<sbyte>(-128));
try { Div<int>(1, 0); } catch (DivideByZeroException e) { Console.WriteLine(e.Message); }
Console.WriteLine(Div<double>(1, 0) + " " + Div<int>(7, 2) + " " + Mod<int>(-7, 3) + " " + Mod<double>(5.5, 2) + " " + Shift<int>(1, 33) + " " + Shift<long>(1, 33) + " " + Shift<byte>(1, 9));
Console.WriteLine(Equal<int>(1, 1) + " " + Equal<double>(double.NaN, double.NaN) + " " + Less<decimal>(1m, 2m) + " " + Less<char>('b', 'a'));
var money = new[] { new Money(1.5m), new Money(2.25m) };
Console.WriteLine(Total(money) + " " + Money.Zero);
Console.WriteLine(Average<int>([1, 2, 4]) + " " + Average<float>([1, 2]) + " " + Average<decimal>([1, 2]));

static T Sum<T>(T[] values) where T : INumberBase<T> { T total = T.Zero; foreach (var v in values) total += v; return total; }
static T Product<T>(T[] values) where T : INumber<T> { T result = T.One; foreach (var v in values) result *= v; return result; }
static T MaxOf<T>(T[] values) where T : INumber<T> { T best = values[0]; foreach (var v in values) best = T.Max(best, v); return best; }
static string Describe<T>(T value) where T : INumber<T> => $"[{value}:{T.Sign(value)}{(T.IsNegative(value) ? "-" : "")}{(T.IsZero(value) ? "0" : "")}{(T.IsNaN(value) ? "N" : "")}{T.IsInteger(value)}]";
static TTo Convert<TFrom, TTo>(TFrom value) where TFrom : INumberBase<TFrom> where TTo : INumberBase<TTo> => TTo.CreateChecked(value);
static string Bits<T>(T value) where T : IBinaryInteger<T> => $"{T.PopCount(value)}/{T.LeadingZeroCount(value)}/{T.TrailingZeroCount(value)}/{value >> 1}/{value << 2}/{value & T.One}/{value | T.One}/{value ^ T.AllBitsSet}/{~value}";
static T Clamp<T>(T value, T min, T max) where T : INumber<T> => T.Clamp(value, min, max);
static T Hyp<T>(T a, T b) where T : IRootFunctions<T> => T.Sqrt(a * a + b * b);
static T Area<T>(T radius) where T : IFloatingPointConstants<T>, IMultiplyOperators<T, T, T> => T.Pi * radius * radius;
static string Rounds<T>(T value) where T : IFloatingPoint<T> => $"{T.Round(value)}/{T.Round(value, MidpointRounding.AwayFromZero)}/{T.Floor(value)}/{T.Ceiling(value)}/{T.Truncate(value)}";
static T Parse<T>(string text) where T : INumberBase<T> => T.Parse(text, System.Globalization.CultureInfo.InvariantCulture);
static string MinMax<T>() where T : IMinMaxValue<T> => T.MinValue + ".." + T.MaxValue;
static T Fib<T>(int n) where T : INumber<T> { T a = T.Zero, b = T.One; for (int i = 0; i < n; i++) (a, b) = (b, a + b); return a; }
static string DivRemOf<T>(T a, T b) where T : IBinaryInteger<T> => T.DivRem(a, b).ToString();
static T Increment<T>(T value) where T : INumber<T> { value++; return value; }
static T Negate<T>(T value) where T : ISignedNumber<T> => -value;
static T Div<T>(T a, T b) where T : INumber<T> => a / b;
static T Mod<T>(T a, T b) where T : INumber<T> => a % b;
static T Shift<T>(T value, int count) where T : IShiftOperators<T, int, T> => value << count;
static bool Equal<T>(T a, T b) where T : IEqualityOperators<T, T, bool> => a == b;
static bool Less<T>(T a, T b) where T : IComparisonOperators<T, T, bool> => a < b;
static T Total<T>(IEnumerable<T> items) where T : IAdditionOperators<T, T, T>, IAdditiveIdentity<T, T> { T sum = T.AdditiveIdentity; foreach (var i in items) sum += i; return sum; }
static double Average<T>(T[] values) where T : INumber<T> => double.CreateChecked(Sum(values)) / values.Length;

readonly struct Money : IAdditionOperators<Money, Money, Money>, IAdditiveIdentity<Money, Money>
{
    public readonly decimal Amount;
    public Money(decimal amount) { Amount = amount; }
    public static Money operator +(Money left, Money right) => new Money(left.Amount + right.Amount);
    public static Money AdditiveIdentity => new Money(0);
    public static Money Zero => AdditiveIdentity;
    public override string ToString() => Amount.ToString("C", System.Globalization.CultureInfo.InvariantCulture);
}

// Output:
// 6 44 -5536 705032704 1
// 0.3 0.30000000000000004 0.3 b
// 24 7766279631452241920 0
// 9 8.25 1.1 x
// [-5:-1-True][0:00True][7:1True][2.5:1False][-0:0-0True][-3:-1-True][4:1True]
// 3 2147483647 -2147483648 300 44 0 -56
// 7 2.5 1.0995116E+12 12 0 -2147483648
// Arithmetic operation resulted in an overflow.
// Arithmetic operation resulted in an overflow.
// Value was either too large or too small for a Decimal.
// 5 7 9223372036854775807 1.25
// 8 64 31 3 9 True 2 128
// 2/28/2/6/48/0/13/-13/-13 64/0/0/-1/-4/1/-1/0/0 8/0/0/127/252/1/255/0/0 1/15/0/0/4/1/1/65534/65534
// 10 -1 3
// '5' cannot be greater than 3.
// 4 2.5 -1 0 4 1 -5 -1
// Negating the minimum value of a twos complement number is invalid.
// 3.141592653589793 2.7182817 6.283185307179586 1.4142135623730951 1.4142135 1024 3 100 5
// 5 1.4142135 12.566370614359172 12.566371
// 2/3/2/3/2 2/3/2/3/2 -2/-2/-2/-1/-1 2.35 2.35 -2 2
// 42 2.5 1.10 True True True False False True
// -2147483648..2147483647 0..255 -9223372036854775808..9223372036854775807 4 -79228162514264337593543950335..79228162514264337593543950335
// 102334155 23416728348467685 23416728348467684 354224848179261915075 354224848179261915075
// 3 2 (-3, -2) -2147483648 1.5 -2147483648 -128
// Attempted to divide by zero.
// Infinity 3 -1 1.5 2 8589934592 0
// True False True False
// ¤3.75 ¤0.00
// 2.3333333333333335 1.5 1.5
