type
  TPoint = record
    X, Y: Integer;
  end;
  TPerson = record
    Name: string;
    Age: Byte;
    Pos: TPoint;
    Tags: array[1..3] of string;
  end;
  TMatrix = array[1..3, 1..3] of Integer;
  TCharSet = set of Char;
  TDays = (Mon, Tue, Wed, Thu, Fri, Sat, Sun);
  TDaySet = set of TDays;
  PNode = ^TNode;
  TNode = record
    Value: Integer;
    Next: PNode;
  end;
const
  Origin: TPoint = (X: 0; Y: 0);
  Primes: array[1..5] of Integer = (2, 3, 5, 7, 11);
  Weekend: TDaySet = [Sat, Sun];

procedure Move(var p: TPoint; dx, dy: Integer);
begin
  p.X := p.X + dx; p.Y := p.Y + dy;
end;

function Add(a, b: TPoint): TPoint;
begin
  Result.X := a.X + b.X; Result.Y := a.Y + b.Y;
end;

procedure Modify(p: TPoint);
begin
  p.X := 999;
end;

var
  p, q: TPoint;
  person, other: TPerson;
  m: TMatrix;
  i, j, k: Integer;
  cs: TCharSet;
  days: TDaySet;
  d: TDays;
  dyn: array of Integer;
  grid: array of array of Integer;
  head, node: PNode;
  pi: ^Integer;
  n: Integer;
  letters: array['a'..'e'] of Integer;
  c: Char;
begin
  p.X := 1; p.Y := 2; q := p; q.X := 10;
  WriteLn(p.X, ' ', p.Y, ' ', q.X, ' ', q.Y);
  Move(p, 5, 5); WriteLn(p.X, ' ', p.Y);
  q := Add(p, Origin); WriteLn(q.X, ' ', q.Y);
  Modify(p); WriteLn(p.X);
  person.Name := 'Ann'; person.Age := 30; person.Pos := p; person.Tags[2] := 'x';
  other := person; other.Pos.X := -1; other.Tags[2] := 'y';
  WriteLn(person.Name, ' ', person.Age, ' ', person.Pos.X, ' ', other.Pos.X, ' ', person.Tags[2], other.Tags[2]);
  with person do begin Name := 'Bob'; Age := Age + 1; WriteLn(Name, ' ', Age, ' ', Pos.Y); end;
  for i := 1 to 3 do for j := 1 to 3 do m[i, j] := i * 10 + j;
  WriteLn(m[2, 3], ' ', m[3][1], ' ', SizeOf(m), ' ', Length(m), ' ', High(m));
  k := 0; for i := Low(Primes) to High(Primes) do k := k + Primes[i]; WriteLn('primes sum ', k);
  cs := ['a'..'f', 'x']; Include(cs, 'z'); Exclude(cs, 'b');
  for c := 'a' to 'z' do if c in cs then Write(c);
  WriteLn;
  days := [Mon, Wed] + Weekend; WriteLn(Sat in days, ' ', Tue in days, ' ', Weekend <= days, ' ', days = Weekend);
  for d in days do Write(Ord(d), ' ');
  WriteLn;
  days := days - [Mon] * days; WriteLn(Mon in days, ' ', Wed in days);
  SetLength(dyn, 5); for i := 0 to High(dyn) do dyn[i] := i * i;
  SetLength(dyn, 7); WriteLn(Length(dyn), ' ', dyn[4], ' ', dyn[6]);
  SetLength(grid, 3, 4); grid[2, 3] := 42; WriteLn(Length(grid), ' ', Length(grid[0]), ' ', grid[2][3]);
  head := nil;
  for i := 1 to 5 do begin New(node); node^.Value := i * i; node^.Next := head; head := node; end;
  node := head; n := 0;
  while node <> nil do begin Write(node^.Value, ' '); Inc(n); node := node^.Next; end;
  WriteLn('(', n, ')');
  New(pi); pi^ := 77; WriteLn(pi^); Dispose(pi);
  pi := @k; pi^ := 5; WriteLn('k=', k);
  for c := 'a' to 'e' do letters[c] := Ord(c) - 96;
  WriteLn(letters['c'], ' ', Low(letters), ' ', High(letters));
  for i in Primes do Write(i, ',');
  WriteLn;
  case k of
    1..4: WriteLn('small');
    5, 6: WriteLn('five or six');
  else
    WriteLn('big');
  end;
  case 'q' of 'a'..'m': WriteLn('first'); 'n'..'z': WriteLn('second'); end;
end.

// Output:
// 1 2 10 2
// 6 7
// 6 7
// 6
// Ann 30 6 -1 xy
// Bob 31 7
// 23 31 36 3 3
// primes sum 28
// acdefxz
// TRUE FALSE TRUE FALSE
// 0 2 5 6
// FALSE TRUE
// 7 16 0
// 3 4 42
// 25 16 9 4 1 (5)
// 77
// k=5
// 3 a e
// 2,3,5,7,11,
// five or six
// second
