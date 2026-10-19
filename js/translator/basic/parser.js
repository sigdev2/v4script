// BASIC: parsing the tokens into a tree. A program is module-level
// statements (with labels), SUB and FUNCTION procedures, DEF FN, TYPE
// records and DATA values. Names are not resolved here: "a(1)", "a.b",
// "f x" are ref nodes; the translation decides whether it is an array, a
// function, a record field or a member of a JavaScript object.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Basic = T.basic;
    if (Basic.parse)
        return;

    var CompileError = T.CompileError;
    var SUFFIXES = Basic.SUFFIXES;

    var TYPE_WORDS = { INTEGER: 'i', LONG: 'l', SINGLE: 'f', DOUBLE: 'd', STRING: 's', OBJECT: 'o' };
    Basic.TYPE_WORDS = TYPE_WORDS;

    // Precedence of the binary operators of QBasic (higher binds tighter).
    var BINARY = {
        IMP: 1, EQV: 2, XOR: 3, OR: 4, AND: 5,
        '=': 7, '<>': 7, '<': 7, '>': 7, '<=': 7, '>=': 7,
        '+': 8, '-': 8, MOD: 9, '\\': 10, '*': 11, '/': 11
    };
    var NOT_LEVEL = 6;

    // Words that end a statement list (checked at the start of a statement).
    var BLOCK_ENDS = { ELSE: 1, ELSEIF: 1, LOOP: 1, NEXT: 1, WEND: 1, CASE: 1 };

    function Parser(tokens, source) {
        T.Parser.call(this, tokens, source);
        this.program = { items: [], procedures: [], types: [], declares: [] };
        // The procedure being parsed (null - the module level).
        this.inProcedure = null;
        this.inlineIf = 0;
        this.dataItems = [];
        // DEFINT and the like at the module level: a procedure takes those before it.
        this.moduleDefs = [];
    }
    Parser.prototype = Object.create(T.Parser.prototype);

    Parser.prototype.fail = function (message, token) {
        token = token || this.peek();
        throw new CompileError(message, token.line, token.column, token.source);
    };

    Parser.prototype.isName = function (offset) {
        return this.peek(offset).type === 'name';
    };

    Parser.prototype.isKeyword = function (word, offset) {
        var token = this.peek(offset);
        return token.type === 'keyword' && token.value === word;
    };

    Parser.prototype.acceptKeyword = function (word) {
        return this.isKeyword(word) ? this.next() : null;
    };

    Parser.prototype.expectKeyword = function (word) {
        if (!this.isKeyword(word))
            this.fail('Expected: ' + word);
        return this.next();
    };

    // The end of a statement: ":", a line break, the end of the text; in a
    // single-line IF also ELSE.
    Parser.prototype.atStatementEnd = function () {
        var token = this.peek();
        return token.type === 'newline' || token.type === 'eof' || (token.type === 'op' && token.value === ':') ||
            (this.inlineIf > 0 && token.type === 'keyword' && token.value === 'ELSE');
    };

    Parser.prototype.expectStatementEnd = function () {
        if (!this.atStatementEnd())
            this.fail('Expected: end-of-statement');
    };

    Parser.prototype.node = function (kind, token, fields) {
        var node = fields || {};
        node.k = kind;
        node.line = token.line;
        node.column = token.column;
        node.source = token.source;
        return node;
    };

    // --- Program

    Parser.prototype.parseProgram = function () {
        var program = this.program;
        program.items = this.statements(function () { return false; }, 'module');
        if (this.peek().type !== 'eof')
            this.fail('Syntax error');
        program.data = this.dataItems;
        program.moduleDefs = this.moduleDefs;
        return program;
    };

    // A list of statements up to the word on which isEnd() is true (checked
    // at the start of every statement).
    Parser.prototype.statements = function (isEnd, context) {
        var list = [];
        for (;;) {
            var token = this.peek();
            if (token.type === 'newline' || (token.type === 'op' && token.value === ':')) {
                this.next();
                continue;
            }
            if (token.type === 'eof')
                return list;
            if (token.type === 'meta') {
                this.next();
                continue;
            }
            if (token.start && this.label(list))
                continue;
            if (isEnd())
                return list;
            var statement = this.statement(context);
            if (statement !== null)
                list.push(statement);
            this.expectStatementEnd();
        }
    };

    // A label at the start of a line: a number or "name:".
    Parser.prototype.label = function (list) {
        var token = this.peek();
        if (token.type === 'number') {
            if (token.kind !== 'i' && token.kind !== 'l' || token.value < 0 || /[.eEdD!#%&]/.test(token.text))
                this.fail('Syntax error');
            this.next();
            list.push(this.node('label', token, { name: String(token.value), number: token.value,
                                                  dataIndex: this.dataItems.length }));
            return true;
        }
        if (token.type === 'name' && token.suffix === '' && this.peek(1).type === 'op' && this.peek(1).value === ':') {
            this.next();
            this.next();
            list.push(this.node('label', token, { name: token.value, number: null, dataIndex: this.dataItems.length }));
            return true;
        }
        return false;
    };

    Parser.prototype.labelReference = function () {
        var token = this.peek();
        if (token.type === 'number' && (token.kind === 'i' || token.kind === 'l') && token.value >= 0) {
            this.next();
            return { name: String(token.value), line: token.line, column: token.column, source: token.source };
        }
        if (token.type === 'name' && token.suffix === '') {
            this.next();
            return { name: token.value, line: token.line, column: token.column, source: token.source };
        }
        this.fail('Expected: label or line number');
    };

    // --- Statements

    Parser.prototype.statement = function (context) {
        var token = this.peek();
        if (token.type === 'data') {
            this.next();
            var first = this.dataItems.length;
            var self = this;
            token.value.forEach(function (item) {
                self.dataItems.push({ value: item.value, quoted: item.quoted, line: token.line, column: item.column,
                                      source: token.source });
            });
            return this.node('data', token, { first: first, count: token.value.length });
        }
        if (token.type === 'op' && token.value === '?') {
            this.next();
            return this.print(token, 'PRINT');
        }
        if (token.type === 'name')
            return this.assignmentOrCall();
        if (token.type !== 'keyword')
            this.fail('Expected: statement');
        var word = token.value;
        var method = STATEMENTS[word];
        if (method === undefined)
            this.fail(BLOCK_ENDS[word] !== undefined ? this.unmatched(word) : 'Expected: statement');
        this.next();
        return method.call(this, token, context);
    };

    Parser.prototype.unmatched = function (word) {
        switch (word) {
        case 'NEXT': return 'NEXT without FOR';
        case 'LOOP': return 'LOOP without DO';
        case 'WEND': return 'WEND without WHILE';
        case 'ELSE': return 'ELSE without IF';
        case 'ELSEIF': return 'ELSEIF without IF';
        case 'CASE': return 'CASE without SELECT CASE';
        }
        return 'Syntax error';
    };

    Parser.prototype.assignmentOrCall = function () {
        var token = this.peek();
        var target = this.reference(true);
        if (this.accept('=')) {
            var value = this.expression();
            return this.node('let', token, { target: target, value: value });
        }
        // A SUB call without CALL: "name arguments" or "object.method arguments".
        var args = [];
        if (target.args !== null && target.chain.length === 0 && !this.atStatementEnd())
            this.fail('Expected: =');
        if (!this.atStatementEnd()) {
            do {
                args.push(this.argument());
            } while (this.accept(','));
        }
        return this.node('call', token, { target: target, args: args, explicit: false });
    };

    var STATEMENTS = {};

    STATEMENTS.LET = function (token) {
        var target = this.reference(true);
        this.expect('=');
        return this.node('let', token, { target: target, value: this.expression() });
    };

    STATEMENTS.CALL = function (token) {
        if (!this.isName())
            this.fail('Expected: identifier');
        var target = this.reference(false);
        var args = [];
        if (this.accept('(')) {
            if (!this.accept(')')) {
                do {
                    args.push(this.argument());
                } while (this.accept(','));
                this.expect(')');
            }
        }
        return this.node('call', token, { target: target, args: args, explicit: true });
    };

    STATEMENTS.PRINT = function (token) {
        return this.print(token, 'PRINT');
    };
    STATEMENTS.LPRINT = function (token) {
        return this.print(token, 'LPRINT');
    };

    Parser.prototype.channel = function () {
        if (!this.accept('#'))
            return null;
        var channel = this.expression();
        this.expect(',');
        return channel;
    };

    Parser.prototype.print = function (token, word) {
        var node = this.node('print', token, { channel: word === 'PRINT' ? this.channel() : null, using: null, items: [] });
        if (this.acceptKeyword('USING')) {
            node.using = this.expression();
            this.expect(';');
        }
        while (!this.atStatementEnd()) {
            if (this.is(';') || this.is(',')) {
                node.items.push({ k: 'sep', value: this.next().value });
                continue;
            }
            var itemToken = this.peek();
            if (itemToken.type === 'name' && (itemToken.value === 'tab' || itemToken.value === 'spc') &&
                itemToken.suffix === '' && this.peek(1).type === 'op' && this.peek(1).value === '(') {
                this.next();
                this.next();
                var count = this.expression();
                this.expect(')');
                node.items.push(this.node(itemToken.value, itemToken, { arg: count }));
                continue;
            }
            node.items.push({ k: 'expr', expr: this.expression() });
        }
        return node;
    };

    STATEMENTS.WRITE = function (token) {
        var node = this.node('write', token, { channel: null, items: [] });
        if (this.accept('#')) {
            node.channel = this.expression();
            if (!this.accept(','))
                return node;
        }
        if (!this.atStatementEnd()) {
            do {
                node.items.push(this.expression());
            } while (this.accept(',') || this.accept(';'));
        }
        return node;
    };

    STATEMENTS.INPUT = function (token) {
        return this.input(token, false);
    };

    STATEMENTS.LINE = function (token) {
        if (this.acceptKeyword('INPUT'))
            return this.input(token, true);
        return this.graphicsLine(token);
    };

    Parser.prototype.input = function (token, line) {
        var node = this.node('input', token, { lineInput: line, channel: null, prompt: null, question: true, keepLine: false,
                                               targets: [] });
        if (this.accept('#')) {
            node.channel = this.expression();
            this.expect(',');
        } else {
            if (this.accept(';'))
                node.keepLine = true;
            if (this.peek().type === 'string') {
                node.prompt = this.next().value;
                if (this.accept(','))
                    node.question = false;
                else
                    this.expect(';');
                if (line)
                    node.question = false;
            } else if (line) {
                node.question = false;
            }
        }
        do {
            node.targets.push(this.reference(true));
        } while (!line && this.accept(','));
        return node;
    };

    STATEMENTS.IF = function (token) {
        var condition = this.expression();
        if (this.acceptKeyword('GOTO')) {
            var label = this.labelReference();
            var jump = this.node('goto', token, { label: label });
            return this.inlineTail(token, condition, [jump]);
        }
        this.expectKeyword('THEN');
        var next = this.peek();
        if (next.type === 'newline' || next.type === 'eof')
            return this.blockIf(token, condition);
        if (next.type === 'number')
            return this.inlineTail(token, condition, [this.node('goto', next, { label: this.labelReference() })]);
        return this.inlineTail(token, condition, this.inlineStatements());
    };

    // The statements of a single-line IF up to ELSE or the end of the line.
    Parser.prototype.inlineStatements = function () {
        var list = [];
        ++this.inlineIf;
        try {
            for (;;) {
                var statement = this.statement('inline');
                if (statement !== null)
                    list.push(statement);
                if (this.accept(':')) {
                    if (this.atStatementEnd())
                        break;
                    continue;
                }
                break;
            }
        } finally {
            --this.inlineIf;
        }
        return list;
    };

    Parser.prototype.inlineTail = function (token, condition, then) {
        var otherwise = null;
        if (this.acceptKeyword('ELSE')) {
            var next = this.peek();
            if (next.type === 'number')
                otherwise = [this.node('goto', next, { label: this.labelReference() })];
            else
                otherwise = this.inlineStatements();
        }
        return this.node('if', token, { branches: [{ condition: condition, body: then }], otherwise: otherwise });
    };

    Parser.prototype.blockIf = function (token, condition) {
        var self = this;
        var branches = [];
        var otherwise = null;
        var isEnd = function () {
            return self.isKeyword('ELSEIF') || self.isKeyword('ELSE') || (self.isKeyword('END') && self.isKeyword('IF', 1));
        };
        var body = this.statements(isEnd, 'block');
        branches.push({ condition: condition, body: body });
        for (;;) {
            if (this.peek().type === 'eof')
                this.fail('Block IF without END IF', token);
            if (this.acceptKeyword('ELSEIF')) {
                var elseCondition = this.expression();
                this.expectKeyword('THEN');
                branches.push({ condition: elseCondition, body: this.statements(isEnd, 'block') });
                continue;
            }
            if (this.acceptKeyword('ELSE')) {
                if (otherwise !== null)
                    this.fail('Block IF without END IF', token);
                otherwise = this.statements(isEnd, 'block');
                continue;
            }
            this.expectKeyword('END');
            this.expectKeyword('IF');
            break;
        }
        return this.node('if', token, { branches: branches, otherwise: otherwise });
    };

    STATEMENTS.FOR = function (token) {
        if (!this.isName())
            this.fail('Expected: variable');
        var variable = this.reference(false);
        if (variable.args !== null || variable.chain.length > 0)
            this.fail('Expected: simple variable');
        this.expect('=');
        var from = this.expression();
        this.expectKeyword('TO');
        var to = this.expression();
        var step = this.acceptKeyword('STEP') ? this.expression() : null;
        var self = this;
        var body = this.statements(function () { return self.isKeyword('NEXT'); }, 'block');
        if (!this.isKeyword('NEXT'))
            this.fail('FOR without NEXT', token);
        var next = this.next();
        if (this.isName()) {
            var name = this.next();
            if (name.value !== variable.name || name.suffix !== variable.suffix && name.suffix !== '' && variable.suffix !== '')
                this.fail('NEXT without FOR', name);
            // "NEXT j, i" closes the outer loop too: the comma becomes ": NEXT".
            if (this.is(',')) {
                var comma = this.peek();
                this.tokens.splice(this.index, 0, { type: 'op', value: ':', text: ':', line: comma.line,
                                                    column: comma.column, source: comma.source, start: false });
                comma.type = 'keyword';
                comma.value = 'NEXT';
                comma.text = 'NEXT';
            }
        }
        return this.node('for', token, { variable: variable, from: from, to: to, step: step, body: body, nextLine: next.line,
                                         nextSource: next.source });
    };

    STATEMENTS.DO = function (token) {
        var pre = null;
        if (this.isKeyword('WHILE') || this.isKeyword('UNTIL'))
            pre = { until: this.next().value === 'UNTIL', condition: this.expression() };
        var self = this;
        var body = this.statements(function () { return self.isKeyword('LOOP'); }, 'block');
        if (!this.isKeyword('LOOP'))
            this.fail('DO without LOOP', token);
        var loop = this.next();
        var post = null;
        if (this.isKeyword('WHILE') || this.isKeyword('UNTIL')) {
            if (pre !== null)
                this.fail('Expected: end-of-statement');
            post = { until: this.next().value === 'UNTIL', condition: this.expression() };
        }
        return this.node('do', token, { pre: pre, post: post, body: body, loopLine: loop.line, loopSource: loop.source });
    };

    STATEMENTS.WHILE = function (token) {
        var condition = this.expression();
        var self = this;
        var body = this.statements(function () { return self.isKeyword('WEND'); }, 'block');
        if (!this.isKeyword('WEND'))
            this.fail('WHILE without WEND', token);
        var wend = this.next();
        return this.node('do', token, { pre: { until: false, condition: condition }, post: null, body: body,
                                        loopLine: wend.line, loopSource: wend.source });
    };

    STATEMENTS.SELECT = function (token) {
        this.expectKeyword('CASE');
        var subject = this.expression();
        this.expectStatementEnd();
        var self = this;
        var cases = [];
        var otherwise = null;
        var isEnd = function () {
            return self.isKeyword('CASE') || (self.isKeyword('END') && self.isKeyword('SELECT', 1));
        };
        var before = this.statements(isEnd, 'block');
        if (before.length > 0)
            this.fail('Statements/labels illegal between SELECT CASE and CASE', before[0]);
        for (;;) {
            if (this.peek().type === 'eof')
                this.fail('SELECT without END SELECT', token);
            if (this.isKeyword('END')) {
                this.next();
                this.expectKeyword('SELECT');
                break;
            }
            var caseToken = this.expectKeyword('CASE');
            if (this.acceptKeyword('ELSE')) {
                if (otherwise !== null)
                    this.fail('Syntax error', caseToken);
                otherwise = this.statements(isEnd, 'block');
                continue;
            }
            var tests = [];
            do {
                if (this.acceptKeyword('IS')) {
                    var op = this.peek();
                    if (op.type !== 'op' || ['=', '<>', '<', '>', '<=', '>='].indexOf(op.value) < 0)
                        this.fail('Expected: relational operator');
                    this.next();
                    tests.push({ k: 'is', op: op.value, value: this.expression() });
                    continue;
                }
                var first = this.expression();
                if (this.acceptKeyword('TO'))
                    tests.push({ k: 'range', from: first, to: this.expression() });
                else
                    tests.push({ k: 'is', op: '=', value: first });
            } while (this.accept(','));
            cases.push({ tests: tests, body: this.statements(isEnd, 'block'), line: caseToken.line, source: caseToken.source });
        }
        return this.node('select', token, { subject: subject, cases: cases, otherwise: otherwise });
    };

    STATEMENTS.GOTO = function (token) {
        return this.node('goto', token, { label: this.labelReference() });
    };

    STATEMENTS.GOSUB = function (token) {
        return this.node('gosub', token, { label: this.labelReference() });
    };

    STATEMENTS.RETURN = function (token) {
        return this.node('return', token, { label: this.atStatementEnd() ? null : this.labelReference() });
    };

    STATEMENTS.ON = function (token) {
        if (this.acceptKeyword('ERROR')) {
            this.expectKeyword('GOTO');
            var target = this.peek();
            if (target.type === 'number' && target.value === 0) {
                this.next();
                return this.node('onerror', token, { label: null });
            }
            return this.node('onerror', token, { label: this.labelReference() });
        }
        if (this.isKeyword('TIMER') || this.isKeyword('KEY') || this.isKeyword('PLAY') || this.isKeyword('COM') ||
            this.isKeyword('PEN') || this.isKeyword('STRIG'))
            this.fail('Advanced feature unavailable');
        var selector = this.expression();
        var gosub = false;
        if (this.acceptKeyword('GOSUB'))
            gosub = true;
        else
            this.expectKeyword('GOTO');
        var labels = [];
        do {
            labels.push(this.labelReference());
        } while (this.accept(','));
        return this.node('ongoto', token, { selector: selector, labels: labels, gosub: gosub });
    };

    STATEMENTS.RESUME = function (token) {
        if (this.acceptKeyword('NEXT'))
            return this.node('resume', token, { next: true, label: null });
        if (this.atStatementEnd())
            return this.node('resume', token, { next: false, label: null });
        var target = this.peek();
        if (target.type === 'number' && target.value === 0) {
            this.next();
            return this.node('resume', token, { next: false, label: null });
        }
        return this.node('resume', token, { next: false, label: this.labelReference() });
    };

    STATEMENTS.ERROR = function (token) {
        return this.node('error', token, { code: this.expression() });
    };

    STATEMENTS.EXIT = function (token) {
        var what = this.peek();
        if (what.type !== 'keyword' || ['FOR', 'DO', 'SUB', 'FUNCTION', 'DEF'].indexOf(what.value) < 0)
            this.fail('Expected: DO or FOR or SUB or FUNCTION or DEF');
        this.next();
        return this.node('exit', token, { what: what.value });
    };

    STATEMENTS.END = function (token, context) {
        if (this.atStatementEnd())
            return this.node('end', token);
        var what = this.peek();
        if (what.type === 'keyword' && ['IF', 'SELECT', 'SUB', 'FUNCTION', 'DEF', 'TYPE'].indexOf(what.value) >= 0) {
            var messages = { IF: 'END IF without block IF', SELECT: 'END SELECT without SELECT', SUB: 'END SUB without SUB',
                             FUNCTION: 'END FUNCTION without FUNCTION', DEF: 'END DEF without DEF',
                             TYPE: 'END TYPE without TYPE' };
            this.fail(messages[what.value], token);
        }
        this.fail('Expected: end-of-statement');
    };

    STATEMENTS.STOP = function (token) {
        return this.node('end', token);
    };

    STATEMENTS.SYSTEM = function (token) {
        return this.node('end', token);
    };

    // --- Procedures

    Parser.prototype.parameters = function () {
        var params = [];
        if (!this.accept('('))
            return params;
        if (this.accept(')'))
            return params;
        do {
            var byval = !!this.acceptKeyword('BYVAL');
            var name = this.peek();
            if (name.type !== 'name' || name.value.indexOf('.') >= 0)
                this.fail('Expected: identifier');
            this.next();
            var array = false;
            if (this.accept('(')) {
                this.expect(')');
                array = true;
            }
            var type = this.acceptKeyword('AS') ? this.typeName(false) : null;
            params.push({ name: name.value, display: name.name, suffix: name.suffix, array: array, type: type, byval: byval,
                          line: name.line, column: name.column, source: name.source });
        } while (this.accept(','));
        this.expect(')');
        return params;
    };

    // The type after AS: { base: 'i'|'l'|'f'|'d'|'s'|'o'|'record', length (STRING * n), record (name) }.
    Parser.prototype.typeName = function (allowFixed) {
        var token = this.peek();
        if (token.type === 'keyword' && TYPE_WORDS[token.value] !== undefined) {
            this.next();
            var type = { base: TYPE_WORDS[token.value], length: null, record: null };
            if (type.base === 's' && this.accept('*')) {
                if (!allowFixed)
                    this.fail('Expected: , or )');
                var length = this.peek();
                if (length.type === 'number' && (length.kind === 'i' || length.kind === 'l') && length.value > 0) {
                    this.next();
                    type.length = length.value;
                } else if (length.type === 'name') {
                    this.next();
                    type.lengthConstant = length;
                } else {
                    this.fail('Expected: positive integer');
                }
            }
            return type;
        }
        if (token.type === 'keyword' && token.value === 'ANY') {
            this.next();
            return { base: 'any', length: null, record: null };
        }
        if (token.type === 'name' && token.suffix === '') {
            this.next();
            return { base: 'record', length: null, record: token.value, token: token };
        }
        this.fail('Expected: INTEGER or LONG or SINGLE or DOUBLE or STRING or type name');
    };

    Parser.prototype.procedureName = function (allowSuffix) {
        var token = this.peek();
        if (token.type !== 'name' || token.value.indexOf('.') >= 0 || (!allowSuffix && token.suffix !== ''))
            this.fail('Expected: identifier');
        return this.next();
    };

    Parser.prototype.procedureBody = function (token, word) {
        var self = this;
        var body = this.statements(function () {
            if (self.isKeyword('END') && self.isKeyword(word, 1))
                return true;
            if (self.isKeyword('SUB') || self.isKeyword('FUNCTION'))
                self.fail(word + ' without END ' + word, token);
            return false;
        }, 'procedure');
        if (!this.isKeyword('END'))
            this.fail(word + ' without END ' + word, token);
        var end = this.next();
        this.next();
        return { body: body, endLine: end.line };
    };

    Parser.prototype.procedure = function (token, context, kind) {
        if (context !== 'module')
            this.fail(kind + ' not allowed in control statements', token);
        if (this.inProcedure !== null)
            this.fail('Illegal in procedure', token);
        var name = this.procedureName(kind === 'FUNCTION');
        var params = this.parameters();
        var isStatic = !!this.acceptKeyword('STATIC');
        this.expectStatementEnd();
        var node = this.node(kind === 'SUB' ? 'sub' : 'function', token, {
            name: name.value, display: name.name, suffix: name.suffix, params: params, isStatic: isStatic, body: null,
            defs: this.moduleDefs.slice()
        });
        this.inProcedure = node;
        try {
            var parsed = this.procedureBody(token, kind);
            node.body = parsed.body;
            node.endLine = parsed.endLine;
        } finally {
            this.inProcedure = null;
        }
        this.program.procedures.push(node);
        return null;
    };

    STATEMENTS.SUB = function (token, context) {
        return this.procedure(token, context, 'SUB');
    };

    STATEMENTS.FUNCTION = function (token, context) {
        return this.procedure(token, context, 'FUNCTION');
    };

    STATEMENTS.DECLARE = function (token) {
        var kind = this.peek();
        if (!this.acceptKeyword('SUB') && !this.acceptKeyword('FUNCTION'))
            this.fail('Expected: SUB or FUNCTION');
        var name = this.procedureName(kind.value === 'FUNCTION');
        if (this.isKeyword('CDECL') || this.isKeyword('ALIAS'))
            this.fail('Advanced feature unavailable');
        var params = this.parameters();
        this.program.declares.push(this.node('declare', token, {
            kind: kind.value === 'SUB' ? 'sub' : 'function', name: name.value, suffix: name.suffix, params: params
        }));
        return null;
    };

    // DEF FNname[(parameters)] = expression, or several lines up to END DEF.
    STATEMENTS.DEF = function (token, context) {
        var name = this.peek();
        if (name.type === 'name' && name.value === 'seg' && name.suffix === '') {
            this.next();
            if (this.accept('='))
                this.expression();
            return null;
        }
        if (name.type !== 'name' || name.value.substring(0, 2) !== 'fn' || name.value.indexOf('.') >= 0)
            this.fail('Expected: FNname');
        if (context !== 'module' || this.inProcedure !== null)
            this.fail('Illegal in procedure', token);
        this.next();
        var params = this.parameters();
        var node = this.node('def', token, { name: name.value, display: name.name, suffix: name.suffix, params: params,
                                             expression: null, body: null, isStatic: false, defs: this.moduleDefs.slice() });
        if (this.accept('=')) {
            node.expression = this.expression();
            this.program.procedures.push(node);
            return null;
        }
        this.expectStatementEnd();
        this.inProcedure = node;
        try {
            var parsed = this.procedureBody(token, 'DEF');
            node.body = parsed.body;
            node.endLine = parsed.endLine;
        } finally {
            this.inProcedure = null;
        }
        this.program.procedures.push(node);
        return null;
    };

    STATEMENTS.TYPE = function (token, context) {
        if (context !== 'module' || this.inProcedure !== null)
            this.fail('Illegal in procedure', token);
        var name = this.procedureName(false);
        this.expectStatementEnd();
        var fields = [];
        for (;;) {
            var next = this.peek();
            if (next.type === 'newline' || (next.type === 'op' && next.value === ':')) {
                this.next();
                continue;
            }
            if (next.type === 'eof')
                this.fail('TYPE without END TYPE', token);
            if (this.isKeyword('END') && this.isKeyword('TYPE', 1)) {
                this.next();
                this.next();
                break;
            }
            var field = this.peek();
            if (field.type !== 'name' || field.suffix !== '' || field.value.indexOf('.') >= 0)
                this.fail('Expected: identifier');
            this.next();
            this.expectKeyword('AS');
            var type = this.typeName(true);
            fields.push({ name: field.value, display: field.name, type: type, line: field.line, column: field.column,
                          source: field.source });
            this.expectStatementEnd();
        }
        if (fields.length === 0)
            this.fail('Element not defined', token);
        this.program.types.push(this.node('type', token, { name: name.value, display: name.name, fields: fields }));
        return null;
    };

    // --- Declarations

    // A name with bounds and a type: DIM, REDIM, SHARED, STATIC, COMMON.
    Parser.prototype.declaration = function (allowBounds) {
        var name = this.peek();
        if (name.type !== 'name')
            this.fail('Expected: identifier');
        this.next();
        var item = { name: name.value, display: name.name, suffix: name.suffix, bounds: null, type: null, line: name.line,
                     column: name.column, source: name.source };
        if (this.accept('(')) {
            item.bounds = [];
            if (!this.accept(')')) {
                if (!allowBounds)
                    this.fail('Expected: )');
                do {
                    var first = this.expression();
                    if (this.acceptKeyword('TO'))
                        item.bounds.push({ lower: first, upper: this.expression() });
                    else
                        item.bounds.push({ lower: null, upper: first });
                } while (this.accept(','));
                this.expect(')');
            }
        }
        if (this.acceptKeyword('AS')) {
            if (item.suffix !== '')
                this.fail('Expected: end-of-statement');
            item.type = this.typeName(true);
        }
        return item;
    };

    STATEMENTS.DIM = function (token) {
        var shared = !!this.acceptKeyword('SHARED');
        var items = [];
        do {
            items.push(this.declaration(true));
        } while (this.accept(','));
        return this.node('dim', token, { shared: shared, redim: false, preserve: false, items: items });
    };

    STATEMENTS.REDIM = function (token) {
        var preserve = !!this.acceptKeyword('PRESERVE');
        if (!preserve && this.isName() && this.peek().value === '_preserve' && this.peek().suffix === '') {
            this.next();
            preserve = true;
        }
        var shared = !!this.acceptKeyword('SHARED');
        var items = [];
        do {
            var item = this.declaration(true);
            if (item.bounds === null || item.bounds.length === 0)
                this.fail('Expected: (', item);
            items.push(item);
        } while (this.accept(','));
        return this.node('dim', token, { shared: shared, redim: true, preserve: preserve, items: items });
    };

    STATEMENTS.COMMON = function (token) {
        var shared = !!this.acceptKeyword('SHARED');
        if (this.accept('/')) {
            this.procedureName(false);
            this.expect('/');
        }
        var items = [];
        do {
            items.push(this.declaration(false));
        } while (this.accept(','));
        return this.node('dim', token, { shared: shared, redim: false, preserve: false, items: items, common: true });
    };

    STATEMENTS.SHARED = function (token) {
        var items = [];
        do {
            items.push(this.declaration(false));
        } while (this.accept(','));
        return this.node('shared', token, { items: items });
    };

    STATEMENTS.STATIC = function (token) {
        var items = [];
        do {
            items.push(this.declaration(false));
        } while (this.accept(','));
        return this.node('static', token, { items: items });
    };

    STATEMENTS.CONST = function (token) {
        var items = [];
        do {
            var name = this.peek();
            if (name.type !== 'name')
                this.fail('Expected: identifier');
            this.next();
            this.expect('=');
            items.push({ name: name.value, display: name.name, suffix: name.suffix, value: this.expression(),
                         line: name.line, column: name.column, source: name.source });
        } while (this.accept(','));
        return this.node('const', token, { items: items });
    };

    function defType(type) {
        return function (token) {
            var ranges = [];
            do {
                var from = this.peek();
                if (from.type !== 'name' || from.suffix !== '' || from.value.length !== 1 || !/[a-z]/.test(from.value))
                    this.fail('Expected: letter');
                this.next();
                var to = from;
                if (this.accept('-')) {
                    to = this.peek();
                    if (to.type !== 'name' || to.suffix !== '' || to.value.length !== 1 || !/[a-z]/.test(to.value))
                        this.fail('Expected: letter');
                    this.next();
                }
                ranges.push({ from: from.value, to: to.value });
            } while (this.accept(','));
            var node = this.node('deftype', token, { type: type, ranges: ranges });
            if (this.inProcedure === null)
                this.moduleDefs.push(node);
            return node;
        };
    }
    STATEMENTS.DEFINT = defType('i');
    STATEMENTS.DEFLNG = defType('l');
    STATEMENTS.DEFSNG = defType('f');
    STATEMENTS.DEFDBL = defType('d');
    STATEMENTS.DEFSTR = defType('s');

    STATEMENTS.OPTION = function (token) {
        this.expectKeyword('BASE');
        var value = this.peek();
        if (value.type !== 'number' || (value.value !== 0 && value.value !== 1))
            this.fail('Expected: 0 or 1');
        this.next();
        return this.node('optionbase', token, { base: value.value });
    };

    // --- Data and the rest

    STATEMENTS.READ = function (token) {
        var targets = [];
        do {
            targets.push(this.reference(true));
        } while (this.accept(','));
        return this.node('read', token, { targets: targets });
    };

    STATEMENTS.RESTORE = function (token) {
        return this.node('restore', token, { label: this.atStatementEnd() ? null : this.labelReference() });
    };

    STATEMENTS.SWAP = function (token) {
        var first = this.reference(true);
        this.expect(',');
        return this.node('swap', token, { a: first, b: this.reference(true) });
    };

    STATEMENTS.RANDOMIZE = function (token) {
        return this.node('randomize', token, { seed: this.atStatementEnd() ? null : this.expression() });
    };

    STATEMENTS.SLEEP = function (token) {
        return this.node('sleep', token, { time: this.atStatementEnd() ? null : this.expression() });
    };

    STATEMENTS.CLS = function (token) {
        if (!this.atStatementEnd())
            this.expression();
        return this.node('cls', token);
    };

    STATEMENTS.BEEP = function (token) {
        return null;
    };

    STATEMENTS.LSET = function (token) {
        var target = this.reference(true);
        this.expect('=');
        return this.node('lset', token, { target: target, value: this.expression(), right: false });
    };

    STATEMENTS.RSET = function (token) {
        var target = this.reference(true);
        this.expect('=');
        return this.node('lset', token, { target: target, value: this.expression(), right: true });
    };

    STATEMENTS.ERASE = function (token) {
        var names = [];
        do {
            var name = this.peek();
            if (name.type !== 'name')
                this.fail('Expected: identifier');
            this.next();
            names.push({ name: name.value, suffix: name.suffix, line: name.line, column: name.column, source: name.source });
        } while (this.accept(','));
        return this.node('erase', token, { names: names });
    };

    STATEMENTS.CLEAR = function (token) {
        while (!this.atStatementEnd())
            this.next();
        return this.node('clear', token);
    };

    STATEMENTS.KEY = function (token) {
        while (!this.atStatementEnd())
            this.next();
        return null;
    };

    // Statements that do nothing on the console: their arguments are
    // checked and evaluated (errors in them show).
    function ignored(token) {
        var args = [];
        while (!this.atStatementEnd()) {
            if (this.accept(',') || this.accept(';'))
                continue;
            args.push(this.expression());
        }
        return this.node('ignored', token, { args: args });
    }
    ['LOCATE', 'WIDTH', 'SOUND', 'PLAY', 'TRON', 'TROFF', 'POKE', 'OUT', 'WAIT', 'PCOPY'].forEach(function (word) {
        STATEMENTS[word] = ignored;
    });

    STATEMENTS.VIEW = function (token) {
        this.acceptKeyword('PRINT');
        var args = [];
        while (!this.atStatementEnd()) {
            if (this.acceptKeyword('TO') || this.accept(',') || this.accept('-') || this.accept('(') || this.accept(')'))
                continue;
            if (this.isKeyword('SCREEN')) {
                this.next();
                continue;
            }
            args.push(this.expression());
        }
        return this.node('ignored', token, { args: args });
    };

    function unavailable(token) {
        this.fail('Advanced feature unavailable', token);
    }
    ['CHAIN', 'SHELL', 'RUN', 'KILL', 'NAME', 'MKDIR', 'RMDIR', 'CHDIR', 'FILES', 'ENVIRON', 'FIELD', 'LOCK', 'UNLOCK',
     'COM', 'RESET'].forEach(function (word) {
        STATEMENTS[word] = unavailable;
    });

    // --- Graphics (the host canvas)

    // A point "[STEP] (x, y)".
    Parser.prototype.point = function () {
        var relative = !!this.acceptKeyword('STEP');
        this.expect('(');
        var x = this.expression();
        this.expect(',');
        var y = this.expression();
        this.expect(')');
        return { relative: relative, x: x, y: y };
    };

    // Optional arguments separated by commas: a missing one is null.
    Parser.prototype.optionalArguments = function (max) {
        var args = [];
        while (this.accept(',')) {
            if (this.is(',') || this.atStatementEnd())
                args.push(null);
            else
                args.push(this.expression());
            if (args.length > max)
                this.fail('Expected: end-of-statement');
        }
        return args;
    };

    STATEMENTS.SCREEN = function (token) {
        var mode = this.expression();
        return this.node('screen', token, { mode: mode, rest: this.optionalArguments(3) });
    };

    STATEMENTS.PSET = function (token) {
        return this.node('pset', token, { point: this.point(), color: this.optionalArguments(1)[0] || null, reset: false });
    };

    STATEMENTS.PRESET = function (token) {
        return this.node('pset', token, { point: this.point(), color: this.optionalArguments(1)[0] || null, reset: true });
    };

    Parser.prototype.graphicsLine = function (token) {
        var from = null;
        if (this.isKeyword('STEP') || this.is('('))
            from = this.point();
        this.expect('-');
        var to = this.point();
        var color = null, box = '', style = null;
        if (this.accept(',')) {
            if (!this.is(',') && !this.atStatementEnd())
                color = this.expression();
            if (this.accept(',')) {
                var flag = this.peek();
                if (flag.type === 'name' && (flag.value === 'b' || flag.value === 'bf') && flag.suffix === '') {
                    this.next();
                    box = flag.value;
                } else if (!this.is(',')) {
                    this.fail('Expected: B or BF');
                }
                if (this.accept(','))
                    style = this.expression();
            }
        }
        return this.node('line', token, { from: from, to: to, color: color, box: box, style: style });
    };

    STATEMENTS.CIRCLE = function (token) {
        var center = this.point();
        this.expect(',');
        var radius = this.expression();
        var rest = this.optionalArguments(4);
        return this.node('circle', token, { center: center, radius: radius, color: rest[0] || null, start: rest[1] || null,
                                            end: rest[2] || null, aspect: rest[3] || null });
    };

    STATEMENTS.PAINT = function (token) {
        var point = this.point();
        var rest = this.optionalArguments(3);
        return this.node('paint', token, { point: point, color: rest[0] || null, border: rest[1] || null });
    };

    STATEMENTS.COLOR = function (token) {
        var args = [];
        if (!this.atStatementEnd()) {
            args.push(this.is(',') ? null : this.expression());
            args = args.concat(this.optionalArguments(2));
        }
        return this.node('color', token, { args: args });
    };

    STATEMENTS.PALETTE = function (token) {
        var args = [];
        if (this.acceptKeyword('USING'))
            this.fail('Advanced feature unavailable');
        if (!this.atStatementEnd()) {
            args.push(this.expression());
            this.expect(',');
            args.push(this.expression());
        }
        return this.node('palette', token, { args: args });
    };

    STATEMENTS.DRAW = function (token) {
        return this.node('draw', token, { commands: this.expression() });
    };

    STATEMENTS.WINDOW = function (token) {
        var screen = !!this.acceptKeyword('SCREEN');
        if (this.atStatementEnd())
            return this.node('window', token, { screen: screen, from: null, to: null });
        var from = this.point();
        this.expect('-');
        var to = this.point();
        return this.node('window', token, { screen: screen, from: from, to: to });
    };

    // --- Files (read-only files of the host)

    STATEMENTS.OPEN = function (token) {
        var file = this.expression();
        var mode = 'RANDOM';
        if (this.acceptKeyword('FOR')) {
            var word = this.peek();
            if (word.type !== 'keyword' || ['INPUT', 'OUTPUT', 'APPEND', 'RANDOM', 'BINARY'].indexOf(word.value) < 0)
                this.fail('Expected: INPUT or OUTPUT or APPEND or RANDOM or BINARY');
            this.next();
            mode = word.value;
        } else if (this.accept(',')) {
            // The old form: OPEN "I", #1, "file".
            var legacy = { I: 'INPUT', O: 'OUTPUT', A: 'APPEND', R: 'RANDOM', B: 'BINARY' };
            if (file.k !== 'str' || legacy[file.value.toUpperCase()] === undefined)
                this.fail('Bad file mode');
            mode = legacy[file.value.toUpperCase()];
            this.accept('#');
            var number = this.expression();
            this.expect(',');
            file = this.expression();
            return this.node('open', token, { file: file, mode: mode, number: number });
        }
        if (this.acceptKeyword('ACCESS')) {
            while (this.isKeyword('READ') || this.isKeyword('WRITE'))
                this.next();
        }
        while (this.isKeyword('SHARED') || this.isKeyword('LOCK') || this.isKeyword('READ') || this.isKeyword('WRITE'))
            this.next();
        this.expectKeyword('AS');
        this.accept('#');
        var channel = this.expression();
        if (this.isName() && this.peek().value === 'len') {
            this.next();
            this.expect('=');
            this.expression();
        }
        return this.node('open', token, { file: file, mode: mode, number: channel });
    };

    STATEMENTS.CLOSE = function (token) {
        var numbers = [];
        while (!this.atStatementEnd()) {
            this.accept('#');
            numbers.push(this.expression());
            if (!this.accept(','))
                break;
        }
        return this.node('close', token, { numbers: numbers });
    };

    STATEMENTS.GET = function (token) {
        this.fail('Advanced feature unavailable', token);
    };
    STATEMENTS.PUT = STATEMENTS.GET;
    STATEMENTS.SEEK = STATEMENTS.GET;

    // MID$(s$, start[, length]) = value: the name mid$ is in assignmentOrCall.

    // --- Expressions

    Parser.prototype.expression = function () {
        return this.binary(1);
    };

    Parser.prototype.operatorOf = function (token) {
        if (token.type === 'op' && BINARY[token.value] !== undefined)
            return token.value;
        if (token.type === 'keyword' && BINARY[token.value] !== undefined)
            return token.value;
        return null;
    };

    Parser.prototype.binary = function (level) {
        if (level === NOT_LEVEL) {
            var notToken = this.acceptKeyword('NOT');
            if (notToken !== null)
                return this.node('not', notToken, { arg: this.binary(NOT_LEVEL) });
            return this.binary(NOT_LEVEL + 1);
        }
        if (level > 11)
            return this.unary();
        var left = this.binary(level + 1);
        for (;;) {
            var token = this.peek();
            var op = this.operatorOf(token);
            if (op === null || BINARY[op] !== level)
                return left;
            this.next();
            var right = this.binary(level + 1);
            left = this.node('bin', token, { op: op, left: left, right: right });
        }
    };

    // Sign: -a^b = -(a^b), 2^-1 is allowed.
    Parser.prototype.unary = function () {
        var token = this.peek();
        if (token.type === 'op' && (token.value === '-' || token.value === '+')) {
            this.next();
            var arg = this.unary();
            if (token.value === '+')
                return arg;
            if (arg.k === 'num' && !arg.negated)
                return this.negativeNumber(token, arg);
            return this.node('neg', token, { arg: arg });
        }
        return this.power();
    };

    // -32768 is a LONG by the rules of QBasic (32768 is not an INTEGER);
    // the value is that of the constant.
    Parser.prototype.negativeNumber = function (token, arg) {
        var node = this.node('num', token, { value: -arg.value, kind: arg.kind, negated: true });
        return node;
    };

    Parser.prototype.power = function () {
        var left = this.primary();
        for (;;) {
            var token = this.peek();
            if (token.type !== 'op' || token.value !== '^')
                return left;
            this.next();
            var right;
            var sign = this.peek();
            if (sign.type === 'op' && (sign.value === '-' || sign.value === '+')) {
                this.next();
                var inner = this.power();
                right = sign.value === '-' ? (inner.k === 'num' ? this.negativeNumber(sign, inner)
                                                                 : this.node('neg', sign, { arg: inner }))
                                           : inner;
            } else {
                right = this.primary();
            }
            left = this.node('bin', token, { op: '^', left: left, right: right });
        }
    };

    Parser.prototype.primary = function () {
        var token = this.peek();
        if (token.type === 'number') {
            this.next();
            return this.node('num', token, { value: token.value, kind: token.kind });
        }
        if (token.type === 'string') {
            this.next();
            return this.node('str', token, { value: token.value });
        }
        if (token.type === 'op' && token.value === '(') {
            this.next();
            var inner = this.expression();
            this.expect(')');
            return this.node('paren', token, { arg: inner });
        }
        if (token.type === 'name')
            return this.reference(false);
        if (token.type === 'keyword') {
            // Keywords that are functions too.
            if ((token.value === 'SCREEN' || token.value === 'SEEK' || token.value === 'PEN' || token.value === 'PLAY') &&
                this.peek(1).type === 'op' && this.peek(1).value === '(') {
                this.next();
                this.next();
                var args = [];
                do {
                    args.push(this.expression());
                } while (this.accept(','));
                this.expect(')');
                return this.node('ref', token, { name: token.value.toLowerCase(), display: token.text, suffix: '',
                                                 args: args, chain: [], keyword: true });
            }
        }
        if (this.atStatementEnd() || token.type === 'op' && token.value === ')')
            this.fail('Expected: expression');
        this.fail('Expected: expression', token);
    };

    // A reference: name[suffix][(arguments)][.member[(arguments)]]... The
    // argument "a()" is the whole array.
    Parser.prototype.reference = function (target) {
        var token = this.next();
        if (token.type !== 'name')
            this.fail('Expected: identifier', token);
        var node = this.node('ref', token, { name: token.value, display: token.name, suffix: token.suffix, args: null,
                                             chain: [], spaced: false });
        if (this.is('(')) {
            var open = this.next();
            node.spaced = open.line !== token.line || open.column > token.column + token.text.length;
            node.args = this.argumentList();
        }
        while (this.is('.') && this.peek(1).type === 'name' && this.peek(1).column === this.peek().column + 1) {
            this.next();
            var member = this.next();
            var parts = member.name.split('.');
            for (var index = 0; index < parts.length; ++index) {
                var last = index === parts.length - 1;
                var link = { name: parts[index], suffix: last ? member.suffix : '', args: null, line: member.line,
                             column: member.column, source: member.source };
                if (last && this.is('(')) {
                    this.next();
                    link.args = this.argumentList();
                }
                node.chain.push(link);
            }
        }
        return node;
    };

    Parser.prototype.argumentList = function () {
        var args = [];
        if (this.accept(')'))
            return args;
        do {
            args.push(this.argument());
        } while (this.accept(','));
        this.expect(')');
        return args;
    };

    // An argument of a call: an expression or a whole array "a()".
    Parser.prototype.argument = function () {
        var token = this.peek();
        if (token.type === 'name' && this.peek(1).type === 'op' && this.peek(1).value === '(' &&
            this.peek(2).type === 'op' && this.peek(2).value === ')') {
            this.next();
            this.next();
            this.next();
            return this.node('array', token, { name: token.value, display: token.name, suffix: token.suffix });
        }
        return this.expression();
    };

    // A program from the text of a unit or of a file.
    Basic.parse = function (text, source, options) {
        var tokens = Basic.lex(text, source, options);
        return new Parser(tokens, source).parseProgram();
    };
    Basic.Parser = Parser;
})(globalThis);
