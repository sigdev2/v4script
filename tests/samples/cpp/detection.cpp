// Templates: explicit arguments that are not deduced, the detection idiom
// (a partial specialization with void_t that does not match is not an
// error), folds over assignment, and the implicit default constructor of a
// class whose members have default member initializers.
#include <iostream>
#include <string>
#include <type_traits>
#include <utility>
#include <vector>

template <typename T> T maxOf(T a, T b)
{
    return a > b ? a : b;
}

template <typename T, typename = void> struct HasSize : std::false_type {};
template <typename T> struct HasSize<T, std::void_t<decltype(std::declval<T>().size())>> : std::true_type {};

template <typename T> std::string describe(const T& value)
{
    if constexpr (std::is_arithmetic_v<T>)
        return "number " + std::to_string(value);
    else if constexpr (HasSize<T>::value)
        return "sized " + std::to_string(value.size());
    else
        return "other";
}

template <typename... Args> void printReversed(Args... args)
{
    int dummy = 0;
    ((std::cout << args << " ", dummy) = ... = dummy);
    std::cout << "\n";
}

struct Named {
    std::string name;
    Named(std::string n) : name(std::move(n)) {}
};

struct Base {
    Named first{ "first" };
    virtual ~Base() = default;
};

struct Derived : Base {
    Named second{ "second" };
    int count = 2;
};

int main()
{
    std::cout << maxOf<double>(2.5, 1) << " " << maxOf<long>(3, 'a') << " "
              << maxOf(std::string("ab"), std::string("b")) << "\n";
    std::cout << HasSize<int>::value << HasSize<std::string>::value << HasSize<std::nullptr_t>::value
              << HasSize<std::vector<int>>::value << "\n";
    std::cout << describe(42) << " | " << describe(std::string("abc")) << " | " << describe(nullptr) << "\n";
    printReversed(1, "two", 3.5);
    Derived d;
    Base* b = new Derived;
    std::cout << d.first.name << " " << d.second.name << " " << d.count << " " << b->first.name << "\n";
    delete b;
    return 0;
}

// Output:
// 2.5 97 b
// 0101
// number 42 | sized 3 | other
// 3.5 two 1
// first second 2 first
