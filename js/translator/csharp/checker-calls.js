// C#: calls - arguments, overload resolution by the rules of C# 12.6.4,
// type inference of generic methods (12.6.3), extension methods, lambdas
// and method groups converted to delegates, object creation and
// initializers.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    var C = CS.Checker.prototype;
    if (C.bind_call)
        return;

    var bound = CS.bound;
    var Conversions = CS.Conversions;

    // --- Arguments

    // The arguments as they are: { name, refKind, expr (bound, maybe not
    // converted), node, outDecl (an out var waiting for its type) }.
    C.bindArguments = function (nodes, scope) {
        var self = this;
        return nodes.map(function (node, index) {
            var arg = { name: node.name, refKind: node.refKind, node: node.expr, outDecl: null, expr: null, position: index };
            if (node.expr.k === 'declExpr') {
                if (node.refKind !== 'out')
                    self.error(node.expr, 'CS1003', "Syntax error, ',' expected");
                arg.outDecl = node.expr;
                if (node.expr.designation.k === 'discard') {
                    arg.discard = true;
                    if (node.expr.type !== null)
                        arg.declaredType = self.resolveType(node.expr.type, scope);
                } else if (node.expr.type !== null) {
                    arg.declaredType = self.resolveType(node.expr.type, scope);
                }
                return arg;
            }
            if (node.refKind === 'out' && node.expr.k === 'name' && node.expr.name === '_' &&
                self.lookupLocal('_', scope, node.expr) === null) {
                arg.outDecl = { k: 'declExpr', type: null, designation: { k: 'discard' }, line: node.line, column: node.column };
                arg.discard = true;
                return arg;
            }
            arg.expr = self.bindExpr(node.expr, scope);
            if (node.refKind !== '') {
                arg.expr = self.requireValue(arg.expr, node.expr);
                if (!self.isRefVariable(arg.expr))
                    self.error(node.expr, 'CS1510', 'A ref or out value must be an assignable variable');
                if (node.refKind !== 'in')
                    self.checkAssignable(arg.expr, node.expr, scope);
            }
            return arg;
        });
    };

    C.isRefVariable = function (expr) {
        switch (expr.k) {
        case 'local':
        case 'arrayElement':
        case 'this':
            return true;
        case 'field':
            return !expr.field.isConst;
        case 'call':
            return !!expr.method.refReturn;
        case 'conditional':
            return !!expr.isRef;
        }
        return false;
    };

    // An argument as a pseudo expression for applicability (out var has the
    // type of the parameter).
    function argumentExpr(arg) {
        return arg.expr;
    }

    // --- Invocation

    C.bind_call = function (node, scope) {
        var callee = this.bindExpr(node.target, scope);
        // x.Count(...) where Count is a property: an invocation drops the
        // members that are not invocable, extension methods remain.
        if (node.target.k === 'member' && (callee.k === 'property' || callee.k === 'field') && callee.receiver !== null &&
            callee.receiver !== undefined && callee.type !== undefined && !CS.isDelegate(callee.type) && callee.type.kind !== 'dynamic')
            callee = bound('methodGroup', node.target, { receiver: callee.receiver, methods: [], name: node.target.name, isBase: false,
                                                         typeArgs: node.target.args === null || node.target.args === undefined ? null
                                                             : this.typeArguments(node.target.args, scope),
                                                         extensionOnly: true });
        // Range(3) with a type Range and a method of a static import: the
        // invocation takes the method.
        if (callee.k === 'typeExpr' && node.target.k === 'name') {
            var importArgs = node.target.args === null || node.target.args === undefined ? null : this.typeArguments(node.target.args, scope);
            var imported = this.lookupUsingStatic(node.target.name, importArgs, scope, node.target);
            if (imported !== null && imported.k === 'methodGroup')
                callee = imported;
        }
        if (callee.k === 'methodGroup')
            return this.bindMethodCall(callee, node.args, node, scope);
        if (callee.k === 'typeExpr')
            this.error(node.target, 'CS1955', "Non-invocable member '" + CS.typeName(callee.type) + "' cannot be used like a method.");
        if (callee.k === 'namespaceExpr')
            this.error(node.target, 'CS0118', "'" + callee.ns.qname + "' is a namespace but is used like a variable");
        var target = this.requireValue(callee, node.target);
        var type = target.type;
        if (type.kind === 'dynamic') {
            var self = this;
            return bound('dynamicCall', node, { target: target, args: node.args.map(function (arg) {
                return self.bindValue(arg.expr, scope);
            }), type: CS.DYNAMIC });
        }
        if (!CS.isDelegate(type)) {
            if (target.k === 'property' || target.k === 'field' || target.k === 'local')
                this.error(node.target, 'CS1955', "Non-invocable member '" + this.exprText(target) + "' cannot be used like a method.");
            this.error(node.target, 'CS0149', 'Method name expected');
        }
        var invoke = type.sym.complete().invoke;
        var args = this.bindArguments(node.args, scope);
        var result = this.resolveOverload([{ member: invoke, owner: type }], args, null, node, scope,
                                          { name: 'Invoke', delegateName: this.exprText(target) });
        return bound('delegateCall', node, { target: target, args: result.args, invoke: invoke, type: result.returnType });
    };

    // A call of a method group: overload resolution, then extension
    // methods if no instance method fits.
    C.bindMethodCall = function (group, argNodes, node, scope) {
        var args = this.bindArguments(argNodes, scope);
        var candidates = group.methods;
        var result = null;
        if (candidates.length > 0) {
            var instanceAttempt = this.findApplicable(candidates, args, group.typeArgs, scope);
            if (instanceAttempt.best !== null || group.receiver === null || group.isBase || group.implicitThis)
                result = this.resolveOverload(candidates, args, group.typeArgs, node, scope, { name: group.name, group: group,
                                                                                              attempt: instanceAttempt });
        }
        if (result === null && group.receiver !== null) {
            var extensions = this.extensionCandidates(group.name, scope);
            var receiverArg = { name: null, refKind: '', node: node.target, outDecl: null, expr: group.receiver, receiver: true };
            var extArgs = [receiverArg].concat(args);
            var extensionAttempt = this.findApplicable(extensions, extArgs, group.typeArgs, scope);
            if (extensionAttempt.best === null) {
                if (candidates.length > 0)
                    return this.methodCallResult(group, this.resolveOverload(candidates, args, group.typeArgs, node, scope,
                                                                             { name: group.name, group: group }), node, scope);
                if (extensions.length === 0 || extensionAttempt.applicable.length === 0) {
                    var receiverType = group.receiver.type;
                    this.noMember(receiverType, group.name, node.target, false);
                }
            }
            var extension = this.resolveOverload(extensions, extArgs, group.typeArgs, node, scope,
                                                 { name: group.name, attempt: extensionAttempt, extension: true });
            return bound('call', node, { receiver: null, method: extension.method, ownerType: extension.owner,
                                         typeArgs: extension.typeArgs, args: extension.args, type: extension.returnType,
                                         extension: true, argOrder: extension.argOrder });
        }
        return this.methodCallResult(group, result, node, scope);
    };

    C.methodCallResult = function (group, result, node, scope) {
        var method = result.method;
        var receiver = group.receiver;
        var name = this.methodText(method);
        if (method.isStatic && receiver !== null && !group.implicitThis && !group.colorColor && !group.localFunction)
            this.error(node.target, 'CS0176', "Member '" + name + "' cannot be accessed with an instance reference; qualify it with a type name instead");
        if (!method.isStatic && receiver === null && !group.localFunction) {
            if (group.implicitThis && !this.inStaticContext(scope) && !group.staticContext)
                receiver = this.thisValue(node, scope);
            else
                this.error(node.target, 'CS0120', "An object reference is required for the non-static field, method, or property '" + name + "'");
        }
        if (method.isStatic)
            receiver = null;
        if (method.isAbstract && group.isBase)
            this.error(node, 'CS0205', "Cannot call an abstract base member: '" + name + "'");
        if (method.partialDefinition)
            return bound('nothing', node, { type: CS.VOID, args: result.args });
        var call = bound('call', node, { receiver: receiver, method: method, ownerType: result.owner, typeArgs: result.typeArgs,
                                         args: result.args, type: result.returnType, isBase: group.isBase,
                                         argOrder: result.argOrder, localFunction: !!group.localFunction,
                                         typeParam: group.typeParam || null });
        if (method.isLocal && this.currentFunction(scope) !== null)
            this.noteCall(scope, method);
        else
            this.noteCall(scope, method, call);
        return call;
    };

    // The static classes in scope with extension methods of this name.
    C.extensionCandidates = function (name, scope) {
        var result = [];
        var seen = [];
        var self = this;
        for (var current = scope; current !== null; current = current.parent) {
            if (current.kind !== 'namespace')
                continue;
            var namespaces = [current.ns].concat(current.usingNamespaces);
            namespaces.forEach(function (ns) {
                if (seen.indexOf(ns) >= 0)
                    return;
                seen.push(ns);
                self.symtab.extensionClasses(ns, name).forEach(function (sym) {
                    (sym.complete().members[name] || []).forEach(function (member) {
                        if (member.symbolKind === 'method' && member.isExtension)
                            result.push({ member: member, owner: CS.named(sym, []) });
                    });
                });
            });
            current.usingStatic.forEach(function (item) {
                if (item.type === null)
                    item.type = CS.named(self.symtab.typeNamed(item.qname), []);
                (item.type.sym.complete().members[name] || []).forEach(function (member) {
                    if (member.symbolKind === 'method' && member.isExtension &&
                        !result.some(function (entry) { return entry.member === member; }))
                        result.push({ member: member, owner: item.type });
                });
            });
        }
        // Extension methods of the user's static classes in the global namespace.
        var global = this.symtab.global;
        if (seen.indexOf(global) < 0)
            this.symtab.extensionClasses(global, name).forEach(function (sym) {
                (sym.complete().members[name] || []).forEach(function (member) {
                    if (member.symbolKind === 'method' && member.isExtension)
                        result.push({ member: member, owner: CS.named(sym, []) });
                });
            });
        return result;
    };

    // --- Overload resolution

    // Candidates applicable to the arguments: { applicable: [result],
    // best: result or null, failures }.
    C.findApplicable = function (candidates, args, typeArgs, scope) {
        var self = this;
        var applicable = [];
        var failures = [];
        candidates.forEach(function (candidate) {
            var result = self.applicability(candidate, args, typeArgs, scope, false);
            if (result.ok) {
                applicable.push(result);
                return;
            }
            var expanded = null;
            var method = candidate.member;
            if (method.params.length > 0 && method.params[method.params.length - 1].isParams)
                expanded = self.applicability(candidate, args, typeArgs, scope, true);
            if (expanded !== null && expanded.ok)
                applicable.push(expanded);
            else
                failures.push(expanded !== null && expanded.score > result.score ? expanded : result);
        });
        // Methods of the most derived types only (C# 12.6.4.2).
        if (applicable.length > 1) {
            applicable = applicable.filter(function (item) {
                var owner = item.candidate.member.owner;
                return !applicable.some(function (other) {
                    var otherOwner = other.candidate.member.owner;
                    return otherOwner !== owner && owner.symbolKind === 'type' && otherOwner.symbolKind === 'type' &&
                        owner.kind !== 'interface' && !item.candidate.member.isExtension &&
                        CS.derivesFrom(otherOwner, owner);
                });
            });
        }
        var best = applicable.length === 1 ? applicable[0] : (applicable.length > 1 ? this.bestCandidate(applicable, args) : null);
        return { applicable: applicable, best: best, failures: failures };
    };

    // Whether a candidate fits the arguments; expanded - the params array
    // in its expanded form. Result: { ok, candidate, method, owner,
    // paramTypes (per argument), map (argument -> parameter), typeArgs,
    // expanded, error, score }.
    C.applicability = function (candidate, args, explicitTypeArgs, scope, expanded) {
        var method = candidate.member;
        var owner = candidate.owner;
        var ownerMap = owner !== null ? CS.typeMap(owner) : new Map();
        var params = method.params;
        var result = { ok: false, candidate: candidate, method: method, owner: owner, expanded: expanded, score: 0, error: null };
        // The parameter of every argument.
        var mapping = [];
        var used = [];
        var lastFixed = expanded ? params.length - 1 : params.length;
        for (var index = 0; index < args.length; ++index) {
            var arg = args[index];
            var paramIndex = -1;
            if (arg.name !== null) {
                for (var search = 0; search < params.length; ++search) {
                    if (params[search].name === arg.name)
                        paramIndex = search;
                }
                if (paramIndex < 0) {
                    result.error = { kind: 'name', arg: arg, index: index };
                    return result;
                }
                if (expanded && paramIndex === params.length - 1) {
                    result.error = { kind: 'name', arg: arg, index: index };
                    return result;
                }
            } else {
                paramIndex = index < lastFixed ? index : (expanded ? params.length - 1 : -1);
                if (paramIndex < 0) {
                    result.error = { kind: 'count' };
                    return result;
                }
            }
            if (used[paramIndex] && !(expanded && paramIndex === params.length - 1)) {
                result.error = { kind: 'duplicate', arg: arg, index: index };
                return result;
            }
            used[paramIndex] = true;
            mapping.push(paramIndex);
        }
        // Parameters without arguments need defaults.
        for (var paramPosition = 0; paramPosition < params.length; ++paramPosition) {
            if (used[paramPosition])
                continue;
            var param = params[paramPosition];
            if (param.hasDefault || (param.isParams && (expanded || false)))
                continue;
            if (param.isParams && !expanded) {
                result.error = { kind: 'missing', param: param };
                return result;
            }
            result.error = { kind: 'missing', param: param };
            return result;
        }
        result.score = 1;
        // Type arguments: given or inferred.
        var typeArgs = [];
        var methodMap = new Map();
        if (method.typeParams.length > 0) {
            if (explicitTypeArgs !== null && explicitTypeArgs !== undefined) {
                if (explicitTypeArgs.length !== method.typeParams.length) {
                    result.error = { kind: 'arity' };
                    return result;
                }
                typeArgs = explicitTypeArgs;
            } else {
                var inferred = this.inferTypeArguments(method, ownerMap, args, mapping, expanded, scope);
                if (inferred === null) {
                    result.error = { kind: 'inference' };
                    return result;
                }
                typeArgs = inferred;
            }
            method.typeParams.forEach(function (param, position) { methodMap.set(param, typeArgs[position]); });
        } else if (explicitTypeArgs !== null && explicitTypeArgs !== undefined && explicitTypeArgs.length > 0) {
            result.error = { kind: 'arity' };
            return result;
        }
        var fullMap = new Map(ownerMap);
        methodMap.forEach(function (value, key) { fullMap.set(key, value); });
        result.typeArgs = typeArgs;
        result.map = fullMap;
        // Every argument converts to its parameter.
        var paramTypes = [];
        for (var argIndex = 0; argIndex < args.length; ++argIndex) {
            var current = args[argIndex];
            var target = params[mapping[argIndex]];
            var type = CS.subst(target.type, fullMap);
            if (expanded && mapping[argIndex] === params.length - 1)
                type = type.elem;
            paramTypes.push(type);
            var refKind = target.refKind;
            if (refKind === 'in' && current.refKind === '')
                refKind = '';
            if (current.refKind !== refKind && !(refKind === 'in' && current.refKind === 'in')) {
                result.error = { kind: 'ref', arg: current, index: argIndex, refKind: refKind };
                return result;
            }
            if (current.outDecl !== null) {
                if (current.declaredType !== undefined && !CS.sameType(current.declaredType, type)) {
                    result.error = { kind: 'convert', arg: current, index: argIndex, type: type };
                    return result;
                }
                continue;
            }
            if (refKind === 'ref' || refKind === 'out') {
                if (!CS.sameType(current.expr.type, type)) {
                    result.error = { kind: 'convert', arg: current, index: argIndex, type: type };
                    return result;
                }
                continue;
            }
            if (!this.convertible(argumentExpr(current), type)) {
                result.error = { kind: 'convert', arg: current, index: argIndex, type: type };
                result.score = 2 + argIndex;
                return result;
            }
        }
        // Constraints of the inferred type arguments.
        if (method.typeParams.length > 0) {
            for (var constraintIndex = 0; constraintIndex < method.typeParams.length; ++constraintIndex) {
                var typeParam = method.typeParams[constraintIndex];
                var ok = this.attemptBind(function () {
                    this.checkConstraint(typeParam, typeArgs[constraintIndex], fullMap, { line: 0, column: 0 }, method);
                    return true;
                }.bind(this));
                if (ok === null) {
                    result.error = { kind: 'constraint', param: typeParam };
                    return result;
                }
            }
        }
        result.mapping = mapping;
        result.paramTypes = paramTypes;
        result.ok = true;
        return result;
    };

    // The best of several applicable candidates (C# 12.6.4.3), or null.
    C.bestCandidate = function (applicable, args) {
        var self = this;
        var best = [];
        applicable.forEach(function (candidate) {
            var beaten = applicable.some(function (other) {
                return other !== candidate && self.betterMember(other, candidate, args) === 1;
            });
            if (!beaten)
                best.push(candidate);
        });
        if (best.length === 1)
            return best[0];
        // Identical signatures from an override and its base: take one.
        if (best.length > 1 && best.every(function (item) { return item.method === best[0].method; }))
            return best[0];
        return null;
    };

    // 1 if first is better than second, 2 if worse, 0 otherwise.
    C.betterMember = function (first, second, args) {
        var firstBetter = false, secondBetter = false;
        for (var index = 0; index < args.length; ++index) {
            var compare = this.betterConversion(args[index], first.paramTypes[index], second.paramTypes[index]);
            if (compare === 1)
                firstBetter = true;
            else if (compare === 2)
                secondBetter = true;
        }
        if (firstBetter && !secondBetter)
            return 1;
        if (secondBetter && !firstBetter)
            return 2;
        if (firstBetter && secondBetter)
            return 0;
        // Tie-breakers: identical parameter types.
        var sameTypes = first.paramTypes.length === second.paramTypes.length && first.paramTypes.every(function (type, position) {
            return CS.sameType(type, second.paramTypes[position]);
        });
        if (!sameTypes)
            return 0;
        // A non-generic method is better than a generic one.
        if (first.method.typeParams.length === 0 && second.method.typeParams.length > 0)
            return 1;
        if (second.method.typeParams.length === 0 && first.method.typeParams.length > 0)
            return 2;
        // The normal form is better than the expanded one.
        if (!first.expanded && second.expanded)
            return 1;
        if (!second.expanded && first.expanded)
            return 2;
        // More declared parameters (in the expanded form).
        if (first.expanded && second.expanded && first.method.params.length !== second.method.params.length)
            return first.method.params.length > second.method.params.length ? 1 : 2;
        // No defaults used is better than defaults filled in.
        var firstDefaults = first.method.params.length - args.length;
        var secondDefaults = second.method.params.length - args.length;
        if (!first.expanded && !second.expanded && firstDefaults !== secondDefaults && (firstDefaults === 0 || secondDefaults === 0))
            return firstDefaults === 0 ? 1 : 2;
        // More specific parameter types (T is less specific than int).
        var specific = this.moreSpecific(first.method, second.method);
        if (specific !== 0)
            return specific;
        // A method of a derived type (an override of a hidden one) or a
        // non-extension one wins.
        if (first.method.isExtension !== second.method.isExtension)
            return first.method.isExtension ? 2 : 1;
        return 0;
    };

    C.moreSpecific = function (first, second) {
        var firstMore = false, secondMore = false;
        var count = Math.min(first.params.length, second.params.length);
        for (var index = 0; index < count; ++index) {
            var compare = specificity(first.params[index].type, second.params[index].type);
            if (compare === 1)
                firstMore = true;
            else if (compare === 2)
                secondMore = true;
        }
        if (firstMore && !secondMore)
            return 1;
        if (secondMore && !firstMore)
            return 2;
        return 0;
    };

    function specificity(left, right) {
        if (left.kind === 'tparam' && right.kind !== 'tparam')
            return 2;
        if (right.kind === 'tparam' && left.kind !== 'tparam')
            return 1;
        if (left.kind === 'named' && right.kind === 'named' && left.sym === right.sym) {
            var more = false, less = false;
            for (var index = 0; index < left.args.length; ++index) {
                var compare = specificity(left.args[index], right.args[index]);
                if (compare === 1)
                    more = true;
                else if (compare === 2)
                    less = true;
            }
            return more && !less ? 1 : (less && !more ? 2 : 0);
        }
        if (left.kind === 'array' && right.kind === 'array')
            return specificity(left.elem, right.elem);
        return 0;
    }

    // The better conversion from an argument to two parameter types
    // (C# 12.6.4.5).
    C.betterConversion = function (arg, first, second) {
        if (CS.sameType(first, second))
            return 0;
        var expr = arg.expr;
        if (arg.outDecl !== null)
            return 0;
        var type = expr.type;
        // An exact match.
        if (type !== undefined && expr.k !== 'methodGroup' && expr.k !== 'unboundLambda') {
            var firstExact = CS.sameType(type, first), secondExact = CS.sameType(type, second);
            if (firstExact && !secondExact)
                return 1;
            if (secondExact && !firstExact)
                return 2;
        }
        // Lambdas: by the return types of the delegates.
        if (expr.k === 'unboundLambda' && CS.isDelegate(first) && CS.isDelegate(second)) {
            var firstInvoke = CS.delegateInvoke(first), secondInvoke = CS.delegateInvoke(second);
            var sameParams = firstInvoke.params.length === secondInvoke.params.length &&
                firstInvoke.params.every(function (param, index) { return CS.sameType(param, secondInvoke.params[index]); });
            if (sameParams) {
                var inferred = this.inferLambdaReturn(expr, firstInvoke.params);
                if (inferred !== null && inferred !== undefined) {
                    if (firstInvoke.returnType.kind !== 'void' && secondInvoke.returnType.kind === 'void' && inferred.kind !== 'void')
                        return 1;
                    if (secondInvoke.returnType.kind !== 'void' && firstInvoke.returnType.kind === 'void' && inferred.kind !== 'void')
                        return 2;
                    if (firstInvoke.returnType.kind !== 'void' && secondInvoke.returnType.kind !== 'void') {
                        var exactFirst = CS.sameType(inferred, firstInvoke.returnType);
                        var exactSecond = CS.sameType(inferred, secondInvoke.returnType);
                        if (exactFirst && !exactSecond)
                            return 1;
                        if (exactSecond && !exactFirst)
                            return 2;
                        return Conversions.betterTarget(firstInvoke.returnType, secondInvoke.returnType);
                    }
                }
            }
        }
        // A constant that fits: int literal 5 to long vs. to double.
        return Conversions.betterTarget(first, second);
    };

    // The resolution with its errors; result: { method, owner, typeArgs,
    // args (converted, in the order of the parameters), returnType,
    // argOrder }.
    C.resolveOverload = function (candidates, args, typeArgs, node, scope, options) {
        var attempt = options.attempt || this.findApplicable(candidates, args, typeArgs, scope);
        var chosen = attempt.best;
        if (chosen === null && attempt.applicable.length > 1) {
            var first = attempt.applicable[0], second = attempt.applicable[1];
            this.error(node, 'CS0121', "The call is ambiguous between the following methods or properties: '" +
                       this.methodText(first.method) + "' and '" + this.methodText(second.method) + "'");
        }
        if (chosen === null)
            this.overloadError(candidates, attempt.failures, args, node, options);
        return this.finishCall(chosen, args, node, scope, options);
    };

    C.overloadError = function (candidates, failures, args, node, options) {
        var name = options.name;
        if (candidates.length === 0)
            this.error(node, 'CS0117', "Method '" + name + "' not found");
        var byCount = failures.filter(function (failure) { return failure.error === null || failure.error.kind !== 'count' &&
                                                               failure.error.kind !== 'missing'; });
        if (byCount.length === 0) {
            if (candidates.length === 1 && failures[0].error.kind === 'missing') {
                var missing = failures[0].error.param;
                this.error(node, 'CS7036', "There is no argument given that corresponds to the required parameter '" + missing.name +
                           "' of '" + this.methodText(candidates[0].member) + "'");
            }
            if (options.delegateName !== undefined)
                this.error(node, 'CS1593', "Delegate '" + CS.typeName(candidates[0].owner) + "' does not take " + args.length + ' arguments');
            if (candidates[0].member.isCtor)
                this.error(node, 'CS1729', "'" + CS.symbolTypeName(candidates[0].member.owner) + "' does not contain a constructor that takes " +
                           (args.length - (options.extension ? 1 : 0)) + ' arguments');
            this.error(node, 'CS1501', "No overload for method '" + name + "' takes " + (args.length - (options.extension ? 1 : 0)) +
                       ' arguments');
        }
        // The failure that got furthest.
        byCount.sort(function (left, right) { return right.score - left.score; });
        var failure = byCount[0];
        var error = failure.error;
        var argNode = error.arg ? (error.arg.node || node) : node;
        var position = error.index !== undefined ? error.index + 1 - (options.extension ? 1 : 0) : 0;
        switch (error.kind) {
        case 'name':
            this.error(error.arg.node || node, 'CS1739', "The best overload for '" + name + "' does not have a parameter named '" +
                       error.arg.name + "'");
            break;
        case 'duplicate':
            this.error(error.arg.node || node, 'CS1740', "Named argument '" + error.arg.name + "' cannot be specified multiple times");
            break;
        case 'inference':
            this.error(node, 'CS0411', "The type arguments for method '" + this.methodText(failure.method) +
                       "' cannot be inferred from the usage. Try specifying the type arguments explicitly.");
            break;
        case 'arity':
            this.error(node, 'CS0305', "Using the generic method '" + this.methodText(failure.method) + "' requires " +
                       failure.method.typeParams.length + ' type arguments');
            break;
        case 'constraint':
            this.error(node, 'CS0311', "The type cannot be used as type parameter '" + error.param.name + "' in the generic type or method '" +
                       this.methodText(failure.method) + "'.");
            break;
        case 'ref':
            if (error.refKind === '')
                this.error(argNode, 'CS1615', 'Argument ' + position + " may not be passed with the '" + error.arg.refKind + "' keyword");
            this.error(argNode, 'CS1620', 'Argument ' + position + " must be passed with the '" + error.refKind + "' keyword");
            break;
        case 'convert': {
            var expr = error.arg.expr;
            if (options.extension && error.index === 0)
                this.error(node, 'CS1929', "'" + CS.typeName(expr.type) + "' does not contain a definition for '" + name +
                           "' and the best extension method overload '" + this.methodText(failure.method) +
                           "' requires a receiver of type '" + CS.typeName(error.type) + "'");
            if (expr === null || expr === undefined) {
                this.error(argNode, 'CS1503', 'Argument ' + position + ": cannot convert from 'out var' to 'out " +
                           CS.typeName(error.type) + "'");
            }
            if (expr.k === 'unboundLambda' || expr.k === 'methodGroup')
                this.convert(expr, error.type, argNode, false);
            var from = expr.type !== undefined ? CS.typeName(expr.type) : (expr.k === 'methodGroup' ? 'method group' : '<' + expr.k + '>');
            if (expr.type !== undefined && expr.type.kind === 'null')
                from = '<null>';
            this.error(argNode, 'CS1503', 'Argument ' + position + ": cannot convert from '" +
                       (error.arg.refKind ? error.arg.refKind + ' ' : '') + from + "' to '" + (error.arg.refKind ? error.arg.refKind + ' ' : '') +
                       CS.typeName(error.type) + "'");
            break;
        }
        }
        this.error(node, 'CS1501', "No overload for method '" + name + "' takes " + args.length + ' arguments');
    };

    // The arguments of the chosen candidate converted, defaults and the
    // params array filled in.
    C.finishCall = function (chosen, args, node, scope, options) {
        var self = this;
        var method = chosen.method;
        var params = method.params;
        var converted = new Array(params.length);
        var expandedItems = [];
        var map = chosen.map;
        var argOrder = null;
        var lastPosition = -1;
        args.forEach(function (arg, index) {
            var paramIndex = chosen.mapping[index];
            if (paramIndex < lastPosition)
                argOrder = argOrder || true;
            lastPosition = Math.max(lastPosition, paramIndex);
            var type = chosen.paramTypes[index];
            var value;
            if (arg.outDecl !== null) {
                value = self.declareOutVariable(arg, type, scope);
            } else if (arg.refKind !== '' && params[paramIndex].refKind !== '' && params[paramIndex].refKind !== 'in') {
                value = bound('refArg', arg.node, { target: arg.expr, refKind: arg.refKind, type: arg.expr.type });
            } else {
                value = self.convert(arg.expr, type, arg.node || node, false);
            }
            value.argPosition = index;
            if (chosen.expanded && paramIndex === params.length - 1)
                expandedItems.push(value);
            else
                converted[paramIndex] = value;
        });
        if (chosen.expanded) {
            var arrayType = CS.subst(params[params.length - 1].type, map);
            converted[params.length - 1] = bound('newArray', node, { type: arrayType, sizes: null, init: expandedItems,
                                                                     paramsArray: true });
        }
        for (var index = 0; index < params.length; ++index) {
            if (converted[index] !== undefined)
                continue;
            var param = params[index];
            var paramType = CS.subst(param.type, map);
            converted[index] = this.defaultArgument(param, paramType, node);
        }
        var returnType = CS.subst(method.returnType, map);
        if (method.isCtor)
            returnType = chosen.owner;
        // Evaluation in the order of the written arguments.
        var order = null;
        if (argOrder !== null)
            order = args.map(function (arg, index) { return chosen.mapping[index]; });
        return { method: method, owner: chosen.owner, typeArgs: chosen.typeArgs, args: converted, returnType: returnType,
                 argOrder: order, expanded: chosen.expanded };
    };

    // The default value of an optional parameter.
    C.defaultArgument = function (param, type, node) {
        if (param.isParams)
            return bound('newArray', node, { type: type, sizes: [this.constant(node, CS.intType(), 0)], init: null, paramsArray: true });
        if (param.defaultValue === undefined) {
            var checker = param.owner && param.owner.owner && param.owner.owner.checker ? param.owner.owner.checker : this;
            var value = checker.bindExpr(param.defaultNode, param.defaultScope);
            if (value.k === 'defaultLiteral' || value.k === 'default' || (value.k === 'new' && value.args.length === 0 && CS.isValueType(value.type))) {
                param.defaultValue = { isDefault: true };
            } else {
                value = checker.convert(value, param.type, param.defaultNode, false);
                if (value.constant === undefined && !(value.k === 'conversion' && value.operand.constant !== undefined))
                    checker.error(param.defaultNode, 'CS1736', "Default parameter value for '" + param.name + "' must be a compile-time constant");
                param.defaultValue = { value: value.constant !== undefined ? value.constant : value.operand.constant, bound: value };
            }
        }
        if (param.defaultValue.isDefault)
            return this.defaultOf(type, node);
        if (param.defaultValue.bound !== undefined && param.defaultValue.bound.k === 'conversion' && CS.sameType(param.defaultValue.bound.type, type))
            return param.defaultValue.bound;
        var literal = this.constant(node, CS.isNullableValue(type) && param.defaultValue.value !== null ? type.args[0] : type,
                                    param.defaultValue.value);
        if (CS.isNullableValue(type) && param.defaultValue.value !== null)
            return this.convert(literal, type, node, false);
        return literal;
    };

    // out var x: a new local with the type of the parameter.
    C.declareOutVariable = function (arg, type, scope) {
        var decl = arg.outDecl;
        if (arg.discard)
            return bound('refArg', decl, { target: bound('discard', decl, { type: type }), refKind: 'out', type: type, discard: true });
        var designation = decl.designation;
        if (designation.k !== 'single')
            this.error(decl, 'CS8185', 'A declaration is not allowed in this context.');
        var local = this.declareLocal(designation.name, arg.declaredType || type, scope, decl, 'local');
        local.assigned = true;
        var target = bound('local', decl, { sym: local, type: local.type });
        return bound('refArg', decl, { target: target, refKind: 'out', type: local.type, declares: local });
    };

    // --- Type inference

    // The type arguments of a generic method from the arguments (C#
    // 12.6.3), or null.
    C.inferTypeArguments = function (method, ownerMap, args, mapping, expanded, scope) {
        var self = this;
        var variables = method.typeParams.map(function (param) {
            return { param: param, exact: [], lower: [], upper: [], value: null };
        });
        var byParam = new Map();
        variables.forEach(function (variable) { byParam.set(variable.param, variable); });
        var params = method.params;
        function paramType(index) {
            var param = params[mapping[index]];
            var type = CS.subst(param.type, ownerMap);
            if (expanded && mapping[index] === params.length - 1)
                type = type.elem;
            return type;
        }
        function unfixedIn(type) {
            var found = false;
            (function walk(current) {
                if (current.kind === 'tparam') {
                    var variable = byParam.get(current.sym);
                    if (variable !== undefined && variable.value === null)
                        found = true;
                } else if (current.kind === 'named') {
                    current.args.forEach(walk);
                } else if (current.kind === 'array') {
                    walk(current.elem);
                }
            })(type);
            return found;
        }
        function substituted(type) {
            var map = new Map();
            variables.forEach(function (variable) {
                if (variable.value !== null)
                    map.set(variable.param, variable.value);
            });
            return CS.subst(type, map);
        }
        // Phase 1: the types of the arguments.
        var pending = [];
        args.forEach(function (arg, index) {
            var target = paramType(index);
            if (arg.outDecl !== null) {
                if (arg.declaredType !== undefined)
                    self.inferExact(arg.declaredType, target, byParam);
                return;
            }
            var expr = arg.expr;
            if (expr.k === 'unboundLambda') {
                // Explicit parameter types give exact bounds.
                if (CS.isDelegate(target) || isExpressionOf(target)) {
                    var delegateType = isExpressionOf(target) ? target.args[0] : target;
                    var lambdaParams = expr.node.params;
                    var invoke = CS.delegateInvoke(delegateType);
                    if (lambdaParams.length === invoke.params.length) {
                        lambdaParams.forEach(function (lambdaParam, position) {
                            if (lambdaParam.type !== null && lambdaParam.type !== undefined) {
                                var explicitType = self.resolveType(lambdaParam.type, expr.scope);
                                self.inferExact(explicitType, invoke.params[position], byParam);
                            }
                        });
                    }
                    pending.push({ expr: expr, target: delegateType });
                }
                return;
            }
            if (expr.k === 'methodGroup') {
                if (CS.isDelegate(target))
                    pending.push({ expr: expr, target: target });
                return;
            }
            if (expr.k === 'tupleLiteral' || expr.k === 'targetNew' || expr.k === 'defaultLiteral' || expr.k === 'collectionLiteral' ||
                expr.k === 'targetTyped')
                return;
            if (expr.type === undefined || expr.type.kind === 'null')
                return;
            if (arg.refKind === 'ref' || arg.refKind === 'out')
                self.inferExact(expr.type, target, byParam);
            else
                self.inferLower(expr.type, target, byParam);
        });
        // Phase 2: fix what can be fixed, then the outputs of lambdas.
        for (var round = 0; round < variables.length + pending.length + 2; ++round) {
            var progressed = false;
            // Lambdas whose parameter types are known give their return types.
            pending = pending.filter(function (item) {
                var invoke = CS.delegateInvoke(item.target);
                var inputsKnown = invoke.params.every(function (param) { return !unfixedIn(param); });
                if (!inputsKnown)
                    return true;
                if (!unfixedIn(invoke.returnType))
                    return false;
                var inputTypes = invoke.params.map(substituted);
                var returned;
                if (item.expr.k === 'unboundLambda')
                    returned = self.inferLambdaReturn(item.expr, inputTypes);
                else
                    returned = self.methodGroupReturn(item.expr, inputTypes);
                if (returned !== null && returned !== undefined && returned.kind !== 'void') {
                    self.inferLower(returned, invoke.returnType, byParam);
                    progressed = true;
                }
                return false;
            });
            // Fix the variables that are not inputs of pending lambdas.
            variables.forEach(function (variable) {
                if (variable.value !== null)
                    return;
                var dependsOnPending = pending.some(function (item) {
                    var invoke = CS.delegateInvoke(item.target);
                    return invoke.params.some(function (param) { return mentions(param, variable.param); });
                });
                var hasBounds = variable.exact.length + variable.lower.length + variable.upper.length > 0;
                if (dependsOnPending && !hasBounds)
                    return;
                if (!hasBounds)
                    return;
                var fixedType = self.fixVariable(variable);
                if (fixedType === null)
                    return;
                variable.value = fixedType;
                progressed = true;
            });
            if (variables.every(function (variable) { return variable.value !== null; }))
                break;
            if (!progressed) {
                // Fix whatever has bounds, even if a lambda depends on it.
                var any = false;
                variables.forEach(function (variable) {
                    if (variable.value === null && variable.exact.length + variable.lower.length + variable.upper.length > 0) {
                        var value = self.fixVariable(variable);
                        if (value !== null) {
                            variable.value = value;
                            any = true;
                        }
                    }
                });
                if (!any)
                    break;
            }
        }
        if (!variables.every(function (variable) { return variable.value !== null; }))
            return null;
        return variables.map(function (variable) { return variable.value; });
    };

    function isExpressionOf(type) {
        return type.kind === 'named' && type.sym.qname === 'System.Linq.Expressions.Expression' && type.args.length === 1;
    }

    function mentions(type, param) {
        if (type.kind === 'tparam')
            return type.sym === param;
        if (type.kind === 'named')
            return type.args.some(function (arg) { return mentions(arg, param); });
        if (type.kind === 'array')
            return mentions(type.elem, param);
        return false;
    }

    // An exact inference from U to V.
    C.inferExact = function (source, target, byParam) {
        if (target.kind === 'tparam' && byParam.has(target.sym)) {
            addBound(byParam.get(target.sym).exact, source);
            return;
        }
        if (source.kind === 'array' && target.kind === 'array' && source.rank === target.rank) {
            this.inferExact(source.elem, target.elem, byParam);
            return;
        }
        if (source.kind === 'named' && target.kind === 'named' && source.sym === target.sym) {
            for (var index = 0; index < target.args.length; ++index)
                this.inferExact(source.args[index], target.args[index], byParam);
        }
    };

    // A lower-bound inference from U to V: U converts to V.
    C.inferLower = function (source, target, byParam) {
        if (target.kind === 'tparam' && byParam.has(target.sym)) {
            addBound(byParam.get(target.sym).lower, source);
            return;
        }
        if (source.kind === 'array' && target.kind === 'array' && source.rank === target.rank) {
            if (CS.isReferenceType(source.elem))
                this.inferLower(source.elem, target.elem, byParam);
            else
                this.inferExact(source.elem, target.elem, byParam);
            return;
        }
        if (CS.isNullableValue(target) && CS.isNullableValue(source)) {
            this.inferExact(source.args[0], target.args[0], byParam);
            return;
        }
        if (CS.isNullableValue(target) && CS.isValueType(source)) {
            this.inferLower(source, target.args[0], byParam);
            return;
        }
        if (target.kind !== 'named')
            return;
        // The supertype of U with the generic type of V.
        var match = null;
        if (source.kind === 'named' && source.sym === target.sym) {
            match = source;
        } else if (source.kind === 'named' || source.kind === 'array' || source.kind === 'tparam') {
            match = CS.asSuper(source, target.sym);
        }
        if (match === null)
            return;
        var params = target.sym.allTypeParams;
        for (var index = 0; index < target.args.length; ++index) {
            var variance = params[index].variance;
            var sourceArg = match.args[index], targetArg = target.args[index];
            if (variance === 'out' && CS.isReferenceType(sourceArg))
                this.inferLower(sourceArg, targetArg, byParam);
            else if (variance === 'in' && CS.isReferenceType(sourceArg))
                this.inferUpper(sourceArg, targetArg, byParam);
            else
                this.inferExact(sourceArg, targetArg, byParam);
        }
    };

    C.inferUpper = function (source, target, byParam) {
        if (target.kind === 'tparam' && byParam.has(target.sym)) {
            addBound(byParam.get(target.sym).upper, source);
            return;
        }
        if (source.kind === 'named' && target.kind === 'named' && source.sym === target.sym) {
            for (var index = 0; index < target.args.length; ++index)
                this.inferExact(source.args[index], target.args[index], byParam);
        }
    };

    function addBound(list, type) {
        if (!list.some(function (other) { return CS.sameType(other, type); }))
            list.push(type);
    }

    // Fixing: the candidate to which all lower bounds convert and which
    // converts to all upper bounds.
    C.fixVariable = function (variable) {
        var candidates = variable.exact.concat(variable.lower).concat(variable.upper);
        var fitting = candidates.filter(function (candidate) {
            return variable.exact.every(function (exact) { return CS.sameType(exact, candidate); }) &&
                variable.lower.every(function (lower) { return Conversions.implicit(lower, candidate) !== null; }) &&
                variable.upper.every(function (upper) { return Conversions.implicit(candidate, upper) !== null; });
        });
        if (fitting.length === 0)
            return null;
        if (fitting.length === 1)
            return fitting[0];
        var best = fitting.filter(function (candidate) {
            return fitting.every(function (other) { return other === candidate || Conversions.implicit(other, candidate) !== null; });
        });
        if (best.length >= 1) {
            // Tuples with names: the names of the first bound.
            return best[0];
        }
        return null;
    };

    // --- Lambdas

    C.bind_lambda = function (node, scope) {
        return bound('unboundLambda', node, { node: node, scope: scope });
    };

    // A lambda fits a delegate type: the parameters match and the body
    // binds with them.
    C.lambdaCompatible = function (expr, delegateType) {
        var invoke = CS.delegateInvoke(delegateType);
        var node = expr.node;
        if (!node.noParams && node.params.length !== invoke.params.length)
            return false;
        var self = this;
        for (var index = 0; !node.noParams && index < node.params.length; ++index) {
            var param = node.params[index];
            if ((param.refKind || '') !== (invoke.refKinds[index] || ''))
                return false;
            if (param.type !== null && param.type !== undefined) {
                var explicitType = this.resolveType(param.type, expr.scope);
                if (!CS.sameType(explicitType, invoke.params[index]))
                    return false;
            }
        }
        var result = this.attemptBind(function () { return self.bindLambda(expr, delegateType, node, true); });
        return result !== null;
    };

    C.lambdaError = function (expr, delegateType, node) {
        var invoke = CS.delegateInvoke(delegateType);
        var lambda = expr.node;
        if (!lambda.noParams && lambda.params.length !== invoke.params.length)
            this.error(node, 'CS1593', "Delegate '" + CS.typeName(delegateType) + "' does not take " + lambda.params.length + ' arguments');
        this.bindLambda(expr, delegateType, node);
        this.error(node, 'CS1661', "Cannot convert lambda expression to type '" + CS.typeName(delegateType) +
                   "' because the parameter types do not match the delegate parameter types");
    };

    // The return type a lambda gets with these parameter types (for
    // inference); null if the body does not bind.
    C.inferLambdaReturn = function (expr, paramTypes) {
        var key = paramTypes.map(CS.typeKey).join(',');
        expr.inferred = expr.inferred || Object.create(null);
        if (expr.inferred[key] !== undefined)
            return expr.inferred[key];
        var self = this;
        var result = this.attemptBind(function () {
            return self.bindLambdaBody(expr, paramTypes, null, expr.node, true);
        });
        var type = result === null ? null : result.returnType;
        expr.inferred[key] = type;
        return type;
    };

    // The natural type of a lambda (C# 10): explicit parameter types, the
    // inferred return type - Func<...> or Action<...>.
    C.naturalLambdaType = function (expr) {
        var node = expr.node;
        var self = this;
        if (node.params.some(function (param) { return param.type === null || param.type === undefined || param.refKind; }))
            return null;
        var paramTypes = node.params.map(function (param) { return self.resolveType(param.type, expr.scope); });
        var returnType = node.returnType !== null && node.returnType !== undefined
            ? this.resolveType(node.returnType, expr.scope, { allowVoid: true }) : this.inferLambdaReturn(expr, paramTypes);
        if (returnType === null || returnType === undefined)
            return null;
        return this.functionType(paramTypes, returnType);
    };

    // Func<T1.., TResult> or Action<T1..>.
    C.functionType = function (paramTypes, returnType) {
        if (returnType.kind === 'void') {
            if (paramTypes.length === 0)
                return CS.libraryType('System.Action');
            return CS.libraryType('System.Action`' + paramTypes.length, paramTypes);
        }
        return CS.libraryType('System.Func`' + (paramTypes.length + 1), paramTypes.concat([returnType]));
    };

    // The bound lambda for a delegate type.
    C.bindLambda = function (expr, delegateType, node, speculative) {
        var invoke = CS.delegateInvoke(delegateType);
        var result = this.bindLambdaBody(expr, invoke.params, invoke.returnType, node, speculative, delegateType);
        return bound('lambda', expr.node, { type: delegateType, params: result.params, body: result.body, fn: result.fn,
                                            isAsync: !!expr.node.isAsync, expression: result.expression });
    };

    // Binds the body of a lambda; returnType null - infer it. Result: {
    // params, body, returnType, fn, expression }.
    C.bindLambdaBody = function (expr, paramTypes, returnType, node, speculative, delegateType) {
        var self = this;
        var lambda = expr.node;
        var outer = this.currentFunctionInfo(expr.scope);
        var isAsync = !!lambda.isAsync;
        var fn = { kind: 'lambda', isAsync: isAsync, isStatic: !!lambda.isStatic, returnType: null, infer: returnType === null,
                   returns: [], parent: outer, calls: [], usesThis: false, iterator: false, node: lambda, delegateType: delegateType };
        // The type the return statements give: T of Task<T> in an async lambda.
        if (returnType !== null) {
            fn.declaredReturn = returnType;
            if (isAsync) {
                if (returnType.kind === 'void') {
                    fn.returnType = CS.VOID;
                    fn.asyncVoid = true;
                } else if (this.isTaskType(returnType)) {
                    fn.returnType = this.taskResultType(returnType);
                } else {
                    this.error(node, 'CS4010', "Cannot convert async lambda expression to delegate type '" +
                               CS.typeName(delegateType || returnType) + "'. An async lambda expression may return void, Task or Task<T>, none of which are convertible to '" +
                               CS.typeName(delegateType || returnType) + "'.");
                }
            } else {
                fn.returnType = returnType;
            }
        }
        if (lambda.returnType !== null && lambda.returnType !== undefined) {
            var explicitReturn = this.resolveType(lambda.returnType, expr.scope, { allowVoid: true });
            if (returnType !== null && !CS.sameType(explicitReturn, returnType))
                this.error(node, 'CS8934', 'Cannot convert lambda expression to type because the return type does not match the delegate return type');
            fn.returnType = explicitReturn;
            fn.infer = false;
        }
        var scope = expr.scope.child('lambda', { fn: fn });
        var params = (lambda.noParams ? paramTypes.map(function (type, index) { return { name: '$p' + index, type: null }; }) : lambda.params)
            .map(function (param, index) {
                var type = param.type !== null && param.type !== undefined ? self.resolveType(param.type, expr.scope) : paramTypes[index];
                if (type === undefined)
                    self.error(param, 'CS1593', 'Delegate does not take ' + lambda.params.length + ' arguments');
                if (param.name === '_' && lambda.params.filter(function (other) { return other.name === '_'; }).length > 1)
                    return self.discardParam(type, index);
                var local = self.declareLocal(param.name, type, scope, param, 'param');
                local.refKind = param.refKind || '';
                local.assigned = true;
                return local;
            });
        // A lambda of a query: the range variables are members of the
        // transparent identifier (the first parameter).
        if (lambda.ranges) {
            lambda.ranges.forEach(function (range) {
                if (range.path.length === 0)
                    return;
                var rangeLocal = CS.LocalSymbol(range.name, null, 'range');
                rangeLocal.base = params[0];
                rangeLocal.path = range.path;
                scope.declare(rangeLocal);
            });
        }
        var body, expression = false;
        if (lambda.body.k === 'block') {
            body = this.bindBlock(lambda.body, scope);
            this.checkFunctionEnd(fn, body, lambda, 'lambda');
        } else {
            expression = true;
            var value = this.bindExpr(lambda.body, scope);
            if (value.k === 'throwExpr' && (fn.infer || fn.returnType.kind === 'void')) {
                // () => throw ...: a body that only throws.
                body = bound('block', lambda.body, { statements: [bound('throw', lambda.body, { expr: value.expr })], locals: [] });
            } else if (fn.infer) {
                value = this.requireValueOrVoid(value, lambda.body);
                if (value.type.kind !== 'void')
                    fn.returns.push(value);
                body = bound('block', lambda.body, { statements: [value.type.kind === 'void'
                    ? bound('expr', lambda.body, { expr: value })
                    : bound('return', lambda.body, { expr: value })], locals: [] });
            } else if (fn.returnType.kind === 'void') {
                value = this.requireValueOrVoid(value, lambda.body);
                if (!this.isStatementExpression(lambda.body, value))
                    this.error(lambda.body, 'CS0201', 'Only assignment, call, increment, decrement, await, and new object expressions can be used as a statement');
                body = bound('block', lambda.body, { statements: [bound('expr', lambda.body, { expr: value })], locals: [] });
            } else {
                var converted = this.convert(value, fn.returnType, lambda.body, false);
                body = bound('block', lambda.body, { statements: [bound('return', lambda.body, { expr: converted })], locals: [] });
            }
        }
        var inferredReturn;
        if (fn.infer) {
            if (fn.returns.length === 0) {
                inferredReturn = CS.VOID;
            } else {
                inferredReturn = this.bestCommonType(fn.returns);
                if (inferredReturn === null)
                    inferredReturn = fn.returns[0].type;
            }
            if (isAsync)
                inferredReturn = inferredReturn.kind === 'void' ? CS.libraryType('System.Threading.Tasks.Task')
                                                                : CS.libraryType('System.Threading.Tasks.Task`1', [inferredReturn]);
        } else {
            inferredReturn = fn.declaredReturn || fn.returnType;
        }
        if (!speculative)
            this.registerFunction(fn, scope);
        return { params: params, body: body, returnType: inferredReturn, fn: fn, expression: expression };
    };

    C.discardParam = function (type, index) {
        var local = CS.LocalSymbol('_', type, 'param');
        local.jsName = '$d' + index;
        local.discard = true;
        return local;
    };

    C.requireValueOrVoid = function (expr, node) {
        if (expr.k === 'call' || expr.k === 'delegateCall' || expr.k === 'nothing')
            return expr;
        return this.requireValue(expr, node);
    };

    // An expression that may stand as a statement (C# 13.7).
    C.isStatementExpression = function (node, expr) {
        switch (node.k) {
        case 'call':
        case 'assign':
        case 'preIncrement':
        case 'postIncrement':
        case 'await':
        case 'new':
        case 'throwExpr':
            return true;
        case 'condAccess':
            return this.isStatementExpression(node.access, expr);
        case 'paren':
            return false;
        }
        return false;
    };

    // --- Method groups as delegates

    // The method of a group for a delegate type, as a bound delegate
    // creation; node null - a test (null if none).
    C.methodGroupConversion = function (group, delegateType, node) {
        var invoke = CS.delegateInvoke(delegateType);
        var args = invoke.params.map(function (type, index) {
            var placeholder = bound('placeholder', node, { type: type });
            return { name: null, refKind: invoke.refKinds[index], node: node, outDecl: null, expr: placeholder };
        });
        var candidates = group.methods;
        var scope = group.scope || null;
        var attempt = this.findApplicable(candidates, args, group.typeArgs, scope);
        var extension = false;
        if (attempt.best === null && group.receiver !== null && candidates.length === 0 && group.scopeForExtensions) {
            var extensions = this.extensionCandidates(group.name, group.scopeForExtensions);
            args = [{ name: null, refKind: '', node: node, outDecl: null, expr: group.receiver }].concat(args);
            attempt = this.findApplicable(extensions, args, group.typeArgs, scope);
            extension = true;
        }
        // Parameter types must match exactly for reference conversions only.
        var best = attempt.best;
        if (best === null)
            return null;
        var method = best.method;
        var returnType = CS.subst(method.returnType, best.map);
        var returnOk = invoke.returnType.kind === 'void' ? true
            : CS.sameType(returnType, invoke.returnType) || (CS.isReferenceType(returnType) &&
                                                             Conversions.isImplicitReference(returnType, invoke.returnType));
        if (!returnOk) {
            if (node === null)
                return null;
            this.error(node, 'CS0407', "'" + this.methodText(method) + "' has the wrong return type");
        }
        if (node === null)
            return best;
        var receiver = group.receiver;
        if (extension)
            receiver = group.receiver;
        else if (method.isStatic)
            receiver = null;
        else if (receiver === null && group.implicitThis)
            receiver = bound('this', node, { type: CS.selfType(method.owner), implicit: true });
        else if (receiver === null && !group.localFunction)
            this.error(node, 'CS0120', "An object reference is required for the non-static field, method, or property '" +
                       this.methodText(method) + "'");
        return bound('newDelegate', node, { type: delegateType, method: method, receiver: receiver, ownerType: best.owner,
                                            typeArgs: best.typeArgs, extension: extension, isBase: group.isBase,
                                            localFunction: !!group.localFunction });
    };

    // The return type of a method group called with these argument types
    // (for inference).
    C.methodGroupReturn = function (group, argTypes) {
        var args = argTypes.map(function (type) {
            return { name: null, refKind: '', node: null, outDecl: null, expr: { k: 'placeholder', type: type } };
        });
        var attempt = this.findApplicable(group.methods, args, group.typeArgs, null);
        if (attempt.best === null)
            return null;
        return CS.subst(attempt.best.method.returnType, attempt.best.map);
    };

    // A method group with one method has a natural delegate type (C# 10).
    C.naturalMethodGroupType = function (group) {
        if (group.methods.length !== 1)
            return null;
        var method = group.methods[0].member;
        if (method.typeParams.length > 0 && (group.typeArgs === null || group.typeArgs === undefined))
            return null;
        if (method.params.some(function (param) { return param.refKind !== '' || param.isParams; }))
            return null;
        var map = CS.typeMap(group.methods[0].owner || CS.objectType());
        if (method.typeParams.length > 0)
            method.typeParams.forEach(function (param, index) { map.set(param, group.typeArgs[index]); });
        return this.functionType(method.params.map(function (param) { return CS.subst(param.type, map); }),
                                 CS.subst(method.returnType, map));
    };

    // --- Object creation

    C.bind_new = function (node, scope) {
        var self = this;
        if (node.type === null) {
            var targetArgs = this.bindArguments(node.args, scope);
            return bound('targetNew', node, { node: node, args: targetArgs, scope: scope });
        }
        var type = this.resolveType(node.type, scope);
        var args = this.bindArguments(node.args, scope);
        return this.createObject(type, args, node, scope);
    };

    // new() with the target type.
    C.bindTargetNew = function (expr, target, node) {
        return this.createObject(target, expr.args, expr.node, expr.scope);
    };

    C.createObject = function (type, args, node, scope) {
        var init = node.init;
        if (type.kind === 'tparam') {
            if (!type.sym.constraints.new && !type.sym.constraints.struct)
                this.error(node, 'CS0304', "Cannot create an instance of the variable type '" + type.sym.name +
                           "' because it does not have the new() constraint");
            if (args.length > 0)
                this.error(node, 'CS0417', "'" + type.sym.name + "': cannot provide arguments when creating an instance of a variable type");
            return this.withInitializer(bound('newTypeParam', node, { type: type }), init, scope);
        }
        if (type.kind !== 'named')
            this.error(node, 'CS1526', 'A new expression requires an argument list or (), [], or {} after type');
        var sym = type.sym.complete();
        if (sym.kind === 'interface' || sym.mods.abstract)
            this.error(node, 'CS0144', "Cannot create an instance of the abstract type or interface '" + CS.typeName(type) + "'");
        if (sym.mods.static)
            this.error(node, 'CS0712', "Cannot create an instance of the static class '" + CS.typeName(type) + "'");
        if (sym.kind === 'delegate') {
            if (args.length !== 1)
                this.error(node, 'CS0149', 'Method name expected');
            return this.convert(args[0].expr, type, node, false);
        }
        if (sym.kind === 'enum' || (CS.isNumeric(type) || CS.isSpecial(type, 'bool')) && args.length === 0)
            return this.withInitializer(this.defaultOf(type, node), init, scope);
        if (CS.isNullableValue(type) && args.length === 0)
            return bound('literal', node, { type: type, constant: null });
        if (CS.isNullableValue(type) && args.length === 1)
            return this.convert(this.convert(args[0].expr, type.args[0], node, false), type, node, false);
        var ctors = this.accessible(sym.ctors.map(function (ctor) { return { member: ctor, owner: type }; }), scope.currentType());
        if (ctors.length === 0)
            this.error(node, 'CS0122', "'" + CS.typeName(type) + "." + sym.name + "()' is inaccessible due to its protection level");
        var result = this.resolveOverload(ctors, args, null, node, scope, { name: sym.name, ctor: true });
        var created = bound('new', node, { type: type, ctor: result.method, args: result.args, argOrder: result.argOrder });
        if (result.method.isDefaultStruct)
            created = bound('default', node, { type: type });
        this.noteCall(scope, result.method, created);
        return this.withInitializer(created, init, scope);
    };

    // Object and collection initializers: { X = 1 } and { 1, 2 }.
    C.withInitializer = function (created, init, scope) {
        if (init === null || init === undefined)
            return created;
        var type = created.type;
        var items;
        if (init.k === 'objectInit')
            items = this.objectInitializer(type, init, scope);
        else
            items = this.collectionInitializer(type, init, scope);
        return bound('initialized', init, { created: created, items: items, type: type });
    };

    // { Name = value, Inner = { ... }, [key] = value }: assignments to the
    // members of the new object (the receiver is a placeholder).
    C.objectInitializer = function (type, init, scope) {
        var self = this;
        var receiver = bound('initTarget', init, { type: type });
        var seen = Object.create(null);
        return init.members.map(function (member) {
            var target;
            if (member.indexArgs !== null) {
                target = self.elementAccess(receiver, { k: 'index', target: null, args: member.indexArgs, line: member.line,
                                                        column: member.column }, scope);
            } else {
                if (seen[member.name])
                    self.error(member, 'CS1912', "Duplicate initialization of member '" + member.name + "'");
                seen[member.name] = true;
                var found = self.accessible(CS.lookupMembers(type, member.name), scope.currentType());
                if (found.length === 0)
                    self.error(member, 'CS0117', "'" + CS.typeName(type) + "' does not contain a definition for '" + member.name + "'");
                var first = found[0].member;
                if (first.symbolKind !== 'field' && first.symbolKind !== 'property')
                    self.error(member, 'CS1913', "Member '" + member.name + "' cannot be initialized. It is not a field or property.");
                if (first.isStatic)
                    self.error(member, 'CS1914', "Static field or property '" + CS.symbolTypeName(first.owner) + '.' + member.name +
                               "' cannot be assigned in an object initializer");
                target = self.memberResult(found, receiver, false, null, member, scope, {});
            }
            target.inObjectInitializer = true;
            var value = member.value;
            if (value.k === 'objectInit' || value.k === 'collectionInit') {
                // A nested initializer works on the value of the member.
                var nestedItems = value.k === 'objectInit' ? self.objectInitializer(target.type, value, scope)
                                                           : self.collectionInitializer(target.type, value, scope);
                return { kind: 'nested', target: target, items: nestedItems };
            }
            self.checkAssignable(target, member, scope);
            return { kind: 'assign', target: target, value: self.bindAs(value, scope, target.type) };
        });
    };

    // { 1, 2, { "a", 3 } }: Add calls on the new collection.
    C.collectionInitializer = function (type, init, scope) {
        var self = this;
        var enumerable = CS.libraryType('System.Collections.IEnumerable');
        if (!Conversions.isImplicitReferenceOrBoxingOrIdentity(type, enumerable) && !(type.kind === 'tparam'))
            this.error(init, 'CS1922', "Cannot initialize type '" + CS.typeName(type) +
                       "' with a collection initializer because it does not implement 'System.Collections.IEnumerable'");
        var receiver = bound('initTarget', init, { type: type });
        return init.items.map(function (item) {
            var argNodes = item.k === 'complexInit' ? item.items : [item];
            var args = self.bindArguments(argNodes.map(function (expr) {
                return { k: 'arg', name: null, refKind: '', expr: expr, line: expr.line, column: expr.column };
            }), scope);
            var group = self.memberAccess(receiver, 'Add', null, item, scope, null);
            if (group.k !== 'methodGroup')
                self.error(item, 'CS0118', "'Add' is not a method");
            var call = self.bindMethodCallWithArgs(group, args, item, scope);
            return { kind: 'add', call: call };
        });
    };

    // A call of a method group with bound arguments.
    C.bindMethodCallWithArgs = function (group, args, node, scope) {
        var fakeNodes = args.map(function (arg) {
            return { k: 'arg', name: arg.name, refKind: arg.refKind, expr: { k: 'boundArg', bound: arg.expr, line: node.line,
                                                                            column: node.column }, line: node.line, column: node.column };
        });
        return this.bindMethodCall(group, fakeNodes, { k: 'call', target: { line: node.line, column: node.column }, line: node.line,
                                                       column: node.column, args: fakeNodes }, scope);
    };

    // An expression bound already (for calls the translator makes).
    C.bind_boundArg = function (node) {
        return node.bound;
    };

    // --- Functions (fibers and captures)

    C.currentFunctionInfo = function (scope) {
        for (var current = scope; current !== null; current = current.parent) {
            if ((current.kind === 'lambda' || current.kind === 'method') && current.fn !== undefined)
                return current.fn;
        }
        return null;
    };

    C.currentFunction = function (scope) {
        return scope === null ? null : this.currentFunctionInfo(scope);
    };

    // A function body for the analysis of fibers.
    C.registerFunction = function (fn, scope) {
        if (this.speculative > 0)
            return;
        (this.functions = this.functions || []).push(fn);
    };

    // A call in a function (fibers wait when they call waiting methods).
    C.noteCall = function (scope, method, call) {
        if (this.speculative > 0 || scope === null)
            return;
        var fn = this.currentFunctionInfo(scope);
        if (fn === null)
            return;
        fn.calls.push({ method: method, call: call || null });
    };
})(globalThis);
