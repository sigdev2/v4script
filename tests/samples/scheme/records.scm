; define-record-type records.
(define-record-type point
  (make-point x y)
  point?
  (x point-x set-point-x!)
  (y point-y))
(define p (make-point 3 4))
(display (list (point? p) (point? 'p) (point-x p) (point-y p))) (newline)
(set-point-x! p 10)
(display (point-x p)) (newline)
(define-record-type <account>
  (open-account owner)
  account?
  (owner account-owner)
  (balance account-balance set-account-balance!))
(define acc (open-account "Анна"))
(set-account-balance! acc 100)
(display (list (account-owner acc) (account-balance acc))) (newline)
(define (distance a b)
  (sqrt (+ (square (- (point-x a) (point-x b))) (square (- (point-y a) (point-y b))))))
(display (distance (make-point 0 0) (make-point 3 4))) (newline)
(display (map point-x (list (make-point 1 2) (make-point 5 6)))) (newline)

; Output:
; (#t #f 3 4)
; 10
; (Анна 100)
; 5
; (1 5)
