\ JavaScript values: handles, properties, calls, arrays and objects, a
\ Forth word as a JavaScript function.
js-global s" Math" js-get value math
js" hello" js. cr
16 1 math s" sqrt" js-call js>n . cr
3 9 4 3 math s" max" js-call js>n . cr
1 2 3 3 js-array dup js-length . js. cr
js-object dup js" Forth" swap s" name" js-set
dup 1994 swap s" year" js-set js. cr
: square ( n -- n*n ) dup * ;
' square js-function value sq
7 1 sq js-invoke js>n . cr
js" 12.5" js>f f. cr
js" text" js-type type cr
math s" PI" js-get js>f f. cr
js-null js-null? . 0 js-null? . js" x" js-null? . cr
s" abc" s>js s" toUpperCase" js-get js-type type cr
0 js" abc" s" toUpperCase" js-call js>s type cr

\ Output:
\ hello
\ 4
\ 9
\ 3 [1,2,3]
\ {"name":"Forth","year":1994}
\ 49
\ 12.5
\ string
\ 3.14159265358979
\ -1 -1 0
\ function
\ ABC
