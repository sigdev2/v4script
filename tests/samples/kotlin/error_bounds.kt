// An index outside a list.
fun main() {
    val letters = mutableListOf('a', 'b', 'c')
    for (i in 0..letters.size)
        println(letters[i])
}

// Output:
// a
// b
// c
// Error: Exception in thread "main" java.lang.IndexOutOfBoundsException: Index 3 out of bounds for length 3
// Line: 5
