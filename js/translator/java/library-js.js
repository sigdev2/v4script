// Java: package js - values of JavaScript (JsValue), like syscall/js in Go,
// and classes of the host modules (Java.hostLibrary). A unit sees the
// package js without import, and the functions of global host modules
// without the class name (an implicit import static app.App.*).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Java = T.java;
    if (Java.library.units['js'])
        return;

    Java.addLibrary('js', 'js', String.raw`
import java.util.*;

public final class JsValue {
    private JsValue() {}
    public static native JsValue of(Object value);
    public native JsValue get(String name);
    public native JsValue get(int index);
    public native void set(String name, Object value);
    public native void set(int index, Object value);
    public native boolean has(String name);
    public native void delete(String name);
    public native JsValue call(String method, Object... args);
    public native JsValue invoke(Object... args);
    public native JsValue newInstance(Object... args);
    public native int length();
    public native int asInt();
    public native long asLong();
    public native double asDouble();
    public native boolean asBoolean();
    public native String asString();
    public native boolean truthy();
    public native boolean isNull();
    public native boolean isUndefined();
    public native boolean isNumber();
    public native boolean isString();
    public native boolean isArray();
    public native boolean isFunction();
    public native String typeOf();
    public native List<String> keys();
    public native List<JsValue> toList();
    public native Object toJava();
    public native boolean equals(Object other);
    public native int hashCode();
    public native String toString();
}

public final class Js {
    private Js() {}
    public static native JsValue global();
}

public class JsException extends RuntimeException {
    public JsException(String message) { super(message); }
}
`);

    function rt() {
        return Java.rt;
    }

    function env() {
        return Java.rt.session.env;
    }

    function wrap(raw) {
        var jsValueClass = rt().byName('js.JsValue');
        var value = new jsValueClass();
        value.$v = raw;
        return value;
    }

    // The text of an error as "TypeError: x is not a function"
    function errorText(error) {
        if (error !== null && typeof error === 'object' && error.message !== undefined)
            return (error.name ? error.name + ': ' : '') + error.message;
        return String(error);
    }

    // A JavaScript call: its exception becomes a JsException on the line of the call.
    function guard(action) {
        try {
            return action();
        } catch (error) {
            if (rt().isThrowable(error))
                throw error;
            throw rt().exception('js.JsException', errorText(error));
        }
    }

    function typeOf(raw) {
        return raw === null ? 'null' : typeof raw;
    }

    function object(value, what) {
        var raw = value.$v;
        if (raw === null || raw === undefined)
            throw rt().exception('js.JsException', 'TypeError: cannot ' + what + ' of ' + typeOf(raw));
        return raw;
    }

    function args(list) {
        return Array.prototype.map.call(list, function (item) { return rt().toJS(item); });
    }

    // The text of a value as the JavaScript console shows it.
    function text(raw) {
        if (typeof raw === 'string')
            return raw;
        if (raw === undefined)
            return 'undefined';
        return String(env().host.format(raw));
    }

    function number(value, what) {
        var raw = value.$v;
        var result = typeof raw === 'number' ? raw : (typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN);
        if (result !== result && raw !== raw)
            return NaN;
        if (result !== result)
            throw rt().exception('js.JsException', 'TypeError: ' + text(raw) + ' is not a number (' + what + ')');
        return result;
    }

    function list(items) {
        var ArrayList = rt().byName('java.util.ArrayList');
        var result = new ArrayList().$init0();
        items.forEach(function (item) { result.add$1(item); });
        return result;
    }

    Java.natives['js.JsValue'] = {
        'of(Object)': function (value) { return wrap(rt().toJS(value)); },
        'get(String)': function (name) {
            var raw = object(this, "read property '" + name + "'");
            return wrap(guard(function () { return raw[name]; }));
        },
        'get(int)': function (index) {
            var raw = object(this, 'read index ' + index);
            return wrap(guard(function () { return raw[index]; }));
        },
        'set(String,Object)': function (name, value) {
            var raw = object(this, "set property '" + name + "'");
            guard(function () { raw[name] = rt().toJS(value); });
        },
        'set(int,Object)': function (index, value) {
            var raw = object(this, 'set index ' + index);
            guard(function () { raw[index] = rt().toJS(value); });
        },
        'has(String)': function (name) {
            var raw = this.$v;
            return raw !== null && raw !== undefined && (typeof raw === 'object' || typeof raw === 'function') && name in raw;
        },
        'delete(String)': function (name) { delete object(this, "delete property '" + name + "'")[name]; },
        'call(String,Object[])': function (name, list) {
            var raw = object(this, "call method '" + name + "'");
            if (typeof raw[name] !== 'function')
                throw rt().exception('js.JsException', "TypeError: property '" + name + "' is not a function");
            var values = args(list);
            return wrap(guard(function () { return raw[name].apply(raw, values); }));
        },
        'invoke(Object[])': function (list) {
            var raw = this.$v;
            if (typeof raw !== 'function')
                throw rt().exception('js.JsException', 'TypeError: ' + typeOf(raw) + ' is not a function');
            var values = args(list);
            return wrap(guard(function () { return raw.apply(null, values); }));
        },
        'newInstance(Object[])': function (list) {
            var raw = this.$v;
            if (typeof raw !== 'function')
                throw rt().exception('js.JsException', 'TypeError: ' + typeOf(raw) + ' is not a constructor');
            var values = args(list);
            return wrap(guard(function () { return new (Function.prototype.bind.apply(raw, [null].concat(values)))(); }));
        },
        'length()': function () {
            var raw = object(this, 'read length');
            return Number(raw.length) | 0;
        },
        'asInt()': function () { return rt().d2i(number(this, 'asInt')); },
        'asLong()': function () { return rt().d2l(number(this, 'asLong')); },
        'asDouble()': function () { return number(this, 'asDouble'); },
        'asBoolean()': function () {
            if (typeof this.$v !== 'boolean')
                throw rt().exception('js.JsException', 'TypeError: ' + text(this.$v) + ' is not a boolean');
            return this.$v;
        },
        'asString()': function () { return this.$v === null || this.$v === undefined ? null : text(this.$v); },
        'truthy()': function () { return !!this.$v; },
        'isNull()': function () { return this.$v === null; },
        'isUndefined()': function () { return this.$v === undefined; },
        'isNumber()': function () { return typeof this.$v === 'number'; },
        'isString()': function () { return typeof this.$v === 'string'; },
        'isArray()': function () { return Array.isArray(this.$v); },
        'isFunction()': function () { return typeof this.$v === 'function'; },
        'typeOf()': function () { return typeOf(this.$v); },
        'keys()': function () {
            var raw = this.$v;
            return list(raw !== null && typeof raw === 'object' ? Object.keys(raw) : []);
        },
        'toList()': function () {
            var raw = object(this, 'convert to list');
            var items = [];
            for (var index = 0; index < (Number(raw.length) | 0); ++index)
                items.push(wrap(raw[index]));
            return list(items);
        },
        'toJava()': function () { return rt().fromJS(this.$v, 'Ljava.lang.Object;', true); },
        'equals(Object)': function (other) {
            if (!rt().is(other, rt().byName('js.JsValue')))
                return false;
            return this.$v === other.$v || (this.$v !== this.$v && other.$v !== other.$v);
        },
        'hashCode()': function () {
            var raw = this.$v;
            return typeof raw === 'object' || typeof raw === 'function' ? (raw === null ? 0 : 1) : Java.stringHash(typeOf(raw) + String(raw));
        },
        'toString()': function () { return text(this.$v); }
    };

    Java.natives['js.Js'] = {
        'global()': function () { return wrap(env().global); }
    };

    var JAVA_PARAMETER = { string: 'String', number: 'double', int: 'long', bool: 'boolean', value: 'Object', array: 'Object' };
    var JAVA_RESULT = { void: 'void', string: 'String', number: 'double', int: 'long', bool: 'boolean', value: 'JsValue',
                        array: 'List<JsValue>' };

    // A host module as a library class: package <name>, class <Name> with
    // static native methods; optional parameters give overloads.
    Java.hostLibrary = function (module) {
        var className = module.names.title;
        var qname = module.name + '.' + className;
        var lines = ['import js.*;', 'import java.util.*;', '', 'public final class ' + className + ' {',
                     '    private ' + className + '() {}'];
        var natives = {};
        module.functions.forEach(function (fn) {
            var parameters = fn.getter ? [] : fn.parameters;
            for (var count = fn.getter ? 0 : fn.required; count <= parameters.length; ++count) {
                var declared = parameters.slice(0, count);
                lines.push('    public static native ' + JAVA_RESULT[fn.result] + ' ' + fn.name + '(' +
                           declared.map(function (parameter) {
                               return JAVA_PARAMETER[parameter.type] + ' ' + parameter.name;
                           }).join(', ') + ');');
                var key = fn.name + '(' + declared.map(function (parameter) {
                    return JAVA_PARAMETER[parameter.type];
                }).join(',') + ')';
                natives[key] = hostMethod(fn, declared);
            }
        });
        lines.push('}');
        Java.addLibrary('host:' + module.name, module.name, lines.join('\n'));
        Java.natives[qname] = natives;
        return qname;
    };

    function hostMethod(fn, parameters) {
        return function () {
            var values = [];
            for (var index = 0; index < parameters.length; ++index) {
                var value = arguments[index];
                switch (parameters[index].type) {
                case 'int':
                    values.push(T.i64.toFloat(value));
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
                return list(Array.prototype.map.call(result || [], wrap));
            }
            return wrap(result);
        };
    }

    // System.in: lines of the host, as UTF-8 bytes for read().
    var pendingInput = '';

    Java.natives['java.io.StandardInputStream'] = {
        'read()': function () {
            if (pendingInput.length === 0) {
                var line = env().input.readLine();
                if (line === null)
                    return -1;
                pendingInput = T.utf8.encode(line + '\n');
            }
            var code = pendingInput.charCodeAt(0);
            pendingInput = pendingInput.substring(1);
            return code;
        },
        'available()': function () {
            return pendingInput.length > 0 ? pendingInput.length : (env().input.isReady() ? 1 : 0);
        },
        'readLineText()': function () {
            if (pendingInput.length > 0) {
                var rest = T.utf8.decode(pendingInput);
                pendingInput = '';
                return rest;
            }
            var line = env().input.readLine();
            return line === null ? null : line + '\n';
        }
    };
})(globalThis);
