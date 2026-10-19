uses SysUtils;
type
  EMyError = class(Exception)
    Code: Integer;
    constructor Create(ACode: Integer);
  end;

constructor EMyError.Create(ACode: Integer);
begin
  inherited CreateFmt('my error %d', [ACode]);
  Code := ACode;
end;

procedure Risky(n: Integer);
begin
  if n = 1 then raise EMyError.Create(42);
  if n = 2 then raise Exception.Create('plain');
  WriteLn('no error for ', n);
end;

function Divide(a, b: Integer): Integer;
begin
  Result := a div b;
end;

var
  i, x: Integer;
  arr: array[1..3] of Integer;
  s: string;
  p: ^Integer;
  o: TObject;
begin
  for i := 0 to 2 do
    try
      Risky(i);
    except
      on E: EMyError do WriteLn('EMyError ', E.Code, ': ', E.Message);
      on E: Exception do WriteLn(E.ClassName, ': ', E.Message);
    end;
  try
    x := Divide(1, 0);
  except
    on E: EDivByZero do WriteLn('caught ', E.ClassName, ' ', E.Message);
  end;
  try
    i := 5;
    {$R+}
    arr[i] := 1;
    {$R-}
  except
    on E: ERangeError do WriteLn('range: ', E.Message);
  end;
  try
    x := StrToInt('12a');
  except
    on E: EConvertError do WriteLn(E.Message);
  end;
  try
    try
      WriteLn('in try');
      raise Exception.Create('inner');
    finally
      WriteLn('finally runs');
    end;
  except
    on E: Exception do WriteLn('outer got ', E.Message);
  end;
  try
    p := nil;
    p^ := 1;
  except
    on E: EAccessViolation do WriteLn('AV: ', E.Message);
  end;
  try
    try
      raise EMyError.Create(7);
    except
      on E: Exception do begin
        WriteLn(E is EMyError, ' ', E.ToString);
        raise;
      end;
    end;
  except
    on E2: EMyError do WriteLn('reraised ', E2.Code);
  end;
  try
    o := TObject.Create;
    WriteLn((o as Exception).Message);
  except
    on E: EInvalidCast do WriteLn('cast: ', E.Message);
  end;
  WriteLn(IntToStr(123), ' ', IntToStr(-5), ' ', StrToIntDef('x', -1), ' ', IntToHex(255, 4), ' ', FloatToStr(0.1 + 0.2), ' ', FloatToStr(1/3));
  WriteLn(Format('%d|%5d|%-5d|%.3d|%s|%10s|%-6s|%x|%.2f|%8.3f|%e|%g|%n|%%', [42, 7, 7, 5, 'abc', 'right', 'left', 255, 3.14159, 2.5, 1234.5678, 0.5, 1234567.891]));
  WriteLn(FormatFloat('0.00', 3.14159), ' ', FormatFloat('#,##0.00', 1234567.891), ' ', FormatFloat('0.###', 2.5), ' ', FormatFloat('000', 7), ' ', FormatFloat('0.00E+00', 12345.678));
  WriteLn(Trim('  ab  '), '|', TrimLeft('  ab  '), '|', TrimRight('  ab  '), '|', UpperCase('abc'), '|', QuotedStr('it''s'));
  WriteLn(StringReplace('a-b-c', '-', '+', [rfReplaceAll]), ' ', StringReplace('A-b', 'a', 'x', [rfIgnoreCase]), ' ', CompareText('abc', 'ABD') < 0, ' ', SameText('Hello', 'HELLO'));
  WriteLn(FloatToStrF(3.14159, ffFixed, 8, 3), ' ', FloatToStrF(1234567.891, ffNumber, 10, 2), ' ', FloatToStrF(0.000123, ffExponent, 4, 2), ' ', FloatToStrF(123.456, ffGeneral, 4, 0));
  WriteLn(StrToFloat('2.5') * 2:0:1, ' ', BoolToStr(True), ' ', BoolToStr(False, True), ' ', StrToBool('true'));
  WriteLn(ExtractFileName('/a/b/c.txt'), ' ', ExtractFileExt('c.tar.gz'), ' ', ChangeFileExt('x.pas', '.pp'));
  WriteLn(FormatDateTime('yyyy-mm-dd hh:nn:ss', EncodeDate(2024, 2, 29) + EncodeTime(13, 5, 9, 0)), ' ', DayOfWeek(EncodeDate(2024, 2, 29)), ' ', IsLeapYear(2024));
  WriteLn(DateToStr(EncodeDate(2026, 10, 11)), ' ', FormatDateTime('dddd d mmmm yyyy', EncodeDate(2026, 10, 11)));
end.

// Output:
// no error for 0
// EMyError 42: my error 42
// Exception: plain
// caught EDivByZero Division by zero
// range: Range check error
// "12a" is an invalid integer
// in try
// finally runs
// outer got inner
// AV: Access violation
// TRUE EMyError: my error 7
// reraised 7
// cast: Invalid type cast
// 123 -5 -1 00FF 0.3 0.333333333333333
// 42|    7|7    |005|abc|     right|left  |FF|3.14|   2.500|1.2345678000000000E+003|0.5|1,234,567.89|%
// 3.14 1,234,567.89 2.5 007 1.23E+04
// ab|ab  |  ab|ABC|'it''s'
// a+b+c x-b TRUE TRUE
// 3.142 1,234,567.89 1.230E-04 123.5
// 5.0 -1 False TRUE
// c.txt .gz x.pp
// 2024-02-29 13:05:09 5 TRUE
// 11-10-26 Sunday 11 October 2026
