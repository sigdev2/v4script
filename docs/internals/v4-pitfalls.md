# V4 pitfalls

The JavaScript engine of Qt 6.4 (V4) implements ECMAScript 2016 with a
number of bugs and limits. Everything in [js/](../../js) is written for
it; this page lists what v4script works around and where. Check these again
when the Qt version changes.

## Language level

 - **ES2016 only**: no `async`/`await`, no object spread, no optional
   chaining, no `**=` quirks of later versions, no regular expression flags
   `s` and named groups. The scripts are plain ES2016 without a build step;
   third-party bundles are built down to ES2016
   ([vendor](vendor.md)).
 - Library functions of later versions (`Object.fromEntries`,
   `Object.hasOwn`, `flat`, `flatMap`, `at`, `findLast`, `trimStart`,
   `replaceAll`, `matchAll`, `Promise.prototype.finally`,
   `Promise.allSettled`, `queueMicrotask`, …) are polyfilled by
   [compat.js](../../js/host/compat.js), which also fixes the V4 bugs of
   `String.prototype.split`, `substr` and `endsWith`.
 - `Function.prototype.toString` returns `[native code]` for every
   function. Skulpt used it to tell constructors from functions; its bundle
   is patched.
 - Regular expressions: the flag `u` breaks a search that does not start at
   the beginning of the string, the flag `s` does not exist, an escaped
   colon `\:` is rejected, `\B(?=…)` in `replace` inserts twice.
 - `RegExp.prototype.source` (and `toString`) double the backslash of an
   escaped slash: `/a\/b/.source` is `a\\/b`. compat.js redefines both.
 - `Math.round` is wrong near 2^52 (WebAssembly `f64.nearest` is written
   without it).

## Compiler and stack

 - **Expression depth.** The V4 compiler walks an expression by recursion
   without a stack check: a chain of thousands of `+` (`'a' + 'b' + …`)
   crashes the process on a 1 MB thread stack (the GUI thread on Windows).
   The translator refuses expressions deeper than 250 levels, the vendor
   build folds constant string chains and refuses expressions deeper than
   300, [tools/minify.mjs](../../tools/minify.mjs) checks its output too.
 - **Call depth** is a constant read from `QV4_MAX_CALL_DEPTH` when the
   first engine of the process is created (640 on Windows, 1234 on Linux,
   1000 on Android), not a stack size. `v4script::prepareProcess()` raises
   it to 10000 and gives the main thread 16 MB of stack. Call it before
   any `QJSEngine` exists.
 - **Tail calls.** In strict code V4 runs `return f(…)` as a tail call even
   where it is not one: `return a.b = c ? d : f()` loses the assignment,
   and the frame of the function disappears from the error stack (the
   translators put such values into a temporary first). A tail call of a
   generator function returns `undefined`.
 - The compiler prints hints ("Variable … is used before its declaration")
   on generated code and on interpreter bundles; v4script silences the
   category `qt.qml.compiler` while it loads languages and runs code
   (`QuietCompiler`).

## Objects and memory

 - **`WeakMap`** with thousands of keys crashes the process during garbage
   collection (Qt 6.4.1; the moment depends on the collector). Use `Map`
   and clear it, or keep the data on the objects.
 - **Redefining a data property as an accessor** on many objects
   (`Object.defineProperty(obj, 'node', { get, set })` where `obj.node` was
   assigned in the constructor) crashed V4 in `Object::setProperty` under
   some memory layouts (it showed with the minified scripts). Define such
   accessors once on the prototype.
 - Typed arrays have no `sort`.
 - `sort` and `splice` break an array that `shift` has taken elements from
   (elements repeat or vanish): queues are rebuilt as new arrays.
 - `String.fromCharCode.apply(null, typed.subarray(a, b))` reads from the
   start of the buffer, not from `a`: copy into a plain array first.
 - In a generator, `finally` after `return` sees another `this`.
 - Values are NaN-boxed: every NaN is canonical, its sign and payload are
   lost (WebAssembly `reinterpret`, `copysign` of a NaN).
 - `new` of a small object costs about 200 ns: hot paths avoid allocation
   (Scheme floats with a fraction are plain numbers).

## Host environment

 - There is no `window`, `process`, `require`, `performance` or
   `setTimeout` in a plain `QJSEngine`; v4script provides `setTimeout`,
   `setInterval`, `clearTimeout`, `clearInterval` and `console` through
   `Runtime` (or the application, when `Engine` is attached to its engine).
 - The watchdog interrupts code with `QJSEngine::setInterrupted`: the stack
   unwinds without running `catch` and `finally`. Interpreter states are
   restored before the next call (Lua, Prolog; see [vendor](vendor.md)).
 - A Qt Quick canvas: `putImageData(image, x, y)` with three arguments
   draws nothing in Qt 6.4 - use the form with a dirty region; writing into
   `ImageData.data` is a C++ call per element.
 - An `ArrayBuffer` larger than about 512 MB is not reliable: linear
   memories of C, Forth and WebAssembly are limited to it.
