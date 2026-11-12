// Sealed classes, data classes and when as an expression.
import kotlin.math.PI
import kotlin.math.sqrt

sealed interface Shape

data class Circle(val radius: Double) : Shape

data class Rectangle(val width: Double, val height: Double) : Shape

data class Triangle(val a: Double, val b: Double, val c: Double) : Shape

fun area(shape: Shape): Double = when (shape) {
    is Circle -> PI * shape.radius * shape.radius
    is Rectangle -> shape.width * shape.height
    is Triangle -> {
        val s = (shape.a + shape.b + shape.c) / 2
        sqrt(s * (s - shape.a) * (s - shape.b) * (s - shape.c))
    }
}

fun describe(shape: Shape): String = when (shape) {
    is Circle -> "a circle of radius ${shape.radius}"
    is Rectangle -> if (shape.width == shape.height) "a square" else "a rectangle ${shape.width} x ${shape.height}"
    is Triangle -> "a triangle"
}

fun main() {
    val shapes = listOf(Circle(1.5), Rectangle(2.0, 3.0), Rectangle(2.0, 2.0), Triangle(3.0, 4.0, 5.0))
    for (shape in shapes)
        println("${describe(shape)}: area ${"%.2f".format(area(shape))}")
    val largest = shapes.maxByOrNull(::area)
    println("The largest: $largest")
    println("Total area: ${"%.2f".format(shapes.sumOf(::area))}")
    println(shapes.filterIsInstance<Rectangle>().map { it.copy(height = it.height * 2) })
}
