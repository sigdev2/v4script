// C#: the sorted collections of System.Collections.Generic - SortedSet
// and SortedDictionary over a balanced tree (AVL; .NET has a red-black
// tree, the order of the items is the same), SortedList over sorted
// arrays.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    if (CS.library.units['collections.sorted/SortedSet`1'])
        return;

    CS.addLibrary('collections.sorted', String.raw`
using System.Collections;
namespace System.Collections.Generic;

internal sealed class TreeNode<TKey, TValue>
{
    public TKey Key;
    public TValue Value;
    public TreeNode<TKey, TValue> Left;
    public TreeNode<TKey, TValue> Right;
    public int Height = 1;
    public TreeNode(TKey key, TValue value)
    {
        Key = key;
        Value = value;
    }
}

// An AVL tree of keys with values; the keys are unique by the comparer.
internal sealed class SortedTree<TKey, TValue>
{
    internal TreeNode<TKey, TValue> _root;
    internal int _count;
    internal int _version;
    internal readonly IComparer<TKey> _comparer;
    public SortedTree(IComparer<TKey> comparer) { _comparer = comparer ?? Comparer<TKey>.Default; }
    public int Count => _count;
    private static int Height(TreeNode<TKey, TValue> node) => node == null ? 0 : node.Height;
    private static void Update(TreeNode<TKey, TValue> node)
    {
        int left = Height(node.Left), right = Height(node.Right);
        node.Height = (left > right ? left : right) + 1;
    }
    private static TreeNode<TKey, TValue> RotateRight(TreeNode<TKey, TValue> node)
    {
        var left = node.Left;
        node.Left = left.Right;
        left.Right = node;
        Update(node);
        Update(left);
        return left;
    }
    private static TreeNode<TKey, TValue> RotateLeft(TreeNode<TKey, TValue> node)
    {
        var right = node.Right;
        node.Right = right.Left;
        right.Left = node;
        Update(node);
        Update(right);
        return right;
    }
    private static TreeNode<TKey, TValue> Balance(TreeNode<TKey, TValue> node)
    {
        Update(node);
        int balance = Height(node.Left) - Height(node.Right);
        if (balance > 1)
        {
            if (Height(node.Left.Left) < Height(node.Left.Right))
                node.Left = RotateLeft(node.Left);
            return RotateRight(node);
        }
        if (balance < -1)
        {
            if (Height(node.Right.Right) < Height(node.Right.Left))
                node.Right = RotateRight(node.Right);
            return RotateLeft(node);
        }
        return node;
    }
    public TreeNode<TKey, TValue> Find(TKey key)
    {
        var node = _root;
        while (node != null)
        {
            int order = _comparer.Compare(key, node.Key);
            if (order == 0)
                return node;
            node = order < 0 ? node.Left : node.Right;
        }
        return null;
    }
    // Adds a key; false (and nothing changes) if it is there.
    public bool Add(TKey key, TValue value, bool overwrite)
    {
        bool added = false;
        _root = Insert(_root, key, value, overwrite, ref added);
        if (added)
        {
            _count++;
            _version++;
        }
        return added;
    }
    private TreeNode<TKey, TValue> Insert(TreeNode<TKey, TValue> node, TKey key, TValue value, bool overwrite, ref bool added)
    {
        if (node == null)
        {
            added = true;
            return new TreeNode<TKey, TValue>(key, value);
        }
        int order = _comparer.Compare(key, node.Key);
        if (order == 0)
        {
            if (overwrite)
            {
                node.Value = value;
                _version++;
            }
            return node;
        }
        if (order < 0)
            node.Left = Insert(node.Left, key, value, overwrite, ref added);
        else
            node.Right = Insert(node.Right, key, value, overwrite, ref added);
        return added ? Balance(node) : node;
    }
    public bool Remove(TKey key)
    {
        bool removed = false;
        _root = Delete(_root, key, ref removed);
        if (removed)
        {
            _count--;
            _version++;
        }
        return removed;
    }
    private TreeNode<TKey, TValue> Delete(TreeNode<TKey, TValue> node, TKey key, ref bool removed)
    {
        if (node == null)
            return null;
        int order = _comparer.Compare(key, node.Key);
        if (order < 0)
        {
            node.Left = Delete(node.Left, key, ref removed);
        }
        else if (order > 0)
        {
            node.Right = Delete(node.Right, key, ref removed);
        }
        else
        {
            removed = true;
            if (node.Left == null)
                return node.Right;
            if (node.Right == null)
                return node.Left;
            var successor = node.Right;
            while (successor.Left != null)
                successor = successor.Left;
            node.Key = successor.Key;
            node.Value = successor.Value;
            bool ignored = false;
            node.Right = Delete(node.Right, successor.Key, ref ignored);
        }
        return Balance(node);
    }
    public void Clear()
    {
        _root = null;
        _count = 0;
        _version++;
    }
    public TreeNode<TKey, TValue> First()
    {
        var node = _root;
        if (node == null)
            return null;
        while (node.Left != null)
            node = node.Left;
        return node;
    }
    public TreeNode<TKey, TValue> Last()
    {
        var node = _root;
        if (node == null)
            return null;
        while (node.Right != null)
            node = node.Right;
        return node;
    }
    // The nodes in order (or reversed); changes during the walk throw.
    public IEnumerable<TreeNode<TKey, TValue>> Nodes(bool reverse)
    {
        int version = _version;
        var stack = new Stack<TreeNode<TKey, TValue>>();
        var node = _root;
        while (node != null || stack.Count > 0)
        {
            while (node != null)
            {
                stack.Push(node);
                node = reverse ? node.Right : node.Left;
            }
            node = stack.Pop();
            yield return node;
            if (version != _version)
                throw new InvalidOperationException("Collection was modified; enumeration operation may not execute.");
            node = reverse ? node.Left : node.Right;
        }
    }
}

public class SortedSet<T> : ISet<T>, IReadOnlyCollection<T>, IReadOnlySet<T>, ICollection
{
    private SortedTree<T, bool> _tree;
    public SortedSet() : this((IComparer<T>)null) { }
    public SortedSet(IComparer<T> comparer) { _tree = new SortedTree<T, bool>(comparer); }
    public SortedSet(IEnumerable<T> collection) : this(collection, null) { }
    public SortedSet(IEnumerable<T> collection, IComparer<T> comparer) : this(comparer)
    {
        if (collection == null)
            throw new ArgumentNullException("collection");
        foreach (T item in collection)
            Add(item);
    }
    public int Count => _tree.Count;
    public IComparer<T> Comparer => _tree._comparer;
    public bool IsReadOnly => false;
    bool ICollection.IsSynchronized => false;
    object ICollection.SyncRoot => this;
    public T Min => _tree.Count == 0 ? default(T) : _tree.First().Key;
    public T Max => _tree.Count == 0 ? default(T) : _tree.Last().Key;
    public bool Add(T item) => _tree.Add(item, true, false);
    void ICollection<T>.Add(T item) => Add(item);
    public bool Remove(T item) => _tree.Remove(item);
    public bool Contains(T item) => _tree.Find(item) != null;
    public void Clear() => _tree.Clear();
    public bool TryGetValue(T equalValue, out T actualValue)
    {
        var node = _tree.Find(equalValue);
        actualValue = node == null ? default(T) : node.Key;
        return node != null;
    }
    public int RemoveWhere(Predicate<T> match)
    {
        if (match == null)
            throw new ArgumentNullException("match");
        var matches = new List<T>();
        foreach (T item in this)
            if (match(item))
                matches.Add(item);
        foreach (T item in matches)
            Remove(item);
        return matches.Count;
    }
    public IEnumerable<T> Reverse()
    {
        foreach (var node in _tree.Nodes(true))
            yield return node.Key;
    }
    public SortedSet<T> GetViewBetween(T lowerValue, T upperValue)
    {
        if (Comparer.Compare(lowerValue, upperValue) > 0)
            throw new ArgumentException("Must be less than or equal to upperValue.", "lowerValue");
        var view = new SortedSet<T>(Comparer);
        foreach (T item in this)
            if (Comparer.Compare(item, lowerValue) >= 0 && Comparer.Compare(item, upperValue) <= 0)
                view.Add(item);
        return view;
    }
    public void CopyTo(T[] array) => CopyTo(array, 0, Count);
    public void CopyTo(T[] array, int arrayIndex) => CopyTo(array, arrayIndex, Count);
    public void CopyTo(T[] array, int index, int count)
    {
        if (array == null)
            throw new ArgumentNullException("array");
        if (index < 0)
            throw new ArgumentOutOfRangeException("index", index, "Non-negative number required.");
        if (index > array.Length || count > array.Length - index)
            throw new ArgumentException("Destination array is not long enough to copy all the items in the collection. Check array index and length.");
        foreach (T item in this)
        {
            if (count-- <= 0)
                break;
            array[index++] = item;
        }
    }
    void ICollection.CopyTo(Array array, int index)
    {
        foreach (T item in this)
            array.SetValue(item, index++);
    }
    public void UnionWith(IEnumerable<T> other)
    {
        if (other == null)
            throw new ArgumentNullException("other");
        foreach (T item in other)
            Add(item);
    }
    public void IntersectWith(IEnumerable<T> other)
    {
        if (other == null)
            throw new ArgumentNullException("other");
        var keep = new SortedSet<T>(Comparer);
        foreach (T item in other)
            if (Contains(item))
                keep.Add(item);
        _tree = keep._tree;
    }
    public void ExceptWith(IEnumerable<T> other)
    {
        if (other == null)
            throw new ArgumentNullException("other");
        foreach (T item in other)
            Remove(item);
    }
    public void SymmetricExceptWith(IEnumerable<T> other)
    {
        if (other == null)
            throw new ArgumentNullException("other");
        foreach (T item in new SortedSet<T>(other, Comparer))
            if (!Remove(item))
                Add(item);
    }
    public bool IsSubsetOf(IEnumerable<T> other)
    {
        var set = new SortedSet<T>(other, Comparer);
        foreach (T item in this)
            if (!set.Contains(item))
                return false;
        return true;
    }
    public bool IsProperSubsetOf(IEnumerable<T> other)
    {
        var set = new SortedSet<T>(other, Comparer);
        return set.Count > Count && IsSubsetOf(set);
    }
    public bool IsSupersetOf(IEnumerable<T> other)
    {
        if (other == null)
            throw new ArgumentNullException("other");
        foreach (T item in other)
            if (!Contains(item))
                return false;
        return true;
    }
    public bool IsProperSupersetOf(IEnumerable<T> other)
    {
        var set = new SortedSet<T>(other, Comparer);
        return Count > set.Count && IsSupersetOf(set);
    }
    public bool Overlaps(IEnumerable<T> other)
    {
        if (other == null)
            throw new ArgumentNullException("other");
        foreach (T item in other)
            if (Contains(item))
                return true;
        return false;
    }
    public bool SetEquals(IEnumerable<T> other)
    {
        var set = new SortedSet<T>(other, Comparer);
        return set.Count == Count && IsSubsetOf(set);
    }
    public IEnumerator<T> GetEnumerator()
    {
        foreach (var node in _tree.Nodes(false))
            yield return node.Key;
    }
    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
}

public class SortedDictionary<TKey, TValue> : IDictionary<TKey, TValue>, IReadOnlyDictionary<TKey, TValue>
{
    private readonly SortedTree<TKey, TValue> _tree;
    public SortedDictionary() : this((IComparer<TKey>)null) { }
    public SortedDictionary(IComparer<TKey> comparer) { _tree = new SortedTree<TKey, TValue>(comparer); }
    public SortedDictionary(IDictionary<TKey, TValue> dictionary) : this(dictionary, null) { }
    public SortedDictionary(IDictionary<TKey, TValue> dictionary, IComparer<TKey> comparer) : this(comparer)
    {
        if (dictionary == null)
            throw new ArgumentNullException("dictionary");
        foreach (var pair in dictionary)
            Add(pair.Key, pair.Value);
    }
    public int Count => _tree.Count;
    public IComparer<TKey> Comparer => _tree._comparer;
    public bool IsReadOnly => false;
    private static void CheckKey(TKey key)
    {
        if (key == null)
            throw new ArgumentNullException("key");
    }
    public TValue this[TKey key]
    {
        get
        {
            CheckKey(key);
            var node = _tree.Find(key);
            if (node == null)
                throw new KeyNotFoundException("The given key '" + key + "' was not present in the dictionary.");
            return node.Value;
        }
        set
        {
            CheckKey(key);
            _tree.Add(key, value, true);
        }
    }
    public void Add(TKey key, TValue value)
    {
        CheckKey(key);
        if (!_tree.Add(key, value, false))
            throw new ArgumentException("An item with the same key has already been added. Key: " + key);
    }
    public bool TryAdd(TKey key, TValue value)
    {
        CheckKey(key);
        return _tree.Add(key, value, false);
    }
    public bool Remove(TKey key)
    {
        CheckKey(key);
        return _tree.Remove(key);
    }
    public bool Remove(TKey key, out TValue value)
    {
        CheckKey(key);
        var node = _tree.Find(key);
        value = node == null ? default(TValue) : node.Value;
        return node != null && _tree.Remove(key);
    }
    public bool ContainsKey(TKey key)
    {
        CheckKey(key);
        return _tree.Find(key) != null;
    }
    public bool ContainsValue(TValue value)
    {
        var comparer = EqualityComparer<TValue>.Default;
        foreach (var node in _tree.Nodes(false))
            if (comparer.Equals(node.Value, value))
                return true;
        return false;
    }
    public bool TryGetValue(TKey key, out TValue value)
    {
        CheckKey(key);
        var node = _tree.Find(key);
        value = node == null ? default(TValue) : node.Value;
        return node != null;
    }
    public void Clear() => _tree.Clear();
    public KeyCollection Keys => new KeyCollection(this);
    public ValueCollection Values => new ValueCollection(this);
    ICollection<TKey> IDictionary<TKey, TValue>.Keys => Keys;
    ICollection<TValue> IDictionary<TKey, TValue>.Values => Values;
    IEnumerable<TKey> IReadOnlyDictionary<TKey, TValue>.Keys => Keys;
    IEnumerable<TValue> IReadOnlyDictionary<TKey, TValue>.Values => Values;
    void ICollection<KeyValuePair<TKey, TValue>>.Add(KeyValuePair<TKey, TValue> item) => Add(item.Key, item.Value);
    bool ICollection<KeyValuePair<TKey, TValue>>.Contains(KeyValuePair<TKey, TValue> item)
    {
        var node = _tree.Find(item.Key);
        return node != null && EqualityComparer<TValue>.Default.Equals(node.Value, item.Value);
    }
    bool ICollection<KeyValuePair<TKey, TValue>>.Remove(KeyValuePair<TKey, TValue> item)
    {
        var node = _tree.Find(item.Key);
        return node != null && EqualityComparer<TValue>.Default.Equals(node.Value, item.Value) && _tree.Remove(item.Key);
    }
    public void CopyTo(KeyValuePair<TKey, TValue>[] array, int index)
    {
        if (array == null)
            throw new ArgumentNullException("array");
        if (index < 0 || index > array.Length)
            throw new ArgumentOutOfRangeException("index", index, "Non-negative number required.");
        if (array.Length - index < Count)
            throw new ArgumentException("Destination array is not long enough to copy all the items in the collection. Check array index and length.");
        foreach (var pair in this)
            array[index++] = pair;
    }
    public IEnumerator<KeyValuePair<TKey, TValue>> GetEnumerator()
    {
        foreach (var node in _tree.Nodes(false))
            yield return new KeyValuePair<TKey, TValue>(node.Key, node.Value);
    }
    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
    internal IEnumerable<TreeNode<TKey, TValue>> Nodes() => _tree.Nodes(false);

    public sealed class KeyCollection : ICollection<TKey>, IReadOnlyCollection<TKey>
    {
        private readonly SortedDictionary<TKey, TValue> _dictionary;
        public KeyCollection(SortedDictionary<TKey, TValue> dictionary) { _dictionary = dictionary; }
        public int Count => _dictionary.Count;
        public bool IsReadOnly => true;
        public void Add(TKey item) => throw new NotSupportedException("Mutating a key collection derived from a dictionary is not allowed.");
        public void Clear() => throw new NotSupportedException("Mutating a key collection derived from a dictionary is not allowed.");
        public bool Remove(TKey item) => throw new NotSupportedException("Mutating a key collection derived from a dictionary is not allowed.");
        public bool Contains(TKey item) => _dictionary.ContainsKey(item);
        public void CopyTo(TKey[] array, int index)
        {
            foreach (var node in _dictionary.Nodes())
                array[index++] = node.Key;
        }
        public IEnumerator<TKey> GetEnumerator()
        {
            foreach (var node in _dictionary.Nodes())
                yield return node.Key;
        }
        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
    }

    public sealed class ValueCollection : ICollection<TValue>, IReadOnlyCollection<TValue>
    {
        private readonly SortedDictionary<TKey, TValue> _dictionary;
        public ValueCollection(SortedDictionary<TKey, TValue> dictionary) { _dictionary = dictionary; }
        public int Count => _dictionary.Count;
        public bool IsReadOnly => true;
        public void Add(TValue item) => throw new NotSupportedException("Mutating a value collection derived from a dictionary is not allowed.");
        public void Clear() => throw new NotSupportedException("Mutating a value collection derived from a dictionary is not allowed.");
        public bool Remove(TValue item) => throw new NotSupportedException("Mutating a value collection derived from a dictionary is not allowed.");
        public bool Contains(TValue item) => _dictionary.ContainsValue(item);
        public void CopyTo(TValue[] array, int index)
        {
            foreach (var node in _dictionary.Nodes())
                array[index++] = node.Value;
        }
        public IEnumerator<TValue> GetEnumerator()
        {
            foreach (var node in _dictionary.Nodes())
                yield return node.Value;
        }
        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
    }
}

public class SortedList<TKey, TValue> : IDictionary<TKey, TValue>, IReadOnlyDictionary<TKey, TValue>
{
    private TKey[] _keys;
    private TValue[] _values;
    private int _size;
    private int _version;
    private readonly IComparer<TKey> _comparer;
    public SortedList() : this(0, null) { }
    public SortedList(int capacity) : this(capacity, null) { }
    public SortedList(IComparer<TKey> comparer) : this(0, comparer) { }
    public SortedList(int capacity, IComparer<TKey> comparer)
    {
        if (capacity < 0)
            throw new ArgumentOutOfRangeException("capacity", capacity, "Non-negative number required.");
        _keys = new TKey[capacity];
        _values = new TValue[capacity];
        _comparer = comparer ?? Comparer<TKey>.Default;
    }
    public SortedList(IDictionary<TKey, TValue> dictionary) : this(dictionary, null) { }
    public SortedList(IDictionary<TKey, TValue> dictionary, IComparer<TKey> comparer) : this(dictionary == null ? 0 : dictionary.Count, comparer)
    {
        if (dictionary == null)
            throw new ArgumentNullException("dictionary");
        foreach (var pair in dictionary)
            Add(pair.Key, pair.Value);
    }
    public int Count => _size;
    public IComparer<TKey> Comparer => _comparer;
    public bool IsReadOnly => false;
    public int Capacity
    {
        get => _keys.Length;
        set
        {
            if (value < _size)
                throw new ArgumentOutOfRangeException("value", value, "capacity was less than the current size.");
            if (value != _keys.Length)
            {
                var keys = new TKey[value];
                var values = new TValue[value];
                Array.Copy(_keys, keys, _size);
                Array.Copy(_values, values, _size);
                _keys = keys;
                _values = values;
            }
        }
    }
    private static void CheckKey(TKey key)
    {
        if (key == null)
            throw new ArgumentNullException("key");
    }
    public int IndexOfKey(TKey key)
    {
        CheckKey(key);
        int lo = 0, hi = _size - 1;
        while (lo <= hi)
        {
            int middle = lo + ((hi - lo) >> 1);
            int order = _comparer.Compare(_keys[middle], key);
            if (order == 0)
                return middle;
            if (order < 0)
                lo = middle + 1;
            else
                hi = middle - 1;
        }
        return ~lo;
    }
    public int IndexOfValue(TValue value) => Array.IndexOf(_values, value, 0, _size);
    private void Insert(int index, TKey key, TValue value)
    {
        if (_size == _keys.Length)
            Capacity = _keys.Length == 0 ? 4 : _keys.Length * 2;
        if (index < _size)
        {
            Array.Copy(_keys, index, _keys, index + 1, _size - index);
            Array.Copy(_values, index, _values, index + 1, _size - index);
        }
        _keys[index] = key;
        _values[index] = value;
        _size++;
        _version++;
    }
    public void Add(TKey key, TValue value)
    {
        int index = IndexOfKey(key);
        if (index >= 0)
            throw new ArgumentException("An item with the same key has already been added. Key: " + key);
        Insert(~index, key, value);
    }
    public bool TryAdd(TKey key, TValue value)
    {
        int index = IndexOfKey(key);
        if (index >= 0)
            return false;
        Insert(~index, key, value);
        return true;
    }
    public TValue this[TKey key]
    {
        get
        {
            int index = IndexOfKey(key);
            if (index < 0)
                throw new KeyNotFoundException("The given key '" + key + "' was not present in the dictionary.");
            return _values[index];
        }
        set
        {
            int index = IndexOfKey(key);
            if (index >= 0)
            {
                _values[index] = value;
                _version++;
            }
            else
            {
                Insert(~index, key, value);
            }
        }
    }
    public TKey GetKeyAtIndex(int index)
    {
        if (index < 0 || index >= _size)
            throw new ArgumentOutOfRangeException("index", index, "Index was out of range. Must be non-negative and less than the size of the collection.");
        return _keys[index];
    }
    public TValue GetValueAtIndex(int index)
    {
        if (index < 0 || index >= _size)
            throw new ArgumentOutOfRangeException("index", index, "Index was out of range. Must be non-negative and less than the size of the collection.");
        return _values[index];
    }
    public void SetValueAtIndex(int index, TValue value)
    {
        if (index < 0 || index >= _size)
            throw new ArgumentOutOfRangeException("index", index, "Index was out of range. Must be non-negative and less than the size of the collection.");
        _values[index] = value;
        _version++;
    }
    public bool ContainsKey(TKey key) => IndexOfKey(key) >= 0;
    public bool ContainsValue(TValue value) => IndexOfValue(value) >= 0;
    public bool TryGetValue(TKey key, out TValue value)
    {
        int index = IndexOfKey(key);
        value = index >= 0 ? _values[index] : default(TValue);
        return index >= 0;
    }
    public void RemoveAt(int index)
    {
        if (index < 0 || index >= _size)
            throw new ArgumentOutOfRangeException("index", index, "Index was out of range. Must be non-negative and less than the size of the collection.");
        _size--;
        if (index < _size)
        {
            Array.Copy(_keys, index + 1, _keys, index, _size - index);
            Array.Copy(_values, index + 1, _values, index, _size - index);
        }
        _keys[_size] = default(TKey);
        _values[_size] = default(TValue);
        _version++;
    }
    public bool Remove(TKey key)
    {
        int index = IndexOfKey(key);
        if (index >= 0)
            RemoveAt(index);
        return index >= 0;
    }
    public void Clear()
    {
        _version++;
        Array.Clear(_keys, 0, _size);
        Array.Clear(_values, 0, _size);
        _size = 0;
    }
    public void TrimExcess() => Capacity = _size;
    public IList<TKey> Keys
    {
        get
        {
            var list = new List<TKey>(_size);
            for (int i = 0; i < _size; i++)
                list.Add(_keys[i]);
            return list.AsReadOnly();
        }
    }
    public IList<TValue> Values
    {
        get
        {
            var list = new List<TValue>(_size);
            for (int i = 0; i < _size; i++)
                list.Add(_values[i]);
            return list.AsReadOnly();
        }
    }
    ICollection<TKey> IDictionary<TKey, TValue>.Keys => Keys;
    ICollection<TValue> IDictionary<TKey, TValue>.Values => Values;
    IEnumerable<TKey> IReadOnlyDictionary<TKey, TValue>.Keys => Keys;
    IEnumerable<TValue> IReadOnlyDictionary<TKey, TValue>.Values => Values;
    void ICollection<KeyValuePair<TKey, TValue>>.Add(KeyValuePair<TKey, TValue> item) => Add(item.Key, item.Value);
    bool ICollection<KeyValuePair<TKey, TValue>>.Contains(KeyValuePair<TKey, TValue> item)
    {
        int index = IndexOfKey(item.Key);
        return index >= 0 && EqualityComparer<TValue>.Default.Equals(_values[index], item.Value);
    }
    bool ICollection<KeyValuePair<TKey, TValue>>.Remove(KeyValuePair<TKey, TValue> item)
    {
        int index = IndexOfKey(item.Key);
        if (index >= 0 && EqualityComparer<TValue>.Default.Equals(_values[index], item.Value))
        {
            RemoveAt(index);
            return true;
        }
        return false;
    }
    public void CopyTo(KeyValuePair<TKey, TValue>[] array, int arrayIndex)
    {
        for (int i = 0; i < _size; i++)
            array[arrayIndex + i] = new KeyValuePair<TKey, TValue>(_keys[i], _values[i]);
    }
    public IEnumerator<KeyValuePair<TKey, TValue>> GetEnumerator()
    {
        int version = _version;
        for (int i = 0; i < _size; i++)
        {
            yield return new KeyValuePair<TKey, TValue>(_keys[i], _values[i]);
            if (version != _version)
                throw new InvalidOperationException("Collection was modified; enumeration operation may not execute.");
        }
    }
    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
}
`);
})(globalThis);
