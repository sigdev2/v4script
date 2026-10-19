// Java: parsing into a tree - types and declarations (statements and
// expressions are in parser-statements.js). A unit is like a jshell
// snippet: besides classes it may have top-level methods, variables and
// statements.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Java = T.java;
    if (Java.Parser)
        return;

    var CompileError = T.CompileError;

    var PRIMITIVES = { boolean: 1, byte: 1, short: 1, char: 1, int: 1, long: 1, float: 1, double: 1 };
    var MODIFIERS = { public: 1, protected: 1, private: 1, static: 1, abstract: 1, final: 1, native: 1, synchronized: 1,
                      transient: 1, volatile: 1, strictfp: 1, default: 1 };
    Java.PRIMITIVES = PRIMITIVES;

    function JavaParser(tokens, source) {
        T.Parser.call(this, tokens, source);
    }
    JavaParser.prototype = Object.create(T.Parser.prototype);
    Java.Parser = JavaParser;

    JavaParser.prototype.fail = function (message, tok) {
        tok = tok || this.peek();
        throw new CompileError(message, tok.line, tok.column, this.source);
    };

    JavaParser.prototype.expect = function (text) {
        if (!this.is(text)) {
            var tok = this.peek();
            // A missing ";" is reported at the end of the previous line, as javac does.
            var previous = this.index > 0 ? this.tokens[this.index - 1] : null;
            if ((text === ';' || text === ')') && previous !== null && previous.line !== tok.line)
                throw new CompileError("'" + text + "' expected", previous.line, previous.column + previous.text.length,
                                       this.source);
            this.fail("'" + text + "' expected");
        }
        return this.next();
    };

    JavaParser.prototype.node = function (kind, tok, fields) {
        var node = fields || {};
        node.k = kind;
        node.line = tok.line;
        node.column = tok.column;
        return node;
    };

    JavaParser.prototype.identifier = function () {
        var tok = this.peek();
        if (tok.type !== 'ident')
            this.fail('<identifier> expected');
        this.next();
        return tok.value;
    };

    JavaParser.prototype.isIdent = function (offset, value) {
        var tok = this.peek(offset);
        return tok.type === 'ident' && (value === undefined || tok.value === value);
    };

    // A parse attempt: on an error - a rollback and null.
    JavaParser.prototype.attempt = function (callback) {
        var saved = this.index;
        var savedTokens = this.splitTokens;
        this.splitTokens = [];
        try {
            var result = callback.call(this);
            // The splits of a successful attempt are rolled back by the outer attempt if it fails.
            if (savedTokens)
                Array.prototype.push.apply(savedTokens, this.splitTokens);
            this.splitTokens = savedTokens;
            return result;
        } catch (error) {
            if (!(error instanceof CompileError))
                throw error;
            this.restoreSplits();
            this.splitTokens = savedTokens;
            this.index = saved;
            return null;
        }
    };

    // --- Modifiers and annotations

    JavaParser.prototype.annotation = function () {
        var tok = this.expect('@');
        var name = this.qualifiedName();
        if (this.is('(')) {
            this.next();
            var depth = 1;
            while (depth > 0) {
                var current = this.next();
                if (current.type === 'eof')
                    this.fail("')' expected");
                if (current.value === '(')
                    ++depth;
                else if (current.value === ')')
                    --depth;
            }
        }
        return this.node('annotation', tok, { name: name });
    };

    JavaParser.prototype.modifiers = function () {
        var mods = { annotations: [] };
        for (;;) {
            var tok = this.peek();
            if (tok.type === 'op' && tok.value === '@' && !(this.is('interface', 1))) {
                mods.annotations.push(this.annotation());
                continue;
            }
            if (tok.type === 'keyword' && MODIFIERS[tok.value] === 1) {
                // default in a switch is not a modifier.
                if (tok.value === 'default' && (this.is(':', 1) || this.is('->', 1)))
                    break;
                if (mods[tok.value])
                    this.fail('repeated modifier');
                mods[tok.value] = true;
                this.next();
                continue;
            }
            // sealed and non-sealed are contextual words.
            if (tok.type === 'ident' && tok.value === 'sealed' && (this.peek(1).type === 'keyword' || this.isIdent(1))) {
                this.next();
                mods.sealed = true;
                continue;
            }
            if (tok.type === 'ident' && tok.value === 'non' && this.is('-', 1) && this.isIdent(2, 'sealed')) {
                this.next();
                this.next();
                this.next();
                continue;
            }
            break;
        }
        return mods;
    };

    JavaParser.prototype.qualifiedName = function () {
        var name = this.identifier();
        while (this.is('.') && this.peek(1).type === 'ident') {
            this.next();
            name += '.' + this.identifier();
        }
        return name;
    };

    // --- Types

    // The tokens ">>", ">=" and the like are split when they close a
    // generic; a rollback of the parse joins them back.
    JavaParser.prototype.restoreSplits = function () {
        var list = this.splitTokens || [];
        for (var index = list.length - 1; index >= 0; --index) {
            var item = list[index];
            this.tokens.splice(item.at, 2, item.token);
        }
        this.splitTokens = [];
    };

    JavaParser.prototype.closeAngle = function () {
        var tok = this.peek();
        if (tok.type === 'op' && tok.value === '>') {
            this.next();
            return;
        }
        if (tok.type === 'op' && (tok.value === '>>' || tok.value === '>>>' || tok.value === '>=' || tok.value === '>>=' ||
                                  tok.value === '>>>=')) {
            var rest = tok.value.substring(1);
            var first = { type: 'op', value: '>', text: '>', line: tok.line, column: tok.column };
            var second = { type: 'op', value: rest, text: rest, line: tok.line, column: tok.column + 1 };
            this.tokens.splice(this.index, 1, first, second);
            if (this.splitTokens)
                this.splitTokens.push({ at: this.index, token: tok });
            this.next();
            return;
        }
        this.fail("'>' expected");
    };

    JavaParser.prototype.typeArguments = function () {
        this.expect('<');
        var args = [];
        if (this.is('>')) {
            this.next();
            return args;
        }
        for (;;) {
            var tok = this.peek();
            while (this.is('@'))
                this.annotation();
            if (this.accept('?')) {
                var bound = null, upper = true;
                if (this.accept('extends')) {
                    bound = this.type();
                } else if (this.accept('super')) {
                    bound = this.type();
                    upper = false;
                }
                args.push(this.node('wild', tok, { bound: bound, upper: upper }));
            } else {
                args.push(this.type());
            }
            if (!this.accept(','))
                break;
        }
        this.closeAngle();
        return args;
    };

    // A class type: Map.Entry<K, V> - parts with arguments.
    JavaParser.prototype.classType = function () {
        var tok = this.peek();
        var parts = [];
        for (;;) {
            while (this.is('@'))
                this.annotation();
            var name = this.identifier();
            var args = this.is('<') ? this.typeArguments() : null;
            parts.push({ name: name, args: args });
            if (this.is('.') && this.peek(1).type === 'ident') {
                this.next();
                continue;
            }
            break;
        }
        return this.node('ctype', tok, { parts: parts });
    };

    JavaParser.prototype.dims = function (type) {
        while (this.is('[') && this.is(']', 1)) {
            var tok = this.next();
            this.next();
            type = this.node('array', tok, { elem: type });
        }
        return type;
    };

    JavaParser.prototype.type = function () {
        var tok = this.peek();
        while (this.is('@'))
            this.annotation();
        tok = this.peek();
        var type;
        if (tok.type === 'keyword' && PRIMITIVES[tok.value] === 1) {
            this.next();
            type = this.node('prim', tok, { name: tok.value });
        } else if (tok.type === 'ident') {
            type = this.classType();
        } else {
            this.fail('<identifier> expected');
        }
        return this.dims(type);
    };

    // The result type of a method: void or a type.
    JavaParser.prototype.resultType = function () {
        var tok = this.peek();
        if (this.accept('void'))
            return this.node('void', tok, {});
        return this.type();
    };

    JavaParser.prototype.typeParameters = function () {
        var params = [];
        this.expect('<');
        for (;;) {
            var tok = this.peek();
            while (this.is('@'))
                this.annotation();
            var name = this.identifier();
            var bounds = [];
            if (this.accept('extends')) {
                bounds.push(this.type());
                while (this.accept('&'))
                    bounds.push(this.type());
            }
            params.push(this.node('tparam', tok, { name: name, bounds: bounds }));
            if (!this.accept(','))
                break;
        }
        this.closeAngle();
        return params;
    };

    // --- A file (a unit)

    // Whether a class declaration starts at the current position (after the modifiers).
    JavaParser.prototype.startsClass = function () {
        if (this.is('class') || this.is('interface') || this.is('enum') || (this.is('@') && this.is('interface', 1)))
            return true;
        return this.isIdent(0, 'record') && this.peek(1).type === 'ident' && (this.is('(', 2) || this.is('<', 2));
    };
})(globalThis);
