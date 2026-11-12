// A script: statements and declarations at the top level, as in a .kts
// file; the value of the last expression is the value of the unit.
data class Item(val name: String, val price: Double)

val basket = listOf(Item("tea", 3.5), Item("cake", 4.25), Item("water", 1.0))
val total = basket.sumOf { it.price }
println("total $total")

fun label(item: Item) = if (item.price > 2) "${item.name} (pricey)" else item.name

for (item in basket)
    println(label(item))

var a = 0L
var b = 1L
repeat(20) {
    val next = a + b
    a = b
    b = next
}
println(a)

val limit = 5
var count = 0
while (count < limit)
    count += 2
count

// Output:
// total 8.75
// tea (pricey)
// cake (pricey)
// water
// 6765
// Value: 6
