// Classes: interfaces with defaults, abstract, data, enum and sealed
// classes, objects and companions, smart casts, null safety, lambdas.

interface Shape {
    val name: String
    fun area(): Double
    fun describe(): String = "$name with area ${area()}"
}

abstract class Base(val id: Int) {
    abstract fun kind(): String
    open fun label() = "base#$id"
}

class Circle(val radius: Double) : Shape {
    override val name = "circle"
    override fun area() = 3.0 * radius * radius
}

class Rect(val w: Double, val h: Double) : Base(7), Shape {
    override val name: String get() = "rect"
    override fun area(): Double = w * h
    override fun kind() = "rectangle"
    override fun label() = super.label() + "!"
}

data class Point(val x: Int, val y: Int) {
    operator fun plus(other: Point) = Point(x + other.x, y + other.y)
}

enum class Color(val hex: String) {
    RED("#f00"), GREEN("#0f0"), BLUE("#00f");
    fun lower() = name.lowercase()
}

object Registry {
    var count = 0
    fun register(): Int { count++; return count }
}

class Temp private constructor(val celsius: Double) {
    companion object {
        fun fromF(f: Double) = Temp((f - 32) * 5 / 9)
        const val ZERO = 0
    }
}

sealed class Expr
data class Num(val value: Int) : Expr()
data class Sum(val left: Expr, val right: Expr) : Expr()

fun eval(e: Expr): Int = when (e) {
    is Num -> e.value
    is Sum -> eval(e.left) + eval(e.right)
}

fun describe(x: Any?): String = when (x) {
    null -> "null"
    is String -> "string of ${x.length}"
    is Int -> "int ${x + 1}"
    else -> "other"
}

fun main() {
    val shapes: List<Shape> = listOf(Circle(1.0), Rect(2.0, 3.0))
    for (s in shapes) println(s.describe())
    val r = Rect(1.0, 2.0)
    println(r.label() + " " + r.kind())
    val p = Point(1, 2) + Point(3, 4)
    println(p)
    println(p == Point(4, 6))
    println(p.hashCode())
    val (a, b) = p
    println("$a $b")
    println(p.copy(y = 10))
    for (c in Color.values()) println("${c.name} ${c.ordinal} ${c.hex} ${c.lower()}")
    println(Color.valueOf("GREEN"))
    Registry.register()
    println(Registry.register())
    println(Temp.fromF(212.0).celsius)
    println(Temp.ZERO)
    println(eval(Sum(Num(2), Sum(Num(3), Num(4)))))
    println(describe("hey"))
    println(describe(41))
    println(describe(null))
    println(describe(2.5))
    val s: String? = if (a > 2) "long" else null
    println(s?.length)
    println(s?.length ?: -1)
    val t: String? = null
    println(t?.length ?: -1)
    try {
        throw IllegalStateException("boom")
    } catch (e: IllegalStateException) {
        println("caught ${e.message}")
    } finally {
        println("finally")
    }
    val result = try { "12".toInt() } catch (e: NumberFormatException) { -1 }
    println(result)
    fun local(n: Int): Int = if (n <= 1) 1 else n * local(n - 1)
    println(local(5))
    val add = { x: Int, y: Int -> x + y }
    println(add(2, 3))
    val twice: (Int) -> Int = { it * 2 }
    println(twice(21))
    var counter = 0
    val inc = { counter++ }
    inc(); inc()
    println(counter)
}

// Output:
// circle with area 3.0
// rect with area 6.0
// base#7! rectangle
// Point(x=4, y=6)
// true
// 130
// 4 6
// Point(x=4, y=10)
// RED 0 #f00 red
// GREEN 1 #0f0 green
// BLUE 2 #00f blue
// GREEN
// 2
// 100.0
// 0
// 9
// string of 3
// int 42
// null
// other
// 4
// 4
// -1
// caught boom
// finally
// 12
// 120
// 5
// 42
// 2
