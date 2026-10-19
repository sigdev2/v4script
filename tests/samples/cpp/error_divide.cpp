#include <vector>

int main()
{
    std::vector<int> numbers { 4, 2, 0 };
    int sum = 0;
    for (int n : numbers)
        sum += 100 / n;
    return sum;
}

// Error: Floating point exception (integer division by zero)
// Line: 8
