// C#: more expressions - arrays and their initializers, collection
// expressions, indexers, anonymous types, with, await, conditional access
// (?.), and query expressions translated into method calls (C# 12.20.3).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    var C = CS.Checker.prototype;
    if (C.bind_newArray)
        return;

    var bound = CS.bound;
    var big = T.big;
    var Conversions = CS.Conversions;

    // --- Arrays

    // new int[3], new int[2, 3], new int[] { 1, 2 }, new int[3][].
    C.bind_newArray = function (node, scope) {
        var self = this;
        var arrayType, sizes = null;
        if (node.sizes !== null) {
            var elem = this.resolveType(node.elemType, scope);
            arrayType = CS.arrayType(elem, node.sizes.length);
            sizes = node.sizes.map(function (size) { return self.arrayIndex(self.bindValue(size, scope), size); });
        } else {
            arrayType = this.resolveType(node.type, scope);
        }
        if (node.init === null)
            return bound('newArray', node, { type: arrayType, sizes: sizes, init: null });
        var init = this.arrayInitializerItems(node.init, arrayType, scope, sizes);
        return bound('newArray', node, { type: arrayType, sizes: sizes, init: init });
    };

    // { 1, 2 } for an array type (nested for more dimensions).
    C.bindArrayInitializer = function (node, type, scope) {
        if (type.kind !== 'array')
            this.error(node, 'CS0622', 'Can only use array initializer expressions to assign to array types. Try using a new expression instead.');
        return bound('newArray', node, { type: type, sizes: null, init: this.arrayInitializerItems(node, type, scope, null) });
    };

    C.arrayInitializerItems = function (node, type, scope, sizes) {
        var self = this;
        var rank = type.rank;
        function level(init, depth) {
            if (init.k !== 'arrayInit')
                self.error(init, 'CS0846', 'A nested array initializer is expected');
            if (sizes !== null && sizes[depth].constant !== undefined && big.toFloat(sizes[depth].constant) !== init.items.length)
                self.error(init, 'CS0847', 'An array initializer of length \'' + big.toFloat(sizes[depth].constant) + "' is expected");
            if (sizes !== null && sizes[depth].constant === undefined)
                self.error(sizes[depth], 'CS0150', 'A constant value is expected');
            if (depth === rank - 1) {
                return init.items.map(function (item) {
                    if (item.k === 'arrayInit') {
                        if (type.elem.kind === 'array')
                            return self.bindArrayInitializer(item, type.elem, scope);
                        self.error(item, 'CS0623', 'Array initializers can only be used in a variable or field initializer. Try using a new expression instead.');
                    }
                    return self.bindAs(item, scope, type.elem);
                });
            }
            return init.items.map(function (item) { return level(item, depth + 1); });
        }
        var items = level(node, 0);
        if (rank > 1) {
            // All rows of the same length.
            var check = function (list, depth) {
                if (depth === rank - 1)
                    return;
                var length = null;
                list.forEach(function (row) {
                    if (length !== null && row.length !== length)
                        self.error(node, 'CS0847', "An array initializer of length '" + length + "' is expected");
                    length = row.length;
                    check(row, depth + 1);
                });
            };
            check(items, 0);
        }
        return items;
    };

    // new[] { 1, 2.5 }: the element type is the best common type.
    C.bind_newImplicitArray = function (node, scope) {
        var self = this;
        var flat = [];
        function collect(init, depth) {
            if (depth === node.rank - 1) {
                init.items.forEach(function (item) { flat.push(self.bindExpr(item, scope)); });
                return;
            }
            init.items.forEach(function (item) {
                if (item.k !== 'arrayInit')
                    self.error(item, 'CS0846', 'A nested array initializer is expected');
                collect(item, depth + 1);
            });
        }
        collect(node.init, 0);
        var elem = this.bestCommonType(flat);
        if (elem === null)
            this.error(node, 'CS0826', 'No best type found for implicitly-typed array');
        var type = CS.arrayType(elem, node.rank);
        return bound('newArray', node, { type: type, sizes: null, init: this.arrayInitializerItems(node.init, type, scope, null) });
    };

    C.bind_arrayInit = function (node) {
        this.error(node, 'CS0623', 'Array initializers can only be used in a variable or field initializer. Try using a new expression instead.');
    };

    // --- Collection expressions (C# 12)

    C.bind_collection = function (node, scope) {
        var self = this;
        var items = node.items.map(function (item) {
            if (item.k === 'spread')
                return { spread: true, expr: self.bindValue(item.expr, scope), node: item };
            return { spread: false, expr: self.bindExpr(item, scope), node: item };
        });
        return bound('collectionLiteral', node, { items: items, scope: scope });
    };

    // What a collection expression can become: an array, a list, an
    // interface of them, or a type with Add.
    C.collectionTarget = function (target) {
        if (target.kind === 'array' && target.rank === 1)
            return { kind: 'array', elementType: target.elem };
        if (target.kind !== 'named')
            return null;
        var name = target.sym.qname;
        if (/^System\.Collections\.Generic\.I(Enumerable|Collection|List|ReadOnlyCollection|ReadOnlyList)$/.test(name) &&
            target.args.length === 1)
            return { kind: 'list', elementType: target.args[0], listType: CS.libraryType('System.Collections.Generic.List`1', target.args) };
        if (name === 'System.Span' || name === 'System.ReadOnlySpan')
            return { kind: 'array', elementType: target.args[0] };
        var sym = target.sym.complete();
        if ((sym.kind === 'class' || sym.kind === 'struct') && !sym.mods.abstract &&
            Conversions.isImplicitReferenceOrBoxingOrIdentity(target, CS.libraryType('System.Collections.IEnumerable'))) {
            var element = this.collectionElementType(target);
            if (element !== null)
                return { kind: 'add', elementType: element, listType: target };
        }
        return null;
    };

    // The element type of a collection: T of its IEnumerable<T>.
    C.collectionElementType = function (type) {
        var ifaces = CS.interfacesOf(type);
        for (var index = 0; index < ifaces.length; ++index) {
            if (ifaces[index].sym.qname === 'System.Collections.Generic.IEnumerable')
                return ifaces[index].args[0];
        }
        return CS.objectType();
    };

    C.bindCollection = function (expr, target, node) {
        var self = this;
        var info = this.collectionTarget(target);
        var items = expr.items.map(function (item) {
            if (item.spread) {
                var enumeration = self.enumerationOf(item.expr.type, item.node, expr.scope, false);
                var conversion = CS.sameType(enumeration.elementType, info.elementType) ? null
                    : self.convert(bound('placeholder', item.node, { type: enumeration.elementType }), info.elementType, item.node, false);
                return { spread: true, expr: item.expr, info: enumeration, conversion: conversion };
            }
            return { spread: false, expr: self.convert(item.expr, info.elementType, item.node, false) };
        });
        var addMethod = null;
        if (info.kind === 'add') {
            var receiver = bound('initTarget', node, { type: info.listType });
            var placeholder = bound('placeholder', node, { type: info.elementType });
            var group = this.memberAccess(receiver, 'Add', null, node, expr.scope, null);
            addMethod = this.bindMethodCallWithArgs(group, [{ name: null, refKind: '', expr: placeholder, outDecl: null }], node, expr.scope);
        }
        return bound('collectionExpr', node, { items: items, target: info, type: target, addCall: addMethod,
                                               listType: info.listType || null });
    };

    // --- Indexers

    C.indexerAccess = function (target, found, node, scope, isBase) {
        var args = this.bindArguments(node.args, scope);
        var candidates = found.filter(function (entry) { return entry.member.symbolKind === 'property'; }).map(function (entry) {
            // An indexer as a method with its parameters (the getter's or setter's).
            var accessor = CS.findGetter(entry.member) || CS.findSetter(entry.member);
            return { member: accessor, owner: entry.owner, property: entry.member };
        });
        // Setters have the value parameter last: compare without it.
        var resolvable = candidates.map(function (candidate) {
            var accessor = candidate.member;
            if (accessor.name.indexOf('set_') === 0) {
                var view = Object.create(accessor);
                view.params = accessor.params.slice(0, accessor.params.length - 1);
                view.realAccessor = accessor;
                return { member: view, owner: candidate.owner, property: candidate.property };
            }
            return candidate;
        });
        var attempt = this.findApplicable(resolvable, args, null, scope);
        if (attempt.best === null && attempt.applicable.length === 0 && resolvable.length > 0) {
        }
        var result = this.resolveOverload(resolvable, args, null, node, scope, { name: 'this', attempt: attempt });
        var property = null;
        resolvable.forEach(function (candidate) {
            if (candidate.member === result.method)
                property = candidate.property;
        });
        return bound('property', node, { receiver: target, property: property, ownerType: result.owner, args: result.args,
                                         type: CS.subst(property.type, CS.typeMap(result.owner)), isBase: !!isBase,
                                         argOrder: result.argOrder });
    };

    // --- Anonymous types

    // new { X = 1, b.Name }: a generic class per list of member names.
    C.bind_newAnonymous = function (node, scope) {
        var self = this;
        var names = [];
        var values = node.members.map(function (member) {
            var name = member.name;
            if (name === null) {
                if (member.expr.k === 'name')
                    name = member.expr.name;
                else if (member.expr.k === 'member')
                    name = member.expr.name;
                else
                    self.error(member, 'CS0746', 'Invalid anonymous type member declarator. Anonymous type members must be declared with a member assignment, simple name or member access.');
            }
            if (names.indexOf(name) >= 0)
                self.error(member, 'CS0833', 'An anonymous type cannot have multiple properties with the same name');
            names.push(name);
            var value = self.bindValue(member.expr, scope);
            if (value.type.kind === 'void' || value.type.kind === 'null')
                self.error(member, 'CS0828', "Cannot assign '" + (value.type.kind === 'void' ? 'void' : '<null>') +
                           "' to anonymous type property");
            return value;
        });
        var sym = this.session.anonymousType(names);
        var type = CS.named(sym, values.map(function (value) { return value.type; }));
        return bound('newAnonymous', node, { type: type, values: values, names: names });
    };

    // --- with

    C.bind_with = function (node, scope) {
        var operand = this.bindValue(node.operand, scope);
        var type = operand.type;
        var isRecordClass = type.kind === 'named' && type.sym.isRecord && type.sym.kind === 'class';
        if (!isRecordClass && !CS.isValueType(type) && !(type.kind === 'named' && type.sym.isAnonymous))
            this.error(node, 'CS8858', "The receiver type '" + CS.typeName(type) + "' is not a valid record type and is not a struct type.");
        var assignments = this.objectInitializer(type, node.init, scope);
        assignments.forEach(function (item) {
            item.target.inWith = true;
        });
        return bound('with', node, { operand: operand, assignments: assignments, type: type,
                                     clone: isRecordClass ? CS.lookupMembers(type, '<Clone>$')[0] : null });
    };

    // --- await

    C.bind_await = function (node, scope) {
        var fn = this.currentFunctionInfo(scope);
        if (fn === null || !fn.isAsync) {
            if (fn !== null && fn.kind === 'lambda')
                this.error(node, 'CS4034', "The 'await' operator can only be used within an async lambda expression. Consider marking this lambda expression with the 'async' modifier.");
            this.error(node, 'CS4032', "The 'await' operator can only be used within an async method. Consider marking this method with the 'async' modifier and changing its return type to 'Task'.");
        }
        for (var current = scope; current !== null; current = current.parent) {
            if (current.inLock)
                this.error(node, 'CS1996', "Cannot await in the body of a lock statement");
            if (current.kind === 'lambda' || current.kind === 'method')
                break;
        }
        var operand = this.bindValue(node.expr, scope);
        var awaiter = this.awaiterOf(operand.type, node);
        fn.awaits = true;
        return bound('await', node, { expr: operand, awaiter: awaiter, type: awaiter.resultType });
    };

    // Task, Task<T>, ValueTask and types with GetAwaiter().
    C.awaiterOf = function (type, node) {
        if (type.kind === 'named' && (type.sym.qname === 'System.Threading.Tasks.Task' ||
                                      type.sym.qname === 'System.Threading.Tasks.ValueTask'))
            return { kind: 'task', resultType: type.args.length === 1 ? type.args[0] : CS.VOID };
        if (type.kind === 'dynamic')
            return { kind: 'task', resultType: CS.DYNAMIC };
        var getAwaiter = CS.lookupMembers(type, 'GetAwaiter').filter(function (entry) {
            return entry.member.symbolKind === 'method' && entry.member.params.length === 0;
        });
        if (getAwaiter.length === 0)
            this.error(node, 'CS1061', "'" + CS.typeName(type) + "' does not contain a definition for 'GetAwaiter' and no accessible extension method 'GetAwaiter' accepting a first argument of type '" +
                       CS.typeName(type) + "' could be found (are you missing a using directive or an assembly reference?)");
        var awaiterType = CS.subst(getAwaiter[0].member.returnType, CS.typeMap(getAwaiter[0].owner));
        var getResult = CS.lookupMembers(awaiterType, 'GetResult');
        var resultType = getResult.length > 0 ? CS.subst(getResult[0].member.returnType, CS.typeMap(getResult[0].owner)) : CS.VOID;
        return { kind: 'awaiter', getAwaiter: getAwaiter[0], awaiterType: awaiterType, resultType: resultType };
    };

    // --- Conditional access

    C.bind_condAccess = function (node, scope) {
        var target = this.bindValue(node.target, scope);
        var type = target.type;
        if (CS.isValueType(type) && !CS.isNullableValue(type) && type.kind !== 'tparam')
            this.error(node, 'CS0023', "Operator '?' cannot be applied to operand of type '" + CS.typeName(type) + "'");
        var underlying = CS.underlyingNullable(type);
        var inner = scope.child('block', { binding: bound('receiverValue', node, { type: underlying }) });
        var access = this.bindExpr(node.access, inner);
        if (access.k === 'methodGroup')
            this.error(node, 'CS0119', "'" + access.name + "' is a method, which is not valid in the given context");
        if (access.k !== 'call' && access.k !== 'delegateCall')
            access = this.requireValue(access, node.access);
        var accessType = access.type;
        var resultType = accessType;
        if (accessType.kind !== 'void' && CS.isValueType(accessType) && !CS.isNullableValue(accessType))
            resultType = CS.nullableOf(accessType);
        if (accessType.kind === 'tparam' && !CS.typeParamIsReference(accessType.sym))
            this.error(node, 'CS8978', "'" + CS.typeName(accessType) + "' cannot be made nullable.");
        return bound('condAccess', node, { receiver: target, access: access, type: resultType, lifted: resultType !== accessType });
    };

    // The value of the receiver of a ?. chain.
    C.bind_binding = function (node, scope) {
        for (var current = scope; current !== null; current = current.parent) {
            if (current.binding !== undefined)
                return current.binding;
        }
        this.error(node, 'CS1525', 'Invalid expression term');
    };

    C.bind_declExpr = function (node) {
        this.error(node, 'CS8185', 'A declaration is not allowed in this context.');
    };

    C.bind_refExpr = function (node, scope) {
        return this.bindValue(node.expr, scope);
    };

    C.bind_discard = function (node) {
        return bound('discard', node, {});
    };

    C.bind_spread = function (node) {
        this.error(node, 'CS1525', "Invalid expression term '..'");
    };

    C.bind_placeholder = function (node) {
        return node;
    };

    // --- Query expressions

    // A range variable: a member of the transparent identifier, or the
    // parameter itself.
    C.rangeVariable = function (local, node) {
        var expr = bound('local', node, { sym: local.base, type: local.base.type });
        var self = this;
        local.path.forEach(function (name) {
            var found = CS.lookupMembers(expr.type, name);
            if (found.length === 0)
                self.error(node, 'CS0103', "The name '" + local.name + "' does not exist in the current context");
            expr = self.memberResult(found, expr, false, null, node, null, {});
        });
        return expr;
    };

    function syntax(kind, at, fields) {
        var node = fields || {};
        node.k = kind;
        node.line = at.line;
        node.column = at.column;
        return node;
    }

    // The query as nested calls: Select, Where, SelectMany, Join,
    // GroupJoin, OrderBy, ThenBy, GroupBy, Cast.
    C.bind_query = function (node, scope) {
        var call = this.translateQuery(node.from, node.body, node);
        return this.bindExpr(call, scope);
    };

    // A lambda of the query: params are the range variables of the state.
    function queryLambda(state, body, at, extraName) {
        var params = [syntax('param', at, { name: state.param, type: null, refKind: '' })];
        if (extraName !== undefined)
            params.push(syntax('param', at, { name: extraName, type: null, refKind: '' }));
        return syntax('lambda', at, { params: params, body: body, isAsync: false, isStatic: false, returnType: null,
                                      ranges: state.ranges, extraName: extraName });
    }

    function callNode(target, name, args, at) {
        return syntax('call', at, { target: syntax('member', at, { target: target, name: name, args: null }),
                                    args: args.map(function (arg) { return syntax('arg', at, { name: null, refKind: '', expr: arg }); }) });
    }

    var transparentCounter = 0;

    C.translateQuery = function (from, body, at) {
        var source = from.expr;
        if (from.type !== null)
            source = syntax('call', from, { target: syntax('member', from, { target: source, name: 'Cast', args: [from.type] }), args: [] });
        // The state: the lambda parameter and the range variables reachable
        // through it ({ name, path }).
        var state = { param: from.name, ranges: [{ name: from.name, path: [] }] };
        var current = source;
        var clauses = body.clauses;
        for (var index = 0; index < clauses.length; ++index) {
            var clause = clauses[index];
            var last = index === clauses.length - 1;
            switch (clause.k) {
            case 'qwhere':
                current = callNode(current, 'Where', [queryLambda(state, clause.expr, clause)], clause);
                break;
            case 'qlet': {
                var anonymous = pairBody(state, clause.name, clause.expr, clause);
                current = callNode(current, 'Select', [queryLambda(state, anonymous, clause)], clause);
                state = transparent(state, clause.name);
                break;
            }
            case 'qfrom': {
                var inner = clause.expr;
                if (clause.type !== null)
                    inner = syntax('call', clause, { target: syntax('member', clause, { target: inner, name: 'Cast', args: [clause.type] }), args: [] });
                var collection = queryLambda(state, inner, clause);
                if (last && body.end.k === 'qselect') {
                    current = callNode(current, 'SelectMany', [collection, queryLambda(state, body.end.expr, clause, clause.name)], clause);
                    return this.continuation(current, body, null);
                }
                current = callNode(current, 'SelectMany', [collection, queryLambda(state, pairBody(state, clause.name, null, clause), clause, clause.name)], clause);
                state = transparent(state, clause.name);
                break;
            }
            case 'qjoin': {
                var joined = clause.source;
                if (clause.type !== null)
                    joined = syntax('call', clause, { target: syntax('member', clause, { target: joined, name: 'Cast', args: [clause.type] }), args: [] });
                var outerKey = queryLambda(state, clause.left, clause);
                var innerKey = syntax('lambda', clause, { params: [syntax('param', clause, { name: clause.name, type: null, refKind: '' })],
                                                          body: clause.right, isAsync: false, isStatic: false, returnType: null });
                var method = clause.into !== null ? 'GroupJoin' : 'Join';
                var newName = clause.into !== null ? clause.into : clause.name;
                if (last && body.end.k === 'qselect') {
                    current = callNode(current, method, [joined, outerKey, innerKey, queryLambda(state, body.end.expr, clause, newName)], clause);
                    return this.continuation(current, body, null);
                }
                current = callNode(current, method, [joined, outerKey, innerKey, queryLambda(state, pairBody(state, newName, null, clause), clause, newName)], clause);
                state = transparent(state, newName);
                break;
            }
            case 'qorderby':
                clause.orderings.forEach(function (ordering, position) {
                    var name = (position === 0 ? 'OrderBy' : 'ThenBy') + (ordering.descending ? 'Descending' : '');
                    current = callNode(current, name, [queryLambda(state, ordering.expr, ordering)], ordering);
                });
                break;
            }
        }
        var end = body.end;
        if (end.k === 'qselect') {
            // select x after other clauses adds nothing (except right after from).
            var identity = end.expr.k === 'name' && end.expr.args === null && state.ranges.length === 1 &&
                state.ranges[0].name === end.expr.name && state.ranges[0].path.length === 0 && state.param === end.expr.name;
            if (!(identity && clauses.length > 0))
                current = callNode(current, 'Select', [queryLambda(state, end.expr, end)], end);
        } else {
            var keySelector = queryLambda(state, end.key, end);
            var elementIsRange = end.expr.k === 'name' && end.expr.args === null && state.ranges.length === 1 &&
                state.param === end.expr.name;
            current = elementIsRange ? callNode(current, 'GroupBy', [keySelector], end)
                                     : callNode(current, 'GroupBy', [keySelector, queryLambda(state, end.expr, end)], end);
        }
        return this.continuation(current, body, at);
    };

    // into g ...: the query so far is the source of a new one.
    C.continuation = function (current, body, at) {
        if (body.continuation === null)
            return current;
        var next = body.continuation;
        return this.translateQuery(syntax('qfrom', next, { type: null, name: next.name, expr: current }), next.body, next);
    };

    // The state after a clause that adds a variable: a new transparent
    // identifier (an anonymous object) with all range variables as members.
    function transparent(state, name) {
        var ranges = state.ranges.map(function (range) { return { name: range.name, path: [range.name] }; });
        ranges.push({ name: name, path: [name] });
        return { param: '$t' + (++transparentCounter), ranges: ranges };
    }

    // new { x, y, name = value }: the range variables of the state and the
    // new one (value null - the parameter of that name).
    function pairBody(state, name, value, at) {
        var members = state.ranges.map(function (range) {
            return syntax('anonMember', at, { name: range.name, expr: syntax('name', at, { name: range.name, args: null }) });
        });
        members.push(syntax('anonMember', at, { name: name, expr: value !== null ? value : syntax('name', at, { name: name, args: null }) }));
        return syntax('newAnonymous', at, { members: members });
    }

})(globalThis);
