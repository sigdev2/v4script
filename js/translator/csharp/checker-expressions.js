// C#: binding expressions into bound trees - literals, names and member
// access, this and base, conversions of expressions (constants, null,
// lambdas, method groups, target-typed expressions), casts, is and as,
// element access, conditional expressions, assignment. Calls are in
// checker-calls.js, operators in checker-operators.js, patterns in
// checker-patterns.js.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    var C = CS.Checker.prototype;
    if (C.bindExpr)
        return;

    var big = T.big;
    var Conversions = CS.Conversions;

    function bound(kind, node, fields) {
        var result = fields || {};
        result.k = kind;
        result.line = node ? node.line : 0;
        result.column = node ? node.column : 0;
        return result;
    }
    CS.bound = bound;

    // A constant of a type: integral types are T.big integers, floats
    // numbers, decimal CS.decimal values.
    C.constant = function (node, type, value) {
        return bound('literal', node, { type: type, constant: value });
    };

    // The text of a constant in messages: 300, 1E+19, 'a', "s".
    C.constantText = function (value, type) {
        if (value === null)
            return 'null';
        if (CS.isSpecial(type, 'char'))
            return String.fromCharCode(big.toFloat(value));
        if (CS.isSpecial(type, 'double') || CS.isSpecial(type, 'float'))
            return CS.formatDouble ? CS.formatDouble(value, CS.isSpecial(type, 'float')) : String(value);
        if (CS.decimal.is(value))
            return CS.decimal.str(value);
        if (typeof value === 'boolean')
            return value ? 'True' : 'False';
        if (typeof value === 'string')
            return value;
        return big.str(value);
    };

    // --- Entry points

    // An expression as it is: a value, a type, a namespace, a method group,
    // an unbound lambda...
    C.bindExpr = function (node, scope) {
        var method = this['bind_' + node.k];
        if (method === undefined)
            this.error(node, 'CS1525', "Invalid expression term '" + node.k + "'");
        return method.call(this, node, scope);
    };

    // An expression that has a value with a type.
    C.bindValue = function (node, scope) {
        var expr = this.bindExpr(node, scope);
        return this.requireValue(expr, node);
    };

    C.requireValue = function (expr, node) {
        switch (expr.k) {
        case 'typeExpr':
            this.error(node, 'CS0119', "'" + CS.typeName(expr.type) + "' is a type, which is not valid in the given context");
            break;
        case 'namespaceExpr':
            this.error(node, 'CS0118', "'" + expr.ns.qname + "' is a namespace but is used like a variable");
            break;
        case 'methodGroup': {
            // C# 10: a method group with one method has a natural delegate type.
            var natural = this.naturalMethodGroupType(expr);
            if (natural !== null)
                return this.convert(expr, natural, node, false);
            this.error(node, 'CS8917', 'The delegate type could not be inferred.');
            break;
        }
        case 'unboundLambda': {
            var lambdaType = this.naturalLambdaType(expr);
            if (lambdaType === null)
                this.error(node, 'CS8917', 'The delegate type could not be inferred.');
            return this.convert(expr, lambdaType, node, false);
        }
        case 'defaultLiteral':
            this.error(node, 'CS8716', "There is no target type for the default literal.");
            break;
        case 'targetNew':
            this.error(node, 'CS8754', "There is no target type for 'new(" + ")'");
            break;
        case 'tupleLiteral':
            return this.naturalTuple(expr, node);
        case 'collectionLiteral':
            this.error(node, 'CS9176', 'There is no target type for the collection expression.');
            break;
        case 'throwExpr':
            this.error(node, 'CS8115', 'A throw expression is not allowed in this context.');
            break;
        case 'targetTyped':
            if (expr.natural === null)
                this.error(node, expr.what === 'switch' ? 'CS8506' : 'CS0173', expr.what === 'switch'
                    ? 'No best type was found for the switch expression.'
                    : "Type of conditional expression cannot be determined because there is no implicit conversion between '" +
                      expr.leftName + "' and '" + expr.rightName + "'");
            return this.convert(expr, expr.natural, node, false);
        case 'eventAccess':
            if (!expr.fieldLike)
                this.error(node, 'CS0079', "The event '" + CS.symbolTypeName(expr.event.owner) + '.' + expr.event.name +
                           "' can only appear on the left hand side of += or -=");
            return bound('field', node, { receiver: expr.receiver, field: expr.event.backingField, ownerType: expr.ownerType,
                                          type: expr.type });
        }
        if (expr.type === undefined)
            this.error(node, 'CS1525', 'Invalid expression term');
        if (expr.k === 'property')
            this.checkGetter(expr, node);
        return expr;
    };

    // An expression converted implicitly to a type.
    C.bindAs = function (node, scope, type) {
        var expr = this.bindExpr(node, scope);
        return this.convert(expr, type, node, false);
    };

    // A condition: bool or a type with an implicit conversion to bool.
    C.bindCondition = function (node, scope) {
        var expr = this.bindExpr(node, scope);
        var bool = CS.boolType();
        if (expr.type !== undefined && expr.k !== 'methodGroup' && !CS.isSpecial(expr.type, 'bool') &&
            this.classify(expr, bool, false) === null) {
            var opTrue = this.userUnaryOperator('op_True', expr);
            if (opTrue !== null)
                return bound('call', node, { receiver: null, method: opTrue.method, ownerType: opTrue.owner, typeArgs: [],
                                             args: [expr], type: bool });
        }
        return this.convert(expr, bool, node, false);
    };

    // --- Literals

    C.bind_literal = function (node) {
        switch (node.kind) {
        case 'int':
            return this.integerLiteral(node);
        case 'real':
            return this.realLiteral(node);
        case 'char':
            return this.constant(node, CS.special('char'), node.value);
        case 'string':
            return this.constant(node, CS.stringType(), node.value);
        case 'bool':
            return this.constant(node, CS.boolType(), node.value);
        case 'null':
            return bound('literal', node, { type: CS.NULL, constant: null });
        }
        this.error(node, 'CS1525', 'Invalid expression term');
    };

    // The type of an integer literal: int, uint, long, ulong by its value
    // and suffix.
    C.integerLiteral = function (node) {
        var value = big.parse(node.value.digits || '0', node.value.radix);
        var suffix = node.value.suffix;
        var candidates;
        switch (suffix) {
        case 'u':
            candidates = ['uint', 'ulong'];
            break;
        case 'l':
            candidates = ['long', 'ulong'];
            break;
        case 'ul':
            candidates = ['ulong'];
            break;
        default:
            candidates = ['int', 'uint', 'long', 'ulong'];
        }
        if (node.value.radix !== 10 && suffix === '') {
            // Hex and binary literals: the bits may make int and long negative?
            // No: 0xFFFFFFFF is uint, as in C#.
        }
        for (var index = 0; index < candidates.length; ++index) {
            var type = CS.special(candidates[index]);
            if (Conversions.constantFits(value, type))
                return this.constant(node, type, value);
        }
        this.error(node, 'CS1021', 'Integral constant is too large');
    };

    C.realLiteral = function (node) {
        var text = node.value.whole + (node.value.fraction ? '.' + node.value.fraction : '') +
            (node.value.exponent ? 'e' + node.value.exponent : '');
        switch (node.value.suffix) {
        case 'f': {
            var single = Math.fround(Number(text));
            if (!isFinite(single))
                this.error(node, 'CS0594', "Floating-point constant is outside the range of type 'float'");
            return this.constant(node, CS.special('float'), single);
        }
        case 'm': {
            var value = CS.decimal.parse(text);
            if (value === null)
                this.error(node, 'CS0594', "Floating-point constant is outside the range of type 'decimal'");
            return this.constant(node, CS.special('decimal'), value);
        }
        }
        var number = Number(text);
        if (!isFinite(number))
            this.error(node, 'CS0594', "Floating-point constant is outside the range of type 'double'");
        return this.constant(node, CS.special('double'), number);
    };

    C.bind_interp = function (node, scope) {
        var self = this;
        var parts = node.parts.map(function (part) {
            if (typeof part === 'string')
                return part;
            var expr = self.bindValue(part.expr, scope);
            if (expr.type.kind === 'void')
                self.error(part.expr, 'CS0029', "Cannot implicitly convert type 'void' to 'object'");
            var alignment = null;
            if (part.alignment !== null) {
                var aligned = self.bindAs(part.alignment, scope, CS.intType());
                if (aligned.constant === undefined)
                    self.error(part.alignment, 'CS0150', 'A constant value is expected');
                alignment = big.toFloat(aligned.constant);
            }
            return { expr: expr, alignment: alignment, format: part.format };
        });
        var result = bound('interpolated', node, { parts: parts, type: CS.stringType() });
        // An interpolated string of constant strings is a constant (C# 10).
        if (parts.every(function (part) {
            return typeof part === 'string' || (part.expr.constant !== undefined && typeof part.expr.constant === 'string' &&
                                                part.alignment === null && part.format === null);
        }))
            result.constant = parts.map(function (part) { return typeof part === 'string' ? part : part.expr.constant; }).join('');
        return result;
    };

    // --- Names

    // A local, a member of an enclosing type, a type or a namespace.
    C.bind_name = function (node, scope) {
        var name = node.name;
        var typeArgs = node.args === null ? null : this.typeArguments(node.args, scope);
        if (typeArgs === null) {
            var local = this.lookupLocal(name, scope, node);
            if (local !== null)
                return local;
            if (name === '_' )
                return bound('discard', node, { type: undefined });
        }
        var member = this.lookupMemberName(name, typeArgs, scope, node);
        if (member !== null)
            return member;
        var arity = typeArgs === null ? 0 : typeArgs.length;
        var found = this.lookupSimpleTypeName(name, arity, scope, node);
        if (found !== null) {
            if (found.kind === 'namespace')
                return bound('namespaceExpr', node, { ns: found });
            var type = found.symbolKind === 'type' ? this.constructType(found, node, scope, null) : found;
            return bound('typeExpr', node, { type: type });
        }
        var staticMember = this.lookupUsingStatic(name, typeArgs, scope, node);
        if (staticMember !== null)
            return staticMember;
        if (name === 'nameof')
            this.error(node, 'CS0103', "The name 'nameof' does not exist in the current context");
        this.error(node, 'CS0103', "The name '" + name + "' does not exist in the current context");
    };

    C.typeArguments = function (args, scope) {
        var self = this;
        return args.map(function (arg) { return self.resolveType(arg, scope); });
    };

    // Locals and parameters of the enclosing functions; a use from a lambda
    // or a local function marks the variable captured.
    C.lookupLocal = function (name, scope, node) {
        var crossed = false;
        for (var current = scope; current !== null; current = current.parent) {
            if (current.kind === 'type' || current.kind === 'namespace')
                return null;
            if (current.locals !== null && current.locals[name] !== undefined) {
                var local = current.locals[name];
                if (local.declaredAt !== undefined && local.declaredAt > 0 && node && node.line !== undefined &&
                    local.notYetDeclared)
                    this.error(node, 'CS0841', "Cannot use local variable '" + name + "' before it is declared");
                if (crossed) {
                    local.captured = true;
                    var fn = scope.functionScope();
                    if (fn !== null && fn.fn !== undefined && fn.fn.isStaticLocal && local.kind !== 'constant')
                        this.error(node, 'CS8421', "A static local function cannot contain a reference to '" + name + "'.");
                }
                if (local.kind === 'range')
                    return this.rangeVariable(local, node);
                if (local.isConst)
                    return this.constant(node, local.type, this.localConstant(local));
                if (local.kind === 'localFunction')
                    return bound('methodGroup', node, { receiver: null, methods: [{ member: local.method, owner: null }],
                                                        typeArgs: null, name: name, isBase: false, localFunction: true });
                return bound('local', node, { sym: local, type: local.type });
            }
            if (current.kind === 'lambda' || (current.kind === 'method' && current.fn && current.fn.kind === 'local'))
                crossed = true;
        }
        return null;
    };

    C.localConstant = function (local) {
        if (local.constant === undefined) {
            if (local.binding)
                this.error(local.node, 'CS0110', "The evaluation of the constant value for '" + local.name + "' involves a circular definition");
            local.binding = true;
            var value = this.bindAs(local.init, local.scope, local.type);
            local.binding = false;
            if (value.constant === undefined)
                this.error(local.init, 'CS0133', "The expression being assigned to '" + local.name + "' must be constant");
            local.constant = value.constant;
        }
        return local.constant;
    };

    // A simple name as a member of an enclosing type: instance members get
    // this (an error in a static context), outer types give only static
    // members.
    C.lookupMemberName = function (name, typeArgs, scope, node) {
        var innermost = true;
        for (var current = scope; current !== null; current = current.parent) {
            if (current.kind !== 'type')
                continue;
            var sym = current.sym;
            if (sym.primaryFields !== undefined && sym.primaryFields[name] !== undefined && typeArgs === null && innermost) {
                var primary = sym.primaryFields[name];
                if (this.inStaticContext(scope))
                    this.error(node, 'CS9105', "Cannot use primary constructor parameter '" + name + "' in this context.");
                if (scope.enclosing('method') !== null && scope.enclosing('method').method &&
                    scope.enclosing('method').method.isCtor && !scope.enclosing('method').method.isPrimary &&
                    scope.enclosing('method').method.owner === sym) {
                    // Inside other constructors the parameters are captured too.
                }
                return bound('field', node, { receiver: this.thisValue(node, scope), field: primary, ownerType: CS.selfType(sym),
                                              type: primary.type });
            }
            var selfType = CS.selfType(sym);
            var found = this.accessible(CS.lookupMembers(selfType, name), sym);
            // With type arguments only methods and types match (C# 12.8.4).
            if (typeArgs !== null)
                found = found.filter(function (entry) { return entry.member.symbolKind === 'method' || entry.member.symbolKind === 'type'; });
            if (found.length > 0) {
                var receiver = null;
                var isStatic = this.inStaticContext(scope) || !innermost;
                receiver = isStatic ? null : this.thisValue(node, scope);
                return this.memberResult(found, receiver, true, typeArgs, node, scope, { implicitThis: true,
                                                                                         staticContext: isStatic });
            }
            innermost = false;
        }
        return null;
    };

    C.lookupUsingStatic = function (name, typeArgs, scope, node) {
        for (var current = scope; current !== null; current = current.parent) {
            if (current.kind !== 'namespace')
                continue;
            for (var index = 0; index < current.usingStatic.length; ++index) {
                var item = current.usingStatic[index];
                if (item.type === null)
                    item.type = CS.named(this.symtab.typeNamed(item.qname), []);
                var found = this.accessible(CS.lookupMembers(item.type, name), scope.currentType()).filter(function (entry) {
                    return entry.member.isStatic || entry.member.isConst || entry.member.symbolKind === 'type';
                });
                if (found.length > 0)
                    return this.memberResult(found, null, true, typeArgs, node, scope, { usingStatic: true });
            }
        }
        return null;
    };

    // Members visible from the code of a type.
    C.accessible = function (found, fromType) {
        if (this.library)
            return found;
        return found.filter(function (entry) { return CS.isAccessible(entry.member, fromType); });
    };

    // Static code: a static method, a static constructor or initializer, a
    // static local function or lambda.
    C.inStaticContext = function (scope) {
        for (var current = scope; current !== null; current = current.parent) {
            if (current.kind === 'lambda' && current.fn && current.fn.isStatic)
                return true;
            if (current.kind === 'method') {
                if (current.fn && current.fn.kind === 'local' && current.fn.isStaticLocal)
                    return true;
                if (current.fn && current.fn.kind === 'local')
                    continue;
                if (current.staticContext !== undefined)
                    return current.staticContext;
                var method = current.method;
                return method === undefined || method === null || method.isStatic || method.isStaticCtor === true;
            }
            if (current.kind === 'type')
                return current.staticContext === true;
        }
        return true;
    };

    C.thisValue = function (node, scope) {
        var type = scope.currentType();
        if (type === null || this.inStaticContext(scope))
            this.error(node, 'CS0026', "Keyword 'this' is not valid in a static property, static method, or static field initializer");
        this.markThisUse(scope);
        return bound('this', node, { type: CS.selfType(type), implicit: true });
    };

    // Lambdas and local functions that use this: their code keeps it.
    C.markThisUse = function (scope) {
        for (var current = scope; current !== null; current = current.parent) {
            if ((current.kind === 'lambda' || current.kind === 'method') && current.fn)
                current.fn.usesThis = true;
            if (current.kind === 'type')
                return;
        }
    };

    // The result of a member lookup: a method group, a field, a property, an
    // event or a nested type. receiver: the value (null - a type or static).
    C.memberResult = function (found, receiver, viaType, typeArgs, node, scope, options) {
        options = options || {};
        var first = found[0].member;
        if (first.symbolKind === 'method') {
            return bound('methodGroup', node, { receiver: receiver, methods: found, typeArgs: typeArgs, name: first.name,
                                                isBase: !!options.isBase, viaType: !!options.typeAccess,
                                                staticContext: !!options.staticContext, implicitThis: !!options.implicitThis,
                                                receiverType: options.receiverType || null });
        }
        if (typeArgs !== null && first.symbolKind !== 'type')
            this.error(node, 'CS0307', "The " + (first.symbolKind === 'field' ? 'field' : 'property') + " '" + first.name +
                       "' cannot be used with type arguments");
        var owner = found[0].owner;
        var map = CS.typeMap(owner);
        var memberName = CS.symbolTypeName(first.owner) + '.' + first.name;
        if (first.symbolKind === 'type') {
            var nestedType = CS.nestedIn(owner, first, typeArgs || []);
            return bound('typeExpr', node, { type: nestedType });
        }
        var isStatic = first.isStatic || first.isConst;
        if (!isStatic && receiver === null) {
            if (options.implicitThis || options.typeAccess || options.usingStatic)
                this.error(node, 'CS0120', "An object reference is required for the non-static field, method, or property '" +
                           memberName + "'");
        }
        if (isStatic && receiver !== null && !options.implicitThis) {
            if (!options.colorColor)
                this.error(node, 'CS0176', "Member '" + memberName + "' cannot be accessed with an instance reference; qualify it with a type name instead");
            receiver = null;
        }
        if (isStatic)
            receiver = null;
        switch (first.symbolKind) {
        case 'field': {
            var fieldType = CS.subst(first.type, map);
            if (first.isConst || first.enumMember)
                return this.constant(node, fieldType, this.constantOf(first));
            return bound('field', node, { receiver: receiver, field: first, ownerType: owner, type: fieldType });
        }
        case 'property':
            return bound('property', node, { receiver: receiver, property: first, ownerType: owner, args: [],
                                             type: CS.subst(first.type, map), isBase: !!options.isBase });
        case 'event': {
            var currentType = scope.currentType();
            var fieldLike = first.isFieldLike && currentType !== null &&
                (currentType === first.owner || currentType.original === first.owner);
            return bound('eventAccess', node, { receiver: receiver, event: first, ownerType: owner, type: CS.subst(first.type, map),
                                                fieldLike: fieldLike });
        }
        }
        this.error(node, 'CS0118', "'" + first.name + "' is not a value");
    };

    // The value of a constant field or an enum member (evaluated at the first use).
    C.constantOf = function (field) {
        if (field.enumMember && !field.owner.enumValuesDone) {
            var enumChecker = field.owner.checker || this;
            enumChecker.enumValues(field.owner);
        }
        if (field.constantPending) {
            if (field.evaluating)
                this.error(field.node, 'CS0110', "The evaluation of the constant value for '" + CS.symbolTypeName(field.owner) + '.' +
                           field.name + "' involves a circular definition");
            field.evaluating = true;
            var checker = field.owner.checker || this;
            var scope = field.owner.scope.child('method', { method: null, staticContext: true });
            var target = field.enumMember ? field.owner.enumUnderlying : field.type;
            var value = checker.bindExpr(field.init, scope);
            if (field.enumMember && value.type !== undefined && CS.sameType(value.type, field.type))
                value = bound('literal', field.init, { type: target, constant: value.constant });
            value = checker.convert(value, target, field.init, false);
            field.evaluating = false;
            if (value.constant === undefined)
                checker.error(field.init, 'CS0133', "The expression being assigned to '" + CS.symbolTypeName(field.owner) + '.' +
                              field.name + "' must be constant");
            if (!field.enumMember && !CS.isSpecial(field.type, 'string') && !CS.isNumeric(field.type) &&
                !CS.isSpecial(field.type, 'bool') && !CS.isEnum(field.type) && value.constant !== null)
                checker.error(field.node, 'CS0283', "The type '" + CS.typeName(field.type) + "' cannot be declared const");
            field.constant = value.constant;
            field.constantPending = false;
        }
        return field.constant;
    };

    // --- Member access

    C.bind_member = function (node, scope) {
        var target = node.target;
        var left = this.bindExpr(target, scope);
        var typeArgs = node.args === null ? null : this.typeArguments(node.args, scope);
        return this.memberAccess(left, node.name, typeArgs, node, scope, target);
    };

    C.bind_predef = function (node) {
        if (node.name === 'void')
            this.error(node, 'CS1547', "Keyword 'void' cannot be used in this context");
        return bound('typeExpr', node, { type: CS.special(node.name) });
    };

    C.bind_aliasName = function (node, scope) {
        var type = this.lookupNamespaceOrType({ k: 'alias', alias: node.alias, line: node.line, column: node.column,
                                                name: { k: 'tname', name: node.name, args: node.args, line: node.line,
                                                        column: node.column } }, scope);
        if (type === null)
            this.error(node, 'CS0400', "The type or namespace name '" + node.name + "' could not be found in the global namespace (are you missing an assembly reference?)");
        if (type.kind === 'namespace')
            return bound('namespaceExpr', node, { ns: type });
        return bound('typeExpr', node, { type: type });
    };

    C.memberAccess = function (left, name, typeArgs, node, scope, targetNode) {
        var arity = typeArgs === null ? 0 : typeArgs.length;
        var fromType = scope.currentType();
        if (left.k === 'namespaceExpr') {
            var ns = left.ns;
            if (arity === 0) {
                var sub = this.symtab.namespace(ns.qname === '' ? name : ns.qname + '.' + name);
                if (sub !== null)
                    return bound('namespaceExpr', node, { ns: sub });
            }
            var typeSym = this.symtab.typeIn(ns, name, arity);
            if (typeSym === null)
                this.error(node, 'CS0234', "The type or namespace name '" + name + "' does not exist in the namespace '" + ns.qname +
                           "' (are you missing an assembly reference?)");
            return bound('typeExpr', node, { type: this.constructType(typeSym, { args: node.args, line: node.line,
                                                                                 column: node.column }, scope, null) });
        }
        if (left.k === 'typeExpr') {
            var type = left.type;
            if (type.kind === 'named') {
                var nested = CS.findNestedType(type.sym.complete(), name, arity);
                if (nested !== null) {
                    var found = this.accessible(CS.lookupMembers(type, name), fromType).filter(function (entry) {
                        return entry.member.symbolKind !== 'type';
                    });
                    if (found.length === 0)
                        return bound('typeExpr', node, { type: CS.nestedIn(type, nested, typeArgs || []) });
                }
            }
            if (type.kind === 'tparam')
                return this.typeParamStaticAccess(type, name, typeArgs, node, scope);
            var members = this.accessible(CS.lookupMembers(type, name), fromType);
            if (members.length === 0)
                this.noMember(type, name, node, true);
            return this.memberResult(members, null, true, typeArgs, node, scope, { typeAccess: true });
        }
        if (left.k === 'methodGroup')
            this.error(node, 'CS0119', "'" + left.name + "' is a method, which is not valid in the given context");
        var value = this.requireValue(left, targetNode || node);
        if (value.k === 'base')
            return this.baseAccess(value, name, typeArgs, node, scope);
        var valueType = value.type;
        if (valueType.kind === 'void')
            this.error(node, 'CS0023', "Operator '.' cannot be applied to operand of type 'void'");
        if (valueType.kind === 'null')
            this.error(node, 'CS0023', "Operator '.' cannot be applied to operand of type '<null>'");
        if (valueType.kind === 'dynamic')
            return bound('dynamicMember', node, { receiver: value, name: name, type: CS.DYNAMIC });
        if (CS.isNullableValue(valueType) && name !== 'HasValue' && name !== 'Value' && name !== 'GetValueOrDefault' &&
            name !== 'Equals' && name !== 'GetHashCode' && name !== 'ToString' && name !== 'GetType')
            this.noMember(valueType, name, node, false);
        // The names of the elements of a tuple: Item1, Item2... (Rest.Item1
        // from the eighth on).
        if (CS.isTuple(valueType) && arity === 0 && valueType.tupleNames) {
            var tupleIndex = valueType.tupleNames.indexOf(name);
            if (tupleIndex >= 0)
                return this.tupleElementAccess(value, valueType, tupleIndex, node, scope);
        }
        var found2 = this.accessible(CS.lookupMembers(valueType, name), fromType);
        // Color Color: a name that is a value and a type of the same name
        // reaches the static members of the type too.
        if (targetNode && targetNode.k === 'name' && valueType.kind === 'named' && valueType.sym.name === targetNode.name) {
            var statics = found2.filter(function (entry) { return entry.member.isStatic || entry.member.isConst || entry.member.enumMember; });
            if (statics.length > 0 && statics.length === found2.length && statics[0].member.symbolKind !== 'method')
                return this.memberResult(statics, null, true, typeArgs, node, scope, { typeAccess: true });
            if (statics.length > 0 && statics[0].member.symbolKind === 'method')
                return this.memberResult(found2, value, false, typeArgs, node, scope, { colorColor: true });
        }
        if (found2.length === 0) {
            // Extension methods are found when the access is called.
            return bound('methodGroup', node, { receiver: value, methods: [], typeArgs: typeArgs, name: name, isBase: false,
                                                extensionOnly: true });
        }
        if (found2[0].member.symbolKind === 'type')
            this.error(node, 'CS0572', "'" + name + "': cannot reference a type through an expression; try '" +
                       CS.typeName(valueType) + '.' + name + "' instead");
        return this.memberResult(found2, value, false, typeArgs, node, scope, {});
    };

    // T.M where T : I: a static abstract or virtual member of I, found at
    // run time on the type argument.
    C.typeParamStaticAccess = function (type, name, typeArgs, node, scope) {
        var members = this.accessible(CS.lookupMembers(type, name), scope.currentType()).filter(function (entry) {
            var member = entry.member;
            var method = member.symbolKind === 'property' ? CS.findGetter(member) || member.setter : member;
            return member.isStatic && entry.owner.sym.kind === 'interface' && method !== null && method !== undefined &&
                (method.isAbstract || method.isVirtual);
        });
        if (members.length === 0)
            this.error(node, 'CS0704', "Cannot do non-virtual member lookup in '" + type.sym.name + "' because it is a type parameter");
        var result = this.memberResult(members, null, true, typeArgs, node, scope, { typeAccess: true });
        result.typeParam = type;
        return result;
    };

    C.tupleElementAccess = function (value, type, index, node, scope) {
        if (index < 7)
            return this.memberAccess(value, 'Item' + (index + 1), null, node, scope, null);
        var rest = this.memberAccess(value, 'Rest', null, node, scope, null);
        var restType = CS.named(rest.type.sym, rest.type.args);
        return this.tupleElementAccess(rest, restType, index - 7, node, scope);
    };

    // base.Member: non-virtual access to the members of the base class.
    C.baseAccess = function (baseValue, name, typeArgs, node, scope) {
        var baseType = baseValue.type;
        var found = this.accessible(CS.lookupMembers(baseType, name), scope.currentType());
        if (found.length === 0)
            this.noMember(baseType, name, node, false);
        var thisValue = bound('this', node, { type: CS.selfType(scope.currentType()) });
        return this.memberResult(found, thisValue, false, typeArgs, node, scope, { isBase: true });
    };

    C.noMember = function (type, name, node, viaType) {
        if (viaType || type.kind !== 'named' && type.kind !== 'array' && type.kind !== 'tparam')
            this.error(node, 'CS0117', "'" + CS.typeName(type) + "' does not contain a definition for '" + name + "'");
        this.error(node, 'CS1061', "'" + CS.typeName(type) + "' does not contain a definition for '" + name +
                   "' and no accessible extension method '" + name + "' accepting a first argument of type '" + CS.typeName(type) +
                   "' could be found (are you missing a using directive or an assembly reference?)");
    };

    // --- this, base, default, typeof, sizeof, nameof

    C.bind_this = function (node, scope) {
        var type = scope.currentType();
        if (type === null || type.isSession || this.inStaticContext(scope))
            this.error(node, 'CS0026', "Keyword 'this' is not valid in a static property, static method, or static field initializer");
        this.markThisUse(scope);
        return bound('this', node, { type: CS.selfType(type) });
    };

    C.bind_base = function (node, scope) {
        var type = scope.currentType();
        if (type === null || this.inStaticContext(scope))
            this.error(node, 'CS1511', "Keyword 'base' is not available in a static method");
        if (type.baseType === null)
            this.error(node, 'CS0175', "Use of keyword 'base' is not valid in this context");
        this.markThisUse(scope);
        return bound('base', node, { type: type.baseType });
    };

    C.bind_default = function (node, scope) {
        if (node.type === null)
            return bound('defaultLiteral', node, {});
        var type = this.resolveType(node.type, scope);
        return this.defaultOf(type, node);
    };

    C.defaultOf = function (type, node) {
        if (CS.isReferenceType(type) && type.kind !== 'tparam')
            return bound('literal', node, { type: type, constant: null });
        if (CS.isNumeric(type))
            return this.constant(node, type, CS.isSpecial(type, 'decimal') ? CS.decimal.ZERO : 0);
        if (CS.isSpecial(type, 'bool'))
            return this.constant(node, type, false);
        if (CS.isEnum(type))
            return this.constant(node, type, 0);
        return bound('default', node, { type: type });
    };

    C.bind_typeof = function (node, scope) {
        var type;
        if (node.type.k === 'predef' && node.type.name === 'void')
            type = CS.VOID;
        else
            type = this.resolveType(node.type, scope);
        return bound('typeof', node, { target: type, type: CS.libraryType('System.Type') });
    };

    C.bind_sizeof = function (node, scope) {
        var type = this.resolveType(node.type, scope);
        var sizes = { bool: 1, byte: 1, sbyte: 1, short: 2, ushort: 2, char: 2, int: 4, uint: 4, float: 4, long: 8, ulong: 8,
                      double: 8, decimal: 16 };
        var keyword = CS.keywordOf(type);
        if (CS.isEnum(type))
            keyword = CS.keywordOf(type.sym.complete().enumUnderlying);
        if (keyword === null || sizes[keyword] === undefined)
            this.error(node, 'CS0233', "'" + CS.typeName(type) + "' does not have a predefined size, therefore sizeof can only be used in an unsafe context");
        return this.constant(node, CS.intType(), sizes[keyword]);
    };

    C.bind_nameof = function (node, scope) {
        var target = node.expr;
        var name;
        switch (target.k) {
        case 'name':
            name = target.name;
            break;
        case 'member':
            name = target.name;
            break;
        case 'predef':
            this.error(target, 'CS1525', "Invalid expression term '" + target.name + "'");
            break;
        default:
            this.error(target, 'CS8081', 'Expression does not have a name.');
        }
        // The name must exist.
        var self = this;
        var resolved = this.attemptBind(function () { return self.bindExpr(target, scope); });
        if (resolved === null && target.k === 'name')
            this.error(target, 'CS0103', "The name '" + target.name + "' does not exist in the current context");
        return this.constant(node, CS.stringType(), name);
    };

    // A binding that may fail: null on a compile error.
    C.attemptBind = function (callback) {
        ++this.speculative;
        try {
            return callback();
        } catch (error) {
            if (error instanceof T.CompileError)
                return null;
            throw error;
        } finally {
            --this.speculative;
        }
    };
    CS.Checker.prototype.speculative = 0;

    C.bind_paren = function (node, scope) {
        var inner = this.bindExpr(node.expr, scope);
        if (inner.k === 'typeExpr' || inner.k === 'namespaceExpr')
            this.requireValue(inner, node.expr);
        if (inner.k === 'literal' || inner.k === 'methodGroup')
            return inner;
        inner.parenthesized = true;
        return inner;
    };

    C.bind_checkedExpr = function (node, scope) {
        var inner = scope.child('block', { checked: node.checked });
        var expr = this.bindExpr(node.expr, inner);
        return expr;
    };

    // Overflow checking of the scope: checked/unchecked blocks and expressions.
    C.isChecked = function (scope) {
        for (var current = scope; current !== null; current = current.parent) {
            if (current.checked !== undefined)
                return current.checked;
        }
        return false;
    };

    // --- Conversions of expressions

    // The conversion of an expression to a type: null if there is none.
    // explicit - a cast.
    C.classify = function (expr, target, explicit) {
        var self = this;
        switch (expr.k) {
        case 'unboundLambda':
            if (!CS.isDelegate(target) && !(target.kind === 'named' && target.sym.qname === 'System.Delegate'))
                return null;
            if (target.kind === 'named' && (target.sym.qname === 'System.Delegate' || target.sym.qname === 'System.MulticastDelegate'))
                return this.naturalLambdaType(expr) !== null ? { kind: 'lambda', natural: true } : null;
            return this.lambdaCompatible(expr, target) ? { kind: 'lambda' } : null;
        case 'methodGroup':
            if (!CS.isDelegate(target)) {
                if (target.kind === 'named' && (target.sym.qname === 'System.Delegate' || target.sym.qname === 'System.MulticastDelegate'))
                    return this.naturalMethodGroupType(expr) !== null ? { kind: 'methodGroup', natural: true } : null;
                return null;
            }
            return this.methodGroupConversion(expr, target, null) !== null ? { kind: 'methodGroup' } : null;
        case 'defaultLiteral':
            return { kind: 'default' };
        case 'throwExpr':
            return { kind: 'throw' };
        case 'targetNew':
            if (target.kind === 'named' && (target.sym.kind === 'class' || target.sym.kind === 'struct') && !target.sym.mods.abstract)
                return { kind: 'targetNew' };
            if (target.kind === 'tparam')
                return { kind: 'targetNew' };
            return null;
        case 'tupleLiteral': {
            if (CS.isTuple(target)) {
                var elements = CS.tupleElements(target);
                if (elements.length !== expr.items.length)
                    return null;
                var parts = [];
                for (var index = 0; index < elements.length; ++index) {
                    var part = this.classify(expr.items[index], elements[index], explicit);
                    if (part === null)
                        return null;
                    parts.push(part);
                }
                return { kind: 'tupleLiteral', parts: parts };
            }
            var natural = this.attemptBind(function () { return self.naturalTuple(expr, null); });
            if (natural === null)
                return null;
            var viaNatural = Conversions.implicit(natural.type, target) || (explicit ? Conversions.explicit(natural.type, target) : null);
            return viaNatural === null ? null : { kind: 'tupleNatural', inner: viaNatural };
        }
        case 'collectionLiteral':
            return this.collectionTarget(target) !== null ? { kind: 'collection' } : null;
        case 'targetTyped': {
            for (var armIndex = 0; armIndex < expr.arms.length; ++armIndex) {
                if (this.classify(expr.arms[armIndex], target, false) === null)
                    return null;
            }
            return { kind: 'targetTyped' };
        }
        case 'eventAccess':
        case 'typeExpr':
        case 'namespaceExpr':
            return null;
        }
        if (expr.type === undefined)
            return null;
        var from = expr.type;
        // Implicit constant conversions: int constants to smaller types,
        // the literal 0 to enums.
        if (expr.constant !== undefined && expr.constant !== null && !explicit) {
            if (CS.isSpecial(from, 'int') && CS.isIntegral(target) && Conversions.constantFits(expr.constant, target))
                return { kind: 'constant' };
            if (CS.isNullableValue(target) && CS.isSpecial(from, 'int') && CS.isIntegral(target.args[0]) &&
                Conversions.constantFits(expr.constant, target.args[0]))
                return { kind: 'nullable', inner: { kind: 'constant' }, from: from, to: target };
            if (CS.isSpecial(from, 'long') && CS.isSpecial(target, 'ulong') && big.sign(expr.constant) >= 0)
                return { kind: 'constant' };
            if (CS.isIntegral(from) && !CS.isSpecial(from, 'char') && big.sign(expr.constant) === 0 &&
                (CS.isEnum(target) || (CS.isNullableValue(target) && CS.isEnum(target.args[0]))) && expr.k === 'literal')
                return { kind: 'constantEnum' };
        }
        if (expr.k === 'interpolated' && target.kind === 'named' &&
            (target.sym.qname === 'System.IFormattable' || target.sym.qname === 'System.FormattableString'))
            return { kind: 'reference', from: from, to: target };
        var conversion = Conversions.implicit(from, target);
        if (conversion === null && explicit)
            conversion = Conversions.explicit(from, target);
        if (conversion === null)
            conversion = this.userConversion(expr, from, target, explicit);
        return conversion;
    };

    // An implicit conversion exists.
    C.convertible = function (expr, target) {
        return this.classify(expr, target, false) !== null;
    };

    // The expression converted to the type, or the error of csc.
    C.convert = function (expr, target, node, explicit) {
        if (target === null || target === undefined)
            return this.requireValue(expr, node);
        if (expr.k === 'property')
            this.checkGetter(expr, node);
        if (expr.type !== undefined && CS.sameType(expr.type, target) && expr.k !== 'methodGroup' && expr.k !== 'eventAccess') {
            if (expr.type !== target && CS.isTuple(target))
                return this.withType(expr, target);
            return expr;
        }
        var conversion = this.classify(expr, target, explicit);
        if (conversion === null)
            this.conversionError(expr, target, node, explicit);
        return this.applyConversion(expr, conversion, target, node, explicit);
    };

    C.withType = function (expr, type) {
        var copy = {};
        Object.keys(expr).forEach(function (key) { copy[key] = expr[key]; });
        copy.type = type;
        return copy;
    };

    C.conversionError = function (expr, target, node, explicit) {
        var targetName = CS.typeName(target);
        switch (expr.k) {
        case 'unboundLambda':
            if (!CS.isDelegate(target))
                this.error(node, 'CS1660', "Cannot convert " + (expr.node.anonymous ? 'anonymous method' : 'lambda expression') +
                           " to type '" + targetName + "' because it is not a delegate type");
            this.lambdaError(expr, target, node);
            break;
        case 'methodGroup':
            if (!CS.isDelegate(target))
                this.error(node, 'CS0428', "Cannot convert method group '" + expr.name + "' to non-delegate type '" + targetName +
                           "'. Did you intend to invoke the method?");
            this.methodGroupConversion(expr, target, node);
            this.error(node, 'CS0123', "No overload for '" + expr.name + "' matches delegate '" + targetName + "'");
            break;
        case 'targetNew':
            this.error(node, 'CS8752', "The type '" + targetName + "' may not be used as the target type of new()");
            break;
        case 'tupleLiteral':
            if (CS.isTuple(target) && CS.tupleElements(target).length !== expr.items.length)
                this.error(node, 'CS8135', "Tuple with " + expr.items.length + " elements cannot be converted to type '" + targetName + "'.");
            for (var index = 0; CS.isTuple(target) && index < expr.items.length; ++index)
                this.convert(expr.items[index], CS.tupleElements(target)[index], node, explicit);
            break;
        case 'collectionLiteral':
            this.error(node, 'CS9174', "Cannot initialize type '" + targetName + "' with a collection expression because the type is not constructible.");
            break;
        case 'targetTyped':
            for (var armIndex = 0; armIndex < expr.arms.length; ++armIndex)
                this.convert(expr.arms[armIndex], target, expr.armNodes[armIndex] || node, false);
            break;
        case 'eventAccess':
            this.requireValue(expr, node);
            break;
        }
        if (expr.type === undefined)
            this.requireValue(expr, node);
        var from = expr.type;
        if (from.kind === 'null' && CS.isValueType(target))
            this.error(node, 'CS0037', "Cannot convert null to '" + targetName + "' because it is a non-nullable value type");
        if (expr.constant !== undefined && expr.constant !== null && CS.isIntegral(from) && CS.isIntegral(target) &&
            !Conversions.constantFits(expr.constant, target)) {
            if (!explicit)
                this.error(node, 'CS0031', "Constant value '" + this.constantText(expr.constant, from) + "' cannot be converted to a '" +
                           targetName + "'");
        }
        if (from.kind === 'void')
            this.error(node, 'CS0029', "Cannot implicitly convert type 'void' to '" + targetName + "'");
        if (explicit)
            this.error(node, 'CS0030', "Cannot convert type '" + CS.typeName(from) + "' to '" + targetName + "'");
        if (Conversions.explicit(from, target) !== null || this.userConversion(expr, from, target, true) !== null)
            this.error(node, 'CS0266', "Cannot implicitly convert type '" + CS.typeName(from) + "' to '" + targetName +
                       "'. An explicit conversion exists (are you missing a cast?)");
        this.error(node, 'CS0029', "Cannot implicitly convert type '" + CS.typeName(from) + "' to '" + targetName + "'");
    };

    // The bound conversion; constants fold.
    C.applyConversion = function (expr, conversion, target, node, explicit) {
        var self = this;
        switch (conversion.kind) {
        case 'lambda':
            if (conversion.natural)
                return this.convert(this.bindLambda(expr, this.naturalLambdaType(expr), node), target, node, explicit);
            return this.bindLambda(expr, target, node);
        case 'methodGroup':
            if (conversion.natural)
                return this.convert(this.convert(expr, this.naturalMethodGroupType(expr), node, false), target, node, explicit);
            return this.methodGroupConversion(expr, target, node);
        case 'default':
            return this.defaultOf(target, node);
        case 'throw':
            return bound('throwExpr', node, { expr: expr.expr, type: target });
        case 'targetNew':
            return this.bindTargetNew(expr, target, node);
        case 'tupleLiteral':
            return bound('tuple', node, { items: expr.items.map(function (item, index) {
                return self.convert(item, CS.tupleElements(target)[index], expr.itemNodes[index] || node, explicit);
            }), type: target });
        case 'tupleNatural':
            return this.convert(this.naturalTuple(expr, node), target, node, explicit);
        case 'collection':
            return this.bindCollection(expr, target, node);
        case 'targetTyped':
            return this.bindTargetTyped(expr, target, node);
        case 'constant':
            return this.constant(node, target, expr.constant);
        case 'constantEnum':
            if (CS.isNullableValue(target))
                return bound('conversion', node, { operand: this.constant(node, target.args[0], 0),
                                                   conversion: { kind: 'nullable', from: target.args[0], to: target, inner: { kind: 'identity' } },
                                                   type: target });
            return this.constant(node, target, 0);
        case 'identity':
            if (CS.isTuple(target) && expr.type !== undefined)
                return this.withType(expr, target);
            return expr;
        }
        var from = expr.type;
        // Constant folding of numeric and enum conversions.
        if (expr.constant !== undefined && expr.constant !== null && (conversion.kind === 'numeric' || conversion.kind === 'enum')) {
            var folded = this.foldConversion(expr.constant, from, target, node, explicit, conversion);
            if (folded !== undefined)
                return this.constant(node, target, folded);
        }
        if (expr.constant === null && conversion.kind === 'nullLiteral')
            return bound('literal', node, { type: target, constant: null });
        if (conversion.kind === 'nullable' && conversion.inner && conversion.inner.kind === 'constant') {
            var inner = this.constant(node, target.args[0], expr.constant);
            return bound('conversion', node, { operand: inner, conversion: { kind: 'nullable', from: target.args[0], to: target,
                                                                             inner: { kind: 'identity' } }, type: target });
        }
        var result = bound('conversion', node, { operand: expr, conversion: conversion, type: target, explicit: !!explicit,
                                                 checked: this.currentChecked === true });
        // A string constant converted to object stays a constant for attributes and defaults.
        if (conversion.kind === 'reference' && expr.constant !== undefined && typeof expr.constant === 'string')
            result.constant = expr.constant;
        if (conversion.kind === 'reference' && expr.constant === null)
            return bound('literal', node, { type: target, constant: null });
        return result;
    };

    // A numeric conversion of a constant; explicit ones out of range are
    // errors unless unchecked.
    C.foldConversion = function (value, from, target, node, explicit, conversion) {
        var source = CS.isEnum(from) ? from.sym.complete().enumUnderlying : from;
        var destination = CS.isEnum(target) ? target.sym.complete().enumUnderlying : target;
        if (CS.isSpecial(destination, 'bool') || CS.isSpecial(source, 'bool'))
            return undefined;
        var sourceDecimal = CS.isSpecial(source, 'decimal'), targetDecimal = CS.isSpecial(destination, 'decimal');
        var sourceFloat = CS.isFloating(source), targetFloat = CS.isFloating(destination);
        var unchecked = this.currentChecked === false;
        if (targetDecimal) {
            try {
                if (sourceDecimal)
                    return value;
                if (sourceFloat)
                    return CS.decimal.fromDouble(value, CS.isSpecial(source, 'float') ? 7 : 15);
                return CS.decimal.fromInteger(value);
            } catch (error) {
                if (error instanceof RangeError || error === null)
                    this.error(node, 'CS0031', "Constant value '" + this.constantText(value, source) + "' cannot be converted to a 'decimal'");
                throw error;
            }
        }
        if (targetFloat) {
            var number = sourceDecimal ? CS.decimal.toNumber(value) : (sourceFloat ? value : big.toFloat(value));
            return CS.isSpecial(destination, 'float') ? Math.fround(number) : number;
        }
        // To an integral type.
        var integer;
        if (sourceDecimal) {
            integer = CS.decimal.truncate(value);
        } else if (sourceFloat) {
            if (!isFinite(value)) {
                if (!unchecked)
                    this.error(node, 'CS0221', "Constant value '" + this.constantText(value, source) + "' cannot be converted to a '" +
                               CS.typeName(target) + "' (use 'unchecked' syntax to override)");
                return undefined;
            }
            integer = big.fromFloat(Math.trunc(value));
        } else {
            integer = value;
        }
        if (Conversions.constantFits(integer, destination))
            return integer;
        if (explicit && !unchecked)
            this.error(node, 'CS0221', "Constant value '" + this.constantText(value, source) + "' cannot be converted to a '" +
                       CS.typeName(target) + "' (use 'unchecked' syntax to override)");
        if (!explicit)
            return undefined;
        if (sourceFloat || sourceDecimal)
            return undefined;
        // unchecked: the low bits.
        var range = Conversions.rangeOf(CS.keywordOf(destination));
        var modulus = big.add(big.sub(range[1], range[0]), 1);
        var wrapped = big.mod(big.sub(integer, range[0]), modulus);
        return big.add(wrapped, range[0]);
    };

    // A property is read: it needs a getter.
    C.checkGetter = function (expr, node) {
        var property = expr.property;
        var getter = findGetter(property);
        if (getter === null)
            this.error(node, 'CS0154', "The property or indexer '" + this.propertyText(property) +
                       "' cannot be used in this context because it lacks the get accessor");
    };

    function findGetter(property) {
        for (var current = property; current !== null && current !== undefined; current = current.overridden) {
            if (current.getter !== null)
                return current.getter;
        }
        return null;
    }
    CS.findGetter = findGetter;

    function findSetter(property) {
        for (var current = property; current !== null && current !== undefined; current = current.overridden) {
            if (current.setter !== null)
                return current.setter;
        }
        return null;
    }
    CS.findSetter = findSetter;

    C.propertyText = function (property) {
        return CS.symbolTypeName(property.owner) + '.' + (property.isIndexer ? 'this[' + property.params.map(function (param) {
            return CS.typeName(param.type);
        }).join(', ') + ']' : property.name);
    };

    // --- Casts, is, as

    C.bind_cast = function (node, scope) {
        var type = this.resolveType(node.type, scope);
        var operand = this.bindExpr(node.operand, scope);
        if (type.kind === 'named' && type.sym.isStatic())
            this.error(node, 'CS0716', "Cannot convert to static type '" + CS.typeName(type) + "'");
        var saved = this.currentChecked;
        this.currentChecked = this.isChecked(scope) ? true : (this.explicitUnchecked(scope) ? false : undefined);
        try {
            if (operand.k === 'unboundLambda' || operand.k === 'methodGroup' || operand.k === 'tupleLiteral' ||
                operand.k === 'defaultLiteral' || operand.k === 'targetNew' || operand.k === 'targetTyped' ||
                operand.k === 'collectionLiteral' || operand.k === 'throwExpr')
                return this.convert(operand, type, node, true);
            operand = this.requireValue(operand, node.operand);
            var result = this.convert(operand, type, node, true);
            if (result === operand && operand.k !== 'literal')
                return bound('conversion', node, { operand: operand, conversion: { kind: 'identity', from: operand.type, to: type },
                                                   type: type, explicit: true });
            if (result.k === 'conversion')
                result.checked = this.isChecked(scope);
            return result;
        } finally {
            this.currentChecked = saved;
        }
    };

    // An unchecked context written explicitly (constant casts may overflow).
    C.explicitUnchecked = function (scope) {
        for (var current = scope; current !== null; current = current.parent) {
            if (current.checked !== undefined)
                return current.checked === false;
        }
        return false;
    };

    C.bind_as = function (node, scope) {
        var operand = this.bindValue(node.operand, scope);
        var type = this.resolveType(node.type, scope);
        if (CS.isValueType(type) && !CS.isNullableValue(type))
            this.error(node, 'CS0077', "The as operator must be used with a reference type or nullable type ('" + CS.typeName(type) +
                       "' is a non-nullable value type)");
        if (type.kind === 'tparam' && !CS.typeParamIsReference(type.sym))
            this.error(node, 'CS0413', "The type parameter '" + type.sym.name + "' cannot be used with the 'as' operator because it does not have a class type constraint nor a 'class' constraint");
        var conversion = Conversions.implicit(operand.type, type);
        if (conversion === null && Conversions.explicit(operand.type, type) === null && !CS.isSpecial(operand.type, 'object') &&
            operand.type.kind !== 'tparam' && type.kind !== 'tparam' && operand.type.kind !== 'null')
            this.error(node, 'CS0039', "Cannot convert type '" + CS.typeName(operand.type) + "' to '" + CS.typeName(type) +
                       "' via a reference conversion, boxing conversion, unboxing conversion, wrapping conversion, or null type conversion");
        return bound('as', node, { operand: operand, targetType: type, type: type });
    };

    C.bind_is = function (node, scope) {
        var operand = this.bindValue(node.operand, scope);
        if (operand.type.kind === 'void')
            this.error(node.operand, 'CS0023', "Operator 'is' cannot be applied to operand of type 'void'");
        var pattern = this.bindPattern(node.pattern, operand.type, scope, { isExpression: true });
        return bound('isPattern', node, { operand: operand, pattern: pattern, type: CS.boolType() });
    };

    // --- Conditional and coalescing

    C.bind_cond = function (node, scope) {
        var cond = this.bindCondition(node.cond, scope);
        var then = this.bindExpr(node.then, scope);
        var otherwise = this.bindExpr(node.otherwise, scope);
        if (node.isRef) {
            then = this.requireValue(then, node.then);
            otherwise = this.requireValue(otherwise, node.otherwise);
            return bound('conditional', node, { cond: cond, then: then, otherwise: otherwise, type: then.type, isRef: true });
        }
        var natural = this.bestCommonType([then, otherwise]);
        if (natural === null) {
            // C# 9: a conditional without a natural type is target-typed.
            var leftName = then.type !== undefined ? CS.typeName(then.type) : '<' + then.k + '>';
            var rightName = otherwise.type !== undefined ? CS.typeName(otherwise.type) : '<' + otherwise.k + '>';
            return bound('targetTyped', node, { what: 'conditional', cond: cond, arms: [then, otherwise], armNodes: [node.then, node.otherwise],
                                                natural: null, leftName: leftName, rightName: rightName });
        }
        var result = bound('conditional', node, { cond: cond, then: this.convert(then, natural, node.then, false),
                                                  otherwise: this.convert(otherwise, natural, node.otherwise, false),
                                                  type: natural });
        if (cond.constant !== undefined && result.then.constant !== undefined && result.otherwise.constant !== undefined)
            result.constant = cond.constant ? result.then.constant : result.otherwise.constant;
        return result;
    };

    // A target-typed conditional or switch expression converted.
    C.bindTargetTyped = function (expr, target, node) {
        var self = this;
        if (expr.what === 'conditional') {
            return bound('conditional', node, { cond: expr.cond,
                                                then: this.convert(expr.arms[0], target, expr.armNodes[0], false),
                                                otherwise: this.convert(expr.arms[1], target, expr.armNodes[1], false), type: target });
        }
        var arms = expr.switchArms.map(function (arm, index) {
            return { pattern: arm.pattern, when: arm.when, expr: self.convert(expr.arms[index], target, expr.armNodes[index], false),
                     scope: arm.scope };
        });
        return bound('switchExpr', node, { operand: expr.operand, arms: arms, type: target, exhaustive: expr.exhaustive });
    };

    // The best common type of expressions (C# 12.6.3.15), or null.
    C.bestCommonType = function (exprs) {
        var self = this;
        var candidates = [];
        exprs.forEach(function (expr) {
            if (expr.type !== undefined && expr.type.kind !== 'null' && expr.k !== 'methodGroup' && expr.k !== 'eventAccess' &&
                expr.k !== 'typeExpr' && expr.k !== 'namespaceExpr' &&
                !candidates.some(function (other) { return CS.sameType(other, expr.type); }))
                candidates.push(expr.type);
        });
        var fitting = candidates.filter(function (candidate) {
            if (candidate.kind === 'void')
                return false;
            return exprs.every(function (expr) { return self.convertible(expr, candidate); });
        });
        if (fitting.length === 0)
            return null;
        if (fitting.length === 1)
            return fitting[0];
        // The one that all the others convert to.
        var best = fitting.filter(function (candidate) {
            return fitting.every(function (other) {
                return other === candidate || Conversions.implicit(other, candidate) !== null;
            });
        });
        return best.length === 1 ? best[0] : null;
    };

    // --- Element access

    C.bind_index = function (node, scope) {
        var target = this.bindExpr(node.target, scope);
        return this.elementAccess(target, node, scope);
    };

    C.elementAccess = function (target, node, scope) {
        var self = this;
        if (target.k === 'base') {
            var indexers = this.accessible(CS.lookupMembers(target.type, 'this[]'), scope.currentType());
            if (indexers.length === 0)
                this.error(node, 'CS0021', "Cannot apply indexing with [] to an expression of type '" + CS.typeName(target.type) + "'");
            return this.indexerAccess(bound('this', node, { type: CS.selfType(scope.currentType()) }), indexers, node, scope, true);
        }
        target = this.requireValue(target, node.target);
        var type = target.type;
        node.args.forEach(function (arg) {
            if (arg.name !== null)
                self.error(arg, 'CS1742', 'An array access may not have a named argument specifier');
        });
        if (type.kind === 'dynamic')
            return bound('dynamicIndex', node, { receiver: target, args: node.args.map(function (arg) {
                return self.bindValue(arg.expr, scope);
            }), type: CS.DYNAMIC });
        if (type.kind === 'array') {
            if (node.args.length !== type.rank)
                this.error(node, 'CS0022', 'Wrong number of indices inside []; expected ' + type.rank);
            if (type.rank === 1 && node.args.length === 1) {
                var single = this.bindValue(node.args[0].expr, scope);
                if (this.isIndexType(single.type))
                    return bound('fromEndElement', node, { array: target, index: this.convert(single, single.type, node, false),
                                                           type: type.elem });
                if (this.isRangeType(single.type))
                    return bound('arraySlice', node, { array: target, range: single, type: type });
                return bound('arrayElement', node, { array: target, indices: [this.arrayIndex(single, node.args[0].expr)],
                                                     type: type.elem });
            }
            var indices = node.args.map(function (arg) { return self.arrayIndex(self.bindValue(arg.expr, scope), arg.expr); });
            return bound('arrayElement', node, { array: target, indices: indices, type: type.elem });
        }
        if (CS.isSpecial(type, 'string') && node.args.length === 1) {
            var index = this.bindValue(node.args[0].expr, scope);
            if (this.isIndexType(index.type))
                return bound('stringFromEnd', node, { string: target, index: index, type: CS.special('char') });
            if (this.isRangeType(index.type))
                return bound('stringSlice', node, { string: target, range: index, type: CS.stringType() });
            return bound('stringChar', node, { string: target, index: this.convert(index, CS.intType(), node.args[0].expr, false),
                                               type: CS.special('char') });
        }
        var found = this.accessible(CS.lookupMembers(type, 'this[]'), scope.currentType());
        if (found.length === 0) {
            // C# 8: a type with Count/Length and an int indexer takes ^i and ranges.
            this.error(node, 'CS0021', "Cannot apply indexing with [] to an expression of type '" + CS.typeName(type) + "'");
        }
        // list[^1]: an Index on a countable type with an int indexer.
        if (node.args.length === 1) {
            var argument = this.attemptBind(function () { return self.bindValue(node.args[0].expr, scope); });
            if (argument !== null && this.isIndexType(argument.type) && !found.some(function (entry) {
                return entry.member.params.length === 1 && self.isIndexType(entry.member.params[0].type);
            })) {
                var counted = this.indexerAccess(target, found, { k: 'index', args: [{ k: 'arg', name: null, refKind: '',
                                                                                      expr: { k: 'literal', kind: 'int',
                                                                                              value: { digits: '0', radix: 10, suffix: '' },
                                                                                              line: node.line, column: node.column },
                                                                                      line: node.line, column: node.column }],
                                                                 line: node.line, column: node.column }, scope, false);
                counted.fromEnd = argument;
                counted.countMember = this.countMember(type, node);
                return counted;
            }
        }
        return this.indexerAccess(target, found, node, scope, false);
    };

    // Count or Length of a type for ^i.
    C.countMember = function (type, node) {
        var found = CS.lookupMembers(type, 'Count');
        if (found.length === 0 || found[0].member.symbolKind !== 'property')
            found = CS.lookupMembers(type, 'Length');
        if (found.length === 0 || found[0].member.symbolKind !== 'property')
            this.error(node, 'CS0021', "Cannot apply indexing with [] to an expression of type '" + CS.typeName(type) + "'");
        return found[0];
    };

    C.isIndexType = function (type) {
        return type.kind === 'named' && type.sym.qname === 'System.Index';
    };

    C.isRangeType = function (type) {
        return type.kind === 'named' && type.sym.qname === 'System.Range';
    };

    // An array index: int, uint, long or ulong (converted to int at run time).
    C.arrayIndex = function (index, node) {
        var targets = ['int', 'uint', 'long', 'ulong'];
        for (var position = 0; position < targets.length; ++position) {
            var target = CS.special(targets[position]);
            if (this.convertible(index, target))
                return this.convert(index, target, node, false);
        }
        return this.convert(index, CS.intType(), node, false);
    };

    // --- Assignment

    C.bind_assign = function (node, scope) {
        if (node.op !== '=')
            return this.bindCompoundAssignment(node, scope);
        // Deconstruction: (a, b) = value, (var x, var y) = value.
        if (node.target.k === 'tuple')
            return this.bindDeconstructAssignment(node, scope);
        var target = this.bindExpr(node.target, scope);
        if (target.k === 'discard') {
            var discarded = this.bindValue(node.value, scope);
            return bound('discardAssign', node, { value: discarded, type: discarded.type });
        }
        if (target.k === 'eventAccess') {
            if (!target.fieldLike)
                this.error(node.target, 'CS0070', "The event '" + CS.symbolTypeName(target.event.owner) + '.' + target.event.name +
                           "' can only appear on the left hand side of += or -= (except when used from within the type '" +
                           CS.symbolTypeName(target.event.owner) + "')");
            target = bound('field', node.target, { receiver: target.receiver, field: target.event.backingField,
                                                   ownerType: target.ownerType, type: target.type });
        }
        if (node.value.k === 'refExpr') {
            // ref reassignment: r = ref x.
            var refTarget = this.bindValue(node.value.expr, scope);
            return bound('refAssign', node, { target: target, value: refTarget, type: target.type });
        }
        this.checkAssignable(target, node.target, scope);
        var value = this.bindAs(node.value, scope, target.type);
        return bound('assign', node, { target: target, value: value, type: target.type });
    };

    // Whether an expression is a variable that may be assigned.
    C.checkAssignable = function (target, node, scope) {
        switch (target.k) {
        case 'local':
            if (target.sym.readonly)
                this.error(node, target.sym.kind === 'foreach' ? 'CS1656' : 'CS1656', "Cannot assign to '" + target.sym.name + "' because it is a '" +
                           (target.sym.kind === 'foreach' ? 'foreach iteration variable' : (target.sym.kind === 'using' ? 'using variable' : 'read-only variable')) + "'");
            if (target.sym.refKind === 'in')
                this.error(node, 'CS8331', "Cannot assign to variable '" + target.sym.name + "' or use it as the right hand side of a ref assignment because it is a readonly variable");
            target.sym.assigned = true;
            return;
        case 'field': {
            var field = target.field;
            if (field.isConst)
                this.error(node, 'CS0131', 'The left-hand side of an assignment must be a variable, property or indexer');
            if (field.isReadonly && !this.inInitializerOf(field, scope, target))
                this.error(node, field.isStatic ? 'CS0198' : 'CS0191', field.isStatic
                    ? 'A static readonly field cannot be assigned to (except in a static constructor or a variable initializer)'
                    : 'A readonly field cannot be assigned to (except in a constructor or init-only setter of the type in which the field is defined or a variable initializer)');
            if (target.receiver !== null && target.receiver.type !== undefined && CS.isValueType(target.receiver.type) &&
                !this.isVariable(target.receiver))
                this.error(node, 'CS1612', "Cannot modify the return value of '" + this.exprText(target.receiver) +
                           "' because it is not a variable");
            return;
        }
        case 'property': {
            var property = target.property;
            var setter = findSetter(property);
            if (setter === null) {
                // A get-only auto-property is assigned in a constructor of its type.
                if (property.isAuto && this.inConstructorOf(property.owner, scope, property.isStatic) && target.receiver !== null &&
                    target.receiver.k === 'this' || (property.isAuto && property.isStatic && this.inConstructorOf(property.owner, scope, true))) {
                    target.backing = true;
                    return;
                }
                this.error(node, 'CS0200', "Property or indexer '" + this.propertyText(property) + "' cannot be assigned to -- it is read only");
            }
            if (setter.isInit && !this.inInitContext(property, scope, target))
                this.error(node, 'CS8852', "Init-only property or indexer '" + this.propertyText(property) +
                           "' can only be assigned in an object initializer, or on 'this' or 'base' in an instance constructor or an 'init' accessor.");
            if (target.receiver !== null && target.receiver.type !== undefined && CS.isValueType(target.receiver.type) &&
                !this.isVariable(target.receiver) && target.receiver.k !== 'this')
                this.error(node, 'CS1612', "Cannot modify the return value of '" + this.exprText(target.receiver) +
                           "' because it is not a variable");
            return;
        }
        case 'arrayElement':
        case 'fromEndElement':
        case 'this':
        case 'dynamicMember':
        case 'dynamicIndex':
            if (target.k === 'this' && !CS.isValueType(target.type))
                this.error(node, 'CS1604', "Cannot assign to 'this' because it is read-only");
            return;
        case 'stringChar':
            this.error(node, 'CS0200', "Property or indexer 'string.this[int]' cannot be assigned to -- it is read only");
            break;
        case 'refCall':
            return;
        case 'conversion':
            if (target.conversion.kind === 'identity' && target.operand !== undefined)
                return this.checkAssignable(target.operand, node, scope);
            break;
        case 'call':
            if (target.method.refReturn)
                return;
            break;
        }
        this.error(node, 'CS0131', 'The left-hand side of an assignment must be a variable, property or indexer');
    };

    // A variable (not a value): locals, fields of variables, array elements.
    C.isVariable = function (expr) {
        switch (expr.k) {
        case 'local':
        case 'arrayElement':
        case 'this':
        case 'initTarget':
            return true;
        case 'field':
            return expr.receiver === null || !CS.isValueType(expr.receiver.type) || this.isVariable(expr.receiver);
        case 'call':
            return !!expr.method.refReturn;
        }
        return false;
    };

    C.exprText = function (expr) {
        switch (expr.k) {
        case 'local':
            return expr.sym.name;
        case 'field':
            return (expr.receiver !== null && expr.receiver.k !== 'this' ? this.exprText(expr.receiver) + '.' : '') + expr.field.name;
        case 'property':
            return expr.property.isIndexer ? this.exprText(expr.receiver) + '[]' :
                (expr.receiver !== null && expr.receiver.k !== 'this' ? this.exprText(expr.receiver) + '.' : '') + expr.property.name;
        case 'call':
            return (expr.receiver !== null && expr.receiver.k !== 'this' ? this.exprText(expr.receiver) + '.' : '') + expr.method.name + '()';
        }
        return '?';
    };

    // A readonly field is assigned in a constructor (or a static
    // constructor) of its type, or in its initializer.
    C.inInitializerOf = function (field, scope, target) {
        var method = scope.enclosing('method');
        if (method === null)
            return false;
        if (method.fieldInit === field.owner)
            return true;
        var current = method.method;
        if (current === null || current === undefined)
            return method.fieldInit !== undefined;
        if (current.accessorOf && current.isInit && current.owner === field.owner)
            return true;
        if (!current.isCtor || current.owner !== field.owner)
            return false;
        if (field.isStatic !== !!current.isStaticCtor)
            return false;
        // Lambdas inside the constructor cannot assign.
        if (scope.enclosing('lambda') !== null)
            return false;
        return field.isStatic || target.receiver === null || target.receiver.k === 'this';
    };

    C.inConstructorOf = function (owner, scope, isStatic) {
        var method = scope.enclosing('method');
        if (method === null || scope.enclosing('lambda') !== null)
            return method !== null && method.fieldInit === owner;
        if (method.fieldInit === owner)
            return true;
        var current = method.method;
        return current !== null && current !== undefined && current.isCtor && current.owner === owner &&
            !!current.isStaticCtor === !!isStatic;
    };

    C.inInitContext = function (property, scope, target) {
        if (target.inObjectInitializer || target.inWith)
            return true;
        var method = scope.enclosing('method');
        if (method === null)
            return false;
        var current = method.method;
        if (current === null || current === undefined)
            return method.fieldInit !== undefined;
        if (current.isCtor && (target.receiver === null || target.receiver.k === 'this'))
            return true;
        return !!(current.accessorOf && current.isInit && (target.receiver === null || target.receiver.k === 'this'));
    };

    // --- Tuples

    C.bind_tuple = function (node, scope) {
        var self = this;
        var items = node.items.map(function (item) {
            if (item.expr.k === 'declExpr')
                self.error(item.expr, 'CS8185', 'A declaration is not allowed in this context.');
            return self.bindExpr(item.expr, scope);
        });
        var names = node.items.map(function (item) {
            if (item.name !== null)
                return item.name;
            return null;
        });
        var result = bound('tupleLiteral', node, { items: items, names: names, itemNodes: node.items.map(function (item) { return item.expr; }) });
        // A tuple of values with types has its natural type at once.
        if (items.every(function (item) { return item.type !== undefined && item.k !== 'methodGroup' && item.type.kind !== 'null'; }))
            return this.naturalTuple(result, node);
        return result;
    };

    // The natural type of a tuple literal: the types of its elements; the
    // names of the elements are inferred from simple names (C# 7.1).
    C.naturalTuple = function (expr, node) {
        var self = this;
        var items = expr.items.map(function (item, index) {
            return self.requireValue(item, expr.itemNodes[index] || node);
        });
        var names = expr.names.map(function (name, index) {
            if (name !== null)
                return name;
            var item = expr.itemNodes[index];
            if (item && item.k === 'name')
                return item.name;
            if (item && item.k === 'member')
                return item.name;
            return null;
        });
        items.forEach(function (item, index) {
            if (item.type.kind === 'void')
                self.error(expr.itemNodes[index] || node, 'CS8210', 'A tuple may not contain a value of type \'void\'.');
        });
        return bound('tuple', node || expr, { items: items, type: CS.tupleType(items.map(function (item) { return item.type; }), names) });
    };
})(globalThis);
