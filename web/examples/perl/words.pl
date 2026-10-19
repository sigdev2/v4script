# Word frequency with regular expressions and a sort by two keys.
my $text = <<'END';
Perl is a language for getting your job done. Perl makes easy things
easy and hard things possible, and a language is only as good as the
things it makes easy.
END

my %count;
$count{lc $_}++ for $text =~ /([A-Za-z]+)/g;

my @words = sort { $count{$b} <=> $count{$a} or $a cmp $b } keys %count;
printf "%d different words\n", scalar @words;
for my $word (@words[0 .. 5]) {
    printf "%-10s %d\n", $word, $count{$word};
}
my $shout = $text;
$shout =~ s/\beasy\b/EASY/g;
print "\n", $shout;
