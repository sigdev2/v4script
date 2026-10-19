// An array index is always checked (FPC checks it only with {$R+}).
var
  a: array[1..5] of Integer;
  i: Integer;
begin
  for i := 1 to 5 do
    a[i] := i * i;
  WriteLn(a[5]);
  i := 6;
  a[i] := 0;
end.

// Output:
// 25
// Error: Runtime error 201: Range check error
// Line: 10
