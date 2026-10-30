// Iterators, async and await, Task.WhenAll, Task.Run, async streams,
// TaskCompletionSource, cancellation, threads with Join, Interlocked, lock.
IEnumerable<int> Fib(int n)
{
    int a = 0, b = 1;
    for (int i = 0; i < n; i++)
    {
        yield return a;
        (a, b) = (b, a + b);
    }
}
Console.WriteLine(string.Join(",", Fib(10)));
IEnumerable<string> WithFinally()
{
    try
    {
        yield return "one";
        yield return "two";
    }
    finally
    {
        Console.WriteLine("cleanup");
    }
}
foreach (var s in WithFinally())
{
    Console.WriteLine(s);
    break;
}
Console.WriteLine(WithFinally().Count());
async Task<int> ComputeAsync(int x)
{
    await Task.Delay(10);
    return x * 2;
}
async Task Run()
{
    Console.WriteLine("start");
    int r = await ComputeAsync(21);
    Console.WriteLine("result " + r);
    var tasks = Enumerable.Range(1, 3).Select(i => ComputeAsync(i)).ToArray();
    int[] all = await Task.WhenAll(tasks);
    Console.WriteLine(string.Join(",", all));
    try
    {
        await Fail();
    }
    catch (InvalidOperationException e)
    {
        Console.WriteLine("caught " + e.Message);
    }
    var t = Task.Run(() => 5 + 5);
    Console.WriteLine(await t);
    await foreach (var v in Numbers())
        Console.Write(v + " ");
    Console.WriteLine();
}
async Task Fail()
{
    await Task.Yield();
    throw new InvalidOperationException("async failure");
}
async IAsyncEnumerable<int> Numbers()
{
    for (int i = 0; i < 3; i++)
    {
        await Task.Delay(1);
        yield return i;
    }
}
await Run();
var thread = new Thread(() =>
{
    for (int i = 0; i < 3; i++)
    {
        Console.WriteLine("worker " + i);
        Thread.Sleep(5);
    }
});
thread.Start();
thread.Join();
Console.WriteLine("joined");
var tcs = new TaskCompletionSource<string>();
_ = Task.Run(async () => { await Task.Delay(5); tcs.SetResult("done"); });
Console.WriteLine(await tcs.Task);
Console.WriteLine(ComputeAsync(4).Result);
var cts = new CancellationTokenSource();
cts.Cancel();
try { await Task.Delay(1000, cts.Token); }
catch (TaskCanceledException e) { Console.WriteLine("canceled: " + e.Message); }
int counter = 0;
var threads = new List<Thread>();
for (int i = 0; i < 4; i++)
{
    var th = new Thread(() => { for (int j = 0; j < 100; j++) Interlocked.Increment(ref counter); });
    threads.Add(th);
    th.Start();
}
threads.ForEach(x => x.Join());
Console.WriteLine(counter);
object gate = new object();
lock (gate) { Console.WriteLine("locked"); }

// Output:
// 0,1,1,2,3,5,8,13,21,34
// one
// cleanup
// cleanup
// 2
// start
// result 42
// 2,4,6
// caught async failure
// 10
// 0 1 2
// worker 0
// worker 1
// worker 2
// joined
// done
// 8
// canceled: A task was canceled.
// 400
// locked
