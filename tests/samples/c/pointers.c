#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void swap(int *a, int *b)
{
    int t = *a;
    *a = *b;
    *b = t;
}

static size_t count_char(const char *s, char c)
{
    size_t n = 0;
    for (; *s; s++)
        if (*s == c)
            n++;
    return n;
}

static char *reverse(const char *s)
{
    size_t n = strlen(s);
    char *r = malloc(n + 1);
    for (size_t i = 0; i < n; i++)
        r[i] = s[n - 1 - i];
    r[n] = '\0';
    return r;
}

int main(void)
{
    int x = 1, y = 2;
    swap(&x, &y);
    printf("%d %d\n", x, y);

    int a[5] = { 10, 20, 30 };
    int *p = a;
    p += 2;
    printf("%d %d %d %td\n", *p, p[-1], a[4], p - a);
    for (int *q = a; q < a + 5; ++q)
        *q *= 2;
    printf("%d %d %d\n", a[0], a[2], 2[a]);

    int grid[3][4];
    for (int i = 0; i < 3; i++)
        for (int j = 0; j < 4; j++)
            grid[i][j] = i * 10 + j;
    int (*row)[4] = grid + 1;
    printf("%d %d %zu %zu\n", grid[2][3], (*row)[2], sizeof grid, sizeof grid[0]);

    char text[32] = "hello";
    strcat(text, ", world");
    printf("%s %zu %zu\n", text, strlen(text), count_char(text, 'o'));
    char *r = reverse(text);
    printf("%s\n", r);
    free(r);
    printf("%d %d %d\n", strcmp("abc", "abd") < 0, strncmp("abcdef", "abcxyz", 3), strcmp("b", "a") > 0);
    printf("%s|%s\n", strchr(text, 'w'), strrchr(text, 'o'));
    printf("%s\n", strstr(text, "lo, w"));
    char copy[8];
    strncpy(copy, "abcdefghij", sizeof copy - 1);
    copy[7] = 0;
    printf("%s\n", copy);

    char words[] = "one,two,,three";
    for (char *t = strtok(words, ","); t != NULL; t = strtok(NULL, ","))
        printf("[%s]", t);
    printf("\n");

    int *dynamic = calloc(4, sizeof(int));
    dynamic[3] = 7;
    dynamic = realloc(dynamic, 100 * sizeof(int));
    for (int i = 4; i < 100; i++)
        dynamic[i] = i;
    long sum = 0;
    for (int i = 0; i < 100; i++)
        sum += dynamic[i];
    printf("%ld\n", sum);
    free(dynamic);

    unsigned char bytes[4];
    unsigned int value = 0x11223344;
    memcpy(bytes, &value, sizeof value);
    printf("%02x %02x %02x %02x\n", bytes[0], bytes[1], bytes[2], bytes[3]);
    memset(bytes, 0xAB, 2);
    printf("%x\n", *(unsigned int *)bytes);

    const char *names[] = { "Анна", "Борис", NULL };
    for (const char **n = names; *n; n++)
        printf("%s:%zu ", *n, strlen(*n));
    printf("\n");

    void *nothing = NULL;
    printf("%p %d\n", nothing, nothing == 0);
    return 0;
}

// Output:
// 2 1
// 30 20 0 2
// 20 60 60
// 23 12 48 16
// hello, world 12 2
// dlrow ,olleh
// 1 0 1
// world|orld
// lo, world
// abcdefg
// [one][two][three]
// 4951
// 44 33 22 11
// 1122abab
// Анна:8 Борис:10
// (nil) 1
