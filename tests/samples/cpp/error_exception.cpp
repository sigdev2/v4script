#include <iostream>
#include <stdexcept>
#include <vector>

int pick(const std::vector<int>& items, std::size_t index)
{
    return items.at(index);
}

int main()
{
    std::vector<int> items { 1, 2, 3 };
    std::cout << pick(items, 2) << "\n";
    std::cout << pick(items, 5) << "\n";
    return 0;
}

// Output:
// 3
// Error: terminate called after throwing an instance of 'std::out_of_range'
// Line: 7
