// C++: declarations - the unit, namespaces, using, variables, functions,
// classes and enums (continues parser.js). Declarations enter their scopes
// at once; a variable gives an initialization statement (a local one in
// its block, a namespace one in the body of the unit); a function body is
// parsed at once, after its class is complete, or when the function is
// first used (library functions and members of template instances).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var X = T.cpp;
    var Parser = X.Parser;
    if (Object.prototype.hasOwnProperty.call(Parser.prototype, 'translationUnit'))
        return;

    var types = X.types;
    var big = T.big;

    // --- The unit

    // Declarations and statements up to the end; statements and the
    // initialization of namespace variables go to the body of the unit.
    // The declarations of a part of the library (Session.loadChunks).
    Parser.prototype.declarationsToEnd = function () {
        while (this.peek().type !== 'eof') {
            if (!this.accept(';'))
                this.declaration('namespace');
        }
    };

    Parser.prototype.translationUnit = function () {
        while (this.peek().type !== 'eof') {
            if (this.accept(';'))
                continue;
            if (this.startsDeclaration('namespace')) {
                this.declaration('namespace');
            } else {
                if (this.is('}'))
                    this.fail("expected declaration" + this.before());
                var statement = this.withTop(function () { return this.statement(); });
                this.session.unitBody().push(statement);
            }
        }
    };

    // Statements at namespace scope run in the body of the unit.
    Parser.prototype.withTop = function (callback) {
        var saved = this.func;
        this.func = this.session.topContext();
        try {
            return callback.call(this);
        } finally {
            this.func = saved;
        }
    };

    var DECLARATION_WORDS = { typedef: 1, using: 1, namespace: 1, template: 1, static_assert: 1, extern: 1, static: 1,
                              inline: 1, constexpr: 1, consteval: 1, constinit: 1, virtual: 1, explicit: 1, friend: 1,
                              mutable: 1, thread_local: 1, register: 1, const: 1, volatile: 1, class: 1, struct: 1,
                              union: 1, enum: 1, typename: 1, auto: 1, __attribute__: 1, __extension__: 1, asm: 1 };

    // Whether a declaration starts here (rather than an expression).
    Parser.prototype.startsDeclaration = function (context) {
        var tok = this.peek();
        if (tok.type === 'keyword') {
            if (DECLARATION_WORDS[tok.value] === 1 || X.TYPE_WORDS[tok.value] === 1)
                return !(tok.value === 'using' && false);
            if (tok.value === 'decltype')
                return true;
            return false;
        }
        if (tok.type === 'op' && tok.value === '[' && this.is('[', 1))
            return true;
        if (tok.type === 'ident' && tok.value === '_Static_assert')
            return true;
        if (!(tok.type === 'ident' || (tok.type === 'op' && tok.value === '::')))
            return false;
        if (this.isConstructorStart(context))
            return true;
        var save = this.mark();
        var self = this;
        var name = this.attempt(function () { return self.parseName({ allowUnknown: true }); });
        var result = false;
        if (name !== null) {
            var next = this.peek();
            if (X.isTypeEntity(name.entity) || (name.dependent && name.entity === null)) {
                if (next.type === 'ident' || (next.type === 'keyword' && (next.value === 'operator' ||
                                                                           next.value === 'const' ||
                                                                           next.value === 'volatile')))
                    result = true;
                else if (next.type === 'op' && (next.value === '*' || next.value === '&' || next.value === '&&' ||
                                                next.value === '...'))
                    result = !(next.value === '*' && name.dependent && name.entity === null);
                else if (next.type === 'op' && next.value === '(')
                    result = this.isParenthesizedDeclarator();
                else if (next.type === 'op' && next.value === '[' && this.is('[', 1))
                    result = true;
            }
        }
        this.reset(save);
        return result;
    };

    // T (*name)... or T (&name)... - a declarator in parentheses.
    Parser.prototype.isParenthesizedDeclarator = function () {
        var first = this.peek(1);
        if (!(first.type === 'op' && (first.value === '*' || first.value === '&' || first.value === '&&')))
            return false;
        var second = this.peek(2);
        return second.type === 'ident' && this.is(')', 3);
    };

    // A declaration in a context: 'namespace', 'class', 'block'. Returns
    // the statements of a block declaration.
    Parser.prototype.declaration = function (context) {
        this.skipAttributes();
        var tok = this.peek();
        if (tok.type === 'keyword') {
            switch (tok.value) {
            case 'inline':
                if (!this.is('namespace', 1))
                    break;
                this.next();
                this.namespaceDefinition();
                return [];
            case 'namespace':
                this.namespaceDefinition();
                return [];
            case 'using':
                return this.usingDeclaration(context);
            case 'template':
                this.templateDeclaration(context);
                return [];
            case 'static_assert':
                this.staticAssertDeclaration();
                return [];
            case 'extern':
                if (this.peek(1).type === 'string') {
                    this.linkageSpecification(context);
                    return [];
                }
                break;
            case 'asm':
                this.next();
                this.skipBalanced('(', ')');
                this.expect(';');
                return [];
            }
        }
        if (tok.type === 'ident' && tok.value === '_Static_assert') {
            this.staticAssertDeclaration();
            return [];
        }
        if (this.accept(';'))
            return [];
        var specs = this.declSpecifiers(context);
        return this.simpleDeclaration(context, specs, tok);
    };

    Parser.prototype.linkageSpecification = function (context) {
        this.next();
        this.next();
        if (this.accept('{')) {
            while (!this.accept('}')) {
                if (this.peek().type === 'eof')
                    this.fail("expected '}' at end of input");
                this.declaration(context);
            }
            return;
        }
        this.declaration(context);
    };

    Parser.prototype.staticAssertDeclaration = function () {
        var tok = this.next();
        this.expect('(');
        var condition = this.assignment();
        var message = null;
        if (this.accept(','))
            message = this.next();
        this.expect(')');
        this.expect(';');
        if (this.pattern && this.isDependentSyntax(condition))
            return;
        var value = this.constantValue(condition, 'static assertion');
        if (big.sign(value) === 0) {
            var text = message !== null ? ': ' + T.utf8.decode(T.utf8.fromBytes(X.stringBytes(message))) : '';
            this.error(tok, 'static assertion failed' + text);
        }
    };

    // --- Namespaces and using

    Parser.prototype.namespaceDefinition = function () {
        var tok = this.next();
        var isInline = false;
        if (this.tokens[this.index - 2] && this.tokens[this.index - 2].value === 'inline')
            isInline = true;
        this.skipAttributes();
        if (this.isIdent() && this.is('=', 1)) {
            var aliasName = this.next().value;
            this.next();
            var target = this.parseName();
            if (target.entity === null || target.entity.kind !== 'namespace')
                this.error(target, "'" + target.name + "' is not a namespace-name");
            this.expect(';');
            X.declare(this.scope, aliasName, target.entity);
            return;
        }
        var names = [];
        if (this.isIdent()) {
            names.push(this.next().value);
            while (this.accept('::')) {
                this.accept('inline');
                names.push(this.expectIdent().value);
            }
        } else {
            names.push(null);
        }
        this.skipAttributes();
        this.expect('{');
        if (this.scope.kind !== 'namespace')
            this.error(tok, "'namespace' definition is not allowed here");
        var saved = this.scope;
        var self = this;
        names.forEach(function (name) {
            var key = name === null ? ' anonymous' : name;
            var existing = self.scope.members[key];
            var space;
            if (existing !== undefined && existing.kind === 'namespace' && existing.parent === self.scope) {
                space = existing;
            } else {
                space = new X.Namespace(name, self.scope);
                space.inlineNamespace = isInline;
                X.declare(self.scope, key, space);
                if (name === null || isInline)
                    X.append(self.scope.usings, space);
            }
            self.scope = space;
        });
        try {
            while (!this.is('}')) {
                if (this.peek().type === 'eof')
                    this.fail("expected '}' at end of input");
                if (this.accept(';'))
                    continue;
                if (!this.startsDeclaration('namespace'))
                    this.fail('expected unqualified-id' + this.before());
                this.declaration('namespace');
            }
            this.next();
        } finally {
            this.scope = saved;
        }
    };

    // using namespace N; using N::name; using Alias = type;
    Parser.prototype.usingDeclaration = function (context) {
        var tok = this.next();
        if (this.accept('namespace')) {
            var name = this.parseName();
            if (name.entity === null || name.entity.kind !== 'namespace')
                this.error(name, "'" + name.name + "' is not a namespace-name");
            this.expect(';');
            if (X.isPersistent(this.scope))
                X.append(this.scope.usings, name.entity);
            else
                this.scope.usings.push(name.entity);
            return [];
        }
        if (this.isIdent() && (this.is('=', 1) || (this.is('[', 1) && this.is('[', 2)))) {
            var aliasTok = this.next();
            this.skipAttributes();
            this.expect('=');
            var type = this.typeId();
            this.expect(';');
            this.declareTypedef(aliasTok.value, type, aliasTok);
            return [];
        }
        this.accept('typename');
        var target = this.parseName({ allowUnknown: true });
        this.expect(';');
        var cls = this.currentClass();
        if (cls !== null && this.scope === cls) {
            this.memberUsing(cls, target, tok);
            return [];
        }
        if (target.entity === null)
            this.error(target, "'" + target.name + "' has not been declared");
        this.declareUsing(target.name, target.entity);
        return [];
    };

    Parser.prototype.declareUsing = function (name, entity) {
        if (entity.kind === 'functions') {
            var self = this;
            entity.items.forEach(function (item) { X.declare(self.scope, name, item); });
            return;
        }
        X.declare(this.scope, name, entity);
    };

    Parser.prototype.declareTypedef = function (name, type, tok) {
        var existing = X.member(this.scope, name);
        if (existing !== undefined && !existing.fromSession) {
            if (existing.kind === 'typedef' && existing.type === type)
                return;
            if (!(existing.isClass && existing === X.unqual(type)))
                this.error(tok, "conflicting declaration '" + 'typedef ' + X.typeString(type) + ' ' + name + "'");
        }
        var entity = { kind: 'typedef', name: name, type: type, parent: this.scope };
        X.declare(this.scope, name, entity);
        // An unnamed class gets the name of its typedef.
        var plain = X.unqual(type);
        if ((plain.isClass || plain.kind === 'enum') && plain.anonymous && plain.displayName === undefined) {
            plain.name = name;
            plain.tag = name;
        }
    };

    // --- Simple declarations

    Parser.prototype.simpleDeclaration = function (context, specs, startTok) {
        var statements = [];
        if (this.accept(';')) {
            if (specs.type === null && specs.defined === null)
                this.error(startTok, 'declaration does not declare anything');
            return statements;
        }
        if (specs.type === null && !this.is('~') && !this.is('operator') && !this.isConstructorStart(context) &&
            !(context === 'class' && this.isIdent()))
            this.fail(this.isIdent() ? "'" + this.peek().text + "' does not name a type"
                                     : 'expected unqualified-id' + this.before());
        // A structured binding: auto [a, b] = ...
        if (this.startsBinding(specs)) {
            statements = this.structuredBinding(specs, startTok);
            return statements;
        }
        var first = true;
        for (;;) {
            var declarator = this.declarator(false, context);
            var name = X.declaratorName(declarator);
            if (name === null)
                this.fail('expected unqualified-id' + this.before());
            if (specs.type === null && name.destructor === null && name.conversion === null && !this.isCtorName(name))
                this.error(name, "ISO C++ forbids declaration of '" + name.name + "' with no type");
            var base = specs.type;
            if (base === null)
                base = name.destructor !== null || this.isCtorName(name) ? types.void : name.conversion;
            var type = constexprType(this.declaratorType(declarator, base), specs);
            if (specs.storage === 'typedef') {
                this.declareTypedef(name.name, type, name);
            } else if (type.kind === 'function') {
                var func = this.declareFunction(context, specs, declarator, type, name);
                if (first && this.startsFunctionBody()) {
                    this.functionDefinition(func, declarator, context);
                    return statements;
                }
                if (this.accept('=')) {
                    if (this.accept('delete')) {
                        func.deleted = true;
                        func.defined = true;
                    } else if (this.accept('default')) {
                        func.defaulted = true;
                    } else {
                        this.fail('expected primary-expression' + this.before());
                    }
                }
            } else {
                statements = statements.concat(this.variableDeclaration(context, specs, declarator, type, name));
            }
            first = false;
            if (!this.accept(','))
                break;
        }
        this.expect(';', "',' or ';'");
        return statements;
    };

    // constexpr makes a variable const.
    function constexprType(type, specs) {
        if (!specs.constexpr || type.kind === 'function' || X.isRef(type))
            return type;
        return X.withCv(type, X.cvOf(type) | X.CONST);
    }

    Parser.prototype.isCtorName = function (name) {
        var owner = name.qualifier !== null && name.qualifier.isClass ? name.qualifier : this.currentClass();
        if (owner === null || name.destructor !== null)
            return false;
        var own = owner.template !== null ? owner.template.name : owner.name;
        return name.name === own || name.name === owner.name;
    };

    Parser.prototype.startsFunctionBody = function () {
        if (this.is('{') || this.is('try'))
            return true;
        if (this.is(':') && !this.is('::'))
            return true;
        return false;
    };

    // --- Variables

    Parser.prototype.variableDeclaration = function (context, specs, declarator, type, name) {
        var tok = name;
        var local = context === 'block' && specs.storage !== 'static' && specs.storage !== 'extern';
        // The name is in scope in its initializer: [&f] in the lambda of f.
        var object;
        if (local && name.qualifier === null && !X.containsAuto(type) && this.func !== null &&
            X.unqual(type).kind !== 'void')
            object = this.declareLocal(name, type);
        var init = this.initializerSyntax();
        if (type.kind === 'void' || X.unqual(type).kind === 'void')
            this.error(tok, "variable or field '" + name.name + "' declared void");
        if (name.qualifier !== null && name.qualifier.isClass) {
            // int A::count = 0; - the definition of a static member.
            return this.staticMemberDefinition(name, type, init, specs);
        }
        if (local)
            return this.localVariable(name, type, init, specs, object);
        return this.staticVariable(context, name, type, init, specs);
    };

    // An initializer: { k: 'copy', expr } (= x), { k: 'braced', items,
    // copy } ({...} or = {...}), { k: 'direct', args } ((...)) or null.
    Parser.prototype.initializerSyntax = function () {
        var tok = this.peek();
        if (this.accept('=')) {
            if (this.is('{'))
                return this.node('braced', tok, { items: this.bracedList().items, copy: true });
            return this.node('copy', tok, { expr: this.initializerClause() });
        }
        if (this.is('{'))
            return this.node('braced', tok, { items: this.bracedList().items, copy: false });
        if (this.is('(')) {
            this.next();
            var args = this.expressionList(')');
            this.expect(')');
            return this.node('direct', tok, { args: args });
        }
        return null;
    };

    Parser.prototype.localVariable = function (name, type, init, specs, object) {
        if (X.containsAuto(type))
            type = this.deduceVariable(type, init, name);
        if (object === undefined)
            object = this.declareLocal(name, type);
        if (type.kind === 'array' && type.length === null && init === null)
            this.error(name, "storage size of '" + name.name + "' isn't known");
        var initIr = this.initializeVariable(object, init, name);
        var dtor = X.isRef(type) ? null : this.elementDestructor(type);
        return [this.statementNode('decl', name, { obj: object, init: initIr, dtor: dtor })];
    };

    Parser.prototype.declareLocal = function (name, type) {
        var existing = this.scope.members[name.name];
        if (existing !== undefined && existing.kind === 'var' && this.scope.kind !== 'namespace')
            this.error(name, "redeclaration of '" + X.typeString(existing.type) + ' ' + name.name + "'");
        if (existing !== undefined && this.scope.paramScope === true && existing.param)
            this.error(name, "declaration of '" + X.typeString(type) + ' ' + name.name + "' shadows a parameter");
        if (X.unqual(type).isClass && X.unqual(type).abstract)
            this.error(name, "cannot declare variable '" + name.name + "' to be of abstract type '" +
                       X.typeString(type) + "'");
        var object = this.func.newLocal(name.name, type, name);
        object.isConst = X.isConst(type);
        object.outermost = this.scope.paramScope === true;
        X.declare(this.scope, name.name, object);
        return object;
    };

    // A namespace variable, a static local or an extern declaration.
    Parser.prototype.staticVariable = function (context, name, type, init, specs) {
        var scope = name.qualifier !== null ? name.qualifier : this.scope;
        var storage = context === 'block' ? 'static' : 'global';
        var existing = X.member(scope, name.name);
        var object = null;
        if (existing !== undefined && existing.kind === 'var' && (existing.extern || specs.storage === 'extern')) {
            object = existing;
            if (specs.storage !== 'extern')
                X.change(object, 'extern', false);
        } else if (existing !== undefined && existing.kind === 'var' && !existing.fromSession && storage === 'global') {
            this.error(name, "redefinition of '" + X.typeString(existing.type) + ' ' + name.name + "'");
        }
        if (X.containsAuto(type))
            type = this.deduceVariable(type, init, name);
        var instance = this.instantiating;
        if (instance !== undefined && instance !== null && instance.kind === 'variable' && instance.target === null) {
            object = this.session.newGlobal(instance.name, type, 'global', scope);
            object.isConst = X.isConst(type);
            object.library = this.isLibraryToken(name);
            instance.target = object;
        } else if (object === null) {
            object = this.session.newGlobal(name.name, type, storage, scope);
            object.extern = specs.storage === 'extern' && init === null;
            object.isConst = X.isConst(type);
            object.library = this.isLibraryToken(name);
            object.internal = specs.storage === 'static';
            X.declare(scope, name.name, object);
        }
        if (object.extern)
            return [];
        var self = this;
        var initIr = this.withStaticContext(storage === 'static', function () {
            return self.initializeVariable(object, init, name);
        });
        // Constants of integral types fold: const int N = 10; int a[N];
        if (object.isConst && initIr !== null && initIr.value !== undefined && (X.isIntegralLike(X.unqual(type)) ||
                                                                               X.unqual(type).kind === 'enum'))
            object.constValue = initIr.value;
        if (object.isConst && initIr !== null && initIr.value !== undefined && X.isFloat(X.unqual(type)))
            object.constValue = initIr.value;
        var statement = this.statementNode('decl', name, { obj: object, init: initIr });
        if (storage === 'static')
            return [statement];
        this.session.unitBody().push(statement);
        return [];
    };

    // Initializers of namespace variables run in the body of the unit: its
    // context holds their temporaries.
    Parser.prototype.withStaticContext = function (isLocal, callback) {
        if (isLocal || this.func !== null)
            return callback();
        var saved = this.func;
        this.func = this.session.topContext();
        try {
            return callback();
        } finally {
            this.func = saved;
        }
    };

    Parser.prototype.statementNode = function (kind, tok, fields) {
        var node = fields || {};
        node.k = kind;
        node.line = tok.line;
        node.file = tok.file;
        return node;
    };

    // auto [a, b] = expr; - the hidden variable and references to its parts.
    // auto [ or auto& [ or auto&& [: the reference goes to specs.bindingRef.
    Parser.prototype.startsBinding = function (specs) {
        if (!specs.autoType)
            return false;
        if (this.is('['))
            return true;
        if ((this.is('&') || this.is('&&')) && this.is('[', 1)) {
            specs.bindingRef = this.next().value;
            return true;
        }
        return false;
    };

    Parser.prototype.structuredBinding = function (specs, tok) {
        this.next();
        var names = [];
        do {
            names.push(this.expectIdent());
        } while (this.accept(','));
        this.expect(']');
        return this.bindStructured(specs, names, tok, null);
    };

    // --- Functions

    // A function entity.
    X.Function = function (name, type, owner) {
        this.kind = 'func';
        this.name = name;
        this.type = type;
        this.owner = owner;
        this.params = [];
        this.isMember = false;
        this.isStatic = false;
        this.isVirtual = false;
        this.isPure = false;
        this.isCtor = false;
        this.isDtor = false;
        this.explicit = false;
        this.deleted = false;
        this.defaulted = false;
        this.implicit = false;
        this.inline = false;
        this.constexpr = false;
        this.access = 'public';
        this.defined = false;
        this.body = null;
        this.lazy = null;
        this.context = null;
        this.index = undefined;
        this.native = undefined;
        this.library = false;
        this.template = null;
        this.templateArgs = null;
        this.vslot = -1;
        this.async = false;
        this.addressTaken = false;
        this.compiled = false;
        this.id = X.newId();
    };

    // The parameters of a function declarator with their names and default
    // arguments; packs of a template instance are expanded.
    Parser.prototype.functionParams = function (declarator) {
        var suffix = X.functionSuffixOf(declarator);
        var result = [];
        if (suffix === null)
            return result;
        var scope = this.scope;
        suffix.params.forEach(function (param) {
            if (param.pack && param.expanded !== undefined) {
                param.expanded.forEach(function (type, index) {
                    result.push({ name: param.name === null ? null : param.name + '#' + index, type: type,
                                  packName: param.name, packIndex: index, defaultArg: null, defaultTokens: null,
                                  defaultScope: scope, line: param.line, column: param.column, file: param.file });
                });
                if (param.name !== null && param.expanded.length === 0)
                    result.emptyPacks = (result.emptyPacks || []).concat([param.name]);
                return;
            }
            result.push({ name: param.name, type: param.type, defaultArg: param.defaultArg,
                          defaultTokens: param.defaultTokens, defaultScope: scope, line: param.line,
                          column: param.column, file: param.file });
        });
        return result;
    };

    // Declares a function (or finds its earlier declaration).
    Parser.prototype.declareFunction = function (context, specs, declarator, type, name) {
        var cls = context === 'class' ? this.currentClass() : null;
        if (cls === null && name.qualifier !== null && name.qualifier.isClass)
            return this.outOfClassMember(name, type, declarator, specs);
        if (cls !== null && !specs.friend)
            return this.declareMethod(cls, specs, declarator, type, name);
        var scope = name.qualifier !== null ? name.qualifier : this.scope;
        if (specs.friend)
            scope = X.enclosingNamespace(this.scope);
        if (!X.isPersistent(scope)) {
            // A declaration in a block names a function of the namespace.
            scope = X.enclosingNamespace(scope);
        }
        var params = this.functionParams(declarator);
        var instance = this.instantiating;
        if (instance !== undefined && instance !== null && instance.kind === 'function' && instance.target === null) {
            var made = new X.Function(name.name, type, scope);
            made.params = params;
            this.applySpecifiers(made, specs);
            instance.target = made;
            return made;
        }
        var existing = this.findDeclaration(scope, name.name, type, params);
        if (existing !== null) {
            if (existing.fromSession) {
                existing.fromSession = false;
                X.change(existing, 'defined', false);
                X.change(existing, 'body', null);
                X.change(existing, 'lazy', null);
                X.change(existing, 'compiled', false);
                X.change(existing, 'params', params);
                X.change(existing, 'type', type);
            } else {
                this.mergeDefaults(existing, params);
            }
            if (specs.friend && cls !== null)
                X.append(cls.friends || (cls.friends = []), existing);
            return existing;
        }
        var func = new X.Function(name.name, type, scope);
        func.params = params;
        func.library = this.isLibraryToken(name);
        this.applySpecifiers(func, specs);
        func.isStatic = false;
        func.internal = specs.storage === 'static';
        this.checkOperatorDeclaration(func, name, null);
        X.declare(scope, name.name, func);
        if (func.library)
            this.session.attachNative(func);
        if (specs.friend && cls !== null) {
            func.friendOf = cls;
            (cls.friends || (cls.friends = [])).push(func);
            // A friend defined in the class is found by ADL only.
            func.hiddenFriend = this.startsFunctionBody();
        }
        return func;
    };

    Parser.prototype.applySpecifiers = function (func, specs) {
        func.inline = specs.inline || specs.constexpr;
        func.constexpr = specs.constexpr;
        func.explicit = specs.explicit;
        func.isVirtual = specs.virtual;
        func.isStatic = specs.storage === 'static';
    };

    // An earlier declaration of the same function in a scope.
    Parser.prototype.findDeclaration = function (scope, name, type, params) {
        var set = X.member(scope, name);
        if (set === undefined || set.kind !== 'functions')
            return null;
        var signature = X.typeString(type);
        for (var index = 0; index < set.items.length; ++index) {
            var item = set.items[index];
            if (item.kind !== 'func')
                continue;
            if (sameParams(item.type, type)) {
                if (X.unqual(item.type.returns) !== X.unqual(type.returns) && !item.fromSession &&
                    !X.containsAuto(item.type.returns) && !X.containsAuto(type.returns))
                    this.error(params.length > 0 ? params[0] : null,
                               "ambiguating new declaration of '" + X.typeString(type.returns) + ' ' + name + "'");
                return item;
            }
            if (item.fromSession && X.typeString(item.type) === signature)
                return item;
        }
        return null;
    };

    function sameParams(left, right) {
        if (left.params.length !== right.params.length || left.variadic !== right.variadic || left.cv !== right.cv ||
            left.ref !== right.ref)
            return false;
        for (var index = 0; index < left.params.length; ++index) {
            if (left.params[index] !== right.params[index])
                return false;
        }
        return true;
    }
    X.sameParams = sameParams;

    // Default arguments of a later declaration join those of the first.
    Parser.prototype.mergeDefaults = function (func, params) {
        params.forEach(function (param, index) {
            var old = func.params[index];
            if (old === undefined)
                return;
            if (param.name !== null && param.name !== undefined)
                old.name = param.name;
            if ((param.defaultArg !== null || param.defaultTokens !== null) && old.defaultArg === null &&
                old.defaultTokens === null) {
                old.defaultArg = param.defaultArg;
                old.defaultTokens = param.defaultTokens;
                old.defaultScope = param.defaultScope;
            }
        });
    };

    // A function definition: the body now, after the class, or later.
    Parser.prototype.functionDefinition = function (func, declarator, context) {
        var bodyStart = this.index;
        var end = this.skipFunctionBody();
        if (func.defined && !func.fromSession && func.lazy === null && !this.instantiating)
            this.error(declarator, "redefinition of '" + X.typeString(func.type.returns) + ' ' +
                       X.functionSignature(func) + "'");
        var params = this.functionParams(declarator);
        X.change(func, 'params', params);
        X.change(func, 'defined', true);
        func.fromSession = false;
        // A::f() { ... } outside its class or namespace sees the names of A.
        var scope = this.scope;
        if (func.owner && scope.kind === 'namespace' && func.owner !== scope)
            scope = func.owner;
        var lazy = { tokens: this.tokens, start: bodyStart, end: end, scope: scope, library: this.library };
        X.change(func, 'lazy', lazy);
        var deferred = context === 'class' || this.deferBodies;
        if (deferred && !X.containsAuto(func.type.returns))
            return;
        if (this.isLazy(func) && !X.containsAuto(func.type.returns))
            return;
        this.session.compileBody(func);
    };

    // Library functions and members of template instances are parsed when
    // they are first used.
    Parser.prototype.isLazy = function (func) {
        return func.library || func.template !== null || (func.owner && func.owner.isClass &&
                                                          func.owner.template !== null) ||
            this.instantiating !== undefined && this.instantiating !== null;
    };

    // Skips a body (with a constructor initializer list or try) and returns
    // the index after it.
    Parser.prototype.skipFunctionBody = function () {
        if (this.accept('try')) {
            var tryEnd = this.skipFunctionBody();
            this.index = tryEnd;
            while (this.is('catch')) {
                this.next();
                this.index = this.matching(this.index);
                this.index = this.matching(this.index);
            }
            return this.index;
        }
        if (this.accept(':')) {
            // Member initializers up to the body.
            while (!this.is('{')) {
                var tok = this.peek();
                if (tok.type === 'eof')
                    this.fail("expected '{' at end of input");
                if (tok.type === 'op' && (tok.value === '(' || tok.value === '{') && this.index > 0) {
                    var previous = this.tokens[this.index - 1];
                    if (tok.value === '{' && !(previous.type === 'ident' || previous.value === '>' ||
                                               previous.value === '...'))
                        break;
                    this.index = this.matching(this.index);
                    continue;
                }
                this.next();
            }
        }
        if (!this.is('{'))
            this.fail("expected '{'" + this.before());
        this.index = this.matching(this.index);
        return this.index;
    };

    // --- Classes

    Parser.prototype.classSpecifier = function (specs, context) {
        var keyTok = this.next();
        var key = keyTok.value;
        this.skipAttributes();
        var name = null;
        if (this.startsName() && !this.is('operator')) {
            name = this.parseName({ declarator: true, allowUnknown: true, noTemplate: true });
            if (this.is('<'))
                name.specializationArgs = this.templateArguments();
        }
        var isFinal = false;
        if (this.isIdent() && this.peek().value === 'final' && (this.is('{', 1) || this.is(':', 1))) {
            this.next();
            isFinal = true;
        }
        var defining = this.is('{') || (this.is(':') && !this.is('::'));
        if (!defining) {
            if (name === null)
                this.fail('expected identifier' + this.before());
            specs.elaborated = true;
            return this.elaboratedClass(key, name, context, keyTok);
        }
        var cls = this.beginClass(key, name, keyTok, context);
        cls.final = isFinal;
        specs.defined = cls;
        this.classDefinition(cls);
        return cls;
    };

    // class A; or class A x; - a declaration or a use.
    Parser.prototype.elaboratedClass = function (key, name, context, tok) {
        var found = name.qualifier !== null ? name.entity : null;
        if (found === null && name.qualifier === null) {
            found = X.member(this.scope, name.name) || null;
            if (found === null && !(this.is(';') && context !== 'param')) {
                var outer = this.lookup(name.name);
                if (outer !== null && (outer.isClass || outer.kind === 'typedef'))
                    found = outer;
            }
        }
        if (found !== null && found.kind === 'typedef')
            found = X.unqual(found.type);
        if (found !== null && found.kind === 'template' && found.what === 'class' && name.specializationArgs)
            return this.specialize(found, name.specializationArgs, tok);
        if (found !== null && found.isClass)
            return found;
        if (found !== null && found.kind === 'template')
            return found;
        // A new incomplete class in the innermost namespace or block scope.
        var scope = this.scope;
        if (context === 'param' || !this.is(';'))
            scope = X.enclosingNamespace(scope);
        var cls = new X.ClassType(name.name, key);
        cls.parent = scope;
        cls.library = this.isLibraryToken(tok);
        cls.members[name.name] = cls;
        X.declare(scope, name.name, cls);
        return cls;
    };

    Parser.prototype.beginClass = function (key, name, tok, context) {
        var target = this.instantiating;
        if (target !== undefined && target !== null && target.kind === 'class' && !target.started) {
            target.started = true;
            target.cls.cname = key;
            target.cls.kind = key === 'union' ? 'union' : 'struct';
            if (name !== null)
                target.cls.members[name.name] = target.cls;
            return target.cls;
        }
        var cls;
        if (name === null) {
            cls = new X.ClassType('', key);
            cls.anonymous = true;
            cls.name = '<unnamed ' + key + '>';
            cls.displayName = undefined;
            cls.parent = this.scope;
            cls.library = this.isLibraryToken(tok);
            return cls;
        }
        var scope = name.qualifier !== null ? name.qualifier : this.scope;
        var existing = name.qualifier !== null ? name.entity : (X.member(scope, name.name) || null);
        if (existing !== null && existing.kind === 'typedef' && X.unqual(existing.type).isClass)
            existing = X.unqual(existing.type);
        if (existing !== null && existing.isClass && !existing.complete && !existing.fromSession) {
            cls = existing;
        } else {
            if (existing !== null && existing.isClass && existing.complete && !existing.fromSession &&
                existing.parent === scope)
                this.error(name, "redefinition of '" + key + ' ' + X.qualifiedName(existing) + "'");
            if (existing !== null && !existing.isClass && existing.kind !== 'template' && !existing.fromSession &&
                existing.kind !== 'functions')
                this.error(name, "'" + name.name + "' redeclared as different kind of entity");
            cls = new X.ClassType(name.name, key);
            cls.parent = scope;
            cls.library = this.isLibraryToken(tok);
            X.declare(scope, name.name, cls);
        }
        cls.cname = key;
        cls.kind = key === 'union' ? 'union' : 'struct';
        cls.members[name.name] = cls;
        return cls;
    };

    // The bases and the body of a class; then the class is completed and
    // the bodies of its member functions are parsed.
    Parser.prototype.classDefinition = function (cls) {
        var self = this;
        if (this.accept(':'))
            this.baseClause(cls);
        var open = this.expect('{');
        var savedScope = this.scope;
        var savedAccess = this.access;
        var savedFunc = this.func;
        var savedDefer = this.deferDefaults;
        this.scope = cls;
        this.access = cls.cname === 'class' ? 'private' : 'public';
        this.func = null;
        this.deferDefaults = true;
        var deferred = [];
        cls.deferred = deferred;
        try {
            while (!this.is('}')) {
                if (this.peek().type === 'eof')
                    this.fail("expected '}' at end of input", open);
                this.memberDeclaration(cls);
            }
            this.next();
        } finally {
            this.scope = savedScope;
            this.access = savedAccess;
            this.func = savedFunc;
            this.deferDefaults = savedDefer;
        }
        this.completeClass(cls);
        // Bodies of member functions see the complete class.
        if (this.isClassLazy(cls))
            return;
        deferred.forEach(function (func) {
            if (!func.compiled && func.lazy !== null)
                self.session.compileBody(func);
        });
    };

    Parser.prototype.isClassLazy = function (cls) {
        for (var current = cls; current !== null && current !== undefined &&
             current.isClass; current = current.parent) {
            if (current.library || current.template !== null)
                return true;
        }
        return this.instantiating !== undefined && this.instantiating !== null;
    };

    Parser.prototype.baseClause = function (cls) {
        do {
            this.skipAttributes();
            var access = cls.cname === 'class' ? 'private' : 'public';
            var isVirtual = false;
            for (;;) {
                if (this.is('public') || this.is('private') || this.is('protected'))
                    access = this.next().value;
                else if (this.accept('virtual'))
                    isVirtual = true;
                else
                    break;
            }
            var tok = this.peek();
            var name = this.parseName();
            var baseTypes;
            if (this.accept('...')) {
                baseTypes = this.packItems(name.entity, tok);
            } else {
                if (!X.isTypeEntity(name.entity))
                    this.error(tok, "expected class-name" + this.before(tok));
                baseTypes = [X.unqual(this.entityType(name.entity))];
            }
            var self = this;
            baseTypes.forEach(function (base) {
                if (!base.isClass)
                    self.error(tok, "expected class-name" + self.before(tok));
                if (!base.complete)
                    self.error(tok, "invalid use of incomplete type '" + X.typeString(base) + "'");
                if (base.final)
                    self.error(tok, "cannot derive from 'final' base '" + X.typeString(base) + "' in derived type '" +
                               X.typeString(cls) + "'");
                if (isVirtual)
                    self.error(tok, 'virtual base classes are not supported');
                cls.bases.push({ type: base, access: access, offset: 0, virtual: isVirtual });
            });
        } while (this.accept(','));
    };

    // One member declaration of a class.
    Parser.prototype.memberDeclaration = function (cls) {
        this.skipAttributes();
        var tok = this.peek();
        if (tok.type === 'keyword') {
            switch (tok.value) {
            case 'public':
            case 'private':
            case 'protected':
                this.next();
                this.expect(':');
                this.access = tok.value;
                return;
            case 'using':
                this.usingDeclaration('class');
                return;
            case 'template':
                this.templateDeclaration('class');
                return;
            case 'static_assert':
                this.staticAssertDeclaration();
                return;
            }
        }
        if (this.accept(';'))
            return;
        if (tok.type === 'keyword' && tok.value === 'friend' && (this.is('class', 1) || this.is('struct', 1)) &&
            this.is(';', 3)) {
            this.next();
            this.next();
            this.parseName({ allowUnknown: true });
            this.expect(';');
            return;
        }
        if (tok.type === 'keyword' && tok.value === 'friend' && this.isIdent(1) && this.is(';', 2)) {
            this.next();
            this.next();
            this.next();
            return;
        }
        var specs = this.declSpecifiers('class');
        if (this.accept(';')) {
            // An anonymous union or struct: its members belong to the class.
            if (specs.defined !== null && specs.defined.anonymous)
                this.anonymousMember(cls, specs.defined);
            return;
        }
        var first = true;
        for (;;) {
            var declarator;
            var bitfield = null;
            if (this.is(':') && !this.is('::')) {
                declarator = { name: null, ptrs: [], inner: null, suffixes: [], pack: false, line: this.peek().line,
                               column: this.peek().column, file: this.peek().file };
            } else {
                declarator = this.declarator(false, 'class');
            }
            var name = X.declaratorName(declarator);
            this.skipAttributes();
            var base = specs.type;
            if (base === null && name !== null)
                base = name.destructor !== null || this.isCtorName(name) ? types.void : name.conversion;
            if (base === null)
                this.fail("ISO C++ forbids declaration of '" + (name !== null ? name.name : '') + "' with no type",
                          declarator);
            var type = constexprType(this.declaratorType(declarator, base), specs);
            if (specs.storage === 'typedef') {
                this.declareTypedef(name.name, type, name);
            } else if (type.kind === 'function' && !specs.friend) {
                var func = this.declareFunction('class', specs, declarator, type, name);
                this.virtSpecifiers(func);
                if (first && this.startsFunctionBody()) {
                    this.functionDefinition(func, declarator, 'class');
                    cls.deferred.push(func);
                    this.accept(';');
                    return;
                }
                if (this.accept('=')) {
                    var what = this.next();
                    if (what.type === 'int' && what.value === '0') {
                        if (!func.isVirtual)
                            this.error(what, "initializer specified for non-virtual method '" +
                                       X.functionSignature(func) + "'");
                        func.isPure = true;
                    } else if (what.value === 'delete') {
                        func.deleted = true;
                        func.defined = true;
                    } else if (what.value === 'default') {
                        func.defaulted = true;
                    } else {
                        this.fail('invalid pure specifier (only \'= 0\' is allowed)' + this.before(what), what);
                    }
                }
            } else if (type.kind === 'function') {
                var friend = this.declareFunction('class', specs, declarator, type, name);
                if (first && this.startsFunctionBody()) {
                    this.functionDefinition(friend, declarator, 'class');
                    cls.deferred.push(friend);
                    this.accept(';');
                    return;
                }
            } else if (specs.storage === 'static') {
                this.staticMember(cls, specs, name, type);
            } else {
                if (this.accept(':'))
                    bitfield = this.conditional();
                this.dataMember(cls, specs, name, type, bitfield, declarator);
            }
            first = false;
            if (!this.accept(','))
                break;
        }
        this.expect(';', "';' at end of member declaration");
    };

    // override, final after a member function declarator.
    Parser.prototype.virtSpecifiers = function (func) {
        for (;;) {
            var tok = this.peek();
            if (tok.type === 'ident' && tok.value === 'override') {
                this.next();
                func.override = true;
                continue;
            }
            if (tok.type === 'ident' && tok.value === 'final') {
                this.next();
                func.final = true;
                continue;
            }
            return;
        }
    };

    Parser.prototype.declareMethod = function (cls, specs, declarator, type, name) {
        var params = this.functionParams(declarator);
        var isCtor = this.isCtorName(name) && name.destructor === null;
        var isDtor = name.destructor !== null;
        var key = isCtor ? ' ctor' : (isDtor ? ' dtor' : name.name);
        var func = new X.Function(isCtor ? cls.name : (isDtor ? '~' + cls.name : name.name), type, cls);
        func.params = params;
        func.library = this.isLibraryToken(name) || cls.library;
        this.applySpecifiers(func, specs);
        func.access = this.access;
        func.isCtor = isCtor;
        func.isDtor = isDtor;
        func.isMember = !func.isStatic;
        func.conversion = name.conversion;
        if (this.instantiating && this.instantiating.kind === 'function' && this.instantiating.target === null) {
            this.instantiating.target = func;
            return func;
        }
        var existing = null;
        if (isCtor) {
            cls.ctors.forEach(function (ctor) {
                if (sameParams(ctor.type, type))
                    existing = ctor;
            });
            if (existing !== null)
                this.error(name, "'" + X.functionSignature(func) + "' cannot be overloaded with '" +
                           X.functionSignature(existing) + "'");
            cls.ctors.push(func);
            return func;
        }
        if (isDtor) {
            if (cls.dtor !== null)
                this.error(name, "'" + X.functionSignature(func) + "' cannot be overloaded");
            cls.dtor = func;
            return func;
        }
        var set = cls.members[key];
        if (set !== undefined && set.kind === 'functions') {
            set.items.forEach(function (item) {
                if (item.kind === 'func' && sameParams(item.type, type))
                    existing = item;
            });
        } else if (set !== undefined && set !== cls) {
            this.error(name, "'" + X.functionSignature(func) + "' conflicts with a previous declaration");
        }
        if (existing !== null)
            this.error(name, "'" + X.typeString(type.returns) + ' ' + X.functionSignature(func) +
                       "' cannot be overloaded with '" +
                       X.typeString(existing.type.returns) + ' ' + X.functionSignature(existing) + "'");
        this.checkOperatorDeclaration(func, name, cls);
        X.declare(cls, key, func);
        if (name.conversion !== null)
            cls.conversions.push(func);
        return func;
    };

    Parser.prototype.checkOperatorDeclaration = function (func, name, cls) {
        if (name.op === null)
            return;
        var count = func.type.params.length + (cls !== null && !func.isStatic ? 1 : 0);
        var op = name.op;
        if (op === '()' || op === 'new' || op === 'delete' || op === 'new[]' || op === 'delete[]' ||
            op.indexOf('""') === 0)
            return;
        if (op === '[]' || op === '=' || op === '->') {
            if (cls === null)
                this.error(name, "'" + X.functionSignature(func) + "' must be a non-static member function");
            return;
        }
        var unaryOk = op === '+' || op === '-' || op === '*' || op === '&' || op === '~' || op === '!' || op === '++' ||
            op === '--';
        if (count === 1 && unaryOk)
            return;
        if (count === 2 && op !== '~' && op !== '!')
            return;
        if ((op === '++' || op === '--') && count === 2)
            return;
        if (count === 1)
            this.error(name, "'" + X.functionSignature(func) + "' must have an argument of class or enumerated type");
        this.error(name, "'" + X.functionSignature(func) + "' must have either zero or one argument");
    };

    // void A::f() { ... } - a member defined outside its class.
    Parser.prototype.outOfClassMember = function (name, type, declarator, specs) {
        var cls = name.qualifier;
        var isCtor = name.destructor === null && this.isCtorName(name);
        var candidates;
        if (isCtor)
            candidates = cls.ctors;
        else if (name.destructor !== null)
            candidates = cls.dtor !== null ? [cls.dtor] : [];
        else {
            var set = cls.members[name.name];
            candidates = set !== undefined && set.kind === 'functions' ? set.items : [];
        }
        var found = null;
        candidates.forEach(function (item) {
            if (item.kind === 'func' && sameParams(item.type, type))
                found = item;
        });
        if (found === null) {
            var text = X.typeString(type.returns) + ' ' + X.qualifiedName(cls) + '::' + name.name;
            this.error(name, "no declaration matches '" +
                       (isCtor || name.destructor !== null ? X.qualifiedName(cls) + '::' +
                                                              name.name : text) +
                       '(' + type.params.map(X.typeString).join(', ') + ')' + (type.cv ? ' const' : '') + "'");
        }
        var params = this.functionParams(declarator);
        this.mergeDefaults(found, params);
        return found;
    };

    // A non-static data member.
    Parser.prototype.dataMember = function (cls, specs, name, type, bitfield, declarator) {
        var initTokens = null;
        var start = this.peek();
        if (this.is('=') || this.is('{')) {
            var startIndex = this.index;
            if (this.accept('=')) {
                if (this.is('{'))
                    this.index = this.matching(this.index);
                else
                    this.skipInitializer();
            } else {
                this.index = this.matching(this.index);
            }
            initTokens = this.slice(startIndex, this.index);
        }
        if (X.containsAuto(type))
            this.error(start, "non-static data member declared with placeholder 'auto'");
        if (name !== null && cls.members[name.name] !== undefined && cls.members[name.name] !== cls)
            this.error(name, "redeclaration of '" + name.name + "'");
        if (type.kind === 'array' && type.length === null)
            this.error(declarator, 'flexible array member in a class is not supported');
        if (!X.isRef(type) && !X.isComplete(type) && X.unqual(type) !== cls)
            this.error(declarator, "field '" + (name !== null ? name.name : '') + "' has incomplete type '" +
                       X.typeString(type) + "'");
        if (X.unqual(type) === cls)
            this.error(declarator, "field '" + name.name + "' has incomplete type '" + X.typeString(type) + "'");
        var bits = null;
        if (bitfield !== null) {
            bits = T.big.toFloat(this.constantValue(bitfield, 'bit-field width'));
            if (!X.isIntegralLike(X.unqual(type)) && X.unqual(type).kind !== 'enum')
                this.error(declarator, "bit-field '" + name.name + "' with non-integral type '" + X.typeString(type) +
                           "'");
        }
        var field = { kind: 'field', name: name !== null ? name.name : null, type: type, owner: cls,
                      access: this.access, bits: bits, offset: 0, initTokens: initTokens, initScope: cls,
                      mutable: specs.storage === 'mutable', line: declarator.line, file: declarator.file };
        cls.dataMembers.push(field);
        if (field.name !== null)
            cls.members[field.name] = field;
    };

    // static int count; inline static const int n = 3;
    Parser.prototype.staticMember = function (cls, specs, name, type) {
        var object = this.session.newGlobal(name.name, type, 'global', cls);
        object.member = true;
        object.access = this.access;
        object.isConst = X.isConst(type);
        object.extern = true;
        object.library = this.isLibraryToken(name) || cls.library;
        cls.members[name.name] = object;
        var init = null;
        if (this.is('=') || this.is('{'))
            init = this.initializerSyntax();
        if (init !== null) {
            var self = this;
            if (X.containsAuto(type))
                object.type = type = this.deduceVariable(type, init, name);
            var initIr = this.withStaticContext(false,
                                                function () { return self.initializeVariable(object, init, name); });
            if (initIr !== null && initIr.value !== undefined)
                object.constValue = initIr.value;
            if (specs.inline || specs.constexpr || (object.isConst && initIr !== null && initIr.value !== undefined)) {
                object.extern = false;
                object.pendingInit = this.statementNode('decl', name, { obj: object, init: initIr });
                this.session.staticMemberInit(object);
            }
        }
    };

    // int A::count = 5;
    Parser.prototype.staticMemberDefinition = function (name, type, init, specs) {
        var object = name.entity;
        if (object === null || object.kind !== 'var')
            this.error(name, "'" + name.name + "' is not a static data member of '" + X.typeString(name.qualifier) +
                       "'");
        if (!object.extern && !object.fromSession)
            this.error(name, "redefinition of '" + X.typeString(object.type) + ' ' + X.qualifiedName(name.qualifier) +
                       '::' + name.name + "'");
        X.change(object, 'extern', false);
        if (type.kind === 'array' && object.type.kind === 'array' && object.type.length === null)
            X.change(object, 'type', type);
        var self = this;
        var initIr = this.withScope(name.qualifier, function () {
            return self.withStaticContext(false, function () { return self.initializeVariable(object, init, name); });
        });
        if (initIr !== null && initIr.value !== undefined && object.isConst)
            object.constValue = initIr.value;
        this.session.unitBody().push(this.statementNode('decl', name, { obj: object, init: initIr }));
        return [];
    };

    // The members of an anonymous union become members of the class.
    Parser.prototype.anonymousMember = function (cls, inner) {
        var field = { kind: 'field', name: null, type: inner, owner: cls, access: this.access, bits: null, offset: 0,
                      initTokens: null, anonymous: true };
        cls.dataMembers.push(field);
        inner.dataMembers.forEach(function (member) {
            if (member.name !== null)
                cls.members[member.name] = { kind: 'field', name: member.name, type: member.type, owner: cls,
                                             access: field.access, bits: member.bits, viaAnonymous: field,
                                             inner: member, offset: 0 };
        });
    };

    // using Base::f; using Base::Base;
    Parser.prototype.memberUsing = function (cls, target, tok) {
        var entity = target.entity;
        if (target.qualifier !== null && target.qualifier.isClass && this.isCtorNameOf(target, target.qualifier)) {
            cls.inheritedCtors = target.qualifier;
            return;
        }
        if (entity === null)
            this.error(tok, "'" + target.name + "' has not been declared");
        if (entity.kind === 'functions') {
            var existing = cls.members[target.name];
            var set = { kind: 'functions', name: target.name, items: [] };
            if (existing !== undefined && existing.kind === 'functions')
                set.items = existing.items.slice();
            entity.items.forEach(function (item) {
                var hidden = set.items.some(function (own) {
                    return own.kind === 'func' && item.kind === 'func' && sameParams(own.type, item.type);
                });
                if (!hidden)
                    set.items.push(item);
            });
            cls.members[target.name] = set;
            return;
        }
        cls.members[target.name] = entity;
    };

    Parser.prototype.isCtorNameOf = function (name, cls) {
        var own = cls.template !== null ? cls.template.name : cls.name;
        return name.name === own || name.name === cls.name;
    };

    // --- Enums

    Parser.prototype.enumSpecifier = function (specs, context) {
        var tok = this.next();
        var scoped = false;
        if (this.is('class') || this.is('struct')) {
            this.next();
            scoped = true;
        }
        this.skipAttributes();
        var name = null;
        if (this.isIdent())
            name = this.next();
        var underlying = null;
        if (this.is(':') && !this.is('::')) {
            this.next();
            underlying = X.unqual(this.typeId());
            if (!X.isIntegral(underlying))
                this.error(tok, "underlying type '" + X.typeString(underlying) + "' of '" +
                           (name !== null ? name.value : '<unnamed>') + "' must be an integral type");
        }
        if (!this.is('{')) {
            if (name === null)
                this.fail('expected identifier' + this.before());
            var found = this.lookup(name.value);
            if (found !== null && found.kind === 'enum')
                return found;
            if (underlying === null && !scoped)
                this.error(name, "use of enum '" + name.value + "' without previous declaration");
            var declared = new X.EnumType(name.value, scoped, underlying || types.int);
            declared.parent = this.scope;
            X.declare(this.scope, name.value, declared);
            return declared;
        }
        var type;
        var existing = name !== null ? X.member(this.scope, name.value) : undefined;
        if (existing !== undefined && existing.kind === 'enum' && !existing.complete)
            type = existing;
        else {
            if (existing !== undefined && existing.kind === 'enum' && !existing.fromSession)
                this.error(name, "multiple definition of 'enum " + name.value + "'");
            type = new X.EnumType(name !== null ? name.value : '<unnamed enum>', scoped, underlying);
            type.anonymous = name === null;
            type.parent = this.scope;
            if (name !== null)
                X.declare(this.scope, name.value, type);
        }
        specs.defined = type;
        this.next();
        var next = big.fromFloat(0);
        var values = [];
        var self = this;
        while (!this.is('}')) {
            var itemTok = this.expectIdent();
            this.skipAttributes();
            var value = next;
            if (this.accept('=')) {
                var expr = this.conditional();
                value = this.withScope(type, function () { return self.constantValue(expr, 'enumerator value'); });
            }
            var enumerator = { kind: 'enumerator', name: itemTok.value, type: type, value: value, parent: type };
            if (type.members[itemTok.value] !== undefined)
                this.error(itemTok, "redefinition of '" + itemTok.value + "'");
            type.members[itemTok.value] = enumerator;
            if (!scoped)
                X.declare(this.scope, itemTok.value, enumerator);
            values.push(value);
            next = big.add(value, 1);
            if (!this.accept(','))
                break;
        }
        this.expect('}');
        if (!type.fixed && !scoped)
            type.setUnderlying(enumUnderlying(values));
        type.complete = true;
        return type;
    };

    // The underlying type of an enum without a fixed one: int, or the
    // smallest wider type that holds the values (as g++).
    function enumUnderlying(values) {
        var low = 0, high = 0;
        values.forEach(function (value) {
            var number = big.toFloat(value);
            low = Math.min(low, number);
            high = Math.max(high, number);
        });
        if (low >= -2147483648 && high <= 2147483647)
            return types.int;
        if (low >= 0 && high <= 4294967295)
            return types.uint;
        if (low >= 0 && high > 9223372036854775807)
            return types.ulong;
        return types.long;
    }
})(globalThis);
