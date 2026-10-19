#include <cassert>

int half(int even)
{
    assert(even % 2 == 0);
    return even / 2;
}

int main()
{
    return half(4) + half(3);
}

// Error: int half(int): Assertion `even % 2 == 0' failed.
// Line: 5
