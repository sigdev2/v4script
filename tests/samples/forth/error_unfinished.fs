\ A definition without ; at the end of the unit.
: square dup * ;
: cube
  dup square *

\ Error: Unfinished definition: cube (no ;)
\ Line: 3
