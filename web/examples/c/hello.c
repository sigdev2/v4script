// Hello: fgets from standard input, strings and characters.
#include <ctype.h>
#include <stdio.h>
#include <string.h>

int main(void)
{
    char name[64];
    printf("What is your name? ");
    if (fgets(name, sizeof name, stdin) == NULL)
        strcpy(name, "stranger");
    name[strcspn(name, "\n")] = '\0';
    if (name[0] == '\0')
        strcpy(name, "stranger");
    printf("Hello, %s!\n", name);
    size_t length = strlen(name);
    for (size_t i = 0; i < length / 2; i++) {
        char c = name[i];
        name[i] = name[length - 1 - i];
        name[length - 1 - i] = c;
    }
    for (char *p = name; *p; p++)
        *p = (char)toupper((unsigned char)*p);
    printf("Backwards in capitals: %s (%zu characters)\n", name, length);
    return 0;
}
