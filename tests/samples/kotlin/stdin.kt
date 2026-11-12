// Standard input: readln, readLine (null at the end), parsing.
fun main() {
    print("Name? ")
    val name = readln()
    println("Hi $name")
    val (a, b) = readln().split(" ").map { it.toInt() }
    println("${a + b} ${a * b}")
    val numbers = readln().trim().split(Regex("\\s+")).map { it.toInt() }
    println(numbers.sum())
    while (true) {
        val line = readLine() ?: break
        println("line: [$line]")
    }
    println(readlnOrNull() == null)
}

// Input:
// Ann
// 3 4
//   1 2   3
// x
//   y
// Output:
// Name? Hi Ann
// 7 12
// 6
// line: [x]
// line: [  y]
// true
