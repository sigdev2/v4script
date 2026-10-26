// exit ends the program at once: the objects with static storage are
// destroyed, the automatic objects of the functions on the way are not.
#include <cstdlib>
#include <iostream>
#include <string>

struct Noisy {
    std::string tag;
    Noisy(const char* t) : tag(t) { std::cout << "+" << tag << "\n"; }
    ~Noisy() { std::cout << "-" << tag << "\n"; }
};

Noisy global("global");

Noisy& lazy()
{
    static Noisy once("static");
    return once;
}

void finish()
{
    Noisy automatic("automatic");
    lazy();
    std::cout << "exit\n";
    std::exit(0);
}

int main()
{
    Noisy local("local");
    finish();
    std::cout << "not reached\n";
    return 0;
}

// Output:
// +global
// +local
// +automatic
// +static
// exit
// -static
// -global
