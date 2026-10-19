// std::string, string_view, string streams, conversions and iomanip.
#include <algorithm>
#include <cctype>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <string>
#include <string_view>
#include <vector>

std::vector<std::string> split(const std::string& text, char separator)
{
    std::vector<std::string> parts;
    std::string part;
    std::istringstream input(text);
    while (std::getline(input, part, separator))
        parts.push_back(part);
    return parts;
}

std::string_view firstWord(std::string_view text)
{
    std::size_t space = text.find(' ');
    return space == std::string_view::npos ? text : text.substr(0, space);
}

int main()
{
    std::string greeting = "Hello";
    greeting += ", ";
    greeting.append("world");
    greeting.push_back('!');
    std::cout << greeting << " " << greeting.size() << " " << greeting[4] << greeting.back() << "\n";
    std::cout << greeting.find("world") << " " << greeting.find('z') << " " << greeting.rfind('o') << " "
              << (greeting.find('z') == std::string::npos) << "\n";
    std::cout << greeting.substr(7, 5) << "|" << greeting.substr(7) << "|" << greeting.compare("Hello") << "\n";

    std::string edited = greeting;
    edited.replace(0, 5, "Goodbye");
    edited.insert(edited.size() - 1, " again");
    edited.erase(edited.find(','), 1);
    std::cout << edited << "\n";

    std::string upper = greeting;
    std::transform(upper.begin(), upper.end(), upper.begin(), [](unsigned char c) { return std::toupper(c); });
    std::reverse(upper.begin(), upper.end());
    std::cout << upper << " " << (std::string("abc") < std::string("abd")) << " " << (greeting == "Hello, world!")
              << "\n";

    for (const std::string& part : split("red,green,,blue", ','))
        std::cout << "[" << part << "]";
    std::cout << "\n";

    std::string_view view = "string views share text";
    std::cout << firstWord(view) << " " << view.size() << " " << view.substr(7, 5) << " " << view.find("share")
              << "\n";

    std::cout << std::stoi("42") + 1 << " " << std::stol("-9000000000") << " " << std::stod("2.5e3") << " "
              << std::stoi("ff", nullptr, 16) << " " << std::to_string(3.75) << " " << std::to_string(-12) << "\n";

    std::ostringstream out;
    out << std::setw(6) << 42 << "|" << std::left << std::setw(6) << "ab" << "|" << std::right << std::setfill('0')
        << std::setw(5) << 7 << "|";
    out << std::setfill(' ') << std::fixed << std::setprecision(3) << 3.14159 << "|" << std::scientific << 1234.5
        << "|";
    out << std::defaultfloat << std::setprecision(6) << 0.1 + 0.2 << "|" << std::hex << 255 << "|" << std::oct << 8
        << "|" << std::dec << std::showpos << 5 << std::noshowpos << "|" << std::boolalpha << true;
    std::cout << out.str() << "\n";

    std::istringstream numbers("10 20 x 30");
    int value;
    int total = 0;
    while (numbers >> value)
        total += value;
    std::cout << total << " " << numbers.fail() << "\n";

    std::stringstream mixed;
    mixed << "pi " << 3.5 << " name Ann";
    std::string label, key, name;
    double number;
    mixed >> label >> number >> key >> name;
    std::cout << label << "=" << number << ", " << key << "=" << name << "\n";

    std::string text = "  trim me  ";
    std::size_t first = text.find_first_not_of(' ');
    std::size_t last = text.find_last_not_of(' ');
    std::cout << "<" << text.substr(first, last - first + 1) << ">\n";

    std::string word = "level";
    std::cout << word << (std::equal(word.begin(), word.end(), word.rbegin()) ? " is" : " is not") << " a palindrome\n";
    std::string unicode = "привет";
    std::cout << unicode << " " << unicode.size() << " bytes\n";
    std::cout << std::string(3, '*') << std::string("abc").c_str() << std::endl;
    return 0;
}

// Output:
// Hello, world! 13 o!
// 7 18446744073709551615 8 1
// world|world!|8
// Goodbye world again!
// !DLROW ,OLLEH 1 1
// [red][green][][blue]
// string 23 views 13
// 43 -9000000000 2500 255 3.750000 -12
//     42|ab    |00007|3.142|1.234e+03|0.3|ff|10|+5|true
// 30 1
// pi=3.5, name=Ann
// <trim me>
// level is a palindrome
// привет 12 bytes
// ***abc
