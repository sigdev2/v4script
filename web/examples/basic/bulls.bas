' Bulls and cows: the computer thinks of four different digits.
' A bull is a right digit in the right place, a cow - a right digit in
' another place. An empty line gives up.
RANDOMIZE TIMER
secret$ = ""
DO WHILE LEN(secret$) < 4
    d$ = CHR$(48 + INT(RND * 10))
    IF INSTR(secret$, d$) = 0 THEN secret$ = secret$ + d$
LOOP
PRINT "I have thought of four different digits. Guess them!"
tries = 0
DO
    LINE INPUT "Your guess: "; guess$
    IF guess$ = "" THEN
        PRINT "It was "; secret$
        END
    END IF
    IF LEN(guess$) <> 4 THEN
        PRINT "Four digits, please."
    ELSE
        tries = tries + 1
        bulls = 0: cows = 0
        FOR i = 1 TO 4
            d$ = MID$(guess$, i, 1)
            IF MID$(secret$, i, 1) = d$ THEN
                bulls = bulls + 1
            ELSEIF INSTR(secret$, d$) > 0 THEN
                cows = cows + 1
            END IF
        NEXT i
        PRINT "Bulls:"; bulls; "  Cows:"; cows
    END IF
LOOP UNTIL bulls = 4
PRINT "You found it in"; tries; "tries!"
