// A when expression over a sealed class must cover every case.
sealed interface Shape
class Circle(val r: Double) : Shape
class Square(val side: Double) : Shape
class Triangle(val base: Double, val height: Double) : Shape

fun area(shape: Shape): Double = when (shape) {
    is Circle -> 3.14 * shape.r * shape.r
    is Square -> shape.side * shape.side
}

fun main() {
    println(area(Square(2.0)))
}

// Error: 'when' expression must be exhaustive. Add the 'is Triangle' branch or an 'else' branch.
// Line: 7
