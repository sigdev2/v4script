// Endless recursion ends with the message of .NET.
int Depth(int n) => Depth(n + 1) + 1;
Console.WriteLine(Depth(0));

// Error: Stack overflow.
// Line: 2
