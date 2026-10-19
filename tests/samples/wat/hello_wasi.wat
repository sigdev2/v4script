;; A WASI program as a compiler produces it: memory, fd_write to stdout, _start.
(module
  (import "wasi_snapshot_preview1" "fd_write"
    (func $fd_write (param i32 i32 i32 i32) (result i32)))
  (memory (export "memory") 1)
  (data (i32.const 64) "Привет, WebAssembly!\n")
  (data (i32.const 128) "second ")
  (data (i32.const 136) "line\n")

  ;; The string (address, length) as one I/O vector at address 0.
  (func $write (param $at i32) (param $length i32)
    (i32.store (i32.const 0) (local.get $at))
    (i32.store (i32.const 4) (local.get $length))
    (drop (call $fd_write (i32.const 1) (i32.const 0) (i32.const 1) (i32.const 16))))

  (func (export "_start")
    (call $write (i32.const 64) (i32.const 27))
    ;; Two pieces of one string.
    (call $write (i32.const 128) (i32.const 7))
    (call $write (i32.const 136) (i32.const 5))))

;; Output:
;; Привет, WebAssembly!
;; second line
