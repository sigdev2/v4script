// Strings and chars: methods, StringBuilder, interpolation with formats,
// verbatim and raw literals, surrogate pairs, sorting with comparers.
using System.Text;


string s = "Hello, World";
Console.WriteLine(s.ToUpper() + " " + s.ToLower() + " " + s.Length + " " + s[4]);
Console.WriteLine(s.Substring(7) + "|" + s.Substring(0, 5) + "|" + s.IndexOf('o') + "|" + s.LastIndexOf("o") + "|" + s.IndexOf("xyz"));
Console.WriteLine(s.Replace("l", "L") + " " + s.Contains("World") + " " + s.StartsWith("Hell") + " " + s.EndsWith("d"));
Console.WriteLine(string.Join(",", s.Split(", ")) + " " + string.Join("|", "a,b,,c".Split(',', StringSplitOptions.RemoveEmptyEntries)));
Console.WriteLine("  trim  ".Trim() + "|" + "xxhixx".Trim('x') + "|" + "  a".TrimStart() + "|" + "b  ".TrimEnd() + "|");
Console.WriteLine("abc".PadLeft(6) + "|" + "abc".PadRight(6, '.') + "|" + new string('*', 5) + "|" + string.Concat("a", "b", "c"));
Console.WriteLine(string.Compare("apple", "Banana") + " " + string.CompareOrdinal("apple", "Banana") + " " + "a".CompareTo("b") + " " + string.Equals("A", "a", StringComparison.OrdinalIgnoreCase));
var sb = new StringBuilder();
sb.Append("x").Append(42).Append(' ').Append(3.5).AppendLine().AppendFormat("{0:D3}|{1,5}|", 7, "ab");
sb.Insert(0, "[").Replace("x", "X");
Console.WriteLine(sb.ToString() + " " + sb.Length);
sb.Clear(); sb.Append("hello"); sb[0] = 'J'; sb.Remove(1, 2);
Console.WriteLine(sb);
char c = 'a';
c++;
Console.WriteLine(c + " " + (int)c + " " + (char)(c + 1) + " " + char.IsDigit('5') + " " + char.IsLetter('x') + " " + char.ToUpper('q') + " " + char.IsWhiteSpace(' ') + char.IsUpper('A') + char.IsLetterOrDigit('_'));
Console.WriteLine($"{1 + 2} {"x",3} {3.14159:F2} {255:X} {255:x4} {0.5:P0} {1234567.891:N2} {DateTime.MinValue:yyyy}");
string verbatim = @"C:\path\n""quoted""";
Console.WriteLine(verbatim + " " + verbatim.Length);
string raw = """
    Raw "text"
      indented
    """;
Console.WriteLine(raw);
var chars = s.ToCharArray();
Array.Reverse(chars);
Console.WriteLine(new string(chars) + " " + string.Concat(s.Where(char.IsUpper)) + " " + s.Count(ch => ch == 'l'));
Console.WriteLine(string.Format("{0} + {1} = {2}", 1, 2, 3) + " " + "abc".Insert(1, "XY") + " " + "abcdef".Remove(2, 2) + " " + "abc" + null + 1 + 2);
Console.WriteLine("Straße".ToUpperInvariant() + " " + "ǅ".ToLower() + " " + "😀".Length + " " + char.IsSurrogate("😀"[0]) + " " + char.ConvertToUtf32("😀", 0));
Console.WriteLine(string.IsNullOrEmpty("") + " " + string.IsNullOrWhiteSpace("  ") + " " + "a-b-c".Split('-').Length + " " + "abc".IndexOfAny(new[] { 'c', 'b' }));
foreach (var part in "one two  three".Split(' '))
    Console.Write("[" + part + "]");
Console.WriteLine();
Console.WriteLine("x".Equals("x") + " " + ("ab" == "a" + "b") + " " + (object)"ab" == (object)("a" + "b".ToString()));
Console.WriteLine(int.Parse("42") + int.Parse("-7") + " " + double.Parse("2.5") + " " + int.TryParse("x", out var bad) + bad + " " + long.Parse("9000000000"));
Console.WriteLine("Tab\tEnd\u0041\x42" + '\'' + "\\");
var words = new List<string> { "pear", "Apple", "banana", "apple" };
words.Sort();
Console.WriteLine(string.Join(" ", words));
words.Sort(StringComparer.Ordinal);
Console.WriteLine(string.Join(" ", words));
Console.WriteLine(string.Join(" ", words.OrderBy(w => w.Length).ThenByDescending(w => w)));
Console.WriteLine("abc".GetHashCode() == "abc".GetHashCode());
var span = "hello".Substring(1, 3);
Console.WriteLine(span.ToString() + " " + span.Length);
Console.WriteLine(string.Join(",", "a1b22c333".Select(ch => char.IsDigit(ch) ? '#' : ch)));
Console.WriteLine($"{"left",-6}|{"right",6}|{-3,4:D2}|{12.5,8:F3}|");
Console.WriteLine("ABC".Aggregate("", (acc, ch) => ch + acc) + " " + "x".PadLeft(3, '0') + " " + "Hello"[^1] + " " + "Hello"[1..3]);

// Output:
// HELLO, WORLD hello, world 12 o
// World|Hello|4|8|-1
// HeLLo, WorLd True True True
// Hello,World a|b|c
// trim|hi|a|b|
//    abc|abc...|*****|abc
// -1 31 -1 True
// [X42 3.5
// 007|   ab| 19
// Jlo
// b 98 c True True Q TrueTrueFalse
// 3   x 3.14 FF 00ff 50 % 1,234,567.89 0001
// C:\path\n"quoted" 17
// Raw "text"
//   indented
// dlroW ,olleH HW 3
// 1 + 2 = 3 aXYbc abef abc12
// STRAßE ǆ 2 True 128512
// True True 3 1
// [one][two][][three]
// False
// 35 2.5 False0 9000000000
// Tab	EndAB'\
// apple Apple banana pear
// Apple apple banana pear
// pear Apple apple banana
// True
// ell 3
// a,#,b,#,#,c,#,#,#
// left  | right| -03|  12.500|
// CBA 00x o el
