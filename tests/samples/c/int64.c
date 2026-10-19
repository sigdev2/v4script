#include <inttypes.h>
#include <limits.h>
#include <stdint.h>
#include <stdio.h>

static uint64_t mix(uint64_t x)
{
    x ^= x >> 33;
    x *= 0xff51afd7ed558ccdULL;
    x ^= x >> 33;
    x *= 0xc4ceb9fe1a85ec53ULL;
    x ^= x >> 33;
    return x;
}

int main(void)
{
    int64_t a = INT64_MAX, b = INT64_MIN;
    printf("%" PRId64 " %" PRId64 "\n", a, b);
    printf("%lld %lld %lld\n", a / 7, b / 7, b % 7);
    printf("%lld %lld\n", -9007199254740993LL / 3, -9007199254740993LL % 1000);
    uint64_t u = UINT64_MAX;
    printf("%llu %llu %llu\n", u / 10, u % 10, u >> 60);
    printf("%d %d %d\n", a > b, (uint64_t)b > (uint64_t)a, -1LL < 0LL);
    printf("%d\n", (unsigned long long)-1 > 0);
    printf("%016" PRIx64 "\n", mix(42));
    long long big = 1LL << 62;
    printf("%lld %lld\n", big, big >> 61);
    printf("%lld\n", (long long)(big * 3));
    printf("%llx\n", 0x123456789abcdefULL << 8);
    printf("%lld %llu\n", (long long)9.0e18, (unsigned long long)1.5e19);
    printf("%.1f %.1f\n", (double)a, (double)u);
    int32_t truncated = (int32_t)0x1234567890LL;
    printf("%d %u\n", truncated, (uint32_t)-1LL);
    long long sum = 0;
    for (long long i = 0; i < 100000; i++)
        sum += i * i;
    printf("%lld\n", sum);
    uint64_t fact = 1;
    for (int i = 1; i <= 25; i++)
        fact *= i;
    printf("%llu\n", fact);
    printf("%lld %lld\n", llabs(LLONG_MIN + 1), -(LLONG_MIN + 5));
    unsigned long long mask = ~0ULL ^ (1ULL << 63);
    printf("%llx\n", mask);
    return 0;
}

// Output:
// 9223372036854775807 -9223372036854775808
// 1317624576693539401 -1317624576693539401 -1
// -3002399751580331 -993
// 1844674407370955161 5 15
// 1 1 1
// 1
// 810879608e4259cc
// 4611686018427387904 2
// -4611686018427387904
// 23456789abcdef00
// 9000000000000000000 15000000000000000000
// 9223372036854775808.0 18446744073709551616.0
// 878082192 4294967295
// 333328333350000
// 7034535277573963776
// 9223372036854775807 9223372036854775803
// 7fffffffffffffff
