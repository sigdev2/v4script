// BGI graphics: checksums of the screen after each figure (every third pixel
// of every third row). Lines, fills, polygons and XOR match Free Pascal 3.2.2
// (ptcgraph); curves and text are drawn by our own rasterizer and font.
program GTest;
uses Graph;
var gd, gm: SmallInt;

procedure Report(const name: string);
var x, y: Integer; sum, count: Int64; c: LongWord;
begin
  sum := 0; count := 0;
  y := 0;
  while y <= GetMaxY do begin
    x := 0;
    while x <= GetMaxX do begin
      c := GetPixel(x, y);
      if c <> 0 then begin
        Inc(count);
        sum := (sum + Int64(c) * (x * 7 + y * 13 + 1)) mod 2147483647;
      end;
      Inc(x, 3);
    end;
    Inc(y, 3);
  end;
  WriteLn(name, ' ', count, ' ', sum);
  ClearDevice;
end;

const
  Tri: array[1..4] of PointType = ((X: 100; Y: 100), (X: 300; Y: 150), (X: 150; Y: 300), (X: 100; Y: 100));
  Star: array[1..6] of PointType = ((X: 320; Y: 50), (X: 400; Y: 300), (X: 200; Y: 140), (X: 440; Y: 140), (X: 240; Y: 300), (X: 320; Y: 50));
var i: Integer;
begin
  gd := VGA; gm := VGAHi;
  InitGraph(gd, gm, '');
  WriteLn(GraphResult, ' ', GetMaxX, ' ', GetMaxY, ' ', GetMaxColor);
  SetColor(White);
  for i := 0 to 20 do Line(10, 10 + i * 7, 600, 400 - i * 13);
  Report('lines');
  for i := 0 to 4 do begin
    SetLineStyle(i, $A5A5, NormWidth); SetColor(i + 1);
    Line(5, 20 + i * 40, 630, 60 + i * 50); Line(300, 5, 320 + i * 30, 470); Line(50, 100 + i, 590, 100 + i);
  end;
  Report('styles');
  for i := 0 to 4 do begin
    SetLineStyle(i, $3C3C, ThickWidth); SetColor(i + 9);
    Line(5, 20 + i * 40, 630, 60 + i * 50); Line(300 + i * 20, 5, 320, 470); Rectangle(20 + i * 10, 20, 600 - i * 10, 460);
  end;
  SetLineStyle(SolidLn, 0, NormWidth);
  Report('thick');
  SetColor(Yellow);
  for i := 1 to 15 do Circle(320, 240, i * 15);
  Report('circles');
  SetColor(LightCyan);
  Ellipse(320, 240, 0, 360, 200, 100); Ellipse(320, 240, 45, 270, 100, 200); Arc(100, 100, 30, 300, 80); Arc(500, 300, 300, 30, 60);
  Report('ellipses');
  for i := 0 to 12 do begin
    SetFillStyle(i, i + 1); SetColor(15 - i);
    Bar(10 + (i mod 5) * 120, 10 + (i div 5) * 150, 110 + (i mod 5) * 120, 140 + (i div 5) * 150);
  end;
  Report('bars');
  SetFillStyle(HatchFill, Red); SetColor(Green);
  Bar3D(100, 150, 300, 400, 30, TopOn); Bar3D(350, 100, 500, 300, 15, TopOff);
  Report('bar3d');
  SetFillStyle(SolidFill, Blue); SetColor(White);
  FillEllipse(320, 240, 150, 90);
  SetFillStyle(XHatchFill, Magenta); FillEllipse(100, 100, 60, 40);
  Report('fillellipse');
  SetFillStyle(SlashFill, Brown); SetColor(LightGreen);
  PieSlice(320, 240, 30, 150, 120); PieSlice(150, 350, 200, 340, 90);
  Sector(500, 120, 0, 270, 100, 60);
  Report('pieslice');
  SetFillStyle(SolidFill, LightRed); SetColor(Yellow);
  FillPoly(4, Tri);
  SetFillStyle(InterleaveFill, Cyan);
  FillPoly(6, Star);
  DrawPoly(4, Tri);
  Report('fillpoly');
  SetColor(White);
  Rectangle(50, 50, 400, 300); Circle(200, 170, 60); Line(50, 50, 400, 300);
  SetFillStyle(SolidFill, Green);
  FloodFill(300, 100, White);
  SetFillStyle(LtBkSlashFill, Red);
  FloodFill(200, 170, White);
  Report('floodfill');
  SetColor(White);
  OutTextXY(10, 10, 'Hello, Graph! 0123456789');
  SetTextStyle(DefaultFont, HorizDir, 2); OutTextXY(10, 40, 'Size two');
  SetTextStyle(DefaultFont, HorizDir, 3); SetTextJustify(CenterText, CenterText); OutTextXY(320, 240, 'Centered');
  SetTextStyle(DefaultFont, VertDir, 1); SetTextJustify(LeftText, TopText); OutTextXY(600, 400, 'Vertical');
  SetTextStyle(DefaultFont, VertDir, 2); OutTextXY(560, 400, 'Big');
  SetTextStyle(DefaultFont, HorizDir, 1); SetTextJustify(RightText, BottomText); OutTextXY(630, 470, 'right bottom');
  WriteLn(TextWidth('abc'), ' ', TextHeight('abc'));
  Report('text');
  SetTextJustify(LeftText, TopText);
  SetViewPort(100, 100, 300, 250, ClipOn);
  SetColor(White);
  for i := 0 to 10 do Line(-50 + i * 30, -50, 250 - i * 10, 300);
  Circle(100, 75, 120);
  SetFillStyle(SolidFill, Yellow); Bar(-20, -20, 50, 50);
  OutTextXY(150, 140, 'clipped text here');
  SetViewPort(0, 0, GetMaxX, GetMaxY, ClipOn);
  Report('viewport');
  SetWriteMode(XORPut); SetColor(LightBlue);
  for i := 0 to 10 do Line(0, i * 20, 639, 479 - i * 20);
  Rectangle(100, 100, 200, 200); Rectangle(150, 150, 250, 250);
  SetWriteMode(CopyPut);
  Report('xor');
  for i := 0 to 15 do PutPixel(i * 10, i * 5, i);
  MoveTo(10, 10); LineTo(100, 50); LineRel(50, 100); MoveRel(10, 10); LineTo(300, 300);
  WriteLn(GetX, ' ', GetY, ' ', GetPixel(20, 10));
  Report('pixels');
  CloseGraph;
end.

// Output:
// 0 639 479 15
// lines 1319 88259835
// styles 505 6617639
// thick 2454 131456635
// circles 1176 87393852
// ellipses 201 10329363
// bars 7483 300436541
// bar3d 4137 82021028
// fillellipse 4996 34824165
// pieslice 1769 57440516
// fillpoly 2709 99314490
// floodfill 4949 51926357
// 24 8
// text 349 27299625
// viewport 451 20306066
// xor 839 39908772
// 300 300 2
// pixels 79 2426931
