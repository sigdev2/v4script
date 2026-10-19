// A unit without main: statements in order, the value of the last expression.
int total = 0;
for (int i = 1; i <= 10; i++)
    total += i;
printf("sum %d\n", total);

struct P {
    int x, y;
};
struct P p = { 3, 4 };

double scale(double k)
{
    return k * p.x;
}

scale(2.5) + p.y;

// Output:
// sum 55
// Value: 11.5
