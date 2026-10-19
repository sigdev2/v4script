' Arithmetic quiz: five questions, a mark at the end.
RANDOMIZE TIMER
score = 0
FOR question = 1 TO 5
    a = INT(RND * 10) + 1
    b = INT(RND * 10) + 1
    SELECT CASE INT(RND * 3)
        CASE 0: op$ = "+": correct = a + b
        CASE 1: op$ = "-": correct = a + b: SWAP a, correct
        CASE ELSE: op$ = "*": correct = a * b
    END SELECT
    PRINT USING "Question #:  ## & ## = "; question; a; op$; b;
    INPUT ; "", answer
    IF answer = correct THEN
        PRINT "  right!"
        score = score + 1
    ELSE
        PRINT "  no, it is"; correct
    END IF
NEXT question
PRINT
PRINT "Right answers:"; score; "of 5"
SELECT CASE score
    CASE 5: PRINT "Excellent!"
    CASE 3, 4: PRINT "Good."
    CASE ELSE: PRINT "Practice a little more."
END SELECT
