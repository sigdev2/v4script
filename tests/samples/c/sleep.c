#include <stdio.h>
#include <unistd.h>

static void tick(int n)
{
    for (int i = 0; i < n; i++) {
        printf("tick %d\n", i);
        usleep(20000);
    }
}

static int (*callback)(int) = NULL;

static int slow_double(int x)
{
    usleep(1000);
    return 2 * x;
}

int main(void)
{
    tick(3);
    callback = slow_double;
    printf("%d\n", callback(21));
    sleep(0);
    printf("done\n");
    return 0;
}

// Output:
// tick 0
// tick 1
// tick 2
// 42
// done
