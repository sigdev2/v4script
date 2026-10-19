// js.h: JavaScript values from C++ - globals, calls, objects, arrays and
// C++ functions given to JavaScript.
#include <cstdlib>
#include <iostream>
#include <js.h>
#include <string>

static int square(int x) { return x * x; }

static double half(double x) { return x / 2; }

std::string text(js_value value)
{
    char* chars = js_string(value);
    std::string result(chars);
    free(chars);
    return result;
}

int main()
{
    js_value global = js_global();
    js_value math = js_get(global, "Math");
    std::cout << js_number(js_call(math, "max", 3, 9.5, 4)) << " " << js_int(js_call(global, "parseInt", "ff", 16))
              << "\n";
    js_value point = js_object("x", 1, "y", 2.5, "name", "точка", "ok", true, nullptr);
    std::cout << text(js_call(js_get(global, "JSON"), "stringify", point)) << "\n";
    js_value list = js_array(3, 10, 20, 30);
    js_call(list, "push", 40);
    std::cout << js_length(list) << " " << js_int(js_index(list, 3)) << "\n";
    js_set(global, "cppSquare", square);
    std::cout << js_int(js_call(global, "cppSquare", 12)) << "\n";
    js_value nothing = js_get(global, "nothing");
    std::cout << js_type(nothing) << " " << js_is_null(nothing) << " " << (nothing == nullptr) << "\n";
    js_value fn = js_function(half);
    std::cout << js_number(js_invoke(fn, 7)) << " " << text(js_from_string("слово")) << "\n";
    return 0;
}

// Output:
// 9.5 255
// {"x":1,"y":2.5,"name":"точка","ok":true}
// 4 40
// 144
// null 1 1
// 3.5 слово
