// Kotlin: the core of the standard library in Kotlin - the package kotlin
// (exceptions, Pair, Triple, error, require, check, scope functions,
// lazy), kotlin.io, kotlin.reflect, ranges and progressions. Natives (an
// external declaration) are in natives.js.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Kt = T.kotlin;
    if (Kt.library.units['kotlin.core'])
        return;

    Kt.addLibrary('kotlin.core', String.raw`
package kotlin

typealias Exception = java.lang.Exception
typealias RuntimeException = java.lang.RuntimeException
typealias Error = java.lang.Error
typealias IllegalArgumentException = java.lang.IllegalArgumentException
typealias IllegalStateException = java.lang.IllegalStateException
typealias IndexOutOfBoundsException = java.lang.IndexOutOfBoundsException
typealias UnsupportedOperationException = java.lang.UnsupportedOperationException
typealias ArithmeticException = java.lang.ArithmeticException
typealias NumberFormatException = java.lang.NumberFormatException
typealias NullPointerException = java.lang.NullPointerException
typealias ClassCastException = java.lang.ClassCastException
typealias AssertionError = java.lang.AssertionError
typealias NoSuchElementException = java.util.NoSuchElementException
typealias ConcurrentModificationException = java.util.ConcurrentModificationException
typealias Comparator<T> = java.util.Comparator<T>

public class NotImplementedError(message: String = "An operation is not implemented.") : java.lang.Error(message)

public class UninitializedPropertyAccessException(message: String) : java.lang.RuntimeException(message)

public class NoWhenBranchMatchedException(message: String = "") : java.lang.RuntimeException(if (message == "") null else message)

public class KotlinNullPointerException(message: String) : java.lang.NullPointerException(message)

public data class Pair<out A, out B>(public val first: A, public val second: B) {
    override fun toString(): String = "($first, $second)"
}

public infix fun <A, B> A.to(that: B): Pair<A, B> = Pair(this, that)

public fun <T> Pair<T, T>.toList(): List<T> = listOf(first, second)

public data class Triple<out A, out B, out C>(public val first: A, public val second: B, public val third: C) {
    override fun toString(): String = "($first, $second, $third)"
}

public fun <T> Triple<T, T, T>.toList(): List<T> = listOf(first, second, third)

public fun error(message: Any): Nothing = throw IllegalStateException(message.toString())

public fun TODO(): Nothing = throw NotImplementedError()

public fun TODO(reason: String): Nothing = throw NotImplementedError("An operation is not implemented: " + reason)

public fun require(value: Boolean): Unit {
    if (!value) throw IllegalArgumentException("Failed requirement.")
}

public inline fun require(value: Boolean, lazyMessage: () -> Any): Unit {
    if (!value) throw IllegalArgumentException(lazyMessage().toString())
}

public fun <T : Any> requireNotNull(value: T?): T {
    if (value == null) throw IllegalArgumentException("Required value was null.")
    return value
}

public inline fun <T : Any> requireNotNull(value: T?, lazyMessage: () -> Any): T {
    if (value == null) throw IllegalArgumentException(lazyMessage().toString())
    return value
}

public fun check(value: Boolean): Unit {
    if (!value) throw IllegalStateException("Check failed.")
}

public inline fun check(value: Boolean, lazyMessage: () -> Any): Unit {
    if (!value) throw IllegalStateException(lazyMessage().toString())
}

public fun <T : Any> checkNotNull(value: T?): T {
    if (value == null) throw IllegalStateException("Required value was null.")
    return value
}

public inline fun <T : Any> checkNotNull(value: T?, lazyMessage: () -> Any): T {
    if (value == null) throw IllegalStateException(lazyMessage().toString())
    return value
}

public fun assert(value: Boolean): Unit {}

public inline fun assert(value: Boolean, lazyMessage: () -> Any): Unit {}

// Threads switch only where they wait: a monitor is not needed.
public inline fun <R> synchronized(lock: Any, block: () -> R): R = block()
public inline fun repeat(times: Int, action: (Int) -> Unit): Unit {
    var index = 0
    while (index < times) {
        action(index)
        index = index + 1
    }
}

public inline fun <R> run(block: () -> R): R = block()

public inline fun <T, R> T.run(block: T.() -> R): R = block()

public inline fun <T, R> with(receiver: T, block: T.() -> R): R = receiver.block()

public inline fun <T> T.apply(block: T.() -> Unit): T {
    block()
    return this
}

public inline fun <T> T.also(block: (T) -> Unit): T {
    block(this)
    return this
}

public inline fun <T, R> T.let(block: (T) -> R): R = block(this)

public inline fun <T> T.takeIf(predicate: (T) -> Boolean): T? = if (predicate(this)) this else null

public inline fun <T> T.takeUnless(predicate: (T) -> Boolean): T? = if (!predicate(this)) this else null

public fun Any?.toString(): String = if (this == null) "null" else this.toString()

public fun Any?.hashCode(): Int = if (this == null) 0 else this.hashCode()

public operator fun String?.plus(other: Any?): String = this.toString() + other.toString()

public fun Any.identityHashCode(): Int = System.identityHashCode(this)

public interface Lazy<out T> {
    public val value: T
    public fun isInitialized(): Boolean
}

internal class SynchronizedLazy<out T>(initializer: () -> T) : Lazy<T> {
    private var initializer: (() -> T)? = initializer
    private var computed: Any? = null
    private var done: Boolean = false
    override val value: T
        get() {
            if (!done) {
                computed = initializer!!()
                done = true
                initializer = null
            }
            @Suppress("UNCHECKED_CAST")
            return computed as T
        }
    override fun isInitialized(): Boolean = done
    override fun toString(): String = if (done) value.toString() else "Lazy value not initialized yet."
}

public fun <T> lazy(initializer: () -> T): Lazy<T> = SynchronizedLazy(initializer)

public fun <T> lazyOf(value: T): Lazy<T> = SynchronizedLazy({ value })

public inline operator fun <T> Lazy<T>.getValue(thisRef: Any?, property: kotlin.reflect.KProperty<*>): T = value

public class KotlinVersion(public val major: Int, public val minor: Int, public val patch: Int) : Comparable<KotlinVersion> {
    override fun compareTo(other: KotlinVersion): Int {
        if (major != other.major) return major - other.major
        if (minor != other.minor) return minor - other.minor
        return patch - other.patch
    }
    override fun toString(): String = "$major.$minor.$patch"
    companion object {
        public val CURRENT: KotlinVersion = KotlinVersion(2, 4, 21)
    }
}

public fun Throwable.stackTraceToString(): String = toString()

public fun Throwable.printStackTrace(): Unit = (this as java.lang.Throwable).printStackTrace()

public inline fun <R> runCatching(block: () -> R): Result<R> {
    return try {
        Result.success(block())
    } catch (e: Throwable) {
        Result.failure(e)
    }
}

public class Result<out T> internal constructor(private val holder: Any?, private val error: Throwable?) {
    public val isSuccess: Boolean get() = error == null
    public val isFailure: Boolean get() = error != null
    @Suppress("UNCHECKED_CAST")
    public fun getOrNull(): T? = if (error == null) holder as T else null
    public fun exceptionOrNull(): Throwable? = error
    @Suppress("UNCHECKED_CAST")
    public fun getOrThrow(): T {
        if (error != null) throw error
        return holder as T
    }
    override fun toString(): String = if (error == null) "Success($holder)" else "Failure($error)"
    companion object {
        public fun <T> success(value: T): Result<T> = Result(value, null)
        public fun <T> failure(exception: Throwable): Result<T> = Result(null, exception)
    }
}

@Suppress("UNCHECKED_CAST")
public inline fun <R, T : R> Result<T>.getOrElse(onFailure: (exception: Throwable) -> R): R {
    val error = exceptionOrNull()
    return if (error == null) getOrNull() as T else onFailure(error)
}

@Suppress("UNCHECKED_CAST")
public fun <R, T : R> Result<T>.getOrDefault(defaultValue: R): R = if (isSuccess) getOrNull() as T else defaultValue

public inline fun <T> Result<T>.onSuccess(action: (value: T) -> Unit): Result<T> {
    if (isSuccess) {
        @Suppress("UNCHECKED_CAST")
        action(getOrNull() as T)
    }
    return this
}

public inline fun <T> Result<T>.onFailure(action: (exception: Throwable) -> Unit): Result<T> {
    val error = exceptionOrNull()
    if (error != null) action(error)
    return this
}

@Suppress("UNCHECKED_CAST")
public inline fun <R, T> Result<T>.map(transform: (value: T) -> R): Result<R> =
    if (isSuccess) Result.success(transform(getOrNull() as T)) else Result.failure(exceptionOrNull()!!)

@Suppress("UNCHECKED_CAST")
public inline fun <R, T> Result<T>.fold(onSuccess: (value: T) -> R, onFailure: (exception: Throwable) -> R): R {
    val error = exceptionOrNull()
    return if (error == null) onSuccess(getOrNull() as T) else onFailure(error)
}
`);

    Kt.addLibrary('kotlin.io', String.raw`
package kotlin.io

public external fun println(): Unit
public external fun println(message: Any?): Unit
public external fun println(message: String): Unit
public external fun println(message: Int): Unit
public external fun println(message: Long): Unit
public external fun println(message: Short): Unit
public external fun println(message: Byte): Unit
public external fun println(message: Double): Unit
public external fun println(message: Float): Unit
public external fun println(message: Char): Unit
public external fun println(message: Boolean): Unit
public external fun println(message: CharArray): Unit
public external fun print(message: Any?): Unit
public external fun print(message: String): Unit
public external fun print(message: Int): Unit
public external fun print(message: Long): Unit
public external fun print(message: Short): Unit
public external fun print(message: Byte): Unit
public external fun print(message: Double): Unit
public external fun print(message: Float): Unit
public external fun print(message: Char): Unit
public external fun print(message: Boolean): Unit
public external fun print(message: CharArray): Unit
public external fun readLine(): String?
public external fun readlnOrNull(): String?

public fun readln(): String = readlnOrNull() ?: throw ReadAfterEOFException("EOF has already been reached")

public class ReadAfterEOFException(message: String?) : java.lang.RuntimeException(message)
`);

    Kt.addLibrary('kotlin.reflect', String.raw`
package kotlin.reflect

public interface KClass<T : Any> {
    public val simpleName: String?
    public val qualifiedName: String?
    public fun isInstance(value: Any?): Boolean
}

internal class KClassImpl<T : Any>() : KClass<T> {
    override val simpleName: String? get() = simpleNameOf()
    override val qualifiedName: String? get() = qualifiedNameOf()
    external fun simpleNameOf(): String?
    external fun qualifiedNameOf(): String?
    override external fun isInstance(value: Any?): Boolean
    override fun equals(other: Any?): Boolean = this === other
    override external fun hashCode(): Int
    override fun toString(): String = "class " + (qualifiedName ?: simpleName ?: "")
}

public interface KCallable<out R> {
    public val name: String
}

public interface KProperty<out V> : KCallable<V>

internal class KPropertyImpl(override val name: String) : KProperty<Any?> {
    override fun toString(): String = "property " + name
}
`);

    Kt.addLibrary('kotlin.ranges', String.raw`
package kotlin.ranges

public interface ClosedRange<T : Comparable<T>> {
    public val start: T
    public val endInclusive: T
    public operator fun contains(value: T): Boolean = value >= start && value <= endInclusive
    public fun isEmpty(): Boolean = start > endInclusive
}

public interface OpenEndRange<T : Comparable<T>> {
    public val start: T
    public val endExclusive: T
}

internal fun differenceModulo(a: Int, b: Int, c: Int): Int {
    val left = a % c
    val right = b % c
    val result = (left - right) % c
    return if (result >= 0) result else result + c
}

internal fun differenceModulo(a: Long, b: Long, c: Long): Long {
    val left = a % c
    val right = b % c
    val result = (left - right) % c
    return if (result >= 0L) result else result + c
}

internal fun progressionLast(start: Int, end: Int, step: Int): Int = when {
    step > 0 -> if (start >= end) end else end - differenceModulo(end, start, step)
    step < 0 -> if (start <= end) end else end + differenceModulo(start, end, -step)
    else -> throw IllegalArgumentException("Step is zero.")
}

internal fun progressionLast(start: Long, end: Long, step: Long): Long = when {
    step > 0L -> if (start >= end) end else end - differenceModulo(end, start, step)
    step < 0L -> if (start <= end) end else end + differenceModulo(start, end, -step)
    else -> throw IllegalArgumentException("Step is zero.")
}

public open class IntProgression internal constructor(start: Int, endInclusive: Int, step: Int) : Iterable<Int> {
    public val first: Int = start
    public val last: Int = progressionLast(start, endInclusive, step)
    public val step: Int = step
    override fun iterator(): IntIterator = IntProgressionIterator(first, last, step)
    public open fun isEmpty(): Boolean = if (step > 0) first > last else first < last
    override fun equals(other: Any?): Boolean =
        other is IntProgression && (isEmpty() && other.isEmpty() || first == other.first && last == other.last && step == other.step)
    override fun hashCode(): Int = if (isEmpty()) -1 else 31 * (31 * first + last) + step
    override fun toString(): String = if (step > 0) "$first..$last step $step" else "$first downTo $last step $\{-step}"
    companion object {
        public fun fromClosedRange(rangeStart: Int, rangeEnd: Int, step: Int): IntProgression = IntProgression(rangeStart, rangeEnd, step)
    }
}

public class IntRange(start: Int, endInclusive: Int) : IntProgression(start, endInclusive, 1), ClosedRange<Int> {
    override val start: Int get() = first
    override val endInclusive: Int get() = last
    override fun contains(value: Int): Boolean = first <= value && value <= last
    override fun isEmpty(): Boolean = first > last
    override fun equals(other: Any?): Boolean = other is IntRange && (isEmpty() && other.isEmpty() || first == other.first && last == other.last)
    override fun hashCode(): Int = if (isEmpty()) -1 else 31 * first + last
    override fun toString(): String = "$first..$last"
    companion object {
        public val EMPTY: IntRange = IntRange(1, 0)
    }
}

internal class IntProgressionIterator(first: Int, last: Int, val step: Int) : IntIterator() {
    private val finalElement: Int = last
    private var hasNext: Boolean = if (step > 0) first <= last else first >= last
    private var next: Int = if (hasNext) first else finalElement
    override fun hasNext(): Boolean = hasNext
    override fun nextInt(): Int {
        val value = next
        if (value == finalElement) {
            if (!hasNext) throw NoSuchElementException()
            hasNext = false
        } else {
            next += step
        }
        return value
    }
}

public open class LongProgression internal constructor(start: Long, endInclusive: Long, step: Long) : Iterable<Long> {
    public val first: Long = start
    public val last: Long = progressionLast(start, endInclusive, step)
    public val step: Long = step
    override fun iterator(): LongIterator = LongProgressionIterator(first, last, step)
    public open fun isEmpty(): Boolean = if (step > 0L) first > last else first < last
    override fun equals(other: Any?): Boolean =
        other is LongProgression && (isEmpty() && other.isEmpty() || first == other.first && last == other.last && step == other.step)
    override fun hashCode(): Int = if (isEmpty()) -1 else (31 * (31 * (first xor (first ushr 32)) + (last xor (last ushr 32))) + (step xor (step ushr 32))).toInt()
    override fun toString(): String = if (step > 0L) "$first..$last step $step" else "$first downTo $last step $\{-step}"
    companion object {
        public fun fromClosedRange(rangeStart: Long, rangeEnd: Long, step: Long): LongProgression = LongProgression(rangeStart, rangeEnd, step)
    }
}

public class LongRange(start: Long, endInclusive: Long) : LongProgression(start, endInclusive, 1L), ClosedRange<Long> {
    override val start: Long get() = first
    override val endInclusive: Long get() = last
    override fun contains(value: Long): Boolean = first <= value && value <= last
    override fun isEmpty(): Boolean = first > last
    override fun equals(other: Any?): Boolean = other is LongRange && (isEmpty() && other.isEmpty() || first == other.first && last == other.last)
    override fun hashCode(): Int = if (isEmpty()) -1 else (31 * (first xor (first ushr 32)) + (last xor (last ushr 32))).toInt()
    override fun toString(): String = "$first..$last"
    companion object {
        public val EMPTY: LongRange = LongRange(1L, 0L)
    }
}

internal class LongProgressionIterator(first: Long, last: Long, val step: Long) : LongIterator() {
    private val finalElement: Long = last
    private var hasNext: Boolean = if (step > 0L) first <= last else first >= last
    private var next: Long = if (hasNext) first else finalElement
    override fun hasNext(): Boolean = hasNext
    override fun nextLong(): Long {
        val value = next
        if (value == finalElement) {
            if (!hasNext) throw NoSuchElementException()
            hasNext = false
        } else {
            next += step
        }
        return value
    }
}

public open class CharProgression internal constructor(start: Char, endInclusive: Char, step: Int) : Iterable<Char> {
    public val first: Char = start
    public val last: Char = progressionLast(start.code, endInclusive.code, step).toChar()
    public val step: Int = step
    override fun iterator(): CharIterator = CharProgressionIterator(first, last, step)
    public open fun isEmpty(): Boolean = if (step > 0) first > last else first < last
    override fun equals(other: Any?): Boolean =
        other is CharProgression && (isEmpty() && other.isEmpty() || first == other.first && last == other.last && step == other.step)
    override fun hashCode(): Int = if (isEmpty()) -1 else 31 * (31 * first.code + last.code) + step
    override fun toString(): String = if (step > 0) "$first..$last step $step" else "$first downTo $last step $\{-step}"
    companion object {
        public fun fromClosedRange(rangeStart: Char, rangeEnd: Char, step: Int): CharProgression = CharProgression(rangeStart, rangeEnd, step)
    }
}

public class CharRange(start: Char, endInclusive: Char) : CharProgression(start, endInclusive, 1), ClosedRange<Char> {
    override val start: Char get() = first
    override val endInclusive: Char get() = last
    override fun contains(value: Char): Boolean = first <= value && value <= last
    override fun isEmpty(): Boolean = first > last
    override fun equals(other: Any?): Boolean = other is CharRange && (isEmpty() && other.isEmpty() || first == other.first && last == other.last)
    override fun hashCode(): Int = if (isEmpty()) -1 else 31 * first.code + last.code
    override fun toString(): String = "$first..$last"
    companion object {
        public val EMPTY: CharRange = CharRange(1.toChar(), 0.toChar())
    }
}

internal class CharProgressionIterator(first: Char, last: Char, val step: Int) : CharIterator() {
    private val finalElement: Int = last.code
    private var hasNext: Boolean = if (step > 0) first <= last else first >= last
    private var next: Int = if (hasNext) first.code else finalElement
    override fun hasNext(): Boolean = hasNext
    override fun nextChar(): Char {
        val value = next
        if (value == finalElement) {
            if (!hasNext) throw NoSuchElementException()
            hasNext = false
        } else {
            next += step
        }
        return value.toChar()
    }
}

public infix fun Int.until(to: Int): IntRange {
    if (to <= Int.MIN_VALUE) return IntRange.EMPTY
    return IntRange(this, to - 1)
}

public infix fun Long.until(to: Long): LongRange {
    if (to <= Long.MIN_VALUE) return LongRange.EMPTY
    return LongRange(this, to - 1L)
}

public infix fun Char.until(to: Char): CharRange {
    if (to <= '\u0000') return CharRange.EMPTY
    return CharRange(this, (to.code - 1).toChar())
}

public infix fun Int.downTo(to: Int): IntProgression = IntProgression.fromClosedRange(this, to, -1)

public infix fun Long.downTo(to: Long): LongProgression = LongProgression.fromClosedRange(this, to, -1L)

public infix fun Char.downTo(to: Char): CharProgression = CharProgression.fromClosedRange(this, to, -1)

internal fun checkStepIsPositive(isPositive: Boolean, step: Number) {
    if (!isPositive) throw IllegalArgumentException("Step must be positive, was: $step.")
}

public infix fun IntProgression.step(step: Int): IntProgression {
    checkStepIsPositive(step > 0, step)
    return IntProgression.fromClosedRange(first, last, if (this.step > 0) step else -step)
}

public infix fun LongProgression.step(step: Long): LongProgression {
    checkStepIsPositive(step > 0L, step)
    return LongProgression.fromClosedRange(first, last, if (this.step > 0L) step else -step)
}

public infix fun CharProgression.step(step: Int): CharProgression {
    checkStepIsPositive(step > 0, step)
    return CharProgression.fromClosedRange(first, last, if (this.step > 0) step else -step)
}

public fun IntProgression.reversed(): IntProgression = IntProgression.fromClosedRange(last, first, -step)

public fun LongProgression.reversed(): LongProgression = LongProgression.fromClosedRange(last, first, -step)

public fun CharProgression.reversed(): CharProgression = CharProgression.fromClosedRange(last, first, -step)

public fun Int.countOneBits(): Int = java.lang.Integer.bitCount(this)
public fun Long.countOneBits(): Int = java.lang.Long.bitCount(this)
public fun Int.countLeadingZeroBits(): Int = java.lang.Integer.numberOfLeadingZeros(this)
public fun Long.countLeadingZeroBits(): Int = java.lang.Long.numberOfLeadingZeros(this)
public fun Int.countTrailingZeroBits(): Int = java.lang.Integer.numberOfTrailingZeros(this)
public fun Long.countTrailingZeroBits(): Int = java.lang.Long.numberOfTrailingZeros(this)
public fun Int.takeHighestOneBit(): Int = java.lang.Integer.highestOneBit(this)
public fun Int.rotateLeft(bitCount: Int): Int = (this shl bitCount) or (this ushr (32 - bitCount))
public fun Int.rotateRight(bitCount: Int): Int = (this ushr bitCount) or (this shl (32 - bitCount))
public fun Int.mod(other: Int): Int {
    val r = this % other
    return if (r != 0 && (r xor other) < 0) r + other else r
}
public fun Long.mod(other: Long): Long {
    val r = this % other
    return if (r != 0L && (r xor other) < 0L) r + other else r
}
public fun Double.mod(other: Double): Double {
    val r = this % other
    return if (r != 0.0 && (r < 0.0) != (other < 0.0)) r + other else r
}
public fun Int.floorDiv(other: Int): Int {
    var q = this / other
    if ((this xor other) < 0 && q * other != this) q--
    return q
}
public fun Long.floorDiv(other: Long): Long {
    var q = this / other
    if ((this xor other) < 0L && q * other != this) q--
    return q
}
public fun Int.coerceAtLeast(minimumValue: Int): Int = if (this < minimumValue) minimumValue else this
public fun Long.coerceAtLeast(minimumValue: Long): Long = if (this < minimumValue) minimumValue else this
public fun Double.coerceAtLeast(minimumValue: Double): Double = if (this < minimumValue) minimumValue else this
public fun <T : Comparable<T>> T.coerceAtLeast(minimumValue: T): T = if (this < minimumValue) minimumValue else this
public fun Int.coerceAtMost(maximumValue: Int): Int = if (this > maximumValue) maximumValue else this
public fun Long.coerceAtMost(maximumValue: Long): Long = if (this > maximumValue) maximumValue else this
public fun Double.coerceAtMost(maximumValue: Double): Double = if (this > maximumValue) maximumValue else this
public fun <T : Comparable<T>> T.coerceAtMost(maximumValue: T): T = if (this > maximumValue) maximumValue else this

public fun Int.coerceIn(minimumValue: Int, maximumValue: Int): Int {
    if (minimumValue > maximumValue) throw IllegalArgumentException("Cannot coerce value to an empty range: maximum $maximumValue is less than minimum $minimumValue.")
    if (this < minimumValue) return minimumValue
    if (this > maximumValue) return maximumValue
    return this
}

public fun Long.coerceIn(minimumValue: Long, maximumValue: Long): Long {
    if (minimumValue > maximumValue) throw IllegalArgumentException("Cannot coerce value to an empty range: maximum $maximumValue is less than minimum $minimumValue.")
    if (this < minimumValue) return minimumValue
    if (this > maximumValue) return maximumValue
    return this
}

public fun Double.coerceIn(minimumValue: Double, maximumValue: Double): Double {
    if (minimumValue > maximumValue) throw IllegalArgumentException("Cannot coerce value to an empty range: maximum $maximumValue is less than minimum $minimumValue.")
    if (this < minimumValue) return minimumValue
    if (this > maximumValue) return maximumValue
    return this
}

public fun <T : Comparable<T>> T.coerceIn(minimumValue: T, maximumValue: T): T {
    if (minimumValue > maximumValue) throw IllegalArgumentException("Cannot coerce value to an empty range: maximum $maximumValue is less than minimum $minimumValue.")
    if (this < minimumValue) return minimumValue
    if (this > maximumValue) return maximumValue
    return this
}

public fun Int.coerceIn(range: IntRange): Int = coerceIn(range.first, range.last)

public fun IntRange.random(): Int = kotlin.random.Random.nextInt(first, last + 1)

public fun IntProgression.count(): Int {
    var count = 0
    for (item in this) count++
    return count
}
`);

    Kt.addLibrary('kotlin.collections.iterators', String.raw`
package kotlin.collections

public abstract class IntIterator : Iterator<Int> {
    override final fun next(): Int = nextInt()
    public abstract fun nextInt(): Int
}

public abstract class LongIterator : Iterator<Long> {
    override final fun next(): Long = nextLong()
    public abstract fun nextLong(): Long
}

public abstract class ShortIterator : Iterator<Short> {
    override final fun next(): Short = nextShort()
    public abstract fun nextShort(): Short
}

public abstract class ByteIterator : Iterator<Byte> {
    override final fun next(): Byte = nextByte()
    public abstract fun nextByte(): Byte
}

public abstract class DoubleIterator : Iterator<Double> {
    override final fun next(): Double = nextDouble()
    public abstract fun nextDouble(): Double
}

public abstract class FloatIterator : Iterator<Float> {
    override final fun next(): Float = nextFloat()
    public abstract fun nextFloat(): Float
}

public abstract class CharIterator : Iterator<Char> {
    override final fun next(): Char = nextChar()
    public abstract fun nextChar(): Char
}

public abstract class BooleanIterator : Iterator<Boolean> {
    override final fun next(): Boolean = nextBoolean()
    public abstract fun nextBoolean(): Boolean
}

internal class ArrayIterator<T>(private val array: Array<T>) : Iterator<T> {
    private var index: Int = 0
    override fun hasNext(): Boolean = index < array.size
    override fun next(): T {
        if (index >= array.size) throw NoSuchElementException("$index")
        val value = array[index]
        index++
        return value
    }
}

internal fun <T> v4ArrayIterator(array: Array<T>): Iterator<T> = ArrayIterator(array)
`);
})(globalThis);
