; Hello: read-line, strings and characters.
(display "What is your name? ")
(define name
  (let ((line (read-line)))
    (if (or (eof-object? line) (string=? line "")) "stranger" line)))
(display (string-append "Hello, " name "!"))
(newline)
(display "Backwards: ")
(display (list->string (reverse (string->list name))))
(newline)
(string-upcase name)
