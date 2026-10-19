#include <stdarg.h>
#include <stdio.h>

static int counter(void)
{
    static int calls = 0;
    return ++calls;
}

static long fib(int n)
{
    return n < 2 ? n : fib(n - 1) + fib(n - 2);
}

static int sum(int count, ...)
{
    va_list ap;
    va_start(ap, count);
    int total = 0;
    for (int i = 0; i < count; i++)
        total += va_arg(ap, int);
    va_end(ap);
    return total;
}

static void say(const char *format, ...)
{
    va_list ap;
    va_start(ap, format);
    printf("> ");
    vprintf(format, ap);
    va_end(ap);
}

static const char *kind(int n)
{
    switch (n) {
    case 0:
        return "zero";
    case 1:
    case 2:
    case 3:
        return "small";
    default:
        if (n < 0)
            return "negative";
        return "big";
    }
}

int main(void)
{
    for (int i = -1; i < 5; i += 2)
        printf("%s ", kind(i));
    printf("\n");

    int i = 0, total = 0;
    while (1) {
        if (++i > 10)
            break;
        if (i % 2)
            continue;
        total += i;
    }
    printf("%d\n", total);

    int n = 0;
    do {
        n += 3;
    } while (n < 10);
    printf("%d\n", n);

    int fall = 0;
    switch (2) {
    case 1:
        fall += 1;
    case 2:
        fall += 2;
    case 3:
        fall += 3;
        break;
    case 4:
        fall += 4;
    }
    printf("%d\n", fall);

    counter();
    counter();
    printf("%d\n", counter());
    printf("%ld\n", fib(25));
    printf("%d\n", sum(4, 1, 2, 3, 4));
    say("%s=%d %.2f\n", "x", 42, 2.5);

    int x = 5;
    int y = (x++, x++, x);
    printf("%d %d\n", x, y);
    printf("%d\n", x > 3 ? x < 10 ? 1 : 2 : 3);

    unsigned long long h = 14695981039346656037ULL;
    const char *s = "hash";
    while (*s) {
        h ^= (unsigned char)*s++;
        h *= 1099511628211ULL;
    }
    printf("%016llx\n", h);

    int matrix[2][2] = { { 1, 2 }, { 3, 4 } };
    int trace = 0;
    for (int k = 0; k < 2; k++)
        trace += matrix[k][k];
    printf("%d\n", trace);
    return 0;
}

// Output:
// negative small small
// 30
// 12
// 5
// 3
// 75025
// 10
// > x=42 2.50
// 7 7
// 1
// 2e3d9ecc741a7811
// 5
