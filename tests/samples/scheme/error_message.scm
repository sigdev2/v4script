; An error call with irritants.
(define (withdraw balance amount)
  (if (> amount balance)
      (error "Insufficient funds:" amount 'balance balance)
      (- balance amount)))
(display (withdraw 100 30))
(newline)
(withdraw 100 300)

; Output:
; 70
; Error: Insufficient funds: 300 balance 100
; Line: 4
