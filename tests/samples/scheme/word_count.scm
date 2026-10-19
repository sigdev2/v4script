; Text processing: the words of a string, frequencies, the most frequent words.
(define text "the quick brown fox jumps over the lazy dog the fox")
(define (split-words s)
  (let loop ((chars (string->list s)) (word '()) (words '()))
    (cond ((null? chars)
           (reverse (if (null? word) words (cons (list->string (reverse word)) words))))
          ((char=? (car chars) #\space)
           (loop (cdr chars) '() (if (null? word) words (cons (list->string (reverse word)) words))))
          (else (loop (cdr chars) (cons (car chars) word) words)))))
(define words (split-words text))
(display (length words))
(newline)
(define counts (make-hash-table))
(for-each (lambda (w) (hash-table-update!/default counts w (lambda (n) (+ n 1)) 0)) words)
(define sorted
  (sort (hash-table->alist counts)
        (lambda (a b) (or (> (cdr a) (cdr b)) (and (= (cdr a) (cdr b)) (string<? (car a) (car b)))))))
(for-each (lambda (entry) (display (car entry)) (display ": ") (display (cdr entry)) (newline))
          (take sorted 3))

; Output:
; 11
; the: 3
; fox: 2
; brown: 1
