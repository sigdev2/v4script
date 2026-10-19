// Threads are fibers: Thread.sleep in real time, start/join, wait and
// notify, an uncaught exception in a thread, synchronized.
import java.util.*;

public class Main {
    static class Buffer {
        private final Deque<Integer> items = new ArrayDeque<>();
        synchronized void put(int value) throws InterruptedException {
            while (items.size() >= 2)
                wait();
            items.addLast(value);
            notifyAll();
        }
        synchronized int take() throws InterruptedException {
            while (items.isEmpty())
                wait();
            int value = items.removeFirst();
            notifyAll();
            return value;
        }
    }

    static class Worker extends Thread {
        private final int delay;
        Worker(String name, int delay) {
            super(name);
            this.delay = delay;
        }
        @Override
        public void run() {
            try {
                Thread.sleep(delay);
                System.out.println(getName() + " finished after " + delay);
            } catch (InterruptedException e) {
                System.out.println("interrupted");
            }
        }
    }

    static void pause(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            throw new RuntimeException(e);
        }
    }

    public static void main(String[] args) throws InterruptedException {
        Thread a = new Thread(() -> {
            for (int i = 0; i < 3; i++) {
                System.out.println("A " + i);
                pause(100);
            }
        });
        Thread b = new Thread(() -> {
            pause(50);
            for (int i = 0; i < 3; i++) {
                System.out.println("B " + i);
                pause(100);
            }
        });
        a.start();
        b.start();
        a.join();
        b.join();
        System.out.println("joined, alive: " + a.isAlive());

        List<Worker> workers = List.of(new Worker("slow", 120), new Worker("fast", 40), new Worker("medium", 80));
        for (Worker worker : workers)
            worker.start();
        for (Worker worker : workers)
            worker.join();

        Buffer buffer = new Buffer();
        Thread producer = new Thread(() -> {
            try {
                for (int i = 1; i <= 5; i++)
                    buffer.put(i * 10);
            } catch (InterruptedException e) {
                throw new RuntimeException(e);
            }
        }, "producer");
        int[] sum = { 0 };
        Thread consumer = new Thread(() -> {
            try {
                for (int i = 0; i < 5; i++)
                    sum[0] += buffer.take();
            } catch (InterruptedException e) {
                throw new RuntimeException(e);
            }
        }, "consumer");
        producer.start();
        consumer.start();
        producer.join();
        consumer.join();
        System.out.println("sum " + sum[0]);

        Thread failing = new Thread(() -> {
            throw new IllegalStateException("broken worker");
        }, "failing");
        failing.start();
        failing.join();
        System.out.println("main continues");
        long start = System.currentTimeMillis();
        Thread.sleep(200);
        long elapsed = System.currentTimeMillis() - start;
        System.out.println("slept " + (elapsed >= 190 && elapsed < 1000));
    }
}

// Output:
// A 0
// B 0
// A 1
// B 1
// A 2
// B 2
// joined, alive: false
// fast finished after 40
// medium finished after 80
// slow finished after 120
// sum 150
// !Exception in thread "failing" java.lang.IllegalStateException: broken worker
// main continues
// slept true
