// Java: the run time of the translated code ($j) - classes, type checks,
// arrays, boxing, strings, exceptions.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Java = T.java;
    if (Java.Runtime)
        return;

    var i64 = T.i64, u64 = T.u64;

    function Runtime(session) {
        this.session = session;
        // Classes: id -> constructor; byName - by the full name.
        this.K = Object.create(null);
        this.K.byName = Object.create(null);
        this.hashSeed = 0x2545F491;
        this.characterCache = [];
    }
    Java.Runtime = Runtime;

    Runtime.prototype.byName = function (name) {
        var found = this.K.byName[name];
        if (found === undefined) {
            // A class the translator has not heard of yet (an exception from a native).
            this.session.loadLibraryClass(name);
            found = this.K.byName[name];
        }
        if (found === undefined)
            throw new Error('Java runtime class is missing: ' + name);
        return found;
    };

    // A library class before translation: the first read of $K.id (or
    // byName) translates its compilation unit (load), which replaces the
    // property with the value.
    Runtime.prototype.lazyClass = function (id, name, load) {
        function lazy(table, key) {
            var getter = function () {
                load();
                var descriptor = Object.getOwnPropertyDescriptor(table, key);
                if (descriptor === undefined || descriptor.get === getter)
                    throw new Error('Java runtime class is missing: ' + name);
                return descriptor.value;
            };
            Object.defineProperty(table, key, { get: getter, configurable: true, enumerable: true });
        }
        if (Object.prototype.hasOwnProperty.call(this.K, id))
            return;
        lazy(this.K, id);
        lazy(this.K.byName, name);
    };

    function setClass(table, key, classType) {
        Object.defineProperty(table, key, { value: classType, writable: true, configurable: true, enumerable: true });
    }

    // A new Java exception by the class name.
    Runtime.prototype.exception = function (name, message) {
        var classType = this.byName(name);
        // The constructors (), (message) are $init0 and $init1; a single one is $init.
        var ctor = message === undefined ? classType.prototype.$init0 || classType.prototype.$init : classType.prototype.$init1 || classType.prototype.$init;
        return ctor.call(new classType(), message === undefined ? undefined : message, null);
    };
    // --- Classes

    // An empty constructor: the fields are default values on the
    // prototype, the Java constructors are the methods $init.
    Runtime.prototype.defineClass = function (classTable, id, superCtor, interfaces, meta) {
        var classType = function () {};
        var base = superCtor;
        if (base === null && meta.name !== 'java.lang.Object')
            base = classTable.byName['java.lang.Object'] || null;
        classType.prototype = base !== null ? Object.create(base.prototype) : {};
        classType.prototype.constructor = classType;
        var is = Object.create(base !== null ? base.prototype.$is : null);
        is[id] = true;
        interfaces.forEach(function (iface) {
            for (var key in iface.prototype.$is)
                is[key] = true;
        });
        classType.prototype.$is = is;
        classType.$id = id;
        classType.$meta = meta;
        classType.$super = superCtor;
        classType.$interfaces = interfaces;
        setClass(classTable, id, classType);
        setClass(classTable.byName, meta.name, classType);
        return classType;
    };

    // After the methods: the default methods of interfaces go into the class prototype.
    Runtime.prototype.finishClass = function (classType) {
        var proto = classType.prototype;
        var queue = classType.$interfaces.slice();
        var seen = [];
        while (queue.length > 0) {
            var iface = queue.shift();
            if (seen.indexOf(iface) >= 0)
                continue;
            seen.push(iface);
            Object.keys(iface.prototype).forEach(function (name) {
                if (name === 'constructor' || name === '$is' || typeof iface.prototype[name] !== 'function')
                    return;
                // A method of the class (and of a superclass) beats a default method.
                if (!(name in proto))
                    proto[name] = iface.prototype[name];
            });
            queue = queue.concat(iface.$interfaces);
        }
        return classType;
    };

    // A library method before translation: the first call translates it
    // (loader puts the function into holder) and calls it. The copies of
    // the stub in classes that implement the interface call the translated
    // method after that.
    Runtime.prototype.lazyMethod = function (holder, name, loader, async) {
        var stub = function () {
            var fn = holder[name];
            if (fn === stub)
                fn = loader(holder);
            return fn.apply(this, arguments);
        };
        // A fiber method: the generator too, before translation.
        if (async) {
            stub.$gen = function* () {
                var fn = holder[name];
                if (fn === stub)
                    fn = loader(holder);
                return yield* fn.$gen.apply(this, arguments);
            };
        }
        return stub;
    };

    // A static Java method by its signature - for natives: callStatic(
    // 'java.util.Arrays', 'stream(int[])', [codes]).
    Runtime.prototype.callStatic = function (className, signature, args) {
        var cache = this.staticMethods || (this.staticMethods = Object.create(null));
        var key = className + '.' + signature;
        var jsName = cache[key];
        if (jsName === undefined) {
            var sym = this.session.symtab.classNamed(className).complete();
            var name = signature.substring(0, signature.indexOf('('));
            var method = (sym.methods[name] || []).filter(function (candidate) {
                return candidate.isStatic && Java.nativeKey(candidate) === signature;
            })[0];
            if (method === undefined)
                throw new Error('Java library method is missing: ' + key);
            jsName = cache[key] = method.jsName;
        }
        var classType = this.byName(className);
        return classType[jsName].apply(classType, args);
    };

    Runtime.prototype.initClass = function (classType) {
        if (classType.$clinit !== undefined && !classType.$initialized) {
            classType.$initialized = true;
            classType.$clinit();
        }
    };
    // --- Type checks

    // The set of types of a JavaScript primitive value (String, Integer, Boolean).
    Runtime.prototype.primitiveIs = function (value) {
        switch (typeof value) {
        case 'string':
            return this.byName('java.lang.String').prototype.$is;
        case 'number':
            return this.byName('java.lang.Integer').prototype.$is;
        case 'boolean':
            return this.byName('java.lang.Boolean').prototype.$is;
        }
        return null;
    };

    Runtime.prototype.is = function (value, classType) {
        if (value === null || value === undefined)
            return false;
        if (typeof value === 'object')
            return value.$is !== undefined && value.$is[classType.$id] === true;
        var is = this.primitiveIs(value);
        return is !== null && is[classType.$id] === true;
    };

    Runtime.prototype.className = function (value) {
        if (value === null || value === undefined)
            return 'null';
        switch (typeof value) {
        case 'string':
            return 'java.lang.String';
        case 'number':
            return 'java.lang.Integer';
        case 'boolean':
            return 'java.lang.Boolean';
        }
        if (value.constructor !== undefined && value.constructor.$meta !== undefined)
            return value.constructor.$meta.name;
        var descriptor = this.arrayDescriptor(value);
        return descriptor !== null ? descriptor : 'java.lang.Object';
    };

    Runtime.prototype.cast = function (value, classType) {
        if (value === null || value === undefined || this.is(value, classType))
            return value;
        throw this.castError(this.className(value), classType.$meta.name);
    };

    // The text of a ClassCastException as in the JDK (the classes of a
    // unit are in the unnamed module of the loader 'app').
    Runtime.prototype.castError = function (from, to) {
        function base(name) {
            return /^\[+[IJDFSBCZ]$/.test(name) || /^\[*L?java\./.test(name);
        }
        function where(name) {
            return base(name) ? "module java.base of loader 'bootstrap'" : "unnamed module of loader 'app'";
        }
        var detail = where(from) === where(to) ? from + ' and ' + to + ' are in ' + where(from)
                                               : from + ' is in ' + where(from) + '; ' + to + ' is in ' + where(to);
        return this.exception('java.lang.ClassCastException', 'class ' + from + ' cannot be cast to class ' + to + ' (' + detail + ')');
    };

    Runtime.prototype.nonNull = function (value) {
        if (value === null || value === undefined)
            throw this.exception('java.lang.NullPointerException');
        return value;
    };

    Runtime.prototype.npe = function () {
        return this.exception('java.lang.NullPointerException');
    };

    Runtime.prototype.divideByZero = function () {
        throw this.exception('java.lang.ArithmeticException', '/ by zero');
    };

    Runtime.prototype.matchException = function (value) {
        return this.exception('java.lang.MatchException', value === null ? null : this.str(value));
    };
    // --- Arrays: primitives are typed arrays, long, boolean and references
    // are plain ones with the descriptor $d.

    var TYPED = { I: Int32Array, D: Float64Array, B: Int8Array, S: Int16Array, C: Uint16Array, F: Float32Array };
    var TYPED_DESCRIPTORS = [[Int32Array, '[I'], [Float64Array, '[D'], [Int8Array, '[B'], [Int16Array, '[S'],
                             [Uint16Array, '[C'], [Float32Array, '[F']];

    Runtime.prototype.arrayDescriptor = function (value) {
        if (Array.isArray(value))
            return value.$d || '[Ljava.lang.Object;';
        for (var index = 0; index < TYPED_DESCRIPTORS.length; ++index) {
            if (value instanceof TYPED_DESCRIPTORS[index][0])
                return TYPED_DESCRIPTORS[index][1];
        }
        return null;
    };

    Runtime.prototype.isArray = function (value, descriptor) {
        if (value === null || value === undefined || typeof value !== 'object')
            return false;
        var actual = this.arrayDescriptor(value);
        if (actual === null)
            return false;
        if (actual === descriptor)
            return true;
        // An array of references fits Object[] (simplified covariance).
        return descriptor === '[Ljava.lang.Object;' && actual.charAt(1) === 'L' || (descriptor === '[Ljava.lang.Object;' && actual.charAt(1) === '[');
    };

    Runtime.prototype.castArray = function (value, descriptor) {
        if (value === null || value === undefined || this.isArray(value, descriptor))
            return value;
        throw this.castError(this.className(value), descriptor);
    };

    function leaf(descriptor, length) {
        var elem = descriptor.substring(1);
        var Typed = TYPED[elem];
        if (Typed !== undefined)
            return new Typed(length);
        var array = new Array(length);
        array.fill(elem === 'J' ? 0 : (elem === 'Z' ? false : null));
        array.$d = descriptor;
        return array;
    }

    Runtime.prototype.newArray = function (descriptor, dims) {
        var self = this;
        function make(desc, level) {
            var length = dims[level];
            if (length < 0)
                throw self.exception('java.lang.NegativeArraySizeException', String(length));
            if (level === dims.length - 1)
                return leaf(desc, length);
            var array = new Array(length);
            for (var index = 0; index < length; ++index)
                array[index] = make(desc.substring(1), level + 1);
            array.$d = desc;
            return array;
        }
        return make(descriptor, 0);
    };

    Runtime.prototype.arrayOf = function (descriptor, items) {
        var Typed = TYPED[descriptor.substring(1)];
        if (Typed !== undefined)
            return Typed.from(items);
        items.$d = descriptor;
        return items;
    };

    Runtime.prototype.cloneArray = function (array) {
        var copy = array.slice();
        if (Array.isArray(array))
            copy.$d = array.$d;
        return copy;
    };

    Runtime.prototype.indexOutOfBounds = function (index, array) {
        throw this.exception('java.lang.ArrayIndexOutOfBoundsException', 'Index ' + index + ' out of bounds for length ' + array.length);
    };
    // --- Boxing (Integer and Boolean are the values themselves)

    Runtime.prototype.box = function (name, value) {
        var classType = this.byName(name);
        var object = new classType();
        object.value = value;
        return object;
    };
    Runtime.prototype.boxJ = function (value) { return this.box('java.lang.Long', value); };
    Runtime.prototype.boxD = function (value) { return this.box('java.lang.Double', value); };
    Runtime.prototype.boxF = function (value) { return this.box('java.lang.Float', value); };
    Runtime.prototype.boxS = function (value) { return this.box('java.lang.Short', value); };
    Runtime.prototype.boxB = function (value) { return this.box('java.lang.Byte', value); };
    Runtime.prototype.boxC = function (value) {
        if (value < 128) {
            var cached = this.characterCache[value];
            if (cached === undefined)
                cached = this.characterCache[value] = this.box('java.lang.Character', value);
            return cached;
        }
        return this.box('java.lang.Character', value);
    };

    Runtime.prototype.unboxI = function (value) {
        if (value === null || value === undefined)
            throw this.exception('java.lang.NullPointerException');
        return value;
    };
    Runtime.prototype.unboxZ = Runtime.prototype.unboxI;
    Runtime.prototype.unbox = function (value) {
        if (value === null || value === undefined)
            throw this.exception('java.lang.NullPointerException');
        return value.value;
    };

    var CAST_BOXES = { int: 'java.lang.Integer', boolean: 'java.lang.Boolean', char: 'java.lang.Character', long: 'java.lang.Long',
                       double: 'java.lang.Double', float: 'java.lang.Float', short: 'java.lang.Short', byte: 'java.lang.Byte' };

    // (int) obj: a cast to the box, then unboxing.
    Runtime.prototype.unboxCast = function (value, name) {
        if (value === null || value === undefined)
            throw this.exception('java.lang.NullPointerException');
        var box = CAST_BOXES[name];
        this.cast(value, this.byName(box));
        return name === 'int' || name === 'boolean' ? value : value.value;
    };

    // --- Numbers

    Runtime.prototype.d2i = function (value) {
        if (value !== value)
            return 0;
        if (value >= 2147483647)
            return 2147483647;
        if (value <= -2147483648)
            return -2147483648;
        return value < 0 ? Math.ceil(value) | 0 : Math.floor(value) | 0;
    };

    Runtime.prototype.d2l = function (value) {
        return Java.doubleToLong(value);
    };

    Runtime.prototype.lushr = function (value, count) {
        return i64.fromUnsigned(u64.shr(u64.fromSigned(value), count));
    };
    // --- Strings

    // Double.toString: the shortest digits; 10^-3 <= |value| < 10^7 - plain
    // notation (at least one digit after the point), otherwise 1.5E10.
    function decimalText(value, shortest) {
        if (value !== value)
            return 'NaN';
        if (value === Infinity)
            return 'Infinity';
        if (value === -Infinity)
            return '-Infinity';
        if (value === 0)
            return 1 / value < 0 ? '-0.0' : '0.0';
        var negative = value < 0;
        var parts = shortest(Math.abs(value));
        var digits = parts.digits, exponent = parts.exponent;
        var text;
        var abs = Math.abs(value);
        if (abs >= 1e-3 && abs < 1e7) {
            if (exponent <= 0)
                text = '0.' + new Array(-exponent + 1).join('0') + digits;
            else if (exponent >= digits.length)
                text = digits + new Array(exponent - digits.length + 1).join('0') + '.0';
            else
                text = digits.substring(0, exponent) + '.' + digits.substring(exponent);
        } else {
            text = digits.charAt(0) + '.' + (digits.length > 1 ? digits.substring(1) : '0') + 'E' + (exponent - 1);
        }
        return negative ? '-' + text : text;
    }

    // JDK 19: if the shortest notation is one digit, the two-digit one
    // nearest to the exact value is taken if it reads back to the same
    // number (Double.MIN_VALUE is 4.9E-324, not 5.0E-324).
    function twoDigits(value, parts, same) {
        if (parts.digits.length !== 1)
            return parts;
        var text = value.toExponential(1);
        if (!same(Number(text)))
            return parts;
        var mantissa = text.substring(0, text.indexOf('e')).replace('.', '').replace(/0$/, '');
        return { digits: mantissa, exponent: Number(text.substring(text.indexOf('e') + 1)) + 1 };
    }

    // The shortest digits of a float: the precision at which the number
    // reads back to the same float.
    function floatDigits(number) {
        var same = function (value) { return Math.fround(value) === number; };
        for (var precision = 1; precision <= 9; ++precision) {
            var text = number.toPrecision(precision);
            if (same(Number(text)))
                return twoDigits(number, T.numbers.shortest(Number(text)), same);
        }
        return T.numbers.shortest(number);
    }

    function doubleDigits(number) {
        return twoDigits(number, T.numbers.shortest(number), function (value) { return value === number; });
    }

    Java.doubleToString = function (value) {
        return decimalText(value, doubleDigits);
    };
    Java.floatToString = function (value) {
        return decimalText(value, floatDigits);
    };
    Runtime.prototype.dstr = Java.doubleToString;
    Runtime.prototype.fstr = Java.floatToString;

    Runtime.prototype.s = function (value) {
        return value === null || value === undefined ? 'null' : value;
    };

    // String.valueOf(Object).
    Runtime.prototype.str = function (value) {
        if (value === null || value === undefined)
            return 'null';
        switch (typeof value) {
        case 'string':
            return value;
        case 'number':
        case 'boolean':
            return String(value);
        }
        if (typeof value.toString === 'function' && value.$is !== undefined)
            return String(value.toString());
        var descriptor = this.arrayDescriptor(value);
        if (descriptor !== null)
            return descriptor + '@' + this.identityHash(value).toString(16);
        return String(value);
    };
    // String.hashCode: s[0]*31^(n-1) + ... modulo 2^32.
    Java.stringHash = function (text) {
        var hash = 0;
        for (var index = 0; index < text.length; ++index)
            hash = (Math.imul(hash, 31) + text.charCodeAt(index)) | 0;
        return hash;
    };

    // The hash of an object: pseudo-random, but the same from run to run.
    Runtime.prototype.identityHash = function (object) {
        if (object.$hash === undefined) {
            var hash = this.hashSeed;
            hash ^= hash << 13;
            hash ^= hash >>> 17;
            hash ^= hash << 5;
            this.hashSeed = hash;
            Object.defineProperty(object, '$hash', { value: (hash >>> 1) & 0x7fffffff, enumerable: false });
        }
        return object.$hash;
    };

    // Calls a method of a value that may be a string, a number or a
    // boolean (the methods are taken from the prototypes of String, Integer,
    // Boolean).
    Runtime.prototype.invoke = function (receiver, name, args) {
        if (receiver === null || receiver === undefined)
            throw this.exception('java.lang.NullPointerException');
        var target = receiver;
        if (typeof receiver === 'object' && this.arrayDescriptor(receiver) !== null) {
            // The methods of Object on an array.
            if (name === 'clone$0')
                return this.cloneArray(receiver);
            if (name === 'getClass$0')
                return this.classOfValue(receiver);
            target = this.byName('java.lang.Object').prototype;
        } else if (typeof receiver !== 'object') {
            var classType = this.byName(typeof receiver === 'string' ? 'java.lang.String'
                                                             : (typeof receiver === 'number' ? 'java.lang.Integer' : 'java.lang.Boolean'));
            target = classType.prototype;
        }
        var method = target[name];
        if (typeof method !== 'function')
            throw this.exception('java.lang.UnsupportedOperationException', name);
        return method.apply(receiver, args);
    };

    Runtime.prototype.equals = function (left, right) {
        if (left === null || left === undefined)
            throw this.exception('java.lang.NullPointerException');
        if (typeof left !== 'object')
            return left === right;
        return left.equals(right);
    };

    Runtime.prototype.hashCode = function (value) {
        if (value === null || value === undefined)
            throw this.exception('java.lang.NullPointerException');
        switch (typeof value) {
        case 'string':
            return Java.stringHash(value);
        case 'number':
            return value;
        case 'boolean':
            return value ? 1231 : 1237;
        }
        return typeof value.hashCode === 'function' ? value.hashCode() : this.identityHash(value);
    };

    // compareTo for values that may be strings or numbers.
    Runtime.prototype.compare = function (left, right) {
        if (left === null || left === undefined || right === null || right === undefined)
            throw this.exception('java.lang.NullPointerException');
        if (typeof left === 'string')
            return Java.compareStrings(left, right);
        if (typeof left === 'number')
            return left < right ? -1 : (left > right ? 1 : 0);
        if (typeof left === 'boolean')
            return left === right ? 0 : (left ? 1 : -1);
        return left.compareTo$1(right);
    };
    // String.compareTo: the difference of the first differing characters or of the lengths.
    Java.compareStrings = function (left, right) {
        var length = Math.min(left.length, right.length);
        for (var index = 0; index < length; ++index) {
            var difference = left.charCodeAt(index) - right.charCodeAt(index);
            if (difference !== 0)
                return difference;
        }
        return left.length - right.length;
    };

    // --- Lambdas, enums, classes

    // --- Values for JavaScript (host modules, JsValue)

    var BOXED_NUMBERS = { 'java.lang.Double': 1, 'java.lang.Float': 1, 'java.lang.Short': 1, 'java.lang.Byte': 1 };

    // A Java value in JavaScript: numbers, strings, booleans as they are,
    // arrays and Iterable as arrays, Map and records as objects, lambdas as
    // functions, a JsValue as its value.
    Runtime.prototype.toJS = function (value) {
        var self = this;
        if (value === null || value === undefined)
            return null;
        if (typeof value !== 'object')
            return value;
        var classType = value.constructor;
        var meta = classType !== undefined && classType !== null ? classType.$meta : undefined;
        if (meta !== undefined && value.$is !== undefined) {
            var name = meta.name;
            if (name === 'js.JsValue')
                return value.$v;
            if (name === 'java.lang.Long')
                return i64.toFloat(value.value);
            if (name === 'java.lang.Character')
                return String.fromCharCode(value.value);
            if (BOXED_NUMBERS[name] === 1)
                return value.value;
            if (meta.isInterface && meta.functional)
                return this.jsFunction(value, meta.functional);
            if (meta.flavor === 'enum')
                return value.name;
            if (meta.flavor === 'record') {
                var record = {};
                meta.components.forEach(function (field, index) { record[meta.componentNames[index]] = self.toJS(value[field]); });
                return record;
            }
            if (this.is(value, this.byName('java.util.Map'))) {
                var object = {};
                for (var it = value.entrySet$0().iterator$0(); it.hasNext$0();) {
                    var entry = it.next$0();
                    object[this.str(entry.getKey$0())] = this.toJS(entry.getValue$0());
                }
                return object;
            }
            if (this.is(value, this.byName('java.lang.Iterable'))) {
                var items = [];
                for (var cursor = value.iterator$0(); cursor.hasNext$0();)
                    items.push(this.toJS(cursor.next$0()));
                return items;
            }
            return value;
        }
        var descriptor = this.arrayDescriptor(value);
        if (descriptor === '[C') {
            var text = '';
            for (var index = 0; index < value.length; ++index)
                text += String.fromCharCode(value[index]);
            return text;
        }
        if (descriptor !== null)
            return Array.prototype.map.call(value, function (item) { return descriptor === '[J' ? i64.toFloat(item) : self.toJS(item); });
        return value;
    };

    // A JavaScript value in Java by a type descriptor; deep - arrays and
    // objects become ArrayList and LinkedHashMap (otherwise JsValue).
    Runtime.prototype.fromJS = function (value, descriptor, deep) {
        var self = this;
        switch (descriptor) {
        case 'I':
            return this.d2i(Number(value));
        case 'S':
            return (this.d2i(Number(value)) << 16) >> 16;
        case 'B':
            return (this.d2i(Number(value)) << 24) >> 24;
        case 'C':
            return typeof value === 'string' ? value.charCodeAt(0) | 0 : this.d2i(Number(value)) & 65535;
        case 'J':
            return this.d2l(Number(value));
        case 'D':
            return Number(value);
        case 'F':
            return Math.fround(Number(value));
        case 'Z':
            return !!value;
        case 'Ljava.lang.String;':
            return value === null || value === undefined ? null : String(value);
        case 'Ljs.JsValue;':
            return this.jsValue(value);
        case 'Ljava.lang.Integer;':
            return value === null || value === undefined ? null : this.d2i(Number(value));
        case 'Ljava.lang.Long;':
            return value === null || value === undefined ? null : this.boxJ(this.d2l(Number(value)));
        case 'Ljava.lang.Double;':
            return value === null || value === undefined ? null : this.boxD(Number(value));
        case 'Ljava.lang.Boolean;':
            return value === null || value === undefined ? null : !!value;
        }
        if (value === null || value === undefined)
            return null;
        switch (typeof value) {
        case 'number':
            return Number.isInteger(value) && value >= -2147483648 && value <= 2147483647 && !(value === 0 && 1 / value < 0)
                ? value : this.boxD(value);
        case 'string':
        case 'boolean':
            return value;
        }
        if (value.$is !== undefined || this.arrayDescriptor(value) !== null)
            return value;
        if (deep && Array.isArray(value)) {
            var list = new (this.byName('java.util.ArrayList'))().$init0();
            value.forEach(function (item) { list.add$1(self.fromJS(item, 'Ljava.lang.Object;', true)); });
            return list;
        }
        if (deep && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
            var map = new (this.byName('java.util.LinkedHashMap'))().$init0();
            Object.keys(value).forEach(function (key) { map.put$2(key, self.fromJS(value[key], 'Ljava.lang.Object;', true)); });
            return map;
        }
        return this.jsValue(value);
    };

    Runtime.prototype.jsValue = function (raw) {
        var classType = this.byName('js.JsValue');
        var value = new classType();
        value.$v = raw;
        return value;
    };

    // A lambda for JavaScript: the arguments by the parameter types of the
    // interface method, the result in JavaScript. A Java exception becomes
    // a JavaScript error with the text the console shows.
    Runtime.prototype.jsFunction = function (object, functional) {
        var self = this;
        return function () {
            var args = [];
            for (var index = 0; index < functional.params.length; ++index)
                args.push(self.fromJS(arguments[index], functional.params[index], false));
            var saved = Java.rt;
            Java.rt = self;
            try {
                var result = self.sync(object[functional.name].apply(object, args));
                return functional.returns === 'V' ? undefined : self.toJS(result);
            } catch (error) {
                throw new Error(self.session.describeError(error));
            } finally {
                Java.rt = saved;
            }
        };
    };

    // An object of the functional interface interfaceType: the method name is the function fn.
    Runtime.prototype.lambda = function (interfaceType, name, fn) {
        var object = Object.create(interfaceType.prototype);
        object[name] = fn;
        return object;
    };

    Runtime.prototype.enumConstant = function (classType, object, name, ordinal) {
        object.name = name;
        object.ordinal = ordinal;
        if (!Object.prototype.hasOwnProperty.call(classType, '$constants'))
            classType.$constants = [];
        classType.$constants.push(object);
        return object;
    };

    Runtime.prototype.enumValues = function (classType) {
        return this.arrayOf('[L' + classType.$meta.name + ';', (classType.$constants || []).slice());
    };

    Runtime.prototype.enumValueOf = function (classType, name) {
        if (name === null || name === undefined)
            throw this.exception('java.lang.NullPointerException', 'Name is null');
        var constants = classType.$constants || [];
        for (var index = 0; index < constants.length; ++index) {
            if (constants[index].name === name)
                return constants[index];
        }
        throw this.exception('java.lang.IllegalArgumentException',
                             'No enum constant ' + classType.$meta.name + '.' + name);
    };

    // A Class object: one per class, array or primitive.
    Runtime.prototype.classObject = function (key, info) {
        var cache = this.classCache || (this.classCache = Object.create(null));
        if (cache[key] === undefined) {
            var ClassClass = this.byName('java.lang.Class');
            var object = new ClassClass();
            object.$info = info;
            cache[key] = object;
        }
        return cache[key];
    };

    Runtime.prototype.classOf = function (classType) {
        return this.classObject('C:' + classType.$id, { kind: 'class', ctor: classType, name: classType.$meta.name, simpleName: classType.$meta.simpleName });
    };

    Runtime.prototype.primitiveClass = function (name) {
        return this.classObject('P:' + name, { kind: 'primitive', name: name, simpleName: name });
    };

    Runtime.prototype.arrayClass = function (descriptor) {
        return this.classObject('A:' + descriptor, { kind: 'array', name: descriptor, simpleName: descriptor });
    };

    // The class of a value (getClass()).
    Runtime.prototype.classOfValue = function (value) {
        if (typeof value === 'object' && value !== null && value.constructor && value.constructor.$meta)
            return this.classOf(value.constructor);
        if (typeof value === 'object' && value !== null) {
            var descriptor = this.arrayDescriptor(value);
            if (descriptor !== null)
                return this.arrayClass(descriptor);
        }
        return this.classOf(this.byName(this.className(value)));
    };
    // --- Exceptions

    Runtime.prototype.isThrowable = function (value) {
        var Throwable = this.K.byName['java.lang.Throwable'];
        return value !== null && typeof value === 'object' && Throwable !== undefined && value.$is !== undefined &&
            value.$is[Throwable.$id] === true;
    };

    // throw null - NullPointerException.
    Runtime.prototype.thrown = function (value) {
        if (value === null || value === undefined)
            return this.exception('java.lang.NullPointerException');
        // The stack of a new exception is taken in its constructor; the
        // line of an error in Java is the place of creation, which is
        // usually the throw. A repeated throw (in catch) keeps the line.
        if (value.$fresh === true) {
            value.$fresh = false;
            value.stack = new Error('').stack;
        }
        return value;
    };

    // A JavaScript error in catch becomes a Java exception (with the stack
    // of the error: it gives the line).
    Runtime.prototype.caught = function (error) {
        if (this.isThrowable(error))
            return error;
        var converted;
        if (error instanceof TypeError) {
            converted = this.exception('java.lang.NullPointerException');
        } else if (error instanceof RangeError && /call stack|stack size|recursion|call depth/i.test(String(error.message))) {
            converted = this.exception('java.lang.StackOverflowError');
        } else if (error instanceof T.LanguageError) {
            return error;
        } else {
            converted = this.exception('java.lang.InternalError', error !== null && error !== undefined && error.message !== undefined
                ? String(error.message) : String(error));
        }
        if (error !== null && typeof error === 'object' && error.stack !== undefined)
            converted.stack = error.stack;
        return converted;
    };

    // The value of the last expression of a unit: the text as Java prints it.
    Runtime.prototype.show = function (value, descriptor) {
        switch (descriptor) {
        case 'D':
            return Java.doubleToString(value);
        case 'F':
            return Java.floatToString(value);
        case 'J':
            return i64.str(value);
        case 'C':
            return String.fromCharCode(value);
        case 'Z':
        case 'I':
        case 'S':
        case 'B':
            return value;
        }
        return this.str(value);
    };

    // --- Fibers (Thread.sleep, join, wait)

    // A generator as it is; a plain value becomes a generator with it.
    Runtime.prototype.fiber = function (value) {
        if (T.isGenerator(value))
            return value;
        // Not as a tail call: in V4 a tail call of a generator gives undefined.
        var generator = (function* () { return value; })();
        return generator;
    };

    // A generator from plain code: runs at once (a wait for time happens
    // in place).
    Runtime.prototype.sync = function (value) {
        if (T.isGenerator(value))
            return this.session.env.scheduler.runNested(value);
        return value;
    };

    Runtime.prototype.scheduler = function () {
        return this.session.env.scheduler;
    };

    // A fiber function: a wrapper for plain calls (the library, JavaScript)
    // and the generator $gen for calls from a fiber.
    Runtime.prototype.asyncFunction = function (gen) {
        var self = this;
        var wrapper = function () { return self.sync(gen.apply(this, arguments)); };
        wrapper.$gen = gen;
        return wrapper;
    };

    // A call from a fiber: the generator of a fiber method or the value of a plain one.
    Runtime.prototype.fiberCall = function (target, name, args) {
        if (target === null || target === undefined)
            throw this.npe();
        var fn = typeof target === 'object' || typeof target === 'function' ? target[name] : undefined;
        if (typeof fn !== 'function')
            return this.fiber(this.invoke(target, name, args));
        if (fn.$gen !== undefined)
            return fn.$gen.apply(target, args);
        return this.fiber(fn.apply(target, args));
    };

    Runtime.prototype.fiberApply = function (fn, self, args) {
        if (fn.$gen !== undefined)
            return fn.$gen.apply(self, args);
        return this.fiber(fn.apply(self, args));
    };

    // A fiber native: the generator gen and a wrapper.
    Java.asyncNative = function (gen) {
        var wrapper = function () { return Java.rt.sync(gen.apply(this, arguments)); };
        wrapper.$gen = gen;
        return wrapper;
    };

    // Natives that wait: calling them makes a function a fiber.
    Java.ASYNC_NATIVES = {
        'java.lang.Thread.sleep(long)': true,
        'java.lang.Thread.join()': true,
        'java.lang.Thread.join(long)': true,
        'java.lang.Object.wait()': true,
        'java.lang.Object.wait(long)': true,
        'java.util.concurrent.TimeUnit.sleep(long)': true,
        // Library methods written in Java that wait (fibers).
        'java.util.concurrent.CountDownLatch.await()': true,
        'java.util.concurrent.Future.get()': true,
        'java.util.concurrent.ExecutorService.awaitTermination(long,TimeUnit)': true,
        'java.util.concurrent.ExecutorService.invokeAll(Collection)': true,
        'java.util.concurrent.ExecutorService.close()': true,
        'java.util.concurrent.BlockingQueue.put(Object)': true,
        'java.util.concurrent.BlockingQueue.take()': true,
        'java.util.concurrent.BlockingQueue.poll(long,TimeUnit)': true,
        'java.util.concurrent.FutureTask.get()': true,
        'java.util.concurrent.FutureTask.run()': true,
        'java.util.concurrent.FutureTask.RunnableAdapter.call()': true,
        'java.util.concurrent.ThreadPool.awaitTermination(long,TimeUnit)': true,
        'java.util.concurrent.ThreadPool.close()': true,
        'java.util.concurrent.ThreadPool.invokeAll(Collection)': true,
        'java.util.concurrent.ThreadPool.Worker.run()': true,
        'java.util.concurrent.LinkedBlockingQueue.put(Object)': true,
        'java.util.concurrent.LinkedBlockingQueue.take()': true,
        'java.util.concurrent.LinkedBlockingQueue.poll(long,TimeUnit)': true,
        'java.util.concurrent.ArrayBlockingQueue.put(Object)': true,
        'java.util.concurrent.ArrayBlockingQueue.take()': true,
        'java.util.concurrent.ArrayBlockingQueue.poll(long,TimeUnit)': true
    };

    // --- Output and threads

    Runtime.prototype.write = function (error, text) {
        var env = this.session.env;
        (error ? env.err : env.out).write(text);
    };

    // The start of a run of a unit: threads of earlier runs are gone.
    Runtime.prototype.resetThreads = function () {
        this.threads = [];
        this.threadCounter = 0;
        this.$threadWatchers = [];
    };

    // start(): a thread is a fiber, it runs when the current one yields
    // (sleep, join, the end of the unit). An uncaught exception goes to the
    // console as text, as in the JVM, the other threads go on.
    Runtime.prototype.startThread = function (thread) {
        if (thread.$started)
            throw this.exception('java.lang.IllegalThreadStateException');
        thread.$started = true;
        var self = this;
        var ownRun = this.byName('java.lang.Thread').prototype.run$0;
        var target = thread.target;
        var body = function* () {
            try {
                if (thread.run$0 === ownRun && target !== null && target !== undefined)
                    yield* self.fiberCall(target, 'run$0', []);
                else
                    yield* self.fiberCall(thread, 'run$0', []);
            } catch (error) {
                if (error instanceof Java.SystemExit)
                    throw error;
                if (T.debug)
                    T.debug(error);
                self.session.env.out.flush();
                self.write(true, 'Exception in thread "' + thread.name + '" ' + self.session.describeError(error, true) + '\n');
            } finally {
                thread.$done = true;
                self.wakeAll(thread, '$joiners');
                self.wakeAll(self, '$threadWatchers');
            }
        };
        var fiber = this.scheduler().spawn(body(), thread.name);
        fiber.thread = thread;
        thread.$fiber = fiber;
        (this.threads = this.threads || []).push(thread);
    };

    // The waiting fibers of the list of an object are ready.
    Runtime.prototype.wakeAll = function (object, list) {
        var waiting = object[list] || [];
        object[list] = [];
        var scheduler = this.scheduler();
        waiting.forEach(function (fiber) { scheduler.wakeUp(fiber, undefined); });
    };

    Runtime.prototype.joinThread = function* (thread, millis) {
        if (!thread.$started || thread.$done)
            return;
        var scheduler = this.scheduler();
        if (millis !== undefined && millis > 0) {
            // join(ms): wait at most ms.
            var until = Date.now() + millis;
            while (!thread.$done && Date.now() < until) {
                scheduler.sleep(Math.min(10, until - Date.now()));
                yield;
            }
            return;
        }
        while (!thread.$done) {
            var fiber = scheduler.park();
            (thread.$joiners = thread.$joiners || []).push(fiber);
            yield;
        }
    };

    Runtime.prototype.sleepFiber = function* (millis) {
        if (millis < 0)
            throw this.exception('java.lang.IllegalArgumentException', 'timeout value is negative');
        this.scheduler().sleep(millis);
        yield;
    };

    // wait(): the fiber waits for notify; there are no locks (fibers take turns).
    Runtime.prototype.waitFiber = function* (object, millis) {
        var scheduler = this.scheduler();
        var fiber = millis > 0 ? scheduler.sleep(millis) : scheduler.park();
        (object.$waiters = object.$waiters || []).push(fiber);
        // A pool worker waits for a task: the end of the program does not wait for it (awaitThreads).
        var meta = object.constructor !== undefined ? object.constructor.$meta : undefined;
        fiber.idleWorker = !(millis > 0) && meta !== undefined && meta.name === 'java.util.concurrent.ThreadPool';
        if (fiber.idleWorker)
            this.wakeAll(this, '$threadWatchers');
        yield;
        fiber.idleWorker = false;
        // New arrays: splice and sort in V4 break an array after shift.
        object.$waiters = (object.$waiters || []).filter(function (other) { return other !== fiber; });
    };

    Runtime.prototype.notify = function (object, all) {
        var waiting = object.$waiters || [];
        var scheduler = this.scheduler();
        var woken = all ? waiting : waiting.slice(0, 1);
        object.$waiters = all ? [] : waiting.slice(1);
        woken.forEach(function (fiber) {
            scheduler.sleeping = scheduler.sleeping.filter(function (other) { return other !== fiber; });
            scheduler.wakeUp(fiber, undefined);
        });
    };

    // The end of the program: the JVM waits for the threads except
    // daemons. A pool that was not shut down would keep the JVM forever -
    // here the program ends when its workers wait for tasks.
    Runtime.prototype.awaitThreads = function* () {
        for (;;) {
            var pending = (this.threads || []).filter(function (thread) {
                return !thread.$done && !thread.daemon && !thread.$fiber.idleWorker;
            });
            if (pending.length === 0)
                return;
            var fiber = this.scheduler().park();
            (this.$threadWatchers = this.$threadWatchers || []).push(fiber);
            yield;
        }
    };

    Runtime.prototype.hasPendingThreads = function () {
        return (this.threads || []).some(function (thread) { return !thread.$done; });
    };

    Runtime.prototype.currentThread = function () {
        var fiber = this.session.env.scheduler.current;
        if (fiber !== null && fiber !== undefined && fiber.thread !== undefined)
            return fiber.thread;
        if (this.mainThread === undefined) {
            var Thread = this.byName('java.lang.Thread');
            this.mainThread = new Thread().$init3(null, 'main');
            this.mainThread.$started = true;
        }
        return this.mainThread;
    };
})(globalThis);
