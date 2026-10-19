# Go

Go 1.22 without files, network and reflection, translated into JavaScript
by v4script. Numbers, strings, slices, maps, structs, interfaces, generics,
goroutines and channels behave as in Go, and error messages are like those
of the Go compiler.

```go
type Item struct {
	Name  string
	Price float64
}

var items []Item
for {
	var item Item
	if _, err := fmt.Scan(&item.Name, &item.Price); err != nil {
		break
	}
	items = append(items, item)
}
sort.Slice(items, func(i, j int) bool { return items[i].Price > items[j].Price })
fmt.Printf("Most expensive: %s (%.2f)\n", items[0].Name, items[0].Price)
fmt.Println(app.Greet(items[0].Name)) // a function of the host module "app"
len(items)                            // the value of the run
```

## A unit is a file of package main

 - A unit is a file of package `main`; the line `package main` may be
   left out.
 - Besides declarations (`func`, `type`, `var`, `const`) a unit may have
   **statements**: they run in order, as the body of `main`. If the unit
   declares `func main()`, it runs after them (and the unit's
   `func init()` before it).
 - **Value.** If the last statement of the unit is an expression with one
   value (`x * 2`, `add(2)`, `Point{1, 2}`), the run returns it as
   `fmt.Println` would print it.
 - **Shared declarations.** Top-level functions, types, constants and
   variables (also those declared with `x := 5`) are visible in the other
   Go units. Running a unit again declares them again; a type with the
   same structure stays the same type, and values in variables keep their
   methods.
 - **import** of standard packages may be left out:
   `fmt.Println("hi")` works without `import "fmt"`. Unused variables and
   imports are not errors.

## What is supported

 - **Numbers**: all integer types with overflow as in Go (`int` and
   `int64` are 64 bits: `math.MaxInt64 + 1` is negative), `uint64`,
   `float32`, `float64`; constants are exact (`0.1 + 0.2` in a constant is
   exactly `0.3`), `iota`.
 - **Strings** are UTF-8 bytes, as in Go: `len("привет")` is 12, `s[i]` is
   a byte, `range` over a string gives runes, `[]rune(s)` and `[]byte(s)`.
 - **Slices, arrays, maps**: `append` (the capacity grows as in Go:
   `cap()` matches), `copy`, slices `s[a:b:c]` sharing the array, maps with
   any comparable keys (structs too); `fmt` prints a map in key order.
 - **Structs**: values are copied on assignment and passing, pointers,
   embedding with promoted fields and methods, anonymous structs,
   comparison with `==`.
 - **Methods and interfaces**: value and pointer receivers, embedded
   interfaces, type assertions `x.(T)`, `switch x.(type)`, `error`,
   `fmt.Stringer`.
 - **Functions**: closures, multiple results, named results, variadic
   `...`, method values, `defer`, `panic`, `recover`. Every iteration of a
   `for` loop has its own variable (as in Go 1.22).
 - **Generics**: type parameters of functions and types, constraints
   (`any`, `comparable`, `cmp.Ordered`, `~int | ~float64`), type inference
   from arguments.
 - **Goroutines and channels**: `go`, buffered and unbuffered channels,
   `select` with `default`, `close`, `range` over a channel,
   `sync.WaitGroup`, `sync.Mutex`, `sync.Once`, `time.Sleep`, `time.After`,
   `time.Tick`. Goroutines take turns (they do not run in parallel). When
   all of them wait for time (`time.Sleep`), the run ends and the program
   goes on in timers of the engine (see
   [programs that wait](README.md#shared-rules)). The program ends when
   `main` (or the statements of the unit) ends. If all goroutines wait for
   each other, it is the error `all goroutines are asleep - deadlock!`.

## The standard library

| Package | What is there |
| --- | --- |
| `fmt` | `Println`, `Printf`, `Print`, `Sprintf`, `Sprint`, `Sprintln`, `Errorf` (with `%w`), `Fprintln`/`Fprintf`/`Fprint` (to `os.Stdout`, `os.Stderr`, `strings.Builder`…), `Scan`, `Scanln`, `Scanf`, `Sscan`, `Sscanf`; all verbs `%v %+v %#v %T %d %s %q %x %X %o %b %c %U %e %f %g %t %p`, width, precision, flags |
| `strings` | search, `Split`, `Fields`, `Join`, `Replace`, `ToUpper`/`ToLower`, `Trim…`, `Cut`, `Builder`, `NewReplacer`, `NewReader` |
| `strconv` | `Itoa`, `Atoi`, `ParseInt`, `ParseFloat`, `ParseBool`, `FormatInt`, `FormatFloat`, `Quote`, `Unquote` |
| `math`, `math/rand` | the functions and constants of `math`; `rand.Intn`, `Float64`, `Perm`, `Shuffle`, `New(rand.NewSource(…))` |
| `sort`, `slices`, `maps`, `cmp` | `sort.Ints`, `sort.Slice`, `sort.Sort`, `sort.Search`; `slices.Sort`, `SortFunc`, `Contains`, `Index`, `Max`, `Min`, `Reverse`, `BinarySearch`; `maps.Clone` |
| `errors` | `New`, `Is`, `As`, `Unwrap`, `Join` |
| `time` | `Now`, `Since`, `Sleep`, `After`, `Tick`, `Duration` (printed as `1.5s`), `Time` and `Format` |
| `sync`, `sync/atomic` | `WaitGroup`, `Mutex`, `RWMutex`, `Once`, `Map`; `atomic.AddInt64` and others |
| `bufio`, `io`, `os` | `bufio.Reader`, `Scanner` (with `ScanLines`, `ScanWords`, `ScanRunes`), `Writer`; `io.Reader`, `io.Writer`, `io.EOF`; `os.Stdin`, `os.Stdout`, `os.Stderr`, `os.Exit` |
| `unicode`, `unicode/utf8`, `bytes` | rune classes; UTF-8 runes; `bytes.Buffer` |

The built-ins `print` and `println` write to standard output (Go writes
them to standard error), floats as Go prints them: `+1.500000e+000`.

**Input**: `os.Stdin` is standard input of the host: `fmt.Scan` waits for
the next lines, `bufio.NewReader(os.Stdin)` and `bufio.NewScanner(os.Stdin)`
read lines and words; `io.EOF` at the end of input.

## JavaScript and host modules

The package `syscall/js` (name `js`) works with JavaScript values, as in
Go for the browser.

Drawing on a canvas that the application put into the global variable
`canvas` (as [examples/canvas](../../examples/canvas) does):

```go
ctx := js.Global().Get("canvas").Call("getContext", "2d")
for i := 0; i < 10; i++ {
	ctx.Set("fillStyle", fmt.Sprintf("hsl(%d, 70%%, 50%%)", i*36))
	ctx.Call("fillRect", i*30, 20, 25, 100)
}
```

 - `js.Value` has `Get`, `Set`, `Call`, `Invoke`, `New`, `Index`,
   `SetIndex`, `Length`, `Int`, `Float`, `String`, `Bool`, `Truthy`,
   `IsNull`, `IsUndefined`, `Type`, `Equal`, `Interface`. `js.Global()` is
   the JavaScript global object: `js.Global().Call("jsDouble", 21)`.
 - Go values go to JavaScript like this: numbers as numbers, strings as
   strings, slices and arrays as arrays, maps and structs (their exported
   fields) as objects, functions as functions. `fmt.Println` prints a
   `js.Value` as the JavaScript console does.
 - A Go function can be given to JavaScript:
   `js.Global().Set("square", func(x int) int { return x * x })` - the
   arguments are converted to the parameter types. An event handler is set
   the same way or with
   `js.FuncOf(func(this js.Value, args []js.Value) any { … })`.
 - A JavaScript exception is a panic `JavaScript error: …` at the line of
   the call.
 - **Host modules**: a module `app` is a package with exported names
   (`app.Greet`, `app.IsEven`, `app.Counter()` for a getter); a global
   module is imported implicitly, another one needs `import "app"`. Types:
   `int` is `int64`, `number` `float64`, `string`, `bool`, `value`
   `js.Value`, `array` `[]js.Value`; optional parameters are a trailing
   `...any`.

## Modules

`import "mathx"` loads the host file `mathx.go` - a file of a package with
any name (`package mathx`). Its exported names are visible:
`mathx.Triple(5)`. A package from a host file may import other host files.
A changed file is translated again at the next run.

## Errors

 - Translation errors are like those of the Go compiler, with the line:
   `undefined: x`,
   `cannot use "a" (untyped string constant) as int value in assignment`,
   `missing return`, `syntax error: unexpected newline, expected expression`.
 - Panics come with the Go text and the line where they happened:
   `panic: runtime error: index out of range [5] with length 3`,
   `invalid memory address or nil pointer dereference`,
   `integer divide by zero`, `assignment to entry in nil map`. `recover()`
   in a deferred function catches them.
 - Infinite recursion is `stack overflow`.

## What is missing

 - Complex numbers, `goto`, range over iterator functions (Go 1.23),
   reflection, `unsafe`, cgo; struct tags are parsed and ignored.
 - Packages for files, network and processes (`os.Open`, `net/http`…);
   `regexp`, `encoding/json`, `math/big` are not there yet.
 - If a function that other units already call is changed so that it
   starts to wait for a channel or for time, run those units again.
 - 64-bit integer arithmetic is slower than plain numbers (exact, but with
   checks): a loop of a million steps takes a fraction of a second.

Shared rules: [languages](README.md#shared-rules). Internals:
[Go in the translator](../internals/go.md).
