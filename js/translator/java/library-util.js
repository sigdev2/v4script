// Java: the java.util library - the base: iterators, Comparator, Objects,
// Optional, exceptions. Collections are in library-collections.js.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Java = T.java;
    if (Java.library.units['java.util.base'])
        return;

    Java.addLibrary('java.util.base', 'java.util', String.raw`
public interface Iterator<E> {
    boolean hasNext();
    E next();
    default void remove() { throw new UnsupportedOperationException("remove"); }
    default void forEachRemaining(java.util.function.Consumer<? super E> action) {
        while (hasNext())
            action.accept(next());
    }
}

public interface ListIterator<E> extends Iterator<E> {
    boolean hasPrevious();
    E previous();
    int nextIndex();
    int previousIndex();
    void set(E element);
    void add(E element);
}

public final class Objects {
    private Objects() {}
    public static boolean equals(Object a, Object b) { return a == b || (a != null && a.equals(b)); }
    public static int hashCode(Object value) { return value != null ? value.hashCode() : 0; }
    public static int hash(Object... values) { return Arrays.hashCode(values); }
    public static String toString(Object value) { return String.valueOf(value); }
    public static String toString(Object value, String nullDefault) { return value != null ? value.toString() : nullDefault; }
    public static boolean isNull(Object value) { return value == null; }
    public static boolean nonNull(Object value) { return value != null; }
    public static <T> T requireNonNull(T value) {
        if (value == null)
            throw new NullPointerException();
        return value;
    }
    public static <T> T requireNonNull(T value, String message) {
        if (value == null)
            throw new NullPointerException(message);
        return value;
    }
    public static <T> T requireNonNullElse(T value, T defaultValue) {
        if (value != null)
            return value;
        return requireNonNull(defaultValue, "defaultValue");
    }
    public static <T> T requireNonNullElseGet(T value, java.util.function.Supplier<? extends T> supplier) {
        return value != null ? value : requireNonNull(supplier.get(), "supplier.get()");
    }
    public static <T> T requireNonNull(T value, java.util.function.Supplier<String> message) {
        if (value == null)
            throw new NullPointerException(message.get());
        return value;
    }
    public static boolean deepEquals(Object a, Object b) {
        if (a == b)
            return true;
        if (a == null || b == null)
            return false;
        if (a instanceof Object[] x && b instanceof Object[] y)
            return Arrays.deepEquals(x, y);
        if (a instanceof int[] x && b instanceof int[] y)
            return Arrays.equals(x, y);
        if (a instanceof long[] x && b instanceof long[] y)
            return Arrays.equals(x, y);
        if (a instanceof double[] x && b instanceof double[] y)
            return Arrays.equals(x, y);
        if (a instanceof char[] x && b instanceof char[] y)
            return Arrays.equals(x, y);
        if (a instanceof boolean[] x && b instanceof boolean[] y)
            return Arrays.equals(x, y);
        if (a instanceof byte[] x && b instanceof byte[] y)
            return Arrays.equals(x, y);
        if (a instanceof short[] x && b instanceof short[] y)
            return Arrays.equals(x, y);
        if (a instanceof float[] x && b instanceof float[] y)
            return Arrays.equals(x, y);
        return a.equals(b);
    }
    public static <T> int compare(T a, T b, Comparator<? super T> comparator) { return a == b ? 0 : comparator.compare(a, b); }
    public static int checkIndex(int index, int length) {
        if (index < 0 || index >= length)
            throw new IndexOutOfBoundsException("Index " + index + " out of bounds for length " + length);
        return index;
    }
}
`);
    Java.addLibrary('java.util.comparator', 'java.util', String.raw`
public interface Comparator<T> {
    int compare(T a, T b);
    default Comparator<T> reversed() { return (a, b) -> compare(b, a); }
    default Comparator<T> thenComparing(Comparator<? super T> other) {
        return (a, b) -> {
            int result = compare(a, b);
            return result != 0 ? result : other.compare(a, b);
        };
    }
    default <U extends Comparable<? super U>> Comparator<T> thenComparing(java.util.function.Function<? super T, ? extends U> key) {
        return thenComparing(comparing(key));
    }
    default <U> Comparator<T> thenComparing(java.util.function.Function<? super T, ? extends U> key, Comparator<? super U> keyComparator) {
        return thenComparing(comparing(key, keyComparator));
    }
    default Comparator<T> thenComparingInt(java.util.function.ToIntFunction<? super T> key) { return thenComparing(comparingInt(key)); }
    default Comparator<T> thenComparingLong(java.util.function.ToLongFunction<? super T> key) { return thenComparing(comparingLong(key)); }
    default Comparator<T> thenComparingDouble(java.util.function.ToDoubleFunction<? super T> key) { return thenComparing(comparingDouble(key)); }
    static <T, U extends Comparable<? super U>> Comparator<T> comparing(java.util.function.Function<? super T, ? extends U> key) {
        return (a, b) -> key.apply(a).compareTo(key.apply(b));
    }
    static <T, U> Comparator<T> comparing(java.util.function.Function<? super T, ? extends U> key, Comparator<? super U> keyComparator) {
        return (a, b) -> keyComparator.compare(key.apply(a), key.apply(b));
    }
    static <T> Comparator<T> comparingInt(java.util.function.ToIntFunction<? super T> key) {
        return (a, b) -> Integer.compare(key.applyAsInt(a), key.applyAsInt(b));
    }
    static <T> Comparator<T> comparingLong(java.util.function.ToLongFunction<? super T> key) {
        return (a, b) -> Long.compare(key.applyAsLong(a), key.applyAsLong(b));
    }
    static <T> Comparator<T> comparingDouble(java.util.function.ToDoubleFunction<? super T> key) {
        return (a, b) -> Double.compare(key.applyAsDouble(a), key.applyAsDouble(b));
    }
    static <T extends Comparable<? super T>> Comparator<T> naturalOrder() { return (a, b) -> a.compareTo(b); }
    static <T extends Comparable<? super T>> Comparator<T> reverseOrder() { return (a, b) -> b.compareTo(a); }
    static <T> Comparator<T> nullsFirst(Comparator<? super T> comparator) {
        return (a, b) -> a == null ? (b == null ? 0 : -1) : (b == null ? 1 : comparator.compare(a, b));
    }
    static <T> Comparator<T> nullsLast(Comparator<? super T> comparator) {
        return (a, b) -> a == null ? (b == null ? 0 : 1) : (b == null ? -1 : comparator.compare(a, b));
    }
}
`);

    Java.addLibrary('java.util.primitive', 'java.util', String.raw`
public interface PrimitiveIterator<T, C> extends Iterator<T> {
    interface OfInt extends PrimitiveIterator<Integer, java.util.function.IntConsumer> {
        int nextInt();
        default Integer next() { return nextInt(); }
        default void forEachRemaining(java.util.function.IntConsumer action) {
            while (hasNext())
                action.accept(nextInt());
        }
    }
    interface OfLong extends PrimitiveIterator<Long, java.util.function.LongConsumer> {
        long nextLong();
        default Long next() { return nextLong(); }
    }
    interface OfDouble extends PrimitiveIterator<Double, java.util.function.DoubleConsumer> {
        double nextDouble();
        default Double next() { return nextDouble(); }
    }
}
`);

    Java.addLibrary('java.util.optional', 'java.util', String.raw`
public final class Optional<T> {
    private static final Optional<?> EMPTY = new Optional<>(null);
    private final T value;
    private Optional(T value) { this.value = value; }
    public static <T> Optional<T> empty() { return (Optional<T>) EMPTY; }
    public static <T> Optional<T> of(T value) { return new Optional<>(Objects.requireNonNull(value)); }
    public static <T> Optional<T> ofNullable(T value) { return value == null ? (Optional<T>) EMPTY : new Optional<>(value); }
    public T get() {
        if (value == null)
            throw new NoSuchElementException("No value present");
        return value;
    }
    public boolean isPresent() { return value != null; }
    public boolean isEmpty() { return value == null; }
    public void ifPresent(java.util.function.Consumer<? super T> action) {
        if (value != null)
            action.accept(value);
    }
    public void ifPresentOrElse(java.util.function.Consumer<? super T> action, Runnable emptyAction) {
        if (value != null)
            action.accept(value);
        else
            emptyAction.run();
    }
    public Optional<T> filter(java.util.function.Predicate<? super T> predicate) {
        Objects.requireNonNull(predicate);
        return value == null || predicate.test(value) ? this : empty();
    }
    public <U> Optional<U> map(java.util.function.Function<? super T, ? extends U> mapper) {
        Objects.requireNonNull(mapper);
        return value == null ? empty() : Optional.ofNullable(mapper.apply(value));
    }
    public <U> Optional<U> flatMap(java.util.function.Function<? super T, ? extends Optional<? extends U>> mapper) {
        Objects.requireNonNull(mapper);
        if (value == null)
            return empty();
        return (Optional<U>) Objects.requireNonNull(mapper.apply(value));
    }
    public Optional<T> or(java.util.function.Supplier<? extends Optional<? extends T>> supplier) {
        return value != null ? this : (Optional<T>) Objects.requireNonNull(supplier.get());
    }
    public java.util.stream.Stream<T> stream() { return value == null ? java.util.stream.Stream.empty() : java.util.stream.Stream.of(value); }
    public T orElse(T other) { return value != null ? value : other; }
    public T orElseGet(java.util.function.Supplier<? extends T> supplier) { return value != null ? value : supplier.get(); }
    public T orElseThrow() {
        if (value == null)
            throw new NoSuchElementException("No value present");
        return value;
    }
    public <X extends Throwable> T orElseThrow(java.util.function.Supplier<? extends X> exceptionSupplier) throws X {
        if (value == null)
            throw exceptionSupplier.get();
        return value;
    }
    public boolean equals(Object other) {
        if (this == other)
            return true;
        return other instanceof Optional<?> o && Objects.equals(value, o.value);
    }
    public int hashCode() { return Objects.hashCode(value); }
    public String toString() { return value != null ? "Optional[" + value + "]" : "Optional.empty"; }
}

public final class OptionalInt {
    private static final OptionalInt EMPTY = new OptionalInt(false, 0);
    private final boolean present;
    private final int value;
    private OptionalInt(boolean present, int value) {
        this.present = present;
        this.value = value;
    }
    public static OptionalInt empty() { return EMPTY; }
    public static OptionalInt of(int value) { return new OptionalInt(true, value); }
    public int getAsInt() {
        if (!present)
            throw new NoSuchElementException("No value present");
        return value;
    }
    public boolean isPresent() { return present; }
    public boolean isEmpty() { return !present; }
    public void ifPresent(java.util.function.IntConsumer action) {
        if (present)
            action.accept(value);
    }
    public void ifPresentOrElse(java.util.function.IntConsumer action, Runnable emptyAction) {
        if (present)
            action.accept(value);
        else
            emptyAction.run();
    }
    public int orElse(int other) { return present ? value : other; }
    public int orElseGet(java.util.function.IntSupplier supplier) { return present ? value : supplier.getAsInt(); }
    public int orElseThrow() { return getAsInt(); }
    public <X extends Throwable> int orElseThrow(java.util.function.Supplier<? extends X> exceptionSupplier) throws X {
        if (!present)
            throw exceptionSupplier.get();
        return value;
    }
    public boolean equals(Object other) {
        return other instanceof OptionalInt o && (present && o.present ? value == o.value : present == o.present);
    }
    public int hashCode() { return present ? value : 0; }
    public String toString() { return present ? "OptionalInt[" + value + "]" : "OptionalInt.empty"; }
}

public final class OptionalLong {
    private static final OptionalLong EMPTY = new OptionalLong(false, 0);
    private final boolean present;
    private final long value;
    private OptionalLong(boolean present, long value) {
        this.present = present;
        this.value = value;
    }
    public static OptionalLong empty() { return EMPTY; }
    public static OptionalLong of(long value) { return new OptionalLong(true, value); }
    public long getAsLong() {
        if (!present)
            throw new NoSuchElementException("No value present");
        return value;
    }
    public boolean isPresent() { return present; }
    public boolean isEmpty() { return !present; }
    public void ifPresent(java.util.function.LongConsumer action) {
        if (present)
            action.accept(value);
    }
    public long orElse(long other) { return present ? value : other; }
    public long orElseThrow() { return getAsLong(); }
    public boolean equals(Object other) {
        return other instanceof OptionalLong o && (present && o.present ? value == o.value : present == o.present);
    }
    public int hashCode() { return present ? Long.hashCode(value) : 0; }
    public String toString() { return present ? "OptionalLong[" + value + "]" : "OptionalLong.empty"; }
}

public final class OptionalDouble {
    private static final OptionalDouble EMPTY = new OptionalDouble(false, 0);
    private final boolean present;
    private final double value;
    private OptionalDouble(boolean present, double value) {
        this.present = present;
        this.value = value;
    }
    public static OptionalDouble empty() { return EMPTY; }
    public static OptionalDouble of(double value) { return new OptionalDouble(true, value); }
    public double getAsDouble() {
        if (!present)
            throw new NoSuchElementException("No value present");
        return value;
    }
    public boolean isPresent() { return present; }
    public boolean isEmpty() { return !present; }
    public void ifPresent(java.util.function.DoubleConsumer action) {
        if (present)
            action.accept(value);
    }
    public double orElse(double other) { return present ? value : other; }
    public double orElseGet(java.util.function.DoubleSupplier supplier) { return present ? value : supplier.getAsDouble(); }
    public double orElseThrow() { return getAsDouble(); }
    public boolean equals(Object other) {
        return other instanceof OptionalDouble o && (present && o.present ? Double.compare(value, o.value) == 0 : present == o.present);
    }
    public int hashCode() { return present ? Double.hashCode(value) : 0; }
    public String toString() { return present ? "OptionalDouble[" + value + "]" : "OptionalDouble.empty"; }
}
`);

    Java.addLibrary('java.util.statistics', 'java.util', String.raw`
public class IntSummaryStatistics implements java.util.function.IntConsumer {
    private long count;
    private long sum;
    private int min = Integer.MAX_VALUE;
    private int max = Integer.MIN_VALUE;
    public IntSummaryStatistics() {}
    public void accept(int value) {
        ++count;
        sum += value;
        min = Math.min(min, value);
        max = Math.max(max, value);
    }
    public void combine(IntSummaryStatistics other) {
        count += other.count;
        sum += other.sum;
        min = Math.min(min, other.min);
        max = Math.max(max, other.max);
    }
    public final long getCount() { return count; }
    public final long getSum() { return sum; }
    public final int getMin() { return min; }
    public final int getMax() { return max; }
    public final double getAverage() { return count > 0 ? (double) sum / count : 0.0d; }
    public String toString() {
        return String.format("%s{count=%d, sum=%d, min=%d, average=%f, max=%d}", "IntSummaryStatistics", getCount(), getSum(),
                             getMin(), getAverage(), getMax());
    }
}

public class LongSummaryStatistics implements java.util.function.LongConsumer, java.util.function.IntConsumer {
    private long count;
    private long sum;
    private long min = Long.MAX_VALUE;
    private long max = Long.MIN_VALUE;
    public LongSummaryStatistics() {}
    public void accept(int value) { accept((long) value); }
    public void accept(long value) {
        ++count;
        sum += value;
        min = Math.min(min, value);
        max = Math.max(max, value);
    }
    public void combine(LongSummaryStatistics other) {
        count += other.count;
        sum += other.sum;
        min = Math.min(min, other.min);
        max = Math.max(max, other.max);
    }
    public final long getCount() { return count; }
    public final long getSum() { return sum; }
    public final long getMin() { return min; }
    public final long getMax() { return max; }
    public final double getAverage() { return count > 0 ? (double) sum / count : 0.0d; }
    public String toString() {
        return String.format("%s{count=%d, sum=%d, min=%d, average=%f, max=%d}", "LongSummaryStatistics", getCount(), getSum(),
                             getMin(), getAverage(), getMax());
    }
}

public class DoubleSummaryStatistics implements java.util.function.DoubleConsumer {
    private long count;
    private double sum;
    private double min = Double.POSITIVE_INFINITY;
    private double max = Double.NEGATIVE_INFINITY;
    public DoubleSummaryStatistics() {}
    public void accept(double value) {
        ++count;
        sum += value;
        min = Math.min(min, value);
        max = Math.max(max, value);
    }
    public void combine(DoubleSummaryStatistics other) {
        count += other.count;
        sum += other.sum;
        min = Math.min(min, other.min);
        max = Math.max(max, other.max);
    }
    public final long getCount() { return count; }
    public final double getSum() { return sum; }
    public final double getMin() { return min; }
    public final double getMax() { return max; }
    public final double getAverage() { return count > 0 ? getSum() / count : 0.0d; }
    public String toString() {
        return String.format("%s{count=%d, sum=%f, min=%f, average=%f, max=%f}", "DoubleSummaryStatistics", getCount(), getSum(),
                             getMin(), getAverage(), getMax());
    }
}
`);

    // Locale: numbers and dates in a unit are always in English notation;
    // the locale is kept but does not change formatting.
    Java.addLibrary('java.util.locale', 'java.util', String.raw`
public final class Locale implements java.io.Serializable {
    public static final Locale ROOT = new Locale("", "");
    public static final Locale ENGLISH = new Locale("en", "");
    public static final Locale US = new Locale("en", "US");
    public static final Locale UK = new Locale("en", "GB");
    public static final Locale GERMAN = new Locale("de", "");
    public static final Locale GERMANY = new Locale("de", "DE");
    public static final Locale FRENCH = new Locale("fr", "");
    public static final Locale FRANCE = new Locale("fr", "FR");
    private final String language;
    private final String country;
    public Locale(String language) { this(language, ""); }
    public Locale(String language, String country) {
        this.language = language.toLowerCase();
        this.country = country.toUpperCase();
    }
    public static Locale of(String language) { return new Locale(language); }
    public static Locale of(String language, String country) { return new Locale(language, country); }
    public static Locale getDefault() { return US; }
    public static Locale forLanguageTag(String tag) {
        String[] parts = tag.split("[-_]");
        return new Locale(parts[0], parts.length > 1 ? parts[1] : "");
    }
    public String getLanguage() { return language; }
    public String getCountry() { return country; }
    public String toLanguageTag() { return country.isEmpty() ? language : language + "-" + country; }
    public boolean equals(Object other) {
        return other instanceof Locale l && l.language.equals(language) && l.country.equals(country);
    }
    public int hashCode() { return language.hashCode() * 31 + country.hashCode(); }
    public String toString() { return country.isEmpty() ? language : language + "_" + country; }
}
`);

    Java.addLibrary('java.util.joiner', 'java.util', String.raw`
public final class StringJoiner {
    private final String prefix;
    private final String delimiter;
    private final String suffix;
    private StringBuilder value;
    private String emptyValue;
    public StringJoiner(CharSequence delimiter) { this(delimiter, "", ""); }
    public StringJoiner(CharSequence delimiter, CharSequence prefix, CharSequence suffix) {
        this.prefix = prefix.toString();
        this.delimiter = delimiter.toString();
        this.suffix = suffix.toString();
        this.emptyValue = this.prefix + this.suffix;
    }
    public StringJoiner setEmptyValue(CharSequence emptyValue) {
        this.emptyValue = emptyValue.toString();
        return this;
    }
    public StringJoiner add(CharSequence item) {
        if (value == null)
            value = new StringBuilder();
        else
            value.append(delimiter);
        value.append(String.valueOf(item));
        return this;
    }
    public StringJoiner merge(StringJoiner other) {
        if (other.value != null)
            add(other.value.toString());
        return this;
    }
    public int length() { return value == null ? emptyValue.length() : prefix.length() + value.length() + suffix.length(); }
    public String toString() { return value == null ? emptyValue : prefix + value + suffix; }
}
`);

    // Random is the linear congruential generator of the JDK: the same seed gives the same numbers.
    Java.addLibrary('java.util.random', 'java.util', String.raw`
public class Random implements java.io.Serializable {
    private static final long MULTIPLIER = 0x5DEECE66DL;
    private static final long ADDEND = 0xBL;
    private static final long MASK = (1L << 48) - 1;
    private static long seedUniquifier = 8682522807148012L;
    private long seed;
    private double nextNextGaussian;
    private boolean haveNextNextGaussian = false;
    public Random() { this(nextUniquifier() ^ System.nanoTime()); }
    public Random(long seed) { this.seed = (seed ^ MULTIPLIER) & MASK; }
    private static long nextUniquifier() {
        seedUniquifier = seedUniquifier * 1181783497276652981L;
        return seedUniquifier;
    }
    public void setSeed(long seed) {
        this.seed = (seed ^ MULTIPLIER) & MASK;
        haveNextNextGaussian = false;
    }
    protected int next(int bits) {
        seed = (seed * MULTIPLIER + ADDEND) & MASK;
        return (int) (seed >>> (48 - bits));
    }
    public void nextBytes(byte[] bytes) {
        for (int i = 0, len = bytes.length; i < len;)
            for (int rnd = nextInt(), n = Math.min(len - i, 4); n-- > 0; rnd >>= 8)
                bytes[i++] = (byte) rnd;
    }
    public int nextInt() { return next(32); }
    public int nextInt(int bound) {
        if (bound <= 0)
            throw new IllegalArgumentException("bound must be positive");
        int r = next(31);
        int m = bound - 1;
        if ((bound & m) == 0) {
            r = (int) ((bound * (long) r) >> 31);
        } else {
            for (int u = r; u - (r = u % bound) + m < 0; u = next(31)) {}
        }
        return r;
    }
    public int nextInt(int origin, int bound) {
        if (origin >= bound)
            throw new IllegalArgumentException("bound must be greater than origin");
        return boundedNextInt(origin, bound);
    }
    int boundedNextInt(int origin, int bound) {
        int r = nextInt();
        if (origin < bound) {
            int n = bound - origin, m = n - 1;
            if ((n & m) == 0) {
                r = (r & m) + origin;
            } else if (n > 0) {
                for (int u = r >>> 1; u + m - (r = u % n) < 0; u = nextInt() >>> 1) {}
                r += origin;
            } else {
                while (r < origin || r >= bound)
                    r = nextInt();
            }
        }
        return r;
    }
    public long nextLong() { return ((long) (next(32)) << 32) + next(32); }
    public long nextLong(long bound) {
        if (bound <= 0)
            throw new IllegalArgumentException("bound must be positive");
        return nextLong(0, bound);
    }
    public long nextLong(long origin, long bound) {
        if (origin >= bound)
            throw new IllegalArgumentException("bound must be greater than origin");
        long r = nextLong();
        long n = bound - origin, m = n - 1;
        if ((n & m) == 0L) {
            r = (r & m) + origin;
        } else if (n > 0L) {
            for (long u = r >>> 1; u + m - (r = u % n) < 0L; u = nextLong() >>> 1) {}
            r += origin;
        } else {
            while (r < origin || r >= bound)
                r = nextLong();
        }
        return r;
    }
    public boolean nextBoolean() { return next(1) != 0; }
    public float nextFloat() { return next(24) / ((float) (1 << 24)); }
    public double nextDouble() { return (((long) (next(26)) << 27) + next(27)) * 0x1.0p-53; }
    public double nextDouble(double bound) { return nextDouble(0.0, bound); }
    public double nextDouble(double origin, double bound) {
        if (!(origin < bound))
            throw new IllegalArgumentException("bound must be greater than origin");
        double r = nextDouble();
        r = r * (bound - origin) + origin;
        if (r >= bound)
            r = Math.nextDown(bound);
        return r;
    }
    public double nextGaussian() {
        if (haveNextNextGaussian) {
            haveNextNextGaussian = false;
            return nextNextGaussian;
        }
        double v1, v2, s;
        do {
            v1 = 2 * nextDouble() - 1;
            v2 = 2 * nextDouble() - 1;
            s = v1 * v1 + v2 * v2;
        } while (s >= 1 || s == 0);
        double multiplier = StrictMath.sqrt(-2 * StrictMath.log(s) / s);
        nextNextGaussian = v2 * multiplier;
        haveNextNextGaussian = true;
        return v1 * multiplier;
    }
    public java.util.stream.IntStream ints(long count) {
        return java.util.stream.IntStream.generate(() -> nextInt()).limit(count);
    }
    public java.util.stream.IntStream ints(long count, int origin, int bound) {
        if (origin >= bound)
            throw new IllegalArgumentException("bound must be greater than origin");
        return java.util.stream.IntStream.generate(() -> boundedNextInt(origin, bound)).limit(count);
    }
    public java.util.stream.IntStream ints(int origin, int bound) {
        if (origin >= bound)
            throw new IllegalArgumentException("bound must be greater than origin");
        return java.util.stream.IntStream.generate(() -> boundedNextInt(origin, bound));
    }
    public java.util.stream.IntStream ints() { return java.util.stream.IntStream.generate(() -> nextInt()); }
    public java.util.stream.DoubleStream doubles(long count) {
        return java.util.stream.DoubleStream.generate(() -> nextDouble()).limit(count);
    }
    public java.util.stream.DoubleStream doubles() { return java.util.stream.DoubleStream.generate(() -> nextDouble()); }
}
`);

    // Scanner over a string or an input stream: the stream is read by lines
    // when a token or a line needs them, so a prompt comes before the wait.
    Java.addLibrary('java.util.scanner', 'java.util', String.raw`
public final class Scanner implements java.io.Closeable, Iterator<String> {
    private final java.io.InputStream source;
    private String text;
    private int position;
    private boolean closed;
    public Scanner(String source) { this.source = null; this.text = source; }
    public Scanner(java.io.InputStream source) { this.source = source; this.text = ""; }
    private void ensureOpen() {
        if (closed)
            throw new IllegalStateException("Scanner closed");
    }
    private boolean fill() {
        if (source == null)
            return false;
        String line = source.readLineText();
        if (line == null)
            return false;
        text = text.substring(position) + line;
        position = 0;
        return true;
    }
    private int tokenStart() {
        for (;;) {
            int i = position;
            while (i < text.length() && Character.isWhitespace(text.charAt(i)))
                i++;
            if (i < text.length() || !fill())
                return i;
        }
    }
    private int tokenEnd(int start) {
        int i = start;
        while (i < text.length() && !Character.isWhitespace(text.charAt(i)))
            i++;
        return i;
    }
    private String peekToken() {
        int start = tokenStart();
        return start >= text.length() ? null : text.substring(start, tokenEnd(start));
    }
    public boolean hasNext() {
        ensureOpen();
        return peekToken() != null;
    }
    public String next() {
        ensureOpen();
        int start = tokenStart();
        if (start >= text.length())
            throw new NoSuchElementException();
        int end = tokenEnd(start);
        position = end;
        return text.substring(start, end);
    }
    private String nextNumber(String kind) {
        String token = peekToken();
        if (token == null)
            throw new NoSuchElementException();
        if (!isNumber(token, kind))
            throw new InputMismatchException();
        return next();
    }
    private static boolean isNumber(String token, String kind) {
        try {
            if (kind.equals("int"))
                Integer.parseInt(token);
            else if (kind.equals("long"))
                Long.parseLong(token);
            else
                Double.parseDouble(token);
            return true;
        } catch (NumberFormatException e) {
            return false;
        }
    }
    public boolean hasNextInt() {
        ensureOpen();
        String token = peekToken();
        return token != null && isNumber(token, "int");
    }
    public boolean hasNextLong() {
        ensureOpen();
        String token = peekToken();
        return token != null && isNumber(token, "long");
    }
    public boolean hasNextDouble() {
        ensureOpen();
        String token = peekToken();
        return token != null && isNumber(token, "double");
    }
    public boolean hasNextBoolean() {
        ensureOpen();
        String token = peekToken();
        return token != null && (token.equalsIgnoreCase("true") || token.equalsIgnoreCase("false"));
    }
    public int nextInt() {
        ensureOpen();
        return Integer.parseInt(nextNumber("int"));
    }
    public long nextLong() {
        ensureOpen();
        return Long.parseLong(nextNumber("long"));
    }
    public double nextDouble() {
        ensureOpen();
        return Double.parseDouble(nextNumber("double"));
    }
    public boolean nextBoolean() {
        ensureOpen();
        if (!hasNextBoolean()) {
            String token = peekToken();
            if (token == null)
                throw new NoSuchElementException();
            throw new InputMismatchException();
        }
        return Boolean.parseBoolean(next());
    }
    public boolean hasNextLine() {
        ensureOpen();
        return position < text.length() || fill();
    }
    public String nextLine() {
        ensureOpen();
        if (position >= text.length() && !fill())
            throw new NoSuchElementException("No line found");
        int end = text.indexOf('\n', position);
        while (end < 0 && fill())
            end = text.indexOf('\n', position);
        String line;
        if (end < 0) {
            line = text.substring(position);
            position = text.length();
        } else {
            line = text.substring(position, end);
            position = end + 1;
        }
        return line.endsWith("\r") ? line.substring(0, line.length() - 1) : line;
    }
    public void close() { closed = true; }
}
`);

    Java.addLibrary('java.util.exceptions', 'java.util', Java.exceptionSource([
        ['NoSuchElementException', 'RuntimeException'], ['ConcurrentModificationException', 'RuntimeException'],
        ['InputMismatchException', 'NoSuchElementException'], ['EmptyStackException', 'RuntimeException'],
        ['IllegalFormatException', 'IllegalArgumentException'],
        ['IllegalFormatConversionException', 'IllegalFormatException'],
        ['MissingFormatArgumentException', 'IllegalFormatException'],
        ['UnknownFormatConversionException', 'IllegalFormatException']
    ]));

    Java.addLibrary('java.util.regex.exceptions', 'java.util.regex', Java.exceptionSource([
        ['PatternSyntaxException', 'IllegalArgumentException']
    ]));
})(globalThis);
