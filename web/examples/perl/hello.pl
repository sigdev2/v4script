# Hello: a line of standard input, string operators and a hash.
print "What is your name? ";
my $name = <STDIN>;
$name = "stranger" unless defined $name;
chomp $name;
$name = "stranger" if $name eq "";
print "Hello, $name!\n";

my %letters;
$letters{lc $_}++ for grep { /\w/ } split //, $name;
for my $letter (sort keys %letters) {
    printf "%s %s\n", $letter, "*" x $letters{$letter};
}
