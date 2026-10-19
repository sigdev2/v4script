package main

import "fmt"

type Point struct{ X, Y int }

func main() {
	var s []int
	fmt.Println(s == nil, len(s), cap(s), s)
	for i := 0; i < 5; i++ {
		s = append(s, i*i)
	}
	fmt.Println(s, len(s))
	t := s[1:3]
	t[0] = 100
	fmt.Println(s, t, len(t), cap(t))
	t = append(t, 7)
	fmt.Println(s)
	u := make([]int, 2, 10)
	copy(u, []int{9, 8, 7})
	fmt.Println(u, s[len(s)-1], s[:2], s[3:])
	grid := [][]string{{"a", "b"}, {"c"}}
	grid[1] = append(grid[1], "d")
	fmt.Println(grid, len(grid[1]))
	var arr [3]int
	arr2 := arr
	arr2[0] = 5
	fmt.Println(arr, arr2, arr == [3]int{}, len(arr))
	m := map[string]int{"b": 2, "a": 1}
	m["c"] = 3
	v, ok := m["zz"]
	fmt.Println(m, len(m), v, ok, m["a"])
	delete(m, "b")
	fmt.Println(m)
	counts := map[rune]int{}
	for _, r := range "hello" {
		counts[r]++
	}
	fmt.Println(counts['l'], counts['h'], len(counts))
	pts := map[Point]string{{1, 2}: "a", {0, 0}: "o"}
	fmt.Println(pts[Point{1, 2}], pts)
	ps := []Point{{1, 2}, {3, 4}}
	for _, p := range ps {
		p.X = 99
	}
	for i := range ps {
		ps[i].Y *= 10
	}
	fmt.Println(ps)
	q := ps[0]
	q.X = -1
	pp := &ps[1]
	pp.X = 42
	fmt.Println(q, ps)
	var nilMap map[string]int
	fmt.Println(nilMap["x"], len(nilMap))
	defer func() {
		fmt.Println("recovered:", recover())
	}()
	idx := 5
	fmt.Println(s[idx])
}

// Output:
// true 0 0 []
// [0 1 4 9 16] 5
// [0 100 4 9 16] [100 4] 2 7
// [0 100 4 7 16]
// [9 8] 16 [0 100] [7 16]
// [[a b] [c d]] 2
// [0 0 0] [5 0 0] true 3
// map[a:1 b:2 c:3] 3 0 false 1
// map[a:1 c:3]
// 2 1 4
// a map[{0 0}:o {1 2}:a]
// [{1 20} {3 40}]
// {-1 20} [{1 20} {42 40}]
// 0 0
// recovered: runtime error: index out of range [5] with length 5
