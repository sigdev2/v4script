int numbers[3] = { 1, 2, 0 };
int sum = 0;
for (int i = 0; i < 3; i++)
    sum += 100 / numbers[i];

// Error: Floating point exception (integer division by zero)
// Line: 4
