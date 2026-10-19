// Forth: JavaScript values and host modules. A JavaScript value in Forth
// is a handle cell (a number from HANDLE_BASE) under which the system
// keeps the value; Forth numbers go to JavaScript as numbers.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Forth = T.forth;
    if (Forth.installJsWords)
        return;

    var ForthError = Forth.ForthError;
    var i64 = T.i64, utf8 = T.utf8;
    var EMPTY = Forth.STACK_EMPTY;
    var HANDLE_BASE = 281474976710656;   // 2^48
    var MAX_HANDLES = 1 << 24;

    function jsErrorText(error) {
        if (error !== null && typeof error === 'object' && error.message !== undefined)
            return (error.name && error.name !== 'Error' ? error.name + ': ' : '') + error.message;
        return String(error);
    }

    Forth.installJsWords = function (system) {
        var handles = [null, undefined];
        var known = new Map();
        var functions = new Map();
        var env = system.env;
        var memory = system.m;

        function toHandle(value) {
            if (value === null)
                return HANDLE_BASE;
            if (value === undefined)
                return HANDLE_BASE + 1;
            var handle = known.get(value);
            if (handle !== undefined)
                return handle;
            if (handles.length >= MAX_HANDLES)
                throw new ForthError(-8, 'Too many JavaScript values');
            handle = HANDLE_BASE + handles.length;
            handles.push(value);
            known.set(value, handle);
            return handle;
        }

        function isHandle(cell) {
            return typeof cell === 'number' && cell >= HANDLE_BASE && cell < HANDLE_BASE + handles.length;
        }

        function fromHandle(cell) {
            if (cell === 0)
                return null;
            if (!isHandle(cell))
                throw new ForthError(-12, 'Not a JavaScript value: ' + i64.str(cell));
            return handles[cell - HANDLE_BASE];
        }

        // An argument for JavaScript: a handle gives its value, anything else a number.
        function toJS(cell) {
            if (isHandle(cell))
                return handles[cell - HANDLE_BASE];
            return typeof cell === 'number' ? cell : i64.toFloat(cell);
        }

        function target(cell, what) {
            var value = fromHandle(cell);
            if (value === null || value === undefined)
                throw new ForthError(-12, what + ': the value is null');
            return value;
        }

        // A JavaScript call: an exception becomes a Forth error with its text.
        function guard(callback) {
            try {
                return callback();
            } catch (error) {
                if (error instanceof T.LanguageError)
                    throw error;
                var failure = new ForthError(Forth.JS_ERROR, jsErrorText(error));
                if (error !== null && typeof error === 'object' && /translated\//.test(String(error.stack || '')))
                    failure.stack = error.stack;
                throw failure;
            }
        }

        function pop() {
            return system.pop();
        }

        function push(value) {
            system.push(value);
        }

        function popString() {
            var length = pop(), address = pop();
            return utf8.decode(system.text(address, length));
        }

        function popArguments() {
            var count = system.count(pop());
            var values = [];
            for (var index = 0; index < count; ++index)
                values.unshift(toJS(pop()));
            return values;
        }

        // A Forth word as a JavaScript function: the arguments go to the
        // stacks (integers and flags as cells, floats to the float stack, a
        // string as an address and a length, the rest as a handle), the
        // result is the top cell (a handle as its value) or the top float.
        function jsFunction(xt) {
            var made = functions.get(xt);
            if (made !== undefined)
                return made;
            made = function () {
                var savedSp = system.sp, savedFp = system.fp;
                var base = Math.max(system.sp, EMPTY);
                system.sp = base;
                var floatBase = Math.max(system.fp, EMPTY);
                system.fp = floatBase;
                try {
                    for (var index = 0; index < arguments.length; ++index) {
                        var value = arguments[index];
                        if (typeof value === 'number') {
                            if (Number.isInteger(value) && Math.abs(value) <= i64.MAX_SAFE)
                                push(value);
                            else
                                system.pushFloat(value);
                        } else if (typeof value === 'boolean') {
                            push(value ? -1 : 0);
                        } else if (typeof value === 'string') {
                            var bytes = utf8.encode(value);
                            push(system.transientString(bytes));
                            push(bytes.length);
                        } else if (value === null || value === undefined) {
                            push(0);
                        } else {
                            push(toHandle(value));
                        }
                    }
                    system.sp = system.execute(xt, system.sp);
                    if (system.sp > base) {
                        var cell = system.S[system.sp];
                        return isHandle(cell) ? handles[cell - HANDLE_BASE] : i64.toFloat(cell);
                    }
                    if (system.fp > floatBase)
                        return system.FS[system.fp];
                    return undefined;
                } finally {
                    system.sp = savedSp;
                    system.fp = savedFp;
                    if (!system.running)
                        system.flushOutput();
                }
            };
            functions.set(xt, made);
            return made;
        }

        var nativeWord = function (name, body) {
            var word = new Forth.Word(system, name, 'native');
            word.fn = function (sp) {
                system.sp = sp;
                body();
                return system.sp;
            };
            system.forth.add(word);
            return word;
        };

        nativeWord('JS-GLOBAL', function () { push(toHandle(env.global)); });
        nativeWord('JS-NULL', function () { push(HANDLE_BASE); });
        nativeWord('JS-UNDEFINED', function () { push(HANDLE_BASE + 1); });
        nativeWord('JS-GET', function () {
            var name = popString();
            var object = target(pop(), 'js-get');
            push(toHandle(guard(function () { return object[name]; })));
        });
        nativeWord('JS-SET', function () {
            var name = popString();
            var object = target(pop(), 'js-set');
            var value = toJS(pop());
            guard(function () { object[name] = value; });
        });
        nativeWord('JS-CALL', function () {
            var name = popString();
            var object = target(pop(), 'js-call');
            var args = popArguments();
            var fn = object[name];
            if (typeof fn !== 'function')
                throw new ForthError(-12, "js-call: property '" + name + "' is not a function");
            push(toHandle(guard(function () { return fn.apply(object, args); })));
        });
        nativeWord('JS-INVOKE', function () {
            var fn = target(pop(), 'js-invoke');
            var args = popArguments();
            if (typeof fn !== 'function')
                throw new ForthError(-12, 'js-invoke: the value is not a function');
            push(toHandle(guard(function () { return fn.apply(null, args); })));
        });
        nativeWord('JS-NEW', function () {
            var constructor = target(pop(), 'js-new');
            var args = popArguments();
            push(toHandle(guard(function () {
                return new (Function.prototype.bind.apply(constructor, [null].concat(args)))();
            })));
        });
        nativeWord('JS-INDEX', function () {
            var index = system.number(pop());
            var object = target(pop(), 'js-index');
            push(toHandle(guard(function () { return object[index]; })));
        });
        nativeWord('JS-SET-INDEX', function () {
            var index = system.number(pop());
            var object = target(pop(), 'js-set-index');
            var value = toJS(pop());
            guard(function () { object[index] = value; });
        });
        nativeWord('JS-LENGTH', function () {
            var object = target(pop(), 'js-length');
            push(Math.trunc(Number(object.length)) || 0);
        });
        nativeWord('JS-ARRAY', function () { push(toHandle(popArguments())); });
        nativeWord('JS-OBJECT', function () { push(toHandle({})); });
        nativeWord('S>JS', function () { push(toHandle(popString())); });
        nativeWord('N>JS', function () { push(toHandle(toJS(pop()))); });
        nativeWord('F>JS', function () { push(toHandle(system.popFloat())); });
        nativeWord('FLAG>JS', function () { push(toHandle(pop() !== 0)); });
        nativeWord('JS>N', function () {
            var value = Number(fromHandle(pop()));
            push(value === value ? i64.fromFloat(value) : 0);
        });
        nativeWord('JS>F', function () { system.pushFloat(Number(fromHandle(pop()))); });
        nativeWord('JS>FLAG', function () { push(fromHandle(pop()) ? -1 : 0); });
        nativeWord('JS>S', function () {
            var value = fromHandle(pop());
            var bytes = utf8.encode(typeof value === 'string' ? value : env.host.format(value));
            push(system.transientString(bytes));
            push(bytes.length);
        });
        nativeWord('JS-NULL?', function () {
            var cell = pop();
            var value = cell === 0 ? null : fromHandle(cell);
            push(value === null || value === undefined ? -1 : 0);
        });
        nativeWord('JS-TYPE', function () {
            var value = fromHandle(pop());
            var bytes = value === null ? 'null' : typeof value;
            push(system.transientString(bytes));
            push(bytes.length);
        });
        nativeWord('JS.', function () {
            var value = fromHandle(pop());
            system.write(utf8.encode(typeof value === 'string' ? value : env.host.format(value)) + ' ');
        });
        nativeWord('JS-FUNCTION', function () {
            var xt = pop();
            system.wordOf(xt);
            push(toHandle(jsFunction(xt)));
        });
        var literal = new Forth.Word(system, 'JS"', 'native');
        literal.immediate = true;
        literal.fn = function (sp) {
            system.sp = sp;
            var handle = toHandle(utf8.decode(system.parseText(34)));
            if (system.compiling() && system.definition !== null)
                system.definition.add({ k: 'lit', value: handle });
            else
                push(handle);
            return system.sp;
        };
        system.forth.add(literal);

        // Host modules: words APP.GREET and, for a global module, GREET -
        // unless a word of that name exists. Parameters in order on the
        // stacks: a string as address and length, a number on the float
        // stack, an integer and a flag as cells, a value as a handle (0 -
        // null; an optional value may be 0). The result goes the same way.
        env.modules.forEach(function (module) {
            module.functions.forEach(function (fn) {
                var parameters = fn.getter ? [] : fn.parameters;
                var body = function () {
                    var values = new Array(parameters.length);
                    for (var index = parameters.length - 1; index >= 0; --index) {
                        switch (parameters[index].type) {
                        case 'string':
                            values[index] = popString();
                            break;
                        case 'number':
                            values[index] = system.popFloat();
                            break;
                        case 'int':
                            values[index] = i64.toFloat(pop());
                            break;
                        case 'bool':
                            values[index] = pop() !== 0;
                            break;
                        default:
                            var cell = pop();
                            values[index] = cell === 0 ? null : fromHandle(cell);
                        }
                    }
                    system.flushOutput();
                    var result = guard(function () { return fn.invoke(values); });
                    switch (fn.result) {
                    case 'void':
                        break;
                    case 'string':
                        var bytes = utf8.encode(result === null || result === undefined ? '' : String(result));
                        push(system.transientString(bytes));
                        push(bytes.length);
                        break;
                    case 'number':
                        system.pushFloat(Number(result));
                        break;
                    case 'int':
                        push(i64.fromFloat(Number(result) || 0));
                        break;
                    case 'bool':
                        push(result ? -1 : 0);
                        break;
                    default:
                        push(toHandle(result));
                    }
                };
                nativeWord((module.name + '.' + fn.names.kebab).toUpperCase(), body);
                var plain = fn.names.kebab.toUpperCase();
                if (module.global && system.findWord(plain) === null)
                    nativeWord(plain, body);
            });
        });
    };

})(globalThis);
