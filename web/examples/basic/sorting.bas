' Sorting by the bubble method: neighbours change places until the
' list is in order. The names come from DATA.
CONST COUNT = 8
DIM names$(1 TO COUNT)
FOR i = 1 TO COUNT
    READ names$(i)
NEXT i
DATA Olga, Boris, Victor, Anna, Irina, Gleb, Dmitry, Elena

PRINT "Before:";
FOR i = 1 TO COUNT: PRINT " "; names$(i);: NEXT i
PRINT
pass = 0
DO
    swapped = 0
    pass = pass + 1
    FOR i = 1 TO COUNT - pass
        IF names$(i) > names$(i + 1) THEN
            SWAP names$(i), names$(i + 1)
            swapped = -1
        END IF
    NEXT i
    PRINT "Pass"; pass; ":";
    FOR i = 1 TO COUNT: PRINT " "; names$(i);: NEXT i
    PRINT
LOOP WHILE swapped
PRINT "Sorted in"; pass; "passes."
