// Generics: functions over any slice and a generic stack.
package main

import (
	"fmt"
	"strings"
)

func Map[T, U any](items []T, f func(T) U) []U {
	result := make([]U, 0, len(items))
	for _, item := range items {
		result = append(result, f(item))
	}
	return result
}

func Filter[T any](items []T, keep func(T) bool) []T {
	var result []T
	for _, item := range items {
		if keep(item) {
			result = append(result, item)
		}
	}
	return result
}

type Number interface {
	~int | ~int64 | ~float64
}

func Sum[T Number](items []T) T {
	var total T
	for _, item := range items {
		total += item
	}
	return total
}

type Stack[T any] struct {
	items []T
}

func (s *Stack[T]) Push(item T) { s.items = append(s.items, item) }

func (s *Stack[T]) Pop() (T, bool) {
	var zero T
	if len(s.items) == 0 {
		return zero, false
	}
	item := s.items[len(s.items)-1]
	s.items = s.items[:len(s.items)-1]
	return item, true
}

func main() {
	words := []string{"go", "generics", "are", "here", "since", "1.18"}
	fmt.Println(Map(words, strings.ToUpper))
	fmt.Println(Map(words, func(s string) int { return len(s) }))
	fmt.Println(Filter(words, func(s string) bool { return len(s) > 3 }))
	fmt.Println(Sum([]int{1, 2, 3, 4}), Sum([]float64{0.5, 0.25}))

	var stack Stack[string]
	for _, word := range words {
		stack.Push(word)
	}
	for word, ok := stack.Pop(); ok; word, ok = stack.Pop() {
		fmt.Print(word, " ")
	}
	fmt.Println()
}
