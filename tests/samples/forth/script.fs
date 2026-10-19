\ A unit as a program for the interpreter: definitions, computations,
\ output; what is left on the stack is the value of the unit (as .S).
: average ( a b -- avg ) + 2/ ;
." average " 10 20 average . cr
1 2 3 + 4
2.5e 3e f*

\ Output:
\ average 15
\ Value: <3> 1 5 4  F: <1> 7.5
