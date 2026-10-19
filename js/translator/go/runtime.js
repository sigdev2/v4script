// Go: running the translated code - slices, maps, interfaces and type
// descriptions, panics and defer, channels on fibers, fmt formatting.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Go = T.go = T.go || {};
    if (Go.runtime)
        return;

    var utf8 = T.utf8;
    var i64 = T.i64, u64 = T.u64;
    var rt = {};
    Go.runtime = rt;

    // --- Panics

    // A Go panic: value is an interface value (what was passed to panic).
    function GoPanic(value, message) {
        T.LanguageError.call(this, message, value);
        this.goValue = value;
        this.recovered = false;
    }
    GoPanic.prototype = Object.create(T.LanguageError.prototype);
    rt.GoPanic = GoPanic;

    // A run-time error (runtime.Error): the value is an error with the text.
    function RuntimeError(text) {
        this.text = text;
    }
    RuntimeError.prototype.Error = function () { return utf8.encode('runtime error: ' + this.text); };
    RuntimeError.prototype.RuntimeError = function () {};

    rt.runtimeError = function (text) {
        var error = new RuntimeError(text);
        error.$t = rt.runtimeErrorType;
        return new GoPanic(error, 'panic: runtime error: ' + text);
    };

    rt.panic = function (value) {
        return new GoPanic(value, 'panic: ' + rt.panicText(value));
    };

    // The text of a panic as Go prints it: error and Stringer give their
    // text, strings in quotes with the type for named types.
    rt.panicText = function (value) {
        if (value === null)
            return 'nil';
        var desc = rt.typeOf(value);
        var unwrapped = rt.valueOf(value);
        if (rt.hasMethod(value, 'Error'))
            return utf8.decode(rt.callMethod(value, 'Error'));
        if (rt.hasMethod(value, 'String') && desc.kind !== 'string')
            return utf8.decode(rt.callMethod(value, 'String'));
        if (desc.kind === 'string')
            return desc.named ? desc.str + '(' + T.quote(utf8.decode(unwrapped)) + ')' : utf8.decode(unwrapped);
        var text = rt.format(desc, unwrapped, 'v', {});
        if (desc.kind !== 'string' && desc.kind !== 'struct' && desc.kind !== 'ptr' && desc.kind !== 'slice' &&
            desc.kind !== 'map')
            text = desc.str + '(' + text + ')';
        return utf8.decode(text);
    };

    rt.indexError = function (index, length) {
        return rt.runtimeError('index out of range [' + i64.str(index) + '] with length ' + length);
    };

    rt.divideByZero = function () {
        throw rt.runtimeError('integer divide by zero');
    };

    rt.nilMap = function () {
        throw rt.panic(rt.boxString('assignment to entry in nil map'));
    };

    // Any JavaScript error inside Go code is a panic.
    rt.toPanic = function (error) {
        if (error instanceof GoPanic)
            return error;
        if (error instanceof RangeError && /call stack/.test(String(error.message))) {
            var overflow = new GoPanic(null, 'runtime: goroutine stack exceeds limit\nfatal error: stack overflow');
            overflow.stack = error.stack;
            overflow.fatal = true;
            return overflow;
        }
        if (error instanceof TypeError && /null|undefined/.test(String(error.message))) {
            var nilError = rt.runtimeError('invalid memory address or nil pointer dereference');
            nilError.stack = error.stack;
            return nilError;
        }
        if (error instanceof T.LanguageError || (error !== null && typeof error === 'object' && error.goExit))
            return error;
        var other = new GoPanic(null, 'panic: ' + (error && error.message !== undefined ? error.name + ': ' + error.message : String(error)));
        if (error && error.stack)
            other.stack = error.stack;
        other.jsError = error;
        return other;
    };

    // --- defer and recover

    rt.deferFrame = function () {
        return { list: [], panic: null };
    };

    var deferring = [];

    // Runs the deferred calls in reverse order; recover() inside them stops
    // the panic of the frame. A panic left after them goes further.
    rt.runDefers = function (frame) {
        while (frame.list.length > 0) {
            var call = frame.list.pop();
            deferring.push(frame);
            try {
                call();
            } catch (error) {
                // A panic in a deferred call replaces the earlier one.
                frame.panic = rt.toPanic(error);
            } finally {
                deferring.pop();
            }
        }
        if (frame.panic !== null)
            throw frame.panic;
    };

    // The same for a fiber: a deferred call may wait.
    rt.runDefersAsync = function* (frame) {
        while (frame.list.length > 0) {
            var call = frame.list.pop();
            deferring.push(frame);
            try {
                var result = call();
                if (T.isGenerator(result))
                    yield* result;
            } catch (error) {
                frame.panic = rt.toPanic(error);
            } finally {
                deferring.pop();
            }
        }
        if (frame.panic !== null)
            throw frame.panic;
    };

    rt.recover = function () {
        var frame = deferring.length > 0 ? deferring[deferring.length - 1] : null;
        if (frame === null || frame.panic === null)
            return null;
        var panic = frame.panic;
        frame.panic = null;
        if (panic.fatal)
            throw panic;
        return panic.goValue !== undefined ? panic.goValue : null;
    };

    // A run of a unit starts from a clean state.
    rt.reset = function () {
        deferring = [];
    };

    // --- Type descriptions
    //
    // The translator creates a description (desc) from a checked type; the
    // code gets it as a constant. kind: int8...uint64, int, uint, uintptr,
    // float32, float64, string, bool, slice, array, map, chan, func, ptr,
    // struct, iface, unsafe. Named ones: named, name, pkg; methods - methods.

    function Box(value) {
        this.v = value;
    }
    rt.Box = Box;

    // The box class for values of the type desc in an interface: the
    // methods of the type are called on the box.
    rt.makeBox = function (desc) {
        var box = function (value) { this.v = value; };
        box.prototype = Object.create(Box.prototype);
        box.prototype.$t = desc;
        box.prototype.constructor = box;
        return box;
    };

    rt.typeOf = function (value) {
        return value === null ? null : value.$t;
    };

    rt.valueOf = function (value) {
        return value instanceof Box ? value.v : value;
    };

    rt.hasMethod = function (value, name) {
        return value !== null && typeof value[name] === 'function' && !(name in Object.prototype);
    };

    rt.callMethod = function (value, name) {
        return value[name]();
    };

    // Whether the type has all methods of the interface.
    rt.implements = function (desc, ifaceDesc) {
        var names = ifaceDesc.methodNames;
        var set = desc.methodSet || {};
        for (var index = 0; index < names.length; ++index) {
            if (set[names[index]] !== true)
                return false;
        }
        return true;
    };

    // x.(T): T is a concrete type or an interface.
    rt.assert = function (value, desc, ifaceStr) {
        var dynamic = rt.typeOf(value);
        if (desc.kind === 'iface') {
            if (dynamic !== null && rt.implements(dynamic, desc))
                return value;
            throw rt.assertError(value, desc, ifaceStr);
        }
        if (dynamic === desc)
            return rt.valueOf(value);
        throw rt.assertError(value, desc, ifaceStr);
    };

    rt.assert2 = function (value, desc) {
        var dynamic = rt.typeOf(value);
        if (desc.kind === 'iface')
            return dynamic !== null && rt.implements(dynamic, desc) ? [value, true] : [null, false];
        if (dynamic === desc)
            return [rt.valueOf(value), true];
        return [desc.zero(), false];
    };

    rt.assertError = function (value, desc, ifaceStr) {
        var dynamic = rt.typeOf(value);
        var text = 'interface conversion: ' + (ifaceStr || 'interface {}') + ' is ' + (dynamic === null ? 'nil' : dynamic.str) +
            ', not ' + desc.str;
        if (desc.kind === 'iface' && dynamic !== null) {
            var missing = desc.methodNames.filter(function (name) { return !(dynamic.methodSet || {})[name]; });
            text = 'interface conversion: ' + dynamic.str + ' is not ' + desc.str + ': missing method ' + missing[0];
        }
        var panic = new GoPanic(null, 'panic: ' + text);
        var error = new RuntimeError(text);
        error.Error = function () { return utf8.encode(text); };
        error.$t = rt.runtimeErrorType;
        panic.goValue = error;
        return panic;
    };

    // Equality of values of the type desc (==).
    rt.equal = function (desc, left, right) {
        switch (desc.kind) {
        case 'int':
        case 'int64':
        case 'uint':
        case 'uint64':
        case 'uintptr':
            return i64.eq(left, right);
        case 'struct':
            return left.$eq(right);
        case 'array':
            for (var index = 0; index < left.length; ++index) {
                if (!rt.equal(desc.elem, left[index], right[index]))
                    return false;
            }
            return true;
        case 'iface':
            return rt.ifaceEqual(left, right);
        case 'ptr':
            return rt.pointerEqual(left, right);
        case 'slice':
        case 'map':
        case 'func':
            throw rt.runtimeError('comparing uncomparable type ' + desc.str);
        }
        return left === right;
    };

    rt.ifaceEqual = function (left, right) {
        if (left === right)
            return true;
        if (left === null || right === null)
            return false;
        var leftType = left.$t, rightType = right.$t;
        if (leftType !== rightType)
            return false;
        if (!leftType.comparable)
            throw rt.runtimeError('comparing uncomparable type ' + leftType.str);
        return rt.equal(leftType, rt.valueOf(left), rt.valueOf(right));
    };

    rt.pointerEqual = function (left, right) {
        if (left === right)
            return true;
        if (left === null || right === null)
            return false;
        // Pointers to a field or an element are equal if they point to the same place.
        return left.$same !== undefined && left.$same(right);
    };

    // --- Pointers to variables, fields and elements

    function Cell(value) {
        this.v = value;
    }
    rt.Cell = Cell;

    function FieldRef(object, name) {
        this.o = object;
        this.k = name;
    }
    Object.defineProperty(FieldRef.prototype, 'v', {
        get: function () { return this.o[this.k]; },
        set: function (value) { this.o[this.k] = value; }
    });
    FieldRef.prototype.$same = function (other) {
        return other instanceof FieldRef && other.o === this.o && other.k === this.k;
    };
    rt.fieldRef = function (object, name) {
        if (object === null)
            throw rt.runtimeError('invalid memory address or nil pointer dereference');
        return new FieldRef(object, name);
    };
    rt.elemRef = function (array, index) {
        return new FieldRef(array, index);
    };

    // --- Slices

    function Slice(array, offset, length, capacity) {
        this.a = array;
        this.o = offset;
        this.n = length;
        this.c = capacity;
    }
    rt.Slice = Slice;
    // The nil slice: one for all, nobody changes it.
    var NIL = new Slice(null, 0, 0, 0);
    rt.NIL = NIL;

    rt.slice = function (array) {
        return new Slice(array, 0, array.length, array.length);
    };

    rt.makeSlice = function (length, capacity, zero) {
        length = toIndex(length, 'len');
        capacity = capacity === undefined ? length : toIndex(capacity, 'cap');
        if (capacity < length)
            throw rt.runtimeError('makeslice: cap out of range');
        var array = new Array(capacity);
        fill(array, 0, capacity, zero);
        return new Slice(array, 0, length, capacity);
    };

    function fill(array, start, end, zero) {
        if (typeof zero === 'function') {
            for (var index = start; index < end; ++index)
                array[index] = zero();
        } else {
            for (var position = start; position < end; ++position)
                array[position] = zero;
        }
    }

    function toIndex(value, what) {
        if (typeof value !== 'number' || value < 0)
            throw rt.runtimeError('makeslice: ' + what + ' out of range');
        if (value > 100000000)
            throw rt.runtimeError('makeslice: ' + what + ' out of range');
        return value;
    }

    rt.oob = function (index, length) {
        throw rt.indexError(index, length);
    };

    // s[low:high:max]
    rt.reslice = function (slice, low, high, max) {
        var capacity = slice.c;
        if (low === undefined || low === null)
            low = 0;
        if (high === undefined || high === null)
            high = slice.n;
        if (max === undefined || max === null)
            max = capacity;
        checkSliceBounds(low, high, max, capacity, slice.a === null);
        if (slice.a === null)
            return NIL;
        return new Slice(slice.a, slice.o + low, high - low, max - low);
    };

    function checkSliceBounds(low, high, max, capacity) {
        if (typeof max !== 'number' || max < 0 || max > capacity)
            throw rt.runtimeError('slice bounds out of range [::' + i64.str(max) + '] with capacity ' + capacity);
        if (typeof high !== 'number' || high < 0 || high > max)
            throw rt.runtimeError('slice bounds out of range [:' + i64.str(high) + '] with capacity ' + capacity);
        if (typeof low !== 'number' || low < 0 || low > high)
            throw rt.runtimeError('slice bounds out of range [' + i64.str(low) + ':' + i64.str(high) + ']');
    }

    // a[low:high:max] of an array.
    rt.sliceArray = function (array, low, high, max) {
        if (low === undefined || low === null)
            low = 0;
        if (high === undefined || high === null)
            high = array.length;
        if (max === undefined || max === null)
            max = array.length;
        checkSliceBounds(low, high, max, array.length);
        return new Slice(array, low, high - low, max - low);
    };

    rt.sliceString = function (slice, low, high) {
        if (low === undefined || low === null)
            low = 0;
        if (high === undefined || high === null)
            high = slice.length;
        if (typeof high !== 'number' || high < 0 || high > slice.length)
            throw rt.runtimeError('slice bounds out of range [:' + i64.str(high) + '] with length ' + slice.length);
        if (typeof low !== 'number' || low < 0 || low > high)
            throw rt.runtimeError('slice bounds out of range [' + i64.str(low) + ':' + i64.str(high) + ']');
        return slice.substring(low, high);
    };

    rt.toArray = function (slice) {
        if (slice.a === null)
            return [];
        return slice.a.slice(slice.o, slice.o + slice.n);
    };

    // Capacity growth as in Go: double (from 256 by a quarter), then up to
    // the size class of the memory allocation - so cap() in a program
    // matches Go.
    var SIZE_CLASSES = [0, 8, 16, 24, 32, 48, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240, 256, 288, 320, 352,
                        384, 416, 448, 480, 512, 576, 640, 704, 768, 896, 1024, 1152, 1280, 1408, 1536, 1792, 2048, 2304,
                        2688, 3072, 3200, 3456, 4096, 4864, 5376, 6144, 6528, 6784, 6912, 8192, 9472, 9728, 10240, 10880,
                        12288, 13568, 14336, 16384, 18432, 19072, 20480, 21760, 24576, 27264, 28672, 32768];

    function roundUpSize(size) {
        if (size <= 32768) {
            for (var index = 0; index < SIZE_CLASSES.length; ++index) {
                if (SIZE_CLASSES[index] >= size)
                    return SIZE_CLASSES[index];
            }
        }
        return Math.ceil(size / 8192) * 8192;
    }

    function growCapacity(newLength, oldCapacity, elemSize) {
        var capacity = oldCapacity;
        var doubled = capacity + capacity;
        if (newLength > doubled) {
            capacity = newLength;
        } else if (oldCapacity < 256) {
            capacity = doubled;
        } else {
            while (capacity < newLength)
                capacity += (capacity + 768) >> 2;
        }
        if (!(elemSize > 0))
            return capacity;
        return Math.floor(roundUpSize(capacity * elemSize) / elemSize);
    }

    // append(s, values...): values - a JavaScript array, size - the element
    // size in bytes (for the capacity growth).
    rt.append = function (slice, values, size) {
        var count = values.length;
        if (count === 0)
            return slice;
        var length = slice.n;
        if (slice.a !== null && length + count <= slice.c) {
            for (var index = 0; index < count; ++index)
                slice.a[slice.o + length + index] = values[index];
            return new Slice(slice.a, slice.o, length + count, slice.c);
        }
        var capacity = growCapacity(length + count, slice.c, size);
        var array = new Array(capacity);
        for (var position = 0; position < length; ++position)
            array[position] = slice.a[slice.o + position];
        for (var valueIndex = 0; valueIndex < count; ++valueIndex)
            array[length + valueIndex] = values[valueIndex];
        for (var spare = length + count; spare < capacity; ++spare)
            array[spare] = 0;
        return new Slice(array, 0, length + count, capacity);
    };

    // One element - without an intermediate array.
    rt.append1 = function (slice, value, size) {
        var length = slice.n;
        if (slice.a !== null && length < slice.c) {
            slice.a[slice.o + length] = value;
            return new Slice(slice.a, slice.o, length + 1, slice.c);
        }
        return rt.append(slice, [value], size);
    };

    rt.appendSlice = function (slice, other, size) {
        return rt.append(slice, rt.toArray(other), size);
    };

    rt.appendString = function (slice, text) {
        var bytes = [];
        for (var index = 0; index < text.length; ++index)
            bytes.push(text.charCodeAt(index));
        return rt.append(slice, bytes, 1);
    };

    rt.copy = function (dst, src) {
        var count = Math.min(dst.n, src.n);
        if (count === 0)
            return 0;
        // An overlap within one array: copy from the right end.
        if (dst.a === src.a && dst.o > src.o) {
            for (var index = count - 1; index >= 0; --index)
                dst.a[dst.o + index] = src.a[src.o + index];
        } else {
            for (var position = 0; position < count; ++position)
                dst.a[dst.o + position] = src.a[src.o + position];
        }
        return count;
    };

    rt.copyString = function (dst, text) {
        var count = Math.min(dst.n, text.length);
        for (var index = 0; index < count; ++index)
            dst.a[dst.o + index] = text.charCodeAt(index);
        return count;
    };

    rt.clearSlice = function (slice, zero) {
        for (var index = 0; index < slice.n; ++index)
            slice.a[slice.o + index] = typeof zero === 'function' ? zero() : zero;
    };

    // A copy of an array value (nested structs and arrays too).
    rt.copyArray = function (array, elemCopy) {
        if (elemCopy === null)
            return array.slice();
        var copy = new Array(array.length);
        for (var index = 0; index < array.length; ++index)
            copy[index] = elemCopy(array[index]);
        return copy;
    };

    // Assigns an array in place: pointers to it stay valid.
    rt.setArray = function (target, source, elemCopy) {
        for (var index = 0; index < target.length; ++index)
            target[index] = elemCopy === null ? source[index] : elemCopy(source[index]);
        return target;
    };

    // --- Strings

    rt.runeString = function (rune) {
        if (typeof rune !== 'number')
            rune = 0xFFFD;
        return utf8.encodeRune(rune);
    };

    rt.bytesToString = function (slice) {
        var text = '';
        for (var start = 0; start < slice.n; start += 4096) {
            var end = Math.min(slice.n, start + 4096);
            text += String.fromCharCode.apply(null, slice.a.slice(slice.o + start, slice.o + end));
        }
        return text;
    };

    rt.stringToBytes = function (text) {
        var array = new Array(text.length);
        for (var index = 0; index < text.length; ++index)
            array[index] = text.charCodeAt(index);
        return rt.slice(array);
    };

    rt.stringToRunes = function (text) {
        var runes = [];
        for (var index = 0; index < text.length;) {
            var rune = utf8.decodeRune(text, index);
            runes.push(rune[0]);
            index += rune[1];
        }
        return rt.slice(runes);
    };

    rt.runesToString = function (slice) {
        var bytes = [];
        for (var index = 0; index < slice.n; ++index)
            utf8.appendRune(bytes, slice.a[slice.o + index]);
        return utf8.fromBytes(bytes);
    };

    rt.decodeRune = utf8.decodeRune;

    rt.stringIndex = function (text, index) {
        if (typeof index !== 'number' || index < 0 || index >= text.length)
            throw rt.indexError(index, text.length);
        return text.charCodeAt(index);
    };

    rt.boxString = function (text) {
        return new rt.types.string.box(utf8.encode(text));
    };

    // --- Maps
    //
    // A JavaScript Map by a primitive key: numbers, strings and booleans as
    // they are, everything else by a string key (desc.key). Entries are
    // [key, value].

    function GoMap(keyFn) {
        this.m = new Map();
        this.keyFn = keyFn;
    }
    rt.GoMap = GoMap;

    rt.makeMap = function (keyFn) {
        return new GoMap(keyFn);
    };

    rt.mapGet = function (map, key, zero) {
        if (map === null)
            return typeof zero === 'function' ? zero() : zero;
        var entry = map.m.get(map.keyFn === null ? key : map.keyFn(key));
        if (entry === undefined)
            return typeof zero === 'function' ? zero() : zero;
        return entry[1];
    };

    rt.mapGet2 = function (map, key, zero) {
        if (map === null)
            return [typeof zero === 'function' ? zero() : zero, false];
        var entry = map.m.get(map.keyFn === null ? key : map.keyFn(key));
        if (entry === undefined)
            return [typeof zero === 'function' ? zero() : zero, false];
        return [entry[1], true];
    };

    rt.mapSet = function (map, key, value) {
        if (map === null)
            rt.nilMap();
        var mapKey = map.keyFn === null ? key : map.keyFn(key);
        var entry = map.m.get(mapKey);
        if (entry !== undefined)
            entry[1] = value;
        else
            map.m.set(mapKey, [key, value]);
    };

    // m[k] op= v - a store in place (a struct value changes in place).
    rt.mapEntry = function (map, key, zero) {
        if (map === null)
            rt.nilMap();
        var mapKey = map.keyFn === null ? key : map.keyFn(key);
        var entry = map.m.get(mapKey);
        if (entry === undefined) {
            entry = [key, typeof zero === 'function' ? zero() : zero];
            map.m.set(mapKey, entry);
        }
        return entry;
    };

    rt.mapDelete = function (map, key) {
        if (map === null)
            return;
        map.m.delete(map.keyFn === null ? key : map.keyFn(key));
    };

    rt.mapLen = function (map) {
        return map === null ? 0 : map.m.size;
    };

    rt.mapClear = function (map) {
        if (map !== null)
            map.m.clear();
    };

    // Entries for range: a snapshot (deletion and insertion during the
    // iteration are allowed).
    rt.mapEntries = function (map) {
        if (map === null)
            return [];
        var entries = [];
        map.m.forEach(function (entry) { entries.push(entry); });
        return entries;
    };

    // The key of a value for a map by the description of the key type.
    rt.keyFunction = function (desc) {
        switch (desc.kind) {
        case 'string':
        case 'bool':
        case 'int8':
        case 'int16':
        case 'int32':
        case 'uint8':
        case 'uint16':
        case 'uint32':
            return null;
        case 'float32':
        case 'float64':
            // -0 and 0 are one key; NaN is not equal to itself (each one is new).
            return function (value) { return value === 0 ? 0 : (value !== value ? {} : value); };
        case 'int':
        case 'int64':
        case 'uint':
        case 'uint64':
        case 'uintptr':
            return i64.key;
        case 'ptr':
        case 'chan':
            return null;
        }
        return function (value) { return rt.keyString(desc, value); };
    };

    var objectIds = new WeakMap();
    var nextObjectId = 1;
    function objectId(object) {
        var id = objectIds.get(object);
        if (id === undefined) {
            id = nextObjectId++;
            objectIds.set(object, id);
        }
        return id;
    }

    rt.keyString = function (desc, value) {
        switch (desc.kind) {
        case 'string':
            return 's' + value;
        case 'bool':
            return value ? 't' : 'f';
        case 'struct':
            return '{' + desc.fields.map(function (field) {
                return rt.keyString(field.desc, value[field.js]);
            }).join(',') + '}';
        case 'array':
            return '[' + value.map(function (item) { return rt.keyString(desc.elem, item); }).join(',') + ']';
        case 'iface': {
            if (value === null)
                return 'nil';
            var dynamic = value.$t;
            if (!dynamic.comparable)
                throw rt.runtimeError('hash of unhashable type ' + dynamic.str);
            return dynamic.id + ':' + rt.keyString(dynamic, rt.valueOf(value));
        }
        case 'ptr':
        case 'chan':
            return value === null ? 'nil' : 'p' + objectId(value);
        case 'float32':
        case 'float64':
            return 'n' + (value === 0 ? 0 : value);
        }
        if (typeof value === 'object' && value !== null)
            return 'n' + i64.key(value);
        return 'n' + value;
    };

    // --- Channels

    function Chan(capacity) {
        this.capacity = capacity;
        this.buffer = [];
        this.closed = false;
        this.senders = [];     // [{ fiber, value, select }]
        this.receivers = [];   // [{ fiber, select }]
    }
    rt.Chan = Chan;

    rt.makeChan = function (capacity) {
        if (typeof capacity !== 'number' || capacity < 0)
            throw rt.panic(rt.boxString('makechan: size out of range'));
        return new Chan(capacity || 0);
    };

    function scheduler() {
        return rt.scheduler;
    }

    // A waiter from the queue that no other select has woken yet.
    function takeWaiter(queue) {
        while (queue.length > 0) {
            var waiter = queue.shift();
            if (waiter.select === undefined || !waiter.select.done)
                return waiter;
        }
        return null;
    }

    function wake(waiter, value) {
        if (waiter.select !== undefined) {
            waiter.select.done = true;
            waiter.select.result = [waiter.index, value === undefined ? null : value[0], value === undefined ? false : value[1]];
        }
        scheduler().wakeUp(waiter.fiber, value);
    }

    // A send without a wait: true - it succeeded.
    function trySend(ch, value) {
        if (ch.closed)
            throw rt.panic(rt.boxString('send on closed channel'));
        var receiver = takeWaiter(ch.receivers);
        if (receiver !== null) {
            wake(receiver, [value, true]);
            return true;
        }
        if (ch.buffer.length < ch.capacity) {
            ch.buffer.push(value);
            return true;
        }
        return false;
    }

    // A receive without a wait: [value, ok] or null.
    function tryReceive(ch, zero) {
        if (ch.buffer.length > 0) {
            var value = ch.buffer.shift();
            var sender = takeWaiter(ch.senders);
            if (sender !== null) {
                ch.buffer.push(sender.value);
                wake(sender, undefined);
            }
            return [value, true];
        }
        var waiting = takeWaiter(ch.senders);
        if (waiting !== null) {
            wake(waiting, undefined);
            return [waiting.value, true];
        }
        if (ch.closed)
            return [typeof zero === 'function' ? zero() : zero, false];
        return null;
    }

    rt.send = function* (ch, value) {
        if (ch === null) {
            scheduler().park();
            yield;
            return;
        }
        if (trySend(ch, value))
            return;
        var fiber = scheduler().park();
        ch.senders.push({ fiber: fiber, value: value });
        yield;
        if (ch.closedWhileWaiting && fiber.closedSend) {
            fiber.closedSend = false;
            throw rt.panic(rt.boxString('send on closed channel'));
        }
    };

    rt.recv2 = function* (ch, zero) {
        if (ch === null) {
            scheduler().park();
            yield;
            return [zero, false];
        }
        var got = tryReceive(ch, zero);
        if (got !== null)
            return got;
        var fiber = scheduler().park();
        ch.receivers.push({ fiber: fiber });
        var result = yield;
        if (result === undefined)
            return [typeof zero === 'function' ? zero() : zero, false];
        return result;
    };

    rt.recv = function* (ch, zero) {
        var result = yield* rt.recv2(ch, zero);
        return result[0];
    };

    rt.close = function (ch) {
        if (ch === null)
            throw rt.panic(rt.boxString('close of nil channel'));
        if (ch.closed)
            throw rt.panic(rt.boxString('close of closed channel'));
        ch.closed = true;
        var receiver;
        while ((receiver = takeWaiter(ch.receivers)) !== null)
            wake(receiver, [ch.zero !== undefined ? ch.zero : null, false]);
        var sender;
        while ((sender = takeWaiter(ch.senders)) !== null) {
            sender.fiber.closedSend = true;
            ch.closedWhileWaiting = true;
            wake(sender, undefined);
        }
    };

    rt.chanLen = function (ch) {
        return ch === null ? 0 : ch.buffer.length;
    };

    rt.chanCap = function (ch) {
        return ch === null ? 0 : ch.capacity;
    };

    // select: cases - [{ send: true, ch, value } | { ch, zero }]; the result
    // is [the case number (-1 - default), value, ok].
    rt.select = function* (cases, hasDefault) {
        var order = [];
        for (var index = 0; index < cases.length; ++index)
            order.push(index);
        // A random order of the ready ones, as in Go.
        for (var position = order.length - 1; position > 0; --position) {
            var other = Math.floor(Math.random() * (position + 1));
            var swap = order[position];
            order[position] = order[other];
            order[other] = swap;
        }
        for (var orderIndex = 0; orderIndex < order.length; ++orderIndex) {
            var item = cases[order[orderIndex]];
            if (item.ch === null)
                continue;
            if (item.send) {
                if (trySend(item.ch, item.value))
                    return [order[orderIndex], null, false];
            } else {
                var got = tryReceive(item.ch, item.zero);
                if (got !== null)
                    return [order[orderIndex], got[0], got[1]];
            }
        }
        if (hasDefault)
            return [-1, null, false];
        var fiber = scheduler().park();
        var state = { done: false, result: null };
        cases.forEach(function (item, caseIndex) {
            if (item.ch === null)
                return;
            if (item.send)
                item.ch.senders.push({ fiber: fiber, value: item.value, select: state, index: caseIndex });
            else
                item.ch.receivers.push({ fiber: fiber, select: state, index: caseIndex });
        });
        yield;
        var result = state.result;
        if (result[2] === false && !cases[result[0]].send) {
            var zero = cases[result[0]].zero;
            result[1] = typeof zero === 'function' ? zero() : zero;
        }
        return result;
    };

    // A call of a function value from plain code: a generator (a fiber)
    // runs at once.
    rt.sync = function (value) {
        if (T.isGenerator(value))
            return scheduler().runNested(value);
        return value;
    };

    rt.go = function (generator) {
        scheduler().spawn(generator, 'goroutine');
    };

    rt.sleep = function* (duration) {
        var milliseconds = typeof duration === 'number' ? duration / 1e6 : i64.toFloat(duration) / 1e6;
        if (!(milliseconds > 0)) {
            yield;
            return;
        }
        scheduler().sleep(milliseconds);
        yield;
    };

    // --- Default values and copies

    rt.zero = function (desc) {
        return desc.zero();
    };

    rt.nilPointerCheck = function (value) {
        if (value === null)
            throw rt.runtimeError('invalid memory address or nil pointer dereference');
        return value;
    };

    // --- Calls

    // x.M without a call: a function with the receiver x.
    rt.bindMethod = function (receiver, name) {
        if (receiver === null)
            throw rt.runtimeError('invalid memory address or nil pointer dereference');
        var method = receiver[name];
        return function () { return method.apply(receiver, arguments); };
    };

    rt.bindStatic = function (method, receiver) {
        return function () {
            var args = [receiver];
            for (var index = 0; index < arguments.length; ++index)
                args.push(arguments[index]);
            return method.apply(null, args);
        };
    };

    // T.M and (*T).M: a function whose first argument is the receiver.
    rt.methodOfStruct = function (name, copy) {
        return function (receiver) {
            var rest = Array.prototype.slice.call(arguments, 1);
            var target = copy ? receiver.$copy() : receiver;
            return target[name].apply(target, rest);
        };
    };

    rt.methodOfValue = function (method, deref) {
        return function (receiver) {
            var args = [deref ? receiver.v : receiver];
            for (var index = 1; index < arguments.length; ++index)
                args.push(arguments[index]);
            return method.apply(null, args);
        };
    };

    rt.methodOfInterface = function (name) {
        return function (receiver) {
            return receiver[name].apply(receiver, Array.prototype.slice.call(arguments, 1));
        };
    };

    rt.doPanic = function (value) {
        throw rt.panic(value);
    };

    // go f(x): the function and the arguments are evaluated now.
    rt.goCall = function (self, fn, args) {
        scheduler().spawn((function* () {
            var result = fn.apply(self, args);
            if (T.isGenerator(result))
                yield* result;
        })(), 'goroutine');
    };

    rt.deferCall = function (frame, self, fn, args) {
        frame.list.push(function () { return fn.apply(self, args); });
    };

    // An error as an error value (for natives).
    rt.errorValue = function (text) {
        var error = { Error: function () { return utf8.encode(text); } };
        error.$t = rt.runtimeErrorType;
        return error;
    };

    // The built-in print and println: as in Go - floats as +1.500000e+000.
    function builtinText(value) {
        if (value === null)
            return 'nil';
        var desc = value.$t;
        var unwrapped = rt.valueOf(value);
        switch (desc.kind) {
        case 'string':
            return unwrapped;
        case 'bool':
            return unwrapped ? 'true' : 'false';
        case 'float32':
        case 'float64': {
            if (unwrapped !== unwrapped)
                return 'NaN';
            if (unwrapped === Infinity || unwrapped === -Infinity)
                return unwrapped > 0 ? '+Inf' : '-Inf';
            var text = T.numbers.exponential(unwrapped, 6, true, 3, false);
            return unwrapped >= 0 && text.charAt(0) !== '-' ? '+' + text : text;
        }
        case 'iface':
            return '(0x0,0x0)';
        }
        if (desc.kind === 'ptr' || desc.kind === 'map' || desc.kind === 'chan' || desc.kind === 'func' ||
            desc.kind === 'slice')
            return '0x' + rt.fakeAddress(unwrapped);
        if (typeof unwrapped === 'number' || unwrapped instanceof i64.Int64)
            return (desc.kind.charAt(0) === 'u' ? u64 : i64).str(unwrapped);
        return String(unwrapped);
    }

    rt.builtinPrint = function (values) {
        rt.env.out.write(utf8.decode(values.map(builtinText).join('')));
    };

    rt.builtinPrintln = function (values) {
        rt.env.out.write(utf8.decode(values.map(builtinText).join(' ') + '\n'));
    };

    rt.minString = function () {
        var result = arguments[0];
        for (var index = 1; index < arguments.length; ++index) {
            if (arguments[index] < result)
                result = arguments[index];
        }
        return result;
    };

    rt.maxString = function () {
        var result = arguments[0];
        for (var index = 1; index < arguments.length; ++index) {
            if (arguments[index] > result)
                result = arguments[index];
        }
        return result;
    };

    rt.minWide = function (unsigned) {
        var compare = unsigned ? u64.cmp : i64.cmp;
        var result = arguments[1];
        for (var index = 2; index < arguments.length; ++index) {
            if (compare(arguments[index], result) < 0)
                result = arguments[index];
        }
        return result;
    };

    rt.maxWide = function (unsigned) {
        var compare = unsigned ? u64.cmp : i64.cmp;
        var result = arguments[1];
        for (var index = 2; index < arguments.length; ++index) {
            if (compare(arguments[index], result) > 0)
                result = arguments[index];
        }
        return result;
    };

    // [N]T(s): a copy of the first N elements.
    rt.sliceToArray = function (slice, length) {
        if (slice.n < length)
            throw rt.runtimeError('cannot convert slice with length ' + slice.n + ' to array or pointer to array with length ' + length);
        return slice.a === null ? [] : slice.a.slice(slice.o, slice.o + length);
    };

    // The value of a unit for the console: as %v.
    rt.formatResultOf = function (value) {
        if (value === null)
            return '<nil>';
        return rt.formatResult(value.$t, rt.valueOf(value));
    };

    // --- Integers: checks

    rt.shiftCount = function (count) {
        // A negative shift panics; a huge one acts as 64+.
        if (typeof count === 'number') {
            if (count < 0)
                throw rt.runtimeError('negative shift amount');
            return count;
        }
        if (count.hi < 0)
            throw rt.runtimeError('negative shift amount');
        return 1000;
    };
})(globalThis);
