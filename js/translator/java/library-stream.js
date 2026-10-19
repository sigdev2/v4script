// Java: java.util.stream - streams over iterators. A stream pulls
// elements one by one, so peek, filter and map interleave as in Java, and
// limit and findFirst touch nothing extra; sorted and distinct collect the
// elements at the first request. IntStream, LongStream and DoubleStream
// come from one template.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Java = T.java;
    if (Java.library.units['java.util.stream'])
        return;

    var HEADER = 'import java.util.*;\nimport java.util.function.*;\n';

    Java.addLibrary('java.util.stream', 'java.util.stream', HEADER + String.raw`
public interface BaseStream<T, S extends BaseStream<T, S>> extends AutoCloseable {
    Iterator<T> iterator();
    boolean isParallel();
    S sequential();
    S parallel();
    S unordered();
    S onClose(Runnable handler);
    void close();
}

public interface Stream<T> extends BaseStream<T, Stream<T>> {
    Stream<T> filter(Predicate<? super T> predicate);
    <R> Stream<R> map(Function<? super T, ? extends R> mapper);
    IntStream mapToInt(ToIntFunction<? super T> mapper);
    LongStream mapToLong(ToLongFunction<? super T> mapper);
    DoubleStream mapToDouble(ToDoubleFunction<? super T> mapper);
    <R> Stream<R> flatMap(Function<? super T, ? extends Stream<? extends R>> mapper);
    IntStream flatMapToInt(Function<? super T, ? extends IntStream> mapper);
    <R> Stream<R> mapMulti(BiConsumer<? super T, ? super Consumer<R>> mapper);
    Stream<T> distinct();
    Stream<T> sorted();
    Stream<T> sorted(Comparator<? super T> comparator);
    Stream<T> peek(Consumer<? super T> action);
    Stream<T> limit(long maxSize);
    Stream<T> skip(long n);
    Stream<T> takeWhile(Predicate<? super T> predicate);
    Stream<T> dropWhile(Predicate<? super T> predicate);
    void forEach(Consumer<? super T> action);
    void forEachOrdered(Consumer<? super T> action);
    Object[] toArray();
    <A> A[] toArray(IntFunction<A[]> generator);
    T reduce(T identity, BinaryOperator<T> accumulator);
    Optional<T> reduce(BinaryOperator<T> accumulator);
    <U> U reduce(U identity, BiFunction<U, ? super T, U> accumulator, BinaryOperator<U> combiner);
    <R> R collect(Supplier<R> supplier, BiConsumer<R, ? super T> accumulator, BiConsumer<R, R> combiner);
    <R, A> R collect(Collector<? super T, A, R> collector);
    List<T> toList();
    Optional<T> min(Comparator<? super T> comparator);
    Optional<T> max(Comparator<? super T> comparator);
    long count();
    boolean anyMatch(Predicate<? super T> predicate);
    boolean allMatch(Predicate<? super T> predicate);
    boolean noneMatch(Predicate<? super T> predicate);
    Optional<T> findFirst();
    Optional<T> findAny();

    static <T> Stream<T> empty() { return StreamSupport.ofIterator(Collections.emptyIterator()); }
    static <T> Stream<T> of(T value) { return StreamSupport.ofIterator(List.<T>of(value).iterator()); }
    static <T> Stream<T> ofNullable(T value) { return value == null ? empty() : of(value); }
    @SafeVarargs
    static <T> Stream<T> of(T... values) { return Arrays.stream(values); }
    static <T> Stream<T> iterate(T seed, UnaryOperator<T> next) {
        return StreamSupport.ofIterator(new Iterator<T>() {
            private T current;
            private boolean started;
            public boolean hasNext() { return true; }
            public T next() {
                current = started ? next.apply(current) : seed;
                started = true;
                return current;
            }
        });
    }
    static <T> Stream<T> iterate(T seed, Predicate<? super T> hasNext, UnaryOperator<T> next) {
        return StreamSupport.ofIterator(new Iterator<T>() {
            private T current;
            private boolean started;
            private boolean finished;
            private boolean ready;
            public boolean hasNext() {
                if (ready)
                    return true;
                if (finished)
                    return false;
                T candidate = started ? next.apply(current) : seed;
                started = true;
                if (!hasNext.test(candidate)) {
                    finished = true;
                    return false;
                }
                current = candidate;
                ready = true;
                return true;
            }
            public T next() {
                if (!hasNext())
                    throw new NoSuchElementException();
                ready = false;
                return current;
            }
        });
    }
    static <T> Stream<T> generate(Supplier<? extends T> supplier) {
        return StreamSupport.ofIterator(new Iterator<T>() {
            public boolean hasNext() { return true; }
            public T next() { return supplier.get(); }
        });
    }
    static <T> Stream<T> concat(Stream<? extends T> a, Stream<? extends T> b) {
        Iterator<? extends T> first = a.iterator();
        Iterator<? extends T> second = b.iterator();
        return StreamSupport.ofIterator(new Iterator<T>() {
            public boolean hasNext() { return first.hasNext() || second.hasNext(); }
            public T next() { return first.hasNext() ? first.next() : second.next(); }
        });
    }
    static <T> Stream.Builder<T> builder() { return new StreamSupport.ListBuilder<T>(); }

    interface Builder<T> extends Consumer<T> {
        void accept(T value);
        default Stream.Builder<T> add(T value) {
            accept(value);
            return this;
        }
        Stream<T> build();
    }
}

// Creating streams from iterators (internals of the library).
public final class StreamSupport {
    private StreamSupport() {}
    public static <T> Stream<T> ofIterator(Iterator<T> source) { return new RefPipeline<T>(source); }
    public static IntStream intStream(PrimitiveIterator.OfInt source) { return new IntPipeline(source); }
    public static LongStream longStream(PrimitiveIterator.OfLong source) { return new LongPipeline(source); }
    public static DoubleStream doubleStream(PrimitiveIterator.OfDouble source) { return new DoublePipeline(source); }

    static final class ListBuilder<T> implements Stream.Builder<T> {
        private final List<T> items = new ArrayList<>();
        private boolean built;
        public void accept(T value) {
            if (built)
                throw new IllegalStateException();
            items.add(value);
        }
        public Stream<T> build() {
            if (built)
                throw new IllegalStateException();
            built = true;
            return items.stream();
        }
    }

    // A sum with the Kahan correction, as in the Collectors of the JDK.
    static void sumWithCompensation(double[] state, double value) {
        double tmp = value - state[1];
        double sum = state[0];
        double velvel = sum + tmp;
        state[1] = (velvel - sum) - tmp;
        state[0] = velvel;
    }
    static double computeFinalSum(double[] state) {
        double tmp = state[0] - state[1];
        double simpleSum = state[state.length - 1];
        if (Double.isNaN(tmp) && Double.isInfinite(simpleSum))
            return simpleSum;
        return tmp;
    }
}

abstract class AbstractPipeline {
    private boolean linked;
    private List<Runnable> closeHandlers;
    final void link() {
        if (linked)
            throw new IllegalStateException("stream has already been operated upon or closed");
        linked = true;
    }
    final void inherit(AbstractPipeline from) { closeHandlers = from.closeHandlers; }
    final void addCloseHandler(Runnable handler) {
        if (closeHandlers == null)
            closeHandlers = new ArrayList<>();
        closeHandlers.add(handler);
    }
    public final void close() {
        List<Runnable> handlers = closeHandlers;
        closeHandlers = null;
        if (handlers != null)
            for (Runnable handler : handlers)
                handler.run();
    }
    public final boolean isParallel() { return false; }
}

final class RefPipeline<T> extends AbstractPipeline implements Stream<T> {
    private final Iterator<T> source;
    RefPipeline(Iterator<T> source) { this.source = source; }
    private Iterator<T> take() {
        link();
        return source;
    }
    private <R> Stream<R> chain(Iterator<R> next) {
        RefPipeline<R> result = new RefPipeline<R>(next);
        result.inherit(this);
        return result;
    }
    public Iterator<T> iterator() { return take(); }
    public Stream<T> sequential() { return this; }
    public Stream<T> parallel() { return this; }
    public Stream<T> unordered() { return this; }
    public Stream<T> onClose(Runnable handler) {
        addCloseHandler(handler);
        return this;
    }

    public Stream<T> filter(Predicate<? super T> predicate) {
        Objects.requireNonNull(predicate);
        Iterator<T> it = take();
        return chain(new Iterator<T>() {
            private T pending;
            private boolean ready;
            public boolean hasNext() {
                while (!ready && it.hasNext()) {
                    T value = it.next();
                    if (predicate.test(value)) {
                        pending = value;
                        ready = true;
                    }
                }
                return ready;
            }
            public T next() {
                if (!hasNext())
                    throw new NoSuchElementException();
                ready = false;
                T value = pending;
                pending = null;
                return value;
            }
        });
    }
    public <R> Stream<R> map(Function<? super T, ? extends R> mapper) {
        Objects.requireNonNull(mapper);
        Iterator<T> it = take();
        return chain(new Iterator<R>() {
            public boolean hasNext() { return it.hasNext(); }
            public R next() { return mapper.apply(it.next()); }
        });
    }
    public IntStream mapToInt(ToIntFunction<? super T> mapper) {
        Objects.requireNonNull(mapper);
        Iterator<T> it = take();
        return new IntPipeline(new PrimitiveIterator.OfInt() {
            public boolean hasNext() { return it.hasNext(); }
            public int nextInt() { return mapper.applyAsInt(it.next()); }
        });
    }
    public LongStream mapToLong(ToLongFunction<? super T> mapper) {
        Objects.requireNonNull(mapper);
        Iterator<T> it = take();
        return new LongPipeline(new PrimitiveIterator.OfLong() {
            public boolean hasNext() { return it.hasNext(); }
            public long nextLong() { return mapper.applyAsLong(it.next()); }
        });
    }
    public DoubleStream mapToDouble(ToDoubleFunction<? super T> mapper) {
        Objects.requireNonNull(mapper);
        Iterator<T> it = take();
        return new DoublePipeline(new PrimitiveIterator.OfDouble() {
            public boolean hasNext() { return it.hasNext(); }
            public double nextDouble() { return mapper.applyAsDouble(it.next()); }
        });
    }
    public <R> Stream<R> flatMap(Function<? super T, ? extends Stream<? extends R>> mapper) {
        Objects.requireNonNull(mapper);
        Iterator<T> it = take();
        return chain(new Iterator<R>() {
            private Iterator<? extends R> inner;
            public boolean hasNext() {
                while (inner == null || !inner.hasNext()) {
                    if (!it.hasNext())
                        return false;
                    Stream<? extends R> next = mapper.apply(it.next());
                    inner = next == null ? Collections.emptyIterator() : next.iterator();
                }
                return true;
            }
            public R next() {
                if (!hasNext())
                    throw new NoSuchElementException();
                return inner.next();
            }
        });
    }
    public IntStream flatMapToInt(Function<? super T, ? extends IntStream> mapper) {
        Objects.requireNonNull(mapper);
        Iterator<T> it = take();
        return new IntPipeline(new PrimitiveIterator.OfInt() {
            private PrimitiveIterator.OfInt inner;
            public boolean hasNext() {
                while (inner == null || !inner.hasNext()) {
                    if (!it.hasNext())
                        return false;
                    IntStream next = mapper.apply(it.next());
                    inner = next == null ? IntStream.empty().iterator() : next.iterator();
                }
                return true;
            }
            public int nextInt() {
                if (!hasNext())
                    throw new NoSuchElementException();
                return inner.nextInt();
            }
        });
    }
    public <R> Stream<R> mapMulti(BiConsumer<? super T, ? super Consumer<R>> mapper) {
        Objects.requireNonNull(mapper);
        Iterator<T> it = take();
        return chain(new Iterator<R>() {
            private final ArrayDeque<Object> buffer = new ArrayDeque<>();
            public boolean hasNext() {
                while (buffer.isEmpty() && it.hasNext())
                    mapper.accept(it.next(), (Consumer<R>) value -> buffer.addLast(value == null ? StreamSupport.class : value));
                return !buffer.isEmpty();
            }
            public R next() {
                if (!hasNext())
                    throw new NoSuchElementException();
                Object value = buffer.pollFirst();
                return value == StreamSupport.class ? null : (R) value;
            }
        });
    }
    public Stream<T> distinct() {
        Iterator<T> it = take();
        Set<T> seen = new HashSet<>();
        return chain(new Iterator<T>() {
            private T pending;
            private boolean ready;
            public boolean hasNext() {
                while (!ready && it.hasNext()) {
                    T value = it.next();
                    if (seen.add(value)) {
                        pending = value;
                        ready = true;
                    }
                }
                return ready;
            }
            public T next() {
                if (!hasNext())
                    throw new NoSuchElementException();
                ready = false;
                return pending;
            }
        });
    }
    public Stream<T> sorted() { return sorted(null); }
    public Stream<T> sorted(Comparator<? super T> comparator) {
        Iterator<T> it = take();
        return chain(new Iterator<T>() {
            private Iterator<T> sorted;
            private Iterator<T> items() {
                if (sorted == null) {
                    List<T> all = new ArrayList<>();
                    while (it.hasNext())
                        all.add(it.next());
                    if (comparator == null) {
                        for (T item : all) {
                            Comparable<?> comparable = (Comparable<?>) item;
                        }
                    }
                    all.sort(comparator);
                    sorted = all.iterator();
                }
                return sorted;
            }
            public boolean hasNext() { return items().hasNext(); }
            public T next() { return items().next(); }
        });
    }
    public Stream<T> peek(Consumer<? super T> action) {
        Objects.requireNonNull(action);
        Iterator<T> it = take();
        return chain(new Iterator<T>() {
            public boolean hasNext() { return it.hasNext(); }
            public T next() {
                T value = it.next();
                action.accept(value);
                return value;
            }
        });
    }
    public Stream<T> limit(long maxSize) {
        if (maxSize < 0)
            throw new IllegalArgumentException(Long.toString(maxSize));
        Iterator<T> it = take();
        return chain(new Iterator<T>() {
            private long count;
            public boolean hasNext() { return count < maxSize && it.hasNext(); }
            public T next() {
                if (count >= maxSize)
                    throw new NoSuchElementException();
                count++;
                return it.next();
            }
        });
    }
    public Stream<T> skip(long n) {
        if (n < 0)
            throw new IllegalArgumentException(Long.toString(n));
        Iterator<T> it = take();
        return chain(new Iterator<T>() {
            private long skipped;
            public boolean hasNext() {
                while (skipped < n && it.hasNext()) {
                    it.next();
                    skipped++;
                }
                return it.hasNext();
            }
            public T next() {
                if (!hasNext())
                    throw new NoSuchElementException();
                return it.next();
            }
        });
    }
    public Stream<T> takeWhile(Predicate<? super T> predicate) {
        Objects.requireNonNull(predicate);
        Iterator<T> it = take();
        return chain(new Iterator<T>() {
            private T pending;
            private boolean ready;
            private boolean done;
            public boolean hasNext() {
                if (!ready && !done && it.hasNext()) {
                    T value = it.next();
                    if (predicate.test(value)) {
                        pending = value;
                        ready = true;
                    } else {
                        done = true;
                    }
                }
                return ready;
            }
            public T next() {
                if (!hasNext())
                    throw new NoSuchElementException();
                ready = false;
                return pending;
            }
        });
    }
    public Stream<T> dropWhile(Predicate<? super T> predicate) {
        Objects.requireNonNull(predicate);
        Iterator<T> it = take();
        return chain(new Iterator<T>() {
            private T pending;
            private boolean ready;
            private boolean dropping = true;
            public boolean hasNext() {
                while (!ready && it.hasNext()) {
                    T value = it.next();
                    if (dropping && predicate.test(value))
                        continue;
                    dropping = false;
                    pending = value;
                    ready = true;
                }
                return ready;
            }
            public T next() {
                if (!hasNext())
                    throw new NoSuchElementException();
                ready = false;
                return pending;
            }
        });
    }

    public void forEach(Consumer<? super T> action) {
        Objects.requireNonNull(action);
        Iterator<T> it = take();
        while (it.hasNext())
            action.accept(it.next());
    }
    public void forEachOrdered(Consumer<? super T> action) { forEach(action); }
    public Object[] toArray() {
        List<T> items = new ArrayList<>();
        forEach(item -> items.add(item));
        return items.toArray();
    }
    public <A> A[] toArray(IntFunction<A[]> generator) {
        List<T> items = new ArrayList<>();
        forEach(item -> items.add(item));
        A[] result = generator.apply(items.size());
        if (result.length != items.size())
            throw new IllegalStateException("Begin size " + items.size() + " is not equal to fixed size " + result.length);
        for (int i = 0; i < result.length; i++)
            result[i] = (A) items.get(i);
        return result;
    }
    public T reduce(T identity, BinaryOperator<T> accumulator) {
        Iterator<T> it = take();
        T result = identity;
        while (it.hasNext())
            result = accumulator.apply(result, it.next());
        return result;
    }
    public Optional<T> reduce(BinaryOperator<T> accumulator) {
        Iterator<T> it = take();
        if (!it.hasNext())
            return Optional.empty();
        T result = it.next();
        while (it.hasNext())
            result = accumulator.apply(result, it.next());
        return Optional.of(result);
    }
    public <U> U reduce(U identity, BiFunction<U, ? super T, U> accumulator, BinaryOperator<U> combiner) {
        Iterator<T> it = take();
        U result = identity;
        while (it.hasNext())
            result = accumulator.apply(result, it.next());
        return result;
    }
    public <R> R collect(Supplier<R> supplier, BiConsumer<R, ? super T> accumulator, BiConsumer<R, R> combiner) {
        Iterator<T> it = take();
        R container = supplier.get();
        while (it.hasNext())
            accumulator.accept(container, it.next());
        return container;
    }
    public <R, A> R collect(Collector<? super T, A, R> collector) {
        Iterator<T> it = take();
        A container = collector.supplier().get();
        BiConsumer<A, ? super T> accumulator = collector.accumulator();
        while (it.hasNext())
            ((BiConsumer<A, T>) accumulator).accept(container, it.next());
        return collector.finisher().apply(container);
    }
    public List<T> toList() {
        List<T> items = new ArrayList<>();
        forEach(item -> items.add(item));
        return Collections.unmodifiableList(items);
    }
    public Optional<T> min(Comparator<? super T> comparator) {
        return reduce((a, b) -> comparator.compare(a, b) <= 0 ? a : b);
    }
    public Optional<T> max(Comparator<? super T> comparator) {
        return reduce((a, b) -> comparator.compare(a, b) >= 0 ? a : b);
    }
    public long count() {
        Iterator<T> it = take();
        long count = 0;
        while (it.hasNext()) {
            it.next();
            count++;
        }
        return count;
    }
    public boolean anyMatch(Predicate<? super T> predicate) {
        Iterator<T> it = take();
        while (it.hasNext())
            if (predicate.test(it.next()))
                return true;
        return false;
    }
    public boolean allMatch(Predicate<? super T> predicate) {
        Iterator<T> it = take();
        while (it.hasNext())
            if (!predicate.test(it.next()))
                return false;
        return true;
    }
    public boolean noneMatch(Predicate<? super T> predicate) { return !anyMatch(predicate); }
    public Optional<T> findFirst() {
        Iterator<T> it = take();
        return it.hasNext() ? Optional.of(it.next()) : Optional.empty();
    }
    public Optional<T> findAny() { return findFirst(); }
}
` + ['int', 'long', 'double'].map(primitiveStream).join(''));

    // IntStream, LongStream, DoubleStream and their pipelines by a template.
    function primitiveStream(primitive) {
        var P = primitive.charAt(0).toUpperCase() + primitive.substring(1);
        var Box = { int: 'Integer', long: 'Long', double: 'Double' }[primitive];
        var S = P + 'Stream';
        var It = 'PrimitiveIterator.Of' + P;
        var nextName = 'next' + P;
        var others = ['int', 'long', 'double'].filter(function (other) { return other !== primitive; });
        var out = [];
        var sumType = primitive;
        // The interface.
        out.push('public interface ' + S + ' extends BaseStream<' + Box + ', ' + S + '> {',
                 '    ' + It + ' iterator();',
                 '    ' + S + ' filter(' + P + 'Predicate predicate);',
                 '    ' + S + ' map(' + P + 'UnaryOperator mapper);',
                 '    <U> Stream<U> mapToObj(' + P + 'Function<? extends U> mapper);');
        others.forEach(function (other) {
            var O = other.charAt(0).toUpperCase() + other.substring(1);
            out.push('    ' + O + 'Stream mapTo' + O + '(' + P + 'To' + O + 'Function mapper);');
        });
        out.push('    ' + S + ' flatMap(' + P + 'Function<? extends ' + S + '> mapper);',
                 '    ' + S + ' distinct();',
                 '    ' + S + ' sorted();',
                 '    ' + S + ' peek(' + P + 'Consumer action);',
                 '    ' + S + ' limit(long maxSize);',
                 '    ' + S + ' skip(long n);',
                 '    ' + S + ' takeWhile(' + P + 'Predicate predicate);',
                 '    ' + S + ' dropWhile(' + P + 'Predicate predicate);',
                 '    Stream<' + Box + '> boxed();',
                 '    void forEach(' + P + 'Consumer action);',
                 '    void forEachOrdered(' + P + 'Consumer action);',
                 '    ' + primitive + '[] toArray();',
                 '    ' + primitive + ' reduce(' + primitive + ' identity, ' + P + 'BinaryOperator op);',
                 '    Optional' + P + ' reduce(' + P + 'BinaryOperator op);',
                 '    <R> R collect(Supplier<R> supplier, Obj' + P + 'Consumer<R> accumulator, BiConsumer<R, R> combiner);',
                 '    ' + sumType + ' sum();',
                 '    Optional' + P + ' min();',
                 '    Optional' + P + ' max();',
                 '    long count();',
                 '    OptionalDouble average();',
                 '    ' + P + 'SummaryStatistics summaryStatistics();',
                 '    boolean anyMatch(' + P + 'Predicate predicate);',
                 '    boolean allMatch(' + P + 'Predicate predicate);',
                 '    boolean noneMatch(' + P + 'Predicate predicate);',
                 '    Optional' + P + ' findFirst();',
                 '    Optional' + P + ' findAny();');
        if (primitive === 'int')
            out.push('    LongStream asLongStream();', '    DoubleStream asDoubleStream();');
        if (primitive === 'long')
            out.push('    DoubleStream asDoubleStream();');
        out.push('    static ' + S + ' empty() { return of(new ' + primitive + '[0]); }',
                 '    static ' + S + ' of(' + primitive + ' value) { return of(new ' + primitive + '[] { value }); }',
                 '    static ' + S + ' of(' + primitive + '... values) { return Arrays.stream(values); }',
                 '    static ' + S + ' iterate(' + primitive + ' seed, ' + P + 'UnaryOperator next) {',
                 '        return new ' + P + 'Pipeline(new ' + It + '() {',
                 '            private ' + primitive + ' current;',
                 '            private boolean started;',
                 '            public boolean hasNext() { return true; }',
                 '            public ' + primitive + ' ' + nextName + '() {',
                 '                current = started ? next.applyAs' + P + '(current) : seed;',
                 '                started = true;',
                 '                return current;',
                 '            }',
                 '        });',
                 '    }',
                 '    static ' + S + ' iterate(' + primitive + ' seed, ' + P + 'Predicate hasNext, ' + P + 'UnaryOperator next) {',
                 '        return new ' + P + 'Pipeline(new ' + It + '() {',
                 '            private ' + primitive + ' current;',
                 '            private boolean started;',
                 '            private boolean finished;',
                 '            private boolean ready;',
                 '            public boolean hasNext() {',
                 '                if (ready)',
                 '                    return true;',
                 '                if (finished)',
                 '                    return false;',
                 '                ' + primitive + ' candidate = started ? next.applyAs' + P + '(current) : seed;',
                 '                started = true;',
                 '                if (!hasNext.test(candidate)) {',
                 '                    finished = true;',
                 '                    return false;',
                 '                }',
                 '                current = candidate;',
                 '                ready = true;',
                 '                return true;',
                 '            }',
                 '            public ' + primitive + ' ' + nextName + '() {',
                 '                if (!hasNext())',
                 '                    throw new NoSuchElementException();',
                 '                ready = false;',
                 '                return current;',
                 '            }',
                 '        });',
                 '    }',
                 '    static ' + S + ' generate(' + P + 'Supplier supplier) {',
                 '        return new ' + P + 'Pipeline(new ' + It + '() {',
                 '            public boolean hasNext() { return true; }',
                 '            public ' + primitive + ' ' + nextName + '() { return supplier.getAs' + P + '(); }',
                 '        });',
                 '    }',
                 '    static ' + S + ' concat(' + S + ' a, ' + S + ' b) {',
                 '        ' + It + ' first = a.iterator();',
                 '        ' + It + ' second = b.iterator();',
                 '        return new ' + P + 'Pipeline(new ' + It + '() {',
                 '            public boolean hasNext() { return first.hasNext() || second.hasNext(); }',
                 '            public ' + primitive + ' ' + nextName + '() { return first.hasNext() ? first.' + nextName + '() : second.' + nextName + '(); }',
                 '        });',
                 '    }');
        if (primitive !== 'double') {
            out.push('    static ' + S + ' range(' + primitive + ' from, ' + primitive + ' to) {',
                     '        return new ' + P + 'Pipeline(new ' + It + '() {',
                     '            private ' + primitive + ' next = from;',
                     '            public boolean hasNext() { return next < to; }',
                     '            public ' + primitive + ' ' + nextName + '() {',
                     '                if (next >= to)',
                     '                    throw new NoSuchElementException();',
                     '                return next++;',
                     '            }',
                     '        });',
                     '    }',
                     '    static ' + S + ' rangeClosed(' + primitive + ' from, ' + primitive + ' to) {',
                     '        return new ' + P + 'Pipeline(new ' + It + '() {',
                     '            private ' + primitive + ' next = from;',
                     '            private boolean done = from > to;',
                     '            public boolean hasNext() { return !done; }',
                     '            public ' + primitive + ' ' + nextName + '() {',
                     '                if (done)',
                     '                    throw new NoSuchElementException();',
                     '                ' + primitive + ' value = next;',
                     '                if (value == to)',
                     '                    done = true;',
                     '                else',
                     '                    next++;',
                     '                return value;',
                     '            }',
                     '        });',
                     '    }');
        }
        out.push('}', '');

        // The pipeline.
        var C = P + 'Pipeline';
        out.push('final class ' + C + ' extends AbstractPipeline implements ' + S + ' {',
                 '    private final ' + It + ' source;',
                 '    ' + C + '(' + It + ' source) { this.source = source; }',
                 '    private ' + It + ' take() {',
                 '        link();',
                 '        return source;',
                 '    }',
                 '    private ' + S + ' chain(' + It + ' next) {',
                 '        ' + C + ' result = new ' + C + '(next);',
                 '        result.inherit(this);',
                 '        return result;',
                 '    }',
                 '    public ' + It + ' iterator() { return take(); }',
                 '    public ' + S + ' sequential() { return this; }',
                 '    public ' + S + ' parallel() { return this; }',
                 '    public ' + S + ' unordered() { return this; }',
                 '    public ' + S + ' onClose(Runnable handler) {',
                 '        addCloseHandler(handler);',
                 '        return this;',
                 '    }',
                 '    public ' + S + ' filter(' + P + 'Predicate predicate) {',
                 '        ' + It + ' it = take();',
                 '        return chain(new ' + It + '() {',
                 '            private ' + primitive + ' pending;',
                 '            private boolean ready;',
                 '            public boolean hasNext() {',
                 '                while (!ready && it.hasNext()) {',
                 '                    ' + primitive + ' value = it.' + nextName + '();',
                 '                    if (predicate.test(value)) {',
                 '                        pending = value;',
                 '                        ready = true;',
                 '                    }',
                 '                }',
                 '                return ready;',
                 '            }',
                 '            public ' + primitive + ' ' + nextName + '() {',
                 '                if (!hasNext())',
                 '                    throw new NoSuchElementException();',
                 '                ready = false;',
                 '                return pending;',
                 '            }',
                 '        });',
                 '    }',
                 '    public ' + S + ' map(' + P + 'UnaryOperator mapper) {',
                 '        ' + It + ' it = take();',
                 '        return chain(new ' + It + '() {',
                 '            public boolean hasNext() { return it.hasNext(); }',
                 '            public ' + primitive + ' ' + nextName + '() { return mapper.applyAs' + P + '(it.' + nextName + '()); }',
                 '        });',
                 '    }',
                 '    public <U> Stream<U> mapToObj(' + P + 'Function<? extends U> mapper) {',
                 '        ' + It + ' it = take();',
                 '        return StreamSupport.ofIterator(new Iterator<U>() {',
                 '            public boolean hasNext() { return it.hasNext(); }',
                 '            public U next() { return mapper.apply(it.' + nextName + '()); }',
                 '        });',
                 '    }');
        others.forEach(function (other) {
            var O = other.charAt(0).toUpperCase() + other.substring(1);
            out.push('    public ' + O + 'Stream mapTo' + O + '(' + P + 'To' + O + 'Function mapper) {',
                     '        ' + It + ' it = take();',
                     '        return new ' + O + 'Pipeline(new PrimitiveIterator.Of' + O + '() {',
                     '            public boolean hasNext() { return it.hasNext(); }',
                     '            public ' + other + ' next' + O + '() { return mapper.applyAs' + O + '(it.' + nextName + '()); }',
                     '        });',
                     '    }');
        });
        if (primitive === 'int')
            out.push('    public LongStream asLongStream() { return mapToLong(v -> (long) v); }',
                     '    public DoubleStream asDoubleStream() { return mapToDouble(v -> (double) v); }');
        if (primitive === 'long')
            out.push('    public DoubleStream asDoubleStream() { return mapToDouble(v -> (double) v); }');
        out.push('    public ' + S + ' flatMap(' + P + 'Function<? extends ' + S + '> mapper) {',
                 '        ' + It + ' it = take();',
                 '        return chain(new ' + It + '() {',
                 '            private ' + It + ' inner;',
                 '            public boolean hasNext() {',
                 '                while (inner == null || !inner.hasNext()) {',
                 '                    if (!it.hasNext())',
                 '                        return false;',
                 '                    ' + S + ' next = mapper.apply(it.' + nextName + '());',
                 '                    inner = next == null ? ' + S + '.empty().iterator() : next.iterator();',
                 '                }',
                 '                return true;',
                 '            }',
                 '            public ' + primitive + ' ' + nextName + '() {',
                 '                if (!hasNext())',
                 '                    throw new NoSuchElementException();',
                 '                return inner.' + nextName + '();',
                 '            }',
                 '        });',
                 '    }',
                 '    public ' + S + ' distinct() {',
                 '        ' + It + ' it = take();',
                 '        Set<' + Box + '> seen = new HashSet<>();',
                 '        return chain(new ' + It + '() {',
                 '            private ' + primitive + ' pending;',
                 '            private boolean ready;',
                 '            public boolean hasNext() {',
                 '                while (!ready && it.hasNext()) {',
                 '                    ' + primitive + ' value = it.' + nextName + '();',
                 '                    if (seen.add(value)) {',
                 '                        pending = value;',
                 '                        ready = true;',
                 '                    }',
                 '                }',
                 '                return ready;',
                 '            }',
                 '            public ' + primitive + ' ' + nextName + '() {',
                 '                if (!hasNext())',
                 '                    throw new NoSuchElementException();',
                 '                ready = false;',
                 '                return pending;',
                 '            }',
                 '        });',
                 '    }',
                 '    public ' + S + ' sorted() {',
                 '        ' + It + ' it = take();',
                 '        return chain(new ' + It + '() {',
                 '            private ' + primitive + '[] items;',
                 '            private int index;',
                 '            private void load() {',
                 '                if (items != null)',
                 '                    return;',
                 '                ' + primitive + '[] buffer = new ' + primitive + '[16];',
                 '                int size = 0;',
                 '                while (it.hasNext()) {',
                 '                    if (size == buffer.length)',
                 '                        buffer = Arrays.copyOf(buffer, size * 2);',
                 '                    buffer[size++] = it.' + nextName + '();',
                 '                }',
                 '                items = Arrays.copyOf(buffer, size);',
                 '                Arrays.sort(items);',
                 '            }',
                 '            public boolean hasNext() {',
                 '                load();',
                 '                return index < items.length;',
                 '            }',
                 '            public ' + primitive + ' ' + nextName + '() {',
                 '                if (!hasNext())',
                 '                    throw new NoSuchElementException();',
                 '                return items[index++];',
                 '            }',
                 '        });',
                 '    }',
                 '    public ' + S + ' peek(' + P + 'Consumer action) {',
                 '        ' + It + ' it = take();',
                 '        return chain(new ' + It + '() {',
                 '            public boolean hasNext() { return it.hasNext(); }',
                 '            public ' + primitive + ' ' + nextName + '() {',
                 '                ' + primitive + ' value = it.' + nextName + '();',
                 '                action.accept(value);',
                 '                return value;',
                 '            }',
                 '        });',
                 '    }',
                 '    public ' + S + ' limit(long maxSize) {',
                 '        if (maxSize < 0)',
                 '            throw new IllegalArgumentException(Long.toString(maxSize));',
                 '        ' + It + ' it = take();',
                 '        return chain(new ' + It + '() {',
                 '            private long count;',
                 '            public boolean hasNext() { return count < maxSize && it.hasNext(); }',
                 '            public ' + primitive + ' ' + nextName + '() {',
                 '                if (count >= maxSize)',
                 '                    throw new NoSuchElementException();',
                 '                count++;',
                 '                return it.' + nextName + '();',
                 '            }',
                 '        });',
                 '    }',
                 '    public ' + S + ' skip(long n) {',
                 '        if (n < 0)',
                 '            throw new IllegalArgumentException(Long.toString(n));',
                 '        ' + It + ' it = take();',
                 '        return chain(new ' + It + '() {',
                 '            private long skipped;',
                 '            public boolean hasNext() {',
                 '                while (skipped < n && it.hasNext()) {',
                 '                    it.' + nextName + '();',
                 '                    skipped++;',
                 '                }',
                 '                return it.hasNext();',
                 '            }',
                 '            public ' + primitive + ' ' + nextName + '() {',
                 '                if (!hasNext())',
                 '                    throw new NoSuchElementException();',
                 '                return it.' + nextName + '();',
                 '            }',
                 '        });',
                 '    }',
                 '    public ' + S + ' takeWhile(' + P + 'Predicate predicate) {',
                 '        ' + It + ' it = take();',
                 '        return chain(new ' + It + '() {',
                 '            private ' + primitive + ' pending;',
                 '            private boolean ready;',
                 '            private boolean done;',
                 '            public boolean hasNext() {',
                 '                if (!ready && !done && it.hasNext()) {',
                 '                    ' + primitive + ' value = it.' + nextName + '();',
                 '                    if (predicate.test(value)) {',
                 '                        pending = value;',
                 '                        ready = true;',
                 '                    } else {',
                 '                        done = true;',
                 '                    }',
                 '                }',
                 '                return ready;',
                 '            }',
                 '            public ' + primitive + ' ' + nextName + '() {',
                 '                if (!hasNext())',
                 '                    throw new NoSuchElementException();',
                 '                ready = false;',
                 '                return pending;',
                 '            }',
                 '        });',
                 '    }',
                 '    public ' + S + ' dropWhile(' + P + 'Predicate predicate) {',
                 '        ' + It + ' it = take();',
                 '        return chain(new ' + It + '() {',
                 '            private ' + primitive + ' pending;',
                 '            private boolean ready;',
                 '            private boolean dropping = true;',
                 '            public boolean hasNext() {',
                 '                while (!ready && it.hasNext()) {',
                 '                    ' + primitive + ' value = it.' + nextName + '();',
                 '                    if (dropping && predicate.test(value))',
                 '                        continue;',
                 '                    dropping = false;',
                 '                    pending = value;',
                 '                    ready = true;',
                 '                }',
                 '                return ready;',
                 '            }',
                 '            public ' + primitive + ' ' + nextName + '() {',
                 '                if (!hasNext())',
                 '                    throw new NoSuchElementException();',
                 '                ready = false;',
                 '                return pending;',
                 '            }',
                 '        });',
                 '    }',
                 '    public Stream<' + Box + '> boxed() { return mapToObj(v -> ' + Box + '.valueOf(v)); }',
                 '    public void forEach(' + P + 'Consumer action) {',
                 '        ' + It + ' it = take();',
                 '        while (it.hasNext())',
                 '            action.accept(it.' + nextName + '());',
                 '    }',
                 '    public void forEachOrdered(' + P + 'Consumer action) { forEach(action); }',
                 '    public ' + primitive + '[] toArray() {',
                 '        ' + It + ' it = take();',
                 '        ' + primitive + '[] buffer = new ' + primitive + '[16];',
                 '        int size = 0;',
                 '        while (it.hasNext()) {',
                 '            if (size == buffer.length)',
                 '                buffer = Arrays.copyOf(buffer, size * 2);',
                 '            buffer[size++] = it.' + nextName + '();',
                 '        }',
                 '        return Arrays.copyOf(buffer, size);',
                 '    }',
                 '    public ' + primitive + ' reduce(' + primitive + ' identity, ' + P + 'BinaryOperator op) {',
                 '        ' + It + ' it = take();',
                 '        ' + primitive + ' result = identity;',
                 '        while (it.hasNext())',
                 '            result = op.applyAs' + P + '(result, it.' + nextName + '());',
                 '        return result;',
                 '    }',
                 '    public Optional' + P + ' reduce(' + P + 'BinaryOperator op) {',
                 '        ' + It + ' it = take();',
                 '        if (!it.hasNext())',
                 '            return Optional' + P + '.empty();',
                 '        ' + primitive + ' result = it.' + nextName + '();',
                 '        while (it.hasNext())',
                 '            result = op.applyAs' + P + '(result, it.' + nextName + '());',
                 '        return Optional' + P + '.of(result);',
                 '    }',
                 '    public <R> R collect(Supplier<R> supplier, Obj' + P + 'Consumer<R> accumulator, BiConsumer<R, R> combiner) {',
                 '        ' + It + ' it = take();',
                 '        R container = supplier.get();',
                 '        while (it.hasNext())',
                 '            accumulator.accept(container, it.' + nextName + '());',
                 '        return container;',
                 '    }');
        if (primitive === 'double') {
            out.push('    public double sum() {',
                     '        ' + It + ' it = take();',
                     '        double[] state = new double[3];',
                     '        while (it.hasNext()) {',
                     '            double value = it.nextDouble();',
                     '            StreamSupport.sumWithCompensation(state, value);',
                     '            state[2] += value;',
                     '        }',
                     '        return StreamSupport.computeFinalSum(state);',
                     '    }',
                     '    public OptionalDouble average() {',
                     '        ' + It + ' it = take();',
                     '        double[] state = new double[4];',
                     '        while (it.hasNext()) {',
                     '            double value = it.nextDouble();',
                     '            state[2]++;',
                     '            StreamSupport.sumWithCompensation(state, value);',
                     '            state[3] += value;',
                     '        }',
                     '        return state[2] > 0 ? OptionalDouble.of(StreamSupport.computeFinalSum(new double[] { state[0], state[1], state[3] }) / state[2])',
                     '                            : OptionalDouble.empty();',
                     '    }');
        } else {
            out.push('    public ' + primitive + ' sum() { return reduce(0, (a, b) -> a + b); }',
                     '    public OptionalDouble average() {',
                     '        ' + It + ' it = take();',
                     '        long count = 0;',
                     '        long sum = 0;',
                     '        while (it.hasNext()) {',
                     '            sum += it.' + nextName + '();',
                     '            count++;',
                     '        }',
                     '        return count > 0 ? OptionalDouble.of((double) sum / count) : OptionalDouble.empty();',
                     '    }');
        }
        out.push('    public Optional' + P + ' min() { return reduce((a, b) -> Math.min(a, b)); }',
                 '    public Optional' + P + ' max() { return reduce((a, b) -> Math.max(a, b)); }',
                 '    public long count() {',
                 '        ' + It + ' it = take();',
                 '        long count = 0;',
                 '        while (it.hasNext()) {',
                 '            it.' + nextName + '();',
                 '            count++;',
                 '        }',
                 '        return count;',
                 '    }',
                 '    public ' + P + 'SummaryStatistics summaryStatistics() {',
                 '        ' + P + 'SummaryStatistics statistics = new ' + P + 'SummaryStatistics();',
                 '        forEach(value -> statistics.accept(value));',
                 '        return statistics;',
                 '    }',
                 '    public boolean anyMatch(' + P + 'Predicate predicate) {',
                 '        ' + It + ' it = take();',
                 '        while (it.hasNext())',
                 '            if (predicate.test(it.' + nextName + '()))',
                 '                return true;',
                 '        return false;',
                 '    }',
                 '    public boolean allMatch(' + P + 'Predicate predicate) {',
                 '        ' + It + ' it = take();',
                 '        while (it.hasNext())',
                 '            if (!predicate.test(it.' + nextName + '()))',
                 '                return false;',
                 '        return true;',
                 '    }',
                 '    public boolean noneMatch(' + P + 'Predicate predicate) { return !anyMatch(predicate); }',
                 '    public Optional' + P + ' findFirst() {',
                 '        ' + It + ' it = take();',
                 '        return it.hasNext() ? Optional' + P + '.of(it.' + nextName + '()) : Optional' + P + '.empty();',
                 '    }',
                 '    public Optional' + P + ' findAny() { return findFirst(); }',
                 '}', '');
        return out.join('\n') + '\n';
    }

    Java.addLibrary('java.util.stream.collectors', 'java.util.stream', HEADER + String.raw`
public interface Collector<T, A, R> {
    Supplier<A> supplier();
    BiConsumer<A, T> accumulator();
    BinaryOperator<A> combiner();
    Function<A, R> finisher();
    Set<Collector.Characteristics> characteristics();

    enum Characteristics { CONCURRENT, UNORDERED, IDENTITY_FINISH }

    static <T, R> Collector<T, R, R> of(Supplier<R> supplier, BiConsumer<R, T> accumulator, BinaryOperator<R> combiner,
                                        Collector.Characteristics... characteristics) {
        return new Collectors.CollectorImpl<T, R, R>(supplier, accumulator, combiner, x -> x);
    }
    static <T, A, R> Collector<T, A, R> of(Supplier<A> supplier, BiConsumer<A, T> accumulator, BinaryOperator<A> combiner,
                                           Function<A, R> finisher, Collector.Characteristics... characteristics) {
        return new Collectors.CollectorImpl<T, A, R>(supplier, accumulator, combiner, finisher);
    }
}

// The containers inside are Object: generics outside, as in the JDK.
public final class Collectors {
    private Collectors() {}

    static final class CollectorImpl<T, A, R> implements Collector<T, A, R> {
        private final Supplier<A> supplier;
        private final BiConsumer<A, T> accumulator;
        private final BinaryOperator<A> combiner;
        private final Function<A, R> finisher;
        CollectorImpl(Supplier<A> supplier, BiConsumer<A, T> accumulator, BinaryOperator<A> combiner, Function<A, R> finisher) {
            this.supplier = supplier;
            this.accumulator = accumulator;
            this.combiner = combiner;
            this.finisher = finisher;
        }
        public Supplier<A> supplier() { return supplier; }
        public BiConsumer<A, T> accumulator() { return accumulator; }
        public BinaryOperator<A> combiner() { return combiner; }
        public Function<A, R> finisher() { return finisher; }
        public Set<Collector.Characteristics> characteristics() { return Collections.emptySet(); }
    }

    // A collector with an Object container.
    private static <T, R> Collector<T, ?, R> make(Supplier<Object> supplier, BiConsumer<Object, Object> accumulator,
                                                    Function<Object, Object> finisher) {
        return (Collector<T, ?, R>) (Collector) new CollectorImpl<Object, Object, Object>(supplier, accumulator, (a, b) -> a, finisher);
    }
    private static Supplier<Object> supplierOf(Collector<?, ?, ?> collector) { return (Supplier<Object>) (Supplier) collector.supplier(); }
    private static BiConsumer<Object, Object> accumulatorOf(Collector<?, ?, ?> collector) {
        return (BiConsumer<Object, Object>) (BiConsumer) collector.accumulator();
    }
    private static Function<Object, Object> finisherOf(Collector<?, ?, ?> collector) {
        return (Function<Object, Object>) (Function) collector.finisher();
    }

    public static <T> Collector<T, ?, List<T>> toList() {
        return make(() -> new ArrayList<Object>(), (list, item) -> ((List<Object>) list).add(item), x -> x);
    }
    public static <T> Collector<T, ?, List<T>> toUnmodifiableList() {
        return make(() -> new ArrayList<Object>(), (list, item) -> ((List<Object>) list).add(Objects.requireNonNull(item)),
                    list -> Collections.unmodifiableList((List<Object>) list));
    }
    public static <T> Collector<T, ?, Set<T>> toSet() {
        return make(() -> new HashSet<Object>(), (set, item) -> ((Set<Object>) set).add(item), x -> x);
    }
    public static <T> Collector<T, ?, Set<T>> toUnmodifiableSet() {
        return make(() -> new HashSet<Object>(), (set, item) -> ((Set<Object>) set).add(Objects.requireNonNull(item)),
                    set -> Collections.unmodifiableSet((Set<Object>) set));
    }
    public static <T, C extends Collection<T>> Collector<T, ?, C> toCollection(Supplier<C> factory) {
        return make(() -> factory.get(), (c, item) -> ((Collection<Object>) c).add(item), x -> x);
    }
    public static Collector<CharSequence, ?, String> joining() { return joining("", "", ""); }
    public static Collector<CharSequence, ?, String> joining(CharSequence delimiter) { return joining(delimiter, "", ""); }
    public static Collector<CharSequence, ?, String> joining(CharSequence delimiter, CharSequence prefix, CharSequence suffix) {
        return make(() -> new StringJoiner(delimiter, prefix, suffix), (joiner, item) -> ((StringJoiner) joiner).add((CharSequence) item),
                    joiner -> joiner.toString());
    }
    public static <T> Collector<T, ?, Long> counting() {
        return make(() -> new long[1], (box, item) -> ((long[]) box)[0]++, box -> ((long[]) box)[0]);
    }
    public static <T> Collector<T, ?, Integer> summingInt(ToIntFunction<? super T> mapper) {
        return make(() -> new int[1], (box, item) -> ((int[]) box)[0] += mapper.applyAsInt((T) item), box -> ((int[]) box)[0]);
    }
    public static <T> Collector<T, ?, Long> summingLong(ToLongFunction<? super T> mapper) {
        return make(() -> new long[1], (box, item) -> ((long[]) box)[0] += mapper.applyAsLong((T) item), box -> ((long[]) box)[0]);
    }
    public static <T> Collector<T, ?, Double> summingDouble(ToDoubleFunction<? super T> mapper) {
        return make(() -> new double[3], (box, item) -> {
            double value = mapper.applyAsDouble((T) item);
            StreamSupport.sumWithCompensation((double[]) box, value);
            ((double[]) box)[2] += value;
        }, box -> StreamSupport.computeFinalSum((double[]) box));
    }
    public static <T> Collector<T, ?, Double> averagingInt(ToIntFunction<? super T> mapper) {
        return make(() -> new long[2], (box, item) -> {
            ((long[]) box)[0] += mapper.applyAsInt((T) item);
            ((long[]) box)[1]++;
        }, box -> ((long[]) box)[1] == 0 ? 0.0d : (double) ((long[]) box)[0] / ((long[]) box)[1]);
    }
    public static <T> Collector<T, ?, Double> averagingLong(ToLongFunction<? super T> mapper) {
        return make(() -> new long[2], (box, item) -> {
            ((long[]) box)[0] += mapper.applyAsLong((T) item);
            ((long[]) box)[1]++;
        }, box -> ((long[]) box)[1] == 0 ? 0.0d : (double) ((long[]) box)[0] / ((long[]) box)[1]);
    }
    public static <T> Collector<T, ?, Double> averagingDouble(ToDoubleFunction<? super T> mapper) {
        return make(() -> new double[4], (box, item) -> {
            double value = mapper.applyAsDouble((T) item);
            StreamSupport.sumWithCompensation((double[]) box, value);
            ((double[]) box)[2]++;
            ((double[]) box)[3] += value;
        }, box -> {
            double[] state = (double[]) box;
            return state[2] == 0 ? 0.0d : StreamSupport.computeFinalSum(new double[] { state[0], state[1], state[3] }) / state[2];
        });
    }
    public static <T> Collector<T, ?, IntSummaryStatistics> summarizingInt(ToIntFunction<? super T> mapper) {
        return make(() -> new IntSummaryStatistics(), (stats, item) -> ((IntSummaryStatistics) stats).accept(mapper.applyAsInt((T) item)), x -> x);
    }
    public static <T> Collector<T, ?, LongSummaryStatistics> summarizingLong(ToLongFunction<? super T> mapper) {
        return make(() -> new LongSummaryStatistics(), (stats, item) -> ((LongSummaryStatistics) stats).accept(mapper.applyAsLong((T) item)), x -> x);
    }
    public static <T> Collector<T, ?, DoubleSummaryStatistics> summarizingDouble(ToDoubleFunction<? super T> mapper) {
        return make(() -> new DoubleSummaryStatistics(), (stats, item) -> ((DoubleSummaryStatistics) stats).accept(mapper.applyAsDouble((T) item)), x -> x);
    }
    public static <T> Collector<T, ?, Optional<T>> minBy(Comparator<? super T> comparator) {
        return reducing((a, b) -> comparator.compare(a, b) <= 0 ? a : b);
    }
    public static <T> Collector<T, ?, Optional<T>> maxBy(Comparator<? super T> comparator) {
        return reducing((a, b) -> comparator.compare(a, b) >= 0 ? a : b);
    }
    public static <T> Collector<T, ?, Optional<T>> reducing(BinaryOperator<T> op) {
        return make(() -> new Object[2], (box, item) -> {
            Object[] state = (Object[]) box;
            if (state[1] == null) {
                state[0] = item;
                state[1] = Boolean.TRUE;
            } else {
                state[0] = op.apply((T) state[0], (T) item);
            }
        }, box -> ((Object[]) box)[1] == null ? Optional.empty() : Optional.of(((Object[]) box)[0]));
    }
    public static <T> Collector<T, ?, T> reducing(T identity, BinaryOperator<T> op) {
        return make(() -> new Object[] { identity }, (box, item) -> ((Object[]) box)[0] = op.apply((T) ((Object[]) box)[0], (T) item),
                    box -> ((Object[]) box)[0]);
    }
    public static <T, U> Collector<T, ?, U> reducing(U identity, Function<? super T, ? extends U> mapper, BinaryOperator<U> op) {
        return make(() -> new Object[] { identity },
                    (box, item) -> ((Object[]) box)[0] = op.apply((U) ((Object[]) box)[0], mapper.apply((T) item)),
                    box -> ((Object[]) box)[0]);
    }
    public static <T, U, A, R> Collector<T, ?, R> mapping(Function<? super T, ? extends U> mapper, Collector<? super U, A, R> downstream) {
        BiConsumer<Object, Object> accumulator = accumulatorOf(downstream);
        return make(supplierOf(downstream), (box, item) -> accumulator.accept(box, mapper.apply((T) item)), finisherOf(downstream));
    }
    public static <T, A, R> Collector<T, ?, R> filtering(Predicate<? super T> predicate, Collector<? super T, A, R> downstream) {
        BiConsumer<Object, Object> accumulator = accumulatorOf(downstream);
        return make(supplierOf(downstream), (box, item) -> {
            if (predicate.test((T) item))
                accumulator.accept(box, item);
        }, finisherOf(downstream));
    }
    public static <T, U, A, R> Collector<T, ?, R> flatMapping(Function<? super T, ? extends Stream<? extends U>> mapper,
                                                              Collector<? super U, A, R> downstream) {
        BiConsumer<Object, Object> accumulator = accumulatorOf(downstream);
        return make(supplierOf(downstream), (box, item) -> {
            Stream<? extends U> stream = mapper.apply((T) item);
            if (stream != null)
                stream.forEach(value -> accumulator.accept(box, value));
        }, finisherOf(downstream));
    }
    public static <T, A, R, RR> Collector<T, A, RR> collectingAndThen(Collector<T, A, R> downstream, Function<R, RR> finisher) {
        Function<Object, Object> first = finisherOf(downstream);
        return (Collector<T, A, RR>) (Collector) make(supplierOf(downstream), accumulatorOf(downstream),
                                                      box -> finisher.apply((R) first.apply(box)));
    }
    public static <T, K> Collector<T, ?, Map<K, List<T>>> groupingBy(Function<? super T, ? extends K> classifier) {
        return groupingBy(classifier, () -> new HashMap<K, List<T>>(), toList());
    }
    public static <T, K, A, D> Collector<T, ?, Map<K, D>> groupingBy(Function<? super T, ? extends K> classifier,
                                                                    Collector<? super T, A, D> downstream) {
        return groupingBy(classifier, () -> new HashMap<K, D>(), downstream);
    }
    public static <T, K, D, A, M extends Map<K, D>> Collector<T, ?, M> groupingBy(Function<? super T, ? extends K> classifier,
                                                                                 Supplier<M> mapFactory,
                                                                                 Collector<? super T, A, D> downstream) {
        Supplier<Object> downstreamSupplier = supplierOf(downstream);
        BiConsumer<Object, Object> downstreamAccumulator = accumulatorOf(downstream);
        Function<Object, Object> downstreamFinisher = finisherOf(downstream);
        return make(() -> mapFactory.get(), (box, item) -> {
            Map<Object, Object> map = (Map<Object, Object>) box;
            Object key = Objects.requireNonNull(classifier.apply((T) item), "element cannot be mapped to a null key");
            Object container = map.computeIfAbsent(key, k -> downstreamSupplier.get());
            downstreamAccumulator.accept(container, item);
        }, box -> {
            Map<Object, Object> map = (Map<Object, Object>) box;
            map.replaceAll((k, v) -> downstreamFinisher.apply(v));
            return map;
        });
    }
    public static <T> Collector<T, ?, Map<Boolean, List<T>>> partitioningBy(Predicate<? super T> predicate) {
        return partitioningBy(predicate, toList());
    }
    public static <T, D, A> Collector<T, ?, Map<Boolean, D>> partitioningBy(Predicate<? super T> predicate,
                                                                           Collector<? super T, A, D> downstream) {
        Supplier<Object> downstreamSupplier = supplierOf(downstream);
        BiConsumer<Object, Object> downstreamAccumulator = accumulatorOf(downstream);
        Function<Object, Object> downstreamFinisher = finisherOf(downstream);
        return make(() -> new Object[] { downstreamSupplier.get(), downstreamSupplier.get() }, (box, item) -> {
            Object[] parts = (Object[]) box;
            downstreamAccumulator.accept(predicate.test((T) item) ? parts[1] : parts[0], item);
        }, box -> {
            Object[] parts = (Object[]) box;
            Map<Boolean, Object> map = new LinkedHashMap<>();
            map.put(false, downstreamFinisher.apply(parts[0]));
            map.put(true, downstreamFinisher.apply(parts[1]));
            return new Partition(map);
        });
    }
    // The map of partitioningBy prints as in the JDK: {false=..., true=...}.
    static final class Partition extends AbstractMap<Boolean, Object> {
        private final Map<Boolean, Object> map;
        Partition(Map<Boolean, Object> map) { this.map = map; }
        public Set<Map.Entry<Boolean, Object>> entrySet() { return map.entrySet(); }
        public Object get(Object key) { return map.get(key); }
        public boolean containsKey(Object key) { return key instanceof Boolean; }
    }
    public static <T, K, U> Collector<T, ?, Map<K, U>> toMap(Function<? super T, ? extends K> keyMapper,
                                                            Function<? super T, ? extends U> valueMapper) {
        return make(() -> new HashMap<Object, Object>(), (box, item) -> {
            Map<Object, Object> map = (Map<Object, Object>) box;
            Object key = keyMapper.apply((T) item);
            Object value = Objects.requireNonNull(valueMapper.apply((T) item));
            Object existing = map.putIfAbsent(key, value);
            if (existing != null)
                throw new IllegalStateException("Duplicate key " + key + " (attempted merging values " + existing + " and " + value + ")");
        }, x -> x);
    }
    public static <T, K, U> Collector<T, ?, Map<K, U>> toMap(Function<? super T, ? extends K> keyMapper,
                                                            Function<? super T, ? extends U> valueMapper,
                                                            BinaryOperator<U> merge) {
        return toMap(keyMapper, valueMapper, merge, () -> new HashMap<K, U>());
    }
    public static <T, K, U, M extends Map<K, U>> Collector<T, ?, M> toMap(Function<? super T, ? extends K> keyMapper,
                                                                         Function<? super T, ? extends U> valueMapper,
                                                                         BinaryOperator<U> merge, Supplier<M> mapFactory) {
        return make(() -> mapFactory.get(), (box, item) -> {
            Map<K, U> map = (Map<K, U>) box;
            map.merge(keyMapper.apply((T) item), valueMapper.apply((T) item), merge);
        }, x -> x);
    }
    public static <T, K, U> Collector<T, ?, Map<K, U>> toUnmodifiableMap(Function<? super T, ? extends K> keyMapper,
                                                                        Function<? super T, ? extends U> valueMapper) {
        return collectingAndThen((Collector<T, Object, Map<K, U>>) (Collector) toMap(keyMapper, valueMapper),
                                 map -> Collections.unmodifiableMap(map));
    }
    public static <T, R1, R2, R> Collector<T, ?, R> teeing(Collector<? super T, ?, R1> first, Collector<? super T, ?, R2> second,
                                                          BiFunction<? super R1, ? super R2, R> merger) {
        Supplier<Object> firstSupplier = supplierOf(first), secondSupplier = supplierOf(second);
        BiConsumer<Object, Object> firstAccumulator = accumulatorOf(first), secondAccumulator = accumulatorOf(second);
        Function<Object, Object> firstFinisher = finisherOf(first), secondFinisher = finisherOf(second);
        return make(() -> new Object[] { firstSupplier.get(), secondSupplier.get() }, (box, item) -> {
            firstAccumulator.accept(((Object[]) box)[0], item);
            secondAccumulator.accept(((Object[]) box)[1], item);
        }, box -> merger.apply((R1) firstFinisher.apply(((Object[]) box)[0]), (R2) secondFinisher.apply(((Object[]) box)[1])));
    }
}
`);
})(globalThis);
