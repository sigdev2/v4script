// Conway's Game of Life on a small torus: a glider and a blinker.
#include <stdio.h>
#include <string.h>

#define W 20
#define H 10

static char world[H][W], next[H][W];

static int neighbours(int y, int x)
{
    int count = 0;
    for (int dy = -1; dy <= 1; dy++)
        for (int dx = -1; dx <= 1; dx++)
            if (dy != 0 || dx != 0)
                count += world[(y + dy + H) % H][(x + dx + W) % W];
    return count;
}

static void show(int generation)
{
    printf("Generation %d\n", generation);
    for (int y = 0; y < H; y++) {
        for (int x = 0; x < W; x++)
            putchar(world[y][x] ? '#' : '.');
        putchar('\n');
    }
}

int main(void)
{
    const int glider[][2] = { {0, 1}, {1, 2}, {2, 0}, {2, 1}, {2, 2} };
    for (int i = 0; i < 5; i++)
        world[1 + glider[i][0]][1 + glider[i][1]] = 1;
    world[5][14] = world[5][15] = world[5][16] = 1;

    for (int generation = 0; generation <= 4; generation++) {
        show(generation);
        for (int y = 0; y < H; y++)
            for (int x = 0; x < W; x++) {
                int n = neighbours(y, x);
                next[y][x] = n == 3 || (n == 2 && world[y][x]);
            }
        memcpy(world, next, sizeof world);
    }
    return 0;
}
