// C#: Span<T>, ReadOnlySpan<T>, Memory<T>, ReadOnlyMemory<T> and
// MemoryExtensions - views of an array (or of a string for char): the
// array, the start and the length. A ref struct is an ordinary struct here;
// the indexer gets and sets the element (no ref returns).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    if (CS.library.units['system.memory/Span`1'])
        return;

    CS.addLibrary('system.memory', String.raw`
using System.Collections.Generic;
namespace System;

public readonly ref struct Span<T>
{
    internal readonly T[] _array;
    internal readonly int _start;
    private readonly int _length;

    public Span(T[] array)
    {
        _array = array;
        _start = 0;
        _length = array == null ? 0 : array.Length;
    }
    public Span(T[] array, int start, int length)
    {
        if (array == null)
        {
            if (start != 0 || length != 0)
                throw new ArgumentOutOfRangeException();
            _array = null;
            _start = 0;
            _length = 0;
            return;
        }
        if ((uint)start > (uint)array.Length || (uint)length > (uint)(array.Length - start))
            throw new ArgumentOutOfRangeException();
        _array = array;
        _start = start;
        _length = length;
    }
    public Span(ref T reference) : this(new T[] { reference }) { }

    public static Span<T> Empty => default;
    public int Length => _length;
    public bool IsEmpty => _length == 0;
    public extern T this[int index] { get; set; }

    public Span<T> Slice(int start)
    {
        if ((uint)start > (uint)_length)
            throw new ArgumentOutOfRangeException();
        return new Span<T>(_array, _start + start, _length - start);
    }
    public Span<T> Slice(int start, int length)
    {
        if ((uint)start > (uint)_length || (uint)length > (uint)(_length - start))
            throw new ArgumentOutOfRangeException();
        return new Span<T>(_array, _start + start, length);
    }
    public T[] ToArray()
    {
        var result = new T[_length];
        if (_length > 0)
            Array.Copy(_array, _start, result, 0, _length);
        return result;
    }
    public void CopyTo(Span<T> destination)
    {
        if (_length > destination.Length)
            throw new ArgumentException("Destination is too short.", "destination");
        if (_length > 0)
            Array.Copy(_array, _start, destination._array, destination._start, _length);
    }
    public bool TryCopyTo(Span<T> destination)
    {
        if (_length > destination.Length)
            return false;
        CopyTo(destination);
        return true;
    }
    public void Fill(T value)
    {
        if (_length > 0)
            Array.Fill(_array, value, _start, _length);
    }
    public void Clear()
    {
        if (_length > 0)
            Array.Clear(_array, _start, _length);
    }
    public Enumerator GetEnumerator() => new Enumerator(this);
    public override extern string ToString();
    public override bool Equals(object obj) =>
        throw new NotSupportedException("Equals() on Span and ReadOnlySpan is not supported. Use operator== instead.");
    public override int GetHashCode() => throw new NotSupportedException("GetHashCode() on Span and ReadOnlySpan is not supported.");

    public static implicit operator Span<T>(T[] array) => new Span<T>(array);
    public static implicit operator Span<T>(ArraySegment<T> segment) => new Span<T>(segment.Array, segment.Offset, segment.Count);
    public static implicit operator ReadOnlySpan<T>(Span<T> span) => new ReadOnlySpan<T>(span._array, span._start, span._length);
    // The same memory: the same array, start and length.
    public static bool operator ==(Span<T> left, Span<T> right) =>
        left._length == right._length && (object)left._array == (object)right._array && left._start == right._start;
    public static bool operator !=(Span<T> left, Span<T> right) => !(left == right);

    public ref struct Enumerator
    {
        private readonly Span<T> _span;
        private int _index;
        internal Enumerator(Span<T> span)
        {
            _span = span;
            _index = -1;
        }
        public bool MoveNext()
        {
            int index = _index + 1;
            if (index >= _span.Length)
                return false;
            _index = index;
            return true;
        }
        public T Current => _span[_index];
    }
}

public readonly ref struct ReadOnlySpan<T>
{
    internal readonly T[] _array;
    // The text of a ReadOnlySpan<char> made from a string (_array is null).
    internal readonly string _text;
    internal readonly int _start;
    private readonly int _length;

    public ReadOnlySpan(T[] array)
    {
        _array = array;
        _text = null;
        _start = 0;
        _length = array == null ? 0 : array.Length;
    }
    public ReadOnlySpan(T[] array, int start, int length)
    {
        _text = null;
        if (array == null)
        {
            if (start != 0 || length != 0)
                throw new ArgumentOutOfRangeException();
            _array = null;
            _start = 0;
            _length = 0;
            return;
        }
        if ((uint)start > (uint)array.Length || (uint)length > (uint)(array.Length - start))
            throw new ArgumentOutOfRangeException();
        _array = array;
        _start = start;
        _length = length;
    }
    internal ReadOnlySpan(string text, int start, int length)
    {
        _array = null;
        _text = text;
        _start = start;
        _length = length;
    }
    public ReadOnlySpan(ref T reference) : this(new T[] { reference }) { }

    public static ReadOnlySpan<T> Empty => default;
    public int Length => _length;
    public bool IsEmpty => _length == 0;
    public extern T this[int index] { get; }

    public ReadOnlySpan<T> Slice(int start)
    {
        if ((uint)start > (uint)_length)
            throw new ArgumentOutOfRangeException();
        return Slice(start, _length - start);
    }
    public ReadOnlySpan<T> Slice(int start, int length)
    {
        if ((uint)start > (uint)_length || (uint)length > (uint)(_length - start))
            throw new ArgumentOutOfRangeException();
        return _text != null ? new ReadOnlySpan<T>(_text, _start + start, length) : new ReadOnlySpan<T>(_array, _start + start, length);
    }
    public extern T[] ToArray();
    public void CopyTo(Span<T> destination)
    {
        if (!TryCopyTo(destination))
            throw new ArgumentException("Destination is too short.", "destination");
    }
    public bool TryCopyTo(Span<T> destination)
    {
        if (_length > destination.Length)
            return false;
        for (int i = 0; i < _length; i++)
            destination[i] = this[i];
        return true;
    }
    public Enumerator GetEnumerator() => new Enumerator(this);
    public override extern string ToString();
    public override bool Equals(object obj) =>
        throw new NotSupportedException("Equals() on Span and ReadOnlySpan is not supported. Use operator== instead.");
    public override int GetHashCode() => throw new NotSupportedException("GetHashCode() on Span and ReadOnlySpan is not supported.");

    public static implicit operator ReadOnlySpan<T>(T[] array) => new ReadOnlySpan<T>(array);
    public static implicit operator ReadOnlySpan<T>(ArraySegment<T> segment) =>
        new ReadOnlySpan<T>(segment.Array, segment.Offset, segment.Count);
    public static bool operator ==(ReadOnlySpan<T> left, ReadOnlySpan<T> right) =>
        left._length == right._length && (object)left._array == (object)right._array && (object)left._text == (object)right._text &&
        left._start == right._start;
    public static bool operator !=(ReadOnlySpan<T> left, ReadOnlySpan<T> right) => !(left == right);

    public ref struct Enumerator
    {
        private readonly ReadOnlySpan<T> _span;
        private int _index;
        internal Enumerator(ReadOnlySpan<T> span)
        {
            _span = span;
            _index = -1;
        }
        public bool MoveNext()
        {
            int index = _index + 1;
            if (index >= _span.Length)
                return false;
            _index = index;
            return true;
        }
        public T Current => _span[_index];
    }
}

public readonly struct Memory<T>
{
    private readonly T[] _array;
    private readonly int _start;
    private readonly int _length;

    public Memory(T[] array) : this(array, 0, array == null ? 0 : array.Length) { }
    public Memory(T[] array, int start, int length)
    {
        if (array == null ? start != 0 || length != 0 : (uint)start > (uint)array.Length || (uint)length > (uint)(array.Length - start))
            throw new ArgumentOutOfRangeException();
        _array = array;
        _start = start;
        _length = length;
    }
    public static Memory<T> Empty => default;
    public int Length => _length;
    public bool IsEmpty => _length == 0;
    public Span<T> Span => new Span<T>(_array, _start, _length);
    public Memory<T> Slice(int start) => Slice(start, _length - start);
    public Memory<T> Slice(int start, int length)
    {
        if ((uint)start > (uint)_length || (uint)length > (uint)(_length - start))
            throw new ArgumentOutOfRangeException();
        return new Memory<T>(_array, _start + start, length);
    }
    public T[] ToArray() => Span.ToArray();
    public void CopyTo(Memory<T> destination) => Span.CopyTo(destination.Span);
    public override string ToString() => typeof(T) == typeof(char) ? Span.ToString() : "System.Memory<" + typeof(T).Name + ">[" + _length + "]";
    public static implicit operator Memory<T>(T[] array) => new Memory<T>(array);
    public static implicit operator ReadOnlyMemory<T>(Memory<T> memory) => new ReadOnlyMemory<T>(memory._array, memory._start, memory._length);
}

public readonly struct ReadOnlyMemory<T>
{
    private readonly T[] _array;
    private readonly string _text;
    private readonly int _start;
    private readonly int _length;

    public ReadOnlyMemory(T[] array) : this(array, 0, array == null ? 0 : array.Length) { }
    public ReadOnlyMemory(T[] array, int start, int length)
    {
        if (array == null ? start != 0 || length != 0 : (uint)start > (uint)array.Length || (uint)length > (uint)(array.Length - start))
            throw new ArgumentOutOfRangeException();
        _array = array;
        _text = null;
        _start = start;
        _length = length;
    }
    internal ReadOnlyMemory(string text, int start, int length)
    {
        _array = null;
        _text = text;
        _start = start;
        _length = length;
    }
    public static ReadOnlyMemory<T> Empty => default;
    public int Length => _length;
    public bool IsEmpty => _length == 0;
    public ReadOnlySpan<T> Span => _text != null ? new ReadOnlySpan<T>(_text, _start, _length) : new ReadOnlySpan<T>(_array, _start, _length);
    public ReadOnlyMemory<T> Slice(int start) => Slice(start, _length - start);
    public ReadOnlyMemory<T> Slice(int start, int length)
    {
        if ((uint)start > (uint)_length || (uint)length > (uint)(_length - start))
            throw new ArgumentOutOfRangeException();
        return _text != null ? new ReadOnlyMemory<T>(_text, _start + start, length) : new ReadOnlyMemory<T>(_array, _start + start, length);
    }
    public T[] ToArray() => Span.ToArray();
    public override string ToString() => typeof(T) == typeof(char) ? Span.ToString() : "System.ReadOnlyMemory<" + typeof(T).Name + ">[" + _length + "]";
    public static implicit operator ReadOnlyMemory<T>(T[] array) => new ReadOnlyMemory<T>(array);
}

public readonly struct ArraySegment<T> : IList<T>, IReadOnlyList<T>
{
    private readonly T[] _array;
    private readonly int _offset;
    private readonly int _count;

    public ArraySegment(T[] array) : this(array, 0, array == null ? 0 : array.Length) { }
    public ArraySegment(T[] array, int offset, int count)
    {
        if (array == null)
            throw new ArgumentNullException("array");
        if ((uint)offset > (uint)array.Length || (uint)count > (uint)(array.Length - offset))
            throw new ArgumentOutOfRangeException();
        _array = array;
        _offset = offset;
        _count = count;
    }
    public T[] Array => _array;
    public int Offset => _offset;
    public int Count => _count;
    public T this[int index]
    {
        get
        {
            if ((uint)index >= (uint)_count)
                throw new ArgumentOutOfRangeException("index");
            return _array[_offset + index];
        }
        set
        {
            if ((uint)index >= (uint)_count)
                throw new ArgumentOutOfRangeException("index");
            _array[_offset + index] = value;
        }
    }
    public ArraySegment<T> Slice(int index) => Slice(index, _count - index);
    public ArraySegment<T> Slice(int index, int count)
    {
        if ((uint)index > (uint)_count || (uint)count > (uint)(_count - index))
            throw new ArgumentOutOfRangeException();
        return new ArraySegment<T>(_array, _offset + index, count);
    }
    public T[] ToArray()
    {
        var result = new T[_count];
        System.Array.Copy(_array, _offset, result, 0, _count);
        return result;
    }
    public bool IsReadOnly => false;
    public int IndexOf(T item)
    {
        int index = System.Array.IndexOf(_array, item, _offset, _count);
        return index < 0 ? -1 : index - _offset;
    }
    public bool Contains(T item) => IndexOf(item) >= 0;
    public void CopyTo(T[] array, int arrayIndex) => System.Array.Copy(_array, _offset, array, arrayIndex, _count);
    void IList<T>.Insert(int index, T item) => throw new NotSupportedException();
    void IList<T>.RemoveAt(int index) => throw new NotSupportedException();
    void ICollection<T>.Add(T item) => throw new NotSupportedException();
    void ICollection<T>.Clear() => throw new NotSupportedException();
    bool ICollection<T>.Remove(T item) => throw new NotSupportedException();
    public IEnumerator<T> GetEnumerator()
    {
        for (int i = 0; i < _count; i++)
            yield return _array[_offset + i];
    }
    System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => GetEnumerator();
    public static implicit operator ArraySegment<T>(T[] array) => new ArraySegment<T>(array);
}

public static class MemoryExtensions
{
    public static Span<T> AsSpan<T>(this T[] array) => new Span<T>(array);
    public static Span<T> AsSpan<T>(this T[] array, int start) => new Span<T>(array, start, (array == null ? 0 : array.Length) - start);
    public static Span<T> AsSpan<T>(this T[] array, int start, int length) => new Span<T>(array, start, length);
    public static Span<T> AsSpan<T>(this T[] array, Range range)
    {
        var (offset, length) = range.GetOffsetAndLength(array == null ? 0 : array.Length);
        return new Span<T>(array, offset, length);
    }
    public static Span<T> AsSpan<T>(this ArraySegment<T> segment) => new Span<T>(segment.Array, segment.Offset, segment.Count);
    public static ReadOnlySpan<char> AsSpan(this string text) => text == null ? default : new ReadOnlySpan<char>(text, 0, text.Length);
    public static ReadOnlySpan<char> AsSpan(this string text, int start)
    {
        if (text == null)
        {
            if (start != 0)
                throw new ArgumentOutOfRangeException("start");
            return default;
        }
        if ((uint)start > (uint)text.Length)
            throw new ArgumentOutOfRangeException("start");
        return new ReadOnlySpan<char>(text, start, text.Length - start);
    }
    public static ReadOnlySpan<char> AsSpan(this string text, int start, int length)
    {
        if (text == null)
        {
            if (start != 0 || length != 0)
                throw new ArgumentOutOfRangeException("start");
            return default;
        }
        if ((uint)start > (uint)text.Length || (uint)length > (uint)(text.Length - start))
            throw new ArgumentOutOfRangeException("start");
        return new ReadOnlySpan<char>(text, start, length);
    }
    public static Memory<T> AsMemory<T>(this T[] array) => new Memory<T>(array);
    public static Memory<T> AsMemory<T>(this T[] array, int start) => new Memory<T>(array, start, (array == null ? 0 : array.Length) - start);
    public static Memory<T> AsMemory<T>(this T[] array, int start, int length) => new Memory<T>(array, start, length);
    public static ReadOnlyMemory<char> AsMemory(this string text) => text == null ? default : new ReadOnlyMemory<char>(text, 0, text.Length);
    public static ReadOnlyMemory<char> AsMemory(this string text, int start) => text.AsMemory(start, text.Length - start);
    public static ReadOnlyMemory<char> AsMemory(this string text, int start, int length)
    {
        if ((uint)start > (uint)text.Length || (uint)length > (uint)(text.Length - start))
            throw new ArgumentOutOfRangeException("start");
        return new ReadOnlyMemory<char>(text, start, length);
    }

    public static int IndexOf<T>(this Span<T> span, T value) where T : IEquatable<T> => IndexOf((ReadOnlySpan<T>)span, value);
    public static int IndexOf<T>(this ReadOnlySpan<T> span, T value) where T : IEquatable<T>
    {
        var comparer = EqualityComparer<T>.Default;
        for (int i = 0; i < span.Length; i++)
            if (comparer.Equals(span[i], value))
                return i;
        return -1;
    }
    public static int IndexOf<T>(this Span<T> span, ReadOnlySpan<T> value) where T : IEquatable<T> => IndexOf((ReadOnlySpan<T>)span, value);
    public static int IndexOf<T>(this ReadOnlySpan<T> span, ReadOnlySpan<T> value) where T : IEquatable<T>
    {
        for (int i = 0; i + value.Length <= span.Length; i++)
            if (span.Slice(i, value.Length).SequenceEqual(value))
                return i;
        return -1;
    }
    public static int IndexOf(this ReadOnlySpan<char> span, ReadOnlySpan<char> value, StringComparison comparisonType) =>
        span.ToString().IndexOf(value.ToString(), comparisonType);
    public static int LastIndexOf<T>(this Span<T> span, T value) where T : IEquatable<T> => LastIndexOf((ReadOnlySpan<T>)span, value);
    public static int LastIndexOf<T>(this ReadOnlySpan<T> span, T value) where T : IEquatable<T>
    {
        var comparer = EqualityComparer<T>.Default;
        for (int i = span.Length - 1; i >= 0; i--)
            if (comparer.Equals(span[i], value))
                return i;
        return -1;
    }
    public static int IndexOfAny<T>(this Span<T> span, T value0, T value1) where T : IEquatable<T> => IndexOfAny((ReadOnlySpan<T>)span, value0, value1);
    public static int IndexOfAny<T>(this ReadOnlySpan<T> span, T value0, T value1) where T : IEquatable<T>
    {
        var comparer = EqualityComparer<T>.Default;
        for (int i = 0; i < span.Length; i++)
            if (comparer.Equals(span[i], value0) || comparer.Equals(span[i], value1))
                return i;
        return -1;
    }
    public static int IndexOfAny<T>(this ReadOnlySpan<T> span, ReadOnlySpan<T> values) where T : IEquatable<T>
    {
        for (int i = 0; i < span.Length; i++)
            if (values.IndexOf(span[i]) >= 0)
                return i;
        return -1;
    }
    public static bool Contains<T>(this Span<T> span, T value) where T : IEquatable<T> => IndexOf((ReadOnlySpan<T>)span, value) >= 0;
    public static bool Contains<T>(this ReadOnlySpan<T> span, T value) where T : IEquatable<T> => IndexOf(span, value) >= 0;
    public static bool Contains(this ReadOnlySpan<char> span, ReadOnlySpan<char> value, StringComparison comparisonType) =>
        IndexOf(span, value, comparisonType) >= 0;
    public static int Count<T>(this Span<T> span, T value) where T : IEquatable<T> => Count((ReadOnlySpan<T>)span, value);
    public static int Count<T>(this ReadOnlySpan<T> span, T value) where T : IEquatable<T>
    {
        var comparer = EqualityComparer<T>.Default;
        int count = 0;
        for (int i = 0; i < span.Length; i++)
            if (comparer.Equals(span[i], value))
                count++;
        return count;
    }
    public static bool SequenceEqual<T>(this Span<T> span, ReadOnlySpan<T> other) where T : IEquatable<T> => SequenceEqual((ReadOnlySpan<T>)span, other);
    public static bool SequenceEqual<T>(this ReadOnlySpan<T> span, ReadOnlySpan<T> other) where T : IEquatable<T>
    {
        if (span.Length != other.Length)
            return false;
        var comparer = EqualityComparer<T>.Default;
        for (int i = 0; i < span.Length; i++)
            if (!comparer.Equals(span[i], other[i]))
                return false;
        return true;
    }
    public static int SequenceCompareTo<T>(this ReadOnlySpan<T> span, ReadOnlySpan<T> other) where T : IComparable<T>
    {
        int length = Math.Min(span.Length, other.Length);
        for (int i = 0; i < length; i++)
        {
            int result = span[i].CompareTo(other[i]);
            if (result != 0)
                return result;
        }
        return span.Length.CompareTo(other.Length);
    }
    public static bool StartsWith<T>(this Span<T> span, ReadOnlySpan<T> value) where T : IEquatable<T> => StartsWith((ReadOnlySpan<T>)span, value);
    public static bool StartsWith<T>(this ReadOnlySpan<T> span, ReadOnlySpan<T> value) where T : IEquatable<T> =>
        value.Length <= span.Length && span.Slice(0, value.Length).SequenceEqual(value);
    public static bool StartsWith(this ReadOnlySpan<char> span, ReadOnlySpan<char> value, StringComparison comparisonType) =>
        span.ToString().StartsWith(value.ToString(), comparisonType);
    public static bool EndsWith<T>(this Span<T> span, ReadOnlySpan<T> value) where T : IEquatable<T> => EndsWith((ReadOnlySpan<T>)span, value);
    public static bool EndsWith<T>(this ReadOnlySpan<T> span, ReadOnlySpan<T> value) where T : IEquatable<T> =>
        value.Length <= span.Length && span.Slice(span.Length - value.Length).SequenceEqual(value);
    public static bool EndsWith(this ReadOnlySpan<char> span, ReadOnlySpan<char> value, StringComparison comparisonType) =>
        span.ToString().EndsWith(value.ToString(), comparisonType);
    public static bool Equals(this ReadOnlySpan<char> span, ReadOnlySpan<char> other, StringComparison comparisonType) =>
        string.Equals(span.ToString(), other.ToString(), comparisonType);
    public static int CompareTo(this ReadOnlySpan<char> span, ReadOnlySpan<char> other, StringComparison comparisonType) =>
        string.Compare(span.ToString(), other.ToString(), comparisonType);
    public static bool IsWhiteSpace(this ReadOnlySpan<char> span)
    {
        for (int i = 0; i < span.Length; i++)
            if (!char.IsWhiteSpace(span[i]))
                return false;
        return true;
    }
    public static ReadOnlySpan<char> Trim(this ReadOnlySpan<char> span) => span.TrimStart().TrimEnd();
    public static ReadOnlySpan<char> TrimStart(this ReadOnlySpan<char> span)
    {
        int start = 0;
        while (start < span.Length && char.IsWhiteSpace(span[start]))
            start++;
        return span.Slice(start);
    }
    public static ReadOnlySpan<char> TrimEnd(this ReadOnlySpan<char> span)
    {
        int end = span.Length;
        while (end > 0 && char.IsWhiteSpace(span[end - 1]))
            end--;
        return span.Slice(0, end);
    }
    public static ReadOnlySpan<char> Trim(this ReadOnlySpan<char> span, char trimChar) => span.TrimStart(trimChar).TrimEnd(trimChar);
    public static ReadOnlySpan<char> TrimStart(this ReadOnlySpan<char> span, char trimChar)
    {
        int start = 0;
        while (start < span.Length && span[start] == trimChar)
            start++;
        return span.Slice(start);
    }
    public static ReadOnlySpan<char> TrimEnd(this ReadOnlySpan<char> span, char trimChar)
    {
        int end = span.Length;
        while (end > 0 && span[end - 1] == trimChar)
            end--;
        return span.Slice(0, end);
    }
    public static int ToUpperInvariant(this ReadOnlySpan<char> source, Span<char> destination) => CaseInto(source, destination, true);
    public static int ToLowerInvariant(this ReadOnlySpan<char> source, Span<char> destination) => CaseInto(source, destination, false);
    private static int CaseInto(ReadOnlySpan<char> source, Span<char> destination, bool upper)
    {
        if (destination.Length < source.Length)
            return -1;
        for (int i = 0; i < source.Length; i++)
            destination[i] = upper ? char.ToUpperInvariant(source[i]) : char.ToLowerInvariant(source[i]);
        return source.Length;
    }
    public static void Reverse<T>(this Span<T> span)
    {
        for (int i = 0, j = span.Length - 1; i < j; i++, j--)
            (span[i], span[j]) = (span[j], span[i]);
    }
    public static void Sort<T>(this Span<T> span) => Sort(span, Comparer<T>.Default.Compare);
    public static void Sort<T>(this Span<T> span, Comparison<T> comparison)
    {
        if (comparison == null)
            throw new ArgumentNullException("comparison");
        if (span.Length > 1)
            Array.Sort(span._array, span._start, span.Length, Comparer<T>.Create(comparison));
    }
    public static void Sort<TKey, TValue>(this Span<TKey> keys, Span<TValue> items)
    {
        if (keys.Length != items.Length)
            throw new ArgumentException("Length of items must be same as length of keys.");
        var keyArray = keys.ToArray();
        var itemArray = items.ToArray();
        Array.Sort(keyArray, itemArray);
        keyArray.CopyTo(keys);
        itemArray.CopyTo(items);
    }
    public static int BinarySearch<T>(this ReadOnlySpan<T> span, T value) where T : IComparable<T>
    {
        int lo = 0, hi = span.Length - 1;
        while (lo <= hi)
        {
            int mid = lo + ((hi - lo) >> 1);
            int order = span[mid].CompareTo(value);
            if (order == 0)
                return mid;
            if (order < 0)
                lo = mid + 1;
            else
                hi = mid - 1;
        }
        return ~lo;
    }
    public static int BinarySearch<T>(this Span<T> span, T value) where T : IComparable<T> => BinarySearch((ReadOnlySpan<T>)span, value);
    public static void CopyTo<T>(this T[] source, Span<T> destination) => new ReadOnlySpan<T>(source).CopyTo(destination);
    public static void Fill<T>(this Span<T> span, T value) => span.Fill(value);
}
`);

    var natives = CS.natives;

    function rt() {
        return CS.rt;
    }

    function checkIndex(span, index) {
        if (!(index >= 0 && index < span._length))
            throw rt().exception('System.IndexOutOfRangeException', 'Index was outside the bounds of the array.');
    }

    // ToString of a span: the characters of a span of char, otherwise the
    // type and the length: System.Span<Int32>[5].
    function text(span, kind) {
        var elementType = span['$ta$' + span.constructor.$def.$id][0];
        if (elementType.$name === 'System.Char') {
            if (span._text !== undefined && span._text !== null)
                return span._text.substr(span._start, span._length);
            return span._length === 0 ? '' : CS.charsToString(span._array, span._start, span._length);
        }
        return 'System.' + kind + '<' + rt().typeName(elementType).replace(/^.*\./, '') + '>[' + span._length + ']';
    }

    natives['System.Span`1'] = {
        'get_Item(int)': function (index) {
            checkIndex(this, index);
            return this._array[this._start + index];
        },
        'set_Item(int, T)': function (index, value) {
            checkIndex(this, index);
            this._array[this._start + index] = value;
        },
        'ToString()': function () { return text(this, 'Span'); }
    };

    natives['System.ReadOnlySpan`1'] = {
        'get_Item(int)': function (index) {
            checkIndex(this, index);
            if (this._text !== null && this._text !== undefined)
                return this._text.charCodeAt(this._start + index);
            return this._array[this._start + index];
        },
        'ToArray()': function () {
            var elementType = this['$ta$' + this.constructor.$def.$id][0];
            var result = rt().newArray(elementType, this._length);
            for (var index = 0; index < this._length; ++index)
                result[index] = this._text !== null && this._text !== undefined ? this._text.charCodeAt(this._start + index)
                    : this._array[this._start + index];
            return result;
        },
        'ToString()': function () { return text(this, 'ReadOnlySpan'); }
    };
})(globalThis);
