// Integer division by zero in a function: the line of the division.
int Ratio(int a, int b) => a / b;
Console.WriteLine(Ratio(10, 3));
Console.WriteLine(Ratio(1, 0));

// Output:
// 3
// Error: Unhandled exception. System.DivideByZeroException: Attempted to divide by zero.
// Line: 2
