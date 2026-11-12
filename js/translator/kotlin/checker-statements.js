// Kotlin: statements and function literals - local declarations,
// destructuring, assignments, loops, returns and jumps (non-local ones
// from inline lambdas), lambdas, anonymous functions, callable references,
// object expressions.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Kt = T.kotlin;
    var Checker = Kt.Checker;
    if (Checker.prototype.statement)
        return;

    var varCounter = 0;

    Checker.prototype.declareLocal = function (scope, variable, node) {
        if (scope.vars !== null && scope.vars.has(variable.name) && variable.name !== '_')
            this.error(node, 'conflicting declarations: val ' + variable.name + '.');
        variable.id = ++varCounter;
        if (variable.name !== '_')
            scope.declareVar(variable);
        variable.declScope = scope;
        return variable;
    };

    // A statement; returns its type (Nothing when it jumps).
    Checker.prototype.statement = function (node, scope) {
        switch (node.k) {
        case 'property':
            this.localProperty(node, scope);
            return Kt.unitType();
        case 'fun':
            this.localFunction(node, scope);
            return Kt.unitType();
        case 'class':
            this.localClass(node, scope);
            return Kt.unitType();
        case 'typealias':
            this.error(node, 'nested and local type aliases are not supported.');
            break;
        case 'assign':
            return this.assignment(node, scope);
        case 'for':
            return this.forLoop(node, scope);
        case 'while':
            return this.whileLoop(node, scope);
        case 'dowhile':
            return this.doWhileLoop(node, scope);
        case 'if':
            node.type = this.ifExpr(node, null, scope, false);
            return node.type;
        case 'when':
            node.type = this.whenExpr(node, null, scope, false);
            return node.type;
        }
        return this.expr(node, null, scope);
    };

    // --- Local declarations

    Checker.prototype.localProperty = function (node, scope) {
        if (node.receiver !== null)
            this.error(node, 'local extension properties are not allowed.');
        if (node.delegate !== null)
            return this.localDelegated(node, scope);
        if (node.destructure !== null)
            return this.destructuring(node, scope);
        var declared = node.type !== null ? this.resolveType(node.type, scope) : null;
        var type = declared;
        if (node.init !== null) {
            var valueType = this.expr(node.init, declared, scope);
            if (declared !== null) {
                if (!this.fits(node.init, valueType, declared))
                    this.mismatch(node.init, declared, valueType, 'initializer');
            } else {
                type = this.inferredVariableType(node.init, valueType);
            }
        } else if (declared === null) {
            this.error(node, 'this variable must either have an explicit type or be initialized.');
        }
        var variable = Kt.VarSym(node.name, type, node.valVar === 'var');
        variable.node = node;
        variable.initialized = node.init !== null;
        this.declareLocal(scope, variable, node);
        node.sym = variable;
        // A smart cast from the initializer: val x: Any = "s" is a String.
        if (node.init !== null && declared !== null && !variable.mutable) {
            var initType = node.init.type;
            if (initType !== undefined && !Kt.sameType(initType, declared) && Kt.isSubtype(initType, declared) &&
                Kt.resolved(initType).kind === 'class' && !Kt.isPrimitive(declared))
                this.setFact(variable, initType);
        }
        if (node.init !== null && declared !== null && variable.mutable) {
            var mutableInit = node.init.type;
            if (mutableInit !== undefined && Kt.isNullable(declared) && !Kt.isNullable(mutableInit) &&
                Kt.resolved(mutableInit).kind !== 'nothing')
                this.setFact(variable, mutableInit);
        }
    };

    // The type of a variable without a declared type (an integer literal is Int).
    Checker.prototype.inferredVariableType = function (init, type) {
        type = Kt.resolved(type);
        if (type.kind === 'nothing' && type.nullable)
            return Kt.NULL_TYPE;
        if (type.kind === 'nothing')
            return Kt.NOTHING;
        if (type.flexible)
            return type;
        return type;
    };

    // val x by lazy { ... } in a function.
    Checker.prototype.localDelegated = function (node, scope) {
        var declared = node.type !== null ? this.resolveType(node.type, scope) : null;
        var delegateType = this.expr(node.delegate, null, scope);
        var valueType = this.delegateValueType(node, delegateType, declared, scope, node.valVar === 'var');
        var variable = Kt.VarSym(node.name, declared !== null ? declared : valueType, node.valVar === 'var');
        variable.node = node;
        variable.delegated = true;
        variable.initialized = true;
        this.declareLocal(scope, variable, node);
        node.sym = variable;
    };

    // getValue of a delegate: the type of the property.
    Checker.prototype.delegateValueType = function (node, delegateType, declared, scope, mutable) {
        var thisRef = Kt.NULL_TYPE;
        var propertyRef = Kt.builtinType('KProperty', [Kt.STAR]);
        var receiver = { k: 'delegateArg', type: thisRef, line: node.line, column: node.column };
        var propertyArg = { k: 'delegateArg', type: propertyRef, line: node.line, column: node.column };
        var getter = this.operatorCall(node.delegate, 'getValue', node.delegate, delegateType, [receiver, propertyArg], scope, declared);
        node.delegateGet = getter;
        var type = getter.type;
        if (declared !== null && !Kt.isSubtype(type, declared))
            this.mismatch(node.delegate, declared, type, 'initializer');
        if (mutable) {
            var valueArg = { k: 'delegateArg', type: declared !== null ? declared : type, line: node.line, column: node.column };
            node.delegateSet = this.operatorCall(node.delegate, 'setValue', node.delegate, delegateType, [receiver, propertyArg, valueArg],
                                                 scope, null);
        }
        return type;
    };

    // val (a, b) = pair: component1(), component2().
    Checker.prototype.destructuring = function (node, scope) {
        if (node.init === null)
            this.error(node, 'destructuring declarations are only allowed for local variables/values.');
        var type = this.expr(node.init, null, scope);
        var self = this;
        node.components = node.destructure.map(function (part, index) {
            var name = 'component' + (index + 1);
            var holder = { k: 'componentCall', line: part.line, column: part.column };
            var result = null;
            var componentType;
            if (part.name !== '_') {
                result = self.operatorCall(holder, name, node.init, type, [], scope, null);
                componentType = result.type;
            } else {
                componentType = Kt.nullableAny();
            }
            if (part.type !== null) {
                var declared = self.resolveType(part.type, scope);
                if (!Kt.isSubtype(componentType, declared))
                    self.mismatch(part, declared, componentType, 'initializer');
                componentType = declared;
            }
            var variable = Kt.VarSym(part.name, componentType, node.valVar === 'var');
            variable.node = part;
            variable.initialized = true;
            self.declareLocal(scope, variable, part);
            part.sym = variable;
            return { call: result, sym: variable };
        });
    };

    Checker.prototype.localFunction = function (node, scope) {
        if (node.name === null || node.name === undefined)
            this.error(node, 'function declaration must have a name.');
        var fn = this.functionSymbol(node, null, scope);
        fn.local = true;
        fn.declScope = scope;
        fn.checker = this;
        scope.declareFun(fn);
        node.sym = fn;
        fn.jsName = T.jsName(node.name) + '$l' + (++varCounter);
        if (fn.returns === null) {
            // An expression body: the type now (a local function is used after its declaration).
            this.returnType(fn);
        } else {
            this.checkFunctionBody(fn);
        }
    };

    Checker.prototype.localClass = function (node, scope) {
        if (node.kind === 'enum' || node.kind === 'interface' && false)
            this.error(node, 'local enum classes are not allowed.');
        var sym = this.enterClass(node, null, scope, '', false);
        sym.isLocal = true;
        sym.declScope = scope;
        sym.localFunction = this.fn;
        scope.declareClass(sym);
        sym.complete();
        this.checkClassBody(sym);
        node.sym = sym;
    };

    // --- Assignments

    // The type of an assignable expression (for x = ..., x++).
    Checker.prototype.assignableType = function (target, scope) {
        switch (target.k) {
        case 'paren':
            return this.assignableType(target.expr, scope);
        case 'name': {
            var type = this.expr(target, null, scope);
            var ref = target.ref;
            if (ref.kind === 'local') {
                if (!ref.sym.mutable && (ref.sym.initialized || ref.sym.isParam))
                    this.error(target, '\'val\' cannot be reassigned.');
                return ref.sym.type;
            }
            if (ref.kind === 'prop') {
                this.checkMutable(target, ref.sym, scope);
                return Kt.subst(this.propertyType(ref.sym), ref.map || new Map());
            }
            if (ref.kind === 'field')
                return this.propertyType(ref.prop);
            this.error(target, 'variable expected.');
            break;
        }
        case 'member': {
            var memberType = this.expr(target, null, scope);
            if (target.ref !== undefined && target.ref.kind === 'prop') {
                this.checkMutable(target, target.ref.sym, scope);
                return Kt.subst(this.propertyType(target.ref.sym), target.ref.map || new Map());
            }
            if (target.ref !== undefined && target.ref.kind === 'dynamic')
                return Kt.DYNAMIC;
            void memberType;
            this.error(target, 'variable expected.');
            break;
        }
        case 'index':
            return this.expr(target, null, scope);
        }
        this.error(target, 'variable expected.');
    };

    Checker.prototype.checkMutable = function (node, prop, scope) {
        if (prop.mutable)
            return;
        // A val may be assigned in the constructor of its class (init blocks, no initializer).
        var cls = scope.enclosingClass();
        var inInit = false;
        for (var current = scope; current !== null; current = current.parent) {
            if (current.initOf !== undefined) {
                inInit = current.initOf === prop.owner;
                break;
            }
            if (current.kind === 'function' || current.kind === 'lambda')
                break;
        }
        if (inInit && cls === prop.owner && prop.node !== null && prop.node.init === null && !prop.fromCtor)
            return;
        this.error(node.k === 'member' ? { line: node.nameLine, column: node.nameColumn } : node, '\'val\' cannot be reassigned.');
    };

    // After an assignment: facts of the variable change.
    Checker.prototype.assigned = function (target, type) {
        while (target.k === 'paren')
            target = target.expr;
        var key = target.smartKey;
        if (key === undefined || key === null)
            return;
        this.facts.delete(key);
        // Facts about members of the variable are gone too.
        var self = this;
        if (typeof key === 'object' && key.id !== undefined) {
            var prefix = 'v' + key.id + '.';
            Array.from(this.facts.keys()).forEach(function (other) {
                if (typeof other === 'string' && other.indexOf(prefix) === 0)
                    self.facts.delete(other);
            });
        }
        void type;
    };

    Checker.prototype.assignment = function (node, scope) {
        var target = node.target;
        while (target.k === 'paren')
            target = target.expr;
        node.target = target;
        if (node.op === '=')
            return this.simpleAssignment(node, target, scope);
        return this.compoundAssignment(node, target, scope);
    };

    Checker.prototype.simpleAssignment = function (node, target, scope) {
        if (target.k === 'index') {
            var arrayType = this.expr(target.target, null, scope);
            if (Kt.resolved(arrayType).kind === 'dynamic') {
                var self = this;
                target.indices.forEach(function (index) { self.expr(index, null, scope); });
                this.expr(node.value, null, scope);
                node.dynamicIndex = true;
                return Kt.unitType();
            }
            var args = target.indices.concat([node.value]);
            var result = this.operatorCall(target, 'set', target.target, arrayType, args, scope, null);
            node.setCall = result;
            return Kt.unitType();
        }
        var type = this.assignableType(target, scope);
        var valueType = this.expr(node.value, type, scope);
        if (!this.fits(node.value, valueType, type))
            this.mismatch(node.value, type, valueType, 'assignment');
        this.assigned(target, valueType);
        // x = "s" for x: Any - a String until the next assignment.
        var key = target.smartKey;
        if (key !== undefined && key !== null && !Kt.sameType(valueType, type) && Kt.isSubtype(valueType, type) &&
            Kt.resolved(valueType).kind !== 'nothing' && !Kt.isPrimitive(type))
            this.setFact(key, valueType);
        if (target.k === 'name' && target.ref.kind === 'local') {
            target.ref.sym.initialized = true;
            this.noteAssignedInLambda(target.ref.sym, scope);
        }
        return Kt.unitType();
    };

    // A var changed inside a lambda loses its smart casts.
    Checker.prototype.noteAssignedInLambda = function (variable, scope) {
        for (var current = scope; current !== null; current = current.parent) {
            if (current.vars !== null && current.vars.get(variable.name) === variable)
                return;
            if (current.kind === 'lambda' && !current.inlineLambda) {
                variable.assignedInLambda = true;
                return;
            }
        }
    };

    var COMPOUND = { '+=': '+', '-=': '-', '*=': '*', '/=': '/', '%=': '%' };
    var ASSIGN_OPERATORS = { '+=': 'plusAssign', '-=': 'minusAssign', '*=': 'timesAssign', '/=': 'divAssign', '%=': 'remAssign' };

    // x += y: plusAssign, or x = x + y.
    Checker.prototype.compoundAssignment = function (node, target, scope) {
        var binary = COMPOUND[node.op];
        var targetType;
        if (target.k === 'index') {
            targetType = this.expr(target, null, scope);
        } else {
            targetType = this.expr(target, null, scope);
        }
        var resolvedTarget = Kt.resolved(targetType);
        // Primitives and strings: x = x op y.
        if (Kt.isPrimitive(resolvedTarget) || (Kt.isClass(resolvedTarget, 'String') && binary === '+') || resolvedTarget.kind === 'dynamic') {
            return this.compoundAsBinary(node, target, targetType, binary, scope);
        }
        // An operator xAssign.
        var assignName = ASSIGN_OPERATORS[node.op];
        var assignCandidates = this.membersOf(Kt.makeNotNull(targetType), assignName).concat(
            this.visibleExtensions(assignName, scope).map(function (fn) { return { member: fn }; }));
        var hasAssign = false;
        if (assignCandidates.length > 0) {
            try {
                var mark = Kt.markBounds();
                var assignResult = this.operatorCall(node, assignName, target, targetType, [node.value], scope, null);
                Kt.rollbackBounds(mark);
                hasAssign = assignResult !== null;
                if (hasAssign) {
                    var reassignable = this.isReassignable(target);
                    node.assignCall = assignResult;
                    if (!reassignable)
                        return Kt.unitType();
                    // A var with both plus and plusAssign: plusAssign for mutable collections.
                    return Kt.unitType();
                }
            } catch (error) {
                if (!(error instanceof T.CompileError))
                    throw error;
            }
        }
        return this.compoundAsBinary(node, target, targetType, binary, scope);
    };

    Checker.prototype.isReassignable = function (target) {
        if (target.k === 'name' && target.ref !== undefined) {
            if (target.ref.kind === 'local')
                return target.ref.sym.mutable;
            if (target.ref.kind === 'prop')
                return target.ref.sym.mutable;
        }
        if (target.k === 'member' && target.ref !== undefined && target.ref.kind === 'prop')
            return target.ref.sym.mutable;
        return target.k === 'index';
    };

    Checker.prototype.compoundAsBinary = function (node, target, targetType, binary, scope) {
        if (target.k !== 'index')
            this.assignableType(target, scope);
        var fake = { k: 'binary', op: binary, left: target, right: node.value, line: node.line, column: node.column,
                     opLine: node.opLine, opColumn: node.opColumn };
        var resultType = this.expr(fake, targetType, scope);
        node.binary = fake;
        if (!this.fits(node.value, resultType, targetType) && !Kt.isSubtype(resultType, targetType))
            this.mismatch(node.value, targetType, resultType, 'assignment');
        if (target.k === 'index') {
            var arrayType = target.target.type;
            var args = target.indices.concat([{ k: 'delegateArg', type: resultType, line: node.line, column: node.column }]);
            node.setCall = this.operatorCall(target, 'set', target.target, arrayType, args, scope, null);
        }
        this.assigned(target, resultType);
        if (target.k === 'name' && target.ref !== undefined && target.ref.kind === 'local')
            this.noteAssignedInLambda(target.ref.sym, scope);
        return Kt.unitType();
    };

    // --- Loops

    // The locals a loop assigns: their smart casts do not hold inside it.
    Checker.prototype.loopAssignments = function (body) {
        var names = Object.create(null);
        Kt.walk(body, function (node) {
            if (node.k === 'assign' || (node.k === 'postfix' && node.op !== '!!') || (node.k === 'prefix' && (node.op === '++' || node.op === '--'))) {
                var target = node.k === 'assign' ? node.target : node.arg;
                while (target !== undefined && target !== null && target.k === 'paren')
                    target = target.expr;
                if (target !== undefined && target !== null && target.k === 'name')
                    names[target.name] = true;
            }
            return true;
        });
        return names;
    };

    Checker.prototype.dropFactsOf = function (names) {
        var self = this;
        Array.from(this.facts.keys()).forEach(function (key) {
            if (typeof key === 'object' && key !== null && names[key.name] === true)
                self.facts.delete(key);
        });
    };

    Checker.prototype.forLoop = function (node, scope) {
        var iterableType = this.expr(node.iterable, null, scope);
        var loopScope = scope.child('block', { loop: node });
        var elementType = this.iterationElement(node, iterableType, scope);
        var self = this;
        if (node.destructure !== null) {
            node.components = node.destructure.map(function (part, index) {
                var holder = { k: 'componentCall', line: part.line, column: part.column };
                var result = null;
                var componentType = Kt.nullableAny();
                if (part.name !== '_') {
                    var elementNode = { k: 'delegateArg', type: elementType, line: part.line, column: part.column };
                    result = self.operatorCall(holder, 'component' + (index + 1), elementNode, elementType, [], scope, null);
                    componentType = result.type;
                }
                if (part.type !== null)
                    componentType = self.resolveType(part.type, scope);
                var variable = Kt.VarSym(part.name, componentType, false);
                variable.initialized = true;
                self.declareLocal(loopScope, variable, part);
                part.sym = variable;
                return { call: result, sym: variable };
            });
        } else {
            var varType = elementType;
            if (node.varType !== null) {
                varType = this.resolveType(node.varType, scope);
                if (!Kt.isSubtype(elementType, varType))
                    this.mismatch(node, varType, elementType, 'initializer');
            }
            var variable = Kt.VarSym(node.name, varType, false);
            variable.initialized = true;
            this.declareLocal(loopScope, variable, node);
            node.sym = variable;
        }
        var before = this.cloneFacts();
        this.dropFactsOf(this.loopAssignments(node.body));
        this.loopBody(node, loopScope);
        this.facts = before;
        this.dropFactsOf(this.loopAssignments(node.body));
        return Kt.unitType();
    };

    Checker.prototype.loopBody = function (node, scope) {
        var saved = this.fn !== null ? this.fn.loops : null;
        if (this.fn !== null)
            this.fn.loops = (saved || []).concat([node]);
        this.blockValue(node.body, null, scope, false);
        if (this.fn !== null)
            this.fn.loops = saved;
    };

    // The element type of a for loop and how it iterates (node.iteration).
    Checker.prototype.iterationElement = function (node, type, scope) {
        type = Kt.resolved(type);
        var iterable = node.iterable;
        // A range of primitives (0..n, 0 until n, n downTo 0, step) - a counted loop.
        if (iterable.intrinsic !== undefined && iterable.intrinsic.kind === 'range' && iterable.intrinsic.operand !== 'u32' &&
            iterable.intrinsic.operand !== 'u64') {
            node.iteration = { kind: 'range', operand: iterable.intrinsic.operand };
            return Kt.typeOfKind(iterable.intrinsic.operand === 'char' ? 'char' : iterable.intrinsic.operand);
        }
        var progression = this.progressionCall(iterable);
        if (progression !== null) {
            node.iteration = progression;
            return Kt.typeOfKind(progression.operand);
        }
        if (type.kind === 'class') {
            var name = type.sym.name;
            var arrays = { IntArray: 'Int', LongArray: 'Long', ShortArray: 'Short', ByteArray: 'Byte', DoubleArray: 'Double',
                           FloatArray: 'Float', CharArray: 'Char', BooleanArray: 'Boolean' };
            if (type.sym === Kt.builtins.Array && !type.nullable) {
                node.iteration = { kind: 'array' };
                return type.args[0].v === '*' || type.args[0].v === 'in' ? Kt.nullableAny() : type.args[0].type;
            }
            if (arrays[name] !== undefined && type.sym === Kt.builtins[name] && !type.nullable) {
                node.iteration = { kind: 'array' };
                return Kt.builtinType(arrays[name]);
            }
            if (type.sym === Kt.builtins.String && !type.nullable) {
                node.iteration = { kind: 'string' };
                return Kt.builtinType('Char');
            }
        }
        if (type.kind === 'dynamic') {
            node.iteration = { kind: 'dynamic' };
            return Kt.DYNAMIC;
        }
        // iterator(), hasNext(), next() operators.
        var holder = { k: 'iteratorCall', line: iterable.line, column: iterable.column };
        var iteratorCall = this.operatorCall(holder, 'iterator', iterable, type, [], scope, null);
        var iteratorType = iteratorCall.type;
        var iteratorNode = { k: 'delegateArg', type: iteratorType, line: iterable.line, column: iterable.column };
        var hasNext = this.operatorCall(holder, 'hasNext', iteratorNode, iteratorType, [], scope, null);
        var next = this.operatorCall(holder, 'next', iteratorNode, iteratorType, [], scope, null);
        node.iteration = { kind: 'iterator', iterator: iteratorCall, hasNext: hasNext, next: next };
        void hasNext;
        return next.type;
    };

    // until, downTo, step on Int, Long, Char: counted loops.
    Checker.prototype.progressionCall = function (node) {
        if (node.k !== 'infix' || node.call === undefined || node.call === null)
            return null;
        var fn = node.call.fn;
        if (fn.owner !== null || fn.library !== true)
            return null;
        var receiver = node.left.type, argument = node.right.type;
        var kind = Kt.isPrimitive(receiver) ? Kt.primKind(receiver) : null;
        if (fn.name === 'until' || fn.name === 'downTo') {
            if ((kind === 'i32' || kind === 'i64' || kind === 'char') && Kt.isPrimitive(argument) && Kt.primKind(argument) === kind)
                return { kind: fn.name, operand: kind, from: node.left, to: node.right };
            return null;
        }
        if (fn.name === 'step') {
            var inner = node.left.intrinsic !== undefined && node.left.intrinsic.kind === 'range'
                ? { kind: 'range', operand: node.left.intrinsic.operand, from: node.left.left, to: node.left.right, op: node.left.op }
                : this.progressionCall(node.left);
            if (inner === null || inner.kind === 'step')
                return null;
            if (inner.operand === 'u32' || inner.operand === 'u64')
                return null;
            return { kind: 'step', operand: inner.operand, inner: inner, step: node.right };
        }
        return null;
    };

    Checker.prototype.whileLoop = function (node, scope) {
        var before = this.cloneFacts();
        this.dropFactsOf(this.loopAssignments(node.body));
        var cond = this.conditionAs(node.cond, scope);
        var loopFacts = this.cloneFacts();
        cond.whenTrue.forEach(function (type, key) { loopFacts.set(key, type); });
        this.facts = loopFacts;
        this.loopBody(node, scope.child('block', { loop: node }));
        this.facts = before;
        this.dropFactsOf(this.loopAssignments(node.body));
        var self = this;
        cond.whenFalse.forEach(function (type, key) { self.setFact(key, type); });
        // while (true) without break never ends.
        if (node.cond.k === 'bool' && node.cond.value === true && !this.breaksLoop(node))
            return Kt.NOTHING;
        return Kt.unitType();
    };

    Checker.prototype.doWhileLoop = function (node, scope) {
        this.dropFactsOf(this.loopAssignments(node.body));
        var bodyScope = scope.child('block', { loop: node });
        var saved = this.fn !== null ? this.fn.loops : null;
        if (this.fn !== null)
            this.fn.loops = (saved || []).concat([node]);
        // The variables of the body are seen by the condition.
        var statements = node.body.statements;
        for (var index = 0; index < statements.length; ++index)
            this.statement(statements[index], bodyScope);
        if (this.fn !== null)
            this.fn.loops = saved;
        var cond = this.conditionAs(node.cond, bodyScope);
        var self = this;
        cond.whenFalse.forEach(function (type, key) { self.setFact(key, type); });
        if (node.cond.k === 'bool' && node.cond.value === true && !this.breaksLoop(node))
            return Kt.NOTHING;
        return Kt.unitType();
    };

    // A break of this loop inside it (not of inner loops).
    Checker.prototype.breaksLoop = function (loop) {
        var found = false;
        var depth = 0;
        (function scan(node) {
            Kt.walk(node, function (inner) {
                if (found)
                    return false;
                if (inner.k === 'jump' && inner.kind === 'break' &&
                    (inner.loopTarget === loop || (inner.label === null && depth === 0) || (inner.label !== null && inner.label === loop.label))) {
                    found = true;
                    return false;
                }
                if (inner !== loop && (inner.k === 'for' || inner.k === 'while' || inner.k === 'dowhile')) {
                    ++depth;
                    scan(inner.body);
                    --depth;
                    return false;
                }
                return true;
            });
        })(loop.body);
        return found;
    };

    // break, continue: the target loop (a label or the innermost one).
    Checker.prototype.loopJump = function (node, scope) {
        var loops = this.fn !== null && this.fn.loops !== null ? this.fn.loops : [];
        var target = null;
        var crossesLambda = false;
        if (node.label !== null) {
            for (var index = loops.length - 1; index >= 0; --index) {
                if (loops[index].label === node.label) {
                    target = loops[index];
                    break;
                }
            }
        } else if (loops.length > 0) {
            target = loops[loops.length - 1];
        }
        // A loop outside the lambda: through inline lambdas only.
        if (target === null) {
            var outer = this.fn;
            while (outer !== null && outer.kind === 'lambda') {
                crossesLambda = true;
                if (!outer.inline)
                    break;
                outer = outer.parent;
                var outerLoops = outer !== null && outer.loops !== null ? outer.loops : [];
                for (var outerIndex = outerLoops.length - 1; outerIndex >= 0 && target === null; --outerIndex) {
                    if (node.label === null || outerLoops[outerIndex].label === node.label)
                        target = outerLoops[outerIndex];
                }
                if (target !== null)
                    break;
            }
        }
        if (target === null) {
            if (node.label !== null)
                this.error(node, 'the label \'@' + node.label + '\' does not denote a loop.');
            this.error(node, '\'' + node.kind + '\' and \'continue\' are only allowed inside a loop.'.replace('\'continue\' and \'continue\'', '\'break\' and \'continue\''));
        }
        node.loopTarget = target;
        node.nonLocal = crossesLambda;
        if (crossesLambda)
            target.nonLocalJumps = true;
        void scope;
    };

    // --- Returns

    Checker.prototype.returnStatement = function (node, scope) {
        var fn = this.fn;
        var target = null;
        var crossed = [];
        if (node.label !== null) {
            for (var current = fn; current !== null; current = current.parent) {
                if (current.label === node.label || (current.sym !== null && current.sym !== undefined && current.sym.name === node.label &&
                                                     current.kind === 'function')) {
                    target = current;
                    break;
                }
                crossed.push(current);
            }
            if (target === null)
                this.error(node, 'unresolved label.');
        } else {
            for (var outer = fn; outer !== null; outer = outer.parent) {
                if (outer.kind !== 'lambda') {
                    target = outer;
                    break;
                }
                crossed.push(outer);
            }
            if (target === null)
                this.error(node, '\'return\' is not allowed here.');
        }
        if (target.kind === 'init' || target.kind === 'property')
            this.error(node, '\'return\' is not allowed here.');
        crossed.forEach(function (lambda) {
            if (!lambda.inline)
                this.error(node, '\'return\' is not allowed here.');
        }, this);
        node.targetFn = target;
        node.nonLocal = crossed.length > 0;
        if (node.nonLocal)
            target.nonLocalReturns = true;
        var expected = target.returns;
        if (node.value === null) {
            if (expected !== null && !Kt.isClass(expected, 'Unit') && Kt.resolved(expected).kind !== 'ivar' && target.kind !== 'run')
                this.error(node, 'this function must return a value of type ' + Kt.typeString(expected) + '.');
            if (target.kind === 'lambda')
                target.returnTypes.push({ type: Kt.unitType(), node: node });
            return;
        }
        if (target.kind === 'run')
            this.error(node, '\'return\' is not allowed here.');
        var known = expected !== null && Kt.resolved(expected).kind !== 'ivar' ? expected : null;
        var type = this.expr(node.value, known, scope);
        if (known !== null) {
            if (!this.fits(node.value, type, known))
                this.mismatch(node.value, known, type, 'return');
        }
        if (target.returnTypes !== undefined)
            target.returnTypes.push({ type: type, node: node.value });
    };

    // --- Function literals

    // A lambda or an anonymous function with an expected function type
    // (or a SAM interface); inlineContext.inline - an argument of an inline
    // function (non-local returns are allowed).
    Checker.prototype.functionLiteral = function (node, expected, scope, inlineContext) {
        while (node.k === 'paren')
            node = node.expr;
        var expectedFn = null;
        var resolvedExpected = expected === null || expected === undefined ? null : Kt.resolved(expected);
        if (resolvedExpected !== null) {
            if (resolvedExpected.kind === 'fun')
                expectedFn = resolvedExpected;
            else if (resolvedExpected.kind === 'class') {
                var sam = Kt.samType(resolvedExpected);
                if (sam !== null) {
                    expectedFn = sam.type;
                    node.samConversion = sam;
                }
            }
        }
        if (node.k === 'anonfun')
            return this.anonymousFunction(node, expectedFn, scope);
        return this.lambda(node, expectedFn, scope, inlineContext || { inline: false });
    };

    Checker.prototype.lambda = function (node, expectedFn, scope, inlineContext) {
        var self = this;
        var lambdaScope = scope.child('lambda', { inlineLambda: !!inlineContext.inline, suspend: expectedFn !== null && expectedFn.suspend });
        var params = [];
        var receiverType = expectedFn !== null ? expectedFn.receiver : null;
        var expectedParams = expectedFn !== null ? expectedFn.params : null;
        if (node.params === null) {
            // it
            if (expectedParams !== null && expectedParams.length === 1) {
                var itType = this.finalType(expectedParams[0]);
                var it = Kt.VarSym('it', itType, false);
                it.isParam = true;
                it.initialized = true;
                this.declareLocal(lambdaScope, it, node);
                params.push({ sym: it });
            } else if (expectedParams !== null && expectedParams.length > 1) {
                this.error(node, 'expected ' + expectedParams.length + ' parameters of types ' + expectedParams.map(Kt.typeString).join(', ') + '.');
            }
        } else {
            if (expectedParams !== null && expectedParams.length !== node.params.length)
                this.error(node, 'expected ' + expectedParams.length + ' parameter' + (expectedParams.length === 1 ? '' : 's') +
                           ' of type' + (expectedParams.length === 1 ? ' ' : 's ') + expectedParams.map(Kt.typeString).join(', ') + '.');
            node.params.forEach(function (param, index) {
                var type = param.type !== null ? self.resolveType(param.type, scope)
                                               : (expectedParams !== null ? self.finalType(expectedParams[index]) : null);
                if (type === null)
                    self.error(param, 'cannot infer a type for this parameter. Please specify it explicitly.');
                if (param.destructure !== null) {
                    var holder = Kt.VarSym('$destructured' + index, type, false);
                    holder.isParam = true;
                    holder.initialized = true;
                    self.declareLocal(lambdaScope, holder, param);
                    var components = param.destructure.map(function (part, partIndex) {
                        var componentType = Kt.nullableAny();
                        var result = null;
                        if (part.name !== '_') {
                            var argNode = { k: 'delegateArg', type: type, line: part.line, column: part.column };
                            result = self.operatorCall({ k: 'componentCall', line: part.line, column: part.column },
                                                       'component' + (partIndex + 1), argNode, type, [], scope, null);
                            componentType = result.type;
                        }
                        if (part.type !== null)
                            componentType = self.resolveType(part.type, scope);
                        var variable = Kt.VarSym(part.name, componentType, false);
                        variable.initialized = true;
                        self.declareLocal(lambdaScope, variable, part);
                        part.sym = variable;
                        return { call: result, sym: variable };
                    });
                    params.push({ sym: holder, components: components });
                    return;
                }
                var variable = Kt.VarSym(param.name, type, false);
                variable.isParam = true;
                variable.initialized = true;
                self.declareLocal(lambdaScope, variable, param);
                params.push({ sym: variable });
            });
        }
        var receiver = null;
        if (receiverType !== null && receiverType !== undefined) {
            // Variables without bounds stay: builder inference (sequence { yield(1) }).
            var receiverVars = Kt.freeVars(receiverType).filter(function (ivar) {
                var base = ivar.base || ivar;
                return base.eq.length + base.lower.length + base.upper.length === 0;
            });
            if (receiverVars.length === 0)
                receiverType = this.finalType(receiverType);
            receiver = { type: receiverType, kind: 'lambda', label: node.label || inlineContext.label || null, lambda: node };
            lambdaScope.receiver = receiver;
        }
        var expectedReturn = expectedFn !== null ? Kt.resolved(expectedFn.returns) : null;
        var knownReturn = expectedReturn !== null && expectedReturn.kind !== 'ivar' && !Kt.hasFreeVars(expectedReturn) ? expectedReturn : null;
        var context = this.pushFunction({ kind: 'lambda', sym: null, returns: knownReturn !== null ? knownReturn : (expectedReturn || null),
                                          label: node.label || inlineContext.label || null, inline: !!inlineContext.inline,
                                          node: node, returnTypes: [], scope: lambdaScope,
                                          suspend: expectedFn !== null && expectedFn.suspend });
        var savedFacts = this.cloneFacts();
        // Smart casts of vars do not enter a lambda that is not inline.
        if (!inlineContext.inline) {
            var self2 = this;
            Array.from(this.facts.keys()).forEach(function (key) {
                if (typeof key === 'object' && key !== null && key.mutable)
                    self2.facts.delete(key);
            });
        }
        var bodyType = this.lambdaBody(node, knownReturn, lambdaScope);
        this.popFunction();
        this.facts = savedFacts;
        var returnType;
        if (knownReturn !== null) {
            returnType = knownReturn;
        } else {
            var types = context.returnTypes.map(function (item) { return item.type; });
            if (!node.bodyJumps || types.length === 0)
                types.push(bodyType);
            returnType = Kt.commonSupertype(types);
            if (Kt.resolved(returnType).kind === 'nothing' && !node.bodyJumps && types.length > 0)
                returnType = Kt.resolved(returnType);
        }
        node.lambdaInfo = { params: params, receiver: receiver, returns: returnType, context: context, inline: !!inlineContext.inline,
                        suspend: expectedFn !== null && expectedFn.suspend };
        var fnType = Kt.funType(receiverType || null, params.map(function (param) { return param.sym.type; }), returnType, false,
                                expectedFn !== null && expectedFn.suspend);
        return fnType;
    };

    // The statements of a lambda; the last one is the value.
    Checker.prototype.lambdaBody = function (node, knownReturn, scope) {
        var statements = node.statements;
        var type = Kt.unitType();
        var unitExpected = knownReturn !== null && Kt.isClass(knownReturn, 'Unit');
        for (var index = 0; index < statements.length; ++index) {
            var statement = statements[index];
            var last = index === statements.length - 1;
            if (last && this.isExpression(statement) && !unitExpected) {
                type = this.expr(statement, knownReturn, scope);
                node.lastValue = statement;
                var literal = this.literalValue(statement);
                node.literalReturn = literal;
                if (knownReturn !== null && !Kt.isJump(type) && !this.fits(statement, type, knownReturn)) {
                    var sam = Kt.samType(knownReturn);
                    if (!(sam !== null && Kt.resolved(type).kind === 'fun'))
                        this.mismatch(statement, knownReturn, type, 'return');
                }
                node.returnChecked = knownReturn !== null;
                if (Kt.isJump(type))
                    node.bodyJumps = true;
            } else {
                var statementType = this.statement(statement, scope);
                if (last && Kt.isJump(statementType))
                    node.bodyJumps = true;
                if (last)
                    type = Kt.isJump(statementType) ? Kt.NOTHING : Kt.unitType();
            }
        }
        if (statements.length === 0)
            type = Kt.unitType();
        return type;
    };

    // The return type of a lambda with given parameter types, without keeping
    // anything (overloads by the return type of a lambda).
    Checker.prototype.lambdaProbe = function (node, fnType, scope) {
        var savedFn = this.fn;
        var savedFacts = this.cloneFacts();
        var savedFunctions = this.functions.length;
        try {
            var type = this.functionLiteral(node, Kt.funType(fnType.receiver, fnType.params, Kt.inferenceVar(Kt.TypeParamSym('R', null)),
                                                             false, fnType.suspend), scope, { inline: true });
            var lambdaNode = node;
            while (lambdaNode.k === 'paren')
                lambdaNode = lambdaNode.expr;
            return { type: Kt.resolved(type).returns, literal: lambdaNode.literalReturn };
        } catch (error) {
            if (!(error instanceof T.CompileError))
                throw error;
            return null;
        } finally {
            this.fn = savedFn;
            this.facts = savedFacts;
            this.functions.length = savedFunctions;
        }
    };

    Checker.prototype.anonymousFunction = function (node, expectedFn, scope) {
        var self = this;
        var fnScope = scope.child('function', { suspend: false });
        var receiverType = null;
        if (node.receiver !== null)
            receiverType = this.resolveType(node.receiver, scope);
        else if (expectedFn !== null && expectedFn.receiver !== null)
            receiverType = expectedFn.receiver;
        var params = node.params.map(function (param, index) {
            var type = param.type !== null ? self.resolveType(param.type, scope)
                                           : (expectedFn !== null && expectedFn.params[index] !== undefined ? self.finalType(expectedFn.params[index]) : null);
            if (type === null)
                self.error(param, 'cannot infer a type for this parameter. Please specify it explicitly.');
            var variable = Kt.VarSym(param.name, type, false);
            variable.isParam = true;
            variable.initialized = true;
            self.declareLocal(fnScope, variable, param);
            return { sym: variable };
        });
        if (receiverType !== null)
            fnScope.receiver = { type: receiverType, kind: 'extension', label: null };
        var returns = node.returns !== null ? this.resolveType(node.returns, scope) : (node.exprBody ? null : Kt.unitType());
        var context = this.pushFunction({ kind: 'function', sym: null, returns: returns, label: null, node: node, returnTypes: [],
                                          scope: fnScope });
        var type;
        if (node.exprBody) {
            type = this.expr(node.body, returns, fnScope);
            if (returns !== null && !this.fits(node.body, type, returns))
                this.mismatch(node.body, returns, type, 'return');
            if (returns === null)
                returns = type;
        } else {
            var bodyType = this.blockValue(node.body, null, fnScope, false);
            if (returns !== null && !Kt.isClass(returns, 'Unit') && !Kt.isJump(bodyType))
                this.error({ line: node.body.endLine || node.line, column: 1 }, 'missing return statement.');
        }
        this.popFunction();
        node.lambdaInfo = { params: params, receiver: receiverType !== null ? fnScope.receiver : null, returns: returns, context: context,
                        anonymous: true };
        return Kt.funType(receiverType, params.map(function (param) { return param.sym.type; }), returns, false, false);
    };

    // The function being checked: a stack with the parent.
    Checker.prototype.pushFunction = function (context) {
        context.parent = this.fn;
        context.calls = [];
        context.loops = null;
        context.nonLocalReturns = false;
        this.fn = context;
        this.functions.push(context);
        return context;
    };

    Checker.prototype.popFunction = function () {
        this.fn = this.fn.parent;
    };

    // --- Callable references

    // ::foo, Foo::bar, value::bar, ::Foo, Foo::class.
    Checker.prototype.referenceExpr = function (node, expected, scope) {
        node.checked = true;
        if (node.name === 'class')
            return this.classReference(node, scope);
        var expectedFn = expected !== null && expected !== undefined ? Kt.resolved(expected) : null;
        if (expectedFn !== null && expectedFn.kind === 'class') {
            var sam = Kt.samType(expectedFn);
            if (sam !== null) {
                node.samConversion = sam;
                expectedFn = sam.type;
            }
        }
        if (expectedFn !== null && expectedFn.kind !== 'fun')
            expectedFn = null;
        var candidates = this.referenceCandidates(node, scope);
        if (candidates.length === 0)
            this.error({ line: node.nameLine, column: node.nameColumn }, 'unresolved reference \'' + node.name + '\'.');
        var self = this;
        var fitting = candidates.filter(function (candidate) {
            if (expectedFn === null)
                return true;
            return self.referenceType(candidate, expectedFn) !== null;
        });
        if (fitting.length === 0)
            fitting = candidates;
        // A member beats an extension (Int::toString).
        var members = fitting.filter(function (candidate) { return !candidate.extension; });
        if (members.length > 0 && members.length < fitting.length)
            fitting = members;
        if (fitting.length > 1 && expectedFn === null) {
            var functions = fitting.filter(function (candidate) { return candidate.member.kind === 'fun'; });
            if (functions.length > 1)
                this.error({ line: node.nameLine, column: node.nameColumn }, 'overload resolution ambiguity between candidates:\n' +
                           functions.map(function (candidate) { return self.signatureText(candidate.member); }).join('\n'));
        }
        var chosen = fitting[0];
        var type = this.referenceType(chosen, expectedFn) || this.referenceType(chosen, null);
        node.ref = chosen;
        return type;
    };

    // The candidates of a reference: { member, map, bound (a receiver node), unbound (a receiver type), ctorOf }.
    Checker.prototype.referenceCandidates = function (node, scope) {
        var self = this;
        var name = node.name;
        var result = [];
        if (node.receiver === null) {
            var levels = this.implicitLevels(name, scope);
            for (var index = 0; index < levels.length && result.length === 0; ++index) {
                levels[index].forEach(function (item) {
                    if (item.classRef !== undefined) {
                        self.constructorsOf(item.classRef).forEach(function (ctor) {
                            result.push({ member: ctor, map: new Map(), ctorOf: item.classRef });
                        });
                        return;
                    }
                    if (item.variable !== undefined)
                        return;
                    var member = item.member || item.fn;
                    if (member !== undefined)
                        result.push({ member: member, map: item.map || new Map(), implicit: item.implicit || null,
                                      extensionReceiver: member.receiver });
                });
            }
            return result;
        }
        var qualifier = this.qualifier(node.receiver, scope);
        if (qualifier !== null && qualifier.kind === 'class') {
            var cls = qualifier.sym;
            var classType = this.genericReceiverType(node.receiver, cls, scope);
            this.membersOf(classType, name).forEach(function (item) {
                result.push({ member: item.member, map: item.map, unbound: classType });
            });
            this.visibleExtensions(name, scope).concat(this.visibleExtensionProperties(name, scope)).forEach(function (member) {
                result.push({ member: member, map: new Map(), unbound: classType, extension: true });
            });
            this.staticsOf(cls, name).forEach(function (item) {
                result.push({ member: item.member, map: item.map, staticOf: cls });
            });
            return result;
        }
        var receiverType = this.expr(node.receiver, null, scope);
        this.membersOf(receiverType, name).forEach(function (item) {
            result.push({ member: item.member, map: item.map, bound: node.receiver, boundType: receiverType });
        });
        this.visibleExtensions(name, scope).concat(this.visibleExtensionProperties(name, scope)).forEach(function (member) {
            result.push({ member: member, map: new Map(), bound: node.receiver, boundType: receiverType, extension: true });
        });
        return result;
    };

    Checker.prototype.genericReceiverType = function (node, cls, scope) {
        if (node.typeArgs !== undefined && node.typeArgs !== null) {
            var args = this.typeArguments(node.typeArgs, scope);
            return Kt.classType(cls, args.map(function (arg) { return Kt.arg(arg); }));
        }
        return Kt.classType(cls, cls.typeParams.map(function (param) { return Kt.arg(Kt.paramType(param)); }));
    };

    // The function type of a reference, fitting expected (or null).
    Checker.prototype.referenceType = function (candidate, expected) {
        var member = candidate.member;
        var params = [];
        var returns;
        var map = new Map(candidate.map);
        var typeParams = member.typeParams || [];
        if (candidate.ctorOf !== undefined)
            typeParams = candidate.ctorOf.typeParams.concat(typeParams);
        if (candidate.unbound !== undefined && candidate.unbound.kind === 'class') {
            candidate.unbound.sym.typeParams.forEach(function (param) {
                if (!map.has(param))
                    map.set(param, Kt.paramType(param));
            });
        }
        var mark = Kt.markBounds();
        var ivars = typeParams.map(function (param) {
            var ivar = Kt.inferenceVar(param);
            map.set(param, ivar);
            return ivar;
        });
        var receiverParam = null;
        if (candidate.unbound !== undefined)
            receiverParam = candidate.extension ? Kt.subst(member.receiver, map) : candidate.unbound;
        if (candidate.extension && candidate.bound !== undefined) {
            if (!Kt.isSubtype(candidate.boundType, Kt.subst(member.receiver, map))) {
                Kt.rollbackBounds(mark);
                return null;
            }
        }
        // Int::toString: an extension for the class of the qualifier.
        if (candidate.extension && candidate.unbound !== undefined && !Kt.isSubtype(candidate.unbound, receiverParam)) {
            Kt.rollbackBounds(mark);
            return null;
        }
        if (member.kind === 'fun') {
            params = member.params.map(function (param) { return Kt.subst(param.vararg ? Kt.varargElement(param.type) : param.type, map); });
            returns = member.isCtor ? Kt.classType(candidate.ctorOf, candidate.ctorOf.typeParams.map(function (param) {
                return Kt.arg(map.get(param));
            })) : Kt.subst(member.returns !== null ? member.returns : this.returnType(member), map);
        } else {
            returns = Kt.subst(this.propertyType(member), map);
        }
        if (receiverParam !== null)
            params = [receiverParam].concat(params);
        if (expected !== null) {
            var expectedParams = Kt.funParams(expected);
            if (expectedParams.length !== params.length) {
                Kt.rollbackBounds(mark);
                return null;
            }
            for (var index = 0; index < params.length; ++index) {
                if (!Kt.isSubtype(expectedParams[index], params[index])) {
                    Kt.rollbackBounds(mark);
                    return null;
                }
            }
            if (!Kt.isClass(expected.returns, 'Unit') && !Kt.isSubtype(returns, expected.returns)) {
                Kt.rollbackBounds(mark);
                return null;
            }
        }
        var self = this;
        ivars.forEach(Kt.fixVar);
        params = params.map(function (param) { return self.finalType(param); });
        returns = this.finalType(returns);
        candidate.params = params;
        candidate.returns = returns;
        Kt.commitBounds();
        return Kt.funType(null, params, returns, false, !!member.suspend);
    };

    // A reference argument fits a parameter type (applicability).
    Checker.prototype.referenceFits = function (node, paramType, scope) {
        var target = Kt.resolved(paramType);
        if (target.kind === 'ivar' || target.kind === 'param')
            return true;
        if (node.name === 'class')
            return true;
        var expectedFn = target.kind === 'fun' ? target : null;
        if (expectedFn === null && target.kind === 'class') {
            if (target.sym === Kt.builtins.Any || target.sym === Kt.builtins.Function)
                return true;
            var sam = Kt.samType(target);
            if (sam === null)
                return target.sym.name.indexOf('KProperty') === 0 || target.sym.name.indexOf('KFunction') === 0;
            expectedFn = sam.type;
        }
        if (expectedFn === null)
            return false;
        var candidates;
        try {
            candidates = this.referenceCandidates(node, scope);
        } catch (error) {
            if (!(error instanceof T.CompileError))
                throw error;
            return false;
        }
        var self = this;
        return candidates.some(function (candidate) {
            var count = (candidate.member.kind === 'fun' ? candidate.member.params.length : 0) + (candidate.unbound !== undefined ? 1 : 0);
            return count === Kt.funParams(expectedFn).length;
        }) || candidates.length === 0 && false;
        void self;
    };

    // Foo::class, value::class: KClass<Foo>.
    Checker.prototype.classReference = function (node, scope) {
        var qualifier = node.receiver !== null ? this.qualifier(node.receiver, scope) : null;
        var type;
        if (qualifier !== null && (qualifier.kind === 'class' || qualifier.kind === 'object')) {
            type = Kt.classType(qualifier.sym, qualifier.sym.typeParams.map(function () { return Kt.STAR; }));
            node.classOf = qualifier.sym;
        } else if (node.receiver !== null && node.receiver.k === 'name' && this.lookupTypeName(node.receiver.name, scope, null, true) !== null &&
                   this.lookupTypeName(node.receiver.name, scope, null, true).kind === 'tparam') {
            var param = this.lookupTypeName(node.receiver.name, scope, null, true);
            if (!param.reified)
                this.error(node, 'cannot use \'' + param.name + '\' as reified type parameter. Use a class instead.');
            type = Kt.paramType(param);
            node.reifiedOf = param;
        } else if (node.receiver !== null) {
            type = Kt.makeNotNull(this.expr(node.receiver, null, scope));
            node.valueClass = true;
        } else {
            this.error(node, 'unresolved reference \'class\'.');
        }
        return Kt.builtinType('KClass', [Kt.arg(type, node.valueClass ? 'out' : '')]);
    };

    // --- Object expressions

    Checker.prototype.objectExpression = function (node, scope) {
        var decl = node.decl;
        var sym = this.enterClass(decl, null, scope, '', false);
        sym.anonymous = true;
        sym.isLocal = true;
        sym.declScope = scope;
        sym.localFunction = this.fn;
        sym.name = '<anonymous>';
        sym.displayName = '<anonymous>';
        sym.complete();
        this.checkClassBody(sym);
        node.sym = sym;
        // The anonymous type itself: its members are seen where it is declared.
        return Kt.classType(sym, []);
    };
})(globalThis);
