// Standard input of the host: readline(), fgets(STDIN), feof(STDIN).
$name = readline("Name? ");
echo "Hi $name\n";
while (($line = fgets(STDIN)) !== false) {
    echo "line: ", trim($line), "\n";
}
var_dump(feof(STDIN));
fwrite(STDERR, "done\n");

// Input:
// Bob
// x
// y
// Output:
// Name? Hi Bob
// line: x
// line: y
// bool(true)
// !done
