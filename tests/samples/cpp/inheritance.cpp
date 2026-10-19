// Virtual functions, abstract classes, multiple inheritance, casts and RTTI.
#include <iostream>
#include <memory>
#include <string>
#include <typeinfo>
#include <vector>

class Shape {
public:
    explicit Shape(std::string name) : name_(std::move(name)) {}
    virtual ~Shape() { std::cout << "~Shape " << name_ << "\n"; }
    virtual double area() const = 0;
    virtual std::string describe() const { return name_ + " with area " + std::to_string(area()); }
    const std::string& name() const { return name_; }

private:
    std::string name_;
};

class Rectangle : public Shape {
public:
    Rectangle(double width, double height) : Shape("rectangle"), width_(width), height_(height) {}
    ~Rectangle() override { std::cout << "~Rectangle\n"; }
    double area() const override { return width_ * height_; }

protected:
    double width_, height_;
};

class Square final : public Rectangle {
public:
    explicit Square(double side) : Rectangle(side, side) {}
    std::string describe() const override { return "square: " + Rectangle::describe(); }
};

class Circle : public Shape {
public:
    explicit Circle(double radius) : Shape("circle"), radius_(radius) {}
    double area() const override { return 3 * radius_ * radius_; }

private:
    double radius_;
};

struct Named {
    virtual ~Named() = default;
    virtual std::string label() const { return "named"; }
};

struct Counted {
    static int count;
    Counted() { ++count; }
    Counted(const Counted&) { ++count; }
    ~Counted() { --count; }
};

int Counted::count = 0;

struct Widget : Named, Counted {
    int id;
    explicit Widget(int id) : id(id) {}
    std::string label() const override { return "widget " + std::to_string(id); }
};

struct Base {
    void hello() const { std::cout << "Base::hello\n"; }
    virtual void call() const { std::cout << "Base::call\n"; }
    void callTwice() const
    {
        call();
        call();
    }
};

struct Derived : Base {
    void hello() const { std::cout << "Derived::hello\n"; }
    void call() const override { std::cout << "Derived::call\n"; }
};

int main()
{
    std::vector<std::unique_ptr<Shape>> shapes;
    shapes.push_back(std::make_unique<Rectangle>(2, 3));
    shapes.push_back(std::make_unique<Square>(1.5));
    shapes.push_back(std::make_unique<Circle>(1));
    double total = 0;
    for (const auto& shape : shapes) {
        std::cout << shape->describe() << "\n";
        total += shape->area();
    }
    std::cout << "total " << total << "\n";

    for (const auto& shape : shapes) {
        if (auto* rectangle = dynamic_cast<Rectangle*>(shape.get()))
            std::cout << shape->name() << " is a rectangle of " << rectangle->area() << "\n";
        else
            std::cout << shape->name() << " is not a rectangle\n";
    }
    std::cout << typeid(*shapes[1]).name() << " " << (typeid(*shapes[0]) == typeid(Rectangle)) << "\n";
    shapes.erase(shapes.begin());
    std::cout << "erased\n";

    {
        Widget w(7);
        Named& named = w;
        Counted* counted = &w;
        std::cout << named.label() << " " << Counted::count << " " << (static_cast<Widget*>(counted)->id) << "\n";
        Widget copy = w;
        std::cout << copy.label() << " " << Counted::count << "\n";
    }
    std::cout << "count " << Counted::count << "\n";

    Derived d;
    Base& b = d;
    b.hello();
    d.hello();
    b.callTwice();
    d.Base::call();

    try {
        Shape& circle = *shapes.back();
        Rectangle& wrong = dynamic_cast<Rectangle&>(circle);
        std::cout << wrong.area() << "\n";
    } catch (const std::bad_cast& error) {
        std::cout << "bad_cast: " << error.what() << "\n";
    }
    return 0;
}

// Output:
// rectangle with area 6.000000
// square: rectangle with area 2.250000
// circle with area 3.000000
// total 11.25
// rectangle is a rectangle of 6
// rectangle is a rectangle of 2.25
// circle is not a rectangle
// 6Square 1
// ~Rectangle
// ~Shape rectangle
// erased
// widget 7 1 7
// widget 7 2
// count 0
// Base::hello
// Derived::hello
// Derived::call
// Derived::call
// Base::call
// bad_cast: std::bad_cast
// ~Rectangle
// ~Shape rectangle
// ~Shape circle
