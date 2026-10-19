; Tail calls and recursion: a loop of a million steps, mutual recursion,
; deep ordinary recursion - without a stack overflow.
(define (count-up n)
  (let loop ((i 0) (sum 0))
    (if (= i n) sum (loop (+ i 1) (+ sum i)))))
(display (count-up 1000000))
(newline)
(define (my-even? n) (if (= n 0) #t (my-odd? (- n 1))))
(define (my-odd? n) (if (= n 0) #f (my-even? (- n 1))))
(display (my-even? 100001))
(newline)
(define (depth n) (if (= n 0) 0 (+ 1 (depth (- n 1)))))
(display (depth 200000))
(newline)
(define (build n) (if (= n 0) '() (cons n (build (- n 1)))))
(display (length (build 100000)))
(newline)
(define (cps-fact n k) (if (= n 0) (k 1) (cps-fact (- n 1) (lambda (v) (k (* n v))))))
(display (cps-fact 20 (lambda (x) x)))
(newline)
(define (do-loop) (do ((i 0 (+ i 1)) (acc '() (cons i acc))) ((= i 5) acc)))
(display (do-loop))
(newline)
(display (apply + (iota 10000)))
(newline)

; Output:
; 499999500000
; #f
; 200000
; 100000
; 2432902008176640000
; (4 3 2 1 0)
; 49995000
