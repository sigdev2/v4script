#include <cstdlib>
#include <iostream>

int main()
{
    std::cout << "failing\n";
    std::cerr << "a message\n";
    std::exit(3);
}

// Output:
// failing
// !a message
// Error: exit status 3
// Line: 8
