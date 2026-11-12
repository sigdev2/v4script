// Integer division by zero.
fun average(values: List<Int>): Int = values.sum() / values.size

fun main() {
    println(average(listOf(4, 8)))
    println(average(emptyList()))
}

// Output:
// 6
// Error: Exception in thread "main" java.lang.ArithmeticException: / by zero
// Line: 2
