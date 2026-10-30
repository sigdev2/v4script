// A missing semicolon: csc takes the next line for another declarator.
var names = new List<string> { "a", "b" };
int count = names.Count
Console.WriteLine(count);

// Error: error CS1003: Syntax error, ',' expected
// Line: 3
