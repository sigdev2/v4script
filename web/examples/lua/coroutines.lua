-- Coroutines: a generator of permutations, consumed one by one.
local function permutations(items)
  return coroutine.wrap(function()
    local function permute(n)
      if n <= 1 then
        coroutine.yield(table.concat(items, " "))
        return
      end
      for i = 1, n do
        items[i], items[n] = items[n], items[i]
        permute(n - 1)
        items[i], items[n] = items[n], items[i]
      end
    end
    permute(#items)
  end)
end

local count = 0
for line in permutations({ "A", "B", "C", "D" }) do
  count = count + 1
  io.write(line, count % 6 == 0 and "\n" or "  |  ")
end
print(count .. " permutations")
