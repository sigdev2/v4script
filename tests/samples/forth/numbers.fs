\ Pictured number output, double numbers (128 bits), number bases.
: .money ( cents -- ) s>d <# # # [char] . hold #s [char] $ hold #> type ;
123456 .money cr 5 .money cr
: .signed ( n -- ) dup abs s>d <# #s rot sign #> type ;
-42 .signed space 42 .signed cr
: .hex ( n -- ) base @ swap hex 0 <# # # # # #> type base ! ;
255 .hex cr
12345 8 .r ." |" cr  -12 6 .r ." |" cr  42 5 u.r ." |" cr
123456789012345. d. cr
1. 2. d+ d. 5. 3. d- d. -7. dnegate d. -7. dabs d. cr
100000000000 100000000000 m* d. cr
-3 4 m* d. cr
1000000 1000000 um* d. cr
100. 7 um/mod . . cr
-7. 2 fm/mod . . -7. 2 sm/rem . . cr
10 20 3 */ . 7 2 3 */mod . . cr
9223372036854775807 2 3 */ . cr
1. 2. d< . 2. 1. d< . 5. 5. d= . 0. d0= . -1. d0< . cr
10. 20. dmax d. 10. 20. dmin d. cr
3. 4 m+ d. cr
1. d2* d. -8. d2/ d. cr
12. 3 4 m*/ d. cr
2 base ! 10 . decimal cr
36 base ! 35 . decimal cr
-1 -1 ud. cr
255 2 base ! u. decimal cr
1 2 3 4 5 .s cr 2drop 2drop drop
s" 99" 0 0 2swap >number 2drop d. cr
0 1 um* . . cr
-1 -1 um* . . cr
s" MAX-N" environment? . . cr

\ Output:
\ $1234.56
\ $0.05
\ -42 42
\ 00FF
\    12345|
\    -12|
\    42|
\ 123456789012345
\ 3 2 7 7
\ 10000000000000000000000
\ -12
\ 1000000000000
\ 14 2
\ -4 1 -3 -1
\ 66 4 2
\ 6148914691236517204
\ -1 0 -1 -1 -1
\ 20 10
\ 7
\ 2 -4
\ 9
\ 10
\ 35
\ 340282366920938463463374607431768211455
\ 11111111
\ <5> 1 2 3 4 5
\ 99
\ 0 0
\ -2 1
\ -1 9223372036854775807
