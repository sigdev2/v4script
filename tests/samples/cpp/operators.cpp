// A value class with the full set of operators: arithmetic, comparison,
// stream output and input, subscript, call, conversion, friends and
// user-defined literals.
#include <iostream>
#include <numeric>
#include <sstream>
#include <stdexcept>
#include <vector>

class Fraction {
public:
    Fraction(long numerator = 0, long denominator = 1) : numerator_(numerator), denominator_(denominator)
    {
        if (denominator_ == 0)
            throw std::domain_error("zero denominator");
        normalize();
    }
    long numerator() const { return numerator_; }
    long denominator() const { return denominator_; }

    Fraction& operator+=(const Fraction& other)
    {
        numerator_ = numerator_ * other.denominator_ + other.numerator_ * denominator_;
        denominator_ *= other.denominator_;
        normalize();
        return *this;
    }
    Fraction& operator*=(const Fraction& other)
    {
        numerator_ *= other.numerator_;
        denominator_ *= other.denominator_;
        normalize();
        return *this;
    }
    Fraction operator-() const { return Fraction(-numerator_, denominator_); }
    explicit operator double() const { return static_cast<double>(numerator_) / denominator_; }

    friend Fraction operator+(Fraction a, const Fraction& b) { return a += b; }
    friend Fraction operator*(Fraction a, const Fraction& b) { return a *= b; }
    friend Fraction operator-(const Fraction& a, const Fraction& b) { return a + -b; }
    friend bool operator==(const Fraction& a, const Fraction& b)
    {
        return a.numerator_ == b.numerator_ && a.denominator_ == b.denominator_;
    }
    friend bool operator!=(const Fraction& a, const Fraction& b) { return !(a == b); }
    friend bool operator<(const Fraction& a, const Fraction& b)
    {
        return a.numerator_ * b.denominator_ < b.numerator_ * a.denominator_;
    }
    friend std::ostream& operator<<(std::ostream& out, const Fraction& f)
    {
        out << f.numerator_;
        if (f.denominator_ != 1)
            out << '/' << f.denominator_;
        return out;
    }
    friend std::istream& operator>>(std::istream& in, Fraction& f)
    {
        long numerator = 0, denominator = 1;
        char slash = 0;
        in >> numerator >> slash >> denominator;
        f = Fraction(numerator, denominator);
        return in;
    }

private:
    void normalize()
    {
        long divisor = std::gcd(numerator_, denominator_);
        numerator_ /= divisor;
        denominator_ /= divisor;
        if (denominator_ < 0) {
            numerator_ = -numerator_;
            denominator_ = -denominator_;
        }
    }
    long numerator_, denominator_;
};

Fraction operator""_fr(unsigned long long value) { return Fraction(static_cast<long>(value)); }

class Polynomial {
public:
    explicit Polynomial(std::initializer_list<long> coefficients) : coefficients_(coefficients) {}
    long& operator[](std::size_t power) { return coefficients_.at(power); }
    long operator()(long x) const
    {
        long result = 0;
        for (auto it = coefficients_.rbegin(); it != coefficients_.rend(); ++it)
            result = result * x + *it;
        return result;
    }

private:
    std::vector<long> coefficients_;
};

int main()
{
    Fraction half(1, 2), third(1, 3);
    std::cout << half + third << " " << half - third << " " << half * third << " " << -half << " " << Fraction(6, -4)
              << "\n";
    std::cout << (half < third) << (third < half) << (half == Fraction(2, 4)) << (half != third) << " "
              << static_cast<double>(third) << "\n";
    Fraction sum;
    for (int i = 1; i <= 4; ++i)
        sum += Fraction(1, i * (i + 1));
    std::cout << sum << " " << 3_fr + half << " " << 1 + half << "\n";

    std::istringstream input("3/4 5/10");
    Fraction a, b;
    input >> a >> b;
    std::cout << a << " " << b << " " << a * b << "\n";
    try {
        Fraction broken(1, 0);
    } catch (const std::domain_error& error) {
        std::cout << error.what() << "\n";
    }

    Polynomial p { 1, 0, 2 };
    std::cout << p(3) << " ";
    p[1] = -1;
    std::cout << p(3) << " " << p[2] << "\n";
    return 0;
}

// Output:
// 5/6 1/6 1/6 -1/2 -3/2
// 0111 0.333333
// 4/5 7/2 3/2
// 3/4 1/2 3/8
// zero denominator
// 19 16 2
