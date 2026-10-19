' Error trapping: ON ERROR GOTO, ERR and ERL (the line number), RESUME,
' RESUME NEXT, RESUME label, ERROR n, an error in a procedure - on the line
' of the call.
10 ON ERROR GOTO 1000
20 PRINT "start"
30 x% = 32767: x% = x% + 1
40 PRINT "after overflow"; x%
50 DIM a(5): a(7) = 1
60 PRINT "after subscript"
70 ERROR 42
80 PRINT "after error 42"
90 y = SQR(-1)
100 PRINT "not here"
110 PRINT "back at 110"
120 d = 0
130 PRINT "ten by"; d; 10 / d
140 Divide 1, 0
150 PRINT "after sub"
160 ON ERROR GOTO 0
170 PRINT "end"
180 END
1000 PRINT "error"; ERR; "at"; ERL
1010 IF ERR = 5 THEN RESUME 110
1020 IF ERR = 11 AND ERL = 130 THEN d = d + 2: RESUME
1030 RESUME NEXT
SUB Divide (a, b)
    PRINT a / b
END SUB

' Output:
' start
' error 6 at 30
' after overflow 32767
' error 9 at 50
' after subscript
' error 42 at 70
' after error 42
' error 5 at 90
' back at 110
' ten by 0 error 11 at 130
' ten by 2  5
' error 11 at 140
' after sub
' end
