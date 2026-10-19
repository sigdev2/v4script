; Lazy streams with delay and force: the endless list of primes.
(define-syntax stream-cons
  (syntax-rules ()
    ((_ head tail) (cons head (delay tail)))))
(define (stream-head s) (car s))
(define (stream-tail s) (force (cdr s)))

(define (integers-from n) (stream-cons n (integers-from (+ n 1))))
(define (stream-filter keep? s)
  (if (keep? (stream-head s))
      (stream-cons (stream-head s) (stream-filter keep? (stream-tail s)))
      (stream-filter keep? (stream-tail s))))
(define (take s n)
  (if (= n 0) '() (cons (stream-head s) (take (stream-tail s) (- n 1)))))

(define (sieve s)
  (let ((p (stream-head s)))
    (stream-cons p (sieve (stream-filter (lambda (x) (not (= 0 (remainder x p))))
                                         (stream-tail s))))))

(display "The first 25 primes: ")
(write (take (sieve (integers-from 2)) 25))
(newline)
