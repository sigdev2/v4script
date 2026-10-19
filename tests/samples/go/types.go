package main

import (
	"errors"
	"fmt"
	"math"
	"strings"
)

type Shape interface {
	Area() float64
	Perimeter() float64
}

type Rect struct{ W, H float64 }
type Circle struct{ R float64 }

func (r Rect) Area() float64       { return r.W * r.H }
func (r Rect) Perimeter() float64  { return 2 * (r.W + r.H) }
func (c Circle) Area() float64     { return math.Pi * c.R * c.R }
func (c Circle) Perimeter() float64 { return 2 * math.Pi * c.R }
func (c Circle) String() string     { return fmt.Sprintf("Circle(%g)", c.R) }

type Counter struct{ n int }

func (c *Counter) Inc() { c.n++ }
func (c Counter) Get() int { return c.n }

type Animal struct{ Name string }

func (a Animal) Speak() string { return a.Name + " makes a sound" }

type Dog struct {
	Animal
	Breed string
}

func (d Dog) Speak() string { return d.Name + " barks" }

type Cat struct{ Animal }

type Celsius float64

func (c Celsius) String() string { return fmt.Sprintf("%.1f°C", float64(c)) }

type MyErr struct{ Code int }

func (e *MyErr) Error() string { return fmt.Sprintf("code %d", e.Code) }

func find(code int) error {
	if code == 0 {
		return nil
	}
	return &MyErr{code}
}

var ErrNotFound = errors.New("not found")

func lookup(k string) (int, error) {
	if k == "" {
		return 0, fmt.Errorf("lookup %q: %w", k, ErrNotFound)
	}
	return len(k), nil
}

func describe(i interface{}) string {
	switch v := i.(type) {
	case nil:
		return "nil"
	case int:
		return fmt.Sprintf("int %d", v+1)
	case string, []byte:
		return fmt.Sprintf("text %v", v)
	case fmt.Stringer:
		return "stringer " + v.String()
	case error:
		return "error " + v.Error()
	default:
		return fmt.Sprintf("other %T", v)
	}
}

func main() {
	shapes := []Shape{Rect{3, 4}, Circle{1}}
	total := 0.0
	for _, s := range shapes {
		total += s.Area()
	}
	fmt.Printf("%.3f\n", total)
	fmt.Println(shapes[1], shapes[0])
	var c Counter
	c.Inc()
	c.Inc()
	p := &c
	p.Inc()
	fmt.Println(c.Get(), p.Get(), c)
	d := Dog{Animal{"Rex"}, "lab"}
	cat := Cat{Animal{"Tom"}}
	fmt.Println(d.Speak(), "|", d.Animal.Speak(), "|", cat.Speak(), "|", d.Name)
	fmt.Printf("%v %+v\n", d, d)
	var t Celsius = 21.5
	fmt.Println(t)
	fmt.Println(find(0) == nil, find(7))
	err := find(3)
	var me *MyErr
	if errors.As(err, &me) {
		fmt.Println("as", me.Code)
	}
	_, err = lookup("")
	fmt.Println(err, errors.Is(err, ErrNotFound), errors.Unwrap(err) == ErrNotFound)
	n, err := lookup("abc")
	fmt.Println(n, err)
	fmt.Println(describe(nil), "|", describe(41), "|", describe("hi"), "|", describe(Circle{2}), "|",
		describe(&MyErr{5}), "|", describe(3.5), "|", describe([]int{1}))
	var sh Shape = Rect{1, 1}
	r, ok := sh.(Rect)
	_, isCircle := sh.(Circle)
	fmt.Println(r.W, ok, isCircle)
	var b strings.Builder
	for i := 0; i < 3; i++ {
		fmt.Fprintf(&b, "%d;", i)
	}
	fmt.Println(b.String(), b.Len())
	type pair struct {
		a, b int
	}
	fmt.Println(pair{1, 2} == pair{1, 2}, pair{1, 2})
	anon := struct {
		Name string
		Age  int
	}{"Ann", 30}
	fmt.Printf("%v %+v %T\n", anon, anon, 42)
	fmt.Printf("%T %T %T %T\n", c, p, shapes, err)
	defer func() {
		r := recover()
		fmt.Println("recovered:", r)
	}()
	_ = sh.(Circle)
}

// Output:
// 15.142
// Circle(1) {3 4}
// 3 3 {3}
// Rex barks | Rex makes a sound | Tom makes a sound | Rex
// {{Rex} lab} {Animal:{Name:Rex} Breed:lab}
// 21.5°C
// true code 7
// as 3
// lookup "": not found true true
// 3 <nil>
// nil | int 42 | text hi | stringer Circle(2) | error code 5 | other float64 | other []int
// 1 true false
// 0;1;2; 6
// true {1 2}
// {Ann 30} {Name:Ann Age:30} int
// main.Counter *main.Counter []main.Shape <nil>
// recovered: interface conversion: main.Shape is main.Rect, not main.Circle
