// C#: the run time of the translated code ($cs) - types at run time
// (classes, structs, interfaces, enums, delegates, constructed generic
// types, arrays), type tests and casts, boxing, defaults and copies of
// structs, arrays, delegates, exceptions, lazy static constructors.
// Fibers (async, threads) are in runtime-tasks.js. See
// docs/internals/csharp.md.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    if (CS.Runtime)
        return;

    var i64 = T.i64, u64 = T.u64;

    function Runtime(session) {
        this.session = session;
        // Types: id -> constructor; byName - by the full name of the run time.
        this.K = Object.create(null);
        this.byName = Object.create(null);
        this.hashSeed = 0x2545F491;
        this.arrayTypes = Object.create(null);
    }
    CS.Runtime = Runtime;

    // A type by its full name (System.Collections.Generic.List`1): library
    // types are translated at the first use.
    Runtime.prototype.type = function (name) {
        var found = this.byName[name];
        if (found === undefined) {
            this.session.loadLibraryType(name);
            found = this.byName[name];
        }
        if (found === undefined)
            throw new Error('C# runtime type is missing: ' + name);
        return found;
    };

    // A library type before translation: the first read of $K.id (or
    // byName) translates it.
    Runtime.prototype.lazyType = function (id, name, load) {
        function lazy(table, key) {
            var getter = function () {
                load();
                var descriptor = Object.getOwnPropertyDescriptor(table, key);
                if (descriptor === undefined || descriptor.get === getter)
                    throw new Error('C# runtime type is missing: ' + name);
                return descriptor.value;
            };
            Object.defineProperty(table, key, { get: getter, configurable: true, enumerable: true });
        }
        if (Object.prototype.hasOwnProperty.call(this.K, id))
            return;
        lazy(this.K, id);
        lazy(this.byName, name);
    };

    function setValue(table, key, value) {
        Object.defineProperty(table, key, { value: value, writable: true, configurable: true, enumerable: true });
    }

    // --- Types

    // A type: a constructor with the metadata of the run time.
    // meta: { name (full name), kind (class, struct, interface, enum,
    // delegate), generic (the number of type parameters of a definition),
    // mutable (a struct that needs copies), primitive (values are
    // JavaScript numbers, booleans, strings), simpleName, flags, ... }.
    // fields(self) initializes the instance fields (the base ones first).
    Runtime.prototype.defineType = function (id, meta, fields, base, interfaces) {
        var self = this;
        var ctor = function () {
            if (ctor.$lazy === true)
                ctor.$run();
            ctor.$fields(this);
        };
        if (base !== null)
            ctor.prototype = Object.create(base.prototype);
        else
            ctor.prototype = meta.kind === 'interface' ? Object.create(null) : {};
        Object.defineProperty(ctor.prototype, 'constructor', { value: ctor, writable: true, configurable: true });
        ctor.$id = id;
        ctor.$name = meta.name;
        ctor.$meta = meta;
        ctor.$kind = meta.kind;
        ctor.$base = base;
        ctor.$ifaces = interfaces || [];
        ctor.$fields = fields || (base !== null && base.$fields !== undefined ? base.$fields : function () {});
        ctor.$struct = meta.kind === 'struct' || meta.kind === 'enum';
        ctor.$mutable = !!meta.mutable;
        ctor.$primitive = !!meta.primitive;
        ctor.$inst = meta.generic > 0 ? new Map() : null;
        ctor.$args = null;
        ctor.$def = null;
        // The keys of the types this one converts to: computed at the first test.
        ctor.$is = null;
        ctor.$runtime = self;
        setValue(this.K, id, ctor);
        if (meta.generic === 0 || meta.generic === undefined)
            setValue(this.byName, meta.name, ctor);
        else
            setValue(this.byName, meta.name, ctor);
        return ctor;
    };

    // After the methods: the members of interfaces go into the prototype
    // under the names of the interfaces. aliases: [interface member name,
    // implementing member name]; default methods of interfaces are copied
    // when the class has no own implementation.
    Runtime.prototype.finishType = function (ctor, aliases) {
        var proto = ctor.prototype;
        var all = [];
        var base = ctor.$base;
        if (base !== null && base.$aliases !== undefined)
            all = base.$aliases.slice();
        (aliases || []).forEach(function (pair) {
            // Static members of interfaces: on the type itself, not inherited.
            if (pair[2] === true) {
                ctor[pair[0]] = ctor[pair[1]];
                return;
            }
            all = all.filter(function (other) { return other[0] !== pair[0]; });
            all.push(pair);
        });
        ctor.$aliases = all;
        all.forEach(function (pair) {
            var fn = proto[pair[1]];
            if (typeof fn === 'function')
                proto[pair[0]] = fn;
        });
        // Default interface methods.
        var queue = ctor.$ifaces.slice();
        var seen = [];
        while (queue.length > 0) {
            var iface = queue.shift();
            if (seen.indexOf(iface) >= 0)
                continue;
            seen.push(iface);
            var ifaceProto = iface.prototype;
            Object.keys(ifaceProto).forEach(function (name) {
                if (typeof ifaceProto[name] === 'function' && !(name in proto))
                    proto[name] = ifaceProto[name];
            });
            queue = queue.concat(iface.$ifaces || []);
        }
        if (ctor.$meta.install !== undefined)
            this.installPrimitive(ctor, ctor.$meta.install);
        return ctor;
    };

    // The methods of Int32, Boolean, String, Array, Delegate on the
    // prototypes of JavaScript values: calls through object and
    // interfaces work on them as on other objects. Not enumerable.
    Runtime.prototype.installPrimitive = function (ctor, kind) {
        var targets;
        switch (kind) {
        case 'number':
            targets = [Number.prototype];
            break;
        case 'boolean':
            targets = [Boolean.prototype];
            break;
        case 'string':
            targets = [String.prototype];
            break;
        case 'array':
            targets = [Array.prototype, Object.getPrototypeOf(Int8Array.prototype), MultiArray.prototype];
            break;
        case 'function':
            targets = [Function.prototype];
            break;
        default:
            return;
        }
        var names = [];
        for (var proto = ctor.prototype; proto !== null && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
            Object.getOwnPropertyNames(proto).forEach(function (name) {
                if (name !== 'constructor' && /\$/.test(name) && names.indexOf(name) < 0)
                    names.push(name);
            });
        }
        targets.forEach(function (target) {
            names.forEach(function (name) {
                var value = ctor.prototype[name];
                if (typeof value !== 'function')
                    return;
                Object.defineProperty(target, name, { value: value, writable: true, configurable: true, enumerable: false });
            });
        });
        ctor.$installed = targets;
    };

    // --- Generic types

    // A constructed type: Def<args>. The prototype inherits from the
    // definition; $ta$<id> are the type arguments of every generic class
    // in the hierarchy (the methods of List<T> read this.$ta$List[0]).
    Runtime.prototype.inst = function (def, args) {
        var key = '';
        for (var index = 0; index < args.length; ++index)
            key += (index > 0 ? ',' : '') + this.typeKey(args[index]);
        var found = def.$inst.get(key);
        if (found !== undefined)
            return found;
        var self = this;
        var ctor = function () {
            if (ctor.$lazy === true)
                ctor.$run();
            ctor.$fields(this);
        };
        ctor.prototype = Object.create(def.prototype);
        Object.defineProperty(ctor.prototype, 'constructor', { value: ctor, writable: true, configurable: true });
        ctor.$id = def.$id + '<' + key + '>';
        ctor.$name = def.$name;
        ctor.$meta = def.$meta;
        ctor.$kind = def.$kind;
        ctor.$def = def;
        ctor.$args = args;
        ctor.$fields = def.$fields;
        ctor.$struct = def.$struct;
        ctor.$mutable = def.$mutable;
        ctor.$primitive = def.$primitive;
        ctor.$inst = null;
        ctor.$is = null;
        ctor.$runtime = self;
        def.$inst.set(key, ctor);
        ctor.prototype['$ta$' + def.$id] = args;
        ctor.prototype['$ct$' + def.$id] = ctor;
        // The supertypes with their arguments: their $ta come along.
        var supers = def.$supers !== undefined ? def.$supers.apply(null, args) : { base: def.$base, ifaces: def.$ifaces };
        ctor.$base = supers.base;
        ctor.$ifaces = supers.ifaces;
        if (supers.base !== null && supers.base !== undefined && supers.base.$def !== null) {
            for (var proto = supers.base.prototype; proto !== null && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
                Object.getOwnPropertyNames(proto).forEach(function (name) {
                    if ((name.indexOf('$ta$') === 0 || name.indexOf('$ct$') === 0) && !Object.prototype.hasOwnProperty.call(ctor.prototype, name))
                        ctor.prototype[name] = proto[name];
                });
            }
        }
        (supers.ifaces || []).forEach(function (iface) {
            if (iface.$def !== null)
                ctor.prototype['$ta$' + iface.$def.$id] = iface.$args;
        });
        // Statics of a generic type are per constructed type: their default
        // values first, then the initializers.
        Object.keys(def).forEach(function (name) {
            if (name.indexOf('s$') === 0 && typeof def[name] !== 'function') {
                var value = def[name];
                ctor[name] = value !== null && typeof value === 'object' && typeof value.$copy === 'function' ? value.$copy() : value;
            }
        });
        if (def.$staticsOf !== undefined)
            def.$staticsOf(ctor, args);
        return ctor;
    };

    // A unique key of a type of the run time.
    Runtime.prototype.typeKey = function (type) {
        return type.$id;
    };

    // T[] and T[,]: one descriptor per element type and rank.
    Runtime.prototype.arrayType = function (elem, rank) {
        rank = rank || 1;
        var key = elem.$id + '[' + rank + ']';
        var found = this.arrayTypes[key];
        if (found !== undefined)
            return found;
        var type = function () {};
        type.$id = key;
        type.$kind = 'array';
        type.$elem = elem;
        type.$rank = rank;
        type.$name = elem.$name + '[' + new Array(rank).join(',') + ']';
        type.$struct = false;
        type.$primitive = false;
        type.$mutable = false;
        type.$args = null;
        type.$def = null;
        type.$is = null;
        type.$runtime = this;
        type.$base = this.type('System.Array');
        type.$ifaces = [];
        this.arrayTypes[key] = type;
        return type;
    };

    // --- Type tests

    // The type of a value at run time.
    Runtime.prototype.typeOf = function (value) {
        switch (typeof value) {
        case 'number':
            return this.type('System.Int32');
        case 'string':
            return this.type('System.String');
        case 'boolean':
            return this.type('System.Boolean');
        case 'function':
            return value.$t !== undefined ? value.$t : this.type('System.Delegate');
        case 'object':
            if (value === null)
                return null;
            if (value.$t !== undefined)
                return value.$t;
            if (value.constructor !== undefined && value.constructor.$kind !== undefined)
                return value.constructor;
            if (Array.isArray(value) || ArrayBuffer.isView(value))
                return this.arrayType(this.type('System.Object'), 1);
            return this.type('V4Script.JsValue');
        }
        return null;
    };

    // The set of keys of the types a type converts to (classes, interfaces).
    Runtime.prototype.supertypeKeys = function (type) {
        if (type.$is !== null)
            return type.$is;
        var keys = Object.create(null);
        var self = this;
        (function add(current) {
            if (current === null || current === undefined || keys[current.$id] === true)
                return;
            keys[current.$id] = true;
            add(current.$base);
            (current.$ifaces || []).forEach(add);
        })(type);
        if (type.$kind === 'array') {
            var elem = type.$elem;
            ['System.Collections.Generic.IEnumerable`1', 'System.Collections.Generic.ICollection`1', 'System.Collections.Generic.IList`1',
             'System.Collections.Generic.IReadOnlyCollection`1', 'System.Collections.Generic.IReadOnlyList`1'].forEach(function (name) {
                var def = self.type(name);
                keys[self.inst(def, [elem]).$id] = true;
            });
            ['System.Collections.IEnumerable', 'System.Collections.ICollection', 'System.Collections.IList',
             'System.ICloneable', 'System.Array', 'System.Object'].forEach(function (name) {
                keys[self.type(name).$id] = true;
            });
        }
        type.$is = keys;
        return keys;
    };

    // The value is an instance of the type (null is not).
    Runtime.prototype.is = function (value, type) {
        if (value === null || value === undefined)
            return false;
        var actual = this.typeOf(value);
        if (actual === type)
            return true;
        if (type.$kind === 'array') {
            if (actual.$kind !== 'array' || actual.$rank !== type.$rank)
                return false;
            // Covariance of arrays of references.
            return actual.$elem === type.$elem || (!actual.$elem.$struct && !type.$elem.$struct &&
                                                   this.isAssignable(actual.$elem, type.$elem));
        }
        return this.isAssignable(actual, type);
    };

    // A value of type from fits a variable of type to (with variance).
    Runtime.prototype.isAssignable = function (from, to) {
        if (from === to)
            return true;
        var keys = this.supertypeKeys(from);
        if (keys[to.$id] === true)
            return true;
        if (to.$def !== null && to.$meta.variant) {
            var self = this;
            var found = false;
            Object.keys(keys).forEach(function (key) {
                if (found)
                    return;
                var candidate = self.typeByKey(from, key);
                if (candidate !== null && candidate.$def === to.$def && self.variantMatch(candidate, to))
                    found = true;
            });
            return found;
        }
        return false;
    };

    // A supertype of from by its key.
    Runtime.prototype.typeByKey = function (from, key) {
        var result = null;
        var seen = [];
        (function find(current) {
            if (result !== null || current === null || current === undefined || seen.indexOf(current) >= 0)
                return;
            seen.push(current);
            if (current.$id === key) {
                result = current;
                return;
            }
            find(current.$base);
            (current.$ifaces || []).forEach(find);
        })(from);
        return result;
    };

    Runtime.prototype.variantMatch = function (from, to) {
        var variance = to.$meta.variance || [];
        for (var index = 0; index < to.$args.length; ++index) {
            var source = from.$args[index], target = to.$args[index];
            if (source === target)
                continue;
            if (variance[index] === 'out' && !source.$struct && this.isAssignable(source, target))
                continue;
            if (variance[index] === 'in' && !target.$struct && this.isAssignable(target, source))
                continue;
            return false;
        }
        return true;
    };

    // (T)value for a reference type: InvalidCastException if it is not one.
    Runtime.prototype.cast = function (value, type) {
        if (value === null || value === undefined || this.is(value, type))
            return value;
        throw this.castError(value, type);
    };

    Runtime.prototype.castError = function (value, type) {
        return this.exception('System.InvalidCastException', "Unable to cast object of type '" + this.typeName(this.typeOf(value)) +
                              "' to type '" + this.typeName(type) + "'.");
    };

    // value as T.
    Runtime.prototype.as = function (value, type) {
        return this.is(value, type) ? value : null;
    };

    // The full name of a type as .NET writes it: System.Int32,
    // System.Collections.Generic.List`1[System.Int32], Outer+Inner.
    Runtime.prototype.typeName = function (type) {
        if (type === null || type === undefined)
            return '';
        if (type.$kind === 'array')
            return this.typeName(type.$elem) + '[' + new Array(type.$rank).join(',') + ']';
        if (type.$args !== null && type.$args !== undefined && type.$def !== null) {
            var self = this;
            return type.$name + '[' + type.$args.map(function (arg) { return self.typeName(arg); }).join(',') + ']';
        }
        return type.$name;
    };

    // --- Values of types

    // default(T)
    Runtime.prototype.defaultOf = function (type) {
        if (type.$default !== undefined)
            return type.$default();
        if (type.$kind === 'enum')
            return 0;
        if (type.$kind === 'struct') {
            if (type.$def !== null && type.$def.$name === 'System.Nullable`1')
                return null;
            return new type();
        }
        return null;
    };

    // A copy of a struct value for a new variable (T in generic code).
    Runtime.prototype.copy = function (type, value) {
        return type.$mutable && value !== null && value !== undefined ? value.$copy() : value;
    };

    // Boxing: int, bool and string values are their own boxes; other
    // numbers and enums get a box of their type; structs are copied.
    Runtime.prototype.box = function (type, value) {
        if (value === null || value === undefined)
            return null;
        if (type.$box !== undefined)
            return type.$box(value);
        if (type.$kind === 'enum' || type.$primitive)
            return this.boxOf(type, value);
        if (type.$def !== null && type.$def.$name === 'System.Nullable`1')
            return this.box(type.$args[0], value);
        if (type.$mutable)
            return value.$copy();
        return value;
    };

    // The box constructor of a value type: its prototype forwards the
    // methods to the value.
    Runtime.prototype.boxOf = function (type, value) {
        var Box = type.$Box;
        if (Box === undefined) {
            Box = function (inner) {
                this.v = inner;
            };
            var proto = Box.prototype;
            var seen = Object.create(null);
            for (var source = type.prototype; source !== null && source !== Object.prototype; source = Object.getPrototypeOf(source)) {
                Object.getOwnPropertyNames(source).forEach(function (name) {
                    if (name === 'constructor' || seen[name] === true)
                        return;
                    seen[name] = true;
                    var method = source[name];
                    if (typeof method === 'function') {
                        proto[name] = function () {
                            return method.apply(this.v, arguments);
                        };
                    }
                });
            }
            proto.$t = type;
            proto.$boxed = true;
            type.$Box = Box;
        }
        return new Box(value);
    };

    // (T)object for a value type: InvalidCastException unless the box is
    // of exactly that type; null is a NullReferenceException.
    Runtime.prototype.unbox = function (type, value) {
        if (value === null || value === undefined) {
            if (type.$def !== null && type.$def.$name === 'System.Nullable`1')
                return null;
            throw this.nullReference();
        }
        if (type.$def !== null && type.$def.$name === 'System.Nullable`1')
            type = type.$args[0];
        var actual = this.typeOf(value);
        if (actual !== type) {
            if (!(type.$kind === 'enum' && actual.$kind === 'enum' && false))
                throw this.castError(value, type);
        }
        if (typeof value !== 'object')
            return value;
        if (value.$boxed === true)
            return value.v;
        return type.$mutable ? value.$copy() : value;
    };

    // (T)value in generic code: a cast to a reference type or an unboxing.
    Runtime.prototype.castTo = function (type, value) {
        if (type.$struct)
            return this.unbox(type, value);
        return this.cast(value, type);
    };

    // A value of type T as a variable of type object (generic code).
    Runtime.prototype.toObject = function (type, value) {
        return type.$struct || type.$primitive ? this.box(type, value) : value;
    };

    // --- Object methods on any value

    // ToString() of a value of a type known at run time.
    Runtime.prototype.str = function (type, value) {
        if (value === null || value === undefined)
            return '';
        if (type.$format !== undefined)
            return type.$format(value);
        if (type.$kind === 'enum')
            return this.enumName(type, value);
        if (type.$def !== null && type.$def.$name === 'System.Nullable`1')
            return this.str(type.$args[0], value);
        return this.objectString(value);
    };

    // ToString() of a value of type object.
    Runtime.prototype.objectString = function (value) {
        if (value === null || value === undefined)
            return '';
        switch (typeof value) {
        case 'string':
            return value;
        case 'number':
            return String(value);
        case 'boolean':
            return value ? 'True' : 'False';
        }
        if (typeof value.ToString$0 !== 'function')
            return CS.jsText(value);
        var text = value.ToString$0();
        return text === null || text === undefined ? '' : text;
    };

    // object.Equals(a, b): references, then the virtual Equals.
    Runtime.prototype.objectEquals = function (left, right) {
        if (left === right)
            return true;
        if (left === null || left === undefined || right === null || right === undefined)
            return false;
        return left.Equals$1(right);
    };

    // The identity hash of an object: pseudo-random, the same from run to run.
    Runtime.prototype.identityHash = function (object) {
        if (object.$hash === undefined) {
            var hash = this.hashSeed;
            hash ^= hash << 13;
            hash ^= hash >>> 17;
            hash ^= hash << 5;
            this.hashSeed = hash;
            Object.defineProperty(object, '$hash', { value: (hash >>> 1) & 0x3fffffff, enumerable: false });
        }
        return object.$hash;
    };

    // Equals, GetHashCode, CompareTo of values of a type known at run time
    // (EqualityComparer<T>.Default and Comparer<T>.Default use them).
    Runtime.prototype.equalsOf = function (type, left, right) {
        if (type.$equals !== undefined)
            return type.$equals(left, right);
        if (left === right)
            return true;
        if (left === null || left === undefined || right === null || right === undefined)
            return false;
        if (type.$primitive)
            return type.prototype.Equals$1.call(left, right);
        if (type.$struct)
            return left.Equals$1(this.box(type, right));
        return left.Equals$1(right);
    };

    Runtime.prototype.hashOf = function (type, value) {
        if (value === null || value === undefined)
            return 0;
        if (type.$hash !== undefined)
            return type.$hash(value);
        if (type.$primitive)
            return type.prototype.GetHashCode$0.call(value);
        return value.GetHashCode$0();
    };

    // --- Arrays

    // Typed arrays for numbers, plain ones for the rest; $t is the type.
    var TYPED = { 'System.SByte': Int8Array, 'System.Byte': Uint8Array, 'System.Int16': Int16Array,
                  'System.UInt16': Uint16Array, 'System.Char': Uint16Array, 'System.Int32': Int32Array,
                  'System.UInt32': Uint32Array, 'System.Single': Float32Array, 'System.Double': Float64Array };

    Runtime.prototype.newArray = function (elem, length) {
        if (typeof length !== 'number')
            length = i64.toFloat(length);
        if (length < 0)
            throw this.exception('System.OverflowException', 'Arithmetic operation resulted in an overflow.');
        var array;
        var Typed = elem.$kind === 'enum' ? (elem.$typed || null) : TYPED[elem.$name];
        if (Typed !== undefined && Typed !== null) {
            array = new Typed(length);
        } else {
            array = new Array(length);
            var value = this.defaultOf(elem);
            if (elem.$mutable || (elem.$struct && typeof value === 'object' && value !== null && elem.$kind === 'struct' &&
                                  elem.$def === null && value.constructor === elem)) {
                for (var index = 0; index < length; ++index)
                    array[index] = this.defaultOf(elem);
            } else {
                array.fill(value);
            }
        }
        array.$t = this.arrayType(elem, 1);
        return array;
    };

    // An array from the values of a list.
    Runtime.prototype.arrayOf = function (elem, items) {
        var Typed = elem.$kind === 'enum' ? (elem.$typed || null) : TYPED[elem.$name];
        var array;
        if (Typed !== undefined && Typed !== null) {
            array = new Typed(items.length);
            for (var index = 0; index < items.length; ++index)
                array[index] = items[index];
        } else {
            array = items;
        }
        array.$t = this.arrayType(elem, 1);
        return array;
    };

    // new int[2, 3]: the sizes and the values in rows.
    function MultiArray(type, dims, data) {
        this.$t = type;
        this.d = dims;
        this.a = data;
    }
    CS.MultiArray = MultiArray;

    Runtime.prototype.newMultiArray = function (elem, dims) {
        var total = 1;
        for (var index = 0; index < dims.length; ++index) {
            if (dims[index] < 0)
                throw this.exception('System.OverflowException', 'Arithmetic operation resulted in an overflow.');
            total *= dims[index];
        }
        var data = this.newArray(elem, total);
        return new MultiArray(this.arrayType(elem, dims.length), dims, data);
    };

    // The position of [i, j, ...] in the values.
    Runtime.prototype.multiIndex = function (array, indices) {
        var position = 0;
        for (var index = 0; index < indices.length; ++index) {
            var value = indices[index];
            if (!(value >= 0 && value < array.d[index]))
                throw this.indexError();
            position = position * array.d[index] + value;
        }
        return position;
    };

    Runtime.prototype.indexError = function () {
        return this.exception('System.IndexOutOfRangeException', 'Index was outside the bounds of the array.');
    };

    Runtime.prototype.throwIndex = function () {
        throw this.indexError();
    };

    // A copy of an array (Clone, ToArray).
    Runtime.prototype.cloneArray = function (array) {
        if (array instanceof MultiArray)
            return new MultiArray(array.$t, array.d.slice(), this.cloneArray(array.a));
        var copy = array.slice();
        copy.$t = array.$t;
        return copy;
    };

    // --- Delegates

    // A delegate of a method: a function that calls it on the target;
    // $target and $method for equality and -=.
    Runtime.prototype.delegate = function (type, target, method) {
        var fn = function () {
            return method.apply(target, arguments);
        };
        fn.$t = type;
        fn.$target = target;
        fn.$method = method;
        return fn;
    };

    // A lambda as a delegate of a type.
    Runtime.prototype.lambda = function (type, fn) {
        fn.$t = type;
        return fn;
    };

    // a + b: the invocation list of both; null + d is d.
    Runtime.prototype.combine = function (left, right) {
        if (left === null || left === undefined)
            return right;
        if (right === null || right === undefined)
            return left;
        var list = (left.$list || [left]).concat(right.$list || [right]);
        return this.multicast(left.$t || right.$t, list);
    };

    Runtime.prototype.multicast = function (type, list) {
        if (list.length === 0)
            return null;
        if (list.length === 1)
            return list[0];
        var fn = function () {
            var result;
            for (var index = 0; index < list.length; ++index)
                result = list[index].apply(this, arguments);
            return result;
        };
        fn.$t = type;
        fn.$list = list;
        return fn;
    };

    // a - b: the last occurrence of the list of b is removed.
    Runtime.prototype.removeDelegate = function (left, right) {
        if (left === null || left === undefined)
            return null;
        if (right === null || right === undefined)
            return left;
        var list = left.$list || [left];
        var remove = right.$list || [right];
        var self = this;
        for (var start = list.length - remove.length; start >= 0; --start) {
            var match = true;
            for (var index = 0; index < remove.length; ++index) {
                if (!self.delegateEquals(list[start + index], remove[index])) {
                    match = false;
                    break;
                }
            }
            if (match)
                return this.multicast(left.$t, list.slice(0, start).concat(list.slice(start + remove.length)));
        }
        return left;
    };

    Runtime.prototype.delegateEquals = function (left, right) {
        if (left === right)
            return true;
        if (left === null || left === undefined || right === null || right === undefined)
            return false;
        if (left.$list !== undefined || right.$list !== undefined) {
            var first = left.$list || [left], second = right.$list || [right];
            if (first.length !== second.length)
                return false;
            for (var index = 0; index < first.length; ++index) {
                if (!this.delegateEquals(first[index], second[index]))
                    return false;
            }
            return true;
        }
        return left.$method !== undefined && left.$method === right.$method && left.$target === right.$target;
    };

    // --- Enums

    // The name of an enum value; [Flags] - names joined by ", ".
    Runtime.prototype.enumName = function (type, value) {
        var meta = type.$meta;
        var names = meta.names, values = meta.values;
        var key = typeof value === 'number' ? value : i64.str(value);
        for (var index = 0; index < values.length; ++index) {
            if (values[index] === key)
                return names[index];
        }
        if (meta.flags && typeof value === 'number' && value !== 0) {
            var parts = [];
            var rest = value;
            // The largest flags first, written in ascending order.
            for (var position = values.length - 1; position >= 0; --position) {
                var flag = values[position];
                if (typeof flag === 'number' && flag !== 0 && (rest & flag) === flag) {
                    parts.unshift(names[position]);
                    rest &= ~flag;
                }
            }
            if (rest === 0 && parts.length > 0)
                return parts.join(', ');
        }
        return typeof value === 'number' ? String(value) : i64.str(value);
    };

    // --- Exceptions

    // A new exception of the library by its full name: the parameterless
    // constructor, then the message (the constructors with one string
    // differ: ArgumentNullException takes the name of a parameter).
    Runtime.prototype.exception = function (name, message, inner) {
        var type = this.type(name);
        var object = new type();
        object.$ctor$0();
        if (message !== undefined)
            object._message = message;
        if (inner !== undefined)
            object._innerException = inner;
        object.$fresh = false;
        object.stack = new Error('').stack;
        return object;
    };

    Runtime.prototype.nullReference = function () {
        return this.exception('System.NullReferenceException');
    };

    Runtime.prototype.throwNull = function () {
        throw this.nullReference();
    };

    Runtime.prototype.divideByZero = function () {
        throw this.exception('System.DivideByZeroException');
    };

    Runtime.prototype.overflow = function () {
        throw this.exception('System.OverflowException');
    };

    Runtime.prototype.isException = function (value) {
        if (value === null || typeof value !== 'object' || value.$t !== undefined)
            return false;
        var Exception = this.byName['System.Exception'];
        if (Exception === undefined)
            return false;
        var descriptor = Object.getOwnPropertyDescriptor(this.byName, 'System.Exception');
        if (descriptor.get !== undefined)
            return false;
        return value instanceof descriptor.value;
    };

    // throw e: the stack of the throw gives the line; throw null is a
    // NullReferenceException.
    Runtime.prototype.thrown = function (value) {
        if (value === null || value === undefined)
            return this.nullReference();
        if (value.$fresh !== false) {
            value.$fresh = false;
            value.stack = new Error('').stack;
        }
        return value;
    };

    // A JavaScript error in catch becomes an exception: TypeError is a
    // NullReferenceException; a stack overflow ends the program.
    Runtime.prototype.caught = function (error) {
        if (this.isException(error))
            return error;
        if (error instanceof CS.ProgramExit || error instanceof CS.FatalError)
            throw error;
        var converted;
        if (error instanceof TypeError) {
            converted = this.exception('System.NullReferenceException');
        } else if (error instanceof RangeError && /call stack|stack size|recursion|call depth/i.test(String(error.message))) {
            throw new CS.FatalError('Stack overflow.', error);
        } else if (error instanceof T.LanguageError) {
            throw error;
        } else {
            converted = this.exception('V4Script.JsException', error !== null && error !== undefined && error.message !== undefined
                ? String(error.name || 'Error') + ': ' + String(error.message) : String(error));
            converted.jsError = error;
        }
        if (error !== null && typeof error === 'object' && error.stack !== undefined)
            converted.stack = error.stack;
        return converted;
    };

    // Environment.Exit and a return code of the program.
    function ProgramExit(status) {
        this.status = status;
        this.message = 'exit status ' + status;
        this.stack = new Error(this.message).stack;
    }
    ProgramExit.prototype.toString = function () { return this.message; };
    CS.ProgramExit = ProgramExit;

    // An error that catch does not catch (a stack overflow).
    function FatalError(message, cause) {
        this.message = message;
        this.stack = cause && cause.stack ? cause.stack : new Error(message).stack;
    }
    FatalError.prototype.toString = function () { return this.message; };
    CS.FatalError = FatalError;

    // --- Static constructors

    // The statics of a type are initialized at the first use of the type:
    // its static fields are accessors and its static methods stubs until
    // then (C# 15.12: the static constructor runs once, before the first
    // access).
    Runtime.prototype.lazyStatics = function (ctor, fields, methods, init) {
        var values = Object.create(null);
        var originals = Object.create(null);
        var state = { done: false };
        var run = function () {
            if (state.done)
                return;
            state.done = true;
            ctor.$lazy = false;
            fields.forEach(function (name) {
                Object.defineProperty(ctor, name, { value: values[name], writable: true, configurable: true, enumerable: true });
            });
            methods.forEach(function (name) {
                ctor[name] = originals[name];
            });
            init.call(ctor);
        };
        fields.forEach(function (name) {
            values[name] = ctor[name];
            Object.defineProperty(ctor, name, {
                get: function () {
                    run();
                    return ctor[name];
                },
                set: function (value) {
                    run();
                    ctor[name] = value;
                },
                configurable: true,
                enumerable: true
            });
        });
        methods.forEach(function (name) {
            var original = ctor[name];
            originals[name] = original;
            var stub = function () {
                run();
                return original.apply(this, arguments);
            };
            if (original.$gen !== undefined) {
                stub.$gen = function () {
                    run();
                    return original.$gen.apply(this, arguments);
                };
            }
            ctor[name] = stub;
        });
        ctor.$run = run;
        ctor.$lazy = true;
    };

    // --- Library methods translated at their first call

    Runtime.prototype.lazyMethod = function (holder, name, loader, async) {
        var stub = function () {
            var fn = holder[name];
            if (fn === stub)
                fn = loader(holder);
            return fn.apply(this, arguments);
        };
        if (async) {
            stub.$gen = function () {
                var fn = holder[name];
                if (fn === stub)
                    fn = loader(holder);
                return fn.$gen !== undefined ? fn.$gen.apply(this, arguments) : CS.fiberValue(fn.apply(this, arguments));
            };
        }
        stub.$lazyStub = true;
        return stub;
    };

    // --- Numbers

    // (int)double, (long)double as .NET does on x64: NaN and out of range
    // give the smallest value.
    Runtime.prototype.d2i = function (value) {
        if (value > -2147483649 && value < 2147483648)
            return value < 0 ? Math.ceil(value) | 0 : Math.floor(value) | 0;
        return -2147483648;
    };

    Runtime.prototype.d2u = function (value) {
        // Through long, then the low 32 bits.
        var long = this.d2l(value);
        return typeof long === 'number' ? long % 4294967296 >>> 0 : long.lo >>> 0;
    };

    Runtime.prototype.d2l = function (value) {
        if (value > -9223372036854775809 && value < 9223372036854775808)
            return i64.fromFloat(value);
        return new i64.Int64(-2147483648, 0);
    };

    Runtime.prototype.d2ul = function (value) {
        if (value >= 9223372036854775808 && value < 18446744073709551616)
            return u64.fromFloat(value);
        return u64.fromSigned(this.d2l(value));
    };

    // Checked conversions: OverflowException out of range.
    Runtime.prototype.checkedInt = function (value, min, max) {
        if (!(value >= min && value <= max))
            throw this.exception('System.OverflowException');
        return Math.trunc(value);
    };

    // The 64-bit integers of C#: division and remainder of the smallest
    // value by -1 overflow.
    Runtime.prototype.i64 = Object.create(i64);
    Runtime.prototype.i64.div = function (left, right) {
        if (right === -1 && i64.is(left) && left.hi === -2147483648 && left.lo === 0)
            throw CS.rt.exception('System.OverflowException');
        return i64.div(left, right);
    };
    Runtime.prototype.i64.mod = function (left, right) {
        if (right === -1)
            return i64.is(left) && left.hi === -2147483648 && left.lo === 0 ? CS.rt.overflow() : 0;
        return i64.mod(left, right);
    };
    Runtime.prototype.u64 = u64;
})(globalThis);
