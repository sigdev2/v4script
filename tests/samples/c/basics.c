#include <limits.h>
#include <stdint.h>
#include <stdio.h>

int main(void)
{
    int a = 17, b = 5;
    printf("%d %d %d %d\n", a / b, a % b, -a / b, -a % b);
    unsigned u = 0;
    u--;
    printf("%u %d\n", u, (int)u);
    int big = INT_MAX;
    big++;
    printf("%d\n", big);
    char c = 'A' + 2;
    unsigned char uc = 250;
    uc += 10;
    signed char sc = 127;
    sc++;
    printf("%c %d %d\n", c, uc, sc);
    short s = 32767;
    s += 2;
    printf("%hd\n", s);
    long long ll = 9223372036854775807LL;
    printf("%lld %lld\n", ll, ll + 1);
    unsigned long long ull = 18446744073709551615ULL;
    printf("%llu %llx\n", ull, ull / 3);
    int64_t product = (int64_t)123456789 * 987654321;
    printf("%lld\n", (long long)product);
    printf("%d %d\n", 7 >> 1, -7 >> 1);
    printf("%u\n", 1u << 31);
    printf("%d\n", (int)3.99);
    printf("%d\n", (int)-3.99);
    printf("%.3f\n", 10 / 4 * 1.0);
    printf("%.3f\n", 10 / 4.0);
    printf("%zu %zu %zu %zu %zu\n", sizeof(char), sizeof(int), sizeof(long), sizeof(void *), sizeof(double));
    _Bool flag = 42;
    printf("%d\n", flag);
    float f = 0.1f;
    printf("%.10f\n", f);
    double d = 0.1 + 0.2;
    printf("%.17g %d\n", d, d == 0.3);
    printf("%d\n", -1 < 0u);
    uint8_t byte = 200;
    uint16_t word = (uint16_t)(byte * 400);
    printf("%u\n", word);
    return 0;
}

// Output:
// 3 2 -3 -2
// 4294967295 -1
// -2147483648
// C 4 -128
// -32767
// 9223372036854775807 -9223372036854775808
// 18446744073709551615 5555555555555555
// 121932631112635269
// 3 -4
// 2147483648
// 3
// -3
// 2.000
// 2.500
// 1 4 8 8 8
// 1
// 0.1000000015
// 0.30000000000000004 0
// 0
// 14464
