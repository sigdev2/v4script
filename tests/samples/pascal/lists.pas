uses SysUtils, Classes, Contnrs;
type
  TItem = class
    Name: string; Value: Integer;
    constructor Create(const AName: string; AValue: Integer);
    destructor Destroy; override;
  end;
constructor TItem.Create(const AName: string; AValue: Integer);
begin Name := AName; Value := AValue; end;
destructor TItem.Destroy;
begin WriteLn('free ', Name); inherited; end;

function CompareItems(A, B: Pointer): Integer;
begin
  Result := TItem(A).Value - TItem(B).Value;
end;

var
  L, M: TStringList;
  i, idx: Integer;
  list: TList;
  objs: TObjectList;
  st: TObjectStack;
begin
  L := TStringList.Create;
  L.Add('banana'); L.Add('apple'); L.Add('Cherry'); L.Add('date');
  WriteLn(L.Count, ' ', L[0], ' ', L.IndexOf('APPLE'), ' ', L.Text = 'banana'#10'apple'#10'Cherry'#10'date'#10);
  L.Sort;
  WriteLn(L.CommaText);
  L.Sorted := True;
  L.Add('blueberry');
  WriteLn(L.CommaText, ' ', L.Find('cherry', idx), ' ', idx);
  L.Sorted := False;
  L.Insert(0, 'first'); L.Delete(2); L.Exchange(0, 1);
  WriteLn(L.CommaText);
  L.Clear;
  L.CommaText := 'a,"b c",,"d""e" , f';
  for i := 0 to L.Count - 1 do Write('[', L[i], ']');
  WriteLn(' ', L.Count);
  L.Clear;
  L.Values['name'] := 'Ann'; L.Values['age'] := '30'; L.Values['name'] := 'Bob';
  WriteLn(L.Text, L.Values['age'], ' ', L.Names[0], ' ', L.ValueFromIndex[1], ' ', L.IndexOfName('AGE'));
  L.Delimiter := ';'; L.StrictDelimiter := True; L.DelimitedText := 'x y;z';
  WriteLn(L.Count, ' ', L[0], '|', L.DelimitedText);
  M := TStringList.Create;
  M.Text := 'one'#13#10'two'#10'three';
  WriteLn(M.Count, ' ', M[2]);
  M.Duplicates := dupIgnore; M.Sorted := True; M.Add('two'); WriteLn(M.Count);
  try
    M.Duplicates := dupError; M.Add('one');
  except
    on E: EStringListError do WriteLn(E.ClassName, ': ', E.Message);
  end;
  try
    WriteLn(M[10]);
  except
    on E: Exception do WriteLn(E.ClassName, ': ', E.Message);
  end;
  M.SaveToFile('m.txt'); L.LoadFromFile('m.txt'); WriteLn(L.CommaText);
  L.Free; M.Free;
  list := TList.Create;
  list.Add(TItem.Create('c', 3)); list.Add(TItem.Create('a', 1)); list.Add(TItem.Create('b', 2));
  list.Sort(@CompareItems);
  for i := 0 to list.Count - 1 do Write(TItem(list[i]).Name, ' ');
  WriteLn(list.Count, ' ', list.IndexOf(list[1]));
  for i := 0 to list.Count - 1 do TItem(list[i]).Free;
  list.Free;
  objs := TObjectList.Create;
  objs.Add(TItem.Create('x', 1)); objs.Add(TItem.Create('y', 2)); objs.Add(TItem.Create('z', 3));
  WriteLn(TItem(objs[1]).Name, ' ', objs.Count);
  objs.Delete(0);
  objs.Free;
  st := TObjectStack.Create;
  st.Push(TItem.Create('s1', 1)); st.Push(TItem.Create('s2', 2));
  WriteLn(TItem(st.Pop).Name, ' ', st.Count);
  st.Free;
  try
    TStringList.Create.Insert(5, 'x');
  except
    on E: Exception do WriteLn(E.Message);
  end;
end.

// Output:
// 4 banana 1 TRUE
// apple,banana,Cherry,date
// apple,banana,blueberry,Cherry,date TRUE 3
// apple,first,blueberry,Cherry,date
// [a][b c][][d"e][f] 5
// name=Bob
// age=30
// 30 name 30 1
// 2 x y|x y;z
// 3 three
// 3
// EStringListError: String list does not allow duplicates
// EStringListError: List index (10) out of bounds
// one,three,two
// a b c 3 1
// free a
// free b
// free c
// y 3
// free x
// free z
// free y
// s2 1
// List index (5) out of bounds
