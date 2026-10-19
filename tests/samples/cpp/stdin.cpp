// Standard input of the host: cin waits for the next lines; getline and
// istream_iterator read what is left.
#include <iostream>
#include <iterator>
#include <numeric>
#include <string>
#include <vector>

int main()
{
    std::string name;
    std::cout << "Name? ";
    std::cin >> name;
    std::cout << "Hi " << name << "\n";
    int a, b;
    std::cin >> a >> b;
    std::cout << a + b << "\n";
    std::string rest;
    std::getline(std::cin, rest);
    std::cout << "[" << rest << "]\n";
    std::string line;
    std::getline(std::cin, line);
    std::cout << line.size() << ": " << line << "\n";
    std::vector<int> numbers((std::istream_iterator<int>(std::cin)), std::istream_iterator<int>());
    std::cout << numbers.size() << " " << std::accumulate(numbers.begin(), numbers.end(), 0) << " " << std::cin.eof()
              << "\n";
    return 0;
}

// Input:
// Bob
// 3
// 4 rest
// a whole line
// 1 2 3
// 4 5
// Output:
// Name? Hi Bob
// 7
// [ rest]
// 12: a whole line
// 5 15 1
