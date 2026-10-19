; A simple program: output, definitions, the value of the last expression.
(define (greet name)
  (string-append "Привет, " name "!"))
(display (greet "мир"))
(newline)
(define pi-approx (/ 355 113))
(display pi-approx)
(newline)
(display (exact->inexact pi-approx))
(newline)
(write (list 1 2.5 "три" #\4 'five))
(newline)
(* 6 7)

; Output:
; Привет, мир!
; 355/113
; 3.1415929203539825
; (1 2.5 "три" #\4 five)
; Value: 42
