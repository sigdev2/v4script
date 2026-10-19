# Perl

Perl 5 in [Perlito5](https://github.com/fglock/Perlito) (9.028, commit
97c296f, Artistic-2.0), which translates Perl into JavaScript. `my`, `our`,
references, hashes, `sort`, `map`, `grep`, `sprintf`, regular expressions,
packages and objects (`bless`) work.

```perl
print "Name? ";
my $name = <STDIN>;
chomp $name;
my %stock = (apple => 3, pear => 5);
for my $item (sort keys %stock) {
    printf("%-6s %3d\n", $item, $stock{$item});
}
print greet($name), " ", app::add(2, 3.5), "\n";
```

 - **Value**: none; a unit prints its output.
 - **Variables**: package variables (`our`) and subroutines are shared by
   the units, `my` variables belong to their unit.
 - **Host modules**: a module is a package (`app::greet("Ann")`); a global
   module's functions are also subroutines of `main` with the JavaScript
   names (`greet("Ann")`, `isEven(4)`). A Perl built-in with the same name
   stays Perl's: `log` is `app::log`. A getter is a subroutine:
   `counter()`.
 - **JavaScript**: methods and properties of JavaScript objects are used
   with `->`: `$o->title`, `$o->value("B2")`. A property is written only
   with `setProperty($object, "name", $value)`; it is read with
   `$o->name` or `getProperty($object, "name")`. `js()` is the global
   object: `js()->console->log("x")`, `js()->Math->max(1, 5)`. A Perl
   subroutine can be given to JavaScript:
   `setProperty(js(), "double", sub { 2 * shift })`.
 - References to arrays and hashes go to JavaScript as copies (arrays and
   objects); a JavaScript array comes as an array reference
   (`@{ app::range(3) }`), a plain JavaScript object as a hash reference
   (`$p->{x}`).
 - **Modules**: `use Name;` and `require Name;` load the host file
   `Name.pm` (`A::B` is `A/B.pm`). `open` of files is not available.
 - **Input**: `<STDIN>` reads a line (with its line break) or `undef` at
   the end of input.
 - `print STDERR` and `warn` write to standard error.
 - Perlito5 knows the line of syntax errors only (not always exactly);
   errors at run time have no line.

Shared rules: [languages](README.md#shared-rules). Internals:
[vendor interpreters](../internals/vendor.md#perl-perlito5).
