// Delay really waits: the unit goes on by a timer, the output stays in order.
uses Crt, SysUtils;

procedure Countdown(n: Integer);
var i: Integer;
begin
  for i := n downto 1 do begin
    WriteLn('tick ', i);
    Delay(20);
  end;
end;

var started: QWord;
begin
  started := GetTickCount64;
  Countdown(3);
  Sleep(10);
  WriteLn('done ', GetTickCount64 - started >= 60, ' x=', WhereX);
end.

// Output:
// tick 3
// tick 2
// tick 1
// done TRUE x=1
