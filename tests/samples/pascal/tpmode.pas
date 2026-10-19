{$mode tp}
type
  TOp = function(a, b: Integer): Integer;
  TDays = (Mon, Tue, Wed, Thu, Fri, Sat, Sun);
  TDaySet = set of TDays;
var
  days: TDaySet; d: TDays; big: Int64; q: QWord; cs: set of Char; ch: Char;
  op: TOp; k: Integer; w: Word; b: Byte; li: LongInt;

function Fact(n: Integer): LongInt;
begin
  if n <= 1 then Fact := 1 else Fact := n * Fact(n - 1);
end;

function Add(a, b: Integer): Integer; far;
begin
  Add := a + b;
end;

function Mul(a, b: Integer): Integer; far;
begin
  Mul := a * b;
end;

procedure Swap2(var x, y: Integer);
var tmp: Integer;
begin
  tmp := x; x := y; y := tmp;
end;

function Outer(n: Integer): Integer;
var acc: Integer;
  procedure Step(i: Integer);
  begin
    acc := acc + i;
    if i > 0 then Step(i - 1);
  end;
begin
  acc := 0; Step(n); Outer := acc;
end;

var x, y: Integer;
begin
  WriteLn(Fact(10), ' ', Fact(5));
  op := Add; WriteLn(op(3, 4));
  op := Mul; WriteLn(op(3, 4));
  x := 1; y := 2; Swap2(x, y); WriteLn(x, ' ', y);
  WriteLn(Outer(10));
  days := [Mon, Wed..Fri];
  Include(days, Sun); Exclude(days, Thu);
  for d := Mon to Sun do if d in days then Write(Ord(d), ' ');
  WriteLn;
  WriteLn([Mon, Tue] <= days, ' ', [Mon] * days = [Mon], ' ', days - [Mon] = [Wed, Fri, Sun]);
  cs := ['a'..'e', 'x'];
  for ch := 'a' to 'z' do if ch in cs then Write(ch);
  WriteLn;
  big := 1; for k := 1 to 62 do big := big * 2; WriteLn(big, ' ', big - 1 + big);
  q := High(QWord); WriteLn(q, ' ', q div 3, ' ', q mod 1000);
  w := 65535; Inc(w); WriteLn(w);
  b := 200; b := b + 100; WriteLn(b);
  li := MaxLongInt; WriteLn(li, ' ', -li - 1);
  k := 32000; WriteLn(k + k, ' ', LongInt(k) * 3);
  WriteLn(7 div 2, ' ', -7 div 2, ' ', -7 mod 2, ' ', 7 mod -2);
  WriteLn(5 shl 3, ' ', -16 shr 2, ' ', $FF and $0F, ' ', not 0);
end.

// Output:
// 3628800 120
// 7
// 12
// 2 1
// 55
// 0 2 4 6
// FALSE TRUE TRUE
// abcdex
// 4611686018427387904 9223372036854775807
// 18446744073709551615 6148914691236517205 615
// 0
// 44
// 2147483647 -2147483648
// 64000 96000
// 3 -3 -1 1
// 40 4611686018427387900 15 -1
