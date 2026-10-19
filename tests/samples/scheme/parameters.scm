; Parameters: make-parameter and parameterize.
(define indent (make-parameter 0))
(define (line text)
  (display (make-string (indent) #\space))
  (display text)
  (newline))
(line "верхний уровень")
(parameterize ((indent 2))
  (line "вложенный")
  (parameterize ((indent (+ (indent) 2)))
    (line "ещё глубже"))
  (line "снова вложенный"))
(line "снова верхний")
(define radix (make-parameter 10 (lambda (x) (if (memv x '(2 8 10 16)) x (error "bad radix" x)))))
(define (show-number n) (number->string n (radix)))
(display (show-number 255))
(newline)
(parameterize ((radix 16)) (display (show-number 255)) (newline))
(display (guard (e ((error-object? e) (error-object-message e))) (parameterize ((radix 3)) 'unreachable)))
(newline)
(define k #f)
(define depth (make-parameter 'outside))
(display (list (parameterize ((depth 'inside)) (call/cc (lambda (c) (set! k c) (depth)))) (depth)))
(newline)

; Output:
; верхний уровень
;   вложенный
;     ещё глубже
;   снова вложенный
; снова верхний
; 255
; ff
; bad radix
; (inside outside)
