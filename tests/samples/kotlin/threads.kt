// Threads of the JVM: Thread, kotlin.concurrent.thread, sleep and join.
// Threads switch where they wait, so the order of the lines is fixed.
import kotlin.concurrent.thread

fun work(name: String, steps: Int, pause: Long) {
    for (step in 1..steps) {
        println("$name step $step")
        Thread.sleep(pause)
    }
}

class Ticker(private val label: String) : Runnable {
    var ticks = 0
    override fun run() {
        repeat(3) {
            ticks++
            Thread.sleep(15)
        }
        println("$label ticked $ticks times")
    }
}

fun main() {
    val first = Thread { work("first", 3, 60) }
    first.start()
    Thread.sleep(30)
    work("main", 2, 60)
    first.join()

    val log = mutableListOf<String>()
    val workers = (1..3).map { n ->
        thread(name = "worker-$n") {
            repeat(2) { round ->
                Thread.sleep(40L * n + 20)
                synchronized(log) { log.add("w$n.$round") }
            }
        }
    }
    workers.forEach { it.join() }
    println(log)
    println(workers.map { it.name })

    val ticker = Ticker("ticker")
    val t = Thread(ticker, "tick-thread")
    t.start()
    println("alive: ${t.isAlive}")
    t.join()
    println("alive: ${t.isAlive}, ticks ${ticker.ticks}")

    var counter = 0
    val adders = List(4) { thread { for (k in 1..250) counter++ } }
    adders.forEach(Thread::join)
    println(counter)
    println(Thread.currentThread().name)
}

// Output:
// first step 1
// main step 1
// first step 2
// main step 2
// first step 3
// [w1.0, w2.0, w1.1, w3.0, w2.1, w3.1]
// [worker-1, worker-2, worker-3]
// alive: true
// ticker ticked 3 times
// alive: false, ticks 3
// 1000
// main
