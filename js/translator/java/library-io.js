// Java: the java.io library - output to the console of the host
// (PrintStream), standard input of the host, I/O exceptions.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Java = T.java;
    if (Java.library.units['java.io'])
        return;

    Java.addLibrary('java.io', 'java.io', String.raw`
public interface Serializable {}

public interface Closeable extends AutoCloseable {
    void close() throws IOException;
}

public interface Flushable {
    void flush() throws IOException;
}

public class PrintStream implements Closeable, Flushable {
    private final boolean error;
    private PrintStream(boolean error) { this.error = error; }
    public static PrintStream console(boolean error) { return new PrintStream(error); }
    public native void print(String value);
    public native void print(Object value);
    public native void print(char[] value);
    public native void print(boolean value);
    public native void print(char value);
    public native void print(int value);
    public native void print(long value);
    public native void print(float value);
    public native void print(double value);
    public native void println();
    public native void println(String value);
    public native void println(Object value);
    public native void println(char[] value);
    public native void println(boolean value);
    public native void println(char value);
    public native void println(int value);
    public native void println(long value);
    public native void println(float value);
    public native void println(double value);
    public native PrintStream printf(String format, Object... args);
    public native PrintStream format(String format, Object... args);
    public native PrintStream append(CharSequence text);
    public native PrintStream append(char ch);
    public native void write(int value);
    public void flush() {}
    public void close() {}
}

public class InputStream implements Closeable {
    public InputStream() {}
    public int read() throws IOException { return -1; }
    public int read(byte[] buffer) throws IOException { return read(buffer, 0, buffer.length); }
    public int read(byte[] buffer, int offset, int length) throws IOException {
        int count = 0;
        while (count < length) {
            int value = read();
            if (value < 0)
                break;
            buffer[offset + count++] = (byte) value;
            if (value == 10)
                break;
        }
        return count == 0 && length > 0 ? -1 : count;
    }
    public int available() throws IOException { return 0; }
    // The next line with its line break, null at the end: Scanner and
    // InputStreamReader read text by lines (bytes as Latin-1 here; System.in
    // gives text of the host).
    public String readLineText() {
        StringBuilder line = new StringBuilder();
        int value;
        while ((value = read()) >= 0) {
            line.append((char) value);
            if (value == 10)
                break;
        }
        return line.length() == 0 ? null : line.toString();
    }
    public void close() {}
}

// System.in: standard input of the host.
final class StandardInputStream extends InputStream {
    StandardInputStream() {}
    public native int read();
    public native int available();
    public native String readLineText();
}

public abstract class Reader implements Closeable {
    protected Reader() {}
    public abstract int read(char[] buffer, int offset, int length) throws IOException;
    public int read() throws IOException {
        char[] one = new char[1];
        return read(one, 0, 1) < 0 ? -1 : one[0];
    }
    public int read(char[] buffer) throws IOException { return read(buffer, 0, buffer.length); }
    public boolean ready() throws IOException { return false; }
    public void close() throws IOException {}
    String readLineText() throws IOException {
        StringBuilder line = new StringBuilder();
        int value;
        while ((value = read()) >= 0) {
            line.append((char) value);
            if (value == 10)
                break;
        }
        return line.length() == 0 ? null : line.toString();
    }
}

public class StringReader extends Reader {
    private final String text;
    private int position;
    public StringReader(String text) { this.text = text; }
    public int read(char[] buffer, int offset, int length) {
        if (length == 0)
            return 0;
        if (position >= text.length())
            return -1;
        int count = Math.min(length, text.length() - position);
        for (int i = 0; i < count; i++)
            buffer[offset + i] = text.charAt(position + i);
        position += count;
        return count;
    }
    public boolean ready() { return true; }
}

public class InputStreamReader extends Reader {
    private final InputStream in;
    private String pending = "";
    public InputStreamReader(InputStream in) { this.in = in; }
    public InputStreamReader(InputStream in, String charsetName) { this.in = in; }
    public int read(char[] buffer, int offset, int length) throws IOException {
        if (length == 0)
            return 0;
        if (pending.isEmpty()) {
            String line = in.readLineText();
            if (line == null)
                return -1;
            pending = line;
        }
        int count = Math.min(length, pending.length());
        for (int i = 0; i < count; i++)
            buffer[offset + i] = pending.charAt(i);
        pending = pending.substring(count);
        return count;
    }
    String readLineText() throws IOException {
        if (!pending.isEmpty()) {
            String rest = pending;
            pending = "";
            return rest;
        }
        return in.readLineText();
    }
    public boolean ready() throws IOException { return !pending.isEmpty() || in.available() > 0; }
    public void close() throws IOException { in.close(); }
}

public class BufferedReader extends Reader {
    private final Reader in;
    private String pending = "";
    public BufferedReader(Reader in) { this.in = in; }
    public BufferedReader(Reader in, int size) { this.in = in; }
    private boolean fill() throws IOException {
        String line = in.readLineText();
        if (line == null)
            return false;
        pending += line;
        return true;
    }
    public String readLine() throws IOException {
        int end = pending.indexOf('\n');
        while (end < 0 && fill())
            end = pending.indexOf('\n');
        if (end < 0) {
            if (pending.isEmpty())
                return null;
            String rest = pending;
            pending = "";
            return rest;
        }
        String line = pending.substring(0, end);
        pending = pending.substring(end + 1);
        return line.endsWith("\r") ? line.substring(0, line.length() - 1) : line;
    }
    public int read(char[] buffer, int offset, int length) throws IOException {
        if (length == 0)
            return 0;
        if (pending.isEmpty() && !fill())
            return -1;
        int count = Math.min(length, pending.length());
        for (int i = 0; i < count; i++)
            buffer[offset + i] = pending.charAt(i);
        pending = pending.substring(count);
        return count;
    }
    String readLineText() throws IOException {
        if (!pending.isEmpty()) {
            String rest = pending;
            pending = "";
            return rest;
        }
        return in.readLineText();
    }
    public boolean ready() throws IOException { return !pending.isEmpty() || in.ready(); }
    public java.util.stream.Stream<String> lines() {
        BufferedReader self = this;
        return java.util.stream.StreamSupport.ofIterator(new java.util.Iterator<String>() {
            private String next;
            private boolean done;
            public boolean hasNext() {
                if (next == null && !done) {
                    try {
                        next = self.readLine();
                    } catch (IOException e) {
                        throw new UncheckedIOException(e);
                    }
                    done = next == null;
                }
                return next != null;
            }
            public String next() {
                if (!hasNext())
                    throw new java.util.NoSuchElementException();
                String line = next;
                next = null;
                return line;
            }
        });
    }
    public void close() throws IOException { in.close(); }
}
`);

    Java.addLibrary('java.io.exceptions', 'java.io', Java.exceptionSource([
        ['IOException', 'Exception'], ['FileNotFoundException', 'IOException'], ['EOFException', 'IOException']
    ]) + String.raw`
public class UncheckedIOException extends RuntimeException {
    public UncheckedIOException(String message, IOException cause) { super(message, cause); }
    public UncheckedIOException(IOException cause) { super(cause); }
}
`);
})(globalThis);
