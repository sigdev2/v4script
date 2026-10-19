' The multiplication table, aligned with PRINT USING.
PRINT "  * |";
FOR j = 1 TO 9
    PRINT USING "####"; j;
NEXT j
PRINT
PRINT "----+"; STRING$(36, "-")
FOR i = 1 TO 9
    PRINT USING " ## |"; i;
    FOR j = 1 TO 9
        PRINT USING "####"; i * j;
    NEXT j
    PRINT
NEXT i
