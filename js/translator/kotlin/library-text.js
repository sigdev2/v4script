// Kotlin: kotlin.text in Kotlin with natives. On the JVM most functions
// of Kotlin call java.lang.String (substring, parseInt, parseDouble,
// format, Character), so the natives call the natives of Java: the same
// results and messages.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Kt = T.kotlin;
    var Java = T.java;
    if (Kt.library.units['kotlin.text'])
        return;

    Kt.addLibrary('kotlin.text', String.raw`
package kotlin.text

typealias StringBuilder = java.lang.StringBuilder
typealias Appendable = java.lang.Appendable
typealias CharacterCodingException = java.lang.RuntimeException

public external fun String.substring(startIndex: Int): String
public external fun String.substring(startIndex: Int, endIndex: Int): String
public fun String.substring(range: IntRange): String = substring(range.start, range.endInclusive + 1)
public fun CharSequence.substring(startIndex: Int, endIndex: Int = length): String = subSequence(startIndex, endIndex).toString()
public external fun String.uppercase(): String
public external fun String.lowercase(): String
public external fun String.trim(): String
public external fun String.trimStart(): String
public external fun String.trimEnd(): String
public inline fun String.trim(predicate: (Char) -> Boolean): String {
    var start = 0
    var end = length - 1
    var startFound = false
    while (start <= end) {
        val index = if (!startFound) start else end
        val match = predicate(this[index])
        if (!startFound) {
            if (!match) startFound = true else start += 1
        } else {
            if (!match) break else end -= 1
        }
    }
    return substring(start, end + 1)
}
public fun String.trim(vararg chars: Char): String = trim { it in chars }
public fun String.trimStart(vararg chars: Char): String {
    var index = 0
    while (index < length && this[index] in chars) index++
    return substring(index)
}
public fun String.trimEnd(vararg chars: Char): String {
    var index = length
    while (index > 0 && this[index - 1] in chars) index--
    return substring(0, index)
}
public external fun String.startsWith(prefix: String, ignoreCase: Boolean = false): Boolean
public external fun String.startsWith(prefix: String, startIndex: Int, ignoreCase: Boolean = false): Boolean
public external fun String.endsWith(suffix: String, ignoreCase: Boolean = false): Boolean
public fun CharSequence.startsWith(char: Char, ignoreCase: Boolean = false): Boolean = this.length > 0 && this[0].equals(char, ignoreCase)
public fun CharSequence.endsWith(char: Char, ignoreCase: Boolean = false): Boolean = this.length > 0 && this[length - 1].equals(char, ignoreCase)
public external operator fun CharSequence.contains(other: CharSequence, ignoreCase: Boolean = false): Boolean
public external operator fun CharSequence.contains(char: Char, ignoreCase: Boolean = false): Boolean
public operator fun CharSequence.contains(regex: Regex): Boolean = regex.containsMatchIn(this)
public external fun CharSequence.indexOf(string: String, startIndex: Int = 0, ignoreCase: Boolean = false): Int
public external fun CharSequence.indexOf(char: Char, startIndex: Int = 0, ignoreCase: Boolean = false): Int
public external fun CharSequence.lastIndexOf(string: String, startIndex: Int = length - 1, ignoreCase: Boolean = false): Int
public external fun CharSequence.lastIndexOf(char: Char, startIndex: Int = length - 1, ignoreCase: Boolean = false): Int
public inline fun CharSequence.indexOfFirst(predicate: (Char) -> Boolean): Int {
    for (index in 0 until length) if (predicate(this[index])) return index
    return -1
}
public inline fun CharSequence.indexOfLast(predicate: (Char) -> Boolean): Int {
    var index = length - 1
    while (index >= 0) {
        if (predicate(this[index])) return index
        index--
    }
    return -1
}
public external fun String.replace(oldValue: String, newValue: String, ignoreCase: Boolean = false): String
public external fun String.replace(oldChar: Char, newChar: Char, ignoreCase: Boolean = false): String
public fun CharSequence.replace(regex: Regex, replacement: String): String = regex.replace(this, replacement)
public inline fun CharSequence.replace(regex: Regex, noinline transform: (MatchResult) -> CharSequence): String = regex.replace(this, transform)
public external fun String.replaceFirst(oldValue: String, newValue: String, ignoreCase: Boolean = false): String
public fun CharSequence.replaceFirst(regex: Regex, replacement: String): String = regex.replaceFirst(this, replacement)
public external fun CharSequence.split(vararg delimiters: String, ignoreCase: Boolean = false, limit: Int = 0): List<String>
public external fun CharSequence.split(vararg delimiters: Char, ignoreCase: Boolean = false, limit: Int = 0): List<String>
public fun CharSequence.split(regex: Regex, limit: Int = 0): List<String> = regex.split(this, limit)
public external fun CharSequence.lines(): List<String>
public external fun String.repeat(n: Int): String
public external fun CharSequence.reversed(): CharSequence
public fun String.reversed(): String = (this as CharSequence).reversed().toString()
public external fun String.padStart(length: Int, padChar: Char = ' '): String
public external fun String.padEnd(length: Int, padChar: Char = ' '): String
public fun CharSequence.isEmpty(): Boolean = length == 0
public fun CharSequence.isNotEmpty(): Boolean = length > 0
public external fun CharSequence.isBlank(): Boolean
public fun CharSequence.isNotBlank(): Boolean = !isBlank()
public fun CharSequence?.isNullOrEmpty(): Boolean = this == null || this.length == 0
public fun CharSequence?.isNullOrBlank(): Boolean = this == null || this.isBlank()
public fun String?.orEmpty(): String = this ?: ""
public inline fun <C : CharSequence, R> C.ifEmpty(defaultValue: () -> R): R where C : R = if (isEmpty()) defaultValue() else this
public inline fun <C : CharSequence, R> C.ifBlank(defaultValue: () -> R): R where C : R = if (isBlank()) defaultValue() else this
public val CharSequence.indices: IntRange get() = 0..length - 1
public val CharSequence.lastIndex: Int get() = length - 1
public fun CharSequence.first(): Char {
    if (isEmpty()) throw NoSuchElementException("Char sequence is empty.")
    return this[0]
}
public fun CharSequence.last(): Char {
    if (isEmpty()) throw NoSuchElementException("Char sequence is empty.")
    return this[length - 1]
}
public fun CharSequence.firstOrNull(): Char? = if (isEmpty()) null else this[0]
public fun CharSequence.lastOrNull(): Char? = if (isEmpty()) null else this[length - 1]
public inline fun CharSequence.first(predicate: (Char) -> Boolean): Char {
    for (element in this) if (predicate(element)) return element
    throw NoSuchElementException("Char sequence contains no character matching the predicate.")
}
public inline fun CharSequence.firstOrNull(predicate: (Char) -> Boolean): Char? {
    for (element in this) if (predicate(element)) return element
    return null
}
public fun CharSequence.getOrNull(index: Int): Char? = if (index >= 0 && index < length) get(index) else null
public fun CharSequence.elementAt(index: Int): Char = get(index)
public operator fun CharSequence.iterator(): CharIterator = StringCharIterator(this)
internal class StringCharIterator(private val text: CharSequence) : CharIterator() {
    private var index = 0
    override fun hasNext(): Boolean = index < text.length
    override fun nextChar(): Char = text[index++]
}
public inline fun CharSequence.forEach(action: (Char) -> Unit) {
    for (element in this) action(element)
}
public inline fun CharSequence.forEachIndexed(action: (index: Int, Char) -> Unit) {
    var index = 0
    for (item in this) action(index++, item)
}
public inline fun <R> CharSequence.map(transform: (Char) -> R): List<R> {
    val result = ArrayList<R>(length)
    for (item in this) result.add(transform(item))
    return result
}
public inline fun <R> CharSequence.mapIndexed(transform: (index: Int, Char) -> R): List<R> {
    val result = ArrayList<R>(length)
    var index = 0
    for (item in this) result.add(transform(index++, item))
    return result
}
public inline fun <R : Any> CharSequence.mapNotNull(transform: (Char) -> R?): List<R> {
    val result = ArrayList<R>()
    for (item in this) {
        val value = transform(item)
        if (value != null) result.add(value)
    }
    return result
}
public inline fun String.filter(predicate: (Char) -> Boolean): String {
    val result = StringBuilder()
    for (index in 0 until length) {
        val element = get(index)
        if (predicate(element)) result.append(element)
    }
    return result.toString()
}
public inline fun String.filterNot(predicate: (Char) -> Boolean): String = filter { !predicate(it) }
public inline fun CharSequence.count(predicate: (Char) -> Boolean): Int {
    var count = 0
    for (element in this) if (predicate(element)) ++count
    return count
}
public fun CharSequence.count(): Int = length
public inline fun CharSequence.any(predicate: (Char) -> Boolean): Boolean {
    for (element in this) if (predicate(element)) return true
    return false
}
public fun CharSequence.any(): Boolean = !isEmpty()
public inline fun CharSequence.all(predicate: (Char) -> Boolean): Boolean {
    for (element in this) if (!predicate(element)) return false
    return true
}
public inline fun CharSequence.none(predicate: (Char) -> Boolean): Boolean {
    for (element in this) if (predicate(element)) return false
    return true
}
public inline fun <R> CharSequence.fold(initial: R, operation: (acc: R, Char) -> R): R {
    var accumulator = initial
    for (element in this) accumulator = operation(accumulator, element)
    return accumulator
}
public inline fun CharSequence.sumOf(selector: (Char) -> Int): Int {
    var sum = 0
    for (element in this) sum += selector(element)
    return sum
}
public fun CharSequence.toList(): List<Char> {
    val result = ArrayList<Char>(length)
    for (item in this) result.add(item)
    return result
}
public fun CharSequence.toMutableList(): MutableList<Char> {
    val result = ArrayList<Char>(length)
    for (item in this) result.add(item)
    return result
}
public fun CharSequence.toSet(): Set<Char> {
    val result = LinkedHashSet<Char>()
    for (item in this) result.add(item)
    return result
}
public fun CharSequence.toHashSet(): HashSet<Char> {
    val result = HashSet<Char>()
    for (item in this) result.add(item)
    return result
}
public fun CharSequence.withIndex(): Iterable<IndexedValue<Char>> = toList().withIndex()
public fun CharSequence.asIterable(): Iterable<Char> = toList()
public fun CharSequence.asSequence(): Sequence<Char> = toList().asSequence()
public fun CharSequence.chunked(size: Int): List<String> = windowed(size, size, true)
public fun CharSequence.windowed(size: Int, step: Int = 1, partialWindows: Boolean = false): List<String> {
    if (size <= 0 || step <= 0) throw IllegalArgumentException(if (size != step) "Both size $size and step $step must be greater than zero." else "size $size must be greater than zero.")
    val result = ArrayList<String>()
    var index = 0
    while (index < length) {
        val end = index + size
        if (end > length) {
            if (!partialWindows) break
            result.add(subSequence(index, length).toString())
        } else {
            result.add(subSequence(index, end).toString())
        }
        index += step
    }
    return result
}
public fun CharSequence.zipWithNext(): List<Pair<Char, Char>> {
    val result = ArrayList<Pair<Char, Char>>()
    for (index in 0 until length - 1) result.add(Pair(this[index], this[index + 1]))
    return result
}
public fun CharSequence.groupingByChars(): Map<Char, Int> {
    val result = LinkedHashMap<Char, Int>()
    for (item in this) result[item] = (result[item] ?: 0) + 1
    return result
}
public fun String.take(n: Int): String {
    if (n < 0) throw IllegalArgumentException("Requested character count $n is less than zero.")
    return substring(0, if (n < length) n else length)
}
public fun String.takeLast(n: Int): String {
    if (n < 0) throw IllegalArgumentException("Requested character count $n is less than zero.")
    return substring(length - (if (n < length) n else length))
}
public fun String.drop(n: Int): String {
    if (n < 0) throw IllegalArgumentException("Requested character count $n is less than zero.")
    return substring(if (n < length) n else length)
}
public fun String.dropLast(n: Int): String {
    if (n < 0) throw IllegalArgumentException("Requested character count $n is less than zero.")
    return take((length - n).coerceAtLeast(0))
}
public inline fun String.takeWhile(predicate: (Char) -> Boolean): String {
    for (index in 0 until length) if (!predicate(this[index])) return substring(0, index)
    return this
}
public inline fun String.dropWhile(predicate: (Char) -> Boolean): String {
    for (index in 0 until length) if (!predicate(this[index])) return substring(index)
    return ""
}
public fun String.removePrefix(prefix: CharSequence): String = if (startsWith(prefix.toString())) substring(prefix.length) else this
public fun String.removeSuffix(suffix: CharSequence): String = if (endsWith(suffix.toString())) substring(0, length - suffix.length) else this
public fun String.removeSurrounding(delimiter: CharSequence): String = removeSurrounding(delimiter, delimiter)
public fun String.removeSurrounding(prefix: CharSequence, suffix: CharSequence): String {
    if (length >= prefix.length + suffix.length && startsWith(prefix.toString()) && endsWith(suffix.toString()))
        return substring(prefix.length, length - suffix.length)
    return this
}
public fun String.substringBefore(delimiter: String, missingDelimiterValue: String = this): String {
    val index = indexOf(delimiter)
    return if (index == -1) missingDelimiterValue else substring(0, index)
}
public fun String.substringBefore(delimiter: Char, missingDelimiterValue: String = this): String {
    val index = indexOf(delimiter)
    return if (index == -1) missingDelimiterValue else substring(0, index)
}
public fun String.substringAfter(delimiter: String, missingDelimiterValue: String = this): String {
    val index = indexOf(delimiter)
    return if (index == -1) missingDelimiterValue else substring(index + delimiter.length, length)
}
public fun String.substringAfter(delimiter: Char, missingDelimiterValue: String = this): String {
    val index = indexOf(delimiter)
    return if (index == -1) missingDelimiterValue else substring(index + 1, length)
}
public fun String.substringBeforeLast(delimiter: String, missingDelimiterValue: String = this): String {
    val index = lastIndexOf(delimiter)
    return if (index == -1) missingDelimiterValue else substring(0, index)
}
public fun String.substringBeforeLast(delimiter: Char, missingDelimiterValue: String = this): String {
    val index = lastIndexOf(delimiter)
    return if (index == -1) missingDelimiterValue else substring(0, index)
}
public fun String.substringAfterLast(delimiter: String, missingDelimiterValue: String = this): String {
    val index = lastIndexOf(delimiter)
    return if (index == -1) missingDelimiterValue else substring(index + delimiter.length, length)
}
public fun String.substringAfterLast(delimiter: Char, missingDelimiterValue: String = this): String {
    val index = lastIndexOf(delimiter)
    return if (index == -1) missingDelimiterValue else substring(index + 1, length)
}
public external fun String.toInt(): Int
public external fun String.toInt(radix: Int): Int
public external fun String.toLong(): Long
public external fun String.toLong(radix: Int): Long
public external fun String.toShort(): Short
public external fun String.toByte(): Byte
public external fun String.toDouble(): Double
public external fun String.toFloat(): Float
public external fun String.toIntOrNull(): Int?
public external fun String.toIntOrNull(radix: Int): Int?
public external fun String.toLongOrNull(): Long?
public external fun String.toDoubleOrNull(): Double?
public external fun String.toFloatOrNull(): Float?
public external fun String.toBoolean(): Boolean
public fun String.toBooleanStrict(): Boolean = when (this) {
    "true" -> true
    "false" -> false
    else -> throw IllegalArgumentException("The string doesn't represent a boolean value: $this")
}
public fun String.toBooleanStrictOrNull(): Boolean? = when (this) {
    "true" -> true
    "false" -> false
    else -> null
}
public external fun String.toCharArray(): CharArray
public external fun String.format(vararg args: Any?): String
public external fun String.Companion.format(format: String, vararg args: Any?): String
public external fun String.equals(other: String?, ignoreCase: Boolean): Boolean
public external fun String.compareTo(other: String, ignoreCase: Boolean): Int
public fun CharSequence.contentEquals(other: CharSequence?): Boolean = this.toString() == other?.toString()
public external fun String.trimIndent(): String
public external fun String.trimMargin(marginPrefix: String = "|"): String
public external fun String.prependIndent(indent: String = "    "): String
public external fun String(chars: CharArray): String
public external fun String(chars: CharArray, offset: Int, length: Int): String
public external fun CharArray.concatToString(): String
public external fun String.encodeToByteArray(): ByteArray
public external fun ByteArray.decodeToString(): String
public fun String.toRegex(): Regex = Regex(this)
public fun String.matches(regex: Regex): Boolean = regex.matches(this)
public external fun String.replaceFirstChar(transform: (Char) -> Char): String
public inline fun String.replaceFirstChar(transform: (Char) -> CharSequence): String =
    if (isNotEmpty()) transform(this[0]).toString() + substring(1) else this
public external fun String.capitalize(): String
public external fun String.decapitalize(): String
public external fun String.toCharList(): List<Char>
public fun CharSequence.commonPrefixWith(other: CharSequence, ignoreCase: Boolean = false): String {
    var index = 0
    val limit = if (length < other.length) length else other.length
    while (index < limit && this[index].equals(other[index], ignoreCase)) index++
    return subSequence(0, index).toString()
}
public fun CharSequence.commonSuffixWith(other: CharSequence, ignoreCase: Boolean = false): String {
    var count = 0
    val limit = if (length < other.length) length else other.length
    while (count < limit && this[length - 1 - count].equals(other[other.length - 1 - count], ignoreCase)) count++
    return subSequence(length - count, length).toString()
}
public inline fun buildString(builderAction: StringBuilder.() -> Unit): String = StringBuilder().apply(builderAction).toString()
public inline fun buildString(capacity: Int, builderAction: StringBuilder.() -> Unit): String = StringBuilder(capacity).apply(builderAction).toString()
public fun StringBuilder.appendLine(): StringBuilder = append('\n')
public fun StringBuilder.appendLine(value: String?): StringBuilder = append(value).append('\n')
public fun StringBuilder.appendLine(value: Any?): StringBuilder = append(value).append('\n')
public fun StringBuilder.appendLine(value: Char): StringBuilder = append(value).append('\n')
public fun StringBuilder.appendLine(value: Int): StringBuilder = append(value).append('\n')
public fun StringBuilder.appendLine(value: Long): StringBuilder = append(value).append('\n')
public fun StringBuilder.appendLine(value: Double): StringBuilder = append(value).append('\n')
public fun StringBuilder.appendLine(value: Boolean): StringBuilder = append(value).append('\n')
public fun StringBuilder.clear(): StringBuilder {
    setLength(0)
    return this
}
public operator fun StringBuilder.set(index: Int, value: Char): Unit = setCharAt(index, value)
public infix fun CharSequence.zip(other: CharSequence): List<Pair<Char, Char>> = zip(other) { c1, c2 -> c1 to c2 }
public inline fun <V> CharSequence.zip(other: CharSequence, transform: (a: Char, b: Char) -> V): List<V> {
    val length = minOf(this.length, other.length)
    val list = ArrayList<V>(length)
    for (i in 0 until length) list.add(transform(this[i], other[i]))
    return list
}
public fun <T> Appendable.appendElement(element: T, transform: ((T) -> CharSequence)?) {
    when {
        transform != null -> append(transform(element))
        element is CharSequence? -> append(element)
        element is Char -> append(element)
        else -> append(element.toString())
    }
}

public external fun Char.isDigit(): Boolean
public external fun Char.isLetter(): Boolean
public external fun Char.isLetterOrDigit(): Boolean
public external fun Char.isWhitespace(): Boolean
public external fun Char.isUpperCase(): Boolean
public external fun Char.isLowerCase(): Boolean
public external fun Char.uppercaseChar(): Char
public external fun Char.lowercaseChar(): Char
public external fun Char.uppercase(): String
public external fun Char.lowercase(): String
public external fun Char.titlecase(): String
public external fun Char.isSurrogate(): Boolean
public external fun Char.isHighSurrogate(): Boolean
public external fun Char.isLowSurrogate(): Boolean
public external fun Char.digitToInt(): Int
public external fun Char.digitToInt(radix: Int): Int
public external fun Char.digitToIntOrNull(): Int?
public external fun Char.digitToIntOrNull(radix: Int): Int?
public external fun Int.digitToChar(): Char
public external fun Int.digitToChar(radix: Int): Char
public external fun Char.equals(other: Char, ignoreCase: Boolean = false): Boolean
public external fun Char.toUpperCase(): Char
public external fun Char.toLowerCase(): Char
public operator fun Char.plus(other: String): String = this.toString() + other
public external fun Char.Companion.toChars(codePoint: Int): CharArray

public external fun Int.toString(radix: Int): String
public external fun Long.toString(radix: Int): String
public external fun Byte.toString(radix: Int): String
public external fun Short.toString(radix: Int): String

public enum class RegexOption {
    IGNORE_CASE, MULTILINE, LITERAL, UNIX_LINES, COMMENTS, DOT_MATCHES_ALL, CANON_EQ
}

public class Regex(public val pattern: String, public val options: Set<RegexOption>) {
    public constructor(pattern: String) : this(pattern, emptySet())
    public constructor(pattern: String, option: RegexOption) : this(pattern, setOf(option))
    private val compiled: java.util.regex.Pattern = java.util.regex.Pattern.compile(pattern, flagsOf(options))
    public fun matches(input: CharSequence): Boolean = compiled.matcher(input).matches()
    public fun containsMatchIn(input: CharSequence): Boolean = compiled.matcher(input).find()
    public fun matchEntire(input: CharSequence): MatchResult? {
        val matcher = compiled.matcher(input)
        return if (matcher.matches()) MatcherMatchResult(matcher, input) else null
    }
    public fun matchAt(input: CharSequence, index: Int): MatchResult? {
        val matcher = compiled.matcher(input)
        return if (matcher.find(index) && matcher.start() == index) MatcherMatchResult(matcher, input) else null
    }
    public fun find(input: CharSequence, startIndex: Int = 0): MatchResult? {
        val matcher = compiled.matcher(input)
        return if (matcher.find(startIndex)) MatcherMatchResult(matcher, input) else null
    }
    public fun findAll(input: CharSequence, startIndex: Int = 0): Sequence<MatchResult> {
        val result = ArrayList<MatchResult>()
        var match = find(input, startIndex)
        while (match != null) {
            result.add(match)
            match = match.next()
        }
        return result.asSequence()
    }
    public fun replace(input: CharSequence, replacement: String): String = compiled.matcher(input).replaceAll(replacement)
    public fun replace(input: CharSequence, transform: (MatchResult) -> CharSequence): String {
        var match: MatchResult? = find(input) ?: return input.toString()
        var lastStart = 0
        val length = input.length
        val builder = StringBuilder(length)
        do {
            val found = match!!
            builder.append(input, lastStart, found.range.start)
            builder.append(transform(found))
            lastStart = found.range.endInclusive + 1
            match = found.next()
        } while (lastStart < length && match != null)
        if (lastStart < length) builder.append(input, lastStart, length)
        return builder.toString()
    }
    public fun replaceFirst(input: CharSequence, replacement: String): String = compiled.matcher(input).replaceFirst(replacement)
    public fun split(input: CharSequence, limit: Int = 0): List<String> {
        if (limit < 0) throw IllegalArgumentException("Limit must be non-negative, but was $limit")
        val matcher = compiled.matcher(input)
        if (limit == 1 || !matcher.find()) return listOf(input.toString())
        val result = ArrayList<String>()
        var lastStart = 0
        val lastSplit = limit - 1
        do {
            result.add(input.subSequence(lastStart, matcher.start()).toString())
            lastStart = matcher.end()
            if (lastSplit >= 0 && result.size == lastSplit) break
        } while (matcher.find())
        result.add(input.subSequence(lastStart, input.length).toString())
        return result
    }
    override fun toString(): String = compiled.toString()
    companion object {
        public fun escape(literal: String): String = java.util.regex.Pattern.quote(literal)
        public fun fromLiteral(literal: String): Regex = Regex(literal, RegexOption.LITERAL)
        public fun escapeReplacement(literal: String): String = java.util.regex.Matcher.quoteReplacement(literal)
    }
}

internal fun flagsOf(options: Set<RegexOption>): Int {
    var flags = 0
    for (option in options) {
        flags = flags or when (option) {
            RegexOption.IGNORE_CASE -> 2
            RegexOption.MULTILINE -> 8
            RegexOption.LITERAL -> 16
            RegexOption.UNIX_LINES -> 1
            RegexOption.COMMENTS -> 4
            RegexOption.DOT_MATCHES_ALL -> 32
            RegexOption.CANON_EQ -> 128
        }
    }
    return flags
}

public interface MatchResult {
    public val range: IntRange
    public val value: String
    public val groups: MatchGroupCollection
    public val groupValues: List<String>
    public val destructured: Destructured get() = Destructured(this)
    public fun next(): MatchResult?
    public class Destructured internal constructor(public val match: MatchResult) {
        public operator fun component1(): String = match.groupValues[1]
        public operator fun component2(): String = match.groupValues[2]
        public operator fun component3(): String = match.groupValues[3]
        public operator fun component4(): String = match.groupValues[4]
        public operator fun component5(): String = match.groupValues[5]
        public fun toList(): List<String> = match.groupValues.subList(1, match.groupValues.size)
    }
}

public data class MatchGroup(public val value: String, public val range: IntRange)

public interface MatchGroupCollection : Collection<MatchGroup?> {
    public operator fun get(index: Int): MatchGroup?
    public operator fun get(name: String): MatchGroup?
}

internal class MatcherMatchResult(private val matcher: java.util.regex.Matcher, private val input: CharSequence) : MatchResult {
    private val start: Int = matcher.start()
    private val end: Int = matcher.end()
    private val values: List<String> = (0..matcher.groupCount()).map { matcher.group(it) ?: "" }
    private val groupList: List<MatchGroup?> = (0..matcher.groupCount()).map {
        val text = matcher.group(it)
        if (text == null) null else MatchGroup(text, matcher.start(it) until matcher.end(it))
    }
    override val range: IntRange get() = start until end
    override val value: String get() = values[0]
    override val groupValues: List<String> get() = values
    override val groups: MatchGroupCollection get() = GroupCollection(groupList, matcher)
    override fun next(): MatchResult? {
        val nextIndex = end + if (end == start) 1 else 0
        if (nextIndex > input.length) return null
        val nextMatcher = matcher.pattern().matcher(input)
        return if (nextMatcher.find(nextIndex)) MatcherMatchResult(nextMatcher, input) else null
    }
}

internal class GroupCollection(private val list: List<MatchGroup?>, private val matcher: java.util.regex.Matcher) :
    MatchGroupCollection {
    override val size: Int get() = list.size
    override fun isEmpty(): Boolean = list.isEmpty()
    override fun contains(element: MatchGroup?): Boolean = list.contains(element)
    override fun containsAll(elements: Collection<MatchGroup?>): Boolean = list.containsAll(elements)
    override fun iterator(): Iterator<MatchGroup?> = list.iterator()
    override fun toString(): String = list.toString()
    override fun get(index: Int): MatchGroup? = list[index]
    override fun get(name: String): MatchGroup? {
        val text = matcher.group(name) ?: return null
        return MatchGroup(text, matcher.start(name) until matcher.end(name))
    }
}
`);

    // --- Natives

    var natives = Kt.natives;

    function stringNative(key) {
        return Java.natives['java.lang.String'][key];
    }

    function rt() {
        return Kt.session.runtime;
    }

    function kt() {
        return Kt.session.ktRuntime;
    }

    function list(items) {
        var result = Kt.session.newArrayList();
        items.forEach(function (item) { result.add$1(item); });
        return result;
    }

    function isWhitespace(code) {
        return Java.natives['java.lang.Character']['isWhitespace(char)'](code) || code === 0xA0 || code === 0x2007 || code === 0x202F;
    }

    function nonNull(value) {
        if (value === null || value === undefined)
            throw rt().npe();
        return value;
    }

    function lowerIfIgnore(text, ignoreCase) {
        return ignoreCase ? text.toLowerCase() : text;
    }

    function charText(code) {
        return String.fromCharCode(code);
    }

    // Kotlin's split: at the nearest delimiter (the first of the list on a
    // tie); an empty delimiter splits between every character.
    function splitBy(text, delimiters, ignoreCase, limit) {
        if (limit < 0)
            throw rt().exception('java.lang.IllegalArgumentException', 'Limit must be non-negative, but was ' + limit);
        if (delimiters.length === 1 && delimiters[0].length > 0 && !ignoreCase && limit === 0)
            return list(text.split(delimiters[0]));
        var result = [];
        var start = 0, position = 0;
        while (position <= text.length) {
            if (limit > 0 && result.length === limit - 1)
                break;
            var best = -1, bestLength = 0;
            for (var index = 0; index < delimiters.length; ++index) {
                var found = indexOfIgnore(text, delimiters[index], position, ignoreCase, false);
                if (found >= 0 && found <= text.length && (best < 0 || found < best)) {
                    best = found;
                    bestLength = delimiters[index].length;
                }
            }
            if (best < 0)
                break;
            result.push(text.substring(start, best));
            start = best + bestLength;
            position = start + (bestLength === 0 ? 1 : 0);
        }
        result.push(text.substring(start));
        return list(result);
    }

    function indexOfIgnore(text, target, start, ignoreCase, last) {
        var source = lowerIfIgnore(text, ignoreCase);
        var needle = lowerIfIgnore(target, ignoreCase);
        if (last)
            return source.lastIndexOf(needle, start);
        return source.indexOf(needle, start < 0 ? 0 : start);
    }

    function parseNumber(text, parse) {
        try {
            return parse(text);
        } catch (error) {
            if (rt().isThrowable(error))
                return null;
            throw error;
        }
    }

    function trimWith(text, start, end) {
        var from = 0, to = text.length;
        if (start) {
            while (from < to && isWhitespace(text.charCodeAt(from)))
                ++from;
        }
        if (end) {
            while (to > from && isWhitespace(text.charCodeAt(to - 1)))
                --to;
        }
        return text.substring(from, to);
    }

    // trimIndent: the common minimal indent of non-blank lines removed;
    // the first and the last blank lines dropped.
    function trimIndent(text) {
        var lines = text.split(/\r\n|\n|\r/);
        var minimal = Infinity;
        lines.forEach(function (line) {
            if (line.trim().length === 0)
                return;
            var indent = 0;
            while (indent < line.length && isWhitespace(line.charCodeAt(indent)))
                ++indent;
            minimal = Math.min(minimal, indent);
        });
        if (minimal === Infinity)
            minimal = 0;
        var result = lines.map(function (line) {
            return line.trim().length === 0 ? '' : line.substring(minimal);
        });
        if (result.length > 0 && lines[0].trim().length === 0)
            result.shift();
        if (result.length > 0 && lines[lines.length - 1].trim().length === 0)
            result.pop();
        return result.join('\n');
    }

    function trimMargin(text, prefix) {
        if (prefix.trim().length === 0)
            throw rt().exception('java.lang.IllegalArgumentException', 'marginPrefix must be non-blank string.');
        var lines = text.split(/\r\n|\n|\r/);
        var result = lines.map(function (line) {
            var index = 0;
            while (index < line.length && isWhitespace(line.charCodeAt(index)))
                ++index;
            if (line.substr(index, prefix.length) === prefix)
                return line.substring(index + prefix.length);
            return line;
        });
        if (result.length > 0 && lines[0].trim().length === 0)
            result.shift();
        if (result.length > 0 && lines[lines.length - 1].trim().length === 0)
            result.pop();
        return result.join('\n');
    }

    function digitOf(code, radix) {
        return Java.natives['java.lang.Character']['digit(char,int)'](code, radix);
    }

    natives['kotlin.text'] = {
        'String.substring(Int)': function (text, start) { return stringNative('substring(int)').call(nonNull(text), start); },
        'String.substring(Int,Int)': function (text, start, end) { return stringNative('substring(int,int)').call(nonNull(text), start, end); },
        'String.uppercase()': function (text) { return nonNull(text).toUpperCase(); },
        'String.lowercase()': function (text) { return nonNull(text).toLowerCase(); },
        'String.trim()': function (text) { return trimWith(nonNull(text), true, true); },
        'String.trimStart()': function (text) { return trimWith(nonNull(text), true, false); },
        'String.trimEnd()': function (text) { return trimWith(nonNull(text), false, true); },
        'String.startsWith(String,Boolean)': function (text, prefix, ignoreCase) {
            return lowerIfIgnore(nonNull(text), ignoreCase).substring(0, prefix.length) === lowerIfIgnore(prefix, ignoreCase);
        },
        'String.startsWith(String,Int,Boolean)': function (text, prefix, start, ignoreCase) {
            return lowerIfIgnore(nonNull(text), ignoreCase).substr(start, prefix.length) === lowerIfIgnore(prefix, ignoreCase) && start >= 0;
        },
        'String.endsWith(String,Boolean)': function (text, suffix, ignoreCase) {
            text = lowerIfIgnore(nonNull(text), ignoreCase);
            suffix = lowerIfIgnore(suffix, ignoreCase);
            return suffix.length <= text.length && text.substring(text.length - suffix.length) === suffix;
        },
        'CharSequence.contains(CharSequence,Boolean)': function (text, other, ignoreCase) {
            return indexOfIgnore(rt().str(nonNull(text)), rt().str(other), 0, ignoreCase, false) >= 0;
        },
        'CharSequence.contains(Char,Boolean)': function (text, code, ignoreCase) {
            return indexOfIgnore(rt().str(nonNull(text)), charText(code), 0, ignoreCase, false) >= 0;
        },
        'CharSequence.indexOf(String,Int,Boolean)': function (text, target, start, ignoreCase) {
            return indexOfIgnore(rt().str(nonNull(text)), target, start === undefined ? 0 : start, ignoreCase, false);
        },
        'CharSequence.indexOf(Char,Int,Boolean)': function (text, code, start, ignoreCase) {
            return indexOfIgnore(rt().str(nonNull(text)), charText(code), start === undefined ? 0 : start, ignoreCase, false);
        },
        'CharSequence.lastIndexOf(String,Int,Boolean)': function (text, target, start, ignoreCase) {
            var source = rt().str(nonNull(text));
            return indexOfIgnore(source, target, start === undefined ? source.length - 1 : start, ignoreCase, true);
        },
        'CharSequence.lastIndexOf(Char,Int,Boolean)': function (text, code, start, ignoreCase) {
            var source = rt().str(nonNull(text));
            return indexOfIgnore(source, charText(code), start === undefined ? source.length - 1 : start, ignoreCase, true);
        },
        'String.replace(String,String,Boolean)': function (text, oldValue, newValue, ignoreCase) {
            nonNull(text);
            if (!ignoreCase) {
                if (oldValue.length === 0) {
                    var parts = [newValue];
                    for (var index = 0; index < text.length; ++index)
                        parts.push(text.charAt(index), newValue);
                    return parts.join('');
                }
                return text.split(oldValue).join(newValue);
            }
            var result = '';
            var lower = text.toLowerCase(), target = oldValue.toLowerCase();
            var start = 0, position;
            while ((position = lower.indexOf(target, start)) >= 0) {
                result += text.substring(start, position) + newValue;
                start = position + Math.max(target.length, 1);
                if (target.length === 0) {
                    result += text.charAt(position);
                }
            }
            return result + text.substring(start);
        },
        'String.replace(Char,Char,Boolean)': function (text, oldChar, newChar, ignoreCase) {
            nonNull(text);
            var out = '';
            for (var index = 0; index < text.length; ++index) {
                var code = text.charCodeAt(index);
                var match = ignoreCase ? String.fromCharCode(code).toLowerCase() === String.fromCharCode(oldChar).toLowerCase() : code === oldChar;
                out += match ? String.fromCharCode(newChar) : text.charAt(index);
            }
            return out;
        },
        'String.replaceFirst(String,String,Boolean)': function (text, oldValue, newValue, ignoreCase) {
            var position = indexOfIgnore(nonNull(text), oldValue, 0, ignoreCase, false);
            return position < 0 ? text : text.substring(0, position) + newValue + text.substring(position + oldValue.length);
        },
        'CharSequence.split(vararg String,Boolean,Int)': function (text, delimiters, ignoreCase, limit) {
            return splitBy(rt().str(nonNull(text)), Array.prototype.slice.call(delimiters), !!ignoreCase, limit || 0);
        },
        'CharSequence.split(vararg Char,Boolean,Int)': function (text, delimiters, ignoreCase, limit) {
            return splitBy(rt().str(nonNull(text)), Array.prototype.map.call(delimiters, charText), !!ignoreCase, limit || 0);
        },
        'CharSequence.lines()': function (text) {
            return list(rt().str(nonNull(text)).split(/\r\n|\n|\r/));
        },
        'String.repeat(Int)': function (text, count) {
            if (count < 0)
                throw rt().exception('java.lang.IllegalArgumentException', 'Count \'n\' must be non-negative, but was ' + count + '.');
            return nonNull(text).repeat(count);
        },
        'CharSequence.reversed()': function (text) {
            var source = rt().str(nonNull(text));
            var out = '';
            for (var index = source.length - 1; index >= 0; --index) {
                var code = source.charCodeAt(index);
                // A surrogate pair keeps its order.
                if (code >= 0xDC00 && code <= 0xDFFF && index > 0) {
                    var high = source.charCodeAt(index - 1);
                    if (high >= 0xD800 && high <= 0xDBFF) {
                        out += source.charAt(index - 1) + source.charAt(index);
                        --index;
                        continue;
                    }
                }
                out += source.charAt(index);
            }
            return out;
        },
        'String.padStart(Int,Char)': function (text, length, padChar) {
            if (length < 0)
                throw rt().exception('java.lang.IllegalArgumentException', 'Desired length ' + length + ' is less than zero.');
            var pad = String.fromCharCode(padChar === undefined ? 32 : padChar);
            var out = nonNull(text);
            while (out.length < length)
                out = pad + out;
            return out;
        },
        'String.padEnd(Int,Char)': function (text, length, padChar) {
            if (length < 0)
                throw rt().exception('java.lang.IllegalArgumentException', 'Desired length ' + length + ' is less than zero.');
            var pad = String.fromCharCode(padChar === undefined ? 32 : padChar);
            var out = nonNull(text);
            while (out.length < length)
                out += pad;
            return out;
        },
        'CharSequence.isBlank()': function (text) {
            var source = rt().str(nonNull(text));
            for (var index = 0; index < source.length; ++index) {
                if (!isWhitespace(source.charCodeAt(index)))
                    return false;
            }
            return true;
        },
        'String.toInt()': function (text) { return Java.natives['java.lang.Integer']['parseInt(String)'](text); },
        'String.toInt(Int)': function (text, radix) { return Java.natives['java.lang.Integer']['parseInt(String,int)'](text, radix); },
        'String.toLong()': function (text) { return Java.natives['java.lang.Long']['parseLong(String)'](text); },
        'String.toLong(Int)': function (text, radix) { return Java.natives['java.lang.Long']['parseLong(String,int)'](text, radix); },
        'String.toShort()': function (text) {
            var value = Java.natives['java.lang.Integer']['parseInt(String)'](text);
            if (value < -32768 || value > 32767)
                throw rt().exception('java.lang.NumberFormatException', 'Value out of range. Value:"' + text + '" Radix:10');
            return value;
        },
        'String.toByte()': function (text) {
            var value = Java.natives['java.lang.Integer']['parseInt(String)'](text);
            if (value < -128 || value > 127)
                throw rt().exception('java.lang.NumberFormatException', 'Value out of range. Value:"' + text + '" Radix:10');
            return value;
        },
        'String.toDouble()': function (text) { return Java.natives['java.lang.Double']['parseDouble(String)'](text); },
        'String.toFloat()': function (text) { return Math.fround(Java.natives['java.lang.Double']['parseDouble(String)'](text)); },
        'String.toIntOrNull()': function (text) {
            if (!/^[+-]?[0-9]+$/.test(text))
                return null;
            return parseNumber(text, Java.natives['java.lang.Integer']['parseInt(String)']);
        },
        'String.toIntOrNull(Int)': function (text, radix) {
            return parseNumber(text, function (value) { return Java.natives['java.lang.Integer']['parseInt(String,int)'](value, radix); });
        },
        'String.toLongOrNull()': function (text) {
            if (!/^[+-]?[0-9]+$/.test(text))
                return null;
            var value = parseNumber(text, Java.natives['java.lang.Long']['parseLong(String)']);
            return value === null ? null : rt().boxJ(value);
        },
        'String.toDoubleOrNull()': function (text) {
            if (!/^\s*[+-]?(NaN|Infinity|((\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?)|0[xX][0-9a-fA-F]+(\.[0-9a-fA-F]*)?[pP][+-]?\d+)[fFdD]?\s*$/.test(text))
                return null;
            var value = parseNumber(text, Java.natives['java.lang.Double']['parseDouble(String)']);
            return value === null ? null : rt().boxD(value);
        },
        'String.toFloatOrNull()': function (text) {
            if (!/^\s*[+-]?(NaN|Infinity|((\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?))[fFdD]?\s*$/.test(text))
                return null;
            var value = parseNumber(text, Java.natives['java.lang.Double']['parseDouble(String)']);
            return value === null ? null : rt().boxF(Math.fround(value));
        },
        'String.toBoolean()': function (text) { return text !== null && text.toLowerCase() === 'true'; },
        'String.toCharArray()': function (text) {
            var source = nonNull(text);
            var array = new Uint16Array(source.length);
            for (var index = 0; index < source.length; ++index)
                array[index] = source.charCodeAt(index);
            return array;
        },
        'String.format(vararg Any?)': function (text, args) { return Java.format(nonNull(text), args); },
        'String.Companion.format(String,vararg Any?)': function (companion, format, args) { return Java.format(nonNull(format), args); },
        'String.equals(String?,Boolean)': function (text, other, ignoreCase) {
            if (text === null || other === null)
                return text === other;
            return ignoreCase ? text.toLowerCase() === other.toLowerCase() || text.toUpperCase() === other.toUpperCase() : text === other;
        },
        'String.compareTo(String,Boolean)': function (text, other, ignoreCase) {
            if (ignoreCase)
                return stringNative('compareToIgnoreCase(String)').call(text, other);
            return Java.compareStrings(text, other);
        },
        'String.trimIndent()': function (text) { return trimIndent(nonNull(text)); },
        'String.trimMargin(String)': function (text, prefix) { return trimMargin(nonNull(text), prefix === undefined ? '|' : prefix); },
        'String.prependIndent(String)': function (text, indent) {
            if (indent === undefined)
                indent = '    ';
            return nonNull(text).split(/\r\n|\n|\r/).map(function (line) {
                return line.trim().length === 0 ? (line.length < indent.length ? indent : line) : indent + line;
            }).join('\n');
        },
        'String(CharArray)': function (chars) {
            var out = '';
            for (var index = 0; index < chars.length; ++index)
                out += String.fromCharCode(chars[index]);
            return out;
        },
        'String(CharArray,Int,Int)': function (chars, offset, length) {
            var out = '';
            for (var index = offset; index < offset + length; ++index)
                out += String.fromCharCode(chars[index]);
            return out;
        },
        'CharArray.concatToString()': function (chars) {
            var out = '';
            for (var index = 0; index < chars.length; ++index)
                out += String.fromCharCode(chars[index]);
            return out;
        },
        'String.encodeToByteArray()': function (text) {
            var bytes = T.utf8.encode(text);
            var array = new Int8Array(bytes.length);
            for (var index = 0; index < bytes.length; ++index)
                array[index] = (bytes.charCodeAt(index) << 24) >> 24;
            return array;
        },
        'ByteArray.decodeToString()': function (bytes) {
            var text = '';
            for (var index = 0; index < bytes.length; ++index)
                text += String.fromCharCode(bytes[index] & 255);
            return T.utf8.decode(text);
        },
        'String.replaceFirstChar((Char) -> Char)': function (text, transform) {
            if (text.length === 0)
                return text;
            return String.fromCharCode(kt().unbox(transform(rt().boxC(text.charCodeAt(0))))) + text.substring(1);
        },
        'String.capitalize()': function (text) {
            return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.substring(1);
        },
        'String.decapitalize()': function (text) {
            return text.length === 0 ? text : text.charAt(0).toLowerCase() + text.substring(1);
        },
        'String.toCharList()': function (text) {
            var items = [];
            for (var index = 0; index < text.length; ++index)
                items.push(rt().boxC(text.charCodeAt(index)));
            return list(items);
        },
        'Char.isDigit()': function (code) { return Java.natives['java.lang.Character']['isDigit(char)'](code); },
        'Char.isLetter()': function (code) { return Java.natives['java.lang.Character']['isLetter(char)'](code); },
        'Char.isLetterOrDigit()': function (code) { return Java.natives['java.lang.Character']['isLetterOrDigit(char)'](code); },
        'Char.isWhitespace()': function (code) { return isWhitespace(code); },
        'Char.isUpperCase()': function (code) { return Java.natives['java.lang.Character']['isUpperCase(char)'](code); },
        'Char.isLowerCase()': function (code) { return Java.natives['java.lang.Character']['isLowerCase(char)'](code); },
        'Char.uppercaseChar()': function (code) { return Java.natives['java.lang.Character']['toUpperCase(char)'](code); },
        'Char.lowercaseChar()': function (code) { return Java.natives['java.lang.Character']['toLowerCase(char)'](code); },
        'Char.toUpperCase()': function (code) { return Java.natives['java.lang.Character']['toUpperCase(char)'](code); },
        'Char.toLowerCase()': function (code) { return Java.natives['java.lang.Character']['toLowerCase(char)'](code); },
        'Char.uppercase()': function (code) { return String.fromCharCode(code).toUpperCase(); },
        'Char.lowercase()': function (code) { return String.fromCharCode(code).toLowerCase(); },
        'Char.titlecase()': function (code) { return String.fromCharCode(code).toUpperCase(); },
        'Char.isSurrogate()': function (code) { return code >= 0xD800 && code <= 0xDFFF; },
        'Char.isHighSurrogate()': function (code) { return code >= 0xD800 && code <= 0xDBFF; },
        'Char.isLowSurrogate()': function (code) { return code >= 0xDC00 && code <= 0xDFFF; },
        'Char.digitToInt()': function (code) {
            var value = digitOf(code, 10);
            if (value < 0)
                throw rt().exception('java.lang.IllegalArgumentException', 'Char ' + String.fromCharCode(code) + ' is not a decimal digit');
            return value;
        },
        'Char.digitToInt(Int)': function (code, radix) {
            var value = digitOf(code, radix);
            if (value < 0)
                throw rt().exception('java.lang.IllegalArgumentException', 'Char ' + String.fromCharCode(code) + ' is not a digit in the given radix=' + radix);
            return value;
        },
        'Char.digitToIntOrNull()': function (code) {
            var value = digitOf(code, 10);
            return value < 0 ? null : value;
        },
        'Char.digitToIntOrNull(Int)': function (code, radix) {
            var value = digitOf(code, radix);
            return value < 0 ? null : value;
        },
        'Int.digitToChar()': function (value) {
            if (value < 0 || value > 9)
                throw rt().exception('java.lang.IllegalArgumentException', 'Int ' + value + ' is not a decimal digit');
            return 48 + value;
        },
        'Int.digitToChar(Int)': function (value, radix) {
            if (value < 0 || value >= radix)
                throw rt().exception('java.lang.IllegalArgumentException', 'Digit ' + value + ' does not represent a valid digit in radix ' + radix);
            return value < 10 ? 48 + value : 55 + value;
        },
        'Char.equals(Char,Boolean)': function (code, other, ignoreCase) {
            if (code === other)
                return true;
            if (!ignoreCase)
                return false;
            var upper = Java.natives['java.lang.Character']['toUpperCase(char)'];
            var lower = Java.natives['java.lang.Character']['toLowerCase(char)'];
            return upper(code) === upper(other) || lower(upper(code)) === lower(upper(other));
        },
        'Char.Companion.toChars(Int)': function (companion, codePoint) {
            var text = String.fromCodePoint(codePoint);
            var array = new Uint16Array(text.length);
            for (var index = 0; index < text.length; ++index)
                array[index] = text.charCodeAt(index);
            return array;
        },
        'Int.toString(Int)': function (value, radix) { return Java.natives['java.lang.Integer']['toString(int,int)'](value, radix); },
        'Long.toString(Int)': function (value, radix) { return Java.natives['java.lang.Long']['toString(long,int)'](value, radix); },
        'Byte.toString(Int)': function (value, radix) { return Java.natives['java.lang.Integer']['toString(int,int)'](value, radix); },
        'Short.toString(Int)': function (value, radix) { return Java.natives['java.lang.Integer']['toString(int,int)'](value, radix); }
    };
})(globalThis);
