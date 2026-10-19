# Pascal in the translator

What a user gets: [the Pascal reference](../languages/pascal.md); the
general design: [the translator](translator.md). The dialect is Free
Pascal 3.2.2 with `{$mode objfpc}{$H+}` by default; `{$mode tp}` and
`{$mode fpc}` give a 16-bit `Integer` and short strings. The reference of
behavior is the real `fpc` (see [Checking](#checking)) with 64-bit (x86_64)
arithmetic. All code is our own: the behavior of `fpc` was taken from its
output, not from its sources.

| File | Role |
| --- | --- |
| [lexer.js](../../js/translator/pascal/lexer.js) | tokens (names in lower case in `value`), strings as UTF-8 bytes with `#n`, nested comments, directives: conditional compilation and `{$I file}` here, switches (`$mode`, `$H`, `$I`, `$B`, `$C`, `$J`…) as `directive` tokens |
| [parser.js](../../js/translator/pascal/parser.js), [parser-statements.js](../../js/translator/pascal/parser-statements.js) | the tree: a program, a unit or a script (`uses`, `const`, `type`, `var`, routines and statements mixed), types, classes, statements, expressions with the precedence of FPC; a node keeps the switches of its place (`node.sw`) |
| [types.js](../../js/translator/pascal/types.js) | `Type` and the built-in types, ranges, sizes, zero values and copying (`zero`, `clone`, `assign`) |
| [format.js](../../js/translator/pascal/format.js), [fmtfloat.js](../../js/translator/pascal/fmtfloat.js) | numbers as text: `Write`/`Str` of reals, `Val`; `FloatToStrF`, `FloatToStr`, `FormatFloat`, `Format` (see [Number formatting](#number-formatting)) |
| [runtime.js](../../js/translator/pascal/runtime.js), [files.js](../../js/translator/pascal/files.js), [jsapi.js](../../js/translator/pascal/jsapi.js) | the run time `$R`: run-time errors, output, strings, sets, arrays, references, classes, `Random` (MT19937), files, standard input, JavaScript values, host modules |
| [compiler.js](../../js/translator/pascal/compiler.js) | scopes, declarations, types, routines, function contexts, assembling the chunk, waiting (`computeAsync`), units |
| [expressions.js](../../js/translator/pascal/expressions.js), [calls.js](../../js/translator/pascal/calls.js) | places (`Ref`), values (`Value`), conversions, arithmetic, comparisons, sets; calls, overloads, casts, members, indices |
| [classes.js](../../js/translator/pascal/classes.js) | classes and `object`: fields, method slots, properties, `inherited`, the constructor |
| [builtins.js](../../js/translator/pascal/builtins.js), [statements.js](../../js/translator/pascal/statements.js) | built-in routines; statements, `goto` through flattening |
| [system.js](../../js/translator/pascal/system.js), [language.js](../../js/translator/pascal/language.js) | the `System` scope, `TObject` in Pascal; the session: the program shared by units, Pascal units, committing declarations, error texts |
| `lib-*.js` | Pascal units: Pascal source plus JavaScript functions for `external` (SysUtils, Math, StrUtils, Classes, Contnrs, Crt, Graph) |

## A program from units

 - A unit of code is a chunk `function ($R, $V, $P, $D, $T)`: `$R` - the
   run time, `$V` - global variables (`name`, `unit$name` for a Pascal
   unit), `$P` - routines and classes, `$D` - values of the translator
   (types, descriptions). The chunk returns `{ procs, classes, main }`; the
   session commits the declarations before `main` runs and only after a
   successful translation: a `layer` over the `globalScope` of the session.
 - **Routine names in `$P` are fixed by signature** (`globalProcName`): a
   unit that runs again replaces the functions in place, and calls from
   other units go to the new ones. If the signature changes, the old name
   gets a stub with an error: a call with the old signature would read
   wrong arguments.
 - The variables of a unit get zeros at every run of it (`newGlobals`),
   then the values of their declarations - as in a program started again.
   The variables of other units stay.
 - `uses` collects in `session.usedUnits`; a Pascal unit is included once
   (its `initialization` runs the first time); a unit from a host file is
   translated again when its text changes.
 - The last expression statement of the main code is the value of the
   unit (`$value`, shown by `$R.show` according to the type).
 - Host modules are Pascal units (`Pascal.hostUnit` in jsapi.js): a global
   module is used implicitly through a hidden unit `name$global` that has
   only the functions not named like System routines; the qualifier
   `App.X` reaches the full unit.

## Values

 - Integers up to 32 bits are numbers with truncation; `Int64`/`QWord`
   are the hybrid (`T.i64`/`T.u64`), but **by ranges**: every `Value` has
   a range, and while it is within ±2^53 the arithmetic uses plain numbers
   without checks. `+ - * div mod` of integers are `Int64` (as FPC on
   x86_64), `and or xor not` and shifts keep the type of the operands,
   `shr` is logical. A narrow assignment target (`demand32`) turns `*`
   into `Math.imul`.
 - Constants are `T.big`; the type of a constant is the smallest that
   fits (as FPC), and the type of an expression depends on it. A real
   literal is `Single` if it is exact in it, otherwise `Double` or
   `Extended`. `Extended` is a double, but prints in the `Extended` format
   (21 digits); `Sin`, `Exp`… return `Extended`.
 - `Comp` and `Currency` are doubles that keep whole units (1 and 1/10000):
   an assignment rounds to a unit, a half to even (`Pascal.toUnits`). They
   are exact up to 2^53 units.
 - Strings are UTF-8 bytes in a JavaScript string; a `Char` is the code of
   a byte. `ShortString` is the same string, cut on assignment.
 - Sets are a bit mask number while the elements are below 32, otherwise
   an immutable array of 8 `int32`.
 - **Records and static arrays are objects with a constant identity**: an
   assignment copies the fields (`type.assign`), so a reference to a record
   (a `var` parameter, `with`, a pointer) stays valid. Numeric elements are
   typed arrays. A dynamic array is a JavaScript array, `nil` is empty.
 - A pointer to a record or an array is the object itself; to a simple
   variable a cell `{ v }` or a `Reference(object, key)`. A local variable
   becomes a cell only if its address is taken or it is passed as `var`
   (`finishLocals` rewrites the `J.id` nodes after the body is translated).
 - A `var` parameter is a pair (object, key); a record or an array is the
   object itself.
 - A lazy value: `Value.node` is an accessor on the prototype that makes the
   node on first use (`lazyNode`). Redefining a data property of every
   object as an accessor crashed V4 (see [V4 pitfalls](v4-pitfalls.md)).

## Classes

 - A class is a JavaScript constructor (`rt.defineClass`), fields are
   properties of the instance with names unique in the hierarchy. A
   virtual method is a shared slot of the prototype (`m$name$v<n>`),
   `override` writes into the slot of the ancestor; a non-virtual one is
   called as `K.prototype.slot.call(obj)` - so `obj.Free` on `nil` works as
   in FPC (chunks are `"use strict"`).
 - A constructor is `$R.alloc(K)`, the body, `AfterConstruction`; class
   methods live on `K` itself. `object` (TP) is a record with methods; a
   repeated `virtual` in a descendant overrides.
 - An exception is an object of a Pascal class (`$pascal`); `except` turns
   JavaScript errors into exceptions (`$R.exc`: a `TypeError` from `null` is
   216, a stack overflow 202). A run-time error with SysUtils loaded is an
   object of its class, otherwise `RunError`. `Halt` is not an error,
   `except` lets it pass.

## Translation

 - A routine that waits (`Delay`, `Sleep`) or calls one that waits is a
   generator (`computeAsync`); methods wait through `runNested`.
 - A routine with labels is flattened into parts (`flatten`) and
   assembled by `T.structure`, as in BASIC; without labels - ordinary
   loops with JavaScript labels for `Break`/`Continue` inside `case`.
 - Library units are Pascal text with `external;`: the JavaScript
   functions come from `natives(rt, session)` of the unit (overloads as an
   array by number), classes and exceptions are written in Pascal
   (`TStringList`, `Exception`). `System` (`TObject`) is translated when the
   session is created.
 - `Write` keeps the text of its arguments in `rt.pending` until the last
   one (`wpart`), as the buffer of a text file in FPC: the cursor of Crt
   moves when the whole statement is written, and the text before an error
   in an argument comes out with the next output.
 - Sorting in Classes (`TStringList.Sort`, `TFPList.Sort`) is a stable
   merge sort; FPC uses a quicksort with a random pivot, so equal items may
   come in another order, and FPC's sort also consumes `Random` numbers.

## Number formatting

Rules taken from the output of `fpc` 3.2.2 (probes of hundreds of
thousands of numbers, see [Checking](#checking)).

**The digit buffer** of a real for its type (`Pascal.realDigits`): the
exact decimal digits of the value cut to 10 (Single), 17 (Double) or 21
(Extended) significant digits and rounded half to even. The buffer ends
where the value ends; if rounding up carries, the zeros the carry leaves at
the end are dropped, while a zero digit of the value itself stays. `Comp`
and `Currency` take the digits of their integer number of units.

**Shorter output** rounds the buffer to n digits: a digit of 5 or more
rounds up; so does a 4 when at least three digits follow it, all but the
last two of them are 9 and the second to last is 8 or 9 (a buffer
`...4999...98` shows as `...5`). `Currency` and the second rounding of
`FormatFloat` use plain rounding.

**`Write(x)`, `Str`**: the exponent form `[sign or space]d.ddd…E±xxx` with
16 decimals for Double, 9 for Single, 20 for Extended, 18 for Comp and any
number (zeros) for Currency, the exponent with 3, 2, 4, 4 and 2 digits;
without a width it takes the full width (24, 16, 29, 27, 25). `x:w`
gives `w - (5 + exponent digits)` decimals, at least 1. `x:w:d` is the
fixed form; more than 216 decimals are cut, a text longer than 255
characters turns into the exponent form. `Nan`, `+Inf`, `-Inf` are padded
to the width. `Str` takes the width of an integer modulo 256 and limits the
width of a real to 255; `Write` pads to any width.

**`Val`**: integers skip spaces and tabs, accept a sign, the prefixes `$`,
`x`, `0x`, `%`, `&`, stop at a NUL, must fit 64 bits (Int64 for signed
decimals, QWord otherwise) and then wrap to the size of the variable; the
error code is the position of the bad character. Reals skip spaces, accept
`INF` and `NAN` in any case, a mantissa with an optional point and an
exponent; `1e` is an error at 3, `1e+` is 1.

**`FloatToStrF`**: precision is at least 2 and at most 17 (10 for
Single); ffGeneral switches to the exponent form when the integer part has
more digits than the precision or the value is below 0.00001; ffExponent
omits a zero exponent with 0 exponent digits; ffFixed and ffCurrency take
at most 18 decimals, ffNumber 17; a negative zero loses its sign except in
ffCurrency without decimals. `FloatToStr` is ffGeneral with 15 digits.

**`FormatFloat`**: 17 significant digits; a NaN acts as zero with the
exponent -32768 and an infinity has the exponent 32767 (so `0.00E+00`
shows `0.00E-32769`); a non-exponent section of a number with more than 18
integer digits falls back to the general format; an empty section uses
the general format; digits that are rounded away keep the leading zeros
of the number among the decimals (`#.##` of 0.0001 is `.00`). **`Format`**:
`%g` and `%e` take 17 digits by default, an unknown conversion letter
shows nothing, Cardinal goes as an Integer.

## Graph

[lib-graph.js](../../js/translator/pascal/lib-graph.js) draws into its own
frame buffer and puts it on the canvas (`putImageData`) at the end of a run
and before a wait. The algorithms are our own: Bresenham lines with
Cohen-Sutherland clipping to the viewport, midpoint ellipses, a scanline
polygon fill (even-odd), a span flood fill. Lines, rectangles, bars,
patterns, polygons, XOR and the placement of text match `ptcgraph` pixel
for pixel; curves are 8-connected where FPC draws 4-connected outlines, so
a few pixels of circles and arcs differ. The 8x8 font is that of QB64-PE
(MIT, see [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES.md)) and differs
from the font of FPC in some glyphs; the VGA palette is generated from the
levels of the VGA DAC.

## Checking

`fpc` 3.2.2 runs in WSL (Ubuntu) as a black box; a program is compared
with the output of `fpc -Mobjfpc -Sh`. The samples `tests/samples/pascal`
were made so: their expectations are the output of `fpc`. Number
formatting was checked with probes of real numbers (`Write`, `Str`, `Val`,
`FloatToStrF`, `FormatFloat`, `Format`) against `fpc` output with zero
differences. Graph was compared pixel by pixel with `ptcgraph` running
under Xvfb (`GetPixel` dumps of every figure). The remaining differences
are listed in [the Pascal reference](../languages/pascal.md#differences-from-free-pascal).
