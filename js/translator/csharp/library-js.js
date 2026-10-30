// C#: JavaScript from C# - the namespace V4Script (JsValue, Js,
// JsException), values to and from JavaScript (dynamic uses them), and
// the host modules as static classes (CS.hostLibrary): app gives class
// App with Greet(...) and the property Counter; a global module is
// imported with using static into every unit.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    if (CS.library.units['v4script/JsValue'])
        return;

    CS.addLibrary('v4script', String.raw`
using System;
using System.Collections.Generic;
namespace V4Script;

public sealed class JsValue
{
    private JsValue() { }
    public static extern JsValue Of(object value);
    public extern JsValue Get(string name);
    public extern JsValue Get(int index);
    public extern void Set(string name, object value);
    public extern void Set(int index, object value);
    public static implicit operator JsValue(string value) => Of(value);
    public static implicit operator JsValue(double value) => Of(value);
    public static implicit operator JsValue(bool value) => Of(value);
    public JsValue this[string name] { get => Get(name); set => Set(name, value); }
    public JsValue this[int index] { get => Get(index); set => Set(index, value); }
    public extern bool Has(string name);
    public extern void Delete(string name);
    public extern JsValue Call(string method, params object[] args);
    public extern JsValue Invoke(params object[] args);
    public extern JsValue New(params object[] args);
    public extern int Length { get; }
    public extern int AsInt();
    public extern long AsLong();
    public extern double AsDouble();
    public extern bool AsBool();
    public extern string AsString();
    public extern bool Truthy { get; }
    public extern bool IsNull { get; }
    public extern bool IsUndefined { get; }
    public extern bool IsNumber { get; }
    public extern bool IsString { get; }
    public extern bool IsArray { get; }
    public extern bool IsFunction { get; }
    public extern string TypeOf { get; }
    public extern List<string> Keys();
    public extern List<JsValue> ToList();
    public extern object ToObject();
    public override extern bool Equals(object obj);
    public override extern int GetHashCode();
    public override extern string ToString();
}

public static class Js
{
    public static extern JsValue Global { get; }
}

public class JsException : Exception
{
    public JsException(string message) : base(message) { }
}
`);

    var natives = CS.natives;
    var R = CS.Runtime.prototype;
    var i64 = T.i64, u64 = T.u64;

    function rt() {
        return CS.rt;
    }

    function env() {
        return CS.rt.session.env;
    }

    // --- Values to and from JavaScript

    // A C# value for JavaScript: numbers, strings and booleans as they are,
    // arrays and lists as arrays, delegates as functions.
    R.toJS = function (value) {
        if (value === null || value === undefined)
            return null;
        switch (typeof value) {
        case 'number':
        case 'string':
        case 'boolean':
            return value;
        case 'function':
            if (value.$t === undefined)
                return value;
            var self = this;
            return function () {
                var args = Array.prototype.map.call(arguments, function (arg) { return self.fromJS(arg); });
                return self.toJS(value.apply(null, args));
            };
        }
        if (value.$boxed === true)
            return this.toJS(value.v);
        if (i64.is(value))
            return i64.toFloat(value);
        if (value instanceof CS.decimal.Decimal)
            return CS.decimal.toNumber(value);
        if (value.$jsValue === true)
            return value.$v;
        if (value instanceof CS.MultiArray)
            return Array.prototype.map.call(value.a, this.toJS, this);
        if (Array.isArray(value) || ArrayBuffer.isView(value)) {
            if (value.$t === undefined)
                return value;
            var self2 = this;
            var elem = value.$t.$elem;
            return Array.prototype.map.call(value, function (item) {
                return elem.$name === 'System.Char' ? String.fromCharCode(item) : self2.toJS(item);
            });
        }
        if (value.constructor !== undefined && value.constructor.$def !== null && value.constructor.$def !== undefined) {
            var name = value.constructor.$def.$name;
            if (name === 'System.Collections.Generic.List`1')
                return this.toJS(value.ToArray$0());
            if (name === 'System.Collections.Generic.Dictionary`2') {
                var object = {};
                var keys = this.itemsOf(value.get_Keys$0());
                var self3 = this;
                keys.forEach(function (key) {
                    var found = self3.valueRef();
                    value[self3.methodByKey('System.Collections.Generic.Dictionary`2', 'TryGetValue(TKey, out TValue)')](key, found);
                    object[String(self3.toJS(key))] = self3.toJS(found.v);
                });
                return object;
            }
        }
        return value;
    };

    // A JavaScript value as a C# object: integers of the range of int as
    // ints, other numbers as doubles, the rest as it is (dynamic).
    R.fromJS = function (raw) {
        if (raw === null || raw === undefined)
            return null;
        if (typeof raw === 'number') {
            if (raw === (raw | 0) && !(raw === 0 && 1 / raw < 0))
                return raw;
            return this.box(this.type('System.Double'), raw);
        }
        return raw;
    };

    R.jsValue = function (raw) {
        if (raw !== null && typeof raw === 'object' && raw.$jsValue === true)
            return raw;
        var Type = this.type('V4Script.JsValue');
        var value = new Type();
        value.$v = raw;
        value.$jsValue = true;
        return value;
    };

    function wrap(raw) {
        return rt().jsValue(raw);
    }

    function errorText(error) {
        if (error !== null && typeof error === 'object' && error.message !== undefined)
            return (error.name ? error.name + ': ' : '') + error.message;
        return String(error);
    }

    function guard(action) {
        try {
            return action();
        } catch (error) {
            if (rt().isException(error) || error instanceof CS.ProgramExit || error instanceof CS.FatalError)
                throw error;
            var converted = rt().exception('V4Script.JsException', errorText(error));
            converted.jsError = error;
            throw converted;
        }
    }

    function typeOf(raw) {
        return raw === null ? 'null' : typeof raw;
    }

    function object(value, what) {
        var raw = value.$v;
        if (raw === null || raw === undefined)
            throw rt().exception('V4Script.JsException', 'TypeError: cannot ' + what + ' of ' + typeOf(raw));
        return raw;
    }

    function args(list) {
        return Array.prototype.map.call(list || [], function (item) { return rt().toJS(item); });
    }

    function text(raw) {
        if (typeof raw === 'string')
            return raw;
        if (raw === undefined)
            return 'undefined';
        return String(env().host.format(raw));
    }
    CS.jsText = text;

    function number(value, what) {
        var raw = value.$v;
        var result = typeof raw === 'number' ? raw : (typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN);
        if (result !== result && raw !== raw)
            return NaN;
        if (result !== result)
            throw rt().exception('V4Script.JsException', 'TypeError: ' + text(raw) + ' is not a number (' + what + ')');
        return result;
    }

    function list(items, elementName) {
        var List = rt().inst(rt().type('System.Collections.Generic.List`1'), [rt().type(elementName)]);
        var result = new List().$ctor$0();
        var add = rt().methodByKey('System.Collections.Generic.List`1', 'Add(T)');
        items.forEach(function (item) { result[add](item); });
        return result;
    }

    // A JavaScript value as C# objects: arrays as List<object>, objects as
    // Dictionary<string, object>, functions as JsValue.
    function toCSharp(raw, depth) {
        if (raw === null || raw === undefined || typeof raw === 'number' || typeof raw === 'string' || typeof raw === 'boolean')
            return rt().fromJS(raw);
        if (typeof raw === 'function' || raw.$jsValue === true || depth > 64)
            return wrap(raw);
        if (Array.isArray(raw))
            return list(raw.map(function (item) { return toCSharp(item, depth + 1); }), 'System.Object');
        var Dictionary = rt().inst(rt().type('System.Collections.Generic.Dictionary`2'), [rt().type('System.String'), rt().type('System.Object')]);
        var result = new Dictionary().$ctor$0();
        var set = rt().methodByKey('System.Collections.Generic.Dictionary`2', 'set_Item(TKey, TValue)');
        Object.keys(raw).forEach(function (key) { result[set](key, toCSharp(raw[key], depth + 1)); });
        return result;
    }

    natives['V4Script.JsValue'] = {
        'Of(object)': function (value) { return wrap(rt().toJS(value)); },
        'Get(string)': function (name) {
            var raw = object(this, "read property '" + name + "'");
            return wrap(guard(function () { return raw[name]; }));
        },
        'Get(int)': function (index) {
            var raw = object(this, 'read index ' + index);
            return wrap(guard(function () { return raw[index]; }));
        },
        'Set(string, object)': function (name, value) {
            var raw = object(this, "set property '" + name + "'");
            guard(function () { raw[name] = rt().toJS(value); });
        },
        'Set(int, object)': function (index, value) {
            var raw = object(this, 'set index ' + index);
            guard(function () { raw[index] = rt().toJS(value); });
        },
        'Has(string)': function (name) {
            var raw = this.$v;
            return raw !== null && raw !== undefined && (typeof raw === 'object' || typeof raw === 'function') && name in raw;
        },
        'Delete(string)': function (name) { delete object(this, "delete property '" + name + "'")[name]; },
        'Call(string, object[])': function (name, list) {
            var raw = object(this, "call method '" + name + "'");
            if (typeof raw[name] !== 'function')
                throw rt().exception('V4Script.JsException', "TypeError: property '" + name + "' is not a function");
            var values = args(list);
            return wrap(guard(function () { return raw[name].apply(raw, values); }));
        },
        'Invoke(object[])': function (list) {
            var raw = this.$v;
            if (typeof raw !== 'function')
                throw rt().exception('V4Script.JsException', 'TypeError: ' + typeOf(raw) + ' is not a function');
            var values = args(list);
            return wrap(guard(function () { return raw.apply(null, values); }));
        },
        'New(object[])': function (list) {
            var raw = this.$v;
            if (typeof raw !== 'function')
                throw rt().exception('V4Script.JsException', 'TypeError: ' + typeOf(raw) + ' is not a constructor');
            var values = args(list);
            return wrap(guard(function () { return new (Function.prototype.bind.apply(raw, [null].concat(values)))(); }));
        },
        'get_Length()': function () { return Number(object(this, 'read length').length) | 0; },
        'AsInt()': function () { return rt().d2i(number(this, 'AsInt')); },
        'AsLong()': function () { return rt().d2l(number(this, 'AsLong')); },
        'AsDouble()': function () { return number(this, 'AsDouble'); },
        'AsBool()': function () {
            if (typeof this.$v !== 'boolean')
                throw rt().exception('V4Script.JsException', 'TypeError: ' + text(this.$v) + ' is not a boolean');
            return this.$v;
        },
        'AsString()': function () { return this.$v === null || this.$v === undefined ? null : text(this.$v); },
        'get_Truthy()': function () { return !!this.$v; },
        'get_IsNull()': function () { return this.$v === null; },
        'get_IsUndefined()': function () { return this.$v === undefined; },
        'get_IsNumber()': function () { return typeof this.$v === 'number'; },
        'get_IsString()': function () { return typeof this.$v === 'string'; },
        'get_IsArray()': function () { return Array.isArray(this.$v); },
        'get_IsFunction()': function () { return typeof this.$v === 'function'; },
        'get_TypeOf()': function () { return typeOf(this.$v); },
        'Keys()': function () {
            var raw = this.$v;
            return list(raw !== null && typeof raw === 'object' ? Object.keys(raw) : [], 'System.String');
        },
        'ToList()': function () {
            var raw = object(this, 'convert to list');
            var items = [];
            for (var index = 0; index < (Number(raw.length) | 0); ++index)
                items.push(wrap(raw[index]));
            return list(items, 'V4Script.JsValue');
        },
        'ToObject()': function () { return toCSharp(this.$v, 0); },
        'Equals(object)': function (other) {
            if (other === null || other === undefined || other.$jsValue !== true)
                return false;
            return this.$v === other.$v || (this.$v !== this.$v && other.$v !== other.$v);
        },
        'GetHashCode()': function () {
            var raw = this.$v;
            return typeof raw === 'object' || typeof raw === 'function' ? (raw === null ? 0 : 1) : CS.stringHash(typeOf(raw) + String(raw));
        },
        'ToString()': function () { return text(this.$v); }
    };

    natives['V4Script.Js'] = {
        'get_Global()': function () { return wrap(env().global); }
    };

    // --- Host modules

    var PARAMETER = { string: 'string', number: 'double', int: 'long', bool: 'bool', value: 'object', array: 'object' };
    var RESULT = { void: 'void', string: 'string', number: 'double', int: 'long', bool: 'bool', value: 'V4Script.JsValue',
                   array: 'System.Collections.Generic.List<V4Script.JsValue>' };

    CS.hostLibrary = function (module) {
        var className = module.names.title;
        var lines = ['public static class ' + className, '{'];
        var table = {};
        module.functions.forEach(function (fn) {
            var name = fn.names.pascal;
            if (fn.getter) {
                lines.push('    public static extern ' + RESULT[fn.result] + ' ' + name + ' { get; }');
                table['get_' + name + '()'] = hostMethod(fn, []);
                return;
            }
            for (var count = fn.required; count <= fn.parameters.length; ++count) {
                var declared = fn.parameters.slice(0, count);
                lines.push('    public static extern ' + RESULT[fn.result] + ' ' + name + '(' + declared.map(function (parameter) {
                    return PARAMETER[parameter.type] + ' ' + parameter.name;
                }).join(', ') + ');');
                table[name + '(' + declared.map(function (parameter) { return PARAMETER[parameter.type]; }).join(', ') + ')'] =
                    hostMethod(fn, declared);
            }
        });
        lines.push('}');
        CS.addLibrary('host:' + module.name, lines.join('\n'));
        natives[className] = table;
        return className;
    };

    function hostMethod(fn, parameters) {
        return function () {
            var values = [];
            for (var index = 0; index < parameters.length; ++index) {
                var value = arguments[index];
                switch (parameters[index].type) {
                case 'int':
                    values.push(i64.toFloat(value));
                    break;
                case 'value':
                case 'array':
                    values.push(rt().toJS(value));
                    break;
                default:
                    values.push(value);
                }
            }
            var result = guard(function () { return fn.invoke(values); });
            switch (fn.result) {
            case 'void':
                return undefined;
            case 'string':
                return result === null || result === undefined ? null : String(result);
            case 'number':
                return Number(result);
            case 'int':
                return rt().d2l(Number(result) || 0);
            case 'bool':
                return !!result;
            case 'array':
                return list(Array.prototype.map.call(result || [], wrap), 'V4Script.JsValue');
            }
            return wrap(result);
        };
    }

})(globalThis);
