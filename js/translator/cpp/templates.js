// C++: templates (continues parser.js). A template keeps its tokens and is
// parsed again for every instance with its parameters bound to the
// arguments (a template scope: T -> typedef, N -> constant, Ts -> typepack):
// every name is then concrete, and the parser needs no rules for dependent
// names. Only the signature of a function template is parsed at once, as a
// pattern with placeholders (X.templateParam), for deduction. An error in
// the signature of an instance makes it not viable (SFINAE); an error in a
// body is an error. See docs/internals/cpp.md.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var X = T.cpp;
    var Parser = X.Parser;
    if (Object.prototype.hasOwnProperty.call(Parser.prototype, 'templateDeclaration'))
        return;

    var types = X.types;
    var big = T.big;
    var unqual = X.unqual;
    var CompileError = T.CompileError;

    // --- Declarations

    Parser.prototype.templateDeclaration = function (context) {
        var headerStart = this.index;
        var tok = this.expect('template');
        this.expect('<');
        var params = [];
        if (!this.isAngleClose()) {
            var scope = this.pushScope('template');
            try {
                for (;;) {
                    params.push(this.templateParameter(params.length, scope));
                    if (!this.accept(','))
                        break;
                }
            } finally {
                this.popScope();
            }
        }
        this.closeAngle();
        if (params.length === 0)
            return this.explicitSpecialization(context, tok);
        // template<class T> template<class U> ... - members of members.
        if (this.is('template'))
            this.error(tok, 'nested template declarations are not supported');
        var start = this.index;
        var outOfClass = this.outOfClassTarget();
        if (outOfClass !== null) {
            this.skipDeclaration();
            this.registerOutOfClass(outOfClass, params, this.slice(start, this.index));
            return;
        }
        if (this.is('using'))
            return this.aliasTemplate(params, tok);
        if ((this.is('class') || this.is('struct') || this.is('union')) && !this.isFunctionTemplateWithClassKey())
            return this.classTemplate(params, tok, context);
        if (this.is('friend')) {
            this.skipDeclaration();
            return;
        }
        if (this.isDeductionGuide())
            return this.deductionGuide(params);
        return this.functionTemplate(params, tok, context, start, headerStart);
    };

    // class T, typename T = int, class... Ts, int N, auto N.
    Parser.prototype.templateParameter = function (index, scope) {
        var tok = this.peek();
        var param = { kind: 'type', name: null, pack: false, defaultTokens: null, index: index, valueType: null,
                      line: tok.line, file: tok.file };
        if (this.is('template'))
            this.error(tok, 'template template parameters are not supported');
        if ((this.is('class') || this.is('typename')) && !(this.isIdent(1) && this.is('::', 2))) {
            this.next();
            if (this.accept('...'))
                param.pack = true;
            if (this.isIdent())
                param.name = this.next().value;
        } else {
            param.kind = 'value';
            // The type may depend on the parameters before it.
            var savedPattern = this.pattern;
            var typeStart = this.index;
            this.pattern = true;
            try {
                var specs = this.typeSpecifiers();
                var declarator = this.declarator(true, 'param');
                param.valueType = this.declaratorType(declarator, specs.type);
            } finally {
                this.pattern = savedPattern;
            }
            // enable_if_t<C, int> = 0: substituted for each instance (SFINAE).
            if (X.isDependent(param.valueType))
                param.typeTokens = this.slice(typeStart, this.index);
            param.pack = declarator.pack;
            var name = X.declaratorName(declarator);
            if (name !== null)
                param.name = name.name;
        }
        if (this.accept('=')) {
            var startIndex = this.index;
            var savedGreater = this.noGreater;
            this.noGreater = 1;
            this.skipTemplateDefault();
            this.noGreater = savedGreater;
            param.defaultTokens = this.slice(startIndex, this.index);
        }
        param.placeholder = X.templateParam(param.name || ('#' + index), index, param.kind);
        param.placeholder.pack = param.pack;
        param.placeholder.valueType = param.valueType;
        if (param.name !== null) {
            if (param.kind === 'type')
                scope.members[param.name] = param.placeholder;
            else
                scope.members[param.name] = { kind: 'tparam', name: param.name, paramKind: 'value',
                                              placeholder: param.placeholder, dependentValue: true,
                                              type: param.valueType };
        }
        return param;
    };

    // The default of a template parameter: up to , or > at depth 0.
    Parser.prototype.skipTemplateDefault = function () {
        var depth = 0, angle = 0;
        for (;;) {
            var tok = this.peek();
            if (tok.type === 'eof')
                return;
            if (tok.type === 'op') {
                var value = tok.value;
                if (value === '(' || value === '[' || value === '{')
                    ++depth;
                else if (value === ')' || value === ']' || value === '}')
                    --depth;
                else if (depth === 0 && value === ',' && angle === 0)
                    return;
                else if (depth === 0 && value === '<')
                    ++angle;
                else if (depth === 0 && value.charAt(0) === '>') {
                    if (angle === 0)
                        return;
                    if (value === '>>' && angle === 1) {
                        this.closeAngle();
                        return;
                    }
                    angle -= value === '>>' ? 2 : 1;
                }
            }
            this.next();
        }
    };

    // Skips one declaration: up to ';' or a body at depth 0.
    Parser.prototype.skipDeclaration = function () {
        for (;;) {
            var tok = this.peek();
            if (tok.type === 'eof')
                this.fail("expected ';' at end of input");
            if (tok.type === 'op' && (tok.value === '(' || tok.value === '[')) {
                this.index = this.matching(this.index);
                continue;
            }
            if (tok.type === 'op' && tok.value === '{') {
                this.index = this.matching(this.index);
                if (this.is(';'))
                    this.next();
                else if (this.is(',') || this.isIdent())
                    continue;
                return;
            }
            this.next();
            if (tok.type === 'op' && tok.value === ';')
                return;
        }
    };

    // template<class T> class X<T>::Y ... is not a class template; a
    // function whose return type is written with 'class' neither.
    Parser.prototype.isFunctionTemplateWithClassKey = function () {
        var offset = 1;
        if (!this.isIdent(offset))
            return false;
        ++offset;
        while (this.is('::', offset) && this.isIdent(offset + 1))
            offset += 2;
        return this.isIdent(offset) || this.is('*', offset) || this.is('&', offset);
    };

    // X<T>::member - the definition of a member of a class template outside
    // the class: { template, member }.
    Parser.prototype.outOfClassTarget = function () {
        if (this.scope.kind !== 'namespace')
            return null;
        for (var offset = 0; offset < 64; ++offset) {
            var tok = this.peek(offset);
            if (tok.type === 'eof' ||
                (tok.type === 'op' && (tok.value === '(' || tok.value === ';' || tok.value === '{' ||
                                                             tok.value === '=')))
                return null;
            if (tok.type !== 'ident' || !this.is('<', offset + 1))
                continue;
            var entity = this.lookup(tok.value);
            if (entity === null || entity.kind !== 'template' || entity.what !== 'class')
                continue;
            // Find the matching '>' and a '::' after it.
            var depth = 0;
            for (var at = offset + 1; at < offset + 200; ++at) {
                var inner = this.peek(at);
                if (inner.type === 'eof')
                    return null;
                if (inner.value === '<')
                    ++depth;
                else if (inner.value === '>')
                    --depth;
                else if (inner.value === '>>')
                    depth -= 2;
                if (depth <= 0) {
                    if (this.is('::', at + 1) && this.declaratorPosition(offset) && this.namesMember(at + 2))
                        return { template: entity, nameOffset: at + 2 };
                    break;
                }
            }
        }
        return null;
    };

    // A<T>::f( or A<T>::x = rather than a type A<T>::type in a return type.
    Parser.prototype.namesMember = function (offset) {
        while (this.isIdent(offset) && this.is('::', offset + 1))
            offset += 2;
        if (this.is('~', offset) || this.is('operator', offset))
            return true;
        if (!this.isIdent(offset))
            return false;
        var after = this.peek(offset + 1);
        return after.type === 'op' && ['(', ';', '=', '{', '['].indexOf(after.value) >= 0;
    };

    // A name at offset can start a declarator: after the return type, not
    // inside an expression (enable_if<!is_array<T>::value, ...>).
    Parser.prototype.declaratorPosition = function (offset) {
        if (offset === 0)
            return true;
        var previous = this.peek(offset - 1);
        if (previous.type === 'keyword')
            return previous.value !== 'typename';
        if (previous.type !== 'op')
            return true;
        return ['*', '&', '&&', '>', '>>', '::'].indexOf(previous.value) >= 0;
    };

    Parser.prototype.registerOutOfClass = function (target, params, tokens) {
        var template = target.template;
        var definition = { params: params, tokens: tokens, library: this.library };
        X.append(template.outOfClass, definition);
        var self = this;
        template.instances.forEach(function (instance) {
            if (instance.complete)
                self.applyOutOfClass(instance, definition);
        });
    };

    // Parses an out-of-class member definition for one instance.
    Parser.prototype.applyOutOfClass = function (instance, definition) {
        var template = instance.template;
        var bindings = this.bindDefinitionParams(definition.params, instance.templateArgs, template);
        if (bindings === null)
            return;
        var scope = new X.Scope('template', template.scope);
        bindings.forEach(function (binding) {
            if (binding.name !== null)
                scope.members[binding.name] = binding.entity;
        });
        var parser = new Parser(this.session, definition.tokens, { scope: scope, library: definition.library });
        parser.deferBodies = true;
        parser.declaration('namespace');
    };

    // The parameters of an out-of-class definition bound to the arguments
    // of an instance (by position).
    Parser.prototype.bindDefinitionParams = function (params, args, template) {
        if (params.length !== template.params.length)
            return null;
        return params.map(function (param, index) {
            return { name: param.name, entity: bindingEntity(param, args[index]) };
        });
    };

    function bindingEntity(param, arg) {
        if (param.pack) {
            var items = arg.kind === 'pack' ? arg.items : [arg];
            if (param.kind === 'type')
                return { kind: 'typepack', name: param.name, items: items.map(function (item) { return item.type; }) };
            return { kind: 'valuepack', name: param.name, items: items };
        }
        if (param.kind === 'type')
            return { kind: 'typedef', name: param.name, type: arg.type };
        return { kind: 'constant', name: param.name, value: arg.value, type: unqual(arg.type || types.int) };
    }
    X.bindingEntity = bindingEntity;

    Parser.prototype.newTemplate = function (what, name, params, tokens) {
        return { kind: 'template', what: what, name: name, params: params, tokens: tokens, scope: this.scope,
                 owner: X.isPersistent(this.scope) ? this.scope : X.enclosingNamespace(this.scope),
                 instances: new Map(), explicit: new Map(), partials: [], outOfClass: [], library: this.library ||
                 this.session.isLibraryFile(tokens[0].file), id: X.newId(), parent: this.scope };
    };

    // template<class T> class X { ... };
    Parser.prototype.classTemplate = function (params, tok, context) {
        var start = this.index;
        this.next();
        this.skipAttributes();
        var nameTok = this.expectIdent();
        var specializationArgs = null;
        if (this.is('<')) {
            // A partial specialization: the arguments are a pattern.
            var scope = this.templateScope(params);
            var savedPattern = this.pattern;
            this.pattern = true;
            var argsStart = this.index;
            try {
                specializationArgs = this.withScope(scope, function () { return this.templateArguments(); });
            } finally {
                this.pattern = savedPattern;
            }
            var argTokens = this.slice(argsStart, this.index);
        }
        if (this.is(';')) {
            this.next();
            if (specializationArgs === null)
                this.declareClassTemplate(nameTok, params, null);
            return;
        }
        // Up to the end of the class.
        while (!this.is('{')) {
            if (this.peek().type === 'eof' || this.is(';'))
                this.fail("expected '{'" + this.before());
            if (this.is('(') || this.is('<'))
                this.next();
            else
                this.next();
        }
        this.index = this.matching(this.index);
        var tokens = this.slice(start, this.index);
        this.expect(';', "';' after class definition");
        if (specializationArgs !== null) {
            var primary = this.lookup(nameTok.value);
            if (primary === null || primary.kind !== 'template')
                this.error(nameTok, "'" + nameTok.value + "' is not a class template");
            X.append(primary.partials, { params: params, args: specializationArgs, argTokens: argTokens, tokens: tokens,
                                         scope: this.scope, library: this.library });
            return;
        }
        var template = this.declareClassTemplate(nameTok, params, tokens);
        return template;
    };

    Parser.prototype.declareClassTemplate = function (nameTok, params, tokens) {
        var existing = X.member(this.scope, nameTok.value);
        if (existing !== undefined && existing.kind === 'template' && existing.what === 'class' &&
            !existing.fromSession) {
            if (tokens !== null) {
                if (existing.tokens !== null)
                    this.error(nameTok, "redefinition of 'template<class> class " + nameTok.value + "'");
                existing.tokens = tokens;
                // Defaults may come with the declaration or the definition.
                params.forEach(function (param, index) {
                    if (param.defaultTokens !== null && existing.params[index])
                        existing.params[index].defaultTokens = param.defaultTokens;
                });
            }
            return existing;
        }
        var template = this.newTemplate('class', nameTok.value, params, tokens || [nameTok]);
        if (tokens === null)
            template.tokens = null;
        template.library = this.library || this.session.isLibraryFile(nameTok.file);
        X.declare(this.scope, nameTok.value, template);
        return template;
    };

    // template<class T> using V = std::vector<T>;
    Parser.prototype.aliasTemplate = function (params, tok) {
        this.next();
        var nameTok = this.expectIdent();
        this.expect('=');
        var typeStart = this.index;
        this.skipDeclaration();
        var template = this.newTemplate('alias', nameTok.value, params, this.slice(typeStart, this.index - 1));
        X.declare(this.scope, nameTok.value, template);
    };

    // template<class T> T f(T x) { ... }: the signature as a pattern, the
    // tokens for instances.
    Parser.prototype.functionTemplate = function (params, tok, context, start, headerStart) {
        var scope = this.templateScope(params);
        var savedScope = this.scope;
        var savedPattern = this.pattern;
        this.scope = scope;
        this.pattern = true;
        var name, type, specs, declarator;
        try {
            specs = this.declSpecifiers(context);
            declarator = this.declarator(false, context);
            name = X.declaratorName(declarator);
            if (name === null)
                this.fail('expected unqualified-id' + this.before());
            var base = specs.type;
            if (base === null)
                base = name.destructor !== null || this.isCtorName(name) ? types.void : name.conversion;
            if (base === null)
                this.error(name, "ISO C++ forbids declaration of '" + name.name + "' with no type");
            type = this.declaratorType(declarator, base);
        } finally {
            this.scope = savedScope;
            this.pattern = savedPattern;
        }
        if (type.kind !== 'function') {
            // A variable template.
            this.skipDeclaration();
            var variable = this.newTemplate('variable', name.name, params, this.slice(start, this.index));
            X.declare(this.scope, name.name, variable);
            return;
        }
        this.virtSpecifiers({});
        var suffix = X.functionSuffixOf(declarator);
        var key = this.signatureKey(headerStart, this.index, suffix);
        var hasBody = this.startsFunctionBody();
        if (hasBody)
            this.skipFunctionBody();
        else
            this.skipDeclaration();
        var tokens = this.slice(start, this.index);
        var template = this.newTemplate('function', name.name, params, tokens);
        template.pattern = type;
        template.hasBody = hasBody;
        template.key = key;
        template.specs = specs;
        template.context = context;
        template.isCtor = name.destructor === null && this.isCtorName(name) && context === 'class';
        template.explicitCtor = specs.explicit;
        template.isMember = context === 'class' && specs.storage !== 'static' && !specs.friend;
        template.isStatic = specs.storage === 'static';
        template.conversion = name.conversion;
        template.access = this.access;
        template.paramInfo = suffix !== null ? suffix.params : [];
        var cls = context === 'class' ? this.currentClass() : null;
        if (cls !== null) {
            template.owner = cls;
            if (template.isCtor) {
                cls.ctorTemplates.push(template);
            } else {
                X.declare(cls, name.name, template);
            }
            this.session.memberTemplateNames[name.name] = true;
            if (name.conversion !== null)
                this.error(name, 'conversion function templates are not supported');
            return;
        }
        if (!this.redeclareTemplate(template, name))
            X.declare(this.scope, name.name, template);
    };

    // A function template declared again: the definition after a
    // declaration, or a definition from an earlier unit, replaces the
    // earlier one; false - a new template. Templates are the same when they
    // are written alike (signatureKey).
    Parser.prototype.redeclareTemplate = function (template, name) {
        var set = X.member(this.scope, name.name);
        if (set === undefined || set.kind !== 'functions')
            return false;
        var previous = set.items.filter(function (item) {
            return item.kind === 'template' && item.key === template.key;
        })[0];
        if (previous === undefined)
            return false;
        if (!template.hasBody && !previous.fromSession)
            return true;
        if (previous.hasBody && !previous.fromSession)
            this.error(name, "redefinition of '" + X.typeString(template.pattern.returns) + ' ' + name.name + "'");
        X.replaceFunction(set, previous, template);
        if (X.transaction !== null)
            X.transaction.declared.push(template);
        if (!previous.fromSession)
            this.defineInstances(previous, template);
        return true;
    };

    // Instances of a declared template made before its definition get
    // their bodies from the definition.
    Parser.prototype.defineInstances = function (declared, template) {
        template.explicit = declared.explicit;
        var self = this;
        declared.instances.forEach(function (func, key) {
            var fresh = self.instantiateFunction(template, func.templateArgs, null, false);
            template.instances.set(key, func);
            X.change(func, 'params', fresh.params);
            X.change(func, 'lazy', fresh.lazy);
            X.change(func, 'defined', true);
            func.template = template;
            self.session.requireBody(func);
        });
    };

    // The text of a template declaration from its header to the body
    // without the names and the default arguments of the function
    // parameters: the same for a declaration and its definition.
    Parser.prototype.signatureKey = function (from, to, suffix) {
        var names = {};
        (suffix !== null ? suffix.params : []).forEach(function (param) {
            var name = X.declaratorName(param.declarator);
            if (name !== null)
                names[name.line + ':' + name.column] = true;
        });
        var parts = [];
        var depth = 0;
        var skipping = false;
        for (var index = from; index < to; ++index) {
            var tok = this.tokens[index];
            var value = tok.value;
            if (depth === 0) {
                if (suffix !== null && tok.line === suffix.line && tok.column === suffix.column &&
                    tok.file === suffix.file)
                    depth = 1;
                parts.push(value);
                continue;
            }
            if (value === '(' || value === '[' || value === '{')
                ++depth;
            else if (value === ')' || value === ']' || value === '}')
                --depth;
            if (depth === 1 && value === '=')
                skipping = true;
            else if (depth <= 1 && (value === ',' || value === ')'))
                skipping = false;
            if (!skipping && names[tok.line + ':' + tok.column] !== true)
                parts.push(value);
        }
        return parts.join(' ');
    };

    // A scope with the parameters of a template as placeholders.
    Parser.prototype.templateScope = function (params) {
        var scope = new X.Scope('template', this.scope);
        params.forEach(function (param) {
            if (param.name === null)
                return;
            if (param.kind === 'type')
                scope.members[param.name] = param.placeholder;
            else
                scope.members[param.name] = { kind: 'tparam', name: param.name, paramKind: 'value',
                                              placeholder: param.placeholder, dependentValue: true,
                                              type: param.valueType };
        });
        return scope;
    };

    // template<> class X<int> { ... }; template<> void f<int>(int) { ... }
    Parser.prototype.explicitSpecialization = function (context, tok) {
        if (this.is('class') || this.is('struct') || this.is('union')) {
            var keyTok = this.next();
            var nameTok = this.expectIdent();
            var template = this.lookup(nameTok.value);
            if (template === null || template.kind !== 'template' || template.what !== 'class')
                this.error(nameTok, "'" + nameTok.value + "' is not a class template");
            var args = this.completeArguments(template, this.templateArguments(), nameTok);
            var key = argumentsKey(args);
            var cls = new X.ClassType(template.name, keyTok.value);
            cls.parent = template.scope;
            cls.template = template;
            cls.templateArgs = args;
            cls.name = template.name + X.templateArgsText(args);
            cls.tag = cls.name;
            cls.library = this.library || this.session.isLibraryFile(nameTok.file);
            cls.members[template.name] = cls;
            setExplicit(template, key, cls);
            if (this.accept(';'))
                return;
            this.classDefinition(cls);
            this.expect(';', "';' after class definition");
            return;
        }
        // A function: parsed as a declaration whose name has arguments.
        var start = this.index;
        var specsF = this.declSpecifiers(context);
        var declarator = this.declarator(false, context);
        var name = X.declaratorName(declarator);
        var target = name !== null ? name.entity : null;
        if (target !== null && target.kind === 'functions')
            target = target.items.filter(function (item) { return item.kind === 'template'; })[0] || null;
        if (target === null || target === undefined || target.kind !== 'template')
            this.error(tok, "'" + (name !== null ? name.name : '') + "' is not a template function");
        var type = this.declaratorType(declarator, specsF.type);
        if (this.startsFunctionBody())
            this.skipFunctionBody();
        else
            this.skipDeclaration();
        var deducedArgs = name.args !== null ? this.completeArguments(target, name.args, tok)
                                             : this.deduceFromType(target, type);
        if (deducedArgs === null)
            this.error(tok, "template-id '" + name.name + "' for '" + X.typeString(type) +
                       "' does not match any template declaration");
        setExplicit(target, argumentsKey(deducedArgs), { tokens: this.slice(start, this.index), scope: this.scope,
                                                         library: this.library });
    };

    function setExplicit(template, key, value) {
        var had = template.explicit.has(key);
        var old = template.explicit.get(key);
        template.explicit.set(key, value);
        if (X.transaction !== null)
            X.transaction.onRollback(function () {
                if (had)
                    template.explicit.set(key, old);
                else
                    template.explicit.delete(key);
            });
    }

    // --- Arguments

    function argumentsKey(args) {
        return args.map(function (arg) {
            if (arg.kind === 'type')
                return 't' + X.typeId(arg.type);
            if (arg.kind === 'pack')
                return 'p(' + argumentsKey(arg.items) + ')';
            if (arg.kind === 'value')
                return 'v' + (typeof arg.value === 'number' ? arg.value : big.str(arg.value));
            return 'e';
        }).join(',');
    }
    X.argumentsKey = argumentsKey;

    function isDependentArgument(arg) {
        if (arg.kind === 'expr')
            return true;
        if (arg.kind === 'type')
            return X.isDependent(arg.type) || containsPackRef(arg.type);
        if (arg.kind === 'pack')
            return arg.items.some(isDependentArgument);
        return false;
    }

    function containsPackRef(type) {
        if (type === null || type === undefined)
            return false;
        switch (type.kind) {
        case 'packref':
            return true;
        case 'pointer':
        case 'lref':
        case 'rref':
            return containsPackRef(type.to);
        case 'array':
            return containsPackRef(type.of);
        case 'function':
            return containsPackRef(type.returns) || type.params.some(containsPackRef);
        case 'tspec':
            return type.args.some(function (arg) { return arg.kind === 'type' && containsPackRef(arg.type); });
        }
        if (type.unqualified)
            return containsPackRef(type.unqualified);
        return false;
    }
    X.containsPackRef = containsPackRef;

    // The arguments of a template-id with defaults and packs: one argument
    // per parameter (a pack parameter gets { kind: 'pack', items }).
    Parser.prototype.completeArguments = function (template, args, tok) {
        var result = [];
        var params = template.params;
        var position = 0;
        var self = this;
        for (var index = 0; index < params.length; ++index) {
            var param = params[index];
            if (param.pack) {
                var items = args.slice(position);
                position = args.length;
                result.push({ kind: 'pack',
                              items: items.map(function (item) { return self.checkArgumentKind(param, item, tok); }) });
                continue;
            }
            if (position < args.length) {
                result.push(this.checkArgumentKind(param, args[position++], tok));
                continue;
            }
            if (param.defaultTokens === null)
                return null;
            result.push(this.defaultTemplateArgument(template, param, result, tok));
        }
        if (position < args.length)
            this.error(tok, 'wrong number of template arguments (' + args.length + ', should be ' + params.length +
                       ')');
        return result;
    };

    Parser.prototype.checkArgumentKind = function (param, arg, tok) {
        if (param.kind === 'type') {
            if (arg.kind !== 'type')
                this.error(tok, 'type/value mismatch at argument ' + (param.index + 1) +
                           ' in template parameter list; expected a type');
            return arg;
        }
        if (arg.kind === 'type')
            this.error(tok, 'type/value mismatch at argument ' + (param.index + 1) +
                       ' in template parameter list; expected a constant');
        if (arg.kind === 'value' && param.valueType !== null && !X.isDependent(param.valueType) &&
            param.valueType !== X.AUTO && arg.node === undefined) {
            var to = unqual(param.valueType);
            var value = X.wrapValue(arg.value, to);
            var text = X.isBool(to) ? (big.sign(value) !== 0 ? 'true' : 'false') : big.str(value);
            if (to.kind === 'int' && to.size === 1 && !X.isBool(to))
                text = "'" + String.fromCharCode(big.toFloat(value)) + "'";
            return { kind: 'value', value: value, type: to, text: X.isIntegral(to) && !X.isBool(to) && to.size !== 1 &&
                     to !== types.int ? text + (to.signed ? (to.size === 8 ? '' : '') : 'u') : text };
        }
        return arg;
    };

    // A default argument parsed with the earlier parameters bound.
    Parser.prototype.defaultTemplateArgument = function (template, param, earlier, tok) {
        var scope = new X.Scope('template', template.scope);
        template.params.forEach(function (other, index) {
            if (index < earlier.length && other.name !== null)
                scope.members[other.name] = bindingEntity(other, earlier[index]);
        });
        var parser = new Parser(this.session, param.defaultTokens, { scope: scope, library: template.library });
        parser.pattern = this.pattern && earlier.some(isDependentArgument);
        var result;
        if (param.kind === 'type')
            result = { kind: 'type', type: parser.typeId() };
        else
            result = this.checkArgumentKind(param, parser.constantArgument(parser.conditional()), tok);
        return result;
    };

    // X<args>: a class template instance, an alias, or a dependent type in
    // a pattern.
    Parser.prototype.specialize = function (template, args, tok) {
        if (template.what === 'function')
            return null;
        var dependent = args.some(isDependentArgument);
        // index_sequence<I...> in a pattern is integer_sequence<size_t, I...>.
        if (dependent && this.pattern && template.what === 'alias')
            return this.aliasInstance(template, args, true);
        if (dependent && (this.pattern || args.some(function (arg) {
            return arg.kind === 'type' && containsPackRef(arg.type);
        })))
            return X.dependentSpecialization(template, args);
        var complete = this.completeArguments(template, args, tok);
        if (complete === null)
            this.error(tok, 'wrong number of template arguments (' + args.length + ', should be ' +
                       template.params.length + ')');
        if (template.what === 'alias')
            return this.aliasInstance(template, complete);
        if (template.what === 'variable')
            return this.variableInstance(template, complete, tok);
        return this.instantiateClass(template, complete, tok);
    };

    // pattern: the arguments name parameters of an enclosing template, which
    // the alias parameters stand for.
    Parser.prototype.aliasInstance = function (template, args, pattern) {
        var scope = new X.Scope('template', template.scope);
        template.params.forEach(function (param, index) {
            if (param.name === null)
                return;
            var arg = args[index];
            if (pattern && arg !== undefined && arg.kind === 'expr' && arg.node.k === 'name' && arg.node.entity)
                scope.members[param.name] = arg.node.entity;
            else if (pattern && arg !== undefined && arg.kind === 'expr')
                scope.members[param.name] = { kind: 'tparam', name: param.name, paramKind: 'value',
                                              placeholder: param.placeholder, dependentValue: true,
                                              type: param.valueType };
            else if (pattern && param.pack && arg !== undefined && arg.kind === 'type' && arg.type.kind === 'packexp')
                scope.members[param.name] = arg.type.pattern;
            else
                scope.members[param.name] = bindingEntity(param, arg);
        });
        var parser = new Parser(this.session, template.tokens, { scope: scope, library: template.library });
        parser.pattern = !!pattern;
        return { kind: 'typedef', name: template.name, type: parser.typeId() };
    };

    // A variable template for arguments: a namespace variable.
    Parser.prototype.variableInstance = function (template, args, tok) {
        var key = argumentsKey(args);
        var cached = template.instances.get(key);
        if (cached !== undefined)
            return cached;
        var scope = new X.Scope('template', template.scope);
        template.params.forEach(function (param, index) {
            if (param.name !== null)
                scope.members[param.name] = bindingEntity(param, args[index]);
        });
        var parser = new Parser(this.session, template.tokens, { scope: scope, library: template.library });
        parser.instantiating = { kind: 'variable', target: null, name: template.name + X.templateArgsText(args) };
        parser.declaration('namespace');
        var object = parser.instantiating.target;
        if (object === null)
            this.error(tok, "cannot instantiate '" + template.name + "'");
        template.instances.set(key, object);
        if (X.transaction !== null)
            X.transaction.onRollback(function () { template.instances.delete(key); });
        return object;
    };

    // --- Class instances

    Parser.prototype.instantiateClass = function (template, args, tok) {
        var key = argumentsKey(args);
        var explicit = template.explicit.get(key);
        if (explicit !== undefined)
            return explicit;
        var existing = template.instances.get(key);
        if (existing !== undefined)
            return existing;
        var self = this;
        if (template.tokens === null && !template.partials.some(function (partial) {
            return self.matchPartial(partial, args) !== null;
        })) {
            // Declared, not defined: an incomplete class.
            var incomplete = new X.ClassType(template.name + X.templateArgsText(args), 'class');
            incomplete.parent = template.scope;
            incomplete.template = template;
            incomplete.templateArgs = args;
            return incomplete;
        }
        var cls = new X.ClassType(template.name + X.templateArgsText(args), 'class');
        cls.tag = cls.name;
        cls.template = template;
        cls.templateArgs = args;
        cls.library = template.library;
        var source = this.chooseSpecialization(template, args);
        var scope = new X.Scope('template', source.scope);
        source.bindings.forEach(function (binding) {
            if (binding.name !== null)
                scope.members[binding.name] = binding.entity;
        });
        cls.parent = scope;
        template.instances.set(key, cls);
        if (X.transaction !== null)
            X.transaction.onRollback(function () { template.instances.delete(key); });
        var depth = this.session.instantiationDepth;
        if (depth > 64)
            this.error(tok, 'template instantiation depth exceeds maximum of 64');
        this.session.instantiationDepth = depth + 1;
        try {
            var parser = new Parser(this.session, source.tokens, { scope: scope, library: template.library });
            parser.instantiating = { kind: 'class', cls: cls, started: false };
            parser.access = 'public';
            var specs = { storage: null, defined: null, type: null };
            parser.classSpecifier(specs, 'namespace');
        } catch (error) {
            template.instances.delete(key);
            if (error instanceof CompileError && error.line === 0 && tok)
                error.line = tok.line;
            throw this.instantiationError(error, cls, tok);
        } finally {
            this.session.instantiationDepth = depth;
        }
        template.outOfClass.forEach(function (definition) { self.applyOutOfClass(cls, definition); });
        return cls;
    };

    // An error inside an instance of the library is reported at the use.
    Parser.prototype.instantiationError = function (error, cls, tok) {
        if (!(error instanceof CompileError) || tok === null || tok === undefined)
            return error;
        if (this.session.isLibraryFile(error.source) && !this.isLibraryToken(tok)) {
            var located = new CompileError(error.message + " (in an instance of '" + X.typeString(cls) + "')", tok.line,
                                           tok.column, tok.file || '');
            return located;
        }
        return error;
    };

    // The primary template or the most specialized matching partial
    // specialization: { tokens, scope, bindings }.
    Parser.prototype.chooseSpecialization = function (template, args) {
        var self = this;
        var matches = [];
        template.partials.forEach(function (partial) {
            var bindings = self.matchPartial(partial, args);
            if (bindings !== null)
                matches.push({ partial: partial, bindings: bindings });
        });
        if (matches.length > 0) {
            var best = matches[0];
            for (var index = 1; index < matches.length; ++index) {
                if (this.partialMoreSpecialized(matches[index].partial, best.partial))
                    best = matches[index];
            }
            return { tokens: best.partial.tokens, scope: best.partial.scope, bindings: best.bindings };
        }
        return { tokens: template.tokens, scope: template.scope,
                 bindings: template.params.map(function (param, index) {
                     return { name: param.name, entity: bindingEntity(param, args[index]) };
                 }) };
    };

    // The bindings of a partial specialization that matches the arguments.
    Parser.prototype.matchPartial = function (partial, args) {
        var map = new Map();
        partial.params.forEach(function (param) { map.set(param.placeholder, undefined); });
        var patternArgs = partial.args;
        var flat = flattenArgs(args);
        if (!this.unifyArgumentLists(patternArgs, flat, map))
            return null;
        var bindings = [];
        var ok = true;
        partial.params.forEach(function (param) {
            var bound = map.get(param.placeholder);
            if (bound === undefined) {
                if (param.pack)
                    bound = { kind: 'pack', items: [] };
                else
                    ok = false;
            }
            if (ok)
                bindings.push({ name: param.name, entity: bindingEntity(param, bound) });
        });
        if (!ok)
            return null;
        // What deduction skips (void_t<decltype(...)>) is substituted: a
        // failure or another type means no match (SFINAE).
        var dependent = patternArgs.some(function (arg) { return arg.kind === 'type' && hasDependent(arg.type); });
        if (partial.argTokens && dependent) {
            var scope = new X.Scope('template', partial.scope);
            bindings.forEach(function (binding) {
                if (binding.name !== null)
                    scope.members[binding.name] = binding.entity;
            });
            var substituted;
            try {
                substituted = new Parser(this.session, partial.argTokens, { scope: scope, library: partial.library })
                    .templateArguments();
            } catch (error) {
                if (error instanceof CompileError)
                    return null;
                throw error;
            }
            if (argumentsKey(flattenArgs(substituted)) !== argumentsKey(flat))
                return null;
        }
        return bindings;
    };

    function hasDependent(type) {
        if (type === null || type === undefined)
            return false;
        if (type.unqualified !== undefined)
            return hasDependent(type.unqualified);
        switch (type.kind) {
        case 'dependent':
            return true;
        case 'pointer':
        case 'lref':
        case 'rref':
            return hasDependent(type.to);
        case 'array':
            return hasDependent(type.of);
        case 'function':
            return hasDependent(type.returns) || type.params.some(hasDependent);
        case 'tspec':
            return type.args.some(function (arg) { return arg.kind === 'type' && hasDependent(arg.type); });
        }
        return false;
    }

    // vector<T> as a pattern names vector<T, allocator<T>>: the arguments
    // of an instance that the pattern leaves to defaults are not compared.
    function withoutDefaults(pattern, args) {
        var count = pattern.args.length;
        var params = pattern.template.params;
        var packs = pattern.args.some(function (arg) {
            return arg.kind === 'type' && arg.type.kind === 'packexp' || arg.pack;
        });
        if (packs || count >= args.length || params[count] === undefined || params[count].defaultTokens === null)
            return args;
        return args.slice(0, count);
    }

    function flattenArgs(args) {
        var result = [];
        args.forEach(function (arg) {
            if (arg.kind === 'pack')
                result = result.concat(arg.items);
            else
                result.push(arg);
        });
        return result;
    }

    Parser.prototype.partialMoreSpecialized = function (left, right) {
        // left is more specialized if right's pattern matches left's arguments.
        var map = new Map();
        right.params.forEach(function (param) { map.set(param.placeholder, undefined); });
        var forward = this.unifyArgumentLists(right.args, left.args, map);
        var backMap = new Map();
        left.params.forEach(function (param) { backMap.set(param.placeholder, undefined); });
        var backward = this.unifyArgumentLists(left.args, right.args, backMap);
        return forward && !backward;
    };

    // --- Class template argument deduction
    //
    // std::pair p(1, 2.5): the type is a placeholder of the template
    // (X.deducedClass) until the initializer gives the arguments. The
    // candidates are the deduction guides of the template (declared ones,
    // then the ones its constructors imply); each is a function template whose
    // parameters are those of the class (and of a constructor template).

    X.deducedClass = function (template) {
        if (template.deducedPlaceholder === undefined)
            template.deducedPlaceholder = { kind: 'auto', name: template.name, ctad: template, size: 0, align: 1,
                                            id: X.newId() };
        return template.deducedPlaceholder;
    };

    // pair(T1, T2) -> pair<T1, T2>; after the name of a class template.
    Parser.prototype.isDeductionGuide = function () {
        var offset = this.is('explicit') ? 1 : 0;
        if (!this.isIdent(offset) || !this.is('(', offset + 1))
            return false;
        var entity = this.lookup(this.peek(offset).value);
        if (entity === null || entity.kind !== 'template' || entity.what !== 'class')
            return false;
        var after = this.matching(this.index + offset + 1);
        return this.tokens[after] !== undefined && this.tokens[after].value === '->';
    };

    Parser.prototype.deductionGuide = function (params) {
        var scope = this.templateScope(params);
        this.accept('explicit');
        var nameTok = this.expectIdent();
        var classTemplate = this.lookup(nameTok.value);
        // The parameters alone: the parser of a suffix would take '->' too.
        var after = this.matching(this.index);
        var parser = new Parser(this.session, sliceTokens(this.tokens, this.index, after),
                                { scope: scope, library: this.library });
        parser.pattern = params.length > 0;
        parser.deferDefaults = true;
        var suffix = parser.functionSuffix();
        this.index = after;
        this.expect('->');
        var typeStart = this.index;
        this.skipDeclaration();
        var guide = this.newTemplate('function', nameTok.value, params, this.slice(typeStart, this.index - 1));
        guide.pattern = X.functionType(types.void, suffix.params.map(function (param) {
            return X.parameterType(param.type);
        }), suffix.variadic, 0, null, false);
        guide.paramInfo = suffix.params;
        guide.initializerList = isInitializerListGuide(guide);
        if (classTemplate.guides === undefined)
            classTemplate.guides = [];
        X.append(classTemplate.guides, guide);
    };

    function isInitializerListGuide(guide) {
        var first = guide.pattern.params[0];
        if (first === undefined)
            return false;
        var plain = unqual(X.removeRef(first));
        return plain.kind === 'tspec' && plain.template.name === 'initializer_list';
    }

    // The guides that the constructors of a class template imply: their
    // parameter lists parsed as patterns over the parameters of the class.
    // A constructor whose parameters do not parse so is no guide.
    Parser.prototype.implicitGuides = function (template) {
        if (template.implicitGuides !== undefined)
            return template.implicitGuides;
        var guides = [];
        template.implicitGuides = guides;
        var tokens = template.tokens;
        if (tokens === null)
            return guides;
        var open = 0;
        while (open < tokens.length && tokens[open].value !== '{')
            ++open;
        // Member typedefs name types of the parameters: typedef T value_type.
        var scope = this.templateScope(template.params);
        scope.parent = template.scope;
        var depth = 0;
        var start = open + 1;
        for (var index = open; index < tokens.length; ++index) {
            var tok = tokens[index];
            if (tok.value === '{' || tok.value === '(' || tok.value === '[') {
                if (depth === 1 && tok.value === '(' && index > start && tokens[index - 1].value === template.name &&
                    (index - 2 < 0 || tokens[index - 2].value !== '~')) {
                    var guide = this.constructorGuide(template, scope, tokens, start, this.matchingIn(tokens, index));
                    if (guide !== null)
                        guides.push(guide);
                }
                ++depth;
                continue;
            }
            if (tok.value === '}' || tok.value === ')' || tok.value === ']') {
                --depth;
                if (depth === 1 && tok.value === '}' && !(tokens[index + 1] && tokens[index + 1].value === ';'))
                    start = index + 1;
                if (depth === 0)
                    break;
                continue;
            }
            if (depth !== 1)
                continue;
            if (tok.value === ';') {
                this.memberTypedef(template, scope, tokens, start, index);
                start = index + 1;
            } else if (tok.value === ':' && (tokens[index - 1].value === 'public' ||
                                             tokens[index - 1].value === 'private' ||
                                             tokens[index - 1].value === 'protected')) {
                start = index + 1;
            }
        }
        return guides;
    };

    // The index of the bracket that closes the one at index.
    Parser.prototype.matchingIn = function (tokens, index) {
        var depth = 0;
        for (var at = index; at < tokens.length; ++at) {
            var value = tokens[at].value;
            if (value === '(' || value === '[' || value === '{')
                ++depth;
            else if ((value === ')' || value === ']' || value === '}') && --depth === 0)
                return at;
        }
        return tokens.length - 1;
    };

    function sliceTokens(tokens, start, end) {
        var list = tokens.slice(start, end);
        var last = list.length > 0 ? list[list.length - 1] : tokens[start];
        list.push({ type: 'eof', value: '', text: '', line: last.line, column: last.column + 1, file: last.file });
        return list;
    }

    // typedef T value_type; using size_type = size_t;
    Parser.prototype.memberTypedef = function (template, scope, tokens, start, end) {
        var first = tokens[start];
        if (first === undefined || (first.value !== 'typedef' && first.value !== 'using'))
            return;
        var parser = new Parser(this.session, sliceTokens(tokens, start, end + 1),
                                { scope: scope, library: template.library });
        parser.pattern = true;
        try {
            if (parser.accept('using')) {
                var name = parser.expectIdent().value;
                if (!parser.accept('='))
                    return;
                scope.members[name] = { kind: 'typedef', name: name, type: parser.typeId() };
                return;
            }
            parser.next();
            var specs = parser.declSpecifiers('type');
            var declarator = parser.declarator(false, 'block');
            var declared = X.declaratorName(declarator);
            if (declared !== null)
                scope.members[declared.name] = { kind: 'typedef', name: declared.name,
                                                 type: parser.declaratorType(declarator, specs.type) };
        } catch (error) {
            if (!(error instanceof CompileError))
                throw error;
        }
    };

    // A guide from the constructor whose declaration starts at start and
    // whose parameters close at close.
    Parser.prototype.constructorGuide = function (template, scope, tokens, start, close) {
        var parser = new Parser(this.session, sliceTokens(tokens, start, close + 1),
                                { scope: new X.Scope('template', scope), library: template.library });
        parser.pattern = true;
        parser.deferDefaults = true;
        var params = template.params;
        try {
            if (parser.is('template')) {
                parser.next();
                parser.expect('<');
                var own = [];
                for (;;) {
                    own.push(parser.templateParameter(params.length + own.length, parser.scope));
                    if (!parser.accept(','))
                        break;
                }
                parser.closeAngle();
                params = params.concat(own);
            }
            while (parser.accept('explicit') || parser.accept('constexpr') || parser.accept('inline'))
                continue;
            if (!parser.isIdent() || parser.next().value !== template.name)
                return null;
            var suffix = parser.functionSuffix();
        } catch (error) {
            if (error instanceof CompileError)
                return null;
            throw error;
        }
        var guide = this.newTemplate('function', template.name, params, sliceTokens(tokens, start, close + 1));
        guide.scope = template.scope;
        guide.pattern = X.functionType(types.void, suffix.params.map(function (param) {
            return X.parameterType(param.type);
        }), suffix.variadic, 0, null, false);
        guide.paramInfo = suffix.params;
        guide.implicitFor = template;
        guide.initializerList = isInitializerListGuide(guide);
        return guide;
    };

    // The class that the initializer of a declaration with a placeholder
    // of a class template gives: init is the syntax of the initializer
    // (copy, direct, braced); its expressions are checked here once.
    Parser.prototype.deduceClassTemplate = function (template, init, node) {
        var self = this;
        function failed(args) {
            self.error(node, "class template argument deduction failed: no matching function for call to '" +
                       template.name + '(' + self.argumentText(args) + ")'");
        }
        if (init === null)
            failed([]);
        function checked(syntax) {
            return syntax.k === 'braced' ? syntax : self.check(syntax);
        }
        function wrap(ir, syntax) {
            return ir.k === 'braced' ? ir : { k: 'checked', ir: ir, line: syntax.line, column: syntax.column,
                                              file: syntax.file };
        }
        var args;
        var braced = init.k === 'braced';
        if (init.k === 'copy') {
            args = [checked(init.expr)];
            init.expr = wrap(args[0], init.expr);
        } else {
            var list = braced ? init.items : init.args;
            args = list.map(checked);
            for (var index = 0; index < list.length; ++index)
                list[index] = wrap(args[index], list[index]);
        }
        // T x(a) and T x{a} with a of an instance of T: a copy.
        if (args.length === 1 && args[0].k !== 'braced') {
            var only = unqual(args[0].type);
            if (only.isClass && only.template === template)
                return only;
        }
        var guides = (template.guides || []).concat(this.implicitGuides(template));
        var found = null;
        if (braced) {
            // List-initialization tries the initializer-list constructors
            // with the whole list first.
            var whole = [{ k: 'braced', items: args, checkedItems: true, line: node.line, file: node.file }];
            found = this.firstGuide(template, guides.filter(function (guide) { return guide.initializerList; }),
                                    whole, node);
        }
        if (found === null)
            found = this.firstGuide(template, guides, args, node);
        if (found === null)
            failed(args);
        return found;
    };

    // The class of the best guide: a guide that is not a template wins, as
    // in overload resolution; then the guides in their order (declared ones
    // before the ones of constructors).
    Parser.prototype.firstGuide = function (template, guides, args, node) {
        var found = null;
        for (var index = 0; index < guides.length; ++index) {
            var guide = guides[index];
            if (!guideTakes(guide, args.length) || !this.guideConverts(guide, args))
                continue;
            try {
                var deduced = this.deduceCall(guide, args, null, node);
                if (deduced === null)
                    continue;
                var type = this.guideResult(template, guide, deduced, node);
                if (type === null)
                    continue;
                if (guide.params.length === 0)
                    return type;
                if (found === null)
                    found = type;
            } catch (error) {
                if (!(error instanceof CompileError))
                    throw error;
            }
        }
        return found;
    };

    // The arguments of the parameters that name no template parameter
    // convert to them.
    Parser.prototype.guideConverts = function (guide, args) {
        var map = new Map();
        guide.params.forEach(function (param) { map.set(param.placeholder, undefined); });
        var params = guide.pattern.params;
        for (var index = 0; index < params.length && index < args.length; ++index) {
            if (guide.paramInfo[index].pack)
                return true;
            if (mentions(params[index], map))
                continue;
            try {
                if (this.conversion(params[index], args[index], {}) === null)
                    return false;
            } catch (error) {
                if (!(error instanceof CompileError))
                    throw error;
                return false;
            }
        }
        return true;
    };

    function guideTakes(guide, count) {
        var required = 0, pack = false;
        guide.paramInfo.forEach(function (param) {
            if (param.pack)
                pack = true;
            else if (param.defaultArg === null && param.defaultTokens === null)
                ++required;
        });
        return count >= required && (pack || count <= guide.paramInfo.length);
    }

    // The class of a guide for the deduced arguments of its parameters.
    Parser.prototype.guideResult = function (template, guide, deduced, node) {
        if (guide.implicitFor !== undefined) {
            var args = [];
            template.params.forEach(function (param, index) {
                args = args.concat(param.pack ? deduced[index].items : [deduced[index]]);
            });
            return this.specialize(template, args, node);
        }
        var scope = new X.Scope('template', guide.scope);
        guide.params.forEach(function (param, index) {
            if (param.name !== null)
                scope.members[param.name] = bindingEntity(param, deduced[index]);
        });
        var type = unqual(new Parser(this.session, guide.tokens, { scope: scope, library: guide.library }).typeId());
        return type.isClass && type.template === template ? type : null;
    };

    // --- Deduction
    //
    // map: placeholder -> bound argument ({ kind: 'type', type } or a value).

    Parser.prototype.unifyArgumentLists = function (patterns, args, map) {
        var position = 0;
        for (var index = 0; index < patterns.length; ++index) {
            var pattern = patterns[index];
            if (pattern.kind === 'type' && pattern.type.kind === 'packexp' || isPackPattern(pattern, map)) {
                // A pack takes the rest.
                var packParam = packPlaceholderOf(pattern, map);
                var rest = args.slice(position);
                position = args.length;
                if (packParam === null)
                    return false;
                var items = [];
                for (var restIndex = 0; restIndex < rest.length; ++restIndex) {
                    var inner = new Map(map);
                    inner.set(packParam, undefined);
                    var element = pattern.kind === 'type' && pattern.type.kind === 'packexp' ? pattern.type.pattern
                                                                                            : pattern.type;
                    if (!this.unifyArgument({ kind: pattern.kind, type: element, node: pattern.node }, rest[restIndex],
                                            inner))
                        return false;
                    items.push(inner.get(packParam));
                }
                map.set(packParam, { kind: 'pack', items: items });
                continue;
            }
            if (position >= args.length)
                return false;
            if (!this.unifyArgument(pattern, args[position++], map))
                return false;
        }
        return position === args.length;
    };

    function isPackPattern(pattern, map) {
        if (pattern.kind === 'type' && pattern.type.kind === 'tparam' && pattern.type.pack && map.has(pattern.type))
            return true;
        var entity = pattern.kind === 'expr' && pattern.node.k === 'name' ? pattern.node.entity : null;
        if (entity && entity.placeholder && entity.placeholder.pack && map.has(entity.placeholder))
            return true;
        return false;
    }

    function packPlaceholderOf(pattern, map) {
        if (pattern.kind === 'type') {
            var found = null;
            (function walk(type) {
                if (found !== null || type === null || type === undefined)
                    return;
                if (type.kind === 'tparam' && type.pack && map.has(type))
                    found = type;
                else if (type.kind === 'packexp')
                    walk(type.pattern);
                else if (type.to !== undefined)
                    walk(type.to);
                else if (type.unqualified !== undefined)
                    walk(type.unqualified);
                else if (type.kind === 'tspec')
                    type.args.forEach(function (arg) { if (arg.kind === 'type') walk(arg.type); });
            })(pattern.type);
            return found;
        }
        if (pattern.kind === 'expr' && pattern.node.entity && pattern.node.entity.placeholder)
            return pattern.node.entity.placeholder;
        return null;
    }

    Parser.prototype.unifyArgument = function (pattern, arg, map) {
        if (pattern.kind === 'type') {
            if (arg.kind !== 'type')
                return false;
            return this.unify(pattern.type, arg.type, map);
        }
        if (pattern.kind === 'expr') {
            var node = pattern.node;
            if (node.k === 'name' && node.entity && node.entity.placeholder && map.has(node.entity.placeholder)) {
                if (arg.kind !== 'value')
                    return false;
                var bound = map.get(node.entity.placeholder);
                if (bound !== undefined)
                    return bound.kind === 'value' && big.cmp(bound.value, arg.value) === 0;
                map.set(node.entity.placeholder, arg);
                return true;
            }
            return false;
        }
        if (pattern.kind === 'value')
            return arg.kind === 'value' && big.cmp(pattern.value, arg.value) === 0;
        return false;
    };

    // Deduces the placeholders of pattern P from a type A.
    Parser.prototype.unify = function (pattern, actual, map) {
        if (pattern === actual)
            return true;
        if (pattern.kind === 'tparam' && map.has(pattern) && !pattern.unqualified) {
            var bound = map.get(pattern);
            if (bound !== undefined)
                return bound.kind === 'type' && X.sameType(bound.type, actual);
            map.set(pattern, { kind: 'type', type: actual });
            return true;
        }
        var patternCv = pattern.cv || 0;
        if (pattern.unqualified !== undefined && pattern.unqualified.kind === 'tparam' &&
            map.has(pattern.unqualified)) {
            // const T against const int: T = int.
            var actualCv = X.cvOf(actual);
            if ((actualCv & patternCv) !== patternCv)
                return false;
            if (actual.kind === 'lref' || actual.kind === 'rref' || actual.kind === 'function')
                return false;
            return this.unify(pattern.unqualified, X.withCv(actual, actualCv & ~patternCv), map);
        }
        if ((pattern.cv || 0) !== (actual.cv || 0) && pattern.kind !== 'array')
            return false;
        var plainPattern = unqual(pattern), plainActual = unqual(actual);
        switch (plainPattern.kind) {
        case 'pointer':
        case 'lref':
        case 'rref':
            return plainActual.kind === plainPattern.kind && this.unify(plainPattern.to, plainActual.to, map);
        case 'array':
            if (plainActual.kind !== 'array' || !this.unify(plainPattern.of, plainActual.of, map))
                return false;
            if (plainPattern.length === -2) {
                var lengthNode = plainPattern.lengthNode;
                if (lengthNode.k === 'name' && lengthNode.entity && lengthNode.entity.placeholder &&
                    map.has(lengthNode.entity.placeholder)) {
                    var lengthBound = map.get(lengthNode.entity.placeholder);
                    var value = big.fromFloat(plainActual.length);
                    if (lengthBound !== undefined)
                        return big.cmp(lengthBound.value, value) === 0;
                    map.set(lengthNode.entity.placeholder, { kind: 'value', value: value, type: types.ulong,
                                                             text: String(plainActual.length) });
                    return true;
                }
                return true;
            }
            return plainPattern.length === plainActual.length;
        case 'function': {
            if (plainActual.kind !== 'function' || !this.unify(plainPattern.returns, plainActual.returns, map))
                return false;
            var patternArgs = plainPattern.params.map(function (param) { return { kind: 'type', type: param }; });
            var actualArgs = plainActual.params.map(function (param) { return { kind: 'type', type: param }; });
            return this.unifyArgumentLists(patternArgs, actualArgs, map);
        }
        case 'tspec': {
            // Two patterns (partial ordering): the arguments of the same template.
            if (plainActual.kind === 'tspec')
                return plainActual.template === plainPattern.template &&
                    this.unifyArgumentLists(plainPattern.args, plainActual.args, map);
            var candidates = [];
            (function collect(cls) {
                if (!cls.isClass)
                    return;
                candidates.push(cls);
                cls.bases.forEach(function (base) { collect(base.type); });
            })(plainActual);
            for (var index = 0; index < candidates.length; ++index) {
                var candidate = candidates[index];
                if (candidate.template !== plainPattern.template)
                    continue;
                var trial = new Map(map);
                var candidateArgs = withoutDefaults(plainPattern, flattenArgs(candidate.templateArgs));
                if (this.unifyArgumentLists(plainPattern.args, candidateArgs, trial)) {
                    trial.forEach(function (value, key) { map.set(key, value); });
                    return true;
                }
            }
            return false;
        }
        case 'dependent':
        case 'packexp':
            return true;
        }
        if (plainPattern.isClass && plainPattern.template !== null && plainActual.isClass &&
            plainActual.template === plainPattern.template) {
            // An instance with placeholders (rare): compare arguments.
            return argumentsKey(plainPattern.templateArgs) === argumentsKey(plainActual.templateArgs);
        }
        return plainPattern === plainActual;
    };

    // Whether a pattern type has placeholders of the map.
    function mentions(type, map) {
        if (type === null || type === undefined)
            return false;
        if (type.unqualified !== undefined)
            return mentions(type.unqualified, map);
        if (type.kind === 'tparam')
            return map.has(type);
        switch (type.kind) {
        case 'pointer':
        case 'lref':
        case 'rref':
            return mentions(type.to, map);
        case 'array':
            return mentions(type.of, map) || type.length === -2;
        case 'function':
            return mentions(type.returns, map) || type.params.some(function (param) { return mentions(param, map); });
        case 'tspec':
            return type.args.some(function (arg) {
                return arg.kind === 'type' ? mentions(arg.type, map) : arg.kind === 'expr';
            });
        case 'packexp':
            return mentions(type.pattern, map);
        }
        return false;
    }

    // Deduction for a call: the template arguments from the arguments of
    // the call ([temp.deduct.call]); null if it fails.
    Parser.prototype.deduceCall = function (template, args, explicitArgs, node) {
        var map = new Map();
        template.params.forEach(function (param) { map.set(param.placeholder, undefined); });
        // A function parameter whose template parameters are all explicit
        // deduces nothing: max<double>(2.5, 1) converts 1.
        var deducible = new Map(map);
        if (explicitArgs !== null) {
            var position = 0;
            for (var index = 0; index < template.params.length && position < explicitArgs.length; ++index) {
                var param = template.params[index];
                if (param.pack) {
                    map.set(param.placeholder,
                            { kind: 'pack', items: explicitArgs.slice(position), explicitPack: true });
                    position = explicitArgs.length;
                    break;
                }
                // get<0>(t) does not fit template <class T> get(...).
                if ((param.kind === 'type') !== (explicitArgs[position].kind === 'type'))
                    return null;
                map.set(param.placeholder, explicitArgs[position++]);
                deducible.delete(param.placeholder);
            }
            if (position < explicitArgs.length)
                return null;
        }
        var params = template.pattern.params;
        var paramInfo = template.paramInfo;
        var argIndex = 0;
        for (var paramIndex = 0; paramIndex < params.length; ++paramIndex) {
            var info = paramInfo[paramIndex];
            var paramType = params[paramIndex];
            if (info && info.pack) {
                // A function parameter pack takes the rest of the arguments.
                var packPlaceholder = packPlaceholderOf({ kind: 'type', type: paramType }, map);
                if (packPlaceholder === null)
                    return null;
                var existingPack = map.get(packPlaceholder);
                if (existingPack !== undefined && existingPack.explicitPack) {
                    argIndex = args.length;
                    continue;
                }
                var items = [];
                for (; argIndex < args.length; ++argIndex) {
                    var inner = new Map(map);
                    inner.set(packPlaceholder, undefined);
                    if (!this.deduceParameter(paramType, args[argIndex], inner))
                        return null;
                    var element = inner.get(packPlaceholder);
                    if (element === undefined)
                        return null;
                    items.push(element);
                    inner.forEach(function (value, key) {
                        if (key !== packPlaceholder)
                            map.set(key, value);
                    });
                }
                map.set(packPlaceholder, { kind: 'pack', items: items });
                continue;
            }
            if (argIndex >= args.length)
                break;
            if (!mentions(paramType, deducible)) {
                ++argIndex;
                continue;
            }
            if (!this.deduceParameter(paramType, args[argIndex], map))
                return null;
            ++argIndex;
        }
        // Defaults for what the arguments did not give.
        var result = [];
        for (var index2 = 0; index2 < template.params.length; ++index2) {
            var templateParam = template.params[index2];
            var value = map.get(templateParam.placeholder);
            if (value === undefined) {
                if (templateParam.pack) {
                    value = { kind: 'pack', items: [] };
                } else if (templateParam.defaultTokens !== null) {
                    try {
                        value = this.defaultTemplateArgument(template, templateParam, result, node);
                    } catch (error) {
                        if (error instanceof CompileError)
                            return null;
                        throw error;
                    }
                } else {
                    return null;
                }
            }
            if (value.kind === 'pack' && value.items.some(function (item) { return item === undefined; }))
                return null;
            result.push(value);
        }
        return result;
    };

    // One parameter against one argument: P = T&& is a forwarding
    // reference; arrays and functions decay for non-reference parameters.
    Parser.prototype.deduceParameter = function (paramType, arg, map) {
        if (arg.k === 'braced') {
            var plainParam = unqual(X.removeRef(paramType));
            if (plainParam.kind === 'tspec' && plainParam.template.name === 'initializer_list') {
                var items = arg.checkedItems ? arg.items : this.checkListItems(arg.items);
                for (var index = 0; index < items.length; ++index) {
                    if (items[index].k === 'braced' ||
                        !this.unify(plainParam.args[0].type, X.decay(items[index].type), map))
                        return false;
                }
                return true;
            }
            return true;
        }
        if (arg.k === 'overload') {
            var candidates = arg.set.items.filter(function (item) { return item.kind === 'func'; });
            if (candidates.length !== 1)
                return !mentions(paramType, map) || false;
            arg = { type: candidates[0].type, cat: 'lvalue' };
        }
        var argType = arg.type;
        if (paramType.kind === 'rref' && paramType.to.kind === 'tparam' && map.has(paramType.to)) {
            // A forwarding reference.
            var deduced = arg.cat === 'lvalue' ? X.lref(argType) : argType;
            return this.unify(paramType.to, deduced, map);
        }
        // The referred type and the pointed type may be more qualified than
        // the argument: const T& from int deduces T = int.
        if (X.isRef(paramType))
            return this.unify(paramType.to, moreQualified(argType, paramType.to), map) ||
                this.unifyDerived(paramType.to, argType, map);
        var decayed = X.decay(argType);
        if (paramType.kind === 'pointer' && decayed.kind === 'pointer')
            return this.unify(paramType, X.pointerTo(moreQualified(decayed.to, paramType.to)), map) ||
                this.unifyDerived(paramType, decayed, map);
        return this.unify(unqual(paramType), decayed, map) || this.unifyDerived(unqual(paramType), decayed, map);
    };

    function moreQualified(type, pattern) {
        if (X.isRef(type) || type.kind === 'function')
            return type;
        return X.withCv(type, X.cvOf(type) | X.cvOf(pattern));
    }

    // A derived class deduces against a template-id of its base.
    Parser.prototype.unifyDerived = function (pattern, actual, map) {
        var plain = unqual(pattern);
        var plainActual = unqual(actual);
        if (plain.kind === 'pointer' && plainActual.kind === 'pointer')
            return this.unifyDerived(plain.to, plainActual.to, map);
        if (plain.kind !== 'tspec' || !plainActual.isClass)
            return false;
        // The first base (depth first) that deduces; the cv of the pattern
        // must cover the one of the argument.
        if ((X.cvOf(pattern) & X.cvOf(actual)) !== X.cvOf(actual))
            return false;
        for (var index = 0; index < plainActual.bases.length; ++index) {
            var base = plainActual.bases[index].type;
            var trial = new Map(map);
            if (this.unify(plain, base, trial) || this.unifyDerived(plain, base, trial)) {
                trial.forEach(function (value, key) { map.set(key, value); });
                return true;
            }
        }
        return false;
    };

    // A function template instance for a call (null when deduction or the
    // substitution into the signature fails).
    Parser.prototype.instantiateForCall = function (template, args, explicitArgs, node, options) {
        var deduced = this.deduceCall(template, args, explicitArgs, node);
        if (deduced === null)
            return null;
        return this.instantiateFunction(template, deduced, node, true);
    };

    Parser.prototype.instantiateExplicit = function (template, args, node) {
        var complete = this.completeArguments(template, args, node);
        if (complete === null)
            return null;
        return this.instantiateFunction(template, complete, node, false);
    };

    // Deduction from a function type (&f<...> or a specialization).
    Parser.prototype.deduceFromType = function (template, fnType) {
        var map = new Map();
        template.params.forEach(function (param) { map.set(param.placeholder, undefined); });
        if (!this.unify(template.pattern, fnType, map)) {
            var noReturn = new Map();
            template.params.forEach(function (param) { noReturn.set(param.placeholder, undefined); });
            var patternArgs = template.pattern.params.map(function (param) { return { kind: 'type', type: param }; });
            var actualArgs = fnType.params.map(function (param) { return { kind: 'type', type: param }; });
            if (!this.unifyArgumentLists(patternArgs, actualArgs, noReturn))
                return null;
            map = noReturn;
        }
        var result = [];
        for (var index = 0; index < template.params.length; ++index) {
            var value = map.get(template.params[index].placeholder);
            if (value === undefined) {
                if (template.params[index].pack)
                    value = { kind: 'pack', items: [] };
                else if (template.params[index].defaultTokens !== null)
                    value = this.defaultTemplateArgument(template, template.params[index], result, null);
                else
                    return null;
            }
            result.push(value);
        }
        return result;
    };

    Parser.prototype.instantiateForType = function (template, fnType) {
        var args = this.deduceFromType(template, fnType);
        if (args === null)
            return null;
        var func = this.instantiateFunction(template, args, null, true);
        return func !== null && func.type === fnType ? func : null;
    };

    // The instance of a function template for arguments; sfinae - an error
    // in the signature gives null.
    Parser.prototype.instantiateFunction = function (template, args, node, sfinae) {
        var key = argumentsKey(args);
        var cached = template.instances.get(key);
        if (cached !== undefined)
            return cached;
        if (template.genericLambda)
            return this.instantiateGenericLambda(template, args, key);
        var explicit = template.explicit.get(key);
        var tokens = explicit !== undefined ? explicit.tokens : template.tokens;
        var scope = new X.Scope('template', explicit !== undefined ? explicit.scope : template.scope);
        if (explicit === undefined)
            template.params.forEach(function (param, index) {
                if (param.name !== null)
                    scope.members[param.name] = bindingEntity(param, args[index]);
            });
        var parser = new Parser(this.session, tokens, { scope: scope, library: template.library });
        parser.instantiating = { kind: 'function', target: null };
        parser.deferBodies = true;
        if (template.owner && template.owner.isClass) {
            parser.access = template.access;
            parser.scope = scope;
        }
        var func;
        var depth = this.session.instantiationDepth;
        if (depth > 64) {
            if (sfinae)
                return null;
            this.error(node, 'template instantiation depth exceeds maximum of 64');
        }
        this.session.instantiationDepth = depth + 1;
        try {
            if (explicit === undefined)
                this.substituteParameterTypes(template, scope);
            if (explicit !== undefined) {
                parser.declSpecifiers(template.context || 'namespace');
                parser.index = 0;
            }
            parser.declaration(template.context === 'class' ? 'class' : 'namespace');
            func = parser.instantiating.target;
        } catch (error) {
            if (sfinae && error instanceof CompileError)
                return null;
            throw error;
        } finally {
            this.session.instantiationDepth = depth;
        }
        if (func === null || func === undefined) {
            if (sfinae)
                return null;
            this.error(node, "cannot instantiate '" + template.name + "'");
        }
        func.template = template;
        func.templateArgs = args;
        func.name = template.isCtor ? template.owner.name : template.name;
        func.owner = template.owner;
        func.library = template.library;
        func.isCtor = !!template.isCtor;
        func.isMember = !!template.isMember || func.isCtor;
        func.isStatic = !!template.isStatic;
        func.explicit = !!template.explicitCtor;
        func.access = template.access || 'public';
        func.instanceText = X.templateArgsText(args);
        template.instances.set(key, func);
        if (X.transaction !== null)
            X.transaction.onRollback(function () { template.instances.delete(key); });
        return func;
    };

    // The dependent types of value parameters with the arguments: an
    // invalid type fails the instance.
    Parser.prototype.substituteParameterTypes = function (template, scope) {
        for (var index = 0; index < template.params.length; ++index) {
            var tokens = template.params[index].typeTokens;
            if (tokens !== undefined)
                new Parser(this.session, tokens, { scope: scope, library: template.library }).typeId();
        }
    };

    // Partial ordering of two function templates: > 0 - left is more
    // specialized.
    Parser.prototype.moreSpecialized = function (left, right) {
        if (left === null || right === null || left === right)
            return 0;
        var leftFromRight = this.patternsDeduce(right, left);
        var rightFromLeft = this.patternsDeduce(left, right);
        if (leftFromRight && !rightFromLeft)
            return 1;
        if (rightFromLeft && !leftFromRight)
            return -1;
        if (leftFromRight && rightFromLeft) {
            var byReference = referenceOrder(left, right);
            if (byReference !== 0)
                return byReference;
        }
        // A template without a trailing pack is more specialized.
        var leftPack = left.paramInfo.some(function (param) { return param.pack; });
        var rightPack = right.paramInfo.some(function (param) { return param.pack; });
        if (leftPack !== rightPack)
            return leftPack ? -1 : 1;
        return 0;
    };

    // Reference parameters deducing both ways: const T& is more specialized
    // than T&, T& than T&& ([temp.deduct.partial]).
    function referenceOrder(left, right) {
        var leftMore = false, rightMore = false;
        var count = Math.min(left.pattern.params.length, right.pattern.params.length);
        for (var index = 0; index < count; ++index) {
            var a = left.pattern.params[index], b = right.pattern.params[index];
            if (!X.isRef(a) || !X.isRef(b))
                continue;
            if (a.kind !== b.kind) {
                if (a.kind === 'lref')
                    leftMore = true;
                else
                    rightMore = true;
                continue;
            }
            var aCv = X.cvOf(a.to), bCv = X.cvOf(b.to);
            if (aCv === bCv)
                continue;
            if ((aCv & bCv) === bCv)
                leftMore = true;
            else if ((aCv & bCv) === aCv)
                rightMore = true;
        }
        return leftMore === rightMore ? 0 : (leftMore ? 1 : -1);
    }

    // Whether the parameters of template 'to' deduce from those of 'from'.
    Parser.prototype.patternsDeduce = function (to, from) {
        var map = new Map();
        to.params.forEach(function (param) { map.set(param.placeholder, undefined); });
        var toParams = to.pattern.params, fromParams = from.pattern.params;
        var count = Math.min(toParams.length, fromParams.length);
        for (var index = 0; index < count; ++index) {
            if (to.paramInfo[index] && to.paramInfo[index].pack)
                return true;
            var pattern = X.removeRef(toParams[index]);
            var actual = X.removeRef(fromParams[index]);
            if (!this.unify(unqual(pattern), unqual(actual), map) && !this.unify(pattern, actual, map))
                return false;
        }
        return toParams.length <= fromParams.length || (to.paramInfo[toParams.length - 1] || {}).pack;
    };

    // --- Packs

    // The element of a pack in the expansion being checked, or null.
    Parser.prototype.packElement = function (pack) {
        for (var index = this.packIndex.length - 1; index >= 0; --index) {
            var entry = this.packIndex[index];
            if (entry.pack === pack)
                return pack.items[entry.index];
        }
        return null;
    };

    Parser.prototype.packLength = function (pack, node) {
        if (pack.kind === 'typepack' || pack.kind === 'valuepack' || pack.kind === 'parampack')
            return pack.items.length;
        this.error(node, "'" + pack.name + "' is not a parameter pack");
    };

    // The packs a syntax tree refers to.
    Parser.prototype.packsIn = function (node, found) {
        found = found || [];
        if (node === null || node === undefined || typeof node !== 'object')
            return found;
        if (Array.isArray(node)) {
            var self = this;
            node.forEach(function (item) { self.packsIn(item, found); });
            return found;
        }
        if (node.k === 'name') {
            var entity = node.entity;
            if (entity && (entity.kind === 'parampack' || entity.kind === 'valuepack' || entity.kind === 'typepack') &&
                found.indexOf(entity) < 0)
                found.push(entity);
            if (node.args) {
                var self2 = this;
                node.args.forEach(function (arg) {
                    if (arg.kind === 'type')
                        packsOfType(arg.type, found);
                    else if (arg.kind === 'expr' && arg.deferred)
                        self2.packsIn(arg.node, found);
                });
            }
            return found;
        }
        if (node.k === 'expansion' || node.k === 'sizeofpack')
            return found;
        if (node.type !== undefined && node.type !== null && typeof node.type === 'object' &&
            node.type.kind !== undefined)
            packsOfType(node.type, found);
        var keys = ['expr', 'left', 'right', 'cond', 'then', 'otherwise', 'target', 'source', 'fn', 'args', 'list',
                    'index',
                    'items', 'pack', 'init', 'value', 'name'];
        for (var key = 0; key < keys.length; ++key) {
            if (node[keys[key]] !== undefined && typeof node[keys[key]] === 'object')
                this.packsIn(node[keys[key]], found);
        }
        return found;
    };

    X.packsOfType = function (type, found) {
        packsOfType(type, found);
    };

    function packsOfType(type, found) {
        if (type === null || type === undefined)
            return;
        if (type.kind === 'packref') {
            if (found.indexOf(type.pack) < 0)
                found.push(type.pack);
            return;
        }
        if (type.kind === 'dependent') {
            packsOfType(type.base, found);
            return;
        }
        if (type.unqualified !== undefined)
            return packsOfType(type.unqualified, found);
        switch (type.kind) {
        case 'pointer':
        case 'lref':
        case 'rref':
            packsOfType(type.to, found);
            return;
        case 'array':
            packsOfType(type.of, found);
            return;
        case 'function':
            packsOfType(type.returns, found);
            type.params.forEach(function (param) { packsOfType(param, found); });
            return;
        case 'tspec':
            type.args.forEach(function (arg) {
                if (arg.kind === 'type')
                    packsOfType(arg.type, found);
            });
        }
    }

    // pattern... in a list: the pattern checked once per element.
    Parser.prototype.expandPattern = function (pattern, node) {
        var packs = this.packsIn(pattern);
        if (packs.length === 0)
            this.error(node, "expansion pattern '" + this.describeSyntax(pattern) + "' contains no parameter packs");
        var length = packs[0].items.length;
        if (packs.some(function (pack) { return pack.items.length !== length; }))
            this.error(node, "mismatched argument pack lengths while expanding '" + this.describeSyntax(pattern) + "'");
        var result = [];
        for (var index = 0; index < length; ++index) {
            var self = this;
            packs.forEach(function (pack) { self.packIndex.push({ pack: pack, index: index }); });
            try {
                result.push(pattern.k === 'braced' ? pattern : this.check(pattern));
            } finally {
                packs.forEach(function () { self.packIndex.pop(); });
            }
        }
        return result;
    };

    // A function parameter pack named in an expansion: one parameter.
    Parser.prototype.packParameter = function (pack, node) {
        var element = this.packElement(pack);
        if (element === null)
            this.error(node, "parameter packs not expanded with '...'");
        return this.variableIr(element, node);
    };

    Parser.prototype.valuePackElement = function (pack, node) {
        var element = this.packElement(pack);
        if (element === null)
            this.error(node, "parameter packs not expanded with '...'");
        return this.constant(element.value, unqual(element.type || types.int), node);
    };

    // T... in template arguments: one argument per element.
    Parser.prototype.expandTypePack = function (type, tok) {
        var packs = [];
        packsOfType(type, packs);
        if (packs.length === 0) {
            if (this.pattern)
                return [{ kind: 'type', type: { kind: 'packexp', pattern: type, size: 0, align: 1, dependent: true,
                                                id: X.newId() } }];
            this.error(tok, "expansion pattern '" + X.typeString(type) + "' contains no parameter packs");
        }
        var pack = packs[0];
        var result = [];
        for (var index = 0; index < pack.items.length; ++index)
            result.push({ kind: 'type', type: this.substitutePack(type, pack, index) });
        return result;
    };

    Parser.prototype.expandValuePack = function (expr, tok) {
        if (this.pattern)
            return [{ kind: 'expr', node: expr, pack: true, text: this.describeSyntax(expr) + '...' }];
        var values = this.expandPattern(expr, tok);
        var self = this;
        return values.map(function (value) {
            return self.constantArgument({ k: 'checked', ir: value, line: tok.line, file: tok.file });
        });
    };

    // The template arguments of a name in an expansion being checked: the
    // elements replace the packs (std::forward<Args>(args)...).
    Parser.prototype.expandedArguments = function (args) {
        if (args === null || args === undefined || this.packIndex.length === 0)
            return args;
        var self = this;
        return args.map(function (arg) {
            if (arg.kind === 'expr' && arg.deferred)
                return self.constantArgument(arg.node);
            if (arg.kind !== 'type')
                return arg;
            var found = [];
            packsOfType(arg.type, found);
            if (found.length === 0)
                return arg;
            var type = arg.type;
            self.packIndex.forEach(function (entry) {
                if (found.indexOf(entry.pack) >= 0)
                    type = self.substitutePack(type, entry.pack, entry.index);
            });
            return { kind: 'type', type: type };
        });
    };

    // A type with the packref of a pack replaced by its element.
    Parser.prototype.substitutePack = function (type, pack, index) {
        var self = this;
        function walk(current) {
            if (current.unqualified !== undefined)
                return X.qualify(walk(current.unqualified), current.cv);
            if (current.kind === 'packref')
                return current.pack === pack ? pack.items[index] : current;
            switch (current.kind) {
            case 'pointer':
                return X.pointerTo(walk(current.to));
            case 'lref':
                return X.lref(walk(current.to));
            case 'rref':
                return X.rref(walk(current.to));
            case 'array':
                return X.arrayOf(walk(current.of), current.length);
            case 'function':
                return X.functionType(walk(current.returns), current.params.map(walk), current.variadic, current.cv,
                                      current.ref, current.noexcept);
            case 'tspec': {
                var args = [];
                current.args.forEach(function (arg) {
                    if (arg.kind === 'type' && arg.type.kind === 'packexp') {
                        args = args.concat(self.expandTypePack(arg.type.pattern, null));
                        return;
                    }
                    args.push(arg.kind === 'type' ? { kind: 'type', type: walk(arg.type) } : arg);
                });
                return self.specialize(current.template, args, null);
            }
            case 'dependent':
                return current.base ? self.resolveDependent(walk(current.base), current) : current;
            }
            return current;
        }
        return walk(type);
    };

    // typename B::path::name once B is known.
    Parser.prototype.resolveDependent = function (base, dependent) {
        if (base === dependent.base)
            return dependent;
        if (base.dependent) {
            var copy = X.dependentName(dependent.text);
            copy.base = base;
            copy.path = dependent.path;
            copy.memberName = dependent.memberName;
            return copy;
        }
        var scope = unqual(base);
        var names = (dependent.path || []).concat([dependent.memberName]);
        for (var index = 0; index < names.length; ++index) {
            var entity = scope.isClass ? (X.lookupMember(scope, names[index]) || {}).entity : null;
            if (!X.isTypeEntity(entity))
                this.error(null, "no type named '" + names[index] + "' in '" + X.typeString(scope) + "'");
            scope = unqual(this.entityType(entity));
        }
        return this.entityType(entity);
    };

    // The types of a pack named in a base clause (Bases...).
    Parser.prototype.packItems = function (entity, tok) {
        if (entity === null || entity.kind !== 'typepack')
            this.error(tok, "expansion pattern contains no parameter packs");
        return entity.items.map(unqual);
    };

    // (pack op ...), (... op pack), (init op ... op pack).
    Parser.prototype.foldExpr = function (node) {
        if (node.init !== null && this.packsIn(node.init).length > 0) {
            // (pack op ... op init) is a right fold.
            node = { k: 'fold', op: node.op, pack: node.init, init: node.pack, right: true, line: node.line,
                     column: node.column, file: node.file };
        }
        var values = this.expandPattern(node.pack, node);
        var self = this;
        function wrap(ir) {
            return { k: 'checked', ir: ir, line: node.line, column: node.column, file: node.file };
        }
        var init = node.init !== null ? this.check(node.init) : null;
        if (values.length === 0 && init === null) {
            if (node.op === '&&')
                return this.constant(1, types.bool, node);
            if (node.op === '||')
                return this.constant(0, types.bool, node);
            if (node.op === ',')
                return this.ir('conv', node,
                               { operand: this.constant(0, types.int, node), from: types.int, to: types.void,
                                               type: types.void, cat: 'prvalue' });
            this.error(node, "fold of empty expansion over " + node.op);
        }
        var items = values.slice();
        var assignment = node.op === '=' || (node.op.length > 1 && node.op.charAt(node.op.length - 1) === '=' &&
            node.op !== '==' && node.op !== '!=' && node.op !== '<=' && node.op !== '>=');
        function combine(left, right) {
            var syntax = assignment ? { k: 'assign', op: node.op, target: wrap(left), source: wrap(right) }
                                    : (node.op === ',' ? { k: 'comma', list: [wrap(left), wrap(right)] }
                                                       : { k: 'binary', op: node.op, left: wrap(left),
                                                           right: wrap(right) });
            syntax.line = node.line;
            syntax.column = node.column;
            syntax.file = node.file;
            return self.check(syntax);
        }
        var result;
        if (node.right) {
            // (pack op ...) and (pack op ... op init): from the right.
            result = init !== null ? init : items.pop();
            for (var index = items.length - 1; index >= 0; --index)
                result = combine(items[index], result);
        } else {
            result = init !== null ? init : items.shift();
            for (var next = 0; next < items.length; ++next)
                result = combine(result, items[next]);
        }
        return result;
    };
})(globalThis);
