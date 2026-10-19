\ The host module "app" of the tests: words APP.<NAME> and, for a global
\ module, <NAME>; strings as address and length, numbers on the float stack.
s" Ann" greet type space 2e 3.5e app.add f. 4 is-even . counter . app.counter . cr
1e 2e point dup s" x" js-get js>n . s" y" js-get js>f f. 3 range js-length . cr
s" one" log
logged 0 js-index js>s type space 0 describe type space 1 2 2 js-array describe type cr

\ Output:
\ Hello, Ann! 5.5 -1 1 2
\ 1 2. 3
\ one nothing [1,2]
