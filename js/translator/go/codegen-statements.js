// Go: translation of statements, functions and a whole unit.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Go = T.go;
    var Generator = Go.Generator;
    if (Generator.prototype.statement)
        return;

    var J = T.J;
    var G = Go.T;
    var types = Go.types;
    var ops = T.ops;
    var isFresh = Go.isFresh;

    function needsCopy(type) {
        var underlyingType = G.underlying(type);
        return underlyingType.kind === 'struct' || underlyingType.kind === 'array';
    }

    // --- Functions

    // A Go function: parameters, cells, copies, defer. receiverMode: 'this'
    // - a struct method (the receiver is this), 'param' - the first parameter.
    Generator.prototype.functionNode = function (info, name, body, receiverMode) {
        var saved = this.fn;
        this.fn = { info: info, scope: new T.FunctionScope('$t'), async: info.async, frame: null, results: null };
        var self = this;
        var params = [];
        var prologue = [];
        var receiver = info.receiver;
        if (receiver !== undefined && receiverMode !== null) {
            var receiverName = receiver.name === '_' ? '$recv' : receiver.jsName;
            if (receiverMode === 'this') {
                var value = J.this_();
                if (!receiver.type.kind !== 'pointer' && receiver.mutated && G.underlying(receiver.type).kind !== 'pointer')
                    value = this.copyOf(value, receiver.type);
                prologue.push(J.let_(receiverName, value));
            } else {
                params.push(receiverName);
                if (receiver.mutated && needsCopy(receiver.type))
                    prologue.push(J.expr(J.assign(J.id(receiverName), this.copyOf(J.id(receiverName), receiver.type))));
                if (receiver.boxed)
                    prologue.push(J.expr(J.assign(J.id(receiverName), J.new_(this.rt('Cell'), [J.id(receiverName)]))));
            }
        }
        info.params.forEach(function (param, index) {
            var jsName = param.name === '_' ? '$p' + index : param.jsName;
            params.push(jsName);
            if (param.mutated && needsCopy(param.type))
                prologue.push(J.expr(J.assign(J.id(jsName), self.copyOf(J.id(jsName), param.type))));
            if (param.boxed)
                prologue.push(J.expr(J.assign(J.id(jsName), J.new_(self.rt('Cell'), [J.id(jsName)]))));
        });
        // Results: named ones are variables; with defer always.
        var resultTypes = info.signature.results;
        var resultNames = [];
        if (info.results.length > 0) {
            info.results.forEach(function (result) {
                resultNames.push(result.jsName);
                var zero = self.zero(result.type);
                prologue.push(J.let_(result.jsName, result.boxed ? J.new_(self.rt('Cell'), [zero]) : zero));
            });
        } else if (info.hasDefer && resultTypes.length > 0) {
            resultTypes.forEach(function (result, index) {
                var resultName = '$r' + index;
                resultNames.push(resultName);
                prologue.push(J.let_(resultName, self.zero(result.type)));
            });
        }
        this.fn.resultNames = resultNames;
        this.fn.resultBoxed = info.results.map(function (result) { return result.boxed; });
        var statements = this.statements(body.list);
        if (info.hasDefer) {
            var frame = '$f';
            var resultValue = this.resultsValue();
            var finalizer = [J.expr(info.async ? J.yield_(J.call(this.rt('runDefersAsync'), [J.id(frame)]), true)
                                               : J.call(this.rt('runDefers'), [J.id(frame)]))];
            if (resultValue !== null)
                finalizer.push(J.ret(resultValue));
            statements = [
                J.let_(frame, J.call(this.rt('deferFrame'), [])),
                J.try_(statements, '$e', [J.expr(J.assign(J.mem(J.id(frame), 'panic'), J.call(this.rt('toPanic'), [J.id('$e')])))],
                       finalizer)
            ];
        }
        var result = J.fn(name, params, this.fn.scope.declarations().concat(prologue, statements), info.async);
        this.fn = saved;
        return result;
    };

    // The value of the results from the variables (for return and finally).
    Generator.prototype.resultsValue = function () {
        var names = this.fn.resultNames;
        var boxed = this.fn.resultBoxed || [];
        if (names.length === 0)
            return null;
        var values = names.map(function (name, index) {
            return boxed[index] ? J.mem(J.id(name), 'v') : J.id(name);
        });
        return values.length === 1 ? values[0] : J.arr(values);
    };

    // --- A whole unit

    // The body of a code chunk: declarations of functions and methods, then
    // a function that runs the top-level statements, init and main.
    Generator.prototype.file = function (file) {
        var self = this;
        this.asyncPossible = this.session.asyncPossible || file.functions.some(function (info) { return info.async; });
        if (this.asyncPossible)
            this.session.asyncPossible = true;
        var body = [];
        file.items.forEach(function (item) {
            if (item.k === 'func' && item.body !== null && item.info !== undefined)
                body.push(self.functionDeclaration(item));
        });
        // Generic instances from other packages: error lines come from their
        // source (for the standard library - the line of the call in the unit).
        this.checker.instances.forEach(function (instance) {
            var declaration = self.functionDeclaration(instance.decl);
            if (instance.pkg !== self.pkg)
                T.setSource(declaration, instance.pkg.natives ? T.LIBRARY_SOURCE : instance.pkg.source);
            body.push(declaration);
        });
        body.push(J.ret(this.topFunction(file)));
        return body;
    };

    Generator.prototype.functionDeclaration = function (decl) {
        var object = decl.object;
        var info = decl.info;
        var target;
        var receiverMode = null;
        if (object.method) {
            var owner = object.recv;
            var methods = G.underlying(owner).kind === 'struct' ? J.mem(J.mem(this.descOf(owner), 'ctor'), 'prototype')
                                                               : J.mem(this.descOf(owner), 'methods');
            target = J.mem(methods, object.jsName);
            receiverMode = G.underlying(owner).kind === 'struct' ? 'this' : 'param';
        } else {
            target = J.mem(this.pkgRef(object.pkg), object.jsName);
        }
        var fn = this.functionNode(info, T.jsName(decl.name), decl.body, receiverMode);
        return J.at(J.expr(J.assign(target, fn)), decl.line);
    };

    Generator.prototype.topFunction = function (file) {
        var info = file.top;
        var saved = this.fn;
        this.fn = { info: info, scope: new T.FunctionScope('$t'), async: info.async, frame: null, results: null,
                    resultNames: [] };
        this.valueStatement = file.valueStatement;
        var statements = [];
        var self = this;
        file.items.forEach(function (item) {
            if (item.k === 'func' || item.k === 'type' || item.k === 'const')
                return;
            if (item.k === 'var') {
                item.specs.forEach(function (spec) {
                    statements = statements.concat(self.varSpec(spec, true));
                });
                return;
            }
            statements = statements.concat(self.statement(item));
        });
        // init, then main - if this unit declares them.
        file.items.forEach(function (item) {
            if (item.k === 'func' && item.name === 'init' && item.receiver === null)
                statements.push(J.at(J.expr(self.finishStatic(item.object, J.call(J.mem(J.id('$m'), item.object.jsName), []))), item.line));
        });
        file.items.forEach(function (item) {
            if (item.k === 'func' && item.name === 'main' && item.receiver === null && item.typeParams === null)
                statements.push(J.at(J.expr(self.finishStatic(item.object, J.call(J.mem(J.id('$m'), 'main'), []))), item.line));
        });
        if (file.valueStatement !== null)
            statements.push(J.ret(J.id('$value')));
        var declarations = this.fn.scope.declarations();
        if (file.valueStatement !== null)
            declarations.push(J.let_('$value', J.undef()));
        var fn = J.fn('$block', [], declarations.concat(statements), info.async);
        this.fn = saved;
        return fn;
    };

    Generator.prototype.finishStatic = function (object, call) {
        if (object.async)
            return this.await(call, true);
        return call;
    };

    // --- Statements

    Generator.prototype.statements = function (list) {
        var result = [];
        for (var index = 0; index < list.length; ++index)
            result = result.concat(this.statement(list[index]));
        return result;
    };

    Generator.prototype.statement = function (node) {
        var line = node.line;
        function at(statement) {
            return J.at(statement, line);
        }
        switch (node.k) {
        case 'declstmt':
            return this.declaration(node.decl);
        case 'exprstmt': {
            var value = this.expr(node.x);
            if (this.valueStatement === node) {
                var expression = node.x;
                var shown = this.box(value, expression.type, true, expression);
                return [at(J.expr(J.assign(J.id('$value'), J.call(this.rt('formatResultOf'), [shown]))))];
            }
            return [at(J.expr(value))];
        }
        case 'send': {
            var elem = G.underlying(node.ch.type).elem;
            return [at(J.expr(this.await(J.call(this.rt('send'), [this.expr(node.ch), this.valueFor(node.value, elem)]), true)))];
        }
        case 'incdec':
            return [at(J.expr(this.compoundAssign(node.x, node.op === '++' ? '+' : '-', null)))];
        case 'assign':
            return this.assignment(node).map(at);
        case 'go':
            return [at(J.expr(this.goStatement(node.call)))];
        case 'defer':
            return [at(J.expr(this.deferStatement(node.call)))];
        case 'return':
            return this.returnStatement(node).map(at);
        case 'branch':
            return [at(this.branch(node))];
        case 'block':
            return [at(J.block(this.statements(node.list)))];
        case 'if':
            return [at(this.ifStatement(node))];
        case 'for':
            return [at(this.forStatement(node))];
        case 'range':
            return [at(this.rangeStatement(node))];
        case 'switch':
            return [at(this.switchStatement(node))];
        case 'typeswitch':
            return [at(this.typeSwitch(node))];
        case 'select':
            return [at(this.selectStatement(node))];
        case 'labeled':
            return this.statement(node.stmt);
        case 'empty':
            return [];
        }
        throw new T.CompileError('cannot translate statement ' + node.k, node.line, node.column, this.source);
    };

    Generator.prototype.declaration = function (decl) {
        var self = this;
        var result = [];
        if (decl.k === 'var') {
            decl.specs.forEach(function (spec) {
                result = result.concat(self.varSpec(spec, false));
            });
        }
        return result;
    };

    // var a, b T = ...
    Generator.prototype.varSpec = function (spec, global) {
        var self = this;
        var objects = spec.objects;
        var statements = [];
        var values;
        if (spec.values === null) {
            values = objects.map(function (object) { return self.zero(object.type); });
        } else if (spec.tupleAssign || spec.commaOk) {
            var tuple = this.temp();
            var source = spec.values[0];
            statements.push(J.at(J.expr(J.assign(tuple, spec.commaOk ? this.commaOk(source) : this.expr(source))), spec.line));
            var sourceTypes = spec.commaOk ? [source.type, types.bool] : source.type.types;
            values = objects.map(function (object, index) {
                return self.convertFor(J.idx(tuple, J.num(index)), sourceTypes[index], object.type, false);
            });
        } else {
            values = spec.values.map(function (value, index) { return self.valueFor(value, objects[index].type); });
        }
        if (values.length > 1 && spec.values !== null && !spec.tupleAssign && !spec.commaOk) {
            // All values before the declarations (var a, b = b, a in another scope).
            var temps = values.map(function (value) {
                var temp = self.temp();
                statements.push(J.at(J.expr(J.assign(temp, value)), spec.line));
                return temp;
            });
            values = temps;
        }
        objects.forEach(function (object, index) {
            statements.push(J.at(self.declare(object, values[index], global), spec.line));
        });
        return statements;
    };

    // A variable declaration (a local is let, a package one is a property).
    Generator.prototype.declare = function (object, value, global) {
        if (object.name === '_')
            return J.expr(value);
        if (object.global || global)
            return J.expr(J.assign(J.mem(this.pkgRef(object.pkg || this.pkg), object.jsName), value));
        if (object.boxed)
            value = J.new_(this.rt('Cell'), [value]);
        return J.let_(object.jsName, value);
    };

    // --- Assignment

    // A place to write to: { setup: [expressions], get, set(value) }.
    Generator.prototype.place = function (node) {
        var ctx = this.opsContext();
        var self = this;
        while (node.k === 'paren')
            node = node.x;
        switch (node.k) {
        case 'ident': {
            var object = node.obj;
            var target = object.global ? J.mem(this.pkgRef(object.pkg), object.jsName)
                                       : (object.boxed ? J.mem(J.id(object.jsName), 'v') : J.id(object.jsName));
            var inPlace = object.global || object.addressTaken;
            return { setup: [], get: target, set: function (value) { return self.write(target, value, node.type, inPlace); } };
        }
        case 'sel': {
            if (node.selKind === 'qualified') {
                var qualified = J.mem(this.pkgRef(node.pkg), node.obj.jsName);
                return { setup: [], get: qualified, set: function (value) { return self.write(qualified, value, node.type, true); } };
            }
            var owner = ops.stable(this.fieldObject(node), ctx);
            var field = J.mem(owner[1], T.propertyName(node.field.name));
            return { setup: [owner[0]], get: field, set: function (value) { return self.write(field, value, node.type, true); } };
        }
        case 'index': {
            if (node.indexKind === 'map') {
                var mapType = G.underlying(node.x.type);
                var map = ops.stable(this.expr(node.x), ctx);
                var key = ops.stable(this.valueFor(node.index, mapType.key), ctx);
                return {
                    setup: [map[0], key[0]],
                    get: J.call(this.rt('mapGet'), [map[1], key[1], this.zeroFiller(mapType.elem)]),
                    set: function (value) { return J.call(self.rt('mapSet'), [map[1], key[1], value]); },
                    map: true
                };
            }
            var where = this.indexPlace(node);
            var array = ops.stable(where.array, ctx);
            var position = ops.stable(where.index, ctx);
            var element = J.idx(array[1], position[1]);
            return { setup: (where.setup || []).concat([array[0], position[0]]), get: element,
                     set: function (value) { return self.write(element, value, node.type, true); } };
        }
        case 'star': {
            var pointer = ops.stable(this.expr(node.x), ctx);
            var underlyingType = G.underlying(node.type);
            if (underlyingType.kind === 'struct' || underlyingType.kind === 'array') {
                return { setup: [pointer[0]], get: pointer[1],
                         set: function (value) { return self.write(pointer[1], value, node.type, true); } };
            }
            var cell = J.mem(pointer[1], 'v');
            return { setup: [pointer[0]], get: cell, set: function (value) { return J.assign(cell, value); } };
        }
        }
        throw new T.CompileError('cannot assign to ' + Go.exprString(node), node.line, node.column, this.source);
    };

    // Stores a value: a struct or an array in a place that a pointer may
    // point to is updated in place.
    Generator.prototype.write = function (target, value, type, inPlace) {
        var underlyingType = G.underlying(type);
        if (inPlace && underlyingType.kind === 'struct')
            return J.method(target, '$set', [value]);
        if (inPlace && underlyingType.kind === 'array')
            return J.method(this.descOf(type), 'set', [target, value]);
        return J.assign(target, value);
    };

    function setupList(setup, node) {
        var list = (setup || []).filter(function (item) { return item !== null; });
        return list.length === 0 ? node : J.seq(list.concat([node]));
    }

    // Stores the value node (or a ready js of the type fromType) to target.
    Generator.prototype.storeNode = function (target, valueNode) {
        if (target.blank || (target.k === 'ident' && target.name === '_'))
            return this.expr(valueNode);
        var place = this.place(target);
        var inPlaceTarget = this.isInPlace(target);
        var value = inPlaceTarget ? this.convertFor(this.expr(valueNode), valueNode.type, target.type, true, valueNode)
                                  : this.valueFor(valueNode, target.type);
        return setupList(place.setup, place.set(value));
    };

    Generator.prototype.isInPlace = function (target) {
        while (target.k === 'paren')
            target = target.x;
        if (!needsCopy(target.type))
            return false;
        if (target.k === 'ident')
            return target.obj.global || target.obj.addressTaken;
        if (target.k === 'index' && target.indexKind === 'map')
            return false;
        return true;
    };

    Generator.prototype.storeJs = function (target, js, fromType) {
        if (target.blank || (target.k === 'ident' && target.name === '_'))
            return js;
        var place = this.place(target);
        return setupList(place.setup, place.set(this.convertFor(js, fromType, target.type, this.isInPlace(target))));
    };

    // x op= y (and x++): the place is evaluated once.
    Generator.prototype.compoundAssign = function (target, op, valueNode) {
        var place = this.place(target);
        var type = target.type;
        var right = valueNode === null ? this.constantValue(1, type) : this.expr(valueNode);
        var result;
        if (G.isString(type)) {
            result = J.bin('+', place.get, right);
        } else {
            if ((op === '<<' || op === '>>') && valueNode !== null)
                right = valueNode.mode === 'const' ? J.num(Math.min(1000, T.big.toFloat(valueNode.value)))
                                                   : J.call(this.rt('shiftCount'), [right]);
            result = ops.binary(G.numKind(type), op, place.get, right, this.opsContext());
        }
        return setupList(place.setup, place.set(result));
    };

    // v, ok := m[k] / x.(T) / <-ch: [value, ok].
    Generator.prototype.commaOk = function (node) {
        while (node.k === 'paren')
            node = node.x;
        if (node.k === 'index') {
            var mapType = G.underlying(node.x.type);
            return J.call(this.rt('mapGet2'), [this.expr(node.x), this.valueFor(node.index, mapType.key),
                                               this.zeroFiller(mapType.elem)]);
        }
        if (node.k === 'assert')
            return J.call(this.rt('assert2'), [this.expr(node.x), this.descOf(node.assertType)]);
        if (node.k === 'unary' && node.op === '<-')
            return this.receive(node, true);
        throw new T.CompileError('bad comma-ok expression', node.line, node.column, this.source);
    };

    Generator.prototype.assignment = function (node) {
        var self = this;
        var op = node.op;
        if (op !== '=' && op !== ':=')
            return [J.expr(this.compoundAssign(node.lhs[0], op.substring(0, op.length - 1), node.rhs[0]))];
        var define = op === ':=';
        var lhs = node.lhs, rhs = node.rhs;
        var statements = [];
        if (node.tupleAssign || node.commaOk) {
            var tuple = this.temp();
            statements.push(J.expr(J.assign(tuple, node.commaOk ? this.commaOk(rhs[0]) : this.expr(rhs[0]))));
            lhs.forEach(function (target, index) {
                var element = J.idx(tuple, J.num(index));
                var fromType = node.resultTypes[index] === types.untypedBool ? types.bool : node.resultTypes[index];
                if (define && node.defines[index] !== null) {
                    var object = node.defines[index];
                    statements.push(self.declare(object, self.convertFor(element, fromType, object.type, false), false));
                } else if (!(target.k === 'ident' && target.name === '_')) {
                    statements.push(J.expr(self.storeJs(target, element, fromType)));
                }
            });
            return statements;
        }
        if (lhs.length === 1) {
            if (define && node.defines[0] !== null)
                return [this.declare(node.defines[0], this.valueFor(rhs[0], node.defines[0].type), false)];
            return [J.expr(this.storeNode(lhs[0], rhs[0]))];
        }
        // A parallel assignment: all values first.
        var temps = rhs.map(function (value, index) {
            var temp = self.temp();
            var targetType = lhs[index].type || value.type;
            statements.push(J.expr(J.assign(temp, self.valueFor(value, targetType))));
            return temp;
        });
        lhs.forEach(function (target, index) {
            if (define && node.defines[index] !== null) {
                statements.push(self.declare(node.defines[index], temps[index], false));
            } else if (!(target.k === 'ident' && target.name === '_')) {
                var place = self.place(target);
                statements.push(J.expr(setupList(place.setup, place.set(temps[index]))));
            }
        });
        return statements;
    };

    // --- go and defer

    // A call whose function, receiver and arguments are evaluated now:
    // [this, function, [arguments]].
    Generator.prototype.capturedCall = function (call) {
        var self = this;
        if (call.callKind === 'builtin') {
            var name = call.builtin;
            var args = call.args;
            switch (name) {
            case 'close':
                return [J.nul(), this.rt('close'), J.arr([this.expr(args[0])])];
            case 'panic':
                return [J.nul(), this.rt('doPanic'), J.arr([this.valueFor(args[0], Go.anyType)])];
            case 'print':
            case 'println':
                return [J.nul(), this.rt(name === 'println' ? 'builtinPrintln' : 'builtinPrint'),
                        J.arr([J.arr(args.map(function (arg) { return self.box(self.expr(arg), arg.type, true, arg); }))])];
            case 'delete': {
                var mapType = G.underlying(args[0].type);
                return [J.nul(), this.rt('mapDelete'), J.arr([this.expr(args[0]), this.valueFor(args[1], mapType.key)])];
            }
            case 'recover':
                return [J.nul(), this.rt('recover'), J.arr([])];
            }
            throw new T.CompileError(name + ' cannot be used in go or defer here', call.line, call.column, this.source);
        }
        if (call.callKind === 'conversion')
            throw new T.CompileError('go and defer require function call, not conversion', call.line, call.column, this.source);
        var parts = this.callParts(call);
        var callee = parts.callee;
        if (callee.k === 'mem') {
            var object = ops.stable(callee.object, this.opsContext());
            var fn = J.mem(object[1], callee.name);
            return [object[0] === null ? object[1] : J.seq([object[0], object[1]]), fn, J.arr(parts.args)];
        }
        return [J.nul(), callee, J.arr(parts.args)];
    };

    Generator.prototype.goStatement = function (call) {
        var target = call.callKind === 'builtin' || call.callKind === 'conversion' ? null : this.calledFunction(call);
        if (target !== null && target.async) {
            var parts = this.callParts(call);
            return J.call(this.rt('go'), [J.call(parts.callee, parts.args)]);
        }
        var captured = this.capturedCall(call);
        return J.call(this.rt('goCall'), captured);
    };

    Generator.prototype.deferStatement = function (call) {
        var captured = this.capturedCall(call);
        return J.call(this.rt('deferCall'), [J.id('$f')].concat(captured));
    };

    // --- return

    Generator.prototype.returnStatement = function (node) {
        var self = this;
        var info = this.fn.info;
        var results = info.signature.results;
        var hasDefer = info.hasDefer;
        var names = this.fn.resultNames;
        if (node.results.length === 0) {
            if (hasDefer || names.length === 0)
                return [J.ret(null)];
            return [J.ret(this.resultsValue())];
        }
        var values;
        var statements = [];
        if (node.spread) {
            var tuple = this.temp();
            statements.push(J.expr(J.assign(tuple, this.expr(node.results[0]))));
            var tupleTypes = node.results[0].type.types;
            values = results.map(function (result, index) {
                return self.convertFor(J.idx(tuple, J.num(index)), tupleTypes[index], result.type, true);
            });
        } else {
            values = node.results.map(function (value, index) {
                return self.returnValue(value, results[index].type);
            });
        }
        if (hasDefer || (info.results.length > 0 && values.length > 1)) {
            if (hasDefer) {
                // The results go to variables; finally returns them after defer.
                if (values.length > 1) {
                    var temps = values.map(function (value) {
                        var temp = self.temp();
                        statements.push(J.expr(J.assign(temp, value)));
                        return temp;
                    });
                    values = temps;
                }
                values.forEach(function (value, index) {
                    var target = self.fn.resultBoxed[index] ? J.mem(J.id(names[index]), 'v') : J.id(names[index]);
                    statements.push(J.expr(J.assign(target, value)));
                });
                statements.push(J.ret(null));
                return statements;
            }
        }
        statements.push(J.ret(values.length === 1 ? values[0] : J.arr(values)));
        return statements;
    };

    // A returned struct must not share its object with a variable that
    // outlives the call.
    Generator.prototype.returnValue = function (node, type) {
        var inner = node;
        while (inner.k === 'paren')
            inner = inner.x;
        if (needsCopy(node.type) && inner.k === 'ident' && inner.obj && inner.obj.kind === 'var' && !inner.obj.global &&
            !inner.obj.addressTaken && !inner.obj.captured && !G.isInterface(type))
            return this.expr(node);
        return this.valueFor(node, type);
    };

    // --- break, continue

    Generator.prototype.labelOf = function (target) {
        if (target.jsLabel === undefined)
            target.jsLabel = '$L' + (++this.labelCounter);
        target.labelReferenced = true;
        return target.jsLabel;
    };

    Generator.prototype.branch = function (node) {
        switch (node.tok) {
        case 'break':
            return J.brk(this.labelOf(node.target));
        case 'continue':
            return J.cont(this.labelOf(node.target));
        case 'fallthrough':
            return J.empty();
        }
        throw new T.CompileError(node.tok + ' is not supported', node.line, node.column, this.source);
    };

    function labelled(node, statement) {
        if (node.labelReferenced)
            return J.label(node.jsLabel, statement);
        return statement;
    }

    // --- if, for

    Generator.prototype.ifStatement = function (node) {
        var init = node.init !== null ? this.statement(node.init) : [];
        var condition = this.expr(node.cond);
        var then = J.block(this.statements(node.then.list));
        var otherwise = null;
        if (node.otherwise !== null) {
            var rest = this.statement(node.otherwise);
            otherwise = rest.length === 1 && (rest[0].k === 'if' || rest[0].k === 'block') ? rest[0] : J.block(rest);
        }
        var statement = J.at(J.if_(condition, then, otherwise), node.line);
        if (init.length === 0)
            return statement;
        return J.block(init.concat([statement]));
    };

    Generator.prototype.forStatement = function (node) {
        var self = this;
        var before = [];
        var init = null;
        if (node.init !== null) {
            var initNode = node.init;
            var loopVars = initNode.k === 'assign' && initNode.op === ':=' && !initNode.tupleAssign && !initNode.commaOk &&
                initNode.defines.every(function (object) { return object !== null && !object.boxed; });
            if (loopVars) {
                // for i := 0; ... - let in the header: every iteration has its own i.
                init = J.vars(initNode.defines.map(function (object, index) {
                    return { name: object.jsName, init: self.valueFor(initNode.rhs[index], object.type) };
                }), 'let');
            } else {
                before = this.statement(initNode);
            }
        }
        var condition = node.cond !== null ? this.expr(node.cond) : null;
        var post = null;
        if (node.post !== null) {
            var postStatements = this.statement(node.post);
            post = J.seq(postStatements.map(function (statement) { return statement.expression; }));
        }
        var body = J.block(this.statements(node.body.list));
        var loop = labelled(node, J.at(J.for_(init, condition, post, body), node.line));
        if (before.length === 0)
            return loop;
        return J.block(before.concat([loop]));
    };

    // --- range

    Generator.prototype.rangeStatement = function (node) {
        var self = this;
        var ctx = this.opsContext();
        var keyTarget = node.key, valueTarget = node.value;
        // Assigns the key and the value at every iteration.
        function bind(target, object, js, type) {
            if (target === null || (target.k === 'ident' && target.name === '_'))
                return [];
            if (node.define) {
                if (object === null)
                    return [];
                var value = js;
                if (needsCopy(type) && object.mutated)
                    value = self.copyOf(value, type);
                return [self.declare(object, value, false)];
            }
            return [J.expr(self.storeJs(target, js, type))];
        }
        var defines = node.defines || [null, null];
        var collection = this.temp();
        var setup = [J.expr(J.assign(collection, this.expr(node.x)))];
        var index = J.id(this.fn.scope.temp());
        var loop;
        switch (node.rangeKind) {
        case 'slice':
        case 'array': {
            var length = this.temp();
            var isSlice = node.rangeKind === 'slice';
            setup.push(J.expr(J.assign(length, isSlice ? J.mem(collection, 'n') : J.mem(collection, 'length'))));
            var elemType = isSlice ? G.underlying(node.x.type).elem
                                   : G.underlying(node.derefArray ? G.underlying(node.x.type).elem : node.x.type).elem;
            var element = isSlice ? J.idx(J.mem(collection, 'a'), J.bin('+', J.mem(collection, 'o'), index))
                                  : J.idx(collection, index);
            var steps = bind(keyTarget, defines[0], index, types.int)
                .concat(valueTarget !== null ? bind(valueTarget, defines[1], element, elemType) : []);
            loop = J.for_(J.assign(index, J.num(0)), J.bin('<', index, length), J.update('++', true, index),
                          J.block(steps.concat(this.statements(node.body.list))));
            break;
        }
        case 'string': {
            var rune = this.temp();
            var start = this.temp();
            var stringSteps = [J.expr(J.assign(start, index)),
                               J.expr(J.assign(rune, J.call(this.rt('decodeRune'), [collection, index]))),
                               J.expr(J.assign(index, J.bin('+', index, J.idx(rune, J.num(1)))))]
                .concat(bind(keyTarget, defines[0], start, types.int))
                .concat(valueTarget !== null ? bind(valueTarget, defines[1], J.idx(rune, J.num(0)), types.rune) : []);
            loop = J.for_(J.assign(index, J.num(0)), J.bin('<', index, J.mem(collection, 'length')), null,
                          J.block(stringSteps.concat(this.statements(node.body.list))));
            break;
        }
        case 'map': {
            var entries = this.temp();
            setup.push(J.expr(J.assign(entries, J.call(this.rt('mapEntries'), [collection]))));
            var entry = J.idx(entries, index);
            var mapType = G.underlying(node.x.type);
            var mapSteps = bind(keyTarget, defines[0], J.idx(entry, J.num(0)), mapType.key)
                .concat(valueTarget !== null ? bind(valueTarget, defines[1], J.idx(entry, J.num(1)), mapType.elem) : []);
            loop = J.for_(J.assign(index, J.num(0)), J.bin('<', index, J.mem(entries, 'length')), J.update('++', true, index),
                          J.block(mapSteps.concat(this.statements(node.body.list))));
            break;
        }
        case 'chan': {
            var received = this.temp();
            var chanType = G.underlying(node.x.type);
            var chanSteps = [J.expr(J.assign(received, this.await(J.call(this.rt('recv2'), [collection, this.zeroFiller(chanType.elem)]), true))),
                             J.if_(J.not(J.idx(received, J.num(1))), J.brk(this.labelOf(node)), null)]
                .concat(bind(keyTarget, defines[0], J.idx(received, J.num(0)), chanType.elem));
            loop = J.for_(null, null, null, J.block(chanSteps.concat(this.statements(node.body.list))));
            break;
        }
        case 'int': {
            var limitType = node.x.type;
            var kind = G.numKind(limitType);
            var test = ops.binary(kind, '<', index, collection, ctx);
            var increment = J.assign(index, ops.binary(kind, '+', index, J.num(1), ctx));
            var intSteps = bind(keyTarget, defines[0], index, limitType);
            loop = J.for_(J.assign(index, J.num(0)), test, increment, J.block(intSteps.concat(this.statements(node.body.list))));
            break;
        }
        }
        loop = labelled(node, J.at(loop, node.line));
        return J.block(setup.concat([loop]));
    };

    // --- switch

    Generator.prototype.switchStatement = function (node) {
        var self = this;
        var init = node.init !== null ? this.statement(node.init) : [];
        var statements = init.slice();
        var tag = null;
        if (node.tag !== null) {
            tag = this.temp();
            statements.push(J.expr(J.assign(tag, this.expr(node.tag))));
        }
        var tagType = node.tag !== null ? node.tag.type : types.bool;
        function matches(clause) {
            var tests = clause.values.map(function (value) {
                if (tag === null)
                    return self.expr(value);
                return self.compareWithTag(tag, tagType, value);
            });
            return tests.reduce(function (left, right) { return J.or(left, right); });
        }
        var hasFallthrough = node.clauses.some(function (clause) { return clause.fallthrough; });
        if (!hasFallthrough) {
            // An if/else chain in the order of the cases; default at the end.
            var chain = null;
            node.clauses.forEach(function (clause) {
                if (clause.values === null)
                    chain = J.block(self.statements(clause.body));
            });
            var cases = node.clauses.filter(function (clause) { return clause.values !== null; });
            var bodies = cases.map(function (clause) { return J.block(self.statements(clause.body)); });
            for (var caseIndex = cases.length - 1; caseIndex >= 0; --caseIndex)
                chain = J.at(J.if_(matches(cases[caseIndex]), bodies[caseIndex], chain), cases[caseIndex].line);
            if (chain !== null)
                statements.push(chain);
        } else {
            // With fallthrough: the case number, then a JavaScript switch.
            var choice = this.temp();
            var selector = J.num(-1);
            var defaultIndex = -1;
            for (var position = node.clauses.length - 1; position >= 0; --position) {
                if (node.clauses[position].values === null) {
                    defaultIndex = position;
                    continue;
                }
                selector = J.cond(matches(node.clauses[position]), J.num(position), selector);
            }
            if (defaultIndex >= 0)
                selector = J.cond(J.bin('===', J.assign(choice, selector), J.num(-1)), J.num(defaultIndex), choice);
            statements.push(J.expr(J.assign(choice, selector)));
            var jsCases = node.clauses.map(function (clause, clauseIndex) {
                var caseBody = self.statements(clause.body);
                if (!clause.fallthrough)
                    caseBody.push(J.brk(null));
                return J.at({ test: J.num(clauseIndex), body: caseBody }, clause.line);
            });
            statements.push(J.switch_(choice, jsCases));
        }
        var block = J.block(statements);
        return node.labelReferenced ? J.label(node.jsLabel, block) : block;
    };

    Generator.prototype.compareWithTag = function (tagJs, tagType, value) {
        var type = value.compareType || tagType;
        var left = G.isInterface(type) && !G.isInterface(tagType) ? this.box(tagJs, tagType, true) : tagJs;
        var right = this.valueFor(value, type);
        var tu = G.underlying(type);
        var ctx = this.opsContext();
        switch (tu.kind) {
        case 'basic': {
            var kind = G.numKind(type);
            if (kind !== null)
                return ops.binary(kind, '==', left, right, ctx);
            return J.bin('===', left, right);
        }
        case 'interface':
            return J.call(this.rt('ifaceEqual'), [left, right]);
        case 'struct':
            return J.method(left, '$eq', [right]);
        case 'array':
            return J.call(this.rt('equal'), [this.descOf(type), left, right]);
        case 'pointer':
            return J.call(this.rt('pointerEqual'), [left, right]);
        }
        return J.bin('===', left, right);
    };

    Generator.prototype.typeSwitch = function (node) {
        var self = this;
        var init = node.init !== null ? this.statement(node.init) : [];
        var statements = init.slice();
        var value = this.temp();
        var dynamic = this.temp();
        statements.push(J.expr(J.assign(value, this.expr(node.x))));
        statements.push(J.expr(J.assign(dynamic, J.call(this.rt('typeOf'), [value]))));
        var defaultClause = null;
        var chain = null;
        var clauses = node.clauses.filter(function (clause) {
            if (clause.values === null) {
                defaultClause = clause;
                return false;
            }
            return true;
        });
        function bodyOf(clause) {
            var body = [];
            if (clause.binding !== undefined) {
                var binding = clause.binding;
                var bound = value;
                if (clause.values !== null && clause.values.length === 1 && !clause.values[0].isNil &&
                    !G.isInterface(clause.values[0].caseType)) {
                    bound = J.call(self.rt('valueOf'), [value]);
                    if (needsCopy(binding.type) && binding.mutated)
                        bound = self.copyOf(bound, binding.type);
                }
                body.push(self.declare(binding, bound, false));
            }
            return J.block(body.concat(self.statements(clause.body)));
        }
        chain = defaultClause !== null ? bodyOf(defaultClause) : null;
        for (var index = clauses.length - 1; index >= 0; --index) {
            var clause = clauses[index];
            var tests = clause.values.map(function (item) {
                if (item.isNil)
                    return J.bin('===', value, J.nul());
                if (G.isInterface(item.caseType))
                    return J.and(J.bin('!==', dynamic, J.nul()), J.call(self.rt('implements'), [dynamic, self.descOf(item.caseType)]));
                return J.bin('===', dynamic, self.descOf(item.caseType));
            });
            chain = J.at(J.if_(tests.reduce(function (left, right) { return J.or(left, right); }), bodyOf(clause), chain), clause.line);
        }
        if (chain !== null)
            statements.push(chain);
        var block = J.block(statements);
        return node.labelReferenced ? J.label(node.jsLabel, block) : block;
    };

    // --- select

    Generator.prototype.selectStatement = function (node) {
        var self = this;
        var statements = [];
        var cases = [];
        var caseIndex = [];
        node.clauses.forEach(function (clause) {
            if (clause.comm === null) {
                caseIndex.push(-1);
                return;
            }
            caseIndex.push(cases.length);
            if (clause.commKind === 'send') {
                var comm = clause.comm;
                var elem = G.underlying(comm.ch.type).elem;
                cases.push(J.obj([['send', J.bool(true)], ['ch', self.expr(comm.ch)], ['value', self.valueFor(comm.value, elem)]]));
            } else {
                var receive = clause.receive;
                var chanType = G.underlying(receive.x.type);
                cases.push(J.obj([['ch', self.expr(receive.x)], ['zero', self.zeroFiller(chanType.elem)]]));
            }
        });
        var result = this.temp();
        statements.push(J.expr(J.assign(result, this.await(J.call(this.rt('select'), [J.arr(cases), J.bool(node.hasDefault)]), true))));
        var chain = null;
        for (var index = node.clauses.length - 1; index >= 0; --index) {
            var clause = node.clauses[index];
            var body = [];
            if (clause.commKind === 'receive' && clause.comm.k === 'assign') {
                var comm = clause.comm;
                var elemType = G.underlying(clause.receive.x.type).elem;
                var received = [J.idx(result, J.num(1)), J.idx(result, J.num(2))];
                var receivedTypes = [elemType, types.bool];
                comm.lhs.forEach(function (target, targetIndex) {
                    if (comm.op === ':=') {
                        var object = comm.defines[targetIndex];
                        if (object !== null)
                            body.push(self.declare(object, received[targetIndex], false));
                    } else if (!(target.k === 'ident' && target.name === '_')) {
                        body.push(J.expr(self.storeJs(target, received[targetIndex], receivedTypes[targetIndex])));
                    }
                });
            }
            body = body.concat(this.statements(clause.body));
            chain = J.at(J.if_(J.bin('===', J.idx(result, J.num(0)), J.num(caseIndex[index])), J.block(body), chain), clause.line);
        }
        if (chain !== null)
            statements.push(chain);
        var block = J.block(statements);
        return node.labelReferenced ? J.label(node.jsLabel, block) : block;
    };
})(globalThis);
