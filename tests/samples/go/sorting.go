package main

import (
	"fmt"
	"sort"
	"strings"
)

type Person struct {
	Name string
	Age  int
}

type ByAge []Person

func (a ByAge) Len() int           { return len(a) }
func (a ByAge) Swap(i, j int)      { a[i], a[j] = a[j], a[i] }
func (a ByAge) Less(i, j int) bool { return a[i].Age < a[j].Age }

func main() {
	people := []Person{{"Alice", 30}, {"Bob", 25}, {"Carol", 35}, {"Dan", 25}}
	sort.Sort(ByAge(people))
	fmt.Println(people)
	sort.Sort(sort.Reverse(ByAge(people)))
	fmt.Println(people[0].Name, people[len(people)-1].Age)
	sort.Slice(people, func(i, j int) bool { return people[i].Name < people[j].Name })
	fmt.Println(people)
	xs := []int{5, 2, 9, 1}
	sort.Sort(sort.Reverse(sort.IntSlice(xs)))
	fmt.Println(xs, sort.IntsAreSorted(xs))
	sort.Ints(xs)
	fmt.Println(xs, sort.SearchInts(xs, 5), sort.IntsAreSorted(xs))
	words := strings.Fields("the quick brown fox")
	sort.Strings(words)
	fmt.Println(words, sort.SearchStrings(words, "fox"))
	sort.SliceStable(people, func(i, j int) bool { return people[i].Age < people[j].Age })
	fmt.Println(people)
	idx := sort.Search(100, func(i int) bool { return i*i >= 50 })
	fmt.Println(idx)
}

// Output:
// [{Bob 25} {Dan 25} {Alice 30} {Carol 35}]
// Carol 25
// [{Alice 30} {Bob 25} {Carol 35} {Dan 25}]
// [9 5 2 1] false
// [1 2 5 9] 2 true
// [brown fox quick the] 1
// [{Bob 25} {Dan 25} {Alice 30} {Carol 35}]
// 8
