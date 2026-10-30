// A path of a function without return.
Console.WriteLine(Sign(5));

static int Sign(int n)
{
    if (n > 0)
        return 1;
    else if (n < 0)
        return -1;
}

// Error: error CS0161: 'Sign(int)': not all code paths return a value
// Line: 4
