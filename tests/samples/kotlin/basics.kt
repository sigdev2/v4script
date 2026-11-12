// The basics: functions with default and named arguments, classes,
// ranges and loops, when, string templates, numbers.

fun square(x: Int): Int = x * x

fun greet(name: String, greeting: String = "Hello") = "$greeting, $name!"

class Counter(var count: Int = 0) {
    fun increment() { count++ }
    override fun toString(): String = "Counter($count)"
}

fun main() {
    val a = 7
    val b = 3
    println(a + b)
    println(a / b)
    println(a % b)
    println(a * 1.5)
    println(10L * 1000000000L)
    println(square(12))
    println(greet("Ann"))
    println(greet(greeting = "Hi", name = "Bob"))
    var sum = 0
    for (i in 1..10) sum += i
    println("sum = $sum")
    for (i in 0 until 3) print(i)
    println()
    for (i in 10 downTo 0 step 3) print("$i ")
    println()
    val grade = when (a) {
        in 0..5 -> "low"
        6, 7 -> "mid"
        else -> "high"
    }
    println(grade)
    val c = Counter()
    c.increment()
    c.increment()
    println(c)
    println(c.count)
    val max = if (a > b) a else b
    println("max: $max, ${a * b}")
    var x = 10
    while (x > 0) { x -= 4 }
    println(x)
    println(1.0 / 3)
    println(2.5f)
    println('A' + 2)
    println("abc".length)
}

// Output:
// 10
// 2
// 1
// 10.5
// 10000000000
// 144
// Hello, Ann!
// Hi, Bob!
// sum = 55
// 012
// 10 7 4 1 
// mid
// Counter(2)
// 2
// max: 7, 21
// -2
// 0.3333333333333333
// 2.5
// C
// 3
