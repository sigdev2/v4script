;; Linear memory: fill an array of i32 with squares, then sum it back.
(module
  (memory 1)
  (func $fill (param $count i32)
    (local $i i32)
    (block $done
      (loop $next
        (br_if $done (i32.ge_u (local.get $i) (local.get $count)))
        (i32.store (i32.shl (local.get $i) (i32.const 2))
                   (i32.mul (local.get $i) (local.get $i)))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $next))))
  (func (export "sum_of_squares") (param $count i32) (result i32)
    (local $i i32) (local $sum i32)
    (call $fill (local.get $count))
    (block $done
      (loop $next
        (br_if $done (i32.ge_u (local.get $i) (local.get $count)))
        (local.set $sum (i32.add (local.get $sum)
                                 (i32.load (i32.shl (local.get $i) (i32.const 2)))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $next)))
    (local.get $sum))
  (func (export "pages") (result i32) (memory.size)))

(invoke "pages")
(invoke "sum_of_squares" (i32.const 10))
(invoke "sum_of_squares" (i32.const 1000))
