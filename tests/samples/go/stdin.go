// Standard input of the host: fmt.Scan, bufio.Reader and bufio.Scanner.
import (
	"bufio"
	"fmt"
	"os"
)

func main() {
	fmt.Print("Name? ")
	var name string
	fmt.Scan(&name)
	fmt.Println("Hi", name)
	var a, b int
	n, err := fmt.Scan(&a, &b)
	fmt.Println(a+b, n, err)
	reader := bufio.NewReader(os.Stdin)
	rest, _ := reader.ReadString('\n')
	fmt.Printf("%q\n", rest)
	scanner := bufio.NewScanner(reader)
	scanner.Split(bufio.ScanWords)
	for scanner.Scan() {
		fmt.Println("word:", scanner.Text())
	}
	_, err = fmt.Scan(&name)
	fmt.Println(err)
}

// Input:
// Bob
// 3 4 rest
// x y
// Output:
// Name? Hi Bob
// 7 2 <nil>
// " rest\n"
// word: x
// word: y
// EOF
