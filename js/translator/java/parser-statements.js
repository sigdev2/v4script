// Java: parsing statements.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Java = T.java;
    var P = Java.Parser.prototype;
    if (P.block)
        return;

    P.block = function () {
        var tok = this.expect('{');
        var statements = [];
        while (!this.is('}')) {
            if (this.peek().type === 'eof')
                this.fail('reached end of file while parsing');
            statements.push(this.blockStatement());
        }
        var end = this.next();
        return this.node('block', tok, { statements: statements, endLine: end.line });
    };

    // A local variable declaration: a type and a name (not an expression).
    P.localVariable = function (mods, tok) {
        var self = this;
        return this.attempt(function () {
            var type = self.type();
            if (self.peek().type !== 'ident')
                self.fail('not a declaration');
            var name = self.identifier();
            if (!(self.is('=') || self.is(';') || self.is(',') || self.is('[') || self.is(':')))
                self.fail('not a declaration');
            return { type: type, name: name, mods: mods, tok: tok };
        });
    };
    // A block statement: a local class, a variable or a statement.
    P.blockStatement = function () {
        var tok = this.peek();
        var start = this.index;
        var mods = this.modifiers();
        if (this.startsClass())
            return this.node('localclass', tok, { decl: this.classDeclaration(mods, tok) });
        var declaration = this.localVariable(mods, tok);
        if (declaration !== null && !this.is(':')) {
            var statement = this.node('local', tok, { mods: mods, type: declaration.type,
                                                      vars: this.variableDeclarators(declaration.type, declaration.name) });
            this.expect(';');
            return statement;
        }
        this.index = start;
        if (mods.final || mods.annotations.length > 0)
            this.fail('<identifier> expected');
        return this.statement();
    };
    P.statement = function () {
        var tok = this.peek();
        if (tok.type === 'op' && tok.value === '{')
            return this.block();
        if (tok.type === 'op' && tok.value === ';') {
            this.next();
            return this.node('empty', tok, {});
        }
        if (tok.type === 'ident' && this.is(':', 1)) {
            this.next();
            this.next();
            return this.node('labeled', tok, { label: tok.value, body: this.statement() });
        }
        if (tok.type === 'ident' && tok.value === 'yield' && !this.is('=', 1) && !this.is('(', 1) && !this.is('.', 1)) {
            this.next();
            var yielded = this.expression();
            this.expect(';');
            return this.node('yield', tok, { expr: yielded });
        }
        if (tok.type !== 'keyword')
            return this.expressionStatement();
        switch (tok.value) {
        case 'if':
            return this.ifStatement();
        case 'while': {
            this.next();
            var condition = this.parenthesized();
            return this.node('while', tok, { cond: condition, body: this.statement() });
        }
        case 'do': {
            this.next();
            var body = this.statement();
            this.expect('while');
            var test = this.parenthesized();
            this.expect(';');
            return this.node('do', tok, { body: body, cond: test });
        }
        case 'for':
            return this.forStatement();
        case 'switch': {
            var switchNode = this.switchNode();
            switchNode.k = 'switch';
            return switchNode;
        }
        case 'try':
            return this.tryStatement();
        case 'synchronized': {
            this.next();
            var lock = this.parenthesized();
            return this.node('sync', tok, { lock: lock, body: this.block() });
        }
        }
        return this.simpleKeywordStatement(tok);
    };
    P.simpleKeywordStatement = function (tok) {
        switch (tok.value) {
        case 'return': {
            this.next();
            var value = this.is(';') ? null : this.expression();
            this.expect(';');
            return this.node('return', tok, { expr: value });
        }
        case 'break':
        case 'continue': {
            this.next();
            var label = this.peek().type === 'ident' ? this.identifier() : null;
            this.expect(';');
            return this.node(tok.value, tok, { label: label });
        }
        case 'throw': {
            this.next();
            var thrown = this.expression();
            this.expect(';');
            return this.node('throw', tok, { expr: thrown });
        }
        case 'assert': {
            this.next();
            var assertion = this.expression();
            var message = this.accept(':') ? this.expression() : null;
            this.expect(';');
            return this.node('assert', tok, { cond: assertion, message: message });
        }
        case 'else':
            this.fail("'else' without 'if'");
            break;
        case 'case':
        case 'default':
            this.fail('orphaned ' + tok.value);
            break;
        case 'catch':
        case 'finally':
            this.fail("'" + tok.value + "' without 'try'");
            break;
        }
        return this.expressionStatement();
    };

    P.expressionStatement = function () {
        var tok = this.peek();
        var expr = this.expression();
        var kind = expr.k;
        if (!(kind === 'assign' || kind === 'prefix' || kind === 'postfix' || kind === 'call' || kind === 'new'))
            expr.statementValue = true;
        // As in jshell: an expression at the end of a unit may omit ";".
        if (!(this.source === '' && this.peek().type === 'eof'))
            this.expect(';');
        return this.node('expr', tok, { expr: expr });
    };

    P.parenthesized = function () {
        this.expect('(');
        var expr = this.expression();
        this.expect(')');
        return expr;
    };
    P.ifStatement = function () {
        var tok = this.expect('if');
        var condition = this.parenthesized();
        var then = this.statement();
        var otherwise = this.accept('else') ? this.statement() : null;
        return this.node('if', tok, { cond: condition, then: then, otherwise: otherwise });
    };

    // for (init; cond; update) or for (Type x : collection).
    P.forStatement = function () {
        var tok = this.expect('for');
        this.expect('(');
        var start = this.index;
        var mods = this.modifiers();
        var declaration = this.localVariable(mods, tok);
        if (declaration !== null && this.accept(':')) {
            var iterable = this.expression();
            this.expect(')');
            return this.node('foreach', tok, { mods: mods, type: declaration.type, name: declaration.name,
                                               iterable: iterable, body: this.statement() });
        }
        var init = [];
        if (declaration !== null) {
            init.push(this.node('local', tok, { mods: mods, type: declaration.type,
                                                vars: this.variableDeclarators(declaration.type, declaration.name) }));
        } else {
            this.index = start;
            while (!this.is(';')) {
                var initTok = this.peek();
                init.push(this.node('expr', initTok, { expr: this.expression() }));
                if (!this.accept(','))
                    break;
            }
        }
        this.expect(';');
        var condition = this.is(';') ? null : this.expression();
        this.expect(';');
        var update = [];
        while (!this.is(')')) {
            var updateTok = this.peek();
            update.push(this.node('expr', updateTok, { expr: this.expression() }));
            if (!this.accept(','))
                break;
        }
        this.expect(')');
        return this.node('for', tok, { init: init, cond: condition, update: update, body: this.statement() });
    };
    // switch (a statement and an expression): case with ":" or "->".
    P.switchNode = function () {
        var tok = this.expect('switch');
        var selector = this.parenthesized();
        this.expect('{');
        var cases = [];
        var arrow = null;
        while (!this.accept('}')) {
            var caseTok = this.peek();
            var entry = this.node('case', caseTok, { labels: [], isDefault: false, guard: null, body: null });
            if (this.accept('default')) {
                entry.isDefault = true;
            } else {
                this.expect('case');
                do {
                    if (this.accept('default')) {
                        entry.isDefault = true;
                        continue;
                    }
                    entry.labels.push(this.caseLabel());
                } while (this.accept(','));
                if (this.isIdent(0, 'when')) {
                    this.next();
                    entry.guard = this.expression();
                }
            }
            var isArrow = !!this.accept('->');
            if (!isArrow)
                this.expect(':');
            if (arrow !== null && arrow !== isArrow)
                this.fail('different case kinds used in the switch');
            arrow = isArrow;
            if (isArrow) {
                if (this.is('{')) {
                    entry.body = this.block();
                } else if (this.is('throw')) {
                    entry.body = this.statement();
                } else {
                    var bodyTok = this.peek();
                    entry.body = this.node('expr', bodyTok, { expr: this.expression() });
                    this.expect(';');
                }
            } else {
                entry.body = [];
                while (!this.is('case') && !this.is('default') && !this.is('}')) {
                    if (this.peek().type === 'eof')
                        this.fail('reached end of file while parsing');
                    entry.body.push(this.blockStatement());
                }
                // default: ... in the middle and "default ->" differ from the modifier.
                if (this.is('default') && !(this.is(':', 1) || this.is('->', 1)))
                    entry.body.push(this.blockStatement());
            }
            cases.push(entry);
        }
        return this.node('switch', tok, { selector: selector, cases: cases, arrow: !!arrow });
    };

    // A case label: a pattern or a constant.
    P.caseLabel = function () {
        var pattern = this.attempt(function () { return this.pattern(); });
        if (pattern !== null)
            return pattern;
        return this.ternary();
    };

    // A pattern: "Type name" ("var name" inside a record pattern) or a
    // record pattern "Type(patterns)" (Java 21).
    P.pattern = function () {
        var tok = this.peek();
        this.modifiers();
        var type = this.type();
        if (this.is('('))
            return this.recordPatternRest(type, tok);
        var name = this.identifier();
        return this.node('pattern', tok, { type: type, name: name });
    };

    P.recordPatternRest = function (type, tok) {
        this.expect('(');
        var patterns = [];
        if (!this.is(')')) {
            do
                patterns.push(this.pattern());
            while (this.accept(','));
        }
        this.expect(')');
        return this.node('recordpattern', tok, { type: type, patterns: patterns });
    };
    P.tryStatement = function () {
        var tok = this.expect('try');
        var resources = [];
        if (this.accept('(')) {
            while (!this.is(')')) {
                var resourceTok = this.peek();
                var mods = this.modifiers();
                var declaration = this.localVariable(mods, resourceTok);
                if (declaration !== null) {
                    this.expect('=');
                    resources.push(this.node('resource', resourceTok, { type: declaration.type, name: declaration.name,
                                                                        init: this.expression() }));
                } else {
                    resources.push(this.node('resource', resourceTok, { type: null, name: null, init: this.expression() }));
                }
                if (!this.accept(';'))
                    break;
            }
            this.expect(')');
        }
        var body = this.block();
        var catches = [];
        while (this.is('catch')) {
            var catchTok = this.next();
            this.expect('(');
            this.modifiers();
            var types = [this.type()];
            while (this.accept('|'))
                types.push(this.type());
            var name = this.identifier();
            this.expect(')');
            catches.push(this.node('catch', catchTok, { types: types, name: name, body: this.block() }));
        }
        var finalizer = this.accept('finally') ? this.block() : null;
        if (catches.length === 0 && finalizer === null && resources.length === 0)
            this.fail("'try' without 'catch', 'finally' or resource declarations", tok);
        return this.node('try', tok, { resources: resources, body: body, catches: catches, finalizer: finalizer });
    };
})(globalThis);
