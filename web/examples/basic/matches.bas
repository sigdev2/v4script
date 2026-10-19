' Matches: 21 matches on the table, each player takes 1, 2 or 3.
' Who takes the last match loses. The computer knows the secret...
' 0 gives up.
matches = 21
DO
    PRINT
    PRINT STRING$(matches, "|"); " ("; LTRIM$(STR$(matches)); ")"
    INPUT "How many do you take (1-3)"; take
    IF take = 0 THEN PRINT "You gave up.": END
    IF take < 1 OR take > 3 OR take <> INT(take) OR take > matches THEN
        PRINT "You can take 1, 2 or 3 matches."
    ELSE
        matches = matches - take
        IF matches = 0 THEN PRINT "You took the last match - you lose!": END
        ' Leave a number of the form 4k + 1 for the player.
        mine = (matches - 1) MOD 4
        IF mine = 0 THEN mine = 1
        PRINT "I take"; mine
        matches = matches - mine
        IF matches = 0 THEN PRINT "I took the last match - you win!": END
    END IF
LOOP
