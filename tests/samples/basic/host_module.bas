' The host module "app" of the tests: functions with names in capitals
' and the object APP. POINT and LOG are QBasic functions: the host ones are
' APP.point and APP.log.
PRINT GREET("Ann"); ADD(2, 3.5); ISEVEN(4); COUNTER; APP.counter
DIM p AS OBJECT
p = APP.point(1, 2)
PRINT p.x; p.y; RANGE(3).length
APP.log "one"
PRINT LOGGED.length; " "; DESCRIBE; " "; DESCRIBE(JSARRAY(1, 2))

' Output:
' Hello, Ann! 5.5 -1  1  2
'  1  2  3
'  1  nothing [1,2]
