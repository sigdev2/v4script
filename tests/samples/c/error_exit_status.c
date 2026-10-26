// A status returned from main is exit(status): the atexit functions run.
#include <stdio.h>
#include <stdlib.h>

static void cleanup(void)
{
    printf("cleanup\n");
}

int main(void)
{
    atexit(cleanup);
    printf("failing\n");
    return 2;
}

// Output:
// failing
// cleanup
// Error: exit status 2
