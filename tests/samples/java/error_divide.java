// Division by zero - an ArithmeticException on the line where it happened.
public class Main {
    static int ratio(int a, int b) {
        return a / b;
    }

    public static void main(String[] args) {
        System.out.println(ratio(10, 2));
        System.out.println(ratio(1, 0));
    }
}

// Output:
// 5
// Error: Exception in thread "main" java.lang.ArithmeticException: / by zero
// Line: 4
