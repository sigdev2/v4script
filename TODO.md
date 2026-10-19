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
| 4 | **C++** | next |
| 5 | C# | planned |
| 6 | Kotlin | planned |
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

Remaining order: C++, C#, Kotlin, Rust, Swift, Dart, Scala, F#, Haskell,
Erlang, Fortran, COBOL, Nim, Zig, assemblers, Verilog.

Decisions already taken for these stages:

 - **C++** runs over the linear memory of C, with the STL over it (the most
   expensive stage).
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
 - **Java**: access checks (`private`) and checked exceptions,
   `java.time`, `CompletableFuture`, `java.util.concurrent.locks`, detailed
   `NullPointerException` messages and `at …` lines in `printStackTrace`,
   `==` of strings and `Integer` by identity.
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
   and exponent literals.

## The library

 - Android: measure the stack on devices and raise the call depth as on
   desktop (now the V4 default of 1000).
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
 - Syntax highlighting in the editor; a link that carries a program.

## Later (not now)

 - **Readable vendor bundles**: keep the third-party interpreters in the
   repository unminified (or with source maps) so that they can be read;
   either rebuild them without minification or decide whether to
   reimplement a language on the translator core instead.
