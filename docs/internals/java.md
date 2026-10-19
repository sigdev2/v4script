# Java in the translator

What a user gets: [the Java reference](../languages/java.md); the general
design: [the translator](translator.md). Java objects are JavaScript
objects (classes are constructors), the standard library is written in
Java (the sources are in `library-*.js`) and translated by the same
translator on demand; natives are only what cannot be written in Java. The
reference of output is JDK 19 (`java --enable-preview`): the samples were
checked with it.

| File | Role |
| --- | --- |
| [lexer.js](../../js/translator/java/lexer.js) | tokens by character codes, `\uXXXX`, text blocks |
| [parser.js](../../js/translator/java/parser.js), [parser-declarations.js](../../js/translator/java/parser-declarations.js), [parser-statements.js](../../js/translator/java/parser-statements.js), [parser-expressions.js](../../js/translator/java/parser-expressions.js) | parsing; a unit is a jshell snippet (top-level methods, variables and statements) |
| [types.js](../../js/translator/java/types.js), [symbols.js](../../js/translator/java/symbols.js) | types (primitives, classes with arguments, arrays, type variables, wildcards, inference variables), subtyping, erasure, substitution; symbols of classes and members |
| [symtab.js](../../js/translator/java/symtab.js) | the class table of a session; the library by compilation units, automatic packages |
| [checker.js](../../js/translator/java/checker.js), [checker-members.js](../../js/translator/java/checker-members.js), [checker-expressions.js](../../js/translator/java/checker-expressions.js), [checker-calls.js](../../js/translator/java/checker-calls.js), [checker-statements.js](../../js/translator/java/checker-statements.js) | checking: name environments, members and their JavaScript names, expressions, overload resolution and type inference, statements, reachability, exhaustiveness of `switch`; messages as javac's |
| [codegen.js](../../js/translator/java/codegen.js), [codegen-expressions.js](../../js/translator/java/codegen-expressions.js), [codegen-statements.js](../../js/translator/java/codegen-statements.js) | translation into `J.*`: classes, constructors, initializers, calls, boxing, patterns, exceptions, fibers |
| [runtime.js](../../js/translator/java/runtime.js) | `$j`: classes, type checks, arrays, boxing, strings and numbers as text, exceptions, values for JavaScript, fibers and threads |
| [format.js](../../js/translator/java/format.js) | `String.format` (`java.util.Formatter`) |
| [natives-lang.js](../../js/translator/java/natives-lang.js), [natives-util.js](../../js/translator/java/natives-util.js) | natives of `java.lang`, `java.io`, sorting and copying arrays; `Java.regex` - the Java regular expression syntax in JavaScript |
| `library-*.js` | the library in Java: `lang`, `io`, `function`, `util`, `collections`, `maps`, `arrays`, `stream`, `concurrent`, `regex`, `math`, `js` (`JsValue`, `Js`, `JsException`, host modules) |
| [language.js](../../js/translator/java/language.js) | the session: the shared scope of the units, the unit, `main`, the value, classes from host files, the run and its continuation in timers |

## Values

 - `int`, `short`, `byte`, `char` are numbers with truncation; `long` is
   the hybrid (see [the translator](translator.md#decisions)); `float` goes
   through `Math.fround`.
 - **`String`, `Integer`, `Boolean` are JavaScript values themselves** (a
   string, a number, a boolean): boxing an `int` costs nothing, Java and
   JavaScript strings are both UTF-16. The other wrappers (`Long`,
   `Double`, `Float`, `Short`, `Byte`, `Character`) are objects with
   `.value`: in an `Object` variable a number must stay an `Integer`, not
   become a `Double`. The price: `==` on strings and `Integer` compares
   values.
 - A call on a value that may be such a primitive (the types `Object`,
   `Comparable`, `CharSequence`, `Number`, `Serializable` or a type
   variable with such a bound - `HOLDERS`) goes through `$j.invoke`,
   `$j.str`, `$j.equals`, `$j.hashCode`: the methods come from the
   prototypes of `String`, `Integer`, `Boolean`. A native method of
   `String` itself is called directly with the string as `this`
   (`$j.nonNull` before it: `Number(null)` would give 0 instead of an NPE).
 - Arrays of primitives are typed arrays, arrays of `long`, `boolean` and
   references are plain ones; the type descriptor (`[I`,
   `[Ljava.lang.String;`) is the property `$d` (`arrayDescriptor`).
 - A class is an empty JavaScript constructor in the table `$K`
   (`$K.byName` by the full name); default field values are on the
   prototype, static fields are `s$name` on the constructor. Java
   constructors are the methods `$init`, `$init<N>` (called non-virtually:
   `new C().$init1(x)`), field initializers are `$fi`, static ones
   `$clinit` right after the classes of the chunk are defined (a library
   chunk is a compilation unit translated at its first use). The
   JavaScript name of a method is `name$arity`, with the parameter types
   after erasure when arities clash. `$is` is the set of classes and
   interfaces for `instanceof`, `$meta` the name, the kind (`enum`,
   `record`) and the functional method. `default` methods of interfaces
   are copied into the class prototype (`finishClass`).
 - A lambda is an object of the functional interface (`$j.lambda`),
   method references are lambdas. Generics are erased; results of generic
   methods get no implicit `checkcast`.
 - Java exceptions are `Throwable` objects thrown as they are; `$j.caught`
   turns JavaScript errors in `catch` into Java exceptions (a `TypeError`
   is an NPE, a V4 stack overflow a `StackOverflowError`).

## Type inference

`checker-calls.js` resolves overloads by the phases of javac (strict, with
boxing, with variable arity) and infers type arguments: inference
variables (`ivar`) with bounds, their incorporation and resolution in
groups. An argument that is a call without a target (POLY,
`foo(List.of())`) stays unresolved and gives the candidate a provisional
type (`Java.provisional`); lambdas and inexact method references are
deferred until the other arguments determine their parameter types
(`deferredArgument`, `takePostponed`). An exact method reference gives
bounds at once. Between overloads with functional parameters the arity of
the lambda, the shape of its body (a value or `void`) and the preference of
a value (`preferValueLambdas`) decide. When only one candidate has the
needed number of parameters, the error is reported at the unsuitable
argument (`incompatible types`), as javac does.

## The library

 - `Java.addLibrary(id, package, source)`: the source is split into
   compilation units by top-level class (`id/Class`, with the imports of
   the header and the original line numbers). A compilation unit is parsed
   when its class is first looked up (`Symtab`) and translated when the
   class is first used at run time: `$K.id` is a lazy property
   (`Runtime.lazyClass`, `Session.compileUnit`). The body of a library
   method is checked and translated at its first call (`Runtime.lazyMethod`,
   `Session.compileLazyMethod`). Otherwise a two-line program would have to
   translate the whole library (seconds in V4);
   `run-samples.mjs java --library` translates everything at once to find
   errors in the library itself.
 - A native is a `native` method in the source plus a function
   `Java.natives['package.Class']['name(types after erasure)']` with the
   receiver as `this`.
 - The iteration order of `HashMap` (the table of JDK 19: a hash with the
   high bits mixed in, buckets, doubling that keeps the order), the texts
   of `toString`, of exceptions and of `Double.toString` (the two-digit rule
   of JDK 19) repeat the JDK: programs print the same.
 - Library chunks are marked with the source `library`: the place of an
   error in them is the user line that called the library.
 - Standard input: `System.in` is a `StandardInputStream` over the host
   input; `Scanner` reads it lazily, `BufferedReader` over
   `InputStreamReader` reads lines.
 - Host modules: a module is the class `name.Title` with static native
   methods (overloads for optional parameters); a global module is imported
   with `import static` implicitly. The package `js` has `JsValue`, `Js`
   and `JsException` (`library-js.js`).

## The session and the unit

 - Top-level methods and variables are static members of the session
   class `$main` (`$K.$session`); the classes of a unit go to
   `userClasses`. The declarations of a unit first go into the layer
   `pending` and join the shared scope only after a successful check
   (`commit`). A method with the same signature replaces the old one.
 - The statements of a unit form the function `$block`; `main(String[])`
   of the first class of the unit that has one is called after them. The
   value is the last expression statement (`$j.show`: the text as Java
   prints it).
 - A class from a host file: an unknown top-level class name is looked up
   in the host file `Name.java` (`Session.moduleClass`); the file is
   translated as one chunk with its own source and does not see the
   declarations of units (`top.module`). A changed file is translated again
   (`refreshModules` at the start of a run).

## Fibers and threads

 - A function is a fiber if it calls a native that waits (`Thread.sleep`,
   `join`, `Object.wait`, …) or a fiber; a call on an object counts if any
   override with the same name waits (`asyncNames`, shared by the units).
   The fixed point is `Session.markAsync`. A fiber is translated into a
   generator `$gen` and a plain wrapper (`$j.asyncFunction`): the library
   and JavaScript call the wrapper (the generator runs at once,
   `runNested`), a fiber calls `yield* $j.fiberCall(...)`.
 - **Library methods that wait** (`FutureTask.get`, `BlockingQueue.take`,
   a pool worker…) are listed in `Java.ASYNC_NATIVES` (`runtime.js`): the
   library is translated lazily, so this cannot be inferred from calls
   before the calling code is translated. A new waiting library method goes
   there.
 - A thread is a fiber of the scheduler (`startThread`); `wait`/`notify`
   are `park`/`wakeUp`, there are no locks (`synchronized` is a plain
   block), threads switch only on waits. The end of the program
   (`awaitThreads`) waits for the threads except daemons and pool workers
   that wait for tasks (`fiber.idleWorker`): a pool without `shutdown` does
   not keep the program. An uncaught exception of a thread goes to the error
   stream as text, as in the JVM.

## Known places

 - V4 (Qt 6.4) workarounds: typed arrays have no `sort` (sorting of
   primitives is our own, `natives-util.js`); `sort` and `splice` break an
   array after `shift` (fiber queues are new arrays); a tail call of a
   generator function returns `undefined` (`$j.fiber` makes the generator
   not in a tail position); a `return` with a call runs as a tail call even
   where it is not one (`return a.b = c ? d : f()` loses the assignment),
   and the frame disappears from the error stack (`returnValue` goes
   through a temporary); in a generator `finally` after `return` sees
   another `this` (`thisRef` goes through a variable); `\B(?=…)` in
   `replace` inserts twice (`groupDigits` without a regular expression);
   regular expressions from a position and `substr` over a long text are
   slow (the lexer walks character codes). See
   [V4 pitfalls](v4-pitfalls.md).
 - Missing: access checks (`private`) and checked exceptions, reflection,
   helpful NPE messages (JEP 358), `at …` lines in `printStackTrace`,
   `java.time`, `java.nio`, `CompletableFuture`, the locks of
   `java.util.concurrent.locks`.
 - Measured (Windows, V4): a `println` unit with a new session takes about
   0.05 s; the samples `tests/samples/java` take 0.08-0.55 s, almost all of
   it is translating parts of the library at their first use.
