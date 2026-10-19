// The end of the program: a pool without shutdown() would keep the JVM
// forever, but here the program ends when its workers wait for tasks; the
// end does not wait for daemon threads. A plain thread that submits tasks
// to the pool itself is waited for.
import java.util.concurrent.*;

ExecutorService pool = Executors.newFixedThreadPool(2);
Future<Integer> answer = pool.submit(() -> 6 * 7);
System.out.println(answer.get());
Thread daemon = new Thread(() -> {
    try {
        Thread.sleep(100000);
    } catch (InterruptedException e) {
        return;
    }
    System.out.println("daemon woke");
});
daemon.setDaemon(true);
daemon.start();
Thread worker = new Thread(() -> {
    try {
        Thread.sleep(30);
    } catch (InterruptedException e) {
        return;
    }
    System.out.println("worker done");
    pool.submit(() -> System.out.println("task from " + Thread.currentThread().getName()));
});
worker.start();
System.out.println("main end");

// Output:
// 42
// main end
// worker done
// task from pool-1-thread-2
