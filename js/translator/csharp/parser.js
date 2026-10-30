// C#: parsing into a tree - the base, names, types, attributes and the
// declarations of a compilation unit. Statements are in
// parser-statements.js, expressions and patterns in parser-expressions.js.
// A unit is like a C# script: using directives, namespaces, types and
// top-level statements in any order.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    if (CS.Parser)
        return;

    var CompileError = T.CompileError;

    // Keywords that are types.
    var PREDEFINED = { bool: 1, byte: 1, sbyte: 1, short: 1, ushort: 1, int: 1, uint: 1, long: 1, ulong: 1, char: 1,
                       float: 1, double: 1, decimal: 1, string: 1, object: 1, void: 1 };
    CS.PREDEFINED = PREDEFINED;

    var MODIFIERS = { public: 1, private: 1, protected: 1, internal: 1, static: 1, abstract: 1, sealed: 1, virtual: 1,
                      override: 1, readonly: 1, extern: 1, unsafe: 1, volatile: 1, new: 1, const: 1 };
    // Contextual modifiers: words that are modifiers before a declaration.
    var CONTEXTUAL_MODIFIERS = { partial: 1, async: 1, required: 1, file: 1, scoped: 1 };

    function CSharpParser(tokens, source) {
        T.Parser.call(this, tokens, source);
        // Inside an async function: await is an operator.
        this.inAsync = false;
        // A type is parsed inside an expression (is, as, a cast, a pattern).
        this.typeContextExpression = false;
    }
    CSharpParser.prototype = Object.create(T.Parser.prototype);
    CSharpParser.prototype.constructor = CSharpParser;
    CS.Parser = CSharpParser;

    CSharpParser.prototype.error = function (code, message, token) {
        token = token || this.peek();
        throw new CompileError('error ' + code + ': ' + message, token.line, token.column, this.source);
    };

    // "X expected" is reported after the previous token when the next one
    // is on another line, as csc does.
    CSharpParser.prototype.expected = function (text) {
        var token = this.peek();
        var previous = this.index > 0 ? this.tokens[this.index - 1] : null;
        var codes = { ';': 'CS1002', ')': 'CS1026', '}': 'CS1513', '{': 'CS1514', identifier: 'CS1001', ']': 'CS1003',
                      '>': 'CS1003', type: 'CS1031' };
        var code = codes[text] || 'CS1003';
        var message;
        if (text === 'identifier')
            message = 'Identifier expected';
        else if (text === 'type')
            message = 'Type expected';
        else if (code === 'CS1003')
            message = "Syntax error, '" + text + "' expected";
        else
            message = text + ' expected';
        if (previous !== null && (token.newline || token.type === 'eof') && (text === ';' || text === ')' || text === ']' || text === ','))
            throw new CompileError('error ' + code + ': ' + message, previous.line, previous.column + previous.text.length,
                                   this.source);
        throw new CompileError('error ' + code + ': ' + message, token.line, token.column, this.source);
    };

    CSharpParser.prototype.expect = function (text) {
        if (!this.is(text))
            this.expected(text);
        return this.next();
    };

    CSharpParser.prototype.node = function (kind, token, fields) {
        var node = fields || {};
        node.k = kind;
        node.line = token.line;
        node.column = token.column;
        return node;
    };

    CSharpParser.prototype.isIdent = function (offset, value) {
        var token = this.peek(offset);
        return token.type === 'ident' && (value === undefined || token.value === value);
    };

    // A contextual keyword: an identifier with this text (not @text).
    CSharpParser.prototype.isWord = function (word, offset) {
        var token = this.peek(offset);
        return token.type === 'ident' && token.value === word && !token.verbatim;
    };

    CSharpParser.prototype.identifier = function () {
        var token = this.peek();
        if (token.type !== 'ident') {
            if (token.type === 'keyword')
                this.error('CS1041', "Identifier expected; '" + token.value + "' is a keyword");
            this.expected('identifier');
        }
        this.next();
        return token.value;
    };

    // Two tokens stand side by side (">" ">" is a shift).
    CSharpParser.prototype.adjacent = function (offset) {
        var first = this.peek(offset), second = this.peek(offset + 1);
        return first.end === second.start && second.type !== 'eof';
    };

    // A parse attempt: on an error or a null result - a rollback and null.
    CSharpParser.prototype.attempt = function (callback) {
        var saved = this.index;
        var savedAsync = this.inAsync;
        var savedContext = this.typeContextExpression;
        try {
            var result = callback.call(this);
            if (result === null || result === undefined) {
                this.index = saved;
                return null;
            }
            return result;
        } catch (error) {
            if (!(error instanceof CompileError))
                throw error;
            this.index = saved;
            this.inAsync = savedAsync;
            this.typeContextExpression = savedContext;
            return null;
        }
    };

    // Runs a check from the current position and goes back.
    CSharpParser.prototype.lookahead = function (callback) {
        var saved = this.index;
        try {
            return callback.call(this);
        } catch (error) {
            if (!(error instanceof CompileError))
                throw error;
            return false;
        } finally {
            this.index = saved;
        }
    };

    // --- Attributes and modifiers

    // [A, B(1)] [return: C] ... - names and arguments are kept: [Flags]
    // and a few others matter.
    CSharpParser.prototype.attributes = function () {
        var list = [];
        while (this.is('[') && !this.startsCollectionStatement()) {
            this.next();
            if ((this.peek().type === 'ident' || this.peek().type === 'keyword') && this.is(':', 1)) {
                this.next();
                this.next();
            }
            for (;;) {
                var token = this.peek();
                var name = this.qualifiedName();
                var args = [];
                if (this.is('('))
                    args = this.argumentList('(', ')');
                list.push(this.node('attribute', token, { name: name, args: args }));
                if (!this.accept(','))
                    break;
                if (this.is(']'))
                    break;
            }
            this.expect(']');
        }
        return list;
    };

    // An attribute list is not a collection expression at the start of a
    // statement: [1, 2].ToString(); is rare, attributes on local functions
    // are not.
    CSharpParser.prototype.startsCollectionStatement = function () {
        return false;
    };

    CSharpParser.prototype.modifiers = function () {
        var mods = {};
        for (;;) {
            var token = this.peek();
            if (token.type === 'keyword' && MODIFIERS[token.value] === 1) {
                // "new" is an expression in a statement; a modifier only
                // before a declaration.
                if (token.value === 'new' && !this.isModifierNew())
                    break;
                if (mods[token.value])
                    this.error('CS1004', "Duplicate '" + token.value + "' modifier");
                mods[token.value] = true;
                this.next();
                continue;
            }
            if (token.type === 'ident' && !token.verbatim && CONTEXTUAL_MODIFIERS[token.value] === 1 &&
                this.contextualModifier(token.value)) {
                mods[token.value] = true;
                this.next();
                continue;
            }
            // ref struct: an ordinary struct here.
            if (token.type === 'keyword' && token.value === 'ref' &&
                (this.is('struct', 1) || (this.isWord('partial', 1) && this.is('struct', 2)))) {
                mods.ref = true;
                this.next();
                continue;
            }
            break;
        }
        return mods;
    };

    // "new" before a declaration (new class, new int x) is a modifier.
    CSharpParser.prototype.isModifierNew = function () {
        var next = this.peek(1);
        if (next.type === 'keyword' && (MODIFIERS[next.value] === 1 || next.value === 'class' || next.value === 'struct' ||
                                       next.value === 'interface' || next.value === 'enum' || next.value === 'delegate' ||
                                       next.value === 'event' || next.value === 'void'))
            return true;
        if (next.type === 'ident' && (CONTEXTUAL_MODIFIERS[next.value] === 1 || next.value === 'record'))
            return true;
        // new Type Name ... - a member that hides another.
        return this.lookahead(function () {
            this.next();
            this.type();
            return this.peek().type === 'ident' || this.is('this');
        });
    };

    // partial, async, required, file, scoped are modifiers only when a
    // declaration follows.
    CSharpParser.prototype.contextualModifier = function (word) {
        var next = this.peek(1);
        if (word === 'async') {
            // async x => ..., async (x) => ..., async delegate are expressions.
            if (next.type === 'ident' && this.is('=>', 2))
                return false;
            if (next.type === 'op' && next.value === '(')
                return this.lookahead(function () {
                    this.next();
                    this.skipBalanced('(', ')');
                    return !this.is('=>');
                });
            if (next.type === 'keyword' && next.value === 'delegate')
                return false;
        }
        if (next.type === 'keyword')
            return MODIFIERS[next.value] === 1 || PREDEFINED[next.value] === 1 || next.value === 'class' ||
                next.value === 'struct' || next.value === 'interface' || next.value === 'enum' || next.value === 'delegate' ||
                next.value === 'event' || next.value === 'ref';
        if (next.type === 'ident')
            return true;
        return next.type === 'op' && next.value === '(' && word !== 'scoped';
    };

    // Skips from an opening token to the matching closing one (included).
    CSharpParser.prototype.skipBalanced = function (open, close) {
        var depth = 0;
        for (;;) {
            var token = this.next();
            if (token.type === 'eof')
                this.expected(close);
            if (token.type === 'op' && token.value === open)
                ++depth;
            else if (token.type === 'op' && token.value === close && --depth === 0)
                return;
        }
    };

    CSharpParser.prototype.qualifiedName = function () {
        var name = this.identifier();
        if (this.is('::')) {
            this.next();
            name += '::' + this.identifier();
        }
        while (this.is('.') && this.peek(1).type === 'ident') {
            this.next();
            name += '.' + this.identifier();
        }
        return name;
    };

    // --- Types

    // A type argument list <...>; null if what follows is not one.
    CSharpParser.prototype.typeArgumentList = function () {
        this.expect('<');
        var args = [];
        // Unbound generic names: typeof(Dictionary<,>).
        if (this.is(',') || this.is('>')) {
            var count = 1;
            while (this.accept(','))
                ++count;
            this.expect('>');
            for (var index = 0; index < count; ++index)
                args.push(null);
            args.unbound = true;
            return args;
        }
        for (;;) {
            this.attributes();
            args.push(this.nestedType());
            if (!this.accept(','))
                break;
        }
        this.expect('>');
        return args;
    };

    // A simple name with optional type arguments: List<int>.
    CSharpParser.prototype.simpleTypeName = function () {
        var token = this.peek();
        var name = this.identifier();
        var args = null;
        if (this.is('<'))
            args = this.typeArgumentList();
        return this.node('tname', token, { name: name, args: args });
    };

    // A type without the array and nullable suffixes: a predefined type,
    // a (qualified) name, a tuple.
    CSharpParser.prototype.nonArrayType = function () {
        var token = this.peek();
        if (token.type === 'keyword' && PREDEFINED[token.value] === 1) {
            this.next();
            return this.node('predef', token, { name: token.value });
        }
        if (token.type === 'op' && token.value === '(')
            return this.tupleType();
        if (token.type !== 'ident')
            this.expected('type');
        var type;
        if (this.is('::', 1)) {
            var alias = this.identifier();
            this.next();
            type = this.node('alias', token, { alias: alias, name: this.simpleTypeName() });
        } else {
            type = this.simpleTypeName();
        }
        while (this.is('.') && this.peek(1).type === 'ident') {
            var dot = this.next();
            type = this.node('qname', dot, { left: type, right: this.simpleTypeName() });
        }
        return type;
    };

    // (int, string name)
    CSharpParser.prototype.tupleType = function () {
        var token = this.expect('(');
        var elems = [];
        for (;;) {
            var elemToken = this.peek();
            var type = this.nestedType();
            var name = null;
            if (this.peek().type === 'ident')
                name = this.identifier();
            elems.push(this.node('telem', elemToken, { type: type, name: name }));
            if (!this.accept(','))
                break;
        }
        this.expect(')');
        if (elems.length < 2)
            this.error('CS8124', 'Tuple must contain at least two elements.', token);
        return this.node('tuple', token, { elems: elems });
    };

    // Array rank specifiers [] [,] after a type.
    CSharpParser.prototype.rankSpecifiers = function () {
        var ranks = [];
        while (this.is('[') && (this.is(']', 1) || this.is(',', 1))) {
            this.next();
            var rank = 1;
            while (this.accept(','))
                ++rank;
            this.expect(']');
            ranks.push(rank);
        }
        return ranks;
    };

    // int[][,]: an array of two-dimensional arrays; the leftmost rank is
    // the outermost array.
    CSharpParser.prototype.arrayOf = function (elem, ranks, token) {
        var type = elem;
        for (var index = ranks.length - 1; index >= 0; --index)
            type = this.node('array', token, { elem: type, rank: ranks[index] });
        return type;
    };

    // A type: T, T?, T[], T*, (A, B), with suffixes in any combination.
    CSharpParser.prototype.type = function () {
        var token = this.peek();
        var type = this.nonArrayType();
        return this.typeSuffixes(type, token);
    };

    CSharpParser.prototype.typeSuffixes = function (type, token) {
        for (;;) {
            if (this.is('?') && !this.questionIsConditional()) {
                this.next();
                type = this.node('nullable', token, { elem: type });
                continue;
            }
            if (this.is('[') && (this.is(']', 1) || this.is(',', 1))) {
                type = this.arrayOf(type, this.rankSpecifiers(), token);
                continue;
            }
            if (this.is('*')) {
                this.error('CS0214', 'Pointers and fixed size buffers may only be used in an unsafe context');
            }
            return type;
        }
    };

    // T? in a type, or the ? of a conditional expression (x is T ? a : b)?
    // In a declaration it is always nullable; in an expression (is, as,
    // patterns) it is nullable only when no expression can follow.
    CSharpParser.prototype.questionIsConditional = function () {
        if (!this.typeContextExpression)
            return false;
        var next = this.peek(1);
        if (next.type === 'eof')
            return false;
        if (next.type === 'op')
            return !(next.value === ')' || next.value === ',' || next.value === ']' || next.value === '}' ||
                     next.value === ';' || next.value === '=' || next.value === '=>' || next.value === '{' ||
                     next.value === '[' || next.value === '?' || next.value === '??' || next.value === '>' ||
                     next.value === '&&' || next.value === '||' || next.value === '==' || next.value === '!=');
        if (next.type === 'ident' && (next.value === 'and' || next.value === 'or' || next.value === 'when'))
            return false;
        return true;
    };

    // A type inside an expression: after is and as, in casts and patterns.
    CSharpParser.prototype.typeInExpression = function () {
        var saved = this.typeContextExpression;
        this.typeContextExpression = true;
        try {
            return this.type();
        } finally {
            this.typeContextExpression = saved;
        }
    };

    // A type where "?" is always nullable: type arguments, tuple elements.
    CSharpParser.prototype.nestedType = function () {
        var saved = this.typeContextExpression;
        this.typeContextExpression = false;
        try {
            return this.type();
        } finally {
            this.typeContextExpression = saved;
        }
    };

    // The return type of a method: void or a type; ref T for ref returns.
    CSharpParser.prototype.returnType = function () {
        var token = this.peek();
        if (this.is('ref')) {
            this.next();
            this.accept('readonly');
            var type = this.type();
            type.refReturn = true;
            return type;
        }
        if (this.is('void') && !this.is('*', 1)) {
            this.next();
            return this.node('predef', token, { name: 'void' });
        }
        return this.type();
    };

    // --- Type parameters and constraints

    // <in T, out U>
    CSharpParser.prototype.typeParameters = function () {
        var params = [];
        if (!this.is('<'))
            return params;
        this.next();
        for (;;) {
            this.attributes();
            var token = this.peek();
            var variance = null;
            if (this.is('in') || this.is('out'))
                variance = this.next().value;
            params.push(this.node('tparam', token, { name: this.identifier(), variance: variance }));
            if (!this.accept(','))
                break;
        }
        this.expect('>');
        return params;
    };

    // where T : class, new(), IComparable<T>
    CSharpParser.prototype.constraintClauses = function () {
        var clauses = [];
        while (this.isWord('where')) {
            var token = this.next();
            var name = this.identifier();
            this.expect(':');
            var constraints = [];
            for (;;) {
                var item = this.peek();
                if (this.is('class') || this.is('struct')) {
                    this.next();
                    var nullable = !!this.accept('?');
                    constraints.push(this.node('constraint', item, { kind: item.value, nullable: nullable }));
                } else if (this.is('new') && this.is('(', 1)) {
                    this.next();
                    this.next();
                    this.expect(')');
                    constraints.push(this.node('constraint', item, { kind: 'new' }));
                } else if (this.isWord('unmanaged') || this.isWord('notnull')) {
                    this.next();
                    constraints.push(this.node('constraint', item, { kind: item.value }));
                } else if (this.is('default')) {
                    this.next();
                    constraints.push(this.node('constraint', item, { kind: 'default' }));
                } else {
                    constraints.push(this.node('constraint', item, { kind: 'type', type: this.type() }));
                }
                if (!this.accept(','))
                    break;
            }
            clauses.push(this.node('where', token, { name: name, constraints: constraints }));
        }
        return clauses;
    };

    // --- Parameters

    // (ref int a, out string b, params int[] rest, int c = 5, this T x)
    CSharpParser.prototype.parameterList = function (open, close) {
        this.expect(open || '(');
        var params = [];
        close = close || ')';
        if (this.accept(close))
            return params;
        for (;;) {
            params.push(this.parameter());
            if (!this.accept(','))
                break;
        }
        this.expect(close);
        return params;
    };

    CSharpParser.prototype.parameter = function () {
        var attributes = this.attributes();
        var token = this.peek();
        var refKind = '', isParams = false, isThis = false, isScoped = false;
        for (;;) {
            if (this.is('ref') || this.is('out') || this.is('in')) {
                refKind = this.next().value;
                if (refKind === 'ref' && this.is('readonly')) {
                    this.next();
                    refKind = 'in';
                }
                continue;
            }
            if (this.is('params')) {
                this.next();
                isParams = true;
                continue;
            }
            if (this.is('this')) {
                this.next();
                isThis = true;
                continue;
            }
            if (this.isWord('scoped') && (this.peek(1).type === 'ident' || this.peek(1).type === 'keyword')) {
                this.next();
                isScoped = true;
                continue;
            }
            break;
        }
        var type = this.type();
        var name = this.identifier();
        var defaultValue = null;
        if (this.accept('='))
            defaultValue = this.expression();
        return this.node('param', token, { type: type, name: name, refKind: refKind, isParams: isParams, isThis: isThis,
                                           defaultValue: defaultValue, attributes: attributes, scoped: isScoped });
    };

    // --- Compilation unit

    CSharpParser.prototype.compilationUnit = function () {
        var token = this.peek();
        var unit = this.node('unit', token, { usings: [], members: [], attributes: [] });
        this.usingDirectives(unit.usings);
        this.namespaceBody(unit, true);
        if (this.peek().type !== 'eof')
            this.error('CS1022', 'Type or namespace definition, or end-of-file expected');
        return unit;
    };

    // using directives (not using statements).
    CSharpParser.prototype.usingDirectives = function (list) {
        for (;;) {
            var isGlobal = this.isWord('global') && this.is('using', 1);
            var offset = isGlobal ? 1 : 0;
            if (!this.is('using', offset) || !this.isUsingDirective(offset))
                return;
            var token = this.peek();
            if (isGlobal)
                this.next();
            this.next();
            var isStatic = !!this.accept('static');
            var alias = null;
            if (this.peek().type === 'ident' && this.is('=', 1)) {
                alias = this.identifier();
                this.next();
            }
            var target = alias !== null || isStatic ? this.type() : this.namespaceOrTypeName();
            this.expect(';');
            list.push(this.node('using', token, { target: target, alias: alias, isStatic: isStatic, isGlobal: isGlobal }));
        }
    };

    // using X.Y; using static ...; using A = ...; - not using (...) or using var.
    CSharpParser.prototype.isUsingDirective = function (offset) {
        var next = this.peek(offset + 1);
        if (next.type === 'keyword' && next.value === 'static')
            return true;
        if (next.type !== 'ident')
            return false;
        if (next.value === 'var' && this.peek(offset + 2).type === 'ident')
            return false;
        if (this.is('=', offset + 2))
            return true;
        // using Name.Name; - a directive; using Type name = ...; - a declaration.
        var self = this;
        return this.lookahead(function () {
            for (var index = 0; index <= offset; ++index)
                self.next();
            self.namespaceOrTypeName();
            return self.is(';');
        });
    };

    // A namespace or type name in a using directive: A.B.C, global::A.B, A.B<C>.
    CSharpParser.prototype.namespaceOrTypeName = function () {
        return this.nonArrayType();
    };

    // The members of a namespace or of the unit: namespaces, types and (in
    // the unit) statements.
    CSharpParser.prototype.namespaceBody = function (container, isUnit) {
        while (this.peek().type !== 'eof' && !this.is('}')) {
            if (this.is('namespace')) {
                container.members.push(this.namespaceDeclaration());
                continue;
            }
            if (this.is('extern') && this.isWord('alias', 1))
                this.error('CS0430', "The extern alias is not supported");
            if (this.is('[') && (this.isWord('assembly', 1) || this.isWord('module', 1)) && this.is(':', 2)) {
                this.attributes();
                continue;
            }
            if (this.startsTypeDeclaration()) {
                container.members.push(this.typeDeclaration());
                continue;
            }
            if (this.is('using') && this.isUsingDirective(0))
                this.error('CS1529', 'A using clause must precede all other elements defined in the namespace except extern alias declarations');
            if (!isUnit) {
                if (this.peek().type === 'ident' || this.peek().type === 'keyword')
                    this.error('CS0116', 'A namespace cannot directly contain members such as fields, methods or statements');
                this.error('CS1022', 'Type or namespace definition, or end-of-file expected');
            }
            var statement = this.statement(true);
            statement.topLevel = true;
            container.members.push(statement);
        }
    };

    CSharpParser.prototype.namespaceDeclaration = function () {
        var token = this.expect('namespace');
        var name = this.qualifiedName();
        var ns = this.node('namespace', token, { name: name, usings: [], members: [], fileScoped: false });
        if (this.accept(';')) {
            ns.fileScoped = true;
            this.usingDirectives(ns.usings);
            this.namespaceBody(ns, false);
            return ns;
        }
        this.expect('{');
        this.usingDirectives(ns.usings);
        this.namespaceBody(ns, false);
        this.expect('}');
        this.accept(';');
        return ns;
    };

    // Attributes and modifiers, then class, struct, interface, enum, record,
    // delegate.
    CSharpParser.prototype.startsTypeDeclaration = function () {
        return this.lookahead(function () {
            this.attributes();
            this.modifiers();
            if (this.is('class') || this.is('struct') || this.is('interface') || this.is('enum'))
                return true;
            if (this.is('delegate'))
                return !this.is('(', 1) && !this.is('{', 1);
            if (this.isWord('record'))
                return this.peek(1).type === 'ident' || this.is('class', 1) || this.is('struct', 1);
            return false;
        });
    };

    CSharpParser.prototype.typeDeclaration = function () {
        var attributes = this.attributes();
        var mods = this.modifiers();
        var token = this.peek();
        var kind, isRecord = false;
        if (this.isWord('record')) {
            this.next();
            isRecord = true;
            kind = 'class';
            if (this.is('class') || this.is('struct'))
                kind = this.next().value;
        } else if (this.is('class') || this.is('struct') || this.is('interface') || this.is('enum') || this.is('delegate')) {
            kind = this.next().value;
        } else {
            this.error('CS1518', 'Expected class, delegate, enum, interface, or struct');
        }
        if (kind === 'delegate')
            return this.delegateDeclaration(token, mods, attributes);
        if (kind === 'enum')
            return this.enumDeclaration(token, mods, attributes);
        var name = this.identifier();
        var decl = this.node('type', token, { kind: kind, record: isRecord, name: name, mods: mods, attributes: attributes,
                                              typeParams: this.typeParameters(), params: null, baseList: [], baseArgs: null,
                                              constraints: [], members: [] });
        if (this.is('(') && kind !== 'interface')
            decl.params = this.parameterList();
        if (this.accept(':')) {
            for (;;) {
                var baseType = this.type();
                decl.baseList.push(baseType);
                if (decl.baseList.length === 1 && this.is('(')) {
                    decl.baseArgs = this.argumentList('(', ')');
                    decl.baseArgsLine = baseType.line;
                }
                if (!this.accept(','))
                    break;
            }
        }
        decl.constraints = this.constraintClauses();
        if (isRecord || decl.params !== null) {
            if (this.accept(';'))
                return decl;
        }
        this.expect('{');
        while (!this.is('}')) {
            if (this.peek().type === 'eof')
                this.expected('}');
            this.memberDeclaration(decl);
        }
        this.expect('}');
        this.accept(';');
        return decl;
    };

    CSharpParser.prototype.delegateDeclaration = function (token, mods, attributes) {
        var returnType = this.returnType();
        var name = this.identifier();
        var typeParams = this.typeParameters();
        var params = this.parameterList();
        var constraints = this.constraintClauses();
        this.expect(';');
        return this.node('type', token, { kind: 'delegate', name: name, mods: mods, attributes: attributes, typeParams: typeParams,
                                          returnType: returnType, params: params, constraints: constraints, members: [],
                                          baseList: [] });
    };

    CSharpParser.prototype.enumDeclaration = function (token, mods, attributes) {
        var name = this.identifier();
        var underlying = null;
        if (this.accept(':'))
            underlying = this.type();
        this.expect('{');
        var members = [];
        while (!this.is('}')) {
            var memberAttributes = this.attributes();
            var memberToken = this.peek();
            var memberName = this.identifier();
            var value = null;
            if (this.accept('='))
                value = this.expression();
            members.push(this.node('enumMember', memberToken, { name: memberName, value: value, attributes: memberAttributes }));
            if (!this.accept(','))
                break;
        }
        this.expect('}');
        this.accept(';');
        return this.node('type', token, { kind: 'enum', name: name, mods: mods, attributes: attributes, typeParams: [],
                                          underlying: underlying, members: members, baseList: [] });
    };

    // --- Members of types

    CSharpParser.prototype.memberDeclaration = function (decl) {
        if (this.startsTypeDeclaration()) {
            decl.members.push(this.typeDeclaration());
            return;
        }
        var attributes = this.attributes();
        var mods = this.modifiers();
        var token = this.peek();
        // ~Name() - a finalizer.
        if (this.is('~')) {
            this.next();
            this.identifier();
            this.parameterList();
            var finalizer = this.node('dtor', token, { mods: mods });
            this.functionBody(finalizer);
            decl.members.push(finalizer);
            return;
        }
        if (this.is('const')) {
            this.next();
            mods.const = true;
            var constType = this.type();
            decl.members.push(this.fieldRest(token, mods, constType, attributes));
            return;
        }
        if (this.is('event')) {
            this.next();
            decl.members.push(this.eventDeclaration(token, mods, attributes));
            return;
        }
        // Conversion operators: implicit operator T(...).
        if (this.is('implicit') || this.is('explicit')) {
            var isImplicit = this.next().value === 'implicit';
            this.expect('operator');
            this.accept('checked');
            var target = this.type();
            var conversion = this.node('conversion', token, { mods: mods, implicit: isImplicit, type: target,
                                                              params: this.parameterList(), attributes: attributes });
            this.functionBody(conversion);
            decl.members.push(conversion);
            return;
        }
        // A constructor: Name( ... ) where Name is the type.
        if (this.peek().type === 'ident' && this.peek().value === decl.name && this.is('(', 1)) {
            this.next();
            var ctor = this.node('ctor', token, { mods: mods, params: this.parameterList(), initializer: null,
                                                  attributes: attributes });
            if (this.accept(':')) {
                var initToken = this.peek();
                if (!this.is('base') && !this.is('this'))
                    this.error('CS1018', 'Keyword \'this\' or \'base\' expected');
                var kind = this.next().value;
                ctor.initializer = this.node('ctorInit', initToken, { kind: kind, args: this.argumentList('(', ')') });
            }
            this.functionBody(ctor);
            decl.members.push(ctor);
            return;
        }
        var type = this.returnType();
        // An operator: T operator +(T a, T b).
        if (this.is('operator')) {
            this.next();
            this.accept('checked');
            var op = this.operatorToken();
            var operator = this.node('operator', token, { mods: mods, returnType: type, op: op, params: this.parameterList(),
                                                          attributes: attributes });
            this.functionBody(operator);
            decl.members.push(operator);
            return;
        }
        // An indexer: T this[int i] or an explicit I.this[...].
        if (this.is('this')) {
            this.next();
            decl.members.push(this.indexerRest(token, mods, type, null, attributes));
            return;
        }
        // An explicit interface implementation: IFoo.Bar, IFoo<T>.Bar.
        var explicitIface = null;
        var nameToken = this.peek();
        var name;
        if (this.peek().type === 'ident' && (this.is('.', 1) || (this.is('<', 1) && this.explicitInterfaceAhead()))) {
            var parsed = this.explicitInterfaceName();
            explicitIface = parsed.iface;
            if (parsed.indexer) {
                decl.members.push(this.indexerRest(token, mods, type, explicitIface, attributes));
                return;
            }
            name = parsed.name;
        } else {
            name = this.identifier();
        }
        if (this.is('(') || this.is('<')) {
            var method = this.node('method', token, { mods: mods, returnType: type, name: name, explicitIface: explicitIface,
                                                      typeParams: this.typeParameters(), params: null, constraints: [],
                                                      attributes: attributes, nameLine: nameToken.line });
            var wasAsync = this.inAsync;
            this.inAsync = !!mods.async;
            method.params = this.parameterList();
            method.constraints = this.constraintClauses();
            this.functionBody(method);
            this.inAsync = wasAsync;
            decl.members.push(method);
            return;
        }
        if (this.is('{') || this.is('=>')) {
            decl.members.push(this.propertyRest(token, mods, type, name, explicitIface, attributes));
            return;
        }
        if (explicitIface !== null)
            this.expected('(');
        // Fields: the name is parsed already.
        this.index -= 1;
        decl.members.push(this.fieldRest(token, mods, type, attributes));
    };

    // An explicit interface name: I.Name or I<T>.Name or I.this.
    CSharpParser.prototype.explicitInterfaceAhead = function () {
        return this.lookahead(function () {
            this.simpleTypeName();
            return this.is('.');
        });
    };

    CSharpParser.prototype.explicitInterfaceName = function () {
        var iface = this.simpleTypeName();
        for (;;) {
            this.expect('.');
            if (this.is('this')) {
                this.next();
                return { iface: iface, indexer: true };
            }
            if (this.peek().type === 'ident' && (this.is('.', 1) || (this.is('<', 1) && this.explicitInterfaceAhead()))) {
                var dot = this.peek();
                iface = this.node('qname', dot, { left: iface, right: this.simpleTypeName() });
                continue;
            }
            return { iface: iface, name: this.identifier(), indexer: false };
        }
    };

    // The token of an overloadable operator: + - ! ~ ++ -- true false * / %
    // & | ^ << >> >>> == != < > <= >=.
    CSharpParser.prototype.operatorToken = function () {
        var token = this.peek();
        if (this.is('true') || this.is('false')) {
            this.next();
            return token.value;
        }
        if (token.type !== 'op')
            this.error('CS1037', 'Overloadable operator expected');
        this.next();
        var text = token.value;
        if (text === '>') {
            if (this.is('>') && this.adjacent(-1)) {
                this.next();
                text = '>>';
                if (this.is('>') && this.adjacent(-1)) {
                    this.next();
                    text = '>>>';
                }
            } else if (this.is('=') && this.adjacent(-1)) {
                this.next();
                text = '>=';
            }
        }
        var allowed = { '+': 1, '-': 1, '!': 1, '~': 1, '++': 1, '--': 1, '*': 1, '/': 1, '%': 1, '&': 1, '|': 1, '^': 1,
                        '<<': 1, '>>': 1, '>>>': 1, '==': 1, '!=': 1, '<': 1, '>': 1, '<=': 1, '>=': 1 };
        if (allowed[text] !== 1)
            this.error('CS1037', 'Overloadable operator expected', token);
        return text;
    };

    // A body: { ... }, => expression; or ; (abstract, extern, interface).
    CSharpParser.prototype.functionBody = function (decl) {
        decl.body = null;
        decl.expr = null;
        if (this.is('{')) {
            decl.body = this.block();
            return;
        }
        if (this.is('=>')) {
            this.next();
            decl.expr = this.expression();
            this.expect(';');
            return;
        }
        this.expect(';');
    };

    // Fields: Type a = 1, b; the type is parsed.
    CSharpParser.prototype.fieldRest = function (token, mods, type, attributes) {
        var vars = [];
        for (;;) {
            var varToken = this.peek();
            var name = this.identifier();
            var init = null;
            if (this.is('[') && mods.fixed)
                this.error('CS0214', 'Pointers and fixed size buffers may only be used in an unsafe context');
            if (this.accept('='))
                init = this.variableInitializer();
            vars.push(this.node('var', varToken, { name: name, init: init }));
            if (!this.accept(','))
                break;
        }
        this.expect(';');
        return this.node('field', token, { mods: mods, type: type, vars: vars, attributes: attributes });
    };

    // An initializer of a variable: an expression or an array initializer { ... }.
    CSharpParser.prototype.variableInitializer = function () {
        if (this.is('{'))
            return this.arrayInitializer();
        if (this.is('ref')) {
            var token = this.next();
            return this.node('refExpr', token, { expr: this.expression() });
        }
        return this.expression();
    };

    CSharpParser.prototype.arrayInitializer = function () {
        var token = this.expect('{');
        var items = [];
        while (!this.is('}')) {
            items.push(this.variableInitializer());
            if (!this.accept(','))
                break;
        }
        this.expect('}');
        return this.node('arrayInit', token, { items: items });
    };

    // event Type Name; event Type A, B; event Type Name { add {} remove {} }
    CSharpParser.prototype.eventDeclaration = function (token, mods, attributes) {
        var type = this.type();
        var explicitIface = null;
        var name;
        if (this.peek().type === 'ident' && (this.is('.', 1) || (this.is('<', 1) && this.explicitInterfaceAhead()))) {
            var parsed = this.explicitInterfaceName();
            explicitIface = parsed.iface;
            name = parsed.name;
        } else {
            name = this.identifier();
        }
        if (this.is('{')) {
            this.next();
            var accessors = {};
            while (!this.is('}')) {
                this.attributes();
                var accessorToken = this.peek();
                var word = this.identifier();
                if (word !== 'add' && word !== 'remove')
                    this.error('CS1055', 'An add or remove accessor expected', accessorToken);
                var accessor = this.node('accessor', accessorToken, { kind: word });
                this.functionBody(accessor);
                accessors[word] = accessor;
            }
            this.expect('}');
            return this.node('event', token, { mods: mods, type: type, name: name, explicitIface: explicitIface,
                                               add: accessors.add || null, remove: accessors.remove || null,
                                               attributes: attributes });
        }
        var vars = [{ name: name, init: null, line: token.line, column: token.column, k: 'var' }];
        if (this.accept('='))
            vars[0].init = this.expression();
        while (this.accept(',')) {
            var varToken = this.peek();
            var varName = this.identifier();
            var init = this.accept('=') ? this.expression() : null;
            vars.push(this.node('var', varToken, { name: varName, init: init }));
        }
        this.expect(';');
        return this.node('eventField', token, { mods: mods, type: type, vars: vars, attributes: attributes });
    };

    // { get; set; } = init; or => expression;
    CSharpParser.prototype.propertyRest = function (token, mods, type, name, explicitIface, attributes) {
        var property = this.node('property', token, { mods: mods, type: type, name: name, explicitIface: explicitIface,
                                                      accessors: [], exprBody: null, init: null, attributes: attributes });
        if (this.accept('=>')) {
            property.exprBody = this.expression();
            this.expect(';');
            return property;
        }
        property.accessors = this.accessorList();
        if (this.accept('=')) {
            property.init = this.variableInitializer();
            this.expect(';');
        }
        return property;
    };

    CSharpParser.prototype.accessorList = function () {
        this.expect('{');
        var accessors = [];
        while (!this.is('}')) {
            this.attributes();
            var mods = this.modifiers();
            var token = this.peek();
            if (!this.isWord('get') && !this.isWord('set') && !this.isWord('init'))
                this.error('CS1014', 'A get or set accessor expected');
            var kind = this.next().value;
            var accessor = this.node('accessor', token, { kind: kind, mods: mods });
            this.functionBody(accessor);
            accessors.push(accessor);
        }
        this.expect('}');
        return accessors;
    };

    CSharpParser.prototype.indexerRest = function (token, mods, type, explicitIface, attributes) {
        var params = this.parameterList('[', ']');
        var indexer = this.node('indexer', token, { mods: mods, type: type, params: params, explicitIface: explicitIface,
                                                    accessors: [], exprBody: null, attributes: attributes });
        if (this.accept('=>')) {
            indexer.exprBody = this.expression();
            this.expect(';');
            return indexer;
        }
        indexer.accessors = this.accessorList();
        return indexer;
    };

    // A unit: the tree of the text; script - the last expression may be
    // the value of the unit.
    CS.parse = function (text, source, script) {
        var tokens = CS.lex(text, source);
        var parser = new CSharpParser(tokens, source);
        parser.allowValueAtEnd = !!script;
        return parser.compilationUnit();
    };
})(globalThis);
