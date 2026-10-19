func f(n int) int {
	return f(n+1) + 1
}

f(0)

// Error: stack overflow
// Line: 2
