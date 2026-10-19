; SRFI 13 strings, format (SRFI 28) and string-split.
(define (show x) (write x) (newline))
(show (string-join '("a" "b" "c") ", "))
(show (string-join '("x" "y") "-" 'suffix))
(show (string-index "hello" #\l))
(show (string-index-right "hello" #\l))
(show (string-index "hello" char-upper-case?))
(show (string-contains "hello world" "o w"))
(show (string-prefix? "he" "hello"))
(show (string-suffix? "lo" "hello"))
(show (string-pad "42" 5))
(show (string-pad-right "42" 5 #\*))
(show (string-trim "  text  "))
(show (string-trim-right "  text  "))
(show (string-trim-both "--text--" #\-))
(show (string-take "hello" 2))
(show (string-drop "hello" 2))
(show (string-take-right "hello" 2))
(show (string-reverse "привет"))
(show (string-count "banana" #\a))
(show (string-filter char-alphabetic? "a1b2c3"))
(show (string-delete char-numeric? "a1b2c3"))
(show (string-tokenize "  one two   three "))
(show (string-fold cons '() "abc"))
(show (string-titlecase "hello big world"))
(show (string-null? ""))
(show (string-every char-numeric? "123"))
(show (string-any char-upper-case? "abC"))
(show (string-tabulate (lambda (i) (integer->char (+ 65 i))) 4))
(show (string-split "a,b,,c" #\,))
(show (string-split "  many   spaces here "))
(show (format "~a + ~a = ~a~%" 2 3 (+ 2 3)))
(show (format "~s and ~a" "quoted" "plain"))
(show (format "hex ~x, binary ~b" 255 5))
(format #t "printed: ~a~%" '(1 2))

; Output:
; "a, b, c"
; "x-y-"
; 2
; 3
; #f
; 4
; #t
; #t
; "   42"
; "42***"
; "text  "
; "  text"
; "text"
; "he"
; "llo"
; "lo"
; "тевирп"
; 3
; "abc"
; "abc"
; ("one" "two" "three")
; (#\c #\b #\a)
; "Hello Big World"
; #t
; #t
; #t
; "ABCD"
; ("a" "b" "" "c")
; ("many" "spaces" "here")
; "2 + 3 = 5\n"
; "\"quoted\" and plain"
; "hex ff, binary 101"
; printed: (1 2)
