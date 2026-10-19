\ Floats: the float stack, output, functions, variables and constants.
1e f. 2.5e f. -1.5e f. 0e f. 1e 3e f/ f. cr
3.14159e 2e f* f. 10e fsqrt f. 2e 10e f** f. cr
1.5e fs. 12345.678e fe. 1e-3 fs. cr
1e10 f. 1e15 f. 123.456e f. 0.001e f. cr
2e fdup f* f. 3e 4e fswap f- f. 1e 2e fover f+ f+ f. cr
1e 2e f< . 2e 1e f< . 1e 1e f= . 0e f0= . -1e f0< . cr
3.7e floor f. -3.7e floor f. 2.5e fround f. 3.5e fround f. -2.5e fround f. cr
7 s>f 2e f/ f. 7.9e f>s . 1234567. d>f f. 3.99e f>d d. cr
fvariable fx 2.5e fx f! fx f@ f. cr
3e fconstant three three three f* f. cr
pi f. 0e fsin f. 0e fcos f. 1e fexp f. 1e fln f. 100e flog f. cr
s" 3.25" >float . f. s" 1e5" >float . f. s" abc" >float . cr
: fsum ( n -- ) ( F: -- r ) 0e 0 ?do i s>f f+ loop ;
100 fsum f. cr
: hyp ( F: a b -- c ) fdup f* fswap fdup f* f+ fsqrt ;
3e 4e hyp f. cr
1e fdepth . fdrop fdepth . cr
6 set-precision 1e 3e f/ f. precision . 15 set-precision cr
2e 0.5e f** f. -8e fabs f. 5e 3e fmax f. 5e 3e fmin f. cr
1e 2e 3e frot f. f. f. cr
1e 1.0000001e 1e-6 f~ . 1e 2e 0e f~ . cr
2e fnegate f. 0.5e fasin f. 1e fatan f. 1e 1e fatan2 f. cr

\ Output:
\ 1. 2.5 -1.5 0. 0.333333333333333
\ 6.28318 3.16227766016838 1024.
\ 1.50000000000000E0 12.3456780000000E3 1.00000000000000E-3
\ 10000000000. 1000000000000000. 123.456 0.001
\ 4. 1. 4.
\ -1 0 -1 -1 -1
\ 3. -4. 2. 4. -2.
\ 3.5 7 1234567. 3
\ 2.5
\ 9.
\ 3.14159265358979 0. 1. 2.71828182845905 0. 2.
\ -1 3.25 -1 100000. 0
\ 4950.
\ 5.
\ 1 0
\ 0.333333 6
\ 1.4142135623731 8. 5. 3.
\ 1. 3. 2.
\ -1 0
\ -2. 0.523598775598299 0.785398163397448 0.785398163397448
