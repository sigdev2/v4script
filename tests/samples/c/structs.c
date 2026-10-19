#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    double x, y;
} Point;

struct Person {
    char name[16];
    int age;
    struct Person *friend;
};

typedef enum { RED, GREEN = 5, BLUE } Color;

union Value {
    int i;
    float f;
    unsigned char bytes[4];
};

struct Flags {
    unsigned a : 3;
    unsigned b : 5;
    signed c : 4;
};

static Point add(Point a, Point b)
{
    Point r = { a.x + b.x, a.y + b.y };
    return r;
}

static void grow(Point *p, double k)
{
    p->x *= k;
    p->y *= k;
}

static int by_age(const void *a, const void *b)
{
    const struct Person *x = a, *y = b;
    return x->age - y->age;
}

static int apply(int (*op)(int, int), int a, int b)
{
    return op(a, b);
}

static int plus(int a, int b) { return a + b; }
static int times(int a, int b) { return a * b; }

int main(void)
{
    Point p = { 1.5, 2 };
    Point q = { .y = 10, .x = 20 };
    Point r = add(p, q);
    grow(&r, 2);
    printf("%.1f %.1f\n", r.x, r.y);

    Point copy = r;
    copy.x = 0;
    printf("%.1f %.1f %zu\n", r.x, copy.x, sizeof(Point));

    struct Person people[3] = { { "Вера", 41, NULL }, { "Олег", 23, NULL }, { "Ира", 35, NULL } };
    people[0].friend = &people[2];
    printf("%s -> %s %d\n", people[0].name, people[0].friend->name, people[0].friend->age);
    qsort(people, 3, sizeof people[0], by_age);
    for (int i = 0; i < 3; i++)
        printf("%s %d; ", people[i].name, people[i].age);
    printf("\n");

    Color c = BLUE;
    printf("%d %d %d\n", RED, GREEN, c);

    union Value v;
    v.f = 1.0f;
    printf("%08x %zu\n", v.i, sizeof v);
    v.i = 0x41424344;
    printf("%c%c\n", v.bytes[0], v.bytes[3]);

    struct Flags f = { 5, 17, -3 };
    f.a += 4;
    printf("%u %u %d %zu\n", f.a, f.b, f.c, sizeof f);

    int (*ops[2])(int, int) = { plus, times };
    printf("%d %d\n", apply(ops[0], 6, 7), apply(ops[1], 6, 7));

    struct Person *heap = malloc(sizeof *heap);
    strcpy(heap->name, "Кот");
    heap->age = 3;
    heap->friend = heap;
    printf("%s %d\n", heap->friend->friend->name, heap->age);
    free(heap);

    Point *arr = (Point[]){ { 1, 2 }, { 3, 4 } };
    printf("%.0f\n", arr[1].x + arr[0].y);

    struct { int id; struct { int w, h; } size; } box = { 7, { 3, 4 } };
    printf("%d %d\n", box.id, box.size.w * box.size.h);
    return 0;
}

// Output:
// 43.0 24.0
// 43.0 0.0 16
// Вера -> Ира 35
// Олег 23; Ира 35; Вера 41;
// 0 5 6
// 3f800000 4
// DA
// 1 17 -3 4
// 13 42
// Кот 3
// 5
// 7 12
