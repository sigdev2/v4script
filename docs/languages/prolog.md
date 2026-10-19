# Prolog

ISO Prolog in the [Tau Prolog](https://github.com/tau-prolog/tau-prolog)
interpreter (0.3.4, BSD-3-Clause) with the libraries `lists`, `format`,
`random`, `statistics` and `js`. A unit is a program: its facts and rules
go into the shared database (predicates that the unit defines again replace
the old ones), and its **queries** - lines `?- Goal.` - run in order. Each
answer is printed as a line, up to 100 answers per query; no answer prints
`false`.

```prolog
parent(tom, bob).
parent(bob, ann).
grandparent(X, Z) :- parent(X, Y), parent(Y, Z).

?- grandparent(tom, Who).
?- greet('Ann', G), format("~a~n", [G]).
```

Output:

```
Who = ann
Hello, Ann!
G = 'Hello, Ann!'
```

 - **Value**: none; queries print their answers.
 - **Strings** in double quotes are lists of character codes (as in ISO
   Prolog): a format for `format/2` is written in double quotes.
 - **Host modules** are libraries of predicates with snake_case names; a
   function result is the last argument: `greet('Ann', G)`,
   `counter(C)`, `log(one)`. A global module is loaded at start; any module
   can be called qualified (`app:counter(C)`) or loaded with
   `:- use_module(library(app)).` Optional parameters give predicates of
   several arities. A host function that throws is a Prolog error.
 - **JavaScript**: JavaScript objects are terms `<javascript>(object)`;
   the library `js` works with them: `apply(Object, method, [Arguments],
   Result)`, `get_prop(Object, property, Value)`,
   `set_prop(Object, property, Value)`, `global(G)` - the global object,
   `apply(function, [Arguments], Result)` - a global JavaScript function.
   Atoms go to JavaScript as strings, numbers as numbers, lists as arrays,
   a list of pairs `key-value` as an object; JavaScript strings come as
   atoms, arrays as lists.
 - **Modules and files**: `consult('name.pl')` (or `consult(name)`; `.pro`
   works too) loads a host file; `open/3` opens a host file for reading.
   Writing files is not possible.
 - **Input**: `user_input` is standard input: `read/1`, `get_char/1`,
   `peek_char/1`, `read_term/2`; `end_of_file` at the end of input.
 - **Warnings** of the interpreter go to the warning stream.

Shared rules: [languages](README.md#shared-rules). Internals:
[vendor interpreters](../internals/vendor.md#prolog-tau-prolog).
