// require fails with an IllegalArgumentException and its message.
fun sqrtOf(x: Double): Double {
    require(x >= 0) { "x must not be negative: $x" }
    return Math.sqrt(x)
}

fun main() {
    println(sqrtOf(16.0))
    println(sqrtOf(-4.0))
}

// Output:
// 4.0
// Error: Exception in thread "main" java.lang.IllegalArgumentException: x must not be negative: -4.0
// Line: 3
