# Go in the translator

What a user gets: [the Go reference](../languages/go.md); the general
design: [the translator](translator.md).

| File | Role |
| --- | --- |
| [parser.js](../../js/translator/go/parser.js) | tokens with automatic `;`, parsing into a tree; a unit is a file that may have statements besides declarations |
| [types.js](../../js/translator/go/types.js) | types, identity, lookup of fields and methods (promotion), representability of constants |
| [checker.js](../../js/translator/go/checker.js), [statements.js](../../js/translator/go/statements.js), [package.js](../../js/translator/go/package.js) | checking expressions, calls, statements, a file; generics; which functions are fibers |
| [codegen*.js](../../js/translator/go/codegen.js) | translation of expressions, calls, statements and a unit into `J.*` |
| [runtime.js](../../js/translator/go/runtime.js), [fmt.js](../../js/translator/go/fmt.js) | slices, maps, interfaces, panics and `defer`, channels and `select`; `fmt` formatting |
| [descriptors.js](../../js/translator/go/descriptors.js) | type descriptions for run time: struct classes, interface boxes, method sets, type sizes |
| [stdlib.js](../../js/translator/go/stdlib.js), [natives.js](../../js/translator/go/natives.js) | the standard library: declarations in Go and the functions without a body in JavaScript |
| [language.js](../../js/translator/go/language.js) | the session: the package `main`, the packages of the library, of host files and of host modules, the run of a unit |

## Values

| Go | JavaScript |
| --- | --- |
| `int8`…`uint32`, `rune`, `byte`, `float32/64`, `bool` | a number (`float32` through `Math.fround`), a boolean |
| `int`, `int64`, `uint`, `uint64`, `uintptr` | the hybrid `T.i64`/`T.u64` |
| `string` | UTF-8 bytes in a JavaScript string |
| slice | `rt.Slice { a, o, n, c }` over a JavaScript array; the nil slice is the shared `rt.NIL` (`a === null`) |
| array | a JavaScript array (a value: copied) |
| struct | an object of the class from the description (`desc.ctor`) with `$copy`, `$set`, `$eq` |
| pointer to a struct or an array | the object itself; to anything else a cell `{ v }` (`rt.Cell`) or `rt.fieldRef(object, field)` |
| map | `rt.GoMap` (a JavaScript `Map` by a primitive key, entries `[key, value]`) or `null` |
| channel | `rt.Chan` or `null` |
| interface | `null`; a struct object (the pointer `*T`); a box `new desc.box(v)` for anything else. The dynamic type is `$t` (on the box and on the struct prototype) |
| function with several results | returns an array |

 - **Copies of structs and arrays.** A store (assignment, a literal
   element, `append`, a channel send, a box) copies the value unless it is
   new (`isFresh`: a literal, a call result). A return copies what
   outlives the call. A variable whose address or whose field's address is
   taken (`addressTaken`) changes in place (`$set`), otherwise pointers
   would part with it. A parameter or a receiver is copied on entry only
   if the function changes it (`mutated`).
 - **Methods** of structs are on the class prototype (the receiver is
   `this`), of other named types in `desc.methods` (the receiver is the
   first argument). An interface box forwards a call to the method of the
   value; promoted methods of embedded fields are forwards on the
   prototype.
 - **`defer`** is `try/catch/finally` with a frame `rt.deferFrame()`: the
   results of a function with `defer` are variables, `finally` runs the
   deferred calls and returns them (a panic stopped by `recover` returns
   the current values). `recover` works in any call inside a deferred one.
 - **Slice capacity** grows as in Go (double, from 256 by a quarter, then
   up to the size class of the allocation by the element size,
   `Go.sizeof`): programs that print `cap` match Go.

## Checking

 - The tree is marked with `mode` (`value`, `var` - addressable, `const`,
   `type`, `builtin`, `novalue`, `mapindex`, `commaok`), `type`, the
   `value` of a constant, `obj`, the selection (`selKind`, `lookup`), the
   call kind (`callKind`). An expression is checked once (`checked`).
 - Untyped constants are converted to the type of their place
   (`convertUntyped`): error messages repeat the Go compiler.
 - The declarations of a unit go into a layer `blockScope` over the
   package; on success they move into the package (`commit`), on an error
   changes of existing types are rolled back (`undo`). A type with the same
   structure on a repeated run is the same object: values in variables keep
   their type.
 - Unused variables and imports are not errors; the packages of the
   standard library are available by name without an import
   (`Go.implicitPackages`).
 - **Generics** are monomorphized: an instance of a function or a type for
   every set of type arguments (`instantiateFunction`,
   `instantiateTypeObject`) is checked again on a copy of the tree
   (`cloneNode` copies only the syntax fields). Constraints are checked
   after substitution (`~[]E` with the inferred `E`). Instances from other
   packages are translated into the chunk of the unit that created them and
   stored in the object of their package.
 - **Fibers**: `FunctionInfo.blocking` (channels, `select`, `range` over a
   channel) and calls of fiber functions make a function `async`; a native
   may be asynchronous (`time.Sleep`, `$async` in natives).

## The standard library and host modules

A package is Go source in `stdlib.js`; a function without a body is a
native from `natives.js` (`'Type.Method'` for a method). A package is
translated at its first import in the session, its natives are installed
before its variables run. Packages from host files (`name.go`) are
translated the same way, and again when the text of the file changes.
Error lines inside the standard library show as the line of the call in the
unit.

Standard input: `os.Stdin` reads `host.input`; `fmt.Scan*`, `bufio.Reader`
and `bufio.Scanner` work over it (`File.read`, `readWords`).

`syscall/js`: `js.Value` is a struct with an opaque field `ref` (the type
`jsref`), `fmt` prints its value as the JavaScript console does. Go values
go to JavaScript and back by the type description (`rt.toJS`/`rt.fromJS`):
Go functions become JavaScript functions that convert their arguments to
the parameter types.

A host module is a package (`Go.hostNatives`): exported names in
PascalCase, the signature types mapped to Go types (`int64`, `float64`,
`string`, `bool`, `js.Value`, `[]js.Value`), optional parameters as a
trailing `rest ...any`; a global module is imported implicitly.

## Limitations

 - A function that became a fiber after its call was already translated in
   another unit is called there as a plain one - run that unit again.
 - A native that takes a Go function (`sort.Slice`) calls it as a plain
   one: a channel wait inside it runs at once (`runNested`).
 - Missing: complex numbers, `goto`, range-over-func iterators,
   reflection, `regexp`, `encoding/json`, `math/big`.
 - Slow places in V4: 64-bit arithmetic (the hybrid), `fmt` in a hot loop.
   Measured (Windows, V4): `fib(27)` 36 ms, a sieve up to 10^6 0.4 s,
   100 000 map entries with `fmt.Sprint` 0.75 s; the first run of Go with
   the translation of `fmt` and `strings` about 0.1 s.
