// Go: checking a whole file (a unit or a package) - the order of
// declarations, top-level statements, function bodies, which functions are
// fibers.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Go = T.go;
    var Checker = Go.Checker;
    if (Checker.prototype.checkFile)
        return;

    var G = Go.T;
    var Scope = Go.Scope;
    var FunctionInfo = Go.FunctionInfo;

    // A package: declarations (scope), the run-time object (runtime:
    // variables and functions by JavaScript names), a name for messages and %T.
    function Package(name, path, source) {
        this.name = name;
        this.path = path;
        this.source = source || '';
        this.scope = new Scope(Go.universe, 'package');
        this.runtime = {};
        this.initCounter = 0;
        this.natives = null;
    }
    Go.Package = Package;

    // Checks a file. For a unit (script = true) the top-level declarations
    // go into the package only after the check succeeds.
    Checker.prototype.checkFile = function (file, options) {
        var self = this;
        options = options || {};
        this.blockId = options.blockId || '';
        this.fileScope = new Scope(this.pkg.scope, 'file');
        // The declarations of this file: a separate layer over the package.
        this.blockScope = new Scope(this.fileScope, 'block-top');
        this.scope = this.blockScope;
        file.imports.forEach(function (spec) {
            var pkg = self.session.importPackage(spec.path, spec, self.source);
            var name = spec.name !== null ? spec.name : pkg.name;
            if (name === '.')
                self.error(spec, 'dot imports are not supported');
            if (name === '_')
                return;
            self.fileScope.insert({ kind: 'pkgname', name: name, pkg: pkg, line: spec.line });
        });

        var items = file.items;
        // 1. Types - all at once (they may refer to each other).
        var typeSpecs = [];
        items.forEach(function (item) {
            if (item.k === 'type')
                typeSpecs = typeSpecs.concat(item.specs);
        });
        this.typeDeclarations(typeSpecs, true);
        // 2. Top-level constants - in order.
        items.forEach(function (item) {
            if (item.k === 'const')
                item.specs.forEach(function (spec) { self.constSpec(spec); });
        });
        // 3. Functions and methods: signatures.
        items.forEach(function (item) {
            if (item.k === 'func')
                self.declareFunction(item);
        });
        // 4. Top-level variables and statements - the body of an implicit main.
        var top = new FunctionInfo(null, G.signature([], [], false), file, 'top level');
        top.topLevel = true;
        this.top = top;
        this.functions.push(top);
        this.func = top;
        var statements = [];
        items.forEach(function (item) {
            if (item.k === 'var' || (item.k !== 'func' && item.k !== 'type' && item.k !== 'const'))
                statements.push(item);
        });
        if (options.script && statements.length > 0) {
            var last = statements[statements.length - 1];
            if (last.k === 'exprstmt')
                this.allowValue = last;
        }
        statements.forEach(function (item) {
            if (item.k === 'var') {
                item.specs.forEach(function (spec) { self.varSpec(spec, true); });
            } else {
                if (!options.script)
                    self.error(item, 'non-declaration statement outside function body');
                self.statement(item, false);
            }
        });
        file.valueStatement = this.allowValue && this.allowValue.x && this.allowValue.x.mode !== 'novalue' &&
            !(this.allowValue.x.type && this.allowValue.x.type.kind === 'tuple') ? this.allowValue : null;
        this.func = null;
        // 5. The bodies of functions and methods (they see all variables of the unit).
        items.forEach(function (item) {
            if (item.k === 'func')
                self.functionDeclarationBody(item);
        });
        this.checkPendingInstances();
        file.top = top;
        file.functions = this.functions;
        this.markAsync();
    };

    // A function is a fiber (a generator) if it waits for a channel, select,
    // time or calls such a function directly. Calls of function values are
    // decided at run time.
    Checker.prototype.markAsync = function () {
        var functions = this.functions;
        var changed = true;
        functions.forEach(function (info) {
            info.async = info.blocking || (info.object && info.object.nativeAsync) || false;
        });
        while (changed) {
            changed = false;
            functions.forEach(function (info) {
                if (info.async)
                    return;
                var calls = info.calls;
                for (var index = 0; index < calls.length; ++index) {
                    var callee = calls[index];
                    var async = callee.info !== undefined ? callee.info.async : callee.async || callee.nativeAsync;
                    if (async) {
                        info.async = true;
                        changed = true;
                        return;
                    }
                }
            });
        }
        functions.forEach(function (info) {
            if (info.object)
                info.object.async = info.async;
        });
    };

    // The check succeeded: the declarations of the unit become those of the package.
    Checker.prototype.commit = function () {
        var names = this.blockScope.names;
        var scope = this.pkg.scope;
        Object.keys(names).forEach(function (name) {
            var object = names[name];
            object.fromPackage = true;
            scope.insert(object);
        });
    };

    Checker.prototype.rollback = function () {
        for (var index = this.undo.length - 1; index >= 0; --index)
            this.undo[index]();
        this.undo = [];
    };

    // --- Generics (monomorphization: an instance per set of types)

    Checker.prototype.declareGenericFunction = function (decl) {
        var object = { kind: 'func', name: decl.name, generic: true, decl: decl, pkg: this.pkg, instances: {},
                       declScope: this.scope, source: this.source, line: decl.line, type: null };
        // A signature with type parameters - for type inference from the arguments.
        var scope = this.genericScope(decl.typeParams, this.scope, null);
        var saved = this.scope;
        this.scope = scope;
        object.typeParams = scope.params;
        object.type = this.signatureType(decl.signature, null);
        this.scope = saved;
        decl.object = object;
        this.declare(object, decl);
    };

    // A scope with type parameters: name -> parameter (or a ready type).
    Checker.prototype.genericScope = function (params, parent, bindings) {
        var scope = new Scope(parent, 'generic');
        var self = this;
        scope.params = [];
        params.forEach(function (param, index) {
            var type;
            if (bindings !== null) {
                type = bindings[index];
            } else {
                type = { kind: 'typeparam', name: param.name, constraint: null, index: index, core: null };
                scope.params.push(type);
            }
            scope.insert({ kind: 'typename', name: param.name, type: type });
        });
        if (bindings === null) {
            var saved = this.scope;
            this.scope = scope;
            params.forEach(function (param, index) {
                var constraint;
                if (param.constraint.k === 'union') {
                    var terms = param.constraint.terms.map(function (term) {
                        return { tilde: term.tilde, type: self.typeExpr(term.type) };
                    });
                    constraint = G.iface([], []);
                    constraint.terms = terms;
                } else {
                    constraint = self.typeExpr(param.constraint);
                }
                var typeParam = scope.params[index];
                typeParam.constraint = constraint;
                // The core type of the set (if there is one) - for operations.
                var termList = G.typeTerms(constraint);
                if (termList !== null && termList.length > 0) {
                    var core = G.underlying(termList[0].type);
                    if (termList.every(function (term) { return G.identical(G.underlying(term.type), core); }))
                        typeParam.core = core;
                }
            });
            this.scope = saved;
        }
        return scope;
    };

    Checker.prototype.declareGenericType = function (spec) {
        var object = { kind: 'typename', name: spec.name, generic: true, spec: spec, pkg: this.pkg, instances: {},
                       declScope: this.scope, source: this.source, methods: [], line: spec.line, type: null };
        object.type = { kind: 'generic', name: spec.name, object: object };
        var scope = this.genericScope(spec.typeParams, this.scope, null);
        object.typeParams = scope.params;
        spec.object = object;
        this.declare(object, spec);
    };

    Checker.prototype.declareGenericMethod = function (decl, receiverNode, pointerReceiver) {
        var base = receiverNode.x;
        if (base.k !== 'ident')
            this.error(decl, 'invalid receiver type');
        var object = this.scope.lookup(base.name);
        if (object === null || !object.generic || object.kind !== 'typename')
            this.error(base, 'undefined: ' + base.name);
        var params = (receiverNode.args || receiverNode.indices).map(function (arg) {
            if (arg.k !== 'ident')
                throw new T.CompileError('receiver type parameter must be an identifier', arg.line, arg.column);
            return arg.name;
        });
        object.methods.push({ decl: decl, params: params, pointerReceiver: pointerReceiver });
        decl.object = { generic: true };
        // Instances created already get the method at once.
        var self = this;
        Object.keys(object.instances).forEach(function (key) {
            self.instantiateMethod(object, object.instances[key], object.methods[object.methods.length - 1]);
        });
    };

    function typeKey(type) {
        if (type.kind === 'named')
            return type.name + '#' + type.id + (type.typeArgs ? '[' + type.typeArgs.map(typeKey).join(',') + ']' : '');
        return G.typeString(type);
    }

    function mangle(types) {
        return types.map(function (type) {
            return G.typeString(type, false).replace(/[^A-Za-z0-9_\u0080-￿]+/g, '_');
        }).join('$');
    }

    // Checks that a type satisfies a constraint.
    Checker.prototype.satisfies = function (node, type, constraint) {
        if (constraint === null)
            return;
        var underlyingType = G.underlying(constraint);
        if (underlyingType.kind !== 'interface')
            return;
        var terms = G.typeTerms(constraint);
        if (terms !== null) {
            var ok = terms.some(function (term) {
                return term.tilde ? G.identical(G.underlying(type), G.underlying(term.type)) : G.identical(type, term.type);
            });
            if (!ok)
                this.error(node, this.typeName(type) + ' does not satisfy ' + this.typeName(constraint) + ' (' +
                           this.typeName(type) + ' missing in ' + terms.map(function (term) {
                               return (term.tilde ? '~' : '') + G.typeString(term.type);
                           }).join(' | ') + ')');
        }
        if (G.isComparableConstraint(constraint) && !G.comparable(type))
            this.error(node, this.typeName(type) + ' does not satisfy comparable');
        if (G.interfaceMethods(constraint).length > 0) {
            var missing = G.missingMethod(type, constraint);
            if (missing !== null)
                this.error(node, this.typeName(type) + ' does not satisfy ' + this.typeName(constraint) + ' (missing method ' +
                           missing.name + ')');
        }
    };

    // The constraints of parameters with the arguments substituted (~[]E
    // with E = int is ~[]int): checked when all arguments are known.
    Checker.prototype.checkConstraints = function (params, declScope, typeArgs, node) {
        var self = this;
        var scope = this.genericScope(params, declScope, typeArgs);
        var saved = this.scope;
        this.scope = scope;
        try {
            params.forEach(function (param, index) {
                if (G.isTypeParam(typeArgs[index]))
                    return;
                var constraint;
                if (param.constraint.k === 'union') {
                    constraint = G.iface([], []);
                    constraint.terms = param.constraint.terms.map(function (term) {
                        return { tilde: term.tilde, type: self.typeExpr(term.type) };
                    });
                } else {
                    constraint = self.typeExpr(param.constraint);
                }
                self.satisfies(node, typeArgs[index], constraint);
            });
        } finally {
            this.scope = saved;
        }
    };

    // An instance of a generic function for the types typeArgs.
    Checker.prototype.instantiateFunction = function (generic, typeArgs, node) {
        var self = this;
        this.checkConstraints(generic.decl.typeParams, generic.declScope, typeArgs, node);
        var key = typeArgs.map(typeKey).join(',');
        var existing = generic.instances[key];
        if (existing !== undefined)
            return existing;
        var decl = Go.cloneNode(generic.decl);
        var scope = this.genericScope(generic.decl.typeParams, generic.declScope, typeArgs);
        var saved = this.scope;
        this.scope = scope;
        var signature = this.signatureType(decl.signature, null);
        this.scope = saved;
        var instance = { kind: 'func', name: generic.name, type: signature, pkg: generic.pkg, decl: decl,
                         jsName: T.propertyName(generic.name) + '$' + mangle(typeArgs), async: false, line: generic.line,
                         instanceOf: generic, typeArgs: typeArgs };
        decl.object = instance;
        generic.instances[key] = instance;
        this.pendingInstances = this.pendingInstances || [];
        this.pendingInstances.push({ instance: instance, scope: scope, generic: generic });
        return instance;
    };

    // The bodies of instances are checked after the current function.
    Checker.prototype.checkPendingInstances = function () {
        while (this.pendingInstances && this.pendingInstances.length > 0) {
            var item = this.pendingInstances.shift();
            var checker = this;
            if (item.generic.pkg !== this.pkg) {
                checker = new Checker(this.session, item.generic.pkg);
                checker.source = item.generic.source;
                checker.fileScope = new Scope(item.generic.pkg.scope, 'file');
                checker.blockScope = checker.fileScope;
            }
            var savedScope = checker.scope;
            var savedSource = checker.source;
            checker.scope = item.scope;
            checker.source = item.generic.source || checker.source;
            var decl = item.instance.decl;
            var info = new FunctionInfo(null, item.instance.type, decl, decl.name);
            info.object = item.instance;
            item.instance.info = info;
            decl.info = info;
            var receiver = item.receiver || null;
            checker.functionBody(info, decl.signature, receiver, decl.body);
            checker.scope = savedScope;
            checker.source = savedSource;
            if (checker !== this) {
                checker.checkPendingInstances();
                this.functions = this.functions.concat(checker.functions);
                this.instances = this.instances.concat(checker.instances);
            }
            this.instances.push(item.instance);
        }
    };

    // An instance of a generic type: a named type with the arguments
    // substituted and its own methods.
    Checker.prototype.instantiateTypeObject = function (generic, typeArgs, node) {
        var self = this;
        if (typeArgs.length !== generic.typeParams.length)
            this.error(node, 'got ' + typeArgs.length + ' type arguments but ' + generic.name + ' has ' +
                       generic.typeParams.length + ' type parameters');
        var key = typeArgs.map(typeKey).join(',');
        var existing = generic.instances[key];
        if (existing !== undefined)
            return existing;
        this.checkConstraints(generic.spec.typeParams, generic.declScope, typeArgs, node);
        var named = G.named(generic.name, generic.pkg.name, null);
        named.typeArgs = typeArgs;
        named.origin = generic;
        generic.instances[key] = named;
        var scope = this.genericScope(generic.spec.typeParams, generic.declScope, typeArgs);
        var saved = this.scope;
        this.scope = scope;
        var spec = Go.cloneNode(generic.spec.type);
        var underlyingType = this.typeExpr(spec);
        named.underlying = underlyingType.kind === 'named' ? underlyingType.underlying : underlyingType;
        this.scope = saved;
        named.instanceScope = scope;
        if (!typeArgs.some(G.isTypeParam))
            generic.methods.forEach(function (method) { self.instantiateMethod(generic, named, method); });
        return named;
    };

    Checker.prototype.instantiateMethod = function (generic, named, method) {
        var decl = Go.cloneNode(method.decl);
        // The type parameters of the receiver may have other names than those of the type.
        var scope = new Scope(generic.declScope, 'generic');
        method.params.forEach(function (name, index) {
            scope.insert({ kind: 'typename', name: name, type: named.typeArgs[index] });
        });
        var saved = this.scope;
        this.scope = scope;
        var signature = this.signatureType(decl.signature, null);
        this.scope = saved;
        var object = { kind: 'func', name: decl.name, type: signature, pkg: generic.pkg, decl: decl, recv: named,
                       pointerReceiver: method.pointerReceiver, jsName: T.propertyName(decl.name), line: decl.line,
                       async: false, method: true, instanceMethod: true };
        decl.object = object;
        decl.receiverType = method.pointerReceiver ? G.pointer(named) : named;
        named.methods.push(object);
        this.pendingInstances = this.pendingInstances || [];
        this.pendingInstances.push({
            instance: object, scope: scope, generic: generic,
            receiver: { name: decl.receiver.name, type: decl.receiverType, node: decl.receiver }
        });
    };

    // T[int] in a type expression.
    Checker.prototype.instantiateType = function (node) {
        var base = node.x;
        var object = null;
        if (base.k === 'ident') {
            object = this.scope.lookup(base.name);
        } else if (base.k === 'sel' && base.x.k === 'ident') {
            var pkgObject = this.lookupPackage(base.x);
            if (pkgObject !== null)
                object = pkgObject.pkg.scope.lookupLocal(base.name);
        }
        if (object === null || object.kind !== 'typename' || !object.generic)
            this.error(node, exprStringOf(base) + ' is not a generic type');
        var self = this;
        var args = (node.args || node.indices).map(function (arg) { return self.typeExpr(arg); });
        return this.instantiateTypeObject(object, args, node);
    };

    function exprStringOf(node) {
        return Go.exprString(node);
    }

    // f[int] or List[int] in an expression.
    Checker.prototype.instantiateExpr = function (node) {
        var self = this;
        var base = node.x;
        if (base.mode === 'type' && base.generic) {
            node.mode = 'type';
            node.type = this.instantiateTypeObject(base.generic, node.indices.map(function (arg) { return self.typeExpr(arg); }), node);
            return node;
        }
        if (!base.generic)
            this.error(node, 'invalid operation: cannot index ' + this.describe(base));
        var generic = base.generic;
        var args = node.indices.map(function (arg) { return self.typeExpr(arg); });
        if (args.length > generic.typeParams.length)
            this.error(node, 'got ' + args.length + ' type arguments but ' + generic.name + ' has ' +
                       generic.typeParams.length + ' type parameters');
        if (args.length < generic.typeParams.length) {
            node.partialTypeArgs = args;
            node.generic = generic;
            node.mode = 'value';
            node.type = generic.type;
            return node;
        }
        var instance = this.instantiateFunction(generic, args, node);
        node.instance = instance;
        node.mode = 'value';
        node.type = instance.type;
        node.obj = instance;
        this.noteCall(instance);
        return node;
    };

    // Infers type arguments from the arguments of a call.
    Checker.prototype.instantiateCall = function (node) {
        var fn = node.fn;
        var generic = fn.generic;
        if (generic.kind === 'typename')
            return;
        var self = this;
        var bindings = [];
        if (fn.partialTypeArgs)
            fn.partialTypeArgs.forEach(function (type, index) { bindings[index] = type; });
        var params = generic.type.params;
        var untypedArgs = [];
        node.args.forEach(function (arg, index) {
            var param = index < params.length ? params[index] : params[params.length - 1];
            if (param === undefined)
                return;
            var paramType = param.type;
            if (generic.type.variadic && index >= params.length - 1 && !node.ellipsis)
                paramType = paramType.elem;
            self.expr(arg, undefined);
            if (arg.mode === 'type' || arg.mode === 'builtin')
                return;
            if (G.isUntyped(arg.type)) {
                if (paramType.kind === 'typeparam')
                    untypedArgs.push({ arg: arg, param: paramType });
                return;
            }
            self.unify(paramType, arg.type, bindings, arg);
        });
        untypedArgs.forEach(function (item) {
            if (bindings[item.param.index] === undefined && item.arg.type !== Go.types.untypedNil)
                bindings[item.param.index] = G.defaultType(item.arg.type);
        });
        generic.typeParams.forEach(function (param, index) {
            if (bindings[index] === undefined) {
                // A constraint with one type gives it (~[]E, and E is inferred).
                self.error(node, 'in call to ' + Go.exprString(fn) + ', cannot infer ' + param.name);
            }
        });
        var instance = this.instantiateFunction(generic, bindings, node);
        fn.instance = instance;
        fn.generic = null;
        fn.type = instance.type;
        fn.obj = instance;
        fn.mode = 'value';
        this.noteCall(instance);
    };

    Checker.prototype.unify = function (pattern, type, bindings, node) {
        if (pattern.kind === 'typeparam') {
            var existing = bindings[pattern.index];
            if (existing === undefined) {
                bindings[pattern.index] = type;
                // The constraint ~[]E: E is inferred from the element type.
                var terms = pattern.constraint ? G.typeTerms(pattern.constraint) : null;
                if (terms !== null && terms.length === 1)
                    this.unify(terms[0].type, terms[0].tilde ? G.underlying(type) : type, bindings, node);
            } else if (!G.identical(existing, type)) {
                this.error(node, 'type ' + this.typeName(type) + ' of ' + Go.exprString(node) + ' does not match inferred type ' +
                           this.typeName(existing) + ' for ' + pattern.name);
            }
            return;
        }
        var underlyingType = type.kind === 'named' && pattern.kind !== 'named' ? G.underlying(type) : type;
        if (pattern.kind !== underlyingType.kind)
            return;
        switch (pattern.kind) {
        case 'pointer':
        case 'slice':
        case 'array':
        case 'chan':
            this.unify(pattern.elem, underlyingType.elem, bindings, node);
            return;
        case 'map':
            this.unify(pattern.key, underlyingType.key, bindings, node);
            this.unify(pattern.elem, underlyingType.elem, bindings, node);
            return;
        case 'func':
            var self = this;
            pattern.params.forEach(function (param, index) {
                if (underlyingType.params[index])
                    self.unify(param.type, underlyingType.params[index].type, bindings, node);
            });
            pattern.results.forEach(function (result, index) {
                if (underlyingType.results[index])
                    self.unify(result.type, underlyingType.results[index].type, bindings, node);
            });
            return;
        case 'named':
            if (pattern.typeArgs && underlyingType.typeArgs && pattern.origin === underlyingType.origin) {
                var checker = this;
                pattern.typeArgs.forEach(function (arg, index) { checker.unify(arg, underlyingType.typeArgs[index], bindings, node); });
            }
            return;
        }
    };
})(globalThis);
