function Depth(n: Integer): Integer;
begin
  Result := Depth(n + 1) + 1;
end;

begin
  WriteLn(Depth(0));
end.

// Error: Stack overflow
