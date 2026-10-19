' The night sky: stars twinkle for ten seconds. _LIMIT 20 runs the loop
' 20 times a second, and every frame is shown.
SCREEN 13
RANDOMIZE TIMER
CONST STARS = 150
DIM x(STARS), y(STARS)
FOR i = 1 TO STARS
    x(i) = INT(RND * 320): y(i) = INT(RND * 160)
NEXT i
CIRCLE (260, 40), 20, 14
PAINT (260, 40), 14, 14
CIRCLE (252, 36), 18, 0
PAINT (248, 36), 0, 0
LINE (0, 170)-(319, 199), 2, BF
FOR frame = 1 TO 200
    FOR i = 1 TO STARS
        IF POINT(x(i), y(i)) <> 14 THEN PSET (x(i), y(i)), 16 + INT(RND * 16)
    NEXT i
    _LIMIT 20
NEXT frame
