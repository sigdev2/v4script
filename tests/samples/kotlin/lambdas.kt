// Functions as values: lambdas, references, receivers, inline functions
// with non-local returns, scope functions, fun interfaces.
fun interface Transformer {
    fun apply(value: Int): Int
}

data class Order(val item: String, val amount: Int)

fun applyTwice(f: (Int) -> Int, x: Int) = f(f(x))

fun compose(f: (Int) -> Int, g: (Int) -> Int): (Int) -> Int = { x -> g(f(x)) }

fun makeCounter(): () -> Int {
    var count = 0
    return { ++count }
}

fun isOdd(n: Int) = n % 2 == 1

fun firstNegative(values: List<Int>): Int? {
    values.forEach {
        if (it < 0) return it
    }
    return null
}

fun StringBuilder.line(text: String) = append(text).append('\n')

fun html(build: StringBuilder.() -> Unit): String {
    val builder = StringBuilder()
    builder.build()
    return builder.toString()
}

fun main() {
    println(applyTwice({ it * 3 }, 2))
    val inc = { x: Int -> x + 1 }
    val square: (Int) -> Int = { it * it }
    println(compose(inc, square)(4))
    println(compose(square, inc)(4))

    val counter = makeCounter()
    counter(); counter()
    println("counter ${counter()}")

    val numbers = listOf(3, 8, -2, 7, -5)
    println(numbers.filter(::isOdd))
    println(numbers.map(Int::toString).map(String::length))
    println(firstNegative(numbers))
    println(firstNegative(listOf(1, 2)))

    val orders = listOf(Order("tea", 3), Order("cake", 1), Order("tea", 2))
    val totals = orders.groupBy { it.item }.mapValues { (_, list) -> list.sumOf { it.amount } }
    println(totals)
    println(orders.maxByOrNull { it.amount }?.item)
    println(orders.map(::describe))

    val doubler = Transformer { it * 2 }
    println(doubler.apply(21))
    val chain = listOf(Transformer { it + 1 }, doubler, Transformer { it - 3 })
    println(chain.fold(5) { acc, t -> t.apply(acc) })

    val text = html {
        line("<ul>")
        for (name in listOf("a", "b")) line("  <li>$name</li>")
        line("</ul>")
    }
    print(text)

    val result = StringBuilder().apply {
        append("x=")
        append(42)
    }.toString()
    println(result)
    val length = "kotlin".let { it.length * 2 }
    println(length)
    val described = with(orders) { "$size orders, first ${first().item}" }
    println(described)
    val checked = 17.takeIf { it > 10 }?.also { println("kept $it") }
    println(checked)
    println(5.takeUnless { it > 3 })
    val runResult = run {
        val a = 6
        val b = 7
        a * b
    }
    println(runResult)

    outer@ for (i in 1..3) {
        for (j in 1..3) {
            if (j == 2) continue@outer
            if (i == 3) break@outer
            print("$i$j ")
        }
    }
    println()
    listOf(1, 2, 3, 4).forEach inner@{
        if (it % 2 == 0) return@inner
        print("odd $it ")
    }
    println()

    val anonymous = fun(x: Int): String {
        if (x < 0) return "negative"
        return "non-negative"
    }
    println(anonymous(-1) + " " + anonymous(1))
    val sum = { a: Int, b: Int, c: Int -> a + b + c }
    println(sum(1, 2, 3))
    val ops: Map<String, (Int, Int) -> Int> = mapOf("+" to { a, b -> a + b }, "*" to { a, b -> a * b })
    println(ops.map { (name, op) -> "6 $name 7 = ${op(6, 7)}" })
    var calls = 0
    val memo = HashMap<Int, Long>()
    fun fib(n: Int): Long {
        calls++
        if (n < 2) return n.toLong()
        return memo.getOrPut(n) { fib(n - 1) + fib(n - 2) }
    }
    println("${fib(60)} in $calls calls")
}

fun describe(order: Order) = "${order.amount}x ${order.item}"

// Output:
// 18
// 25
// 17
// counter 3
// [3, 7]
// [1, 1, 2, 1, 2]
// -2
// null
// {tea=5, cake=1}
// tea
// [3x tea, 1x cake, 2x tea]
// 42
// 9
// <ul>
//   <li>a</li>
//   <li>b</li>
// </ul>
// x=42
// 12
// 3 orders, first tea
// kept 17
// 17
// null
// 42
// 11 21 
// odd 1 odd 3 
// negative non-negative
// 6
// [6 + 7 = 13, 6 * 7 = 42]
// 1548008755920 in 119 calls
