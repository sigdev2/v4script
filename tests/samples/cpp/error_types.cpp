#include <string>

struct Account {
    std::string owner;
    double balance;
};

int main()
{
    Account account { "Ann", 10 };
    double* balance = account;
    return 0;
}

// Error: cannot convert 'Account' to 'double*' in initialization
// Line: 11
