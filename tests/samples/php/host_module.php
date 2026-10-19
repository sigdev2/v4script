// The host module "app" of the tests: global functions and the namespace
// app; log and range are built-in functions of PHP, the host ones are
// app\log and app\range.
echo implode(' ', [greet("Ann"), app\add(2, 3.5), isEven(4) ? 'yes' : 'no', counter(), app\counter()]), "\n";
$p = point(1, 2);
echo $p->x, ' ', $p->y, ' ', count(app\range(3)), "\n";
app\log("one");
echo implode(' ', logged()), ' ', describe(), ' ', describe([1, 2]), "\n";

// Output:
// Hello, Ann! 5.5 yes 1 2
// 1 2 3
// one nothing [1,2]
