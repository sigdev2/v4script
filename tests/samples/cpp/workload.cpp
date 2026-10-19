// A heavier program: a sieve, sorting random numbers, counting in maps and
// building strings - the speed of the translated code and of the library.
#include <algorithm>
#include <iostream>
#include <map>
#include <random>
#include <string>
#include <unordered_map>
#include <vector>

int main()
{
    const int limit = 200000;
    std::vector<bool> composite(limit + 1, false);
    int primes = 0;
    for (int n = 2; n <= limit; ++n) {
        if (composite[n])
            continue;
        ++primes;
        for (long m = static_cast<long>(n) * n; m <= limit; m += n)
            composite[m] = true;
    }
    std::cout << "primes " << primes << "\n";

    std::mt19937 engine(42);
    std::vector<unsigned> numbers(50000);
    for (auto& number : numbers)
        number = engine() % 1000000;
    std::sort(numbers.begin(), numbers.end());
    std::cout << "sorted " << numbers.front() << " " << numbers[25000] << " " << numbers.back() << " "
              << std::is_sorted(numbers.begin(), numbers.end()) << "\n";

    std::map<unsigned, int> buckets;
    std::unordered_map<unsigned, int> remainders;
    for (unsigned number : numbers) {
        ++buckets[number / 100000];
        ++remainders[number % 97];
    }
    std::cout << "buckets " << buckets.size() << " " << buckets[3] << " " << remainders.size() << " " << remainders[5]
              << "\n";

    std::string text;
    for (int i = 0; i < 2000; ++i)
        text += std::to_string(i % 10);
    std::size_t sevens = std::count(text.begin(), text.end(), '7');
    std::cout << "text " << text.size() << " " << sevens << " " << text.substr(1990) << "\n";
    return 0;
}

// Output:
// primes 17984
// sorted 11 499941 999955 1
// buckets 10 4950 97 509
// text 2000 200 0123456789
