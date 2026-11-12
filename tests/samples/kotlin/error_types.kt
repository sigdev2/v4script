// A value of the wrong type.
fun main() {
    var count = 0
    for (i in 1..3) count += i
    val text: String = count
    println(text)
}

// Error: initializer type mismatch: expected 'String', actual 'Int'.
// Line: 5
