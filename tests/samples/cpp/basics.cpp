// Classes, references, overloading, operators, namespaces and the order
// of constructors and destructors.
#include <iostream>
#include <string>

namespace geometry {

struct Vec {
    double x = 0, y = 0;
    Vec() = default;
    Vec(double x, double y) : x(x), y(y) {}
    Vec operator+(const Vec& other) const { return { x + other.x, y + other.y }; }
    Vec& operator*=(double k)
    {
        x *= k;
        y *= k;
        return *this;
    }
    bool operator==(const Vec& other) const { return x == other.x && y == other.y; }
};

std::ostream& operator<<(std::ostream& out, const Vec& v)
{
    return out << '(' << v.x << ", " << v.y << ')';
}

} // namespace geometry

class Tracer {
public:
    explicit Tracer(std::string name) : name_(std::move(name)) { std::cout << "+" << name_ << "\n"; }
    Tracer(const Tracer& other) : name_(other.name_ + "'") { std::cout << "copy " << name_ << "\n"; }
    ~Tracer() { std::cout << "-" << name_ << "\n"; }
    const std::string& name() const { return name_; }
    static int created;

private:
    std::string name_;
};

int Tracer::created = 0;

class Counter {
public:
    Counter& operator++()
    {
        ++value_;
        return *this;
    }
    Counter operator++(int)
    {
        Counter old = *this;
        ++value_;
        return old;
    }
    int operator()(int step) const { return value_ * step; }
    explicit operator bool() const { return value_ != 0; }
    int value() const { return value_; }

private:
    int value_ = 0;
};

enum class Color { red, green = 5, blue };
enum Size { small = 1, large = 10 };

int area(int side) { return side * side; }
double area(double radius) { return 3 * radius * radius; }
int area(int width, int height) { return width * height; }

void swapValues(int& a, int& b)
{
    int t = a;
    a = b;
    b = t;
}

constexpr int factorial(int n) { return n <= 1 ? 1 : n * factorial(n - 1); }

int main()
{
    using geometry::Vec;
    Vec a(1, 2), b { 0.5, -1 };
    Vec c = a + b;
    c *= 2;
    std::cout << a << " + " << b << " = " << (a + b) << ", twice " << c << "\n";
    std::cout << std::boolalpha << (a == Vec(1, 2)) << " " << (a == b) << "\n";

    std::cout << area(3) << " " << area(1.5) << " " << area(2, 5) << "\n";
    int x = 1, y = 2;
    swapValues(x, y);
    int& alias = x;
    alias += 10;
    std::cout << x << " " << y << "\n";

    {
        Tracer first("first");
        Tracer second = first;
        std::cout << "in block: " << second.name() << "\n";
    }
    Tracer* heap = new Tracer("heap");
    delete heap;

    Counter counter;
    std::cout << bool(counter) << " ";
    counter++;
    ++counter;
    Counter before = counter++;
    std::cout << before.value() << " " << counter.value() << " " << counter(7) << " " << bool(counter) << "\n";

    Color color = Color::blue;
    std::cout << static_cast<int>(color) << " " << large + small << " " << sizeof(Color) << "\n";
    static_assert(factorial(5) == 120, "constexpr");
    constexpr int f6 = factorial(6);
    std::cout << f6 << "\n";

    auto total = 0L;
    int numbers[] = { 4, 8, 15, 16, 23, 42 };
    for (auto n : numbers)
        total += n;
    for (int& n : numbers)
        n /= 2;
    std::cout << total << " " << numbers[5] << " " << sizeof numbers / sizeof numbers[0] << "\n";

    const char* words[] = { "zero", "one", "two" };
    int index = 0;
    while (index < 3) {
        switch (index) {
        case 0:
            std::cout << words[index];
            break;
        default:
            std::cout << "," << words[index];
        }
        ++index;
    }
    std::cout << std::endl;
    return 0;
}

// Output:
// (1, 2) + (0.5, -1) = (1.5, 1), twice (3, 2)
// true false
// 9 6.75 10
// 12 1
// +first
// copy first'
// in block: first'
// -first'
// -first
// +heap
// -heap
// false 2 3 21 true
// 6 11 4
// 720
// 108 21 6
// zero,one,two
