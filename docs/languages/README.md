# Languages

The reference for people who write programs that run in v4script. Every
language runs inside the same Qt JavaScript engine (V4) as plain JavaScript:
there are no native interpreters, no processes and no files or network
beyond what the embedding application gives.

| Language | Page | Version | How it runs |
| --- | --- | --- | --- |
| Python | [python.md](python.md) | 3 | the Skulpt interpreter |
| Lua | [lua.md](lua.md) | 5.3 | the fengari interpreter |
| Prolog | [prolog.md](prolog.md) | ISO | the Tau Prolog interpreter |
| Perl | [perl.md](perl.md) | 5 | Perlito5 translates Perl into JavaScript |
| PHP | [php.md](php.md) | 7 | Uniter translates PHP into JavaScript |
| Go | [go.md](go.md) | 1.22 | the v4script translator |
| C | [c.md](c.md) | C17 | the v4script translator, own linear memory |
| Java | [java.md](java.md) | 21 | the v4script translator, a JDK subset written in Java |
| Forth | [forth.md](forth.md) | Forth 2012 | an interpreter of v4script, definitions translated into JavaScript; own linear memory |
| BASIC | [basic.md](basic.md) | QBasic 4.5 | the v4script translator, graphics on a canvas |
| Pascal | [pascal.md](pascal.md) | Free Pascal 3.2.2 | the v4script translator (objfpc mode), classes, `Graph` on a canvas |
| WebAssembly | [wat.md](wat.md) | 2.0 | the v4script translator (text format WAT, `.wast` commands, WASI) |
| Scheme | [scheme.md](scheme.md) | R7RS-small | the v4script translator, SRFI 1, 13, 18, 69, full continuations |

`v4script::languages()` lists the languages compiled into the library with
their versions (see [embedding](../embedding/README.md#languages-and-versions)),
and `javascript` runs plain JavaScript in the same engine.

Every page has the same parts: what the language supports, how a program
uses [host modules](#host-modules) and JavaScript, where modules and
standard input come from, errors, and what is missing.

## Shared rules

 - **Units.** The application runs code with
   `run(language, code, unit)`. All units of one language in one engine
   form one program: variables, functions, classes, types and predicates
   declared by one unit are visible in the next. Running a unit again
   declares its functions, classes and types again: the new ones replace
   the old ones. `Runtime::reset()` forgets everything.
 - **Output** (`print`, `echo`, `fmt.Println`, `WriteLn`…) goes to the
   host in whole lines; an unfinished line goes at the end of the run or
   before the program reads input. Standard error (where the language has
   it) is a separate stream, and so are interpreter warnings (PHP, Prolog).
 - **Value.** Like an interactive session, a run returns the value of the
   program (`Result::value`): Python, Lua, Go, C, Java and Pascal - the
   last expression of the unit; PHP - the value of `return` in the unit;
   Forth - what is left on the stack (`<2> 1 2`); WebAssembly - the result
   of the last `invoke` command or of the function `main`; Scheme - the
   value of the last form (as `write` prints it). Prolog, Perl and BASIC
   have no value, only output.
 - **Errors** come with the line in the unit (`Result::errorLine`); an
   error inside a module names the module and its line
   (`Result::errorSource`). Perl knows the line of syntax errors only.
 - **The first run** of a language in an engine loads its interpreter or
   translator: from tens of milliseconds to about a second (Perl and PHP are
   the slowest). `load()` does it ahead of time, outside the time limit.
 - **Time limit.** A run longer than the limit of the runtime is
   interrupted (`Status::Interrupted`); the variables of the language
   stay.
 - **Programs that wait** (`time.Sleep` in Go, `Thread.sleep` in Java,
   `SLEEP` in BASIC, `Delay` in Pascal, SRFI 18 threads in Scheme, Forth
   `MS`) end their run when everything waits for time and go on in timers
   of the engine: run the event loop or `Runtime::waitForFinished()`.
 - **Recursion** goes up to 10 000 nested calls after
   `v4script::prepareProcess()` (1000 on Android); deeper is a stack
   overflow error of the language, not a crash.
 - **Modules and data files** come from the host
   (`Host::readModule(name)`): `import` in Python and Go, `require` in Lua,
   `consult` in Prolog, `use` and `require` in Perl, `include` and
   `require` in PHP, `#include` in C, a class `Name` from `Name.java` in
   Java, `INCLUDE` and `REQUIRE` in Forth, `'$INCLUDE: 'name'` in BASIC,
   `uses Name` (`Name.pas`) and `{$I name}` in Pascal, `(import "name" …)`
   (`name.wat`) in WebAssembly, `(import (name))` (`name.sld`), `load` and
   `include` in Scheme. Files are read only. A changed file is loaded again
   at the next run.
 - **Standard input** comes from the host (`Host::readLine`, or
   `Runtime::setInputText`): `input()`, `io.read`, `read/1`, `<STDIN>`,
   `fgets(STDIN)`, `fmt.Scan`, `scanf`, `Scanner(System.in)`, `ACCEPT`,
   `INPUT`, `ReadLn`, WASI `fd_read`, `read-line`. Without a host input
   programs see the end of input.

## Host modules

An application gives programs its own API as host modules
([embedding](../embedding/host-modules.md)). Each language shows a module
in its own conventions. The examples use this module:

```cpp
runtime.addModule(v4script::HostModule("app", object, {
    "string greet(string name)",
    "number add(number a, number b)",
    "void log(string text)",
    "int counter",            // a getter: a property read on every call
}));
```

| Language | Global functions | Through the module |
| --- | --- | --- |
| JavaScript | `greet("Ann")`, `counter` | `app.greet("Ann")`, `app.counter` |
| Python | `greet("Ann")`, `counter()` | `import app` · `app.greet("Ann")` |
| Lua | `greet("Ann")`, `counter()` | `app.greet("Ann")` |
| Prolog | `greet('Ann', G)`, `counter(C)` | `app:counter(C)` |
| Perl | `greet("Ann")`, `counter()` | `app::greet("Ann")` |
| PHP | `greet("Ann")`, `counter()` | `app\greet("Ann")` |
| Go | - | `app.Greet("Ann")`, `app.Counter()` |
| C | `greet("Ann")`, `counter()` | `app_greet("Ann")` |
| Java | `greet("Ann")`, `counter()` | `App.greet("Ann")` |
| Forth | `s" Ann" greet`, `counter` | `app.greet`, `app.counter` |
| BASIC | `GREET("Ann")`, `COUNTER` | `APP.greet("Ann")`, `APP.counter` |
| Pascal | `Greet('Ann')`, `Counter` | `App.Greet('Ann')`, `App.Counter` |
| WebAssembly | - | `(import "app" "greet" (func …))` |
| Scheme | `(greet "Ann")`, `(counter)` | `(app.greet "Ann")`, `app.counter` |

 - A **global** module (the default) puts its functions next to the
   built-in ones (Go imports it implicitly); a non-global one is reached
   only through its name. A global function never hides a built-in name of
   the language (`log` in a language that has its own `log` stays the
   language's); the function is then reachable through the module.
 - Names follow the language: `isEven` is `is_even` in C and Prolog,
   `IsEven` in Go and Pascal, `is-even` in Scheme and Forth, `ISEVEN` in
   BASIC; JavaScript, Python, Lua, Perl, PHP, Java and WebAssembly keep the
   JavaScript name. In C a module is the header `app.h` (included
   implicitly for a global module), in Java the class `app.App`, in Pascal
   the unit `App`, in Go the package `app`.
 - Types: `int` is a 64-bit integer where the language has one (`int64`,
   `long`, `long long`), `value` is a handle of a JavaScript value
   (`js.Value`, `JsValue`, `js_value`, `OBJECT`, `JSValue`), `array` an
   array of such values. Arrays and maps of the language go to JavaScript
   as arrays and objects.
 - An exception thrown by a host function is an error of the program at
   the line of the call.

## JavaScript from programs

All languages share the global object with JavaScript: programs read and
set global variables, call JavaScript functions and give their own
functions to JavaScript.

| JavaScript | Python | Lua | Perl | PHP |
| --- | --- | --- | --- | --- |
| `o.value("B2")` | `o.value("B2")` | `o:value("B2")` | `$o->value("B2")` | `$o->value("B2")` |
| `o.title` | `o.title` | `o.title` | `$o->title` | `$o->title` |
| `o.fillStyle = "red"` | `o.fillStyle = "red"` | `o.fillStyle = "red"` | `setProperty($o, "fillStyle", "red")` | `$o->fillStyle = "red"` |
| `Math.max(1, 5)` | `js.Math.max(1, 5)` | `js.global.Math:max(1, 5)` | `js()->Math->max(1, 5)` | `$js->Math->max(1, 5)` |

| JavaScript | Go | C | Java | Forth |
| --- | --- | --- | --- | --- |
| `o.value("B2")` | `o.Call("value", "B2")` | `js_call(o, "value", "B2")` | `o.call("value", "B2")` | `js" B2" 1 o s" value" js-call` |
| `o.title` | `o.Get("title")` | `js_get(o, "title")` | `o.get("title")` | `o s" title" js-get` |
| `o.fillStyle = "red"` | `o.Set("fillStyle", "red")` | `js_set(o, "fillStyle", "red")` | `o.set("fillStyle", "red")` | `js" red" o s" fillStyle" js-set` |
| `Math.max(1, 5)` | `js.Global().Get("Math").Call("max", 1, 5)` | `js_call(js_get(js_global(), "Math"), "max", 1, 5)` | `Js.global().get("Math").call("max", 1, 5)` | `1 5 2 js-global s" Math" js-get s" max" js-call` |

| JavaScript | BASIC | Pascal | Scheme |
| --- | --- | --- | --- |
| `o.value("B2")` | `o.value("B2")` | `o.value('B2')` | `(o.value "B2")` |
| `o.title` | `o.title` | `o.title` | `o.title` |
| `o.fillStyle = "red"` | `o.fillStyle = "red"` | `o.fillStyle := 'red'` | `(set! o.fillStyle "red")` |
| `Math.max(1, 5)` | `JS.Math.max(1, 5)` | `JS.Math.max(1, 5)` | `(Math.max 1 5)` |

Prolog uses the predicates of the library `js` ([prolog.md](prolog.md)),
WebAssembly imports functions from the modules `js` and `'`
([wat.md](wat.md#javascript-and-host-modules)).

## Graphics

BASIC (`SCREEN`, `LINE`, `CIRCLE`, `PAINT`…) and Pascal (`Graph`) draw on
the canvas of the host (`Host::canvas`, see
[canvas](../embedding/canvas.md)). Other languages draw through a canvas
object that the application gives them - a host module function or a global
JavaScript variable - with the 2D context of an HTML canvas.
