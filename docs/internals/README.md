# Internals

For developers of v4script: how the library is built and why. Users of
the library need [embedding](../embedding/README.md) and
[languages](../languages/README.md) instead.

| Page | What it covers |
| --- | --- |
| [host.md](host.md) | the host layer between C++ and the languages: the bridge, the `host` object, adapters, engines and units |
| [translator.md](translator.md) | v4script's own translator into JavaScript: the shared core, sessions, errors and lines, fibers, recursion, adding a translated language |
| [vendor.md](vendor.md) | languages run by third-party interpreters (Python, Lua, Prolog, Perl, PHP): building the bundles, patches, adapters |
| [go.md](go.md), [c.md](c.md), [cpp.md](cpp.md), [java.md](java.md), [csharp.md](csharp.md), [forth.md](forth.md), [basic.md](basic.md), [pascal.md](pascal.md), [wat.md](wat.md), [scheme.md](scheme.md) | each translated language: files, values, translation, the library, checking against a reference implementation |
| [v4-pitfalls.md](v4-pitfalls.md) | bugs and limits of the Qt 6.4 JavaScript engine that the code works around |

## Architecture

```
application (C++)
   │  Runtime: own QJSEngine, console, timers, watchdog      ─┐
   │  Engine: languages inside any QJSEngine                  │ src/, include/v4script/
   │  Host callbacks, HostModule, Result, languages()        ─┘
   │
HostBridge (QObject)  →  js/host/host.js: the host object     js/host/
   │                     js/host/compat.js: polyfills, V4 fixes
   │
adapter (host) -> { run(code) }                                js/adapters/
   │
   ├── third-party interpreter bundle                          js/vendor/
   └── translator: core + language → JavaScript chunks         js/translator/
```

 - **Everything runs in one JavaScript engine**: interpreters and
   translated programs are JavaScript, so all languages share the host
   modules, the watchdog, the timers and the global object.
 - **C++ is thin**: [src/Engine.cpp](../../src/Engine.cpp) loads resources
   and calls the host layer, [src/Runtime.cpp](../../src/Runtime.cpp) adds
   timers and the watchdog ([src/Watchdog.cpp](../../src/Watchdog.cpp)),
   [src/HostModule.cpp](../../src/HostModule.cpp) parses signatures and
   reads `QObject`s, [src/Languages.cpp](../../src/Languages.cpp) reads the
   manifest and prepares the process, [src/ImageCanvas.cpp](../../src/ImageCanvas.cpp)
   paints for [js/host/canvas.js](../../js/host/canvas.js).
 - **Scripts are ES2016** without a build step, because V4 knows no newer
   syntax; the same files run in Node.js for quick checks
   ([tools/run-samples.mjs](../../tools/run-samples.mjs)). Release builds may
   embed a minified copy ([tools/minify.mjs](../../tools/minify.mjs)).

## The manifest

[languages.json](../../languages.json) is the single list of languages:

| Key | Meaning |
| --- | --- |
| `translatorCore` | the files of the translator core, loaded before the first translated language |
| `languages[].id`, `name`, `version`, `dialect`, `implementation`, `implementationVersion`, `license`, `extensions`, `lineComment` | what `LanguageInfo` returns (see [embedding](../embedding/README.md#languages-and-versions)) |
| `languages[].translator` | `true` - the language needs the translator core |
| `languages[].files` | scripts evaluated in order when the language loads (paths under `js/`) |
| `languages[].adapter` | the adapter script, evaluated last; it must evaluate to `function (host)` |

[cmake/V4ScriptResources.cmake](../../cmake/V4ScriptResources.cmake) reads
the manifest at configure time: it embeds the host layer and the files of
the languages chosen by `V4SCRIPT_LANGUAGES` as `:/v4script/js/<file>` and
writes a manifest of those languages only as `:/v4script/languages.json`.
`Engine::load` evaluates the files of a language once per engine (the
translator core is shared), then calls the adapter with the `host` object.

## Versions

 - The version of the project is in [VERSION](../../VERSION); CMake puts
   it into `Version.hpp` ([cmake/Version.hpp.in](../../cmake/Version.hpp.in))
   and `v4script::version()`.
 - Every language has its own `version` (the language), `dialect` and
   `implementationVersion` in the manifest. Translated languages carry the
   version of v4script as their implementation version: raise it together
   with [VERSION](../../VERSION) ([releasing](../releasing.md)).

## Adding a language

 - Translated by v4script: [translator](translator.md#adding-a-language).
 - Run by a third-party interpreter written in JavaScript:
   [vendor](vendor.md#adding-an-interpreter-based-language).
 - In both cases: an entry in [languages.json](../../languages.json),
   samples in `tests/samples/<id>/`, rows in
   [LanguagesTest.cpp](../../tests/LanguagesTest.cpp), a reference page in
   [docs/languages](../languages/README.md), examples and highlighting
   rules for the [playground](../playground.md#highlighting), lines in the
   [README](../../README.md), the plan in [TODO.md](../../TODO.md)
   updated.
