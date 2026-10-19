; SRFI 69 hash tables.
(define (show x) (write x) (newline))
(define h (make-hash-table))
(hash-table-set! h 'apple 3)
(hash-table-set! h 'pear 5)
(hash-table-set! h "string key" 'value)
(hash-table-set! h '(1 2) 'list-key)
(show (hash-table-ref h 'apple))
(show (hash-table-ref/default h 'plum 0))
(show (hash-table-ref h '(1 2)))
(show (hash-table-ref h "string key"))
(show (hash-table-ref h 'missing (lambda () 'not-found)))
(show (hash-table-exists? h 'pear))
(hash-table-update! h 'apple (lambda (n) (* n 10)))
(hash-table-update!/default h 'kiwi (lambda (n) (+ n 1)) 0)
(show (hash-table-ref h 'apple))
(show (hash-table-ref h 'kiwi))
(hash-table-delete! h 'pear)
(show (hash-table-size h))
(define counts (make-hash-table))
(for-each (lambda (w) (hash-table-update!/default counts w (lambda (n) (+ n 1)) 0))
          '(a b a c b a))
(show (sort (hash-table->alist counts) (lambda (x y) (> (cdr x) (cdr y)))))
(define total 0)
(hash-table-walk counts (lambda (k v) (set! total (+ total v))))
(show total)
(show (hash-table-fold counts (lambda (k v acc) (+ acc v)) 0))
(define s (make-hash-table string=?))
(hash-table-set! s (string #\a #\b) 1)
(show (hash-table-ref/default s "ab" 'none))
(define e (make-hash-table eq?))
(hash-table-set! e 'x 1)
(show (hash-table-ref/default e 'x 0))
(show (sort (map car (hash-table->alist (alist->hash-table '((1 . one) (2 . two))))) <))

; Output:
; 3
; 0
; list-key
; value
; not-found
; #t
; 30
; 1
; 4
; ((a . 3) (b . 2) (c . 1))
; 6
; 6
; 1
; 1
; (1 2)
