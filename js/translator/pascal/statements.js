// Pascal: statements. A routine with goto is translated into parts with
// labels and jumps (T.structure builds blocks and loops from them).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Pascal = T.pascal;
    var Compiler = Pascal.Compiler;
    if (Compiler.prototype.compileStatement)
        return;

    var J = T.J;
    var t = Pascal.t;
    var types = Pascal.types;
    var big = T.big;
    var Value = Pascal.Value;

    function at(node, source) {
        return J.at(node, source.line, source.source);
    }

    Compiler.prototype.compileStatements = function (list) {
        var self = this;
        if (!this.fn.flat && Pascal.containsJump(list))
            return this.flatten(list, list[0]);
        var result = [];
        list.forEach(function (statement) {
            self.compileStatement(statement).forEach(function (node) { result.push(node); });
        });
        return result;
    };

    // The body of a function: with goto - parts and T.structure.
    Compiler.prototype.structureBody = function (fn, statements) {
        return statements;
    };

    // A statement -> a list of JavaScript statements.
    Compiler.prototype.compileStatement = function (node) {
        if (node === null)
            return [];
        switch (node.k) {
        case 'empty':
            return [];
        case 'block':
            return this.compileStatements(node.body);
        case 'assign':
            return [at(J.expr(this.compileAssignment(node)), node)];
        case 'call':
            return this.compileCallStatement(node);
        case 'if':
            return [this.compileIf(node)];
        case 'case':
            return this.compileCase(node);
        case 'for':
            return this.compileFor(node);
        case 'forin':
            return this.compileForIn(node);
        case 'while':
            return this.compileWhile(node);
        case 'repeat':
            return this.compileRepeat(node);
        case 'with':
            return this.compileWith(node);
        case 'try':
            return [this.compileTry(node)];
        case 'raise':
            return [this.compileRaise(node)];
        case 'goto':
        case 'labeled':
            return this.flatten([node], node);
        }
        this.error('Illegal expression', node);
    };

    // --- Assignment

    Compiler.prototype.compileAssignment = function (node) {
        var target = null;
        if (node.target.k === 'name') {
            var symbol = this.lookup(node.target.name);
            if (symbol !== null && symbol.readOnly)
                this.error("Can't assign values to const variable", node.target);
            if (symbol !== null)
                target = this.resultOf(symbol);
        }
        if (target === null)
            target = this.compileExpr(node.target);
        if (target.kind !== undefined)
            this.error('Variable identifier expected', node.target);
        if (target.ref === null || target.ref === undefined)
            this.error('Variable identifier expected', node.target);
        var ref = target.ref;
        this.noteModified(ref);
        if (node.op !== ':=') {
            // a += b is a := a + b, the place is evaluated once.
            var stable = ref.stable(this);
            var current = this.refValue(stable.ref);
            var right = this.compileValue(node.value, ref.type.kind === 'int' ? ref.type : undefined);
            var op = node.op.charAt(0);
            var combined = this.binaryValues(op, current, right, node);
            return J.seq(stable.setup.concat([this.assignTo(stable.ref, combined, node)]));
        }
        var value = this.compileExpr(node.value, ref.type);
        return this.assignTo(ref, value, node.value);
    };

    // --- A call statement

    Compiler.prototype.compileCallStatement = function (node) {
        var expr = node.expr;
        var value;
        if (expr.k === 'call') {
            value = this.compileCall(expr, undefined, true);
        } else if (expr.k === 'inherited') {
            value = this.compileInherited(expr, undefined, true);
        } else {
            var target = this.compileExpr(expr);
            if (target.kind === 'routine' || target.kind === 'builtin' || target.kind === 'method')
                value = this.callTarget(target, [], expr, undefined, true);
            else if (target.kind === 'type' || target.kind === 'unit')
                this.error('Illegal expression', expr);
            else if (this.fn.kind === 'main' && this.valueStatementAllowed)
                return this.blockValueStatement(target, node);
            else if (target.type !== undefined && target.type.kind === 'proc')
                value = this.callProcValue(target, [], expr, true);
            else
                this.error('Illegal expression', expr);
        }
        if (value.exit)
            return [at(this.exitStatement(value), node)];
        if (value.loopJump !== undefined)
            return [at(this.loopJump(value.loopJump, node), node)];
        if (value.emptyInherited)
            return [];
        if (this.fn.kind === 'main' && this.valueStatementAllowed && value.type !== t.void && value.type !== undefined)
            return this.blockValueStatement(value, node);
        return [at(J.expr(value.node), node)];
    };

    // The last expression of a unit is its value.
    Compiler.prototype.blockValueStatement = function (value, node) {
        value = this.toValue(value, node.expr);
        if (value.type.kind === 'void')
            return [at(J.expr(value.node), node)];
        this.blockValueType = value.type;
        return [at(J.expr(J.assign(J.id('$value'), this.rt('show', [value.node, this.typeRef(value.type)]))), node)];
    };

    Compiler.prototype.exitStatement = function (value) {
        var fn = this.fn;
        if (fn.kind === 'main')
            return J.ret(fn.async ? null : null);
        if (fn.resultVar === null)
            return J.ret();
        if (value.exitValue !== undefined) {
            var ref = this.localRef(fn.resultVar);
            var assignment = this.assignTo(ref, value.exitValue, value.node);
            return J.block([J.expr(assignment), J.ret(this.localNode(fn.resultVar))]);
        }
        return J.ret(this.localNode(fn.resultVar));
    };

    // Break and Continue: to the label of their loop.
    Compiler.prototype.loopJump = function (kind, node) {
        var loops = this.fn.loops;
        if (loops.length === 0)
            this.error(kind === 'break' ? 'BREAK not allowed' : 'CONTINUE not allowed', node);
        var loop = loops[loops.length - 1];
        if (loop.flat) {
            if (!this.fn.flat)
                this.error('Break and Continue inside try in a loop with goto labels are not supported', node);
            this.flatItems.push({ k: 'goto', id: kind === 'break' ? loop.breakId : loop.continueId, test: null,
                                  line: node.line, source: node.source });
            return J.empty();
        }
        loop.used = true;
        return kind === 'break' ? J.brk(loop.label) : J.cont(loop.label);
    };

    Compiler.prototype.enterLoop = function () {
        var loop = { label: '$L' + (++this.labelCounter), used: false, flat: false };
        this.fn.loops.push(loop);
        return loop;
    };

    Compiler.prototype.leaveLoop = function (loop, statement) {
        this.fn.loops.pop();
        if (loop.used)
            return J.label(loop.label, statement);
        return statement;
    };

    // --- Conditions

    // A condition: a Boolean (or a JavaScript value - its truthiness).
    Compiler.prototype.condition = function (node) {
        var value = this.compileValue(node);
        if (value.type.kind === 'js')
            return this.rt('jtrue', [value.node]);
        if (value.type.kind !== 'bool')
            this.incompatible(value.type, t.boolean, node);
        return value.node;
    };

    Compiler.prototype.branch = function (node) {
        if (node === null)
            return J.block([]);
        var list = this.compileStatement(node);
        return list.length === 1 && list[0].k !== 'var' ? list[0] : J.block(list);
    };

    Compiler.prototype.compileIf = function (node) {
        var test = this.condition(node.test);
        var then = this.branch(node.then);
        var otherwise = node.otherwise !== null ? this.branch(node.otherwise) : null;
        return at(J.if_(test, then, otherwise), node);
    };

    // case: branches with constants (ranges) - an if chain or a switch.
    Compiler.prototype.compileCase = function (node) {
        var self = this;
        var selector = this.compileValue(node.expr);
        var type = selector.type;
        var isString = type.kind === 'string';
        if (!types.isOrdinal(type) && !isString)
            this.error('Ordinal expression expected', node.expr);
        var setup = [];
        var key = isString ? selector.node : this.ordinalNode(selector);
        if (!J.isSimple(key)) {
            var name = this.temp();
            setup.push(at(J.expr(J.assign(J.id(name), key)), node));
            key = J.id(name);
        }
        var seen = [];
        var simple = true;
        var branches = node.branches.map(function (branch) {
            var tests = [];
            var values = [];
            branch.labels.forEach(function (label) {
                var lo = self.caseLabel(label.lo, type);
                if (label.hi !== null) {
                    simple = false;
                    var hi = self.caseLabel(label.hi, type);
                    if (isString) {
                        tests.push(J.and(J.bin('>=', key, J.str(lo)), J.bin('<=', key, J.str(hi))));
                    } else {
                        if (big.cmp(lo, hi) > 0)
                            self.error('High range limit < low range limit', label.hi);
                        self.checkDuplicateCase(seen, lo, hi, label);
                        tests.push(J.and(J.bin('>=', key, J.num(big.toFloat(lo))), J.bin('<=', key, J.num(big.toFloat(hi)))));
                    }
                } else {
                    if (!isString)
                        self.checkDuplicateCase(seen, lo, lo, label);
                    var constant = isString ? J.str(lo) : J.num(big.toFloat(lo));
                    tests.push(J.bin('===', key, constant));
                    values.push(constant);
                }
            });
            return { tests: tests, values: values, body: branch.body, node: branch };
        });
        var hasJumps = node.branches.some(function (branch) { return Pascal.containsLoopJump(branch.body); }) ||
            (node.otherwise !== null && node.otherwise.some(Pascal.containsLoopJump));
        var otherwise = node.otherwise !== null ? J.block(this.compileStatements(node.otherwise)) : null;
        if (simple && !hasJumps && branches.length > 3 && !isString) {
            var cases = [];
            branches.forEach(function (branch) {
                var body = self.compileStatement(branch.body);
                branch.values.forEach(function (value, index) {
                    cases.push(J.at({ test: value, body: index === branch.values.length - 1 ? body.concat([J.brk()]) : [] },
                                    branch.node.line, branch.node.source));
                });
            });
            if (otherwise !== null)
                cases.push({ test: null, body: otherwise.body });
            return setup.concat([at(J.switch_(key, cases), node)]);
        }
        var chain = otherwise;
        for (var index = branches.length - 1; index >= 0; --index) {
            var branch = branches[index];
            var test = branch.tests.reduce(function (left, right) { return J.or(left, right); });
            chain = J.at(J.if_(test, this.branch(branch.body), chain), branch.node.line, branch.node.source);
        }
        if (chain === null)
            return setup;
        return setup.concat([chain]);
    };

    Compiler.prototype.caseLabel = function (labelNode, type) {
        var value = this.constExpr(labelNode);
        if (type.kind === 'string') {
            var text = this.stringValue(value, labelNode);
            return text.constant;
        }
        if (value.type.kind === 'string' && value.constant.length === 1)
            value = this.charConstant(value.constant.charCodeAt(0), true);
        if (!types.isOrdinal(value.type) || !types.sameOrdinalBase(types.base(value.type), types.base(type)))
            this.incompatible(value.type, type, labelNode);
        return Pascal.ordinalOf(value.constant);
    };

    Compiler.prototype.checkDuplicateCase = function (seen, lo, hi, label) {
        for (var index = 0; index < seen.length; ++index) {
            if (big.cmp(lo, seen[index][1]) <= 0 && big.cmp(hi, seen[index][0]) >= 0)
                this.error('Duplicate case label', label);
        }
        seen.push([lo, hi]);
    };

    // --- Loops

    // The loop variable: a local or a global ordinal one.
    Compiler.prototype.loopVariable = function (node, anyType) {
        var value = this.compileExpr(node);
        if (value.ref === null || value.ref === undefined || value.kind !== undefined)
            this.error('Illegal counter variable', node);
        var ref = value.ref;
        if (!(ref instanceof Pascal.LocalRef) && !(ref instanceof Pascal.PropRef && ref.symbol !== undefined && ref.symbol.storage === 'global'))
            this.error('Illegal counter variable', node);
        if (!anyType && !types.isOrdinal(value.type))
            this.error('Ordinal expression expected', node);
        if (ref.readOnly)
            this.error('Illegal assignment to for-loop variable', node);
        return ref;
    };

    Compiler.prototype.compileFor = function (node) {
        var ref = this.loopVariable(node.variable);
        var type = ref.type;
        var from = this.convertValue(this.compileValue(node.from, type), type, node.from, { loop: true });
        var to = this.convertValue(this.compileValue(node.to, type), type, node.to, { loop: true });
        var symbol = ref instanceof Pascal.LocalRef ? ref.symbol : ref.symbol;
        var wide = type.kind === 'int' && types.isWide(type);
        var setup = [];
        var lo = this.ordinalNode(from), hi = this.ordinalNode(to);
        var limit = hi;
        if (!J.isSimple(hi) || !(to.isConstant())) {
            var limitName = this.temp();
            setup.push(J.expr(J.assign(J.id(limitName), hi)));
            limit = J.id(limitName);
        }
        var counter = this.fn.temps.temp();
        var assignCounter = type.kind === 'bool' ? J.bin('!==', J.id(counter), J.num(0)) : J.id(counter);
        var down = node.down;
        var loop = this.enterLoop();
        symbol.loopVariable = true;
        var savedReadOnly = symbol.readOnly;
        symbol.readOnly = true;
        var body;
        try {
            body = this.compileStatement(node.body);
        } finally {
            symbol.readOnly = savedReadOnly;
            symbol.loopVariable = false;
        }
        var writable = this.symbolRef(symbol, node.variable);
        body.unshift(at(J.expr(writable.set(assignCounter)), node));
        var test, step;
        if (wide) {
            test = J.call(J.mem(this.helper(type.ik === 'u64' ? 'u64' : 'i64'), down ? 'ge' : 'le'), [J.id(counter), limit]);
            step = J.assign(J.id(counter), J.call(J.mem(this.helper(type.ik === 'u64' ? 'u64' : 'i64'), down ? 'sub' : 'add'), [J.id(counter), J.num(1)]));
        } else {
            test = J.bin(down ? '>=' : '<=', J.id(counter), limit);
            step = J.update(down ? '--' : '++', true, J.id(counter));
        }
        var statement = J.for_(J.assign(J.id(counter), lo), test, step, J.block(body));
        return setup.map(function (item) {
            return at(item, node);
        }).concat([at(this.leaveLoop(loop, statement), node)]);
    };

    // for x in collection: arrays, strings, sets.
    Compiler.prototype.compileForIn = function (node) {
        var ref = this.loopVariable(node.variable, true);
        // [a, b, c] - an array of values of the type of the variable (except sets).
        var collection = node.collection.k === 'setlit' && !types.isOrdinal(ref.type)
            ? this.compileValue(node.collection, new Pascal.Type('dynarray', { name: null, of: ref.type }))
            : this.compileValue(node.collection);
        var type = collection.type;
        var symbol = ref.symbol;
        var setup = [];
        var items = this.temp();
        var index = this.fn.temps.temp();
        var element;
        if (type.kind === 'array' || type.kind === 'dynarray' || type.kind === 'openarray') {
            setup.push(J.expr(J.assign(J.id(items), collection.node)));
            element = new Value(type.of, J.idx(J.id(items), J.id(index)));
        } else if (type.kind === 'string') {
            setup.push(J.expr(J.assign(J.id(items), collection.node)));
            element = new Value(t.char, J.call(J.mem(J.id(items), 'charCodeAt'), [J.id(index)]));
        } else if (type.kind === 'set') {
            setup.push(J.expr(J.assign(J.id(items), this.rt('selements', [collection.node, J.bool(!!type.small)]))));
            element = new Value(type.of || t.byte, J.idx(J.id(items), J.id(index)));
        } else if (type.kind === 'class') {
            return this.compileEnumeratorLoop(node, ref, collection);
        } else {
            this.error('Cannot find an enumerator for the type "' + types.display(type) + '"', node.collection);
        }
        var loop = this.enterLoop();
        symbol.loopVariable = true;
        var savedReadOnly = symbol.readOnly;
        symbol.readOnly = true;
        var body;
        try {
            body = this.compileStatement(node.body);
        } finally {
            symbol.readOnly = savedReadOnly;
            symbol.loopVariable = false;
        }
        body.unshift(at(J.expr(this.assignTo(this.symbolRef(symbol, node.variable), element, node.variable)), node));
        var statement = J.for_(J.assign(J.id(index), J.num(0)), J.bin('<', J.id(index), J.mem(J.id(items), 'length')),
                               J.update('++', true, J.id(index)), J.block(body));
        return setup.map(function (item) {
            return at(item, node);
        }).concat([at(this.leaveLoop(loop, statement), node)]);
    };

    // for x in object: GetEnumerator, MoveNext, Current.
    Compiler.prototype.compileEnumeratorLoop = function (node, ref, collection) {
        var getter = this.findMember(collection.type, 'getenumerator');
        if (getter === null || getter.kind !== 'method')
            this.error('Cannot find an enumerator for the type "' + types.display(collection.type) + '"', node.collection);
        var enumerator = this.invokeMethod(getter.procs[0], { selfNode: collection.node, classRef: false }, [], node, false, false);
        var enumType = enumerator.type;
        var moveNext = this.findMember(enumType, 'movenext');
        var current = this.findMember(enumType, 'current');
        if (moveNext === null || current === null)
            this.error('Cannot find an enumerator for the type "' + types.display(collection.type) + '"', node.collection);
        var name = this.temp();
        var setup = [J.expr(J.assign(J.id(name), enumerator.node))];
        var test = this.invokeMethod(moveNext.procs[0], { selfNode: J.id(name), classRef: false }, [], node, false, false);
        var currentValue = current.kind === 'property'
            ? this.refValue(new Pascal.PropertyRef(this, J.id(name), current.property, [], node))
            : this.invokeMethod(current.procs[0], { selfNode: J.id(name), classRef: false }, [], node, false, false);
        var symbol = ref.symbol;
        var loop = this.enterLoop();
        symbol.loopVariable = true;
        var savedReadOnly = symbol.readOnly;
        symbol.readOnly = true;
        var body;
        try {
            body = this.compileStatement(node.body);
        } finally {
            symbol.readOnly = savedReadOnly;
            symbol.loopVariable = false;
        }
        body.unshift(at(J.expr(this.assignTo(this.symbolRef(symbol, node.variable), currentValue, node.variable)), node));
        var statement = J.while_(test.node, J.block(body));
        return setup.map(function (item) {
            return at(item, node);
        }).concat([at(this.leaveLoop(loop, statement), node)]);
    };

    Compiler.prototype.compileWhile = function (node) {
        var test = this.condition(node.test);
        var loop = this.enterLoop();
        var body = this.compileStatement(node.body);
        return [at(this.leaveLoop(loop, J.while_(test, J.block(body))), node)];
    };

    Compiler.prototype.compileRepeat = function (node) {
        var loop = this.enterLoop();
        var body = this.compileStatements(node.body);
        var test = this.condition(node.test);
        return [at(this.leaveLoop(loop, J.doWhile(J.block(body), T.negate(test))), node)];
    };

    // --- with

    Compiler.prototype.compileWith = function (node) {
        var self = this;
        var setup = [];
        var saved = this.scope;
        try {
            node.objects.forEach(function (objectNode) {
                var value = self.compileValue(objectNode);
                var type = value.type;
                if (type.kind === 'pointer' && type.to !== null && type.to.kind === 'record')
                    value = self.derefValue(value, objectNode);
                type = value.type;
                if (type.kind !== 'record' && type.kind !== 'class')
                    self.error('Expression type must be class or record type, got ' + types.display(type), objectNode);
                if (value.ref !== null && value.ref !== undefined)
                    self.noteModified(value.ref);
                var name = self.temp();
                setup.push(at(J.expr(J.assign(J.id(name), value.node)), objectNode));
                var scope = new Pascal.Scope('with', self.scope, type);
                scope.here = function (memberName) {
                    if (type.kind === 'record') {
                        var field = type.fieldMap[memberName];
                        return field === undefined ? null : { kind: 'withmember', field: field, object: J.id(name), type: type };
                    }
                    var member = self.findMember(type, memberName);
                    return member === null ? null : { kind: 'withmember', member: member, object: J.id(name), type: type };
                };
                self.scope = scope;
            });
            return setup.concat(this.compileStatement(node.body));
        } finally {
            this.scope = saved;
        }
    };

    Compiler.prototype.memberOfWith = function (symbol, node, expected) {
        if (symbol.field !== undefined)
            return this.refValue(new Pascal.PropRef(symbol.field.type, symbol.object, J.str(symbol.field.js)));
        return this.memberAccess({ node: symbol.object, classRef: false, type: symbol.type }, symbol.member, node, expected, symbol.type);
    };

    // --- Exceptions

    Compiler.prototype.compileTry = function (node) {
        var body = this.compileStatements(node.body);
        if (node.finallyBody !== null)
            return at(J.try_(body, null, null, this.compileStatements(node.finallyBody)), node);
        var self = this;
        var name = this.fn.jsName('$e');
        var handlers = [J.expr(J.assign(J.id(name), this.rt('exc', [J.id(name)])))];
        this.fn.handlers.push(name);
        try {
            if (node.handlers === null) {
                handlers = handlers.concat(this.compileStatements(node.exceptBody));
            } else {
                var chain = node.exceptBody !== null ? J.block(this.compileStatements(node.exceptBody))
                                                     : J.throw_(J.id(name));
                var tests = node.handlers.map(function (handler) {
                    var type = self.resolveType(handler.typeNode);
                    if (type.kind !== 'class' || type.isObject)
                        self.error('Class type expected', handler.typeNode);
                    var saved = self.scope;
                    var statements;
                    try {
                        var scope = new Pascal.Scope('handler', self.scope);
                        var prefix = [];
                        if (handler.name !== null) {
                            var symbol = self.localVar(handler.name, handler.text, type);
                            scope.define(handler.name, symbol);
                            prefix.push(J.expr(J.assign(self.localNode(symbol), J.id(name))));
                        }
                        self.scope = scope;
                        statements = prefix.concat(self.compileStatement(handler.body));
                    } finally {
                        self.scope = saved;
                    }
                    return { test: J.bin('instanceof', J.id(name), self.classNode(type)), body: statements, node: handler };
                });
                for (var index = tests.length - 1; index >= 0; --index)
                    chain = J.at(J.if_(tests[index].test, J.block(tests[index].body), chain), tests[index].node.line, tests[index].node.source);
                handlers.push(chain);
            }
        } finally {
            this.fn.handlers.pop();
        }
        return at(J.try_(body, name, handlers, null), node);
    };

    Compiler.prototype.compileRaise = function (node) {
        if (node.value === null) {
            var handlers = this.fn.handlers;
            if (handlers.length === 0)
                this.error('raise without an exception object is only allowed in an exception handler', node);
            return at(J.throw_(J.id(handlers[handlers.length - 1])), node);
        }
        var value = this.compileValue(node.value);
        if (value.type.kind !== 'class' || value.type.isObject)
            this.error('Class type expected, but got "' + types.display(value.type) + '"', node.value);
        return at(J.throw_(this.rt('raise', [value.node])), node);
    };

    // --- goto: parts with labels

    // Whether a statement has a jump or a label (without going into routines).
    Pascal.containsJump = function (node) {
        if (node === null || node === undefined || typeof node !== 'object')
            return false;
        if (Array.isArray(node))
            return node.some(Pascal.containsJump);
        if (node.k === 'goto' || node.k === 'labeled')
            return true;
        switch (node.k) {
        case 'block': return Pascal.containsJump(node.body);
        case 'if': return Pascal.containsJump(node.then) || Pascal.containsJump(node.otherwise);
        case 'case':
            return node.branches.some(function (branch) { return Pascal.containsJump(branch.body); }) ||
                Pascal.containsJump(node.otherwise);
        case 'for':
        case 'forin':
        case 'while':
        case 'with':
            return Pascal.containsJump(node.body);
        case 'repeat':
            return Pascal.containsJump(node.body);
        case 'try':
            return false;
        }
        return false;
    };

    // Break or Continue inside (not in nested loops).
    Pascal.containsLoopJump = function (node) {
        if (node === null || node === undefined || typeof node !== 'object')
            return false;
        if (Array.isArray(node))
            return node.some(Pascal.containsLoopJump);
        switch (node.k) {
        case 'call': {
            var expr = node.expr;
            var name = expr.k === 'name' ? expr.name : (expr.k === 'call' && expr.callee.k === 'name' ? expr.callee.name : null);
            return name === 'break' || name === 'continue';
        }
        case 'block': return Pascal.containsLoopJump(node.body);
        case 'if': return Pascal.containsLoopJump(node.then) || Pascal.containsLoopJump(node.otherwise);
        case 'case':
            return node.branches.some(function (branch) { return Pascal.containsLoopJump(branch.body); }) ||
                Pascal.containsLoopJump(node.otherwise);
        case 'with':
        case 'labeled':
            return Pascal.containsLoopJump(node.body);
        case 'try':
            return Pascal.containsLoopJump(node.body) || Pascal.containsLoopJump(node.exceptBody) ||
                Pascal.containsLoopJump(node.finallyBody) ||
                (node.handlers || []).some(function (handler) { return Pascal.containsLoopJump(handler.body); });
        }
        return false;
    };

    // A statement list with labels and jumps - parts and T.structure.
    Compiler.prototype.flatten = function (list, node) {
        var savedItems = this.flatItems;
        var savedFlat = this.fn.flat;
        this.flatItems = [];
        this.fn.flat = true;
        try {
            var self = this;
            list.forEach(function (statement) { self.lowerStatement(statement); });
            var items = this.flatItems;
            items.forEach(function (item) {
                if (item.k === 'goto' && item.test !== null && item.test !== undefined)
                    item.test = item.test;
            });
            this.checkFlatLabels(items, node);
            return T.structure(items, []);
        } finally {
            this.flatItems = savedItems;
            this.fn.flat = savedFlat;
        }
    };

    Compiler.prototype.checkFlatLabels = function (items, node) {
        var defined = Object.create(null);
        items.forEach(function (item) {
            if (item.k === 'label')
                defined[item.id] = true;
        });
        var self = this;
        items.forEach(function (item) {
            if (item.k === 'goto' && defined[item.id] !== true)
                self.error('goto into or out of a structured statement is not supported here', item.node || node);
        });
    };

    Compiler.prototype.flatLabel = function () {
        return 'g' + (++this.labelCounter);
    };

    // A statement into parts.
    Compiler.prototype.lowerStatement = function (node) {
        var items = this.flatItems;
        var self = this;
        if (node === null)
            return [];
        var loops = this.fn.loops;
        var flatLoop = loops.length > 0 && loops[loops.length - 1].flat;
        if (!Pascal.containsJump(node) && !(flatLoop && Pascal.containsLoopJump(node) && node.k !== 'call')) {
            var savedFlat = this.fn.flat;
            this.fn.flat = false;
            var compiled;
            try {
                compiled = this.compileStatement(node);
            } finally {
                this.fn.flat = savedFlat;
            }
            compiled.forEach(function (statement) {
                if (statement.k === 'empty')
                    return;
                items.push({ k: 's', node: statement });
            });
            return [];
        }
        switch (node.k) {
        case 'labeled': {
            var symbol = this.labelSymbol(node.label, node);
            if (symbol.defined)
                this.error('Label already defined "' + node.text + '"', node);
            symbol.defined = true;
            items.push({ k: 'label', id: 'u' + node.label });
            if (node.body !== null)
                this.lowerStatement(node.body);
            return [];
        }
        case 'goto': {
            var target = this.labelSymbol(node.label, node);
            target.used = true;
            items.push({ k: 'goto', id: 'u' + node.label, test: null, line: node.line, source: node.source, node: node });
            return [];
        }
        case 'block':
            node.body.forEach(function (statement) { self.lowerStatement(statement); });
            return [];
        case 'if': {
            var test = this.condition(node.test);
            var elseId = this.flatLabel(), endId = this.flatLabel();
            items.push({ k: 'goto', id: node.otherwise !== null ? elseId : endId, test: T.negate(test), line: node.line, source: node.source });
            this.lowerStatement(node.then);
            if (node.otherwise !== null) {
                items.push({ k: 'goto', id: endId, test: null });
                items.push({ k: 'label', id: elseId });
                this.lowerStatement(node.otherwise);
            }
            items.push({ k: 'label', id: endId });
            return [];
        }
        case 'call': {
            // Break or Continue in a loop with labels - a jump.
            this.compileCallStatement(node).forEach(function (statement) {
                if (statement.k !== 'empty')
                    items.push({ k: 's', node: statement });
            });
            return [];
        }
        case 'try':
            this.error('Break and Continue inside try in a loop with goto labels are not supported', node);
            break;
        case 'while': {
            var top = this.flatLabel(), end = this.flatLabel();
            items.push({ k: 'label', id: top });
            items.push({ k: 'goto', id: end, test: T.negate(this.condition(node.test)), line: node.line, source: node.source });
            this.fn.loops.push({ flat: true, breakId: end, continueId: top });
            try {
                this.lowerStatement(node.body);
            } finally {
                this.fn.loops.pop();
            }
            items.push({ k: 'goto', id: top, test: null });
            items.push({ k: 'label', id: end });
            return [];
        }
        case 'repeat': {
            var start = this.flatLabel(), next = this.flatLabel(), finish = this.flatLabel();
            items.push({ k: 'label', id: start });
            this.fn.loops.push({ flat: true, breakId: finish, continueId: next });
            try {
                node.body.forEach(function (statement) { self.lowerStatement(statement); });
            } finally {
                this.fn.loops.pop();
            }
            items.push({ k: 'label', id: next });
            items.push({ k: 'goto', id: start, test: T.negate(this.condition(node.test)), line: node.line, source: node.source });
            items.push({ k: 'label', id: finish });
            return [];
        }
        case 'for':
            return this.lowerFor(node);
        case 'case': {
            var caseEnd = this.flatLabel();
            var selector = this.compileValue(node.expr);
            var keyName = this.temp();
            var key = J.id(keyName);
            items.push({ k: 's', node: at(J.expr(J.assign(key, selector.type.kind === 'string' ? selector.node : this.ordinalNode(selector))), node) });
            var labels = node.branches.map(function () { return self.flatLabel(); });
            node.branches.forEach(function (branch, index) {
                branch.labels.forEach(function (label) {
                    var lo = self.caseLabel(label.lo, selector.type);
                    var test;
                    if (label.hi !== null) {
                        var hi = self.caseLabel(label.hi, selector.type);
                        test = J.and(J.bin('>=', key, J.num(big.toFloat(lo))), J.bin('<=', key, J.num(big.toFloat(hi))));
                    } else {
                        test = J.bin('===', key, typeof lo === 'string' ? J.str(lo) : J.num(big.toFloat(lo)));
                    }
                    items.push({ k: 'goto', id: labels[index], test: test, line: branch.line, source: branch.source });
                });
            });
            var otherwiseId = this.flatLabel();
            items.push({ k: 'goto', id: node.otherwise !== null ? otherwiseId : caseEnd, test: null });
            node.branches.forEach(function (branch, index) {
                items.push({ k: 'label', id: labels[index] });
                self.lowerStatement(branch.body);
                items.push({ k: 'goto', id: caseEnd, test: null });
            });
            if (node.otherwise !== null) {
                items.push({ k: 'label', id: otherwiseId });
                node.otherwise.forEach(function (statement) { self.lowerStatement(statement); });
            }
            items.push({ k: 'label', id: caseEnd });
            return [];
        }
        case 'with': {
            var withSaved = this.scope;
            try {
                var setup = this.compileWith({ k: 'with', objects: node.objects, body: null, line: node.line, source: node.source });
                setup.forEach(function (statement) { items.push({ k: 's', node: statement }); });
                this.lowerWithBody(node);
            } finally {
                this.scope = withSaved;
            }
            return [];
        }
        }
        this.error('goto into this statement is not supported', node);
    };

    // with and labels: the body is in the same scope (compileWith restored it).
    Compiler.prototype.lowerWithBody = function (node) {
        var self = this;
        var saved = this.scope;
        var setup = [];
        node.objects.forEach(function (objectNode) {
            var value = self.compileValue(objectNode);
            var type = value.type;
            var name = self.temp();
            setup.push(J.expr(J.assign(J.id(name), value.node)));
            var scope = new Pascal.Scope('with', self.scope, type);
            scope.here = function (memberName) {
                if (type.kind === 'record') {
                    var field = type.fieldMap[memberName];
                    return field === undefined ? null : { kind: 'withmember', field: field, object: J.id(name), type: type };
                }
                var member = self.findMember(type, memberName);
                return member === null ? null : { kind: 'withmember', member: member, object: J.id(name), type: type };
            };
            self.scope = scope;
        });
        setup.forEach(function (statement) { self.flatItems.push({ k: 's', node: statement }); });
        try {
            this.lowerStatement(node.body);
        } finally {
            this.scope = saved;
        }
    };

    Compiler.prototype.lowerFor = function (node) {
        var items = this.flatItems;
        var ref = this.loopVariable(node.variable);
        var type = ref.type;
        if (types.isWide(type))
            this.error('goto in a loop with an Int64 counter is not supported', node);
        var from = this.ordinalNode(this.convertValue(this.compileValue(node.from, type), type, node.from));
        var to = this.ordinalNode(this.convertValue(this.compileValue(node.to, type), type, node.to));
        var counter = this.temp(), limit = this.temp();
        var top = this.flatLabel(), next = this.flatLabel(), end = this.flatLabel();
        var down = node.down;
        items.push({ k: 's', node: at(J.expr(J.seq([J.assign(J.id(counter), from), J.assign(J.id(limit), to)])), node) });
        items.push({ k: 'goto', id: end, test: J.bin(down ? '<' : '>', J.id(counter), J.id(limit)), line: node.line, source: node.source });
        items.push({ k: 'label', id: top });
        var symbol = ref.symbol;
        var writable = this.symbolRef(symbol, node.variable);
        items.push({ k: 's', node: at(J.expr(writable.set(type.kind === 'bool' ? J.bin('!==', J.id(counter), J.num(0)) : J.id(counter))), node) });
        symbol.loopVariable = true;
        var savedReadOnly = symbol.readOnly;
        symbol.readOnly = true;
        this.fn.loops.push({ flat: true, breakId: end, continueId: next });
        try {
            this.lowerStatement(node.body);
        } finally {
            this.fn.loops.pop();
            symbol.readOnly = savedReadOnly;
            symbol.loopVariable = false;
        }
        items.push({ k: 'label', id: next });
        items.push({ k: 'goto', id: end, test: J.bin('===', J.id(counter), J.id(limit)) });
        items.push({ k: 's', node: J.expr(J.update(down ? '--' : '++', true, J.id(counter))) });
        items.push({ k: 'goto', id: top, test: null });
        items.push({ k: 'label', id: end });
        return [];
    };

    Compiler.prototype.labelSymbol = function (name, node) {
        var symbol = this.lookup(name);
        if (symbol === null || symbol.kind !== 'label')
            this.error('Identifier isn\'t a label "' + (node.text || name) + '"', node);
        if (symbol.fn !== this.fn && !(symbol.fn === null && this.fn.kind === 'main') && !(symbol.fn && symbol.fn.kind === 'main' && this.fn.kind === 'main'))
            this.error('goto out of a procedure is not supported', node);
        return symbol;
    };
})(globalThis);
