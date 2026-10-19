% The host module "app" of the tests: predicates of the library app, the
% result as the last argument.
?- greet('Ann', G), app:add(2, 3.5, S), is_even(4, E), counter(A), counter(B),
   write(G-S-E-A-B), nl.
?- point(1, 2, P), get_prop(P, x, X), range(3, R), write(X-R), nl.
?- log(one), logged(L), describe(D), write(L-D), nl.

% Output:
% Hello, Ann!-5.5-true-1-2
% G = 'Hello, Ann!', S = 5.5, E = true, A = 1, B = 2
% 1-[0,1,2]
% P = <javascript>(object), X = 1, R = [0,1,2]
% [one]-nothing
% L = [one], D = nothing
