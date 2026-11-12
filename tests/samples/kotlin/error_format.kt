// A string that is not a number.
fun main() {
    val inputs = listOf("12", "7", "1O")
    var total = 0
    for (text in inputs)
        total += text.toInt()
    println(total)
}

// Error: Exception in thread "main" java.lang.NumberFormatException: For input string: "1O"
// Line: 6
