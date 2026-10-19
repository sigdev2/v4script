\ Forth 2012 words that gforth 0.7 lacks: the locals {: :}, +TO, BUFFER:,
\ SYNONYM, FVALUE, quotations [: ;], a character in quotes.
: hyp {: a b | c -- n :} a a * b b * + to c c ;
3 4 hyp . cr
: tally {: n :} 0 {: sum :} n 0 ?do i +to sum loop sum ;
5 tally . cr
10 value level  5 +to level  level . cr
100 buffer: zone  zone 100 erase  zone 99 + c@ . cr
synonym plus +  2 3 plus . cr
1.5e fvalue ratio  ratio f. 2.5e to ratio ratio f. cr
: apply-twice ( n xt -- n' ) dup >r execute r> execute ;
: twice-triple 5 [: 3 * ;] apply-twice ; twice-triple . cr
: make-quote [: ." quoted" cr ;] ;  make-quote execute
s" MAX-N" environment? . . cr
'я' . 'z' . cr
: cmp-test s" abc" s" abd" compare ; cmp-test . cr

\ Output:
\ 25
\ 10
\ 15
\ 0
\ 5
\ 1.5 2.5
\ 45
\ quoted
\ -1 9223372036854775807
\ 1103 122
\ -1
