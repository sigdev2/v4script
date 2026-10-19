// Thread.sleep in the statements of a unit: the run of the unit ends, the
// program goes on by the timers of the unit. A lambda with sleep that the
// library calls (forEach) waits in place.
import java.util.*;

int slowDouble(int x) throws InterruptedException {
    Thread.sleep(10);
    return 2 * x;
}

for (int i = 0; i < 3; i++) {
    System.out.println("tick " + i);
    Thread.sleep(30);
}
System.out.println(slowDouble(21));
List.of(1, 2).forEach(x -> {
    try {
        Thread.sleep(5);
    } catch (InterruptedException e) {
        throw new RuntimeException(e);
    }
    System.out.println("each " + x);
});
Runnable task = () -> {
    try {
        Thread.sleep(20);
    } catch (InterruptedException e) {
        return;
    }
    System.out.println("task in " + Thread.currentThread().getName());
};
Thread worker = new Thread(task, "worker");
worker.start();
System.out.println("started " + worker.isAlive());
worker.join();
System.out.println("done");

// Output:
// tick 0
// tick 1
// tick 2
// 42
// each 1
// each 2
// started true
// task in worker
// done
