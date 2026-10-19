; The eight queens puzzle: the number of solutions and the first solution.
(define (queens board-size)
  (define (safe? col positions)
    (let loop ((rest positions) (distance 1))
      (cond ((null? rest) #t)
            ((or (= (car rest) col)
                 (= (abs (- (car rest) col)) distance))
             #f)
            (else (loop (cdr rest) (+ distance 1))))))
  (define (place k)
    (if (= k 0)
        '(())
        (append-map
          (lambda (positions)
            (filter-map (lambda (col) (and (safe? col positions) (cons col positions)))
                        (iota board-size 1)))
          (place (- k 1)))))
  (place board-size))
(define solutions (queens 8))
(display (length solutions))
(newline)
(display (car solutions))
(newline)
(define (show-board positions)
  (for-each (lambda (col)
              (for-each (lambda (c) (display (if (= c col) "Q " ". "))) (iota (length positions) 1))
              (newline))
            positions))
(show-board (car (queens 5)))

; Output:
; 92
; (4 2 7 3 6 8 5 1)
; . . . Q .
; . Q . . .
; . . . . Q
; . . Q . .
; Q . . . .
