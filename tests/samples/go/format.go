package main

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

type T struct {
	A int
	B string
	C []int
	D *int
}

func main() {
	n := 255
	fmt.Printf("%d|%5d|%-5d|%05d|%x|%X|%#x|%o|%b|%+d|% d\n", n, n, n, n, n, n, n, n, 5, n, n)
	fmt.Printf("%c|%q|%U|%#U\n", 'Ж', 'Ж', 'Ж', 'Ж')
	f := 3.14159
	fmt.Printf("%f|%.2f|%8.3f|%-8.1f|%e|%E|%g|%G|%.3g\n", f, f, f, f, f, f, f, f, f)
	fmt.Printf("%.0f %.0f %.0f %.1f %.2f\n", 0.5, 1.5, 2.5, 0.25, 1.005)
	fmt.Printf("%s|%10s|%-10s|%.2s|%q|%x|% x\n", "hi", "hi", "hi", "hello", "a\"b\n", "hi", "hi")
	fmt.Printf("%t %v %v %p\n", true, nil, []string{"a", "b"}, nil)
	x := 5
	v := T{1, "s", []int{1, 2}, &x}
	s := fmt.Sprintf("%v", v)
	fmt.Println(strings.HasPrefix(s, "{1 s [1 2] 0x"), fmt.Sprintf("%+v", T{A: 2}))
	fmt.Printf("%#v %#v %#v\n", []int{1}, "q", map[string]int{"a": 1})
	fmt.Printf("%v %d %s\n", []byte("ab"), []byte("ab"), []byte("ab"))
	fmt.Printf("%6.2f%%\n", 12.3456)
	fmt.Printf("%d %s\n", "str", 5)
	fmt.Printf("%d\n")
	fmt.Println(fmt.Sprintf("%d", 1, 2))
	fmt.Printf("%*d|%-*d|%.*f\n", 5, 42, 4, 7, 2, 3.14159)
	fmt.Printf("%[2]d %[1]d\n", 1, 2)
	fmt.Printf("%v %v\n", map[int]bool{3: true, 1: false}, struct{}{})
	fmt.Print("a", "b", 1, 2, "c", 3.5, "\n")
	fmt.Println(fmt.Sprint("x", 1, 2, "y"), fmt.Sprintln("end"))
	fmt.Fprintln(os.Stderr, "to stderr")
	fmt.Println(strconv.Itoa(-45), strconv.Quote("tab\there"), strconv.FormatFloat(1.5, 'f', -1, 64), strconv.FormatInt(255, 2))
	i, err := strconv.Atoi("12a")
	fmt.Println(i, err)
	fl, _ := strconv.ParseFloat("2.5e3", 64)
	b, _ := strconv.ParseBool("true")
	big, err2 := strconv.ParseInt("9223372036854775808", 10, 64)
	fmt.Println(fl, b, big, err2)
	fmt.Println(strings.ToUpper("привет"), strings.Fields(" a  b c "), strings.Split("a,b,,c", ","), strings.Join([]string{"x", "y"}, "-"))
	fmt.Println(strings.Repeat("ab", 3), strings.Replace("aaaa", "a", "b", 2), strings.Index("chicken", "ken"), strings.Contains("seafood", "foo"))
	fmt.Println(strings.TrimSpace("  x  "), strings.Trim("xxhixx", "x"), strings.Title("hello world"), strings.Count("cheese", "e"))
	fmt.Printf("%q\n", strings.SplitN("a,b,c,d", ",", 2))
	before, after, found := strings.Cut("key=value", "=")
	fmt.Println(before, after, found, strings.EqualFold("Go", "GO"), strings.LastIndex("go gopher", "go"))
	r := strings.NewReplacer("<", "&lt;", ">", "&gt;")
	fmt.Println(r.Replace("<b>x</b>"))
	fmt.Printf("%v|%6v|%-6v|\n", 1.0, 2.5, true)
	fmt.Printf("%08.3f|%+.1e|%x\n", -3.14159, 12345.678, 3.0)
}

// Output:
// 255|  255|255  |00255|ff|FF|0xff|377|101|+255| 255
// Ж|'Ж'|U+0416|U+0416 'Ж'
// 3.141590|3.14|   3.142|3.1     |3.141590e+00|3.141590E+00|3.14159|3.14159|3.14
// 0 2 2 0.2 1.00
// hi|        hi|hi        |he|"a\"b\n"|6869|68 69
// true <nil> [a b] %!p(<nil>)
// true {A:2 B: C:[] D:<nil>}
// []int{1} "q" map[string]int{"a":1}
// [97 98] [97 98] ab
//  12.35%
// %!d(string=str) %!s(int=5)
// %!d(MISSING)
// 1%!(EXTRA int=2)
//    42|7   |3.14
// 2 1
// map[1:false 3:true] {}
// ab1 2c3.5
// x1 2y end
//
// !to stderr
// -45 "tab\there" 1.5 11111111
// 0 strconv.Atoi: parsing "12a": invalid syntax
// 2500 true 9223372036854775807 strconv.ParseInt: parsing "9223372036854775808": value out of range
// ПРИВЕТ [a b c] [a b  c] x-y
// ababab bbaa 4 true
// x hi Hello World 3
// ["a" "b,c,d"]
// key value true true 3
// &lt;b&gt;x&lt;/b&gt;
// 1|   2.5|true  |
// -003.142|+1.2e+04|0x1.8p+01
