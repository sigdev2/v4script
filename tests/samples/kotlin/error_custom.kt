// An exception that nobody catches ends the program.
class ValidationException(field: String) : RuntimeException("invalid field: $field")

fun validate(fields: Map<String, String>) {
    for ((key, value) in fields)
        if (value.isBlank())
            throw ValidationException(key)
}

fun main() {
    validate(mapOf("name" to "Ann"))
    println("first ok")
    validate(mapOf("name" to "Bob", "email" to " "))
    println("second ok")
}

// Output:
// first ok
// Error: Exception in thread "main" ValidationException: invalid field: email
// Line: 7
