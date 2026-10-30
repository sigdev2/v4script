# TODO

Plans and known gaps of v4script. User-visible limits of the current
languages are also described on their pages in
[docs/languages](docs/languages/README.md).

## Languages: the approved plan

Languages without a usable JavaScript interpreter are translated by
v4script's own translator, one language per stage (each stage: the
frontend over the shared core, samples checked against a reference
implementation, tests, documentation). The order approved by the owner:

| Stage | Language | State |
| --- | --- | --- |
| 1 | Go (with the translator core) | done |
| 2 | C | done |
| 3 | Java | done |
| 4 | C++ | done (C++17; C++20 with concepts later) |
| 5 | C# | done (C# 12, a .NET 8 subset) |
| 6 | **Kotlin** | next |
| 7 | Scheme | done (R7RS-small) |
| 8 | Pascal | done (Free Pascal 3.2.2) |
| 9 | BASIC | done (QBasic) |
| 10 | Rust | planned |
| 11 | Swift | planned |
| 12 | Dart | planned |
| 13 | Scala | planned |
| 14 | F# | planned |
| 15 | Haskell | planned |
| 16 | Erlang | planned |
| 17 | Forth | done (Forth 2012) |
| 18 | Fortran | planned |
| 19 | COBOL | planned |
| 20 | Nim | planned |
| 21 | Zig | planned |
| 22 | WebAssembly (WAT) | done (2.0) |
| 23 | x86 assemblers (NASM, FASM, TASM) and ASMX | planned |
| 24 | Verilog | planned |
| 25 | MASM | planned |
| 26 | Ada | planned |
| 27 | Common Lisp | planned |
| 28 | NES assembler: ca65 (6502) | planned |
| 29 | Z80 assembler: sjasmplus | planned |
| 30 | CoffeeScript | planned |
| 31 | IL assembler (.NET CIL) | planned |

Remaining order: Kotlin, Rust, Swift, Dart, Scala, F#, Haskell,
Erlang, Fortran, COBOL, Nim, Zig, assemblers, Verilog, MASM, Ada,
Common Lisp, the NES and Z80 assemblers, CoffeeScript, IL assembler.

Decisions already taken for these stages:

 - **64-bit integers** stay exact (the hybrid `T.i64`); 32-bit types wrap.
 - **Recursion**: translators turn tail calls into loops; the process-wide
   call depth is raised by `prepareProcess()`.
 - **Haskell**: full Hindley-Milner inference with type classes and
   defaulting.
 - **Assemblers**: NASM and FASM - x86-32 flat binaries with Linux
   `int 0x80`/`syscall` `write` and `exit`; TASM - 16-bit 8086 with DOS
   `int 21h`; ASMX - the multi-CPU assembler asmx, first CPU Z80 or 6502
   with an output port.
 - **Verilog**: four-state logic. Waiting in concurrent code is real time
   through timers (the run ends, fibers go on), as in the other languages.
 - **MASM**: the syntax of MASM 6.x (`.MODEL`, `PROC`/`ENDP`, `INVOKE`,
   `.IF`/`.WHILE`, `STRUCT`, macros) over the 16-bit 8086 DOS machine of
   TASM (`int 21h`, `.COM` and `.EXE` programs); later the 32-bit flat
   model with a console subset of Win32 (`WriteConsoleA`, `ExitProcess`).
   Reference: MASM 6.15 with DOSBox; UASM only as a black box (its license
   is not MIT-compatible).
 - **Ada**: Ada 2012 translated by v4script: packages, strong types with
   range checks (`Constraint_Error`), records with discriminants, arrays
   with any index type, generics, exceptions, tasks and protected objects
   over the fibers of the translator, `Ada.Text_IO` with the generic
   `Integer_IO` and `Float_IO`. Reference: GNAT (GCC), a black box.
 - **Common Lisp**: ANSI Common Lisp: the numeric tower of Scheme (big
   integers, ratios), `defmacro` with evaluation at compile time,
   packages, special variables, multiple values, conditions and restarts,
   CLOS (`defclass`, generic functions, standard method combination),
   `format` and `loop`. Reference: SBCL, a black box.
 - **NES**: the syntax of ca65 (the assembler of cc65), in which most NES
   homebrew and the NESdev examples are written, with the layout of ld65
   for NROM (an iNES header, mapper 0); the program runs on an emulated
   NES - a 6502 (shared with ASMX), the PPU on the canvas, the controllers
   from the keyboard, no APU sound. The syntax of asm6 and NESASM later as
   dialects. Reference: ca65/ld65 and the Mesen emulator for the picture.
 - **Z80**: the syntax of sjasmplus (Zilog mnemonics, the assembler of
   most ZX Spectrum sources today; Pasmo as a dialect) for two machines: a
   ZX Spectrum 48K - the screen memory on the canvas, `RST 10h` printing
   and the keyboard through an own small ROM (the Sinclair ROM is not
   free) - and CP/M `.COM` programs with BDOS calls (`CALL 5`). The Z80 is
   shared with ASMX. Reference: sjasmplus with the Fuse emulator and a
   CP/M emulator, black boxes.
 - **CoffeeScript**: the official compiler (MIT) of CoffeeScript 2 as a
   vendor bundle, as the other interpreters; its JavaScript (classes,
   arrow functions, destructuring) runs in V4 as it is. Check first that
   V4 compiles the compiler bundle (deep expressions); run-time errors get
   CoffeeScript lines from the source map.
 - **IL assembler**: the syntax of ilasm (ECMA-335 CIL: `.assembly`,
   `.class`, `.method`, `.locals init`, `ldstr`,
   `call void [mscorlib]System.Console::WriteLine(string)`) after C# and
   over its run time: the type system, value types, generics, exceptions,
   the `System` subset. The evaluation stack is typed at translation time
   as the verifier of .NET does. Reference: ilasm and the .NET 8 runtime
   (MIT).
 - **Ruby** is not planned through Opal: Opal crashes the V4 compiler.
   It would need its own translator.

## Gaps of the current languages

 - **Go**: `regexp`, `encoding/json`, `math/big`, complex numbers, `goto`,
   range-over-func iterators; faster 64-bit loop counters (no checks when
   the bound is known). A receive from the channel of `time.NewTicker`
   never returns (`time.Tick` works).
 - **C**: `goto`, `_Generic`, `setjmp`/`longjmp`, `wchar.h`; writing files
   through the host; bounds checks inside the program memory (as
   AddressSanitizer does).
 - **C++**: later the translator grows from C++17 to C++20 with concepts -
   `concept`, `requires` clauses and expressions, constrained templates
   and abbreviated function templates (`auto` parameters), `<concepts>`
   and the constrained algorithms - then the rest of C++20 (`<=>`, ranges,
   `std::span`, coroutines, modules); the version in the manifest becomes
   C++20 (designated initializers and `consteval` already work). Gaps of
   C++17: pointers to members, virtual inheritance, template template
   parameters, `goto`, `alignas` on classes, `noexcept` violations
   terminating, `std::exception_ptr`, wide strings, deduction of
   `std::function` from a lambda, `std::bind`; threads
   (`std::thread`, `mutex`, `atomic`), `<regex>`, `<variant>`, `<any>`,
   `<complex>`; the binomial and gamma families of `<random>` and the
   Poisson method of libstdc++ for a mean of 12 or more; `vector<bool>` as
   a bit vector; the speed of translation in V4 (2-4 s for the first unit
   that uses several containers: cache or precompute the tokens of the
   library, less checking work per library declaration).
 - **Java**: access checks (`private`) and checked exceptions,
   `java.time`, `CompletableFuture`, `java.util.concurrent.locks`, detailed
   `NullPointerException` messages and `at …` lines in `printStackTrace`,
   `==` of strings and `Integer` by identity.
 - **C#**: definite assignment (`CS0165`) and nullable warnings; checked
   operators and `TryConvertFrom…` of generic math; `ref` returns (span
   indexers, `ref` locals of elements) and the rules of `ref struct`;
   reflection beyond `GetType`; stack traces of
   exceptions; `finally` must not run when an unhandled exception ends the
   program; `(object)1 == (object)1` by identity (boxed `int`, `bool` and
   `string` are JavaScript values); regular expressions with lookbehind,
   balancing groups and local inline options (now `RegExp` of V4), exact
   group positions; `System.Text.Json`, `System.Collections.Concurrent`,
   `System.Collections.Immutable`; more `Console` (`ReadKey`, cursor).
 - **Forth**: `SEE`, `N>R`/`NR>`, xchar words (except `XEMIT`), the Block
   and File word sets (only including host files now); `MS` in words called
   through `EXECUTE` from words compiled before the first waiting word -
   without a busy loop.
 - **BASIC**: `GET`/`PUT` (pictures and files), `VIEW`, `PAINT` with a
   pattern, `PLAY` and `SOUND`, the events `ON TIMER` and `ON KEY`, a text
   screen (`LOCATE`, `COLOR`, `PRINT` onto the picture in graphics modes),
   writing files through the host; `ON ERROR` resuming inside a procedure
   as QBasic does (now at the line of the call); `CLEAR`.
 - **Pascal**: generics (`generic`/`specialize`), interfaces, operator
   overloading, records with methods (`advancedrecords`), `PChar` and
   memory routines (`GetMem`, pointer arithmetic), `Extended` with 80-bit
   precision, `Comp` and `Currency` as 64-bit integers (now doubles),
   `{$R+}` and `{$Q+}` (now indices are always checked, assignments and
   arithmetic never), vector BGI fonts in `Graph` and Cyrillic glyphs in
   its 8x8 font, 4-connected curve outlines as in Free Pascal, a text
   screen for `Crt` (`GotoXY`, colors), the units `Dos`, `DateUtils`,
   `fgl`, writing files through the host.
 - **WebAssembly**: SIMD (`v128`); the 3.0 proposals - tail calls,
   exceptions (`try_table`), GC, typed function references, multiple
   memories, `memory64`; binary `.wasm` host files (the host gives text
   only); NaN sign and payload (every NaN is canonical in V4); WASI files
   through the host, `poll_oneoff` (waiting for time).
 - **Scheme**: non-hygienic macros (`er-macro-transformer`, `syntax-case`,
   `define-macro`); SRFI 14 character sets (SRFI 13 procedures take a
   character, a string or a predicate), `xsubstring`, `string-xcopy!`;
   own export lists of the standard libraries (now `(import (scheme base))`
   and `environment` give all built-ins); writing files through the host;
   re-entering a continuation captured in a call from JavaScript after
   that call returned; switching SRFI 18 threads inside a call from
   JavaScript; fast division of big integers (bit by bit now).
 - **Python, Lua, Prolog, Perl, PHP**: limited by their interpreters (see
   their pages); Perl run-time errors have no line; PHP lacks `...$args`
   and exponent literals. Python: `Fraction` from a string
   (`Fraction('3/4')`) fails with a `TypeError` - the `fractions` module of
   Skulpt parses the string with named groups, which V4 lacks.

## The library

 - Android: measure the stack on devices and raise the call depth as on
   desktop (now the V4 default of 1000).
 - `Runtime::interrupt()` while a language loads: the run returns
   `Status::Failed` ("Cannot load the Python interpreter: Error:
   Interrupted") instead of `Status::Interrupted`; the next run loads the
   language again.
 - Writing files: an optional `Host` callback for programs that write files
   (C `fopen("w")`, Pascal `Rewrite`, BASIC `OPEN … FOR OUTPUT`, WASI).
 - CI on Windows and macOS; MSVC builds.
 - Running long code without blocking the GUI thread: an `Engine` in a
   worker thread with its own stack size, documented and tested.
 - JavaScript older than [StyleGuide.JS.md](StyleGuide.JS.md): abbreviated
   names (`ctx`, `rt`, `lo`, `ch`...) and about 1150 lines over 120
   characters. One-letter names are left only for x/y coordinates and
   short aliases: the Pascal type table `t`, the BASIC helpers `B` and `E`,
   `V` and `P` for the `$V` and `$P` tables; BASIC `printUsing` keeps the
   names of QB64.

## The playground

 - Keys in real time for `INKEY$`, `ReadKey`, `KeyPressed` (now they read
   typed lines, as in the Qt engine).
 - BASIC `SCREEN` and Pascal `Graph`: put the picture on the canvas before
   the program waits for input (now at the end of a run and at waits for
   time) - in the Qt engine too.
 - A link that carries a program.
 - Highlighting: nested block comments (Scheme `#| |#`, WebAssembly
   `(; ;)`), the interpolation in strings, a parser state instead of
   guesses for regular expression literals.
