#include <utility>

int main()
{
    std::pair both(1, 2);
    std::pair one(1);
    return both.first;
}

// Error: class template argument deduction failed: no matching function for call to 'pair(int)'
// Line: 6
