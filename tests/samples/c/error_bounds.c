#include <stdlib.h>

int main(void)
{
    int *data = malloc(16);
    long offset = 1L << 40;
    data[offset] = 1;
    return 0;
}

// Error: Segmentation fault
// Line: 7
