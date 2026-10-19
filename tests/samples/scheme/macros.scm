; Hygienic syntax-rules macros.
(define-syntax swap!
  (syntax-rules ()
    ((_ a b) (let ((tmp a)) (set! a b) (set! b tmp)))))
(define tmp 1)
(define other 2)
(swap! tmp other)
(display (list tmp other)) (newline)
(define-syntax my-or
  (syntax-rules ()
    ((_) #f)
    ((_ e) e)
    ((_ e r ...) (let ((t e)) (if t t (my-or r ...))))))
(define t 5)
(display (my-or #f t)) (newline)
(define-syntax while
  (syntax-rules ()
    ((_ condition body ...) (let loop () (when condition body ... (loop))))))
(define i 0)
(while (< i 3) (display i) (set! i (+ i 1)))
(newline)
(define-syntax for
  (syntax-rules (in from to)
    ((_ x in lst body ...) (for-each (lambda (x) body ...) lst))
    ((_ x from a to b body ...) (do ((x a (+ x 1))) ((> x b)) body ...))))
(for y in '(a b c) (display y))
(newline)
(for k from 1 to 5 (display (* k k)) (display " "))
(newline)
(define-syntax my-let*
  (syntax-rules ()
    ((_ () body ...) (let () body ...))
    ((_ ((x v) rest ...) body ...) (let ((x v)) (my-let* (rest ...) body ...)))))
(display (my-let* ((a 1) (b (+ a 1)) (c (* b 3))) (list a b c))) (newline)
(define-syntax nest
  (syntax-rules ()
    ((_ (a b ...) ...) (list (list a (list b ...)) ...))))
(display (nest (1 2 3) (4) (5 6))) (newline)
(define-syntax tail-pattern
  (syntax-rules ()
    ((_ a ... z) (list 'last z 'rest a ...))))
(display (tail-pattern 1 2 3 4)) (newline)
(define-syntax vector-sum
  (syntax-rules ()
    ((_ #(x ...)) (+ x ...))))
(display (vector-sum #(1 2 3 4))) (newline)
(define-syntax my-if
  (syntax-rules (then else)
    ((_ c then a else b) (if c a b))))
(display (my-if #t then 'yes else 'no)) (newline)
(display (let ((if list)) (my-if #f then 1 else 2))) (newline)
(let-syntax ((double (syntax-rules () ((_ x) (* 2 x)))))
  (display (double 21)) (newline))
(letrec-syntax ((my-and (syntax-rules () ((_) #t) ((_ e) e) ((_ e r ...) (if e (my-and r ...) #f)))))
  (display (my-and 1 2 3)) (newline))
(define-syntax ten (syntax-rules () ((_) 10)))
(display (+ (ten) 1)) (newline)
(define-syntax be-like-begin
  (syntax-rules ()
    ((be-like-begin name)
     (define-syntax name
       (syntax-rules ()
         ((name expr (... ...))
          (begin expr (... ...))))))))
(be-like-begin sequence)
(display (sequence 1 2 3 4)) (newline)

; Output:
; (2 1)
; 5
; 012
; abc
; 1 4 9 16 25
; (1 2 6)
; ((1 (2 3)) (4 ()) (5 (6)))
; (last 4 rest 1 2 3)
; 10
; yes
; 2
; 42
; 3
; 11
; 4
