// Waiting: time.Sleep, then time.Tick and time.After in a select. The
// run of the program ends while it waits; it goes on in timers, as in the
// Qt engine.
package main

import (
	"fmt"
	"time"
)

func main() {
	for i := 5; i > 0; i-- {
		fmt.Println(i, "...")
		time.Sleep(500 * time.Millisecond)
	}
	fmt.Println("Start!")

	tick := time.Tick(300 * time.Millisecond)
	done := time.After(1600 * time.Millisecond)
	ticks := 0
	for {
		select {
		case <-tick:
			ticks++
			fmt.Println("tick", ticks)
		case <-done:
			fmt.Println("Done after", ticks, "ticks")
			return
		}
	}
}
