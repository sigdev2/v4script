# C in the translator

What a user gets: [the C reference](../languages/c.md); the general
design: [the translator](translator.md). C runs over linear memory (bytes
in an `ArrayBuffer`), not over JavaScript objects: pointers, `union`,
casts and `memcpy` work as in real C.

| File | Role |
| --- | --- |
| [preprocessor.js](../../js/translator/c/preprocessor.js) | preprocessor tokens, directives, macro expansion with hidden names, `#`/`##`, `#if` on unbounded integers; parsing numbers and strings |
| [parser.js](../../js/translator/c/parser.js) | parsing C17 with a table of typedef names; a unit is a file that may have statements besides declarations |
| [types.js](../../js/translator/c/types.js) | LP64 types, the layout of structs and bit fields, promotions and the usual conversions |
| [checker.js](../../js/translator/c/checker.js), [expressions.js](../../js/translator/c/expressions.js) | checking declarations, initializers, statements and expressions, constant folding; messages as clang's |
| [runtime.js](../../js/translator/c/runtime.js) | `Memory`: memory views, the stack, the heap, address checks, function tables; `CError`, `CExit`, `va_*` |
| [codegen.js](../../js/translator/c/codegen.js), [codegen-statements.js](../../js/translator/c/codegen-statements.js) | translation into `J.*`: placing variables, loads and stores, pointer arithmetic, calls, functions, the unit |
| [format.js](../../js/translator/c/format.js), [libc.js](../../js/translator/c/libc.js), [jsapi.js](../../js/translator/c/jsapi.js) | `printf`/`scanf` as glibc; the functions of the standard library; `js_value` and host modules |
| [headers.js](../../js/translator/c/headers.js) | the texts of the built-in headers (declarations for `libc.js`), `js.h` and the headers of host modules |
| [language.js](../../js/translator/c/language.js) | the session: headers once, the shared scope, macros, addresses of globals, the run of a unit, the value of a unit |

## Memory

| Addresses | Contents |
| --- | --- |
| 0 … 4095 | the zero page: an access is `Segmentation fault (null pointer dereference)`; bytes 16…23 are a spare cell for misaligned access |
| 4096 … 4096 + 1 MB | the stack, growing down; a frame is `$M.enter(size)` (aligned to 16), the exit `$M.sp = $sp0` |
| above | the heap (`malloc` by size classes, free blocks in lists per class), static variables and strings (`allocateStatic`, never freed); the buffer doubles up to 512 MB |
| `0x40000000 + 16·n` | the address of function number `n` (outside the data memory) |
| `0x80000000 + 8·n` | the handle `js_value` number `n` (`jsapi.js`) |

 - A pointer is 8 bytes in memory, its value is the low 32 bits (a
   JavaScript number). An offset with a 64-bit index that goes beyond
   0…2^32 gives the address `0xFFFFFFFF` (`pointerOffset`): truncation to
   32 bits would land in other memory.
 - **The address check** in the code is one comparison:
   `((t = p) - 4096 | (t & 3) << 30) >>> 0 < $M.lim ? $M.I32[t >> 2] : $M.misaligned(t, 2)`.
   A misaligned address (the alignment bits go to the high bits) or one
   outside the memory goes to the slow branch: it throws or copies the bytes
   through the spare cell (x86 allows misaligned access, and programs read
   an `int` from a `char` buffer). Stores work the same way
   (`storeMisaligned`). Only an access to an own variable in the frame or
   in static memory goes without a check (`isDirect`).
 - **Variables.** A scalar whose address is never taken is a JavaScript
   variable (`let`); arrays and structs always live in memory, `va_list` is
   an object `{ v, t, i }`, everything whose address is taken lives in the
   frame (`frameOffset`) or in static memory. The value of a struct or an
   array in an expression is its address.
 - **Globals** with the same name and size from earlier units (and earlier
   runs) get the same address (`allocateObject`): old functions see the
   new variable. `errno`, `stdin`, `stdout`, `stderr` are addresses of the
   library.

## Functions and calls

 - A function is a number in two tables of `Memory`: `functions` (`$F`,
   called at once) and `generators` (`$G`, called through `yield*`).
   `$M.define` puts the function into both: a generator gets a wrapper in
   `$F` that runs it at once (`runNested`), a plain function gets a
   generator wrapper in `$G`. So code translated before a function became
   (or stopped being) a fiber keeps working.
 - A direct call is `$F[n](…)`, from a fiber to a fiber
   `yield* $G[n](…)`. Through a pointer `$M.callable(p)(…)`; in a fiber, if
   the session has a fiber whose address is taken (`asyncPossible`),
   `yield* $M.callableAsync(p)(…)`.
 - A fiber (`FunctionInfo.async`): the function calls `sleep`, `usleep`,
   `nanosleep` (`C.libcAsync`) or a fiber; a call through a pointer counts
   if `asyncPossible`. Computed as a fixed point over the functions of the
   unit (`computeAsync`).
 - A struct result is a hidden first parameter `$ret` (a place in the frame
   of the caller); a struct argument goes by address and the function copies
   it into its frame. Variable arguments are the last parameter
   `$va = { v, t }`: the values after promotion and their kinds (`i32`,
   `i64`, `u64`, `f64`, `ptr`; for natives also `str` - `char *`, `js` -
   `js_value`, `fn` - a function pointer, `bool`; `C.argumentTag`).
 - A function without a definition is a stub `undefined reference to 'f'`
   at the call: the definition may come in another unit.

## The session and the unit

 - The built-in headers (`C.implicitHeaders`) are parsed and checked once
   when the session is created (about 40 ms in V4) right into the shared
   scope; an `#include` of a built-in header in a unit inserts nothing
   (except `assert.h` - for `NDEBUG`). Natives are installed when a
   function is declared (`functionObject`) by its name in `libc.js`.
 - A unit is checked in its own scope (`Scope` with `kind: 'file'` over the
   shared one) and joins the shared scope only on success (`commitNames`);
   macros and functions are rolled back on an error (`snapshotFunctions`).
   One function object per name (its number in the tables is constant); a
   new definition replaces the function in the tables when the chunk runs.
 - The statements of a unit form the function `$block` (a top-level
   `FunctionInfo` without an object), its declarations are globals; `main`
   of the unit is called after them. The value is the last expression
   statement if there is no `main` (`isShownExpression`), shown through
   `$c.show` (`Session.show`: strings, structs as objects, arrays).
 - A chunk is `function ($c, $T, $D, $M, $F, $G)`: `$c` - helpers
   (`C.runtime` and `show`), `$D` - translation constants, `$M` - the
   memory.

## The library

 - Output is UTF-8 bytes: `OutputStream` collects a line up to `\n` and
   gives it to the writer decoded (a character split between `putchar`
   calls stays whole).
 - `printf` is `C.format` over `T.numbers`: the exact digits of a double
   and rounding half to even, as glibc; `rand` is the glibc algorithm
   (TYPE_3), the same numbers for the same `srand`. The expectations of the
   samples were checked with gcc (glibc) on Linux.
 - `qsort` is a stable merge sort over a copy (the comparison gets the
   addresses in the copy).
 - Files: `fopen` reads files of the host (read only); `stdin` reads the
   host input (`scanf`, `fgets`, `getchar` refill a buffer from
   `host.input` line by line).
 - `jsapi.js`: `js_value` handles are a table of values with lookup by
   value (`Map`), never freed before the end of the session. A C function
   in JavaScript is a wrapper that converts the arguments by the type of the
   function at the call (`Session.functionType`).
 - Host modules: a header `<name>.h` with `name_fn` for every function and
   the plain `fn` where the built-in headers do not declare that name
   (`C.hostHeader`); a global module's header is included implicitly.

## Known places

 - V4: `String.fromCharCode.apply(null, typed.subarray(a, b))` reads from
   the start of the buffer, not from `a` - bytes from memory go only through
   `Memory.bytes` (a plain array).
 - Missing: `goto` (no translation into structured code), `_Generic`,
   `setjmp`/`longjmp`, threads, `wchar.h`.
 - An access past the end of an array inside the program memory is not
   caught.
 - Measured (Windows, V4): a sieve up to 10^6, sorting 100 000 `int` and
   multiplying 64×64 matrices take 0.56 s (`tests/samples/c/algorithms.c`);
   the run of a unit with a new session takes about 0.09 s.
