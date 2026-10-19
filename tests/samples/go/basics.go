package main

import (
	"fmt"
	"math"
)

const (
	A = iota
	B
	C
	_
	E
)

type Weekday int

const (
	Sunday Weekday = iota
	Monday
)

func main() {
	fmt.Println(A, B, C, E, Monday)
	var i8 int8 = 127
	i8++
	var u8 uint8 = 0
	u8--
	var i32 int32 = math.MaxInt32
	i32 += 1
	var u32 uint32 = 1 << 31
	u32 *= 2
	fmt.Println(i8, u8, i32, u32)
	var big int64 = math.MaxInt64
	big++
	fmt.Println(big, big-1)
	var u uint64 = 1<<64 - 1
	fmt.Println(u, u+1, u/3)
	x := 1 << 62
	fmt.Println(x*2, x*4, x/3)
	fmt.Println(-7/2, -7%2, 7/-2, 7%-2)
	fmt.Println(1<<10, 0xff, 0o17, 0b101, 1_000_000)
	h := uint64(14695981039346656037)
	for _, c := range []byte("go") {
		h ^= uint64(c)
		h *= 1099511628211
	}
	fmt.Println(h)
	fmt.Println(3.0, 2.5, 1e6, 1e21, 0.1+0.2, 1.0/3.0, float32(0.1), 100000.0, 1e-5, 123456789.0)
	fmt.Println(math.Sqrt(2), math.Pi, math.Inf(1), -math.Inf(1), math.NaN())
	f := 3.99
	fmt.Println(int(f), int(-f), float64(7)/2, 7/2)
	s := "привет, мир"
	fmt.Println(len(s), len([]rune(s)), s[0], string(s[0:2]), s[:6])
	for i, r := range "aжz" {
		fmt.Print(i, ":", string(r), " ")
	}
	fmt.Println()
	b := []byte("abc")
	b[0] = 'X'
	fmt.Println(string(b), string(rune(1046)), 'a', "a"+"b" == "ab", "abc" < "abd")
	var z complex128ish = 0
	_ = z
}

type complex128ish int

// Output:
// 0 1 2 4 1
// -128 255 -2147483648 0
// -9223372036854775808 9223372036854775807
// 18446744073709551615 0 6148914691236517205
// -9223372036854775808 0 1537228672809129301
// -3 -1 -3 1
// 1024 255 15 5 1000000
// 618463229101696779
// 3 2.5 1e+06 1e+21 0.3 0.3333333333333333 0.1 100000 1e-05 1.23456789e+08
// 1.4142135623730951 3.141592653589793 +Inf -Inf NaN
// 3 -3 3.5 3
// 20 11 208 п при
// 0:a 1:ж 3:z
// Xbc Ж 97 true true
