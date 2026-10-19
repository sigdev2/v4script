// A unit without main: declarations and statements in order, the value of
// the last expression. The library is there without #include.
int total = 0;
for (int i = 1; i <= 10; i++)
    total += i;
std::cout << "sum " << total << "\n";

struct Point {
    int x, y;
    int sum() const { return x + y; }
};
Point p { 3, 4 };

std::vector<int> squares;
for (int i = 1; i <= 4; ++i)
    squares.push_back(i * i);

template <class T> T scale(T value, double k) { return static_cast<T>(value * k); }

std::cout << squares.back() << " " << scale(p.sum(), 1.5) << "\n";
scale(2.5, p.x) + p.y;

// Output:
// sum 55
// 16 10
// Value: 11.5
