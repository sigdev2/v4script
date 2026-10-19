// Standard input of the host: scanf waits for the next lines, fgets and
// getchar read what is left.
#include <stdio.h>

int main(void)
{
    char name[32];
    printf("Name? ");
    scanf("%31s", name);
    printf("Hi %s\n", name);
    int a, b;
    int count = scanf("%d %d", &a, &b);
    printf("%d %d\n", a + b, count);
    char line[64];
    fgets(line, sizeof line, stdin);
    printf("[%s]\n", line);
    int c;
    while ((c = getchar()) != EOF)
        putchar(c == '\n' ? '|' : c);
    printf("\n%d\n", feof(stdin));
    return 0;
}

// Input:
// Bob
// 3
// 4 rest
// x
// y
// Output:
// Name? Hi Bob
// 7 2
// [ rest
// ]
// x|y|
// 1
