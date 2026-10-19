-- Tables: a shopping list, sorted by price, with a total.
local basket = {
  { name = "bread", price = 1.20, count = 2 },
  { name = "milk", price = 0.95, count = 3 },
  { name = "cheese", price = 4.50, count = 1 },
  { name = "apples", price = 0.40, count = 6 },
}

table.sort(basket, function(a, b) return a.price * a.count > b.price * b.count end)

local total = 0
for i, item in ipairs(basket) do
  local cost = item.price * item.count
  total = total + cost
  print(string.format("%d. %-8s %d x %5.2f = %6.2f", i, item.name, item.count, item.price, cost))
end
print(string.rep("-", 34))
print(string.format("%-23s %10.2f", "Total", total))
