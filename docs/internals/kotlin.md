# Kotlin in the translator

What a user gets: [the Kotlin reference](../languages/kotlin.md); the
general design: [the translator](translator.md). Kotlin is translated onto
the **run time of the Java translator**: classes are those of
[Java](java.md) (`$j.defineClass`, `$init` constructors, `name$N` methods),
and the JDK classes come from the Java library written in Java, as
Kotlin/JVM uses the JDK. The Kotlin standard library is written in Kotlin
(the sources are in `library-*.js`) and translated by the same translator
on demand. The reference of output is `kotlinc` 2.4.21 on JDK 21: the
samples were checked with it.

| File | Role |
| --- | --- |
| [lexer.js](../../js/translator/kotlin/lexer.js) | tokens; string templates as one token with their parts (nested tokens of `${…}`), raw strings, nested comments, labels `name@` |
| [parser.js](../../js/translator/kotlin/parser.js), [parser-statements.js](../../js/translator/kotlin/parser-statements.js), [parser-expressions.js](../../js/translator/kotlin/parser-expressions.js) | parsing; a unit is a script; the newline rules of Kotlin, generic calls by lookahead (`f<T>(x)`), trailing lambdas |
| [types.js](../../js/translator/kotlin/types.js), [symbols.js](../../js/translator/kotlin/symbols.js) | types (with nullability and flexible types of Java), subtyping, inference variables, common supertypes; symbols, Java classes as Kotlin classes (`Kt.javaClass`, the mapped classes `java.lang.Object` - `Any`, `java.util.List` - `MutableList`…) |
| [checker.js](../../js/translator/kotlin/checker.js), `checker-*.js` | scopes and the resolution of names, classes and their members (`checker.js`), calls with the tower of Kotlin, argument mapping, inference and the most specific candidate (`checker-calls.js`), expressions and smart casts, statements, lambdas and references (`checker-statements.js`), bodies (`checker-bodies.js`); the messages of K2 |
| [codegen.js](../../js/translator/kotlin/codegen.js), `codegen-*.js` | translation into `J.*`: classes, members, constructors, delegation, `tailrec`; expressions; calls; operators; statements and lambdas |
| [intrinsics.js](../../js/translator/kotlin/intrinsics.js) | the members of the primitive types (operators, conversions, bit functions) as intrinsics |
| [runtime.js](../../js/translator/kotlin/runtime.js), [natives.js](../../js/translator/kotlin/natives.js) | `$kt`: `Unit`, objects, non-local jumps, data classes, casts with the messages of the JVM, arrays, `KClass`, lazy library functions; the natives of `kotlin.io`, `kotlin.reflect`, `kotlin.jvm` |
| [library.js](../../js/translator/kotlin/library.js), `library-*.js` | the library in Kotlin: the builtins (`Any`, `Int`, `String`, `Array`, the collection interfaces) mapped to Java classes, `kotlin`, `kotlin.io`, `kotlin.reflect`, `kotlin.ranges`, `kotlin.text`, `kotlin.collections`, `kotlin.math`, `kotlin.comparisons`, `kotlin.random`, `kotlin.sequences`, `kotlin.properties`, `kotlin.concurrent`, `kotlin.system`, `kotlin.jvm` with their natives |
| [language.js](../../js/translator/kotlin/language.js) | the session: the builtins, packages and lazy library declarations, the units and their shared declarations, `main`, the value, host modules and host files, fibers |

## Values

 - As in Java: `Int`, `Short`, `Byte`, `Char`, `Float`, `Double`,
   `Boolean` are numbers and booleans, `Long` is the hybrid `T.i64`,
   `String` a JavaScript string; the unsigned types are numbers below 2^32
   (`ULong` is `T.u64`).
 - **Boxing follows the Java run time**: `Int`, `Boolean` and `String`
   are their own boxes, the others box into the Java boxes (`$j.boxJ`,
   `boxD`, `boxC`…) in nullable and generic positions; `ULong` boxes into
   `$kt.boxUJ` (it prints unsigned).
 - **Function values are JavaScript functions that take and return boxed
   values** (as `FunctionN.invoke` on the JVM); a receiver is the first
   argument. A lambda for a Java functional interface or a `fun
   interface` is an object of it (`$j.lambda`).
 - An override uses the representation of the declaration at the top of
   its chain (`Kt.rootOf`, `passedParam`, `passedReturn`): the bridges of
   the JVM.
 - `object` and `companion object` are classes with a lazy `$instance`
   (`$kt.defineObject`); `Unit` is `$kt.Unit`. A value class is an
   ordinary class (a box) with the members of a data class.
 - Top-level declarations of the units live in `$K.$kts` (functions by
   signature: `Kt.userSignature`, so a unit run again replaces them),
   those of the library in a facade object per package (`$K.$kf_kotlin_collections`).

## Translation

 - **Classes are completed in two phases**: the header (type parameters,
   supertypes: `completeHeader`), then the members (`complete`); member
   signatures that mention the class itself (`String.compareTo(String)`)
   need the first phase only.
 - **Calls** are resolved by the tower of Kotlin: locals, implicit
   receivers from the innermost (members, then extensions), explicit
   imports, the package, star imports, default imports. A member is an
   unsafe call on a nullable receiver, so an extension for `T?` wins
   (`x.toString()` for `x: T`). Arguments that need the expected type
   (generic calls, `if`, lambdas) are postponed and checked again with the
   type of the chosen parameter. Builder inference: a variable of the
   receiver of a lambda without bounds stays open while the lambda is
   checked (`sequence { yield(1) }`).
 - Inference variables have nullable views (`T?` of a variable shares its
   bounds); a recursive bound (`T : Comparable<T>`) without other bounds
   becomes `Comparable<*>`.
 - **Statements in expressions**: `if`, `when`, `try` and jumps inside an
   expression are lifted into statements before it (`fn.pre`, `capture`,
   `withPre`); `ordered` keeps the order of evaluation by spilling earlier
   operands into temporaries.
 - **Inline functions are ordinary calls.** A `return` out of a lambda is
   a `$kt.Return` with the token of the target function (`nonLocalTarget`
   catches it), `break`/`continue` are `$kt.Break`/`Continue` with the
   label of the loop (`nonLocalJumps`).
 - `tailrec`: the body is a labeled loop; a call of the function itself in
   a tail position (also in the branches of `if` and `when`) assigns the
   parameters through temporaries and continues (`tailStatements`).
 - Overrides take default values: the default expressions of the
   overridden function are translated into the override with its
   parameter names (`inheritedDefault`).
 - Suspend functions and lambdas are generators (`yield* $kt.suspended`);
   `sequence { }` steps the generator of the block and `yield` gives a
   value up (`SequenceScopeImpl`, `SEQUENCE_VALUE`).

## The library

 - `Kt.addLibrary(id, source)`: the source of a package is split into
   declarations at the lines of column 0 (with their annotations) and
   indexed by package and name; a declaration is parsed at the first
   lookup of its name, a function is translated at its first call
   (`$kt.lazyFunction` stubs on the facade object), a class at its first
   use (`runtime.lazyClass`). `$\{` in the sources stands for `${`.
 - **Builtins** are Kotlin declarations with `@JvmMapped("java class",
   "kind")`: their bodiless members are the Java methods of the same name
   (or `@JvmName`), `@Intrinsic` members are translated in place
   (`String.length`, array access). The statics of the Java class stay
   reachable through the builtin (`Integer.toBinaryString`).
 - `external` functions and properties are natives: `Kt.natives[owner]`
   by `Kt.nativeKey` (`kotlin.text/String.substring(Int)`).
 - Members of library classes are checked when the class is translated;
   a library function whose override is translated first gets its default
   values checked then.

## The session and the unit

 - A unit: its classes are entered, completed and checked, then the
   functions, then the statements in one run function; `main` (if any) is
   called at its end. The value is the last expression (`$kt.show`).
 - Host modules are objects `app.App` with `external` members whose natives
   are those of Java (`Java.hostMethod`); a global module's package is a
   default import. Host files: an unknown class name `Name` is looked up in
   `Name.kt` (classes and objects), translated as one chunk with its own
   source.

## Fibers and threads

 - As in Java: a function or a lambda waits if it calls a native that
   waits (`Thread.sleep`, `join`, `Object.wait` - `method.async` of the
   Java library) or a function that waits, a call on an object if an
   override with the same name waits (`asyncNames`, shared with the Java
   session), a call of a function value if a lambda waits (`$invoke`).
   The fixed point is `Session.markWaiting`, after each unit and each
   library declaration is checked.
 - A waiting function is a generator with a plain wrapper
   (`$j.asyncFunction`); a fiber calls it with `yield* $j.fiberCall`. A
   library function not translated yet that takes a lambda is called the
   same way when some lambda waits: its stub has a `$gen` that translates
   it and runs it as a fiber or as plain code.

## Known places

 - The line of an exception thrown by the run time (`$kt.arrayGet`) comes
   from the stack taken in its constructor: see
   [Java](java.md#known-places) on the frames that V8 keeps.
 - V4 runs a call anywhere in a `return` as a tail call and loses the
   frame of the function: a value with a call is returned through a
   temporary (`returnValue`), as in Java.
