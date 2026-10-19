\ Recursion and loops: factorials, Fibonacci numbers, the greatest
\ common divisor. A cell has 64 bits.
: factorial ( n -- n! )  dup 1 > if dup 1- recurse * else drop 1 then ;
: fib ( n -- f )  0 1 rot 0 ?do tuck + loop drop ;
: gcd ( a b -- d )  begin ?dup while tuck mod repeat ;

\ Loops are compiled: they live inside definitions.
: factorials ( n -- )  1+ 1 do i 2 .r ." ! = " i factorial . cr loop ;
: fibs ( n -- )  0 do i fib . loop ;

." Factorials:" cr 20 factorials
." Fibonacci: " 15 fibs cr
." gcd(462, 1071) = " 462 1071 gcd . cr
." lcm(12, 18) = " 12 18 2dup * -rot gcd / . cr
