// Variable length arrays: run-time sizes at any level, pointers to rows,
// sizeof, parameters sized by earlier parameters, and the arrays of a loop
// body freed at every iteration.
#include <stdio.h>

static void fill(int n, int m, int a[n][m]);

static int sum(int n, int m, int a[n][m])
{
    int total = 0;
    for (int i = 0; i < n; ++i)
        for (int j = 0; j < m; ++j)
            total += a[i][j];
    return total;
}

static void fill(int n, int m, int a[n][m])
{
    for (int i = 0; i < n; ++i)
        for (int j = 0; j < m; ++j)
            a[i][j] = i * m + j;
}

static void transpose(int n, int m, const int in[n][m], int out[m][n])
{
    for (int i = 0; i < n; ++i)
        for (int j = 0; j < m; ++j)
            out[j][i] = in[i][j];
}

static size_t rowBytes(int n, int m, double a[n][m])
{
    return sizeof a[0] + (size_t)(a[1] - a[0]);
}

static int cube(int a, int b, int c, int x[a][b][c])
{
    int* last = &x[a - 1][b - 1][c - 1];
    return (int)(last - &x[0][0][0]) + x[1][2][3];
}

static long churn(int n)
{
    long total = 0;
    for (int round = 0; round < 20000; ++round) {
        int buffer[n];
        buffer[n - 1] = round;
        if (round % 3 == 0)
            continue;
        total += buffer[n - 1] % 7;
    }
    return total;
}

int main(void)
{
    int n = 3, m = 5;
    int grid[n][m];
    fill(n, m, grid);
    int* flat = &grid[0][0];
    printf("%d %d %d %zu %zu\n", grid[2][4], flat[7], grid[1][0], sizeof grid, sizeof grid[0]);
    int(*row)[m] = grid + 1;
    printf("%d %d %td\n", (*row)[3], row[1][2], row - grid);
    int k = 4;
    double box[2][k][3];
    box[1][3][2] = 7.5;
    printf("%.1f %zu\n", ((double*)box)[1 * 12 + 3 * 3 + 2], sizeof box);
    int fixed[3][4];
    fill(3, 4, fixed);
    int t[m][n];
    transpose(n, m, (const int(*)[m])grid, t);
    printf("%d %d %d %d %d\n", sum(3, 4, fixed), sum(n, m, grid), t[4][1], t[0][2], sum(m, n, t));
    double d[2][7];
    printf("%zu\n", rowBytes(2, 7, d));
    int x[2][3][4];
    for (int i = 0; i < 2; ++i)
        for (int j = 0; j < 3; ++j)
            for (int l = 0; l < 4; ++l)
                x[i][j][l] = i * 100 + j * 10 + l;
    printf("%d\n", cube(2, 3, 4, x));
    printf("%ld\n", churn(1000) + churn(1001));
    return 0;
}

// Output:
// 14 7 5 60 20
// 8 12 1
// 7.5 192
// 66 105 9 10 105
// 63
// 146
// 79992
