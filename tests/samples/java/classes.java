// Classes, inheritance, interfaces, abstract classes, static members,
// nested and inner classes, anonymous classes, instanceof.
import java.util.*;

public class Main {
    interface Shape {
        double area();
        default String describe() { return getClass().getSimpleName() + " with area " + String.format("%.2f", area()); }
    }

    static abstract class Base implements Shape {
        private static int created = 0;
        protected final String id;
        Base() { id = "S" + (++created); }
        static int created() { return created; }
        @Override
        public String toString() { return id + ":" + describe(); }
    }

    static class Circle extends Base {
        private final double r;
        Circle(double r) { this.r = r; }
        public double area() { return Math.PI * r * r; }
    }

    static class Rect extends Base {
        protected final double w, h;
        Rect(double w, double h) {
            super();
            this.w = w;
            this.h = h;
        }
        public double area() { return w * h; }
    }

    static class Square extends Rect {
        Square(double side) { super(side, side); }
        @Override
        public String describe() { return "square " + w + " -> " + super.describe(); }
    }

    class Counter {
        int count;
        void tick() {
            count++;
            total++;
        }
    }

    int total;

    static String kind(Object value) {
        if (value instanceof Integer i && i > 10)
            return "big int " + i;
        if (value instanceof Integer i)
            return "int " + i;
        if (value instanceof String s)
            return "string of " + s.length();
        if (value instanceof int[] a)
            return "array of " + a.length;
        return "other " + value;
    }

    public static void main(String[] args) {
        List<Shape> shapes = new ArrayList<>();
        shapes.add(new Circle(1));
        shapes.add(new Rect(2, 3.5));
        shapes.add(new Square(4));
        for (Shape shape : shapes)
            System.out.println(shape);
        System.out.println("created " + Base.created());
        double sum = 0;
        for (Shape shape : shapes)
            sum += shape.area();
        System.out.printf("total %.3f%n", sum);

        Main outer = new Main();
        Main.Counter a = outer.new Counter();
        Counter b = outer.new Counter();
        a.tick();
        a.tick();
        b.tick();
        System.out.println(a.count + " " + b.count + " " + outer.total);

        Comparator<String> byLength = new Comparator<String>() {
            @Override
            public int compare(String x, String y) { return x.length() - y.length(); }
        };
        List<String> words = new ArrayList<>(List.of("pear", "fig", "banana", "kiwi"));
        words.sort(byLength.thenComparing(Comparator.naturalOrder()));
        System.out.println(words);

        Object[] values = { 5, 42, "hello", new int[3], 2.5 };
        for (Object value : values)
            System.out.println(kind(value));
        System.out.println(shapes.get(2) instanceof Rect);
        System.out.println(shapes.get(0) instanceof Rect);
        Shape unit = () -> 1.0;
        System.out.println(unit.area());
    }
}

// Output:
// S1:Circle with area 3.14
// S2:Rect with area 7.00
// S3:square 4.0 -> Square with area 16.00
// created 3
// total 26.142
// 2 1 3
// [fig, kiwi, pear, banana]
// int 5
// big int 42
// string of 5
// array of 3
// other 2.5
// true
// false
// 1.0
