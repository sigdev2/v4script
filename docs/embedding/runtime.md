# Running code: Runtime and Engine

Two classes run programs:

| Class | Use it when |
| --- | --- |
| `v4script::Runtime` | the application wants a ready place to run code: it owns a `QJSEngine` and adds `console`, timers (`setTimeout`, `setInterval`), a time limit with a watchdog thread, `waitForFinished` and `reset` |
| `v4script::Engine` | the application already has an engine (a `QQmlEngine` shared with QML) with its own timers and limits: `Engine` attaches the languages to it |

`Runtime` is built on `Engine` (`runtime.engine()`), so everything below
about `Engine` holds for `Runtime` too.

## The host

`v4script::Host` is a set of optional callbacks through which programs
reach the world outside the engine. They run in the thread of the engine,
while the program waits.

| Callback | Called for | Without it |
| --- | --- | --- |
| `write(Stream, text)` | output: `Stream::Output`, `Stream::Error`, `Stream::Warning` (interpreter warnings: PHP notices, Prolog) | output is lost |
| `readLine()` | one line of standard input without its line break; `std::nullopt` - the end of input | programs see the end of input |
| `readModule(name)` | the text of a module or data file by the name the program wrote (`"util.py"`, `"lib.h"`, `"data.txt"`); `std::nullopt` - no such file | no modules and files |
| `canvas()` | a canvas object for BASIC `SCREEN` and Pascal `Graph` ([canvas](canvas.md)) | no graphics |
| `clear()` | clearing the output: `CLS`, `ClrScr`, `PAGE` | nothing happens |
| `format(QJSValue)` | the text of a JavaScript value in values of runs and in output of JavaScript values | strings as they are, other values as JSON |

`write` gets text in pieces that end with a line break, plus an unfinished
line at the end of a run, before input is read, before `clear()` and before
a translated program calls JavaScript or a host function (so that their
effects keep their order). A host that shows output by lines (a console of
messages) joins the pieces itself until a line break or the end of the run.
The host decides what a module name means: [v4run](../../examples/run/main.cpp)
reads files next to the program and refuses absolute paths and `..`.

`Runtime` has shortcuts: `setOutput`, `setInput`, `setInputText(text)`
(the lines of a text, then the end of input), `setModuleLoader`,
`setCanvas`, or `setHost` for all at once.

## Running code

```cpp
v4script::Result result = runtime.run("go", code, "main.go");
```

 - `language` is an id from `languages()` or `"javascript"`.
 - `unit` names the piece of code: a file, a cell of a notebook, a block of
   a document. Languages show it in errors and keep declarations per unit;
   output and timers of the run belong to it (`Engine::currentUnit()`).
 - **All units of one language in one engine form one program**:
   declarations of one unit (functions, classes, types, global variables)
   are visible in the next. A unit run again declares its functions and
   types again. Every language shares the global object with JavaScript.
 - A language loads into the engine at its first run: from tens of
   milliseconds to about a second. `load(language)` does it in advance and
   returns an error text or an empty string; `Runtime` never counts loading
   against the time limit.

`v4script::Result`:

| Field | Meaning |
| --- | --- |
| `status` | `Completed`, `Failed` (an error of the program or of loading the language), `Interrupted` (the time limit, `interrupt()`, `QJSEngine::setInterrupted`) |
| `value` | the value of the program as an interactive session shows it (the last expression in Python, Go, C…; the stack in Forth); empty - no value. See [languages](../languages/README.md#shared-rules) |
| `error` | the text of the error |
| `errorLine` | the line of the error in the unit, 1-based; 0 - unknown |
| `errorSource` | the module file where the error happened; empty - the unit itself |
| `elapsedMs` | the time of the run |

`isOk()` is `status == Completed`; `describeError()` gives
`error (line 3)` or `error (util.py, line 3)`.

## Programs that go on after a run

Programs that wait for time (`time.Sleep` in Go, `Thread.sleep` in Java,
`Thread.Sleep` and `Task.Delay` in C#,
`SLEEP` in BASIC, `Delay` in Pascal, `MS` in Forth, SRFI 18 threads in
Scheme, `setTimeout` in JavaScript) end their run when everything waits and
go on in timers of the engine. With `Runtime`:

 - run the Qt event loop, or call `waitForFinished(timeoutMs)` - it
   processes events until no timers are left (`-1` - no timeout) and
   returns `true` when nothing is left to run;
 - `isActive()` tells whether timers are waiting, `activeChanged(bool)`
   signals the change;
 - `stop()` cancels the timers: programs that wait end;
 - an error in a timer callback goes to `Host::write` as `Stream::Error`
   (there is no `Result` to return it in).

With `Engine` on its own engine, the engine must provide `setTimeout` and
`clearTimeout` in its global object (a `QQmlEngine` has none by default),
and timer callbacks should go through `Engine::call(function, arguments,
unit)` so that their output belongs to the right unit.

## Time limits and interruption

 - `Runtime::setTimeLimit(ms)` limits one continuous run of code: a
   `run()` or one timer callback (0 - no limit, the default). A program
   over the limit is interrupted (`Status::Interrupted`,
   `"The code ran longer than N ms"`); an interrupted timer callback stops
   all timers of the program.
 - `Runtime::interrupt()` interrupts running code from any thread.
 - An interrupted program keeps its declarations and variables; the
   languages restore their interpreter state before the next run. Output
   held by a language is flushed (`Engine::flush()`).
 - `Runtime::reset()` forgets everything: a new engine with the same host,
   modules and limits. A `QObject` module must still be alive; a module
   object created in the old engine (a `QJSValue`) is dropped and must be
   added again.

## Engine on an application engine

```cpp
QQmlEngine qml;
v4script::Engine languages(&qml, host);
languages.addModule(v4script::HostModule::fromQObject(&qml, "app", &api));
v4script::Result result = languages.run("lua", "return 6 * 7", "cell-1");
```

 - The constructor installs a compatibility layer (polyfills of later
   ECMAScript library functions and fixes of V4 bugs) and the host layer
   into the engine. `installConsole()` adds `console.log/info/debug`,
   `console.warn`, `console.error` and `print` writing to `Host::write`.
 - Add host modules before the first run of a language: a language sees
   the modules that existed when it loaded. Plain JavaScript sees a module
   at once (`app.greet()`, and `greet()` for a global module).
 - Time limits are the application's: `QJSEngine::setInterrupted(true)`
   from a watchdog interrupts the code, and the run returns
   `Status::Interrupted`.
 - Several `Engine`s (or `Runtime`s) are independent programs. Attach at
   most one `Engine` to a `QJSEngine`: the host layer lives in its global
   object.

## Errors of the library itself

A language that cannot load (a missing resource, a language excluded by
`V4SCRIPT_LANGUAGES`) gives `Status::Failed` with
`Unknown language: …` or `Cannot load the … interpreter: …`. The library
writes a `qWarning` when its resources are missing. Compiler hints of V4
(`qt.qml.compiler`) are silenced while languages load and run.
