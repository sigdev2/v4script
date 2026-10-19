// A linked list: malloc, pointers to pointers, reversing in place, free.
#include <stdio.h>
#include <stdlib.h>

typedef struct Node {
    int value;
    struct Node *next;
} Node;

static void push_back(Node **head, int value)
{
    while (*head != NULL)
        head = &(*head)->next;
    *head = malloc(sizeof(Node));
    (*head)->value = value;
    (*head)->next = NULL;
}

static Node *reverse(Node *head)
{
    Node *previous = NULL;
    while (head != NULL) {
        Node *next = head->next;
        head->next = previous;
        previous = head;
        head = next;
    }
    return previous;
}

static void print(const char *title, const Node *node)
{
    printf("%-9s", title);
    for (; node != NULL; node = node->next)
        printf(" %d", node->value);
    printf("\n");
}

int main(void)
{
    Node *list = NULL;
    for (int i = 1; i <= 10; i++)
        push_back(&list, i * i);
    print("List:", list);
    list = reverse(list);
    print("Reversed:", list);
    while (list != NULL) {
        Node *next = list->next;
        printf("free %p (%d)\n", (void *)list, list->value);
        free(list);
        list = next;
    }
    return 0;
}
