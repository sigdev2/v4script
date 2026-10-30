// C#: helpers of the run time that the translated code calls - strings
// of values, decimal arithmetic, integer division and checked arithmetic,
// references for ref and out, calls on type parameters, delegates of
// methods, tuples and anonymous objects, indexes and ranges, the value of
// a unit, values for JavaScript (dynamic).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    var R = CS.Runtime.prototype;
    if (R.s)
        return;

    var i64 = T.i64, u64 = T.u64, big = T.big;
    var decimal = CS.decimal;

    // --- Strings of values

    // A string for concatenation: null is "".
    R.s = function (value) {
        return value === null || value === undefined ? '' : value;
    };

    // The shortest digits of a double, as .NET (R) writes them: scientific
    // notation from 10^17 and below 10^-4.
    function shortestText(value, digits, exponent, limit) {
        if (exponent > limit || exponent < -3) {
            var mantissa = digits.charAt(0) + (digits.length > 1 ? '.' + digits.substring(1) : '');
            var power = exponent - 1;
            var text = String(Math.abs(power));
            if (text.length < 2)
                text = '0' + text;
            return mantissa + 'E' + (power < 0 ? '-' : '+') + text;
        }
        if (exponent <= 0)
            return '0.' + new Array(-exponent + 1).join('0') + digits;
        if (exponent >= digits.length)
            return digits + new Array(exponent - digits.length + 1).join('0');
        return digits.substring(0, exponent) + '.' + digits.substring(exponent);
    }

    CS.formatDouble = function (value, single) {
        if (value !== value)
            return 'NaN';
        if (value === Infinity)
            return 'Infinity';
        if (value === -Infinity)
            return '-Infinity';
        if (value === 0)
            return 1 / value < 0 ? '-0' : '0';
        var parts = single ? floatDigits(Math.abs(value)) : T.numbers.shortest(value);
        return (value < 0 ? '-' : '') + shortestText(null, parts.digits, parts.exponent, single ? 9 : 17);
    };

    // The shortest digits that give the same float back.
    function floatDigits(number) {
        for (var precision = 1; precision <= 9; ++precision) {
            var text = number.toPrecision(precision);
            if (Math.fround(Number(text)) === number)
                return T.numbers.shortest(Number(text));
        }
        return T.numbers.shortest(number);
    }
    CS.floatDigits = floatDigits;

    R.doubleString = function (value) {
        return CS.formatDouble(value, false);
    };

    R.singleString = function (value) {
        return CS.formatDouble(value, true);
    };

    // The value of the last expression of a unit for the host: numbers and
    // booleans as they are, other values as their text.
    R.show = function (type, value) {
        if (value === null || value === undefined)
            return null;
        var name = type.$name;
        switch (name) {
        case 'System.Int32':
        case 'System.Int16':
        case 'System.SByte':
        case 'System.Byte':
        case 'System.UInt16':
        case 'System.UInt32':
        case 'System.Boolean':
            return value;
        case 'System.Double':
            return isFinite(value) ? value : this.doubleString(value);
        case 'System.Int64':
        case 'System.UInt64':
            return typeof value === 'number' ? value : i64.str(value);
        case 'System.String':
            return value;
        }
        return this.str(type, value);
    };

    // --- Decimal arithmetic with the exceptions of .NET

    // At run time a decimal that does not fit is an OverflowException
    // (the checker sets its own hooks while it folds constants).
    decimal.onOverflow = function () {
        return CS.rt.exception('System.OverflowException', 'Value was either too large or too small for a Decimal.');
    };
    decimal.onDivideByZero = function () {
        return CS.rt.exception('System.DivideByZeroException', 'Attempted to divide by zero.');
    };

    var dec = Object.create(decimal);
    R.dec = dec;
    dec.str = decimal.str;
    dec.fromSingle = function (value) { return decimal.fromDouble(value, 7); };
    dec.fromDouble = function (value) { return decimal.fromDouble(value, 15); };
    function decimalToInteger(value, min, max, name) {
        var whole = decimal.truncate(value);
        if (big.cmp(whole, min) < 0 || big.cmp(whole, max) > 0)
            throw CS.rt.exception('System.OverflowException', 'Value was either too large or too small for ' + name + '.');
        return whole;
    }
    dec.to_i8 = function (value) { return big.toFloat(decimalToInteger(value, -128, 127, 'a signed byte')); };
    dec.to_u8 = function (value) { return big.toFloat(decimalToInteger(value, 0, 255, 'an unsigned byte')); };
    dec.to_i16 = function (value) { return big.toFloat(decimalToInteger(value, -32768, 32767, 'an Int16')); };
    dec.to_u16 = function (value) { return big.toFloat(decimalToInteger(value, 0, 65535, 'a character')); };
    dec.to_i32 = function (value) { return big.toFloat(decimalToInteger(value, -2147483648, 2147483647, 'an Int32')); };
    dec.to_u32 = function (value) { return big.toFloat(decimalToInteger(value, 0, 4294967295, 'a UInt32')); };
    dec.to_i64 = function (value) {
        return T.bigToI64(decimalToInteger(value, big.neg(big.pow(2, 63)), big.sub(big.pow(2, 63), 1), 'an Int64'), true);
    };
    dec.to_u64 = function (value) {
        return T.bigToI64(decimalToInteger(value, 0, big.sub(big.pow(2, 64), 1), 'a UInt64'), false);
    };
    dec.to_f64 = function (value) { return decimal.toNumber(value); };
    dec.to_f32 = function (value) { return Math.fround(decimal.toNumber(value)); };
    dec.to_decimal = function (value) { return value; };

    // --- Integer arithmetic

    R.idiv = function (left, right) {
        if (right === 0)
            this.divideByZero();
        var quotient = left / right;
        if (quotient === 2147483648)
            this.overflow();
        return quotient | 0;
    };

    R.imod = function (left, right) {
        if (right === 0)
            this.divideByZero();
        if (right === -1) {
            if (left === -2147483648)
                this.overflow();
            return 0;
        }
        return left % right | 0;
    };

    R.udiv = function (left, right) {
        if (right === 0)
            this.divideByZero();
        return (left / right) >>> 0;
    };

    R.umod = function (left, right) {
        if (right === 0)
            this.divideByZero();
        return left % right;
    };

    R.i64.divide = function (left, right) {
        if (right === 0)
            CS.rt.divideByZero();
        if (typeof left === 'number' && typeof right === 'number' && right !== -1)
            return Math.trunc(left / right) + 0;
        return CS.rt.i64.div(left, right);
    };

    R.i64.remainder = function (left, right) {
        if (right === 0)
            CS.rt.divideByZero();
        if (typeof left === 'number' && typeof right === 'number' && right !== -1)
            return (left % right) + 0;
        return CS.rt.i64.mod(left, right);
    };

    // long >>> count.
    R.lushr = function (value, count) {
        return i64.fromUnsigned(u64.shr(u64.fromSigned(value), count));
    };

    // checked(a op b): OverflowException out of the range of the kind.
    var RANGES = { i8: [-128, 127], u8: [0, 255], i16: [-32768, 32767], u16: [0, 65535], i32: [-2147483648, 2147483647],
                   u32: [0, 4294967295] };
    var LONG_RANGE = [big.neg(big.pow(2, 63)), big.sub(big.pow(2, 63), 1)];
    var ULONG_RANGE = [0, big.sub(big.pow(2, 64), 1)];

    function toBig(kind, value) {
        if (kind === 'i64')
            return T.i64ToBig(value, true);
        if (kind === 'u64')
            return T.i64ToBig(value, false);
        return value;
    }

    function fromBig(kind, value) {
        var range = kind === 'i64' ? LONG_RANGE : (kind === 'u64' ? ULONG_RANGE : RANGES[kind]);
        if (big.cmp(value, range[0]) < 0 || big.cmp(value, range[1]) > 0)
            throw CS.rt.exception('System.OverflowException', 'Arithmetic operation resulted in an overflow.');
        if (kind === 'i64' || kind === 'u64')
            return T.bigToI64(value, kind === 'i64');
        return big.toFloat(value);
    }

    R.checkedAdd = function (kind, left, right) {
        return fromBig(kind, big.add(toBig(kind, left), toBig(kind, right)));
    };
    R.checkedSub = function (kind, left, right) {
        return fromBig(kind, big.sub(toBig(kind, left), toBig(kind, right)));
    };
    R.checkedMul = function (kind, left, right) {
        return fromBig(kind, big.mul(toBig(kind, left), toBig(kind, right)));
    };
    R.checkedNegate32 = function (value) {
        if (value === -2147483648)
            this.overflow();
        return -value | 0;
    };
    R.checkedNegate64 = function (value) {
        return fromBig('i64', big.neg(toBig('i64', value)));
    };

    // checked((T)x): a conversion that throws when the value does not fit.
    R.checkedConvert = function (from, to, value) {
        var integer;
        if (from === 'f32' || from === 'f64') {
            if (!isFinite(value))
                throw this.exception('System.OverflowException', 'Arithmetic operation resulted in an overflow.');
            integer = big.fromFloat(Math.trunc(value));
        } else {
            integer = toBig(from, value);
        }
        return fromBig(to, integer);
    };

    // bool? & | ^ with three values.
    R.liftedBool = function (op, left, right) {
        switch (op) {
        case '&':
            if (left === false || right === false)
                return false;
            return left === null || right === null ? null : true;
        case '|':
            if (left === true || right === true)
                return true;
            return left === null || right === null ? null : false;
        case '^':
            return left === null || right === null ? null : left !== right;
        case '==':
            return left === right;
        case '!=':
            return left !== right;
        }
        return null;
    };

    // --- Nullable values

    R.nullableValue = function (value) {
        if (value === null || value === undefined)
            throw this.exception('System.InvalidOperationException', 'Nullable object must have a value.');
        return value;
    };

    // object as int?: the value if the box is of the type.
    R.asValue = function (value, type) {
        if (value === null || value === undefined || !this.is(value, type))
            return null;
        return this.unbox(type, value);
    };

    R.unboxInt = function (value) {
        if (typeof value === 'number')
            return value;
        if (value === null || value === undefined)
            throw this.nullReference();
        throw this.castError(value, this.type('System.Int32'));
    };

    // The value inside a box (after a type test).
    R.unboxed = function (value) {
        if (value !== null && typeof value === 'object' && value.$boxed === true)
            return value.v;
        if (value !== null && typeof value === 'object' && value.constructor !== undefined && value.constructor.$mutable)
            return value.$copy();
        return value;
    };

    // --- References (ref, out, in)

    function Ref(get, set) {
        this.get = get;
        this.set = set;
    }
    Object.defineProperty(Ref.prototype, 'v', {
        get: function () { return this.get(); },
        set: function (value) { this.set(value); }
    });

    function FieldRef(object, name) {
        this.o = object;
        this.n = name;
    }
    Object.defineProperty(FieldRef.prototype, 'v', {
        get: function () { return this.o[this.n]; },
        set: function (value) { this.o[this.n] = value; }
    });

    function ElementRef(array, index) {
        if (array === null || array === undefined)
            throw CS.rt.nullReference();
        if (!(index >= 0 && index < array.length))
            throw CS.rt.indexError();
        this.o = array;
        this.n = index;
    }
    ElementRef.prototype = Object.create(FieldRef.prototype);

    function ValueRef(value) {
        this.value = value;
    }
    Object.defineProperty(ValueRef.prototype, 'v', {
        get: function () { return this.value; },
        set: function (value) { this.value = value; }
    });

    R.ref = function (get, set) {
        return new Ref(get, set);
    };
    R.fieldRef = function (object, name) {
        if (object === null || object === undefined)
            throw this.nullReference();
        return new FieldRef(object, name);
    };
    R.elementRef = function (array, index) {
        return new ElementRef(array, index);
    };
    R.valueRef = function (value) {
        return new ValueRef(value);
    };
    R.discardRef = function () {
        return new ValueRef(undefined);
    };
    R.isRef = function (value) {
        return value instanceof Ref || value instanceof FieldRef || value instanceof ValueRef;
    };

    // this = value in a struct: the fields are copied.
    R.assignStruct = function (target, value) {
        var names = target.$fieldNames || Object.keys(target);
        for (var index = 0; index < names.length; ++index)
            target[names[index]] = value[names[index]];
        return target;
    };

    // --- Calls in generic code

    // A method on a value of a type parameter: numbers and booleans call
    // the method of their type with this = the value.
    R.tcall = function (type, receiver, name, args) {
        if (type.$primitive || type.$kind === 'enum')
            return type.prototype[name].apply(receiver, args);
        if (receiver === null || receiver === undefined)
            throw this.nullReference();
        return receiver[name].apply(receiver, args);
    };

    // T.M() for a static abstract or virtual member of an interface: the
    // member of the type argument (generic math of the numeric types by
    // its C# name member), else the default of the interface (with this =
    // the constructed interface: its type arguments).
    R.callStatic = function (type, name, iface, args, member) {
        if (type.$lazy === true)
            type.$run();
        var holder = type;
        while (holder !== null && holder !== undefined && typeof holder[name] !== 'function')
            holder = holder.$def;
        if (holder !== null && holder !== undefined)
            return holder[name].apply(type, args);
        var numeric = CS.numericMember(type, member, name);
        if (numeric !== null)
            return numeric.apply(type, args);
        holder = iface;
        while (holder !== null && holder !== undefined && typeof holder[name] !== 'function')
            holder = holder.$def;
        if (holder === null || holder === undefined)
            throw this.exception('System.MissingMethodException', "Method not found: '" + this.typeName(type) + '.' + member + "'.");
        return holder[name].apply(iface, args);
    };

    // new T()
    R.newOf = function (type) {
        if (type.$struct)
            return this.defaultOf(type);
        var object = new type();
        if (typeof object.$ctor$0 !== 'function')
            throw this.exception('System.MissingMethodException', "Cannot dynamically create an instance of type '" +
                                 this.typeName(type) + "'. Reason: No parameterless constructor defined.");
        return object.$ctor$0();
    };

    // --- Delegates of methods

    // A generic method as a delegate: the type arguments go first.
    R.boundDelegate = function (type, target, method, typeArgs) {
        var fn = function () {
            return method.apply(target, typeArgs.concat(Array.prototype.slice.call(arguments)));
        };
        fn.$t = type;
        fn.$target = target;
        fn.$method = method;
        return fn;
    };

    // An extension method as a delegate: the receiver is the first argument.
    R.extensionDelegate = function (type, receiver, method, typeArgs) {
        var fn = function () {
            return method.apply(null, typeArgs.concat([receiver], Array.prototype.slice.call(arguments)));
        };
        fn.$t = type;
        fn.$target = receiver;
        fn.$method = method;
        return fn;
    };

    // --- Arrays

    R.checkIndex = function (array, index) {
        if (!(index >>> 0 < array.length) || index !== (index | 0) && index >>> 0 !== index)
            throw this.indexError();
    };

    R.longIndex = function (value) {
        var number = typeof value === 'number' ? value : i64.toFloat(value);
        if (number > 2147483647 || number < -2147483648)
            throw this.exception('System.OverflowException', 'Arithmetic operation resulted in an overflow.');
        return number;
    };

    R.arrayLength = function (array) {
        if (array instanceof CS.MultiArray)
            return array.a.length;
        return array.length;
    };

    R.multiArrayOf = function (elem, dims, values) {
        var array = this.newMultiArray(elem, dims);
        for (var index = 0; index < values.length; ++index)
            array.a[index] = values[index];
        return array;
    };

    R.elementAt = function (array, index) {
        if (!(index >= 0 && index < array.length))
            throw this.indexError();
        return array[index];
    };

    R.modifiedDuringEnumeration = function () {
        throw this.exception('System.InvalidOperationException', 'Collection was modified; enumeration operation may not execute.');
    };

    // --- Indexes and ranges

    R.index = function (value, fromEnd) {
        if (value < 0)
            throw this.exception('System.ArgumentOutOfRangeException', 'Non-negative number required. (Parameter \'value\')');
        var Index = this.type('System.Index');
        var result = new Index();
        result._value = fromEnd ? ~value : value;
        return result;
    };

    R.range = function (start, end) {
        var Range = this.type('System.Range');
        var result = new Range();
        result.Start$ = start === null ? this.index(0, false) : start;
        result.End$ = end === null ? this.index(0, true) : end;
        result._start = result.Start$;
        result._end = result.End$;
        return result;
    };

    function indexOffset(index, length) {
        var value = index._value;
        return value < 0 ? length + value + 1 : value;
    }

    R.fromEndIndex = function (index, length) {
        if (typeof index === 'number')
            return length - index;
        return indexOffset(index, length);
    };

    function rangeBounds(range, length) {
        var start = indexOffset(range._start, length);
        var end = indexOffset(range._end, length);
        if (start < 0 || end > length || start > end)
            throw CS.rt.exception('System.ArgumentOutOfRangeException', 'Specified argument was out of the range of valid values. (Parameter \'length\')');
        return [start, end];
    }

    R.arraySlice = function (array, range) {
        var bounds = rangeBounds(range, array.length);
        var slice = array.slice(bounds[0], bounds[1]);
        slice.$t = array.$t;
        return slice;
    };

    R.sliceCall = function (receiver, range, length, name) {
        var bounds = rangeBounds(range, length);
        return receiver[name](bounds[0], bounds[1] - bounds[0]);
    };

    R.stringSlice = function (text, range) {
        var bounds = rangeBounds(range, text.length);
        return text.substring(bounds[0], bounds[1]);
    };

    R.stringFromEnd = function (text, index) {
        var position = indexOffset(index, text.length);
        if (!(position >= 0 && position < text.length))
            throw this.indexError();
        return text.charCodeAt(position);
    };

    R.sliceOf = function (value, start, end) {
        if (typeof value === 'string')
            return value.substring(start, end);
        if (Array.isArray(value) || ArrayBuffer.isView(value)) {
            var slice = value.slice(start, end);
            slice.$t = value.$t;
            return slice;
        }
        return value.GetRange$2 !== undefined ? value.GetRange$2(start, end - start) : value;
    };

    // --- Tuples, anonymous objects, records

    R.tuple = function (type, values) {
        var tuple = new type();
        for (var index = 0; index < values.length; ++index)
            tuple[index < 7 ? 'Item' + (index + 1) : 'Rest'] = values[index];
        return tuple;
    };

    // An anonymous type: fields of the names, ToString "{ A = 1, B = x }",
    // value equality.
    R.defineAnonymous = function (id, names) {
        var self = this;
        var ctor = this.defineType(id, { name: '<>f__AnonymousType' + id.replace(/\D/g, ''), kind: 'class', generic: names.length,
                                         anonymous: names },
                                   function (object) {
                                       names.forEach(function (name) { object[name] = null; });
                                   }, this.type('System.Object'), []);
        var proto = ctor.prototype;
        proto.ToString$0 = function () {
            var object = this;
            var args = object['$ta$' + id] || [];
            return '{ ' + names.map(function (name, index) {
                var type = args[index];
                return name + ' = ' + (type !== undefined ? self.str(type, object[name]) : self.objectString(object[name]));
            }).join(', ') + ' }';
        };
        proto.Equals$1 = function (other) {
            if (other === null || other === undefined || other.constructor !== this.constructor)
                return false;
            var object = this;
            var args = object['$ta$' + id] || [];
            return names.every(function (name, index) { return self.equalsOf(args[index], object[name], other[name]); });
        };
        proto.GetHashCode$0 = function () {
            var object = this;
            var args = object['$ta$' + id] || [];
            var hash = 0x3a2b1c;
            names.forEach(function (name, index) { hash = self.combineHash(hash, self.hashOf(args[index], object[name])); });
            return hash;
        };
        names.forEach(function (name) {
            proto['get_' + name + '$0'] = function () { return this[name]; };
        });
        this.finishType(ctor, []);
        return ctor;
    };

    R.anonymous = function (type, values) {
        var object = new type();
        var names = type.$meta.anonymous;
        for (var index = 0; index < names.length; ++index)
            object[names[index]] = values[index];
        return object;
    };

    R.cloneAnonymous = function (value) {
        var copy = new value.constructor();
        value.constructor.$meta.anonymous.forEach(function (name) { copy[name] = value[name]; });
        return copy;
    };

    R.combineHash = function (hash, value) {
        return (Math.imul(hash, -1521134295) + (value | 0)) | 0;
    };

    // Record.ToString: "Name { A = 1, B = x }".
    R.recordToString = function (object, name) {
        var builder = this.newStringBuilder();
        builder.$s = name + ' { ';
        if (object.PrintMembers$1(builder))
            builder.$s += ' ';
        return builder.$s + '}';
    };

    R.appendMember = function (builder, printed, label, text) {
        builder.$s += (printed ? ', ' : '') + label + text;
    };

    R.newStringBuilder = function () {
        var Builder = this.type('System.Text.StringBuilder');
        return new Builder().$ctor$0();
    };

    // --- Spreads and collection expressions

    // The items of an enumerable as an array.
    R.itemsOf = function (collection) {
        if (collection === null || collection === undefined)
            throw this.nullReference();
        if (typeof collection === 'string') {
            var codes = [];
            for (var position = 0; position < collection.length; ++position)
                codes.push(collection.charCodeAt(position));
            return codes;
        }
        if (Array.isArray(collection) || ArrayBuffer.isView(collection))
            return Array.prototype.slice.call(collection);
        if (collection instanceof CS.MultiArray)
            return Array.prototype.slice.call(collection.a);
        var items = [];
        var enumerator = collection[this.enumerableMethod()]();
        while (enumerator[this.moveNextMethod()]())
            items.push(enumerator[this.currentMethod()]());
        return items;
    };

    R.spreadItems = function (groups) {
        var result = [];
        groups.forEach(function (group) {
            for (var index = 0; index < group.length; ++index)
                result.push(group[index]);
        });
        return result;
    };

    // A collection of a type with Add (List<T> and others) from values.
    R.collectionOf = function (type, values) {
        var collection = new type().$ctor$0();
        var add = collection[this.collectionAddName(type)];
        for (var index = 0; index < values.length; ++index)
            add.call(collection, values[index]);
        return collection;
    };

    // --- Misc

    R.throwValue = function (error) {
        throw this.thrown(error);
    };

    R.lockOn = function (value) {
        if (value === null || value === undefined)
            throw this.exception('System.ArgumentNullException', 'Value cannot be null. (Parameter \'obj\')');
    };

    R.switchFailed = function (value) {
        throw this.exception('System.Runtime.CompilerServices.SwitchExpressionException',
                             value === null || value === undefined ? 'Non-exhaustive switch expression failed to match its input.'
                                 : 'Non-exhaustive switch expression failed to match its input.\nUnmatched value was ' + this.objectString(value) + '.');
    };

    // Dispose of a using or foreach (null does nothing).
    R.dispose = function (value) {
        if (value === null || value === undefined)
            return;
        var name = this.disposeMethod();
        if (typeof value[name] === 'function')
            value[name]();
    };

    // The statics of a constructed generic type, lazy as for other types.
    R.genericStatics = function (def, ctor, fields, methods, init) {
        fields.forEach(function (name) {
            ctor[name] = def[name];
        });
        methods.forEach(function (name) {
            ctor[name] = def[name];
        });
        this.lazyStatics(ctor, fields, methods.filter(function (name) { return typeof ctor[name] === 'function'; }), init);
    };

    // An enum type: its values print by name.
    R.defineEnum = function (ctor) {
        var self = this;
        ctor.$primitive = true;
        var proto = ctor.prototype;
        // The natives of System.Enum get the enum type.
        for (var source = Object.getPrototypeOf(proto); source !== null && source !== Object.prototype;
             source = Object.getPrototypeOf(source)) {
            Object.getOwnPropertyNames(source).forEach(function (name) {
                var method = source[name];
                if (typeof method === 'function' && method.$enumAware !== undefined && !Object.prototype.hasOwnProperty.call(proto, name)) {
                    var aware = method.$enumAware;
                    proto[name] = function () {
                        return aware.apply(this, [ctor].concat(Array.prototype.slice.call(arguments)));
                    };
                }
            });
        }
        proto.ToString$0 = function () { return self.enumName(ctor, this); };
        proto.GetHashCode$0 = function () { return typeof this === 'number' ? this | 0 : i64.low32(this); };
        proto.Equals$1 = function (other) {
            return other !== null && other !== undefined && other.$t === ctor && other.v === this.valueOf();
        };
        proto.GetType$0 = function () { return self.typeObject(ctor); };
        proto.CompareTo$1 = function (other) {
            var value = this.valueOf(), against = other === null ? null : (other.$boxed ? other.v : other);
            if (against === null)
                return 1;
            return value < against ? -1 : (value > against ? 1 : 0);
        };
        ctor.$format = function (value) { return self.enumName(ctor, value); };
        ctor.$equals = function (left, right) { return left === right; };
        ctor.$hash = function (value) { return typeof value === 'number' ? value | 0 : i64.low32(value); };
        ctor.$default = function () { return 0; };
    };

    // --- dynamic: values of JavaScript

    // A JsValue as dynamic is the value it holds.
    function unwrapJs(value) {
        return value !== null && typeof value === 'object' && value.$jsValue === true ? value.$v : value;
    }

    R.toJs = function (value) {
        return this.toJS(value);
    };

    R.dynamicGet = function (object, name) {
        object = unwrapJs(object);
        if (object === null || object === undefined)
            throw this.nullReference();
        return this.fromJS(object[name]);
    };

    R.dynamicSet = function (object, name, value) {
        object = unwrapJs(object);
        if (object === null || object === undefined)
            throw this.nullReference();
        object[name] = this.toJS(value);
        return value;
    };

    R.dynamicIndex = function (object, keys) {
        object = unwrapJs(object);
        if (object === null || object === undefined)
            throw this.nullReference();
        return this.fromJS(object[this.toJS(keys[0])]);
    };

    R.dynamicSetIndex = function (object, keys, value) {
        object = unwrapJs(object);
        if (object === null || object === undefined)
            throw this.nullReference();
        object[this.toJS(keys[0])] = this.toJS(value);
        return value;
    };

    R.dynamicInvokeMember = function (object, name, args) {
        object = unwrapJs(object);
        if (object === null || object === undefined)
            throw this.nullReference();
        var target = object[name];
        if (typeof target !== 'function')
            throw this.exception('V4Script.JsException', "TypeError: " + name + ' is not a function');
        return this.fromJS(this.guard(function () { return target.apply(object, args); }));
    };

    R.dynamicInvoke = function (target, args) {
        target = unwrapJs(target);
        if (typeof target !== 'function')
            throw this.exception('V4Script.JsException', 'TypeError: not a function');
        return this.fromJS(this.guard(function () { return target.apply(null, args); }));
    };

    R.dynamicBinary = function (op, left, right) {
        var a = this.toJS(left), b = this.toJS(right);
        switch (op) {
        case '+':
            return a + b;
        case '-':
            return a - b;
        case '*':
            return a * b;
        case '/':
            return a / b;
        case '%':
            return a % b;
        case '==':
            return a === b;
        case '!=':
            return a !== b;
        case '<':
            return a < b;
        case '>':
            return a > b;
        case '<=':
            return a <= b;
        case '>=':
            return a >= b;
        case '&':
            return a & b;
        case '|':
            return a | b;
        case '^':
            return a ^ b;
        }
        throw new Error('dynamic operator ' + op);
    };

    R.dynamicUnary = function (op, value) {
        var a = this.toJS(value);
        switch (op) {
        case '-':
            return -a;
        case '+':
            return +a;
        case '!':
            return !a;
        case '~':
            return ~a;
        }
        throw new Error('dynamic operator ' + op);
    };

    R.dynamicItems = function (value) {
        var items = this.toJS(value);
        if (items === null || items === undefined)
            throw this.nullReference();
        return Array.prototype.map.call(items, function (item) { return item; });
    };

    // A dynamic value converted to a type of C#.
    R.fromDynamic = function (type, value) {
        if (type.$name !== 'System.Object')
            value = this.toJS(value);
        switch (type.$name) {
        case 'System.Int32':
            return this.d2i(Number(value));
        case 'System.Int64':
            return this.d2l(Number(value));
        case 'System.Double':
            return Number(value);
        case 'System.Single':
            return Math.fround(Number(value));
        case 'System.Boolean':
            return !!value;
        case 'System.String':
            return value === null || value === undefined ? null : String(value);
        case 'System.Object':
            return value;
        case 'V4Script.JsValue':
            return this.jsValue(value);
        }
        return value;
    };

    // Calls JavaScript: an error becomes a JsException.
    R.guard = function (callback) {
        try {
            return callback();
        } catch (error) {
            if (this.isException(error))
                throw error;
            var converted = this.exception('V4Script.JsException', error !== null && error !== undefined && error.message !== undefined
                ? String(error.name || 'Error') + ': ' + String(error.message) : String(error));
            converted.jsError = error;
            throw converted;
        }
    };

    // --- System.Type

    R.typeObject = function (type) {
        if (type.$typeObject === undefined) {
            var Type = this.type('System.RuntimeType');
            var object = new Type();
            object.$type = type;
            type.$typeObject = object;
        }
        return type.$typeObject;
    };

    // The text of an exception for an unhandled one: Type: message and the
    // inner exceptions.
    R.exceptionText = function (exception) {
        var text = exception.ToString$0();
        return text === null || text === undefined ? '' : String(text);
    };

    // The JavaScript name of a member of a library type (interface members
    // of the run time: GetEnumerator, MoveNext, Current, Dispose...).
    R.memberName = function (typeName, member, arity) {
        var cache = this.memberNames || (this.memberNames = Object.create(null));
        var key = typeName + '.' + member + '/' + arity;
        var found = cache[key];
        if (found === undefined) {
            var sym = this.session.symtab.typeNamed(typeName).complete();
            var list = (sym.members[member] || []).slice();
            sym.memberList.forEach(function (item) {
                if (item.symbolKind === 'property' || item.symbolKind === 'event')
                    [item.getter, item.setter, item.adder, item.remover].forEach(function (accessor) {
                        if (accessor !== null && accessor !== undefined && accessor.name === member)
                            list.push(accessor);
                    });
            });
            list = list.filter(function (item) {
                return item !== null && item !== undefined && item.symbolKind === 'method' && item.params.length === arity &&
                    !item.explicitIface;
            });
            if (list.length === 0)
                throw new Error('C# library member is missing: ' + key);
            found = cache[key] = list[0].jsName;
        }
        return found;
    };

    // The JavaScript name of a library method by its native key:
    // methodByKey('System.IO.TextWriter', 'Write(string)').
    R.methodByKey = function (typeName, key) {
        var cache = this.methodKeys || (this.methodKeys = Object.create(null));
        var full = typeName + '.' + key;
        var found = cache[full];
        if (found === undefined) {
            var sym = this.session.symtab.typeNamed(typeName).complete();
            var methods = sym.ctors.slice();
            sym.memberList.forEach(function (member) {
                if (member.symbolKind === 'method')
                    methods.push(member);
                else if (member.symbolKind === 'property' || member.symbolKind === 'event')
                    [member.getter, member.setter, member.adder, member.remover].forEach(function (method) {
                        if (method !== null && method !== undefined)
                            methods.push(method);
                    });
            });
            var match = methods.filter(function (method) { return CS.nativeKey(method) === key; });
            if (match.length === 0)
                throw new Error('C# library method is missing: ' + full);
            found = cache[full] = match[0].jsName;
        }
        return found;
    };

    // A type of the units by its full name (Type.GetType).
    R.userTypeNamed = function (name) {
        var found = null;
        var runtime = this;
        Object.keys(this.K).forEach(function (id) {
            var descriptor = Object.getOwnPropertyDescriptor(runtime.K, id);
            if (found === null && descriptor.value !== undefined && descriptor.value.$name === name)
                found = descriptor.value;
        });
        return found;
    };

    R.enumerableMethod = function () {
        return this.memberName('System.Collections.Generic.IEnumerable`1', 'GetEnumerator', 0);
    };
    R.moveNextMethod = function () {
        return this.memberName('System.Collections.IEnumerator', 'MoveNext', 0);
    };
    R.currentMethod = function () {
        return this.memberName('System.Collections.Generic.IEnumerator`1', 'get_Current', 0);
    };
    R.disposeMethod = function () {
        return this.memberName('System.IDisposable', 'Dispose', 0);
    };
    R.formattableMethod = function () {
        return this.memberName('System.IFormattable', 'ToString', 2);
    };
    R.collectionAddName = function (type) {
        var def = type.$def !== null && type.$def !== undefined ? type.$def : type;
        var sym = null;
        Object.keys(this.session.symtab.loadedUnits).forEach(function () {});
        sym = this.session.symbolOfType(def);
        var list = sym === null ? [] : CS.lookupMembers(CS.selfType(sym), 'Add').filter(function (entry) {
            return entry.member.params.length === 1 && !entry.member.isStatic;
        });
        if (list.length === 0)
            throw this.exception('System.InvalidOperationException', 'The collection has no Add method.');
        return list[0].member.jsName;
    };

    // The start of a run: fibers of earlier runs are gone.
    R.resetRun = function () {
        this.threads = [];
    };

    // A value for formatting: {x:F2}.
    R.formatValue = function (type, value, format) {
        if (value === null || value === undefined)
            return '';
        if (type.$formatWith !== undefined)
            return type.$formatWith(value, format);
        if (type.$kind === 'enum')
            return this.enumFormat(type, value, format);
        if (type.$def !== null && type.$def !== undefined && type.$def.$name === 'System.Nullable`1')
            return this.formatValue(type.$args[0], value, format);
        var object = type.$struct || type.$primitive ? this.box(type, value) : value;
        return this.formatObject(object, format);
    };

    // An object with a format: IFormattable.ToString(format, null) or ToString().
    R.formatObject = function (value, format) {
        if (value === null || value === undefined)
            return '';
        var type = this.typeOf(value);
        if (type !== null && type.$formatWith !== undefined)
            return type.$formatWith(value.$boxed === true ? value.v : value, format);
        if (type !== null && type.$kind === 'enum')
            return this.enumFormat(type, value.$boxed === true ? value.v : value, format);
        var name = this.formattableMethod();
        if (typeof value[name] === 'function')
            return this.s(value[name](format, null));
        return this.objectString(value);
    };

    R.enumFormat = function (type, value, format) {
        switch (format.toUpperCase()) {
        case 'D':
            return String(value);
        case 'X': {
            var hex = (typeof value === 'number' ? value >>> 0 : value).toString(16).toUpperCase();
            while (hex.length < 8)
                hex = '0' + hex;
            return hex;
        }
        }
        return this.enumName(type, value);
    };

    // {x,10}: padding to the width (negative - to the left).
    R.align = function (text, width) {
        if (width >= 0) {
            while (text.length < width)
                text = ' ' + text;
            return text;
        }
        while (text.length < -width)
            text += ' ';
        return text;
    };
})(globalThis);
