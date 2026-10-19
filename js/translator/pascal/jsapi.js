// Pascal: JavaScript values (the type JSValue), host modules, the value of
// a unit and small helpers of the translated code (number formatting, Val,
// FillChar).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Pascal = T.pascal;
    var Runtime = Pascal.Runtime;
    if (Runtime.prototype.jg)
        return;

    var utf8 = T.utf8;
    var i64 = T.i64;
    var types = Pascal.types;

    // --- Helpers of the code

    Runtime.prototype.real = function (value, rk, width, digits) {
        return Pascal.strReal(width, digits, value, rk);
    };
    Runtime.prototype.pad = function (text, width) {
        return Pascal.pad(text, width);
    };
    Runtime.prototype.toUnits = function (value, scale) {
        return Pascal.toUnits(value, scale);
    };
    Runtime.prototype.strWidth = function (width, real) {
        return Pascal.strWidth(width, real);
    };
    Runtime.prototype.valInt = function (text, ik) {
        return Pascal.valInt(text, ik);
    };
    Runtime.prototype.valReal = function (text) {
        return Pascal.valReal(text);
    };
    // Val for an enum: the name, case-insensitive.
    Runtime.prototype.valEnum = function (text, names) {
        var wanted = text.trim().toLowerCase();
        for (var key in names) {
            if (Object.prototype.hasOwnProperty.call(names, key) && names[key].toLowerCase() === wanted)
                return { value: Number(key), code: 0 };
        }
        return { value: 0, code: 1 };
    };
    Runtime.prototype.assertFail = function (message, where) {
        var made = this.session.makeException('eassertionfailed', message + where);
        if (made !== null) {
            made.stack = new Error(message).stack;
            throw made;
        }
        throw new Pascal.RunError(227, message + where);
    };
    Runtime.prototype.ipower = function (value, exponent) {
        if (typeof exponent !== 'number')
            exponent = i64.toFloat(exponent);
        if (exponent < 0)
            return 0;
        var result = 1;
        var base = value;
        while (exponent > 0) {
            if (exponent % 2 === 1)
                result = i64.mul(result, base);
            base = i64.mul(base, base);
            exponent = Math.floor(exponent / 2);
        }
        return result;
    };
    Runtime.prototype.abs64 = function (value) {
        if (typeof value === 'number')
            return Math.abs(value);
        return value.hi < 0 ? i64.neg(value) : value;
    };
    Runtime.prototype.pointerString = function (value) {
        if (value === null || value === undefined)
            return '';
        return typeof value === 'string' ? value : String(value);
    };
    // A value of a procedural type before a call.
    Runtime.prototype.callable = function (fn) {
        if (fn === null || fn === undefined)
            this.re(216);
        return fn;
    };

    // FillChar: zeros for all elements; a byte for characters and bytes,
    // for integers the byte repeated in every byte of the element.
    Runtime.prototype.fillChar = function (target, type, count, value) {
        value &= 255;
        if (type.kind === 'record') {
            if (value === 0) {
                type.assign(target, type.zero());
                return;
            }
            this.re(201, 'FillChar of a record with a non-zero value is not supported');
        }
        var element = type.of;
        var size = types.sizeOf(element);
        var elementCount = Math.min(target.length, Math.floor(Number(count) / size));
        var filler = Pascal.fillValue(element, value);
        for (var index = 0; index < elementCount; ++index) {
            if (types.isAggregate(element))
                this.fillChar(target[index], element, types.sizeOf(element), value);
            else
                target[index] = filler;
        }
    };
    Runtime.prototype.fillScalar = function (type, value) {
        return Pascal.fillValue(type, value & 255);
    };
    Pascal.fillValue = function (type, byte) {
        switch (type.kind) {
        case 'int': {
            var size = type.size;
            if (size === 8)
                return byte === 0 ? 0 : (byte === 255 ? (type.ik === 'u64' ? T.u64.make(-1, -1) : -1) : i64.make(byte * 0x1010101 | 0, byte * 0x1010101 | 0));
            var made = 0;
            for (var index = 0; index < size; ++index)
                made = made * 256 + byte;
            var wrapped = Pascal.wrapConstant(made, type);
            return typeof wrapped === 'number' ? wrapped : T.big.toFloat(wrapped);
        }
        case 'char':
            return byte;
        case 'bool':
            return byte !== 0;
        case 'real':
            return 0;
        case 'string':
            return '';
        case 'enum':
            return byte;
        }
        return byte === 0 ? type.zero() : null;
    };
    // Move(src, dst, bytes) for arrays of one kind.
    Runtime.prototype.move = function (source, target, type, count) {
        var element = type.of || type;
        var size = types.sizeOf(element);
        var elementCount = Math.floor(Number(count) / size);
        if (source === target)
            return;
        var copy = Array.prototype.slice.call(source, 0, elementCount);
        for (var index = 0; index < elementCount && index < target.length; ++index)
            target[index] = copy[index];
    };

    // --- JavaScript values

    function target(rt, value) {
        if (value === null || value === undefined)
            rt.re(216);
        return value;
    }

    Runtime.prototype.jg = function (object, key) {
        object = target(this, object);
        return object[key];
    };
    Runtime.prototype.jset = function (object, key, value) {
        object = target(this, object);
        object[key] = value;
        return value;
    };
    Runtime.prototype.jc = function (object, key, args) {
        object = target(this, object);
        var fn = object[key];
        if (typeof fn !== 'function')
            throw new T.LanguageError("JavaScript: '" + key + "' is not a function");
        return fn.apply(object, args);
    };
    Runtime.prototype.ja = function (value, args) {
        value = target(this, value);
        if (typeof value === 'function')
            return value.apply(null, args);
        if (args.length !== 1)
            this.re(219);
        return value[args[0]];
    };
    Runtime.prototype.jtrue = function (value) {
        return !!value;
    };
    Runtime.prototype.jadd = function (left, right) {
        return left + right;
    };
    Runtime.prototype.jcmp = function (left, right, op) {
        switch (op) {
        case '=': return left === right;
        case '<>': return left !== right;
        case '<': return left < right;
        case '>': return left > right;
        case '<=': return left <= right;
        }
        return left >= right;
    };

    // A JavaScript value in Pascal: kind - int, real, string, char, bool, object.
    Runtime.prototype.jto = function (value, kind) {
        switch (kind) {
        case 'int': {
            var number = this.jnumber(value);
            if (!isFinite(number))
                this.re(219);
            var rounded = Math.round(number);
            if (Math.abs(number - Math.trunc(number)) === 0.5 && rounded % 2 !== 0)
                rounded -= 1;
            return this.toInt64(rounded);
        }
        case 'real':
            return this.jnumber(value);
        case 'string':
            return this.jbytes(value);
        case 'char': {
            var text = this.jbytes(value);
            return text.length > 0 ? text.charCodeAt(0) : 0;
        }
        case 'bool':
            return !!value;
        case 'object':
            if (value === null || value === undefined)
                return null;
            if (typeof value === 'object' && value.$pascal === true)
                return value;
            this.re(219);
        }
        return value;
    };
    Runtime.prototype.jnumber = function (value) {
        if (typeof value === 'number')
            return value;
        if (typeof value === 'boolean')
            return value ? 1 : 0;
        if (value === null || value === undefined)
            return 0;
        if (typeof value === 'string' && value.trim().length > 0 && isFinite(Number(value)))
            return Number(value);
        this.re(219);
    };
    // The text of a JavaScript value as UTF-8 bytes.
    Runtime.prototype.jbytes = function (value) {
        if (typeof value === 'string')
            return utf8.encode(value);
        if (value === null || value === undefined)
            return '';
        if (typeof value === 'number' || typeof value === 'boolean')
            return String(value);
        return utf8.encode(this.env.host.format(value));
    };
    // Write of a JavaScript value: as the console shows it.
    Runtime.prototype.jstr = function (value) {
        if (typeof value === 'string')
            return utf8.encode(value);
        return utf8.encode(this.env.host.format(value === undefined ? null : value));
    };
    Runtime.prototype.jfromInt64 = function (value) {
        return typeof value === 'number' ? value : i64.toFloat(value);
    };
    Runtime.prototype.jfromValue = function (value, type) {
        return this.toJsValue(value, type, 0);
    };

    // A Pascal value in JavaScript by its type.
    Runtime.prototype.toJsValue = function (value, type, depth) {
        var self = this;
        if (depth > 16)
            return null;
        switch (type.kind) {
        case 'int':
            return typeof value === 'number' ? value : i64.toFloat(value);
        case 'real':
        case 'bool':
        case 'js':
            return value;
        case 'char':
            return type.wide ? String.fromCharCode(value) : utf8.decode(String.fromCharCode(value));
        case 'string':
            return utf8.decode(value);
        case 'enum':
            return Pascal.enumName(type, value);
        case 'set':
            return this.selements(value, type.small || type.of === null).map(function (element) {
                return type.of !== null && type.of !== undefined
                    ? self.toJsValue(element, type.of, depth + 1)
                    : element;
            });
        case 'array':
        case 'dynarray':
        case 'openarray': {
            var list = [];
            var count = Math.min(value.length, 100000);
            for (var index = 0; index < count; ++index)
                list.push(this.toJsValue(value[index], type.of, depth + 1));
            return list;
        }
        case 'record': {
            var object = {};
            type.fields.forEach(function (field) {
                object[utf8.decode(field.text)] = self.toJsValue(value[field.js], field.type, depth + 1);
            });
            return object;
        }
        case 'proc':
            return value === null ? null : this.jfunction(value, type);
        case 'pointer':
        case 'class':
        case 'classref':
        case 'nil':
            return value;
        }
        return value === undefined ? null : value;
    };

    // A JavaScript value in Pascal by a type (the arguments of JSFunction).
    Runtime.prototype.fromJsValue = function (value, type) {
        switch (type.kind) {
        case 'int':
            return Pascal.wrapNumber(this.jto(value, 'int'), type);
        case 'real':
            return type.rk === 'f32' ? Math.fround(this.jto(value, 'real')) : this.jto(value, 'real');
        case 'string':
            return this.jto(value, 'string');
        case 'char':
            return this.jto(value, 'char');
        case 'bool':
            return !!value;
        case 'js':
            return value === undefined ? null : value;
        case 'class':
            return this.jto(value, 'object');
        case 'dynarray':
        case 'openarray': {
            var self = this;
            var items = Array.isArray(value) ? value.map(function (item) { return self.fromJsValue(item, type.of); }) : [];
            return this.arrayOf(type.kind === 'openarray' ? new Pascal.Type('dynarray', { name: null, of: type.of }) : type, items);
        }
        }
        this.re(219);
    };

    // An integer by a type (truncated, as an assignment).
    Pascal.wrapNumber = function (value, type) {
        if (type.ik === 'i64' || type.ik === 'u64')
            return value;
        var number = typeof value === 'number' ? value : i64.low32(value);
        switch (type.ik) {
        case 'i32': return number | 0;
        case 'u32': return number >>> 0;
        case 'i16': return number << 16 >> 16;
        case 'u16': return number & 65535;
        case 'i8': return number << 24 >> 24;
        case 'u8': return number & 255;
        }
        return number;
    };

    // A procedural value as a JavaScript function (JSFunction).
    Runtime.prototype.jfunction = function (fn, type) {
        if (fn === null || fn === undefined)
            return null;
        if (fn.$jsFunction !== undefined)
            return fn.$jsFunction;
        var self = this;
        var made = function () {
            var args = [];
            for (var index = 0; index < type.params.length; ++index) {
                var param = type.params[index];
                if (param.mode === 'var' || param.mode === 'out')
                    throw new T.LanguageError('JSFunction: var parameters are not supported');
                args.push(param.type === null ? arguments[index] : self.fromJsValue(arguments[index], param.type));
            }
            try {
                var result = fn.apply(null, args);
                return type.result === null ? undefined : self.toJsValue(result, type.result, 0);
            } finally {
                if (!self.session.running)
                    self.flush();
            }
        };
        fn.$jsFunction = made;
        return made;
    };

    // --- Host modules

    var PASCAL_TYPES = { string: 'String', number: 'Double', int: 'Int64', bool: 'Boolean', value: 'JSValue',
                         array: 'JSValue' };

    // A host module as a library unit: unit App with external routines (a
    // getter is a function without parameters, a function without a value
    // is a procedure, optional parameters give overloads). skip(name) -
    // routines to leave out (names of System for the unit used implicitly).
    Pascal.hostUnit = function (module, title, skip) {
        var lines = ['unit ' + title + ';', 'interface'];
        var routines = Object.create(null);
        module.functions.forEach(function (fn) {
            var name = fn.names.pascal;
            var key = name.toLowerCase();
            if (skip !== null && skip(key))
                return;
            var parameters = fn.getter ? [] : fn.parameters;
            var first = fn.getter ? 0 : fn.required;
            var list = [];
            for (var count = first; count <= parameters.length; ++count) {
                var declared = parameters.slice(0, count).map(function (parameter, index) {
                    return 'p' + (index + 1) + ': ' + PASCAL_TYPES[parameter.type];
                }).join('; ');
                var heading = (fn.result === 'void' ? 'procedure ' : 'function ') + name +
                    (declared.length > 0 ? '(' + declared + ')' : '') +
                    (fn.result === 'void' ? '' : ': ' + PASCAL_TYPES[fn.result]) + ';';
                lines.push(heading + (parameters.length > first ? ' overload;' : '') + ' external;');
                list.push(hostRoutine(fn, parameters.slice(0, count)));
            }
            routines[key] = list.length === 1 ? list[0] : list;
        });
        lines.push('implementation', 'end.');
        return {
            title: title,
            source: lines.join('\n'),
            natives: function (rt) {
                Object.keys(routines).forEach(function (key) {
                    var made = routines[key];
                    (Array.isArray(made) ? made : [made]).forEach(function (routine) { routine.rt = rt; });
                });
                var bound = {};
                Object.keys(routines).forEach(function (key) {
                    var made = routines[key];
                    bound[key] = Array.isArray(made) ? made.map(function (routine) { return routine.call; })
                                                     : made.call;
                });
                return { methods: {}, routines: bound };
            }
        };
    };

    function hostRoutine(fn, parameters) {
        var routine = { rt: null };
        routine.call = function () {
            var rt = routine.rt;
            var values = [];
            for (var index = 0; index < parameters.length; ++index) {
                var value = arguments[index];
                switch (parameters[index].type) {
                case 'string':
                    values.push(utf8.decode(value));
                    break;
                case 'int':
                    values.push(i64.toFloat(value));
                    break;
                default:
                    values.push(value);
                }
            }
            rt.flush();
            var result = fn.invoke(values);
            switch (fn.result) {
            case 'void':
                return undefined;
            case 'string':
                return utf8.encode(result === null || result === undefined ? '' : String(result));
            case 'number':
                return Number(result);
            case 'int':
                return i64.fromFloat(Number(result) || 0);
            case 'bool':
                return !!result;
            }
            return result === undefined ? null : result;
        };
        return routine;
    }
    Runtime.prototype.jnew = function (constructor, args) {
        constructor = target(this, constructor);
        return new (Function.prototype.bind.apply(constructor, [null].concat(args)))();
    };

    // The value of a unit: how the console shows it.
    Runtime.prototype.show = function (value, type) {
        if (type.kind === 'int')
            return typeof value === 'number' ? value : (type.ik === 'u64' ? T.u64.str(value) : i64.str(value));
        if (type.kind === 'class' && value !== null && value !== undefined && value.$pascal === true)
            return '<' + value.constructor.$name + '>';
        if (type.kind === 'classref' && value !== null)
            return '<class ' + value.$name + '>';
        if (type.kind === 'pointer')
            return value === null ? null : '<pointer>';
        if (type.kind === 'file')
            return '<file>';
        return this.toJsValue(value, type, 0);
    };
})(globalThis);
