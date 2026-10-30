# C# in the translator

What a user gets: [the C# reference](../languages/csharp.md); the general
design: [the translator](translator.md). C# objects are JavaScript objects
(types are constructors), the .NET subset is written in C# (the sources
are in `library-*.js`) and translated by the same translator on demand;
natives are only what cannot be written in C#. The reference of output is
.NET 8 (`csc` of the SDK 8.0 with the implicit usings of a console
project): the samples were checked with it.

| File | Role |
| --- | --- |
| [lexer.js](../../js/translator/csharp/lexer.js) | tokens, the preprocessor (`#if`, `#region`…), interpolated and raw strings as one token with their parts |
| [parser.js](../../js/translator/csharp/parser.js), [parser-statements.js](../../js/translator/csharp/parser-statements.js), [parser-expressions.js](../../js/translator/csharp/parser-expressions.js) | parsing; a unit is a script (types, top-level functions, variables and statements in any order); query expressions |
| [types.js](../../js/translator/csharp/types.js), [symbols.js](../../js/translator/csharp/symbols.js), [symtab.js](../../js/translator/csharp/symtab.js) | types, symbols, member lookup with hiding; namespaces, user types and the library by units |
| [conversions.js](../../js/translator/csharp/conversions.js) | the conversions of C# and the betterness rules of overload resolution |
| [checker.js](../../js/translator/csharp/checker.js), `checker-*.js` | binding: types and members (`checker-members.js`), expressions, calls with overload resolution and type inference (`checker-calls.js`), operators, statements and reachability, patterns, the rest (`checker-more.js`), bodies; messages and codes of `csc` |
| [codegen.js](../../js/translator/csharp/codegen.js), `codegen-*.js` | translation into `J.*`: type definitions, members, expressions, assignments, patterns, statements |
| [runtime.js](../../js/translator/csharp/runtime.js), [runtime-helpers.js](../../js/translator/csharp/runtime-helpers.js), [runtime-tasks.js](../../js/translator/csharp/runtime-tasks.js) | `$cs`: types at run time, casts, boxing, structs, arrays, delegates, exceptions; helpers of the translated code, `dynamic`; tasks, async methods, iterators, threads |
| [decimal.js](../../js/translator/csharp/decimal.js), [format.js](../../js/translator/csharp/format.js), [collation.js](../../js/translator/csharp/collation.js) | `decimal` arithmetic; numbers as text and parsing (standard, custom and composite formats); string comparison as the invariant culture |
| [natives-system.js](../../js/translator/csharp/natives-system.js), [natives-runtime.js](../../js/translator/csharp/natives-runtime.js) | natives of `System`: primitive types, `String`, `Array`, `Enum`, sorting; `Console`, `File`, `Math`, `Convert`, `Random`, `Type` |
| `library-*.js` | the library in C#: `System` (two parts), collections, sorted collections, LINQ, text, regular expressions, `BigInteger`, time, threading, `V4Script` (`JsValue`, `Js`, `JsException`, host modules) |
| [language.js](../../js/translator/csharp/language.js) | the session: the shared scope of the units, the unit, `Main`, the value, types from host files, the run and its continuation in timers |

## Values

 - `int`, `short`, `byte`, `char`, `uint`, `float`, `double` are numbers
   (`float` through `Math.fround`), `long` and `ulong` are the hybrids
   `T.i64`/`T.u64` (see [the translator](translator.md#decisions)),
   `decimal` is a `Decimal` of [decimal.js](../../js/translator/csharp/decimal.js)
   (a sign, a `T.big` mantissa below 2^96, a scale), `bool` is a boolean,
   `string` a JavaScript string.
 - **`int`, `bool` and `string` box to themselves**: an `object` holding
   them is the JavaScript value. Other value types box into `$Box`
   (`boxOf`: the value and its type), so `object o = 1.5` stays a
   `Double`. The price: `(object)1 == (object)1` is `true`.
 - **Types whose values are JavaScript values** (`[V4Primitive]` in the
   library: the numeric types, `Boolean`, `String`, arrays, delegates) put
   their methods on `Number.prototype`, `String.prototype`… (the
   `INSTALLED_TYPES` at the start of a session): `s.Trim()` is
   `s.Trim$0()` on a string. A call on a number goes to the prototype of
   its static type (`Int32.prototype.M.call(x)`): `Number.prototype` has
   the methods of `Int32` only.
 - A struct is a JavaScript object copied on assignment (`$copy`) when it
   has fields that can change.
   A class is a constructor in `$K`; fields are own properties set by
   `$fields`, constructors are methods `$ctor$N` (`new C().$ctor$1(x)`),
   statics are `s$name` on the constructor. The JavaScript name of a
   member is `name$arity`, with the parameter types when arities clash
   (`assignJsNames`).
 - Arrays are typed arrays for numeric elements, plain arrays otherwise;
   `$t` is the element type, `MultiArray` holds rectangular ones.
 - **Generics are reified**: `$cs.inst(def, args)` makes one constructor
   per list of arguments (its prototype inherits from the definition);
   instance code reads the arguments from `this.$ta$<id>`, generic methods
   get them as leading parameters, static methods of a generic type are
   called with `this` = the constructed type. Static fields live on every
   constructed type.
 - `ref` and `out` are objects with `v` (`$cs.ref`, `fieldRef`,
   `elementRef`); `in` parameters are passed by value.
 - Delegates are functions with `$t` (their type) and, for a multicast
   one, the list of targets; events are fields of such functions.
 - Exceptions are objects of `System.Exception` thrown as they are;
   `$cs.caught` turns JavaScript errors in `catch` into exceptions (a
   `TypeError` of a null receiver is a `NullReferenceException`, V4's
   stack overflow `Stack overflow.`).
 - `dynamic` is a JavaScript value: member access, calls and operators go
   to JavaScript (`dynamicGet`, `dynamicBinary`…); a `JsValue` stands for
   the value it holds.

## Translation

 - Every expression is bound into a tree with types (`bound(...)`), then
   translated; constants are folded by the checker as `csc` does
   (`checked` overflow of constants is error CS0220).
 - Overload resolution and type inference follow C# 12.6 (phases of
   inference, better function member, better conversion target);
   lambdas are bound once per candidate delegate type.
 - Locals declared inside expressions (`out var`, pattern variables) are
   declared at the start of their block (`blockHoisted`, `fn.hoisted`).
 - `switch`: a JavaScript `switch` for constant labels, a chain of tests
   for patterns; with `goto case` a loop over the number of the section.
   `goto label`: the statements before a label that a goto jumps forward
   to go into a labeled block (`break`), the label and the rest into a
   labeled loop when a goto jumps back (`continue`) (`labeledStatements`).
 - Iterators are generators wrapped in `IEnumerator` objects; `finally`
   runs on `Dispose`.
 - Static constructors and static initializers with effects run lazily at
   the first use of the type (`$lazy`, `$run`), as `beforefieldinit` allows.

## The library

 - `CS.addLibrary(id, source)`: the source is split into units by
   top-level type (`id/Name`N`, with the usings and the namespace of the
   header and the original line numbers). A unit is parsed when its type is
   first looked up (`Symtab`) and translated when the type is first used
   at run time: `$K.id` is a lazy property. The body of a library method
   is checked and translated at its first call (`lazyMethod`,
   `Session.compileLazyMethod`). `run-samples.mjs csharp --library`
   translates everything at once to find errors in the library itself.
 - A native is an `extern` member in the source plus a function
   `CS.natives['Namespace.Type`N']['Name<T>(int, string)']` (`CS.nativeKey`:
   the parameter types as `csc` names them) with the receiver as `this`;
   type arguments of a generic method come first, `ref`/`out` arguments
   are references. `CS.typeSetup[name]` adds what a type needs at run time
   (`$format`, `$equals`, `$hash`, `$compare`, `$default`, `$box`).
 - The algorithms of `Dictionary` and `HashSet` (buckets and entries: the
   order of enumeration after removals), sorting (introsort), `Random` with
   a seed, `PriorityQueue` (a 4-ary heap) and the texts of `ToString`,
   formats and exceptions repeat .NET: programs print the same.
 - **Doubles as text**: `ToString()` is the shortest text that reads back
   (`R`); standard formats round the exact binary value with ties to even,
   custom formats round 15 significant digits away from zero, as .NET.
 - **String comparison** (`string.Compare`, `CompareTo`, `OrderBy` of
   strings) approximates the ICU root collation of .NET on Linux
   ([collation.js](../../js/translator/csharp/collation.js)); `Ordinal`
   comparisons are by UTF-16 units.
 - **Regular expressions** ([library-regex.js](../../js/translator/csharp/library-regex.js))
   translate the .NET syntax into a JavaScript `RegExp` and number the
   groups as .NET (unnamed first, then named); JavaScript gives no group
   positions, so a group is found by its text inside the match.
 - `BigInteger` is a struct over a `T.big` integer (`_value`, `null` is
   zero).
 - Library chunks are marked with the source `library`: the place of an
   error in them is the user line that called the library.
 - Host modules: a module is a static class (`CS.hostLibrary`: the title
   name, members in PascalCase, getters as properties, overloads for
   optional parameters) with natives that call the module; a global module
   is imported with `using static` into every unit.

## The session and the unit

 - Top-level functions and variables are static members of the session
   class (`$K.$session`). The types of a unit replace the types of the
   same name in their namespaces; a failed unit restores the old ones
   (`replaced`). A function with the same signature replaces the old one;
   a variable declared again gets a new field.
 - The statements of a unit form the run function; without statements the
   `Main` of the first class that has one runs. The value is the last
   expression statement without a semicolon (`$cs.show`: the text of
   `ToString()`).
 - A type from a host file: an unknown type name is looked up in the host
   file `Name.cs`; the file is translated as one chunk with its own source.
   A changed file is translated again (`refreshModules`).

## Fibers, async and threads

 - A function is a fiber if it calls a library method marked `[V4Fiber]`
   (`Thread.Sleep`, `Task.Wait`, `Monitor.Wait`, `Thread.Join`…) or a
   fiber (`Session.markFibers`, a fixed point over the functions of the
   unit; lambdas that wait make their delegate calls waiting). A fiber is
   a generator `$gen` plus a plain wrapper (`CS.fiberNative`): the library
   and JavaScript call the wrapper.
 - An `async` method is a generator run by `$cs.async`: it runs at once
   until it awaits a task that is not complete, then the task's
   continuation resumes it, as in .NET. A task has `$state` (0 created, 1
   done, 2 failed, 3 canceled, -1 running), `$result`, `$error` and its
   waiters.
 - A thread is a fiber of the scheduler; `lock` is `Monitor.Enter`/`Exit`
   with an owner and a count, `Wait`/`Pulse` park and wake fibers. The end
   of the program waits for foreground threads and pending tasks
   (`awaitFibers`).

## Known places

 - An undeclared name in the translated code becomes a global in Node
   (`run-samples.mjs` runs chunks in sloppy mode) but fails in V4: the
   final check is `LanguagesTest`.
 - V4 (Qt 6.4) workarounds: `\B(?=…)` in `replace` inserts twice
   (`groupInteger` is a loop); a `return` with a call goes through a
   temporary (see [V4 pitfalls](v4-pitfalls.md)).
 - Missing: definite assignment (`CS0165`), nullable warnings, generic
   math, `Span<T>`, reflection, stack traces.
