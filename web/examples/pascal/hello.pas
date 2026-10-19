// Hello: ReadLn, strings and a loop over characters.
program Hello;
uses SysUtils;
var
  name: string;
  i, vowels: Integer;
begin
  Write('What is your name? ');
  ReadLn(name);
  name := Trim(name);
  if name = '' then
    name := 'stranger';
  WriteLn('Hello, ', name, '!');
  vowels := 0;
  for i := 1 to Length(name) do
    if Pos(LowerCase(name[i]), 'aeiouy') > 0 then
      Inc(vowels);
  WriteLn('In capitals: ', UpperCase(name), ', vowels: ', vowels);
end.
