// Pascal: parsing statements and expressions.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Pascal = T.pascal;
    var Parser = Pascal.Parser;
    if (Parser.prototype.parseStatement)
        return;

    // Precedence of the binary operations of FPC: higher binds tighter.
    var BINARY = {
        '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, 'in': 1, 'is': 1,
        '+': 2, '-': 2, 'or': 2, 'xor': 2, '><': 2,
        '*': 3, '/': 3, 'div': 3, 'mod': 3, 'and': 3, 'shl': 3, 'shr': 3, 'as': 3, '<<': 3, '>>': 3,
        '**': 4
    };

    // --- Statements

    Parser.prototype.parseCompound = function () {
        var start = this.expect('begin');
        var node = this.at({ k: 'block', body: this.parseStatementList(['end']) }, start);
        node.endLine = this.peek().line;
        this.expect('end');
        return node;
    };

    // Statements separated by ";" up to one of the end words (not consumed).
    Parser.prototype.parseStatementList = function (terminators) {
        var list = [];
        for (;;) {
            if (this.isAny(terminators))
                return list;
            if (this.peek().type === 'eof')
                this.fail('"' + terminators[0].toUpperCase() + '" expected but end of file found');
            var statement = this.parseStatement();
            if (statement.k !== 'empty')
                list.push(statement);
            if (this.accept(';'))
                continue;
            if (!this.isAny(terminators))
                this.fail('";" expected but ' + this.describe(this.peek()) + ' found');
        }
    };

    Parser.prototype.parseStatement = function () {
        var token = this.peek();
        // A label: "name:" or "10:".
        if ((token.type === 'ident' || token.type === 'int') && this.peek(1).type === 'op' && this.peek(1).value === ':') {
            this.next();
            this.next();
            var labeled = this.at({ k: 'labeled', label: Pascal.labelName(token), text: token.text, body: null }, token);
            if (!this.is(';') && !this.is('end') && !this.is('until') && !this.is('else') && this.peek().type !== 'eof')
                labeled.body = this.parseStatement();
            return labeled;
        }
        if (token.type === 'keyword') {
            switch (token.value) {
            case 'begin':
                return this.parseCompound();
            case 'if':
                return this.parseIf();
            case 'case':
                return this.parseCase();
            case 'for':
                return this.parseFor();
            case 'while': {
                this.next();
                var whileNode = this.at({ k: 'while', test: this.parseExpression(), body: null }, token);
                this.expect('do');
                whileNode.body = this.parseOptionalStatement();
                return whileNode;
            }
            case 'repeat': {
                this.next();
                var repeatNode = this.at({ k: 'repeat', body: this.parseStatementList(['until']), test: null }, token);
                this.expect('until');
                repeatNode.test = this.parseExpression();
                return repeatNode;
            }
            case 'with': {
                this.next();
                var withNode = this.at({ k: 'with', objects: [], body: null }, token);
                do {
                    withNode.objects.push(this.parseExpression());
                } while (this.accept(','));
                this.expect('do');
                withNode.body = this.parseOptionalStatement();
                return withNode;
            }
            case 'goto': {
                this.next();
                var target = this.peek();
                if (target.type !== 'ident' && target.type !== 'int')
                    this.fail('label expected');
                this.next();
                return this.at({ k: 'goto', label: Pascal.labelName(target), text: target.text }, token);
            }
            case 'try':
                return this.parseTry();
            case 'raise': {
                this.next();
                var raiseNode = this.at({ k: 'raise', value: null, at: null }, token);
                if (!this.is(';') && !this.is('end') && !this.is('else') && !this.is('until') && !this.is('except') &&
                    !this.is('finally') && this.peek().type !== 'eof') {
                    raiseNode.value = this.parseExpression();
                    if (this.acceptWord('at')) {
                        raiseNode.at = this.parseExpression();
                        if (this.accept(','))
                            this.parseExpression();
                    }
                }
                return raiseNode;
            }
            case 'asm':
                this.error('assembler blocks are not supported');
                break;
            case 'end':
            case 'until':
            case 'else':
            case 'except':
            case 'finally':
                return this.at({ k: 'empty' }, token);
            }
        }
        if (token.type === 'op' && token.value === ';')
            return this.at({ k: 'empty' }, token);
        // An assignment or a call.
        var target = this.parseExpression();
        var op = this.peek();
        if (op.type === 'op' && (op.value === ':=' || op.value === '+=' || op.value === '-=' || op.value === '*=' ||
                                 op.value === '/=')) {
            this.next();
            return this.at({ k: 'assign', target: target, op: op.value, value: this.parseExpression() }, token);
        }
        if (op.type === 'op' && op.value === '=' )
            this.fail('":=" expected but "=" found');
        return this.at({ k: 'call', expr: target }, token);
    };

    // A statement that may be missing: "while x do ;".
    Parser.prototype.parseOptionalStatement = function () {
        if (this.is(';') || this.is('end') || this.is('else') || this.is('until') || this.peek().type === 'eof')
            return null;
        return this.parseStatement();
    };

    Parser.prototype.parseIf = function () {
        var start = this.next();
        var node = this.at({ k: 'if', test: this.parseExpression(), then: null, otherwise: null }, start);
        this.expect('then');
        node.then = this.parseOptionalStatement();
        if (this.accept('else'))
            node.otherwise = this.parseOptionalStatement();
        return node;
    };

    Parser.prototype.parseCase = function () {
        var start = this.next();
        var node = this.at({ k: 'case', expr: this.parseExpression(), branches: [], otherwise: null }, start);
        this.expect('of');
        while (!this.is('end') && !this.is('else') && !this.isWord('otherwise')) {
            var branchStart = this.peek();
            var labels = [];
            do {
                var lo = this.parseExpression();
                var hi = null;
                if (this.accept('..'))
                    hi = this.parseExpression();
                labels.push(this.at({ lo: lo, hi: hi }, branchStart));
            } while (this.accept(','));
            this.expect(':');
            var branch = this.at({ labels: labels, body: this.parseOptionalStatement() }, branchStart);
            node.branches.push(branch);
            if (!this.accept(';'))
                break;
        }
        if (this.accept('else') || this.acceptWord('otherwise'))
            node.otherwise = this.parseStatementList(['end']);
        this.expect('end');
        return node;
    };

    Parser.prototype.parseFor = function () {
        var start = this.next();
        var variable = this.parseDesignator();
        if (this.accept('in')) {
            var forIn = this.at({ k: 'forin', variable: variable, collection: this.parseExpression(), body: null }, start);
            this.expect('do');
            forIn.body = this.parseOptionalStatement();
            return forIn;
        }
        this.expect(':=');
        var node = this.at({ k: 'for', variable: variable, from: this.parseExpression(), to: null, down: false, body: null }, start);
        if (this.accept('downto'))
            node.down = true;
        else
            this.expect('to');
        node.to = this.parseExpression();
        this.expect('do');
        node.body = this.parseOptionalStatement();
        return node;
    };

    Parser.prototype.parseTry = function () {
        var start = this.next();
        var node = this.at({ k: 'try', body: this.parseStatementList(['except', 'finally']), handlers: null,
                             exceptBody: null, finallyBody: null }, start);
        if (this.accept('finally')) {
            node.finallyBody = this.parseStatementList(['end']);
            this.expect('end');
            return node;
        }
        this.expect('except');
        if (this.isWord('on')) {
            node.handlers = [];
            while (this.isWord('on')) {
                var onToken = this.next();
                var handler = this.at({ name: null, text: null, typeNode: null, body: null }, onToken);
                if (this.isIdent() && this.peek(1).type === 'op' && this.peek(1).value === ':') {
                    var name = this.next();
                    handler.name = name.value;
                    handler.text = name.text;
                    this.next();
                }
                handler.typeNode = this.parseType();
                this.expect('do');
                handler.body = this.parseOptionalStatement();
                node.handlers.push(handler);
                if (!this.accept(';'))
                    break;
            }
            if (this.accept('else'))
                node.exceptBody = this.parseStatementList(['end']);
        } else {
            node.exceptBody = this.parseStatementList(['end']);
        }
        this.expect('end');
        return node;
    };

    // --- Expressions

    Parser.prototype.parseExpression = function () {
        return this.parseBinary(1, null);
    };

    // The continuation of an expression whose first operand is parsed already.
    Parser.prototype.parseExpressionFrom = function (left) {
        left = this.parsePostfix(left);
        return this.parseBinary(1, left);
    };

    Parser.prototype.binaryOperator = function () {
        var token = this.peek();
        if (token.type === 'op' || token.type === 'keyword') {
            var precedence = BINARY[token.value];
            if (precedence !== undefined && Object.prototype.hasOwnProperty.call(BINARY, token.value))
                return { token: token, precedence: precedence };
        }
        return null;
    };

    Parser.prototype.parseBinary = function (minimum, left) {
        if (left === null)
            left = this.parseUnary();
        for (;;) {
            var operator = this.binaryOperator();
            if (operator === null || operator.precedence < minimum)
                return left;
            this.next();
            // Comparisons do not chain: a = b = c is (a = b) = c.
            var right = this.parseBinary(operator.precedence + 1, null);
            left = this.at({ k: 'binary', op: operator.token.value, left: left, right: right }, operator.token);
        }
    };

    Parser.prototype.parseUnary = function () {
        var token = this.peek();
        if (token.type === 'keyword' && token.value === 'not') {
            this.next();
            return this.at({ k: 'unary', op: 'not', arg: this.parseUnary() }, token);
        }
        if (token.type === 'op' && (token.value === '-' || token.value === '+')) {
            this.next();
            return this.at({ k: 'unary', op: token.value, arg: this.parseUnary() }, token);
        }
        if (token.type === 'op' && token.value === '@') {
            this.next();
            // @@Proc - the address of a procedural variable.
            if (this.accept('@'))
                return this.at({ k: 'addr', arg: this.at({ k: 'addr', arg: this.parseUnary() }, token), raw: true }, token);
            return this.at({ k: 'addr', arg: this.parseUnary() }, token);
        }
        var primary = this.parsePrimary();
        if (this.is('**')) {
            var power = this.next();
            return this.at({ k: 'binary', op: '**', left: primary, right: this.parseUnary() }, power);
        }
        return primary;
    };

    Parser.prototype.parsePrimary = function () {
        var token = this.peek();
        var node;
        switch (token.type) {
        case 'int':
            this.next();
            return this.parsePostfix(this.at({ k: 'int', value: token.value, text: token.text }, token));
        case 'real':
            this.next();
            return this.at({ k: 'real', value: token.value, text: token.text }, token);
        case 'string':
            this.next();
            return this.parsePostfix(this.at({ k: 'string', value: token.value }, token));
        case 'ident':
            this.next();
            return this.parsePostfix(this.at({ k: 'name', name: token.value, text: token.text }, token));
        case 'keyword':
            switch (token.value) {
            case 'nil':
                this.next();
                return this.at({ k: 'nil' }, token);
            case 'inherited': {
                this.next();
                node = this.at({ k: 'inherited', name: null, text: null, args: null }, token);
                if (this.isIdent()) {
                    var name = this.next();
                    node.name = name.value;
                    node.text = name.text;
                    if (this.is('('))
                        node.args = this.parseArguments('(', ')');
                }
                return this.parsePostfix(node);
            }
            case 'string':
                // string(x) - a cast to a string.
                this.next();
                return this.parsePostfix(this.at({ k: 'name', name: 'string', text: 'string' }, token));
            case 'file':
                this.next();
                return this.parsePostfix(this.at({ k: 'name', name: 'file', text: 'file' }, token));
            }
            break;
        case 'op':
            if (token.value === '^') {
                // ^M - a control character: the next character right after it, one.
                var after = this.peek(1);
                if (after.line === token.line && after.column === token.column + 1 && after.text !== undefined &&
                    after.text.length === 1) {
                    this.next();
                    this.next();
                    var code = after.text.toUpperCase().charCodeAt(0) ^ 64;
                    return this.at({ k: 'string', value: String.fromCharCode(code) }, token);
                }
            }
            if (token.value === '(') {
                this.next();
                var inner = this.parseExpression();
                this.expect(')');
                return this.parsePostfix(this.at({ k: 'paren', expr: inner }, token));
            }
            if (token.value === '[') {
                this.next();
                node = this.at({ k: 'setlit', items: [] }, token);
                if (!this.is(']')) {
                    do {
                        var lo = this.parseExpression();
                        var hi = null;
                        if (this.accept('..'))
                            hi = this.parseExpression();
                        node.items.push({ lo: lo, hi: hi });
                    } while (this.accept(','));
                }
                this.expect(']');
                return node;
            }
            break;
        }
        this.fail('expression expected but ' + this.describe(token) + ' found');
    };

    Parser.prototype.parseDesignator = function () {
        var token = this.ident();
        return this.parsePostfix(this.at({ k: 'name', name: token.value, text: token.text }, token));
    };

    // A call, an index, a field, a dereference - from left to right.
    Parser.prototype.parsePostfix = function (node) {
        for (;;) {
            var token = this.peek();
            if (token.type !== 'op')
                return node;
            if (token.value === '(') {
                node = this.at({ k: 'call', callee: node, args: this.parseArguments('(', ')') }, token);
            } else if (token.value === '[') {
                var indexes = this.parseArguments('[', ']');
                if (indexes.length === 0)
                    this.fail('expression expected but "]" found', token);
                node = this.at({ k: 'index', object: node, indexes: indexes }, token);
            } else if (token.value === '.') {
                // ".." is a token of its own, "." after an expression is a member.
                if (this.peek(1).type !== 'ident' && !(this.peek(1).type === 'keyword'))
                    return node;
                this.next();
                var member = this.next();
                if (member.type === 'keyword' && !/^(create|free|destroy|string|object|file|class|type|label|unit|uses|set|array|record|property|in|is|as|to|do|of|end|begin|program|var|const|operator|downto|until|then|else|with|repeat|while|for|if|case|not|and|or|xor|div|mod|shl|shr|nil|goto|try|except|finally|raise|inherited|constructor|destructor|function|procedure|interface|implementation|initialization|finalization|inline|packed|asm|exports|library|threadvar|resourcestring|dispinterface)$/.test(member.value))
                    this.fail('identifier expected', member);
                node = this.at({ k: 'member', object: node, name: member.value, text: member.text }, member);
            } else if (token.value === '^') {
                this.next();
                node = this.at({ k: 'deref', object: node }, token);
            } else {
                return node;
            }
        }
    };

    // Arguments in parentheses; in Write and Str the format "x:width:digits".
    Parser.prototype.parseArguments = function (open, close) {
        this.expect(open);
        var args = [];
        if (this.accept(close))
            return args;
        do {
            var start = this.peek();
            var value = this.parseExpression();
            if (open === '(' && this.is(':')) {
                this.next();
                var formatted = this.at({ k: 'format', expr: value, width: this.parseExpression(), digits: null }, start);
                if (this.accept(':'))
                    formatted.digits = this.parseExpression();
                value = formatted;
            }
            args.push(value);
        } while (this.accept(','));
        this.expect(close);
        return args;
    };
})(globalThis);
