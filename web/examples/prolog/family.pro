% A family tree: facts, rules and queries.
parent(anna, boris).
parent(anna, vera).
parent(boris, gleb).
parent(boris, daria).
parent(vera, egor).
parent(gleb, zoya).

female(anna). female(vera). female(daria). female(zoya).
male(boris). male(gleb). male(egor).

mother(M, C) :- parent(M, C), female(M).
grandparent(G, C) :- parent(G, P), parent(P, C).
sibling(A, B) :- parent(P, A), parent(P, B), A \= B.
cousin(A, B) :- parent(P, A), parent(Q, B), sibling(P, Q).
ancestor(A, D) :- parent(A, D).
ancestor(A, D) :- parent(A, X), ancestor(X, D).

?- mother(anna, Child).
?- grandparent(anna, Grandchild).
?- sibling(gleb, Who).
?- cousin(egor, Cousin).
?- findall(A, ancestor(A, zoya), Ancestors).
?- ancestor(egor, zoya).
