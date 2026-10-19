<?php
// Hello: readline, string functions and the value of the run.
$name = trim((string) readline("What is your name? "));
if ($name === '') {
    $name = 'stranger';
}
echo "Hello, $name!\n";
echo "Your name in capitals: ", strtoupper($name), "\n";
echo "Its letters in order: ", implode(' ', str_split(implode('', array_sort(str_split(strtolower($name)))))), "\n";

function array_sort(array $items): array
{
    sort($items);
    return $items;
}

return strlen($name);
