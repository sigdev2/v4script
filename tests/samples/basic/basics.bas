' Basics: PRINT (numbers with a space before and after, zones of 14
' characters), types and suffixes, DEFINT, CONST, the format of SINGLE (7
' digits) and DOUBLE (16).
DEFINT I-N
CONST PI = 3.14159
CONST GREETING$ = "Hi"
PRINT PI, GREETING$
n = 7: PRINT n / 2, n \ 2, n MOD 3
x = 1.5: y# = 2.25: PRINT x * 2; y# * 2
PRINT "a", "b", "c"
PRINT "a"; TAB(10); "b"; SPC(3); "c"
PRINT 1; 2; 3
PRINT -1; -2; -3
PRINT "no newline";
PRINT " continued"
a$ = "text": PRINT a$; LEN(a$)
PRINT 10000000; 1E+16; 123.456; -0.001
PRINT 2 ^ 10, 2 ^ 0.5, (-8) ^ 2
k& = 100000: PRINT k& * 3
PRINT CINT(2.5), CINT(3.5), CINT(-2.5), INT(-2.5), FIX(-2.5)
PRINT ABS(-5), SGN(-3), SGN(0), SGN(4.5)
PRINT SQR(16), SQR(2)
PRINT 7 \ 2, -7 \ 2, 7 MOD -2, -7 MOD 2
PRINT 5 AND 3, 5 OR 3, 5 XOR 3, NOT 5
PRINT (1 = 1), (1 = 2), 3 > 2 AND 2 > 1
PRINT 1 + 2 * 3 ^ 2, (1 + 2) * 3
PRINT 2 ^ 3 ^ 2, -2 ^ 2
z! = 1 / 3: PRINT z!
' As in QBasic: 1 / 3 is computed in SINGLE, then in DOUBLE.
d# = 1 / 3: PRINT d#
d# = 1# / 3: PRINT d#
PRINT 100 * 1.1
PRINT 0.1 + 0.2
PRINT 3 * 0.1#
PRINT .001; .0001; 1E-08; 1.23E-06; 12345678; 1234567.8
PRINT 1D+20; 2 ^ 31; 1.5E+300
x% = 2.5: y% = 3.5: PRINT x%; y%
PRINT &HFF; &O17; &HFFFF; &H8000&
PRINT STR$(5); "|"; STR$(-5); "|"

' Output:
'  3.14159      Hi
'  3.5           3             1
'  3  4.5
' a             b             c
' a        b   c
'  1  2  3
' -1 -2 -3
' no newline continued
' text 4
'  10000000  1E+16  123.456 -.001
'  1024          1.414214      64
'  300000
'  2             4            -2            -3            -2
'  5            -1             0             1
'  4             1.414214
'  3            -3             1            -1
'  1             7             6            -6
' -1             0            -1
'  19            9
'  64           -4
'  .3333333
'  .3333333432674408
'  .3333333333333333
'  110
'  .3
'  .3
'  .001  .0001  1E-08  1.23E-06  12345678  1234567.8
'  1D+20  2.147484E+09  1.5D+300
'  2  4
'  255  15 -1  32768
'  5|-5|
