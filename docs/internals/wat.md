# WebAssembly (WAT) in the translator

What a user gets: [the WebAssembly reference](../languages/wat.md); the
general design: [the translator](translator.md). The scope is WebAssembly
2.0 without SIMD; the reference of behavior is the spec and its tests (see
[Checking](#checking)). A module is translated into JavaScript as a whole:
the WebAssembly of the engine is not used (V4 does not provide one).

| File | Role |
| --- | --- |
| [lexer.js](../../js/translator/wat/lexer.js) | tokens of the text format (idchars, strings as bytes, nested comments), the S-expression tree; `W.error(kind, …)` - an error of the kind `malformed`/`invalid`/`unlinkable` for the `assert_*` commands |
| [numbers.js](../../js/translator/wat/numbers.js) | integer literals by width, floats by exact rounding of a `T.big` ratio right into f32/f64; the shortest notation of f32 |
| [ops.js](../../js/translator/wat/ops.js) | the instruction table: the code in `.wasm`, the kind of immediate operands, the types of simple instructions |
| [parser.js](../../js/translator/wat/parser.js) | module fields into a tree with indices: two passes (the names of all spaces, then the fields), abbreviations, implicit types, labels into depths, folded instructions into flat ones |
| [binary.js](../../js/translator/wat/binary.js) | `.wasm` into the same tree (LEB128, sections, their order, datacount) |
| [validator.js](../../js/translator/wat/validator.js) | validation by the algorithm of the spec appendix: a type stack, frames, an unknown type after an unconditional branch; constant expressions, `ref.func` only of declared functions |
| [codegen.js](../../js/translator/wat/codegen.js) | translation of a module into a chunk `function ($W, $T, $D)` |
| [runtime.js](../../js/translator/wat/runtime.js) | `$W`: traps, `i64` by the rules of WebAssembly over `T.i64`, conversions without double rounding, `Memory`, `Table`, `Global`, values at the JavaScript boundary |
| [host.js](../../js/translator/wat/host.js) | host modules for `import`: WASI (with `fd_read` from the host input), `spectest`, `js`, host modules of the application, `'`, `wasm:js-string`, a path in the global object |
| [instance.js](../../js/translator/wat/instance.js) | an instance: linking imports with type and limit checks, running the chunk, segments, `start` |
| [script.js](../../js/translator/wat/script.js) | the `.wast` commands and `Runner` (running commands, assertions) |
| [language.js](../../js/translator/wat/language.js) | the session: the module registry for `import`, exports into the global object, WASI output, host files, the value of a unit |

## The unit and the session

 - A unit is parsed into commands (`parseScript`); all modules of the unit
   are parsed, validated and translated before the first command runs
   (`Runner.prepare`) - a translation error runs nothing.
 - The session keeps `registry` (a name for `import` -> exports),
   `instances` (the `$id`s of commands) and `current` (the last module for
   `invoke` without a name) - shared by all units. A module `$name` is
   registered under `name` and becomes an object of the global object; its
   exported functions become functions of the global object unless the name
   is taken by a non-WebAssembly value (`exposeFunctions`).
 - An import is looked up in the registry, then in `W.host.resolve` (host
   modules of v4script and of the application, then a path in the global
   object), then in the host file `name.wat` (`loadAttachment`; those
   registered from files are forgotten at the start of every run).
 - The spec test mode (`Runner`, `harness: true`) does not register
   modules by `$id` and does not touch the global object; `onAssert` counts
   assertions instead of failing.

## Translating a function

 - A function of the module is a JavaScript function `f<n>(l0, l1…)`;
   locals are `l<i>`, the cells of the operand stack `s<depth>`: the stack
   height at every point is known at translation, so the value at depth h
   always lives in `s<h>`.
 - **The virtual stack** (`stack`): an element is a JavaScript expression
   with flags: `pure` (no traps, no reads of memory, tables, mutable
   globals), the `l<i>` and `s<i>` it reads, `bool` (a comparison not yet
   converted to 0/1 - for `if` and `br_if` without `!== 0`). An instruction
   without an effect combines expressions (`l2 = l0 + l1 | 0` instead of
   four assignments). An element goes into its cell (`flushEntry`):
    - before an instruction with an effect (a call, a store, `global.set`,
      a branch) - all non-`pure` ones, in order from the bottom: traps
      happen in the same order as in WebAssembly (`flushImpure`);
    - before `local.set x` - the elements that read `l<x>`;
    - before a write to `s<i>` - the elements below that read it
      (`prepareSlot`); an element reads only cells not below its own, so
      moving results down in ascending order on a branch is safe;
    - at the start of every block, loop and `if` - all (otherwise a
      computation inside a loop would repeat, and in a branch it would not
      run on the other one);
    - an operand that may trap from another source line - separately
      (`settleLines`): the place of an error is the line of the instruction
      where it happened;
    - a `return` value that may trap - too: V4 runs `return call` as a tail
      call and loses the frame of the function, and the line with it.
 - A call is always a statement `s<h> = f(…)` (several results come as an
   array spread into the cells), so calls are never reordered.
   `call_indirect` is `$W.indirect(table, index, signature)(arguments)`:
   arguments that may trap are computed before the index.
 - Control: `block` is a labeled block with `break`, `loop` a `for (;;)`
   with `continue` (the label and the loop only if something branches to
   them), `if` a labeled `if`; `br_table` is a `switch` with shared branches
   for equal targets. Code after an unconditional branch is not translated
   (it is validated already).
 - Memory: the fast branch is a typed array at an aligned address in
   bounds (`(t = (a >>> 0) + offset) <= m0.lim4 && (t & 3) === 0 ?
   m0.I32[t >> 2] : m0.load('i32', t)`), the slow one a `DataView` with a
   check and a trap. An address is unsigned plus the offset, up to 2^33,
   exact in double. `memory.grow` replaces the `ArrayBuffer` and the views
   (`Memory.attach`): the code reads them through the memory object instead
   of keeping them in variables.

## Values

 - `i32` is a JavaScript int32; `i64` the hybrid `T.i64` (the signed
   representation; unsigned operations work on the bits `hi`/`lo`, the
   unsigned comparison is `compareUnsigned`, not `T.u64.cmp`, which expects
   the unsigned representation); `f32` is a number rounded by `Math.fround`
   after every operation (double rounding through double for
   `+ - * / sqrt` is harmless); `f64` is a number. A `-0` from truncation
   into `i64` is removed (`noNegativeZero`).
 - `i64 → f32` without double rounding: the high 32 bits of the magnitude
   and a "dropped bits were not zero" bit (round to odd), then one
   `fround`.
 - A `funcref` is the JavaScript function itself with `$sig` (the signature
   string for `call_indirect` and imports) and `$type`; for JavaScript
   `rt.jsFunction` wraps it (argument conversion, the wrapper is cached in
   `$js`). A JavaScript function as an import is `rt.hostFunction` by the
   type of the import. `externref` is a JavaScript value as it is, `null` is
   `ref.null`.
 - A global that is imported or exported is a `Global` cell
   (`G<i>.value`), the others are chunk variables `g<i>`.
 - **NaN.** V4 stores values with NaN boxing: every NaN in it is
   canonical, the sign and the payload are lost (`reinterpret`, `copysign`
   of a NaN). Node keeps quiet NaNs but also quiets signaling ones. Only an
   own representation of floats could fix this - not done.

## Checking

 - The samples `tests/samples/wat/*` have expectations checked with wabt
   1.0.27 (`wat2wasm`, `wast2json` + `spectest-interp`) and the WASI of
   Node.js in WSL Ubuntu-22.04 (`apt install wabt`). `spectest-interp`
   prints integers unsigned, v4script prints them signed.
 - The spec tests: `test/core/*.wast` of the tag `wg-2.0` of
   [WebAssembly/spec](https://github.com/WebAssembly/spec) without `simd/` -
   `node tools/run-samples.mjs wat --wast <directory>`. As of 2026-10-11:
   28006 of 28018 assertions pass in Node, 27954 in V4; all failures are
   NaN bits (see above). Error texts match the expected ones except for a
   part of the parse and binary format errors (the error kind matches
   everywhere).
 - In V4 `Math.round` is wrong near 2^52 (`f64.nearest` is written without
   it).

## Known places

 - No SIMD and no 3.0 proposals (see [TODO](../../TODO.md)); the name
   `$"…"` as a string is not supported.
 - The memory limit is 8192 pages (`rt.MAX_PAGES`, 512 MB): a larger
   `ArrayBuffer` is not reliable in V4; a table holds up to 10 000 000
   elements.
 - A binary `.wasm` host file is not loaded: the host gives files as UTF-8
   text; a binary module can be written as `(module binary "…")`.
