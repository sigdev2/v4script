// Hello: std::cin, std::string and the algorithms on its characters.
#include <algorithm>
#include <cctype>
#include <iostream>
#include <string>

int main()
{
    std::string name;
    std::cout << "What is your name? ";
    if (!std::getline(std::cin, name) || name.empty())
        name = "stranger";
    std::cout << "Hello, " << name << "!\n";
    std::string backwards(name.rbegin(), name.rend());
    std::transform(backwards.begin(), backwards.end(), backwards.begin(),
                   [](unsigned char c) { return static_cast<char>(std::toupper(c)); });
    auto vowels = std::count_if(name.begin(), name.end(), [](char c) {
        return std::string("aeiouAEIOU").find(c) != std::string::npos;
    });
    std::cout << "Backwards in capitals: " << backwards << " (" << name.size() << " characters, " << vowels
              << " vowels)\n";
    return 0;
}
