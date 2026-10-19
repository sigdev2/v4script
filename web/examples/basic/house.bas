' A picture: a house, a tree and the sun. SCREEN 12 is 640 x 480
' with 16 colors.
SCREEN 12
LINE (0, 0)-(639, 339), 9, BF             ' sky
LINE (0, 340)-(639, 479), 2, BF           ' grass

' The sun with its rays
CIRCLE (540, 80), 40, 14
PAINT (540, 80), 14, 14
FOR a = 0 TO 359 STEP 30
    r = a * 3.14159 / 180
    LINE (540 + 50 * COS(r), 80 + 50 * SIN(r))-(540 + 70 * COS(r), 80 + 70 * SIN(r)), 14
NEXT a

' The house: walls, roof, door, windows, chimney
LINE (160, 220)-(400, 400), 6, BF
LINE (160, 220)-(400, 400), 0, B
LINE (140, 220)-(280, 120), 4
LINE -(420, 220), 4
LINE -(140, 220), 4
PAINT (280, 180), 4, 4
LINE (340, 130)-(370, 180), 8, BF
LINE (250, 300)-(310, 400), 8, BF
CIRCLE (300, 352), 4, 14
FOR x = 185 TO 335 STEP 150
    LINE (x, 250)-(x + 50, 290), 11, BF
    LINE (x, 250)-(x + 50, 290), 15, B
    LINE (x + 25, 250)-(x + 25, 290), 15
    LINE (x, 270)-(x + 50, 270), 15
NEXT x

' A tree
LINE (500, 300)-(520, 420), 6, BF
CIRCLE (510, 270), 55, 10
PAINT (510, 270), 10, 10
CIRCLE (490, 260), 6, 12
PAINT (490, 260), 12, 12
CIRCLE (530, 290), 6, 12
PAINT (530, 290), 12, 12
PRINT "A house in the countryside."
