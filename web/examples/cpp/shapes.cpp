// Classes: an abstract base, virtual functions, smart pointers and
// sorting by a virtual function.
#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <memory>
#include <string>
#include <vector>

class Shape {
public:
    virtual ~Shape() = default;
    virtual double area() const = 0;
    virtual double perimeter() const = 0;
    virtual std::string name() const = 0;
};

class Circle : public Shape {
public:
    explicit Circle(double radius) : radius_(radius) {}
    double area() const override { return M_PI * radius_ * radius_; }
    double perimeter() const override { return 2 * M_PI * radius_; }
    std::string name() const override { return "circle"; }

private:
    double radius_;
};

class Rectangle : public Shape {
public:
    Rectangle(double width, double height) : width_(width), height_(height) {}
    double area() const override { return width_ * height_; }
    double perimeter() const override { return 2 * (width_ + height_); }
    std::string name() const override { return width_ == height_ ? "square" : "rectangle"; }

private:
    double width_, height_;
};

class Triangle : public Shape {
public:
    Triangle(double a, double b, double c) : a_(a), b_(b), c_(c) {}
    double area() const override
    {
        double s = perimeter() / 2;
        return std::sqrt(s * (s - a_) * (s - b_) * (s - c_));
    }
    double perimeter() const override { return a_ + b_ + c_; }
    std::string name() const override { return "triangle"; }

private:
    double a_, b_, c_;
};

int main()
{
    std::vector<std::unique_ptr<Shape>> shapes;
    shapes.push_back(std::make_unique<Circle>(1.5));
    shapes.push_back(std::make_unique<Rectangle>(2, 3));
    shapes.push_back(std::make_unique<Rectangle>(2.5, 2.5));
    shapes.push_back(std::make_unique<Triangle>(3, 4, 5));
    std::sort(shapes.begin(), shapes.end(),
              [](const std::unique_ptr<Shape>& a, const std::unique_ptr<Shape>& b) { return a->area() < b->area(); });
    std::cout << std::fixed << std::setprecision(2);
    double total = 0;
    for (const auto& shape : shapes) {
        std::cout << std::left << std::setw(10) << shape->name() << std::right << " area " << std::setw(6)
                  << shape->area() << "  perimeter " << std::setw(6) << shape->perimeter() << "\n";
        total += shape->area();
    }
    std::cout << "Total area: " << total << "\n";
    return 0;
}
