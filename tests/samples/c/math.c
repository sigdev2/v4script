#include <ctype.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>

int main(void)
{
    printf("%.6f %.6f %.6f %.6f\n", sqrt(2.0), pow(2, 0.5), exp(1.0), log(10.0));
    printf("%.4f %.4f %.4f %.4f\n", sin(M_PI / 6), cos(M_PI / 3), tan(M_PI / 4), atan2(1, -1));
    printf("%.1f %.1f %.1f %.1f %.1f %.1f\n", floor(-2.5), ceil(-2.5), round(-2.5), trunc(-2.7), round(2.5), rint(2.5));
    printf("%.1f %.1f %.1f\n", fmod(10.0, 3.0), fmod(-10.0, 3.0), remainder(10.0, 3.0));
    printf("%.1f %.1f %.1f %.1f\n", fabs(-3.5), fmin(2, NAN), fmax(-1, 4), hypot(3, 4));
    printf("%.0f %.4f %.6f %.6f\n", tgamma(6), lgamma(10.5), erf(0.5), erfc(2.0));
    printf("%.6f %.6f %.6f\n", cbrt(27.0), log2(1024.0), log10(0.001));
    int e;
    double m = frexp(48.0, &e);
    double whole;
    double part = modf(-3.75, &whole);
    printf("%.4f %d %.1f %.2f %.1f\n", m, e, ldexp(0.75, 6), part, whole);
    printf("%d %d %d %d\n", isnan(NAN), isinf(-INFINITY), isfinite(1.0), signbit(-0.0) != 0);
    printf("%ld %ld\n", lround(-2.5), lround(2.5));
    printf("%.9g %.9g\n", sqrtf(2.0f), (double)(0.1f + 0.2f));
    printf("%d %d %d\n", abs(-7), (int)labs(-8L), (int)llabs(-9LL));
    div_t q = div(17, -5);
    printf("%d %d\n", q.quot, q.rem);

    const char *text = "Hello, World 42!";
    int letters = 0, digits = 0, spaces = 0, upper = 0, punct = 0;
    for (const char *p = text; *p; p++) {
        letters += isalpha(*p) != 0;
        digits += isdigit(*p) != 0;
        spaces += isspace(*p) != 0;
        upper += isupper(*p) != 0;
        punct += ispunct(*p) != 0;
    }
    printf("%d %d %d %d %d\n", letters, digits, spaces, upper, punct);
    char shout[32];
    int i = 0;
    for (; text[i]; i++)
        shout[i] = toupper(text[i]);
    shout[i] = 0;
    printf("%s %c\n", shout, tolower('Q'));

    srand(1);
    int r1 = rand(), r2 = rand(), r3 = rand();
    printf("%d %d %d\n", r1, r2, r3);
    srand(42);
    printf("%d\n", rand() % 100);
    return 0;
}

// Output:
// 1.414214 1.414214 2.718282 2.302585
// 0.5000 0.5000 1.0000 2.3562
// -3.0 -2.0 -3.0 -2.0 3.0 2.0
// 1.0 -1.0 1.0
// 3.5 2.0 4.0 5.0
// 120 13.9406 0.520500 0.004678
// 3.000000 10.000000 -3.000000
// 0.7500 6 48.0 -0.75 -3.0
// 1 -1 1 1
// -3 3
// 1.41421354 0.300000012
// 7 8 9
// -3 2
// 10 2 2 2 2
// HELLO, WORLD 42! q
// 1804289383 846930886 1681692777
// 66
