// C++: translation of statements, functions and a unit (continues
// codegen.js). A block with objects that have destructors is a try whose
// finally destroys the objects constructed so far (a counter) when the
// block ends normally, by break/continue/return or by a C++ exception -
// not by a fatal error (a segmentation fault, exit). A function with such
// blocks restores the stack pointer in a finally of its own.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var C = T.c;
    var X = T.cpp;
    var Generator = X.Generator;
    if (Object.prototype.hasOwnProperty.call(Generator.prototype, 'statement'))
        return;

    var J = T.J;
    var types = X.types;
    var unqual = X.unqual;
    var kindOf = X.kindOf;

    // --- Statements

    Generator.prototype.at = function (node, statement) {
        if (node === null || node === undefined)
            return statement;
        var source = this.session.sourceOf(node.file);
        return J.at(statement, node.line, source);
    };

    Generator.prototype.statements = function (items) {
        var result = [];
        for (var index = 0; index < items.length; ++index)
            result = result.concat(this.statement(items[index]));
        return result;
    };

    Generator.prototype.statement = function (node) {
        var self = this;
        function at(statement) {
            return self.at(node, statement);
        }
        switch (node.k) {
        case 'block':
            return [at(J.block(this.block(node.items)))];
        case 'group':
            return this.statements(node.items);
        case 'expr':
            if (this.valueStatement === node)
                return [at(J.expr(this.shownValue(node.expr)))];
            return [at(J.expr(this.fullEffect(function () { return this.effect(node.expr); })))];
        case 'decl':
            return this.declaration(node).map(at);
        case 'if':
            return [at(J.if_(this.fullValue(function () { return this.test(node.cond); }), this.body(node.then),
                             node.otherwise === null ? null : this.body(node.otherwise)))];
        case 'while':
            return [at(J.while_(this.fullValue(function () { return this.test(node.cond); }), this.loopBody(node.body,
                                                                                                         node.decl)))];
        case 'do':
            return [at(J.doWhile(this.body(node.body), this.fullValue(function () { return this.test(node.cond); })))];
        case 'for':
            return this.forStatement(node).map(at);
        case 'switch':
            return [at(this.switchStatement(node))];
        case 'case':
        case 'default':
            this.error(node, "'" + node.k + "' label inside a nested statement is not supported");
            break;
        case 'break':
            return [at(J.brk(null))];
        case 'continue':
            return [at(J.cont(null))];
        case 'return':
            return this.returnStatement(node).map(at);
        case 'try':
            return [at(this.tryStatement(node))];
        case 'empty':
            return [];
        }
        this.error(node, 'cannot translate statement ' + node.k);
    };

    Generator.prototype.body = function (node) {
        var list = this.statement(node);
        return list.length === 1 && list[0].k === 'block' ? list[0] : J.block(list);
    };

    Generator.prototype.loopBody = function (node, declarations) {
        if (declarations === undefined || declarations.length === 0)
            return this.body(node);
        return J.block(this.block(declarations.concat([node])));
    };

    // The statements of a block; objects with destructors make a try.
    Generator.prototype.block = function (items) {
        var scope = { objects: [], counter: null, error: null };
        this.scopes.push(scope);
        var statements;
        try {
            statements = this.statements(items);
        } finally {
            this.scopes.pop();
        }
        if (scope.objects.length === 0)
            return statements;
        return this.guarded(scope, statements);
    };

    // try { statements } finally { destroy what was constructed }.
    Generator.prototype.guarded = function (scope, statements) {
        var self = this;
        this.fn.needsFinally = true;
        var destroy = [];
        for (var index = scope.objects.length - 1; index >= 0; --index) {
            var object = scope.objects[index];
            var test = J.bin('>', scope.counter, J.num(index));
            // The object in the return slot is the caller's once returned.
            if (object.returnSlot)
                test = J.and(test, J.not(this.returnSlotFlag()));
            destroy.push(J.if_(test, J.expr(self.destroy(object.address, object.type, object.dtor)), null));
        }
        var error = scope.error;
        return [J.expr(J.assign(scope.counter, J.num(0))), J.expr(J.assign(error, J.undef())),
                J.try_(statements, '$e', [J.expr(J.assign(error, J.id('$e'))), J.throw_(J.id('$e'))],
                       [J.if_(J.call(this.c('unwinds'), [error]), J.block(destroy), null)])];
    };

    // An object of the current scope to destroy at its end; the statement
    // that marks it constructed.
    Generator.prototype.returnSlotFlag = function () {
        if (this.fn.returnSlotFlag === undefined)
            this.fn.returnSlotFlag = this.temp();
        return this.fn.returnSlotFlag;
    };

    Generator.prototype.registerScopeObject = function (address, type, dtor, returnSlot) {
        var scope = this.scopes[this.scopes.length - 1];
        if (scope === undefined) {
            // A temporary bound to a reference outside blocks: until the end
            // of the function.
            scope = this.fn.outerScope;
        }
        if (scope.counter === null) {
            scope.counter = this.temp();
            scope.error = this.temp();
        }
        scope.objects.push({ address: address, type: type, dtor: dtor, returnSlot: !!returnSlot });
        return J.expr(J.assign(scope.counter, J.num(scope.objects.length)));
    };

    // --- Declarations

    Generator.prototype.declaration = function (node) {
        var object = node.obj;
        var self = this;
        if (object.storage === 'global' || object.storage === 'static') {
            if (object.extern)
                return [];
            var address = this.objectAddress(object);
            var local = object.storage === 'static' && !this.fn.isTop;
            var guard = local ? this.session.staticGuard(object) : null;
            var steps = [];
            if (node.init !== null) {
                var init = this.fullEffect(function () { return self.initPart(address, object.type, node.init); });
                if (!isEmpty(init) || local)
                    steps.push(J.expr(init));
            }
            if (node.dtor !== null && node.dtor !== undefined)
                steps.push(J.expr(this.registerStatic(address, object.type, node.dtor, guard)));
            if (steps.length === 0 || !local)
                return steps;
            // A static local: initialized at the first pass.
            return [J.if_(J.not(J.idx(this.constant(guard), J.num(0))),
                          J.block([J.expr(J.assign(J.idx(this.constant(guard), J.num(0)), J.bool(true)))]
                              .concat(steps)), null)];
        }
        this.placeObject(object);
        var type = object.type;
        if (X.isRef(type)) {
            var target = this.boundAddress(node.init);
            return [J.let_(object.jsName, target)];
        }
        var place = this.objectAddress(object);
        if (place === null) {
            var value = node.init === null ? this.literal(0, plainForZero(type)) : this.fullValue(function () {
                return self.value(node.init);
            });
            return [J.let_(object.jsName, value)];
        }
        var statements = [];
        if (node.init !== null) {
            var initialize = this.fullEffect(function () { return self.initPart(place, type, node.init); });
            if (!isEmpty(initialize))
                statements.push(J.expr(initialize));
        }
        if (node.dtor !== null && node.dtor !== undefined)
            statements.push(this.registerScopeObject(place, type, node.dtor, object.returnSlot));
        return statements;
    };

    // The destruction of an object with static storage when the program ends.
    Generator.prototype.registerStatic = function (address, type, dtor, guard) {
        var element = unqual(type);
        var count = 1;
        while (element.kind === 'array') {
            count *= element.length;
            element = unqual(element.of);
        }
        return J.call(this.c('atexitObject'), [address, J.num(count), J.num(element.size), this.functionTable(dtor),
                                               guard === null ? J.nul() : this.constant(guard)]);
    };

    function isEmpty(node) {
        return node === null || node.k === 'undef';
    }

    function plainForZero(type) {
        var plain = unqual(type);
        if (plain.kind === 'valist')
            return types.int;
        return plain;
    }

    // The address a reference is bound to; a temporary bound directly lives
    // as long as the reference (to the end of the scope).
    Generator.prototype.boundAddress = function (ir) {
        var self = this;
        var adjust = 0;
        var inner = ir;
        while (inner.k === 'glvadj') {
            adjust += inner.offset;
            inner = inner.operand;
        }
        if (inner.k === 'temp') {
            var type = unqual(inner.type);
            var offset = this.frameSlot(Math.max(type.size, 1), type.align);
            var slot = J.bin('+', J.id('$fp'), J.num(offset));
            var init = this.fullEffect(function () {
                return X.isScalar(type) ? self.storeAt(type, slot, self.value(inner.init), false) : self.init(slot,
                    inner.init);
            });
            var steps = [init];
            if (inner.dtor !== null && inner.dtor !== undefined)
                steps.push(this.registerScopeObject(slot, type, inner.dtor).expression);
            var target = adjust === 0 ? slot : J.bin(adjust < 0 ? '-' : '+', slot, J.num(Math.abs(adjust)));
            return J.seq(steps.concat([target]));
        }
        return this.fullValue(function () { return self.address(ir); });
    };

    Generator.prototype.forStatement = function (node) {
        var self = this;
        var scope = { objects: [], counter: null, error: null };
        this.scopes.push(scope);
        var before, condition, step, body;
        try {
            before = this.statements(node.init);
            condition = node.cond === null ? null : this.fullValue(function () { return self.test(node.cond); });
            step = node.step === null ? null : this.fullEffect(function () { return self.effect(node.step); });
            body = this.body(node.body);
        } finally {
            this.scopes.pop();
        }
        var init = null;
        var simple = before.length > 0 && before.every(function (statement) { return statement.k === 'var'; }) &&
            scope.objects.length === 0;
        if (simple) {
            init = J.vars(before.map(function (statement) { return { name: statement.name, init: statement.init }; }),
                          'let');
            before = [];
        }
        var loop = J.for_(init, condition, step, body);
        if (before.length === 0 && scope.objects.length === 0)
            return [loop];
        var statements = before.concat([J.at(loop, node.line)]);
        if (scope.objects.length > 0)
            statements = this.guarded(scope, statements);
        return [J.block(statements)];
    };

    // switch: case labels at the top level of the body.
    Generator.prototype.switchStatement = function (node) {
        var self = this;
        var type = node.opType;
        var kind = kindOf(type);
        var discriminant = this.fullValue(function () { return self.value(node.expr); });
        if (kind === 'i64' || kind === 'u64') {
            var value = this.temp();
            discriminant = J.seq([J.assign(value, discriminant),
                                  J.cond(J.bin('===', J.un('typeof', value), J.str('number')), value, J.num(NaN))]);
        }
        var items = node.body.k === 'block' ? node.body.items : [node.body];
        var cases = [];
        var current = null;
        var prelude = [];
        items.forEach(function (item) {
            if (item.k === 'case') {
                var count = T.big.toFloat(T.big.sub(item.high, item.low));
                if (count > 1024)
                    self.error(item, 'case range is too large');
                for (var offset = 0; offset <= count; ++offset) {
                    current = { test: self.literal(T.big.add(item.low, offset), type), body: [] };
                    cases.push(J.at(current, item.line));
                }
                return;
            }
            if (item.k === 'default') {
                current = { test: null, body: [] };
                cases.push(J.at(current, item.line));
                return;
            }
            var translated = self.statement(item);
            if (current === null)
                prelude = prelude.concat(translated);
            else
                current.body = current.body.concat(translated);
        });
        if (prelude.some(function (statement) { return statement.k !== 'empty' && statement.k !== 'var'; }))
            self.error(node, 'code before the first case label is not supported');
        var result = J.switch_(discriminant, cases);
        return prelude.length > 0 ? J.block(prelude.concat([result])) : result;
    };

    // return: the value is computed before the frame goes.
    Generator.prototype.returnStatement = function (node) {
        var fn = this.fn;
        var self = this;
        var restore = J.expr(J.assign(this.M('sp'), J.id('$sp0')));
        fn.restores.push(restore);
        if (node.value === null) {
            var list = [];
            if (node.effect !== undefined)
                list.push(J.expr(this.fullEffect(function () { return self.effect(node.effect); })));
            list.push(restore);
            list.push(J.ret(null));
            return list;
        }
        var returns = node.type;
        var value;
        if (node.returnSlot)
            return [J.expr(J.assign(this.returnSlotFlag(), J.bool(true))), restore, J.ret(J.id('$ret'))];
        if (X.isRef(returns)) {
            value = this.fullValue(function () { return self.address(node.value); });
        } else if (X.isRecord(unqual(returns))) {
            var copy = J.expr(this.fullEffect(function () { return self.init(J.id('$ret'), node.value); }));
            return [copy, restore, J.ret(J.id('$ret'))];
        } else {
            value = this.fullValue(function () { return self.value(node.value); });
        }
        var result = J.id('$result');
        var assign = J.expr(J.assign(result, value));
        var ret = J.ret(result);
        fn.returns_.push({ assign: assign, ret: ret, value: value });
        return [assign, restore, ret];
    };

    // --- Exceptions

    Generator.prototype.tryStatement = function (node) {
        this.fn.needsFinally = true;
        var savedStack = this.temp();
        var record = this.temp();
        var body = this.block(node.body.items);
        var chain = J.throw_(J.id('$e'));
        for (var index = node.handlers.length - 1; index >= 0; --index) {
            var handler = node.handlers[index];
            var handlerBody = this.handlerBody(handler, record);
            var guardedBody = J.try_(handlerBody, null, null, [J.expr(J.call(this.c('endCatch'), [record]))]);
            if (handler.all) {
                chain = J.block([guardedBody]);
                continue;
            }
            var rtti = this.session.rtti(unqual(X.removeRef(handler.type)));
            chain = J.if_(J.call(this.c('matches'), [record, this.constant(rtti)]), J.block([guardedBody]), chain);
        }
        var handlerBlock = [J.expr(J.assign(this.M('sp'), savedStack)),
                            J.expr(J.assign(record, J.call(this.c('caught'), [J.id('$e')]))), chain];
        return J.block([J.expr(J.assign(savedStack, this.M('sp'))),
                        J.try_(body, '$e', handlerBlock, null)]);
    };

    // The statements of a handler with its parameter bound.
    Generator.prototype.handlerBody = function (handler, record) {
        var scope = { objects: [], counter: null, error: null };
        this.scopes.push(scope);
        var statements = [];
        try {
            if (handler.obj !== null) {
                var object = handler.obj;
                var type = object.type;
                var caughtType = unqual(X.removeRef(type));
                var rtti = this.session.rtti(caughtType);
                var address = J.call(this.c('adjust'), [record, this.constant(rtti)]);
                if (X.isRef(type)) {
                    object.placed = true;
                    statements.push(J.let_(object.jsName, address));
                } else if (caughtType.isClass) {
                    this.placeObject(object);
                    var place = this.objectAddress(object);
                    var ctor = handler.copy;
                    statements.push(J.expr(this.callFunction(ctor, [place, address])));
                    var dtor = caughtType.dtor;
                    if (dtor !== null && !(dtor.implicit && dtor.trivial))
                        statements.push(this.registerScopeObject(place, caughtType, dtor));
                } else {
                    this.placeObject(object);
                    var valuePlace = this.objectAddress(object);
                    var loaded = this.loadAt(caughtType, address, true);
                    if (valuePlace === null)
                        statements.push(J.let_(object.jsName, loaded));
                    else
                        statements.push(J.expr(this.storeAt(caughtType, valuePlace, loaded, false)));
                }
            }
            statements = statements.concat(this.statements(handler.body.items));
        } finally {
            this.scopes.pop();
        }
        if (scope.objects.length > 0)
            return this.guarded(scope, statements);
        return statements;
    };

    Generator.prototype.throwExpression = function (ir) {
        if (ir.operand === null)
            return J.call(this.c('rethrow'), []);
        var type = unqual(ir.excType);
        var storage = this.temp();
        var steps = [J.assign(storage, J.call(this.M('malloc'), [J.num(Math.max(type.size, 1))]))];
        steps.push(this.initPart(storage, type, ir.operand));
        var dtor = ir.dtor !== null && ir.dtor !== undefined ? this.functionTable(ir.dtor) : J.nul();
        steps.push(J.call(this.c('throwException'), [storage, this.constant(this.session.rtti(type)), dtor]));
        return J.seq(steps);
    };

    // --- new and delete

    Generator.prototype.newExpression = function (ir) {
        var type = unqual(ir.allocType);
        var pointer = this.temp();
        if (ir.count !== null) {
            var count = this.temp();
            var element = type;
            var cookie = ir.cookie ? 8 : 0;
            var steps = [J.assign(count, this.convertValue(this.value(ir.count), ir.count.type, types.int)),
                         J.call(this.c('checkArraySize'), [count]),
                         J.assign(pointer,
                                  J.call(this.c('allocate'), [J.bin('+', J.bin('*', count, J.num(element.size)),
                                                                                J.num(cookie))]))];
            if (ir.cookie) {
                steps.push(J.call(this.M('store64'), [pointer, count]));
                steps.push(J.assign(pointer, J.bin('+', pointer, J.num(8))));
            }
            if (ir.items !== null && ir.items.length > 0) {
                var self = this;
                ir.items.forEach(function (item, index) {
                    steps.push(self.initPart(J.bin('+', pointer, J.num(index * element.size)), element, item));
                });
            }
            if (ir.elementInit !== null) {
                var probe = this.temp();
                var init = this.init(probe, ir.elementInit);
                var start = ir.items !== null ? ir.items.length : 0;
                if (!isEmpty(init))
                    steps.push(J.call(this.c('each'), [J.bin('+', pointer, J.num(start * element.size)),
                                                       J.bin('-', count, J.num(start)), J.num(element.size),
                                                       J.fn(null, [probe.name], [J.ret(init)])]));
            } else if (ir.zero) {
                // The elements after the initializers are zero.
                var filled = ir.items !== null ? ir.items.length : 0;
                steps.push(J.call(this.M('fill'), [J.bin('+', pointer, J.num(filled * element.size)), J.num(0),
                                                   J.bin('*', J.bin('-', count, J.num(filled)), J.num(element.size))]));
            }
            steps.push(pointer);
            return J.seq(steps);
        }
        var allocation = ir.placement !== null ? this.value(ir.placement)
                                               : J.call(this.c('allocate'), [J.num(Math.max(type.size, 1))]);
        var result = [J.assign(pointer, allocation)];
        if (ir.init !== null) {
            var initialize = this.initPart(pointer, type, ir.init);
            if (!isEmpty(initialize))
                result.push(initialize);
        }
        result.push(pointer);
        return J.seq(result);
    };

    Generator.prototype.deleteExpression = function (ir) {
        var pointer = this.temp();
        var value = J.assign(pointer, this.value(ir.operand));
        if (ir.array) {
            return J.call(this.c('deleteArray'), [value, ir.cookie ? J.num(unqual(ir.elemType).size) : J.num(0),
                                                  ir.dtor !== null ? this.functionTable(ir.dtor) : J.nul()]);
        }
        if (ir.dtor === null)
            return J.call(this.c('free'), [value]);
        if (ir.virtual) {
            var cls = unqual(ir.elemType);
            var root = cls.dtor.root || cls.dtor;
            var slot = cls.slots.indexOf(root);
            return J.call(this.c('deleteVirtual'), [value, J.num(slot)]);
        }
        return J.and(J.bin('!==', value, J.num(0)), J.seq([this.callFunction(ir.dtor, [pointer]),
                                                           J.call(this.c('free'), [pointer])]));
    };

    // --- RTTI

    Generator.prototype.typeidAddress = function (ir) {
        if (ir.object !== undefined && ir.object !== null) {
            return J.call(this.c('typeInfoOf'), [this.address(ir.object)]);
        }
        return J.num(this.session.typeInfoAddress(this.session.rtti(ir.target)));
    };

    Generator.prototype.dynamicCastValue = function (ir) {
        var source = ir.reference ? this.address(ir.operand) : this.value(ir.operand);
        if (ir.toVoid)
            return J.call(this.c('mostDerived'), [source]);
        var call = J.call(this.c('dynamicCast'), [source, this.constant(this.session.rtti(ir.target))]);
        if (ir.reference)
            return J.call(this.c('dynamicCastReference'), [call, ir.badCast !== null ? this.functionTable(ir.badCast)
                                                                                     : J.nul()]);
        return call;
    };

    // --- Functions

    // The JavaScript function of a C++ function.
    Generator.prototype.functionCode = function (func) {
        var self = this;
        var saved = this.fn;
        var savedScopes = this.scopes;
        var context = func.context;
        this.scopes = [];
        this.fn = { info: context, scope: new T.FunctionScope('$t'), frameSize: 0, async: !!func.async,
                    returns: func.type.returns, restores: [], returns_: [], usesStack: false, isTop: false, preInit: [],
                    needsFinally: false, outerScope: { objects: [], counter: null, error: null } };
        try {
            if (context !== null && context !== undefined)
                context.locals.forEach(function (object) {
                    object.placed = false;
                    object.frameOffset = undefined;
                    object.indirect = false;
                });
            var jsParams = [];
            var prologue = [];
            var returns = func.type.returns;
            if (!X.isRef(returns) && X.isRecord(unqual(returns)))
                jsParams.push('$ret');
            if (func.isMember && !func.isStatic)
                jsParams.push('$this');
            var params = context !== null && context !== undefined ? context.params || [] : [];
            func.type.params.forEach(function (paramType, index) {
                var object = params[index];
                if (object === null || object === undefined) {
                    jsParams.push('$p' + index);
                    return;
                }
                jsParams.push(object.jsName);
                if (!X.isRef(paramType) && X.isRecord(unqual(paramType))) {
                    object.indirect = true;
                    object.placed = true;
                    return;
                }
                self.placeObject(object);
                var place = self.objectAddress(object);
                if (place !== null)
                    prologue.push(J.expr(self.storeAt(object.type, place, J.id(object.jsName), false)));
            });
            if (func.type.variadic)
                jsParams.push('$va');
            var statements = this.functionStatements(func, context);
            var body = this.frame(prologue.concat(statements), returns);
            return J.fn(T.jsName(func.name.replace(/[^A-Za-z0-9_$]/g, '_')), jsParams, body, !!func.async);
        } finally {
            this.fn = saved;
            this.scopes = savedScopes;
        }
    };

    // The frame of a function around its statements.
    Generator.prototype.frame = function (statements, returns) {
        var fn = this.fn;
        if (fn.outerScope.objects.length > 0)
            statements = this.guarded(fn.outerScope, statements);
        var hasFrame = fn.frameSize > 0 || fn.usesStack;
        var declarations = fn.scope.declarations();
        var tail = [];
        if (hasFrame && fn.needsFinally) {
            fn.restores.forEach(function (restore) { restore.k = 'empty'; });
            fn.returns_.forEach(function (item) {
                item.assign.k = 'empty';
                item.ret.value = item.value;
            });
            declarations.push(J.vars([{ name: '$sp0', init: this.M('sp') },
                                      { name: '$fp', init: J.call(this.M('enter'), [J.num(fn.frameSize)]) }], 'var'));
            var guarded = J.try_(statements.concat(this.defaultReturn(returns)), null, null,
                                 [J.expr(J.assign(this.M('sp'), J.id('$sp0')))]);
            return declarations.concat([guarded]);
        }
        if (hasFrame) {
            if (fn.returns_.length > 0)
                declarations.push(J.vars([{ name: '$result', init: null }], 'var'));
            declarations.push(J.vars([{ name: '$sp0', init: this.M('sp') },
                                      { name: '$fp', init: J.call(this.M('enter'), [J.num(fn.frameSize)]) }], 'var'));
            tail.push(J.expr(J.assign(this.M('sp'), J.id('$sp0'))));
        } else {
            fn.restores.forEach(function (restore) { restore.k = 'empty'; });
            fn.returns_.forEach(function (item) {
                item.assign.k = 'empty';
                item.ret.value = item.value;
            });
        }
        return declarations.concat(statements, tail, this.defaultReturn(returns));
    };

    Generator.prototype.defaultReturn = function (returns) {
        if (returns === undefined || unqual(returns).kind === 'void' || this.fn.isTop)
            return [];
        if (X.isRef(returns))
            return [J.ret(J.num(0))];
        if (X.isRecord(unqual(returns)))
            return [J.ret(J.id('$ret'))];
        return [J.ret(this.literal(0, plainForZero(returns)))];
    };

    // The statements of a function by its kind.
    Generator.prototype.functionStatements = function (func, context) {
        if (func.lambdaTarget !== undefined)
            return this.invokerStatements(func);
        if (func.inheritedFrom !== undefined && (context === null || context === undefined))
            return this.inheritedStatements(func);
        if (func.implicit) {
            switch (func.implicitKind) {
            case 'default':
            case 'copy':
            case 'move':
                return this.constructorStatements(func, context, []);
            case 'copyassign':
            case 'moveassign':
                return this.assignmentStatements(func, context);
            case 'dtor':
                return this.destructorStatements(func, context, []);
            }
        }
        var body = func.body;
        if (func.isCtor)
            return this.constructorStatements(func, context, body.items);
        if (func.isDtor)
            return this.destructorStatements(func, context, body.items);
        return this.block(body.items);
    };

    // A constructor: bases, the vtable pointers, fields, the body. Parts
    // constructed before an exception are destroyed.
    Generator.prototype.constructorStatements = function (func, context, items) {
        var self = this;
        var cls = func.owner;
        var inits = context.memberInits;
        var statements = [];
        if (inits.delegate !== null) {
            statements.push(J.expr(this.fullEffect(function () { return self.init(J.id('$this'), inits.delegate); })));
            return statements.concat(this.block(items));
        }
        var scope = { objects: [], counter: null, error: null };
        this.scopes.push(scope);
        try {
            inits.bases.forEach(function (entry) {
                if (entry.init === null)
                    return;
                var address = self.offsetAddress(J.id('$this'), entry.base.offset);
                var init = self.fullEffect(function () { return self.init(address, entry.init); });
                if (!isEmpty(init))
                    statements.push(J.expr(init));
                var dtor = self.partDtor(context, entry.base.type);
                if (dtor !== null)
                    statements.push(self.registerScopeObject(address, entry.base.type, dtor));
            });
            if (cls.polymorphic)
                statements.push(J.expr(this.setVtables(cls, J.id('$this'))));
            inits.fields.forEach(function (entry) {
                var field = entry.field;
                var offset = entry.anonymous ? field.viaAnonymous.offset + field.inner.offset : field.offset;
                var address = self.offsetAddress(J.id('$this'), offset);
                if (field.bits !== null && field.bits !== undefined && entry.init !== null) {
                    statements.push(J.expr(self.fullEffect(function () {
                        return self.storeBitfield({ bitfield: field }, J.bin('+', J.id('$this'), J.num(field.offset)),
                                                  self.value(entry.init));
                    })));
                    return;
                }
                var init = self.fullEffect(function () { return self.initPart(address, field.type, entry.init); });
                if (!isEmpty(init))
                    statements.push(J.expr(init));
                var dtor = X.isRef(field.type) ? null : self.partDtor(context, field.type);
                if (dtor !== null)
                    statements.push(self.registerScopeObject(address, field.type, dtor));
            });
        } finally {
            this.scopes.pop();
        }
        var body = this.block(items);
        if (scope.objects.length === 0)
            return statements.concat(body);
        // The parts stay constructed when the constructor ends normally.
        var all = statements.concat(body, [J.expr(J.assign(scope.counter, J.num(0)))]);
        return this.guarded(scope, all);
    };

    // The destructor of a part found in the context of the constructor.
    Generator.prototype.partDtor = function (context, type) {
        var parts = context.partDtors || [];
        var plain = unqual(type);
        for (var index = 0; index < parts.length; ++index) {
            if (parts[index].type === plain || unqual(parts[index].type) === plain)
                return parts[index].dtor;
        }
        return null;
    };

    // A destructor: the vtable pointers of its class, the body, then the
    // fields and bases.
    Generator.prototype.destructorStatements = function (func, context, items) {
        var self = this;
        var cls = func.owner;
        var statements = [];
        if (cls.polymorphic)
            statements.push(J.expr(this.setVtables(cls, J.id('$this'))));
        var parts = (context.partDtors || []).map(function (part) {
            return J.expr(self.destroy(self.offsetAddress(J.id('$this'), part.offset), part.type, part.dtor));
        });
        var body = this.block(items);
        if (parts.length === 0)
            return statements.concat(body);
        if (items.length === 0)
            return statements.concat(parts);
        this.fn.needsFinally = true;
        return statements.concat([J.try_(body, null, null, parts)]);
    };

    Generator.prototype.assignmentStatements = function (func, context) {
        var self = this;
        var statements = context.assignSteps.map(function (step) {
            return J.expr(self.fullEffect(function () { return self.effect(step); }));
        });
        statements.push(J.ret(J.id('$this')));
        return statements;
    };

    // A constructor inherited with using Base::Base: the base constructor,
    // then the fields of the class by default.
    Generator.prototype.inheritedStatements = function (func) {
        var cls = func.owner;
        var base = cls.inheritedCtors;
        var offset = X.baseOffset(cls, base);
        var args = func.type.params.map(function (param, index) { return J.id('$p' + index); });
        var statements = [J.expr(this.callFunction(func.inheritedFrom,
                                                   [this.offsetAddress(J.id('$this'), offset)].concat(args)))];
        if (cls.polymorphic)
            statements.push(J.expr(this.setVtables(cls, J.id('$this'))));
        var self = this;
        (func.fieldInits || []).forEach(function (entry) {
            var init = self.fullEffect(function () {
                return self.initPart(self.offsetAddress(J.id('$this'), entry.field.offset), entry.field.type,
                                     entry.init);
            });
            if (!isEmpty(init))
                statements.push(J.expr(init));
        });
        return statements;
    };

    // The function pointer of a lambda without captures calls operator().
    Generator.prototype.invokerStatements = function (func) {
        var target = func.lambdaTarget;
        var args = func.type.params.map(function (param, index) { return J.id('$p' + index); });
        var returns = target.type.returns;
        var head = !X.isRef(returns) && X.isRecord(unqual(returns)) ? [J.id('$ret')] : [];
        return [J.ret(this.callFunction(target, head.concat([J.num(0)], args)))];
    };

    // this adjusted before a call: a function in a vtable of a base that is
    // not at offset 0.
    Generator.prototype.thunkCode = function (func, delta) {
        var params = [];
        var returns = func.type.returns;
        var structResult = !X.isRef(returns) && X.isRecord(unqual(returns));
        if (structResult)
            params.push('$ret');
        params.push('$this');
        func.type.params.forEach(function (param, index) { params.push('$p' + index); });
        if (func.type.variadic)
            params.push('$va');
        var args = params.map(function (name) {
            return name === '$this' ? J.bin('-', J.id('$this'), J.num(delta)) : J.id(name);
        });
        var saved = this.fn;
        this.fn = { async: false, scope: new T.FunctionScope('$t') };
        var call = J.call(this.F(func), args);
        this.fn = saved;
        return J.fn('thunk', params, [J.ret(call)], false);
    };

    // --- A unit

    Generator.prototype.unit = function (unit) {
        var self = this;
        var body = [];
        this.asyncPossible = this.session.asyncPossible;
        unit.functions.forEach(function (func) {
            var fn = self.functionCode(func);
            var index = self.session.functionIndex(func);
            var place = func.lazy !== null && func.lazy !== undefined ? func.lazy.tokens[func.lazy.start] : null;
            body.push(self.at(place, J.expr(J.call(self.M('define'), [J.num(index), fn]))));
        });
        // Thunks made while the functions were translated.
        this.session.takeThunks().forEach(function (thunk) {
            body.push(J.expr(J.call(self.M('define'), [J.num(thunk.index), self.thunkCode(thunk.func, thunk.delta)])));
        });
        this.valueStatement = unit.valueStatement;
        var top = unit.topContext;
        this.fn = { info: top, scope: new T.FunctionScope('$t'), frameSize: 0, async: !!top.async, returns: types.void,
                    restores: [], returns_: [], usesStack: false, isTop: true, preInit: [], needsFinally: false,
                    outerScope: { objects: [], counter: null, error: null } };
        top.locals.forEach(function (object) {
            object.placed = false;
            object.frameOffset = undefined;
        });
        var statements = this.block(unit.body);
        if (unit.valueStatement !== null)
            statements.unshift(J.let_('$value', J.undef()));
        if (unit.main !== null) {
            var mainCall = this.callFunction(unit.main, unit.main.type.params.length >= 2
                ? [J.num(1), J.num(this.session.argv())] : []);
            statements.push(J.let_('$code', mainCall));
            statements.push(J.if_(J.and(J.bin('!==', J.id('$code'), J.num(0)), J.bin('!==', J.id('$code'), J.undef())),
                                  J.throw_(J.new_(this.c('CExit'), [J.id('$code')])), null));
        }
        if (unit.valueStatement !== null)
            statements.push(J.ret(J.id('$value')));
        var topBody = this.frame(statements, types.void);
        var topFn = J.fn('$block', [], topBody, !!top.async);
        // Thunks made by the body.
        this.session.takeThunks().forEach(function (thunk) {
            body.push(J.expr(J.call(self.M('define'), [J.num(thunk.index), self.thunkCode(thunk.func, thunk.delta)])));
        });
        body.push(J.ret(topFn));
        return body;
    };

    // The value of the unit: shown to JavaScript.
    Generator.prototype.shownValue = function (ir) {
        var self = this;
        var type = unqual(ir.type);
        var value;
        if (X.isRecord(type) || type.kind === 'array')
            value = this.fullValue(function () { return self.address(ir); });
        else
            value = this.fullValue(function () { return self.value(ir); });
        return J.assign(J.id('$value'), J.call(this.c('show'), [this.constant(type), value]));
    };

    void C;
})(globalThis);
