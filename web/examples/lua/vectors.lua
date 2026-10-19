-- Metatables: a vector type with operators and printing.
local Vector = {}
Vector.__index = Vector

function Vector.new(x, y)
  return setmetatable({ x = x, y = y }, Vector)
end

function Vector.__add(a, b) return Vector.new(a.x + b.x, a.y + b.y) end
function Vector.__sub(a, b) return Vector.new(a.x - b.x, a.y - b.y) end
function Vector.__mul(a, k) return Vector.new(a.x * k, a.y * k) end
function Vector.__eq(a, b) return a.x == b.x and a.y == b.y end
function Vector.__tostring(v) return "(" .. v.x .. ", " .. v.y .. ")" end
function Vector:length() return math.sqrt(self.x ^ 2 + self.y ^ 2) end

local a, b = Vector.new(3, 4), Vector.new(1, 2)
print("a =", a, "b =", b)
print("a + b =", a + b)
print("a - b =", a - b)
print("a * 2 =", a * 2)
print("|a| =", a:length())
print("a == (3, 4):", a == Vector.new(3, 4))
