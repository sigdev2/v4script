' Graphs of functions in own coordinates: WINDOW sets the corners of
' the screen, so x goes from -7 to 7 and y from -2 to 2.
SCREEN 12
WINDOW (-7, -2)-(7, 2)
' Axes and marks
LINE (-7, 0)-(7, 0), 8
LINE (0, -2)-(0, 2), 8
FOR x = -6 TO 6
    LINE (x, -.05)-(x, .05), 8
NEXT x
FOR y = -2 TO 2 STEP .5
    LINE (-.1, y)-(.1, y), 8
NEXT y
' sin x - yellow, cos x - light cyan, sin x / x - light red
PSET (-7, SIN(-7)), 14
FOR x = -7 TO 7 STEP .02
    LINE -(x, SIN(x)), 14
NEXT x
PSET (-7, COS(-7)), 11
FOR x = -7 TO 7 STEP .02
    LINE -(x, COS(x)), 11
NEXT x
PSET (-7, SIN(-7) / -7), 12
FOR x = -7 TO 7 STEP .02
    IF ABS(x) < .001 THEN y = 1 ELSE y = SIN(x) / x
    LINE -(x, y), 12
NEXT x
PRINT "Yellow: SIN(x), cyan: COS(x), red: SIN(x) / x"
