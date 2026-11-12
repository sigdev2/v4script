// Kotlin: calls - candidates by the levels of Kotlin (locals, implicit
// receivers from the innermost with their members and extensions, the
// file, imports, default imports), arguments to parameters (named,
// defaults, vararg, a trailing lambda), inference of type arguments
// (lambdas after the other arguments), the most specific candidate.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Kt = T.kotlin;
    var Checker = Kt.Checker;
    if (Checker.prototype.resolveCall)
        return;

    // --- Arguments

    // The arguments of a call node as a list; the trailing lambda is the last one.
    Checker.prototype.actuals = function (node) {
        var list = (node.args || []).map(function (arg) {
            return { name: arg.name, spread: arg.spread, value: arg.value, line: arg.line, column: arg.column };
        });
        if (node.lambda !== null && node.lambda !== undefined)
            list.push({ name: null, spread: false, value: node.lambda, trailing: true, line: node.lambda.line,
                        column: node.lambda.column });
        return list;
    };

    function isFunctionLiteral(node) {
        while (node.k === 'paren')
            node = node.expr;
        return node.k === 'lambda' || node.k === 'anonfun';
    }
    Kt.isFunctionLiteral = isFunctionLiteral;

    // Arguments to parameters: { slots: [{ actuals: [], defaulted, vararg }], error } .
    Checker.prototype.mapArguments = function (fn, actuals) {
        var params = fn.params;
        var slots = params.map(function (param) { return { actuals: [], defaulted: false, vararg: param.vararg, named: false }; });
        var position = 0;
        var named = false;
        for (var index = 0; index < actuals.length; ++index) {
            var actual = actuals[index];
            if (actual.trailing) {
                var last = params.length - 1;
                if (last < 0 || slots[last].actuals.length > 0 || (slots[last].vararg && !isFunctionType(params[last].type)))
                    return { error: 'too many arguments', actual: actual };
                slots[last].actuals.push(actual);
                continue;
            }
            if (actual.name !== null) {
                var found = -1;
                for (var paramIndex = 0; paramIndex < params.length; ++paramIndex) {
                    if (params[paramIndex].name === actual.name)
                        found = paramIndex;
                }
                if (found < 0)
                    return { error: 'no parameter with name \'' + actual.name + '\' found.', actual: actual, named: true };
                if (slots[found].actuals.length > 0)
                    return { error: 'an argument is already passed for this parameter.', actual: actual, named: true };
                slots[found].actuals.push(actual);
                slots[found].named = true;
                named = true;
                if (found === position)
                    ++position;
                continue;
            }
            if (named && (position >= params.length || slots[position].actuals.length > 0))
                return { error: 'mixing named and positioned arguments is not allowed.', actual: actual };
            if (position >= params.length)
                return { error: 'too many arguments', actual: actual };
            slots[position].actuals.push(actual);
            if (!params[position].vararg)
                ++position;
        }
        for (var slotIndex = 0; slotIndex < slots.length; ++slotIndex) {
            var slot = slots[slotIndex];
            if (slot.actuals.length > 0)
                continue;
            if (params[slotIndex].hasDefault)
                slot.defaulted = true;
            else if (!params[slotIndex].vararg)
                return { error: 'no value passed for parameter \'' + params[slotIndex].name + '\'.', missing: params[slotIndex] };
        }
        return { slots: slots, error: null };
    };

    function isFunctionType(type) {
        type = Kt.resolved(type);
        return type.kind === 'fun' || Kt.samType(type) !== null;
    }

    // --- Candidates

    // A candidate: { fn, map (of the owner), receiverType (dispatch or
    // extension receiver type), receiver: { kind: 'explicit' | 'implicit'
    // | 'none', implicit }, level, invokeOn (a variable or property whose
    // invoke is called), ctorOf }.

    // The levels of candidates for a call without an explicit receiver.
    Checker.prototype.implicitLevels = function (name, scope) {
        var levels = [];
        var self = this;
        for (var current = scope; current !== null; current = current.parent) {
            var level = [];
            if (current.vars !== null && current.vars.has(name)) {
                var variable = current.vars.get(name);
                level.push({ variable: variable });
            }
            if (current.funs !== null && current.funs.has(name)) {
                current.funs.get(name).forEach(function (fn) {
                    level.push({ fn: fn, map: new Map(), receiverType: fn.receiver, receiver: { kind: 'none' }, local: true });
                });
            }
            if (current.classes !== null && current.classes.has(name))
                level.push({ classRef: current.classes.get(name) });
            if (level.length > 0)
                levels.push(level);
            var receivers = [];
            if (current.receiver !== null)
                receivers.push(current.receiver);
            if (current.kind === 'class' && current.companionReceiver)
                receivers.push(current.companionReceiver);
            receivers.forEach(function (receiver) {
                var memberLevel = [];
                self.membersOf(self.receiverType(receiver), name).forEach(function (item) {
                    memberLevel.push({ member: item.member, map: item.map, implicit: receiver });
                });
                if (current.kind === 'class' && current.cls !== null) {
                    // Nested classes and objects by name (constructors, invoke).
                    var nested = self.nestedClass(receiver.cls || current.cls, name);
                    if (nested !== null && receiver.kind !== 'object')
                        memberLevel.push({ classRef: nested });
                }
                if (memberLevel.length > 0)
                    levels.push(memberLevel);
                var extensions = self.visibleExtensions(name, scope);
                var extensionLevel = extensions.map(function (fn) {
                    return { member: fn, map: new Map(), implicit: receiver, extension: true };
                });
                if (extensionLevel.length > 0)
                    levels.push(extensionLevel);
            });
            if (current.kind === 'class' && current.cls !== null && current.receiver === null && !current.companionReceiver) {
                var staticNested = this.nestedClass(current.cls, name);
                if (staticNested !== null)
                    levels.push([{ classRef: staticNested }]);
            }
            if (current.kind === 'file')
                levels = levels.concat(this.fileLevels(name, current));
        }
        return levels;
    };

    Checker.prototype.receiverType = function (receiver) {
        if (receiver.narrowed !== undefined && receiver.narrowed !== null)
            return receiver.narrowed;
        var fact = this.facts.get(receiverKey(receiver));
        return fact !== undefined ? fact : receiver.type;
    };

    function receiverKey(receiver) {
        if (receiver.key === undefined)
            receiver.key = 'r' + (++receiverCounter);
        return receiver.key;
    }
    var receiverCounter = 0;
    Kt.receiverKey = receiverKey;

    // Top-level declarations: explicit imports, the package, star imports, default imports.
    Checker.prototype.fileLevels = function (name, file) {
        var session = this.session;
        var levels = [];
        var explicit = file.imports[name];
        if (explicit !== undefined) {
            var level = [];
            explicit.forEach(function (item) {
                session.importedDeclarations(item.path).forEach(function (decl) { level.push(decl); });
            });
            if (level.length > 0)
                levels.push(level);
        }
        var own = session.packageDeclarations(file.pkg, name, file);
        if (own.length > 0)
            levels.push(own);
        var star = [];
        file.starImports.forEach(function (pkg) {
            session.packageDeclarations(pkg, name, null).forEach(function (decl) { star.push(decl); });
            var outer = session.lookupClass(pkg);
            if (outer !== null)
                session.objectMembers(outer, name).forEach(function (decl) { star.push(decl); });
        });
        if (star.length > 0)
            levels.push(star);
        var defaults = [];
        session.defaultImports().forEach(function (pkg) {
            session.packageDeclarations(pkg, name, null).forEach(function (decl) { defaults.push(decl); });
        });
        session.globalHostMembers(name).forEach(function (decl) { defaults.push(decl); });
        if (defaults.length > 0)
            levels.push(defaults);
        return levels;
    };

    // Extensions named name visible in the scope (locals, then the file).
    Checker.prototype.visibleExtensions = function (name, scope) {
        var result = [];
        var file = null;
        for (var current = scope; current !== null; current = current.parent) {
            if (current.funs !== null && current.funs.has(name)) {
                current.funs.get(name).forEach(function (fn) {
                    if (fn.receiver !== null)
                        result.push(fn);
                });
            }
            if (current.kind === 'class' && current.cls !== null) {
                // Member extensions of an enclosing class.
                (current.cls.members[name] || []).forEach(function (member) {
                    if (member.receiver !== null && result.indexOf(member) < 0)
                        result.push(member);
                });
            }
            if (current.kind === 'file')
                file = current;
        }
        if (file !== null) {
            this.fileLevels(name, file).forEach(function (level) {
                level.forEach(function (decl) {
                    var member = decl.member || decl.fn;
                    if (member !== undefined && member.receiver !== null && result.indexOf(member) < 0)
                        result.push(member);
                });
            });
        }
        return result;
    };

    // --- Resolution

    // Resolves a call. call: { name, receiver (an explicit receiver node,
    // checked already: its type in receiverType), receiverType, safe,
    // actuals, typeArgs (nodes), node, scope, expected, superCall }. The
    // result: { fn, map, receiver, slots, returns, ... } or an error.
    Checker.prototype.resolveCall = function (call) {
        var levels;
        if ((call.receiverType !== undefined && call.receiverType !== null) || (call.staticOf !== undefined && call.staticOf !== null))
            levels = this.explicitLevels(call);
        else
            levels = this.implicitLevels(call.name, call.scope);
        var tried = [];
        for (var levelIndex = 0; levelIndex < levels.length; ++levelIndex) {
            var candidates = this.expandLevel(levels[levelIndex], call);
            if (candidates.length === 0)
                continue;
            var applicable = [];
            var self = this;
            candidates.forEach(function (candidate) {
                var result = self.tryCandidate(candidate, call, false);
                candidate.result = result;
                tried.push(candidate);
                if (result.ok)
                    applicable.push(candidate);
            });
            if (applicable.length === 0)
                continue;
            var chosen = this.mostSpecific(applicable, call);
            return this.completeCall(chosen, call);
        }
        return this.callFailure(tried, call);
    };

    // Levels for a call with an explicit receiver: members, then extensions.
    Checker.prototype.explicitLevels = function (call) {
        var self = this;
        var levels = [];
        var receiverType = call.receiverType;
        if (call.staticOf !== undefined && call.staticOf !== null) {
            // Foo.bar(): statics of a Java class, enum entries, members of the companion.
            var statics = this.staticsOf(call.staticOf, call.name).map(function (item) {
                return { member: item.member, map: item.map, staticOf: call.staticOf };
            });
            var nested = this.nestedClass(call.staticOf, call.name);
            if (nested !== null)
                statics.push({ classRef: nested });
            if (statics.length > 0)
                levels.push(statics);
            if (receiverType === null)
                return levels;
        }
        var members = this.membersOf(Kt.makeNotNull(receiverType), call.name).map(function (item) {
            return { member: item.member, map: item.map, explicit: true };
        });
        // outer.Inner(): the constructor of an inner class.
        var receiverClass = Kt.resolved(receiverType);
        if (receiverClass.kind === 'class') {
            var inner = this.nestedClass(receiverClass.sym, call.name);
            if (inner !== null && inner.inner)
                members.push({ classRef: inner, innerOf: true });
        }
        var extensions = this.visibleExtensions(call.name, call.scope).map(function (fn) {
            return { member: fn, map: new Map(), explicit: true, extension: true };
        });
        // x.block() for a local variable block of a function type with a receiver.
        for (var current = call.scope; current !== null; current = current.parent) {
            if (current.vars === null || !current.vars.has(call.name))
                continue;
            var variable = current.vars.get(call.name);
            var variableType = Kt.resolved(this.variableType(variable));
            if (variableType.kind === 'fun' && variableType.receiver !== null)
                extensions.unshift({ receiverValue: { variable: variable }, type: variableType });
            break;
        }
        // A member is an unsafe call on a nullable receiver: an extension
        // that takes a nullable receiver wins (x.toString() for x: T).
        var resolvedReceiver = Kt.resolved(receiverType);
        var unsafe = !call.safe && Kt.isNullable(resolvedReceiver) && !resolvedReceiver.flexible;
        if (unsafe && extensions.length > 0)
            levels.push(extensions);
        if (members.length > 0)
            levels.push(members);
        if (!unsafe && extensions.length > 0)
            levels.push(extensions);
        void self;
        return levels;
    };

    // Candidates of a level: functions, invoke on variables and properties, constructors.
    Checker.prototype.expandLevel = function (level, call) {
        var self = this;
        var result = [];
        level.forEach(function (item) {
            if (item.variable !== undefined) {
                if (call.noInvoke)
                    return;
                var type = self.variableType(item.variable);
                self.invokeCandidates(type, call).forEach(function (candidate) {
                    candidate.invokeOn = { variable: item.variable, type: type };
                    result.push(candidate);
                });
                return;
            }
            if (item.classRef !== undefined) {
                if (call.noInvoke || (call.receiverType !== null && call.receiverType !== undefined && !call.staticOf && !item.innerOf))
                    return;
                var cls = item.classRef;
                cls.complete();
                if (cls.kind === 'object') {
                    self.invokeCandidates(Kt.classType(cls, []), call).forEach(function (candidate) {
                        candidate.invokeOn = { object: cls, type: Kt.classType(cls, []) };
                        result.push(candidate);
                    });
                    return;
                }
                var samCtor = self.samConstructor(cls);
                if (samCtor !== null) {
                    result.push({ fn: samCtor, map: new Map(), receiver: { kind: 'none' }, ctorOf: cls });
                    return;
                }
                self.constructorsOf(cls).forEach(function (ctor) {
                    result.push({ fn: ctor, map: new Map(), receiver: { kind: 'none' }, ctorOf: cls });
                });
                return;
            }
            if (item.alias !== undefined) {
                // The type parameters of the alias are those of the call.
                var alias = item.alias;
                if (alias.type === null)
                    alias.type = self.resolveType(alias.node.type, alias.scope);
                var aliased = Kt.resolved(alias.type);
                if (aliased.kind === 'class') {
                    var aliasSam = self.samConstructor(aliased.sym);
                    if (aliasSam !== null) {
                        result.push({ fn: aliasSam, map: Kt.typeMap(aliased), receiver: { kind: 'none' }, ctorOf: aliased.sym,
                                      alias: alias, aliasType: aliased });
                        return;
                    }
                    self.constructorsOf(aliased.sym).forEach(function (ctor) {
                        result.push({ fn: ctor, map: Kt.typeMap(aliased), receiver: { kind: 'none' }, ctorOf: aliased.sym,
                                      alias: alias, aliasType: aliased });
                    });
                }
                return;
            }
            if (item.receiverValue !== undefined) {
                // x.block(): invoke of a value of a function type with a receiver.
                self.invokeCandidates(item.type, call).forEach(function (candidate) {
                    if (!candidate.receiverInvoke)
                        return;
                    var value = item.receiverValue;
                    candidate.explicit = true;
                    candidate.invokeOn = value.variable !== undefined ? { variable: value.variable, type: item.type }
                        : { prop: value.member, map: value.map || new Map(), implicit: value.implicit || null, explicit: false,
                            type: item.type, staticOf: null, objectOf: value.objectOf || null };
                    result.push(candidate);
                });
                return;
            }
            var member = item.member || item.fn;
            if (member === undefined)
                return;
            if (member.kind === 'fun') {
                if (call.isProperty)
                    return;
                result.push({ fn: member, map: item.map || new Map(), implicit: item.implicit || null,
                              explicit: !!item.explicit, extension: member.receiver !== null, staticOf: item.staticOf || null,
                              local: !!item.local, objectOf: item.objectOf || null });
                return;
            }
            if (member.kind === 'prop' && !call.noInvoke) {
                // A property of a function type: invoke.
                var propType = Kt.subst(self.propertyType(member), item.map || new Map());
                self.invokeCandidates(propType, call).forEach(function (candidate) {
                    candidate.invokeOn = { prop: member, map: item.map || new Map(), implicit: item.implicit || null,
                                           explicit: !!item.explicit, type: propType, staticOf: item.staticOf || null,
                                           objectOf: item.objectOf || null };
                    result.push(candidate);
                });
            }
        });
        return result;
    };

    // invoke of a value: a function type or an operator invoke member.
    Checker.prototype.invokeCandidates = function (type, call) {
        type = Kt.resolved(type);
        void call;
        if (type.kind === 'fun') {
            var candidates = this.functionTypeMembers(Kt.makeNotNull(type), 'invoke').map(function (item) {
                return { fn: item.member, map: item.map, receiver: { kind: 'value' }, fnType: type };
            });
            if (type.receiver !== null) {
                // block() with an implicit receiver, x.block() with an explicit one.
                var fn = Kt.FunSym('invoke', null, { operator: true });
                fn.receiver = type.receiver;
                fn.params = type.params.map(function (param, index) { return Kt.ParamSym('p' + (index + 1), param); });
                fn.returns = type.returns;
                fn.operator = true;
                fn.intrinsic = 'invoke';
                fn.suspend = type.suspend;
                candidates.push({ fn: fn, map: new Map(), receiver: { kind: 'value' }, fnType: type, receiverInvoke: true });
            }
            return candidates;
        }
        if (type.kind === 'class' || type.kind === 'param') {
            return this.membersOf(Kt.makeNotNull(type), 'invoke').filter(function (item) {
                return item.member.kind === 'fun' && item.member.operator;
            }).map(function (item) {
                return { fn: item.member, map: item.map, receiver: { kind: 'value' } };
            });
        }
        return [];
    };

    // The SAM constructor of a fun interface or a Java functional interface:
    // Comparator { a, b -> ... }.
    Checker.prototype.samConstructor = function (cls) {
        if (cls.samConstructor !== undefined)
            return cls.samConstructor;
        cls.complete();
        var fn = null;
        if (cls.isInterface()) {
            var type = Kt.classType(cls, cls.typeParams.map(function (param) { return Kt.arg(Kt.paramType(param)); }));
            var sam = Kt.samType(type);
            if (sam !== null) {
                fn = Kt.FunSym(cls.name, cls, {});
                fn.isCtor = true;
                fn.samConstructor = sam;
                fn.params = [Kt.ParamSym('function', sam.type)];
                fn.returns = type;
            }
        }
        cls.samConstructor = fn;
        return fn;
    };

    Checker.prototype.constructorsOf = function (cls) {
        cls.complete();
        if (cls.java !== null && cls.java !== undefined && !cls.mappedBuiltin)
            return cls.ctors;
        return cls.ctors;
    };

    // The type of a variable (a smart cast applies).
    Checker.prototype.variableType = function (variable) {
        var fact = this.facts.get(variable);
        if (fact !== undefined)
            return fact;
        return variable.type;
    };

    // --- Applicability

    // Tries a candidate: argument mapping, receiver, argument types with
    // inference. final - with lambdas (the chosen candidate).
    Checker.prototype.tryCandidate = function (candidate, call, final) {
        var fn = candidate.fn;
        var self = this;
        var actuals = call.actuals;
        // fun interface constructors and SAM constructors are not here.
        var mapping = this.mapArguments(fn, actuals);
        if (mapping.error !== null)
            return { ok: false, reason: 'mapping', mapping: mapping };
        var mark = Kt.markBounds();
        var map = new Map(candidate.map);
        var ivars = [];
        var typeArgs = call.typeArgs;
        var typeParams = this.candidateTypeParams(candidate);
        if (typeArgs !== null && typeArgs !== undefined && typeArgs.length > 0) {
            if (typeArgs.length !== typeParams.length)
                return { ok: false, reason: 'typeArgs', count: typeParams.length };
            typeParams.forEach(function (param, index) { map.set(param, typeArgs[index]); });
        } else {
            typeParams.forEach(function (param) {
                var ivar = Kt.inferenceVar(param);
                ivars.push(ivar);
                map.set(param, ivar);
            });
        }
        if (candidate.alias !== undefined) {
            Kt.typeMap(candidate.aliasType).forEach(function (type, param) { map.set(param, Kt.subst(type, map)); });
        }
        candidate.ivars = ivars;
        candidate.fullMap = map;
        // The receiver of an extension or a member.
        var receiverOk = this.checkCandidateReceiver(candidate, call, map);
        if (!receiverOk) {
            Kt.rollbackBounds(mark);
            return { ok: false, reason: 'receiver' };
        }
        // Bounds of type parameters: T : Comparable<T>.
        typeParams.forEach(function (param) {
            param.bounds.forEach(function (bound) {
                Kt.constrain(map.get(param), Kt.subst(bound, map));
            });
        });
        var failed = null;
        var params = fn.params;
        mapping.slots.forEach(function (slot, index) {
            if (failed !== null)
                return;
            var param = params[index];
            slot.actuals.forEach(function (actual) {
                if (failed !== null)
                    return;
                var paramType = Kt.subst(param.vararg && !actual.spread ? param.elementType || varargElement(param.type) : param.type, map);
                if (isFunctionLiteral(actual.value)) {
                    if (!self.lambdaShapeFits(actual.value, paramType))
                        failed = { actual: actual, paramType: paramType, lambda: true };
                    return;
                }
                if (actual.value.k === 'ref' && !actual.value.checked) {
                    // A callable reference: checked against the parameter type in the final pass.
                    if (!self.referenceFits(actual.value, paramType, call.scope))
                        failed = { actual: actual, paramType: paramType };
                    return;
                }
                if (!self.argumentFits(actual.value, paramType, call.scope))
                    failed = { actual: actual, paramType: paramType };
            });
        });
        if (failed !== null) {
            Kt.rollbackBounds(mark);
            return { ok: false, reason: 'argument', failed: failed, mapping: mapping };
        }
        candidate.mapping = mapping;
        candidate.mark = mark;
        if (!final)
            Kt.rollbackBounds(mark);
        return { ok: true, mapping: mapping };
    };

    function varargElement(type) {
        type = Kt.resolved(type);
        if (type.kind === 'class' && type.sym.name === 'Array')
            return type.args[0].type;
        var elements = { IntArray: 'Int', LongArray: 'Long', ShortArray: 'Short', ByteArray: 'Byte', DoubleArray: 'Double',
                         FloatArray: 'Float', CharArray: 'Char', BooleanArray: 'Boolean' };
        return Kt.builtinType(elements[type.sym.name]);
    }
    Kt.varargElement = varargElement;

    // The type parameters of a candidate: the function's, and of a constructor the class's.
    Checker.prototype.candidateTypeParams = function (candidate) {
        var fn = candidate.fn;
        if (fn.isCtor && candidate.alias !== undefined)
            return candidate.alias.typeParams.concat(fn.typeParams);
        if (fn.isCtor && candidate.ctorOf !== undefined)
            return candidate.ctorOf.typeParams.concat(fn.typeParams);
        return fn.typeParams;
    };

    Checker.prototype.checkCandidateReceiver = function (candidate, call, map) {
        var fn = candidate.fn;
        if (candidate.invokeOn !== undefined && !candidate.receiverInvoke)
            return true;
        if (candidate.receiverInvoke && !candidate.explicit) {
            var expected = Kt.subst(fn.receiver, map);
            var implicitReceivers = call.scope.receivers();
            for (var position = 0; position < implicitReceivers.length; ++position) {
                var receiverMark = Kt.markBounds();
                if (Kt.isSubtype(this.receiverType(implicitReceivers[position]), expected)) {
                    candidate.implicit = implicitReceivers[position];
                    return true;
                }
                Kt.rollbackBounds(receiverMark);
            }
            return false;
        }
        if (fn.receiver !== null) {
            // An extension: the receiver is explicit or one of the implicit ones.
            var receiverType;
            if (candidate.explicit) {
                receiverType = call.receiverType;
            } else if (candidate.implicit !== null && candidate.implicit !== undefined) {
                receiverType = this.receiverType(candidate.implicit);
            } else {
                // A local extension or a top-level one called without a receiver: the implicit receivers.
                var receivers = call.scope.receivers();
                var expectedReceiver = Kt.subst(fn.receiver, map);
                for (var index = 0; index < receivers.length; ++index) {
                    var mark = Kt.markBounds();
                    if (Kt.isSubtype(this.receiverType(receivers[index]), expectedReceiver)) {
                        candidate.implicit = receivers[index];
                        return true;
                    }
                    Kt.rollbackBounds(mark);
                }
                return false;
            }
            var target = Kt.subst(fn.receiver, map);
            if (call.safe)
                receiverType = Kt.makeNotNull(receiverType);
            if (!Kt.isSubtype(receiverType, target)) {
                // A nullable receiver of a member is an error reported later; for extensions it does not fit.
                return false;
            }
            return true;
        }
        if (candidate.explicit && candidate.member !== undefined)
            return true;
        return true;
    };

    // An argument fits a parameter (adds the bounds of inference variables).
    Checker.prototype.argumentFits = function (node, paramType, scope) {
        // 2u is a UInt, a UByte, a UShort or a ULong by the expected type.
        if (this.unsignedLiteral(node) && Kt.isUnsignedKind(Kt.primKind(Kt.makeNotNull(Kt.resolved(paramType)))))
            return true;
        var literal = this.literalValue(node);
        if (literal !== null) {
            var resolvedParam = Kt.resolved(paramType);
            if (resolvedParam.kind === 'class' && literalFits(literal, Kt.primKind(resolvedParam)))
                return true;
            if (resolvedParam.kind === 'class' && resolvedParam.sym === Kt.builtins.Any)
                return true;
        }
        var sam = Kt.samType(paramType);
        var type = this.argumentType(node, scope);
        if (Kt.isSubtype(type, paramType))
            return true;
        // emptySet() for Set<RegexOption>: a generic call takes the type from the parameter.
        if (this.postponable(node) && !Kt.hasFreeVars(paramType)) {
            var savedFacts = this.cloneFacts();
            try {
                if (Kt.isSubtype(this.expr(node, paramType, scope), paramType))
                    return true;
            } catch (error) {
                if (!(error instanceof T.CompileError))
                    throw error;
            } finally {
                this.facts = savedFacts;
            }
        }
        // A value of a function type converts to a Java functional interface.
        if (sam !== null && Kt.resolved(type).kind === 'fun')
            return Kt.isSubtype(type, sam.type);
        return false;
    };

    // An argument checked once without an expected type (for applicability).
    // A call that needs the expected type (compareBy { it.age } as an
    // argument) fits for now: it is checked again with the parameter type.
    Checker.prototype.argumentType = function (node, scope) {
        if (node.argType !== undefined)
            return node.argType;
        var type;
        var savedFacts = this.cloneFacts();
        try {
            type = this.expr(node, null, scope);
        } catch (error) {
            if (!(error instanceof T.CompileError) || !this.postponable(node))
                throw error;
            this.facts = savedFacts;
            type = Kt.ERROR;
            node.postponed = true;
        }
        node.argType = type;
        return type;
    };

    // An argument whose type may come from the parameter (a generic call, if, when).
    Checker.prototype.postponable = function (node) {
        while (node.k === 'paren')
            node = node.expr;
        return node.k === 'call' || node.k === 'if' || node.k === 'when' || node.k === 'try' || node.k === 'binary' ||
            node.k === 'infix' || node.k === 'member';
    };

    Checker.prototype.unsignedLiteral = function (node) {
        while (node.k === 'paren')
            node = node.expr;
        return node.k === 'int' && node.suffix === 'u';
    };

    // The value of an integer literal expression (1, -1, 1 + 2) as a T.big, or null.
    Checker.prototype.literalValue = function (node) {
        while (node.k === 'paren')
            node = node.expr;
        if (node.k === 'int' && node.suffix === '')
            return this.integerValue(node);
        if (node.k === 'prefix' && (node.op === '-' || node.op === '+')) {
            var inner = this.literalValue(node.arg);
            if (inner === null)
                return null;
            return node.op === '-' ? T.big.neg(inner) : inner;
        }
        return null;
    };

    var LIMITS = null;
    function limits() {
        if (LIMITS === null) {
            LIMITS = {
                i8: [(-128), (127)],
                i16: [(-32768), (32767)],
                i32: [(-2147483648), (2147483647)],
                i64: [T.big.parse('-9223372036854775808', 10), T.big.parse('9223372036854775807', 10)]
            };
        }
        return LIMITS;
    }
    Kt.integerLimits = limits;

    function literalFits(value, kind) {
        var range = limits()[kind];
        if (range === undefined)
            return false;
        return T.big.cmp(value, range[0]) >= 0 && T.big.cmp(value, range[1]) <= 0;
    }
    Kt.literalFits = literalFits;

    // A lambda fits a function type by its shape: the number of parameters.
    Checker.prototype.lambdaShapeFits = function (node, paramType) {
        var type = Kt.resolved(paramType);
        var fnType = null;
        if (type.kind === 'fun') {
            fnType = type;
        } else if (type.kind === 'ivar') {
            return true;
        } else if (type.kind === 'class') {
            if (type.sym === Kt.builtins.Any || type.sym === Kt.builtins.Function)
                return true;
            var sam = Kt.samType(type);
            if (sam === null)
                return false;
            fnType = sam.type;
        } else if (type.kind === 'param') {
            return true;
        } else {
            return type.kind === 'error' || type.kind === 'dynamic';
        }
        while (node.k === 'paren')
            node = node.expr;
        var count = fnType.params.length + (fnType.receiver !== null ? 1 : 0);
        if (node.k === 'anonfun')
            return node.params.length + (node.receiver !== null ? 1 : 0) === count;
        if (node.params === null)
            return fnType.params.length <= 1;
        return node.params.length === fnType.params.length;
    };

    // --- The most specific candidate

    Checker.prototype.mostSpecific = function (candidates, call) {
        if (candidates.length === 1)
            return candidates[0];
        var self = this;
        var best = candidates.filter(function (candidate) {
            return candidates.every(function (other) {
                return other === candidate || self.atLeastAsSpecific(candidate, other, call);
            });
        });
        if (best.length > 1) {
            // A candidate without defaults used, without varargs, not generic.
            var narrowed = best.filter(function (candidate) {
                return !candidate.mapping.slots.some(function (slot) { return slot.defaulted; });
            });
            if (narrowed.length > 0)
                best = narrowed;
            narrowed = best.filter(function (candidate) { return candidate.fn.varargIndex < 0; });
            if (narrowed.length > 0)
                best = narrowed;
            narrowed = best.filter(function (candidate) { return self.candidateTypeParams(candidate).length === 0; });
            if (narrowed.length > 0)
                best = narrowed;
            // A Kotlin declaration hides a Java one with the same signature.
            narrowed = best.filter(function (candidate) { return candidate.fn.java === null || candidate.fn.java === undefined; });
            if (narrowed.length > 0)
                best = narrowed;
        }
        if (best.length === 1)
            return best[0];
        if (best.length > 1) {
            var byLambda = this.resolveByLambdaReturn(best, call);
            if (byLambda !== null)
                return byLambda;
            // Equal candidates from different levels of one list: the first.
            if (best.every(function (candidate) { return candidate.fn === best[0].fn; }))
                return best[0];
            this.ambiguity(best, call);
        }
        var byLambdaAll = this.resolveByLambdaReturn(candidates, call);
        if (byLambdaAll !== null)
            return byLambdaAll;
        this.ambiguity(candidates, call);
    };

    Checker.prototype.ambiguity = function (candidates, call) {
        var self = this;
        // An argument that failed on its own fits every candidate: its error comes first.
        call.actuals.forEach(function (actual) {
            if (actual.value.postponed) {
                actual.value.argType = undefined;
                self.expr(actual.value, null, call.scope);
            }
        });
        this.error(call.node, 'overload resolution ambiguity between candidates:\n' + candidates.map(function (candidate) {
            return self.signatureText(candidate.fn);
        }).join('\n'));
    };

    // The parameter type of a candidate for the i-th actual (substituted by the class only).
    function paramFor(candidate, actualIndex) {
        var slots = candidate.mapping.slots;
        for (var index = 0; index < slots.length; ++index) {
            if (slots[index].actuals.indexOf(candidate.actualList[actualIndex]) >= 0) {
                var param = candidate.fn.params[index];
                var type = param.vararg && !candidate.actualList[actualIndex].spread ? varargElement(param.type) : param.type;
                return Kt.subst(type, candidate.map);
            }
        }
        return null;
    }

    // a is at least as specific as b: each argument's parameter of a is a subtype of b's.
    Checker.prototype.atLeastAsSpecific = function (a, b, call) {
        a.actualList = call.actuals;
        b.actualList = call.actuals;
        var self = this;
        // A member beats an extension, a local function beats others.
        if (!a.extension && b.extension && a.implicit === b.implicit)
            return true;
        if (a.extension && !b.extension && a.implicit === b.implicit)
            return false;
        for (var index = 0; index < call.actuals.length; ++index) {
            var left = paramFor(a, index), right = paramFor(b, index);
            if (left === null || right === null)
                continue;
            var actual = call.actuals[index];
            if (this.unsignedLiteral(actual.value)) {
                // An unsigned literal prefers UInt.
                var leftUnsigned = Kt.primKind(left), rightUnsigned = Kt.primKind(right);
                if (leftUnsigned === 'u32' && rightUnsigned !== 'u32')
                    continue;
                if (rightUnsigned === 'u32' && leftUnsigned !== 'u32')
                    return false;
            }
            var literal = this.literalValue(actual.value);
            if (literal !== null) {
                // An integer literal prefers Int, then Long.
                var leftKind = Kt.primKind(left), rightKind = Kt.primKind(right);
                if (leftKind === 'i32' && rightKind !== 'i32')
                    continue;
                if (rightKind === 'i32' && leftKind !== 'i32')
                    return false;
            }
            if (!this.paramMoreSpecific(left, right, a, b))
                return false;
        }
        // Receivers of extensions.
        if (a.fn.receiver !== null && b.fn.receiver !== null && a.extension && b.extension) {
            if (!this.paramMoreSpecific(Kt.subst(a.fn.receiver, a.map), Kt.subst(b.fn.receiver, b.map), a, b))
                return false;
        }
        void self;
        return true;
    };

    // Type parameters of the candidates stand for their bounds.
    Checker.prototype.paramMoreSpecific = function (left, right, a, b) {
        var mark = Kt.markBounds();
        var leftType = this.forSpecificity(left, a);
        // The type parameters of the other candidate are variables: Int fits T : Comparable<T>.
        var variables = new Map();
        this.candidateTypeParams(b).forEach(function (param) { variables.set(param, Kt.inferenceVar(param)); });
        var rightType = Kt.subst(right, variables);
        var result = Kt.isSubtype(leftType, rightType);
        // A primitive is more specific than a box (Int over Any, Int over Int?).
        Kt.rollbackBounds(mark);
        if (!result) {
            var leftKind = Kt.primKind(leftType), rightKind = Kt.primKind(rightType);
            // Kotlin prefers a narrower numeric type: Int over Long, Double over... (none for unrelated types).
            if (leftKind !== null && rightKind !== null && Kt.isNumericKind(leftKind) && Kt.isNumericKind(rightKind))
                return Kt.numericRank(leftKind) < Kt.numericRank(rightKind) && Kt.isIntegralKind(leftKind) === Kt.isIntegralKind(rightKind);
        }
        return result;
    };

    Checker.prototype.forSpecificity = function (type, candidate) {
        var map = new Map();
        this.candidateTypeParams(candidate).forEach(function (param) {
            map.set(param, param.bounds.length > 0 ? param.bounds[0] : Kt.nullableAny());
        });
        var result = Kt.subst(type, map);
        // A function type parameter by its shape.
        return result;
    };

    // Overloads that differ by the return type of a lambda (sumOf, maxOf): the lambda decides.
    Checker.prototype.resolveByLambdaReturn = function (candidates, call) {
        var lambdaIndex = -1;
        call.actuals.forEach(function (actual, index) {
            if (isFunctionLiteral(actual.value) || actual.value.k === 'ref')
                lambdaIndex = index;
        });
        if (lambdaIndex < 0)
            return null;
        var self = this;
        var first = candidates[0];
        first.actualList = call.actuals;
        // The lambda checked with the parameter types of the first candidate.
        var lambdaResult = this.lambdaReturnFor(first, call, lambdaIndex);
        if (lambdaResult === null)
            return null;
        var fitting = candidates.filter(function (candidate) {
            candidate.actualList = call.actuals;
            var param = paramFor(candidate, lambdaIndex);
            var fnType = Kt.resolved(param);
            if (fnType.kind !== 'fun')
                return false;
            var returns = Kt.resolved(fnType.returns);
            if (returns.kind === 'param')
                return true;
            var literal = lambdaResult.literal;
            if (literal !== null && literal !== undefined && returns.kind === 'class' && literalFits(literal, Kt.primKind(returns)))
                return Kt.primKind(returns) === 'i32';
            var mark = Kt.markBounds();
            // The type parameters of the candidate are variables (Sequence<R>).
            var variables = new Map();
            self.candidateTypeParams(candidate).forEach(function (typeParam) { variables.set(typeParam, Kt.inferenceVar(typeParam)); });
            var fits = Kt.isSubtype(lambdaResult.type, Kt.subst(returns, variables));
            Kt.rollbackBounds(mark);
            return fits;
        });
        if (fitting.length === 0)
            return null;
        if (fitting.length === 1)
            return fitting[0];
        // The most specific return type.
        var best = fitting.filter(function (candidate) {
            return fitting.every(function (other) {
                if (other === candidate)
                    return true;
                var mine = Kt.resolved(Kt.resolved(paramFor(candidate, lambdaIndex)).returns);
                var theirs = Kt.resolved(Kt.resolved(paramFor(other, lambdaIndex)).returns);
                return Kt.isSubtype(mine, theirs);
            });
        });
        void self;
        return best.length === 1 ? best[0] : null;
    };

    // The type a lambda returns with the parameter types of a candidate.
    Checker.prototype.lambdaReturnFor = function (candidate, call, lambdaIndex) {
        var param = paramFor(candidate, lambdaIndex);
        if (param === null)
            return null;
        var fnType = Kt.resolved(param);
        if (fnType.kind !== 'fun')
            return null;
        var map = new Map();
        this.candidateTypeParams(candidate).forEach(function (typeParam) {
            map.set(typeParam, Kt.inferenceVar(typeParam));
        });
        // Fix the parameters from the receiver and the other arguments.
        var mark = Kt.markBounds();
        var receiverOk = this.checkCandidateReceiver(candidate, call, map);
        void receiverOk;
        var self = this;
        candidate.mapping.slots.forEach(function (slot, index) {
            slot.actuals.forEach(function (actual) {
                if (isFunctionLiteral(actual.value))
                    return;
                var paramType = Kt.subst(candidate.fn.params[index].type, map);
                self.argumentFits(actual.value, paramType, call.scope);
            });
        });
        var lambdaType = Kt.subst(fnType, map);
        Kt.freeVars(Kt.funType(lambdaType.receiver, lambdaType.params, Kt.unitType(), false, false)).forEach(Kt.fixVar);
        var actual = call.actuals[lambdaIndex];
        var result;
        if (actual.value.k === 'ref') {
            // sumOf(::area): the return type of the referenced function.
            var probe = Kt.funType(lambdaType.receiver, lambdaType.params.map(Kt.resolved), Kt.inferenceVar(Kt.TypeParamSym('R', null)),
                                   false, lambdaType.suspend);
            try {
                result = { type: Kt.resolved(Kt.resolved(this.referenceExpr(actual.value, probe, call.scope)).returns), literal: null };
            } catch (error) {
                if (!(error instanceof T.CompileError))
                    throw error;
                result = null;
            }
        } else {
            result = this.lambdaProbe(actual.value, Kt.resolved(lambdaType), call.scope);
        }
        Kt.rollbackBounds(mark);
        return result;
    };

    // --- The chosen candidate

    Checker.prototype.completeCall = function (candidate, call) {
        var fn = candidate.fn;
        var self = this;
        // The final pass: bounds again, then lambdas, then the expected type.
        var result = this.tryCandidate(candidate, call, true);
        if (!result.ok)
            return this.callFailure([candidate], call);
        var map = candidate.fullMap;
        var params = fn.params;
        var slots = candidate.mapping.slots;
        // The expected type of the result (before lambdas: it may give their parameter types).
        var returns = fn.isCtor ? (candidate.aliasType ? candidate.aliasType : (candidate.ctorOf
            ? Kt.classType(candidate.ctorOf, candidate.ctorOf.typeParams.map(function (param) { return Kt.arg(map.get(param) || Kt.paramType(param)); }))
            : Kt.unitType())) : this.functionReturnType(fn, candidate);
        if (candidate.invokeOn !== undefined && candidate.fnType !== undefined)
            returns = candidate.fnType.returns;
        var substitutedReturn = Kt.subst(returns, map);
        if (call.expected !== null && call.expected !== undefined && Kt.hasFreeVars(substitutedReturn)) {
            var expectedMark = Kt.markBounds();
            if (!Kt.isSubtype(substitutedReturn, call.expected))
                Kt.rollbackBounds(expectedMark);
        }
        // Lambdas and callable references in the order of the arguments.
        slots.forEach(function (slot, index) {
            var param = params[index];
            slot.actuals.forEach(function (actual) {
                var declared = param.vararg && !actual.spread ? varargElement(param.type) : param.type;
                var paramType = Kt.subst(declared, map);
                if (isFunctionLiteral(actual.value) || actual.value.k === 'ref') {
                    self.checkFunctionArgument(actual, paramType, call, fn, param);
                }
            });
        });
        candidate.ivars.forEach(function (ivar) { Kt.fixVar(ivar); });
        Kt.commitBounds();
        // Check the arguments again with the final types (smart casts,
        // literals to Long, nested calls with expected types).
        var argTypes = [];
        slots.forEach(function (slot, index) {
            var param = params[index];
            var declared = param.vararg ? param.type : param.type;
            slot.paramType = self.finalType(Kt.subst(declared, map));
            slot.elementType = param.vararg ? self.finalType(Kt.subst(param.elementType || varargElement(param.type), map)) : null;
            slot.actuals.forEach(function (actual) {
                if (isFunctionLiteral(actual.value) || actual.value.k === 'ref')
                    return;
                var target = param.vararg && !actual.spread ? slot.elementType : slot.paramType;
                self.finalArgument(actual, target, call.scope);
                argTypes.push(actual.value.type);
            });
        });
        var finalMap = new Map();
        map.forEach(function (value, key) { finalMap.set(key, self.finalType(value)); });
        var type = this.finalType(Kt.subst(returns, finalMap));
        if (fn.isCtor && candidate.ctorOf !== undefined) {
            var cls = candidate.ctorOf;
            if ((cls.mods.abstract || cls.isInterface()) && !fn.samConstructor)
                this.error(call.node, 'cannot create an instance of an abstract class.');
            if (cls.kind === 'enum' && !call.inEnum)
                this.error(call.node, 'enum types cannot be instantiated.');
            if (cls.mods.sealed)
                this.error(call.node, 'sealed types cannot be instantiated.');
        }
        var reifiedArgs = this.candidateTypeParams(candidate).filter(function (param) { return param.reified; }).map(function (param) {
            return { param: param, type: finalMap.get(param) };
        });
        return { fn: fn, candidate: candidate, map: finalMap, slots: slots, type: type, implicit: candidate.implicit || null,
                 explicit: !!candidate.explicit, extension: fn.receiver !== null, invokeOn: candidate.invokeOn || null,
                 ctorOf: candidate.ctorOf || null, staticOf: candidate.staticOf || null, reified: reifiedArgs,
                 objectOf: candidate.objectOf || null };
    };

    // The return type of a function with an expression body is checked first.
    Checker.prototype.functionReturnType = function (fn, candidate) {
        void candidate;
        if (fn.returns === null)
            return this.returnType(fn);
        return fn.returns;
    };

    // Inference variables give their values; unfixed ones are fixed.
    Checker.prototype.finalType = function (type) {
        var self = this;
        type = Kt.resolved(type);
        switch (type.kind) {
        case 'ivar': {
            var value = Kt.fixVar(type);
            var fixed = self.finalType(value);
            return type.nullable ? Kt.makeNullable(fixed) : fixed;
        }
        case 'class':
            if (type.args.length === 0)
                return type;
            return Kt.classType(type.sym, type.args.map(function (arg) {
                return arg.v === '*' ? arg : Kt.arg(self.finalType(arg.type), arg.v);
            }), type.nullable, type.flexible);
        case 'fun':
            return Kt.funType(type.receiver === null ? null : self.finalType(type.receiver), type.params.map(function (param) {
                return self.finalType(param);
            }), self.finalType(type.returns), type.nullable, type.suspend);
        }
        return type;
    };

    // An argument checked with the final parameter type.
    Checker.prototype.finalArgument = function (actual, target, scope) {
        var node = actual.value;
        var literal = this.literalValue(node);
        if ((literal !== null || this.unsignedLiteral(node)) && Kt.isPrimitive(Kt.makeNotNull(target))) {
            node.type = undefined;
            this.expr(node, target, scope);
            return;
        }
        if (node.argType === undefined || node.postponed || this.needsRecheck(node, target)) {
            node.type = undefined;
            this.exprAs(node, target, scope, 'argument');
            return;
        }
        var type = node.argType;
        node.type = type;
        if (!Kt.isSubtype(type, target)) {
            var sam = Kt.samType(target);
            if (sam !== null && Kt.resolved(type).kind === 'fun' && Kt.isSubtype(type, sam.type)) {
                node.samConversion = sam;
                return;
            }
            this.mismatch(node, target, type, 'argument');
        }
    };

    // An argument whose type depends on the expected type is checked again.
    Checker.prototype.needsRecheck = function (node, target) {
        while (node.k === 'paren')
            node = node.expr;
        if (node.k === 'call' || node.k === 'if' || node.k === 'when' || node.k === 'try' || node.k === 'binary' ||
            node.k === 'null' || node.k === 'collection')
            return Kt.hasFreeVars(node.argType) || !Kt.isSubtype(node.argType, target) || node.k === 'call' ||
                node.k === 'binary' || node.k === 'if' || node.k === 'when';
        return false;
    };

    // A lambda or a callable reference argument with its parameter type.
    Checker.prototype.checkFunctionArgument = function (actual, paramType, call, fn, param) {
        var node = actual.value;
        var resolvedType = Kt.resolved(paramType);
        // "+" to { a, b -> a + b } with an expected Pair<String, (Int, Int) -> Int>:
        // the variable has the function type as a bound.
        if (resolvedType.kind === 'ivar' && resolvedType.eq.length + resolvedType.upper.length + resolvedType.lower.length > 0) {
            Kt.fixVar(resolvedType);
            resolvedType = Kt.resolved(paramType);
        }
        var sam = null;
        var target = resolvedType;
        if (resolvedType.kind === 'class' && resolvedType.sym !== Kt.builtins.Any && resolvedType.sym !== Kt.builtins.Function) {
            sam = Kt.samType(resolvedType);
            if (sam !== null)
                target = sam.type;
        }
        if (target.kind === 'fun') {
            // Fix the variables of the parameter types first. A variable of
            // the receiver without bounds stays (builder inference: the
            // calls in sequence { yield(1) } give it a type).
            Kt.freeVars(Kt.funType(null, target.params, Kt.unitType(), false, false)).forEach(Kt.fixVar);
            if (target.receiver !== null) {
                Kt.freeVars(target.receiver).forEach(function (ivar) {
                    var base = ivar.base || ivar;
                    if (base.eq.length + base.lower.length > 0)
                        Kt.fixVar(base);
                });
            }
        }
        var inlineContext = fn.inline && !param.noinline && !param.crossinline ? { inline: true, crossinline: false }
                                                                              : { inline: fn.inline && param.crossinline };
        // return@forEach: a lambda argument has the name of the function as its label.
        inlineContext.label = fn.name;
        node.inlineArgument = inlineContext.inline === true;
        var type;
        if (node.k === 'ref')
            type = this.referenceExpr(node, target, call.scope);
        else
            type = this.functionLiteral(node, target, call.scope, inlineContext);
        node.type = type;
        if (sam !== null)
            node.samConversion = sam;
        // The lambda's result gives bounds to the return type.
        if (target.kind === 'fun' && Kt.resolved(type).kind === 'fun') {
            var lambdaType = Kt.resolved(type);
            var targetReturn = Kt.resolved(target.returns);
            if (!Kt.isClass(targetReturn, 'Unit') || targetReturn.kind === 'ivar') {
                var lambdaReturn = lambdaType.returns;
                if (node.literalReturn !== undefined && node.literalReturn !== null && targetReturn.kind === 'class' &&
                    literalFits(node.literalReturn, Kt.primKind(targetReturn)))
                    return;
                if (!Kt.isSubtype(lambdaReturn, targetReturn) && !node.returnChecked)
                    this.mismatch(node.lastValue || node, targetReturn, lambdaReturn, 'return');
            }
        }
    };

    // --- Errors

    Checker.prototype.callFailure = function (tried, call) {
        var node = call.node;
        var name = call.name;
        if (tried.length === 0) {
            if (call.receiverType !== null && call.receiverType !== undefined) {
                var receiverType = Kt.resolved(call.receiverType);
                if (Kt.isNullable(receiverType) && !call.safe && receiverType.kind !== 'dynamic') {
                    var nonNull = this.membersOf(Kt.makeNotNull(receiverType), name);
                    if (nonNull.length > 0 || this.visibleExtensions(name, call.scope).length > 0)
                        this.error(call.nameNode || node, 'only safe (?.) or non-null asserted (!!.) calls are allowed on a nullable receiver of type \'' +
                                   Kt.typeString(receiverType) + '\'.');
                }
            }
            this.error(call.nameNode || node, 'unresolved reference \'' + name + '\'.');
        }
        if (tried.length === 1 || tried.every(function (candidate) { return candidate.fn === tried[0].fn; })) {
            var candidate = tried[0];
            var result = candidate.result;
            if (result.reason === 'mapping') {
                var mapping = result.mapping;
                if (mapping.missing !== undefined) {
                    var place = call.argsNode || node;
                    this.error({ line: call.endLine || place.line, column: place.column }, mapping.error);
                }
                if (mapping.error === 'too many arguments')
                    this.error(mapping.actual.value, 'too many arguments for \'' + this.signatureText(candidate.fn) + '\'.');
                this.error(mapping.actual ? mapping.actual.value : node, mapping.error);
            }
            if (result.reason === 'argument') {
                var failed = result.failed;
                var argument = failed.actual.value;
                if (failed.lambda)
                    this.error(argument, 'argument type mismatch: actual type is \'' + this.lambdaShapeText(argument) +
                               '\', but \'' + Kt.typeString(this.finalType(failed.paramType)) + '\' was expected.');
                var argType = argument.argType !== undefined ? argument.argType : this.expr(argument, null, call.scope);
                var expected = this.finalType(failed.paramType);
                if (Kt.isNullable(argType) && Kt.isSubtype(Kt.makeNotNull(argType), Kt.makeNotNull(expected)) && !Kt.isNullable(expected))
                    this.error(argument, 'argument type mismatch: actual type is \'' + Kt.typeString(argType) + '\', but \'' +
                               Kt.typeString(expected) + '\' was expected.');
                this.mismatch(argument, expected, argType, 'argument');
            }
            if (result.reason === 'receiver') {
                var fn = candidate.fn;
                if (call.receiverType !== null && call.receiverType !== undefined && Kt.isNullable(call.receiverType) && !call.safe &&
                    Kt.isSubtype(Kt.makeNotNull(call.receiverType), Kt.subst(fn.receiver, candidate.map)))
                    this.error(call.nameNode || node, 'only safe (?.) or non-null asserted (!!.) calls are allowed on a nullable receiver of type \'' +
                               Kt.typeString(call.receiverType) + '\'.');
                this.error(call.nameNode || node, 'unresolved reference \'' + name + '\'.');
            }
            if (result.reason === 'typeArgs')
                this.error(node, (result.count === 1 ? 'one type argument' : result.count + ' type arguments') + ' expected for ' +
                           this.signatureText(candidate.fn) + '.');
        }
        var receiverOnly = tried.every(function (candidate) { return candidate.result.reason === 'receiver'; });
        if (receiverOnly) {
            if (call.receiverType !== null && call.receiverType !== undefined && Kt.isNullable(call.receiverType) && !call.safe)
                this.error(call.nameNode || node, 'only safe (?.) or non-null asserted (!!.) calls are allowed on a nullable receiver of type \'' +
                           Kt.typeString(call.receiverType) + '\'.');
            this.error(call.nameNode || node, 'unresolved reference \'' + name + '\'.');
        }
        var self = this;
        // Several candidates: the argument mismatch of the only one with the right count.
        var counted = tried.filter(function (candidate) { return candidate.result.reason === 'argument'; });
        if (counted.length === 1) {
            var only = counted[0].result.failed;
            var onlyType = only.actual.value.argType !== undefined ? only.actual.value.argType : this.expr(only.actual.value, null, call.scope);
            this.mismatch(only.actual.value, this.finalType(only.paramType), onlyType, 'argument');
        }
        this.error(call.nameNode || node, 'none of the following candidates is applicable:\n' + tried.filter(function (candidate, index) {
            return tried.findIndex(function (other) { return other.fn === candidate.fn; }) === index;
        }).map(function (candidate) {
            return self.signatureText(candidate.fn);
        }).join('\n'));
    };

    Checker.prototype.lambdaShapeText = function (node) {
        while (node.k === 'paren')
            node = node.expr;
        var count = node.params === null || node.params === undefined ? 0 : node.params.length;
        var params = [];
        for (var index = 0; index < count; ++index)
            params.push('???');
        return '(' + params.join(', ') + ') -> Unit';
    };

    // fun foo(x: Int): String
    Checker.prototype.signatureText = function (fn) {
        var name = fn.isCtor ? 'constructor ' + (fn.owner !== null ? fn.owner.name : '') : 'fun ' +
            (fn.receiver !== null ? Kt.typeString(fn.receiver) + '.' : '') + fn.name;
        var text = name + '(' + fn.params.map(function (param) {
            return (param.vararg ? 'vararg ' : '') + param.name + ': ' + Kt.typeString(param.vararg ? varargElement(param.type) : param.type) +
                (param.hasDefault ? ' = ...' : '');
        }).join(', ') + ')';
        if (!fn.isCtor && fn.returns !== null)
            text += ': ' + Kt.typeString(fn.returns);
        return text;
    };
})(globalThis);
