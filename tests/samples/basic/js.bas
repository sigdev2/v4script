' JavaScript values (OBJECT): properties, methods, arrays and objects,
' JSNEW, JSFUNCTION - a BASIC procedure as a JavaScript function; a BASIC
' array as an argument is a JavaScript array, a record an object.
DIM o AS OBJECT, arr AS OBJECT
o = JSOBJECT
o.name = "Ann"
o.age = 30
PRINT o.name; o.age; JSTYPE$(o)
arr = JSARRAY(1, "two", 3.5)
PRINT arr.length; arr(1); arr.join("-")
arr(0) = 10
PRINT arr
PRINT JS.Math.max(1, 5, 3); JS.Math.PI
x = JS.Math.sqrt(2): PRINT x
s$ = JS.String(42) + "!": PRINT s$
DIM m AS OBJECT
m = JSNEW(JS.Map)
m.set "k", 5
PRINT m.get("k"); m.size
PRINT JSISNULL(JSNULL); JSISNULL(o)
JS.basicSquare = JSFUNCTION("Square")
PRINT JS.basicSquare(7)
DIM nums(1 TO 3)
nums(1) = 1.5: nums(2) = 2: nums(3) = 3
PRINT JS.JSON.stringify(nums())
FUNCTION Square (n)
    Square = n * n
END FUNCTION
TYPE Pair
    a AS INTEGER
    b AS STRING * 3
END TYPE
DIM pr AS Pair
pr.a = 5: pr.b = "xy"
PRINT JS.JSON.stringify(pr)
IF JS.Array.isArray(arr) THEN PRINT "array"
total = 0
FOR i = 0 TO arr.length - 1
    IF JSTYPE$(arr(i)) = "number" THEN total = total + arr(i)
NEXT
PRINT total

' Output:
' Ann 30 object
'  3 two1-two-3.5
' [10,"two",3.5]
'  5  3.141592653589793
'  1.414214
' 42!
'  5  1
' -1  0
'  49
' [1.5,2,3]
' {"a":5,"b":"xy "}
' array
'  13.5
