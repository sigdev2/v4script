; R7RS libraries: define-library in a unit, import with only, prefix, rename.
(define-library (geometry shapes)
  (export area perimeter (rename make-rect rect) shapes-made)
  (import (scheme base))
  (begin
    (define made 0)
    (define (shapes-made) made)
    (define (make-rect w h) (set! made (+ made 1)) (cons w h))
    (define (area r) (* (car r) (cdr r)))
    (define (perimeter r) (* 2 (+ (car r) (cdr r))))))
(import (geometry shapes))
(define r (rect 3 4))
(display (list (area r) (perimeter r) (shapes-made)))
(newline)
(import (prefix (geometry shapes) g:))
(display (g:area (g:rect 2 5)))
(newline)
(import (rename (only (srfi 1) fold) (fold reduce-left)))
(display (reduce-left + 0 '(1 2 3 4)))
(newline)
(display (shapes-made))
(newline)
(cond-expand
  ((and r7rs (library (scheme base))) (display "r7rs"))
  (else (display "other")))
(newline)
(cond-expand (srfi-1 (display "srfi-1")) (else (display "no srfi-1")))
(newline)
(display (and (memq 'r7rs (features)) #t))
(newline)

; Output:
; (12 14 1)
; 10
; 10
; 2
; r7rs
; srfi-1
; #t
