% The eight queens: no two queens on one row, column or diagonal.
% A solution is a list of rows, one per column.
queens(N, Qs) :-
    range(1, N, Ns),
    permutation(Ns, Qs),
    safe(Qs).

range(Low, High, []) :- Low > High, !.
range(Low, High, [Low|Rest]) :- Next is Low + 1, range(Next, High, Rest).

safe([]).
safe([Q|Qs]) :- no_attack(Q, Qs, 1), safe(Qs).

no_attack(_, [], _).
no_attack(Q, [Q1|Qs], D) :-
    Q =\= Q1 + D,
    Q =\= Q1 - D,
    D1 is D + 1,
    no_attack(Q, Qs, D1).

show(Qs) :-
    length(Qs, N),
    forall(member(Q, Qs),
           ( forall(between(1, N, C), (C =:= Q -> write(' Q') ; write(' .'))), nl )).

?- once(queens(8, Qs)), show(Qs).
?- findall(Qs, queens(6, Qs), All), length(All, Count).
