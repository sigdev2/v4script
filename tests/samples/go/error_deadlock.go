ch := make(chan int)
ch <- 1

// Error: fatal error: all goroutines are asleep - deadlock!
