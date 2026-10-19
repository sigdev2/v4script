// pair, tuple, optional, bitset, chrono durations, ratio and limits.
#include <bitset>
#include <chrono>
#include <iostream>
#include <limits>
#include <optional>
#include <ratio>
#include <string>
#include <tuple>
#include <utility>

std::tuple<int, int, int> divide(int a, int b) { return { a / b, a % b, b }; }

std::optional<int> findIndex(const std::string& text, char wanted)
{
    for (std::size_t i = 0; i < text.size(); ++i)
        if (text[i] == wanted)
            return static_cast<int>(i);
    return std::nullopt;
}

int main()
{
    std::pair<std::string, int> entry("apples", 3);
    auto other = std::make_pair(std::string("pears"), 5);
    std::cout << entry.first << " " << entry.second << " " << (entry < other) << "\n";
    std::swap(entry, other);
    std::cout << entry.first << " " << other.first << "\n";

    auto [quotient, remainder, divisor] = divide(17, 5);
    std::cout << quotient << " " << remainder << " " << divisor << "\n";
    std::tuple<std::string, double, char> record { "pi", 3.14, 'p' };
    std::get<1>(record) *= 2;
    std::cout << std::get<0>(record) << " " << std::get<1>(record) << " " << std::get<char>(record) << " "
              << std::tuple_size<decltype(record)>::value << "\n";
    int a = 0, b = 0;
    std::tie(a, std::ignore, b) = divide(23, 4);
    std::cout << a << " " << b << " " << (std::make_tuple(1, 2) < std::make_tuple(1, 3)) << "\n";
    auto joined = std::tuple_cat(std::make_tuple(1), std::make_tuple('x', 2.5));
    std::cout << std::get<1>(joined) << std::get<2>(joined) << " "
              << std::apply([](int x, char c, double d) { return x + c + d; }, joined) << "\n";

    std::optional<int> found = findIndex("hello", 'l');
    std::optional<int> missing = findIndex("hello", 'z');
    std::cout << found.has_value() << " " << *found << " " << missing.has_value() << " " << missing.value_or(-1) << "\n";
    std::optional<std::string> name;
    name = "Ann";
    name->append("a");
    std::cout << *name << " " << name->size() << " " << (name == std::string("Anna")) << "\n";
    name.reset();
    try {
        std::cout << name.value() << "\n";
    } catch (const std::bad_optional_access& error) {
        std::cout << error.what() << "\n";
    }

    std::bitset<8> bits("10110010");
    std::bitset<8> mask(0x0F);
    std::cout << bits << " " << bits.count() << " " << bits[1] << " " << (bits & mask) << " " << (bits | mask)
              << " " << (~bits) << " " << (bits << 2) << "\n";
    bits.set(0).reset(7).flip(3);
    std::cout << bits << " " << bits.to_ulong() << " " << bits.any() << " " << bits.none() << " " << bits.test(4)
              << "\n";

    using namespace std::chrono;
    milliseconds wait(1500);
    seconds whole = duration_cast<seconds>(wait);
    auto total = minutes(2) + seconds(30);
    std::cout << wait.count() << " " << whole.count() << " " << total.count() << " " << duration<double>(wait).count()
              << " " << duration_cast<hours>(minutes(150)).count() << "\n";
    auto start = steady_clock::now();
    auto elapsed = steady_clock::now() - start;
    std::cout << (elapsed >= nanoseconds(0)) << "\n";

    using third = std::ratio<1, 3>;
    using sum = std::ratio_add<third, std::ratio<1, 6>>;
    std::cout << sum::num << "/" << sum::den << " " << std::milli::den << "\n";

    std::cout << std::numeric_limits<int>::max() << " " << std::numeric_limits<short>::min() << " "
              << std::numeric_limits<unsigned char>::max() + 0 << " " << std::numeric_limits<double>::digits10 << " "
              << std::numeric_limits<long long>::max() << "\n";
    return 0;
}

// Output:
// apples 3 1
// pears apples
// 3 2 5
// pi 6.28 p 3
// 5 4 1
// x2.5 123.5
// 1 2 0 -1
// Anna 4 1
// bad optional access
// 10110010 4 1 00000010 10111111 01001101 11001000
// 00111011 59 1 0 1
// 1500 1 150 1.5 2
// 1
// 1/2 1000
// 2147483647 -32768 255 15 9223372036854775807
