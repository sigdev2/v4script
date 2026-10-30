// An index past the end of an array.
int[] squares = new int[5];
for (int i = 0; i <= squares.Length; i++)
    squares[i] = i * i;

// Error: Unhandled exception. System.IndexOutOfRangeException: Index was outside the bounds of the array.
// Line: 4
