; A run-time error: the place is the line of the call of car in a procedure.
(define (second-of lst)
  (car (cdr lst)))
(display (second-of '(1 2)))
(newline)
(display (second-of '(1)))

; Output:
; 2
; Error: car: not a pair: ()
; Line: 3
