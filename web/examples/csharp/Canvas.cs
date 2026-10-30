// Drawing on the canvas of the page through JavaScript (JsValue).
var canvas = Js.Global["canvas"];
var ctx = canvas.Call("getContext", "2d");
double width = canvas["width"].AsDouble(), height = canvas["height"].AsDouble();
ctx["fillStyle"] = "#101828";
ctx.Call("fillRect", 0, 0, width, height);
var random = new Random(7);
for (int i = 0; i < 12; i++)
{
    double x = random.NextDouble() * width, y = random.NextDouble() * height;
    double radius = 10 + random.Next(30);
    ctx["fillStyle"] = $"hsla({i * 30}, 80%, 60%, 0.7)";
    ctx.Call("beginPath");
    ctx.Call("arc", x, y, radius, 0, 2 * Math.PI);
    ctx.Call("fill");
}
ctx["fillStyle"] = "white";
ctx["font"] = "20px sans-serif";
ctx.Call("fillText", "C# on the canvas", 20, 30);
Console.WriteLine("12 circles drawn");
