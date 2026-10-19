// <random>: two dice thrown a thousand times with std::mt19937 - the same
// numbers as with g++ - and a histogram of the sums.
#include <iostream>
#include <map>
#include <random>
#include <string>

int main()
{
    std::mt19937 engine(2024);
    std::uniform_int_distribution<int> die(1, 6);
    std::map<int, int> sums;
    for (int i = 0; i < 1000; ++i)
        ++sums[die(engine) + die(engine)];
    for (const auto& [sum, count] : sums)
        std::cout << (sum < 10 ? " " : "") << sum << " " << std::string(count / 5, '#') << " " << count << "\n";
    return 0;
}
