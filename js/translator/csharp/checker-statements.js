// C#: binding statements - blocks and locals, local functions, loops,
// foreach over arrays, strings and enumerators, switch, try, using, lock,
// yield; reachability (not all code paths return a value, fall through
// in switch).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    var C = CS.Checker.prototype;
    if (C.bindBlock)
        return;

    var bound = CS.bound;
    var Conversions = CS.Conversions;

    // --- Locals

    // A new local in a scope: names may not repeat in the scope or in the
    // enclosing scopes of the same function.
    C.declareLocal = function (name, type, scope, node, kind) {
        if (name === '_' && (kind === 'pattern' || kind === 'outvar'))
            return CS.LocalSymbol('_', type, kind);
        for (var current = scope; current !== null; current = current.parent) {
            if (current.locals !== null && current.locals[name] !== undefined) {
                var existing = current.locals[name];
                if (current === scope)
                    this.error(node, 'CS0128', "A local variable or function named '" + name + "' is already defined in this scope");
                if (existing.kind !== 'localFunction' && existing.kind !== 'range')
                    this.error(node, 'CS0136', "A local or parameter named '" + name +
                               "' cannot be declared in this scope because that name is used in an enclosing local scope to define a local or parameter");
            }
            if (current.kind === 'type' || current.kind === 'namespace' || current.kind === 'lambda' ||
                (current.kind === 'method' && current.fn && current.fn.kind === 'local'))
                break;
        }
        var local = CS.LocalSymbol(name, type, kind || 'local');
        local.node = node;
        scope.declare(local);
        var blockScope = scope;
        (blockScope.declared = blockScope.declared || []).push(local);
        return local;
    };

    // --- Blocks

    C.bindBlock = function (node, scope, options) {
        var blockScope = scope.child('block', {});
        if (options && options.checked !== undefined)
            blockScope.checked = options.checked;
        var statements = this.bindStatementList(node.statements, blockScope);
        return bound('block', node, { statements: statements, locals: blockScope.declared || [] });
    };

    // The statements of a block: local functions are known from the start,
    // a using declaration takes the rest of the block as its body.
    C.bindStatementList = function (nodes, scope) {
        var self = this;
        this.declareLabels(nodes, scope);
        nodes.forEach(function (node) {
            if (node.k === 'localFunction')
                self.declareLocalFunction(node, scope);
        });
        var result = [];
        for (var index = 0; index < nodes.length; ++index) {
            var node = nodes[index];
            if (node.k === 'local' && node.isUsing) {
                var resources = this.usingDeclaration(node, scope);
                var rest = this.bindStatementList(nodes.slice(index + 1), scope);
                result.push(bound('using', node, { resources: resources, body: bound('block', node, { statements: rest, locals: [] }),
                                                   isAwait: !!node.isAwaitUsing, declaration: true }));
                return result;
            }
            result.push(this.bindStatement(node, scope));
        }
        return result;
    };

    C.bindStatement = function (node, scope) {
        var method = this['stmt_' + node.k];
        if (method === undefined)
            this.error(node, 'CS1525', "Invalid statement '" + node.k + "'");
        return method.call(this, node, scope);
    };

    C.stmt_block = function (node, scope) {
        return this.bindBlock(node, scope);
    };

    C.stmt_empty = function (node) {
        return bound('empty', node, {});
    };

    C.stmt_expr = function (node, scope) {
        var expr = this.bindExpr(node.expr, scope);
        if (expr.k !== 'call' && expr.k !== 'delegateCall' && expr.k !== 'nothing' && expr.k !== 'dynamicCall')
            expr = this.requireValueOrVoid(expr, node.expr);
        if (!this.isStatementExpression(node.expr, expr) && !node.valueAllowed)
            this.error(node, 'CS0201', 'Only assignment, call, increment, decrement, await, and new object expressions can be used as a statement');
        return bound('expr', node, { expr: expr });
    };

    // Type a = 1, b; var c = ...; const int d = 2;
    C.stmt_local = function (node, scope) {
        var self = this;
        var declared = node.type === null ? null : this.resolveType(node.type, scope, { allowVar: true });
        if (declared !== null && declared.kind === 'named' && declared.sym.isStatic())
            this.error(node.type, 'CS0723', "Cannot declare a variable of static type '" + CS.typeName(declared) + "'");
        if (node.isConst && declared === null)
            this.error(node, 'CS0822', 'Implicitly-typed variables cannot be constant');
        if (node.refKind && node.refKind !== '')
            return this.refLocal(node, scope, declared);
        var declarations = node.vars.map(function (variable) {
            if (node.isConst) {
                var constant = self.declareLocal(variable.name, declared, scope, variable, 'constant');
                constant.isConst = true;
                constant.init = variable.init;
                constant.scope = scope;
                if (variable.init === null)
                    self.error(variable, 'CS0145', 'A const field requires a value to be provided');
                self.localConstant(constant);
                return null;
            }
            var type = declared;
            var init = null;
            if (type === null) {
                if (variable.init === null)
                    self.error(variable, 'CS0818', 'Implicitly-typed variables must be initialized');
                if (variable.init.k === 'arrayInit')
                    self.error(variable, 'CS0820', 'Cannot initialize an implicitly-typed variable with an array initializer');
                if (node.vars.length > 1)
                    self.error(node, 'CS0819', 'Implicitly-typed variables cannot have multiple declarators');
                var value = self.bindExpr(variable.init, scope);
                if (value.k === 'literal' && value.type.kind === 'null')
                    self.error(variable, 'CS0815', "Cannot assign <null> to an implicitly-typed variable");
                if (value.k === 'methodGroup' && self.naturalMethodGroupType(value) === null)
                    self.error(variable, 'CS8917', 'The delegate type could not be inferred.');
                value = self.requireValue(value, variable.init);
                if (value.type.kind === 'void')
                    self.error(variable, 'CS0815', "Cannot assign void to an implicitly-typed variable");
                init = value;
                type = value.type;
            } else if (variable.init !== null) {
                init = variable.init.k === 'arrayInit' ? self.bindArrayInitializer(variable.init, type, scope)
                                                      : self.bindAs(variable.init, scope, type);
            }
            var local = self.declareLocal(variable.name, type, scope, variable, 'local');
            local.assigned = init !== null;
            return bound('localDecl', variable, { sym: local, init: init });
        }).filter(function (item) { return item !== null; });
        if (declarations.length === 1)
            return declarations[0];
        return bound('declarations', node, { list: declarations });
    };

    // ref int r = ref x;
    C.refLocal = function (node, scope, declared) {
        var variable = node.vars[0];
        if (variable.init === null || variable.init.k !== 'refExpr')
            this.error(variable, 'CS8174', 'A declaration of a by-reference variable must have an initializer');
        var target = this.bindValue(variable.init.expr, scope);
        if (!this.isRefVariable(target))
            this.error(variable.init, 'CS1510', 'A ref or out value must be an assignable variable');
        var type = declared === null ? target.type : declared;
        var local = this.declareLocal(variable.name, type, scope, variable, 'local');
        local.refKind = 'ref';
        return bound('refLocalDecl', variable, { sym: local, target: target });
    };

    // var (a, b) = value;
    C.stmt_deconstructDecl = function (node, scope) {
        var value = this.bindValue(node.init, scope);
        var targets = this.deconstructionTargets(node.designation, value.type, scope, node, null);
        return bound('expr', node, { expr: bound('deconstruct', node, { targets: targets, value: value, type: CS.VOID }) });
    };

    // The targets of a deconstruction by a designation or a tuple of
    // declarations/variables; each part gets its type from the value.
    C.deconstructionTargets = function (designation, type, scope, node, declaredType) {
        var self = this;
        if (designation.k === 'discard')
            return { kind: 'discard', type: type };
        if (designation.k === 'single') {
            var local = this.declareLocal(designation.name, declaredType || type, scope, designation, 'local');
            local.assigned = true;
            var target = bound('local', designation, { sym: local, type: local.type });
            if (declaredType !== null && declaredType !== undefined && !CS.sameType(declaredType, type))
                return { kind: 'variable', target: target, conversion: this.convert(bound('placeholder', node, { type: type }),
                                                                                    declaredType, designation, false) };
            return { kind: 'variable', target: target, declares: local };
        }
        var parts = this.deconstructParts(type, designation.items.length, node, scope);
        return { kind: 'nested', type: type, deconstructor: parts.method, items: designation.items.map(function (item, index) {
            return self.deconstructionTargets(item, parts.types[index], scope, node, null);
        }) };
    };

    // How a value splits into count parts: a tuple, or a Deconstruct method
    // with out parameters. { types, method (or null for a tuple) }.
    C.deconstructParts = function (type, count, node, scope) {
        if (CS.isTuple(type)) {
            var elements = CS.tupleElements(type);
            if (elements.length !== count)
                this.error(node, 'CS8132', "Cannot deconstruct a tuple of '" + elements.length + "' elements into '" + count + "' variables.");
            return { types: elements, method: null };
        }
        var found = this.accessible(CS.lookupMembers(type, 'Deconstruct'), scope.currentType()).filter(function (entry) {
            return entry.member.symbolKind === 'method' && entry.member.params.length === count &&
                entry.member.params.every(function (param) { return param.refKind === 'out'; });
        });
        var extension = false;
        if (found.length === 0) {
            found = this.extensionCandidates('Deconstruct', scope).filter(function (entry) {
                return entry.member.params.length === count + 1 && entry.member.params.slice(1).every(function (param) {
                    return param.refKind === 'out';
                });
            });
            extension = found.length > 0;
        }
        if (found.length === 0)
            this.error(node, 'CS8129', "No suitable 'Deconstruct' instance or extension method was found for type '" + CS.typeName(type) +
                       "', with " + count + " out parameters and a void return type.");
        var entry = found[0];
        var map = CS.typeMap(entry.owner);
        if (extension && entry.member.typeParams.length > 0) {
            var inferred = this.inferTypeArguments(entry.member, map, [{ name: null, refKind: '', outDecl: null,
                                                                         expr: { k: 'placeholder', type: type } }], [0], false, scope);
            if (inferred !== null)
                entry.member.typeParams.forEach(function (param, index) { map.set(param, inferred[index]); });
        }
        var params = extension ? entry.member.params.slice(1) : entry.member.params;
        return { types: params.map(function (param) { return CS.subst(param.type, map); }),
                 method: { method: entry.member, owner: entry.owner, extension: extension, typeArgs: extension && entry.member.typeParams.length > 0
                     ? entry.member.typeParams.map(function (param) { return map.get(param); }) : [] } };
    };

    // (a, b) = value and (int x, var y) = value.
    C.bindDeconstructAssignment = function (node, scope) {
        var value = this.bindExpr(node.value, scope);
        if (value.k === 'tupleLiteral')
            value = this.naturalTuple(value, node.value);
        value = this.requireValue(value, node.value);
        var targets = this.assignmentTargets(node.target, value.type, scope, node);
        return bound('deconstruct', node, { targets: targets, value: value, type: value.type });
    };

    C.assignmentTargets = function (target, type, scope, node) {
        var self = this;
        if (target.k === 'tuple') {
            var parts = this.deconstructParts(type, target.items.length, node, scope);
            return { kind: 'nested', type: type, deconstructor: parts.method, items: target.items.map(function (item, index) {
                return self.assignmentTargets(item.expr, parts.types[index], scope, node);
            }) };
        }
        if (target.k === 'declExpr') {
            var declared = target.type === null ? null : this.resolveType(target.type, scope);
            return this.deconstructionTargets(target.designation, type, scope, node, declared);
        }
        var variable = this.bindExpr(target, scope);
        if (variable.k === 'discard')
            return { kind: 'discard', type: type };
        variable = this.requireValue(variable, target);
        this.checkAssignable(variable, target, scope);
        return { kind: 'variable', target: variable, conversion: this.convert(bound('placeholder', target, { type: type }),
                                                                              variable.type, target, false) };
    };

    // --- Local functions

    C.declareLocalFunction = function (node, scope) {
        var mods = node.mods || {};
        var method = CS.MethodSymbol(node.name, scope.currentType() || null, mods);
        method.isLocal = true;
        method.node = node;
        method.isStatic = true;
        method.isStaticLocal = !!mods.static;
        var methodScope = this.methodScope(method, scope, node.typeParams);
        this.declareConstraints(method.typeParams, node.constraints, methodScope, method);
        method.returnType = this.resolveType(node.returnType, methodScope, { allowVoid: true });
        method.params = this.parameters(node.params, methodScope, method);
        method.scope = methodScope;
        method.outerScope = scope;
        var local = this.declareLocal(node.name, null, scope, node, 'localFunction');
        local.method = method;
        method.local = local;
        node.method = method;
        return method;
    };

    C.stmt_localFunction = function (node, scope) {
        var method = node.method || this.declareLocalFunction(node, scope);
        var fn = this.functionInfo(method, 'local', this.currentFunctionInfo(scope));
        fn.isStaticLocal = method.isStaticLocal;
        var bodyScope = method.scope;
        bodyScope.fn = fn;
        var body = this.bindFunctionBody(method, node, bodyScope, fn);
        return bound('localFunction', node, { method: method, body: body, fn: fn, params: method.paramLocals });
    };

    // --- Function bodies

    // The information of a function body for the checks of return, yield,
    // await and for the analysis of fibers.
    C.functionInfo = function (method, kind, parent) {
        var returnType = method.returnType;
        var fn = { kind: kind, method: method, isAsync: !!method.isAsync, returnType: returnType, declaredReturn: returnType,
                   iterator: false, elementType: null, returns: [], parent: parent || null, calls: [], usesThis: false,
                   infer: false };
        if (fn.isAsync) {
            if (returnType.kind === 'void')
                fn.asyncVoid = true;
            else if (this.isTaskType(returnType))
                fn.returnType = this.taskResultType(returnType);
            else if (!this.isAsyncEnumerable(returnType))
                this.error(method.node, 'CS1983', "The return type of an async method must be void, Task, Task<T>, a task-like type, IAsyncEnumerable<T>, or IAsyncEnumerator<T>");
        }
        return fn;
    };

    C.isTaskType = function (type) {
        return type.kind === 'named' && (type.sym.qname === 'System.Threading.Tasks.Task' ||
                                         type.sym.qname === 'System.Threading.Tasks.ValueTask');
    };

    // T of Task<T>; void for Task.
    C.taskResultType = function (type) {
        return type.args.length === 1 ? type.args[0] : CS.VOID;
    };

    C.isAsyncEnumerable = function (type) {
        return type.kind === 'named' && (type.sym.qname === 'System.Collections.Generic.IAsyncEnumerable' ||
                                         type.sym.qname === 'System.Collections.Generic.IAsyncEnumerator');
    };

    // The body of a method, a local function, an accessor: the parameters
    // as locals, iterators found by their yield statements.
    C.bindFunctionBody = function (method, node, scope, fn) {
        var self = this;
        var paramScope = scope.child('block', {});
        method.paramLocals = method.params.map(function (param) {
            if (param.name === '_' && method.isLocal === undefined && false)
                return null;
            var local = self.declareLocal(param.name, param.type, paramScope, param.node || node, 'param');
            local.refKind = param.refKind;
            local.param = param;
            local.assigned = param.refKind !== 'out';
            param.local = local;
            return local;
        });
        var bodyNode = node.body;
        var exprBody = node.expr || null;
        if (exprBody === null && node.exprBody !== undefined && node.exprBody !== null)
            exprBody = node.exprBody;
        if (bodyNode !== null && bodyNode !== undefined && containsYield(bodyNode))
            this.makeIterator(fn, method, node);
        this.registerFunction(fn, scope);
        var body;
        if (exprBody !== null) {
            var value;
            if (fn.returnType.kind === 'void' || fn.asyncVoid) {
                var bodyExpr = this.bindExpr(exprBody, paramScope);
                // void F() => throw ...;
                if (bodyExpr.k === 'throwExpr')
                    body = bound('block', exprBody, { statements: [bound('throw', exprBody, { expr: bodyExpr.expr })], locals: [] });
                else
                    body = bound('block', exprBody, { statements: [bound('expr', exprBody, { expr: this.requireValueOrVoid(bodyExpr, exprBody) })],
                                                      locals: [] });
            } else {
                value = this.bindAs(exprBody, paramScope, fn.returnType);
                body = bound('block', exprBody, { statements: [bound('return', exprBody, { expr: value })], locals: [] });
            }
        } else {
            body = this.bindBlock(bodyNode, paramScope);
            this.checkFunctionEnd(fn, body, node, 'method');
        }
        body.paramLocals = method.paramLocals;
        return body;
    };

    // yield in the body (not in nested lambdas and local functions).
    function containsYield(node) {
        var found = false;
        (function walk(current) {
            if (found || current === null || typeof current !== 'object')
                return;
            if (Array.isArray(current)) {
                current.forEach(walk);
                return;
            }
            if (current.k === 'yieldReturn' || current.k === 'yieldBreak') {
                found = true;
                return;
            }
            if (current.k === 'lambda' || current.k === 'localFunction')
                return;
            Object.keys(current).forEach(function (key) {
                if (key !== 'line' && key !== 'column')
                    walk(current[key]);
            });
        })(node);
        return found;
    }
    CS.containsYield = containsYield;

    // An iterator: IEnumerable<T>, IEnumerator<T> and the non-generic ones.
    C.makeIterator = function (fn, method, node) {
        var type = fn.declaredReturn;
        var name = type.kind === 'named' ? type.sym.qname : '';
        fn.iterator = true;
        if (fn.isAsync && this.isAsyncEnumerable(type)) {
            fn.elementType = type.args[0];
            fn.asyncIterator = true;
            fn.iteratorKind = 'asyncEnumerable';
            return;
        }
        if (name === 'System.Collections.Generic.IEnumerable' || name === 'System.Collections.Generic.IEnumerator') {
            fn.elementType = type.args[0];
        } else if (name === 'System.Collections.IEnumerable' || name === 'System.Collections.IEnumerator') {
            fn.elementType = CS.objectType();
        } else {
            this.error(method.nameLine ? { line: method.nameLine, column: 0 } : node, 'CS1624', "The body of '" + this.methodText(method) +
                       "' cannot be an iterator block because '" + CS.typeName(type) + "' is not an iterator interface type");
        }
        fn.iteratorKind = /Enumerator$/.test(name) ? 'enumerator' : 'enumerable';
        if (method.params.some(function (param) { return param.refKind !== ''; }))
            this.error(node, 'CS1623', 'Iterators cannot have ref, in or out parameters');
    };

    // A function that returns a value must not reach its end.
    C.checkFunctionEnd = function (fn, body, node, what) {
        if (fn.iterator || fn.asyncVoid)
            return;
        var returnType = fn.returnType;
        if (fn.infer || returnType === null || returnType.kind === 'void')
            return;
        if (this.flow(body, true, [])) {
            if (what === 'lambda')
                this.error(node, 'CS1643', "Not all code paths return a value in lambda expression of type '" +
                           CS.typeName(fn.delegateType || returnType) + "'");
            var method = fn.method;
            var line = method && method.node && method.node.nameLine ? { line: method.node.nameLine, column: 0 } : node;
            this.error(line, 'CS0161', "'" + this.methodText(method) + "': not all code paths return a value");
        }
    };

    // --- Statements

    C.stmt_if = function (node, scope) {
        var cond = this.bindCondition(node.cond, scope);
        var then = this.bindEmbedded(node.then, scope);
        var otherwise = node.otherwise !== null ? this.bindEmbedded(node.otherwise, scope) : null;
        return bound('if', node, { cond: cond, then: then, otherwise: otherwise });
    };

    // An embedded statement has its own scope for the variables it declares.
    C.bindEmbedded = function (node, scope) {
        var inner = scope.child('block', {});
        var statement = this.bindStatement(node, inner);
        if (inner.declared && inner.declared.length > 0 && statement.k !== 'block')
            return bound('block', node, { statements: [statement], locals: inner.declared });
        return statement;
    };

    C.stmt_while = function (node, scope) {
        var loopScope = scope.child('block', { breakable: true });
        var cond = this.bindCondition(node.cond, loopScope);
        var body = this.bindLoopBody(node.body, loopScope);
        return bound('while', node, { cond: cond, body: body, locals: loopScope.declared || [] });
    };

    C.stmt_do = function (node, scope) {
        var body = this.bindLoopBody(node.body, scope.child('block', {}));
        var condScope = scope.child('block', {});
        var cond = this.bindCondition(node.cond, condScope);
        return bound('do', node, { body: body, cond: cond, locals: condScope.declared || [] });
    };

    C.bindLoopBody = function (node, scope) {
        var inner = scope.child('block', { loop: true });
        var body = this.bindStatement(node, inner);
        if (inner.declared && inner.declared.length > 0 && body.k !== 'block')
            return bound('block', node, { statements: [body], locals: inner.declared });
        return body;
    };

    C.stmt_for = function (node, scope) {
        var self = this;
        var forScope = scope.child('block', {});
        var init = node.init.map(function (item) { return self.bindStatement(item, forScope); });
        init.forEach(function (item, index) {
            if (item.k === 'expr' && !self.isStatementExpression(node.init[index].expr, item.expr))
                self.error(node.init[index], 'CS0201', 'Only assignment, call, increment, decrement, await, and new object expressions can be used as a statement');
        });
        var cond = node.cond !== null ? this.bindCondition(node.cond, forScope) : null;
        var updates = node.updates.map(function (update) {
            var expr = self.requireValueOrVoid(self.bindExpr(update, forScope), update);
            if (!self.isStatementExpression(update, expr))
                self.error(update, 'CS0201', 'Only assignment, call, increment, decrement, await, and new object expressions can be used as a statement');
            return expr;
        });
        var body = this.bindLoopBody(node.body, forScope);
        return bound('for', node, { init: init, cond: cond, updates: updates, body: body, locals: forScope.declared || [] });
    };

    // foreach: arrays and strings by index, other collections by their
    // enumerator (GetEnumerator, MoveNext, Current).
    C.stmt_foreach = function (node, scope) {
        var collection = this.bindValue(node.expr, scope);
        var type = collection.type;
        var info = this.enumerationOf(type, node.expr, scope, node.isAwait);
        var loopScope = scope.child('block', { loop: true });
        var elementType = info.elementType;
        var variable = null, targets = null, conversion = null;
        if (node.designation !== null || node.deconstruct !== null) {
            if (node.designation !== null)
                targets = this.deconstructionTargets(node.designation, elementType, loopScope, node, null);
            else
                targets = this.assignmentTargets(node.deconstruct, elementType, loopScope, node);
        } else {
            var declared = node.type === null ? elementType : this.resolveType(node.type, scope);
            variable = this.declareLocal(node.name, declared, loopScope, node, 'foreach');
            variable.readonly = true;
            variable.assigned = true;
            if (!CS.sameType(declared, elementType)) {
                // The iteration variable may need an explicit conversion.
                conversion = this.convert(bound('placeholder', node, { type: elementType }), declared, node, true);
            }
        }
        var body = this.bindLoopBody(node.body, loopScope);
        return bound('foreach', node, { collection: collection, info: info, variable: variable, targets: targets,
                                        conversion: conversion, body: body, locals: loopScope.declared || [], isAwait: node.isAwait });
    };

    // How a type is enumerated: { kind: array|string|enumerator|dynamic,
    // elementType, getEnumerator, moveNext, current, dispose }.
    C.enumerationOf = function (type, node, scope, isAwait) {
        if (isAwait) {
            var asyncEnumerator = this.enumeratorPattern(type, node, scope, 'GetAsyncEnumerator', 'MoveNextAsync');
            if (asyncEnumerator !== null)
                return asyncEnumerator;
            this.error(node, 'CS8411', "Asynchronous foreach statement cannot operate on variables of type '" + CS.typeName(type) +
                       "' because '" + CS.typeName(type) + "' does not contain a suitable public instance or extension definition for 'GetAsyncEnumerator'");
        }
        if (type.kind === 'array')
            return { kind: 'array', elementType: type.elem, rank: type.rank };
        if (CS.isSpecial(type, 'string'))
            return { kind: 'string', elementType: CS.special('char') };
        if (type.kind === 'dynamic')
            return { kind: 'dynamic', elementType: CS.DYNAMIC };
        var pattern = this.enumeratorPattern(type, node, scope, 'GetEnumerator', 'MoveNext');
        if (pattern !== null)
            return pattern;
        // The interfaces: IEnumerable<T>, then IEnumerable.
        var ifaces = CS.interfacesOf(type);
        if (type.kind === 'named' && type.sym.kind === 'interface')
            ifaces = [type].concat(ifaces);
        var generic = ifaces.filter(function (iface) { return iface.sym.qname === 'System.Collections.Generic.IEnumerable'; });
        if (generic.length > 0)
            return this.enumeratorPattern(generic[0], node, scope, 'GetEnumerator', 'MoveNext');
        var plain = ifaces.filter(function (iface) { return iface.sym.qname === 'System.Collections.IEnumerable'; });
        if (plain.length > 0)
            return this.enumeratorPattern(plain[0], node, scope, 'GetEnumerator', 'MoveNext');
        this.error(node, 'CS1579', "foreach statement cannot operate on variables of type '" + CS.typeName(type) +
                   "' because '" + CS.typeName(type) + "' does not contain a public instance or extension definition for 'GetEnumerator'");
    };

    // The pattern: a public GetEnumerator() whose result has MoveNext() and
    // Current.
    C.enumeratorPattern = function (type, node, scope, getName, moveName) {
        // GetAsyncEnumerator(CancellationToken token = default) fits too.
        var found = CS.lookupMembers(type, getName).filter(function (entry) {
            return entry.member.symbolKind === 'method' && entry.member.access === 'public' && !entry.member.isStatic &&
                entry.member.params.every(function (param) { return param.hasDefault; });
        });
        var extension = false;
        if (found.length === 0) {
            found = this.extensionCandidates(getName, scope).filter(function (entry) {
                return entry.member.params.length === 1;
            });
            var self = this;
            found = found.filter(function (entry) {
                return self.applicability(entry, [{ name: null, refKind: '', outDecl: null, expr: { k: 'placeholder', type: type } }],
                                          null, scope, false).ok;
            });
            extension = found.length > 0;
        }
        if (found.length === 0)
            return null;
        var entry = found[0];
        var map = CS.typeMap(entry.owner);
        var typeArgs = [];
        if (extension && entry.member.typeParams.length > 0) {
            var inferred = this.inferTypeArguments(entry.member, map, [{ name: null, refKind: '', outDecl: null,
                                                                         expr: { k: 'placeholder', type: type } }], [0], false, scope);
            if (inferred !== null) {
                typeArgs = inferred;
                entry.member.typeParams.forEach(function (param, index) { map.set(param, inferred[index]); });
            }
        }
        var enumeratorType = CS.subst(entry.member.returnType, map);
        var move = CS.lookupMembers(enumeratorType, moveName).filter(function (item) {
            return item.member.symbolKind === 'method' && item.member.params.length === 0;
        });
        var current = CS.lookupMembers(enumeratorType, 'Current').filter(function (item) {
            return item.member.symbolKind === 'property';
        });
        if (move.length === 0 || current.length === 0)
            this.error(node, 'CS0117', "'" + CS.typeName(enumeratorType) + "' does not contain a public definition for 'Current'");
        var currentType = CS.subst(current[0].member.type, CS.typeMap(current[0].owner));
        var disposable = CS.libraryType('System.IDisposable');
        var dispose = Conversions.isImplicitReferenceOrBoxingOrIdentity(enumeratorType, disposable) ||
            CS.lookupMembers(enumeratorType, 'Dispose').length > 0;
        this.noteCall(scope, move[0].member);
        return { kind: 'enumerator', elementType: currentType, getEnumerator: entry, getTypeArgs: typeArgs, extension: extension,
                 moveNext: move[0], current: current[0], enumeratorType: enumeratorType, dispose: dispose,
                 isAsync: moveName === 'MoveNextAsync' };
    };

    C.stmt_switch = function (node, scope) {
        var self = this;
        var expr = this.bindValue(node.expr, scope);
        var switchScope = scope.child('block', { breakable: true, switchType: expr.type, sections: null });
        var seenConstants = [];
        var hasDefault = false;
        var sections = node.sections.map(function (section) {
            var sectionScope = switchScope.child('block', {});
            var labels = section.labels.map(function (label) {
                if (label.pattern === null) {
                    if (hasDefault)
                        self.error(label, 'CS0152', "The switch statement contains multiple cases with the label value 'default'");
                    hasDefault = true;
                    return { pattern: null, when: null };
                }
                var pattern = self.bindPattern(label.pattern, expr.type, sectionScope, { caseLabel: true });
                if (pattern.kind === 'constant' && label.when === null) {
                    var key = pattern.value.constant === null ? 'null' : String(pattern.value.constant);
                    if (seenConstants.indexOf(key) >= 0)
                        self.error(label, 'CS0152', "The switch statement contains multiple cases with the label value '" +
                                   self.constantText(pattern.value.constant, pattern.value.type) + "'");
                    seenConstants.push(key);
                }
                var when = label.when !== null ? self.bindCondition(label.when, sectionScope) : null;
                return { pattern: pattern, when: when };
            });
            var statements = self.bindStatementList(section.statements, sectionScope);
            return { labels: labels, statements: statements, locals: sectionScope.declared || [], line: section.line };
        });
        var result = bound('switch', node, { expr: expr, sections: sections, hasDefault: hasDefault });
        // No fall through: the end of a section must not be reachable.
        sections.forEach(function (section, index) {
            var block = bound('block', node, { statements: section.statements, locals: [] });
            if (section.statements.length === 0 || self.flow(block, true, [result]))
                self.error({ line: node.sections[index].labels[node.sections[index].labels.length - 1].line, column: 0 },
                           index === sections.length - 1 ? 'CS8070' : 'CS0163', index === sections.length - 1
                    ? "Control cannot fall out of switch from final case label ('" + self.labelText(node.sections[index]) + "')"
                    : "Control cannot fall through from one case label ('" + self.labelText(node.sections[index]) + "') to another");
        });
        return result;
    };

    C.labelText = function (section) {
        var label = section.labels[section.labels.length - 1];
        if (label.pattern === null)
            return 'default:';
        var pattern = label.pattern;
        if (pattern.k === 'pconst' && pattern.expr.k === 'literal') {
            var expr = pattern.expr;
            var text = expr.kind === 'string' ? '"' + expr.value + '"' : (expr.kind === 'int' ? expr.value.digits :
                expr.kind === 'char' ? "'" + String.fromCharCode(expr.value) + "'" : String(expr.value));
            return 'case ' + text + ':';
        }
        return 'case ' + (pattern.k === 'pconst' && pattern.expr.k === 'name' ? pattern.expr.name : '...') + ':';
    };

    C.stmt_break = function (node, scope) {
        for (var current = scope; current !== null; current = current.parent) {
            if (current.loop || current.breakable)
                return bound('break', node, {});
            if (current.kind === 'lambda' || current.kind === 'method' || current.kind === 'type')
                break;
        }
        this.error(node, 'CS0139', 'No enclosing loop out of which to break or continue');
    };

    C.stmt_continue = function (node, scope) {
        for (var current = scope; current !== null; current = current.parent) {
            if (current.loop)
                return bound('continue', node, {});
            if (current.kind === 'lambda' || current.kind === 'method' || current.kind === 'type')
                break;
        }
        this.error(node, 'CS0139', 'No enclosing loop out of which to break or continue');
    };

    // The labels of a statement list: goto sees them from the whole list
    // and from the blocks inside it.
    C.declareLabels = function (nodes, scope) {
        var self = this;
        nodes.forEach(function (node) {
            for (var current = node; current.k === 'labeled'; current = current.statement) {
                if (self.findLabel(current.label, scope) !== null)
                    self.error(current, 'CS0140', "The label '" + current.label + "' is a duplicate");
                scope.labels = scope.labels || Object.create(null);
                scope.labels[current.label] = { name: current.label, bound: false, forward: false, backward: false };
            }
        });
    };

    C.findLabel = function (name, scope) {
        for (var current = scope; current !== null; current = current.parent) {
            if (current.labels !== undefined && current.labels[name] !== undefined)
                return current.labels[name];
            if (current.kind === 'lambda' || current.kind === 'method' || current.kind === 'type')
                break;
        }
        return null;
    };

    C.stmt_goto = function (node, scope) {
        if (node.kind === 'label') {
            var label = this.findLabel(node.label, scope);
            if (label === null)
                this.error(node, 'CS0159', "No such label '" + node.label + "' within the scope of the goto statement");
            // A label bound before the goto is behind it (or around it).
            if (label.bound)
                label.backward = true;
            else
                label.forward = true;
            return bound('gotoLabel', node, { label: label });
        }
        var switchScope = null;
        for (var current = scope; current !== null; current = current.parent) {
            if (current.switchType !== undefined) {
                switchScope = current;
                break;
            }
            if (current.kind === 'lambda' || current.kind === 'method')
                break;
        }
        if (switchScope === null)
            this.error(node, 'CS0153', "A goto case is only valid inside a switch statement");
        if (node.kind === 'default')
            return bound('gotoCase', node, { isDefault: true, value: null });
        var value = this.bindAs(node.expr, scope, switchScope.switchType);
        if (value.constant === undefined)
            this.error(node.expr, 'CS0150', 'A constant value is expected');
        return bound('gotoCase', node, { isDefault: false, value: value });
    };

    C.stmt_labeled = function (node, scope) {
        var label = this.findLabel(node.label, scope);
        if (label === null) {
            this.declareLabels([node], scope);
            label = this.findLabel(node.label, scope);
        }
        label.bound = true;
        return bound('labeled', node, { label: label, statement: this.bindStatement(node.statement, scope) });
    };

    C.stmt_return = function (node, scope) {
        var fn = this.currentFunctionInfo(scope);
        if (fn === null)
            this.error(node, 'CS0127', 'A return statement is not allowed here');
        if (fn.iterator)
            this.error(node, 'CS1622', 'Cannot return a value from an iterator. Use the yield return statement to return a value, or yield break to end the iteration.');
        var method = fn.method;
        if (node.expr === null) {
            if (!fn.infer && fn.returnType !== null && fn.returnType.kind !== 'void' && !fn.topLevel)
                this.error(node, 'CS0126', "An object of a type convertible to '" + CS.typeName(fn.returnType) + "' is required");
            return bound('return', node, { expr: null });
        }
        if (node.expr.k === 'refExpr') {
            var refValue = this.bindValue(node.expr.expr, scope);
            return bound('return', node, { expr: refValue, isRef: true });
        }
        if (fn.infer) {
            var inferred = this.requireValue(this.bindExpr(node.expr, scope), node.expr);
            fn.returns.push(inferred);
            return bound('return', node, { expr: inferred });
        }
        if (fn.returnType.kind === 'void') {
            if (fn.kind === 'lambda')
                this.error(node, 'CS8030', 'Anonymous function converted to a void returning delegate cannot return a value');
            if (fn.isAsync)
                this.error(node, 'CS1997', "Since '" + this.methodText(method) + "' is an async method that returns 'Task', a return keyword must not be followed by an object expression");
            this.error(node, 'CS0127', "Since '" + this.methodText(method) + "' returns void, a return keyword must not be followed by an object expression");
        }
        var value = this.bindAs(node.expr, scope, fn.returnType);
        return bound('return', node, { expr: value });
    };

    C.stmt_throw = function (node, scope) {
        if (node.expr === null) {
            for (var current = scope; current !== null; current = current.parent) {
                if (current.inCatch)
                    return bound('throw', node, { expr: null });
                if (current.kind === 'lambda' || current.kind === 'method' || current.inFinally)
                    break;
            }
            this.error(node, 'CS0156', 'A throw statement with no arguments is not allowed outside of a catch clause');
        }
        var value = this.bindValue(node.expr, scope);
        var exception = CS.libraryType('System.Exception');
        if (value.type.kind !== 'null' && !Conversions.isImplicitReferenceOrBoxingOrIdentity(value.type, exception))
            this.error(node.expr, 'CS0029', "Cannot implicitly convert type '" + CS.typeName(value.type) + "' to 'System.Exception'");
        return bound('throw', node, { expr: value });
    };

    C.bind_throwExpr = function (node, scope) {
        var value = this.bindValue(node.expr, scope);
        var exception = CS.libraryType('System.Exception');
        if (value.type.kind !== 'null' && !Conversions.isImplicitReferenceOrBoxingOrIdentity(value.type, exception))
            this.error(node.expr, 'CS0029', "Cannot implicitly convert type '" + CS.typeName(value.type) + "' to 'System.Exception'");
        return bound('throwExpr', node, { expr: value });
    };

    C.stmt_try = function (node, scope) {
        var self = this;
        var block = this.bindBlock(node.block, scope);
        var exception = CS.libraryType('System.Exception');
        var caught = [];
        var catches = node.catches.map(function (clause) {
            var catchScope = scope.child('block', { inCatch: true });
            var type = clause.type !== null ? self.resolveType(clause.type, scope) : exception;
            if (!Conversions.isImplicitReferenceOrBoxingOrIdentity(type, exception))
                self.error(clause.type, 'CS0155', 'The type caught or thrown must be derived from System.Exception');
            if (clause.filter === null) {
                caught.forEach(function (previous) {
                    if (Conversions.isImplicitReferenceOrBoxingOrIdentity(type, previous))
                        self.error(clause.type || clause, 'CS0160', "A previous catch clause already catches all exceptions of this or of a super type ('" +
                                   CS.typeName(previous).replace(/^Exception$/, 'System.Exception') + "')");
                });
            }
            var local = null;
            if (clause.name !== null) {
                local = self.declareLocal(clause.name, type, catchScope, clause, 'catch');
                local.assigned = true;
            }
            var filter = clause.filter !== null ? self.bindCondition(clause.filter, catchScope) : null;
            var body = self.bindBlock(clause.block, catchScope);
            if (clause.filter === null)
                caught.push(type);
            return { type: type, local: local, filter: filter, body: body, all: clause.type === null };
        });
        var fin = node.fin !== null ? this.bindBlock(node.fin, scope.child('block', { inFinally: true })) : null;
        return bound('try', node, { block: block, catches: catches, fin: fin });
    };

    C.stmt_checkedBlock = function (node, scope) {
        return this.bindBlock(node.block, scope, { checked: node.checked });
    };

    C.stmt_lock = function (node, scope) {
        var expr = this.bindValue(node.expr, scope);
        if (!CS.isReferenceType(expr.type) && expr.type.kind !== 'tparam')
            this.error(node.expr, 'CS0185', "'" + CS.typeName(expr.type) + "' is not a reference type as required by the lock statement");
        var body = this.bindEmbedded(node.body, scope);
        return bound('lock', node, { expr: expr, body: body });
    };

    // using (resource) and using (var x = ...).
    C.stmt_using = function (node, scope) {
        var usingScope = scope.child('block', {});
        var resources;
        if (node.declaration !== null) {
            resources = this.usingDeclaration(node.declaration, usingScope);
        } else {
            var expr = this.bindValue(node.resource, usingScope);
            this.checkDisposable(expr.type, node.resource, node.isAwait);
            resources = [{ local: null, expr: expr }];
        }
        var body = this.bindEmbedded(node.body, usingScope);
        return bound('using', node, { resources: resources, body: body, isAwait: node.isAwait, locals: usingScope.declared || [] });
    };

    C.usingDeclaration = function (decl, scope) {
        var self = this;
        var type = decl.type === null ? null : this.resolveType(decl.type, scope);
        return decl.vars.map(function (variable) {
            if (variable.init === null)
                self.error(variable, 'CS0210', 'You must provide an initializer in a fixed or using statement declaration');
            var value = type === null ? self.bindValue(variable.init, scope) : self.bindAs(variable.init, scope, type);
            var localType = type === null ? value.type : type;
            self.checkDisposable(localType, variable, decl.isAwaitUsing);
            var local = self.declareLocal(variable.name, localType, scope, variable, 'using');
            local.readonly = true;
            local.assigned = true;
            return { local: local, expr: value };
        });
    };

    C.checkDisposable = function (type, node, isAwait) {
        var name = isAwait ? 'System.IAsyncDisposable' : 'System.IDisposable';
        var disposable = CS.libraryType(name);
        if (type.kind === 'null' || Conversions.isImplicitReferenceOrBoxingOrIdentity(type, disposable))
            return;
        if (CS.isNullableValue(type) && Conversions.isImplicitReferenceOrBoxingOrIdentity(type.args[0], disposable))
            return;
        this.error(node, 'CS1674', "'" + CS.typeName(type) + "': type used in a using statement must be implicitly convertible to '" +
                   name + "'");
    };

    C.stmt_yieldReturn = function (node, scope) {
        var fn = this.currentFunctionInfo(scope);
        if (fn === null || !fn.iterator)
            this.error(node, 'CS1621', 'The yield statement cannot be used inside an anonymous method or lambda expression');
        for (var current = scope; current !== null; current = current.parent) {
            if (current.inCatch)
                this.error(node, 'CS1631', 'Cannot yield a value in the body of a catch clause');
            if (current.inFinally)
                this.error(node, 'CS1625', 'Cannot yield in the body of a finally clause');
            if (current.kind === 'lambda' || current.kind === 'method')
                break;
        }
        var value = this.bindAs(node.expr, scope, fn.elementType);
        return bound('yieldReturn', node, { expr: value });
    };

    C.stmt_yieldBreak = function (node, scope) {
        var fn = this.currentFunctionInfo(scope);
        if (fn === null || !fn.iterator)
            this.error(node, 'CS1621', 'The yield statement cannot be used inside an anonymous method or lambda expression');
        return bound('yieldBreak', node, {});
    };

    C.stmt_labeledEmpty = C.stmt_empty;

    // --- Reachability

    // Whether the end of a statement is reachable from its start
    // (reachable). targets: the loops and switches that break leaves.
    C.flow = function (stmt, reachable, targets) {
        var self = this;
        if (stmt === null || stmt === undefined)
            return reachable;
        switch (stmt.k) {
        case 'block': {
            var current = reachable;
            stmt.statements.forEach(function (item) { current = self.flow(item, current, targets); });
            return current;
        }
        case 'return':
        case 'throw':
        case 'yieldBreak':
        case 'gotoCase':
        case 'gotoLabel':
        case 'continue':
            return false;
        case 'labeled':
            return this.flow(stmt.statement, reachable || stmt.label.forward || stmt.label.backward, targets);
        case 'break':
            if (reachable && targets.length > 0)
                targets[targets.length - 1].broken = true;
            return false;
        case 'expr':
            if (stmt.expr.k === 'throwExpr')
                return false;
            if (stmt.expr.k === 'call' && stmt.expr.method && stmt.expr.method.doesNotReturn)
                return false;
            return reachable;
        case 'if': {
            var constant = stmt.cond.constant;
            var thenEnd = this.flow(stmt.then, reachable && constant !== false, targets);
            var elseEnd = stmt.otherwise !== null ? this.flow(stmt.otherwise, reachable && constant !== true, targets)
                                                   : reachable && constant !== true;
            return thenEnd || elseEnd;
        }
        case 'while':
        case 'for': {
            var cond = stmt.cond;
            var always = cond === null || cond === undefined || cond.constant === true;
            var loop = { broken: false };
            this.flow(stmt.body, reachable && !(cond !== null && cond !== undefined && cond.constant === false), targets.concat([loop]));
            return (reachable && !always) || loop.broken;
        }
        case 'do': {
            var doLoop = { broken: false };
            var bodyEnd = this.flow(stmt.body, reachable, targets.concat([doLoop]));
            var doAlways = stmt.cond.constant === true;
            return ((bodyEnd || reachable) && !doAlways) || doLoop.broken;
        }
        case 'foreach': {
            var foreachLoop = { broken: false };
            this.flow(stmt.body, reachable, targets.concat([foreachLoop]));
            return reachable;
        }
        case 'switch': {
            var switchTarget = { broken: false };
            var inner = targets.concat([switchTarget]);
            stmt.sections.forEach(function (section) {
                self.flow(bound('block', null, { statements: section.statements, locals: [] }), reachable, inner);
            });
            var exhaustive = stmt.hasDefault || this.switchExhaustive(stmt);
            return switchTarget.broken || (reachable && !exhaustive);
        }
        case 'try': {
            var tryEnd = this.flow(stmt.block, reachable, targets);
            var catchEnd = false;
            stmt.catches.forEach(function (clause) {
                if (self.flow(clause.body, reachable, targets))
                    catchEnd = true;
            });
            var end = tryEnd || catchEnd;
            if (stmt.fin !== null) {
                var finEnd = this.flow(stmt.fin, reachable, targets);
                return end && finEnd;
            }
            return end;
        }
        case 'lock':
        case 'using':
            return this.flow(stmt.body, reachable, targets);
        case 'localFunction':
            return reachable;
        }
        return reachable;
    };

    // A switch without default whose patterns cover every value (a
    // discard or var pattern, or all values of a bool).
    C.switchExhaustive = function (stmt) {
        return stmt.sections.some(function (section) {
            return section.labels.some(function (label) {
                return label.pattern !== null && label.when === null && (label.pattern.kind === 'discard' || label.pattern.kind === 'var' ||
                                                                         label.pattern.irrefutable === true);
            });
        });
    };
})(globalThis);
