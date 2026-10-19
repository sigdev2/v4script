; Strings and characters (R7RS).
(define (show x) (write x) (newline))
(define s "Привет, мир")
(show (string-length s))
(show (string-ref s 0))
(show (substring s 0 6))
(show (string-append s "!" "!"))
(show (string-upcase s))
(show (string-downcase "ABC"))
(show (string->list "abc"))
(show (list->string (list #\x #\y)))
(show (string->symbol "hello"))
(show (symbol->string 'world))
(show (string->number "42"))
(show (number->string 3.5))
(show (string=? "a" "a" "a"))
(show (string<? "apple" "banana"))
(show (string-ci=? "AbC" "aBc"))
(define m (make-string 3 #\-))
(string-set! m 1 #\+)
(show m)
(show (string-copy "hello" 1 3))
(define buf (make-string 5 #\.))
(string-copy! buf 1 "ab")
(show buf)
(show (string-map char-upcase "abc"))
(let ((acc '())) (string-for-each (lambda (c) (set! acc (cons c acc))) "xyz") (show acc))
(show (char-upcase #\ж))
(show (list (char-alphabetic? #\a) (char-numeric? #\1) (char-whitespace? #\space) (char-upper-case? #\A)))
(show (char->integer #\A))
(show (integer->char 955))
(show (digit-value #\7))
(show (string #\a #\b))
(show (string->vector "ab"))
(show (vector->string #(#\c #\d)))
(show (string->utf8 "Я"))
(show (utf8->string (bytevector 208 175)))
(show (string-foldcase "ПрИвЕт"))

; Output:
; 11
; #\П
; "Привет"
; "Привет, мир!!"
; "ПРИВЕТ, МИР"
; "abc"
; (#\a #\b #\c)
; "xy"
; hello
; "world"
; 42
; "3.5"
; #t
; #t
; #t
; "-+-"
; "el"
; ".ab.."
; "ABC"
; (#\z #\y #\x)
; #\Ж
; (#t #t #t #t)
; 65
; #\λ
; 7
; "ab"
; #(#\a #\b)
; "cd"
; #u8(208 175)
; "Я"
; "привет"
