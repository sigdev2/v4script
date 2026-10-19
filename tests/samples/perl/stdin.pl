# Standard input of the host: <STDIN> line by line.
print "Name? ";
my $name = <STDIN>;
chomp $name;
print "Hi $name\n";
while (my $line = <STDIN>) {
    chomp $line;
    print "line: $line\n";
}
print defined(<STDIN>) ? "more\n" : "end\n";

# Input:
# Bob
# x
# y
# Output:
# Name? Hi Bob
# line: x
# line: y
# end
