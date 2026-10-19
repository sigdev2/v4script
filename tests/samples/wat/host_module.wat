;; The host module "app" of the tests: import "app" with the names of
;; JavaScript; arguments and results follow the types of the import.
(import "app" "greet" (func $greet (param externref) (result externref)))
(import "app" "add" (func $add (param f64 f64) (result f64)))
(import "app" "isEven" (func $isEven (param i32) (result i32)))
(import "app" "counter" (func $counter (result i32)))
(import "app" "log" (func $log (param externref)))
(import "app" "logged" (func $logged (result externref)))
(import "js" "length" (func $length (param externref) (result i32)))
(import "console" "log" (func $print (param externref f64 i32 i32 i32)))
(import "'" "Ann" (global $ann externref))
(import "'" "one" (global $one externref))
(func (export "main") (result i32)
  (call $print (call $greet (global.get $ann)) (call $add (f64.const 2) (f64.const 3.5))
               (call $isEven (i32.const 4)) (call $counter) (call $counter))
  (call $log (global.get $one))
  (call $length (call $logged)))

;; Output:
;; Hello, Ann! 5.5 1 1 2
;; Value: 1
