// A member of null - a NullReferenceException.
var capitals = new Dictionary<string, string> { ["France"] = "Paris" };
string city = capitals.GetValueOrDefault("Spain");
Console.WriteLine("looking up");
Console.WriteLine(city.Length);

// Output:
// looking up
// Error: Unhandled exception. System.NullReferenceException: Object reference not set to an instance of an object.
// Line: 5
