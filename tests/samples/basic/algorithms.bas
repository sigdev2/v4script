' Algorithms: sorting, a sieve, GCD, the towers of Hanoi, binary search,
' matrix multiplication, palindromes, conversion to binary.
DECLARE SUB Hanoi (n%, from$, to$, via$)
DECLARE FUNCTION Gcd& (a&, b&)
DEFINT A-Z
DIM a(1 TO 10)
FOR i = 1 TO 10: READ a(i): NEXT
DATA 34, 7, 23, 32, 5, 62, 32, 7, 1, 99
' Bubble sort
FOR i = 1 TO 9
    FOR j = 1 TO 10 - i
        IF a(j) > a(j + 1) THEN SWAP a(j), a(j + 1)
    NEXT
NEXT
FOR i = 1 TO 10: PRINT a(i);: NEXT: PRINT
' Binary search
target = 32: lo = 1: hi = 10: found = 0
DO WHILE lo <= hi
    mid = (lo + hi) \ 2
    IF a(mid) = target THEN found = mid: EXIT DO
    IF a(mid) < target THEN lo = mid + 1 ELSE hi = mid - 1
LOOP
PRINT "found at"; found
' The sieve of Eratosthenes up to 100
DIM sieve(100)
count = 0
FOR i = 2 TO 100
    IF sieve(i) = 0 THEN
        count = count + 1
        PRINT i;
        FOR j = i * i TO 100 STEP i: sieve(j) = 1: NEXT
    END IF
NEXT
PRINT: PRINT "primes:"; count
PRINT Gcd&(1071, 462); Gcd&(17, 5)
Hanoi 3, "A", "C", "B"
PRINT
' Matrices
DIM m1(2, 2), m2(2, 2), m3(2, 2)
FOR i = 1 TO 2: FOR j = 1 TO 2: m1(i, j) = i + j: m2(i, j) = i * j: NEXT j, i
FOR i = 1 TO 2
    FOR j = 1 TO 2
        FOR k = 1 TO 2: m3(i, j) = m3(i, j) + m1(i, k) * m2(k, j): NEXT
        PRINT m3(i, j);
    NEXT
    PRINT
NEXT
' Palindromes
FOR Each = 1 TO 3
    READ w$
    r$ = ""
    FOR i = LEN(w$) TO 1 STEP -1: r$ = r$ + MID$(w$, i, 1): NEXT
    IF UCASE$(r$) = UCASE$(w$) THEN PRINT w$; " - palindrome" ELSE PRINT w$; " - no"
NEXT
DATA "Racecar", "basic", "level"
' Binary notation
n& = 2026: b$ = ""
DO
    b$ = CHR$(48 + n& MOD 2) + b$
    n& = n& \ 2
LOOP WHILE n& > 0
PRINT b$
' Factorials in DOUBLE
f# = 1
FOR i = 1 TO 20: f# = f# * i: NEXT
PRINT f#
PRINT USING "factorial ## = ###,###,###"; 12; 479001600

SUB Hanoi (n%, from$, to$, via$)
    IF n% = 0 THEN EXIT SUB
    Hanoi n% - 1, from$, via$, to$
    PRINT from$; to$; " ";
    Hanoi n% - 1, via$, to$, from$
END SUB

FUNCTION Gcd& (a&, b&)
    IF b& = 0 THEN Gcd& = a& ELSE Gcd& = Gcd&(b&, a& MOD b&)
END FUNCTION

' Output:
'  1  5  7  7  23  32  32  34  62  99
' found at 6
'  2  3  5  7  11  13  17  19  23  29  31  37  41  43  47  53  59  61  67  71  73  79  83  89  97
' primes: 25
'  21  1
' AC AB CB AC BA BC AC
'  8  16
'  11  22
' Racecar - palindrome
' basic - no
' level - palindrome
' 11111101010
'  2.43290200817664D+18
' factorial 12 = 479,001,600
