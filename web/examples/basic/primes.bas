' The sieve of Eratosthenes: cross out the multiples of every prime,
' the numbers that remain are prime.
CONST LIMIT = 300
DIM crossed(LIMIT) AS INTEGER
FOR n = 2 TO SQR(LIMIT)
    IF NOT crossed(n) THEN
        FOR m = n * n TO LIMIT STEP n
            crossed(m) = -1
        NEXT m
    END IF
NEXT n
PRINT "Primes up to"; LIMIT; ":"
count = 0
FOR n = 2 TO LIMIT
    IF NOT crossed(n) THEN
        PRINT USING "#####"; n;
        count = count + 1
        IF count MOD 10 = 0 THEN PRINT
    END IF
NEXT n
PRINT
PRINT count; "primes"
