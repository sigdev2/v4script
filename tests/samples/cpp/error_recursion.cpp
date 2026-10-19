long down(long n)
{
    return down(n + 1) + 1;
}

int main()
{
    return static_cast<int>(down(0));
}

// Error: Segmentation fault (stack overflow)
// Line: 3
