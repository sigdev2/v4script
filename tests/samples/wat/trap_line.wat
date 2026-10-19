;; A trap deep in the calls: the line is the one where it happened; the
;; output before it stays. spectest.print_i32 prints "value : type".
(module
  (import "spectest" "print_i32" (func $print (param i32)))
  (memory 1)
  (func $read (param $at i32) (result i32)
    (call $print (local.get $at))
    (i32.load
      (local.get $at)))
  (func (export "main") (result i32)
    (drop (call $read (i32.const 16)))
    (call $read (i32.const 70000))))

;; Output:
;; 16 : i32
;; 70000 : i32
;; Error: out of bounds memory access
;; Line: 8
