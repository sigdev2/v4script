// Kotlin: the run time of the translated code ($kt), over the run time of
// Java ($j): kotlin.Unit, boxes, objects, non-local jumps, equality and
// text as Kotlin prints values, data classes, casts, arrays, ranges,
// KClass, JavaScript values.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Kt = T.kotlin;
    if (Kt.Runtime)
        return;

    var i64 = T.i64;

    function Runtime(session) {
        this.session = session;
        this.j = session.runtime;
        this.unitObject = null;
    }
    Kt.Runtime = Runtime;

    Object.defineProperty(Runtime.prototype, 'Unit', {
        get: function () {
            if (this.unitObject === null)
                this.unitObject = this.session.unitInstance();
            return this.unitObject;
        }
    });

    // --- Non-local jumps (from inline lambdas)

    function Jump() {}
    Runtime.prototype.Jump = Jump;

    function Return(token, value) {
        this.token = token;
        this.value = value;
    }
    Return.prototype = Object.create(Jump.prototype);
    Runtime.prototype.Return = Return;

    function Break(label) {
        this.label = label;
    }
    Break.prototype = Object.create(Jump.prototype);
    Runtime.prototype.Break = Break;

    function Continue(label) {
        this.label = label;
    }
    Continue.prototype = Object.create(Jump.prototype);
    Runtime.prototype.Continue = Continue;

    Runtime.prototype.raise = function (error) {
        throw error;
    };

    // --- Values

    // A box of a primitive (or the value itself: Int, Boolean, a JavaScript number).
    // A ULong in Any? or a generic: an object that prints the number unsigned
    // (the other unsigned types are numbers below 2^32 and need no box).
    function ULongBox(value) {
        this.value = value;
    }
    ULongBox.prototype.toString = function () { return T.u64.str(this.value); };
    ULongBox.prototype.equals = function (other) { return other instanceof ULongBox && T.u64.cmp(this.value, other.value) === 0; };
    ULongBox.prototype.hashCode = function () { return T.java.stringHash(T.u64.str(this.value)); };

    // A library function before translation (Runtime.lazyMethod of Java);
    // a fiber that calls it goes through $gen: the translated function may
    // wait (a lambda that it calls waits) or not.
    Runtime.prototype.lazyFunction = function (holder, name, loader) {
        var stub = this.j.lazyMethod(holder, name, loader, false);
        stub.$gen = function* () {
            var fn = holder[name];
            if (fn === stub)
                fn = loader(holder);
            if (fn.$gen !== undefined)
                return yield* fn.$gen.apply(this, arguments);
            return fn.apply(this, arguments);
        };
        return stub;
    };

    Runtime.prototype.boxUJ = function (value) {
        return new ULongBox(value);
    };

    Runtime.prototype.unbox = function (value) {
        if (value === null || value === undefined)
            throw this.j.npe();
        return typeof value === 'object' && value.value !== undefined ? value.value : value;
    };

    // x!!
    Runtime.prototype.nn = function (value) {
        if (value === null || value === undefined)
            throw this.j.exception('java.lang.NullPointerException');
        return value;
    };

    Runtime.prototype.lateinit = function (value, name) {
        if (value === null || value === undefined)
            throw this.exception('kotlin.UninitializedPropertyAccessException', 'lateinit property ' + name + ' has not been initialized');
        return value;
    };

    // A Kotlin exception by name: a class of the library or of Java.
    Runtime.prototype.exception = function (name, message) {
        var cls = this.session.runtimeClass(name);
        var object = new cls();
        var ctors = this.session.exceptionConstructor(name, message !== undefined);
        return object[ctors].call(object, message);
    };

    Runtime.prototype.noWhenBranch = function () {
        throw this.exception('kotlin.NoWhenBranchMatchedException');
    };

    Runtime.prototype.checkStep = function (step) {
        if (typeof step === 'number' ? step <= 0 : !(i64.gt(step, 0)))
            throw this.j.exception('java.lang.IllegalArgumentException', 'Step must be positive, was: ' + this.str(step) + '.');
        return step;
    };

    // a == b for boxes: null-safe equals.
    Runtime.prototype.eq = function (left, right) {
        if (left === null || left === undefined)
            return right === null || right === undefined;
        if (right === null || right === undefined)
            return false;
        if (left === right)
            return true;
        if (typeof left !== 'object' && typeof left !== 'function')
            return left === right;
        if (typeof left === 'function')
            return false;
        return this.j.equals(left, right);
    };

    Runtime.prototype.same = function (left, right) {
        if (left === undefined)
            left = null;
        if (right === undefined)
            right = null;
        return left === right;
    };

    Runtime.prototype.notSame = function (left, right) {
        return !this.same(left, right);
    };

    // toString() of any value as Kotlin prints it (null is "null").
    Runtime.prototype.str = function (value) {
        if (value === null || value === undefined)
            return 'null';
        switch (typeof value) {
        case 'string':
            return value;
        case 'number':
        case 'boolean':
            return String(value);
        case 'function':
            return value.$kotlinText !== undefined ? value.$kotlinText : 'Function' + value.length + '<' + 'java.lang.Object' + '>';
        }
        return this.j.str(value);
    };

    Runtime.prototype.compareDoubles = function (left, right) {
        // Double.compareTo: -0.0 < 0.0, NaN is the largest.
        if (left < right)
            return -1;
        if (left > right)
            return 1;
        if (left === right) {
            if (left === 0) {
                var leftNegative = 1 / left < 0, rightNegative = 1 / right < 0;
                return leftNegative === rightNegative ? 0 : (leftNegative ? -1 : 1);
            }
            return 0;
        }
        if (left !== left)
            return right !== right ? 0 : 1;
        return -1;
    };

    // A JavaScript value (dynamic) as a primitive kind.
    Runtime.prototype.fromDynamic = function (value, kind) {
        switch (kind) {
        case 'i32':
            return this.j.d2i(Number(value));
        case 'i64':
            return this.j.d2l(Number(value));
        case 'f64':
        case 'f32':
            return Number(value);
        case 'bool':
            return !!value;
        case 'char':
            return typeof value === 'string' ? value.charCodeAt(0) : Number(value) & 65535;
        }
        return value;
    };

    // --- Objects and classes

    // object Foo: the instance is made at the first use ($instance).
    Runtime.prototype.defineObject = function (classType) {
        var self = this;
        var getter = function () {
            var instance = new classType();
            Object.defineProperty(classType, '$instance', { value: instance, writable: true, configurable: true });
            var ctor = classType.prototype.$init;
            ctor.call(instance);
            void self;
            return instance;
        };
        Object.defineProperty(classType, '$instance', { get: getter, configurable: true });
    };

    // A class after its static initializer (enum entries).
    Runtime.prototype.initialized = function (classType) {
        this.j.initClass(classType);
        return classType;
    };

    Runtime.prototype.enumEntries = function (classType) {
        this.j.initClass(classType);
        var list = this.session.newArrayList();
        (classType.$constants || []).forEach(function (entry) { list.add$1(entry); });
        return list;
    };

    // --- Data classes: toString, hashCode and equals as Kotlin generates them

    Runtime.prototype.fieldText = function (value, kind, array) {
        switch (kind) {
        case 'i64':
            return i64.str(value);
        case 'f64':
            return this.j.dstr(value);
        case 'f32':
            return this.j.fstr(value);
        case 'char':
            return String.fromCharCode(value);
        case 'i32':
        case 'i16':
        case 'i8':
        case 'bool':
            return String(value);
        }
        if (array && value !== null && value !== undefined)
            return this.j.str(value);
        return this.str(value);
    };

    Runtime.prototype.dataToString = function (object, shape) {
        if (shape.object)
            return shape.name;
        var self = this;
        return shape.name + '(' + shape.fields.map(function (field) {
            return field.name + '=' + self.fieldText(object[field.js], field.kind, field.array);
        }).join(', ') + ')';
    };

    // result = 31 * result + field.hashCode(), as kotlinc generates it.
    Runtime.prototype.dataHashCode = function (object, shape) {
        if (shape.object)
            return T.java.stringHash(shape.name);
        var self = this;
        var result = 0;
        shape.fields.forEach(function (field, index) {
            var value = object[field.js];
            var hash = self.fieldHash(value, field.kind);
            result = index === 0 ? hash : (Math.imul(result, 31) + hash) | 0;
        });
        return result;
    };

    Runtime.prototype.fieldHash = function (value, kind) {
        if (value === null || value === undefined)
            return 0;
        var box = Kt.BOX[kind];
        if (box !== undefined)
            return this.j.hashCode(this.j[box](value));
        return this.j.hashCode(value);
    };

    Runtime.prototype.dataEquals = function (object, other, shape) {
        if (object === other)
            return true;
        if (other === null || other === undefined || other.constructor !== object.constructor)
            return false;
        var self = this;
        return shape.fields.every(function (field) {
            var left = object[field.js], right = other[field.js];
            switch (field.kind) {
            case 'f64':
            case 'f32':
                // Double.compare(a, b) == 0.
                return self.compareDoubles(left, right) === 0;
            case 'i64':
                return i64.eq(left, right);
            case 'i32':
            case 'i16':
            case 'i8':
            case 'char':
            case 'bool':
                return left === right;
            }
            return self.eq(left, right);
        });
    };

    // --- Type tests and casts

    // A value of a type (a descriptor of the session: class, array, primitive box, function).
    Runtime.prototype.isType = function (value, type) {
        if (value === null || value === undefined)
            return type.nullable;
        switch (type.kind) {
        case 'any':
            return true;
        case 'string':
            return typeof value === 'string';
        case 'int':
            return typeof value === 'number';
        case 'boolean':
            return typeof value === 'boolean';
        case 'function':
            return typeof value === 'function';
        case 'array':
            return type.descriptor === '[Ljava.lang.Object;' ? Array.isArray(value) : this.j.isArray(value, type.descriptor);
        case 'class':
            return this.j.is(value, type.ctor());
        }
        return false;
    };

    Runtime.prototype.cast = function (value, type) {
        if (value === null || value === undefined) {
            if (type.nullable)
                return null;
            throw this.j.exception('java.lang.NullPointerException', 'null cannot be cast to non-null type ' + type.name);
        }
        if (this.isType(value, type))
            return value;
        throw this.j.castError(this.j.className(value), type.javaName);
    };

    Runtime.prototype.isUnsigned = function (value, kind) {
        void kind;
        return typeof value === 'number';
    };

    // --- Arrays

    var TYPED = { '[I': Int32Array, '[D': Float64Array, '[B': Int8Array, '[S': Int16Array, '[C': Uint16Array, '[F': Float32Array };

    Runtime.prototype.newArray = function (descriptor, size, init) {
        if (size < 0)
            throw this.j.exception('java.lang.NegativeArraySizeException', String(size));
        var array = this.j.newArray(descriptor, [size]);
        if (init !== undefined) {
            for (var index = 0; index < size; ++index)
                array[index] = this.arrayElement(descriptor, init(index));
        }
        return array;
    };

    // An element from a function value (a box) into an array of the descriptor.
    Runtime.prototype.arrayElement = function (descriptor, value) {
        if (TYPED[descriptor] !== undefined || descriptor === '[J')
            return this.unbox(value);
        if (descriptor === '[Z')
            return !!value;
        return value;
    };

    Runtime.prototype.copyArray = function (array) {
        var copy = array.slice();
        if (Array.isArray(array))
            copy.$d = array.$d;
        return copy;
    };

    // *a, x, *b - one array of the descriptor.
    Runtime.prototype.spreadArray = function (descriptor, parts) {
        var items = [];
        parts.forEach(function (part) {
            for (var index = 0; index < part.length; ++index)
                items.push(part[index]);
        });
        return this.j.arrayOf(descriptor, items);
    };

    Runtime.prototype.arrayGet = function (array, index) {
        if (index < 0 || index >= array.length || index !== (index | 0))
            this.j.indexOutOfBounds(index, array);
        return array[index];
    };

    Runtime.prototype.arraySet = function (array, index, value) {
        if (index < 0 || index >= array.length || index !== (index | 0))
            this.j.indexOutOfBounds(index, array);
        array[index] = value;
    };

    Runtime.prototype.arrayIterator = function (array) {
        return this.session.arrayIterator(array);
    };

    // String.get: StringIndexOutOfBoundsException as the JDK writes it.
    Runtime.prototype.charAt = function (text, index) {
        if (text === null || text === undefined)
            throw this.j.npe();
        if (index < 0 || index >= text.length)
            throw this.j.exception('java.lang.StringIndexOutOfBoundsException', (index < 0 ? 'index ' + index + ', length ' + text.length
                                                                                          : 'Index ' + index + ' out of bounds for length ' + text.length));
        return text.charCodeAt(index);
    };

    // --- Ranges

    // a..<b: a..b-1 (an empty range when b is the minimum value).
    Runtime.prototype.rangeUntil = function (classType, kind, from, to) {
        var range = new classType();
        var ctor = this.session.rangeConstructor(classType);
        if (kind === 'i64') {
            if (i64.eq(to, i64.MIN_VALUE || T.i64.fromString('-9223372036854775808')))
                return range[ctor](1, 0);
            return range[ctor](from, i64.sub(to, 1));
        }
        if (kind === 'i32' && to === -2147483648)
            return range[ctor](1, 0);
        if (kind === 'char' && to === 0)
            return range[ctor](1, 0);
        return range[ctor](from, to - 1);
    };

    // --- KClass

    Runtime.prototype.kclass = function (classType) {
        return this.session.kclassObject(classType);
    };

    Runtime.prototype.kclassOf = function (value) {
        if (typeof value === 'string')
            return this.kclass(this.j.byName('java.lang.String'));
        if (typeof value === 'number')
            return this.kclass(this.j.byName('java.lang.Integer'));
        if (typeof value === 'boolean')
            return this.kclass(this.j.byName('java.lang.Boolean'));
        if (value !== null && typeof value === 'object' && value.constructor !== undefined && value.constructor.$meta !== undefined)
            return this.kclass(value.constructor);
        var descriptor = this.j.arrayDescriptor(value);
        if (descriptor !== null)
            return this.kclass(descriptor);
        return this.kclass(this.j.byName('java.lang.Object'));
    };

    Runtime.prototype.kclassOfType = function (type) {
        if (type.kind === 'class')
            return this.kclass(type.ctor());
        if (type.kind === 'string')
            return this.kclass(this.j.byName('java.lang.String'));
        if (type.kind === 'int')
            return this.kclass(this.j.byName('java.lang.Integer'));
        if (type.kind === 'boolean')
            return this.kclass(this.j.byName('java.lang.Boolean'));
        if (type.kind === 'array')
            return this.kclass(type.descriptor);
        return this.kclass(this.j.byName('java.lang.Object'));
    };

    // --- Coroutines: a suspend call in a generator

    // The generator of a suspend call (a plain value becomes a generator with it).
    // suspend fun main(): the generator runs to its end (there is no
    // dispatcher: kotlinx.coroutines is not there).
    Runtime.prototype.runSuspendMain = function (value) {
        return this.j.sync(value);
    };

    Runtime.prototype.suspended = function (value) {
        if (T.isGenerator(value))
            return value;
        var generator = (function* () { return value; })();
        return generator;
    };

    // --- JavaScript values (dynamic)

    Runtime.prototype.toJs = function (value) {
        return this.j.toJS(value);
    };

    Runtime.prototype.fromJs = function (value) {
        return value === undefined ? null : value;
    };

    Runtime.prototype.dynamicGet = function (object, name) {
        if (object === null || object === undefined)
            throw this.j.exception('java.lang.NullPointerException');
        return this.fromJs(object[typeof name === 'number' ? name : String(name)]);
    };

    Runtime.prototype.dynamicSet = function (object, name, value) {
        if (object === null || object === undefined)
            throw this.j.exception('java.lang.NullPointerException');
        object[typeof name === 'number' ? name : String(name)] = value;
    };

    Runtime.prototype.dynamicCall = function (object, name, args) {
        if (object === null || object === undefined)
            throw this.j.exception('java.lang.NullPointerException');
        var method = object[name];
        if (typeof method !== 'function')
            throw this.j.exception('java.lang.IllegalStateException', 'TypeError: ' + name + ' is not a function');
        return this.fromJs(method.apply(object, args));
    };

    Runtime.prototype.dynamicInvoke = function (fn, args) {
        if (typeof fn !== 'function')
            throw this.j.exception('java.lang.IllegalStateException', 'TypeError: value is not a function');
        return this.fromJs(fn.apply(null, args));
    };

    Runtime.prototype.dynamicArray = function (value) {
        return Array.prototype.slice.call(value || []);
    };

    // --- The value of a unit

    // The text of the last expression of a unit, as Kotlin prints it.
    Runtime.prototype.show = function (value, kind) {
        switch (kind) {
        case 'f64':
            return this.j.dstr(value);
        case 'f32':
            return this.j.fstr(value);
        case 'i64':
            return i64.str(value);
        case 'u64':
            return T.u64.str(value);
        case 'char':
            return String.fromCharCode(value);
        case 'i32':
        case 'i16':
        case 'i8':
        case 'bool':
        case 'u8':
        case 'u16':
        case 'u32':
            return String(value);
        }
        return this.str(value);
    };
})(globalThis);
