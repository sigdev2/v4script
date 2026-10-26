// C++17 order of evaluation: the right operand of an assignment comes
// before the left one; the lvalue of a comma or a conditional operator can
// be assigned, bound to a reference and have its address taken.
#include <iostream>
#include <map>
#include <string>
#include <vector>

static int store[2];

int& target(int i)
{
    std::cout << "L" << i;
    return store[i];
}

int value(int v)
{
    std::cout << "R" << v;
    return v;
}

int main()
{
    std::map<std::string, int> ids;
    for (const char* name : { "x", "y", "z" })
        ids[name] = static_cast<int>(ids.size());
    for (const auto& [name, id] : ids)
        std::cout << name << id << " ";
    std::cout << "\n";
    target(0) = value(5);
    target(1) += value(2);
    int& r = (target(0) = value(7));
    r += 1;
    std::cout << " " << store[0] << " " << store[1] << "\n";
    std::vector<int> v{ 1 };
    v[0] = (v.push_back(2), static_cast<int>(v.size()));
    int i = 0;
    int a[3] = { 0, 0, 0 };
    a[i] = ++i;
    std::cout << v[0] << v[1] << " " << a[0] << a[1] << " " << i << "\n";
    int d = 0, e = 1, f = 2, g = 3;
    (i++, d) = 5;
    (e > 0 ? d : e) += 2;
    int& h = f > g ? f : g;
    h = 30;
    int* p = &(i, f);
    *p += 1;
    (f < g ? f : g)++;
    std::cout << d << " " << e << " " << f << " " << g << " " << i << "\n";
    return 0;
}

// Output:
// x0 y1 z2
// R5L0R2L1R7L0 8 2
// 22 01 1
// 7 1 4 30 2
