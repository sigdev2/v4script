// Generics with constraints, static abstract interface members, default
// interface members, structs with operators, conversions and indexers,
// delegates, events, lambdas and closures, local functions, nullable
// types, variance, ref/out/in, typeof and checked arithmetic.

interface IShape { double Area { get; } string Name => GetType().Name; }
interface IScalable<TSelf> where TSelf : IScalable<TSelf> { static abstract TSelf Unit { get; } TSelf Scale(double k); }
struct Vec : IEquatable<Vec>
{
    public double X, Y;
    public Vec(double x, double y) { X = x; Y = y; }
    public static Vec operator +(Vec a, Vec b) => new Vec(a.X + b.X, a.Y + b.Y);
    public static Vec operator *(Vec a, double k) => new Vec(a.X * k, a.Y * k);
    public static bool operator ==(Vec a, Vec b) => a.X == b.X && a.Y == b.Y;
    public static bool operator !=(Vec a, Vec b) => !(a == b);
    public static implicit operator Vec((double, double) t) => new Vec(t.Item1, t.Item2);
    public static explicit operator double(Vec v) => Math.Sqrt(v.X * v.X + v.Y * v.Y);
    public bool Equals(Vec other) => this == other;
    public override bool Equals(object o) => o is Vec v && Equals(v);
    public override int GetHashCode() => HashCode.Combine(X, Y);
    public override string ToString() => $"({X}, {Y})";
    public double this[int i] { get => i == 0 ? X : Y; set { if (i == 0) X = value; else Y = value; } }
}
class Circle : IShape, IScalable<Circle>
{
    public double R { get; init; }
    public double Area => Math.PI * R * R;
    public static Circle Unit => new Circle { R = 1 };
    public Circle Scale(double k) => new Circle { R = R * k };
}
class Square : IShape { public double Side; public double Area => Side * Side; public string Name => "Sq"; }
class Box<T> where T : IComparable<T>
{
    private readonly List<T> items = new();
    public void Add(params T[] values) { items.AddRange(values); }
    public T Max() { T best = items[0]; foreach (var x in items) if (x.CompareTo(best) > 0) best = x; return best; }
    public int Count => items.Count;
    public static Box<T> Of(T a) { var b = new Box<T>(); b.Add(a); return b; }
}
class Node<T> { public T Value; public Node<T> Next; public Node(T v, Node<T> n = null) { Value = v; Next = n; } }
static class Ext
{
    public static IEnumerable<T> Walk<T>(this Node<T> n) { for (; n != null; n = n.Next) yield return n.Value; }
    public static double Sum<T>(IEnumerable<T> xs) where T : IConvertible { double s = 0; foreach (var x in xs) s += Convert.ToDouble(x); return s; }
    public static TS Twice<TS>() where TS : IScalable<TS> => TS.Unit.Scale(2);
}
class Counter
{
    public event EventHandler<int> Changed;
    private int value;
    public int Value { get => value; set { this.value = value; Changed?.Invoke(this, value); } }
}
class Program
{
    static void Swap<T>(ref T a, ref T b) { (a, b) = (b, a); }
    static bool TryHalf(int n, out int half) { half = n / 2; return n % 2 == 0; }
    static int Sum(int first, params int[] rest) => first + rest.Sum();
    static string Greet(string name = "you", int times = 1) => string.Concat(Enumerable.Repeat("hi " + name + " ", times));
    static void Inc(in int x, ref int y) { y += x; }
    static void Main()
    {
        Vec a = new Vec(1, 2), b = (3.0, 4.0);
        var c = a + b * 2;
        Console.WriteLine($"{c} {(double)b} {a == new Vec(1, 2)} {a != b} {c[1]} {a.Equals((object)new Vec(1, 2))}");
        var d = a; d.X = 100; d[1] = 7;
        Console.WriteLine(a + " " + d);
        var arr = new Vec[2]; arr[0].X = 5;
        Console.WriteLine(arr[0] + " " + arr[1]);
        IShape[] shapes = { new Circle { R = 2 }, new Square { Side = 3 } };
        foreach (var s in shapes) Console.WriteLine($"{s.Name} {s.Area:F3}");
        Console.WriteLine(Ext.Twice<Circle>().R + " " + Circle.Unit.Scale(3).R);
        var box = new Box<string>(); box.Add("pear", "zebra", "apple");
        Console.WriteLine(box.Max() + " " + box.Count + " " + Box<int>.Of(5).Max());
        var list = new Node<int>(1, new Node<int>(2, new Node<int>(3)));
        Console.WriteLine(string.Join(",", list.Walk()) + " " + Ext.Sum(list.Walk()) + " " + Ext.Sum(new[] { 1.5, 2.25 }));
        int x = 1, y = 2; Swap(ref x, ref y); Console.WriteLine(x + " " + y);
        string p = "p", q = "q"; Swap(ref p, ref q); Console.WriteLine(p + q);
        Console.WriteLine(TryHalf(10, out var h) + " " + h + " " + TryHalf(7, out _));
        Console.WriteLine(Sum(1) + " " + Sum(1, 2, 3) + " " + Sum(1, new[] { 4, 5 }));
        Console.WriteLine(Greet() + "|" + Greet("Bo", 2) + "|" + Greet(times: 2));
        int acc = 10; Inc(5, ref acc); Console.WriteLine(acc);
        var counter = new Counter();
        int seen = 0;
        EventHandler<int> handler = (sender, v) => { seen += v; Console.WriteLine("changed " + v); };
        counter.Changed += handler;
        counter.Value = 3; counter.Value = 4;
        counter.Changed -= handler;
        counter.Value = 5;
        Console.WriteLine(seen + " " + counter.Value);
        Func<int, int> sq = n => n * n; Func<int, Func<int, int>> adder = k => n => n + k;
        Action<string> say = Console.WriteLine;
        say(sq(7) + " " + adder(3)(4));
        var fs = new List<Func<int>>();
        for (int i = 0; i < 3; i++) fs.Add(() => i * 10);
        foreach (var i in new[] { 1, 2 }) fs.Add(() => i);
        Console.WriteLine(string.Join(",", fs.Select(f => f())));
        int Fact(int n) => n <= 1 ? 1 : n * Fact(n - 1);
        static int Twice(int n) => 2 * n;
        Console.WriteLine(Fact(10) + " " + Twice(21));
        int? maybe = null; int? some = 5;
        Console.WriteLine((maybe ?? -1) + " " + (some + 1) + " " + (maybe + 1 == null) + " " + maybe.HasValue + " " + some.Value + " " + maybe.GetValueOrDefault(9));
        string nul = null;
        Console.WriteLine((nul?.Length ?? 0) + " " + (nul ?? "dflt") + " " + nul?.ToUpper() + "|");
        nul ??= "set"; Console.WriteLine(nul);
        IEnumerable<object> cov = new List<string> { "co", "variant" };
        Action<object> contra = o => Console.Write(o + ";"); Action<string> narrowAct = contra; narrowAct("contra");
        Console.WriteLine(string.Join(" ", cov));
        Console.WriteLine(typeof(List<int>).Name + " " + typeof(Dictionary<string, int>) + " " + new Box<int>().GetType() + " " + default(Vec) + " " + default(int?) + "|" + typeof(int[]).Name);
        Console.WriteLine(checked(int.MaxValue - 1) + " " + unchecked(int.MaxValue + 1));
        try { int big = int.MaxValue; checked { big++; } } catch (OverflowException e) { Console.WriteLine(e.Message); }
        var dict = new Dictionary<string, List<int>>();
        foreach (var w in new[] { "aa", "b", "cc", "d", "eee" })
        {
            if (!dict.TryGetValue(w.Length.ToString(), out var bucket)) dict[w.Length.ToString()] = bucket = new List<int>();
            bucket.Add(w[0]);
        }
        foreach (var (k, v) in dict) Console.Write(k + ":" + string.Join("/", v) + " ");
        Console.WriteLine();
        object o1 = 42; object o2 = 42;
        Console.WriteLine(o1.Equals(o2) + " " + ReferenceEquals(o1, o1) + " " + o1.GetType().Name + " " + (o1 is int i2 && i2 > 40));
    }
}

// Output:
// (7, 10) 5 True True 10 True
// (1, 2) (100, 7)
// (5, 0) (0, 0)
// Circle 12.566
// Sq 9.000
// 2 3
// zebra 3 5
// 1,2,3 6 3.75
// 2 1
// qp
// True 5 False
// 1 6 10
// hi you |hi Bo hi Bo |hi you hi you
// 15
// changed 3
// changed 4
// 7 5
// 49 7
// 30,30,30,1,2
// 3628800 42
// -1 6 True False 5 9
// 0 dflt |
// set
// contra;co variant
// List`1 System.Collections.Generic.Dictionary`2[System.String,System.Int32] Box`1[System.Int32] (0, 0) |Int32[]
// 2147483646 -2147483648
// Arithmetic operation resulted in an overflow.
// 2:97/99 1:98/100 3:101
// True True Int32 True
