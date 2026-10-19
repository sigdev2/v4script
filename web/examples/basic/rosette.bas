' A rosette with DRAW: a square turned 36 times by 10 degrees.
' DRAW is a little language: U, D, L, R move, TA turns, C sets the color.
SCREEN 12
FOR i = 0 TO 35
    DRAW "BM320,240 C" + STR$(9 + i MOD 6) + " TA" + STR$(i * 10) + " U100 R100 D100 L100"
NEXT i
DRAW "BM320,240 TA0 C15"
CIRCLE (320, 240), 145, 15
PRINT "36 squares, each turned by 10 degrees."
