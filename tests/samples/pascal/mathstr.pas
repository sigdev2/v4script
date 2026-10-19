uses SysUtils, Math, StrUtils;
var a: array[0..4] of Double = (3.5, 1.25, 9.0, -2.0, 4.0);
    ints: array[1..4] of Integer = (5, 3, 8, 1);
    parts: TStringArray;
    i: Integer;
    q, r: LongInt;
begin
  WriteLn(Min(3, 7), ' ', Max(3, 7), ' ', Min(2.5, 3.5):0:2, ' ', Max(Int64(10), 20));
  WriteLn(Power(2, 10):0:0, ' ', Power(2.5, 2):0:4, ' ', IntPower(3, 4):0:0, ' ', Power(9, 0.5):0:3);
  WriteLn(Ceil(2.1), ' ', Floor(-2.1), ' ', Ceil(-2.9), ' ', Floor(2.9));
  WriteLn(Log10(1000):0:4, ' ', Log2(8):0:4, ' ', LogN(3, 81):0:4, ' ', Hypot(3, 4):0:2);
  WriteLn(ArcTan2(1, 1):0:6, ' ', ArcSin(1):0:6, ' ', Tan(Pi/4):0:6, ' ', DegToRad(180):0:6, ' ', RadToDeg(Pi):0:2);
  WriteLn(Sign(-5), ' ', Sign(0), ' ', Sign(3.2), ' ', InRange(5, 1, 10), ' ', EnsureRange(15, 1, 10), ' ', IsNan(NaN), ' ', IsInfinite(Infinity));
  WriteLn(Sum(a):0:3, ' ', Mean(a):0:3, ' ', MinValue(a):0:2, ' ', MaxValue(a):0:2, ' ', StdDev(a):0:4, ' ', Variance(a):0:4);
  WriteLn(SumInt(ints), ' ', MinIntValue(ints), ' ', MaxIntValue(ints), ' ', Mean(ints):0:2);
  WriteLn(RoundTo(1234.5678, 2):0:2, ' ', RoundTo(1234.5678, -2):0:4, ' ', SimpleRoundTo(2.345):0:3);
  DivMod(17, 5, q, r); WriteLn(q, ' ', r);
  WriteLn(2 ** 10, ' ', CompareValue(1, 2), ' ', SameValue(0.1 + 0.2, 0.3));
  WriteLn(ReverseString('hello'), ' ', DupeString('ab', 3), ' ', LeftStr('abcdef', 2), ' ', RightStr('abcdef', 2), ' ', MidStr('abcdef', 2, 3));
  WriteLn(PosEx('a', 'banana', 3), ' ', RPos('a', 'banana'), ' ', NPos('a', 'banana', 2), ' ', AnsiContainsText('Hello', 'ELL'), ' ', StartsStr('ab', 'abc'), ' ', EndsText('C', 'abc'));
  WriteLn(ReplaceStr('a.b.c', '.', '::'), ' ', IndexStr('b', ['a', 'b', 'c']), ' ', MatchText('B', ['a', 'b']), ' ', IfThen(True, 'yes', 'no'));
  WriteLn('[', PadLeft('7', 3), '][', PadRight('7', 3), '][', PadCenter('ab', 6), '][', AddChar('0', '42', 5), ']');
  WriteLn(DelSpace(' a b c '), '|', DelSpace1('a   b  c'), '|', Copy2Symb('key=value', '='), '|', WordCount('one two  three', [' ']), '|', ExtractWord(2, 'one two three', [' ']));
  parts := SplitString('a,b,,c', ',');
  for i := 0 to High(parts) do Write('[', parts[i], ']');
  WriteLn(' ', Length(parts));
  WriteLn(IntToBin(10, 8), ' ', IntToRoman(1994), ' ', RomanToInt('MCMXCIV'), ' ', Hex2Dec('FF'), ' ', Dec2Numb(255, 4, 16), ' ', Numb2Dec('777', 8));
end.

// Output:
// 3 7 2.50 20
// 1024 6.2500 81 3.000
// 3 -3 -2 2
// 3.0000 3.0000 4.0000 5.00
// 0.785398 1.570796 1.000000 3.141593 180.00
// -1 0 1 TRUE 10 TRUE TRUE
// 15.750 3.150 -2.00 9.00 4.0373 16.3000
// 17 1 8 4.25
// 1200.00 1234.5700 2.350
// 3 2
// 1024 -1 TRUE
// olleh ababab ab ef bcd
// 4 6 4 TRUE TRUE TRUE
// a::b::c 1 TRUE yes
// [  7][7  ][  ab  ][00042]
// abc|a b c|key|3|two
// [a][b][][c] 4
// 00001010 MCMXCIV 1994 255 00FF 511
