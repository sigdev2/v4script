// Kotlin: natives of the library - the external declarations of the
// Kotlin sources by owner (a package or a class) and signature.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Kt = T.kotlin;
    Kt.natives = Kt.natives || Object.create(null);
    if (Kt.natives['kotlin.io'] !== undefined)
        return;

    var i64 = T.i64;

    function session() {
        return Kt.session;
    }

    function kt() {
        return Kt.session.ktRuntime;
    }

    function j() {
        return Kt.session.runtime;
    }

    function write(text) {
        session().env.out.write(text);
    }

    function charsText(chars) {
        var text = '';
        for (var index = 0; index < chars.length; ++index)
            text += String.fromCharCode(chars[index]);
        return text;
    }

    // --- kotlin.io

    var io = {
        'println()': function () { write('\n'); },
        'println(Any?)': function (message) { write(kt().str(message) + '\n'); },
        'println(String)': function (message) { write((message === null ? 'null' : message) + '\n'); },
        'println(Int)': function (message) { write(message + '\n'); },
        'println(Long)': function (message) { write(i64.str(message) + '\n'); },
        'println(Short)': function (message) { write(message + '\n'); },
        'println(Byte)': function (message) { write(message + '\n'); },
        'println(Double)': function (message) { write(j().dstr(message) + '\n'); },
        'println(Float)': function (message) { write(j().fstr(message) + '\n'); },
        'println(Char)': function (message) { write(String.fromCharCode(message) + '\n'); },
        'println(Boolean)': function (message) { write(message + '\n'); },
        'println(CharArray)': function (message) { write(charsText(message) + '\n'); },
        'print(Any?)': function (message) { write(kt().str(message)); },
        'print(String)': function (message) { write(message === null ? 'null' : message); },
        'print(Int)': function (message) { write(String(message)); },
        'print(Long)': function (message) { write(i64.str(message)); },
        'print(Short)': function (message) { write(String(message)); },
        'print(Byte)': function (message) { write(String(message)); },
        'print(Double)': function (message) { write(j().dstr(message)); },
        'print(Float)': function (message) { write(j().fstr(message)); },
        'print(Char)': function (message) { write(String.fromCharCode(message)); },
        'print(Boolean)': function (message) { write(String(message)); },
        'print(CharArray)': function (message) { write(charsText(message)); },
        'readLine()': function () { return readInputLine(); },
        'readlnOrNull()': function () { return readInputLine(); }
    };
    Kt.natives['kotlin.io'] = io;

    // A line of standard input (the output is flushed first, as a prompt).
    function readInputLine() {
        var env = session().env;
        env.out.flush();
        var line = env.input.readLine();
        return line === null || line === undefined ? null : line;
    }

    // --- kotlin.reflect

    function runtimeName(classType) {
        if (typeof classType === 'string')
            return classType;
        return classType.$meta !== undefined ? classType.$meta.name : 'java.lang.Object';
    }

    // Kotlin names of the classes of the JDK that are Kotlin builtins.
    var KOTLIN_NAMES = { 'java.lang.String': 'kotlin.String', 'java.lang.Integer': 'kotlin.Int', 'java.lang.Long': 'kotlin.Long',
                         'java.lang.Double': 'kotlin.Double', 'java.lang.Float': 'kotlin.Float', 'java.lang.Short': 'kotlin.Short',
                         'java.lang.Byte': 'kotlin.Byte', 'java.lang.Character': 'kotlin.Char', 'java.lang.Boolean': 'kotlin.Boolean',
                         'java.lang.Object': 'kotlin.Any', 'java.lang.Number': 'kotlin.Number', 'java.lang.Throwable': 'kotlin.Throwable',
                         'java.lang.CharSequence': 'kotlin.CharSequence', '[I': 'kotlin.IntArray', '[J': 'kotlin.LongArray',
                         '[D': 'kotlin.DoubleArray', '[Z': 'kotlin.BooleanArray', '[C': 'kotlin.CharArray',
                         '[Ljava.lang.Object;': 'kotlin.Array' };

    Kt.natives['kotlin.reflect.KClassImpl'] = {
        'simpleNameOf()': function () {
            var classType = this.$runtimeClass;
            var name = KOTLIN_NAMES[runtimeName(classType)];
            if (name !== undefined)
                return name.substring(name.lastIndexOf('.') + 1);
            if (typeof classType === 'string')
                return 'Array';
            var meta = classType.$meta;
            if (meta.simpleName === '')
                return null;
            return meta.simpleName;
        },
        'qualifiedNameOf()': function () {
            var classType = this.$runtimeClass;
            var name = runtimeName(classType);
            if (KOTLIN_NAMES[name] !== undefined)
                return KOTLIN_NAMES[name];
            if (typeof classType !== 'string' && classType.$meta.simpleName === '')
                return null;
            return name.replace(/\$/g, '.');
        },
        'isInstance(Any?)': function (value) {
            var classType = this.$runtimeClass;
            if (typeof classType === 'string')
                return j().isArray(value, classType);
            return j().is(value, classType);
        },
        'hashCode()': function () {
            return j().identityHash(this);
        }
    };

    Kt.natives['kotlin.jvm'] = {
        'T.javaClass': function (value) { return j().classOfValue(value); }
    };
})(globalThis);
