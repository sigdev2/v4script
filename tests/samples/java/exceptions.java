// Exceptions: own classes, chains of causes, finally, try with resources,
// multi-catch, library exceptions and their texts.
import java.util.*;

public class Main {
    static class InsufficientFundsException extends Exception {
        private final int shortage;
        InsufficientFundsException(String message, int shortage) {
            super(message);
            this.shortage = shortage;
        }
        int getShortage() { return shortage; }
    }

    static class Account {
        private int balance;
        Account(int balance) { this.balance = balance; }
        void withdraw(int amount) throws InsufficientFundsException {
            if (amount > balance)
                throw new InsufficientFundsException("need " + amount + ", have " + balance, amount - balance);
            balance -= amount;
        }
    }

    static class Resource implements AutoCloseable {
        private final String name;
        Resource(String name) {
            this.name = name;
            System.out.println("open " + name);
        }
        public void close() { System.out.println("close " + name); }
    }

    static int depth(int n) {
        try {
            if (n == 0)
                throw new IllegalStateException("bottom");
            return depth(n - 1);
        } finally {
            if (n == 2)
                System.out.println("finally at 2");
        }
    }

    static String attempt(Runnable action) {
        try {
            action.run();
            return "ok";
        } catch (ArithmeticException | ArrayIndexOutOfBoundsException e) {
            return "math/array: " + e.getMessage();
        } catch (RuntimeException e) {
            return e.getClass().getSimpleName() + ": " + e.getMessage();
        }
    }

    public static void main(String[] args) {
        Account account = new Account(100);
        try {
            account.withdraw(30);
            account.withdraw(100);
            System.out.println("not reached");
        } catch (InsufficientFundsException e) {
            System.out.println(e.getMessage() + " (short " + e.getShortage() + ")");
            System.out.println(e);
        }
        try (Resource a = new Resource("A"); Resource b = new Resource("B")) {
            System.out.println("body");
            throw new RuntimeException("inside");
        } catch (RuntimeException e) {
            System.out.println("caught " + e.getMessage());
        } finally {
            System.out.println("finally");
        }
        try {
            depth(3);
        } catch (IllegalStateException e) {
            System.out.println("depth: " + e.getMessage());
        }
        int[] array = new int[3];
        List<Integer> list = new ArrayList<>();
        Map<String, Integer> map = new HashMap<>();
        Object text = "text";
        System.out.println(attempt(() -> System.out.println(10 / (array.length - 3))));
        System.out.println(attempt(() -> array[5] = 1));
        System.out.println(attempt(() -> new ArrayList<Integer>().get(2)));
        System.out.println(attempt(() -> System.out.println(((Integer) text) + 1)));
        System.out.println(attempt(() -> Integer.parseInt("12a")));
        System.out.println(attempt(() -> System.out.println(Objects.requireNonNull(map.get("missing"), "no value"))));
        System.out.println(attempt(() -> List.of(1, 2).add(3)));
        System.out.println(attempt(() -> new ArrayDeque<Integer>().pop()));
        System.out.println(attempt(() -> "abc".substring(5)));
        System.out.println(attempt(() -> Optional.empty().get()));
        System.out.println(attempt(() -> new int[-1].clone()));
        System.out.println(attempt(() -> {
            for (Integer x : shared = new ArrayList<>(List.of(1, 2, 3)))
                if (x == 2)
                    shared.remove(x);
        }));
        try {
            try {
                throw new IllegalArgumentException("low");
            } catch (IllegalArgumentException e) {
                throw new RuntimeException("high", e);
            }
        } catch (RuntimeException e) {
            System.out.println(e.getMessage() + " <- " + e.getCause().getMessage() + " " + (e.getCause() instanceof IllegalArgumentException));
        }
        System.out.println(finallyWins());
    }

    static List<Integer> shared;

    @SuppressWarnings("finally")
    static int finallyWins() {
        try {
            return 1;
        } finally {
            System.out.println("in finally");
        }
    }
}

// Output:
// need 100, have 70 (short 30)
// Main$InsufficientFundsException: need 100, have 70
// open A
// open B
// body
// close B
// close A
// caught inside
// finally
// finally at 2
// depth: bottom
// math/array: / by zero
// math/array: Index 5 out of bounds for length 3
// IndexOutOfBoundsException: Index 2 out of bounds for length 0
// ClassCastException: class java.lang.String cannot be cast to class java.lang.Integer (java.lang.String and java.lang.Integer are in module java.base of loader 'bootstrap')
// NumberFormatException: For input string: "12a"
// NullPointerException: no value
// UnsupportedOperationException: null
// NoSuchElementException: null
// StringIndexOutOfBoundsException: Range [5, 3) out of bounds for length 3
// NoSuchElementException: No value present
// NegativeArraySizeException: -1
// ok
// high <- low true
// in finally
// 1
