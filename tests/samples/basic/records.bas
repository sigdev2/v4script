' TYPE records (nested ones, arrays of records, a copy on assignment), DIM
' SHARED, an array as a parameter, REDIM PRESERVE, ERASE, DEF FN, SWAP,
' SHARED, CONST in a FUNCTION.
TYPE Point
    x AS INTEGER
    y AS INTEGER
END TYPE
TYPE Person
    pname AS STRING * 8
    age AS INTEGER
    home AS Point
END TYPE
DIM SHARED total AS LONG
DIM p AS Point, q AS Point
p.x = 3: p.y = 4
q = p: q.x = 10
PRINT p.x; p.y; q.x; q.y
DIM people(1 TO 3) AS Person
people(1).pname = "Ann": people(1).age = 30: people(1).home.x = 5
people(2) = people(1): people(2).age = 31
PRINT "["; people(2).pname; "]"; people(2).age; people(2).home.x; LEN(people(1))
Move p, 2
PRINT p.x; p.y
DIM a(5) AS INTEGER
FOR i = 0 TO 5: a(i) = i * i: NEXT
PRINT SumArray(a()); total
REDIM b(2): b(0) = 1: b(1) = 2: b(2) = 3
REDIM PRESERVE b(4): b(4) = 5
FOR i = 0 TO 4: PRINT b(i);: NEXT: PRINT
ERASE a: PRINT a(3)
DEF FNsq (x) = x * x
DEF FNhyp (a, b)
    FNhyp = SQR(FNsq(a) + FNsq(b))
END DEF
PRINT FNsq(5); FNhyp(3, 4)
m = 1: n = 2: SWAP m, n: PRINT m; n
s1$ = "first": s2$ = "second": SWAP s1$, s2$: PRINT s1$; " "; s2$
SWAP p, q: PRINT p.x; q.x
Bump: Bump: PRINT total
PRINT Area(2)
SUB Move (pt AS Point, d)
    pt.x = pt.x + d: pt.y = pt.y * d
END SUB
FUNCTION SumArray& (arr() AS INTEGER)
    s& = 0
    FOR i = LBOUND(arr) TO UBOUND(arr): s& = s& + arr(i): NEXT
    total = s&
    SumArray& = s&
END FUNCTION
SUB Bump
    SHARED total AS LONG
    total = total + 100
END SUB
FUNCTION Area (r)
    CONST PI = 3.14159
    Area = PI * r ^ 2
END FUNCTION

' Output:
'  3  4  10  4
' [Ann     ] 31  5  14
'  5  8
'  55  55
'  1  2  3  0  5
'  0
'  25  5
'  2  1
' second first
'  10  5
'  255
'  12.56636
