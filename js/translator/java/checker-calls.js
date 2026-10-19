// Java: calls of methods and constructors - overload resolution (strict,
// with boxing, with a variable number of arguments), inference of type
// arguments, lambdas and method references by the target functional
// interface.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Java = T.java;
    var Checker = Java.Checker;
    if (Checker.prototype.callExpr)
        return;

    var types = Java.types;

    function isDeferred(arg) {
        return arg.k === 'lambda' || arg.k === 'methodref' ||
            (arg.k === 'parens' && isDeferred(arg.expr)) ||
            (arg.k === 'cond' && (isDeferred(arg.then) || isDeferred(arg.otherwise)));
    }

    // Arguments before overload resolution: lambdas and references later, by the target.
    Checker.prototype.preArguments = function (args, env) {
        var self = this;
        return args.map(function (arg) {
            if (isDeferred(arg))
                return { node: arg, deferred: true, type: null };
            self.expr(arg, env, Java.POLY);
            return { node: arg, deferred: false, type: arg.type };
        });
    };

    // Type arguments (a method reference): as expressions checked already.
    function typeArguments(list) {
        return list.map(function (type) { return { node: null, deferred: false, type: type }; });
    }

    function lambdaArity(node) {
        while (node.k === 'parens')
            node = node.expr;
        return node.k === 'lambda' ? node.params.length : -1;
    }

    // The formal parameters of a candidate with new inference variables.
    Checker.prototype.instantiateCandidate = function (candidate, extraMap) {
        var method = candidate.method;
        var map = new Map(candidate.map || []);
        if (extraMap)
            extraMap.forEach(function (value, key) { map.set(key, value); });
        // Explicit type arguments: Collections.<String>emptyList().
        if (candidate.explicit && method.typeParams.length === candidate.explicit.length) {
            method.typeParams.forEach(function (param, index) { map.set(param, candidate.explicit[index]); });
            return { method: method, map: map, ivars: [], formals: method.params.map(function (param) { return Java.subst(param, map); }) };
        }
        var ivars = method.typeParams.map(function (param) {
            var ivar = Java.inferenceVar(param);
            map.set(param, ivar);
            return ivar;
        });
        // Declared bounds: T extends Comparable<? super T>.
        method.typeParams.forEach(function (param, index) {
            param.bounds.forEach(function (bound) {
                ivars[index].upper.push(Java.subst(bound, map));
            });
        });
        return { method: method, map: map, ivars: ivars, formals: method.params.map(function (param) { return Java.subst(param, map); }) };
    };

    // The formal type of the argument index in a call with a variable count.
    function formalAt(instance, index, varargs) {
        var formals = instance.formals;
        if (varargs && index >= formals.length - 1)
            return Java.resolved(formals[formals.length - 1]).elem;
        return formals[index];
    }
    // Whether the candidate applies in a phase: strict (without boxing), loose, varargs.
    Checker.prototype.isApplicable = function (candidate, args, phase, extraMap) {
        var method = candidate.method;
        var count = method.params.length;
        if (phase === 'varargs') {
            if (!method.varargs || args.length < count - 1)
                return false;
        } else if (args.length !== count) {
            return false;
        }
        var mark = Java.markBounds();
        var instance = this.instantiateCandidate(candidate, extraMap);
        var ok = true;
        for (var index = 0; index < args.length && ok; ++index) {
            var formal = Java.resolved(formalAt(instance, index, phase === 'varargs'));
            var arg = args[index];
            if (arg.deferred) {
                var functional = formal.kind === 'class' ? Java.functionalMethod(formal) : null;
                if (functional === null) {
                    ok = false;
                } else {
                    var arity = lambdaArity(arg.node);
                    if (arity >= 0 && arity !== functional.method.params.length)
                        ok = false;
                    else if (!lambdaShapeFits(arg.node, Java.resolved(functional.method.returns).kind === 'void'))
                        ok = false;
                }
                continue;
            }
            // An unresolved nested call - by what is known about it already.
            var argType = arg.type;
            if (!Java.isProper(argType))
                argType = Java.provisional(argType) || argType;
            if (!Java.isConvertible(argType, formal, phase === 'strict'))
                ok = false;
        }
        Java.rollbackBounds(mark);
        return ok;
    };

    // Whether the body of a lambda has a return with a value and one without
    // (nested lambdas and classes do not count: their return is in
    // expressions, not statements).
    function lambdaReturns(statements, found) {
        statements.forEach(function visit(node) {
            if (node === null || node === undefined)
                return;
            switch (node.k) {
            case 'return':
                if (node.expr === null)
                    found.bare = true;
                else
                    found.value = true;
                return;
            case 'block':
                node.statements.forEach(visit);
                return;
            case 'if':
                visit(node.then);
                visit(node.otherwise);
                return;
            case 'while':
            case 'do':
            case 'for':
            case 'foreach':
            case 'labeled':
            case 'sync':
                visit(node.body);
                return;
            case 'try':
                visit(node.body);
                node.catches.forEach(function (clause) { visit(clause.body); });
                visit(node.finalizer);
                return;
            case 'switch':
                node.cases.forEach(function (entry) {
                    if (Array.isArray(entry.body))
                        entry.body.forEach(visit);
                    else
                        visit(entry.body);
                });
                return;
            }
        });
        return found;
    }

    // Whether the shape of a lambda fits a function (JLS 15.27.2): for void
    // - a statement body or a block without a return of a value; for a
    // result - an expression or a block without an empty return that has a
    // return of a value or ends with throw.
    function lambdaShapeFits(node, voidResult) {
        while (node.k === 'parens')
            node = node.expr;
        if (node.k !== 'lambda')
            return true;
        var body = node.body;
        if (body.k !== 'block') {
            if (!voidResult)
                return true;
            var kind = body.k;
            return kind === 'call' || kind === 'assign' || kind === 'prefix' || kind === 'postfix' || kind === 'new';
        }
        var found = lambdaReturns(body.statements, { value: false, bare: false });
        if (voidResult)
            return !found.value;
        var last = body.statements[body.statements.length - 1];
        return !found.bare && (found.value || (last !== undefined && last.k === 'throw') ||
                               (last !== undefined && (last.k === 'while' || last.k === 'for')));
    }

    // The parameter type for comparing overloads: type variables are erased.
    function comparableParam(candidate, index, count, varargs) {
        var params = candidate.method.params;
        var param = varargs && index >= params.length - 1 ? Java.resolved(params[params.length - 1]).elem : params[index];
        return Java.erasure(Java.subst(param, candidate.map || null));
    }

    // m1 is more specific than m2: every parameter of m1 is a subtype of the one of m2.
    function moreSpecific(m1, m2, count, varargs) {
        for (var index = 0; index < count; ++index) {
            var param1 = comparableParam(m1, index, count, varargs);
            var param2 = comparableParam(m2, index, count, varargs);
            if (param1.kind === 'prim' && param2.kind === 'prim') {
                if (!Java.isPrimitiveWidening(param1, param2))
                    return false;
            } else if (param1.kind === 'prim' || param2.kind === 'prim') {
                // int is more specific than Object in a call with a primitive.
                if (param2.kind === 'prim')
                    return false;
            } else if (!Java.isSubtypeNoBounds(param1, param2)) {
                return false;
            }
        }
        if (count === 0 && varargs)
            return true;
        return true;
    }
    // A lambda fits two functions: a function with a result is more
    // specific than a void one (JLS 15.12.2.5) - submit(Callable) before
    // submit(Runnable).
    Checker.prototype.preferValueLambdas = function (applicable, args, varargs) {
        var self = this;
        function returnsValue(candidate, index) {
            var param = Java.resolved(comparableParam(candidate, index, args.length, varargs));
            var functional = param.kind === 'class' ? Java.functionalMethod(Java.classType(param.sym, [])) : null;
            return functional !== null && Java.resolved(functional.method.returns).kind !== 'void';
        }
        var preferred = applicable.filter(function (candidate) {
            return applicable.every(function (other) {
                if (other === candidate)
                    return true;
                for (var index = 0; index < args.length; ++index) {
                    if (!args[index].deferred)
                        continue;
                    if (returnsValue(candidate, index) && !returnsValue(other, index))
                        return true;
                }
                return false;
            });
        });
        void self;
        return preferred;
    };

    Checker.prototype.argumentTypesText = function (args) {
        var self = this;
        return args.map(function (arg) {
            if (arg.deferred)
                return arg.node.k === 'methodref' || (arg.node.k === 'parens' && arg.node.expr.k === 'methodref') ? 'method reference'
                                                                                                                   : 'lambda';
            return self.typeName(Java.finalTypeSafe(arg.type));
        }).join(',');
    };

    // A type for messages: without resolving inference variables.
    Java.finalTypeSafe = function (type) {
        return Java.resolved(type);
    };

    // Overload resolution: { candidate, phase }.
    Checker.prototype.chooseMethod = function (node, candidates, args, name, ownerText, extraMap) {
        var phases = ['strict', 'loose', 'varargs'];
        for (var phaseIndex = 0; phaseIndex < phases.length; ++phaseIndex) {
            var phase = phases[phaseIndex];
            var self = this;
            var applicable = candidates.filter(function (candidate) {
                return self.isApplicable(candidate, args, phase, extraMap);
            });
            if (applicable.length === 0)
                continue;
            if (applicable.length === 1)
                return { candidate: applicable[0], phase: phase };
            var best = applicable.filter(function (candidate) {
                return applicable.every(function (other) { return candidate === other || moreSpecific(candidate, other, args.length, phase === 'varargs'); });
            });
            if (best.length === 0 && applicable.length > 1)
                best = this.preferValueLambdas(applicable, args, phase === 'varargs');
            if (best.length > 1) {
                // Equal signatures (an interface and a class): the concrete method.
                var concrete = best.filter(function (item) { return !item.method.isAbstract; });
                if (concrete.length >= 1)
                    best = [concrete[0]];
                else
                    best = [best[0]];
            }
            if (best.length === 1)
                return { candidate: best[0], phase: phase };
            this.error(node, 'reference to ' + name + ' is ambiguous');
        }
        var argText = this.argumentTypesText(args);
        if (candidates.length === 0)
            this.error(node, 'cannot find symbol: method ' + name + '(' + argText + ')');
        // As javac: if the parameter count fits only one method (without
        // type parameters) - an error about the unsuitable argument.
        var sameArity = candidates.filter(function (candidate) { return candidate.method.params.length === args.length; });
        if (sameArity.length === 1 && sameArity[0].method.typeParams.length === 0 && !sameArity[0].method.varargs) {
            var instance = this.instantiateCandidate(sameArity[0], extraMap);
            for (var index = 0; index < args.length; ++index) {
                var arg = args[index];
                var formal = Java.resolved(formalAt(instance, index, false));
                if (!arg.deferred && arg.node !== null && Java.isProper(arg.type) && Java.isProper(formal) &&
                    !Java.isConvertible(arg.type, formal, false))
                    this.checkAssignable(arg.node, formal);
            }
        }
        if (candidates.length === 1) {
            var only = candidates[0].method;
            var what = only.isCtor ? 'constructor ' + only.owner.name : 'method ' + name;
            // A top-level method of a unit: jshell does not name the class.
            var where = only.owner.isSession ? '' : ' in ' + (only.owner.isInterface() ? 'interface ' : (only.owner.flavor === 'enum' ? 'enum ' : (only.owner.flavor === 'record' ? 'record ' : 'class '))) +
                only.owner.displayName;
            this.error(node, what + where + ' cannot be applied to given types; required: ' +
                       (only.params.length === 0 ? 'no arguments' : only.params.map(function (param) { return Java.typeString(param); }).join(',')) +
                       '; found: ' + (args.length === 0 ? 'no arguments' : argText));
        }
        this.error(node, 'no suitable ' + (candidates[0].method.isCtor ? 'constructor' : 'method') + ' found for ' + name + '(' + argText + ')');
    };
    // Inference for the chosen candidate: arguments, the target, then
    // lambdas. In an argument of another call (POLY) the variables stay
    // unresolved.
    Checker.prototype.completeCall = function (node, choice, args, env, expected, extraMap, extraVars) {
        var self = this;
        var varargs = choice.phase === 'varargs';
        var instance = this.instantiateCandidate(choice.candidate, extraMap);
        args.forEach(function (arg, index) {
            if (!arg.deferred)
                Java.isConvertible(arg.type, formalAt(instance, index, varargs), false);
        });
        var returns = instance.method.isCtor ? null : Java.subst(instance.method.returns, instance.map);
        var resultType = node.resultTypeOverride !== undefined ? node.resultTypeOverride : returns;
        if (resultType !== null && expected !== null && expected !== Java.POLY && !Java.isProper(resultType)) {
            var target = Java.resolved(expected);
            if (target.kind === 'prim')
                target = Java.boxedType(Java.symtab, target);
            if (target.kind !== 'void') {
                var mark = Java.markBounds();
                if (!Java.isConvertible(resultType, target, false))
                    Java.rollbackBounds(mark);
            }
        }
        // Lambdas in the order of the arguments: own ones and those deferred
        // by nested calls (their parameter types are known from this call now).
        args.forEach(function (arg, index) {
            if (arg.deferred) {
                self.deferredArgument(node, { node: arg.node, env: env, formal: formalAt(instance, index, varargs) }, expected);
                return;
            }
            self.takePostponed(arg.node).forEach(function (item) { self.deferredArgument(node, item, expected); });
        });
        // The target itself is not inferred (the body of a lambda whose
        // result is a variable of the outer call): the outer call decides.
        if (expected !== Java.POLY && (expected === null || Java.isProper(expected))) {
            instance.ivars.forEach(Java.resolveVar);
            (extraVars || []).forEach(Java.resolveVar);
        }
        node.instance = instance;
        node.method = instance.method;
        node.varargsCall = varargs;
        return returns;
    };
    // A lambda or a method reference as an argument of a call. If the call
    // is an argument of another one (POLY) and the parameter types of the
    // lambda cannot be inferred yet (Collectors.mapping(Person::name, …)
    // inside groupingBy), the check waits for the outer call.
    Checker.prototype.deferredArgument = function (node, item, expected) {
        if (!this.functionalParamsKnown(item.formal))
            this.exactReferenceBounds(item);
        if (expected === Java.POLY && !this.functionalParamsKnown(item.formal)) {
            (node.postponed = node.postponed || []).push(item);
            return;
        }
        this.expr(item.node, item.env, item.formal);
    };

    // Whether the parameter types of the functional interface formal are
    // known (at least by their bounds).
    Checker.prototype.functionalParamsKnown = function (formal) {
        var target = Java.resolved(formal);
        if (target.kind !== 'class')
            return true;
        var ground = groundFunctional(target);
        var functional = Java.functionalMethod(ground);
        if (functional === null)
            return true;
        return functional.method.params.every(function (param) {
            var type = Java.subst(param, functional.map);
            return Java.isProper(type) || Java.provisional(type) !== null;
        });
    };

    // An exact method reference (Type::method without overloads, JLS
    // 18.2.1): the parameter types of the function are inferred from the
    // parameters of the method, the result from its result. So
    // Comparator.comparing(Person::city) knows T.
    Checker.prototype.exactReferenceBounds = function (item) {
        var node = item.node;
        while (node.k === 'parens')
            node = node.expr;
        if (node.k !== 'methodref' || node.name === 'new')
            return;
        var classType = node.type !== null ? this.resolveType(node.type, item.env) : this.typeQualifierOf(node.target, item.env);
        // A generic class (List::size) - no inference: its type parameters
        // are unknown here.
        if (classType === null || classType.kind !== 'class' || classType.sym.complete().typeParams.length > 0)
            return;
        var methods = Java.findMethods(classType.sym.thisType, node.name);
        if (methods.length !== 1)
            return;
        var method = methods[0].method;
        if (method.varargs || method.typeParams.length > 0)
            return;
        var target = Java.resolved(item.formal);
        if (target.kind !== 'class')
            return;
        var functional = Java.functionalMethod(groundFunctional(target));
        if (functional === null)
            return;
        var params = functional.method.params.map(function (param) { return Java.subst(param, functional.map); });
        var methodParams = method.params.map(function (param) { return Java.subst(param, methods[0].map); });
        if (!method.isStatic) {
            if (params.length !== methodParams.length + 1)
                return;
            Java.isSubtype(params[0], Java.erasure(classType));
            params = params.slice(1);
        } else if (params.length !== methodParams.length) {
            return;
        }
        params.forEach(function (param, index) {
            var methodParam = methodParams[index];
            if (Java.resolved(methodParam).kind !== 'prim')
                Java.isSubtype(param, methodParam);
        });
        var returns = Java.resolved(Java.subst(functional.method.returns, functional.map));
        var methodReturns = Java.subst(method.returns, methods[0].map);
        if (returns.kind !== 'void' && Java.resolved(methodReturns).kind !== 'void') {
            var boxed = Java.resolved(methodReturns).kind === 'prim' ? Java.boxedType(Java.symtab, Java.resolved(methodReturns))
                                                                     : methodReturns;
            if (returns.kind !== 'prim')
                Java.isSubtype(boxed, returns);
        }
    };

    // The type in a method reference Type::method (a name or
    // Outer.Inner) if it is a type and not a variable.
    Checker.prototype.typeQualifierOf = function (node, env) {
        if (node === null)
            return null;
        if (node.k === 'name') {
            if (this.lookupVariable(node.name, env) !== null)
                return null;
            var found = this.lookupTypeName(node.name, env);
            return found === null || found.kind === 'tvar' ? null : found.complete().thisType;
        }
        if (node.k === 'select') {
            var outer = this.typeQualifierOf(node.target, env);
            if (outer === null || outer.kind !== 'class')
                return null;
            var member = Java.findMemberType(outer.sym, node.name);
            return member === null ? null : member.complete().thisType;
        }
        return null;
    };

    // The deferred lambdas of a nested call (and of ?: branches in parentheses).
    Checker.prototype.takePostponed = function (node) {
        var result = [];
        (function collect(item) {
            if (item === null || item === undefined)
                return;
            if (item.postponed) {
                result = result.concat(item.postponed);
                item.postponed = null;
            }
            if (item.k === 'parens') {
                collect(item.expr);
            } else if (item.k === 'cond') {
                collect(item.then);
                collect(item.otherwise);
            }
        })(node);
        return result;
    };

    // The deferred lambdas of an expression without an outer call (a cast
    // operand): checked with what is known.
    Checker.prototype.flushPostponed = function (node) {
        var self = this;
        this.takePostponed(node).forEach(function (item) { self.expr(item.node, item.env, item.formal); });
    };

    // Methods by a simple name: the nearest class that has them, or the
    // top-level methods of the units.
    Checker.prototype.lookupMethods = function (name, env) {
        var depth = 0;
        for (var current = env; current !== null; current = current.parent) {
            if (current.kind === 'class' && !current.cls.isSession) {
                var found = Java.findMethods(current.cls.complete().thisType, name);
                if (found.length > 0)
                    return { candidates: found, cls: current.cls, depth: depth, env: current };
                ++depth;
            }
            if (current.kind === 'top') {
                var session = current.pkg === '' && !current.module ? this.session.userMethods(name, current) : [];
                if (session.length > 0)
                    return { candidates: session, cls: null, depth: -1, env: current };
                var imported = this.staticImported(current, name, 'method');
                if (imported !== null)
                    return { candidates: imported, cls: null, depth: -1, env: current };
            }
        }
        return { candidates: [], cls: null, depth: -1, env: null };
    };

    Checker.prototype.callExpr = function (node, env, expected) {
        var candidates, receiverType = null;
        var name = node.name;
        var target = node.target;
        var ownerText = '';
        if (target === null) {
            var found = this.lookupMethods(name, env);
            candidates = found.candidates;
            node.callKind = 'implicit';
            node.site = found;
        } else if (target.k === 'super') {
            var thisType = this.thisExpr({ k: 'this', qualifier: null, line: target.line, column: target.column }, env);
            var cls = thisType.sym;
            if (target.qualifier !== null) {
                var iface = this.qualifier(target.qualifier, env);
                if (iface.kind !== 'type' || iface.type.kind !== 'class')
                    this.error(target, 'not an enclosing class');
                receiverType = Java.asSuper(cls.thisType, iface.type.sym) || iface.type;
            } else {
                receiverType = cls.superclass || Java.objectType();
            }
            candidates = Java.findMethods(receiverType, name).filter(function (item) { return !item.method.isStatic; });
            node.callKind = 'super';
            node.superType = receiverType;
        } else {
            var qualifier = this.qualifier(target, env);
            if (qualifier.kind === 'package')
                this.error(target, 'cannot find symbol: variable ' + qualifier.name.split('.')[0]);
            if (qualifier.kind === 'type') {
                if (qualifier.type.kind !== 'class')
                    this.error(target, 'cannot select from a type variable');
                receiverType = qualifier.type.sym.complete().thisType;
                candidates = Java.findMethods(receiverType, name);
                node.callKind = 'static';
                ownerText = qualifier.type.sym.displayName;
            } else {
                var resolved = Java.resolved(qualifier.type);
                if (resolved.kind === 'prim')
                    this.error(node, resolved.name + ' cannot be dereferenced');
                if (resolved.kind === 'void')
                    this.error(node, "'void' type not allowed here");
                receiverType = resolved.kind === 'array' ? Java.objectType() : this.classOf(resolved);
                if (receiverType === null)
                    this.error(node, 'cannot find symbol: method ' + name);
                candidates = this.boundMethods(resolved, receiverType, name);
                node.callKind = 'virtual';
                node.receiverType = resolved;
            }
        }
        if (node.typeArgs !== null && node.typeArgs !== undefined) {
            var self = this;
            var explicit = node.typeArgs.map(function (arg) { return self.resolveType(arg, env); });
            candidates = candidates.map(function (candidate) {
                return { method: candidate.method, map: candidate.map, type: candidate.type, explicit: explicit };
            });
        }
        var args = this.preArguments(node.args, env);
        if (candidates.length === 0) {
            var where = receiverType !== null ? ' in ' + (receiverType.sym ? (receiverType.sym.isInterface() ? 'interface ' : 'class ') + receiverType.sym.displayName : this.typeName(receiverType)) : '';
            this.error(node, 'cannot find symbol: method ' + name + '(' + this.argumentTypesText(args) + ')' + where);
        }
        var choice = this.chooseMethod(node, candidates, args, name, ownerText, null);
        var method = choice.candidate.method;
        this.checkCallSite(node, method, env);
        if (method.name === 'getClass' && method.params.length === 0 && node.receiverType !== undefined)
            node.resultTypeOverride = Java.classType(Java.symtab.classNamed('java.lang.Class'), [Java.wildcard(Java.erasure(node.receiverType), true)]);
        var returns = this.completeCall(node, choice, args, env, expected, null, null);
        this.noteCall(method, node.callKind === 'virtual' || (node.callKind === 'implicit' && !method.isStatic));
        if (node.resultTypeOverride !== undefined)
            return node.resultTypeOverride;
        if (method.name === 'clone' && method.params.length === 0 && node.receiverType !== undefined &&
            node.receiverType.kind === 'array')
            return node.receiverType;
        return returns;
    };
    // The methods of a value: for a type variable with several bounds
    // (T extends Object & Comparable<T>) and intersections - from all bounds.
    Checker.prototype.boundMethods = function (type, classType, name) {
        var self = this;
        var parts = type.kind === 'tvar' && type.sym.bounds.length > 1 ? type.sym.bounds
                  : (type.kind === 'inter' ? type.types : null);
        if (parts === null)
            return Java.findMethods(classType, name);
        var result = [];
        parts.forEach(function (part) {
            var partClass = self.classOf(part);
            if (partClass !== null)
                result = result.concat(Java.findMethods(partClass, name));
        });
        return result;
    };

    Checker.prototype.methodText = function (method) {
        return method.name + '(' + method.params.map(function (param) { return Java.typeString(param); }).join(',') + ')';
    };

    Checker.prototype.checkCallSite = function (node, method, env) {
        if (node.callKind === 'static' && !method.isStatic)
            this.error(node, 'non-static method ' + this.methodText(method) + ' cannot be referenced from a static context');
        if (node.callKind === 'implicit' && !method.isStatic && node.site.depth >= 0 && this.isStaticContext(env, node.site.cls))
            this.error(node, 'non-static method ' + this.methodText(method) + ' cannot be referenced from a static context');
        if (node.callKind === 'super' && method.isAbstract)
            this.error(node, 'abstract method ' + this.methodText(method) + ' in ' + method.owner.displayName +
                       ' cannot be accessed directly');
        if (node.callKind === 'virtual' && method.isStatic)
            node.callKind = 'static';
    };

    // --- Constructors

    Checker.prototype.newExpr = function (node, env, expected) {
        var type;
        if (node.outer !== null) {
            var outerType = this.classOf(this.expr(node.outer, env));
            if (node.type.parts.length !== 1)
                this.error(node.type, 'qualified new of static class');
            var member = Java.findMemberType(outerType.sym.complete(), node.type.parts[0].name);
            if (member === null)
                this.error(node.type, 'cannot find symbol: class ' + node.type.parts[0].name);
            var outerEnv = member.classEnv.parent;
            type = this.resolveClassType({ k: 'ctype', parts: [{ name: member.name, args: node.type.parts[0].args }],
                                           line: node.type.line, column: node.type.column }, member.classEnv);
            void outerEnv;
        } else {
            type = this.resolveType(node.type, env);
        }
        if (type.kind !== 'class')
            this.error(node.type, 'unexpected type');
        var sym = type.sym.complete();
        if (node.body === null) {
            if (sym.mods.abstract || sym.isInterface())
                this.error(node, sym.displayName + ' is abstract; cannot be instantiated');
            if (sym.flavor === 'enum')
                this.error(node, 'enum classes may not be instantiated');
        }
        // <> - the type arguments of the class are inferred, as for a method.
        var classMap = null, classVars = [];
        if (type.diamond) {
            classMap = new Map();
            sym.typeParams.forEach(function (param) {
                var ivar = Java.inferenceVar(param);
                classMap.set(param, ivar);
                classVars.push(ivar);
            });
            type = Java.classType(sym, classVars);
        } else {
            classMap = Java.typeMap(type);
        }
        if (node.body !== null)
            return this.anonymousClass(node, env, type, classMap, classVars, expected);
        var args = this.preArguments(node.args, env);
        var candidates = sym.ctors.map(function (ctor) { return { method: ctor, map: null }; });
        var choice = this.chooseMethod(node, candidates, args, sym.name, sym.displayName, classMap);
        node.resultTypeOverride = type;
        this.completeCall(node, choice, args, env, expected, classMap, classVars);
        node.classType = type;
        this.noteOuterInstance(node, sym, env);
        return type;
    };

    // An inner (non-static) class gets the outer instance.
    Checker.prototype.noteOuterInstance = function (node, sym, env) {
        if (!sym.isInner || node.outer !== null)
            return;
        var depth = 0;
        for (var current = env; current !== null; current = current.parent) {
            if (current.kind === 'method' && current.isStatic)
                this.error(node, 'non-static variable this cannot be referenced from a static context');
            if (current.kind === 'class') {
                if (current.cls === sym.outer || Java.asSuper(current.cls.thisType, sym.outer) !== null) {
                    node.outerDepth = depth;
                    return;
                }
                ++depth;
            }
        }
        this.error(node, 'an enclosing instance that contains ' + sym.displayName + ' is required');
    };
    var anonymousCounter = 0;

    // new Type(...) { body }: a class without a name in the current
    // environment (it sees the local variables).
    Checker.prototype.anonymousClass = function (node, env, type, classMap, classVars, expected) {
        var self = this;
        var superSym = type.sym;
        var args = this.preArguments(node.args, env);
        if (classVars.length > 0) {
            if (expected !== null && expected !== Java.POLY)
                Java.isConvertible(type, Java.resolved(expected).kind === 'prim' ? type : expected, false);
            classVars.forEach(Java.resolveVar);
            type = Java.finalType(type);
        }
        var enclosing = env.enclosing('class');
        var body = node.body;
        body.name = '';
        var sym = this.enterClass(body, null, env, '', false);
        sym.isAnonymous = true;
        sym.isLocal = true;
        sym.name = '';
        sym.displayName = '<anonymous ' + Java.typeString(type) + '>';
        sym.enclosingClass = enclosing !== null ? enclosing.cls : null;
        sym.jsId = 'Anonymous$' + (++anonymousCounter);
        sym.binaryName = this.nestedBinaryName(env, null);
        sym.completer = function (target) {
            target.typeParams = [];
            target.thisType = Java.classType(target, []);
            if (superSym.isInterface()) {
                target.superclass = Java.objectType();
                target.interfaces = [type];
            } else {
                target.superclass = type;
                target.interfaces = [];
            }
            self.completeMembers(target);
        };
        sym.complete();
        // The constructor is that of the chosen superclass constructor.
        var superCtors = superSym.isInterface() ? Java.symtab.object.complete().ctors : superSym.ctors;
        var candidates = superCtors.map(function (ctor) { return { method: ctor, map: null }; });
        var choice = this.chooseMethod(node, candidates, args, superSym.name, superSym.displayName,
                                       superSym.isInterface() ? null : Java.typeMap(type));
        node.resultTypeOverride = type;
        this.completeCall(node, choice, args, env, null, superSym.isInterface() ? null : Java.typeMap(type), null);
        var ctor = Java.MethodSymbol('<init>', sym, {});
        ctor.isCtor = true;
        ctor.params = node.instance.formals.slice();
        ctor.varargs = false;
        ctor.jsName = '$init';
        ctor.anonymous = true;
        ctor.superCtor = choice.candidate.method;
        sym.ctors = [ctor];
        node.superCtor = choice.candidate.method;
        node.anonymous = sym;
        node.classType = type;
        if (superSym.isInner && !superSym.isInterface())
            this.noteOuterInstance(node, superSym, env);
        this.checkClassBody(sym);
        return type;
    };
    // --- Lambdas and method references

    // A functional interface without wildcards: Function<? super T, ? extends R>
    // -> Function<T, R>.
    function groundFunctional(type) {
        if (type.args.length === 0)
            return type;
        return Java.classType(type.sym, type.args.map(function (arg, index) {
            arg = Java.resolved(arg);
            if (arg.kind !== 'wild')
                return arg;
            if (arg.bound !== null)
                return arg.bound;
            var param = type.sym.typeParams[index];
            return param.bounds.length > 0 ? Java.erasure(param.bounds[0]) : Java.objectType();
        }));
    }

    // The target of a lambda or a reference: { target, method, params, returns }.
    Checker.prototype.functionalTarget = function (node, expected, what) {
        if (expected === null || expected === Java.POLY)
            this.error(node, what + ' not expected here');
        var target = Java.resolved(expected);
        if (target.kind === 'ivar')
            target = Java.resolveVar(target);
        var ground = target.kind === 'class' ? groundFunctional(target) : null;
        var functional = ground !== null ? Java.functionalMethod(ground) : null;
        if (functional === null)
            this.error(node, 'incompatible types: ' + this.typeName(target) + ' is not a functional interface');
        var map = functional.map;
        return {
            target: ground,
            method: functional.method,
            params: functional.method.params.map(function (param) { return Java.finalType(Java.subst(param, map)); }),
            returns: Java.subst(functional.method.returns, map)
        };
    };

    Checker.prototype.lambdaExpr = function (node, env, expected) {
        var self = this;
        var functional = this.functionalTarget(node, expected, 'lambda expression');
        if (node.params.length !== functional.params.length)
            this.error(node, 'incompatible types: incompatible parameter types in lambda expression');
        var lambdaEnv = env.child('lambda', { lambda: node, returns: functional.returns });
        var bodyEnv = lambdaEnv.child('block');
        node.paramVars = node.params.map(function (param, index) {
            var type = functional.params[index];
            if (param.type !== null) {
                var declared = self.resolveType(param.type, env);
                if (!Java.sameType(declared, type))
                    self.error(param, 'incompatible types: incompatible parameter types in lambda expression');
                type = declared;
            }
            return self.declareLocal(param.name, type, bodyEnv, param, { param: true });
        });
        var returns = functional.returns;
        this.enterFunction({ lambda: node, functional: functional });
        try {
            if (node.body.k === 'block') {
                this.blockStatements(node.body.statements, bodyEnv);
                if (Java.resolved(returns).kind !== 'void' && this.canCompleteNormally(node.body))
                    this.error(node, 'missing return statement');
            } else if (Java.resolved(returns).kind === 'void') {
                this.expr(node.body, bodyEnv);
                var kind = node.body.k;
                if (!(kind === 'call' || kind === 'assign' || kind === 'prefix' || kind === 'postfix' || kind === 'new'))
                    this.error(node.body, 'bad return type in lambda expression: ' + this.typeName(node.body.type) +
                               ' cannot be converted to void');
            } else {
                this.expr(node.body, bodyEnv, returns);
                this.lambdaReturn(node.body, returns);
            }
        } finally {
            this.leaveFunction();
        }
        node.functional = functional;
        return functional.target;
    };

    // The value a lambda returns (an expression or return).
    Checker.prototype.lambdaReturn = function (node, returns) {
        if (!Java.isAssignable(node.type, returns, node.cv)) {
            if (Java.resolved(node.type).kind === 'void')
                this.error(node, 'bad return type in lambda expression: void cannot be converted to ' + this.typeName(returns));
            this.error(node, 'bad return type in lambda expression: ' + this.typeName(Java.finalType(node.type)) +
                       ' cannot be converted to ' + this.typeName(Java.finalType(returns)));
        }
        node.targetType = returns;
    };
    // A method reference: Type::static, Type::instance (the receiver is the
    // first parameter), expr::method, Type::new, int[]::new.
    Checker.prototype.methodRefExpr = function (node, env, expected) {
        var functional = this.functionalTarget(node, expected, 'method reference');
        var params = functional.params;
        node.functional = functional;
        var qualifier;
        if (node.target === null) {
            qualifier = { kind: 'type', type: this.resolveType(node.type, env) };
        } else if (node.target.k === 'super') {
            var thisType = this.thisExpr({ k: 'this', qualifier: null, line: node.line, column: node.column }, env);
            qualifier = { kind: 'super', type: thisType.sym.superclass || Java.objectType() };
        } else {
            qualifier = this.qualifier(node.target, env);
            if (qualifier.kind === 'package')
                this.error(node.target, 'cannot find symbol: variable ' + qualifier.name.split('.')[0]);
        }
        var resultType;
        if (node.name === 'new') {
            if (qualifier.kind !== 'type')
                this.error(node, 'unexpected type');
            var created = qualifier.type;
            if (created.kind === 'array') {
                if (params.length !== 1 || !Java.isConvertible(params[0], types.int, false))
                    this.error(node, 'incompatible types: invalid constructor reference');
                node.refKind = 'arraynew';
                node.arrayType = created;
                resultType = created;
            } else {
                var sym = created.sym.complete();
                if (sym.mods.abstract || sym.isInterface())
                    this.error(node, sym.displayName + ' is abstract; cannot be instantiated');
                var classMap, classVars = [];
                if (created.args.length === 0 && sym.typeParams.length > 0) {
                    classMap = new Map();
                    sym.typeParams.forEach(function (param) {
                        var ivar = Java.inferenceVar(param);
                        classMap.set(param, ivar);
                        classVars.push(ivar);
                    });
                    created = Java.classType(sym, classVars);
                } else {
                    classMap = Java.typeMap(created);
                }
                var candidates = sym.ctors.map(function (ctor) { return { method: ctor, map: null }; });
                var args = typeArguments(params);
                var choice = this.chooseMethod(node, candidates, args, sym.name, sym.displayName, classMap);
                node.resultTypeOverride = created;
                this.completeCall(node, choice, args, env, Java.resolved(functional.returns).kind === 'void' ? null : functional.returns,
                                  classMap, classVars);
                node.refKind = 'new';
                node.classType = created;
                this.noteOuterInstance(node, sym, env);
                resultType = created;
            }
        } else {
            resultType = this.methodRefMethod(node, env, qualifier, params, functional.returns);
        }
        var returns = Java.resolved(functional.returns);
        if (returns.kind !== 'void' && !Java.isAssignable(resultType, returns))
            this.error(node, 'incompatible types: bad return type in method reference; ' + this.typeName(Java.finalType(resultType)) +
                       ' cannot be converted to ' + this.typeName(Java.finalType(returns)));
        return functional.target;
    };
    // Resolution without an error: the choice or null.
    Checker.prototype.tryChoose = function (node, candidates, args, name) {
        if (candidates.length === 0)
            return null;
        try {
            return this.chooseMethod(node, candidates, args, name, '', null);
        } catch (error) {
            if (error instanceof T.CompileError)
                return null;
            throw error;
        }
    };

    Checker.prototype.methodRefMethod = function (node, env, qualifier, params, returns) {
        var name = node.name;
        var target = Java.resolved(returns).kind === 'void' ? null : returns;
        var choice, args;
        if (qualifier.kind === 'type') {
            var owner = qualifier.type.kind === 'class' ? qualifier.type.sym.complete().thisType : this.classOf(qualifier.type);
            var all = Java.findMethods(owner, name);
            var statics = all.filter(function (item) { return item.method.isStatic; });
            var staticArgs = typeArguments(params);
            var staticChoice = this.tryChoose(node, statics, staticArgs, name);
            var unboundChoice = null, unboundArgs = null, receiver = null;
            if (params.length >= 1) {
                receiver = this.classOf(params[0]);
                var receiverSuper = receiver !== null && qualifier.type.kind === 'class' ? Java.asSuper(receiver, qualifier.type.sym) : null;
                if (receiverSuper !== null) {
                    var instances = Java.findMethods(receiverSuper, name).filter(function (item) { return !item.method.isStatic; });
                    unboundArgs = typeArguments(params.slice(1));
                    unboundChoice = this.tryChoose(node, instances, unboundArgs, name);
                }
            }
            if (staticChoice !== null && unboundChoice !== null)
                this.error(node, 'incompatible types: invalid method reference; reference to ' + name + ' is ambiguous');
            if (staticChoice === null && unboundChoice === null)
                this.error(node, 'invalid method reference: cannot find symbol ' + name + '(' +
                           params.map(function (param) { return Java.typeString(param); }).join(',') + ') in ' + Java.typeString(qualifier.type));
            if (staticChoice !== null) {
                choice = staticChoice;
                args = staticArgs;
                node.refKind = 'static';
            } else {
                choice = unboundChoice;
                args = unboundArgs;
                node.refKind = 'unbound';
            }
        } else {
            var receiverType = qualifier.type;
            var classType = this.classOf(receiverType);
            if (classType === null)
                this.error(node, Java.typeString(receiverType) + ' cannot be dereferenced');
            var candidates = Java.findMethods(classType, name).filter(function (item) { return !item.method.isStatic; });
            args = typeArguments(params);
            choice = this.tryChoose(node, candidates, args, name);
            if (choice === null)
                this.error(node, 'invalid method reference: cannot find symbol ' + name + '(' +
                           params.map(function (param) { return Java.typeString(param); }).join(',') + ')');
            node.refKind = qualifier.kind === 'super' ? 'super' : 'bound';
            node.receiverType = receiverType;
        }
        var result = this.completeCall(node, choice, args, env, target, null, null);
        return result;
    };
})(globalThis);
