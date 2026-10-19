// Function and class templates: deduction, specialization, variadic
// templates and folds, SFINAE, if constexpr, constexpr functions.
#include <iostream>
#include <string>
#include <type_traits>
#include <vector>

template <class T> T largest(const std::vector<T>& items)
{
    T best = items.front();
    for (const T& item : items)
        if (best < item)
            best = item;
    return best;
}

template <class T, int N> struct Buffer {
    T items[N] = {};
    int used = 0;
    void push(const T& item) { items[used++ % N] = item; }
    static constexpr int capacity() { return N; }
};

template <class T> struct Describe {
    static std::string name() { return "something"; }
};

template <> struct Describe<int> {
    static std::string name() { return "int"; }
};

template <class T> struct Describe<std::vector<T>> {
    static std::string name() { return "vector of " + Describe<T>::name(); }
};

template <class T> struct Describe<T*> {
    static std::string name() { return "pointer to " + Describe<T>::name(); }
};

template <class... Ts> auto sum(Ts... values) { return (values + ... + 0); }

template <class... Ts> void printAll(const Ts&... values)
{
    ((std::cout << values << ' '), ...);
    std::cout << "(" << sizeof...(Ts) << ")\n";
}

template <class T> void showFirst(const T& value) { std::cout << value; }

template <class T, class... Rest> void showFirst(const T& value, const Rest&... rest)
{
    std::cout << value << ", ";
    showFirst(rest...);
}

template <class T> typename std::enable_if<std::is_integral<T>::value, std::string>::type kind(T) { return "integral"; }

template <class T> typename std::enable_if<std::is_floating_point<T>::value, std::string>::type kind(T)
{
    return "floating";
}

template <class T> std::string twice(const T& value)
{
    if constexpr (std::is_arithmetic<T>::value)
        return std::to_string(value * 2);
    else
        return value + value;
}

constexpr long power(long base, int exponent)
{
    long result = 1;
    while (exponent-- > 0)
        result *= base;
    return result;
}

template <long N> struct Digits {
    static constexpr int value = 1 + Digits<N / 10>::value;
};

template <> struct Digits<0> {
    static constexpr int value = 0;
};

template <class T> class Stack {
public:
    void push(T value) { items_.push_back(std::move(value)); }
    T pop()
    {
        T top = items_.back();
        items_.pop_back();
        return top;
    }
    bool empty() const { return items_.empty(); }
    template <class F> void each(F visit) const
    {
        for (const T& item : items_)
            visit(item);
    }

private:
    std::vector<T> items_;
};

template <class A, class B> struct Pair {
    A first;
    B second;
};

template <class A, class B> Pair<A, B> makePair(A a, B b) { return { a, b }; }

int main()
{
    std::cout << largest(std::vector<int> { 3, 9, 2 }) << " " << largest(std::vector<std::string> { "pear", "apple" })
              << "\n";
    Buffer<double, 3> buffer;
    for (int i = 1; i <= 4; ++i)
        buffer.push(i * 1.5);
    std::cout << buffer.items[0] << " " << buffer.items[2] << " " << Buffer<char, 8>::capacity() << "\n";

    std::cout << Describe<double>::name() << "; " << Describe<int>::name() << "; "
              << Describe<std::vector<int*>>::name() << "\n";

    std::cout << sum() << " " << sum(1, 2, 3) << " " << sum(1.5, 2) << "\n";
    printAll(1, "two", 3.5, 'c');
    showFirst("a", 2, 3.25);
    std::cout << "\n";

    std::cout << kind(1) << " " << kind(2.5f) << " " << kind('x') << "\n";
    std::cout << twice(21) << " " << twice(std::string("ab")) << "\n";

    static_assert(power(10, 3) == 1000, "power");
    std::cout << Digits<power(2, 40)>::value << " " << power(3, 4) << "\n";

    Stack<std::string> stack;
    for (const char* word : { "one", "two", "three" })
        stack.push(word);
    int letters = 0;
    stack.each([&letters](const std::string& word) { letters += static_cast<int>(word.size()); });
    std::cout << letters << ":";
    while (!stack.empty())
        std::cout << " " << stack.pop();
    std::cout << "\n";

    auto pair = makePair(std::string("x"), 2.5);
    std::cout << pair.first << " " << pair.second << " " << std::is_same<decltype(pair.second), double>::value
              << "\n";
    return 0;
}

// Output:
// 9 pear
// 6 4.5 8
// something; int; vector of pointer to int
// 0 6 3.5
// 1 two 3.5 c (4)
// a, 2, 3.25
// integral floating integral
// 42 abab
// 13 81
// 11: three two one
// x 2.5 1
