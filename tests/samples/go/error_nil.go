type P struct{ X int }

func get(p *P) int {
	return p.X
}

var p *P
fmt.Println("before")
get(p)

// Output:
// before
// Error: panic: runtime error: invalid memory address or nil pointer dereference
// Line: 4
