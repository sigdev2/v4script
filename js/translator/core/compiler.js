// The shared part of the translators: splitting a text into tokens, the
// JavaScript tree with printing and a line map, operations on numbers of
// a given width.
//
// A language translator parses the text, checks names and types and
// builds a JavaScript tree (J.* nodes) in which the arithmetic is already
// expanded for the types (ops.*). Printing the tree gives the code and the
// map "code line -> unit line". Design: docs/internals/translator.md.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    if (T.compiler)
        return;
    T.compiler = true;

    var CompileError = T.CompileError;

    // --- Text parsing

    function Scanner(text, source) {
        this.text = text;
        this.source = source || '';
        this.pos = 0;
        this.line = 1;
        this.lineStart = 0;
    }

    Scanner.prototype.atEnd = function () {
        return this.pos >= this.text.length;
    };
    Scanner.prototype.peek = function (offset) {
        return this.text.charAt(this.pos + (offset || 0));
    };
    Scanner.prototype.code = function (offset) {
        var index = this.pos + (offset || 0);
        return index < this.text.length ? this.text.charCodeAt(index) : -1;
    };
    Scanner.prototype.column = function () {
        return this.pos - this.lineStart + 1;
    };
    Scanner.prototype.startsWith = function (prefix) {
        return this.text.substr(this.pos, prefix.length) === prefix;
    };
    Scanner.prototype.advance = function (count) {
        count = count === undefined ? 1 : count;
        for (var index = 0; index < count && this.pos < this.text.length; ++index) {
            if (this.text.charCodeAt(this.pos) === 10) {
                ++this.line;
                this.lineStart = this.pos + 1;
            }
            ++this.pos;
        }
    };
    // A match of a regular expression (with the y flag) at the current position.
    Scanner.prototype.match = function (regex) {
        regex.lastIndex = this.pos;
        var found = regex.exec(this.text);
        return found === null ? null : found[0];
    };
    Scanner.prototype.error = function (message, line, column) {
        throw new CompileError(message, line || this.line, column || this.column(), this.source);
    };

    function isLetter(code) {
        return (code >= 97 && code <= 122) || (code >= 65 && code <= 90) || code === 95 ||
            (code >= 0x80 && !isUnicodeSpaceOrPunctuation(code));
    }

    function isUnicodeSpaceOrPunctuation(code) {
        return (code >= 0x80 && code <= 0xBF && code !== 0xAA && code !== 0xB5 && code !== 0xBA) || code === 0xD7 ||
            code === 0xF7 || (code >= 0x2000 && code <= 0x206F) || (code >= 0x3000 && code <= 0x303F) ||
            (code >= 0xFF00 && code <= 0xFF0F) || code === 0xFEFF;
    }

    function isDigit(code) {
        return code >= 48 && code <= 57;
    }

    T.Scanner = Scanner;
    T.isLetter = isLetter;
    T.isDigit = isDigit;

    // Parsing by tokens: { type, value, text, line, column, newline (a line
    // break before the token) }. The parsing shared by the languages is here.
    function Parser(tokens, source) {
        this.tokens = tokens;
        this.index = 0;
        this.source = source || '';
    }
    Parser.prototype.peek = function (offset) {
        var index = this.index + (offset || 0);
        return this.tokens[index < this.tokens.length ? index : this.tokens.length - 1];
    };
    Parser.prototype.next = function () {
        var token = this.tokens[this.index];
        if (this.index < this.tokens.length - 1)
            ++this.index;
        return token;
    };
    // The token is a sign or a keyword with this text.
    Parser.prototype.is = function (text, offset) {
        var token = this.peek(offset);
        return (token.type === 'op' || token.type === 'keyword') && token.value === text;
    };
    Parser.prototype.accept = function (text) {
        if (this.is(text))
            return this.next();
        return null;
    };
    Parser.prototype.expect = function (text, what) {
        if (!this.is(text))
            this.fail('expected ' + (what || "'" + text + "'") + ', found ' + this.describe(this.peek()));
        return this.next();
    };
    Parser.prototype.describe = function (token) {
        if (token.type === 'eof')
            return 'end of code';
        if (token.type === 'newline' || (token.type === 'op' && token.value === ';' && token.implicit))
            return 'newline';
        return "'" + token.text + "'";
    };
    Parser.prototype.fail = function (message, token) {
        token = token || this.peek();
        throw new CompileError(message, token.line, token.column, this.source);
    };
    T.Parser = Parser;

    // --- The JavaScript tree

    var RESERVED = {};
    ('break case catch class const continue debugger default delete do else enum export extends false finally for ' +
     'function if import in instanceof new null return super switch this throw true try typeof var void while with ' +
     'yield let static implements interface package private protected public await arguments eval undefined NaN ' +
     'Infinity globalThis Object Array Math String Number Boolean Error Symbol Map Set Date JSON RegExp Function')
        .split(' ').forEach(function (word) { RESERVED[word] = true; });

    // A name of the language as a JavaScript name: "$" is doubled (the
    // service names of the translator start with one "$"), reserved words
    // get a "$" at the end.
    T.jsName = function (name) {
        name = name.replace(/\$/g, '$$$$');
        return RESERVED[name] === true ? name + '$' : name;
    };

    // A property name that cannot clash with the properties of Object.prototype.
    var PROTO_NAMES = { constructor: 1, __proto__: 1, toString: 1, valueOf: 1, hasOwnProperty: 1, isPrototypeOf: 1,
                        propertyIsEnumerable: 1, toLocaleString: 1, __defineGetter__: 1, __defineSetter__: 1,
                        __lookupGetter__: 1, __lookupSetter__: 1 };
    T.propertyName = function (name) {
        name = name.replace(/\$/g, '$$$$');
        return PROTO_NAMES[name] === 1 ? name + '$' : name;
    };

    var J = {
        id: function (name) { return { k: 'id', name: name }; },
        num: function (value) { return { k: 'num', value: value }; },
        str: function (value) { return { k: 'str', value: value }; },
        bool: function (value) { return { k: 'bool', value: value }; },
        nul: function () { return { k: 'null' }; },
        undef: function () { return { k: 'undef' }; },
        this_: function () { return { k: 'this' }; },
        bin: function (op, left, right) { return { k: 'bin', op: op, left: left, right: right }; },
        un: function (op, arg) { return { k: 'un', op: op, arg: arg }; },
        and: function (left, right) { return { k: 'bin', op: '&&', left: left, right: right }; },
        or: function (left, right) { return { k: 'bin', op: '||', left: left, right: right }; },
        not: function (arg) { return { k: 'un', op: '!', arg: arg }; },
        assign: function (target, value, op) { return { k: 'assign', op: op || '=', target: target, value: value }; },
        update: function (op, prefix, arg) { return { k: 'update', op: op, prefix: prefix, arg: arg }; },
        cond: function (test, then, otherwise) { return { k: 'cond', test: test, then: then, otherwise: otherwise }; },
        call: function (callee, args) { return { k: 'call', callee: callee, args: args || [] }; },
        new_: function (callee, args) { return { k: 'new', callee: callee, args: args || [] }; },
        mem: function (object, name) { return { k: 'mem', object: object, name: name }; },
        idx: function (object, index) { return { k: 'idx', object: object, index: index }; },
        seq: function (list) { return list.length === 1 ? list[0] : { k: 'seq', list: list }; },
        fn: function (name, params, body, generator) {
            return { k: 'fn', name: name || null, params: params, body: body, generator: !!generator };
        },
        arr: function (items) { return { k: 'arr', items: items }; },
        // pairs: [[key, value], ...]
        obj: function (pairs) { return { k: 'obj', pairs: pairs }; },
        yield_: function (arg, delegate) { return { k: 'yield', arg: arg || null, delegate: !!delegate }; },
        raw: function (code, precedence) { return { k: 'raw', code: code, precedence: precedence || 0 }; },
        // A method call: object.name(args)
        method: function (object, name, args) { return J.call(J.mem(object, name), args); },
        // A path a.b.c
        path: function (text) {
            var parts = text.split('.');
            var node = J.id(parts[0]);
            for (var index = 1; index < parts.length; ++index)
                node = J.mem(node, parts[index]);
            return node;
        },

        // Statements
        var_: function (name, init) { return { k: 'var', name: name, init: init === undefined ? null : init }; },
        let_: function (name, init) {
            return { k: 'var', kind: 'let', name: name, init: init === undefined ? null : init };
        },
        // Several declarations: list - [{ name, init }]; kind - var or let.
        vars: function (list, kind) { return { k: 'vars', kind: kind || 'var', list: list }; },
        expr: function (expression) { return { k: 'expr', expression: expression }; },
        if_: function (test, then, otherwise) {
            return { k: 'if', test: test, then: then, otherwise: otherwise || null };
        },
        while_: function (test, body) { return { k: 'while', test: test, body: body }; },
        doWhile: function (body, test) { return { k: 'dowhile', body: body, test: test }; },
        for_: function (init, test, update, body) {
            return { k: 'for', init: init || null, test: test || null, update: update || null, body: body };
        },
        block: function (body) { return { k: 'block', body: body }; },
        ret: function (value) { return { k: 'return', value: value || null }; },
        throw_: function (value) { return { k: 'throw', value: value }; },
        try_: function (body, param, handler, finalizer) {
            return { k: 'try', body: body, param: param || null, handler: handler || null, finalizer: finalizer || null };
        },
        brk: function (label) { return { k: 'break', label: label || null }; },
        cont: function (label) { return { k: 'continue', label: label || null }; },
        label: function (name, body) { return { k: 'label', name: name, body: body }; },
        // cases: [{ test: an expression or null (default), body: [...] }]
        switch_: function (discriminant, cases) { return { k: 'switch', discriminant: discriminant, cases: cases }; },
        fnDecl: function (name, params, body, generator) {
            return { k: 'fndecl', name: name, params: params, body: body, generator: !!generator };
        },
        empty: function () { return { k: 'empty' }; },
        rawStmt: function (code) { return { k: 'rawstmt', code: code }; },

        // The source line of a statement (for the line map).
        at: function (node, line, source) {
            if (line)
                node.line = line;
            if (source !== undefined)
                node.source = source;
            return node;
        },
        isSimple: function (node) {
            return node.k === 'id' || node.k === 'num' || node.k === 'str' || node.k === 'bool' ||
                node.k === 'null' || node.k === 'undef' || node.k === 'this';
        },
        isLiteral: function (node) {
            return node.k === 'num' || node.k === 'str' || node.k === 'bool' || node.k === 'null' ||
                node.k === 'undef' || (node.k === 'un' && node.op === '-' && node.arg.k === 'num');
        }
    };
    T.J = J;

    // Precedence of the JavaScript operators: higher binds tighter.
    var PRECEDENCE = {
        ',': 1, '=': 2, '||': 4, '&&': 5, '|': 6, '^': 7, '&': 8, '==': 9, '!=': 9, '===': 9, '!==': 9,
        '<': 10, '>': 10, '<=': 10, '>=': 10, 'instanceof': 10, 'in': 10, '<<': 11, '>>': 11, '>>>': 11,
        '+': 12, '-': 12, '*': 13, '/': 13, '%': 13
    };

    // Deeper is a translation error: the V4 compiler recurses without a
    // stack check (see docs/internals/v4-pitfalls.md).
    var MAX_EXPRESSION_DEPTH = 250;

    function Printer() {
        this.lines = [];
        this.current = '';
        this.indent = 0;
        // The map: code line number (from 1) -> { line, source } of the source.
        this.map = [];
        this.position = null;
        this.depth = 0;
    }

    Printer.prototype.newline = function () {
        this.lines.push(this.current);
        this.current = '';
        var mark = this.position;
        if (mark !== null)
            this.map[this.lines.length + 1] = mark;
    };

    Printer.prototype.startLine = function (node) {
        if (this.current.length > 0)
            this.newline();
        if (node && node.line) {
            this.position = { line: node.line, source: node.source };
            this.map[this.lines.length + 1] = this.position;
        }
        this.current = new Array(this.indent + 1).join(' ');
    };

    Printer.prototype.write = function (text) {
        this.current += text;
    };

    Printer.prototype.statements = function (list) {
        for (var index = 0; index < list.length; ++index)
            this.statement(list[index]);
    };

    Printer.prototype.body = function (list) {
        this.write('{');
        ++this.indent;
        var saved = this.position;
        this.statements(list);
        this.position = saved;
        --this.indent;
        this.startLine(null);
        this.write('}');
    };

    Printer.prototype.blockOrStatement = function (node) {
        this.body(node.k === 'block' ? node.body : [node]);
    };

    // An expression into the current line. An expression with a function
    // inside writes itself (the body of the function on its own lines), so
    // everything before it must be written already.
    Printer.prototype.out = function (node, minimum) {
        this.write(this.expression(node, minimum));
    };

    // An expression statement that starts with { or function goes in
    // parentheses.
    function startsWithBrace(node) {
        for (;;) {
            switch (node.k) {
            case 'fn':
            case 'obj':
                return true;
            case 'bin':
                node = node.left;
                break;
            case 'call':
                if (node.callee.k === 'fn')
                    return false;
                node = node.callee;
                break;
            case 'mem':
            case 'idx':
                node = node.object;
                break;
            case 'assign':
                node = node.target;
                break;
            case 'cond':
                node = node.test;
                break;
            case 'seq':
                node = node.list[0];
                break;
            case 'update':
                if (node.prefix)
                    return false;
                node = node.arg;
                break;
            default:
                return false;
            }
        }
    }

    Printer.prototype.declarations = function (kind, list) {
        this.write(kind + ' ');
        for (var index = 0; index < list.length; ++index) {
            if (index > 0)
                this.write(', ');
            this.write(list[index].name);
            if (list[index].init !== null) {
                this.write(' = ');
                this.out(list[index].init, 2);
            }
        }
    };

    Printer.prototype.statement = function (node) {
        switch (node.k) {
        case 'var':
            this.startLine(node);
            this.declarations(node.kind || 'var', [node]);
            this.write(';');
            return;
        case 'vars':
            this.startLine(node);
            this.declarations(node.kind || 'var', node.list);
            this.write(';');
            return;
        case 'expr': {
            this.startLine(node);
            var wrap = startsWithBrace(node.expression);
            if (wrap)
                this.write('(');
            this.out(node.expression, 0);
            this.write(wrap ? ');' : ';');
            return;
        }
        case 'if':
            this.startLine(node);
            this.ifTail(node);
            return;
        case 'while':
            this.startLine(node);
            this.write('while (');
            this.out(node.test, 0);
            this.write(') ');
            this.blockOrStatement(node.body);
            return;
        case 'dowhile':
            this.startLine(node);
            this.write('do ');
            this.blockOrStatement(node.body);
            this.write(' while (');
            this.out(node.test, 0);
            this.write(');');
            return;
        case 'for':
            this.startLine(node);
            this.forHead(node);
            return;
        case 'block':
            this.startLine(node);
            this.body(node.body);
            return;
        case 'return':
            this.startLine(node);
            if (node.value === null) {
                this.write('return;');
                return;
            }
            this.write('return ');
            this.out(node.value, 0);
            this.write(';');
            return;
        case 'throw':
            this.startLine(node);
            this.write('throw ');
            this.out(node.value, 0);
            this.write(';');
            return;
        case 'try':
            this.startLine(node);
            this.write('try ');
            this.body(node.body);
            if (node.handler !== null) {
                this.write(' catch (' + node.param + ') ');
                this.body(node.handler);
            }
            if (node.finalizer !== null) {
                this.write(' finally ');
                this.body(node.finalizer);
            }
            return;
        case 'break':
            this.startLine(node);
            this.write(node.label !== null ? 'break ' + node.label + ';' : 'break;');
            return;
        case 'continue':
            this.startLine(node);
            this.write(node.label !== null ? 'continue ' + node.label + ';' : 'continue;');
            return;
        case 'label':
            // A label and a statement on one line.
            this.startLine(node);
            this.write(node.name + ': ');
            this.labelled(node.body);
            return;
        case 'switch':
            this.startLine(node);
            this.switchHead(node);
            return;
        case 'fndecl':
            this.startLine(node);
            this.write('function' + (node.generator ? '* ' : ' ') + node.name + '(' + node.params.join(', ') + ') ');
            this.body(node.body);
            return;
        case 'empty':
            return;
        case 'rawstmt':
            this.startLine(node);
            this.write(node.code);
            return;
        default:
            throw new Error('Unknown statement ' + node.k);
        }
    };

    // The body of a label without a new line.
    Printer.prototype.labelled = function (node) {
        if (node.line)
            this.position = { line: node.line, source: node.source };
        switch (node.k) {
        case 'for':
            this.forHead(node);
            return;
        case 'while':
            this.write('while (');
            this.out(node.test, 0);
            this.write(') ');
            this.blockOrStatement(node.body);
            return;
        case 'dowhile':
            this.write('do ');
            this.blockOrStatement(node.body);
            this.write(' while (');
            this.out(node.test, 0);
            this.write(');');
            return;
        case 'block':
            this.body(node.body);
            return;
        case 'switch':
            this.switchHead(node);
            return;
        case 'if':
            this.ifTail(node);
            return;
        }
        this.write('{');
        ++this.indent;
        this.statement(node);
        --this.indent;
        this.startLine(null);
        this.write('}');
    };

    Printer.prototype.forHead = function (node) {
        this.write('for (');
        if (node.init !== null) {
            if (node.init.k === 'var')
                this.declarations(node.init.kind || 'var', [node.init]);
            else if (node.init.k === 'vars')
                this.declarations(node.init.kind || 'var', node.init.list);
            else
                this.out(node.init, 0);
        }
        this.write('; ');
        if (node.test !== null)
            this.out(node.test, 0);
        this.write('; ');
        if (node.update !== null)
            this.out(node.update, 0);
        this.write(') ');
        this.blockOrStatement(node.body);
    };

    Printer.prototype.switchHead = function (node) {
        this.write('switch (');
        this.out(node.discriminant, 0);
        this.write(') {');
        ++this.indent;
        for (var index = 0; index < node.cases.length; ++index) {
            var item = node.cases[index];
            this.startLine(item);
            if (item.test === null) {
                this.write('default:');
            } else {
                this.write('case ');
                this.out(item.test, 0);
                this.write(':');
            }
            ++this.indent;
            this.statements(item.body);
            --this.indent;
        }
        --this.indent;
        this.startLine(null);
        this.write('}');
    };

    Printer.prototype.ifTail = function (node) {
        this.write('if (');
        this.out(node.test, 0);
        this.write(') ');
        this.blockOrStatement(node.then);
        if (node.otherwise !== null) {
            this.write(' else ');
            if (node.otherwise.k === 'if') {
                var nested = node.otherwise;
                // else if on the same line, with its own line mark.
                if (nested.line)
                    this.position = { line: nested.line, source: nested.source };
                this.ifTail(nested);
            } else {
                this.blockOrStatement(node.otherwise);
            }
        }
    };

    function quote(text) {
        var result = '"';
        for (var index = 0; index < text.length; ++index) {
            var code = text.charCodeAt(index);
            var char = text.charAt(index);
            if (char === '"' || char === '\\')
                result += '\\' + char;
            else if (code === 10)
                result += '\\n';
            else if (code === 13)
                result += '\\r';
            else if (code === 9)
                result += '\\t';
            else if (code < 32 || (code >= 0x7F && code <= 0x9F) || code === 0x2028 || code === 0x2029 ||
                     (code >= 0xD800 && code <= 0xDFFF))
                result += '\\u' + ('000' + code.toString(16)).slice(-4);
            else
                result += char;
        }
        return result + '"';
    }
    T.quote = quote;

    function numberText(value) {
        if (value !== value)
            return 'NaN';
        if (value === Infinity)
            return 'Infinity';
        if (value === -Infinity)
            return '-Infinity';
        if (value === 0 && 1 / value < 0)
            return '-0';
        return String(value);
    }

    Printer.prototype.expression = function (node, minimum) {
        if (++this.depth > MAX_EXPRESSION_DEPTH) {
            this.depth = 0;
            throw new CompileError('the expression is too complex', this.position ? this.position.line : 0, 0,
                                   this.position ? this.position.source : '');
        }
        var result = this.expressionText(node);
        --this.depth;
        return result.precedence < minimum ? '(' + result.text + ')' : result.text;
    };

    function op(text, precedence) {
        return { text: text, precedence: precedence };
    }

    Printer.prototype.expressionText = function (node) {
        var self = this;
        switch (node.k) {
        case 'id':
            return op(node.name, 20);
        case 'num':
            return op(numberText(node.value), node.value < 0 || (node.value === 0 && 1 / node.value < 0) ? 15 : 20);
        case 'str':
            return op(quote(node.value), 20);
        case 'bool':
            return op(node.value ? 'true' : 'false', 20);
        case 'null':
            return op('null', 20);
        case 'undef':
            return op('undefined', 20);
        case 'this':
            return op('this', 20);
        case 'raw':
            return op(node.code, node.precedence || 0);
        case 'bin': {
            var precedence = PRECEDENCE[node.op];
            var left = this.expression(node.left, precedence);
            var right = this.expression(node.right, precedence + 1);
            if ((node.op === '-' && right.charAt(0) === '-') || (node.op === '+' && right.charAt(0) === '+'))
                right = '(' + right + ')';
            return op(left + ' ' + node.op + ' ' + right, precedence);
        }
        case 'un': {
            var operand = this.expression(node.arg, 15);
            var spaced = node.op === 'typeof' || node.op === 'void' || node.op === 'delete' ||
                ((node.op === '-' || node.op === '+') && /^[-+]/.test(operand));
            return op(node.op + (spaced ? ' ' : '') + operand, 15);
        }
        case 'update': {
            var argument = this.expression(node.arg, 16);
            return op(node.prefix ? node.op + argument : argument + node.op, 16);
        }
        case 'assign':
            return op(this.expression(node.target, 16) + ' ' + node.op + ' ' + this.expression(node.value, 2), 2);
        case 'cond':
            return op(this.expression(node.test, 4) + ' ? ' + this.expression(node.then, 2) + ' : ' +
                      this.expression(node.otherwise, 2), 3);
        case 'call': {
            var callee = this.expression(node.callee, 18);
            if (node.callee.k === 'fn')
                callee = '(' + callee + ')';
            return op(callee + '(' + node.args.map(function (arg) { return self.expression(arg, 2); }).join(', ') + ')', 18);
        }
        case 'new':
            return op('new ' + this.expression(node.callee, 19) + '(' +
                      node.args.map(function (arg) { return self.expression(arg, 2); }).join(', ') + ')', 18);
        case 'mem': {
            var object = this.expression(node.object, 18);
            if (node.object.k === 'num')
                object = '(' + object + ')';
            return op(object + '.' + node.name, 18);
        }
        case 'idx': {
            var target = this.expression(node.object, 18);
            if (node.object.k === 'num')
                target = '(' + target + ')';
            return op(target + '[' + this.expression(node.index, 0) + ']', 18);
        }
        case 'seq':
            return op(node.list.map(function (item) { return self.expression(item, 2); }).join(', '), 1);
        case 'arr':
            return op('[' + node.items.map(function (item) { return self.expression(item, 2); }).join(', ') + ']', 20);
        case 'obj':
            return op('{' + node.pairs.map(function (pair) {
                var key = /^[A-Za-z_$][\w$]*$/.test(pair[0]) ? pair[0] : quote(pair[0]);
                return key + ': ' + self.expression(pair[1], 2);
            }).join(', ') + '}', 20);
        case 'fn': {
            // The body of a function is printed on its own lines; the
            // expression stays on the line where it started.
            var saved = this.current;
            var savedDepth = this.depth;
            this.depth = 0;
            this.current = '';
            var start = this.lines.length;
            this.write('function' + (node.generator ? '*' : '') + (node.name ? ' ' + node.name : '') + '(' +
                       node.params.join(', ') + ') ');
            var savedPosition = this.position;
            this.body(node.body);
            this.position = savedPosition;
            this.depth = savedDepth;
            // The start of the function is appended to the interrupted line.
            var produced = this.lines.splice(start);
            produced.push(this.current);
            produced[0] = saved + produced[0];
            this.current = produced.pop();
            for (var index = 0; index < produced.length; ++index)
                this.lines.push(produced[index]);
            // The line marks that the function wrote need no shift: splice
            // and push put the lines back at the same numbers.
            return op('', 20, true);
        }
        case 'yield':
            if (node.arg === null)
                return op('yield', 2);
            return op('yield' + (node.delegate ? '* ' : ' ') + this.expression(node.arg, 2), 2);
        default:
            throw new Error('Unknown expression ' + node.k);
        }
    };

    // A function expression writes itself right into the current line (its
    // body on other lines), so everything around it is printed in order:
    // expressionText for 'fn' returns an empty text, and the text itself is
    // already in this.current. For that the expressions are put into the
    // line while walking - see compose below.
    Printer.prototype.expression = (function (plain) {
        return function (node, minimum) {
            if (!containsFunction(node))
                return plain.call(this, node, minimum);
            return this.compose(node, minimum);
        };
    })(Printer.prototype.expression);

    function containsFunction(node) {
        if (node === null || typeof node !== 'object')
            return false;
        if (node.hasFunction !== undefined)
            return node.hasFunction;
        var found = false;
        switch (node.k) {
        case 'fn':
            found = true;
            break;
        case 'bin':
            found = containsFunction(node.left) || containsFunction(node.right);
            break;
        case 'un':
        case 'update':
            found = containsFunction(node.arg);
            break;
        case 'assign':
            found = containsFunction(node.target) || containsFunction(node.value);
            break;
        case 'cond':
            found = containsFunction(node.test) || containsFunction(node.then) || containsFunction(node.otherwise);
            break;
        case 'call':
        case 'new':
            found = containsFunction(node.callee) || node.args.some(containsFunction);
            break;
        case 'mem':
            found = containsFunction(node.object);
            break;
        case 'idx':
            found = containsFunction(node.object) || containsFunction(node.index);
            break;
        case 'seq':
            found = node.list.some(containsFunction);
            break;
        case 'arr':
            found = node.items.some(containsFunction);
            break;
        case 'obj':
            found = node.pairs.some(function (pair) { return containsFunction(pair[1]); });
            break;
        case 'yield':
            found = containsFunction(node.arg);
            break;
        }
        node.hasFunction = found;
        return found;
    }

    // Prints an expression with functions inside: the text goes right into
    // this.current from left to right, functions with their own lines.
    // Returns an empty string (everything is written).
    Printer.prototype.compose = function (node, minimum) {
        var self = this;
        if (++this.depth > MAX_EXPRESSION_DEPTH) {
            this.depth = 0;
            throw new CompileError('the expression is too complex', this.position ? this.position.line : 0, 0,
                                   this.position ? this.position.source : '');
        }
        var precedence = this.precedenceOf(node);
        var parens = precedence < minimum;
        if (parens)
            this.write('(');
        function sub(child, childMinimum) {
            var text = self.expression(child, childMinimum);
            self.write(text);
        }
        switch (node.k) {
        case 'fn':
            this.expressionText(node);
            break;
        case 'bin':
            sub(node.left, PRECEDENCE[node.op]);
            this.write(' ' + node.op + ' ');
            sub(node.right, PRECEDENCE[node.op] + 1);
            break;
        case 'un':
            this.write(node.op + (node.op === 'typeof' || node.op === 'void' || node.op === 'delete' ? ' ' : ''));
            sub(node.arg, 15);
            break;
        case 'update':
            if (node.prefix)
                this.write(node.op);
            sub(node.arg, 16);
            if (!node.prefix)
                this.write(node.op);
            break;
        case 'assign':
            sub(node.target, 16);
            this.write(' ' + node.op + ' ');
            sub(node.value, 2);
            break;
        case 'cond':
            sub(node.test, 4);
            this.write(' ? ');
            sub(node.then, 2);
            this.write(' : ');
            sub(node.otherwise, 2);
            break;
        case 'call':
        case 'new':
            if (node.k === 'new')
                this.write('new ');
            if (node.callee.k === 'fn') {
                this.write('(');
                sub(node.callee, 0);
                this.write(')');
            } else {
                sub(node.callee, node.k === 'new' ? 19 : 18);
            }
            this.write('(');
            node.args.forEach(function (arg, index) {
                if (index > 0)
                    self.write(', ');
                sub(arg, 2);
            });
            this.write(')');
            break;
        case 'mem':
            sub(node.object, 18);
            this.write('.' + node.name);
            break;
        case 'idx':
            sub(node.object, 18);
            this.write('[');
            sub(node.index, 0);
            this.write(']');
            break;
        case 'seq':
            node.list.forEach(function (item, index) {
                if (index > 0)
                    self.write(', ');
                sub(item, 2);
            });
            break;
        case 'arr':
            this.write('[');
            node.items.forEach(function (item, index) {
                if (index > 0)
                    self.write(', ');
                sub(item, 2);
            });
            this.write(']');
            break;
        case 'obj':
            this.write('{');
            node.pairs.forEach(function (pair, index) {
                if (index > 0)
                    self.write(', ');
                self.write((/^[A-Za-z_$][\w$]*$/.test(pair[0]) ? pair[0] : quote(pair[0])) + ': ');
                sub(pair[1], 2);
            });
            this.write('}');
            break;
        case 'yield':
            this.write('yield' + (node.delegate ? '* ' : ' '));
            sub(node.arg, 2);
            break;
        default:
            throw new Error('Unknown expression ' + node.k);
        }
        if (parens)
            this.write(')');
        --this.depth;
        return '';
    };

    Printer.prototype.precedenceOf = function (node) {
        switch (node.k) {
        case 'bin':
            return PRECEDENCE[node.op];
        case 'un':
            return 15;
        case 'update':
            return 16;
        case 'assign':
        case 'yield':
            return 2;
        case 'cond':
            return 3;
        case 'seq':
            return 1;
        case 'call':
        case 'new':
        case 'mem':
        case 'idx':
            return 18;
        default:
            return 20;
        }
    };

    // The source of the lines of the language library: such places of
    // errors are skipped (the place is lower in the stack, in user code).
    T.LIBRARY_SOURCE = '\u0000library';

    // The source for all statements of the tree that have none.
    T.setSource = function (node, source) {
        if (node === null || typeof node !== 'object')
            return;
        if (Array.isArray(node)) {
            node.forEach(function (item) { T.setSource(item, source); });
            return;
        }
        if (node.k !== undefined && node.line && node.source === undefined)
            node.source = source;
        Object.keys(node).forEach(function (key) {
            var value = node[key];
            if (value !== null && typeof value === 'object')
                T.setSource(value, source);
        });
    };

    // The program text and the line map from a list of statements.
    T.print = function (statements) {
        var printer = new Printer();
        printer.statements(statements);
        if (printer.current.length > 0)
            printer.lines.push(printer.current);
        return { code: printer.lines.join('\n'), map: printer.map };
    };

    // The source line of a line of the printed code: the nearest mark above.
    T.mapLine = function (map, line) {
        for (var index = line; index >= 1; --index) {
            if (map[index] !== undefined)
                return map[index];
        }
        return null;
    };

    // --- A function the translator builds: temporary variables

    function FunctionScope(prefix) {
        this.temps = [];
        this.free = [];
        this.prefix = prefix || '$t';
        this.counter = 0;
    }
    FunctionScope.prototype.temp = function () {
        var name = this.prefix + (++this.counter);
        this.temps.push(name);
        return name;
    };
    // Declares the temporaries at the start of the function body.
    FunctionScope.prototype.declarations = function () {
        if (this.temps.length === 0)
            return [];
        return [{ k: 'vars', list: this.temps.map(function (name) { return { name: name, init: null }; }) }];
    };
    T.FunctionScope = FunctionScope;

    // --- Numbers of a given width
    //
    // Kinds: i8 i16 i32 i64 u8 u16 u32 u64 f32 f64. Integers up to 32 bits
    // are numbers with truncation (|0, >>>0, Math.imul), 64-bit ones are a
    // hybrid (T.i64, T.u64): a fast branch in the code, a slow one is a
    // call. ctx: { temp() - the name of a temporary, helper(name) - an
    // expression for T.<name>, divideByZero - a call expression that throws
    // the division by zero error }.

    var MAX = 9007199254740991;

    function isWide(kind) {
        return kind === 'i64' || kind === 'u64';
    }

    function isFloat(kind) {
        return kind === 'f32' || kind === 'f64';
    }

    function isSigned(kind) {
        return kind.charAt(0) === 'i';
    }

    function bits(kind) {
        return Number(kind.substring(1));
    }

    // A value of the kind from any JavaScript integer (int32).
    function wrap(kind, node) {
        switch (kind) {
        case 'i32':
            return J.bin('|', node, J.num(0));
        case 'u32':
            return J.bin('>>>', node, J.num(0));
        case 'i16':
            return J.bin('>>', J.bin('<<', node, J.num(16)), J.num(16));
        case 'i8':
            return J.bin('>>', J.bin('<<', node, J.num(24)), J.num(24));
        case 'u16':
            return J.bin('&', node, J.num(65535));
        case 'u8':
            return J.bin('&', node, J.num(255));
        }
        return node;
    }

    // An operand that can be evaluated twice: a simple one as it is,
    // otherwise into a temporary. Returns [the evaluation or null, the reference].
    function stable(node, ctx) {
        if (J.isSimple(node))
            return [null, node];
        var name = ctx.temp();
        return [J.assign(J.id(name), node), J.id(name)];
    }

    function withSetup(setups, node) {
        var list = setups.filter(function (item) { return item !== null; });
        if (list.length === 0)
            return node;
        list.push(node);
        return J.seq(list);
    }

    function isNumberLiteral(node) {
        return node.k === 'num' || (node.k === 'un' && node.op === '-' && node.arg.k === 'num');
    }

    function helper(ctx, kind, name) {
        return J.mem(ctx.helper(kind === 'u64' ? 'u64' : 'i64'), name);
    }

    // The fast branch of 64-bit arithmetic: a result within the exact
    // integers is the answer, otherwise (or if an operand is an object) - a call.
    function wideArithmetic(kind, operator, slowName, left, right, ctx) {
        var stableLeft = stable(left, ctx), stableRight = stable(right, ctx);
        var result = J.id(ctx.temp());
        var assigned = J.assign(result, J.bin(operator, stableLeft[1], stableRight[1]));
        var test = kind === 'u64'
            ? J.and(J.bin('>=', assigned, J.num(0)), J.bin('<=', result, J.num(MAX)))
            : J.and(J.bin('<=', assigned, J.num(MAX)), J.bin('>=', result, J.num(-MAX)));
        return withSetup([stableLeft[0], stableRight[0]],
                         J.cond(test, result, J.call(helper(ctx, kind, slowName), [stableLeft[1], stableRight[1]])));
    }

    function bothNumbers(left, right) {
        var tests = [];
        if (!isNumberLiteral(left))
            tests.push(J.bin('===', J.un('typeof', left), J.str('number')));
        if (!isNumberLiteral(right))
            tests.push(J.bin('===', J.un('typeof', right), J.str('number')));
        if (tests.length === 0)
            return J.bool(true);
        return tests.length === 1 ? tests[0] : J.and(tests[0], tests[1]);
    }

    function bothInt32(left, right) {
        var tests = [];
        [left, right].forEach(function (node) {
            if (isNumberLiteral(node) && (node.k === 'num' ? node.value : -node.arg.value) === ((node.k === 'num' ? node.value : -node.arg.value) | 0))
                return;
            tests.push(J.bin('===', J.bin('|', node, J.num(0)), node));
        });
        if (tests.length === 0)
            return J.bool(true);
        return tests.length === 1 ? tests[0] : J.and(tests[0], tests[1]);
    }

    var COMPARE_NAMES = { '<': 'lt', '<=': 'le', '>': 'gt', '>=': 'ge' };

    var ops = {
        isWide: isWide,
        isFloat: isFloat,
        isSigned: isSigned,
        bits: bits,
        wrap: wrap,
        stable: stable,

        // A binary operation: + - * / % & | ^ &^ << >> == != < <= > >=.
        // A shift: the right operand is a non-negative number (not a hybrid).
        binary: function (kind, operator, left, right, ctx) {
            if (operator === '==' || operator === '!=')
                return ops.equals(kind, operator === '!=', left, right, ctx);
            if (COMPARE_NAMES[operator] !== undefined)
                return ops.compare(kind, operator, left, right, ctx);
            if (isFloat(kind)) {
                if (operator === '%') {
                    var remainder = J.bin('%', left, right);
                    return kind === 'f32' ? J.call(J.path('Math.fround'), [remainder]) : remainder;
                }
                var result = J.bin(operator, left, right);
                return kind === 'f32' ? J.call(J.path('Math.fround'), [result]) : result;
            }
            if (isWide(kind))
                return ops.wideBinary(kind, operator, left, right, ctx);
            switch (operator) {
            case '+':
            case '-':
                return wrap(kind, J.bin(operator, left, right));
            case '*':
                if (kind === 'u32')
                    return J.bin('>>>', J.call(J.path('Math.imul'), [left, right]), J.num(0));
                return kind === 'i32' ? J.call(J.path('Math.imul'), [left, right])
                                      : wrap(kind, J.call(J.path('Math.imul'), [left, right]));
            case '/':
            case '%': {
                // The left operand is evaluated before the right one, as in the source.
                var stableLeft = J.isSimple(right) ? [null, left] : stable(left, ctx);
                var stableRight = stable(right, ctx);
                var operation;
                if (operator === '/') {
                    var quotient = J.bin('/', stableLeft[1], stableRight[1]);
                    operation = kind === 'u32' ? J.bin('>>>', quotient, J.num(0)) : J.bin('|', quotient, J.num(0));
                    if (kind === 'i8' || kind === 'i16')
                        operation = wrap(kind, operation);
                } else {
                    operation = kind === 'u32'
                        ? J.bin('%', stableLeft[1], stableRight[1])
                        : J.bin('|', J.bin('%', stableLeft[1], stableRight[1]), J.num(0));
                }
                if (right.k === 'num' && right.value !== 0)
                    return withSetup([stableLeft[0]], operation);
                return withSetup([stableLeft[0], stableRight[0]],
                                 J.cond(J.bin('===', stableRight[1], J.num(0)), ctx.divideByZero, operation));
            }
            case '&':
            case '|':
            case '^':
                return kind === 'u32' ? J.bin('>>>', J.bin(operator, left, right), J.num(0)) : J.bin(operator, left, right);
            case '&^':
                return kind === 'u32' ? J.bin('>>>', J.bin('&', left, J.un('~', right)), J.num(0))
                                      : J.bin('&', left, J.un('~', right));
            case '<<': {
                if (right.k === 'num')
                    return right.value < 32 ? wrap(kind, J.bin('<<', left, right)) : J.num(0);
                var base = stable(left, ctx);
                var count = stable(right, ctx);
                var shifted = wrap(kind, J.bin('<<', base[1], count[1]));
                return withSetup([base[0], count[0]], J.cond(J.bin('<', count[1], J.num(32)), shifted, J.num(0)));
            }
            case '>>': {
                var signed = isSigned(kind);
                if (right.k === 'num') {
                    return right.value < 32 ? J.bin(signed ? '>>' : '>>>', left, right)
                                            : (signed ? J.bin('>>', left, J.num(31)) : J.num(0));
                }
                var value = stable(left, ctx);
                var amount = stable(right, ctx);
                var shift = J.bin(signed ? '>>' : '>>>', value[1], amount[1]);
                return withSetup([value[0], amount[0]],
                                 J.cond(J.bin('<', amount[1], J.num(32)), shift,
                                        signed ? J.bin('>>', value[1], J.num(31)) : J.num(0)));
            }
            }
            throw new Error('Unknown operator ' + operator);
        },

        wideBinary: function (kind, operator, left, right, ctx) {
            switch (operator) {
            case '+':
                return wideArithmetic(kind, '+', 'add', left, right, ctx);
            case '-':
                return wideArithmetic(kind, '-', 'sub', left, right, ctx);
            case '*':
                return wideArithmetic(kind, '*', 'mul', left, right, ctx);
            case '/':
            case '%': {
                var stableLeft = stable(left, ctx), stableRight = stable(right, ctx);
                var fast = operator === '/' ? J.call(J.path('Math.trunc'), [J.bin('/', stableLeft[1], stableRight[1])])
                                            : J.bin('%', stableLeft[1], stableRight[1]);
                // -0 from Math.trunc and % is never an integer of a language: + 0 removes it.
                fast = J.bin('+', fast, J.num(0));
                var slow = J.call(helper(ctx, kind, operator === '/' ? 'div' : 'mod'), [stableLeft[1], stableRight[1]]);
                var expression = J.cond(bothNumbers(stableLeft[1], stableRight[1]), fast, slow);
                if (!(right.k === 'num' && right.value !== 0))
                    expression = J.cond(J.bin('===', stableRight[1], J.num(0)), ctx.divideByZero, expression);
                return withSetup([stableLeft[0], stableRight[0]], expression);
            }
            case '&':
            case '|':
            case '^':
            case '&^': {
                var leftOperand = stable(left, ctx), rightOperand = stable(right, ctx);
                var names = { '&': 'and', '|': 'or', '^': 'xor', '&^': 'andNot' };
                var quick = operator === '&^'
                    ? J.bin('&', leftOperand[1], J.un('~', rightOperand[1]))
                    : J.bin(operator, leftOperand[1], rightOperand[1]);
                if (kind === 'u64')
                    quick = J.bin('>>>', quick, J.num(0));
                var test = bothInt32(leftOperand[1], rightOperand[1]);
                if (kind === 'u64') {
                    // Unsigned values are non-negative below 2^31.
                    test = J.and(test,
                                 J.and(J.bin('>=', leftOperand[1], J.num(0)), J.bin('>=', rightOperand[1], J.num(0))));
                }
                return withSetup([leftOperand[0], rightOperand[0]],
                                 J.cond(test, quick,
                                        J.call(helper(ctx, kind, names[operator]), [leftOperand[1], rightOperand[1]])));
            }
            case '<<':
                return J.call(helper(ctx, kind, 'shl'), [left, right]);
            case '>>':
                return J.call(helper(ctx, kind, 'shr'), [left, right]);
            }
            throw new Error('Unknown operator ' + operator);
        },

        equals: function (kind, negate, left, right, ctx) {
            if (!isWide(kind) || isNumberLiteral(left) || isNumberLiteral(right))
                return J.bin(negate ? '!==' : '===', left, right);
            var stableLeft = stable(left, ctx), stableRight = stable(right, ctx);
            var equal = J.or(J.bin('===', stableLeft[1], stableRight[1]),
                             J.and(J.bin('===', J.un('typeof', stableLeft[1]), J.str('object')),
                                   J.call(helper(ctx, kind, 'eq'), [stableLeft[1], stableRight[1]])));
            return withSetup([stableLeft[0], stableRight[0]], negate ? J.not(equal) : equal);
        },

        compare: function (kind, operator, left, right, ctx) {
            if (!isWide(kind))
                return J.bin(operator, left, right);
            var stableLeft = stable(left, ctx), stableRight = stable(right, ctx);
            var fast = J.bin(operator, stableLeft[1], stableRight[1]);
            var slow = J.call(helper(ctx, kind, COMPARE_NAMES[operator]), [stableLeft[1], stableRight[1]]);
            return withSetup([stableLeft[0], stableRight[0]],
                             J.cond(bothNumbers(stableLeft[1], stableRight[1]), fast, slow));
        },

        // A unary operation: - (minus), ^ (bitwise not), + .
        unary: function (kind, operator, arg, ctx) {
            if (operator === '+')
                return arg;
            if (isFloat(kind)) {
                if (operator === '-')
                    return J.un('-', arg);
                throw new Error('Bad float operator ' + operator);
            }
            if (isWide(kind)) {
                if (operator === '-') {
                    if (kind === 'u64')
                        return J.call(helper(ctx, kind, 'neg'), [arg]);
                    var stableValue = stable(arg, ctx);
                    return withSetup([stableValue[0]],
                                     J.cond(J.bin('===', J.un('typeof', stableValue[1]), J.str('number')),
                                            J.bin('-', J.num(0), stableValue[1]),
                                            J.call(helper(ctx, kind, 'neg'), [stableValue[1]])));
                }
                var value = stable(arg, ctx);
                var quickNot = J.un('~', value[1]);
                if (kind === 'u64')
                    return J.call(helper(ctx, kind, 'not'), [arg]);
                return withSetup([value[0]], J.cond(J.bin('===', J.bin('|', value[1], J.num(0)), value[1]), quickNot,
                                                    J.call(helper(ctx, kind, 'not'), [value[1]])));
            }
            if (operator === '-')
                return wrap(kind, J.bin('-', J.num(0), arg));
            return kind === 'i32' || kind === 'i16' || kind === 'i8' ? J.un('~', arg) : wrap(kind, J.un('~', arg));
        },

        // Conversion between kinds. A float to an integer drops the
        // fraction.
        convert: function (from, to, arg, ctx) {
            if (from === to)
                return arg;
            if (isFloat(to)) {
                var number = isWide(from) ? J.call(helper(ctx, from, 'toFloat'), [arg]) : arg;
                return to === 'f32' ? J.call(J.path('Math.fround'), [number]) : number;
            }
            if (isFloat(from)) {
                if (isWide(to))
                    return J.call(helper(ctx, to, 'fromFloat'), [arg]);
                // NaN and infinities are 0, everything else is taken modulo.
                return wrap(to, J.call(ctx.helper('truncateInt'), [arg]));
            }
            if (isWide(to)) {
                if (isWide(from))
                    return J.call(J.mem(ctx.helper(to === 'u64' ? 'u64' : 'i64'), to === 'u64' ? 'fromSigned' : 'fromUnsigned'), [arg]);
                if (to === 'u64' && isSigned(from)) {
                    var stableValue = stable(arg, ctx);
                    var fromSigned = J.call(helper(ctx, 'u64', 'fromSigned'), [stableValue[1]]);
                    return withSetup([stableValue[0]],
                                     J.cond(J.bin('<', stableValue[1], J.num(0)), fromSigned, stableValue[1]));
                }
                return arg;
            }
            if (isWide(from)) {
                var low = stable(arg, ctx);
                var low32 = J.cond(J.bin('===', J.un('typeof', low[1]), J.str('number')), J.bin('|', low[1], J.num(0)),
                                   J.mem(low[1], 'lo'));
                return withSetup([low[0]], to === 'i32' ? low32 : wrap(to, low32));
            }
            // Integers up to 32 bits among themselves.
            if (bits(to) > bits(from) && (isSigned(from) === isSigned(to) || !isSigned(from)))
                return arg;
            return wrap(to, arg);
        }
    };
    T.ops = ops;

    // --- Labels and jumps into nested blocks and loops.

    // Negation of a condition without an extra "!".
    function negate(test) {
        if (test.k === 'bin' && (test.op === '!==' || test.op === '==='))
            return J.bin(test.op === '!==' ? '===' : '!==', test.left, test.right);
        if (test.k === 'un' && test.op === '!')
            return test.arg;
        if (test.k === 'bool')
            return J.bool(!test.value);
        return J.not(test);
    }
    T.negate = negate;

    function Region(kind, start, end, label) {
        this.kind = kind;     // 'block' (a jump forward) or 'loop' (backward)
        this.start = start;
        this.end = end;       // inclusive
        this.label = label;
        this.children = [];
    }

    function buildRegions(items) {
        var positions = Object.create(null);
        items.forEach(function (item, index) {
            if (item.k === 'label')
                positions[item.id] = index;
        });
        var forward = Object.create(null), backward = Object.create(null);
        items.forEach(function (item, index) {
            if (item.k !== 'goto')
                return;
            var target = positions[item.id];
            if (target === undefined)
                throw new Error('Unresolved label ' + item.id);
            item.forward = target > index;
            if (item.forward)
                forward[item.id] = Math.min(forward[item.id] === undefined ? index : forward[item.id], index);
            else
                backward[item.id] = Math.max(backward[item.id] === undefined ? index : backward[item.id], index);
        });
        var loops = Object.keys(backward).map(function (id) {
            return new Region('loop', positions[id], backward[id], id);
        });
        var blocks = Object.keys(forward).map(function (id) {
            return new Region('block', forward[id], positions[id] - 1, id);
        });
        for (var outer = 0; outer < loops.length; ++outer) {
            for (var inner = 0; inner < loops.length; ++inner) {
                var first = loops[outer], second = loops[inner];
                var endsInside = second.start <= first.end && first.end < second.end;
                if (first !== second && first.start < second.start && endsInside)
                    return null;
            }
        }
        // A block may start before the first jump: so it encloses the loops
        // and blocks that it leaves.
        var all = loops.concat(blocks);
        for (var changed = true; changed;) {
            changed = false;
            for (var blockIndex = 0; blockIndex < blocks.length; ++blockIndex) {
                var block = blocks[blockIndex];
                for (var otherIndex = 0; otherIndex < all.length; ++otherIndex) {
                    var other = all[otherIndex];
                    if (other === block)
                        continue;
                    if (other.start < block.start && block.start <= other.end && other.end < block.end) {
                        block.start = other.start;
                        changed = true;
                    } else if (block.start < other.start && other.start <= block.end && block.end < other.end) {
                        if (other.kind === 'loop')
                            return null;
                        other.start = block.start;
                        changed = true;
                    }
                }
            }
        }
        all.sort(function (first, second) {
            if (first.start !== second.start)
                return first.start - second.start;
            if (first.end !== second.end)
                return second.end - first.end;
            return first.kind === second.kind ? 0 : (first.kind === 'block' ? -1 : 1);
        });
        var root = new Region('root', 0, items.length - 1, null);
        var stack = [root];
        all.forEach(function (region) {
            while (stack[stack.length - 1].end < region.start)
                stack.pop();
            var parent = stack[stack.length - 1];
            if (region.end > parent.end)
                throw new Error('Regions do not nest');
            parent.children.push(region);
            stack.push(region);
        });
        return root;
    }

    function blockName(id) {
        return '$B' + id;
    }

    function loopName(id) {
        return '$C' + id;
    }

    function at(node, item) {
        return J.at(node, item.line, item.source);
    }

    function gotoStatement(item) {
        var jump = item.forward ? J.brk(blockName(item.id)) : J.cont(loopName(item.id));
        return at(item.test !== null ? J.if_(item.test, jump) : jump, item);
    }

    function emitRegion(items, region) {
        var body = [];
        var position = region.kind === 'root' ? 0 : region.start;
        var children = region.children;
        var next = 0;
        while (position <= region.end) {
            if (next < children.length && children[next].start === position) {
                var child = children[next++];
                body.push(emitRegion(items, child));
                position = child.end + 1;
                continue;
            }
            var item = items[position++];
            if (item.k === 's')
                body.push(item.node);
            else if (item.k === 'goto')
                body.push(gotoStatement(item));
        }
        if (region.kind === 'root')
            return body;
        if (region.kind === 'block')
            return J.label(blockName(region.label), J.block(body));
        // A loop: exits when control reaches the end of the body; an
        // unconditional jump to the start at the end is the loop itself.
        var last = body.length > 0 ? body[body.length - 1] : null;
        var name = loopName(region.label);
        if (last !== null && last.k === 'continue' && last.label === name) {
            body.pop();
        } else if (last !== null && last.k === 'if' && last.otherwise === null && last.then.k === 'continue' &&
                   last.then.label === name) {
            // "if condition - again, else exit" at the end of the body becomes "if not condition - exit".
            body[body.length - 1] = J.at(J.if_(negate(last.test), J.brk(name)), last.line, last.source);
        } else {
            body.push(J.brk(name));
        }
        return J.label(loopName(region.label), J.for_(null, null, null, J.block(body)));
    }

    // The fallback: parts are switch branches, a jump changes the number;
    // tail - the statements after the switch (the end of the code).
    function emitStateMachine(items, tail) {
        var numbers = Object.create(null);
        var count = 0;
        items.forEach(function (item) {
            if (item.k === 'label')
                numbers[item.id] = ++count;
        });
        var cases = [{ test: J.num(0), body: [] }];
        items.forEach(function (item) {
            if (item.k === 'label') {
                cases.push({ test: J.num(numbers[item.id]), body: [] });
                return;
            }
            var body = cases[cases.length - 1].body;
            if (item.k === 's') {
                body.push(item.node);
                return;
            }
            var jump = J.block([J.expr(J.assign(J.id('$pc'), J.num(numbers[item.id]))), J.cont('$run')]);
            body.push(at(item.test !== null ? J.if_(item.test, jump) : jump, item));
        });
        return [J.var_('$pc', J.num(0)),
                J.label('$run', J.for_(null, null, null, J.block([J.switch_(J.id('$pc'), cases)].concat(tail))))];
    }

    // Statements from parts: { k: 's', node } - a statement, { k: 'label',
    // id }, { k: 'goto', id, test } - a jump (test is a condition or null).
    // Forward jumps become labeled blocks with break, backward ones loops
    // with continue; if the areas overlap - a switch state machine, then tail.
    T.structure = function (items, tail) {
        var root = buildRegions(items);
        return root !== null ? emitRegion(items, root) : emitStateMachine(items, tail);
    };

    // A float to int32: the fraction is dropped, NaN and infinities are 0.
    T.truncateInt = function (value) {
        return isFinite(value) ? Math.trunc(value) % 4294967296 | 0 : 0;
    };
})(globalThis);
