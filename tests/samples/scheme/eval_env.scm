; eval and environments, apply, case-lambda, define-values, do.
(display (eval '(* 6 7) (environment '(scheme base))))
(newline)
(define x 10)
(display (eval '(+ x 1) (interaction-environment)))
(newline)
(eval '(define from-eval 5) (interaction-environment))
(display from-eval)
(newline)
(define area
  (case-lambda
    ((r) (* 3 r r))
    ((w h) (* w h))
    ((a b c) (+ a b c))))
(display (list (area 2) (area 3 4) (area 1 2 3)))
(newline)
(define-values (q r) (truncate/ 17 5))
(display (list q r))
(newline)
(define-values (head . tail) (values 1 2 3))
(display (list head tail))
(newline)
(display (do ((vec (make-vector 5)) (i 0 (+ i 1))) ((= i 5) vec) (vector-set! vec i i)))
(newline)
(display (let-values (((a b) (values 1 2)) ((c . d) (values 3 4 5))) (list a b c d)))
(newline)
(display (let*-values (((a) (values 1)) ((b) (values (+ a 1)))) (list a b)))
(newline)
(display (apply map list '((1 2 3) (4 5 6))))
(newline)
(display (string->symbol "Привет"))
(newline)
(display (symbol? (string->symbol "with space")))
(newline)
(write (string->symbol "with space"))
(newline)

; Output:
; 42
; 11
; 5
; (12 12 6)
; (3 2)
; (1 (2 3))
; #(0 1 2 3 4)
; (1 2 3 (4 5))
; (1 2)
; ((1 4) (2 5) (3 6))
; Привет
; #t
; |with space|
