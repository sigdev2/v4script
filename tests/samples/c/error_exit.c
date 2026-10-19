#include <stdio.h>
#include <stdlib.h>

static void check(int value)
{
    if (value < 0) {
        fprintf(stderr, "negative: %d\n", value);
        exit(3);
    }
}

int main(void)
{
    check(1);
    check(-2);
    printf("unreachable\n");
    return 0;
}

// Output:
// !negative: -2
// Error: exit status 3
// Line: 8
