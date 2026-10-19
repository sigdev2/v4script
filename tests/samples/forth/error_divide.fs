\ Division by zero inside a word - the line of the word.
: ratio ( a b -- a/b )
  / ;
10 2 ratio .
10 0 ratio .

\ Output:
\ 5
\ Error: Division by zero
\ Line: 3
