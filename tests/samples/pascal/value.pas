// The last expression of a unit is its value.
function Fib(n: Integer): Int64;
var a, b, t: Int64; i: Integer;
begin
  a := 0; b := 1;
  for i := 1 to n do begin t := a + b; a := b; b := t; end;
  Result := a;
end;

Fib(90)

// Value: 2880067194370816120
