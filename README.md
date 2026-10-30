<h1 align="center">v4script</h1>

<p align="center">
  <b>A set of interpreters that run many programming languages on the Qt V4 JavaScript engine.</b>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <img alt="Version 0.1.4" src="https://img.shields.io/badge/version-0.1.4-brightgreen.svg">
  <img alt="Qt 6.4+" src="https://img.shields.io/badge/Qt-6.4%2B-41cd52.svg">
  <img alt="C++17" src="https://img.shields.io/badge/C%2B%2B-17-00599c.svg">
  <img alt="15 languages" src="https://img.shields.io/badge/languages-15-orange.svg">
  <a href="https://sigdev2.github.io/v4script/"><img alt="Playground" src="https://img.shields.io/badge/playground-online-8a2be2.svg"></a>
</p>

<p align="center">
  Python · Lua · Prolog · Perl · PHP · Go · C · C++ · Java · C# · Forth · BASIC · Pascal · WebAssembly · Scheme
</p>

<p align="center">
  <a href="https://sigdev2.github.io/v4script/"><b>▶ Try every language in the browser</b></a>
</p>

---

**v4script** lets a Qt application run programs written in fifteen
languages - from QBasic and Turbo Pascal classics to Go, C++, Java, C# and
WebAssembly - inside the JavaScript engine that every Qt Qml installation
already has. No compilers, no external processes, no native interpreters:
one static library, a few lines of C++, and your users can script your
application in the language they like.

```cpp
v4script::Runtime runtime;
runtime.setOutput([](v4script::Stream, const QString& text) { std::cout << text.toStdString(); });

runtime.run("basic",  "FOR i = 1 TO 3: PRINT i * i;: NEXT");          //  1  4  9
runtime.run("pascal", "WriteLn('Pi = ', Pi:0:5);");                   // Pi = 3.14159
runtime.run("go",     "fmt.Println(strings.Repeat(\"Go\", 3))");       // GoGoGo
```

## Why v4script

- 🧩 **Fifteen languages, one engine.** Every language runs in the same
  `QJSEngine` as JavaScript, shares its global object and can call
  JavaScript - and the other way round.
- 🔌 **Your API in every language.** Give programs a `QObject` and its
  methods become a Go package, a C or C++ header, a Java or C# class, a
  Pascal unit, Prolog predicates and Scheme procedures - with names and types in
  the conventions of each language.
- 🎯 **Faithful behavior.** The translated languages are checked against
  real implementations: Pascal prints numbers exactly as Free Pascal does,
  BASIC follows QBasic down to `PRINT USING` and `RND`, C has its own
  memory with real pointers, the C++ library gives the numbers of
  libstdc++'s `<random>` and the order of its hash tables, C# formats
  numbers and orders dictionaries as .NET does, WebAssembly passes the
  specification tests.
- 🛡️ **Safe to embed.** Programs see only what the application gives them:
  output, standard input, module files, a canvas. A watchdog stops runaway
  code, deep recursion is an error, not a crash.
- 🎨 **Graphics included.** QBasic `SCREEN 13` and Pascal `Graph` draw on a
  canvas - into a `QImage` or a Qt Quick `Canvas`.
- 📦 **Pick what you need.** Embed all languages (about 14 MB of scripts,
  7.4 MB minified) or just the few your application uses.

## Supported languages

| Language | Version | What runs | Implementation |
| --- | --- | --- | --- |
| Python | 3 | Python 3 (the subset of Skulpt) | [Skulpt](https://github.com/skulpt/skulpt) ae5f462 |
| Lua | 5.3 | Lua 5.3 | [fengari](https://github.com/fengari-lua/fengari) 0.1.5 |
| Prolog | ISO | ISO Prolog | [Tau Prolog](https://github.com/tau-prolog/tau-prolog) 0.3.4 |
| Perl | 5 | Perl 5 (the subset of Perlito5) | [Perlito5](https://github.com/fglock/Perlito) 9.028 |
| PHP | 7 | PHP 7 (the subset of Uniter) | [Uniter](https://github.com/asmblah/uniter) (phpruntime 9.3.0) |
| Go | 1.22 | Go with goroutines, channels, generics and a subset of the standard library | v4script 0.1.4 |
| C | C17 | C17 with its own linear memory and a subset of the C library | v4script 0.1.4 |
| C++ | C++17 | C++17 over the memory of C: classes, templates, exceptions, lambdas and an STL that behaves as libstdc++ | v4script 0.1.4 |
| Java | 21 | Java 21 with records, pattern matching, threads, streams and a JDK subset | v4script 0.1.4 |
| C# | 12 | C# 12 with generics, LINQ, records, patterns, async/await, threads and a .NET 8 subset | v4script 0.1.4 |
| Forth | 2012 | Forth 2012, compatible with gforth | v4script 0.1.4 |
| BASIC | QBasic 4.5 | QBasic / QuickBASIC 4.5 with graphics | v4script 0.1.4 |
| Pascal | FPC 3.2.2 | Free Pascal 3.2.2 (objfpc): classes, exceptions, SysUtils, Math, StrUtils, Classes, Crt, Graph | v4script 0.1.4 |
| WebAssembly | 2.0 | the WAT text format, `.wast` scripts, WASI | v4script 0.1.4 |
| Scheme | R7RS | R7RS-small, SRFI 1, 13, 18, 69, full continuations | v4script 0.1.4 |

Languages marked *v4script* are translated into JavaScript by v4script's
own translator; the others run in third-party interpreters written in
JavaScript. Versions are available to the application too:
`v4script::languages()` and `v4script::version()`.

## Coming next

The translator grows one language at a time, in this order:
**Kotlin**, Rust, Swift, Dart, Scala, F#, Haskell, Erlang, Fortran,
COBOL, Nim, Zig, x86 assemblers (NASM, FASM, TASM) and ASMX, Verilog,
MASM, Ada, Common Lisp, the NES (ca65) and Z80 (sjasmplus) assemblers,
CoffeeScript, the .NET IL assembler, Ruby, TypeScript. See [TODO](TODO.md)
for the plan and the known gaps.

## Try it online

The [playground](https://sigdev2.github.io/v4script/) runs all fifteen
languages in the browser with the same scripts: pick an example - BASIC
games and graphics, Pascal `Graph`, goroutines in Go, records in Java,
LINQ in C#,
`call/cc` in Scheme - or write your own program; it stays in your browser.
How it works and how it differs from the Qt engine:
[playground](docs/playground.md).

## Documentation

- ▶️ [Playground](docs/playground.md) - the languages in the browser, built
  for GitHub Pages with `node tools/build-site.mjs`
- 🚀 [Getting started](docs/getting-started.md) - build, try the examples
  and the `v4run` command-line runner
- 📚 [Languages](docs/languages/README.md) - what each language supports
  and how programs use the application's API
- 🔧 [Embedding](docs/embedding/README.md) - CMake integration, the C++ API,
  host modules, graphics
- ⚙️ [Internals](docs/internals/README.md) - how the translator and the
  interpreters work on V4
- 🧪 [Testing](docs/testing/README.md) and
  [development](docs/development.md)

All documentation: [docs/](docs/README.md).

## Building

```
cmake -S . -B build -DCMAKE_PREFIX_PATH=<path to Qt>/<kit>
cmake --build build --parallel
ctest --test-dir build --output-on-failure
```

Requires Qt 6.4 or later (developed with 6.4.1), CMake 3.19 and a C++17
compiler. To use it in your project, add it as a subdirectory and link
`V4Script::V4Script` - see [embedding](docs/embedding/README.md).

## Third-party projects

| Project | Used for | License |
| --- | --- | --- |
| [Skulpt](https://github.com/skulpt/skulpt) | Python | [MIT](https://github.com/skulpt/skulpt/blob/master/LICENSE) |
| [fengari](https://github.com/fengari-lua/fengari), [fengari-interop](https://github.com/fengari-lua/fengari-interop) | Lua | [MIT](https://github.com/fengari-lua/fengari/blob/master/LICENSE) |
| [Tau Prolog](https://github.com/tau-prolog/tau-prolog) | Prolog | [BSD-3-Clause](https://github.com/tau-prolog/tau-prolog/blob/master/LICENSE) |
| [Perlito5](https://github.com/fglock/Perlito) | Perl | [Artistic License 2.0](https://www.perlfoundation.org/artistic-license-20.html) |
| [Uniter](https://github.com/asmblah/uniter) | PHP | [MIT](https://opensource.org/licenses/MIT) |
| [QB64 Phoenix Edition](https://github.com/QB64-Phoenix-Edition/QB64pe) | BASIC graphics algorithms, the 8x8 font of Pascal `Graph` | [MIT](https://opensource.org/licenses/MIT) |
| [.NET runtime](https://github.com/dotnet/runtime) | the algorithms of C# collections, sorting and `Random` | [MIT](https://github.com/dotnet/runtime/blob/main/LICENSE.TXT) |

The full list of bundled packages and their license texts is in
[THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md).

## Contributing

Contributions are welcome - see [CONTRIBUTING](CONTRIBUTING.md) and the
[code of conduct](CODE_OF_CONDUCT.md). Code style:
[C++](StyleGuide.CPP.md), [JavaScript](StyleGuide.JS.md). Security
issues: [SECURITY](SECURITY.md).

## Made with Claude

v4script was designed and written with the help of
[Claude](https://www.anthropic.com/claude), AI models by
[Anthropic](https://www.anthropic.com): the translators, the runtime
libraries, the tests and this documentation were developed in
collaboration with Claude, under the direction and review of the
maintainer.

## Disclaimer

> [!CAUTION]
> v4script and its playground are provided **"as is", without warranty of
> any kind** (see the [MIT License](LICENSE)). The translators and
> interpreters are independent implementations: they may run a program
> differently from the reference implementation of its language and may
> contain errors.
>
> - **Use of the translators and interpreters.** You use v4script, the
>   playground and their results at your own risk. The authors and
>   contributors are not liable for any damage or loss that comes from
>   that use: wrong results, lost data, failures of an application that
>   embeds v4script.
> - **Unlawful use.** You alone are responsible for using v4script in line
>   with the laws that apply to you and with the rights of others,
>   including the licenses and copyrights of the programs you run. The
>   authors do not approve of, and accept no responsibility for, any
>   unlawful or harmful use.
> - **Programs run with v4script.** The authors do not write, review or
>   control the programs that people run in the playground or in an
>   application that embeds v4script, and are not responsible for their
>   content, behavior or consequences: whoever writes, shares or runs a
>   program is responsible for it. A program can call JavaScript - in the
>   playground, the JavaScript of your browser, network requests included -
>   so run only code you trust. An application that embeds v4script is
>   responsible for what it lets programs reach (see [SECURITY](SECURITY.md)).
>
> Names of languages and products are trademarks of their owners;
> v4script is not affiliated with or endorsed by them.

## License

[MIT](LICENSE) © 2026 sigdev
