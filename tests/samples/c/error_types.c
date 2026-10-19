struct A {
    int x;
};

int main(void)
{
    struct A a = { 1 };
    int *p = a;
    return 0;
}

// Error: initializing 'int *' with an expression of incompatible type 'struct A'
// Line: 8
