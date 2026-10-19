\ A temperature table with stack words and number formatting.
: c>f ( c -- f*10 )  18 * 320 + ;
: .tenths ( n -- )  dup 0< if [char] - emit then abs 10 /mod 0 .r [char] . emit 0 .r ;
: row ( c -- )  dup 5 .r ."  C  =  " c>f .tenths ."  F" cr ;

: table ( from to step -- )
  rot begin dup 3 pick > 0= while dup row over + repeat drop 2drop ;

." Celsius to Fahrenheit" cr
-20 40 7 table
