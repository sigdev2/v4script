// The host module "app" of the tests is the static class App; its methods
// are in PascalCase, and a unit sees them without the class name.
Console.WriteLine(Greet("Ann") + " " + Add(2, 3.5) + " " + IsEven(4) + " " + Counter + " " + App.Counter);
JsValue p = Point(1, 2);
Console.WriteLine(p["x"].AsInt() + " " + p.Get("y").AsDouble() + " " + Range(3).Count);
Log("one");
Console.WriteLine(Logged[0] + " " + Describe() + " " + Describe(new List<int> { 1, 2 }) + " " + Describe(new { A = 1 }));
dynamic d = Point(3, 4);
Console.WriteLine((double)d.x + d.y);
JsValue array = JsValue.Of(new[] { 5, 6, 7 });
Console.WriteLine(array.Length + " " + array[1] + " " + array.Call("join", "-") + " " + array.IsArray);
var math = Js.Global["Math"];
Console.WriteLine(math.Call("max", 3, 9, 4).AsInt() + " " + math["PI"].AsDouble().ToString("F4"));
try
{
    Fail("bad");
}
catch (JsException e)
{
    Console.WriteLine("caught " + e.Message);
}

// Output:
// Hello, Ann! 5.5 True 1 2
// 1 2 3
// one nothing [1,2] {"A":1}
// 7
// 3 6 5-6-7 True
// 9 3.1416
// caught RangeError: bad
