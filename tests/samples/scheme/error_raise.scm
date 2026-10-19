; An exception without a handler: the output before it is kept.
(display "начало")
(newline)
(define (check-age age)
  (if (< age 0)
      (raise (list 'bad-age age))
      age))
(display (check-age 30))
(newline)
(check-age -1)

; Output:
; начало
; 30
; Error: uncaught exception: (bad-age -1)
; Line: 6
