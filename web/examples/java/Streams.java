// Streams and collectors: grouping, averages and joining.
import java.util.*;
import java.util.stream.*;

public class Streams {
    record Book(String title, String author, int year, int pages) {}

    public static void main(String[] args) {
        List<Book> books = List.of(
            new Book("Night Train", "Orlova", 1998, 320),
            new Book("Small Rivers", "Petrov", 2004, 180),
            new Book("The Lighthouse", "Orlova", 2011, 410),
            new Book("Snow Fields", "Ivanova", 1987, 256),
            new Book("Old Maps", "Petrov", 2019, 220));

        Map<String, List<String>> byAuthor = books.stream()
            .collect(Collectors.groupingBy(Book::author, TreeMap::new,
                     Collectors.mapping(Book::title, Collectors.toList())));
        byAuthor.forEach((author, titles) -> System.out.println(author + ": " + titles));

        double average = books.stream().mapToInt(Book::pages).average().orElse(0);
        System.out.printf("Average length: %.1f pages%n", average);

        String recent = books.stream()
            .filter(b -> b.year() >= 2000)
            .sorted(Comparator.comparingInt(Book::year))
            .map(b -> b.title() + " (" + b.year() + ")")
            .collect(Collectors.joining(", "));
        System.out.println("Since 2000: " + recent);

        IntSummaryStatistics stats = IntStream.rangeClosed(1, 100).filter(n -> n % 7 == 0).summaryStatistics();
        System.out.println("Multiples of 7 up to 100: " + stats);
    }
}
