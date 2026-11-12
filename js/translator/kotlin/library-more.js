// Kotlin: kotlin.math, kotlin.comparisons, kotlin.system, kotlin.jvm,
// kotlin.properties (delegates), kotlin.concurrent (threads), kotlin.random
// (the XorWow generator of Kotlin, so seeded numbers are those of the JVM)
// and kotlin.sequences (lazy sequences; sequence {} and iterator {}
// builders suspend in generators).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Kt = T.kotlin;
    var Java = T.java;
    if (Kt.library.units['kotlin.math'])
        return;

    Kt.addLibrary('kotlin.math', String.raw`
package kotlin.math

public const val PI: Double = 3.141592653589793
public const val E: Double = 2.718281828459045

public external fun sqrt(x: Double): Double
public external fun sqrt(x: Float): Float
public external fun cbrt(x: Double): Double
public external fun abs(x: Double): Double
public external fun abs(x: Float): Float
public fun abs(n: Int): Int = if (n < 0) -n else n
public fun abs(n: Long): Long = if (n < 0L) -n else n
public external fun max(a: Double, b: Double): Double
public external fun min(a: Double, b: Double): Double
public external fun max(a: Float, b: Float): Float
public external fun min(a: Float, b: Float): Float
public fun max(a: Int, b: Int): Int = if (a >= b) a else b
public fun min(a: Int, b: Int): Int = if (a <= b) a else b
public fun max(a: Long, b: Long): Long = if (a >= b) a else b
public fun min(a: Long, b: Long): Long = if (a <= b) a else b
public external fun Double.pow(x: Double): Double
public external fun Double.pow(n: Int): Double
public external fun Float.pow(x: Float): Float
public external fun Float.pow(n: Int): Float
public external fun exp(x: Double): Double
public external fun expm1(x: Double): Double
public external fun ln(x: Double): Double
public external fun ln1p(x: Double): Double
public external fun log10(x: Double): Double
public external fun log2(x: Double): Double
public external fun log(x: Double, base: Double): Double
public external fun sin(x: Double): Double
public external fun cos(x: Double): Double
public external fun tan(x: Double): Double
public external fun asin(x: Double): Double
public external fun acos(x: Double): Double
public external fun atan(x: Double): Double
public external fun atan2(y: Double, x: Double): Double
public external fun sinh(x: Double): Double
public external fun cosh(x: Double): Double
public external fun tanh(x: Double): Double
public external fun hypot(x: Double, y: Double): Double
public external fun floor(x: Double): Double
public external fun ceil(x: Double): Double
public external fun round(x: Double): Double
public external fun truncate(x: Double): Double
public external fun sign(x: Double): Double
public external fun Double.roundToInt(): Int
public external fun Double.roundToLong(): Long
public external fun Float.roundToInt(): Int
public val Int.absoluteValue: Int get() = abs(this)
public val Long.absoluteValue: Long get() = abs(this)
public val Double.absoluteValue: Double get() = abs(this)
public val Int.sign: Int get() = if (this > 0) 1 else if (this < 0) -1 else 0
public val Long.sign: Int get() = if (this > 0L) 1 else if (this < 0L) -1 else 0
public val Double.sign: Double get() = sign(this)
public external fun Double.withSign(sign: Double): Double
public val Double.ulp: Double get() = java.lang.Math.ulp(this)
public fun Double.nextUp(): Double = java.lang.Math.nextUp(this)
public fun Double.nextDown(): Double = java.lang.Math.nextDown(this)
`);

    Kt.addLibrary('kotlin.comparisons', String.raw`
package kotlin.comparisons

public fun <T : Comparable<*>> compareValues(a: T?, b: T?): Int {
    if (a === b) return 0
    if (a == null) return -1
    if (b == null) return 1
    @Suppress("UNCHECKED_CAST")
    return (a as Comparable<Any>).compareTo(b)
}
public fun <T> compareValuesBy(a: T, b: T, vararg selectors: (T) -> Comparable<*>?): Int {
    for (fn in selectors) {
        val diff = compareValues(fn(a), fn(b))
        if (diff != 0) return diff
    }
    return 0
}
public inline fun <T> compareValuesBy(a: T, b: T, selector: (T) -> Comparable<*>?): Int = compareValues(selector(a), selector(b))
public fun <T> compareBy(vararg selectors: (T) -> Comparable<*>?): Comparator<T> {
    if (selectors.size == 0) throw IllegalArgumentException("Failed requirement.")
    return Comparator { a, b -> compareValuesBy(a, b, *selectors) }
}
public inline fun <T> compareBy(crossinline selector: (T) -> Comparable<*>?): Comparator<T> =
    Comparator { a, b -> compareValuesBy(a, b, selector) }
public inline fun <T> compareByDescending(crossinline selector: (T) -> Comparable<*>?): Comparator<T> =
    Comparator { a, b -> compareValuesBy(b, a, selector) }
public inline fun <T> Comparator<T>.thenBy(crossinline selector: (T) -> Comparable<*>?): Comparator<T> =
    Comparator { a, b ->
        val previousCompare = this@thenBy.compare(a, b)
        if (previousCompare != 0) previousCompare else compareValuesBy(a, b, selector)
    }
public inline fun <T> Comparator<T>.thenByDescending(crossinline selector: (T) -> Comparable<*>?): Comparator<T> =
    Comparator { a, b ->
        val previousCompare = this@thenByDescending.compare(a, b)
        if (previousCompare != 0) previousCompare else compareValuesBy(b, a, selector)
    }
public infix fun <T> Comparator<T>.then(comparator: Comparator<in T>): Comparator<T> =
    Comparator { a, b ->
        val previousCompare = this@then.compare(a, b)
        if (previousCompare != 0) previousCompare else comparator.compare(a, b)
    }
public infix fun <T> Comparator<T>.thenComparator(comparison: (a: T, b: T) -> Int): Comparator<T> =
    Comparator { a, b ->
        val previousCompare = this@thenComparator.compare(a, b)
        if (previousCompare != 0) previousCompare else comparison(a, b)
    }
public fun <T> Comparator<T>.reversed(): Comparator<T> = Comparator { a, b -> this@reversed.compare(b, a) }
public fun <T : Comparable<T>> naturalOrder(): Comparator<T> = Comparator { a, b -> a.compareTo(b) }
public fun <T : Comparable<T>> reverseOrder(): Comparator<T> = Comparator { a, b -> b.compareTo(a) }
public fun <T : Comparable<T>> nullsFirst(): Comparator<T?> = Comparator { a, b -> compareValues(a, b) }
public fun <T : Comparable<T>> nullsLast(): Comparator<T?> = Comparator { a, b ->
    if (a === b) 0 else if (a == null) 1 else if (b == null) -1 else a.compareTo(b)
}
public fun <T : Comparable<T>> maxOf(a: T, b: T): T = if (a >= b) a else b
public fun <T : Comparable<T>> maxOf(a: T, b: T, c: T): T = maxOf(a, maxOf(b, c))
public fun <T : Comparable<T>> minOf(a: T, b: T): T = if (a <= b) a else b
public fun <T : Comparable<T>> minOf(a: T, b: T, c: T): T = minOf(a, minOf(b, c))
public fun maxOf(a: Int, b: Int): Int = if (a >= b) a else b
public fun maxOf(a: Int, b: Int, c: Int): Int = maxOf(a, maxOf(b, c))
public fun maxOf(a: Int, vararg other: Int): Int {
    var max = a
    for (element in other) if (element > max) max = element
    return max
}
public fun minOf(a: Int, b: Int): Int = if (a <= b) a else b
public fun minOf(a: Int, b: Int, c: Int): Int = minOf(a, minOf(b, c))
public fun minOf(a: Int, vararg other: Int): Int {
    var min = a
    for (element in other) if (element < min) min = element
    return min
}
public fun maxOf(a: Long, b: Long): Long = if (a >= b) a else b
public fun minOf(a: Long, b: Long): Long = if (a <= b) a else b
public fun maxOf(a: Double, b: Double): Double = kotlin.math.max(a, b)
public fun maxOf(a: Double, b: Double, c: Double): Double = kotlin.math.max(a, kotlin.math.max(b, c))
public fun minOf(a: Double, b: Double): Double = kotlin.math.min(a, b)
public fun minOf(a: Double, b: Double, c: Double): Double = kotlin.math.min(a, kotlin.math.min(b, c))
public fun maxOf(a: Float, b: Float): Float = kotlin.math.max(a, b)
public fun minOf(a: Float, b: Float): Float = kotlin.math.min(a, b)
`);

    Kt.addLibrary('kotlin.system', String.raw`
package kotlin.system

public fun exitProcess(status: Int): Nothing {
    System.exit(status)
    throw RuntimeException("System.exit returned normally, while it was supposed to halt JVM.")
}
public inline fun measureTimeMillis(block: () -> Unit): Long {
    val start = System.currentTimeMillis()
    block()
    return System.currentTimeMillis() - start
}
public inline fun measureNanoTime(block: () -> Unit): Long {
    val start = System.nanoTime()
    block()
    return System.nanoTime() - start
}
`);

    Kt.addLibrary('kotlin.jvm', String.raw`
package kotlin.jvm

public external val <T : Any> T.javaClass: Class<T>
`);

    Kt.addLibrary('kotlin.properties', String.raw`
package kotlin.properties

import kotlin.reflect.KProperty

public fun interface ReadOnlyProperty<in T, out V> {
    public operator fun getValue(thisRef: T, property: KProperty<*>): V
}

public interface ReadWriteProperty<in T, V> : ReadOnlyProperty<T, V> {
    public override operator fun getValue(thisRef: T, property: KProperty<*>): V
    public operator fun setValue(thisRef: T, property: KProperty<*>, value: V)
}

public abstract class ObservableProperty<V>(initialValue: V) : ReadWriteProperty<Any?, V> {
    private var value = initialValue
    protected open fun beforeChange(property: KProperty<*>, oldValue: V, newValue: V): Boolean = true
    protected open fun afterChange(property: KProperty<*>, oldValue: V, newValue: V) {}
    public override fun getValue(thisRef: Any?, property: KProperty<*>): V = value
    public override fun setValue(thisRef: Any?, property: KProperty<*>, value: V) {
        val oldValue = this.value
        if (!beforeChange(property, oldValue, value))
            return
        this.value = value
        afterChange(property, oldValue, value)
    }
    override fun toString(): String = "ObservableProperty(value=" + value + ")"
}

public object Delegates {
    public fun <T : Any> notNull(): ReadWriteProperty<Any?, T> = NotNullVar()
    public inline fun <T> observable(initialValue: T, crossinline onChange: (property: KProperty<*>, oldValue: T, newValue: T) -> Unit): ReadWriteProperty<Any?, T> =
        object : ObservableProperty<T>(initialValue) {
            override fun afterChange(property: KProperty<*>, oldValue: T, newValue: T) = onChange(property, oldValue, newValue)
        }
    public inline fun <T> vetoable(initialValue: T, crossinline onChange: (property: KProperty<*>, oldValue: T, newValue: T) -> Boolean): ReadWriteProperty<Any?, T> =
        object : ObservableProperty<T>(initialValue) {
            override fun beforeChange(property: KProperty<*>, oldValue: T, newValue: T): Boolean = onChange(property, oldValue, newValue)
        }
}

internal class NotNullVar<T : Any> : ReadWriteProperty<Any?, T> {
    private var value: T? = null
    public override fun getValue(thisRef: Any?, property: KProperty<*>): T =
        value ?: throw IllegalStateException("Property " + property.name + " should be initialized before get.")
    public override fun setValue(thisRef: Any?, property: KProperty<*>, value: T) {
        this.value = value
    }
}
`);

    // Threads are fibers of the Java run time (java.lang.Thread).
    Kt.addLibrary('kotlin.concurrent', String.raw`
package kotlin.concurrent

public fun thread(start: Boolean = true, isDaemon: Boolean = false, name: String? = null, priority: Int = -1,
                  block: () -> Unit): Thread {
    val thread = Thread(block)
    if (isDaemon)
        thread.setDaemon(true)
    if (priority > 0)
        thread.setPriority(priority)
    if (name != null)
        thread.setName(name)
    if (start)
        thread.start()
    return thread
}
`);

    Kt.addLibrary('kotlin.random', String.raw`
package kotlin.random

import kotlin.math.nextDown

public abstract class Random {
    public abstract fun nextBits(bitCount: Int): Int
    public open fun nextInt(): Int = nextBits(32)
    public open fun nextInt(until: Int): Int = nextInt(0, until)
    public open fun nextInt(from: Int, until: Int): Int {
        checkRangeBounds(from, until)
        val n = until - from
        if (n > 0 || n == Int.MIN_VALUE) {
            val rnd = if (n and -n == n) {
                val bitCount = fastLog2(n)
                nextBits(bitCount)
            } else {
                var v: Int
                do {
                    val bits = nextInt().ushr(1)
                    v = bits % n
                } while (bits - v + (n - 1) < 0)
                v
            }
            return from + rnd
        } else {
            while (true) {
                val rnd = nextInt()
                if (rnd in from until until) return rnd
            }
        }
    }
    public open fun nextInt(range: IntRange): Int = nextInt(range.first, range.last + 1)
    public open fun nextLong(): Long = nextInt().toLong().shl(32) + nextInt()
    public open fun nextLong(until: Long): Long = nextLong(0L, until)
    public open fun nextLong(from: Long, until: Long): Long {
        if (until <= from) throw IllegalArgumentException("Random range is empty: [$from, $until).")
        val n = until - from
        if (n > 0L) {
            var bits: Long
            var v: Long
            do {
                bits = nextLong().ushr(1)
                v = bits % n
            } while (bits - v + (n - 1L) < 0L)
            return from + v
        }
        while (true) {
            val rnd = nextLong()
            if (rnd >= from && rnd < until) return rnd
        }
    }
    public open fun nextBoolean(): Boolean = nextBits(1) != 0
    public open fun nextDouble(): Double = doubleFromParts(nextBits(26), nextBits(27))
    public open fun nextDouble(until: Double): Double = nextDouble(0.0, until)
    public open fun nextDouble(from: Double, until: Double): Double {
        if (!(until > from)) throw IllegalArgumentException("Random range is empty: [$from, $until).")
        val size = until - from
        val r = nextDouble()
        val result = from + r * size
        return if (result >= until) until.nextDown() else result
    }
    public open fun nextFloat(): Float = nextBits(24) / (1 shl 24).toFloat()
    public open fun nextBytes(array: ByteArray): ByteArray {
        for (index in 0 until array.size) array[index] = nextBits(8).toByte()
        return array
    }
    public open fun nextBytes(size: Int): ByteArray = nextBytes(ByteArray(size))

    companion object Default : Random() {
        private val defaultRandom: Random = XorWowRandom(System.nanoTime().toInt(), (System.nanoTime() shr 32).toInt())
        override fun nextBits(bitCount: Int): Int = defaultRandom.nextBits(bitCount)
        override fun nextInt(): Int = defaultRandom.nextInt()
        override fun nextInt(until: Int): Int = defaultRandom.nextInt(until)
        override fun nextInt(from: Int, until: Int): Int = defaultRandom.nextInt(from, until)
        override fun nextLong(): Long = defaultRandom.nextLong()
        override fun nextBoolean(): Boolean = defaultRandom.nextBoolean()
        override fun nextDouble(): Double = defaultRandom.nextDouble()
    }
}

public fun Random(seed: Int): Random = XorWowRandom(seed, seed shr 31)
public fun Random(seed: Long): Random = XorWowRandom(seed.toInt(), (seed shr 32).toInt())

internal fun checkRangeBounds(from: Int, until: Int) {
    if (until <= from) throw IllegalArgumentException("Random range is empty: [$from, $until).")
}

internal fun fastLog2(value: Int): Int = 31 - Integer.numberOfLeadingZeros(value)

internal fun takeUpperBits(value: Int, bitCount: Int): Int = value.ushr(32 - bitCount) and (-bitCount).shr(31)

internal fun doubleFromParts(hi26: Int, low27: Int): Double = (hi26.toLong().shl(27) + low27) / (1L shl 53).toDouble()

internal class XorWowRandom internal constructor(private var x: Int, private var y: Int, private var z: Int, private var w: Int,
                                                 private var v: Int, private var addend: Int) : Random() {
    internal constructor(seed1: Int, seed2: Int) : this(seed1, seed2, 0, 0, seed1.inv(), (seed1 shl 10) xor (seed2 ushr 4))

    init {
        if ((x or y or z or w or v) == 0) throw IllegalArgumentException("Initial state must have at least one non-zero element.")
        repeat(64) { nextInt() }
    }

    override fun nextInt(): Int {
        var t = x
        t = t xor (t ushr 2)
        x = y
        y = z
        z = w
        val v0 = v
        w = v0
        t = (t xor (t shl 1)) xor v0 xor (v0 shl 4)
        v = t
        addend += 362437
        return t + addend
    }

    override fun nextBits(bitCount: Int): Int = takeUpperBits(nextInt(), bitCount)
}
`);

    Kt.addLibrary('kotlin.sequences', String.raw`
package kotlin.sequences

public interface Sequence<out T> {
    public operator fun iterator(): Iterator<T>
}

internal class IterableSequence<T>(private val source: Iterable<T>) : Sequence<T> {
    override fun iterator(): Iterator<T> = source.iterator()
}

internal class TransformingSequence<T, R>(private val source: Sequence<T>, private val transformer: (T) -> R) : Sequence<R> {
    override fun iterator(): Iterator<R> = object : Iterator<R> {
        val iterator = source.iterator()
        override fun next(): R = transformer(iterator.next())
        override fun hasNext(): Boolean = iterator.hasNext()
    }
}

internal class FilteringSequence<T>(private val source: Sequence<T>, private val sendWhen: Boolean, private val predicate: (T) -> Boolean) : Sequence<T> {
    override fun iterator(): Iterator<T> = object : Iterator<T> {
        val iterator = source.iterator()
        var nextState: Int = -1
        var nextItem: T? = null
        fun calcNext() {
            while (iterator.hasNext()) {
                val item = iterator.next()
                if (predicate(item) == sendWhen) {
                    nextItem = item
                    nextState = 1
                    return
                }
            }
            nextState = 0
        }
        override fun next(): T {
            if (nextState == -1) calcNext()
            if (nextState == 0) throw NoSuchElementException()
            val result = nextItem
            nextItem = null
            nextState = -1
            @Suppress("UNCHECKED_CAST")
            return result as T
        }
        override fun hasNext(): Boolean {
            if (nextState == -1) calcNext()
            return nextState == 1
        }
    }
}

internal class TakeSequence<T>(private val source: Sequence<T>, private val count: Int) : Sequence<T> {
    override fun iterator(): Iterator<T> = object : Iterator<T> {
        var left = count
        val iterator = source.iterator()
        override fun next(): T {
            if (left == 0) throw NoSuchElementException()
            left--
            return iterator.next()
        }
        override fun hasNext(): Boolean = left > 0 && iterator.hasNext()
    }
}

internal class TakeWhileSequence<T>(private val source: Sequence<T>, private val predicate: (T) -> Boolean) : Sequence<T> {
    override fun iterator(): Iterator<T> = object : Iterator<T> {
        val iterator = source.iterator()
        var nextState: Int = -1
        var nextItem: T? = null
        fun calcNext() {
            if (iterator.hasNext()) {
                val item = iterator.next()
                if (predicate(item)) {
                    nextState = 1
                    nextItem = item
                    return
                }
            }
            nextState = 0
        }
        override fun next(): T {
            if (nextState == -1) calcNext()
            if (nextState == 0) throw NoSuchElementException()
            @Suppress("UNCHECKED_CAST")
            val result = nextItem as T
            nextItem = null
            nextState = -1
            return result
        }
        override fun hasNext(): Boolean {
            if (nextState == -1) calcNext()
            return nextState == 1
        }
    }
}

internal class DropSequence<T>(private val source: Sequence<T>, private val count: Int) : Sequence<T> {
    override fun iterator(): Iterator<T> = object : Iterator<T> {
        val iterator = source.iterator()
        var left = count
        fun drop() {
            while (left > 0 && iterator.hasNext()) {
                iterator.next()
                left--
            }
        }
        override fun next(): T {
            drop()
            return iterator.next()
        }
        override fun hasNext(): Boolean {
            drop()
            return iterator.hasNext()
        }
    }
}

internal class GeneratorSequence<T : Any>(private val getInitialValue: () -> T?, private val getNextValue: (T) -> T?) : Sequence<T> {
    override fun iterator(): Iterator<T> = object : Iterator<T> {
        var nextItem: T? = null
        var nextState: Int = -2
        fun calcNext() {
            nextItem = if (nextState == -2) getInitialValue() else getNextValue(nextItem!!)
            nextState = if (nextItem == null) 0 else 1
        }
        override fun next(): T {
            if (nextState < 0) calcNext()
            if (nextState == 0) throw NoSuchElementException()
            val result = nextItem as T
            nextState = -1
            return result
        }
        override fun hasNext(): Boolean {
            if (nextState < 0) calcNext()
            return nextState == 1
        }
    }
}

internal class FlatteningSequence<T, R>(private val source: Sequence<T>, private val transformer: (T) -> Iterator<R>) : Sequence<R> {
    override fun iterator(): Iterator<R> = object : Iterator<R> {
        val iterator = source.iterator()
        var itemIterator: Iterator<R>? = null
        fun ensureItemIterator(): Boolean {
            var current = itemIterator
            while (current == null || !current.hasNext()) {
                if (!iterator.hasNext()) return false
                current = transformer(iterator.next())
                itemIterator = current
            }
            return true
        }
        override fun next(): R {
            if (!ensureItemIterator()) throw NoSuchElementException()
            return itemIterator!!.next()
        }
        override fun hasNext(): Boolean = ensureItemIterator()
    }
}

public fun <T : Any> generateSequence(nextFunction: () -> T?): Sequence<T> = GeneratorSequence(nextFunction, { nextFunction() })
public fun <T : Any> generateSequence(seed: T?, nextFunction: (T) -> T?): Sequence<T> =
    if (seed == null) emptySequence() else GeneratorSequence({ seed }, nextFunction)
public fun <T : Any> generateSequence(seedFunction: () -> T?, nextFunction: (T) -> T?): Sequence<T> = GeneratorSequence(seedFunction, nextFunction)
public fun <T> emptySequence(): Sequence<T> = IterableSequence(emptyList<T>())
public fun <T> sequenceOf(vararg elements: T): Sequence<T> = IterableSequence(elements.toList())
public fun <T> Iterable<T>.asSequence(): Sequence<T> = IterableSequence(this)
public fun <T> Iterator<T>.asSequence(): Sequence<T> = IterableSequence(IteratorIterable(this))
internal class IteratorIterable<T>(private val iterator: Iterator<T>) : Iterable<T> {
    override fun iterator(): Iterator<T> = iterator
}
public fun <K, V> Map<out K, V>.asSequence(): Sequence<Map.Entry<K, V>> = entries.asSequence()
public fun <T> Sequence<T>.asIterable(): Iterable<T> = toList()
public fun <T, R> Sequence<T>.map(transform: (T) -> R): Sequence<R> = TransformingSequence(this, transform)
public fun <T, R> Sequence<T>.mapIndexed(transform: (index: Int, T) -> R): Sequence<R> {
    var index = 0
    return TransformingSequence(this, { transform(index++, it) })
}
public fun <T, R : Any> Sequence<T>.mapNotNull(transform: (T) -> R?): Sequence<R> =
    TransformingSequence(FilteringSequence(TransformingSequence(this, transform), false, { it == null }), { it!! })
public fun <T> Sequence<T>.filter(predicate: (T) -> Boolean): Sequence<T> = FilteringSequence(this, true, predicate)
public fun <T> Sequence<T>.filterNot(predicate: (T) -> Boolean): Sequence<T> = FilteringSequence(this, false, predicate)
public fun <T : Any> Sequence<T?>.filterNotNull(): Sequence<T> = TransformingSequence(FilteringSequence(this, false, { it == null }), { it!! })
public inline fun <reified R> Sequence<*>.filterIsInstance(): Sequence<R> =
    TransformingSequence(FilteringSequence(this as Sequence<Any?>, true, { it is R }), { it as R })
public fun <T> Sequence<T>.take(n: Int): Sequence<T> {
    if (n < 0) throw IllegalArgumentException("Requested element count $n is less than zero.")
    return TakeSequence(this, n)
}
public fun <T> Sequence<T>.takeWhile(predicate: (T) -> Boolean): Sequence<T> = TakeWhileSequence(this, predicate)
public fun <T> Sequence<T>.drop(n: Int): Sequence<T> {
    if (n < 0) throw IllegalArgumentException("Requested element count $n is less than zero.")
    return DropSequence(this, n)
}
public fun <T> Sequence<T>.dropWhile(predicate: (T) -> Boolean): Sequence<T> {
    var dropping = true
    return FilteringSequence(this, true, {
        if (dropping && !predicate(it)) dropping = false
        !dropping
    })
}
public fun <T, R> Sequence<T>.flatMap(transform: (T) -> Iterable<R>): Sequence<R> = FlatteningSequence(this, { transform(it).iterator() })
@JvmName("flatMapSequence")
public fun <T, R> Sequence<T>.flatMap(transform: (T) -> Sequence<R>): Sequence<R> = FlatteningSequence(this, { transform(it).iterator() })
public fun <T> Sequence<T>.onEach(action: (T) -> Unit): Sequence<T> = map {
    action(it)
    it
}
public fun <T> Sequence<T>.distinct(): Sequence<T> = toMutableSet().asSequence()
public fun <T, K> Sequence<T>.distinctBy(selector: (T) -> K): Sequence<T> = toList().distinctBy(selector).asSequence()
public fun <T : Comparable<T>> Sequence<T>.sorted(): Sequence<T> = toList().sorted().asSequence()
public fun <T, R : Comparable<R>> Sequence<T>.sortedBy(selector: (T) -> R?): Sequence<T> = toList().sortedBy(selector).asSequence()
public fun <T> Sequence<T>.sortedWith(comparator: Comparator<in T>): Sequence<T> = toList().sortedWith(comparator).asSequence()
public fun <T : Comparable<T>> Sequence<T>.sortedDescending(): Sequence<T> = toList().sortedDescending().asSequence()
public inline fun <T, R : Comparable<R>> Sequence<T>.sortedByDescending(crossinline selector: (T) -> R?): Sequence<T> =
    toList().sortedByDescending(selector).asSequence()
public inline fun <K, V> Sequence<K>.associateWith(valueSelector: (K) -> V): Map<K, V> = toList().associateWith(valueSelector)
public inline fun <T> Sequence<T>.partition(predicate: (T) -> Boolean): Pair<List<T>, List<T>> = toList().partition(predicate)
public fun <T> Sequence<T>.shuffled(): Sequence<T> = toList().shuffled().asSequence()
public fun <T> Sequence<T>.withIndex(): Sequence<IndexedValue<T>> = toList().withIndex().asSequence()
public infix fun <T, R> Sequence<T>.zip(other: Sequence<R>): Sequence<Pair<T, R>> = MergingSequence(this, other) { a, b -> a to b }
public fun <T, R, V> Sequence<T>.zip(other: Sequence<R>, transform: (a: T, b: R) -> V): Sequence<V> = MergingSequence(this, other, transform)

internal class MergingSequence<T1, T2, V>(private val first: Sequence<T1>, private val second: Sequence<T2>,
                                          private val transform: (T1, T2) -> V) : Sequence<V> {
    override fun iterator(): Iterator<V> = object : Iterator<V> {
        val iterator1 = first.iterator()
        val iterator2 = second.iterator()
        override fun next(): V = transform(iterator1.next(), iterator2.next())
        override fun hasNext(): Boolean = iterator1.hasNext() && iterator2.hasNext()
    }
}
public fun <T> Sequence<T>.chunked(size: Int): Sequence<List<T>> = toList().chunked(size).asSequence()
public fun <T> Sequence<T>.windowed(size: Int, step: Int = 1, partialWindows: Boolean = false): Sequence<List<T>> = toList().windowed(size, step, partialWindows).asSequence()
public fun <T> Sequence<T>.zipWithNext(): Sequence<Pair<T, T>> = toList().zipWithNext().asSequence()
public operator fun <T> Sequence<T>.plus(element: T): Sequence<T> = (toList() + element).asSequence()
public operator fun <T> Sequence<T>.plus(elements: Iterable<T>): Sequence<T> = (toList() + elements).asSequence()
public fun <T> Sequence<T>.toList(): List<T> {
    val result = ArrayList<T>()
    for (item in this) result.add(item)
    return result
}
public fun <T> Sequence<T>.toMutableList(): MutableList<T> {
    val result = ArrayList<T>()
    for (item in this) result.add(item)
    return result
}
public fun <T> Sequence<T>.toSet(): Set<T> {
    val result = LinkedHashSet<T>()
    for (item in this) result.add(item)
    return result
}
public fun <T> Sequence<T>.toMutableSet(): MutableSet<T> {
    val result = LinkedHashSet<T>()
    for (item in this) result.add(item)
    return result
}
public fun <K, V> Sequence<Pair<K, V>>.toMap(): Map<K, V> {
    val result = LinkedHashMap<K, V>()
    for (pair in this) result.put(pair.first, pair.second)
    return result
}
public inline fun <T> Sequence<T>.forEach(action: (T) -> Unit): Unit {
    for (element in this) action(element)
}
public inline fun <T> Sequence<T>.forEachIndexed(action: (index: Int, T) -> Unit): Unit {
    var index = 0
    for (item in this) action(index++, item)
}
public fun <T> Sequence<T>.first(): T {
    val iterator = iterator()
    if (!iterator.hasNext()) throw NoSuchElementException("Sequence is empty.")
    return iterator.next()
}
public inline fun <T> Sequence<T>.first(predicate: (T) -> Boolean): T {
    for (element in this) if (predicate(element)) return element
    throw NoSuchElementException("Sequence contains no element matching the predicate.")
}
public fun <T> Sequence<T>.firstOrNull(): T? {
    val iterator = iterator()
    if (!iterator.hasNext()) return null
    return iterator.next()
}
public inline fun <T> Sequence<T>.firstOrNull(predicate: (T) -> Boolean): T? {
    for (element in this) if (predicate(element)) return element
    return null
}
public inline fun <T> Sequence<T>.find(predicate: (T) -> Boolean): T? = firstOrNull(predicate)
public fun <T> Sequence<T>.last(): T {
    val iterator = iterator()
    if (!iterator.hasNext()) throw NoSuchElementException("Sequence is empty.")
    var last = iterator.next()
    while (iterator.hasNext()) last = iterator.next()
    return last
}
public fun <T> Sequence<T>.lastOrNull(): T? {
    val iterator = iterator()
    if (!iterator.hasNext()) return null
    var last = iterator.next()
    while (iterator.hasNext()) last = iterator.next()
    return last
}
public fun <T> Sequence<T>.elementAt(index: Int): T {
    var count = 0
    for (element in this) {
        if (count == index) return element
        count++
    }
    throw IndexOutOfBoundsException("Sequence doesn't contain element at index $index.")
}
public fun <T> Sequence<T>.count(): Int {
    var count = 0
    for (element in this) count++
    return count
}
public inline fun <T> Sequence<T>.count(predicate: (T) -> Boolean): Int {
    var count = 0
    for (element in this) if (predicate(element)) count++
    return count
}
public inline fun <T> Sequence<T>.any(predicate: (T) -> Boolean): Boolean {
    for (element in this) if (predicate(element)) return true
    return false
}
public fun <T> Sequence<T>.any(): Boolean = iterator().hasNext()
public inline fun <T> Sequence<T>.all(predicate: (T) -> Boolean): Boolean {
    for (element in this) if (!predicate(element)) return false
    return true
}
public inline fun <T> Sequence<T>.none(predicate: (T) -> Boolean): Boolean {
    for (element in this) if (predicate(element)) return false
    return true
}
public inline fun <T, R> Sequence<T>.fold(initial: R, operation: (acc: R, T) -> R): R {
    var accumulator = initial
    for (element in this) accumulator = operation(accumulator, element)
    return accumulator
}
public inline fun <S, T : S> Sequence<T>.reduce(operation: (acc: S, T) -> S): S {
    val iterator = this.iterator()
    if (!iterator.hasNext()) throw UnsupportedOperationException("Empty sequence can't be reduced.")
    var accumulator: S = iterator.next()
    while (iterator.hasNext()) accumulator = operation(accumulator, iterator.next())
    return accumulator
}
public fun Sequence<Int>.sum(): Int {
    var sum = 0
    for (element in this) sum += element
    return sum
}
public fun Sequence<Long>.sum(): Long {
    var sum = 0L
    for (element in this) sum += element
    return sum
}
public fun Sequence<Double>.sum(): Double {
    var sum = 0.0
    for (element in this) sum += element
    return sum
}
public inline fun <T> Sequence<T>.sumOf(selector: (T) -> Int): Int {
    var sum = 0
    for (element in this) sum += selector(element)
    return sum
}
public inline fun <T> Sequence<T>.sumOf(selector: (T) -> Long): Long {
    var sum = 0L
    for (element in this) sum += selector(element)
    return sum
}
public inline fun <T> Sequence<T>.sumOf(selector: (T) -> Double): Double {
    var sum = 0.0
    for (element in this) sum += selector(element)
    return sum
}
public fun Sequence<Int>.average(): Double = toList().average()
public fun Sequence<Double>.average(): Double = toList().average()
public fun <T : Comparable<T>> Sequence<T>.max(): T = toList().max()
public fun <T : Comparable<T>> Sequence<T>.min(): T = toList().min()
public fun <T : Comparable<T>> Sequence<T>.maxOrNull(): T? = toList().maxOrNull()
public fun <T : Comparable<T>> Sequence<T>.minOrNull(): T? = toList().minOrNull()
public inline fun <T, R : Comparable<R>> Sequence<T>.maxByOrNull(selector: (T) -> R): T? = toList().maxByOrNull(selector)
public inline fun <T, R : Comparable<R>> Sequence<T>.minByOrNull(selector: (T) -> R): T? = toList().minByOrNull(selector)
public inline fun <T, K> Sequence<T>.groupBy(keySelector: (T) -> K): Map<K, List<T>> = toList().groupBy(keySelector)
public inline fun <T, K, V> Sequence<T>.associate(transform: (T) -> Pair<K, V>): Map<K, V> = toList().associate(transform)
public inline fun <T, K> Sequence<T>.associateBy(keySelector: (T) -> K): Map<K, T> = toList().associateBy(keySelector)
public fun <T> Sequence<T>.joinToString(separator: CharSequence = ", ", prefix: CharSequence = "", postfix: CharSequence = "", limit: Int = -1, truncated: CharSequence = "...", transform: ((T) -> CharSequence)? = null): String =
    toList().joinToString(separator, prefix, postfix, limit, truncated, transform)

public interface SequenceScope<in T> {
    public suspend fun yield(value: T)
    public suspend fun yieldAll(elements: Iterable<T>)
    public suspend fun yieldAll(sequence: Sequence<T>)
}

internal class SequenceBuilder<T>(private val block: suspend SequenceScope<T>.() -> Unit) : Sequence<T> {
    override external fun iterator(): Iterator<T>
}

internal class SequenceScopeImpl<T> : SequenceScope<T> {
    override suspend external fun yield(value: T)
    override suspend fun yieldAll(elements: Iterable<T>) {
        for (element in elements) yield(element)
    }
    override suspend fun yieldAll(sequence: Sequence<T>) {
        for (element in sequence) yield(element)
    }
}

internal class SequenceIterator<T>(private val step: () -> Any?) : Iterator<T> {
    private var state: Int = 0
    private var nextValue: Any? = null
    override fun hasNext(): Boolean {
        if (state == 0) {
            val result = step()
            if (result === SequenceIterator) {
                state = 2
            } else {
                nextValue = result
                state = 1
            }
        }
        return state == 1
    }
    @Suppress("UNCHECKED_CAST")
    override fun next(): T {
        if (!hasNext()) throw NoSuchElementException()
        state = 0
        return nextValue as T
    }
    companion object
}

public fun <T> sequence(block: suspend SequenceScope<T>.() -> Unit): Sequence<T> = SequenceBuilder(block)
public fun <T> iterator(block: suspend SequenceScope<T>.() -> Unit): Iterator<T> = SequenceBuilder(block).iterator()
`);

    // --- Natives

    var natives = Kt.natives;
    var i64 = T.i64;

    function rt() {
        return Kt.session.runtime;
    }

    var math = Java.natives['java.lang.Math'];

    // Math.round of the JDK: floor(x + 0.5) with the exact rules for halves.
    function roundToLong(value) {
        if (value !== value)
            throw rt().exception('java.lang.IllegalArgumentException', 'Cannot round NaN value.');
        return math['round(double)'](value);
    }

    natives['kotlin.math'] = {
        'sqrt(Double)': function (x) { return Math.sqrt(x); },
        'sqrt(Float)': function (x) { return Math.fround(Math.sqrt(x)); },
        'cbrt(Double)': function (x) { return Math.cbrt(x); },
        'abs(Double)': function (x) { return Math.abs(x); },
        'abs(Float)': function (x) { return Math.abs(x); },
        'max(Double,Double)': function (a, b) { return math['max(double,double)'](a, b); },
        'min(Double,Double)': function (a, b) { return math['min(double,double)'](a, b); },
        'max(Float,Float)': function (a, b) { return math['max(float,float)'](a, b); },
        'min(Float,Float)': function (a, b) { return math['min(float,float)'](a, b); },
        'Double.pow(Double)': function (base, x) { return Math.pow(base, x); },
        'Double.pow(Int)': function (base, n) { return Math.pow(base, n); },
        'Float.pow(Float)': function (base, x) { return Math.fround(Math.pow(base, x)); },
        'Float.pow(Int)': function (base, n) { return Math.fround(Math.pow(base, n)); },
        'exp(Double)': function (x) { return Math.exp(x); },
        'expm1(Double)': function (x) { return Math.expm1(x); },
        'ln(Double)': function (x) { return Math.log(x); },
        'ln1p(Double)': function (x) { return Math.log1p(x); },
        'log10(Double)': function (x) { return Math.log10(x); },
        'log2(Double)': function (x) { return Math.log2(x); },
        'log(Double,Double)': function (x, base) {
            if (base <= 0 || base === 1)
                return NaN;
            return Math.log(x) / Math.log(base);
        },
        'sin(Double)': function (x) { return Math.sin(x); },
        'cos(Double)': function (x) { return Math.cos(x); },
        'tan(Double)': function (x) { return Math.tan(x); },
        'asin(Double)': function (x) { return Math.asin(x); },
        'acos(Double)': function (x) { return Math.acos(x); },
        'atan(Double)': function (x) { return Math.atan(x); },
        'atan2(Double,Double)': function (y, x) { return Math.atan2(y, x); },
        'sinh(Double)': function (x) { return Math.sinh(x); },
        'cosh(Double)': function (x) { return Math.cosh(x); },
        'tanh(Double)': function (x) { return Math.tanh(x); },
        'hypot(Double,Double)': function (x, y) { return Math.hypot(x, y); },
        'floor(Double)': function (x) { return Math.floor(x); },
        'ceil(Double)': function (x) { return Math.ceil(x); },
        // round: to the nearest integer, halves to even (Math.rint).
        'round(Double)': function (x) { return math['rint(double)'](x); },
        'truncate(Double)': function (x) { return x !== x || !isFinite(x) ? x : (x < 0 ? Math.ceil(x) : Math.floor(x)); },
        'sign(Double)': function (x) { return math['signum(double)'](x); },
        'Double.roundToInt()': function (x) {
            if (x !== x)
                throw rt().exception('java.lang.IllegalArgumentException', 'Cannot round NaN value.');
            if (x > 2147483647)
                return 2147483647;
            if (x < -2147483648)
                return -2147483648;
            return Math.floor(x + 0.5) | 0;
        },
        'Double.roundToLong()': function (x) { return roundToLong(x); },
        'Float.roundToInt()': function (x) {
            if (x !== x)
                throw rt().exception('java.lang.IllegalArgumentException', 'Cannot round NaN value.');
            return Math.max(-2147483648, Math.min(2147483647, Math.floor(x + 0.5))) | 0;
        },
        'Double.withSign(Double)': function (x, sign) {
            var negative = sign < 0 || (sign === 0 && 1 / sign < 0);
            return negative ? -Math.abs(x) : Math.abs(x);
        }
    };

    // sequence { yield(x) }: the block is a generator over a scope whose
    // yield gives the value up; the iterator steps the generator.
    var SEQUENCE_VALUE = { marker: 'sequence value' };

    natives['kotlin.sequences.SequenceBuilder'] = {
        'iterator()': function () {
            var session = Kt.session;
            var scopeClass = session.libraryClass('kotlin.sequences.SequenceScopeImpl');
            var iteratorClass = session.libraryClass('kotlin.sequences.SequenceIterator');
            scopeClass.complete();
            iteratorClass.complete();
            var scope = new session.K[scopeClass.jsId]()[scopeClass.ctors[0].jsName]();
            var generator = this.block(scope);
            var end = session.K[iteratorClass.companion.jsId].$instance;
            var step = function () {
                for (;;) {
                    var result = generator.next();
                    if (result.done)
                        return end;
                    if (result.value !== null && typeof result.value === 'object' && result.value.marker === SEQUENCE_VALUE)
                        return result.value.value;
                }
            };
            return new session.K[iteratorClass.jsId]()[iteratorClass.ctors[0].jsName](step);
        }
    };

    natives['kotlin.sequences.SequenceScopeImpl'] = {
        'yield(T)': function* (value) {
            yield { marker: SEQUENCE_VALUE, value: value };
        }
    };
    void i64;
})(globalThis);
