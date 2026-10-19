\ Compiling: locals, POSTPONE, IMMEDIATE, LITERAL, [IF], word lists, the
\ heap, the return stack, stack shuffles.
: swap-locals { a b -- b a } b a ;
1 2 swap-locals . . cr
: sum-sq { a b -- n } 0 { t } a a * to t b b * t + ;
3 4 sum-sq . cr
: loc-loop { n -- sum } 0 n 0 ?do i + loop ;
10 loc-loop . cr
: ftest { f: x f: y -- } x y f+ f. ;
1.5e 2.5e ftest cr
: my-if postpone if ; immediate
: my-then postpone then ; immediate
: use-my 5 0> my-if ." positive" my-then cr ;
use-my
: compile-plus postpone + ; immediate
: add3 1 2 compile-plus 3 compile-plus . ;
add3 cr
: make-adder ( n "name" -- ) create , does> @ + ;
10 make-adder add10  5 add10 . cr
: lit-test [ 6 7 * ] literal . ; lit-test cr
0 [if] ." no" [else] ." yes" [then] cr
1 [if] ." one" 0 [if] ." inner" [then] [else] ." else" [then] cr
wordlist constant my-words
get-current my-words set-current
: hidden-word ." from my-words" ;
set-current
my-words >order hidden-word previous cr
[defined] hidden-word . cr
1000 allocate . dup 1000 erase 42 over ! dup @ . free . cr
: alloc-loop 100 0 do 64 allocate drop free drop loop ." ok" ; alloc-loop cr
: countdown ( n -- ) dup 0> if dup . 1- recurse else drop then ;
5 countdown cr
: deep-rec ( n -- n ) dup 0> if 1- recurse 1+ then ;
500 deep-rec . cr
: xt-table create ' , ' , does> swap cells + @ execute ;
xt-table ops + *
3 4 0 ops . 3 4 1 ops . cr
: word-test bl word count type ; word-test hello cr
s" 1 2 + 3 *" evaluate . cr
: >upper ( c -- c ) dup [char] a [char] z 1+ within if 32 - then ;
char q >upper emit cr
: pick-test 1 2 3 2 pick . 1 pick . . . . ; pick-test cr
: roll-test 1 2 3 4 3 roll . . . . ; roll-test cr
: ?dup-test 0 ?dup . 5 ?dup . . ; ?dup-test cr
: leave-test 10 0 do i 5 = if leave then i . loop ; leave-test cr
: ret-test 1 >r 2 >r r@ . r> r> . . ; ret-test cr
: ret-loop 5 0 do i >r r> . loop ; ret-loop cr
: 2ret 1 2 2>r 2r@ . . 2r> . . ; 2ret cr
: within-test 5 1 10 within . 10 1 10 within . 0 1 10 within . ; within-test cr
: u-test -1 1 u< . 1 -1 u< . 3 4 u> . ; u-test cr

\ Output:
\ 1 2
\ 25
\ 45
\ 4.
\ positive
\ 6
\ 15
\ 42
\ yes
\ one
\ from my-words
\ 0
\ 0 42 0
\ ok
\ 5 4 3 2 1
\ 500
\ 7 12
\ hello
\ 9
\ Q
\ 1 2 3 2 1
\ 1 4 3 2
\ 0 5 5
\ 0 1 2 3 4
\ 2 1 2
\ 0 1 2 3 4
\ 2 1 2 1
\ -1 0 0
\ 0 -1 0
