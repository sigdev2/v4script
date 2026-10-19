// Records and arrays: a table of results, sorted and formatted.
program Results;
uses SysUtils;
type
  TRunner = record
    Name: string[12];
    Seconds: Double;
  end;
const
  Count = 5;
var
  runners: array[1..Count] of TRunner;
  i, j: Integer;
  t: TRunner;
  total: Double;

procedure Add(index: Integer; const name: string; seconds: Double);
begin
  runners[index].Name := name;
  runners[index].Seconds := seconds;
end;

begin
  Add(1, 'Olga', 61.42);
  Add(2, 'Ivan', 58.90);
  Add(3, 'Maria', 60.05);
  Add(4, 'Pavel', 63.70);
  Add(5, 'Nina', 59.33);
  for i := 1 to Count - 1 do
    for j := Count downto i + 1 do
      if runners[j].Seconds < runners[j - 1].Seconds then
      begin
        t := runners[j];
        runners[j] := runners[j - 1];
        runners[j - 1] := t;
      end;
  total := 0;
  for i := 1 to Count do
  begin
    WriteLn(Format('%2d. %-8s %6.2f s', [i, runners[i].Name, runners[i].Seconds]));
    total := total + runners[i].Seconds;
  end;
  WriteLn(Format('Average: %.2f s, the winner is %.2f s ahead', [total / Count, runners[2].Seconds - runners[1].Seconds]));
end.
