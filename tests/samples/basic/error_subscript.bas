' An index out of bounds inside a SUB - the line in the SUB.
DIM SHARED table(1 TO 3)
FOR i = 1 TO 4
    Store i
NEXT
SUB Store (k)
    table(k) = k * k
    PRINT k;
END SUB

' Output:
'  1  2  3
' Error: Subscript out of range
' Line: 7
