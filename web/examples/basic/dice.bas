' Two dice, 3600 throws: how often each sum comes up. 7 is the most
' likely - it can be thrown in six ways.
RANDOMIZE TIMER
DIM times(2 TO 12)
FOR throw = 1 TO 3600
    sum = INT(RND * 6) + 1 + INT(RND * 6) + 1
    times(sum) = times(sum) + 1
NEXT throw
FOR sum = 2 TO 12
    ways = 6 - ABS(sum - 7)
    PRINT USING "##: #### of ### expected  "; sum; times(sum); ways * 100;
    PRINT STRING$(times(sum) \ 10, "#")
NEXT sum
