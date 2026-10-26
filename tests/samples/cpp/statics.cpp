// Objects with static storage: globals in the order of their definitions,
// static locals at their first pass, destroyed when main returns in the
// reverse order of construction, in turn with the atexit functions.
#include <cstdlib>
#include <iostream>
#include <string>

struct Noisy {
    std::string tag;
    Noisy(const char* t) : tag(t) { std::cout << "+" << tag << "\n"; }
    ~Noisy() { std::cout << "-" << tag << "\n"; }
};

struct Plain {
    int n;
    ~Plain() { std::cout << "~Plain " << n << "\n"; }
};

struct Holder {
    static Noisy member;
};

Noisy first("first");
Noisy array[2] = { "a0", "a1" };
Plain plain;
Noisy Holder::member("member");

Noisy& lazy(const char* tag)
{
    static Noisy once(tag);
    return once;
}

void handler1()
{
    std::cout << "atexit 1\n";
}

void handler2()
{
    std::cout << "atexit 2\n";
}

int main()
{
    std::atexit(handler1);
    lazy("lazy");
    lazy("again");
    std::atexit(handler2);
    plain.n = 7;
    Noisy local("local");
    std::cout << "main ends\n";
    return 0;
}

// Output:
// +first
// +a0
// +a1
// +member
// +lazy
// +local
// main ends
// -local
// atexit 2
// -lazy
// atexit 1
// -member
// ~Plain 7
// -a1
// -a0
// -first
