;; WASI: arguments (only the program name), an empty environment, clocks,
;; random bytes; proc_exit with a non-zero code is the error "exit status".
(module
  (import "wasi_snapshot_preview1" "args_sizes_get" (func $args_sizes_get (param i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "args_get" (func $args_get (param i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "environ_sizes_get" (func $environ_sizes_get (param i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "clock_time_get" (func $clock_time_get (param i32 i64 i32) (result i32)))
  (import "wasi_snapshot_preview1" "random_get" (func $random_get (param i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "fd_write" (func $fd_write (param i32 i32 i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "proc_exit" (func $proc_exit (param i32)))
  (memory (export "memory") 1)
  (data (i32.const 300) "argc=1 env=0 clock ok random ok\n")

  (func $check (param $ok i32) (param $at i32)
    ;; A wrong one - spaces instead of the word "ok" in the string.
    (if (i32.eqz (local.get $ok))
      (then (i32.store16 (local.get $at) (i32.const 0x3f3f)))))

  (func (export "_start")
    (drop (call $args_sizes_get (i32.const 0) (i32.const 4)))
    (call $check (i32.eq (i32.load (i32.const 0)) (i32.const 1)) (i32.const 305))
    ;; argv[0] is "main" and a zero.
    (drop (call $args_get (i32.const 16) (i32.const 32)))
    (call $check (i32.eq (i32.load (i32.load (i32.const 16))) (i32.const 0x6e69616d)) (i32.const 305))
    (drop (call $environ_sizes_get (i32.const 0) (i32.const 4)))
    (call $check (i32.eqz (i32.load (i32.const 0))) (i32.const 311))
    (drop (call $clock_time_get (i32.const 0) (i64.const 1000) (i32.const 40)))
    (call $check (i64.gt_u (i64.load (i32.const 40)) (i64.const 1600000000000000000)) (i32.const 319))
    (drop (call $random_get (i32.const 48) (i32.const 64)))
    (i32.store (i32.const 0) (i32.const 300))
    (i32.store (i32.const 4) (i32.const 32))
    (drop (call $fd_write (i32.const 1) (i32.const 0) (i32.const 1) (i32.const 8)))
    (call $proc_exit (i32.const 3))
    (unreachable)))

;; Output:
;; argc=1 env=0 clock ok random ok
;; Error: exit status 3
;; Line: 33
