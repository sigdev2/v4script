;; Hello from WebAssembly: WASI fd_write prints a string from memory.
(module
  (import "wasi_snapshot_preview1" "fd_write"
    (func $fd_write (param i32 i32 i32 i32) (result i32)))
  (memory (export "memory") 1)
  ;; An iovec at 0: the address and the length of the text.
  (data (i32.const 0) "\10\00\00\00\18\00\00\00")
  (data (i32.const 16) "Hello from WebAssembly!\0a")
  (func (export "_start")
    ;; stdout, one iovec at 0, the count of written bytes at 8
    (drop (call $fd_write (i32.const 1) (i32.const 0) (i32.const 1) (i32.const 8)))))
