' Old BASIC with line numbers: GOTO, IF ... THEN number, GOSUB and RETURN,
' ON ... GOSUB, DATA, READ, RESTORE, arrays without DIM.
10 REM Classic line-numbered program
20 LET A = 1
30 GOSUB 1000
40 A = A + 1
50 IF A <= 3 THEN 30
60 ON A - 2 GOSUB 2000, 3000
70 FOR I = 1 TO 4
80 IF I = 2 THEN GOTO 100
90 PRINT "I="; I
100 NEXT I
110 GOTO 200
120 PRINT "skipped"
200 PRINT "done"
210 RESTORE 500
220 READ N, W$
230 PRINT N; W$
240 RESTORE
250 FOR K = 1 TO 3: READ V: PRINT V;: NEXT K: PRINT
260 DIM M(3, 2)
270 FOR R = 1 TO 3: FOR C = 1 TO 2: M(R, C) = R * C: NEXT C, R
280 PRINT M(3, 2); M(2, 1); UBOUND(M, 1); UBOUND(M, 2); LBOUND(M)
290 DIM S$(1 TO 3): S$(1) = "x": S$(3) = "z": PRINT S$(1); S$(2); S$(3); LBOUND(S$)
300 Q(5) = 7: PRINT Q(5); UBOUND(Q)
310 GOSUB 4000
320 END
400 DATA 1, 2, 3
500 DATA 42, "forty two"
1000 PRINT "sub A="; A
1010 RETURN
2000 PRINT "on gosub 2": RETURN
3000 PRINT "on gosub 3": RETURN
4000 X = 0
4010 X = X + 1: IF X < 5 THEN 4010
4020 PRINT "X"; X
4030 RETURN

' Output:
' sub A= 1
' sub A= 2
' sub A= 3
' on gosub 3
' I= 1
' I= 3
' I= 4
' done
'  42 forty two
'  1  2  3
'  6  2  3  2  0
' xz 1
'  7  10
' X 5
