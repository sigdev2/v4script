-- Standard input of the host: io.read with formats and io.lines.
io.write("Name? ")
local name = io.read()
print("Hi " .. name)
local a, b = io.read("n", "n")
print(a + b, math.type(a))
print(io.read("L") == "\n")
for line in io.lines() do
  print("line: " .. line)
end
print(io.read())

-- Input:
-- Bob
-- 3 4.5
-- x
-- y
-- Output:
-- Name? Hi Bob
-- 7.5	integer
-- true
-- line: x
-- line: y
-- nil
