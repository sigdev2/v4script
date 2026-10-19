// C++: the parser. C++ cannot be parsed without knowing what names are
// (A<b>c, T(x), a * b), so the parser declares as it goes: names resolve
// to entities at once, declarations enter scopes, expressions are checked
// after each full-expression (check.js) and become the tree that codegen
// translates. This file has the tokens, names, template arguments,
// declaration specifiers and declarators; declarations, statements and
// expressions are in the files that follow it. See docs/internals/cpp.md.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var C = T.c;
    var X = T.cpp;
    if (X.Parser)
        return;

    var CompileError = T.CompileError;

    var KEYWORDS = Object.create(null);
    ('alignas alignof asm auto bool break case catch char char16_t char32_t char8_t class const constexpr ' +
     'const_cast continue decltype default delete do double dynamic_cast else enum explicit export extern false ' +
     'float for friend goto if inline int long mutable namespace new noexcept nullptr operator private protected ' +
     'public register reinterpret_cast return short signed sizeof static static_assert static_cast struct switch ' +
     'template this thread_local throw true try typedef typeid typename union unsigned using virtual void volatile ' +
     'wchar_t while __attribute__ __extension__ __restrict __restrict__ __inline __inline__ __asm__ consteval ' +
     'constinit')
        .split(' ').forEach(function (word) { KEYWORDS[word] = true; });
    X.KEYWORDS = KEYWORDS;

    var ALTERNATIVES = { and: '&&', or: '||', not: '!', bitand: '&', bitor: '|', xor: '^', compl: '~',
                         and_eq: '&=', or_eq: '|=', xor_eq: '^=', not_eq: '!=' };
    var ALIASES = { __restrict: 'restrict', __restrict__: 'restrict', __inline: 'inline', __inline__: 'inline',
                    __asm__: 'asm' };

    var TYPE_WORDS = { void: 1, bool: 1, char: 1, char8_t: 1, char16_t: 1, char32_t: 1, wchar_t: 1, short: 1, int: 1,
                       long: 1, float: 1, double: 1, signed: 1, unsigned: 1 };
    var CV_WORDS = { const: 1, volatile: 1 };
    var STORAGE_WORDS = { static: 1, extern: 1, mutable: 1, thread_local: 1, register: 1, typedef: 1 };
    var FUNCTION_WORDS = { inline: 1, virtual: 1, explicit: 1, friend: 1, constexpr: 1, consteval: 1, constinit: 1 };
    X.TYPE_WORDS = TYPE_WORDS;

    // Preprocessor tokens -> parser tokens.
    function convert(tokens) {
        var result = [];
        tokens.forEach(function (item) {
            var converted = { type: item.type, value: item.value, line: item.line, column: item.column, file: item.file,
                              text: item.value, space: item.space };
            if (item.type === 'ident') {
                if (KEYWORDS[item.value] === true) {
                    converted.type = 'keyword';
                    converted.value = ALIASES[item.value] || item.value;
                } else if (Object.prototype.hasOwnProperty.call(ALTERNATIVES, item.value)) {
                    converted.type = 'op';
                    converted.value = ALTERNATIVES[item.value];
                }
            } else if (item.type === 'number') {
                converted.type = /^0[xX]/.test(item.value)
                    ? (/[pP]/.test(item.value) || /\./.test(item.value) ? 'float' : 'int')
                    : (/^[0-9.']*[.eE]/.test(item.value) ? 'float' : 'int');
            } else if (item.type === 'punct') {
                converted.type = 'op';
            } else if (item.type === 'other') {
                throw new CompileError("stray '" + item.value + "' in program", item.line, item.column, item.file);
            }
            result.push(converted);
        });
        var last = tokens.length > 0 ? tokens[tokens.length - 1] : { line: 1, column: 1, file: '' };
        result.push({ type: 'eof', value: '', text: '', line: last.line, column: last.column + 1, file: last.file });
        return result;
    }
    X.convertTokens = convert;

    // A parse of tokens. options: scope (where declarations go), library
    // (the tokens are of the library).
    function Parser(session, tokens, options) {
        T.Parser.call(this, tokens, '');
        options = options || {};
        // '>>' split into '> >' (closeAngle), undone when parsing backtracks.
        this.splits = [];
        this.ownsTokens = false;
        this.session = session;
        this.scope = options.scope || session.globalNamespace;
        // The function whose body is parsed (FunctionContext) or null.
        this.func = null;
        // Parsing a template pattern: template parameters are placeholders.
        this.pattern = false;
        // > closes template arguments: no greater-than in expressions.
        this.noGreater = 0;
        this.access = 'public';
        this.library = !!options.library;
        // The pack expansions being checked: { pack -> index }.
        this.packIndex = [];
        this.loops = 0;
        this.switches = [];
    }
    Parser.prototype = Object.create(T.Parser.prototype);
    Parser.prototype.constructor = Parser;
    X.Parser = Parser;

    // --- Errors and tokens

    Parser.prototype.fail = function (message, tok) {
        tok = tok || this.peek();
        throw new CompileError(message, tok.line, tok.column, tok.file || '');
    };

    Parser.prototype.error = function (node, message) {
        throw new CompileError(message, node ? node.line : 0, node ? node.column : 0, node &&
                               node.file ? node.file : '');
    };

    // The text of a token in messages (g++: "before 'x' token", "before
    // numeric constant").
    Parser.prototype.before = function (tok) {
        tok = tok || this.peek();
        if (tok.type === 'eof')
            return ' at end of input';
        if (tok.type === 'int' || tok.type === 'float')
            return ' before numeric constant';
        if (tok.type === 'string')
            return ' before string constant';
        if (tok.type === 'char')
            return ' before character constant';
        if (tok.type === 'op')
            return " before '" + tok.text + "' token";
        return " before '" + tok.text + "'";
    };

    Parser.prototype.expect = function (text, what) {
        if (!this.is(text)) {
            var message = 'expected ' + (what || "'" + text + "'");
            var previous = this.index > 0 ? this.tokens[this.index - 1] : null;
            // A missing ";" is reported after the previous token, as g++ does.
            if ((text === ';' || text === ')') && previous !== null && what !== "',' or ';'" &&
                (previous.line !== this.peek().line || previous.file !== this.peek().file))
                throw new CompileError(message + this.before(), previous.line, previous.column + previous.text.length,
                                       previous.file || '');
            this.fail(message + this.before());
        }
        return this.next();
    };

    // struct A { ... } int f(): the ';' after the definition is missing.
    Parser.prototype.missingSemicolonAfter = function (type) {
        var previous = this.tokens[this.index - 1];
        var key = type.kind === 'enum' ? 'enum' : type.cname;
        throw new CompileError("expected ';' after " + key + ' definition', previous.line,
                               previous.column + previous.text.length, previous.file || '');
    };

    Parser.prototype.isIdent = function (offset) {
        return this.peek(offset).type === 'ident';
    };

    Parser.prototype.expectIdent = function () {
        var tok = this.peek();
        if (tok.type !== 'ident')
            this.fail('expected identifier' + this.before());
        return this.next();
    };

    Parser.prototype.node = function (kind, tok, fields) {
        var node = fields || {};
        node.k = kind;
        node.line = tok.line;
        node.column = tok.column;
        node.file = tok.file;
        return node;
    };

    // Speculative parsing: the result of callback, or null with the tokens
    // restored if it throws a CompileError.
    Parser.prototype.attempt = function (callback) {
        var start = this.mark();
        try {
            return callback.call(this);
        } catch (error) {
            if (!(error instanceof CompileError))
                throw error;
            this.reset(start);
            return null;
        }
    };

    // A position to come back to: the index and the '>>' split so far.
    Parser.prototype.mark = function () {
        return { index: this.index, splits: this.splits.length };
    };

    Parser.prototype.reset = function (mark) {
        while (this.splits.length > mark.splits) {
            var split = this.splits.pop();
            this.tokens.splice(split.index, 2, split.token);
        }
        this.index = mark.index;
    };

    // The closing '>' of template arguments; '>>' and '>=' are split.
    Parser.prototype.closeAngle = function () {
        var tok = this.peek();
        if (tok.type === 'op' && tok.value.charAt(0) === '>' && tok.value.length > 1 && tok.value !== '>') {
            var rest = tok.value.substring(1);
            var first = { type: 'op', value: '>', text: '>', line: tok.line, column: tok.column, file: tok.file,
                          space: tok.space };
            var second = { type: 'op', value: rest, text: rest, line: tok.line, column: tok.column + 1, file: tok.file,
                           space: false };
            // The tokens are shared until the first split (lazy bodies keep indices into them).
            if (!this.ownsTokens) {
                this.tokens = this.tokens.slice();
                this.ownsTokens = true;
            }
            this.splits.push({ index: this.index, token: tok });
            this.tokens.splice(this.index, 1, first, second);
        }
        return this.expect('>');
    };

    Parser.prototype.skipAttributes = function () {
        for (;;) {
            if (this.is('[') && this.is('[', 1)) {
                this.next();
                this.next();
                var depth = 2;
                while (depth > 0) {
                    var tok = this.next();
                    if (tok.type === 'eof')
                        this.fail("expected ']'");
                    if (tok.value === '[')
                        ++depth;
                    else if (tok.value === ']')
                        --depth;
                }
                continue;
            }
            if (this.is('__attribute__') || this.is('alignas') || this.is('asm')) {
                this.next();
                this.skipBalanced('(', ')');
                continue;
            }
            if (this.is('__extension__')) {
                this.next();
                continue;
            }
            return;
        }
    };

    // Skips a balanced group that starts at the current token.
    Parser.prototype.skipBalanced = function (open, close) {
        this.expect(open);
        var depth = 1;
        while (depth > 0) {
            var tok = this.next();
            if (tok.type === 'eof')
                this.fail("expected '" + close + "' at end of input");
            if (tok.type === 'op' && tok.value === open)
                ++depth;
            else if (tok.type === 'op' && tok.value === close)
                --depth;
        }
    };

    // The index after a balanced { ... } (or ( ... )) that starts at index.
    Parser.prototype.matching = function (index) {
        var open = this.tokens[index].value;
        var close = open === '{' ? '}' : (open === '(' ? ')' : (open === '[' ? ']' : '>'));
        var depth = 0;
        for (var at = index; at < this.tokens.length; ++at) {
            var tok = this.tokens[at];
            if (tok.type === 'eof')
                break;
            if (tok.type !== 'op')
                continue;
            if (tok.value === open)
                ++depth;
            else if (tok.value === close && --depth === 0)
                return at + 1;
        }
        this.fail("expected '" + close + "' at end of input", this.tokens[index]);
    };

    // A copy of tokens [start, end) that ends with eof: tokens of a body or
    // a template parsed later.
    Parser.prototype.slice = function (start, end) {
        var list = this.tokens.slice(start, end);
        var last = list.length > 0 ? list[list.length - 1] : this.tokens[start];
        list.push({ type: 'eof', value: '', text: '', line: last.line, column: last.column + 1, file: last.file });
        return list;
    };

    // --- Scopes

    Parser.prototype.pushScope = function (kind) {
        this.scope = new X.Scope(kind, this.scope);
        if (this.func !== null)
            this.scope.func = this.func;
        return this.scope;
    };

    Parser.prototype.popScope = function () {
        this.scope = this.scope.parent;
    };

    Parser.prototype.withScope = function (scope, callback) {
        var saved = this.scope;
        this.scope = scope;
        try {
            return callback.call(this);
        } finally {
            this.scope = saved;
        }
    };

    Parser.prototype.lookup = function (name) {
        return X.lookup(this.scope, name);
    };

    // A qualified lookup in a namespace, a class or an enum.
    Parser.prototype.lookupQualified = function (scope, name) {
        if (scope.kind === 'enum')
            return scope.members[name] || null;
        return X.lookupIn(scope, name);
    };

    Parser.prototype.currentClass = function () {
        return X.enclosingClass(this.scope);
    };

    Parser.prototype.isLibraryToken = function (tok) {
        return this.library || this.session.isLibraryFile(tok.file);
    };

    // --- Names
    //
    // A name: { k: 'name', qualifier (a scope or null), global, name (the
    // last part: 'x', 'operator+', '~A', 'operator int'), op, conversion,
    // destructor, args (template arguments or null), entity (what it names
    // or null), dependent, line, column, file }.

    function isTemplateEntity(entity) {
        if (entity === null)
            return false;
        if (entity.kind === 'template')
            return true;
        if (entity.kind === 'functions')
            return entity.items.some(function (item) { return item.kind === 'template'; });
        return false;
    }
    X.isTemplateEntity = isTemplateEntity;

    function isTypeEntity(entity) {
        if (entity === null || entity === undefined)
            return false;
        return entity.kind === 'typedef' || entity.isClass === true || entity.kind === 'enum' ||
            (entity.kind === 'tparam' && entity.paramKind !== 'value') || entity.kind === 'tspec' ||
            entity.kind === 'dependent' || entity.kind === 'typepack' || entity.kind === 'packref';
    }
    X.isTypeEntity = isTypeEntity;

    // The type an entity names.
    Parser.prototype.entityType = function (entity) {
        if (entity.kind === 'typedef')
            return entity.type;
        if (entity.kind === 'typepack')
            return this.packElement(entity) || { kind: 'packref', pack: entity, size: 0, align: 1, dependent: true,
                                                 id: X.newId() };
        return entity;
    };

    // Whether a name can start here (an identifier, ::, operator, ~).
    Parser.prototype.startsName = function () {
        var tok = this.peek();
        return tok.type === 'ident' || (tok.type === 'op' && tok.value === '::') ||
            (tok.type === 'keyword' && (tok.value === 'operator' || tok.value === 'template'));
    };

    // Parses an id-expression or a type name. options: declarator - the name
    // of a declaration (qualified names of members defined outside).
    Parser.prototype.parseName = function (options) {
        options = options || {};
        var start = this.peek();
        var result = this.node('name', start, { qualifier: null, global: false, name: null, op: null, conversion: null,
                                                destructor: null, args: null, entity: null, dependent: false });
        if (this.accept('::')) {
            result.global = true;
            result.qualifier = this.session.globalNamespace;
        }
        for (;;) {
            this.accept('template');
            var tok = this.peek();
            if (tok.type === 'keyword' && tok.value === 'operator') {
                this.operatorName(result);
                this.resolveName(result);
                return result;
            }
            if (tok.type === 'op' && tok.value === '~' && (this.isIdent(1) || this.is('decltype', 1))) {
                this.next();
                var dtorTok = this.expectIdent();
                result.name = '~' + dtorTok.value;
                result.destructor = dtorTok.value;
                if (this.is('<') && result.qualifier !== null) {
                    // ~vector<int>: the arguments are those of the class.
                    this.skipTemplateArgumentsText();
                }
                result.entity = null;
                return result;
            }
            if (tok.type !== 'ident')
                this.fail('expected unqualified-id' + this.before());
            this.next();
            result.name = tok.value;
            var entity = null;
            if (result.qualifier === null) {
                entity = this.lookup(tok.value);
            } else if (result.dependent) {
                entity = null;
            } else {
                entity = this.lookupQualified(result.qualifier, tok.value);
            }
            // The injected class name used with arguments names the template.
            if (entity !== null && entity.isClass === true && entity.template !== null && this.is('<') &&
                !options.noTemplate)
                entity = entity.template;
            if ((isTemplateEntity(entity) || (result.dependent && this.is('<') && this.tokens[this.index - 2] &&
                                               this.tokens[this.index - 2].value === 'template')) && this.is('<') &&
                !options.noTemplate) {
                var args = this.templateArguments();
                if (entity !== null && entity.kind === 'template' && entity.what !== 'function') {
                    entity = this.specialize(entity, args, tok);
                } else {
                    result.args = args;
                }
            }
            if (this.is('::') && (entity === null ? result.dependent : isScopeEntity(entity)) && !this.is('*', 1)) {
                this.next();
                if (entity !== null && entity.kind === 'typedef')
                    entity = this.scopeOfType(entity.type, tok);
                if (entity !== null &&
                    (entity.kind === 'tparam' || entity.kind === 'tspec' || entity.kind === 'dependent' ||
                                        entity.kind === 'packref' || entity.kind === 'typepack')) {
                    result.dependent = true;
                    result.dependentBase = result.dependentBase || this.entityType(entity);
                    result.qualifier = null;
                } else if (!result.dependent) {
                    result.qualifier = entity;
                } else if (entity === null) {
                    // T::inner::type: the names between the base and the last one.
                    result.dependentPath = (result.dependentPath || []).concat([tok.value]);
                }
                result.prefix = (result.prefix || '') + tok.value + '::';
                result.args = null;
                continue;
            }
            if (result.qualifier === null && entity === null && this.is('::') && !result.dependent &&
                !options.allowUnknown)
                this.fail("'" + tok.value + "' has not been declared", tok);
            result.entity = entity;
            if (result.qualifier !== null && entity === null && !result.dependent && !options.allowUnknown) {
                if (options.declarator)
                    return result;
                this.error(tok, "'" + tok.value + "' is not a member of '" + this.scopeName(result.qualifier) + "'");
            }
            return result;
        }
    };

    function isScopeEntity(entity) {
        return entity.kind === 'namespace' || entity.isClass === true || entity.kind === 'enum' ||
            entity.kind === 'typedef' || (entity.kind === 'tparam' &&
                                          entity.paramKind !== 'value') || entity.kind === 'tspec' ||
            entity.kind === 'dependent' || entity.kind === 'typepack' || entity.kind === 'packref' ||
            entity.kind === 'nsalias';
    }

    Parser.prototype.scopeOfType = function (type, tok) {
        var plain = X.unqual(type);
        if (plain.isClass === true || plain.kind === 'enum' || plain.kind === 'tparam' || plain.kind === 'tspec' ||
            plain.kind === 'dependent' || plain.kind === 'packref')
            return plain;
        this.error(tok, "'" + X.typeString(type) + "' is not a class, namespace, or enumeration");
    };

    Parser.prototype.scopeName = function (scope) {
        if (scope.kind === 'namespace')
            return scope.parent === null ? '::' : X.qualifiedName(scope);
        return X.typeString(scope);
    };

    // Resolves an operator name in its scope (operator+ of a class...).
    Parser.prototype.resolveName = function (result) {
        if (result.qualifier !== null)
            result.entity = this.lookupQualified(result.qualifier, result.name);
        else if (!result.dependent)
            result.entity = this.lookup(result.name);
    };

    var OVERLOADABLE = ['new', 'delete', '+', '-', '*', '/', '%', '^', '&', '|', '~', '!', '=', '<', '>', '+=', '-=',
                        '*=', '/=', '%=', '^=', '&=', '|=', '<<', '>>', '>>=', '<<=', '==', '!=', '<=', '>=', '&&',
                        '||', '++', '--', ',', '->*', '->'];

    Parser.prototype.operatorName = function (result) {
        this.next();
        var next = this.peek();
        if (next.type === 'op' && next.value === '(' && this.is(')', 1)) {
            this.next();
            this.next();
            result.op = '()';
        } else if (next.type === 'op' && next.value === '[' && this.is(']', 1)) {
            this.next();
            this.next();
            result.op = '[]';
        } else if ((next.type === 'keyword' && (next.value === 'new' || next.value === 'delete'))) {
            this.next();
            result.op = next.value;
            if (this.is('[') && this.is(']', 1)) {
                this.next();
                this.next();
                result.op += '[]';
            }
        } else if (next.type === 'string' && next.value === '""') {
            this.next();
            var suffix = this.expectIdent();
            result.op = '""' + suffix.value;
        } else if (next.type === 'op' && OVERLOADABLE.indexOf(next.value) >= 0) {
            this.next();
            result.op = next.value;
        } else {
            // A conversion function: operator type.
            var specs = this.typeSpecifiers();
            var type = specs.type;
            while (this.is('*') || this.is('&') || this.is('&&')) {
                var op = this.next().value;
                type = op === '*' ? X.pointerTo(type) : (op === '&' ? X.lref(type) : X.rref(type));
                type = X.qualify(type, this.cvQualifiers());
            }
            result.conversion = type;
            result.name = 'operator ' + X.typeString(type);
            return;
        }
        result.name = 'operator' + result.op;
    };

    Parser.prototype.skipTemplateArgumentsText = function () {
        this.next();
        var depth = 1;
        while (depth > 0) {
            var tok = this.next();
            if (tok.type === 'eof')
                this.fail("expected '>'");
            if (tok.value === '<')
                ++depth;
            else if (tok.value === '>')
                --depth;
            else if (tok.value === '>>')
                depth -= 2;
        }
    };

    // --- Template arguments
    //
    // An argument: { kind: 'type', type } | { kind: 'value', value, type,
    // text } | { kind: 'expr', node } (dependent) | { kind: 'pack', items }.

    Parser.prototype.templateArguments = function () {
        this.expect('<');
        var args = [];
        var savedGreater = this.noGreater;
        this.noGreater = 1;
        try {
            if (!this.isAngleClose()) {
                for (;;) {
                    args = args.concat(this.templateArgument());
                    if (!this.accept(','))
                        break;
                }
            }
        } finally {
            this.noGreater = savedGreater;
        }
        this.closeAngle();
        return args;
    };

    Parser.prototype.isAngleClose = function () {
        var tok = this.peek();
        return tok.type === 'op' && tok.value.charAt(0) === '>';
    };

    // One argument; a pack expansion gives several.
    Parser.prototype.templateArgument = function () {
        var start = this.peek();
        if (this.startsTypeId()) {
            var saved = this.index;
            var type = this.attempt(function () {
                var parsed = this.typeId();
                if (!this.is(',') && !this.isAngleClose() && !this.is('...'))
                    this.fail('not a type');
                return parsed;
            });
            if (type !== null) {
                if (this.accept('...'))
                    return this.expandTypePack(type, start);
                return [{ kind: 'type', type: type }];
            }
            this.index = saved;
        }
        var expr = this.conditional();
        if (this.accept('...'))
            return this.expandValuePack(expr, start);
        return [this.constantArgument(expr)];
    };

    // A template argument that is an expression: a constant, or the
    // expression itself in a pattern.
    Parser.prototype.constantArgument = function (expr) {
        if (this.pattern && this.isDependentSyntax(expr))
            return { kind: 'expr', node: expr, text: this.describeSyntax(expr) };
        // get<I>(t)... names a pack: checked per element of the expansion.
        if (this.packIndex.length === 0 && expr.k !== 'checked' && this.packsIn(expr).length > 0)
            return { kind: 'expr', node: expr, deferred: true, text: this.describeSyntax(expr) };
        var checked = this.constantIr(this.check(expr));
        if (checked.value === undefined) {
            if (checked.k === 'addr' || checked.k === 'fnaddr' || (checked.k === 'var' && checked.obj.kind === 'func'))
                return { kind: 'value', value: 0, type: checked.type, text: '?', node: checked };
            this.error(expr, "'" + this.describeSyntax(expr) + "' is not a constant expression");
        }
        var text = X.isBool(checked.type) ? (T.big.sign(checked.value) !== 0 ? 'true' : 'false')
                                          : T.big.str(checked.value);
        return { kind: 'value', value: checked.value, type: checked.type, text: text };
    };

    // --- Declaration specifiers
    //
    // { storage, inline, virtual, explicit, friend, constexpr, cv, type,
    // defined (a class or an enum defined here), noType (only specifiers
    // before a constructor), line, column, file }.

    Parser.prototype.declSpecifiers = function (context) {
        var start = this.peek();
        var specs = { storage: null, inline: false, virtual: false, explicit: false, friend: false, constexpr: false,
                      cv: 0, type: null, words: [], defined: null, line: start.line, column: start.column,
                      file: start.file, autoType: false, elaborated: false };
        var named = null;
        for (;;) {
            this.skipAttributes();
            var tok = this.peek();
            if (tok.type === 'keyword') {
                var word = tok.value;
                if (STORAGE_WORDS[word] === 1) {
                    this.next();
                    if (word !== 'register')
                        specs.storage = word === 'thread_local' ? (specs.storage || 'static') : word;
                    continue;
                }
                if (FUNCTION_WORDS[word] === 1) {
                    this.next();
                    if (word === 'constexpr' || word === 'consteval' || word === 'constinit') {
                        specs.constexpr = true;
                        specs.inline = specs.inline || word !== 'constinit';
                    } else {
                        specs[word] = true;
                    }
                    if (word === 'explicit' && this.is('('))
                        this.skipBalanced('(', ')');
                    continue;
                }
                if (CV_WORDS[word] === 1) {
                    this.next();
                    specs.cv |= word === 'const' ? X.CONST : X.VOLATILE;
                    continue;
                }
                if (word === 'restrict') {
                    this.next();
                    continue;
                }
                if (TYPE_WORDS[word] === 1) {
                    if (named !== null && specs.defined !== null && specs.defined !== undefined)
                        this.missingSemicolonAfter(specs.defined);
                    if (named !== null)
                        this.fail('two or more data types in declaration of ' + this.describeDeclarator());
                    this.next();
                    specs.words.push(word);
                    continue;
                }
                if (word === 'auto' && named === null && specs.words.length === 0) {
                    this.next();
                    specs.autoType = true;
                    named = X.AUTO;
                    continue;
                }
                if ((word === 'class' || word === 'struct' || word === 'union' || word === 'enum') && named === null &&
                    specs.words.length === 0) {
                    named = word === 'enum' ? this.enumSpecifier(specs, context) : this.classSpecifier(specs, context);
                    continue;
                }
                if (word === 'typename' && named === null && specs.words.length === 0) {
                    this.next();
                    named = this.typenameSpecifier();
                    continue;
                }
                if (word === 'decltype' && named === null && specs.words.length === 0) {
                    named = this.decltypeSpecifier();
                    continue;
                }
            }
            if (named === null && specs.words.length === 0 && tok.type === 'ident' &&
                tok.value === '__underlying_type' &&
                this.is('(', 1)) {
                this.next();
                this.expect('(');
                var enumType = this.typeId();
                this.expect(')');
                if (X.unqual(enumType).kind === 'enum')
                    named = X.unqual(enumType).underlying;
                else
                    named = this.pattern ? X.dependentName('__underlying_type') : enumType;
                continue;
            }
            if (named === null && specs.words.length === 0 && this.startsName() && !this.is('operator') &&
                !(tok.type === 'op' && tok.value === '~')) {
                if (this.isConstructorStart(context))
                    break;
                var save = this.mark();
                var name = this.attempt(function () { return this.parseName({ allowUnknown: true }); });
                if (name !== null && isTypeEntity(name.entity)) {
                    named = this.entityType(name.entity);
                    continue;
                }
                if (name !== null && name.dependent && name.entity === null && (this.isIdent() || this.is('&') ||
                                                                                  this.is('*') || this.is('&&') ||
                                                                                  this.is('...'))) {
                    // T::type x: a dependent type in a declaration.
                    named = this.dependentType(name);
                    continue;
                }
                this.reset(save);
            }
            break;
        }
        if (named !== null) {
            specs.type = named;
        } else if (specs.words.length > 0) {
            specs.type = X.typeFromWords(specs.words);
            if (specs.type === null)
                this.fail('invalid combination of type specifiers \'' + specs.words.join(' ') + "'", start);
        }
        if (specs.type !== null && specs.cv)
            specs.type = X.qualify(specs.type, specs.cv);
        return specs;
    };

    Parser.prototype.describeDeclarator = function () {
        return "'" + this.peek().text + "'";
    };

    // A constructor or a destructor without a type: A( in the class A,
    // A::A( and A::~A( outside.
    Parser.prototype.isConstructorStart = function (context) {
        var cls = this.currentClass();
        var tok = this.peek();
        if (context === 'class' && cls !== null && tok.type === 'ident') {
            var own = cls.template !== null ? cls.template.name : cls.name;
            if ((tok.value === own || tok.value === cls.name) && (this.is('(', 1) ||
                                                                  (this.is('<', 1) && cls.template !== null &&
                                                                   this.is('(', this.angleEnd(1)))))
                return true;
        }
        if (context !== 'namespace' && context !== 'class')
            return false;
        // A::A( or A<T>::A( or A::~A( or A::operator T(
        var save = this.mark();
        var result = this.attempt(function () {
            var name = this.parseName({ declarator: true, allowUnknown: true });
            if (name.qualifier === null || !name.qualifier.isClass)
                return false;
            var owner = name.qualifier;
            var ownName = owner.template !== null ? owner.template.name : owner.name;
            if (name.destructor !== null || name.conversion !== null)
                return true;
            return (name.name === ownName || name.name === owner.name) && this.is('(');
        });
        this.reset(save);
        return result === true;
    };

    // The offset after the '>' that closes the '<' at offset (or -1).
    Parser.prototype.angleEnd = function (offset) {
        var depth = 0;
        for (var at = offset; at < offset + 256; ++at) {
            var tok = this.peek(at);
            if (tok.type === 'eof')
                return -1;
            if (tok.type !== 'op')
                continue;
            if (tok.value === '<')
                ++depth;
            else if (tok.value === '>')
                --depth;
            else if (tok.value === '>>')
                depth -= 2;
            else if (tok.value === '(' || tok.value === ';' || tok.value === '{')
                return -1;
            if (depth <= 0)
                return at + 1;
        }
        return -1;
    };

    Parser.prototype.typenameSpecifier = function () {
        var name = this.parseName({ allowUnknown: true });
        if (isTypeEntity(name.entity))
            return this.entityType(name.entity);
        if (name.dependent || this.pattern)
            return this.dependentType(name);
        this.error(name, "'" + (name.prefix || '') + name.name + "' does not name a type");
    };

    Parser.prototype.dependentType = function (name) {
        var text = (name.prefix || '') + name.name;
        var type = X.dependentName(text);
        type.base = name.dependentBase || null;
        type.path = name.dependentPath || [];
        type.memberName = name.name;
        return type;
    };

    Parser.prototype.decltypeSpecifier = function () {
        var tok = this.next();
        this.expect('(');
        if (this.is('auto') && this.is(')', 1)) {
            this.next();
            this.next();
            return X.DECLTYPE_AUTO;
        }
        var expr = this.expression();
        this.expect(')');
        // In a pattern the operand may name parameters of dependent types.
        if (this.pattern)
            return X.dependentName('decltype(...)');
        return this.decltypeOf(expr, tok);
    };

    // Only cv and type specifiers: a type-id, a conversion type.
    Parser.prototype.typeSpecifiers = function () {
        var specs = this.declSpecifiers('type');
        if (specs.type === null)
            this.fail('expected type-specifier' + this.before());
        if (specs.storage !== null || specs.inline || specs.virtual || specs.friend)
            this.fail('expected type-specifier' + this.before());
        return specs;
    };

    Parser.prototype.cvQualifiers = function () {
        var cv = 0;
        for (;;) {
            if (this.accept('const'))
                cv |= X.CONST;
            else if (this.accept('volatile'))
                cv |= X.VOLATILE;
            else if (!this.accept('restrict'))
                return cv;
        }
    };

    // Whether a type-id starts here (in template arguments, casts, sizeof).
    Parser.prototype.startsTypeId = function () {
        var tok = this.peek();
        if (tok.type === 'keyword')
            return TYPE_WORDS[tok.value] === 1 || CV_WORDS[tok.value] === 1 || tok.value === 'class' ||
                tok.value === 'struct' || tok.value === 'union' || tok.value === 'enum' || tok.value === 'typename' ||
                tok.value === 'decltype' || tok.value === 'auto';
        if (!this.startsName())
            return false;
        var save = this.mark();
        var name = this.attempt(function () { return this.parseName({ allowUnknown: true }); });
        var result = name !== null && (isTypeEntity(name.entity) ||
                                       (name.dependent && name.entity === null && !this.is('(')));
        this.reset(save);
        return result;
    };

    // --- Declarators
    //
    // { name (a name or null), ptrs: [{ op, cv }], inner, suffixes: [{ k:
    // 'array', size } | { k: 'function', params, variadic, cv, ref,
    // noexcept, trailing }], pack, line, column, file }.

    Parser.prototype.declarator = function (abstract, context) {
        var start = this.peek();
        var result = { name: null, ptrs: [], inner: null, suffixes: [], pack: false, line: start.line,
                       column: start.column, file: start.file, bits: null };
        this.skipAttributes();
        for (;;) {
            if (this.is('*') || this.is('&') || this.is('&&')) {
                var op = this.next().value;
                this.skipAttributes();
                result.ptrs.push({ op: op, cv: op === '*' ? this.cvQualifiers() : 0 });
                continue;
            }
            break;
        }
        // In a type-id the '...' belongs to the caller (X<Args...>).
        if (context !== 'type' && this.accept('...'))
            result.pack = true;
        var nameTok = this.peek();
        if (this.is('(') && this.isNestedDeclarator(abstract)) {
            this.next();
            result.inner = this.declarator(abstract, context);
            this.expect(')');
            if (result.inner.pack)
                result.pack = true;
        } else if (this.startsName() && (!abstract || this.isIdent() || this.is('::') || this.is('operator') ||
                                         this.is('~'))) {
            result.name = this.parseName({ declarator: true, allowUnknown: true, noTemplate: context === 'param' });
            result.line = nameTok.line;
            result.column = nameTok.column;
        } else if (this.is('~') && context === 'class') {
            result.name = this.parseName({ declarator: true, allowUnknown: true });
        } else if (!abstract) {
            this.fail('expected unqualified-id' + this.before());
        }
        for (;;) {
            this.skipAttributes();
            if (this.is('[')) {
                var bracket = this.next();
                var size = null;
                if (!this.is(']')) {
                    var savedGreater = this.noGreater;
                    this.noGreater = 0;
                    size = this.expression();
                    this.noGreater = savedGreater;
                }
                this.expect(']');
                result.suffixes.push({ k: 'array', size: size, line: bracket.line, column: bracket.column,
                                       file: bracket.file });
                continue;
            }
            if (this.is('(') && (result.name !== null || result.inner !== null || abstract) &&
                this.isFunctionSuffix(abstract, result)) {
                result.suffixes.push(this.functionSuffix());
                continue;
            }
            break;
        }
        return result;
    };

    // ( after a name: parameters, or a direct initializer T x(1).
    Parser.prototype.isFunctionSuffix = function (abstract, declarator) {
        if (abstract || declarator.inner !== null)
            return true;
        if (this.func === null && this.scope.kind !== 'block')
            return !this.looksLikeInitializer();
        // In a block: T x(args) is a variable unless the parenthesis holds
        // parameter declarations.
        return !this.looksLikeInitializer();
    };

    // (expression...) rather than (parameters...).
    Parser.prototype.looksLikeInitializer = function () {
        var next = this.peek(1);
        if (next.type === 'op' && next.value === ')')
            return false;
        if (next.type === 'keyword') {
            if (TYPE_WORDS[next.value] === 1 || CV_WORDS[next.value] === 1 || next.value === 'class' ||
                next.value === 'struct' || next.value === 'enum' || next.value === 'typename' ||
                next.value === 'auto' || next.value === 'decltype' || next.value === 'union')
                return false;
            return true;
        }
        if (next.type === 'op' && next.value === '...')
            return false;
        if (next.type !== 'ident' && !(next.type === 'op' && next.value === '::'))
            return true;
        var save = this.mark();
        this.next();
        var isType = this.startsTypeId();
        // T x(U{}) or T x(U(1) + 2): a type that starts an expression.
        if (isType)
            isType = this.attempt(function () {
                this.parameterDeclaration();
                return this.is(',') || this.is(')');
            }) === true;
        this.reset(save);
        return !isType;
    };

    Parser.prototype.isNestedDeclarator = function (abstract) {
        var next = this.peek(1);
        if (next.type === 'op' &&
            (next.value === '*' || next.value === '&' || next.value === '&&' || next.value === '...'))
            return true;
        if (next.type === 'op' && next.value === '(')
            return abstract;
        if (next.type === 'op' && next.value === '[')
            return abstract;
        if (abstract)
            return false;
        if (next.type === 'ident') {
            // T (x): x is the name in parentheses unless it is a type.
            var save = this.mark();
            this.next();
            var isType = this.startsTypeId();
            this.reset(save);
            return !isType;
        }
        return false;
    };

    Parser.prototype.functionSuffix = function () {
        var tok = this.expect('(');
        var params = [];
        var variadic = false;
        var savedGreater = this.noGreater;
        this.noGreater = 0;
        if (this.is('void') && this.is(')', 1)) {
            this.next();
        } else {
            while (!this.is(')')) {
                if (this.accept('...')) {
                    variadic = true;
                    break;
                }
                params.push(this.parameterDeclaration());
                if (!this.accept(','))
                    break;
                if (this.is('...') && this.is(')', 1)) {
                    this.next();
                    variadic = true;
                    break;
                }
            }
        }
        this.noGreater = savedGreater;
        this.expect(')');
        var suffix = { k: 'function', params: params, variadic: variadic, cv: 0, ref: null, noexcept: false,
                       trailing: null, line: tok.line, column: tok.column, file: tok.file, virtSpec: null };
        for (;;) {
            if (this.is('const') || this.is('volatile')) {
                suffix.cv |= this.next().value === 'const' ? X.CONST : X.VOLATILE;
                continue;
            }
            if (this.is('&') || this.is('&&')) {
                suffix.ref = this.next().value;
                continue;
            }
            if (this.accept('noexcept')) {
                suffix.noexcept = true;
                if (this.is('('))
                    this.skipBalanced('(', ')');
                continue;
            }
            if (this.accept('throw')) {
                this.skipBalanced('(', ')');
                continue;
            }
            if (this.is('__attribute__') || (this.is('[') && this.is('[', 1))) {
                this.skipAttributes();
                continue;
            }
            break;
        }
        if (this.accept('->')) {
            // The parameters are visible in the trailing return type.
            var scope = this.pushScope('params');
            params.forEach(function (param) {
                if (param.name !== null)
                    scope.members[param.name] = { kind: 'var', name: param.name, type: param.type, storage: 'local',
                                                  jsName: param.name, declarationOnly: true };
            });
            try {
                suffix.trailing = this.typeId();
            } finally {
                this.popScope();
            }
        }
        return suffix;
    };

    // A parameter: { specs, declarator, type, name, defaultArg (syntax),
    // defaultTokens, line... }. Default arguments of members are tokens
    // (the class is complete when they are parsed).
    Parser.prototype.parameterDeclaration = function () {
        var tok = this.peek();
        var specs = this.declSpecifiers('param');
        if (specs.type === null)
            this.fail("expected parameter declarator" + this.before());
        var declarator = this.declarator(true, 'param');
        var declared = X.declaratorName(declarator);
        var param = { specs: specs, declarator: declarator, name: declared !== null ? declared.name : null,
                      type: null, defaultArg: null, defaultTokens: null, line: tok.line, column: tok.column,
                      file: tok.file, pack: declarator.pack };
        param.type = this.declaratorType(declarator, specs.type);
        // Args&&... args in an instance: one parameter per element.
        if (param.pack && !this.pattern) {
            var packs = [];
            X.packsOfType(param.type, packs);
            if (packs.length > 0) {
                var self = this;
                param.expanded = packs[0].items.map(function (item, index) {
                    return self.substitutePack(param.type, packs[0], index);
                });
            }
        }
        if (this.accept('=')) {
            if (this.deferDefaults) {
                var startIndex = this.index;
                this.skipInitializer();
                param.defaultTokens = this.slice(startIndex, this.index);
            } else {
                param.defaultArg = this.initializerClause();
            }
        }
        return param;
    };

    // Skips an initializer up to , ) ; } at depth 0 (default arguments).
    Parser.prototype.skipInitializer = function () {
        var depth = 0;
        var angle = 0;
        for (;;) {
            var tok = this.peek();
            if (tok.type === 'eof')
                return;
            if (tok.type === 'op') {
                var value = tok.value;
                if (value === '(' || value === '[' || value === '{') {
                    ++depth;
                } else if (value === ')' || value === ']' || value === '}') {
                    if (depth === 0)
                        return;
                    --depth;
                } else if (value === ',' && depth === 0 && angle === 0) {
                    return;
                } else if (value === ';' && depth === 0) {
                    return;
                } else if (value === '<' && depth === 0 && this.index > 0 &&
                           this.tokens[this.index - 1].type === 'ident' &&
                           isTemplateEntity(this.lookup(this.tokens[this.index - 1].value))) {
                    ++angle;
                } else if (value === '>' && angle > 0) {
                    --angle;
                }
            }
            this.next();
        }
    };

    // A type-id: specifiers and an abstract declarator.
    Parser.prototype.typeId = function () {
        var specs = this.typeSpecifiers();
        var declarator = this.declarator(true, 'type');
        if (declarator.name !== null)
            this.fail('expected type-id', declarator);
        return this.declaratorType(declarator, specs.type);
    };

    // The type of a declarator over a base type.
    Parser.prototype.declaratorType = function (declarator, base) {
        var type = base;
        var self = this;
        declarator.ptrs.forEach(function (ptr) {
            if (ptr.op === '*') {
                if (X.isRef(type))
                    self.error(declarator, 'cannot declare pointer to ' + "'" + X.typeString(type) + "'");
                type = X.qualify(X.pointerTo(type), ptr.cv);
            } else {
                type = ptr.op === '&' ? X.lref(type) : X.rref(type);
            }
        });
        for (var index = declarator.suffixes.length - 1; index >= 0; --index) {
            var suffix = declarator.suffixes[index];
            if (suffix.k === 'array')
                type = this.arrayType(type, suffix, declarator);
            else
                type = this.functionTypeOf(type, suffix, declarator);
        }
        if (declarator.inner !== null)
            type = this.declaratorType(declarator.inner, type);
        return type;
    };

    Parser.prototype.arrayType = function (of, suffix, declarator) {
        if (X.isRef(of))
            this.error(suffix, "declaration of '" + this.declaratorText(declarator) + "' as array of references");
        if (of.kind === 'function')
            this.error(suffix, "declaration of '" + this.declaratorText(declarator) + "' as array of functions");
        if (suffix.size === null)
            return X.arrayOf(of, null);
        if (this.pattern && this.isDependentSyntax(suffix.size)) {
            var dependent = { kind: 'array', of: of, length: -2, lengthNode: suffix.size, size: 0, align: of.align,
                              dependent: true, id: X.newId() };
            return dependent;
        }
        var size = this.constantIr(this.check(suffix.size));
        if (!X.isIntegralLike(size.type) && size.type.kind !== 'enum')
            this.error(suffix.size, "size of array '" + this.declaratorText(declarator) + "' has non-integral type '" +
                       X.typeString(size.type) + "'");
        if (size.value === undefined) {
            if (this.func === null)
                this.error(suffix.size, "array bound is not an integer constant before ']' token");
            var vla = X.arrayOf(of, -1);
            vla = Object.create(vla);
            vla.vla = size;
            return vla;
        }
        var length = T.big.toFloat(size.value);
        if (length < 0)
            this.error(suffix.size, "size of array '" + this.declaratorText(declarator) + "' is negative");
        if (length * Math.max(1, of.size) > 256 * 1024 * 1024)
            this.error(suffix.size, "size of array '" + this.declaratorText(declarator) +
                       "' exceeds maximum object size");
        return X.arrayOf(of, length);
    };

    Parser.prototype.declaratorText = function (declarator) {
        for (var current = declarator; current !== null; current = current.inner) {
            if (current.name !== null)
                return current.name.name;
        }
        return '';
    };

    // The name of a declarator (through nested ones).
    X.declaratorName = function (declarator) {
        for (var current = declarator; current !== null; current = current.inner) {
            if (current.name !== null)
                return current.name;
        }
        return null;
    };

    // The function suffix that belongs to the name itself: f(int) in
    // int (*f(int))[3] - or null.
    X.functionSuffixOf = function (declarator) {
        var levels = [];
        for (var current = declarator; current !== null; current = current.inner)
            levels.push(current);
        for (var index = levels.length - 1; index >= 0; --index) {
            var level = levels[index];
            if (level.suffixes.length > 0)
                return level.suffixes[0].k === 'function' ? level.suffixes[0] : null;
            if (level.ptrs.length > 0)
                return null;
        }
        return null;
    };

    Parser.prototype.functionTypeOf = function (returns, suffix, declarator) {
        var self = this;
        if (suffix.trailing !== null) {
            if (returns !== X.AUTO && X.unqual(returns) !== X.AUTO)
                this.error(suffix, "'" + this.declaratorText(declarator) +
                           "' function with trailing return type has '" + X.typeString(returns) +
                           "' as its type rather than plain 'auto'");
            returns = suffix.trailing;
        }
        if (returns.kind === 'function')
            this.error(suffix, "'" + this.declaratorText(declarator) + "' declared as function returning a function");
        if (returns.kind === 'array')
            this.error(suffix, "'" + this.declaratorText(declarator) + "' declared as function returning an array");
        var params = [];
        suffix.params.forEach(function (param) {
            var type = X.parameterType(param.type);
            if (type.kind === 'void')
                self.error(param, "invalid use of type 'void' in parameter declaration");
            if (param.pack && param.expanded !== undefined) {
                param.expanded.forEach(function (item) { params.push(X.parameterType(item)); });
                return;
            }
            params.push(type);
        });
        return X.functionType(returns, params, suffix.variadic, suffix.cv, suffix.ref, suffix.noexcept);
    };

    // The type of a parameter in a function type: arrays and functions are
    // pointers, top-level cv is dropped.
    X.parameterType = function (type) {
        if (type.kind === 'array')
            return X.pointerTo(type.of);
        if (type.kind === 'function')
            return X.pointerTo(type);
        if (X.isRef(type))
            return type;
        return X.unqual(type);
    };

    // --- Placeholders

    X.AUTO = { kind: 'auto', name: 'auto', size: 0, align: 1, id: X.newId() };
    X.DECLTYPE_AUTO = { kind: 'auto', name: 'decltype(auto)', size: 0, align: 1, decltype: true, id: X.newId() };

    X.containsAuto = function (type) {
        switch (type.kind) {
        case 'auto':
            return true;
        case 'pointer':
        case 'lref':
        case 'rref':
            return X.containsAuto(type.to);
        case 'function':
            return X.containsAuto(type.returns);
        }
        return X.unqual(type).kind === 'auto';
    };

    // --- Lexing for the session

    X.tokenize = function (text, file, options) {
        return convert(C.preprocess(text, file, options));
    };
})(globalThis);
