// Span<T> and ReadOnlySpan<T>: views of arrays and strings, slices and
// ranges, stackalloc, MemoryExtensions, parsing from spans, Memory<T>,
// ArraySegment<T>.
using System.Text;
int[] data = { 5, 3, 8, 1, 9, 2 };
Span<int> span = data;
span[0] = 50;
Console.WriteLine(data[0] + " " + span.Length + " " + span[^1] + " " + span.IsEmpty);
var middle = span.Slice(1, 3);
middle[0] = 30;
Console.WriteLine(string.Join(",", data) + " " + middle.Length + " " + string.Join(",", middle.ToArray()));
var tail = span[2..];
Console.WriteLine(tail.Length + " " + tail[0] + " " + string.Join(",", span[1..^1].ToArray()));
int sum = 0;
foreach (var x in span) sum += x;
Console.WriteLine(sum);
span.Sort();
Console.WriteLine(string.Join(",", data) + " " + span.IndexOf(9) + " " + span.Contains(4) + " " + span.BinarySearch(30));
span.Reverse();
Console.WriteLine(string.Join(",", data));
Span<int> stack = stackalloc int[4];
stack.Fill(7);
stack[1] = 1;
Console.WriteLine(string.Join(",", stack.ToArray()) + " " + stack.ToString());
Span<int> fromList = stackalloc[] { 1, 2, 3 };
Console.WriteLine(fromList.Length + " " + fromList[2]);
ReadOnlySpan<char> text = "  Hello, World  ";
var trimmed = text.Trim();
Console.WriteLine("[" + trimmed.ToString() + "] " + trimmed.Length + " " + trimmed[0] + " " + trimmed.IndexOf(',') + " " + trimmed.StartsWith("Hell"));
var word = trimmed.Slice(7);
Console.WriteLine(word.ToString() + " " + word.SequenceEqual("World") + " " + word.EndsWith("ld") + " " + new string(word) + " " + word.ToString().Length);
string line = "12,345,6789";
int comma = line.IndexOf(',');
int first = int.Parse(line.AsSpan(0, comma));
int second = int.Parse(line.AsSpan(comma + 1, 3));
Console.WriteLine(first + second + " " + double.Parse("2.5".AsSpan()) + " " + int.TryParse("x1".AsSpan(), out var bad) + bad);
var sb = new StringBuilder();
sb.Append("ab".AsSpan()).Append(word);
Console.WriteLine(sb.ToString());
char[] buffer = new char[5];
"hello".AsSpan().ToUpperInvariant(buffer);
Console.WriteLine(new string(buffer));
ReadOnlySpan<int> ro = data;
Console.WriteLine(ro.Length + " " + ro[1] + " " + ro.ToString() + " " + (ro == data) + " " + (span == span.Slice(0)) + " " + (span == span.Slice(1)));
Span<char> chars = stackalloc char[3];
chars[0] = 'x'; chars[1] = 'y'; chars[2] = 'z';
Console.WriteLine(chars.ToString() + " " + chars.Length);
Memory<int> memory = data.AsMemory(1, 2);
Console.WriteLine(memory.Length + " " + memory.Span[0] + " " + memory.ToString());
ReadOnlyMemory<char> rom = "abcdef".AsMemory(2);
Console.WriteLine(rom.Span.ToString() + " " + rom.Slice(1, 2).ToString());
var segment = new ArraySegment<int>(data, 1, 3);
Console.WriteLine(segment.Count + " " + segment[0] + " " + string.Join(",", segment) + " " + segment.Offset);
Console.WriteLine(Sum(data) + " " + Sum(stackalloc int[] { 1, 2, 3 }) + " " + Count("banana".AsSpan(), 'a'));
try { var s = span[10]; } catch (IndexOutOfRangeException e) { Console.WriteLine(e.Message); }
try { span.Slice(4, 10); } catch (ArgumentOutOfRangeException e) { Console.WriteLine(e.GetType().Name); }
var dest = new int[2];
Console.WriteLine(span.TryCopyTo(dest) + " " + span.Slice(0, 2).TryCopyTo(dest) + " " + string.Join(",", dest));
static int Sum(ReadOnlySpan<int> values) { int total = 0; for (int i = 0; i < values.Length; i++) total += values[i]; return total; }
static int Count(ReadOnlySpan<char> s, char c) => s.Count(c);

// Output:
// 50 6 2 False
// 50,30,8,1,9,2 3 30,8,1
// 4 8 30,8,1,9
// 100
// 1,2,8,9,30,50 3 False 4
// 50,30,9,8,2,1
// 7,1,7,7 System.Span<Int32>[4]
// 3 3
// [Hello, World] 12 H 5 True
// World True True World 5
// 357 2.5 False0
// abWorld
// HELLO
// 6 30 System.ReadOnlySpan<Int32>[6] True True False
// xyz 3
// 2 30 System.Memory<Int32>[2]
// cdef de
// 3 30 30,9,8 1
// 100 6 3
// Index was outside the bounds of the array.
// ArgumentOutOfRangeException
// False True 50,30
