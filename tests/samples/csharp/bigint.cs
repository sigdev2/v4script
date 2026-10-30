// System.Numerics.BigInteger: arithmetic, powers, conversions with
// overflow checks, bit operations, formats (X is two's complement).
using System.Numerics;
using System.Globalization;

BigInteger f = 1;
for (int i = 1; i <= 30; i++) f *= i;
Console.WriteLine(f + " " + f.ToString().Length + " " + (f % 1000007) + " " + f.Sign + " " + f.IsEven);
var a = BigInteger.Parse("123456789012345678901234567890");
var b = new BigInteger(987654321);
Console.WriteLine(a + b + " " + (a - b) + " " + a * b + " " + a / b + " " + a % b + " " + -a);
Console.WriteLine(BigInteger.Pow(2, 100) + " " + BigInteger.ModPow(3, 200, 1000000007) + " " + BigInteger.GreatestCommonDivisor(a, 1234567890));
Console.WriteLine((a > b) + " " + (a == BigInteger.Parse("123456789012345678901234567890")) + " " + a.Equals(b) + " " + BigInteger.Compare(b, a) + " " + BigInteger.Max(a, b));
Console.WriteLine((long)b + " " + (int)b + " " + (double)a + " " + (decimal)(a / 1000000) + " " + (ulong)(BigInteger)ulong.MaxValue);
Console.WriteLine((a << 10) + " " + (a >> 70) + " " + (a & 0xFFFF) + " " + (a | 1) + " " + (a ^ a) + " " + ~b + " " + (-b >> 3));
Console.WriteLine(BigInteger.Zero + " " + BigInteger.One + " " + BigInteger.MinusOne + " " + default(BigInteger) + " " + default(BigInteger).IsZero + " " + new BigInteger(1e20) + " " + new BigInteger(12.9m));
Console.WriteLine(new BigInteger(255).ToString("X") + " " + new BigInteger(-1).ToString("X") + " " + new BigInteger(-256).ToString("X") + " " + new BigInteger(4096).ToString("x") + " " + new BigInteger(1234567).ToString("N0") + " " + new BigInteger(42).ToString("D5"));
Console.WriteLine($"{f:N0} {b:E3} {b:F2}");
Console.WriteLine(BigInteger.TryParse("12x", out var bad) + " " + bad + " " + BigInteger.TryParse(" -77 ", out var good) + " " + good + " " + BigInteger.Parse("FF", NumberStyles.HexNumber) + " " + BigInteger.Parse("0FF", NumberStyles.HexNumber));
Console.WriteLine(BigInteger.Log10(BigInteger.Pow(10, 50)).ToString("F6") + " " + Math.Round(BigInteger.Log(f), 6) + " " + BigInteger.Abs(-a) + " " + a.GetBitLength());
var fib = new List<BigInteger> { 0, 1 };
while (fib.Count < 100) fib.Add(fib[^1] + fib[^2]);
Console.WriteLine(fib[99] + " " + fib.Aggregate(BigInteger.Zero, (x, y) => x + y));
var q = BigInteger.DivRem(a, b, out var rem);
Console.WriteLine(q + " " + rem + " " + BigInteger.DivRem(17, 5));
var set = new HashSet<BigInteger> { 1, 2, new BigInteger(1) };
Console.WriteLine(set.Count + " " + (BigInteger.Pow(2, 64) - 1 == ulong.MaxValue) + " " + (b == 987654321) + " " + BigInteger.Parse("-0"));
try { Console.WriteLine(a / 0); } catch (DivideByZeroException e) { Console.WriteLine(e.Message); }
try { Console.WriteLine((int)a); } catch (OverflowException e) { Console.WriteLine(e.Message); }
try { BigInteger.Parse("abc"); } catch (FormatException e) { Console.WriteLine(e.Message); }
BigInteger n = 10; n++; n--; n += 5; n *= n;
Console.WriteLine(n + " " + (-7 / new BigInteger(2)) + " " + (-7 % new BigInteger(2)) + " " + new[] { a, b, 5 }.Max() + " " + new[] { b, 3, a }.OrderBy(x => x).First());

// Output:
// 265252859812191058636308480000000 33 790627 1 True
// 123456789012345678902222222211 123456789012345678900246913569 121932631124828532112482853211126352690 124999998873437499901 574845669 -123456789012345678901234567890
// 1267650600228229401496703205376 136318165 1234567890
// True True False -1 123456789012345678901234567890
// 987654321 987654321 1.2345678901234568E+29 123456789012345678901234 18446744073709551615
// 126419751948641975194864197519360 104571967 2770 123456789012345678901234567891 0 -987654322 -123456791
// 0 1 -1 0 True 100000000000000000000 12
// 0FF F F00 1000 1,234,567 00042
// 265,252,859,812,191,058,636,308,480,000,000 9.877E+008 987654321.00
// False 0 True -77 -1 255
// 50.000000 74.658236 123456789012345678901234567890 97
// 218922995834555169026 573147844013817084100
// 124999998873437499901 574845669 (3, 2)
// 2 True True 0
// Attempted to divide by zero.
// Value was either too large or too small for an Int32.
// The value could not be parsed.
// 225 -3 -1 123456789012345678901234567890 3
