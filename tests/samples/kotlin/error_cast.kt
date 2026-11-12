// A cast to a wrong type.
fun main() {
    val values: List<Any> = listOf(1, "two", 3)
    var sum = 0
    for (value in values)
        sum += value as Int
    println(sum)
}

// Error: Exception in thread "main" java.lang.ClassCastException: class java.lang.String cannot be cast to class java.lang.Integer (java.lang.String and java.lang.Integer are in module java.base of loader 'bootstrap')
// Line: 6
