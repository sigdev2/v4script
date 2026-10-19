struct Point {
    int x, y;
}

int main()
{
    Point p { 1, 2 };
    return p.x;
}

// Error: expected ';' after struct definition
// Line: 3
