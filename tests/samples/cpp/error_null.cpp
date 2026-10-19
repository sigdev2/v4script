#include <iostream>

struct Item {
    int value;
};

int get(const Item* item)
{
    return item->value;
}

int main()
{
    Item* missing = nullptr;
    std::cout << "before" << std::endl;
    return get(missing);
}

// Output:
// before
// Error: Segmentation fault (null pointer dereference)
// Line: 9
