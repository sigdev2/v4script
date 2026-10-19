// JavaScript values: the type JSValue, members with dots, calls, JSFunction.
type
  TPoint = record
    X, Y: Integer;
  end;

function Twice(x: Integer): Integer;
begin
  Result := 2 * x;
end;

var
  m, list, obj, f: JSValue;
  p: TPoint;
  total: Double;
  i: Integer;
begin
  WriteLn(Integer(JS.Math.max(3, 9, 4)), ' ', JSTypeOf(JS.Math), ' ', JSIsNull(JSNull));
  list := JSArray(1, 'два', 3.5, True);
  WriteLn(list.length, ' ', list[1], ' ', JS.JSON.stringify(list));
  obj := JSObject;
  obj.name := 'Кот';
  obj.age := 3;
  WriteLn(JS.JSON.stringify(obj), ' ', string(obj.name), ' ', Integer(obj.age) + 1);
  p.X := 10; p.Y := 20;
  WriteLn(JS.JSON.stringify(p));
  f := JSFunction(@Twice);
  WriteLn(Integer(f(21)));
  total := 0;
  for i := 0 to list.length - 1 do
    if JSTypeOf(list[i]) = 'number' then
      total := total + Double(list[i]);
  WriteLn(total:0:1);
  m := JSNew(JS.Map);
  m.set('k', 5);
  WriteLn(Integer(m.get('k')), ' ', m.size, ' ', m.has('x'));
end.

// Output:
// 9 object TRUE
// 4 два [1,"два",3.5,true]
// {"name":"Кот","age":3} Кот 4
// {"X":10,"Y":20}
// 42
// 4.5
// 5 1 false
