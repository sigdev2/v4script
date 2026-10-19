package main

import "fmt"

func counter() func() int {
	n := 0
	return func() int {
		n++
		return n
	}
}

func divide(a, b int) (result int, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("recovered: %v", r)
		}
	}()
	result = a / b
	return
}

func deferOrder() (s string) {
	for i := 0; i < 3; i++ {
		defer func(n int) { s += fmt.Sprint(n) }(i)
	}
	s = "start:"
	return s
}

func fib() func() int {
	a, b := 0, 1
	return func() int {
		r := a
		a, b = b, a+b
		return r
	}
}

func apply(xs []int, f func(int) int) []int {
	out := make([]int, 0, len(xs))
	for _, x := range xs {
		out = append(out, f(x))
	}
	return out
}

func variadic(prefix string, nums ...int) int {
	total := 0
	for _, n := range nums {
		total += n
	}
	fmt.Println(prefix, len(nums), total)
	return total
}

func swap(a, b string) (string, string) { return b, a }

func main() {
	c := counter()
	c()
	c()
	fmt.Println(c(), counter()())
	fmt.Println(divide(7, 2))
	fmt.Println(divide(1, 0))
	fmt.Println(deferOrder())
	f := fib()
	for i := 0; i < 10; i++ {
		fmt.Print(f(), " ")
	}
	fmt.Println()
	fmt.Println(apply([]int{1, 2, 3}, func(x int) int { return x * x }))
	var funcs []func() int
	for i := 0; i < 3; i++ {
		funcs = append(funcs, func() int { return i * 10 })
	}
	for _, g := range funcs {
		fmt.Print(g(), " ")
	}
	fmt.Println()
	variadic("none")
	variadic("some", 1, 2, 3)
	nums := []int{4, 5}
	variadic("spread", nums...)
	x, y := swap("a", "b")
	fmt.Println(x, y)
	fmt.Println(swap(swap("p", "q")))
	x, y = y, x
	fmt.Println(x, y)
	add := func(a int) func(int) int { return func(b int) int { return a + b } }
	fmt.Println(add(3)(4))
	ptr := new(int)
	*ptr = 5
	inc := func(p *int) { *p++ }
	inc(ptr)
	v := 10
	inc(&v)
	fmt.Println(*ptr, v)
	func() {
		defer fmt.Println("deferred in literal")
		fmt.Println("body")
	}()
	defer fmt.Println("main done")
	panic(fmt.Sprintf("boom %d", 42))
}

// Output:
// 3 1
// 3 <nil>
// 0 recovered: runtime error: integer divide by zero
// start:210
// 0 1 1 2 3 5 8 13 21 34
// [1 4 9]
// 0 10 20
// none 0 0
// some 3 6
// spread 2 9
// b a
// p q
// a b
// 7
// 6 11
// body
// deferred in literal
// main done
// Error: panic: boom 42
// Line: 104
