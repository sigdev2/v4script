' The calendar of a month. The day of the week of the first day is
' counted from the number of days since 1 January of year 1.
INPUT "Year (e.g. 2026)"; year
IF year < 1 THEN year = 2026
INPUT "Month (1-12)"; month
IF month < 1 OR month > 12 THEN month = 1

DIM length(12)
FOR m = 1 TO 12
    READ length(m)
NEXT m
DATA 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31
leap = (year MOD 4 = 0 AND year MOD 100 <> 0) OR year MOD 400 = 0
IF leap THEN length(2) = 29

y = year - 1
days# = y * 365# + INT(y / 4) - INT(y / 100) + INT(y / 400)
FOR m = 1 TO month - 1
    days# = days# + length(m)
NEXT m
' 1 January of year 1 was a Monday: 0 is Monday, 6 is Sunday.
first = days# - INT(days# / 7) * 7

READ monthName$
FOR m = 2 TO month
    READ monthName$
NEXT m
DATA January, February, March, April, May, June, July
DATA August, September, October, November, December

PRINT
PRINT "     "; monthName$; year
PRINT " Mo Tu We Th Fr Sa Su"
PRINT SPACE$(first * 3);
FOR d = 1 TO length(month)
    PRINT USING "###"; d;
    IF (first + d) MOD 7 = 0 THEN PRINT
NEXT d
PRINT
