// Associative containers: map, multimap, set, multiset and the unordered
// ones (their order of iteration is the one of libstdc++), structured
// bindings, custom comparators and hashes.
#include <iostream>
#include <map>
#include <set>
#include <sstream>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <utility>

struct ByLength {
    bool operator()(const std::string& a, const std::string& b) const
    {
        return a.size() != b.size() ? a.size() < b.size() : a < b;
    }
};

struct Cell {
    int row, column;
    bool operator==(const Cell& other) const { return row == other.row && column == other.column; }
};

struct CellHash {
    std::size_t operator()(const Cell& cell) const { return std::hash<int>()(cell.row * 100 + cell.column); }
};

int main()
{
    std::map<std::string, int> counts;
    std::istringstream words("the cat and the dog and the bird");
    std::string word;
    while (words >> word)
        ++counts[word];
    for (const auto& [key, value] : counts)
        std::cout << key << "=" << value << " ";
    std::cout << "\n";

    auto found = counts.find("cat");
    std::cout << (found != counts.end()) << " " << found->second << " " << counts.count("cow") << " "
              << counts.at("the") << "\n";
    auto [where, inserted] = counts.insert({ "cat", 10 });
    std::cout << inserted << " " << where->second << " " << counts.size() << "\n";
    counts.erase("and");
    counts.emplace("ant", 1);
    std::cout << counts.begin()->first << " " << counts.rbegin()->first << " " << counts.lower_bound("c")->first
              << " " << counts.upper_bound("dog")->first << "\n";
    try {
        counts.at("cow");
    } catch (const std::out_of_range& error) {
        std::cout << "at: " << error.what() << "\n";
    }

    std::multimap<int, std::string> byAge { { 30, "Ann" }, { 25, "Bob" }, { 30, "Cid" }, { 41, "Dan" } };
    auto range = byAge.equal_range(30);
    for (auto it = range.first; it != range.second; ++it)
        std::cout << it->second << " ";
    std::cout << byAge.count(30) << "\n";

    std::set<int> primes { 7, 2, 5, 3, 11, 5 };
    primes.insert(13);
    primes.erase(2);
    for (int p : primes)
        std::cout << p << " ";
    std::cout << "| " << *primes.begin() << " " << *primes.rbegin() << " " << primes.count(4) << "\n";

    std::multiset<char> letters { 'b', 'a', 'b', 'c', 'a', 'b' };
    std::cout << letters.count('b') << " " << letters.size() << " " << *letters.find('c') << "\n";

    std::set<std::string, ByLength> shortFirst { "banana", "fig", "apple", "kiwi", "date" };
    for (const auto& item : shortFirst)
        std::cout << item << " ";
    std::cout << "\n";

    std::map<int, int, std::greater<int>> descending { { 1, 10 }, { 3, 30 }, { 2, 20 } };
    for (const auto& entry : descending)
        std::cout << entry.first << ":" << entry.second << " ";
    std::cout << "\n";

    std::unordered_map<std::string, int> ages;
    ages["zoe"] = 31;
    ages["adam"] = 45;
    ages["mia"] = 27;
    ages.emplace("leo", 19);
    for (const auto& [name, age] : ages)
        std::cout << name << ":" << age << " ";
    std::cout << "| " << ages.size() << " " << ages.count("mia") << " " << ages.bucket_count() << "\n";

    std::unordered_set<int> seen;
    for (int n : { 4, 8, 15, 16, 23, 42, 8, 4 })
        seen.insert(n);
    for (int n : seen)
        std::cout << n << " ";
    std::cout << "| " << seen.size() << "\n";

    std::unordered_map<Cell, std::string, CellHash> board;
    board[{ 1, 2 }] = "knight";
    board[{ 0, 0 }] = "rook";
    std::cout << board[{ 1, 2 }] << " " << board.count({ 0, 0 }) << " " << board.count({ 5, 5 }) << "\n";

    std::map<std::pair<int, int>, char> pairs;
    pairs[{ 2, 1 }] = 'c';
    pairs[{ 1, 9 }] = 'b';
    pairs[{ 1, 2 }] = 'a';
    for (const auto& [key, value] : pairs)
        std::cout << "(" << key.first << "," << key.second << ")" << value;
    std::cout << "\n";
    return 0;
}

// Output:
// and=2 bird=1 cat=1 dog=1 the=3
// 1 1 0 3
// 0 1 5
// ant the cat the
// at: map::at
// Ann Cid 2
// 3 5 7 11 13 | 3 13 0
// 3 6 c
// fig date kiwi apple banana
// 3:30 2:20 1:10
// mia:27 leo:19 adam:45 zoe:31 | 4 1 13
// 23 42 16 15 8 4 | 6
// knight 1 0
// (1,2)a(1,9)b(2,1)c
