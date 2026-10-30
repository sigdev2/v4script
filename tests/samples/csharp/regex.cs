// System.Text.RegularExpressions: groups (named ones are numbered after
// the others, as in .NET), replacements with $1 and ${name}, evaluators,
// Split with captures, options, escapes and the errors of patterns.
using System.Text.RegularExpressions;

var date = new Regex(@"(?<year>\d{4})-(?<month>\d{2})-(\d{2})");
var m = date.Match("Due 2024-03-15 and 2025-12-01.");
Console.WriteLine(m.Success + " " + m.Value + " " + m.Index + " " + m.Length + " " + m.Groups.Count);
Console.WriteLine(m.Groups["year"].Value + " " + m.Groups["month"].Index + " " + m.Groups[1].Value + " " + m.Groups[2].Value + " " + m.Groups[3].Name);
Console.WriteLine(string.Join(",", date.GetGroupNames()) + " " + date.GroupNumberFromName("month"));
m = m.NextMatch();
Console.WriteLine(m.Value + " " + m.NextMatch().Success);
foreach (Match match in Regex.Matches("a1b22c333", @"\d+"))
    Console.Write(match.Value + "@" + match.Index + " ");
Console.WriteLine();
Console.WriteLine(Regex.Matches("one two  three", @"\w+").Count + " " + Regex.IsMatch("ABC", "^abc$", RegexOptions.IgnoreCase));
Console.WriteLine(Regex.Replace("2024-03-15", @"(\d+)-(\d+)-(\d+)", "$3/$2/$1") + " " + Regex.Replace("a.b.c", @"\.", "$$"));
Console.WriteLine(Regex.Replace("hello world", @"\b(\w)", m2 => m2.Value.ToUpper()));
Console.WriteLine(Regex.Replace("John Smith", @"(?<first>\w+) (?<last>\w+)", "${last}, ${first}"));
Console.WriteLine(string.Join("|", Regex.Split("a, b;c  d", @"[,;\s]+")) + " " + string.Join("|", Regex.Split("a1b2c", @"(\d)")));
Console.WriteLine(string.Join("|", Regex.Split("abc", "")) + " " + Regex.Split("", "x").Length);
Console.WriteLine(Regex.Escape("a.b*c (d) [e] {f} $^|#") + " " + Regex.Unescape(@"a\.b\tc"));
var multi = "line one\nline two\nthird";
Console.WriteLine(Regex.Matches(multi, "^line", RegexOptions.Multiline).Count + " " + Regex.Matches(multi, "^line").Count);
Console.WriteLine(Regex.IsMatch("a\nb", "a.b") + " " + Regex.IsMatch("a\nb", "a.b", RegexOptions.Singleline));
Console.WriteLine(Regex.Match("price: 42 USD", @"(?i)PRICE:\s*(\d+)").Groups[1].Value);
Console.WriteLine(Regex.Match("aaa bbb", @"(\w)\1+").Value + " " + Regex.Match("abab", @"(?<x>ab)\k<x>").Success);
Console.WriteLine(new Regex(@"\d").Replace("a1b2c3", "#", 2) + " " + new Regex("o").Replace("foo boo", "0", 3));
var opt = new Regex(@"(\w+)  # word
    \s+ (\d+)   # number", RegexOptions.IgnorePatternWhitespace);
Console.WriteLine(opt.Match("abc   123").Groups[2].Value + " " + opt.Options);
Console.WriteLine(Regex.Match("x", "y").Success + "|" + Regex.Match("x", "y").Value + "|" + Regex.Match("x", "y").Groups.Count);
var opt2 = Regex.Match("ab", "(a)|(b)");
Console.WriteLine(opt2.Groups[2].Success + " " + opt2.Groups[2].Value.Length + " " + opt2.Groups[1].Success);
try { new Regex("(abc"); } catch (ArgumentException e) { Console.WriteLine(e.GetType().Name + ": " + e.Message); }
try { new Regex("abc)"); } catch (ArgumentException e) { Console.WriteLine(e.Message); }
Console.WriteLine(Regex.Count("banana", "a") + " " + Regex.Match("tel: 555-1234", @"\d{3}-\d{4}").Result("[$&] before:$`"));
var words = Regex.Matches("The quick brown fox", @"\b\w{5}\b").Select(x => x.Value);
Console.WriteLine(string.Join(",", words) + " " + Regex.Match("aXbXc", "x", RegexOptions.IgnoreCase).Index);
Console.WriteLine(Regex.Replace("  many   spaces  ", @"\s+", " ").Trim() + "|" + Regex.IsMatch("test@example.com", @"^[\w.+-]+@[\w-]+\.[\w.]+$"));
Console.WriteLine(Regex.Match("aaa", "a*?").Length + " " + Regex.Matches("aaa", "a*").Count + " " + Regex.Replace("abc", "x*", "-"));

// Output:
// True 2024-03-15 4 10 4
// 2024 9 15 2024 month
// 0,1,year,month 3
// 2025-12-01 False
// 1@1 22@3 333@6
// 3 True
// 15/03/2024 a$b$c
// Hello World
// Smith, John
// a|b|c|d a|1|b|2|c
// |a|b|c| 1
// a\.b\*c\ \(d\)\ \[e]\ \{f}\ \$\^\|\# a.b	c
// 2 1
// False True
// 42
// aaa True
// a#b#c3 f00 b0o
// 123 IgnorePatternWhitespace
// False||1
// False 0 True
// RegexParseException: Invalid pattern '(abc' at offset 4. Not enough )'s.
// Invalid pattern 'abc)' at offset 4. Too many )'s.
// 3 [555-1234] before:tel:
// quick,brown 1
// many spaces|True
// 0 2 -a-b-c-
