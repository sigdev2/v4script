{$goto on}
label 10, 20, done;
var i, j, n: Integer; s: string; f: Text; line: string; total: Int64; x: Double;

procedure Search;
label found;
var a, b: Integer;
begin
  for a := 1 to 5 do
    for b := 1 to 5 do
      if a * b = 12 then goto found;
  WriteLn('not found');
  Exit;
found:
  WriteLn('found ', a, '*', b);
end;

function Collatz(n: Int64): Integer;
begin
  Result := 0;
  while n <> 1 do begin
    if Odd(n) then n := 3 * n + 1 else n := n div 2;
    Inc(Result);
  end;
end;

begin
  i := 0;
10:
  Inc(i);
  if i < 3 then goto 10;
  WriteLn('i=', i);
  n := 0;
  for i := 1 to 10 do begin
    if i mod 2 = 0 then Continue;
    if i > 7 then Break;
    n := n + i;
  end;
  WriteLn('n=', n);
  j := 0;
  repeat
    Inc(j);
    if j = 3 then Continue;
    if j = 6 then Break;
    Write(j, ' ');
  until j > 10;
  WriteLn;
  Search;
  s := 'banana';
  case s of
    'apple': WriteLn('fruit 1');
    'banana', 'cherry': WriteLn('fruit 2');
  else WriteLn('unknown');
  end;
  for line in ['x', 'yy'] do ;
  n := 0;
  for i := 1 to 3 do
    for j := 1 to 3 do begin
      if j = 2 then Continue;
      if i = 3 then Break;
      Inc(n, i * j);
    end;
  WriteLn('n=', n);
  Assign(f, 'data.txt');
  Rewrite(f);
  WriteLn(f, 'first line');
  WriteLn(f, 10, ' ', 20, ' ', 30);
  Write(f, 'last');
  Close(f);
  Reset(f);
  ReadLn(f, line); WriteLn('[', line, ']');
  total := 0;
  while not Eoln(f) do begin Read(f, i); total := total + i; end;
  ReadLn(f);
  ReadLn(f, line);
  WriteLn('total=', total, ' last=[', line, '] eof=', Eof(f));
  Close(f);
  WriteLn(Collatz(27), ' ', Collatz(837799));
  total := 1;
  for i := 1 to 25 do total := total * i;
  WriteLn(total, ' ', total mod 1000000007, ' ', total div 1000000);
  total := -9223372036854775807 - 1;
  WriteLn(total, ' ', total + 1, ' ', -(total + 1));

  goto done;
  WriteLn('skipped');
done:
  WriteLn('end');
end.

// Output:
// i=3
// n=16
// 1 2 4 5
// found 3*4
// fruit 2
// n=12
// [first line]
// total=60 last=[last] eof=TRUE
// 111 524
// 7034535277573963776 332217180 7034535277573
// -9223372036854775808 -9223372036854775807 9223372036854775807
// end
