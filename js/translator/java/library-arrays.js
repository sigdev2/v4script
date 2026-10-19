// Java: java.util.Arrays and java.util.Collections written in Java. The
// overloads for every primitive come from templates; sorting and copying
// arrays are natives (natives-util.js).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Java = T.java;
    if (Java.library.units['java.util.arrays'])
        return;

    var PRIMITIVES = ['int', 'long', 'short', 'char', 'byte', 'boolean', 'float', 'double'];
    var BOXES = { int: 'Integer', long: 'Long', short: 'Short', char: 'Character', byte: 'Byte', boolean: 'Boolean',
                  float: 'Float', double: 'Double' };

    // The Arrays methods for one element type (elementType - a primitive or Object).
    function perType(elementType) {
        var arrayType = elementType + '[]';
        var lines = [];
        var hash = elementType === 'long' ? 'Long.hashCode(e)' : (elementType === 'double' ? 'Double.hashCode(e)'
                 : (elementType === 'float' ? 'Float.hashCode(e)' : (elementType === 'boolean' ? '(e ? 1231 : 1237)'
                 : (elementType === 'Object' ? '(e == null ? 0 : e.hashCode())' : '(int) e'))));
        var same = elementType === 'double' ? 'Double.doubleToLongBits(a[i]) == Double.doubleToLongBits(b[i])'
                 : (elementType === 'float' ? 'Float.compare(a[i], b[i]) == 0' : (elementType === 'Object' ? 'Objects.equals(a[i], b[i])' : 'a[i] == b[i]'));
        lines.push(
            '    public static String toString(' + arrayType + ' a) {',
            '        if (a == null)',
            '            return "null";',
            '        if (a.length == 0)',
            '            return "[]";',
            '        StringBuilder sb = new StringBuilder("[");',
            '        for (int i = 0; ; i++) {',
            '            sb.append(String.valueOf(a[i]));',
            '            if (i == a.length - 1)',
            '                return sb.append(\']\').toString();',
            '            sb.append(", ");',
            '        }',
            '    }',
            '    public static int hashCode(' + arrayType + ' a) {',
            '        if (a == null)',
            '            return 0;',
            '        int result = 1;',
            '        for (' + elementType + ' e : a)',
            '            result = 31 * result + ' + hash + ';',
            '        return result;',
            '    }',
            '    public static boolean equals(' + arrayType + ' a, ' + arrayType + ' b) {',
            '        if (a == b)',
            '            return true;',
            '        if (a == null || b == null || a.length != b.length)',
            '            return false;',
            '        for (int i = 0; i < a.length; i++)',
            '            if (!(' + same + '))',
            '                return false;',
            '        return true;',
            '    }',
            '    public static void fill(' + arrayType + ' a, ' + elementType + ' value) {',
            '        for (int i = 0; i < a.length; i++)',
            '            a[i] = value;',
            '    }',
            '    public static void fill(' + arrayType + ' a, int from, int to, ' + elementType + ' value) {',
            '        rangeCheck(a.length, from, to);',
            '        for (int i = from; i < to; i++)',
            '            a[i] = value;',
            '    }');
        if (elementType !== 'Object') {
            lines.push(
                '    public static native ' + arrayType + ' copyOf(' + arrayType + ' original, int length);',
                '    public static native ' + arrayType + ' copyOfRange(' + arrayType +
                    ' original, int from, int to);');
        }
        if (elementType !== 'boolean' && elementType !== 'Object') {
            lines.push(
                '    public static native void sort(' + arrayType + ' a);',
                '    public static native void sort(' + arrayType + ' a, int from, int to);',
                '    public static void parallelSort(' + arrayType + ' a) { sort(a); }',
                '    public static int binarySearch(' + arrayType + ' a, ' + elementType + ' key) { return binarySearch(a, 0, a.length, key); }',
                '    public static int binarySearch(' + arrayType + ' a, int from, int to, ' + elementType + ' key) {',
                '        rangeCheck(a.length, from, to);',
                '        int low = from, high = to - 1;',
                '        while (low <= high) {',
                '            int mid = (low + high) >>> 1;',
                '            int cmp = ' + BOXES[elementType] + '.compare(a[mid], key);',
                '            if (cmp < 0)',
                '                low = mid + 1;',
                '            else if (cmp > 0)',
                '                high = mid - 1;',
                '            else',
                '                return mid;',
                '        }',
                '        return -(low + 1);',
                '    }');
        }
        return lines.join('\n') + '\n';
    }

    Java.addLibrary('java.util.arrays', 'java.util', String.raw`
public final class Arrays {
    private Arrays() {}

    static void rangeCheck(int length, int from, int to) {
        if (from > to)
            throw new IllegalArgumentException("fromIndex(" + from + ") > toIndex(" + to + ")");
        if (from < 0)
            throw new ArrayIndexOutOfBoundsException("Array index out of range: " + from);
        if (to > length)
            throw new ArrayIndexOutOfBoundsException("Array index out of range: " + to);
    }

    @SafeVarargs
    public static <T> List<T> asList(T... items) { return new ArrayAsList<>(items); }

    public static native <T> T[] copyOf(T[] original, int length);
    public static native <T, U> T[] copyOf(U[] original, int length, Class<? extends T[]> type);
    public static native <T> T[] copyOfRange(T[] original, int from, int to);
    public static native void sort(Object[] a);
    public static native void sort(Object[] a, int from, int to);
    public static native <T> void sort(T[] a, Comparator<? super T> comparator);
    public static native <T> void sort(T[] a, int from, int to, Comparator<? super T> comparator);
    public static void parallelSort(Object[] a) { sort(a); }
    public static <T> void parallelSort(T[] a, Comparator<? super T> comparator) { sort(a, comparator); }

    public static int binarySearch(Object[] a, Object key) { return binarySearch(a, 0, a.length, key, null); }
    public static <T> int binarySearch(T[] a, T key, Comparator<? super T> comparator) {
        return binarySearch(a, 0, a.length, key, comparator);
    }
    public static <T> int binarySearch(T[] a, int from, int to, T key, Comparator<? super T> comparator) {
        rangeCheck(a.length, from, to);
        int low = from, high = to - 1;
        while (low <= high) {
            int mid = (low + high) >>> 1;
            int cmp = comparator == null ? ((Comparable<Object>) a[mid]).compareTo(key) : comparator.compare(a[mid], key);
            if (cmp < 0)
                low = mid + 1;
            else if (cmp > 0)
                high = mid - 1;
            else
                return mid;
        }
        return -(low + 1);
    }

    public static String deepToString(Object[] a) {
        if (a == null)
            return "null";
        StringBuilder sb = new StringBuilder();
        deepToString(a, sb, new ArrayList<Object[]>());
        return sb.toString();
    }
    private static void deepToString(Object[] a, StringBuilder sb, List<Object[]> seen) {
        if (a.length == 0) {
            sb.append("[]");
            return;
        }
        seen.add(a);
        sb.append('[');
        for (int i = 0; i < a.length; i++) {
            if (i > 0)
                sb.append(", ");
            Object e = a[i];
            if (e instanceof Object[] inner) {
                if (seen.contains(inner))
                    sb.append("[...]");
                else
                    deepToString(inner, sb, seen);
            } else if (e instanceof int[] x) {
                sb.append(toString(x));
            } else if (e instanceof long[] x) {
                sb.append(toString(x));
            } else if (e instanceof double[] x) {
                sb.append(toString(x));
            } else if (e instanceof char[] x) {
                sb.append(toString(x));
            } else if (e instanceof boolean[] x) {
                sb.append(toString(x));
            } else if (e instanceof byte[] x) {
                sb.append(toString(x));
            } else if (e instanceof short[] x) {
                sb.append(toString(x));
            } else if (e instanceof float[] x) {
                sb.append(toString(x));
            } else {
                sb.append(String.valueOf(e));
            }
        }
        sb.append(']');
        seen.remove(seen.size() - 1);
    }
    public static boolean deepEquals(Object[] a, Object[] b) {
        if (a == b)
            return true;
        if (a == null || b == null || a.length != b.length)
            return false;
        for (int i = 0; i < a.length; i++)
            if (!Objects.deepEquals(a[i], b[i]))
                return false;
        return true;
    }
    public static int deepHashCode(Object[] a) {
        if (a == null)
            return 0;
        int result = 1;
        for (Object e : a) {
            int h = 0;
            if (e instanceof Object[] inner)
                h = deepHashCode(inner);
            else if (e instanceof int[] x)
                h = hashCode(x);
            else if (e instanceof long[] x)
                h = hashCode(x);
            else if (e instanceof double[] x)
                h = hashCode(x);
            else if (e instanceof char[] x)
                h = hashCode(x);
            else if (e != null)
                h = e.hashCode();
            result = 31 * result + h;
        }
        return result;
    }

    public static <T> void setAll(T[] a, java.util.function.IntFunction<? extends T> generator) {
        for (int i = 0; i < a.length; i++)
            a[i] = generator.apply(i);
    }
    public static void setAll(int[] a, java.util.function.IntUnaryOperator generator) {
        for (int i = 0; i < a.length; i++)
            a[i] = generator.applyAsInt(i);
    }
    public static void setAll(long[] a, java.util.function.IntToLongFunction generator) {
        for (int i = 0; i < a.length; i++)
            a[i] = generator.applyAsLong(i);
    }
    public static void setAll(double[] a, java.util.function.IntToDoubleFunction generator) {
        for (int i = 0; i < a.length; i++)
            a[i] = generator.applyAsDouble(i);
    }

    public static <T> java.util.stream.Stream<T> stream(T[] a) { return stream(a, 0, a.length); }
    public static <T> java.util.stream.Stream<T> stream(T[] a, int from, int to) {
        rangeCheck(a.length, from, to);
        return java.util.stream.StreamSupport.ofIterator(new Iterator<T>() {
            private int index = from;
            public boolean hasNext() { return index < to; }
            public T next() {
                if (index >= to)
                    throw new NoSuchElementException();
                return a[index++];
            }
        });
    }
    public static java.util.stream.IntStream stream(int[] a) { return stream(a, 0, a.length); }
    public static java.util.stream.IntStream stream(int[] a, int from, int to) {
        rangeCheck(a.length, from, to);
        return java.util.stream.StreamSupport.intStream(new PrimitiveIterator.OfInt() {
            private int index = from;
            public boolean hasNext() { return index < to; }
            public int nextInt() {
                if (index >= to)
                    throw new NoSuchElementException();
                return a[index++];
            }
        });
    }
    public static java.util.stream.LongStream stream(long[] a) {
        return java.util.stream.StreamSupport.longStream(new PrimitiveIterator.OfLong() {
            private int index = 0;
            public boolean hasNext() { return index < a.length; }
            public long nextLong() {
                if (index >= a.length)
                    throw new NoSuchElementException();
                return a[index++];
            }
        });
    }
    public static java.util.stream.DoubleStream stream(double[] a) {
        return java.util.stream.StreamSupport.doubleStream(new PrimitiveIterator.OfDouble() {
            private int index = 0;
            public boolean hasNext() { return index < a.length; }
            public double nextDouble() {
                if (index >= a.length)
                    throw new NoSuchElementException();
                return a[index++];
            }
        });
    }
` + PRIMITIVES.map(perType).join('') + perType('Object') + String.raw`}
`);

    Java.addLibrary('java.util.collections', 'java.util', String.raw`
public final class Collections {
    private Collections() {}
    private static Random random;

    public static final List EMPTY_LIST = new ImmutableCollections.ListN<>(new Object[0], false);
    public static final Set EMPTY_SET = new ImmutableCollections.UnmodifiableSet<>(new HashSet<>());
    public static final Map EMPTY_MAP = new UnmodifiableMap<>(new HashMap<>());

    public static <T extends Comparable<? super T>> void sort(List<T> list) { list.sort(null); }
    public static <T> void sort(List<T> list, Comparator<? super T> comparator) { list.sort(comparator); }
    public static void reverse(List<?> list) {
        List<Object> items = (List<Object>) list;
        for (int i = 0, j = items.size() - 1; i < j; i++, j--) {
            Object x = items.get(i);
            items.set(i, items.get(j));
            items.set(j, x);
        }
    }
    public static void shuffle(List<?> list) {
        if (random == null)
            random = new Random();
        shuffle(list, random);
    }
    public static void shuffle(List<?> list, Random rnd) {
        List<Object> items = (List<Object>) list;
        for (int i = items.size(); i > 1; i--)
            swap(items, i - 1, rnd.nextInt(i));
    }
    public static void swap(List<?> list, int i, int j) {
        List<Object> items = (List<Object>) list;
        items.set(i, items.set(j, items.get(i)));
    }
    public static <T> void fill(List<? super T> list, T value) {
        for (int i = 0; i < list.size(); i++)
            list.set(i, value);
    }
    public static <T> void copy(List<? super T> target, List<? extends T> source) {
        if (source.size() > target.size())
            throw new IndexOutOfBoundsException("Source does not fit in dest");
        for (int i = 0; i < source.size(); i++)
            target.set(i, source.get(i));
    }
    public static void rotate(List<?> list, int distance) {
        List<Object> items = (List<Object>) list;
        int size = items.size();
        if (size == 0)
            return;
        distance = distance % size;
        if (distance < 0)
            distance += size;
        if (distance == 0)
            return;
        Object[] copy = items.toArray();
        for (int i = 0; i < size; i++)
            items.set((i + distance) % size, copy[i]);
    }
    public static <T extends Object & Comparable<? super T>> T min(Collection<? extends T> items) {
        Iterator<? extends T> it = items.iterator();
        T best = it.next();
        while (it.hasNext()) {
            T next = it.next();
            if (next.compareTo(best) < 0)
                best = next;
        }
        return best;
    }
    public static <T> T min(Collection<? extends T> items, Comparator<? super T> comparator) {
        if (comparator == null)
            return (T) min((Collection) items);
        Iterator<? extends T> it = items.iterator();
        T best = it.next();
        while (it.hasNext()) {
            T next = it.next();
            if (comparator.compare(next, best) < 0)
                best = next;
        }
        return best;
    }
    public static <T extends Object & Comparable<? super T>> T max(Collection<? extends T> items) {
        Iterator<? extends T> it = items.iterator();
        T best = it.next();
        while (it.hasNext()) {
            T next = it.next();
            if (next.compareTo(best) > 0)
                best = next;
        }
        return best;
    }
    public static <T> T max(Collection<? extends T> items, Comparator<? super T> comparator) {
        if (comparator == null)
            return (T) max((Collection) items);
        Iterator<? extends T> it = items.iterator();
        T best = it.next();
        while (it.hasNext()) {
            T next = it.next();
            if (comparator.compare(next, best) > 0)
                best = next;
        }
        return best;
    }
    public static int frequency(Collection<?> items, Object value) {
        int count = 0;
        for (Object item : items)
            if (Objects.equals(item, value))
                count++;
        return count;
    }
    public static boolean disjoint(Collection<?> a, Collection<?> b) {
        for (Object item : a)
            if (b.contains(item))
                return false;
        return true;
    }
    @SafeVarargs
    public static <T> boolean addAll(Collection<? super T> target, T... items) {
        boolean changed = false;
        for (T item : items)
            if (target.add(item))
                changed = true;
        return changed;
    }
    public static <T> int binarySearch(List<? extends Comparable<? super T>> list, T key) {
        int low = 0, high = list.size() - 1;
        while (low <= high) {
            int mid = (low + high) >>> 1;
            int cmp = list.get(mid).compareTo(key);
            if (cmp < 0)
                low = mid + 1;
            else if (cmp > 0)
                high = mid - 1;
            else
                return mid;
        }
        return -(low + 1);
    }
    public static <T> int binarySearch(List<? extends T> list, T key, Comparator<? super T> comparator) {
        if (comparator == null)
            return binarySearch((List) list, key);
        int low = 0, high = list.size() - 1;
        while (low <= high) {
            int mid = (low + high) >>> 1;
            int cmp = comparator.compare(list.get(mid), key);
            if (cmp < 0)
                low = mid + 1;
            else if (cmp > 0)
                high = mid - 1;
            else
                return mid;
        }
        return -(low + 1);
    }
    public static int indexOfSubList(List<?> source, List<?> target) {
        int n = source.size(), m = target.size();
        outer:
        for (int i = 0; i + m <= n; i++) {
            for (int j = 0; j < m; j++)
                if (!Objects.equals(source.get(i + j), target.get(j)))
                    continue outer;
            return i;
        }
        return -1;
    }
    public static <T> Comparator<T> reverseOrder() { return (a, b) -> ((Comparable<T>) b).compareTo(a); }
    public static <T> Comparator<T> reverseOrder(Comparator<T> comparator) {
        if (comparator == null)
            return reverseOrder();
        return (a, b) -> comparator.compare(b, a);
    }
    public static <T> List<T> nCopies(int count, T value) {
        if (count < 0)
            throw new IllegalArgumentException("List length = " + count);
        Object[] items = new Object[count];
        Arrays.fill(items, value);
        return new ImmutableCollections.ListN<>(items, true);
    }
    public static final <T> List<T> emptyList() { return new ImmutableCollections.ListN<>(new Object[0], false); }
    public static final <T> Set<T> emptySet() { return new ImmutableCollections.UnmodifiableSet<>(new HashSet<T>()); }
    public static final <K, V> Map<K, V> emptyMap() { return new UnmodifiableMap<>(new HashMap<K, V>()); }
    public static <T> Iterator<T> emptyIterator() { return Collections.<T>emptyList().iterator(); }
    public static <T> List<T> singletonList(T value) { return new ImmutableCollections.ListN<>(new Object[] { value }, true); }
    public static <T> Set<T> singleton(T value) {
        HashSet<T> set = new HashSet<>();
        set.add(value);
        return new ImmutableCollections.UnmodifiableSet<>(set);
    }
    public static <K, V> Map<K, V> singletonMap(K key, V value) {
        HashMap<K, V> map = new HashMap<>();
        map.put(key, value);
        return new UnmodifiableMap<>(map);
    }
    public static <T> List<T> unmodifiableList(List<? extends T> list) { return new ImmutableCollections.UnmodifiableList<>(list); }
    public static <T> Set<T> unmodifiableSet(Set<? extends T> set) { return new ImmutableCollections.UnmodifiableSet<>(set); }
    public static <T> SortedSet<T> unmodifiableSortedSet(SortedSet<T> set) { return set; }
    public static <T> Collection<T> unmodifiableCollection(Collection<? extends T> items) {
        return new ImmutableCollections.UnmodifiableCollection<>(items);
    }
    public static <K, V> Map<K, V> unmodifiableMap(Map<? extends K, ? extends V> map) { return new UnmodifiableMap<>(map); }
    public static <T> List<T> synchronizedList(List<T> list) { return list; }
    public static <T> Set<T> synchronizedSet(Set<T> set) { return set; }
    public static <K, V> Map<K, V> synchronizedMap(Map<K, V> map) { return map; }
    public static <T> Collection<T> synchronizedCollection(Collection<T> items) { return items; }

    // A read-only map.
    static final class UnmodifiableMap<K, V> extends AbstractMap<K, V> {
        private final Map<? extends K, ? extends V> map;
        UnmodifiableMap(Map<? extends K, ? extends V> map) { this.map = Objects.requireNonNull(map); }
        public int size() { return map.size(); }
        public boolean containsKey(Object key) { return map.containsKey(key); }
        public boolean containsValue(Object value) { return map.containsValue(value); }
        public V get(Object key) { return map.get(key); }
        public V put(K key, V value) { throw new UnsupportedOperationException(); }
        public V remove(Object key) { throw new UnsupportedOperationException(); }
        public void clear() { throw new UnsupportedOperationException(); }
        public V merge(K key, V value, java.util.function.BiFunction<? super V, ? super V, ? extends V> remapping) {
            throw new UnsupportedOperationException();
        }
        public V computeIfAbsent(K key, java.util.function.Function<? super K, ? extends V> mapping) {
            throw new UnsupportedOperationException();
        }
        public Set<K> keySet() { return new ImmutableCollections.UnmodifiableSet<K>(map.keySet()); }
        public Collection<V> values() { return new ImmutableCollections.UnmodifiableCollection<V>(map.values()); }
        public Set<Map.Entry<K, V>> entrySet() {
            Set<? extends Map.Entry<? extends K, ? extends V>> entries = map.entrySet();
            return new AbstractSet<Map.Entry<K, V>>() {
                public int size() { return entries.size(); }
                public Iterator<Map.Entry<K, V>> iterator() {
                    Iterator<? extends Map.Entry<? extends K, ? extends V>> it = entries.iterator();
                    return new Iterator<Map.Entry<K, V>>() {
                        public boolean hasNext() { return it.hasNext(); }
                        public Map.Entry<K, V> next() {
                            Map.Entry<? extends K, ? extends V> entry = it.next();
                            return new AbstractMap.SimpleImmutableEntry<K, V>(entry.getKey(), entry.getValue());
                        }
                    };
                }
            };
        }
    }
}
`);
})(globalThis);
