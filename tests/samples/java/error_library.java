// An exception from the library - the line of the call in the unit.
import java.util.*;

List<Integer> list = new ArrayList<>(List.of(1, 2, 3));
System.out.println(list.get(1));
System.out.println(list.get(5));

// Output:
// 2
// Error: java.lang.IndexOutOfBoundsException: Index 5 out of bounds for length 3
// Line: 6
