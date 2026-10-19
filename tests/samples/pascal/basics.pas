program Basics;
const
  N = 10;
  Greeting = 'Hello';
  Ratio = 2.5;
type
  TColor = (Red, Green, Blue);
  TDigit = 0..9;
var
  i, j, total: Integer;
  b: Byte;
  w: Word;
  c: Char;
  ok: Boolean;
  color: TColor;
  d: TDigit;
  x: Double;
  s: Single;
  big: Int64;
  q: QWord;
begin
  total := 0;
  for i := 1 to N do
    if Odd(i) then total := total + i else total := total - 1;
  WriteLn(Greeting, ', world! total=', total);
  i := 0;
  while i < 5 do begin Inc(i, 2); end;
  WriteLn('i=', i);
  repeat Dec(i) until i <= 0;
  WriteLn('i=', i);
  b := 250; b := b + 10; WriteLn('b=', b);
  w := 65535; Inc(w); WriteLn('w=', w);
  c := 'A'; Inc(c, 2); WriteLn('c=', c, ' ord=', Ord(c), ' chr=', Chr(97), ' succ=', Succ(c), ' pred=', Pred('b'));
  ok := (i = 0) and not (total > 100);
  WriteLn('ok=', ok, ' ', not ok, ' ', ok xor True);
  color := Green; WriteLn('color=', color, ' ', Ord(color), ' ', Succ(color), ' ', High(TColor), ' ', Low(TColor));
  for color := Red to Blue do Write(color, ' ');
  WriteLn;
  d := 7; WriteLn('d=', d, ' high=', High(TDigit), ' size=', SizeOf(TDigit));
  x := Ratio * 3; WriteLn('x=', x:0:3, ' ', x);
  s := 1/3; WriteLn('s=', s, ' ', s:8:4);
  big := 1 shl 40; WriteLn('big=', big, ' ', big * 1000, ' ', -big div 3);
  q := High(QWord); WriteLn('q=', q, ' ', q div 10);
  big := High(Int64); WriteLn(big, ' ', big + 1);
  WriteLn(MaxInt, ' ', MaxLongInt, ' ', High(Integer), ' ', Low(Integer), ' ', High(Byte));
  WriteLn(7 div 2, ' ', -7 div 2, ' ', 7 mod 3, ' ', -7 mod 3, ' ', 7 mod -3);
  WriteLn(Abs(-5), ' ', Abs(-2.5):0:1, ' ', Sqr(7), ' ', Sqrt(16):0:1, ' ', Round(2.5), ' ', Round(3.5), ' ', Trunc(-3.7));
  WriteLn(1 shl 3, ' ', 256 shr 2, ' ', $FF and $0F, ' ', 5 or 2, ' ', 6 xor 3, ' ', not 0);
  j := 12; WriteLn(j shl 30, ' ', j shr 1, ' ', -j shr 28);
  WriteLn('pi=', Pi:0:6, ' e=', Exp(1):0:6, ' ln=', Ln(10):0:4, ' sin=', Sin(Pi/2):0:2);
  WriteLn('[', 'abc':6, '|', 42:5, '|', True:6, '|', 3.14159:8:2, '|', 'x':3, ']');
  WriteLn(1e10:0:0, ' ', 123456789.123:0:3, ' ', 0.001:0:5, ' ', -0.5:6:2);
end.

// Output:
// Hello, world! total=20
// i=6
// i=0
// b=4
// w=0
// c=C ord=67 chr=a succ=D pred=a
// ok=TRUE FALSE FALSE
// color=Green 1 Blue Blue Red
// Red Green Blue
// d=7 high=9 size=1
// x=7.500  7.5000000000000000E+000
// s= 3.333333433E-01   0.3333
// big=1099511627776 1099511627776000 -366503875925
// q=18446744073709551615 1844674407370955161
// 9223372036854775807 -9223372036854775808
// 2147483647 2147483647 2147483647 -2147483648 255
// 3 -3 1 -1 1
// 5 2.5 49 4.0 2 4 -3
// 8 64 15 7 5 -1
// 0 6 68719476735
// pi=3.141593 e=2.718282 ln=2.3026 sin=1.00
// [   abc|   42|  TRUE|    3.14|  x]
// 10000000000 123456789.123 0.00100  -0.50
