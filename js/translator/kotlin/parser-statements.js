// Kotlin: parsing of statements - blocks, declarations in code, loops,
// assignments. An assignment is a statement, not an expression.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Kt = T.kotlin;
    var Parser = Kt.Parser;
    if (Parser.prototype.statement)
        return;

    var ASSIGN_OPS = { '=': true, '+=': true, '-=': true, '*=': true, '/=': true, '%=': true };

    // A statement; top - a statement of the unit (declarations are top-level ones).
    Parser.prototype.statement = function (top) {
        var token = this.peek();
        if (token.type === 'label') {
            this.next();
            var labeled = this.statement(false);
            labeled.label = token.value;
            labeled.labelLine = token.line;
            return labeled;
        }
        if (this.atDeclaration())
            return this.declaration(top ? 'top' : 'local');
        // Annotations before an expression: @Suppress("x") foo().
        while (this.isOp('@'))
            this.annotation();
        if (this.isKeyword('for'))
            return this.forStatement();
        if (this.isKeyword('while'))
            return this.whileStatement();
        if (this.isKeyword('do'))
            return this.doWhileStatement();
        var expression = this.expression();
        var op = this.peek();
        if (op.type === 'op' && ASSIGN_OPS[op.value] === true && !op.newline) {
            this.next();
            var value = this.expression();
            return this.node('assign', token, { op: op.value, target: expression, value: value, opLine: op.line, opColumn: op.column });
        }
        return expression;
    };

    // { statements }
    Parser.prototype.block = function () {
        var token = this.expectOp('{');
        var statements = this.statementsUntilBrace();
        return this.node('block', token, { statements: statements, endLine: this.peek(-1).line });
    };

    // Statements up to "}" (consumed).
    Parser.prototype.statementsUntilBrace = function () {
        var statements = [];
        for (;;) {
            this.skipSemicolons();
            if (this.isOp('}')) {
                this.next();
                return statements;
            }
            if (this.peek().type === 'eof')
                this.syntaxError("Expecting '}'");
            statements.push(this.statement(false));
            this.endOfStatement();
        }
    };

    // The body of if, when, a loop: a block or one statement.
    Parser.prototype.controlBody = function () {
        if (this.isOp('{'))
            return this.block();
        if (this.isOp(';'))
            return this.node('block', this.peek(), { statements: [] });
        var token = this.peek();
        var statement = this.statement(false);
        return this.node('block', token, { statements: [statement], single: true });
    };

    Parser.prototype.forStatement = function () {
        var token = this.next();
        this.expectOp('(');
        while (this.isOp('@'))
            this.annotation();
        var name = null, destructure = null, varType = null;
        var varToken = this.peek();
        if (this.isOp('('))
            destructure = this.destructuringNames();
        else
            name = this.name('Expecting a variable name');
        if (this.acceptOp(':'))
            varType = this.type();
        this.expectKeyword('in');
        var iterable = this.expression();
        this.expectOp(')');
        var body = this.controlBody();
        return this.node('for', token, { name: name, destructure: destructure, varType: varType, varLine: varToken.line,
                                         iterable: iterable, body: body, label: null });
    };

    Parser.prototype.whileStatement = function () {
        var token = this.next();
        this.expectOp('(');
        var cond = this.expression();
        this.expectOp(')');
        var body = this.controlBody();
        return this.node('while', token, { cond: cond, body: body, label: null });
    };

    Parser.prototype.doWhileStatement = function () {
        var token = this.next();
        var body = this.isKeyword('while') ? this.node('block', token, { statements: [] }) : this.controlBody();
        this.skipSemicolons();
        this.expectKeyword('while');
        this.expectOp('(');
        var cond = this.expression();
        this.expectOp(')');
        return this.node('dowhile', token, { cond: cond, body: body, label: null });
    };
})(globalThis);
