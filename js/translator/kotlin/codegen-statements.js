// Kotlin: translation of statements and control flow - blocks with lifted
// statements, locals, local functions and classes, assignments, loops
// (counted loops for ranges, arrays, strings, iterators), labels, if,
// when and try as statements and values, jumps, lambdas and callable
// references (a function value takes and returns boxes, as
// FunctionN.invoke on the JVM), object expressions.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Kt = T.kotlin;
    var Generator = Kt.Generator;
    if (Generator.prototype.blockStatements)
        return;

    var J = T.J;

    var labelCounter = 0;

    // --- Blocks

    Generator.prototype.blockStatements = function (block) {
        var self = this;
        var out = [];
        block.statements.forEach(function (statement) {
            out = out.concat(self.statement(statement));
        });
        return out;
    };

    // One statement with the statements lifted from its expressions.
    Generator.prototype.statement = function (node) {
        var saved = this.fn.pre;
        this.fn.pre = [];
        var main = this.statementInner(node);
        var out = this.fn.pre;
        this.fn.pre = saved;
        if (main !== null) {
            if (Array.isArray(main))
                out = out.concat(main);
            else
                out.push(main);
        }
        out.forEach(function (statement) {
            if (statement.line === undefined && node.line)
                J.at(statement, node.line);
        });
        return out;
    };

    Generator.prototype.statementInner = function (node) {
        switch (node.k) {
        case 'property':
            return this.localProperty(node);
        case 'fun':
            return this.localFunction(node);
        case 'class':
            return this.localClassDefinition(node.sym);
        case 'assign':
            return this.assignmentStatement(node);
        case 'for':
            return this.forStatement(node);
        case 'while':
            return this.whileStatement(node);
        case 'dowhile':
            return this.doWhileStatement(node);
        case 'if':
            return this.ifStatement(node);
        case 'when':
            return this.whenStatement(node);
        case 'try':
            return this.tryStatement(node, null);
        case 'jump':
            return this.jumpStatement(node);
        }
        var js = this.expression(node);
        if (J.isSimple(js) && js.k !== 'id')
            return null;
        return J.at(J.expr(js), node.line);
    };

    // --- Locals

    Generator.prototype.localProperty = function (node) {
        var self = this;
        if (node.destructure !== null)
            return this.destructuringStatement(node);
        var variable = node.sym;
        variable.jsName = this.localName(variable);
        if (variable.delegated) {
            var delegate = this.expression(node.delegate);
            variable.delegateName = variable.jsName + '$delegate';
            variable.delegateGet = node.delegateGet;
            variable.delegateSet = node.delegateSet || null;
            return J.at(J.let_(variable.delegateName, delegate), node.line);
        }
        if (node.init === null)
            return J.at(J.let_(variable.jsName, this.defaultValue(variable.type)), node.line);
        var value = this.valueAs(node.init, variable.type);
        void self;
        return J.at(J.let_(variable.jsName, value), node.line);
    };

    // A local delegated property: getValue(null, property).
    Generator.prototype.localDelegateGet = function (variable) {
        var call = variable.delegateGet;
        var value = this.operatorInvocation(call, J.id(variable.delegateName), [J.nul(), this.constant(this.session.propertyObject(variable.name))]);
        return this.convert(value, this.declared(call.fn.returns), variable.type);
    };

    Generator.prototype.localDelegateSet = function (variable, value) {
        var call = variable.delegateSet;
        var param = call.fn.params[2] !== undefined ? call.fn.params[2].type : Kt.nullableAny();
        return this.operatorInvocation(call, J.id(variable.delegateName),
                                       [J.nul(), this.constant(this.session.propertyObject(variable.name)), this.convert(value, variable.type, param)]);
    };

    // val (a, b) = value
    Generator.prototype.destructuringStatement = function (node) {
        var self = this;
        var holder = this.temp();
        var out = [J.at(J.expr(J.assign(holder, this.expression(node.init))), node.line)];
        node.components.forEach(function (component) {
            var variable = component.sym;
            variable.jsName = self.localName(variable);
            if (component.call === null)
                return;
            var value = self.componentValue(component.call, holder, node.init.type, variable.type);
            out.push(J.let_(variable.jsName, value));
        });
        return out;
    };

    Generator.prototype.componentValue = function (call, holderJs, holderType, targetType) {
        var receiverNode = call.receiverNode;
        call.receiverNode = { k: 'delegateArg', type: holderType, js: holderJs, line: 0 };
        var value = this.callCode(call, { type: call.type }, false);
        call.receiverNode = receiverNode;
        return this.convert(value, call.type, targetType);
    };

    Generator.prototype.localFunction = function (node) {
        var fn = node.sym;
        var code = this.functionCode(fn, null);
        return J.at(J.let_(fn.jsName, code), node.line);
    };

    // A local class or an object expression: defined where it is declared (it captures locals).
    Generator.prototype.localClassDefinition = function (sym) {
        var self = this;
        var classes = this.collectClasses(sym, []);
        var out = [];
        classes.forEach(function (cls) {
            var name = '$c' + cls.jsId.replace(/[^A-Za-z0-9_]/g, '_');
            self.localClasses.set(cls, name);
        });
        this.orderClasses(classes).forEach(function (cls) {
            out = out.concat(self.classDefinition(cls, self.localClasses.get(cls)));
        });
        classes.forEach(function (cls) {
            out.push(J.expr(J.call(self.rt('finishClass'), [J.id(self.localClasses.get(cls))])));
        });
        classes.forEach(function (cls) {
            if (cls.kind === 'enum')
                out.push(J.expr(J.call(self.rt('initClass'), [J.id(self.localClasses.get(cls))])));
        });
        return out;
    };

    // --- Assignments

    Generator.prototype.assignmentStatement = function (node) {
        var self = this;
        if (node.dynamicIndex) {
            var parts = this.ordered([function () { return self.expression(node.target.target); },
                                      function () { return self.expression(node.target.indices[0]); },
                                      function () { return self.dynamicArgument(node.value); }]);
            return J.expr(J.call(this.kt('dynamicSet'), parts));
        }
        if (node.assignCall !== undefined && node.assignCall !== null && node.op !== '=')
            return J.at(J.expr(this.callCode(node.assignCall, { type: Kt.unitType() }, false)), node.line);
        var target = node.target;
        if (node.op === '=') {
            if (target.k === 'index')
                return J.at(J.expr(this.callCode(node.setCall, { type: Kt.unitType() }, false)), node.line);
            var assignable = this.assignTarget(target);
            var value = this.valueAs(node.value, assignable.type);
            return J.at(J.expr(assignable.write(value)), node.line);
        }
        // x op= y as x = x op y.
        var binary = node.binary;
        if (target.k === 'index') {
            var indexTarget = this.assignTarget(target);
            var current = this.temp();
            this.lift(J.expr(J.assign(current, indexTarget.read())));
            var updated = this.withLeft(binary, current, target.type, function () { return self.expression(binary); });
            var newValue = this.temp();
            this.lift(J.expr(J.assign(newValue, this.convert(updated, binary.type, target.type))));
            return J.expr(this.indexSet(node.setCall, indexTarget, newValue, node));
        }
        var assignTarget = this.assignTarget(target);
        var read = assignTarget.read();
        var result = this.withLeft(binary, read, target.type, function () { return self.expression(binary); });
        return J.at(J.expr(assignTarget.write(this.convert(result, binary.type, assignTarget.type))), node.line);
    };

    // A binary operation whose left operand is a given JavaScript value.
    Generator.prototype.withLeft = function (binary, leftJs, leftType, thunk) {
        var original = binary.left;
        binary.left = { k: 'delegateArg', type: leftType, js: leftJs, line: original.line, column: original.column };
        if (binary.call !== undefined && binary.call.receiverNode === original)
            binary.call.receiverNode = binary.left;
        var result = thunk();
        if (binary.call !== undefined && binary.call.receiverNode === binary.left)
            binary.call.receiverNode = original;
        binary.left = original;
        return result;
    };

    // --- Loops

    Generator.prototype.loopLabel = function (node) {
        if (node.jsLabel === undefined)
            node.jsLabel = '$l' + (++labelCounter);
        return node.jsLabel;
    };

    Generator.prototype.loopBodyStatements = function (node) {
        return this.nonLocalJumps(node, this.blockStatements(node.body));
    };

    // break and continue from an inline lambda in the body (forEach { if (...) break })
    // are tokens: the body catches the ones of its loop.
    Generator.prototype.nonLocalJumps = function (node, body) {
        if (!node.nonLocalJumps)
            return body;
        var label = this.loopLabel(node);
        var error = J.id('$j' + (++labelCounter));
        var mine = function (kind) {
            return J.and(J.bin('instanceof', error, this.kt(kind)), J.bin('===', J.mem(error, 'label'), J.str(label)));
        }.bind(this);
        var next = node.continueLabel !== undefined ? J.brk(node.continueLabel) : J.cont(label);
        return [J.try_(body, error.name, [J.if_(mine('Continue'), next), J.if_(mine('Break'), J.brk(label)), J.throw_(error)], null)];
    };

    Generator.prototype.forStatement = function (node) {
        var iteration = node.iteration;
        var label = this.loopLabel(node);
        switch (iteration.kind) {
        case 'range':
            return this.countedLoop(node, label, { kind: 'range', operand: iteration.operand, from: node.iterable.left,
                                                    to: node.iterable.right, until: node.iterable.op === '..<' });
        case 'until':
            return this.countedLoop(node, label, { kind: 'range', operand: iteration.operand, from: iteration.from, to: iteration.to,
                                                    until: true });
        case 'downTo':
            return this.countedLoop(node, label, { kind: 'down', operand: iteration.operand, from: iteration.from, to: iteration.to });
        case 'step': {
            var inner = iteration.inner;
            var shape = inner.kind === 'downTo'
                ? { kind: 'down', operand: iteration.operand, from: inner.from, to: inner.to, step: iteration.step }
                : { kind: 'range', operand: iteration.operand, from: inner.from, to: inner.to, until: inner.kind === 'until' || inner.op === '..<',
                    step: iteration.step };
            return this.countedLoop(node, label, shape);
        }
        case 'array':
            return this.arrayLoop(node, label, false);
        case 'string':
            return this.arrayLoop(node, label, true);
        case 'dynamic':
            return this.dynamicLoop(node, label);
        }
        return this.iteratorLoop(node, label);
    };

    // The loop variable (or destructured components) for an element value.
    Generator.prototype.loopVariables = function (node, elementJs, elementType) {
        var self = this;
        if (node.destructure === null) {
            node.sym.jsName = this.localName(node.sym);
            return [J.let_(node.sym.jsName, this.convert(elementJs, elementType, node.sym.type))];
        }
        var holder = '$e' + (++labelCounter);
        var out = [J.let_(holder, elementJs)];
        node.components.forEach(function (component) {
            var variable = component.sym;
            variable.jsName = self.localName(variable);
            if (component.call === null)
                return;
            out.push(J.let_(variable.jsName, self.componentValue(component.call, J.id(holder), elementType, variable.type)));
        });
        return out;
    };

    // for (i in a..b), until, downTo, step: a counted loop of numbers.
    Generator.prototype.countedLoop = function (node, label, shape) {
        var self = this;
        var kind = shape.operand;
        var values = this.ordered([function () { return self.operand(shape.from, kind); },
                                   function () { return self.operand(shape.to, kind); }].concat(shape.step !== undefined ? [function () {
                                       return self.operand(shape.step, kind === 'char' ? 'i32' : kind);
                                   }] : []));
        var counter = '$i' + (++labelCounter);
        var end = '$end' + labelCounter;
        var step = shape.step !== undefined ? '$step' + labelCounter : null;
        var setup = [];
        var ctx = this.opsContext();
        var opsKindOf = kind === 'char' ? 'u16' : kind;
        if (step !== null) {
            setup.push(J.let_(step, J.call(this.kt('checkStep'), [values[2]])));
        }
        var init = [{ name: counter, init: values[0] }, { name: end, init: values[1] }];
        var test;
        var update;
        var stepValue = step !== null ? J.id(step) : J.num(1);
        if (shape.kind === 'down') {
            test = T.ops.compare(opsKindOf, '>=', J.id(counter), J.id(end), ctx);
            update = J.assign(J.id(counter), T.ops.binary(opsKindOf === 'u16' ? 'i32' : opsKindOf, '-', J.id(counter), stepValue, ctx));
        } else {
            test = T.ops.compare(opsKindOf, shape.until ? '<' : '<=', J.id(counter), J.id(end), ctx);
            update = J.assign(J.id(counter), T.ops.binary(opsKindOf === 'u16' ? 'i32' : opsKindOf, '+', J.id(counter), stepValue, ctx));
        }
        if (kind === 'i32' || kind === 'char') {
            update = shape.kind === 'down' ? J.assign(J.id(counter), J.bin('-', J.id(counter), stepValue))
                                           : J.assign(J.id(counter), J.bin('+', J.id(counter), stepValue));
        }
        var elementType = Kt.typeOfKind(kind);
        var body = this.loopVariables(node, J.id(counter), elementType).concat(this.loopBodyStatements(node));
        // A step that overshoots the end must stop (end + step may wrap for Long).
        var loop = J.for_(J.vars(init, 'let'), test, update, J.block(body));
        return setup.concat([J.label(label, loop)]);
    };

    // for (x in array), for (c in string): by index.
    Generator.prototype.arrayLoop = function (node, label, isString) {
        var array = '$a' + (++labelCounter);
        var index = '$k' + labelCounter;
        var arrayJs = this.expression(node.iterable);
        var elementType;
        var element;
        if (isString) {
            elementType = Kt.builtinType('Char');
            element = J.call(J.mem(J.id(array), 'charCodeAt'), [J.id(index)]);
        } else {
            var type = Kt.resolved(node.iterable.type);
            if (type.sym === Kt.builtins.Array)
                elementType = Kt.nullableAny();
            else
                elementType = node.sym !== undefined && node.sym !== null ? node.sym.type : Kt.nullableAny();
            if (type.sym !== Kt.builtins.Array) {
                var elementNames = { IntArray: 'Int', LongArray: 'Long', ShortArray: 'Short', ByteArray: 'Byte', DoubleArray: 'Double',
                                     FloatArray: 'Float', CharArray: 'Char', BooleanArray: 'Boolean' };
                elementType = Kt.builtinType(elementNames[type.sym.name]);
            }
            element = J.idx(J.id(array), J.id(index));
        }
        var body = this.loopVariables(node, element, elementType).concat(this.loopBodyStatements(node));
        var init = J.vars([{ name: array, init: arrayJs }, { name: index, init: J.num(0) }], 'let');
        return J.label(label, J.for_(init, J.bin('<', J.id(index), J.mem(J.id(array), 'length')), J.update('++', true, J.id(index)),
                                     J.block(body)));
    };

    // for (x in collection): iterator(), hasNext(), next().
    Generator.prototype.iteratorLoop = function (node, label) {
        var iteration = node.iteration;
        var iterator = '$it' + (++labelCounter);
        var iteratorJs = this.callCode(iteration.iterator, { type: iteration.iterator.type }, false);
        var iteratorNode = { k: 'delegateArg', type: iteration.iterator.type, js: J.id(iterator), line: node.line };
        var hasNext = this.withReceiverNode(iteration.hasNext, iteratorNode, { type: Kt.booleanType() });
        var next = this.withReceiverNode(iteration.next, iteratorNode, { type: iteration.next.type });
        var elementType = iteration.next.type;
        var body = this.loopVariables(node, next, elementType).concat(this.loopBodyStatements(node));
        return J.label(label, J.for_(J.vars([{ name: iterator, init: iteratorJs }], 'let'), hasNext, null, J.block(body)));
    };

    Generator.prototype.withReceiverNode = function (call, receiverNode, typeHolder) {
        var saved = call.receiverNode;
        call.receiverNode = receiverNode;
        var js = this.callCode(call, typeHolder, false);
        call.receiverNode = saved;
        return js;
    };

    Generator.prototype.dynamicLoop = function (node, label) {
        var array = '$a' + (++labelCounter);
        var index = '$k' + labelCounter;
        var body = this.loopVariables(node, J.call(this.kt('fromJs'), [J.idx(J.id(array), J.id(index))]), Kt.DYNAMIC)
            .concat(this.loopBodyStatements(node));
        var init = J.vars([{ name: array, init: J.call(this.kt('dynamicArray'), [this.expression(node.iterable)]) }, { name: index, init: J.num(0) }], 'let');
        return J.label(label, J.for_(init, J.bin('<', J.id(index), J.mem(J.id(array), 'length')), J.update('++', true, J.id(index)),
                                     J.block(body)));
    };

    Generator.prototype.whileStatement = function (node) {
        var label = this.loopLabel(node);
        var self = this;
        var cond = this.capture(function () { return self.valueAs(node.cond, Kt.booleanType()); });
        var body = this.loopBodyStatements(node);
        if (cond.pre.length === 0)
            return J.label(label, J.while_(cond.js, J.block(body)));
        var loopBody = cond.pre.concat([J.if_(J.not(cond.js), J.brk(label))], body);
        return J.label(label, J.while_(J.bool(true), J.block(loopBody)));
    };

    // do { body } while (cond): the condition sees the variables of the
    // body; continue goes to the condition.
    Generator.prototype.doWhileStatement = function (node) {
        var label = this.loopLabel(node);
        node.continueLabel = '$c' + (++labelCounter);
        var self = this;
        var body = this.nonLocalJumps(node, this.blockStatements(node.body));
        var cond = this.capture(function () { return self.valueAs(node.cond, Kt.booleanType()); });
        var inner = J.label(node.continueLabel, J.block(body.concat(cond.pre, [J.if_(J.not(cond.js), J.brk(label))])));
        void inner;
        // The condition goes inside the block of the body, after a block that continue leaves.
        var bodyBlock = J.label(node.continueLabel, J.block(body));
        var check = cond.pre.concat([J.if_(J.not(cond.js), J.brk(label))]);
        // Variables of the body must be seen by the condition: the body is not a separate block.
        if (this.declaresLocals(node.body))
            return J.label(label, J.while_(J.bool(true), J.block(this.flatDoWhile(node, body, check))));
        return J.label(label, J.while_(J.bool(true), J.block([bodyBlock].concat(check))));
    };

    Generator.prototype.declaresLocals = function (block) {
        return block.statements.some(function (statement) { return statement.k === 'property'; });
    };

    // do-while whose body declares variables used by the condition: continue
    // is not allowed to skip the condition, so the body stays flat.
    Generator.prototype.flatDoWhile = function (node, body, check) {
        return body.concat(check);
    };

    // --- if and when

    Generator.prototype.ifStatement = function (node) {
        var test = this.valueAs(node.cond, Kt.booleanType());
        var then = J.block(this.blockStatements(node.then));
        var otherwise = node.otherwise !== null ? J.block(this.blockStatements(node.otherwise)) : null;
        if (otherwise !== null && otherwise.body.length === 0)
            otherwise = null;
        return J.at(J.if_(test, then, otherwise), node.line);
    };

    // A block as a value: its statements, then the value of the last one.
    Generator.prototype.blockValueCode = function (block, type) {
        var self = this;
        var statements = block.statements;
        var valueNode = block.valueNode;
        if (valueNode === undefined || valueNode === null) {
            var all = this.capture(function () {
                var out = self.blockStatements(block);
                out.forEach(function (statement) { self.lift(statement); });
                return J.undef();
            });
            return { pre: all.pre, js: Kt.isJump(block.jumps ? Kt.NOTHING : Kt.unitType()) ? J.undef() : this.kt('Unit'), jumps: !!block.jumps };
        }
        var result = this.capture(function () {
            statements.forEach(function (statement) {
                if (statement === valueNode)
                    return;
                self.statement(statement).forEach(function (item) { self.lift(item); });
            });
            // A jump (throw, a call that returns Nothing) has no value: a statement.
            if (Kt.isJump(valueNode.type)) {
                self.statement(valueNode).forEach(function (item) { self.lift(item); });
                return J.undef();
            }
            return self.valueAs(valueNode, type);
        });
        return { pre: result.pre, js: result.js, jumps: Kt.isJump(valueNode.type) };
    };

    Generator.prototype.ifValue = function (node) {
        var type = node.type;
        var test = this.valueAs(node.cond, Kt.booleanType());
        var then = this.blockValueCode(node.then, type);
        var otherwise = node.otherwise !== null ? this.blockValueCode(node.otherwise, type) : { pre: [], js: this.kt('Unit'), jumps: false };
        if (then.pre.length === 0 && otherwise.pre.length === 0)
            return J.cond(test, then.js, otherwise.js);
        var temp = this.temp();
        var thenBody = then.pre.concat(then.jumps ? [] : [J.expr(J.assign(temp, then.js))]);
        var elseBody = otherwise.pre.concat(otherwise.jumps ? [] : [J.expr(J.assign(temp, otherwise.js))]);
        this.lift(J.if_(test, J.block(thenBody), J.block(elseBody)));
        return temp;
    };

    // The test of one condition of a when branch.
    Generator.prototype.whenTest = function (cond, subject, subjectType) {
        if (subject === null)
            return this.valueAs(cond.expr, Kt.booleanType());
        switch (cond.k) {
        case 'iscond':
            return this.typeTest(subject, subjectType, cond.testType, cond.negated);
        case 'incond': {
            var test;
            if (cond.intrinsic !== undefined) {
                var subjectNode = { k: 'delegateArg', type: subjectType, js: subject, line: cond.line };
                test = this.inRange(subjectNode, cond.expr, cond.intrinsic.operand);
            } else {
                var actual = cond.call.slots[0].actuals[0];
                var savedValue = actual.value;
                actual.value = { k: 'delegateArg', type: subjectType, js: subject, line: cond.line, column: cond.column };
                test = this.callCode(cond.call, { type: Kt.booleanType() }, false);
                actual.value = savedValue;
            }
            return cond.negated ? J.not(test) : test;
        }
        }
        // A value: equality with the subject.
        if (cond.expr.k === 'null')
            return J.bin('==', subject, J.nul());
        if (cond.intrinsic !== undefined && cond.intrinsic.kind === 'primEquals') {
            var value = this.expression(cond.expr);
            if (cond.intrinsic.operand === 'i64')
                return T.ops.equals('i64', false, subject, value, this.opsContext());
            return J.bin('===', subject, value);
        }
        var other = this.valueAs(cond.expr, Kt.nullableAny());
        return J.call(this.kt('eq'), [this.convert(subject, subjectType, Kt.nullableAny()), other]);
    };

    // The subject of a when in a temporary (or the variable of when (val x = ...)).
    Generator.prototype.whenSubject = function (node) {
        if (node.subject === null)
            return null;
        var value = this.expression(node.subject);
        if (node.subjectVar !== null) {
            var variable = node.subjectVar.sym;
            variable.jsName = this.localName(variable);
            this.lift(J.let_(variable.jsName, this.convert(value, node.subject.type, variable.type)));
            return J.id(variable.jsName);
        }
        if (J.isSimple(value) && value.k !== 'id')
            return value;
        var temp = this.temp();
        this.lift(J.expr(J.assign(temp, value)));
        return temp;
    };

    // The tests of a branch: conditions with ||, the guard with &&.
    Generator.prototype.branchTest = function (branch, subject, subjectType) {
        var self = this;
        var tests = branch.conds.map(function (cond) {
            return self.capture(function () { return self.whenTest(cond, subject, subjectType); });
        });
        var simple = tests.every(function (test) { return test.pre.length === 0; });
        var test;
        if (simple) {
            test = tests.reduce(function (left, right) { return left === null ? right.js : J.or(left, right.js); }, null);
        } else {
            var temp = this.temp();
            this.lift(J.expr(J.assign(temp, J.bool(false))));
            tests.forEach(function (item) {
                self.lift(J.if_(J.not(temp), J.block(item.pre.concat([J.expr(J.assign(temp, item.js))]))));
            });
            test = temp;
        }
        if (branch.guard !== null) {
            var guard = this.capture(function () { return self.valueAs(branch.guard, Kt.booleanType()); });
            if (guard.pre.length === 0)
                return J.and(test, guard.js);
            var guarded = this.temp();
            this.lift(J.expr(J.assign(guarded, test)));
            this.lift(J.if_(guarded, J.block(guard.pre.concat([J.expr(J.assign(guarded, guard.js))]))));
            return guarded;
        }
        return test;
    };

    // bodyOf(branch) - the statements of a branch (the tail of a tailrec function).
    Generator.prototype.whenStatement = function (node, bodyOf) {
        var self = this;
        var subject = this.whenSubject(node);
        var subjectType = node.subjectVar !== null && node.subjectVar !== undefined ? node.subjectVar.sym.type
                                                                                   : (node.subject !== null ? node.subject.type : null);
        // A chain of if/else if; the tests of later branches run only if earlier ones fail.
        var chain = null;
        var tail = null;
        var out = [];
        node.branches.forEach(function (branch) {
            var body = J.block(bodyOf !== undefined ? bodyOf(branch) : self.blockStatements(branch.body));
            if (branch.isElse) {
                if (tail === null)
                    out.push(body);
                else
                    tail.otherwise = body;
                return;
            }
            var test = self.capture(function () { return self.branchTest(branch, subject, subjectType); });
            if (test.pre.length > 0) {
                // A test that needs statements: nested in the else of the previous branch.
                var nested = test.pre.concat([J.if_(test.js, body, null)]);
                var ifNode = nested[nested.length - 1];
                if (tail === null)
                    out = out.concat(nested);
                else
                    tail.otherwise = J.block(nested);
                tail = ifNode;
                return;
            }
            var current = J.if_(test.js, body, null);
            if (tail === null)
                out.push(current);
            else
                tail.otherwise = current;
            tail = current;
            if (chain === null)
                chain = current;
        });
        return out;
    };

    Generator.prototype.whenValue = function (node) {
        var self = this;
        var type = node.type;
        var subject = this.whenSubject(node);
        var subjectType = node.subjectVar !== null && node.subjectVar !== undefined ? node.subjectVar.sym.type
                                                                                   : (node.subject !== null ? node.subject.type : null);
        var branches = node.branches.map(function (branch) {
            var test = branch.isElse ? null : self.capture(function () { return self.branchTest(branch, subject, subjectType); });
            return { branch: branch, test: test, value: self.blockValueCode(branch.body, type) };
        });
        var pure = branches.every(function (item) {
            return (item.test === null || item.test.pre.length === 0) && item.value.pre.length === 0;
        });
        if (pure) {
            var result = node.exhaustive && branches.length > 0 && branches[branches.length - 1].test !== null
                ? J.call(this.kt('noWhenBranch'), []) : null;
            for (var index = branches.length - 1; index >= 0; --index) {
                var item = branches[index];
                if (item.test === null)
                    result = item.value.js;
                else
                    result = J.cond(item.test.js, item.value.js, result === null ? J.call(this.kt('noWhenBranch'), []) : result);
            }
            return result === null ? this.kt('Unit') : result;
        }
        var temp = this.temp();
        var statements = [];
        var tail = null;
        branches.forEach(function (item) {
            var body = item.value.pre.concat(item.value.jumps ? [] : [J.expr(J.assign(temp, item.value.js))]);
            if (item.test === null) {
                if (tail === null)
                    statements = statements.concat(body);
                else
                    tail.otherwise = J.block(body);
                return;
            }
            var ifNode = J.if_(item.test.js, J.block(body), null);
            var nested = item.test.pre.concat([ifNode]);
            if (tail === null)
                statements = statements.concat(nested);
            else
                tail.otherwise = J.block(nested);
            tail = ifNode;
        });
        if (tail !== null && tail.otherwise === null && node.exhaustive)
            tail.otherwise = J.expr(J.call(this.kt('noWhenBranch'), []));
        statements.forEach(function (statement) { self.lift(statement); });
        return temp;
    };

    // --- try

    // try as a statement; resultTemp - where the value goes (try as an expression).
    Generator.prototype.tryStatement = function (node, resultTemp) {
        var self = this;
        var type = node.type;
        var bodyCode = resultTemp !== null ? this.blockValueCode(node.body, type) : null;
        var body = resultTemp !== null ? bodyCode.pre.concat(bodyCode.jumps ? [] : [J.expr(J.assign(resultTemp, bodyCode.js))])
                                       : this.blockStatements(node.body);
        var handler = null;
        var param = null;
        if (node.catches.length > 0) {
            param = '$ex' + (++labelCounter);
            var caught = J.id(param);
            var handlerBody = [J.if_(J.bin('instanceof', caught, this.kt('Jump')), J.throw_(caught)),
                               J.expr(J.assign(caught, J.call(this.rt('caught'), [caught])))];
            var chain = null;
            var tail = null;
            node.catches.forEach(function (clause) {
                var variable = clause.sym;
                variable.jsName = self.localName(variable);
                var clauseBody = [J.let_(variable.jsName, caught)];
                if (resultTemp !== null) {
                    var value = self.blockValueCode(clause.body, type);
                    clauseBody = clauseBody.concat(value.pre, value.jumps ? [] : [J.expr(J.assign(resultTemp, value.js))]);
                } else {
                    clauseBody = clauseBody.concat(self.blockStatements(clause.body));
                }
                var test = self.classTest(caught, Kt.makeNotNull(clause.catchType));
                var current = J.if_(test, J.block(clauseBody), null);
                if (tail === null)
                    chain = current;
                else
                    tail.otherwise = current;
                tail = current;
            });
            tail.otherwise = J.throw_(caught);
            handlerBody.push(chain);
            handler = handlerBody;
        }
        var finalizer = node.finalizer !== null ? this.blockStatements(node.finalizer) : null;
        return J.at(J.try_(body, param, handler, finalizer), node.line);
    };

    Generator.prototype.tryValue = function (node) {
        var temp = this.temp();
        this.lift(this.tryStatement(node, temp));
        return temp;
    };

    // --- Jumps

    Generator.prototype.jumpStatement = function (node) {
        var self = this;
        switch (node.kind) {
        case 'throw':
            return J.at(J.throw_(J.call(this.rt('thrown'), [this.expression(node.value)])), node.line);
        case 'return': {
            var target = node.targetFn;
            var value = null;
            if (this.fn.tailrec !== undefined && target === this.fn.tailrec.sym.context && node.value !== null && !node.nonLocal)
                return J.block(this.tailStatements(node.value, target.returns || node.value.type));
            if (node.value !== null) {
                var returns = target.returns !== null && target.returns !== undefined ? target.returns : node.value.type;
                if (target.kind === 'lambda' || (target.node !== undefined && target.node !== null && target.node.k === 'anonfun'))
                    value = this.valueAs(node.value, Kt.nullableAny());
                else if (target.sym !== null && target.sym !== undefined && target.sym.kind === 'fun')
                    value = this.convert(this.valueAs(node.value, returns), returns, this.passedReturn(target.sym));
                else
                    value = this.valueAs(node.value, returns);
                if (target.kind === 'lambda' && Kt.isClass(returns, 'Unit'))
                    value = null;
            }
            if (node.nonLocal) {
                var token = this.nonLocalToken(target);
                return J.at(J.throw_(J.new_(this.kt('Return'), [J.id(token), value !== null ? value : J.undef()])), node.line);
            }
            if (target.kind === 'lambda' && value === null && !Kt.isClass(target.returns || Kt.unitType(), 'Unit'))
                return J.at(J.ret(this.kt('Unit')), node.line);
            return J.at(value !== null ? this.returnValue(value) : J.ret(null), node.line);
        }
        case 'break':
        case 'continue': {
            var loop = node.loopTarget;
            var label = this.loopLabel(loop);
            if (node.nonLocal)
                return J.throw_(J.new_(this.kt(node.kind === 'break' ? 'Break' : 'Continue'), [J.str(label)]));
            if (node.kind === 'continue' && loop.continueLabel !== undefined)
                return J.brk(loop.continueLabel);
            return node.kind === 'break' ? J.brk(label) : J.cont(label);
        }
        }
        void self;
        return null;
    };

    // The token of non-local returns of a function (made in its context).
    Generator.prototype.nonLocalToken = function (target) {
        for (var fn = this.fn; fn !== null; fn = fn.parent) {
            if (fn.checkerContext === target) {
                if (fn.nonLocal === null)
                    fn.nonLocal = '$nl' + (++labelCounter);
                return fn.nonLocal;
            }
        }
        throw new Error('Kotlin: no target of a non-local return');
    };

    Generator.prototype.jumpValue = function (node) {
        if (node.kind === 'throw')
            return J.call(this.kt('raise'), [J.call(this.rt('thrown'), [this.expression(node.value)])]);
        this.lift(this.jumpStatement(node));
        return J.undef();
    };

    // --- Lambdas and anonymous functions

    // A function value: boxed parameters in, a boxed result out.
    Generator.prototype.lambdaValue = function (node) {
        var self = this;
        var lambda = node.lambdaInfo;
        var waits = !lambda.suspend && lambda.context !== undefined && !!lambda.context.waits;
        var fn = this.pushFunction('lambda', { checkerContext: lambda.context, generator: !!lambda.suspend || waits, fiber: waits,
                                               cls: null });
        var params = [];
        var head = [];
        if (lambda.receiver !== null && lambda.receiver !== undefined) {
            var receiverName = '$receiver' + (++labelCounter);
            lambda.receiver.jsName = '$rv' + labelCounter;
            params.push(receiverName);
            head.push(J.let_(lambda.receiver.jsName, this.convert(J.id(receiverName), Kt.nullableAny(), lambda.receiver.type)));
        }
        lambda.params.forEach(function (param) {
            var variable = param.sym;
            var boxedName = '$p' + (++labelCounter);
            variable.jsName = self.localName(variable);
            params.push(boxedName);
            head.push(J.let_(variable.jsName, self.convert(J.id(boxedName), Kt.nullableAny(), variable.type)));
            (param.components || []).forEach(function (component) {
                var componentVar = component.sym;
                componentVar.jsName = self.localName(componentVar);
                if (component.call !== null)
                    head.push(J.let_(componentVar.jsName, self.componentValue(component.call, J.id(variable.jsName), variable.type,
                                                                              componentVar.type)));
            });
        });
        var body;
        if (node.k === 'anonfun') {
            if (node.exprBody) {
                body = this.withPre(function () { return self.valueAs(node.body, Kt.nullableAny()); }, function (value) {
                    return self.returnValue(value);
                });
            } else {
                body = this.blockStatements(node.body);
            }
        } else {
            body = this.lambdaStatements(node, lambda);
        }
        this.popFunction();
        var code = this.functionCode(null, null, fn, params, head.concat(body));
        return code;
    };

    // The statements of a lambda: the last expression is the result (boxed).
    Generator.prototype.lambdaStatements = function (node, lambda) {
        var self = this;
        var statements = node.statements;
        var out = [];
        var unit = Kt.isClass(lambda.returns, 'Unit');
        statements.forEach(function (statement, index) {
            var last = index === statements.length - 1;
            if (last && statement === node.lastValue && !unit && !Kt.isJump(statement.type)) {
                var value = self.capture(function () { return self.valueAs(statement, lambda.returns); });
                out = out.concat(value.pre);
                if (!Kt.isJump(statement.type))
                    out.push(J.at(self.returnValue(self.convert(value.js, lambda.returns, Kt.nullableAny())), statement.line));
                return;
            }
            out = out.concat(self.statement(statement));
        });
        if (unit)
            out.push(J.ret(this.kt('Unit')));
        return out;
    };

    // --- Callable references

    Generator.prototype.referenceValue = function (node) {
        if (node.name === 'class')
            return this.classReferenceValue(node);
        var candidate = node.ref;
        var member = candidate.member;
        var self = this;
        var params = (candidate.params || []).map(function (param, index) { return '$a' + index; });
        var bound = null;
        if (candidate.bound !== undefined) {
            var stable = this.stable(this.expression(candidate.bound));
            if (stable.setup !== null)
                this.lift(J.expr(stable.setup));
            bound = stable.value;
        }
        var fn = this.pushFunction('lambda', { cls: null });
        var args = (candidate.params || []).map(function (param, index) {
            return self.convert(J.id(params[index]), Kt.nullableAny(), param);
        });
        var call;
        var declaredReturn = candidate.returns;
        if (member.kind === 'prop') {
            var receiverJs = candidate.unbound !== undefined ? args[0] : bound;
            var ref = { kind: 'prop', sym: member, map: candidate.map, receiver: candidate.implicit || null, explicit: receiverJs !== null };
            call = this.propertyRead(ref, receiverJs, null);
            declaredReturn = member.type;
        } else if (member.isCtor) {
            call = J.call(J.mem(J.new_(this.classRef(candidate.ctorOf), []), member.jsName), args);
            declaredReturn = Kt.anyType();
        } else {
            var receiver = null;
            var rest = args;
            if (candidate.unbound !== undefined) {
                receiver = args[0];
                rest = args.slice(1);
            } else if (bound !== null) {
                receiver = bound;
            }
            var result = { fn: member, map: candidate.map, slots: null, implicit: candidate.implicit || null, staticOf: candidate.staticOf || null,
                           receiverNode: null, type: candidate.returns, reified: [], invokeOn: null };
            var receiverType = candidate.unbound !== undefined ? candidate.params[0] : (candidate.boundType || null);
            var converted = rest.map(function (arg, index) {
                var param = member.params[index];
                return param === undefined ? arg : self.convert(arg, (candidate.params || [])[index + (candidate.unbound !== undefined ? 1 : 0)], param.type);
            });
            call = this.dispatch(result, receiver, receiverType, converted, { type: candidate.returns });
            declaredReturn = member.returns;
        }
        var value = this.convert(this.convert(call, declaredReturn, candidate.returns), candidate.returns, Kt.nullableAny());
        this.popFunction();
        return this.functionCode(null, null, fn, params, [J.ret(value)]);
    };

    Generator.prototype.classReferenceValue = function (node) {
        if (node.classOf !== undefined)
            return J.call(this.kt('kclass'), [this.classValue(node.classOf)]);
        if (node.reifiedOf !== undefined)
            return J.call(this.kt('kclassOfType'), [J.id(node.reifiedOf.jsName)]);
        return J.call(this.kt('kclassOf'), [this.valueAs(node.receiver, Kt.nullableAny())]);
    };

    // A class for KClass: the constructor, or a descriptor for builtins without one.
    Generator.prototype.classValue = function (sym) {
        if (sym.arrayDescriptor !== undefined)
            return J.str(sym.arrayDescriptor);
        if (sym === Kt.builtins.Unit)
            return J.str('kotlin.Unit');
        return this.classRef(sym);
    };

    // --- Object expressions

    Generator.prototype.objectExpressionValue = function (node) {
        var sym = node.sym;
        var self = this;
        this.localClassDefinition(sym).forEach(function (statement) { self.lift(statement); });
        var ctor = sym.ctors[0];
        return J.call(J.mem(J.new_(this.classRef(sym), []), ctor.jsName), []);
    };
})(globalThis);
