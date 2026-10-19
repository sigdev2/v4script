// Hello: Scanner on standard input, strings and a StringBuilder.
import java.util.Scanner;

public class Hello {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        System.out.print("What is your name? ");
        String name = in.hasNextLine() ? in.nextLine().trim() : "";
        if (name.isEmpty())
            name = "stranger";
        System.out.println("Hello, " + name + "!");
        System.out.println("Backwards: " + new StringBuilder(name).reverse());
        System.out.printf("%d letters, the first is '%c'%n", name.length(), name.charAt(0));
    }
}
