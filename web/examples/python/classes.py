# Classes: a fraction with arithmetic operators, comparison and printing.
from math import gcd


class Fraction:
    def __init__(self, top, bottom=1):
        if bottom == 0:
            raise ZeroDivisionError("a fraction with 0 below")
        common = gcd(top, bottom) * (1 if bottom > 0 else -1)
        self.top, self.bottom = top // common, bottom // common

    def __add__(self, other):
        return Fraction(self.top * other.bottom + other.top * self.bottom, self.bottom * other.bottom)

    def __mul__(self, other):
        return Fraction(self.top * other.top, self.bottom * other.bottom)

    def __eq__(self, other):
        return self.top == other.top and self.bottom == other.bottom

    def __lt__(self, other):
        return self.top * other.bottom < other.top * self.bottom

    def __repr__(self):
        return f"{self.top}/{self.bottom}" if self.bottom != 1 else str(self.top)


half, third = Fraction(1, 2), Fraction(1, 3)
print(half, "+", third, "=", half + third)
print(half, "*", third, "=", half * third)
harmonic = Fraction(0)
for n in range(1, 11):
    harmonic = harmonic + Fraction(1, n)
print("1 + 1/2 + ... + 1/10 =", harmonic)
print("Sorted:", sorted([Fraction(3, 4), half, Fraction(2, 3), third]))
try:
    Fraction(1, 0)
except ZeroDivisionError as error:
    print("Error:", error)
