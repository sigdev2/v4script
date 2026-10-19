; The host module "app" of the tests: procedures with Scheme names and the
; object app with the dot notation; log is a procedure of Scheme, the host
; one is app.log.
(display (list (greet "Ann") (app.add 2 3.5) (is-even 4) (counter) app.counter))
(newline)
(define p (point 1 2))
(display (list p.x p.y (vector-length (range 3))))
(newline)
(app.log "one")
(display (list (logged) (describe) (describe (list 1 2))))
(newline)

; Output:
; (Hello, Ann! 5.5 #t 1 2)
; (1 2 3)
; (#(one) nothing [1,2])
