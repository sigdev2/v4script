// Standard input of the host: Console.ReadLine, Console.Read, Console.In.
Console.Write("Name? ");
string name = Console.ReadLine();
Console.WriteLine("Hi " + name);
var numbers = Console.ReadLine().Split(' ', StringSplitOptions.RemoveEmptyEntries).Select(int.Parse).ToArray();
Console.WriteLine(numbers.Sum() + " " + numbers.Max());
int first = Console.Read();
int second = Console.Read();
Console.WriteLine((char)first + "|" + (char)second + "|" + Console.ReadLine() + "|");
string line;
while ((line = Console.In.ReadLine()) != null)
    Console.WriteLine("line: " + line.Trim());
Console.WriteLine(Console.ReadLine() == null);
Console.WriteLine(Console.Read());

// Input:
// Bob
// 3 4  5
// xyz rest
//  a
// b
// Output:
// Name? Hi Bob
// 12 5
// x|y|z rest|
// line: a
// line: b
// True
// -1
