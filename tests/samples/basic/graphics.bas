' Graphics: SCREEN 13, PSET, LINE (B, BF, a style), CIRCLE, PAINT, DRAW,
' POINT; the picture is checked by counting the pixels of every color.
SCREEN 13
PSET (10, 10), 4
PSET STEP(5, 0), 4
LINE (0, 20)-(99, 20), 2
LINE (20, 30)-(40, 50), 3, B
LINE (50, 30)-(70, 50), 5, BF
LINE (0, 60)-(159, 60), 6, , &HF0F0
LINE -(159, 99), 7
CIRCLE (120, 40), 15, 9
PAINT (120, 40), 10, 9
DRAW "C11 BM200,10 R20 D20 L20 U20"
PRINT POINT(10, 10); POINT(15, 10); POINT(0, 0); POINT(-1, 5); POINT(30, 30); POINT(35, 35); POINT(60, 40)
DIM counts(255)
FOR y = 0 TO 199
    FOR x = 0 TO 319
        c = POINT(x, y)
        counts(c) = counts(c) + 1
    NEXT
NEXT
FOR c = 1 TO 15
    IF counts(c) > 0 THEN PRINT c; counts(c)
NEXT

' Output:
'  4  4  0 -1  3  0  5
'  2  100
'  3  80
'  4  2
'  5  441
'  6  80
'  7  40
'  9  76
'  10  539
'  11  80
