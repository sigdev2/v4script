' INTEGER up to 32767: the FOR step after the last iteration overflows
' (as in QBasic) on the line of NEXT.
FOR i% = 32765 TO 32767
    PRINT i%;
NEXT
PRINT "never"

' Output:
'  32765  32766  32767
' Error: Overflow
' Line: 5
