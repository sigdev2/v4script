// The host module "app" of the tests is the unit App, used without uses;
// App.Counter names it explicitly.
var
  p: JSValue;
begin
  WriteLn(Greet('Ann'), ' ', Add(2, 3.5):0:1, ' ', IsEven(4), ' ', Counter, ' ', App.Counter);
  p := Point(1, 2);
  WriteLn(p.x, ' ', p.y, ' ', Range(3).length);
  Log('one');
  WriteLn(Logged.length, ' ', Describe, ' ', Describe(JSArray(1, 2)));
end.

// Output:
// Hello, Ann! 5.5 TRUE 1 2
// 1 2 3
// 1 nothing [1,2]
