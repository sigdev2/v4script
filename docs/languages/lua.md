# Lua

Lua 5.3 in the [fengari](https://github.com/fengari-lua/fengari)
interpreter (0.1.5, MIT) with the module `js` of
[fengari-interop](https://github.com/fengari-lua/fengari-interop). The
libraries `string`, `table`, `math`, `utf8`, `coroutine`, `os.time`,
`os.date`, `os.clock` work; `io.write`, `io.read` and `io.lines` use the
output and the input of the host.

```lua
io.write("Name? ")
local name = io.read()
local scores = {}
for line in io.lines() do
  scores[#scores + 1] = tonumber(line)
end
table.sort(scores)
print(greet(name), #scores, scores[#scores])
return app.add(scores[1], scores[#scores])   -- the value of the run
```

 - **Value**: a unit that is one expression shows its value without
   `return` (as the interactive Lua does); otherwise the values of a
   top-level `return`, separated by tabs.
 - **Variables**: top-level `local` variables belong to their unit; shared
   variables are globals.
 - **Host modules**: a module is a global table (`app.greet("Ann")`), a
   global module's functions are global functions too. A getter is a
   function: `counter()`.
 - **JavaScript**: methods of JavaScript objects are called with a colon:
   `o:value("B2")`, `ctx:fillRect(0, 0, 10, 10)`; properties with a dot:
   `o.title`, `ctx.fillStyle = "red"`. `js.global` is the global object:
   `js.global.console:log("x")`, `js.global:setTimeout(f, 500)`. A Lua
   function called by JavaScript gets `this` as its first argument:
   `js.global.square = function(self, x) return x * x end`.
 - A Lua table goes to JavaScript as a **copy**: a sequence `{1, 2, 3}` as
   an array, anything else as an object; a JavaScript array comes as a
   table indexed from 1; `null` is `nil`; integers are Lua integers.
 - **Modules**: `require("name")` loads the host file `name.lua` (dots are
   directories: `a.b` is `a/b.lua`). `loadfile`, `dofile` and
   `package.loadlib` are removed.
 - **Input**: `io.read` with the formats `"l"`, `"L"`, `"n"`, `"a"` and a
   count, `io.lines()`; `nil` at the end of input.
 - No file system (`io.open`) and no `os.execute`.

Shared rules: [languages](README.md#shared-rules). Internals:
[vendor interpreters](../internals/vendor.md#lua-fengari).
