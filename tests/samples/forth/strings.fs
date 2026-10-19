\ Strings in memory (UTF-8 bytes), input parsing, EVALUATE.
s" Hello, Forth!" type cr
s" Hello" nip . cr
: greet ( c-addr u -- ) ." Hi, " type ." !" cr ;
s" Anna" greet
: show-chars ( c-addr u -- ) 0 ?do dup i + c@ emit [char] . emit loop drop cr ;
s" abc" show-chars
char A . : z [char] z ; z . cr
s" apple" s" apple" compare . s" apple" s" banana" compare . s" b" s" a" compare . cr
s" hello world" s" wor" search . type cr
s" hello world" s" xyz" search . . drop cr
s" trailing   " -trailing type ." |" cr
s" abcdef" 2 /string type cr
create name-buf 20 allot
s" copied" name-buf swap move name-buf 6 type cr
s\" tab\there\nnew line" type cr
: cs c" counted" ; cs count type cr
: str-lit s" in definition" ; str-lit type cr
s" 123" 0 0 2swap >number . drop d. cr
s" 12x" 0 0 2swap >number . c@ emit drop drop cr
bl word hello count type cr
s" Привет" nip . cr
s" Привет, мир" type cr
: x." ." compiled string" cr ; x."
.( parsed at compile time) cr
s" 2 3 + ." evaluate cr
: eval-test s" 10 20 * ." evaluate ; eval-test cr
pad 10 char * fill pad 5 type cr
: up s" toUpper" over + swap ?do i c@ toupper emit loop cr ; up

\ Output:
\ Hello, Forth!
\ 5
\ Hi, Anna!
\ a.b.c.
\ 65 122
\ 0 -1 1
\ -1 world
\ 0 11
\ trailing|
\ cdef
\ copied
\ tab	here
\ new line
\ counted
\ in definition
\ 0 123
\ 1 x
\ hello
\ 12
\ Привет, мир
\ compiled string
\ parsed at compile time
\ 5
\ 200
\ *****
\ TOUPPER
