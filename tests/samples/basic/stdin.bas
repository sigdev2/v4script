' Standard input of the host: INPUT with "Redo from start", LINE INPUT,
' INKEY$ and INPUT$.
INPUT "Name"; n$
PRINT "Hi "; n$
INPUT "Two numbers", a, b
PRINT a + b
LINE INPUT l$
PRINT "["; l$; "]"
k$ = INKEY$
PRINT ASC(k$); INPUT$(2)

' Input:
' Bob
' 1,x
' 3, 4
'   rest of line
' zqw
' Output:
' Name?
' Hi Bob
' Two numbers
' Redo from start
' Two numbers
'  7
'
' [  rest of line]
'  122 qw
