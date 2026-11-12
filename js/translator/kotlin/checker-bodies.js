// Kotlin: bodies of declarations - functions, properties (initializers,
// accessors, delegates), classes (initialization order, constructors,
// delegation to supertypes, enum entries, abstract members), and the
// types inferred from bodies.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Kt = T.kotlin;
    var Checker = Kt.Checker;
    if (Checker.prototype.checkFunctionBody)
        return;

    // --- Functions

    // The scope of a function: type parameters, parameters, the receiver.
    Checker.prototype.functionScope = function (fn) {
        var outer;
        if (fn.local)
            outer = fn.declScope;
        else if (fn.owner !== null)
            outer = fn.isStatic || fn.owner.kind === 'object' && false ? this.staticScope(fn.owner) : this.classScope(fn.owner);
        else
            outer = fn.signatureScope.parent;
        var scope = outer.child('function', { fn: fn, suspend: !!fn.suspend });
        (fn.typeParams || []).forEach(function (param) { scope.declareTypeParam(param); });
        var self = this;
        fn.paramVars = fn.params.map(function (param) {
            var variable = Kt.VarSym(param.name, param.type, false);
            variable.isParam = true;
            variable.initialized = true;
            variable.param = param;
            self.declareLocal(scope, variable, param.node || fn.node);
            return variable;
        });
        if (fn.receiver !== null) {
            scope.receiver = { type: fn.receiver, kind: 'extension', label: fn.name, fn: fn };
            fn.receiverInfo = scope.receiver;
        }
        return scope;
    };

    // Default values of parameters: in the scope of the earlier parameters.
    Checker.prototype.checkDefaults = function (fn, scope) {
        var self = this;
        fn.params.forEach(function (param) {
            if (param.node !== null && param.node.init !== null && param.node.init !== undefined) {
                var type = self.expr(param.node.init, param.type, scope);
                if (!self.fits(param.node.init, type, param.type))
                    self.mismatch(param.node.init, param.type, type, 'initializer');
            }
        });
    };

    Checker.prototype.checkFunctionBody = function (fn) {
        if (fn.node !== null && (fn.node.body === null || fn.node.body === undefined) && !fn.defaultsChecked) {
            // An abstract function: its default values (an override takes them).
            fn.defaultsChecked = true;
            if (fn.params.some(function (param) { return param.node !== null && param.node.init !== null && param.node.init !== undefined; })) {
                var savedFn = this.fn;
                var savedDefaultFacts = this.facts;
                this.facts = new Map();
                this.fn = null;
                var defaultScope = this.functionScope(fn);
                this.pushFunction({ kind: 'function', sym: fn, returns: fn.returns, label: fn.name, node: fn.node, returnTypes: [],
                                    scope: defaultScope });
                try {
                    this.checkDefaults(fn, defaultScope);
                } finally {
                    this.popFunction();
                    this.fn = savedFn;
                    this.facts = savedDefaultFacts;
                }
            }
        }
        if (fn.bodyChecked || fn.node === null || fn.node.body === null || fn.node.body === undefined)
            return;
        fn.bodyChecked = true;
        var node = fn.node;
        var savedFacts = this.facts;
        this.facts = new Map();
        var scope = this.functionScope(fn);
        var context = this.pushFunction({ kind: 'function', sym: fn, returns: fn.returns, label: fn.name, node: node,
                                          returnTypes: [], scope: scope, suspend: !!fn.suspend });
        fn.context = context;
        this.checkDefaults(fn, scope);
        try {
            if (node.exprBody) {
                var type = this.expr(node.body, fn.returns, scope);
                if (fn.returns !== null && !this.fits(node.body, type, fn.returns))
                    this.mismatch(node.body, fn.returns, type, 'return');
                if (fn.returns === null)
                    fn.returns = this.inferredVariableType(node.body, type);
            } else {
                var bodyType = this.blockValue(node.body, null, scope, false);
                if (!Kt.isClass(fn.returns, 'Unit') && !Kt.isJump(bodyType) && Kt.resolved(fn.returns).kind !== 'nothing')
                    this.error({ line: node.body.endLine || node.line, column: 1 },
                               'missing return statement.');
                if (Kt.resolved(fn.returns).kind === 'nothing' && !Kt.isJump(bodyType))
                    this.error({ line: node.body.endLine || node.line, column: 1 }, 'missing return statement.');
            }
        } finally {
            this.popFunction();
            this.facts = savedFacts;
        }
        if (fn.tailrec)
            fn.tailCalls = true;
    };

    // The type of an expression body (for a function without a return type).
    Checker.prototype.inferFunctionBody = function (fn) {
        var checker = fn.checker || this;
        if (checker !== this)
            return checker.inferFunctionBody(fn);
        var savedFn = this.fn;
        this.fn = null;
        try {
            this.checkFunctionBody(fn);
        } finally {
            this.fn = savedFn;
        }
        return fn.returns;
    };

    // --- Properties

    // The scope of a property initializer: the class (with the primary
    // constructor parameters) or the file.
    Checker.prototype.propertyScope = function (prop) {
        if (prop.owner !== null) {
            var classScope = this.classScope(prop.owner);
            return this.initScope(prop.owner, classScope);
        }
        return prop.signatureScope;
    };

    // The scope of initializers and init blocks: the primary constructor parameters.
    Checker.prototype.initScope = function (sym, classScope) {
        if (sym.initScopeCache !== undefined)
            return sym.initScopeCache;
        var scope = classScope.child('block', { initOf: sym });
        var primary = sym.ctors.filter(function (ctor) { return ctor.primary && !ctor.implicit; })[0];
        var self = this;
        if (primary !== undefined) {
            primary.paramVars = primary.params.map(function (param) {
                var variable = Kt.VarSym(param.name, param.type, false);
                variable.isParam = true;
                variable.initialized = true;
                variable.param = param;
                variable.ctorParam = true;
                self.declareLocal(scope, variable, param.node);
                return variable;
            });
        }
        sym.initScopeCache = scope;
        return scope;
    };

    Checker.prototype.inferPropertyType = function (prop) {
        var checker = prop.checker || this;
        if (checker !== this)
            return checker.inferPropertyType(prop);
        var node = prop.node;
        if (node.init !== null) {
            this.checkPropertyInit(prop);
            return prop.type;
        }
        if (node.delegate !== null) {
            this.checkPropertyDelegate(prop);
            return prop.type;
        }
        if (node.getter !== null && node.getter.exprBody) {
            this.checkAccessors(prop);
            return prop.type;
        }
        this.error(node, 'this property must either have a type annotation, be initialized or be delegated.');
    };

    Checker.prototype.checkPropertyInit = function (prop) {
        if (prop.initChecked)
            return;
        prop.initChecked = true;
        var node = prop.node;
        var savedFn = this.fn;
        var savedFacts = this.facts;
        this.facts = new Map();
        var scope = this.propertyScope(prop);
        this.fn = null;
        this.pushFunction({ kind: 'property', sym: null, returns: null, label: null, node: node, returnTypes: [], scope: scope });
        try {
            var type = this.expr(node.init, prop.type, scope);
            if (prop.type !== null) {
                if (!this.fits(node.init, type, prop.type))
                    this.mismatch(node.init, prop.type, type, 'initializer');
            } else {
                prop.type = this.inferredVariableType(node.init, type);
            }
            if (prop.isConst)
                prop.constValue = this.constantValue(node.init);
        } finally {
            this.popFunction();
            this.fn = savedFn;
            this.facts = savedFacts;
        }
    };

    // The value of a constant expression (const val): a number, a string, a boolean or undefined.
    Checker.prototype.constantValue = function (node) {
        while (node.k === 'paren')
            node = node.expr;
        switch (node.k) {
        case 'int':
            return { kind: 'int', value: this.integerValue(node), type: node.type };
        case 'float':
            return { kind: 'float', value: node.value, type: node.type };
        case 'char':
            return { kind: 'char', value: node.value, type: node.type };
        case 'bool':
            return { kind: 'bool', value: node.value, type: node.type };
        case 'string':
            if (node.parts.every(function (part) { return part.kind === 'text'; }))
                return { kind: 'string', value: node.parts.map(function (part) { return part.value; }).join(''), type: node.type };
            return undefined;
        case 'prefix': {
            var inner = this.constantValue(node.arg);
            if (inner !== undefined && node.op === '-' && inner.kind === 'int')
                return { kind: 'int', value: T.big.neg(inner.value), type: node.type };
            if (inner !== undefined && node.op === '-' && inner.kind === 'float')
                return { kind: 'float', value: -inner.value, type: node.type };
            return undefined;
        }
        case 'binary': {
            // -9223372036854775807L - 1L: integer arithmetic wraps as at run time.
            var kind = node.type !== undefined ? Kt.primKind(node.type) : null;
            var bits = { i32: 32, i64: 64 }[kind];
            var operation = { '+': 'add', '-': 'sub', '*': 'mul' }[node.op];
            if (bits === undefined || operation === undefined)
                return undefined;
            var left = this.constantValue(node.left), right = this.constantValue(node.right);
            if (left === undefined || right === undefined || left.kind !== 'int' || right.kind !== 'int')
                return undefined;
            var value = T.big[operation](left.value, right.value);
            var range = T.big.parse(bits === 32 ? '4294967296' : '18446744073709551616', 10);
            var min = Kt.integerLimits()[kind][0];
            value = T.big.add(T.big.mod(T.big.sub(value, min), range), min);
            return { kind: 'int', value: value, type: node.type };
        }
        }
        return undefined;
    };

    Checker.prototype.checkPropertyDelegate = function (prop) {
        if (prop.delegateChecked)
            return;
        prop.delegateChecked = true;
        var node = prop.node;
        var savedFn = this.fn;
        var savedFacts = this.facts;
        this.facts = new Map();
        var scope = this.propertyScope(prop);
        this.fn = null;
        this.pushFunction({ kind: 'property', sym: null, returns: null, label: null, node: node, returnTypes: [], scope: scope });
        try {
            var delegateType = this.expr(node.delegate, null, scope);
            var thisType = prop.owner !== null ? prop.owner.thisType() : Kt.NULL_TYPE;
            var thisArg = { k: 'delegateArg', type: prop.owner !== null ? thisType : Kt.NULL_TYPE, line: node.line, column: node.column };
            var propertyArg = { k: 'delegateArg', type: Kt.builtinType('KProperty', [Kt.STAR]), line: node.line, column: node.column };
            var getter = this.operatorCall(node.delegate, 'getValue', node.delegate, delegateType, [thisArg, propertyArg], scope, prop.type);
            node.delegateGet = getter;
            if (prop.type === null)
                prop.type = getter.type;
            else if (!Kt.isSubtype(getter.type, prop.type))
                this.mismatch(node.delegate, prop.type, getter.type, 'initializer');
            if (prop.mutable) {
                var valueArg = { k: 'delegateArg', type: prop.type, line: node.line, column: node.column };
                node.delegateSet = this.operatorCall(node.delegate, 'setValue', node.delegate, delegateType,
                                                     [thisArg, propertyArg, valueArg], scope, null);
            }
        } finally {
            this.popFunction();
            this.fn = savedFn;
            this.facts = savedFacts;
        }
    };

    // get() and set(value) bodies; field is the backing field.
    Checker.prototype.checkAccessors = function (prop) {
        if (prop.accessorsChecked)
            return;
        prop.accessorsChecked = true;
        var node = prop.node;
        var self = this;
        var outer;
        if (prop.owner !== null)
            outer = this.classScope(prop.owner);
        else
            outer = prop.signatureScope;
        [node.getter, node.setter].forEach(function (accessor) {
            if (accessor === null || accessor.body === null)
                return;
            var savedFn = self.fn;
            var savedFacts = self.facts;
            self.facts = new Map();
            self.fn = null;
            var scope = outer.child('function', { accessorOf: prop, fn: null });
            (prop.typeParams || []).forEach(function (param) { scope.declareTypeParam(param); });
            if (prop.receiver !== null)
                scope.receiver = { type: prop.receiver, kind: 'extension', label: prop.name };
            accessor.receiverInfo = scope.receiver;
            var isGetter = accessor.k === 'getter';
            var returns = isGetter ? prop.type : Kt.unitType();
            if (!isGetter) {
                var type = accessor.paramType !== null ? self.resolveType(accessor.paramType, scope) : self.propertyType(prop);
                var variable = Kt.VarSym(accessor.param, type, false);
                variable.isParam = true;
                variable.initialized = true;
                self.declareLocal(scope, variable, accessor);
                accessor.paramVar = variable;
            }
            var context = self.pushFunction({ kind: 'function', sym: null, returns: returns, label: isGetter ? 'get' : 'set',
                                              node: accessor, returnTypes: [], scope: scope });
            try {
                if (accessor.exprBody) {
                    var valueType = self.expr(accessor.body, returns, scope);
                    if (isGetter && prop.type === null)
                        prop.type = valueType;
                    else if (isGetter && !self.fits(accessor.body, valueType, prop.type))
                        self.mismatch(accessor.body, prop.type, valueType, 'return');
                } else {
                    var bodyType = self.blockValue(accessor.body, null, scope, false);
                    if (isGetter && !Kt.isJump(bodyType))
                        self.error({ line: accessor.body.endLine || accessor.line, column: 1 }, 'missing return statement.');
                }
            } finally {
                self.popFunction();
                self.fn = savedFn;
                self.facts = savedFacts;
            }
            void context;
        });
    };

    // A top-level or member property: initializer, delegate, accessors.
    Checker.prototype.checkProperty = function (prop) {
        var node = prop.node;
        if (node === null)
            return;
        if (node.init !== null)
            this.checkPropertyInit(prop);
        if (node.delegate !== null)
            this.checkPropertyDelegate(prop);
        this.propertyType(prop);
        this.checkAccessors(prop);
        if (prop.isConst) {
            var constType = Kt.resolved(prop.type);
            if (!(Kt.isPrimitive(constType) || Kt.isClass(constType, 'String')))
                this.error(node, 'const \'val\' has type \'' + Kt.typeString(constType) + '\'. Only primitive types and String are allowed.');
            if (prop.constValue === undefined && node.init !== null)
                prop.constValue = this.constantValue(node.init);
        }
        if (prop.owner === null && node.init === null && !prop.customGetter && node.delegate === null && !prop.lateinit &&
            !prop.isAbstract && !prop.mods.external && prop.owner === null && !prop.library)
            this.error(node, 'property must be initialized.');
    };

    // --- Classes

    // The bodies of a class: initializers, init blocks, constructors,
    // functions, nested classes; then the checks of the class.
    Checker.prototype.checkClassBody = function (sym) {
        if (sym.bodyChecked)
            return;
        sym.bodyChecked = true;
        sym.complete();
        sym.checker = this;
        var self = this;
        var node = sym.node;
        var classScope = this.classScope(sym);
        var initScope = this.initScope(sym, classScope);
        var savedFn = this.fn;
        var savedFacts = this.facts;
        this.facts = new Map();
        // The supertype list: constructor arguments and delegates.
        var initContext = this.pushFunction({ kind: 'init', sym: null, returns: null, label: null, node: node, returnTypes: [],
                                              scope: initScope });
        sym.initContext = initContext;
        try {
            node.supers.forEach(function (spec) {
                if (spec.args !== null && spec.args !== undefined) {
                    spec.superCall = self.superConstructorCall(sym, spec.resolved, spec.args, spec, initScope);
                }
                if (spec.delegate !== null) {
                    var delegateType = self.expr(spec.delegate, spec.resolved, initScope);
                    if (!Kt.isSubtype(delegateType, spec.resolved))
                        self.mismatch(spec.delegate, spec.resolved, delegateType, 'initializer');
                    sym.delegates = (sym.delegates || []).concat([{ type: spec.resolved, node: spec.delegate }]);
                }
            });
            // Enum entries: constructor calls.
            if (sym.kind === 'enum') {
                node.entries.forEach(function (entry) {
                    var call = { name: '<init>', node: entry, actuals: entry.args.map(function (arg) {
                        return { name: arg.name, spread: arg.spread, value: arg.value, line: arg.line, column: arg.column };
                    }), typeArgs: null, scope: self.staticScope(sym), expected: null, inEnum: true, endLine: entry.line };
                    var levels = [self.constructorsOf(sym).map(function (ctor) { return { member: ctor, map: new Map() }; })];
                    var result = self.resolveWithLevels(call, levels);
                    entry.call = result;
                    if (entry.sym !== undefined) {
                        entry.sym.complete();
                        self.checkClassBody(entry.sym);
                    }
                });
            }
            // Members in order: property initializers and init blocks run in the order of declaration.
            node.members.forEach(function (member) {
                if (member.k === 'property' && member.sym !== undefined)
                    self.checkProperty(member.sym);
                else if (member.k === 'init')
                    self.blockValue(member.body, null, initScope.child('block'), false);
            });
        } finally {
            this.popFunction();
            this.fn = savedFn;
            this.facts = savedFacts;
        }
        // Primary constructor parameters' defaults.
        sym.ctors.forEach(function (ctor) {
            if (ctor.primary && !ctor.implicit) {
                self.fn = null;
                self.pushFunction({ kind: 'init', sym: null, returns: null, label: null, node: node, returnTypes: [], scope: initScope });
                self.checkDefaults(ctor, self.classScope(sym).child('block'));
                self.popFunction();
                self.fn = savedFn;
            }
            if (!ctor.primary)
                self.checkSecondaryConstructor(sym, ctor);
        });
        Object.keys(sym.members).forEach(function (name) {
            sym.members[name].forEach(function (member) {
                if (member.kind === 'fun' && member.node !== null && !member.synthetic)
                    self.checkFunctionBody(member);
                if (member.kind === 'prop' && member.node !== null && member.node.k === 'property' && member.node.init === null &&
                    member.node.delegate === null)
                    self.checkProperty(member);
            });
        });
        Object.keys(sym.nested).forEach(function (name) {
            var nested = sym.nested[name];
            nested.complete();
            self.checkClassBody(nested);
        });
        this.checkClassRules(sym);
    };

    // The arguments of Base(args) in the supertype list.
    Checker.prototype.superConstructorCall = function (sym, superType, args, spec, scope) {
        var superSym = superType.sym;
        superSym.complete();
        var call = { name: '<init>', node: spec, actuals: args.map(function (arg) {
            return { name: arg.name, spread: arg.spread, value: arg.value, line: arg.line, column: arg.column };
        }), typeArgs: null, scope: scope, expected: null, endLine: spec.line, superConstructor: true };
        // The type arguments of the supertype are in the map of the candidates.
        var levels = [this.constructorsOf(superSym).map(function (ctor) {
            return { member: ctor, map: Kt.typeMap(superType) };
        })];
        var result = this.resolveWithLevels(call, levels);
        result.ctorOf = superSym;
        void sym;
        return result;
    };

    Checker.prototype.checkSecondaryConstructor = function (sym, ctor) {
        var node = ctor.node;
        var self = this;
        var savedFn = this.fn;
        var savedFacts = this.facts;
        this.facts = new Map();
        this.fn = null;
        var classScope = this.classScope(sym);
        var scope = classScope.child('function', { fn: ctor, initOf: sym });
        ctor.paramVars = ctor.params.map(function (param) {
            var variable = Kt.VarSym(param.name, param.type, false);
            variable.isParam = true;
            variable.initialized = true;
            variable.param = param;
            self.declareLocal(scope, variable, param.node);
            return variable;
        });
        this.pushFunction({ kind: 'function', sym: ctor, returns: Kt.unitType(), label: null, node: node, returnTypes: [], scope: scope });
        try {
            this.checkDefaults(ctor, scope);
            var primary = sym.ctors.filter(function (other) { return other.primary && !other.implicit; })[0];
            if (node.delegation !== null) {
                var delegation = node.delegation;
                var targetSym = delegation.kind === 'this' ? sym : (sym.superclass !== null ? sym.superclass.sym : Kt.builtins.Any);
                var targetType = delegation.kind === 'this' ? sym.thisType() : sym.superclass;
                var call = { name: '<init>', node: delegation, actuals: delegation.args.map(function (arg) {
                    return { name: arg.name, spread: arg.spread, value: arg.value, line: arg.line, column: arg.column };
                }), typeArgs: null, scope: scope, expected: null, endLine: delegation.line };
                var levels = [this.constructorsOf(targetSym).filter(function (other) { return other !== ctor; }).map(function (other) {
                    return { member: other, map: targetType !== null ? Kt.typeMap(targetType) : new Map() };
                })];
                delegation.call = this.resolveWithLevels(call, levels);
                delegation.call.ctorOf = targetSym;
            } else if (primary !== undefined) {
                this.error(node, 'primary constructor call expected.');
            } else if (sym.superclass !== null && sym.superclass.sym !== Kt.builtins.Any) {
                // An implicit super(): the superclass must have a constructor without arguments.
                var superSym = sym.superclass.sym;
                var noArgs = this.constructorsOf(superSym).filter(function (other) {
                    return other.params.every(function (param) { return param.hasDefault || param.vararg; });
                });
                if (noArgs.length === 0 && sym.node.supers.some(function (spec) { return spec.isClass && spec.args === null; }))
                    void 0;
                ctor.implicitSuper = noArgs[0] || null;
            }
            if (node.body !== null)
                this.blockValue(node.body, null, scope, false);
        } finally {
            this.popFunction();
            this.fn = savedFn;
            this.facts = savedFacts;
        }
    };

    // A concrete class implements all abstract members; overrides fit.
    Checker.prototype.checkClassRules = function (sym) {
        var self = this;
        if (sym.isInterface() || sym.mods.abstract || sym.mods.sealed || sym.kind === 'enum' && this.enumHasAbstract(sym))
            return;
        if (sym.java !== null && sym.java !== undefined)
            return;
        var missing = this.abstractMembers(sym);
        if (missing.length > 0) {
            var first = missing[0];
            var what = sym.kind === 'object' ? (sym.anonymous ? 'object' : 'object \'' + sym.name + '\'')
                                             : 'class \'' + sym.name + '\'';
            this.error(sym.node, (sym.anonymous ? 'object' : what) + ' is not abstract and does not implement abstract member \'' +
                       first.name + '\'.');
        }
        void self;
    };

    Checker.prototype.enumHasAbstract = function (sym) {
        return Object.keys(sym.members).some(function (name) {
            return sym.members[name].some(function (member) { return member.isAbstract; });
        });
    };

    // The abstract members of the supertypes that the class does not implement.
    Checker.prototype.abstractMembers = function (sym) {
        var self = this;
        var missing = [];
        var closure = Kt.supertypeClosure(sym.thisType()).slice(1);
        var implemented = function (member, map) {
            var found = self.membersOf(sym.thisType(), member.name);
            return found.some(function (item) {
                if (item.member === member)
                    return false;
                if (item.member.isAbstract)
                    return false;
                if (member.kind === 'fun')
                    return item.member.kind === 'fun' && Kt.sameSignature(item.member, member, map, item.map);
                return item.member.kind === 'prop' || (item.member.kind === 'fun' && item.member.params.length === 0);
            }) || (sym.delegates || []).some(function (delegate) {
                return Kt.asSuper(delegate.type, member.owner) !== null;
            });
        };
        closure.forEach(function (type) {
            var owner = type.sym;
            if (owner.java !== null && owner.java !== undefined && !owner.mappedBuiltin) {
                // Abstract methods of Java interfaces and classes.
                var javaSym = owner.java;
                javaSym.complete();
                Object.keys(javaSym.methods).forEach(function (name) {
                    javaSym.methods[name].forEach(function (method) {
                        if (!method.isAbstract || method.isStatic)
                            return;
                        var members = Kt.javaMembers(owner, name, false).filter(function (member) {
                            return member.kind === 'fun' && member.java === method;
                        });
                        members.forEach(function (member) {
                            if (!implemented(member, Kt.typeMap(type)) && !self.objectMethod(name, member) &&
                                !self.kotlinImplements(sym, member))
                                missing.push(member);
                        });
                    });
                });
                return;
            }
            Object.keys(owner.members).forEach(function (name) {
                owner.members[name].forEach(function (member) {
                    if (member.isAbstract && !implemented(member, Kt.typeMap(type)))
                        missing.push(member);
                });
            });
        });
        return missing;
    };

    // equals, hashCode, toString of an interface are implemented by Any.
    Checker.prototype.objectMethod = function (name, member) {
        return (name === 'equals' && member.params.length === 1) || (name === 'hashCode' && member.params.length === 0) ||
            (name === 'toString' && member.params.length === 0);
    };

    // A Java abstract method implemented by a Kotlin property or a function with its JavaScript name.
    Checker.prototype.kotlinImplements = function (sym, member) {
        var found = false;
        Kt.supertypeClosure(sym.thisType()).forEach(function (type) {
            var owner = type.sym;
            Object.keys(owner.members).forEach(function (name) {
                owner.members[name].forEach(function (candidate) {
                    if (candidate.isAbstract)
                        return;
                    if ((candidate.kind === 'fun' && candidate.jsName === member.jsName) ||
                        (candidate.kind === 'prop' && candidate.getterName === member.jsName))
                        found = true;
                });
            });
        });
        return found;
    };
})(globalThis);
