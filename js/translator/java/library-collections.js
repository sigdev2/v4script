// Java: the java.util collections written in Java - interfaces, lists,
// sets, queues. Maps are in library-maps.js. The iteration order and the
// texts of toString and of exceptions are those of the JDK: programs print
// the same.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Java = T.java;
    if (Java.library.units['java.util.collection'])
        return;

    Java.addLibrary('java.util.collection', 'java.util', String.raw`
public interface Collection<E> extends Iterable<E> {
    int size();
    default boolean isEmpty() { return size() == 0; }
    default boolean contains(Object value) {
        for (E item : this)
            if (Objects.equals(item, value))
                return true;
        return false;
    }
    default boolean add(E value) { throw new UnsupportedOperationException(); }
    default boolean remove(Object value) {
        Iterator<E> it = iterator();
        while (it.hasNext()) {
            if (Objects.equals(it.next(), value)) {
                it.remove();
                return true;
            }
        }
        return false;
    }
    default boolean containsAll(Collection<?> other) {
        for (Object item : other)
            if (!contains(item))
                return false;
        return true;
    }
    default boolean addAll(Collection<? extends E> other) {
        boolean changed = false;
        for (E item : other)
            if (add(item))
                changed = true;
        return changed;
    }
    default boolean removeAll(Collection<?> other) {
        Objects.requireNonNull(other);
        return removeIf(item -> other.contains(item));
    }
    default boolean retainAll(Collection<?> other) {
        Objects.requireNonNull(other);
        return removeIf(item -> !other.contains(item));
    }
    default boolean removeIf(java.util.function.Predicate<? super E> filter) {
        Objects.requireNonNull(filter);
        boolean removed = false;
        Iterator<E> it = iterator();
        while (it.hasNext()) {
            if (filter.test(it.next())) {
                it.remove();
                removed = true;
            }
        }
        return removed;
    }
    default void clear() {
        Iterator<E> it = iterator();
        while (it.hasNext()) {
            it.next();
            it.remove();
        }
    }
    default Object[] toArray() {
        Object[] result = new Object[size()];
        int index = 0;
        for (E item : this)
            result[index++] = item;
        return result;
    }
    default <T> T[] toArray(T[] array) {
        int size = size();
        Object[] result = array.length >= size ? array : Arrays.copyOf(array, size);
        int index = 0;
        for (E item : this)
            result[index++] = item;
        if (result.length > size)
            result[size] = null;
        return (T[]) result;
    }
    default <T> T[] toArray(java.util.function.IntFunction<T[]> generator) { return toArray(generator.apply(0)); }
    default java.util.stream.Stream<E> stream() { return java.util.stream.StreamSupport.ofIterator(iterator()); }
    default java.util.stream.Stream<E> parallelStream() { return stream(); }
}

public abstract class AbstractCollection<E> implements Collection<E> {
    protected AbstractCollection() {}
    public abstract Iterator<E> iterator();
    public abstract int size();
    public String toString() {
        Iterator<E> it = iterator();
        if (!it.hasNext())
            return "[]";
        StringBuilder sb = new StringBuilder("[");
        for (;;) {
            E item = it.next();
            sb.append(item == this ? "(this Collection)" : String.valueOf(item));
            if (!it.hasNext())
                return sb.append(']').toString();
            sb.append(", ");
        }
    }
}

public interface RandomAccess {}
`);
    Java.addLibrary('java.util.list', 'java.util', String.raw`
public interface List<E> extends Collection<E> {
    E get(int index);
    default E set(int index, E value) { throw new UnsupportedOperationException(); }
    default void add(int index, E value) { throw new UnsupportedOperationException(); }
    default E remove(int index) { throw new UnsupportedOperationException(); }
    default boolean add(E value) {
        add(size(), value);
        return true;
    }
    default int indexOf(Object value) {
        for (int i = 0; i < size(); i++)
            if (Objects.equals(get(i), value))
                return i;
        return -1;
    }
    default int lastIndexOf(Object value) {
        for (int i = size() - 1; i >= 0; i--)
            if (Objects.equals(get(i), value))
                return i;
        return -1;
    }
    default boolean contains(Object value) { return indexOf(value) >= 0; }
    default Iterator<E> iterator() { return new AbstractList.Itr<>(this, 0); }
    default ListIterator<E> listIterator() { return new AbstractList.Itr<>(this, 0); }
    default ListIterator<E> listIterator(int index) {
        if (index < 0 || index > size())
            throw new IndexOutOfBoundsException("Index: " + index);
        return new AbstractList.Itr<>(this, index);
    }
    default boolean addAll(int index, Collection<? extends E> other) {
        Object[] items = other.toArray();
        for (Object item : items)
            add(index++, (E) item);
        return items.length > 0;
    }
    default List<E> subList(int from, int to) {
        AbstractList.checkRange(from, to, size());
        return new AbstractList.SubList<>(this, from, to);
    }
    default void sort(Comparator<? super E> comparator) {
        Object[] items = toArray();
        Arrays.sort(items, (Comparator) comparator);
        for (int i = 0; i < items.length; i++)
            set(i, (E) items[i]);
    }
    default void replaceAll(java.util.function.UnaryOperator<E> operator) {
        Objects.requireNonNull(operator);
        for (int i = 0; i < size(); i++)
            set(i, operator.apply(get(i)));
    }
    default E getFirst() {
        if (isEmpty())
            throw new NoSuchElementException();
        return get(0);
    }
    default E getLast() {
        if (isEmpty())
            throw new NoSuchElementException();
        return get(size() - 1);
    }
    default E removeFirst() {
        if (isEmpty())
            throw new NoSuchElementException();
        return remove(0);
    }
    default E removeLast() {
        if (isEmpty())
            throw new NoSuchElementException();
        return remove(size() - 1);
    }
    default void addFirst(E value) { add(0, value); }
    default void addLast(E value) { add(value); }
    default List<E> reversed() {
        List<E> result = new ArrayList<>(this);
        Collections.reverse(result);
        return result;
    }
    static <E> List<E> of(E... items) { return ImmutableCollections.listOf(items); }
    static <E> List<E> copyOf(Collection<? extends E> items) { return ImmutableCollections.listOf(items.toArray()); }
}

public abstract class AbstractList<E> extends AbstractCollection<E> implements List<E> {
    protected transient int modCount = 0;
    protected AbstractList() {}
    public abstract E get(int index);
    public boolean add(E value) {
        add(size(), value);
        return true;
    }
    public void add(int index, E value) { throw new UnsupportedOperationException(); }
    public E set(int index, E value) { throw new UnsupportedOperationException(); }
    public E remove(int index) { throw new UnsupportedOperationException(); }
    public boolean remove(Object value) {
        int index = indexOf(value);
        if (index < 0)
            return false;
        remove(index);
        return true;
    }
    public void clear() { removeRange(0, size()); }
    protected void removeRange(int from, int to) {
        for (int i = to - 1; i >= from; i--)
            remove(i);
    }
    public Iterator<E> iterator() { return new Itr<>(this, 0); }
    public boolean equals(Object other) {
        if (other == this)
            return true;
        if (!(other instanceof List<?> list))
            return false;
        Iterator<E> a = iterator();
        Iterator<?> b = list.iterator();
        while (a.hasNext() && b.hasNext())
            if (!Objects.equals(a.next(), b.next()))
                return false;
        return !(a.hasNext() || b.hasNext());
    }
    public int hashCode() {
        int hash = 1;
        for (E item : this)
            hash = 31 * hash + (item == null ? 0 : item.hashCode());
        return hash;
    }

    static int modCountOf(List<?> list) { return list instanceof AbstractList<?> a ? a.modCount : 0; }

    static void checkRange(int from, int to, int size) {
        if (from < 0)
            throw new IndexOutOfBoundsException("fromIndex = " + from);
        if (to > size)
            throw new IndexOutOfBoundsException("toIndex = " + to);
        if (from > to)
            throw new IllegalArgumentException("fromIndex(" + from + ") > toIndex(" + to + ")");
    }

    // An iterator of any list by indices; a change of the list bypassing the iterator -
    // ConcurrentModificationException.
    static final class Itr<E> implements ListIterator<E> {
        private final List<E> list;
        private int cursor;
        private int lastReturned = -1;
        private int expectedModCount;
        Itr(List<E> list, int index) {
            this.list = list;
            this.cursor = index;
            this.expectedModCount = modCountOf(list);
        }
        private void check() {
            if (modCountOf(list) != expectedModCount)
                throw new ConcurrentModificationException();
        }
        public boolean hasNext() { return cursor != list.size(); }
        public E next() {
            check();
            int index = cursor;
            if (index >= list.size())
                throw new NoSuchElementException();
            cursor = index + 1;
            lastReturned = index;
            return list.get(index);
        }
        public boolean hasPrevious() { return cursor != 0; }
        public E previous() {
            check();
            int index = cursor - 1;
            if (index < 0)
                throw new NoSuchElementException();
            cursor = index;
            lastReturned = index;
            return list.get(index);
        }
        public int nextIndex() { return cursor; }
        public int previousIndex() { return cursor - 1; }
        public void remove() {
            if (lastReturned < 0)
                throw new IllegalStateException();
            check();
            list.remove(lastReturned);
            cursor = lastReturned;
            lastReturned = -1;
            expectedModCount = modCountOf(list);
        }
        public void set(E value) {
            if (lastReturned < 0)
                throw new IllegalStateException();
            check();
            list.set(lastReturned, value);
            expectedModCount = modCountOf(list);
        }
        public void add(E value) {
            check();
            list.add(cursor++, value);
            lastReturned = -1;
            expectedModCount = modCountOf(list);
        }
    }

    // A view of a part of a list (subList): changes go to the list itself.
    static final class SubList<E> extends AbstractList<E> {
        private final List<E> parent;
        private final int offset;
        private int size;
        private int expectedModCount;
        SubList(List<E> parent, int from, int to) {
            this.parent = parent;
            this.offset = from;
            this.size = to - from;
            this.expectedModCount = modCountOf(parent);
        }
        private void check() {
            if (modCountOf(parent) != expectedModCount)
                throw new ConcurrentModificationException();
        }
        public int size() {
            check();
            return size;
        }
        public E get(int index) {
            Objects.checkIndex(index, size);
            check();
            return parent.get(offset + index);
        }
        public E set(int index, E value) {
            Objects.checkIndex(index, size);
            check();
            return parent.set(offset + index, value);
        }
        public void add(int index, E value) {
            if (index < 0 || index > size)
                throw new IndexOutOfBoundsException("Index: " + index + ", Size: " + size);
            check();
            parent.add(offset + index, value);
            expectedModCount = modCountOf(parent);
            size++;
            modCount++;
        }
        public E remove(int index) {
            Objects.checkIndex(index, size);
            check();
            E result = parent.remove(offset + index);
            expectedModCount = modCountOf(parent);
            size--;
            modCount++;
            return result;
        }
    }
}

public class ArrayList<E> extends AbstractList<E> implements List<E>, RandomAccess, Cloneable, java.io.Serializable {
    private Object[] elementData;
    private int size;
    public ArrayList() { elementData = new Object[10]; }
    public ArrayList(int initialCapacity) {
        if (initialCapacity < 0)
            throw new IllegalArgumentException("Illegal Capacity: " + initialCapacity);
        elementData = new Object[initialCapacity];
    }
    public ArrayList(Collection<? extends E> items) {
        elementData = items.toArray();
        size = elementData.length;
    }
    private void grow(int minimum) {
        int capacity = elementData.length;
        int next = Math.max(minimum, capacity + (capacity >> 1));
        elementData = Arrays.copyOf(elementData, Math.max(next, 10));
    }
    public void ensureCapacity(int minimum) {
        if (minimum > elementData.length)
            grow(minimum);
    }
    public void trimToSize() { elementData = Arrays.copyOf(elementData, size); }
    public int size() { return size; }
    public boolean isEmpty() { return size == 0; }
    public E get(int index) {
        Objects.checkIndex(index, size);
        return (E) elementData[index];
    }
    public E set(int index, E value) {
        Objects.checkIndex(index, size);
        E old = (E) elementData[index];
        elementData[index] = value;
        return old;
    }
    public boolean add(E value) {
        modCount++;
        if (size == elementData.length)
            grow(size + 1);
        elementData[size++] = value;
        return true;
    }
    public void add(int index, E value) {
        if (index > size || index < 0)
            throw new IndexOutOfBoundsException("Index: " + index + ", Size: " + size);
        modCount++;
        if (size == elementData.length)
            grow(size + 1);
        System.arraycopy(elementData, index, elementData, index + 1, size - index);
        elementData[index] = value;
        size++;
    }
    public E remove(int index) {
        Objects.checkIndex(index, size);
        modCount++;
        E old = (E) elementData[index];
        int moved = size - index - 1;
        if (moved > 0)
            System.arraycopy(elementData, index + 1, elementData, index, moved);
        elementData[--size] = null;
        return old;
    }
    public boolean remove(Object value) {
        int index = indexOf(value);
        if (index < 0)
            return false;
        remove(index);
        return true;
    }
    public void clear() {
        modCount++;
        for (int i = 0; i < size; i++)
            elementData[i] = null;
        size = 0;
    }
    protected void removeRange(int from, int to) {
        if (from > to)
            throw new IndexOutOfBoundsException("From Index: " + from + " > To Index: " + to);
        modCount++;
        System.arraycopy(elementData, to, elementData, from, size - to);
        for (int i = size - (to - from); i < size; i++)
            elementData[i] = null;
        size -= to - from;
    }
    public int indexOf(Object value) {
        for (int i = 0; i < size; i++)
            if (Objects.equals(value, elementData[i]))
                return i;
        return -1;
    }
    public int lastIndexOf(Object value) {
        for (int i = size - 1; i >= 0; i--)
            if (Objects.equals(value, elementData[i]))
                return i;
        return -1;
    }
    public boolean contains(Object value) { return indexOf(value) >= 0; }
    public boolean addAll(Collection<? extends E> items) {
        Object[] added = items.toArray();
        modCount++;
        if (added.length == 0)
            return false;
        if (size + added.length > elementData.length)
            grow(size + added.length);
        System.arraycopy(added, 0, elementData, size, added.length);
        size += added.length;
        return true;
    }
    public boolean addAll(int index, Collection<? extends E> items) {
        if (index > size || index < 0)
            throw new IndexOutOfBoundsException("Index: " + index + ", Size: " + size);
        Object[] added = items.toArray();
        modCount++;
        if (added.length == 0)
            return false;
        if (size + added.length > elementData.length)
            grow(size + added.length);
        System.arraycopy(elementData, index, elementData, index + added.length, size - index);
        System.arraycopy(added, 0, elementData, index, added.length);
        size += added.length;
        return true;
    }
    public boolean removeIf(java.util.function.Predicate<? super E> filter) {
        Objects.requireNonNull(filter);
        int expected = modCount;
        int kept = 0;
        boolean removed = false;
        Object[] items = Arrays.copyOf(elementData, size);
        for (int i = 0; i < items.length; i++) {
            if (filter.test((E) items[i]))
                removed = true;
            else
                items[kept++] = items[i];
            if (modCount != expected)
                throw new ConcurrentModificationException();
        }
        if (!removed)
            return false;
        System.arraycopy(items, 0, elementData, 0, kept);
        for (int i = kept; i < size; i++)
            elementData[i] = null;
        size = kept;
        modCount++;
        return true;
    }
    public void forEach(java.util.function.Consumer<? super E> action) {
        Objects.requireNonNull(action);
        int expected = modCount;
        for (int i = 0; i < size && modCount == expected; i++)
            action.accept((E) elementData[i]);
        if (modCount != expected)
            throw new ConcurrentModificationException();
    }
    public void replaceAll(java.util.function.UnaryOperator<E> operator) {
        Objects.requireNonNull(operator);
        int expected = modCount;
        for (int i = 0; i < size && modCount == expected; i++)
            elementData[i] = operator.apply((E) elementData[i]);
        if (modCount != expected)
            throw new ConcurrentModificationException();
        modCount++;
    }
    public void sort(Comparator<? super E> comparator) {
        int expected = modCount;
        Arrays.sort((E[]) elementData, 0, size, comparator);
        if (modCount != expected)
            throw new ConcurrentModificationException();
        modCount++;
    }
    public Object[] toArray() { return Arrays.copyOf(elementData, size); }
    public <T> T[] toArray(T[] array) {
        if (array.length < size)
            return (T[]) Arrays.copyOf(elementData, size, array.getClass());
        System.arraycopy(elementData, 0, array, 0, size);
        if (array.length > size)
            array[size] = null;
        return array;
    }
    public Iterator<E> iterator() { return new Itr<>(this, 0); }
    public Object clone() { return new ArrayList<>(this); }
}

public class Vector<E> extends ArrayList<E> {
    public Vector() { super(); }
    public Vector(int initialCapacity) { super(initialCapacity); }
    public Vector(Collection<? extends E> items) { super(items); }
    public void addElement(E value) { add(value); }
    public E elementAt(int index) { return get(index); }
    public E firstElement() {
        if (isEmpty())
            throw new NoSuchElementException();
        return get(0);
    }
    public E lastElement() {
        if (isEmpty())
            throw new NoSuchElementException();
        return get(size() - 1);
    }
    public void removeElementAt(int index) { remove(index); }
    public void insertElementAt(E value, int index) { add(index, value); }
    public void setElementAt(E value, int index) { set(index, value); }
    public void removeAllElements() { clear(); }
}

public class Stack<E> extends Vector<E> {
    public Stack() {}
    public E push(E item) {
        add(item);
        return item;
    }
    public E pop() {
        E item = peek();
        remove(size() - 1);
        return item;
    }
    public E peek() {
        if (isEmpty())
            throw new EmptyStackException();
        return get(size() - 1);
    }
    public boolean empty() { return isEmpty(); }
    public int search(Object value) {
        int index = lastIndexOf(value);
        return index >= 0 ? size() - index : -1;
    }
}

// Unmodifiable collections List.of, Set.of, Collections.unmodifiable*.
final class ImmutableCollections {
    private ImmutableCollections() {}
    static UnsupportedOperationException uoe() { return new UnsupportedOperationException(); }

    static <E> List<E> listOf(Object[] items) {
        for (Object item : items)
            Objects.requireNonNull(item);
        return new ListN<>(Arrays.copyOf(items, items.length), false);
    }

    static final class ListN<E> extends AbstractList<E> implements RandomAccess {
        private final Object[] items;
        private final boolean allowNulls;
        ListN(Object[] items, boolean allowNulls) {
            this.items = items;
            this.allowNulls = allowNulls;
        }
        public int size() { return items.length; }
        public E get(int index) {
            Objects.checkIndex(index, items.length);
            return (E) items[index];
        }
        public int indexOf(Object value) {
            if (!allowNulls)
                Objects.requireNonNull(value);
            for (int i = 0; i < items.length; i++)
                if (Objects.equals(value, items[i]))
                    return i;
            return -1;
        }
        public boolean add(E value) { throw uoe(); }
        public void add(int index, E value) { throw uoe(); }
        public E set(int index, E value) { throw uoe(); }
        public E remove(int index) { throw uoe(); }
        public boolean remove(Object value) { throw uoe(); }
        public boolean removeIf(java.util.function.Predicate<? super E> filter) { throw uoe(); }
        public void clear() { throw uoe(); }
        public void sort(Comparator<? super E> comparator) { throw uoe(); }
        public void replaceAll(java.util.function.UnaryOperator<E> operator) { throw uoe(); }
        public boolean addAll(Collection<? extends E> items) { throw uoe(); }
        public Object[] toArray() { return Arrays.copyOf(items, items.length); }
    }

    // A read-only list wrapper (Collections.unmodifiableList).
    static final class UnmodifiableList<E> extends AbstractList<E> {
        private final List<? extends E> list;
        UnmodifiableList(List<? extends E> list) { this.list = Objects.requireNonNull(list); }
        public int size() { return list.size(); }
        public E get(int index) { return list.get(index); }
        public int indexOf(Object value) { return list.indexOf(value); }
        public boolean add(E value) { throw uoe(); }
        public void add(int index, E value) { throw uoe(); }
        public E set(int index, E value) { throw uoe(); }
        public E remove(int index) { throw uoe(); }
        public boolean remove(Object value) { throw uoe(); }
        public boolean removeIf(java.util.function.Predicate<? super E> filter) { throw uoe(); }
        public void clear() { throw uoe(); }
        public void sort(Comparator<? super E> comparator) { throw uoe(); }
        public void replaceAll(java.util.function.UnaryOperator<E> operator) { throw uoe(); }
        public boolean addAll(Collection<? extends E> items) { throw uoe(); }
        public String toString() { return list.toString(); }
    }

    static final class UnmodifiableCollection<E> extends AbstractCollection<E> {
        private final Collection<? extends E> items;
        UnmodifiableCollection(Collection<? extends E> items) { this.items = Objects.requireNonNull(items); }
        public int size() { return items.size(); }
        public boolean contains(Object value) { return items.contains(value); }
        public Iterator<E> iterator() {
            Iterator<? extends E> it = items.iterator();
            return new Iterator<E>() {
                public boolean hasNext() { return it.hasNext(); }
                public E next() { return it.next(); }
            };
        }
        public boolean add(E value) { throw uoe(); }
        public boolean remove(Object value) { throw uoe(); }
        public boolean removeIf(java.util.function.Predicate<? super E> filter) { throw uoe(); }
        public void clear() { throw uoe(); }
        public boolean addAll(Collection<? extends E> other) { throw uoe(); }
        public String toString() { return items.toString(); }
    }

    static final class UnmodifiableSet<E> extends AbstractSet<E> {
        private final Set<? extends E> set;
        UnmodifiableSet(Set<? extends E> set) { this.set = Objects.requireNonNull(set); }
        public int size() { return set.size(); }
        public boolean contains(Object value) { return set.contains(value); }
        public Iterator<E> iterator() {
            Iterator<? extends E> it = set.iterator();
            return new Iterator<E>() {
                public boolean hasNext() { return it.hasNext(); }
                public E next() { return it.next(); }
            };
        }
        public boolean add(E value) { throw uoe(); }
        public boolean remove(Object value) { throw uoe(); }
        public boolean removeIf(java.util.function.Predicate<? super E> filter) { throw uoe(); }
        public void clear() { throw uoe(); }
        public boolean addAll(Collection<? extends E> other) { throw uoe(); }
    }

    // Set.of: the insertion order (the JDK has a random one from run to run).
    static <E> Set<E> setOf(Object[] items) {
        LinkedHashSet<E> set = new LinkedHashSet<>();
        for (Object item : items) {
            Objects.requireNonNull(item);
            if (!set.add((E) item))
                throw new IllegalArgumentException("duplicate element: " + item);
        }
        return new UnmodifiableSet<>(set);
    }
}

// A list over an array (Arrays.asList): set changes the array, the size is fixed.
final class ArrayAsList<E> extends AbstractList<E> implements RandomAccess {
    private final E[] items;
    ArrayAsList(E[] items) { this.items = Objects.requireNonNull(items); }
    public int size() { return items.length; }
    public E get(int index) {
        Objects.checkIndex(index, items.length);
        return items[index];
    }
    public E set(int index, E value) {
        Objects.checkIndex(index, items.length);
        E old = items[index];
        items[index] = value;
        return old;
    }
    public int indexOf(Object value) {
        for (int i = 0; i < items.length; i++)
            if (Objects.equals(value, items[i]))
                return i;
        return -1;
    }
    public void sort(Comparator<? super E> comparator) { Arrays.sort(items, comparator); }
    public Object[] toArray() { return Arrays.copyOf(items, items.length, Object[].class); }
}

public class LinkedList<E> extends AbstractList<E> implements List<E>, Deque<E>, Cloneable, java.io.Serializable {
    private static final class Node<E> {
        E item;
        Node<E> next;
        Node<E> prev;
        Node(Node<E> prev, E item, Node<E> next) {
            this.item = item;
            this.next = next;
            this.prev = prev;
        }
    }
    private int size = 0;
    private Node<E> first;
    private Node<E> last;
    public LinkedList() {}
    public LinkedList(Collection<? extends E> items) { addAll(items); }
    private void linkLast(E value) {
        Node<E> l = last;
        Node<E> node = new Node<>(l, value, null);
        last = node;
        if (l == null)
            first = node;
        else
            l.next = node;
        size++;
        modCount++;
    }
    private void linkFirst(E value) {
        Node<E> f = first;
        Node<E> node = new Node<>(null, value, f);
        first = node;
        if (f == null)
            last = node;
        else
            f.prev = node;
        size++;
        modCount++;
    }
    private void linkBefore(E value, Node<E> successor) {
        Node<E> pred = successor.prev;
        Node<E> node = new Node<>(pred, value, successor);
        successor.prev = node;
        if (pred == null)
            first = node;
        else
            pred.next = node;
        size++;
        modCount++;
    }
    private E unlink(Node<E> node) {
        E element = node.item;
        Node<E> next = node.next;
        Node<E> prev = node.prev;
        if (prev == null)
            first = next;
        else
            prev.next = next;
        if (next == null)
            last = prev;
        else
            next.prev = prev;
        size--;
        modCount++;
        return element;
    }
    private Node<E> node(int index) {
        if (index < (size >> 1)) {
            Node<E> x = first;
            for (int i = 0; i < index; i++)
                x = x.next;
            return x;
        }
        Node<E> x = last;
        for (int i = size - 1; i > index; i--)
            x = x.prev;
        return x;
    }
    private void checkElementIndex(int index) {
        if (index < 0 || index >= size)
            throw new IndexOutOfBoundsException("Index: " + index + ", Size: " + size);
    }
    public int size() { return size; }
    public E get(int index) {
        checkElementIndex(index);
        return node(index).item;
    }
    public E set(int index, E value) {
        checkElementIndex(index);
        Node<E> x = node(index);
        E old = x.item;
        x.item = value;
        return old;
    }
    public boolean add(E value) {
        linkLast(value);
        return true;
    }
    public void add(int index, E value) {
        if (index < 0 || index > size)
            throw new IndexOutOfBoundsException("Index: " + index + ", Size: " + size);
        if (index == size)
            linkLast(value);
        else
            linkBefore(value, node(index));
    }
    public E remove(int index) {
        checkElementIndex(index);
        return unlink(node(index));
    }
    public boolean remove(Object value) {
        for (Node<E> x = first; x != null; x = x.next) {
            if (Objects.equals(value, x.item)) {
                unlink(x);
                return true;
            }
        }
        return false;
    }
    public void clear() {
        first = last = null;
        size = 0;
        modCount++;
    }
    public int indexOf(Object value) {
        int index = 0;
        for (Node<E> x = first; x != null; x = x.next, index++)
            if (Objects.equals(value, x.item))
                return index;
        return -1;
    }
    public void addFirst(E value) { linkFirst(value); }
    public void addLast(E value) { linkLast(value); }
    public E getFirst() {
        if (first == null)
            throw new NoSuchElementException();
        return first.item;
    }
    public E getLast() {
        if (last == null)
            throw new NoSuchElementException();
        return last.item;
    }
    public E removeFirst() {
        if (first == null)
            throw new NoSuchElementException();
        return unlink(first);
    }
    public E removeLast() {
        if (last == null)
            throw new NoSuchElementException();
        return unlink(last);
    }
    public boolean offer(E value) { return add(value); }
    public boolean offerFirst(E value) {
        addFirst(value);
        return true;
    }
    public boolean offerLast(E value) {
        addLast(value);
        return true;
    }
    public E peek() { return first == null ? null : first.item; }
    public E peekFirst() { return peek(); }
    public E peekLast() { return last == null ? null : last.item; }
    public E element() { return getFirst(); }
    public E poll() { return first == null ? null : unlink(first); }
    public E pollFirst() { return poll(); }
    public E pollLast() { return last == null ? null : unlink(last); }
    public void push(E value) { addFirst(value); }
    public E pop() { return removeFirst(); }
    public E remove() { return removeFirst(); }
    public boolean removeFirstOccurrence(Object value) { return remove(value); }
    public boolean removeLastOccurrence(Object value) {
        for (Node<E> x = last; x != null; x = x.prev) {
            if (Objects.equals(value, x.item)) {
                unlink(x);
                return true;
            }
        }
        return false;
    }
    public Iterator<E> iterator() { return listIterator(0); }
    public ListIterator<E> listIterator(int index) {
        if (index < 0 || index > size)
            throw new IndexOutOfBoundsException("Index: " + index + ", Size: " + size);
        return new ListItr(index);
    }
    public Iterator<E> descendingIterator() {
        ListItr it = new ListItr(size);
        return new Iterator<E>() {
            public boolean hasNext() { return it.hasPrevious(); }
            public E next() { return it.previous(); }
            public void remove() { it.remove(); }
        };
    }
    public Object[] toArray() {
        Object[] result = new Object[size];
        int index = 0;
        for (Node<E> x = first; x != null; x = x.next)
            result[index++] = x.item;
        return result;
    }
    public Object clone() { return new LinkedList<>(this); }
    public LinkedList<E> reversed() {
        LinkedList<E> result = new LinkedList<>();
        for (Node<E> x = first; x != null; x = x.next)
            result.addFirst(x.item);
        return result;
    }

    private class ListItr implements ListIterator<E> {
        private Node<E> lastReturned;
        private Node<E> next;
        private int nextIndex;
        private int expectedModCount = modCount;
        ListItr(int index) {
            next = index == size ? null : node(index);
            nextIndex = index;
        }
        private void check() {
            if (modCount != expectedModCount)
                throw new ConcurrentModificationException();
        }
        public boolean hasNext() { return nextIndex < size; }
        public E next() {
            check();
            if (!hasNext())
                throw new NoSuchElementException();
            lastReturned = next;
            next = next.next;
            nextIndex++;
            return lastReturned.item;
        }
        public boolean hasPrevious() { return nextIndex > 0; }
        public E previous() {
            check();
            if (!hasPrevious())
                throw new NoSuchElementException();
            lastReturned = next = next == null ? last : next.prev;
            nextIndex--;
            return lastReturned.item;
        }
        public int nextIndex() { return nextIndex; }
        public int previousIndex() { return nextIndex - 1; }
        public void remove() {
            check();
            if (lastReturned == null)
                throw new IllegalStateException();
            Node<E> lastNext = lastReturned.next;
            unlink(lastReturned);
            if (next == lastReturned)
                next = lastNext;
            else
                nextIndex--;
            lastReturned = null;
            expectedModCount++;
        }
        public void set(E value) {
            if (lastReturned == null)
                throw new IllegalStateException();
            check();
            lastReturned.item = value;
        }
        public void add(E value) {
            check();
            lastReturned = null;
            if (next == null)
                linkLast(value);
            else
                linkBefore(value, next);
            nextIndex++;
            expectedModCount++;
        }
    }
}
`);
    Java.addLibrary('java.util.set', 'java.util', String.raw`
public interface Set<E> extends Collection<E> {
    static <E> Set<E> of(E... items) { return ImmutableCollections.setOf(items); }
    static <E> Set<E> copyOf(Collection<? extends E> items) {
        LinkedHashSet<E> set = new LinkedHashSet<>();
        for (E item : items)
            set.add(Objects.requireNonNull(item));
        return Collections.unmodifiableSet(set);
    }
}

public abstract class AbstractSet<E> extends AbstractCollection<E> implements Set<E> {
    protected AbstractSet() {}
    public boolean equals(Object other) {
        if (other == this)
            return true;
        if (!(other instanceof Set<?> set))
            return false;
        if (set.size() != size())
            return false;
        return containsAll(set);
    }
    public int hashCode() {
        int hash = 0;
        for (E item : this)
            if (item != null)
                hash += item.hashCode();
        return hash;
    }
    public boolean removeAll(Collection<?> other) {
        Objects.requireNonNull(other);
        boolean modified = false;
        if (size() > other.size()) {
            for (Object item : other)
                if (remove(item))
                    modified = true;
        } else {
            Iterator<E> it = iterator();
            while (it.hasNext()) {
                if (other.contains(it.next())) {
                    it.remove();
                    modified = true;
                }
            }
        }
        return modified;
    }
}

public interface SortedSet<E> extends Set<E> {
    Comparator<? super E> comparator();
    E first();
    E last();
    SortedSet<E> headSet(E to);
    SortedSet<E> tailSet(E from);
    SortedSet<E> subSet(E from, E to);
}

public interface NavigableSet<E> extends SortedSet<E> {
    E lower(E value);
    E floor(E value);
    E ceiling(E value);
    E higher(E value);
    E pollFirst();
    E pollLast();
    NavigableSet<E> descendingSet();
    Iterator<E> descendingIterator();
    NavigableSet<E> headSet(E to, boolean inclusive);
    NavigableSet<E> tailSet(E from, boolean inclusive);
    NavigableSet<E> subSet(E from, boolean fromInclusive, E to, boolean toInclusive);
}

public class HashSet<E> extends AbstractSet<E> implements Set<E>, Cloneable, java.io.Serializable {
    static final Object PRESENT = new Object();
    HashMap<E, Object> map;
    public HashSet() { map = new HashMap<>(); }
    public HashSet(int initialCapacity) { map = new HashMap<>(initialCapacity); }
    public HashSet(int initialCapacity, float loadFactor) { map = new HashMap<>(initialCapacity, loadFactor); }
    public HashSet(Collection<? extends E> items) {
        map = new HashMap<>(Math.max((int) (items.size() / .75f) + 1, 16));
        addAll(items);
    }
    HashSet(HashMap<E, Object> map) { this.map = map; }
    public Iterator<E> iterator() { return map.keySet().iterator(); }
    public int size() { return map.size(); }
    public boolean isEmpty() { return map.isEmpty(); }
    public boolean contains(Object value) { return map.containsKey(value); }
    public boolean add(E value) { return map.put(value, PRESENT) == null; }
    public boolean remove(Object value) { return map.remove(value) == PRESENT; }
    public void clear() { map.clear(); }
    public Object clone() { return new HashSet<>(this); }
    public Object[] toArray() { return map.keysToArray(new Object[map.size()]); }
}

public class LinkedHashSet<E> extends HashSet<E> {
    public LinkedHashSet() { super(new LinkedHashMap<>()); }
    public LinkedHashSet(int initialCapacity) { super(new LinkedHashMap<>(initialCapacity)); }
    public LinkedHashSet(Collection<? extends E> items) {
        super(new LinkedHashMap<>(Math.max(2 * items.size(), 11)));
        addAll(items);
    }
    public Object clone() { return new LinkedHashSet<>(this); }
}

public class TreeSet<E> extends AbstractSet<E> implements NavigableSet<E>, Cloneable, java.io.Serializable {
    private final NavigableMap<E, Object> map;
    TreeSet(NavigableMap<E, Object> map) { this.map = map; }
    public TreeSet() { map = new TreeMap<>(); }
    public TreeSet(Comparator<? super E> comparator) { map = new TreeMap<>(comparator); }
    public TreeSet(Collection<? extends E> items) {
        this();
        addAll(items);
    }
    public TreeSet(SortedSet<E> items) {
        this(items.comparator());
        addAll(items);
    }
    public Iterator<E> iterator() { return map.navigableKeySet().iterator(); }
    public Iterator<E> descendingIterator() { return map.descendingKeySet().iterator(); }
    public NavigableSet<E> descendingSet() { return new TreeSet<>(map.descendingMap()); }
    public int size() { return map.size(); }
    public boolean isEmpty() { return map.isEmpty(); }
    public boolean contains(Object value) { return map.containsKey(value); }
    public boolean add(E value) { return map.put(value, HashSet.PRESENT) == null; }
    public boolean remove(Object value) { return map.remove(value) == HashSet.PRESENT; }
    public void clear() { map.clear(); }
    public Comparator<? super E> comparator() { return map.comparator(); }
    public E first() { return map.firstKey(); }
    public E last() { return map.lastKey(); }
    public E lower(E value) { return map.lowerKey(value); }
    public E floor(E value) { return map.floorKey(value); }
    public E ceiling(E value) { return map.ceilingKey(value); }
    public E higher(E value) { return map.higherKey(value); }
    public E pollFirst() {
        Map.Entry<E, ?> entry = map.pollFirstEntry();
        return entry == null ? null : entry.getKey();
    }
    public E pollLast() {
        Map.Entry<E, ?> entry = map.pollLastEntry();
        return entry == null ? null : entry.getKey();
    }
    public NavigableSet<E> subSet(E from, boolean fromInclusive, E to, boolean toInclusive) {
        return new TreeSet<>(map.subMap(from, fromInclusive, to, toInclusive));
    }
    public NavigableSet<E> headSet(E to, boolean inclusive) { return new TreeSet<>(map.headMap(to, inclusive)); }
    public NavigableSet<E> tailSet(E from, boolean inclusive) { return new TreeSet<>(map.tailMap(from, inclusive)); }
    public SortedSet<E> subSet(E from, E to) { return subSet(from, true, to, false); }
    public SortedSet<E> headSet(E to) { return headSet(to, false); }
    public SortedSet<E> tailSet(E from) { return tailSet(from, true); }
    public E getFirst() { return first(); }
    public E getLast() { return last(); }
    public Object clone() { return new TreeSet<>((SortedSet<E>) this); }
}
`);
    Java.addLibrary('java.util.queue', 'java.util', String.raw`
public interface Queue<E> extends Collection<E> {
    boolean offer(E value);
    E poll();
    E peek();
    default E remove() {
        E value = poll();
        if (value == null)
            throw new NoSuchElementException();
        return value;
    }
    default E element() {
        E value = peek();
        if (value == null)
            throw new NoSuchElementException();
        return value;
    }
}

public interface Deque<E> extends Queue<E> {
    void addFirst(E value);
    void addLast(E value);
    boolean offerFirst(E value);
    boolean offerLast(E value);
    E removeFirst();
    E removeLast();
    E pollFirst();
    E pollLast();
    E getFirst();
    E getLast();
    E peekFirst();
    E peekLast();
    boolean removeFirstOccurrence(Object value);
    boolean removeLastOccurrence(Object value);
    Iterator<E> descendingIterator();
    default void push(E value) { addFirst(value); }
    default E pop() { return removeFirst(); }
}

public abstract class AbstractQueue<E> extends AbstractCollection<E> implements Queue<E> {
    protected AbstractQueue() {}
    public boolean add(E value) {
        if (offer(value))
            return true;
        throw new IllegalStateException("Queue full");
    }
    public void clear() {
        while (poll() != null) {}
    }
}

public class ArrayDeque<E> extends AbstractCollection<E> implements Deque<E>, Cloneable, java.io.Serializable {
    private Object[] elements;
    private int head;
    private int size;
    private int modCount;
    public ArrayDeque() { elements = new Object[16]; }
    public ArrayDeque(int capacity) { elements = new Object[Math.max(capacity, 1)]; }
    public ArrayDeque(Collection<? extends E> items) {
        this(items.size() + 1);
        for (E item : items)
            addLast(item);
    }
    private void grow() {
        Object[] next = new Object[elements.length * 2];
        for (int i = 0; i < size; i++)
            next[i] = elements[(head + i) % elements.length];
        elements = next;
        head = 0;
    }
    private E at(int index) { return (E) elements[(head + index) % elements.length]; }
    public int size() { return size; }
    public boolean isEmpty() { return size == 0; }
    public void addFirst(E value) {
        if (value == null)
            throw new NullPointerException();
        if (size == elements.length)
            grow();
        head = (head - 1 + elements.length) % elements.length;
        elements[head] = value;
        size++;
        modCount++;
    }
    public void addLast(E value) {
        if (value == null)
            throw new NullPointerException();
        if (size == elements.length)
            grow();
        elements[(head + size) % elements.length] = value;
        size++;
        modCount++;
    }
    public boolean add(E value) {
        addLast(value);
        return true;
    }
    public boolean offer(E value) { return offerLast(value); }
    public boolean offerFirst(E value) {
        addFirst(value);
        return true;
    }
    public boolean offerLast(E value) {
        addLast(value);
        return true;
    }
    public E pollFirst() {
        if (size == 0)
            return null;
        E value = (E) elements[head];
        elements[head] = null;
        head = (head + 1) % elements.length;
        size--;
        modCount++;
        return value;
    }
    public E pollLast() {
        if (size == 0)
            return null;
        int index = (head + size - 1) % elements.length;
        E value = (E) elements[index];
        elements[index] = null;
        size--;
        modCount++;
        return value;
    }
    public E removeFirst() {
        E value = pollFirst();
        if (value == null)
            throw new NoSuchElementException();
        return value;
    }
    public E removeLast() {
        E value = pollLast();
        if (value == null)
            throw new NoSuchElementException();
        return value;
    }
    public E getFirst() {
        if (size == 0)
            throw new NoSuchElementException();
        return at(0);
    }
    public E getLast() {
        if (size == 0)
            throw new NoSuchElementException();
        return at(size - 1);
    }
    public E peekFirst() { return size == 0 ? null : at(0); }
    public E peekLast() { return size == 0 ? null : at(size - 1); }
    public E poll() { return pollFirst(); }
    public E peek() { return peekFirst(); }
    public E remove() { return removeFirst(); }
    public E element() { return getFirst(); }
    public void push(E value) { addFirst(value); }
    public E pop() { return removeFirst(); }
    private void removeAt(int index) {
        for (int i = index; i < size - 1; i++)
            elements[(head + i) % elements.length] = elements[(head + i + 1) % elements.length];
        elements[(head + size - 1) % elements.length] = null;
        size--;
        modCount++;
    }
    public boolean removeFirstOccurrence(Object value) {
        for (int i = 0; i < size; i++) {
            if (Objects.equals(value, at(i))) {
                removeAt(i);
                return true;
            }
        }
        return false;
    }
    public boolean removeLastOccurrence(Object value) {
        for (int i = size - 1; i >= 0; i--) {
            if (Objects.equals(value, at(i))) {
                removeAt(i);
                return true;
            }
        }
        return false;
    }
    public boolean remove(Object value) { return removeFirstOccurrence(value); }
    public boolean contains(Object value) {
        for (int i = 0; i < size; i++)
            if (Objects.equals(value, at(i)))
                return true;
        return false;
    }
    public void clear() {
        for (int i = 0; i < elements.length; i++)
            elements[i] = null;
        head = 0;
        size = 0;
        modCount++;
    }
    public Iterator<E> iterator() { return new Itr(false); }
    public Iterator<E> descendingIterator() { return new Itr(true); }
    public ArrayDeque<E> clone() { return new ArrayDeque<>(this); }

    private class Itr implements Iterator<E> {
        private final boolean descending;
        private int index;
        private int lastReturned = -1;
        private int expectedModCount = modCount;
        Itr(boolean descending) {
            this.descending = descending;
            this.index = descending ? size - 1 : 0;
        }
        public boolean hasNext() { return descending ? index >= 0 : index < size; }
        public E next() {
            if (modCount != expectedModCount)
                throw new ConcurrentModificationException();
            if (!hasNext())
                throw new NoSuchElementException();
            lastReturned = index;
            E value = at(index);
            index += descending ? -1 : 1;
            return value;
        }
        public void remove() {
            if (lastReturned < 0)
                throw new IllegalStateException();
            removeAt(lastReturned);
            if (!descending)
                index--;
            lastReturned = -1;
            expectedModCount = modCount;
        }
    }
}

// A binary heap in an array - the same sift as in the JDK: toString and
// iteration give the same order.
public class PriorityQueue<E> extends AbstractQueue<E> implements java.io.Serializable {
    private Object[] queue;
    private int size;
    private final Comparator<? super E> comparator;
    private int modCount;
    public PriorityQueue() { this(11, null); }
    public PriorityQueue(int initialCapacity) { this(initialCapacity, null); }
    public PriorityQueue(Comparator<? super E> comparator) { this(11, comparator); }
    public PriorityQueue(int initialCapacity, Comparator<? super E> comparator) {
        if (initialCapacity < 1)
            throw new IllegalArgumentException();
        this.queue = new Object[initialCapacity];
        this.comparator = comparator;
    }
    public PriorityQueue(Collection<? extends E> items) {
        this.comparator = items instanceof PriorityQueue<?> pq ? (Comparator<? super E>) pq.comparator()
                        : (items instanceof SortedSet<?> ss ? (Comparator<? super E>) ss.comparator() : null);
        this.queue = items.toArray();
        this.size = queue.length;
        if (queue.length == 0)
            queue = new Object[1];
        for (int i = (size >>> 1) - 1; i >= 0; i--)
            siftDown(i, (E) queue[i]);
    }
    private int compare(E a, E b) {
        return comparator != null ? comparator.compare(a, b) : ((Comparable<? super E>) a).compareTo(b);
    }
    private void siftUp(int k, E x) {
        while (k > 0) {
            int parent = (k - 1) >>> 1;
            Object e = queue[parent];
            if (compare(x, (E) e) >= 0)
                break;
            queue[k] = e;
            k = parent;
        }
        queue[k] = x;
    }
    private void siftDown(int k, E x) {
        int half = size >>> 1;
        while (k < half) {
            int child = (k << 1) + 1;
            Object c = queue[child];
            int right = child + 1;
            if (right < size && compare((E) c, (E) queue[right]) > 0)
                c = queue[child = right];
            if (compare(x, (E) c) <= 0)
                break;
            queue[k] = c;
            k = child;
        }
        queue[k] = x;
    }
    public boolean add(E value) { return offer(value); }
    public boolean offer(E value) {
        if (value == null)
            throw new NullPointerException();
        modCount++;
        int i = size;
        if (i >= queue.length)
            queue = Arrays.copyOf(queue, queue.length < 64 ? queue.length * 2 + 2 : queue.length + (queue.length >> 1));
        if (i == 0 && comparator == null)
            ((Comparable<? super E>) value).compareTo(value);
        siftUp(i, value);
        size = i + 1;
        return true;
    }
    public E peek() { return size == 0 ? null : (E) queue[0]; }
    public E poll() {
        if (size == 0)
            return null;
        modCount++;
        E result = (E) queue[0];
        int n = --size;
        E x = (E) queue[n];
        queue[n] = null;
        if (n > 0)
            siftDown(0, x);
        return result;
    }
    private E removeAt(int i) {
        modCount++;
        int s = --size;
        if (s == i) {
            queue[i] = null;
        } else {
            E moved = (E) queue[s];
            queue[s] = null;
            siftDown(i, moved);
            if (queue[i] == moved) {
                siftUp(i, moved);
                if (queue[i] != moved)
                    return moved;
            }
        }
        return null;
    }
    public boolean remove(Object value) {
        for (int i = 0; i < size; i++) {
            if (Objects.equals(value, queue[i])) {
                removeAt(i);
                return true;
            }
        }
        return false;
    }
    public boolean contains(Object value) {
        for (int i = 0; i < size; i++)
            if (Objects.equals(value, queue[i]))
                return true;
        return false;
    }
    public int size() { return size; }
    public void clear() {
        modCount++;
        for (int i = 0; i < size; i++)
            queue[i] = null;
        size = 0;
    }
    public Comparator<? super E> comparator() { return comparator; }
    public Object[] toArray() { return Arrays.copyOf(queue, size); }
    public Iterator<E> iterator() {
        return new Iterator<E>() {
            private int cursor = 0;
            private int lastReturned = -1;
            private int expectedModCount = modCount;
            public boolean hasNext() { return cursor < size; }
            public E next() {
                if (expectedModCount != modCount)
                    throw new ConcurrentModificationException();
                if (cursor >= size)
                    throw new NoSuchElementException();
                lastReturned = cursor;
                return (E) queue[cursor++];
            }
            public void remove() {
                if (lastReturned < 0)
                    throw new IllegalStateException();
                removeAt(lastReturned);
                cursor = lastReturned;
                lastReturned = -1;
                expectedModCount = modCount;
            }
        };
    }
}
`);
})(globalThis);
