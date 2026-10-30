// C#: System.Linq - the operators of Enumerable over IEnumerable<T> with
// deferred execution (iterators), stable ordering (OrderBy, ThenBy),
// grouping and lookups in the order of the first key, the exceptions of
// .NET (empty sequences, null arguments).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    if (CS.library.units['linq/Enumerable'])
        return;

    CS.addLibrary('linq', String.raw`
using System.Collections;
using System.Collections.Generic;
namespace System.Linq;

public interface IGrouping<out TKey, out TElement> : IEnumerable<TElement>
{
    TKey Key { get; }
}

public interface ILookup<TKey, TElement> : IEnumerable<IGrouping<TKey, TElement>>
{
    int Count { get; }
    IEnumerable<TElement> this[TKey key] { get; }
    bool Contains(TKey key);
}

public interface IOrderedEnumerable<out TElement> : IEnumerable<TElement>
{
    IOrderedEnumerable<TElement> CreateOrderedEnumerable<TKey>(Func<TElement, TKey> keySelector, IComparer<TKey> comparer, bool descending);
}

public static class Enumerable
{
    private static Exception NoElements() => new InvalidOperationException("Sequence contains no elements");
    private static Exception NoMatch() => new InvalidOperationException("Sequence contains no matching element");
    private static Exception MoreThanOne() => new InvalidOperationException("Sequence contains more than one element");
    private static Exception MoreThanOneMatch() => new InvalidOperationException("Sequence contains more than one matching element");
    private static void Check(object value, string name)
    {
        if (value == null)
            throw new ArgumentNullException(name);
    }

    // --- Generation

    public static IEnumerable<int> Range(int start, int count)
    {
        long max = (long)start + count - 1;
        if (count < 0 || max > int.MaxValue)
            throw new ArgumentOutOfRangeException("count");
        return RangeIterator(start, count);
    }
    private static IEnumerable<int> RangeIterator(int start, int count)
    {
        for (int i = 0; i < count; i++)
            yield return start + i;
    }
    public static IEnumerable<TResult> Repeat<TResult>(TResult element, int count)
    {
        if (count < 0)
            throw new ArgumentOutOfRangeException("count");
        return RepeatIterator(element, count);
    }
    private static IEnumerable<TResult> RepeatIterator<TResult>(TResult element, int count)
    {
        for (int i = 0; i < count; i++)
            yield return element;
    }
    public static IEnumerable<TResult> Empty<TResult>() => Array.Empty<TResult>();

    // --- Filtering and projection

    public static IEnumerable<TSource> Where<TSource>(this IEnumerable<TSource> source, Func<TSource, bool> predicate)
    {
        Check(source, "source");
        Check(predicate, "predicate");
        return WhereIterator(source, predicate);
    }
    private static IEnumerable<TSource> WhereIterator<TSource>(IEnumerable<TSource> source, Func<TSource, bool> predicate)
    {
        foreach (TSource item in source)
            if (predicate(item))
                yield return item;
    }
    public static IEnumerable<TSource> Where<TSource>(this IEnumerable<TSource> source, Func<TSource, int, bool> predicate)
    {
        Check(source, "source");
        Check(predicate, "predicate");
        return WhereIndexIterator(source, predicate);
    }
    private static IEnumerable<TSource> WhereIndexIterator<TSource>(IEnumerable<TSource> source, Func<TSource, int, bool> predicate)
    {
        int index = -1;
        foreach (TSource item in source)
        {
            checked { index++; }
            if (predicate(item, index))
                yield return item;
        }
    }
    public static IEnumerable<TResult> Select<TSource, TResult>(this IEnumerable<TSource> source, Func<TSource, TResult> selector)
    {
        Check(source, "source");
        Check(selector, "selector");
        return SelectIterator(source, selector);
    }
    private static IEnumerable<TResult> SelectIterator<TSource, TResult>(IEnumerable<TSource> source, Func<TSource, TResult> selector)
    {
        foreach (TSource item in source)
            yield return selector(item);
    }
    public static IEnumerable<TResult> Select<TSource, TResult>(this IEnumerable<TSource> source, Func<TSource, int, TResult> selector)
    {
        Check(source, "source");
        Check(selector, "selector");
        return SelectIndexIterator(source, selector);
    }
    private static IEnumerable<TResult> SelectIndexIterator<TSource, TResult>(IEnumerable<TSource> source, Func<TSource, int, TResult> selector)
    {
        int index = -1;
        foreach (TSource item in source)
        {
            checked { index++; }
            yield return selector(item, index);
        }
    }
    public static IEnumerable<TResult> SelectMany<TSource, TResult>(this IEnumerable<TSource> source, Func<TSource, IEnumerable<TResult>> selector)
    {
        Check(source, "source");
        Check(selector, "selector");
        return SelectManyIterator(source, selector);
    }
    private static IEnumerable<TResult> SelectManyIterator<TSource, TResult>(IEnumerable<TSource> source, Func<TSource, IEnumerable<TResult>> selector)
    {
        foreach (TSource item in source)
            foreach (TResult inner in selector(item))
                yield return inner;
    }
    public static IEnumerable<TResult> SelectMany<TSource, TResult>(this IEnumerable<TSource> source, Func<TSource, int, IEnumerable<TResult>> selector)
    {
        Check(source, "source");
        Check(selector, "selector");
        return SelectManyIndexIterator(source, selector);
    }
    private static IEnumerable<TResult> SelectManyIndexIterator<TSource, TResult>(IEnumerable<TSource> source, Func<TSource, int, IEnumerable<TResult>> selector)
    {
        int index = -1;
        foreach (TSource item in source)
        {
            index++;
            foreach (TResult inner in selector(item, index))
                yield return inner;
        }
    }
    public static IEnumerable<TResult> SelectMany<TSource, TCollection, TResult>(this IEnumerable<TSource> source,
        Func<TSource, IEnumerable<TCollection>> collectionSelector, Func<TSource, TCollection, TResult> resultSelector)
    {
        Check(source, "source");
        Check(collectionSelector, "collectionSelector");
        Check(resultSelector, "resultSelector");
        return SelectManyResultIterator(source, collectionSelector, resultSelector);
    }
    private static IEnumerable<TResult> SelectManyResultIterator<TSource, TCollection, TResult>(IEnumerable<TSource> source,
        Func<TSource, IEnumerable<TCollection>> collectionSelector, Func<TSource, TCollection, TResult> resultSelector)
    {
        foreach (TSource item in source)
            foreach (TCollection inner in collectionSelector(item))
                yield return resultSelector(item, inner);
    }
    public static IEnumerable<TResult> Cast<TResult>(this IEnumerable source)
    {
        Check(source, "source");
        if (source is IEnumerable<TResult> typed)
            return typed;
        return CastIterator<TResult>(source);
    }
    private static IEnumerable<TResult> CastIterator<TResult>(IEnumerable source)
    {
        foreach (object item in source)
            yield return (TResult)item;
    }
    public static IEnumerable<TResult> OfType<TResult>(this IEnumerable source)
    {
        Check(source, "source");
        return OfTypeIterator<TResult>(source);
    }
    private static IEnumerable<TResult> OfTypeIterator<TResult>(IEnumerable source)
    {
        foreach (object item in source)
            if (item is TResult result)
                yield return result;
    }

    // --- Partitioning

    public static IEnumerable<TSource> Take<TSource>(this IEnumerable<TSource> source, int count)
    {
        Check(source, "source");
        return count <= 0 ? Empty<TSource>() : TakeIterator(source, count);
    }
    private static IEnumerable<TSource> TakeIterator<TSource>(IEnumerable<TSource> source, int count)
    {
        foreach (TSource item in source)
        {
            yield return item;
            if (--count == 0)
                break;
        }
    }
    public static IEnumerable<TSource> Take<TSource>(this IEnumerable<TSource> source, Range range)
    {
        Check(source, "source");
        var list = new List<TSource>(source);
        int start = range.Start.GetOffset(list.Count);
        int end = range.End.GetOffset(list.Count);
        if (start < 0)
            start = 0;
        if (end > list.Count)
            end = list.Count;
        var result = new List<TSource>();
        for (int i = start; i < end; i++)
            result.Add(list[i]);
        return result;
    }
    public static IEnumerable<TSource> Skip<TSource>(this IEnumerable<TSource> source, int count)
    {
        Check(source, "source");
        return SkipIterator(source, count);
    }
    private static IEnumerable<TSource> SkipIterator<TSource>(IEnumerable<TSource> source, int count)
    {
        foreach (TSource item in source)
        {
            if (count > 0)
            {
                count--;
                continue;
            }
            yield return item;
        }
    }
    public static IEnumerable<TSource> TakeWhile<TSource>(this IEnumerable<TSource> source, Func<TSource, bool> predicate)
    {
        Check(source, "source");
        Check(predicate, "predicate");
        return TakeWhileIterator(source, predicate);
    }
    private static IEnumerable<TSource> TakeWhileIterator<TSource>(IEnumerable<TSource> source, Func<TSource, bool> predicate)
    {
        foreach (TSource item in source)
        {
            if (!predicate(item))
                break;
            yield return item;
        }
    }
    public static IEnumerable<TSource> TakeWhile<TSource>(this IEnumerable<TSource> source, Func<TSource, int, bool> predicate)
    {
        Check(source, "source");
        Check(predicate, "predicate");
        return TakeWhileIndexIterator(source, predicate);
    }
    private static IEnumerable<TSource> TakeWhileIndexIterator<TSource>(IEnumerable<TSource> source, Func<TSource, int, bool> predicate)
    {
        int index = -1;
        foreach (TSource item in source)
        {
            index++;
            if (!predicate(item, index))
                break;
            yield return item;
        }
    }
    public static IEnumerable<TSource> SkipWhile<TSource>(this IEnumerable<TSource> source, Func<TSource, bool> predicate)
    {
        Check(source, "source");
        Check(predicate, "predicate");
        return SkipWhileIterator(source, predicate);
    }
    private static IEnumerable<TSource> SkipWhileIterator<TSource>(IEnumerable<TSource> source, Func<TSource, bool> predicate)
    {
        bool yielding = false;
        foreach (TSource item in source)
        {
            if (!yielding && !predicate(item))
                yielding = true;
            if (yielding)
                yield return item;
        }
    }
    public static IEnumerable<TSource> SkipWhile<TSource>(this IEnumerable<TSource> source, Func<TSource, int, bool> predicate)
    {
        Check(source, "source");
        Check(predicate, "predicate");
        return SkipWhileIndexIterator(source, predicate);
    }
    private static IEnumerable<TSource> SkipWhileIndexIterator<TSource>(IEnumerable<TSource> source, Func<TSource, int, bool> predicate)
    {
        bool yielding = false;
        int index = -1;
        foreach (TSource item in source)
        {
            index++;
            if (!yielding && !predicate(item, index))
                yielding = true;
            if (yielding)
                yield return item;
        }
    }
    public static IEnumerable<TSource> TakeLast<TSource>(this IEnumerable<TSource> source, int count)
    {
        Check(source, "source");
        return count <= 0 ? Empty<TSource>() : TakeLastIterator(source, count);
    }
    private static IEnumerable<TSource> TakeLastIterator<TSource>(IEnumerable<TSource> source, int count)
    {
        var queue = new Queue<TSource>();
        foreach (TSource item in source)
        {
            if (queue.Count == count)
                queue.Dequeue();
            queue.Enqueue(item);
        }
        foreach (TSource item in queue)
            yield return item;
    }
    public static IEnumerable<TSource> SkipLast<TSource>(this IEnumerable<TSource> source, int count)
    {
        Check(source, "source");
        return count <= 0 ? Skip(source, 0) : SkipLastIterator(source, count);
    }
    private static IEnumerable<TSource> SkipLastIterator<TSource>(IEnumerable<TSource> source, int count)
    {
        var queue = new Queue<TSource>();
        foreach (TSource item in source)
        {
            if (queue.Count == count)
                yield return queue.Dequeue();
            queue.Enqueue(item);
        }
    }
    public static IEnumerable<TSource[]> Chunk<TSource>(this IEnumerable<TSource> source, int size)
    {
        Check(source, "source");
        if (size < 1)
            throw new ArgumentOutOfRangeException("size");
        return ChunkIterator(source, size);
    }
    private static IEnumerable<TSource[]> ChunkIterator<TSource>(IEnumerable<TSource> source, int size)
    {
        var chunk = new List<TSource>();
        foreach (TSource item in source)
        {
            chunk.Add(item);
            if (chunk.Count == size)
            {
                yield return chunk.ToArray();
                chunk = new List<TSource>();
            }
        }
        if (chunk.Count > 0)
            yield return chunk.ToArray();
    }

    // --- Ordering

    public static IOrderedEnumerable<TSource> OrderBy<TSource, TKey>(this IEnumerable<TSource> source, Func<TSource, TKey> keySelector)
    {
        Check(source, "source");
        Check(keySelector, "keySelector");
        return new OrderedEnumerable<TSource, TKey>(source, null, keySelector, null, false);
    }
    public static IOrderedEnumerable<TSource> OrderBy<TSource, TKey>(this IEnumerable<TSource> source, Func<TSource, TKey> keySelector, IComparer<TKey> comparer)
    {
        Check(source, "source");
        Check(keySelector, "keySelector");
        return new OrderedEnumerable<TSource, TKey>(source, null, keySelector, comparer, false);
    }
    public static IOrderedEnumerable<TSource> OrderByDescending<TSource, TKey>(this IEnumerable<TSource> source, Func<TSource, TKey> keySelector)
    {
        Check(source, "source");
        Check(keySelector, "keySelector");
        return new OrderedEnumerable<TSource, TKey>(source, null, keySelector, null, true);
    }
    public static IOrderedEnumerable<TSource> OrderByDescending<TSource, TKey>(this IEnumerable<TSource> source, Func<TSource, TKey> keySelector, IComparer<TKey> comparer)
    {
        Check(source, "source");
        Check(keySelector, "keySelector");
        return new OrderedEnumerable<TSource, TKey>(source, null, keySelector, comparer, true);
    }
    public static IOrderedEnumerable<T> Order<T>(this IEnumerable<T> source) => OrderBy(source, x => x);
    public static IOrderedEnumerable<T> Order<T>(this IEnumerable<T> source, IComparer<T> comparer) => OrderBy(source, x => x, comparer);
    public static IOrderedEnumerable<T> OrderDescending<T>(this IEnumerable<T> source) => OrderByDescending(source, x => x);
    public static IOrderedEnumerable<T> OrderDescending<T>(this IEnumerable<T> source, IComparer<T> comparer) => OrderByDescending(source, x => x, comparer);
    public static IOrderedEnumerable<TSource> ThenBy<TSource, TKey>(this IOrderedEnumerable<TSource> source, Func<TSource, TKey> keySelector)
    {
        Check(source, "source");
        return source.CreateOrderedEnumerable(keySelector, null, false);
    }
    public static IOrderedEnumerable<TSource> ThenBy<TSource, TKey>(this IOrderedEnumerable<TSource> source, Func<TSource, TKey> keySelector, IComparer<TKey> comparer)
    {
        Check(source, "source");
        return source.CreateOrderedEnumerable(keySelector, comparer, false);
    }
    public static IOrderedEnumerable<TSource> ThenByDescending<TSource, TKey>(this IOrderedEnumerable<TSource> source, Func<TSource, TKey> keySelector)
    {
        Check(source, "source");
        return source.CreateOrderedEnumerable(keySelector, null, true);
    }
    public static IOrderedEnumerable<TSource> ThenByDescending<TSource, TKey>(this IOrderedEnumerable<TSource> source, Func<TSource, TKey> keySelector, IComparer<TKey> comparer)
    {
        Check(source, "source");
        return source.CreateOrderedEnumerable(keySelector, comparer, true);
    }
    public static IEnumerable<TSource> Reverse<TSource>(this IEnumerable<TSource> source)
    {
        Check(source, "source");
        return ReverseIterator(source);
    }
    private static IEnumerable<TSource> ReverseIterator<TSource>(IEnumerable<TSource> source)
    {
        TSource[] items = ToArray(source);
        for (int i = items.Length - 1; i >= 0; i--)
            yield return items[i];
    }

    // --- Grouping and joins

    public static IEnumerable<IGrouping<TKey, TSource>> GroupBy<TSource, TKey>(this IEnumerable<TSource> source, Func<TSource, TKey> keySelector) =>
        GroupBy(source, keySelector, (IEqualityComparer<TKey>)null);
    public static IEnumerable<IGrouping<TKey, TSource>> GroupBy<TSource, TKey>(this IEnumerable<TSource> source, Func<TSource, TKey> keySelector,
        IEqualityComparer<TKey> comparer)
    {
        Check(source, "source");
        Check(keySelector, "keySelector");
        return GroupByIterator(source, keySelector, x => x, comparer);
    }
    public static IEnumerable<IGrouping<TKey, TElement>> GroupBy<TSource, TKey, TElement>(this IEnumerable<TSource> source,
        Func<TSource, TKey> keySelector, Func<TSource, TElement> elementSelector)
    {
        Check(source, "source");
        Check(keySelector, "keySelector");
        Check(elementSelector, "elementSelector");
        return GroupByIterator(source, keySelector, elementSelector, null);
    }
    public static IEnumerable<TResult> GroupBy<TSource, TKey, TResult>(this IEnumerable<TSource> source, Func<TSource, TKey> keySelector,
        Func<TKey, IEnumerable<TSource>, TResult> resultSelector)
    {
        Check(resultSelector, "resultSelector");
        return Select(GroupBy(source, keySelector), group => resultSelector(group.Key, group));
    }
    public static IEnumerable<TResult> GroupBy<TSource, TKey, TElement, TResult>(this IEnumerable<TSource> source, Func<TSource, TKey> keySelector,
        Func<TSource, TElement> elementSelector, Func<TKey, IEnumerable<TElement>, TResult> resultSelector)
    {
        Check(resultSelector, "resultSelector");
        return Select(GroupBy(source, keySelector, elementSelector), group => resultSelector(group.Key, group));
    }
    private static IEnumerable<IGrouping<TKey, TElement>> GroupByIterator<TSource, TKey, TElement>(IEnumerable<TSource> source,
        Func<TSource, TKey> keySelector, Func<TSource, TElement> elementSelector, IEqualityComparer<TKey> comparer)
    {
        var lookup = Lookup<TKey, TElement>.Create(source, keySelector, elementSelector, comparer);
        foreach (var group in lookup)
            yield return group;
    }
    public static ILookup<TKey, TSource> ToLookup<TSource, TKey>(this IEnumerable<TSource> source, Func<TSource, TKey> keySelector)
    {
        Check(source, "source");
        Check(keySelector, "keySelector");
        return Lookup<TKey, TSource>.Create(source, keySelector, x => x, null);
    }
    public static ILookup<TKey, TSource> ToLookup<TSource, TKey>(this IEnumerable<TSource> source, Func<TSource, TKey> keySelector, IEqualityComparer<TKey> comparer)
    {
        Check(source, "source");
        Check(keySelector, "keySelector");
        return Lookup<TKey, TSource>.Create(source, keySelector, x => x, comparer);
    }
    public static ILookup<TKey, TElement> ToLookup<TSource, TKey, TElement>(this IEnumerable<TSource> source, Func<TSource, TKey> keySelector,
        Func<TSource, TElement> elementSelector)
    {
        Check(source, "source");
        Check(keySelector, "keySelector");
        Check(elementSelector, "elementSelector");
        return Lookup<TKey, TElement>.Create(source, keySelector, elementSelector, null);
    }
    public static IEnumerable<TResult> Join<TOuter, TInner, TKey, TResult>(this IEnumerable<TOuter> outer, IEnumerable<TInner> inner,
        Func<TOuter, TKey> outerKeySelector, Func<TInner, TKey> innerKeySelector, Func<TOuter, TInner, TResult> resultSelector)
    {
        Check(outer, "outer");
        Check(inner, "inner");
        Check(outerKeySelector, "outerKeySelector");
        Check(innerKeySelector, "innerKeySelector");
        Check(resultSelector, "resultSelector");
        return JoinIterator(outer, inner, outerKeySelector, innerKeySelector, resultSelector);
    }
    private static IEnumerable<TResult> JoinIterator<TOuter, TInner, TKey, TResult>(IEnumerable<TOuter> outer, IEnumerable<TInner> inner,
        Func<TOuter, TKey> outerKeySelector, Func<TInner, TKey> innerKeySelector, Func<TOuter, TInner, TResult> resultSelector)
    {
        var lookup = Lookup<TKey, TInner>.Create(inner, innerKeySelector, x => x, null);
        foreach (TOuter item in outer)
        {
            TKey key = outerKeySelector(item);
            if (key == null)
                continue;
            foreach (TInner match in lookup.Find(key))
                yield return resultSelector(item, match);
        }
    }
    public static IEnumerable<TResult> GroupJoin<TOuter, TInner, TKey, TResult>(this IEnumerable<TOuter> outer, IEnumerable<TInner> inner,
        Func<TOuter, TKey> outerKeySelector, Func<TInner, TKey> innerKeySelector, Func<TOuter, IEnumerable<TInner>, TResult> resultSelector)
    {
        Check(outer, "outer");
        Check(inner, "inner");
        Check(outerKeySelector, "outerKeySelector");
        Check(innerKeySelector, "innerKeySelector");
        Check(resultSelector, "resultSelector");
        return GroupJoinIterator(outer, inner, outerKeySelector, innerKeySelector, resultSelector);
    }
    private static IEnumerable<TResult> GroupJoinIterator<TOuter, TInner, TKey, TResult>(IEnumerable<TOuter> outer, IEnumerable<TInner> inner,
        Func<TOuter, TKey> outerKeySelector, Func<TInner, TKey> innerKeySelector, Func<TOuter, IEnumerable<TInner>, TResult> resultSelector)
    {
        var lookup = Lookup<TKey, TInner>.Create(inner, innerKeySelector, x => x, null);
        foreach (TOuter item in outer)
        {
            TKey key = outerKeySelector(item);
            yield return resultSelector(item, key == null ? Empty<TInner>() : lookup.Find(key));
        }
    }
    public static IEnumerable<TResult> Zip<TFirst, TSecond, TResult>(this IEnumerable<TFirst> first, IEnumerable<TSecond> second,
        Func<TFirst, TSecond, TResult> resultSelector)
    {
        Check(first, "first");
        Check(second, "second");
        Check(resultSelector, "resultSelector");
        return ZipIterator(first, second, resultSelector);
    }
    private static IEnumerable<TResult> ZipIterator<TFirst, TSecond, TResult>(IEnumerable<TFirst> first, IEnumerable<TSecond> second,
        Func<TFirst, TSecond, TResult> resultSelector)
    {
        using (var e1 = first.GetEnumerator())
        using (var e2 = second.GetEnumerator())
        {
            while (e1.MoveNext() && e2.MoveNext())
                yield return resultSelector(e1.Current, e2.Current);
        }
    }
    public static IEnumerable<(TFirst First, TSecond Second)> Zip<TFirst, TSecond>(this IEnumerable<TFirst> first, IEnumerable<TSecond> second) =>
        Zip(first, second, (a, b) => (a, b));
    public static IEnumerable<(TFirst First, TSecond Second, TThird Third)> Zip<TFirst, TSecond, TThird>(this IEnumerable<TFirst> first,
        IEnumerable<TSecond> second, IEnumerable<TThird> third)
    {
        Check(first, "first");
        Check(second, "second");
        Check(third, "third");
        return Zip3Iterator(first, second, third);
    }
    private static IEnumerable<(TFirst First, TSecond Second, TThird Third)> Zip3Iterator<TFirst, TSecond, TThird>(IEnumerable<TFirst> first,
        IEnumerable<TSecond> second, IEnumerable<TThird> third)
    {
        using (var e1 = first.GetEnumerator())
        using (var e2 = second.GetEnumerator())
        using (var e3 = third.GetEnumerator())
        {
            while (e1.MoveNext() && e2.MoveNext() && e3.MoveNext())
                yield return (e1.Current, e2.Current, e3.Current);
        }
    }

    // --- Sets

    public static IEnumerable<TSource> Distinct<TSource>(this IEnumerable<TSource> source) => Distinct(source, null);
    public static IEnumerable<TSource> Distinct<TSource>(this IEnumerable<TSource> source, IEqualityComparer<TSource> comparer)
    {
        Check(source, "source");
        return DistinctIterator(source, comparer);
    }
    private static IEnumerable<TSource> DistinctIterator<TSource>(IEnumerable<TSource> source, IEqualityComparer<TSource> comparer)
    {
        var set = new HashSet<TSource>(comparer);
        foreach (TSource item in source)
            if (set.Add(item))
                yield return item;
    }
    public static IEnumerable<TSource> DistinctBy<TSource, TKey>(this IEnumerable<TSource> source, Func<TSource, TKey> keySelector) =>
        DistinctBy(source, keySelector, null);
    public static IEnumerable<TSource> DistinctBy<TSource, TKey>(this IEnumerable<TSource> source, Func<TSource, TKey> keySelector, IEqualityComparer<TKey> comparer)
    {
        Check(source, "source");
        Check(keySelector, "keySelector");
        return DistinctByIterator(source, keySelector, comparer);
    }
    private static IEnumerable<TSource> DistinctByIterator<TSource, TKey>(IEnumerable<TSource> source, Func<TSource, TKey> keySelector, IEqualityComparer<TKey> comparer)
    {
        var set = new HashSet<TKey>(comparer);
        foreach (TSource item in source)
            if (set.Add(keySelector(item)))
                yield return item;
    }
    public static IEnumerable<TSource> Union<TSource>(this IEnumerable<TSource> first, IEnumerable<TSource> second) => Union(first, second, null);
    public static IEnumerable<TSource> Union<TSource>(this IEnumerable<TSource> first, IEnumerable<TSource> second, IEqualityComparer<TSource> comparer)
    {
        Check(first, "first");
        Check(second, "second");
        return UnionIterator(first, second, comparer);
    }
    private static IEnumerable<TSource> UnionIterator<TSource>(IEnumerable<TSource> first, IEnumerable<TSource> second, IEqualityComparer<TSource> comparer)
    {
        var set = new HashSet<TSource>(comparer);
        foreach (TSource item in first)
            if (set.Add(item))
                yield return item;
        foreach (TSource item in second)
            if (set.Add(item))
                yield return item;
    }
    public static IEnumerable<TSource> UnionBy<TSource, TKey>(this IEnumerable<TSource> first, IEnumerable<TSource> second, Func<TSource, TKey> keySelector)
    {
        Check(first, "first");
        Check(second, "second");
        Check(keySelector, "keySelector");
        return UnionByIterator(first, second, keySelector);
    }
    private static IEnumerable<TSource> UnionByIterator<TSource, TKey>(IEnumerable<TSource> first, IEnumerable<TSource> second, Func<TSource, TKey> keySelector)
    {
        var set = new HashSet<TKey>();
        foreach (TSource item in first)
            if (set.Add(keySelector(item)))
                yield return item;
        foreach (TSource item in second)
            if (set.Add(keySelector(item)))
                yield return item;
    }
    public static IEnumerable<TSource> Intersect<TSource>(this IEnumerable<TSource> first, IEnumerable<TSource> second) => Intersect(first, second, null);
    public static IEnumerable<TSource> Intersect<TSource>(this IEnumerable<TSource> first, IEnumerable<TSource> second, IEqualityComparer<TSource> comparer)
    {
        Check(first, "first");
        Check(second, "second");
        return IntersectIterator(first, second, comparer);
    }
    private static IEnumerable<TSource> IntersectIterator<TSource>(IEnumerable<TSource> first, IEnumerable<TSource> second, IEqualityComparer<TSource> comparer)
    {
        var set = new HashSet<TSource>(second, comparer);
        foreach (TSource item in first)
            if (set.Remove(item))
                yield return item;
    }
    public static IEnumerable<TSource> IntersectBy<TSource, TKey>(this IEnumerable<TSource> first, IEnumerable<TKey> second, Func<TSource, TKey> keySelector)
    {
        Check(first, "first");
        Check(second, "second");
        Check(keySelector, "keySelector");
        return IntersectByIterator(first, second, keySelector);
    }
    private static IEnumerable<TSource> IntersectByIterator<TSource, TKey>(IEnumerable<TSource> first, IEnumerable<TKey> second, Func<TSource, TKey> keySelector)
    {
        var set = new HashSet<TKey>(second);
        foreach (TSource item in first)
            if (set.Remove(keySelector(item)))
                yield return item;
    }
    public static IEnumerable<TSource> Except<TSource>(this IEnumerable<TSource> first, IEnumerable<TSource> second) => Except(first, second, null);
    public static IEnumerable<TSource> Except<TSource>(this IEnumerable<TSource> first, IEnumerable<TSource> second, IEqualityComparer<TSource> comparer)
    {
        Check(first, "first");
        Check(second, "second");
        return ExceptIterator(first, second, comparer);
    }
    private static IEnumerable<TSource> ExceptIterator<TSource>(IEnumerable<TSource> first, IEnumerable<TSource> second, IEqualityComparer<TSource> comparer)
    {
        var set = new HashSet<TSource>(second, comparer);
        foreach (TSource item in first)
            if (set.Add(item))
                yield return item;
    }
    public static IEnumerable<TSource> ExceptBy<TSource, TKey>(this IEnumerable<TSource> first, IEnumerable<TKey> second, Func<TSource, TKey> keySelector)
    {
        Check(first, "first");
        Check(second, "second");
        Check(keySelector, "keySelector");
        return ExceptByIterator(first, second, keySelector);
    }
    private static IEnumerable<TSource> ExceptByIterator<TSource, TKey>(IEnumerable<TSource> first, IEnumerable<TKey> second, Func<TSource, TKey> keySelector)
    {
        var set = new HashSet<TKey>(second);
        foreach (TSource item in first)
            if (set.Add(keySelector(item)))
                yield return item;
    }
    public static IEnumerable<TSource> Concat<TSource>(this IEnumerable<TSource> first, IEnumerable<TSource> second)
    {
        Check(first, "first");
        Check(second, "second");
        return ConcatIterator(first, second);
    }
    private static IEnumerable<TSource> ConcatIterator<TSource>(IEnumerable<TSource> first, IEnumerable<TSource> second)
    {
        foreach (TSource item in first)
            yield return item;
        foreach (TSource item in second)
            yield return item;
    }
    public static IEnumerable<TSource> Append<TSource>(this IEnumerable<TSource> source, TSource element)
    {
        Check(source, "source");
        return AppendIterator(source, element);
    }
    private static IEnumerable<TSource> AppendIterator<TSource>(IEnumerable<TSource> source, TSource element)
    {
        foreach (TSource item in source)
            yield return item;
        yield return element;
    }
    public static IEnumerable<TSource> Prepend<TSource>(this IEnumerable<TSource> source, TSource element)
    {
        Check(source, "source");
        return PrependIterator(source, element);
    }
    private static IEnumerable<TSource> PrependIterator<TSource>(IEnumerable<TSource> source, TSource element)
    {
        yield return element;
        foreach (TSource item in source)
            yield return item;
    }
    public static IEnumerable<TSource> DefaultIfEmpty<TSource>(this IEnumerable<TSource> source) => DefaultIfEmpty(source, default(TSource));
    public static IEnumerable<TSource> DefaultIfEmpty<TSource>(this IEnumerable<TSource> source, TSource defaultValue)
    {
        Check(source, "source");
        return DefaultIfEmptyIterator(source, defaultValue);
    }
    private static IEnumerable<TSource> DefaultIfEmptyIterator<TSource>(IEnumerable<TSource> source, TSource defaultValue)
    {
        bool any = false;
        foreach (TSource item in source)
        {
            any = true;
            yield return item;
        }
        if (!any)
            yield return defaultValue;
    }
    public static IEnumerable<TSource> AsEnumerable<TSource>(this IEnumerable<TSource> source) => source;

    // --- Conversion

    public static TSource[] ToArray<TSource>(this IEnumerable<TSource> source)
    {
        Check(source, "source");
        return new List<TSource>(source).ToArray();
    }
    public static List<TSource> ToList<TSource>(this IEnumerable<TSource> source)
    {
        Check(source, "source");
        return new List<TSource>(source);
    }
    public static HashSet<TSource> ToHashSet<TSource>(this IEnumerable<TSource> source) => ToHashSet(source, null);
    public static HashSet<TSource> ToHashSet<TSource>(this IEnumerable<TSource> source, IEqualityComparer<TSource> comparer)
    {
        Check(source, "source");
        return new HashSet<TSource>(source, comparer);
    }
    public static Dictionary<TKey, TSource> ToDictionary<TSource, TKey>(this IEnumerable<TSource> source, Func<TSource, TKey> keySelector) =>
        ToDictionary(source, keySelector, x => x, null);
    public static Dictionary<TKey, TSource> ToDictionary<TSource, TKey>(this IEnumerable<TSource> source, Func<TSource, TKey> keySelector,
        IEqualityComparer<TKey> comparer) => ToDictionary(source, keySelector, x => x, comparer);
    public static Dictionary<TKey, TElement> ToDictionary<TSource, TKey, TElement>(this IEnumerable<TSource> source, Func<TSource, TKey> keySelector,
        Func<TSource, TElement> elementSelector) => ToDictionary(source, keySelector, elementSelector, null);
    public static Dictionary<TKey, TElement> ToDictionary<TSource, TKey, TElement>(this IEnumerable<TSource> source, Func<TSource, TKey> keySelector,
        Func<TSource, TElement> elementSelector, IEqualityComparer<TKey> comparer)
    {
        Check(source, "source");
        Check(keySelector, "keySelector");
        Check(elementSelector, "elementSelector");
        var dictionary = new Dictionary<TKey, TElement>(comparer);
        foreach (TSource item in source)
            dictionary.Add(keySelector(item), elementSelector(item));
        return dictionary;
    }
    public static Dictionary<TKey, TValue> ToDictionary<TKey, TValue>(this IEnumerable<KeyValuePair<TKey, TValue>> source) =>
        ToDictionary(source, pair => pair.Key, pair => pair.Value, null);
    public static Dictionary<TKey, TValue> ToDictionary<TKey, TValue>(this IEnumerable<(TKey Key, TValue Value)> source) =>
        ToDictionary(source, pair => pair.Key, pair => pair.Value, null);

    // --- Elements

    public static TSource First<TSource>(this IEnumerable<TSource> source)
    {
        Check(source, "source");
        if (source is IList<TSource> list)
        {
            if (list.Count > 0)
                return list[0];
        }
        else
        {
            foreach (TSource item in source)
                return item;
        }
        throw NoElements();
    }
    public static TSource First<TSource>(this IEnumerable<TSource> source, Func<TSource, bool> predicate)
    {
        Check(source, "source");
        Check(predicate, "predicate");
        foreach (TSource item in source)
            if (predicate(item))
                return item;
        throw NoMatch();
    }
    public static TSource FirstOrDefault<TSource>(this IEnumerable<TSource> source) => FirstOrDefault(source, default(TSource));
    public static TSource FirstOrDefault<TSource>(this IEnumerable<TSource> source, TSource defaultValue)
    {
        Check(source, "source");
        foreach (TSource item in source)
            return item;
        return defaultValue;
    }
    public static TSource FirstOrDefault<TSource>(this IEnumerable<TSource> source, Func<TSource, bool> predicate) =>
        FirstOrDefault(source, predicate, default(TSource));
    public static TSource FirstOrDefault<TSource>(this IEnumerable<TSource> source, Func<TSource, bool> predicate, TSource defaultValue)
    {
        Check(source, "source");
        Check(predicate, "predicate");
        foreach (TSource item in source)
            if (predicate(item))
                return item;
        return defaultValue;
    }
    public static TSource Last<TSource>(this IEnumerable<TSource> source)
    {
        Check(source, "source");
        if (source is IList<TSource> list)
        {
            if (list.Count > 0)
                return list[list.Count - 1];
            throw NoElements();
        }
        bool found = false;
        TSource last = default(TSource);
        foreach (TSource item in source)
        {
            found = true;
            last = item;
        }
        if (!found)
            throw NoElements();
        return last;
    }
    public static TSource Last<TSource>(this IEnumerable<TSource> source, Func<TSource, bool> predicate)
    {
        Check(source, "source");
        Check(predicate, "predicate");
        bool found = false;
        TSource last = default(TSource);
        foreach (TSource item in source)
        {
            if (predicate(item))
            {
                found = true;
                last = item;
            }
        }
        if (!found)
            throw NoMatch();
        return last;
    }
    public static TSource LastOrDefault<TSource>(this IEnumerable<TSource> source) => LastOrDefault(source, default(TSource));
    public static TSource LastOrDefault<TSource>(this IEnumerable<TSource> source, TSource defaultValue)
    {
        Check(source, "source");
        TSource last = defaultValue;
        foreach (TSource item in source)
            last = item;
        return last;
    }
    public static TSource LastOrDefault<TSource>(this IEnumerable<TSource> source, Func<TSource, bool> predicate) =>
        LastOrDefault(source, predicate, default(TSource));
    public static TSource LastOrDefault<TSource>(this IEnumerable<TSource> source, Func<TSource, bool> predicate, TSource defaultValue)
    {
        Check(source, "source");
        Check(predicate, "predicate");
        TSource last = defaultValue;
        foreach (TSource item in source)
            if (predicate(item))
                last = item;
        return last;
    }
    public static TSource Single<TSource>(this IEnumerable<TSource> source)
    {
        Check(source, "source");
        using (var e = source.GetEnumerator())
        {
            if (!e.MoveNext())
                throw NoElements();
            TSource result = e.Current;
            if (!e.MoveNext())
                return result;
        }
        throw MoreThanOne();
    }
    public static TSource Single<TSource>(this IEnumerable<TSource> source, Func<TSource, bool> predicate)
    {
        Check(source, "source");
        Check(predicate, "predicate");
        bool found = false;
        TSource result = default(TSource);
        foreach (TSource item in source)
        {
            if (predicate(item))
            {
                if (found)
                    throw MoreThanOneMatch();
                found = true;
                result = item;
            }
        }
        if (!found)
            throw NoMatch();
        return result;
    }
    public static TSource SingleOrDefault<TSource>(this IEnumerable<TSource> source) => SingleOrDefault(source, default(TSource));
    public static TSource SingleOrDefault<TSource>(this IEnumerable<TSource> source, TSource defaultValue)
    {
        Check(source, "source");
        using (var e = source.GetEnumerator())
        {
            if (!e.MoveNext())
                return defaultValue;
            TSource result = e.Current;
            if (!e.MoveNext())
                return result;
        }
        throw MoreThanOne();
    }
    public static TSource SingleOrDefault<TSource>(this IEnumerable<TSource> source, Func<TSource, bool> predicate) =>
        SingleOrDefault(source, predicate, default(TSource));
    public static TSource SingleOrDefault<TSource>(this IEnumerable<TSource> source, Func<TSource, bool> predicate, TSource defaultValue)
    {
        Check(source, "source");
        Check(predicate, "predicate");
        bool found = false;
        TSource result = defaultValue;
        foreach (TSource item in source)
        {
            if (predicate(item))
            {
                if (found)
                    throw MoreThanOneMatch();
                found = true;
                result = item;
            }
        }
        return result;
    }
    public static TSource ElementAt<TSource>(this IEnumerable<TSource> source, int index)
    {
        Check(source, "source");
        if (source is IList<TSource> list)
        {
            if (index < 0 || index >= list.Count)
                throw new ArgumentOutOfRangeException("index", "Index was out of range. Must be non-negative and less than the size of the collection.");
            return list[index];
        }
        if (index >= 0)
        {
            foreach (TSource item in source)
            {
                if (index == 0)
                    return item;
                index--;
            }
        }
        throw new ArgumentOutOfRangeException("index", "Index was out of range. Must be non-negative and less than the size of the collection.");
    }
    public static TSource ElementAt<TSource>(this IEnumerable<TSource> source, Index index)
    {
        Check(source, "source");
        if (!index.IsFromEnd)
            return ElementAt(source, index.Value);
        var list = new List<TSource>(source);
        return ElementAt(list, index.GetOffset(list.Count));
    }
    public static TSource ElementAtOrDefault<TSource>(this IEnumerable<TSource> source, int index)
    {
        Check(source, "source");
        if (index >= 0)
        {
            foreach (TSource item in source)
            {
                if (index == 0)
                    return item;
                index--;
            }
        }
        return default(TSource);
    }

    // --- Quantifiers and counts

    public static bool Any<TSource>(this IEnumerable<TSource> source)
    {
        Check(source, "source");
        if (source is ICollection<TSource> collection)
            return collection.Count != 0;
        using (var e = source.GetEnumerator())
            return e.MoveNext();
    }
    public static bool Any<TSource>(this IEnumerable<TSource> source, Func<TSource, bool> predicate)
    {
        Check(source, "source");
        Check(predicate, "predicate");
        foreach (TSource item in source)
            if (predicate(item))
                return true;
        return false;
    }
    public static bool All<TSource>(this IEnumerable<TSource> source, Func<TSource, bool> predicate)
    {
        Check(source, "source");
        Check(predicate, "predicate");
        foreach (TSource item in source)
            if (!predicate(item))
                return false;
        return true;
    }
    public static int Count<TSource>(this IEnumerable<TSource> source)
    {
        Check(source, "source");
        if (source is ICollection<TSource> collection)
            return collection.Count;
        if (source is ICollection plain)
            return plain.Count;
        int count = 0;
        using (var e = source.GetEnumerator())
        {
            checked
            {
                while (e.MoveNext())
                    count++;
            }
        }
        return count;
    }
    public static int Count<TSource>(this IEnumerable<TSource> source, Func<TSource, bool> predicate)
    {
        Check(source, "source");
        Check(predicate, "predicate");
        int count = 0;
        foreach (TSource item in source)
        {
            if (predicate(item))
                checked { count++; }
        }
        return count;
    }
    public static long LongCount<TSource>(this IEnumerable<TSource> source)
    {
        Check(source, "source");
        long count = 0;
        foreach (TSource item in source)
            count++;
        return count;
    }
    public static long LongCount<TSource>(this IEnumerable<TSource> source, Func<TSource, bool> predicate)
    {
        Check(source, "source");
        Check(predicate, "predicate");
        long count = 0;
        foreach (TSource item in source)
            if (predicate(item))
                count++;
        return count;
    }
    public static bool TryGetNonEnumeratedCount<TSource>(this IEnumerable<TSource> source, out int count)
    {
        Check(source, "source");
        if (source is ICollection<TSource> collection)
        {
            count = collection.Count;
            return true;
        }
        count = 0;
        return false;
    }
    public static bool Contains<TSource>(this IEnumerable<TSource> source, TSource value)
    {
        Check(source, "source");
        if (source is ICollection<TSource> collection)
            return collection.Contains(value);
        return Contains(source, value, null);
    }
    public static bool Contains<TSource>(this IEnumerable<TSource> source, TSource value, IEqualityComparer<TSource> comparer)
    {
        Check(source, "source");
        comparer ??= EqualityComparer<TSource>.Default;
        foreach (TSource item in source)
            if (comparer.Equals(item, value))
                return true;
        return false;
    }
    public static bool SequenceEqual<TSource>(this IEnumerable<TSource> first, IEnumerable<TSource> second) => SequenceEqual(first, second, null);
    public static bool SequenceEqual<TSource>(this IEnumerable<TSource> first, IEnumerable<TSource> second, IEqualityComparer<TSource> comparer)
    {
        Check(first, "first");
        Check(second, "second");
        comparer ??= EqualityComparer<TSource>.Default;
        using (var e1 = first.GetEnumerator())
        using (var e2 = second.GetEnumerator())
        {
            while (e1.MoveNext())
            {
                if (!(e2.MoveNext() && comparer.Equals(e1.Current, e2.Current)))
                    return false;
            }
            return !e2.MoveNext();
        }
    }

    // --- Aggregates

    public static TSource Aggregate<TSource>(this IEnumerable<TSource> source, Func<TSource, TSource, TSource> func)
    {
        Check(source, "source");
        Check(func, "func");
        using (var e = source.GetEnumerator())
        {
            if (!e.MoveNext())
                throw NoElements();
            TSource result = e.Current;
            while (e.MoveNext())
                result = func(result, e.Current);
            return result;
        }
    }
    public static TAccumulate Aggregate<TSource, TAccumulate>(this IEnumerable<TSource> source, TAccumulate seed, Func<TAccumulate, TSource, TAccumulate> func)
    {
        Check(source, "source");
        Check(func, "func");
        TAccumulate result = seed;
        foreach (TSource item in source)
            result = func(result, item);
        return result;
    }
    public static TResult Aggregate<TSource, TAccumulate, TResult>(this IEnumerable<TSource> source, TAccumulate seed,
        Func<TAccumulate, TSource, TAccumulate> func, Func<TAccumulate, TResult> resultSelector)
    {
        Check(resultSelector, "resultSelector");
        return resultSelector(Aggregate(source, seed, func));
    }
    public static int Sum(this IEnumerable<int> source)
    {
        Check(source, "source");
        int sum = 0;
        checked
        {
            foreach (int value in source)
                sum += value;
        }
        return sum;
    }
    public static long Sum(this IEnumerable<long> source)
    {
        Check(source, "source");
        long sum = 0;
        checked
        {
            foreach (long value in source)
                sum += value;
        }
        return sum;
    }
    public static double Sum(this IEnumerable<double> source)
    {
        Check(source, "source");
        double sum = 0;
        foreach (double value in source)
            sum += value;
        return sum;
    }
    public static float Sum(this IEnumerable<float> source)
    {
        Check(source, "source");
        double sum = 0;
        foreach (float value in source)
            sum += value;
        return (float)sum;
    }
    public static decimal Sum(this IEnumerable<decimal> source)
    {
        Check(source, "source");
        decimal sum = 0;
        foreach (decimal value in source)
            sum += value;
        return sum;
    }
    public static int? Sum(this IEnumerable<int?> source)
    {
        Check(source, "source");
        int sum = 0;
        checked
        {
            foreach (int? value in source)
                if (value.HasValue)
                    sum += value.GetValueOrDefault();
        }
        return sum;
    }
    public static double? Sum(this IEnumerable<double?> source)
    {
        Check(source, "source");
        double sum = 0;
        foreach (double? value in source)
            if (value.HasValue)
                sum += value.GetValueOrDefault();
        return sum;
    }
    public static long? Sum(this IEnumerable<long?> source)
    {
        Check(source, "source");
        long sum = 0;
        checked
        {
            foreach (long? value in source)
                if (value.HasValue)
                    sum += value.GetValueOrDefault();
        }
        return sum;
    }
    public static decimal? Sum(this IEnumerable<decimal?> source)
    {
        Check(source, "source");
        decimal sum = 0;
        foreach (decimal? value in source)
            if (value.HasValue)
                sum += value.GetValueOrDefault();
        return sum;
    }
    public static int Sum<TSource>(this IEnumerable<TSource> source, Func<TSource, int> selector) => Sum(Select(source, selector));
    public static long Sum<TSource>(this IEnumerable<TSource> source, Func<TSource, long> selector) => Sum(Select(source, selector));
    public static double Sum<TSource>(this IEnumerable<TSource> source, Func<TSource, double> selector) => Sum(Select(source, selector));
    public static float Sum<TSource>(this IEnumerable<TSource> source, Func<TSource, float> selector) => Sum(Select(source, selector));
    public static decimal Sum<TSource>(this IEnumerable<TSource> source, Func<TSource, decimal> selector) => Sum(Select(source, selector));
    public static int? Sum<TSource>(this IEnumerable<TSource> source, Func<TSource, int?> selector) => Sum(Select(source, selector));
    public static double? Sum<TSource>(this IEnumerable<TSource> source, Func<TSource, double?> selector) => Sum(Select(source, selector));
    public static double Average(this IEnumerable<int> source)
    {
        Check(source, "source");
        long sum = 0;
        long count = 0;
        checked
        {
            foreach (int value in source)
            {
                sum += value;
                count++;
            }
        }
        if (count == 0)
            throw NoElements();
        return (double)sum / count;
    }
    public static double Average(this IEnumerable<long> source)
    {
        Check(source, "source");
        long sum = 0;
        long count = 0;
        checked
        {
            foreach (long value in source)
            {
                sum += value;
                count++;
            }
        }
        if (count == 0)
            throw NoElements();
        return (double)sum / count;
    }
    public static double Average(this IEnumerable<double> source)
    {
        Check(source, "source");
        double sum = 0;
        long count = 0;
        foreach (double value in source)
        {
            sum += value;
            count++;
        }
        if (count == 0)
            throw NoElements();
        return sum / count;
    }
    public static float Average(this IEnumerable<float> source)
    {
        Check(source, "source");
        double sum = 0;
        long count = 0;
        foreach (float value in source)
        {
            sum += value;
            count++;
        }
        if (count == 0)
            throw NoElements();
        return (float)(sum / count);
    }
    public static decimal Average(this IEnumerable<decimal> source)
    {
        Check(source, "source");
        decimal sum = 0;
        long count = 0;
        foreach (decimal value in source)
        {
            sum += value;
            count++;
        }
        if (count == 0)
            throw NoElements();
        return sum / count;
    }
    public static double? Average(this IEnumerable<int?> source)
    {
        Check(source, "source");
        long sum = 0;
        long count = 0;
        foreach (int? value in source)
        {
            if (value.HasValue)
            {
                sum += value.GetValueOrDefault();
                count++;
            }
        }
        if (count == 0)
            return null;
        return (double)sum / count;
    }
    public static double? Average(this IEnumerable<double?> source)
    {
        Check(source, "source");
        double sum = 0;
        long count = 0;
        foreach (double? value in source)
        {
            if (value.HasValue)
            {
                sum += value.GetValueOrDefault();
                count++;
            }
        }
        if (count == 0)
            return null;
        return sum / count;
    }
    public static double Average<TSource>(this IEnumerable<TSource> source, Func<TSource, int> selector) => Average(Select(source, selector));
    public static double Average<TSource>(this IEnumerable<TSource> source, Func<TSource, long> selector) => Average(Select(source, selector));
    public static double Average<TSource>(this IEnumerable<TSource> source, Func<TSource, double> selector) => Average(Select(source, selector));
    public static float Average<TSource>(this IEnumerable<TSource> source, Func<TSource, float> selector) => Average(Select(source, selector));
    public static decimal Average<TSource>(this IEnumerable<TSource> source, Func<TSource, decimal> selector) => Average(Select(source, selector));
    public static double? Average<TSource>(this IEnumerable<TSource> source, Func<TSource, int?> selector) => Average(Select(source, selector));
    public static double? Average<TSource>(this IEnumerable<TSource> source, Func<TSource, double?> selector) => Average(Select(source, selector));

    // Min and Max: the default comparer; null values are skipped and an
    // empty sequence of a reference or nullable type gives null.
    public static TSource Min<TSource>(this IEnumerable<TSource> source) => Min(source, (IComparer<TSource>)null);
    public static TSource Min<TSource>(this IEnumerable<TSource> source, IComparer<TSource> comparer) => Extreme(source, comparer, -1);
    public static TSource Max<TSource>(this IEnumerable<TSource> source) => Max(source, (IComparer<TSource>)null);
    public static TSource Max<TSource>(this IEnumerable<TSource> source, IComparer<TSource> comparer) => Extreme(source, comparer, 1);
    private static TSource Extreme<TSource>(IEnumerable<TSource> source, IComparer<TSource> comparer, int sign)
    {
        Check(source, "source");
        comparer ??= Comparer<TSource>.Default;
        TSource value = default(TSource);
        if (value == null)
        {
            foreach (TSource item in source)
            {
                if (item == null)
                    continue;
                if (value == null || comparer.Compare(item, value) * sign > 0)
                    value = item;
            }
            return value;
        }
        bool found = false;
        foreach (TSource item in source)
        {
            if (!found)
            {
                value = item;
                found = true;
            }
            else if (comparer.Compare(item, value) * sign > 0)
            {
                value = item;
            }
        }
        if (!found)
            throw NoElements();
        return value;
    }
    public static double Min(this IEnumerable<double> source)
    {
        Check(source, "source");
        bool found = false;
        double value = 0;
        foreach (double item in source)
        {
            if (!found)
            {
                value = item;
                found = true;
                if (double.IsNaN(value))
                    return value;
            }
            else if (item < value)
            {
                value = item;
            }
            else if (double.IsNaN(item))
            {
                return item;
            }
        }
        if (!found)
            throw NoElements();
        return value;
    }
    public static double Max(this IEnumerable<double> source)
    {
        Check(source, "source");
        bool found = false;
        double value = 0;
        foreach (double item in source)
        {
            if (!found)
            {
                value = item;
                found = true;
            }
            else if (item > value || double.IsNaN(value))
            {
                value = item;
            }
        }
        if (!found)
            throw NoElements();
        return value;
    }
    public static TResult Min<TSource, TResult>(this IEnumerable<TSource> source, Func<TSource, TResult> selector) => Min(Select(source, selector));
    public static TResult Max<TSource, TResult>(this IEnumerable<TSource> source, Func<TSource, TResult> selector) => Max(Select(source, selector));
    public static int Min<TSource>(this IEnumerable<TSource> source, Func<TSource, int> selector) => Min(Select(source, selector));
    public static int Max<TSource>(this IEnumerable<TSource> source, Func<TSource, int> selector) => Max(Select(source, selector));
    public static long Min<TSource>(this IEnumerable<TSource> source, Func<TSource, long> selector) => Min(Select(source, selector));
    public static long Max<TSource>(this IEnumerable<TSource> source, Func<TSource, long> selector) => Max(Select(source, selector));
    public static double Min<TSource>(this IEnumerable<TSource> source, Func<TSource, double> selector) => Min(Select(source, selector));
    public static double Max<TSource>(this IEnumerable<TSource> source, Func<TSource, double> selector) => Max(Select(source, selector));
    public static decimal Min<TSource>(this IEnumerable<TSource> source, Func<TSource, decimal> selector) => Min(Select(source, selector));
    public static decimal Max<TSource>(this IEnumerable<TSource> source, Func<TSource, decimal> selector) => Max(Select(source, selector));
    public static TSource MinBy<TSource, TKey>(this IEnumerable<TSource> source, Func<TSource, TKey> keySelector) => ExtremeBy(source, keySelector, null, -1);
    public static TSource MinBy<TSource, TKey>(this IEnumerable<TSource> source, Func<TSource, TKey> keySelector, IComparer<TKey> comparer) =>
        ExtremeBy(source, keySelector, comparer, -1);
    public static TSource MaxBy<TSource, TKey>(this IEnumerable<TSource> source, Func<TSource, TKey> keySelector) => ExtremeBy(source, keySelector, null, 1);
    public static TSource MaxBy<TSource, TKey>(this IEnumerable<TSource> source, Func<TSource, TKey> keySelector, IComparer<TKey> comparer) =>
        ExtremeBy(source, keySelector, comparer, 1);
    private static TSource ExtremeBy<TSource, TKey>(IEnumerable<TSource> source, Func<TSource, TKey> keySelector, IComparer<TKey> comparer, int sign)
    {
        Check(source, "source");
        Check(keySelector, "keySelector");
        comparer ??= Comparer<TKey>.Default;
        using (var e = source.GetEnumerator())
        {
            if (!e.MoveNext())
            {
                if (default(TSource) == null)
                    return default(TSource);
                throw NoElements();
            }
            TSource value = e.Current;
            TKey key = keySelector(value);
            while (e.MoveNext())
            {
                TSource item = e.Current;
                TKey itemKey = keySelector(item);
                if (key == null || (itemKey != null && comparer.Compare(itemKey, key) * sign > 0))
                {
                    if (itemKey == null && key == null)
                        continue;
                    value = item;
                    key = itemKey;
                }
            }
            return value;
        }
    }
}

// The result of OrderBy and ThenBy: the keys of all levels are computed
// once; equal keys keep the order of the source.
internal abstract class OrderedEnumerable<TElement> : IOrderedEnumerable<TElement>
{
    internal IEnumerable<TElement> _source;
    internal OrderedEnumerable<TElement> _parent;
    internal abstract Comparison<int> Comparison(TElement[] items, Comparison<int> next);
    public IOrderedEnumerable<TElement> CreateOrderedEnumerable<TKey>(Func<TElement, TKey> keySelector, IComparer<TKey> comparer, bool descending)
    {
        if (keySelector == null)
            throw new ArgumentNullException("keySelector");
        return new OrderedEnumerable<TElement, TKey>(_source, this, keySelector, comparer, descending);
    }
    public IEnumerator<TElement> GetEnumerator()
    {
        TElement[] items = Enumerable.ToArray(_source);
        int[] map = new int[items.Length];
        for (int i = 0; i < map.Length; i++)
            map[i] = i;
        Comparison<int> comparison = Comparison(items, (a, b) => a - b);
        Array.Sort(map, comparison);
        for (int i = 0; i < map.Length; i++)
            yield return items[map[i]];
    }
    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
}

internal sealed class OrderedEnumerable<TElement, TKey> : OrderedEnumerable<TElement>
{
    private readonly Func<TElement, TKey> _keySelector;
    private readonly IComparer<TKey> _comparer;
    private readonly bool _descending;
    internal OrderedEnumerable(IEnumerable<TElement> source, OrderedEnumerable<TElement> parent, Func<TElement, TKey> keySelector,
        IComparer<TKey> comparer, bool descending)
    {
        _source = source;
        _parent = parent;
        _keySelector = keySelector;
        _comparer = comparer ?? Comparer<TKey>.Default;
        _descending = descending;
    }
    internal override Comparison<int> Comparison(TElement[] items, Comparison<int> next)
    {
        TKey[] keys = new TKey[items.Length];
        for (int i = 0; i < items.Length; i++)
            keys[i] = _keySelector(items[i]);
        IComparer<TKey> comparer = _comparer;
        bool descending = _descending;
        Comparison<int> own = (a, b) =>
        {
            int order = comparer.Compare(keys[a], keys[b]);
            if (order != 0)
                return descending ? (order > 0 ? -1 : 1) : order;
            return next(a, b);
        };
        return _parent == null ? own : _parent.Comparison(items, own);
    }
}

public class Lookup<TKey, TElement> : ILookup<TKey, TElement>
{
    private readonly Dictionary<TKey, Grouping<TKey, TElement>> _groups;
    private readonly List<Grouping<TKey, TElement>> _order = new List<Grouping<TKey, TElement>>();
    private Grouping<TKey, TElement> _nullGroup;
    private Lookup(IEqualityComparer<TKey> comparer) { _groups = new Dictionary<TKey, Grouping<TKey, TElement>>(comparer); }
    internal static Lookup<TKey, TElement> Create<TSource>(IEnumerable<TSource> source, Func<TSource, TKey> keySelector,
        Func<TSource, TElement> elementSelector, IEqualityComparer<TKey> comparer)
    {
        var lookup = new Lookup<TKey, TElement>(comparer);
        foreach (TSource item in source)
            lookup.GetGrouping(keySelector(item), true).Add(elementSelector(item));
        return lookup;
    }
    internal Grouping<TKey, TElement> GetGrouping(TKey key, bool create)
    {
        if (key == null)
        {
            if (_nullGroup == null && create)
            {
                _nullGroup = new Grouping<TKey, TElement>(key);
                _order.Add(_nullGroup);
            }
            return _nullGroup;
        }
        if (_groups.TryGetValue(key, out var group))
            return group;
        if (!create)
            return null;
        group = new Grouping<TKey, TElement>(key);
        _groups.Add(key, group);
        _order.Add(group);
        return group;
    }
    internal IEnumerable<TElement> Find(TKey key) => (IEnumerable<TElement>)GetGrouping(key, false) ?? Array.Empty<TElement>();
    public int Count => _order.Count;
    public IEnumerable<TElement> this[TKey key] => Find(key);
    public bool Contains(TKey key) => GetGrouping(key, false) != null;
    public IEnumerator<IGrouping<TKey, TElement>> GetEnumerator()
    {
        foreach (var group in _order)
            yield return group;
    }
    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
}

public class Grouping<TKey, TElement> : IGrouping<TKey, TElement>, IList<TElement>
{
    private readonly TKey _key;
    private readonly List<TElement> _elements = new List<TElement>();
    internal Grouping(TKey key) { _key = key; }
    internal void Add(TElement element) => _elements.Add(element);
    public TKey Key => _key;
    public IEnumerator<TElement> GetEnumerator() => _elements.GetEnumerator();
    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
    public int Count => _elements.Count;
    public bool IsReadOnly => true;
    public TElement this[int index]
    {
        get => _elements[index];
        set => throw new NotSupportedException("Specified method is not supported.");
    }
    void ICollection<TElement>.Add(TElement item) => throw new NotSupportedException("Specified method is not supported.");
    public void Clear() => throw new NotSupportedException("Specified method is not supported.");
    public bool Contains(TElement item) => _elements.Contains(item);
    public void CopyTo(TElement[] array, int arrayIndex) => _elements.CopyTo(array, arrayIndex);
    public bool Remove(TElement item) => throw new NotSupportedException("Specified method is not supported.");
    public int IndexOf(TElement item) => _elements.IndexOf(item);
    public void Insert(int index, TElement item) => throw new NotSupportedException("Specified method is not supported.");
    public void RemoveAt(int index) => throw new NotSupportedException("Specified method is not supported.");
}
`);
})(globalThis);
