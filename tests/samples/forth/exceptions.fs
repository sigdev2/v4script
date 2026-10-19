\ CATCH and THROW: own codes and system errors (division by zero, memory,
\ return stack overflow, an unknown word in EVALUATE).
: risky ( n -- ) dup 0= if -10 throw then 100 swap / . ;
: try ( n -- ) ['] risky catch ?dup if ." caught " . drop then cr ;
5 try 0 try
: deep 3 throw ;  : middle 1 2 deep 3 ;  : outer ['] middle catch . depth . cr ;
outer
: check-abort ['] abort catch . cr ; check-abort
: msg-abort -1 abort" boom" ; : check-msg ['] msg-abort catch . cr ; check-msg
: div0 ['] / catch . 2drop cr ; 1 0 div0
: mem-fault 0 @ ;  ' mem-fault catch . cr
: no-error ['] noop catch . cr ; no-error
: recurse-forever recurse ;
' recurse-forever catch . cr
: undefined-eval s" no-such-word" ['] evaluate catch . 2drop cr ; undefined-eval
: f-err 1e 0e f/ f. cr ; f-err

\ Output:
\ 20
\ caught -10
\ 3 0
\ -1
\ -2
\ -10
\ -9
\ 0
\ -5
\ -13
\ inf
