# Forth

Forth 2012 as in gforth: a cell is 64 bits, division rounds down (floored),
word names ignore the case of Latin letters. The program runs in an
interpreter of v4script, and every definition (`: name … ;`) is translated
into JavaScript at once - so defined words run fast. A program has its own
memory, like a real Forth system: `HERE`, `ALLOT`, `,`, `CREATE`, addresses
and bytes.

```forth
\ Squares of the numbers in a line of input, then a greeting of the host
create line 80 allot
: squares ( c-addr u -- )
  begin dup while
    0. 2swap >number 2swap drop dup * . 
    dup if 1 /string then
  repeat 2drop ;
line 80 accept line swap squares cr
s" Ann" greet type cr
6 7 *
```

Input `3 4 5` prints `9 16 25`, then `Hello, Ann!`; the value of the run is
`<1> 42`.

## A unit is text for the interpreter

 - A unit runs as a file in gforth: words in order, line by line. Numbers
   go onto the stack, words run, and between `:` and `;` they are compiled
   into a new word.
 - **The value of a unit** is what is left on the stack, as `.S` prints it:
   `<3> 1 2 3`; if the float stack is not empty, also `F: <1> 2.5`. An
   empty stack is no value.
 - **Every run** starts with empty stacks, decimal `BASE` and the default
   search order. The stack does not pass between units - words and
   variables do.
 - **Shared words.** Words, variables and memory of one unit are visible in
   the other Forth units. Running a unit again defines its words again: a
   new word hides the old one of the same name, and words compiled before
   still call the old one (that is how Forth works). After changing a word,
   run again the units that use it.
 - A definition not finished at the end of a unit is the error
   `Unfinished definition: name (no ;)`.

## Numbers

 - **A cell** is a signed 64-bit integer; overflow wraps modulo 2^64
   (`21 fact .` gives a negative number, as in gforth). `/`, `MOD`, `/MOD`,
   `*/` round down: `-7 2 /` is `-4`.
 - **Double** numbers are two cells, 128 bits: `D+`, `D.`, `M*`,
   `UM/MOD`, `<# # #S #>` and others.
 - **Number literals**: in the current base (`DECIMAL`, `HEX`,
   `n BASE !`), `$FF` hexadecimal, `#99` decimal, `%1010` binary, `'A'` a
   character code (`'я'` is 1103), `12.` and `1.5` a double number, `1e`,
   `2.5e3`, `-1.5E-2` a float (decimal base only).
 - **Floats** are doubles on a separate stack; `F.` prints up to 15
   significant digits (`SET-PRECISION` changes it), `FS.` and `FE.` with an
   exponent.

## Memory and strings

 - The dictionary (what `CREATE`, `VARIABLE`, `ALLOT`, `,` take) is up to
   8 MB (`UNUSED` tells what is left), the heap `ALLOCATE`/`FREE`/`RESIZE`
   up to 500 MB. An access outside the memory is the error
   `Invalid memory address`. Cells can be read and written at misaligned
   addresses.
 - A string is an address and a length, characters are UTF-8 bytes:
   `S" привет" NIP .` is 12. `CHAR` and `'я'` give the Unicode code, and
   `EMIT` prints a character with a code above 255 whole (bytes 128…255 go
   as they are and form UTF-8 characters).
 - `S"` outside a definition puts the string into a transient buffer: it
   lives until 16 more such strings appear. Strings in definitions are
   permanent.

## What is supported

| Word set | What is there |
| --- | --- |
| Core | arithmetic and comparison (`+ - * / MOD /MOD */ */MOD NEGATE ABS MIN MAX 1+ 1- 2* 2/ LSHIFT RSHIFT AND OR XOR INVERT = <> < > U< U> 0= 0<> 0< 0> WITHIN`), the stack (`DUP DROP SWAP OVER ROT -ROT NIP TUCK PICK ROLL ?DUP DEPTH 2DUP 2DROP 2SWAP 2OVER 2ROT`), the return stack (`>R R> R@ 2>R 2R> 2R@ RDROP`), memory (`@ ! C@ C! +! 2@ 2! W@ W! L@ L! CELLS CELL+ CHARS CHAR+ ALIGNED ALIGN HERE ALLOT , C, PAD UNUSED MOVE CMOVE CMOVE> FILL ERASE BLANK COUNT`), output (`. U. .R U.R ? EMIT TYPE CR SPACE SPACES ." .( .S`), pictured output (`<# # #S #> HOLD HOLDS SIGN`), `BASE DECIMAL HEX >NUMBER` |
| Definitions | `: ; :NONAME RECURSE EXIT IMMEDIATE CREATE DOES> VARIABLE 2VARIABLE CONSTANT 2CONSTANT VALUE 2VALUE TO +TO DEFER IS ACTION-OF DEFER@ DEFER! BUFFER: MARKER SYNONYM ' ['] EXECUTE COMPILE, POSTPONE [COMPILE] LITERAL 2LITERAL SLITERAL [ ] STATE >BODY`; quotations `[: … ;]`; structures `BEGIN-STRUCTURE END-STRUCTURE +FIELD FIELD: CFIELD: FFIELD:` |
| Control | `IF ELSE THEN`, `BEGIN UNTIL`, `BEGIN WHILE REPEAT` (several `WHILE`s too), `BEGIN AGAIN`, `DO ?DO LOOP +LOOP I J K LEAVE UNLOOP`, `CASE OF ENDOF ENDCASE`, `AHEAD CS-PICK CS-ROLL`, `[IF] [ELSE] [THEN] [DEFINED] [UNDEFINED]` |
| Exceptions | `CATCH THROW ABORT ABORT"` |
| Locals | `{: a b \| c -- d :}`, `{ a b -- c }` (as in gforth, `F:` before a name makes it a float), `LOCALS\| b a \|`; `TO` and `+TO` change them |
| Double | `D+ D- D. D.R UD. DNEGATE DABS D2* D2/ D< D= D0= D0< DU< DMAX DMIN M+ M* UM* UM/MOD FM/MOD SM/REM M*/ S>D D>S 2CONSTANT 2VARIABLE` |
| Floating | `F+ F- F* F/ F** FNEGATE FABS FSQRT FLOOR FROUND FTRUNC FMAX FMIN F< F> F= F0< F0= F~`, functions (`FSIN FCOS FTAN FASIN FACOS FATAN FATAN2 FSINCOS FEXP FEXPM1 FLN FLNP1 FLOG FALOG FSINH FCOSH FTANH` and the inverse ones), the stack (`FDUP FDROP FSWAP FOVER FROT FNIP FTUCK FPICK FDEPTH`), memory (`F@ F! SF@ SF! DF@ DF! FLOATS FLOAT+ FALIGNED`), `FVARIABLE FCONSTANT FVALUE FLITERAL S>F F>S D>F F>D >FLOAT REPRESENT F. FS. FE. F.S PRECISION SET-PRECISION PI` |
| Strings | `S" S\" C" COMPARE SEARCH /STRING -TRAILING TOUPPER` |
| Parsing | `PARSE PARSE-NAME WORD CHAR [CHAR] SOURCE SOURCE-ID >IN REFILL SAVE-INPUT RESTORE-INPUT EVALUATE FIND FIND-NAME ( \` |
| Word lists | `WORDLIST FORTH-WORDLIST GET-ORDER SET-ORDER GET-CURRENT SET-CURRENT DEFINITIONS ALSO ONLY PREVIOUS FORTH >ORDER VOCABULARY ORDER SEARCH-WORDLIST TRAVERSE-WORDLIST NAME>STRING NAME>INTERPRET NAME>COMPILE` |
| Heap | `ALLOCATE FREE RESIZE` |
| Time and more | `MS TIME&DATE UTIME PAGE` (clears the output), `WORDS DUMP ENVIRONMENT? BYE QUIT LATESTXT`; `random.fs` compatible with gforth's (`seed`, `rnd`, `random`; the same numbers) - `REQUIRE random.fs` |

 - `BYE` and `QUIT` end the run without an error.
 - **Input**: `KEY` takes the bytes of the current line of standard input
   (UTF-8, the line break as 10) and 4 at the end of input; `KEY?` is true
   while input is ready; `ACCEPT` takes the rest of the line or the next
   one (0 at the end of input). `AT-XY` does nothing.
 - **Missing**: Forth blocks and files (the Block and File word sets: only
   host files can be included), `SEE`, `N>R`/`NR>`, xchar words except
   `XEMIT`, the `0x` prefix.

## Errors

An error comes with the line in the unit: inside a word - the line of the
definition where it happened, otherwise the line the interpreter ran. The
texts are those of gforth:

| Message | When |
| --- | --- |
| `Undefined word: name` | no such word and not a number |
| `Interpreting a compile-only word: name` | `IF`, `DO`, `>R` and the like outside a definition |
| `Stack underflow`, `Stack overflow` | the stack is empty or full (checked after every word of the interpreter and in loops) |
| `Division by zero` | division by zero |
| `Invalid memory address` | an address outside the program memory, `0 @` |
| `Return stack overflow` | recursion deeper than 10 000 calls (1000 on Android) |
| `Control structure mismatch` | `IF` without `THEN`, `;` inside a loop |
| the text of `ABORT"` | `ABORT"` with a true flag |
| `error n` | `n THROW` without `CATCH` |

`CATCH` catches system errors too, with the standard codes: `-10`
division by zero, `-9` an address, `-4` stack underflow, `-5` deep
recursion, `-13` an unknown word in `EVALUATE`; a JavaScript error is
`-256`.

## Waiting

`n MS` really waits n milliseconds: the run ends and the program goes on in
a timer of the engine (see [programs that wait](README.md#shared-rules)).
An unfinished output line goes to the host when the run or a step ends. A
word called through `EXECUTE`, `CATCH` or `DEFER` from a word compiled
before waiting words appeared waits in a busy loop.

## Modules

`INCLUDE name`, `S" name" INCLUDED` run a host file as the text of a unit;
`REQUIRE name` and `REQUIRED` do it only if the file was not included yet
(or has changed). An error inside a host file names it and its line.
A `random.fs` compatible with gforth's (the same numbers) is available
without a host file.

## JavaScript and host modules

A JavaScript value in Forth is a handle cell; it is kept in variables and
passed to the words below. Forth numbers go to JavaScript as numbers; a
string, a float and a flag are passed as handles (`s>js`, `js"`, `f>js`,
`flag>js`). `js-null` is the handle of `null`; 0 in place of an object is
`null` too.

| Word | Stack | What it does |
| --- | --- | --- |
| `js-global` | `( -- js )` | the JavaScript global object |
| `js-get` | `( js c-addr u -- js2 )` | a property |
| `js-set` | `( x js c-addr u -- )` | sets a property |
| `js-call` | `( x1 … xn n js c-addr u -- js2 )` | a method call with n arguments |
| `js-invoke`, `js-new` | `( x1 … xn n js -- js2 )` | a function call, `new` |
| `js-index`, `js-set-index` | `( js i -- js2 )`, `( x js i -- )` | an array element |
| `js-length` | `( js -- n )` | the length of an array or a string |
| `js-array` | `( x1 … xn n -- js )` | a new array |
| `js-object` | `( -- js )` | a new empty object |
| `js"` | `( "text" -- js )` | a JavaScript string (in a definition too) |
| `s>js`, `n>js`, `f>js`, `flag>js` | `( c-addr u -- js )`, `( n -- js )`, `( F: r -- js )`, `( flag -- js )` | a Forth value as JavaScript |
| `js>n`, `js>f`, `js>flag` | `( js -- n )`, `( js -- F: r )`, `( js -- flag )` | a number, a float, a flag |
| `js>s` | `( js -- c-addr u )` | a string (an object as JSON text) in a transient buffer |
| `js.` | `( js -- )` | prints the value and a space |
| `js-type` | `( js -- c-addr u )` | `number`, `string`, `object`, `null`… |
| `js-null?` | `( js -- flag )` | `null` or `undefined` |
| `js-null`, `js-undefined` | `( -- js )` | the handles of `null` and `undefined` |
| `js-function` | `( xt -- js )` | a Forth word as a JavaScript function |

The arguments of `js-call`, `js-array`, `js-set` are cells: a handle goes
as its value, anything else as a number. A function from `js-function`
puts its arguments onto the stacks (integers and booleans as cells, floats
onto the float stack, a string as an address and a length, an object as a
handle) and returns the top cell (a handle as its value) or the top float.

Drawing on a canvas that the application put into the global variable
`canvas` (as [examples/canvas](../../examples/canvas) does):

```forth
js-global s" canvas" js-get value canvas
js" 2d" 1 canvas s" getContext" js-call value ctx
js" red" ctx s" fillStyle" js-set
0 0 50 40 4 ctx s" fillRect" js-call drop
: square ( n -- n*n ) dup * ;
' square js-function js-global s" forthSquare" js-set   \ JavaScript: forthSquare(7)
```

**Host modules**: a function of a module `app` is the word `APP.NAME` with
the name in kebab-case (`app.is-even`) and, for a global module, `NAME`
(`is-even`) unless a word of that name exists. Parameters go on the stacks
in order: a string as an address and a length, a `number` on the float
stack, an integer and a flag as cells, a value as a handle (0 is `null`;
an optional value may be 0). The result comes back the same way:
`s" Ann" greet type`, `2e 3.5e app.add f.`, `4 is-even .`.

Shared rules: [languages](README.md#shared-rules). Internals:
[Forth in the translator](../internals/forth.md).
