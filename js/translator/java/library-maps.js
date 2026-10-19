// Java: the java.util maps written in Java. HashMap repeats the table of
// JDK 19 (a hash with the high bits mixed in, the capacity is a power of
// two, doubling keeps the order in the buckets), so iteration and toString
// give the same order as in Java. TreeMap is a red-black tree, as in the
// JDK.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Java = T.java;
    if (Java.library.units['java.util.map'])
        return;

    Java.addLibrary('java.util.map', 'java.util', String.raw`
public interface Map<K, V> {
    int size();
    default boolean isEmpty() { return size() == 0; }
    boolean containsKey(Object key);
    boolean containsValue(Object value);
    V get(Object key);
    default V put(K key, V value) { throw new UnsupportedOperationException(); }
    default V remove(Object key) { throw new UnsupportedOperationException(); }
    default void putAll(Map<? extends K, ? extends V> other) {
        for (Map.Entry<? extends K, ? extends V> entry : other.entrySet())
            put(entry.getKey(), entry.getValue());
    }
    default void clear() { throw new UnsupportedOperationException(); }
    Set<K> keySet();
    Collection<V> values();
    Set<Map.Entry<K, V>> entrySet();
    default V getOrDefault(Object key, V defaultValue) {
        V value = get(key);
        return value != null || containsKey(key) ? value : defaultValue;
    }
    default void forEach(java.util.function.BiConsumer<? super K, ? super V> action) {
        Objects.requireNonNull(action);
        for (Map.Entry<K, V> entry : entrySet())
            action.accept(entry.getKey(), entry.getValue());
    }
    default void replaceAll(java.util.function.BiFunction<? super K, ? super V, ? extends V> function) {
        Objects.requireNonNull(function);
        for (Map.Entry<K, V> entry : entrySet())
            entry.setValue(function.apply(entry.getKey(), entry.getValue()));
    }
    default V putIfAbsent(K key, V value) {
        V current = get(key);
        if (current == null)
            current = put(key, value);
        return current;
    }
    default boolean remove(Object key, Object value) {
        Object current = get(key);
        if (!Objects.equals(current, value) || (current == null && !containsKey(key)))
            return false;
        remove(key);
        return true;
    }
    default boolean replace(K key, V oldValue, V newValue) {
        Object current = get(key);
        if (!Objects.equals(current, oldValue) || (current == null && !containsKey(key)))
            return false;
        put(key, newValue);
        return true;
    }
    default V replace(K key, V value) {
        V current = get(key);
        if (current != null || containsKey(key))
            current = put(key, value);
        return current;
    }
    default V computeIfAbsent(K key, java.util.function.Function<? super K, ? extends V> mapping) {
        Objects.requireNonNull(mapping);
        V value = get(key);
        if (value == null) {
            V created = mapping.apply(key);
            if (created != null) {
                put(key, created);
                return created;
            }
        }
        return value;
    }
    default V computeIfPresent(K key, java.util.function.BiFunction<? super K, ? super V, ? extends V> remapping) {
        Objects.requireNonNull(remapping);
        V old = get(key);
        if (old != null) {
            V value = remapping.apply(key, old);
            if (value != null) {
                put(key, value);
                return value;
            }
            remove(key);
        }
        return null;
    }
    default V compute(K key, java.util.function.BiFunction<? super K, ? super V, ? extends V> remapping) {
        Objects.requireNonNull(remapping);
        V old = get(key);
        V value = remapping.apply(key, old);
        if (value == null) {
            if (old != null || containsKey(key))
                remove(key);
            return null;
        }
        put(key, value);
        return value;
    }
    default V merge(K key, V value, java.util.function.BiFunction<? super V, ? super V, ? extends V> remapping) {
        Objects.requireNonNull(remapping);
        Objects.requireNonNull(value);
        V old = get(key);
        V next = old == null ? value : remapping.apply(old, value);
        if (next == null)
            remove(key);
        else
            put(key, next);
        return next;
    }

    interface Entry<K, V> {
        K getKey();
        V getValue();
        default V setValue(V value) { throw new UnsupportedOperationException(); }
        static <K extends Comparable<? super K>, V> Comparator<Map.Entry<K, V>> comparingByKey() {
            return (a, b) -> a.getKey().compareTo(b.getKey());
        }
        static <K, V extends Comparable<? super V>> Comparator<Map.Entry<K, V>> comparingByValue() {
            return (a, b) -> a.getValue().compareTo(b.getValue());
        }
        static <K, V> Comparator<Map.Entry<K, V>> comparingByKey(Comparator<? super K> comparator) {
            return (a, b) -> comparator.compare(a.getKey(), b.getKey());
        }
        static <K, V> Comparator<Map.Entry<K, V>> comparingByValue(Comparator<? super V> comparator) {
            return (a, b) -> comparator.compare(a.getValue(), b.getValue());
        }
        static <K, V> Map.Entry<K, V> copyOf(Map.Entry<? extends K, ? extends V> entry) {
            return new KeyValueHolder<>(entry.getKey(), entry.getValue());
        }
    }

    static <K, V> Map<K, V> of() { return ImmutableMaps.of(new Object[0]); }
    static <K, V> Map<K, V> of(K k1, V v1) { return ImmutableMaps.of(new Object[] { k1, v1 }); }
    static <K, V> Map<K, V> of(K k1, V v1, K k2, V v2) { return ImmutableMaps.of(new Object[] { k1, v1, k2, v2 }); }
    static <K, V> Map<K, V> of(K k1, V v1, K k2, V v2, K k3, V v3) {
        return ImmutableMaps.of(new Object[] { k1, v1, k2, v2, k3, v3 });
    }
    static <K, V> Map<K, V> of(K k1, V v1, K k2, V v2, K k3, V v3, K k4, V v4) {
        return ImmutableMaps.of(new Object[] { k1, v1, k2, v2, k3, v3, k4, v4 });
    }
    static <K, V> Map<K, V> of(K k1, V v1, K k2, V v2, K k3, V v3, K k4, V v4, K k5, V v5) {
        return ImmutableMaps.of(new Object[] { k1, v1, k2, v2, k3, v3, k4, v4, k5, v5 });
    }
    static <K, V> Map<K, V> of(K k1, V v1, K k2, V v2, K k3, V v3, K k4, V v4, K k5, V v5, K k6, V v6) {
        return ImmutableMaps.of(new Object[] { k1, v1, k2, v2, k3, v3, k4, v4, k5, v5, k6, v6 });
    }
    static <K, V> Map<K, V> of(K k1, V v1, K k2, V v2, K k3, V v3, K k4, V v4, K k5, V v5, K k6, V v6, K k7, V v7) {
        return ImmutableMaps.of(new Object[] { k1, v1, k2, v2, k3, v3, k4, v4, k5, v5, k6, v6, k7, v7 });
    }
    static <K, V> Map<K, V> of(K k1, V v1, K k2, V v2, K k3, V v3, K k4, V v4, K k5, V v5, K k6, V v6, K k7, V v7,
                               K k8, V v8) {
        return ImmutableMaps.of(new Object[] { k1, v1, k2, v2, k3, v3, k4, v4, k5, v5, k6, v6, k7, v7, k8, v8 });
    }
    static <K, V> Map<K, V> of(K k1, V v1, K k2, V v2, K k3, V v3, K k4, V v4, K k5, V v5, K k6, V v6, K k7, V v7,
                               K k8, V v8, K k9, V v9) {
        return ImmutableMaps.of(new Object[] { k1, v1, k2, v2, k3, v3, k4, v4, k5, v5, k6, v6, k7, v7, k8, v8, k9, v9 });
    }
    static <K, V> Map<K, V> of(K k1, V v1, K k2, V v2, K k3, V v3, K k4, V v4, K k5, V v5, K k6, V v6, K k7, V v7,
                               K k8, V v8, K k9, V v9, K k10, V v10) {
        return ImmutableMaps.of(new Object[] { k1, v1, k2, v2, k3, v3, k4, v4, k5, v5, k6, v6, k7, v7, k8, v8, k9, v9, k10, v10 });
    }
    static <K, V> Map<K, V> ofEntries(Map.Entry<? extends K, ? extends V>... entries) {
        Object[] items = new Object[entries.length * 2];
        for (int i = 0; i < entries.length; i++) {
            items[2 * i] = entries[i].getKey();
            items[2 * i + 1] = entries[i].getValue();
        }
        return ImmutableMaps.of(items);
    }
    static <K, V> Map.Entry<K, V> entry(K key, V value) {
        return new KeyValueHolder<>(Objects.requireNonNull(key), Objects.requireNonNull(value));
    }
    static <K, V> Map<K, V> copyOf(Map<? extends K, ? extends V> map) {
        LinkedHashMap<K, V> copy = new LinkedHashMap<>();
        for (Map.Entry<? extends K, ? extends V> entry : map.entrySet())
            copy.put(Objects.requireNonNull(entry.getKey()), Objects.requireNonNull(entry.getValue()));
        return Collections.unmodifiableMap(copy);
    }
}

// The pair Map.entry(k, v): immutable.
final class KeyValueHolder<K, V> implements Map.Entry<K, V> {
    final K key;
    final V value;
    KeyValueHolder(K key, V value) {
        this.key = key;
        this.value = value;
    }
    public K getKey() { return key; }
    public V getValue() { return value; }
    public boolean equals(Object other) {
        return other instanceof Map.Entry<?, ?> entry && Objects.equals(key, entry.getKey()) && Objects.equals(value, entry.getValue());
    }
    public int hashCode() { return Objects.hashCode(key) ^ Objects.hashCode(value); }
    public String toString() { return key + "=" + value; }
}

// Map.of: the insertion order (the JDK has a random one from run to run).
final class ImmutableMaps {
    private ImmutableMaps() {}
    static <K, V> Map<K, V> of(Object[] items) {
        LinkedHashMap<K, V> map = new LinkedHashMap<>();
        for (int i = 0; i < items.length; i += 2) {
            K key = (K) Objects.requireNonNull(items[i]);
            V value = (V) Objects.requireNonNull(items[i + 1]);
            if (map.put(key, value) != null)
                throw new IllegalArgumentException("duplicate key: " + key);
        }
        return Collections.unmodifiableMap(map);
    }
}

public abstract class AbstractMap<K, V> implements Map<K, V> {
    protected AbstractMap() {}
    public abstract Set<Map.Entry<K, V>> entrySet();
    public int size() { return entrySet().size(); }
    public boolean containsKey(Object key) {
        for (Map.Entry<K, V> entry : entrySet())
            if (Objects.equals(key, entry.getKey()))
                return true;
        return false;
    }
    public boolean containsValue(Object value) {
        for (Map.Entry<K, V> entry : entrySet())
            if (Objects.equals(value, entry.getValue()))
                return true;
        return false;
    }
    public V get(Object key) {
        for (Map.Entry<K, V> entry : entrySet())
            if (Objects.equals(key, entry.getKey()))
                return entry.getValue();
        return null;
    }
    public Set<K> keySet() {
        return new AbstractSet<K>() {
            public Iterator<K> iterator() {
                Iterator<Map.Entry<K, V>> it = entrySet().iterator();
                return new Iterator<K>() {
                    public boolean hasNext() { return it.hasNext(); }
                    public K next() { return it.next().getKey(); }
                    public void remove() { it.remove(); }
                };
            }
            public int size() { return AbstractMap.this.size(); }
            public boolean contains(Object key) { return containsKey(key); }
        };
    }
    public Collection<V> values() {
        return new AbstractCollection<V>() {
            public Iterator<V> iterator() {
                Iterator<Map.Entry<K, V>> it = entrySet().iterator();
                return new Iterator<V>() {
                    public boolean hasNext() { return it.hasNext(); }
                    public V next() { return it.next().getValue(); }
                    public void remove() { it.remove(); }
                };
            }
            public int size() { return AbstractMap.this.size(); }
            public boolean contains(Object value) { return containsValue(value); }
        };
    }
    public boolean equals(Object other) {
        if (other == this)
            return true;
        if (!(other instanceof Map<?, ?> map) || map.size() != size())
            return false;
        for (Map.Entry<K, V> entry : entrySet()) {
            K key = entry.getKey();
            V value = entry.getValue();
            if (value == null) {
                if (!(map.get(key) == null && map.containsKey(key)))
                    return false;
            } else if (!value.equals(map.get(key))) {
                return false;
            }
        }
        return true;
    }
    public int hashCode() {
        int hash = 0;
        for (Map.Entry<K, V> entry : entrySet())
            hash += entry.hashCode();
        return hash;
    }
    public String toString() {
        Iterator<Map.Entry<K, V>> it = entrySet().iterator();
        if (!it.hasNext())
            return "{}";
        StringBuilder sb = new StringBuilder("{");
        for (;;) {
            Map.Entry<K, V> entry = it.next();
            K key = entry.getKey();
            V value = entry.getValue();
            sb.append(key == this ? "(this Map)" : String.valueOf(key));
            sb.append('=');
            sb.append(value == this ? "(this Map)" : String.valueOf(value));
            if (!it.hasNext())
                return sb.append('}').toString();
            sb.append(", ");
        }
    }

    public static class SimpleEntry<K, V> implements Map.Entry<K, V>, java.io.Serializable {
        private final K key;
        private V value;
        public SimpleEntry(K key, V value) {
            this.key = key;
            this.value = value;
        }
        public SimpleEntry(Map.Entry<? extends K, ? extends V> entry) {
            this.key = entry.getKey();
            this.value = entry.getValue();
        }
        public K getKey() { return key; }
        public V getValue() { return value; }
        public V setValue(V value) {
            V old = this.value;
            this.value = value;
            return old;
        }
        public boolean equals(Object other) {
            return other instanceof Map.Entry<?, ?> entry && Objects.equals(key, entry.getKey()) && Objects.equals(value, entry.getValue());
        }
        public int hashCode() { return Objects.hashCode(key) ^ Objects.hashCode(value); }
        public String toString() { return key + "=" + value; }
    }

    public static class SimpleImmutableEntry<K, V> implements Map.Entry<K, V>, java.io.Serializable {
        private final K key;
        private final V value;
        public SimpleImmutableEntry(K key, V value) {
            this.key = key;
            this.value = value;
        }
        public SimpleImmutableEntry(Map.Entry<? extends K, ? extends V> entry) {
            this.key = entry.getKey();
            this.value = entry.getValue();
        }
        public K getKey() { return key; }
        public V getValue() { return value; }
        public V setValue(V value) { throw new UnsupportedOperationException(); }
        public boolean equals(Object other) {
            return other instanceof Map.Entry<?, ?> entry && Objects.equals(key, entry.getKey()) && Objects.equals(value, entry.getValue());
        }
        public int hashCode() { return Objects.hashCode(key) ^ Objects.hashCode(value); }
        public String toString() { return key + "=" + value; }
    }
}

public class HashMap<K, V> extends AbstractMap<K, V> implements Map<K, V>, Cloneable, java.io.Serializable {
    static final int MAXIMUM_CAPACITY = 1 << 30;

    static class Node<K, V> implements Map.Entry<K, V> {
        final int hash;
        final K key;
        V value;
        Node<K, V> next;
        // The order of LinkedHashMap.
        Node<K, V> before;
        Node<K, V> after;
        Node(int hash, K key, V value, Node<K, V> next) {
            this.hash = hash;
            this.key = key;
            this.value = value;
            this.next = next;
        }
        public final K getKey() { return key; }
        public final V getValue() { return value; }
        public final String toString() { return key + "=" + value; }
        public final int hashCode() { return Objects.hashCode(key) ^ Objects.hashCode(value); }
        public final V setValue(V newValue) {
            V old = value;
            value = newValue;
            return old;
        }
        public final boolean equals(Object other) {
            if (other == this)
                return true;
            return other instanceof Map.Entry<?, ?> entry && Objects.equals(key, entry.getKey()) &&
                Objects.equals(value, entry.getValue());
        }
    }

    static final int hash(Object key) {
        if (key == null)
            return 0;
        int h = key.hashCode();
        return h ^ (h >>> 16);
    }

    static final int tableSizeFor(int capacity) {
        int n = -1 >>> Integer.numberOfLeadingZeros(capacity - 1);
        return n < 0 ? 1 : (n >= MAXIMUM_CAPACITY ? MAXIMUM_CAPACITY : n + 1);
    }

    static int calculateHashMapCapacity(int mappings) { return (int) Math.ceil(mappings / 0.75); }

    public static <K, V> HashMap<K, V> newHashMap(int mappings) { return new HashMap<>(calculateHashMapCapacity(mappings)); }

    Node<K, V>[] table;
    int size;
    int modCount;
    int threshold;
    final float loadFactor;

    public HashMap(int initialCapacity, float loadFactor) {
        if (initialCapacity < 0)
            throw new IllegalArgumentException("Illegal initial capacity: " + initialCapacity);
        if (initialCapacity > MAXIMUM_CAPACITY)
            initialCapacity = MAXIMUM_CAPACITY;
        if (loadFactor <= 0 || Float.isNaN(loadFactor))
            throw new IllegalArgumentException("Illegal load factor: " + loadFactor);
        this.loadFactor = loadFactor;
        this.threshold = tableSizeFor(initialCapacity);
    }
    public HashMap(int initialCapacity) { this(initialCapacity, 0.75f); }
    public HashMap() { this.loadFactor = 0.75f; }
    public HashMap(Map<? extends K, ? extends V> map) {
        this.loadFactor = 0.75f;
        putMapEntries(map);
    }

    final void putMapEntries(Map<? extends K, ? extends V> map) {
        int s = map.size();
        if (s > 0) {
            if (table == null) {
                double dt = Math.ceil(s / (double) loadFactor);
                int t = dt < (double) MAXIMUM_CAPACITY ? (int) dt : MAXIMUM_CAPACITY;
                if (t > threshold)
                    threshold = tableSizeFor(t);
            } else {
                while (s > threshold && table.length < MAXIMUM_CAPACITY)
                    resize();
            }
            for (Map.Entry<? extends K, ? extends V> entry : map.entrySet())
                putVal(hash(entry.getKey()), entry.getKey(), entry.getValue(), false);
        }
    }

    public int size() { return size; }
    public boolean isEmpty() { return size == 0; }

    final Node<K, V> getNode(Object key) {
        Node<K, V>[] tab = table;
        if (tab == null || tab.length == 0)
            return null;
        int h = hash(key);
        for (Node<K, V> e = tab[(tab.length - 1) & h]; e != null; e = e.next) {
            if (e.hash == h) {
                Object k = e.key;
                if (k == key || (key != null && key.equals(k)))
                    return e;
            }
        }
        return null;
    }

    public V get(Object key) {
        Node<K, V> e = getNode(key);
        if (e == null)
            return null;
        afterNodeAccess(e);
        return e.value;
    }
    public V getOrDefault(Object key, V defaultValue) {
        Node<K, V> e = getNode(key);
        if (e == null)
            return defaultValue;
        afterNodeAccess(e);
        return e.value;
    }
    public boolean containsKey(Object key) { return getNode(key) != null; }
    public V put(K key, V value) { return putVal(hash(key), key, value, false); }
    public V putIfAbsent(K key, V value) { return putVal(hash(key), key, value, true); }

    final V putVal(int h, K key, V value, boolean onlyIfAbsent) {
        Node<K, V>[] tab = table;
        if (tab == null || tab.length == 0)
            tab = resize();
        int n = tab.length;
        int i = (n - 1) & h;
        Node<K, V> p = tab[i];
        Node<K, V> found = null;
        if (p == null) {
            tab[i] = newNode(h, key, value, null);
        } else {
            for (int binCount = 0; ; ++binCount) {
                Object k = p.key;
                if (p.hash == h && (k == key || (key != null && key.equals(k)))) {
                    found = p;
                    break;
                }
                if (p.next == null) {
                    p.next = newNode(h, key, value, null);
                    if (binCount >= TREEIFY_THRESHOLD - 1)
                        treeifyBin(tab);
                    break;
                }
                p = p.next;
            }
        }
        if (found != null) {
            V old = found.value;
            if (!onlyIfAbsent || old == null)
                found.value = value;
            afterNodeAccess(found);
            return old;
        }
        ++modCount;
        if (++size > threshold)
            resize();
        afterNodeInsertion(true);
        return null;
    }

    static final int TREEIFY_THRESHOLD = 8;
    static final int MIN_TREEIFY_CAPACITY = 64;

    // A long bucket in a small table doubles it, as in the JDK (there are
    // no trees in buckets: the iteration order differs from the JDK only
    // with eight or more collisions in a table from 64).
    final void treeifyBin(Node<K, V>[] tab) {
        if (tab.length < MIN_TREEIFY_CAPACITY)
            resize();
    }

    // The lookup for compute, computeIfAbsent and merge: as in the JDK, the
    // table grows before the insertion, and a new node goes to the start of
    // the bucket.
    private int binCount;
    private Node<K, V> findForCompute(int h, Object key) {
        Node<K, V>[] tab = table;
        if (size > threshold || tab == null || tab.length == 0)
            tab = resize();
        binCount = 0;
        for (Node<K, V> e = tab[(tab.length - 1) & h]; e != null; e = e.next) {
            Object k = e.key;
            if (e.hash == h && (k == key || (key != null && key.equals(k))))
                return e;
            ++binCount;
        }
        return null;
    }
    private void insertFirst(int h, K key, V value) {
        Node<K, V>[] tab = table;
        int i = (tab.length - 1) & h;
        tab[i] = newNode(h, key, value, tab[i]);
        if (binCount >= TREEIFY_THRESHOLD - 1)
            treeifyBin(tab);
    }

    // Doubling: the nodes of a bucket go in order into the "low" or "high"
    // half - as in the JDK.
    final Node<K, V>[] resize() {
        Node<K, V>[] oldTab = table;
        int oldCap = oldTab == null ? 0 : oldTab.length;
        int oldThr = threshold;
        int newCap;
        int newThr = 0;
        if (oldCap > 0) {
            if (oldCap >= MAXIMUM_CAPACITY) {
                threshold = Integer.MAX_VALUE;
                return oldTab;
            }
            newCap = oldCap << 1;
            if (newCap < MAXIMUM_CAPACITY && oldCap >= 16)
                newThr = oldThr << 1;
        } else if (oldThr > 0) {
            newCap = oldThr;
        } else {
            newCap = 16;
            newThr = 12;
        }
        if (newThr == 0) {
            float ft = (float) newCap * loadFactor;
            newThr = newCap < MAXIMUM_CAPACITY && ft < (float) MAXIMUM_CAPACITY ? (int) ft : Integer.MAX_VALUE;
        }
        threshold = newThr;
        Node<K, V>[] newTab = (Node<K, V>[]) new Node[newCap];
        table = newTab;
        if (oldTab != null) {
            for (int j = 0; j < oldCap; ++j) {
                Node<K, V> e = oldTab[j];
                if (e == null)
                    continue;
                oldTab[j] = null;
                if (e.next == null) {
                    newTab[e.hash & (newCap - 1)] = e;
                    continue;
                }
                Node<K, V> loHead = null, loTail = null, hiHead = null, hiTail = null;
                Node<K, V> next;
                do {
                    next = e.next;
                    if ((e.hash & oldCap) == 0) {
                        if (loTail == null)
                            loHead = e;
                        else
                            loTail.next = e;
                        loTail = e;
                    } else {
                        if (hiTail == null)
                            hiHead = e;
                        else
                            hiTail.next = e;
                        hiTail = e;
                    }
                    e = next;
                } while (e != null);
                if (loTail != null) {
                    loTail.next = null;
                    newTab[j] = loHead;
                }
                if (hiTail != null) {
                    hiTail.next = null;
                    newTab[j + oldCap] = hiHead;
                }
            }
        }
        return newTab;
    }

    final Node<K, V> removeNode(int h, Object key, Object value, boolean matchValue) {
        Node<K, V>[] tab = table;
        if (tab == null || tab.length == 0)
            return null;
        int index = (tab.length - 1) & h;
        Node<K, V> prev = null;
        for (Node<K, V> e = tab[index]; e != null; prev = e, e = e.next) {
            Object k = e.key;
            if (e.hash == h && (k == key || (key != null && key.equals(k)))) {
                if (matchValue && !Objects.equals(value, e.value))
                    return null;
                if (prev == null)
                    tab[index] = e.next;
                else
                    prev.next = e.next;
                ++modCount;
                --size;
                afterNodeRemoval(e);
                return e;
            }
        }
        return null;
    }

    public V remove(Object key) {
        Node<K, V> e = removeNode(hash(key), key, null, false);
        return e == null ? null : e.value;
    }
    public boolean remove(Object key, Object value) { return removeNode(hash(key), key, value, true) != null; }
    public void putAll(Map<? extends K, ? extends V> map) { putMapEntries(map); }
    public void clear() {
        modCount++;
        if (table != null && size > 0) {
            size = 0;
            for (int i = 0; i < table.length; ++i)
                table[i] = null;
        }
        afterClear();
    }
    public boolean containsValue(Object value) {
        for (Node<K, V> e = firstNode(); e != null; e = nextNode(e))
            if (Objects.equals(value, e.value))
                return true;
        return false;
    }
    public V computeIfAbsent(K key, java.util.function.Function<? super K, ? extends V> mapping) {
        Objects.requireNonNull(mapping);
        int h = hash(key);
        Node<K, V> old = findForCompute(h, key);
        int bins = binCount;
        if (old != null && old.value != null) {
            afterNodeAccess(old);
            return old.value;
        }
        int expected = modCount;
        V value = mapping.apply(key);
        if (modCount != expected)
            throw new ConcurrentModificationException();
        if (value == null)
            return null;
        if (old != null) {
            old.value = value;
            afterNodeAccess(old);
            return value;
        }
        binCount = bins;
        insertFirst(h, key, value);
        modCount = expected + 1;
        ++size;
        afterNodeInsertion(true);
        return value;
    }
    public V computeIfPresent(K key, java.util.function.BiFunction<? super K, ? super V, ? extends V> remapping) {
        Objects.requireNonNull(remapping);
        Node<K, V> e = getNode(key);
        if (e == null || e.value == null)
            return null;
        int expected = modCount;
        V value = remapping.apply(key, e.value);
        if (modCount != expected)
            throw new ConcurrentModificationException();
        if (value == null) {
            removeNode(hash(key), key, null, false);
        } else {
            e.value = value;
            afterNodeAccess(e);
        }
        return value;
    }
    public V compute(K key, java.util.function.BiFunction<? super K, ? super V, ? extends V> remapping) {
        Objects.requireNonNull(remapping);
        int h = hash(key);
        Node<K, V> old = findForCompute(h, key);
        int bins = binCount;
        V oldValue = old == null ? null : old.value;
        int expected = modCount;
        V value = remapping.apply(key, oldValue);
        if (modCount != expected)
            throw new ConcurrentModificationException();
        if (old != null) {
            if (value != null) {
                old.value = value;
                afterNodeAccess(old);
            } else {
                removeNode(h, key, null, false);
            }
        } else if (value != null) {
            binCount = bins;
            insertFirst(h, key, value);
            modCount = expected + 1;
            ++size;
            afterNodeInsertion(true);
        }
        return value;
    }
    public V merge(K key, V value, java.util.function.BiFunction<? super V, ? super V, ? extends V> remapping) {
        Objects.requireNonNull(remapping);
        Objects.requireNonNull(value);
        int h = hash(key);
        Node<K, V> old = findForCompute(h, key);
        if (old != null) {
            V next;
            if (old.value != null) {
                int expected = modCount;
                next = remapping.apply(old.value, value);
                if (modCount != expected)
                    throw new ConcurrentModificationException();
            } else {
                next = value;
            }
            if (next != null) {
                old.value = next;
                afterNodeAccess(old);
            } else {
                removeNode(h, key, null, false);
            }
            return next;
        }
        insertFirst(h, key, value);
        ++modCount;
        ++size;
        afterNodeInsertion(true);
        return value;
    }
    public void forEach(java.util.function.BiConsumer<? super K, ? super V> action) {
        Objects.requireNonNull(action);
        int expected = modCount;
        for (Node<K, V> e = firstNode(); e != null && modCount == expected; e = nextNode(e))
            action.accept(e.key, e.value);
        if (modCount != expected)
            throw new ConcurrentModificationException();
    }
    public void replaceAll(java.util.function.BiFunction<? super K, ? super V, ? extends V> function) {
        Objects.requireNonNull(function);
        int expected = modCount;
        for (Node<K, V> e = firstNode(); e != null; e = nextNode(e))
            e.value = function.apply(e.key, e.value);
        if (modCount != expected)
            throw new ConcurrentModificationException();
    }
    public Object clone() {
        HashMap<K, V> copy = new HashMap<>();
        copy.putMapEntries(this);
        return copy;
    }

    // The iteration order: the table by buckets (LinkedHashMap has its own list).
    Node<K, V> firstNode() {
        Node<K, V>[] tab = table;
        if (tab == null || size == 0)
            return null;
        for (int i = 0; i < tab.length; i++)
            if (tab[i] != null)
                return tab[i];
        return null;
    }
    Node<K, V> nextNode(Node<K, V> e) {
        if (e.next != null)
            return e.next;
        Node<K, V>[] tab = table;
        for (int i = (e.hash & (tab.length - 1)) + 1; i < tab.length; i++)
            if (tab[i] != null)
                return tab[i];
        return null;
    }
    Node<K, V> newNode(int h, K key, V value, Node<K, V> next) { return new Node<>(h, key, value, next); }
    void afterNodeAccess(Node<K, V> e) {}
    void afterNodeInsertion(boolean evict) {}
    void afterNodeRemoval(Node<K, V> e) {}
    void afterClear() {}

    Object[] keysToArray(Object[] array) {
        int index = 0;
        for (Node<K, V> e = firstNode(); e != null; e = nextNode(e))
            array[index++] = e.key;
        return array;
    }

    public Set<K> keySet() { return new KeySet(); }
    public Collection<V> values() { return new Values(); }
    public Set<Map.Entry<K, V>> entrySet() { return new EntrySet(); }

    abstract class HashIterator {
        Node<K, V> nextEntry;
        Node<K, V> current;
        int expectedModCount;
        HashIterator() {
            expectedModCount = modCount;
            nextEntry = firstNode();
        }
        public final boolean hasNext() { return nextEntry != null; }
        final Node<K, V> advance() {
            Node<K, V> e = nextEntry;
            if (modCount != expectedModCount)
                throw new ConcurrentModificationException();
            if (e == null)
                throw new NoSuchElementException();
            current = e;
            nextEntry = nextNode(e);
            return e;
        }
        public final void remove() {
            Node<K, V> p = current;
            if (p == null)
                throw new IllegalStateException();
            if (modCount != expectedModCount)
                throw new ConcurrentModificationException();
            current = null;
            removeNode(p.hash, p.key, null, false);
            expectedModCount = modCount;
        }
    }
    final class KeyIterator extends HashIterator implements Iterator<K> {
        public final K next() { return advance().key; }
    }
    final class ValueIterator extends HashIterator implements Iterator<V> {
        public final V next() { return advance().value; }
    }
    final class EntryIterator extends HashIterator implements Iterator<Map.Entry<K, V>> {
        public final Map.Entry<K, V> next() { return advance(); }
    }

    final class KeySet extends AbstractSet<K> {
        public final int size() { return size; }
        public final void clear() { HashMap.this.clear(); }
        public final Iterator<K> iterator() { return new KeyIterator(); }
        public final boolean contains(Object key) { return containsKey(key); }
        public final boolean remove(Object key) { return removeNode(hash(key), key, null, false) != null; }
        public final Object[] toArray() { return keysToArray(new Object[size]); }
        public final void forEach(java.util.function.Consumer<? super K> action) {
            int expected = modCount;
            for (Node<K, V> e = firstNode(); e != null && modCount == expected; e = nextNode(e))
                action.accept(e.key);
            if (modCount != expected)
                throw new ConcurrentModificationException();
        }
    }
    final class Values extends AbstractCollection<V> {
        public final int size() { return size; }
        public final void clear() { HashMap.this.clear(); }
        public final Iterator<V> iterator() { return new ValueIterator(); }
        public final boolean contains(Object value) { return containsValue(value); }
    }
    final class EntrySet extends AbstractSet<Map.Entry<K, V>> {
        public final int size() { return size; }
        public final void clear() { HashMap.this.clear(); }
        public final Iterator<Map.Entry<K, V>> iterator() { return new EntryIterator(); }
        public final boolean contains(Object other) {
            if (!(other instanceof Map.Entry<?, ?> entry))
                return false;
            Node<K, V> candidate = getNode(entry.getKey());
            return candidate != null && candidate.equals(entry);
        }
        public final boolean remove(Object other) {
            if (other instanceof Map.Entry<?, ?> entry)
                return removeNode(hash(entry.getKey()), entry.getKey(), entry.getValue(), true) != null;
            return false;
        }
    }
}

public class LinkedHashMap<K, V> extends HashMap<K, V> implements Map<K, V> {
    transient HashMap.Node<K, V> head;
    transient HashMap.Node<K, V> tail;
    final boolean accessOrder;
    public LinkedHashMap() {
        super();
        accessOrder = false;
    }
    public LinkedHashMap(int initialCapacity) {
        super(initialCapacity);
        accessOrder = false;
    }
    public LinkedHashMap(int initialCapacity, float loadFactor) {
        super(initialCapacity, loadFactor);
        accessOrder = false;
    }
    public LinkedHashMap(int initialCapacity, float loadFactor, boolean accessOrder) {
        super(initialCapacity, loadFactor);
        this.accessOrder = accessOrder;
    }
    public LinkedHashMap(Map<? extends K, ? extends V> map) {
        super();
        accessOrder = false;
        putMapEntries(map);
    }
    protected boolean removeEldestEntry(Map.Entry<K, V> eldest) { return false; }

    HashMap.Node<K, V> newNode(int h, K key, V value, HashMap.Node<K, V> next) {
        HashMap.Node<K, V> node = new HashMap.Node<>(h, key, value, next);
        HashMap.Node<K, V> last = tail;
        tail = node;
        if (last == null) {
            head = node;
        } else {
            node.before = last;
            last.after = node;
        }
        return node;
    }
    void afterNodeRemoval(HashMap.Node<K, V> e) {
        HashMap.Node<K, V> b = e.before, a = e.after;
        e.before = e.after = null;
        if (b == null)
            head = a;
        else
            b.after = a;
        if (a == null)
            tail = b;
        else
            a.before = b;
    }
    void afterNodeInsertion(boolean evict) {
        HashMap.Node<K, V> first = head;
        if (evict && first != null && removeEldestEntry(first))
            removeNode(first.hash, first.key, null, false);
    }
    void afterNodeAccess(HashMap.Node<K, V> e) {
        if (!accessOrder || tail == e)
            return;
        HashMap.Node<K, V> b = e.before, a = e.after;
        e.after = null;
        if (b == null)
            head = a;
        else
            b.after = a;
        if (a != null)
            a.before = b;
        HashMap.Node<K, V> last = a != null ? tail : b;
        if (last == null) {
            head = e;
        } else {
            e.before = last;
            last.after = e;
        }
        tail = e;
        ++modCount;
    }
    void afterClear() { head = tail = null; }
    HashMap.Node<K, V> firstNode() { return head; }
    HashMap.Node<K, V> nextNode(HashMap.Node<K, V> e) { return e.after; }
    public Object clone() { return new LinkedHashMap<>(this); }
}

public interface SortedMap<K, V> extends Map<K, V> {
    Comparator<? super K> comparator();
    K firstKey();
    K lastKey();
    SortedMap<K, V> headMap(K to);
    SortedMap<K, V> tailMap(K from);
    SortedMap<K, V> subMap(K from, K to);
}

public interface NavigableMap<K, V> extends SortedMap<K, V> {
    Map.Entry<K, V> firstEntry();
    Map.Entry<K, V> lastEntry();
    Map.Entry<K, V> pollFirstEntry();
    Map.Entry<K, V> pollLastEntry();
    Map.Entry<K, V> lowerEntry(K key);
    Map.Entry<K, V> floorEntry(K key);
    Map.Entry<K, V> ceilingEntry(K key);
    Map.Entry<K, V> higherEntry(K key);
    K lowerKey(K key);
    K floorKey(K key);
    K ceilingKey(K key);
    K higherKey(K key);
    NavigableMap<K, V> descendingMap();
    NavigableSet<K> navigableKeySet();
    NavigableSet<K> descendingKeySet();
    NavigableMap<K, V> headMap(K to, boolean inclusive);
    NavigableMap<K, V> tailMap(K from, boolean inclusive);
    NavigableMap<K, V> subMap(K from, boolean fromInclusive, K to, boolean toInclusive);
}

// headMap, tailMap, subMap and descendingMap are copies, not views.
public class TreeMap<K, V> extends AbstractMap<K, V> implements NavigableMap<K, V>, Cloneable, java.io.Serializable {
    private static final boolean RED = false;
    private static final boolean BLACK = true;

    static final class Entry<K, V> implements Map.Entry<K, V> {
        K key;
        V value;
        Entry<K, V> left;
        Entry<K, V> right;
        Entry<K, V> parent;
        boolean color = BLACK;
        Entry(K key, V value, Entry<K, V> parent) {
            this.key = key;
            this.value = value;
            this.parent = parent;
        }
        public K getKey() { return key; }
        public V getValue() { return value; }
        public V setValue(V value) {
            V old = this.value;
            this.value = value;
            return old;
        }
        public boolean equals(Object other) {
            return other instanceof Map.Entry<?, ?> entry && Objects.equals(key, entry.getKey()) && Objects.equals(value, entry.getValue());
        }
        public int hashCode() { return Objects.hashCode(key) ^ Objects.hashCode(value); }
        public String toString() { return key + "=" + value; }
    }

    private final Comparator<? super K> comparator;
    private Entry<K, V> root;
    private int size = 0;
    private int modCount = 0;

    public TreeMap() { comparator = null; }
    public TreeMap(Comparator<? super K> comparator) { this.comparator = comparator; }
    public TreeMap(Map<? extends K, ? extends V> map) {
        comparator = null;
        putAll(map);
    }
    public TreeMap(SortedMap<K, ? extends V> map) {
        comparator = map.comparator();
        putAll(map);
    }

    final int compare(Object a, Object b) {
        return comparator == null ? ((Comparable<? super K>) a).compareTo((K) b) : comparator.compare((K) a, (K) b);
    }

    public int size() { return size; }
    public Comparator<? super K> comparator() { return comparator; }
    public boolean containsKey(Object key) { return getEntry(key) != null; }
    public boolean containsValue(Object value) {
        for (Entry<K, V> e = getFirstEntry(); e != null; e = successor(e))
            if (Objects.equals(value, e.value))
                return true;
        return false;
    }
    public V get(Object key) {
        Entry<K, V> p = getEntry(key);
        return p == null ? null : p.value;
    }
    final Entry<K, V> getEntry(Object key) {
        if (comparator == null)
            Objects.requireNonNull(key);
        Entry<K, V> p = root;
        while (p != null) {
            int cmp = compare(key, p.key);
            if (cmp < 0)
                p = p.left;
            else if (cmp > 0)
                p = p.right;
            else
                return p;
        }
        return null;
    }
    public V put(K key, V value) {
        Entry<K, V> t = root;
        if (t == null) {
            compare(key, key);
            root = new Entry<>(key, value, null);
            size = 1;
            modCount++;
            return null;
        }
        int cmp;
        Entry<K, V> parent;
        do {
            parent = t;
            cmp = compare(key, t.key);
            if (cmp < 0) {
                t = t.left;
            } else if (cmp > 0) {
                t = t.right;
            } else {
                V old = t.value;
                t.value = value;
                return old;
            }
        } while (t != null);
        Entry<K, V> e = new Entry<>(key, value, parent);
        if (cmp < 0)
            parent.left = e;
        else
            parent.right = e;
        fixAfterInsertion(e);
        size++;
        modCount++;
        return null;
    }
    public V remove(Object key) {
        Entry<K, V> p = getEntry(key);
        if (p == null)
            return null;
        V old = p.value;
        deleteEntry(p);
        return old;
    }
    public void clear() {
        modCount++;
        size = 0;
        root = null;
    }
    public Object clone() { return new TreeMap<>((SortedMap<K, V>) this); }

    final Entry<K, V> getFirstEntry() {
        Entry<K, V> p = root;
        if (p != null)
            while (p.left != null)
                p = p.left;
        return p;
    }
    final Entry<K, V> getLastEntry() {
        Entry<K, V> p = root;
        if (p != null)
            while (p.right != null)
                p = p.right;
        return p;
    }
    static <K, V> Entry<K, V> successor(Entry<K, V> t) {
        if (t == null)
            return null;
        if (t.right != null) {
            Entry<K, V> p = t.right;
            while (p.left != null)
                p = p.left;
            return p;
        }
        Entry<K, V> p = t.parent;
        Entry<K, V> ch = t;
        while (p != null && ch == p.right) {
            ch = p;
            p = p.parent;
        }
        return p;
    }
    static <K, V> Entry<K, V> predecessor(Entry<K, V> t) {
        if (t == null)
            return null;
        if (t.left != null) {
            Entry<K, V> p = t.left;
            while (p.right != null)
                p = p.right;
            return p;
        }
        Entry<K, V> p = t.parent;
        Entry<K, V> ch = t;
        while (p != null && ch == p.left) {
            ch = p;
            p = p.parent;
        }
        return p;
    }
    final Entry<K, V> getCeilingEntry(Object key) {
        Entry<K, V> p = root, best = null;
        while (p != null) {
            int cmp = compare(key, p.key);
            if (cmp < 0) {
                best = p;
                p = p.left;
            } else if (cmp > 0) {
                p = p.right;
            } else {
                return p;
            }
        }
        return best;
    }
    final Entry<K, V> getFloorEntry(Object key) {
        Entry<K, V> p = root, best = null;
        while (p != null) {
            int cmp = compare(key, p.key);
            if (cmp > 0) {
                best = p;
                p = p.right;
            } else if (cmp < 0) {
                p = p.left;
            } else {
                return p;
            }
        }
        return best;
    }
    final Entry<K, V> getHigherEntry(Object key) {
        Entry<K, V> p = root, best = null;
        while (p != null) {
            if (compare(key, p.key) < 0) {
                best = p;
                p = p.left;
            } else {
                p = p.right;
            }
        }
        return best;
    }
    final Entry<K, V> getLowerEntry(Object key) {
        Entry<K, V> p = root, best = null;
        while (p != null) {
            if (compare(key, p.key) > 0) {
                best = p;
                p = p.right;
            } else {
                p = p.left;
            }
        }
        return best;
    }
    static <K, V> Map.Entry<K, V> exportEntry(Entry<K, V> e) {
        return e == null ? null : new AbstractMap.SimpleImmutableEntry<>(e);
    }
    static <K> K keyOrNull(Entry<K, ?> e) { return e == null ? null : e.key; }
    static <K> K key(Entry<K, ?> e) {
        if (e == null)
            throw new NoSuchElementException();
        return e.key;
    }

    public K firstKey() { return key(getFirstEntry()); }
    public K lastKey() { return key(getLastEntry()); }
    public Map.Entry<K, V> firstEntry() { return exportEntry(getFirstEntry()); }
    public Map.Entry<K, V> lastEntry() { return exportEntry(getLastEntry()); }
    public Map.Entry<K, V> pollFirstEntry() {
        Entry<K, V> p = getFirstEntry();
        Map.Entry<K, V> result = exportEntry(p);
        if (p != null)
            deleteEntry(p);
        return result;
    }
    public Map.Entry<K, V> pollLastEntry() {
        Entry<K, V> p = getLastEntry();
        Map.Entry<K, V> result = exportEntry(p);
        if (p != null)
            deleteEntry(p);
        return result;
    }
    public Map.Entry<K, V> lowerEntry(K key) { return exportEntry(getLowerEntry(key)); }
    public Map.Entry<K, V> floorEntry(K key) { return exportEntry(getFloorEntry(key)); }
    public Map.Entry<K, V> ceilingEntry(K key) { return exportEntry(getCeilingEntry(key)); }
    public Map.Entry<K, V> higherEntry(K key) { return exportEntry(getHigherEntry(key)); }
    public K lowerKey(K key) { return keyOrNull(getLowerEntry(key)); }
    public K floorKey(K key) { return keyOrNull(getFloorEntry(key)); }
    public K ceilingKey(K key) { return keyOrNull(getCeilingEntry(key)); }
    public K higherKey(K key) { return keyOrNull(getHigherEntry(key)); }

    private TreeMap<K, V> range(boolean fromStart, K from, boolean fromInclusive, boolean toEnd, K to, boolean toInclusive) {
        if (!fromStart && !toEnd && compare(from, to) > 0)
            throw new IllegalArgumentException("fromKey > toKey");
        TreeMap<K, V> result = new TreeMap<>(comparator);
        for (Entry<K, V> e = getFirstEntry(); e != null; e = successor(e)) {
            if (!fromStart) {
                int c = compare(e.key, from);
                if (c < 0 || (c == 0 && !fromInclusive))
                    continue;
            }
            if (!toEnd) {
                int c = compare(e.key, to);
                if (c > 0 || (c == 0 && !toInclusive))
                    break;
            }
            result.put(e.key, e.value);
        }
        return result;
    }
    public NavigableMap<K, V> subMap(K from, boolean fromInclusive, K to, boolean toInclusive) {
        return range(false, from, fromInclusive, false, to, toInclusive);
    }
    public NavigableMap<K, V> headMap(K to, boolean inclusive) { return range(true, null, true, false, to, inclusive); }
    public NavigableMap<K, V> tailMap(K from, boolean inclusive) { return range(false, from, inclusive, true, null, true); }
    public SortedMap<K, V> subMap(K from, K to) { return subMap(from, true, to, false); }
    public SortedMap<K, V> headMap(K to) { return headMap(to, false); }
    public SortedMap<K, V> tailMap(K from) { return tailMap(from, true); }
    public NavigableMap<K, V> descendingMap() {
        TreeMap<K, V> result = new TreeMap<>(Collections.reverseOrder(comparator));
        for (Entry<K, V> e = getFirstEntry(); e != null; e = successor(e))
            result.put(e.key, e.value);
        return result;
    }
    public NavigableSet<K> navigableKeySet() { return new KeySet(false); }
    public Set<K> keySet() { return navigableKeySet(); }
    public NavigableSet<K> descendingKeySet() { return new KeySet(true); }
    public Collection<V> values() {
        return new AbstractCollection<V>() {
            public Iterator<V> iterator() {
                PrivateIterator it = new PrivateIterator(false);
                return new Iterator<V>() {
                    public boolean hasNext() { return it.hasNext(); }
                    public V next() { return it.nextEntry().value; }
                    public void remove() { it.remove(); }
                };
            }
            public int size() { return size; }
            public boolean contains(Object value) { return containsValue(value); }
            public void clear() { TreeMap.this.clear(); }
        };
    }
    public Set<Map.Entry<K, V>> entrySet() {
        return new AbstractSet<Map.Entry<K, V>>() {
            public Iterator<Map.Entry<K, V>> iterator() {
                PrivateIterator it = new PrivateIterator(false);
                return new Iterator<Map.Entry<K, V>>() {
                    public boolean hasNext() { return it.hasNext(); }
                    public Map.Entry<K, V> next() { return it.nextEntry(); }
                    public void remove() { it.remove(); }
                };
            }
            public int size() { return size; }
            public void clear() { TreeMap.this.clear(); }
        };
    }
    public void forEach(java.util.function.BiConsumer<? super K, ? super V> action) {
        Objects.requireNonNull(action);
        int expected = modCount;
        for (Entry<K, V> e = getFirstEntry(); e != null; e = successor(e)) {
            action.accept(e.key, e.value);
            if (expected != modCount)
                throw new ConcurrentModificationException();
        }
    }

    final class PrivateIterator {
        Entry<K, V> next;
        Entry<K, V> lastReturned;
        int expectedModCount;
        final boolean descending;
        PrivateIterator(boolean descending) {
            this.descending = descending;
            this.expectedModCount = modCount;
            this.next = descending ? getLastEntry() : getFirstEntry();
        }
        boolean hasNext() { return next != null; }
        Entry<K, V> nextEntry() {
            Entry<K, V> e = next;
            if (e == null)
                throw new NoSuchElementException();
            if (modCount != expectedModCount)
                throw new ConcurrentModificationException();
            next = descending ? predecessor(e) : successor(e);
            lastReturned = e;
            return e;
        }
        void remove() {
            if (lastReturned == null)
                throw new IllegalStateException();
            if (modCount != expectedModCount)
                throw new ConcurrentModificationException();
            // A node with two children gets the key of its successor - it and the next one.
            if (!descending && lastReturned.left != null && lastReturned.right != null)
                next = lastReturned;
            deleteEntry(lastReturned);
            expectedModCount = modCount;
            lastReturned = null;
        }
    }

    final class KeySet extends AbstractSet<K> implements NavigableSet<K> {
        private final boolean descending;
        KeySet(boolean descending) { this.descending = descending; }
        public Iterator<K> iterator() {
            PrivateIterator it = new PrivateIterator(descending);
            return new Iterator<K>() {
                public boolean hasNext() { return it.hasNext(); }
                public K next() { return it.nextEntry().key; }
                public void remove() { it.remove(); }
            };
        }
        public Iterator<K> descendingIterator() { return new KeySet(!descending).iterator(); }
        public int size() { return size; }
        public boolean contains(Object key) { return containsKey(key); }
        public boolean remove(Object key) {
            Entry<K, V> e = getEntry(key);
            if (e == null)
                return false;
            deleteEntry(e);
            return true;
        }
        public void clear() { TreeMap.this.clear(); }
        public Comparator<? super K> comparator() { return descending ? Collections.reverseOrder(comparator) : comparator; }
        public K first() { return descending ? lastKey() : firstKey(); }
        public K last() { return descending ? firstKey() : lastKey(); }
        public K lower(K key) { return descending ? higherKey(key) : lowerKey(key); }
        public K floor(K key) { return descending ? ceilingKey(key) : floorKey(key); }
        public K ceiling(K key) { return descending ? floorKey(key) : ceilingKey(key); }
        public K higher(K key) { return descending ? lowerKey(key) : higherKey(key); }
        public K pollFirst() {
            Map.Entry<K, V> e = descending ? pollLastEntry() : pollFirstEntry();
            return e == null ? null : e.getKey();
        }
        public K pollLast() {
            Map.Entry<K, V> e = descending ? pollFirstEntry() : pollLastEntry();
            return e == null ? null : e.getKey();
        }
        public NavigableSet<K> descendingSet() { return new KeySet(!descending); }
        public NavigableSet<K> headSet(K to, boolean inclusive) {
            return descending ? new TreeSet<K>(tailMap(to, inclusive).keySet()).descendingSet() : new TreeSet<K>(headMap(to, inclusive).keySet());
        }
        public NavigableSet<K> tailSet(K from, boolean inclusive) {
            return descending ? new TreeSet<K>(headMap(from, inclusive).keySet()).descendingSet() : new TreeSet<K>(tailMap(from, inclusive).keySet());
        }
        public NavigableSet<K> subSet(K from, boolean fromInclusive, K to, boolean toInclusive) {
            return descending ? new TreeSet<K>(subMap(to, toInclusive, from, fromInclusive).keySet()).descendingSet()
                              : new TreeSet<K>(subMap(from, fromInclusive, to, toInclusive).keySet());
        }
        public SortedSet<K> headSet(K to) { return headSet(to, false); }
        public SortedSet<K> tailSet(K from) { return tailSet(from, true); }
        public SortedSet<K> subSet(K from, K to) { return subSet(from, true, to, false); }
    }

    // --- A red-black tree (CLR, as in the JDK)

    private static <K, V> boolean colorOf(Entry<K, V> p) { return p == null ? BLACK : p.color; }
    private static <K, V> Entry<K, V> parentOf(Entry<K, V> p) { return p == null ? null : p.parent; }
    private static <K, V> void setColor(Entry<K, V> p, boolean c) {
        if (p != null)
            p.color = c;
    }
    private static <K, V> Entry<K, V> leftOf(Entry<K, V> p) { return p == null ? null : p.left; }
    private static <K, V> Entry<K, V> rightOf(Entry<K, V> p) { return p == null ? null : p.right; }

    private void rotateLeft(Entry<K, V> p) {
        if (p == null)
            return;
        Entry<K, V> r = p.right;
        p.right = r.left;
        if (r.left != null)
            r.left.parent = p;
        r.parent = p.parent;
        if (p.parent == null)
            root = r;
        else if (p.parent.left == p)
            p.parent.left = r;
        else
            p.parent.right = r;
        r.left = p;
        p.parent = r;
    }
    private void rotateRight(Entry<K, V> p) {
        if (p == null)
            return;
        Entry<K, V> l = p.left;
        p.left = l.right;
        if (l.right != null)
            l.right.parent = p;
        l.parent = p.parent;
        if (p.parent == null)
            root = l;
        else if (p.parent.right == p)
            p.parent.right = l;
        else
            p.parent.left = l;
        l.right = p;
        p.parent = l;
    }
    private void fixAfterInsertion(Entry<K, V> x) {
        x.color = RED;
        while (x != null && x != root && x.parent.color == RED) {
            if (parentOf(x) == leftOf(parentOf(parentOf(x)))) {
                Entry<K, V> y = rightOf(parentOf(parentOf(x)));
                if (colorOf(y) == RED) {
                    setColor(parentOf(x), BLACK);
                    setColor(y, BLACK);
                    setColor(parentOf(parentOf(x)), RED);
                    x = parentOf(parentOf(x));
                } else {
                    if (x == rightOf(parentOf(x))) {
                        x = parentOf(x);
                        rotateLeft(x);
                    }
                    setColor(parentOf(x), BLACK);
                    setColor(parentOf(parentOf(x)), RED);
                    rotateRight(parentOf(parentOf(x)));
                }
            } else {
                Entry<K, V> y = leftOf(parentOf(parentOf(x)));
                if (colorOf(y) == RED) {
                    setColor(parentOf(x), BLACK);
                    setColor(y, BLACK);
                    setColor(parentOf(parentOf(x)), RED);
                    x = parentOf(parentOf(x));
                } else {
                    if (x == leftOf(parentOf(x))) {
                        x = parentOf(x);
                        rotateRight(x);
                    }
                    setColor(parentOf(x), BLACK);
                    setColor(parentOf(parentOf(x)), RED);
                    rotateLeft(parentOf(parentOf(x)));
                }
            }
        }
        root.color = BLACK;
    }
    private void deleteEntry(Entry<K, V> p) {
        modCount++;
        size--;
        if (p.left != null && p.right != null) {
            Entry<K, V> s = successor(p);
            p.key = s.key;
            p.value = s.value;
            p = s;
        }
        Entry<K, V> replacement = p.left != null ? p.left : p.right;
        if (replacement != null) {
            replacement.parent = p.parent;
            if (p.parent == null)
                root = replacement;
            else if (p == p.parent.left)
                p.parent.left = replacement;
            else
                p.parent.right = replacement;
            p.left = p.right = p.parent = null;
            if (p.color == BLACK)
                fixAfterDeletion(replacement);
        } else if (p.parent == null) {
            root = null;
        } else {
            if (p.color == BLACK)
                fixAfterDeletion(p);
            if (p.parent != null) {
                if (p == p.parent.left)
                    p.parent.left = null;
                else if (p == p.parent.right)
                    p.parent.right = null;
                p.parent = null;
            }
        }
    }
    private void fixAfterDeletion(Entry<K, V> x) {
        while (x != root && colorOf(x) == BLACK) {
            if (x == leftOf(parentOf(x))) {
                Entry<K, V> sib = rightOf(parentOf(x));
                if (colorOf(sib) == RED) {
                    setColor(sib, BLACK);
                    setColor(parentOf(x), RED);
                    rotateLeft(parentOf(x));
                    sib = rightOf(parentOf(x));
                }
                if (colorOf(leftOf(sib)) == BLACK && colorOf(rightOf(sib)) == BLACK) {
                    setColor(sib, RED);
                    x = parentOf(x);
                } else {
                    if (colorOf(rightOf(sib)) == BLACK) {
                        setColor(leftOf(sib), BLACK);
                        setColor(sib, RED);
                        rotateRight(sib);
                        sib = rightOf(parentOf(x));
                    }
                    setColor(sib, colorOf(parentOf(x)));
                    setColor(parentOf(x), BLACK);
                    setColor(rightOf(sib), BLACK);
                    rotateLeft(parentOf(x));
                    x = root;
                }
            } else {
                Entry<K, V> sib = leftOf(parentOf(x));
                if (colorOf(sib) == RED) {
                    setColor(sib, BLACK);
                    setColor(parentOf(x), RED);
                    rotateRight(parentOf(x));
                    sib = leftOf(parentOf(x));
                }
                if (colorOf(rightOf(sib)) == BLACK && colorOf(leftOf(sib)) == BLACK) {
                    setColor(sib, RED);
                    x = parentOf(x);
                } else {
                    if (colorOf(leftOf(sib)) == BLACK) {
                        setColor(rightOf(sib), BLACK);
                        setColor(sib, RED);
                        rotateLeft(sib);
                        sib = leftOf(parentOf(x));
                    }
                    setColor(sib, colorOf(parentOf(x)));
                    setColor(parentOf(x), BLACK);
                    setColor(leftOf(sib), BLACK);
                    rotateRight(parentOf(x));
                    x = root;
                }
            }
        }
        setColor(x, BLACK);
    }
}

// The keys are enum constants in the order of declaration.
public class EnumMap<K extends Enum<K>, V> extends TreeMap<K, V> {
    public EnumMap(Class<K> keyType) { super((a, b) -> a.ordinal() - b.ordinal()); }
    public EnumMap(Map<K, ? extends V> map) {
        super((a, b) -> a.ordinal() - b.ordinal());
        putAll(map);
    }
    public EnumMap<K, V> clone() { return new EnumMap<>(this); }
}
`);
})(globalThis);
