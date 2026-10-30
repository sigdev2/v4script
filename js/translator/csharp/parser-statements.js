// C#: parsing statements. A declaration and an expression statement are
// told apart by an attempt to parse a type followed by a name.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    var P = CS.Parser.prototype;
    if (P.statement)
        return;

    P.block = function () {
        var token = this.expect('{');
        var statements = [];
        while (!this.is('}')) {
            if (this.peek().type === 'eof')
                this.expected('}');
            statements.push(this.statement(false));
        }
        this.expect('}');
        return this.node('block', token, { statements: statements });
    };

    // An embedded statement (the body of if, while, for...): no
    // declarations and labels.
    P.embeddedStatement = function () {
        var token = this.peek();
        var statement = this.statement(false);
        if (statement.k === 'local' || statement.k === 'localFunction' || statement.k === 'labeled' ||
            statement.k === 'deconstructDecl')
            this.error('CS1023', 'Embedded statement cannot be a declaration or labeled statement', token);
        return statement;
    };

    // topLevel: a statement of the unit (await is an operator there).
    P.statement = function (topLevel) {
        var token = this.peek();
        var savedAsync = this.inAsync;
        if (topLevel)
            this.inAsync = true;
        try {
            return this.statementBody(token, topLevel);
        } finally {
            this.inAsync = savedAsync;
        }
    };

    P.statementBody = function (token, topLevel) {
        if (token.type === 'op') {
            switch (token.value) {
            case '{':
                return this.block();
            case ';':
                this.next();
                return this.node('empty', token, {});
            case '[':
                // Attributes before a local function.
                if (this.lookahead(function () { this.attributes(); return this.startsLocalFunction(); })) {
                    var attributes = this.attributes();
                    var fn = this.localFunction(this.peek(), this.localModifiers());
                    fn.attributes = attributes;
                    return fn;
                }
                break;
            }
        }
        if (token.type === 'keyword') {
            switch (token.value) {
            case 'if':
                return this.ifStatement();
            case 'while': {
                this.next();
                this.expect('(');
                var whileCond = this.expression();
                this.expect(')');
                return this.node('while', token, { cond: whileCond, body: this.embeddedStatement() });
            }
            case 'do': {
                this.next();
                var doBody = this.embeddedStatement();
                if (!this.is('while'))
                    this.error('CS1003', "Syntax error, 'while' expected");
                this.next();
                this.expect('(');
                var doCond = this.expression();
                this.expect(')');
                this.expect(';');
                return this.node('do', token, { body: doBody, cond: doCond });
            }
            case 'for':
                return this.forStatement();
            case 'foreach':
                return this.foreachStatement(false);
            case 'switch':
                if (this.is('(', 1))
                    return this.switchStatement();
                break;
            case 'break':
                this.next();
                this.expect(';');
                return this.node('break', token, {});
            case 'continue':
                this.next();
                this.expect(';');
                return this.node('continue', token, {});
            case 'goto':
                return this.gotoStatement();
            case 'return': {
                this.next();
                var value = null;
                if (!this.is(';')) {
                    if (this.is('ref')) {
                        var refToken = this.next();
                        value = this.node('refExpr', refToken, { expr: this.expression() });
                    } else {
                        value = this.expression();
                    }
                }
                this.expect(';');
                return this.node('return', token, { expr: value });
            }
            case 'throw': {
                this.next();
                var thrown = this.is(';') ? null : this.expression();
                this.expect(';');
                return this.node('throw', token, { expr: thrown });
            }
            case 'try':
                return this.tryStatement();
            case 'checked':
            case 'unchecked':
                if (this.is('{', 1)) {
                    this.next();
                    return this.node('checkedBlock', token, { checked: token.value === 'checked', block: this.block() });
                }
                break;
            case 'lock': {
                this.next();
                this.expect('(');
                var lockExpr = this.expression();
                this.expect(')');
                return this.node('lock', token, { expr: lockExpr, body: this.embeddedStatement() });
            }
            case 'using':
                return this.usingStatement(false);
            case 'fixed':
            case 'unsafe':
                if (token.value === 'fixed' || this.is('{', 1))
                    this.error('CS0227', 'Unsafe code may only appear if compiling with /unsafe');
                break;
            case 'const': {
                this.next();
                var constType = this.type();
                var constDecl = this.declarators(token, constType);
                constDecl.isConst = true;
                this.expect(';');
                return constDecl;
            }
            }
        }
        if (token.type === 'ident' && !token.verbatim) {
            if (token.value === 'yield' && (this.is('return', 1) || this.is('break', 1))) {
                this.next();
                if (this.next().value === 'break') {
                    this.expect(';');
                    return this.node('yieldBreak', token, {});
                }
                var yielded = this.expression();
                this.expect(';');
                return this.node('yieldReturn', token, { expr: yielded });
            }
            if (token.value === 'await' && this.inAsync) {
                if (this.is('foreach', 1)) {
                    this.next();
                    return this.foreachStatement(true);
                }
                if (this.is('using', 1)) {
                    this.next();
                    return this.usingStatement(true);
                }
            }
            if (this.is(':', 1)) {
                this.next();
                this.next();
                var labeled = this.is('}') ? this.node('empty', this.peek(), {}) : this.statement(false);
                return this.node('labeled', token, { label: token.value, statement: labeled });
            }
        }
        if (this.startsLocalFunction()) {
            var mods = this.localModifiers();
            return this.localFunction(this.peek(), mods);
        }
        var declaration = this.declarationStatement(token);
        if (declaration !== null)
            return declaration;
        var expr = this.expression();
        // The last expression of a unit without ";" is its value.
        if (topLevel && this.allowValueAtEnd && this.peek().type === 'eof' && !this.is(';'))
            return this.node('expr', token, { expr: expr, valueAllowed: true, unitValue: true });
        this.expect(';');
        return this.node('expr', token, { expr: expr });
    };

    // static, async, unsafe, extern before a local function.
    P.localModifiers = function () {
        var mods = {};
        for (;;) {
            if (this.is('static') || this.is('unsafe') || this.is('extern')) {
                mods[this.next().value] = true;
                continue;
            }
            if (this.isWord('async') && (this.peek(1).type === 'ident' || this.peek(1).type === 'keyword') &&
                !this.is('=>', 2)) {
                this.next();
                mods.async = true;
                continue;
            }
            return mods;
        }
    };

    // [modifiers] ReturnType Name[<T>](...
    P.startsLocalFunction = function () {
        return this.lookahead(function () {
            this.localModifiers();
            if (this.peek().type === 'ident' && this.peek().value === 'await' && this.inAsync)
                return false;
            this.returnType();
            if (this.peek().type !== 'ident')
                return false;
            this.next();
            if (this.is('<')) {
                this.typeParameters();
                return this.is('(');
            }
            if (!this.is('('))
                return false;
            // F(...) followed by { or => or where - a declaration; a call of a
            // method named like a type would be "x(...)" without a type.
            this.skipBalanced('(', ')');
            return this.is('{') || this.is('=>') || this.isWord('where');
        });
    };

    P.localFunction = function (token, mods) {
        var returnType = this.returnType();
        var name = this.identifier();
        var fn = this.node('localFunction', token, { mods: mods, returnType: returnType, name: name,
                                                     typeParams: this.typeParameters(), params: null, constraints: [],
                                                     attributes: [] });
        var savedAsync = this.inAsync;
        this.inAsync = !!mods.async;
        fn.params = this.parameterList();
        fn.constraints = this.constraintClauses();
        this.functionBody(fn);
        this.inAsync = savedAsync;
        return fn;
    };

    // A local declaration (Type a = 1, b;), a deconstruction (var (a, b) =
    // ...), a ref local; null if the statement is an expression.
    P.declarationStatement = function (token) {
        if (this.peek().type === 'ident' && this.peek().value === 'await' && this.inAsync &&
            !(this.is('=', 1) || this.is(';', 1) || this.is(',', 1)))
            return null;
        // var (a, b) = ...
        if (this.isWord('var') && this.is('(', 1)) {
            var deconstruction = this.attempt(function () {
                this.next();
                var designation = this.designation();
                if (!this.is('='))
                    this.expected('=');
                this.next();
                var init = this.expression();
                this.expect(';');
                return this.node('deconstructDecl', token, { designation: designation, init: init });
            });
            if (deconstruction !== null)
                return deconstruction;
        }
        var refKind = '';
        var scoped = false;
        var self = this;
        var head = this.attempt(function () {
            if (self.isWord('scoped') && (self.peek(1).type === 'ident' || self.is('ref', 1))) {
                self.next();
                scoped = true;
            }
            if (self.is('ref')) {
                self.next();
                refKind = 'ref';
                if (self.accept('readonly'))
                    refKind = 'ref readonly';
            }
            var type = self.type();
            var next = self.peek();
            if (next.type !== 'ident')
                return null;
            // A declaration: Type name = | ; | , | ) (in for, using, catch).
            var after = self.peek(1);
            if (after.type === 'op' && (after.value === '=' || after.value === ';' || after.value === ',' ||
                                        after.value === '[' || after.value === ')'))
                return type;
            if (after.type === 'keyword' && after.value === 'in')
                return type;
            if (after.newline || after.type === 'eof')
                return type;
            return null;
        });
        if (head === null)
            return null;
        var decl = this.declarators(token, head);
        decl.refKind = refKind;
        decl.scoped = scoped;
        // int a = 1 b = 2: csc takes b for the next declarator.
        if (this.peek().type === 'ident')
            this.expected(',');
        this.expect(';');
        return decl;
    };

    // Declarators after the type: a = 1, b, c = { 1, 2 }.
    P.declarators = function (token, type) {
        var vars = [];
        for (;;) {
            var varToken = this.peek();
            var name = this.identifier();
            if (this.is('[') && !this.is(']', 1))
                this.error('CS0650', 'Bad array declarator: To declare a managed array the rank specifier precedes the variable\'s identifier. To declare a fixed size buffer field, use the fixed keyword before the field type.');
            var init = null;
            if (this.accept('='))
                init = this.variableInitializer();
            vars.push(this.node('var', varToken, { name: name, init: init }));
            if (!this.accept(','))
                break;
        }
        var isVar = type.k === 'tname' && type.name === 'var' && type.args === null;
        return this.node('local', token, { type: isVar ? null : type, typeNode: type, vars: vars, isConst: false });
    };

    // A designation: name, _, or (a, (b, c)).
    P.designation = function () {
        var token = this.peek();
        if (this.is('(')) {
            this.next();
            var items = [];
            for (;;) {
                items.push(this.designation());
                if (!this.accept(','))
                    break;
            }
            this.expect(')');
            return this.node('designations', token, { items: items });
        }
        var name = this.identifier();
        if (name === '_')
            return this.node('discard', token, {});
        return this.node('single', token, { name: name });
    };

    P.ifStatement = function () {
        var token = this.expect('if');
        this.expect('(');
        var cond = this.expression();
        this.expect(')');
        var then = this.embeddedStatement();
        var otherwise = null;
        if (this.accept('else'))
            otherwise = this.embeddedStatement();
        return this.node('if', token, { cond: cond, then: then, otherwise: otherwise });
    };

    P.forStatement = function () {
        var token = this.expect('for');
        this.expect('(');
        var init = [];
        if (!this.is(';')) {
            var declaration = this.forDeclaration();
            if (declaration !== null) {
                init.push(declaration);
            } else {
                for (;;) {
                    var exprToken = this.peek();
                    init.push(this.node('expr', exprToken, { expr: this.expression() }));
                    if (!this.accept(','))
                        break;
                }
            }
        }
        this.expect(';');
        var cond = this.is(';') ? null : this.expression();
        this.expect(';');
        var updates = [];
        if (!this.is(')')) {
            for (;;) {
                updates.push(this.expression());
                if (!this.accept(','))
                    break;
            }
        }
        this.expect(')');
        return this.node('for', token, { init: init, cond: cond, updates: updates, body: this.embeddedStatement() });
    };

    // The declaration in for (int i = 0, j = 1; ...).
    P.forDeclaration = function () {
        var token = this.peek();
        if (this.isWord('var') && this.is('(', 1)) {
            var deconstruction = this.attempt(function () {
                this.next();
                var designation = this.designation();
                this.expect('=');
                return this.node('deconstructDecl', token, { designation: designation, init: this.expression() });
            });
            if (deconstruction !== null)
                return deconstruction;
        }
        var self = this;
        var type = this.attempt(function () {
            var parsed = self.type();
            return self.peek().type === 'ident' && (self.is('=', 1) || self.is(',', 1) || self.is(';', 1)) ? parsed : null;
        });
        if (type === null)
            return null;
        return this.declarators(token, type);
    };

    // foreach (Type x in e), foreach (var (a, b) in e), foreach ((int a, int b) in e)
    P.foreachStatement = function (isAwait) {
        var token = this.expect('foreach');
        this.expect('(');
        var type = null, name = null, designation = null, deconstruct = null;
        var varToken = this.peek();
        if (this.isWord('var') && this.is('(', 1)) {
            this.next();
            designation = this.designation();
        } else if (this.is('(') && !this.is('in', 1)) {
            // (int a, int b) in e: a tuple of declarations.
            deconstruct = this.primary();
        } else {
            if (this.is('ref'))
                this.next();
            this.accept('readonly');
            type = this.type();
            name = this.identifier();
            if (type.k === 'tname' && type.name === 'var' && type.args === null)
                type = null;
        }
        if (!this.is('in'))
            this.error('CS1515', "'in' expected");
        this.next();
        var expr = this.expression();
        this.expect(')');
        return this.node('foreach', token, { type: type, name: name, designation: designation, deconstruct: deconstruct,
                                             expr: expr, body: this.embeddedStatement(), isAwait: isAwait,
                                             varLine: varToken.line });
    };

    P.switchStatement = function () {
        var token = this.expect('switch');
        var expr;
        // switch (a, b) is a tuple; switch (x) a parenthesized expression.
        var parenthesized = this.primary();
        expr = parenthesized.k === 'paren' ? parenthesized.expr : parenthesized;
        this.expect('{');
        var sections = [];
        while (!this.is('}')) {
            var sectionToken = this.peek();
            var labels = [];
            while (this.is('case') || this.is('default')) {
                var labelToken = this.next();
                if (labelToken.value === 'default') {
                    if (!this.is(':'))
                        this.error('CS1003', "Syntax error, ':' expected");
                    this.next();
                    labels.push(this.node('caseLabel', labelToken, { pattern: null, when: null }));
                    continue;
                }
                var pattern = this.pattern();
                var when = null;
                if (this.isWord('when')) {
                    this.next();
                    when = this.expression();
                }
                if (!this.is(':'))
                    this.error('CS1003', "Syntax error, ':' expected");
                this.next();
                labels.push(this.node('caseLabel', labelToken, { pattern: pattern, when: when }));
            }
            if (labels.length === 0)
                this.error('CS1525', "Invalid expression term '" + this.peek().text + "'");
            var statements = [];
            while (!this.is('case') && !this.is('default') && !this.is('}')) {
                if (this.peek().type === 'eof')
                    this.expected('}');
                statements.push(this.statement(false));
            }
            sections.push(this.node('section', sectionToken, { labels: labels, statements: statements }));
        }
        this.expect('}');
        return this.node('switch', token, { expr: expr, sections: sections });
    };

    P.gotoStatement = function () {
        var token = this.expect('goto');
        var node;
        if (this.is('case')) {
            this.next();
            node = this.node('goto', token, { kind: 'case', expr: this.expression() });
        } else if (this.is('default')) {
            this.next();
            node = this.node('goto', token, { kind: 'default' });
        } else {
            node = this.node('goto', token, { kind: 'label', label: this.identifier() });
        }
        this.expect(';');
        return node;
    };

    P.tryStatement = function () {
        var token = this.expect('try');
        var block = this.block();
        var catches = [];
        while (this.is('catch')) {
            var catchToken = this.next();
            var type = null, name = null, filter = null;
            if (this.accept('(')) {
                type = this.type();
                if (this.peek().type === 'ident')
                    name = this.identifier();
                this.expect(')');
            }
            if (this.isWord('when')) {
                this.next();
                this.expect('(');
                filter = this.expression();
                this.expect(')');
            }
            catches.push(this.node('catch', catchToken, { type: type, name: name, filter: filter, block: this.block() }));
        }
        var fin = null;
        if (this.accept('finally'))
            fin = this.block();
        if (catches.length === 0 && fin === null)
            this.error('CS1524', 'Expected catch or finally');
        return this.node('try', token, { block: block, catches: catches, fin: fin });
    };

    // using (resource) statement, using (var x = ...) statement, using var x = ...;
    P.usingStatement = function (isAwait) {
        var token = this.expect('using');
        if (!this.is('(')) {
            // A using declaration: the rest of the block disposes it.
            var declToken = this.peek();
            var type = this.type();
            var decl = this.declarators(declToken, type);
            this.expect(';');
            decl.isUsing = true;
            decl.isAwaitUsing = isAwait;
            return decl;
        }
        this.next();
        var resource = null, declaration = null;
        var startToken = this.peek();
        var declType = this.attempt(function () {
            var parsed = this.type();
            return this.peek().type === 'ident' && this.is('=', 1) ? parsed : null;
        });
        if (declType !== null)
            declaration = this.declarators(startToken, declType);
        else
            resource = this.expression();
        this.expect(')');
        return this.node('using', token, { declaration: declaration, resource: resource, body: this.embeddedStatement(),
                                           isAwait: isAwait });
    };
})(globalThis);
