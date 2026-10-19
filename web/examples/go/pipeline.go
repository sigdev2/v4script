// Goroutines and channels: a pipeline of three stages and a WaitGroup.
package main

import (
	"fmt"
	"sync"
)

func generate(limit int) <-chan int {
	out := make(chan int)
	go func() {
		for n := 2; n <= limit; n++ {
			out <- n
		}
		close(out)
	}()
	return out
}

// filter passes the numbers that its prime does not divide.
func filter(in <-chan int, prime int) <-chan int {
	out := make(chan int)
	go func() {
		for n := range in {
			if n%prime != 0 {
				out <- n
			}
		}
		close(out)
	}()
	return out
}

func main() {
	// The sieve of goroutines: every prime adds a filter to the chain.
	numbers := generate(100)
	var primes []int
	for {
		prime, ok := <-numbers
		if !ok {
			break
		}
		primes = append(primes, prime)
		numbers = filter(numbers, prime)
	}
	fmt.Println("Primes:", primes)

	// Workers squaring numbers in parallel; a mutex guards the sum.
	var wg sync.WaitGroup
	var mu sync.Mutex
	sum := 0
	for worker := 1; worker <= 4; worker++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for n := id; n <= 100; n += 4 {
				mu.Lock()
				sum += n * n
				mu.Unlock()
			}
		}(worker)
	}
	wg.Wait()
	fmt.Println("Sum of squares 1..100:", sum)
}
