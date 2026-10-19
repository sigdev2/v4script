' Palindromes: a phrase that reads the same backwards.
' An empty line ends the program.
DO
    LINE INPUT "A phrase: "; phrase$
    IF phrase$ = "" THEN EXIT DO
    letters$ = ""
    reversed$ = ""
    FOR i = 1 TO LEN(phrase$)
        c$ = UCASE$(MID$(phrase$, i, 1))
        IF (c$ >= "A" AND c$ <= "Z") OR (c$ >= "0" AND c$ <= "9") THEN
            letters$ = letters$ + c$
            reversed$ = c$ + reversed$
        END IF
    NEXT i
    PRINT "Backwards: "; reversed$
    IF letters$ <> "" AND letters$ = reversed$ THEN
        PRINT "It is a palindrome!"
    ELSE
        PRINT "Not a palindrome. Try: A man, a plan, a canal: Panama"
    END IF
LOOP
PRINT "Bye."
