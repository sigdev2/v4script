// C: parsing the preprocessor tokens into a tree. Types are syntax here
// (specifiers and declarators); checking gives them meaning. The parser
// tracks typedef names itself: they decide whether a declaration or an
// expression follows.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var C = T.c;
    if (C.parse)
        return;

    var CompileError = T.CompileError;

    var KEYWORDS = {};
    ('auto break case char const continue default do double else enum extern float for goto if inline int long ' +
     'register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while ' +
     '_Bool _Complex _Alignas _Alignof _Atomic _Noreturn _Static_assert _Thread_local bool true false nullptr ' +
     'static_assert alignof alignas typeof __inline __inline__ __restrict __restrict__ __attribute__ __extension__ ' +
     '__typeof__ __const __signed__ __volatile__ __asm__ asm')
        .split(' ').forEach(function (word) { KEYWORDS[word] = true; });

    var ALIASES = { __inline: 'inline', __inline__: 'inline', __restrict: 'restrict', __restrict__: 'restrict',
                    __const: 'const', __signed__: 'signed', __volatile__: 'volatile', __typeof__: 'typeof',
                    alignof: '_Alignof', alignas: '_Alignas', static_assert: '_Static_assert' };

    var TYPE_WORDS = { void: 1, char: 1, short: 1, int: 1, long: 1, float: 1, double: 1, signed: 1, unsigned: 1,
                       _Bool: 1, bool: 1, _Complex: 1 };
    var QUALIFIERS = { const: 1, volatile: 1, restrict: 1, _Atomic: 1 };
    var STORAGE = { typedef: 1, extern: 1, static: 1, auto: 1, register: 1, _Thread_local: 1 };

    // Preprocessor tokens -> parser tokens.
    function convert(tokens) {
        var result = [];
        tokens.forEach(function (item) {
            var converted = { type: item.type, value: item.value, line: item.line, column: item.column, file: item.file,
                              text: item.value };
            if (item.type === 'ident' && KEYWORDS[item.value] === true) {
                converted.type = 'keyword';
                converted.value = ALIASES[item.value] || item.value;
            } else if (item.type === 'number') {
                converted.type = /^0[xX]/.test(item.value) ? (/[pP]/.test(item.value) || /\./.test(item.value) ? 'float' : 'int')
                                                           : (/[.eE]/.test(item.value) ? 'float' : 'int');
            } else if (item.type === 'punct') {
                converted.type = 'op';
            } else if (item.type === 'other') {
                throw new CompileError("unexpected character '" + item.value + "'", item.line, item.column, item.file);
            }
            result.push(converted);
        });
        var last = tokens.length > 0 ? tokens[tokens.length - 1] : { line: 1, column: 1, file: '' };
        result.push({ type: 'eof', value: '', text: '', line: last.line, column: last.column + 1, file: last.file });
        return result;
    }

    function CParser(tokens, typedefs) {
        T.Parser.call(this, tokens, '');
        // Name scopes: name -> 'typedef' | 'ordinary'.
        this.scopes = [typedefs || {}, {}];
    }
    CParser.prototype = Object.create(T.Parser.prototype);

    CParser.prototype.fail = function (message, tok) {
        tok = tok || this.peek();
        throw new CompileError(message, tok.line, tok.column, tok.file || '');
    };

    CParser.prototype.expect = function (text, what) {
        if (!this.is(text)) {
            var message = 'expected ' + (what || "'" + text + "'");
            // A missing ";" is reported on the line that lacks it, not on the
            // next one (as clang does).
            var previous = this.index > 0 ? this.tokens[this.index - 1] : null;
            if (text === ';' && previous !== null && (previous.line !== this.peek().line || previous.file !== this.peek().file))
                throw new CompileError(message, previous.line, previous.column + previous.text.length, previous.file || '');
            this.fail(message + (this.peek().type === 'eof' ? '' : " before '" + this.peek().text + "'"));
        }
        return this.next();
    };

    CParser.prototype.node = function (kind, tok, fields) {
        var node = fields || {};
        node.k = kind;
        node.line = tok.line;
        node.column = tok.column;
        node.file = tok.file;
        return node;
    };

    CParser.prototype.pushScope = function () {
        this.scopes.push({});
    };
    CParser.prototype.popScope = function () {
        this.scopes.pop();
    };
    CParser.prototype.declareName = function (name, kind) {
        this.scopes[this.scopes.length - 1][name] = kind;
    };
    CParser.prototype.isTypedefName = function (name) {
        for (var index = this.scopes.length - 1; index >= 0; --index) {
            var kind = this.scopes[index][name];
            if (kind !== undefined)
                return kind === 'typedef';
        }
        return false;
    };

    // Whether a token starts a declaration (a type specifier or a storage class).
    CParser.prototype.startsDeclaration = function (offset) {
        var tok = this.peek(offset || 0);
        if (tok.type === 'keyword') {
            var word = tok.value;
            return TYPE_WORDS[word] === 1 || QUALIFIERS[word] === 1 || STORAGE[word] === 1 || word === 'struct' ||
                word === 'union' || word === 'enum' || word === 'inline' || word === '_Noreturn' || word === 'typeof' ||
                word === '_Alignas' || word === '_Static_assert' || word === '__attribute__' || word === '__extension__';
        }
        if (tok.type === 'ident' && this.isTypedefName(tok.value)) {
            // "T:" is a label, "T x" / "T *" / "T)" is a type.
            var next = this.peek((offset || 0) + 1);
            return !(next.type === 'op' && next.value === ':');
        }
        return false;
    };

    CParser.prototype.skipAttributes = function () {
        while (this.is('__attribute__') || this.is('__extension__') || this.is('asm') || this.is('__asm__')) {
            var word = this.next();
            if (word.value === '__extension__')
                continue;
            this.expect('(');
            var depth = 1;
            while (depth > 0) {
                var tok = this.next();
                if (tok.type === 'eof')
                    this.fail("expected ')'");
                if (tok.value === '(')
                    ++depth;
                else if (tok.value === ')')
                    --depth;
            }
        }
    };

    // --- Specifiers: { storage, inline, noreturn, qualifiers, words |
    // struct | enum | typedefName | typeofExpr }

    CParser.prototype.specifiers = function (allowStorage) {
        var tok = this.peek();
        var specs = { storage: null, inline: false, qualifiers: {}, words: [], record: null, enumType: null,
                      typedefName: null, typeofArg: null, line: tok.line, column: tok.column, file: tok.file };
        var seenType = false;
        for (;;) {
            this.skipAttributes();
            var current = this.peek();
            if (current.type === 'keyword') {
                var word = current.value;
                if (STORAGE[word] === 1) {
                    if (!allowStorage)
                        this.fail("invalid storage class specifier '" + word + "'");
                    if (specs.storage !== null && !(word === 'static' && specs.storage === '_Thread_local'))
                        this.fail('cannot combine with previous \'' + specs.storage + '\' declaration specifier');
                    specs.storage = word === 'auto' || word === 'register' || word === '_Thread_local' ? specs.storage || word : word;
                    this.next();
                    continue;
                }
                if (QUALIFIERS[word] === 1) {
                    specs.qualifiers[word] = true;
                    this.next();
                    continue;
                }
                if (word === 'inline' || word === '_Noreturn') {
                    specs.inline = true;
                    this.next();
                    continue;
                }
                if (word === '_Alignas') {
                    this.next();
                    this.skipParenthesized();
                    continue;
                }
                if (TYPE_WORDS[word] === 1) {
                    if (specs.record !== null || specs.enumType !== null || specs.typedefName !== null)
                        this.fail('cannot combine with previous declaration specifier');
                    specs.words.push(word === 'bool' ? '_Bool' : word);
                    seenType = true;
                    this.next();
                    continue;
                }
                if (word === 'struct' || word === 'union') {
                    if (seenType)
                        this.fail('cannot combine with previous declaration specifier');
                    specs.record = this.record();
                    seenType = true;
                    continue;
                }
                if (word === 'enum') {
                    if (seenType)
                        this.fail('cannot combine with previous declaration specifier');
                    specs.enumType = this.enumeration();
                    seenType = true;
                    continue;
                }
                if (word === 'typeof') {
                    this.next();
                    this.expect('(');
                    if (this.startsDeclaration())
                        specs.typeofArg = { typeName: this.typeName() };
                    else
                        specs.typeofArg = { expr: this.expression() };
                    this.expect(')');
                    seenType = true;
                    continue;
                }
            }
            if (current.type === 'ident' && !seenType && this.isTypedefName(current.value)) {
                // A typedef name is a type when no type is given yet.
                var after = this.peek(1);
                if (!(after.type === 'op' && after.value === ':')) {
                    specs.typedefName = current.value;
                    seenType = true;
                    this.next();
                    continue;
                }
            }
            break;
        }
        if (!seenType && specs.storage === null && Object.keys(specs.qualifiers).length === 0 && !specs.inline)
            this.fail('expected declaration specifiers');
        if (!seenType)
            specs.words.push('int');
        return specs;
    };

    CParser.prototype.skipParenthesized = function () {
        this.expect('(');
        var depth = 1;
        while (depth > 0) {
            var tok = this.next();
            if (tok.type === 'eof')
                this.fail("expected ')'");
            if (tok.value === '(')
                ++depth;
            else if (tok.value === ')')
                --depth;
        }
    };

    CParser.prototype.record = function () {
        var tok = this.next();
        this.skipAttributes();
        var tag = this.peek().type === 'ident' ? this.next().value : null;
        this.skipAttributes();
        var fields = null;
        if (this.accept('{')) {
            fields = [];
            while (!this.accept('}')) {
                if (this.is('_Static_assert')) {
                    fields.push({ staticAssert: this.staticAssert() });
                    continue;
                }
                var fieldToken = this.peek();
                var specs = this.specifiers(false);
                var declarators = [];
                if (!this.is(';')) {
                    do {
                        var declarator = this.is(':') ? { name: null, pointers: [], suffixes: [], inner: null,
                                                          line: this.peek().line, column: this.peek().column }
                                                      : this.declarator(false);
                        var width = null;
                        if (this.accept(':'))
                            width = this.conditional();
                        this.skipAttributes();
                        declarators.push({ declarator: declarator, width: width });
                    } while (this.accept(','));
                }
                this.expect(';', "';' at end of declaration list");
                fields.push({ specs: specs, declarators: declarators, line: fieldToken.line, column: fieldToken.column,
                              file: fieldToken.file });
            }
        }
        if (tag === null && fields === null)
            this.fail('declaration of anonymous ' + tok.value + ' must be a definition', tok);
        this.skipAttributes();
        return this.node('record', tok, { kind: tok.value, tag: tag, fields: fields });
    };

    CParser.prototype.enumeration = function () {
        var tok = this.next();
        var tag = this.peek().type === 'ident' ? this.next().value : null;
        var fixedType = null;
        if (this.is(':') && tag !== null) {
            this.next();
            fixedType = this.typeName();
        }
        var items = null;
        if (this.accept('{')) {
            items = [];
            while (!this.accept('}')) {
                var itemToken = this.peek();
                if (itemToken.type !== 'ident')
                    this.fail('expected identifier');
                this.next();
                var value = null;
                if (this.accept('='))
                    value = this.conditional();
                items.push({ name: itemToken.value, value: value, line: itemToken.line, column: itemToken.column,
                             file: itemToken.file });
                this.declareName(itemToken.value, 'ordinary');
                if (!this.accept(',')) {
                    this.expect('}');
                    break;
                }
            }
        }
        if (tag === null && items === null)
            this.fail('expected identifier or \'{\'', this.peek());
        return this.node('enum', tok, { tag: tag, items: items, fixedType: fixedType });
    };

    // --- Declarators: { name, pointers: [qualifiers], suffixes, inner }

    CParser.prototype.declarator = function (abstract) {
        var tok = this.peek();
        var pointers = [];
        this.skipAttributes();
        while (this.is('*')) {
            this.next();
            var qualifiers = {};
            while (this.peek().type === 'keyword' && QUALIFIERS[this.peek().value] === 1)
                qualifiers[this.next().value] = true;
            this.skipAttributes();
            pointers.push(qualifiers);
        }
        var name = null, inner = null;
        var nameToken = this.peek();
        if (this.peek().type === 'ident') {
            name = this.next().value;
        } else if (this.is('(') && this.isNestedDeclarator(abstract)) {
            this.next();
            inner = this.declarator(abstract);
            this.expect(')');
        } else if (!abstract) {
            this.fail('expected identifier or \'(\'');
        }
        var suffixes = [];
        for (;;) {
            this.skipAttributes();
            if (this.is('[')) {
                var bracket = this.next();
                var isStatic = false;
                while (this.is('static') || (this.peek().type === 'keyword' && QUALIFIERS[this.peek().value] === 1)) {
                    if (this.next().value === 'static')
                        isStatic = true;
                }
                var size = null;
                var star = false;
                if (this.is('*') && this.is(']', 1)) {
                    this.next();
                    star = true;
                } else if (!this.is(']')) {
                    size = this.assignment();
                }
                this.expect(']');
                suffixes.push({ k: 'array', size: size, star: star, isStatic: isStatic, line: bracket.line, column: bracket.column });
                continue;
            }
            if (this.is('(')) {
                suffixes.push(this.parameters());
                continue;
            }
            break;
        }
        // The name from a nested declarator (int (*f)(int)) also outside.
        if (inner !== null && inner.name !== null)
            return { name: inner.name, pointers: pointers, suffixes: suffixes, inner: inner, line: inner.line, column: inner.column,
                     file: inner.file, startLine: tok.line };
        return { name: name, pointers: pointers, suffixes: suffixes, inner: inner, line: nameToken.line,
                 column: nameToken.column, file: nameToken.file, startLine: tok.line };
    };

    // "(" in a declarator: a nested declarator or a parameter list (of an
    // abstract declarator).
    CParser.prototype.isNestedDeclarator = function (abstract) {
        if (!abstract)
            return true;
        var next = this.peek(1);
        if (next.type === 'op' && (next.value === '*' || next.value === '(' || next.value === '['))
            return true;
        if (next.type === 'ident' && !this.isTypedefName(next.value))
            return true;
        return false;
    };

    CParser.prototype.parameters = function () {
        var tok = this.expect('(');
        var params = [];
        var variadic = false;
        var unspecified = false;
        this.pushScope();
        if (this.is(')')) {
            unspecified = true;
        } else if (this.is('void') && this.is(')', 1)) {
            this.next();
        } else {
            for (;;) {
                if (this.accept('...')) {
                    variadic = true;
                    break;
                }
                var paramToken = this.peek();
                if (paramToken.type === 'ident' && !this.isTypedefName(paramToken.value)) {
                    // The old style: f(a, b) - names without types.
                    this.next();
                    params.push({ specs: null, declarator: { name: paramToken.value, pointers: [], suffixes: [], inner: null,
                                                             line: paramToken.line, column: paramToken.column },
                                  line: paramToken.line, column: paramToken.column, file: paramToken.file, oldStyle: true });
                } else {
                    var specs = this.specifiers(true);
                    var declarator = this.declarator(true);
                    if (declarator.name !== null)
                        this.declareName(declarator.name, 'ordinary');
                    params.push({ specs: specs, declarator: declarator, line: paramToken.line, column: paramToken.column,
                                  file: paramToken.file });
                }
                if (!this.accept(','))
                    break;
            }
        }
        this.popScope();
        this.expect(')');
        return { k: 'function', params: params, variadic: variadic, unspecified: unspecified, line: tok.line,
                 column: tok.column };
    };

    CParser.prototype.typeName = function () {
        var tok = this.peek();
        var specs = this.specifiers(false);
        var declarator = this.declarator(true);
        return this.node('typename', tok, { specs: specs, declarator: declarator });
    };

    // --- Declarations

    CParser.prototype.staticAssert = function () {
        var tok = this.next();
        this.expect('(');
        var condition = this.conditional();
        var message = null;
        if (this.accept(','))
            message = this.primary();
        this.expect(')');
        this.expect(';');
        return this.node('staticassert', tok, { condition: condition, message: message });
    };

    // A declaration or a function definition; topLevel - at the top level.
    CParser.prototype.declaration = function (topLevel) {
        if (this.is('_Static_assert'))
            return this.staticAssert();
        var tok = this.peek();
        var specs = this.specifiers(true);
        var declarators = [];
        if (this.accept(';'))
            return this.node('decl', tok, { specs: specs, declarators: declarators });
        for (;;) {
            var declarator = this.declarator(false);
            this.skipAttributes();
            var isTypedef = specs.storage === 'typedef';
            this.declareName(declarator.name, isTypedef ? 'typedef' : 'ordinary');
            // A function definition.
            if (topLevel && declarators.length === 0 && this.is('{') && isFunctionDeclarator(declarator)) {
                var functionDeclarator = declarator;
                this.pushScope();
                // The parameters are visible in the body.
                var suffix = innermostFunction(functionDeclarator);
                var self = this;
                suffix.params.forEach(function (param) {
                    if (param.declarator.name !== null)
                        self.declareName(param.declarator.name, 'ordinary');
                });
                var body = this.compound(false);
                this.popScope();
                return this.node('funcdef', tok, { specs: specs, declarator: functionDeclarator, body: body });
            }
            // The old style: int f(a, b) int a; int b; { ... }
            if (topLevel && declarators.length === 0 && isFunctionDeclarator(declarator) &&
                innermostFunction(declarator).params.some(function (param) { return param.oldStyle; })) {
                var oldParams = [];
                while (!this.is('{'))
                    oldParams.push(this.declaration(false));
                var oldFunction = innermostFunction(declarator);
                oldParams.forEach(function (paramDecl) {
                    paramDecl.declarators.forEach(function (item) {
                        oldFunction.params.forEach(function (param) {
                            if (param.declarator.name === item.declarator.name) {
                                param.specs = paramDecl.specs;
                                param.declarator = item.declarator;
                                param.oldStyle = false;
                            }
                        });
                    });
                });
                this.pushScope();
                var oldBody = this.compound(false);
                this.popScope();
                return this.node('funcdef', tok, { specs: specs, declarator: declarator, body: oldBody });
            }
            var init = null;
            if (this.accept('='))
                init = this.initializer();
            declarators.push({ declarator: declarator, init: init });
            if (!this.accept(','))
                break;
        }
        this.expect(';', "';' after declaration");
        return this.node('decl', tok, { specs: specs, declarators: declarators });
    };

    // The first thing a name turns into: a suffix (array, function),
    // 'pointer' or null. Suffixes bind tighter than the pointers of a level.
    function firstDerivation(declarator) {
        var levels = [];
        for (var current = declarator; current !== null; current = current.inner)
            levels.push(current);
        for (var index = levels.length - 1; index >= 0; --index) {
            var level = levels[index];
            if (level.suffixes.length > 0)
                return level.suffixes[0];
            if (level.pointers.length > 0)
                return 'pointer';
        }
        return null;
    }

    // The function suffix of the name itself (its parameters are visible in the body) or null.
    function innermostFunction(declarator) {
        var first = firstDerivation(declarator);
        return first !== null && first !== 'pointer' && first.k === 'function' ? first : null;
    }

    function isFunctionDeclarator(declarator) {
        return innermostFunction(declarator) !== null;
    }
    C.isFunctionDeclarator = isFunctionDeclarator;

    CParser.prototype.initializer = function () {
        if (this.is('{')) {
            var tok = this.next();
            var items = [];
            while (!this.accept('}')) {
                var designators = [];
                var itemToken = this.peek();
                for (;;) {
                    if (this.accept('.')) {
                        var field = this.peek();
                        if (field.type !== 'ident')
                            this.fail('expected a field designator');
                        this.next();
                        designators.push({ field: field.value, line: field.line, column: field.column });
                    } else if (this.is('[')) {
                        this.next();
                        var index = this.conditional();
                        var last = null;
                        if (this.accept('...'))
                            last = this.conditional();
                        this.expect(']');
                        designators.push({ index: index, last: last });
                    } else {
                        break;
                    }
                }
                if (designators.length > 0)
                    this.expect('=');
                items.push({ designators: designators, value: this.initializer(), line: itemToken.line,
                             column: itemToken.column });
                if (!this.accept(',')) {
                    this.expect('}');
                    break;
                }
            }
            return this.node('initlist', tok, { items: items });
        }
        return this.assignment();
    };

    // --- Statements

    CParser.prototype.compound = function (newScope) {
        var tok = this.expect('{');
        if (newScope !== false)
            this.pushScope();
        var items = [];
        while (!this.is('}')) {
            if (this.peek().type === 'eof')
                this.fail("expected '}'");
            items.push(this.blockItem());
        }
        var end = this.next();
        if (newScope !== false)
            this.popScope();
        return this.node('block', tok, { items: items, endLine: end.line });
    };

    CParser.prototype.blockItem = function () {
        if (this.startsDeclaration())
            return this.declaration(false);
        return this.statement();
    };

    CParser.prototype.statement = function () {
        var tok = this.peek();
        if (tok.type === 'ident' && this.is(':', 1) && !this.is('::', 1)) {
            this.next();
            this.next();
            var labeled = this.is('}') ? this.node('empty', tok, {}) : this.statement();
            return this.node('label', tok, { name: tok.value, stmt: labeled });
        }
        if (tok.type === 'keyword') {
            switch (tok.value) {
            case 'if': {
                this.next();
                this.expect('(');
                var condition = this.expression();
                this.expect(')');
                var then = this.substatement();
                var otherwise = null;
                if (this.accept('else'))
                    otherwise = this.substatement();
                return this.node('if', tok, { cond: condition, then: then, otherwise: otherwise });
            }
            case 'while': {
                this.next();
                this.expect('(');
                var whileCondition = this.expression();
                this.expect(')');
                return this.node('while', tok, { cond: whileCondition, body: this.substatement() });
            }
            case 'do': {
                this.next();
                var body = this.substatement();
                this.expect('while');
                this.expect('(');
                var doCondition = this.expression();
                this.expect(')');
                this.expect(';', "';' after do/while statement");
                return this.node('do', tok, { body: body, cond: doCondition });
            }
            case 'for': {
                this.next();
                this.expect('(');
                this.pushScope();
                var init = null;
                if (this.startsDeclaration()) {
                    init = this.declaration(false);
                } else if (!this.accept(';')) {
                    init = this.node('exprstmt', this.peek(), { expr: this.expression() });
                    this.expect(';');
                }
                var forCondition = this.is(';') ? null : this.expression();
                this.expect(';');
                var step = this.is(')') ? null : this.expression();
                this.expect(')');
                var forBody = this.substatement();
                this.popScope();
                return this.node('for', tok, { init: init, cond: forCondition, step: step, body: forBody });
            }
            case 'switch': {
                this.next();
                this.expect('(');
                var discriminant = this.expression();
                this.expect(')');
                return this.node('switch', tok, { expr: discriminant, body: this.substatement() });
            }
            case 'case': {
                this.next();
                var value = this.conditional();
                var high = null;
                if (this.accept('...'))
                    high = this.conditional();
                this.expect(':', "':' after 'case'");
                var caseStatement = this.is('}') ? this.node('empty', tok, {}) : this.statement();
                return this.node('case', tok, { value: value, high: high, stmt: caseStatement });
            }
            case 'default': {
                this.next();
                this.expect(':', "':' after 'default'");
                var defaultStatement = this.is('}') ? this.node('empty', tok, {}) : this.statement();
                return this.node('default', tok, { stmt: defaultStatement });
            }
            case 'break':
            case 'continue':
                this.next();
                this.expect(';', "';' after " + tok.value + ' statement');
                return this.node(tok.value, tok, {});
            case 'return': {
                this.next();
                var result = this.is(';') ? null : this.expression();
                this.expect(';', "';' after return statement");
                return this.node('return', tok, { expr: result });
            }
            case 'goto': {
                this.next();
                var target = this.peek();
                if (target.type !== 'ident')
                    this.fail('expected identifier');
                this.next();
                this.expect(';', "';' after goto statement");
                return this.node('goto', tok, { label: target.value });
            }
            case '_Static_assert':
                return this.staticAssert();
            }
        }
        if (this.is('{'))
            return this.compound(true);
        if (this.accept(';'))
            return this.node('empty', tok, {});
        var expression = this.expression();
        this.expect(';', "';' after expression");
        return this.node('exprstmt', tok, { expr: expression });
    };

    // A substatement: a name scope of its own (C99).
    CParser.prototype.substatement = function () {
        this.pushScope();
        var statement = this.statement();
        this.popScope();
        return statement;
    };

    // --- Expressions

    CParser.prototype.expression = function () {
        var tok = this.peek();
        var first = this.assignment();
        if (!this.is(','))
            return first;
        var list = [first];
        while (this.accept(','))
            list.push(this.assignment());
        return this.node('comma', tok, { list: list });
    };

    var ASSIGNMENT = { '=': 1, '+=': 1, '-=': 1, '*=': 1, '/=': 1, '%=': 1, '<<=': 1, '>>=': 1, '&=': 1, '^=': 1, '|=': 1 };

    CParser.prototype.assignment = function () {
        var tok = this.peek();
        var left = this.conditional();
        var operator = this.peek();
        if (operator.type === 'op' && ASSIGNMENT[operator.value] === 1) {
            this.next();
            var right = this.assignment();
            return this.node('assign', operator, { op: operator.value, target: left, source: right, start: tok });
        }
        return left;
    };

    CParser.prototype.conditional = function () {
        var condition = this.binary(1);
        if (this.is('?')) {
            var tok = this.next();
            var then = this.is(':') ? null : this.expression();
            this.expect(':');
            var otherwise = this.conditional();
            return this.node('cond', tok, { cond: condition, then: then, otherwise: otherwise });
        }
        return condition;
    };

    var BINARY = {
        '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5, '==': 6, '!=': 6, '<': 7, '>': 7, '<=': 7, '>=': 7,
        '<<': 8, '>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10
    };

    CParser.prototype.binary = function (minimum) {
        var left = this.cast();
        for (;;) {
            var tok = this.peek();
            var precedence = tok.type === 'op' ? BINARY[tok.value] : undefined;
            if (precedence === undefined || precedence < minimum)
                return left;
            this.next();
            var right = this.binary(precedence + 1);
            left = this.node('binary', tok, { op: tok.value, left: left, right: right });
        }
    };

    CParser.prototype.cast = function () {
        var tok = this.peek();
        if (this.is('(') && this.startsDeclaration(1)) {
            this.next();
            var typeName = this.typeName();
            this.expect(')');
            if (this.is('{')) {
                // A compound literal (T){...}
                var init = this.initializer();
                return this.postfix(this.node('compound', tok, { typeName: typeName, init: init }));
            }
            return this.node('cast', tok, { typeName: typeName, expr: this.cast() });
        }
        return this.unary();
    };

    CParser.prototype.unary = function () {
        var tok = this.peek();
        if (tok.type === 'op') {
            switch (tok.value) {
            case '++':
            case '--':
                this.next();
                return this.node('preinc', tok, { op: tok.value, expr: this.unary() });
            case '&':
            case '*':
            case '+':
            case '-':
            case '~':
            case '!':
                this.next();
                return this.node('unary', tok, { op: tok.value, expr: this.cast() });
            case '&&':
                this.fail('labels as values are not supported');
            }
        }
        if (this.is('sizeof') || this.is('_Alignof')) {
            this.next();
            if (this.is('(') && this.startsDeclaration(1)) {
                this.next();
                var typeName = this.typeName();
                this.expect(')');
                if (this.is('{'))
                    return this.node(tok.value === 'sizeof' ? 'sizeof' : 'alignof', tok,
                                     { expr: this.postfix(this.node('compound', tok, { typeName: typeName, init: this.initializer() })) });
                return this.node(tok.value === 'sizeof' ? 'sizeof' : 'alignof', tok, { typeName: typeName });
            }
            return this.node(tok.value === 'sizeof' ? 'sizeof' : 'alignof', tok, { expr: this.unary() });
        }
        return this.postfix(this.primary());
    };

    CParser.prototype.postfix = function (expr) {
        for (;;) {
            var tok = this.peek();
            if (this.is('[')) {
                this.next();
                var index = this.expression();
                this.expect(']');
                expr = this.node('index', tok, { expr: expr, index: index });
                continue;
            }
            if (this.is('(')) {
                this.next();
                var args = [];
                while (!this.is(')')) {
                    args.push(this.assignment());
                    if (!this.accept(','))
                        break;
                }
                this.expect(')');
                expr = this.node('call', tok, { fn: expr, args: args });
                continue;
            }
            if (this.is('.') || this.is('->')) {
                this.next();
                var name = this.peek();
                if (name.type !== 'ident')
                    this.fail('expected identifier');
                this.next();
                expr = this.node('member', tok, { expr: expr, name: name.value, arrow: tok.value === '->' });
                continue;
            }
            if (this.is('++') || this.is('--')) {
                this.next();
                expr = this.node('postinc', tok, { op: tok.value, expr: expr });
                continue;
            }
            return expr;
        }
    };

    CParser.prototype.primary = function () {
        var tok = this.peek();
        switch (tok.type) {
        case 'ident':
            this.next();
            // Built-ins with a type name among the arguments (va_arg, offsetof).
            if (tok.value === '__builtin_va_arg') {
                this.expect('(');
                var list = this.assignment();
                this.expect(',');
                var argType = this.typeName();
                this.expect(')');
                return this.node('vaarg', tok, { ap: list, typeName: argType });
            }
            if (tok.value === '__builtin_va_start' || tok.value === '__builtin_va_end') {
                this.expect('(');
                var ap = this.assignment();
                // The second argument of va_start (the last parameter) is not needed.
                if (this.accept(','))
                    this.assignment();
                this.expect(')');
                return this.node(tok.value === '__builtin_va_start' ? 'vastart' : 'vaend', tok, { ap: ap });
            }
            if (tok.value === '__builtin_va_copy') {
                this.expect('(');
                var destination = this.assignment();
                this.expect(',');
                var source = this.assignment();
                this.expect(')');
                return this.node('vacopy', tok, { ap: destination, source: source });
            }
            if (tok.value === '__builtin_offsetof') {
                this.expect('(');
                var recordType = this.typeName();
                this.expect(',');
                var path = [];
                do {
                    var member = this.peek();
                    if (member.type !== 'ident')
                        this.fail('expected identifier');
                    this.next();
                    path.push(member.value);
                } while (this.accept('.'));
                this.expect(')');
                return this.node('offsetof', tok, { typeName: recordType, path: path });
            }
            return this.node('ident', tok, { name: tok.value });
        case 'int':
        case 'float':
            this.next();
            return this.node(tok.type === 'int' ? 'int' : 'float', tok, { text: tok.value });
        case 'char':
            this.next();
            return this.node('char', tok, { value: C.parseCharToken(tok), wide: /^[LuU]/.test(tok.value) });
        case 'string': {
            // Adjacent strings are joined.
            var parts = [];
            var wide = false;
            while (this.peek().type === 'string') {
                var part = this.next();
                var decoded = C.decodeQuoted(part);
                wide = wide || decoded.wide;
                parts = parts.concat(decoded.bytes);
            }
            return this.node('string', tok, { bytes: parts, wide: wide });
        }
        case 'keyword':
            if (tok.value === 'true' || tok.value === 'false') {
                this.next();
                return this.node('bool', tok, { value: tok.value === 'true' });
            }
            if (tok.value === 'nullptr') {
                this.next();
                return this.node('nullptr', tok, {});
            }
            break;
        case 'op':
            if (tok.value === '(') {
                this.next();
                if (this.is('{'))
                    this.fail('statement expressions are not supported');
                var inner = this.expression();
                this.expect(')');
                return this.node('paren', tok, { expr: inner });
            }
            break;
        }
        this.fail(tok.type === 'eof' ? 'expected expression' : "expected expression before '" + tok.text + "'");
    };

    // --- A file: top-level declarations and statements (as the body of main)

    CParser.prototype.translationUnit = function () {
        var items = [];
        while (this.peek().type !== 'eof') {
            if (this.accept(';'))
                continue;
            if (this.startsDeclaration()) {
                items.push(this.declaration(true));
            } else {
                // A function without a type (old C): name(params) { ... }
                if (this.peek().type === 'ident' && this.is('(', 1) && this.looksLikeImplicitFunction())
                    this.fail("type specifier missing, defaults to 'int'; ISO C99 and later do not support implicit int");
                items.push(this.statement());
            }
        }
        return { k: 'unit', items: items };
    };

    CParser.prototype.looksLikeImplicitFunction = function () {
        var depth = 0;
        for (var offset = 1; ; ++offset) {
            var tok = this.peek(offset);
            if (tok.type === 'eof')
                return false;
            if (tok.value === '(') {
                ++depth;
            } else if (tok.value === ')') {
                --depth;
                if (depth === 0)
                    return this.is('{', offset + 1);
            }
        }
    };

    C.parse = function (tokens, typedefs) {
        var parser = new CParser(convert(tokens), typedefs);
        var unit = parser.translationUnit();
        unit.typedefs = parser.scopes[1];
        return unit;
    };
    C.KEYWORDS = KEYWORDS;
})(globalThis);
