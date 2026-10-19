// Standard input of the host: Read, ReadLn, Eof and Crt.ReadKey.
uses Crt;
var
  name, line: String;
  a, b: Integer;
begin
  Write('Name? ');
  ReadLn(name);
  WriteLn('Hi ', name);
  Read(a, b);
  WriteLn(a + b);
  ReadLn(line);
  WriteLn('[', line, ']');
  WriteLn(Ord(ReadKey), ' ', KeyPressed);
  while not Eof do
  begin
    ReadLn(line);
    WriteLn('line: ', line);
  end;
  WriteLn(Eof);
end.

// Input:
// Bob
// 3
// 4 rest
// xy
// z
// Output:
// Name? Hi Bob
// 7
// [ rest]
// 120 TRUE
// line: y
// line: z
// TRUE
