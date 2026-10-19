// java.util.concurrent: a thread pool, Future, invokeAll, CountDownLatch,
// BlockingQueue, atomics, TimeUnit.
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

public class Main {
    public static void main(String[] args) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(2);
        List<Future<String>> futures = new ArrayList<>();
        for (int i = 1; i <= 4; i++) {
            int id = i;
            futures.add(pool.submit(() -> {
                TimeUnit.MILLISECONDS.sleep(30L * (5 - id));
                return "task " + id + " on " + Thread.currentThread().getName();
            }));
        }
        for (Future<String> future : futures)
            System.out.println(future.get());
        Future<Integer> failing = pool.submit(() -> {
            if (true)
                throw new IllegalStateException("bad input");
            return 0;
        });
        try {
            failing.get();
        } catch (ExecutionException e) {
            System.out.println("failed: " + e.getCause());
        }
        List<Callable<Integer>> squares = new ArrayList<>();
        for (int i = 1; i <= 3; i++) {
            int n = i;
            squares.add(() -> n * n);
        }
        int total = 0;
        for (Future<Integer> f : pool.invokeAll(squares))
            total += f.get();
        System.out.println("squares " + total);
        pool.shutdown();
        System.out.println("terminated " + pool.awaitTermination(1, TimeUnit.SECONDS));

        CountDownLatch latch = new CountDownLatch(3);
        AtomicInteger counter = new AtomicInteger();
        for (int i = 0; i < 3; i++) {
            int delay = 20 * (3 - i);
            new Thread(() -> {
                try {
                    Thread.sleep(delay);
                } catch (InterruptedException e) {
                    return;
                }
                counter.addAndGet(delay);
                latch.countDown();
            }).start();
        }
        latch.await();
        System.out.println("latch released, counter " + counter.get() + ", count " + latch.getCount());

        BlockingQueue<String> queue = new LinkedBlockingQueue<>(2);
        Thread producer = new Thread(() -> {
            try {
                for (String word : List.of("alpha", "beta", "gamma", "delta", "STOP"))
                    queue.put(word);
            } catch (InterruptedException e) {
                return;
            }
        });
        producer.start();
        StringBuilder received = new StringBuilder();
        for (String word = queue.take(); !word.equals("STOP"); word = queue.take())
            received.append(word).append(' ');
        System.out.println("received " + received.toString().trim());

        AtomicLong big = new AtomicLong(Long.MAX_VALUE - 1);
        big.incrementAndGet();
        AtomicReference<String> ref = new AtomicReference<>("x");
        ref.updateAndGet(s -> s + "y");
        System.out.println(big + " " + ref.get() + " " + ref.compareAndSet(ref.get(), "z") + " " + ref);
        ConcurrentHashMap<String, Integer> scores = new ConcurrentHashMap<>();
        scores.merge("a", 1, Integer::sum);
        scores.merge("a", 1, Integer::sum);
        System.out.println(scores + " " + TimeUnit.SECONDS.toMillis(3) + " " + TimeUnit.MILLISECONDS.toSeconds(4500));
        try (ExecutorService single = Executors.newSingleThreadExecutor()) {
            single.submit(() -> System.out.println("in " + Thread.currentThread().getName()));
        }
        System.out.println("closed");
    }
}

// Output:
// task 1 on pool-1-thread-1
// task 2 on pool-1-thread-2
// task 3 on pool-1-thread-2
// task 4 on pool-1-thread-1
// failed: java.lang.IllegalStateException: bad input
// squares 14
// terminated true
// latch released, counter 120, count 0
// received alpha beta gamma delta
// 9223372036854775807 xy true z
// {a=2} 3000 4
// in pool-2-thread-1
// closed
