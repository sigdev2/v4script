% The towers of Hanoi: move N disks from the left peg to the right one.
hanoi(0, _, _, _) :- !.
hanoi(N, From, To, Via) :-
    M is N - 1,
    hanoi(M, From, Via, To),
    write('Move disk '), write(N),
    write(' from '), write(From), write(' to '), write(To), nl,
    hanoi(M, Via, To, From).

?- hanoi(3, left, right, middle).
?- N = 10, Moves is 2 ^ N - 1.
