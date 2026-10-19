# Getting started

## Try it without building

The [playground](https://sigdev2.github.io/v4script/) runs every language
in the browser, with examples and your own programs
([how it works](playground.md)).

## Build and try

You need Qt 6.4 or later (Core, Qml, Gui), CMake 3.19 and a C++17
compiler.

```
git clone https://github.com/sigdev2/v4script.git
cd v4script
cmake -S . -B build -DCMAKE_PREFIX_PATH=<Qt>/<kit>
cmake --build build --parallel
```

This builds the library, the tests and the examples. Run the tests:

```
ctest --test-dir build --output-on-failure
```

Run a program in any language with the command-line runner from
[examples/run](../examples/run):

```
build/examples/run/v4run --list
build/examples/run/v4run hello.py
build/examples/run/v4run --language basic game.txt < answers.txt
build/examples/run/v4run --eval "fmt.Println(1 << 62)" --language go
```

`v4run` picks the language by the file extension, gives the program the
standard input and output of the process, loads modules (`import`,
`#include`, `uses`…) from the directory of the file and returns 1 on an
error of the program.

The other examples:

| Example | What it shows |
| --- | --- |
| [hello](../examples/hello) | one program in every language |
| [host-module](../examples/host-module) | an API of the application (a `QObject` and a module from signatures) and standard input from a string |
| [canvas](../examples/canvas) | BASIC, Pascal and JavaScript graphics saved as PNG files |

Each example also builds alone:
`cmake -S examples/hello -B build-hello -DCMAKE_PREFIX_PATH=<Qt>/<kit>`.

## Embed it

```cmake
add_subdirectory(external/v4script)
target_link_libraries(myapp PRIVATE V4Script::V4Script)
```

```cpp
v4script::prepareProcess();
QCoreApplication app(argc, argv);

v4script::Runtime runtime;
runtime.setOutput([](v4script::Stream, const QString& text) { std::cout << text.toStdString(); });
v4script::Result result = runtime.run("scheme", "(display (map square '(1 2 3)))");
```

Next: [embedding](embedding/README.md) for the API and the build options,
[languages](languages/README.md) for what programs can do.
