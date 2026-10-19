// Division of floats by zero is an error, as with FPU exceptions in FPC.
uses SysUtils;
var x, y: Double;
begin
  x := 1;
  y := 0;
  try
    WriteLn(x / y);
  except
    on E: EZeroDivide do WriteLn(E.ClassName, ': ', E.Message);
  end;
  WriteLn(Sqrt(y):0:1);
  y := -1;
  WriteLn(Sqrt(y));
end.

// Output:
// EZeroDivide: Floating point division by zero
// 0.0
// Error: EInvalidOp: Invalid floating point operation
// Line: 14
