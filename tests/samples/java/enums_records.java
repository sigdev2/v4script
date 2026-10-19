// Enums (fields, methods, constant bodies, values, valueOf, EnumMap),
// records (a compact constructor, methods, equals), switch expressions,
// patterns in switch, sealed interfaces.
import java.util.*;

public class Main {
    enum Planet {
        MERCURY(3.303e+23, 2.4397e6), EARTH(5.976e+24, 6.37814e6), JUPITER(1.9e+27, 7.1492e7);

        private final double mass;
        private final double radius;
        Planet(double mass, double radius) {
            this.mass = mass;
            this.radius = radius;
        }
        double surfaceGravity() { return 6.67300E-11 * mass / (radius * radius); }
    }

    enum Op {
        PLUS("+") {
            int apply(int a, int b) { return a + b; }
        },
        TIMES("*") {
            int apply(int a, int b) { return a * b; }
        };

        final String symbol;
        Op(String symbol) { this.symbol = symbol; }
        abstract int apply(int a, int b);
    }

    enum Day { MON, TUE, WED, THU, FRI, SAT, SUN }

    record Point(int x, int y) {
        Point {
            if (x < 0)
                throw new IllegalArgumentException("negative x: " + x);
        }
        double distance() { return Math.sqrt(x * x + y * y); }
        static Point origin() { return new Point(0, 0); }
    }

    record Pair<A, B>(A first, B second) {}

    sealed interface Expr permits Num, Add, Mul {}
    record Num(int value) implements Expr {}
    record Add(Expr left, Expr right) implements Expr {}
    record Mul(Expr left, Expr right) implements Expr {}

    static int eval(Expr e) {
        return switch (e) {
            case Num n -> n.value();
            case Add a -> eval(a.left()) + eval(a.right());
            case Mul m -> eval(m.left()) * eval(m.right());
        };
    }

    static String show(Expr e) {
        if (e instanceof Num n)
            return String.valueOf(n.value());
        if (e instanceof Add a)
            return "(" + show(a.left()) + " + " + show(a.right()) + ")";
        Mul m = (Mul) e;
        return show(m.left()) + " * " + show(m.right());
    }

    static String classify(Object o) {
        return switch (o) {
            case null -> "null!";
            case Integer i when i > 100 -> "large " + i;
            case Integer i -> "integer " + i;
            case String s -> "string \"" + s + "\"";
            case Point(int x, int y) when x == y -> "diagonal point " + x;
            case Point p -> "point " + p;
            default -> "something else: " + o;
        };
    }

    public static void main(String[] args) {
        for (Planet p : Planet.values())
            System.out.printf("%-8s %6.2f %d%n", p, p.surfaceGravity(), p.ordinal());
        System.out.println(Planet.valueOf("EARTH").name() + " " + Planet.EARTH.compareTo(Planet.JUPITER) + " " + Planet.MERCURY.getDeclaringClass().getSimpleName());
        for (Op op : Op.values())
            System.out.println(op + " " + op.symbol + " " + op.apply(6, 7));
        EnumMap<Day, Integer> hours = new EnumMap<>(Day.class);
        hours.put(Day.FRI, 6);
        hours.put(Day.MON, 8);
        hours.put(Day.WED, 7);
        System.out.println(hours);
        for (Day d : List.of(Day.MON, Day.SAT, Day.WED)) {
            String kind = switch (d) {
                case SAT, SUN -> "weekend";
                case MON -> {
                    String start = "start";
                    yield start + " of week";
                }
                default -> "weekday";
            };
            System.out.println(d + ": " + kind);
        }
        int len = 0;
        switch (Day.TUE) {
            case MON:
                len = 1;
            case TUE:
                len += 2;
            case WED:
                len += 3;
                break;
            default:
                len = -1;
        }
        System.out.println("fallthrough " + len);
        Point p = new Point(3, 4);
        Point q = new Point(3, 4);
        System.out.println(p + " " + p.distance() + " " + p.equals(q) + " " + (p == q) + " " + (p.hashCode() == q.hashCode()));
        System.out.println(Point.origin() + " " + new Pair<>("a", List.of(1, 2)));
        try {
            new Point(-1, 0);
        } catch (IllegalArgumentException e) {
            System.out.println("caught " + e.getMessage());
        }
        Expr expr = new Add(new Num(2), new Mul(new Num(3), new Num(4)));
        System.out.println(show(expr) + " = " + eval(expr));
        System.out.println(expr);
        for (Object o : new Object[] { 7, 1000, "hi", new Point(2, 2), new Point(1, 5), 2.5, null })
            System.out.println(classify(o));
        String code = "b";
        switch (code) {
            case "a" -> System.out.println("alpha");
            case "b", "c" -> System.out.println("beta or gamma");
            default -> System.out.println("other");
        }
        char grade = 'B';
        int points = switch (grade) {
            case 'A' -> 4;
            case 'B' -> 3;
            default -> 0;
        };
        System.out.println(points);
    }
}

// Output:
// MERCURY    3.70 0
// EARTH      9.80 1
// JUPITER   24.81 2
// EARTH -1 Planet
// PLUS + 13
// TIMES * 42
// {MON=8, WED=7, FRI=6}
// MON: start of week
// SAT: weekend
// WED: weekday
// fallthrough 5
// Point[x=3, y=4] 5.0 true false true
// Point[x=0, y=0] Pair[first=a, second=[1, 2]]
// caught negative x: -1
// (2 + 3 * 4) = 14
// Add[left=Num[value=2], right=Mul[left=Num[value=3], right=Num[value=4]]]
// integer 7
// large 1000
// string "hi"
// diagonal point 2
// point Point[x=1, y=5]
// something else: 2.5
// null!
// beta or gamma
// 3
