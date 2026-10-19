// The Graph unit (BGI): a target of circles, a star and text.
program Target;
uses Graph;
var
  driver, mode, i: SmallInt;
  points: array[0..9] of PointType;
  angle, radius: Double;
begin
  driver := VGA;
  mode := VGAHi;
  InitGraph(driver, mode, '');
  SetBkColor(Black);
  ClearDevice;
  for i := 8 downto 1 do
  begin
    if Odd(i) then
      SetFillStyle(SolidFill, Red)
    else
      SetFillStyle(SolidFill, White);
    SetColor(DarkGray);
    FillEllipse(200, 240, i * 22, i * 22);
  end;
  for i := 0 to 9 do
  begin
    angle := -Pi / 2 + i * Pi / 5;
    if Odd(i) then radius := 45 else radius := 110;
    points[i].X := 480 + Round(radius * Cos(angle));
    points[i].Y := 240 + Round(radius * Sin(angle));
  end;
  SetColor(Yellow);
  SetFillStyle(SolidFill, Yellow);
  FillPoly(10, points);
  SetColor(LightCyan);
  OutTextXY(130, 440, 'A target and a star in Turbo Pascal style');
  Rectangle(10, 10, GetMaxX - 10, GetMaxY - 10);
end.
