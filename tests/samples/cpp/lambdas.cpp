// Lambdas: captures by value and by reference, mutable state, generic
// lambdas, std::function, recursion and closures kept in containers.
#include <algorithm>
#include <functional>
#include <iostream>
#include <map>
#include <string>
#include <vector>

std::function<int(int)> makeAdder(int amount)
{
    return [amount](int value) { return value + amount; };
}

std::function<int()> makeCounter()
{
    int count = 0;
    return [count]() mutable { return ++count; };
}

int apply(const std::function<int(int, int)>& operation, int a, int b) { return operation(a, b); }

template <class F> auto twice(F f) { return [f](auto x) { return f(f(x)); }; }

int square(int x) { return x * x; }

struct Accumulator {
    int total = 0;
    void operator()(int value) { total += value; }
};

int main()
{
    int base = 10;
    auto byValue = [base](int x) { return base + x; };
    auto byReference = [&base](int x) { return base + x; };
    base = 20;
    std::cout << byValue(1) << " " << byReference(1) << "\n";

    auto add5 = makeAdder(5);
    auto counter = makeCounter();
    counter();
    counter();
    std::cout << add5(10) << " " << counter() << "\n";

    std::cout << apply([](int a, int b) { return a * b; }, 6, 7) << " " << apply(std::plus<int>(), 2, 3) << " "
              << apply([](int a, int b) { return a < b ? a : b; }, 4, -4) << "\n";

    auto generic = [](const auto& a, const auto& b) { return a + b; };
    std::cout << generic(1, 2) << " " << generic(std::string("con"), std::string("cat")) << " " << generic(0.5, 1)
              << "\n";
    std::cout << twice(square)(3) << " " << twice([](int x) { return x + 1; })(0) << "\n";

    std::function<long(int)> factorial = [&factorial](int n) -> long { return n <= 1 ? 1 : n * factorial(n - 1); };
    std::cout << factorial(15) << "\n";

    std::vector<int> numbers { 5, 3, 8, 1, 9, 2 };
    int threshold = 4;
    long big = std::count_if(numbers.begin(), numbers.end(), [threshold](int n) { return n > threshold; });
    std::sort(numbers.begin(), numbers.end(), [](int a, int b) { return a > b; });
    for (int n : numbers)
        std::cout << n << " ";
    std::cout << "| " << big << "\n";

    Accumulator accumulator = std::for_each(numbers.begin(), numbers.end(), Accumulator());
    int sum = 0;
    std::for_each(numbers.begin(), numbers.end(), [&](int n) { sum += n; });
    std::cout << accumulator.total << " " << sum << "\n";

    std::map<std::string, std::function<double(double, double)>> operations;
    operations["add"] = [](double a, double b) { return a + b; };
    operations["divide"] = [](double a, double b) { return a / b; };
    operations["power"] = [](double a, double b) {
        double result = 1;
        for (int i = 0; i < b; ++i)
            result *= a;
        return result;
    };
    for (const auto& [name, operation] : operations)
        std::cout << name << "=" << operation(2, 8) << " ";
    std::cout << "\n";

    std::vector<std::function<void()>> actions;
    for (int i = 0; i < 3; ++i)
        actions.push_back([i, &sum] { sum += i * 100; });
    for (auto& action : actions)
        action();
    std::cout << sum << "\n";

    std::function<void()> empty;
    std::cout << static_cast<bool>(empty) << " " << static_cast<bool>(actions[0]) << "\n";
    try {
        empty();
    } catch (const std::bad_function_call& error) {
        std::cout << "caught " << error.what() << "\n";
    }

    auto self = [](auto&& recurse, int n) -> int { return n == 0 ? 0 : n + recurse(recurse, n - 1); };
    std::cout << self(self, 100) << "\n";
    return 0;
}

// Output:
// 11 21
// 15 3
// 42 5 -4
// 3 concat 1.5
// 81 2
// 1307674368000
// 9 8 5 3 2 1 | 3
// 28 28
// add=10 divide=0.25 power=256
// 328
// 0 1
// caught bad_function_call
// 5050
