package main

import (
	"cmp"
	"fmt"
	"slices"
	"strings"
)

type Number interface {
	~int | ~int64 | ~float64
}

func Sum[T Number](xs []T) T {
	var total T
	for _, x := range xs {
		total += x
	}
	return total
}

func Map[T, U any](xs []T, f func(T) U) []U {
	out := make([]U, len(xs))
	for i, x := range xs {
		out[i] = f(x)
	}
	return out
}

func Filter[T any](xs []T, keep func(T) bool) []T {
	var out []T
	for _, x := range xs {
		if keep(x) {
			out = append(out, x)
		}
	}
	return out
}

func MaxOf[T cmp.Ordered](a, b T) T {
	if a > b {
		return a
	}
	return b
}

type Stack[T any] struct {
	items []T
}

func (s *Stack[T]) Push(v T) { s.items = append(s.items, v) }

func (s *Stack[T]) Pop() (T, bool) {
	var zero T
	if len(s.items) == 0 {
		return zero, false
	}
	v := s.items[len(s.items)-1]
	s.items = s.items[:len(s.items)-1]
	return v, true
}

func (s Stack[T]) Len() int { return len(s.items) }

type Pair[K comparable, V any] struct {
	Key K
	Val V
}

func (p Pair[K, V]) String() string { return fmt.Sprintf("%v=%v", p.Key, p.Val) }

type MyInt int

func main() {
	fmt.Println(Sum([]int{1, 2, 3}), Sum([]float64{1.5, 2.25}), Sum([]MyInt{4, 5}))
	strs := Map([]int{1, 2, 3}, func(i int) string { return strings.Repeat("*", i) })
	fmt.Println(strs, len(strs))
	evens := Filter([]int{1, 2, 3, 4, 5, 6}, func(n int) bool { return n%2 == 0 })
	fmt.Println(evens)
	fmt.Println(MaxOf(3, 7), MaxOf("apple", "banana"), MaxOf[float64](2, 1.5))
	var st Stack[string]
	st.Push("a")
	st.Push("b")
	v, ok := st.Pop()
	fmt.Println(v, ok, st.Len())
	ints := &Stack[int]{}
	for i := 0; i < 4; i++ {
		ints.Push(i * i)
	}
	fmt.Println(ints.items, ints.Len())
	p := Pair[string, int]{"x", 1}
	fmt.Println(p, []Pair[string, int]{p, {"y", 2}})
	words := []string{"pear", "fig", "apple"}
	slices.Sort(words)
	nums := []int{5, 2, 8, 1}
	slices.Sort(nums)
	fmt.Println(words, nums, slices.Contains(nums, 8), slices.Index(words, "pear"), slices.Max(nums))
	people := []Pair[string, int]{{"Ann", 30}, {"Bob", 25}, {"Cy", 30}}
	slices.SortFunc(people, func(a, b Pair[string, int]) int { return cmp.Compare(a.Val, b.Val) })
	fmt.Println(people)
	slices.Reverse(nums)
	fmt.Println(nums, min(3, 1, 2), max(2.5, 1), min("b", "a"))
}

// Output:
// 6 3.75 9
// [* ** ***] 3
// [2 4 6]
// 7 banana 2
// b true 1
// [0 1 4 9] 4
// x=1 [x=1 y=2]
// [apple fig pear] [1 2 5 8] true 2 8
// [Bob=25 Ann=30 Cy=30]
// [8 5 2 1] 1 2.5 a
