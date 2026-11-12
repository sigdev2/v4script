// Numbers as on the JVM: Int wraps, Long is exact, Double prints the
// shortest form, unsigned types, bit operations, kotlin.math.
import kotlin.math.*

fun main() {
    val big = Int.MAX_VALUE
    println(big + 1)
    println(big.toLong() + 1)
    println(Long.MAX_VALUE)
    println(Long.MIN_VALUE - 1)
    println(1_000_000 * 3_000)
    println(1_000_000L * 3_000)
    println(-7 / 2)
    println(-7 % 2)
    println((-7).mod(2))
    println(7.0 / 2)
    println(1.0 / 0)
    println(0.0 / 0)
    println(0.1 + 0.2)
    println(1e21)
    println(1.0e-5)
    println(100.0)
    println(3.0f * 1.1f)
    println(2.5.roundToInt())
    println((-2.5).roundToInt())
    println(round(2.5))
    println(7.9.toInt())
    println((-7.9).toInt())
    println(1e10.toInt())
    println(300.toByte())
    println((-1).toUInt())
    println(0xFF)
    println(0b1011)
    println(1 shl 10)
    println(-16 shr 2)
    println(-16 ushr 28)
    println(0b1100 and 0b1010)
    println(0b1100 or 0b1010)
    println(0b1100 xor 0b1010)
    println(5.inv())
    println(Integer.toBinaryString(42))
    println(Long.MAX_VALUE.countOneBits())
    println(Int.MIN_VALUE.absoluteValue)

    val u: UInt = 4_000_000_000u
    println(u + 500_000_000u)
    println(u / 3u)
    val ul: ULong = ULong.MAX_VALUE
    println(ul)
    println(ul / 2u)
    val ub: UByte = 250u
    println((ub + 10u).toUByte())

    println(sqrt(2.0))
    println(2.0.pow(10))
    println(abs(-3) + max(4, 9) + min(-1, 2))
    println(floor(-1.5) + ceil(1.2))
    println(PI)
    println(hypot(3.0, 4.0))
    println(ln(E))
    println(log10(1000.0))
    println(sin(PI / 2))
    println(10.coerceIn(1, 5))
    println(-3.coerceAtLeast(0))
    println(17.0.rem(5.0))
    println(5.0.sign)

    var total = 0L
    for (i in 1..1_000_000) total += i
    println(total)
    var factorial = 1L
    for (i in 2..20) factorial *= i
    println(factorial)
    factorial *= 21
    println(factorial)
    val c = 'A'
    println(c + 25)
    println(c.code + 1)
    println((c.code + 32).toChar())
    println(97.toChar())
    println(listOf(3, 1, 2).sum() / 2.0)
    println(listOf(1.5, 2.5).average())
    println(Double.MAX_VALUE)
    println(Float.MIN_VALUE)
    println(1234567.0)
    println(12345678.0)
    println(0.000123)
    println(123456789.0f)
    println(1.0 == 1.00)
    println(0.1f.toDouble())
}

// Output:
// -2147483648
// 2147483648
// 9223372036854775807
// 9223372036854775807
// -1294967296
// 3000000000
// -3
// -1
// 1
// 3.5
// Infinity
// NaN
// 0.30000000000000004
// 1.0E21
// 1.0E-5
// 100.0
// 3.3000002
// 3
// -2
// 2.0
// 7
// -7
// 2147483647
// 44
// 4294967295
// 255
// 11
// 1024
// -4
// 15
// 8
// 14
// 6
// -6
// 101010
// 63
// -2147483648
// 205032704
// 1333333333
// 18446744073709551615
// 9223372036854775807
// 4
// 1.4142135623730951
// 1024.0
// 11
// 0.0
// 3.141592653589793
// 5.0
// 1.0
// 3.0
// 1.0
// 5
// -3
// 2.0
// 1.0
// 500000500000
// 2432902008176640000
// -4249290049419214848
// Z
// 66
// a
// a
// 3.0
// 2.0
// 1.7976931348623157E308
// 1.4E-45
// 1234567.0
// 1.2345678E7
// 1.23E-4
// 1.2345679E8
// true
// 0.10000000149011612
