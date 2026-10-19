; JavaScript from Scheme: the dot notation, the js-... procedures, value
; conversion and a Scheme procedure as a JavaScript function.
(display (Math.max 1 7 3))
(newline)
(display (Math.floor 2.7))
(newline)
(define data (JSON.parse "{\"name\": \"Вася\", \"tags\": [\"a\", \"b\"], \"age\": 30}"))
(display data.name)
(newline)
(display (list data.age data.tags (vector? data.tags)))
(newline)
(set! data.age 31)
(display (js-ref data "age"))
(newline)
(define object (js-object 'title "Отчёт" 'rows (list (list "a" 1) (list "b" 2))))
(display (JSON.stringify object))
(newline)
(define text "hello")
(display (list (text.toUpperCase) text.length))
(newline)
(define (square x) (* x x))
(set! js.schemeSquare square)
(display (js-call js.schemeSquare 12))
(newline)
(display (Array.prototype.map.call (JSON.parse "[1, 2, 3]") (lambda (x . rest) (* x 10))))
(newline)
(define table (make-hash-table))
(hash-table-set! table "key" (vector 1 2.5 "три"))
(display (JSON.stringify table))
(newline)
(display (js-null? (js-ref (JSON.parse "{\"a\": null}") "a")))
(newline)
(display (js-invoke "a,b,c" "split" ","))
(newline)
(display (vector-length (js-new "Array" 3)))
(newline)

; Output:
; 7
; 2
; Вася
; (30 #(a b) #t)
; 31
; {"title":"Отчёт","rows":[["a",1],["b",2]]}
; (HELLO 5)
; 144
; #(10 20 30)
; {"key":[1,2.5,"три"]}
; #t
; #(a b c)
; 3
