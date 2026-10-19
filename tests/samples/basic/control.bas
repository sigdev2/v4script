' Branches and loops: block IF, FOR with a step, NEXT j, i, DO and WHILE,
' EXIT, GOTO inside a loop, SELECT CASE; SUB and FUNCTION, parameters by
' reference and (x) by value, recursion, STATIC, "name:" - a call of a SUB
' without parameters.
DECLARE SUB Swap2 (a, b)
DECLARE FUNCTION Fact# (n%)
FOR i = 1 TO 3
    IF i = 1 THEN
        PRINT "one"
    ELSEIF i = 2 THEN
        PRINT "two"
    ELSE
        PRINT "other"; i
    END IF
NEXT i
FOR i = 10 TO 1 STEP -3: PRINT i;: NEXT: PRINT
FOR x = 0 TO 1 STEP .25: PRINT x;: NEXT x: PRINT
FOR i = 5 TO 1: PRINT "never": NEXT: PRINT "after"; i
FOR i = 1 TO 3: FOR j = 1 TO 2: PRINT i * 10 + j;: NEXT j, i: PRINT
n = 0
DO
    n = n + 1
    IF n = 3 THEN EXIT DO
LOOP
PRINT "n"; n
DO WHILE n < 6: n = n + 1: LOOP: PRINT n
DO UNTIL n = 0: n = n - 2: LOOP: PRINT n
DO: n = n + 5: LOOP UNTIL n > 12: PRINT n
WHILE n > 0: n = n - 4: WEND: PRINT n
FOR k = 1 TO 10
    IF k MOD 2 = 0 THEN GOTO skip
    IF k > 7 THEN EXIT FOR
    PRINT k;
skip:
NEXT k
PRINT
FOR v = 1 TO 7
    SELECT CASE v
        CASE 1
            PRINT "one";
        CASE 2, 3
            PRINT "two-three";
        CASE 4 TO 5
            PRINT "four-five";
        CASE IS >= 7
            PRINT "seven+";
        CASE ELSE
            PRINT "else";
    END SELECT
    PRINT ",";
NEXT
PRINT
SELECT CASE "dog"
    CASE "cat": PRINT "cat"
    CASE "cow" TO "elk": PRINT "between"
END SELECT
p = 1: q = 2: Swap2 p, q: PRINT p; q
CALL Swap2(p, (q)): PRINT p; q
PRINT Fact#(10); Fact#(20)
PRINT Twice(21)
Counter: Counter: Counter
PRINT Fib(20)
SUB Swap2 (a, b)
    t = a: a = b: b = t
END SUB
FUNCTION Fact# (n%)
    IF n% <= 1 THEN Fact# = 1 ELSE Fact# = n% * Fact#(n% - 1)
END FUNCTION
FUNCTION Twice (x)
    Twice = x * 2
END FUNCTION
SUB Counter STATIC
    calls = calls + 1
    PRINT "calls"; calls
END SUB
FUNCTION Fib& (n)
    IF n < 2 THEN Fib& = n: EXIT FUNCTION
    Fib& = Fib&(n - 1) + Fib&(n - 2)
END FUNCTION

' Output:
' one
' two
' other 3
'  10  7  4  1
'  0  .25  .5  .75  1
' after 5
'  11  12  21  22  31  32
' n 3
'  6
'  0
'  15
' -1
'  1  3  5  7
' one,two-three,two-three,four-five,four-five,else,seven+,
' between
'  2  1
'  1  1
'  3628800  2.43290200817664D+18
'  42
' calls 1
' calls 2
' calls 3
'  6765
