// Java: java.util.concurrent over fibers. Threads take turns, so no locks
// are needed: synchronized does nothing, and a wait (take, await, get) is
// wait() until notifyAll(). The thread pool is as in the JDK: the worker
// threads pool-N-thread-M take tasks from a queue.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Java = T.java;
    if (Java.library.units['java.util.concurrent'])
        return;

    var i64 = T.i64;
    var HEADER = 'import java.util.*;\nimport java.util.function.*;\n';

    Java.addLibrary('java.util.concurrent', 'java.util.concurrent', HEADER + String.raw`
public enum TimeUnit {
    NANOSECONDS(1L), MICROSECONDS(1000L), MILLISECONDS(1000000L), SECONDS(1000000000L), MINUTES(60000000000L),
    HOURS(3600000000000L), DAYS(86400000000000L);

    private final long nanos;
    TimeUnit(long nanos) { this.nanos = nanos; }
    public long toNanos(long duration) { return duration * nanos; }
    public long toMicros(long duration) { return nanos >= 1000L ? duration * (nanos / 1000L) : duration / (1000L / nanos); }
    public long toMillis(long duration) { return nanos >= 1000000L ? duration * (nanos / 1000000L) : duration / (1000000L / nanos); }
    public long toSeconds(long duration) { return nanos >= 1000000000L ? duration * (nanos / 1000000000L) : duration / (1000000000L / nanos); }
    public long toMinutes(long duration) { return toSeconds(duration) / 60; }
    public long toHours(long duration) { return toSeconds(duration) / 3600; }
    public long toDays(long duration) { return toSeconds(duration) / 86400; }
    public long convert(long duration, TimeUnit unit) {
        return unit.nanos >= nanos ? duration * (unit.nanos / nanos) : duration / (nanos / unit.nanos);
    }
    public native void sleep(long timeout) throws InterruptedException;
}

public interface Callable<V> {
    V call() throws Exception;
}

public interface Future<V> {
    boolean cancel(boolean mayInterrupt);
    boolean isCancelled();
    boolean isDone();
    V get() throws InterruptedException, ExecutionException;
    default V resultNow() {
        if (!isDone())
            throw new IllegalStateException("Task has not completed");
        try {
            return get();
        } catch (Exception e) {
            throw new IllegalStateException("Task completed with exception");
        }
    }
}

public class ExecutionException extends Exception {
    public ExecutionException(Throwable cause) { super(cause); }
    public ExecutionException(String message, Throwable cause) { super(message, cause); }
}

public class RejectedExecutionException extends RuntimeException {
    public RejectedExecutionException() { super(); }
    public RejectedExecutionException(String message) { super(message); }
}

public class CancellationException extends IllegalStateException {
    public CancellationException() { super(); }
    public CancellationException(String message) { super(message); }
}

public class TimeoutException extends Exception {
    public TimeoutException() { super(); }
    public TimeoutException(String message) { super(message); }
}

// A task with a result: run() runs it in a thread, get() waits.
public class FutureTask<V> implements Future<V>, Runnable {
    private final Callable<V> callable;
    private V result;
    private Throwable failure;
    private boolean done;
    private boolean cancelled;
    public FutureTask(Callable<V> callable) { this.callable = Objects.requireNonNull(callable); }
    public FutureTask(Runnable task, V value) { this.callable = new RunnableAdapter<V>(Objects.requireNonNull(task), value); }

    static final class RunnableAdapter<V> implements Callable<V> {
        private final Runnable task;
        private final V value;
        RunnableAdapter(Runnable task, V value) {
            this.task = task;
            this.value = value;
        }
        public V call() {
            task.run();
            return value;
        }
    }
    public void run() {
        if (done)
            return;
        try {
            result = callable.call();
        } catch (Throwable e) {
            failure = e;
        }
        synchronized (this) {
            done = true;
            notifyAll();
        }
    }
    public V get() throws InterruptedException, ExecutionException {
        synchronized (this) {
            while (!done)
                wait();
        }
        if (cancelled)
            throw new CancellationException();
        if (failure != null)
            throw new ExecutionException(failure);
        return result;
    }
    public boolean cancel(boolean mayInterrupt) {
        if (done)
            return false;
        cancelled = true;
        done = true;
        synchronized (this) {
            notifyAll();
        }
        return true;
    }
    public boolean isCancelled() { return cancelled; }
    public boolean isDone() { return done; }
}

public interface Executor {
    void execute(Runnable command);
}

public interface ExecutorService extends Executor, AutoCloseable {
    void shutdown();
    List<Runnable> shutdownNow();
    boolean isShutdown();
    boolean isTerminated();
    boolean awaitTermination(long timeout, TimeUnit unit) throws InterruptedException;
    <T> Future<T> submit(Callable<T> task);
    Future<?> submit(Runnable task);
    <T> List<Future<T>> invokeAll(Collection<? extends Callable<T>> tasks) throws InterruptedException;
    void close();
}

final class ThreadPool implements ExecutorService {
    private static int pools = 0;
    private final int number;
    private final int size;
    private final ArrayDeque<Runnable> queue = new ArrayDeque<>();
    private final List<Worker> workers = new ArrayList<>();
    private int idle;
    private int created;
    private boolean shutdown;

    ThreadPool(int size) {
        this.number = ++pools;
        this.size = size;
    }

    final class Worker extends Thread {
        Worker(String name) { super(name); }
        public void run() {
            try {
                for (;;) {
                    Runnable task;
                    synchronized (ThreadPool.this) {
                        while (queue.isEmpty() && !shutdown) {
                            idle++;
                            ThreadPool.this.wait();
                            idle--;
                        }
                        if (queue.isEmpty())
                            return;
                        task = queue.removeFirst();
                    }
                    task.run();
                }
            } catch (InterruptedException e) {
                return;
            } finally {
                synchronized (ThreadPool.this) {
                    workers.remove(this);
                    ThreadPool.this.notifyAll();
                }
            }
        }
    }

    public void execute(Runnable command) {
        Objects.requireNonNull(command);
        if (shutdown)
            throw new RejectedExecutionException("Task " + command + " rejected from " + this);
        queue.addLast(command);
        // As ThreadPoolExecutor: a fixed pool adds a thread while there are
        // fewer than its size, even if one is idle; a cached one only when
        // none is idle.
        boolean grow = size == Integer.MAX_VALUE ? idle == 0 : workers.size() < size;
        if (grow) {
            Worker worker = new Worker("pool-" + number + "-thread-" + (++created));
            workers.add(worker);
            worker.start();
        } else {
            synchronized (this) {
                notifyAll();
            }
        }
    }
    public <T> Future<T> submit(Callable<T> task) {
        FutureTask<T> future = new FutureTask<>(task);
        execute(future);
        return future;
    }
    public Future<?> submit(Runnable task) {
        FutureTask<Object> future = new FutureTask<>(task, null);
        execute(future);
        return future;
    }
    public <T> List<Future<T>> invokeAll(Collection<? extends Callable<T>> tasks) throws InterruptedException {
        List<Future<T>> futures = new ArrayList<>();
        for (Callable<T> task : tasks)
            futures.add(submit(task));
        for (Future<T> future : futures) {
            try {
                future.get();
            } catch (ExecutionException e) {
                // An error of a task goes to its Future.
            }
        }
        return futures;
    }
    public void shutdown() {
        shutdown = true;
        synchronized (this) {
            notifyAll();
        }
    }
    public List<Runnable> shutdownNow() {
        shutdown = true;
        List<Runnable> pending = new ArrayList<>(queue);
        queue.clear();
        synchronized (this) {
            notifyAll();
        }
        return pending;
    }
    public boolean isShutdown() { return shutdown; }
    public boolean isTerminated() { return shutdown && workers.isEmpty(); }
    public boolean awaitTermination(long timeout, TimeUnit unit) throws InterruptedException {
        List<Worker> running = new ArrayList<>(workers);
        for (Worker worker : running)
            worker.join();
        return true;
    }
    public void close() {
        shutdown();
        try {
            awaitTermination(1, TimeUnit.DAYS);
        } catch (InterruptedException e) {
            // nothing
        }
    }
    public String toString() {
        return "java.util.concurrent.ThreadPoolExecutor@" + Integer.toHexString(hashCode()) + "[" + (shutdown ? "Shutting down" : "Running") +
            ", pool size = " + workers.size() + ", active threads = " + (workers.size() - idle) + ", queued tasks = " + queue.size() + "]";
    }
}

public final class Executors {
    private Executors() {}
    public static ExecutorService newFixedThreadPool(int threads) {
        if (threads <= 0)
            throw new IllegalArgumentException();
        return new ThreadPool(threads);
    }
    public static ExecutorService newCachedThreadPool() { return new ThreadPool(Integer.MAX_VALUE); }
    public static ExecutorService newSingleThreadExecutor() { return new ThreadPool(1); }
    public static ExecutorService newWorkStealingPool() { return new ThreadPool(4); }
    public static ExecutorService newVirtualThreadPerTaskExecutor() { return new ThreadPool(Integer.MAX_VALUE); }
    public static <T> Callable<T> callable(Runnable task, T result) { return new FutureTask.RunnableAdapter<T>(task, result); }
}

public class CountDownLatch {
    private long count;
    public CountDownLatch(int count) {
        if (count < 0)
            throw new IllegalArgumentException("count < 0");
        this.count = count;
    }
    public void await() throws InterruptedException {
        synchronized (this) {
            while (count > 0)
                wait();
        }
    }
    public void countDown() {
        if (count > 0 && --count == 0) {
            synchronized (this) {
                notifyAll();
            }
        }
    }
    public long getCount() { return count; }
    public String toString() { return super.toString() + "[Count = " + count + "]"; }
}

public interface BlockingQueue<E> extends Queue<E> {
    void put(E value) throws InterruptedException;
    E take() throws InterruptedException;
    E poll(long timeout, TimeUnit unit) throws InterruptedException;
    int remainingCapacity();
}

// A blocking queue: put waits for room, take for an element.
public class LinkedBlockingQueue<E> extends AbstractQueue<E> implements BlockingQueue<E> {
    private final ArrayDeque<E> items = new ArrayDeque<>();
    private final int capacity;
    public LinkedBlockingQueue() { this(Integer.MAX_VALUE); }
    public LinkedBlockingQueue(int capacity) {
        if (capacity <= 0)
            throw new IllegalArgumentException();
        this.capacity = capacity;
    }
    public LinkedBlockingQueue(Collection<? extends E> items) {
        this(Integer.MAX_VALUE);
        addAll(items);
    }
    public void put(E value) throws InterruptedException {
        Objects.requireNonNull(value);
        synchronized (this) {
            while (items.size() >= capacity)
                wait();
            items.addLast(value);
            notifyAll();
        }
    }
    public E take() throws InterruptedException {
        synchronized (this) {
            while (items.isEmpty())
                wait();
            E value = items.removeFirst();
            notifyAll();
            return value;
        }
    }
    public E poll(long timeout, TimeUnit unit) throws InterruptedException {
        synchronized (this) {
            if (items.isEmpty())
                wait(Math.max(1, unit.toMillis(timeout)));
            if (items.isEmpty())
                return null;
            E value = items.removeFirst();
            notifyAll();
            return value;
        }
    }
    public boolean offer(E value) {
        Objects.requireNonNull(value);
        if (items.size() >= capacity)
            return false;
        items.addLast(value);
        synchronized (this) {
            notifyAll();
        }
        return true;
    }
    public E poll() {
        E value = items.pollFirst();
        if (value != null) {
            synchronized (this) {
                notifyAll();
            }
        }
        return value;
    }
    public E peek() { return items.peekFirst(); }
    public int size() { return items.size(); }
    public int remainingCapacity() { return capacity - items.size(); }
    public Iterator<E> iterator() { return items.iterator(); }
}

public class ArrayBlockingQueue<E> extends LinkedBlockingQueue<E> {
    public ArrayBlockingQueue(int capacity) { super(capacity); }
    public void put(E value) throws InterruptedException { super.put(value); }
    public E take() throws InterruptedException { return super.take(); }
    public E poll(long timeout, TimeUnit unit) throws InterruptedException { return super.poll(timeout, unit); }
}

public interface ConcurrentMap<K, V> extends Map<K, V> {}

public class ConcurrentHashMap<K, V> extends HashMap<K, V> implements ConcurrentMap<K, V> {
    public ConcurrentHashMap() { super(); }
    public ConcurrentHashMap(int initialCapacity) { super(initialCapacity); }
    public ConcurrentHashMap(Map<? extends K, ? extends V> map) { super(map); }
    public V put(K key, V value) { return super.put(Objects.requireNonNull(key), Objects.requireNonNull(value)); }
}

public class CopyOnWriteArrayList<E> extends ArrayList<E> {
    public CopyOnWriteArrayList() { super(); }
    public CopyOnWriteArrayList(Collection<? extends E> items) { super(items); }
}

public class ConcurrentLinkedQueue<E> extends ArrayDeque<E> {
    public ConcurrentLinkedQueue() { super(); }
    public ConcurrentLinkedQueue(Collection<? extends E> items) { super(items); }
}

public class ConcurrentLinkedDeque<E> extends ArrayDeque<E> {
    public ConcurrentLinkedDeque() { super(); }
}

public final class ThreadLocalRandom extends Random {
    private static final ThreadLocalRandom INSTANCE = new ThreadLocalRandom();
    private ThreadLocalRandom() { super(); }
    public static ThreadLocalRandom current() { return INSTANCE; }
}
`);

    Java.addLibrary('java.util.concurrent.atomic', 'java.util.concurrent.atomic', HEADER + String.raw`
public class AtomicInteger extends Number {
    private int value;
    public AtomicInteger() {}
    public AtomicInteger(int value) { this.value = value; }
    public final int get() { return value; }
    public final void set(int value) { this.value = value; }
    public final void lazySet(int value) { this.value = value; }
    public final int getAndSet(int next) {
        int old = value;
        value = next;
        return old;
    }
    public final boolean compareAndSet(int expected, int next) {
        if (value != expected)
            return false;
        value = next;
        return true;
    }
    public final int getAndIncrement() { return value++; }
    public final int getAndDecrement() { return value--; }
    public final int getAndAdd(int delta) {
        int old = value;
        value += delta;
        return old;
    }
    public final int incrementAndGet() { return ++value; }
    public final int decrementAndGet() { return --value; }
    public final int addAndGet(int delta) { return value += delta; }
    public final int getAndUpdate(IntUnaryOperator update) {
        int old = value;
        value = update.applyAsInt(old);
        return old;
    }
    public final int updateAndGet(IntUnaryOperator update) { return value = update.applyAsInt(value); }
    public final int accumulateAndGet(int x, IntBinaryOperator op) { return value = op.applyAsInt(value, x); }
    public int intValue() { return value; }
    public long longValue() { return value; }
    public double doubleValue() { return value; }
    public String toString() { return Integer.toString(value); }
}

public class AtomicLong extends Number {
    private long value;
    public AtomicLong() {}
    public AtomicLong(long value) { this.value = value; }
    public final long get() { return value; }
    public final void set(long value) { this.value = value; }
    public final long getAndSet(long next) {
        long old = value;
        value = next;
        return old;
    }
    public final boolean compareAndSet(long expected, long next) {
        if (value != expected)
            return false;
        value = next;
        return true;
    }
    public final long getAndIncrement() { return value++; }
    public final long getAndDecrement() { return value--; }
    public final long getAndAdd(long delta) {
        long old = value;
        value += delta;
        return old;
    }
    public final long incrementAndGet() { return ++value; }
    public final long decrementAndGet() { return --value; }
    public final long addAndGet(long delta) { return value += delta; }
    public final long updateAndGet(LongUnaryOperator update) { return value = update.applyAsLong(value); }
    public final long accumulateAndGet(long x, LongBinaryOperator op) { return value = op.applyAsLong(value, x); }
    public int intValue() { return (int) value; }
    public long longValue() { return value; }
    public double doubleValue() { return value; }
    public String toString() { return Long.toString(value); }
}

public class AtomicBoolean {
    private boolean value;
    public AtomicBoolean() {}
    public AtomicBoolean(boolean value) { this.value = value; }
    public final boolean get() { return value; }
    public final void set(boolean value) { this.value = value; }
    public final boolean getAndSet(boolean next) {
        boolean old = value;
        value = next;
        return old;
    }
    public final boolean compareAndSet(boolean expected, boolean next) {
        if (value != expected)
            return false;
        value = next;
        return true;
    }
    public String toString() { return Boolean.toString(value); }
}

public class AtomicReference<V> {
    private V value;
    public AtomicReference() {}
    public AtomicReference(V value) { this.value = value; }
    public final V get() { return value; }
    public final void set(V value) { this.value = value; }
    public final V getAndSet(V next) {
        V old = value;
        value = next;
        return old;
    }
    public final boolean compareAndSet(V expected, V next) {
        if (value != expected)
            return false;
        value = next;
        return true;
    }
    public final V getAndUpdate(UnaryOperator<V> update) {
        V old = value;
        value = update.apply(old);
        return old;
    }
    public final V updateAndGet(UnaryOperator<V> update) { return value = update.apply(value); }
    public final V accumulateAndGet(V x, BinaryOperator<V> op) { return value = op.apply(value, x); }
    public String toString() { return String.valueOf(value); }
}
`);

    Java.natives['java.util.concurrent.TimeUnit'] = {
        'sleep(long)': Java.asyncNative(function* (timeout) {
            var millis = i64.toFloat(this.nanos) * i64.toFloat(timeout) / 1e6;
            if (millis > 0)
                yield* Java.rt.sleepFiber(millis);
        })
    };
})(globalThis);
