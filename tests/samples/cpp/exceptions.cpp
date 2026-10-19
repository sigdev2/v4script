// Exceptions: standard and own classes, handlers by base class, rethrow,
// unwinding with destructors, function-level noexcept and nested try.
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

class ParseError : public std::runtime_error {
public:
    ParseError(const std::string& text, int position)
        : std::runtime_error("cannot parse '" + text + "'"), position_(position)
    {
    }
    int position() const { return position_; }

private:
    int position_;
};

struct Guard {
    std::string name;
    explicit Guard(std::string name) : name(std::move(name)) { std::cout << "enter " << this->name << "\n"; }
    ~Guard() { std::cout << "leave " << name << "\n"; }
};

int parseDigit(const std::string& text)
{
    Guard guard("parseDigit " + text);
    if (text.size() != 1 || text[0] < '0' || text[0] > '9')
        throw ParseError(text, 0);
    return text[0] - '0';
}

int sumDigits(const std::vector<std::string>& items)
{
    Guard guard("sumDigits");
    int total = 0;
    for (const auto& item : items)
        total += parseDigit(item);
    return total;
}

double divide(double a, double b)
{
    if (b == 0)
        throw std::invalid_argument("division by zero");
    return a / b;
}

void rethrowing()
{
    try {
        throw std::out_of_range("index 7");
    } catch (const std::exception& error) {
        std::cout << "first handler: " << error.what() << "\n";
        throw;
    }
}

int safeSize(const std::string& text) noexcept { return static_cast<int>(text.size()); }

int main()
{
    std::cout << sumDigits({ "1", "2", "3" }) << "\n";
    try {
        sumDigits({ "4", "x5", "6" });
    } catch (const ParseError& error) {
        std::cout << "ParseError: " << error.what() << " at " << error.position() << "\n";
    }

    try {
        std::cout << divide(1, 4) << "\n";
        std::cout << divide(1, 0) << "\n";
    } catch (const std::logic_error& error) {
        std::cout << "logic_error: " << error.what() << "\n";
    }

    try {
        rethrowing();
    } catch (const std::out_of_range& error) {
        std::cout << "again: " << error.what() << "\n";
    }

    for (int kind = 0; kind < 5; ++kind) {
        try {
            switch (kind) {
            case 0:
                throw 42;
            case 1:
                throw std::string("text");
            case 2:
                throw 'c';
            case 3:
                throw std::vector<int>(3).at(5);
            default:
                throw 2.5;
            }
        } catch (int value) {
            std::cout << "int " << value << "\n";
        } catch (const std::string& value) {
            std::cout << "string " << value << "\n";
        } catch (const std::exception& error) {
            std::cout << "exception " << error.what() << "\n";
        } catch (...) {
            std::cout << "something else\n";
        }
    }

    try {
        try {
            Guard inner("inner");
            throw std::runtime_error("deep");
        } catch (const std::invalid_argument&) {
            std::cout << "not here\n";
        }
    } catch (const std::runtime_error& error) {
        std::cout << "outer caught " << error.what() << "\n";
    }

    std::cout << safeSize("four") << " " << noexcept(safeSize("")) << " " << noexcept(divide(1, 2)) << "\n";
    try {
        std::string("abc").substr(10);
    } catch (const std::out_of_range& error) {
        std::cout << error.what() << "\n";
    }
    try {
        std::stoi("twelve");
    } catch (const std::invalid_argument& error) {
        std::cout << "stoi: " << error.what() << "\n";
    }
    return 0;
}

// Output:
// enter sumDigits
// enter parseDigit 1
// leave parseDigit 1
// enter parseDigit 2
// leave parseDigit 2
// enter parseDigit 3
// leave parseDigit 3
// leave sumDigits
// 6
// enter sumDigits
// enter parseDigit 4
// leave parseDigit 4
// enter parseDigit x5
// leave parseDigit x5
// leave sumDigits
// ParseError: cannot parse 'x5' at 0
// 0.25
// logic_error: division by zero
// first handler: index 7
// again: index 7
// int 42
// string text
// something else
// exception vector::_M_range_check: __n (which is 5) >= this->size() (which is 3)
// something else
// enter inner
// leave inner
// outer caught deep
// 4 0 0
// basic_string::substr: __pos (which is 10) > this->size() (which is 3)
// stoi: stoi
