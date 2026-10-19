# PHP

Most of PHP 7 in [Uniter](https://github.com/asmblah/uniter) (phpruntime
9.3.0, MIT), which translates PHP into JavaScript. A unit may start without
`<?php`.

```php
$name = readline("Name? ");
$stock = ['apple' => 3, 'pear' => 5];
ksort($stock);
foreach ($stock as $item => $count) {
    printf("%-6s %3d\n", $item, $count);
}
echo greet($name), ' ', app\add(2, 3.5), "\n";
return array_sum($stock);                 // the value of the run
```

 - **Value**: the value of a top-level `return` (arrays as JSON).
 - **Variables**: global variables, functions and classes are shared by
   the units. Unlike plain PHP, running a unit again declares its
   functions and classes again (the new ones replace the old ones);
   built-in PHP functions cannot be replaced.
 - **Host modules**: every module is a namespace (`app\greet("Ann")`); a
   global module's functions are also global functions with the JavaScript
   names (`greet("Ann")`, `isEven(4)`). A PHP built-in with the same name
   stays PHP's: `log` and `range` are `app\log` and `app\range`. A getter
   is a function: `counter()`.
 - **JavaScript**: methods and properties of JavaScript objects are used
   with `->`, writing too: `$ctx->fillStyle = "red"`. JavaScript objects
   without methods (plain data) are objects as well: `$p->x`. `$js` is the
   global object (inside functions: `global $js`):
   `$js->console->log("x")`, `$js->Math->max(1, 5)`. A PHP function can be
   given to JavaScript: `$js->double = function ($x) { return 2 * $x; };`.
 - A PHP array goes to JavaScript as an array (keys 0, 1, 2…) or as an
   object; a JavaScript array comes as a PHP array (a copy).
 - **Modules**: `include`, `require`, `include_once`, `require_once` load
   a host file by its name. PHP warnings go to the warning stream.
 - **Input**: `readline($prompt)`, `fgets(STDIN)`, `fgetc(STDIN)`,
   `feof(STDIN)`; `false` at the end of input. `fwrite(STDERR, …)` writes
   to standard error.
 - **The standard library is incomplete.** Available: strings (`sprintf`,
   `printf`, `str_pad`, `str_replace`, `explode`, `implode`,
   `number_format`, `mb_*`…), arrays (`sort` and its kinds, `array_*`,
   `range`, `in_array`…), math, `json_encode`/`json_decode` (JSON objects
   as associative arrays), `date`, `mktime`, `print_r`, `var_dump`, regular
   expressions `preg_match`, `preg_match_all`, `preg_replace`, `preg_split`,
   `preg_quote`. Missing: `...$args` (use `func_get_args()`), number
   literals like `1e-16`, files, network, databases, `md5`. `asort`
   compares values as strings.

Shared rules: [languages](README.md#shared-rules). Internals:
[vendor interpreters](../internals/vendor.md#php-uniter).
