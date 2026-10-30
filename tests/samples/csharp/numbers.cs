// Numbers: integer types and their overflow, long and ulong, float and
// double, decimal, checked arithmetic, enums with [Flags], tuples,
// records with with, patterns, switch with goto case.
long a = long.MaxValue;
Console.WriteLine(a + 1);
Console.WriteLine(unchecked(a * 3));
ulong u = ulong.MaxValue;
Console.WriteLine(u / 3 + " " + (u >> 60) + " " + (u % 1000));
int i = -17;
double big19 = 1e19, nan = double.NaN;
Console.WriteLine(i / 5 + " " + i % 5 + " " + (i >> 2) + " " + (i >>> 28) + " " + (~i) + " " + (i & 0xFF) + " " + (i ^ 0x55));
int v300 = 300, v200 = 200, v70k = 70000, vm1 = -1;
Console.WriteLine((byte)v300 + " " + (sbyte)v200 + " " + (short)v70k + " " + (ushort)vm1 + " " + (uint)vm1 + " " + (char)97);
Console.WriteLine(5 / 2.0 + " " + 7 % 2.5 + " " + -7.5 % 2 + " " + 1e308 * 10 + " " + -1.0 / 0 + " " + 0.0 / 0);
Console.WriteLine((int)3.7 + " " + (int)-3.7 + " " + (long)big19 + " " + (int)nan + " " + Math.Round(2.5) + " " + Math.Round(-3.5) + " " + Math.Round(1.2345, 2));
float f = 1.1f;
Console.WriteLine(f * 3 + " " + (double)f + " " + (f + 0.1) + " " + 16777217f + " " + (float)1e40);
decimal m = 10m / 3;
Console.WriteLine(m + " " + m * 3 + " " + Math.Round(m, 2) + " " + (m > 3.33m) + " " + (decimal)1.1 + " " + 0.1m * 0.1m);
checked
{
    try { int big = int.MaxValue; big++; } catch (OverflowException) { Console.WriteLine("overflow caught"); }
}
int? n1 = 5, n2 = null;
Console.WriteLine((n1 + n2) + "|" + (n1 * 2) + "|" + (n1 > n2) + "|" + (n1 == 5) + "|" + (n2 ?? 9) + "|" + n2.GetValueOrDefault(3));
bool? b1 = true, b2 = null;
Console.WriteLine((b1 & b2) + "|" + (b1 | b2) + "|" + (b2 == null));
Console.WriteLine(Color.Green + " " + (Color)7 + " " + (Perm.Read | Perm.Exec) + " " + Perm.All + " " + (Perm)16 + " " + Perm.None + " " + Enum.GetName(typeof(Color), 1));
Console.WriteLine(string.Join(",", Enum.GetValues<Color>()) + " " + Enum.Parse<Color>("Blue") + " " + Enum.IsDefined(typeof(Color), 5) + " " + Color.Blue.ToString("D") + " " + Perm.Write.HasFlag(Perm.Write));
var t = (Name: "Ann", Age: 30);
Console.WriteLine(t + " " + t.Name + " " + t.Item2 + " " + (t == ("Ann", 30)));
var (x, y) = (1, 2);
(x, y) = (y, x);
Console.WriteLine(x + " " + y);
var p = new Pt(3, 4);
var (px, py) = p;
Console.WriteLine(px + py + " " + p + " " + (p with { Y = 0 }) + " " + p.Equals(new Pt(3, 4)) + " " + (p == new Pt(3, 5)));
Console.WriteLine(Classify(0) + Classify(-5) + Classify(15) + Classify(150));
Console.WriteLine(Shape(new[] { 1, 2, 3 }) + Shape(new int[0]) + Shape(new[] { 9 }) + Shape(new[] { 1, 2, 3, 4, 5 }));
object[] things = { 1, "str", 2.5, null, new Pt(1, 1), 'c', 10L };
foreach (var thing in things)
    Console.Write(Describe(thing) + ";");
Console.WriteLine();
switch (DateTime.MinValue.Year)
{
    case 1:
        Console.WriteLine("one");
        goto case 2;
    case 2:
        Console.WriteLine("two");
        break;
    default:
        Console.WriteLine("other");
        break;
}
string Classify(int v) => v switch { 0 => "zero ", < 0 => "neg ", >= 1 and <= 99 => "small ", _ => "big " };
string Shape(int[] arr) => arr switch { [] => "empty ", [var only] => $"one({only}) ", [1, .., var last] => $"from1to{last} ", _ => "many " };
string Describe(object o) => o switch
{
    null => "null",
    int n when n > 0 => "pos int " + n,
    int => "int",
    string { Length: > 2 } s => "long string " + s,
    double d => "double " + d,
    Pt { X: 1 } => "pt with x=1",
    char c => "char " + c,
    long l => "long " + l,
    _ => "?"
};
enum Color { Red, Green, Blue }
[Flags] enum Perm { None = 0, Read = 1, Write = 2, Exec = 4, All = Read | Write | Exec }
record Pt(int X, int Y);

// Output:
// -9223372036854775808
// 9223372036854775805
// 6148914691236517205 15 615
// -3 -2 -5 15 16 239 -70
// 44 -56 4464 65535 4294967295 a
// 2.5 2 -1.5 Infinity -Infinity NaN
// 3 -3 -9223372036854775808 -2147483648 2 -4 1.23
// 3.3000002 1.100000023841858 1.200000023841858 16777216 Infinity
// 3.3333333333333333333333333333 10.000000000000000000000000000 3.33 True 1.1 0.01
// overflow caught
// |10|False|True|9|3
// |True|True
// Green 7 Read, Exec All 16 None Green
// Red,Green,Blue Blue False 2 True
// (Ann, 30) Ann 30 True
// 2 1
// 7 Pt { X = 3, Y = 4 } Pt { X = 3, Y = 0 } True False
// zero neg small big
// from1to3 empty one(9) from1to5
// pos int 1;long string str;double 2.5;null;pt with x=1;char c;long 10;
// one
// two
