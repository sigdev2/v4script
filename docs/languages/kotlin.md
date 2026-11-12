# Kotlin

Kotlin 2.4 for the JVM without files, network and full reflection,
translated into JavaScript by v4script. Classes, data, sealed, enum and
value classes, objects, generics with variance and reified parameters,
extensions, operators, delegation, null safety with smart casts, lambdas
with receivers, inline functions, sequences and threads behave as with
`kotlinc` 2.4.21 on the JVM; the output and the error messages are those of
`kotlinc` and the JVM. The standard library is written in Kotlin and
translated on first use; under it is the Java library of the
[Java translator](java.md) (`StringBuilder`, `ArrayList`, `HashMap`, the
exceptions), as on the JVM.

```kotlin
data class Item(val name: String, val price: Double)

val items = generateSequence { readLine() }
    .map { line -> line.split(" ").let { Item(it[0], it[1].toDouble()) } }
    .toList()
val top = items.maxByOrNull { it.price }
println("Most expensive: ${top?.name} (${"%.2f".format(top?.price)})")
println(greet(top?.name ?: "nobody"))   // a function of the host module "app"
items.size                              // the value of the run
```

## A unit is a script

 - A unit is a Kotlin script (as a `.kts` file): **top-level statements,
   functions, properties, classes and type aliases** in any order. The
   statements run in order.
 - **A whole program.** A `fun main()` (or `fun main(args: Array<String>)`,
   `suspend fun main()`) of the unit runs after its statements: a `Main.kt`
   runs as it is. `args` is an empty array.
 - **Imports** may be left out for the packages Kotlin imports by default
   (`kotlin`, `kotlin.collections`, `kotlin.text`, `kotlin.ranges`,
   `kotlin.sequences`, `kotlin.comparisons`, `kotlin.io`, `kotlin.jvm`,
   `java.lang`), for `js` (JavaScript values) and for the global host
   modules. Other packages need `import`, as with `kotlinc`:
   `kotlin.math.*`, `kotlin.random.Random`, `kotlin.concurrent.thread`,
   `kotlin.properties.Delegates`, `kotlin.system.exitProcess`,
   `java.util.*`. An import of a package that is not there
   (`kotlinx.coroutines`) is the error `unresolved reference 'kotlinx'`.
 - **Value.** If the last statement of the unit is an expression
   (`x * 2`, `fib(20)`, `list`), the run returns it: numbers and booleans
   as they are, anything else as its `toString()` (`[1, 2, 3]`,
   `Point(x=1, y=2)`).
 - **Shared declarations.** Classes, functions and top-level properties of
   one unit are visible in the other Kotlin units. Running a unit again
   declares them again: a class and a function with the same signature
   replace the old ones, a property declared again gets a new value (and
   may get a new type). Objects made before keep their old class.
 - A unit with a compile error does not change the shared declarations.

## What is supported

 - **Types**: `Int`, `Long` (exact 64 bits), `Short`, `Byte`, `Double`,
   `Float`, `Char`, `Boolean`, `UInt`, `ULong`, `UShort`, `UByte` with
   overflow as on the JVM (`Int.MAX_VALUE + 1` is `-2147483648`); `String`
   with templates and raw strings (`trimIndent`, `trimMargin`); arrays
   (`IntArray`, `Array<T>`…); nullable types with `?.`, `?:`, `!!`, smart
   casts after `is`, `!= null`, `when` and `if`; `Nothing`, `Unit`,
   `Any`; type aliases.
 - **Classes**: primary and secondary constructors, `init` blocks,
   properties with getters, setters and `field`, `lateinit`, `const val`,
   `open`/`abstract`/`override`, interfaces with default methods and
   properties, `super<A>.f()`, `data class` (`toString`, `equals`,
   `hashCode`, `copy`, `componentN` as `kotlinc` makes them),
   `sealed class`/`sealed interface` with exhaustive `when`,
   `enum class` with properties, bodies of entries, `values()`,
   `valueOf`, `entries`; `object`, `data object`, `companion object`,
   object expressions, nested, `inner` and local classes, `fun interface`
   and SAM conversion of lambdas to Java interfaces (`Runnable`,
   `Comparator`), `@JvmInline value class` (a box: `toString` and `equals`
   of its value).
 - **Functions**: default and named arguments (overrides take the
   defaults of the overridden function), `vararg` and `*spread`,
   extension functions and properties, `infix`, `operator` (arithmetic,
   `get`/`set`, `invoke`, `contains`, `compareTo`, `rangeTo`,
   `iterator`, `getValue`/`setValue`, compound assignments), local
   functions, `tailrec` (a loop), generic functions with bounds,
   `where` and `reified` type parameters (`is T`, `T::class`).
 - **Lambdas**: function types with and without receivers
   (`StringBuilder.() -> Unit`), `it`, destructuring parameters, labels
   (`return@forEach`), anonymous functions, callable references
   (`::isOdd`, `String::length`, `Item::price`, `::Item`). Lambdas passed
   to `inline` functions may `return` from the enclosing function and
   `break`/`continue` its loops.
 - **Control flow**: `if` and `when` as expressions (with a subject, a
   subject variable, several conditions, `in`, `is`, guards with `if`),
   `try` as an expression, `for` over ranges (`..`, `..<`, `until`,
   `downTo`, `step`), arrays, strings, maps and iterables, `while`,
   `do`/`while`, labeled `break` and `continue`.
 - **Delegation**: `class C(x: I) : I by x`, `by lazy`, `by Delegates.observable`,
   `vetoable`, `notNull` and own delegates with `getValue`/`setValue`.
 - **Sequences and suspend functions**: `sequence { yield(x) }`,
   `yieldAll`, `iterator { }`, `generateSequence`, lazy chains;
   `suspend` functions (without `kotlinx.coroutines` they run as ordinary
   calls); the type argument of `sequence`, `buildList`, `buildMap` comes
   from the calls in the block (builder inference).
 - **Threads**: `Thread`, `kotlin.concurrent.thread { }`, `Thread.sleep`,
   `join`, `synchronized` - as fibers of the translator (as in
   [Java](java.md)): a thread runs until it waits, so the program prints
   the same every time; `synchronized` and `@Volatile` need no locks.

## The standard library

| Package | What is there |
| --- | --- |
| `kotlin` | `Any`, `String`, the numbers (`toInt`, `toString(radix)`, `mod`, `floorDiv`, `countOneBits`, `coerceIn`…), `Pair`, `Triple`, `to`, `Result` and `runCatching`, `lazy`, `repeat`, the scope functions (`let`, `run`, `with`, `apply`, `also`, `takeIf`), `require`, `check`, `error`, `TODO`, `synchronized`, the exceptions |
| `kotlin.collections` | `List`, `MutableList`, `Set`, `Map` and the builders (`listOf`, `mutableMapOf`, `buildList`…), `ArrayList`, `HashMap`, `LinkedHashMap`, `HashSet`, `ArrayDeque`, the functions of collections and arrays (`map`, `filter`, `groupBy`, `associate`, `fold`, `windowed`, `chunked`, `zip`, `partition`, `sortedBy`, `groupingBy`…) |
| `kotlin.text` | the functions of strings and characters, `StringBuilder` and `buildString`, `Regex` (`find`, `findAll`, `replace` with a lambda, `split`, `destructured`), `String.format` and `"…".format` |
| `kotlin.sequences` | `Sequence`, `sequence { }`, `generateSequence`, the lazy operations |
| `kotlin.ranges` | `IntRange`, `LongRange`, `CharRange`, progressions |
| `kotlin.math` | `sqrt`, `pow`, `abs`, `round`, `floor`, `ln`, `sin`…, `PI`, `E`, `absoluteValue`, `sign`, `roundToInt` |
| `kotlin.random` | `Random` and `Random(seed)` - the same numbers as Kotlin for the same seed |
| `kotlin.comparisons` | `compareBy`, `thenBy`, `naturalOrder`, `reverseOrder`, `maxOf`, `minOf` |
| `kotlin.properties` | `Delegates`, `ReadOnlyProperty`, `ReadWriteProperty`, `ObservableProperty` |
| `kotlin.concurrent`, `kotlin.system` | `thread`; `exitProcess`, `measureTimeMillis` |
| `kotlin.io` | `print`, `println`, `readLine`, `readln`, `readlnOrNull` |
| `kotlin.reflect`, `kotlin.jvm` | `KClass` (`simpleName`, `qualifiedName`, `isInstance`), `KProperty.name`; `javaClass` |
| `java.*` | the Java library of v4script: `java.util` (collections, `Scanner`, `Random`, `Optional`), `java.util.function`, `java.util.regex`, `java.math.BigInteger`, `java.lang` (`Math`, `Integer.toBinaryString`, `System.err`, `Thread`) |

 - `toString` of numbers (`1.0E21`, `3.3000002`), of collections and of
   data classes, the order of `HashMap` and `HashSet`, sorting (stable),
   `String.format` and exception messages are those of the JVM: a
   program prints the same as with `kotlinc`. The locale is `en_US`.
 - **Input**: `readLine()` and `readlnOrNull()` are `null` at the end of
   input, `readln()` throws `ReadAfterEOFException`.

## JavaScript and host modules

The package `js` (visible without `import`) works with JavaScript values:
a JavaScript value in Kotlin is a `JsValue`, the class of the
[Java translator](java.md#javascript-and-host-modules).

| Member | What it does |
| --- | --- |
| `Js.global()` | the JavaScript global object |
| `v["name"]`, `v["name"] = value`, `v.has("name")`, `v.delete("name")` | a property of an object |
| `v[i]`, `v.length()`, `v.toList()` | elements and length of an array (and a string) |
| `v.call("method", arguments…)` | a method call; the result is a `JsValue` |
| `v.invoke(arguments…)`, `v.newInstance(arguments…)` | a call of a JavaScript function, `new` |
| `v.asInt()`, `asLong()`, `asDouble()`, `asBoolean()`, `asString()` | the value as a number, boolean, string |
| `v.isNull()`, `isUndefined()`, `isNumber()`, `isString()`, `isArray()`, `isFunction()`, `typeOf()`, `truthy()` | checks |
| `JsValue.of(value)` | a Kotlin value as a `JsValue` |

Drawing on a canvas that the application put into the global variable
`canvas` (as [examples/canvas](../../examples/canvas) does):

```kotlin
val ctx = Js.global()["canvas"].call("getContext", "2d")
for (i in 0 until 10) {
    ctx["fillStyle"] = "hsl(${i * 36}, 70%, 50%)"
    ctx.call("fillRect", i * 30, 20, 25, 100)
}
```

 - The arguments of `call`, `set`, `invoke` go to JavaScript by their
   value as in Java: numbers as numbers, strings as strings, lists and
   arrays as arrays, a lambda as a JavaScript function:
   `Js.global()["square"] = { x: Int -> x * x }` - JavaScript calls
   `square(7)`.
 - A JavaScript exception is a `js.JsException` with its text
   (`RangeError: …`) at the line of the call; `catch` catches it.
 - **Host modules**: a module `app` is the object `app.App` with the
   functions of the module (`App.greet("Ann")`) and a property for a
   getter (`App.counter`); a unit sees the members of a global module
   without the object name. Types: `int` is `Long`, `number` `Double`,
   `string` `String`, `bool` `Boolean`, `value` `JsValue` (a parameter
   takes any `Any?`), `array` `List<JsValue>`; optional parameters give
   overloads.

## Modules

A class or an object that is not in the units and the library is looked
up in the host file with its name: `Mathx.triple(5)` loads the host file
`Mathx.kt` - a file with classes and objects. Its declarations are
visible to all Kotlin units and may use other host files. A changed file
is translated again at the next run.

## Errors

 - Compile errors are those of `kotlinc` 2.4 (the K2 compiler), with the
   line: `unresolved reference 'x'.`,
   `initializer type mismatch: expected 'String', actual 'Int'.`,
   `only safe (?.) or non-null asserted (!!.) calls are allowed on a nullable receiver of type 'String?'.`,
   `'val' cannot be reassigned.`,
   `'when' expression must be exhaustive. Add the 'is Triangle' branch or an 'else' branch.`,
   `syntax error: Expecting an expression.` The first error stops the
   translation.
 - An uncaught exception is reported as by the JVM, with the line where it
   was thrown:
   `Exception in thread "main" java.lang.ArithmeticException: / by zero`,
   `java.lang.NullPointerException` (`!!` of `null`),
   `java.lang.IndexOutOfBoundsException: Index 3 out of bounds for length 3`,
   `java.lang.ClassCastException: class java.lang.String cannot be cast to class java.lang.Integer (…)`,
   `java.lang.NumberFormatException: For input string: "1O"`,
   `java.lang.IllegalArgumentException` of `require`. Infinite recursion is
   `java.lang.StackOverflowError`. An uncaught exception in a thread is
   printed to the error stream, as by the JVM.
 - `exitProcess(0)` (and `System.exit(0)`) ends the program without an
   error, `exitProcess(3)` is the error `exit status 3`.

## What is missing

 - **kotlinx.coroutines** (`runBlocking`, `launch`, `async`, `delay`,
   `Flow`, channels) - it is a library outside the standard one; threads
   are there. `suspend` functions run without a dispatcher.
 - Reflection beyond `::class.simpleName`/`qualifiedName`/`isInstance`,
   `javaClass` and the name of a delegated property (no `members`, no
   `this::x.isInitialized`), annotations with an effect (`@JvmStatic`,
   `@JvmOverloads` and others are parsed), contracts, `expect`/`actual`.
 - Files, network, processes, `java.io` beyond standard input and output.
 - **Value classes** are boxes: `===` compares the boxes, there is no
   unboxed representation.
 - **Inline functions** are called as ordinary functions (a `return`,
   `break` or `continue` out of their lambdas works through an exception),
   so `inline` changes no speed.
 - **Type inference** is that of `kotlinc` for the usual code; a rare
   case (a lambda deep inside nested generic calls without an expected
   type, overloads that only the lambda's body decides) may need an
   explicit type argument.
 - **Boxed values:** a boxed `Int`, `Boolean` or `String` is the same
   JavaScript value as the unboxed one, so `===` on two boxed `Int`s is
   `true` where the JVM may answer `false`; `==` works as usual.
 - **Regular expressions** run on JavaScript `RegExp`, as in
   [Java](java.md#what-is-missing).
 - A unit that waits for time (`Thread.sleep`) goes on in timers; its value
   is not shown then. If a function that other units already call is
   changed so that it starts to wait, run those units again.
 - The first Kotlin run in an engine is slower than the next ones: the
   library is translated part by part at the first use.

Shared rules: [languages](README.md#shared-rules). Internals:
[Kotlin in the translator](../internals/kotlin.md).
