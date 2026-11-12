// Kotlin: parsing of expressions by the levels of the grammar of Kotlin.
// A line break may stand before ".", "?.", "?:", "&&", "||" and "as", but
// ends the expression before the other binary operators, "(" and "[".
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Kt = T.kotlin;
    var Parser = Kt.Parser;
    if (Parser.prototype.expression)
        return;

    var EQUALITY = { '==': true, '!=': true, '===': true, '!==': true };
    var COMPARISON = { '<': true, '>': true, '<=': true, '>=': true };
    var MULTIPLICATIVE = { '*': true, '/': true, '%': true };

    // The next token is an operator op on the same line.
    Parser.prototype.sameLineOp = function (table) {
        var token = this.peek();
        return token.type === 'op' && !token.newline && table[token.value] === true ? token : null;
    };

    Parser.prototype.binaryNode = function (op, left, right, token) {
        return this.node('binary', token, { op: op, left: left, right: right, line: left.line, column: left.column,
                                            opLine: token.line, opColumn: token.column });
    };

    Parser.prototype.expression = function () {
        return this.disjunction();
    };

    Parser.prototype.disjunction = function () {
        var left = this.conjunction();
        while (this.isOp('||')) {
            var token = this.next();
            left = this.binaryNode('||', left, this.conjunction(), token);
        }
        return left;
    };

    Parser.prototype.conjunction = function () {
        var left = this.equality();
        while (this.isOp('&&')) {
            var token = this.next();
            left = this.binaryNode('&&', left, this.equality(), token);
        }
        return left;
    };

    Parser.prototype.equality = function () {
        var left = this.comparison();
        var token;
        while ((token = this.sameLineOp(EQUALITY)) !== null) {
            this.next();
            left = this.binaryNode(token.value, left, this.comparison(), token);
        }
        return left;
    };

    Parser.prototype.comparison = function () {
        var left = this.namedCheck();
        var token;
        while ((token = this.sameLineOp(COMPARISON)) !== null) {
            this.next();
            left = this.binaryNode(token.value, left, this.namedCheck(), token);
        }
        return left;
    };

    // in, !in, is, !is
    Parser.prototype.namedCheck = function () {
        var left = this.elvis();
        for (;;) {
            var token = this.peek();
            if (token.newline)
                return left;
            if ((token.type === 'keyword' && token.value === 'in') || (token.type === 'op' && token.value === '!in')) {
                this.next();
                left = this.node('binary', token, { op: token.value === 'in' ? 'in' : '!in', left: left, right: this.elvis(),
                                                    line: left.line, column: left.column, opLine: token.line, opColumn: token.column });
                continue;
            }
            if ((token.type === 'keyword' && token.value === 'is') || (token.type === 'op' && token.value === '!is')) {
                this.next();
                left = this.node('is', token, { expr: left, target: this.type(), negated: token.value === '!is',
                                                line: left.line, column: left.column, opLine: token.line, opColumn: token.column });
                continue;
            }
            return left;
        }
    };

    Parser.prototype.elvis = function () {
        var left = this.infixCall();
        while (this.isOp('?:')) {
            var token = this.next();
            left = this.binaryNode('?:', left, this.infixCall(), token);
        }
        return left;
    };

    // a to b, x shl 2, 0 until n step 2
    Parser.prototype.infixCall = function () {
        var left = this.range();
        for (;;) {
            var token = this.peek();
            if (token.type !== 'ident' || token.newline)
                return left;
            this.next();
            var right = this.range();
            left = this.node('infix', token, { name: token.value, left: left, right: right, line: left.line, column: left.column,
                                               nameLine: token.line, nameColumn: token.column });
        }
    };

    Parser.prototype.range = function () {
        var left = this.additive();
        var token;
        while ((token = this.sameLineOp({ '..': true, '..<': true })) !== null) {
            this.next();
            left = this.binaryNode(token.value, left, this.additive(), token);
        }
        return left;
    };

    Parser.prototype.additive = function () {
        var left = this.multiplicative();
        var token;
        while ((token = this.sameLineOp({ '+': true, '-': true })) !== null) {
            this.next();
            left = this.binaryNode(token.value, left, this.multiplicative(), token);
        }
        return left;
    };

    Parser.prototype.multiplicative = function () {
        var left = this.asExpression();
        var token;
        while ((token = this.sameLineOp(MULTIPLICATIVE)) !== null) {
            this.next();
            left = this.binaryNode(token.value, left, this.asExpression(), token);
        }
        return left;
    };

    Parser.prototype.asExpression = function () {
        var left = this.prefix();
        while (this.isKeyword('as') || this.isKeyword('as?')) {
            var token = this.next();
            left = this.node('as', token, { expr: left, target: this.type(), safe: token.value === 'as?', line: left.line,
                                            column: left.column, opLine: token.line, opColumn: token.column });
        }
        return left;
    };

    Parser.prototype.prefix = function () {
        var token = this.peek();
        if (token.type === 'op') {
            switch (token.value) {
            case '-':
            case '+':
            case '!':
            case '++':
            case '--':
                this.next();
                return this.node('prefix', token, { op: token.value, arg: this.prefix() });
            case '@':
                this.annotation();
                return this.prefix();
            }
        }
        if (token.type === 'label') {
            this.next();
            var labeled = this.prefix();
            labeled.label = token.value;
            return labeled;
        }
        return this.postfix(this.primary());
    };

    // Suffixes: calls, trailing lambdas, indexing, members, ++, --, !!, ::.
    Parser.prototype.postfix = function (expr) {
        for (;;) {
            var token = this.peek();
            if (token.type === 'op') {
                if ((token.value === '++' || token.value === '--' || token.value === '!!') && !token.newline) {
                    this.next();
                    expr = this.node('postfix', token, { op: token.value, arg: expr, line: expr.line, column: expr.column,
                                                         opLine: token.line, opColumn: token.column });
                    continue;
                }
                if (token.value === '<' && !token.newline && this.callable(expr)) {
                    var typeArgs = this.tryTypeArguments();
                    if (typeArgs === null)
                        return expr;
                    if (this.isOp('(') || this.isOp('{') || this.peek().type === 'label') {
                        expr = this.callSuffix(expr, typeArgs);
                    } else {
                        // Foo<Int>::class, Foo<Int>.Nested: the arguments belong to the name.
                        expr.typeArgs = typeArgs;
                    }
                    continue;
                }
                if (token.value === '(' && !token.newline) {
                    expr = this.callSuffix(expr, null);
                    continue;
                }
                if (token.value === '{' && !token.newline && this.trailingLambdaAllowed(expr)) {
                    expr = this.callSuffix(expr, null);
                    continue;
                }
                if (token.value === '[' && !token.newline) {
                    this.next();
                    var indices = [];
                    do {
                        indices.push(this.expression());
                    } while (this.acceptOp(','));
                    this.expectOp(']');
                    expr = this.node('index', token, { target: expr, indices: indices, line: expr.line, column: expr.column,
                                                       opLine: token.line, opColumn: token.column });
                    continue;
                }
                if (token.value === '.' || token.value === '?.') {
                    this.next();
                    var nameToken = this.peek();
                    if (nameToken.type !== 'ident')
                        this.syntaxError('Name expected', nameToken);
                    this.next();
                    expr = this.node('member', nameToken, { target: expr, name: nameToken.value, safe: token.value === '?.',
                                                            line: expr.line, column: expr.column, nameLine: nameToken.line,
                                                            nameColumn: nameToken.column, opLine: token.line });
                    continue;
                }
                if (token.value === '::') {
                    this.next();
                    expr = this.callableReference(expr, token);
                    continue;
                }
            }
            if (token.type === 'label' && !token.newline && this.isOp('{', 1) && this.trailingLambdaAllowed(expr)) {
                expr = this.callSuffix(expr, null);
                continue;
            }
            return expr;
        }
    };

    // Type arguments may follow a name or a member.
    Parser.prototype.callable = function (expr) {
        return expr.k === 'name' || expr.k === 'member';
    };

    // A lambda after an expression is a trailing lambda of a call.
    Parser.prototype.trailingLambdaAllowed = function (expr) {
        return !this.noTrailingLambda && (expr.k === 'name' || expr.k === 'member' || expr.k === 'call' || expr.k === 'index' ||
                                          expr.k === 'paren' || expr.k === 'this' || expr.k === 'ref' || expr.k === 'lambda');
    };

    // (args) [lambda] or a lambda alone.
    Parser.prototype.callSuffix = function (callee, typeArgs) {
        var token = this.peek();
        var args = [];
        var argsLine = token.line;
        if (this.isOp('(')) {
            var parsed = this.valueArguments();
            args = parsed.args;
        }
        var call = this.node('call', token, { callee: callee, typeArgs: typeArgs, args: args, lambda: null, line: callee.line,
                                              column: callee.column, argsLine: argsLine, argsColumn: token.column,
                                              endLine: this.peek(-1).line });
        var next = this.peek();
        if (!next.newline && (this.isOp('{') || (next.type === 'label' && this.isOp('{', 1))) && !this.noTrailingLambda) {
            var label = null;
            if (next.type === 'label') {
                label = next.value;
                this.next();
            }
            call.lambda = this.lambdaLiteral();
            call.lambda.label = label;
        }
        return call;
    };

    Parser.prototype.valueArguments = function () {
        var token = this.expectOp('(');
        var args = [];
        var saved = this.noTrailingLambda;
        this.noTrailingLambda = false;
        while (!this.isOp(')')) {
            while (this.isOp('@'))
                this.annotation();
            var argToken = this.peek();
            var name = null;
            if (argToken.type === 'ident' && this.isOp('=', 1)) {
                name = argToken.value;
                this.next();
                this.next();
            }
            var spread = false;
            if (this.isOp('*')) {
                this.next();
                spread = true;
            }
            var value = this.expression();
            args.push({ name: name, spread: spread, value: value, line: argToken.line, column: argToken.column });
            if (!this.acceptOp(',')) {
                if (!this.isOp(')'))
                    this.syntaxError("Expecting ')'");
                break;
            }
        }
        this.expectOp(')');
        this.noTrailingLambda = saved;
        return { args: args, line: token.line };
    };

    // ::name, Type::name, value::name, ::class
    Parser.prototype.callableReference = function (receiver, token) {
        var nameToken = this.peek();
        var name;
        if (this.isKeyword('class')) {
            this.next();
            name = 'class';
        } else if (nameToken.type === 'ident') {
            this.next();
            name = nameToken.value;
        } else {
            this.syntaxError('Expecting an identifier', nameToken);
        }
        return this.node('ref', token, { receiver: receiver, name: name, line: receiver !== null ? receiver.line : token.line,
                                         column: receiver !== null ? receiver.column : token.column,
                                         nameLine: nameToken.line, nameColumn: nameToken.column });
    };

    // --- Primary expressions

    Parser.prototype.primary = function () {
        var token = this.peek();
        switch (token.type) {
        case 'int':
            this.next();
            return this.node('int', token, { text: token.text, digits: token.digits, radix: token.radix, suffix: token.suffix });
        case 'float':
            this.next();
            return this.node('float', token, { value: token.value, single: token.single, text: token.text });
        case 'char':
            this.next();
            return this.node('char', token, { value: token.value });
        case 'string':
            this.next();
            return this.stringNode(token);
        case 'ident':
            this.next();
            return this.node('name', token, { name: token.value });
        case 'keyword':
            return this.keywordPrimary(token);
        case 'op':
            if (token.value === '(') {
                this.next();
                var saved = this.noTrailingLambda;
                this.noTrailingLambda = false;
                var inner = this.expression();
                this.noTrailingLambda = saved;
                this.expectOp(')');
                return this.node('paren', token, { expr: inner });
            }
            if (token.value === '{')
                return this.lambdaLiteral();
            if (token.value === '::') {
                this.next();
                return this.callableReference(null, token);
            }
            if (token.value === '[') {
                this.next();
                var items = [];
                while (!this.isOp(']')) {
                    items.push(this.expression());
                    if (!this.acceptOp(','))
                        break;
                }
                this.expectOp(']');
                return this.node('collection', token, { items: items });
            }
            break;
        }
        this.syntaxError('Expecting an expression', token);
    };

    Parser.prototype.keywordPrimary = function (token) {
        switch (token.value) {
        case 'true':
        case 'false':
            this.next();
            return this.node('bool', token, { value: token.value === 'true' });
        case 'null':
            this.next();
            return this.node('null', token, {});
        case 'this':
            this.next();
            return this.node('this', token, { label: token.label || null });
        case 'super': {
            this.next();
            var superType = null;
            if (this.isOp('<') && !this.peek().space) {
                this.next();
                superType = this.type();
                this.expectOp('>');
            }
            var label = token.label || null;
            if (label === null && this.peek().type === 'op' && this.peek().value === '@' && !this.peek().space) {
                this.next();
                label = this.name();
            }
            if (!this.isOp('.') && !this.isOp('?.'))
                this.syntaxError("Expecting '.'");
            return this.node('super', token, { type: superType, label: label });
        }
        case 'if':
            return this.ifExpression();
        case 'when':
            return this.whenExpression();
        case 'try':
            return this.tryExpression();
        case 'return':
        case 'break':
        case 'continue':
        case 'throw':
            return this.jumpExpression();
        case 'fun':
            return this.anonymousFunction();
        case 'object':
            return this.objectExpression();
        }
        this.syntaxError('Expecting an expression', token);
    };

    // The parts of a string: texts and expressions.
    Parser.prototype.stringNode = function (token) {
        var self = this;
        var parts = token.parts.map(function (part) {
            if (part.kind === 'text')
                return { kind: 'text', value: part.value };
            if (part.kind === 'name' && part.name === 'this')
                return { kind: 'expr', expr: self.node('this', part, { label: null }) };
            if (part.kind === 'name')
                return { kind: 'expr', expr: self.node('name', part, { name: part.name }) };
            var parser = new Parser(part.tokens, self.source);
            if (parser.peek().type === 'eof')
                parser.syntaxError('Expecting an expression');
            var expr = parser.expression();
            if (parser.peek().type !== 'eof')
                parser.syntaxError("Expecting '}'");
            return { kind: 'expr', expr: expr };
        });
        return this.node('string', token, { parts: parts, raw: token.raw });
    };

    // A token can begin an expression (for return and throw).
    Parser.prototype.startsExpression = function (token) {
        if (token.type === 'eof')
            return false;
        if (token.type === 'op')
            return token.value === '(' || token.value === '{' || token.value === '-' || token.value === '+' ||
                token.value === '!' || token.value === '++' || token.value === '--' || token.value === '::' ||
                token.value === '@' || token.value === '[';
        if (token.type === 'keyword')
            return token.value !== 'else' && token.value !== 'in' && token.value !== 'is' && token.value !== 'as' &&
                token.value !== 'as?';
        return true;
    };

    Parser.prototype.jumpExpression = function () {
        var token = this.next();
        var node = this.node('jump', token, { kind: token.value, label: token.label || null, value: null });
        if (token.value === 'throw') {
            node.value = this.expression();
        } else if (token.value === 'return') {
            var next = this.peek();
            if (!next.newline && this.startsExpression(next))
                node.value = this.expression();
        }
        return node;
    };

    Parser.prototype.ifExpression = function () {
        var token = this.next();
        this.expectOp('(');
        var cond = this.expression();
        this.expectOp(')');
        var then = null, otherwise = null;
        if (!this.isKeyword('else') && !this.isOp(';'))
            then = this.controlBody();
        if (this.isOp(';') && this.isKeyword('else', 1))
            this.next();
        if (this.isKeyword('else')) {
            this.next();
            otherwise = this.isOp(';') ? this.node('block', this.peek(), { statements: [] }) : this.controlBody();
        }
        if (then === null)
            then = this.node('block', token, { statements: [] });
        return this.node('if', token, { cond: cond, then: then, otherwise: otherwise });
    };

    Parser.prototype.whenExpression = function () {
        var token = this.next();
        var subject = null, subjectVar = null;
        if (this.acceptOp('(')) {
            if (this.isKeyword('val')) {
                var varToken = this.next();
                var name = this.name();
                var type = null;
                if (this.acceptOp(':'))
                    type = this.type();
                this.expectOp('=');
                subjectVar = this.node('subjectvar', varToken, { name: name, type: type });
            }
            subject = this.expression();
            this.expectOp(')');
        }
        this.expectOp('{');
        var branches = [];
        for (;;) {
            this.skipSemicolons();
            if (this.isOp('}')) {
                this.next();
                break;
            }
            if (this.peek().type === 'eof')
                this.syntaxError("Expecting '}'");
            var branchToken = this.peek();
            var conds = [];
            var isElse = false;
            if (this.isKeyword('else')) {
                this.next();
                isElse = true;
            } else {
                do {
                    if (this.isOp('->'))
                        break;
                    conds.push(this.whenCondition(subject !== null));
                } while (this.acceptOp(','));
            }
            var guard = null;
            if (this.isKeyword('if')) {
                this.next();
                guard = this.expression();
            }
            if (!this.isOp('->'))
                this.syntaxError("Expecting '->'");
            this.next();
            var body = this.controlBody();
            branches.push(this.node('branch', branchToken, { conds: conds, isElse: isElse, guard: guard, body: body }));
            this.endOfStatement();
        }
        return this.node('when', token, { subject: subject, subjectVar: subjectVar, branches: branches });
    };

    Parser.prototype.whenCondition = function (hasSubject) {
        var token = this.peek();
        if (hasSubject) {
            if (this.isKeyword('in') || this.isOp('!in')) {
                this.next();
                return this.node('incond', token, { negated: token.value === '!in', expr: this.expression() });
            }
            if (this.isKeyword('is') || this.isOp('!is')) {
                this.next();
                return this.node('iscond', token, { negated: token.value === '!is', type: this.type() });
            }
        }
        return this.node('exprcond', token, { expr: this.expression() });
    };

    Parser.prototype.tryExpression = function () {
        var token = this.next();
        var body = this.block();
        var catches = [];
        var finalizer = null;
        while (this.isWord('catch')) {
            var catchToken = this.next();
            this.expectOp('(');
            var name = this.name();
            this.expectOp(':');
            var type = this.type();
            this.acceptOp(',');
            this.expectOp(')');
            catches.push(this.node('catch', catchToken, { name: name, type: type, body: this.block() }));
        }
        if (this.isWord('finally')) {
            this.next();
            finalizer = this.block();
        }
        if (catches.length === 0 && finalizer === null)
            this.syntaxError("Expecting 'catch' or 'finally'");
        return this.node('try', token, { body: body, catches: catches, finalizer: finalizer });
    };

    // { [params ->] statements }
    Parser.prototype.lambdaLiteral = function () {
        var token = this.expectOp('{');
        var params = this.tryLambdaParameters();
        var saved = this.noTrailingLambda;
        this.noTrailingLambda = false;
        var statements = this.statementsUntilBrace();
        this.noTrailingLambda = saved;
        return this.node('lambda', token, { params: params, statements: statements, label: null, endLine: this.peek(-1).line });
    };

    // Lambda parameters up to "->" or null (the tokens are taken back).
    Parser.prototype.tryLambdaParameters = function () {
        var start = this.index;
        if (this.isOp('->')) {
            this.next();
            return [];
        }
        var params = [];
        try {
            for (;;) {
                var token = this.peek();
                var param;
                if (this.isOp('(')) {
                    var names = this.destructuringNames();
                    param = this.node('lparam', token, { name: null, destructure: names, type: null });
                } else if (token.type === 'ident') {
                    this.next();
                    param = this.node('lparam', token, { name: token.value, destructure: null, type: null });
                } else {
                    this.index = start;
                    return null;
                }
                if (this.isOp(':')) {
                    this.next();
                    param.type = this.type();
                }
                params.push(param);
                if (this.acceptOp(','))
                    continue;
                if (this.isOp('->')) {
                    this.next();
                    return params;
                }
                this.index = start;
                return null;
            }
        } catch (error) {
            if (!(error instanceof T.CompileError))
                throw error;
            this.index = start;
            return null;
        }
    };

    // fun(x: Int): Int { ... }, fun Int.(): Int = ...
    Parser.prototype.anonymousFunction = function () {
        var token = this.next();
        var receiver = null;
        if (!this.isOp('(')) {
            receiver = this.type({ receiver: true });
            this.expectOp('.');
        }
        var params = this.parameters(false, true);
        var returns = null;
        if (this.acceptOp(':'))
            returns = this.type();
        var body = null, exprBody = false;
        if (this.isOp('{')) {
            body = this.block();
        } else {
            this.expectOp('=');
            body = this.expression();
            exprBody = true;
        }
        return this.node('anonfun', token, { receiver: receiver, params: params, returns: returns, body: body, exprBody: exprBody });
    };

    // object : Base(args), Interface { members }
    Parser.prototype.objectExpression = function () {
        var token = this.next();
        var supers = [];
        if (this.acceptOp(':'))
            supers = this.delegationSpecifiers();
        var node = this.node('class', token, { kind: 'object', mods: {}, name: null, typeParams: [], primary: null, supers: supers,
                                               members: [], entries: [], hasBody: false, anonymous: true });
        this.classBody(node);
        return this.node('objectexpr', token, { decl: node });
    };
})(globalThis);
