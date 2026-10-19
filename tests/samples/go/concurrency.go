package main

import (
	"fmt"
	"sync"
	"time"
)

func worker(id int, jobs <-chan int, results chan<- int, wg *sync.WaitGroup) {
	defer wg.Done()
	for j := range jobs {
		results <- j * j
	}
	_ = id
}

func producer(n int) <-chan int {
	ch := make(chan int)
	go func() {
		defer close(ch)
		for i := 1; i <= n; i++ {
			ch <- i
		}
	}()
	return ch
}

func main() {
	jobs := make(chan int, 10)
	results := make(chan int, 10)
	var wg sync.WaitGroup
	for w := 1; w <= 3; w++ {
		wg.Add(1)
		go worker(w, jobs, results, &wg)
	}
	for i := 1; i <= 5; i++ {
		jobs <- i
	}
	close(jobs)
	wg.Wait()
	close(results)
	sum := 0
	for r := range results {
		sum += r
	}
	fmt.Println("sum", sum)

	total := 0
	for v := range producer(4) {
		total += v
	}
	fmt.Println("total", total)

	ping := make(chan string)
	pong := make(chan string)
	go func() {
		for i := 0; i < 3; i++ {
			msg := <-ping
			pong <- msg + "-pong"
		}
	}()
	for i := 0; i < 3; i++ {
		ping <- fmt.Sprint("ping", i)
		fmt.Println(<-pong)
	}

	var mu sync.Mutex
	count := 0
	var wg2 sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg2.Add(1)
		go func() {
			defer wg2.Done()
			mu.Lock()
			count++
			mu.Unlock()
		}()
	}
	wg2.Wait()
	fmt.Println("count", count)

	done := make(chan bool)
	data := make(chan int)
	go func() {
		for i := 0; i < 2; i++ {
			data <- i
		}
		done <- true
	}()
	for running := true; running; {
		select {
		case v := <-data:
			fmt.Println("data", v)
		case <-done:
			fmt.Println("done")
			running = false
		}
	}
	select {
	case v := <-data:
		fmt.Println("unexpected", v)
	default:
		fmt.Println("no data")
	}
	v, ok := <-results
	fmt.Println(v, ok)

	start := time.Now()
	time.Sleep(30 * time.Millisecond)
	fmt.Println("slept", time.Since(start) >= 30*time.Millisecond)
	timeout := time.After(10 * time.Millisecond)
	select {
	case <-timeout:
		fmt.Println("timeout")
	case <-make(chan int):
		fmt.Println("never")
	}
	fmt.Println(1500*time.Millisecond, 90*time.Second, 2*time.Hour+3*time.Minute, 250*time.Microsecond)
}

// Output:
// sum 55
// total 10
// ping0-pong
// ping1-pong
// ping2-pong
// count 50
// data 0
// data 1
// done
// no data
// 0 false
// slept true
// timeout
// 1.5s 1m30s 2h3m0s 250µs
