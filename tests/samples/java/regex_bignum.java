// Regular expressions (Pattern, Matcher, named groups, replacements) and
// big numbers (BigInteger, BigDecimal with rounding).
import java.math.*;
import java.util.*;
import java.util.regex.*;
import java.util.stream.*;

public class Main {
    public static void main(String[] args) {
        Pattern date = Pattern.compile("(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})");
        Matcher m = date.matcher("Начало 2024-03-15, конец 2025-12-01.");
        while (m.find())
            System.out.println(m.group() + " at " + m.start() + "-" + m.end() + ": " + m.group("day") + "." + m.group("month") + "." + m.group(1));
        System.out.println(date.matcher("2024-03-15").matches() + " " + date.matcher("x2024-03-15").matches() + " " + date.matcher("2024-03-15 tail").lookingAt());
        System.out.println(date.matcher("1999-01-02").replaceAll("${day}/${month}/${year}") + " " + "a1b22c333".replaceAll("\\d+", "#"));
        Matcher words = Pattern.compile("\\b(\\w)(\\w*)\\b").matcher("hello big world");
        StringBuilder sb = new StringBuilder();
        while (words.find())
            words.appendReplacement(sb, words.group(1).toUpperCase() + words.group(2));
        words.appendTail(sb);
        System.out.println(sb + " | " + Pattern.compile("o").matcher("foo boo").replaceAll(r -> "<" + r.start() + ">"));
        Pattern ci = Pattern.compile("java", Pattern.CASE_INSENSITIVE);
        System.out.println(ci.matcher("I like JAVA and Java").results().map(MatchResult::group).collect(Collectors.toList()) + " " +
                           Arrays.toString(Pattern.compile("[,;]\\s*").split("a, b;c,  d")) + " " + Pattern.matches("[a-z]+", "abc") + " " +
                           Pattern.compile("(\\d)(\\d)").matcher("12").groupCount());
        System.out.println(Pattern.compile("(?i)ab").matcher("xAB").find() + " " + "1+1=2".split(Pattern.quote("+")).length + " " +
                           List.of("apple", "banana", "cherry").stream().filter(Pattern.compile("an").asPredicate()).toList());

        BigInteger factorial = BigInteger.ONE;
        for (int i = 2; i <= 30; i++)
            factorial = factorial.multiply(BigInteger.valueOf(i));
        System.out.println(factorial + " " + factorial.bitLength() + " " + factorial.toString(16));
        BigInteger a = new BigInteger("123456789012345678901234567890"), b = new BigInteger("-987654321");
        System.out.println(a.add(b) + " " + a.subtract(b) + " " + a.divide(b) + " " + a.remainder(b) + " " + a.mod(BigInteger.valueOf(97)) + " " + b.abs().pow(3));
        System.out.println(a.gcd(new BigInteger("9876543210")) + " " + BigInteger.TWO.pow(100) + " " + BigInteger.TWO.pow(100).sqrt() + " " +
                           BigInteger.valueOf(3).modPow(BigInteger.valueOf(200), BigInteger.valueOf(1000007)) + " " + BigInteger.valueOf(7).modInverse(BigInteger.valueOf(40)));
        System.out.println(BigInteger.valueOf(97).isProbablePrime(20) + " " + new BigInteger("1000000007").nextProbablePrime() + " " +
                           a.hashCode() + " " + b.hashCode() + " " + a.compareTo(b) + " " + a.longValue() + " " + a.intValue() + " " + b.shiftLeft(3) + " " + b.shiftRight(2));
        BigDecimal price = new BigDecimal("19.99"), quantity = new BigDecimal("3");
        BigDecimal total = price.multiply(quantity);
        BigDecimal tax = total.multiply(new BigDecimal("0.07")).setScale(2, RoundingMode.HALF_UP);
        System.out.println(total + " " + tax + " " + total.add(tax) + " " + new BigDecimal("0.1").add(new BigDecimal("0.2")) + " " + (0.1 + 0.2));
        System.out.println(new BigDecimal("10").divide(new BigDecimal("4")) + " " + new BigDecimal("1.00").divide(new BigDecimal("8")) + " " +
                           new BigDecimal("10.0").divide(new BigDecimal("2")) + " " + BigDecimal.ONE.divide(new BigDecimal("3"), 5, RoundingMode.HALF_EVEN) + " " +
                           BigDecimal.ONE.divide(new BigDecimal("3"), MathContext.DECIMAL64));
        try {
            BigDecimal.ONE.divide(new BigDecimal("3"));
        } catch (ArithmeticException e) {
            System.out.println(e.getMessage());
        }
        for (RoundingMode mode : new RoundingMode[] { RoundingMode.UP, RoundingMode.DOWN, RoundingMode.CEILING, RoundingMode.FLOOR, RoundingMode.HALF_UP, RoundingMode.HALF_DOWN, RoundingMode.HALF_EVEN })
            System.out.print(mode + ":" + new BigDecimal("2.5").setScale(0, mode) + "," + new BigDecimal("-2.5").setScale(0, mode) + "," + new BigDecimal("1.15").setScale(1, mode) + " ");
        System.out.println();
        System.out.println(new BigDecimal("1E+3") + " " + new BigDecimal("0.00000012") + " " + new BigDecimal("1200").stripTrailingZeros() + " " +
                           new BigDecimal("1200").stripTrailingZeros().toPlainString() + " " + new BigDecimal(0.1) + " " + BigDecimal.valueOf(0.1) + " " +
                           new BigDecimal("2.50").equals(new BigDecimal("2.5")) + " " + new BigDecimal("2.50").compareTo(new BigDecimal("2.5")) + " " +
                           new BigDecimal("123.456").precision() + " " + new BigDecimal("123.456").round(new MathContext(4)) + " " + new BigDecimal("-7.5").intValue());
    }
}

// Output:
// 2024-03-15 at 7-17: 15.03.2024
// 2025-12-01 at 25-35: 01.12.2025
// true false true
// 02/01/1999 a#b#c#
// Hello Big World | f<1><2> b<5><6>
// [JAVA, Java] [a, b, c, d] true 2
// true 2 [banana]
// 265252859812191058636308480000000 108 d13f6370f96865df5dd54000000
// 123456789012345678900246913569 123456789012345678902222222211 -124999998873437499901 574845669 52 963418328693495609108518161
// 90 1267650600228229401496703205376 1125899906842624 959082 23
// true 1000000009 1915528825 -987654321 1 -4362896299872285998 1312754386 -7901234568 -246913581
// 59.97 4.20 64.17 0.3 0.30000000000000004
// 2.5 0.125 5.0 0.33333 0.3333333333333333
// Non-terminating decimal expansion; no exact representable decimal result.
// UP:3,-3,1.2 DOWN:2,-2,1.1 CEILING:3,-2,1.2 FLOOR:2,-3,1.1 HALF_UP:3,-3,1.2 HALF_DOWN:2,-2,1.1 HALF_EVEN:2,-2,1.2 
// 1E+3 1.2E-7 1.2E+3 1200 0.1000000000000000055511151231257827021181583404541015625 0.1 false 0 6 123.5 -7
