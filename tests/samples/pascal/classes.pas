type
  TShape = class
  private
    FName: string;
  protected
    function GetArea: Double; virtual; abstract;
  public
    constructor Create(const AName: string);
    destructor Destroy; override;
    function Describe: string; virtual;
    property Name: string read FName write FName;
    property Area: Double read GetArea;
    class function Count: Integer;
  end;

  TCircle = class(TShape)
  private
    FRadius: Double;
  protected
    function GetArea: Double; override;
  public
    constructor Create(R: Double);
    function Describe: string; override;
  end;

  TRect = class(TShape)
    W, H: Double;
    constructor Create(AW, AH: Double);
    function GetArea: Double; override;
  end;

  TList3 = class
  private
    FItems: array[0..2] of Integer;
    function GetItem(I: Integer): Integer;
    procedure SetItem(I: Integer; V: Integer);
  public
    property Items[I: Integer]: Integer read GetItem write SetItem; default;
  end;

  TNotify = procedure(Sender: TObject; Value: Integer) of object;
  TIntFunc = function(X: Integer): Integer;

  TButton = class
    OnClick: TNotify;
    procedure Click;
  end;

  THandler = class
    Total: Integer;
    procedure Handle(Sender: TObject; Value: Integer);
  end;

var
  Created: Integer = 0;

constructor TShape.Create(const AName: string);
begin
  inherited Create;
  FName := AName;
  Inc(Created);
end;

destructor TShape.Destroy;
begin
  WriteLn('destroy ', FName);
  inherited Destroy;
end;

function TShape.Describe: string;
var t: string;
begin
  Str(Round(Area), t);
  Result := FName + ' area=' + t;
end;

class function TShape.Count: Integer;
begin
  Result := Created;
end;

constructor TCircle.Create(R: Double);
begin
  inherited Create('circle');
  FRadius := R;
end;

function TCircle.GetArea: Double;
begin
  Result := Pi * FRadius * FRadius;
end;

function TCircle.Describe: string;
begin
  Result := 'round ' + inherited Describe;
end;

constructor TRect.Create(AW, AH: Double);
begin
  inherited Create('rect');
  W := AW; H := AH;
end;

function TRect.GetArea: Double;
begin
  Result := W * H;
end;

function TList3.GetItem(I: Integer): Integer;
begin
  Result := FItems[I];
end;

procedure TList3.SetItem(I: Integer; V: Integer);
begin
  FItems[I] := V * 2;
end;

procedure TButton.Click;
begin
  if Assigned(OnClick) then OnClick(Self, 5);
end;

procedure THandler.Handle(Sender: TObject; Value: Integer);
begin
  Inc(Total, Value);
  WriteLn('handled by ', ClassName, ' from ', Sender.ClassName, ' total=', Total);
end;

function Twice(X: Integer): Integer;
begin
  Result := X * 2;
end;

function Apply(F: TIntFunc; V: Integer): Integer;
begin
  Result := F(V);
end;

var
  shapes: array[1..2] of TShape;
  s: TShape;
  i: Integer;
  L: TList3;
  b: TButton;
  h: THandler;
  f: TIntFunc;
begin
  shapes[1] := TCircle.Create(2);
  shapes[2] := TRect.Create(3, 4);
  for i := 1 to 2 do
    WriteLn(shapes[i].Describe, ' ', shapes[i].ClassName, ' ', shapes[i].Area:0:2);
  WriteLn('count=', TShape.Count);
  s := shapes[1];
  if s is TCircle then WriteLn('circle radius=', TCircle(s).FRadius:0:1);
  WriteLn(s is TRect, ' ', (shapes[2] as TRect).W:0:1, ' ', s.InheritsFrom(TShape), ' ', TCircle.ClassParent.ClassName);
  s.Name := 'renamed'; WriteLn(s.Name);
  for i := 1 to 2 do shapes[i].Free;
  L := TList3.Create;
  L[1] := 21; WriteLn(L[1], ' ', L.Items[1]);
  L.Free;
  b := TButton.Create; h := THandler.Create;
  b.OnClick := @h.Handle;
  b.Click; b.Click;
  f := @Twice; WriteLn(Apply(f, 21), ' ', Apply(@Twice, 5));
  WriteLn(TObject.Create.ClassName, ' ', h.ToString);
  s := nil; s.Free; WriteLn('nil free ok');
end.

// Output:
// round circle area=13 TCircle 12.57
// rect area=12 TRect 12.00
// count=2
// circle radius=2.0
// FALSE 3.0 TRUE TShape
// renamed
// destroy renamed
// destroy rect
// 42 42
// handled by THandler from TButton total=5
// handled by THandler from TButton total=10
// 42 10
// TObject THandler
// nil free ok
