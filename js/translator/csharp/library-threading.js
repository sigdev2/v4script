// C#: System.Threading and System.Threading.Tasks - threads and tasks
// are fibers of the scheduler (natives in runtime-tasks.js); [V4Fiber]
// marks the methods that wait (their callers become fibers), iterators
// and their enumerators.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    if (CS.library.units['threading.tasks/Task'])
        return;

    CS.addLibrary('threading.tasks', String.raw`
using System.Collections.Generic;
using System.Runtime.CompilerServices;
namespace System.Threading.Tasks;

public enum TaskStatus
{
    Created = 0, WaitingForActivation = 1, WaitingToRun = 2, Running = 3, WaitingForChildrenToComplete = 4,
    RanToCompletion = 5, Canceled = 6, Faulted = 7
}

public class Task : IDisposable
{
    public extern Task(Action action);
    public extern Task(Action action, CancellationToken cancellationToken);
    public static Task CompletedTask => FromResult<VoidTaskResult>(default(VoidTaskResult));
    public extern int Id { get; }
    public extern TaskStatus Status { get; }
    public bool IsCompleted => Status == TaskStatus.RanToCompletion || Status == TaskStatus.Faulted || Status == TaskStatus.Canceled;
    public bool IsCompletedSuccessfully => Status == TaskStatus.RanToCompletion;
    public bool IsFaulted => Status == TaskStatus.Faulted;
    public bool IsCanceled => Status == TaskStatus.Canceled;
    public extern AggregateException Exception { get; }
    public static int? CurrentId => null;
    public static TaskFactory Factory { get; } = new TaskFactory();
    public extern void Start();
    [V4Fiber] public extern void Wait();
    [V4Fiber] public extern bool Wait(int millisecondsTimeout);
    [V4Fiber] public extern bool Wait(TimeSpan timeout);
    [V4Fiber] public extern void Wait(CancellationToken cancellationToken);
    public extern Task ContinueWith(Action<Task> continuationAction);
    public extern Task<TResult> ContinueWith<TResult>(Func<Task, TResult> continuationFunction);
    public TaskAwaiter GetAwaiter() => new TaskAwaiter(this);
    public ConfiguredTaskAwaitable ConfigureAwait(bool continueOnCapturedContext) => new ConfiguredTaskAwaitable(this);
    public void Dispose() { }
    public static extern Task Run(Action action);
    public static extern Task Run(Action action, CancellationToken cancellationToken);
    public static extern Task<TResult> Run<TResult>(Func<TResult> function);
    public static extern Task<TResult> Run<TResult>(Func<TResult> function, CancellationToken cancellationToken);
    public static extern Task Run(Func<Task> function);
    public static extern Task Run(Func<Task> function, CancellationToken cancellationToken);
    public static extern Task<TResult> Run<TResult>(Func<Task<TResult>> function);
    public static extern Task<TResult> Run<TResult>(Func<Task<TResult>> function, CancellationToken cancellationToken);
    public static extern Task Delay(int millisecondsDelay);
    public static extern Task Delay(int millisecondsDelay, CancellationToken cancellationToken);
    public static Task Delay(TimeSpan delay) => Delay((int)delay.TotalMilliseconds);
    public static Task Delay(TimeSpan delay, CancellationToken cancellationToken) => Delay((int)delay.TotalMilliseconds, cancellationToken);
    public static extern Task WhenAll(params Task[] tasks);
    public static Task WhenAll(IEnumerable<Task> tasks) => WhenAll(new List<Task>(tasks).ToArray());
    public static extern Task<TResult[]> WhenAll<TResult>(params Task<TResult>[] tasks);
    public static Task<TResult[]> WhenAll<TResult>(IEnumerable<Task<TResult>> tasks) => WhenAll(new List<Task<TResult>>(tasks).ToArray());
    public static extern Task<Task> WhenAny(params Task[] tasks);
    public static Task<Task> WhenAny(IEnumerable<Task> tasks) => WhenAny(new List<Task>(tasks).ToArray());
    public static extern Task<Task<TResult>> WhenAny<TResult>(params Task<TResult>[] tasks);
    public static Task<Task<TResult>> WhenAny<TResult>(IEnumerable<Task<TResult>> tasks) => WhenAny(new List<Task<TResult>>(tasks).ToArray());
    [V4Fiber] public static extern void WaitAll(params Task[] tasks);
    [V4Fiber] public static extern int WaitAny(params Task[] tasks);
    public static extern Task<TResult> FromResult<TResult>(TResult result);
    public static extern Task FromException(Exception exception);
    public static extern Task<TResult> FromException<TResult>(Exception exception);
    public static extern Task FromCanceled(CancellationToken cancellationToken);
    public static YieldAwaitable Yield() => new YieldAwaitable();
}

internal struct VoidTaskResult { }

public class Task<TResult> : Task
{
    public extern Task(Func<TResult> function);
    [V4Fiber] public extern TResult Result { get; }
    public new TaskAwaiter<TResult> GetAwaiter() => new TaskAwaiter<TResult>(this);
    public new ConfiguredTaskAwaitable<TResult> ConfigureAwait(bool continueOnCapturedContext) => new ConfiguredTaskAwaitable<TResult>(this);
    public extern Task ContinueWith(Action<Task<TResult>> continuationAction);
    public extern Task<TNewResult> ContinueWith<TNewResult>(Func<Task<TResult>, TNewResult> continuationFunction);
}

public class TaskFactory
{
    public Task StartNew(Action action) => Task.Run(action);
    public Task<TResult> StartNew<TResult>(Func<TResult> function) => Task.Run(function);
}

public class TaskCompletionSource<TResult>
{
    private readonly Task<TResult> _task;
    public TaskCompletionSource() { _task = NewTask(); }
    public TaskCompletionSource(object state) { _task = NewTask(); }
    private static extern Task<TResult> NewTask();
    public Task<TResult> Task => _task;
    public void SetResult(TResult result)
    {
        if (!TrySetResult(result))
            throw new InvalidOperationException("An attempt was made to transition a task to a final state when it had already completed.");
    }
    public void SetException(Exception exception)
    {
        if (!TrySetException(exception))
            throw new InvalidOperationException("An attempt was made to transition a task to a final state when it had already completed.");
    }
    public void SetCanceled()
    {
        if (!TrySetCanceled())
            throw new InvalidOperationException("An attempt was made to transition a task to a final state when it had already completed.");
    }
    public extern bool TrySetResult(TResult result);
    public extern bool TrySetException(Exception exception);
    public extern bool TrySetCanceled();
}

public class TaskCompletionSource
{
    private readonly TaskCompletionSource<VoidTaskResult> _source = new TaskCompletionSource<VoidTaskResult>();
    public Task Task => _source.Task;
    public void SetResult() => _source.SetResult(default(VoidTaskResult));
    public bool TrySetResult() => _source.TrySetResult(default(VoidTaskResult));
    public void SetException(Exception exception) => _source.SetException(exception);
    public bool TrySetException(Exception exception) => _source.TrySetException(exception);
    public void SetCanceled() => _source.SetCanceled();
    public bool TrySetCanceled() => _source.TrySetCanceled();
}

public readonly struct ValueTask : IEquatable<ValueTask>
{
    internal readonly Task _task;
    public ValueTask(Task task) { _task = task; }
    public static ValueTask CompletedTask => default(ValueTask);
    public bool IsCompleted => _task == null || _task.IsCompleted;
    public bool IsCompletedSuccessfully => _task == null || _task.IsCompletedSuccessfully;
    public bool IsFaulted => _task != null && _task.IsFaulted;
    public bool IsCanceled => _task != null && _task.IsCanceled;
    public Task AsTask() => _task ?? Task.CompletedTask;
    public static ValueTask FromResult() => default(ValueTask);
    public static ValueTask<TResult> FromResult<TResult>(TResult result) => new ValueTask<TResult>(result);
    public ValueTaskAwaiter GetAwaiter() => new ValueTaskAwaiter(AsTask());
    public bool Equals(ValueTask other) => (object)_task == other._task;
    public override bool Equals(object obj) => obj is ValueTask other && Equals(other);
    public override int GetHashCode() => _task?.GetHashCode() ?? 0;
}

public readonly struct ValueTask<TResult> : IEquatable<ValueTask<TResult>>
{
    internal readonly Task<TResult> _task;
    internal readonly TResult _result;
    public ValueTask(TResult result)
    {
        _result = result;
        _task = null;
    }
    public ValueTask(Task<TResult> task)
    {
        _task = task;
        _result = default(TResult);
    }
    public bool IsCompleted => _task == null || _task.IsCompleted;
    public bool IsCompletedSuccessfully => _task == null || _task.IsCompletedSuccessfully;
    public bool IsFaulted => _task != null && _task.IsFaulted;
    public bool IsCanceled => _task != null && _task.IsCanceled;
    public TResult Result => _task == null ? _result : _task.Result;
    public Task<TResult> AsTask() => _task ?? Task.FromResult(_result);
    public ValueTaskAwaiter<TResult> GetAwaiter() => new ValueTaskAwaiter<TResult>(AsTask());
    public bool Equals(ValueTask<TResult> other) => (object)_task == other._task && EqualityComparer<TResult>.Default.Equals(_result, other._result);
    public override bool Equals(object obj) => obj is ValueTask<TResult> other && Equals(other);
    public override int GetHashCode() => _task?.GetHashCode() ?? (_result?.GetHashCode() ?? 0);
    public override string ToString() => _task == null ? (_result?.ToString() ?? "") : (_task.IsCompletedSuccessfully ? _task.Result?.ToString() ?? "" : "");
}

public class TaskCanceledException : OperationCanceledException
{
    public TaskCanceledException() : base("A task was canceled.") { }
    public TaskCanceledException(string message) : base(message) { }
    public TaskCanceledException(string message, Exception innerException) : base(message, innerException) { }
}

public static class Parallel
{
    public static ParallelLoopResult For(int fromInclusive, int toExclusive, Action<int> body)
    {
        for (int i = fromInclusive; i < toExclusive; i++)
            body(i);
        return new ParallelLoopResult();
    }
    public static ParallelLoopResult For(long fromInclusive, long toExclusive, Action<long> body)
    {
        for (long i = fromInclusive; i < toExclusive; i++)
            body(i);
        return new ParallelLoopResult();
    }
    public static ParallelLoopResult ForEach<TSource>(IEnumerable<TSource> source, Action<TSource> body)
    {
        foreach (var item in source)
            body(item);
        return new ParallelLoopResult();
    }
    public static void Invoke(params Action[] actions)
    {
        foreach (var action in actions)
            action();
    }
}

public struct ParallelLoopResult
{
    public bool IsCompleted => true;
}
`);

    CS.addLibrary('runtime.compilerservices', String.raw`
using System.Threading.Tasks;
namespace System.Runtime.CompilerServices;

public interface INotifyCompletion
{
    void OnCompleted(Action continuation);
}

public interface ICriticalNotifyCompletion : INotifyCompletion
{
    void UnsafeOnCompleted(Action continuation);
}

public readonly struct TaskAwaiter : ICriticalNotifyCompletion
{
    internal readonly Task _task;
    internal TaskAwaiter(Task task) { _task = task; }
    public bool IsCompleted => _task.IsCompleted;
    public extern void GetResult();
    public extern void OnCompleted(Action continuation);
    public void UnsafeOnCompleted(Action continuation) => OnCompleted(continuation);
}

public readonly struct TaskAwaiter<TResult> : ICriticalNotifyCompletion
{
    internal readonly Task<TResult> _task;
    internal TaskAwaiter(Task<TResult> task) { _task = task; }
    public bool IsCompleted => _task.IsCompleted;
    public extern TResult GetResult();
    public extern void OnCompleted(Action continuation);
    public void UnsafeOnCompleted(Action continuation) => OnCompleted(continuation);
}

public readonly struct ValueTaskAwaiter : ICriticalNotifyCompletion
{
    internal readonly Task _task;
    internal ValueTaskAwaiter(Task task) { _task = task; }
    public bool IsCompleted => _task.IsCompleted;
    public void GetResult() => new TaskAwaiter(_task).GetResult();
    public void OnCompleted(Action continuation) => new TaskAwaiter(_task).OnCompleted(continuation);
    public void UnsafeOnCompleted(Action continuation) => OnCompleted(continuation);
}

public readonly struct ValueTaskAwaiter<TResult> : ICriticalNotifyCompletion
{
    internal readonly Task<TResult> _task;
    internal ValueTaskAwaiter(Task<TResult> task) { _task = task; }
    public bool IsCompleted => _task.IsCompleted;
    public TResult GetResult() => new TaskAwaiter<TResult>(_task).GetResult();
    public void OnCompleted(Action continuation) => new TaskAwaiter<TResult>(_task).OnCompleted(continuation);
    public void UnsafeOnCompleted(Action continuation) => OnCompleted(continuation);
}

public readonly struct ConfiguredTaskAwaitable
{
    internal readonly Task _task;
    internal ConfiguredTaskAwaitable(Task task) { _task = task; }
    public ConfiguredTaskAwaiter GetAwaiter() => new ConfiguredTaskAwaiter(_task);
    public readonly struct ConfiguredTaskAwaiter : ICriticalNotifyCompletion
    {
        internal readonly Task _task;
        internal ConfiguredTaskAwaiter(Task task) { _task = task; }
        public bool IsCompleted => _task.IsCompleted;
        public void GetResult() => new TaskAwaiter(_task).GetResult();
        public void OnCompleted(Action continuation) => new TaskAwaiter(_task).OnCompleted(continuation);
        public void UnsafeOnCompleted(Action continuation) => OnCompleted(continuation);
    }
}

public readonly struct ConfiguredTaskAwaitable<TResult>
{
    internal readonly Task<TResult> _task;
    internal ConfiguredTaskAwaitable(Task<TResult> task) { _task = task; }
    public ConfiguredTaskAwaiter GetAwaiter() => new ConfiguredTaskAwaiter(_task);
    public readonly struct ConfiguredTaskAwaiter : ICriticalNotifyCompletion
    {
        internal readonly Task<TResult> _task;
        internal ConfiguredTaskAwaiter(Task<TResult> task) { _task = task; }
        public bool IsCompleted => _task.IsCompleted;
        public TResult GetResult() => new TaskAwaiter<TResult>(_task).GetResult();
        public void OnCompleted(Action continuation) => new TaskAwaiter<TResult>(_task).OnCompleted(continuation);
        public void UnsafeOnCompleted(Action continuation) => OnCompleted(continuation);
    }
}

public readonly struct YieldAwaitable
{
    public YieldAwaiter GetAwaiter() => new YieldAwaiter();
    public readonly struct YieldAwaiter : ICriticalNotifyCompletion
    {
        public bool IsCompleted => false;
        public void GetResult() { }
        public extern void OnCompleted(Action continuation);
        public void UnsafeOnCompleted(Action continuation) => OnCompleted(continuation);
    }
}

// The enumerable and enumerator of an iterator (yield return): the
// generator of its body runs on MoveNext.
internal sealed class Iterator<T> : System.Collections.Generic.IEnumerable<T>, System.Collections.Generic.IEnumerator<T>
{
    public extern System.Collections.Generic.IEnumerator<T> GetEnumerator();
    System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => GetEnumerator();
    public extern bool MoveNext();
    public extern T Current { get; }
    object System.Collections.IEnumerator.Current => Current;
    public void Reset() => throw new NotSupportedException("Specified method is not supported.");
    public extern void Dispose();
}

// An async iterator (async and yield return).
internal sealed class AsyncIterator<T> : System.Collections.Generic.IAsyncEnumerable<T>, System.Collections.Generic.IAsyncEnumerator<T>
{
    public extern System.Collections.Generic.IAsyncEnumerator<T> GetAsyncEnumerator(System.Threading.CancellationToken cancellationToken = default);
    public extern ValueTask<bool> MoveNextAsync();
    public extern T Current { get; }
    public extern ValueTask DisposeAsync();
}

public sealed class IteratorStateMachineAttribute : Attribute
{
    public IteratorStateMachineAttribute(Type stateMachineType) { }
}

public sealed class AsyncStateMachineAttribute : Attribute
{
    public AsyncStateMachineAttribute(Type stateMachineType) { }
}

public sealed class EnumeratorCancellationAttribute : Attribute { }
`);

    CS.addLibrary('collections.async', String.raw`
using System.Threading;
using System.Threading.Tasks;
namespace System.Collections.Generic;

public interface IAsyncEnumerable<out T>
{
    IAsyncEnumerator<T> GetAsyncEnumerator(CancellationToken cancellationToken = default);
}

public interface IAsyncEnumerator<out T> : IAsyncDisposable
{
    T Current { get; }
    ValueTask<bool> MoveNextAsync();
}
`);

    CS.addLibrary('threading', String.raw`
using System.Threading.Tasks;
namespace System.Threading;

public delegate void ThreadStart();
public delegate void ParameterizedThreadStart(object obj);
public delegate void WaitCallback(object state);
public delegate void TimerCallback(object state);

public static class Timeout
{
    public const int Infinite = -1;
    public static readonly TimeSpan InfiniteTimeSpan = new TimeSpan(0, 0, 0, 0, -1);
}

public enum ThreadState
{
    Running = 0, StopRequested = 1, SuspendRequested = 2, Background = 4, Unstarted = 8, Stopped = 16, WaitSleepJoin = 32,
    Suspended = 64, AbortRequested = 128, Aborted = 256
}

public enum ThreadPriority { Lowest = 0, BelowNormal = 1, Normal = 2, AboveNormal = 3, Highest = 4 }

public sealed class Thread
{
    public extern Thread(ThreadStart start);
    public extern Thread(ParameterizedThreadStart start);
    public extern Thread(ThreadStart start, int maxStackSize);
    public extern void Start();
    public extern void Start(object parameter);
    [V4Fiber] public extern void Join();
    [V4Fiber] public extern bool Join(int millisecondsTimeout);
    [V4Fiber] public bool Join(TimeSpan timeout) => Join((int)timeout.TotalMilliseconds);
    [V4Fiber] public static extern void Sleep(int millisecondsTimeout);
    [V4Fiber] public static void Sleep(TimeSpan timeout) => Sleep((int)timeout.TotalMilliseconds);
    [V4Fiber] public static extern bool Yield();
    public static void SpinWait(int iterations) { }
    public static extern Thread CurrentThread { get; }
    public extern string Name { get; set; }
    public bool IsBackground { get; set; }
    public ThreadPriority Priority { get; set; } = ThreadPriority.Normal;
    public extern bool IsAlive { get; }
    public extern int ManagedThreadId { get; }
    public extern ThreadState ThreadState { get; }
    public bool IsThreadPoolThread => false;
}

public static class ThreadPool
{
    public static bool QueueUserWorkItem(WaitCallback callBack)
    {
        Task.Run(() => callBack(null));
        return true;
    }
    public static bool QueueUserWorkItem(WaitCallback callBack, object state)
    {
        Task.Run(() => callBack(state));
        return true;
    }
}

public static class Monitor
{
    public static extern void Enter(object obj);
    public static void Enter(object obj, ref bool lockTaken)
    {
        Enter(obj);
        lockTaken = true;
    }
    public static extern void Exit(object obj);
    public static extern bool TryEnter(object obj);
    public static bool TryEnter(object obj, int millisecondsTimeout) => TryEnter(obj);
    public static void TryEnter(object obj, ref bool lockTaken) { lockTaken = TryEnter(obj); }
    public static extern bool IsEntered(object obj);
    [V4Fiber] public static extern bool Wait(object obj);
    [V4Fiber] public static extern bool Wait(object obj, int millisecondsTimeout);
    public static extern void Pulse(object obj);
    public static extern void PulseAll(object obj);
}

public static class Interlocked
{
    public static extern int Increment(ref int location);
    public static extern long Increment(ref long location);
    public static extern int Decrement(ref int location);
    public static extern long Decrement(ref long location);
    public static extern int Add(ref int location1, int value);
    public static extern long Add(ref long location1, long value);
    public static extern int Exchange(ref int location1, int value);
    public static extern long Exchange(ref long location1, long value);
    public static extern double Exchange(ref double location1, double value);
    public static extern object Exchange(ref object location1, object value);
    public static extern T Exchange<T>(ref T location1, T value) where T : class;
    public static extern int CompareExchange(ref int location1, int value, int comparand);
    public static extern long CompareExchange(ref long location1, long value, long comparand);
    public static extern double CompareExchange(ref double location1, double value, double comparand);
    public static extern object CompareExchange(ref object location1, object value, object comparand);
    public static extern T CompareExchange<T>(ref T location1, T value, T comparand) where T : class;
    public static extern long Read(ref long location);
}

public static class Volatile
{
    public static int Read(ref int location) => location;
    public static bool Read(ref bool location) => location;
    public static void Write(ref int location, int value) { location = value; }
    public static void Write(ref bool location, bool value) { location = value; }
}

public class SynchronizationLockException : SystemException
{
    public SynchronizationLockException() : base("Object synchronization method was called from an unsynchronized block of code.") { }
    public SynchronizationLockException(string message) : base(message) { }
}

public class ThreadInterruptedException : SystemException
{
    public ThreadInterruptedException() : base("Thread was interrupted from a waiting state.") { }
}

public sealed class CancellationTokenSource : IDisposable
{
    private bool _canceled;
    private System.Collections.Generic.List<Action> _callbacks = new System.Collections.Generic.List<Action>();
    public CancellationTokenSource() { }
    public CancellationTokenSource(int millisecondsDelay) { CancelAfter(millisecondsDelay); }
    public CancellationTokenSource(TimeSpan delay) { CancelAfter(delay); }
    public bool IsCancellationRequested => _canceled;
    public CancellationToken Token => new CancellationToken(this);
    public void Cancel()
    {
        if (_canceled)
            return;
        _canceled = true;
        var callbacks = _callbacks.ToArray();
        _callbacks.Clear();
        for (int i = callbacks.Length - 1; i >= 0; i--)
            callbacks[i]();
    }
    public void Cancel(bool throwOnFirstException) => Cancel();
    public Task CancelAsync()
    {
        Cancel();
        return Task.CompletedTask;
    }
    public extern void CancelAfter(int millisecondsDelay);
    public void CancelAfter(TimeSpan delay) => CancelAfter((int)delay.TotalMilliseconds);
    internal void Register(Action callback)
    {
        if (_canceled)
            callback();
        else
            _callbacks.Add(callback);
    }
    internal void Unregister(Action callback) => _callbacks.Remove(callback);
    public void Dispose() { }
    public static CancellationTokenSource CreateLinkedTokenSource(CancellationToken token1, CancellationToken token2)
    {
        var source = new CancellationTokenSource();
        token1.Register(source.Cancel);
        token2.Register(source.Cancel);
        return source;
    }
    public static CancellationTokenSource CreateLinkedTokenSource(params CancellationToken[] tokens)
    {
        var source = new CancellationTokenSource();
        foreach (var token in tokens)
            token.Register(source.Cancel);
        return source;
    }
}

public readonly struct CancellationToken : IEquatable<CancellationToken>
{
    private readonly CancellationTokenSource _source;
    internal CancellationToken(CancellationTokenSource source) { _source = source; }
    public CancellationToken(bool canceled)
    {
        _source = null;
        if (canceled)
        {
            _source = new CancellationTokenSource();
            _source.Cancel();
        }
    }
    public static CancellationToken None => default(CancellationToken);
    public bool IsCancellationRequested => _source != null && _source.IsCancellationRequested;
    public bool CanBeCanceled => _source != null;
    public void ThrowIfCancellationRequested()
    {
        if (IsCancellationRequested)
            throw new OperationCanceledException("The operation was canceled.", this);
    }
    public CancellationTokenRegistration Register(Action callback)
    {
        if (_source != null)
            _source.Register(callback);
        return new CancellationTokenRegistration(_source, callback);
    }
    public CancellationTokenRegistration Register(Action<object> callback, object state) => Register(() => callback(state));
    public bool Equals(CancellationToken other) => (object)_source == other._source;
    public override bool Equals(object obj) => obj is CancellationToken other && Equals(other);
    public override int GetHashCode() => _source?.GetHashCode() ?? 0;
    public static bool operator ==(CancellationToken left, CancellationToken right) => left.Equals(right);
    public static bool operator !=(CancellationToken left, CancellationToken right) => !left.Equals(right);
}

public readonly struct CancellationTokenRegistration : IDisposable
{
    private readonly CancellationTokenSource _source;
    private readonly Action _callback;
    internal CancellationTokenRegistration(CancellationTokenSource source, Action callback)
    {
        _source = source;
        _callback = callback;
    }
    public void Dispose() => _source?.Unregister(_callback);
    public bool Unregister()
    {
        _source?.Unregister(_callback);
        return true;
    }
}

public class SemaphoreSlim : IDisposable
{
    private int _count;
    private readonly int _max;
    private readonly System.Collections.Generic.Queue<TaskCompletionSource<bool>> _waiters = new System.Collections.Generic.Queue<TaskCompletionSource<bool>>();
    public SemaphoreSlim(int initialCount) : this(initialCount, int.MaxValue) { }
    public SemaphoreSlim(int initialCount, int maxCount)
    {
        if (initialCount < 0 || initialCount > maxCount)
            throw new ArgumentOutOfRangeException("initialCount", initialCount, "The initialCount argument must be non-negative and less than or equal to the maximumCount.");
        _count = initialCount;
        _max = maxCount;
    }
    public int CurrentCount => _count;
    [V4Fiber] public void Wait() => WaitAsync().Wait();
    [V4Fiber] public bool Wait(int millisecondsTimeout)
    {
        if (_count > 0)
        {
            _count--;
            return true;
        }
        if (millisecondsTimeout == 0)
            return false;
        WaitAsync().Wait();
        return true;
    }
    public Task WaitAsync()
    {
        if (_count > 0)
        {
            _count--;
            return Task.CompletedTask;
        }
        var source = new TaskCompletionSource<bool>();
        _waiters.Enqueue(source);
        return source.Task;
    }
    public Task WaitAsync(CancellationToken cancellationToken) => WaitAsync();
    public int Release() => Release(1);
    public int Release(int releaseCount)
    {
        int previous = _count;
        if (releaseCount < 1)
            throw new ArgumentOutOfRangeException("releaseCount", releaseCount, "Non-negative number required.");
        if (_max - _count < releaseCount)
            throw new SemaphoreFullException();
        for (int i = 0; i < releaseCount; i++)
        {
            if (_waiters.Count > 0)
                _waiters.Dequeue().SetResult(true);
            else
                _count++;
        }
        return previous;
    }
    public void Dispose() { }
}

public class SemaphoreFullException : SystemException
{
    public SemaphoreFullException() : base("Adding the specified count to the semaphore would cause it to exceed its maximum count.") { }
}

public class ManualResetEventSlim : IDisposable
{
    private TaskCompletionSource<bool> _source = new TaskCompletionSource<bool>();
    public ManualResetEventSlim() { }
    public ManualResetEventSlim(bool initialState)
    {
        if (initialState)
            _source.SetResult(true);
    }
    public bool IsSet => _source.Task.IsCompleted;
    public void Set() => _source.TrySetResult(true);
    public void Reset()
    {
        if (_source.Task.IsCompleted)
            _source = new TaskCompletionSource<bool>();
    }
    [V4Fiber] public void Wait() => _source.Task.Wait();
    public void Dispose() { }
}

public class CountdownEvent : IDisposable
{
    private int _count;
    private readonly TaskCompletionSource<bool> _source = new TaskCompletionSource<bool>();
    public CountdownEvent(int initialCount)
    {
        _count = initialCount;
        if (initialCount == 0)
            _source.SetResult(true);
    }
    public int CurrentCount => _count;
    public bool IsSet => _count == 0;
    public bool Signal()
    {
        if (_count <= 0)
            throw new InvalidOperationException("Invalid attempt made to decrement the event's count below zero.");
        _count--;
        if (_count == 0)
            _source.TrySetResult(true);
        return _count == 0;
    }
    public void AddCount() => _count++;
    [V4Fiber] public void Wait() => _source.Task.Wait();
    public void Dispose() { }
}

public sealed class Timer : IDisposable
{
    private readonly TimerCallback _callback;
    private readonly object _state;
    private int _generation;
    public Timer(TimerCallback callback, object state, int dueTime, int period)
    {
        _callback = callback;
        _state = state;
        Change(dueTime, period);
    }
    public Timer(TimerCallback callback, object state, TimeSpan dueTime, TimeSpan period)
        : this(callback, state, (int)dueTime.TotalMilliseconds, (int)period.TotalMilliseconds) { }
    public bool Change(int dueTime, int period)
    {
        int generation = ++_generation;
        if (dueTime >= 0)
            Run(generation, dueTime, period);
        return true;
    }
    private async void Run(int generation, int dueTime, int period)
    {
        await Task.Delay(dueTime);
        while (generation == _generation)
        {
            _callback(_state);
            if (period <= 0)
                break;
            await Task.Delay(period);
        }
    }
    public void Dispose() { _generation++; }
}
`);
})(globalThis);
