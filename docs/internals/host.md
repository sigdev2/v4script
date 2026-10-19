# The host layer

[js/host/host.js](../../js/host/host.js) builds the `host` object that every
language adapter receives, and the bridge
([src/HostBridge.hpp](../../src/HostBridge.hpp), implemented in
[src/Engine.cpp](../../src/Engine.cpp)) connects it to C++. The same file runs in Node.js under
[tools/run-samples.mjs](../../tools/run-samples.mjs) with a bridge of plain
JavaScript - so the languages behave the same in both.

```
v4script::Host (C++ callbacks)
        │
HostBridge (QObject in the engine, primitive methods)
        │
host.js factory (bridge, global) -> { host, run, installConsole, exposeModule }
        │
adapter (host) -> { run(code) }   one per language, js/adapters/<language>.js
        │
interpreter or translator session
```

## The bridge

The bridge is a `QObject` exposed to the engine with primitive methods:

| Method | Meaning |
| --- | --- |
| `write(stream, text)` | output to `Host::write` (0 output, 1 error, 2 warning) |
| `readLine()` | one line of input or `null` |
| `readModule(name)` | the text of a host file or `null` |
| `canvas()` | the canvas object or `undefined` |
| `clear()` | `Host::clear` |
| `unit()` | the name of the unit that runs now (`Engine::run(…, unit)`) |
| `modules()` | the host modules: `{ name, object, global, functions }` |
| `hasFormat()`, `format(value)` | `Host::format` if the application gave one |
| `compile(code, name)` | evaluates code under a file name (`/v4script/translated/<name>`) |
| `version` | the version of v4script |

## The host object

| Member | Meaning |
| --- | --- |
| `writer(stream)` | an output writer (`'stdout'`, `'stderr'`, `'warning'`): text in pieces, passed on in chunks ending with a line break; `flush()` gives the rest |
| `flush()` | flushes all writers (the end of a run, before input is read) |
| `readLine()` | one line of input; flushes the output first, so a prompt is visible |
| `input` | standard input shared by all languages of the engine: `readLine`, `readChar`, `peekChar`, `readAll`, `atEnd`, `isReady`; the end of input is asked again every time (a console may get more) |
| `readModule(name)` | the text of a host file (modules, `#include`, `open()`) |
| `canvas()`, `clear()` | graphics and clearing the output |
| `unit()` | the name of the current unit |
| `modules()` | the host modules: functions with `names` in every convention (`camel`, `pascal`, `snake`, `kebab`, `upper`, `title`) and `invoke(args)` that drops trailing missing optional arguments |
| `compile(code, name)` | compiles a translated chunk |
| `schedule(callback, delay)`, `cancel(id)` | timers for programs that wait |
| `error(message, line, source)` | an error object with a place |
| `format(value)` | the text of a value: `Host::format` or the built-in one |

`run(runner, code)` runs code with an adapter and returns `{ value }` or
`{ error, line, source }`; `Engine::run` turns that into a
`v4script::Result`. `installConsole()` defines `console` and `print` for an
engine without its own (`Runtime` uses it). `exposeModule(spec)` gives a
host module to plain JavaScript: the object under the module name and, for a
global module, its functions as global functions (getters as global
properties); names that exist stay as they are.

## Adapters

An adapter is a file that evaluates to `function (host) -> { run(code) }`.
Translated languages share one generic adapter (`T.createAdapter` in
[core/session.js](../../js/translator/core/session.js)); interpreter-based
languages have their own (see [vendor](vendor.md)). An adapter:

 - prints through `host.writer(...)`, reads through `host.input`;
 - shows host modules in the conventions of its language, never hiding a
   built-in name of the language with a global host function (such a
   function stays reachable through the module: `app.log`, `APP.log`,
   `app_log`);
 - returns the value of a unit as a string (`host.format` for JavaScript
   values), or an error with the line of the unit or the name of the host
   file where it happened;
 - keeps its interpreter state alive between runs (declarations are shared
   by the units of one language) and restores it after an interruption.

## Engines and units

`v4script::Engine` attaches the layer to any `QJSEngine`: the application
may run v4script in its own `QQmlEngine` next to its QML. `Runtime` owns a
`QJSEngine` and adds `console`, timers (`setTimeout`, `setInterval`), a
watchdog thread with a time limit and `waitForFinished`. A language loads
on its first run (or `load()`), with the compiler hints silenced; its files
come from the resources `:/v4script/js/...` generated from
[languages.json](../../languages.json).

A *unit* is one piece of code run by `Engine::run(language, code, unit)`.
All units of a language in one engine form one program: declarations
(functions, classes, global variables) of one unit are visible in the next.
The unit name is what `host.unit()` returns while the unit runs.
