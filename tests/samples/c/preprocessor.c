#include <stdio.h>

#define SQUARE(x) ((x) * (x))
#define MAX(a, b) ((a) > (b) ? (a) : (b))
#define STR(x) #x
#define XSTR(x) STR(x)
#define CAT(a, b) a##b
#define LOG(fmt, ...) printf("[log] " fmt "\n", ##__VA_ARGS__)
#define VERSION 3
#define DEBUG

#if VERSION >= 3 && defined(DEBUG)
#define MODE "debug-v3"
#elif VERSION >= 3
#define MODE "release-v3"
#else
#define MODE "old"
#endif

#ifndef MISSING
#define MISSING 0
#endif

#define COUNT_OF(array) (sizeof(array) / sizeof((array)[0]))

#define FOREACH(item, array) for (int item##_i = 0, item = (array)[0]; item##_i < (int)COUNT_OF(array); item = (array)[++item##_i < (int)COUNT_OF(array) ? item##_i : 0])

int main(void)
{
    int CAT(my, value) = 5;
    printf("%d %d %d\n", SQUARE(myvalue + 1), MAX(3, 9), MAX(-1, -2));
    printf("%s %s %s\n", STR(a + b), XSTR(VERSION), MODE);
    LOG("plain");
    LOG("%d+%d", 1, 2);
    printf("%d %d\n", MISSING, __LINE__);
    int numbers[] = { 4, 8, 15, 16, 23, 42 };
    int total = 0;
    FOREACH(n, numbers)
        total += n;
    printf("%d %zu\n", total, COUNT_OF(numbers));
#undef VERSION
#ifdef VERSION
    printf("still defined\n");
#else
    printf("undefined\n");
#endif
    printf("%s\n", __func__);
    return 0;
}

// Output:
// 36 9 -1
// a + b 3 debug-v3
// [log] plain
// [log] 1+2
// 0 35
// 108 6
// undefined
// main
