// An unhandled exception: the class, the text and the line of raise.
uses SysUtils;
type
  EMyError = class(Exception);

procedure Check(n: Integer);
begin
  if n > 2 then
    raise EMyError.CreateFmt('too big: %d', [n]);
  WriteLn('ok ', n);
end;

var i: Integer;
begin
  for i := 1 to 5 do
    Check(i);
end.

// Output:
// ok 1
// ok 2
// Error: EMyError: too big: 3
// Line: 9
