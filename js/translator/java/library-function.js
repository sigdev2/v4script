// Java: the java.util.function library - functional interfaces.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Java = T.java;
    if (Java.library.units['java.util.function'])
        return;

    Java.addLibrary('java.util.function', 'java.util.function', String.raw`
public interface Function<T, R> {
    R apply(T t);
    default <V> Function<V, R> compose(Function<? super V, ? extends T> before) { return v -> apply(before.apply(v)); }
    default <V> Function<T, V> andThen(Function<? super R, ? extends V> after) { return t -> after.apply(apply(t)); }
    static <T> Function<T, T> identity() { return t -> t; }
}

public interface BiFunction<T, U, R> {
    R apply(T t, U u);
    default <V> BiFunction<T, U, V> andThen(Function<? super R, ? extends V> after) { return (t, u) -> after.apply(apply(t, u)); }
}

public interface UnaryOperator<T> extends Function<T, T> {
    static <T> UnaryOperator<T> identity() { return t -> t; }
}

public interface BinaryOperator<T> extends BiFunction<T, T, T> {
    static <T> BinaryOperator<T> minBy(java.util.Comparator<? super T> comparator) {
        return (a, b) -> comparator.compare(a, b) <= 0 ? a : b;
    }
    static <T> BinaryOperator<T> maxBy(java.util.Comparator<? super T> comparator) {
        return (a, b) -> comparator.compare(a, b) >= 0 ? a : b;
    }
}

public interface Supplier<T> {
    T get();
}

public interface Consumer<T> {
    void accept(T t);
    default Consumer<T> andThen(Consumer<? super T> after) { return t -> { accept(t); after.accept(t); }; }
}

public interface BiConsumer<T, U> {
    void accept(T t, U u);
    default BiConsumer<T, U> andThen(BiConsumer<? super T, ? super U> after) {
        return (t, u) -> { accept(t, u); after.accept(t, u); };
    }
}

public interface Predicate<T> {
    boolean test(T t);
    default Predicate<T> and(Predicate<? super T> other) { return t -> test(t) && other.test(t); }
    default Predicate<T> or(Predicate<? super T> other) { return t -> test(t) || other.test(t); }
    default Predicate<T> negate() { return t -> !test(t); }
    static <T> Predicate<T> not(Predicate<? super T> target) { return t -> !target.test(t); }
    static <T> Predicate<T> isEqual(Object target) { return t -> java.util.Objects.equals(target, t); }
}

public interface BiPredicate<T, U> {
    boolean test(T t, U u);
    default BiPredicate<T, U> negate() { return (t, u) -> !test(t, u); }
    default BiPredicate<T, U> and(BiPredicate<? super T, ? super U> other) { return (t, u) -> test(t, u) && other.test(t, u); }
    default BiPredicate<T, U> or(BiPredicate<? super T, ? super U> other) { return (t, u) -> test(t, u) || other.test(t, u); }
}
`);
    // Interfaces for primitives: name, method, parameters, result.
    var PRIMITIVE = [
        ['IntFunction<R>', 'R apply(int value)'], ['LongFunction<R>', 'R apply(long value)'],
        ['DoubleFunction<R>', 'R apply(double value)'], ['ToIntFunction<T>', 'int applyAsInt(T value)'],
        ['ToLongFunction<T>', 'long applyAsLong(T value)'], ['ToDoubleFunction<T>', 'double applyAsDouble(T value)'],
        ['ToIntBiFunction<T, U>', 'int applyAsInt(T t, U u)'], ['ToLongBiFunction<T, U>', 'long applyAsLong(T t, U u)'],
        ['ToDoubleBiFunction<T, U>', 'double applyAsDouble(T t, U u)'],
        ['IntUnaryOperator', 'int applyAsInt(int operand)'], ['LongUnaryOperator', 'long applyAsLong(long operand)'],
        ['DoubleUnaryOperator', 'double applyAsDouble(double operand)'],
        ['IntBinaryOperator', 'int applyAsInt(int left, int right)'], ['LongBinaryOperator', 'long applyAsLong(long left, long right)'],
        ['DoubleBinaryOperator', 'double applyAsDouble(double left, double right)'],
        ['IntPredicate', 'boolean test(int value)'], ['LongPredicate', 'boolean test(long value)'],
        ['DoublePredicate', 'boolean test(double value)'],
        ['IntConsumer', 'void accept(int value)'], ['LongConsumer', 'void accept(long value)'],
        ['DoubleConsumer', 'void accept(double value)'], ['ObjIntConsumer<T>', 'void accept(T t, int value)'],
        ['ObjLongConsumer<T>', 'void accept(T t, long value)'], ['ObjDoubleConsumer<T>', 'void accept(T t, double value)'],
        ['IntSupplier', 'int getAsInt()'], ['LongSupplier', 'long getAsLong()'], ['DoubleSupplier', 'double getAsDouble()'],
        ['BooleanSupplier', 'boolean getAsBoolean()'],
        ['IntToLongFunction', 'long applyAsLong(int value)'], ['IntToDoubleFunction', 'double applyAsDouble(int value)'],
        ['LongToIntFunction', 'int applyAsInt(long value)'], ['LongToDoubleFunction', 'double applyAsDouble(long value)'],
        ['DoubleToIntFunction', 'int applyAsInt(double value)'], ['DoubleToLongFunction', 'long applyAsLong(double value)']
    ];

    var extras = {
        IntUnaryOperator: '    default IntUnaryOperator andThen(IntUnaryOperator after) { return v -> after.applyAsInt(applyAsInt(v)); }\n' +
            '    static IntUnaryOperator identity() { return v -> v; }\n',
        IntPredicate: '    default IntPredicate negate() { return v -> !test(v); }\n' +
            '    default IntPredicate and(IntPredicate other) { return v -> test(v) && other.test(v); }\n' +
            '    default IntPredicate or(IntPredicate other) { return v -> test(v) || other.test(v); }\n',
        DoubleUnaryOperator: '    static DoubleUnaryOperator identity() { return v -> v; }\n',
        IntConsumer: '    default IntConsumer andThen(IntConsumer after) { return v -> { accept(v); after.accept(v); }; }\n'
    };

    Java.addLibrary('java.util.function.primitive', 'java.util.function', PRIMITIVE.map(function (item) {
        var name = item[0].replace(/<.*$/, '');
        return 'public interface ' + item[0] + ' {\n    ' + item[1] + ';\n' + (extras[name] || '') + '}\n';
    }).join('\n'));
})(globalThis);
