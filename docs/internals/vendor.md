# Interpreters from third-party projects

Python, Lua, Prolog, Perl and PHP run in interpreters written in
JavaScript by other projects. Their bundles live in
[js/vendor](../../js/vendor) together with the license texts of everything
that went into them (`LICENSES.txt`); do not edit them by hand. The
adapters that connect them to the host are in
[js/adapters](../../js/adapters).

| Language | Project | Version | License |
| --- | --- | --- | --- |
| Python 3 | [Skulpt](https://github.com/skulpt/skulpt) | commit ae5f462 | MIT |
| Lua 5.3 | [fengari](https://github.com/fengari-lua/fengari) + [fengari-interop](https://github.com/fengari-lua/fengari-interop) | 0.1.5 / 0.1.4 | MIT |
| Prolog | [Tau Prolog](https://github.com/tau-prolog/tau-prolog) | 0.3.4 | BSD-3-Clause |
| Perl 5 | [Perlito5](https://github.com/fglock/Perlito) | 9.028 (97c296f) | Artistic-2.0 |
| PHP 7 | [Uniter](https://github.com/asmblah/uniter) (phpcore, phpruntime, phptoast, phptojs) | phpruntime 9.3.0 | MIT |

Why interpreters in JavaScript: programs of every language run in the same
engine as JavaScript, with the same host modules, watchdog, files and
output. Native interpreters, the WebAssembly of the engine and compilation
outside the engine are not used. Ruby (Opal) crashes the V4 compiler,
Brython needs ES modules and `Intl`.

## Building the bundles

[tools/build-bundles.mjs](../../tools/build-bundles.mjs) builds every
interpreter with esbuild into one IIFE file for ES2016 (V4 knows no newer
syntax) with `global` = `globalThis`. Versions are pinned in
[tools/package.json](../../tools/package.json) (Skulpt and Perlito5 are
downloaded at fixed commits). Patches of third-party code (each one checks
that the original text did not change, otherwise the build fails):

| Where | What | Why |
| --- | --- | --- |
| Skulpt `src/ffi.js` | a JavaScript function whose name starts with a lower case letter is not a constructor | V4 returns `[native code]` from `Function.prototype.toString` for every function, and Skulpt would call all of them with `new` |
| Skulpt `src/lib/re.js` | the flags `s` and `u` are not passed to `RegExp` | V4 has no `s`, and `u` breaks a search that does not start at the beginning |
| fengari-interop `js.js` | a Lua table without a metatable goes to JavaScript as a copy (a sequence as an array), a JavaScript array comes as a table from 1, `null` is `nil`, integers are Lua integers | host modules take arrays and objects, not table proxies |
| Tau `core.js` | `pl.__env` is `globalThis` | the browser branch uses `window`, which the engine lacks |
| Perlito5 | `isNode = false`, the global object is `globalThis` | Perlito5 takes itself for Node.js if there is a global `require`, and an embedding application may have one |
| phpcore `JSObject.js` | an array from a JavaScript object is a PHP array (a copy), not a live `JSArray` | `count`, `foreach` and the array functions do not work with a `JSArray` |
| phpcore `ValueFactory.js` | a JavaScript object without methods stays an object (`$f->type`); it becomes an array only while `plainObjectsAsArrays` is set | otherwise plain data and `Math` would become arrays, and `$js->Math->max()` an error |
| phpruntime `FormatParser.js`, `FormatConverter.js` | `sprintf` with all conversions, width and precision | Uniter knows only `%d` and `%s` |
| phpcore `Namespace.js` | a user function or class may be declared again (built-in ones may not) | a unit may run many times, and PHP would forbid the second declaration |
| phpruntime `pcre/basicSupport.js` | `preg_replace` substitutes the groups `$1`, `${1}`, `\1` | the PCRE addon of Uniter inserts the replacement as it is |
| all of Uniter | `\:` in regular expressions becomes `:` | V4 rejects an escaped colon |
| all bundles | chains of string constant additions are folded into one string; an expression deeper than 300 levels stops the build | the V4 compiler walks an expression by recursion without a stack check: 4000 additions in Perlito5 crashed the process on a 1 MB thread stack (Windows) |

Uniter also needs Node.js modules: `process` (through
[tools/process-shim.js](../../tools/process-shim.js)), `path-browserify`,
`util`, `events`, `buffer`, `url`. PHP regular expressions use the PCRE
addon of phpruntime on the pcremu emulator (its own engine, not
`RegExp`); it lacks `preg_split`, which
[php-library.js](../../js/adapters/php-library.js) adds over `RegExp`.

## Adapters

Shared rules (see [host](host.md#adapters)):

 - **Output** goes through `host.writer`: a language prints in pieces
   (`print(..., end="")`, `io.write`), the host gets whole lines and the
   rest at the end of a run.
 - **The state is created when the language loads**, not at the first
   run: loading is outside the time limit, and creating the PHP environment
   takes hundreds of milliseconds.
 - **After an interruption** the watchdog unwinds V4 without running
   `catch` and `finally`. Lua: before a call the adapter remembers `L.ci`,
   `nCcalls`, `nny`, `errfunc` and the stack top and restores them if the
   previous call did not return (otherwise `nCcalls` grows up to "C stack
   overflow"). Prolog: the `__calls` queue of the session is cleared before
   every query (the interrupted call stays in it, and new answers would wait
   for it). Python, Perl and PHP work after an interruption without a
   restore (checked by a test three times in a row).

### Python (Skulpt)

 - All units are the module `__main__` (`retainGlobals`); each one runs
   under its own name so that an error shows the line of its unit.
 - The value of the last expression: the unit is parsed (`Sk.parse`), and
   if the last statement is an expression starting a line, it is assigned
   to a service variable without shifting lines.
 - `Sk.read` serves the standard library of Skulpt, host files (a module
   `./name.py` and any file for `open()`, read only) and host modules: a
   module is served as `src/lib/<name>.js` (`Sk.v4scriptModules`), so
   `import app` works; a global module's functions are also builtins
   (except names of Python builtins, e.g. `range`). Reserved names go
   through `Sk.fixReserved`.
 - `input()` reads the host input; the end of input raises `EOFError`.
 - A JavaScript array in Python is a live `proxylist` printed as a list.

### Lua (fengari)

 - One Lua state; `print` and `io.write` are our own (fengari in a browser
   has no `io`), `os.clock` too (no `performance` in the engine);
   `io.read` and `io.lines` read the host input.
 - The code is loaded as `return <code>` first - as the interactive Lua
   does, so the value of an expression shows; if that fails, as
   statements.
 - The error handler of `lua_pcall` walks the stack to the first Lua frame
   (skipping the prelude) and remembers the line - for Lua errors and for
   JavaScript exceptions from host modules.
 - Modules: a searcher of our own in `package.searchers` reads host files
   (the file searchers would make requests in fengari); `loadfile`,
   `dofile`, `package.loadlib` are removed.
 - Host modules: the module is a global table, a global module's
   functions are also globals.

### Prolog (Tau Prolog)

 - One Tau session. The text of a unit is split into clauses (`.` followed
   by a space, outside quotes and comments); queries `?- goal.` are blanked
   out (the lines of the rest stay), the rest is consulted (`reconsult`:
   the predicates of the unit replace the old ones), then the queries run
   in order, up to 100 answers each.
 - Tau gives answers through `setTimeout(…, 0)`: during a run the adapter
   replaces `setTimeout` with a queue and runs it at once.
 - Streams: output is the console, `user_input` reads the host input; the
   file system is the host files, read only; `consult/1` is our own (the
   browser one would look for a page element and an address).
 - Host modules are library predicates with snake_case names; a function
   result is the last argument (`greet('Ann', X)`), optional parameters give
   several arities.

### Perl (Perlito5)

 - A unit is wrapped into `{ … }` and translated by Perlito5 into
   JavaScript; `our` variables and subroutines are shared, `my` ones are
   local.
 - `p5call` is wrapped: the arguments of a JavaScript method are copies of
   arrays and objects (Perl references), an array from JavaScript is a
   reference to a Perl array; plain data objects become hash references.
 - `print STDERR` in Perlito5 becomes a call of a subroutine `STDERR`; such
   subroutines write to the error stream. `<STDIN>` reads the host input.
 - Modules: `filename_lookup` and `slurp_file` read host files.
 - Perlito5 knows line numbers only at translation (and not always
   exactly): run-time errors have no line.
 - Host modules: a package with the functions, a global module also in
   `main`.

### PHP (Uniter)

 - One Uniter environment (synchronous mode); a unit without `<?php` gets
   it on the same line.
 - A prelude in PHP: `display_errors` off (otherwise a fatal error would
   also print into the output), `printf`, `vsprintf`, `vprintf` (Uniter does
   not parse `...$args`), constants (`M_PI`, `PHP_EOL`…; Uniter does not
   parse literals with an exponent like `1e-16` either), the streams
   `STDIN`, `STDOUT`, `STDERR` as resources with `fgets`, `fwrite`, `feof`,
   `readline`.
 - [php-library.js](../../js/adapters/php-library.js) is a group of Uniter
   functions: math, strings and `mb_*`, arrays and sorting by reference,
   `print_r`, `date`, `json_*`. PHP does not allow declaring again a
   function that Uniter has, so those are skipped.
 - Host modules: a global module's functions are global PHP functions
   (declared with `if (!function_exists(...))`), every function is also in
   the namespace `app\name` through `$__v4script->call()`.
 - Warnings (`include` of a missing file) go to the warning stream; fatal
   errors become the result of the run.

## Adding an interpreter-based language

1. An interpreter written in JavaScript: build it into `js/vendor/<id>/`
   with `build-bundles.mjs` (ES2016, IIFE) with its licenses; check it in
   V4 ([V4 pitfalls](v4-pitfalls.md)).
2. An adapter `js/adapters/<id>.js`: output, input, host modules, host
   files, errors with lines, work after an interruption.
3. An entry in [languages.json](../../languages.json) with versions and
   licenses.
4. Samples `tests/samples/<id>/`, rows in
   [LanguagesTest.cpp](../../tests/LanguagesTest.cpp), a reference page in
   [docs/languages](../languages/README.md), a line in the README and in
   [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES.md).
