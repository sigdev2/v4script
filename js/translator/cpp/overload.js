// C++: calls and overload resolution (continues check.js). Candidates are
// functions and function templates (deduced and instantiated - templates.js);
// the implicit conversion sequences of the arguments (conversions.js) rank
// them as [over.match.best] does. Operators of classes are calls of
// operator functions (members, then non-members by ordinary lookup and
// argument-dependent lookup).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var X = T.cpp;
    var Parser = X.Parser;
    if (Object.prototype.hasOwnProperty.call(Parser.prototype, 'resolveOverload'))
        return;

    var types = X.types;
    var unqual = X.unqual;

    function valueType(ir) {
        return unqual(ir.type);
    }

    // --- Arguments

    // Checked arguments; braced lists stay lists, pack expansions expand.
    Parser.prototype.checkArguments = function (syntaxArgs) {
        var self = this;
        var result = [];
        syntaxArgs.forEach(function (arg) {
            if (arg.k === 'expansion') {
                result = result.concat(self.expandPattern(arg.pattern, arg));
                return;
            }
            if (arg.k === 'braced') {
                result.push(arg);
                return;
            }
            result.push(self.check(arg));
        });
        return result;
    };

    // The argument types for messages: f(int&, const char*).
    Parser.prototype.argumentText = function () {
        var args = Array.prototype.slice.call(arguments);
        if (args.length === 1 && Array.isArray(args[0]))
            args = args[0];
        return args.map(function (arg) {
            if (arg.k === 'braced')
                return '<brace-enclosed initializer list>';
            if (arg.k === 'overload')
                return '<unresolved overloaded function type>';
            var type = arg.type;
            if (arg.cat === 'lvalue' && !(arg.k === 'string'))
                return X.typeString(X.lref(type));
            return X.typeString(arg.k === 'string' ? type : type);
        }).join(', ');
    };

    // --- Implicit conversion sequences ranked

    var KIND_ORDER = { standard: 0, user: 1, ellipsis: 2 };

    // < 0 - left is better, > 0 - right is better, 0 - neither.
    function compareIcs(left, right) {
        if (left.kind !== right.kind) {
            if (left.list && right.list && left.toInitList !== right.toInitList)
                return left.toInitList ? -1 : 1;
            return KIND_ORDER[left.kind] - KIND_ORDER[right.kind];
        }
        if (left.list && right.list && left.toInitList !== right.toInitList)
            return left.toInitList ? -1 : 1;
        if (left.kind === 'user') {
            if (left.user !== right.user)
                return 0;
            if (left.second !== null && right.second !== null)
                return compareStandard(left.second, right.second);
            // {a, b} to T&& is better than to const T&.
            if (left.ref !== null && right.ref !== null && left.bindsRvalue && right.bindsRvalue &&
                left.ref !== right.ref)
                return left.ref === 'rref' ? -1 : 1;
            return 0;
        }
        if (left.kind === 'ellipsis')
            return 0;
        return compareStandard(left, right);
    }
    X.compareIcs = compareIcs;

    function compareStandard(left, right) {
        if (left.rank !== right.rank)
            return left.rank - right.rank;
        if (left.ref !== null && right.ref !== null && !left.implicitObject && !right.implicitObject) {
            if (left.bindsRvalue && right.bindsRvalue && left.ref !== right.ref)
                return left.ref === 'rref' ? -1 : 1;
            if (left.refCv !== right.refCv) {
                if ((right.refCv & left.refCv) === left.refCv)
                    return -1;
                if ((left.refCv & right.refCv) === right.refCv)
                    return 1;
            }
        }
        if (left.implicitObject && right.implicitObject && left.refCv !== right.refCv) {
            if ((right.refCv & left.refCv) === left.refCv)
                return -1;
            if ((left.refCv & right.refCv) === right.refCv)
                return 1;
        }
        if (left.qualified !== right.qualified)
            return left.qualified ? 1 : -1;
        if (left.toBool !== right.toBool)
            return left.toBool ? 1 : -1;
        if (left.toVoid !== right.toVoid && (left.baseDistance > 0 || right.baseDistance > 0))
            return left.toVoid ? 1 : -1;
        if (left.baseDistance !== right.baseDistance && left.baseDistance > 0 && right.baseDistance > 0)
            return left.baseDistance - right.baseDistance;
        return 0;
    }

    // The ICS of the implicit object parameter of a member function.
    Parser.prototype.objectConversion = function (func, object) {
        var cls = func.owner;
        var objectType = valueType(object);
        if (objectType !== cls && !X.isBaseOf(cls, objectType))
            return null;
        var funcCv = func.type.cv || 0;
        var objectCv = X.cvOf(object.type);
        if ((funcCv & objectCv) !== objectCv)
            return null;
        if (func.type.ref === '&' && object.cat !== 'lvalue')
            return null;
        if (func.type.ref === '&&' && object.cat === 'lvalue')
            return null;
        return { kind: 'standard', rank: objectType === cls ? 1 : 3, ref: func.type.ref === '&&' ? 'rref' : 'lref',
                 bindsRvalue: object.cat !== 'lvalue', refCv: funcCv, qualified: false, toBool: false,
                 baseDistance: X.baseDistance(objectType, cls), implicitObject: true, build: null };
    };

    // --- Overload resolution
    //
    // options: object (the implicit object for members), explicit, ctorOf,
    // silent (null instead of errors), noUser, name, templateArgs (explicit
    // template arguments), operator.

    Parser.prototype.resolveOverload = function (candidates, args, node, options) {
        var self = this;
        options = options || {};
        var viable = [];
        var tried = [];
        candidates.forEach(function (candidate) {
            var func = candidate;
            if (candidate.kind === 'template') {
                func = self.instantiateForCall(candidate, args, options.templateArgs || null, node, options);
                if (func === null)
                    return;
            } else if (options.templateArgs && options.templateArgs.length > 0) {
                return;
            }
            tried.push(func);
            var entry = self.viability(func, args, options);
            if (entry !== null) {
                entry.fromTemplate = candidate.kind === 'template';
                entry.template = candidate.kind === 'template' ? candidate : null;
                viable.push(entry);
            }
        });
        if (viable.length === 0) {
            if (options.silent)
                return null;
            this.noMatch(candidates, tried, args, node, options);
        }
        var best = viable[0];
        for (var index = 1; index < viable.length; ++index) {
            if (this.better(viable[index], best) > 0)
                best = viable[index];
        }
        var ambiguous = viable.filter(function (entry) {
            return entry !== best && self.better(best, entry) <= 0;
        });
        if (ambiguous.length > 0) {
            if (options.silent)
                return { best: null, ambiguous: true };
            this.ambiguousCall(best, ambiguous, args, node, options);
        }
        return { best: best.func, ics: best.ics, args: args, objectIcs: best.objectIcs, extra: best.extra };
    };

    // > 0 - left is better than right.
    Parser.prototype.better = function (left, right) {
        var leftBetter = false, rightBetter = false;
        var count = Math.min(left.ics.length, right.ics.length);
        if (left.objectIcs && right.objectIcs) {
            var objectOrder = compareIcs(left.objectIcs, right.objectIcs);
            if (objectOrder < 0)
                leftBetter = true;
            else if (objectOrder > 0)
                rightBetter = true;
        }
        for (var index = 0; index < count; ++index) {
            var order = compareIcs(left.ics[index], right.ics[index]);
            if (order < 0)
                leftBetter = true;
            else if (order > 0)
                rightBetter = true;
        }
        if (leftBetter && !rightBetter)
            return 1;
        if (rightBetter && !leftBetter)
            return -1;
        if (leftBetter && rightBetter)
            return 0;
        if (!left.fromTemplate && right.fromTemplate)
            return 1;
        if (left.fromTemplate && !right.fromTemplate)
            return -1;
        if (left.fromTemplate && right.fromTemplate) {
            var specialized = this.moreSpecialized(left.template, right.template);
            if (specialized !== 0)
                return specialized;
        }
        // A function without a pack of defaults wins over one that needs them.
        if (left.usesEllipsis !== right.usesEllipsis)
            return left.usesEllipsis ? -1 : 1;
        // Non-const member functions over const for non-const objects come
        // from the object ICS above; an inherited constructor loses.
        if (left.func.inheritedFrom !== right.func.inheritedFrom)
            return left.func.inheritedFrom ? -1 : 1;
        return 0;
    };

    // The conversion sequences of a candidate, or null if it is not viable.
    Parser.prototype.viability = function (func, args, options) {
        var params = func.type.params;
        var required = 0;
        for (var index = 0; index < func.params.length && index < params.length; ++index) {
            if (!this.hasDefault(func.params[index]))
                required = index + 1;
        }
        if (func.params.length < params.length)
            required = params.length;
        if (args.length < required)
            return null;
        if (args.length > params.length && !func.type.variadic)
            return null;
        var objectIcs = null;
        if (func.isMember && !func.isCtor && options.object !== undefined && options.object !== null) {
            objectIcs = this.objectConversion(func, options.object);
            if (objectIcs === null)
                return null;
        } else if (func.isMember && !func.isCtor && options.object === null && !options.staticOnly) {
            // A member named without an object outside a member function.
            if (!options.allowNoObject)
                return null;
        }
        var ics = [];
        var usesEllipsis = false;
        for (var argIndex = 0; argIndex < args.length; ++argIndex) {
            if (argIndex >= params.length) {
                ics.push({ kind: 'ellipsis', rank: 5, ref: null, build: null });
                usesEllipsis = true;
                continue;
            }
            var noUser = options.noUser && args.length === 1;
            // A copy or move constructor taking a braced list does not take
            // another user-defined conversion.
            var conversion = this.conversion(params[argIndex], args[argIndex], { noUser: noUser,
                                                                                explicit: false });
            if (conversion === null)
                return null;
            ics.push(conversion);
        }
        return { func: func, ics: ics, objectIcs: objectIcs, usesEllipsis: usesEllipsis };
    };

    Parser.prototype.callName = function (candidates, options) {
        if (options.ctorOf)
            return X.qualifiedName(options.ctorOf);
        var first = candidates[0];
        if (first === undefined)
            return options.name || '?';
        if (first.kind === 'template')
            return first.owner && first.owner.isClass ? X.qualifiedName(first.owner) + '::' + first.name
                                                     : X.qualifiedName(first);
        if (first.owner && first.owner.isClass)
            return X.qualifiedName(first.owner) + '::' + first.name;
        return first.owner ? X.qualifiedName(first) : first.name;
    };

    Parser.prototype.noMatch = function (candidates, tried, args, node, options) {
        var deleted = tried.filter(function (func) { return func.deleted; });
        if (deleted.length > 0 && tried.length === 1)
            this.error(node, "use of deleted function '" + X.functionSignature(deleted[0]) + "'");
        var name = this.callName(candidates, options);
        if (options.operator)
            this.error(node, "no match for 'operator" + options.operator + "' (operand types are '" +
                       args.map(function (arg) { return X.typeString(arg.type); }).join("' and '") + "')");
        var object = options.object ? (X.isConst(options.object.type) ? ' const' : '') : '';
        var text = "no matching function for call to '" + name + '(' + this.argumentText(args) + ')' + object + "'";
        var notes = tried.map(function (func) { return X.functionSignature(func); });
        if (notes.length === 1 && candidates.length === 1)
            text += '; candidate: ' + notes[0];
        this.error(node, text);
    };

    Parser.prototype.ambiguousCall = function (best, others, args, node, options) {
        var name = this.callName([best.func], options);
        if (options.operator)
            this.error(node, "ambiguous overload for 'operator" + options.operator + "' (operand types are '" +
                       args.map(function (arg) { return X.typeString(arg.type); }).join("' and '") + "')");
        this.error(node, "call of overloaded '" + name + '(' + this.argumentText(args) + ")' is ambiguous");
    };

    // --- Using a function

    // The function will be called: its body is compiled (now for auto
    // results, later otherwise) and it joins the calls of the context.
    Parser.prototype.useFunction = function (func, node) {
        if (this.isUnevaluated && !X.containsAuto(func.type.returns))
            return;
        if (this.func !== null && this.func.calls.indexOf(func) < 0)
            this.func.calls.push(func);
        if (func.implicit)
            this.session.requireImplicit(func, this);
        else if (X.containsAuto(func.type.returns))
            this.session.compileBody(func);
        else
            this.session.requireBody(func);
        if (func.deleted && !this.isUnevaluated)
            this.error(node, "use of deleted function '" + X.functionSignature(func) + "'");
        // A constructed object needs the functions of its vtables.
        if (func.isCtor && func.owner.polymorphic)
            this.session.requireVirtuals(func.owner, this);
    };

    // The converted arguments of a resolved call (with default arguments).
    Parser.prototype.buildArguments = function (func, resolution, node) {
        var args = resolution.args;
        var result = [];
        var params = func.type.params;
        for (var index = 0; index < params.length; ++index) {
            var built = index < args.length ? resolution.ics[index].build() : this.defaultArgument(func, index, node);
            // A class argument by value: a temporary of the caller, destroyed
            // after the call.
            if (!X.isRef(params[index]) && unqual(params[index]).isClass)
                built = this.ir('argument', built, { init: built, type: unqual(params[index]), cat: 'xvalue',
                                                     dtor: this.elementDestructor(params[index]) });
            result.push(built);
        }
        for (var extra = params.length; extra < args.length; ++extra)
            result.push(this.variadicArgument(args[extra], node));
        return result;
    };

    // A default argument: checked in the scope of the declaration, once.
    Parser.prototype.defaultArgument = function (func, index, node) {
        var param = func.params[index];
        if (param.defaultIr !== undefined)
            return param.defaultIr;
        var scope = param.defaultScope || func.owner;
        var value = this.session.withParser(param.defaultTokens, scope, this, function (parser) {
            var syntax = param.defaultArg !== null && param.defaultArg !== undefined ? param.defaultArg
                                                                                   : parser.initializerClause();
            var checked = syntax.k === 'braced' ? syntax : parser.check(syntax);
            return parser.initializeFrom(func.type.params[index], checked, syntax, false, 'argument');
        });
        param.defaultIr = value;
        return value;
    };

    // An argument of '...': promotions; a class object is an error.
    Parser.prototype.variadicArgument = function (arg, node) {
        if (arg.k === 'braced')
            this.error(node, 'cannot pass a brace-enclosed initializer list through ...');
        var value = this.decayValue(arg);
        var type = valueType(value);
        if (type.isClass) {
            if (!this.isTriviallyCopyable(type))
                this.error(node, "cannot pass objects of non-trivially-copyable type '" + X.typeString(arg.type) +
                           "' through '...'");
            this.error(node, "passing objects of class type '" + X.typeString(arg.type) +
                       "' through '...' is not supported");
        }
        if (type === types.float)
            return this.convertScalar(value, types.double);
        if (X.isIntegralLike(type) || type.kind === 'enum') {
            // A bool stays a bool for the natives of js.h.
            var promoted = this.convertScalar(value, X.promote(type));
            promoted.original = arg.type;
            return promoted;
        }
        if (type.kind === 'nullptr')
            return this.convertScalar(value, X.pointerTo(types.void));
        var result = this.convertScalar(value, type);
        result.original = arg.type;
        return result;
    };

    // --- Calls

    Parser.prototype.checkCall = function (node) {
        var fn = node.fn;
        while (fn.k === 'paren' && fn.expr.k !== 'name')
            fn = fn.expr;
        var args;
        if (fn.k === 'name' && (fn.entity === null || fn.entity === undefined ||
                                fn.entity.kind === 'functions' || fn.entity.kind === 'func' ||
                                (fn.entity.kind === 'template' && fn.entity.what === 'function'))) {
            args = this.checkArguments(node.args);
            return this.namedCall(fn, args, node);
        }
        if (fn.k === 'name' && X.isTypeEntity(fn.entity))
            return this.functionalCastIr({ k: 'functional', type: this.entityType(fn.entity), args: node.args,
                                           braced: false, line: node.line, column: node.column, file: node.file });
        var callee = this.check(fn);
        args = this.checkArguments(node.args);
        return this.callValue(callee, args, node);
    };

    // A call of a checked callee: an overload set (with or without an
    // object), a pointer to a function, an object with operator().
    Parser.prototype.callValue = function (callee, args, node) {
        if (callee.k === 'overload')
            return this.overloadCall(callee, args, node);
        if (callee.k === 'dtorref') {
            var cls = unqual(callee.cls);
            this.declareImplicitMembers(cls);
            if (cls.dtor !== null)
                this.useFunction(cls.dtor, node);
            return this.ir('dtorcall', node,
                           { object: callee.object, cls: callee.cls, type: types.void, cat: 'prvalue' });
        }
        if (callee.k === 'pseudodtor')
            return this.ir('comma', node, { list: [callee.object, this.ir('conv', node, {
                operand: this.constant(0, types.int, node), from: types.int, to: types.void, type: types.void,
                cat: 'prvalue' })], type: types.void, cat: 'prvalue' });
        var type = valueType(callee);
        if (type.isClass) {
            var call = this.operatorCall('()', [callee].concat(args), node, true);
            if (call !== null)
                return call;
            this.error(node, "no match for call to '(" + X.typeString(callee.type) + ') (' + this.argumentText(args) +
                       ")'");
        }
        var pointer = this.decayValue(callee);
        var pointerType = valueType(pointer);
        if (pointerType.kind !== 'pointer' || pointerType.to.kind !== 'function')
            this.error(node, "expression cannot be used as a function");
        var fnType = pointerType.to;
        var entry = this.viability({ type: fnType, params: fnType.params.map(function () { return {}; }),
                                     isMember: false },
                                   args, {});
        if (entry === null)
            this.error(node, "too " + (args.length < fnType.params.length ? 'few' : 'many') +
                       ' arguments to function, or invalid conversion of arguments');
        var converted = [];
        var self = this;
        args.forEach(function (arg, index) {
            converted.push(index < fnType.params.length ? entry.ics[index].build() : self.variadicArgument(arg, node));
        });
        if (this.func !== null)
            this.func.dynamicCalls = true;
        if (this.func !== null)
            this.func.dynamicCalls = true;
        return this.callResult(this.ir('icall', node, { callee: pointer, args: converted, fnType: fnType }),
                               fnType.returns);
    };

    // The type and category of a call by the return type.
    Parser.prototype.callResult = function (ir, returns) {
        if (X.isRef(returns)) {
            ir.type = returns.to;
            ir.cat = returns.kind === 'lref' || returns.to.kind === 'function' ? 'lvalue' : 'xvalue';
        } else {
            ir.type = returns;
            ir.cat = 'prvalue';
            if (unqual(returns).isClass && !unqual(returns).complete)
                this.error(ir, "invalid use of incomplete type '" + X.typeString(returns) + "'");
        }
        return ir;
    };

    // f(args): a name; unqualified names also look in the namespaces of
    // the arguments.
    Parser.prototype.namedCall = function (name, args, node) {
        var entity = name.entity;
        var items = [];
        var fromClass = false;
        if (entity !== null && entity !== undefined) {
            if (entity.kind === 'functions')
                items = entity.items.slice();
            else
                items = [entity];
            fromClass = items.some(function (item) { return item.owner && item.owner.isClass && !item.hiddenFriend; });
        }
        items = items.filter(function (item) { return !item.hiddenFriend; });
        var unqualified = name.qualifier === null || name.qualifier === undefined;
        var blockDeclared = false;
        if (unqualified && !fromClass && !blockDeclared && !name.noAdl) {
            var extra = this.argumentDependent(name.name, args);
            extra.forEach(function (item) {
                if (items.indexOf(item) < 0)
                    items.push(item);
            });
        }
        if (items.length === 0) {
            if (name.qualifier !== null && name.qualifier !== undefined)
                this.error(name, "'" + name.name + "' is not a member of '" + this.scopeName(name.qualifier) + "'");
            this.error(name, "'" + name.name + "' was not declared in this scope");
        }
        var set = { kind: 'functions', name: name.name, items: items };
        var callee = this.overloadIr(set, name, null);
        callee.templateArgs = this.expandedArguments(name.args);
        callee.qualified = !unqualified;
        return this.overloadCall(callee, args, node);
    };

    // An unresolved overload set (with an object for members).
    Parser.prototype.overloadIr = function (set, node, object) {
        return this.ir('overload', node, { set: set, object: object, type: types.void, cat: 'lvalue',
                                           templateArgs: this.expandedArguments(node.args) || null, name: set.name });
    };

    Parser.prototype.overloadCall = function (callee, args, node) {
        var object = callee.object;
        var candidates = callee.set.items;
        var implicitThis = null;
        if (object === null) {
            // A member function named inside a member function: this->f.
            var hasMembers = candidates.some(function (item) { return item.isMember; });
            if (hasMembers && this.func !== null && (this.func.thisClass !== null || this.func.lambda !== null)) {
                var thisClass = this.currentThisClass();
                if (thisClass !== null) {
                    var owner = candidates.filter(function (item) { return item.isMember; })[0].owner;
                    if (thisClass === owner || X.isBaseOf(owner, thisClass))
                        implicitThis = this.thisObject(node);
                }
            }
        }
        var options = { object: object !== null ? object : implicitThis, templateArgs: callee.templateArgs,
                        name: callee.name, allowNoObject: false };
        if (options.object === null) {
            options.staticOnly = true;
            candidates = candidates.filter(function (item) { return !item.isMember || item.isCtor; });
            if (candidates.length === 0 && callee.set.items.length > 0) {
                var member = callee.set.items[0];
                this.error(node, "cannot call member function '" + X.functionSignature(member) + "' without object");
            }
        }
        var resolution = this.resolveOverload(candidates, args, node, options);
        var func = resolution.best;
        return this.finishCall(func, resolution, options.object, node, callee.qualified || callee.nonVirtual);
    };

    Parser.prototype.currentThisClass = function () {
        for (var context = this.func; context !== null; context = context.parent) {
            if (context.thisClass !== null)
                return context.thisClass;
            if (context.lambda === null)
                return null;
        }
        return null;
    };

    // The call of a resolved function.
    Parser.prototype.finishCall = function (func, resolution, object, node, nonVirtual) {
        this.useFunction(func, node);
        if (func.owner && func.owner.isClass)
            this.checkAccess(func, func.owner, node);
        var args = this.buildArguments(func, resolution, node);
        // A trivial assignment copies the bytes.
        if (func.implicit && func.trivial && object !== null && object !== undefined &&
            (func.implicitKind === 'copyassign' || func.implicitKind === 'moveassign'))
            return this.ir('assignobj', node, { target: object, source: args[0], type: object.type, cat: 'lvalue' });
        if (func.isMember && object !== null && object !== undefined)
            return this.memberCallBuilt(func, object, args, node, !nonVirtual);
        if (object !== null && object !== undefined && func.isStatic && this.hasEffects(object)) {
            var staticCall = this.callResult(this.ir('call', node, { func: func, object: null, args: args }),
                                             func.type.returns);
            return this.ir('comma', node, { list: [object, staticCall], type: staticCall.type, cat: staticCall.cat });
        }
        return this.callResult(this.ir('call', node, { func: func, object: null, args: args }), func.type.returns);
    };

    // A member call with converted arguments.
    Parser.prototype.memberCallBuilt = function (func, object, args, node, mayBeVirtual) {
        if (object.cat === 'prvalue')
            object = this.materialize(object);
        var objectType = valueType(object);
        var offset = X.baseOffset(objectType, func.owner);
        if (offset > 0)
            object = this.baseSubobject(object, func.owner, offset, node);
        var isVirtual = mayBeVirtual && func.isVirtual;
        if (isVirtual && this.func !== null)
            this.func.dynamicCalls = true;
        return this.callResult(this.ir('call', node, { func: func, object: object, args: args, virtual: isVirtual }),
                               func.type.returns);
    };

    // A member call from arguments that still need conversion.
    Parser.prototype.memberCall = function (func, object, args, node, nonVirtual) {
        var resolution = this.resolveOverload([func], args, node, { object: object });
        return this.finishCall(resolution.best, resolution, object, node, nonVirtual);
    };

    // --- Argument-dependent lookup

    // The functions of a name in the namespaces and classes associated with
    // the types of the arguments.
    Parser.prototype.argumentDependent = function (name, args) {
        var spaces = [];
        var classes = [];
        function addType(type, depth) {
            if (depth > 8 || type === null || type === undefined)
                return;
            type = unqual(X.removeRef(type));
            switch (type.kind) {
            case 'pointer':
                addType(type.to, depth + 1);
                return;
            case 'array':
                addType(type.of, depth + 1);
                return;
            case 'function':
                addType(type.returns, depth + 1);
                type.params.forEach(function (param) { addType(param, depth + 1); });
                return;
            case 'enum':
                addSpace(type.parent);
                return;
            }
            if (!type.isClass)
                return;
            if (classes.indexOf(type) >= 0)
                return;
            classes.push(type);
            addSpace(type.parent);
            type.bases.forEach(function (base) { addType(base.type, depth + 1); });
            if (type.templateArgs !== null)
                type.templateArgs.forEach(function (arg) {
                    if (arg.kind === 'type')
                        addType(arg.type, depth + 1);
                });
        }
        function addSpace(scope) {
            while (scope !== null && scope !== undefined && scope.kind !== 'namespace')
                scope = scope.parent;
            if (scope !== null && scope !== undefined && spaces.indexOf(scope) < 0) {
                spaces.push(scope);
                // Inline namespaces belong to their parent.
                if (scope.inlineNamespace && scope.parent !== null)
                    addSpace(scope.parent);
            }
        }
        args.forEach(function (arg) {
            if (arg.k === 'braced')
                return;
            if (arg.k === 'overload') {
                arg.set.items.forEach(function (item) {
                    if (item.owner && item.owner.kind === 'namespace')
                        addSpace(item.owner);
                });
                return;
            }
            addType(arg.type, 0);
        });
        var result = [];
        spaces.forEach(function (space) {
            var found = X.member(space, name);
            if (found !== undefined && found.kind === 'functions')
                found.items.forEach(function (item) {
                    if (result.indexOf(item) < 0 && !(item.owner && item.owner.isClass))
                        result.push(item);
                });
            // Members of inline namespaces are members of the parent.
            X.nominated(space).forEach(function (inner) {
                if (!inner.inlineNamespace)
                    return;
                var inlineFound = X.member(inner, name);
                if (inlineFound !== undefined && inlineFound.kind === 'functions')
                    inlineFound.items.forEach(function (item) {
                        if (result.indexOf(item) < 0)
                            result.push(item);
                    });
            });
        });
        classes.forEach(function (cls) {
            (cls.friends || []).forEach(function (friend) {
                if (friend.name === name && result.indexOf(friend) < 0)
                    result.push(friend);
            });
        });
        return result;
    };

    // --- Operators

    // A call of an overloaded operator, or null if no operator function
    // fits (the built-in operator applies). postfix - x++ (an int argument).
    Parser.prototype.operatorCall = function (op, args, node, classOperand, postfix) {
        var name = 'operator' + op;
        var first = args[0];
        var candidates = [];
        var firstType = first.k === 'braced' ? types.void : valueType(first);
        var memberOnly = op === '=' || op === '[]' || op === '()' || op === '->';
        if (firstType.isClass) {
            if (op === '=')
                this.declareImplicitMembers(firstType);
            var member = X.lookupMember(firstType, name);
            if (member !== null && member.entity.kind === 'functions')
                member.entity.items.forEach(function (item) {
                    if (item.isMember || item.kind === 'template')
                        candidates.push(item);
                });
        }
        if (!memberOnly) {
            var ordinary = this.lookupNonMember(name);
            ordinary.forEach(function (item) {
                if (candidates.indexOf(item) < 0)
                    candidates.push(item);
            });
            this.argumentDependent(name, args).forEach(function (item) {
                if (candidates.indexOf(item) < 0)
                    candidates.push(item);
            });
        }
        if (candidates.length === 0)
            return null;
        var self = this;
        var memberCandidates = candidates.filter(function (item) {
            return (item.isMember ||
                    (item.kind === 'template' && item.owner && item.owner.isClass)) && firstType.isClass;
        });
        var freeCandidates = candidates.filter(function (item) { return memberCandidates.indexOf(item) < 0; });
        // Members take the first operand as the object.
        var viable = [];
        var memberArgs = args.slice(1);
        if (memberCandidates.length > 0) {
            var memberResolution = this.resolveCandidates(memberCandidates, memberArgs, node, { object: first,
                                                                                                name: name });
            viable = viable.concat(memberResolution.map(function (entry) {
                entry.member = true;
                return entry;
            }));
        }
        if (freeCandidates.length > 0)
            viable = viable.concat(this.resolveCandidates(freeCandidates, args, node, { name: name }));
        if (viable.length === 0) {
            return null;
        }
        var best = viable[0];
        for (var index = 1; index < viable.length; ++index) {
            if (this.betterOperator(viable[index], best) > 0)
                best = viable[index];
        }
        var ambiguous = viable.filter(function (entry) { return entry !== best &&
                                                         self.betterOperator(best, entry) <= 0; });
        if (ambiguous.length > 0)
            this.error(node, "ambiguous overload for '" + name + "' (operand types are '" +
                       args.map(function (arg) {
                           return arg.k === 'braced' ? '<brace-enclosed initializer list>' : X.typeString(arg.type);
                       }).join("' and '") +
                       "')");
        var resolution = { best: best.func, ics: best.ics, args: best.member ? memberArgs : args };
        return this.finishCall(best.func, resolution, best.member ? first : null, node, false);
    };

    // Member and non-member candidates of an operator compared together:
    // the object of a member counts as its first argument.
    Parser.prototype.betterOperator = function (left, right) {
        var leftIcs = left.member ? [left.objectIcs].concat(left.ics) : left.ics;
        var rightIcs = right.member ? [right.objectIcs].concat(right.ics) : right.ics;
        return this.better({ ics: leftIcs, func: left.func, fromTemplate: left.fromTemplate, template: left.template,
                             objectIcs: null },
                           { ics: rightIcs, func: right.func, fromTemplate: right.fromTemplate,
                             template: right.template,
                             objectIcs: null });
    };

    // All viable entries of a candidate list (no choice).
    Parser.prototype.resolveCandidates = function (candidates, args, node, options) {
        var self = this;
        var result = [];
        candidates.forEach(function (candidate) {
            var func = candidate;
            if (candidate.kind === 'template') {
                func = self.instantiateForCall(candidate, args, null, node, options);
                if (func === null)
                    return;
            }
            var entry = self.viability(func, args, options);
            if (entry !== null) {
                entry.fromTemplate = candidate.kind === 'template';
                entry.template = candidate.kind === 'template' ? candidate : null;
                result.push(entry);
            }
        });
        return result;
    };

    // Non-member functions of a name by ordinary lookup (class scopes are
    // skipped: members are found by the class of the operand).
    Parser.prototype.lookupNonMember = function (name) {
        var result = [];
        for (var scope = this.scope; scope !== null && scope !== undefined; scope = scope.parent) {
            if (scope.isClass)
                continue;
            var found = X.lookupIn(scope, name);
            if (found !== null && found.kind === 'functions') {
                found.items.forEach(function (item) {
                    if (!item.isMember && !item.hiddenFriend)
                        result.push(item);
                });
                if (scope.kind !== 'namespace' || result.length > 0)
                    break;
            }
        }
        return result;
    };

    // --- Addresses of overloaded functions

    // &f, f as a value: the one function of the set, or the one matching
    // the target function type.
    Parser.prototype.resolveAddress = function (ir, targetFunctionType, node) {
        var items = ir.set.items;
        var func = null;
        if (targetFunctionType !== null)
            func = this.selectFunctionByType(ir.set, targetFunctionType);
        else {
            var plain = items.filter(function (item) { return item.kind === 'func'; });
            if (items.length === 1 && items[0].kind === 'template' && ir.templateArgs) {
                func = this.instantiateExplicit(items[0], ir.templateArgs, node);
            } else if (plain.length === 1 && items.length === 1) {
                func = plain[0];
            }
        }
        if (func === null)
            this.error(node, "unable to resolve address of overloaded function '" + ir.set.name + "'");
        this.useFunction(func, node);
        func.addressTaken = true;
        if (func.isMember)
            this.error(node, "member function pointers are not supported");
        return this.ir('fnaddr', node, { func: func, type: X.pointerTo(func.type), cat: 'prvalue' });
    };

    Parser.prototype.selectFunctionByType = function (set, fnType) {
        var found = null;
        var self = this;
        set.items.forEach(function (item) {
            if (found !== null)
                return;
            if (item.kind === 'func' && item.type === fnType && !item.isMember)
                found = item;
        });
        if (found === null) {
            set.items.forEach(function (item) {
                if (found !== null || item.kind !== 'template')
                    return;
                var instance = self.instantiateForType(item, fnType);
                if (instance !== null)
                    found = instance;
            });
        }
        return found;
    };
})(globalThis);
