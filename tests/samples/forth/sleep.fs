\ MS: a real wait - the unit ends its run, the program goes on by a
\ timer.
: tick ( n -- ) 0 ?do ." tick " i . cr 20 ms loop ;
: slow-double ( n -- 2n ) 1 ms 2* ;
3 tick
21 slow-double . cr
0 ms ." done" cr

\ Output:
\ tick 0
\ tick 1
\ tick 2
\ 42
\ done
