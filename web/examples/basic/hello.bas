' Hello! The computer asks your name and your year of birth.
INPUT "What is your name"; who$
IF who$ = "" THEN who$ = "stranger"
PRINT "Hello, "; who$; "! Nice to meet you."
INPUT "In what year were you born"; born
IF born > 0 THEN
    thisYear = VAL(RIGHT$(DATE$, 4))
    PRINT "This year you turn"; thisYear - born; "- or have already."
END IF
PRINT "Press Run again to start over."
