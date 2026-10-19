' SLEEP and _DELAY: a real wait - the unit ends its run, the program goes
' on by a timer; a FUNCTION with a wait waits too.
FOR i = 1 TO 3
    PRINT "tick"; i
    _DELAY .02
NEXT
PRINT SlowDouble(21)
SLEEP 0
PRINT "done"
FUNCTION SlowDouble (n)
    _DELAY .01
    SlowDouble = n * 2
END FUNCTION

' Output:
' tick 1
' tick 2
' tick 3
'  42
' done
