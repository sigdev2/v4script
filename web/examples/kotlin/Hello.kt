// Hello: standard input, string templates and the functions of kotlin.text.
fun main() {
    print("What is your name? ")
    val name = readLine()?.trim().takeUnless { it.isNullOrEmpty() } ?: "stranger"
    println("Hello, $name!")
    println("Backwards: ${name.reversed()}")
    println("${name.length} letters, the first is '${name.first()}', in capitals ${name.uppercase()}")
    val vowels = name.count { it.lowercaseChar() in "aeiou" }
    println("Vowels: $vowels, the share ${"%.0f".format(100.0 * vowels / name.length)}%")
}
