// Bits of the language: interfaces with static and private methods,
// nested and inner classes, the initialization order, labels, arrays of
// arrays, var, the ternary operator with boxing, switch on strings,
// varargs.
import java.util.*;
import java.util.function.*;

public class Main {
    interface Greeter {
        String name();
        default String greet() { return prefix() + name() + "!"; }
        private String prefix() { return "Hello, "; }
        static Greeter of(String name) { return () -> name; }
    }

    static class Counter {
        static int instances;
        static {
            instances = 100;
        }
        private int value;
        {
            value = 10;
        }
        Counter() { instances++; }
        Counter(int start) {
            this();
            value = start;
        }
        Counter inc() {
            value++;
            return this;
        }
    }

    class Inner {
        int read() { return field * 2; }
    }
    int field = 21;

    static int sum(int... values) {
        int total = 0;
        for (int v : values)
            total += v;
        return total;
    }

    static String describe(Object... items) { return items.length + ":" + Arrays.toString(items); }

    static <T extends Comparable<T>> T largest(List<T> items) {
        T best = items.get(0);
        for (T item : items)
            if (item.compareTo(best) > 0)
                best = item;
        return best;
    }

    public static void main(String[] args) {
        System.out.println(Greeter.of("Ann").greet());
        Counter a = new Counter().inc().inc(), b = new Counter(5).inc();
        System.out.println(a.value + " " + b.value + " " + Counter.instances);
        Main outer = new Main();
        Main.Inner inner = outer.new Inner();
        outer.field = 50;
        System.out.println(inner.read());

        int found = -1;
        search:
        for (int i = 0; i < 5; i++) {
            for (int j = 0; j < 5; j++) {
                if (i * j == 6) {
                    found = i * 10 + j;
                    break search;
                }
                if (j > i)
                    continue search;
            }
        }
        System.out.println("found " + found);

        int[][] triangle = new int[5][];
        for (int i = 0; i < triangle.length; i++) {
            triangle[i] = new int[i + 1];
            triangle[i][0] = triangle[i][i] = 1;
            for (int j = 1; j < i; j++)
                triangle[i][j] = triangle[i - 1][j - 1] + triangle[i - 1][j];
        }
        System.out.println(Arrays.deepToString(triangle));
        char[][] board = new char[2][3];
        for (char[] row : board)
            Arrays.fill(row, '.');
        board[1][2] = '#';
        System.out.println(new String(board[0]) + "/" + new String(board[1]));

        var map = new TreeMap<String, List<Integer>>();
        for (var word : "one two three two one two".split(" "))
            map.computeIfAbsent(word, k -> new ArrayList<>()).add(word.length());
        for (var entry : map.entrySet())
            System.out.print(entry.getKey() + entry.getValue() + " ");
        System.out.println();

        Integer boxed = null;
        int fallback = boxed != null ? boxed : -1;
        Integer small = 100, other = 100;
        System.out.println(fallback + " " + (small.equals(other)) + " " + sum() + " " + sum(1, 2, 3) + " " + describe("x", 2, 'c', null));
        String command = "stop";
        switch (command) {
            case "go":
                System.out.println("going");
                break;
            case "stop":
            case "halt":
                System.out.println("stopping");
                break;
            default:
                System.out.println("unknown");
        }
        System.out.println(largest(List.of(3, 9, 4)) + " " + largest(List.of("pear", "apple")) + " " + largest(List.of('q', 'z', 'a')));
        BiFunction<Integer, Integer, Integer> power = (base, exp) -> {
            int result = 1;
            for (int i = 0; i < exp; i++)
                result *= base;
            return result;
        };
        Supplier<String> lazy = () -> "computed";
        System.out.println(power.apply(3, 4) + " " + lazy.get() + " " + ((Function<String, Integer>) String::length).apply("four"));
        long big = 1L << 40;
        int narrow = (int) big;
        short s = (short) 40000;
        float f = 1.1f;
        double d = f;
        System.out.println(big + " " + narrow + " " + s + " " + (d == 1.1) + " " + (float) d + " " + (5 / 2.0) + " " + (char) 65 + " " + (int) 'A' + " " + ('a' + 'b') + " " + (char) ('a' + 1));
        StringBuilder fizz = new StringBuilder();
        for (int i = 1; i <= 15; i++)
            fizz.append(i % 15 == 0 ? "FizzBuzz" : i % 3 == 0 ? "Fizz" : i % 5 == 0 ? "Buzz" : String.valueOf(i)).append(i < 15 ? "," : "");
        System.out.println(fizz);
        Object o = new int[] { 1, 2 };
        if (o instanceof int[] arr && arr.length == 2)
            System.out.println("pair " + arr[0] + arr[1]);
        System.out.println(Objects.hash(1, "a", 2.5) + " " + Arrays.hashCode(new int[] { 1, 2, 3 }) + " " + List.of("a", "b").hashCode() + " " + Map.of("k", 1).hashCode() + " " + Boolean.hashCode(true) + " " + Character.valueOf('x').hashCode());
        Object missing = null;
        try {
            System.out.println("text " + missing + " " + missing.toString());
        } catch (NullPointerException e) {
            System.out.println("npe on toString");
        }
    }
}


// Output:
// Hello, Ann!
// 12 6 102
// 100
// found 23
// [[1], [1, 1], [1, 2, 1], [1, 3, 3, 1], [1, 4, 6, 4, 1]]
// .../..#
// one[3, 3] three[5] two[3, 3, 3]
// -1 true 0 6 4:[x, 2, c, null]
// stopping
// 9 pear z
// 81 computed 4
// 1099511627776 0 -25536 false 1.1 2.5 A 65 195 b
// 1,2,Fizz,4,Buzz,Fizz,7,8,Fizz,Buzz,11,Fizz,13,14,FizzBuzz
// pair 12
// 1074037727 30817 4066 106 1231 120
// npe on toString
