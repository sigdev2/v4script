#include <assert.h>

int main(void)
{
    int x = 3;
    assert(x > 0);
    assert(x > 5);
    return 0;
}

// Error: main: Assertion `x > 5' failed.
// Line: 7
