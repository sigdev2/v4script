;; JavaScript strings (externref): the module constants "'", the built-in
;; functions of wasm:js-string, the js helpers (a string from memory and
;; into memory, a method call); output through WASI.
(module
  (import "'" "Привет" (global $hello externref))
  (import "'" ", " (global $comma externref))
  (import "'" "toUpperCase" (global $upper externref))
  (import "wasm:js-string" "concat" (func $concat (param externref externref) (result externref)))
  (import "wasm:js-string" "length" (func $length (param externref) (result i32)))
  (import "wasm:js-string" "charCodeAt" (func $charCodeAt (param externref i32) (result i32)))
  (import "wasm:js-string" "substring" (func $substring (param externref i32 i32) (result externref)))
  (import "wasm:js-string" "equals" (func $equals (param externref externref) (result i32)))
  (import "js" "string" (func $fromMemory (param i32 i32) (result externref)))
  (import "js" "write_string" (func $toMemory (param externref i32 i32) (result i32)))
  (import "js" "call" (func $call0 (param externref externref) (result externref)))
  (import "wasi_snapshot_preview1" "fd_write" (func $fd_write (param i32 i32 i32 i32) (result i32)))
  (memory (export "memory") 1)
  (data (i32.const 1024) "мир")

  ;; A JavaScript string to the console as UTF-8 (through a buffer at address 64).
  (func $print (param $text externref)
    (local $bytes i32)
    (local.set $bytes (call $toMemory (local.get $text) (i32.const 64) (i32.const 900)))
    (i32.store8 (i32.add (i32.const 64) (local.get $bytes)) (i32.const 10))
    (i32.store (i32.const 0) (i32.const 64))
    (i32.store (i32.const 4) (i32.add (local.get $bytes) (i32.const 1)))
    (drop (call $fd_write (i32.const 1) (i32.const 0) (i32.const 1) (i32.const 8))))

  (func (export "main") (result i32)
    (local $text externref)
    (local.set $text
      (call $concat (call $concat (global.get $hello) (global.get $comma))
                    (call $fromMemory (i32.const 1024) (i32.const 6))))
    (call $print (local.get $text))
    (call $print (call $call0 (local.get $text) (global.get $upper)))
    (call $print (call $substring (local.get $text) (i32.const 8) (i32.const 100)))
    (i32.add
      (i32.mul (call $length (local.get $text)) (i32.const 1000))
      (i32.add (call $charCodeAt (local.get $text) (i32.const 0))
               (call $equals (global.get $hello) (call $substring (local.get $text) (i32.const 0) (i32.const 6)))))))

;; Output:
;; Привет, мир
;; ПРИВЕТ, МИР
;; мир
;; Value: 12056
