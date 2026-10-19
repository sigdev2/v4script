\ Hello: words, loops and a line of input.
: stars ( n -- )  0 ?do [char] * emit loop ;
: triangle ( n -- )  1+ 1 ?do i stars cr loop ;

.( A triangle of stars:) cr
5 triangle

create name 40 allot
.( What is your name? )
name 40 accept constant length
cr ." Hello, " name length type ." !" cr
." Your name has " length . ." characters." cr
