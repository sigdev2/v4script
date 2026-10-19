\ Defining words: VARIABLE, CONSTANT, VALUE, CREATE ... DOES>, DEFER,
\ structures, :NONAME, MARKER.
variable counter
: bump 1 counter +! ;
bump bump bump counter @ . cr
10 constant ten  ten 2 * . cr
42 value answer  answer . 7 to answer answer . cr
: set-answer to answer ;  99 set-answer answer . cr
create table 1 , 2 , 3 , 4 ,
table 2 cells + @ . table 3 cells + @ . cr
: array ( n "name" -- ) create cells allot does> ( i -- addr ) swap cells + ;
5 array squares
: fill-squares 5 0 do i dup * i squares ! loop ;
fill-squares 3 squares @ . 4 squares @ . cr
: const ( n "name" -- ) create , does> @ ;
7 const seven seven seven + . cr
defer greet
: hello ." hello" ;  : bye-msg ." goodbye" ;
' hello is greet greet cr
' bye-msg is greet greet cr
: use-greet greet ; use-greet cr
action-of greet ' bye-msg = . cr
2variable pair  3 4 pair 2!  pair 2@ . . cr
5 6 2constant five-six five-six . . cr
create buf 10 allot  buf 10 char x fill  buf 10 type cr
: counter-word ( "name" -- ) create 0 , does> 1 over +! @ ;
counter-word ticks ticks . ticks . ticks . cr
begin-structure point field: p.x field: p.y end-structure
point . create pt point allot 3 pt p.x ! 4 pt p.y ! pt p.x @ pt p.y @ + . cr
0 cfield: a1 cfield: a2 field: a3 . cr
:noname 2 * ; constant doubler  21 doubler execute . cr
: apply ( xt n -- n' ) swap execute ;
' 1+ 41 apply . cr
: imm ." immediate!" ; immediate
: use-imm imm ;  cr
marker forget-me
: temp-word 123 ;
temp-word . forget-me
[defined] temp-word . [undefined] temp-word . cr

\ Output:
\ 3
\ 20
\ 42 7
\ 99
\ 3 4
\ 9 16
\ 14
\ hello
\ goodbye
\ goodbye
\ -1
\ 4 3
\ 6 5
\ xxxxxxxxxx
\ 1 2 3
\ 16 7
\ 16
\ 42
\ 42
\ immediate!
\ 123 0 -1
