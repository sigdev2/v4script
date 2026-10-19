;; The sieve of Eratosthenes on memory bytes and the sum of the primes in
;; i64: hot loops with loads and stores (a speed check too).
(module
  (memory 16)
  (func $sieve (param $n i32) (result i32 i64)
    (local $i i32) (local $j i32) (local $count i32) (local $sum i64)
    (memory.fill (i32.const 0) (i32.const 1) (local.get $n))
    (local.set $i (i32.const 2))
    (block $done
      (loop $outer
        (br_if $done (i32.gt_u (i32.mul (local.get $i) (local.get $i)) (local.get $n)))
        (if (i32.load8_u (local.get $i))
          (then
            (local.set $j (i32.mul (local.get $i) (local.get $i)))
            (block $marked
              (loop $inner
                (br_if $marked (i32.ge_u (local.get $j) (local.get $n)))
                (i32.store8 (local.get $j) (i32.const 0))
                (local.set $j (i32.add (local.get $j) (local.get $i)))
                (br $inner)))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $outer)))
    (local.set $i (i32.const 2))
    (block $end
      (loop $count
        (br_if $end (i32.ge_u (local.get $i) (local.get $n)))
        (if (i32.load8_u (local.get $i))
          (then
            (local.set $count (i32.add (local.get $count) (i32.const 1)))
            (local.set $sum (i64.add (local.get $sum) (i64.extend_i32_u (local.get $i))))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $count)))
    (local.get $count)
    (local.get $sum))
  (export "sieve" (func $sieve)))

(invoke "sieve" (i32.const 100))
(invoke "sieve" (i32.const 1000000))

;; Output:
;; 25 1060
;; Value: 78498 37550402023
