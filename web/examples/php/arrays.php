<?php
// Arrays: a table of students, filtered, sorted and grouped.
$students = [
    ['name' => 'Anna', 'grade' => 5, 'class' => '7A'],
    ['name' => 'Boris', 'grade' => 3, 'class' => '7B'],
    ['name' => 'Vera', 'grade' => 4, 'class' => '7A'],
    ['name' => 'Gleb', 'grade' => 5, 'class' => '7B'],
    ['name' => 'Daria', 'grade' => 4, 'class' => '7B'],
];

$best = array_filter($students, function ($s) { return $s['grade'] === 5; });
echo 'Excellent: ', implode(', ', array_column($best, 'name')), "\n";

usort($students, function ($a, $b) {
    if ($a['grade'] !== $b['grade']) {
        return $b['grade'] - $a['grade'];
    }
    return strcmp($a['name'], $b['name']);
});
foreach ($students as $i => $s) {
    printf("%d. %-6s %s %d\n", $i + 1, $s['name'], $s['class'], $s['grade']);
}

$byClass = [];
foreach ($students as $s) {
    $byClass[$s['class']][] = $s['grade'];
}
ksort($byClass);
foreach ($byClass as $class => $grades) {
    printf("Class %s: average %.2f\n", $class, array_sum($grades) / count($grades));
}
