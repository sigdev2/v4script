var g: Integer;

procedure Swap(var a, b: Integer);
var t: Integer;
begin
  t := a; a := b; b := t;
end;

function Fact(n: Integer): Int64;
begin
  if n <= 1 then Fact := 1 else Fact := n * Fact(n - 1);
end;

function Fib(n: Integer): Integer;
begin
  if n < 2 then Exit(n);
  Result := Fib(n - 1) + Fib(n - 2);
end;

function Sum(const a: array of Integer): Integer;
var i: Integer;
begin
  Result := 0;
  for i := Low(a) to High(a) do Result := Result + a[i];
end;

function Max(a, b: Integer): Integer; overload;
begin if a > b then Result := a else Result := b; end;
function Max(a, b: Double): Double; overload;
begin if a > b then Result := a else Result := b; end;
function Max(const s1, s2: string): string; overload;
begin if s1 > s2 then Result := s1 else Result := s2; end;

procedure Outer(n: Integer);
var count: Integer;
  procedure Inner(k: Integer);
  begin
    Inc(count, k);
    if k > 1 then Inner(k - 1);
  end;
begin
  count := 0;
  Inner(n);
  WriteLn('count=', count);
end;

procedure SetGlobal(var x: Integer);
begin
  g := 5;
  WriteLn('x seen as ', x);
  x := 7;
end;

procedure Defaults(a: Integer; b: Integer = 10; c: string = 'z');
begin
  WriteLn(a, ' ', b, ' ', c);
end;

function IsEven(n: Integer): Boolean; forward;
function IsOdd(n: Integer): Boolean;
begin
  if n = 0 then IsOdd := False else IsOdd := IsEven(n - 1);
end;
function IsEven(n: Integer): Boolean;
begin
  if n = 0 then IsEven := True else IsEven := IsOdd(n - 1);
end;

var x, y: Integer; arr: array[1..5] of Integer;
begin
  x := 1; y := 2; Swap(x, y); WriteLn(x, ' ', y);
  arr[1] := 10; arr[2] := 20; Swap(arr[1], arr[2]); WriteLn(arr[1], ' ', arr[2]);
  WriteLn(Fact(20), ' ', Fib(20));
  WriteLn(Sum([1, 2, 3, 4]), ' ', Sum(arr));
  WriteLn(Max(3, 7), ' ', Max(2.5, 1.5):0:1, ' ', Max('abc', 'abd'));
  Outer(4);
  g := 1; SetGlobal(g); WriteLn('g=', g);
  Defaults(1); Defaults(1, 2); Defaults(1, 2, 'q');
  WriteLn(IsEven(10), ' ', IsOdd(7));
end.

// Output:
// 2 1
// 20 10
// 2432902008176640000 6765
// 10 30
// 7 2.5 abd
// count=10
// x seen as 5
// g=7
// 1 10 z
// 1 2 z
// 1 2 q
// TRUE TRUE
