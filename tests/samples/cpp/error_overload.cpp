struct Box {
    int size;
};

int twice(int x) { return 2 * x; }
double twice(double x) { return 2 * x; }

int main()
{
    Box box { 2 };
    return twice(box);
}

// Error: no matching function for call to 'twice(Box&)'
// Line: 11
