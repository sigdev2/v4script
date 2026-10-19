# C++ in the translator

What a user gets: [the C++ reference](../languages/cpp.md); the general
design: [the translator](translator.md). C++ runs over the linear memory
of [C](c.md) and reuses its preprocessor, arithmetic types, memory, `printf`
and C library; everything above C is in
[js/translator/cpp](../../js/translator/cpp).

| File | Role |
| --- | --- |
| [types.js](../../js/translator/cpp/types.js) | interned types: cv-qualified, references, classes, enums, template placeholders, dependent names; names as in g++ messages; Itanium mangling for `typeid` with substitutions (`S_`, `S0_`) and the names of libstdc++ (`std::__cxx11::basic_string`) |
| [scope.js](../../js/translator/cpp/scope.js) | scopes, lookup (qualified, `using`, inline namespaces), overload sets, the transaction of a unit, lazy library names (`X.ensure`) |
| [parser.js](../../js/translator/cpp/parser.js), [declarations.js](../../js/translator/cpp/declarations.js), [statements.js](../../js/translator/cpp/statements.js), [expressions.js](../../js/translator/cpp/expressions.js) | parsing with semantic actions: tokens, names, declarators, declarations, statements, expression syntax |
| [check.js](../../js/translator/cpp/check.js), [conversions.js](../../js/translator/cpp/conversions.js), [overload.js](../../js/translator/cpp/overload.js), [special.js](../../js/translator/cpp/special.js), [classes.js](../../js/translator/cpp/classes.js) | checked expression trees, implicit conversion sequences and initialization, overload resolution and calls, `new`/`throw`/`typeid`/`dynamic_cast`, class layout, virtual functions, implicit special members |
| [templates.js](../../js/translator/cpp/templates.js), [functions.js](../../js/translator/cpp/functions.js), [constexpr.js](../../js/translator/cpp/constexpr.js) | templates (instances, deduction, partial ordering, SFINAE), function bodies, constructors, lambdas, structured bindings, constant evaluation |
| [codegen.js](../../js/translator/cpp/codegen.js), [codegen-statements.js](../../js/translator/cpp/codegen-statements.js) | translation into `J.*` over the memory of C: values, addresses, objects built in place, temporaries, scopes with destructors, functions, the unit |
| [runtime.js](../../js/translator/cpp/runtime.js), [natives.js](../../js/translator/cpp/natives.js) | the helpers `$c`: exceptions, RTTI, `dynamic_cast`; library functions in JavaScript (`__v4_*`: number formatting and parsing, input, hashing, clocks) |
| [library.js](../../js/translator/cpp/library.js), `library-*.js` | the standard library as C++ text with the table of its declarations |
| [language.js](../../js/translator/cpp/language.js) | the session: the prelude, lazy library, vtables and RTTI records, the run of a unit, the value of a unit |

## Parsing

 - C++ cannot be parsed without knowing what names are, so the parser
   resolves names as it reads (`parseName`) and declares at once; an
   expression is checked when its full-expression ends. There is no
   separate syntax tree of declarations: a declaration enters its scope,
   a statement becomes the checked tree that codegen translates.
 - Ambiguities (`T(x)`, `A<b>c`, a declaration or an expression) are
   decided by trying (`attempt`, `mark`/`reset`); `>>` that closes two
   template argument lists is split in place and the split is undone on a
   reset.
 - Function bodies are parsed later from their tokens (`func.lazy`,
   `session.compileBody`): members after their class is complete, library
   functions and template instances when first used (`requireBody`, a
   queue drained at the end of the unit).

## Templates

 - A template keeps its tokens; an instance parses them again with the
   parameters bound to the arguments (`T` a typedef, `N` a constant, `Ts` a
   type pack). Inside an instance every name is concrete, so the parser
   needs no rules for dependent names there.
 - Only the signature of a function template is parsed at once, as a
   pattern with placeholders (`X.templateParam`), for deduction and
   partial ordering (`patternsDeduce`). Dependent parts of a pattern are
   `dependent` types and `expr` arguments with their text.
 - SFINAE: a `CompileError` while instantiating the signature of a
   candidate (also the types of its value parameters,
   `enable_if_t<…, int> = 0`) removes the candidate; an error in a body is
   an error.
 - A template declared again with the same text of the signature
   (`signatureKey`: without parameter names and default arguments) is the
   same template: a definition after a declaration gives its body to the
   instances made before it, a definition in a later unit replaces the old
   one.

## Classes and objects

 - Layout as the Itanium ABI for non-virtual inheritance: the primary
   (first polymorphic) base at 0, a vtable pointer at 0 of every
   polymorphic class, empty bases at offset 0, then fields; `dsize`
   (without tail padding) for copies of base subobjects. An empty class
   has no bytes to copy: `unique_ptr` keeps its deleter as an empty base at
   the address of its pointer.
 - Virtual functions are identified by their root (the function that
   introduced them); a vtable lists the final overriders of one
   polymorphic subobject with `this` adjustments (thunks). In memory the
   vtable pointer is a number in the table `$V` of the session; a call is
   `$F[$V[$M.loadPointer(object)][slot]](object, …)`.
 - Special members a class does not declare are declared on demand
   (`declareImplicitMembers`) and defined by codegen; trivial ones copy
   bytes (`assignobj`, `copy`).
 - A class value in an expression is its address; a prvalue is built in
   place (`init(destination, e)`): in the `$ret` slot of a call, in a
   temporary of the frame, in a variable. Temporaries with destructors are
   destroyed at the end of their full-expression (cleanups); a block with
   such objects is a `try` whose `finally` destroys what was constructed
   (a counter per block).
 - Copy elision: prvalues are never copied (C++17); a local declared in
   the outermost block that every `return` returns lives in `$ret` (NRVO,
   `returnSlot`), as g++ 13 does it - not for locals of inner blocks.
 - Exceptions are JavaScript exceptions (`CppException`) with the address
   of the thrown object (on the heap), its RTTI record and its destructor;
   a handler matches by the RTTI bases and adjusts the pointer. An uncaught
   exception is the error `terminate called after throwing an instance of
   'T'` with `what()` for classes derived from `std::exception`.

## Constants

The checker folds operators on constants. `constexpr.js` evaluates calls
of constexpr functions in the places that need a constant (array bounds,
`static_assert`, template arguments, `case`, `if constexpr`, initializers
of `const` scalars) by interpreting their checked bodies over scalars, with
the limits of g++ on depth and fewer steps; what it cannot evaluate stays a
call at run time.

## The library

 - The library is C++ text in `library-*.js`, one `String.raw` text per
   header in the order of inclusion (`X.addHeader`). Before each text is
   the table of its top-level declarations: the namespace (`+` marks an
   inline namespace), the first and the last line, the names it declares
   (empty: parsed at the start of the session - directives, using
   directives). [tools/build-cpp-library.mjs](../../tools/build-cpp-library.mjs)
   writes the tables; `--check` reports stale ones.
 - A session parses at its start only the C headers and the declarations
   without names, and registers the others by name in their scopes
   (`scope.lazy`). The first lookup of a name (`X.ensure`) tokenizes and
   parses its declarations; a body is parsed when the function is used. A
   program that uses `printf` only parses almost nothing of the library.
 - While a declaration of the library is parsed, a name it looks up loads
   only declarations that come before it in the library (`loadingOrders`):
   as in a real header, a declaration sees what is above it, and cycles
   between headers cannot start.
 - Library declarations are parsed outside the transaction of the unit
   (they stay when the unit fails); their static objects are initialized
   at the start of the next unit that compiles (`libraryInit`).
 - Behavior of libstdc++ was taken from the output of g++ 13 programs (a
   black box, no sources read): the growth of `vector` (doubling) and the
   moves of `move_if_noexcept`; introsort with its thresholds, the heap
   and `nth_element` orders of equal elements; the hint rules of
   `multimap`/`multiset`; the hash tables (one list with "before" pointers
   per bucket, insertion at the front of a bucket, the prime table and the
   growth policy, `rehash` keeping equal keys together); `std::hash` (the
   64-bit MurmurHash variant with seed `0xc70f6907`); the engines and
   distributions of `<random>` (Lemire's method for 32 and 64-bit engines,
   `generate_canonical`, the polar method for `normal_distribution`, the
   product method of `poisson_distribution` below the mean 12 - libstdc++
   uses another method above it, `seed_seq`, `shuffle` taking two
   positions per number); the texts of exceptions.

## The session and the unit

 - A unit compiles in a transaction (`X.Transaction`): every change of a
   shared scope is recorded (`X.change`, `X.append`) and rolled back on an
   error. Declarations of a successful unit become `fromSession`: the next
   unit may define them again.
 - A chunk is `function ($c, $T, $D, $M, $F, $G, $V)`: the C++ helpers,
   the translator core, constants (RTTI records, type descriptions), the
   memory, the function tables and the vtables.
 - Functions that wait are generators as in C (`computeAsync`: a fixed
   point over the functions of the unit; virtual and indirect calls wait
   when a waiting function may be their target).
 - `languages.json` lists the C files the C++ translator reuses before its
   own; the guards at the top of the C++ files test own properties of the
   prototypes (`hasOwnProperty`), because C defines methods of the same
   names on shared prototypes.

## Known places

 - Missing: virtual inheritance, pointers to members, class template
   argument deduction, `goto`, `alignas` on classes, wide strings, threads,
   `<regex>`, `<variant>`, `<any>`, `std::exception_ptr`; `noexcept`
   functions that throw do not terminate.
 - Arguments are evaluated from left to right (g++: often right to left).
 - Speed of translation in V4: the first unit with `<iostream>` takes about
   0.7 s, a unit that uses several containers 2-4 s (Node.js is about 6
   times faster); most of it is parsing and checking library code.
   `tests/samples/cpp/workload.cpp` runs about 3 s in V4.
