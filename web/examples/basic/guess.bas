' Guess the number: the computer thinks of a number from 1 to 100,
' you guess it. 0 gives up.
RANDOMIZE TIMER
secret = INT(RND * 100) + 1
tries = 0
PRINT "I have thought of a number from 1 to 100. Guess it! (0 - give up)"
DO
    INPUT "Your guess"; guess
    IF guess = 0 THEN
        PRINT "The number was"; secret; "- better luck next time."
        END
    END IF
    tries = tries + 1
    IF guess < secret THEN
        PRINT "More."
    ELSEIF guess > secret THEN
        PRINT "Less."
    END IF
LOOP UNTIL guess = secret
PRINT "Right! You needed"; tries; "tries."
IF tries <= 7 THEN
    PRINT "Excellent: halving the range finds any number in 7 tries."
ELSE
    PRINT "Hint: always guess the middle of what is left."
END IF
