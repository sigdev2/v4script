\ Standard input of the host: ACCEPT reads a line, KEY a byte.
create buffer 40 allot
." Name? " buffer 40 accept buffer swap ." Hi " type cr
key emit key emit key . cr
key? . key . cr

\ Input:
\ Bob
\ xy
\ Output:
\ Name? Hi Bob
\ xy10
\ 0 4
