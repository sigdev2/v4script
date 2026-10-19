#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(void)
{
    printf("[%5d][%-5d][%05d][%+d][% d][%x][%X][%#x][%o][%#o]\n", 42, 42, 42, 42, 42, 255, 255, 255, 8, 8);
    printf("[%.3d][%8.3d][%-8.3d|][%.0d]\n", 7, 7, 7, 0);
    printf("[%c][%5c][%-3c|][%%]\n", 'x', 'y', 'z');
    printf("[%s][%8s][%-8s|][%.2s][%*s][%-*.*s|]\n", "abc", "abc", "abc", "abc", 5, "ab", 6, 2, "abcdef");
    printf("[%f][%.2f][%10.3f][%-10.1f|][%+.1f][%08.2f]\n", 3.14159, 2.675, -1.5, 2.25, 7.0, -3.5);
    printf("[%.0f][%.0f][%.0f][%.0f][%.1f][%.2f]\n", 0.5, 1.5, 2.5, -2.5, 0.25, 1.005);
    printf("[%e][%.2e][%E][%.0e]\n", 12345.678, 0.000123, 1e100, 5e-324);
    printf("[%g][%g][%g][%g][%g][%.3g][%#g][%G]\n", 100000.0, 1000000.0, 0.0001, 0.00001, 1.5, 3.14159, 2.0, 1e-20);
    printf("[%a][%a][%.2a][%A]\n", 1.0, 0.1, 3.14159, -2.5);
    printf("[%f][%e][%g][%F][%5.1f]\n", INFINITY, -INFINITY, NAN, INFINITY, -INFINITY);
    printf("[%ld][%lu][%lld][%llx][%hhd][%hu][%zd]\n", -1L, 4000000000UL, -9000000000LL, 0xDEADBEEFCAFEULL, 300, 70000, (long)-5);
    printf("[%p][%p]\n", (void *)0, (void *)0x1000);
    int count = 0;
    printf("abc%n|", &count);
    printf("%d\n", count);

    char buffer[64];
    int n = sprintf(buffer, "%s-%d-%.1f", "x", 12, 0.75);
    printf("%s %d\n", buffer, n);
    n = snprintf(buffer, 6, "%s", "truncated text");
    printf("%s %d\n", buffer, n);

    int a = 0, b = 0;
    double d = 0;
    char word[16], rest[16];
    int got = sscanf("  17 -4 2.5e1 hello world", "%d %d %lf %15s %15s", &a, &b, &d, word, rest);
    printf("%d: %d %d %.1f %s %s\n", got, a, b, d, word, rest);
    unsigned x = 0;
    char c = 0;
    got = sscanf("ff:Z", "%x:%c", &x, &c);
    printf("%d %u %c\n", got, x, c);
    char digits[8];
    got = sscanf("123abc", "%[0-9]%n", digits, &n);
    printf("%d %s %d\n", got, digits, n);
    printf("%d\n", sscanf("", "%d", &a));
    printf("%d\n", sscanf("x", "%d", &a));

    char *end;
    printf("%ld %ld %ld %ld\n", strtol("  -123xyz", &end, 10), strtol("0x1F", NULL, 16), strtol("0755", NULL, 0),
           strtol("z", NULL, 36));
    printf("[%s]\n", end);
    printf("%d %d %ld\n", atoi("42abc"), atoi("abc"), atol("-99999999999"));
    printf("%.3f %.3f %g\n", strtod("3.25rest", &end), atof("-1e3"), strtod("0x1.8p1", NULL));
    printf("[%s]\n", end);
    printf("%lu\n", strtoul("18446744073709551615", NULL, 10));
    return 0;
}

// Output:
// [   42][42   ][00042][+42][ 42][ff][FF][0xff][10][010]
// [007][     007][007     |][]
// [x][    y][z  |][%]
// [abc][     abc][abc     |][ab][   ab][ab    |]
// [3.141590][2.67][    -1.500][2.2       |][+7.0][-0003.50]
// [0][2][2][-2][0.2][1.00]
// [1.234568e+04][1.23e-04][1.000000E+100][5e-324]
// [100000][1e+06][0.0001][1e-05][1.5][3.14][2.00000][1E-20]
// [0x1p+0][0x1.999999999999ap-4][0x1.92p+1][-0X1.4P+1]
// [inf][-inf][nan][INF][ -inf]
// [-1][4000000000][-9000000000][deadbeefcafe][44][4464][-5]
// [(nil)][0x1000]
// abc|3
// x-12-0.8 8
// trunc 14
// 5: 17 -4 25.0 hello world
// 2 255 Z
// 1 123 3
// -1
// 0
// -123 31 493 35
// [xyz]
// 42 0 -99999999999
// 3.250 -1000.000 3
// [rest]
// 18446744073709551615
