// An exception of the library: a missing key of a dictionary.
var ages = new Dictionary<string, int> { ["ann"] = 30 };
Console.WriteLine(ages["ann"]);
Console.WriteLine(ages["bob"]);

// Output:
// 30
// Error: Unhandled exception. System.Collections.Generic.KeyNotFoundException: The given key 'bob' was not present in the dictionary.
// Line: 4
