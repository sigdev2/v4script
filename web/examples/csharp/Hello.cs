// Hello: standard input, string methods and interpolation.
Console.Write("What is your name? ");
string name = Console.ReadLine()?.Trim();
if (string.IsNullOrEmpty(name))
    name = "stranger";
Console.WriteLine($"Hello, {name}!");
Console.WriteLine("Backwards: " + new string(name.Reverse().ToArray()));
Console.WriteLine($"{name.Length} letters, the first is '{name[0]}', in capitals {name.ToUpperInvariant()}");
var vowels = name.Count(c => "aeiouAEIOU".Contains(c));
Console.WriteLine($"Vowels: {vowels}, the share {(double)vowels / name.Length:P0}");
