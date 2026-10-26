// Arrays of class objects: element-wise copy, move and assignment of array
// members, default and value initialization at every dimension, aggregates
// with array members left out, structured bindings of arrays and references
// to const arrays.
#include <iostream>
#include <string>
#include <utility>

struct Tag {
    std::string s;
    Tag(const char* t = "?") : s(t) {}
    Tag(const Tag& o) : s(o.s + "c") { std::cout << "copy " << s << "\n"; }
    Tag(Tag&& o) noexcept : s(o.s + "m") { std::cout << "move " << s << "\n"; }
    Tag& operator=(const Tag& o)
    {
        s = o.s + "=";
        std::cout << "assign " << s << "\n";
        return *this;
    }
    Tag& operator=(Tag&& o) noexcept
    {
        s = o.s + "~";
        std::cout << "move-assign " << s << "\n";
        return *this;
    }
};

struct Holder {
    Tag tags[2];
    Tag grid[1][2];
};

struct Aggregate {
    int n;
    Tag t[2];
};

template <typename T, std::size_t N> constexpr std::size_t length(const T (&)[N])
{
    return N;
}

int total(const int (&a)[3])
{
    return a[0] + a[1] + a[2];
}

int main()
{
    Holder a;
    a.tags[0].s = "a";
    a.tags[1].s = "b";
    a.grid[0][1].s = "g";
    std::cout << "-- copy\n";
    Holder b = a;
    std::cout << "-- move\n";
    Holder c = std::move(b);
    std::cout << "-- assign\n";
    Holder d;
    d = a;
    std::cout << "-- move assign\n";
    d = std::move(c);
    std::cout << d.tags[0].s << " " << d.tags[1].s << " " << d.grid[0][1].s << "\n";
    std::cout << "-- initialization\n";
    Tag plain[2][2];
    Tag braced[2][2]{};
    Tag partial[3] = { "x" };
    Aggregate empty{};
    Aggregate counted{ 5 };
    Tag* heap = new Tag[2]();
    std::cout << "values " << plain[1][1].s << braced[1][1].s << partial[0].s << partial[2].s << empty.n
              << empty.t[1].s << counted.t[0].s << heap[1].s << "\n";
    delete[] heap;
    std::cout << "-- bindings\n";
    int numbers[3] = { 7, 8, 9 };
    auto [x, y, z] = numbers;
    x = 70;
    auto& [rx, ry, rz] = numbers;
    rx = 100;
    std::cout << x << " " << numbers[0] << " " << y + z << " " << ry << " " << total(numbers) << " "
              << length(numbers) << "\n";
    Tag pair[2] = { "p", "q" };
    auto [p0, p1] = pair;
    std::cout << p0.s << " " << p1.s << "\n";
    return 0;
}

// Output:
// -- copy
// copy ac
// copy bc
// copy ?c
// copy gc
// -- move
// move acm
// move bcm
// move ?cm
// move gcm
// -- assign
// assign a=
// assign b=
// assign ?=
// assign g=
// -- move assign
// move-assign acm~
// move-assign bcm~
// move-assign ?cm~
// move-assign gcm~
// acm~ bcm~ gcm~
// -- initialization
// values ??x?0???
// -- bindings
// 70 100 17 8 117 3
// copy pc
// copy qc
// pc qc
