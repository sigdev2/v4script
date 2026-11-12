// A member of a nullable value without a safe call.
fun find(names: List<String>, prefix: String): String? = names.firstOrNull { it.startsWith(prefix) }

fun main() {
    val name = find(listOf("Ann", "Bob"), "B")
    println(name.length)
}

// Error: only safe (?.) or non-null asserted (!!.) calls are allowed on a nullable receiver of type 'String?'.
// Line: 6
