// C++: function bodies, constructors and destructors, structured bindings
// and lambdas (continues parser.js). A body is parsed by its own parser
// over the tokens of the function (session.compileBody). Constructors and
// destructors keep in their context what codegen needs besides the body:
// the initializers of bases and members (memberInits) and the destructors
// of the parts (partDtors). A lambda is a class: captures are its fields,
// the body is operator(); a generic lambda has a member template.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var X = T.cpp;
    var Parser = X.Parser;
    if (Object.prototype.hasOwnProperty.call(Parser.prototype, 'functionBody'))
        return;

    var types = X.types;
    var unqual = X.unqual;

    // --- Bodies

    // Parses the body of func at the current token (its lazy record).
    Parser.prototype.functionBody = function (func) {
        var parent = func.lambda ? func.lambda.parentContext : null;
        var context = new X.FunctionContext(this.session, func, parent);
        context.lambda = func.lambda || null;
        if (func.isMember && !func.isStatic) {
            if (func.lambda) {
                context.closureClass = func.owner;
                context.thisCv = func.type.cv;
            } else {
                context.thisClass = func.owner;
                context.thisCv = func.type.cv || 0;
            }
        }
        context.isCtor = func.isCtor;
        context.isDtor = func.isDtor;
        this.func = context;
        var scope = this.pushScope('function');
        scope.paramScope = true;
        scope.func = context;
        var packs = Object.create(null);
        context.params = func.params.map(function (param, index) {
            if (param.name === null || param.name === undefined)
                return null;
            var type = func.type.params[index];
            var object = context.newLocal(param.packName || param.name, type, param);
            object.param = true;
            object.isConst = X.isConst(type);
            if (param.packName !== undefined) {
                if (packs[param.packName] === undefined) {
                    packs[param.packName] = { kind: 'parampack', name: param.packName, items: [] };
                    X.declare(scope, param.packName, packs[param.packName]);
                }
                packs[param.packName].items.push(object);
            } else {
                X.declare(scope, param.name, object);
            }
            return object;
        });
        (func.params.emptyPacks || []).forEach(function (name) {
            X.declare(scope, name, { kind: 'parampack', name: name, items: [] });
        });
        var tok = this.peek();
        try {
            if (this.is('try')) {
                this.next();
                this.error(tok, 'function-try-blocks are not supported');
            }
            if (func.isCtor)
                this.constructorInitializers(func, context);
            var body = this.compoundStatement(false);
            this.returnSlotObject(context);
            if (func.isCtor || func.isDtor)
                context.partDtors = this.partDestructors(func.owner);
            if (func.isDtor)
                this.useBaseDestructors(func.owner);
            return body;
        } finally {
            this.popScope();
        }
    };

    // A local that every return of the function returns is made in the
    // return slot and not copied, as g++ does (NRVO).
    Parser.prototype.returnSlotObject = function (context) {
        var returns = context.classReturns;
        if (returns.length === 0 || returns[0].object === null)
            return;
        var object = returns[0].object;
        if (!returns.every(function (entry) { return entry.object === object; }))
            return;
        object.returnSlot = true;
        returns.forEach(function (entry) { entry.statement.returnSlot = true; });
    };

    // : base(args), member(args), member{args}, Delegate(args)
    Parser.prototype.constructorInitializers = function (func, context) {
        var cls = func.owner;
        var inits = [];
        var self = this;
        if (this.accept(':')) {
            do {
                var tok = this.peek();
                // Names of members and bases are looked up in the class first.
                var name = this.withScope(cls, function () { return self.parseName({ allowUnknown: true }); });
                var init;
                if (this.is('{'))
                    init = this.node('braced', this.peek(), { items: this.bracedList().items, copy: false });
                else {
                    this.expect('(');
                    var args = this.expressionList(')');
                    this.expect(')');
                    init = this.node('direct', tok, { args: args });
                }
                var expanded = this.accept('...');
                var entity = name.entity;
                if (entity !== null && entity.kind === 'field' && entity.owner === cls && name.qualifier === null) {
                    if (inits.some(function (item) { return item.field === entity; }))
                        this.error(tok, "multiple initializations given for '" + X.qualifiedName(cls) + '::' +
                                   entity.name + "'");
                    var fieldInit = this.withScope(this.scope, function () {
                        return self.initializeVariable({ name: entity.name, type: entity.type, storage: 'member' },
                                                       init, tok);
                    });
                    inits.push({ field: entity, init: fieldInit });
                    continue;
                }
                if (entity !== null && entity.kind === 'field' && entity.viaAnonymous !== undefined) {
                    inits.push({ field: entity, init: this.initializeVariable({ name: entity.name, type: entity.type,
                                                                                 storage: 'member' }, init, tok),
                                 anonymous: true });
                    continue;
                }
                var types = [];
                if (expanded && entity !== null && entity.kind === 'typepack')
                    types = entity.items.map(unqual);
                else if (X.isTypeEntity(entity))
                    types = [unqual(this.entityType(entity))];
                else if (entity !== null && entity.kind === 'template' && entity.what === 'class')
                    types = cls.bases.filter(function (base) { return base.type.template === entity; })
                        .map(function (base) { return base.type; });
                if (types.length === 0)
                    this.error(tok, "class '" + X.typeString(cls) + "' does not have any field named '" + name.name +
                               "'");
                types.forEach(function (type) {
                    if (type === cls) {
                        // A delegating constructor.
                        inits.push({ delegate: true, init: self.classInit(cls, init, tok) });
                        return;
                    }
                    var base = cls.bases.filter(function (item) { return item.type === type; })[0];
                    if (base === undefined)
                        self.error(tok, "type '" + X.typeString(type) + "' is not a direct base of '" +
                                   X.typeString(cls) + "'");
                    inits.push({ base: base, init: self.classInit(type, init, tok) });
                });
            } while (this.accept(','));
        }
        context.memberInits = this.completeInitializers(cls, inits, func);
    };

    // A base or a delegated constructor from (args) or {args}.
    Parser.prototype.classInit = function (type, init, tok) {
        if (init.k === 'braced')
            return this.listInitialize(type, init.items, init, false);
        return this.directInitialize(type, this.checkArguments(init.args), tok, false);
    };

    // The initializers of all bases and fields in declaration order: those
    // written, default member initializers, default initialization.
    Parser.prototype.completeInitializers = function (cls, inits, func) {
        var self = this;
        var delegate = inits.filter(function (item) { return item.delegate; });
        if (delegate.length > 0) {
            if (inits.length > 1)
                this.error(func, 'mem-initializer for a delegating constructor must be the only one');
            return { delegate: delegate[0].init, bases: [], fields: [] };
        }
        var result = { delegate: null, bases: [], fields: [] };
        cls.bases.forEach(function (base) {
            var written = inits.filter(function (item) { return item.base === base; })[0];
            var init;
            if (written !== undefined)
                init = written.init;
            else if (func.inheritedFrom !== undefined && base.type === cls.inheritedCtors)
                init = null;
            else
                init = self.defaultInitialize(base.type, func, false);
            result.bases.push({ base: base, init: init });
        });
        cls.dataMembers.forEach(function (field) {
            var written = inits.filter(function (item) { return item.field === field ||
                                                             (item.anonymous && field.anonymous &&
                                                              item.field.viaAnonymous === field); })[0];
            if (written !== undefined) {
                result.fields.push({ field: written.anonymous ? written.field : field, init: written.init,
                                     anonymous: !!written.anonymous });
                return;
            }
            if (field.name === null && !field.anonymous)
                return;
            if (field.initTokens !== null && field.initTokens !== undefined) {
                result.fields.push({ field: field, init: self.memberDefaultInit(cls, field, func) });
                return;
            }
            if (X.isRef(field.type))
                self.error(func, "uninitialized reference member in '" + X.typeString(field.type) + "'");
            if (X.isConst(field.type) && !unqual(field.type).isClass && func.implicit === false && !self.library)
                self.error(func, "uninitialized const member in '" + X.typeString(field.type) + "'");
            result.fields.push({ field: field,
                                 init: field.anonymous ? null : self.defaultInitialize(field.type, func, false) });
        });
        return result;
    };

    // Destructors of the fields (in reverse order) and the bases of a class:
    // [{ offset, type, dtor }].
    Parser.prototype.partDestructors = function (cls) {
        var self = this;
        var parts = [];
        cls.dataMembers.forEach(function (field) {
            if (field.anonymous || X.isRef(field.type))
                return;
            var type = unqual(field.type);
            var dtor = self.elementDestructor(type);
            if (dtor !== null)
                parts.push({ offset: field.offset, type: type, dtor: dtor, field: field });
        });
        parts.reverse();
        cls.bases.slice().reverse().forEach(function (base) {
            var dtor = self.destructorOf(base.type);
            if (dtor !== null)
                parts.push({ offset: base.offset, type: base.type, dtor: dtor, base: base });
        });
        return parts;
    };

    // The destructor of a type or of the elements of an array type.
    Parser.prototype.elementDestructor = function (type) {
        var element = unqual(type);
        while (element.kind === 'array')
            element = unqual(element.of);
        return this.destructorOf(element);
    };

    Parser.prototype.useBaseDestructors = function (cls) {
    };

    // The body of an implicit special member: what codegen needs, made in
    // the context of the class.
    Parser.prototype.implicitBody = function (func) {
        var cls = func.owner;
        var context = new X.FunctionContext(this.session, func, null);
        context.thisClass = cls;
        context.isCtor = func.isCtor;
        context.isDtor = func.isDtor;
        this.func = context;
        this.scope = cls;
        var self = this;
        var kind = func.implicitKind;
        var source = func.type.params.length > 0 ? context.newLocal('__other', func.type.params[0], null) : null;
        if (source !== null)
            source.param = true;
        context.params = source !== null ? [source] : [];
        var sourceRef = source === null ? null : {
            k: 'var', obj: source, type: X.removeRef(source.type),
            cat: kind === 'move' || kind === 'moveassign' ? 'xvalue' : 'lvalue',
            line: 0, file: ''
        };
        function part(type, offset, field) {
            if (sourceRef === null)
                return null;
            var base = self.baseSubobjectAt(sourceRef, type, offset);
            if (field !== undefined) {
                var value = self.fieldIr(sourceRef, field, func);
                if (kind === 'move' || kind === 'moveassign') {
                    value = self.shallowCopy(value);
                    if (!X.isRef(field.type))
                        value.cat = 'xvalue';
                }
                return value;
            }
            return base;
        }
        if (kind === 'default') {
            context.memberInits = this.completeInitializers(cls, [], func);
        } else if (kind === 'copy' || kind === 'move') {
            var inits = [];
            cls.bases.forEach(function (base) {
                inits.push({ base: base, init: self.copyInitialize(base.type, part(base.type, base.offset), func) });
            });
            cls.dataMembers.forEach(function (field) {
                if (field.name === null && !field.anonymous)
                    return;
                var value = part(field.type, field.offset, field);
                var plain = unqual(field.type);
                var init;
                if (field.anonymous || plain.kind === 'array' && !self.isTriviallyCopyable(plain))
                    init = field.anonymous ? self.ir('copy', func, { source: value, type: plain, cat: 'prvalue' })
                                           : self.arrayCopy(plain, value, func, kind === 'move');
                else if (plain.kind === 'array')
                    init = self.ir('arraycopy', func, { source: value, type: plain, cat: 'prvalue' });
                else
                    init = self.initializeFrom(field.type, value, func);
                inits.push({ field: field, init: init });
            });
            context.memberInits = { delegate: null, bases: inits.filter(function (item) { return item.base; }),
                                    fields: inits.filter(function (item) { return item.field; }) };
        } else if (kind === 'copyassign' || kind === 'moveassign') {
            var steps = [];
            var thisObject = this.thisObject(func);
            cls.bases.forEach(function (base) {
                var target = self.baseSubobject(thisObject, base.type, base.offset, func);
                steps.push(self.assignParts(target, part(base.type, base.offset), func));
            });
            cls.dataMembers.forEach(function (field) {
                if (field.name === null && !field.anonymous)
                    return;
                var target = self.fieldIr(thisObject, field, func);
                var value = part(field.type, field.offset, field);
                if (field.anonymous) {
                    steps.push(self.ir('assignobj', func,
                                       { target: target, source: value, type: field.type, cat: 'lvalue' }));
                    return;
                }
                steps.push(self.assignParts(target, value, func));
            });
            context.assignSteps = steps;
        } else if (kind === 'dtor') {
            context.partDtors = this.partDestructors(cls);
        }
        return null;
    };

    Parser.prototype.baseSubobjectAt = function (object, type, offset) {
        if (unqual(object.type) === type)
            return object;
        return this.ir('glvadj', object, { operand: object, offset: offset, type: X.qualify(type, X.cvOf(object.type)),
                                           cat: object.cat });
    };

    // target = value for one part of an implicit assignment.
    Parser.prototype.assignParts = function (target, value, node) {
        var type = unqual(target.type);
        if (type.isClass) {
            var call = this.operatorCall('=', [target, value], node, true);
            if (call === null)
                this.error(node, "use of deleted function 'operator='");
            return call;
        }
        if (type.kind === 'array') {
            if (this.isTriviallyCopyable(type))
                return this.ir('assignobj', node, { target: target, source: value, type: type, cat: 'lvalue' });
            this.error(node, 'assignment of arrays of classes is not supported');
        }
        if (target.bitfield === undefined && X.isRef(target.field ? target.field.type : types.void))
            return this.ir('comma', node, { list: [], type: types.void, cat: 'prvalue' });
        return this.ir('assign', node, { target: target, source: this.convertScalar(value, type), type: target.type,
                                         cat: 'lvalue' });
    };

    // Element-wise copy of an array of classes.
    Parser.prototype.arrayCopy = function (type, source, node, move) {
        var element = unqual(type.of);
        var probe = { k: 'probe', type: X.qualify(element, move ? 0 : X.CONST), cat: move ? 'xvalue' : 'lvalue',
                      line: node.line, file: node.file };
        var init = element.kind === 'array' ? this.arrayCopy(element, probe, node, move)
                                            : this.copyInitialize(element, probe, node);
        return this.ir('arrayeach', node, { source: source, type: type, elemInit: init, probe: probe, cat: 'prvalue' });
    };

    // --- Structured bindings

    // auto [a, b] = init; init - syntax or null (from the tokens).
    Parser.prototype.bindStructured = function (specs, names, tok, initSyntax) {
        var init;
        if (initSyntax !== null) {
            init = this.node('copy', tok, { expr: initSyntax });
        } else {
            init = this.initializerSyntax();
            if (init === null)
                this.fail("expected initializer" + this.before());
        }
        var placeholder = specs.type;
        // The type: auto, auto&, const auto&, auto&& from the declarator
        // part that followed the specifiers.
        var refKind = specs.bindingRef || null;
        if (refKind === '&')
            placeholder = X.lref(placeholder);
        else if (refKind === '&&')
            placeholder = X.rref(placeholder);
        var hiddenType = this.deduceVariable(placeholder, init, { name: '__binding', line: tok.line, column: tok.column,
                                                                  file: tok.file });
        var hidden = this.func.newLocal('__binding', hiddenType, tok);
        var statements = [this.statementNode('decl', tok,
                                             { obj: hidden, init: this.initializeVariable(hidden, init, tok) })];
        var base = this.ir('var', tok, { obj: hidden, type: X.removeRef(hiddenType), cat: 'lvalue' });
        var type = unqual(base.type);
        var self = this;
        var parts = [];
        if (type.kind === 'array') {
            if (names.length !== type.length)
                this.error(tok, (names.length < type.length ? 'only ' : '') + names.length + ' name' +
                           (names.length === 1 ? '' : 's') + ' provided for structured binding');
            names.forEach(function (name, index) {
                var element = self.subscript({ k: 'index',
                                               expr: { k: 'checked', ir: base, line: tok.line, file: tok.file },
                                               index: { k: 'int', text: String(index), line: tok.line, file: tok.file },
                                               line: tok.line, file: tok.file });
                parts.push(element);
            });
        } else if (type.isClass && this.isTupleLike(type)) {
            var size = this.tupleSize(type, tok);
            if (names.length !== size)
                this.error(tok, (names.length < size ? 'only ' : '') + names.length + ' name' +
                           (names.length === 1 ? '' : 's') +
                           ' provided for structured binding');
            names.forEach(function (name, index) {
                parts.push(self.tupleGet(base, index, tok, X.isRef(hiddenType) && hiddenType.kind === 'lref'));
            });
        } else if (type.isClass) {
            var fields = this.bindableFields(type, tok);
            if (names.length !== fields.length)
                this.error(tok, (names.length < fields.length ? 'only ' : '') + names.length + ' name' +
                           (names.length === 1 ? '' : 's') + ' provided for structured binding');
            fields.forEach(function (item) {
                var owner = self.baseSubobject(base, item.owner, item.offset, tok);
                parts.push(self.fieldIr(owner, item.field, tok));
            });
        } else {
            this.error(tok, "cannot decompose non-array non-class type '" + X.typeString(type) + "'");
        }
        names.forEach(function (name, index) {
            var part = parts[index];
            var refType = part.cat === 'prvalue' ? X.rref(unqual(part.type))
                                                 : (part.cat === 'xvalue' ? X.rref(part.type) : X.lref(part.type));
            var object = self.func.newLocal(name.value, refType, name);
            object.binding = true;
            statements.push(self.statementNode('decl', name,
                                               { obj: object, init: self.initializeFrom(refType, part, name) }));
            X.declare(self.scope, name.value, object);
        });
        return statements;
    };

    // The non-static data members of a class for a structured binding (all
    // in one class of the hierarchy).
    Parser.prototype.bindableFields = function (cls, tok) {
        var result = [];
        (function collect(current, offset) {
            current.dataMembers.forEach(function (field) {
                if (field.name !== null)
                    result.push({ field: field, owner: current, offset: offset });
            });
            current.bases.forEach(function (base) { collect(base.type, offset + base.offset); });
        })(cls, 0);
        return result;
    };

    Parser.prototype.isTupleLike = function (cls) {
        var sizeTemplate = this.session.stdTemplate('tuple_size');
        if (sizeTemplate === null)
            return false;
        var instance = this.instantiateClass(sizeTemplate, [{ kind: 'type', type: cls }], null);
        return instance.complete && X.lookupMember(instance, 'value') !== null;
    };

    Parser.prototype.tupleSize = function (cls, tok) {
        var instance = this.instantiateClass(this.session.stdTemplate('tuple_size'), [{ kind: 'type', type: cls }],
                                             tok);
        var member = X.lookupMember(instance, 'value').entity;
        return T.big.toFloat(member.constValue);
    };

    // get<i>(e) for a structured binding: a member get or std::get.
    Parser.prototype.tupleGet = function (base, index, tok, lvalue) {
        var arg = [{ kind: 'value', value: T.big.fromFloat(index), type: types.ulong, text: String(index) }];
        var object = lvalue || base.cat === 'lvalue' ? base : this.shallowCopy(base);
        if (object !== base)
            object.cat = 'xvalue';
        var cls = unqual(base.type);
        var member = X.lookupMember(cls, 'get');
        if (member !== null && member.entity.kind === 'functions' && member.entity.items.some(function (item) {
            return item.kind === 'template';
        })) {
            var memberIr = this.overloadIr(member.entity, tok, object);
            memberIr.templateArgs = arg;
            return this.overloadCall(memberIr, [], tok);
        }
        var set = this.argumentDependent('get', [object]);
        var callee = this.overloadIr({ kind: 'functions', name: 'get', items: set }, tok, null);
        callee.templateArgs = arg;
        return this.overloadCall(callee, [object], tok);
    };

    // --- Lambdas

    Parser.prototype.lambdaExpression = function () {
        var tok = this.expect('[');
        var info = { captures: [], explicit: Object.create(null), defaultMode: null, captureThis: false,
                     closure: null, finalized: false, parentContext: this.func, items: [], thisField: null };
        // The capture list.
        while (!this.is(']')) {
            var captureTok = this.peek();
            if (this.is('&') && (this.is(',', 1) || this.is(']', 1))) {
                this.next();
                info.defaultMode = 'ref';
            } else if (this.is('=') && (this.is(',', 1) || this.is(']', 1))) {
                this.next();
                info.defaultMode = 'copy';
            } else if (this.is('this')) {
                this.next();
                info.captureThis = true;
            } else if (this.is('*') && this.is('this', 1)) {
                this.error(captureTok, "capturing '*this' is not supported");
            } else {
                var byRef = !!this.accept('&');
                var nameTok = this.expectIdent();
                var pack = !!this.accept('...');
                var init = null;
                if (this.is('=') || this.is('(') || this.is('{'))
                    init = this.initializerSyntax();
                info.explicit[nameTok.value] = { mode: byRef ? 'ref' : 'copy', init: init, tok: nameTok, pack: pack };
                info.captures.push({ name: nameTok.value, mode: byRef ? 'ref' : 'copy', init: init, tok: nameTok,
                                     pack: pack });
            }
            if (!this.accept(','))
                break;
        }
        this.expect(']');
        var savedScope = this.scope;
        this.pushScope('lambda');
        var suffix;
        try {
            if (this.is('(')) {
                suffix = this.functionSuffix();
            } else {
                suffix = { k: 'function', params: [], variadic: false, cv: 0, ref: null, noexcept: false,
                           trailing: null,
                           line: tok.line, column: tok.column, file: tok.file };
            }
            var mutable = false;
            for (;;) {
                if (this.accept('mutable'))
                    mutable = true;
                else if (this.accept('constexpr'))
                    continue;
                else if (this.accept('noexcept')) {
                    if (this.is('('))
                        this.skipBalanced('(', ')');
                } else if (this.is('[') && this.is('[', 1))
                    this.skipAttributes();
                else
                    break;
            }
            if (suffix.trailing === null && this.accept('->'))
                suffix.trailing = this.typeId();
        } finally {
            this.scope = savedScope;
        }
        var generic = suffix.params.some(function (param) { return X.containsAuto(param.type); });
        var closure = new X.ClassType('<lambda>', 'class');
        closure.parent = this.scope;
        closure.lambda = info;
        closure.library = this.isLibraryToken(tok);
        info.closure = closure;
        var paramText = suffix.params.map(function (param) { return X.typeString(param.type); }).join(', ');
        closure.displayName = '<lambda(' + paramText + ')>';
        closure.name = closure.displayName;
        info.mutable = mutable;
        // Init-captures are names in the body.
        info.scope = new X.Scope('lambda', this.scope);
        // Explicit captures first: their order is the order of the fields.
        var self = this;
        info.captures.forEach(function (capture) { self.explicitCapture(info, capture); });
        if (info.captureThis)
            this.captureThisPointer(info, tok);
        if (generic)
            return this.genericLambda(info, suffix, tok);
        var returns = suffix.trailing !== null ? suffix.trailing : X.AUTO;
        var params = suffix.params.map(function (param) { return X.parameterType(param.type); });
        var type = X.functionType(returns, params, suffix.variadic, mutable ? 0 : X.CONST, null, suffix.noexcept);
        var call = new X.Function('operator()', type, closure);
        call.isMember = true;
        call.lambda = info;
        call.library = closure.library;
        call.params = suffix.params.map(function (param) {
            return { name: param.name, type: param.type, defaultArg: param.defaultArg, defaultTokens: null,
                     defaultScope: self.scope, line: param.line, column: param.column, file: param.file };
        });
        X.declare(closure, 'operator()', call);
        var bodyStart = this.index;
        if (!this.is('{'))
            this.fail("expected '{'" + this.before());
        var end = this.matching(this.index);
        call.defined = true;
        call.lazy = { tokens: this.tokens, start: bodyStart, end: end, scope: info.scope, library: this.library };
        this.index = end;
        this.session.compileBody(call);
        info.finalized = true;
        this.finishClosure(info, call, tok);
        return this.node('lambda', tok, { info: info });
    };

    // [x], [&x], [y = expr]
    Parser.prototype.explicitCapture = function (info, capture) {
        if (capture.init !== null) {
            // An init-capture: a field initialized from its expression.
            var field = { kind: 'field', name: capture.name, type: null, owner: info.closure, access: 'private',
                          bits: null,
                          offset: 0, initTokens: null };
            var initIr;
            if (capture.init.k === 'copy') {
                var value = this.check(capture.init.expr);
                field.type = capture.mode === 'ref' ? X.lref(value.type) : X.decay(value.type);
                initIr = this.initializeFrom(field.type, value, capture.tok);
            } else {
                var temp = { name: capture.name, type: X.AUTO, storage: 'member' };
                temp.type = this.deduceVariable(X.AUTO, capture.init, capture.tok);
                field.type = temp.type;
                initIr = this.initializeVariable(temp, capture.init, capture.tok);
            }
            if (X.isRef(field.type))
                field.refCapture = true;
            info.closure.dataMembers.push(field);
            info.scope.members[capture.name] = { kind: 'capturefield', name: capture.name, field: field, info: info };
            info.items.push({ field: field, init: initIr });
            capture.field = field;
            capture.initCapture = true;
            return;
        }
        var target = this.lookup(capture.name);
        if (target === null)
            this.error(capture.tok, "'" + capture.name + "' was not declared in this scope");
        if (target.kind === 'parampack') {
            var self = this;
            target.items.forEach(function (item) { self.captureOf(info, item, capture.mode, capture.tok); });
            return;
        }
        if (target.kind !== 'var' || target.storage !== 'local')
            this.error(capture.tok, "capture of variable '" + capture.name + "' with non-automatic storage duration");
        this.captureOf(info, target, capture.mode, capture.tok);
    };

    // The capture of a variable in a lambda (made once): a field of the
    // closure and the initialization of that field from the variable.
    Parser.prototype.captureOf = function (info, object, mode, tok) {
        for (var index = 0; index < info.items.length; ++index) {
            if (info.items[index].variable === object)
                return info.items[index];
        }
        if (info.finalized)
            this.error(tok, "'" + object.name + "' is not captured");
        var type = X.removeRef(object.type);
        var fieldType = mode === 'ref' ? X.pointerTo(type) : unqual(type);
        if (mode !== 'ref' && X.isConst(type) && !info.mutable)
            fieldType = X.qualify(fieldType, X.CONST);
        var field = { kind: 'field', name: '__capture_' + object.name, type: fieldType, owner: info.closure,
                      access: 'private', bits: null, offset: 0, initTokens: null };
        info.closure.dataMembers.push(field);
        // The value in the enclosing context.
        var outer = this.withContext(info.parentContext, function () {
            return this.variableIr(object, tok);
        });
        var init;
        if (mode === 'ref') {
            this.markAddressTaken(outer);
            init = this.ir('addr', tok, { operand: outer, type: X.pointerTo(outer.type), cat: 'prvalue' });
        } else {
            init = this.withContext(info.parentContext, function () {
                return this.initializeFrom(unqual(type), outer, tok);
            });
        }
        var item = { variable: object, field: field, mode: mode, init: init };
        info.items.push(item);
        return item;
    };

    Parser.prototype.withContext = function (context, callback) {
        var saved = this.func;
        this.func = context;
        try {
            return callback.call(this);
        } finally {
            this.func = saved;
        }
    };

    Parser.prototype.captureThisPointer = function (info, tok) {
        if (info.thisField !== null)
            return info.thisField;
        if (info.finalized)
            this.error(tok, "'this' was not captured for this lambda function");
        var outer = this.withContext(info.parentContext, function () { return this.thisPointer(tok); });
        var field = { kind: 'field', name: '__this', type: unqual(outer.type), owner: info.closure, access: 'private',
                      bits: null, offset: 0, initTokens: null };
        info.closure.dataMembers.push(field);
        info.items.push({ field: field, init: outer, isThis: true });
        info.thisField = field;
        return field;
    };

    // The closure object inside operator(): *this of the closure.
    Parser.prototype.closureObject = function (context, node) {
        var cls = context.closureClass;
        var pointer = this.ir('this', node, { type: X.pointerTo(X.qualify(cls, context.thisCv)), cat: 'prvalue' });
        return this.ir('deref', node, { pointer: pointer, type: pointer.type.to, cat: 'lvalue' });
    };

    // A local variable of an enclosing function used in a lambda body.
    Parser.prototype.captureVariable = function (object, node) {
        if (object.constValue !== undefined && X.isConst(object.type) && !object.addressNeeded) {
            var constant = this.constant(object.constValue, unqual(object.type), node);
            return constant;
        }
        return this.captureIn(this.func, object, node);
    };

    Parser.prototype.captureIn = function (context, object, node) {
        if (context === null)
            this.error(node, "use of local variable '" + object.name + "' outside its function");
        if (object.context === context)
            return this.withContext(context, function () {
                return this.ir('var', node, { obj: object, type: X.removeRef(object.type), cat: 'lvalue' });
            });
        var info = context.lambda;
        if (info === null || info === undefined) {
            if (context.defaultInit)
                this.error(node, "use of local variable '" + object.name + "' in a default member initializer");
            this.error(node, "use of local variable with automatic storage from containing function");
        }
        var explicit = info.explicit[object.name];
        var existing = null;
        info.items.forEach(function (item) {
            if (item.variable === object)
                existing = item;
        });
        if (existing === null && explicit !== undefined && explicit.initCapture)
            existing = null;
        var item = existing;
        if (item === null) {
            var mode = explicit !== undefined ? explicit.mode : info.defaultMode;
            if (mode === null || info.finalized)
                this.error(node, "'" + object.name + "' is not captured");
            // A capture in the enclosing lambda first, if there is one.
            var self = this;
            item = this.withContext(context, function () {
                return self.captureOf(info, object, mode, node);
            });
        }
        var closure = this.closureObject(context, node);
        var field = this.fieldIr(closure, item.field, node);
        if (item.mode === 'ref')
            return this.ir('deref', node, { pointer: field, type: X.removeRef(object.type), cat: 'lvalue' });
        return field;
    };

    // this in a lambda: the captured this of the enclosing member function.
    Parser.prototype.capturedThis = function (node) {
        var context = this.func;
        var info = context.lambda;
        if (info.thisField === null) {
            if (info.defaultMode === null || info.finalized)
                this.error(node, "'this' was not captured for this lambda function");
            this.withContext(context, function () { return this.captureThisPointer(info, node); });
        }
        var closure = this.closureObject(context, node);
        return this.fieldIr(closure, info.thisField, node);
    };

    // Completes the closure: its layout, the conversion to a function
    // pointer for a lambda without captures.
    Parser.prototype.finishClosure = function (info, call, tok) {
        var closure = info.closure;
        this.completeClass(closure);
        if (info.items.length === 0 && call !== null) {
            var fnType = X.functionType(call.type.returns, call.type.params, call.type.variadic);
            var invoker = new X.Function('__invoke', fnType, closure);
            invoker.isStatic = true;
            invoker.lambdaTarget = call;
            invoker.defined = true;
            invoker.compiled = true;
            invoker.library = closure.library;
            invoker.params = call.params;
            var conversion = new X.Function('operator ' + X.typeString(X.pointerTo(fnType)),
                                            X.functionType(X.pointerTo(fnType), [], false, X.CONST), closure);
            conversion.isMember = true;
            conversion.lambdaInvoker = invoker;
            conversion.defined = true;
            conversion.compiled = true;
            conversion.library = closure.library;
            closure.conversions.push(conversion);
            X.declare(closure, conversion.name, conversion);
        }
    };

    // A generic lambda: operator() is a member template whose parameters
    // are the autos of the parameter list. Captures come from the names of
    // the body (the body is parsed for each instance).
    Parser.prototype.genericLambda = function (info, suffix, tok) {
        var closure = info.closure;
        var bodyStart = this.index;
        if (!this.is('{'))
            this.fail("expected '{'" + this.before());
        var end = this.matching(this.index);
        this.index = end;
        if (info.defaultMode !== null)
            this.implicitCapturesFromTokens(info, bodyStart, end, tok);
        info.finalized = true;
        this.completeClass(closure);
        var autoCount = 0;
        suffix.params.forEach(function (param) {
            (function count(type) {
                if (unqual(type) === X.AUTO)
                    ++autoCount;
                else if (type.to !== undefined)
                    count(type.to);
            })(param.type);
        });
        var params = [];
        for (var index = 0; index < autoCount; ++index) {
            var packParam = suffix.params.some(function (param) { return param.pack; }) && index === autoCount - 1;
            params.push({ kind: 'type', name: null, pack: packParam, defaultTokens: null, index: index,
                          placeholder: X.templateParam('auto#' + index, index, 'type') });
            params[index].placeholder.pack = packParam;
        }
        var template = { kind: 'template', what: 'function', name: 'operator()', params: params, tokens: null,
                         scope: closure, owner: closure, instances: new Map(), explicit: new Map(), partials: [],
                         outOfClass: [], library: closure.library, id: X.newId(), parent: closure, context: 'class',
                         isMember: true, access: 'public', lambda: info, genericLambda: true,
                         lambdaTokens: { tokens: this.tokens, paramsStart: null, bodyStart: bodyStart, end: end },
                         suffix: suffix, mutable: info.mutable, enclosingScope: info.scope };
        // The pattern: the parameter types with the autos as placeholders.
        var position = 0;
        function replaceAuto(type) {
            if (unqual(type) === X.AUTO)
                return X.qualify(params[position++].placeholder, type.cv || 0);
            if (type.kind === 'lref')
                return X.lref(replaceAuto(type.to));
            if (type.kind === 'rref')
                return X.rref(replaceAuto(type.to));
            if (type.kind === 'pointer')
                return X.pointerTo(replaceAuto(type.to));
            return type;
        }
        var patternParams = suffix.params.map(function (param) { return X.parameterType(replaceAuto(param.type)); });
        template.pattern = X.functionType(suffix.trailing || X.AUTO, patternParams, suffix.variadic);
        template.paramInfo = suffix.params;
        X.declare(closure, 'operator()', template);
        return this.node('lambda', tok, { info: info });
    };

    // operator() of a generic lambda for deduced types: the parameter
    // types with the autos replaced; the body is parsed for this instance.
    Parser.prototype.instantiateGenericLambda = function (template, args, key) {
        var info = template.lambda;
        var closure = info.closure;
        var map = new Map();
        template.params.forEach(function (param, index) { map.set(param.placeholder, args[index]); });
        function substitute(type) {
            if (type.kind === 'tparam' && map.has(type))
                return map.get(type).type;
            if (type.unqualified !== undefined)
                return X.qualify(substitute(type.unqualified), type.cv);
            switch (type.kind) {
            case 'pointer':
                return X.pointerTo(substitute(type.to));
            case 'lref':
                return X.lref(substitute(type.to));
            case 'rref':
                return X.rref(substitute(type.to));
            }
            return type;
        }
        var suffix = template.suffix;
        var types = [];
        var params = [];
        var emptyPacks = [];
        var scope = template.enclosingScope;
        suffix.params.forEach(function (param, index) {
            var pattern = template.pattern.params[index];
            if (param.pack) {
                var packPlaceholder = template.params[template.params.length - 1].placeholder;
                var pack = map.get(packPlaceholder);
                pack.items.forEach(function (item, itemIndex) {
                    var single = new Map(map);
                    single.set(packPlaceholder, item);
                    var saved = map;
                    map = single;
                    var type = substitute(pattern);
                    map = saved;
                    types.push(type);
                    params.push({ name: param.name === null ? null : param.name + '#' + itemIndex, type: type,
                                  packName: param.name, packIndex: itemIndex, defaultArg: null, defaultTokens: null,
                                  defaultScope: scope, line: param.line, column: param.column, file: param.file });
                });
                if (pack.items.length === 0 && param.name !== null)
                    emptyPacks.push(param.name);
                return;
            }
            var type = substitute(pattern);
            types.push(type);
            params.push({ name: param.name, type: type, defaultArg: param.defaultArg, defaultTokens: null,
                          defaultScope: scope, line: param.line, column: param.column, file: param.file });
        });
        if (emptyPacks.length > 0)
            params.emptyPacks = emptyPacks;
        var returns = suffix.trailing !== null ? suffix.trailing : X.AUTO;
        var fnType = X.functionType(returns, types, suffix.variadic, template.mutable ? 0 : X.CONST);
        var func = new X.Function('operator()', fnType, closure);
        func.isMember = true;
        func.lambda = info;
        func.library = closure.library;
        func.params = params;
        func.defined = true;
        func.template = template;
        func.templateArgs = args;
        func.instanceText = X.templateArgsText(args);
        var tokens = template.lambdaTokens;
        func.lazy = { tokens: tokens.tokens, start: tokens.bodyStart, end: tokens.end, scope: scope,
                      library: closure.library };
        template.instances.set(key, func);
        if (X.transaction !== null)
            X.transaction.onRollback(function () { template.instances.delete(key); });
        return func;
    };

    // Names in a generic body that are local variables of enclosing
    // functions are captured by the default mode.
    Parser.prototype.implicitCapturesFromTokens = function (info, start, end, tok) {
        var seen = Object.create(null);
        for (var index = start; index < end; ++index) {
            var current = this.tokens[index];
            if (current.type === 'keyword' && current.value === 'this' && info.thisField === null &&
                this.func !== null && (this.func.thisClass !== null || this.func.lambda !== null)) {
                this.captureThisPointer(info, tok);
                continue;
            }
            if (current.type !== 'ident' || seen[current.value])
                continue;
            var previous = this.tokens[index - 1];
            if (previous && previous.type === 'op' && (previous.value === '.' || previous.value === '->' ||
                                                       previous.value === '::'))
                continue;
            seen[current.value] = true;
            var entity = this.lookup(current.value);
            if (entity === null || entity.kind !== 'var' || entity.storage !== 'local')
                continue;
            if (entity.constValue !== undefined && X.isConst(entity.type))
                continue;
            if (info.explicit[current.value] !== undefined)
                continue;
            if (entity.context === this.func || this.isEnclosingContext(entity.context))
                this.captureOf(info, entity, info.defaultMode, current);
        }
    };

    Parser.prototype.isEnclosingContext = function (context) {
        for (var current = this.func; current !== null; current = current.parent) {
            if (current === context)
                return true;
        }
        return false;
    };

    // The value of a lambda expression: the closure initialized from the
    // captures.
    Parser.prototype.lambdaIr = function (node) {
        var info = node.info;
        var items = info.items.map(function (item) {
            return { field: item.field, offset: null, type: item.field.type, init: item.init };
        });
        return this.ir('aggregate', node, { type: info.closure, items: items, cat: 'prvalue', closure: true });
    };
})(globalThis);
