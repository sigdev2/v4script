# Testing

v4script has two levels of checks: the C++ tests in the Qt engine (the
final word) and a quick run of the samples in Node.js while working on the
scripts.

## The C++ tests

```
cmake -S . -B build -DCMAKE_PREFIX_PATH=<Qt>/<kit>
cmake --build build
ctest --test-dir build --output-on-failure
```

Tests are built when v4script is the top-level project
(`V4SCRIPT_BUILD_TESTS`); they need all languages (`V4SCRIPT_LANGUAGES=all`)
and `V4Script::ImageCanvas`. They run with `QT_QPA_PLATFORM=offscreen`, so
no display is needed.

| Test | What it checks |
| --- | --- |
| [RuntimeTest](../../tests/RuntimeTest.cpp) | the C++ API: versions, output streams, `Host::format`, input, signatures and modules (from signatures and from a `QObject`), module files, loading, timers, the time limit, deep recursion, `reset`, `Engine` on an application engine, `ImageCanvas` |
| [LanguagesTest](../../tests/LanguagesTest.cpp) | every language through the API: output and value, error lines, state shared by units, units run again, host modules, the canvas, calls between JavaScript and the language, module files, errors in modules, the time limit, and all samples |

[TestSession](../../tests/TestSession.hpp) is the runtime of the tests:
output in lines (standard error prefixed with `!`, warnings with `?`),
input from a list, module files from a map, an `ImageCanvas` and the host
module `app` from [app-module.js](../../tests/app-module.js).

Run one language or one sample with the Qt Test arguments:

```
build/tests/LanguagesTest samplesRun:pascal/graph.pas
build/tests/LanguagesTest hostModuleIsUsed:scheme
```

## Samples

`tests/samples/<language>/` holds programs with their expected results in
line comments of the language at the end of the file:

```python
print(sum(range(10)))
6 * 7

# Output:
# 45
# Value: 42
```

| Marker | Meaning |
| --- | --- |
| `Input:` | the following comment lines are standard input |
| `Output:` | the following comment lines are the expected output; standard error lines start with `!`; trailing spaces do not matter, leading ones do |
| `Value: text` | the expected value of the run |
| `Error: text` | the run fails and the error contains the text |
| `Line: N` | the line of that error |

A sample runs as one unit named `main` with the host module `app`; programs
that wait are awaited (up to 20 s). New files are picked up when CMake
configures. Expectations come from a reference implementation run as a
black box:

| Language | Reference |
| --- | --- |
| C | gcc with glibc on Linux |
| Java | JDK 19 (`java --enable-preview`) |
| Forth | gforth 0.7.3; Forth 2012 words missing in it by hand |
| BASIC | QB64-PE 4.7.0, where it departs from QBasic - QBasic rules |
| Pascal | Free Pascal 3.2.2 (`fpc -Mobjfpc -Sh`); Graph against `ptcgraph` under Xvfb |
| WebAssembly | wabt 1.0.27 (`wat2wasm`, `spectest-interp`), Node.js WASI, the spec test suite |
| Scheme | chibi-scheme 0.9.1 |
| Go | the Go 1.22 specification and standard library |

The interpreter-based languages (Python, Lua, Prolog, Perl, PHP) have
samples for what v4script adds: host modules and standard input.

## Quick check in Node.js

[tools/run-samples.mjs](../../tools/run-samples.mjs) loads a language the
way the engine does (its files from the manifest, the host layer with a
bridge of plain JavaScript) and runs the samples:

```
cd tools && npm ci && cd ..
node tools/run-samples.mjs go                     # all Go samples
node tools/run-samples.mjs go slices              # samples whose name contains "slices"
node tools/run-samples.mjs c --run prog.c --input in.txt --dump   # one file, show the generated JavaScript
node tools/run-samples.mjs java --library         # translate the whole Java library
node tools/run-samples.mjs wat --wast testsuite/  # WebAssembly spec tests (.wast)
V4SCRIPT_JS=build/js-min node tools/run-samples.mjs pascal   # the minified scripts
node tools/run-samples.mjs basic --examples       # the examples of the playground run without errors
```

The examples of the [playground](../playground.md) (`web/examples`) have no
expected output: `--examples` runs them with the input given in their index
and fails on an error.

Node is faster and more forgiving than V4: a sample that passes in Node may
still fail in the Qt engine (see [V4 pitfalls](../internals/v4-pitfalls.md)),
so `LanguagesTest` is the final check.

## Before a change is done

 - `ctest` passes on Linux (and on Windows when C++ or platform code
   changed).
 - Changed scripts: the samples of the language pass in Node and in
   `LanguagesTest`, also with the minified scripts
   (`-DV4SCRIPT_MINIFY_JS=ON` or `V4SCRIPT_JS=build/js-min`).
 - New behavior has a sample or a test row; a bug fix has a sample that
   failed before.
