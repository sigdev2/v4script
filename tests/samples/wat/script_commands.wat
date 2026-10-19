;; Script commands: invoke prints the result (the last one is the value of
;; the unit), assert_* check the module and stay silent when all is right.
(module $math
  (func $fac (export "fac") (param i64) (result i64)
    (if (result i64) (i64.eqz (local.get 0))
      (then (i64.const 1))
      (else (i64.mul (local.get 0) (call $fac (i64.sub (local.get 0) (i64.const 1)))))))
  (func (export "pair") (param i32) (result i32 i64)
    (local.get 0)
    (i64.extend_i32_u (i32.mul (local.get 0) (local.get 0))))
  (func (export "half") (param f64) (result f64)
    (f64.mul (local.get 0) (f64.const 0.5)))
  (global (export "answer") i32 (i32.const 42)))

(invoke "fac" (i64.const 20))
(invoke "fac" (i64.const 25))
(invoke "pair" (i32.const 7))
(invoke "half" (f64.const 3))
(get "answer")
(assert_return (invoke "fac" (i64.const 5)) (i64.const 120))
(assert_return (invoke "pair" (i32.const -1)) (i32.const -1) (i64.const 1))
(assert_trap (module (func $f unreachable) (start $f)) "unreachable")
(assert_invalid (module (func (result i32) (i64.const 1))) "type mismatch")
(assert_malformed (module quote "(func (i32.plus))") "unknown operator")
(invoke $math "fac" (i64.const 3))

;; Output:
;; 2432902008176640000
;; 7034535277573963776
;; 7 49
;; 1.5
;; 42
;; Value: 6
