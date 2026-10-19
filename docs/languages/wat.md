# WebAssembly (WAT)

WebAssembly 2.0 in the text format (WAT): modules with functions, linear
memory, tables and globals, and the commands of `.wast` test scripts
(`invoke`, `assert_return`…), translated into JavaScript by v4script (the
engine has no WebAssembly of its own). Results match real WebAssembly
engines: `i64` is an exact 64-bit integer, `f32` is rounded to single
precision, an access outside memory and division by zero are traps with the
texts of the specification. A WASI program built by a compiler prints to
the output and reads standard input.

```wat
;; Squares of the numbers to the output, their sum as the value of the run
(module
  (import "console" "log" (func $log (param i32 i32)))
  (func (export "main") (result i32)
    (local $i i32) (local $sum i32)
    (loop $next
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (call $log (local.get $i) (i32.mul (local.get $i) (local.get $i)))
      (local.set $sum (i32.add (local.get $sum) (i32.mul (local.get $i) (local.get $i))))
      (br_if $next (i32.lt_u (local.get $i) (i32.const 5))))
    (local.get $sum)))
```

Output: the lines `1 1`, `2 4` … `5 25` and the value `55`.

## A unit holds modules and commands

A unit holds modules and commands in order, as a `.wast` file:

| Form | What it does |
| --- | --- |
| `(module $name? field…)` | a module: it is instantiated and becomes the current one |
| fields without `(module …)` | `(func …)`, `(memory …)` and other fields in a row are a module too, as in a `.wat` file |
| `(module $name? binary "\00asm…")` | a module in the binary `.wasm` format: bytes as strings with `\hh` |
| `(module $name? quote "…")` | a module as text in strings |
| `(invoke $name? "function" argument…)` | calls an export; arguments are `(i32.const 5)`, `(f64.const 1.5)`, `(ref.null extern)` |
| `(get $name? "global")` | the value of an exported global |
| `(register "name" $name?)` | gives a module a name for `import` |
| `(assert_return (invoke …) result…)` | checks the results; `(f32.const nan:canonical)` and `nan:arithmetic` match any NaN |
| `(assert_trap (invoke …) "text")` | expects a trap; `(assert_trap (module …) "text")` a trap while instantiating |
| `(assert_exhaustion (invoke …) "text")` | expects call stack exhaustion |
| `(assert_invalid (module …) "text")`, `(assert_malformed …)`, `(assert_unlinkable …)`, `(assert_uninstantiable …)` | expects a validation, parse, link or instantiation error |

 - `$name` in a command is the module with that name, no name means the
   last module created (in this or another unit).
 - **The value of a unit** is the result of its last command if it is
   `invoke` or `get`. The results of other `invoke`s are printed as lines;
   several results are separated by spaces: `7 49`. If there are no
   commands and the module exports a function `_start` or `main` without
   parameters, it runs and its result is the value of the unit.
 - Numbers are shown as WebAssembly sees them: `i32` and `i64` signed
   (`-1`, not `4294967295`), `f32` in the shortest single precision form
   (`0.3`), `nan`, `inf`, `-0`.
 - **Assertions** `assert_*` are silent when they pass; a failed one is an
   error at the line of the command:
   `assert_return: got 5, expected (i32.const 6)`.
 - **A translation error** in any module of the unit is reported before the
   unit runs: then no command runs.

### Shared modules

 - A named module - `(module $math …)` - is imported by other units (and by
   modules below it in the unit) under that name without `$`:
   `(import "math" "add" …)`. `(register "name")` names a module without a
   name too.
 - Running a unit again creates its modules again: memory, tables and
   globals start from their initial values, and the name refers to the new
   module. Modules that imported it already keep the old one.
 - Exported functions are visible to JavaScript too - see
   [below](#exports-to-javascript).

## What is supported

 - **All of WebAssembly 2.0 except SIMD**: the types `i32 i64 f32 f64
   funcref externref`; control `block loop if br br_if br_table return call
   call_indirect unreachable nop drop select`; multiple results of functions
   and blocks, blocks with parameters; all numeric instructions, including
   `i32.extend8_s` and the like, `trunc_sat`; memory (`load`, `store` of
   all widths, `memory.size`, `memory.grow`, `memory.fill`, `memory.copy`,
   `memory.init`, `data.drop`); references (`ref.null`, `ref.is_null`,
   `ref.func`), multiple tables and `table.get/set/size/grow/fill/copy/init`,
   `elem.drop`; mutable and immutable globals; `start`; import and export
   of functions, memories, tables, globals; passive and declarative
   segments.
 - **The whole text format**: folded `(i32.add (…) (…))` and flat
   instructions, names `$x` instead of indices, block labels, inline
   `(export …)` and `(import …)` in fields, `(table funcref (elem …))`,
   `(memory (data …))`, `offset=` and `align=`, the numbers `0x1F`,
   `1_000`, `0x1.8p3`, `inf`, `nan:0x200000`, strings with `\n`, `\hh`,
   `\u{…}`, comments `;;` and `(; ;)`.
 - **Numbers**: `i32` and `i64` wrap modulo 2^32 and 2^64; `f32` and `f64`
   follow IEEE 754 (min, max, nearest, copysign as the specification
   says); decimal and hexadecimal float literals are rounded exactly.
 - **Memory** has pages of 64 KB, up to 8192 pages (512 MB): `memory.grow`
   beyond that returns -1. The byte order is little-endian, misaligned
   access is allowed.

## What is missing

 - SIMD (`v128`) and the WebAssembly 3.0 proposals: tail calls
   (`return_call`), exceptions (`try_table`, `throw`), GC (`struct`,
   `array`), typed function references, multiple memories, `memory64`,
   extended constant expressions; threads and atomics; annotations `(@…)`.
 - **NaN without sign and payload**: every NaN is the same one, so
   `i32.reinterpret_f32` of a NaN with special bits and `copysign` with the
   sign of a NaN give other results than the specification. All other
   numbers are exact.
 - An `i64` that goes to JavaScript becomes a plain number: beyond 2^53 it
   is rounded.
 - A binary `.wasm` host file is not loaded (host files are text); write a
   binary module as `(module binary "…")`.

## Output and input

 - **WASI**: `fd_write` to stream 1 prints to standard output, to stream 2
   to standard error (see [WASI](#wasi)). A line goes to the host when its
   end is printed.
 - **JavaScript**: `console.log` and other functions by import:
   `(import "console" "log" (func $log (param i32)))`; several arguments
   are printed separated by spaces.
 - **spectest** is the module of the specification tests: `print_i32`,
   `print_i64`, `print_f32`, `print_f64`, `print_i32_f32`, `print_f64_f64`
   print `value : type` (`666 : i32`); also `print`, the globals
   `global_i32` (666), `global_i64`, `global_f32`, `global_f64` (666.6),
   the table `table` (10…20) and the memory `memory` (1…2 pages).
 - **Input**: WASI `fd_read` from stream 0 gives the bytes of the next line
   of standard input (with its line break); 0 bytes at the end of input.

## WASI

The modules `wasi_snapshot_preview1` (and the old name `wasi_unstable`) are
for programs built from C, Rust and other languages. The memory of the
program is its export `memory` (or its first memory).

| Function | What it does |
| --- | --- |
| `fd_write` | output to streams 1 and 2; others give `EBADF` (8) |
| `fd_read` | stream 0 reads standard input of the host |
| `fd_close`, `fd_seek`, `fd_fdstat_get`, `fd_fdstat_set_flags` | for streams 0-2 as for a terminal |
| `fd_prestat_get`, `fd_prestat_dir_name` | `EBADF`: no open directories |
| `args_sizes_get`, `args_get` | one argument - `main` |
| `environ_sizes_get`, `environ_get` | an empty environment |
| `clock_res_get`, `clock_time_get` | clocks in nanoseconds: 0 is UTC time, 1-3 count from the start of the session |
| `random_get` | random bytes |
| `sched_yield` | does nothing |
| `proc_exit` | the end of the program: code 0 without an error, otherwise the error `exit status N` |

Other WASI functions (files, sockets, `poll_oneoff`) can be imported but
return `ENOSYS` (52).

## JavaScript and host modules

An import is looked up in this order:

1. a module of the units with this name (`$math` or `register`);
2. the built-in modules `wasi_snapshot_preview1`, `spectest`, `js`, `'`,
   `wasm:js-string` and the host modules of the application (`"app"`);
3. a path in the JavaScript global object: `"console"` is `console`,
   `"Math"` `Math`, `"globalThis"` the global object itself (functions
   defined by JavaScript are there), a dotted path `"JSON"`, `"app.tools"`;
4. the host file `name.wat` (see [modules](#modules)).

A JavaScript function is called with `this` set to the object it lives in.
It can be imported several times with different types. A JavaScript value
imported as a `global` is an immutable global:
`(import "Math" "PI" (global $pi f64))`.

**Values at the boundary** are converted by the types of the declaration:

| Type | WebAssembly → JavaScript | JavaScript → WebAssembly |
| --- | --- | --- |
| `i32` | a signed number | `Number(x) \| 0`: `true` is 1, `"12"` is 12, `undefined` is 0 |
| `i64` | a number (rounded beyond 2^53) | the integer part modulo 2^64; a non-number is 0 |
| `f32`, `f64` | a number | `Number(x)`; `f32` is rounded |
| `externref` | the value as it is, `ref.null extern` is `null` | the value as it is |
| `funcref` | a JavaScript function (arguments and result by this table) or `null` | a WebAssembly function or `null`, otherwise an error |

A JavaScript function returns several results as an array.

### Strings and JavaScript values

A JavaScript value (an object, a string, a canvas) is kept in an
`externref`: in locals, globals and `externref` tables. A string constant
comes from the module `'` - the import name is the string:

```wat
(import "'" "Prices" (global $prices externref))
```

`wasm:js-string` gives the built-in string functions of JavaScript (the JS
String Builtins proposal): `length`, `charCodeAt`, `codePointAt`, `concat`,
`substring`, `equals`, `compare`, `fromCharCode`, `fromCodePoint`, `test`,
`cast`. The types are those of the proposal, with `externref`:
`(import "wasm:js-string" "concat" (func (param externref externref) (result externref)))`.

The module `js` has helpers; the import declares the types of the
parameters and the result:

| Function | What it does |
| --- | --- |
| `global` | the JavaScript global object |
| `get` (object, key) | a property |
| `set` (object, key, value) | sets a property |
| `call` (object, key, arguments…) | a method call with any number of arguments |
| `invoke` (function, arguments…), `new` (constructor, arguments…) | a function call, `new` |
| `index` (object, i), `set_index` (object, i, value) | an array element |
| `length` (value) | the length of an array or a string |
| `array` (values…), `object` () | a new array, a new empty object |
| `string` (address, length) | a JavaScript string from UTF-8 bytes of the module memory |
| `write_string` (string, address, capacity) | a string into memory as UTF-8 bytes (at most the capacity); the result is how many bytes it needs in all |
| `typeof` (value) | `"number"`, `"string"`, `"object"`, `"null"`… |
| `equals` (a, b) | `a === b` |

**Host modules** are imported by their name with the JavaScript names of
the functions: `(import "app" "greet" (func $greet (param externref)
(result externref)))`, `(import "app" "isEven" (func (param i32) (result
i32)))`. A getter is a function without parameters. Strings go as
`externref`; the types of the import convert the values by the table above.

```wat
;; Sum of the numbers of a JavaScript array: app.range(5) is [0, 1, 2, 3, 4]
(module
  (import "app" "range" (func $range (param i32) (result externref)))
  (import "js" "length" (func $length (param externref) (result i32)))
  (import "js" "index" (func $item (param externref i32) (result f64)))
  (func (export "main") (result f64)
    (local $list externref) (local $i i32) (local $sum f64)
    (local.set $list (call $range (i32.const 5)))
    (block $done
      (loop $next
        (br_if $done (i32.ge_u (local.get $i) (call $length (local.get $list))))
        (local.set $sum (f64.add (local.get $sum) (call $item (local.get $list) (local.get $i))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $next)))
    (local.get $sum)))
```

### Exports to JavaScript

 - An exported function becomes a function of the global object:
   `(func (export "square") …)` is `square(7)` in JavaScript. A name taken
   by something else (`print`, a JavaScript variable) is not replaced.
 - A module named `$math` is also an object `math` with all its exports:
   functions, memory (`math.memory.buffer` is an `ArrayBuffer`), globals
   (`math.counter.value`), tables.
 - Arguments and results are converted by the table above; several results
   come as an array. A trap inside is a JavaScript exception with its
   text.

## Modules

An import from a module that is neither in the units nor built in loads the
host file `name.wat`: `(import "mathx" "triple" …)` loads `mathx.wat`. It
holds module fields or modules (the last one is used), without script
commands. The host file is loaded again at every run of the unit; an error
in it names it and its line.

## Errors

An error comes with the line in the unit (or the host file); a trap with
the line of the instruction where it happened. The texts are those of the
WebAssembly specification:

| Message | When |
| --- | --- |
| `unknown operator i32.plus`, `unexpected token …`, `unexpected end` | an error in the text of a module |
| `unknown local $x`, `unknown function $f`, `unknown label $l`, `duplicate func $f` | a name is not found or repeated |
| `constant out of range`, `alignment must be a power of two` | a number does not fit its type, a wrong `align=` |
| `type mismatch` | the types on the stack are not those an instruction, a block or a function needs |
| `unknown function 5`, `unknown global 2`, `unknown memory 0`, `unknown table 1`, `unknown type 3` | an index out of range |
| `global is immutable`, `alignment must not be larger than natural`, `duplicate export name`, `undeclared function reference` | other validation errors |
| `unknown import "m" "f"`, `incompatible import type` | no such import or it has another kind or type |
| `unreachable` | `unreachable` ran |
| `integer divide by zero`, `integer overflow` | division by zero; `INT_MIN / -1`; a float outside the range of an integer |
| `invalid conversion to integer` | NaN to an integer |
| `out of bounds memory access`, `out of bounds table access` | an address past the end of memory or a table |
| `undefined element`, `uninitialized element N`, `indirect call type mismatch` | `call_indirect` past the end of the table, to an empty element, with another function type |
| `call stack exhausted` | recursion deeper than 10 000 calls (1000 on Android) |
| `exit status N` | WASI `proc_exit(N)` with N ≠ 0 |

Shared rules: [languages](README.md#shared-rules). Internals:
[WebAssembly in the translator](../internals/wat.md).
