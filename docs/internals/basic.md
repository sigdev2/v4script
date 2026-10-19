# BASIC in the translator

What a user gets: [the BASIC reference](../languages/basic.md); the
general design: [the translator](translator.md). The dialect is QBasic /
QuickBASIC 4.5 with a few QB64 extensions (`_DELAY`, `_LIMIT`, `_DISPLAY`,
`_NEWIMAGE`, `_RGB`, `_PRESERVE`). The reference of behavior is QBasic;
where it is not available, QB64-PE (see [Checking](#checking)).

| File | Role |
| --- | --- |
| [lexer.js](../../js/translator/basic/lexer.js) | tokens: keywords only without a suffix (`MID$` is a name), the type of a number by its notation, raw `DATA` values, `REM`/`'` and metacommands, `$INCLUDE` puts the tokens of a host file in place of the line |
| [parser.js](../../js/translator/basic/parser.js) | the tree: module statements with labels, procedures, `TYPE`, `DATA`; names are not resolved (`ref`) |
| [runtime.js](../../js/translator/basic/runtime.js) | `BasicError` with QBasic codes, numbers as text (`STR$`), `VAL`, `PRINT USING`, strings, records, `BArray` arrays, `Runtime` (`$B`): output with the cursor position, input, `RND`, time, `DATA`, waiting |
| [compiler.js](../../js/translator/basic/compiler.js) | scopes and name keys, module and procedure variables, expression types, arithmetic with checks, assignment places, procedure calls |
| [statements.js](../../js/translator/basic/statements.js) | statements into parts with labels and jumps, the GOSUB/ON ERROR state machine, files, graphics, assembling the chunk |
| [builtins.js](../../js/translator/basic/builtins.js) | built-in functions and call statements, host module functions as soft names |
| [jsapi.js](../../js/translator/basic/jsapi.js) | `OBJECT` values, host modules, `JSFUNCTION`, the error trap, GOSUB, files of the host |
| [graphics.js](../../js/translator/basic/graphics.js) | the screen: a frame buffer, the EGA/VGA palettes, PSET, LINE, CIRCLE, PAINT, DRAW, WINDOW, output to the canvas |
| [language.js](../../js/translator/basic/language.js) | the session: the program shared by units, translation and run, committing declarations |

## A program from units

 - A unit is a chunk `function ($B, $V, $P, $D)`: `$B` - the run time
   (`Runtime`), `$V` - the values of module variables (`v<type>_name`,
   arrays `a<type>_name`), `$P` - procedures (`p_name`, DEF FN `d_name`),
   `$D` - values of the translator (records, data), variables `$cN` in the
   chunk. The chunk returns `{ main, procs }`; the session commits the
   declarations (`commit`) before `main` runs, only if the translation
   succeeded (layers `Scope('layer')`, `Object.create` over the scope of
   the session).
 - **Module variables** are local copies in the main code: read from `$V`
   at the start, written back in `finally`; scalars need nothing else -
   procedures do not see them. Those visible to procedures (`DIM SHARED`,
   `SHARED` in any procedure, those mentioned in `DEF FN`) always go through
   `$V` (`session.shared`). Arrays (`BArray`) and records are objects that
   `DIM`, `REDIM`, `ERASE` and assignment change in place, so they can live
   in locals and be passed by reference.
 - The watchdog interrupts without `finally`: what an interrupted run
   assigned to module scalars is lost (variables visible to procedures are
   kept).
 - `DEFtype` and `OPTION BASE` carry over to the next units
   (`session.deftypes`); a procedure takes the module-level `DEFtype`s
   before it (`node.defs`).
 - **Procedure signatures.** Calls are checked at translation against the
   current signatures; a procedure remembers the signatures it called
   (`proc.calls`). If a unit changes a signature, procedures of other units
   translated against the old one are replaced by a stub with an error
   (`Session.invalidate`) - otherwise a call by reference would read wrong
   values.

## Translation

 - **Expression types**: `i l f d s o`, a record description or `b` - a
   JavaScript boolean (comparisons). `AND`/`OR`/`XOR`/`NOT` on `b` are
   bitwise on booleans without short-circuit evaluation (both sides are
   evaluated, as in BASIC); as a value - `-1`/`0`.
 - **Arithmetic.** `INTEGER`/`LONG` check the range in place
   (`(t = a + b) > 32767 || t < -32768 ? $B.ov() : t`); `SINGLE` is
   `Math.fround` after every operation. Float overflow (an infinity) is not
   checked in every operation but when the value leaves the arithmetic (the
   flag `u`, `$B.fin`): infinities and NaN pass through a chain of
   operations up to the check. `/` and `^` are `SINGLE`, with a `LONG` or a
   `DOUBLE` - `DOUBLE`.
 - **Constants fold** at translation; a folding error (division by zero,
   overflow) becomes a call `$B.e(code)` - `ON ERROR` can catch it.
 - **Parameters by reference** are copy-in/copy-out: before it returns a
   procedure puts its scalar parameters into `$B.o[i]`, the caller assigns
   them to the argument places (a variable, an element - its index is
   computed in advance, a field). The difference from a true reference shows
   only with aliased arguments (`F a, a`) and with a `SHARED` variable passed
   to a procedure. Arrays and records are objects and go by themselves.
 - **Waiting.** A procedure that waits (`SLEEP`, `_DELAY`, `_LIMIT`,
   `_DISPLAY`, `INPUT` is not one: input is synchronous) or calls one that
   waits is a generator (`computeAsync`, a fixed point over the calls of the
   unit). `$P.p_x` can always be called plainly (a waiting one through
   `runNested`), `$P.p_x.gen` is the generator for `yield*`.
 - **Host modules**: their functions are soft names in capitals (`GREET`,
   `ADD`), available while the translation unit has no assignment or `DIM`
   with that name (`unit.assigned`); the module object `APP` reaches every
   function (`APP.point`), including those named like QBasic functions. A
   `void` function is a statement.
 - A name with dots is a variable if it is declared so; otherwise the head
   is a record, an `OBJECT` or a module name and the rest are fields or
   members (`splitDotted`).
 - `Name:` at the start of a line is a label (as in QBasic), but if it is a
   `SUB` without parameters and nothing jumps to the label, it is a call (as
   in QB64).

## Jumps

 - Statements become parts `{ k: 's' | 'label' | 'goto' | 'dyn' }` (FOR,
   DO, IF, SELECT become labels and jumps too); from them
   [T.structure](../../js/translator/core/compiler.js) (shared with Forth)
   builds blocks with `break` and loops with `continue`, and a `switch`
   state machine when the areas overlap.
 - A translation unit with `GOSUB`/`RETURN` or `ON ERROR`/`RESUME` gets its
   own state machine at once (`Compiler.machine`): `RETURN` jumps to the
   number from the stack `$gs` (`dyn`). With `ON ERROR` every statement is a
   branch of its own (`$cur`), the body of the machine is in a `try`;
   `$B.trap` decides whether to catch (a handler exists and is not running
   yet) and sets `ERR`/`ERL`; `$rc`/`$rn` are the branches for `RESUME` and
   `RESUME NEXT` (the tables `next` and `erl` are chunk constants). An error
   from a called procedure is caught on the call statement.
 - `EXIT SUB`/`EXIT FUNCTION` jump to the last label of the translation
   unit, after which the parameters by reference are stored and `return $r`
   follows.

## Output, input and numbers

 - Numbers as text (`formatNumber`) and `PRINT USING` (`printUsing`) follow
   the algorithms of QB64 (`qbs_str`, `print_using`, MIT; see
   [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES.md)): 7 digits for
   `SINGLE`, 16 for `DOUBLE` with the QB64 rule "a 16th digit of 9 rounds to
   15"; `PRINT USING` works with the exact decimal digits of the binary
   value (`T.numbers.exactDigits`). `RND`/`RANDOMIZE` are the 24-bit
   generator of QBasic (`func_rnd`, `sub_randomize`).
 - The cursor position (`Runtime.column`) serves the `,` zones, `TAB`,
   `POS`; there is no line width (no wrapping at the 80th character).
 - `INPUT`, `LINE INPUT`, `INPUT$` and `INKEY$` read the host input line by
   line; at the end of input `INPUT` gets empty values and `INKEY$` an empty
   string.

## Graphics

 - `Screen` is a `Uint32Array` buffer (a color index, or RGB in mode 32), a
   palette and a dirty rectangle. Drawing goes to the buffer, the canvas
   gets it from `present()` at the end of a run and its steps and on
   `_DISPLAY`.
 - Lines (DDA in `SINGLE`), CIRCLE and DRAW follow QB64 (`qb32_line`,
   `sub_circle`, `sub_draw`): the pixels match QB64 (frame sums in the
   samples `graphics*.bas`). Coordinates are `SINGLE` rounded half to even.
 - A Qt Quick canvas: writing into `ImageData.data` is a C++ call per
   element (about 60 ms per million), so a frame is written in its own size
   and the zoom (SCREEN 13 is ×2) is done by `drawImage(picture, x, y, w,
   h)` - without smoothing. `putImageData(picture, x, y)` with three
   arguments draws nothing in Qt 6.4 - the form with a region is needed. A
   full SCREEN 13 frame takes about 10 ms, SCREEN 12 40 ms.

## Checking

 - The samples `tests/samples/basic/*` (the comment is `'`). Their
   expectations were checked with **QB64-PE 4.7.0** in WSL (built with
   `make OS=lnx BUILD_QB64=y`); a program is compiled with `$CONSOLE:ONLY`
   as the first line (`qb64pe -x file.bas -o file`). A run-time error of
   QB64 asks `Continue?` and loops on empty input - cut the output.
 - Where QB64 departs from QBasic, the expectations follow QBasic: in the
   console of QB64 `,` is one space instead of zones of 14, `TAB` goes one
   column further; QB64 does not check integer and float overflow (`INF`)
   and float division by zero; it computes constant expressions more
   exactly (`1 / 3` as `DOUBLE`); it does not know `DEF FN` and `PRESERVE`
   without the underscore. QB64 draws graphics into a `_NEWIMAGE` through
   `_DEST`/`_SOURCE` (there is no screen in console mode), printing goes
   after `_DEST _CONSOLE`.
 - Measured (Windows, V4): a sieve ×20, 2 million float operations,
   `fib(24)` and 10 000 string concatenations take 0.3 s together.

## Known places

 - Files are read only (host files); `GET`/`PUT` (files and graphics),
   `VIEW`, `PAINT` with a pattern, `PLAY`, the events `ON TIMER`/`ON KEY`
   are not supported.
 - `CLEAR` does nothing: the local copies of module variables of the main
   code would be written back.
 - An error in a procedure without its own handler returns to the handler
   of the caller at the call statement (as in Visual Basic) instead of
   continuing inside the procedure as QBasic does.
