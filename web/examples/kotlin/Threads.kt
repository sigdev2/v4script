// Threads: kotlin.concurrent.thread, sleep and join. A thread runs until it
// waits, so the program prints the same lines every time.
import kotlin.concurrent.thread

fun main() {
    val results = mutableListOf<String>()
    val workers = listOf("alpha" to 60L, "beta" to 25L, "gamma" to 40L).map { (name, pause) ->
        thread(name = name) {
            repeat(3) { step ->
                Thread.sleep(pause)
                println("$name finished step ${step + 1}")
            }
            synchronized(results) { results.add(name) }
        }
    }
    workers.forEach { it.join() }
    println("Done in the order $results")
}
