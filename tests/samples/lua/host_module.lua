-- The host module "app" of the tests: global functions and the table app.
print(greet("Ann"), app.add(2, 3.5), isEven(4), counter(), app.counter())
local p = point(1, 2)
print(p.x, p.y, #app.range(3))
log("one")
print(logged()[1], describe(), describe({1, 2}))

-- Output:
-- Hello, Ann!	5.5	true	1	2
-- 1	2	3
-- one	nothing	[1,2]
