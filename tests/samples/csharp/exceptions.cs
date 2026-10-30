// Exceptions of the run time and the library with the messages of .NET,
// try/catch/finally, exception filters, inner exceptions, ToString.
void Try(string name, Action action)
{
    try { action(); }
    catch (Exception e) { Console.WriteLine(name + ": " + e.GetType().FullName + ": " + e.Message); }
}
int[] arr = new int[3];
Try("array", () => arr[5] = 1);
Try("list", () => Console.WriteLine(new List<int>()[0]));
Try("string", () => Console.WriteLine("abc"[5]));
Try("substring", () => Console.WriteLine("abc".Substring(5)));
Try("dict", () => Console.WriteLine(new Dictionary<string, int>()["x"]));
Try("dict add", () => { var d = new Dictionary<int, int> { [1] = 1 }; d.Add(1, 2); });
Try("null", () => { string s = null; Console.WriteLine(s.Length); });
Try("cast", () => { object o = "s"; Console.WriteLine((int)o); });
Try("cast2", () => { object o = 5; Console.WriteLine((string)o); });
Try("cast3", () => { object o = 5; Console.WriteLine((long)o); });
Try("parse", () => int.Parse("abc"));
Try("parse2", () => int.Parse("99999999999"));
Try("format", () => string.Format("{1}", 1));
Try("empty", () => new List<int>().First());
Try("single", () => new List<int> { 1, 2 }.Single());
Try("max", () => new List<int>().Max());
Try("nullable", () => { int? x = null; Console.WriteLine(x.Value); });
Try("queue", () => new Queue<int>().Dequeue());
Try("stack", () => new Stack<int>().Pop());
Try("enumerator", () => { var l = new List<int> { 1, 2 }; foreach (var x in l) l.Add(3); });
Try("arg", () => throw new ArgumentException("bad value", "name"));
Try("argnull", () => throw new ArgumentNullException("name"));
Try("argrange", () => throw new ArgumentOutOfRangeException("name", "too big"));
Try("argrange2", () => new List<int>().RemoveAt(0));
Try("invalid", () => throw new InvalidOperationException());
Try("notimpl", () => throw new NotImplementedException());
Try("custom", () => throw new MyException("mine"));
Try("convert", () => Convert.ToInt32("12x"));
Try("checked", () => { checked { byte b = 255; b++; } });
Try("checkedcast", () => { checked { int big = 300; byte b = (byte)big; } });
Try("keynotfound", () => throw new KeyNotFoundException());
Try("exception", () => throw new Exception());
Try("insufficient", () => { var a = new int[2]; Array.Copy(a, 0, a, 1, 5); });
Try("fmt", () => Console.WriteLine(string.Format("{0:Q}", 1)));
Try("divide", () => { int z = 0; Console.WriteLine(1 / z); });
Try("overflow", () => { int m = int.MinValue; Console.WriteLine(m / -1); });
try
{
    try { throw new InvalidOperationException("inner"); }
    finally { Console.WriteLine("finally 1"); }
}
catch (InvalidOperationException e) when (e.Message == "inner")
{
    Console.WriteLine("caught " + e.Message);
}
try { Rethrow(); }
catch (Exception e) { Console.WriteLine(e.GetType().Name + " " + e.InnerException?.Message); }
Console.WriteLine(new Exception("boom"));
Console.WriteLine(new InvalidOperationException("bad", new Exception("inner")).ToString());
Console.WriteLine(Test());
int Test()
{
    try { return 1; }
    finally { Console.WriteLine("in finally"); }
}
void Rethrow()
{
    try { throw new FormatException("f"); }
    catch (FormatException e) { throw new ApplicationException("wrapped", e); }
}
class MyException : Exception { public MyException(string m) : base(m) {} }

// Output:
// array: System.IndexOutOfRangeException: Index was outside the bounds of the array.
// list: System.ArgumentOutOfRangeException: Index was out of range. Must be non-negative and less than the size of the collection. (Parameter 'index')
// string: System.IndexOutOfRangeException: Index was outside the bounds of the array.
// substring: System.ArgumentOutOfRangeException: startIndex cannot be larger than length of string. (Parameter 'startIndex')
// dict: System.Collections.Generic.KeyNotFoundException: The given key 'x' was not present in the dictionary.
// dict add: System.ArgumentException: An item with the same key has already been added. Key: 1
// null: System.NullReferenceException: Object reference not set to an instance of an object.
// cast: System.InvalidCastException: Unable to cast object of type 'System.String' to type 'System.Int32'.
// cast2: System.InvalidCastException: Unable to cast object of type 'System.Int32' to type 'System.String'.
// cast3: System.InvalidCastException: Unable to cast object of type 'System.Int32' to type 'System.Int64'.
// parse: System.FormatException: The input string 'abc' was not in a correct format.
// parse2: System.OverflowException: Value was either too large or too small for an Int32.
// format: System.FormatException: Index (zero based) must be greater than or equal to zero and less than the size of the argument list.
// empty: System.InvalidOperationException: Sequence contains no elements
// single: System.InvalidOperationException: Sequence contains more than one element
// max: System.InvalidOperationException: Sequence contains no elements
// nullable: System.InvalidOperationException: Nullable object must have a value.
// queue: System.InvalidOperationException: Queue empty.
// stack: System.InvalidOperationException: Stack empty.
// enumerator: System.InvalidOperationException: Collection was modified; enumeration operation may not execute.
// arg: System.ArgumentException: bad value (Parameter 'name')
// argnull: System.ArgumentNullException: Value cannot be null. (Parameter 'name')
// argrange: System.ArgumentOutOfRangeException: too big (Parameter 'name')
// argrange2: System.ArgumentOutOfRangeException: Index was out of range. Must be non-negative and less than the size of the collection. (Parameter 'index')
// invalid: System.InvalidOperationException: Operation is not valid due to the current state of the object.
// notimpl: System.NotImplementedException: The method or operation is not implemented.
// custom: MyException: mine
// convert: System.FormatException: The input string '12x' was not in a correct format.
// checked: System.OverflowException: Arithmetic operation resulted in an overflow.
// checkedcast: System.OverflowException: Arithmetic operation resulted in an overflow.
// keynotfound: System.Collections.Generic.KeyNotFoundException: The given key was not present in the dictionary.
// exception: System.Exception: Exception of type 'System.Exception' was thrown.
// insufficient: System.ArgumentException: Source array was not long enough. Check the source index, length, and the array's lower bounds. (Parameter 'sourceArray')
// fmt: System.FormatException: Format specifier was invalid.
// divide: System.DivideByZeroException: Attempted to divide by zero.
// overflow: System.OverflowException: Arithmetic operation resulted in an overflow.
// finally 1
// caught inner
// ApplicationException f
// System.Exception: boom
// System.InvalidOperationException: bad
//  ---> System.Exception: inner
//    --- End of inner exception stack trace ---
// in finally
// 1
