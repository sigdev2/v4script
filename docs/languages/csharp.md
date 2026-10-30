# C#

C# 12 without files, network and reflection, translated into JavaScript by
v4script. Classes, structs, records, interfaces, generics, delegates and
events, lambdas, LINQ, pattern matching, iterators, `async`/`await` and
threads behave as in .NET 8, the output matches .NET, and error messages
are those of `csc` and the .NET runtime. The .NET subset is written in C#
and translated on first use.

```csharp
record Item(string Name, decimal Price);

var items = new List<Item>();
string line;
while ((line = Console.ReadLine()) != null)
{
    var parts = line.Split(' ');
    items.Add(new Item(parts[0], decimal.Parse(parts[1])));
}
var top = items.MaxBy(item => item.Price);
Console.WriteLine($"Most expensive: {top.Name} ({top.Price:F2})");
Console.WriteLine(Greet(top.Name));   // a function of the host module "app"
items.Count                           // the value of the run
```

## A unit is a script

 - A unit is a C# script: **top-level statements, functions, variables and
   types** in any order (`csc` wants the types after the statements). The
   statements run in order; `return n;` at the top level ends the unit
   with the exit code `n`.
 - **A whole program.** A unit without top-level statements runs the
   `Main` of its first class that has one (`static void Main()`,
   `static int Main(string[] args)`, `static async Task Main()`): a
   `Program.cs` runs as it is. `args` is an empty array; a `Main` that
   returns an int other than 0 ends with `exit status N`.
 - **using** may be left out for the implicit usings of a console project
   (`System`, `System.Collections.Generic`, `System.IO`, `System.Linq`,
   `System.Threading`, `System.Threading.Tasks`) and for `System.Text`,
   `System.Text.RegularExpressions`, `System.Numerics`,
   `System.Diagnostics`, `V4Script` (JavaScript) and the global host
   modules. Other namespaces (`System.Globalization`,
   `System.Collections.ObjectModel`…) need `using`. A written `using` does
   no harm - so the code also builds with `csc`. `using` directives come
   first in a unit.
 - **Value.** If the last statement of the unit is an expression without a
   semicolon (`x * 2`, `Fib(20)`, `list`, `await F()`), the run returns
   it: numbers and booleans as they are, anything else as its `ToString()`
   (`System.Collections.Generic.List`1[System.Int32]`,
   `Point { X = 1, Y = 2 }`).
 - **Shared declarations.** Types, functions and top-level variables of
   one unit are visible in the other C# units. Running a unit again
   declares them again: a type and a function with the same signature
   replace the old ones, a variable declared again gets a new value (and
   may get a new type). Objects made before keep their old type.
 - A unit with a compile error does not change the shared declarations.

## What is supported

 - **Types**: all numeric types with overflow as in .NET (`int` is 32 bits,
   `long` and `ulong` 64 exact, `decimal` 96 bits with its rounding,
   `float` rounded to `float`, `nint` as `long`), `checked` and
   `unchecked`, `char` a UTF-16 unit, `string` with all common methods,
   nullable value types (`int?`, lifted operators, `??`, `??=`), nullable
   reference annotations (`string?`, `!` - not checked), `dynamic` (for
   JavaScript values), tuples with names, `var`, raw and verbatim strings,
   interpolated strings with alignment and formats, `default`, `nameof`,
   `sizeof`, `typeof`, `is`, `as`, casts with `InvalidCastException`.
 - **Classes and structs**: inheritance, `abstract`, `virtual`,
   `override`, `sealed`, `new`, `base`, static classes and constructors,
   `readonly` fields, `const`, properties (auto, `init`, `required`,
   expression-bodied), indexers, events (field-like and with
   `add`/`remove`), operators and conversions (`implicit`, `explicit`),
   `partial` classes, nested types, primary constructors, object and
   collection initializers, `with`; structs are copied by value,
   `ref struct` is an ordinary struct.
 - **Records** (`record`, `record struct`) with `Equals`, `GetHashCode`,
   `ToString`, deconstruction and `with` as in .NET.
 - **Interfaces** with default methods, static abstract and static virtual
   members (`T.Create()` where `T : IFactory<T>`), explicit implementation,
   variance (`out T`, `in T`).
 - **Generics**: classes, structs, interfaces, methods and delegates with
   constraints (`where T : class, IComparable<T>, new()`), inference of
   type arguments, `default(T)`, `typeof(T)`.
 - **Delegates and lambdas**: `Func`, `Action`, `Predicate`, own delegate
   types, multicast delegates (`+=`, `-=`), method groups, closures (one
   variable for all iterations of `for`, a new one for every `foreach`),
   local functions, `static` lambdas.
 - **Patterns**: type, declaration, constant, relational (`< 0`),
   logical (`and`, `or`, `not`), property (`{ Length: > 2 }`), positional
   (records, tuples), list patterns (`[1, .., var last]`), `var` and
   discards, in `is`, `switch` statements (with `when`, `goto case`) and
   `switch` expressions (`SwitchExpressionException` when nothing
   matches).
 - **Statements**: `for`, `foreach` (with deconstruction), `while`, `do`,
   `goto` to labels, `break`, `continue`, `try`/`catch` with filters
   (`when`)/`finally`, `throw` expressions, `using` statements and
   declarations (`IDisposable`, `IAsyncDisposable`), `lock`, `yield return`
   and `yield break`, `checked` blocks.
 - **Ranges and indices**: `^1`, `1..3` on arrays, strings and lists;
   rectangular (`int[,]`) and jagged arrays.
 - **LINQ**: all methods of `Enumerable` (deferred as in .NET) and the
   query syntax (`from`, `where`, `select`, `orderby`, `group … by … into`,
   `join … on … equals … into`, `let`), anonymous types.
 - **Async**: `async`/`await` on `Task`, `Task<T>`, `ValueTask`,
   `Task.WhenAll`, `WhenAny`, `Delay`, `Yield`, `Run`, `ContinueWith`,
   `TaskCompletionSource`, `CancellationTokenSource`, `async` iterators
   (`IAsyncEnumerable`, `await foreach`), `ConfigureAwait`. An `async`
   method runs synchronously until its first wait, as in .NET.
 - **Threads**: `Thread` (`Start`, `Join`, `Sleep`, `IsBackground`),
   `ThreadPool`, `Parallel.For`/`ForEach`, `lock` and `Monitor`
   (`Wait`, `Pulse`), `Interlocked`, `SemaphoreSlim`,
   `ManualResetEventSlim`, `CountdownEvent`, `Timer`. Threads take turns
   (they do not run in parallel) and switch only when one waits (`Sleep`,
   `Join`, `Wait`, `await`, `Monitor.Wait`). When all of them wait for
   time, the run ends and the program goes on in timers of the engine
   (see [programs that wait](README.md#shared-rules)). If all threads wait
   for each other, it is the error `deadlock: all threads are waiting`.
 - **The end of the program** comes when the top-level statements (and
   `Main`) and all foreground threads have ended.

## The standard library

| Namespace | What is there |
| --- | --- |
| `System` | `Object`, `String`, `Char`, the numeric types (`Parse`, `TryParse`, `ToString` with all standard and custom formats, `MinValue`…), `Math`, `MathF`, `Convert`, `BitConverter`, `Console` (`Write`, `ReadLine`, `Read`, `Out`, `Error`, `In`, `SetOut`, colors), `Array` (`Sort`, `BinarySearch`, `Resize`, `Fill`, `IndexOf`…), `Random` (the same numbers as .NET for the same seed), `DateTime`, `DateOnly`, `TimeOnly`, `TimeSpan`, `Guid`, `Enum` (`Parse`, `GetValues`, `HasFlag`, `[Flags]` names), `Nullable`, `Lazy`, `Tuple`, `ValueTuple`, `HashCode`, `Environment` (`NewLine`, `Exit`, `TickCount`), `Index`, `Range`, the delegates and the exceptions |
| `System.Collections.Generic` | `List`, `Dictionary`, `HashSet`, `SortedDictionary`, `SortedList`, `SortedSet`, `Queue`, `Stack`, `LinkedList`, `PriorityQueue`, `KeyValuePair`, `Comparer`, `EqualityComparer` and the interfaces |
| `System.Collections`, `.ObjectModel` | `ArrayList`, `Hashtable`, `IEnumerable`, `ReadOnlyCollection`, `Collection`, `ReadOnlyDictionary` |
| `System.Linq` | `Enumerable` (`Where`, `Select`, `OrderBy`, `GroupBy`, `Join`, `Zip`, `Chunk`, `MaxBy`, `ToLookup`, `Aggregate`…), `ILookup`, `IGrouping` |
| `System.Text` | `StringBuilder`, `Encoding` (UTF-8, ASCII, Latin-1, UTF-16, UTF-32) |
| `System.Text.RegularExpressions` | `Regex` (`Match`, `Matches`, `Replace` with `$1`, `${name}` and `MatchEvaluator`, `Split`, `Escape`, options), `Match`, `Group`, `GroupCollection`, `MatchCollection` |
| `System.Numerics` | `BigInteger` (arithmetic, `Pow`, `ModPow`, `GreatestCommonDivisor`, bit operations, conversions, formats) |
| `System.Threading`, `.Tasks` | see Async and Threads above |
| `System.IO` | `TextWriter`, `TextReader`, `StringWriter`, `StringReader`, `File` (`ReadAllText`, `ReadAllLines`, `Exists` - files of the host; writes stay in the engine), `StreamReader`, `Path` |
| `System.Globalization` | `CultureInfo.InvariantCulture`, `NumberStyles` |
| `System.Diagnostics` | `Stopwatch`, `Debug` (does nothing, as in a release build) |

 - `ToString` texts, formats (`{0:N2}`, `{x,8:F3}`, `"0.##"`, `"X8"`,
   `"P1"`), the order of `Dictionary` and `HashSet`, sorting (an unstable
   introsort, equal keys end up where .NET puts them), string comparison
   (`string.Compare` and `OrderBy` of strings sort as the invariant culture
   of .NET) and exception messages are those of .NET: a program prints the
   same as with `dotnet run`. The culture is invariant (`1,234.5`).
 - `Console.Out` and `Console.Error` keep their order (as in .NET, both
   write at once).
 - **Input**: `Console.ReadLine()`, `Console.Read()` and `Console.In` read
   standard input of the host; `ReadLine()` is `null` at the end of input,
   `Read()` is `-1`.

## JavaScript and host modules

The namespace `V4Script` (visible without `using`) works with JavaScript
values: a JavaScript value in C# is a `JsValue`.

| Member | What it does |
| --- | --- |
| `Js.Global` | the JavaScript global object |
| `v["name"]`, `v["name"] = value`, `v.Get("name")`, `v.Set("name", value)`, `v.Has("name")`, `v.Delete("name")` | a property of an object |
| `v[i]`, `v.Length`, `v.ToList()` | elements and length of an array (and a string) |
| `v.Call("method", arguments…)` | a method call; the result is a `JsValue` |
| `v.Invoke(arguments…)`, `v.New(arguments…)` | a call of a JavaScript function, `new` |
| `v.AsInt()`, `AsLong()`, `AsDouble()`, `AsBool()`, `AsString()` | the value as a number, boolean, string |
| `v.IsNull`, `IsUndefined`, `IsNumber`, `IsString`, `IsArray`, `IsFunction`, `TypeOf`, `Truthy` | checks |
| `v.Keys()`, `v.ToObject()` | property names; the whole value in C# (an array as `List<object>`, an object as `Dictionary<string, object>`) |
| `JsValue.Of(value)` | a C# value as a `JsValue`; strings, numbers and booleans convert to `JsValue` implicitly |

`dynamic` reads JavaScript values with the syntax of C#:
`dynamic point = Point(1, 2); double x = point.x;`. Drawing on a canvas
that the application put into the global variable `canvas` (as
[examples/canvas](../../examples/canvas) does):

```csharp
var ctx = Js.Global["canvas"].Call("getContext", "2d");
for (int i = 0; i < 10; i++)
{
    ctx["fillStyle"] = $"hsl({i * 36}, 70%, 50%)";
    ctx.Call("fillRect", i * 30, 20, 25, 100);
}
```

 - The arguments of `Call`, `Set`, `Invoke` go to JavaScript by their
   value: numbers as numbers (`long` and `decimal` too), `string` and
   `char` as strings, arrays and lists as arrays, dictionaries, records and
   anonymous objects as objects, an enum as the name of its member,
   `JsValue` as its value, a delegate as a JavaScript function.
 - A delegate can be given to JavaScript:
   `Js.Global["square"] = JsValue.Of((Func<int, int>)(x => x * x));` -
   JavaScript calls `square(7)`, the arguments are converted to the
   parameter types of the delegate and the result back.
 - A JavaScript exception is a `V4Script.JsException` with its text
   (`RangeError: …`) at the line of the call; `catch` catches it.
 - **Host modules**: a module `app` is the static class `App` with
   methods in PascalCase (`App.Greet("Ann")`, the property `App.Counter`
   for a getter); a unit sees the members of a global module without the
   class name (an implicit `using static App;`). Types: `int` is `long`,
   `number` `double`, `string` `string`, `bool` `bool`, `value` `JsValue`
   (a parameter takes any `object`), `array` `List<JsValue>`; optional
   parameters give overloads.

## Modules

A type that is not in the units and the library is looked up in the host
file with its name: `Mathx.Triple(5)` loads the host file `Mathx.cs` - a
file with types (namespaces too, no top-level statements). Its types are
visible to all C# units and may use other host files. A changed file is
translated again at the next run.

## Errors

 - Compile errors are those of `csc`, with the code and the line:
   `error CS0103: The name 'x' does not exist in the current context`,
   `error CS0029: Cannot implicitly convert type 'int' to 'string'`,
   `error CS1002: ; expected`,
   `error CS0161: 'F(int)': not all code paths return a value`,
   `error CS1501: No overload for method 'F' takes 2 arguments`. The first
   error stops the translation.
 - An unhandled exception is reported as by .NET, with the line where it
   was thrown:
   `Unhandled exception. System.DivideByZeroException: Attempted to divide by zero.`,
   `System.IndexOutOfRangeException: Index was outside the bounds of the array.`,
   `System.NullReferenceException: Object reference not set to an instance of an object.`,
   `System.Collections.Generic.KeyNotFoundException: The given key 'x' was not present in the dictionary.`
   Infinite recursion is `Stack overflow.` (it cannot be caught, as in
   .NET). An unhandled exception in a thread ends the program too.
 - `Environment.Exit(0)` ends the program without an error,
   `Environment.Exit(3)` is the error `exit status 3`.

## What is missing

 - Reflection beyond `GetType()`, `typeof`, `Type.Name`/`FullName`,
   attributes with an effect (`[Flags]`, `[Obsolete]` and others are
   parsed, `[Flags]` changes `ToString`), `unsafe` code and pointers,
   `fixed`, `stackalloc`, `Span<T>` and `Memory<T>`, generic math
   (`INumber<T>`, operators of type parameters), `System.Xml`, `System.Net`,
   `System.Text.Json`, LINQ to anything but objects, `Expression` trees,
   `Thread.Abort` and `Interrupt`, `async void` with a `SynchronizationContext`.
 - Files, network, processes, environment variables
   (`Environment.GetEnvironmentVariable` returns `null`).
 - **Definite assignment** is not checked (`CS0165`): an unassigned local
   reads its default value. Nullable warnings are not given.
 - **Access checks** are those of the compiler for members of the program;
   `internal` is `public`.
 - **Boxed values:** a boxed `int`, `bool` or `string` is the same
   JavaScript value as the unboxed one, so `(object)1 == (object)1` is
   `true` (`false` in .NET); `Equals` works as usual.
 - **Regular expressions** run on JavaScript `RegExp`: lookbehind, inline
   options inside a pattern (`(?i:…)`), balancing groups, conditionals and
   `RightToLeft` are not supported; the position of a group that repeats
   text before it inside the match may be the first occurrence.
 - `finally` blocks run when an unhandled exception ends the program (.NET
   ends it without them); the error has no stack trace (`at …` lines).
 - A unit that waits for time (`Task.Delay`, `Thread.Sleep`) goes on in
   timers; its value is not shown then.
 - If a method that other units already call is changed so that it starts
   to wait (`Thread.Sleep`, `Task.Wait`), run those units again.
 - The first C# run in an engine is slower than the next ones: the library
   is translated part by part at the first use of a type.

Shared rules: [languages](README.md#shared-rules). Internals:
[C# in the translator](../internals/csharp.md).
