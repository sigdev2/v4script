// A unit as a C# script: top-level statements, functions, types and
// variables in any order; the value of the last expression without a
// semicolon goes to the console.
int Fib(int n) => n < 2 ? n : Fib(n - 1) + Fib(n - 2);

record Item(string Name, decimal Price);

var items = new List<Item> { new("tea", 3.5m), new("coffee", 4.25m), new("water", 1) };
decimal total = 0;
foreach (var item in items)
    total += item.Price;
Console.WriteLine($"total {total:F2}");

string Describe(Item item) => item.Name + (item.Price > 2 ? " (pricey)" : "");

foreach (var item in items)
    Console.WriteLine(Describe(item));
Console.WriteLine(Fib(20));
const int limit = 5;
int count = 0;
while (count < limit)
    count += 2;
count

// Output:
// total 8.75
// tea (pricey)
// coffee (pricey)
// water
// 6765
// Value: 6
