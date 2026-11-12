// Strings: templates, raw strings, the functions of kotlin.text, regular
// expressions, formatting, StringBuilder and characters.
fun main() {
    val name = "Kotlin"
    val version = 2.4
    println("$name ${version}, ${name.length} letters, ${name.uppercase()}")
    val raw = """
        |first line
        |  second "quoted"
        |third \n not an escape
    """.trimMargin()
    println(raw)
    val indented = """
        alpha
          beta
    """.trimIndent()
    println(indented)
    println("a,b,,c".split(","))
    println("one  two three".split(" ").filter { it.isNotEmpty() })
    println("2024-05-17".split("-").map { it.toInt() })
    println("hello world".replace("o", "0").replaceFirstChar { it.uppercase() })
    println("Mississippi".count { it == 's' })
    println("Mississippi".indexOf("ss") to "Mississippi".lastIndexOf("ss"))
    println("racecar".reversed() == "racecar")
    println("  padded  ".trim() + "|" + "x".padStart(4, '.') + "|" + "y".padEnd(3, '_') + "|")
    println("abc".repeat(3))
    println("Hello".substring(1, 4) + " " + "Hello".take(2) + " " + "Hello".drop(3) + " " + "Hello".takeLast(2))
    println("kotlin".startsWith("kot") && "kotlin".endsWith("lin") && "kotlin".contains("tli"))
    println("a-b-c".substringBefore("-") + " " + "a-b-c".substringAfterLast("-"))
    println("CamelCaseString".filter { it.isUpperCase() })
    println("text".map { it.uppercaseChar() }.joinToString(""))
    println("42".toInt() + "3.5".toDouble())
    println("abc".toIntOrNull() ?: -1)
    println("ff".toInt(16) + "101".toInt(2))
    println(255.toString(16) + " " + 10.toString(2))

    println(String.format("%5.2f|%-6s|%04d|%x", 3.14159, "ab", 42, 255))
    println("%s has %d items".format("cart", 3))
    println("%.3e".format(12345.678))

    val sb = StringBuilder()
    for (i in 1..5) sb.append(i).append(if (i < 5) "," else "")
    sb.insert(0, "[").append("]")
    println(sb.toString() + " " + sb.length)
    println(sb.reverse())
    println(buildString {
        append("built")
        appendLine(" string")
        append("second line")
    })

    val date = Regex("(\\d{4})-(\\d{2})-(\\d{2})")
    val match = date.find("due 2025-03-14 or later")
    if (match != null) {
        val (year, month, day) = match.destructured
        println("$day.$month.$year at ${match.range}")
    }
    println(Regex("[aeiou]").replace("programming", "*"))
    println(Regex("\\s+").split("a  b \t c"))
    println(Regex("\\d+").findAll("a1b22c333").map { it.value.length }.toList())
    println("abc123".matches(Regex("[a-z]+\\d+")))
    println("x1y2".replace(Regex("\\d")) { (it.value.toInt() * 2).toString() })

    val c = 'k'
    println("${c.code} ${c + 1} ${'z' - 'a'} ${c.isLetter()} ${'7'.isDigit()} ${'7'.digitToInt()}")
    println(('a'..'e').joinToString(""))
    println("hello".toCharArray().sortedDescending().joinToString(""))
    println("é ü ж".length)
    val words = listOf("apple", "Banana", "cherry")
    println(words.sortedBy { it.lowercase() })
    println(words.joinToString(separator = "; ", prefix = "{", postfix = "}") { it.first().toString() })
    println("a" < "b" && "B" < "a")
    println("Hello" == "Hel" + "lo")
    println("x".compareTo("y"))
    val nullable: String? = null
    println("value: $nullable " + nullable.isNullOrEmpty())
    println(listOf("x", null, "z").filterNotNull().joinToString("+"))
}

// Output:
// Kotlin 2.4, 6 letters, KOTLIN
// first line
//   second "quoted"
// third \n not an escape
// alpha
//   beta
// [a, b, , c]
// [one, two, three]
// [2024, 5, 17]
// Hell0 w0rld
// 4
// (2, 5)
// true
// padded|...x|y__|
// abcabcabc
// ell He lo lo
// true
// a c
// CCS
// TEXT
// 45.5
// -1
// 260
// ff 1010
//  3.14|ab    |0042|ff
// cart has 3 items
// 1.235e+04
// [1,2,3,4,5] 11
// ]5,4,3,2,1[
// built string
// second line
// 14.03.2025 at 4..13
// pr*gr*mm*ng
// [a, b, c]
// [1, 2, 3]
// true
// x2y4
// 107 l 25 true true 7
// abcde
// ollhe
// 5
// [apple, Banana, cherry]
// {a; B; c}
// true
// true
// -1
// value: null true
// x+z
