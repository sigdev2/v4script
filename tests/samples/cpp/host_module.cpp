// The host module "app" of the tests: header app.h with app_<name> for
// every function and <name> where the library does not have it (log is in
// math.h, so only app_log). Strings are C strings; std::string takes them.
#include <app.h>
#include <iostream>
#include <string>

int main()
{
    std::string greeting = greet("Ann");
    std::cout << greeting << " " << greeting.size() << " " << app_add(2, 3.5) << " " << is_even(4) << "\n";
    long long first = counter();
    long long second = app_counter();
    std::cout << first << " " << second << "\n";
    js_value p = point(1, 2);
    std::cout << js_number(js_get(p, "x")) << " " << js_number(js_get(p, "y")) << " " << js_length(range(3)) << "\n";
    app_log("one");
    app_log(std::string("two").c_str());
    std::cout << js_string(js_index(logged(), 1)) << " " << describe(nullptr) << " " << describe(js_array(2, 1, 2))
              << "\n";
    return 0;
}

// Output:
// Hello, Ann! 11 5.5 1
// 1 2
// 1 2 3
// two nothing [1,2]
