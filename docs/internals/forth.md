# Forth in the translator

What a user gets: [the Forth reference](../languages/forth.md); the
general design: [the translator](translator.md). Forth is not a
translation of a whole file: a unit runs in a text interpreter written in
JavaScript (words may parse the input and run while compiling), and every
definition is translated into JavaScript at `;`. The reference of behavior
is gforth 0.7.3 on x86-64 (64-bit cells, floored division, error texts).

| File | Role |
| --- | --- |
| [runtime.js](../../js/translator/forth/runtime.js) | the memory map, `Memory` (cells, bytes, floats, the `ALLOCATE` heap), `ForthError` with a THROW code and its text, double numbers through `T.big`, float output (`F.`, `FS.`, `FE.`, `REPRESENT`) |
| [system.js](../../js/translator/forth/system.js) | `System` (one per session, `$F` in the code): stacks, the dictionary and word lists, input sources, the interpreter, numbers, the definition being compiled (`Definition`) and its control-flow stack, strings, output |
| [codegen.js](../../js/translator/forth/codegen.js) | translating a definition: operations - the virtual stack - labels and jumps - JavaScript structure (`T.structure` of `core/compiler.js`); the function of a word |
| [words-core.js](../../js/translator/forth/words-core.js) | words that translate into code (`prim`): arithmetic, stack, memory, output, doubles, floats; their `$F` helpers |
| [words-system.js](../../js/translator/forth/words-system.js) | words written in JavaScript (`native`): control structures and definitions (run while compiling), parsing, `CATCH`, word lists, strings, time, input (`KEY`, `ACCEPT`); `random.fs` (written anew, the generator of gforth's) |
| [jsapi.js](../../js/translator/forth/jsapi.js) | handles of JavaScript values, the `js-…` words and host modules |
| [language.js](../../js/translator/forth/language.js) | the session: running a unit as a fiber, the place of an error, the stack as the value of a unit |

## Values and memory

 - A cell is a `T.i64` (a number up to 2^53, an `Int64` beyond); a double
   number is two cells, its arithmetic is `T.big` modulo 2^128 (`cells`).
 - The stacks are the arrays `S`, `FS`, `R` of 65 536 cells with a reserve
   `STACK_GUARD` below: going below the bottom by a few cells reads zeros,
   not `undefined`. The data stack pointer is the parameter and the result
   of the function of a word (`function (sp) -> sp`), the float and return
   stack pointers are `$F.fp`, `$F.rp`.
 - The memory is one `ArrayBuffer` that grows as needed (up to 512 MB):

| Addresses | Contents |
| --- | --- |
| 0 … 4095 | inaccessible: `Invalid memory address` |
| 4096 … | `STATE`, `BASE`, `>IN`, `BLK`, `DPL`, the precision of `F.`; the `WORD` buffer, the `<# #>` buffer, `PAD` |
| 8 KB … 72 KB | the line the interpreter parses (`SOURCE`) |
| 72 KB … 136 KB | 16 transient strings of 4 KB (`S"` outside a definition, `JS>S`, `NAME>STRING`); longer ones go to the heap |
| 136 KB … 8 MB | the dictionary: `HERE`, `CREATE`, the string literals of definitions (as in gforth) |
| 8 MB … | the `ALLOCATE` heap (size classes, as `malloc` in C) |

 - xt and nt are one number: `2^32 + the word number` (`System.xts`). The
   handle of a JavaScript value is `2^48 + number` (0 is `null`).
 - Code does not live in the dictionary: `HERE` does not move while
   compiling, except for string literals. `MARKER` rolls back `HERE`, word
   lists and literals.

## The dictionary and the interpreter

 - `Word.kind`: `prim` (the translator expands the word into code itself),
   `native` (a JavaScript function working with `system.sp`), `colon`,
   `create` (`does` is the part after `DOES>`), `constant`, `value`,
   `defer`, `field`, `alias` (`SYNONYM`). The interpreter and `EXECUTE`
   call `word.fn`; a `prim` is translated once into a function of this one
   word for that (`System.prepare`, a `library` chunk).
 - A word list maps a key (Latin letters upper-cased) to words in order; a
   new word hides the old one, words compiled earlier keep the old function
   (binding at compile time, as in Forth). A repeated run of a unit hides
   nothing: "change the unit - run it" sees the old variables, as in other
   languages.
 - Input: a file (the unit, a host file) is read by lines, the current line
   is copied into the `SOURCE` buffer; an `EVALUATE` string is parsed in
   place. The source stack is not unwound on an error: `place()` finds the
   line and the file by it. `KEY`, `KEY?` and `ACCEPT` read the host input.
 - Before every run (`System.reset`): empty stacks, `STATE` 0, `BASE` 10,
   the search order `FORTH`.

## Translating a definition

 - Operations (`Definition.ops`): `lit`, `flit`, `call`, `label`, `goto`
   (`cond: 'zero'` - `0BRANCH`), `do`/`loop`, `leave`, `index`, `exit`,
   `local`, `to-local`, `does`, `code` (the word itself gives the
   translation, e.g. `TO`, `."`). Control words are immediate `native`
   words: they write labels and jumps and keep their own control-flow stack
   (`orig`, `dest`, `do`, `case`), not the data stack; `CS-ROLL`/`CS-PICK`
   work on it.
 - **The virtual stack** (`Lowering`): inside a part between labels the
   stack elements are literals and temporaries, shuffles (`DUP`, `SWAP`,
   `ROT`, `PICK` with a known depth) produce no code; cells of the real stack
   are read only when needed and written back only if they changed
   (`origin`). The stack goes into the array at the boundary of a part and
   before a call of another word; the return stack (`>R R>`) stays virtual
   even across calls. Comparison flags are boolean variables, `IF` checks
   them without `-1/0`.
 - Arithmetic is `T.ops` over `i64` (a fast branch on numbers), literals
   fold at translation (`fold`). `DO` indices are JavaScript variables
   (`$iN`, `$lN`): `I`, `J`, `K` are known while compiling, `UNLOOP` does
   nothing. `+LOOP` is `$F.plusLoop` (crossing the boundary between
   `limit - 1` and `limit`).
 - **Structure:** a backward jump is a `for (;;)` loop with `continue`, a
   forward one a labeled block with `break`; a block may start before the
   jump to enclose a loop that it leaves (several `WHILE`s, `LEAVE`). If the
   areas overlap (entering a loop in the middle through `AHEAD` and
   `CS-ROLL`) - a `switch` state machine by part number
   (`emitStateMachine`).
 - The stack is checked when a word is entered and at the start of every
   loop (`stackError`), and by the interpreter after every word
   (`checkStacks`): an endless loop that grows the stack does not eat the
   memory.
 - The chunk of a definition is `function ($F, $T, $D)`, the words it calls
   are functions from `$D` (variables `$cN`), recursion goes through the
   name `$self`.

## Waiting and fibers

 - `MS` is a `native` with a generator: the interpreter is a generator, a
   unit runs through `Scheduler.runMain`, a wait goes on in a timer of the
   host. A word is a generator if it calls a waiting word; `EXECUTE`,
   `CATCH`, `DEFER` in a generator are `executeGen`. They become so only
   when the xt of a waiting word has been taken (`System.anyAsync`):
   otherwise every word with `EXECUTE` would be a generator. A waiting word
   called from a plain one runs through `runNested` (a busy loop).
 - A definition started and not finished at the end of a unit is an error
   (`Session.runInput`); after an error or an interruption the definition
   being compiled is dropped (`abandonDefinitions`, `reset`).

## Errors and places

 - An error inside a translated word takes its place from the V4 stack
   (the line of the operation in the definition, a host file by the source
   of the chunk); otherwise (the interpreter, a system word run by the
   interpreter) it is the line the interpreter parsed (`Session.located`).
 - `CATCH` catches a `ForthError` (its code) and a V4 stack overflow (-5),
   restores the stack pointers, the input and the compilation state.

## Checking

 - The samples `tests/samples/forth/*` have expectations from the output
   of gforth 0.7.3 in WSL (`apt-get install gforth`,
   `gforth file.fs -e bye`); the Forth 2012 words that 0.7.3 lacks (`{: :}`,
   `+TO`, `BUFFER:`, `SYNONYM`, `FVALUE`, quotations) are in
   `forth2012.fs` with hand-written expectations.
 - Measured (Windows, V4): creating a session and a unit takes about
   0.05 s; a sieve of 8190 ×100, `fib 27`, a loop of 3 million steps and
   1 million float additions take 0.8 s together.

## Known places

 - Missing: `SEE`, `N>R`/`NR>`, the xchar words (except `XEMIT`), the Block
   and File word sets.
 - `1 64 LSHIFT` is 0 (gforth on x86 gives 1); `F.` of very large numbers
   is more exact than gforth (it prints `1e100` as `99999…`).
 - A `js-function` called from JavaScript while the program waits (`MS`)
   puts its arguments above `system.sp` - the stack top at the start of the
   word the interpreter ran, not inside the waiting word.
