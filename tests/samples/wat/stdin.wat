;; Standard input of the host through WASI: fd_read gives the bytes of
;; the next line; 0 bytes at the end of input.
(import "wasi_snapshot_preview1" "fd_read" (func $fd_read (param i32 i32 i32 i32) (result i32)))
(import "wasi_snapshot_preview1" "fd_write" (func $fd_write (param i32 i32 i32 i32) (result i32)))
(memory 1)
;; Copies standard input to standard output; returns the number of reads.
(func (export "main") (result i32) (local $reads i32)
  (block $done
    (loop $next
      (i32.store (i32.const 0) (i32.const 100))
      (i32.store (i32.const 4) (i32.const 64))
      (drop (call $fd_read (i32.const 0) (i32.const 0) (i32.const 1) (i32.const 8)))
      (br_if $done (i32.eqz (i32.load (i32.const 8))))
      (local.set $reads (i32.add (local.get $reads) (i32.const 1)))
      (i32.store (i32.const 4) (i32.load (i32.const 8)))
      (drop (call $fd_write (i32.const 1) (i32.const 0) (i32.const 1) (i32.const 12)))
      (br $next)))
  (local.get $reads))

;; Input:
;; first line
;; second
;; Output:
;; first line
;; second
;; Value: 2
