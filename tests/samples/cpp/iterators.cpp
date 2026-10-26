// Iterators and const iterators of one container together: insert and
// erase at a const_iterator, differences and comparisons, reverse
// iterators; vector<bool>::flip; <cmath> functions of integers.
#include <cmath>
#include <deque>
#include <iostream>
#include <iterator>
#include <list>
#include <map>
#include <string>
#include <vector>

template <class C> void show(const C& c)
{
    for (const auto& x : c)
        std::cout << x << ",";
    std::cout << " ";
}

template <class C> void sequence(C c)
{
    typename C::const_iterator ci = std::next(c.cbegin());
    typename C::iterator it = c.begin();
    std::cout << (it == ci) << (ci != it) << " ";
    c.insert(ci, 7);
    c.emplace(c.cbegin(), 8);
    c.erase(std::next(c.cbegin()));
    c.erase(c.begin());
    c.insert(c.end(), 2, 9);
    show(c);
    std::cout << std::distance(c.cbegin(), c.cend()) << "\n";
}

template <class C> void random(C c)
{
    typename C::const_iterator ci = c.cbegin() + 1;
    typename C::iterator it = c.begin() + 2;
    std::cout << (it - ci) << (ci - it) << (it < ci) << (ci < it) << (it >= ci) << " ";
    typename C::const_reverse_iterator cr = c.crbegin();
    typename C::reverse_iterator r = c.rbegin();
    std::cout << (r == cr) << (cr - r) << (r < cr + 1) << " " << *(cr + 1) << "\n";
}

int main()
{
    sequence(std::vector<int>{ 1, 2, 3 });
    sequence(std::deque<int>{ 1, 2, 3 });
    sequence(std::list<int>{ 1, 2, 3 });
    random(std::vector<int>{ 1, 2, 3 });
    random(std::deque<int>{ 1, 2, 3 });
    random(std::string("abc"));
    std::deque<int> dq;
    for (int i = 0; i < 300; ++i)
        dq.push_back(i);
    dq.insert(dq.begin() + 200, 7, -1);
    dq.erase(dq.cbegin() + 10, dq.cbegin() + 20);
    std::cout << dq.size() << " " << dq[190] << " " << dq[196] << " " << (dq.cend() - dq.begin()) << "\n";
    std::map<int, char> m{ { 1, 'a' }, { 2, 'b' }, { 3, 'c' } };
    m.erase(m.cbegin());
    m.emplace_hint(m.cend(), 9, 'z');
    for (const auto& [k, v] : m)
        std::cout << k << v;
    std::cout << "\n";
    std::vector<bool> flags(4, false);
    flags[1] = true;
    flags.flip();
    show(flags);
    std::cout << "\n";
    std::cout << std::fmod(10, 3) << " " << std::fabs(-3) << " " << std::round(7) << " " << std::trunc(2) << " "
              << std::fmin(1, 2) << " " << std::fmax(4, 2) << " " << std::tan(0) << " " << std::atan(1) * 4 << " "
              << std::exp2(10) << " " << sizeof(std::fmod(7.5f, 2.0f)) << "\n";
    return 0;
}

// Output:
// 01 7,2,3,9,9, 5
// 01 7,2,3,9,9, 5
// 01 7,2,3,9,9, 5
// 1-1011 101 2
// 1-1011 101 2
// 1-1011 101 b
// 297 -1 -1 297
// 2b3c9z
// 1,0,1,1,
// 1 3 7 2 1 4 0 3.14159 1024 4
