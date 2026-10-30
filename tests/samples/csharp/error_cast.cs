// Unboxing to a wrong type.
object value = "text";
Console.WriteLine("before");
int number = (int)value;

// Output:
// before
// Error: Unhandled exception. System.InvalidCastException: Unable to cast object of type 'System.String' to type 'System.Int32'.
// Line: 4
