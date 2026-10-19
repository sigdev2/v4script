;; Functions of a module called by commands: i64 factorials, a loop,
;; recursion and an imported console.log.
(module $math
  (import "console" "log" (func $log (param i32 i64)))
  (func $factorial (export "factorial") (param $n i64) (result i64)
    (if (result i64) (i64.le_s (local.get $n) (i64.const 1))
      (then (i64.const 1))
      (else (i64.mul (local.get $n)
                     (call $factorial (i64.sub (local.get $n) (i64.const 1)))))))
  (func (export "table") (param $count i32)
    (local $i i32)
    (loop $next
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (call $log (local.get $i) (call $factorial (i64.extend_i32_u (local.get $i))))
      (br_if $next (i32.lt_u (local.get $i) (local.get $count)))))
  (func (export "gcd") (param $a i32) (param $b i32) (result i32)
    (block $done
      (loop $step
        (br_if $done (i32.eqz (local.get $b)))
        (local.get $b)
        (local.set $b (i32.rem_u (local.get $a) (local.get $b)))
        (local.set $a)
        (br $step)))
    (local.get $a)))

(invoke "table" (i32.const 20))
(invoke "gcd" (i32.const 1071) (i32.const 462))
(assert_return (invoke "factorial" (i64.const 5)) (i64.const 120))
(invoke "factorial" (i64.const 20))
