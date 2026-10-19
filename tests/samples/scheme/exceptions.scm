; Exceptions: guard, with-exception-handler, raise, raise-continuable,
; error objects and dynamic-wind when leaving through an exception.
(define (safe-div a b)
  (guard (e ((error-object? e) (list 'error (error-object-message e) (error-object-irritants e)))
            ((symbol? e) (list 'symbol e)))
    (if (= b 0) (error "division by zero:" a) (/ a b))))
(write (safe-div 10 2)) (newline)
(write (safe-div 1 0)) (newline)
(write (guard (e (#t (list 'caught e))) (raise 'boom))) (newline)
(write (guard (e ((string? e) e)) (raise "plain string"))) (newline)
(write (with-exception-handler
         (lambda (e) 10)
         (lambda () (+ 1 (raise-continuable 'need-a-number)))))
(newline)
(write (guard (e ((error-object? e) (error-object-message e))) (vector-ref (vector 1) 5))) (newline)
(write (guard (e ((error-object? e) (error-object-message e))) (car '()))) (newline)
(write (guard (e (#f 'never)) 'no-exception)) (newline)
(write (guard (outer (#t (list 'outer outer)))
         (guard (inner ((number? inner) (list 'inner inner)))
           (raise 'not-a-number))))
(newline)
(define log '())
(guard (e (#t (set! log (cons (list 'handled e) log))))
  (dynamic-wind
    (lambda () (set! log (cons 'before log)))
    (lambda () (raise 'oops))
    (lambda () (set! log (cons 'after log)))))
(write (reverse log)) (newline)
(write (guard (e ((assq 'a e) => cdr) ((assq 'b e)))
         (raise (list (cons 'a 42)))))
(newline)
(write (guard (e ((assq 'a e) => cdr) ((assq 'b e)))
         (raise (list (cons 'b 23)))))
(newline)
(write (call-with-current-continuation
         (lambda (k)
           (with-exception-handler
             (lambda (e) (k (list 'escaped e)))
             (lambda () (raise 'inner))))))
(newline)
(write (error-object? (guard (e (#t e)) (error "msg" 1 2)))) (newline)

; Output:
; 5
; (error "division by zero:" (1))
; (caught boom)
; "plain string"
; 11
; "vector-ref: index out of range"
; "car: not a pair"
; no-exception
; (outer not-a-number)
; (before after (handled oops))
; 42
; (b . 23)
; (escaped inner)
; #t
