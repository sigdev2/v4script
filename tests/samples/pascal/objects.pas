type
  PShape = ^TShape;
  TShape = object
    X, Y: Integer;
    constructor Init(AX, AY: Integer);
    function Area: Double; virtual;
    procedure Show;
  end;
  PSquare = ^TSquare;
  TSquare = object(TShape)
    Side: Integer;
    constructor Init(AX, AY, ASide: Integer);
    function Area: Double; virtual;
  end;
  TCounter = class
  private
    class var FCount: Integer;
    FValues: array[0..3] of Integer;
    function GetValue(Index: Integer): Integer;
    procedure SetValue(Index: Integer; V: Integer);
  public
    constructor Create;
    class function Count: Integer;
    property Values[Index: Integer]: Integer read GetValue write SetValue;
    property First: Integer index 0 read GetValue write SetValue;
    property Second: Integer index 1 read GetValue;
  end;
  TKind = (kInt, kStr);
  TVariant = record
    Name: string[10];
    case Kind: TKind of
      kInt: (I: Integer);
      kStr: (S: string[20]);
  end;
  TRec = record A: Integer; B: string[8]; end;
  TNum = (One = 1, Two, Five = 5);

constructor TShape.Init(AX, AY: Integer); begin X := AX; Y := AY; end;
function TShape.Area: Double; begin Area := 0; end;
procedure TShape.Show; begin WriteLn('at ', X, ',', Y, ' area ', Area:0:1); end;
constructor TSquare.Init(AX, AY, ASide: Integer); begin inherited Init(AX, AY); Side := ASide; end;
function TSquare.Area: Double; begin Area := Side * Side; end;

constructor TCounter.Create; begin Inc(FCount); end;
class function TCounter.Count: Integer; begin Result := FCount; end;
function TCounter.GetValue(Index: Integer): Integer; begin Result := FValues[Index]; end;
procedure TCounter.SetValue(Index: Integer; V: Integer); begin FValues[Index] := V * 10; end;

function SumRecs(const a: array of TRec): Integer;
var r: TRec;
begin
  Result := 0;
  for r in a do Result := Result + r.A;
end;

var
  s: TShape; sq: TSquare; p: PShape;
  c1, c2: TCounter;
  v: TVariant;
  f: file of TRec;
  r, r2: TRec;
  recs: array of TRec;
  grid: array of array of Integer;
  d: array of Integer;
  i, j: Integer;
  ch: Char;
  sh: string[5];
  n: TNum;
begin
  s.Init(1, 2); s.Show;
  sq.Init(3, 4, 5); sq.Show;
  p := @sq; p^.Show; WriteLn(p^.Area:0:1);
  New(p, Init(7, 8)); p^.Show; Dispose(p);
  c1 := TCounter.Create; c2 := TCounter.Create;
  WriteLn(TCounter.Count, ' ', c1.Count);
  c1.Values[2] := 4; c1.First := 7;
  WriteLn(c1.Values[2], ' ', c1.First, ' ', c1.Second, ' ', c1.Values[0]);
  v.Name := 'variant-name-long'; v.Kind := kStr; v.S := 'hello';
  WriteLn(v.Name, ' ', Ord(v.Kind), ' ', v.S, ' ', SizeOf(TRec) > 0);
  Assign(f, 'recs.dat'); Rewrite(f);
  for i := 1 to 3 do begin r.A := i * 11; r.B := 'rec' + Chr(48 + i); Write(f, r); end;
  Close(f);
  Reset(f);
  WriteLn(FileSize(f));
  Seek(f, 1); Read(f, r2); WriteLn(r2.A, ' ', r2.B, ' ', FilePos(f));
  while not Eof(f) do begin Read(f, r2); Write(r2.B, ' '); end;
  WriteLn; Close(f);
  SetLength(recs, 3);
  for i := 0 to 2 do recs[i].A := i + 1;
  WriteLn(SumRecs(recs), ' ', SumRecs([]));
  SetLength(grid, 3);
  for i := 0 to 2 do begin SetLength(grid[i], i + 1); for j := 0 to i do grid[i][j] := i * j; end;
  WriteLn(Length(grid[2]), ' ', grid[2][2], ' ', High(grid[1]));
  d := [5, 3, 8];
  Insert(9, d, 1); Delete(d, 0, 1);
  for i in d do Write(i, ' ');
  WriteLn(Length(Copy(d, 1, 2)), ' ', Length(Copy(d)));
  d := Concat(d, [1, 2]);
  WriteLn(Length(d), ' ', d[High(d)]);
  sh := 'abcdefgh'; WriteLn(sh, ' ', Length(sh), ' ', Ord(sh[0]));
  for ch in 'xyz' do Write(Ord(ch), ' ');
  WriteLn;
  n := Two; WriteLn(Ord(n), ' ', Ord(High(TNum)), ' ', Ord(Low(TNum)));
  i := 7;
  case i of
    1..5: WriteLn('low');
    6, 7: begin WriteLn('six or seven'); Exit; end;
  end;
  WriteLn('not reached');
end.

// Output:
// at 1,2 area 0.0
// at 3,4 area 25.0
// at 3,4 area 25.0
// 25.0
// at 7,8 area 0.0
// 2 2
// 40 70 0 70
// variant-na 1 hello TRUE
// 3
// 22 rec2 2
// rec3
// 6 0
// 3 4 1
// 9 3 8 2 3
// 5 2
// abcde 5 5
// 120 121 122
// 2 5 1
// six or seven
