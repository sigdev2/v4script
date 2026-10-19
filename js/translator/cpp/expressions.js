// C++: the syntax of expressions (continues parser.js). Names are resolved
// while parsing (parseName), because they decide the parse; types are
// checked after the full-expression (check.js). Nodes: { k: 'int' |
// 'float' | 'char' | 'string' | 'bool' | 'nullptr' | 'this' | 'name' |
// 'paren' | 'call' | 'index' | 'member' | 'postinc' | 'preinc' | 'unary' |
// 'sizeof' | 'alignof' | 'cast' | 'xcast' | 'functional' | 'binary' |
// 'assign' | 'cond' | 'comma' | 'new' | 'delete' | 'throw' | 'lambda' |
// 'braced' | 'typeid' | 'fold' | 'expansion' | 'offsetof' | 'checked', ... }.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var C = T.c;
    var X = T.cpp;
    var Parser = X.Parser;
    if (Object.prototype.hasOwnProperty.call(Parser.prototype, 'expression'))
        return;

    Parser.prototype.expression = function () {
        var tok = this.peek();
        var first = this.assignment();
        // (f(args), ...) is a fold over the comma.
        if (!this.is(',') || this.is('...', 1))
            return first;
        var list = [first];
        while (this.is(',') && !this.is('...', 1)) {
            this.next();
            list.push(this.assignment());
        }
        return this.node('comma', tok, { list: list });
    };

    var ASSIGNMENT = { '=': 1, '+=': 1, '-=': 1, '*=': 1, '/=': 1, '%=': 1, '<<=': 1, '>>=': 1, '&=': 1, '^=': 1,
                       '|=': 1 };

    Parser.prototype.assignment = function () {
        var tok = this.peek();
        if (this.is('throw')) {
            this.next();
            var thrown = null;
            if (!this.is(';') && !this.is(')') && !this.is(',') && !this.is(':') && !this.is('}'))
                thrown = this.assignment();
            return this.node('throw', tok, { expr: thrown });
        }
        var left = this.conditional();
        var operator = this.peek();
        if (operator.type === 'op' && ASSIGNMENT[operator.value] === 1 &&
            !(this.noGreater > 0 && operator.value === '>>=')) {
            this.next();
            var right = this.is('{') ? this.bracedList() : this.assignment();
            return this.node('assign', operator, { op: operator.value, target: left, source: right });
        }
        return left;
    };

    // An initializer-clause: an assignment-expression or a braced list.
    Parser.prototype.initializerClause = function () {
        if (this.is('{'))
            return this.bracedList();
        return this.assignment();
    };

    Parser.prototype.conditional = function () {
        var condition = this.binary(1);
        if (this.is('?')) {
            var tok = this.next();
            var savedGreater = this.noGreater;
            this.noGreater = 0;
            var then = this.expression();
            this.noGreater = savedGreater;
            this.expect(':');
            var otherwise = this.assignment();
            return this.node('cond', tok, { cond: condition, then: then, otherwise: otherwise });
        }
        return condition;
    };

    var BINARY = {
        '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5, '==': 6, '!=': 6, '<': 7, '>': 7, '<=': 7, '>=': 7,
        '<<': 8, '>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10, '.*': 11, '->*': 11
    };
    X.BINARY_PRECEDENCE = BINARY;

    Parser.prototype.binary = function (minimum) {
        var left = this.castExpression();
        for (;;) {
            var tok = this.peek();
            var precedence = tok.type === 'op' ? BINARY[tok.value] : undefined;
            if (precedence === undefined || precedence < minimum)
                return left;
            if (this.noGreater > 0 && (tok.value === '>' || tok.value === '>>'))
                return left;
            // A fold expression: (args + ...) - the operator is followed by '...'.
            if (this.is('...', 1))
                return left;
            this.next();
            var right = this.binary(precedence + 1);
            left = this.node('binary', tok, { op: tok.value, left: left, right: right });
        }
    };

    Parser.prototype.castExpression = function () {
        var tok = this.peek();
        if (this.is('(') && this.isCastStart()) {
            this.next();
            var savedGreater = this.noGreater;
            this.noGreater = 0;
            var type = this.typeId();
            this.noGreater = savedGreater;
            this.expect(')');
            if (this.is('{')) {
                // A compound literal (T){...}: a GNU extension, as T{...}.
                var list = this.bracedList();
                return this.postfix(this.node('functional', tok, { type: type, args: list.items, braced: true }));
            }
            return this.node('cast', tok, { type: type, expr: this.castExpression() });
        }
        return this.unary();
    };

    // ( type-id ) - a C-style cast.
    Parser.prototype.isCastStart = function () {
        var save = this.mark();
        this.next();
        var result = false;
        if (this.startsTypeId()) {
            var savedGreater = this.noGreater;
            this.noGreater = 0;
            var type = this.attempt(function () { return this.typeId(); });
            this.noGreater = savedGreater;
            result = type !== null && this.is(')');
            // (T)(x) where T is a type is a cast; (f)(x) is a call.
        }
        this.reset(save);
        return result;
    };

    Parser.prototype.unary = function () {
        var tok = this.peek();
        if (tok.type === 'op') {
            switch (tok.value) {
            case '++':
            case '--':
                this.next();
                return this.node('preinc', tok, { op: tok.value, expr: this.castExpression() });
            case '*':
            case '&':
            case '+':
            case '-':
            case '!':
            case '~':
                this.next();
                return this.node('unary', tok, { op: tok.value, expr: this.castExpression() });
            case '::':
                if (this.is('new', 1) || this.is('delete', 1)) {
                    this.next();
                    return this.unary();
                }
                break;
            case '&&':
                this.fail('labels as values are not supported');
            }
        }
        if (tok.type === 'keyword') {
            switch (tok.value) {
            case 'sizeof':
                return this.sizeofExpression();
            case 'alignof':
                this.next();
                this.expect('(');
                var alignType = this.typeId();
                this.expect(')');
                return this.node('alignof', tok, { type: alignType });
            case 'noexcept':
                this.next();
                this.expect('(');
                var inner = this.expression();
                this.expect(')');
                return this.node('noexceptop', tok, { expr: inner });
            case 'new':
                return this.newExpression();
            case 'delete':
                return this.deleteExpression();
            }
        }
        return this.postfix(this.primary());
    };

    Parser.prototype.sizeofExpression = function () {
        var tok = this.next();
        if (this.accept('...')) {
            this.expect('(');
            var packName = this.expectIdent();
            this.expect(')');
            var pack = this.lookup(packName.value);
            if (pack === null)
                this.error(packName, "'" + packName.value + "' was not declared in this scope");
            return this.node('sizeofpack', tok, { pack: pack, name: packName.value });
        }
        if (this.is('(') && this.isTypeInParentheses()) {
            this.next();
            var savedGreater = this.noGreater;
            this.noGreater = 0;
            var type = this.typeId();
            this.noGreater = savedGreater;
            this.expect(')');
            return this.node('sizeof', tok, { type: type });
        }
        return this.node('sizeof', tok, { expr: this.unary() });
    };

    // ( type-id ) in sizeof, typeid.
    Parser.prototype.isTypeInParentheses = function () {
        var save = this.mark();
        this.next();
        var result = false;
        if (this.startsTypeId()) {
            var type = this.attempt(function () { return this.typeId(); });
            result = type !== null && this.is(')');
        }
        this.reset(save);
        return result;
    };

    // new T, new T(args), new T{args}, new T[n], new (place) T(args).
    Parser.prototype.newExpression = function () {
        var tok = this.next();
        var placement = null;
        if (this.is('(') && !this.isTypeInParentheses()) {
            this.next();
            placement = this.expressionList(')');
            this.expect(')');
        }
        var type;
        var arraySize = null;
        if (this.is('(')) {
            this.next();
            type = this.typeId();
            this.expect(')');
        } else {
            var specs = this.typeSpecifiers();
            type = specs.type;
            // A new-declarator: pointers, then [n][m]...
            while (this.is('*') || this.is('&')) {
                this.next();
                type = X.qualify(X.pointerTo(type), this.cvQualifiers());
            }
            if (this.is('[')) {
                this.next();
                arraySize = this.expression();
                this.expect(']');
                while (this.is('[')) {
                    this.next();
                    var bound = this.check(this.conditional());
                    if (bound.value === undefined)
                        this.error(tok, 'array size in new-expression must be constant');
                    this.expect(']');
                    type = X.arrayOf(type, T.big.toFloat(bound.value));
                }
            }
        }
        var args = null;
        var braced = false;
        if (this.is('(')) {
            this.next();
            args = this.expressionList(')');
            this.expect(')');
        } else if (this.is('{')) {
            args = this.bracedList().items;
            braced = true;
        }
        return this.node('new', tok, { type: type, args: args, braced: braced, arraySize: arraySize,
                                       placement: placement });
    };

    Parser.prototype.deleteExpression = function () {
        var tok = this.next();
        var array = false;
        if (this.is('[') && this.is(']', 1)) {
            this.next();
            this.next();
            array = true;
        }
        return this.node('delete', tok, { array: array, expr: this.castExpression() });
    };

    Parser.prototype.postfix = function (expr) {
        for (;;) {
            var tok = this.peek();
            if (this.is('[')) {
                this.next();
                var savedGreater = this.noGreater;
                this.noGreater = 0;
                var index = this.is('{') ? this.bracedList() : this.expression();
                this.noGreater = savedGreater;
                this.expect(']');
                expr = this.node('index', tok, { expr: expr, index: index });
                continue;
            }
            if (this.is('(')) {
                this.next();
                var args = this.expressionList(')');
                this.expect(')');
                expr = this.node('call', tok, { fn: expr, args: args });
                continue;
            }
            if (this.is('.') || this.is('->')) {
                this.next();
                this.accept('template');
                var name;
                if (this.is('~')) {
                    this.next();
                    var dtorTok = this.expectIdent();
                    name = this.node('name', dtorTok, { name: '~' + dtorTok.value, destructor: dtorTok.value,
                                                        qualifier: null, args: null, entity: null });
                } else {
                    name = this.memberName();
                }
                expr = this.node('member', tok, { expr: expr, arrow: tok.value === '->', name: name });
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

    // The name after . or ->: looked up in the class of the object when it
    // is checked; template arguments are parsed if a template of that name
    // is visible (as in the standard, x.f<int>() needs 'template' when the
    // class is dependent).
    Parser.prototype.memberName = function () {
        var tok = this.peek();
        var name = this.node('name', tok, { name: null, qualifier: null, args: null, entity: null, op: null,
                                            conversion: null, destructor: null });
        if (this.is('operator')) {
            this.operatorName(name);
            return name;
        }
        // A qualified member: x.Base::f()
        if (this.isIdent() && this.is('::', 1)) {
            var qualified = this.parseName();
            return qualified;
        }
        var ident = this.expectIdent();
        name.name = ident.value;
        if (this.is('<') && this.memberTemplateFollows(ident.value))
            name.args = this.templateArguments();
        return name;
    };

    // Whether 'name <' after . or -> starts template arguments: a member
    // template of that name exists in some class of the session, or the
    // arguments close before '('.
    Parser.prototype.memberTemplateFollows = function (name) {
        if (!this.session.memberTemplateNames[name])
            return false;
        var save = this.mark();
        var args = this.attempt(function () { return this.templateArguments(); });
        var result = args !== null && (this.is('(') || this.is('::'));
        this.reset(save);
        return result;
    };

    // Arguments up to close; '...' after an argument expands a pack.
    Parser.prototype.expressionList = function (close) {
        var list = [];
        var savedGreater = this.noGreater;
        this.noGreater = 0;
        try {
            while (!this.is(close)) {
                var tok = this.peek();
                var item = this.initializerClause();
                if (this.accept('...'))
                    item = this.node('expansion', tok, { pattern: item });
                list.push(item);
                if (!this.accept(','))
                    break;
            }
        } finally {
            this.noGreater = savedGreater;
        }
        return list;
    };

    Parser.prototype.bracedList = function () {
        var tok = this.expect('{');
        var items = [];
        var savedGreater = this.noGreater;
        this.noGreater = 0;
        try {
            while (!this.is('}')) {
                var itemTok = this.peek();
                // Designated initializers .x = 1 (C++20, a GNU extension in C++17).
                if (this.is('.') && this.isIdent(1) && (this.is('=', 2) || this.is('{', 2))) {
                    this.next();
                    var field = this.next();
                    this.accept('=');
                    var value = this.initializerClause();
                    items.push(this.node('designated', itemTok, { field: field.value, value: value }));
                } else {
                    var item = this.initializerClause();
                    if (this.accept('...'))
                        item = this.node('expansion', itemTok, { pattern: item });
                    items.push(item);
                }
                if (!this.accept(','))
                    break;
            }
        } finally {
            this.noGreater = savedGreater;
        }
        this.expect('}');
        return this.node('braced', tok, { items: items });
    };

    var CASTS = { static_cast: 'static', dynamic_cast: 'dynamic', const_cast: 'const',
                  reinterpret_cast: 'reinterpret' };

    Parser.prototype.primary = function () {
        var tok = this.peek();
        switch (tok.type) {
        case 'int':
        case 'float':
            this.next();
            return this.numberLiteral(tok);
        case 'char':
            this.next();
            return this.node('char', tok, { tok: tok });
        case 'string':
            return this.stringLiteral();
        case 'keyword':
            switch (tok.value) {
            case 'true':
            case 'false':
                this.next();
                return this.node('bool', tok, { value: tok.value === 'true' });
            case 'nullptr':
                this.next();
                return this.node('nullptr', tok, {});
            case 'this':
                this.next();
                return this.node('this', tok, {});
            case 'static_cast':
            case 'dynamic_cast':
            case 'const_cast':
            case 'reinterpret_cast': {
                this.next();
                this.expect('<');
                var savedGreater = this.noGreater;
                this.noGreater = 1;
                var castType = this.typeId();
                this.noGreater = savedGreater;
                this.closeAngle();
                this.expect('(');
                var operand = this.expression();
                this.expect(')');
                return this.node('xcast', tok, { kind: CASTS[tok.value], type: castType, expr: operand });
            }
            case 'typeid': {
                this.next();
                this.expect('(');
                if (this.startsTypeId() && this.isTypeIdThenClose()) {
                    var idType = this.typeId();
                    this.expect(')');
                    return this.node('typeid', tok, { type: idType });
                }
                var idExpr = this.expression();
                this.expect(')');
                return this.node('typeid', tok, { expr: idExpr });
            }
            case 'operator':
                return this.nameExpression();
            case 'typename': {
                this.next();
                var dependentType = this.typenameSpecifier();
                return this.functionalCast(dependentType, tok);
            }
            case 'decltype': {
                var declType = this.decltypeSpecifier();
                if (this.is('::')) {
                    this.next();
                    var member = this.parseName({ allowUnknown: true });
                    return this.node('name', tok, { name: member.name, qualifier: X.unqual(declType), args: null,
                                                    entity: this.lookupQualified(X.unqual(declType), member.name) });
                }
                return this.functionalCast(declType, tok);
            }
            default:
                if (X.TYPE_WORDS[tok.value] === 1 || tok.value === 'auto') {
                    var specs = this.typeSpecifiers();
                    return this.functionalCast(specs.type, tok);
                }
            }
            break;
        case 'op':
            if (tok.value === '(')
                return this.parenthesized();
            if (tok.value === '[')
                return this.lambdaExpression();
            if (tok.value === '::' || tok.value === '~')
                return this.nameExpression();
            if (tok.value === '{')
                return this.bracedList();
            break;
        case 'ident':
            if (tok.value === '__builtin_offsetof' || tok.value === 'offsetof')
                return this.offsetofExpression();
            if (tok.value === '__func__' || tok.value === '__FUNCTION__' || tok.value === '__PRETTY_FUNCTION__') {
                this.next();
                return this.node('funcname', tok, { pretty: tok.value === '__PRETTY_FUNCTION__' });
            }
            if (tok.value === '__builtin_va_start' || tok.value === '__builtin_va_end' ||
                tok.value === '__builtin_va_arg' ||
                tok.value === '__builtin_va_copy')
                return this.vaBuiltin();
            if (TRAITS[tok.value] !== undefined && this.is('(', 1))
                return this.traitExpression();
            return this.nameExpression();
        }
        this.fail('expected primary-expression' + this.before());
    };

    Parser.prototype.isTypeIdThenClose = function () {
        var save = this.mark();
        var type = this.attempt(function () { return this.typeId(); });
        var result = type !== null && this.is(')');
        this.reset(save);
        return result;
    };

    // ( expression ) or a fold expression ( pack op ... ), ( ... op pack ),
    // ( init op ... op pack ).
    Parser.prototype.parenthesized = function () {
        var tok = this.next();
        var savedGreater = this.noGreater;
        this.noGreater = 0;
        try {
            if (this.is('...')) {
                this.next();
                var leftOp = this.next();
                var leftPack = this.castExpression();
                this.expect(')');
                return this.node('fold', tok, { op: leftOp.value, pack: leftPack, init: null, right: false });
            }
            var inner = this.expression();
            var opTok = this.peek();
            if (opTok.type === 'op' && (BINARY[opTok.value] !== undefined || ASSIGNMENT[opTok.value] === 1 ||
                                        opTok.value === ',') && this.is('...', 1)) {
                this.next();
                this.next();
                if (this.accept(')'))
                    return this.node('fold', tok, { op: opTok.value, pack: inner, init: null, right: true });
                this.next();
                var initial = this.castExpression();
                this.expect(')');
                return this.node('fold', tok, { op: opTok.value, pack: initial, init: inner, right: false });
            }
            this.expect(')');
            return this.node('paren', tok, { expr: inner });
        } finally {
            this.noGreater = savedGreater;
        }
    };

    // A name: a variable, a function, or a type in a functional cast.
    Parser.prototype.nameExpression = function () {
        var tok = this.peek();
        var name = this.parseName({ allowUnknown: true });
        if (X.isTypeEntity(name.entity) && (this.is('(') || this.is('{')))
            return this.functionalCast(this.entityType(name.entity), tok);
        if (name.dependent && name.entity === null && this.pattern && (this.is('(') || this.is('{')))
            return this.node('name', tok, name);
        return name;
    };

    // T(args) and T{args}.
    Parser.prototype.functionalCast = function (type, tok) {
        if (this.is('{')) {
            var list = this.bracedList();
            return this.node('functional', tok, { type: type, args: list.items, braced: true });
        }
        if (!this.is('('))
            this.fail('expected primary-expression' + this.before(tok), tok);
        this.next();
        var args = this.expressionList(')');
        this.expect(')');
        return this.node('functional', tok, { type: type, args: args, braced: false });
    };

    // Type traits of the compiler: the number of types they take.
    var TRAITS = Object.create(null);
    ['__is_class', '__is_enum', '__is_union', '__is_trivially_copyable', '__is_trivially_destructible', '__is_empty',
     '__is_polymorphic', '__is_abstract', '__is_final', '__has_virtual_destructor', '__is_trivially_constructible',
     '__is_aggregate', '__is_standard_layout', '__is_nothrow_move_constructible'].forEach(function (name) {
        TRAITS[name] = 1;
    });
    ['__is_base_of', '__is_same', '__is_convertible', '__is_assignable', '__is_constructible1']
        .forEach(function (name) { TRAITS[name] = 2; });
    // Any number of types (at least one).
    TRAITS.__is_constructible = -1;
    X.TRAITS = TRAITS;

    Parser.prototype.traitExpression = function () {
        var tok = this.next();
        this.expect('(');
        var list = [];
        do {
            var type = this.typeId();
            // __is_constructible(T, Args...)
            if (this.accept('...'))
                list = list.concat(this.expandTypePack(type, tok).map(function (arg) { return arg.type; }));
            else
                list.push(type);
        } while (this.accept(','));
        this.expect(')');
        if (TRAITS[tok.value] > 0 && list.length !== TRAITS[tok.value])
            this.error(tok, "wrong number of arguments to '" + tok.value + "'");
        return this.node('trait', tok, { name: tok.value, types: list });
    };

    Parser.prototype.offsetofExpression = function () {
        var tok = this.next();
        this.expect('(');
        var type = this.typeId();
        this.expect(',');
        var path = [this.expectIdent().value];
        while (this.accept('.'))
            path.push(this.expectIdent().value);
        this.expect(')');
        return this.node('offsetof', tok, { type: type, path: path });
    };

    Parser.prototype.vaBuiltin = function () {
        var tok = this.next();
        this.expect('(');
        var list = this.assignment();
        var node;
        if (tok.value === '__builtin_va_arg') {
            this.expect(',');
            node = this.node('vaarg', tok, { ap: list, type: this.typeId() });
        } else if (tok.value === '__builtin_va_copy') {
            this.expect(',');
            node = this.node('vacopy', tok, { ap: list, source: this.assignment() });
        } else {
            if (this.accept(','))
                this.assignment();
            node = this.node(tok.value === '__builtin_va_start' ? 'vastart' : 'vaend', tok, { ap: list });
        }
        this.expect(')');
        return node;
    };

    // --- Literals

    var INTEGER_SUFFIX = /^([uU](ll|LL|l|L|z|Z)?|(ll|LL|l|L|z|Z)[uU]?)$/;
    var STANDARD_LITERALS = { h: 1, min: 1, s: 1, ms: 1, us: 1, ns: 1 };

    // A number; a suffix that is not a standard one makes a user-defined
    // literal (10ms, 3_km).
    Parser.prototype.numberLiteral = function (tok) {
        var text = tok.value;
        if (tok.type === 'int') {
            var match = /^(0[xX][0-9a-fA-F']+|0[bB][01']+|[0-9']+)([a-zA-Z_][a-zA-Z0-9_]*)?$/.exec(text);
            if (match !== null && match[2] !== undefined && !INTEGER_SUFFIX.test(match[2]) &&
                (match[2].charAt(0) === '_' || STANDARD_LITERALS[match[2]] === 1))
                return this.node('udl', tok, { suffix: match[2], literal: this.node('int', tok, { text: match[1] }),
                                               raw: match[1] });
            return this.node('int', tok, { text: text });
        }
        var floatMatch = /^(.*?)(_[a-zA-Z0-9_]*|h|min|s|ms|us|ns)$/.exec(text);
        if (floatMatch !== null && !/[xX]/.test(text))
            return this.node('udl', tok,
                             { suffix: floatMatch[2], literal: this.node('float', tok, { text: floatMatch[1] }),
                                           raw: floatMatch[1] });
        return this.node('float', tok, { text: text });
    };

    // Adjacent string literals are joined; "..."s and other suffixes are
    // user-defined literals.
    Parser.prototype.stringLiteral = function () {
        var tok = this.peek();
        var bytes = [];
        var prefix = '';
        var suffix = null;
        while (this.peek().type === 'string') {
            var part = this.next();
            var decoded = C.decodeQuoted(part);
            var partPrefix = /^(u8|u|U|L)/.exec(part.value);
            if (partPrefix !== null && partPrefix[1] !== 'u8')
                prefix = partPrefix[1];
            bytes = bytes.concat(decoded.bytes);
            var next = this.peek();
            if (next.type === 'ident' && !next.space && (next.value.charAt(0) === '_' || next.value === 's' ||
                                                          next.value === 'sv')) {
                suffix = this.next().value;
                break;
            }
        }
        var node = this.node('string', tok, { bytes: bytes, prefix: prefix });
        if (suffix !== null)
            return this.node('udl', tok, { suffix: suffix, literal: node, raw: null });
        return node;
    };

    // The bytes of a string token (static_assert messages).
    X.stringBytes = function (tok) {
        return C.decodeQuoted(tok).bytes;
    };

    // --- Syntax helpers

    // Whether a syntax tree depends on template parameters (in a pattern).
    Parser.prototype.isDependentSyntax = function (node) {
        if (node === null || node === undefined || typeof node !== 'object')
            return false;
        if (Array.isArray(node)) {
            for (var index = 0; index < node.length; ++index) {
                if (this.isDependentSyntax(node[index]))
                    return true;
            }
            return false;
        }
        if (node.k === 'name') {
            if (node.dependent)
                return true;
            var entity = node.entity;
            if (entity !== null && entity !== undefined && (entity.kind === 'tparam' || entity.kind === 'typepack' ||
                                                            entity.kind === 'valuepack' || entity.dependentValue))
                return true;
            if (node.args !== null && node.args !== undefined && node.args.some(function (arg) {
                return arg.kind === 'expr' || (arg.kind === 'type' && X.isDependent(arg.type));
            }))
                return true;
            return false;
        }
        if (node.type !== undefined && node.type !== null && typeof node.type === 'object' &&
            node.type.kind !== undefined &&
            X.isDependent(node.type))
            return true;
        if (node.k === 'sizeofpack' || node.k === 'expansion' || node.k === 'fold')
            return true;
        if (node.k === 'trait')
            return node.types.some(X.isDependent);
        var keys = ['expr', 'left', 'right', 'cond', 'then', 'otherwise', 'target', 'source', 'fn', 'args', 'list',
                    'index',
                    'items', 'pack', 'init', 'pattern', 'value'];
        for (var key = 0; key < keys.length; ++key) {
            if (node[keys[key]] !== undefined && this.isDependentSyntax(node[keys[key]]))
                return true;
        }
        return false;
    };

    // The text of a simple expression for messages.
    Parser.prototype.describeSyntax = function (node) {
        switch (node.k) {
        case 'name':
            return (node.prefix || '') + node.name;
        case 'int':
        case 'float':
            return node.text;
        case 'paren':
            return '(' + this.describeSyntax(node.expr) + ')';
        case 'binary':
            return this.describeSyntax(node.left) + ' ' + node.op + ' ' + this.describeSyntax(node.right);
        case 'unary':
            return node.op + this.describeSyntax(node.expr);
        case 'call':
            return this.describeSyntax(node.fn) + '(' + node.args.map(this.describeSyntax, this).join(', ') + ')';
        case 'member':
            return this.describeSyntax(node.expr) + (node.arrow ? '->' : '.') + node.name.name;
        case 'this':
            return 'this';
        case 'string':
            return '"' + T.utf8.decode(T.utf8.fromBytes(node.bytes)) + '"';
        }
        return '...';
    };
})(globalThis);
