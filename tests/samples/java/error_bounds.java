// An array index out of bounds.
int[] values = new int[3];
for (int i = 0; i <= values.length; i++)
    values[i] = i * i;

// Error: java.lang.ArrayIndexOutOfBoundsException: Index 3 out of bounds for length 3
// Line: 4
