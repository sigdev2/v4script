#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define N 1000000

static char sieve[N + 1];

static int count_primes(void)
{
    memset(sieve, 1, sizeof sieve);
    sieve[0] = sieve[1] = 0;
    for (int i = 2; (long)i * i <= N; i++)
        if (sieve[i])
            for (int j = i * i; j <= N; j += i)
                sieve[j] = 0;
    int count = 0;
    for (int i = 0; i <= N; i++)
        count += sieve[i];
    return count;
}

static void quicksort(int *a, int lo, int hi)
{
    while (lo < hi) {
        int pivot = a[(lo + hi) / 2], i = lo, j = hi;
        while (i <= j) {
            while (a[i] < pivot)
                i++;
            while (a[j] > pivot)
                j--;
            if (i <= j) {
                int t = a[i];
                a[i++] = a[j];
                a[j--] = t;
            }
        }
        if (j - lo < hi - i) {
            quicksort(a, lo, j);
            lo = i;
        } else {
            quicksort(a, i, hi);
            hi = j;
        }
    }
}

static double matrix[64][64], other[64][64], result[64][64];

int main(void)
{
    printf("%d\n", count_primes());

    int n = 100000;
    int *data = malloc(n * sizeof *data);
    unsigned seed = 12345;
    for (int i = 0; i < n; i++) {
        seed = seed * 1103515245 + 12345;
        data[i] = (seed >> 8) % 100000;
    }
    quicksort(data, 0, n - 1);
    int sorted = 1;
    for (int i = 1; i < n; i++)
        sorted &= data[i - 1] <= data[i];
    printf("%d %d %d\n", sorted, data[0], data[n - 1]);
    free(data);

    for (int i = 0; i < 64; i++)
        for (int j = 0; j < 64; j++) {
            matrix[i][j] = i + j;
            other[i][j] = i == j ? 2 : 0;
        }
    for (int i = 0; i < 64; i++)
        for (int j = 0; j < 64; j++) {
            double s = 0;
            for (int k = 0; k < 64; k++)
                s += matrix[i][k] * other[k][j];
            result[i][j] = s;
        }
    printf("%.0f %.0f\n", result[0][0], result[63][63]);

    char *text = malloc(1);
    text[0] = 0;
    size_t length = 0;
    for (int i = 0; i < 1000; i++) {
        char piece[16];
        int written = snprintf(piece, sizeof piece, "%d,", i);
        text = realloc(text, length + written + 1);
        memcpy(text + length, piece, written + 1);
        length += written;
    }
    printf("%zu %.10s\n", length, text + length - 10);
    free(text);
    return 0;
}

// Output:
// 78498
// 1 0 99999
// 0 252
// 3890 7,998,999,
