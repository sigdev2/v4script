# C++

C++17 translated into JavaScript by v4script, over the same linear memory
as [C](c.md): objects, pointers and references are bytes and addresses, a
class has the layout that g++ gives it, `sizeof(int)` is 4 and a pointer 8.
The standard library (strings, streams, containers, algorithms, smart
pointers, `<random>`, `<chrono>`…) is written in C++ and translated with
the program; it behaves as libstdc++ does: the same order of
`unordered_map`, the same numbers of `std::mt19937` and the distributions,
the same growth of `vector`, the same order of equal elements after
`std::sort`, the same messages of exceptions. Memory errors stop the
program with `Segmentation fault` and the line, an uncaught exception with
`terminate called after throwing an instance of '…'`.

```cpp
#include <algorithm>
#include <iostream>
#include <map>
#include <string>

struct Item {
    std::string name;
    double price;
};

std::map<std::string, int> stock;
std::vector<Item> items;
std::string name;
double price;
while (std::cin >> name >> price) {
    items.push_back({ name, price });
    ++stock[name];
}
std::sort(items.begin(), items.end(), [](const Item& a, const Item& b) { return a.price > b.price; });
std::cout << "Most expensive: " << items.front().name << "\n";
std::cout << greet(items.front().name.c_str()) << "\n";    // the host module "app"
stock.size();                                              // the value of the run
```

## A unit is a source file

 - **Headers are included already.** Every unit starts as if it included
   all headers of [the library](#the-standard-library), the C headers of
   [C](c.md#the-standard-library), `js.h` and the headers of global host
   modules: `std::cout`, `std::vector` and `printf` need no `#include`. A
   written `#include <vector>` changes nothing, so the code builds with g++
   too. `using namespace std;` is not implied.
 - Besides declarations a unit may have **statements**: they run in order,
   as the body of `main`. If the unit defines `int main()` (or
   `int main(int argc, char** argv)`, `argv[0]` is `"main"`), it runs after
   them. `main` returning non-zero is the error `exit status N`.
 - **Value.** If the unit has no `main` and its last statement is an
   expression, the run returns its value as C does (numbers, `bool` as
   `true`/`false`, `const char*` as a string, a class as an object of its
   fields, an array as an array), and also `std::string` as a string and
   `std::vector` as an array. Assignments, `++`, stream output and calls of
   functions that return `void` give no value.
 - **Shared declarations.** Namespaces, functions, classes, templates,
   global variables and `#define` macros of one unit are visible in the
   other C++ units. Running a unit again declares them again: a function,
   a class or a template replaces the old one, a global variable of the
   same name and size stays at the same address and gets its initial value
   again.
 - A unit with a translation error does not change the shared
   declarations.

## What is supported

 - **The language of C** with C++ rules (see [C](c.md#what-is-supported)):
   integer and floating types as on x86-64, pointers and arrays, `struct`,
   `union`, bit fields, the preprocessor.
 - **Classes**: members and static members, access control, constructors
   with initializer lists, delegating and inherited constructors,
   destructors, copy and move constructors and assignments (implicit ones
   as the standard defines them, `= default`, `= delete`), conversion
   operators and `explicit`, `friend`, nested classes, `mutable`,
   aggregates and brace initialization (with designated initializers
   `{ .x = 1 }`, as g++ accepts them), `this`.
 - **Inheritance**: single and multiple (non-virtual) inheritance,
   virtual functions, `override` and `final`, abstract classes, virtual
   destructors, `dynamic_cast` (also across bases and to `void*`),
   `typeid` and `type_info::name()` (names mangled as g++ does: `6Square`,
   `St6vectorIiSaIiEE`).
 - **Overloading** of functions and of all operators, user-defined
   literals, argument-dependent lookup, default arguments, overload
   resolution with the ranking of the standard.
 - **References**: lvalue and rvalue references, `std::move` and
   `std::forward`, temporaries bound to references, structured bindings
   (`auto [key, value] = …`, also `auto&`).
 - **Templates**: function, class, alias and variable templates, partial
   and explicit specialization, default and non-type arguments, variadic
   templates, fold expressions, `sizeof...`, SFINAE (`enable_if`,
   `decltype` in signatures), `if constexpr`, `auto` and `decltype(auto)`
   return types, the type traits of `<type_traits>`.
 - **Class template argument deduction**: `std::pair p(1, 2.5)`,
   `std::vector v{1, 2, 3}`, `std::map m(other.begin(), other.end())`,
   `auto t = std::tuple(1, 'c')` - from the deduction guides of the library
   and of the program (`template <class T> Box(T) -> Box<T>;`), from the
   constructors of a template, and from a copy (`std::vector w{v}` is a
   copy of `v`).
 - **constexpr**: constexpr functions are evaluated where a constant is
   needed (`static_assert`, array bounds, template arguments, `case`) when
   they work on numbers: locals, loops, branches, recursion; elsewhere they
   run as ordinary functions.
 - **Lambdas**: captures by value and by reference, `[=]`, `[&]`,
   `[this]`, init captures, `mutable`, generic lambdas (`auto` parameters),
   lambdas in `std::function`, conversion to function pointers.
 - **Exceptions**: `throw` of any type, `catch` by type and base class,
   `catch (...)`, rethrow, unwinding with destructors, `noexcept` and the
   operator `noexcept(…)`, the standard exception classes with the
   messages of libstdc++ (`vector::_M_range_check: __n (which is 5) >=
   this->size() (which is 3)`).
 - **Copy elision** as g++ does it: returned temporaries, and a local
   object that every `return` of the function returns (when it is declared
   in the outermost block), are built in place - constructor and
   destructor traces print what g++ prints.
 - **Namespaces**: nested, inline and anonymous namespaces, `using`
   declarations and directives, namespace aliases.
 - **Waiting**: `std::this_thread::sleep_for`, `sleep`, `usleep`; the run
   ends while the program waits and goes on in timers of the engine (see
   [programs that wait](README.md#shared-rules)).

## The standard library

| Header | What is there |
| --- | --- |
| `<iostream>`, `<sstream>`, `<fstream>`, `<iomanip>` | `cout`, `cerr`, `clog`, `cin`, `getline`, `istringstream`, `ostringstream`, `stringstream`, `ifstream` (host files, read only), the manipulators (`setw`, `setfill`, `setprecision`, `fixed`, `scientific`, `hex`, `boolalpha`, `left`, `quoted`…); numbers are printed as libstdc++ prints them |
| `<string>`, `<string_view>` | `std::string` with the short-string buffer of libstdc++ (`sizeof` is 32), `string_view`, `to_string`, `stoi`, `stol`, `stoull`, `stod` and the others, `std::hash` (MurmurHash as libstdc++) |
| `<vector>`, `<array>`, `<deque>`, `<list>`, `<forward_list>`, `<stack>`, `<queue>` | the sequence containers and adapters, `priority_queue` |
| `<map>`, `<set>`, `<unordered_map>`, `<unordered_set>` | red-black trees and hash tables with the buckets and the iteration order of libstdc++, `multimap`, `multiset`, hints |
| `<algorithm>`, `<numeric>`, `<iterator>`, `<functional>` | sorting (introsort, `stable_sort`, heaps, `nth_element`, `partial_sort`), searching, set operations, permutations, `accumulate`, `iota`, `gcd`, `lcm`; iterator adapters, `back_inserter`, `ostream_iterator`, `istream_iterator`; function objects, `std::function`, `std::invoke` |
| `<memory>` | `unique_ptr` (with deleters, arrays), `shared_ptr`, `weak_ptr`, `make_unique`, `make_shared`, `enable_shared_from_this` |
| `<utility>`, `<tuple>`, `<optional>`, `<bitset>` | `pair`, `tuple`, `tie`, `apply`, `tuple_cat`, `optional`, `bitset` |
| `<random>` | `mt19937`, `mt19937_64`, `minstd_rand`, `minstd_rand0`, `default_random_engine`, `random_device`, `seed_seq`, `generate_canonical`; the uniform (integer and real), normal, Bernoulli, geometric, exponential, Poisson and discrete distributions, `shuffle` - the numbers of libstdc++ (Poisson with a mean below 12) |
| `<chrono>`, `<ratio>`, `<thread>` | durations, `steady_clock`, `system_clock`, `high_resolution_clock`, `duration_cast`, `std::ratio`; `this_thread::sleep_for` |
| `<limits>`, `<type_traits>`, `<exception>`, `<stdexcept>`, `<new>`, `<typeinfo>`, `<initializer_list>`, `<cmath>`, `<cstdio>`, `<cstdlib>`, `<cstring>`, `<cctype>`, `<ctime>`, `<cstdint>`, `<cassert>` and the other C headers | `numeric_limits`, type traits, the exception classes, `std::bad_alloc`, `type_info`; the C library in `std::` too |

`#include` of a header that is not in the table (`<regex>`, `<variant>`,
`<any>`…) is the error `'regex' file not found`.

 - **Output**: `std::cout` and `printf` share `stdout` of C, line-buffered
   ([C](c.md#the-standard-library)); `std::endl`, `std::flush` and
   `flush()` send an unfinished line. `std::cerr` is unbuffered and tied to
   `std::cout`, as with g++: after `std::cout << "a"; std::cerr << "b\n";`
   the host shows `ab`. `std::clog` is not tied (as in libstdc++).
 - **Input**: `std::cin` is standard input of the host: `>>` waits for the
   next lines, `getline` reads what is left, `std::cin.eof()` at the end of
   input. As `std::cin` is tied to `std::cout`, output is written out before
   the program waits for a line: `std::cout << "Name? ";` is visible.
 - **Files**: `std::ifstream in("data.txt")` reads the host file
   `data.txt`. A file cannot be opened for writing (`ofstream` fails).

## JavaScript and host modules

The C header `js.h` works in C++ as in C ([C](c.md#javascript-and-host-modules)):
`js_global()`, `js_get`, `js_set`, `js_call`, `js_invoke`, `js_array`,
`js_object`, `js_number`, `js_string` and the others. A `bool` argument
goes to JavaScript as `true`/`false`, `nullptr` as `null`, and
`js_function` takes a pointer to any function:

```cpp
static double half(double x) { return x / 2; }

js_value ctx = js_call(js_get(js_global(), "canvas"), "getContext", "2d");
js_set(ctx, "fillStyle", "red");
js_call(ctx, "fillRect", 0, 0, 50, 40);
js_set(js_global(), "half", js_function(half));     // JavaScript calls half(7)
```

Host modules are C headers too: a module `app` is `app.h` (a global
module's header is included already) with `app_<name>` and `<name>`
functions as in C; a `string` result is a C string, so
`std::string text = greet("Ann");` takes it. A `value` parameter is
`const void*`: it takes a `js_value`, a string (`describe("Ann")`,
`describe(text.c_str())`) or `nullptr`; a number needs `js_from_int` or
`js_from_double`.

## Modules

`#include "shapes.hpp"` includes the text of the host file `shapes.hpp`:
its declarations, classes and templates are visible to the unit and, as
everything in a unit, to the other C++ units. A host file may include
other host files. A changed file is included again at the next run.

## Errors

 - Translation errors are like those of g++, with the line:
   `'x' was not declared in this scope`, `expected ';' before 'return'`,
   `expected ';' after struct definition`,
   `no matching function for call to 'f(Box&)'`,
   `cannot convert 'A' to 'int*' in initialization`,
   `cannot declare variable 's' to be of abstract type 'Shape'`,
   `redefinition of 'int x'`.
 - Run-time errors come with the line where they happened:
   `terminate called after throwing an instance of 'std::out_of_range'`
   with the text of `what()`, `Segmentation fault (null pointer
   dereference)`, `Segmentation fault (stack overflow)`,
   `Floating point exception (integer division by zero)`,
   ``int half(int): Assertion `even % 2 == 0' failed.``,
   `pure virtual method called`, `free(): double free detected`,
   `exit status 3`.

## Differences from g++

 - The arguments of a call are evaluated from left to right (g++ often
   goes from right to left); the order is unspecified in C++, so programs
   should not depend on it. The order C++17 fixes is kept: the right
   operand of an assignment before the left one (`m[k] = m.size()`).
 - `sizeof` of some library classes differs: `std::function` is 8 bytes
   (32 in libstdc++), `unordered_map` and `unordered_set` 64 (56),
   `vector<bool>` 24 (40). `vector<bool>` keeps one byte per element and
   `v[i]` is a `bool&`, not a proxy.
 - Global objects and `static` locals are not destroyed at the end of a
   run: they stay for the next units (see
   [shared declarations](#a-unit-is-a-source-file)), so their destructors
   print nothing after `main` returns.
 - `long double` is `double`. Undefined behavior is not always that of
   g++ (see [C](c.md#what-is-missing)).
 - `poisson_distribution` with a mean of 12 or more gives other numbers
   than libstdc++ (of the same distribution).
 - The library has a few members of C++20 that g++ in C++17 mode rejects:
   `starts_with`, `ends_with` and `contains` of `std::string` and
   `std::string_view`.

## What is missing

 - Virtual inheritance, pointers to members (`&A::f`, `.*`, `->*`),
   template template parameters, `goto`, `alignas` on classes, `wchar_t`
   strings and `std::wstring`,
   coroutines and other C++20 features; deduction guides of
   `std::function` from a lambda.
 - Threads (`std::thread`, `mutex`, `atomic`, `future`), `<regex>`,
   `<variant>`, `<any>`, `<complex>`, `<valarray>`, `<filesystem>`,
   locales, `std::exception_ptr`, `std::bind` and `std::placeholders`
   (lambdas do the same), the binomial, gamma and other
   distributions of `<random>` not listed above; a function declared
   `noexcept` that throws does not terminate the program.
 - Writing files, processes, network (as in [C](c.md#what-is-missing)).
 - **Speed.** The first run of C++ in an engine translates the parts of
   the library that the program uses: in the Qt engine about 0.3 s for a
   program with `printf`, 0.7 s with `<iostream>`, 2-4 s for a program that
   uses several containers and algorithms (Node.js is about 6 times
   faster); later units reuse what is translated. Programs run at the
   speed of C over the linear memory, every access through a pointer or an
   iterator is checked: a sieve up to 200 000, sorting 50 000 numbers and
   counting them in a `map` and an `unordered_map`
   ([workload.cpp](../../tests/samples/cpp/workload.cpp)) take about 3 s.

Shared rules: [languages](README.md#shared-rules). Internals:
[C++ in the translator](../internals/cpp.md).
