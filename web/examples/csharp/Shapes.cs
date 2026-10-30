// Records, an interface with a default method and pattern matching with
// switch expressions.
var shapes = new List<IShape>
{
    new Circle(1.5),
    new Rectangle(2, 3),
    new Rectangle(2.5, 2.5),
    new Triangle(3, 4, 5),
};
foreach (var shape in shapes)
    Console.WriteLine($"{shape.Describe(),-34} area {shape.Area,7:F2}  {Classify(shape)}");

var largest = shapes.MaxBy(shape => shape.Area);
Console.WriteLine($"The largest: {largest}");
var grown = shapes.OfType<Rectangle>().Select(r => r with { Width = r.Width * 2 });
Console.WriteLine("Twice as wide: " + string.Join(", ", grown));

static string Classify(IShape shape) => shape switch
{
    Circle { Radius: > 1 } => "a big circle",
    Circle => "a small circle",
    Rectangle(var w, var h) when w == h => "a square",
    Rectangle { Area: < 10 } => "a small rectangle",
    Triangle(var a, var b, var c) when a * a + b * b == c * c => "a right triangle",
    _ => "something else",
};

interface IShape
{
    double Area { get; }
    string Describe() => $"{GetType().Name} of area {Area:F1}";
}

record Circle(double Radius) : IShape
{
    public double Area => Math.PI * Radius * Radius;
}

record Rectangle(double Width, double Height) : IShape
{
    public double Area => Width * Height;
}

record Triangle(double A, double B, double C) : IShape
{
    public double Area
    {
        get
        {
            double s = (A + B + C) / 2;
            return Math.Sqrt(s * (s - A) * (s - B) * (s - C));
        }
    }
    public string Describe() => $"Triangle with sides {A}, {B}, {C}";
}
