\ Algorithms: a sieve, insertion sort, GCD, a string reversed, Fibonacci
\ numbers in double precision, the towers of Hanoi.
8190 constant size
create flags size allot
: sieve ( -- count )
  flags size 1 fill
  0 size 0 do
    flags i + c@ if
      i 2* 3 + dup i + begin dup size < while 0 over flags + c! over + repeat 2drop 1+
    then
  loop ;
sieve . cr

create data 9 , 3 , 7 , 1 , 8 , 2 , 6 , 4 , 5 ,
9 constant count#
: cell@ ( i -- x ) cells data + @ ;
: cell! ( x i -- ) cells data + ! ;
: insertion-sort ( -- )
  count# 1 do
    i cell@ i
    begin dup 0> while
      2dup 1- cell@ < while
      dup 1- cell@ over cell! 1-
    repeat then
    cell!
  loop ;
: show ( -- ) count# 0 do i cell@ . loop cr ;
insertion-sort show

: gcd ( a b -- g ) begin dup while tuck mod repeat drop ;
48 18 gcd . 1071 462 gcd . cr

: reverse-type ( c-addr u -- ) begin dup while 1- 2dup + c@ emit repeat 2drop ;
s" stressed" reverse-type cr

: dfib ( n -- d ) >r 0. 1. r> 0 ?do 2swap 2over d+ loop 2drop ;
100 dfib d. cr

variable moves
: hanoi ( n from to via -- )
  { n from to via }
  n 0= if exit then
  n 1- from via to recurse
  1 moves +!
  n 1- via to from recurse ;
0 moves ! 10 1 3 2 hanoi moves @ . cr

: digits ( u -- n ) 0 swap begin 10 / swap 1+ swap dup 0= until drop ;
123456789 digits . cr
: power ( b e -- b^e ) 1 swap 0 ?do over * loop nip ;
2 40 power . 3 20 power . cr

\ Output:
\ 1899
\ 1 2 3 4 5 6 7 8 9
\ 6 21
\ desserts
\ 354224848179261915075
\ 1023
\ 9
\ 1099511627776 3486784401
