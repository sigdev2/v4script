// Streams: filter, map, sorted, flatMap, primitive streams, Collectors
// (groupingBy, partitioningBy, toMap, joining), Optional, statistics.
import java.util.*;
import java.util.stream.*;

public class Main {
    record Person(String name, String city, int age) {}

    public static void main(String[] args) {
        List<Integer> numbers = List.of(5, 3, 8, 1, 9, 2, 7);
        System.out.println(numbers.stream().filter(n -> n % 2 == 1).map(n -> n * n).collect(Collectors.toList()));
        System.out.println(numbers.stream().sorted().map(String::valueOf).collect(Collectors.joining(", ", "[", "]")));
        System.out.println(IntStream.rangeClosed(1, 5).sum() + " " + IntStream.range(0, 5).boxed().toList());
        System.out.println(numbers.stream().mapToInt(Integer::intValue).max().getAsInt());
        List<Person> people = List.of(new Person("Anna", "Moscow", 30), new Person("Boris", "Kazan", 25),
                                      new Person("Vera", "Moscow", 41), new Person("Gleb", "Omsk", 19));
        Map<String, List<String>> byCity = people.stream()
            .collect(Collectors.groupingBy(Person::city, TreeMap::new, Collectors.mapping(Person::name, Collectors.toList())));
        System.out.println(byCity);
        Map<String, Long> counts = people.stream().collect(Collectors.groupingBy(Person::city, Collectors.counting()));
        System.out.println(counts);
        System.out.println(people.stream().collect(Collectors.partitioningBy(p -> p.age() >= 30)));
        System.out.println(people.stream().mapToInt(Person::age).average().orElse(0));
        Optional<Person> oldest = people.stream().max(Comparator.comparingInt(Person::age));
        System.out.println(oldest.map(Person::name).orElse("none"));
        List<String> names = people.stream().map(Person::name).sorted(Comparator.reverseOrder()).toList();
        System.out.println(names);
        System.out.println(Stream.iterate(1, x -> x * 2).limit(10).reduce(0, Integer::sum));
        System.out.println(Arrays.stream(new int[] {3, 1, 2}).map(x -> x * 10).boxed().collect(Collectors.toList()));
        System.out.println(people.stream().sorted(Comparator.comparing(Person::city).thenComparing(Person::age, Comparator.reverseOrder())).map(Person::name).collect(Collectors.joining(" ")));
        Map<Boolean, Long> parts = numbers.stream().collect(Collectors.partitioningBy(n -> n > 4, Collectors.counting()));
        System.out.println(parts);
        System.out.println(Stream.of("a", "bb", "ccc").collect(Collectors.toMap(s -> s, String::length)));
        System.out.println(DoubleStream.of(0.1, 0.2, 0.3).sum() + " " + DoubleStream.of(0.1, 0.2, 0.3).average().getAsDouble());
        System.out.println(IntStream.of(4, 8, 15, 16, 23, 42).summaryStatistics());
        String text = "to be or not to be";
        Map<String, Integer> freq = new TreeMap<>();
        Arrays.stream(text.split(" ")).forEach(w -> freq.merge(w, 1, Integer::sum));
        System.out.println(freq);
        System.out.println("hello".chars().filter(c -> c == 'l').count());
        List<List<Integer>> nested = List.of(List.of(1, 2), List.of(3), List.of());
        System.out.println(nested.stream().flatMap(List::stream).map(x -> x + 1).collect(Collectors.toSet()));
    }
}

// Output:
// [25, 9, 1, 81, 49]
// [1, 2, 3, 5, 7, 8, 9]
// 15 [0, 1, 2, 3, 4]
// 9
// {Kazan=[Boris], Moscow=[Anna, Vera], Omsk=[Gleb]}
// {Omsk=1, Moscow=2, Kazan=1}
// {false=[Person[name=Boris, city=Kazan, age=25], Person[name=Gleb, city=Omsk, age=19]], true=[Person[name=Anna, city=Moscow, age=30], Person[name=Vera, city=Moscow, age=41]]}
// 28.75
// Vera
// [Vera, Gleb, Boris, Anna]
// 1023
// [30, 10, 20]
// Boris Vera Anna Gleb
// {false=3, true=4}
// {bb=2, a=1, ccc=3}
// 0.6 0.19999999999999998
// IntSummaryStatistics{count=6, sum=108, min=4, average=18.000000, max=42}
// {be=2, not=1, or=1, to=2}
// 2
// [2, 3, 4]
