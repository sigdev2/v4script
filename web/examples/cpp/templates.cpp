// Templates: a generic matrix with operators, a variadic function and a
// fold expression, constexpr evaluated by the translator.
#include <array>
#include <iostream>

template <class T, int Rows, int Columns> class Matrix {
public:
    T& operator()(int row, int column) { return cells_[row * Columns + column]; }
    const T& operator()(int row, int column) const { return cells_[row * Columns + column]; }

    template <int Other> Matrix<T, Rows, Other> operator*(const Matrix<T, Columns, Other>& right) const
    {
        Matrix<T, Rows, Other> result;
        for (int i = 0; i < Rows; ++i)
            for (int j = 0; j < Other; ++j)
                for (int k = 0; k < Columns; ++k)
                    result(i, j) += (*this)(i, k) * right(k, j);
        return result;
    }

    friend std::ostream& operator<<(std::ostream& out, const Matrix& m)
    {
        for (int i = 0; i < Rows; ++i) {
            for (int j = 0; j < Columns; ++j)
                out << (j > 0 ? " " : "") << m(i, j);
            out << "\n";
        }
        return out;
    }

private:
    std::array<T, Rows * Columns> cells_ {};
};

template <class... Ts> auto sum(Ts... values) { return (values + ... + 0); }

constexpr long fibonacci(int n) { return n < 2 ? n : fibonacci(n - 1) + fibonacci(n - 2); }

int main()
{
    Matrix<int, 2, 3> a;
    Matrix<int, 3, 2> b;
    for (int i = 0; i < 2; ++i)
        for (int j = 0; j < 3; ++j) {
            a(i, j) = i + j;
            b(j, i) = i * j + 1;
        }
    std::cout << "A * B =\n" << a * b;
    std::cout << "sum: " << sum(1, 2, 3, 4) << " " << sum(0.5, 0.25) << "\n";
    static_assert(fibonacci(20) == 6765, "computed while translating");
    std::array<int, fibonacci(6)> eight {};
    std::cout << "fibonacci(20) = " << fibonacci(20) << ", an array of " << eight.size() << "\n";
    return 0;
}
