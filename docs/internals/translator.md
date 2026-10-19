# The translator

Languages without a usable JavaScript interpreter are translated into
JavaScript by v4script itself ([js/translator](../../js/translator)). The
translator is written in JavaScript (ES2016, no build step) and runs in the
same V4 engine as the programs: no native interpreters, no WebAssembly of
the engine, no compilation outside the engine. A translated language is
registered like any other one (see [README](README.md)): its files and an
adapter in [languages.json](../../languages.json).

| Section | Topic |
| --- | --- |
| [Go](go.md) | value representation, type checking, interfaces, goroutines, generics, the standard library |
| [C](c.md) | linear memory, the preprocessor, type checking, function pointers, variable arguments, libc, `js_value` |
| [Java](java.md) | classes in JavaScript, inference of generics, the JDK library written in Java and loaded on demand, threads as fibers, `JsValue` |
| [Forth](forth.md) | the interpreter and the dictionary in JavaScript, definitions translated through a virtual stack, labels into blocks and loops, memory, JavaScript handles |
| [BASIC](basic.md) | the program shared by units, module variables, QBasic arithmetic with overflow, parameters by reference, GOSUB and ON ERROR as a state machine, graphics on a canvas |
| [Pascal](pascal.md) | a one-pass compiler with the types of Free Pascal, x86_64 arithmetic by ranges, values and references (records, `var`, pointers), classes on prototypes, units written in Pascal with external functions, Graph on a canvas, number formatting |
| [WebAssembly](wat.md) | the text and binary formats, validation by the spec, a virtual operand stack and the order of traps, memory and tables, imports from JavaScript and WASI, `.wast` commands, the spec tests |
| [Scheme](scheme.md) | the numeric tower, expansion and hygiene of `syntax-rules`, CPS translation with a trampoline, `call/cc` and `dynamic-wind`, R7RS exceptions, SRFI 18 threads, the library written in Scheme, error places without tail-call frames |

| File | Role |
| --- | --- |
| [core/runtime.js](../../js/translator/core/runtime.js) | `T.i64`/`T.u64` (64-bit integers), `T.big` (unbounded integers), `T.rat` (exact fractions), `T.utf8`, `T.numbers` (digits for formatting), `LanguageError`, `CompileError`, the fiber scheduler `T.Scheduler` |
| [core/compiler.js](../../js/translator/core/compiler.js) | `Scanner` and `Parser` (the base of lexers and parsers), the JavaScript tree `J.*`, printing with a line map and a depth limit, `T.ops` - arithmetic by the width of a type, `T.structure` - labels and jumps into blocks and loops (Forth, BASIC, Pascal `goto`) |
| [core/session.js](../../js/translator/core/session.js) | `T.createAdapter(host, language)`: the language environment, compiling chunks (`host.compile`), the place of an error by the stack, continuation in timers |
| `js/translator/<language>/` | parsing, checking, translation, run time and library of a language |
| [tools/run-samples.mjs](../../tools/run-samples.mjs) | the quick check in Node.js (see [testing](../testing/README.md)) |

## How a unit is translated

1. The text is parsed into a tree of the language (`Scanner`, `Parser`).
2. Names and types are checked and the tree is marked (`node.type`,
   constants, chosen methods, calls).
3. The tree is translated into a JavaScript tree (`J.*`) with the
   arithmetic already expanded for the types (`T.ops.binary('i64', '+',
   …)`).
4. Printing (`T.print`) gives the text and the map "code line -> source
   line".
5. `env.compileChunk` evaluates the text through `host.compile` under the
   file name `/v4script/translated/<chunk>` and calls the resulting
   function with the constants of the chunk.

The translator and the translated code live in one engine, so type
descriptions, struct classes and big constants go into the code as
**objects**, not as text: a chunk is `function ($go, $T, $D, $m) { … }`,
where `$D` is an array of values the translator built.

## Decisions

 - **Integers up to 32 bits** are numbers with truncation (`|0`, `>>>0`,
   `<<24>>24`, `Math.imul`). **64-bit integers** are a hybrid: a number
   while |x| ≤ 2^53 − 1, otherwise an `Int64` (hi, lo). The representation
   is unique (equal values are both numbers or both objects), `valueOf` of
   the object is NaN, so the fast branch in the code is
   `(t = a + b) <= MAX && t >= -MAX ? t : $T.i64.add(a, b)`: an object or a
   result beyond 2^53 goes to the slow path. Comparisons check `typeof`.
   The price is 3-4 times on a loop of pure arithmetic; exact 64-bit
   integers were preferred over doubles.
 - **Constants are exact**: integers are `T.big`, fractions `T.rat` (in Go
   the constant `0.1 + 0.2` is exactly 0.3). A fraction becomes a double
   rounding to even (`rat.toFloat`).
 - **UTF-8 strings** (Go, C, Pascal) are JavaScript strings where every
   character is a byte: length, index and slice work on bytes and are
   fast; output and JavaScript get them through `T.utf8.decode`.
 - **Numbers as text.** `T.numbers` gives exact digits (through
   `toExponential(100)`) and rounds halves to even or away from zero -
   languages differ (`%.0f` of 2.5 is "2" in Go and C, "3" in Java).
 - **Locals are `let`.** V4 gives every iteration of `for (let …)` its own
   binding, so closures in a loop see their own variable (as Go 1.22) at no
   cost.
 - **Expression depth.** The V4 compiler walks an expression by recursion
   without a stack check; printing refuses an expression deeper than 250
   levels ("the expression is too complex"), see
   [V4 pitfalls](v4-pitfalls.md).
 - **Compiler hints** of V4 about generated code ("used before its
   declaration") are silenced while code is compiled (`QuietCompiler` in
   [src/Internal.hpp](../../src/Internal.hpp)).

## Errors and lines

 - A translation error is `T.CompileError(text, line, column, source)`;
   the adapter returns it to the host as it is.
 - A run-time error is a V4 exception or a `T.LanguageError` (its `stack`
   is taken when it is created). `Environment.locate` finds the first
   frame `translated/<chunk>:<line>` in the stack and maps the line with
   the map of the chunk. Chunks of the language library and lines with the
   source `T.LIBRARY_SOURCE` (instances of library generics) are skipped:
   the place of the error is the user line that called the library.
 - The text of the error comes from the language (`session.describeError`):
   a Go panic, a Java exception…

## Fibers

Goroutines and Java threads are generators (Scheme threads are
continuations, see [Scheme](scheme.md#the-machine)). A function that may
wait (a channel, `select`, time) or calls such a function directly is
translated into a `function*`, its calls into `yield*`. A call of a
function value that may turn out to be a generator is checked at run time;
plain code runs a generator at once (`Scheduler.runNested`, a wait for
time is a busy loop under the watchdog).

`Scheduler.runMain` runs the main fiber until it ends or all fibers wait
for time; then a timer of the host continues it (`setTimeout`), and the
run of the unit returns: the program keeps going in timers
(`Runtime::isActive()`), `Runtime::stop()` cancels it. When nobody is ready
and nobody sleeps, it is a deadlock - an error of the language.

## After an interruption

The watchdog interrupts V4 without `catch` and `finally`. The state that
outlives a run is the declarations of the language (package objects,
types); everything that lives within a run (the scheduler, the stack of
deferred calls) starts anew on every run (`rt.reset`,
`scheduler.reset`). Declarations are checked in a separate layer and join
the shared scope only after a successful check (`Checker.commit`,
`rollback`).

## Recursion

V4 limits the call depth by a constant (640 on Windows, 1234 on Linux,
1000 on Android) rather than by the stack size.
`v4script::prepareProcess()` raises it to 10000 (`QV4_MAX_CALL_DEPTH`
before the first engine) and gives the main thread a 16 MB stack (a linker
flag of `V4Script` on Windows, `RLIMIT_STACK` on Linux). Measured: a
JavaScript frame takes about 300 bytes of C stack, a call through a
built-in function about 800; 10000 calls take up to 8 MB.

## Adding a language

1. `js/translator/<language>/`: parsing, checking, translation into `J.*`,
   run time; `T.languages.<id> = { id, name, createSession(env) }`, where
   the session is `{ runBlock(code, unit), describeError(error),
   deadlock() }`.
2. The adapter `js/adapters/<language>.js` -
   `T.createAdapter(host, T.languages.<id>)`.
3. An entry in [languages.json](../../languages.json): metadata with
   versions, `translator: true`, the files in load order, the adapter.
4. Samples `tests/samples/<language>/` with expectations, rows in
   [LanguagesTest.cpp](../../tests/LanguagesTest.cpp).
5. A reference page [docs/languages/<language>.md](../languages/README.md)
   and an internals page here; a line in the README tables.
