// Java 21: a sealed interface, records and pattern matching in switch.
import java.util.List;

sealed interface Shape permits Circle, Rectangle, Triangle {}

record Circle(double radius) implements Shape {}

record Rectangle(double width, double height) implements Shape {}

record Triangle(double a, double b, double c) implements Shape {}

public class Shapes {
    static double area(Shape shape) {
        return switch (shape) {
            case Circle c -> Math.PI * c.radius() * c.radius();
            case Rectangle(double w, double h) -> w * h;
            case Triangle(double a, double b, double c) -> {
                double s = (a + b + c) / 2;
                yield Math.sqrt(s * (s - a) * (s - b) * (s - c));
            }
        };
    }

    static String describe(Shape shape) {
        return switch (shape) {
            case Rectangle r when r.width() == r.height() -> "a square " + r.width();
            case Rectangle r -> "a rectangle " + r.width() + " x " + r.height();
            case Circle c -> "a circle of radius " + c.radius();
            case Triangle t -> "a triangle";
        };
    }

    public static void main(String[] args) {
        List<Shape> shapes = List.of(new Circle(1), new Rectangle(2, 3), new Rectangle(2, 2),
                                     new Triangle(3, 4, 5));
        for (Shape shape : shapes)
            System.out.printf("%-22s area %6.2f%n", describe(shape), area(shape));
        System.out.println(shapes.get(1));
    }
}
