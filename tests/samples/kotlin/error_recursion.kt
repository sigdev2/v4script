// Recursion without an end: a StackOverflowError.
fun countDown(n: Int): Int = 1 + countDown(n - 1)

fun main() {
    println("start")
    println(countDown(10))
}

// Output:
// start
// Error: Exception in thread "main" java.lang.StackOverflowError
// Line: 2
