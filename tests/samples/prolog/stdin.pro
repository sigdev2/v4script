% Standard input of the host is user_input.
?- write('Name? '), read(Name), write(hi(Name)), nl.
?- read(T), write(T), nl.
?- get_char(_), get_char(C), get_char(D), write(C-D), nl.
?- read(X), write(X), nl.

% Input:
% bob.
% next(1).
% ab
% Output:
% Name? hi(bob)
% Name = bob
% next(1)
% T = next(1)
% a-b
% C = a, D = b
% end_of_file
% X = end_of_file
