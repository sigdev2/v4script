// The towers of Hanoi: recursion with a counter of moves.
program Hanoi;
var
  moves: Integer;

procedure Move(disks: Integer; source, target, spare: Char);
begin
  if disks = 0 then
    Exit;
  Move(disks - 1, source, spare, target);
  Inc(moves);
  WriteLn(moves:3, ': disk ', disks, ' from ', source, ' to ', target);
  Move(disks - 1, spare, target, source);
end;

begin
  moves := 0;
  Move(4, 'A', 'C', 'B');
  WriteLn('4 disks need ', moves, ' moves; 64 disks would need ', High(QWord), '.');
end.
