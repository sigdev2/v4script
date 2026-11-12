// The host module "app" of the tests is the object app.App; a unit sees its
// members without the object name. JavaScript values are js.JsValue.
println(greet("Ann") + " " + add(2.0, 3.5) + " " + isEven(4) + " " + counter + " " + App.counter)
val p = point(1.0, 2.0)
println("${p["x"].asInt()} ${p["y"].asDouble()} ${range(3).size}")
log("one")
println(logged[0].asString() + " " + describe() + " " + describe(listOf(1, 2)))
val square = { x: Int -> x * x }
Js.global()["ktSquare"] = square
println(Js.global().call("ktSquare", 9).asInt())
try {
    fail("bad")
} catch (e: JsException) {
    println("caught ${e.message}")
}

// Output:
// Hello, Ann! 5.5 true 1 2
// 1 2.0 3
// one nothing [1,2]
// 81
// caught RangeError: bad
