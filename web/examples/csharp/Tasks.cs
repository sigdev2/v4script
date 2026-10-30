// async and await: tasks that wait, run side by side and report progress;
// the run goes on in timers while the tasks wait.
async Task<int> Brew(string drink, int minutes)
{
    Console.WriteLine($"{drink}: started");
    for (int minute = 1; minute <= minutes; minute++)
        await Task.Delay(100);
    Console.WriteLine($"{drink}: ready after {minutes} min");
    return minutes;
}

var orders = new[] { Brew("tea", 3), Brew("coffee", 2), Brew("cocoa", 4) };
int[] times = await Task.WhenAll(orders);
Console.WriteLine($"All ready: {times.Sum()} minutes of brewing in {times.Max()} minutes");

var first = await Task.WhenAny(Brew("espresso", 1), Brew("latte", 3));
Console.WriteLine($"The first was ready in {first.Result} min");
