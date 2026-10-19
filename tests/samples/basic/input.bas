' No input: INPUT prints its prompt and gets empty values, INKEY$ gives an
' empty string.
INPUT "Name"; n$
INPUT "Age, height", age, height
LINE INPUT "Line: "; l$
PRINT "["; n$; "]"; age; height; "["; l$; "]"
PRINT "["; INKEY$; "]"


' Output:
' Name?
' Age, height
' Line:
' [] 0  0 []
' []
