// !! on null: a NullPointerException at run time.
fun main() {
    val ages = mapOf("Ann" to 31)
    println("looking up")
    val age = ages["Bob"]!!
    println(age)
}

// Output:
// looking up
// Error: Exception in thread "main" java.lang.NullPointerException
// Line: 5
