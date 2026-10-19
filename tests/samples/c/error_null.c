#include <stdio.h>

struct Item {
    int value;
};

static int get(struct Item *item)
{
    return item->value;
}

int main(void)
{
    struct Item *missing = NULL;
    printf("before\n");
    return get(missing);
}

// Output:
// before
// Error: Segmentation fault (null pointer dereference)
// Line: 9
