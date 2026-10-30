// Classes, interfaces with default methods, abstract and virtual members,
// properties, events, indexers, structs with operators, generic classes
// with iterators, extension methods, ref/out/params/named arguments.
using System.Collections;

var shapes = new List<Shape> { new Circle(1.5), new Rect(2, 3), new Square(2) };
foreach (var s in shapes)
    Console.WriteLine($"{s.Name}: area={s.Area():F2} perimeter={s.Perimeter():F2}");
Console.WriteLine(shapes.Sum(s => s.Area()).ToString("F3"));
IDescribable d = new Rect(1, 1);
Console.WriteLine(d.Describe());
Console.WriteLine(Shape.Count);
var stack = new MyStack<string>();
stack.Push("a"); stack.Push("b"); stack.Push("c");
Console.WriteLine(stack.Pop() + stack.Peek() + stack.Count);
foreach (var item in stack)
    Console.Write(item + ";");
Console.WriteLine();
var counter = new Counter();
counter.Changed += (sender, value) => Console.WriteLine("changed to " + value);
counter.Increment();
counter.Increment();
Console.WriteLine(counter[0] + " " + counter.Value);
var v1 = new Vec(1, 2);
var v2 = new Vec(3, 4);
Console.WriteLine(v1 + v2);
Console.WriteLine(v1 * 3);
Console.WriteLine(v1 == new Vec(1, 2));
Console.WriteLine(-v2);
Vec v3 = v1;
v3.X = 100;
Console.WriteLine(v1.X + " " + v3.X);
Console.WriteLine(Max(3, 7) + " " + Max("pear", "apple") + " " + Max(2.5, 1.5));
Console.WriteLine(new Animal[] { new Dog(), new Cat() }.Select(a => a.Speak()).Aggregate((a, b) => a + "," + b));
object boxed = new Dog();
if (boxed is Animal { Legs: 4 } animal)
    Console.WriteLine("four legs: " + animal.GetType().Name);
Console.WriteLine(Utils.Twice(5) + " " + "hello".Shout());
int a = 1, b = 2;
Swap(ref a, ref b);
Console.WriteLine(a + " " + b);
Console.WriteLine(TryDivide(10, 2, out var q) + " " + q);
Console.WriteLine(TryDivide(10, 0, out q) + " " + q);
Console.WriteLine(Sum(1, 2, 3, 4));
Console.WriteLine(Greet(name: "Bob"));
Console.WriteLine(Greet("Ann", "Hi"));

T Max<T>(T x, T y) where T : IComparable<T> => x.CompareTo(y) >= 0 ? x : y;
void Swap<T>(ref T x, ref T y) { T t = x; x = y; y = t; }
bool TryDivide(int x, int y, out int result)
{
    if (y == 0) { result = 0; return false; }
    result = x / y;
    return true;
}
int Sum(params int[] values) => values.Sum();
string Greet(string name, string greeting = "Hello") => $"{greeting}, {name}!";

interface IDescribable { string Describe() => "I am " + GetType().Name; }

abstract class Shape : IDescribable
{
    public static int Count { get; private set; }
    protected Shape() { Count++; }
    public abstract double Area();
    public abstract double Perimeter();
    public virtual string Name => GetType().Name;
}

class Circle : Shape
{
    private readonly double _r;
    public Circle(double r) { _r = r; }
    public override double Area() => Math.PI * _r * _r;
    public override double Perimeter() => 2 * Math.PI * _r;
}

class Rect : Shape
{
    public double W { get; }
    public double H { get; }
    public Rect(double w, double h) { W = w; H = h; }
    public override double Area() => W * H;
    public override double Perimeter() => 2 * (W + H);
}

class Square : Rect
{
    public Square(double side) : base(side, side) { }
    public override string Name => "Square(" + W + ")";
}

class MyStack<T> : IEnumerable<T>
{
    private readonly List<T> _items = new();
    public void Push(T item) => _items.Add(item);
    public T Pop() { var item = _items[^1]; _items.RemoveAt(_items.Count - 1); return item; }
    public T Peek() => _items[_items.Count - 1];
    public int Count => _items.Count;
    public IEnumerator<T> GetEnumerator()
    {
        for (int i = _items.Count - 1; i >= 0; i--)
            yield return _items[i];
    }
    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
}

class Counter
{
    private int _value;
    public event Action<object, int> Changed;
    public int Value => _value;
    public int this[int offset] => _value + offset;
    public void Increment()
    {
        _value++;
        Changed?.Invoke(this, _value);
    }
}

struct Vec
{
    public int X;
    public int Y;
    public Vec(int x, int y) { X = x; Y = y; }
    public static Vec operator +(Vec a, Vec b) => new Vec(a.X + b.X, a.Y + b.Y);
    public static Vec operator *(Vec a, int k) => new Vec(a.X * k, a.Y * k);
    public static Vec operator -(Vec a) => new Vec(-a.X, -a.Y);
    public static bool operator ==(Vec a, Vec b) => a.X == b.X && a.Y == b.Y;
    public static bool operator !=(Vec a, Vec b) => !(a == b);
    public override bool Equals(object o) => o is Vec v && v == this;
    public override int GetHashCode() => X * 31 + Y;
    public override string ToString() => $"({X}, {Y})";
}

abstract class Animal
{
    public abstract string Speak();
    public virtual int Legs => 4;
}
class Dog : Animal { public override string Speak() => "Woof"; }
class Cat : Animal { public override string Speak() => "Meow"; }

static class Utils
{
    public static int Twice(int x) => x * 2;
    public static string Shout(this string s) => s.ToUpper() + "!";
}

// Output:
// Circle: area=7.07 perimeter=9.42
// Rect: area=6.00 perimeter=10.00
// Square(2): area=4.00 perimeter=8.00
// 17.069
// I am Rect
// 4
// cb2
// b;a;
// changed to 1
// changed to 2
// 2 2
// (4, 6)
// (3, 6)
// True
// (-3, -4)
// 1 100
// 7 pear 2.5
// Woof,Meow
// four legs: Dog
// 10 HELLO!
// 2 1
// True 5
// False 0
// 10
// Hello, Bob!
// Hi, Ann!
