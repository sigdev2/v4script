// C#: patterns (C# 9-11) - declaration, type, var, discard, constant,
// relational, not/and/or, positional, property and list patterns - and
// switch expressions.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    var C = CS.Checker.prototype;
    if (C.bindPattern)
        return;

    var bound = CS.bound;
    var Conversions = CS.Conversions;

    // A pattern for values of the input type. Result: { kind, inputType,
    // ... }; irrefutable - matches every value (not null for a type pattern).
    C.bindPattern = function (node, inputType, scope, options) {
        var method = this['pattern_' + node.k];
        if (method === undefined)
            this.error(node, 'CS1525', 'Invalid pattern');
        var pattern = method.call(this, node, inputType, scope, options || {});
        pattern.inputType = inputType;
        pattern.line = node.line;
        return pattern;
    };

    C.pattern_pdiscard = function () {
        return { kind: 'discard', irrefutable: true };
    };

    C.pattern_pvar = function (node, inputType, scope) {
        var target = this.designationLocals(node.designation, inputType, scope, node);
        return { kind: 'var', target: target, irrefutable: true };
    };

    // The locals of a designation: a name, _ or (a, b) (a deconstruction).
    C.designationLocals = function (designation, type, scope, node) {
        var self = this;
        if (designation.k === 'discard')
            return { kind: 'discard' };
        if (designation.k === 'single') {
            var local = this.declareLocal(designation.name, type, scope, designation, 'pattern');
            local.assigned = true;
            return { kind: 'local', local: local };
        }
        var parts = this.deconstructParts(type, designation.items.length, node, scope);
        return { kind: 'deconstruct', deconstructor: parts.method, items: designation.items.map(function (item, index) {
            return self.designationLocals(item, parts.types[index], scope, node);
        }) };
    };

    C.pattern_pdecl = function (node, inputType, scope) {
        var type = this.resolveType(node.type, scope);
        this.checkPatternType(inputType, type, node);
        var target = node.designation.k === 'discard' ? { kind: 'discard' } : this.designationLocals(node.designation, type, scope, node);
        return { kind: 'declaration', type: type, target: target, irrefutable: false,
                 exactInput: CS.sameType(type, inputType) && CS.isValueType(type) && !CS.isNullableValue(type) };
    };

    C.pattern_ptype = function (node, inputType, scope) {
        var type = this.resolveType(node.type, scope);
        if (CS.isNullableValue(type))
            this.error(node, 'CS8116', "It is not legal to use nullable type '" + CS.typeName(type) +
                       "' in a pattern; use the underlying type '" + CS.typeName(type.args[0]) + "' instead.");
        this.checkPatternType(inputType, type, node);
        return { kind: 'type', type: type, irrefutable: CS.sameType(type, inputType) && CS.isValueType(type) && !CS.isNullableValue(type) };
    };

    // A pattern of type T for an input of type I: I could hold a T.
    C.checkPatternType = function (inputType, type, node) {
        if (inputType.kind === 'dynamic' || inputType.kind === 'tparam' || type.kind === 'tparam')
            return;
        if (CS.sameType(CS.underlyingNullable(inputType), type))
            return;
        if (Conversions.implicit(inputType, type) !== null || Conversions.explicit(inputType, type) !== null)
            return;
        if (Conversions.implicit(type, inputType) !== null)
            return;
        this.error(node, 'CS8121', "An expression of type '" + CS.typeName(inputType) + "' cannot be handled by a pattern of type '" +
                   CS.typeName(type) + "'.");
    };

    // A constant pattern; a name that is a type is a type pattern.
    C.pattern_pconst = function (node, inputType, scope) {
        var value = this.bindExpr(node.expr, scope);
        if (value.k === 'typeExpr') {
            this.checkPatternType(inputType, value.type, node);
            return { kind: 'type', type: value.type, irrefutable: CS.sameType(value.type, inputType) && CS.isValueType(value.type) };
        }
        value = this.requireValue(value, node.expr);
        if (value.constant === undefined)
            this.error(node.expr, 'CS0150', 'A constant value is expected');
        if (value.constant === null) {
            if (CS.isValueType(inputType) && !CS.isNullableValue(inputType) && inputType.kind !== 'tparam')
                this.error(node.expr, 'CS0037', "Cannot convert null to '" + CS.typeName(inputType) + "' because it is a non-nullable value type");
            return { kind: 'null' };
        }
        // An input that may hold any type: the constant has its own type.
        var target = CS.underlyingNullable(inputType);
        if (CS.isSpecial(target, 'object') || target.kind === 'dynamic' || CS.isInterface(target) || target.kind === 'tparam' ||
            (target.kind === 'named' && (target.sym.qname === 'System.ValueType' || target.sym.qname === 'System.Enum'))) {
            return { kind: 'constant', value: value, testType: value.type, valueType: value.type };
        }
        var converted = this.convert(value, target, node.expr, false);
        return { kind: 'constant', value: converted, testType: CS.isNullableValue(inputType) ? target : null, valueType: target };
    };

    C.pattern_prel = function (node, inputType, scope) {
        var value = this.bindValue(node.expr, scope);
        if (value.constant === undefined)
            this.error(node.expr, 'CS0150', 'A constant value is expected');
        if (value.constant === null)
            this.error(node.expr, 'CS8781', 'Relational patterns may not be used for a value of type \'<null>\'.');
        var target = CS.underlyingNullable(inputType);
        var valueType, testType = null;
        if (CS.isSpecial(target, 'object') || target.kind === 'dynamic' || CS.isInterface(target) || target.kind === 'tparam') {
            valueType = value.type;
            testType = value.type;
        } else {
            if (!CS.isNumeric(target) && !CS.isEnum(target))
                this.error(node, 'CS8781', "Relational patterns may not be used for a value of type '" + CS.typeName(target) + "'.");
            value = this.convert(value, target, node.expr, false);
            valueType = target;
            testType = CS.isNullableValue(inputType) ? target : null;
        }
        if (CS.isFloating(valueType) && value.constant !== value.constant)
            this.error(node.expr, 'CS8782', "Relational patterns may not be used for a floating-point NaN.");
        return { kind: 'relational', op: node.op, value: value, valueType: valueType, testType: testType };
    };

    C.pattern_pnot = function (node, inputType, scope) {
        var inner = this.bindPattern(node.pattern, inputType, scope.child('block', { negated: true }));
        return { kind: 'not', pattern: inner, irrefutable: false };
    };

    C.pattern_pand = function (node, inputType, scope) {
        var left = this.bindPattern(node.left, inputType, scope);
        // The right pattern sees the type the left one narrowed to.
        var narrowed = narrowedType(left, inputType);
        var right = this.bindPattern(node.right, narrowed, scope);
        return { kind: 'and', left: left, right: right, irrefutable: left.irrefutable && right.irrefutable };
    };

    C.pattern_por = function (node, inputType, scope) {
        var left = this.bindPattern(node.left, inputType, scope.child('block', {}));
        var right = this.bindPattern(node.right, inputType, scope.child('block', {}));
        return { kind: 'or', left: left, right: right, irrefutable: left.irrefutable || right.irrefutable };
    };

    function narrowedType(pattern, inputType) {
        if (pattern.kind === 'type' || pattern.kind === 'declaration')
            return pattern.type;
        if (pattern.kind === 'recursive' && pattern.type !== null)
            return pattern.type;
        if (pattern.kind === 'and')
            return narrowedType(pattern.right, narrowedType(pattern.left, inputType));
        return inputType;
    }

    // Type(a, b) { P: x } designation, (a, b), { P: x }.
    C.pattern_precursive = function (node, inputType, scope) {
        var self = this;
        var type = inputType;
        if (node.type !== null) {
            type = this.resolveType(node.type, scope);
            this.checkPatternType(inputType, type, node);
        }
        type = CS.underlyingNullable(type);
        var positional = null;
        if (node.positional !== null) {
            if (CS.isTuple(type) || (type.kind === 'named' && type.sym.special === 'object' && node.type === null)) {
                var elements = CS.isTuple(type) ? CS.tupleElements(type) : null;
                if (elements === null) {
                    // (a, b) on an object: an ITuple; tuples of objects here.
                    elements = node.positional.map(function () { return CS.objectType(); });
                    type = CS.tupleType(elements, null);
                }
                if (elements.length !== node.positional.length)
                    this.error(node, 'CS8502', "Matching the tuple type '" + CS.typeName(type) + "' requires '" + elements.length +
                               "' subpatterns, but '" + node.positional.length + "' subpatterns are present.");
                positional = { deconstructor: null, items: node.positional.map(function (item, index) {
                    return self.bindPattern(item.pattern, elements[index], scope);
                }) };
            } else {
                var parts = this.deconstructParts(type, node.positional.length, node, scope);
                positional = { deconstructor: parts.method, items: node.positional.map(function (item, index) {
                    return self.bindPattern(item.pattern, parts.types[index], scope);
                }) };
            }
        }
        var properties = null;
        if (node.properties !== null) {
            properties = node.properties.map(function (property) {
                var current = type;
                var members = property.path.map(function (name) {
                    var found = self.accessible(CS.lookupMembers(current, name), scope.currentType()).filter(function (entry) {
                        return (entry.member.symbolKind === 'property' || entry.member.symbolKind === 'field') && !entry.member.isStatic;
                    });
                    if (found.length === 0)
                        self.error(property, 'CS0117', "'" + CS.typeName(current) + "' does not contain a definition for '" + name + "'");
                    var entry = found[0];
                    var memberType = CS.subst(entry.member.type, CS.typeMap(entry.owner));
                    var access = { member: entry.member, owner: entry.owner, type: memberType };
                    current = memberType;
                    return access;
                });
                return { members: members, pattern: self.bindPattern(property.pattern, current, scope) };
            });
        }
        var target = null;
        if (node.designation !== null && node.designation.k !== 'discard')
            target = this.designationLocals(node.designation, type, scope, node);
        return { kind: 'recursive', type: node.type !== null || !CS.sameType(type, inputType) ? type : null, positional: positional,
                 properties: properties, target: target, irrefutable: false };
    };

    // [a, .., b] for arrays, strings and lists.
    C.pattern_plist = function (node, inputType, scope) {
        var self = this;
        var type = inputType;
        var elementType;
        if (type.kind === 'array' && type.rank === 1)
            elementType = type.elem;
        else if (CS.isSpecial(type, 'string'))
            elementType = CS.special('char');
        else {
            var indexers = CS.lookupMembers(type, 'this[]').filter(function (entry) {
                return entry.member.params.length === 1 && CS.isSpecial(entry.member.params[0].type, 'int');
            });
            if (indexers.length === 0)
                this.error(node, 'CS8985', "List patterns may not be used for a value of type '" + CS.typeName(type) + "'. No suitable 'Length' or 'Count' property was found.");
            elementType = CS.subst(indexers[0].member.type, CS.typeMap(indexers[0].owner));
        }
        var sliceIndex = -1;
        var items = node.items.map(function (item, index) {
            if (item.k === 'pslice') {
                if (sliceIndex >= 0)
                    self.error(item, 'CS8980', 'Slice patterns may only be used once and directly inside a list pattern.');
                sliceIndex = index;
                var slicePattern = item.pattern !== null ? self.bindPattern(item.pattern, type, scope) : null;
                return { kind: 'slice', pattern: slicePattern };
            }
            return self.bindPattern(item, elementType, scope);
        });
        var target = node.designation !== null && node.designation.k !== 'discard'
            ? this.designationLocals(node.designation, type, scope, node) : null;
        return { kind: 'list', items: items, slice: sliceIndex, elementType: elementType, collectionType: type, target: target,
                 countMember: CS.isSpecial(type, 'string') || type.kind === 'array' ? null : this.countMember(type, node) };
    };

    C.pattern_pslice = function (node) {
        this.error(node, 'CS8980', 'Slice patterns may only be used once and directly inside a list pattern.');
    };

    // --- Switch expressions

    C.bind_switchExpr = function (node, scope) {
        var self = this;
        var operand = this.bindValue(node.operand, scope);
        var arms = node.arms.map(function (arm) {
            var armScope = scope.child('block', {});
            var pattern = self.bindPattern(arm.pattern, operand.type, armScope, { switchArm: true });
            var when = arm.when !== null ? self.bindCondition(arm.when, armScope) : null;
            var expr = self.bindExpr(arm.expr, armScope);
            return { pattern: pattern, when: when, expr: expr, scope: armScope, locals: armScope.declared || [] };
        });
        if (arms.length === 0)
            this.error(node, 'CS8506', 'No best type was found for the switch expression.');
        var exhaustive = arms.some(function (arm) { return arm.when === null && arm.pattern.irrefutable; }) ||
            this.boolExhaustive(arms, operand.type);
        var exprs = arms.map(function (arm) { return arm.expr; });
        var natural = this.bestCommonType(exprs.filter(function (expr) { return expr.k !== 'throwExpr'; }));
        if (natural === null || exprs.some(function (expr) {
            return expr.k === 'targetNew' || expr.k === 'defaultLiteral' || expr.k === 'unboundLambda' || expr.k === 'tupleLiteral';
        })) {
            return bound('targetTyped', node, { what: 'switch', operand: operand, arms: exprs,
                                                armNodes: node.arms.map(function (arm) { return arm.expr; }),
                                                switchArms: arms, natural: natural, exhaustive: exhaustive });
        }
        arms.forEach(function (arm, index) {
            arm.expr = self.convert(arm.expr, natural, node.arms[index].expr, false);
        });
        return bound('switchExpr', node, { operand: operand, arms: arms, type: natural, exhaustive: exhaustive });
    };

    // true and false constants of a bool cover it.
    C.boolExhaustive = function (arms, type) {
        if (!CS.isSpecial(type, 'bool'))
            return false;
        var seen = {};
        arms.forEach(function (arm) {
            if (arm.when === null && arm.pattern.kind === 'constant')
                seen[String(arm.pattern.value.constant)] = true;
        });
        return seen['true'] && seen['false'];
    };
})(globalThis);
