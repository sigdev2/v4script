\ Cell arithmetic (64 bits, division rounding down), the stack, words.
: square ( n -- n*n ) dup * ;
: cube ( n -- n^3 ) dup square * ;
5 square . 3 cube . cr
10 3 / . 10 3 mod . -10 3 / . -10 3 mod . 10 3 /mod . . cr
7 2 - 2 * negate abs . cr
1 2 3 rot . . . cr
1 2 swap over . . . cr
1 2 3 4 2swap . . . . cr
1 2 2dup + . . . cr
5 6 nip . 7 8 tuck . . . cr
3 4 min . 3 4 max . -3 abs . cr
1 2 < . 2 1 < . 1 1 = . 1 2 <> . 0 0= . 5 0= . -1 0< . cr
$ff . %1010 . #99 . 'A' . cr
hex ff . 10 . decimal 255 . cr
255 hex . decimal cr
-1 u. cr
1 63 lshift . 1 63 lshift 1- . cr
-8 2/ . 7 1 rshift . -1 1 rshift . cr
6 7 * 2 + .s cr drop
: fact ( n -- n! ) dup 2 < if drop 1 else dup 1- recurse * then ;
20 fact . cr
21 fact . cr
1 2 3 depth . 2drop drop cr
9 7 and . 9 7 or . 9 7 xor . 0 invert . cr

\ Output:
\ 25 27
\ 3 1 -4 2 3 1
\ 10
\ 1 3 2
\ 2 1 2
\ 2 1 4 3
\ 3 2 1
\ 6 8 7 8
\ 3 4 3
\ -1 0 -1 -1 -1 0 -1
\ 255 10 99 65
\ FF 10 255
\ FF
\ 18446744073709551615
\ -9223372036854775808 9223372036854775807
\ -4 3 9223372036854775807
\ <1> 44
\ 2432902008176640000
\ -4249290049419214848
\ 3
\ 1 15 14 -1
