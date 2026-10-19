// qsort with comparison functions: structs by two keys, strings.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    const char *city;
    int population; // thousands
    double area;    // square kilometres
} City;

static int by_density(const void *a, const void *b)
{
    const City *x = a, *y = b;
    double dx = x->population / x->area, dy = y->population / y->area;
    return (dx < dy) - (dx > dy);
}

static int by_name(const void *a, const void *b)
{
    return strcmp(*(const char *const *)a, *(const char *const *)b);
}

int main(void)
{
    City cities[] = {
        { "Riverton", 420, 95.5 }, { "Hillside", 85, 40.2 },
        { "Portview", 1250, 310.0 }, { "Lakeford", 230, 33.8 },
    };
    size_t count = sizeof cities / sizeof cities[0];
    qsort(cities, count, sizeof cities[0], by_density);
    printf("%-10s %8s %8s %10s\n", "City", "People", "km2", "per km2");
    for (size_t i = 0; i < count; i++)
        printf("%-10s %7dk %8.1f %10.1f\n", cities[i].city, cities[i].population, cities[i].area,
               cities[i].population * 1000 / cities[i].area);

    const char *names[] = { "pear", "apple", "fig", "cherry", "banana" };
    qsort(names, 5, sizeof names[0], by_name);
    for (int i = 0; i < 5; i++)
        printf("%s%s", names[i], i < 4 ? ", " : "\n");
    return 0;
}
