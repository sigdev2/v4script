#include <iostream>
#include <string>

struct Problem {
    std::string reason;
};

void check(int value)
{
    if (value < 0)
        throw Problem { "negative" };
}

int main()
{
    try {
        check(-1);
    } catch (const Problem& problem) {
        std::cout << "caught " << problem.reason << "\n";
    }
    check(-2);
    return 0;
}

// Output:
// caught negative
// Error: terminate called after throwing an instance of 'Problem'
// Line: 11
