// Object Pascal: classes, virtual methods, properties and exceptions.
program Animals;
{$mode objfpc}
uses SysUtils;
type
  TAnimal = class
  private
    FName: string;
  public
    constructor Create(const AName: string);
    function Sound: string; virtual; abstract;
    function Describe: string;
    property Name: string read FName;
  end;

  TDog = class(TAnimal)
    function Sound: string; override;
  end;

  TCat = class(TAnimal)
    function Sound: string; override;
  end;

constructor TAnimal.Create(const AName: string);
begin
  if AName = '' then
    raise EArgumentException.Create('an animal needs a name');
  FName := AName;
end;

function TAnimal.Describe: string;
begin
  Result := Format('%s the %s says %s', [Name, LowerCase(Copy(ClassName, 2, 10)), Sound]);
end;

function TDog.Sound: string;
begin
  Result := 'Woof';
end;

function TCat.Sound: string;
begin
  Result := 'Meow';
end;

var
  animals: array of TAnimal;
  animal: TAnimal;
begin
  animals := [TDog.Create('Rex'), TCat.Create('Murka'), TDog.Create('Sharik')];
  for animal in animals do
  begin
    WriteLn(animal.Describe);
    animal.Free;
  end;
  try
    TCat.Create('');
  except
    on E: EArgumentException do
      WriteLn('Error: ', E.Message);
  end;
end.
