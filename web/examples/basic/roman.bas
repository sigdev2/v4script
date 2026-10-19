' Roman numerals: the values and the letters come from DATA.
' 0 ends the program.
DIM value(13), letter$(13)
FOR i = 1 TO 13
    READ value(i), letter$(i)
NEXT i
DATA 1000,M, 900,CM, 500,D, 400,CD, 100,C, 90,XC, 50,L
DATA 40,XL, 10,X, 9,IX, 5,V, 4,IV, 1,I

DO
    INPUT "A number from 1 to 3999 (0 - end)"; n
    IF n <= 0 THEN EXIT DO
    IF n > 3999 THEN
        PRINT "The Romans had no numeral for it."
    ELSE
        rest = INT(n)
        roman$ = ""
        FOR i = 1 TO 13
            WHILE rest >= value(i)
                roman$ = roman$ + letter$(i)
                rest = rest - value(i)
            WEND
        NEXT i
        PRINT INT(n); "= "; roman$
    END IF
LOOP
