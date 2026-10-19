' Fibonacci's rabbits: a pair gives a new pair every month from its
' second month. How many pairs are there after a year, after two?
DIM young AS LONG, grown AS LONG, born AS LONG
young = 1: grown = 0
PRINT "Month", "Young", "Grown", "All pairs"
FOR month = 1 TO 24
    PRINT month, young, grown, young + grown
    born = grown
    grown = grown + young
    young = born
NEXT month
PRINT
PRINT "Each number is the sum of the two before it. Their ratio comes"
PRINT "close to the golden ratio:"; (1 + SQR(5)) / 2
