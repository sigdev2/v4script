#include <js.h>
#include <stdio.h>
#include <stdlib.h>

static int square(int x)
{
    return x * x;
}

static double half(double x)
{
    return x / 2;
}

int main(void)
{
    js_value global = js_global();
    js_value math = js_get(global, "Math");
    printf("%g %lld\n", js_number(js_call(math, "max", 3, 9.5, 4)), js_int(js_call(global, "parseInt", "ff", 16)));
    js_value point = js_object("x", 1, "y", 2.5, "name", "точка", "ok", (_Bool)1, NULL);
    char *text = js_string(js_call(js_get(global, "JSON"), "stringify", point));
    printf("%s\n", text);
    free(text);
    js_value list = js_array(3, 10, 20, 30);
    js_call(list, "push", 40);
    printf("%ld %lld\n", js_length(list), js_int(js_index(list, 3)));
    js_set(global, "cSquare", square);
    printf("%lld\n", js_int(js_call(global, "cSquare", 12)));
    js_value nothing = js_get(global, "nothing");
    printf("%s %d %d %d\n", js_type(nothing), js_is_null(nothing), nothing == NULL, js_bool(js_from_bool(1)));
    js_value fn = js_function(half);
    printf("%g\n", js_number(js_invoke(fn, 7)));
    js_value word = js_from_string("слово");
    printf("%s %ld\n", js_type(word), js_length(word));
    return 0;
}

// Output:
// 9.5 255
// {"x":1,"y":2.5,"name":"точка","ok":true}
// 4 40
// 144
// null 1 1 1
// 3.5
// string 5
