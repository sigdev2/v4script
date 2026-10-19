// Standard input of the host: Scanner and BufferedReader over System.in.
import java.io.*;
import java.util.*;

Scanner in = new Scanner(System.in);
System.out.print("Name? ");
String name = in.next();
System.out.println("Hi " + name);
int a = in.nextInt(), b = in.nextInt();
System.out.println(a + b);
System.out.println("[" + in.nextLine() + "]");
BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));
String line;
while ((line = reader.readLine()) != null)
    System.out.println("line: " + line);
System.out.println(in.hasNextLine());

// Input:
// Bob
// 3 4 rest
// x
// y
// Output:
// Name? Hi Bob
// 7
// [ rest]
// line: x
// line: y
// false
