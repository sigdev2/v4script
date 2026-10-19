// Generics: classes and methods with type parameters, bounds, wildcards,
// generic interfaces; lambdas, method references, functional interfaces,
// closures, function composition.
import java.util.*;
import java.util.function.*;

public class Main {
    static class Box<T extends Comparable<T>> {
        private final List<T> items = new ArrayList<>();
        void add(T item) { items.add(item); }
        T max() {
            T best = items.get(0);
            for (T item : items)
                if (item.compareTo(best) > 0)
                    best = item;
            return best;
        }
        <R> List<R> map(Function<? super T, ? extends R> f) {
            List<R> result = new ArrayList<>();
            for (T item : items)
                result.add(f.apply(item));
            return result;
        }
    }

    static class Node<T> implements Iterable<T> {
        final T value;
        final Node<T> next;
        Node(T value, Node<T> next) {
            this.value = value;
            this.next = next;
        }
        public Iterator<T> iterator() {
            return new Iterator<T>() {
                Node<T> current = Node.this;
                public boolean hasNext() { return current != null; }
                public T next() {
                    T value = current.value;
                    current = current.next;
                    return value;
                }
            };
        }
    }

    interface Visitor<R> {
        R visitNumber(int n);
        R visitSum(Tree a, Tree b);
    }
    interface Tree { <R> R accept(Visitor<R> v); }

    static Tree num(int n) {
        return new Tree() {
            public <R> R accept(Visitor<R> v) { return v.visitNumber(n); }
        };
    }
    static Tree sum(Tree a, Tree b) {
        return new Tree() {
            public <R> R accept(Visitor<R> v) { return v.visitSum(a, b); }
        };
    }

    static <T> void swap(T[] array, int i, int j) {
        T tmp = array[i];
        array[i] = array[j];
        array[j] = tmp;
    }
    static double total(Collection<? extends Number> numbers) {
        double sum = 0;
        for (Number n : numbers)
            sum += n.doubleValue();
        return sum;
    }
    static void fill(List<? super Integer> target, int count) {
        for (int i = 0; i < count; i++)
            target.add(i);
    }
    static <K, V extends Comparable<V>> K argMax(Map<K, V> map) {
        K best = null;
        V bestValue = null;
        for (Map.Entry<K, V> e : map.entrySet())
            if (bestValue == null || e.getValue().compareTo(bestValue) > 0) {
                best = e.getKey();
                bestValue = e.getValue();
            }
        return best;
    }
    @SafeVarargs
    static <T> List<T> listOf(T... items) { return new ArrayList<>(Arrays.asList(items)); }

    static Function<Integer, Integer> adder(int n) { return x -> x + n; }

    public static void main(String[] args) {
        Box<String> box = new Box<>();
        box.add("pear");
        box.add("apple");
        box.add("quince");
        System.out.println(box.max() + " " + box.map(String::length) + " " + box.map(s -> s.charAt(0)));
        Node<String> chain = new Node<>("a", new Node<>("b", new Node<>("c", null)));
        StringBuilder sb = new StringBuilder();
        for (String s : chain)
            sb.append(s);
        System.out.println(sb);
        Tree expr = sum(num(3), sum(num(4), num(5)));
        int value = expr.accept(new Visitor<Integer>() {
            public Integer visitNumber(int n) { return n; }
            public Integer visitSum(Tree a, Tree b) { return a.accept(this) + b.accept(this); }
        });
        String shown = expr.accept(new Visitor<String>() {
            public String visitNumber(int n) { return String.valueOf(n); }
            public String visitSum(Tree a, Tree b) { return "(" + a.accept(this) + "+" + b.accept(this) + ")"; }
        });
        System.out.println(shown + " = " + value);
        Integer[] arr = { 1, 2, 3 };
        swap(arr, 0, 2);
        System.out.println(Arrays.toString(arr) + " " + total(List.of(1, 2.5, 3L)));
        List<Number> numbers = new ArrayList<>();
        fill(numbers, 4);
        System.out.println(numbers + " " + argMax(Map.of("x", 3, "y", 9, "z", 5)) + " " + listOf("p", "q"));

        Function<Integer, Integer> square = x -> x * x;
        Function<Integer, Integer> plus10 = adder(10);
        System.out.println(square.andThen(plus10).apply(3) + " " + square.compose(plus10).apply(3) + " " + Function.<Integer>identity().apply(7));
        BiFunction<String, Integer, String> repeat = String::repeat;
        Supplier<List<String>> maker = ArrayList::new;
        List<String> made = maker.get();
        made.add(repeat.apply("ab", 3));
        Predicate<String> empty = String::isEmpty;
        Predicate<String> notEmpty = empty.negate();
        UnaryOperator<String> upper = String::toUpperCase;
        BinaryOperator<Integer> max = BinaryOperator.maxBy(Comparator.naturalOrder());
        System.out.println(made + " " + notEmpty.test("") + " " + upper.apply("x") + " " + max.apply(4, 9) + " " + Predicate.not(empty).test("a"));
        IntBinaryOperator gcd = new IntBinaryOperator() {
            public int applyAsInt(int a, int b) { return b == 0 ? a : applyAsInt(b, a % b); }
        };
        IntPredicate even = n -> n % 2 == 0;
        ToIntFunction<String> len = String::length;
        IntFunction<String> stars = "*"::repeat;
        System.out.println(gcd.applyAsInt(84, 36) + " " + even.and(n -> n > 2).test(4) + " " + len.applyAsInt("four") + " " + stars.apply(3));
        List<Runnable> actions = new ArrayList<>();
        for (int i = 0; i < 3; i++) {
            int copy = i;
            actions.add(() -> System.out.print(copy + " "));
        }
        actions.forEach(Runnable::run);
        System.out.println();
        int[] counter = { 0 };
        Runnable increment = () -> counter[0]++;
        increment.run();
        increment.run();
        System.out.println(counter[0]);
        Map<String, Function<Double, Double>> ops = new LinkedHashMap<>();
        ops.put("half", d -> d / 2);
        ops.put("sqrt", Math::sqrt);
        ops.put("neg", d -> -d);
        ops.forEach((name, op) -> System.out.print(name + "=" + op.apply(16.0) + " "));
        System.out.println();
        Comparator<String> cmp = Comparator.comparing(String::length);
        cmp = cmp.thenComparing(Comparator.reverseOrder());
        List<String> sorted = new ArrayList<>(List.of("bb", "a", "ccc", "aa", "c"));
        sorted.sort(cmp);
        System.out.println(sorted);
        Optional<String> first = sorted.stream().filter(s -> s.length() > 2).findFirst();
        System.out.println(first.map(String::toUpperCase).orElse("-") + " " + Optional.ofNullable((String) null).map(String::length).orElseGet(() -> -1));
    }
}
