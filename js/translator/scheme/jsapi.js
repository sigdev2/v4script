// Scheme: JavaScript values and host modules. The boundary converts
// values: strings, numbers, lists and vectors (to arrays), hash tables (to
// objects), procedures (to functions) - both ways; JavaScript objects stay
// as they are in Scheme. The dot notation (t.title, (t.value "B2")) goes
// through %js-ref, %js-invoke, %js-set!, which the expander produces.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var S = T.scheme;
    if (S.fromJs)
        return;

    var N = S.N;
    var Pair = S.Pair, NIL = S.NIL, SString = S.SString, Char = S.Char, Sym = S.Sym, UNSPEC = S.UNSPEC;
    var def = S.def, defCps = S.defCps;
    var check = S.check;
    var slice = Array.prototype.slice;
    var MAX = 9007199254740991;

    function fromJs(value, depth) {
        switch (typeof value) {
        case 'number':
            if (!Number.isInteger(value))
                return value;
            if (value === 0)
                return 0;
            return value <= MAX && value >= -MAX ? value : T.big.fromFloat(value);
        case 'string':
            return S.str(value);
        case 'boolean':
            return value;
        case 'undefined':
            return UNSPEC;
        case 'function':
            if (value.$scheme !== undefined)
                return value.$scheme;
            return wrapJsFunction(value, undefined);
        case 'object':
            if (value === null)
                return null;
            if (Array.isArray(value)) {
                depth = depth || 0;
                if (depth > 64)
                    throw S.error('JavaScript array is too deep or circular', []);
                // A loop, not map: the holes of a sparse array are values too.
                var result = new Array(value.length);
                for (var index = 0; index < value.length; ++index)
                    result[index] = fromJs(value[index], depth + 1);
                return result;
            }
            return value;
        }
        return value;
    }

    // Wrappers are not cached in a WeakMap (V4 crashes on them during
    // garbage collection): a JavaScript function gets a new procedure at
    // every crossing.
    function wrapJsFunction(fn, self) {
        var proc = function ($k) {
            var args = [];
            for (var index = 1; index < arguments.length; ++index)
                args.push(toJs(arguments[index], 0));
            return $k(fromJs(fn.apply(self, args), 0));
        };
        proc.$js = fn;
        proc.$name = fn.name || 'js-function';
        return proc;
    }

    function toJs(value, depth) {
        if (typeof value === 'number' || typeof value === 'boolean' || value === null)
            return value;
        depth = depth || 0;
        if (depth > 64)
            throw S.error('value is too deep or circular to pass to JavaScript', []);
        if (value instanceof SString)
            return value.s;
        if (value instanceof S.Flo)
            return value.v;
        if (value instanceof T.big.Big || value instanceof T.rat.Rat)
            return N.fv(value);
        if (value instanceof S.Cpx)
            throw S.error('a complex number cannot be passed to JavaScript', [value]);
        if (value instanceof Char)
            return String.fromCodePoint(value.code);
        if (value instanceof Sym)
            return value.name;
        if (value === NIL)
            return [];
        if (value instanceof Pair) {
            var items = S.listToArray(value);
            if (items === null)
                throw S.error('an improper list cannot be passed to JavaScript', [value]);
            return items.map(function (item) { return toJs(item, depth + 1); });
        }
        if (Array.isArray(value))
            return value.map(function (item) { return toJs(item, depth + 1); });
        if (value === UNSPEC || value === S.EOF || value === S.DEFAULT)
            return undefined;
        if (typeof value === 'function')
            return value.$js !== undefined ? value.$js : wrapSchemeProcedure(value);
        if (value instanceof S.HashTable) {
            var object = {};
            value.entries().forEach(function (entry) {
                var key = entry[0];
                object[key instanceof SString ? key.s : (key instanceof Sym ? key.name : S.write(key, 'display'))] =
                    toJs(entry[1], depth + 1);
            });
            return object;
        }
        if (value instanceof S.Record) {
            var fields = {};
            value.type.fields.forEach(function (name, index) { fields[name] = toJs(value.v[index], depth + 1); });
            return fields;
        }
        if (value instanceof S.Values)
            return value.list.map(function (item) { return toJs(item, depth + 1); });
        return value;
    }

    // A Scheme procedure as a JavaScript function (handlers, callbacks).
    function wrapSchemeProcedure(proc) {
        if (proc.$jsFunction !== undefined)
            return proc.$jsFunction;
        var fn = function () {
            var args = [];
            for (var index = 0; index < arguments.length; ++index)
                args.push(fromJs(arguments[index], 0));
            return toJs(S.session.callFromJs(proc, args), 0);
        };
        fn.$scheme = proc;
        proc.$jsFunction = fn;
        return fn;
    }

    S.fromJs = fromJs;
    S.toJs = toJs;

    // --- Dot notation

    function target(value) {
        // A Scheme value (a string, a list) becomes a JavaScript value so
        // that s.length and the methods work; JavaScript objects stay as they are.
        if (value !== null && typeof value === 'object' && !(value instanceof SString) && !(value instanceof Pair) &&
            !(value instanceof S.Flo) && !(value instanceof Char) && !(value instanceof Sym) && !(value instanceof S.Record) &&
            !(value instanceof S.HashTable) && value !== NIL && !Array.isArray(value))
            return value;
        if (typeof value === 'function')
            return value.$js !== undefined ? value.$js : value;
        return toJs(value, 0);
    }

    function walk(base, path, what) {
        var object = target(base);
        for (var index = 0; index < path.length; ++index) {
            if (object === null || object === undefined)
                throw S.error("JavaScript: cannot read '" + path[index] + "' of " + String(object), []);
            object = object[path[index]];
        }
        if (what !== undefined && (object === null || object === undefined))
            throw S.error('JavaScript: cannot ' + what + ' of ' + String(object), []);
        return object;
    }

    def('%js-global', 1, 1, function (name) {
        var global = S.session.env.global;
        if (!(name in global))
            throw S.error('undefined variable: ' + name, []);
        return global[name];
    });
    def('%js-ref', 2, 2, function (base, path) {
        return fromJs(walk(base, path), 0);
    });
    def('%js-invoke', 3, -1, function (base, path, method) {
        var object = walk(base, path, "call '" + method + "'");
        var fn = object[method];
        if (typeof fn !== 'function')
            throw S.error("JavaScript: '" + method + "' is not a function", []);
        var args = [];
        for (var index = 3; index < arguments.length; ++index)
            args.push(toJs(arguments[index], 0));
        return fromJs(fn.apply(object, args), 0);
    });
    def('%js-set!', 4, 4, function (base, path, name, value) {
        var object = walk(base, path, "set '" + name + "'");
        object[name] = toJs(value, 0);
        return UNSPEC;
    });

    // --- The js-... procedures

    function key(name, value) {
        if (value instanceof SString)
            return value.s;
        if (value instanceof Sym)
            return value.name;
        if (typeof value === 'number')
            return value;
        check.fail(name, 'a property name (string, symbol or number)', value);
    }
    def('js-global', 0, 0, function () { return S.session.env.global; });
    def('js-ref', 2, -1, function (object) {
        var path = [];
        for (var index = 1; index < arguments.length; ++index)
            path.push(key('js-ref', arguments[index]));
        return fromJs(walk(object, path), 0);
    });
    def('js-set!', 3, 3, function (object, name, value) {
        var made = walk(object, [], "set '" + key('js-set!', name) + "'");
        made[key('js-set!', name)] = toJs(value, 0);
        return UNSPEC;
    });
    def('js-invoke', 2, -1, function (object, name) {
        var args = [object, [], key('js-invoke', name)].concat(slice.call(arguments, 2));
        return S.prims['%js-invoke'].fn.apply(null, args);
    });
    // (js-call f x ...): a JavaScript function with this = undefined; a
    // Scheme procedure (returned from JavaScript as it is) - an ordinary call.
    defCps('js-call', 1, -1, function ($k, fn) {
        if (typeof fn !== 'function')
            check.fail('js-call', 'a function', fn);
        var args = slice.call(arguments, 2);
        if (fn.$js === undefined)
            return fn.apply(null, [$k].concat(args));
        return $k(fromJs(fn.$js.apply(undefined, args.map(function (item) { return toJs(item, 0); })), 0));
    });
    def('js-new', 1, -1, function (ctor) {
        var raw = ctor;
        if (ctor instanceof SString || ctor instanceof Sym)
            raw = S.session.env.global[key('js-new', ctor)];
        else if (typeof ctor === 'function' && ctor.$js !== undefined)
            raw = ctor.$js;
        if (typeof raw !== 'function')
            check.fail('js-new', 'a JavaScript constructor', ctor);
        var args = slice.call(arguments, 1).map(function (item) { return toJs(item, 0); });
        return fromJs(new (Function.prototype.bind.apply(raw, [null].concat(args)))(), 0);
    });
    def('js-object', 0, -1, function () {
        if (arguments.length % 2 !== 0)
            throw S.error('js-object: expected keys and values in pairs', []);
        var object = {};
        for (var index = 0; index < arguments.length; index += 2)
            object[key('js-object', arguments[index])] = toJs(arguments[index + 1], 0);
        return object;
    });
    S.alias('js-array', 'vector');
    // For Scheme a procedure stays itself; it becomes a JavaScript function
    // when it goes to JavaScript (the wrapper is made here in advance).
    def('js-function', 1, 1, function (proc) {
        wrapSchemeProcedure(check.procedure('js-function', proc));
        return proc;
    });
    def('js->scheme', 1, 1, function (value) { return fromJs(value, 0); });
    def('scheme->js', 1, 1, function (value) { return toJs(value, 0); });
    def('js-null', 0, 0, function () { return null; });
    def('js-null?', 1, 1, function (value) { return value === null; }, { bool: true });
    def('js-undefined', 0, 0, function () { return UNSPEC; });
    def('js-undefined?', 1, 1, function (value) { return value === UNSPEC; }, { bool: true });
    def('js-object?', 1, 1, function (value) {
        return value !== null && typeof value === 'object' && !(S.N.isNumber(value)) && value.$scheme !== true &&
            !(value instanceof Pair) && !(value instanceof SString) && !(value instanceof Char) &&
            !(value instanceof Sym) && !Array.isArray(value) && !(value instanceof S.Record) && value !== NIL &&
            value !== UNSPEC && value !== S.EOF && !(value instanceof Uint8Array) && !(value instanceof S.Values) &&
            !(value instanceof S.Promise) && !(value instanceof S.ErrorObject) &&
            !(value instanceof S.EnvironmentObject);
    }, { bool: true });

    // --- Host modules: the module object as a variable (app.greet,
    // app.counter with the dot notation) and, for a global module,
    // procedures with Scheme names (greet, is-even, counter) - unless the
    // name is taken by a built-in procedure.
    S.installHostModules = function (session) {
        session.env.modules.forEach(function (module) {
            if (!session.top.table.has(module.name)) {
                var cell = new S.Cell(module.name);
                cell.v = module.object;
                session.top.table.set(module.name, S.globalBinding(cell, false));
            }
            if (!module.global)
                return;
            module.functions.forEach(function (fn) {
                var name = fn.names.kebab;
                if (S.prims[name] !== undefined || session.top.table.has(name))
                    return;
                var parameters = fn.getter ? [] : fn.parameters;
                // A procedure of this session only: the table of built-in
                // procedures is shared by every session of the engine.
                var prim = def(name, fn.getter ? 0 : fn.required, parameters.length, function () {
                    var values = [];
                    for (var index = 0; index < arguments.length; ++index)
                        values.push(toJs(arguments[index], 0));
                    session.flushConsole();
                    var result = fn.invoke(values);
                    return fn.result === 'void' ? UNSPEC : fromJs(result === undefined ? null : result, 0);
                });
                delete S.prims[name];
                session.top.table.set(name, { kind: 'prim', p: prim });
            });
        });
    };
})(globalThis);
