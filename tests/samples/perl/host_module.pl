# The host module "app" of the tests: subroutines of main and the package app.
print join(' ', greet("Ann"), app::add(2, 3.5), isEven(4) ? 'yes' : 'no', counter(), app::counter()), "\n";
my $p = point(1, 2);
print $p->{x}, " ", $p->{y}, " ", scalar(@{app::range(3)}), "\n";
# log is a built-in function of Perl: the host one is app::log.
app::log("one");
print join(' ', @{logged()}, describe(), describe([1, 2])), "\n";

# Output:
# Hello, Ann! 5.5 yes 1 2
# 1 2 3
# one nothing [1,2]
