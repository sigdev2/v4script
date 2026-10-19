\ The stack is empty: the interpreter reports the underflow after the word.
: two-drops drop drop ;
1 two-drops

\ Error: Stack underflow
\ Line: 3
