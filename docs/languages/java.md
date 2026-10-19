# Java

Java 21 without files, network and reflection, translated into JavaScript
by v4script. Classes, interfaces, generics, enums, records, lambdas,
streams, collections, exceptions and threads behave as in Java, the output
matches the JDK, and error messages are like those of `javac` and the JVM.
The JDK subset is written in Java and translated on first use.

```java
record Item(String name, double price) {}

var in = new Scanner(System.in);
var items = new ArrayList<Item>();
while (in.hasNext())
    items.add(new Item(in.next(), in.nextDouble()));
var top = items.stream().max(Comparator.comparingDouble(Item::price)).orElseThrow();
System.out.printf("Most expensive: %s (%.2f)%n", top.name(), top.price());
System.out.println(greet(top.name()));   // a function of the host module "app"
items.size()                             // the value of the run
```

## A unit is a program fragment

 - A unit is written as in `jshell`: besides classes, interfaces, enums
   and records it may have top-level **methods, variables and
   statements** - without `class Main`. Statements run in order.
 - **A whole program.** If the unit has a class with
   `public static void main(String[] args)` (the first such class of the
   unit), its `main` runs after the statements of the unit: a program from
   `Main.java` can be run as it is. `args` is an empty array.
 - **import** may be left out: the packages `java.lang`, `java.util`,
   `java.util.function`, `java.util.stream`, `java.util.concurrent`,
   `java.util.concurrent.atomic`, `java.util.regex`, `java.math`,
   `java.io` and `js` are visible. A written `import` does no harm - so the
   code also builds with a real `javac`.
 - **Value.** If the last statement of the unit is an expression with a
   value (`x * 2`, `fib(20)`, `list`), the run returns it: numbers and
   booleans as they are, anything else as `String.valueOf` text
   (`[1, 2, 3]`, `{x=1}`, `Point[x=1, y=2]`). The semicolon after the last
   expression may be left out.
 - **Shared declarations.** Classes, methods and top-level variables of
   one unit are visible in the other Java units. Running a unit again
   declares them again: a class and a method with the same signature
   replace the old ones, a variable gets a new value.
 - A unit with a translation error does not change the shared
   declarations.

## What is supported

 - **Types**: all primitives with overflow as in Java (`int` is 32 bits,
   `long` 64, exact), `float` rounded to `float`, `char` a UTF-16 unit;
   boxing and unboxing, `var`, text blocks `"""`, `instanceof` with a
   variable, checked casts (`ClassCastException`).
 - **Classes**: inheritance, abstract classes, interfaces with `default`,
   `static` and `private` methods, nested (`static`), inner
   (`outer.new Inner()`), local and anonymous classes, initializer blocks,
   `this(...)` and `super(...)`, `final`, `Object.equals`, `hashCode`,
   `toString`, `clone`.
 - **Enums** with fields, constructors, methods and constant bodies,
   `values()`, `valueOf`, `ordinal`, `EnumMap`, `switch` over an enum.
 - **Records** with a compact constructor and methods; `equals`,
   `hashCode` and `toString` as in Java.
 - **Generics**: classes, interfaces and methods with type parameters,
   bounds (`<T extends Comparable<T>>`), `?`, `? extends`, `? super`, type
   inference (`new ArrayList<>()`, `Collectors.groupingBy(...)`,
   `Comparator.comparing(...).thenComparing(...)`).
 - **Lambdas and method references** (`String::length`, `ArrayList::new`,
   `int[]::new`) with any functional interface, own ones too.
 - **switch**: the old one with fall-through and the new one with arrows,
   `switch` expressions with `yield`, over strings, enums and types:
   patterns `case Circle c`, record patterns `case Point(int x, int y)`,
   guards `when`, `case null`; `sealed` hierarchies with `permits` - a
   `switch` without `default` is checked for exhaustiveness.
 - **Statements**: `for`, `for (x : collection)`, `while`, `do`, labels
   with `break` and `continue`, `try`/`catch`/`finally`, `catch (A | B e)`,
   `try` with resources (`AutoCloseable`), `throw`, `throws`, varargs
   (`int...`).
 - **Threads**: `Thread`, `Runnable`, `start`, `join`, `Thread.sleep`,
   `wait`/`notify`/`notifyAll`, `synchronized`, `Executors` pools
   (`newFixedThreadPool`, `newCachedThreadPool`,
   `newSingleThreadExecutor`…), `Future`, `Callable`, `invokeAll`,
   `CountDownLatch`, `BlockingQueue`, `ConcurrentHashMap`,
   `CopyOnWriteArrayList`, `AtomicInteger` and others. Threads take turns
   (they do not run in parallel) and switch only when a thread waits
   (`sleep`, `join`, `wait`, `get`, `take`…), so `synchronized` does
   nothing. When all of them wait for time, the run ends and the program
   goes on in timers of the engine (see
   [programs that wait](README.md#shared-rules)).
 - **The end of the program** comes when the statements of the unit (and
   `main`) and all non-`daemon` threads have ended. A pool that was not
   shut down does not hold the end: the program ends when its threads wait
   for tasks (the JVM would wait forever). If all threads wait for each
   other, it is the error `deadlock: all threads are waiting`.

## The standard library

| Package | What is there |
| --- | --- |
| `java.lang` | `Object`, `String` (all common methods, `format`, `formatted`, `split` and `replaceAll` with regular expressions, `chars`, `repeat`, `strip`…), `StringBuilder`, `Math` (and `StrictMath`), `Integer`, `Long`, `Double`, `Float`, `Short`, `Byte`, `Character`, `Boolean` (parsing, `toString(n, radix)`, `toBinaryString`, `bitCount`, `MAX_VALUE`…), `System` (`out`, `err`, `in`, `currentTimeMillis`, `nanoTime`, `arraycopy`, `exit`), `Thread`, `Comparable`, `Iterable`, `Runnable`, `AutoCloseable`, `Enum`, `Record`, `Class` (`getName`, `getSimpleName`), exceptions |
| `java.util` | `ArrayList`, `LinkedList`, `Vector`, `Stack`, `ArrayDeque`, `PriorityQueue`, `HashMap`, `LinkedHashMap`, `TreeMap`, `EnumMap`, `HashSet`, `LinkedHashSet`, `TreeSet`, `List.of`, `Set.of`, `Map.of`, `Arrays`, `Collections`, `Objects`, `Optional` (and `OptionalInt`…), `Iterator`, `Comparator`, `Random` (the same numbers as Java for the same seed), `Scanner` (over a string or `System.in`), `StringJoiner`, `IntSummaryStatistics`… |
| `java.util.function` | `Function`, `BiFunction`, `Supplier`, `Consumer`, `Predicate`, `UnaryOperator`, `BinaryOperator` and all primitive variants (`IntUnaryOperator`, `ToIntFunction`…) |
| `java.util.stream` | `Stream`, `IntStream`, `LongStream`, `DoubleStream`, `Collectors` (`toList`, `toSet`, `toMap`, `joining`, `groupingBy`, `partitioningBy`, `counting`, `summingInt`, `averagingDouble`, `mapping`, `reducing`…) |
| `java.util.concurrent`, `.atomic` | see Threads above; `TimeUnit`, `ThreadLocalRandom`, `ExecutionException` |
| `java.util.regex` | `Pattern`, `Matcher` (`find`, `matches`, `group`, named groups, `replaceAll` with a function, `results`) |
| `java.math` | `BigInteger`, `BigDecimal`, `MathContext`, `RoundingMode` |
| `java.io` | `PrintStream` (`System.out`, `System.err`), `InputStream` (`System.in`), `Reader`, `InputStreamReader`, `BufferedReader`, `StringReader`, `IOException`, `UncheckedIOException` |

 - The iteration order of `HashMap` and `HashSet`, `toString` texts and
   exception messages are those of the JDK: a program prints the same as in
   Java.
 - `System.out.printf` and `String.format` support all conversions (`%d`,
   `%s`, `%f`, `%e`, `%g`, `%x`, `%o`, `%c`, `%b`, `%h`, `%n`, `%%`),
   flags, width and precision as in Java (`%.2f` of 2.675 is `2.68`).
 - `System.err` is standard error.
 - **Input**: `System.in` is standard input of the host:
   `new Scanner(System.in)` and
   `new BufferedReader(new InputStreamReader(System.in))` wait for the next
   lines; `hasNext()` is `false` and `readLine()` is `null` at the end of
   input.

## JavaScript and host modules

The package `js` (visible without `import`) works with JavaScript values:
a JavaScript value in Java is a `JsValue`.

| Method | What it does |
| --- | --- |
| `Js.global()` | the JavaScript global object |
| `v.get("name")`, `v.set("name", value)`, `v.has("name")`, `v.delete("name")` | a property of an object |
| `v.get(i)`, `v.set(i, value)`, `v.length()`, `v.toList()` | elements and length of an array (and a string) |
| `v.call("method", arguments…)` | a method call; the result is a `JsValue` |
| `v.invoke(arguments…)`, `v.newInstance(arguments…)` | a call of a JavaScript function, `new` |
| `v.asInt()`, `asLong()`, `asDouble()`, `asBoolean()`, `asString()` | the value as a number, boolean, string |
| `v.isNull()`, `isUndefined()`, `isNumber()`, `isString()`, `isArray()`, `isFunction()`, `typeOf()`, `truthy()` | checks |
| `v.keys()`, `v.toJava()` | property names; the whole value in Java (an array as `ArrayList`, an object as `LinkedHashMap`) |
| `JsValue.of(value)` | a Java value as a `JsValue` |

Drawing on a canvas that the application put into the global variable
`canvas` (as [examples/canvas](../../examples/canvas) does):

```java
var ctx = Js.global().get("canvas").call("getContext", "2d");
for (int i = 0; i < 10; i++) {
    ctx.set("fillStyle", "hsl(" + i * 36 + ", 70%, 50%)");
    ctx.call("fillRect", i * 30, 20, 25, 100);
}
```

 - The arguments of `call`, `set`, `invoke` go to JavaScript by their
   value: numbers as numbers (`long` too), `String` and `char` as strings,
   arrays, lists and sets as arrays, `Map` and records as objects, an enum
   as the name of its constant, `JsValue` as its value, a lambda as a
   JavaScript function.
 - A lambda can be given to JavaScript:
   `Js.global().set("square", (IntUnaryOperator) x -> x * x);` -
   JavaScript calls `square(7)`, the arguments are converted to the
   parameter types of the interface and the result back.
 - A JavaScript exception is a `JsException` with its text
   (`RangeError: …`) at the line of the call; `catch` catches it.
 - **Host modules**: a module `app` is the class `app.App` with static
   methods of the JavaScript names (`App.greet("Ann")`, `App.counter()`
   for a getter); a unit sees the methods of a global module without the
   class name (an implicit `import static app.App.*`). Types: `int` is
   `long`, `number` `double`, `string` `String`, `bool` `boolean`, `value`
   `JsValue` (a parameter takes any `Object`), `array` `List<JsValue>`;
   optional parameters give overloads.

## Modules

A class that is not in the units and the library is looked up in the host
file with its name: `Mathx.triple(5)` loads the host file `Mathx.java` - a
file with top-level classes (no statements). Its classes are visible to all
Java units and may use other host files. A changed file is translated again
at the next run.

## Errors

 - Translation errors are like those of `javac`, with the line:
   `cannot find symbol`,
   `incompatible types: String cannot be converted to int`, `';' expected`,
   `missing return statement`,
   `method f cannot be applied to given types; required: int; found: no arguments`,
   `no suitable method found for abs(String)`.
 - An uncaught exception is reported as by the JVM, with the line where it
   happened: `Exception in thread "main" java.lang.ArithmeticException: / by zero`,
   `java.lang.ArrayIndexOutOfBoundsException: Index 3 out of bounds for length 3`,
   `java.lang.NullPointerException`,
   `java.lang.ClassCastException: class java.lang.String cannot be cast to class java.lang.Integer`.
   Infinite recursion is `java.lang.StackOverflowError` (it can be caught).
 - An exception in another thread is printed to standard error
   (`Exception in thread "worker" …`), the other threads go on.
 - `System.exit(0)` ends the program without an error, `System.exit(3)` is
   the error `exit status 3`.

## What is missing

 - Reflection (`Class.forName`, `getDeclaredMethods`), annotations with an
   effect (`@Override` and others are parsed, not checked), modules
   (`module-info`), `package` (a unit is the unnamed package), thread
   interruption (`interrupt` does nothing),
   `java.util.concurrent.locks`, `CompletableFuture`, `java.time`,
   `java.text`.
 - Files, network, processes, environment variables (`System.getenv`
   returns `null`); no `java.nio`.
 - `assert` is not checked (as `java` without `-ea`).
 - **No access checks and no checked exceptions:** a reference to a
   `private` member of another class and a call of a method with `throws`
   without `try` are not errors - a program that `javac` would reject for
   that runs.
 - **`==`** on strings and on `Integer`, `Boolean` compares values, not
   objects: `new String("a") == "a"` and `Integer` 1000 `==` 1000 are
   `true` (`false` in Java). `equals` works as usual.
 - A `NullPointerException` message has no JDK details ("Cannot invoke …
   because … is null"); `printStackTrace` prints the exception and its
   causes without `at …` lines.
 - If a method that other units already call is changed so that it starts
   to wait (`sleep`, `join`, `wait`), run those units again.
 - The first Java run in an engine is slower than the next ones: the
   library is translated part by part at the first use of a class.

Shared rules: [languages](README.md#shared-rules). Internals:
[Java in the translator](../internals/java.md).
