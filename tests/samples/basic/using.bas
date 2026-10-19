' PRINT USING: numbers, signs, commas, $$, **, exponents, strings,
' literals; WRITE; RND and RANDOMIZE - the sequence as in QBasic.
PRINT USING "##.##"; 3.14159; 2.71828
PRINT USING "Name: & Age: ###"; "Bob"; 42
PRINT USING "+#.###^^^^"; 12345.678
PRINT USING "#,###,###"; 1234567
PRINT USING "$$###.##"; 12.5
PRINT USING "**####.##"; 42.125
PRINT USING "###.##-"; -5.5
PRINT USING "!"; "Zebra"
PRINT USING "\   \"; "abcdefgh"
PRINT USING "###"; 12345
PRINT USING "_#_## #"; 5
PRINT USING "#.##"; .005; .015; .025
WRITE 1, "two", 3.5, -4
WRITE
PRINT RND; RND; RND
RANDOMIZE 42
PRINT RND; RND

' Output:
'  3.14 2.72
' Name: Bob Age:  42
' +1.235D+04
' 1,234,567
'   $12.50
' ****42.13
'   5.50-
' Z
' abcde
' %12345
' ##5
' 0.000.010.03
' 1,"two",3.5,-4
'
'  .7055475  .533424  .5795186
'  .4311945  .4083018
