// Threads: a producer and a consumer with a BlockingQueue, joined at the end.
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

public class Threads {
    public static void main(String[] args) throws InterruptedException {
        BlockingQueue<Integer> queue = new ArrayBlockingQueue<>(3);
        AtomicInteger sum = new AtomicInteger();

        Thread producer = new Thread(() -> {
            try {
                for (int i = 1; i <= 8; i++) {
                    queue.put(i);
                    System.out.println("produced " + i);
                    Thread.sleep(100);
                }
                queue.put(-1);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
        Thread consumer = new Thread(() -> {
            try {
                for (int value = queue.take(); value >= 0; value = queue.take()) {
                    sum.addAndGet(value * value);
                    System.out.println("  consumed " + value);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
        producer.start();
        consumer.start();
        producer.join();
        consumer.join();
        System.out.println("Sum of squares: " + sum.get());
    }
}
