// An own exception without a handler: its class and text.
public class Main {
    static class ValidationException extends RuntimeException {
        ValidationException(String message) { super(message); }
    }

    static void check(int age) {
        if (age < 0)
            throw new ValidationException("age must be positive: " + age);
    }

    public static void main(String[] args) {
        check(30);
        check(-5);
    }
}

// Error: Exception in thread "main" Main$ValidationException: age must be positive: -5
// Line: 9
