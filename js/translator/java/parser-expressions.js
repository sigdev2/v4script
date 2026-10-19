// Java: parsing expressions.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Java = T.java;
    var P = Java.Parser.prototype;
    if (P.expression)
        return;

    var PRECEDENCE = {
        '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5, '==': 6, '!=': 6, '<': 7, '>': 7, '<=': 7, '>=': 7, 'instanceof': 7,
        '<<': 8, '>>': 8, '>>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10
    };
    var ASSIGN = { '=': 1, '+=': 1, '-=': 1, '*=': 1, '/=': 1, '%=': 1, '&=': 1, '|=': 1, '^=': 1, '<<=': 1, '>>=': 1,
                   '>>>=': 1 };

    // An operator at the current position: ">" in a row without spaces join
    // into a shift (the lexer does not join them for List<List<T>>).
    P.operator = function () {
        var first = this.peek();
        if (first.type !== 'op' && !(first.type === 'keyword' && first.value === 'instanceof'))
            return null;
        if (first.value !== '>' && first.value !== '>>' && first.value !== '>>>')
            return { text: first.value, count: 1 };
        var text = first.value, count = 1;
        for (;;) {
            var next = this.peek(count);
            var previous = this.peek(count - 1);
            if (next.type !== 'op' || next.line !== previous.line || next.column !== previous.column + previous.text.length)
                break;
            if (next.value === '>' || next.value === '>=' || next.value === '>>' || next.value === '>>=') {
                var joined = text + next.value;
                if (!/^>{1,3}=?$/.test(joined))
                    break;
                text = joined;
                ++count;
                if (/=$/.test(text))
                    break;
                continue;
            }
            break;
        }
        return { text: text, count: count };
    };

    P.takeOperator = function (op) {
        for (var index = 0; index < op.count; ++index)
            this.next();
    };
    // Whether a lambda starts: x -> or (…) -> .
    P.startsLambda = function () {
        if (this.peek().type === 'ident' && this.is('->', 1))
            return true;
        if (!this.is('('))
            return false;
        var depth = 0;
        for (var offset = 0; ; ++offset) {
            var tok = this.peek(offset);
            if (tok.type === 'eof')
                return false;
            if (tok.type === 'op' && tok.value === '(')
                ++depth;
            else if (tok.type === 'op' && tok.value === ')' && --depth === 0)
                return this.is('->', offset + 1);
        }
    };

    P.lambda = function () {
        var tok = this.peek();
        var params = [];
        if (tok.type === 'ident') {
            params.push(this.node('param', tok, { type: null, name: this.identifier() }));
        } else {
            this.expect('(');
            while (!this.is(')')) {
                var paramTok = this.peek();
                this.modifiers();
                if (this.peek().type === 'ident' && (this.is(',', 1) || this.is(')', 1))) {
                    params.push(this.node('param', paramTok, { type: null, name: this.identifier() }));
                } else {
                    var type = this.type();
                    var name = this.identifier();
                    type = this.dims(type);
                    var implicit = type.k === 'ctype' && type.parts.length === 1 && type.parts[0].name === 'var';
                    params.push(this.node('param', paramTok, { type: implicit ? null : type, name: name }));
                }
                if (!this.accept(','))
                    break;
            }
            this.expect(')');
        }
        this.expect('->');
        var body = this.is('{') ? this.block() : this.expression();
        return this.node('lambda', tok, { params: params, body: body });
    };

    P.expression = function () {
        if (this.startsLambda())
            return this.lambda();
        var left = this.ternary();
        var op = this.operator();
        if (op !== null && ASSIGN[op.text] === 1) {
            var tok = this.peek();
            this.takeOperator(op);
            var right = this.expression();
            return this.node('assign', tok, { op: op.text, target: left, rhs: right });
        }
        return left;
    };

    P.ternary = function () {
        var condition = this.binary(1);
        if (!this.is('?'))
            return condition;
        var tok = this.next();
        var then = this.expression();
        this.expect(':');
        var otherwise = this.startsLambda() ? this.lambda() : this.ternary();
        return this.node('cond', tok, { cond: condition, then: then, otherwise: otherwise });
    };
    P.binary = function (minimum) {
        var left = this.unary();
        for (;;) {
            var op = this.operator();
            if (op === null)
                return left;
            var precedence = PRECEDENCE[op.text];
            if (precedence === undefined || precedence < minimum)
                return left;
            var tok = this.peek();
            this.takeOperator(op);
            if (op.text === 'instanceof') {
                var isFinal = !!this.accept('final');
                var patternTok = this.peek();
                var type = this.type();
                if (!isFinal && this.is('(')) {
                    left = this.node('instanceof', tok, { expr: left, type: type, binding: null,
                                                          pattern: this.recordPatternRest(type, patternTok) });
                    continue;
                }
                var binding = null;
                if (this.peek().type === 'ident')
                    binding = this.identifier();
                if (isFinal && binding === null)
                    this.fail('<identifier> expected');
                left = this.node('instanceof', tok, { expr: left, type: type, binding: binding });
                continue;
            }
            var right = this.binary(precedence + 1);
            left = this.node('binary', tok, { op: op.text, left: left, right: right });
        }
    };

    P.unary = function () {
        var tok = this.peek();
        if (tok.type === 'op') {
            switch (tok.value) {
            case '++':
            case '--':
                this.next();
                return this.node('prefix', tok, { op: tok.value, arg: this.unary() });
            case '+':
            case '-': {
                this.next();
                var next = this.peek();
                // -2147483648 and -9223372036854775808L are literals.
                if (tok.value === '-' && next.type === 'int' && next.line === tok.line &&
                    next.column === tok.column + 1 && !this.is('.', 1) && !this.is('[', 1)) {
                    this.next();
                    return this.node('literal', tok, { kind: 'int', text: '-' + next.value });
                }
                return this.node('unary', tok, { op: tok.value, arg: this.unary() });
            }
            case '!':
            case '~':
                this.next();
                return this.node('unary', tok, { op: tok.value, arg: this.unary() });
            case '(': {
                var cast = this.castExpression();
                if (cast !== null)
                    return cast;
                break;
            }
            }
        }
        return this.postfix(this.primary());
    };
    // (Type) expression. A reference type only before something that
    // cannot continue an expression in parentheses (as in the Java grammar).
    P.castExpression = function () {
        var tok = this.peek();
        if (this.startsLambda())
            return null;
        var start = this.index;
        var outerSplits = this.splitTokens;
        this.splitTokens = [];
        var types = null;
        try {
            this.expect('(');
            types = [this.type()];
            while (this.accept('&'))
                types.push(this.type());
            this.expect(')');
        } catch (error) {
            if (!(error instanceof T.CompileError))
                throw error;
            types = null;
        }
        if (types === null) {
            this.restoreSplits();
            this.splitTokens = outerSplits;
            this.index = start;
            return null;
        }
        var primitive = types.length === 1 && types[0].k === 'prim';
        var next = this.peek();
        var canFollow;
        if (primitive) {
            canFollow = !(next.type === 'op' && /^(\)|\]|\}|;|,|\.|\?|:|=|==|!=|<|>|<=|>=|&&|\|\||\*|\/|%|&|\||\^)$/.test(next.value));
        } else {
            canFollow = next.type === 'ident' || next.type === 'int' || next.type === 'float' || next.type === 'char' ||
                next.type === 'string' ||
                (next.type === 'keyword' && /^(this|super|new|true|false|null|switch|boolean|byte|short|char|int|long|float|double)$/.test(next.value)) ||
                (next.type === 'op' && (next.value === '(' || next.value === '!' || next.value === '~'));
        }
        if (!canFollow) {
            this.restoreSplits();
            this.splitTokens = outerSplits;
            this.index = start;
            return null;
        }
        if (outerSplits)
            Array.prototype.push.apply(outerSplits, this.splitTokens);
        this.splitTokens = outerSplits;
        var operand = this.startsLambda() ? this.lambda() : this.unary();
        return this.node('cast', tok, { types: types, expr: operand });
    };
    P.arguments = function () {
        this.expect('(');
        var args = [];
        if (!this.is(')')) {
            do
                args.push(this.expression());
            while (this.accept(','));
        }
        this.expect(')');
        return args;
    };

    P.literal = function (tok) {
        this.next();
        switch (tok.type) {
        case 'int':
        case 'float':
            return this.node('literal', tok, { kind: tok.type, text: tok.value });
        case 'char':
            return this.node('literal', tok, { kind: 'char', value: tok.value });
        case 'string':
            return this.node('literal', tok, { kind: 'string', value: tok.value });
        }
        if (tok.value === 'null')
            return this.node('literal', tok, { kind: 'null' });
        return this.node('literal', tok, { kind: 'boolean', value: tok.value === 'true' });
    };
    P.primary = function () {
        var tok = this.peek();
        switch (tok.type) {
        case 'int':
        case 'float':
        case 'char':
        case 'string':
            return this.literal(tok);
        case 'ident':
            return this.namePrimary(tok);
        case 'keyword':
            switch (tok.value) {
            case 'true':
            case 'false':
            case 'null':
                return this.literal(tok);
            case 'this':
                this.next();
                if (this.is('('))
                    return this.node('ctorcall', tok, { kind: 'this', args: this.arguments(), outer: null });
                return this.node('this', tok, { qualifier: null });
            case 'super':
                this.next();
                if (this.is('('))
                    return this.node('ctorcall', tok, { kind: 'super', args: this.arguments(), outer: null });
                return this.node('super', tok, { qualifier: null });
            case 'new':
                return this.creator(null);
            case 'switch': {
                var node = this.switchNode();
                node.k = 'switchexpr';
                return node;
            }
            case 'void':
                this.next();
                this.expect('.');
                this.expect('class');
                return this.node('classlit', tok, { type: this.node('void', tok, {}) });
            }
            if (Java.PRIMITIVES[tok.value] === 1) {
                // int.class, int[].class, int[]::new
                var type = this.type();
                if (this.accept('::')) {
                    this.expect('new');
                    return this.node('methodref', tok, { target: null, type: type, name: 'new', typeArgs: null });
                }
                this.expect('.');
                this.expect('class');
                return this.node('classlit', tok, { type: type });
            }
            break;
        case 'op':
            if (tok.value === '(') {
                this.next();
                var inner = this.expression();
                this.expect(')');
                return this.node('parens', tok, { expr: inner });
            }
            break;
        }
        this.fail('illegal start of expression');
    };
    // A name: a call f(...), a type in a method reference
    // (List<String>::new, String[]::new) or a class literal
    // (String[].class), otherwise a name.
    P.namePrimary = function (tok) {
        if (this.is('(', 1)) {
            this.next();
            return this.node('call', tok, { target: null, name: tok.value, typeArgs: null, args: this.arguments() });
        }
        if (this.is('<', 1) || (this.is('[', 1) && this.is(']', 2))) {
            var typed = this.attempt(function () {
                var type = this.type();
                if (this.accept('::')) {
                    var name = this.is('new') ? (this.next(), 'new') : this.identifier();
                    return this.node('methodref', tok, { target: null, type: type, name: name, typeArgs: null });
                }
                if (type.k === 'array' && this.is('.') && this.is('class', 1)) {
                    this.next();
                    this.next();
                    return this.node('classlit', tok, { type: type });
                }
                this.fail('not a type');
            });
            if (typed !== null)
                return typed;
        }
        this.next();
        return this.node('name', tok, { name: tok.value });
    };

    // new Type(...) {body}, new Type[n][], new Type[]{...}; outer - for
    // outer.new Inner().
    P.creator = function (outer) {
        var tok = this.expect('new');
        var typeArgs = this.is('<') ? this.typeArguments() : null;
        var base;
        var baseTok = this.peek();
        if (baseTok.type === 'keyword' && Java.PRIMITIVES[baseTok.value] === 1) {
            this.next();
            base = this.node('prim', baseTok, { name: baseTok.value });
        } else {
            base = this.classType();
        }
        if (this.is('[')) {
            var dims = [];
            var extra = 0;
            while (this.is('[')) {
                this.next();
                if (this.accept(']')) {
                    ++extra;
                    continue;
                }
                if (extra > 0)
                    this.fail("']' expected");
                dims.push(this.expression());
                this.expect(']');
            }
            var init = null;
            if (dims.length === 0) {
                if (!this.is('{'))
                    this.fail('array dimension missing');
                init = this.arrayInitializer();
            }
            return this.node('newarray', tok, { elem: base, dims: dims, extraDims: extra, init: init });
        }
        if (base.k === 'prim')
            this.fail("'[' expected");
        var args = this.arguments();
        var body = null;
        if (this.is('{')) {
            body = this.node('class', this.peek(), { kind: 'class', name: null, mods: {}, typeParams: [], superclass: null,
                                                     interfaces: [], members: [] });
            this.classBody(body);
        }
        return this.node('new', tok, { type: base, args: args, body: body, outer: outer, typeArgs: typeArgs });
    };
    P.postfix = function (expr) {
        for (;;) {
            var tok = this.peek();
            if (this.is('.')) {
                this.next();
                if (this.is('new')) {
                    expr = this.creator(expr);
                    continue;
                }
                if (this.is('this')) {
                    this.next();
                    expr = this.node('this', tok, { qualifier: expr });
                    continue;
                }
                if (this.is('class')) {
                    this.next();
                    expr = this.node('classlit', tok, { type: expr, fromName: true });
                    continue;
                }
                if (this.is('super')) {
                    this.next();
                    if (this.is('('))
                        expr = this.node('ctorcall', tok, { kind: 'super', args: this.arguments(), outer: expr });
                    else
                        expr = this.node('super', tok, { qualifier: expr });
                    continue;
                }
                var typeArgs = this.is('<') ? this.typeArguments() : null;
                var nameTok = this.peek();
                var name = this.identifier();
                if (this.is('(')) {
                    expr = this.node('call', nameTok, { target: expr, name: name, typeArgs: typeArgs, args: this.arguments() });
                } else {
                    if (typeArgs !== null)
                        this.fail("'(' expected");
                    expr = this.node('select', nameTok, { target: expr, name: name });
                }
                continue;
            }
            if (this.is('[')) {
                this.next();
                var index = this.expression();
                this.expect(']');
                expr = this.node('index', tok, { target: expr, index: index });
                continue;
            }
            if (this.is('::')) {
                this.next();
                var refArgs = this.is('<') ? this.typeArguments() : null;
                var refName = this.is('new') ? (this.next(), 'new') : this.identifier();
                expr = this.node('methodref', tok, { target: expr, type: null, name: refName, typeArgs: refArgs });
                continue;
            }
            if (this.is('++') || this.is('--')) {
                this.next();
                expr = this.node('postfix', tok, { op: tok.value, arg: expr });
                continue;
            }
            return expr;
        }
    };
})(globalThis);
