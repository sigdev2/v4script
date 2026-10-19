// Integers with overflow, long, division, shifts, floats, casts, char as
// a number, Integer and Long, Math.
public class Main {
    public static void main(String[] args) {
        int max = Integer.MAX_VALUE;
        System.out.println((max + 1) + " " + (Integer.MIN_VALUE - 1) + " " + Math.abs(Integer.MIN_VALUE));
        long big = Long.MAX_VALUE;
        System.out.println(big + " " + (big + 1) + " " + (big / 7) + " " + (big % 1000));
        long product = 123456789L * 987654321L;
        System.out.println(product + " " + (product * 1000) + " " + Long.toHexString(product));
        System.out.println(7 / 2 + " " + (-7 / 2) + " " + (-7 % 3) + " " + Math.floorMod(-7, 3) + " " + Math.floorDiv(-7, 2));
        System.out.println((1 << 31) + " " + (1 << 32) + " " + (-16 >> 2) + " " + (-16 >>> 28) + " " + (1L << 40));
        System.out.println((-1L >>> 1) + " " + (0xFFL << 56) + " " + (5 & 3) + " " + (5 | 3) + " " + (5 ^ 3) + " " + (~5));
        byte b = (byte) 200;
        short s = (short) 70000;
        char c = 'A';
        c += 2;
        System.out.println(b + " " + s + " " + c + " " + (int) c + " " + (char) (c + 1) + " " + (c + 1));
        System.out.println((int) 3.99 + " " + (int) -3.99 + " " + (long) 1e19 + " " + (int) Double.NaN + " " + (int) 1e10);
        System.out.println(0.1 + 0.2 + " " + 1.0 / 3 + " " + 100.0 + " " + 1e7 + " " + 1.0e-4 + " " + 123456789.0 * 1000);
        System.out.println(1.0f / 3 + " " + 0.1f + " " + (double) 0.1f + " " + 3.0f * 1.1f);
        System.out.println(1.0 / 0 + " " + -1.0 / 0 + " " + 0.0 / 0 + " " + (0.0 == -0.0) + " " + Double.compare(0.0, -0.0));
        System.out.println(Math.sqrt(2) + " " + Math.pow(2, 10) + " " + Math.round(2.5) + " " + Math.round(-2.5) + " " + Math.round(2.4f));
        System.out.println(Math.max(3, 7) + " " + Math.min(-1.5, 2) + " " + Math.ceil(-0.5) + " " + Math.floor(-0.5) + " " + Math.hypot(3, 4));
        System.out.println(Integer.parseInt("-123") + Integer.valueOf(23) + " " + Integer.toBinaryString(42) + " " + Integer.toHexString(-1));
        System.out.println(Long.parseLong("9000000000") * 2 + " " + Integer.MAX_VALUE * 2L + " " + Integer.bitCount(255) + " " + Long.numberOfTrailingZeros(64));
        System.out.println(Integer.compare(3, 5) + " " + Character.isDigit('7') + " " + Character.toUpperCase('ж') + " " + Character.getNumericValue('9'));
        System.out.println(Double.parseDouble("3.25") * 2 + " " + Double.toString(1e-5) + " " + Double.valueOf("1e3") + " " + Double.MAX_VALUE + " " + Double.MIN_VALUE);
        Integer x = 127, y = 127;
        System.out.println(x.equals(y) + " " + x.compareTo(5) + " " + x.hashCode() + " " + Long.valueOf(5).hashCode() + " " + Double.valueOf(1.5).hashCode());
        int sum = 0;
        for (int i = 1; i <= 100; i++)
            sum += i * i;
        long factorial = 1;
        for (int i = 2; i <= 20; i++)
            factorial *= i;
        System.out.println(sum + " " + factorial + " " + factorial * 21);
        System.out.println(010 + " " + 0x1F + " " + 0b1011 + " " + 1_000_000 + " " + 'a' + 'b' + " " + (char) ('a' + 1));
        int i = 5;
        i += 3.7;
        i -= 'a';
        System.out.println(i + " " + (i++ + ++i) + " " + i);
    }
}

// Output:
// -2147483648 2147483647 -2147483648
// 9223372036854775807 -9223372036854775808 1317624576693539401 807
// 121932631112635269 -7194577403331592312 1b13114fbff5385
// 3 -3 -1 2 -4
// -2147483648 1 -4 15 1099511627776
// 9223372036854775807 -72057594037927936 1 7 6 -6
// -56 4464 C 67 D 68
// 3 -3 9223372036854775807 0 2147483647
// 0.30000000000000004 0.3333333333333333 100.0 1.0E7 1.0E-4 1.23456789E11
// 0.33333334 0.1 0.10000000149011612 3.3000002
// Infinity -Infinity NaN true 1
// 1.4142135623730951 1024.0 3 -2 2
// 7 -1.5 -0.0 -1.0 5.0
// -100 101010 ffffffff
// 18000000000 4294967294 8 6
// -1 true Ж 9
// 6.5 1.0E-5 1000.0 1.7976931348623157E308 4.9E-324
// true 1 127 5 1073217536
// 338350 2432902008176640000 -4249290049419214848
// 8 31 11 1000000 ab b
// -89 -176 -87
