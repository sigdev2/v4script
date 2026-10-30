// LINQ (methods and query syntax), anonymous types, records and the
// collections: List, Dictionary, HashSet, Queue, Stack, LinkedList,
// PriorityQueue.
var people = new List<Person>
{
    new("Ann", 31, "NY"), new("Bob", 25, "LA"), new("Cid", 31, "NY"), new("Dan", 19, "SF"), new("Eve", 25, "LA"), new("Fay", 40, "NY")
};
Console.WriteLine(string.Join(", ", people.Where(p => p.Age > 24).Select(p => p.Name)));
Console.WriteLine(string.Join(", ", people.OrderBy(p => p.Age).ThenByDescending(p => p.Name).Select(p => $"{p.Name}:{p.Age}")));
foreach (var g in people.GroupBy(p => p.City))
    Console.WriteLine($"{g.Key}: {g.Count()} avg {g.Average(p => p.Age):F1} [{string.Join("|", g.Select(p => p.Name))}]");
var byCity = people.ToLookup(p => p.City);
Console.WriteLine(byCity["LA"].Count() + " " + byCity.Count + " " + byCity.Contains("XX"));
var dict = people.ToDictionary(p => p.Name, p => p.Age);
Console.WriteLine(dict["Cid"] + " " + dict.Count + " " + dict.ContainsKey("Zed"));
Console.WriteLine(people.Max(p => p.Age) + " " + people.Min(p => p.Name) + " " + people.Sum(p => p.Age) + " " + people.Average(p => p.Age));
Console.WriteLine(people.MaxBy(p => p.Age)?.Name + " " + people.MinBy(p => p.Age)?.Name);
Console.WriteLine(people.Any(p => p.City == "SF") + " " + people.All(p => p.Age > 18) + " " + people.Count(p => p.Age == 25));
Console.WriteLine(string.Join(",", Enumerable.Range(1, 10).Where(n => n % 2 == 0).Select(n => n * n)));
Console.WriteLine(string.Join(",", new[] { 3, 1, 4, 1, 5, 9, 2, 6, 5, 3 }.Distinct().OrderDescending()));
Console.WriteLine(string.Join(",", new[] { 1, 2, 3 }.Zip(new[] { "a", "b", "c" }, (n, s) => s + n)));
Console.WriteLine(string.Join(",", new[] { 1, 2, 3, 4, 5 }.Skip(1).Take(3).Reverse()));
Console.WriteLine(string.Join(",", new[] { 1, 2, 3, 4, 5, 6, 7 }.Chunk(3).Select(c => c.Sum())));
Console.WriteLine(new[] { 1, 2, 3 }.Aggregate(0, (acc, x) => acc * 10 + x));
Console.WriteLine(string.Join(",", new[] { "b", "a", "c" }.Concat(new[] { "a" }).Union(new[] { "z" })));
Console.WriteLine(string.Join(",", new[] { 1, 2, 3, 4 }.Intersect(new[] { 2, 4, 6 })) + " " + string.Join(",", new[] { 1, 2, 3, 4 }.Except(new[] { 2 })));
var query = from p in people
            where p.Age >= 25
            orderby p.City, p.Name descending
            select new { p.Name, p.City };
foreach (var item in query)
    Console.WriteLine(item);
var joined = from p in people
             join c in new[] { ("NY", "New York"), ("LA", "Los Angeles") } on p.City equals c.Item1
             select p.Name + "@" + c.Item2;
Console.WriteLine(string.Join(", ", joined));
var grouped = from p in people group p.Name by p.Age into g orderby g.Key select $"{g.Key}={string.Join("+", g)}";
Console.WriteLine(string.Join(" ", grouped));
var set = new HashSet<int> { 5, 3, 8 };
set.Add(3); set.Add(1); set.Remove(5); set.Add(7);
Console.WriteLine(string.Join(",", set) + " " + set.Contains(8));
var d2 = new Dictionary<string, int> { ["a"] = 1, ["b"] = 2, ["c"] = 3 };
d2.Remove("b"); d2["d"] = 4; d2["b"] = 5;
Console.WriteLine(string.Join(",", d2.Select(kv => kv.Key + kv.Value)));
foreach (var (key, value) in d2) Console.Write(key + value + " ");
Console.WriteLine();
var queue = new Queue<string>(); queue.Enqueue("x"); queue.Enqueue("y"); Console.WriteLine(queue.Dequeue() + queue.Peek() + queue.Count);
var stack = new Stack<int>(new[] { 1, 2, 3 }); Console.WriteLine(stack.Pop() + " " + string.Join(",", stack));
var linked = new LinkedList<int>(); linked.AddLast(1); linked.AddFirst(0); linked.AddLast(2); Console.WriteLine(string.Join(",", linked) + " " + linked.First.Value + linked.Last.Value);
var pq = new PriorityQueue<string, int>();
pq.Enqueue("low", 5); pq.Enqueue("high", 1); pq.Enqueue("mid", 3); pq.Enqueue("high2", 1);
while (pq.Count > 0) Console.Write(pq.Dequeue() + " ");
Console.WriteLine();
var list = new List<int> { 5, 2, 8, 1, 9 };
list.Sort((a, b) => b.CompareTo(a));
Console.WriteLine(string.Join(",", list) + " " + list.IndexOf(8) + " " + list.Contains(3) + " " + list.BinarySearch(5, Comparer<int>.Create((a, b) => b.CompareTo(a))));
list.Insert(1, 7); list.RemoveAll(x => x < 3); list.Reverse();
Console.WriteLine(string.Join(",", list) + " " + list.Find(x => x > 7) + " " + list.FindIndex(x => x == 7) + " " + list.TrueForAll(x => x > 2));
Console.WriteLine(string.Join(",", list.ConvertAll(x => x * 10)) + " " + list.GetRange(1, 2).Sum() + " " + list.Capacity);
var words = new[] { "apple", "Banana", "cherry", "date", "Elder", "fig" };
Console.WriteLine(string.Join(",", words.OrderBy(w => w)));
Console.WriteLine(string.Join(",", words.OrderBy(w => w.Length).ThenBy(w => w)));
Console.WriteLine(string.Join(",", words.GroupBy(w => w.Length).Select(g => g.Key + ":" + g.Count())));
Console.WriteLine(words.FirstOrDefault(w => w.StartsWith("z")) ?? "none");
Console.WriteLine(words.Select((w, i) => i + w[0].ToString()).Last());
Console.WriteLine(string.Join(",", words.SelectMany(w => w.Take(2))));
record Person(string Name, int Age, string City);

// Output:
// Ann, Bob, Cid, Eve, Fay
// Dan:19, Eve:25, Bob:25, Cid:31, Ann:31, Fay:40
// NY: 3 avg 34.0 [Ann|Cid|Fay]
// LA: 2 avg 25.0 [Bob|Eve]
// SF: 1 avg 19.0 [Dan]
// 2 3 False
// 31 6 False
// 40 Ann 171 28.5
// Fay Dan
// True True 2
// 4,16,36,64,100
// 9,6,5,4,3,2,1
// a1,b2,c3
// 4,3,2
// 6,15,7
// 123
// b,a,c,z
// 2,4 1,3,4
// { Name = Eve, City = LA }
// { Name = Bob, City = LA }
// { Name = Fay, City = NY }
// { Name = Cid, City = NY }
// { Name = Ann, City = NY }
// Ann@New York, Bob@Los Angeles, Cid@New York, Eve@Los Angeles, Fay@New York
// 19=Dan 25=Bob+Eve 31=Ann+Cid 40=Fay
// 7,3,8,1 True
// a1,d4,c3,b5
// a1 d4 c3 b5
// xy1
// 3 2,1
// 0,1,2 02
// high high2 mid low
// 9,8,5,2,1 1 False 2
// 5,8,7,9 8 2 True
// 50,80,70,90 15 8
// apple,Banana,cherry,date,Elder,fig
// fig,date,apple,Elder,Banana,cherry
// 5:2,6:2,4:1,3:1
// none
// 5f
// a,p,B,a,c,h,d,a,E,l,f,i
