\ THROW without CATCH; ABORT" with its own text.
: check ( n -- ) dup 0< abort" negative value" . ;
5 check
-1 check

\ Output:
\ 5
\ Error: negative value
\ Line: 2
