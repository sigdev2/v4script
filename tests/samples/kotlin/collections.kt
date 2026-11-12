// Collections: the functions of kotlin.collections over lists, sets and
// maps, grouping, sorting, builders and text of kotlin.text.

data class Person(val name: String, val age: Int)

fun main() {
    val nums = listOf(5, 3, 8, 1, 9, 2)
    println(nums.map { it * 2 })
    println(nums.filter { it % 2 == 1 })
    println(nums.sorted())
    println(nums.sortedDescending())
    println(nums.sum())
    println(nums.maxOrNull())
    println(nums.minOf { it * 10 })
    println(nums.average())
    println(nums.joinToString(", ", "[", "]"))
    println(nums.joinToString("-") { "<$it>" })
    println(nums.take(3))
    println(nums.drop(4))
    println(nums.reversed())
    println(nums.first { it > 4 })
    println(nums.firstOrNull { it > 100 })
    println(nums.any { it > 8 })
    println(nums.all { it > 0 })
    println(nums.count { it > 3 })
    println(nums.fold(0) { acc, x -> acc + x })
    println(nums.reduce { a, b -> a * b })
    println(nums.zip(listOf("a", "b", "c")))
    println(nums.chunked(4))
    println(nums.windowed(3))
    println(nums.partition { it > 4 })
    println(nums.groupBy { it % 3 })
    println(nums.associateWith { it * it })
    println(nums.withIndex().map { (i, v) -> "$i:$v" })
    val people = listOf(Person("Ann", 31), Person("Bob", 25), Person("Cid", 31))
    println(people.sortedBy { it.age })
    println(people.sortedWith(compareBy({ it.age }, { it.name })))
    println(people.maxByOrNull { it.age }?.name)
    println(people.groupBy { it.age }.mapValues { (_, v) -> v.map { it.name } })
    println(people.sumOf { it.age })
    println(people.map { it.name }.distinct())
    val m = mutableMapOf("one" to 1, "two" to 2)
    m["three"] = 3
    for ((k, v) in m) println("$k=$v")
    println(m)
    println(m.getOrDefault("four", 4))
    println(m.getOrPut("five") { 5 })
    println(m.keys)
    println(m.values)
    println(m.filter { it.value > 2 })
    val list = mutableListOf(1, 2, 3)
    list += 4
    list.add(0, 0)
    list.removeAt(1)
    println(list)
    println(list.indexOf(3))
    println(list.contains(9))
    println(3 in list)
    val set = setOf(3, 1, 3, 2)
    println(set)
    println(set.size)
    println("Hello World".lowercase())
    println("a,b,,c".split(","))
    println("  trim me  ".trim())
    println("kotlin".uppercase().reversed())
    println("abc".repeat(3))
    println("12".toInt() + 1)
    println("x".padStart(4, '*'))
    println("%.2f and %5d".format(3.14159, 42))
    println("hello".substring(1, 3))
    println("hello".startsWith("he"))
    println("a-b-c".replace("-", "+"))
    println("Hello"[1])
    println("title".replaceFirstChar { it.uppercase() })
    println("one two three".split(" ").map { it.length })
    val sb = StringBuilder()
    sb.append("x").append(1).append(true)
    println(sb.toString())
    println(buildString { append("a"); append(2) })
    println(arrayOf(1, 2, 3).toList())
    println(intArrayOf(3, 1, 2).sorted())
    println(IntArray(5) { it * it }.toList())
    println((1..5).toList())
    println((1..10 step 3).toList())
    println(('a'..'e').joinToString(""))
    println(generateSequence(1) { it * 2 }.take(6).toList())
    println(sequence { yield(1); yield(2); yieldAll(listOf(3, 4)) }.toList())
    println(listOf(1, 2, 3).asSequence().map { it * 3 }.filter { it > 3 }.toList())
}

// Output:
// [10, 6, 16, 2, 18, 4]
// [5, 3, 1, 9]
// [1, 2, 3, 5, 8, 9]
// [9, 8, 5, 3, 2, 1]
// 28
// 9
// 10
// 4.666666666666667
// [5, 3, 8, 1, 9, 2]
// <5>-<3>-<8>-<1>-<9>-<2>
// [5, 3, 8]
// [9, 2]
// [2, 9, 1, 8, 3, 5]
// 5
// null
// true
// true
// 3
// 28
// 2160
// [(5, a), (3, b), (8, c)]
// [[5, 3, 8, 1], [9, 2]]
// [[5, 3, 8], [3, 8, 1], [8, 1, 9], [1, 9, 2]]
// ([5, 8, 9], [3, 1, 2])
// {2=[5, 8, 2], 0=[3, 9], 1=[1]}
// {5=25, 3=9, 8=64, 1=1, 9=81, 2=4}
// [0:5, 1:3, 2:8, 3:1, 4:9, 5:2]
// [Person(name=Bob, age=25), Person(name=Ann, age=31), Person(name=Cid, age=31)]
// [Person(name=Bob, age=25), Person(name=Ann, age=31), Person(name=Cid, age=31)]
// Ann
// {31=[Ann, Cid], 25=[Bob]}
// 87
// [Ann, Bob, Cid]
// one=1
// two=2
// three=3
// {one=1, two=2, three=3}
// 4
// 5
// [one, two, three, five]
// [1, 2, 3, 5]
// {three=3, five=5}
// [0, 2, 3, 4]
// 2
// false
// true
// [3, 1, 2]
// 3
// hello world
// [a, b, , c]
// trim me
// NILTOK
// abcabcabc
// 13
// ***x
// 3.14 and    42
// el
// true
// a+b+c
// e
// Title
// [3, 3, 5]
// x1true
// a2
// [1, 2, 3]
// [1, 2, 3]
// [0, 1, 4, 9, 16]
// [1, 2, 3, 4, 5]
// [1, 4, 7, 10]
// abcde
// [1, 2, 4, 8, 16, 32]
// [1, 2, 3, 4]
// [6, 9]
