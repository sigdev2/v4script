struct Shape {
    virtual ~Shape() = default;
    virtual double area() const = 0;
};

struct Square : Shape {
    double side = 1;
};

int main()
{
    Square square;
    return static_cast<int>(square.side);
}

// Error: cannot declare variable 'square' to be of abstract type 'Square'
// Line: 12
