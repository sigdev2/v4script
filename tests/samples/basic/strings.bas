' Strings: LEFT$, MID$, INSTR, VAL, STR$, HEX$, MID$ on the left of =,
' LSET and RSET, STRING * n, comparison, MKI$ and CVI.
s$ = "Hello, World"
PRINT LEFT$(s$, 5); "|"; RIGHT$(s$, 5); "|"; MID$(s$, 8); "|"; MID$(s$, 8, 3)
PRINT INSTR(s$, "o"); INSTR(6, s$, "o"); INSTR(s$, "xyz"); INSTR(s$, "")
PRINT UCASE$(s$); " "; LCASE$(s$)
PRINT "["; LTRIM$("   a b  "); "]["; RTRIM$("   a b  "); "]"
PRINT ASC("A"); CHR$(66); STR$(42); STR$(-3.5); VAL("12.5abc"); VAL("&H1F"); VAL("  -7")
PRINT SPACE$(3); "x"; STRING$(4, "*"); STRING$(3, 65)
PRINT HEX$(255); " "; HEX$(-1); " "; OCT$(8); " "; HEX$(65536)
t$ = "abcdef": MID$(t$, 2, 3) = "XYZW": PRINT t$
MID$(t$, 5) = "12": PRINT t$
f$ = SPACE$(6): LSET f$ = "ab": PRINT "["; f$; "]": RSET f$ = "ab": PRINT "["; f$; "]"
DIM fixed AS STRING * 5
fixed = "abcdefg": PRINT "["; fixed; "]"; LEN(fixed)
fixed = "x": PRINT "["; fixed; "]"
PRINT "abc" < "abd"; "b" > "abc"; "a" = "a"; "A" < "a"
c$ = "": FOR i = 1 TO 5: c$ = c$ + CHR$(64 + i): NEXT: PRINT c$
PRINT LEN(""); LEN(STR$(123))
w$ = "the quick brown fox"
n = 0: p = 1
DO
    q = INSTR(p, w$, " ")
    IF q = 0 THEN q = LEN(w$) + 1
    n = n + 1: PRINT n; MID$(w$, p, q - p)
    p = q + 1
LOOP WHILE p <= LEN(w$)
r$ = ""
FOR i = LEN(w$) TO 1 STEP -1: r$ = r$ + MID$(w$, i, 1): NEXT i
PRINT r$
PRINT MKI$(16706); CVI("AB"); CVL(MKL$(123456789))
PRINT CVS(MKS$(1.5)); CVD(MKD$(2.25#))

' Output:
' Hello|World|World|Wor
'  5  9  0  1
' HELLO, WORLD hello, world
' [a b  ][   a b]
'  65 B 42-3.5 12.5  31 -7
'    x****AAA
' FF FFFF 10 10000
' aXYZef
' aXYZ12
' [ab    ]
' [    ab]
' [abcde] 5
' [x    ]
' -1 -1 -1 -1
' ABCDE
'  0  4
'  1 the
'  2 quick
'  3 brown
'  4 fox
' xof nworb kciuq eht
' BA 16961  123456789
'  1.5  2.25
