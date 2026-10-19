; The numeric tower: unbounded exact integers, fractions, floats, complex numbers.
(define (show . xs) (for-each (lambda (x) (write x) (display " ")) xs) (newline))
(define (fact n) (if (= n 0) 1 (* n (fact (- n 1)))))
(show (fact 25) (expt 2 100) (- (expt 2 64) 1))
(show (/ 1 3) (+ 1/3 2/3) (* 3/4 4/9) (/ 6 4) (exact->inexact 1/7))
(show 0.1 (+ 0.1 0.2) 1e21 1.5e-10 -0.0 100.0)
(show (sqrt 16) (sqrt 2) (sqrt -4) (sqrt 1/4))
(call-with-values (lambda () (exact-integer-sqrt 17)) show)
(show (exact 0.5) (inexact 1/8) (exact 2.0) (exact (floor 2.7)))
(show (round 2.5) (round 3.5) (round 7/2) (truncate -2.7) (floor -2.7) (ceiling 2.1))
(show (quotient 17 5) (remainder -17 5) (modulo -17 5) (floor-quotient -17 5) (truncate-remainder -17 5))
(show (gcd 12 18) (lcm 4 6) (abs -7) (max 1 2.0) (min 1 2))
(show (expt 2 -2) (expt 2.0 0.5) (expt 0 0) (exp 0) (log 1))
(show (make-rectangular 3 4) (magnitude (make-rectangular 3 4)) (* (make-rectangular 0 1) (make-rectangular 0 1)))
(show (number->string 255 16) (number->string 10 2) (string->number "ff" 16) (string->number "1e3") (string->number "abc"))
(show (exact? 1/2) (inexact? 0.5) (integer? 2.0) (rational? 1/3) (real? 1+2i) (complex? 1))
(show (numerator 6/4) (denominator 6/4) (nan? (/ 0. 0.)) (infinite? (/ 1. 0.)))
(show (exact-integer? 5) (zero? 0) (positive? -1) (odd? 7) (even? 0))
(show (* 1.5 2) (+ 1/2 0.5) (- 5) (/ 2) (square 12))
(show (atan 1 1) (sin 0) (cos 0))

; Output:
; 15511210043330985984000000 1267650600228229401496703205376 18446744073709551615
; 1/3 1 1/3 3/2 0.14285714285714285
; 0.1 0.30000000000000004 1e+21 1.5e-10 -0.0 100.0
; 4 1.4142135623730951 0+2i 1/2
; 4 1
; 1/2 0.125 2 2
; 2.0 4.0 4 -2.0 -3.0 3.0
; 3 -2 3 -4 -2
; 6 12 7 2.0 1
; 1/4 1.4142135623730951 1 1.0 0.0
; 3+4i 5 -1
; "ff" "1010" 255 1000.0 #f
; #t #t #t #t #f #t
; 3 2 #t #t
; #t #t #f #t #t
; 3.0 1.0 -5 1/2 144
; 0.7853981633974483 0.0 1.0
