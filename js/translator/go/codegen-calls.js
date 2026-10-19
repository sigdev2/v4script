// Go: translation of calls, conversions and built-in functions.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Go = T.go;
    var Generator = Go.Generator;
    if (Generator.prototype.call)
        return;

    var J = T.J;
    var G = Go.T;
    var types = Go.types;
    var ops = T.ops;
    var desc = Go.desc;
    var isFresh = Go.isFresh;

    Generator.prototype.call = function (node) {
        switch (node.callKind) {
        case 'conversion':
            return this.conversion(node);
        case 'builtin':
            return this.builtin(node);
        }
        var parts = this.callParts(node);
        var call = J.call(parts.callee, parts.args);
        return this.finishCall(node, call);
    };

    // A call may return a generator: a fiber function (known at
    // translation) or a function value (decided at run time).
    Generator.prototype.finishCall = function (node, call) {
        var target = this.calledFunction(node);
        if (target !== null) {
            if (target.async)
                return this.await(call, true);
            return call;
        }
        if (!this.asyncPossible)
            return call;
        if (this.fn.async) {
            var value = this.temp();
            return J.seq([J.assign(value, call),
                          J.cond(J.call(J.mem(J.id('$T'), 'isGenerator'), [value]), J.yield_(value, true), value)]);
        }
        return J.call(this.rt('sync'), [call]);
    };

    // The object of the function if the call is static.
    Generator.prototype.calledFunction = function (node) {
        var fn = node.fn;
        while (fn.k === 'paren')
            fn = fn.x;
        if (fn.instance)
            return fn.instance;
        if (fn.k === 'ident' && fn.obj && fn.obj.kind === 'func')
            return fn.obj;
        if (fn.k === 'sel') {
            if (fn.selKind === 'qualified' && fn.obj.kind === 'func')
                return fn.obj;
            if (fn.selKind === 'method' && !fn.interfaceMethod)
                return fn.method;
        }
        return null;
    };

    // The callee and the arguments (converted to the parameter types already).
    Generator.prototype.callParts = function (node) {
        var fn = node.fn;
        while (fn.k === 'paren')
            fn = fn.x;
        var sig = node.signature;
        var callee;
        var leading = [];
        if (fn.k === 'sel' && fn.selKind === 'method') {
            var name = T.propertyName(fn.name);
            if (fn.interfaceMethod) {
                callee = J.mem(this.receiverPath(fn).js, name);
            } else {
                var method = fn.method;
                var receiver = this.methodReceiver(fn, method);
                if (G.underlying(method.recv).kind === 'struct') {
                    callee = J.mem(receiver, name);
                } else {
                    callee = J.mem(J.mem(this.descOf(method.recv), 'methods'), name);
                    leading.push(receiver);
                }
            }
        } else {
            callee = this.expr(fn);
        }
        return { callee: callee, args: leading.concat(this.callArguments(node, sig)) };
    };

    // Arguments: conversion to the parameters, the variadic slice, f(g()).
    Generator.prototype.callArguments = function (node, sig) {
        var self = this;
        var params = sig.params;
        var args = node.args;
        if (node.spread) {
            // f(g()): the results of g go to a temporary, then one by one.
            var tuple = this.temp();
            var spreadTypes = node.spreadTypes;
            var first = J.assign(tuple, this.expr(args[0]));
            var values = spreadTypes.map(function (type, index) {
                return J.idx(tuple, J.num(index));
            });
            var converted = this.packArguments(values, spreadTypes, sig, false, function () { return true; });
            converted[0] = J.seq([first, converted[0] || J.undef()]);
            if (converted.length === 0)
                return [first];
            return converted;
        }
        var jsArgs = args.map(function (arg) { return self.expr(arg); });
        var argTypes = args.map(function (arg) { return arg.type; });
        return this.packArguments(jsArgs, argTypes, sig, node.ellipsis, function (index) { return isFresh(args[index]); }, args);
    };

    Generator.prototype.packArguments = function (values, valueTypes, sig, ellipsis, fresh, nodes) {
        var params = sig.params;
        var fixed = sig.variadic ? params.length - 1 : params.length;
        var result = [];
        for (var index = 0; index < Math.min(fixed, values.length); ++index)
            result.push(this.convertFor(values[index], valueTypes[index], params[index].type, fresh(index), nodes && nodes[index]));
        if (!sig.variadic)
            return result;
        var variadicType = params[params.length - 1].type;
        if (ellipsis) {
            result.push(values[values.length - 1]);
            return result;
        }
        var rest = [];
        for (var at = fixed; at < values.length; ++at)
            rest.push(this.convertFor(values[at], valueTypes[at], variadicType.elem, fresh(at), nodes && nodes[at]));
        result.push(rest.length === 0 ? this.rt('NIL') : J.call(this.rt('slice'), [J.arr(rest)]));
        return result;
    };

    // --- Conversions

    Generator.prototype.conversion = function (node) {
        var target = node.convType;
        var arg = node.args[0];
        if (node.mode === 'const')
            return this.constantValue(node.value, target);
        var from = arg.type;
        var js = this.expr(arg);
        if (from === types.untypedNil)
            return this.nilOf(target);
        if (G.isInterface(target)) {
            if (G.isInterface(from))
                return js;
            return this.box(js, from, isFresh(arg), arg);
        }
        var fu = G.underlying(from), tu = G.underlying(target);
        if (G.isString(target)) {
            if (G.isInteger(from))
                return J.call(this.rt('runeString'), [js]);
            if (fu.kind === 'slice')
                return J.call(this.rt(G.underlying(fu.elem) === types.uint8 ? 'bytesToString' : 'runesToString'), [js]);
            return js;
        }
        if (G.isString(from) && tu.kind === 'slice')
            return J.call(this.rt(G.underlying(tu.elem) === types.uint8 ? 'stringToBytes' : 'stringToRunes'), [js]);
        if (G.isNumeric(from) && G.isNumeric(target))
            return ops.convert(G.numKind(from), G.numKind(target), js, this.opsContext());
        if (fu.kind === 'slice' && tu.kind === 'array')
            return J.call(this.rt('sliceToArray'), [js, J.num(tu.length)]);
        if (fu.kind === 'slice' && tu.kind === 'pointer')
            return J.call(this.rt('sliceToArray'), [js, J.num(G.underlying(tu.elem).length)]);
        return js;
    };

    // --- Built-in functions

    Generator.prototype.builtin = function (node) {
        var self = this;
        var args = node.args;
        switch (node.builtin) {
        case 'len':
        case 'cap': {
            if (node.mode === 'const')
                return this.constantValue(node.value, types.int);
            var arg = args[0];
            var underlyingType = G.underlying(arg.type);
            var value = this.expr(arg);
            if (G.isString(arg.type))
                return J.mem(value, 'length');
            if (underlyingType.kind === 'slice')
                return J.mem(value, node.builtin === 'len' ? 'n' : 'c');
            if (underlyingType.kind === 'map')
                return J.call(this.rt('mapLen'), [value]);
            if (underlyingType.kind === 'chan')
                return J.call(this.rt(node.builtin === 'len' ? 'chanLen' : 'chanCap'), [value]);
            if (underlyingType.kind === 'pointer')
                return J.seq([J.call(this.rt('nilPointerCheck'), [value]),
                              J.num(G.underlying(underlyingType.elem).length)]);
            return J.mem(value, 'length');
        }
        case 'append': {
            var slice = this.expr(args[0]);
            var elem = G.underlying(args[0].type).elem;
            var size = J.num(Go.sizeof(elem));
            if (node.ellipsis) {
                if (node.appendString)
                    return J.call(this.rt('appendString'), [slice, this.expr(args[1])]);
                return J.call(this.rt('appendSlice'), [slice, this.expr(args[1]), size]);
            }
            var values = args.slice(1).map(function (arg) { return self.valueFor(arg, elem); });
            if (values.length === 1)
                return J.call(this.rt('append1'), [slice, values[0], size]);
            return J.call(this.rt('append'), [slice, J.arr(values), size]);
        }
        case 'make': {
            var made = args[0].type;
            var mu = G.underlying(made);
            if (mu.kind === 'slice') {
                var makeArgs = [this.size(args[1]), args.length > 2 ? this.size(args[2]) : J.undef(),
                                this.zeroFiller(mu.elem)];
                return J.call(this.rt('makeSlice'), makeArgs);
            }
            if (mu.kind === 'map') {
                var keyFn = desc(mu.key).kind !== undefined ? desc(made).keyFn : null;
                return J.call(this.rt('makeMap'), [keyFn === null ? J.nul() : this.constant(keyFn)]);
            }
            return J.call(this.rt('makeChan'), [args.length > 1 ? this.size(args[1]) : J.num(0)]);
        }
        case 'new': {
            var allocated = args[0].type;
            var au = G.underlying(allocated);
            if (au.kind === 'struct' || au.kind === 'array')
                return J.method(this.descOf(allocated), 'zero', []);
            return J.new_(this.rt('Cell'), [this.zero(allocated)]);
        }
        case 'delete': {
            var mapType = G.underlying(args[0].type);
            return J.call(this.rt('mapDelete'), [this.expr(args[0]), this.valueFor(args[1], mapType.key)]);
        }
        case 'copy':
            if (node.copyString)
                return J.call(this.rt('copyString'), [this.expr(args[0]), this.expr(args[1])]);
            return J.call(this.rt('copy'), [this.expr(args[0]), this.expr(args[1])]);
        case 'panic':
            return J.call(this.rt('doPanic'), [this.valueFor(args[0], Go.anyType)]);
        case 'recover':
            return J.call(this.rt('recover'), []);
        case 'print':
        case 'println': {
            var printed = args.map(function (arg) { return self.box(self.expr(arg), arg.type, true, arg); });
            return J.call(this.rt(node.builtin === 'println' ? 'builtinPrintln' : 'builtinPrint'), [J.arr(printed)]);
        }
        case 'min':
        case 'max': {
            if (node.mode === 'const')
                return this.constantValue(node.value, node.type);
            var type = node.type;
            var items = args.map(function (arg) { return self.expr(arg); });
            var kind = G.numKind(type);
            if (G.isString(type))
                return J.call(this.rt(node.builtin === 'min' ? 'minString' : 'maxString'), items);
            if (kind === 'i64' || kind === 'u64')
                return J.call(this.rt(node.builtin === 'min' ? 'minWide' : 'maxWide'), [J.bool(kind === 'u64')].concat(items));
            return J.call(J.path('Math.' + node.builtin), items);
        }
        case 'clear': {
            var cleared = G.underlying(args[0].type);
            if (cleared.kind === 'map')
                return J.call(this.rt('mapClear'), [this.expr(args[0])]);
            return J.call(this.rt('clearSlice'), [this.expr(args[0]), this.zeroFiller(cleared.elem)]);
        }
        case 'close':
            return J.call(this.rt('close'), [this.expr(args[0])]);
        }
        throw new T.CompileError(node.builtin + ' is not supported', node.line, node.column, this.source);
    };

    // A size for make: a number (the run time checks the hybrid).
    Generator.prototype.size = function (node) {
        return this.expr(node);
    };
})(globalThis);
