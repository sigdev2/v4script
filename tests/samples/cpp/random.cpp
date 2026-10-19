// <random> with fixed seeds: the engines and distributions give the
// numbers of libstdc++ (Poisson with a mean below 12).
#include <algorithm>
#include <iostream>
#include <map>
#include <random>
#include <vector>

int main()
{
    std::mt19937 engine(2024);
    std::cout << engine() << " " << engine() << "\n";
    std::uniform_int_distribution<int> die(1, 6);
    for (int i = 0; i < 10; ++i)
        std::cout << die(engine) << " ";
    std::cout << "\n";

    std::uniform_real_distribution<double> unit(0.0, 1.0);
    std::cout << unit(engine) << " " << unit(engine) << "\n";

    std::normal_distribution<double> normal(10.0, 2.0);
    double sum = 0;
    for (int i = 0; i < 1000; ++i)
        sum += normal(engine);
    std::cout << sum / 1000 << "\n";

    std::geometric_distribution<int> tries(0.3);
    std::exponential_distribution<double> wait(2.0);
    for (int i = 0; i < 5; ++i)
        std::cout << tries(engine) << " ";
    std::cout << wait(engine) << "\n";

    std::bernoulli_distribution coin(0.25);
    int heads = 0;
    for (int i = 0; i < 400; ++i)
        heads += coin(engine);
    std::cout << heads << "\n";

    std::vector<int> deck(10);
    for (int i = 0; i < 10; ++i)
        deck[i] = i;
    std::shuffle(deck.begin(), deck.end(), engine);
    for (int card : deck)
        std::cout << card << " ";
    std::cout << "\n";

    std::minstd_rand small(7);
    std::mt19937_64 wide(99);
    std::cout << small() << " " << small() << " " << wide() << "\n";

    std::seed_seq seeds { 1, 2, 3 };
    std::mt19937 seeded(seeds);
    std::poisson_distribution<int> poisson(3.5);
    std::discrete_distribution<int> weighted { 1, 3, 6 };
    std::map<int, int> histogram;
    for (int i = 0; i < 100; ++i)
        ++histogram[weighted(seeded)];
    std::cout << seeded() << " " << poisson(seeded) << " " << poisson(seeded) << " | ";
    for (const auto& [value, count] : histogram)
        std::cout << value << ":" << count << " ";
    std::cout << "\n";

    std::random_device device;
    std::uniform_int_distribution<int> any(0, 9);
    int drawn = any(device);
    std::cout << (drawn >= 0 && drawn <= 9) << "\n";
    return 0;
}

// Output:
// 2525503112 3251949050
// 5 5 2 4 1 6 2 6 1 1
// 0.795721 0.669555
// 9.906
// 2 1 4 1 0 0.840712
// 97
// 9 4 3 5 1 6 7 8 0 2
// 337897 1278240558 8015931446409328671
// 457422015 7 3 | 0:8 1:37 2:55
// 1
