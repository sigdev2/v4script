// Sequence containers and adapters: vector, array, deque, list,
// forward_list, stack, queue and priority_queue.
#include <array>
#include <deque>
#include <forward_list>
#include <iostream>
#include <list>
#include <queue>
#include <stack>
#include <string>
#include <vector>

template <class C> void show(const std::string& title, const C& items)
{
    std::cout << title << ":";
    for (const auto& item : items)
        std::cout << " " << item;
    std::cout << "\n";
}

struct Point {
    int x, y;
    Point(int x, int y) : x(x), y(y) {}
};

int main()
{
    std::vector<int> v { 5, 1, 4 };
    v.push_back(2);
    v.insert(v.begin() + 1, 9);
    v.erase(v.begin() + 3);
    v.emplace_back(7);
    show("vector", v);
    std::cout << v.size() << " " << v.front() << " " << v.back() << " " << v[2] << " " << v.at(1) << "\n";
    v.resize(7, -1);
    show("resized", v);
    v.pop_back();
    v.assign(3, 8);
    show("assigned", v);

    std::vector<int> grown;
    std::size_t lastCapacity = grown.capacity();
    for (int i = 0; i < 40; ++i) {
        grown.push_back(i);
        if (grown.capacity() != lastCapacity) {
            lastCapacity = grown.capacity();
            std::cout << lastCapacity << " ";
        }
    }
    std::cout << "\n";

    std::vector<std::vector<int>> grid(3, std::vector<int>(4, 0));
    for (int r = 0; r < 3; ++r)
        for (int c = 0; c < 4; ++c)
            grid[r][c] = r * c;
    std::cout << grid[2][3] << " " << grid.size() << "x" << grid[0].size() << "\n";

    std::vector<Point> points;
    points.reserve(2);
    points.emplace_back(1, 2);
    points.push_back(Point(3, 4));
    for (auto it = points.rbegin(); it != points.rend(); ++it)
        std::cout << "(" << it->x << "," << it->y << ")";
    std::cout << " " << points.capacity() << "\n";

    std::array<int, 5> fixed { 3, 1, 4, 1, 5 };
    fixed.fill(2);
    fixed[4] = 6;
    show("array", fixed);
    std::cout << fixed.size() << " " << sizeof(fixed) << "\n";

    std::deque<std::string> deque { "b", "c" };
    deque.push_front("a");
    deque.push_back("d");
    deque.pop_front();
    show("deque", deque);
    std::cout << deque[1] << " " << deque.size() << "\n";

    std::list<int> list { 4, 2, 6 };
    list.push_front(8);
    list.push_back(1);
    list.sort();
    list.remove(6);
    auto position = list.begin();
    ++position;
    list.insert(position, 3);
    list.reverse();
    show("list", list);
    std::list<int> other { 10, 0 };
    list.splice(list.begin(), other);
    list.unique();
    show("spliced", list);

    std::forward_list<int> forward { 3, 1, 2 };
    forward.push_front(0);
    forward.sort();
    forward.insert_after(forward.begin(), 9);
    show("forward_list", forward);

    std::stack<int> stack;
    for (int i = 1; i <= 3; ++i)
        stack.push(i * i);
    std::cout << "stack:";
    while (!stack.empty()) {
        std::cout << " " << stack.top();
        stack.pop();
    }
    std::cout << "\n";

    std::queue<std::string> queue;
    queue.push("first");
    queue.push("second");
    queue.push("third");
    queue.pop();
    std::cout << "queue: " << queue.front() << " .. " << queue.back() << " (" << queue.size() << ")\n";

    std::priority_queue<int> highest;
    std::priority_queue<int, std::vector<int>, std::greater<int>> lowest;
    for (int n : { 5, 1, 8, 3, 9, 2 }) {
        highest.push(n);
        lowest.push(n);
    }
    std::cout << "priority:";
    while (!highest.empty()) {
        std::cout << " " << highest.top() << "/" << lowest.top();
        highest.pop();
        lowest.pop();
    }
    std::cout << "\n";
    return 0;
}

// Output:
// vector: 5 9 1 2 7
// 5 5 7 1 9
// resized: 5 9 1 2 7 -1 -1
// assigned: 8 8 8
// 1 2 4 8 16 32 64
// 6 3x4
// (3,4)(1,2) 2
// array: 2 2 2 2 6
// 5 20
// deque: b c d
// c 3
// list: 8 4 2 3 1
// spliced: 10 0 8 4 2 3 1
// forward_list: 0 9 1 2 3
// stack: 9 4 1
// queue: second .. third (2)
// priority: 9/1 8/2 5/3 3/5 2/8 1/9
