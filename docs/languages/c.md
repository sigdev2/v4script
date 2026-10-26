# C

C17 without threads, file writing and network, translated into JavaScript
by v4script. A program has its own memory, like a real process: pointers,
`malloc`, structs and arrays are bytes in it; `int` is 4 bytes, `long` and a
pointer 8, as on 64-bit Linux. Memory errors do not harm the application:
they stop the program with `Segmentation fault` and the line.

```c
typedef struct {
    char name[32];
    double price;
} Item;

static int by_price(const void *a, const void *b)
{
    double x = ((const Item *)a)->price, y = ((const Item *)b)->price;
    return (x < y) - (x > y);
}

Item items[16];
int count = 0;
while (count < 16 && scanf("%31s %lf", items[count].name, &items[count].price) == 2)
    count++;
qsort(items, count, sizeof *items, by_price);
printf("Most expensive: %s (%.2f)\n", items[0].name, items[0].price);
puts(greet(items[0].name));     // a function of the host module "app"
count;                          // the value of the run
```

## A unit is a source file

 - **Headers are included already.** Every unit starts as if it had
   `#include` of all standard headers of the table below, `js.h` and the
   headers of global host modules: `printf`, `malloc`, `strlen`, `sqrt`
   need no `#include`. A written `#include <stdio.h>` changes nothing - so
   the code also builds with a normal compiler.
 - Besides declarations a unit may have **statements**: they run in order,
   as the body of `main`. If the unit defines `int main(void)` (or
   `int main(int argc, char **argv)`, `argv[0]` is `"main"`), it runs after
   them. `main` returning non-zero is the error `exit status N`.
 - **Value.** If the unit has no `main` and its last statement is an
   expression (`x * 2;`, `add(2);`, `point;`), the run returns its value: a
   number, a string for `char *` and `char` arrays, an object for a struct,
   an array for an array, `true`/`false` for `_Bool`, the JavaScript value
   for `js_value`. Assignments, `x++` and calls of `printf`, `puts` and
   other library functions that return `int` give no value.
 - **Shared declarations.** Functions, global variables, types (`struct`,
   `typedef`, `enum`) and `#define` macros of one unit are visible in the
   other C units. Running a unit again declares them again: a function
   replaces the old one, a global variable of the same name and size stays
   at the same address and gets its initial value again. `static` variables
   of a function keep their value between calls until the function is
   defined again.
 - A unit with a translation error does not change the shared
   declarations: its macros and functions do not appear.

## What is supported

 - **Numbers**: all integer types with overflow as on x86-64 (`int` and
   `unsigned` are 32 bits, `long`, `long long`, `size_t` and pointers 64),
   `float` (32 bits, rounded to `float`), `double`; `long double` is
   `double`. Integer division by zero is the error `Floating point
   exception`. Constant expressions are exact.
 - **Pointers and memory**: address arithmetic, `&` and `*`, pointers to
   pointers and to functions, `void *`, casts (bytes of a number can be read
   through `unsigned char *` and back, misaligned too). `malloc`, `calloc`,
   `realloc`, `free` - a heap up to 512 MB; a second `free` is the error
   `double free`. The stack is 1 MB.
 - **Arrays**: multidimensional, variable length (`int a[n]`),
   initializers `{ … }` with designators `[3] = 5`, `.x = 1`; strings are
   `char[]` and `char *` with UTF-8 bytes (`strlen("привет")` is 12).
 - **Structs, unions, enums**: nested and anonymous, bit fields,
   assignment and passing of structs by value, structs returned from
   functions, compound literals `(Point){1, 2}`, `typedef`, `sizeof`,
   `offsetof`, `_Alignof`.
 - **Functions**: prototypes, `static`, `inline`, variadic functions
   (`...`, `va_list`, `va_start`, `va_arg`, `va_end`, `va_copy`), pointers
   to functions and arrays of them, recursion.
 - **Statements**: `if`, `switch` (with fall-through and `case 1 ... 5`),
   `while`, `do`, `for` with a declaration, `break`, `continue`, `return`,
   `_Static_assert`.
 - **Preprocessor**: `#define` with parameters, `#` and `##`,
   `__VA_ARGS__` (and the GNU `, ## __VA_ARGS__`), `#if`/`#ifdef`/`#elif`,
   `defined`, `#undef`, `#include`, `#error`, `#warning`, `#pragma once`,
   `__LINE__`, `__FILE__`, `__func__`.
 - **Waiting**: `sleep`, `usleep`, `nanosleep`. While the program waits,
   the run ends and the program goes on in timers of the engine (see
   [programs that wait](README.md#shared-rules)).

## The standard library

| Header | What is there |
| --- | --- |
| `stdio.h` | `printf`, `fprintf`, `sprintf`, `snprintf` and the `v…` variants (all conversions, flags, width and precision; floats as glibc prints them: an exact half goes to even, `inf`, `nan`), `puts`, `putchar`, `fputs`, `fputc`, `fwrite`, `sscanf`, `scanf`, `fscanf`, `fgets`, `fgetc`, `getchar`, `ungetc`, `fopen` (host files, read only), `fread`, `fseek`, `ftell`, `rewind`, `feof`, `ferror`, `fclose`, `perror`; `stdout`, `stderr`, `stdin` |
| `stdlib.h` | `malloc`, `calloc`, `realloc`, `free`, `atoi`, `atol`, `atof`, `strtol`, `strtoul`, `strtoll`, `strtod`, `abs`, `labs`, `div`, `ldiv`, `rand` and `srand` (the same numbers as glibc), `qsort`, `bsearch`, `exit`, `atexit`, `abort` |
| `string.h`, `strings.h` | `strlen`, `strcpy`, `strncpy`, `strcat`, `strncat`, `strcmp`, `strncmp`, `strcasecmp`, `strchr`, `strrchr`, `strstr`, `strtok`, `strspn`, `strcspn`, `strpbrk`, `strdup`, `strndup`, `strerror`, `memcpy`, `memmove`, `memset`, `memcmp`, `memchr` |
| `math.h` | trigonometry, `exp`, `log`, `log2`, `log10`, `pow`, `sqrt`, `cbrt`, `hypot`, `floor`, `ceil`, `round`, `trunc`, `rint`, `fmod`, `remainder`, `fabs`, `fmin`, `fmax`, `frexp`, `ldexp`, `modf`, `tgamma`, `lgamma`, `erf`, `erfc`, `lround`, `isnan`, `isinf`, `M_PI` and others; `float` variants with `f` (`sqrtf`) |
| `ctype.h` | `isalpha`, `isdigit`, `isspace`, `isupper`, `islower`, `isalnum`, `ispunct`, `isxdigit`, `toupper`, `tolower` and others (ASCII) |
| `time.h`, `unistd.h` | `time`, `clock`, `difftime`, `localtime`, `gmtime`, `mktime`, `strftime`, `ctime`, `asctime`; `sleep`, `usleep`, `nanosleep` |
| `stdint.h`, `inttypes.h`, `limits.h`, `float.h`, `stdbool.h`, `stddef.h`, `stdarg.h`, `errno.h`, `assert.h` | `int8_t`…`uint64_t`, `PRId64` and others, `INT_MAX`…, `DBL_EPSILON`…, `bool`, `size_t`, `NULL`, `offsetof`, `va_list`, `errno`, `assert` |

 - `stderr` is standard error.
 - **Files** are host files: `fopen("data.txt", "r")` opens the host file
   `data.txt` for reading. A file cannot be opened for writing (`fopen`
   returns `NULL`, `errno` is `EROFS`).
 - **Input**: `stdin` is standard input of the host: `scanf` waits for the
   next lines, `fgets` and `getchar` read what is left, `EOF` and
   `feof(stdin)` at the end of input. Output is written out before the
   program waits for a line, so a prompt without `\n` is visible:
   `printf("Name? ");` needs no `fflush(stdout)`.

## JavaScript and host modules

The header `js.h` (always included) works with JavaScript values. A
JavaScript value in C is a `js_value`: a handle that can be kept in
variables and structs; `NULL` is JavaScript `null` and `undefined`.

| Function | What it does |
| --- | --- |
| `js_global()` | the JavaScript global object |
| `js_get(object, "name")`, `js_set(object, "name", value)` | a property of an object |
| `js_call(object, "method", arguments…)` | a method call; the result is a `js_value` |
| `js_invoke(function, arguments…)`, `js_new(constructor, arguments…)` | a call of a JavaScript function, `new` |
| `js_index(array, i)`, `js_set_index(array, i, value)`, `js_length(value)` | elements and length of an array (and a string) |
| `js_number`, `js_int`, `js_bool`, `js_string` | a JavaScript value as `double`, `long long`, `int`, a C string (`js_string` allocates memory - free it with `free`; an object becomes JSON text) |
| `js_is_null`, `js_type` | `null` or `undefined`; the type (`"number"`, `"string"`, `"object"`, `"null"`…) |
| `js_from_int`, `js_from_double`, `js_from_string`, `js_from_bool` | a C value as a `js_value` |
| `js_array(n, values…)`, `js_object("key", value, "key", value…, NULL)` | a new array and object |
| `js_function(function)` | a C function as a JavaScript function |

Drawing on a canvas that the application put into the global variable
`canvas` (as [examples/canvas](../../examples/canvas) does):

```c
js_value ctx = js_call(js_get(js_global(), "canvas"), "getContext", "2d");
for (int i = 0; i < 10; i++) {
    char color[32];
    snprintf(color, sizeof color, "hsl(%d, 70%%, 50%%)", i * 36);
    js_set(ctx, "fillStyle", color);
    js_call(ctx, "fillRect", i * 30, 20, 25, 100);
}
```

 - The arguments of `js_call`, `js_set`, `js_array`, `js_object` go to
   JavaScript by their C type: numbers as numbers, `char *` and `char`
   arrays as strings, `_Bool` as `true`/`false`, `js_value` as its value, a
   function as a JavaScript function.
 - A C function can be given to JavaScript:
   `js_set(js_global(), "square", square);` - JavaScript calls
   `square(7)`, the arguments are converted to the parameter types and the
   result back (`char *` as a string).
 - A JavaScript exception is an error with its text (`RangeError: …`) at
   the line of the call.
 - **Host modules**: a module `app` is the header `app.h` (a global module's
   header is included already). Every function is `app_<name>` in
   snake_case (`app_is_even`) and also `<name>` (`is_even`) unless a
   standard header declares that name (`log` is in `math.h`, so only
   `app_log`). Types: `int` is `long long`, `number` `double`, `string`
   `const char *` (a result is `char *`), `bool` `_Bool`, `value` and
   `array` `js_value`. A `value` parameter also takes a string (`char *`)
   or a C function, as `js_call` does; a number needs `js_from_int` or
   `js_from_double`. A missing optional argument is `NULL` or 0.

## Modules

`#include "mathx.h"` includes the text of the host file `mathx.h` (or
`mathx.c`): its declarations and functions are visible to the unit and, as
everything in a unit, to the other C units. A host file may include other
host files. A changed file is included again at the next run.
`#include <…>` with a name that is not a built-in header looks for a host
file too.

## Errors

 - Translation errors are like those of clang, with the line:
   `use of undeclared identifier 'x'`, `expected ';' after expression`,
   `incompatible integer to pointer conversion initializing 'int *' with
   an expression of type 'int'`, `call to undeclared function 'f'`,
   `redefinition of 'x'`.
 - Run-time errors come with the line where they happened:
   `Segmentation fault (null pointer dereference)`,
   `Segmentation fault (invalid address 0x…)`,
   `Segmentation fault (stack overflow)`,
   `Floating point exception (integer division by zero)`,
   `free(): double free detected`, `free(): invalid pointer`,
   ``main: Assertion `x > 0' failed.``, `Aborted`, `exit status 3`
   (`exit(3)`).
 - A call of a function that has only a prototype is
   `undefined reference to 'f'` at the call.

## What is missing

 - `goto`, `_Generic`, `_Complex`, threads (`pthread`, `threads.h`),
   `setjmp`/`longjmp`, signals, `wchar.h` and locales, inline assembly;
   `_Atomic` and `volatile` change nothing.
 - Writing files, directories, processes (`system` returns -1), network,
   environment variables (`getenv` returns `NULL`).
 - A pointer keeps its address in 32 bits (memory is up to 512 MB);
   `(long)p` gives that address.
 - Undefined behavior is not always that of gcc: reading an uninitialized
   variable gives 0 or an old value, going past the end of an array inside
   the program memory is not caught - only going outside the memory is.
 - If a function that other units already call is changed so that it
   starts to wait (`sleep`), run those units again, otherwise it waits
   blocking the thread.
 - Memory access through a pointer is slower than plain JavaScript (every
   address is checked): a sieve of Eratosthenes up to a million, a sort of
   100 000 numbers and a 64×64 matrix product together take about half a
   second.

Shared rules: [languages](README.md#shared-rules). Internals:
[C in the translator](../internals/c.md).
