;; A binary module (as a .wasm from a compiler) right in a unit: the bytes
;; as strings with \hh. Here it exports mul (i64) and the memory.
(module $bin binary
  "\00\61\73\6d\01\00\00\00"
  "\01\07\01\60\02\7e\7e\01\7e"
  "\03\02\01\00"
  "\05\03\01\00\01"
  "\07\0d\02\03\6d\75\6c\00\00\03\6d\65\6d\02\00"
  "\0a\09\01\07\00\20\00\20\01\7e\0b"
  "\0b\08\01\00\41\00\0b\02\68\69")

(invoke "mul" (i64.const 4294967296) (i64.const 3))
(assert_return (invoke "mul" (i64.const -2) (i64.const 21)) (i64.const -42))
(module
  (import "bin" "mem" (memory 1))
  (func (export "first") (result i32) (i32.load16_u (i32.const 0))))
(invoke "first")

;; Output:
;; 12884901888
;; Value: 26984
