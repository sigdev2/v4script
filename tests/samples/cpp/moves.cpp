// Copy and move: the special members, elision of returned objects, moves
// into containers and the copies of vector growth (move only when the move
// constructor is noexcept).
#include <iostream>
#include <string>
#include <utility>
#include <vector>

class Tracked {
public:
    explicit Tracked(std::string name) : name_(std::move(name)) { std::cout << "make " << name_ << "\n"; }
    Tracked(const Tracked& other) : name_(other.name_ + "+copy") { std::cout << "copy " << name_ << "\n"; }
    Tracked(Tracked&& other) noexcept : name_(std::move(other.name_))
    {
        other.name_ = "(moved)";
        std::cout << "move " << name_ << "\n";
    }
    Tracked& operator=(const Tracked& other)
    {
        name_ = other.name_ + "+assigned";
        std::cout << "copy-assign " << name_ << "\n";
        return *this;
    }
    Tracked& operator=(Tracked&& other) noexcept
    {
        name_ = std::move(other.name_);
        other.name_ = "(moved)";
        std::cout << "move-assign " << name_ << "\n";
        return *this;
    }
    ~Tracked() { std::cout << "drop " << name_ << "\n"; }
    const std::string& name() const { return name_; }

private:
    std::string name_;
};

struct Fragile {
    int id;
    explicit Fragile(int id) : id(id) {}
    Fragile(const Fragile& other) : id(other.id) { std::cout << "copy fragile " << id << "\n"; }
    Fragile(Fragile&& other) : id(other.id) { std::cout << "move fragile " << id << "\n"; }
};

Tracked build(const std::string& name)
{
    Tracked result(name);
    return result;
}

Tracked pass(Tracked value) { return value; }

int main()
{
    Tracked a = build("a");
    Tracked b = a;
    Tracked c = std::move(a);
    std::cout << "a is " << a.name() << "\n";
    b = c;
    a = build("temp");
    std::cout << "--- pass\n";
    Tracked d = pass(Tracked("p"));
    std::cout << "--- vector\n";
    {
        std::vector<Tracked> items;
        items.reserve(1);
        items.push_back(Tracked("x"));
        items.emplace_back("y");
        std::cout << "size " << items.size() << "\n";
    }
    std::cout << "--- fragile\n";
    {
        std::vector<Fragile> items;
        for (int i = 1; i <= 3; ++i)
            items.emplace_back(i);
    }
    std::cout << "--- swap\n";
    std::swap(b, d);
    std::cout << b.name() << " " << d.name() << "\n";
    std::cout << "--- end\n";
    return 0;
}

// Output:
// make a
// copy a+copy
// move a
// a is (moved)
// copy-assign a+assigned
// make temp
// move-assign temp
// drop (moved)
// --- pass
// make p
// move p
// drop (moved)
// --- vector
// make x
// move x
// drop (moved)
// make y
// move x
// drop (moved)
// size 2
// drop x
// drop y
// --- fragile
// copy fragile 1
// copy fragile 1
// copy fragile 2
// --- swap
// move a+assigned
// move-assign p
// move-assign a+assigned
// drop (moved)
// p a+assigned
// --- end
// drop a+assigned
// drop a
// drop p
// drop temp
