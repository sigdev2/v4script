# The host module "app" of the tests (tests/app-module.js): global
# functions with the names of JavaScript and the module object.
import app

print(greet("Ann"), app.add(2, 3.5), isEven(4), counter(), app.counter())
p = point(1, 2)
print(p.x, p.y, app.range(3))
# A global function never hides a built-in one: range stays Python's.
print(list(range(2)))
log("one")
print(logged(), describe(), describe([1, 2]))

# Output:
# Hello, Ann! 5.5 True 1 2
# 1 2 [0, 1, 2]
# [0, 1]
# ['one'] nothing [1,2]
