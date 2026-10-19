<?php
// Classes: an interface, an abstract class and inheritance.
interface Shape
{
    public function area(): float;
    public function name(): string;
}

abstract class Base implements Shape
{
    public function describe(): string
    {
        return sprintf("%-10s area %8.2f", $this->name(), $this->area());
    }
}

class Circle extends Base
{
    private $radius;
    public function __construct(float $radius) { $this->radius = $radius; }
    public function area(): float { return M_PI * $this->radius * $this->radius; }
    public function name(): string { return "circle"; }
}

class Rectangle extends Base
{
    protected $width;
    protected $height;
    public function __construct(float $width, float $height)
    {
        $this->width = $width;
        $this->height = $height;
    }
    public function area(): float { return $this->width * $this->height; }
    public function name(): string { return "rectangle"; }
}

class Square extends Rectangle
{
    public function __construct(float $side) { parent::__construct($side, $side); }
    public function name(): string { return "square"; }
}

$shapes = [new Circle(1.5), new Rectangle(2, 3.5), new Square(2.5)];
foreach ($shapes as $shape) {
    echo $shape->describe(), "\n";
}
$total = array_sum(array_map(function (Shape $s) { return $s->area(); }, $shapes));
printf("Total area: %.2f\n", $total);
