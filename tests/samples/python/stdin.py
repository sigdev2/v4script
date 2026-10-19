# Standard input of the host: input() and the end of input.
name = input("Name? ")
print("Hi", name)
a, b = map(int, input().split())
print(a + b)
try:
    input()
except EOFError as error:
    print("EOF:", error)

# Input:
# Bob
# 3 4
# Output:
# Name? Hi Bob
# 7
# EOF: EOF when reading a line
