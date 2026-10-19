// C: JavaScript values (js_value). A js_value is a handle: a number
// outside the data memory under which the session keeps the value; NULL is
// null and undefined. C strings are UTF-8 text in JavaScript, C functions
// are JavaScript functions that convert their arguments to the parameter
// types.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var C = T.c;
    if (C.jsApi)
        return;

    var rt = C.runtime;
    var CError = rt.CError;
    var i64 = T.i64, u64 = T.u64, utf8 = T.utf8;
    var types = C.types;

    var HANDLE_BASE = 0x80000000;
    rt.HANDLE_BASE = HANDLE_BASE;

    function isCharPointer(type) {
        return type.kind === 'pointer' && C.isInteger(type.to) && type.to.size === 1 && type.to !== types.bool;
    }
    C.isCharPointer = isCharPointer;

    function isJsValue(type) {
        return type.kind === 'pointer' && C.isRecord(type.to) && type.to.tag === 'js_object';
    }
    C.isJsValue = isJsValue;

    // The kind of a variable argument for natives: pointers to char,
    // js_value and functions differ.
    C.argumentTag = function (type, original) {
        if (original === types.bool)
            return 'bool';
        if (type.kind === 'pointer') {
            if (isCharPointer(type))
                return 'str';
            if (isJsValue(type))
                return 'js';
            if (type.to.kind === 'function')
                return 'fn';
        }
        return C.kindOf(type);
    };

    function jsErrorText(error) {
        if (error !== null && typeof error === 'object' && error.message !== undefined)
            return (error.name && error.name !== 'Error' ? error.name + ': ' : '') + error.message;
        return String(error);
    }

    C.jsApi = function (session, table) {
        var memory = session.memory;
        var env = session.env;
        var handles = [];
        var known = new Map();
        var functions = new Map();

        function toHandle(value) {
            if (value === null || value === undefined)
                return 0;
            var handle = known.get(value);
            if (handle !== undefined)
                return handle;
            handle = HANDLE_BASE + handles.length * 8;
            handles.push(value);
            known.set(value, handle);
            return handle;
        }

        function fromHandle(handle) {
            if (handle === 0)
                return null;
            var index = (handle - HANDLE_BASE) / 8;
            if (index >= 0 && index === Math.floor(index) && index < handles.length)
                return handles[index];
            throw new CError('invalid js_value 0x' + (handle >>> 0).toString(16), 139);
        }
        session.toHandle = toHandle;
        session.fromHandle = fromHandle;

        function text(address) {
            return address === 0 ? null : utf8.decode(memory.cstring(address));
        }

        // A C value by the kind of a variable argument, in JavaScript.
        function tagToJS(value, tag) {
            switch (tag) {
            case 'str':
                return text(value);
            case 'js':
                return fromHandle(value);
            case 'fn':
                return value === 0 ? null : jsFunction(value);
            case 'bool':
                return value !== 0;
            case 'i64':
                return i64.toFloat(value);
            case 'u64':
            case 'ptr':
                return u64.toFloat(value);
            }
            return value;
        }

        // A C value by its type, in JavaScript.
        function typedToJS(value, type) {
            if (type.kind === 'void')
                return undefined;
            if (type === types.bool)
                return value !== 0;
            if (isCharPointer(type))
                return text(value);
            if (isJsValue(type))
                return fromHandle(value);
            if (type.kind === 'pointer' && type.to.kind === 'function')
                return value === 0 ? null : jsFunction(value);
            if (C.isRecord(type))
                throw new CError('structures cannot be passed to JavaScript', 1);
            var kind = C.kindOf(type);
            return kind === 'i64' ? i64.toFloat(value) : (kind === 'u64' || kind === 'ptr' ? u64.toFloat(value) : value);
        }
        session.typedToJS = typedToJS;

        // A JavaScript value in a C type.
        function fromJS(value, type) {
            if (type === types.bool)
                return value ? 1 : 0;
            if (isCharPointer(type))
                return value === null || value === undefined ? 0 : memory.newString(utf8.encode(String(value)));
            if (isJsValue(type))
                return toHandle(value);
            if (type.kind === 'pointer') {
                if (typeof value === 'function')
                    throw new CError('a JavaScript function cannot be passed as a C function pointer', 1);
                return typeof value === 'number' ? value >>> 0 : 0;
            }
            if (C.isRecord(type) || type.kind === 'valist')
                throw new CError('structures cannot be passed from JavaScript', 1);
            var number = typeof value === 'boolean' ? (value ? 1 : 0) : Number(value);
            return rt.convertKind(number !== number ? 0 : number, 'f64', C.kindOf(type));
        }

        // JavaScript arguments for the variable part: the kind by the value.
        function guessArguments(values) {
            var list = { v: [], t: [] };
            values.forEach(function (value) {
                if (typeof value === 'number') {
                    list.v.push(value);
                    list.t.push(Number.isInteger(value) && Math.abs(value) <= 2147483647 ? 'i32' : 'f64');
                } else if (typeof value === 'boolean') {
                    list.v.push(value ? 1 : 0);
                    list.t.push('i32');
                } else if (typeof value === 'string') {
                    list.v.push(memory.newString(utf8.encode(value)));
                    list.t.push('str');
                } else {
                    list.v.push(toHandle(value));
                    list.t.push('js');
                }
            });
            return list;
        }

        // A C function as a JavaScript function; its type is looked up by
        // the address at the call (another unit may have redefined it).
        function jsFunction(address) {
            var made = functions.get(address);
            if (made !== undefined)
                return made;
            made = function () {
                var callable = memory.callable(address);
                var type = session.functionType(address);
                var args = [];
                var params = type !== null ? type.params : [];
                if (type !== null && C.isRecord(type.returns))
                    throw new CError('a function returning a structure cannot be called from JavaScript', 1);
                for (var index = 0; index < params.length; ++index)
                    args.push(fromJS(arguments[index], params[index]));
                if (type === null || type.variadic)
                    args.push(guessArguments(Array.prototype.slice.call(arguments, params.length)));
                var saved = memory.sp;
                try {
                    var result = callable.apply(null, args);
                    return type === null ? result : typedToJS(result, type.returns);
                } finally {
                    memory.sp = saved;
                    session.flushOutput();
                }
            };
            functions.set(address, made);
            return made;
        }

        function argumentsOf(list) {
            var values = [];
            if (list === null || list === undefined)
                return values;
            for (var index = 0; index < list.v.length; ++index)
                values.push(tagToJS(list.v[index], list.t[index]));
            return values;
        }

        // A JavaScript call: an exception becomes a C error with its text and stack.
        function guard(callback) {
            try {
                return callback();
            } catch (error) {
                if (error instanceof T.LanguageError)
                    throw error;
                var failure = new CError(jsErrorText(error), 1);
                if (error !== null && typeof error === 'object' && /translated\//.test(String(error.stack || '')))
                    failure.stack = error.stack;
                throw failure;
            }
        }

        function target(handle, what) {
            var value = fromHandle(handle);
            if (value === null || value === undefined)
                throw new CError(what + ': the value is null', 1);
            return value;
        }

        function call(name, args) {
            var notes = env.global;
            return guard(function () { return notes[name].apply(notes, args); });
        }

        var api = {
            js_global: function () {
                return toHandle(env.global);
            },
            js_get: function (object, name) {
                var value = target(object, 'js_get');
                return toHandle(guard(function () { return value[text(name)]; }));
            },
            js_set: function (object, name, list) {
                var value = target(object, 'js_set');
                var property = text(name);
                var values = argumentsOf(list);
                guard(function () { value[property] = values[0]; });
            },
            js_call: function (object, method, list) {
                var value = target(object, 'js_call');
                var name = text(method);
                var fn = value[name];
                if (typeof fn !== 'function')
                    throw new CError("js_call: property '" + name + "' is not a function", 1);
                var values = argumentsOf(list);
                return toHandle(guard(function () { return fn.apply(value, values); }));
            },
            js_invoke: function (fn, list) {
                var callee = target(fn, 'js_invoke');
                if (typeof callee !== 'function')
                    throw new CError('js_invoke: the value is not a function', 1);
                var values = argumentsOf(list);
                return toHandle(guard(function () { return callee.apply(null, values); }));
            },
            js_new: function (constructor, list) {
                var callee = target(constructor, 'js_new');
                var values = argumentsOf(list);
                return toHandle(guard(function () {
                    return new (Function.prototype.bind.apply(callee, [null].concat(values)))();
                }));
            },
            js_index: function (array, index) {
                var value = target(array, 'js_index');
                return toHandle(value[i64.toFloat(index)]);
            },
            js_set_index: function (array, index, list) {
                var value = target(array, 'js_set_index');
                var values = argumentsOf(list);
                guard(function () { value[i64.toFloat(index)] = values[0]; });
            },
            js_length: function (value) {
                var object = target(value, 'js_length');
                return Number(object.length) || 0;
            },
            js_number: function (value) {
                return Number(fromHandle(value));
            },
            js_int: function (value) {
                return i64.fromFloat(Number(fromHandle(value)) || 0);
            },
            js_string: function (value) {
                var object = fromHandle(value);
                return memory.newString(utf8.encode(typeof object === 'string' ? object : env.host.format(object)));
            },
            js_bool: function (value) {
                return fromHandle(value) ? 1 : 0;
            },
            js_is_null: function (value) {
                var object = fromHandle(value);
                return object === null || object === undefined ? 1 : 0;
            },
            js_type: function (value) {
                var object = fromHandle(value);
                return session.literal(utf8.encode(object === null ? 'null' : typeof object), false);
            },
            js_from_int: function (value) {
                return toHandle(i64.toFloat(value));
            },
            js_from_double: function (value) {
                return toHandle(value);
            },
            js_from_string: function (value) {
                return toHandle(text(value));
            },
            js_from_bool: function (value) {
                return toHandle(value !== 0);
            },
            js_array: function (count, list) {
                var values = argumentsOf(list);
                return toHandle(values.slice(0, Math.max(0, count)));
            },
            js_object: function (key, list) {
                var object = {};
                var index = 0;
                var name = key;
                while (name !== 0) {
                    if (index >= list.v.length)
                        throw new CError("js_object: no value for key '" + text(name) + "'", 1);
                    object[text(name)] = tagToJS(list.v[index], list.t[index]);
                    ++index;
                    if (index >= list.v.length)
                        break;
                    name = rt.convertKind(list.v[index], C.baseKind(list.t[index]), 'ptr');
                    ++index;
                }
                return toHandle(object);
            },
            js_function: function (fn) {
                memory.callable(fn);
                return toHandle(jsFunction(fn));
            }
        };
        Object.keys(api).forEach(function (name) {
            table[name] = api[name];
        });

        // Functions of the host modules: arguments by the declared types.
        session.hostHeaders.forEach(function (header) {
            header.names.forEach(function (item) {
                table[item.name] = hostFunction(item.fn);
            });
        });

        // A value parameter is declared js_value, and C converts any pointer
        // to it silently: a string or a function in its place is taken by
        // its address (handles and functions lie outside the data memory).
        function anyValue(address) {
            if (address === 0 || address >= HANDLE_BASE)
                return fromHandle(address);
            if (address >= rt.FUNCTION_BASE)
                return jsFunction(address);
            return text(address);
        }

        function hostFunction(fn) {
            var parameters = fn.getter ? [] : fn.parameters;
            return function () {
                var args = [];
                for (var index = 0; index < parameters.length; ++index) {
                    var value = arguments[index];
                    switch (parameters[index].type) {
                    case 'string':
                        args.push(text(value));
                        break;
                    case 'int':
                        args.push(i64.toFloat(value));
                        break;
                    case 'bool':
                        args.push(value !== 0);
                        break;
                    case 'value':
                        args.push(anyValue(value));
                        break;
                    case 'array':
                        args.push(fromHandle(value));
                        break;
                    default:
                        args.push(value);
                    }
                }
                var result = guard(function () { return fn.invoke(args); });
                switch (fn.result) {
                case 'void':
                    return undefined;
                case 'string':
                    return result === null || result === undefined ? 0 : memory.newString(utf8.encode(String(result)));
                case 'int':
                    return i64.fromFloat(Number(result) || 0);
                case 'number':
                    return Number(result);
                case 'bool':
                    return result ? 1 : 0;
                }
                return toHandle(result);
            };
        }
    };
})(globalThis);
