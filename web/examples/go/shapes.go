// Interfaces: shapes with areas, sorted, and a type switch.
package main

import (
	"fmt"
	"math"
	"sort"
)

type Shape interface {
	Area() float64
	Perimeter() float64
}

type Circle struct{ R float64 }
type Rect struct{ W, H float64 }
type Triangle struct{ A, B, C float64 }

func (c Circle) Area() float64      { return math.Pi * c.R * c.R }
func (c Circle) Perimeter() float64 { return 2 * math.Pi * c.R }
func (r Rect) Area() float64        { return r.W * r.H }
func (r Rect) Perimeter() float64   { return 2 * (r.W + r.H) }
func (t Triangle) Perimeter() float64 { return t.A + t.B + t.C }
func (t Triangle) Area() float64 {
	s := t.Perimeter() / 2
	return math.Sqrt(s * (s - t.A) * (s - t.B) * (s - t.C))
}

func (c Circle) String() string { return fmt.Sprintf("circle r=%g", c.R) }

func main() {
	shapes := []Shape{Rect{3, 4}, Circle{1.5}, Triangle{3, 4, 5}, Rect{2, 2}}
	sort.Slice(shapes, func(i, j int) bool { return shapes[i].Area() < shapes[j].Area() })
	for _, s := range shapes {
		kind := ""
		switch v := s.(type) {
		case Circle:
			kind = v.String()
		case Rect:
			if v.W == v.H {
				kind = "square"
			} else {
				kind = "rectangle"
			}
		default:
			kind = fmt.Sprintf("%T", v)
		}
		fmt.Printf("%-16s area %6.2f  perimeter %6.2f\n", kind, s.Area(), s.Perimeter())
	}
}
