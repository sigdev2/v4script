;; Several modules in a unit: register and (module $name) make the exports
;; available to import; a shared memory, table and mutable global.
(module $lib
  (memory (export "mem") 1)
  (table (export "table") 2 funcref)
  (global $counter (export "counter") (mut i32) (i32.const 0))
  (func (export "bump") (result i32)
    (global.set $counter (i32.add (global.get $counter) (i32.const 1)))
    (global.get $counter))
  (func $ten (result i32) (i32.const 10))
  (elem (i32.const 0) $ten))

(register "lib" $lib)

(module $user
  (import "lib" "mem" (memory 1))
  (import "lib" "table" (table 2 funcref))
  (import "lib" "counter" (global $counter (mut i32)))
  (import "lib" "bump" (func $bump (result i32)))
  (type $int (func (result i32)))
  (func $twenty (result i32) (i32.const 20))
  (elem (i32.const 1) $twenty)
  (func (export "work") (result i32 i32 i32 i32)
    (i32.store (i32.const 8) (i32.const 1234))
    (drop (call $bump))
    (drop (call $bump))
    (global.get $counter)
    (call_indirect (type $int) (i32.const 0))
    (call_indirect (type $int) (i32.const 1))
    (i32.load (i32.const 8))))

(invoke $user "work")
(get $lib "counter")
(module
  (import "lib" "mem" (memory 1))
  (func (export "peek") (result i32) (i32.load (i32.const 8))))
(assert_unlinkable
  (module (import "lib" "bump" (func (param i32))))
  "incompatible import type")
(assert_unlinkable
  (module (import "lib" "missing" (func)))
  "unknown import")
(invoke "peek")

;; Output:
;; 2 10 20 1234
;; 2
;; Value: 1234
