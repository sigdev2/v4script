// <algorithm> and <numeric>: sorting, searching, transforming, heaps,
// permutations and the order of equal elements as libstdc++ leaves it.
#include <algorithm>
#include <functional>
#include <iostream>
#include <iterator>
#include <numeric>
#include <string>
#include <vector>

struct Person {
    std::string name;
    int age;
};

void show(const char* title, const std::vector<int>& items)
{
    std::cout << title << ":";
    for (int item : items)
        std::cout << " " << item;
    std::cout << "\n";
}

int main()
{
    std::vector<int> v { 7, 2, 9, 4, 4, 1, 8, 3 };
    std::sort(v.begin(), v.end());
    show("sorted", v);
    std::cout << std::binary_search(v.begin(), v.end(), 8) << " " << (std::lower_bound(v.begin(), v.end(), 4) - v.begin())
              << " " << (std::upper_bound(v.begin(), v.end(), 4) - v.begin()) << "\n";
    std::sort(v.begin(), v.end(), std::greater<int>());
    show("descending", v);

    std::vector<int> numbers(10);
    std::iota(numbers.begin(), numbers.end(), 1);
    std::cout << std::accumulate(numbers.begin(), numbers.end(), 0) << " "
              << std::accumulate(numbers.begin(), numbers.end(), 1L, std::multiplies<long>()) << " "
              << std::inner_product(numbers.begin(), numbers.begin() + 3, numbers.begin() + 3, 0) << "\n";
    std::vector<int> sums(numbers.size());
    std::partial_sum(numbers.begin(), numbers.end(), sums.begin());
    show("partial_sum", sums);
    std::vector<int> squares;
    std::transform(numbers.begin(), numbers.end(), std::back_inserter(squares), [](int n) { return n * n; });
    show("squares", squares);

    numbers.erase(std::remove_if(numbers.begin(), numbers.end(), [](int n) { return n % 3 == 0; }), numbers.end());
    show("not by 3", numbers);
    std::reverse(numbers.begin(), numbers.end());
    std::rotate(numbers.begin(), numbers.begin() + 2, numbers.end());
    show("rotated", numbers);
    auto [low, high] = std::minmax_element(numbers.begin(), numbers.end());
    std::cout << *low << " " << *high << " " << *std::max_element(v.begin(), v.end()) << " "
              << std::count(v.begin(), v.end(), 4) << " " << (std::find(v.begin(), v.end(), 9) - v.begin()) << "\n";

    std::vector<int> repeated { 1, 1, 2, 2, 2, 3, 1, 1 };
    repeated.erase(std::unique(repeated.begin(), repeated.end()), repeated.end());
    show("unique", repeated);

    std::vector<Person> people { { "Ann", 30 }, { "Bob", 25 }, { "Cid", 30 }, { "Dan", 25 }, { "Eve", 35 } };
    std::stable_sort(people.begin(), people.end(), [](const Person& a, const Person& b) { return a.age < b.age; });
    for (const Person& person : people)
        std::cout << person.name << person.age << " ";
    std::cout << "\n";

    std::vector<int> ties { 3, 1, 2, 1, 3, 2, 1, 3, 2, 1, 2, 3, 1, 2, 3, 1, 2, 3, 3, 1 };
    std::vector<int> order(ties.size());
    std::iota(order.begin(), order.end(), 0);
    std::sort(order.begin(), order.end(), [&ties](int a, int b) { return ties[a] < ties[b]; });
    show("unstable", order);

    std::vector<int> heap { 3, 1, 4, 1, 5, 9, 2, 6 };
    std::make_heap(heap.begin(), heap.end());
    std::pop_heap(heap.begin(), heap.end());
    heap.pop_back();
    heap.push_back(7);
    std::push_heap(heap.begin(), heap.end());
    show("heap", heap);
    std::sort_heap(heap.begin(), heap.end());
    show("sort_heap", heap);

    std::vector<int> nth { 9, 8, 7, 6, 5, 4, 3, 2, 1, 0 };
    std::nth_element(nth.begin(), nth.begin() + 4, nth.end());
    std::cout << "nth " << nth[4] << "\n";
    std::vector<int> partial { 5, 2, 8, 1, 9, 3 };
    std::partial_sort(partial.begin(), partial.begin() + 3, partial.end());
    std::cout << partial[0] << partial[1] << partial[2] << "\n";

    std::string letters = "abc";
    do
        std::cout << letters << " ";
    while (std::next_permutation(letters.begin(), letters.end()));
    std::cout << "\n";

    std::vector<int> a { 1, 3, 5, 7 }, b { 2, 3, 6, 7 };
    std::vector<int> merged, common;
    std::merge(a.begin(), a.end(), b.begin(), b.end(), std::back_inserter(merged));
    std::set_intersection(a.begin(), a.end(), b.begin(), b.end(), std::back_inserter(common));
    show("merged", merged);
    show("common", common);
    std::cout << std::all_of(a.begin(), a.end(), [](int n) { return n % 2 == 1; }) << " "
              << std::any_of(b.begin(), b.end(), [](int n) { return n > 6; }) << " "
              << std::none_of(a.begin(), a.end(), [](int n) { return n == 4; }) << " " << std::gcd(84, 36) << " "
              << std::lcm(4, 6) << "\n";

    std::vector<int> copied(4);
    std::copy_if(squares.begin(), squares.end(), copied.begin(), [](int n) { return n % 2 == 0; });
    std::fill_n(std::back_inserter(copied), 2, -1);
    std::copy(copied.begin(), copied.end(), std::ostream_iterator<int>(std::cout, ","));
    std::cout << "\n";
    return 0;
}

// Output:
// sorted: 1 2 3 4 4 7 8 9
// 1 3 5
// descending: 9 8 7 4 4 3 2 1
// 55 3628800 32
// partial_sum: 1 3 6 10 15 21 28 36 45 55
// squares: 1 4 9 16 25 36 49 64 81 100
// not by 3: 1 2 4 5 7 8 10
// rotated: 7 5 4 2 1 10 8
// 1 10 9 2 0
// unique: 1 2 3 1
// Bob25 Dan25 Ann30 Cid30 Eve35
// unstable: 1 19 15 12 9 6 3 5 8 10 13 2 16 7 4 11 14 17 18 0
// heap: 7 6 4 5 1 3 2 1
// sort_heap: 1 1 2 3 4 5 6 7
// nth 4
// 123
// abc acb bac bca cab cba
// merged: 1 2 3 3 5 6 7 7
// common: 3 7
// 1 1 1 12 12
// 4,16,36,64,-1,-1,
