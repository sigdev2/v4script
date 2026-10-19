// Go: tokens and parsing into a tree. A unit is a file of the package main
// that may have statements besides declarations (they run in order, as
// the body of main).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Go = T.go = T.go || {};
    if (Go.parse)
        return;

    var CompileError = T.CompileError;

    var KEYWORDS = {};
    ('break case chan const continue default defer else fallthrough for func go goto if import interface map package ' +
     'range return select struct switch type var').split(' ').forEach(function (word) { KEYWORDS[word] = true; });

    var OPERATORS = [
        '&^=', '<<=', '>>=', '...',
        '&&', '||', '<-', '++', '--', '==', '!=', '<=', '>=', ':=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=',
        '<<', '>>', '&^',
        '+', '-', '*', '/', '%', '&', '|', '^', '<', '>', '=', '!', '~', '(', ')', '[', ']', '{', '}', ',', ';', '.', ':'
    ];

    var IDENTIFIER = /[A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*/y;
    var NUMBER = /0[xX][0-9a-fA-F_]*(\.[0-9a-fA-F_]*)?([pP][+-]?[0-9_]+)?i?|0[bB][01_]+i?|0[oO][0-7_]+i?|([0-9][0-9_]*(\.[0-9_]*)?|\.[0-9][0-9_]*)([eE][+-]?[0-9_]+)?i?/y;

    function token(type, value, text, line, column) {
        return { type: type, value: value, text: text, line: line, column: column, newline: false };
    }

    // The UTF-8 bytes of a string (each character is a byte).
    var encode = T.utf8.encode;

    function readEscape(scanner, quote, bytes) {
        // The scanner is at the character after "\".
        var char = scanner.peek();
        var simple = { a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11, '\\': 92 };
        if (simple[char] !== undefined) {
            scanner.advance();
            bytes.push(simple[char]);
            return;
        }
        if (char === quote) {
            scanner.advance();
            bytes.push(quote.charCodeAt(0));
            return;
        }
        var hex = { x: 2, u: 4, U: 8 }[char];
        if (hex !== undefined) {
            scanner.advance();
            var digits = scanner.text.substr(scanner.pos, hex);
            if (!new RegExp('^[0-9a-fA-F]{' + hex + '}$').test(digits))
                scanner.error('invalid escape sequence');
            scanner.advance(hex);
            var value = parseInt(digits, 16);
            if (char === 'x') {
                bytes.push(value);
            } else {
                if (value > 0x10FFFF || (value >= 0xD800 && value <= 0xDFFF))
                    scanner.error('escape sequence is invalid Unicode code point');
                T.utf8.appendRune(bytes, value);
            }
            return;
        }
        if (char >= '0' && char <= '7') {
            var octal = scanner.text.substr(scanner.pos, 3);
            if (!/^[0-7]{3}$/.test(octal))
                scanner.error('invalid escape sequence');
            scanner.advance(3);
            var byte = parseInt(octal, 8);
            if (byte > 255)
                scanner.error('octal escape value > 255');
            bytes.push(byte);
            return;
        }
        scanner.error('unknown escape sequence');
    }

    function pushText(bytes, text) {
        var encoded = encode(text);
        for (var index = 0; index < encoded.length; ++index)
            bytes.push(encoded.charCodeAt(index));
    }

    function lex(text, source) {
        var scanner = new T.Scanner(text, source);
        var tokens = [];
        var newline = false;

        function needsSemicolon() {
            if (tokens.length === 0)
                return false;
            var last = tokens[tokens.length - 1];
            if (last.type === 'ident' || last.type === 'int' || last.type === 'float' || last.type === 'imag' ||
                last.type === 'rune' || last.type === 'string')
                return true;
            if (last.type === 'keyword')
                return last.value === 'break' || last.value === 'continue' || last.value === 'fallthrough' ||
                    last.value === 'return';
            return last.type === 'op' && (last.value === '++' || last.value === '--' || last.value === ')' ||
                                          last.value === ']' || last.value === '}');
        }

        function lineEnd() {
            if (needsSemicolon()) {
                var semicolon = token('op', ';', '\n', scanner.line, scanner.column());
                semicolon.implicit = true;
                tokens.push(semicolon);
            }
            newline = true;
        }

        while (!scanner.atEnd()) {
            var char = scanner.peek();
            var code = scanner.code();
            if (char === '\n') {
                lineEnd();
                scanner.advance();
                continue;
            }
            if (char === ' ' || char === '\t' || char === '\r' || code === 0xFEFF) {
                scanner.advance();
                continue;
            }
            if (scanner.startsWith('//')) {
                while (!scanner.atEnd() && scanner.peek() !== '\n')
                    scanner.advance();
                continue;
            }
            if (scanner.startsWith('/*')) {
                var startLine = scanner.line;
                var end = text.indexOf('*/', scanner.pos + 2);
                if (end < 0)
                    scanner.error('comment not terminated');
                var hadNewline = text.substring(scanner.pos, end).indexOf('\n') >= 0;
                scanner.advance(end + 2 - scanner.pos);
                if (hadNewline) {
                    var saved = scanner.line;
                    scanner.line = startLine;
                    lineEnd();
                    scanner.line = saved;
                }
                continue;
            }
            var line = scanner.line, column = scanner.column();
            var produced;
            if (T.isLetter(code)) {
                var word = scanner.match(IDENTIFIER);
                scanner.advance(word.length);
                produced = KEYWORDS[word] === true ? token('keyword', word, word, line, column)
                                                   : token('ident', word, word, line, column);
            } else if (T.isDigit(code) || (char === '.' && T.isDigit(scanner.code(1)))) {
                var number = scanner.match(NUMBER);
                scanner.advance(number.length);
                var kind = 'int';
                if (/i$/.test(number))
                    kind = 'imag';
                else if (/^0[xX]/.test(number) ? /[.pP]/.test(number) : /[.eE]/.test(number))
                    kind = 'float';
                produced = token(kind, number, number, line, column);
            } else if (char === '"') {
                scanner.advance();
                var bytes = [];
                for (;;) {
                    if (scanner.atEnd() || scanner.peek() === '\n')
                        scanner.error('string literal not terminated', line, column);
                    var current = scanner.peek();
                    if (current === '"') {
                        scanner.advance();
                        break;
                    }
                    if (current === '\\') {
                        scanner.advance();
                        readEscape(scanner, '"', bytes);
                        continue;
                    }
                    var startText = scanner.pos;
                    while (!scanner.atEnd() && '"\\\n'.indexOf(scanner.peek()) < 0)
                        scanner.advance();
                    pushText(bytes, text.substring(startText, scanner.pos));
                }
                produced = token('string', T.utf8.fromBytes(bytes), text.substring(scanner.pos, scanner.pos), line, column);
                produced.text = 'string';
            } else if (char === '`') {
                var close = text.indexOf('`', scanner.pos + 1);
                if (close < 0)
                    scanner.error('raw string literal not terminated');
                var raw = text.substring(scanner.pos + 1, close).replace(/\r/g, '');
                scanner.advance(close + 1 - scanner.pos);
                produced = token('string', encode(raw), 'string', line, column);
            } else if (char === "'") {
                scanner.advance();
                var runeBytes = [];
                var rune;
                if (scanner.peek() === '\\') {
                    scanner.advance();
                    var escapeChar = scanner.peek();
                    readEscape(scanner, "'", runeBytes);
                    if (escapeChar === 'x' || (escapeChar >= '0' && escapeChar <= '7'))
                        rune = runeBytes[0];
                    else
                        rune = T.utf8.decodeRune(T.utf8.fromBytes(runeBytes), 0)[0];
                } else {
                    rune = text.codePointAt(scanner.pos);
                    if (rune === undefined || scanner.peek() === "'" || scanner.peek() === '\n')
                        scanner.error('empty rune literal or unescaped \' in rune literal');
                    scanner.advance(rune > 0xFFFF ? 2 : 1);
                }
                if (scanner.peek() !== "'")
                    scanner.error('rune literal not terminated', line, column);
                scanner.advance();
                produced = token('rune', rune, 'rune', line, column);
            } else {
                var operator = null;
                for (var index = 0; index < OPERATORS.length; ++index) {
                    if (scanner.startsWith(OPERATORS[index])) {
                        operator = OPERATORS[index];
                        break;
                    }
                }
                if (operator === null)
                    scanner.error("invalid character '" + char + "'");
                scanner.advance(operator.length);
                produced = token('op', operator, operator, line, column);
            }
            produced.newline = newline;
            newline = false;
            tokens.push(produced);
        }
        lineEnd();
        tokens.push(token('eof', '', '', scanner.line, scanner.column()));
        return tokens;
    }

    // --- Parsing

    function GoParser(tokens, source) {
        T.Parser.call(this, tokens, source);
        // The parenthesis depth: in the header of if/for/switch a literal
        // T{...} without parentheses is not parsed (otherwise the "{" of the
        // body would become a literal).
        this.noLiteral = false;
    }
    GoParser.prototype = Object.create(T.Parser.prototype);

    // Messages as in the Go compiler: "syntax error: unexpected X,
    // expected Y".
    GoParser.prototype.fail = function (message, token) {
        var match = /^expected (.*), found (.*)$/.exec(message);
        if (match !== null)
            message = 'syntax error: unexpected ' + match[2] + ', expected ' + match[1];
        T.Parser.prototype.fail.call(this, message, token);
    };

    GoParser.prototype.node = function (kind, token, fields) {
        var node = fields || {};
        node.k = kind;
        node.line = token.line;
        node.column = token.column;
        return node;
    };

    GoParser.prototype.semicolon = function () {
        if (this.is(')') || this.is('}'))
            return;
        if (this.peek().type === 'eof')
            return;
        this.expect(';', "';' or newline");
    };

    GoParser.prototype.identifier = function () {
        var token = this.peek();
        if (token.type !== 'ident')
            this.fail('expected name, found ' + this.describe(token));
        this.next();
        return token.value;
    };

    // A file: package, import, top-level declarations and statements.
    GoParser.prototype.file = function () {
        var file = { k: 'file', packageName: null, imports: [], items: [] };
        while (this.accept(';')) {
        }
        if (this.is('package')) {
            this.next();
            file.packageName = this.identifier();
            this.semicolon();
        }
        while (this.peek().type !== 'eof') {
            if (this.accept(';'))
                continue;
            if (this.is('import'))
                this.importDecl(file);
            else if (this.is('func') && (this.peek(1).type === 'ident' || this.is('(', 1)))
                file.items.push(this.funcDecl());
            else if (this.is('var') || this.is('const') || this.is('type'))
                file.items.push(this.declaration());
            else
                file.items.push(this.statement());
            if (this.peek().type !== 'eof' && !this.is(';'))
                this.fail('unexpected ' + this.describe(this.peek()) + ' after top level declaration');
        }
        return file;
    };

    GoParser.prototype.importDecl = function (file) {
        this.next();
        var self = this;
        function spec() {
            var token = self.peek();
            var name = null;
            if (token.type === 'ident') {
                name = self.next().value;
            } else if (self.is('.')) {
                self.next();
                name = '.';
            }
            var path = self.peek();
            if (path.type !== 'string')
                self.fail('expected import path');
            self.next();
            file.imports.push({ name: name, path: T.utf8.decode(path.value), line: path.line, column: path.column });
        }
        if (this.accept('(')) {
            while (!this.is(')')) {
                spec();
                this.semicolon();
            }
            this.expect(')');
        } else {
            spec();
        }
    };

    GoParser.prototype.declaration = function () {
        var token = this.next();
        var kind = token.value;
        var decl = this.node(kind, token, { specs: [] });
        var self = this;
        var previous = null;
        var iota = 0;
        function spec() {
            if (kind === 'type') {
                decl.specs.push(self.typeSpec());
                return;
            }
            var specToken = self.peek();
            var names = [self.identifier()];
            while (self.accept(','))
                names.push(self.identifier());
            var type = null;
            var values = null;
            if (!self.is('=') && !self.is(';') && !self.is(')'))
                type = self.type();
            if (self.accept('='))
                values = self.expressionList();
            var item = self.node('spec', specToken, { names: names, type: type, values: values, iota: iota });
            if (kind === 'const') {
                // Missing values repeat the previous spec.
                if (values === null && type === null) {
                    if (previous === null)
                        self.fail('missing init expr for const declaration', specToken);
                    item.values = previous.values;
                    item.type = previous.type;
                    item.implicit = true;
                } else if (values === null) {
                    self.fail('missing init expr for const declaration', specToken);
                }
                previous = item;
                ++iota;
            }
            decl.specs.push(item);
        }
        if (this.accept('(')) {
            while (!this.is(')')) {
                spec();
                this.semicolon();
            }
            this.expect(')');
        } else {
            spec();
        }
        return decl;
    };

    GoParser.prototype.typeSpec = function () {
        var token = this.peek();
        var name = this.identifier();
        var typeParams = null;
        // type T[P any] ... - type parameters; type A [N]int - an array.
        if (this.is('[') && this.peek(1).type === 'ident' && !this.is(']', 2) && this.looksLikeTypeParams())
            typeParams = this.typeParams();
        var alias = !!this.accept('=');
        var type = this.type();
        return this.node('typespec', token, { name: name, typeParams: typeParams, alias: alias, type: type });
    };

    // After "[": "ident ident..." or "ident," or "ident interface/~/*" -
    // type parameters.
    GoParser.prototype.looksLikeTypeParams = function () {
        var second = this.peek(2);
        if (second.type === 'ident' || (second.type === 'op' && (second.value === ',' || second.value === '~' ||
                                                                   second.value === '*' || second.value === '[')))
            return second.value !== ']';
        return second.type === 'keyword' && (second.value === 'interface' || second.value === 'func' ||
                                             second.value === 'map' || second.value === 'chan');
    };

    GoParser.prototype.typeParams = function () {
        this.expect('[');
        var params = [];
        while (!this.is(']')) {
            var token = this.peek();
            var names = [this.identifier()];
            while (this.accept(','))
                names.push(this.identifier());
            var constraint = this.constraint();
            names.forEach(function (name) {
                params.push({ name: name, constraint: constraint, line: token.line });
            });
            if (!this.accept(','))
                break;
        }
        this.expect(']');
        return params;
    };

    // The constraint of a type parameter: a type or a union ~int | float64.
    GoParser.prototype.constraint = function () {
        var token = this.peek();
        var terms = [this.constraintTerm()];
        while (this.accept('|'))
            terms.push(this.constraintTerm());
        if (terms.length === 1 && !terms[0].tilde)
            return terms[0].type;
        return this.node('union', token, { terms: terms });
    };

    GoParser.prototype.constraintTerm = function () {
        var tilde = !!this.accept('~');
        return { tilde: tilde, type: this.type() };
    };

    GoParser.prototype.funcDecl = function () {
        var token = this.next();
        var receiver = null;
        if (this.is('(')) {
            var params = this.parameters();
            if (params.list.length !== 1)
                this.fail('method has multiple receivers', token);
            receiver = params.list[0];
        }
        var name = this.identifier();
        var typeParams = this.is('[') ? this.typeParams() : null;
        var signature = this.signature();
        var body = null;
        if (this.is('{'))
            body = this.block();
        return this.node('func', token, { name: name, receiver: receiver, typeParams: typeParams, signature: signature,
                                          body: body });
    };

    GoParser.prototype.signature = function () {
        var params = this.parameters();
        var results = { list: [], variadic: false };
        if (this.is('(')) {
            results = this.parameters();
        } else if (this.startsType()) {
            var token = this.peek();
            results = { list: [{ name: null, type: this.type(), line: token.line }], variadic: false };
        }
        return { params: params.list, variadic: params.variadic, results: results.list };
    };

    GoParser.prototype.startsType = function () {
        var token = this.peek();
        if (token.type === 'ident')
            return true;
        if (token.type === 'keyword')
            return ['func', 'map', 'chan', 'struct', 'interface'].indexOf(token.value) >= 0;
        return token.type === 'op' && ['*', '[', '(', '<-'].indexOf(token.value) >= 0;
    };

    // A parameter list: (a, b int, c string) or (int, string).
    GoParser.prototype.parameters = function () {
        this.expect('(');
        var entries = [];
        var variadic = false;
        while (!this.is(')')) {
            var token = this.peek();
            var dots = !!this.accept('...');
            var first = dots ? this.type() : this.typeOrName();
            var entry = { first: first, type: null, dots: dots, line: token.line, column: token.column };
            if (!dots && !this.is(',') && !this.is(')')) {
                entry.dots = !!this.accept('...');
                entry.type = this.type();
            }
            entries.push(entry);
            if (!this.accept(','))
                break;
        }
        this.expect(')');
        // If at least one has a name and a type, these are names; otherwise types.
        var named = entries.some(function (entry) { return entry.type !== null; });
        var list = [];
        var self = this;
        if (named) {
            var pending = [];
            entries.forEach(function (entry) {
                if (entry.first.k !== 'ident')
                    self.fail('mixed named and unnamed parameters', entry);
                pending.push(entry);
                if (entry.type !== null) {
                    pending.forEach(function (item) {
                        list.push({ name: item.first.name, type: entry.type, line: item.line });
                    });
                    if (entry.dots)
                        variadic = true;
                    pending = [];
                }
            });
            if (pending.length > 0)
                this.fail('mixed named and unnamed parameters', pending[0]);
        } else {
            entries.forEach(function (entry) {
                list.push({ name: null, type: entry.first, line: entry.line });
                if (entry.dots)
                    variadic = true;
            });
        }
        return { list: list, variadic: variadic };
    };

    // In a parameter list: a name (possibly a type) or a type.
    GoParser.prototype.typeOrName = function () {
        var token = this.peek();
        if (token.type === 'ident') {
            this.next();
            var node = this.node('ident', token, { name: token.value });
            if (this.is('.')) {
                this.next();
                node = this.node('sel', token, { x: node, name: this.identifier() });
            }
            if (this.is('[') && !this.is(']', 1)) {
                // A generic type: T[int].
                node = this.typeArguments(node);
            }
            return node;
        }
        return this.type();
    };

    GoParser.prototype.typeArguments = function (base) {
        var token = this.expect('[');
        var args = [this.type()];
        while (this.accept(',')) {
            if (this.is(']'))
                break;
            args.push(this.type());
        }
        this.expect(']');
        return this.node('instance', token, { x: base, args: args });
    };

    GoParser.prototype.type = function () {
        var token = this.peek();
        if (token.type === 'ident') {
            this.next();
            var node = this.node('ident', token, { name: token.value });
            if (this.is('.')) {
                this.next();
                node = this.node('sel', token, { x: node, name: this.identifier() });
            }
            if (this.is('['))
                node = this.typeArguments(node);
            return node;
        }
        if (this.accept('(')) {
            var inner = this.type();
            this.expect(')');
            return inner;
        }
        if (this.accept('*'))
            return this.node('pointer', token, { elem: this.type() });
        if (this.is('[')) {
            this.next();
            if (this.accept(']'))
                return this.node('slicetype', token, { elem: this.type() });
            var length;
            if (this.accept('...')) {
                length = null;
            } else {
                var saved = this.noLiteral;
                this.noLiteral = false;
                length = this.expression();
                this.noLiteral = saved;
            }
            this.expect(']');
            return this.node('arraytype', token, { length: length, elem: this.type() });
        }
        if (this.is('map')) {
            this.next();
            this.expect('[');
            var key = this.type();
            this.expect(']');
            return this.node('maptype', token, { key: key, value: this.type() });
        }
        if (this.is('chan')) {
            this.next();
            var direction = this.accept('<-') ? 'send' : 'both';
            return this.node('chantype', token, { dir: direction, elem: this.type() });
        }
        if (this.is('<-')) {
            this.next();
            this.expect('chan');
            return this.node('chantype', token, { dir: 'recv', elem: this.type() });
        }
        if (this.is('func')) {
            this.next();
            return this.node('functype', token, { signature: this.signature() });
        }
        if (this.is('struct'))
            return this.structType();
        if (this.is('interface'))
            return this.interfaceType();
        this.fail('expected type, found ' + this.describe(token));
    };

    GoParser.prototype.structType = function () {
        var token = this.next();
        this.expect('{');
        var fields = [];
        while (!this.is('}')) {
            var fieldToken = this.peek();
            // An embedded field: T, *T, pkg.T (then ; or a tag).
            var embedded = false;
            if (this.is('*') || (fieldToken.type === 'ident' &&
                (this.is(';', 1) || this.is('}', 1) || this.is('.', 1) || this.peek(1).type === 'string'))) {
                embedded = true;
            }
            if (embedded) {
                var type = this.type();
                var tag = this.peek().type === 'string' ? this.next().value : null;
                fields.push({ names: null, type: type, tag: tag, line: fieldToken.line, column: fieldToken.column });
            } else {
                var names = [this.identifier()];
                while (this.accept(','))
                    names.push(this.identifier());
                var fieldType = this.type();
                var fieldTag = this.peek().type === 'string' ? this.next().value : null;
                fields.push({ names: names, type: fieldType, tag: fieldTag, line: fieldToken.line,
                              column: fieldToken.column });
            }
            this.semicolon();
        }
        this.expect('}');
        return this.node('structtype', token, { fields: fields });
    };

    GoParser.prototype.interfaceType = function () {
        var token = this.next();
        this.expect('{');
        var methods = [];
        var embeds = [];
        while (!this.is('}')) {
            var item = this.peek();
            if (item.type === 'ident' && this.is('(', 1)) {
                var name = this.identifier();
                methods.push({ name: name, signature: this.signature(), line: item.line, column: item.column });
            } else {
                embeds.push(this.constraint());
            }
            this.semicolon();
        }
        this.expect('}');
        return this.node('interfacetype', token, { methods: methods, embeds: embeds });
    };

    GoParser.prototype.block = function () {
        var token = this.expect('{');
        var statements = this.statementList();
        var end = this.expect('}');
        return this.node('block', token, { list: statements, endLine: end.line });
    };

    GoParser.prototype.statementList = function () {
        var list = [];
        while (!this.is('}') && !this.is('case') && !this.is('default') && this.peek().type !== 'eof') {
            if (this.accept(';'))
                continue;
            list.push(this.statement());
            if (!this.is('}') && !this.is('case') && !this.is('default'))
                this.semicolon();
        }
        return list;
    };

    GoParser.prototype.statement = function () {
        var token = this.peek();
        if (token.type === 'keyword') {
            switch (token.value) {
            case 'var':
            case 'const':
            case 'type':
                return this.node('declstmt', token, { decl: this.declaration() });
            case 'return': {
                this.next();
                var results = [];
                if (!this.is(';') && !this.is('}'))
                    results = this.expressionList();
                return this.node('return', token, { results: results });
            }
            case 'break':
            case 'continue':
            case 'goto': {
                this.next();
                var label = this.peek().type === 'ident' ? this.next().value : null;
                return this.node('branch', token, { tok: token.value, label: label });
            }
            case 'fallthrough':
                this.next();
                return this.node('branch', token, { tok: 'fallthrough', label: null });
            case 'go':
            case 'defer': {
                this.next();
                var call = this.expression();
                if (call.k !== 'call')
                    this.fail('expression in ' + token.value + ' must be function call', token);
                return this.node(token.value, token, { call: call });
            }
            case 'if':
                return this.ifStatement();
            case 'for':
                return this.forStatement();
            case 'switch':
                return this.switchStatement();
            case 'select':
                return this.selectStatement();
            case 'func':
                break;
            }
        }
        if (this.is('{'))
            return this.block();
        if (this.is(';'))
            return this.node('empty', token, {});
        if (token.type === 'ident' && this.is(':', 1)) {
            this.next();
            this.next();
            var labelled = this.is('}') ? this.node('empty', token, {}) : this.statement();
            return this.node('labeled', token, { label: token.value, stmt: labelled });
        }
        return this.simpleStatement(false);
    };

    // A simple statement; range is allowed in the header of for.
    GoParser.prototype.simpleStatement = function (rangeAllowed) {
        var token = this.peek();
        if (rangeAllowed && this.is('range')) {
            this.next();
            return this.node('range', token, { key: null, value: null, define: false, x: this.expression() });
        }
        var left = this.expressionList();
        var next = this.peek();
        if (next.type === 'op') {
            switch (next.value) {
            case ':=':
            case '=':
            case '+=':
            case '-=':
            case '*=':
            case '/=':
            case '%=':
            case '&=':
            case '|=':
            case '^=':
            case '<<=':
            case '>>=':
            case '&^=': {
                this.next();
                if (rangeAllowed && this.is('range') && (next.value === '=' || next.value === ':=')) {
                    var rangeToken = this.next();
                    if (left.length > 2)
                        this.fail('range clause permits at most two iteration variables', rangeToken);
                    return this.node('range', token, { key: left[0], value: left[1] || null, define: next.value === ':=',
                                                       x: this.expression() });
                }
                var right = this.expressionList();
                return this.node('assign', token, { op: next.value, lhs: left, rhs: right });
            }
            case '++':
            case '--':
                this.next();
                if (left.length > 1)
                    this.fail('unexpected ' + next.value, next);
                return this.node('incdec', token, { x: left[0], op: next.value });
            case '<-':
                this.next();
                if (left.length > 1)
                    this.fail('unexpected <-', next);
                return this.node('send', token, { ch: left[0], value: this.expression() });
            }
        }
        if (left.length > 1)
            this.fail('expected 1 expression', left[1]);
        return this.node('exprstmt', token, { x: left[0] });
    };

    GoParser.prototype.header = function (callback) {
        var saved = this.noLiteral;
        this.noLiteral = true;
        try {
            return callback.call(this);
        } finally {
            this.noLiteral = saved;
        }
    };

    GoParser.prototype.ifStatement = function () {
        var token = this.next();
        var init = null, condition = null;
        this.header(function () {
            if (this.is('{'))
                this.fail('missing condition in if statement');
            var first = this.is(';') ? null : this.simpleStatement(false);
            if (this.accept(';')) {
                init = first;
                if (this.is('{'))
                    this.fail('missing condition in if statement');
                condition = this.simpleStatement(false);
            } else {
                condition = first;
            }
        });
        if (condition.k !== 'exprstmt')
            this.fail('cannot use ' + (condition.k === 'assign' ? 'assignment' : 'statement') + ' as value', condition);
        var then = this.block();
        var otherwise = null;
        if (this.accept('else')) {
            if (this.is('if'))
                otherwise = this.ifStatement();
            else if (this.is('{'))
                otherwise = this.block();
            else
                this.fail('else must be followed by if or statement block');
        }
        return this.node('if', token, { init: init, cond: condition.x, then: then, otherwise: otherwise });
    };

    GoParser.prototype.forStatement = function () {
        var token = this.next();
        var init = null, condition = null, post = null, range = null;
        this.header(function () {
            if (this.is('{'))
                return;
            var first = this.is(';') ? null : this.simpleStatement(true);
            if (first !== null && first.k === 'range') {
                range = first;
                return;
            }
            if (this.accept(';')) {
                init = first;
                if (!this.is(';'))
                    condition = this.simpleStatement(false);
                this.expect(';');
                if (!this.is('{'))
                    post = this.simpleStatement(false);
            } else {
                condition = first;
            }
        });
        var body = this.block();
        if (range !== null) {
            range.body = body;
            return range;
        }
        if (condition !== null && condition.k !== 'exprstmt')
            this.fail('expected for loop condition', condition);
        return this.node('for', token, { init: init, cond: condition === null ? null : condition.x, post: post,
                                         body: body });
    };

    GoParser.prototype.switchStatement = function () {
        var token = this.next();
        var init = null, tag = null;
        this.header(function () {
            if (this.is('{'))
                return;
            var first = this.is(';') ? null : this.simpleStatement(false);
            if (this.accept(';')) {
                init = first;
                if (!this.is('{'))
                    tag = this.simpleStatement(false);
            } else {
                tag = first;
            }
        });
        // switch x := y.(type) / switch y.(type)
        var typeSwitch = null;
        if (tag !== null) {
            if (tag.k === 'assign' && tag.op === ':=' && tag.lhs.length === 1 && tag.rhs.length === 1 &&
                tag.rhs[0].k === 'assert' && tag.rhs[0].typeExpr === null)
                typeSwitch = { bind: tag.lhs[0].name, x: tag.rhs[0].x };
            else if (tag.k === 'exprstmt' && tag.x.k === 'assert' && tag.x.typeExpr === null)
                typeSwitch = { bind: null, x: tag.x.x };
            else if (tag.k !== 'exprstmt')
                this.fail('switch expression must be an expression', tag);
        }
        this.expect('{');
        var clauses = [];
        while (!this.is('}')) {
            var clauseToken = this.peek();
            var values = null;
            if (this.accept('case'))
                values = typeSwitch !== null ? this.typeList() : this.expressionList();
            else
                this.expect('default', "'case' or 'default'");
            this.expect(':');
            clauses.push(this.node('clause', clauseToken, { values: values, body: this.statementList() }));
        }
        this.expect('}');
        if (typeSwitch !== null)
            return this.node('typeswitch', token, { init: init, bind: typeSwitch.bind, x: typeSwitch.x, clauses: clauses });
        return this.node('switch', token, { init: init, tag: tag === null ? null : tag.x, clauses: clauses });
    };

    GoParser.prototype.typeList = function () {
        var list = [this.typeOrNil()];
        while (this.accept(','))
            list.push(this.typeOrNil());
        return list;
    };

    GoParser.prototype.typeOrNil = function () {
        var token = this.peek();
        if (token.type === 'ident' && token.value === 'nil') {
            this.next();
            return this.node('ident', token, { name: 'nil' });
        }
        return this.type();
    };

    GoParser.prototype.selectStatement = function () {
        var token = this.next();
        this.expect('{');
        var clauses = [];
        while (!this.is('}')) {
            var clauseToken = this.peek();
            var comm = null;
            if (this.accept('case'))
                comm = this.simpleStatement(false);
            else
                this.expect('default', "'case' or 'default'");
            this.expect(':');
            clauses.push(this.node('commclause', clauseToken, { comm: comm, body: this.statementList() }));
        }
        this.expect('}');
        return this.node('select', token, { clauses: clauses });
    };

    GoParser.prototype.expressionList = function () {
        var list = [this.expression()];
        while (this.accept(','))
            list.push(this.expression());
        return list;
    };

    var BINARY_PRECEDENCE = {
        '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 3, '<=': 3, '>': 3, '>=': 3,
        '+': 4, '-': 4, '|': 4, '^': 4, '*': 5, '/': 5, '%': 5, '<<': 5, '>>': 5, '&': 5, '&^': 5
    };

    GoParser.prototype.expression = function () {
        return this.binary(1);
    };

    GoParser.prototype.binary = function (minimum) {
        var left = this.unary();
        for (;;) {
            var token = this.peek();
            var precedence = token.type === 'op' ? BINARY_PRECEDENCE[token.value] : undefined;
            if (precedence === undefined || precedence < minimum)
                return left;
            this.next();
            var right = this.binary(precedence + 1);
            left = this.node('binary', token, { op: token.value, x: left, y: right });
        }
    };

    GoParser.prototype.unary = function () {
        var token = this.peek();
        if (token.type === 'op') {
            switch (token.value) {
            case '+':
            case '-':
            case '!':
            case '^':
            case '&':
                this.next();
                return this.node('unary', token, { op: token.value, x: this.unary() });
            case '<-': {
                this.next();
                // <-chan int (a type) or <-x (a receive).
                if (this.is('chan')) {
                    this.next();
                    return this.node('chantype', token, { dir: 'recv', elem: this.type() });
                }
                return this.node('unary', token, { op: '<-', x: this.unary() });
            }
            case '*':
                this.next();
                return this.node('star', token, { x: this.unary() });
            }
        }
        return this.primary();
    };

    GoParser.prototype.operand = function () {
        var token = this.peek();
        switch (token.type) {
        case 'int':
        case 'float':
        case 'imag':
        case 'rune':
        case 'string':
            this.next();
            return this.node('lit', token, { kind: token.type, value: token.value });
        case 'ident':
            this.next();
            return this.node('ident', token, { name: token.value });
        }
        if (this.is('(')) {
            this.next();
            var saved = this.noLiteral;
            this.noLiteral = false;
            var inner = this.expressionOrType();
            this.noLiteral = saved;
            this.expect(')');
            return this.node('paren', token, { x: inner });
        }
        if (this.is('func')) {
            this.next();
            var signature = this.signature();
            if (this.is('{')) {
                var saved2 = this.noLiteral;
                this.noLiteral = false;
                var body = this.block();
                this.noLiteral = saved2;
                return this.node('funclit', token, { signature: signature, body: body });
            }
            return this.node('functype', token, { signature: signature });
        }
        if (this.is('[') || this.is('struct') || this.is('map') || this.is('chan') || this.is('interface') ||
            this.is('*'))
            return this.type();
        this.fail('expected expression, found ' + this.describe(token));
    };

    GoParser.prototype.expressionOrType = function () {
        if (this.is('[') || this.is('struct') || this.is('map') || this.is('chan') || this.is('interface')) {
            var type = this.type();
            return this.primarySuffix(type);
        }
        return this.expression();
    };

    GoParser.prototype.primary = function () {
        return this.primarySuffix(this.operand());
    };

    GoParser.prototype.isLiteralType = function (node) {
        switch (node.k) {
        case 'ident':
        case 'arraytype':
        case 'slicetype':
        case 'maptype':
        case 'structtype':
        case 'instance':
            return true;
        case 'sel':
            return node.x.k === 'ident';
        case 'index':
            // A generic type with an argument: List[int]{...}
            return node.x.k === 'ident' || node.x.k === 'sel';
        }
        return false;
    };

    GoParser.prototype.primarySuffix = function (operand) {
        for (;;) {
            var token = this.peek();
            if (this.is('.')) {
                this.next();
                if (this.accept('(')) {
                    if (this.accept('type')) {
                        this.expect(')');
                        operand = this.node('assert', token, { x: operand, typeExpr: null });
                    } else {
                        var assertType = this.type();
                        this.expect(')');
                        operand = this.node('assert', token, { x: operand, typeExpr: assertType });
                    }
                    continue;
                }
                operand = this.node('sel', token, { x: operand, name: this.identifier() });
                continue;
            }
            if (this.is('[')) {
                this.next();
                var saved = this.noLiteral;
                this.noLiteral = false;
                var low = null, high = null, max = null;
                if (!this.is(':'))
                    low = this.expressionOrType();
                if (this.accept(':')) {
                    if (!this.is(']') && !this.is(':'))
                        high = this.expression();
                    if (this.accept(':')) {
                        max = this.expression();
                        if (high === null)
                            this.fail('middle index required in 3-index slice');
                    }
                    this.noLiteral = saved;
                    this.expect(']');
                    operand = this.node('slice', token, { x: operand, low: low, high: high, max: max });
                    continue;
                }
                var indices = [low];
                while (this.accept(',')) {
                    if (this.is(']'))
                        break;
                    indices.push(this.expressionOrType());
                }
                this.noLiteral = saved;
                this.expect(']');
                operand = this.node('index', token, { x: operand, index: indices[0], indices: indices });
                continue;
            }
            if (this.is('(')) {
                this.next();
                var saved3 = this.noLiteral;
                this.noLiteral = false;
                var args = [];
                var ellipsis = false;
                while (!this.is(')')) {
                    args.push(this.expressionOrType());
                    if (this.accept('...'))
                        ellipsis = true;
                    if (!this.accept(','))
                        break;
                }
                this.noLiteral = saved3;
                this.expect(')');
                operand = this.node('call', token, { fn: operand, args: args, ellipsis: ellipsis });
                continue;
            }
            if (this.is('{') && this.isLiteralType(operand) &&
                (!this.noLiteral || (operand.k !== 'ident' && operand.k !== 'sel' && operand.k !== 'index'))) {
                operand = this.compositeLiteral(operand);
                continue;
            }
            return operand;
        }
    };

    GoParser.prototype.compositeLiteral = function (type) {
        var token = this.expect('{');
        var saved = this.noLiteral;
        this.noLiteral = false;
        var elements = [];
        while (!this.is('}')) {
            var elementToken = this.peek();
            var value = this.element();
            var key = null;
            if (this.accept(':')) {
                key = value;
                value = this.element();
            }
            elements.push({ key: key, value: value, line: elementToken.line, column: elementToken.column });
            if (!this.accept(','))
                break;
        }
        this.noLiteral = saved;
        this.expect('}');
        return this.node('composite', token, { typeExpr: type, elements: elements });
    };

    // An element of a literal: an expression or a nested literal without a type {…}.
    GoParser.prototype.element = function () {
        if (this.is('{'))
            return this.compositeLiteral(this.node('elided', this.peek(), {}));
        return this.expression();
    };

    Go.lex = lex;
    Go.parse = function (text, source) {
        var parser = new GoParser(lex(text, source), source);
        return parser.file();
    };
    Go.CompileError = CompileError;
})(globalThis);
