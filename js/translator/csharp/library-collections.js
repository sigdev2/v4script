// C#: System.Collections and System.Collections.Generic - interfaces,
// comparers, List, Dictionary, HashSet, Queue, Stack, LinkedList and the
// helpers of sorting. The algorithms follow those of .NET, so the order of
// iteration, the sorting of equal keys and the growth of capacities are
// the same (see THIRD_PARTY_NOTICES.md).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    if (CS.library.units['collections.interfaces/IEnumerable'])
        return;

    CS.addLibrary('collections.interfaces', String.raw`
namespace System.Collections;

public interface IEnumerable
{
    IEnumerator GetEnumerator();
}

public interface IEnumerator
{
    bool MoveNext();
    object Current { get; }
    void Reset();
}

public interface ICollection : IEnumerable
{
    int Count { get; }
}

public interface IList : ICollection
{
    object this[int index] { get; set; }
    int Add(object value);
    bool Contains(object value);
    int IndexOf(object value);
    void Clear();
}

public interface IDictionary : ICollection
{
    object this[object key] { get; set; }
    bool Contains(object key);
    void Add(object key, object value);
    void Remove(object key);
}

public interface IComparer
{
    int Compare(object x, object y);
}

public interface IEqualityComparer
{
    bool Equals(object x, object y);
    int GetHashCode(object obj);
}

public interface IStructuralEquatable { }

public class ArrayList : IList
{
    private System.Collections.Generic.List<object> _list = new System.Collections.Generic.List<object>();
    public ArrayList() { }
    public ArrayList(ICollection c)
    {
        foreach (object item in c)
            _list.Add(item);
    }
    public int Count => _list.Count;
    public object this[int index] { get => _list[index]; set => _list[index] = value; }
    public int Add(object value)
    {
        _list.Add(value);
        return _list.Count - 1;
    }
    public bool Contains(object value) => _list.Contains(value);
    public int IndexOf(object value) => _list.IndexOf(value);
    public void Clear() => _list.Clear();
    public void Insert(int index, object value) => _list.Insert(index, value);
    public void Remove(object obj) => _list.Remove(obj);
    public void RemoveAt(int index) => _list.RemoveAt(index);
    public void Sort() => _list.Sort((a, b) => Comparer.Default.Compare(a, b));
    public void Reverse() => _list.Reverse();
    public object[] ToArray() => _list.ToArray();
    public IEnumerator GetEnumerator() => ((IEnumerable)_list).GetEnumerator();
}

public class Hashtable : IDictionary
{
    private System.Collections.Generic.Dictionary<object, object> _map = new System.Collections.Generic.Dictionary<object, object>();
    public Hashtable() { }
    public int Count => _map.Count;
    public object this[object key]
    {
        get => _map.TryGetValue(key, out object value) ? value : null;
        set => _map[key] = value;
    }
    public bool Contains(object key) => _map.ContainsKey(key);
    public bool ContainsKey(object key) => _map.ContainsKey(key);
    public bool ContainsValue(object value) => _map.ContainsValue(value);
    public void Add(object key, object value) => _map.Add(key, value);
    public void Remove(object key) => _map.Remove(key);
    public void Clear() => _map.Clear();
    public ICollection Keys => new System.Collections.Generic.List<object>(_map.Keys);
    public ICollection Values => new System.Collections.Generic.List<object>(_map.Values);
    public IEnumerator GetEnumerator()
    {
        var list = new System.Collections.Generic.List<object>();
        foreach (var pair in _map)
            list.Add(new DictionaryEntry(pair.Key, pair.Value));
        return ((IEnumerable)list).GetEnumerator();
    }
}

public struct DictionaryEntry
{
    public DictionaryEntry(object key, object value)
    {
        Key = key;
        Value = value;
    }
    public object Key { get; set; }
    public object Value { get; set; }
}

public sealed class Comparer : IComparer
{
    public static readonly Comparer Default = new Comparer();
    public extern int Compare(object a, object b);
}
`);

    CS.addLibrary('collections.generic.interfaces', String.raw`
namespace System.Collections.Generic;

public interface IEnumerable<out T> : System.Collections.IEnumerable
{
    new IEnumerator<T> GetEnumerator();
}

public interface IEnumerator<out T> : IDisposable, System.Collections.IEnumerator
{
    new T Current { get; }
}

public interface IReadOnlyCollection<out T> : IEnumerable<T>
{
    int Count { get; }
}

public interface ICollection<T> : IEnumerable<T>
{
    int Count { get; }
    bool IsReadOnly { get; }
    void Add(T item);
    void Clear();
    bool Contains(T item);
    void CopyTo(T[] array, int arrayIndex);
    bool Remove(T item);
}

public interface IReadOnlyList<out T> : IReadOnlyCollection<T>
{
    T this[int index] { get; }
}

public interface IList<T> : ICollection<T>
{
    T this[int index] { get; set; }
    int IndexOf(T item);
    void Insert(int index, T item);
    void RemoveAt(int index);
}

public interface IReadOnlyDictionary<TKey, TValue> : IReadOnlyCollection<KeyValuePair<TKey, TValue>>
{
    TValue this[TKey key] { get; }
    IEnumerable<TKey> Keys { get; }
    IEnumerable<TValue> Values { get; }
    bool ContainsKey(TKey key);
    bool TryGetValue(TKey key, out TValue value);
}

public interface IDictionary<TKey, TValue> : ICollection<KeyValuePair<TKey, TValue>>
{
    TValue this[TKey key] { get; set; }
    ICollection<TKey> Keys { get; }
    ICollection<TValue> Values { get; }
    void Add(TKey key, TValue value);
    bool ContainsKey(TKey key);
    bool Remove(TKey key);
    bool TryGetValue(TKey key, out TValue value);
}

public interface IReadOnlySet<T> : IReadOnlyCollection<T>
{
    bool Contains(T item);
}

public interface ISet<T> : ICollection<T>
{
    new bool Add(T item);
    void UnionWith(IEnumerable<T> other);
    void IntersectWith(IEnumerable<T> other);
    void ExceptWith(IEnumerable<T> other);
    void SymmetricExceptWith(IEnumerable<T> other);
    bool IsSubsetOf(IEnumerable<T> other);
    bool IsSupersetOf(IEnumerable<T> other);
    bool IsProperSubsetOf(IEnumerable<T> other);
    bool IsProperSupersetOf(IEnumerable<T> other);
    bool Overlaps(IEnumerable<T> other);
    bool SetEquals(IEnumerable<T> other);
}

public interface IComparer<in T>
{
    int Compare(T x, T y);
}

public interface IEqualityComparer<in T>
{
    bool Equals(T x, T y);
    int GetHashCode(T obj);
}

public interface IAsyncEnumerable<out T>
{
    IAsyncEnumerator<T> GetAsyncEnumerator(System.Threading.CancellationToken cancellationToken = default);
}

public interface IAsyncEnumerator<out T> : IAsyncDisposable
{
    T Current { get; }
    System.Threading.Tasks.ValueTask<bool> MoveNextAsync();
}

public readonly struct KeyValuePair<TKey, TValue>
{
    private readonly TKey key;
    private readonly TValue value;
    public KeyValuePair(TKey key, TValue value)
    {
        this.key = key;
        this.value = value;
    }
    public TKey Key => key;
    public TValue Value => value;
    public void Deconstruct(out TKey key, out TValue value)
    {
        key = Key;
        value = Value;
    }
    public override string ToString() => "[" + key + ", " + value + "]";
}

public static class KeyValuePair
{
    public static KeyValuePair<TKey, TValue> Create<TKey, TValue>(TKey key, TValue value) => new KeyValuePair<TKey, TValue>(key, value);
}

public class KeyNotFoundException : SystemException
{
    public KeyNotFoundException() : base("The given key was not present in the dictionary.") { }
    public KeyNotFoundException(string message) : base(message) { }
    public KeyNotFoundException(string message, Exception innerException) : base(message, innerException) { }
}

public abstract class Comparer<T> : IComparer<T>, System.Collections.IComparer
{
    private static Comparer<T> _default;
    protected Comparer() { }
    public static Comparer<T> Default => _default ??= new DefaultComparer<T>();
    public abstract int Compare(T x, T y);
    int System.Collections.IComparer.Compare(object x, object y) => Compare((T)x, (T)y);
    public static Comparer<T> Create(Comparison<T> comparison) => new ComparisonComparer<T>(comparison);
}

internal sealed class DefaultComparer<T> : Comparer<T>
{
    public override extern int Compare(T x, T y);
}

internal sealed class ComparisonComparer<T> : Comparer<T>
{
    private readonly Comparison<T> _comparison;
    public ComparisonComparer(Comparison<T> comparison) { _comparison = comparison; }
    public override int Compare(T x, T y) => _comparison(x, y);
}

internal sealed class ReverseComparer<T> : IComparer<T>
{
    private readonly IComparer<T> _comparer;
    public ReverseComparer(IComparer<T> comparer) { _comparer = comparer; }
    public int Compare(T x, T y) => _comparer.Compare(y, x);
}

public abstract class EqualityComparer<T> : IEqualityComparer<T>, System.Collections.IEqualityComparer
{
    private static EqualityComparer<T> _default;
    protected EqualityComparer() { }
    public static EqualityComparer<T> Default => _default ??= new DefaultEqualityComparer<T>();
    public abstract bool Equals(T x, T y);
    public abstract int GetHashCode(T obj);
    bool System.Collections.IEqualityComparer.Equals(object x, object y) => Equals((T)x, (T)y);
    int System.Collections.IEqualityComparer.GetHashCode(object obj) => GetHashCode((T)obj);
    public static EqualityComparer<T> Create(Func<T, T, bool> equals, Func<T, int> getHashCode = null) =>
        new DelegateEqualityComparer<T>(equals, getHashCode);
}

internal sealed class DefaultEqualityComparer<T> : EqualityComparer<T>
{
    public override extern bool Equals(T x, T y);
    public override extern int GetHashCode(T obj);
}

internal sealed class DelegateEqualityComparer<T> : EqualityComparer<T>
{
    private readonly Func<T, T, bool> _equals;
    private readonly Func<T, int> _getHashCode;
    public DelegateEqualityComparer(Func<T, T, bool> equals, Func<T, int> getHashCode)
    {
        _equals = equals;
        _getHashCode = getHashCode;
    }
    public override bool Equals(T x, T y) => _equals(x, y);
    public override int GetHashCode(T obj) => _getHashCode != null ? _getHashCode(obj) : 0;
}

public static class CollectionExtensions
{
    public static TValue GetValueOrDefault<TKey, TValue>(this IReadOnlyDictionary<TKey, TValue> dictionary, TKey key) =>
        dictionary.TryGetValue(key, out TValue value) ? value : default(TValue);
    public static TValue GetValueOrDefault<TKey, TValue>(this IReadOnlyDictionary<TKey, TValue> dictionary, TKey key, TValue defaultValue) =>
        dictionary.TryGetValue(key, out TValue value) ? value : defaultValue;
    public static bool TryAdd<TKey, TValue>(this IDictionary<TKey, TValue> dictionary, TKey key, TValue value)
    {
        if (dictionary.ContainsKey(key))
            return false;
        dictionary.Add(key, value);
        return true;
    }
    public static bool Remove<TKey, TValue>(this IDictionary<TKey, TValue> dictionary, TKey key, out TValue value)
    {
        if (dictionary.TryGetValue(key, out value))
        {
            dictionary.Remove(key);
            return true;
        }
        value = default(TValue);
        return false;
    }
    public static System.Collections.ObjectModel.ReadOnlyCollection<T> AsReadOnly<T>(this IList<T> list) =>
        new System.Collections.ObjectModel.ReadOnlyCollection<T>(list);
}

// Sorting as Array.Sort and List.Sort do it: introspective sort (equal
// keys may change their order as in .NET).
internal static class ArraySortHelper<T>
{
    public static extern void Sort(T[] keys, int index, int length, Comparison<T> comparer);

    public static int BinarySearch(T[] array, int index, int length, T value, IComparer<T> comparer)
    {
        int lo = index;
        int hi = index + length - 1;
        while (lo <= hi)
        {
            int i = lo + ((hi - lo) >> 1);
            int order = comparer.Compare(array[i], value);
            if (order == 0)
                return i;
            if (order < 0)
                lo = i + 1;
            else
                hi = i - 1;
        }
        return ~lo;
    }
}
`);

    CS.addLibrary('system.stringcomparer', String.raw`
using System.Collections.Generic;
namespace System;

public abstract class StringComparer : IComparer<string>, IEqualityComparer<string>, System.Collections.IComparer,
    System.Collections.IEqualityComparer
{
    protected StringComparer() { }
    public static StringComparer Ordinal { get; } = new StringComparisonComparer(StringComparison.Ordinal);
    public static StringComparer OrdinalIgnoreCase { get; } = new StringComparisonComparer(StringComparison.OrdinalIgnoreCase);
    public static StringComparer CurrentCulture { get; } = new StringComparisonComparer(StringComparison.CurrentCulture);
    public static StringComparer CurrentCultureIgnoreCase { get; } = new StringComparisonComparer(StringComparison.CurrentCultureIgnoreCase);
    public static StringComparer InvariantCulture { get; } = new StringComparisonComparer(StringComparison.InvariantCulture);
    public static StringComparer InvariantCultureIgnoreCase { get; } = new StringComparisonComparer(StringComparison.InvariantCultureIgnoreCase);
    public static StringComparer FromComparison(StringComparison comparisonType) => new StringComparisonComparer(comparisonType);
    public static StringComparer Create(System.Globalization.CultureInfo culture, bool ignoreCase) =>
        ignoreCase ? InvariantCultureIgnoreCase : InvariantCulture;
    public abstract int Compare(string x, string y);
    public abstract bool Equals(string x, string y);
    public abstract int GetHashCode(string obj);
    public int Compare(object x, object y)
    {
        if (x == y)
            return 0;
        if (x == null)
            return -1;
        if (y == null)
            return 1;
        if (x is string sx && y is string sy)
            return Compare(sx, sy);
        if (x is IComparable comparable)
            return comparable.CompareTo(y);
        throw new ArgumentException("At least one object must implement IComparable.");
    }
    public new bool Equals(object x, object y)
    {
        if (x == y)
            return true;
        if (x == null || y == null)
            return false;
        if (x is string sx && y is string sy)
            return Equals(sx, sy);
        return x.Equals(y);
    }
    public int GetHashCode(object obj)
    {
        if (obj == null)
            throw new ArgumentNullException("obj");
        return obj is string s ? GetHashCode(s) : obj.GetHashCode();
    }
}

internal sealed class StringComparisonComparer : StringComparer
{
    private readonly StringComparison _comparison;
    internal StringComparisonComparer(StringComparison comparison) { _comparison = comparison; }
    public override int Compare(string x, string y) => string.Compare(x, y, _comparison);
    public override bool Equals(string x, string y) => string.Equals(x, y, _comparison);
    public override int GetHashCode(string obj)
    {
        if (obj == null)
            throw new ArgumentNullException("obj");
        bool ignoreCase = _comparison == StringComparison.OrdinalIgnoreCase || _comparison == StringComparison.CurrentCultureIgnoreCase ||
            _comparison == StringComparison.InvariantCultureIgnoreCase;
        return ignoreCase ? obj.ToUpperInvariant().GetHashCode() : obj.GetHashCode();
    }
}
`);

    CS.addLibrary('collections.list', String.raw`
namespace System.Collections.Generic;

public class List<T> : IList<T>, IReadOnlyList<T>, System.Collections.IList
{
    internal T[] _items;
    internal int _size;
    internal int _version;

    public List() { _items = new T[0]; }

    public List(int capacity)
    {
        if (capacity < 0)
            throw new ArgumentOutOfRangeException("capacity", "Non-negative number required.");
        _items = new T[capacity];
    }

    public List(IEnumerable<T> collection)
    {
        if (collection == null)
            throw new ArgumentNullException("collection");
        if (collection is ICollection<T> c)
        {
            int count = c.Count;
            _items = new T[count];
            c.CopyTo(_items, 0);
            _size = count;
        }
        else
        {
            _items = new T[0];
            foreach (T item in collection)
                Add(item);
        }
    }

    public int Capacity
    {
        get => _items.Length;
        set
        {
            if (value < _size)
                throw new ArgumentOutOfRangeException("value", "capacity was less than the current size.");
            if (value != _items.Length)
            {
                T[] items = new T[value];
                Array.Copy(_items, items, _size);
                _items = items;
            }
        }
    }

    public int Count => _size;
    public bool IsReadOnly => false;

    public T this[int index]
    {
        get
        {
            if ((uint)index >= (uint)_size)
                ThrowIndex();
            return _items[index];
        }
        set
        {
            if ((uint)index >= (uint)_size)
                ThrowIndex();
            _items[index] = value;
            _version++;
        }
    }

    private static void ThrowIndex()
    {
        throw new ArgumentOutOfRangeException("index", "Index was out of range. Must be non-negative and less than the size of the collection.");
    }

    object System.Collections.IList.this[int index] { get => this[index]; set => this[index] = (T)value; }

    public void Add(T item)
    {
        _version++;
        if (_size == _items.Length)
            Grow(_size + 1);
        _items[_size++] = item;
    }

    int System.Collections.IList.Add(object item)
    {
        Add((T)item);
        return _size - 1;
    }

    private void Grow(int capacity)
    {
        int newCapacity = _items.Length == 0 ? 4 : 2 * _items.Length;
        if (newCapacity < capacity)
            newCapacity = capacity;
        Capacity = newCapacity;
    }

    public void AddRange(IEnumerable<T> collection)
    {
        if (collection == null)
            throw new ArgumentNullException("collection");
        if (collection is ICollection<T> c)
        {
            int count = c.Count;
            if (count > 0)
            {
                if (_items.Length - _size < count)
                    Grow(_size + count);
                if (c == this)
                {
                    Array.Copy(_items, 0, _items, _size, _size);
                }
                else
                {
                    T[] copy = new T[count];
                    c.CopyTo(copy, 0);
                    Array.Copy(copy, 0, _items, _size, count);
                }
                _size += count;
                _version++;
            }
            return;
        }
        foreach (T item in collection)
            Add(item);
    }

    public System.Collections.ObjectModel.ReadOnlyCollection<T> AsReadOnly() => new System.Collections.ObjectModel.ReadOnlyCollection<T>(this);

    public int BinarySearch(T item) => BinarySearch(0, Count, item, null);
    public int BinarySearch(T item, IComparer<T> comparer) => BinarySearch(0, Count, item, comparer);
    public int BinarySearch(int index, int count, T item, IComparer<T> comparer) =>
        ArraySortHelper<T>.BinarySearch(_items, index, count, item, comparer ?? Comparer<T>.Default);

    public void Clear()
    {
        _version++;
        if (_size > 0)
            Array.Clear(_items, 0, _size);
        _size = 0;
    }

    public bool Contains(T item) => _size != 0 && IndexOf(item) >= 0;
    bool System.Collections.IList.Contains(object item) => item is T value && Contains(value);

    public List<TOutput> ConvertAll<TOutput>(Converter<T, TOutput> converter)
    {
        var list = new List<TOutput>(_size);
        for (int i = 0; i < _size; i++)
            list._items[i] = converter(_items[i]);
        list._size = _size;
        return list;
    }

    public void CopyTo(T[] array) => CopyTo(array, 0);
    public void CopyTo(T[] array, int arrayIndex) => Array.Copy(_items, 0, array, arrayIndex, _size);
    public void CopyTo(int index, T[] array, int arrayIndex, int count) => Array.Copy(_items, index, array, arrayIndex, count);

    public int EnsureCapacity(int capacity)
    {
        if (_items.Length < capacity)
            Grow(capacity);
        return _items.Length;
    }

    public bool Exists(Predicate<T> match) => FindIndex(match) != -1;

    public T Find(Predicate<T> match)
    {
        for (int i = 0; i < _size; i++)
            if (match(_items[i]))
                return _items[i];
        return default(T);
    }

    public List<T> FindAll(Predicate<T> match)
    {
        var list = new List<T>();
        for (int i = 0; i < _size; i++)
            if (match(_items[i]))
                list.Add(_items[i]);
        return list;
    }

    public int FindIndex(Predicate<T> match) => FindIndex(0, _size, match);
    public int FindIndex(int startIndex, Predicate<T> match) => FindIndex(startIndex, _size - startIndex, match);
    public int FindIndex(int startIndex, int count, Predicate<T> match)
    {
        if ((uint)startIndex > (uint)_size)
            throw new ArgumentOutOfRangeException("startIndex", "Index was out of range. Must be non-negative and less than or equal to the size of the collection.");
        int endIndex = startIndex + count;
        for (int i = startIndex; i < endIndex; i++)
            if (match(_items[i]))
                return i;
        return -1;
    }

    public T FindLast(Predicate<T> match)
    {
        for (int i = _size - 1; i >= 0; i--)
            if (match(_items[i]))
                return _items[i];
        return default(T);
    }

    public int FindLastIndex(Predicate<T> match)
    {
        for (int i = _size - 1; i >= 0; i--)
            if (match(_items[i]))
                return i;
        return -1;
    }

    public void ForEach(Action<T> action)
    {
        int version = _version;
        for (int i = 0; i < _size; i++)
        {
            if (version != _version)
                break;
            action(_items[i]);
        }
        if (version != _version)
            throw new InvalidOperationException("Collection was modified; enumeration operation may not execute.");
    }

    public IEnumerator<T> GetEnumerator() => new Enumerator(this);
    System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => new Enumerator(this);

    public List<T> GetRange(int index, int count)
    {
        if (index < 0 || count < 0 || _size - index < count)
            throw new ArgumentException("Offset and length were out of bounds for the array or count is greater than the number of elements from index to the end of the source collection.");
        var list = new List<T>(count);
        Array.Copy(_items, index, list._items, 0, count);
        list._size = count;
        return list;
    }

    public List<T> Slice(int start, int length) => GetRange(start, length);

    public int IndexOf(T item) => Array.IndexOf(_items, item, 0, _size);
    int System.Collections.IList.IndexOf(object item) => item is T value ? IndexOf(value) : -1;
    public int IndexOf(T item, int index) => Array.IndexOf(_items, item, index, _size - index);
    public int IndexOf(T item, int index, int count) => Array.IndexOf(_items, item, index, count);

    public void Insert(int index, T item)
    {
        if ((uint)index > (uint)_size)
            throw new ArgumentOutOfRangeException("index", "Index must be within the bounds of the List.");
        if (_size == _items.Length)
            Grow(_size + 1);
        if (index < _size)
            Array.Copy(_items, index, _items, index + 1, _size - index);
        _items[index] = item;
        _size++;
        _version++;
    }

    public void InsertRange(int index, IEnumerable<T> collection)
    {
        if ((uint)index > (uint)_size)
            throw new ArgumentOutOfRangeException("index", "Index must be within the bounds of the List.");
        var items = new List<T>(collection);
        int count = items.Count;
        if (count > 0)
        {
            if (_items.Length - _size < count)
                Grow(_size + count);
            if (index < _size)
                Array.Copy(_items, index, _items, index + count, _size - index);
            Array.Copy(items._items, 0, _items, index, count);
            _size += count;
            _version++;
        }
    }

    public int LastIndexOf(T item) => _size == 0 ? -1 : Array.LastIndexOf(_items, item, _size - 1);

    public bool Remove(T item)
    {
        int index = IndexOf(item);
        if (index >= 0)
        {
            RemoveAt(index);
            return true;
        }
        return false;
    }

    void System.Collections.IList.Clear() => Clear();

    public int RemoveAll(Predicate<T> match)
    {
        int freeIndex = 0;
        while (freeIndex < _size && !match(_items[freeIndex]))
            freeIndex++;
        if (freeIndex >= _size)
            return 0;
        int current = freeIndex + 1;
        while (current < _size)
        {
            while (current < _size && match(_items[current]))
                current++;
            if (current < _size)
                _items[freeIndex++] = _items[current++];
        }
        Array.Clear(_items, freeIndex, _size - freeIndex);
        int result = _size - freeIndex;
        _size = freeIndex;
        _version++;
        return result;
    }

    public void RemoveAt(int index)
    {
        if ((uint)index >= (uint)_size)
            ThrowIndex();
        _size--;
        if (index < _size)
            Array.Copy(_items, index + 1, _items, index, _size - index);
        _items[_size] = default(T);
        _version++;
    }

    public void RemoveRange(int index, int count)
    {
        if (index < 0 || count < 0 || _size - index < count)
            throw new ArgumentException("Offset and length were out of bounds for the array or count is greater than the number of elements from index to the end of the source collection.");
        if (count > 0)
        {
            _size -= count;
            if (index < _size)
                Array.Copy(_items, index + count, _items, index, _size - index);
            _version++;
            Array.Clear(_items, _size, count);
        }
    }

    public void Reverse() => Reverse(0, Count);
    public void Reverse(int index, int count)
    {
        if (count > 1)
            Array.Reverse(_items, index, count);
        _version++;
    }

    public void Sort() => Sort(0, Count, null);
    public void Sort(IComparer<T> comparer) => Sort(0, Count, comparer);
    public void Sort(int index, int count, IComparer<T> comparer)
    {
        if (count > 1)
        {
            IComparer<T> actual = comparer ?? Comparer<T>.Default;
            ArraySortHelper<T>.Sort(_items, index, count, (x, y) => actual.Compare(x, y));
        }
        _version++;
    }
    public void Sort(Comparison<T> comparison)
    {
        if (comparison == null)
            throw new ArgumentNullException("comparison");
        if (_size > 1)
            ArraySortHelper<T>.Sort(_items, 0, _size, comparison);
        _version++;
    }

    public T[] ToArray()
    {
        T[] array = new T[_size];
        Array.Copy(_items, array, _size);
        return array;
    }

    public void TrimExcess()
    {
        int threshold = (int)(_items.Length * 0.9);
        if (_size < threshold)
            Capacity = _size;
    }

    public bool TrueForAll(Predicate<T> match)
    {
        for (int i = 0; i < _size; i++)
            if (!match(_items[i]))
                return false;
        return true;
    }

    public sealed class Enumerator : IEnumerator<T>
    {
        private readonly List<T> _list;
        private int _index;
        private readonly int _version;
        private T _current;
        internal Enumerator(List<T> list)
        {
            _list = list;
            _version = list._version;
        }
        public void Dispose() { }
        public bool MoveNext()
        {
            if (_version == _list._version && (uint)_index < (uint)_list._size)
            {
                _current = _list._items[_index];
                _index++;
                return true;
            }
            if (_version != _list._version)
                throw new InvalidOperationException("Collection was modified; enumeration operation may not execute.");
            _index = _list._size + 1;
            _current = default(T);
            return false;
        }
        public T Current => _current;
        object System.Collections.IEnumerator.Current => _current;
        public void Reset()
        {
            _index = 0;
            _current = default(T);
        }
    }
}
`);

    CS.addLibrary('collections.dictionary', String.raw`
namespace System.Collections.Generic;

// The dictionary of .NET: entries in the order of insertion, a free list
// of removed entries (the last removed is reused first), buckets of indices.
public class Dictionary<TKey, TValue> : IDictionary<TKey, TValue>, IReadOnlyDictionary<TKey, TValue>
{
    private int[] _buckets;
    private int[] _next;
    private int[] _hashes;
    private TKey[] _keys;
    private TValue[] _values;
    private int _count;
    private int _freeList;
    private int _freeCount;
    private int _version;
    private IEqualityComparer<TKey> _comparer;

    public Dictionary() : this(0, null) { }
    public Dictionary(int capacity) : this(capacity, null) { }
    public Dictionary(IEqualityComparer<TKey> comparer) : this(0, comparer) { }

    public Dictionary(int capacity, IEqualityComparer<TKey> comparer)
    {
        if (capacity < 0)
            throw new ArgumentOutOfRangeException("capacity", "Non-negative number required.");
        if (capacity > 0)
            Initialize(capacity);
        _comparer = comparer ?? EqualityComparer<TKey>.Default;
    }

    public Dictionary(IDictionary<TKey, TValue> dictionary) : this(dictionary, null) { }

    public Dictionary(IDictionary<TKey, TValue> dictionary, IEqualityComparer<TKey> comparer) : this(dictionary != null ? dictionary.Count : 0, comparer)
    {
        if (dictionary == null)
            throw new ArgumentNullException("dictionary");
        foreach (var pair in dictionary)
            Add(pair.Key, pair.Value);
    }

    public Dictionary(IEnumerable<KeyValuePair<TKey, TValue>> collection) : this(collection, null) { }

    public Dictionary(IEnumerable<KeyValuePair<TKey, TValue>> collection, IEqualityComparer<TKey> comparer) : this(0, comparer)
    {
        if (collection == null)
            throw new ArgumentNullException("collection");
        foreach (var pair in collection)
            Add(pair.Key, pair.Value);
    }

    public IEqualityComparer<TKey> Comparer => _comparer;
    public int Count => _count - _freeCount;
    public bool IsReadOnly => false;
    public int Capacity => _keys == null ? 0 : _keys.Length;

    public KeyCollection Keys => new KeyCollection(this);
    public ValueCollection Values => new ValueCollection(this);
    ICollection<TKey> IDictionary<TKey, TValue>.Keys => new KeyCollection(this);
    ICollection<TValue> IDictionary<TKey, TValue>.Values => new ValueCollection(this);
    IEnumerable<TKey> IReadOnlyDictionary<TKey, TValue>.Keys => new KeyCollection(this);
    IEnumerable<TValue> IReadOnlyDictionary<TKey, TValue>.Values => new ValueCollection(this);

    public TValue this[TKey key]
    {
        get
        {
            int i = FindEntry(key);
            if (i >= 0)
                return _values[i];
            throw new KeyNotFoundException("The given key '" + key + "' was not present in the dictionary.");
        }
        set => TryInsert(key, value, true);
    }

    private void Initialize(int capacity)
    {
        int size = HashHelpers.GetPrime(capacity);
        _buckets = new int[size];
        _next = new int[size];
        _hashes = new int[size];
        _keys = new TKey[size];
        _values = new TValue[size];
        _freeList = -1;
    }

    private int Hash(TKey key) => _comparer.GetHashCode(key) & 0x7FFFFFFF;

    private int FindEntry(TKey key)
    {
        if (key == null)
            throw new ArgumentNullException("key");
        if (_buckets == null)
            return -1;
        int hash = Hash(key);
        int i = _buckets[hash % _buckets.Length] - 1;
        while (i >= 0)
        {
            if (_hashes[i] == hash && _comparer.Equals(_keys[i], key))
                return i;
            i = _next[i];
        }
        return -1;
    }

    // add: false - replace an existing value; true for the indexer... the
    // parameter overwrite tells which (Add throws on a duplicate).
    private bool TryInsert(TKey key, TValue value, bool overwrite)
    {
        if (key == null)
            throw new ArgumentNullException("key");
        if (_buckets == null)
            Initialize(0);
        int hash = Hash(key);
        int bucket = hash % _buckets.Length;
        int i = _buckets[bucket] - 1;
        while (i >= 0)
        {
            if (_hashes[i] == hash && _comparer.Equals(_keys[i], key))
            {
                if (overwrite)
                {
                    _values[i] = value;
                    return true;
                }
                return false;
            }
            i = _next[i];
        }
        int index;
        if (_freeCount > 0)
        {
            index = _freeList;
            _freeList = -3 - _next[_freeList];
            _freeCount--;
        }
        else
        {
            if (_count == _keys.Length)
            {
                Resize();
                bucket = hash % _buckets.Length;
            }
            index = _count;
            _count++;
        }
        _hashes[index] = hash;
        _next[index] = _buckets[bucket] - 1;
        _keys[index] = key;
        _values[index] = value;
        _buckets[bucket] = index + 1;
        _version++;
        return true;
    }

    private void Resize()
    {
        int newSize = HashHelpers.ExpandPrime(_count);
        int[] buckets = new int[newSize];
        int[] next = new int[newSize];
        int[] hashes = new int[newSize];
        TKey[] keys = new TKey[newSize];
        TValue[] values = new TValue[newSize];
        Array.Copy(_hashes, hashes, _count);
        Array.Copy(_keys, keys, _count);
        Array.Copy(_values, values, _count);
        Array.Copy(_next, next, _count);
        for (int i = 0; i < _count; i++)
        {
            if (next[i] >= -1)
            {
                int bucket = hashes[i] % newSize;
                next[i] = buckets[bucket] - 1;
                buckets[bucket] = i + 1;
            }
        }
        _buckets = buckets;
        _next = next;
        _hashes = hashes;
        _keys = keys;
        _values = values;
    }

    public void Add(TKey key, TValue value)
    {
        if (!TryInsert(key, value, false))
            throw new ArgumentException("An item with the same key has already been added. Key: " + key);
    }

    public bool TryAdd(TKey key, TValue value) => TryInsert(key, value, false);

    void ICollection<KeyValuePair<TKey, TValue>>.Add(KeyValuePair<TKey, TValue> pair) => Add(pair.Key, pair.Value);
    bool ICollection<KeyValuePair<TKey, TValue>>.Contains(KeyValuePair<TKey, TValue> pair)
    {
        int i = FindEntry(pair.Key);
        return i >= 0 && EqualityComparer<TValue>.Default.Equals(_values[i], pair.Value);
    }
    bool ICollection<KeyValuePair<TKey, TValue>>.Remove(KeyValuePair<TKey, TValue> pair) => Remove(pair.Key);
    void ICollection<KeyValuePair<TKey, TValue>>.CopyTo(KeyValuePair<TKey, TValue>[] array, int index)
    {
        foreach (var pair in this)
            array[index++] = pair;
    }

    public void Clear()
    {
        if (_count > 0)
        {
            Array.Clear(_buckets, 0, _buckets.Length);
            Array.Clear(_keys, 0, _count);
            Array.Clear(_values, 0, _count);
            _count = 0;
            _freeList = -1;
            _freeCount = 0;
            _version++;
        }
    }

    public bool ContainsKey(TKey key) => FindEntry(key) >= 0;

    public bool ContainsValue(TValue value)
    {
        var comparer = EqualityComparer<TValue>.Default;
        for (int i = 0; i < _count; i++)
            if (_next[i] >= -1 && comparer.Equals(_values[i], value))
                return true;
        return false;
    }

    public bool Remove(TKey key) => Remove(key, out TValue ignored);

    public bool Remove(TKey key, out TValue value)
    {
        if (key == null)
            throw new ArgumentNullException("key");
        if (_buckets != null)
        {
            int hash = Hash(key);
            int bucket = hash % _buckets.Length;
            int last = -1;
            int i = _buckets[bucket] - 1;
            while (i >= 0)
            {
                if (_hashes[i] == hash && _comparer.Equals(_keys[i], key))
                {
                    if (last < 0)
                        _buckets[bucket] = _next[i] + 1;
                    else
                        _next[last] = _next[i];
                    value = _values[i];
                    _next[i] = -3 - _freeList;
                    _keys[i] = default(TKey);
                    _values[i] = default(TValue);
                    _freeList = i;
                    _freeCount++;
                    _version++;
                    return true;
                }
                last = i;
                i = _next[i];
            }
        }
        value = default(TValue);
        return false;
    }

    public bool TryGetValue(TKey key, out TValue value)
    {
        int i = FindEntry(key);
        if (i >= 0)
        {
            value = _values[i];
            return true;
        }
        value = default(TValue);
        return false;
    }

    public TValue GetValueOrDefault(TKey key)
    {
        int i = FindEntry(key);
        return i >= 0 ? _values[i] : default(TValue);
    }

    public int EnsureCapacity(int capacity)
    {
        if (_keys == null)
            Initialize(capacity);
        return _keys.Length;
    }

    public void TrimExcess() { }

    public IEnumerator<KeyValuePair<TKey, TValue>> GetEnumerator() => new Enumerator(this);
    System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => new Enumerator(this);

    internal bool EntryAt(int i) => _next[i] >= -1;
    internal TKey KeyAt(int i) => _keys[i];
    internal TValue ValueAt(int i) => _values[i];
    internal int Used => _count;
    internal int Version => _version;

    public sealed class Enumerator : IEnumerator<KeyValuePair<TKey, TValue>>
    {
        private readonly Dictionary<TKey, TValue> _dictionary;
        private readonly int _version;
        private int _index;
        private KeyValuePair<TKey, TValue> _current;
        internal Enumerator(Dictionary<TKey, TValue> dictionary)
        {
            _dictionary = dictionary;
            _version = dictionary._version;
        }
        public bool MoveNext()
        {
            if (_version != _dictionary._version)
                throw new InvalidOperationException("Collection was modified; enumeration operation may not execute.");
            while ((uint)_index < (uint)_dictionary._count)
            {
                int i = _index++;
                if (_dictionary._next[i] >= -1)
                {
                    _current = new KeyValuePair<TKey, TValue>(_dictionary._keys[i], _dictionary._values[i]);
                    return true;
                }
            }
            _index = _dictionary._count + 1;
            _current = default(KeyValuePair<TKey, TValue>);
            return false;
        }
        public KeyValuePair<TKey, TValue> Current => _current;
        object System.Collections.IEnumerator.Current => _current;
        public void Dispose() { }
        public void Reset()
        {
            _index = 0;
        }
    }

    public sealed class KeyCollection : ICollection<TKey>, IReadOnlyCollection<TKey>
    {
        private readonly Dictionary<TKey, TValue> _dictionary;
        public KeyCollection(Dictionary<TKey, TValue> dictionary) { _dictionary = dictionary; }
        public int Count => _dictionary.Count;
        public bool IsReadOnly => true;
        public void Add(TKey item) => throw new NotSupportedException("Mutating a key collection derived from a dictionary is not allowed.");
        public void Clear() => throw new NotSupportedException("Mutating a key collection derived from a dictionary is not allowed.");
        public bool Contains(TKey item) => _dictionary.ContainsKey(item);
        public bool Remove(TKey item) => throw new NotSupportedException("Mutating a key collection derived from a dictionary is not allowed.");
        public void CopyTo(TKey[] array, int index)
        {
            for (int i = 0; i < _dictionary.Used; i++)
                if (_dictionary.EntryAt(i))
                    array[index++] = _dictionary.KeyAt(i);
        }
        public IEnumerator<TKey> GetEnumerator()
        {
            int version = _dictionary.Version;
            for (int i = 0; i < _dictionary.Used; i++)
            {
                if (version != _dictionary.Version)
                    throw new InvalidOperationException("Collection was modified; enumeration operation may not execute.");
                if (_dictionary.EntryAt(i))
                    yield return _dictionary.KeyAt(i);
            }
        }
        System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => GetEnumerator();
    }

    public sealed class ValueCollection : ICollection<TValue>, IReadOnlyCollection<TValue>
    {
        private readonly Dictionary<TKey, TValue> _dictionary;
        public ValueCollection(Dictionary<TKey, TValue> dictionary) { _dictionary = dictionary; }
        public int Count => _dictionary.Count;
        public bool IsReadOnly => true;
        public void Add(TValue item) => throw new NotSupportedException("Mutating a value collection derived from a dictionary is not allowed.");
        public void Clear() => throw new NotSupportedException("Mutating a value collection derived from a dictionary is not allowed.");
        public bool Contains(TValue item) => _dictionary.ContainsValue(item);
        public bool Remove(TValue item) => throw new NotSupportedException("Mutating a value collection derived from a dictionary is not allowed.");
        public void CopyTo(TValue[] array, int index)
        {
            for (int i = 0; i < _dictionary.Used; i++)
                if (_dictionary.EntryAt(i))
                    array[index++] = _dictionary.ValueAt(i);
        }
        public IEnumerator<TValue> GetEnumerator()
        {
            int version = _dictionary.Version;
            for (int i = 0; i < _dictionary.Used; i++)
            {
                if (version != _dictionary.Version)
                    throw new InvalidOperationException("Collection was modified; enumeration operation may not execute.");
                if (_dictionary.EntryAt(i))
                    yield return _dictionary.ValueAt(i);
            }
        }
        System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => GetEnumerator();
    }
}

internal static class HashHelpers
{
    private static readonly int[] Primes = {
        3, 7, 11, 17, 23, 29, 37, 47, 59, 71, 89, 107, 131, 163, 197, 239, 293, 353, 431, 521, 631, 761, 919,
        1103, 1327, 1597, 1931, 2333, 2801, 3371, 4049, 4861, 5839, 7013, 8419, 10103, 12143, 14591,
        17519, 21023, 25229, 30293, 36353, 43627, 52361, 62851, 75431, 90523, 108631, 130363, 156437,
        187751, 225307, 270371, 324449, 389357, 467237, 560689, 672827, 807403, 968897, 1162687, 1395263,
        1674319, 2009191, 2411033, 2893249, 3471899, 4166287, 4999559, 5999471, 7199369 };

    public static bool IsPrime(int candidate)
    {
        if ((candidate & 1) != 0)
        {
            int limit = (int)Math.Sqrt(candidate);
            for (int divisor = 3; divisor <= limit; divisor += 2)
                if (candidate % divisor == 0)
                    return false;
            return true;
        }
        return candidate == 2;
    }

    public static int GetPrime(int min)
    {
        foreach (int prime in Primes)
            if (prime >= min)
                return prime;
        for (int i = min | 1; i < int.MaxValue; i += 2)
            if (IsPrime(i) && (i - 1) % 101 != 0)
                return i;
        return min;
    }

    public static int ExpandPrime(int oldSize) => GetPrime(2 * oldSize);
}

// The set of .NET: as the dictionary, without values.
public class HashSet<T> : ISet<T>, IReadOnlySet<T>, IReadOnlyCollection<T>
{
    private int[] _buckets;
    private int[] _next;
    private int[] _hashes;
    private T[] _slots;
    private int _count;
    private int _freeList;
    private int _freeCount;
    private int _version;
    private IEqualityComparer<T> _comparer;

    public HashSet() : this((IEqualityComparer<T>)null) { }
    public HashSet(IEqualityComparer<T> comparer) { _comparer = comparer ?? EqualityComparer<T>.Default; }
    public HashSet(int capacity) : this(capacity, null) { }
    public HashSet(int capacity, IEqualityComparer<T> comparer) : this(comparer)
    {
        if (capacity > 0)
            Initialize(capacity);
    }
    public HashSet(IEnumerable<T> collection) : this(collection, null) { }
    public HashSet(IEnumerable<T> collection, IEqualityComparer<T> comparer) : this(comparer)
    {
        if (collection == null)
            throw new ArgumentNullException("collection");
        UnionWith(collection);
    }

    public IEqualityComparer<T> Comparer => _comparer;
    public int Count => _count - _freeCount;
    public bool IsReadOnly => false;

    private void Initialize(int capacity)
    {
        int size = HashHelpers.GetPrime(capacity);
        _buckets = new int[size];
        _next = new int[size];
        _hashes = new int[size];
        _slots = new T[size];
        _freeList = -1;
    }

    private int Hash(T item) => item == null ? 0 : _comparer.GetHashCode(item) & 0x7FFFFFFF;

    private int FindItem(T item)
    {
        if (_buckets == null)
            return -1;
        int hash = Hash(item);
        int i = _buckets[hash % _buckets.Length] - 1;
        while (i >= 0)
        {
            if (_hashes[i] == hash && _comparer.Equals(_slots[i], item))
                return i;
            i = _next[i];
        }
        return -1;
    }

    public bool Contains(T item) => FindItem(item) >= 0;

    public bool Add(T item)
    {
        if (_buckets == null)
            Initialize(0);
        int hash = Hash(item);
        int bucket = hash % _buckets.Length;
        int i = _buckets[bucket] - 1;
        while (i >= 0)
        {
            if (_hashes[i] == hash && _comparer.Equals(_slots[i], item))
                return false;
            i = _next[i];
        }
        int index;
        if (_freeCount > 0)
        {
            index = _freeList;
            _freeList = -3 - _next[_freeList];
            _freeCount--;
        }
        else
        {
            if (_count == _slots.Length)
            {
                Resize();
                bucket = hash % _buckets.Length;
            }
            index = _count;
            _count++;
        }
        _hashes[index] = hash;
        _next[index] = _buckets[bucket] - 1;
        _slots[index] = item;
        _buckets[bucket] = index + 1;
        _version++;
        return true;
    }

    void ICollection<T>.Add(T item) => Add(item);

    private void Resize()
    {
        int newSize = HashHelpers.ExpandPrime(_count);
        int[] buckets = new int[newSize];
        int[] next = new int[newSize];
        int[] hashes = new int[newSize];
        T[] slots = new T[newSize];
        Array.Copy(_hashes, hashes, _count);
        Array.Copy(_slots, slots, _count);
        Array.Copy(_next, next, _count);
        for (int i = 0; i < _count; i++)
        {
            if (next[i] >= -1)
            {
                int bucket = hashes[i] % newSize;
                next[i] = buckets[bucket] - 1;
                buckets[bucket] = i + 1;
            }
        }
        _buckets = buckets;
        _next = next;
        _hashes = hashes;
        _slots = slots;
    }

    public bool Remove(T item)
    {
        if (_buckets == null)
            return false;
        int hash = Hash(item);
        int bucket = hash % _buckets.Length;
        int last = -1;
        int i = _buckets[bucket] - 1;
        while (i >= 0)
        {
            if (_hashes[i] == hash && _comparer.Equals(_slots[i], item))
            {
                if (last < 0)
                    _buckets[bucket] = _next[i] + 1;
                else
                    _next[last] = _next[i];
                _next[i] = -3 - _freeList;
                _slots[i] = default(T);
                _freeList = i;
                _freeCount++;
                _version++;
                return true;
            }
            last = i;
            i = _next[i];
        }
        return false;
    }

    public void Clear()
    {
        if (_count > 0)
        {
            Array.Clear(_buckets, 0, _buckets.Length);
            Array.Clear(_slots, 0, _count);
            _count = 0;
            _freeList = -1;
            _freeCount = 0;
            _version++;
        }
    }

    public void CopyTo(T[] array) => CopyTo(array, 0);
    public void CopyTo(T[] array, int arrayIndex)
    {
        for (int i = 0; i < _count; i++)
            if (_next[i] >= -1)
                array[arrayIndex++] = _slots[i];
    }

    public int RemoveWhere(Predicate<T> match)
    {
        int removed = 0;
        for (int i = 0; i < _count; i++)
        {
            if (_next[i] >= -1)
            {
                T item = _slots[i];
                if (match(item) && Remove(item))
                    removed++;
            }
        }
        return removed;
    }

    public bool TryGetValue(T equalValue, out T actualValue)
    {
        int i = FindItem(equalValue);
        if (i >= 0)
        {
            actualValue = _slots[i];
            return true;
        }
        actualValue = default(T);
        return false;
    }

    public void UnionWith(IEnumerable<T> other)
    {
        foreach (T item in other)
            Add(item);
    }

    public void IntersectWith(IEnumerable<T> other)
    {
        var keep = new HashSet<T>(other, _comparer);
        for (int i = 0; i < _count; i++)
        {
            if (_next[i] >= -1)
            {
                T item = _slots[i];
                if (!keep.Contains(item))
                    Remove(item);
            }
        }
    }

    public void ExceptWith(IEnumerable<T> other)
    {
        foreach (T item in other)
            Remove(item);
    }

    public void SymmetricExceptWith(IEnumerable<T> other)
    {
        foreach (T item in new HashSet<T>(other, _comparer))
            if (!Remove(item))
                Add(item);
    }

    public bool IsSubsetOf(IEnumerable<T> other)
    {
        var set = new HashSet<T>(other, _comparer);
        foreach (T item in this)
            if (!set.Contains(item))
                return false;
        return true;
    }

    public bool IsSupersetOf(IEnumerable<T> other)
    {
        foreach (T item in other)
            if (!Contains(item))
                return false;
        return true;
    }

    public bool IsProperSubsetOf(IEnumerable<T> other)
    {
        var set = new HashSet<T>(other, _comparer);
        return set.Count > Count && IsSubsetOf(set);
    }

    public bool IsProperSupersetOf(IEnumerable<T> other)
    {
        var set = new HashSet<T>(other, _comparer);
        return Count > set.Count && IsSupersetOf(set);
    }

    public bool Overlaps(IEnumerable<T> other)
    {
        foreach (T item in other)
            if (Contains(item))
                return true;
        return false;
    }

    public bool SetEquals(IEnumerable<T> other)
    {
        var set = new HashSet<T>(other, _comparer);
        return set.Count == Count && IsSupersetOf(set);
    }

    public int EnsureCapacity(int capacity)
    {
        if (_slots == null)
            Initialize(capacity);
        return _slots.Length;
    }

    public void TrimExcess() { }

    public IEnumerator<T> GetEnumerator()
    {
        int version = _version;
        for (int i = 0; i < _count; i++)
        {
            if (version != _version)
                throw new InvalidOperationException("Collection was modified; enumeration operation may not execute.");
            if (_next[i] >= -1)
                yield return _slots[i];
        }
        if (version != _version)
            throw new InvalidOperationException("Collection was modified; enumeration operation may not execute.");
    }
    System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => GetEnumerator();
}
`);

    CS.addLibrary('collections.queues', String.raw`
namespace System.Collections.Generic;

public class Queue<T> : IReadOnlyCollection<T>, System.Collections.ICollection
{
    private T[] _array;
    private int _head;
    private int _tail;
    private int _size;
    private int _version;

    public Queue() { _array = new T[0]; }
    public Queue(int capacity)
    {
        if (capacity < 0)
            throw new ArgumentOutOfRangeException("capacity", "Non-negative number required.");
        _array = new T[capacity];
    }
    public Queue(IEnumerable<T> collection)
    {
        if (collection == null)
            throw new ArgumentNullException("collection");
        _array = new T[0];
        foreach (T item in collection)
            Enqueue(item);
    }

    public int Count => _size;

    public void Clear()
    {
        _array = new T[_array.Length];
        _head = 0;
        _tail = 0;
        _size = 0;
        _version++;
    }

    public void Enqueue(T item)
    {
        if (_size == _array.Length)
        {
            int newCapacity = 2 * _array.Length;
            if (newCapacity < _array.Length + 4)
                newCapacity = _array.Length + 4;
            SetCapacity(newCapacity);
        }
        _array[_tail] = item;
        _tail = (_tail + 1) % _array.Length;
        _size++;
        _version++;
    }

    public T Dequeue()
    {
        if (_size == 0)
            throw new InvalidOperationException("Queue empty.");
        T removed = _array[_head];
        _array[_head] = default(T);
        _head = (_head + 1) % _array.Length;
        _size--;
        _version++;
        return removed;
    }

    public bool TryDequeue(out T result)
    {
        if (_size == 0)
        {
            result = default(T);
            return false;
        }
        result = Dequeue();
        return true;
    }

    public T Peek()
    {
        if (_size == 0)
            throw new InvalidOperationException("Queue empty.");
        return _array[_head];
    }

    public bool TryPeek(out T result)
    {
        if (_size == 0)
        {
            result = default(T);
            return false;
        }
        result = _array[_head];
        return true;
    }

    public bool Contains(T item)
    {
        var comparer = EqualityComparer<T>.Default;
        for (int i = 0; i < _size; i++)
            if (comparer.Equals(_array[(_head + i) % _array.Length], item))
                return true;
        return false;
    }

    public T[] ToArray()
    {
        T[] result = new T[_size];
        for (int i = 0; i < _size; i++)
            result[i] = _array[(_head + i) % _array.Length];
        return result;
    }

    public void CopyTo(T[] array, int arrayIndex)
    {
        for (int i = 0; i < _size; i++)
            array[arrayIndex + i] = _array[(_head + i) % _array.Length];
    }

    private void SetCapacity(int capacity)
    {
        T[] newArray = new T[capacity];
        for (int i = 0; i < _size; i++)
            newArray[i] = _array[(_head + i) % _array.Length];
        _array = newArray;
        _head = 0;
        _tail = _size == capacity ? 0 : _size;
    }

    public void TrimExcess() { }
    public int EnsureCapacity(int capacity)
    {
        if (_array.Length < capacity)
            SetCapacity(capacity);
        return _array.Length;
    }

    public IEnumerator<T> GetEnumerator()
    {
        int version = _version;
        for (int i = 0; i < _size; i++)
        {
            if (version != _version)
                throw new InvalidOperationException("Collection was modified; enumeration operation may not execute.");
            yield return _array[(_head + i) % _array.Length];
        }
    }
    System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => GetEnumerator();
}

public class Stack<T> : IReadOnlyCollection<T>, System.Collections.ICollection
{
    private T[] _array;
    private int _size;
    private int _version;

    public Stack() { _array = new T[0]; }
    public Stack(int capacity)
    {
        if (capacity < 0)
            throw new ArgumentOutOfRangeException("capacity", "Non-negative number required.");
        _array = new T[capacity];
    }
    public Stack(IEnumerable<T> collection)
    {
        if (collection == null)
            throw new ArgumentNullException("collection");
        _array = new T[0];
        foreach (T item in collection)
            Push(item);
    }

    public int Count => _size;

    public void Clear()
    {
        Array.Clear(_array, 0, _size);
        _size = 0;
        _version++;
    }

    public bool Contains(T item) => _size != 0 && Array.LastIndexOf(_array, item, _size - 1) != -1;

    public T Peek()
    {
        if (_size == 0)
            throw new InvalidOperationException("Stack empty.");
        return _array[_size - 1];
    }

    public bool TryPeek(out T result)
    {
        if (_size == 0)
        {
            result = default(T);
            return false;
        }
        result = _array[_size - 1];
        return true;
    }

    public T Pop()
    {
        if (_size == 0)
            throw new InvalidOperationException("Stack empty.");
        _version++;
        T item = _array[--_size];
        _array[_size] = default(T);
        return item;
    }

    public bool TryPop(out T result)
    {
        if (_size == 0)
        {
            result = default(T);
            return false;
        }
        result = Pop();
        return true;
    }

    public void Push(T item)
    {
        if (_size == _array.Length)
        {
            T[] newArray = new T[_array.Length == 0 ? 4 : 2 * _array.Length];
            Array.Copy(_array, newArray, _size);
            _array = newArray;
        }
        _array[_size++] = item;
        _version++;
    }

    public T[] ToArray()
    {
        T[] result = new T[_size];
        for (int i = 0; i < _size; i++)
            result[i] = _array[_size - 1 - i];
        return result;
    }

    public void CopyTo(T[] array, int arrayIndex)
    {
        for (int i = 0; i < _size; i++)
            array[arrayIndex + i] = _array[_size - 1 - i];
    }

    public void TrimExcess() { }

    public IEnumerator<T> GetEnumerator()
    {
        int version = _version;
        for (int i = _size - 1; i >= 0; i--)
        {
            if (version != _version)
                throw new InvalidOperationException("Collection was modified; enumeration operation may not execute.");
            yield return _array[i];
        }
    }
    System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => GetEnumerator();
}

public sealed class LinkedListNode<T>
{
    internal LinkedList<T> list;
    internal LinkedListNode<T> next;
    internal LinkedListNode<T> prev;
    internal T item;
    public LinkedListNode(T value) { item = value; }
    internal LinkedListNode(LinkedList<T> list, T value)
    {
        this.list = list;
        item = value;
    }
    public LinkedList<T> List => list;
    public LinkedListNode<T> Next => next == null || next == list.head ? null : next;
    public LinkedListNode<T> Previous => prev == null || this == list.head ? null : prev;
    public T Value { get => item; set => item = value; }
    public ref T ValueRef => ref item;
}

// A circular list of nodes, as in .NET.
public class LinkedList<T> : ICollection<T>, IReadOnlyCollection<T>
{
    internal LinkedListNode<T> head;
    internal int count;
    internal int version;

    public LinkedList() { }
    public LinkedList(IEnumerable<T> collection)
    {
        if (collection == null)
            throw new ArgumentNullException("collection");
        foreach (T item in collection)
            AddLast(item);
    }

    public int Count => count;
    public LinkedListNode<T> First => head;
    public LinkedListNode<T> Last => head == null ? null : head.prev;
    public bool IsReadOnly => false;

    void ICollection<T>.Add(T value) => AddLast(value);

    public LinkedListNode<T> AddAfter(LinkedListNode<T> node, T value)
    {
        ValidateNode(node);
        var result = new LinkedListNode<T>(node.list, value);
        InsertNodeBefore(node.next, result);
        return result;
    }

    public void AddAfter(LinkedListNode<T> node, LinkedListNode<T> newNode)
    {
        ValidateNode(node);
        ValidateNewNode(newNode);
        InsertNodeBefore(node.next, newNode);
        newNode.list = this;
    }

    public LinkedListNode<T> AddBefore(LinkedListNode<T> node, T value)
    {
        ValidateNode(node);
        var result = new LinkedListNode<T>(node.list, value);
        InsertNodeBefore(node, result);
        if (node == head)
            head = result;
        return result;
    }

    public void AddBefore(LinkedListNode<T> node, LinkedListNode<T> newNode)
    {
        ValidateNode(node);
        ValidateNewNode(newNode);
        InsertNodeBefore(node, newNode);
        newNode.list = this;
        if (node == head)
            head = newNode;
    }

    public LinkedListNode<T> AddFirst(T value)
    {
        var result = new LinkedListNode<T>(this, value);
        if (head == null)
        {
            InsertNodeToEmptyList(result);
        }
        else
        {
            InsertNodeBefore(head, result);
            head = result;
        }
        return result;
    }

    public void AddFirst(LinkedListNode<T> node)
    {
        ValidateNewNode(node);
        if (head == null)
        {
            InsertNodeToEmptyList(node);
        }
        else
        {
            InsertNodeBefore(head, node);
            head = node;
        }
        node.list = this;
    }

    public LinkedListNode<T> AddLast(T value)
    {
        var result = new LinkedListNode<T>(this, value);
        if (head == null)
            InsertNodeToEmptyList(result);
        else
            InsertNodeBefore(head, result);
        return result;
    }

    public void AddLast(LinkedListNode<T> node)
    {
        ValidateNewNode(node);
        if (head == null)
            InsertNodeToEmptyList(node);
        else
            InsertNodeBefore(head, node);
        node.list = this;
    }

    public void Clear()
    {
        LinkedListNode<T> current = head;
        while (current != null)
        {
            LinkedListNode<T> temp = current;
            current = current.Next;
            temp.list = null;
            temp.next = null;
            temp.prev = null;
        }
        head = null;
        count = 0;
        version++;
    }

    public bool Contains(T value) => Find(value) != null;

    public void CopyTo(T[] array, int index)
    {
        LinkedListNode<T> node = head;
        if (node != null)
        {
            do
            {
                array[index++] = node.item;
                node = node.next;
            } while (node != head);
        }
    }

    public LinkedListNode<T> Find(T value)
    {
        LinkedListNode<T> node = head;
        var comparer = EqualityComparer<T>.Default;
        if (node != null)
        {
            do
            {
                if (comparer.Equals(node.item, value))
                    return node;
                node = node.next;
            } while (node != head);
        }
        return null;
    }

    public LinkedListNode<T> FindLast(T value)
    {
        if (head == null)
            return null;
        LinkedListNode<T> last = head.prev;
        LinkedListNode<T> node = last;
        var comparer = EqualityComparer<T>.Default;
        do
        {
            if (comparer.Equals(node.item, value))
                return node;
            node = node.prev;
        } while (node != last);
        return null;
    }

    public bool Remove(T value)
    {
        LinkedListNode<T> node = Find(value);
        if (node != null)
        {
            InternalRemoveNode(node);
            return true;
        }
        return false;
    }

    public void Remove(LinkedListNode<T> node)
    {
        ValidateNode(node);
        InternalRemoveNode(node);
    }

    public void RemoveFirst()
    {
        if (head == null)
            throw new InvalidOperationException("The LinkedList is empty.");
        InternalRemoveNode(head);
    }

    public void RemoveLast()
    {
        if (head == null)
            throw new InvalidOperationException("The LinkedList is empty.");
        InternalRemoveNode(head.prev);
    }

    private void InsertNodeBefore(LinkedListNode<T> node, LinkedListNode<T> newNode)
    {
        newNode.next = node;
        newNode.prev = node.prev;
        node.prev.next = newNode;
        node.prev = newNode;
        version++;
        count++;
    }

    private void InsertNodeToEmptyList(LinkedListNode<T> newNode)
    {
        newNode.next = newNode;
        newNode.prev = newNode;
        head = newNode;
        version++;
        count++;
    }

    internal void InternalRemoveNode(LinkedListNode<T> node)
    {
        if (node.next == node)
        {
            head = null;
        }
        else
        {
            node.next.prev = node.prev;
            node.prev.next = node.next;
            if (head == node)
                head = node.next;
        }
        node.list = null;
        node.next = null;
        node.prev = null;
        count--;
        version++;
    }

    private void ValidateNewNode(LinkedListNode<T> node)
    {
        if (node == null)
            throw new ArgumentNullException("node");
        if (node.list != null)
            throw new InvalidOperationException("The LinkedList node already belongs to a LinkedList.");
    }

    private void ValidateNode(LinkedListNode<T> node)
    {
        if (node == null)
            throw new ArgumentNullException("node");
        if (node.list != this)
            throw new InvalidOperationException("The LinkedList node does not belong to current LinkedList.");
    }

    public IEnumerator<T> GetEnumerator()
    {
        int startVersion = version;
        LinkedListNode<T> node = head;
        if (node == null)
            yield break;
        do
        {
            if (startVersion != version)
                throw new InvalidOperationException("Collection was modified; enumeration operation may not execute.");
            yield return node.item;
            node = node.next;
        } while (node != head && node != null);
    }
    System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => GetEnumerator();
}

// The priority queue of .NET: a quaternary min-heap (equal priorities
// leave in the order the heap gives).
public class PriorityQueue<TElement, TPriority>
{
    private (TElement Element, TPriority Priority)[] _nodes;
    private readonly IComparer<TPriority> _comparer;
    private int _size;
    private int _version;
    private const int Arity = 4;
    private const int Log2Arity = 2;

    public PriorityQueue() : this(0, null) { }
    public PriorityQueue(int initialCapacity) : this(initialCapacity, null) { }
    public PriorityQueue(IComparer<TPriority> comparer) : this(0, comparer) { }
    public PriorityQueue(int initialCapacity, IComparer<TPriority> comparer)
    {
        _nodes = new (TElement, TPriority)[initialCapacity];
        _comparer = comparer ?? Comparer<TPriority>.Default;
    }
    public PriorityQueue(IEnumerable<(TElement Element, TPriority Priority)> items) : this(items, null) { }
    public PriorityQueue(IEnumerable<(TElement Element, TPriority Priority)> items, IComparer<TPriority> comparer) : this(0, comparer)
    {
        foreach (var item in items)
            AppendNode(item.Element, item.Priority);
        if (_size > 1)
            Heapify();
    }

    public int Count => _size;
    public IComparer<TPriority> Comparer => _comparer;

    public void Enqueue(TElement element, TPriority priority)
    {
        int currentSize = _size;
        _version++;
        if (_nodes.Length == currentSize)
            Grow(currentSize + 1);
        _size = currentSize + 1;
        MoveUp((element, priority), currentSize);
    }

    public TElement Peek()
    {
        if (_size == 0)
            throw new InvalidOperationException("Queue empty.");
        return _nodes[0].Element;
    }

    public TElement Dequeue()
    {
        if (_size == 0)
            throw new InvalidOperationException("Queue empty.");
        TElement element = _nodes[0].Element;
        RemoveRootNode();
        return element;
    }

    public TElement DequeueEnqueue(TElement element, TPriority priority)
    {
        if (_size == 0)
            throw new InvalidOperationException("Queue empty.");
        TElement result = _nodes[0].Element;
        if (_comparer.Compare(priority, _nodes[0].Priority) > 0)
            MoveDown((element, priority), 0);
        else
            _nodes[0] = (element, priority);
        _version++;
        return result;
    }

    public bool TryDequeue(out TElement element, out TPriority priority)
    {
        if (_size != 0)
        {
            (element, priority) = _nodes[0];
            RemoveRootNode();
            return true;
        }
        element = default(TElement);
        priority = default(TPriority);
        return false;
    }

    public bool TryPeek(out TElement element, out TPriority priority)
    {
        if (_size != 0)
        {
            (element, priority) = _nodes[0];
            return true;
        }
        element = default(TElement);
        priority = default(TPriority);
        return false;
    }

    public TElement EnqueueDequeue(TElement element, TPriority priority)
    {
        if (_size != 0)
        {
            var root = _nodes[0];
            if (_comparer.Compare(priority, root.Priority) > 0)
            {
                MoveDown((element, priority), 0);
                _version++;
                return root.Element;
            }
        }
        return element;
    }

    public void EnqueueRange(IEnumerable<(TElement Element, TPriority Priority)> items)
    {
        foreach (var item in items)
            Enqueue(item.Element, item.Priority);
    }

    public void EnqueueRange(IEnumerable<TElement> elements, TPriority priority)
    {
        foreach (var element in elements)
            Enqueue(element, priority);
    }

    public void Clear()
    {
        _nodes = new (TElement, TPriority)[_nodes.Length];
        _size = 0;
        _version++;
    }

    public int EnsureCapacity(int capacity)
    {
        if (_nodes.Length < capacity)
            Grow(capacity);
        return _nodes.Length;
    }

    public void TrimExcess() { }

    private void Grow(int minCapacity)
    {
        int newCapacity = 2 * _nodes.Length;
        if (newCapacity < _nodes.Length + 4)
            newCapacity = _nodes.Length + 4;
        if (newCapacity < minCapacity)
            newCapacity = minCapacity;
        var nodes = new (TElement, TPriority)[newCapacity];
        Array.Copy(_nodes, nodes, _size);
        _nodes = nodes;
    }

    private void AppendNode(TElement element, TPriority priority)
    {
        if (_nodes.Length == _size)
            Grow(_size + 1);
        _nodes[_size++] = (element, priority);
    }

    private void RemoveRootNode()
    {
        int lastNodeIndex = --_size;
        _version++;
        if (lastNodeIndex > 0)
        {
            var lastNode = _nodes[lastNodeIndex];
            MoveDown(lastNode, 0);
        }
        _nodes[lastNodeIndex] = default((TElement, TPriority));
    }

    private static int GetParentIndex(int index) => (index - 1) >> Log2Arity;
    private static int GetFirstChildIndex(int index) => (index << Log2Arity) + 1;

    private void Heapify()
    {
        int lastParentWithChildren = GetParentIndex(_size - 1);
        for (int index = lastParentWithChildren; index >= 0; --index)
            MoveDown(_nodes[index], index);
    }

    private void MoveUp((TElement Element, TPriority Priority) node, int nodeIndex)
    {
        var nodes = _nodes;
        while (nodeIndex > 0)
        {
            int parentIndex = GetParentIndex(nodeIndex);
            var parent = nodes[parentIndex];
            if (_comparer.Compare(node.Priority, parent.Priority) < 0)
            {
                nodes[nodeIndex] = parent;
                nodeIndex = parentIndex;
            }
            else
            {
                break;
            }
        }
        nodes[nodeIndex] = node;
    }

    private void MoveDown((TElement Element, TPriority Priority) node, int nodeIndex)
    {
        var nodes = _nodes;
        int size = _size;
        int i;
        while ((i = GetFirstChildIndex(nodeIndex)) < size)
        {
            var minChild = nodes[i];
            int minChildIndex = i;
            int childIndexUpperBound = Math.Min(i + Arity, size);
            while (++i < childIndexUpperBound)
            {
                var nextChild = nodes[i];
                if (_comparer.Compare(nextChild.Priority, minChild.Priority) < 0)
                {
                    minChild = nextChild;
                    minChildIndex = i;
                }
            }
            if (_comparer.Compare(node.Priority, minChild.Priority) <= 0)
                break;
            nodes[nodeIndex] = minChild;
            nodeIndex = minChildIndex;
        }
        nodes[nodeIndex] = node;
    }

    public UnorderedItemsCollection UnorderedItems => new UnorderedItemsCollection(this);

    public sealed class UnorderedItemsCollection : IReadOnlyCollection<(TElement Element, TPriority Priority)>
    {
        private readonly PriorityQueue<TElement, TPriority> _queue;
        internal UnorderedItemsCollection(PriorityQueue<TElement, TPriority> queue) { _queue = queue; }
        public int Count => _queue._size;
        public IEnumerator<(TElement Element, TPriority Priority)> GetEnumerator()
        {
            for (int i = 0; i < _queue._size; i++)
                yield return _queue._nodes[i];
        }
        System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => GetEnumerator();
    }
}
`);

    CS.addLibrary('collections.objectmodel', String.raw`
namespace System.Collections.ObjectModel;

using System.Collections.Generic;

public class ReadOnlyCollection<T> : IList<T>, IReadOnlyList<T>
{
    private readonly IList<T> list;
    public ReadOnlyCollection(IList<T> list)
    {
        if (list == null)
            throw new ArgumentNullException("list");
        this.list = list;
    }
    public int Count => list.Count;
    public T this[int index] => list[index];
    T IList<T>.this[int index] { get => list[index]; set => throw new NotSupportedException("Collection is read-only."); }
    public bool IsReadOnly => true;
    public bool Contains(T value) => list.Contains(value);
    public void CopyTo(T[] array, int index) => list.CopyTo(array, index);
    public int IndexOf(T value) => list.IndexOf(value);
    void ICollection<T>.Add(T value) => throw new NotSupportedException("Collection is read-only.");
    void ICollection<T>.Clear() => throw new NotSupportedException("Collection is read-only.");
    bool ICollection<T>.Remove(T value) => throw new NotSupportedException("Collection is read-only.");
    void IList<T>.Insert(int index, T value) => throw new NotSupportedException("Collection is read-only.");
    void IList<T>.RemoveAt(int index) => throw new NotSupportedException("Collection is read-only.");
    public IEnumerator<T> GetEnumerator() => list.GetEnumerator();
    System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => list.GetEnumerator();
}

public class Collection<T> : IList<T>, IReadOnlyList<T>
{
    private readonly IList<T> items;
    public Collection() { items = new List<T>(); }
    public Collection(IList<T> list) { items = list; }
    public int Count => items.Count;
    public T this[int index] { get => items[index]; set => SetItem(index, value); }
    public bool IsReadOnly => false;
    protected IList<T> Items => items;
    public void Add(T item) => InsertItem(items.Count, item);
    public void Clear() => ClearItems();
    public bool Contains(T item) => items.Contains(item);
    public void CopyTo(T[] array, int index) => items.CopyTo(array, index);
    public int IndexOf(T item) => items.IndexOf(item);
    public void Insert(int index, T item) => InsertItem(index, item);
    public bool Remove(T item)
    {
        int index = items.IndexOf(item);
        if (index < 0)
            return false;
        RemoveItem(index);
        return true;
    }
    public void RemoveAt(int index) => RemoveItem(index);
    protected virtual void ClearItems() => items.Clear();
    protected virtual void InsertItem(int index, T item) => items.Insert(index, item);
    protected virtual void RemoveItem(int index) => items.RemoveAt(index);
    protected virtual void SetItem(int index, T item) => items[index] = item;
    public IEnumerator<T> GetEnumerator() => items.GetEnumerator();
    System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => items.GetEnumerator();
}

public class ReadOnlyDictionary<TKey, TValue> : IReadOnlyDictionary<TKey, TValue>
{
    private readonly IDictionary<TKey, TValue> _dictionary;
    public ReadOnlyDictionary(IDictionary<TKey, TValue> dictionary) { _dictionary = dictionary; }
    public int Count => _dictionary.Count;
    public TValue this[TKey key] => _dictionary[key];
    public IEnumerable<TKey> Keys => _dictionary.Keys;
    public IEnumerable<TValue> Values => _dictionary.Values;
    public bool ContainsKey(TKey key) => _dictionary.ContainsKey(key);
    public bool TryGetValue(TKey key, out TValue value) => _dictionary.TryGetValue(key, out value);
    public IEnumerator<KeyValuePair<TKey, TValue>> GetEnumerator() => _dictionary.GetEnumerator();
    System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => _dictionary.GetEnumerator();
}
`);
})(globalThis);
