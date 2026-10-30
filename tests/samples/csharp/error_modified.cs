// A list changed while foreach goes over it.
var list = new List<int> { 1, 2, 3 };
foreach (var item in list)
    if (item == 2)
        list.Remove(item);

// Error: Unhandled exception. System.InvalidOperationException: Collection was modified; enumeration operation may not execute.
// Line: 3
