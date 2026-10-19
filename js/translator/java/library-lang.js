// Java: the java.lang library - sources in Java; the native methods are
// in natives-lang.js. A compilation unit is parsed when its class is first
// used.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Java = T.java;
    if (Java.library && Java.library.units['java.lang.base'])
        return;

    Java.addLibrary('java.lang.base', 'java.lang', String.raw`
public class Object {
    public Object() {}
    public native boolean equals(Object other);
    public native int hashCode();
    public native String toString();
    public final native Class<?> getClass();
    protected native Object clone() throws CloneNotSupportedException;
    public final native void wait() throws InterruptedException;
    public final native void wait(long millis) throws InterruptedException;
    public final native void notify();
    public final native void notifyAll();
}

public interface Comparable<T> {
    int compareTo(T other);
}

public interface CharSequence {
    int length();
    char charAt(int index);
    CharSequence subSequence(int start, int end);
    String toString();
    default boolean isEmpty() { return length() == 0; }
}

public interface Iterable<T> {
    java.util.Iterator<T> iterator();
    default void forEach(java.util.function.Consumer<? super T> action) {
        java.util.Iterator<T> it = iterator();
        while (it.hasNext())
            action.accept(it.next());
    }
}

public interface AutoCloseable {
    void close() throws Exception;
}

public interface Runnable {
    void run();
}

public interface Cloneable {}

public abstract class Number {
    public abstract int intValue();
    public abstract long longValue();
    public abstract double doubleValue();
    public float floatValue() { return (float) doubleValue(); }
    public short shortValue() { return (short) intValue(); }
    public byte byteValue() { return (byte) intValue(); }
}

public final class Void {}

public @interface Override {}
public @interface FunctionalInterface {}
public @interface SuppressWarnings {}
public @interface Deprecated {}
public @interface SafeVarargs {}
`);
    Java.addLibrary('java.lang.class', 'java.lang', String.raw`
public final class Class<T> {
    private Class() {}
    public native String getName();
    public native String getSimpleName();
    public native boolean isInstance(Object value);
    public native boolean isInterface();
    public native boolean isArray();
    public native boolean isEnum();
    public native boolean isRecord();
    public native T[] getEnumConstants();
    public native Class<? super T> getSuperclass();
    public native String toString();
}

public abstract class Enum<E extends Enum<E>> implements Comparable<E> {
    private final String name;
    private final int ordinal;
    protected Enum() {}
    public final String name() { return name; }
    public final int ordinal() { return ordinal; }
    public String toString() { return name; }
    public final int compareTo(E other) { return ordinal - ((Enum<E>) other).ordinal; }
    public final boolean equals(Object other) { return this == other; }
    public final native int hashCode();
    public final native Class<E> getDeclaringClass();
}

public abstract class Record {
    protected Record() {}
    public native boolean equals(Object other);
    public native int hashCode();
    public native String toString();
}
`);
    // A String value is a JavaScript string, so all its methods are natives.
    Java.addLibrary('java.lang.string', 'java.lang', String.raw`
public final class String implements CharSequence, Comparable<String>, java.io.Serializable {
    public static final java.util.Comparator<String> CASE_INSENSITIVE_ORDER = (a, b) -> a.compareToIgnoreCase(b);
    public native String();
    public native String(String original);
    public native String(char[] chars);
    public native String(char[] chars, int offset, int count);
    public native String(StringBuilder builder);
    public native int length();
    public native char charAt(int index);
    public native boolean isEmpty();
    public native boolean isBlank();
    public native CharSequence subSequence(int start, int end);
    public native String substring(int start);
    public native String substring(int start, int end);
    public native int indexOf(int ch);
    public native int indexOf(int ch, int from);
    public native int indexOf(String str);
    public native int indexOf(String str, int from);
    public native int lastIndexOf(int ch);
    public native int lastIndexOf(int ch, int from);
    public native int lastIndexOf(String str);
    public native int lastIndexOf(String str, int from);
    public native boolean contains(CharSequence text);
    public native boolean startsWith(String prefix);
    public native boolean startsWith(String prefix, int offset);
    public native boolean endsWith(String suffix);
    public native boolean equals(Object other);
    public native boolean equalsIgnoreCase(String other);
    public native int compareTo(String other);
    public native int compareToIgnoreCase(String other);
    public native int hashCode();
    public native String toString();
    public native String toUpperCase();
    public native String toLowerCase();
    public native String trim();
    public native String strip();
    public native String stripLeading();
    public native String stripTrailing();
    public native String concat(String other);
    public native String replace(char from, char to);
    public native String replace(CharSequence from, CharSequence to);
    public native String replaceAll(String regex, String replacement);
    public native String replaceFirst(String regex, String replacement);
    public native boolean matches(String regex);
    public native String[] split(String regex);
    public native String[] split(String regex, int limit);
    public native char[] toCharArray();
    public native String repeat(int count);
    public native java.util.stream.IntStream chars();
    public native java.util.stream.Stream<String> lines();
    public native String formatted(Object... args);
    public native String intern();
    public native int codePointAt(int index);
    public native boolean regionMatches(int offset, String other, int otherOffset, int length);
    public native boolean regionMatches(boolean ignoreCase, int offset, String other, int otherOffset, int length);
    public native boolean contentEquals(CharSequence text);
    public native String indent(int n);
    public native String stripIndent();
    public native byte[] getBytes();
    public native String toLowerCase(java.util.Locale locale);
    public native String toUpperCase(java.util.Locale locale);
    public java.util.stream.IntStream codePoints() { return chars(); }
    public static native String valueOf(char[] chars, int offset, int count);
    public static native String copyValueOf(char[] chars, int offset, int count);
    public static native String format(java.util.Locale locale, String format, Object... args);
    public native String(byte[] bytes);
    public static native String valueOf(Object value);
    public static native String valueOf(char[] chars);
    public static native String valueOf(boolean value);
    public static native String valueOf(char value);
    public static native String valueOf(int value);
    public static native String valueOf(long value);
    public static native String valueOf(float value);
    public static native String valueOf(double value);
    public static native String copyValueOf(char[] chars);
    public static native String format(String format, Object... args);
    public static native String join(CharSequence delimiter, CharSequence... parts);
    public static native String join(CharSequence delimiter, Iterable<? extends CharSequence> parts);
}
`);
    // Integer and Boolean are JavaScript numbers and booleans; the other
    // boxes are objects with the field value.
    Java.addLibrary('java.lang.integer', 'java.lang', String.raw`
public final class Integer extends Number implements Comparable<Integer> {
    public static final int MIN_VALUE = 0x80000000;
    public static final int MAX_VALUE = 0x7fffffff;
    public static final int SIZE = 32;
    public static final int BYTES = 4;
    public native Integer(int value);
    public native int intValue();
    public native long longValue();
    public native double doubleValue();
    public native float floatValue();
    public native short shortValue();
    public native byte byteValue();
    public native boolean equals(Object other);
    public native int hashCode();
    public native String toString();
    public native int compareTo(Integer other);
    public static native Integer valueOf(int value);
    public static native Integer valueOf(String text);
    public static native Integer valueOf(String text, int radix);
    public static native int parseInt(String text);
    public static native int parseInt(String text, int radix);
    public static native String toString(int value);
    public static native String toString(int value, int radix);
    public static native String toBinaryString(int value);
    public static native String toHexString(int value);
    public static native String toOctalString(int value);
    public static int compare(int a, int b) { return a < b ? -1 : (a == b ? 0 : 1); }
    public static int signum(int value) { return value > 0 ? 1 : (value < 0 ? -1 : 0); }
    public static int sum(int a, int b) { return a + b; }
    public static int max(int a, int b) { return a >= b ? a : b; }
    public static int min(int a, int b) { return a <= b ? a : b; }
    public static int abs(int value) { return value < 0 ? -value : value; }
    public static int hashCode(int value) { return value; }
    public static native int bitCount(int value);
    public static native int reverse(int value);
    public static native int highestOneBit(int value);
    public static native int lowestOneBit(int value);
    public static native int numberOfLeadingZeros(int value);
    public static native int numberOfTrailingZeros(int value);
    public static int compareUnsigned(int a, int b) { return compare(a + MIN_VALUE, b + MIN_VALUE); }
    public static int divideUnsigned(int a, int b) { return (int) ((a & 0xffffffffL) / (b & 0xffffffffL)); }
    public static int remainderUnsigned(int a, int b) { return (int) ((a & 0xffffffffL) % (b & 0xffffffffL)); }
    public static long toUnsignedLong(int value) { return value & 0xffffffffL; }
    public static String toUnsignedString(int value) { return Long.toString(value & 0xffffffffL); }
}

public final class Boolean implements Comparable<Boolean>, java.io.Serializable {
    public static final Boolean TRUE = true;
    public static final Boolean FALSE = false;
    public native Boolean(boolean value);
    public native boolean booleanValue();
    public native boolean equals(Object other);
    public native int hashCode();
    public native String toString();
    public native int compareTo(Boolean other);
    public static native Boolean valueOf(boolean value);
    public static native Boolean valueOf(String text);
    public static native boolean parseBoolean(String text);
    public static native String toString(boolean value);
    public static int compare(boolean a, boolean b) { return a == b ? 0 : (a ? 1 : -1); }
    public static boolean logicalAnd(boolean a, boolean b) { return a && b; }
    public static boolean logicalOr(boolean a, boolean b) { return a || b; }
    public static boolean logicalXor(boolean a, boolean b) { return a ^ b; }
    public static int hashCode(boolean value) { return value ? 1231 : 1237; }
}
`);
    Java.addLibrary('java.lang.long', 'java.lang', String.raw`
public final class Long extends Number implements Comparable<Long> {
    public static final long MIN_VALUE = 0x8000000000000000L;
    public static final long MAX_VALUE = 0x7fffffffffffffffL;
    public static final int SIZE = 64;
    public static final int BYTES = 8;
    private final long value;
    public Long(long value) { this.value = value; }
    public int intValue() { return (int) value; }
    public long longValue() { return value; }
    public double doubleValue() { return (double) value; }
    public boolean equals(Object other) { return other instanceof Long l && l.value == value; }
    public int hashCode() { return hashCode(value); }
    public String toString() { return toString(value); }
    public int compareTo(Long other) { return compare(value, other.value); }
    public static native Long valueOf(long value);
    public static Long valueOf(String text) { return valueOf(parseLong(text)); }
    public static native long parseLong(String text);
    public static native long parseLong(String text, int radix);
    public static native String toString(long value);
    public static native String toString(long value, int radix);
    public static native String toBinaryString(long value);
    public static native String toHexString(long value);
    public static native String toOctalString(long value);
    public static int compare(long a, long b) { return a < b ? -1 : (a == b ? 0 : 1); }
    public static int signum(long value) { return value > 0 ? 1 : (value < 0 ? -1 : 0); }
    public static long sum(long a, long b) { return a + b; }
    public static long max(long a, long b) { return a >= b ? a : b; }
    public static long min(long a, long b) { return a <= b ? a : b; }
    public static long abs(long value) { return value < 0 ? -value : value; }
    public static int hashCode(long value) { return (int) (value ^ (value >>> 32)); }
    public static native int bitCount(long value);
    public static native int numberOfTrailingZeros(long value);
    public static native int numberOfLeadingZeros(long value);
}

public final class Short extends Number implements Comparable<Short> {
    public static final short MIN_VALUE = -32768;
    public static final short MAX_VALUE = 32767;
    private final short value;
    public Short(short value) { this.value = value; }
    public int intValue() { return value; }
    public long longValue() { return value; }
    public double doubleValue() { return value; }
    public boolean equals(Object other) { return other instanceof Short s && s.value == value; }
    public int hashCode() { return value; }
    public String toString() { return Integer.toString(value); }
    public int compareTo(Short other) { return value - other.value; }
    public static native Short valueOf(short value);
    public static short parseShort(String text) { return (short) Integer.parseInt(text); }
    public static int compare(short a, short b) { return a - b; }
    public static String toString(short value) { return Integer.toString(value); }
}

public final class Byte extends Number implements Comparable<Byte> {
    public static final byte MIN_VALUE = -128;
    public static final byte MAX_VALUE = 127;
    private final byte value;
    public Byte(byte value) { this.value = value; }
    public int intValue() { return value; }
    public long longValue() { return value; }
    public double doubleValue() { return value; }
    public boolean equals(Object other) { return other instanceof Byte b && b.value == value; }
    public int hashCode() { return value; }
    public String toString() { return Integer.toString(value); }
    public int compareTo(Byte other) { return value - other.value; }
    public static native Byte valueOf(byte value);
    public static byte parseByte(String text) { return (byte) Integer.parseInt(text); }
    public static int compare(byte a, byte b) { return a - b; }
    public static String toString(byte value) { return Integer.toString(value); }
}
`);
    Java.addLibrary('java.lang.double', 'java.lang', String.raw`
public final class Double extends Number implements Comparable<Double> {
    public static final double POSITIVE_INFINITY = 1.0 / 0.0;
    public static final double NEGATIVE_INFINITY = -1.0 / 0.0;
    public static final double NaN = 0.0d / 0.0;
    public static final double MAX_VALUE = 0x1.fffffffffffffP+1023;
    public static final double MIN_VALUE = 0x0.0000000000001P-1022;
    public static final double MIN_NORMAL = 0x1.0p-1022;
    public static final int SIZE = 64;
    public static final int BYTES = 8;
    private final double value;
    public Double(double value) { this.value = value; }
    public int intValue() { return (int) value; }
    public long longValue() { return (long) value; }
    public double doubleValue() { return value; }
    public float floatValue() { return (float) value; }
    public boolean isNaN() { return value != value; }
    public boolean isInfinite() { return isInfinite(value); }
    public native boolean equals(Object other);
    public int hashCode() { return hashCode(value); }
    public String toString() { return toString(value); }
    public int compareTo(Double other) { return compare(value, other.value); }
    public static native Double valueOf(double value);
    public static Double valueOf(String text) { return valueOf(parseDouble(text)); }
    public static native double parseDouble(String text);
    public static native String toString(double value);
    public static native int compare(double a, double b);
    public static boolean isNaN(double value) { return value != value; }
    public static boolean isInfinite(double value) { return value == POSITIVE_INFINITY || value == NEGATIVE_INFINITY; }
    public static boolean isFinite(double value) { return !isNaN(value) && !isInfinite(value); }
    public static double sum(double a, double b) { return a + b; }
    public static double max(double a, double b) { return Math.max(a, b); }
    public static double min(double a, double b) { return Math.min(a, b); }
    public static native int hashCode(double value);
    public static native long doubleToLongBits(double value);
    public static native double longBitsToDouble(long bits);
}

public final class Float extends Number implements Comparable<Float> {
    public static final float POSITIVE_INFINITY = 1.0f / 0.0f;
    public static final float NEGATIVE_INFINITY = -1.0f / 0.0f;
    public static final float NaN = 0.0f / 0.0f;
    public static final float MAX_VALUE = 0x1.fffffeP+127f;
    public static final float MIN_VALUE = 0x0.000002P-126f;
    private final float value;
    public Float(float value) { this.value = value; }
    public int intValue() { return (int) value; }
    public long longValue() { return (long) value; }
    public double doubleValue() { return value; }
    public float floatValue() { return value; }
    public boolean isNaN() { return value != value; }
    public native boolean equals(Object other);
    public int hashCode() { return hashCode(value); }
    public String toString() { return toString(value); }
    public int compareTo(Float other) { return Double.compare(value, other.value); }
    public static native Float valueOf(float value);
    public static native int floatToIntBits(float value);
    public static native float intBitsToFloat(int bits);
    public static native int hashCode(float value);
    public static float parseFloat(String text) { return (float) Double.parseDouble(text); }
    public static native String toString(float value);
    public static int compare(float a, float b) { return Double.compare(a, b); }
    public static boolean isNaN(float value) { return value != value; }
    public static float max(float a, float b) { return Math.max(a, b); }
    public static float min(float a, float b) { return Math.min(a, b); }
    public static float sum(float a, float b) { return a + b; }
}
`);
    Java.addLibrary('java.lang.character', 'java.lang', String.raw`
public final class Character implements Comparable<Character>, java.io.Serializable {
    public static final char MIN_VALUE = '\u0000';
    public static final char MAX_VALUE = '￿';
    public static final int MIN_RADIX = 2;
    public static final int MAX_RADIX = 36;
    private final char value;
    public Character(char value) { this.value = value; }
    public char charValue() { return value; }
    public boolean equals(Object other) { return other instanceof Character c && c.value == value; }
    public int hashCode() { return value; }
    public String toString() { return String.valueOf(value); }
    public int compareTo(Character other) { return value - other.value; }
    public static native Character valueOf(char value);
    public static String toString(char value) { return String.valueOf(value); }
    public static int compare(char a, char b) { return a - b; }
    public static int hashCode(char value) { return value; }
    public static native boolean isDigit(char ch);
    public static native boolean isLetter(char ch);
    public static native boolean isLetterOrDigit(char ch);
    public static native boolean isAlphabetic(int codePoint);
    public static native boolean isWhitespace(char ch);
    public static native boolean isSpaceChar(char ch);
    public static native boolean isUpperCase(char ch);
    public static native boolean isLowerCase(char ch);
    public static native char toUpperCase(char ch);
    public static native char toLowerCase(char ch);
    public static native int getNumericValue(char ch);
    public static native int digit(char ch, int radix);
    public static native char forDigit(int digit, int radix);
    public static boolean isDigit(int codePoint) { return isDigit((char) codePoint); }
    public static boolean isLetter(int codePoint) { return isLetter((char) codePoint); }
    public static boolean isWhitespace(int codePoint) { return isWhitespace((char) codePoint); }
    public static boolean isUpperCase(int codePoint) { return isUpperCase((char) codePoint); }
    public static boolean isLowerCase(int codePoint) { return isLowerCase((char) codePoint); }
    public static int toUpperCase(int codePoint) { return toUpperCase((char) codePoint); }
    public static int toLowerCase(int codePoint) { return toLowerCase((char) codePoint); }
    public static native String toString(int codePoint);
    public static char[] toChars(int codePoint) { return toString(codePoint).toCharArray(); }
}
`);
    Java.addLibrary('java.lang.math', 'java.lang', String.raw`
public final class Math {
    public static final double PI = 3.141592653589793;
    public static final double E = 2.718281828459045;
    private Math() {}
    public static int abs(int a) { return a < 0 ? -a : a; }
    public static long abs(long a) { return a < 0 ? -a : a; }
    public static float abs(float a) { return a <= 0.0f ? 0.0f - a : a; }
    public static double abs(double a) { return a <= 0.0 ? 0.0 - a : a; }
    public static int max(int a, int b) { return a >= b ? a : b; }
    public static long max(long a, long b) { return a >= b ? a : b; }
    public static native float max(float a, float b);
    public static native double max(double a, double b);
    public static int min(int a, int b) { return a <= b ? a : b; }
    public static long min(long a, long b) { return a <= b ? a : b; }
    public static native float min(float a, float b);
    public static native double min(double a, double b);
    public static native double sqrt(double a);
    public static native double cbrt(double a);
    public static native double pow(double a, double b);
    public static native double exp(double a);
    public static native double log(double a);
    public static native double log10(double a);
    public static native double log1p(double a);
    public static native double expm1(double a);
    public static native double sin(double a);
    public static native double cos(double a);
    public static native double tan(double a);
    public static native double asin(double a);
    public static native double acos(double a);
    public static native double atan(double a);
    public static native double atan2(double y, double x);
    public static native double sinh(double a);
    public static native double cosh(double a);
    public static native double tanh(double a);
    public static native double hypot(double x, double y);
    public static native double floor(double a);
    public static native double ceil(double a);
    public static native double rint(double a);
    public static native long round(double a);
    public static native int round(float a);
    public static native double signum(double a);
    public static native float signum(float a);
    public static native double random();
    public static native double toRadians(double degrees);
    public static native double toDegrees(double radians);
    public static int floorDiv(int a, int b) { int q = a / b; return (a % b != 0 && ((a ^ b) < 0)) ? q - 1 : q; }
    public static long floorDiv(long a, long b) { long q = a / b; return (a % b != 0 && ((a ^ b) < 0)) ? q - 1 : q; }
    public static int floorMod(int a, int b) { int m = a % b; return (m != 0 && ((m ^ b) < 0)) ? m + b : m; }
    public static long floorMod(long a, long b) { long m = a % b; return (m != 0 && ((m ^ b) < 0)) ? m + b : m; }
    public static native int addExact(int a, int b);
    public static native long addExact(long a, long b);
    public static native int multiplyExact(int a, int b);
    public static native long multiplyExact(long a, long b);
    public static native int subtractExact(int a, int b);
    public static native int toIntExact(long value);
    public static native int negateExact(int a);
    public static double fma(double a, double b, double c) { return a * b + c; }
    public static native double nextUp(double a);
    public static native double nextDown(double a);
    public static native double nextAfter(double start, double direction);
    public static native double ulp(double a);
}

public final class StrictMath {
    private StrictMath() {}
    public static double sqrt(double a) { return Math.sqrt(a); }
    public static double cbrt(double a) { return Math.cbrt(a); }
    public static double pow(double a, double b) { return Math.pow(a, b); }
    public static double exp(double a) { return Math.exp(a); }
    public static double log(double a) { return Math.log(a); }
    public static double log10(double a) { return Math.log10(a); }
    public static double sin(double a) { return Math.sin(a); }
    public static double cos(double a) { return Math.cos(a); }
    public static double tan(double a) { return Math.tan(a); }
    public static double atan2(double y, double x) { return Math.atan2(y, x); }
    public static double floor(double a) { return Math.floor(a); }
    public static double ceil(double a) { return Math.ceil(a); }
    public static double abs(double a) { return Math.abs(a); }
    public static int abs(int a) { return Math.abs(a); }
    public static long abs(long a) { return Math.abs(a); }
    public static double max(double a, double b) { return Math.max(a, b); }
    public static double min(double a, double b) { return Math.min(a, b); }
    public static long round(double a) { return Math.round(a); }
    public static double random() { return Math.random(); }
}
`);
    // The text of a StringBuilder is a JavaScript string in a field of the object.
    Java.addLibrary('java.lang.builder', 'java.lang', String.raw`
public final class StringBuilder implements CharSequence, Comparable<StringBuilder> {
    public native StringBuilder();
    public native StringBuilder(int capacity);
    public native StringBuilder(String text);
    public native StringBuilder(CharSequence text);
    public native StringBuilder append(Object value);
    public native StringBuilder append(String value);
    public native StringBuilder append(CharSequence value);
    public native StringBuilder append(CharSequence value, int start, int end);
    public native StringBuilder append(char[] value);
    public native StringBuilder append(boolean value);
    public native StringBuilder append(char value);
    public native StringBuilder append(int value);
    public native StringBuilder append(long value);
    public native StringBuilder append(float value);
    public native StringBuilder append(double value);
    public native StringBuilder insert(int offset, String value);
    public native StringBuilder insert(int offset, char value);
    public native StringBuilder insert(int offset, int value);
    public native StringBuilder insert(int offset, Object value);
    public native StringBuilder reverse();
    public native StringBuilder delete(int start, int end);
    public native StringBuilder deleteCharAt(int index);
    public native StringBuilder replace(int start, int end, String text);
    public native int length();
    public native char charAt(int index);
    public native void setCharAt(int index, char ch);
    public native void setLength(int length);
    public native int indexOf(String text);
    public native int indexOf(String text, int from);
    public native int lastIndexOf(String text);
    public native String substring(int start);
    public native String substring(int start, int end);
    public native CharSequence subSequence(int start, int end);
    public native boolean isEmpty();
    public native int compareTo(StringBuilder other);
    public native String toString();
    public native java.util.stream.IntStream chars();
}
`);
    Java.addLibrary('java.lang.system', 'java.lang', String.raw`
public final class System {
    public static final java.io.PrintStream out = java.io.PrintStream.console(false);
    public static final java.io.PrintStream err = java.io.PrintStream.console(true);
    public static final java.io.InputStream in = new java.io.StandardInputStream();
    private System() {}
    public static native long currentTimeMillis();
    public static native long nanoTime();
    public static native void arraycopy(Object source, int sourcePosition, Object target, int targetPosition, int length);
    public static native void exit(int status);
    public static native int identityHashCode(Object value);
    public static String lineSeparator() { return "\n"; }
    public static native String getProperty(String key);
    public static native String getenv(String name);
    public static void gc() {}
}

public class Thread implements Runnable {
    private final Runnable target;
    private String name;
    private final long id;
    private boolean daemon;
    private int priority = 5;
    private static int counter = 0;
    private static long ids = 1;
    public Thread() { this(null, null); }
    public Thread(Runnable target) { this(target, null); }
    public Thread(String name) { this(null, name); }
    public Thread(Runnable target, String name) {
        this.target = target;
        this.name = name != null ? name : "Thread-" + (counter++);
        this.id = ids++;
    }
    public void run() {
        if (target != null)
            target.run();
    }
    public native void start();
    public native void join() throws InterruptedException;
    public native void join(long millis) throws InterruptedException;
    public native boolean isAlive();
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public long getId() { return id; }
    public long threadId() { return id; }
    public void setDaemon(boolean daemon) { this.daemon = daemon; }
    public boolean isDaemon() { return daemon; }
    public void setPriority(int priority) { this.priority = priority; }
    public int getPriority() { return priority; }
    public void interrupt() {}
    public boolean isInterrupted() { return false; }
    public static boolean interrupted() { return false; }
    public String toString() { return "Thread[#" + id + "," + name + "," + priority + ",main]"; }
    public static native Thread currentThread();
    public static native void sleep(long millis) throws InterruptedException;
    public static native void yield();
    public static native void onSpinWait();
}
`);
    // Exceptions: the JavaScript stack is kept at creation - it gives the
    // line of the unit.
    Java.addLibrary('java.lang.throwable', 'java.lang', String.raw`
public class Throwable implements java.io.Serializable {
    private String message;
    private Throwable cause;
    public Throwable() { this(null, null); }
    public Throwable(String message) { this(message, null); }
    public Throwable(Throwable cause) { this(cause == null ? null : cause.toString(), cause); }
    public Throwable(String message, Throwable cause) {
        this.message = message;
        this.cause = cause;
        fillInStackTrace();
    }
    public String getMessage() { return message; }
    public String getLocalizedMessage() { return getMessage(); }
    public Throwable getCause() { return cause; }
    public Throwable initCause(Throwable cause) { this.cause = cause; return this; }
    public String toString() {
        String text = getLocalizedMessage();
        return text != null ? getClass().getName() + ": " + text : getClass().getName();
    }
    public native Throwable fillInStackTrace();
    public native void printStackTrace();
    public native StackTraceElement[] getStackTrace();
    public void addSuppressed(Throwable exception) {}
}

public final class StackTraceElement {
    private final String text;
    StackTraceElement(String text) { this.text = text; }
    public String toString() { return text; }
}

public class Exception extends Throwable {
    public Exception() { super(); }
    public Exception(String message) { super(message); }
    public Exception(String message, Throwable cause) { super(message, cause); }
    public Exception(Throwable cause) { super(cause); }
}

public class RuntimeException extends Exception {
    public RuntimeException() { super(); }
    public RuntimeException(String message) { super(message); }
    public RuntimeException(String message, Throwable cause) { super(message, cause); }
    public RuntimeException(Throwable cause) { super(cause); }
}

public class Error extends Throwable {
    public Error() { super(); }
    public Error(String message) { super(message); }
    public Error(String message, Throwable cause) { super(message, cause); }
}
`);
    // Exceptions with the usual constructors: (), (message), (message, cause).
    function exceptions(list) {
        return list.map(function (item) {
            var name = item[0], base = item[1];
            return 'public class ' + name + ' extends ' + base + ' {\n' +
                '    public ' + name + '() { super(); }\n' +
                '    public ' + name + '(String message) { super(message); }\n' +
                '    public ' + name + '(String message, Throwable cause) { super(message, cause); }\n' +
                '}\n';
        }).join('\n');
    }
    Java.exceptionSource = exceptions;

    Java.addLibrary('java.lang.exceptions', 'java.lang', exceptions([
        ['IllegalArgumentException', 'RuntimeException'], ['IllegalStateException', 'RuntimeException'],
        ['ArithmeticException', 'RuntimeException'], ['NullPointerException', 'RuntimeException'],
        ['ClassCastException', 'RuntimeException'], ['IndexOutOfBoundsException', 'RuntimeException'],
        ['ArrayIndexOutOfBoundsException', 'IndexOutOfBoundsException'],
        ['StringIndexOutOfBoundsException', 'IndexOutOfBoundsException'],
        ['NegativeArraySizeException', 'RuntimeException'], ['ArrayStoreException', 'RuntimeException'],
        ['NumberFormatException', 'IllegalArgumentException'], ['UnsupportedOperationException', 'RuntimeException'],
        ['SecurityException', 'RuntimeException'], ['CloneNotSupportedException', 'Exception'],
        ['InterruptedException', 'Exception'], ['ReflectiveOperationException', 'Exception'],
        ['ClassNotFoundException', 'ReflectiveOperationException'],
        ['StackOverflowError', 'Error'], ['OutOfMemoryError', 'Error'], ['AssertionError', 'Error'],
        ['InternalError', 'Error'], ['MatchException', 'RuntimeException']
    ]));
})(globalThis);
