# Objects: a package with a constructor and methods, blessed hashes.
package Stack;

sub new {
    my ($class) = @_;
    return bless { items => [] }, $class;
}

sub push {
    my ($self, @values) = @_;
    push @{ $self->{items} }, @values;
    return $self;
}

sub pop {
    my ($self) = @_;
    return pop @{ $self->{items} };
}

sub size { scalar @{ $_[0]->{items} } }

package main;

# Reverse Polish notation: 3 4 + 2 * is (3 + 4) * 2.
my $expression = "3 4 + 2 * 7 -";
my $stack = Stack->new;
for my $token (split / /, $expression) {
    if ($token =~ /^\d+$/) {
        $stack->push($token);
    } else {
        my $b = $stack->pop;
        my $a = $stack->pop;
        $stack->push($token eq '+' ? $a + $b : $token eq '-' ? $a - $b
                   : $token eq '*' ? $a * $b : $a / $b);
    }
}
print "$expression = ", $stack->pop, "\n";
print "Left on the stack: ", $stack->size, "\n";
