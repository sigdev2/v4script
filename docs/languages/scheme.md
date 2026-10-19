# Scheme

Scheme R7RS-small with complex numbers and the libraries SRFI 1 (lists),
SRFI 13 (strings), SRFI 69 (hash tables) and SRFI 18 (threads), translated
into JavaScript by v4script. Continuations (`call/cc`) are full: a
continuation can be re-entered any number of times, and recursion is not
bound by a depth limit - `(depth 1000000)` runs while memory lasts.

```scheme
; Words of a line of input, sorted, and a greeting of the host
(define words (string-split (read-line) #\space))
(for-each (lambda (w) (display w) (newline))
          (sort words string<?))
(display (greet (car words)))     ; a procedure of the host module "app"
(newline)
(apply + (iota 10))               ; the value of the run: 45
```

## A unit is a sequence of top-level forms

 - A unit is a sequence of forms, like a program file: definitions
   (`define`, `define-syntax`, `define-record-type`, `define-library`,
   `import`) and expressions. Before it runs, the unit is **read and
   translated as a whole**: a syntax error in any form runs none of them.
 - **The value of a unit** is the value of its last form if it is an
   expression, as `write` prints it: `42`, `"text"`, `(1 2 3)`. A
   definition, `(display …)` and other expressions without a value give no
   value.
 - **Shared definitions.** Variables, procedures, macros and records of one
   unit are visible in the other Scheme units. Running a unit again defines
   them again.
 - A built-in name can be defined again: `(define (filter …) …)`. The new
   definition is seen by the forms of this unit (also those above it) and
   by units run later; code translated earlier keeps the built-in
   procedure. `set!` of a built-in procedure is an error.
 - The continuation of a top-level form called from another form finishes
   that form and goes on with the form **after the current one** (as in a
   REPL), without repeating the forms between them.
 - `(exit)` ends the unit without an error.
 - Arguments are evaluated from left to right (the standard leaves the
   order open).

## Numbers

 - **Exact**: unbounded integers (`(expt 2 100)`), fractions (`(/ 6 4)` is
   `3/2`). Division of exact integers gives an exact fraction.
 - **Inexact** numbers are doubles: `1.5`, `1e21`, `+inf.0`, `-inf.0`,
   `+nan.0`. They print in the shortest form that reads back as the same
   number, with `.0` for integers: `2.0`, `0.1`, `1e+21`, `1e-07`.
 - **Complex**: `3+4i`, `(make-polar 1 3.14)`, `(sqrt -4)` is `0+2i`; the
   real part is always printed. Trigonometry, `exp`, `log`, `expt`, `sqrt`
   work with complex numbers too.
 - Literals: `#x1F`, `#b101`, `#o17`, `#e1.5` (the exact `3/2`), `#i3/4`
   (the inexact `0.75`).
 - Exact and inexact numbers do not mix: `(= 1 1.0)` is `#t`, but
   `(eqv? 1 1.0)` is `#f`; a result with an inexact operand is inexact:
   `(+ 1/2 0.5)` is `1.0`.

## Strings, characters, symbols

 - Strings are mutable (`string-set!`, `string-fill!`), an index is the
   number of a Unicode character: `(string-length "Привет")` is 6.
   Characters are `#\a`, `#\x3bb`, `#\space`, `#\newline`, `#\tab`.
 - Symbols are case-sensitive: `'Abc` and `'abc` differ; `#!fold-case` in
   the text of a unit turns on folding to lower case. A symbol with spaces
   is written between bars: `|two words|`.
 - `display` prints strings and characters as they are, inside lists too:
   `(display '("a" #\b))` is `(a b)`; `write` prints Scheme notation:
   `("a" #\b)`.

## What is supported

 - All of R7RS-small: `define`, `lambda`, the `let` forms, `do`, named
   `let`, `cond`, `case` (with `=>`), `when`, `unless`, `case-lambda`,
   `define-values`, `let-values`, `define-record-type`, `parameterize`,
   `guard`, `delay`, `delay-force`, `make-promise`, quasiquotation,
   `syntax-rules`, `let-syntax`, `letrec-syntax`, `syntax-error`,
   `cond-expand`, `include`, `define-library`, `import`, `eval`,
   `environment`, string and bytevector ports, `read`, labels `#0=` for
   circular data.
 - Also: `receive` (SRFI 8), `assert`, `format` (SRFI 28), `random`,
   `random-integer`, `random-real` (SRFI 27), `sort`, `list-sort`,
   `vector-sort` (SRFI 95 and 132, a stable merge sort), `fold-left`, the
   bitwise `bitwise-and`, `bitwise-ior`, `bitwise-xor`, `bitwise-not`,
   `arithmetic-shift`, `bit-count`, `string-split`,
   `with-output-to-string`, `call-with-output-string`.
 - All procedures are visible at once, without `import`: a unit may write
   `(filter odd? lst)` and `(hash-table-set! h k v)`.
   `(import (scheme base))` and other standard libraries change nothing.

### Procedures

| Group | Procedures |
| --- | --- |
| Equivalence | `eq?` `eqv?` `equal?` |
| Numbers | `number?` `complex?` `real?` `rational?` `integer?` `exact?` `inexact?` `exact-integer?` `exact-rational?` `exact-nonnegative-integer?` `nan?` `infinite?` `finite?` `=` `<` `>` `<=` `>=` `zero?` `positive?` `negative?` `odd?` `even?` `max` `min` `+` `*` `-` `/` `abs` `quotient` `remainder` `modulo` `floor/` `floor-quotient` `floor-remainder` `truncate/` `truncate-quotient` `truncate-remainder` `gcd` `lcm` `numerator` `denominator` `floor` `ceiling` `round` `truncate` `exact-floor` `exact-round` `rationalize` `exp` `log` `sin` `cos` `tan` `asin` `acos` `atan` `square` `cube` `sqrt` `exact-integer-sqrt` `expt` `make-rectangular` `make-polar` `real-part` `imag-part` `magnitude` `angle` `exact` `inexact` `exact->inexact` `inexact->exact` `number->string` `string->number` `bitwise-and` `bitwise-ior` `bitwise-or` `bitwise-xor` `bitwise-not` `arithmetic-shift` `bit-count` `integer-length` `random` `random-integer` `random-real` |
| Booleans | `not` `boolean?` `boolean=?` |
| Pairs and lists | `cons` `car` `cdr` `set-car!` `set-cdr!` `caar` … `cddddr` `pair?` `null?` `list?` `list` `make-list` `length` `append` `reverse` `list-tail` `list-ref` `list-set!` `memq` `memv` `member` `assq` `assv` `assoc` `list-copy` `last-pair` `map` `for-each` `apply` |
| SRFI 1 | `xcons` `cons*` `iota` `circular-list` `first` … `tenth` `car+cdr` `take` `drop` `take-right` `drop-right` `split-at` `last` `length+` `concatenate` `append!` `reverse!` `append-reverse` `zip` `unzip1` … `unzip5` `proper-list?` `dotted-list?` `circular-list?` `null-list?` `not-pair?` `list-tabulate` `fold` `fold-right` `fold-left` `pair-fold` `pair-fold-right` `reduce` `reduce-right` `unfold` `unfold-right` `append-map` `filter-map` `map-in-order` `pair-for-each` `filter` `remove` `partition` `find` `find-tail` `any` `every` `list-index` `count` `take-while` `drop-while` `span` `break` `delete` `delete-duplicates` `alist-cons` `alist-copy` `alist-delete` `list=` `lset-adjoin` `lset-union` `lset-intersection` `lset-difference` `lset-xor` `lset<=` `lset=`; the `!` variants are the same procedures |
| Sorting | `sort` `sort!` `list-sort` `vector-sort` `vector-sort!` `merge` `sorted?` |
| Symbols | `symbol?` `symbol=?` `symbol->string` `string->symbol` `string->uninterned-symbol` `gensym` `symbol-append` |
| Characters | `char?` `char=?` `char<?` `char>?` `char<=?` `char>=?` and `char-ci…` `char-alphabetic?` `char-numeric?` `char-whitespace?` `char-upper-case?` `char-lower-case?` `digit-value` `char->integer` `integer->char` `char-upcase` `char-downcase` `char-foldcase` |
| Strings | `string?` `make-string` `string` `string-length` `string-ref` `string-set!` `string=?` `string<?` `string>?` `string<=?` `string>=?` and `string-ci…` `string-upcase` `string-downcase` `string-foldcase` `substring` `string-copy` `string-copy!` `string-fill!` `string-append` `string->list` `list->string` `string->vector` `vector->string` `string->utf8` `utf8->string` `string-map` `string-for-each` `string-split` `format` |
| SRFI 13 | `string-null?` `string-every` `string-any` `string-tabulate` `string-join` `string-take` `string-drop` `string-take-right` `string-drop-right` `string-pad` `string-pad-right` `string-trim` `string-trim-right` `string-trim-both` `string-prefix?` `string-suffix?` `string-prefix-ci?` `string-suffix-ci?` `string-prefix-length` `string-suffix-length` `string-index` `string-index-right` `string-skip` `string-skip-right` `string-count` `string-contains` `string-contains-ci` `string-titlecase` `string-upcase!` `string-downcase!` `string-reverse` `string-concatenate` `string-concatenate-reverse` `string-fold` `string-fold-right` `string-unfold` `string-unfold-right` `string-filter` `string-delete` `string-tokenize` `string-replace` `reverse-list->string` `string=` `string<>` `string<` `string>` `string<=` `string>=` and `string-ci…` `string-hash` `string-ci-hash` |
| Vectors | `vector?` `make-vector` `vector` `vector-length` `vector-ref` `vector-set!` `vector->list` `list->vector` `vector-copy` `vector-copy!` `vector-append` `vector-fill!` `vector-map` `vector-for-each` |
| Bytevectors | `bytevector?` `make-bytevector` `bytevector` `bytevector-length` `bytevector-u8-ref` `bytevector-u8-set!` `bytevector-copy` `bytevector-copy!` `bytevector-append` |
| Control | `procedure?` `call-with-current-continuation` (`call/cc`) `values` `call-with-values` `dynamic-wind` `make-parameter` `force` `make-promise` `promise?` `eval` `environment` `interaction-environment` `scheme-report-environment` `null-environment` |
| Exceptions | `raise` `raise-continuable` `with-exception-handler` `error` `error-object?` `error-object-message` `error-object-irritants` `read-error?` `file-error?` `condition/report-string` |
| Hash tables (SRFI 69) | `make-hash-table` `hash-table?` `alist->hash-table` `hash-table-ref` `hash-table-ref/default` `hash-table-set!` `hash-table-delete!` `hash-table-exists?` (`hash-table-contains?`) `hash-table-update!` `hash-table-update!/default` `hash-table-size` `hash-table-keys` `hash-table-values` `hash-table-walk` `hash-table-fold` `hash-table->alist` `hash-table-copy` `hash-table-merge!` `hash-table-clear!` `hash-table-equivalence-function` `hash-table-hash-function` `hash` `hash-by-identity` |
| Threads (SRFI 18) | `make-thread` `thread-start!` `thread-yield!` `thread-sleep!` `thread-join!` `thread-terminate!` `current-thread` `thread?` `thread-name` `thread-specific` `thread-specific-set!` `make-mutex` `mutex-lock!` `mutex-unlock!` `mutex-state` `mutex?` `mutex-name` `mutex-specific` `mutex-specific-set!` `make-condition-variable` `condition-variable-signal!` `condition-variable-broadcast!` `condition-variable?` `condition-variable-name` `condition-variable-specific` `condition-variable-specific-set!` `current-time` `time?` `time->seconds` `seconds->time` `uncaught-exception?` `uncaught-exception-reason` `join-timeout-exception?` `terminated-thread-exception?` `abandoned-mutex-exception?` |
| Ports | `display` `write` `write-shared` `write-simple` `newline` `write-char` `write-string` `write-u8` `write-bytevector` `read` `read-char` `peek-char` `read-line` `read-string` `read-u8` `peek-u8` `read-bytevector` `read-bytevector!` `char-ready?` `u8-ready?` `eof-object` `eof-object?` `open-input-string` `open-output-string` `get-output-string` `open-input-bytevector` `open-output-bytevector` `get-output-bytevector` `current-output-port` `current-error-port` `current-input-port` `port?` `input-port?` `output-port?` `textual-port?` `binary-port?` `input-port-open?` `output-port-open?` `close-port` `close-input-port` `close-output-port` `call-with-port` `flush-output-port` `with-output-to-string` `call-with-output-string` |
| Files (host files) | `open-input-file` `open-binary-input-file` `call-with-input-file` `with-input-from-file` `file-exists?` `load` |
| System | `exit` `emergency-exit` `command-line` `get-environment-variable` `get-environment-variables` `current-second` `current-jiffy` `jiffies-per-second` `features` |
| JavaScript | `js` `js-global` `js-ref` `js-set!` `js-invoke` `js-call` `js-new` `js-object` `js-array` `js-function` `js->scheme` `scheme->js` `js-null` `js-null?` `js-undefined` `js-undefined?` `js-object?` |

## Continuations and recursion

 - `call/cc` captures the whole continuation: generators, backtracking
   (`amb`) and coroutines work. `dynamic-wind` runs `before` and `after` at
   every entry and exit, through continuations and exceptions too.
 - Tail calls do not grow the stack (as R7RS requires): a named `let` loop
   or mutual recursion runs any number of steps.
 - Non-tail recursion is limited only by memory: continuations live on the
   heap, not on the stack.
 - A continuation captured in a Scheme procedure called by JavaScript (for
   example, in a callback of `Array.prototype.map`) cannot be re-entered
   after that call returned to JavaScript; escaping through it works.

## Errors

 - Errors come with the line in the unit: `car: not a pair: ()`,
   `vector-ref: index out of range: #(1 2) 5`,
   `f: expected 2 arguments, got 1`, `undefined variable: foo`.
 - `(error "Message:" 1 'x)` is `Message: 1 x`; a value raised by `raise`
   without a handler is `uncaught exception: (bad-age -1)`.
 - All errors, of built-in procedures and of JavaScript too, are R7RS error
   objects: `guard` and `with-exception-handler` catch them,
   `error-object-message` gives the text, `error-object-irritants` the
   values.
 - A syntax error (an unbalanced parenthesis, a wrong form, no matching
   `syntax-rules` rule) is reported before the unit runs, with the line of
   the form.
 - A `with-exception-handler` handler that returns from `raise` is the
   error `exception handler returned` (returning from `raise-continuable`
   is fine).

## Macros

Only `syntax-rules`, hygienic: names introduced by a template do not clash
with names at the place of use, and free names of a template mean what they
mean where the macro was defined. Literals, `_`, an ellipsis after an
element and in the middle of a pattern (`(a ... z)`), nested ellipses, a
custom ellipsis, `(... ...)`, vector patterns and macros that define macros
are supported. There is no `er-macro-transformer` and no `define-macro`.

## Libraries and host files

 - `(define-library (name …) (export …) (import …) (begin …))` in a unit
   defines a library; `(import (name …))` imports it. The body of a library
   runs once - at the first import. Imports support `only`, `except`,
   `prefix`, `rename`.
 - A library from a host file: `(import (geometry shapes))` looks for the
   host file `geometry.shapes.sld`, then `geometry.shapes.scm`. The file
   holds a `define-library` form with the same name; without one,
   everything the file defines is exported. A changed file is loaded again
   at the next run.
 - `(load "file.scm")` runs a host file as part of the program,
   `(include "file.scm")` inserts its forms in place of `include`. An error
   in a host file names it and the line in it.
 - `cond-expand` knows `r7rs`, `ratios`, `exact-complex`, `full-unicode`,
   `srfi-1`, `srfi-13`, `srfi-18`, `srfi-69` and the others of
   `(features)`, and `(library (name …))`.

## Threads and waiting

 - SRFI 18 threads take turns in the same engine (switching every few
   thousand calls, at `thread-yield!` and when waiting): `mutex-lock!`
   waits for a mutex, `thread-join!` for the end of a thread,
   `mutex-unlock!` with a condition variable for a signal. Timeouts are in
   seconds or time objects.
 - `thread-sleep!` waits real time. While the main thread sleeps, the others
   run; if all of them sleep, the run ends and the program goes on in a
   timer of the engine (see [programs that wait](README.md#shared-rules)).
 - When the main program of a unit ends, the other threads stop (as at the
   exit of a program).
 - An exception in a thread without a handler ends only that thread;
   `thread-join!` raises an `uncaught-exception` with the reason.
 - Inside a Scheme procedure called by JavaScript threads do not switch:
   waiting for a mutex or another thread there is an error, and
   `thread-sleep!` waits in place.

## Input and output

 - `display`, `write`, `newline`, `write-string` write to standard output;
   `(current-error-port)` is standard error.
 - **Input**: `(current-input-port)` reads standard input of the host:
   `read-line`, `read` (a datum, over several lines), `read-char`,
   `peek-char`, `char-ready?`; the end of input gives the eof object.
 - String ports (`open-input-string`, `open-output-string`), bytevector
   ports, `with-output-to-string`.
 - Files are host files, read only: `(open-input-file "data.txt")`,
   `call-with-input-file`, `with-input-from-file`, `file-exists?`. A file
   cannot be written: `open-output-file` is an error (`file-error?`).

## JavaScript and host modules

 - **Dot notation** reaches properties and methods of JavaScript objects:
   `o.title` is a property, `(o.value "B2")` a method call,
   `(set! ctx.fillStyle "red")` sets a property, `obj.a.b` is a chain. A
   path starts with a name: `((get-canvas).getContext "2d")` cannot be
   written so - put the value into a variable first. The start of a path
   is a Scheme variable, or a JavaScript global if there is no such
   variable: `(Math.max 1 5)`, `Math.PI`, `(JSON.stringify obj)`. A Scheme
   string has its properties too: `s.length`, `(s.toUpperCase)`.
 - **JavaScript globals.** An undefined Scheme variable is looked up in the
   global object: a function `jsDouble` defined by JavaScript is called as
   `(jsDouble 21)`. The variable `js` is the global object itself:
   `(set! js.schemeSquare square)` gives JavaScript the procedure `square`
   as the function `schemeSquare`.
 - **Procedures**: `(js-ref obj "a" "b")` - a property by path,
   `(js-set! obj "a" v)`, `(js-invoke obj "method" args…)`,
   `(js-call f args…)`, `(js-new "Date" 0)`,
   `(js-object 'title "Report" 'rows rows)` - an object, `(js-global)`.
 - **Values at the boundary**:

| Scheme | JavaScript | Back into Scheme |
| --- | --- | --- |
| exact integer, fraction, inexact number | number | an integer number is an exact integer, one with a fraction is inexact |
| string, character, symbol | string | string |
| `#t`, `#f` | `true`, `false` | `#t`, `#f` |
| list, vector | array | an array is a vector (a copy) |
| hash table | object (string keys) | a JavaScript object as it is |
| record | object with fields | a JavaScript object as it is |
| procedure | function (a call runs the procedure) | a function is a procedure |
| `(js-null)` | `null` | `null` (`js-null?`) |
| unspecified value | `undefined` | - |

 - **Host modules**: a global module's functions are procedures with
   kebab-case names: `(greet "Ann")`, `(is-even 4)`, `(counter)` for a
   getter; a built-in Scheme name stays Scheme's. Every module is also an
   object for the dot notation: `(app.log "one")`, `app.counter`.

```scheme
(define c canvas)                 ; a canvas the application put into a global variable
(define ctx (c.getContext "2d"))
(define colors #("red" "green" "blue"))
(do ((i 0 (+ i 1))) ((= i 10))
  (set! ctx.fillStyle (vector-ref colors (modulo i 3)))
  (ctx.fillRect (* i 30) 10 25 25))
```

 - JavaScript objects print as the JavaScript console shows them; an array
   from JavaScript is a Scheme vector.

## Differences from chibi-scheme

The reference of behavior is chibi-scheme 0.9.1 (the reference
implementation of R7RS); numbers, error messages and printing match it,
except:

 - a unit is translated as a whole before it runs (chibi runs a file form
   by form);
 - arguments are evaluated from left to right (chibi: right to left);
 - `display` prints strings and characters inside lists without quotes (as
   R7RS requires);
 - `write` prints characters by their R7RS names (`#\space`, `#\null`),
   bytevectors as `#u8(1 2 255)`, records as `#<point x: 1 y: 2>`;
 - `equal?` compares records as `eqv?` (R7RS; chibi compares fields);
 - recursion is not bound by the stack (chibi: `out of stack space`).

Shared rules: [languages](README.md#shared-rules). Internals:
[Scheme in the translator](../internals/scheme.md).
