;; Numbers: i32 and i64 with overflow, signed and unsigned division and
;; remainder, shifts and rotations, bit counts, f32 and f64 floats by IEEE
;; 754, conversions with and without saturation, sign extension.
(module
  (func (export "i32ops") (result i32 i32 i32 i32 i32 i32 i32 i32)
    (i32.add (i32.const 0x7fffffff) (i32.const 1))
    (i32.mul (i32.const 0x10001) (i32.const 0x10001))
    (i32.div_s (i32.const -7) (i32.const 2))
    (i32.rem_s (i32.const -7) (i32.const 2))
    (i32.div_u (i32.const -7) (i32.const 2))
    (i32.shr_u (i32.const -8) (i32.const 33))
    (i32.rotl (i32.const 0x80000001) (i32.const 4))
    (i32.popcnt (i32.const 0xf0f0)))

  (func (export "i64ops") (result i64 i64 i64 i64 i64 i64)
    (i64.mul (i64.const 0x100000001) (i64.const 0x100000001))
    (i64.div_u (i64.const -1) (i64.const 10))
    (i64.rem_s (i64.const -9223372036854775808) (i64.const -1))
    (i64.shr_s (i64.const -9223372036854775808) (i64.const 60))
    (i64.rotr (i64.const 1) (i64.const 1))
    (i64.clz (i64.const 0xffff)))

  (func (export "compare") (result i32 i32 i32 i32)
    (i64.lt_u (i64.const -1) (i64.const 1))
    (i64.lt_s (i64.const -1) (i64.const 1))
    (i32.ge_u (i32.const -1) (i32.const 0))
    (f64.ne (f64.const nan) (f64.const nan)))

  (func (export "floats") (result f32 f32 f64 f64 f64 f64 f64)
    (f32.add (f32.const 0.1) (f32.const 0.2))
    (f32.sqrt (f32.const 2))
    (f64.add (f64.const 0.1) (f64.const 0.2))
    (f64.nearest (f64.const 2.5))
    (f64.nearest (f64.const -3.5))
    (f64.min (f64.const -0) (f64.const 0))
    (f64.copysign (f64.const 3) (f64.const -0)))

  (func (export "convert") (result i32 i32 i64 f32 f64 i32 i64)
    (i32.trunc_sat_f64_s (f64.const 1e10))
    (i32.trunc_sat_f32_u (f32.const -5))
    (i64.trunc_f64_s (f64.const -12345678901.9))
    (f32.convert_i64_u (i64.const -1))
    (f64.convert_i64_s (i64.const 0x7fffffffffffffff))
    (i32.reinterpret_f32 (f32.const -1))
    (i64.extend32_s (i64.const 0x80000000)))

  (func (export "trunc") (param f64) (result i32)
    (i32.trunc_f64_s (local.get 0))))

(invoke "i32ops")
(invoke "i64ops")
(invoke "compare")
(invoke "floats")
(invoke "convert")
(assert_trap (invoke "trunc" (f64.const 3e9)) "integer overflow")
(assert_trap (invoke "trunc" (f64.const nan)) "invalid conversion to integer")
(invoke "trunc" (f64.const -2147483648.75))

;; Output:
;; -2147483648 131073 -3 -1 2147483644 2147483644 24 8
;; 8589934593 1844674407370955161 0 -8 -9223372036854775808 48
;; 0 1 1 1
;; 0.3 1.4142135 0.30000000000000004 2 -4 -0 -3
;; 2147483647 0 -12345678901 18446744000000000000 9223372036854776000 -1082130432 -2147483648
;; Value: -2147483648
