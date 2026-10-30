// C#: the System library, part 2 - exceptions, Console and the text
// writers, Math, Convert, Environment, Random, Type, tuples, Lazy,
// HashCode, BitConverter, TimeSpan and DateTime, globalization and
// reflection stubs.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    if (CS.library.units['system.exceptions/Exception'])
        return;

    CS.addLibrary('system.exceptions', String.raw`
namespace System;

public class Exception
{
    private string _message;
    private Exception _innerException;
    public Exception() { }
    public Exception(string message) { _message = message; }
    public Exception(string message, Exception innerException)
    {
        _message = message;
        _innerException = innerException;
    }
    public virtual string Message => _message ?? "Exception of type '" + GetType().FullName + "' was thrown.";
    public Exception InnerException => _innerException;
    public virtual string StackTrace => null;
    public virtual string Source { get; set; }
    public string HelpLink { get; set; }
    public int HResult { get; set; }
    public virtual System.Collections.IDictionary Data => null;
    public virtual Exception GetBaseException()
    {
        Exception inner = InnerException;
        Exception back = this;
        while (inner != null)
        {
            back = inner;
            inner = inner.InnerException;
        }
        return back;
    }
    public override string ToString()
    {
        string className = GetType().FullName;
        string message = Message;
        string text = string.IsNullOrEmpty(message) ? className : className + ": " + message;
        if (_innerException != null)
            text = text + Environment.NewLine + " ---> " + _innerException.ToString() + Environment.NewLine + "   --- End of inner exception stack trace ---";
        return text;
    }
}

public class SystemException : Exception
{
    public SystemException() : base("System error.") { }
    public SystemException(string message) : base(message) { }
    public SystemException(string message, Exception innerException) : base(message, innerException) { }
}

public class ApplicationException : Exception
{
    public ApplicationException() : base("Error in the application.") { }
    public ApplicationException(string message) : base(message) { }
    public ApplicationException(string message, Exception innerException) : base(message, innerException) { }
}

public class ArgumentException : SystemException
{
    private string _paramName;
    public ArgumentException() : base("Value does not fall within the expected range.") { }
    public ArgumentException(string message) : base(message) { }
    public ArgumentException(string message, Exception innerException) : base(message, innerException) { }
    public ArgumentException(string message, string paramName) : base(message) { _paramName = paramName; }
    public ArgumentException(string message, string paramName, Exception innerException) : base(message, innerException) { _paramName = paramName; }
    public virtual string ParamName => _paramName;
    public override string Message
    {
        get
        {
            string message = base.Message;
            if (!string.IsNullOrEmpty(_paramName))
                return message + " (Parameter '" + _paramName + "')";
            return message;
        }
    }
    public static void ThrowIfNullOrEmpty(string argument, string paramName = null)
    {
        if (argument == null)
            throw new ArgumentNullException(paramName);
        if (argument.Length == 0)
            throw new ArgumentException("The value cannot be an empty string.", paramName);
    }
}

public class ArgumentNullException : ArgumentException
{
    public ArgumentNullException() : base("Value cannot be null.") { }
    public ArgumentNullException(string paramName) : base("Value cannot be null.", paramName) { }
    public ArgumentNullException(string paramName, string message) : base(message, paramName) { }
    public ArgumentNullException(string message, Exception innerException) : base(message, innerException) { }
    public static void ThrowIfNull(object argument, string paramName = null)
    {
        if (argument == null)
            throw new ArgumentNullException(paramName);
    }
}

public class ArgumentOutOfRangeException : ArgumentException
{
    private object _actualValue;
    public ArgumentOutOfRangeException() : base("Specified argument was out of the range of valid values.") { }
    public ArgumentOutOfRangeException(string paramName) : base("Specified argument was out of the range of valid values.", paramName) { }
    public ArgumentOutOfRangeException(string paramName, string message) : base(message, paramName) { }
    public ArgumentOutOfRangeException(string paramName, object actualValue, string message) : base(message, paramName) { _actualValue = actualValue; }
    public ArgumentOutOfRangeException(string message, Exception innerException) : base(message, innerException) { }
    public virtual object ActualValue => _actualValue;
    public override string Message
    {
        get
        {
            string message = base.Message;
            if (_actualValue != null)
                return message + Environment.NewLine + "Actual value was " + _actualValue.ToString() + ".";
            return message;
        }
    }
    public static void ThrowIfNegative(int value, string paramName = null)
    {
        if (value < 0)
            throw new ArgumentOutOfRangeException(paramName, value, paramName + " ('" + value + "') must be a non-negative value.");
    }
    public static void ThrowIfZero(int value, string paramName = null)
    {
        if (value == 0)
            throw new ArgumentOutOfRangeException(paramName, value, paramName + " ('" + value + "') must be a non-zero value.");
    }
    public static void ThrowIfNegativeOrZero(int value, string paramName = null)
    {
        if (value <= 0)
            throw new ArgumentOutOfRangeException(paramName, value, paramName + " ('" + value + "') must be a non-negative and non-zero value.");
    }
    public static void ThrowIfGreaterThan(int value, int other, string paramName = null)
    {
        if (value > other)
            throw new ArgumentOutOfRangeException(paramName, value, paramName + " ('" + value + "') must be less than or equal to '" + other + "'.");
    }
    public static void ThrowIfLessThan(int value, int other, string paramName = null)
    {
        if (value < other)
            throw new ArgumentOutOfRangeException(paramName, value, paramName + " ('" + value + "') must be greater than or equal to '" + other + "'.");
    }
}

public class ArithmeticException : SystemException
{
    public ArithmeticException() : base("Overflow or underflow in the arithmetic operation.") { }
    public ArithmeticException(string message) : base(message) { }
    public ArithmeticException(string message, Exception innerException) : base(message, innerException) { }
}

public class DivideByZeroException : ArithmeticException
{
    public DivideByZeroException() : base("Attempted to divide by zero.") { }
    public DivideByZeroException(string message) : base(message) { }
    public DivideByZeroException(string message, Exception innerException) : base(message, innerException) { }
}

public class OverflowException : ArithmeticException
{
    public OverflowException() : base("Arithmetic operation resulted in an overflow.") { }
    public OverflowException(string message) : base(message) { }
    public OverflowException(string message, Exception innerException) : base(message, innerException) { }
}

public class NotFiniteNumberException : ArithmeticException
{
    public NotFiniteNumberException() : base("Number encountered was not a finite quantity.") { }
    public NotFiniteNumberException(string message) : base(message) { }
}

public class FormatException : SystemException
{
    public FormatException() : base("One of the identified items was in an invalid format.") { }
    public FormatException(string message) : base(message) { }
    public FormatException(string message, Exception innerException) : base(message, innerException) { }
}

public class IndexOutOfRangeException : SystemException
{
    public IndexOutOfRangeException() : base("Index was outside the bounds of the array.") { }
    public IndexOutOfRangeException(string message) : base(message) { }
    public IndexOutOfRangeException(string message, Exception innerException) : base(message, innerException) { }
}

public class InvalidCastException : SystemException
{
    public InvalidCastException() : base("Specified cast is not valid.") { }
    public InvalidCastException(string message) : base(message) { }
    public InvalidCastException(string message, Exception innerException) : base(message, innerException) { }
}

public class InvalidOperationException : SystemException
{
    public InvalidOperationException() : base("Operation is not valid due to the current state of the object.") { }
    public InvalidOperationException(string message) : base(message) { }
    public InvalidOperationException(string message, Exception innerException) : base(message, innerException) { }
}

public class ObjectDisposedException : InvalidOperationException
{
    private string _objectName;
    public ObjectDisposedException(string objectName) : base("Cannot access a disposed object.") { _objectName = objectName; }
    public ObjectDisposedException(string objectName, string message) : base(message) { _objectName = objectName; }
    public string ObjectName => _objectName ?? "";
    public override string Message
    {
        get
        {
            if (string.IsNullOrEmpty(_objectName))
                return base.Message;
            return base.Message + Environment.NewLine + "Object name: '" + _objectName + "'.";
        }
    }
}

public class NotImplementedException : SystemException
{
    public NotImplementedException() : base("The method or operation is not implemented.") { }
    public NotImplementedException(string message) : base(message) { }
    public NotImplementedException(string message, Exception inner) : base(message, inner) { }
}

public class NotSupportedException : SystemException
{
    public NotSupportedException() : base("Specified method is not supported.") { }
    public NotSupportedException(string message) : base(message) { }
    public NotSupportedException(string message, Exception innerException) : base(message, innerException) { }
}

public class PlatformNotSupportedException : NotSupportedException
{
    public PlatformNotSupportedException() : base("Operation is not supported on this platform.") { }
    public PlatformNotSupportedException(string message) : base(message) { }
}

public class NullReferenceException : SystemException
{
    public NullReferenceException() : base("Object reference not set to an instance of an object.") { }
    public NullReferenceException(string message) : base(message) { }
    public NullReferenceException(string message, Exception innerException) : base(message, innerException) { }
}

public class RankException : SystemException
{
    public RankException() : base("Attempted to operate on an array with the incorrect number of dimensions.") { }
    public RankException(string message) : base(message) { }
}

public class ArrayTypeMismatchException : SystemException
{
    public ArrayTypeMismatchException() : base("Attempted to access an element as a type incompatible with the array.") { }
    public ArrayTypeMismatchException(string message) : base(message) { }
}

public class MissingMethodException : SystemException
{
    public MissingMethodException() : base("Attempted to access a missing method.") { }
    public MissingMethodException(string message) : base(message) { }
}

public class TimeoutException : SystemException
{
    public TimeoutException() : base("The operation has timed out.") { }
    public TimeoutException(string message) : base(message) { }
    public TimeoutException(string message, Exception innerException) : base(message, innerException) { }
}

public class StackOverflowException : SystemException
{
    public StackOverflowException() : base("Operation caused a stack overflow.") { }
    public StackOverflowException(string message) : base(message) { }
}

public class OutOfMemoryException : SystemException
{
    public OutOfMemoryException() : base("Insufficient memory to continue the execution of the program.") { }
    public OutOfMemoryException(string message) : base(message) { }
}

public class UnauthorizedAccessException : SystemException
{
    public UnauthorizedAccessException() : base("Attempted to perform an unauthorized operation.") { }
    public UnauthorizedAccessException(string message) : base(message) { }
}

public class OperationCanceledException : SystemException
{
    public OperationCanceledException() : base("The operation was canceled.") { }
    public OperationCanceledException(string message) : base(message) { }
    public OperationCanceledException(string message, Exception innerException) : base(message, innerException) { }
    public OperationCanceledException(System.Threading.CancellationToken token) : base("The operation was canceled.") { }
    public OperationCanceledException(string message, System.Threading.CancellationToken token) : base(message) { }
}

public class AggregateException : Exception
{
    private System.Collections.ObjectModel.ReadOnlyCollection<Exception> _inner;
    public AggregateException() : base("One or more errors occurred.") { _inner = new System.Collections.ObjectModel.ReadOnlyCollection<Exception>(new Exception[0]); }
    public AggregateException(string message) : base(message) { _inner = new System.Collections.ObjectModel.ReadOnlyCollection<Exception>(new Exception[0]); }
    public AggregateException(params Exception[] innerExceptions) : this("One or more errors occurred.", innerExceptions) { }
    public AggregateException(System.Collections.Generic.IEnumerable<Exception> innerExceptions) : this("One or more errors occurred.", System.Linq.Enumerable.ToArray(innerExceptions)) { }
    public AggregateException(string message, params Exception[] innerExceptions)
        : base(message, innerExceptions.Length > 0 ? innerExceptions[0] : null)
    {
        _inner = new System.Collections.ObjectModel.ReadOnlyCollection<Exception>(innerExceptions);
    }
    public System.Collections.ObjectModel.ReadOnlyCollection<Exception> InnerExceptions => _inner;
    public override string Message
    {
        get
        {
            if (_inner.Count == 0)
                return base.Message;
            var builder = new System.Text.StringBuilder(base.Message);
            foreach (var inner in _inner)
                builder.Append(" (").Append(inner.Message).Append(')');
            return builder.ToString();
        }
    }
    public AggregateException Flatten()
    {
        var list = new System.Collections.Generic.List<Exception>();
        var queue = new System.Collections.Generic.Queue<AggregateException>();
        queue.Enqueue(this);
        while (queue.Count > 0)
        {
            foreach (var inner in queue.Dequeue().InnerExceptions)
            {
                if (inner is AggregateException aggregate)
                    queue.Enqueue(aggregate);
                else
                    list.Add(inner);
            }
        }
        return new AggregateException(base.Message, list.ToArray());
    }
    public void Handle(Func<Exception, bool> predicate)
    {
        var unhandled = new System.Collections.Generic.List<Exception>();
        foreach (var inner in _inner)
            if (!predicate(inner))
                unhandled.Add(inner);
        if (unhandled.Count > 0)
            throw new AggregateException(base.Message, unhandled.ToArray());
    }
    public override string ToString()
    {
        var builder = new System.Text.StringBuilder(base.ToString());
        for (int i = 0; i < _inner.Count; i++)
        {
            builder.Append(Environment.NewLine).Append(" ---> (Inner Exception #").Append(i).Append(") ");
            builder.Append(_inner[i].ToString()).Append("<---").Append(Environment.NewLine);
        }
        return builder.ToString();
    }
}
`);

    CS.addLibrary('system.runtime', String.raw`
namespace System.Runtime.CompilerServices;

public sealed class SwitchExpressionException : InvalidOperationException
{
    public SwitchExpressionException() : base("Non-exhaustive switch expression failed to match its input.") { }
    public SwitchExpressionException(string message) : base(message) { }
    public SwitchExpressionException(object unmatchedValue) : base("Non-exhaustive switch expression failed to match its input." + Environment.NewLine + "Unmatched value was " + unmatchedValue + ".") { }
}

public sealed class IndexerNameAttribute : Attribute
{
    public IndexerNameAttribute(string indexerName) { }
}

public sealed class CallerMemberNameAttribute : Attribute { }
public sealed class CallerLineNumberAttribute : Attribute { }
public sealed class CallerFilePathAttribute : Attribute { }
public sealed class MethodImplAttribute : Attribute
{
    public MethodImplAttribute() { }
    public MethodImplAttribute(MethodImplOptions options) { }
}
public enum MethodImplOptions { AggressiveInlining = 256, NoInlining = 8 }
public sealed class ExtensionAttribute : Attribute { }
`);

    CS.addLibrary('system.diagnostics.codeanalysis', String.raw`
namespace System.Diagnostics.CodeAnalysis;

public sealed class NotNullWhenAttribute : Attribute
{
    public NotNullWhenAttribute(bool returnValue) { }
}
public sealed class MaybeNullWhenAttribute : Attribute
{
    public MaybeNullWhenAttribute(bool returnValue) { }
}
public sealed class NotNullAttribute : Attribute { }
public sealed class MaybeNullAttribute : Attribute { }
public sealed class AllowNullAttribute : Attribute { }
public sealed class DisallowNullAttribute : Attribute { }
public sealed class DoesNotReturnAttribute : Attribute { }
public sealed class SetsRequiredMembersAttribute : Attribute { }
`);

    CS.addLibrary('system.console', String.raw`
namespace System;

public static class Console
{
    public static extern System.IO.TextWriter Out { get; }
    public static extern System.IO.TextWriter Error { get; }
    public static extern System.IO.TextReader In { get; }
    public static extern void SetOut(System.IO.TextWriter newOut);
    public static extern void SetError(System.IO.TextWriter newError);
    public static extern void SetIn(System.IO.TextReader newIn);
    public static extern void WriteLine();
    public static extern void WriteLine(bool value);
    public static extern void WriteLine(char value);
    public static extern void WriteLine(char[] buffer);
    public static extern void WriteLine(char[] buffer, int index, int count);
    public static extern void WriteLine(decimal value);
    public static extern void WriteLine(double value);
    public static extern void WriteLine(float value);
    public static extern void WriteLine(int value);
    public static extern void WriteLine(uint value);
    public static extern void WriteLine(long value);
    public static extern void WriteLine(ulong value);
    public static extern void WriteLine(object value);
    public static extern void WriteLine(string value);
    public static extern void WriteLine(string format, object arg0);
    public static extern void WriteLine(string format, object arg0, object arg1);
    public static extern void WriteLine(string format, object arg0, object arg1, object arg2);
    public static extern void WriteLine(string format, params object[] arg);
    public static extern void Write(bool value);
    public static extern void Write(char value);
    public static extern void Write(char[] buffer);
    public static extern void Write(char[] buffer, int index, int count);
    public static extern void Write(decimal value);
    public static extern void Write(double value);
    public static extern void Write(float value);
    public static extern void Write(int value);
    public static extern void Write(uint value);
    public static extern void Write(long value);
    public static extern void Write(ulong value);
    public static extern void Write(object value);
    public static extern void Write(string value);
    public static extern void Write(string format, object arg0);
    public static extern void Write(string format, object arg0, object arg1);
    public static extern void Write(string format, object arg0, object arg1, object arg2);
    public static extern void Write(string format, params object[] arg);
    public static extern string ReadLine();
    public static extern int Read();
    public static extern ConsoleKeyInfo ReadKey();
    public static extern ConsoleKeyInfo ReadKey(bool intercept);
    public static extern bool KeyAvailable { get; }
    public static extern void Clear();
    public static extern void Beep();
    public static extern void ResetColor();
    public static extern ConsoleColor ForegroundColor { get; set; }
    public static extern ConsoleColor BackgroundColor { get; set; }
    public static extern string Title { get; set; }
    public static extern bool CursorVisible { get; set; }
    public static extern int CursorLeft { get; set; }
    public static extern int CursorTop { get; set; }
    public static extern int WindowWidth { get; set; }
    public static extern int WindowHeight { get; set; }
    public static extern int BufferWidth { get; set; }
    public static extern void SetCursorPosition(int left, int top);
    public static extern System.Text.Encoding OutputEncoding { get; set; }
    public static extern System.Text.Encoding InputEncoding { get; set; }
    public static extern bool IsOutputRedirected { get; }
    public static extern bool IsInputRedirected { get; }
}

public enum ConsoleColor
{
    Black = 0, DarkBlue = 1, DarkGreen = 2, DarkCyan = 3, DarkRed = 4, DarkMagenta = 5, DarkYellow = 6, Gray = 7,
    DarkGray = 8, Blue = 9, Green = 10, Cyan = 11, Red = 12, Magenta = 13, Yellow = 14, White = 15
}

public enum ConsoleKey
{
    Backspace = 8, Tab = 9, Enter = 13, Escape = 27, Spacebar = 32, LeftArrow = 37, UpArrow = 38, RightArrow = 39,
    DownArrow = 40, A = 65, B = 66, C = 67, D = 68, E = 69, F = 70, G = 71, H = 72, I = 73, J = 74, K = 75, L = 76, M = 77,
    N = 78, O = 79, P = 80, Q = 81, R = 82, S = 83, T = 84, U = 85, V = 86, W = 87, X = 88, Y = 89, Z = 90
}

public readonly struct ConsoleKeyInfo
{
    private readonly char _keyChar;
    private readonly ConsoleKey _key;
    public ConsoleKeyInfo(char keyChar, ConsoleKey key, bool shift, bool alt, bool control)
    {
        _keyChar = keyChar;
        _key = key;
    }
    public char KeyChar => _keyChar;
    public ConsoleKey Key => _key;
}
`);

    CS.addLibrary('system.io', String.raw`
namespace System.IO;

public abstract class TextWriter : IDisposable
{
    protected TextWriter() { }
    public virtual string NewLine { get; set; } = "\n";
    public abstract void Write(char value);
    public virtual void Write(string value)
    {
        if (value != null)
            foreach (char c in value)
                Write(c);
    }
    public virtual void Write(bool value) => Write(value ? "True" : "False");
    public virtual void Write(int value) => Write(value.ToString());
    public virtual void Write(uint value) => Write(value.ToString());
    public virtual void Write(long value) => Write(value.ToString());
    public virtual void Write(ulong value) => Write(value.ToString());
    public virtual void Write(float value) => Write(value.ToString());
    public virtual void Write(double value) => Write(value.ToString());
    public virtual void Write(decimal value) => Write(value.ToString());
    public virtual void Write(char[] buffer) => Write(new string(buffer));
    public virtual void Write(char[] buffer, int index, int count) => Write(new string(buffer, index, count));
    public virtual void Write(object value)
    {
        if (value != null)
            Write(value.ToString());
    }
    public virtual void Write(string format, object arg0) => Write(string.Format(format, arg0));
    public virtual void Write(string format, object arg0, object arg1) => Write(string.Format(format, arg0, arg1));
    public virtual void Write(string format, object arg0, object arg1, object arg2) => Write(string.Format(format, arg0, arg1, arg2));
    public virtual void Write(string format, params object[] arg) => Write(string.Format(format, arg));
    public virtual void WriteLine() => Write(NewLine);
    public virtual void WriteLine(string value) => Write((value ?? "") + NewLine);
    public virtual void Write(ReadOnlySpan<char> buffer) => Write(buffer.ToString());
    public virtual void WriteLine(ReadOnlySpan<char> buffer) => WriteLine(buffer.ToString());
    public virtual void WriteLine(char value) => Write(value.ToString() + NewLine);
    public virtual void WriteLine(bool value) => WriteLine(value ? "True" : "False");
    public virtual void WriteLine(int value) => WriteLine(value.ToString());
    public virtual void WriteLine(uint value) => WriteLine(value.ToString());
    public virtual void WriteLine(long value) => WriteLine(value.ToString());
    public virtual void WriteLine(ulong value) => WriteLine(value.ToString());
    public virtual void WriteLine(float value) => WriteLine(value.ToString());
    public virtual void WriteLine(double value) => WriteLine(value.ToString());
    public virtual void WriteLine(decimal value) => WriteLine(value.ToString());
    public virtual void WriteLine(char[] buffer) => WriteLine(new string(buffer));
    public virtual void WriteLine(object value) => WriteLine(value?.ToString());
    public virtual void WriteLine(string format, object arg0) => WriteLine(string.Format(format, arg0));
    public virtual void WriteLine(string format, object arg0, object arg1) => WriteLine(string.Format(format, arg0, arg1));
    public virtual void WriteLine(string format, object arg0, object arg1, object arg2) => WriteLine(string.Format(format, arg0, arg1, arg2));
    public virtual void WriteLine(string format, params object[] arg) => WriteLine(string.Format(format, arg));
    public virtual void Flush() { }
    public virtual void Close() => Dispose();
    public void Dispose() => Dispose(true);
    protected virtual void Dispose(bool disposing) { }
    public static readonly TextWriter Null = new StringWriter();
}

internal sealed class ConsoleWriter : TextWriter
{
    private readonly bool _error;
    public ConsoleWriter(bool error) { _error = error; }
    public override extern void Write(char value);
    public override extern void Write(string value);
    public override extern void Flush();
}

public class StringWriter : TextWriter
{
    private System.Text.StringBuilder _builder = new System.Text.StringBuilder();
    public StringWriter() { }
    public StringWriter(System.Text.StringBuilder builder) { _builder = builder; }
    public override void Write(char value) => _builder.Append(value);
    public override void Write(string value) => _builder.Append(value);
    public System.Text.StringBuilder GetStringBuilder() => _builder;
    public override string ToString() => _builder.ToString();
}

public abstract class TextReader : IDisposable
{
    protected TextReader() { }
    public virtual int Peek() => -1;
    public virtual int Read() => -1;
    public virtual string ReadLine()
    {
        var builder = new System.Text.StringBuilder();
        while (true)
        {
            int ch = Read();
            if (ch == -1)
                return builder.Length > 0 ? builder.ToString() : null;
            if (ch == '\r' || ch == '\n')
            {
                if (ch == '\r' && Peek() == '\n')
                    Read();
                return builder.ToString();
            }
            builder.Append((char)ch);
        }
    }
    public virtual string ReadToEnd()
    {
        var builder = new System.Text.StringBuilder();
        int ch;
        while ((ch = Read()) != -1)
            builder.Append((char)ch);
        return builder.ToString();
    }
    public virtual void Close() => Dispose();
    public void Dispose() => Dispose(true);
    protected virtual void Dispose(bool disposing) { }
    public static readonly TextReader Null = new StringReader("");
}

internal sealed class ConsoleReader : TextReader
{
    public override extern int Peek();
    public override extern int Read();
    public override extern string ReadLine();
    public override extern string ReadToEnd();
}

public class StringReader : TextReader
{
    private string _s;
    private int _pos;
    public StringReader(string s)
    {
        if (s == null)
            throw new ArgumentNullException("s");
        _s = s;
    }
    public override int Peek() => _pos < _s.Length ? _s[_pos] : -1;
    public override int Read() => _pos < _s.Length ? _s[_pos++] : -1;
    public override string ReadLine()
    {
        if (_pos >= _s.Length)
            return null;
        int start = _pos;
        while (_pos < _s.Length)
        {
            char ch = _s[_pos];
            if (ch == '\r' || ch == '\n')
            {
                string line = _s.Substring(start, _pos - start);
                _pos++;
                if (ch == '\r' && _pos < _s.Length && _s[_pos] == '\n')
                    _pos++;
                return line;
            }
            _pos++;
        }
        return _s.Substring(start);
    }
    public override string ReadToEnd()
    {
        string rest = _s.Substring(_pos);
        _pos = _s.Length;
        return rest;
    }
}

public class IOException : SystemException
{
    public IOException() : base("I/O error occurred.") { }
    public IOException(string message) : base(message) { }
    public IOException(string message, Exception innerException) : base(message, innerException) { }
}

public class FileNotFoundException : IOException
{
    private string _fileName;
    public FileNotFoundException() : base("Unable to find the specified file.") { }
    public FileNotFoundException(string message) : base(message) { }
    public FileNotFoundException(string message, string fileName) : base(message) { _fileName = fileName; }
    public string FileName => _fileName;
}

public class DirectoryNotFoundException : IOException
{
    public DirectoryNotFoundException() : base("Attempted to access a path that is not on the disk.") { }
    public DirectoryNotFoundException(string message) : base(message) { }
}

public class EndOfStreamException : IOException
{
    public EndOfStreamException() : base("Attempted to read past the end of the stream.") { }
    public EndOfStreamException(string message) : base(message) { }
}

public static class File
{
    public static extern bool Exists(string path);
    public static extern string ReadAllText(string path);
    public static extern string[] ReadAllLines(string path);
    public static System.Collections.Generic.IEnumerable<string> ReadLines(string path) => ReadAllLines(path);
    public static StreamReader OpenText(string path) => new StreamReader(path);
    public static extern void WriteAllText(string path, string contents);
    public static extern void AppendAllText(string path, string contents);
    public static extern void WriteAllLines(string path, string[] contents);
}

public class StreamReader : TextReader
{
    private StringReader _reader;
    public StreamReader(string path) { _reader = new StringReader(File.ReadAllText(path)); }
    public override int Peek() => _reader.Peek();
    public override int Read() => _reader.Read();
    public override string ReadLine() => _reader.ReadLine();
    public override string ReadToEnd() => _reader.ReadToEnd();
    public bool EndOfStream => _reader.Peek() < 0;
}

public static class Path
{
    public static string Combine(string path1, string path2)
    {
        if (path1.Length == 0)
            return path2;
        if (path2.StartsWith("/"))
            return path2;
        return path1.EndsWith("/") ? path1 + path2 : path1 + "/" + path2;
    }
    public static string GetFileName(string path)
    {
        int slash = path.LastIndexOf('/');
        return slash < 0 ? path : path.Substring(slash + 1);
    }
    public static string GetExtension(string path)
    {
        string name = GetFileName(path);
        int dot = name.LastIndexOf('.');
        return dot < 0 ? "" : name.Substring(dot);
    }
    public static string GetFileNameWithoutExtension(string path)
    {
        string name = GetFileName(path);
        int dot = name.LastIndexOf('.');
        return dot < 0 ? name : name.Substring(0, dot);
    }
    public static string GetDirectoryName(string path)
    {
        int slash = path.LastIndexOf('/');
        return slash < 0 ? "" : path.Substring(0, slash);
    }
    public static readonly char DirectorySeparatorChar = '/';
}
`);

    CS.addLibrary('system.math', String.raw`
namespace System;

public static class Math
{
    public const double PI = 3.14159265358979323846;
    public const double E = 2.7182818284590452354;
    public const double Tau = 6.28318530717958647692;
    public static extern int Abs(int value);
    public static extern long Abs(long value);
    public static extern short Abs(short value);
    public static extern sbyte Abs(sbyte value);
    public static extern double Abs(double value);
    public static extern float Abs(float value);
    public static extern decimal Abs(decimal value);
    public static extern int Max(int val1, int val2);
    public static extern uint Max(uint val1, uint val2);
    public static extern long Max(long val1, long val2);
    public static extern ulong Max(ulong val1, ulong val2);
    public static extern short Max(short val1, short val2);
    public static extern ushort Max(ushort val1, ushort val2);
    public static extern byte Max(byte val1, byte val2);
    public static extern sbyte Max(sbyte val1, sbyte val2);
    public static extern double Max(double val1, double val2);
    public static extern float Max(float val1, float val2);
    public static extern decimal Max(decimal val1, decimal val2);
    public static extern int Min(int val1, int val2);
    public static extern uint Min(uint val1, uint val2);
    public static extern long Min(long val1, long val2);
    public static extern ulong Min(ulong val1, ulong val2);
    public static extern short Min(short val1, short val2);
    public static extern ushort Min(ushort val1, ushort val2);
    public static extern byte Min(byte val1, byte val2);
    public static extern sbyte Min(sbyte val1, sbyte val2);
    public static extern double Min(double val1, double val2);
    public static extern float Min(float val1, float val2);
    public static extern decimal Min(decimal val1, decimal val2);
    public static extern double Pow(double x, double y);
    public static extern double Sqrt(double d);
    public static extern double Cbrt(double d);
    public static extern double Exp(double d);
    public static extern double Log(double d);
    public static extern double Log(double a, double newBase);
    public static extern double Log10(double d);
    public static extern double Log2(double d);
    public static extern double Sin(double a);
    public static extern double Cos(double d);
    public static extern double Tan(double a);
    public static extern double Asin(double d);
    public static extern double Acos(double d);
    public static extern double Atan(double d);
    public static extern double Atan2(double y, double x);
    public static extern double Sinh(double value);
    public static extern double Cosh(double value);
    public static extern double Tanh(double value);
    public static extern double Asinh(double d);
    public static extern double Acosh(double d);
    public static extern double Atanh(double d);
    public static extern double Floor(double d);
    public static extern decimal Floor(decimal d);
    public static extern double Ceiling(double a);
    public static extern decimal Ceiling(decimal d);
    public static extern double Truncate(double d);
    public static extern decimal Truncate(decimal d);
    public static extern double Round(double a);
    public static extern double Round(double value, int digits);
    public static extern double Round(double value, MidpointRounding mode);
    public static extern double Round(double value, int digits, MidpointRounding mode);
    public static extern decimal Round(decimal d);
    public static extern decimal Round(decimal d, int decimals);
    public static extern decimal Round(decimal d, MidpointRounding mode);
    public static extern decimal Round(decimal d, int decimals, MidpointRounding mode);
    public static extern int Sign(int value);
    public static extern int Sign(long value);
    public static extern int Sign(double value);
    public static extern int Sign(float value);
    public static extern int Sign(decimal value);
    public static extern int Sign(short value);
    public static extern int Sign(sbyte value);
    public static extern int Clamp(int value, int min, int max);
    public static extern long Clamp(long value, long min, long max);
    public static extern double Clamp(double value, double min, double max);
    public static extern float Clamp(float value, float min, float max);
    public static extern decimal Clamp(decimal value, decimal min, decimal max);
    public static extern byte Clamp(byte value, byte min, byte max);
    public static extern long BigMul(int a, int b);
    public static extern int DivRem(int a, int b, out int result);
    public static extern long DivRem(long a, long b, out long result);
    public static extern (int Quotient, int Remainder) DivRem(int left, int right);
    public static extern double IEEERemainder(double x, double y);
    public static extern double Hypot(double x, double y);
    public static extern double FusedMultiplyAdd(double x, double y, double z);
    public static extern double CopySign(double x, double y);
    public static extern double MaxMagnitude(double x, double y);
    public static extern double MinMagnitude(double x, double y);
    public static extern double BitIncrement(double x);
    public static extern double BitDecrement(double x);
    public static extern double ScaleB(double x, int n);
    public static extern int ILogB(double x);
}

public static class MathF
{
    public const float PI = 3.14159265f;
    public const float E = 2.71828183f;
    public static extern float Abs(float x);
    public static extern float Max(float x, float y);
    public static extern float Min(float x, float y);
    public static extern float Pow(float x, float y);
    public static extern float Sqrt(float x);
    public static extern float Sin(float x);
    public static extern float Cos(float x);
    public static extern float Tan(float x);
    public static extern float Atan2(float y, float x);
    public static extern float Exp(float x);
    public static extern float Log(float x);
    public static extern float Floor(float x);
    public static extern float Ceiling(float x);
    public static extern float Round(float x);
    public static extern float Round(float x, int digits);
    public static extern float Truncate(float x);
    public static extern int Sign(float x);
}
`);

    CS.addLibrary('system.convert', String.raw`
namespace System;

public static class Convert
{
    public static extern int ToInt32(string value);
    public static extern int ToInt32(string value, int fromBase);
    public static extern int ToInt32(string value, IFormatProvider provider);
    public static extern int ToInt32(double value);
    public static extern int ToInt32(float value);
    public static extern int ToInt32(decimal value);
    public static extern int ToInt32(long value);
    public static extern int ToInt32(ulong value);
    public static extern int ToInt32(uint value);
    public static extern int ToInt32(int value);
    public static extern int ToInt32(short value);
    public static extern int ToInt32(byte value);
    public static extern int ToInt32(char value);
    public static extern int ToInt32(bool value);
    public static extern int ToInt32(object value);
    public static extern long ToInt64(string value);
    public static extern long ToInt64(string value, int fromBase);
    public static extern long ToInt64(double value);
    public static extern long ToInt64(decimal value);
    public static extern long ToInt64(int value);
    public static extern long ToInt64(long value);
    public static extern long ToInt64(bool value);
    public static extern long ToInt64(object value);
    public static extern short ToInt16(string value);
    public static extern short ToInt16(int value);
    public static extern short ToInt16(double value);
    public static extern byte ToByte(string value);
    public static extern byte ToByte(string value, int fromBase);
    public static extern byte ToByte(int value);
    public static extern byte ToByte(double value);
    public static extern byte ToByte(char value);
    public static extern sbyte ToSByte(int value);
    public static extern uint ToUInt32(string value);
    public static extern uint ToUInt32(long value);
    public static extern uint ToUInt32(int value);
    public static extern uint ToUInt32(double value);
    public static extern ulong ToUInt64(string value);
    public static extern ulong ToUInt64(long value);
    public static extern ulong ToUInt64(double value);
    public static extern ushort ToUInt16(int value);
    public static extern double ToDouble(string value);
    public static extern double ToDouble(string value, IFormatProvider provider);
    public static extern double ToDouble(int value);
    public static extern double ToDouble(long value);
    public static extern double ToDouble(float value);
    public static extern double ToDouble(decimal value);
    public static extern double ToDouble(bool value);
    public static extern double ToDouble(object value);
    public static extern float ToSingle(string value);
    public static extern float ToSingle(double value);
    public static extern float ToSingle(int value);
    public static extern decimal ToDecimal(string value);
    public static extern decimal ToDecimal(string value, IFormatProvider provider);
    public static extern decimal ToDecimal(int value);
    public static extern decimal ToDecimal(long value);
    public static extern decimal ToDecimal(double value);
    public static extern decimal ToDecimal(float value);
    public static extern decimal ToDecimal(object value);
    public static extern bool ToBoolean(string value);
    public static extern bool ToBoolean(int value);
    public static extern bool ToBoolean(double value);
    public static extern bool ToBoolean(object value);
    public static extern char ToChar(int value);
    public static extern char ToChar(string value);
    public static extern char ToChar(byte value);
    public static extern char ToChar(object value);
    public static extern string ToString(int value);
    public static extern string ToString(int value, int toBase);
    public static extern string ToString(long value);
    public static extern string ToString(long value, int toBase);
    public static extern string ToString(short value, int toBase);
    public static extern string ToString(byte value, int toBase);
    public static extern string ToString(double value);
    public static extern string ToString(float value);
    public static extern string ToString(decimal value);
    public static extern string ToString(bool value);
    public static extern string ToString(char value);
    public static extern string ToString(object value);
    public static extern string ToString(double value, IFormatProvider provider);
    public static extern string ToBase64String(byte[] inArray);
    public static extern byte[] FromBase64String(string s);
    public static extern string ToHexString(byte[] inArray);
    public static extern byte[] FromHexString(string s);
    public static extern object ChangeType(object value, Type conversionType);
}

public static class BitConverter
{
    public static readonly bool IsLittleEndian = true;
    public static extern byte[] GetBytes(int value);
    public static extern byte[] GetBytes(long value);
    public static extern byte[] GetBytes(short value);
    public static extern byte[] GetBytes(double value);
    public static extern byte[] GetBytes(float value);
    public static extern byte[] GetBytes(bool value);
    public static extern byte[] GetBytes(char value);
    public static extern int ToInt32(byte[] value, int startIndex);
    public static extern long ToInt64(byte[] value, int startIndex);
    public static extern short ToInt16(byte[] value, int startIndex);
    public static extern double ToDouble(byte[] value, int startIndex);
    public static extern string ToString(byte[] value);
    public static extern long DoubleToInt64Bits(double value);
    public static extern double Int64BitsToDouble(long value);
    public static extern int SingleToInt32Bits(float value);
    public static extern float Int32BitsToSingle(int value);
}

public static class Environment
{
    public static readonly string NewLine = "\n";
    public static extern void Exit(int exitCode);
    public static extern void FailFast(string message);
    public static extern int TickCount { get; }
    public static extern long TickCount64 { get; }
    public static int ProcessorCount => 1;
    public static int CurrentManagedThreadId => 1;
    public static bool Is64BitProcess => true;
    public static bool Is64BitOperatingSystem => true;
    public static string MachineName => "v4script";
    public static string UserName => "user";
    public static string CurrentDirectory => "/";
    public static int ExitCode { get; set; }
    public static string StackTrace => "";
    public static extern string GetEnvironmentVariable(string variable);
    public static extern string[] GetCommandLineArgs();
    public static Version Version => new Version(8, 0, 0);
    public static extern bool HasShutdownStarted { get; }
}

public sealed class Version : IComparable<Version>, IEquatable<Version>
{
    public Version(int major, int minor) : this(major, minor, -1, -1) { }
    public Version(int major, int minor, int build) : this(major, minor, build, -1) { }
    public Version(int major, int minor, int build, int revision)
    {
        Major = major;
        Minor = minor;
        Build = build;
        Revision = revision;
    }
    public int Major { get; }
    public int Minor { get; }
    public int Build { get; }
    public int Revision { get; }
    public int CompareTo(Version value)
    {
        if (value == null)
            return 1;
        if (Major != value.Major)
            return Major > value.Major ? 1 : -1;
        if (Minor != value.Minor)
            return Minor > value.Minor ? 1 : -1;
        if (Build != value.Build)
            return Build > value.Build ? 1 : -1;
        if (Revision != value.Revision)
            return Revision > value.Revision ? 1 : -1;
        return 0;
    }
    public bool Equals(Version other) => other != null && CompareTo(other) == 0;
    public override bool Equals(object obj) => obj is Version other && Equals(other);
    public override int GetHashCode() => Major * 1000000 + Minor * 1000 + Build;
    public override string ToString()
    {
        string text = Major + "." + Minor;
        if (Build >= 0)
            text += "." + Build;
        if (Revision >= 0)
            text += "." + Revision;
        return text;
    }
}

public static class GC
{
    public static void Collect() { }
    public static void Collect(int generation) { }
    public static void WaitForPendingFinalizers() { }
    public static void SuppressFinalize(object obj) { }
    public static void KeepAlive(object obj) { }
    public static long GetTotalMemory(bool forceFullCollection) => 0;
    public static int MaxGeneration => 2;
}
`);

    CS.addLibrary('system.random', String.raw`
namespace System;

// The generator of .NET for a seed (the subtractive generator of Knuth,
// as in Numerical Recipes); without a seed it starts from the clock.
public class Random
{
    private const int MBIG = int.MaxValue;
    private const int MSEED = 161803398;
    private int _inext;
    private int _inextp;
    private int[] _seedArray = new int[56];
    private static Random _shared;

    public Random() : this(GenerateSeed()) { }

    public Random(int Seed)
    {
        int ii = 0;
        int mj, mk;
        int subtraction = (Seed == int.MinValue) ? int.MaxValue : Math.Abs(Seed);
        mj = MSEED - subtraction;
        _seedArray[55] = mj;
        mk = 1;
        for (int i = 1; i < 55; i++)
        {
            if ((ii += 21) >= 55)
                ii -= 55;
            _seedArray[ii] = mk;
            mk = mj - mk;
            if (mk < 0)
                mk += MBIG;
            mj = _seedArray[ii];
        }
        for (int k = 1; k < 5; k++)
        {
            for (int i = 1; i < 56; i++)
            {
                int n = i + 30;
                if (n >= 55)
                    n -= 55;
                _seedArray[i] -= _seedArray[1 + n];
                if (_seedArray[i] < 0)
                    _seedArray[i] += MBIG;
            }
        }
        _inext = 0;
        _inextp = 21;
    }

    private static extern int GenerateSeed();

    public static Random Shared => _shared ??= new Random();

    protected virtual double Sample() => InternalSample() * (1.0 / MBIG);

    private int InternalSample()
    {
        int locINext = _inext;
        if (++locINext >= 56)
            locINext = 1;
        int locINextp = _inextp;
        if (++locINextp >= 56)
            locINextp = 1;
        int retVal = _seedArray[locINext] - _seedArray[locINextp];
        if (retVal == MBIG)
            retVal--;
        if (retVal < 0)
            retVal += MBIG;
        _seedArray[locINext] = retVal;
        _inext = locINext;
        _inextp = locINextp;
        return retVal;
    }

    public virtual int Next() => InternalSample();

    public virtual int Next(int maxValue)
    {
        if (maxValue < 0)
            throw new ArgumentOutOfRangeException("maxValue", maxValue, "'maxValue' must be greater than zero.");
        return (int)(Sample() * maxValue);
    }

    public virtual int Next(int minValue, int maxValue)
    {
        if (minValue > maxValue)
            throw new ArgumentOutOfRangeException("minValue", minValue, "'minValue' cannot be greater than maxValue.");
        long range = (long)maxValue - minValue;
        if (range <= int.MaxValue)
            return (int)(Sample() * range) + minValue;
        return (int)((long)(GetSampleForLargeRange() * range) + minValue);
    }

    public virtual long NextInt64() => NextInt64(0, long.MaxValue);
    public virtual long NextInt64(long maxValue) => NextInt64(0, maxValue);
    public virtual long NextInt64(long minValue, long maxValue)
    {
        if (minValue > maxValue)
            throw new ArgumentOutOfRangeException("minValue", minValue, "'minValue' cannot be greater than maxValue.");
        double range = (double)maxValue - minValue;
        return minValue + (long)(GetSampleForLargeRange() * range);
    }

    private double GetSampleForLargeRange()
    {
        int result = InternalSample();
        bool negative = InternalSample() % 2 == 0;
        if (negative)
            result = -result;
        double d = result;
        d += (int.MaxValue - 1);
        d /= 2 * (uint)int.MaxValue - 1;
        return d;
    }

    public virtual double NextDouble() => Sample();

    public virtual float NextSingle() => (float)Sample();

    public virtual void NextBytes(byte[] buffer)
    {
        for (int i = 0; i < buffer.Length; i++)
            buffer[i] = (byte)(InternalSample() % (byte.MaxValue + 1));
    }

    public void Shuffle<T>(T[] values)
    {
        int n = values.Length;
        for (int i = 0; i < n - 1; i++)
        {
            int j = Next(i, n);
            if (j != i)
            {
                T temp = values[i];
                values[i] = values[j];
                values[j] = temp;
            }
        }
    }

    public T[] GetItems<T>(T[] choices, int length)
    {
        var result = new T[length];
        for (int i = 0; i < length; i++)
            result[i] = choices[Next(choices.Length)];
        return result;
    }
}
`);

    CS.addLibrary('system.type', String.raw`
namespace System;

public abstract class Type
{
    protected Type() { }
    public abstract string Name { get; }
    public abstract string FullName { get; }
    public abstract string Namespace { get; }
    public abstract bool IsValueType { get; }
    public abstract bool IsClass { get; }
    public abstract bool IsInterface { get; }
    public abstract bool IsEnum { get; }
    public abstract bool IsArray { get; }
    public abstract bool IsPrimitive { get; }
    public abstract bool IsAbstract { get; }
    public abstract bool IsSealed { get; }
    public abstract bool IsGenericType { get; }
    public abstract bool IsGenericTypeDefinition { get; }
    public abstract bool ContainsGenericParameters { get; }
    public abstract Type BaseType { get; }
    public abstract Type[] GetGenericArguments();
    public abstract Type GetGenericTypeDefinition();
    public abstract Type GetElementType();
    public abstract Type[] GetInterfaces();
    public abstract int GetArrayRank();
    public abstract bool IsAssignableFrom(Type c);
    public abstract bool IsInstanceOfType(object o);
    public abstract bool IsSubclassOf(Type c);
    public abstract Type MakeGenericType(params Type[] typeArguments);
    public abstract Type MakeArrayType();
    public abstract string AssemblyQualifiedName { get; }
    public static extern Type GetType(string typeName);
    public static extern TypeCode GetTypeCode(Type type);
    public static bool operator ==(Type left, Type right) => (object)left == (object)right;
    public static bool operator !=(Type left, Type right) => (object)left != (object)right;
    public override bool Equals(object o) => (object)this == o;
    public override int GetHashCode() => base.GetHashCode();
}

internal sealed class RuntimeType : Type
{
    public override extern string Name { get; }
    public override extern string FullName { get; }
    public override extern string Namespace { get; }
    public override extern bool IsValueType { get; }
    public override extern bool IsClass { get; }
    public override extern bool IsInterface { get; }
    public override extern bool IsEnum { get; }
    public override extern bool IsArray { get; }
    public override extern bool IsPrimitive { get; }
    public override extern bool IsAbstract { get; }
    public override extern bool IsSealed { get; }
    public override extern bool IsGenericType { get; }
    public override extern bool IsGenericTypeDefinition { get; }
    public override extern bool ContainsGenericParameters { get; }
    public override extern Type BaseType { get; }
    public override extern Type[] GetGenericArguments();
    public override extern Type GetGenericTypeDefinition();
    public override extern Type GetElementType();
    public override extern Type[] GetInterfaces();
    public override extern int GetArrayRank();
    public override extern bool IsAssignableFrom(Type c);
    public override extern bool IsInstanceOfType(object o);
    public override extern bool IsSubclassOf(Type c);
    public override extern Type MakeGenericType(params Type[] typeArguments);
    public override extern Type MakeArrayType();
    public override extern string AssemblyQualifiedName { get; }
    public override extern string ToString();
}

public static class Activator
{
    public static extern T CreateInstance<T>() where T : new();
    public static extern object CreateInstance(Type type);
    public static extern object CreateInstance(Type type, params object[] args);
}
`);

    CS.addLibrary('system.reflection', String.raw`
namespace System.Reflection;

public abstract class MemberInfo
{
    public abstract string Name { get; }
}

public abstract class MethodInfo : MemberInfo
{
}

internal sealed class RuntimeMethodInfo : MethodInfo
{
    private string _name;
    public RuntimeMethodInfo(string name) { _name = name; }
    public override string Name => _name;
    public override string ToString() => _name;
}
`);

    CS.addLibrary('system.globalization', String.raw`
namespace System.Globalization;

[Flags]
public enum NumberStyles
{
    None = 0, AllowLeadingWhite = 1, AllowTrailingWhite = 2, AllowLeadingSign = 4, AllowTrailingSign = 8,
    AllowParentheses = 16, AllowDecimalPoint = 32, AllowThousands = 64, AllowExponent = 128, AllowCurrencySymbol = 256,
    AllowHexSpecifier = 512, AllowBinarySpecifier = 1024, Integer = 7, HexNumber = 515, BinaryNumber = 1027, Number = 111,
    Float = 167, Currency = 383, Any = 511
}

[Flags]
public enum CompareOptions
{
    None = 0, IgnoreCase = 1, IgnoreNonSpace = 2, IgnoreSymbols = 4, IgnoreKanaType = 8, IgnoreWidth = 16,
    OrdinalIgnoreCase = 268435456, StringSort = 536870912, Ordinal = 1073741824
}

public class CultureInfo : IFormatProvider
{
    private string _name;
    public CultureInfo(string name) { _name = name; }
    public static CultureInfo InvariantCulture { get; } = new CultureInfo("");
    public static CultureInfo CurrentCulture { get; set; } = InvariantCulture;
    public static CultureInfo CurrentUICulture { get; set; } = InvariantCulture;
    public static CultureInfo GetCultureInfo(string name) => new CultureInfo(name);
    public string Name => _name;
    public string DisplayName => _name == "" ? "Invariant Language (Invariant Country)" : _name;
    public NumberFormatInfo NumberFormat => NumberFormatInfo.InvariantInfo;
    public CompareInfo CompareInfo => new CompareInfo();
    public TextInfo TextInfo => new TextInfo();
    public object GetFormat(Type formatType) => null;
    public override string ToString() => _name;
}

public sealed class NumberFormatInfo : IFormatProvider
{
    public static NumberFormatInfo InvariantInfo { get; } = new NumberFormatInfo();
    public static NumberFormatInfo CurrentInfo => InvariantInfo;
    public string NumberDecimalSeparator { get; set; } = ".";
    public string NumberGroupSeparator { get; set; } = ",";
    public string CurrencySymbol { get; set; } = "¤";
    public string NegativeSign { get; set; } = "-";
    public string PositiveSign { get; set; } = "+";
    public string PercentSymbol { get; set; } = "%";
    public string NaNSymbol { get; set; } = "NaN";
    public string PositiveInfinitySymbol { get; set; } = "Infinity";
    public string NegativeInfinitySymbol { get; set; } = "-Infinity";
    public object GetFormat(Type formatType) => null;
}

public sealed class CompareInfo
{
    public int Compare(string string1, string string2) => string.Compare(string1, string2);
    public int Compare(string string1, string string2, CompareOptions options) =>
        (options & CompareOptions.IgnoreCase) != 0 ? string.Compare(string1, string2, true) : string.Compare(string1, string2);
    public int IndexOf(string source, string value) => source.IndexOf(value);
}

public sealed class TextInfo
{
    public string ToUpper(string str) => str.ToUpperInvariant();
    public string ToLower(string str) => str.ToLowerInvariant();
    public extern string ToTitleCase(string str);
}
`);

    CS.addLibrary('system.tuples', String.raw`
namespace System;

public interface ITuple
{
    int Length { get; }
    object this[int index] { get; }
}

public struct ValueTuple : IEquatable<ValueTuple>
{
    public static ValueTuple Create() => new ValueTuple();
    public static ValueTuple<T1> Create<T1>(T1 item1) => new ValueTuple<T1>(item1);
    public static ValueTuple<T1, T2> Create<T1, T2>(T1 item1, T2 item2) => new ValueTuple<T1, T2>(item1, item2);
    public static ValueTuple<T1, T2, T3> Create<T1, T2, T3>(T1 item1, T2 item2, T3 item3) => new ValueTuple<T1, T2, T3>(item1, item2, item3);
    public static ValueTuple<T1, T2, T3, T4> Create<T1, T2, T3, T4>(T1 item1, T2 item2, T3 item3, T4 item4) =>
        new ValueTuple<T1, T2, T3, T4>(item1, item2, item3, item4);
    public bool Equals(ValueTuple other) => true;
    public override bool Equals(object obj) => obj is ValueTuple;
    public override int GetHashCode() => 0;
    public override string ToString() => "()";
}

public struct ValueTuple<T1> : IEquatable<ValueTuple<T1>>, IComparable<ValueTuple<T1>>, IComparable
{
    public T1 Item1;
    public ValueTuple(T1 item1) { Item1 = item1; }
    public bool Equals(ValueTuple<T1> other) => System.Collections.Generic.EqualityComparer<T1>.Default.Equals(Item1, other.Item1);
    public override bool Equals(object obj) => obj is ValueTuple<T1> other && Equals(other);
    public int CompareTo(ValueTuple<T1> other) => System.Collections.Generic.Comparer<T1>.Default.Compare(Item1, other.Item1);
    public int CompareTo(object other) => CompareTo((ValueTuple<T1>)other);
    public override int GetHashCode() => System.Collections.Generic.EqualityComparer<T1>.Default.GetHashCode(Item1);
    public override string ToString() => "(" + Item1 + ")";
}

public struct ValueTuple<T1, T2> : IEquatable<ValueTuple<T1, T2>>, IComparable<ValueTuple<T1, T2>>, IComparable, ITuple
{
    public T1 Item1;
    public T2 Item2;
    public ValueTuple(T1 item1, T2 item2)
    {
        Item1 = item1;
        Item2 = item2;
    }
    public bool Equals(ValueTuple<T1, T2> other) =>
        System.Collections.Generic.EqualityComparer<T1>.Default.Equals(Item1, other.Item1) &&
        System.Collections.Generic.EqualityComparer<T2>.Default.Equals(Item2, other.Item2);
    public override bool Equals(object obj) => obj is ValueTuple<T1, T2> other && Equals(other);
    public int CompareTo(ValueTuple<T1, T2> other)
    {
        int c = System.Collections.Generic.Comparer<T1>.Default.Compare(Item1, other.Item1);
        if (c != 0)
            return c;
        return System.Collections.Generic.Comparer<T2>.Default.Compare(Item2, other.Item2);
    }
    public int CompareTo(object other) => CompareTo((ValueTuple<T1, T2>)other);
    public override int GetHashCode() => HashCode.Combine(Item1, Item2);
    public override string ToString() => "(" + Item1 + ", " + Item2 + ")";
    int ITuple.Length => 2;
    object ITuple.this[int index] => index == 0 ? (object)Item1 : (object)Item2;
}

public struct ValueTuple<T1, T2, T3> : IEquatable<ValueTuple<T1, T2, T3>>, IComparable<ValueTuple<T1, T2, T3>>, IComparable
{
    public T1 Item1;
    public T2 Item2;
    public T3 Item3;
    public ValueTuple(T1 item1, T2 item2, T3 item3)
    {
        Item1 = item1;
        Item2 = item2;
        Item3 = item3;
    }
    public bool Equals(ValueTuple<T1, T2, T3> other) =>
        System.Collections.Generic.EqualityComparer<T1>.Default.Equals(Item1, other.Item1) &&
        System.Collections.Generic.EqualityComparer<T2>.Default.Equals(Item2, other.Item2) &&
        System.Collections.Generic.EqualityComparer<T3>.Default.Equals(Item3, other.Item3);
    public override bool Equals(object obj) => obj is ValueTuple<T1, T2, T3> other && Equals(other);
    public int CompareTo(ValueTuple<T1, T2, T3> other)
    {
        int c = System.Collections.Generic.Comparer<T1>.Default.Compare(Item1, other.Item1);
        if (c != 0)
            return c;
        c = System.Collections.Generic.Comparer<T2>.Default.Compare(Item2, other.Item2);
        if (c != 0)
            return c;
        return System.Collections.Generic.Comparer<T3>.Default.Compare(Item3, other.Item3);
    }
    public int CompareTo(object other) => CompareTo((ValueTuple<T1, T2, T3>)other);
    public override int GetHashCode() => HashCode.Combine(Item1, Item2, Item3);
    public override string ToString() => "(" + Item1 + ", " + Item2 + ", " + Item3 + ")";
}

public struct ValueTuple<T1, T2, T3, T4> : IEquatable<ValueTuple<T1, T2, T3, T4>>, IComparable<ValueTuple<T1, T2, T3, T4>>
{
    public T1 Item1;
    public T2 Item2;
    public T3 Item3;
    public T4 Item4;
    public ValueTuple(T1 item1, T2 item2, T3 item3, T4 item4)
    {
        Item1 = item1;
        Item2 = item2;
        Item3 = item3;
        Item4 = item4;
    }
    public bool Equals(ValueTuple<T1, T2, T3, T4> other) =>
        System.Collections.Generic.EqualityComparer<T1>.Default.Equals(Item1, other.Item1) &&
        System.Collections.Generic.EqualityComparer<T2>.Default.Equals(Item2, other.Item2) &&
        System.Collections.Generic.EqualityComparer<T3>.Default.Equals(Item3, other.Item3) &&
        System.Collections.Generic.EqualityComparer<T4>.Default.Equals(Item4, other.Item4);
    public override bool Equals(object obj) => obj is ValueTuple<T1, T2, T3, T4> other && Equals(other);
    public int CompareTo(ValueTuple<T1, T2, T3, T4> other)
    {
        int c = System.Collections.Generic.Comparer<T1>.Default.Compare(Item1, other.Item1);
        if (c != 0)
            return c;
        c = System.Collections.Generic.Comparer<T2>.Default.Compare(Item2, other.Item2);
        if (c != 0)
            return c;
        c = System.Collections.Generic.Comparer<T3>.Default.Compare(Item3, other.Item3);
        if (c != 0)
            return c;
        return System.Collections.Generic.Comparer<T4>.Default.Compare(Item4, other.Item4);
    }
    public override int GetHashCode() => HashCode.Combine(Item1, Item2, Item3, Item4);
    public override string ToString() => "(" + Item1 + ", " + Item2 + ", " + Item3 + ", " + Item4 + ")";
}

public struct ValueTuple<T1, T2, T3, T4, T5> : IEquatable<ValueTuple<T1, T2, T3, T4, T5>>
{
    public T1 Item1;
    public T2 Item2;
    public T3 Item3;
    public T4 Item4;
    public T5 Item5;
    public ValueTuple(T1 item1, T2 item2, T3 item3, T4 item4, T5 item5)
    {
        Item1 = item1;
        Item2 = item2;
        Item3 = item3;
        Item4 = item4;
        Item5 = item5;
    }
    public bool Equals(ValueTuple<T1, T2, T3, T4, T5> other) =>
        System.Collections.Generic.EqualityComparer<T1>.Default.Equals(Item1, other.Item1) &&
        System.Collections.Generic.EqualityComparer<T2>.Default.Equals(Item2, other.Item2) &&
        System.Collections.Generic.EqualityComparer<T3>.Default.Equals(Item3, other.Item3) &&
        System.Collections.Generic.EqualityComparer<T4>.Default.Equals(Item4, other.Item4) &&
        System.Collections.Generic.EqualityComparer<T5>.Default.Equals(Item5, other.Item5);
    public override bool Equals(object obj) => obj is ValueTuple<T1, T2, T3, T4, T5> other && Equals(other);
    public override int GetHashCode() => HashCode.Combine(Item1, Item2, Item3, Item4, Item5);
    public override string ToString() => "(" + Item1 + ", " + Item2 + ", " + Item3 + ", " + Item4 + ", " + Item5 + ")";
}

public struct ValueTuple<T1, T2, T3, T4, T5, T6> : IEquatable<ValueTuple<T1, T2, T3, T4, T5, T6>>
{
    public T1 Item1;
    public T2 Item2;
    public T3 Item3;
    public T4 Item4;
    public T5 Item5;
    public T6 Item6;
    public ValueTuple(T1 item1, T2 item2, T3 item3, T4 item4, T5 item5, T6 item6)
    {
        Item1 = item1;
        Item2 = item2;
        Item3 = item3;
        Item4 = item4;
        Item5 = item5;
        Item6 = item6;
    }
    public bool Equals(ValueTuple<T1, T2, T3, T4, T5, T6> other) =>
        System.Collections.Generic.EqualityComparer<T1>.Default.Equals(Item1, other.Item1) &&
        System.Collections.Generic.EqualityComparer<T2>.Default.Equals(Item2, other.Item2) &&
        System.Collections.Generic.EqualityComparer<T3>.Default.Equals(Item3, other.Item3) &&
        System.Collections.Generic.EqualityComparer<T4>.Default.Equals(Item4, other.Item4) &&
        System.Collections.Generic.EqualityComparer<T5>.Default.Equals(Item5, other.Item5) &&
        System.Collections.Generic.EqualityComparer<T6>.Default.Equals(Item6, other.Item6);
    public override bool Equals(object obj) => obj is ValueTuple<T1, T2, T3, T4, T5, T6> other && Equals(other);
    public override int GetHashCode() => HashCode.Combine(Item1, Item2, Item3, Item4, Item5, Item6);
    public override string ToString() => "(" + Item1 + ", " + Item2 + ", " + Item3 + ", " + Item4 + ", " + Item5 + ", " + Item6 + ")";
}

public struct ValueTuple<T1, T2, T3, T4, T5, T6, T7> : IEquatable<ValueTuple<T1, T2, T3, T4, T5, T6, T7>>
{
    public T1 Item1;
    public T2 Item2;
    public T3 Item3;
    public T4 Item4;
    public T5 Item5;
    public T6 Item6;
    public T7 Item7;
    public ValueTuple(T1 item1, T2 item2, T3 item3, T4 item4, T5 item5, T6 item6, T7 item7)
    {
        Item1 = item1;
        Item2 = item2;
        Item3 = item3;
        Item4 = item4;
        Item5 = item5;
        Item6 = item6;
        Item7 = item7;
    }
    public bool Equals(ValueTuple<T1, T2, T3, T4, T5, T6, T7> other) =>
        System.Collections.Generic.EqualityComparer<T1>.Default.Equals(Item1, other.Item1) &&
        System.Collections.Generic.EqualityComparer<T2>.Default.Equals(Item2, other.Item2) &&
        System.Collections.Generic.EqualityComparer<T3>.Default.Equals(Item3, other.Item3) &&
        System.Collections.Generic.EqualityComparer<T4>.Default.Equals(Item4, other.Item4) &&
        System.Collections.Generic.EqualityComparer<T5>.Default.Equals(Item5, other.Item5) &&
        System.Collections.Generic.EqualityComparer<T6>.Default.Equals(Item6, other.Item6) &&
        System.Collections.Generic.EqualityComparer<T7>.Default.Equals(Item7, other.Item7);
    public override bool Equals(object obj) => obj is ValueTuple<T1, T2, T3, T4, T5, T6, T7> other && Equals(other);
    public override int GetHashCode() => HashCode.Combine(Item1, Item2, Item3, Item4, Item5, Item6, Item7);
    public override string ToString() => "(" + Item1 + ", " + Item2 + ", " + Item3 + ", " + Item4 + ", " + Item5 + ", " + Item6 + ", " + Item7 + ")";
}

public struct ValueTuple<T1, T2, T3, T4, T5, T6, T7, TRest> where TRest : struct
{
    public T1 Item1;
    public T2 Item2;
    public T3 Item3;
    public T4 Item4;
    public T5 Item5;
    public T6 Item6;
    public T7 Item7;
    public TRest Rest;
    public ValueTuple(T1 item1, T2 item2, T3 item3, T4 item4, T5 item5, T6 item6, T7 item7, TRest rest)
    {
        Item1 = item1;
        Item2 = item2;
        Item3 = item3;
        Item4 = item4;
        Item5 = item5;
        Item6 = item6;
        Item7 = item7;
        Rest = rest;
    }
    public override string ToString()
    {
        string rest = Rest.ToString();
        return "(" + Item1 + ", " + Item2 + ", " + Item3 + ", " + Item4 + ", " + Item5 + ", " + Item6 + ", " + Item7 + ", " + rest.Substring(1);
    }
}

public static class Tuple
{
    public static Tuple<T1> Create<T1>(T1 item1) => new Tuple<T1>(item1);
    public static Tuple<T1, T2> Create<T1, T2>(T1 item1, T2 item2) => new Tuple<T1, T2>(item1, item2);
    public static Tuple<T1, T2, T3> Create<T1, T2, T3>(T1 item1, T2 item2, T3 item3) => new Tuple<T1, T2, T3>(item1, item2, item3);
    public static Tuple<T1, T2, T3, T4> Create<T1, T2, T3, T4>(T1 item1, T2 item2, T3 item3, T4 item4) =>
        new Tuple<T1, T2, T3, T4>(item1, item2, item3, item4);
}

public class Tuple<T1>
{
    public Tuple(T1 item1) { Item1 = item1; }
    public T1 Item1 { get; }
    public override bool Equals(object obj) => obj is Tuple<T1> other && System.Collections.Generic.EqualityComparer<T1>.Default.Equals(Item1, other.Item1);
    public override int GetHashCode() => System.Collections.Generic.EqualityComparer<T1>.Default.GetHashCode(Item1);
    public override string ToString() => "(" + Item1 + ")";
}

public class Tuple<T1, T2>
{
    public Tuple(T1 item1, T2 item2)
    {
        Item1 = item1;
        Item2 = item2;
    }
    public T1 Item1 { get; }
    public T2 Item2 { get; }
    public override bool Equals(object obj) => obj is Tuple<T1, T2> other &&
        System.Collections.Generic.EqualityComparer<T1>.Default.Equals(Item1, other.Item1) &&
        System.Collections.Generic.EqualityComparer<T2>.Default.Equals(Item2, other.Item2);
    public override int GetHashCode() => HashCode.Combine(Item1, Item2);
    public override string ToString() => "(" + Item1 + ", " + Item2 + ")";
}

public class Tuple<T1, T2, T3>
{
    public Tuple(T1 item1, T2 item2, T3 item3)
    {
        Item1 = item1;
        Item2 = item2;
        Item3 = item3;
    }
    public T1 Item1 { get; }
    public T2 Item2 { get; }
    public T3 Item3 { get; }
    public override bool Equals(object obj) => obj is Tuple<T1, T2, T3> other &&
        System.Collections.Generic.EqualityComparer<T1>.Default.Equals(Item1, other.Item1) &&
        System.Collections.Generic.EqualityComparer<T2>.Default.Equals(Item2, other.Item2) &&
        System.Collections.Generic.EqualityComparer<T3>.Default.Equals(Item3, other.Item3);
    public override int GetHashCode() => HashCode.Combine(Item1, Item2, Item3);
    public override string ToString() => "(" + Item1 + ", " + Item2 + ", " + Item3 + ")";
}

public class Tuple<T1, T2, T3, T4>
{
    public Tuple(T1 item1, T2 item2, T3 item3, T4 item4)
    {
        Item1 = item1;
        Item2 = item2;
        Item3 = item3;
        Item4 = item4;
    }
    public T1 Item1 { get; }
    public T2 Item2 { get; }
    public T3 Item3 { get; }
    public T4 Item4 { get; }
    public override string ToString() => "(" + Item1 + ", " + Item2 + ", " + Item3 + ", " + Item4 + ")";
}

public struct HashCode
{
    private int _value;
    private static int Mix(int hash, int value) => unchecked(hash * -1521134295 + value);
    public static int Combine<T1>(T1 value1) => Mix(0x2D2816FE, value1?.GetHashCode() ?? 0);
    public static int Combine<T1, T2>(T1 value1, T2 value2) =>
        Mix(Mix(0x2D2816FE, value1?.GetHashCode() ?? 0), value2?.GetHashCode() ?? 0);
    public static int Combine<T1, T2, T3>(T1 value1, T2 value2, T3 value3) =>
        Mix(Combine(value1, value2), value3?.GetHashCode() ?? 0);
    public static int Combine<T1, T2, T3, T4>(T1 value1, T2 value2, T3 value3, T4 value4) =>
        Mix(Combine(value1, value2, value3), value4?.GetHashCode() ?? 0);
    public static int Combine<T1, T2, T3, T4, T5>(T1 value1, T2 value2, T3 value3, T4 value4, T5 value5) =>
        Mix(Combine(value1, value2, value3, value4), value5?.GetHashCode() ?? 0);
    public static int Combine<T1, T2, T3, T4, T5, T6>(T1 value1, T2 value2, T3 value3, T4 value4, T5 value5, T6 value6) =>
        Mix(Combine(value1, value2, value3, value4, value5), value6?.GetHashCode() ?? 0);
    public static int Combine<T1, T2, T3, T4, T5, T6, T7>(T1 value1, T2 value2, T3 value3, T4 value4, T5 value5, T6 value6, T7 value7) =>
        Mix(Combine(value1, value2, value3, value4, value5, value6), value7?.GetHashCode() ?? 0);
    public void Add<T>(T value) { _value = Mix(_value == 0 ? 0x2D2816FE : _value, value?.GetHashCode() ?? 0); }
    public int ToHashCode() => _value;
}

public class Lazy<T>
{
    private Func<T> _factory;
    private T _value;
    private bool _created;
    public Lazy() : this(() => (T)Activator.CreateInstance(typeof(T))) { }
    public Lazy(Func<T> valueFactory) { _factory = valueFactory; }
    public Lazy(Func<T> valueFactory, bool isThreadSafe) { _factory = valueFactory; }
    public Lazy(T value)
    {
        _value = value;
        _created = true;
    }
    public bool IsValueCreated => _created;
    public T Value
    {
        get
        {
            if (!_created)
            {
                _value = _factory();
                _created = true;
                _factory = null;
            }
            return _value;
        }
    }
    public override string ToString() => _created ? (_value?.ToString() ?? "") : "Value is not created.";
}

public sealed class WeakReference<T> where T : class
{
    private T _target;
    public WeakReference(T target) { _target = target; }
    public bool TryGetTarget(out T target)
    {
        target = _target;
        return target != null;
    }
    public void SetTarget(T target) { _target = target; }
}
`);
})(globalThis);
