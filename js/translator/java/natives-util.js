// Java: the native methods of java.util - sorting and copying arrays.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Java = T.java;
    Java.natives = Java.natives || {};
    if (Java.natives['java.util.Arrays'])
        return;

    var i64 = T.i64;
    var natives = Java.natives;

    function rt() {
        return Java.rt;
    }

    function rangeCheck(length, from, to) {
        if (from > to)
            throw rt().exception('java.lang.IllegalArgumentException', 'fromIndex(' + from + ') > toIndex(' + to + ')');
        if (from < 0)
            throw rt().exception('java.lang.ArrayIndexOutOfBoundsException', 'Array index out of range: ' + from);
        if (to > length)
            throw rt().exception('java.lang.ArrayIndexOutOfBoundsException', 'Array index out of range: ' + to);
    }

    // A stable merge sort of a part of an array (V4 does not promise a
    // stable sort).
    function mergeSort(array, from, to, compare) {
        var length = to - from;
        if (length < 2)
            return;
        var items = Array.prototype.slice.call(array, from, to);
        var buffer = new Array(length);
        // Insertion sort for runs of 16.
        var run = 16;
        for (var start = 0; start < length; start += run) {
            var end = Math.min(start + run, length);
            for (var position = start + 1; position < end; ++position) {
                var value = items[position];
                var slot = position - 1;
                while (slot >= start && compare(items[slot], value) > 0) {
                    items[slot + 1] = items[slot];
                    --slot;
                }
                items[slot + 1] = value;
            }
        }
        for (var width = run; width < length; width *= 2) {
            for (var left = 0; left < length; left += 2 * width) {
                var middle = Math.min(left + width, length), right = Math.min(left + 2 * width, length);
                var leftIndex = left, rightIndex = middle, outIndex = left;
                if (middle >= right || compare(items[middle - 1], items[middle]) <= 0) {
                    for (; outIndex < right; ++outIndex)
                        buffer[outIndex] = items[outIndex];
                    continue;
                }
                while (leftIndex < middle && rightIndex < right)
                    buffer[outIndex++] = compare(items[leftIndex], items[rightIndex]) <= 0
                        ? items[leftIndex++]
                        : items[rightIndex++];
                while (leftIndex < middle)
                    buffer[outIndex++] = items[leftIndex++];
                while (rightIndex < right)
                    buffer[outIndex++] = items[rightIndex++];
            }
            var swap = items;
            items = buffer;
            buffer = swap;
        }
        for (var index = 0; index < length; ++index)
            array[from + index] = items[index];
    }
    Java.mergeSort = mergeSort;

    // The natural order: Comparable, otherwise a ClassCastException.
    function naturalCompare(left, right) {
        var runtime = rt();
        var comparable = runtime.byName('java.lang.Comparable');
        if (!runtime.is(left, comparable))
            throw runtime.castError(runtime.className(left), 'java.lang.Comparable');
        return runtime.compare(left, right);
    }
    Java.naturalCompare = naturalCompare;

    function comparatorFunction(comparator) {
        if (comparator === null || comparator === undefined)
            return naturalCompare;
        var compare = comparator.compare$2;
        return function (left, right) { return compare.call(comparator, left, right); };
    }
    Java.comparatorFunction = comparatorFunction;

    // Primitives: typed arrays sort as numbers (NaN at the end, -0.0 before
    // 0.0, as in Java); long is a hybrid of numbers and Int64.
    function sortPrimitive(array, from, to) {
        if (Array.isArray(array)) {
            mergeSort(array, from, to, i64.cmp);
            return;
        }
        // V4 typed arrays have no sort.
        var items = Array.prototype.slice.call(array, from, to);
        items.sort(primitiveOrder);
        for (var index = 0; index < items.length; ++index)
            array[from + index] = items[index];
    }

    // The Java order of numbers: -0.0 before 0.0, NaN at the end.
    function primitiveOrder(left, right) {
        if (left < right)
            return -1;
        if (left > right)
            return 1;
        if (left !== left)
            return right !== right ? 0 : 1;
        if (right !== right)
            return -1;
        if (left === 0 && right === 0)
            return (1 / left < 0 ? -1 : 0) - (1 / right < 0 ? -1 : 0);
        return 0;
    }

    function copyOf(original, length) {
        if (length < 0)
            throw rt().exception('java.lang.NegativeArraySizeException', String(length));
        var descriptor = rt().arrayDescriptor(original);
        var result = rt().newArray(descriptor, [length]);
        var count = Math.min(length, original.length);
        for (var index = 0; index < count; ++index)
            result[index] = original[index];
        return result;
    }

    function copyOfRange(original, from, to) {
        if (from > to)
            throw rt().exception('java.lang.IllegalArgumentException', from + ' > ' + to);
        if (from < 0 || from > original.length)
            throw rt().exception('java.lang.ArrayIndexOutOfBoundsException', 'Array index out of range: ' + from);
        var result = rt().newArray(rt().arrayDescriptor(original), [to - from]);
        var count = Math.min(to, original.length) - from;
        for (var index = 0; index < count; ++index)
            result[index] = original[from + index];
        return result;
    }

    var arrays = {};
    ['int', 'long', 'short', 'char', 'byte', 'boolean', 'float', 'double', 'Object'].forEach(function (type) {
        arrays['copyOf(' + type + '[],int)'] = copyOf;
        arrays['copyOfRange(' + type + '[],int,int)'] = copyOfRange;
        if (type === 'boolean')
            return;
        if (type === 'Object') {
            arrays['sort(Object[])'] = function (array) { mergeSort(rt().nonNull(array), 0, array.length, naturalCompare); };
            arrays['sort(Object[],int,int)'] = function (array, from, to) {
                rangeCheck(rt().nonNull(array).length, from, to);
                mergeSort(array, from, to, naturalCompare);
            };
            arrays['sort(Object[],Comparator)'] = function (array, comparator) {
                mergeSort(rt().nonNull(array), 0, array.length, comparatorFunction(comparator));
            };
            arrays['sort(Object[],int,int,Comparator)'] = function (array, from, to, comparator) {
                rangeCheck(rt().nonNull(array).length, from, to);
                mergeSort(array, from, to, comparatorFunction(comparator));
            };
            return;
        }
        arrays['sort(' + type + '[])'] = function (array) { sortPrimitive(rt().nonNull(array), 0, array.length); };
        arrays['sort(' + type + '[],int,int)'] = function (array, from, to) {
            rangeCheck(rt().nonNull(array).length, from, to);
            sortPrimitive(array, from, to);
        };
    });
    // copyOf(U[], n, Class<? extends T[]>): an array of the required type.
    arrays['copyOf(Object[],int,Class)'] = function (original, length, type) {
        var result = rt().newArray(type.$info.name, [length]);
        var count = Math.min(length, original.length);
        for (var index = 0; index < count; ++index)
            result[index] = original[index];
        return result;
    };
    natives['java.util.Arrays'] = arrays;
})(globalThis);
