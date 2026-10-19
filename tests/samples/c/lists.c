#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct Node {
    int value;
    struct Node *next;
} Node;

static Node *push(Node *head, int value)
{
    Node *node = malloc(sizeof(Node));
    node->value = value;
    node->next = head;
    return node;
}

static Node *reverse(Node *head)
{
    Node *previous = NULL;
    while (head) {
        Node *next = head->next;
        head->next = previous;
        previous = head;
        head = next;
    }
    return previous;
}

static void release(Node *head)
{
    while (head) {
        Node *next = head->next;
        free(head);
        head = next;
    }
}

typedef struct Tree {
    char *key;
    int count;
    struct Tree *left, *right;
} Tree;

static Tree *insert(Tree *tree, const char *key)
{
    if (tree == NULL) {
        tree = calloc(1, sizeof *tree);
        tree->key = strdup(key);
        tree->count = 1;
        return tree;
    }
    int order = strcmp(key, tree->key);
    if (order == 0)
        tree->count++;
    else if (order < 0)
        tree->left = insert(tree->left, key);
    else
        tree->right = insert(tree->right, key);
    return tree;
}

static void print(const Tree *tree)
{
    if (!tree)
        return;
    print(tree->left);
    printf("%s=%d ", tree->key, tree->count);
    print(tree->right);
}

static int depth(const Tree *tree)
{
    if (!tree)
        return 0;
    int l = depth(tree->left), r = depth(tree->right);
    return 1 + (l > r ? l : r);
}

typedef struct {
    int *items;
    size_t length, capacity;
} Vector;

static void append(Vector *v, int item)
{
    if (v->length == v->capacity) {
        v->capacity = v->capacity ? v->capacity * 2 : 4;
        v->items = realloc(v->items, v->capacity * sizeof *v->items);
    }
    v->items[v->length++] = item;
}

int main(void)
{
    Node *list = NULL;
    for (int i = 1; i <= 5; i++)
        list = push(list, i * i);
    list = reverse(list);
    for (Node *n = list; n; n = n->next)
        printf("%d ", n->value);
    printf("\n");
    release(list);

    char text[] = "the quick brown fox jumps over the lazy dog the end";
    Tree *tree = NULL;
    for (char *word = strtok(text, " "); word; word = strtok(NULL, " "))
        tree = insert(tree, word);
    print(tree);
    printf("\n%d\n", depth(tree));

    Vector v = { 0 };
    for (int i = 0; i < 1000; i++)
        append(&v, i % 7);
    long sum = 0;
    for (size_t i = 0; i < v.length; i++)
        sum += v.items[i];
    printf("%zu %zu %ld\n", v.length, v.capacity, sum);
    free(v.items);
    return 0;
}

// Output:
// 1 4 9 16 25
// brown=1 dog=1 end=1 fox=1 jumps=1 lazy=1 over=1 quick=1 the=3
// 7
// 1000 1024 2997
