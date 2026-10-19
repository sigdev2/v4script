// Collections: lists, sets, maps, queues, the iteration order as in the
// JDK, iterators, views, sorting, Arrays and Collections.
import java.util.*;

public class Main {
    public static void main(String[] args) {
        List<String> list = new ArrayList<>(List.of("delta", "alpha", "charlie", "bravo"));
        list.add(1, "echo");
        list.remove("charlie");
        list.set(0, "DELTA");
        System.out.println(list + " " + list.size() + " " + list.indexOf("bravo") + " " + list.contains("alpha"));
        Collections.sort(list);
        System.out.println(list + " " + Collections.max(list) + " " + Collections.min(list, Comparator.comparing(String::length)));
        list.subList(1, 3).clear();
        System.out.println(list);
        Iterator<String> it = list.iterator();
        while (it.hasNext())
            if (it.next().startsWith("D"))
                it.remove();
        System.out.println(list);
        ListIterator<String> li = list.listIterator();
        while (li.hasNext())
            li.set(li.next().toUpperCase());
        System.out.println(list);

        LinkedList<Integer> linked = new LinkedList<>();
        for (int i = 1; i <= 5; i++) {
            linked.addFirst(i);
            linked.addLast(-i);
        }
        System.out.println(linked + " " + linked.getFirst() + " " + linked.peekLast() + " " + linked.pollFirst() + " " + linked.removeLast());

        Set<Integer> hash = new HashSet<>();
        for (int i = 0; i < 20; i++)
            hash.add(i * 37 % 101);
        System.out.println(hash);
        Set<String> words = new HashSet<>(Arrays.asList("zebra", "apple", "mango", "kiwi", "banana", "cherry", "date", "fig", "grape",
                                                        "lemon", "lime", "melon", "nectarine", "orange", "papaya"));
        System.out.println(words);
        Set<String> linkedSet = new LinkedHashSet<>(List.of("one", "two", "three"));
        linkedSet.add("two");
        linkedSet.add("four");
        System.out.println(linkedSet);
        TreeSet<Integer> tree = new TreeSet<>(List.of(50, 20, 80, 10, 30, 70, 90));
        System.out.println(tree + " " + tree.first() + " " + tree.last() + " " + tree.floor(55) + " " + tree.ceiling(55) + " " + tree.headSet(30) + " " + tree.tailSet(70) + " " + tree.descendingSet());
        Set<Integer> a = new TreeSet<>(List.of(1, 2, 3, 4)), b = new TreeSet<>(List.of(3, 4, 5));
        Set<Integer> union = new TreeSet<>(a), inter = new TreeSet<>(a), diff = new TreeSet<>(a);
        union.addAll(b);
        inter.retainAll(b);
        diff.removeAll(b);
        System.out.println(union + " " + inter + " " + diff);

        Map<String, Integer> map = new HashMap<>();
        String[] names = { "Ivan", "Olga", "Petr", "Anna", "Boris", "Elena", "Sergey", "Maria", "Dmitry", "Tatiana", "Nikolai", "Yulia", "Pavel", "Irina" };
        for (int i = 0; i < names.length; i++)
            map.put(names[i], names[i].length() * 10 + i);
        System.out.println(map);
        map.remove("Olga");
        map.computeIfAbsent("Zoya", k -> 1);
        map.computeIfPresent("Ivan", (k, v) -> v + 1000);
        map.putIfAbsent("Anna", -1);
        System.out.println(map.get("Ivan") + " " + map.getOrDefault("Nobody", 0) + " " + map.containsKey("Zoya") + " " + map.containsValue(51) + " " + map.size());
        for (Map.Entry<String, Integer> entry : map.entrySet())
            if (entry.getValue() > 60)
                entry.setValue(0);
        map.entrySet().removeIf(e -> e.getKey().length() > 5);
        System.out.println(map);
        System.out.println(map.keySet() + " " + map.values());
        Map<String, List<Integer>> multi = new TreeMap<>();
        for (int i = 0; i < 10; i++)
            multi.computeIfAbsent(i % 3 == 0 ? "three" : (i % 2 == 0 ? "even" : "odd"), k -> new ArrayList<>()).add(i);
        System.out.println(multi);
        TreeMap<Integer, String> grades = new TreeMap<>(Map.of(90, "A", 80, "B", 70, "C", 60, "D"));
        System.out.println(grades.floorEntry(85).getValue() + grades.ceilingKey(61) + " " + grades.firstEntry() + " " + grades.headMap(75) + " " + grades.descendingMap());
        Map<String, Integer> lru = new LinkedHashMap<>(16, 0.75f, true) {
            protected boolean removeEldestEntry(Map.Entry<String, Integer> eldest) { return size() > 3; }
        };
        lru.put("a", 1);
        lru.put("b", 2);
        lru.put("c", 3);
        lru.get("a");
        lru.put("d", 4);
        System.out.println(lru);

        Deque<Integer> stack = new ArrayDeque<>();
        Queue<Integer> queue = new ArrayDeque<>();
        for (int i = 0; i < 5; i++) {
            stack.push(i);
            queue.offer(i);
        }
        System.out.println(stack + " " + stack.pop() + " " + stack.peek() + " " + queue.poll() + " " + queue);
        PriorityQueue<Integer> heap = new PriorityQueue<>(List.of(5, 1, 8, 3, 9, 2));
        System.out.println(heap);
        heap.add(0);
        StringBuilder order = new StringBuilder();
        while (!heap.isEmpty())
            order.append(heap.poll()).append(' ');
        System.out.println(order.toString().trim());
        PriorityQueue<String> byLength = new PriorityQueue<>(Comparator.comparing(String::length).reversed());
        byLength.addAll(List.of("aa", "b", "cccc", "ddd"));
        System.out.println(byLength.poll() + " " + byLength);
        Stack<Character> chars = new Stack<>();
        for (char c : "({[]})".toCharArray()) {
            if ("({[".indexOf(c) >= 0)
                chars.push(c);
            else if (!chars.isEmpty() && "({[".indexOf(chars.peek()) == ")}]".indexOf(c))
                chars.pop();
        }
        System.out.println("balanced " + chars.isEmpty());

        int[] numbers = { 5, 3, 9, 1, 7 };
        int[] copy = Arrays.copyOf(numbers, 7);
        Arrays.sort(numbers);
        System.out.println(Arrays.toString(numbers) + " " + Arrays.toString(copy) + " " + Arrays.binarySearch(numbers, 7) + " " + Arrays.stream(numbers).sum());
        Integer[] boxed = { 3, 1, 2 };
        Arrays.sort(boxed, Collections.reverseOrder());
        int[][] grid = new int[3][4];
        for (int[] row : grid)
            Arrays.fill(row, 7);
        grid[1][2] = 0;
        System.out.println(Arrays.toString(boxed) + " " + Arrays.deepToString(grid) + " " + Arrays.equals(new int[] { 1, 2 }, new int[] { 1, 2 }));
        List<Integer> shuffled = new ArrayList<>(List.of(1, 2, 3, 4, 5, 6, 7, 8));
        Collections.shuffle(shuffled, new Random(42));
        Collections.swap(shuffled, 0, 7);
        System.out.println(shuffled + " " + Collections.frequency(List.of(1, 2, 1, 1), 1) + " " + Collections.nCopies(3, "ab"));
        List<Integer> fixed = Arrays.asList(4, 2, 6);
        fixed.set(0, 9);
        System.out.println(fixed + " " + List.of(1, 2).equals(Arrays.asList(1, 2)) + " " + new ArrayList<>(List.of(1, 2)).hashCode() + " " + Set.of(3).equals(new HashSet<>(List.of(3))));
        Random random = new Random(7);
        System.out.println(random.nextInt(100) + " " + random.nextInt(100) + " " + random.nextDouble() + " " + random.nextBoolean() + " " + random.nextLong() + " " + random.nextInt(5, 10));
        try {
            for (String s : list)
                list.add(s);
        } catch (ConcurrentModificationException e) {
            System.out.println("CME");
        }
    }
}

// Output:
// [DELTA, echo, alpha, bravo] 4 3 true
// [DELTA, alpha, bravo, echo] echo echo
// [DELTA, echo]
// [echo]
// [ECHO]
// [5, 4, 3, 2, 1, -1, -2, -3, -4, -5] 5 -5 5 -5
// [0, 97, 67, 3, 37, 40, 74, 10, 77, 13, 47, 50, 84, 20, 87, 23, 57, 60, 94, 30]
// [zebra, banana, date, papaya, cherry, kiwi, nectarine, fig, lime, grape, mango, orange, apple, lemon, melon]
// [one, two, three, four]
// [10, 20, 30, 50, 70, 80, 90] 10 90 50 70 [10, 20] [70, 80, 90] [90, 80, 70, 50, 30, 20, 10]
// [1, 2, 3, 4, 5] [3, 4] [1, 2]
// {Dmitry=68, Irina=63, Elena=55, Olga=41, Yulia=61, Petr=42, Tatiana=79, Ivan=40, Boris=54, Pavel=62, Maria=57, Sergey=66, Anna=43, Nikolai=80}
// 1040 0 true false 14
// {Irina=0, Elena=55, Yulia=0, Petr=42, Zoya=1, Ivan=0, Boris=54, Pavel=0, Maria=57, Anna=43}
// [Irina, Elena, Yulia, Petr, Zoya, Ivan, Boris, Pavel, Maria, Anna] [0, 55, 0, 42, 1, 0, 54, 0, 57, 43]
// {even=[2, 4, 8], odd=[1, 5, 7], three=[0, 3, 6, 9]}
// B70 60=D {60=D, 70=C} {90=A, 80=B, 70=C, 60=D}
// {c=3, a=1, d=4}
// [4, 3, 2, 1, 0] 4 3 0 [1, 2, 3, 4]
// [1, 3, 2, 5, 9, 8]
// 0 1 2 3 5 8 9
// cccc [ddd, b, aa]
// balanced true
// [1, 3, 5, 7, 9] [5, 3, 9, 1, 7, 0, 0] 3 25
// [3, 2, 1] [[7, 7, 7, 7], [7, 7, 0, 7], [7, 7, 7, 7]] true
// [6, 7, 4, 2, 5, 1, 8, 3] 3 [ab, ab, ab]
// [9, 2, 6] true 994 true
// 36 64 0.7491696031336331 false 9050065214052234305 9
// CME
