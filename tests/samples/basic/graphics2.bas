' Graphics as in QBasic: arcs and the aspect of CIRCLE, LINE styles, DRAW
' with scale and rotation, PAINT up to a border, WINDOW; the frame is
' checked by a sum over POINT (the sums match QB64).
SCREEN 13
CIRCLE (60, 50), 30, 1, 0, 3.14159 / 2
CIRCLE (60, 50), 25, 2, -1, -2.5
CIRCLE (60, 50), 20, 3, 4, 1
CIRCLE (160, 50), 30, 4, , , 2
CIRCLE (160, 50), 30, 5, , , .3
CIRCLE (250, 50), 30, 6, , , -.5
LINE (10, 120)-(300, 120), 7, , &HAAAA
LINE (10, 125)-(300, 190), 8, B, &HFF00
LINE (300, 125)-(10, 190), 9
PSET (100, 150), 10
PSET STEP(10, 10), 11
DRAW "C12 S8 A1 R10 D10 TA45 R10 BM+5,+5 NL5 U5"
CIRCLE (200, 160), 20, 13
PAINT (200, 160), 14, 13
total& = 0
FOR y = 0 TO 199
    FOR x = 0 TO 319
        total& = (total& * 31 + POINT(x, y)) MOD 1000003
    NEXT
NEXT
PRINT total&
WINDOW (-10, -10)-(10, 10)
PSET (0, 0), 15
CIRCLE (5, 5), 2, 15
LINE (-10, -10)-(10, 10), 15
PRINT POINT(0, 0)
total& = 0
FOR y = 0 TO 199
    FOR x = 0 TO 319
        total& = (total& * 31 + POINT(x, y)) MOD 1000003
    NEXT
NEXT
PRINT total&

' Output:
'  450733
'  15
'  664857
