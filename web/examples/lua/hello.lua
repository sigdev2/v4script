-- Hello: io.read, string functions and the value of the run.
io.write("What is your name? ")
local name = io.read() or ""
if name == "" then name = "stranger" end
print(("Hello, %s! Backwards your name is %s."):format(name, name:reverse()))
return #name, name:upper()
