% Lists: recursion over a list, and a relation used in both directions.
my_length([], 0).
my_length([_|T], N) :- my_length(T, M), N is M + 1.

my_append([], L, L).
my_append([H|T], L, [H|R]) :- my_append(T, L, R).

my_reverse(L, R) :- my_reverse(L, [], R).
my_reverse([], Acc, Acc).
my_reverse([H|T], Acc, R) :- my_reverse(T, [H|Acc], R).

?- my_length([a, b, c, d], N).
?- my_append([1, 2], [3, 4], L).
?- my_append(Front, Back, [1, 2, 3]).
?- my_reverse([1, 2, 3, 4, 5], R).
?- msort([banana, apple, cherry], Sorted).
