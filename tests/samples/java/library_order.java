// The library in the order a program uses it: Collection before List keeps
// the methods of List apart (remove(int) removes by index); Appendable;
// null in String.format.
import java.io.IOException;
import java.util.*;

public class Main {
    static int size(Collection<Integer> values) { return values.size(); }

    static void write(Appendable out) throws IOException {
        out.append("y").append('z').append("abcdef", 1, 3);
    }

    public static void main(String[] args) throws IOException {
        List<Integer> list = new ArrayList<>(List.of(1, 2, 3));
        list.remove(1);
        list.remove(Integer.valueOf(3));
        System.out.println(list + " " + size(list));
        StringBuilder text = new StringBuilder("x");
        write(text);
        System.out.println(text);
        System.out.println(String.format("%.2f|%5s|%d|%b|%S", null, null, null, null, null));
    }
}

// Output:
// [1] 1
// xyzbc
// nu| null|null|false|NULL
