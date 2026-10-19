\ Control structures: IF, BEGIN, DO loops, CASE, an exit from the middle.
: sign. ( n -- ) dup 0< if ." negative" drop else 0= if ." zero" else ." positive" then then cr ;
-5 sign. 0 sign. 7 sign.
: count-down ( n -- ) begin dup . 1- dup 0= until drop cr ;
5 count-down
: collatz ( n -- steps ) 0 swap begin dup 1 <> while swap 1+ swap dup 2 mod if 3 * 1+ else 2/ then repeat drop ;
27 collatz . cr
: loops 5 0 do i . loop cr 10 0 do i . 3 +loop cr 0 10 do i . -2 +loop cr ;
loops
: nested 3 0 do 3 0 do i j * . loop loop cr ;
nested
: find-first ( -- ) 100 0 do i dup * 50 > if i . leave then loop cr ;
find-first
: qdo 0 0 ?do ." never" loop ." ok" cr ;
qdo
: early ( n -- ) 10 0 do i over = if drop unloop exit then i . loop drop ;
5 early cr
: grade ( n -- ) case
    1 of ." one" endof
    2 of ." two" endof
    3 of ." three" endof
    ." other:" dup .
  endcase cr ;
1 grade 2 grade 3 grade 9 grade
\ Two WHILEs in one loop: the second exit goes to ELSE.
: multi ( n -- ) begin dup 10 < while dup 2 mod while 1+ repeat ." even " else ." big " then . cr ;
3 multi 11 multi 4 multi
: tri ( n -- sum ) 0 swap 1+ 1 ?do i + loop ;
100 tri . cr
: again-loop 0 begin 1+ dup 5 = if exit then again ;
again-loop . cr
: fib ( n -- f ) dup 2 < if exit then dup 1- recurse swap 2 - recurse + ;
25 fib . cr
: kloop 2 0 do 2 0 do 2 0 do k j i + + . loop loop loop cr ;
kloop
: neg-step 10 -10 do i . 5 +loop cr ;
neg-step
: ahead-test ahead ." skipped" then ." after" cr ;
ahead-test
\ Entering a loop in the middle (AHEAD and CS-ROLL).
: odd-entry 0 ahead begin dup . 1+ [ 1 cs-roll ] then dup 3 < while repeat drop cr ;
odd-entry

\ Output:
\ negative
\ zero
\ positive
\ 5 4 3 2 1
\ 111
\ 0 1 2 3 4
\ 0 3 6 9
\ 10 8 6 4 2 0
\ 0 0 0 0 1 2 0 2 4
\ 8
\ ok
\ 0 1 2 3 4
\ one
\ two
\ three
\ other:9
\ even 4
\ big 11
\ even 4
\ 5050
\ 5
\ 75025
\ 0 1 1 2 1 2 2 3
\ -10 -5 0 5
\ after
\ 0 1 2
