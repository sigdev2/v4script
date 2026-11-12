// Lazy sequences: the sequence builder with yield, generateSequence and
// the order of evaluation of chained operations.
fun fibonacci() = sequence {
    var a = 0L
    var b = 1L
    while (true) {
        yield(a)
        val next = a + b
        a = b
        b = next
    }
}

fun primes(): Sequence<Int> = sequence {
    val found = mutableListOf<Int>()
    var candidate = 2
    while (true) {
        if (found.none { candidate % it == 0 }) {
            found.add(candidate)
            yield(candidate)
        }
        candidate++
    }
}

fun tree(depth: Int, prefix: String): Sequence<String> = sequence {
    yield(prefix)
    if (depth > 0) {
        yieldAll(tree(depth - 1, prefix + "L"))
        yieldAll(tree(depth - 1, prefix + "R"))
    }
}

fun main() {
    println(fibonacci().take(12).toList())
    println(fibonacci().first { it > 1000 })
    println(primes().drop(10).take(5).joinToString())
    println(tree(2, "*").toList())

    val trace = mutableListOf<String>()
    val result = listOf(1, 2, 3, 4)
        .asSequence()
        .map { trace.add("map $it"); it * 10 }
        .filter { trace.add("filter $it"); it > 15 }
        .first()
    println(result)
    println(trace)

    println(generateSequence(1) { if (it < 100) it * 3 else null }.toList())
    println(generateSequence("a") { it + "b" }.take(4).last())
    val collatz = generateSequence(27) { if (it % 2 == 0) it / 2 else 3 * it + 1 }.takeWhile { it != 1 }
    println("${collatz.count()} steps, max ${collatz.maxOrNull()}")
    println(sequenceOf(3, 1, 2).sorted().toList())
    println((1..10).asSequence().chunked(3).map { it.sum() }.toList())
    println((1..5).asSequence().windowed(2).map { (a, b) -> a * b }.toList())
    println(sequenceOf("a", "bb", "ccc").associateWith { it.length })
    val iterator = fibonacci().iterator()
    repeat(3) { print("${iterator.next()} ") }
    println(iterator.hasNext())
    println(generateSequence { null }.toList())
    println((1..3).asSequence().flatMap { n -> List(n) { n }.asSequence() }.toList())
    println(fibonacci().zip(primes()).take(4).toList())
}

// Output:
// [0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89]
// 1597
// 31, 37, 41, 43, 47
// [*, *L, *LL, *LR, *R, *RL, *RR]
// 20
// [map 1, filter 10, map 2, filter 20]
// [1, 3, 9, 27, 81, 243]
// abbb
// 111 steps, max 9232
// [1, 2, 3]
// [6, 15, 24, 10]
// [2, 6, 12, 20]
// {a=1, bb=2, ccc=3}
// 0 1 1 true
// []
// [1, 2, 2, 3, 3, 3]
// [(0, 2), (1, 3), (1, 5), (2, 7)]
