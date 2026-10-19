// Plain JavaScript in the worker of the page: console.log prints to the
// output, the last expression is the value of the run.
const words = ['every', 'language', 'runs', 'in', 'one', 'engine'];
console.log(words.map((word) => word[0].toUpperCase() + word.slice(1)).join(' '));
console.log('Longest word:', words.reduce((a, b) => (b.length > a.length ? b : a)));
const squares = Array.from({ length: 10 }, (_, i) => (i + 1) ** 2);
console.log('Squares:', squares);
({ count: words.length, total: squares.reduce((a, b) => a + b, 0) });
