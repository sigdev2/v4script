;; A type error: the unit runs nothing and reports the line.
(module
  (func (export "ok") (result i32) (i32.const 1))
  (func (export "bad") (param $x i64) (result i32)
    (i32.add
      (local.get $x)
      (i32.const 1))))
(invoke "ok")

;; Error: type mismatch
;; Line: 5
