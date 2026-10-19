;; Control: blocks with parameters and several results, br_table, loops
;; with a parameter, an early exit, select and recursion through a pointer.
(module
  (func (export "classify") (param $n i32) (result i32)
    (block $other
      (block $two
        (block $one
          (block $zero
            (br_table $zero $one $two $other (local.get $n)))
          (return (i32.const 100)))
        (return (i32.const 101)))
      (return (i32.const 102)))
    (i32.const -1))

  ;; The sum 1..n by a loop with a parameter: the values go through the loop label.
  (func (export "sum") (param $n i32) (result i32)
    (i32.const 0)
    (local.get $n)
    (loop $next (param i32 i32) (result i32)
      (local.set $n)
      (if (param i32) (result i32) (i32.eqz (local.get $n))
        (then)
        (else
          (i32.add (local.get $n))
          (i32.sub (local.get $n) (i32.const 1))
          (br $next)))))

  ;; Division with a remainder: two results of a block.
  (func (export "divmod") (param $a i32) (param $b i32) (result i32 i32)
    (block (result i32 i32)
      (br_if 0 (i32.const -1) (i32.const -1) (i32.eqz (local.get $b)))
      (drop (drop))
      (i32.div_u (local.get $a) (local.get $b))
      (i32.rem_u (local.get $a) (local.get $b))))

  ;; The first divisor greater than 1 (or the number itself).
  (func (export "factor") (param $n i32) (result i32) (local $d i32)
    (local.set $d (i32.const 2))
    (block $found
      (loop $try
        (br_if $found (i32.gt_u (i32.mul (local.get $d) (local.get $d)) (local.get $n)))
        (br_if $found (i32.eqz (i32.rem_u (local.get $n) (local.get $d))))
        (local.set $d (i32.add (local.get $d) (i32.const 1)))
        (br $try))
      (unreachable))
    (select (local.get $d) (local.get $n)
            (i32.eqz (i32.rem_u (local.get $n) (local.get $d)))))

  (func $even (param i32) (result i32)
    (if (result i32) (i32.eqz (local.get 0))
      (then (i32.const 1))
      (else (call $odd (i32.sub (local.get 0) (i32.const 1))))))
  (func $odd (param i32) (result i32)
    (if (result i32) (i32.eqz (local.get 0))
      (then (i32.const 0))
      (else (call $even (i32.sub (local.get 0) (i32.const 1))))))
  (export "even" (func $even)))

(invoke "classify" (i32.const 0))
(invoke "classify" (i32.const 2))
(invoke "classify" (i32.const 77))
(invoke "sum" (i32.const 100))
(invoke "divmod" (i32.const 47) (i32.const 5))
(invoke "divmod" (i32.const 47) (i32.const 0))
(invoke "factor" (i32.const 91))
(invoke "factor" (i32.const 97))
(invoke "even" (i32.const 501))

;; Output:
;; 100
;; 102
;; -1
;; 5050
;; 9 2
;; -1 -1
;; 7
;; 97
;; Value: 0
