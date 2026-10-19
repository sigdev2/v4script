# Scheme in the translator

What a user gets: [the Scheme reference](../languages/scheme.md); the
general design: [the translator](translator.md). The scope is R7RS-small
with complex numbers, SRFI 1, 13, 18, 69 and full continuations; the
reference of behavior is chibi-scheme 0.9.1 (the reference implementation
of R7RS), the differences are listed in the reference page.

| File | Role |
| --- | --- |
| [types.js](../../js/translator/scheme/types.js) | values: `Pair`, `NIL`, symbols (`intern`), characters (one object per code), mutable strings `SString`, `Values`, records, promises, `ErrorObject`, `S.error` |
| [numbers.js](../../js/translator/scheme/numbers.js) | the numeric tower `S.N`: operations by number kinds, complex functions, parsing and printing numbers |
| [printer.js](../../js/translator/scheme/printer.js) | `write`, `display`, `write-shared`, `write-simple`: cycle labels, a walk with its own stack |
| [reader.js](../../js/translator/scheme/reader.js) | reading data (code and `read`); the lines of pairs go to `S.lines` |
| [syntax.js](../../js/translator/scheme/syntax.js) | expansion: environments, special forms, bodies with internal definitions, `syntax-rules`, quasiquotation, the JavaScript dot notation; the result is IR |
| [compiler.js](../../js/translator/scheme/compiler.js) | IR into JavaScript in continuation-passing style: simple expressions, continuations, loops from tail calls to itself, call places |
| [machine.js](../../js/translator/scheme/machine.js) | `Machine` (`$S` in the code): the trampoline, run levels, continuations and `dynamic-wind`, exception handlers, the SRFI 18 thread scheduler, `Prim` and the registration of built-ins |
| [builtins-core.js](../../js/translator/scheme/builtins-core.js) | R7RS built-ins and their inlining (`inline`): arithmetic with a fast branch, pairs, vectors; control procedures in CPS |
| [builtins-io.js](../../js/translator/scheme/builtins-io.js) | ports: the console (with input from the host), strings, bytes, host files for reading; the current ports are parameters |
| [builtins-srfi.js](../../js/translator/scheme/builtins-srfi.js) | SRFI 1 and 13 without procedure arguments, SRFI 69 hash tables, SRFI 18 threads, mutexes, condition variables |
| [library.js](../../js/translator/scheme/library.js) | procedures written in Scheme (`map`, `fold`, `sort`, `hash-table-update!`…), `format`, `random` |
| [jsapi.js](../../js/translator/scheme/jsapi.js) | values at the JavaScript boundary (`fromJs`, `toJs`), `%js-ref`/`%js-invoke`/`%js-set!`, the `js-…` procedures, host modules |
| [language.js](../../js/translator/scheme/language.js) | the session: reading, expanding and translating a unit, running the main thread, libraries (`define-library`, `import`, host files), `eval`, `load`, the value and the place of an error |

## Values

 - An exact integer is a JavaScript number with an integer value or a
   `T.big`; a fraction is a `T.rat`; an **inexact** number is a JavaScript
   number with a fraction (and NaN, ±Infinity) or a `Flo` if the value is an
   integer (`2.0`, `-0.0`). So `2` and `2.0` differ, and float arithmetic
   does not create an object per operation (`new` in V4 costs about
   200 ns). A complex number is a `Cpx(re, im)` whose imaginary part is not
   an exact zero.
 - A string is an `SString` over a JavaScript string: while it has no
   surrogate pairs, a character index is the JavaScript index; otherwise it
   goes through an array of codes. A vector is a JavaScript array, a
   bytevector a `Uint8Array`, a procedure a JavaScript function. A Scheme
   value is never `undefined`: the argument count check relies on that.
 - JavaScript objects live in Scheme as they are; an array from JavaScript
   becomes a vector (a copy), a function a wrapper procedure (`$js`), a
   procedure in JavaScript a function (`$scheme`, cached in
   `proc.$jsFunction`).

## Expansion

 - An identifier is a symbol or an `Alias` (a name a macro template
   introduced). Bindings are looked up along the `Scope` chain, an `Alias`
   without its own binding in the environment of the macro definition; that
   gives hygiene without renaming all code. `quote` strips the `Alias`es
   (`strip`).
 - A binding is `special`, `macro`, `aux` (`else`, `=>`, `...`), `local`
   (`Var`), `global` (a `Cell` - `v`, `undefined` means not defined;
   `imported` is read only), `prim` (built-in), `lazy` (a library procedure
   not translated yet).
 - Bodies are `letrec*`: definitions (also those from macros, `begin`,
   `define-values`, `define-record-type`) are collected before the
   expressions are expanded.
 - Forms that the expander builds itself (`define-record-type`) refer to
   special forms and built-ins through `S.SYNTAX_ENV`, not through the
   environment of the user.
 - A top-level definition of a built-in name creates a new cell; `prescan`
   does it before the unit is expanded, so that forms above the definition
   see the new variable too. Code translated earlier keeps the old binding
   (built-ins are inlined at translation).
 - A dotted name `a.b.c` is a JavaScript path only if the whole name is
   unbound: `(%js-ref a ["b" "c"])`, a call is `%js-invoke`, `set!` is
   `%js-set!`; the path goes over the objects as they are, only the result
   is converted.

## Translation into continuations

 - A procedure is `function $fN($k, a, b, $x)`: `$k` is the continuation,
   `$x` an extra argument (the argument count is checked by comparisons
   with `undefined`, without `arguments`; only procedures with a rest use
   `arguments`). A continuation is a function of one value; several values
   are a `Values` object.
 - A **simple** node (`isSimple`) has no Scheme procedure call: it is a
   JavaScript expression. A procedure call is `return f(K, args)`, where
   `K` is a translation-time continuation (`bind`) turned into a function
   (`reify`), or `$k`. Built-in procedures that call no Scheme procedures
   are plain calls or inlined code (`Prim.inline`) and create no
   continuations.
 - `+`, `-`, `*` have a fast branch: integers below 2^31 at once, below
   2^53 with an integrality check, floats with a float result as numbers;
   everything else goes through `$N`. Integer literals get no checks.
 - A tail call to itself in the body of a procedure (a named `let`, `do`, a
   definition) is a step of a labeled `for (;;)` loop; the variables are
   copied at every step (`let`) only if the body creates functions.
 - Arguments go from left to right: simple values are kept in `let`s until
   the next call; values needed after a continuation are parameters of the
   continuations (a binding of their own on every entry - re-entering a
   continuation does not see foreign values).
 - The chunk of a unit is `function ($S, $D)` and returns an array of the
   functions of the top-level forms (`$top`); constants are chunk variables
   `$cN`.

## The machine

 - **The trampoline.** Every function (a procedure or a continuation)
   counts `++$S.d` at its start and returns a `Bounce` at `LIMIT` (120);
   the `execute` loop goes on with an empty stack. V4 drops the frames of
   tail calls itself (`return f()` in strict mode), but Node does not, and
   calls from built-in procedures are not always tail calls.
 - **Levels.** The main program of a unit (`runMain`) is a level with
   threads; a Scheme procedure called by JavaScript or by a built-in
   procedure (`callProcedure`) is a nested level without thread switching.
   A continuation of another level is a `ContinuationJump` to its loop; a
   level that has already returned is an error.
 - **The dynamic state** is `winders` (`dynamic-wind`), `handlers`,
   `params` (`parameterize`): a continuation keeps them and restores them
   (`rewind` runs `after` and `before`), a thread keeps its own.
 - **Exceptions.** An error of a built-in procedure is a JavaScript
   exception (an `ErrorObject` or a JavaScript error); `recover` makes a
   condition of it and calls the handler **as the next step of the loop**
   (`Bounce`), not inside `catch`: otherwise the rest of the program would
   run inside `catch`, and the next exception would bypass the loop.
   `raise` without a handler is a `SchemeRaise`. `guard` is a built-in
   procedure in CPS after the R7RS sample (the clauses run in the
   environment of `guard`, with no matching clause - `raise-continuable`
   where the exception happened).
 - **SRFI 18 threads.** A thread is a continuation (`resume`) with its own
   dynamic state; it switches on every 40th `Bounce` when threads are
   ready. Waiting is `block` (SUSPEND) and `wake`; sleeping is
   `sleepUntil`. When all sleep, `runMain` returns `waiting`, and a timer of
   the host continues (`env.schedule`). The end of the main program stops
   the others.
 - **Top-level forms.** The continuation of a form leads to the form after
   the *current* one (`state.index` in `runBlock`) - as in a REPL.

## The library

 - Built-ins are `Prim`s (`S.def`, `S.defCps`): direct ones (a value) and
   ones in CPS (`apply`, `call/cc`, `raise`, `force`, `thread-join!`…). The
   procedure value of a built-in (`(map car l)`) is a wrapper `S.procOf`.
 - Procedures that call user procedures are written in Scheme
   (`S.LIBRARY_SOURCE`): continuations and errors in them work as in user
   code. A definition is translated at the first mention of its name
   (`resolveLazy` → `libraryCell`) as a separate `library` chunk in its own
   environment.
 - R7RS libraries: a `Library` with its own `TopEnv`; the body is
   translated at the definition and runs at the first `import`
   (`%instantiate`). The standard libraries give all built-ins. A host file
   `name.sld` (`name.scm`) without `define-library` exports everything it
   defines; a changed file is translated again.
 - Standard input: the console input port reads the host input line by
   line (`read-line`, `read`, `read-char`, `char-ready?`).
 - Host modules: procedures with kebab-case names (`is-even`) and the
   module object for the dot notation (`app.add`); a global host procedure
   never hides a built-in one (`S.installHostModules`).

## The place of an error

 - V4 stack frames are mapped to code lines by the map of the chunk. But V4
   drops the frames of tail calls, and an error in a called procedure
   (`raise`, `error`, the argument count) may leave no user frame. So user
   code writes the place into `$S.at` before every procedure call
   (`notePlace`); an error without a frame in the stack takes it. Library
   chunks do not write the place - an error in them shows the line of the
   call from the unit.
 - A translation error at run time (`eval`, `load`) is a Scheme condition
   (`guard` catches it).

## Known places

 - A `WeakMap` with thousands of keys crashes V4 (Qt 6.4.1) during garbage
   collection (a segfault that depends on the moment of the collection).
   So `S.lines` is a `Map` cleared before every unit; wrapper caches are
   properties of functions; the numbers of `equal?` key objects live in the
   hash table itself. See [V4 pitfalls](v4-pitfalls.md).
 - `Function.prototype.apply` with hundreds of thousands of arguments
   (`(apply + big-list)`) works in V4, but overflows the stack in Node.
 - Division of big integers is `T.big` bit by bit: slow on thousands of
   digits.

## Checking

 - The samples `tests/samples/scheme/*` have expectations from
   chibi-scheme 0.9.1 in WSL (`apt install chibi-scheme`, run with imports
   of all standard libraries and SRFI 1, 18, 69, 95); what chibi lacks or
   does differently (threads, libraries in a unit, JavaScript, SRFI 13,
   `format`) follows SRFI and R7RS by hand.
 - `node tools/run-samples.mjs scheme --run file --dump` shows the
   generated JavaScript; the final check is `LanguagesTest`.
