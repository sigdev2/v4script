; Standard input of the host: read-line, read (a datum over lines),
; read-char and peek-char.
(display "Name? ")
(define name (read-line))
(display (string-append "Hi " name))
(newline)
(write (read))
(newline)
(write (list (read-char) (read-char) (peek-char)))
(newline)
(write (read-line))
(newline)
(write (eof-object? (read-line)))
(newline)

; Input:
; Bob
; (a b
;  c) xy
; last
; Output:
; Name? Hi Bob
; (a b c)
; (#\space #\x #\y)
; "y"
; #f
