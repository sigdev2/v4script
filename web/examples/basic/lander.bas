' Moon landing: every second you choose how much fuel to burn
' (0 to 30 kg). Land at less than 5 m/s. The engine of a real lander
' would give you more time to think...
height = 1000: speed = 50: fuel = 400: t = 0
PRINT "Height 1000 m, falling at 50 m/s, 400 kg of fuel."
PRINT "Moon gravity adds 1.6 m/s every second, 1 kg of fuel takes 0.3 m/s."
DO
    PRINT USING "Time ###  height ######.#  speed ####.#  fuel ###"; t; height; speed; fuel
    INPUT "Burn"; burn
    IF burn < 0 THEN burn = 0
    IF burn > 30 THEN burn = 30
    IF burn > fuel THEN burn = fuel
    fuel = fuel - burn
    newSpeed = speed + 1.6 - .3 * burn
    height = height - (speed + newSpeed) / 2
    speed = newSpeed
    t = t + 1
    IF fuel = 0 AND height > 0 THEN
        PRINT "Out of fuel!"
        speed = SQR(speed * speed + 3.2 * height)
        height = 0
    END IF
LOOP WHILE height > 0
PRINT USING "Touchdown at ###.# m/s after ### s."; ABS(speed); t
SELECT CASE ABS(speed)
    CASE IS < 2: PRINT "A perfect landing!"
    CASE IS < 5: PRINT "A good landing."
    CASE IS < 15: PRINT "The lander is damaged, but you are alive."
    CASE ELSE: PRINT "A new crater on the Moon..."
END SELECT
