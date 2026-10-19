var s, t: string; c: Char; i, code: Integer; r: Double; sh: string[5]; p: Integer;
begin
  s := 'Hello, World';
  WriteLn(Length(s), ' ', s[1], ' ', s[Length(s)], ' ', Copy(s, 8, 5), ' ', Pos('World', s), ' ', Pos('x', s));
  t := s; t[1] := 'J'; WriteLn(s, ' / ', t);
  Delete(t, 1, 7); WriteLn('[', t, ']');
  Insert('Big ', t, 1); WriteLn('[', t, ']');
  WriteLn(UpCase('a'), ' ', UpCase('hello'), ' ', LowerCase('ABC'), ' ', Concat('a', 'b', 'c'));
  s := ''; for c := 'a' to 'e' do s := s + c; WriteLn(s, ' ', Length(s));
  s := 'abc' + #13#10 + 'x'; WriteLn(Length(s), ' ', Ord(s[4]));
  Str(42, s); WriteLn('[', s, ']');
  Str(3.14159:0:2, s); WriteLn('[', s, ']');
  Str(-7:5, s); WriteLn('[', s, ']');
  Val('123', i, code); WriteLn(i, ' ', code);
  Val('12x3', i, code); WriteLn(i, ' ', code);
  Val('2.5e2', r, code); WriteLn(r:0:1, ' ', code);
  sh := 'abcdefgh'; WriteLn(sh, ' ', Length(sh));
  s := StringOfChar('*', 5); WriteLn(s);
  s := 'Привет'; WriteLn(s, ' ', Length(s));
  if 'abc' < 'abd' then WriteLn('less');
  if 'b' > 'abc' then WriteLn('greater');
  s := 'one two three'; p := Pos(' ', s); WriteLn(Copy(s, 1, p - 1), '|', Copy(s, p + 1, 100));
  c := s[1]; if c in ['a'..'z'] then WriteLn('lower ', c);
  WriteLn(Ord('A'), ' ', Chr(66), ' ', #67, ' ', 'It''s');
  s := 'test'; SetLength(s, 2); WriteLn(s);
  for i := Length('abc') downto 1 do Write('abc'[i]);
  WriteLn;
end.

// Output:
// 12 H d World 8 0
// Hello, World / Jello, World
// [World]
// [Big World]
// A HELLO abc abc
// abcde 5
// 6 13
// [42]
// [3.14]
// [   -7]
// 123 0
// 0 3
// 250.0 0
// abcde 5
// *****
// Привет 12
// less
// greater
// one|two three
// lower o
// 65 B C It's
// te
// cba
