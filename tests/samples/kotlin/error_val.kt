// A read-only variable is assigned again.
fun main() {
    val limit = 10
    println(limit)
    limit = 20
}

// Error: 'val' cannot be reassigned.
// Line: 5
