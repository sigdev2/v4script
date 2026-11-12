// Generic classes and functions, variance, reified type parameters,
// extensions, operators, delegation and lazy properties.
import kotlin.properties.Delegates

class Stack<T> : Iterable<T> {
    private val items = mutableListOf<T>()
    val size get() = items.size
    fun push(item: T) { items.add(item) }
    fun pop(): T = items.removeAt(items.size - 1)
    fun peek(): T? = items.lastOrNull()
    override fun iterator(): Iterator<T> = items.asReversed().iterator()
}

interface Source<out T> {
    fun next(): T
}

class Countdown(private var from: Int) : Source<Int> {
    override fun next() = from--
}

fun takeAll(source: Source<Number>, count: Int): List<Number> = List(count) { source.next() }

fun <T : Comparable<T>> maxOf3(a: T, b: T, c: T): T = maxOf(a, maxOf(b, c))

inline fun <reified T> List<Any>.only(): List<T> = filter { it is T }.map { it as T }

inline fun <reified T> nameOf(): String = T::class.simpleName ?: "?"

data class Vec(val x: Int, val y: Int) {
    operator fun plus(other: Vec) = Vec(x + other.x, y + other.y)
    operator fun times(k: Int) = Vec(x * k, y * k)
    operator fun unaryMinus() = Vec(-x, -y)
    operator fun get(index: Int) = if (index == 0) x else y
}

class Grid(val width: Int, val height: Int) {
    private val cells = IntArray(width * height)
    operator fun get(x: Int, y: Int) = cells[y * width + x]
    operator fun set(x: Int, y: Int, value: Int) { cells[y * width + x] = value }
    operator fun contains(value: Int) = value in cells
}

class Money(val cents: Long) : Comparable<Money> {
    override fun compareTo(other: Money) = cents.compareTo(other.cents)
    override fun toString() = "$" + (cents / 100) + "." + (cents % 100).toString().padStart(2, '0')
}

val String.vowels: Int get() = count { it in "aeiou" }

fun Int.isPrime(): Boolean = this > 1 && (2..this / 2).none { this % it == 0 }

interface Greeter {
    fun greet(name: String): String
}

class Polite : Greeter {
    override fun greet(name: String) = "Good day, $name"
}

class Loud(inner: Greeter) : Greeter by inner {
    fun shout(name: String) = greet(name).uppercase() + "!"
}

class Settings {
    val expensive: String by lazy {
        println("computing")
        "ready"
    }
    var level: Int by Delegates.observable(1) { _, old, new -> println("level $old -> $new") }
}

typealias Matrix = List<List<Int>>

fun Matrix.transpose(): Matrix = List(this[0].size) { col -> List(size) { row -> this[row][col] } }

fun main() {
    val stack = Stack<String>()
    stack.push("a"); stack.push("b"); stack.push("c")
    println("${stack.size} ${stack.peek()} ${stack.joinToString()}")
    println(stack.pop() + stack.pop() + " " + stack.size)

    println(takeAll(Countdown(3), 3))
    println(maxOf3(4, 9, 2))
    println(maxOf3("pear", "apple", "plum"))

    val mixed: List<Any> = listOf(1, "two", 3.0, "four", 5)
    println(mixed.only<String>())
    println(mixed.only<Int>().sum())
    println(nameOf<Vec>())

    val v = Vec(1, 2) + Vec(3, 4) * 2
    println(v)
    println(-v)
    println("${v[0]} ${v[1]}")

    val grid = Grid(3, 2)
    grid[1, 1] = 7
    grid[2, 0] += 4
    println("${grid[1, 1]} ${grid[2, 0]} ${7 in grid} ${9 in grid}")

    val prices = listOf(Money(1999), Money(250), Money(1000))
    println(prices.sorted())
    println(prices.maxOrNull())
    println(Money(5) < Money(50))

    println("education".vowels)
    println((1..30).filter { it.isPrime() })

    val loud = Loud(Polite())
    println(loud.greet("Ann"))
    println(loud.shout("Bob"))

    val settings = Settings()
    println("created")
    println(settings.expensive)
    println(settings.expensive)
    settings.level = 3
    settings.level++

    val m: Matrix = listOf(listOf(1, 2, 3), listOf(4, 5, 6))
    println(m.transpose())

    val pairs = listOf(1 to "one", 2 to "two")
    val (numbers, names) = pairs.unzip()
    println("$numbers $names")
    val triple = Triple("x", 1, true)
    println("${triple.first}${triple.second}${triple.third}")
}

// Output:
// 3 c c, b, a
// cb 1
// [3, 2, 1]
// 9
// plum
// [two, four]
// 6
// Vec
// Vec(x=7, y=10)
// Vec(x=-7, y=-10)
// 7 10
// 7 4 true false
// [$2.50, $10.00, $19.99]
// $19.99
// true
// 5
// [2, 3, 5, 7, 11, 13, 17, 19, 23, 29]
// Good day, Ann
// GOOD DAY, BOB!
// created
// computing
// ready
// ready
// level 1 -> 3
// level 3 -> 4
// [[1, 4], [2, 5], [3, 6]]
// [1, 2] [one, two]
// x1true
