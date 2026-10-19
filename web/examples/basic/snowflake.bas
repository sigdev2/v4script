' The Koch snowflake: every segment becomes four, with a spike in the
' middle - a recursive SUB draws it.
DECLARE SUB Koch (x1!, y1!, x2!, y2!, depth%)
SCREEN 12
CONST PI = 3.141593
cx = 320: cy = 250: r = 200
FOR k = 0 TO 2
    a1 = -PI / 2 + k * 2 * PI / 3
    a2 = a1 + 2 * PI / 3
    Koch cx + r * COS(a1), cy + r * SIN(a1), cx + r * COS(a2), cy + r * SIN(a2), 4
NEXT k
PAINT (cx, cy), 9, 15
PRINT "The Koch snowflake, depth 4: 768 segments."

SUB Koch (x1!, y1!, x2!, y2!, depth%)
    IF depth% = 0 THEN
        LINE (x1!, y1!)-(x2!, y2!), 15
        EXIT SUB
    END IF
    dx! = (x2! - x1!) / 3: dy! = (y2! - y1!) / 3
    ax! = x1! + dx!: ay! = y1! + dy!
    bx! = x1! + 2 * dx!: by! = y1! + 2 * dy!
    ' The spike: the middle third turned by 60 degrees outwards.
    px! = ax! + dx! * .5 + dy! * .866025
    py! = ay! + dy! * .5 - dx! * .866025
    Koch x1!, y1!, ax!, ay!, depth% - 1
    Koch ax!, ay!, px!, py!, depth% - 1
    Koch px!, py!, bx!, by!, depth% - 1
    Koch bx!, by!, x2!, y2!, depth% - 1
END SUB
