// Class template argument deduction: the template arguments come from
// the initializer through the deduction guides of the library and of the
// program, the constructors of a template and copies. typeid names the
// deduced types as g++ does.
#include <array>
#include <functional>
#include <iostream>
#include <list>
#include <map>
#include <optional>
#include <set>
#include <string>
#include <tuple>
#include <typeinfo>
#include <utility>
#include <vector>

template <class T> class Accumulator {
public:
    explicit Accumulator(T start) : total_(start) {}
    void add(const T& value) { total_ += value; }
    T total() const { return total_; }

private:
    T total_;
};

template <class K, class V> struct Entry {
    K key;
    V value;
};

template <class K, class V> Entry(K, V) -> Entry<K, V>;
Entry(const char*, const char*) -> Entry<std::string, std::string>;

template <class T> void show(const char* what, const T& value)
{
    std::cout << what << ": " << typeid(value).name() << "\n";
}

int twice(int x) { return 2 * x; }

int main()
{
    std::pair point(3, 4.5);
    std::tuple record("id", 7, 'x');
    std::vector numbers { 5, 3, 8 };
    std::vector halves(3, 0.5);
    std::array digits { 1, 2, 3, 4 };
    std::optional maybe(42L);
    show("pair", point);
    show("tuple", record);
    show("vector", numbers);
    show("vector(n, value)", halves);
    show("array", digits);
    show("optional", maybe);

    std::list words { std::string("b"), std::string("a") };
    std::set sorted(words.begin(), words.end());
    std::map ages { std::pair { 30, std::string("Ann") }, std::pair { 25, std::string("Bob") } };
    std::vector copy = numbers;
    std::vector single { numbers };
    std::function doubled = twice;
    show("set", sorted);
    show("map", ages);
    show("copy", copy);
    show("from one vector", single);
    std::cout << sorted.size() << " " << ages.begin()->second << " " << single.size() << " " << doubled(21) << "\n";

    Accumulator sum(0.5);
    sum.add(2);
    Entry entry { "name", 3 };
    Entry text { "key", "value" };
    show("Accumulator", sum);
    show("Entry", entry);
    show("Entry of strings", text);
    std::cout << sum.total() << " " << entry.key << "=" << entry.value << " " << text.value.size() << "\n";

    auto [x, y] = std::pair(1, 'c');
    auto items = std::vector { std::tuple(1, 2.0), std::tuple(3, 4.0) };
    show("temporary", items);
    std::cout << x << y << " " << std::get<1>(items[1]) << "\n";
    return 0;
}

// Output:
// pair: St4pairIidE
// tuple: St5tupleIJPKcicEE
// vector: St6vectorIiSaIiEE
// vector(n, value): St6vectorIdSaIdEE
// array: St5arrayIiLm4EE
// optional: St8optionalIlE
// set: St3setINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEESt4lessIS5_ESaIS5_EE
// map: St3mapIiNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEESt4lessIiESaISt4pairIKiS5_EEE
// copy: St6vectorIiSaIiEE
// from one vector: St6vectorIiSaIiEE
// 2 Bob 3 42
// Accumulator: 11AccumulatorIdE
// Entry: 5EntryIPKciE
// Entry of strings: 5EntryINSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEES5_E
// 2.5 name=3 5
// temporary: St6vectorISt5tupleIJidEESaIS1_EE
// 1c 4
