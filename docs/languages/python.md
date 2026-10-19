# Python

Python 3 in the [Skulpt](https://github.com/skulpt/skulpt) interpreter
(commit ae5f462, MIT). The standard modules `math`, `random`, `re`, `json`,
`string`, `collections`, `itertools`, `functools`, `datetime`, `time`,
`bisect`, `copy`, `operator` and some others work; modules for files,
network, processes and windows (`os`, `socket`, `subprocess`, `turtle`…)
and `heapq` are not implemented in Skulpt.

```python
prices = {"apple": 0.5, "pear": 0.75}
count = int(input("How many apples? "))
total = add(prices["apple"] * count, 1)    # app.add from the host module
print(f"{greet('Ann')} Total: {total:.2f}")
[name.upper() for name in sorted(prices)]  # the value of the run
```

 - **Value**: the last expression of the unit - a string as it is, other
   values as `repr` shows them; `None` is no value.
 - **Host modules**: a global module's functions are builtins (a Python
   builtin with the same name stays Python's); every module can be
   imported: `import app`, `app.greet("Ann")`. A getter is a function:
   `counter()`.
 - **JavaScript**: `js` is the global object: `js.console.log(...)`,
   `js.setTimeout(f, 500)`, `js.myVar = 1`. A Python function can be given
   to JavaScript: `js.double = lambda x: 2 * x` - and called as `double(21)`
   from JavaScript; event handlers are set the same way.
 - An array from JavaScript is a Python list linked to the array: changes
   are visible in both languages.
 - **Modules and files**: `import name` loads the host file `name.py`;
   `open("data.csv").read()` reads a host file. Writing files is not
   possible.
 - **Input**: `input(prompt)` reads a line of standard input; the end of
   input raises `EOFError`.
 - Python is slower than JavaScript: a loop of a million steps takes
   seconds.

Shared rules: [languages](README.md#shared-rules). Internals:
[vendor interpreters](../internals/vendor.md#python-skulpt).
