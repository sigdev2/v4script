;; Linear memory: loads and stores of all widths (little-endian, without
;; alignment), growth, bulk operations and passive segments.
(module
  (memory (export "memory") 1 4)
  (data (i32.const 0) "\01\02\03\04\05\06\07\08\ff\fe")
  (data $tail "WebAssembly")

  (func (export "loads") (result i32 i32 i32 i64 i64)
    (i32.load (i32.const 0))
    (i32.load16_s offset=8 (i32.const 0))
    (i32.load8_u (i32.const 9))
    (i64.load (i32.const 1))
    (i64.load32_u offset=6 (i32.const 0)))

  (func (export "stores") (result i64 f32 f64)
    (i64.store (i32.const 101) (i64.const -2))
    (i32.store16 (i32.const 200) (i32.const 0x12345))
    (f32.store (i32.const 300) (f32.const 1.5))
    (f64.store (i32.const 403) (f64.const -0.25))
    (i64.add (i64.load (i32.const 101)) (i64.load16_u (i32.const 200)))
    (f32.load (i32.const 300))
    (f64.load (i32.const 403)))

  (func (export "grow") (result i32 i32 i32 i32)
    (memory.grow (i32.const 2))
    (memory.size)
    (memory.grow (i32.const 5))
    (memory.size))

  (func (export "bulk") (result i32 i32 i64)
    (memory.fill (i32.const 1000) (i32.const 0x41) (i32.const 3))
    (memory.copy (i32.const 1001) (i32.const 0) (i32.const 2))
    (memory.init $tail (i32.const 2000) (i32.const 4) (i32.const 7))
    (data.drop $tail)
    (i32.load (i32.const 1000))
    (i32.load8_u (i32.const 2000))
    (i64.load (i32.const 2000)))

  (func (export "edge") (param $at i32) (result i32)
    (i32.load8_u (local.get $at))))

(invoke "loads")
(invoke "stores")
(invoke "grow")
(invoke "bulk")
(assert_return (invoke "edge" (i32.const 65535)) (i32.const 0))
(assert_trap (invoke "edge" (i32.const -1)) "out of bounds memory access")
(invoke "edge" (i32.const 0x2ffff))

;; Output:
;; 67305985 -257 254 -69798071788895486 4278126599
;; 9027 1.5 -0.25
;; 1 3 -1 3
;; 131393 115 34177642179949427
;; Value: 0
