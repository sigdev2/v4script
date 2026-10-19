// A unit as a jshell snippet: top-level statements, methods, classes and
// variables without class Main; the value of the last expression goes to
// the console.
import java.util.*;

int fib(int n) {
    return n < 2 ? n : fib(n - 1) + fib(n - 2);
}

record Item(String name, double price) {}

var items = new ArrayList<Item>();
items.add(new Item("tea", 3.5));
items.add(new Item("coffee", 4.25));
items.add(new Item("water", 1));

double total = 0;
for (Item item : items)
    total += item.price();
System.out.printf("total %.2f%n", total);

String describe(Item item) {
    return item.name() + (item.price() > 2 ? " (pricey)" : "");
}

for (Item item : items)
    System.out.println(describe(item));
System.out.println(fib(20));
final int limit = 5;
int count = 0;
while (count < limit)
    count += 2;
count;

// Output:
// total 8.75
// tea (pricey)
// coffee (pricey)
// water
// 6765
// Value: 6
