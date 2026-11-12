// Kotlin: parsing - the base, declarations and types. A unit is a script:
// declarations and statements in any order. The tree: nodes { k, line,
// column, ... }; statements and expressions are in parser-statements.js
// and parser-expressions.js. Messages are those of kotlinc.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Kt = T.kotlin;
    if (Kt.Parser)
        return;

    var MODIFIERS = {};
    ('abstract final open override private protected public internal data enum sealed inner value inline infix ' +
     'operator suspend tailrec external const lateinit vararg noinline crossinline reified companion annotation ' +
     'expect actual').split(' ').forEach(function (word) { MODIFIERS[word] = true; });
    Kt.MODIFIERS = MODIFIERS;

    function Parser(tokens, source) {
        T.Parser.call(this, tokens, source);
        // The depth of nested lambdas and functions (for messages).
        this.depth = 0;
    }
    Parser.prototype = Object.create(T.Parser.prototype);
    Parser.prototype.constructor = Parser;
    Kt.Parser = Parser;

    Parser.prototype.node = function (k, token, props) {
        var node = props || {};
        node.k = k;
        node.line = token.line;
        node.column = token.column;
        return node;
    };

    // kotlinc reports a missing element right after the previous token
    // (return + at the end of a line: the line of the +).
    Parser.prototype.syntaxError = function (text, token) {
        token = token || this.peek();
        var previous = this.index > 0 && token === this.peek() ? this.tokens[this.index - 1] : null;
        if (previous !== null && token.newline && previous.text !== undefined) {
            var lines = previous.text.split('\n');
            token = { line: previous.line + lines.length - 1,
                      column: (lines.length > 1 ? 1 : previous.column) + lines[lines.length - 1].length };
        }
        this.fail('syntax error: ' + text + '.', token);
    };

    Parser.prototype.isOp = function (value, offset) {
        var token = this.peek(offset);
        return token.type === 'op' && token.value === value;
    };

    Parser.prototype.isKeyword = function (value, offset) {
        var token = this.peek(offset);
        return token.type === 'keyword' && token.value === value;
    };

    // A soft keyword or a plain name.
    Parser.prototype.isWord = function (value, offset) {
        var token = this.peek(offset);
        return token.type === 'ident' && token.value === value && !token.quoted;
    };

    Parser.prototype.acceptOp = function (value) {
        if (this.isOp(value))
            return this.next();
        return null;
    };

    Parser.prototype.expectOp = function (value) {
        if (!this.isOp(value))
            this.syntaxError("Expecting '" + value + "'");
        return this.next();
    };

    Parser.prototype.expectKeyword = function (value) {
        if (!this.isKeyword(value))
            this.syntaxError("Expecting '" + value + "'");
        return this.next();
    };

    Parser.prototype.isName = function (offset) {
        return this.peek(offset).type === 'ident';
    };

    Parser.prototype.name = function (what) {
        var token = this.peek();
        if (token.type !== 'ident')
            this.syntaxError(what || 'Expecting a name');
        this.next();
        return token.value;
    };

    // Skips ";" and reports whether something was skipped.
    Parser.prototype.skipSemicolons = function () {
        var skipped = false;
        while (this.isOp(';')) {
            this.next();
            skipped = true;
        }
        return skipped;
    };

    // After a statement or a declaration: ";", a line break, "}" or the end.
    Parser.prototype.endOfStatement = function () {
        if (this.skipSemicolons())
            return;
        var token = this.peek();
        if (token.type === 'eof' || token.newline || this.isOp('}'))
            return;
        this.syntaxError("Unexpected tokens (use ';' to separate expressions on the same line)");
    };

    // --- The unit

    // The unit: package, imports, then declarations and statements.
    Parser.prototype.parseFile = function () {
        var unit = { k: 'file', pkg: '', imports: [], items: [], line: 1 };
        this.skipSemicolons();
        this.fileAnnotations();
        if (this.isKeyword('package')) {
            this.next();
            unit.pkg = this.qualifiedName().join('.');
            this.endOfStatement();
        }
        this.skipSemicolons();
        while (this.isWord('import')) {
            unit.imports.push(this.importDirective());
            this.endOfStatement();
            this.skipSemicolons();
        }
        while (this.peek().type !== 'eof') {
            if (this.skipSemicolons())
                continue;
            if (this.isWord('import'))
                this.syntaxError('Imports are only allowed in the beginning of file');
            if (this.isOp('}'))
                this.syntaxError('Expecting a top level declaration');
            unit.items.push(this.statement(true));
            this.endOfStatement();
        }
        return unit;
    };

    // @file:JvmName("...") - skipped.
    Parser.prototype.fileAnnotations = function () {
        while (this.isOp('@') && this.isWord('file', 1) && this.isOp(':', 2)) {
            this.next();
            this.next();
            this.next();
            this.annotationBody();
        }
    };

    Parser.prototype.qualifiedName = function () {
        var parts = [this.name()];
        while (this.isOp('.') && this.isName(1)) {
            this.next();
            parts.push(this.name());
        }
        return parts;
    };

    Parser.prototype.importDirective = function () {
        var token = this.next();
        var path = [this.name()];
        var star = false;
        while (this.isOp('.')) {
            this.next();
            if (this.acceptOp('*')) {
                star = true;
                break;
            }
            path.push(this.name());
        }
        var alias = null;
        if (!star && this.isKeyword('as')) {
            this.next();
            alias = this.name();
        }
        return this.node('import', token, { path: path, star: star, alias: alias });
    };

    // --- Modifiers and annotations

    // An annotation after "@": Name, a.b.Name, Name(args), [A B].
    Parser.prototype.annotationBody = function () {
        var token = this.peek();
        if (this.acceptOp('[')) {
            var list = [];
            while (!this.isOp(']')) {
                list.push(this.annotationBody());
                if (this.peek().type === 'eof')
                    this.syntaxError("Expecting ']'");
            }
            this.next();
            return list[0] || this.node('annotation', token, { name: '', args: [] });
        }
        var name = this.qualifiedName().join('.');
        var args = [];
        if (this.isOp('<'))
            this.typeArguments();
        if (this.isOp('(') && !this.peek().space)
            args = this.valueArguments().args;
        return this.node('annotation', token, { name: name, args: args });
    };

    // @Name or @target:Name; returns the annotation or null.
    Parser.prototype.annotation = function () {
        if (!this.isOp('@'))
            return null;
        this.next();
        if (this.isName() && this.isOp(':', 1) && /^(file|field|property|get|set|receiver|param|setparam|delegate|all)$/.test(this.peek().value)) {
            this.next();
            this.next();
        }
        return this.annotationBody();
    };

    // The modifiers and annotations before a declaration: { mods, annotations, token }.
    Parser.prototype.modifiers = function () {
        var mods = Object.create(null);
        var annotations = [];
        var first = this.peek();
        for (;;) {
            if (this.isOp('@')) {
                annotations.push(this.annotation());
                continue;
            }
            var token = this.peek();
            if (token.type === 'ident' && !token.quoted && MODIFIERS[token.value] === true && this.modifierFollows(1)) {
                this.next();
                mods[token.value] = true;
                continue;
            }
            break;
        }
        return { mods: mods, annotations: annotations, token: first };
    };

    // Whether the tokens from offset continue a list of modifiers up to a
    // declaration keyword (so that "open" or "data" stay names elsewhere).
    Parser.prototype.modifierFollows = function (offset) {
        for (var index = offset; ; ++index) {
            var token = this.peek(index);
            if (token.type === 'keyword')
                return token.value === 'fun' || token.value === 'val' || token.value === 'var' || token.value === 'class' ||
                    token.value === 'interface' || token.value === 'object' || token.value === 'typealias';
            if (token.type === 'ident' && !token.quoted) {
                if (MODIFIERS[token.value] === true)
                    continue;
                return token.value === 'constructor' || token.value === 'get' || token.value === 'set' ||
                    token.value === 'init';
            }
            if (token.type === 'op' && token.value === '@') {
                // An annotation between modifiers: skip @Name and (args).
                ++index;
                while (this.peek(index + 1).type === 'op' && this.peek(index + 1).value === '.' && this.peek(index + 2).type === 'ident')
                    index += 2;
                if (this.peek(index + 1).type === 'op' && this.peek(index + 1).value === '(') {
                    var depth = 0;
                    for (index = index + 1; ; ++index) {
                        var inner = this.peek(index);
                        if (inner.type === 'eof')
                            return false;
                        if (inner.type === 'op' && inner.value === '(')
                            ++depth;
                        else if (inner.type === 'op' && inner.value === ')' && --depth === 0)
                            break;
                    }
                }
                continue;
            }
            return false;
        }
    };

    // A declaration starts here (after modifiers and annotations).
    Parser.prototype.atDeclaration = function () {
        var token = this.peek();
        if (token.type === 'keyword')
            return token.value === 'fun' && !this.isOp('(', 1) || token.value === 'val' || token.value === 'var' ||
                token.value === 'class' || token.value === 'interface' || (token.value === 'object' && this.peek(1).type === 'ident') ||
                token.value === 'typealias';
        if (token.type === 'ident' && !token.quoted && MODIFIERS[token.value] === true)
            return this.modifierFollows(1);
        if (token.type === 'op' && token.value === '@')
            return this.modifierFollows(0);
        return false;
    };

    // --- Declarations

    // A declaration after its modifiers; context: 'top', 'member', 'local'.
    Parser.prototype.declaration = function (context) {
        var head = this.modifiers();
        var token = this.peek();
        var decl;
        if (this.isKeyword('fun')) {
            if (this.isKeyword('interface', 1)) {
                this.next();
                head.mods.fun = true;
                decl = this.classDeclaration(head, 'interface');
            } else {
                decl = this.functionDeclaration(head, context);
            }
        } else if (this.isKeyword('val') || this.isKeyword('var')) {
            decl = this.propertyDeclaration(head, context);
        } else if (this.isKeyword('class')) {
            decl = this.classDeclaration(head, head.mods.enum ? 'enum' : (head.mods.annotation ? 'annotation' : 'class'));
        } else if (this.isKeyword('interface')) {
            decl = this.classDeclaration(head, 'interface');
        } else if (this.isKeyword('object')) {
            decl = this.objectDeclaration(head);
        } else if (this.isKeyword('typealias')) {
            decl = this.typeAlias(head);
        } else if (context === 'member' && this.isWord('constructor')) {
            decl = this.secondaryConstructor(head);
        } else if (context === 'member' && this.isWord('init') && this.isOp('{', 1)) {
            this.next();
            decl = this.node('init', token, { body: this.block() });
        } else {
            this.syntaxError(context === 'top' ? 'Expecting a top level declaration' : 'Expecting member declaration', token);
        }
        decl.annotations = head.annotations;
        return decl;
    };

    Parser.prototype.typeParameters = function () {
        var list = [];
        if (!this.isOp('<'))
            return list;
        this.next();
        do {
            while (this.isOp('@'))
                this.annotation();
            var reified = false;
            if (this.isWord('reified') && this.isName(1)) {
                this.next();
                reified = true;
            }
            var token = this.peek();
            var variance = null;
            if (this.isKeyword('in')) {
                this.next();
                variance = 'in';
            } else if (this.isWord('out') && this.isName(1)) {
                this.next();
                variance = 'out';
            }
            var name = this.name('Type parameter name expected');
            var bound = null;
            if (this.acceptOp(':'))
                bound = this.type();
            list.push(this.node('typeparam', token, { name: name, variance: variance, reified: reified, bounds: bound ? [bound] : [] }));
        } while (this.acceptOp(','));
        this.expectOp('>');
        return list;
    };

    // where T : A, T : B
    Parser.prototype.typeConstraints = function (typeParams) {
        if (!this.isWord('where'))
            return;
        this.next();
        do {
            var token = this.peek();
            var name = this.name();
            this.expectOp(':');
            var bound = this.type();
            var param = typeParams.filter(function (item) { return item.name === name; })[0];
            if (param === undefined)
                this.fail("unresolved reference '" + name + "'.", token);
            param.bounds.push(bound);
        } while (this.acceptOp(','));
    };

    // ( [vararg] name: Type [= default], ... ); classParams - with val/var.
    Parser.prototype.parameters = function (classParams, allowNoType) {
        var list = [];
        this.expectOp('(');
        while (!this.isOp(')')) {
            var head = this.modifiers();
            // Parameter modifiers are followed by a name, not a declaration keyword.
            while (this.peek().type === 'ident' && /^(vararg|noinline|crossinline|private|public|internal|protected|override|open|final)$/.test(this.peek().value) &&
                   (this.isName(1) || this.isKeyword('val', 1) || this.isKeyword('var', 1) || this.isOp('@', 1))) {
                head.mods[this.next().value] = true;
                while (this.isOp('@'))
                    head.annotations.push(this.annotation());
            }
            var token = this.peek();
            var valVar = null;
            if (classParams && (this.isKeyword('val') || this.isKeyword('var')))
                valVar = this.next().value;
            var name = this.name('Expecting parameter name');
            var type = null;
            if (this.acceptOp(':'))
                type = this.type();
            else if (!allowNoType)
                this.syntaxError("Parameters must have type annotation", token);
            var init = null;
            if (this.acceptOp('='))
                init = this.expression();
            list.push(this.node('param', token, { name: name, type: type, init: init, mods: head.mods, valVar: valVar,
                                                 annotations: head.annotations }));
            if (!this.acceptOp(','))
                break;
        }
        this.expectOp(')');
        return list;
    };

    Parser.prototype.functionDeclaration = function (head, context) {
        var token = this.expectKeyword('fun');
        var typeParams = this.typeParameters();
        var receiver = null;
        var name;
        // fun Type.name(): the receiver is a type, its last part may be the name.
        if (this.isName() && this.isOp('(', 1)) {
            name = this.name();
        } else {
            if (this.peek().type !== 'ident' && !this.isOp('(') && !this.isOp('@'))
                this.syntaxError('Function declaration must have a name');
            var parsed = this.receiverAndName();
            receiver = parsed.receiver;
            name = parsed.name;
        }
        if (typeParams.length === 0 && this.isOp('<'))
            typeParams = this.typeParameters();
        var params = this.parameters(false, false);
        var returns = null;
        if (this.acceptOp(':'))
            returns = this.type();
        this.typeConstraints(typeParams);
        var body = null;
        var exprBody = false;
        if (this.isOp('{')) {
            body = this.block();
        } else if (this.acceptOp('=')) {
            body = this.expression();
            exprBody = true;
        }
        return this.node('fun', head.token.line ? head.token : token, {
            mods: head.mods, typeParams: typeParams, receiver: receiver, name: name, params: params, returns: returns,
            body: body, exprBody: exprBody, context: context, nameLine: token.line
        });
    };

    // Type.name for extensions: the type, then "." and the name.
    Parser.prototype.receiverAndName = function () {
        var start = this.index;
        var type = this.type({ receiver: true });
        if (this.acceptOp('.')) {
            return { receiver: type, name: this.name() };
        }
        // A user type a.b.c: the last part is the name.
        if (type.k === 'type' && type.parts.length > 1 && !type.nullable) {
            var last = type.parts[type.parts.length - 1];
            if (last.args.length === 0) {
                var receiver = this.node('type', type, { parts: type.parts.slice(0, -1), nullable: false });
                return { receiver: receiver, name: last.name };
            }
        }
        this.index = start;
        this.syntaxError('Expecting a name');
    };

    Parser.prototype.propertyDeclaration = function (head, context) {
        var keyword = this.next();
        var typeParams = this.typeParameters();
        var receiver = null;
        var name = null;
        var destructure = null;
        var token = this.peek();
        if (this.isOp('(')) {
            destructure = this.destructuringNames();
        } else if (this.isName() && !this.isOp('.', 1) && !this.isOp('<', 1)) {
            name = this.name();
        } else {
            if (this.peek().type !== 'ident' && !this.isOp('('))
                this.syntaxError('Expecting property name or receiver type');
            var parsed = this.receiverAndName();
            receiver = parsed.receiver;
            name = parsed.name;
        }
        var type = null;
        if (this.acceptOp(':'))
            type = this.type();
        this.typeConstraints(typeParams);
        var init = null, delegate = null;
        if (this.acceptOp('=')) {
            init = this.expression();
        } else if (this.isWord('by')) {
            this.next();
            delegate = this.expression();
        }
        var node = this.node('property', head.token.line ? head.token : keyword, {
            mods: head.mods, valVar: keyword.value, typeParams: typeParams, receiver: receiver, name: name,
            destructure: destructure, type: type, init: init, delegate: delegate, getter: null, setter: null,
            context: context, nameToken: token
        });
        if (context !== 'local' && destructure === null)
            this.accessors(node);
        return node;
    };

    // (a, b: Int, _) in a declaration or a lambda.
    Parser.prototype.destructuringNames = function () {
        var list = [];
        this.expectOp('(');
        do {
            var token = this.peek();
            var name = this.name();
            var type = null;
            if (this.acceptOp(':'))
                type = this.type();
            list.push(this.node('destructure', token, { name: name, type: type }));
        } while (this.acceptOp(','));
        this.expectOp(')');
        return list;
    };

    // get() = ..., private set, set(value) { ... } after a property. In a
    // script a line that only looks like an accessor ("set(5)") stays a
    // statement: a failed accessor is parsed again as a statement.
    Parser.prototype.accessors = function (property) {
        for (var count = 0; count < 2; ++count) {
            var start = this.index;
            var accessor = null;
            try {
                accessor = this.accessor(property);
            } catch (error) {
                if (!(error instanceof T.CompileError) || property.context !== 'top')
                    throw error;
            }
            if (accessor === null) {
                this.index = start;
                return;
            }
            if (accessor.k === 'getter') {
                if (property.getter !== null)
                    this.syntaxError('Getter is already defined', accessor);
                property.getter = accessor;
            } else {
                if (property.setter !== null)
                    this.syntaxError('Setter is already defined', accessor);
                property.setter = accessor;
            }
        }
    };

    // One accessor or null if none follows.
    Parser.prototype.accessor = function (property) {
        this.skipSemicolons();
        var first = this.peek();
        var head = this.modifiers();
        var token = this.peek();
        var isGet = this.isWord('get'), isSet = this.isWord('set');
        if (!isGet && !isSet)
            return null;
        var next = this.peek(1);
        var call = next.type === 'op' && next.value === '(' && !next.space;
        var alone = next.newline || next.type === 'eof' || (next.type === 'op' && (next.value === ';' || next.value === '}'));
        if (!call && !alone)
            return null;
        // On the line of the property only "get() = ..." without an initializer.
        if (!first.newline && !(call && property.init === null && property.delegate === null))
            return null;
        this.next();
        var accessor = this.node(isGet ? 'getter' : 'setter', token, { mods: head.mods, annotations: head.annotations,
                                                                       param: null, paramType: null, returns: null,
                                                                       body: null, exprBody: false });
        if (call) {
            this.next();
            if (isSet) {
                var paramToken = this.peek();
                accessor.param = this.name('Expecting parameter name');
                accessor.paramLine = paramToken.line;
                if (this.acceptOp(':'))
                    accessor.paramType = this.type();
                this.acceptOp(',');
            }
            this.expectOp(')');
            if (this.acceptOp(':'))
                accessor.returns = this.type();
            if (this.isOp('{')) {
                accessor.body = this.block();
            } else if (this.acceptOp('=')) {
                accessor.body = this.expression();
                accessor.exprBody = true;
            } else {
                this.syntaxError("Expecting '{'");
            }
        }
        return accessor;
    };

    Parser.prototype.typeAlias = function (head) {
        var token = this.next();
        var name = this.name();
        var typeParams = this.typeParameters();
        this.expectOp('=');
        var type = this.type();
        return this.node('typealias', head.token.line ? head.token : token, { mods: head.mods, name: name, typeParams: typeParams, type: type });
    };

    // class, interface, enum class, annotation class.
    Parser.prototype.classDeclaration = function (head, kind) {
        var token = this.next();
        var name = this.name('Name expected');
        var typeParams = this.typeParameters();
        var primary = null;
        var ctorHead = null;
        if (this.isOp('@') || (this.peek().type === 'ident' && (MODIFIERS[this.peek().value] || this.isWord('constructor')) &&
                               this.primaryConstructorFollows())) {
            ctorHead = this.modifiers();
            this.expectWord('constructor');
        }
        if (this.isOp('(')) {
            primary = this.node('primary', this.peek(), { params: this.parameters(true, false), mods: ctorHead ? ctorHead.mods : {} });
        } else if (ctorHead !== null) {
            this.syntaxError("Expecting '('");
        }
        var supers = [];
        if (this.acceptOp(':'))
            supers = this.delegationSpecifiers();
        this.typeConstraints(typeParams);
        var node = this.node('class', head.token.line ? head.token : token, {
            kind: kind, mods: head.mods, name: name, typeParams: typeParams, primary: primary, supers: supers,
            members: [], entries: [], hasBody: false, nameLine: token.line
        });
        if (this.isOp('{'))
            this.classBody(node);
        return node;
    };

    Parser.prototype.expectWord = function (word) {
        if (!this.isWord(word))
            this.syntaxError("Expecting '" + word + "'");
        return this.next();
    };

    // private constructor(...) after the name of a class.
    Parser.prototype.primaryConstructorFollows = function () {
        for (var index = 0; ; ++index) {
            var token = this.peek(index);
            if (token.type === 'ident' && token.value === 'constructor')
                return true;
            if (!(token.type === 'ident' && MODIFIERS[token.value] === true))
                return false;
        }
    };

    Parser.prototype.objectDeclaration = function (head) {
        var token = this.next();
        var name = null;
        if (this.isName())
            name = this.name();
        else if (!head.mods.companion)
            this.syntaxError('Name expected');
        var supers = [];
        if (this.acceptOp(':'))
            supers = this.delegationSpecifiers();
        var node = this.node('class', head.token.line ? head.token : token, {
            kind: 'object', mods: head.mods, name: name === null ? 'Companion' : name, typeParams: [], primary: null,
            supers: supers, members: [], entries: [], hasBody: false, nameLine: token.line
        });
        if (this.isOp('{'))
            this.classBody(node);
        return node;
    };

    // Base(args), Interface, Interface by expression.
    Parser.prototype.delegationSpecifiers = function () {
        var list = [];
        do {
            while (this.isOp('@'))
                this.annotation();
            var token = this.peek();
            var type = this.type({ noFunctionSuffix: false });
            var spec = this.node('super', token, { type: type, args: null, delegate: null });
            if (this.isOp('(') && !this.peek().newline)
                spec.args = this.valueArguments().args;
            else if (this.isWord('by')) {
                this.next();
                // The class body is not a trailing lambda of the delegate.
                var saved = this.noTrailingLambda;
                this.noTrailingLambda = true;
                spec.delegate = this.expression();
                this.noTrailingLambda = saved;
            }
            list.push(spec);
        } while (this.acceptOp(','));
        return list;
    };

    Parser.prototype.classBody = function (node) {
        node.hasBody = true;
        this.expectOp('{');
        if (node.kind === 'enum')
            this.enumEntries(node);
        while (!this.isOp('}')) {
            if (this.peek().type === 'eof')
                this.syntaxError("Expecting '}'");
            if (this.skipSemicolons())
                continue;
            node.members.push(this.declaration('member'));
            this.endOfStatement();
        }
        this.next();
    };

    Parser.prototype.enumEntries = function (node) {
        while (!this.isOp('}') && !this.isOp(';')) {
            while (this.isOp('@'))
                this.annotation();
            var token = this.peek();
            if (token.type !== 'ident')
                break;
            if (this.atDeclaration())
                break;
            var name = this.name();
            var entry = this.node('entry', token, { name: name, args: [], members: null });
            if (this.isOp('('))
                entry.args = this.valueArguments().args;
            if (this.isOp('{')) {
                var body = this.node('class', this.peek(), { kind: 'entry', mods: {}, name: name, typeParams: [], primary: null,
                                                            supers: [], members: [], entries: [], hasBody: false });
                this.classBody(body);
                entry.members = body.members;
            }
            node.entries.push(entry);
            if (!this.acceptOp(','))
                break;
        }
        this.acceptOp(';');
    };

    Parser.prototype.secondaryConstructor = function (head) {
        var token = this.next();
        var params = this.parameters(false, false);
        var delegation = null;
        if (this.acceptOp(':')) {
            var callToken = this.peek();
            var kind;
            if (this.isKeyword('this'))
                kind = 'this';
            else if (this.isKeyword('super'))
                kind = 'super';
            else
                this.syntaxError("Expecting a 'this' or 'super' constructor call");
            this.next();
            delegation = this.node('delegation', callToken, { kind: kind, args: this.valueArguments().args });
        }
        var body = this.isOp('{') ? this.block() : null;
        return this.node('ctor', head.token.line ? head.token : token, { mods: head.mods, params: params, delegation: delegation, body: body });
    };

    // --- Types

    // A type; options.receiver - for "fun Type.name" (no "Type.(...) -> R").
    Parser.prototype.type = function (options) {
        var token = this.peek();
        while (this.isOp('@'))
            this.annotation();
        var suspend = false;
        if (this.isWord('suspend') && (this.isOp('(', 1) || this.isName(1))) {
            this.next();
            suspend = true;
        }
        var type;
        if (this.isOp('(')) {
            type = this.parenthesizedOrFunctionType(token, options);
        } else if (this.isWord('dynamic') && !this.isOp('.', 1)) {
            this.next();
            type = this.node('dynamic', token, { nullable: false });
        } else {
            type = this.userType(token, options);
        }
        if (suspend) {
            if (type.k !== 'ftype')
                this.syntaxError("Expecting '('", token);
            type.suspend = true;
        }
        // T & Any - a definitely non-nullable type.
        if (this.isOp('&') && this.isWord('Any', 1)) {
            this.next();
            this.next();
            type = this.node('dnn', token, { type: type, nullable: false });
        }
        return type;
    };

    Parser.prototype.nullableSuffix = function (type) {
        for (;;) {
            var token = this.peek();
            if (token.newline)
                return type;
            if (this.isOp('?.')) {
                // String?.length in a type is "?" and ".": the token is split.
                var dot = { type: 'op', value: '.', text: '.', line: token.line, column: token.column + 1, space: false,
                            newline: false };
                this.tokens.splice(this.index + 1, 0, dot);
                this.tokens[this.index] = { type: 'op', value: '?', text: '?', line: token.line, column: token.column,
                                            space: token.space, newline: token.newline };
            }
            if (!this.isOp('?'))
                return type;
            this.next();
            type.nullable = true;
        }
    };

    Parser.prototype.parenthesizedOrFunctionType = function (token, options) {
        this.next();
        var params = [];
        while (!this.isOp(')')) {
            var paramToken = this.peek();
            var name = null;
            if (this.isName() && this.isOp(':', 1)) {
                name = this.name();
                this.next();
            }
            params.push(this.node('fparam', paramToken, { name: name, type: this.type() }));
            if (!this.acceptOp(','))
                break;
        }
        this.expectOp(')');
        if (this.isOp('->')) {
            this.next();
            var returns = this.type();
            return this.node('ftype', token, { receiver: null, params: params.map(function (param) { return param.type; }),
                                               paramNames: params.map(function (param) { return param.name; }),
                                               returns: returns, nullable: false, suspend: false });
        }
        if (params.length !== 1 || params[0].name !== null)
            this.syntaxError("Expecting '->'");
        var inner = params[0].type;
        var copy = Object.assign({}, inner);
        var nullable = this.isOp('?') && !this.peek().newline;
        this.nullableSuffix(copy);
        if (nullable)
            copy.nullable = true;
        // (A).() -> B, (A?).() -> B
        if (this.isOp('.') && this.isOp('(', 1) && !(options && options.receiver))
            return this.functionTypeWithReceiver(token, copy);
        return copy;
    };

    Parser.prototype.functionTypeWithReceiver = function (token, receiver) {
        this.expectOp('.');
        var fn = this.parenthesizedOrFunctionType(this.peek(), null);
        if (fn.k !== 'ftype')
            this.syntaxError("Expecting '->'");
        fn.receiver = receiver;
        fn.line = token.line;
        fn.column = token.column;
        return fn;
    };

    // a.b.C<T>.D<U>?; then possibly ".(params) -> R" (a receiver).
    Parser.prototype.userType = function (token, options) {
        var parts = [];
        for (;;) {
            var partToken = this.peek();
            if (partToken.type !== 'ident')
                this.syntaxError('Type expected', partToken);
            this.next();
            var args = [];
            if (this.isOp('<'))
                args = this.typeArguments();
            parts.push({ name: partToken.value, args: args, line: partToken.line, column: partToken.column });
            if (this.isOp('.') && this.isName(1) && !(options && options.receiver && this.isOp('(', 2))) {
                this.next();
                continue;
            }
            break;
        }
        var type = this.node('type', token, { parts: parts, nullable: false });
        this.nullableSuffix(type);
        if (this.isOp('.') && this.isOp('(', 1) && !(options && options.receiver))
            return this.functionTypeWithReceiver(token, type);
        return type;
    };

    // <T, out U, in V, *>
    Parser.prototype.typeArguments = function () {
        var list = [];
        this.expectOp('<');
        do {
            var token = this.peek();
            if (this.acceptOp('*')) {
                list.push(this.node('proj', token, { variance: 'star', type: null }));
                continue;
            }
            var variance = null;
            if (this.isKeyword('in')) {
                this.next();
                variance = 'in';
            } else if (this.isWord('out') && (this.isName(1) || this.isOp('(', 1))) {
                this.next();
                variance = 'out';
            }
            list.push(this.node('proj', token, { variance: variance, type: this.type() }));
        } while (this.acceptOp(','));
        this.expectOp('>');
        return list;
    };

    // Type arguments after a name in an expression, or null if "<" is a comparison.
    Parser.prototype.tryTypeArguments = function () {
        var start = this.index;
        try {
            var args = this.typeArguments();
            var next = this.peek();
            if (next.type === 'op' && !next.newline &&
                (next.value === '(' || next.value === '{' || next.value === '::' || next.value === '.' || next.value === '?.')) {
                return args;
            }
            if (next.type === 'label' || (next.type === 'op' && next.value === '@'))
                return args;
        } catch (error) {
            if (!(error instanceof T.CompileError))
                throw error;
        }
        this.index = start;
        return null;
    };

    Kt.parse = function (text, source) {
        var parser = new Parser(Kt.lex(text, source), source);
        return parser.parseFile();
    };
})(globalThis);
