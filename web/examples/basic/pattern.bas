' String art: straight lines from side to side make curves. SCREEN 13
' has 256 colors.
SCREEN 13
FOR i = 0 TO 99
    c = 32 + (i MOD 72)
    LINE (i * 3.2, 0)-(319, i * 2), c
    LINE (319, i * 2)-(319 - i * 3.2, 199), c
    LINE (319 - i * 3.2, 199)-(0, 199 - i * 2), c
    LINE (0, 199 - i * 2)-(i * 3.2, 0), c
NEXT i
FOR r = 10 TO 60 STEP 5
    CIRCLE (160, 100), r, 15 + r \ 5
NEXT r
