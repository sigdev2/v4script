// Kotlin: translation of calls - receivers (explicit, implicit, super,
// objects), arguments (defaults, named ones in the order of the source,
// varargs, spreads, SAM conversion), constructors, Java statics, invoke,
// suspend calls, values that may be JavaScript primitives ($j.invoke).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Kt = T.kotlin;
    var Generator = Kt.Generator;
    if (Generator.prototype.callValue)
        return;

    var J = T.J;

    // Types whose values may be JavaScript strings, numbers or booleans.
    var HOLDER_NAMES = { Any: true, Comparable: true, CharSequence: true, Number: true, String: true, Int: true, Boolean: true };

    Generator.prototype.isHolder = function (type) {
        if (type === null || type === undefined)
            return true;
        type = Kt.resolved(type);
        if (type.kind === 'param' || type.kind === 'error' || type.kind === 'dynamic' || type.kind === 'nothing')
            return true;
        if (type.kind === 'fun')
            return true;
        if (type.kind !== 'class')
            return true;
        var sym = type.sym;
        if (sym.arrayDescriptor !== undefined)
            return true;
        if (Kt.builtins[sym.name] === sym && HOLDER_NAMES[sym.name] === true)
            return true;
        if (sym.java !== null && sym.java !== undefined && sym.java.qname === 'java.io.Serializable')
            return true;
        return false;
    };

    // A method call on a value; through $j for values that may be primitives.
    Generator.prototype.methodCall = function (receiver, receiverType, jsName, args, owner) {
        if (!this.isHolder(receiverType)) {
            if (owner !== null && owner !== undefined && owner.mappedBuiltin && owner.java !== null && owner.java.qname === 'java.lang.Object')
                return this.objectMethodCall(receiver, jsName, args);
            return J.call(J.mem(receiver, jsName), args);
        }
        return this.objectMethodCall(receiver, jsName, args);
    };

    Generator.prototype.objectMethodCall = function (receiver, jsName, args) {
        switch (jsName) {
        case 'toString':
            return J.call(this.kt('str'), [J.call(this.rt('nonNull'), [receiver])]);
        case 'equals':
            return J.call(this.rt('equals'), [receiver].concat(args));
        case 'hashCode':
            return J.call(this.rt('hashCode'), [receiver]);
        case 'compareTo$1':
            return J.call(this.rt('compare'), [receiver].concat(args));
        }
        return J.call(this.rt('invoke'), [receiver, J.str(jsName), J.arr(args)]);
    };

    // --- Calls

    Generator.prototype.callValue = function (node) {
        if (node.dynamicCall)
            return this.dynamicCall(node);
        var callee = node.callee;
        var safe = callee.k === 'member' && callee.safe;
        return this.callCode(node.call, node, safe);
    };

    // A resolved call (result of the checker) as JavaScript.
    Generator.prototype.callCode = function (result, node, safe) {
        var self = this;
        var fn = result.fn;
        var receiverNode = result.receiverNode;
        var receiverThunk = null;
        var receiverType = null;
        // The explicit receiver (a value; not a class or package qualifier).
        if (receiverNode !== null && receiverNode !== undefined && !(receiverNode.ref !== undefined &&
                                                                     (receiverNode.ref.kind === 'class' || receiverNode.ref.kind === 'package')) &&
            receiverNode.k !== 'super' && result.staticOf === null) {
            receiverType = receiverNode.type;
            receiverThunk = function () { return self.expression(receiverNode); };
        }
        var receiverInvoke = result.candidate !== undefined && result.candidate.receiverInvoke;
        if (result.invokeOn !== null && result.invokeOn !== undefined && receiverThunk === null && !receiverInvoke)
            receiverThunk = function () { return self.invokeTarget(result.invokeOn); };
        var values = this.ordered([receiverThunk !== null ? receiverThunk : function () { return null; }].concat(
            [function () { return self.callArguments(result); }]));
        var receiver = values[0];
        var args = values[1];
        if (safe && receiver !== null) {
            var stable = this.stable(receiver);
            var call = this.dispatch(result, stable.value, receiverType !== null ? Kt.makeNotNull(receiverType) : null, args, node);
            var nonNullType = Kt.makeNotNull(node.type);
            call = this.convert(call, this.declaredReturn(result), nonNullType);
            call = this.convert(call, nonNullType, node.type);
            var test = J.bin('==', stable.setup !== null ? stable.setup : stable.value, J.nul());
            return J.cond(test, J.nul(), call);
        }
        var value = this.dispatch(result, receiver, receiverType, args, node);
        return this.convert(value, this.declaredReturn(result), node.type);
    };

    // The return type of the callee as it returns it (generic results are boxes).
    Generator.prototype.declaredReturn = function (result) {
        var fn = result.fn;
        if (fn.isCtor)
            return Kt.anyType();
        if (fn.intrinsic === 'invoke') {
            return Kt.nullableAny();
        }
        if (fn.intrinsic !== null && fn.intrinsic !== undefined)
            return result.type;
        if (fn.returns === null)
            return result.type;
        return this.passedReturn(fn);
    };

    // The value whose invoke is called: a variable, a property, an object.
    Generator.prototype.invokeTarget = function (invokeOn) {
        if (invokeOn.variable !== undefined)
            return this.localValue(invokeOn.variable);
        if (invokeOn.object !== undefined)
            return this.objectValue(invokeOn.object);
        var ref = { kind: 'prop', sym: invokeOn.prop, map: invokeOn.map, receiver: invokeOn.implicit || null,
                    objectOf: invokeOn.objectOf || undefined };
        return this.propertyRead(ref, null, null);
    };

    // The call itself with the receiver and arguments ready.
    Generator.prototype.dispatch = function (result, receiver, receiverType, args, node) {
        var fn = result.fn;
        var call;
        if (fn.intrinsic === 'invoke') {
            // A value of a function type: a JavaScript function.
            var target = receiver;
            if (result.candidate !== undefined && result.candidate.receiverInvoke) {
                // block() or x.block(): the receiver is the first argument.
                var value = receiver;
                var valueType = receiverType;
                if (value === null) {
                    value = this.implicitReceiver(result);
                    valueType = result.implicit !== null ? result.implicit.type : null;
                }
                target = this.invokeTarget(result.invokeOn);
                args = [valueType !== null ? this.convert(value, valueType, Kt.nullableAny()) : value].concat(args);
            } else if (target === null && result.invokeOn !== null) {
                target = this.invokeTarget(result.invokeOn);
            } else if (result.invokeOn !== null && result.invokeOn.prop !== undefined && result.invokeOn.explicit) {
                // pair.second(2): the property of the explicit receiver is the function.
                target = this.propertyRead({ kind: 'prop', sym: result.invokeOn.prop, map: result.invokeOn.map, receiver: null,
                                             explicit: true, receiverType: receiverType }, receiver, null);
            }
            if (this.mayWait(fn))
                return J.yield_(J.call(this.rt('fiberApply'), [target, J.nul(), J.arr(args)]), true);
            call = J.call(target, args);
            if (fn.suspend && this.fn.generator)
                return J.yield_(J.call(this.kt('suspended'), [call]), true);
            return call;
        }
        if (fn.intrinsic !== null && fn.intrinsic !== undefined)
            return this.intrinsicCall(fn, receiver, receiverType, args, result, node);
        if (fn.synthetic !== undefined && fn.synthetic !== null && fn.isStatic)
            return this.syntheticStatic(fn, args);
        if (fn.isCtor)
            return this.constructorCall(result, args);
        if (fn.java !== null && fn.java !== undefined) {
            if (fn.isStatic)
                return this.mayWait(fn) ? this.fiberCall(this.classRef(fn.owner), fn.jsName, args)
                                        : J.call(J.mem(this.classRef(fn.owner), fn.jsName), args);
            if (receiver === null)
                receiver = this.implicitReceiver(result);
            if (result.superCall)
                return this.superCall(result, args);
            if (this.mayWait(fn))
                return this.fiberCall(receiver, fn.jsName, args);
            return this.methodCall(receiver, receiverType || this.receiverTypeOf(result), fn.jsName, args, fn.owner);
        }
        if (fn.owner === null || fn.owner === undefined)
            return this.topLevelCall(result, receiver, receiverType, args);
        if (result.superCall)
            return this.suspendWrap(fn, this.superCall(result, args));
        if (fn.receiver !== null) {
            // A member extension: the dispatch receiver is this (or an implicit one).
            var dispatch = this.thisOf(fn.owner);
            var extensionReceiver = receiver !== null ? receiver : this.implicitReceiver(result);
            extensionReceiver = this.convert(extensionReceiver, receiverType || this.receiverTypeOf(result), fn.receiver);
            if (this.mayWait(fn))
                return this.fiberCall(dispatch, fn.jsName, [extensionReceiver].concat(args));
            return this.suspendWrap(fn, J.call(J.mem(dispatch, fn.jsName), [extensionReceiver].concat(args)));
        }
        if (receiver === null)
            receiver = this.implicitReceiver(result);
        var owner = fn.owner;
        if (this.mayWait(fn))
            return this.fiberCall(receiver, fn.jsName, args);
        if (owner.mappedBuiltin || this.isHolder(receiverType))
            call = this.methodCall(receiver, receiverType || this.receiverTypeOf(result), fn.jsName, args, owner);
        else
            call = J.call(J.mem(receiver, fn.jsName), args);
        return this.suspendWrap(fn, call);
    };

    // A suspend function is a generator: yield* in a coroutine.
    Generator.prototype.suspendWrap = function (fn, call) {
        if (fn.suspend && this.fn.generator)
            return J.yield_(J.call(this.kt('suspended'), [call]), true);
        return call;
    };

    Generator.prototype.receiverTypeOf = function (result) {
        if (result.implicit !== null && result.implicit !== undefined)
            return result.implicit.type;
        if (result.fn.owner !== null && result.fn.owner !== undefined)
            return Kt.classType(result.fn.owner, []);
        return null;
    };

    // The receiver when the call has none in the source.
    Generator.prototype.implicitReceiver = function (result) {
        if (result.implicit !== null && result.implicit !== undefined)
            return this.receiverValue(result.implicit);
        var owner = result.fn.owner;
        if (owner !== null && owner !== undefined && owner.kind === 'object')
            return this.objectValue(owner);
        if (result.objectOf !== null && result.objectOf !== undefined)
            return this.objectRef(result.objectOf);
        return J.this_();
    };

    Generator.prototype.superCall = function (result, args) {
        var superType = Kt.resolved(result.superType);
        var fn = result.fn;
        var owner = superType.sym;
        var method = J.mem(J.mem(this.classRef(owner), 'prototype'), fn.jsName);
        if (owner === Kt.builtins.Any || (owner.mappedBuiltin && owner.java !== null && owner.java.qname === 'java.lang.Object'))
            method = J.mem(J.mem(J.call(this.rt('byName'), [J.str('java.lang.Object')]), 'prototype'), fn.jsName);
        return J.call(J.mem(method, 'call'), [this.thisOf(this.methodOf(this.fn).cls)].concat(args));
    };

    // A top-level function: local, of the units, of the library; an extension takes the receiver first.
    Generator.prototype.topLevelCall = function (result, receiver, receiverType, args) {
        var fn = result.fn;
        var callArgs = args;
        if (fn.receiver !== null) {
            var extensionReceiver = receiver !== null ? receiver : this.implicitReceiver(result);
            var actualType = receiverType !== null ? receiverType : this.receiverTypeOf(result);
            extensionReceiver = this.convert(extensionReceiver, actualType || fn.receiver, fn.receiver);
            callArgs = [extensionReceiver].concat(args);
        }
        // Reified type arguments come first (after the receiver).
        var reified = this.reifiedArguments(result);
        if (reified.length > 0)
            callArgs = fn.receiver !== null ? [callArgs[0]].concat(reified, callArgs.slice(1)) : reified.concat(callArgs);
        if (this.mayWait(fn)) {
            if (fn.local)
                return J.yield_(J.call(this.rt('fiberApply'), [J.id(fn.jsName), J.nul(), J.arr(callArgs)]), true);
            return this.fiberCall(this.topHolder(fn), fn.jsName, callArgs);
        }
        var callee;
        if (fn.local)
            callee = J.id(fn.jsName);
        else
            callee = J.mem(this.topHolder(fn), fn.jsName);
        var call = J.call(callee, callArgs);
        return this.suspendWrap(fn, call);
    };

    // Classes of reified type arguments.
    Generator.prototype.reifiedArguments = function (result) {
        var self = this;
        return (result.reified || []).map(function (item) { return self.typeObject(item.type); });
    };

    // A runtime description of a type for is/as with reified parameters.
    Generator.prototype.typeObject = function (type) {
        type = Kt.resolved(type);
        if (type.kind === 'param' && type.sym.reified && type.sym.jsName !== undefined)
            return J.id(type.sym.jsName);
        return this.constant(this.session.typeDescriptor(type));
    };

    // new C().$init(args); an inner class takes the outer instance first.
    Generator.prototype.constructorCall = function (result, args) {
        var cls = result.ctorOf || result.fn.owner;
        var fn = result.fn;
        if (cls.arrayDescriptor !== undefined)
            return this.arrayConstructor(cls, args, result);
        if (fn.samConstructor)
            return this.samObject(args[0], fn.samConstructor);
        if (cls === Kt.builtins.Any)
            return J.new_(J.call(this.rt('byName'), [J.str('java.lang.Object')]), []);
        var ctorArgs = args;
        if (cls.inner && cls.outer !== null && !cls.fromJava) {
            var outer;
            if (result.receiverNode !== null && result.receiverNode !== undefined && result.receiverNode.type !== undefined &&
                !(result.receiverNode.ref !== undefined && result.receiverNode.ref.kind === 'class'))
                outer = this.expression(result.receiverNode);
            else
                outer = result.outerReceiver !== null && result.outerReceiver !== undefined ? this.receiverValue(result.outerReceiver)
                                                                                             : this.thisOf(cls.outer);
            ctorArgs = [outer].concat(args);
        }
        // A native Java constructor is a static factory.
        if (fn.java !== null && fn.java.isNative)
            return J.call(J.mem(this.classRef(cls), fn.jsName), ctorArgs);
        return J.call(J.mem(J.new_(this.classRef(cls), []), fn.jsName), ctorArgs);
    };

    // IntArray(n), IntArray(n) { init }, Array(n) { init }.
    Generator.prototype.arrayConstructor = function (cls, args, result) {
        var descriptor = cls === Kt.builtins.Array ? this.arrayDescriptorOf(result.type) : cls.arrayDescriptor;
        if (args.length === 1)
            return J.call(this.kt('newArray'), [J.str(descriptor), args[0]]);
        return J.call(this.kt('newArray'), [J.str(descriptor), args[0], args[1]]);
    };

    // The descriptor of an array type: [I, [Ljava.lang.String;.
    Generator.prototype.arrayDescriptorOf = function (type) {
        type = Kt.resolved(type);
        if (type.kind === 'class' && type.sym.arrayDescriptor !== undefined && type.sym !== Kt.builtins.Array)
            return type.sym.arrayDescriptor;
        if (type.kind === 'class' && type.sym === Kt.builtins.Array && type.args.length > 0 && type.args[0].v !== '*') {
            var elem = Kt.resolved(type.args[0].type);
            if (elem.kind === 'class') {
                if (elem.sym.arrayDescriptor !== undefined)
                    return '[' + (elem.sym === Kt.builtins.Array ? this.arrayDescriptorOf(elem) : elem.sym.arrayDescriptor);
                var javaSym = elem.sym.java;
                if (javaSym !== null && javaSym !== undefined)
                    return '[L' + javaSym.qname + ';';
                return '[L' + (elem.sym.binaryName || elem.sym.fqName) + ';';
            }
        }
        return '[Ljava.lang.Object;';
    };

    Generator.prototype.syntheticStatic = function (fn, args) {
        var cls = fn.owner;
        switch (fn.synthetic.kind) {
        case 'enumValues':
            return J.call(this.rt('enumValues'), [J.call(this.kt('initialized'), [this.classRef(cls)])]);
        case 'enumValueOf':
            return J.call(this.rt('enumValueOf'), [J.call(this.kt('initialized'), [this.classRef(cls)])].concat(args));
        }
        throw new Error('Kotlin: unknown synthetic ' + fn.synthetic.kind);
    };

    // --- Arguments

    // The arguments in the order of the parameters: values converted to
    // the declared types, varargs as arrays, omitted defaults undefined.
    Generator.prototype.callArguments = function (result) {
        var self = this;
        var fn = result.fn;
        var slots = result.slots;
        var params = fn.params;
        // Named arguments out of order: evaluated into temporaries in the order of the source.
        var order = [];
        slots.forEach(function (slot, index) {
            slot.actuals.forEach(function (actual) { order.push({ actual: actual, index: index }); });
        });
        var sourceOrder = order.slice().sort(function (left, right) {
            return (left.actual.line - right.actual.line) || (left.actual.column - right.actual.column);
        });
        var reordered = sourceOrder.some(function (item, position) { return item !== order[position]; });
        var precomputed = new Map();
        if (reordered) {
            sourceOrder.forEach(function (item) {
                if (Kt.isFunctionLiteral(item.actual.value))
                    return;
                var param = params[item.index];
                var target = param.vararg && !item.actual.spread ? self.varargElementType(param) : param.type;
                var value = self.argumentValue(item.actual.value, target);
                if (!isConstant(value)) {
                    var temp = self.temp();
                    self.lift(J.expr(J.assign(temp, value)));
                    value = temp;
                }
                precomputed.set(item.actual, value);
            });
        }
        var values = [];
        var lastProvided = -1;
        slots.forEach(function (slot, index) {
            if (slot.actuals.length > 0 || (params[index].vararg && !slot.defaulted))
                lastProvided = index;
        });
        var thunks = slots.map(function (slot, index) {
            return function () {
                var param = params[index];
                if (slot.defaulted || (slot.actuals.length === 0 && !param.vararg))
                    return J.undef();
                if (param.vararg)
                    return self.varargValue(slot, param, precomputed, result);
                var actual = slot.actuals[0];
                if (precomputed.has(actual))
                    return precomputed.get(actual);
                var passed = fn.intrinsic === 'invoke' ? Kt.nullableAny() : self.passedParam(fn, index);
                return self.argumentValue(actual.value, passed, param, result);
            };
        });
        values = this.ordered(thunks.slice(0, lastProvided + 1));
        return values;
    };

    function isConstant(js) {
        return J.isLiteral(js) || (js.k === 'idx' && js.object.k === 'id' && js.object.name === '$D');
    }

    Generator.prototype.varargElementType = function (param) {
        return param.elementType || Kt.varargElement(param.type);
    };

    // One argument as a value of the parameter type.
    Generator.prototype.argumentValue = function (node, target, param, result) {
        var value = this.valueAs(node, target);
        void param;
        void result;
        return value;
    };

    // vararg: the elements as an array of the parameter's array type; *spread arrays.
    Generator.prototype.varargValue = function (slot, param, precomputed, result) {
        var self = this;
        var elementType = this.varargElementType(param);
        var descriptor = this.varargDescriptor(param, result);
        if (slot.actuals.length === 1 && slot.actuals[0].spread) {
            var spread = precomputed.has(slot.actuals[0]) ? precomputed.get(slot.actuals[0]) : this.expression(slot.actuals[0].value);
            return J.call(this.kt('copyArray'), [spread]);
        }
        var parts = [];
        var current = [];
        slot.actuals.forEach(function (actual) {
            var value = precomputed.has(actual) ? precomputed.get(actual) : null;
            if (actual.spread) {
                if (current.length > 0)
                    parts.push(J.arr(current));
                current = [];
                parts.push(value !== null ? value : self.expression(actual.value));
                return;
            }
            current.push(value !== null ? value : self.valueAs(actual.value, elementType));
        });
        if (parts.length === 0)
            return J.call(this.rt('arrayOf'), [J.str(descriptor), J.arr(current)]);
        if (current.length > 0)
            parts.push(J.arr(current));
        return J.call(this.kt('spreadArray'), [J.str(descriptor), J.arr(parts)]);
    };

    // The descriptor of a vararg array: Int - [I, T - [Ljava.lang.Object;.
    Generator.prototype.varargDescriptor = function (param, result) {
        var type = Kt.resolved(param.type);
        if (type.kind === 'class' && type.sym.arrayDescriptor !== undefined && type.sym !== Kt.builtins.Array)
            return type.sym.arrayDescriptor;
        if (param.javaArray !== undefined && param.javaArray !== null)
            return T.java.descriptor(param.javaArray);
        var substituted = Kt.subst(param.type, result.map || new Map());
        return this.arrayDescriptorOf(substituted);
    };

    // An operator call with JavaScript values ready (delegates, components).
    Generator.prototype.operatorInvocation = function (result, receiverJs, argsJs) {
        var fn = result.fn;
        var receiverType = result.receiverNode !== null && result.receiverNode !== undefined ? result.receiverNode.type : null;
        var args = argsJs.map(function (arg) { return arg; });
        if (fn.intrinsic !== null && fn.intrinsic !== undefined)
            return this.intrinsicCall(fn, receiverJs, receiverType, args, result, null);
        if (fn.owner === null || fn.owner === undefined)
            return this.topLevelCall(result, receiverJs, receiverType, args);
        if (fn.java !== null && fn.java !== undefined)
            return this.methodCall(receiverJs, receiverType, fn.jsName, args, fn.owner);
        if (fn.receiver !== null)
            return J.call(J.mem(this.thisOf(fn.owner), fn.jsName), [receiverJs].concat(args));
        return this.methodCall(receiverJs, receiverType, fn.jsName, args, fn.owner);
    };

    // --- Indexing

    Generator.prototype.indexValue = function (node) {
        if (node.dynamicIndex)
            return J.call(this.kt('dynamicGet'), [this.expression(node.target), this.expression(node.indices[0])]);
        return this.callCode(node.call, node, false);
    };

    // --- Dynamic values (JavaScript)

    Generator.prototype.dynamicCall = function (node) {
        var self = this;
        var callee = node.callee;
        var args = this.ordered(node.args.map(function (arg) {
            return function () { return self.dynamicArgument(arg.value); };
        }).concat(node.lambda !== null ? [function () { return self.dynamicArgument(node.lambda); }] : []));
        if (callee.k === 'member')
            return J.call(this.kt('dynamicCall'), [this.expression(callee.target), J.str(callee.name), J.arr(args)]);
        return J.call(this.kt('dynamicInvoke'), [this.expression(callee), J.arr(args)]);
    };

    Generator.prototype.dynamicArgument = function (node) {
        return J.call(this.kt('toJs'), [this.valueAs(node, Kt.nullableAny())]);
    };
})(globalThis);
