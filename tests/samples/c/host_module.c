// The host module "app" of the tests: header app.h with app_<name> for
// every function and <name> where the C library does not have it (log is
// in math.h, so only app_log).
#include <stdio.h>
#include <app.h>

int main(void)
{
    printf("%s %g %d %lld %lld\n", greet("Ann"), app_add(2, 3.5), is_even(4), counter(), app_counter());
    js_value p = point(1, 2);
    printf("%g %g %ld\n", js_number(js_get(p, "x")), js_number(js_get(p, "y")), js_length(range(3)));
    app_log("one");
    printf("%s %s %s\n", js_string(js_index(logged(), 0)), describe(NULL), describe(js_array(2, 1, 2)));
    // A value parameter takes a string too.
    printf("%s\n", describe("text"));
    return 0;
}

// Output:
// Hello, Ann! 5.5 1 1 2
// 1 2 3
// one nothing [1,2]
// "text"
