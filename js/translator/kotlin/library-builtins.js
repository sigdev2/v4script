// Kotlin: the builtin types in Kotlin. A class marked @JvmMapped("java
// class") is that Java class at run time; its members without bodies are
// the Java methods of the same name (or @JvmName), properties are the
// methods name(), getName() or isName(). The operators of the primitive
// types are intrinsics of the checker (Kt.primitiveMembers).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Kt = T.kotlin;
    if (Kt.library && Kt.library.units['kotlin.builtins'])
        return;

    Kt.addLibrary('kotlin.builtins', String.raw`
package kotlin

@JvmMapped("java.lang.Object")
public open class Any {
    public open operator fun equals(other: Any?): Boolean
    public open fun hashCode(): Int
    public open fun toString(): String
}

@JvmMapped("java.lang.Void")
public class Nothing private constructor()

public object Unit {
    override fun toString(): String = "kotlin.Unit"
}

@JvmMapped("java.lang.Boolean", "bool")
public class Boolean private constructor() : Comparable<Boolean> {
    companion object {}
}

@JvmMapped("java.lang.Character", "char")
public class Char private constructor() : Comparable<Char> {
    companion object {
        public const val MIN_VALUE: Char = '\u0000'
        public const val MAX_VALUE: Char = '￿'
        public const val MIN_HIGH_SURROGATE: Char = '\uD800'
        public const val MAX_HIGH_SURROGATE: Char = '\uDBFF'
        public const val MIN_LOW_SURROGATE: Char = '\uDC00'
        public const val MAX_LOW_SURROGATE: Char = '\uDFFF'
        public const val MIN_SURROGATE: Char = '\uD800'
        public const val MAX_SURROGATE: Char = '\uDFFF'
    }
}

@JvmMapped("java.lang.Number")
public abstract class Number {
    @JvmName("doubleValue") public abstract fun toDouble(): Double
    @JvmName("floatValue") public abstract fun toFloat(): Float
    @JvmName("longValue") public abstract fun toLong(): Long
    @JvmName("intValue") public abstract fun toInt(): Int
    @JvmName("shortValue") public abstract fun toShort(): Short
    @JvmName("byteValue") public abstract fun toByte(): Byte
}

@JvmMapped("java.lang.Byte", "i8")
public class Byte private constructor() : Number(), Comparable<Byte> {
    companion object {
        public const val MIN_VALUE: Byte = -128
        public const val MAX_VALUE: Byte = 127
        public const val SIZE_BYTES: Int = 1
        public const val SIZE_BITS: Int = 8
    }
}

@JvmMapped("java.lang.Short", "i16")
public class Short private constructor() : Number(), Comparable<Short> {
    companion object {
        public const val MIN_VALUE: Short = -32768
        public const val MAX_VALUE: Short = 32767
        public const val SIZE_BYTES: Int = 2
        public const val SIZE_BITS: Int = 16
    }
}

@JvmMapped("java.lang.Integer", "i32")
public class Int private constructor() : Number(), Comparable<Int> {
    companion object {
        public const val MIN_VALUE: Int = -2147483648
        public const val MAX_VALUE: Int = 2147483647
        public const val SIZE_BYTES: Int = 4
        public const val SIZE_BITS: Int = 32
    }
}

@JvmMapped("java.lang.Long", "i64")
public class Long private constructor() : Number(), Comparable<Long> {
    companion object {
        public const val MIN_VALUE: Long = -9223372036854775807L - 1L
        public const val MAX_VALUE: Long = 9223372036854775807L
        public const val SIZE_BYTES: Int = 8
        public const val SIZE_BITS: Int = 64
    }
}

@JvmMapped("java.lang.Float", "f32")
public class Float private constructor() : Number(), Comparable<Float> {
    companion object {
        public const val MIN_VALUE: Float = 1.4E-45f
        public const val MAX_VALUE: Float = 3.4028235E38f
        public const val POSITIVE_INFINITY: Float = 1.0f / 0.0f
        public const val NEGATIVE_INFINITY: Float = -1.0f / 0.0f
        public const val NaN: Float = 0.0f / 0.0f
        public const val SIZE_BYTES: Int = 4
        public const val SIZE_BITS: Int = 32
    }
}

@JvmMapped("java.lang.Double", "f64")
public class Double private constructor() : Number(), Comparable<Double> {
    companion object {
        public const val MIN_VALUE: Double = 4.9E-324
        public const val MAX_VALUE: Double = 1.7976931348623157E308
        public const val POSITIVE_INFINITY: Double = 1.0 / 0.0
        public const val NEGATIVE_INFINITY: Double = -1.0 / 0.0
        public const val NaN: Double = 0.0 / 0.0
        public const val SIZE_BYTES: Int = 8
        public const val SIZE_BITS: Int = 64
    }
}

@JvmMapped("kotlin.UByte", "u8")
public class UByte private constructor() : Comparable<UByte> {
    companion object {
        public val MIN_VALUE: UByte = 0u
        public val MAX_VALUE: UByte = 255u
    }
}

@JvmMapped("kotlin.UShort", "u16")
public class UShort private constructor() : Comparable<UShort> {
    companion object {
        public val MIN_VALUE: UShort = 0u
        public val MAX_VALUE: UShort = 65535u
    }
}

@JvmMapped("kotlin.UInt", "u32")
public class UInt private constructor() : Comparable<UInt> {
    companion object {
        public val MIN_VALUE: UInt = 0u
        public val MAX_VALUE: UInt = 4294967295u
    }
}

@JvmMapped("kotlin.ULong", "u64")
public class ULong private constructor() : Comparable<ULong> {
    companion object {
        public val MIN_VALUE: ULong = 0uL
        public val MAX_VALUE: ULong = 18446744073709551615uL
    }
}

@JvmMapped("java.lang.CharSequence")
public interface CharSequence {
    public val length: Int
    @JvmName("charAt") public operator fun get(index: Int): Char
    public fun subSequence(startIndex: Int, endIndex: Int): CharSequence
}

@JvmMapped("java.lang.String")
public class String : Comparable<String>, CharSequence {
    companion object {}
    @Intrinsic("concat") public operator fun plus(other: Any?): String
    @Intrinsic("length") override val length: Int
    @Intrinsic("charAt") override fun get(index: Int): Char
    override fun subSequence(startIndex: Int, endIndex: Int): CharSequence
    override fun compareTo(other: String): Int
}

@JvmMapped("java.lang.Comparable")
public interface Comparable<in T> {
    public operator fun compareTo(other: T): Int
}

@JvmMapped("java.lang.Throwable")
public open class Throwable(message: String?, cause: Throwable?) {
    public constructor(message: String?)
    public constructor(cause: Throwable?)
    public constructor()
    public open val message: String?
    public open val cause: Throwable?
    public fun printStackTrace()
    public fun getStackTrace(): Array<StackTraceElement>
    public fun addSuppressed(exception: Throwable)
    public fun initCause(cause: Throwable?): Throwable
}

@JvmMapped("java.lang.Enum")
public abstract class Enum<E : Enum<E>>(name: String, ordinal: Int) : Comparable<E> {
    @JvmName("name") public val name: String
    @JvmName("ordinal") public val ordinal: Int
    public final override fun compareTo(other: E): Int
}

@JvmMapped("java.lang.Cloneable")
public interface Cloneable

public interface Annotation

public interface Function<out R>

@JvmMapped("[Ljava.lang.Object;", "array")
public class Array<T>(size: Int, init: (Int) -> T) {
    @Intrinsic("arrayGet") public operator fun get(index: Int): T
    @Intrinsic("arraySet") public operator fun set(index: Int, value: T): Unit
    @Intrinsic("arraySize") public val size: Int
    @Intrinsic("arrayIterator") public operator fun iterator(): Iterator<T>
}

@JvmMapped("[I", "array")
public class IntArray(size: Int) {
    public constructor(size: Int, init: (Int) -> Int) : this(size)
    @Intrinsic("arrayGet") public operator fun get(index: Int): Int
    @Intrinsic("arraySet") public operator fun set(index: Int, value: Int): Unit
    @Intrinsic("arraySize") public val size: Int
    @Intrinsic("arrayIterator") public operator fun iterator(): IntIterator
}

@JvmMapped("[J", "array")
public class LongArray(size: Int) {
    public constructor(size: Int, init: (Int) -> Long) : this(size)
    @Intrinsic("arrayGet") public operator fun get(index: Int): Long
    @Intrinsic("arraySet") public operator fun set(index: Int, value: Long): Unit
    @Intrinsic("arraySize") public val size: Int
    @Intrinsic("arrayIterator") public operator fun iterator(): LongIterator
}

@JvmMapped("[S", "array")
public class ShortArray(size: Int) {
    public constructor(size: Int, init: (Int) -> Short) : this(size)
    @Intrinsic("arrayGet") public operator fun get(index: Int): Short
    @Intrinsic("arraySet") public operator fun set(index: Int, value: Short): Unit
    @Intrinsic("arraySize") public val size: Int
    @Intrinsic("arrayIterator") public operator fun iterator(): ShortIterator
}

@JvmMapped("[B", "array")
public class ByteArray(size: Int) {
    public constructor(size: Int, init: (Int) -> Byte) : this(size)
    @Intrinsic("arrayGet") public operator fun get(index: Int): Byte
    @Intrinsic("arraySet") public operator fun set(index: Int, value: Byte): Unit
    @Intrinsic("arraySize") public val size: Int
    @Intrinsic("arrayIterator") public operator fun iterator(): ByteIterator
}

@JvmMapped("[D", "array")
public class DoubleArray(size: Int) {
    public constructor(size: Int, init: (Int) -> Double) : this(size)
    @Intrinsic("arrayGet") public operator fun get(index: Int): Double
    @Intrinsic("arraySet") public operator fun set(index: Int, value: Double): Unit
    @Intrinsic("arraySize") public val size: Int
    @Intrinsic("arrayIterator") public operator fun iterator(): DoubleIterator
}

@JvmMapped("[F", "array")
public class FloatArray(size: Int) {
    public constructor(size: Int, init: (Int) -> Float) : this(size)
    @Intrinsic("arrayGet") public operator fun get(index: Int): Float
    @Intrinsic("arraySet") public operator fun set(index: Int, value: Float): Unit
    @Intrinsic("arraySize") public val size: Int
    @Intrinsic("arrayIterator") public operator fun iterator(): FloatIterator
}

@JvmMapped("[C", "array")
public class CharArray(size: Int) {
    public constructor(size: Int, init: (Int) -> Char) : this(size)
    @Intrinsic("arrayGet") public operator fun get(index: Int): Char
    @Intrinsic("arraySet") public operator fun set(index: Int, value: Char): Unit
    @Intrinsic("arraySize") public val size: Int
    @Intrinsic("arrayIterator") public operator fun iterator(): CharIterator
}

@JvmMapped("[Z", "array")
public class BooleanArray(size: Int) {
    public constructor(size: Int, init: (Int) -> Boolean) : this(size)
    @Intrinsic("arrayGet") public operator fun get(index: Int): Boolean
    @Intrinsic("arraySet") public operator fun set(index: Int, value: Boolean): Unit
    @Intrinsic("arraySize") public val size: Int
    @Intrinsic("arrayIterator") public operator fun iterator(): BooleanIterator
}
`);

    Kt.addLibrary('kotlin.collections.builtins', String.raw`
package kotlin.collections

@JvmMapped("java.lang.Iterable")
public interface Iterable<out T> {
    public operator fun iterator(): Iterator<T>
}

@JvmMapped("java.lang.Iterable")
public interface MutableIterable<out T> : Iterable<T> {
    override fun iterator(): MutableIterator<T>
}

@JvmMapped("java.util.Collection")
public interface Collection<out E> : Iterable<E> {
    public val size: Int
    public fun isEmpty(): Boolean
    public operator fun contains(element: @UnsafeVariance E): Boolean
    override fun iterator(): Iterator<E>
    public fun containsAll(elements: Collection<@UnsafeVariance E>): Boolean
}

@JvmMapped("java.util.Collection")
public interface MutableCollection<E> : Collection<E>, MutableIterable<E> {
    override fun iterator(): MutableIterator<E>
    public fun add(element: E): Boolean
    public fun remove(element: E): Boolean
    public fun addAll(elements: Collection<E>): Boolean
    public fun removeAll(elements: Collection<E>): Boolean
    public fun retainAll(elements: Collection<E>): Boolean
    public fun clear(): Unit
}

@JvmMapped("java.util.List")
public interface List<out E> : Collection<E> {
    override val size: Int
    override fun isEmpty(): Boolean
    override fun contains(element: @UnsafeVariance E): Boolean
    override fun iterator(): Iterator<E>
    override fun containsAll(elements: Collection<@UnsafeVariance E>): Boolean
    public operator fun get(index: Int): E
    public fun indexOf(element: @UnsafeVariance E): Int
    public fun lastIndexOf(element: @UnsafeVariance E): Int
    public fun listIterator(): ListIterator<E>
    public fun listIterator(index: Int): ListIterator<E>
    public fun subList(fromIndex: Int, toIndex: Int): List<E>
}

@JvmMapped("java.util.List")
public interface MutableList<E> : List<E>, MutableCollection<E> {
    override fun add(element: E): Boolean
    override fun remove(element: E): Boolean
    override fun addAll(elements: Collection<E>): Boolean
    public fun addAll(index: Int, elements: Collection<E>): Boolean
    override fun removeAll(elements: Collection<E>): Boolean
    override fun retainAll(elements: Collection<E>): Boolean
    override fun clear(): Unit
    public operator fun set(index: Int, element: E): E
    public fun add(index: Int, element: E): Unit
    @JvmName("remove") public fun removeAt(index: Int): E
    override fun listIterator(): MutableListIterator<E>
    override fun listIterator(index: Int): MutableListIterator<E>
    override fun subList(fromIndex: Int, toIndex: Int): MutableList<E>
}

@JvmMapped("java.util.Set")
public interface Set<out E> : Collection<E> {
    override val size: Int
    override fun isEmpty(): Boolean
    override fun contains(element: @UnsafeVariance E): Boolean
    override fun iterator(): Iterator<E>
    override fun containsAll(elements: Collection<@UnsafeVariance E>): Boolean
}

@JvmMapped("java.util.Set")
public interface MutableSet<E> : Set<E>, MutableCollection<E> {
    override fun iterator(): MutableIterator<E>
    override fun add(element: E): Boolean
    override fun remove(element: E): Boolean
    override fun addAll(elements: Collection<E>): Boolean
    override fun removeAll(elements: Collection<E>): Boolean
    override fun retainAll(elements: Collection<E>): Boolean
    override fun clear(): Unit
}

@JvmMapped("java.util.Map")
public interface Map<K, out V> {
    public val size: Int
    public fun isEmpty(): Boolean
    public fun containsKey(key: K): Boolean
    public fun containsValue(value: @UnsafeVariance V): Boolean
    public operator fun get(key: K): V?
    public fun getOrDefault(key: K, defaultValue: @UnsafeVariance V): V
    @JvmName("keySet") public val keys: Set<K>
    public val values: Collection<V>
    @JvmName("entrySet") public val entries: Set<Map.Entry<K, V>>

    @JvmMapped("java.util.Map.Entry")
    public interface Entry<out K, out V> {
        public val key: K
        public val value: V
    }
}

@JvmMapped("java.util.Map")
public interface MutableMap<K, V> : Map<K, V> {
    public fun put(key: K, value: V): V?
    public fun remove(key: K): V?
    public fun putAll(from: Map<out K, V>): Unit
    public fun clear(): Unit
    public fun putIfAbsent(key: K, value: V): V?
    @JvmName("keySet") override val keys: MutableSet<K>
    override val values: MutableCollection<V>
    @JvmName("entrySet") override val entries: MutableSet<MutableMap.MutableEntry<K, V>>

    @JvmMapped("java.util.Map.Entry")
    public interface MutableEntry<K, V> : Map.Entry<K, V> {
        public fun setValue(newValue: V): V
    }
}

@JvmMapped("java.util.Iterator")
public interface Iterator<out T> {
    public operator fun next(): T
    public operator fun hasNext(): Boolean
}

@JvmMapped("java.util.Iterator")
public interface MutableIterator<out T> : Iterator<T> {
    public fun remove(): Unit
}

@JvmMapped("java.util.ListIterator")
public interface ListIterator<out T> : Iterator<T> {
    override fun next(): T
    override fun hasNext(): Boolean
    public fun hasPrevious(): Boolean
    public fun previous(): T
    public fun nextIndex(): Int
    public fun previousIndex(): Int
}

@JvmMapped("java.util.ListIterator")
public interface MutableListIterator<T> : ListIterator<T>, MutableIterator<T> {
    override fun remove(): Unit
    public fun set(element: T): Unit
    public fun add(element: T): Unit
}
`);
})(globalThis);
