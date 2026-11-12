// Kotlin: kotlin.collections in Kotlin over the collections of the JDK
// (ArrayList, LinkedHashMap, LinkedHashSet as Kotlin chooses them):
// builders, operations on Iterable, List, MutableList, Map, arrays.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Kt = T.kotlin;
    if (Kt.library.units['kotlin.collections'])
        return;

    Kt.addLibrary('kotlin.collections', String.raw`
package kotlin.collections

typealias ArrayList<E> = java.util.ArrayList<E>
typealias HashMap<K, V> = java.util.HashMap<K, V>
typealias LinkedHashMap<K, V> = java.util.LinkedHashMap<K, V>
typealias HashSet<E> = java.util.HashSet<E>
typealias LinkedHashSet<E> = java.util.LinkedHashSet<E>
typealias RandomAccess = java.util.RandomAccess
typealias ArrayDeque<E> = java.util.ArrayDeque<E>

public data class IndexedValue<out T>(public val index: Int, public val value: T)

public fun <T> emptyList(): List<T> = java.util.Collections.emptyList()
public fun <T> emptySet(): Set<T> = java.util.Collections.emptySet()
public fun <K, V> emptyMap(): Map<K, V> = java.util.Collections.emptyMap()
public fun <T> listOf(): List<T> = emptyList()
public fun <T> listOf(element: T): List<T> = java.util.Collections.singletonList(element)
public fun <T> listOf(vararg elements: T): List<T> = if (elements.size > 0) elements.asList() else emptyList()
public fun <T : Any> listOfNotNull(element: T?): List<T> = if (element != null) listOf(element) else emptyList()
public fun <T : Any> listOfNotNull(vararg elements: T?): List<T> = elements.filterNotNull()
public fun <T> mutableListOf(): MutableList<T> = ArrayList()
public fun <T> mutableListOf(vararg elements: T): MutableList<T> {
    val result = ArrayList<T>(elements.size)
    for (element in elements) result.add(element)
    return result
}
public fun <T> arrayListOf(): ArrayList<T> = ArrayList()
public fun <T> arrayListOf(vararg elements: T): ArrayList<T> {
    val result = ArrayList<T>(elements.size)
    for (element in elements) result.add(element)
    return result
}
public fun <T> setOf(): Set<T> = emptySet()
public fun <T> setOf(element: T): Set<T> = java.util.Collections.singleton(element)
public fun <T> setOf(vararg elements: T): Set<T> = elements.toSet()
public fun <T : Any> setOfNotNull(vararg elements: T?): Set<T> = elements.filterNotNull().toSet()
public fun <T> mutableSetOf(): MutableSet<T> = LinkedHashSet()
public fun <T> mutableSetOf(vararg elements: T): MutableSet<T> = elements.toCollection(LinkedHashSet<T>())
public fun <T> hashSetOf(vararg elements: T): HashSet<T> = elements.toCollection(HashSet<T>())
public fun <T> linkedSetOf(vararg elements: T): LinkedHashSet<T> = elements.toCollection(LinkedHashSet<T>())
public fun <T : Comparable<T>> sortedSetOf(vararg elements: T): java.util.TreeSet<T> = elements.toCollection(java.util.TreeSet<T>())
public fun <K, V> mapOf(): Map<K, V> = emptyMap()
public fun <K, V> mapOf(pair: Pair<K, V>): Map<K, V> = java.util.Collections.singletonMap(pair.first, pair.second)
public fun <K, V> mapOf(vararg pairs: Pair<K, V>): Map<K, V> {
    val result = LinkedHashMap<K, V>()
    for (pair in pairs) result.put(pair.first, pair.second)
    return result
}
public fun <K, V> mutableMapOf(): MutableMap<K, V> = LinkedHashMap()
public fun <K, V> mutableMapOf(vararg pairs: Pair<K, V>): MutableMap<K, V> {
    val result = LinkedHashMap<K, V>()
    for (pair in pairs) result.put(pair.first, pair.second)
    return result
}
public fun <K, V> hashMapOf(vararg pairs: Pair<K, V>): HashMap<K, V> {
    val result = HashMap<K, V>()
    for (pair in pairs) result.put(pair.first, pair.second)
    return result
}
public fun <K, V> linkedMapOf(vararg pairs: Pair<K, V>): LinkedHashMap<K, V> {
    val result = LinkedHashMap<K, V>()
    for (pair in pairs) result.put(pair.first, pair.second)
    return result
}
public fun <K : Comparable<K>, V> sortedMapOf(vararg pairs: Pair<K, V>): java.util.TreeMap<K, V> {
    val result = java.util.TreeMap<K, V>()
    for (pair in pairs) result.put(pair.first, pair.second)
    return result
}
public inline fun <T> List(size: Int, init: (index: Int) -> T): List<T> = MutableList(size, init)
public inline fun <T> MutableList(size: Int, init: (index: Int) -> T): MutableList<T> {
    val list = ArrayList<T>(size)
    var index = 0
    while (index < size) {
        list.add(init(index))
        index++
    }
    return list
}
public inline fun <T> buildList(builderAction: MutableList<T>.() -> Unit): List<T> {
    val list = ArrayList<T>()
    list.builderAction()
    return list
}
public inline fun <T> buildSet(builderAction: MutableSet<T>.() -> Unit): Set<T> {
    val set = LinkedHashSet<T>()
    set.builderAction()
    return set
}
public inline fun <K, V> buildMap(builderAction: MutableMap<K, V>.() -> Unit): Map<K, V> {
    val map = LinkedHashMap<K, V>()
    map.builderAction()
    return map
}

public val Collection<*>.indices: IntRange get() = 0..size - 1
public val <T> List<T>.lastIndex: Int get() = this.size - 1
public fun <T> Collection<T>.isNotEmpty(): Boolean = !isEmpty()
public fun <T> Collection<T>?.isNullOrEmpty(): Boolean = this == null || this.isEmpty()
public fun <T> List<T>?.orEmpty(): List<T> = this ?: emptyList()
public fun <T> Set<T>?.orEmpty(): Set<T> = this ?: emptySet()
public fun <K, V> Map<K, V>?.orEmpty(): Map<K, V> = this ?: emptyMap()
public inline fun <C : Collection<*>, R> C.ifEmpty(defaultValue: () -> R): R where C : R = if (isEmpty()) defaultValue() else this
public fun <T> Collection<T>.containsAll(elements: Collection<T>): Boolean = (this as java.util.Collection<T>).containsAll(elements)
public fun <T> Iterable<T>.contains(element: T): Boolean {
    if (this is Collection<*>) return (this as Collection<T>).contains(element)
    return indexOf(element) >= 0
}

public fun <T> Iterable<T>.iterator(): Iterator<T> = (this as java.lang.Iterable<T>).iterator()
public inline fun <T> Iterable<T>.forEach(action: (T) -> Unit): Unit {
    for (element in this) action(element)
}
public inline fun <T> Iterable<T>.forEachIndexed(action: (index: Int, T) -> Unit): Unit {
    var index = 0
    for (item in this) action(index++, item)
}
public inline fun <T> Iterable<T>.onEach(action: (T) -> Unit): Iterable<T> {
    for (element in this) action(element)
    return this
}
public inline fun <T> List<T>.onEach(action: (T) -> Unit): List<T> {
    for (element in this) action(element)
    return this
}
public inline fun <T, R> Iterable<T>.map(transform: (T) -> R): List<R> {
    val result = ArrayList<R>(if (this is Collection<*>) this.size else 10)
    for (item in this) result.add(transform(item))
    return result
}
public inline fun <T, R> Iterable<T>.mapIndexed(transform: (index: Int, T) -> R): List<R> {
    val result = ArrayList<R>(if (this is Collection<*>) this.size else 10)
    var index = 0
    for (item in this) result.add(transform(index++, item))
    return result
}
public inline fun <T, R : Any> Iterable<T>.mapNotNull(transform: (T) -> R?): List<R> {
    val result = ArrayList<R>()
    for (item in this) {
        val value = transform(item)
        if (value != null) result.add(value)
    }
    return result
}
public inline fun <T, R : Any> Iterable<T>.mapIndexedNotNull(transform: (index: Int, T) -> R?): List<R> {
    val result = ArrayList<R>()
    var index = 0
    for (item in this) {
        val value = transform(index++, item)
        if (value != null) result.add(value)
    }
    return result
}
public inline fun <T, R, C : MutableCollection<in R>> Iterable<T>.mapTo(destination: C, transform: (T) -> R): C {
    for (item in this) destination.add(transform(item))
    return destination
}
public inline fun <T> Iterable<T>.filter(predicate: (T) -> Boolean): List<T> {
    val result = ArrayList<T>()
    for (element in this) if (predicate(element)) result.add(element)
    return result
}
public inline fun <T> Iterable<T>.filterIndexed(predicate: (index: Int, T) -> Boolean): List<T> {
    val result = ArrayList<T>()
    var index = 0
    for (element in this) if (predicate(index++, element)) result.add(element)
    return result
}
public inline fun <T> Iterable<T>.filterNot(predicate: (T) -> Boolean): List<T> {
    val result = ArrayList<T>()
    for (element in this) if (!predicate(element)) result.add(element)
    return result
}
public fun <T : Any> Iterable<T?>.filterNotNull(): List<T> {
    val result = ArrayList<T>()
    for (element in this) if (element != null) result.add(element)
    return result
}
public inline fun <reified R> Iterable<*>.filterIsInstance(): List<R> {
    val result = ArrayList<R>()
    for (element in this) if (element is R) result.add(element)
    return result
}
public inline fun <T, C : MutableCollection<in T>> Iterable<T>.filterTo(destination: C, predicate: (T) -> Boolean): C {
    for (element in this) if (predicate(element)) destination.add(element)
    return destination
}
public inline fun <T, R> Iterable<T>.flatMap(transform: (T) -> Iterable<R>): List<R> {
    val result = ArrayList<R>()
    for (element in this) result.addAll(transform(element))
    return result
}
public inline fun <T, R> Iterable<T>.flatMapIndexed(transform: (index: Int, T) -> Iterable<R>): List<R> {
    val result = ArrayList<R>()
    var index = 0
    for (element in this) result.addAll(transform(index++, element))
    return result
}
public fun <T> Iterable<Iterable<T>>.flatten(): List<T> {
    val result = ArrayList<T>()
    for (element in this) result.addAll(element)
    return result
}
public inline fun <T, R> Iterable<T>.fold(initial: R, operation: (acc: R, T) -> R): R {
    var accumulator = initial
    for (element in this) accumulator = operation(accumulator, element)
    return accumulator
}
public inline fun <T, R> Iterable<T>.foldIndexed(initial: R, operation: (index: Int, acc: R, T) -> R): R {
    var index = 0
    var accumulator = initial
    for (element in this) accumulator = operation(index++, accumulator, element)
    return accumulator
}
public inline fun <T, R> List<T>.foldRight(initial: R, operation: (T, acc: R) -> R): R {
    var accumulator = initial
    var index = size - 1
    while (index >= 0) {
        accumulator = operation(get(index), accumulator)
        index--
    }
    return accumulator
}
public inline fun <S, T : S> Iterable<T>.reduce(operation: (acc: S, T) -> S): S {
    val iterator = this.iterator()
    if (!iterator.hasNext()) throw UnsupportedOperationException("Empty collection can't be reduced.")
    var accumulator: S = iterator.next()
    while (iterator.hasNext()) accumulator = operation(accumulator, iterator.next())
    return accumulator
}
public inline fun <S, T : S> Iterable<T>.reduceIndexed(operation: (index: Int, acc: S, T) -> S): S {
    val iterator = this.iterator()
    if (!iterator.hasNext()) throw UnsupportedOperationException("Empty collection can't be reduced.")
    var index = 1
    var accumulator: S = iterator.next()
    while (iterator.hasNext()) accumulator = operation(index++, accumulator, iterator.next())
    return accumulator
}
public inline fun <S, T : S> Iterable<T>.reduceOrNull(operation: (acc: S, T) -> S): S? {
    val iterator = this.iterator()
    if (!iterator.hasNext()) return null
    var accumulator: S = iterator.next()
    while (iterator.hasNext()) accumulator = operation(accumulator, iterator.next())
    return accumulator
}
public inline fun <T, R> Iterable<T>.runningFold(initial: R, operation: (acc: R, T) -> R): List<R> {
    val result = ArrayList<R>()
    var accumulator = initial
    result.add(accumulator)
    for (element in this) {
        accumulator = operation(accumulator, element)
        result.add(accumulator)
    }
    return result
}
public inline fun <S, T : S> Iterable<T>.runningReduce(operation: (acc: S, T) -> S): List<S> {
    val iterator = this.iterator()
    if (!iterator.hasNext()) return emptyList()
    var accumulator: S = iterator.next()
    val result = ArrayList<S>()
    result.add(accumulator)
    while (iterator.hasNext()) {
        accumulator = operation(accumulator, iterator.next())
        result.add(accumulator)
    }
    return result
}
public inline fun <T, R> Iterable<T>.scan(initial: R, operation: (acc: R, T) -> R): List<R> = runningFold(initial, operation)
public fun Iterable<Int>.sum(): Int {
    var sum = 0
    for (element in this) sum += element
    return sum
}
public fun Iterable<Long>.sum(): Long {
    var sum = 0L
    for (element in this) sum += element
    return sum
}
public fun Iterable<Double>.sum(): Double {
    var sum = 0.0
    for (element in this) sum += element
    return sum
}
public fun Iterable<Float>.sum(): Float {
    var sum = 0.0f
    for (element in this) sum += element
    return sum
}
public inline fun <T> Iterable<T>.sumOf(selector: (T) -> Int): Int {
    var sum = 0
    for (element in this) sum += selector(element)
    return sum
}
public inline fun <T> Iterable<T>.sumOf(selector: (T) -> Long): Long {
    var sum = 0L
    for (element in this) sum += selector(element)
    return sum
}
public inline fun <T> Iterable<T>.sumOf(selector: (T) -> Double): Double {
    var sum = 0.0
    for (element in this) sum += selector(element)
    return sum
}
public fun Iterable<Int>.average(): Double {
    var sum = 0.0
    var count = 0
    for (element in this) {
        sum += element
        count++
    }
    return if (count == 0) Double.NaN else sum / count
}
public fun Iterable<Long>.average(): Double {
    var sum = 0.0
    var count = 0
    for (element in this) {
        sum += element.toDouble()
        count++
    }
    return if (count == 0) Double.NaN else sum / count
}
public fun Iterable<Double>.average(): Double {
    var sum = 0.0
    var count = 0
    for (element in this) {
        sum += element
        count++
    }
    return if (count == 0) Double.NaN else sum / count
}
public fun <T> Iterable<T>.count(): Int {
    if (this is Collection<*>) return size
    var count = 0
    for (element in this) count++
    return count
}
public inline fun <T> Iterable<T>.count(predicate: (T) -> Boolean): Int {
    var count = 0
    for (element in this) if (predicate(element)) count++
    return count
}
public fun <T> Iterable<T>.any(): Boolean {
    if (this is Collection<*>) return !isEmpty()
    return iterator().hasNext()
}
public inline fun <T> Iterable<T>.any(predicate: (T) -> Boolean): Boolean {
    for (element in this) if (predicate(element)) return true
    return false
}
public inline fun <T> Iterable<T>.all(predicate: (T) -> Boolean): Boolean {
    for (element in this) if (!predicate(element)) return false
    return true
}
public fun <T> Iterable<T>.none(): Boolean {
    if (this is Collection<*>) return isEmpty()
    return !iterator().hasNext()
}
public inline fun <T> Iterable<T>.none(predicate: (T) -> Boolean): Boolean {
    for (element in this) if (predicate(element)) return false
    return true
}
public fun <T> Iterable<T>.first(): T {
    if (this is List<*>) {
        if (isEmpty()) throw NoSuchElementException("List is empty.")
        return (this as List<T>)[0]
    }
    val iterator = iterator()
    if (!iterator.hasNext()) throw NoSuchElementException("Collection is empty.")
    return iterator.next()
}
public fun <T> List<T>.first(): T {
    if (isEmpty()) throw NoSuchElementException("List is empty.")
    return this[0]
}
public inline fun <T> Iterable<T>.first(predicate: (T) -> Boolean): T {
    for (element in this) if (predicate(element)) return element
    throw NoSuchElementException("Collection contains no element matching the predicate.")
}
public fun <T> Iterable<T>.firstOrNull(): T? {
    if (this is List<*>) return if (isEmpty()) null else (this as List<T>)[0]
    val iterator = iterator()
    if (!iterator.hasNext()) return null
    return iterator.next()
}
public fun <T> List<T>.firstOrNull(): T? = if (isEmpty()) null else this[0]
public inline fun <T> Iterable<T>.firstOrNull(predicate: (T) -> Boolean): T? {
    for (element in this) if (predicate(element)) return element
    return null
}
public inline fun <T, R : Any> Iterable<T>.firstNotNullOf(transform: (T) -> R?): R {
    for (element in this) {
        val result = transform(element)
        if (result != null) return result
    }
    throw NoSuchElementException("No element of the collection was transformed to a non-null value.")
}
public inline fun <T, R : Any> Iterable<T>.firstNotNullOfOrNull(transform: (T) -> R?): R? {
    for (element in this) {
        val result = transform(element)
        if (result != null) return result
    }
    return null
}
public inline fun <T> Iterable<T>.find(predicate: (T) -> Boolean): T? = firstOrNull(predicate)
public inline fun <T> Iterable<T>.findLast(predicate: (T) -> Boolean): T? = lastOrNull(predicate)
public fun <T> Iterable<T>.last(): T {
    if (this is List<*>) {
        if (isEmpty()) throw NoSuchElementException("List is empty.")
        return (this as List<T>)[size - 1]
    }
    val iterator = iterator()
    if (!iterator.hasNext()) throw NoSuchElementException("Collection is empty.")
    var last = iterator.next()
    while (iterator.hasNext()) last = iterator.next()
    return last
}
public fun <T> List<T>.last(): T {
    if (isEmpty()) throw NoSuchElementException("List is empty.")
    return this[size - 1]
}
public inline fun <T> Iterable<T>.last(predicate: (T) -> Boolean): T {
    var last: T? = null
    var found = false
    for (element in this) {
        if (predicate(element)) {
            last = element
            found = true
        }
    }
    if (!found) throw NoSuchElementException("Collection contains no element matching the predicate.")
    @Suppress("UNCHECKED_CAST")
    return last as T
}
public fun <T> Iterable<T>.lastOrNull(): T? {
    if (this is List<*>) return if (isEmpty()) null else (this as List<T>)[size - 1]
    val iterator = iterator()
    if (!iterator.hasNext()) return null
    var last = iterator.next()
    while (iterator.hasNext()) last = iterator.next()
    return last
}
public fun <T> List<T>.lastOrNull(): T? = if (isEmpty()) null else this[size - 1]
public inline fun <T> Iterable<T>.lastOrNull(predicate: (T) -> Boolean): T? {
    var last: T? = null
    for (element in this) if (predicate(element)) last = element
    return last
}
public fun <T> Iterable<T>.single(): T {
    if (this is List<*>) {
        return when (size) {
            0 -> throw NoSuchElementException("List is empty.")
            1 -> (this as List<T>)[0]
            else -> throw IllegalArgumentException("List has more than one element.")
        }
    }
    val iterator = iterator()
    if (!iterator.hasNext()) throw NoSuchElementException("Collection is empty.")
    val single = iterator.next()
    if (iterator.hasNext()) throw IllegalArgumentException("Collection has more than one element.")
    return single
}
public inline fun <T> Iterable<T>.single(predicate: (T) -> Boolean): T {
    var single: T? = null
    var found = false
    for (element in this) {
        if (predicate(element)) {
            if (found) throw IllegalArgumentException("Collection contains more than one matching element.")
            single = element
            found = true
        }
    }
    if (!found) throw NoSuchElementException("Collection contains no element matching the predicate.")
    @Suppress("UNCHECKED_CAST")
    return single as T
}
public fun <T> Iterable<T>.singleOrNull(): T? {
    if (this is List<*>) return if (size == 1) (this as List<T>)[0] else null
    val iterator = iterator()
    if (!iterator.hasNext()) return null
    val single = iterator.next()
    if (iterator.hasNext()) return null
    return single
}
public inline fun <T> Iterable<T>.singleOrNull(predicate: (T) -> Boolean): T? {
    var single: T? = null
    var found = false
    for (element in this) {
        if (predicate(element)) {
            if (found) return null
            single = element
            found = true
        }
    }
    return if (found) single else null
}
public fun <T> Iterable<T>.elementAt(index: Int): T {
    if (this is List<*>) return (this as List<T>).get(index)
    return elementAtOrElse(index) { throw IndexOutOfBoundsException("Collection doesn't contain element at index $index.") }
}
public inline fun <T> Iterable<T>.elementAtOrElse(index: Int, defaultValue: (Int) -> T): T {
    if (index < 0) return defaultValue(index)
    var count = 0
    for (element in this) {
        if (index == count++) return element
    }
    return defaultValue(index)
}
public fun <T> Iterable<T>.elementAtOrNull(index: Int): T? {
    if (index < 0) return null
    var count = 0
    for (element in this) {
        if (index == count++) return element
    }
    return null
}
public fun <T> List<T>.getOrNull(index: Int): T? = if (index >= 0 && index < size) get(index) else null
public inline fun <T> List<T>.getOrElse(index: Int, defaultValue: (Int) -> T): T = if (index >= 0 && index < size) get(index) else defaultValue(index)
public operator fun <T> List<T>.component1(): T = get(0)
public operator fun <T> List<T>.component2(): T = get(1)
public operator fun <T> List<T>.component3(): T = get(2)
public operator fun <T> List<T>.component4(): T = get(3)
public operator fun <T> List<T>.component5(): T = get(4)
public fun <T> Iterable<T>.indexOf(element: T): Int {
    if (this is List<*>) return (this as List<T>).indexOf(element)
    var index = 0
    for (item in this) {
        if (element == item) return index
        index++
    }
    return -1
}
public inline fun <T> Iterable<T>.indexOfFirst(predicate: (T) -> Boolean): Int {
    var index = 0
    for (item in this) {
        if (predicate(item)) return index
        index++
    }
    return -1
}
public inline fun <T> Iterable<T>.indexOfLast(predicate: (T) -> Boolean): Int {
    var lastIndex = -1
    var index = 0
    for (item in this) {
        if (predicate(item)) lastIndex = index
        index++
    }
    return lastIndex
}
public fun <T> Iterable<T>.take(n: Int): List<T> {
    if (n < 0) throw IllegalArgumentException("Requested element count $n is less than zero.")
    val list = ArrayList<T>()
    if (n == 0) return list
    var count = 0
    for (item in this) {
        list.add(item)
        if (++count == n) break
    }
    return list
}
public inline fun <T> Iterable<T>.takeWhile(predicate: (T) -> Boolean): List<T> {
    val list = ArrayList<T>()
    for (item in this) {
        if (!predicate(item)) break
        list.add(item)
    }
    return list
}
public fun <T> List<T>.takeLast(n: Int): List<T> {
    if (n < 0) throw IllegalArgumentException("Requested element count $n is less than zero.")
    val size = this.size
    val start = if (n >= size) 0 else size - n
    val list = ArrayList<T>()
    for (index in start until size) list.add(this[index])
    return list
}
public inline fun <T> List<T>.takeLastWhile(predicate: (T) -> Boolean): List<T> {
    var index = size - 1
    while (index >= 0 && predicate(this[index])) index--
    return subList(index + 1, size).toList()
}
public fun <T> Iterable<T>.drop(n: Int): List<T> {
    if (n < 0) throw IllegalArgumentException("Requested element count $n is less than zero.")
    val list = ArrayList<T>()
    var count = 0
    for (item in this) {
        if (count >= n) list.add(item) else ++count
    }
    return list
}
public inline fun <T> Iterable<T>.dropWhile(predicate: (T) -> Boolean): List<T> {
    var yielding = false
    val list = ArrayList<T>()
    for (item in this) {
        if (yielding) list.add(item)
        else if (!predicate(item)) {
            list.add(item)
            yielding = true
        }
    }
    return list
}
public fun <T> List<T>.dropLast(n: Int): List<T> {
    if (n < 0) throw IllegalArgumentException("Requested element count $n is less than zero.")
    return take((size - n).coerceAtLeast(0))
}
public inline fun <T> List<T>.dropLastWhile(predicate: (T) -> Boolean): List<T> {
    var index = size - 1
    while (index >= 0 && predicate(this[index])) index--
    return take(index + 1)
}
public fun <T> List<T>.slice(indices: IntRange): List<T> {
    if (indices.isEmpty()) return listOf()
    return subList(indices.start, indices.endInclusive + 1).toList()
}
public fun <T> List<T>.slice(indices: Iterable<Int>): List<T> {
    val list = ArrayList<T>()
    for (index in indices) list.add(get(index))
    return list
}
public fun <T> Iterable<T>.reversed(): List<T> {
    val list = toMutableList()
    java.util.Collections.reverse(list)
    return list
}
public fun <T> List<T>.asReversed(): List<T> = reversed()
public fun <T> MutableList<T>.reverse(): Unit = java.util.Collections.reverse(this)
public fun <T : Comparable<T>> Iterable<T>.sorted(): List<T> {
    val list = toMutableList()
    java.util.Collections.sort(list)
    return list
}
public fun <T : Comparable<T>> Iterable<T>.sortedDescending(): List<T> = sortedWith(reverseOrder())
public fun <T> Iterable<T>.sortedWith(comparator: Comparator<in T>): List<T> {
    val list = toMutableList()
    java.util.Collections.sort(list, comparator)
    return list
}
public inline fun <T, R : Comparable<R>> Iterable<T>.sortedBy(crossinline selector: (T) -> R?): List<T> = sortedWith(compareBy(selector))
public inline fun <T, R : Comparable<R>> Iterable<T>.sortedByDescending(crossinline selector: (T) -> R?): List<T> = sortedWith(compareByDescending(selector))
public fun <T : Comparable<T>> MutableList<T>.sort(): Unit = java.util.Collections.sort(this)
public fun <T : Comparable<T>> MutableList<T>.sortDescending(): Unit = java.util.Collections.sort(this, reverseOrder())
public fun <T> MutableList<T>.sortWith(comparator: Comparator<in T>): Unit = java.util.Collections.sort(this, comparator)
public inline fun <T, R : Comparable<R>> MutableList<T>.sortBy(crossinline selector: (T) -> R?): Unit = sortWith(compareBy(selector))
public inline fun <T, R : Comparable<R>> MutableList<T>.sortByDescending(crossinline selector: (T) -> R?): Unit = sortWith(compareByDescending(selector))
public fun <T> Iterable<T>.shuffled(): List<T> {
    val list = toMutableList()
    java.util.Collections.shuffle(list)
    return list
}
public fun <T> Iterable<T>.shuffled(random: kotlin.random.Random): List<T> {
    val list = toMutableList()
    list.shuffle(random)
    return list
}
public fun <T> MutableList<T>.shuffle(): Unit = java.util.Collections.shuffle(this)
public fun <T> MutableList<T>.shuffle(random: kotlin.random.Random): Unit {
    var index = lastIndex
    while (index >= 1) {
        val other = random.nextInt(index + 1)
        val value = this[index]
        this[index] = this[other]
        this[other] = value
        index--
    }
}
public fun <T> Collection<T>.random(): T {
    if (isEmpty()) throw NoSuchElementException("Collection is empty.")
    return elementAt(kotlin.random.Random.nextInt(size))
}
public fun <T> Collection<T>.random(random: kotlin.random.Random): T {
    if (isEmpty()) throw NoSuchElementException("Collection is empty.")
    return elementAt(random.nextInt(size))
}
public fun <T> Collection<T>.randomOrNull(): T? = if (isEmpty()) null else random()
public fun <T> Iterable<T>.distinct(): List<T> = this.toMutableSet().toList()
public inline fun <T, K> Iterable<T>.distinctBy(selector: (T) -> K): List<T> {
    val set = HashSet<K>()
    val list = ArrayList<T>()
    for (element in this) {
        val key = selector(element)
        if (set.add(key)) list.add(element)
    }
    return list
}
public fun <T> Iterable<T>.toList(): List<T> {
    if (this is Collection<*>) {
        return when (size) {
            0 -> emptyList()
            1 -> listOf(if (this is List<*>) (this as List<T>)[0] else iterator().next())
            else -> this.toMutableList()
        }
    }
    return this.toMutableList()
}
public fun <T> Iterable<T>.toMutableList(): MutableList<T> {
    val list = ArrayList<T>()
    for (item in this) list.add(item)
    return list
}
public fun <T> Collection<T>.toMutableList(): MutableList<T> = ArrayList(this)
public fun <T> Iterable<T>.toSet(): Set<T> {
    val set = LinkedHashSet<T>()
    for (item in this) set.add(item)
    return set
}
public fun <T> Iterable<T>.toMutableSet(): MutableSet<T> {
    val set = LinkedHashSet<T>()
    for (item in this) set.add(item)
    return set
}
public fun <T> Iterable<T>.toHashSet(): HashSet<T> {
    val set = HashSet<T>()
    for (item in this) set.add(item)
    return set
}
public fun <T : Comparable<T>> Iterable<T>.toSortedSet(): java.util.TreeSet<T> {
    val set = java.util.TreeSet<T>()
    for (item in this) set.add(item)
    return set
}
public fun <T, C : MutableCollection<in T>> Iterable<T>.toCollection(destination: C): C {
    for (item in this) destination.add(item)
    return destination
}
public inline fun <reified T> Collection<T>.toTypedArray(): Array<T> {
    val array = arrayOfNulls<T>(size)
    var index = 0
    for (item in this) array[index++] = item
    @Suppress("UNCHECKED_CAST")
    return array as Array<T>
}
public fun Collection<Int>.toIntArray(): IntArray {
    val result = IntArray(size)
    var index = 0
    for (element in this) result[index++] = element
    return result
}
public fun Collection<Long>.toLongArray(): LongArray {
    val result = LongArray(size)
    var index = 0
    for (element in this) result[index++] = element
    return result
}
public fun Collection<Double>.toDoubleArray(): DoubleArray {
    val result = DoubleArray(size)
    var index = 0
    for (element in this) result[index++] = element
    return result
}
public fun Collection<Char>.toCharArray(): CharArray {
    val result = CharArray(size)
    var index = 0
    for (element in this) result[index++] = element
    return result
}
public fun Collection<Boolean>.toBooleanArray(): BooleanArray {
    val result = BooleanArray(size)
    var index = 0
    for (element in this) result[index++] = element
    return result
}
public inline fun <T, K> Iterable<T>.groupBy(keySelector: (T) -> K): Map<K, List<T>> {
    val result = LinkedHashMap<K, MutableList<T>>()
    for (element in this) {
        val key = keySelector(element)
        val list = result.getOrPut(key) { ArrayList<T>() }
        list.add(element)
    }
    return result
}
public inline fun <T, K, V> Iterable<T>.groupBy(keySelector: (T) -> K, valueTransform: (T) -> V): Map<K, List<V>> {
    val result = LinkedHashMap<K, MutableList<V>>()
    for (element in this) {
        val key = keySelector(element)
        val list = result.getOrPut(key) { ArrayList<V>() }
        list.add(valueTransform(element))
    }
    return result
}
public inline fun <T, K> Iterable<T>.groupingBy(crossinline keySelector: (T) -> K): Grouping<T, K> {
    return object : Grouping<T, K> {
        override fun sourceIterator(): Iterator<T> = this@groupingBy.iterator()
        override fun keyOf(element: T): K = keySelector(element)
    }
}
public interface Grouping<T, out K> {
    fun sourceIterator(): Iterator<T>
    fun keyOf(element: T): K
}
public fun <T, K> Grouping<T, K>.eachCount(): Map<K, Int> {
    val result = LinkedHashMap<K, Int>()
    val iterator = sourceIterator()
    while (iterator.hasNext()) {
        val key = keyOf(iterator.next())
        result.put(key, (result.get(key) ?: 0) + 1)
    }
    return result
}
public inline fun <T, K, R> Grouping<T, K>.fold(initialValue: R, operation: (accumulator: R, element: T) -> R): Map<K, R> {
    val result = LinkedHashMap<K, R>()
    val iterator = sourceIterator()
    while (iterator.hasNext()) {
        val element = iterator.next()
        val key = keyOf(element)
        @Suppress("UNCHECKED_CAST")
        val accumulator = if (result.containsKey(key)) result.get(key) as R else initialValue
        result.put(key, operation(accumulator, element))
    }
    return result
}
public inline fun <S, T : S, K> Grouping<T, K>.reduce(operation: (key: K, accumulator: S, element: T) -> S): Map<K, S> {
    val result = LinkedHashMap<K, S>()
    val iterator = sourceIterator()
    while (iterator.hasNext()) {
        val element = iterator.next()
        val key = keyOf(element)
        @Suppress("UNCHECKED_CAST")
        result.put(key, if (result.containsKey(key)) operation(key, result.get(key) as S, element) else element)
    }
    return result
}
public inline fun <T, K, V> Iterable<T>.associate(transform: (T) -> Pair<K, V>): Map<K, V> {
    val result = LinkedHashMap<K, V>()
    for (element in this) {
        val pair = transform(element)
        result.put(pair.first, pair.second)
    }
    return result
}
public inline fun <T, K> Iterable<T>.associateBy(keySelector: (T) -> K): Map<K, T> {
    val result = LinkedHashMap<K, T>()
    for (element in this) result.put(keySelector(element), element)
    return result
}
public inline fun <T, K, V> Iterable<T>.associateBy(keySelector: (T) -> K, valueTransform: (T) -> V): Map<K, V> {
    val result = LinkedHashMap<K, V>()
    for (element in this) result.put(keySelector(element), valueTransform(element))
    return result
}
public inline fun <K, V> Iterable<K>.associateWith(valueSelector: (K) -> V): Map<K, V> {
    val result = LinkedHashMap<K, V>()
    for (element in this) result.put(element, valueSelector(element))
    return result
}
public inline fun <T> Iterable<T>.partition(predicate: (T) -> Boolean): Pair<List<T>, List<T>> {
    val first = ArrayList<T>()
    val second = ArrayList<T>()
    for (element in this) {
        if (predicate(element)) first.add(element) else second.add(element)
    }
    return Pair(first, second)
}
public infix fun <T, R> Iterable<T>.zip(other: Iterable<R>): List<Pair<T, R>> {
    val first = iterator()
    val second = other.iterator()
    val list = ArrayList<Pair<T, R>>()
    while (first.hasNext() && second.hasNext()) list.add(Pair(first.next(), second.next()))
    return list
}
public inline fun <T, R, V> Iterable<T>.zip(other: Iterable<R>, transform: (a: T, b: R) -> V): List<V> {
    val first = iterator()
    val second = other.iterator()
    val list = ArrayList<V>()
    while (first.hasNext() && second.hasNext()) list.add(transform(first.next(), second.next()))
    return list
}
public fun <T> Iterable<T>.zipWithNext(): List<Pair<T, T>> {
    val iterator = iterator()
    if (!iterator.hasNext()) return emptyList()
    val result = ArrayList<Pair<T, T>>()
    var current = iterator.next()
    while (iterator.hasNext()) {
        val next = iterator.next()
        result.add(Pair(current, next))
        current = next
    }
    return result
}
public inline fun <T, R> Iterable<T>.zipWithNext(transform: (a: T, b: T) -> R): List<R> {
    val iterator = iterator()
    if (!iterator.hasNext()) return emptyList()
    val result = ArrayList<R>()
    var current = iterator.next()
    while (iterator.hasNext()) {
        val next = iterator.next()
        result.add(transform(current, next))
        current = next
    }
    return result
}
public fun <T, R> Iterable<Pair<T, R>>.unzip(): Pair<List<T>, List<R>> {
    val first = ArrayList<T>()
    val second = ArrayList<R>()
    for (pair in this) {
        first.add(pair.first)
        second.add(pair.second)
    }
    return Pair(first, second)
}
public fun <T> Iterable<T>.chunked(size: Int): List<List<T>> = windowed(size, size, true)
public inline fun <T, R> Iterable<T>.chunked(size: Int, transform: (List<T>) -> R): List<R> = chunked(size).map(transform)
public fun <T> Iterable<T>.windowed(size: Int, step: Int = 1, partialWindows: Boolean = false): List<List<T>> {
    if (size <= 0 || step <= 0) throw IllegalArgumentException(if (size != step) "Both size $size and step $step must be greater than zero." else "size $size must be greater than zero.")
    val list = this.toList()
    val result = ArrayList<List<T>>()
    var index = 0
    val total = list.size
    while (index < total) {
        val end = index + size
        if (end > total) {
            if (!partialWindows) break
            result.add(list.subList(index, total).toList())
        } else {
            result.add(list.subList(index, end).toList())
        }
        index += step
    }
    return result
}
public inline fun <T, R> Iterable<T>.windowed(size: Int, step: Int = 1, partialWindows: Boolean = false, transform: (List<T>) -> R): List<R> =
    windowed(size, step, partialWindows).map(transform)
public fun <T> Iterable<T>.withIndex(): Iterable<IndexedValue<T>> {
    val result = ArrayList<IndexedValue<T>>()
    var index = 0
    for (item in this) result.add(IndexedValue(index++, item))
    return result
}
public fun <T> Iterable<T>.joinToString(separator: CharSequence = ", ", prefix: CharSequence = "", postfix: CharSequence = "", limit: Int = -1, truncated: CharSequence = "...", transform: ((T) -> CharSequence)? = null): String {
    return joinTo(StringBuilder(), separator, prefix, postfix, limit, truncated, transform).toString()
}
public fun <T, A : Appendable> Iterable<T>.joinTo(buffer: A, separator: CharSequence = ", ", prefix: CharSequence = "", postfix: CharSequence = "", limit: Int = -1, truncated: CharSequence = "...", transform: ((T) -> CharSequence)? = null): A {
    buffer.append(prefix)
    var count = 0
    for (element in this) {
        if (++count > 1) buffer.append(separator)
        if (limit < 0 || count <= limit) {
            buffer.appendElement(element, transform)
        } else break
    }
    if (limit >= 0 && count > limit) buffer.append(truncated)
    buffer.append(postfix)
    return buffer
}
public fun <T : Comparable<T>> Iterable<T>.max(): T {
    val iterator = iterator()
    if (!iterator.hasNext()) throw NoSuchElementException()
    var max = iterator.next()
    while (iterator.hasNext()) {
        val element = iterator.next()
        if (max < element) max = element
    }
    return max
}
public fun Iterable<Double>.max(): Double {
    val iterator = iterator()
    if (!iterator.hasNext()) throw NoSuchElementException()
    var max = iterator.next()
    while (iterator.hasNext()) max = kotlin.math.max(max, iterator.next())
    return max
}
public fun <T : Comparable<T>> Iterable<T>.min(): T {
    val iterator = iterator()
    if (!iterator.hasNext()) throw NoSuchElementException()
    var min = iterator.next()
    while (iterator.hasNext()) {
        val element = iterator.next()
        if (min > element) min = element
    }
    return min
}
public fun Iterable<Double>.min(): Double {
    val iterator = iterator()
    if (!iterator.hasNext()) throw NoSuchElementException()
    var min = iterator.next()
    while (iterator.hasNext()) min = kotlin.math.min(min, iterator.next())
    return min
}
public fun <T : Comparable<T>> Iterable<T>.maxOrNull(): T? {
    val iterator = iterator()
    if (!iterator.hasNext()) return null
    var max = iterator.next()
    while (iterator.hasNext()) {
        val element = iterator.next()
        if (max < element) max = element
    }
    return max
}
public fun <T : Comparable<T>> Iterable<T>.minOrNull(): T? {
    val iterator = iterator()
    if (!iterator.hasNext()) return null
    var min = iterator.next()
    while (iterator.hasNext()) {
        val element = iterator.next()
        if (min > element) min = element
    }
    return min
}
public inline fun <T, R : Comparable<R>> Iterable<T>.maxBy(selector: (T) -> R): T {
    val iterator = iterator()
    if (!iterator.hasNext()) throw NoSuchElementException()
    var maxElement = iterator.next()
    if (!iterator.hasNext()) return maxElement
    var maxValue = selector(maxElement)
    do {
        val element = iterator.next()
        val value = selector(element)
        if (maxValue < value) {
            maxElement = element
            maxValue = value
        }
    } while (iterator.hasNext())
    return maxElement
}
public inline fun <T, R : Comparable<R>> Iterable<T>.maxByOrNull(selector: (T) -> R): T? {
    val iterator = iterator()
    if (!iterator.hasNext()) return null
    var maxElement = iterator.next()
    if (!iterator.hasNext()) return maxElement
    var maxValue = selector(maxElement)
    do {
        val element = iterator.next()
        val value = selector(element)
        if (maxValue < value) {
            maxElement = element
            maxValue = value
        }
    } while (iterator.hasNext())
    return maxElement
}
public inline fun <T, R : Comparable<R>> Iterable<T>.minBy(selector: (T) -> R): T {
    val iterator = iterator()
    if (!iterator.hasNext()) throw NoSuchElementException()
    var minElement = iterator.next()
    if (!iterator.hasNext()) return minElement
    var minValue = selector(minElement)
    do {
        val element = iterator.next()
        val value = selector(element)
        if (minValue > value) {
            minElement = element
            minValue = value
        }
    } while (iterator.hasNext())
    return minElement
}
public inline fun <T, R : Comparable<R>> Iterable<T>.minByOrNull(selector: (T) -> R): T? {
    val iterator = iterator()
    if (!iterator.hasNext()) return null
    var minElement = iterator.next()
    if (!iterator.hasNext()) return minElement
    var minValue = selector(minElement)
    do {
        val element = iterator.next()
        val value = selector(element)
        if (minValue > value) {
            minElement = element
            minValue = value
        }
    } while (iterator.hasNext())
    return minElement
}
public inline fun <T, R : Comparable<R>> Iterable<T>.maxOf(selector: (T) -> R): R {
    val iterator = iterator()
    if (!iterator.hasNext()) throw NoSuchElementException()
    var maxValue = selector(iterator.next())
    while (iterator.hasNext()) {
        val value = selector(iterator.next())
        if (maxValue < value) maxValue = value
    }
    return maxValue
}
public inline fun <T, R : Comparable<R>> Iterable<T>.minOf(selector: (T) -> R): R {
    val iterator = iterator()
    if (!iterator.hasNext()) throw NoSuchElementException()
    var minValue = selector(iterator.next())
    while (iterator.hasNext()) {
        val value = selector(iterator.next())
        if (minValue > value) minValue = value
    }
    return minValue
}
public inline fun <T, R : Comparable<R>> Iterable<T>.maxOfOrNull(selector: (T) -> R): R? {
    val iterator = iterator()
    if (!iterator.hasNext()) return null
    var maxValue = selector(iterator.next())
    while (iterator.hasNext()) {
        val value = selector(iterator.next())
        if (maxValue < value) maxValue = value
    }
    return maxValue
}
public inline fun <T, R : Comparable<R>> Iterable<T>.minOfOrNull(selector: (T) -> R): R? {
    val iterator = iterator()
    if (!iterator.hasNext()) return null
    var minValue = selector(iterator.next())
    while (iterator.hasNext()) {
        val value = selector(iterator.next())
        if (minValue > value) minValue = value
    }
    return minValue
}
public fun <T> Iterable<T>.maxWithOrNull(comparator: Comparator<in T>): T? {
    val iterator = iterator()
    if (!iterator.hasNext()) return null
    var max = iterator.next()
    while (iterator.hasNext()) {
        val element = iterator.next()
        if (comparator.compare(max, element) < 0) max = element
    }
    return max
}
public fun <T> Iterable<T>.maxWith(comparator: Comparator<in T>): T = maxWithOrNull(comparator) ?: throw NoSuchElementException()
public fun <T> Iterable<T>.minWithOrNull(comparator: Comparator<in T>): T? {
    val iterator = iterator()
    if (!iterator.hasNext()) return null
    var min = iterator.next()
    while (iterator.hasNext()) {
        val element = iterator.next()
        if (comparator.compare(min, element) > 0) min = element
    }
    return min
}
public fun <T> Iterable<T>.minWith(comparator: Comparator<in T>): T = minWithOrNull(comparator) ?: throw NoSuchElementException()
public operator fun <T> Iterable<T>.plus(element: T): List<T> {
    val result = toMutableList()
    result.add(element)
    return result
}
public operator fun <T> Iterable<T>.plus(elements: Iterable<T>): List<T> {
    val result = toMutableList()
    result.addAll(elements)
    return result
}
public operator fun <T> Iterable<T>.plus(elements: Array<out T>): List<T> {
    val result = toMutableList()
    for (element in elements) result.add(element)
    return result
}
public operator fun <T> Set<T>.plus(element: T): Set<T> {
    val result = LinkedHashSet<T>(this)
    result.add(element)
    return result
}
public operator fun <T> Set<T>.plus(elements: Iterable<T>): Set<T> {
    val result = LinkedHashSet<T>(this)
    for (element in elements) result.add(element)
    return result
}
public operator fun <T> Iterable<T>.minus(element: T): List<T> {
    val result = ArrayList<T>()
    var removed = false
    for (item in this) {
        if (!removed && item == element) removed = true else result.add(item)
    }
    return result
}
public operator fun <T> Iterable<T>.minus(elements: Iterable<T>): List<T> {
    val other = elements.toHashSet()
    return filterNot { it in other }
}
public operator fun <T> Set<T>.minus(element: T): Set<T> {
    val result = LinkedHashSet<T>(this)
    result.remove(element)
    return result
}
public operator fun <T> Set<T>.minus(elements: Iterable<T>): Set<T> {
    val result = LinkedHashSet<T>(this)
    for (element in elements) result.remove(element)
    return result
}
public infix fun <T> Iterable<T>.union(other: Iterable<T>): Set<T> {
    val set = toMutableSet()
    for (element in other) set.add(element)
    return set
}
public infix fun <T> Iterable<T>.intersect(other: Iterable<T>): Set<T> {
    val set = toMutableSet()
    set.retainAll(other.toSet())
    return set
}
public infix fun <T> Iterable<T>.subtract(other: Iterable<T>): Set<T> {
    val set = toMutableSet()
    set.removeAll(other.toSet())
    return set
}
public operator fun <T> MutableCollection<in T>.plusAssign(element: T): Unit {
    this.add(element)
}
public operator fun <T> MutableCollection<in T>.plusAssign(elements: Iterable<T>): Unit {
    for (element in elements) this.add(element)
}
public operator fun <T> MutableCollection<in T>.minusAssign(element: T): Unit {
    this.remove(element)
}
public operator fun <T> MutableCollection<in T>.minusAssign(elements: Iterable<T>): Unit {
    for (element in elements) this.remove(element)
}
public fun <T> MutableCollection<in T>.addAll(elements: Iterable<T>): Boolean {
    var changed = false
    for (element in elements) if (add(element)) changed = true
    return changed
}
public fun <T> MutableCollection<in T>.addAll(elements: Array<out T>): Boolean {
    var changed = false
    for (element in elements) if (add(element)) changed = true
    return changed
}
public inline fun <T> MutableIterable<T>.removeAll(predicate: (T) -> Boolean): Boolean {
    var changed = false
    val iterator = iterator()
    while (iterator.hasNext()) {
        if (predicate(iterator.next())) {
            iterator.remove()
            changed = true
        }
    }
    return changed
}
public inline fun <T> MutableIterable<T>.retainAll(predicate: (T) -> Boolean): Boolean {
    var changed = false
    val iterator = iterator()
    while (iterator.hasNext()) {
        if (!predicate(iterator.next())) {
            iterator.remove()
            changed = true
        }
    }
    return changed
}
public fun <T> MutableList<T>.removeFirst(): T = if (isEmpty()) throw NoSuchElementException("List is empty.") else removeAt(0)
public fun <T> MutableList<T>.removeLast(): T = if (isEmpty()) throw NoSuchElementException("List is empty.") else removeAt(lastIndex)
public fun <T> MutableList<T>.removeFirstOrNull(): T? = if (isEmpty()) null else removeAt(0)
public fun <T> MutableList<T>.removeLastOrNull(): T? = if (isEmpty()) null else removeAt(lastIndex)
public fun <T> MutableList<T>.addFirst(element: T): Unit = add(0, element)
public fun <T> MutableList<T>.addLast(element: T): Unit {
    add(element)
}
public fun <T> MutableList<T>.fill(value: T): Unit {
    for (index in 0 until size) this[index] = value
}
public fun <T : Comparable<T>> List<T?>.binarySearch(element: T?, fromIndex: Int = 0, toIndex: Int = size): Int {
    var low = fromIndex
    var high = toIndex - 1
    while (low <= high) {
        val mid = (low + high) ushr 1
        val midValue = get(mid)
        val compared = compareValues(midValue, element)
        if (compared < 0) low = mid + 1
        else if (compared > 0) high = mid - 1
        else return mid
    }
    return -(low + 1)
}
public fun <T> Iterable<T>.asIterable(): Iterable<T> = this

public operator fun <K, V> Map.Entry<K, V>.component1(): K = key
public operator fun <K, V> Map.Entry<K, V>.component2(): V = value
public fun <K, V> Map.Entry<K, V>.toPair(): Pair<K, V> = Pair(key, value)
public operator fun <K, V> MutableMap<K, V>.set(key: K, value: V): Unit {
    put(key, value)
}
public operator fun <K, V> Map<out K, V>.contains(key: K): Boolean = containsKey(key)
public fun <K, V> Map<out K, V>.isNotEmpty(): Boolean = !isEmpty()
public fun <K, V> Map<out K, V>?.isNullOrEmpty(): Boolean = this == null || isEmpty()
public operator fun <K, V> Map<out K, V>.iterator(): Iterator<Map.Entry<K, V>> = entries.iterator()
public operator fun <K, V> MutableMap<K, V>.iterator(): MutableIterator<MutableMap.MutableEntry<K, V>> = entries.iterator()
public fun <K, V> Map<K, V>.getValue(key: K): V {
    @Suppress("UNCHECKED_CAST")
    if (containsKey(key)) return get(key) as V
    throw NoSuchElementException("Key $key is missing in the map.")
}
public inline fun <K, V> Map<K, V>.getOrElse(key: K, defaultValue: () -> V): V {
    val value = get(key)
    @Suppress("UNCHECKED_CAST")
    return if (value == null && !containsKey(key)) defaultValue() else value as V
}
public inline fun <K, V> MutableMap<K, V>.getOrPut(key: K, defaultValue: () -> V): V {
    val value = get(key)
    return if (value == null) {
        val answer = defaultValue()
        put(key, answer)
        answer
    } else {
        value
    }
}
public inline fun <K, V> Map<out K, V>.forEach(action: (Map.Entry<K, V>) -> Unit): Unit {
    for (element in this) action(element)
}
public inline fun <K, V, R> Map<out K, V>.map(transform: (Map.Entry<K, V>) -> R): List<R> {
    val result = ArrayList<R>(size)
    for (item in this) result.add(transform(item))
    return result
}
public inline fun <K, V, R : Any> Map<out K, V>.mapNotNull(transform: (Map.Entry<K, V>) -> R?): List<R> {
    val result = ArrayList<R>()
    for (item in this) {
        val value = transform(item)
        if (value != null) result.add(value)
    }
    return result
}
public inline fun <K, V, R> Map<out K, V>.flatMap(transform: (Map.Entry<K, V>) -> Iterable<R>): List<R> {
    val result = ArrayList<R>()
    for (element in this) result.addAll(transform(element))
    return result
}
public inline fun <K, V, R> Map<out K, V>.mapValues(transform: (Map.Entry<K, V>) -> R): Map<K, R> {
    val result = LinkedHashMap<K, R>()
    for (entry in this) result.put(entry.key, transform(entry))
    return result
}
public inline fun <K, V, R> Map<out K, V>.mapKeys(transform: (Map.Entry<K, V>) -> R): Map<R, V> {
    val result = LinkedHashMap<R, V>()
    for (entry in this) result.put(transform(entry), entry.value)
    return result
}
public inline fun <K, V> Map<out K, V>.filter(predicate: (Map.Entry<K, V>) -> Boolean): Map<K, V> {
    val result = LinkedHashMap<K, V>()
    for (entry in this) if (predicate(entry)) result.put(entry.key, entry.value)
    return result
}
public inline fun <K, V> Map<out K, V>.filterNot(predicate: (Map.Entry<K, V>) -> Boolean): Map<K, V> {
    val result = LinkedHashMap<K, V>()
    for (entry in this) if (!predicate(entry)) result.put(entry.key, entry.value)
    return result
}
public inline fun <K, V> Map<out K, V>.filterKeys(predicate: (K) -> Boolean): Map<K, V> {
    val result = LinkedHashMap<K, V>()
    for (entry in this) if (predicate(entry.key)) result.put(entry.key, entry.value)
    return result
}
public inline fun <K, V> Map<out K, V>.filterValues(predicate: (V) -> Boolean): Map<K, V> {
    val result = LinkedHashMap<K, V>()
    for (entry in this) if (predicate(entry.value)) result.put(entry.key, entry.value)
    return result
}
public inline fun <K, V> Map<out K, V>.count(predicate: (Map.Entry<K, V>) -> Boolean): Int {
    var count = 0
    for (entry in this) if (predicate(entry)) count++
    return count
}
public inline fun <K, V> Map<out K, V>.any(predicate: (Map.Entry<K, V>) -> Boolean): Boolean {
    for (entry in this) if (predicate(entry)) return true
    return false
}
public inline fun <K, V> Map<out K, V>.all(predicate: (Map.Entry<K, V>) -> Boolean): Boolean {
    for (entry in this) if (!predicate(entry)) return false
    return true
}
public inline fun <K, V> Map<out K, V>.none(predicate: (Map.Entry<K, V>) -> Boolean): Boolean {
    for (entry in this) if (predicate(entry)) return false
    return true
}
public inline fun <K, V, R : Comparable<R>> Map<out K, V>.maxByOrNull(selector: (Map.Entry<K, V>) -> R): Map.Entry<K, V>? = entries.maxByOrNull(selector)
public inline fun <K, V, R : Comparable<R>> Map<out K, V>.minByOrNull(selector: (Map.Entry<K, V>) -> R): Map.Entry<K, V>? = entries.minByOrNull(selector)
public inline fun <K, V, R : Comparable<R>> Map<out K, V>.maxBy(selector: (Map.Entry<K, V>) -> R): Map.Entry<K, V> = entries.maxBy(selector)
public inline fun <K, V, R : Comparable<R>> Map<out K, V>.minBy(selector: (Map.Entry<K, V>) -> R): Map.Entry<K, V> = entries.minBy(selector)
public inline fun <K, V, R : Comparable<R>> Map<out K, V>.maxOf(selector: (Map.Entry<K, V>) -> R): R = entries.maxOf(selector)
public inline fun <K, V> Map<out K, V>.sumOf(selector: (Map.Entry<K, V>) -> Int): Int = entries.sumOf(selector)
public fun <K, V> Map<out K, V>.toList(): List<Pair<K, V>> {
    val result = ArrayList<Pair<K, V>>(size)
    for (entry in this) result.add(Pair(entry.key, entry.value))
    return result
}
public fun <K, V> Map<out K, V>.toMap(): Map<K, V> = LinkedHashMap<K, V>(this)
public fun <K, V> Map<out K, V>.toMutableMap(): MutableMap<K, V> = LinkedHashMap<K, V>(this)
public fun <K : Comparable<K>, V> Map<out K, V>.toSortedMap(): java.util.TreeMap<K, V> = java.util.TreeMap<K, V>(this)
public fun <K, V> Iterable<Pair<K, V>>.toMap(): Map<K, V> {
    val result = LinkedHashMap<K, V>()
    for (pair in this) result.put(pair.first, pair.second)
    return result
}
public fun <K, V> Array<out Pair<K, V>>.toMap(): Map<K, V> {
    val result = LinkedHashMap<K, V>()
    for (pair in this) result.put(pair.first, pair.second)
    return result
}
public operator fun <K, V> Map<out K, V>.plus(pair: Pair<K, V>): Map<K, V> {
    val result = LinkedHashMap<K, V>(this)
    result.put(pair.first, pair.second)
    return result
}
public operator fun <K, V> Map<out K, V>.plus(map: Map<out K, V>): Map<K, V> {
    val result = LinkedHashMap<K, V>(this)
    result.putAll(map)
    return result
}
public operator fun <K, V> Map<out K, V>.plus(pairs: Iterable<Pair<K, V>>): Map<K, V> {
    val result = LinkedHashMap<K, V>(this)
    for (pair in pairs) result.put(pair.first, pair.second)
    return result
}
public operator fun <K, V> Map<out K, V>.minus(key: K): Map<K, V> {
    val result = LinkedHashMap<K, V>(this)
    result.remove(key)
    return result
}
public operator fun <K, V> MutableMap<in K, in V>.plusAssign(pair: Pair<K, V>): Unit {
    put(pair.first, pair.second)
}
public operator fun <K, V> MutableMap<in K, in V>.plusAssign(map: Map<K, V>): Unit {
    putAll(map)
}
public operator fun <K, V> MutableMap<K, V>.minusAssign(key: K): Unit {
    remove(key)
}
public fun <K, V> MutableMap<in K, in V>.putAll(pairs: Iterable<Pair<K, V>>): Unit {
    for (pair in pairs) put(pair.first, pair.second)
}
public fun <K, V> Map<out K, V>.asIterable(): Iterable<Map.Entry<K, V>> = entries
`);

    Kt.addLibrary('kotlin.collections.arrays', String.raw`
package kotlin.collections

public external fun <T> arrayOf(vararg elements: T): Array<T>
public external fun intArrayOf(vararg elements: Int): IntArray
public external fun longArrayOf(vararg elements: Long): LongArray
public external fun shortArrayOf(vararg elements: Short): ShortArray
public external fun byteArrayOf(vararg elements: Byte): ByteArray
public external fun doubleArrayOf(vararg elements: Double): DoubleArray
public external fun floatArrayOf(vararg elements: Float): FloatArray
public external fun charArrayOf(vararg elements: Char): CharArray
public external fun booleanArrayOf(vararg elements: Boolean): BooleanArray
public external fun <T> arrayOfNulls(size: Int): Array<T?>
public external fun <T> emptyArray(): Array<T>

public val <T> Array<out T>.indices: IntRange get() = 0..size - 1
public val <T> Array<out T>.lastIndex: Int get() = size - 1
public val IntArray.indices: IntRange get() = 0..size - 1
public val IntArray.lastIndex: Int get() = size - 1
public val LongArray.indices: IntRange get() = 0..size - 1
public val DoubleArray.indices: IntRange get() = 0..size - 1
public val CharArray.indices: IntRange get() = 0..size - 1
public val BooleanArray.indices: IntRange get() = 0..size - 1
public val DoubleArray.lastIndex: Int get() = size - 1
public val LongArray.lastIndex: Int get() = size - 1
public val CharArray.lastIndex: Int get() = size - 1

public fun <T> Array<out T>.asList(): List<T> = java.util.Arrays.asList(*this)
public fun <T> Array<out T>.toList(): List<T> {
    val result = ArrayList<T>(size)
    for (element in this) result.add(element)
    return result
}
public fun <T> Array<out T>.toMutableList(): MutableList<T> {
    val result = ArrayList<T>(size)
    for (element in this) result.add(element)
    return result
}
public fun <T> Array<out T>.toSet(): Set<T> {
    val result = LinkedHashSet<T>()
    for (element in this) result.add(element)
    return result
}
public fun <T> Array<out T>.toMutableSet(): MutableSet<T> {
    val result = LinkedHashSet<T>()
    for (element in this) result.add(element)
    return result
}
public fun <T> Array<out T>.toHashSet(): HashSet<T> {
    val result = HashSet<T>()
    for (element in this) result.add(element)
    return result
}
public fun <T, C : MutableCollection<in T>> Array<out T>.toCollection(destination: C): C {
    for (item in this) destination.add(item)
    return destination
}
public fun <T> Array<out T>.isEmpty(): Boolean = size == 0
public fun <T> Array<out T>.isNotEmpty(): Boolean = size != 0
public operator fun <T> Array<out T>.contains(element: T): Boolean = indexOf(element) >= 0
public fun <T> Array<out T>.indexOf(element: T): Int {
    for (index in 0 until size) if (element == this[index]) return index
    return -1
}
public fun <T> Array<out T>.first(): T {
    if (isEmpty()) throw NoSuchElementException("Array is empty.")
    return this[0]
}
public fun <T> Array<out T>.last(): T {
    if (isEmpty()) throw NoSuchElementException("Array is empty.")
    return this[size - 1]
}
public fun <T> Array<out T>.firstOrNull(): T? = if (isEmpty()) null else this[0]
public fun <T> Array<out T>.lastOrNull(): T? = if (isEmpty()) null else this[size - 1]
public fun <T> Array<out T>.getOrNull(index: Int): T? = if (index >= 0 && index < size) this[index] else null
public inline fun <T> Array<out T>.getOrElse(index: Int, defaultValue: (Int) -> T): T = if (index >= 0 && index < size) this[index] else defaultValue(index)
public inline fun <T> Array<out T>.forEach(action: (T) -> Unit): Unit {
    for (element in this) action(element)
}
public inline fun <T> Array<out T>.forEachIndexed(action: (index: Int, T) -> Unit): Unit {
    var index = 0
    for (item in this) action(index++, item)
}
public inline fun <T, R> Array<out T>.map(transform: (T) -> R): List<R> {
    val result = ArrayList<R>(size)
    for (item in this) result.add(transform(item))
    return result
}
public inline fun <T, R> Array<out T>.mapIndexed(transform: (index: Int, T) -> R): List<R> {
    val result = ArrayList<R>(size)
    var index = 0
    for (item in this) result.add(transform(index++, item))
    return result
}
public inline fun <T, R : Any> Array<out T>.mapNotNull(transform: (T) -> R?): List<R> {
    val result = ArrayList<R>()
    for (item in this) {
        val value = transform(item)
        if (value != null) result.add(value)
    }
    return result
}
public inline fun <T> Array<out T>.filter(predicate: (T) -> Boolean): List<T> {
    val result = ArrayList<T>()
    for (element in this) if (predicate(element)) result.add(element)
    return result
}
public inline fun <T> Array<out T>.filterNot(predicate: (T) -> Boolean): List<T> {
    val result = ArrayList<T>()
    for (element in this) if (!predicate(element)) result.add(element)
    return result
}
public fun <T : Any> Array<out T?>.filterNotNull(): List<T> {
    val result = ArrayList<T>()
    for (element in this) if (element != null) result.add(element)
    return result
}
public inline fun <T, R> Array<out T>.flatMap(transform: (T) -> Iterable<R>): List<R> {
    val result = ArrayList<R>()
    for (element in this) result.addAll(transform(element))
    return result
}
public inline fun <T, R> Array<out T>.fold(initial: R, operation: (acc: R, T) -> R): R {
    var accumulator = initial
    for (element in this) accumulator = operation(accumulator, element)
    return accumulator
}
public inline fun <S, T : S> Array<out T>.reduce(operation: (acc: S, T) -> S): S {
    if (isEmpty()) throw UnsupportedOperationException("Empty array can't be reduced.")
    var accumulator: S = this[0]
    for (index in 1 until size) accumulator = operation(accumulator, this[index])
    return accumulator
}
public inline fun <T> Array<out T>.count(predicate: (T) -> Boolean): Int {
    var count = 0
    for (element in this) if (predicate(element)) count++
    return count
}
public fun <T> Array<out T>.count(): Int = size
public inline fun <T> Array<out T>.any(predicate: (T) -> Boolean): Boolean {
    for (element in this) if (predicate(element)) return true
    return false
}
public fun <T> Array<out T>.any(): Boolean = !isEmpty()
public inline fun <T> Array<out T>.all(predicate: (T) -> Boolean): Boolean {
    for (element in this) if (!predicate(element)) return false
    return true
}
public inline fun <T> Array<out T>.none(predicate: (T) -> Boolean): Boolean {
    for (element in this) if (predicate(element)) return false
    return true
}
public inline fun <T> Array<out T>.first(predicate: (T) -> Boolean): T {
    for (element in this) if (predicate(element)) return element
    throw NoSuchElementException("Array contains no element matching the predicate.")
}
public inline fun <T> Array<out T>.firstOrNull(predicate: (T) -> Boolean): T? {
    for (element in this) if (predicate(element)) return element
    return null
}
public inline fun <T> Array<out T>.find(predicate: (T) -> Boolean): T? = firstOrNull(predicate)
public inline fun <T> Array<out T>.sumOf(selector: (T) -> Int): Int {
    var sum = 0
    for (element in this) sum += selector(element)
    return sum
}
public inline fun <T> Array<out T>.sumOf(selector: (T) -> Double): Double {
    var sum = 0.0
    for (element in this) sum += selector(element)
    return sum
}
public inline fun <T, R : Comparable<R>> Array<out T>.maxByOrNull(selector: (T) -> R): T? = asList().maxByOrNull(selector)
public inline fun <T, R : Comparable<R>> Array<out T>.minByOrNull(selector: (T) -> R): T? = asList().minByOrNull(selector)
public fun <T : Comparable<T>> Array<out T>.maxOrNull(): T? = asList().maxOrNull()
public fun <T : Comparable<T>> Array<out T>.minOrNull(): T? = asList().minOrNull()
public fun <T : Comparable<T>> Array<out T>.max(): T = asList().max()
public fun <T : Comparable<T>> Array<out T>.min(): T = asList().min()
public fun <T : Comparable<T>> Array<out T>.sorted(): List<T> = asList().sorted()
public fun <T : Comparable<T>> Array<out T>.sortedDescending(): List<T> = asList().sortedDescending()
public inline fun <T, R : Comparable<R>> Array<out T>.sortedBy(crossinline selector: (T) -> R?): List<T> = asList().sortedBy(selector)
public fun <T> Array<out T>.sortedWith(comparator: Comparator<in T>): List<T> = asList().sortedWith(comparator)
public fun <T : Comparable<T>> Array<out T>.sort(): Unit = java.util.Arrays.sort(this)
public fun <T> Array<out T>.sortWith(comparator: Comparator<in T>): Unit = java.util.Arrays.sort(this, comparator)
public fun <T> Array<out T>.reversed(): List<T> = asList().reversed()
public fun <T> Array<out T>.distinct(): List<T> = toMutableSet().toList()
public fun <T> Array<out T>.joinToString(separator: CharSequence = ", ", prefix: CharSequence = "", postfix: CharSequence = "", limit: Int = -1, truncated: CharSequence = "...", transform: ((T) -> CharSequence)? = null): String =
    asList().joinToString(separator, prefix, postfix, limit, truncated, transform)
public fun <T> Array<out T>.withIndex(): Iterable<IndexedValue<T>> = asList().withIndex()
public fun <T> Array<out T>.take(n: Int): List<T> = asList().take(n)
public fun <T> Array<out T>.drop(n: Int): List<T> = asList().drop(n)
public infix fun <T, R> Array<out T>.zip(other: Array<out R>): List<Pair<T, R>> = asList().zip(other.asList())
public inline fun <T, K> Array<out T>.groupBy(keySelector: (T) -> K): Map<K, List<T>> = asList().groupBy(keySelector)
public inline fun <T, K> Array<out T>.associateBy(keySelector: (T) -> K): Map<K, T> = asList().associateBy(keySelector)
public inline fun <T> Array<out T>.partition(predicate: (T) -> Boolean): Pair<List<T>, List<T>> = asList().partition(predicate)
public fun <T> Array<out T>.asIterable(): Iterable<T> = asList()
public fun <T> Array<out T>.asSequence(): Sequence<T> = asList().asSequence()
public fun <T> Array<T>.copyOf(): Array<T> = java.util.Arrays.copyOf(this, size) as Array<T>
public fun <T> Array<T>.copyOf(newSize: Int): Array<T?> = java.util.Arrays.copyOf(this, newSize) as Array<T?>
public fun <T> Array<T>.copyOfRange(fromIndex: Int, toIndex: Int): Array<T> = java.util.Arrays.copyOfRange(this, fromIndex, toIndex) as Array<T>
public fun <T> Array<T>.fill(element: T, fromIndex: Int = 0, toIndex: Int = size): Unit {
    for (index in fromIndex until toIndex) this[index] = element
}
public fun <T> Array<out T>.contentToString(): String = java.util.Arrays.toString(this)
public fun <T> Array<out T>.contentDeepToString(): String = java.util.Arrays.deepToString(this)
public infix fun <T> Array<out T>.contentEquals(other: Array<out T>): Boolean = java.util.Arrays.equals(this, other)
public fun <T> Array<out T>.contentHashCode(): Int = java.util.Arrays.hashCode(this)
public operator fun <T> Array<T>.plus(element: T): Array<T> {
    val result = java.util.Arrays.copyOf(this, size + 1)
    result[size] = element
    @Suppress("UNCHECKED_CAST")
    return result as Array<T>
}
public inline fun <T> Array<out T>.indexOfFirst(predicate: (T) -> Boolean): Int {
    for (index in 0 until size) if (predicate(this[index])) return index
    return -1
}

public fun IntArray.toList(): List<Int> {
    val result = ArrayList<Int>(size)
    for (element in this) result.add(element)
    return result
}
public fun IntArray.toMutableList(): MutableList<Int> {
    val result = ArrayList<Int>(size)
    for (element in this) result.add(element)
    return result
}
public fun IntArray.toSet(): Set<Int> {
    val result = LinkedHashSet<Int>()
    for (element in this) result.add(element)
    return result
}
public fun IntArray.asList(): List<Int> = toList()
public fun IntArray.isEmpty(): Boolean = size == 0
public fun IntArray.isNotEmpty(): Boolean = size != 0
public operator fun IntArray.contains(element: Int): Boolean = indexOf(element) >= 0
public fun IntArray.indexOf(element: Int): Int {
    for (index in 0 until size) if (element == this[index]) return index
    return -1
}
public fun IntArray.sum(): Int {
    var sum = 0
    for (element in this) sum += element
    return sum
}
public fun IntArray.average(): Double {
    var sum = 0.0
    for (element in this) sum += element
    return if (size == 0) Double.NaN else sum / size
}
public fun IntArray.max(): Int {
    if (isEmpty()) throw NoSuchElementException()
    var max = this[0]
    for (element in this) if (max < element) max = element
    return max
}
public fun IntArray.min(): Int {
    if (isEmpty()) throw NoSuchElementException()
    var min = this[0]
    for (element in this) if (min > element) min = element
    return min
}
public fun IntArray.maxOrNull(): Int? = if (isEmpty()) null else max()
public fun IntArray.minOrNull(): Int? = if (isEmpty()) null else min()
public fun IntArray.first(): Int {
    if (isEmpty()) throw NoSuchElementException("Array is empty.")
    return this[0]
}
public fun IntArray.last(): Int {
    if (isEmpty()) throw NoSuchElementException("Array is empty.")
    return this[size - 1]
}
public inline fun IntArray.forEach(action: (Int) -> Unit): Unit {
    for (element in this) action(element)
}
public inline fun IntArray.forEachIndexed(action: (index: Int, Int) -> Unit): Unit {
    var index = 0
    for (item in this) action(index++, item)
}
public inline fun <R> IntArray.map(transform: (Int) -> R): List<R> {
    val result = ArrayList<R>(size)
    for (item in this) result.add(transform(item))
    return result
}
public inline fun <R> IntArray.mapIndexed(transform: (index: Int, Int) -> R): List<R> {
    val result = ArrayList<R>(size)
    var index = 0
    for (item in this) result.add(transform(index++, item))
    return result
}
public inline fun IntArray.filter(predicate: (Int) -> Boolean): List<Int> {
    val result = ArrayList<Int>()
    for (element in this) if (predicate(element)) result.add(element)
    return result
}
public inline fun IntArray.count(predicate: (Int) -> Boolean): Int {
    var count = 0
    for (element in this) if (predicate(element)) count++
    return count
}
public inline fun IntArray.any(predicate: (Int) -> Boolean): Boolean {
    for (element in this) if (predicate(element)) return true
    return false
}
public inline fun IntArray.all(predicate: (Int) -> Boolean): Boolean {
    for (element in this) if (!predicate(element)) return false
    return true
}
public inline fun <R> IntArray.fold(initial: R, operation: (acc: R, Int) -> R): R {
    var accumulator = initial
    for (element in this) accumulator = operation(accumulator, element)
    return accumulator
}
public inline fun IntArray.reduce(operation: (acc: Int, Int) -> Int): Int {
    if (isEmpty()) throw UnsupportedOperationException("Empty array can't be reduced.")
    var accumulator = this[0]
    for (index in 1 until size) accumulator = operation(accumulator, this[index])
    return accumulator
}
public inline fun IntArray.sumOf(selector: (Int) -> Int): Int {
    var sum = 0
    for (element in this) sum += selector(element)
    return sum
}
public fun IntArray.sorted(): List<Int> {
    val copy = copyOf()
    copy.sort()
    return copy.toList()
}
public fun IntArray.sortedDescending(): List<Int> = sorted().reversed()
public fun IntArray.sortedArray(): IntArray {
    val copy = copyOf()
    copy.sort()
    return copy
}
public fun IntArray.sort(): Unit = java.util.Arrays.sort(this)
public fun IntArray.sortDescending(): Unit {
    java.util.Arrays.sort(this)
    reverse()
}
public fun IntArray.reverse(): Unit {
    var left = 0
    var right = size - 1
    while (left < right) {
        val value = this[left]
        this[left] = this[right]
        this[right] = value
        left++
        right--
    }
}
public fun IntArray.reversed(): List<Int> = toList().reversed()
public fun IntArray.distinct(): List<Int> = toSet().toList()
public fun IntArray.joinToString(separator: CharSequence = ", ", prefix: CharSequence = "", postfix: CharSequence = "", limit: Int = -1, truncated: CharSequence = "...", transform: ((Int) -> CharSequence)? = null): String =
    toList().joinToString(separator, prefix, postfix, limit, truncated, transform)
public fun IntArray.copyOf(): IntArray = java.util.Arrays.copyOf(this, size)
public fun IntArray.copyOf(newSize: Int): IntArray = java.util.Arrays.copyOf(this, newSize)
public fun IntArray.copyOfRange(fromIndex: Int, toIndex: Int): IntArray = java.util.Arrays.copyOfRange(this, fromIndex, toIndex)
public fun IntArray.fill(element: Int, fromIndex: Int = 0, toIndex: Int = size): Unit {
    for (index in fromIndex until toIndex) this[index] = element
}
public fun IntArray.contentToString(): String = java.util.Arrays.toString(this)
public infix fun IntArray.contentEquals(other: IntArray): Boolean = java.util.Arrays.equals(this, other)
public fun IntArray.withIndex(): Iterable<IndexedValue<Int>> = toList().withIndex()
public fun IntArray.take(n: Int): List<Int> = toList().take(n)
public fun IntArray.drop(n: Int): List<Int> = toList().drop(n)
public fun IntArray.asIterable(): Iterable<Int> = toList()
public fun IntArray.asSequence(): Sequence<Int> = toList().asSequence()
public fun IntArray.toTypedArray(): Array<Int> {
    val result = arrayOfNulls<Int>(size)
    for (index in 0 until size) result[index] = this[index]
    @Suppress("UNCHECKED_CAST")
    return result as Array<Int>
}
public operator fun IntArray.plus(element: Int): IntArray {
    val result = java.util.Arrays.copyOf(this, size + 1)
    result[size] = element
    return result
}

public fun LongArray.toList(): List<Long> {
    val result = ArrayList<Long>(size)
    for (element in this) result.add(element)
    return result
}
public fun LongArray.sum(): Long {
    var sum = 0L
    for (element in this) sum += element
    return sum
}
public fun LongArray.max(): Long {
    if (isEmpty()) throw NoSuchElementException()
    var max = this[0]
    for (element in this) if (max < element) max = element
    return max
}
public fun LongArray.min(): Long {
    if (isEmpty()) throw NoSuchElementException()
    var min = this[0]
    for (element in this) if (min > element) min = element
    return min
}
public fun LongArray.isEmpty(): Boolean = size == 0
public operator fun LongArray.contains(element: Long): Boolean {
    for (item in this) if (item == element) return true
    return false
}
public inline fun LongArray.forEach(action: (Long) -> Unit): Unit {
    for (element in this) action(element)
}
public inline fun <R> LongArray.map(transform: (Long) -> R): List<R> {
    val result = ArrayList<R>(size)
    for (item in this) result.add(transform(item))
    return result
}
public fun LongArray.sort(): Unit = java.util.Arrays.sort(this)
public fun LongArray.contentToString(): String = java.util.Arrays.toString(this)
public fun LongArray.joinToString(separator: CharSequence = ", ", prefix: CharSequence = "", postfix: CharSequence = "", limit: Int = -1, truncated: CharSequence = "...", transform: ((Long) -> CharSequence)? = null): String =
    toList().joinToString(separator, prefix, postfix, limit, truncated, transform)
public fun LongArray.copyOf(): LongArray = java.util.Arrays.copyOf(this, size)
public fun LongArray.fill(element: Long, fromIndex: Int = 0, toIndex: Int = size): Unit {
    for (index in fromIndex until toIndex) this[index] = element
}

public fun DoubleArray.toList(): List<Double> {
    val result = ArrayList<Double>(size)
    for (element in this) result.add(element)
    return result
}
public fun DoubleArray.sum(): Double {
    var sum = 0.0
    for (element in this) sum += element
    return sum
}
public fun DoubleArray.average(): Double {
    var sum = 0.0
    for (element in this) sum += element
    return if (size == 0) Double.NaN else sum / size
}
public fun DoubleArray.max(): Double {
    if (isEmpty()) throw NoSuchElementException()
    var max = this[0]
    for (element in this) max = kotlin.math.max(max, element)
    return max
}
public fun DoubleArray.min(): Double {
    if (isEmpty()) throw NoSuchElementException()
    var min = this[0]
    for (element in this) min = kotlin.math.min(min, element)
    return min
}
public fun DoubleArray.isEmpty(): Boolean = size == 0
public inline fun DoubleArray.forEach(action: (Double) -> Unit): Unit {
    for (element in this) action(element)
}
public inline fun <R> DoubleArray.map(transform: (Double) -> R): List<R> {
    val result = ArrayList<R>(size)
    for (item in this) result.add(transform(item))
    return result
}
public inline fun DoubleArray.filter(predicate: (Double) -> Boolean): List<Double> {
    val result = ArrayList<Double>()
    for (element in this) if (predicate(element)) result.add(element)
    return result
}
public fun DoubleArray.sort(): Unit = java.util.Arrays.sort(this)
public fun DoubleArray.sorted(): List<Double> {
    val copy = java.util.Arrays.copyOf(this, size)
    java.util.Arrays.sort(copy)
    return copy.toList()
}
public fun DoubleArray.contentToString(): String = java.util.Arrays.toString(this)
public fun DoubleArray.joinToString(separator: CharSequence = ", ", prefix: CharSequence = "", postfix: CharSequence = "", limit: Int = -1, truncated: CharSequence = "...", transform: ((Double) -> CharSequence)? = null): String =
    toList().joinToString(separator, prefix, postfix, limit, truncated, transform)
public fun DoubleArray.copyOf(): DoubleArray = java.util.Arrays.copyOf(this, size)
public fun DoubleArray.fill(element: Double, fromIndex: Int = 0, toIndex: Int = size): Unit {
    for (index in fromIndex until toIndex) this[index] = element
}

public fun CharArray.toList(): List<Char> {
    val result = ArrayList<Char>(size)
    for (element in this) result.add(element)
    return result
}
public fun CharArray.isEmpty(): Boolean = size == 0
public inline fun CharArray.forEach(action: (Char) -> Unit): Unit {
    for (element in this) action(element)
}
public inline fun <R> CharArray.map(transform: (Char) -> R): List<R> {
    val result = ArrayList<R>(size)
    for (item in this) result.add(transform(item))
    return result
}
public fun CharArray.sort(): Unit = java.util.Arrays.sort(this)
public fun CharArray.sorted(): List<Char> {
    val copy = java.util.Arrays.copyOf(this, size)
    java.util.Arrays.sort(copy)
    return copy.toList()
}
public fun CharArray.sortedDescending(): List<Char> = sorted().reversed()
public fun CharArray.sortedArray(): CharArray {
    val copy = java.util.Arrays.copyOf(this, size)
    java.util.Arrays.sort(copy)
    return copy
}
public fun CharArray.concatToString(): String = java.lang.String.valueOf(this)
public fun CharArray.reverse(): Unit {
    var left = 0
    var right = size - 1
    while (left < right) {
        val value = this[left]
        this[left] = this[right]
        this[right] = value
        left++
        right--
    }
}
public operator fun CharArray.contains(element: Char): Boolean {
    for (item in this) if (item == element) return true
    return false
}
public fun CharArray.contentToString(): String = java.util.Arrays.toString(this)
public fun CharArray.joinToString(separator: CharSequence = ", ", prefix: CharSequence = "", postfix: CharSequence = "", limit: Int = -1, truncated: CharSequence = "...", transform: ((Char) -> CharSequence)? = null): String =
    toList().joinToString(separator, prefix, postfix, limit, truncated, transform)
public fun CharArray.copyOf(): CharArray = java.util.Arrays.copyOf(this, size)
public fun CharArray.fill(element: Char, fromIndex: Int = 0, toIndex: Int = size): Unit {
    for (index in fromIndex until toIndex) this[index] = element
}

public fun BooleanArray.toList(): List<Boolean> {
    val result = ArrayList<Boolean>(size)
    for (element in this) result.add(element)
    return result
}
public fun BooleanArray.isEmpty(): Boolean = size == 0
public inline fun BooleanArray.count(predicate: (Boolean) -> Boolean): Int {
    var count = 0
    for (element in this) if (predicate(element)) count++
    return count
}
public fun BooleanArray.fill(element: Boolean, fromIndex: Int = 0, toIndex: Int = size): Unit {
    for (index in fromIndex until toIndex) this[index] = element
}
public fun BooleanArray.contentToString(): String = java.util.Arrays.toString(this)
public inline fun BooleanArray.forEach(action: (Boolean) -> Unit): Unit {
    for (element in this) action(element)
}
public fun BooleanArray.all(): Boolean {
    for (element in this) if (!element) return false
    return true
}
public operator fun BooleanArray.contains(element: Boolean): Boolean {
    for (item in this) if (item == element) return true
    return false
}
`);

    var natives = Kt.natives;

    function rt() {
        return Kt.session.runtime;
    }

    function arrayFrom(descriptor, items) {
        return rt().arrayOf(descriptor, Array.prototype.slice.call(items));
    }

    natives['kotlin.collections'] = {
        'arrayOf(vararg T)': function (elements) { return elements; },
        'intArrayOf(vararg Int)': function (elements) { return elements; },
        'longArrayOf(vararg Long)': function (elements) { return elements; },
        'shortArrayOf(vararg Short)': function (elements) { return elements; },
        'byteArrayOf(vararg Byte)': function (elements) { return elements; },
        'doubleArrayOf(vararg Double)': function (elements) { return elements; },
        'floatArrayOf(vararg Float)': function (elements) { return elements; },
        'charArrayOf(vararg Char)': function (elements) { return elements; },
        'booleanArrayOf(vararg Boolean)': function (elements) { return elements; },
        'arrayOfNulls(Int)': function (size) { return rt().newArray('[Ljava.lang.Object;', [size]); },
        'emptyArray()': function () { return arrayFrom('[Ljava.lang.Object;', []); }
    };
})(globalThis);
