// Endless recursion - a StackOverflowError, not a crash.
int depth(int n) {
    return depth(n + 1) + 1;
}
depth(0);

// Error: java.lang.StackOverflowError
