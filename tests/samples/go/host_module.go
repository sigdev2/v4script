// The host module "app" of the tests is a package: functions with
// exported names, js.Value for JavaScript values.
fmt.Println(app.Greet("Ann"), app.Add(2, 3.5), app.IsEven(4), app.Counter(), app.Counter())
p := app.Point(1, 2)
fmt.Println(p.Get("x").Int(), p.Get("y").Float(), len(app.Range(3)))
app.Log("one")
fmt.Println(app.Logged()[0].String(), app.Describe(), app.Describe([]int{1, 2}))

// Output:
// Hello, Ann! 5.5 true 1 2
// 1 2 3
// one nothing [1,2]
