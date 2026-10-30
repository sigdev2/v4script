// A value of the wrong type: the compiler stops before the program runs.
int total = 0;
for (int i = 0; i < 3; i++)
    total += i;
string text = total;
Console.WriteLine(text);

// Error: error CS0029: Cannot implicitly convert type 'int' to 'string'
// Line: 5
