# BASIC

BASIC in the style of QBasic and QuickBASIC 4.5, translated into JavaScript
by v4script. Programs with line numbers and `GOTO` from old books and
structured ones with `SUB`, `FUNCTION`, `SELECT CASE`, `DO … LOOP` and
`TYPE` records run as in QBasic: the same number format in `PRINT`,
`INTEGER` overflow, the same error messages, the same `RND` sequence. QBasic
graphics (`SCREEN 12`, `SCREEN 13`, `PSET`, `LINE`, `CIRCLE`, `PAINT`,
`DRAW`) draw on the canvas of the host.

```basic
' Prices: the total and the most expensive item
best$ = "": most = 0: total = 0
DO
    LINE INPUT "Item: "; item$
    IF item$ = "" THEN EXIT DO
    INPUT "Price"; price
    total = total + price
    IF price > most THEN most = price: best$ = item$
LOOP
PRINT USING "Total: #####.##"; total
PRINT "Most expensive: "; best$
PRINT GREET(best$)        ' a function of the host module "app"
```

## A unit is a part of the program

 - All BASIC units are one program. Code outside `SUB` and `FUNCTION` runs
   in order when the unit runs; procedures, `TYPE` records, `DEF FN`
   functions, constants and module-level variables are visible in the
   other BASIC units.
 - **Variables keep their values** between runs, as in one long program:
   `s = s + 1` adds one at every run. Set the initial value explicitly
   (`s = 0`) or reset the engine. A new variable is 0, an empty string or a
   record of zeros.
 - **Running a unit again** defines its procedures, records and `DEF FN`
   again: the new ones replace the old ones, `STATIC` variables of a
   procedure start from zero. If a procedure changed its parameters and a
   procedure of another unit calls it the old way, a call of the caller is
   the error `… calls …, which has changed: run its block again`: run that
   unit again.
 - A unit with a translation error changes nothing. A run-time error stops
   the program; what it assigned stays.
 - **A unit has no value** - only output.
 - `DEFINT A-Z` and the other `DEFtype`, `OPTION BASE` also act in the
   units that run later.
 - Names ignore case and may be non-Latin (`итог = 0`). QBasic keywords
   (`NAME`, `BASE`, `LINE`, `STRING`, `OBJECT`…) cannot be names.

## Numbers

| Type | Suffix | What it is |
| --- | --- | --- |
| `INTEGER` | `%` | an integer from −32768 to 32767 |
| `LONG` | `&` | an integer from −2147483648 to 2147483647 |
| `SINGLE` | `!` | a float with 7 significant digits (the default type) |
| `DOUBLE` | `#` | a float with 16 significant digits |
| `STRING` | `$` | a string; `STRING * n` - exactly n characters |
| `OBJECT` | - | a JavaScript value (see [below](#javascript-and-host-modules)) |

 - Going outside the type is the error `Overflow`, as in QBasic, not a
   silent wrap: `a% = 32767: a% = a% + 1`. The counter of
   `FOR i% = 1 TO 32767` overflows after the last step too.
 - A float to an integer rounds a half to even: `CINT(2.5)` is 2,
   `CINT(3.5)` is 4. `INT` rounds down, `FIX` drops the fraction.
 - A number without a suffix is `INTEGER` or `LONG` if it is an integer
   that fits, otherwise `SINGLE`, and with 8 or more digits or with `D` in
   the exponent `DOUBLE`: `1.5`, `1E10`, `1D10`, `12345678`. `&HFF`,
   `&O17`, `&B101` are hexadecimal, octal and binary.
 - `/` gives `SINGLE`, with `LONG` or `DOUBLE` - `DOUBLE`; `\` and `MOD`
   are integer (the operands are rounded). Computation goes in the type of
   the operands: `d# = 1 / 3` gives `.3333333432674408`, because `1 / 3`
   is computed in `SINGLE` (as in QBasic); `1# / 3` is
   `.3333333333333333`.
 - Comparisons give −1 (true) and 0; `AND`, `OR`, `XOR`, `EQV`, `IMP`,
   `NOT` are bitwise: `NOT 5` is −6.
 - `PRINT` prints a number with a space before it (or a minus) and a space
   after it: `PRINT 1; -2` is ` 1 -2 `. `SINGLE` has up to 7 digits,
   `DOUBLE` up to 16; with more digits it uses an exponent: `1E+07`,
   `1.234568E+07`, `1D+20`. A zero before the point is not printed: `.5`.
   `STR$` is the same without the space after.

## Strings

 - A string is Unicode text: `LEN("Привет")` is 6, `MID$`, `LEFT$`,
   `INSTR` count characters. `CHR$` and `ASC` work with Unicode codes:
   `CHR$(9608)` is █, `ASC("Ж")` is 1046 (in QBasic codes 128…255 are DOS
   box drawing; here frames are drawn with Unicode characters: `"╔══╗"`).
 - Strings compare by character codes: `"A" < "a"`.
 - `DIM s AS STRING * 10` is a string of exactly 10 characters: a longer
   one is cut, a shorter one padded with spaces. `MID$(s$, 2, 3) = "abc"`,
   `LSET` and `RSET` change a string without changing its length.

## What is supported

| Area | Statements |
| --- | --- |
| Output | `PRINT` (`;`, `,` - zones of 14 characters, `TAB(n)`, `SPC(n)`), `PRINT USING`, `WRITE`, `LPRINT` (to the output), `CLS` |
| Input | `INPUT` (with `Redo from start`), `LINE INPUT` |
| Branches and loops | one-line `IF … THEN … ELSE`, block `IF … ELSEIF … ELSE … END IF`, `SELECT CASE` (`CASE 1, 2`, `CASE 3 TO 5`, `CASE IS > 7`, `CASE ELSE`), `FOR … TO … STEP … NEXT` (and `NEXT j, i`), `DO … LOOP` with `WHILE`/`UNTIL` at the start or the end, `WHILE … WEND`, `EXIT FOR`, `EXIT DO` |
| Jumps | `GOTO`, `GOSUB … RETURN`, `RETURN label`, `ON n GOTO`, `ON n GOSUB`, line numbers and labels `name:`, `IF x THEN 100` |
| Procedures | `SUB … END SUB`, `FUNCTION … END FUNCTION`, `CALL`, `DECLARE`, `EXIT SUB`, `EXIT FUNCTION`, `STATIC`, `SHARED`, `DEF FNname … END DEF` and `DEF FNname(x) = …` |
| Data | `DIM`, `REDIM`, `REDIM PRESERVE` (and `_PRESERVE`), `ERASE`, `OPTION BASE`, `CONST`, `DIM SHARED`, `COMMON SHARED`, `DEFINT`, `DEFLNG`, `DEFSNG`, `DEFDBL`, `DEFSTR`, `TYPE … END TYPE`, `LET`, `SWAP`, `DATA`, `READ`, `RESTORE`, `RANDOMIZE` |
| Errors | `ON ERROR GOTO`, `ON ERROR GOTO 0`, `RESUME`, `RESUME NEXT`, `RESUME label`, `ERROR n`, `END`, `STOP`, `SYSTEM` |
| Graphics | `SCREEN`, `PSET`, `PRESET`, `LINE` (`B`, `BF`, a line style), `CIRCLE` (arcs, aspect), `PAINT`, `DRAW`, `COLOR`, `PALETTE`, `WINDOW` |
| Time | `SLEEP`, `_DELAY`, `_LIMIT`, `_DISPLAY` |
| Files | `OPEN … FOR INPUT`, `INPUT #`, `LINE INPUT #`, `CLOSE` |

| Area | Functions |
| --- | --- |
| Numbers | `ABS`, `SGN`, `INT`, `FIX`, `CINT`, `CLNG`, `CSNG`, `CDBL`, `SQR`, `SIN`, `COS`, `TAN`, `ATN`, `EXP`, `LOG`, `RND`, `TIMER`, `_PI`, `_ROUND` |
| Strings | `LEN`, `LEFT$`, `RIGHT$`, `MID$`, `INSTR`, `CHR$`, `ASC`, `STR$`, `VAL`, `UCASE$`, `LCASE$`, `LTRIM$`, `RTRIM$`, `_TRIM$`, `SPACE$`, `STRING$`, `HEX$`, `OCT$`, `_BIN$`, `DATE$`, `TIME$`, `MKI$`, `MKL$`, `MKS$`, `MKD$`, `CVI`, `CVL`, `CVS`, `CVD` |
| Other | `ERR`, `ERL`, `LBOUND`, `UBOUND`, `POS`, `INKEY$`, `INPUT$`, `FREEFILE`, `EOF`, `LOF`, `LOC`, `POINT`, `_RGB`, `_RGB32`, `_NEWIMAGE`, `_WIDTH`, `_HEIGHT` |

 - `RND` and `RANDOMIZE` give the same sequence as QBasic: the first `RND`
   without `RANDOMIZE` is `.7055475`. `RANDOMIZE` without a number is
   `RANDOMIZE TIMER`.
 - `LOCATE`, `WIDTH`, `SOUND`, `PLAY`, `BEEP`, `KEY`, `VIEW`, `POKE`,
   `OUT`, `WAIT`, `PCOPY`, `TRON`, `TROFF`, `DEF SEG`, `CLEAR`, and
   `COLOR` in text mode do nothing: the output has no cursor, colors or
   sound. `CSRLIN` is 1, `FRE` 524288, `PEEK` and `INP` 0,
   `SCREEN(r, c)` 32.

### PRINT USING

The format is a string with fields; the values fill them in order, and the
format repeats if there are more values than fields.

| Field | What it does |
| --- | --- |
| `###.##` | a number: digits before and after the point, rounded |
| `+` at the start or the end, `-` at the end | the sign of the number |
| `,` before the point | commas between thousands: `#,###,###` |
| `$$`, `**`, `**$` | a dollar sign before the number, asterisks instead of spaces |
| `^^^^` (`^^^^^`) | a number with an exponent: `##.##^^^^` gives ` 1.23E+04` |
| `!`, `\  \`, `&` | the first character of a string, as many characters as the field between the backslashes, the whole string |
| `_` | the next character as it is |

A number that does not fit the field is printed whole with `%` before it:
`%12345`.

## Procedures and variables

 - Module-level variables are visible in procedures only if declared with
   `DIM SHARED` (then in all of them) or listed in `SHARED` inside the
   procedure. Other variables of a procedure are its own and start from
   zero at every call; `STATIC` (of the whole procedure or of single
   variables) keeps them between calls.
 - **Parameters are passed by reference**: if an argument is a variable, an
   array element or a record field, the procedure changes it. An expression
   and a variable in parentheses (`CALL F((x))`, `Show (x)`) are passed by
   value. The type of a variable passed by reference must match the type
   of the parameter, otherwise it is `Parameter type mismatch`; an
   expression is converted to the type of the parameter.
 - An array is passed as `a()`: `FUNCTION Sum (arr())`,
   `PRINT Sum(a())`. A record goes by reference.
 - The result of a `FUNCTION` is an assignment to its name:
   `Square = x * x`. The name of the function inside it in an expression
   is a recursive call.
 - `DECLARE` is optional: a procedure can be called before its definition
   in the unit. A `SUB` without parameters may also be called by the line
   `Name:` at the start of a line if no jump goes to such a label.
 - `DEF FN` sees module variables; it is called from code outside
   procedures.
 - Recursion goes up to 10 000 nested calls (1000 on Android), deeper is
   `Out of stack space`.

## Arrays and records

 - `DIM a(10)` has the elements 0…10 (`OPTION BASE 1` - 1…10),
   `DIM b(1 TO 5, -2 TO 2)` has bounds and several dimensions. An array
   without `DIM` gets the bounds 0…10 at its first mention. An index out of
   the bounds is `Subscript out of range`.
 - `DIM` and `REDIM` create the array again (with zeros); `REDIM PRESERVE`
   keeps the elements. `ERASE` zeroes an array with constant bounds and
   frees an array with expression bounds.
 - `TYPE Point … END TYPE` is a record of fields `name AS type` (strings
   only as `STRING * n`, a field may be a record). `p.x`, `a(3).x`,
   `q = p` copies the fields.

## Errors

A run-time error comes with the line in the unit; inside a procedure - the
line of the procedure, inside a host file - its name and line. The texts
are those of QBasic:

| Message | When |
| --- | --- |
| `Overflow` | a number outside its type |
| `Division by zero` | division by zero (`/`, `\`, `MOD`) |
| `Subscript out of range` | an index outside the array bounds |
| `Illegal function call` | a wrong argument: `SQR(-1)`, `LEFT$(s$, -1)`, `CHR$(-1)` |
| `Type mismatch` | a string instead of a number and the other way round |
| `Out of DATA` | `READ` after the last `DATA` value |
| `RETURN without GOSUB` | `RETURN` without `GOSUB` |
| `Label not defined`, `Duplicate label` | a jump to a missing label; two equal labels |
| `Subprogram not defined`, `Argument-count mismatch`, `Parameter type mismatch` | a call of a missing procedure, with another number or type of arguments |
| `Duplicate definition` | the name is taken: `DIM` with another type, an array and a function with one name |
| `Block IF without END IF`, `FOR without NEXT`, `NEXT without FOR`… | unclosed and extra block ends |
| `Expected: …` | a syntax error: what was expected |
| `Out of stack space` | too deep recursion |

`ON ERROR GOTO label` traps run-time errors: `ERR` is the error code (6
`Overflow`, 9 an index, 11 division by zero, 5 `Illegal function call`…),
`ERL` the line number where it happened (0 without line numbers). `RESUME`
repeats the statement with the error, `RESUME NEXT` goes on with the next
one, `RESUME label` with the label, `ON ERROR GOTO 0` turns trapping off. An
error in a called procedure without its own handler is trapped at the line
of the call, and `RESUME NEXT` goes on after the call (in QBasic - after the
statement inside the procedure). `ON ERROR` traps a JavaScript error with
the code 5.

## Graphics

`SCREEN n` turns graphics on: the canvas of the host (`Host::canvas`) gets
the size of the screen and the drawing goes into its picture. What was
drawn appears when the run ends, at `SLEEP`, `_DELAY`, `_LIMIT`, and at
once with `_DISPLAY`. `SCREEN 0` turns graphics off. Without a host canvas
the program still runs and `POINT` reads its picture, but nothing is shown.

| Mode | Pixels | Colors | On the canvas |
| --- | --- | --- | --- |
| `SCREEN 1` | 320 × 200 | 4 | 640 × 400 |
| `SCREEN 2` | 640 × 200 | 2 | 640 × 400 |
| `SCREEN 7` | 320 × 200 | 16 | 640 × 400 |
| `SCREEN 8` | 640 × 200 | 16 | 640 × 400 |
| `SCREEN 9` | 640 × 350 | 16 | 640 × 350 |
| `SCREEN 11` | 640 × 480 | 2 | 640 × 480 |
| `SCREEN 12` | 640 × 480 | 16 | 640 × 480 |
| `SCREEN 13` | 320 × 200 | 256 (the VGA palette) | 640 × 400 |
| `SCREEN _NEWIMAGE(w, h, 32)` | w × h | any: `_RGB(r, g, b)` | w × h |

 - The colors of the 16-color modes are those of EGA/VGA: 0 black, 1 blue,
   2 green, 4 red, 14 yellow, 15 white. `COLOR c` sets the default color,
   `PALETTE number, 65536 * blue + 256 * green + red` (each 0…63) changes
   the color of a number and everything drawn with it; `PALETTE` restores
   the default palette.
 - Points, lines, circles, fills and `DRAW` give the same pixels as QBasic
   (checked against QB64-PE): `CIRCLE` uses the aspect of the screen,
   `DRAW` understands `U D L R E F G H M B N C S A TA P`.
 - `POINT(x, y)` is the color of a pixel (−1 outside the screen),
   `POINT(0)`…`POINT(3)` the last point. `WINDOW (x1, y1)-(x2, y2)` sets
   own coordinates (y goes up), `WINDOW SCREEN` - down.
 - `PRINT` prints to the output in graphics modes too, not onto the
   picture. `GET` and `PUT` (pictures in arrays), `VIEW`, `PAINT` with a
   pattern and `PCOPY` are not supported.
 - A canvas object can also be drawn on directly, as from JavaScript (an
   `OBJECT` with `getContext`, see below), but not together with `SCREEN`:
   the screen picture covers what was drawn.

## Waiting

`SLEEP n` (seconds) and `_DELAY n` (fractional seconds) really wait: the run
ends and the program goes on in a timer of the engine (see
[programs that wait](README.md#shared-rules)). `_LIMIT n` in a loop waits so
that the loop runs at most n times a second. `SLEEP` without a number (wait
for a key in QBasic) does not wait.

```basic
SCREEN 13
FOR x = 0 TO 300 STEP 2
    LINE (0, 0)-(319, 199), 0, BF
    CIRCLE (x, 100), 15, 14
    PAINT (x, 100), 4, 14
    _LIMIT 30
NEXT
```

## Input

 - `INPUT "prompt"; a, b$` prints the prompt (with `? ` after `;`), reads a
   line of standard input and splits it by commas; a wrong number of values
   or a string for a number prints `Redo from start` and reads again. At
   the end of input the values are 0 and empty strings.
 - `LINE INPUT` reads a whole line; `INKEY$` takes the next character of
   standard input (a line break is `CHR$(13)`, as the Enter key),
   `INPUT$(n)` n characters. At the end of input both give an empty
   string.

## Files and modules

 - `OPEN "name" FOR INPUT AS #1` opens a host file for reading;
   `INPUT #1, a, b$` reads values separated by commas (strings may be
   quoted), `LINE INPUT #1, s$` a line, `EOF(1)` tells the end of the
   file, `LOF(1)` the length. Files cannot be written: `OPEN … FOR OUTPUT`
   and `APPEND` are the error `Permission denied`. Open files are closed
   when the run ends.
 - `'$INCLUDE: 'name.bas'` (or `REM $INCLUDE: 'name.bas'`) inserts the text
   of a host file in place of the line: that is how shared procedures are
   included. An error inside the file names it and its line.

## JavaScript and host modules

A JavaScript value lives in variables of the type `OBJECT`
(`DIM t AS OBJECT`). Its properties and methods go after a dot: `t.title`,
`t.value("B2")`, `ctx.fillStyle = "red"`, `ctx.fillRect 0, 0, 50, 40` or
`ctx.fillRect(0, 0, 50, 40)`; `a(i)` of a JavaScript array is an element,
of a function a call. Member names keep their case, as in JavaScript.

| Name | What it gives |
| --- | --- |
| `JS` | the JavaScript global object: `JS.Math.max(1, 5)`, `JS.JSON.stringify(x)` |
| `JSARRAY(a, b, …)`, `JSOBJECT` | a new array, a new empty object |
| `JSNEW(constructor, arguments…)` | `new`: `JSNEW(JS.Map)` |
| `JSFUNCTION("name")` | a BASIC procedure as a JavaScript function |
| `JSNULL`, `JSUNDEFINED`, `JSISNULL(x)`, `JSTYPE$(x)` | `null`, `undefined`, the check, `typeof` |
| `CLEARCONSOLE` | clears the output (as `CLS`) |

 - Numbers and strings go to JavaScript as they are, a BASIC array as an
   argument (`a()`) as a JavaScript array, a record as an object with
   fields. Back, a JavaScript value in a numeric variable is a number
   (`true` is −1, a string with a number is that number, otherwise
   `Type mismatch`), in a string variable it is text; `PRINT` prints a
   JavaScript number as a BASIC number, anything else as the JavaScript
   console does.
 - These are names of the program, not keywords: a variable or an array
   named `js` hides them in its code.
 - `JS.name = JSFUNCTION("Square")` gives JavaScript a function
   `name(…)`: its arguments are converted to the parameter types of
   `Square`, and the result of the `FUNCTION` is returned.
 - **Host modules**: a module `app` is the object `APP`
   (`APP.greet("Ann")`, `APP.counter`). A global module's functions are
   also built-in functions with upper-case names (`GREET("Ann")`,
   `ISEVEN(4)`, `COUNTER` without parentheses for a getter) unless QBasic
   has the name (`LOG`, `POINT` stay QBasic's: use `APP.log`,
   `APP.point`). A function without a result is a statement:
   `APP.log "one"`. Integers are `DOUBLE`, flags are −1 and 0.

```basic
DIM canvas AS OBJECT, ctx AS OBJECT
canvas = JS.canvas         ' a canvas the application put into a global variable
ctx = canvas.getContext("2d")
ctx.fillStyle = "orange"
ctx.fillRect 10, 10, 120, 80
PRINT JS.Math.max(1, 5); JSTYPE$(ctx)
```

## Differences from QBasic

 - Missing: writing files, `GET`/`PUT`, `FIELD`, `CHAIN`, `SHELL`, `RUN`,
   the events `ON TIMER` and `ON KEY`, sound, the text screen (`LOCATE`,
   `COLOR`, `SCREEN(r, c)`), `VARPTR`, `PEEK`/`POKE` of memory.
 - Strings longer than 32767 characters and arrays larger than 64 KB, which
   QBasic did not allow, work here.
 - The output does not wrap lines at the 80th column, and `,` zones go past
   the 80th column.
 - `ON ERROR` and `RESUME` for an error in a procedure work as in Visual
   Basic (see [Errors](#errors)).

Shared rules: [languages](README.md#shared-rules). Internals:
[BASIC in the translator](../internals/basic.md).
