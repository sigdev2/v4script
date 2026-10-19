// Hello: reading standard input with bufio, strings and runes.
package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

func main() {
	fmt.Print("What is your name? ")
	reader := bufio.NewReader(os.Stdin)
	line, _ := reader.ReadString('\n')
	name := strings.TrimSpace(line)
	if name == "" {
		name = "stranger"
	}
	fmt.Printf("Hello, %s!\n", name)
	runes := []rune(name)
	for i, j := 0, len(runes)-1; i < j; i, j = i+1, j-1 {
		runes[i], runes[j] = runes[j], runes[i]
	}
	fmt.Printf("Backwards: %s, %d letters, %d bytes in UTF-8\n", string(runes), len(runes), len(name))
}
