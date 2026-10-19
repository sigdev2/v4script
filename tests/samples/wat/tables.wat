;; Function tables: call_indirect, ref.func, table.get/set/grow/fill/copy,
;; passive and declarative segments, funcref as a value.
(module
  (type $binary (func (param i32 i32) (result i32)))
  (table $ops 4 8 funcref)
  (elem (table $ops) (i32.const 0) func $add $sub $mul)
  (elem $extra func $max $add)
  (elem declare func $sub)

  (func $add (type $binary) (i32.add (local.get 0) (local.get 1)))
  (func $sub (type $binary) (i32.sub (local.get 0) (local.get 1)))
  (func $mul (type $binary) (i32.mul (local.get 0) (local.get 1)))
  (func $max (type $binary)
    (select (local.get 0) (local.get 1) (i32.gt_s (local.get 0) (local.get 1))))

  (func $apply (export "apply") (param $op i32) (param $a i32) (param $b i32) (result i32)
    (call_indirect $ops (type $binary) (local.get $a) (local.get $b) (local.get $op)))

  (func (export "shape") (result i32 i32 i32)
    (table.size $ops)
    (table.grow $ops (ref.func $sub) (i32.const 2))
    (table.size $ops))

  (func (export "rearrange") (result i32 i32 i32)
    (table.init $ops $extra (i32.const 4) (i32.const 0) (i32.const 2))
    (elem.drop $extra)
    (table.copy $ops $ops (i32.const 1) (i32.const 4) (i32.const 1))
    (table.set $ops (i32.const 2) (table.get $ops (i32.const 0)))
    (call $apply (i32.const 1) (i32.const 7) (i32.const 9))
    (call $apply (i32.const 2) (i32.const 7) (i32.const 9))
    (ref.is_null (table.get $ops (i32.const 3))))

  (func (export "fill") (result i32)
    (table.fill $ops (i32.const 0) (ref.func $sub) (i32.const 2))
    (call $apply (i32.const 1) (i32.const 10) (i32.const 3))))

(invoke "apply" (i32.const 0) (i32.const 6) (i32.const 7))
(invoke "apply" (i32.const 2) (i32.const 6) (i32.const 7))
(assert_trap (invoke "apply" (i32.const 3) (i32.const 1) (i32.const 1)) "uninitialized element")
(assert_trap (invoke "apply" (i32.const 9) (i32.const 1) (i32.const 1)) "undefined element")
(invoke "shape")
(invoke "rearrange")
(invoke "fill")

;; Output:
;; 13
;; 42
;; 4 4 6
;; 9 16 1
;; Value: 7
