// Collections with lambdas: grouping, sorting, folding and lazy sequences.
data class Sale(val city: String, val product: String, val amount: Int)

fun main() {
    val sales = listOf(
        Sale("Oslo", "tea", 12), Sale("Rome", "coffee", 30), Sale("Oslo", "coffee", 8),
        Sale("Lima", "tea", 15), Sale("Rome", "tea", 5), Sale("Lima", "cocoa", 22)
    )
    val byCity = sales.groupBy { it.city }.mapValues { (_, list) -> list.sumOf { it.amount } }
    println("By city: $byCity")
    println("Best city: ${byCity.maxByOrNull { it.value }?.key}")
    val products = sales.map { it.product }.toSortedSet()
    println("Products: $products")
    println("Big sales: " + sales.filter { it.amount >= 15 }.sortedByDescending { it.amount }
        .joinToString { "${it.city}/${it.product}" })
    val (tea, other) = sales.partition { it.product == "tea" }
    println("Tea ${tea.sumOf { it.amount }}, other ${other.sumOf { it.amount }}")
    println("Running total: " + sales.runningFold(0) { total, sale -> total + sale.amount })
    val squares = generateSequence(1) { it + 1 }.map { it * it }.filter { it % 3 == 1 }.take(6)
    println("Squares: ${squares.toList()}")
    val words = "the quick brown fox jumps over the lazy dog the end".split(" ")
    println("Word counts: " + words.groupingBy { it }.eachCount().filterValues { it > 1 })
}
