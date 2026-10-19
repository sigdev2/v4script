// C: translation of calls, statements, functions and a whole unit.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var C = T.c;
    var Generator = C.Generator;
    if (Generator.prototype.call)
        return;

    var J = T.J;
    var big = T.big;
    var types = C.types;
    var kindOf = C.kindOf;

    // --- Calls

    Generator.prototype.call = function (node) {
        var self = this;
        var signature = node.signature;
        var args = [];
        var returns = signature.returns;
        // A struct result: a place in the frame of the caller, its address goes first.
        if (C.isRecord(returns)) {
            var slot = this.frameSlot(returns.size, returns.align);
            args.push(J.bin('+', J.id('$fp'), J.num(slot)));
        }
        var params = signature.params;
        var extras = { v: [], t: [] };
        node.args.forEach(function (arg, index) {
            var type = node.argTypes[index];
            if (index < params.length && !signature.unspecified) {
                args.push(self.valueAs(arg, type));
                return;
            }
            if (C.isRecord(type))
                self.error(arg, 'passing a structure as a variadic argument is not supported');
            var value = self.valueAs(arg, type);
            if (signature.unspecified) {
                args.push(value);
                return;
            }
            extras.v.push(value);
            extras.t.push(J.str(C.argumentTag(type, arg.type)));
        });
        if (signature.variadic)
            args.push(J.obj([['v', J.arr(extras.v)], ['t', J.arr(extras.t)]]));
        // A generator function (it waits in sleep) is called with yield*
        // from a generator; from a plain function - its plain variant ($F).
        var generator;
        var callee;
        if (node.direct !== undefined) {
            generator = node.direct.async && this.fn.async;
            callee = J.idx(J.id(generator ? '$G' : '$F'), J.num(node.direct.index));
        } else {
            generator = this.fn.async && this.asyncPossible;
            callee = J.call(this.M(generator ? 'callableAsync' : 'callable'), [this.rvalue(node.fn)]);
        }
        var call = J.call(callee, args);
        return generator ? J.yield_(call, true) : call;
    };

    // --- Statements

    Generator.prototype.statements = function (items) {
        var result = [];
        for (var index = 0; index < items.length; ++index)
            result = result.concat(this.statement(items[index]));
        return result;
    };

    Generator.prototype.at = function (node, statement) {
        return J.at(statement, node.line, node.file && node.file !== this.checker.source ? this.sourceOf(node.file) : undefined);
    };

    // The source of a line for the map: a file - its name, a header - the library.
    Generator.prototype.sourceOf = function (file) {
        if (file === '')
            return undefined;
        return this.session.sourceName(file);
    };

    Generator.prototype.statement = function (node) {
        var self = this;
        function at(statement) {
            return self.at(node, statement);
        }
        switch (node.k) {
        case 'decl':
            return this.declaration(node);
        case 'staticassert':
            return [];
        case 'block':
            return [at(J.block(this.statements(node.items)))];
        case 'exprstmt':
            if (this.valueStatement === node)
                return [at(J.expr(J.assign(J.id('$value'), J.call(J.mem(J.id('$c'), 'show'),
                                                                   [this.constant(this.shownType(node.expr)), this.rvalue(node.expr)]))))];
            return [at(J.expr(this.effect(node.expr)))];
        case 'if':
            return [at(J.if_(this.cond(node.cond), this.body(node.then), node.otherwise === null ? null : this.body(node.otherwise)))];
        case 'while':
            return [at(J.while_(this.cond(node.cond), this.body(node.body)))];
        case 'do':
            return [at(J.doWhile(this.body(node.body), this.cond(node.cond)))];
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
        case 'label':
            return this.statement(node.stmt);
        case 'empty':
            return [];
        }
        this.error(node, 'cannot translate statement');
    };

    Generator.prototype.shownType = function (expr) {
        var type = expr.type;
        if (type.kind === 'array' && (type.length === null || type.length < 0))
            return C.pointer(type.of);
        if (type.kind === 'function')
            return C.pointer(type);
        return type;
    };

    Generator.prototype.body = function (node) {
        var list = this.statement(node);
        return list.length === 1 && list[0].k === 'block' ? list[0] : J.block(list);
    };

    Generator.prototype.declaration = function (node) {
        var self = this;
        var result = [];
        node.declarators.forEach(function (item, index) {
            var object = node.objects[index];
            if (object === null || object === undefined)
                return;
            var declarator = item.declarator;
            var at = function (statement) { return self.at(declarator, statement); };
            if (object.storage === 'global' || object.storage === 'static') {
                if (object.extern && item.init === null)
                    return;
                var address = self.addressOfObject(object);
                var init = item.init === null ? null : self.initialize(address, object.type, item.init);
                if (object.storage === 'static') {
                    // A static local - once, when loading.
                    self.staticInits.push(at(J.expr(init !== null ? init : J.call(self.M('fill'), [address, J.num(0), J.num(object.type.size)]))));
                    return;
                }
                result.push(at(J.expr(init !== null ? init
                                                    : J.call(self.M('fill'), [address, J.num(0), J.num(object.type.size)]))));
                return;
            }
            self.placeLocal(object);
            if (object.vlaAddress) {
                var lengthName = object.jsName + '$length';
                object.type.lengthVariable = lengthName;
                result.push(at(J.let_(lengthName, self.vlaLength(object.type))));
                var size = J.bin('*', J.id(lengthName), J.num(object.type.of.size));
                result.push(at(J.let_(object.jsName, J.call(self.M('enter'), [size]))));
                self.fn.usesStack = true;
                return;
            }
            var place = self.addressOfObject(object);
            if (place === null) {
                var value = item.init === null ? (object.type.kind === 'valist' ? J.nul() : self.literal(0, object.type))
                                               : (item.init.k === 'initlist'
                                                  ? self.valueAs(item.init.items.length > 0 ? item.init.items[0].value : { k: 'int', text: '0', value: 0, type: types.int }, object.type)
                                                  : self.valueAs(item.init, object.type));
                result.push(at(J.let_(object.jsName, value)));
                return;
            }
            if (item.init !== null)
                result.push(at(J.expr(self.initialize(place, object.type, item.init))));
        });
        return result;
    };

    Generator.prototype.forStatement = function (node) {
        var before = [];
        var init = null;
        if (node.init !== null) {
            if (node.init.k === 'decl') {
                var declarations = this.declaration(node.init);
                var simple = declarations.every(function (statement) { return statement.k === 'var'; });
                if (simple && declarations.length > 0)
                    init = J.vars(declarations.map(function (statement) { return { name: statement.name, init: statement.init }; }), 'let');
                else
                    before = declarations;
            } else {
                init = this.effect(node.init.expr);
            }
        }
        var condition = node.cond === null ? null : this.cond(node.cond);
        var step = node.step === null ? null : this.effect(node.step);
        var loop = J.for_(init, condition, step, this.body(node.body));
        if (before.length === 0)
            return [loop];
        return [J.block(before.concat([J.at(loop, node.line)]))];
    };

    // switch: the case labels are at the top level of the body (as in
    // ordinary code); consecutive cases fall through in JavaScript.
    Generator.prototype.switchStatement = function (node) {
        var self = this;
        var type = node.opType;
        var kind = kindOf(type);
        var discriminant = this.valueAs(node.expr, type);
        if (kind === 'i64' || kind === 'u64') {
            var value = this.temp();
            discriminant = J.seq([J.assign(value, discriminant),
                                  J.cond(J.bin('===', J.un('typeof', value), J.str('number')), value, J.num(NaN))]);
        }
        var items = node.body.k === 'block' ? node.body.items : [node.body];
        var cases = [];
        var current = null;
        var prelude = [];
        function addLabel(label) {
            if (label.k === 'default') {
                current = { test: null, body: [] };
                cases.push(J.at(current, label.line));
                return label.stmt;
            }
            var low = label.caseValue, high = label.caseHigh;
            var count = big.toFloat(big.sub(high, low));
            if (count > 1024)
                self.error(label, 'case range is too large');
            for (var offset = 0; offset <= count; ++offset) {
                var caseValue = big.add(low, offset);
                if (big.cmp(caseValue, -9007199254740991) < 0 || big.cmp(caseValue, 9007199254740991) > 0)
                    self.error(label, 'case value is too large');
                current = { test: self.literal(caseValue, type), body: [] };
                cases.push(J.at(current, label.line));
            }
            return label.stmt;
        }
        items.forEach(function (item) {
            var statement = item;
            while (statement.k === 'case' || statement.k === 'default')
                statement = addLabel(statement);
            var translated = statement.k === 'decl' ? self.declaration(statement) : self.statement(statement);
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

    // return: the value is computed before the stack is restored (it may read the frame).
    Generator.prototype.returnStatement = function (node) {
        var fn = this.fn;
        var restore = J.expr(J.assign(this.M('sp'), J.id('$sp0')));
        fn.restores.push(restore);
        if (node.expr === null || fn.returns.kind === 'void') {
            var list = [];
            if (node.expr !== null)
                list.push(J.expr(this.effect(node.expr)));
            list.push(restore);
            list.push(J.ret(fn.isTop ? J.undef() : null));
            return list;
        }
        if (C.isRecord(fn.returns)) {
            var copy = J.expr(J.call(this.M('copy'), [J.id('$ret'), this.rvalue(node.expr), J.num(fn.returns.size)]));
            return [copy, restore, J.ret(J.id('$ret'))];
        }
        var value = this.valueAs(node.expr, fn.returns);
        var result = J.id('$result');
        var assign = J.expr(J.assign(result, value));
        var ret = J.ret(result);
        fn.returns_.push({ assign: assign, ret: ret, value: value });
        return [assign, restore, ret];
    };

    // --- Functions

    Generator.prototype.functionNode = function (info, name, params, body, isTop) {
        var self = this;
        var saved = this.fn;
        var type = info.type;
        this.fn = { info: info, scope: new T.FunctionScope('$t'), frameSize: 0, async: info.async, returns: type.returns,
                    restores: [], returns_: [], usesStack: false, isTop: !!isTop, preInit: [] };
        var jsParams = [];
        var prologue = [];
        if (C.isRecord(type.returns))
            jsParams.push('$ret');
        (params || []).forEach(function (param, index) {
            if (param === null) {
                jsParams.push('$p' + index);
                return;
            }
            jsParams.push(param.jsName);
            self.placeLocal(param);
            var place = self.addressOfObject(param);
            if (place !== null)
                prologue.push(J.expr(self.store(param.type, place, J.id(param.jsName), false)));
        });
        if (type.variadic)
            jsParams.push('$va');
        var statements = this.statements(body);
        var hasFrame = this.fn.frameSize > 0 || this.fn.usesStack;
        var declarations = this.fn.scope.declarations();
        if (this.fn.returns_.length > 0)
            declarations.push(J.vars([{ name: '$result', init: null }], 'var'));
        if (hasFrame) {
            declarations.push(J.vars([{ name: '$sp0', init: this.M('sp') },
                                      { name: '$fp', init: J.call(this.M('enter'), [J.num(this.fn.frameSize)]) }], 'var'));
        } else {
            // Without a frame the stack is not touched: return is a plain return.
            this.fn.restores.forEach(function (restore) { restore.k = 'empty'; });
            this.fn.returns_.forEach(function (item) {
                item.assign.k = 'empty';
                item.ret.value = item.value;
            });
            if (this.fn.returns_.length > 0)
                declarations.pop();
        }
        var tail = [];
        if (hasFrame)
            tail.push(J.expr(J.assign(this.M('sp'), J.id('$sp0'))));
        if (type.returns.kind !== 'void' && !isTop && !C.isRecord(type.returns))
            tail.push(J.ret(this.literal(0, type.returns)));
        var fn = J.fn(name, jsParams, declarations.concat(this.fn.preInit, prologue, statements, tail), info.async);
        this.fn = saved;
        return fn;
    };

    // --- A whole unit

    Generator.prototype.unit = function (unit, top) {
        var self = this;
        this.staticInits = [];
        this.asyncPossible = this.session.asyncPossible;
        var body = [];
        unit.items.forEach(function (item) {
            if (item.k !== 'funcdef')
                return;
            var func = item.object;
            var fn = self.functionNode(item.info, T.jsName(func.name), item.info.params, item.body.items, false);
            body.push(self.at(item, J.expr(J.call(self.M('define'), [J.num(func.index), fn]))));
        });
        // The body of a unit: top-level declarations and statements, then main.
        this.valueStatement = top.valueStatement;
        var statements = [];
        unit.items.forEach(function (item) {
            if (item.k === 'funcdef')
                return;
            statements.push(item);
        });
        var topFn = this.functionNode(top.info, '$block', [], statements, true);
        if (top.valueStatement !== null)
            topFn.body.unshift(J.let_('$value', J.undef()));
        if (top.main !== null) {
            var generator = top.main.async && top.info.async;
            var mainCall = J.call(J.idx(J.id(generator ? '$G' : '$F'), J.num(top.main.index)),
                                  top.main.type.params.length >= 2 ? [J.num(1), J.num(this.session.argv())] : []);
            if (generator)
                mainCall = J.yield_(mainCall, true);
            var code = J.id('$code');
            topFn.body.push(J.let_('$code', mainCall));
            topFn.body.push(J.if_(J.and(J.bin('!==', code, J.num(0)), J.bin('!==', code, J.undef())),
                                  J.throw_(J.new_(J.mem(J.id('$c'), 'CExit'), [code])), null));
        }
        if (top.valueStatement !== null)
            topFn.body.push(J.ret(J.id('$value')));
        body = body.concat(this.staticInits);
        body.push(J.ret(topFn));
        return body;
    };
})(globalThis);
