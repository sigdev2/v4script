# Host modules

A host module is an API of the application that programs in every language
can call: a package in Go, a header in C and C++, a class in Java, a static
class in C#, a unit in Pascal, predicates in Prolog, procedures in Scheme, imports in
WebAssembly. The implementation is one JavaScript object (often a wrapped
`QObject`); the description of its functions tells every language how to
show and convert them.

```cpp
struct HostModule {
    QString name;                  // "app": package, header, unit, library name
    QJSValue object;               // the implementation
    QList<HostFunction> functions; // what programs see
    bool global = true;            // functions visible without import or qualification
};
```

## From a QObject

```cpp
class Store : public QObject {
    Q_OBJECT
    Q_PROPERTY(double total READ getTotal)
public:
    Q_INVOKABLE double price(const QString& item) const;
    Q_INVOKABLE QString buy(const QString& item, int count = 1);
    Q_INVOKABLE QStringList items() const;
    double getTotal() const;
};

Store store; // outlives the engine
runtime.addModule("store", &store);              // Runtime
// engine.addModule(v4script::HostModule::fromQObject(qmlEngine, "store", &store));
```

 - Public `Q_INVOKABLE` methods and public slots become functions; default
   arguments become optional parameters (moc clones). Real overloads are
   ignored: the first method of a name wins.
 - Readable properties become getters (a property read on every call).
 - Types: `bool` → `bool`; integer types → `int`; `double`, `float` →
   `number`; `QString` → `string`; `QVariantList`, `QStringList` → `array`;
   `void` → `void`; anything else (`QJSValue`, `QVariant`, `QVariantMap`,
   `QObject*`) → `value`.
 - The object stays owned by the application (`CppOwnership`) and must
   outlive the engine. `Runtime::reset()` wraps it again for the new
   engine.

## From signatures

```cpp
QJSValue text = runtime.jsEngine()->evaluate(
    "({ shout: function (s) { return s.toUpperCase() + '!'; },"
    "   words: function (s) { return s.split(' '); },"
    "   get version() { return '1.0'; } })");
runtime.addModule(v4script::HostModule("text", text, {
    "string shout(string s)",
    "array words(string s)",
    "string version",                 // a getter: no parentheses
}, /*global*/ false));
```

A signature is `result name(type parameter, type parameter?)`:

 - `name` is camelCase (`createOrder`); languages convert it
   (`create_order`, `CreateOrder`, `create-order`, `CREATEORDER`).
 - A trailing `?` marks an optional parameter; only trailing parameters
   may be optional. Missing optional arguments are not passed to the
   implementation at all (`undefined` and `null` at the end are dropped).
 - `type name` without parentheses is a getter: the implementation is the
   property `name` of the object, read on every call.
 - `HostFunction::parse` throws `std::invalid_argument` on a wrong
   signature; `toSignature()` gives it back.

| Type | Aliases | In the languages |
| --- | --- | --- |
| `void` | - | no result (results only) |
| `bool` | `boolean` | the boolean of the language (`-1`/`0` in BASIC and Forth) |
| `int` | `integer`, `long` | a 64-bit integer where the language has one: `int64`, `long`, `long long`, `Int64`; `DOUBLE` in BASIC |
| `number` | `double` | a float: `float64`, `double`, `Double`; Forth's float stack |
| `string` | - | a string of the language |
| `value` | `any` | any JavaScript value: `js.Value`, `JsValue`, `js_value`, `OBJECT`, `JSValue`, a Forth handle, `externref`; a parameter accepts any value of the language |
| `array` | `list` | an array of values: `[]js.Value`, `List<JsValue>`, a list, a vector |

## How languages show a module

For a module `app` with `greet`, `isEven` and the getter `counter` (see
the full table in [languages](../languages/README.md#host-modules)):

| Language | Global functions | Through the module |
| --- | --- | --- |
| JavaScript | `greet("Ann")`, `counter` (a property) | `app.greet("Ann")` |
| Python | builtins `greet("Ann")`, `counter()` | `import app` |
| Lua | globals | the table `app` |
| Prolog | predicates `greet('Ann', G)`, `is_even(4, E)`; the result is the last argument | `app:greet('Ann', G)` |
| Perl | subroutines of `main` | the package `app::` |
| PHP | global functions | the namespace `app\` |
| Go | - (imported implicitly) | the package `app`: `app.Greet`, `app.IsEven` |
| C, C++ | `greet`, `is_even` (included header) | `#include <app.h>`: `app_greet`, `app_is_even` |
| Java | static import: `greet("Ann")` | the class `app.App`: `App.greet` |
| C# | `using static`: `Greet("Ann")`, `Counter` | the static class `App`: `App.Greet`, `App.Counter` |
| Forth | words `greet`, `is-even` | words `app.greet`, `app.is-even` |
| BASIC | `GREET("Ann")`, `COUNTER` | the object `APP`: `APP.greet("Ann")` |
| Pascal | `Greet('Ann')`, `Counter` | the unit `App`: `App.Greet('Ann')` |
| WebAssembly | - | `(import "app" "greet" (func …))` |
| Scheme | `(greet "Ann")`, `(is-even 4)` | the object `app`: `(app.greet "Ann")` |

 - A **global** module puts its functions next to the built-in ones
   (`global = true`, the default); a non-global one is reached only
   through its name (`import`, `#include`, `uses`, qualification).
 - A global function **never hides a built-in name** of the language: in
   C `log` is the one of `math.h`, in Python `range` is Python's, in Scheme
   `log` is Scheme's. The function stays reachable through the module
   (`app_log`, `app.log`). Choose names that do not clash, or make the
   module non-global.
 - Optional parameters give overloads (Java, C#, Pascal), predicates of several
   arities (Prolog), a trailing `...any` (Go), `NULL`/0 (C, Forth).

## Values and errors

 - Arguments are converted to the parameter types before the call: an
   `int` parameter gets an integer number, a `string` a JavaScript string,
   `value` and `array` the JavaScript value of the language's value (a list
   becomes an array, a map or a record an object). A `value` parameter
   takes strings and numbers in every language except where the language
   has no such conversion: C and C++ need `js_from_int`/`js_from_double`
   for a number, Forth a handle (`js"`, `n>js`).
 - Results are converted back by the result type: `array` gives the
   language's array of values; `value` a handle or an object of the
   language.
 - An exception thrown by the implementation (a JavaScript error, or a
   `QJSEngine::throwError` from C++) is an error of the program at the line
   of the call, with the exception's text; languages with exceptions can
   catch it (`try`, `CATCH`, `guard`, `ON ERROR`).

## Rules

 - Add modules **before the first run** of a language: a language sees the
   modules that existed when it loaded. Plain JavaScript sees a new module
   at once.
 - A module added again with the same name replaces the old one.
 - The implementation runs in the thread of the engine, inside the program;
   a long operation blocks the program (and counts against the time
   limit).
