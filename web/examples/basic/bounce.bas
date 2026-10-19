' A bouncing ball: speed, gravity and a bounce that loses a little
' energy. 60 frames a second for ten seconds.
SCREEN 13
x = 20: y = 20: vx = 2.2: vy = 0: radius = 8
FOR frame = 1 TO 600
    LINE (0, 0)-(319, 199), 1, BF
    LINE (0, 190)-(319, 199), 6, BF
    CIRCLE (x, y), radius, 15
    PAINT (x, y), 12, 15
    vy = vy + .25
    x = x + vx: y = y + vy
    IF y > 190 - radius THEN y = 190 - radius: vy = -vy * .9
    IF x < radius OR x > 319 - radius THEN vx = -vx
    _LIMIT 60
NEXT frame
