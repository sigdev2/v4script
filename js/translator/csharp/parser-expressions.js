// C#: parsing expressions, patterns and query expressions.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    var P = CS.Parser.prototype;
    if (P.expression)
        return;

    var PRECEDENCE = {
        '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5, '==': 6, '!=': 6, '<': 7, '>': 7, '<=': 7, '>=': 7,
        '<<': 8, '>>': 8, '>>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10
    };
    var RELATIONAL = 7;
    var ASSIGN = { '=': 1, '+=': 1, '-=': 1, '*=': 1, '/=': 1, '%=': 1, '&=': 1, '|=': 1, '^=': 1, '<<=': 1, '>>=': 1,
                   '>>>=': 1, '??=': 1 };
    // Tokens after (T) that make it a cast of what follows.
    var CAST_FOLLOWERS = { '~': 1, '!': 1, '(': 1 };
    var QUERY_WORDS = { where: 1, select: 1, group: 1, by: 1, orderby: 1, ascending: 1, descending: 1, let: 1, join: 1,
                        on: 1, equals: 1, into: 1, from: 1 };

    // The operator at the current position: ">" tokens side by side make
    // ">>", ">>>", ">=", ">>=", ">>>=".
    P.operator = function () {
        var first = this.peek();
        if (first.type === 'keyword' && (first.value === 'is' || first.value === 'as'))
            return { text: first.value, count: 1 };
        if (first.type !== 'op')
            return null;
        if (first.value !== '>')
            return { text: first.value, count: 1 };
        var text = '>', count = 1;
        while (this.adjacent(count - 1)) {
            var next = this.peek(count);
            if (next.type !== 'op')
                break;
            if (next.value === '>' && text.length < 3 && text.indexOf('=') < 0) {
                text += '>';
                ++count;
                continue;
            }
            if (next.value === '=' && text.indexOf('=') < 0) {
                text += '=';
                ++count;
                break;
            }
            if (next.value === '>=' && text.length < 3) {
                text += '>=';
                ++count;
                break;
            }
            break;
        }
        return { text: text, count: count };
    };

    P.takeOperator = function (op) {
        for (var index = 0; index < op.count; ++index)
            this.next();
    };

    P.expression = function () {
        var token = this.peek();
        if (this.startsLambda())
            return this.lambda();
        if (this.startsQuery())
            return this.query();
        if (this.is('throw')) {
            this.next();
            return this.node('throwExpr', token, { expr: this.expression() });
        }
        var left = this.conditional();
        var op = this.operator();
        if (op !== null && ASSIGN[op.text] === 1) {
            var opToken = this.peek();
            this.takeOperator(op);
            var value;
            if (op.text === '=' && this.is('ref')) {
                var refToken = this.next();
                value = this.node('refExpr', refToken, { expr: this.expression() });
            } else {
                value = this.expression();
            }
            return this.node('assign', opToken, { op: op.text, target: left, value: value });
        }
        return left;
    };

    P.conditional = function () {
        var cond = this.coalesce();
        if (!this.is('?'))
            return cond;
        var token = this.next();
        var isRef = false;
        if (this.is('ref')) {
            this.next();
            isRef = true;
        }
        var then = this.expression();
        if (!this.is(':'))
            this.error('CS1003', "Syntax error, ':' expected");
        this.next();
        if (isRef)
            this.expect('ref');
        var otherwise = this.expression();
        return this.node('cond', token, { cond: cond, then: then, otherwise: otherwise, isRef: isRef });
    };

    P.coalesce = function () {
        var left = this.binary(1);
        if (!this.is('??'))
            return left;
        var token = this.next();
        var right = this.is('throw') ? this.expression() : this.coalesce();
        return this.node('binary', token, { op: '??', left: left, right: right });
    };

    P.binary = function (minimum) {
        var left = this.rangeExpression();
        for (;;) {
            var op = this.operator();
            if (op === null)
                return left;
            var token = this.peek();
            if (op.text === 'is' || op.text === 'as') {
                if (RELATIONAL < minimum)
                    return left;
                this.next();
                if (op.text === 'as') {
                    left = this.node('as', token, { operand: left, type: this.typeInExpression() });
                } else {
                    left = this.node('is', token, { operand: left, pattern: this.pattern() });
                }
                continue;
            }
            var precedence = PRECEDENCE[op.text];
            if (precedence === undefined || precedence < minimum)
                return left;
            this.takeOperator(op);
            var right = this.binary(precedence + 1);
            left = this.node('binary', token, { op: op.text, left: left, right: right });
        }
    };

    P.unary = function () {
        var token = this.peek();
        if (token.type === 'op') {
            switch (token.value) {
            case '++':
            case '--':
                this.next();
                return this.node('preIncrement', token, { op: token.value, operand: this.unary() });
            case '+':
            case '-':
            case '!':
            case '~':
            case '^':
                this.next();
                return this.node('unary', token, { op: token.value, operand: this.unary() });
            case '&':
            case '*':
                this.error('CS0214', 'Pointers and fixed size buffers may only be used in an unsafe context');
                break;
            case '(': {
                var cast = this.castExpression();
                if (cast !== null)
                    return cast;
                break;
            }
            }
        }
        if (token.type === 'ident' && token.value === 'await' && !token.verbatim && this.inAsync &&
            this.startsExpression(1)) {
            this.next();
            return this.node('await', token, { expr: this.unary() });
        }
        return this.postfix(this.primary());
    };

    // x..y, ..y, x switch { ... }, x with { ... }: between unary and
    // multiplicative operators.
    P.rangeExpression = function () {
        var token = this.peek();
        if (this.is('..')) {
            this.next();
            var to = this.startsExpression() ? this.unary() : null;
            return this.node('range', token, { from: null, to: to });
        }
        var operand = this.unary();
        for (;;) {
            token = this.peek();
            var token = this.peek();
            if (this.is('switch')) {
                operand = this.switchExpression(operand);
                continue;
            }
            if (this.isWord('with') && this.is('{', 1)) {
                this.next();
                operand = this.node('with', token, { operand: operand, init: this.objectOrCollectionInitializer() });
                continue;
            }
            if (this.is('..')) {
                this.next();
                var end = this.startsExpression() ? this.unary() : null;
                return this.node('range', token, { from: operand, to: end });
            }
            return operand;
        }
    };

    // Whether a token can start an expression (for await x, ..x, ^x).
    P.startsExpression = function (offset) {
        var token = this.peek(offset || 0);
        switch (token.type) {
        case 'ident':
        case 'int':
        case 'real':
        case 'char':
        case 'string':
        case 'interp':
            return true;
        case 'keyword':
            return token.value !== 'is' && token.value !== 'as' && token.value !== 'in' && token.value !== 'out' &&
                token.value !== 'else' && token.value !== 'case';
        case 'op':
            return token.value === '(' || token.value === '-' || token.value === '+' || token.value === '!' ||
                token.value === '~' || token.value === '++' || token.value === '--' || token.value === '^' ||
                token.value === '[' || token.value === '&' || token.value === '*';
        }
        return false;
    };

    // (Type) expression - by the rule of the C# grammar: a cast if the type
    // is a keyword type, or the token after ")" is ~ ! ( an identifier, a
    // literal or a keyword except as and is.
    P.castExpression = function () {
        var token = this.peek();
        if (this.startsLambda())
            return null;
        var self = this;
        var type = this.attempt(function () {
            self.next();
            var parsed = self.typeInExpression();
            if (!self.is(')'))
                return null;
            self.next();
            return parsed;
        });
        if (type === null)
            return null;
        var after = this.peek();
        var base = type;
        while (base.k === 'nullable' || base.k === 'array')
            base = base.elem;
        var keywordType = base.k === 'predef';
        var follows = false;
        switch (after.type) {
        case 'ident':
            follows = !(QUERY_WORDS[after.value] === 1 && this.inQuery > 0 && after.value !== 'from') &&
                !(after.value === 'switch') && !(after.value === 'with' && this.is('{', 1)) &&
                !(after.value === 'and' || after.value === 'or' || after.value === 'when');
            break;
        case 'int':
        case 'real':
        case 'char':
        case 'string':
        case 'interp':
            follows = true;
            break;
        case 'keyword':
            follows = after.value !== 'as' && after.value !== 'is' && after.value !== 'switch';
            break;
        case 'op':
            follows = CAST_FOLLOWERS[after.value] === 1;
            break;
        }
        if (keywordType && after.type === 'op' && (after.value === '-' || after.value === '+' || after.value === '++' ||
                                                   after.value === '--' || after.value === '^' || after.value === '['))
            follows = true;
        if (!follows) {
            // A parenthesized expression: parse again.
            this.rewindTo(token);
            return null;
        }
        return this.node('cast', token, { type: type, operand: this.unary() });
    };

    // Back to a token already read.
    P.rewindTo = function (token) {
        while (this.index > 0 && this.peek() !== token)
            --this.index;
    };

    // --- Lambdas

    // x =>, async x =>, (..) =>, async (..) =>, static ..., T (..) =>.
    P.startsLambda = function () {
        var offset = 0;
        while (this.isWord('async', offset) || this.is('static', offset)) {
            if (this.is('=>', offset + 1))
                return true;
            ++offset;
        }
        var token = this.peek(offset);
        if (token.type === 'ident' && this.is('=>', offset + 1))
            return true;
        if (this.is('(', offset))
            return this.parenthesesThenArrow(offset);
        // An explicit return type: int (x) => ..., List<int> () => ...
        if (token.type === 'ident' || (token.type === 'keyword' && CS.PREDEFINED[token.value] === 1)) {
            var self = this;
            return this.lookahead(function () {
                for (var index = 0; index < offset; ++index)
                    self.next();
                self.returnType();
                return self.is('(') && self.parenthesesThenArrow(0);
            });
        }
        return false;
    };

    P.parenthesesThenArrow = function (offset) {
        var depth = 0;
        for (var at = offset; ; ++at) {
            var token = this.peek(at);
            if (token.type === 'eof')
                return false;
            if (token.type === 'op' && (token.value === '(' || token.value === '[' || token.value === '{'))
                ++depth;
            else if (token.type === 'op' && (token.value === ')' || token.value === ']' || token.value === '}')) {
                if (--depth === 0)
                    return token.value === ')' && this.is('=>', at + 1);
            } else if (token.type === 'op' && token.value === ';') {
                return false;
            }
        }
    };

    P.lambda = function () {
        var token = this.peek();
        var isAsync = false, isStatic = false;
        for (;;) {
            if (this.isWord('async') && !this.is('=>', 1)) {
                this.next();
                isAsync = true;
                continue;
            }
            if (this.is('static')) {
                this.next();
                isStatic = true;
                continue;
            }
            break;
        }
        var returnType = null;
        if (!this.is('(') && !(this.peek().type === 'ident' && this.is('=>', 1)))
            returnType = this.returnType();
        var params = [];
        var paramToken = this.peek();
        if (paramToken.type === 'ident' && this.is('=>', 1)) {
            params.push(this.node('param', paramToken, { name: this.identifier(), type: null, refKind: '' }));
        } else {
            this.expect('(');
            while (!this.is(')')) {
                this.attributes();
                var itemToken = this.peek();
                var refKind = '';
                if (this.is('ref') || this.is('out') || this.is('in'))
                    refKind = this.next().value;
                if (this.isWord('scoped') && this.peek(1).type !== 'op')
                    this.next();
                if (this.peek().type === 'ident' && (this.is(',', 1) || this.is(')', 1))) {
                    params.push(this.node('param', itemToken, { name: this.identifier(), type: null, refKind: refKind }));
                } else {
                    var type = this.type();
                    var name = this.identifier();
                    var defaultValue = this.accept('=') ? this.expression() : null;
                    params.push(this.node('param', itemToken, { name: name, type: type, refKind: refKind,
                                                                defaultValue: defaultValue }));
                }
                if (!this.accept(','))
                    break;
            }
            this.expect(')');
        }
        var arrow = this.expect('=>');
        var savedAsync = this.inAsync;
        this.inAsync = isAsync;
        var body;
        try {
            if (this.is('{')) {
                body = this.block();
            } else if (this.is('ref')) {
                var refToken = this.next();
                body = this.node('refExpr', refToken, { expr: this.expression() });
            } else {
                body = this.expression();
            }
        } finally {
            this.inAsync = savedAsync;
        }
        return this.node('lambda', token, { params: params, body: body, isAsync: isAsync, isStatic: isStatic,
                                            returnType: returnType, arrowLine: arrow.line });
    };

    // delegate (int x) { ... } - an anonymous method.
    P.anonymousMethod = function (isAsync) {
        var token = this.expect('delegate');
        var params = null;
        if (this.is('('))
            params = this.parameterList();
        var savedAsync = this.inAsync;
        this.inAsync = isAsync;
        var body = this.block();
        this.inAsync = savedAsync;
        return this.node('lambda', token, { params: params || [], body: body, isAsync: isAsync, isStatic: false,
                                            returnType: null, anonymous: true, noParams: params === null });
    };

    // --- Primary expressions

    P.primary = function () {
        var token = this.peek();
        switch (token.type) {
        case 'int':
        case 'real':
        case 'char':
        case 'string':
            this.next();
            return this.node('literal', token, { kind: token.type, value: token.value });
        case 'interp':
            this.next();
            return this.interpolation(token);
        case 'ident':
            return this.namePrimary(token);
        case 'keyword':
            return this.keywordPrimary(token);
        case 'op':
            if (token.value === '(')
                return this.parenthesized();
            if (token.value === '[')
                return this.collectionExpression();
            break;
        case 'eof':
            this.error('CS1733', 'Expected expression');
        }
        this.error('CS1525', "Invalid expression term '" + token.text + "'");
    };

    // A simple name with optional type arguments; F<int>(x) when what
    // follows the ">" makes it a generic name.
    P.namePrimary = function (token) {
        if (!token.verbatim && token.value === 'async' && this.is('delegate', 1)) {
            this.next();
            return this.anonymousMethod(true);
        }
        if (!token.verbatim && token.value === 'nameof' && this.is('(', 1)) {
            this.next();
            this.next();
            var target = this.expression();
            this.expect(')');
            return this.node('nameof', token, { expr: target });
        }
        if (this.is('::', 1)) {
            var alias = this.identifier();
            this.next();
            var nameToken = this.peek();
            var aliased = this.identifier();
            return this.node('aliasName', token, { alias: alias, name: aliased, args: this.genericArgumentsIfAny(),
                                                   nameLine: nameToken.line });
        }
        this.next();
        return this.node('name', token, { name: token.value, args: this.genericArgumentsIfAny() });
    };

    // Type arguments after a name in an expression, if the token after ">"
    // allows it (the disambiguation rule of the C# grammar).
    P.genericArgumentsIfAny = function () {
        if (!this.is('<'))
            return null;
        var self = this;
        var args = this.attempt(function () {
            var parsed = self.typeArgumentList();
            var next = self.peek();
            if (next.type === 'op') {
                var ok = { '(': 1, ')': 1, ']': 1, '}': 1, ':': 1, ';': 1, ',': 1, '.': 1, '?': 1, '==': 1, '!=': 1, '|': 1,
                           '^': 1, '&&': 1, '||': 1, '&': 1, '[': 1, '?.': 1, '=>': 1, '>': 1, '=': 1, '??': 1 };
                if (ok[next.value] === 1)
                    return parsed;
                return null;
            }
            if (next.type === 'eof')
                return parsed;
            if (next.type === 'keyword' && (next.value === 'is' || next.value === 'as'))
                return parsed;
            // x is List<int> list: a designation after the type.
            if (next.type === 'ident' && self.typeContextExpression)
                return parsed;
            if (next.type === 'ident' && QUERY_WORDS[next.value] === 1 && self.inQuery > 0)
                return parsed;
            return null;
        });
        return args;
    };

    P.keywordPrimary = function (token) {
        switch (token.value) {
        case 'true':
        case 'false':
            this.next();
            return this.node('literal', token, { kind: 'bool', value: token.value === 'true' });
        case 'null':
            this.next();
            return this.node('literal', token, { kind: 'null', value: null });
        case 'this':
            this.next();
            return this.node('this', token, {});
        case 'base':
            this.next();
            return this.node('base', token, {});
        case 'new':
            return this.newExpression();
        case 'typeof': {
            this.next();
            this.expect('(');
            var type = this.returnType();
            this.expect(')');
            return this.node('typeof', token, { type: type });
        }
        case 'sizeof': {
            this.next();
            this.expect('(');
            var sized = this.type();
            this.expect(')');
            return this.node('sizeof', token, { type: sized });
        }
        case 'default':
            this.next();
            if (this.accept('(')) {
                var defaultType = this.type();
                this.expect(')');
                return this.node('default', token, { type: defaultType });
            }
            return this.node('default', token, { type: null });
        case 'checked':
        case 'unchecked': {
            this.next();
            this.expect('(');
            var inner = this.expression();
            this.expect(')');
            return this.node('checkedExpr', token, { checked: token.value === 'checked', expr: inner });
        }
        case 'delegate':
            return this.anonymousMethod(false);
        case 'stackalloc':
            this.error('CS0214', 'Pointers and fixed size buffers may only be used in an unsafe context');
            break;
        case 'ref':
            this.next();
            return this.node('refExpr', token, { expr: this.unary() });
        case 'out':
        case 'in':
            break;
        case 'throw':
            this.next();
            return this.node('throwExpr', token, { expr: this.expression() });
        }
        if (CS.PREDEFINED[token.value] === 1) {
            // int.MaxValue, string.Join: a predefined type as an expression.
            this.next();
            if (token.value === 'void')
                this.error('CS1525', "Invalid expression term 'void'");
            return this.node('predef', token, { name: token.value });
        }
        this.error('CS1525', "Invalid expression term '" + token.value + "'");
    };

    // ( ... ): a parenthesized expression or a tuple (with declarations:
    // (int a, var b) = ...).
    P.parenthesized = function () {
        var token = this.expect('(');
        var items = [];
        for (;;) {
            var itemToken = this.peek();
            var name = null;
            if (this.peek().type === 'ident' && this.is(':', 1) && !this.is('::', 1)) {
                name = this.identifier();
                this.next();
            }
            var expr = this.tupleElement();
            items.push(this.node('targ', itemToken, { name: name, expr: expr }));
            if (!this.accept(','))
                break;
        }
        this.expect(')');
        if (items.length === 1 && items[0].name === null) {
            if (items[0].expr.k === 'declExpr')
                this.error('CS1525', "Invalid expression term '" + items[0].expr.typeName + "'");
            return this.node('paren', token, { expr: items[0].expr });
        }
        return this.node('tuple', token, { items: items });
    };

    // An element of a tuple: an expression or a declaration (int a, var b, var (c, d)).
    P.tupleElement = function () {
        var token = this.peek();
        if (this.isWord('var') && (this.peek(1).type === 'ident' || this.is('(', 1))) {
            var declared = this.attempt(function () {
                this.next();
                var designation = this.designation();
                if (!this.is(',') && !this.is(')'))
                    return null;
                return this.node('declExpr', token, { type: null, designation: designation, typeName: 'var' });
            });
            if (declared !== null)
                return declared;
        }
        // (await t) in an async function is an await, not a declaration.
        var awaits = this.inAsync && this.isWord('await') && !token.verbatim;
        var typed = awaits ? null : this.attempt(function () {
            var type = this.type();
            if (this.peek().type !== 'ident' || !(this.is(',', 1) || this.is(')', 1)))
                return null;
            var typeName = this.tokens[this.index - 1].text;
            return this.node('declExpr', token, { type: type, designation: this.designation(), typeName: typeName });
        });
        if (typed !== null)
            return typed;
        return this.expression();
    };

    // [1, 2, ..rest]: a collection expression.
    P.collectionExpression = function () {
        var token = this.expect('[');
        var items = [];
        while (!this.is(']')) {
            var itemToken = this.peek();
            if (this.is('..')) {
                this.next();
                items.push(this.node('spread', itemToken, { expr: this.expression() }));
            } else {
                items.push(this.expression());
            }
            if (!this.accept(','))
                break;
        }
        this.expect(']');
        return this.node('collection', token, { items: items });
    };

    // --- Postfix: member access, calls, indexing, ++, --, !

    P.postfix = function (expr) {
        for (;;) {
            var token = this.peek();
            if (token.type !== 'op')
                return expr;
            switch (token.value) {
            case '.': {
                this.next();
                var nameToken = this.peek();
                var name = this.identifier();
                expr = this.node('member', token, { target: expr, name: name, args: this.genericArgumentsIfAny(),
                                                    nameLine: nameToken.line });
                continue;
            }
            case '?.':
            case '?': {
                if (token.value === '?' && !(this.is('[', 1) && this.adjacent(0)))
                    return expr;
                expr = this.conditionalAccess(expr);
                continue;
            }
            case '(':
                expr = this.node('call', token, { target: expr, args: this.argumentList('(', ')') });
                continue;
            case '[':
                expr = this.node('index', token, { target: expr, args: this.argumentList('[', ']') });
                continue;
            case '++':
            case '--':
                this.next();
                expr = this.node('postIncrement', token, { op: token.value, operand: expr });
                continue;
            case '!':
                // x! - the null-forgiving operator.
                if (this.is('=', 1) && this.adjacent(0))
                    return expr;
                this.next();
                continue;
            case '->':
                this.error('CS0214', 'Pointers and fixed size buffers may only be used in an unsafe context');
                break;
            }
            return expr;
        }
    };

    // a?.b.c[0] - the chain after ?. works on the value of a (binding).
    P.conditionalAccess = function (target) {
        var token = this.next();
        var binding = this.node('binding', token, {});
        var access;
        if (token.value === '?.') {
            var nameToken = this.peek();
            var name = this.identifier();
            access = this.node('member', token, { target: binding, name: name, args: this.genericArgumentsIfAny(),
                                                  nameLine: nameToken.line });
        } else {
            access = this.node('index', token, { target: binding, args: this.argumentList('[', ']') });
        }
        // The rest of the chain belongs to the access (a?.b.c is null if a is null).
        for (;;) {
            var next = this.peek();
            if (next.type !== 'op')
                break;
            if (next.value === '.') {
                this.next();
                var memberToken = this.peek();
                var member = this.identifier();
                access = this.node('member', next, { target: access, name: member, args: this.genericArgumentsIfAny(),
                                                     nameLine: memberToken.line });
                continue;
            }
            if (next.value === '(') {
                access = this.node('call', next, { target: access, args: this.argumentList('(', ')') });
                continue;
            }
            if (next.value === '[') {
                access = this.node('index', next, { target: access, args: this.argumentList('[', ']') });
                continue;
            }
            if (next.value === '?.' || (next.value === '?' && this.is('[', 1) && this.adjacent(0))) {
                access = this.conditionalAccess(access);
                continue;
            }
            if (next.value === '!' && !(this.is('=', 1) && this.adjacent(0))) {
                this.next();
                continue;
            }
            break;
        }
        return this.node('condAccess', token, { target: target, access: access });
    };

    // Arguments: (a, name: b, ref c, out var d, out int e, out _).
    P.argumentList = function (open, close) {
        this.expect(open);
        var args = [];
        if (this.accept(close))
            return args;
        for (;;) {
            var token = this.peek();
            var name = null;
            if (token.type === 'ident' && this.is(':', 1)) {
                name = this.identifier();
                this.next();
            }
            var refKind = '';
            if (this.is('ref') || this.is('out') || this.is('in')) {
                refKind = this.next().value;
                if (refKind === 'ref' && this.is('readonly'))
                    this.next();
            }
            var expr;
            if (refKind === 'out')
                expr = this.outArgument();
            else
                expr = this.expression();
            args.push(this.node('arg', token, { name: name, refKind: refKind, expr: expr }));
            if (!this.accept(','))
                break;
        }
        if (!this.is(close))
            this.expected(close === ')' ? ')' : (close === ']' ? ']' : close));
        this.next();
        return args;
    };

    // out var x, out int x, out _, out existing.
    P.outArgument = function () {
        var token = this.peek();
        if (this.isWord('_') && (this.is(',', 1) || this.is(')', 1))) {
            this.next();
            return this.node('declExpr', token, { type: null, designation: this.node('discard', token, {}), typeName: 'var' });
        }
        if (this.isWord('var') && (this.peek(1).type === 'ident' || this.is('(', 1))) {
            this.next();
            return this.node('declExpr', token, { type: null, designation: this.designation(), typeName: 'var' });
        }
        // (await t) in an async function is an await, not a declaration.
        var awaits = this.inAsync && this.isWord('await') && !token.verbatim;
        var typed = awaits ? null : this.attempt(function () {
            var type = this.type();
            if (this.peek().type !== 'ident' || !(this.is(',', 1) || this.is(')', 1)))
                return null;
            return this.node('declExpr', token, { type: type, designation: this.designation(), typeName: '' });
        });
        if (typed !== null)
            return typed;
        return this.expression();
    };

    // --- new

    P.newExpression = function () {
        var token = this.expect('new');
        // new[] { 1, 2 }: an implicitly typed array.
        if (this.is('[')) {
            this.next();
            var rank = 1;
            while (this.accept(','))
                ++rank;
            this.expect(']');
            if (!this.is('{'))
                this.error('CS1514', '{ expected');
            return this.node('newImplicitArray', token, { rank: rank, init: this.arrayInitializer() });
        }
        // new { A = 1, b }: an anonymous type.
        if (this.is('{'))
            return this.anonymousObject(token);
        var typeToken = this.peek();
        var type = null;
        // new(...): target-typed; new (int, string)[n]: an array of tuples.
        if (this.is('(')) {
            type = this.attempt(function () {
                var tuple = this.nonArrayType();
                return this.is('[') ? tuple : null;
            });
            if (type === null) {
                var targetArgs = this.argumentList('(', ')');
                var targetInit = this.is('{') ? this.objectOrCollectionInitializer() : null;
                return this.node('new', token, { type: null, args: targetArgs, init: targetInit });
            }
        }
        if (type === null)
            type = this.nonArrayType();
        if (this.is('?')) {
            this.next();
            type = this.node('nullable', typeToken, { elem: type });
        }
        if (this.is('[')) {
            // new int[n, m][] { ... } or new int[] { ... }
            if (!this.is(']', 1) && !this.is(',', 1)) {
                var sizes = this.argumentList('[', ']').map(function (arg) { return arg.expr; });
                var ranks = this.rankSpecifiers();
                var init = this.is('{') ? this.arrayInitializer() : null;
                return this.node('newArray', token, { elemType: this.arrayOf(type, ranks, typeToken), sizes: sizes, init: init });
            }
            var allRanks = this.rankSpecifiers();
            var arrayType = this.arrayOf(type, allRanks, typeToken);
            if (!this.is('{'))
                this.error('CS1586', 'Array creation must have array size or array initializer');
            return this.node('newArray', token, { elemType: arrayType.elem, rank: arrayType.rank, sizes: null,
                                                  init: this.arrayInitializer(), type: arrayType });
        }
        var args = null;
        if (this.is('('))
            args = this.argumentList('(', ')');
        var objectInit = null;
        if (this.is('{'))
            objectInit = this.objectOrCollectionInitializer();
        if (args === null && objectInit === null)
            this.error('CS1526', 'A new expression requires an argument list or (), [], or {} after type');
        return this.node('new', token, { type: type, args: args || [], init: objectInit });
    };

    P.anonymousObject = function (token) {
        this.expect('{');
        var members = [];
        while (!this.is('}')) {
            var memberToken = this.peek();
            var name = null;
            if (this.peek().type === 'ident' && this.is('=', 1)) {
                name = this.identifier();
                this.next();
            }
            members.push(this.node('anonMember', memberToken, { name: name, expr: this.expression() }));
            if (!this.accept(','))
                break;
        }
        this.expect('}');
        return this.node('newAnonymous', token, { members: members });
    };

    // { X = 1, Y = { ... }, [0] = 2 } or { 1, 2, { "a", 3 } }.
    P.objectOrCollectionInitializer = function () {
        var token = this.expect('{');
        if (this.is('}')) {
            this.next();
            return this.node('objectInit', token, { members: [] });
        }
        var isObject = (this.peek().type === 'ident' && this.is('=', 1)) || this.is('[');
        if (this.is('[')) {
            // [i] = x - an indexer initializer, unless it is a collection expression element.
            isObject = this.lookahead(function () {
                this.skipBalanced('[', ']');
                return this.is('=');
            });
        }
        if (isObject) {
            var members = [];
            while (!this.is('}')) {
                var memberToken = this.peek();
                var name = null, indexArgs = null;
                if (this.is('[')) {
                    indexArgs = this.argumentList('[', ']');
                } else {
                    name = this.identifier();
                }
                this.expect('=');
                var value = this.is('{') ? this.objectOrCollectionInitializer() : this.expression();
                members.push(this.node('memberInit', memberToken, { name: name, indexArgs: indexArgs, value: value }));
                if (!this.accept(','))
                    break;
            }
            this.expect('}');
            return this.node('objectInit', token, { members: members });
        }
        var items = [];
        while (!this.is('}')) {
            var itemToken = this.peek();
            if (this.is('{')) {
                this.next();
                var parts = [];
                while (!this.is('}')) {
                    parts.push(this.expression());
                    if (!this.accept(','))
                        break;
                }
                this.expect('}');
                items.push(this.node('complexInit', itemToken, { items: parts }));
            } else {
                items.push(this.expression());
            }
            if (!this.accept(','))
                break;
        }
        this.expect('}');
        return this.node('collectionInit', token, { items: items });
    };

    // --- Interpolated strings

    P.interpolation = function (token) {
        var self = this;
        var parts = token.value.map(function (part) {
            if (typeof part === 'string')
                return part;
            var sub = new CS.Parser(part.tokens, self.source);
            sub.inAsync = self.inAsync;
            var expr = sub.expression();
            if (sub.peek().type !== 'eof')
                sub.error('CS1525', "Invalid expression term '" + sub.peek().text + "'");
            var alignment = null;
            if (part.alignment !== null) {
                var alignmentParser = new CS.Parser(part.alignment, self.source);
                alignment = alignmentParser.expression();
                if (alignmentParser.peek().type !== 'eof')
                    alignmentParser.error('CS1525', "Invalid expression term '" + alignmentParser.peek().text + "'");
            }
            return { expr: expr, alignment: alignment, format: part.format, line: part.line, column: part.column };
        });
        return this.node('interp', token, { parts: parts });
    };

    // --- switch expressions

    P.switchExpression = function (operand) {
        var token = this.expect('switch');
        this.expect('{');
        var arms = [];
        while (!this.is('}')) {
            var armToken = this.peek();
            var pattern = this.pattern();
            var when = null;
            if (this.isWord('when')) {
                this.next();
                when = this.expression();
            }
            this.expect('=>');
            var expr = this.expression();
            arms.push(this.node('arm', armToken, { pattern: pattern, when: when, expr: expr }));
            if (!this.accept(','))
                break;
        }
        this.expect('}');
        return this.node('switchExpr', token, { operand: operand, arms: arms });
    };

    // --- Patterns

    P.pattern = function () {
        var left = this.conjunctivePattern();
        while (this.isWord('or')) {
            var token = this.next();
            left = this.node('por', token, { left: left, right: this.conjunctivePattern() });
        }
        return left;
    };

    P.conjunctivePattern = function () {
        var left = this.negatedPattern();
        while (this.isWord('and')) {
            var token = this.next();
            left = this.node('pand', token, { left: left, right: this.negatedPattern() });
        }
        return left;
    };

    P.negatedPattern = function () {
        if (this.isWord('not')) {
            var token = this.next();
            return this.node('pnot', token, { pattern: this.negatedPattern() });
        }
        return this.primaryPattern();
    };

    P.primaryPattern = function () {
        var token = this.peek();
        if (token.type === 'op') {
            switch (token.value) {
            case '<':
            case '<=':
            case '>': {
                var op = this.operator();
                if (op.text === '<' || op.text === '<=' || op.text === '>' || op.text === '>=') {
                    this.takeOperator(op);
                    return this.node('prel', token, { op: op.text, expr: this.binary(PRECEDENCE['<<']) });
                }
                break;
            }
            case '(':
                return this.parenthesizedPattern();
            case '[':
                return this.listPattern(token);
            case '{':
                return this.recursivePatternRest(token, null);
            case '..': {
                this.next();
                var sliced = this.startsPattern() ? this.pattern() : null;
                return this.node('pslice', token, { pattern: sliced });
            }
            }
        }
        if (this.isWord('var')) {
            this.next();
            return this.node('pvar', token, { designation: this.designation() });
        }
        if (this.isWord('_') && !this.is('.', 1) && !this.is('(', 1)) {
            this.next();
            return this.node('pdiscard', token, {});
        }
        // A type followed by a designation, ( or {: a declaration or
        // recursive pattern.
        var self = this;
        var typed = this.attempt(function () {
            var type = self.typeInExpression();
            var next = self.peek();
            if (next.type === 'ident' && !(next.value === 'and' || next.value === 'or' || next.value === 'when') &&
                !(QUERY_WORDS[next.value] === 1 && self.inQuery > 0)) {
                var designation = self.designation();
                return self.node('pdecl', token, { type: type, designation: designation });
            }
            if (next.type === 'op' && (next.value === '(' || next.value === '{'))
                return self.recursivePatternRest(token, type);
            // A predefined type alone is a type pattern; a name may be a constant.
            if (type.k === 'predef' || type.k === 'array' || type.k === 'nullable' || type.k === 'tuple' ||
                (type.k === 'tname' && type.args !== null) || (type.k === 'qname' && type.right.args !== null))
                return self.node('ptype', token, { type: type });
            return null;
        });
        if (typed !== null)
            return typed;
        // A constant pattern: an expression without relational operators.
        var expr = this.binary(PRECEDENCE['<<']);
        return this.node('pconst', token, { expr: expr });
    };

    P.startsPattern = function () {
        var token = this.peek();
        if (token.type === 'op')
            return token.value === '(' || token.value === '[' || token.value === '{' || token.value === '<' ||
                token.value === '<=' || token.value === '>' || token.value === '-' || token.value === '+';
        return token.type !== 'eof' && !(token.type === 'ident' && (token.value === 'and' || token.value === 'or'));
    };

    // ( ... ): a parenthesized pattern or a positional one.
    P.parenthesizedPattern = function () {
        var token = this.expect('(');
        var items = [];
        while (!this.is(')')) {
            var itemToken = this.peek();
            var name = null;
            if (this.peek().type === 'ident' && this.is(':', 1)) {
                name = this.identifier();
                this.next();
            }
            items.push(this.node('subpattern', itemToken, { name: name, pattern: this.pattern() }));
            if (!this.accept(','))
                break;
        }
        this.expect(')');
        if (items.length === 1 && items[0].name === null && !this.is('{') && this.peek().type !== 'ident')
            return items[0].pattern;
        return this.recursivePatternTail(token, null, items);
    };

    // Type(…) {…} designation - the rest after the type.
    P.recursivePatternRest = function (token, type) {
        var positional = null;
        if (this.is('(')) {
            this.next();
            positional = [];
            while (!this.is(')')) {
                var itemToken = this.peek();
                var name = null;
                if (this.peek().type === 'ident' && this.is(':', 1)) {
                    name = this.identifier();
                    this.next();
                }
                positional.push(this.node('subpattern', itemToken, { name: name, pattern: this.pattern() }));
                if (!this.accept(','))
                    break;
            }
            this.expect(')');
        }
        return this.recursivePatternTail(token, type, positional);
    };

    P.recursivePatternTail = function (token, type, positional) {
        var properties = null;
        if (this.is('{')) {
            this.next();
            properties = [];
            while (!this.is('}')) {
                var itemToken = this.peek();
                // Name: or Name.Inner: (an extended property pattern).
                var path = [this.identifier()];
                while (this.accept('.'))
                    path.push(this.identifier());
                if (!this.is(':'))
                    this.error('CS1003', "Syntax error, ':' expected");
                this.next();
                properties.push(this.node('subpattern', itemToken, { name: path[0], path: path, pattern: this.pattern() }));
                if (!this.accept(','))
                    break;
            }
            this.expect('}');
        }
        var designation = null;
        if (this.peek().type === 'ident' && !this.isWord('and') && !this.isWord('or') && !this.isWord('when'))
            designation = this.designation();
        return this.node('precursive', token, { type: type, positional: positional, properties: properties,
                                                designation: designation });
    };

    P.listPattern = function (token) {
        this.expect('[');
        var items = [];
        while (!this.is(']')) {
            items.push(this.pattern());
            if (!this.accept(','))
                break;
        }
        this.expect(']');
        var designation = null;
        if (this.peek().type === 'ident' && !this.isWord('and') && !this.isWord('or') && !this.isWord('when'))
            designation = this.designation();
        return this.node('plist', token, { items: items, designation: designation });
    };

    // --- Query expressions

    // from x in ..., from T x in ...
    P.startsQuery = function () {
        if (!this.isWord('from'))
            return false;
        var next = this.peek(1);
        if (next.type === 'ident' && this.is('in', 2))
            return true;
        if (next.type !== 'ident' && !(next.type === 'keyword' && CS.PREDEFINED[next.value] === 1))
            return false;
        return this.lookahead(function () {
            this.next();
            this.type();
            return this.peek().type === 'ident' && this.is('in', 1);
        });
    };

    P.query = function () {
        var token = this.peek();
        ++this.inQuery;
        try {
            var from = this.fromClause();
            var body = this.queryBody();
            return this.node('query', token, { from: from, body: body });
        } finally {
            --this.inQuery;
        }
    };

    P.fromClause = function () {
        var token = this.next();
        var type = null;
        if (!(this.peek().type === 'ident' && this.is('in', 1)))
            type = this.type();
        var name = this.identifier();
        if (!this.is('in'))
            this.error('CS1515', "'in' expected");
        this.next();
        return this.node('qfrom', token, { type: type, name: name, expr: this.expression() });
    };

    P.queryBody = function () {
        var clauses = [];
        for (;;) {
            var token = this.peek();
            if (this.isWord('from')) {
                clauses.push(this.fromClause());
                continue;
            }
            if (this.isWord('let')) {
                this.next();
                var name = this.identifier();
                this.expect('=');
                clauses.push(this.node('qlet', token, { name: name, expr: this.expression() }));
                continue;
            }
            if (this.isWord('where')) {
                this.next();
                clauses.push(this.node('qwhere', token, { expr: this.expression() }));
                continue;
            }
            if (this.isWord('join')) {
                this.next();
                var joinType = null;
                if (!(this.peek().type === 'ident' && this.is('in', 1)))
                    joinType = this.type();
                var joinName = this.identifier();
                if (!this.is('in'))
                    this.error('CS1515', "'in' expected");
                this.next();
                var source = this.expression();
                if (!this.isWord('on'))
                    this.error('CS1003', "Syntax error, 'on' expected");
                this.next();
                var left = this.expression();
                if (!this.isWord('equals'))
                    this.error('CS1003', "Syntax error, 'equals' expected");
                this.next();
                var right = this.expression();
                var into = null;
                if (this.isWord('into')) {
                    this.next();
                    into = this.identifier();
                }
                clauses.push(this.node('qjoin', token, { type: joinType, name: joinName, source: source, left: left,
                                                         right: right, into: into }));
                continue;
            }
            if (this.isWord('orderby')) {
                this.next();
                var orderings = [];
                for (;;) {
                    var orderToken = this.peek();
                    var key = this.expression();
                    var descending = false;
                    if (this.isWord('ascending')) {
                        this.next();
                    } else if (this.isWord('descending')) {
                        this.next();
                        descending = true;
                    }
                    orderings.push(this.node('qordering', orderToken, { expr: key, descending: descending }));
                    if (!this.accept(','))
                        break;
                }
                clauses.push(this.node('qorderby', token, { orderings: orderings }));
                continue;
            }
            break;
        }
        var endToken = this.peek();
        var end;
        if (this.isWord('select')) {
            this.next();
            end = this.node('qselect', endToken, { expr: this.expression() });
        } else if (this.isWord('group')) {
            this.next();
            var element = this.expression();
            if (!this.isWord('by'))
                this.error('CS1003', "Syntax error, 'by' expected");
            this.next();
            end = this.node('qgroup', endToken, { expr: element, key: this.expression() });
        } else {
            this.error('CS0742', 'A query body must end with a select clause or a group clause');
        }
        var continuation = null;
        if (this.isWord('into')) {
            var intoToken = this.next();
            var intoName = this.identifier();
            continuation = this.node('qinto', intoToken, { name: intoName, body: this.queryBody() });
        }
        return { clauses: clauses, end: end, continuation: continuation };
    };
})(globalThis);
