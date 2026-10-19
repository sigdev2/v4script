' Three ways to compute pi.
DEFDBL A-Z
PRINT "Pi in QBasic:     "; 4 * ATN(1)

' Leibniz: 1 - 1/3 + 1/5 - 1/7 + ... = pi / 4
sum = 0: sign = 1
FOR k = 0 TO 99999
    sum = sum + sign / (2 * k + 1)
    sign = -sign
NEXT k
PRINT "Leibniz, 100000 terms:"; 4 * sum

' Wallis: (2/1 * 2/3) * (4/3 * 4/5) * ... = pi / 2
product = 1
FOR k = 1 TO 100000
    product = product * (2 * k) / (2 * k - 1) * (2 * k) / (2 * k + 1)
NEXT k
PRINT "Wallis, 100000 factors:"; 2 * product

' Monte Carlo: random points in a square, the share inside the circle.
RANDOMIZE TIMER
inside = 0
FOR k = 1 TO 200000
    x = RND: y = RND
    IF x * x + y * y <= 1 THEN inside = inside + 1
NEXT k
PRINT "Monte Carlo, 200000 points:"; 4 * inside / 200000
