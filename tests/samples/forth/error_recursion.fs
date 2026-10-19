\ Endless recursion - a return stack overflow.
: down ( n -- n ) 1+
  recurse ;
0 down

\ Error: Return stack overflow
