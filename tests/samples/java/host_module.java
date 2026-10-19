// The host module "app" of the tests is the class app.App; a unit sees its
// methods without the class name (import static app.App.*).
System.out.println(greet("Ann") + " " + add(2, 3.5) + " " + isEven(4) + " " + counter() + " " + App.counter());
JsValue p = point(1, 2);
System.out.println(p.get("x").asInt() + " " + p.get("y").asDouble() + " " + range(3).size());
log("one");
System.out.println(logged().get(0) + " " + describe() + " " + describe(List.of(1, 2)));

// Output:
// Hello, Ann! 5.5 true 1 2
// 1 2.0 3
// one nothing [1,2]
