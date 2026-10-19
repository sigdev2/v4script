// Scheme: the values of the language - pairs, symbols, characters,
// strings, records, promises, parameters, error objects, multiple values.
// Design:
// docs/internals/scheme.md.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var S = T.scheme = T.scheme || {};
    if (S.Pair)
        return;

    // --- Pairs and the empty list

    function Pair(car, cdr) {
        this.car = car;
        this.cdr = cdr;
    }

    function Nil() {}
    Nil.prototype.toString = function () { return '()'; };
    var NIL = new Nil();

    // --- Symbols: one per name (eq? compares references)

    function Sym(name) {
        this.name = name;
    }
    Sym.prototype.toString = function () { return this.name; };

    var symbols = new Map();
    function intern(name) {
        var symbol = symbols.get(name);
        if (symbol === undefined) {
            symbol = new Sym(name);
            symbols.set(name, symbol);
        }
        return symbol;
    }
    var gensymCounter = 0;
    // A symbol that is not in the table: not equal to any symbol read.
    function uninterned(name) {
        return new Sym(name + '.' + (++gensymCounter));
    }

    // --- Characters: one object per code (eq? works)

    function Char(code) {
        this.code = code;
    }
    var charCache = [];
    var charMap = new Map();
    function char(code) {
        if (code < 65536) {
            var cached = charCache[code];
            if (cached === undefined)
                cached = charCache[code] = new Char(code);
            return cached;
        }
        var found = charMap.get(code);
        if (found === undefined) {
            found = new Char(code);
            charMap.set(code, found);
        }
        return found;
    }

    // --- Strings: mutable, the index is a code point
    //
    // s is a JavaScript string (UTF-16). While it has no surrogate pairs,
    // the code point index is the index in s; otherwise it goes through an
    // array of codes (slower).

    function SString(text) {
        this.s = text;
        this.a = -1;   // -1 - not checked, 0 - no surrogates, 1 - has them
    }
    SString.prototype.astral = function () {
        if (this.a < 0)
            this.a = /[\uD800-\uDFFF]/.test(this.s) ? 1 : 0;
        return this.a === 1;
    };
    SString.prototype.length = function () {
        if (!this.astral())
            return this.s.length;
        var count = 0;
        for (var index = 0; index < this.s.length; ++index) {
            var code = this.s.charCodeAt(index);
            if (code < 0xDC00 || code > 0xDFFF)
                ++count;
        }
        return count;
    };
    SString.prototype.codes = function () {
        var result = [];
        var text = this.s;
        for (var index = 0; index < text.length; ++index) {
            var code = text.codePointAt(index);
            if (code > 0xFFFF)
                ++index;
            result.push(code);
        }
        return result;
    };
    SString.prototype.ref = function (index) {
        if (!this.astral())
            return this.s.charCodeAt(index);
        return this.codes()[index];
    };
    // A substring by code point indices.
    SString.prototype.slice = function (start, end) {
        if (!this.astral())
            return this.s.substring(start, end);
        return codesToString(this.codes().slice(start, end));
    };
    SString.prototype.set = function (text) {
        this.s = text;
        this.a = -1;
    };
    SString.prototype.toString = function () { return this.s; };

    function codesToString(codes) {
        var parts = [];
        for (var index = 0; index < codes.length; index += 4096)
            parts.push(String.fromCodePoint.apply(null, codes.slice(index, index + 4096)));
        return parts.join('');
    }

    function str(text) {
        return new SString(text);
    }

    // --- Special values

    function Unspecified() {}
    var UNSPEC = new Unspecified();
    function Eof() {}
    var EOF = new Eof();
    // The "no argument" value of the optional parameters of built-in
    // procedures written in Scheme.
    function Default() {}
    var DEFAULT = new Default();

    // Multiple values (values) - for a continuation that expects one, it is
    // one object; call-with-values unpacks it.
    function Values(list) {
        this.list = list;
    }

    // --- Records (define-record-type)

    function RecordType(name, fields) {
        this.name = name;      // a string
        this.fields = fields;  // field names (strings)
        this.$scheme = true;
    }
    RecordType.prototype.describe = function () {
        return '#<record-type ' + this.name + '>';
    };
    function Record(type, values) {
        this.type = type;
        this.v = values;
    }

    // --- Promises: done - the value is ready, otherwise thunk is a
    // procedure without arguments (delay-force: its result is a promise again).

    function Promise_(done, value) {
        this.box = { done: done, value: value };
    }

    // --- An error object (error, errors of built-in procedures, read-error...)

    function ErrorObject(message, irritants, kind) {
        this.message = message;     // a JavaScript string
        this.irritants = irritants; // a Scheme list
        this.kind = kind || '';     // '', 'file', 'read'
        this.stack = null;          // the JavaScript stack - for the place of the error
    }

    // An error of a built-in procedure: thrown as a JavaScript exception, it
    // becomes a Scheme condition; the stack is kept to find the line of the
    // unit.
    function error(message, irritants) {
        var made = new ErrorObject(message, arrayToList(irritants || []), '');
        made.stack = new Error(message).stack;
        return made;
    }

    // --- An environment for eval

    function EnvironmentObject(top) {
        this.top = top;
    }

    // --- Lists

    function list() {
        var result = NIL;
        for (var index = arguments.length - 1; index >= 0; --index)
            result = new Pair(arguments[index], result);
        return result;
    }

    function arrayToList(array, tail) {
        var result = tail === undefined ? NIL : tail;
        for (var index = array.length - 1; index >= 0; --index)
            result = new Pair(array[index], result);
        return result;
    }

    // The elements of a list as an array; null if it is not a proper list.
    function listToArray(value) {
        var result = [];
        var slow = value;
        while (value instanceof Pair) {
            result.push(value.car);
            value = value.cdr;
            if ((result.length & 1) === 0) {
                slow = slow.cdr;
                if (slow === value && value instanceof Pair)
                    return null;
            }
        }
        return value === NIL ? result : null;
    }

    function isList(value) {
        var slow = value;
        for (;;) {
            if (value === NIL)
                return true;
            if (!(value instanceof Pair))
                return false;
            value = value.cdr;
            if (value === NIL)
                return true;
            if (!(value instanceof Pair))
                return false;
            value = value.cdr;
            slow = slow.cdr;
            if (value === slow)
                return false;
        }
    }

    S.Pair = Pair;
    S.Nil = Nil;
    S.NIL = NIL;
    S.Sym = Sym;
    S.intern = intern;
    S.uninterned = uninterned;
    S.Char = Char;
    S.char = char;
    S.SString = SString;
    S.str = str;
    S.codesToString = codesToString;
    S.Unspecified = Unspecified;
    S.UNSPEC = UNSPEC;
    S.Eof = Eof;
    S.EOF = EOF;
    S.Default = Default;
    S.DEFAULT = DEFAULT;
    S.Values = Values;
    S.RecordType = RecordType;
    S.Record = Record;
    S.Promise = Promise_;
    S.ErrorObject = ErrorObject;
    S.error = error;
    S.EnvironmentObject = EnvironmentObject;
    S.list = list;
    S.arrayToList = arrayToList;
    S.listToArray = listToArray;
    S.isList = isList;
})(globalThis);
