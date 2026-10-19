// Strings, StringBuilder, formatting, regular expressions, text blocks,
// characters.
import java.util.*;

public class Main {
    public static void main(String[] args) {
        String s = "Hello, World";
        System.out.println(s.length() + " " + s.charAt(4) + " " + s.indexOf('o') + " " + s.lastIndexOf("o") + " " + s.indexOf("xyz"));
        System.out.println(s.substring(7) + "|" + s.substring(0, 5) + "|" + s.toUpperCase() + "|" + s.toLowerCase());
        System.out.println(s.replace('l', 'L') + " " + s.replace("World", "Java") + " " + s.contains("lo, W") + " " + s.startsWith("Hell"));
        System.out.println("  trim me  ".trim() + "|" + "  strip  ".strip() + "|" + "".isEmpty() + " " + "   ".isBlank());
        System.out.println(String.join("-", "a", "b", "c") + " " + String.join("/", List.of("x", "y")) + " " + "ab".repeat(3));
        System.out.println(Arrays.toString("a,b,,c,,".split(",")) + " " + Arrays.toString("one  two three".split("\\s+")) + " " + Arrays.toString("a1b2c3".split("\\d")));
        System.out.println("apple".compareTo("banana") + " " + "b".compareTo("a") + " " + "abc".compareTo("abcd") + " " + "Abc".equalsIgnoreCase("aBC"));
        System.out.println("x".hashCode() + " " + "hello".hashCode() + " " + "".hashCode() + " " + "Привет".hashCode());
        System.out.println("2024-01-15".replaceAll("(\\d+)-(\\d+)-(\\d+)", "$3.$2.$1") + " " + "aaa".replaceFirst("a", "b") + " " + "abc123".matches("[a-z]+\\d+"));
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 5; i++)
            sb.append(i).append(',');
        sb.setLength(sb.length() - 1);
        sb.insert(0, "[").append("]");
        System.out.println(sb + " " + sb.length() + " " + sb.reverse() + " " + sb.indexOf("3"));
        sb = new StringBuilder("abcdef");
        sb.deleteCharAt(2).delete(0, 1).replace(1, 2, "XY").setCharAt(0, 'z');
        System.out.println(sb);
        System.out.println(String.format("|%5d|%-5d|%05d|%x|%X|%o|%,d|", 42, 42, 42, 255, 255, 8, 1234567));
        System.out.println(String.format("|%8.3f|%-8.2f|%.0f|%e|%.2e|%g|", Math.PI, 2.5, 2.5, 12345.678, 0.000123, 0.0001));
        System.out.println(String.format("|%s|%10s|%-10s|%c|%b|%%|%n", "hi", "right", "left", 'z', true).trim());
        System.out.println(String.format("%,.2f %+d %(d %08.3f %s", 1234567.891, 5, -5, -3.14159, List.of(1, 2)));
        System.out.println("%d items cost %.2f".formatted(3, 9.5));
        String block = """
            Line one
              indented "quoted"
            last\tline
            """;
        System.out.print(block);
        char[] chars = "dcba".toCharArray();
        Arrays.sort(chars);
        System.out.println(new String(chars) + " " + String.valueOf(chars, 1, 2) + " " + chars.length);
        int vowels = 0;
        for (char c : "Programming in Java".toLowerCase().toCharArray())
            if ("aeiou".indexOf(c) >= 0)
                vowels++;
        System.out.println(vowels + " " + Character.isLetter('ж') + " " + Character.isUpperCase('Q') + " " + (char) ('a' + 25));
        String text = "the cat and the hat";
        Map<Character, Integer> letters = new TreeMap<>();
        for (char c : text.toCharArray())
            if (c != ' ')
                letters.put(c, letters.getOrDefault(c, 0) + 1);
        System.out.println(letters);
        System.out.println(new StringBuilder("racecar").reverse().toString().equals("racecar") + " " + "a-b-c".lastIndexOf('-') + " " + "Mississippi".chars().distinct().count());
        System.out.println(String.valueOf(3.0) + String.valueOf(true) + String.valueOf('c') + String.valueOf(10L) + " " + Integer.toString(255, 16) + " " + Long.toString(-255, 2));
        String nullString = null;
        System.out.println("value: " + nullString + " " + Objects.toString(nullString, "default"));
    }
}

// Output:
// 12 o 4 8 -1
// World|Hello|HELLO, WORLD|hello, world
// HeLLo, WorLd Hello, Java true true
// trim me|strip|true true
// a-b-c x/y ababab
// [a, b, , c] [one, two, three] [a, b, c]
// -1 1 -1 true
// 120 99162322 0 1177014952
// 15.01.2024 baa true
// [0,1,2,3,4] 11 ]4,3,2,1,0[ 3
// zXYef
// |   42|42   |00042|ff|FF|10|1,234,567|
// |   3.142|2.50    |3|1.234568e+04|1.23e-04|0.000100000|
// |hi|     right|left      |z|true|%|
// 1,234,567.89 +5 (5) -003.142 [1, 2]
// 3 items cost 9.50
// Line one
//   indented "quoted"
// last	line
// abcd bc 4
// 6 true true z
// {a=3, c=1, d=1, e=2, h=3, n=1, t=4}
// true 3 4
// 3.0truec10 ff -11111111
// value: null default
