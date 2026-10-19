// A method on null - a NullPointerException.
import java.util.*;

Map<String, String> capitals = new HashMap<>();
capitals.put("France", "Paris");
String city = capitals.get("Spain");
System.out.println(city.length());

// Error: java.lang.NullPointerException
// Line: 7
