' READ after the last DATA value.
FOR i = 1 TO 4
    READ v
    PRINT v;
NEXT
DATA 10, 20, 30

' Output:
'  10  20  30
' Error: Out of DATA
' Line: 3
