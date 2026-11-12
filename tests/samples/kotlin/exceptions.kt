// Exceptions: hierarchies, try as an expression, finally, require/check,
// runCatching and Result, exceptions of the JVM library.
open class BankException(message: String) : Exception(message)

class InsufficientFunds(val missing: Int) : BankException("missing $missing")

class Account(private var balance: Int) {
    fun withdraw(amount: Int): Int {
        require(amount > 0) { "amount must be positive, was $amount" }
        if (amount > balance)
            throw InsufficientFunds(amount - balance)
        balance -= amount
        return balance
    }
}

fun parse(text: String): Int = try {
    text.toInt()
} catch (e: NumberFormatException) {
    println("not a number: ${e.message}")
    0
} finally {
    println("parsed '$text'")
}

fun depth(n: Int): Int {
    try {
        if (n == 0)
            throw IllegalStateException("bottom")
        return depth(n - 1)
    } finally {
        print("$n ")
    }
}

fun main() {
    val account = Account(100)
    println(account.withdraw(30))
    try {
        account.withdraw(500)
    } catch (e: InsufficientFunds) {
        println("caught ${e.message}, missing ${e.missing}")
    }
    try {
        account.withdraw(-1)
    } catch (e: IllegalArgumentException) {
        println("caught ${e::class.simpleName}: ${e.message}")
    }
    try {
        account.withdraw(1000)
    } catch (e: BankException) {
        println("bank problem: ${e.message} ${e is InsufficientFunds}")
    }

    println(parse("12") + parse("x1"))

    try {
        depth(3)
    } catch (e: IllegalStateException) {
        println()
        println("unwound: ${e.message}")
    }

    val results = listOf("4", "four", "16").map { text -> runCatching { text.toInt() } }
    println(results.map { it.isSuccess })
    println(results.map { it.getOrDefault(-1) })
    println(results[1].exceptionOrNull()?.message)
    println(runCatching { 10 / 0 }.fold({ "ok $it" }, { "failed: ${it.message}" }))

    val list = listOf(1, 2, 3)
    try {
        println(list[5])
    } catch (e: IndexOutOfBoundsException) {
        println(e.message)
    }
    try {
        val map = mapOf("a" to 1)
        println(map.getValue("b"))
    } catch (e: NoSuchElementException) {
        println(e.message)
    }
    try {
        val any: Any = "text"
        println(any as Int)
    } catch (e: ClassCastException) {
        println("cast failed")
    }
    try {
        val s: String? = null
        println(s!!.length)
    } catch (e: NullPointerException) {
        println("NPE")
    }
    try {
        check(list.size > 5) { "list too short" }
    } catch (e: IllegalStateException) {
        println(e.message)
    }
    try {
        error("custom failure")
    } catch (e: Exception) {
        println("${e.javaClass.name}: ${e.message}")
    }
    val nothing: Int = try {
        throw UnsupportedOperationException()
    } catch (e: RuntimeException) {
        -1
    }
    println(nothing)
    try {
        try {
            throw IllegalArgumentException("inner")
        } catch (e: IllegalArgumentException) {
            throw RuntimeException("outer", e)
        }
    } catch (e: RuntimeException) {
        println("${e.message} caused by ${e.cause?.message}")
    }
    try {
        TODO("later")
    } catch (e: NotImplementedError) {
        println(e.message)
    }
}

// Output:
// 70
// caught missing 430, missing 430
// caught IllegalArgumentException: amount must be positive, was -1
// bank problem: missing 930 true
// parsed '12'
// not a number: For input string: "x1"
// parsed 'x1'
// 12
// 0 1 2 3 
// unwound: bottom
// [true, false, true]
// [4, -1, 16]
// For input string: "four"
// failed: / by zero
// Index 5 out of bounds for length 3
// Key b is missing in the map.
// cast failed
// NPE
// list too short
// java.lang.IllegalStateException: custom failure
// -1
// outer caused by inner
// An operation is not implemented: later
