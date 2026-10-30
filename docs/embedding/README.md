# Embedding v4script

v4script is a static C++ library for Qt applications. It runs programs in
15 languages inside a `QJSEngine` and lets the application decide what the
programs see: output, standard input, module files, a canvas and its own
API (host modules).

| Section | What it covers |
| --- | --- |
| This page | requirements, adding the library to a CMake project, build options, languages and versions |
| [runtime.md](runtime.md) | `Runtime` and `Engine`: running code, units, results, input and output, timers, time limits, threads |
| [host-modules.md](host-modules.md) | giving programs an API of the application: `HostModule` from a `QObject` or from signatures, how each language sees it |
| [canvas.md](canvas.md) | graphics: `ImageCanvas`, a Qt Quick `Canvas`, what the 2D context supports |

## Requirements

 - Qt 6.4 or later (developed and tested with 6.4.1): Core and Qml; Gui for
   `V4Script::ImageCanvas`.
 - A C++17 compiler and CMake 3.19. Tested with GCC on Linux; the library
   is also built for Android. MinGW and MSVC on Windows and macOS are
   expected to work but are not tested. Node.js is needed
   only for the tools in [tools/](../../tools) (minified scripts, rebuilding
   the vendor bundles, running samples without Qt).

## Adding v4script to a project

As a git submodule (or a copy of the sources) with `add_subdirectory`:

```
git submodule add https://github.com/sigdev2/v4script.git external/v4script
```

```cmake
find_package(Qt6 6.4 REQUIRED COMPONENTS Core Qml)

set(V4SCRIPT_LANGUAGES "python;lua;basic" CACHE STRING "" FORCE)  # optional
add_subdirectory(external/v4script)

target_link_libraries(myapp PRIVATE V4Script::V4Script)
```

Or with `FetchContent`:

```cmake
include(FetchContent)
FetchContent_Declare(v4script
    GIT_REPOSITORY https://github.com/sigdev2/v4script.git
    GIT_TAG v0.1.3)
FetchContent_MakeAvailable(v4script)
target_link_libraries(myapp PRIVATE V4Script::V4Script)
```

When v4script is not the top-level project, its tests and examples are not
built. The scripts of the languages are compiled into the library as Qt
resources (`:/v4script/js/…`); the application needs no files at run
time.

| Target | Header | Contents |
| --- | --- | --- |
| `V4Script::V4Script` | `<v4script/V4Script.hpp>` | the languages, `Engine`, `Runtime`, `HostModule`, `Result`, `languages()`, `version()` |
| `V4Script::ImageCanvas` | `<v4script/ImageCanvas.hpp>` | a canvas that draws into a `QImage` (links Qt Gui) |

## Build options

| Option | Default | Meaning |
| --- | --- | --- |
| `V4SCRIPT_LANGUAGES` | `all` | the languages to embed: `all` or a list of ids, e.g. `python;go;c`. Unknown ids stop the configuration |
| `V4SCRIPT_MINIFY_JS` | `OFF` | embed scripts minified by [tools/minify.mjs](../../tools/minify.mjs) at configure time (needs Node.js and `npm ci` in `tools/`); configure again after changing the scripts |
| `V4SCRIPT_JS_DIR` | `js/` | the directory of the scripts to embed (a copy minified elsewhere) |
| `V4SCRIPT_BUILD_CANVAS` | `ON` | build `V4Script::ImageCanvas` |
| `V4SCRIPT_BUILD_TESTS` | top level only | build the tests ([testing](../testing/README.md)) |
| `V4SCRIPT_BUILD_EXAMPLES` | top level only | build [examples/](../../examples) |

Embedded size of each language (the host layer adds 25 KB, the translator
core shared by Go, C, C++, Java, C#, Forth, BASIC, Pascal, WebAssembly
and Scheme 124 KB; minified: 10 KB and 50 KB):

| Language | Scripts | Minified |
| --- | --- | --- |
| Python | 2009 KB | 1096 KB |
| Lua | 630 KB | 278 KB |
| Prolog | 559 KB | 303 KB |
| Perl | 1823 KB | 1157 KB |
| PHP | 2551 KB | 877 KB |
| Go | 537 KB | 270 KB |
| C | 354 KB | 166 KB |
| C++ (with the files of C) | 1449 KB | 920 KB |
| Java | 852 KB | 570 KB |
| C# | 1728 KB | 1078 KB |
| Forth | 199 KB | 91 KB |
| BASIC | 309 KB | 143 KB |
| Pascal | 732 KB | 391 KB |
| WebAssembly | 245 KB | 117 KB |
| Scheme | 405 KB | 193 KB |

## Quick start

```cpp
#include <v4script/V4Script.hpp>

#include <QCoreApplication>
#include <iostream>

int main(int argc, char* argv[])
{
    v4script::prepareProcess();            // deep recursion: before any QJSEngine
    QCoreApplication app(argc, argv);

    v4script::Runtime runtime;
    runtime.setOutput([](v4script::Stream, const QString& text) { std::cout << text.toStdString(); });
    runtime.setTimeLimit(5000);

    const v4script::Result result = runtime.run("python", "print('Hello')
6 * 7");
    if (!result.isOk())
        std::cerr << result.describeError().toStdString() << '\n';
    std::cout << "value: " << result.value.toStdString() << '\n';   // 42
}
```

More in [runtime.md](runtime.md) and in the buildable
[examples](../../examples): `hello` (every language), `host-module` (an API
of the application and standard input), `run` (the command-line runner
`v4run`), `canvas` (graphics into PNG files).

## Languages and versions

```cpp
for (const v4script::LanguageInfo& language : v4script::languages())
    qDebug() << language.id << language.name << language.version
             << language.implementation << language.implementationVersion;
```

`languages()` lists the languages compiled in (`V4SCRIPT_LANGUAGES`) in the
order of [languages.json](../../languages.json). Every `LanguageInfo` has:

| Field | Example | Meaning |
| --- | --- | --- |
| `id` | `pascal` | the name for `run()` |
| `name` | `Pascal` | the name for people |
| `version` | `3.2.2`, `R7RS`, `C17` | the version of the language |
| `dialect` | `Free Pascal 3.2.2 (objfpc mode)` | what exactly is implemented |
| `implementation` | `v4script`, `Skulpt` | who runs it: v4script's own translator or a third-party interpreter |
| `implementationVersion` | `0.1.3`, `ae5f462` | the version of the implementation |
| `license` | `MIT`, `BSD-3-Clause` | the license of the implementation |
| `extensions` | `pas`, `pp` | file extensions; `findLanguageForFile("main.pas")` uses them |
| `lineComment` | `//` | the line comment of the language |

`findLanguage(id)` finds one language. The version of the library is
`v4script::version()` (the linked library) and `V4SCRIPT_VERSION_STRING`,
`V4SCRIPT_VERSION` and `V4SCRIPT_VERSION_CHECK(major, minor, patch)` from
`<v4script/Version.hpp>` (the headers).

## Threads and the process

 - Everything happens in the thread of the engine: `run()`, the host
   callbacks, timers. Only `Runtime::interrupt()` may be called from
   another thread.
 - `v4script::prepareProcess()` raises the call depth of V4 to 10 000
   (`MAX_CALL_DEPTH`) and, on Linux, the stack of the main thread to 16 MB
   (`MAIN_STACK_SIZE`; on Windows the library sets it through a linker
   option). Call it at the start of `main()`, before the first
   `QJSEngine`; without it the depth is the V4 default (640 on Windows,
   1234 on Linux), which some programs exceed. Android keeps the V4
   defaults (1000). A program deeper than the limit gets a stack overflow
   error of its language.
 - An engine run in another thread needs a thread with a large stack too
   (`QThread::setStackSize`).
