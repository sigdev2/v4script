// C#: operators - the predefined ones with numeric promotion, string
// concatenation, enum and delegate operators, user-defined and lifted
// operators, user-defined conversions, compound assignment, ++ and --,
// constant folding with the overflow checks of csc.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    var C = CS.Checker.prototype;
    if (C.bind_binary)
        return;

    var bound = CS.bound;
    var big = T.big;
    var Conversions = CS.Conversions;
    var NUMERIC = CS.NUMERIC;

    var OPERATOR_NAME = CS.OPERATOR_NAMES;

    // The type of the arithmetic of two numeric operands (binary numeric
    // promotion), or null if the pair is invalid.
    function promote(left, right) {
        var a = CS.keywordOf(left), b = CS.keywordOf(right);
        if (a === 'decimal' || b === 'decimal')
            return (a === 'float' || a === 'double' || b === 'float' || b === 'double') ? null : 'decimal';
        if (a === 'double' || b === 'double')
            return 'double';
        if (a === 'float' || b === 'float')
            return 'float';
        if (a === 'ulong' || b === 'ulong') {
            var other = a === 'ulong' ? b : a;
            return other === 'sbyte' || other === 'short' || other === 'int' || other === 'long' ? null : 'ulong';
        }
        if (a === 'long' || b === 'long')
            return 'long';
        if (a === 'uint' || b === 'uint') {
            var second = a === 'uint' ? b : a;
            return second === 'sbyte' || second === 'short' || second === 'int' ? 'long' : 'uint';
        }
        return 'int';
    }
    CS.promote = promote;

    // Unary promotion: small integral types become int.
    function unaryPromote(type) {
        var keyword = CS.keywordOf(type);
        switch (keyword) {
        case 'sbyte':
        case 'byte':
        case 'short':
        case 'ushort':
        case 'char':
            return 'int';
        }
        return keyword;
    }

    // --- Binary operators

    C.bind_binary = function (node, scope) {
        if (node.op === '&&' || node.op === '||')
            return this.bindLogical(node, scope);
        if (node.op === '??')
            return this.bindCoalesce(node, scope);
        // A long chain of + is bound without deep recursion.
        var left = this.bindValue(node.left, scope);
        var right = this.bindExpr(node.right, scope);
        if (right.k !== 'literal' || right.type.kind !== 'null')
            right = this.requireValue(right, node.right);
        return this.binaryOperator(node.op, left, right, node, scope);
    };

    C.binaryOperator = function (op, left, right, node, scope) {
        var checkedContext = this.isChecked(scope);
        // User-defined operators of the operand types come first.
        var user = this.userBinaryOperator(op, left, right, node, scope);
        if (user !== null)
            return user;
        var leftType = left.type, rightType = right.type;
        if (leftType.kind === 'dynamic' || rightType.kind === 'dynamic')
            return bound('dynamicBinary', node, { op: op, left: left, right: right, type: op === '==' || op === '!=' ||
                                                  op === '<' || op === '>' || op === '<=' || op === '>=' ? CS.boolType() : CS.DYNAMIC });
        switch (op) {
        case '+':
            if (CS.isSpecial(leftType, 'string') || CS.isSpecial(rightType, 'string') ||
                (leftType.kind === 'null' && CS.isSpecial(rightType, 'string')))
                return this.concatenation(left, right, node);
            if (CS.isDelegate(leftType) && (CS.sameType(leftType, rightType) || rightType.kind === 'null' ||
                                            right.k === 'unboundLambda' || right.k === 'methodGroup'))
                return this.delegateOperator(op, left, right, node);
            break;
        case '-':
            if (CS.isDelegate(leftType) && (CS.sameType(leftType, rightType) || rightType.kind === 'null'))
                return this.delegateOperator(op, left, right, node);
            break;
        case '==':
        case '!=': {
            var equality = this.equalityOperator(op, left, right, node, scope);
            if (equality !== null)
                return equality;
            break;
        }
        }
        // Enums.
        var enumResult = this.enumOperator(op, left, right, node, scope);
        if (enumResult !== null)
            return enumResult;
        // bool & | ^ == !=
        var bool = CS.boolType();
        if ((op === '&' || op === '|' || op === '^') && this.convertible(left, bool) && this.convertible(right, bool) &&
            !CS.isNumeric(leftType) && !CS.isNumeric(rightType))
            return this.fold(bound('binary', node, { op: op, left: this.convert(left, bool, node, false),
                                                    right: this.convert(right, bool, node, false), kind: 'bool', type: bool }));
        // Lifted operators: operands of nullable value types.
        var leftUnder = CS.underlyingNullable(leftType), rightUnder = CS.underlyingNullable(rightType);
        var lifted = CS.isNullableValue(leftType) || CS.isNullableValue(rightType) || leftType.kind === 'null' ||
            rightType.kind === 'null';
        if (leftType.kind === 'null')
            leftUnder = rightUnder;
        if (rightType.kind === 'null')
            rightUnder = leftUnder;
        if ((op === '&' || op === '|' || op === '^') && CS.isSpecial(leftUnder, 'bool') && CS.isSpecial(rightUnder, 'bool')) {
            var nullableBool = CS.nullableOf(bool);
            return bound('binary', node, { op: op, left: this.convert(left, nullableBool, node, false),
                                           right: this.convert(right, nullableBool, node, false), kind: 'bool', lifted: true,
                                           type: nullableBool });
        }
        if (!CS.isNumeric(leftUnder) || !CS.isNumeric(rightUnder))
            this.operatorError(op, left, right, node);
        // Shifts: the left operand decides, the right one is an int.
        if (op === '<<' || op === '>>' || op === '>>>') {
            var shifted = unaryPromote(leftUnder);
            if (shifted === 'float' || shifted === 'double' || shifted === 'decimal')
                this.operatorError(op, left, right, node);
            var count = unaryPromote(rightUnder);
            if (count !== 'int' && !(right.constant !== undefined && Conversions.constantFits(right.constant, CS.intType())))
                this.operatorError(op, left, right, node);
            var shiftType = CS.special(shifted);
            var countType = CS.intType();
            if (lifted) {
                shiftType = CS.nullableOf(shiftType);
                countType = CS.nullableOf(countType);
            }
            return this.fold(bound('binary', node, { op: op, left: this.convert(left, shiftType, node, false),
                                                    right: this.convert(right, countType, node, false), kind: NUMERIC[shifted],
                                                    lifted: lifted, type: shiftType, checked: checkedContext }), scope);
        }
        var keyword = promote(leftUnder, rightUnder);
        // A constant that fits: uint + 1 stays uint, not long.
        if (keyword === 'long' && (CS.isSpecial(leftUnder, 'uint') || CS.isSpecial(rightUnder, 'uint'))) {
            var constantSide = CS.isSpecial(leftUnder, 'uint') ? right : left;
            if (constantSide.constant !== undefined && constantSide.constant !== null && CS.isSpecial(constantSide.type, 'int') &&
                big.sign(constantSide.constant) >= 0)
                keyword = 'uint';
        }
        if (keyword === 'ulong' || keyword === null) {
            var signedSide = CS.isSpecial(leftUnder, 'ulong') ? right : left;
            if (keyword === null && signedSide.constant !== undefined && signedSide.constant !== null &&
                big.sign(signedSide.constant) >= 0 && !CS.isSpecial(leftUnder, 'decimal') && !CS.isSpecial(rightUnder, 'decimal') &&
                !CS.isFloating(leftUnder) && !CS.isFloating(rightUnder))
                keyword = 'ulong';
        }
        if (keyword === null)
            this.operatorError(op, left, right, node);
        var operandType = CS.special(keyword);
        var comparison = op === '<' || op === '>' || op === '<=' || op === '>=' || op === '==' || op === '!=';
        var bitwise = op === '&' || op === '|' || op === '^';
        if (bitwise && (keyword === 'float' || keyword === 'double' || keyword === 'decimal'))
            this.operatorError(op, left, right, node);
        var resultType = comparison ? bool : operandType;
        var convertType = operandType;
        if (lifted) {
            convertType = CS.nullableOf(operandType);
            resultType = comparison ? bool : CS.nullableOf(operandType);
        }
        var result = bound('binary', node, { op: op, left: this.convert(left, convertType, node.left || node, false),
                                              right: this.convert(right, convertType, node.right || node, false), kind: NUMERIC[keyword],
                                              lifted: lifted, type: resultType, checked: checkedContext });
        return this.fold(result, scope);
    };

    C.operatorError = function (op, left, right, node) {
        var leftName = left.type.kind === 'null' ? '<null>' : CS.typeName(left.type);
        var rightName = right.type.kind === 'null' ? '<null>' : CS.typeName(right.type);
        if (left.type.kind === 'null' && right.type.kind === 'null')
            this.error(node, 'CS0034', "Operator '" + op + "' is ambiguous on operands of type '<null>' and '<null>'");
        this.error(node, 'CS0019', "Operator '" + op + "' cannot be applied to operands of type '" + leftName + "' and '" + rightName + "'");
    };

    // a + b with a string: the other operand as its text.
    C.concatenation = function (left, right, node) {
        var string = CS.stringType();
        [left, right].forEach(function (operand) {
            if (operand.type.kind === 'void')
                this.error(node, 'CS0019', "Operator '+' cannot be applied to operands of type '" + CS.typeName(left.type) + "' and '" +
                           CS.typeName(right.type) + "'");
        }, this);
        var result = bound('concat', node, { parts: [], type: string });
        // Flatten a + b + c into one list of parts.
        [left, right].forEach(function (operand) {
            if (operand.k === 'concat' && !operand.parenthesized)
                result.parts = result.parts.concat(operand.parts);
            else
                result.parts.push(operand);
        });
        if (result.parts.every(function (part) {
            return part.constant !== undefined && (typeof part.constant === 'string' || part.constant === null) &&
                (CS.isSpecial(part.type, 'string') || part.type.kind === 'null');
        }))
            result.constant = result.parts.map(function (part) { return part.constant === null ? '' : part.constant; }).join('');
        return result;
    };

    // Delegates: + combines, - removes.
    C.delegateOperator = function (op, left, right, node) {
        var type = left.type;
        return bound('binary', node, { op: op, left: left, right: this.convert(right, type, node, false), kind: 'delegate', type: type });
    };

    // == and != on references, strings, bool, nullable with null, enums.
    C.equalityOperator = function (op, left, right, node, scope) {
        var leftType = left.type, rightType = right.type;
        var bool = CS.boolType();
        // x == null for a nullable value type.
        if ((CS.isNullableValue(leftType) && rightType.kind === 'null') || (CS.isNullableValue(rightType) && leftType.kind === 'null'))
            return bound('binary', node, { op: op, left: leftType.kind === 'null' ? right : left,
                                           right: bound('literal', node, { type: CS.NULL, constant: null }), kind: 'nullCheck', type: bool });
        if (leftType.kind === 'null' && rightType.kind === 'null')
            return this.constant(node, bool, op === '==');
        if (CS.isSpecial(leftType, 'bool') && CS.isSpecial(rightType, 'bool'))
            return this.fold(bound('binary', node, { op: op, left: left, right: right, kind: 'bool', type: bool }), scope);
        if ((CS.isSpecial(leftType, 'string') || leftType.kind === 'null') && (CS.isSpecial(rightType, 'string') || rightType.kind === 'null')) {
            var string = CS.stringType();
            return this.fold(bound('binary', node, { op: op, left: this.convert(left, string, node, false),
                                                    right: this.convert(right, string, node, false), kind: 'string', type: bool }), scope);
        }
        // A value type compared with null (a struct with a lifted ==, or a type parameter).
        if (leftType.kind === 'null' || rightType.kind === 'null') {
            var other = leftType.kind === 'null' ? leftType === rightType ? left : right : left;
            if (leftType.kind === 'null')
                other = right;
            var otherType = other.type;
            if (CS.isReferenceType(otherType) || otherType.kind === 'tparam' || CS.isNullableValue(otherType))
                return bound('binary', node, { op: op, left: other, right: bound('literal', node, { type: CS.NULL, constant: null }),
                                               kind: 'nullCheck', type: bool });
            if (CS.isValueType(otherType))
                return this.constant(node, bool, op === '!=');
            return null;
        }
        if (CS.isNumeric(CS.underlyingNullable(leftType)) && CS.isNumeric(CS.underlyingNullable(rightType)))
            return null;
        if (CS.isEnum(CS.underlyingNullable(leftType)) || CS.isEnum(CS.underlyingNullable(rightType)))
            return null;
        if (CS.isSpecial(CS.underlyingNullable(leftType), 'bool') && CS.isSpecial(CS.underlyingNullable(rightType), 'bool')) {
            var nullableBool = CS.nullableOf(bool);
            return bound('binary', node, { op: op, left: this.convert(left, nullableBool, node, false),
                                           right: this.convert(right, nullableBool, node, false), kind: 'bool', lifted: true, type: bool });
        }
        // References: identity.
        var leftRef = CS.isReferenceType(leftType) || (leftType.kind === 'tparam' && CS.typeParamIsReference(leftType.sym));
        var rightRef = CS.isReferenceType(rightType) || (rightType.kind === 'tparam' && CS.typeParamIsReference(rightType.sym));
        if (leftRef && rightRef) {
            if (Conversions.implicit(leftType, rightType) === null && Conversions.implicit(rightType, leftType) === null &&
                Conversions.explicit(leftType, rightType) === null && !CS.isInterface(leftType) && !CS.isInterface(rightType))
                this.operatorError(op, left, right, node);
            if (CS.isDelegate(leftType) && CS.isDelegate(rightType))
                return bound('binary', node, { op: op, left: left, right: right, kind: 'delegate', type: bool });
            return bound('binary', node, { op: op, left: left, right: right, kind: 'reference', type: bool });
        }
        // Tuples: element by element (C# 7.3).
        if (CS.isTuple(leftType) && CS.isTuple(rightType)) {
            var leftItems = CS.tupleElements(leftType), rightItems = CS.tupleElements(rightType);
            if (leftItems.length !== rightItems.length)
                this.error(node, 'CS8373', 'Tuple types used as operands of an == or != operator must have matching cardinalities. But this operator has tuple types of cardinality ' +
                           leftItems.length + ' on the left and ' + rightItems.length + ' on the right.');
            var self = this;
            var comparisons = leftItems.map(function (item, index) {
                var leftItem = bound('tupleItem', node, { tuple: null, index: index, type: item, side: 'left' });
                var rightItem = bound('tupleItem', node, { tuple: null, index: index, type: rightItems[index], side: 'right' });
                return self.binaryOperator(op, leftItem, rightItem, node, scope);
            });
            return bound('tupleEquality', node, { op: op, left: left, right: right, comparisons: comparisons, type: bool });
        }
        return null;
    };

    // Enums: E + U, U + E, E - E, E - U, comparisons, & | ^ of the same enum.
    C.enumOperator = function (op, left, right, node, scope) {
        var leftType = CS.underlyingNullable(left.type), rightType = CS.underlyingNullable(right.type);
        var leftEnum = CS.isEnum(leftType), rightEnum = CS.isEnum(rightType);
        if (!leftEnum && !rightEnum)
            return null;
        var lifted = CS.isNullableValue(left.type) || CS.isNullableValue(right.type);
        var enumType = leftEnum ? leftType : rightType;
        var underlying = enumType.sym.complete().enumUnderlying;
        var self = this;
        function operand(expr, type) {
            if (lifted)
                return self.convert(expr, CS.nullableOf(type), node, false);
            return self.convert(expr, type, node, false);
        }
        function result(kind, type, leftValue, rightValue) {
            var enumKind = NUMERIC[unaryPromote(underlying)] || NUMERIC[CS.keywordOf(underlying)];
            var finalType = lifted && kind !== 'compare' ? CS.nullableOf(type) : type;
            return self.fold(bound('binary', node, { op: op, left: leftValue, right: rightValue, kind: 'enum', enumKind: enumKind,
                                                    resultType: type, lifted: lifted, type: finalType, enumType: enumType }), scope);
        }
        var bool = CS.boolType();
        var sameEnum = leftEnum && rightEnum && CS.sameType(leftType, rightType);
        switch (op) {
        case '==':
        case '!=':
        case '<':
        case '>':
        case '<=':
        case '>=':
            if (sameEnum || (leftEnum && this.convertible(right, leftType)) || (rightEnum && this.convertible(left, rightType)))
                return result('compare', bool, operand(left, enumType), operand(right, enumType));
            return null;
        case '&':
        case '|':
        case '^':
            if (sameEnum || (leftEnum && this.convertible(right, leftType)) || (rightEnum && this.convertible(left, rightType)))
                return result('bits', enumType, operand(left, enumType), operand(right, enumType));
            return null;
        case '+':
            if (leftEnum && !rightEnum && this.convertible(right, underlying))
                return result('add', enumType, operand(left, enumType), operand(right, underlying));
            if (rightEnum && !leftEnum && this.convertible(left, underlying))
                return result('add', enumType, operand(left, underlying), operand(right, enumType));
            return null;
        case '-':
            if (sameEnum)
                return result('sub', underlying, operand(left, enumType), operand(right, enumType));
            if (leftEnum && !rightEnum && this.convertible(right, underlying))
                return result('add', enumType, operand(left, enumType), operand(right, underlying));
            return null;
        }
        return null;
    };

    // A user-defined operator of the operand types (lifted for nullable
    // structs), or null.
    C.userBinaryOperator = function (op, left, right, node, scope) {
        var name = OPERATOR_NAME.binary[op];
        if (name === undefined)
            return null;
        var candidates = this.operatorCandidates(name, [left.type, right.type]);
        if (candidates.length === 0)
            return null;
        var args = [{ name: null, refKind: '', node: node.left || node, outDecl: null, expr: left },
                    { name: null, refKind: '', node: node.right || node, outDecl: null, expr: right }];
        var attempt = this.findApplicable(candidates, args, null, scope);
        var lifted = false;
        if (attempt.best === null && (CS.isNullableValue(left.type) || CS.isNullableValue(right.type))) {
            // Lifted: the operator of the underlying types.
            var liftedArgs = [left, right].map(function (expr, index) {
                var type = CS.underlyingNullable(expr.type);
                return { name: null, refKind: '', node: index === 0 ? node.left : node.right, outDecl: null,
                         expr: { k: 'placeholder', type: type } };
            });
            attempt = this.findApplicable(candidates, liftedArgs, null, scope);
            lifted = attempt.best !== null;
        }
        if (attempt.best === null) {
            if (attempt.applicable.length > 1)
                this.error(node, 'CS0034', "Operator '" + op + "' is ambiguous on operands of type '" + CS.typeName(left.type) + "' and '" +
                           CS.typeName(right.type) + "'");
            return null;
        }
        var best = attempt.best;
        var method = best.method;
        var bool = CS.boolType();
        if (lifted) {
            var comparison = op === '==' || op === '!=' || op === '<' || op === '>' || op === '<=' || op === '>=';
            var paramTypes = best.paramTypes;
            var returnType = CS.subst(method.returnType, best.map);
            return bound('binary', node, { op: op, kind: 'user', method: method, ownerType: best.owner, lifted: true,
                                           left: this.convert(left, CS.nullableOf(paramTypes[0]), node, false),
                                           right: this.convert(right, CS.nullableOf(paramTypes[1]), node, false),
                                           type: comparison ? bool : (CS.isValueType(returnType) ? CS.nullableOf(returnType) : returnType) });
        }
        var finished = this.finishCall(best, args, node, scope, {});
        this.noteCall(scope, method);
        return bound('binary', node, { op: op, kind: 'user', method: method, ownerType: best.owner, left: finished.args[0],
                                       right: finished.args[1], type: finished.returnType,
                                       typeParam: candidateTypeParam(candidates, best) });
    };

    // The type parameter whose interface gave the chosen operator.
    function candidateTypeParam(candidates, best) {
        for (var index = 0; index < candidates.length; ++index) {
            var candidate = candidates[index];
            if (candidate.member === best.method && candidate.typeParam !== undefined && CS.sameType(candidate.owner, best.owner))
                return candidate.typeParam;
        }
        return null;
    }

    // Operators named name in the types (and their base classes); for a
    // type parameter also the static abstract and virtual operators of the
    // interfaces of its constraints (generic math), with typeParam.
    C.operatorCandidates = function (name, types) {
        var result = [];
        types.forEach(function (type) {
            var under = CS.underlyingNullable(type);
            if (under.kind === 'tparam') {
                CS.lookupMembers(under, name).forEach(function (entry) {
                    var member = entry.member;
                    if (member.symbolKind === 'method' && member.isOperator && member.isStatic && entry.owner.sym.kind === 'interface' &&
                        (member.isAbstract || member.isVirtual) && !result.some(function (other) {
                            return other.member === member && CS.sameType(other.owner, entry.owner);
                        }))
                        result.push({ member: member, owner: entry.owner, typeParam: under });
                });
                under = CS.effectiveBaseClass(under.sym);
            }
            for (var current = under; current !== null && current.kind === 'named'; current = CS.baseTypeOf(current)) {
                var sym = current.sym.complete();
                if (sym.special !== undefined && sym.special !== 'decimal')
                    break;
                (sym.members[name] || []).forEach(function (member) {
                    if (member.symbolKind === 'method' && member.isOperator &&
                        !result.some(function (entry) { return entry.member === member; }))
                        result.push({ member: member, owner: current });
                });
                if (sym.kind === 'struct')
                    break;
            }
        });
        return result;
    };

    C.userUnaryOperator = function (name, operand) {
        var candidates = this.operatorCandidates(name, [operand.type]);
        if (candidates.length === 0)
            return null;
        var args = [{ name: null, refKind: '', node: null, outDecl: null, expr: operand }];
        var attempt = this.findApplicable(candidates, args, null, null);
        if (attempt.best === null)
            return null;
        return { method: attempt.best.method, owner: attempt.best.owner, best: attempt.best,
                 typeParam: candidateTypeParam(candidates, attempt.best) };
    };

    // && and ||: bool operands (user-defined & | with true/false operators too).
    C.bindLogical = function (node, scope) {
        // Chains like a && b && c && ... without deep recursion.
        var chain = [];
        var current = node;
        while (current.k === 'binary' && current.op === node.op && !current.parenthesized) {
            chain.push(current.right);
            current = current.left;
        }
        chain.push(current);
        chain.reverse();
        var self = this;
        var bool = CS.boolType();
        var result = null;
        chain.forEach(function (part) {
            var value = self.bindExpr(part, scope);
            if (value.type !== undefined && !CS.isSpecial(value.type, 'bool') && !self.convertible(value, bool)) {
                var user = result !== null ? self.userLogical(node.op, result, value, node, scope) : null;
                if (user !== null) {
                    result = user;
                    return;
                }
                if (result === null && (self.operatorCandidates(node.op === '&&' ? 'op_BitwiseAnd' : 'op_BitwiseOr', [value.type]).length > 0)) {
                    result = value;
                    return;
                }
                self.error(part, 'CS0019', "Operator '" + node.op + "' cannot be applied to operands of type '" +
                           (result !== null ? CS.typeName(result.type) : CS.typeName(value.type)) + "' and '" + CS.typeName(value.type) + "'");
            }
            if (result !== null && !CS.isSpecial(result.type, 'bool')) {
                var userLogical = self.userLogical(node.op, result, value, node, scope);
                if (userLogical !== null) {
                    result = userLogical;
                    return;
                }
            }
            value = self.convert(value, bool, part, false);
            if (result === null) {
                result = value;
                return;
            }
            var combined = bound('logical', node, { op: node.op, left: result, right: value, type: bool });
            if (result.constant !== undefined && value.constant !== undefined)
                combined.constant = node.op === '&&' ? result.constant && value.constant : result.constant || value.constant;
            result = combined;
        });
        return result;
    };

    // x && y with a user-defined & and the operators true and false.
    C.userLogical = function (op, left, right, node, scope) {
        var operator = this.userBinaryOperator(op === '&&' ? '&' : '|', left, right, node, scope);
        if (operator === null || operator.kind !== 'user')
            return null;
        var test = this.userUnaryOperator(op === '&&' ? 'op_False' : 'op_True', left);
        if (test === null)
            this.error(node, 'CS0218', "In order for '" + operator.method.name + "' to be applicable as a short circuit operator, its declaring type must define operator true and operator false");
        return bound('userLogical', node, { op: op, left: left, right: right, operator: operator, test: test.method,
                                            testOwner: test.owner, type: operator.type });
    };

    // a ?? b: the value of a unless it is null.
    C.bindCoalesce = function (node, scope) {
        var left = this.bindValue(node.left, scope);
        var right = this.bindExpr(node.right, scope);
        var leftType = left.type;
        if (CS.isValueType(leftType) && !CS.isNullableValue(leftType) && leftType.kind !== 'tparam')
            this.error(node, 'CS0019', "Operator '??' cannot be applied to operands of type '" + CS.typeName(leftType) + "' and '" +
                       (right.type !== undefined ? CS.typeName(right.type) : '<' + right.k + '>') + "'");
        var underlying = CS.underlyingNullable(leftType);
        var resultType;
        if (right.k === 'throwExpr') {
            resultType = underlying;
        } else if (CS.isNullableValue(leftType) && this.convertible(right, underlying)) {
            resultType = underlying;
        } else if (this.convertible(right, leftType)) {
            resultType = leftType;
        } else if (right.type !== undefined && Conversions.implicit(underlying, right.type) !== null) {
            resultType = right.type;
        } else {
            this.error(node, 'CS0019', "Operator '??' cannot be applied to operands of type '" + CS.typeName(leftType) + "' and '" +
                       (right.type !== undefined ? CS.typeName(right.type) : '<' + right.k + '>') + "'");
        }
        var leftValue = CS.isNullableValue(leftType) && !CS.isNullableValue(resultType) ? left
            : (CS.sameType(leftType, resultType) ? left : this.convert(left, resultType, node.left, false));
        return bound('coalesce', node, { left: leftValue, right: this.convert(right, resultType, node.right, false), type: resultType,
                                         unwrap: CS.isNullableValue(leftType) && !CS.isNullableValue(resultType) });
    };

    // --- Unary operators

    C.bind_unary = function (node, scope) {
        if (node.op === '^')
            return this.bindFromEnd(node, scope);
        // -2147483648 and -9223372036854775808 are int.MinValue and long.MinValue.
        if (node.op === '-' && node.operand.k === 'literal' && node.operand.kind === 'int' && node.operand.value.suffix === '' &&
            node.operand.value.radix === 10) {
            var digits = node.operand.value.digits.replace(/^0+(?=\d)/, '');
            if (digits === '2147483648')
                return this.constant(node, CS.intType(), -2147483648);
            if (digits === '9223372036854775808')
                return this.constant(node, CS.special('long'), big.neg(big.pow(2, 63)));
        }
        var operand = this.bindValue(node.operand, scope);
        var type = operand.type;
        var name = OPERATOR_NAME.unary[node.op];
        var user = this.userUnaryOperator(name, operand);
        if (user !== null) {
            var finished = this.finishCall(user.best, [{ name: null, refKind: '', node: node.operand, outDecl: null, expr: operand }],
                                           node, scope, {});
            return bound('unary', node, { op: node.op, operand: finished.args[0], kind: 'user', method: user.method,
                                          ownerType: user.owner, type: finished.returnType, typeParam: user.typeParam });
        }
        if (type.kind === 'dynamic')
            return bound('dynamicUnary', node, { op: node.op, operand: operand, type: node.op === '!' ? CS.boolType() : CS.DYNAMIC });
        var lifted = CS.isNullableValue(type);
        var under = CS.underlyingNullable(type);
        var checkedContext = this.isChecked(scope);
        var self = this;
        function make(kind, operandType, resultType) {
            var convertTo = lifted ? CS.nullableOf(operandType) : operandType;
            var finalType = lifted ? CS.nullableOf(resultType) : resultType;
            return self.fold(bound('unary', node, { op: node.op, operand: self.convert(operand, convertTo, node.operand, false),
                                                   kind: kind, lifted: lifted, type: finalType, checked: checkedContext }), scope);
        }
        switch (node.op) {
        case '!':
            if (CS.isSpecial(under, 'bool'))
                return make('bool', under, under);
            break;
        case '~':
            if (CS.isEnum(under))
                return make('enum', under, under);
            var bits = unaryPromote(under);
            if (bits === 'int' || bits === 'uint' || bits === 'long' || bits === 'ulong')
                return make(NUMERIC[bits], CS.special(bits), CS.special(bits));
            break;
        case '+':
        case '-': {
            if (!CS.isNumeric(under))
                break;
            var keyword = unaryPromote(under);
            if (node.op === '-' && keyword === 'uint')
                keyword = 'long';
            if (node.op === '-' && keyword === 'ulong') {
                if (operand.constant !== undefined && big.sign(operand.constant) === 0)
                    return operand;
                this.error(node, 'CS0023', "Operator '-' cannot be applied to operand of type 'ulong'");
            }
            return make(NUMERIC[keyword], CS.special(keyword), CS.special(keyword));
        }
        }
        this.error(node, 'CS0023', "Operator '" + node.op + "' cannot be applied to operand of type '" + CS.typeName(type) + "'");
    };

    // ^i: System.Index from the end.
    C.bindFromEnd = function (node, scope) {
        var operand = this.bindAs(node.operand, scope, CS.intType());
        return bound('fromEnd', node, { operand: operand, type: CS.libraryType('System.Index') });
    };

    C.bind_range = function (node, scope) {
        var self = this;
        var index = CS.libraryType('System.Index');
        function part(expr) {
            if (expr === null)
                return null;
            var value = self.bindExpr(expr, scope);
            if (value.type !== undefined && self.isIndexType(value.type))
                return value;
            return self.convert(value, CS.intType(), expr, false);
        }
        return bound('range', node, { from: part(node.from), to: part(node.to), type: CS.libraryType('System.Range') });
    };

    // --- ++ and --

    C.bind_preIncrement = function (node, scope) {
        return this.increment(node, scope, true);
    };

    C.bind_postIncrement = function (node, scope) {
        return this.increment(node, scope, false);
    };

    C.increment = function (node, scope, prefix) {
        var target = this.bindValue(node.operand, scope);
        var type = target.type;
        var name = node.op === '++' ? 'op_Increment' : 'op_Decrement';
        var user = this.userUnaryOperator(name, target);
        this.checkAssignable(target, node.operand, scope);
        if (user !== null)
            return bound('increment', node, { op: node.op, prefix: prefix, target: target, kind: 'user', method: user.method,
                                              ownerType: user.owner, type: type, typeParam: user.typeParam });
        if (type.kind === 'dynamic')
            return bound('increment', node, { op: node.op, prefix: prefix, target: target, kind: 'dynamic', type: type });
        var under = CS.underlyingNullable(type);
        if (!CS.isNumeric(under) && !CS.isEnum(under))
            this.error(node, 'CS0023', "Operator '" + node.op + "' cannot be applied to operand of type '" + CS.typeName(type) + "'");
        var kind = CS.isEnum(under) ? NUMERIC[CS.keywordOf(under.sym.complete().enumUnderlying)] : NUMERIC[CS.keywordOf(under)];
        return bound('increment', node, { op: node.op, prefix: prefix, target: target, kind: kind, lifted: CS.isNullableValue(type),
                                          type: type, checked: this.isChecked(scope), valueType: under });
    };

    // --- Compound assignment

    C.bindCompoundAssignment = function (node, scope) {
        var op = node.op.substring(0, node.op.length - 1);
        if (op === '??')
            return this.bindCoalesceAssignment(node, scope);
        var target = this.bindExpr(node.target, scope);
        // Events: += and -= call add and remove.
        if (target.k === 'eventAccess' && (op === '+' || op === '-')) {
            var handler = this.bindAs(node.value, scope, target.type);
            if (target.fieldLike) {
                var field = bound('field', node.target, { receiver: target.receiver, field: target.event.backingField,
                                                          ownerType: target.ownerType, type: target.type });
                var combined = bound('binary', node, { op: op, left: field, right: handler, kind: 'delegate', type: target.type });
                return bound('assign', node, { target: field, value: combined, type: target.type });
            }
            return bound('eventAssign', node, { op: op, event: target.event, receiver: target.receiver, ownerType: target.ownerType,
                                                value: handler, type: CS.VOID });
        }
        target = this.requireValue(target, node.target);
        this.checkAssignable(target, node.target, scope);
        var value = this.bindExpr(node.value, scope);
        if (value.k !== 'literal' || value.type.kind !== 'null')
            value = this.requireValue(value, node.value);
        // The operation as if x = x op y.
        var current = bound('compoundTarget', node.target, { type: target.type });
        var operation = this.binaryOperator(op, current, value, { k: 'binary', op: op, line: node.line, column: node.column,
                                                                  left: node.target, right: node.value }, scope);
        var resultType = operation.type;
        var back = null;
        if (!CS.sameType(resultType, target.type)) {
            var implicit = this.classify(bound('placeholder', node, { type: resultType }), target.type, false);
            if (implicit === null) {
                var explicit = Conversions.explicit(resultType, target.type);
                var valueFits = this.convertible(value, target.type) || op === '<<' || op === '>>' || op === '>>>';
                if (explicit === null || !valueFits || operation.kind === 'user')
                    this.error(node, explicit !== null ? 'CS0266' : 'CS0029', explicit !== null
                        ? "Cannot implicitly convert type '" + CS.typeName(resultType) + "' to '" + CS.typeName(target.type) +
                          "'. An explicit conversion exists (are you missing a cast?)"
                        : "Cannot implicitly convert type '" + CS.typeName(resultType) + "' to '" + CS.typeName(target.type) + "'");
                back = explicit;
            } else {
                back = implicit;
            }
        }
        return bound('compoundAssign', node, { op: op, target: target, operation: operation, back: back, type: target.type,
                                               checked: this.isChecked(scope) });
    };

    // x ??= y
    C.bindCoalesceAssignment = function (node, scope) {
        var target = this.bindValue(node.target, scope);
        this.checkAssignable(target, node.target, scope);
        if (CS.isValueType(target.type) && !CS.isNullableValue(target.type) && target.type.kind !== 'tparam')
            this.error(node, 'CS0019', "Operator '??=' cannot be applied to operands of type '" + CS.typeName(target.type) + "'");
        var underlying = CS.underlyingNullable(target.type);
        var value = this.bindExpr(node.value, scope);
        var resultType = CS.isNullableValue(target.type) && this.convertible(value, underlying) ? underlying : target.type;
        return bound('coalesceAssign', node, { target: target, value: this.convert(value, resultType, node.value, false),
                                               type: resultType });
    };

    // --- User-defined conversions

    // The user-defined conversion from an expression to a type (C# 10.5),
    // or null: { kind: 'user', method, owner, before, after, lifted }.
    C.userConversion = function (expr, from, to, explicit) {
        if (from === undefined || from.kind === 'null' || from.kind === 'void')
            return null;
        if (CS.isInterface(from) || CS.isInterface(to))
            return null;
        var source = CS.underlyingNullable(from), target = CS.underlyingNullable(to);
        var types = [];
        [source, target].forEach(function (type) {
            if (type.kind === 'tparam')
                type = CS.effectiveBaseClass(type.sym);
            for (var current = type; current !== null && current.kind === 'named'; current = CS.baseTypeOf(current)) {
                // Of the predefined types decimal and string declare conversions.
                if (current.sym.special !== undefined && current.sym.special !== 'decimal' && current.sym.special !== 'string')
                    break;
                if (!types.some(function (other) { return CS.sameType(other, current); }))
                    types.push(current);
                if (current.sym.kind === 'struct')
                    break;
            }
        });
        var candidates = [];
        var self = this;
        types.forEach(function (type) {
            var sym = type.sym.complete();
            var map = CS.typeMap(type);
            var names = explicit ? ['op_Implicit', 'op_Explicit'] : ['op_Implicit'];
            names.forEach(function (name) {
                (sym.members[name] || []).forEach(function (method) {
                    if (method.symbolKind !== 'method' || !method.isConversion)
                        return;
                    var paramType = CS.subst(method.params[0].type, map);
                    var returnType = CS.subst(method.returnType, map);
                    var before = self.standardConversion(expr, from, paramType, explicit);
                    var lifted = false;
                    if (before === null && CS.isNullableValue(from) && CS.isValueType(paramType) && !CS.isNullableValue(paramType)) {
                        // Lifted: S? to T? through S to T.
                        before = self.standardConversion({ k: 'placeholder', type: source }, source, paramType, explicit);
                        lifted = before !== null && CS.isNullableValue(to);
                        if (!lifted)
                            before = null;
                    }
                    if (before === null)
                        return;
                    var after = CS.sameType(returnType, to) ? { kind: 'identity' } : Conversions.implicit(returnType, to);
                    if (after === null && explicit)
                        after = Conversions.explicit(returnType, to);
                    if (after === null && lifted && CS.sameType(CS.nullableOf(returnType), to))
                        after = { kind: 'identity' };
                    if (after === null)
                        return;
                    if (candidates.some(function (candidate) { return candidate.method === method; }))
                        return;
                    candidates.push({ kind: 'user', method: method, owner: type, before: before, after: after, from: from, to: to,
                                      paramType: paramType, returnType: returnType, lifted: lifted, explicit: name === 'op_Explicit' });
                });
            });
        });
        if (candidates.length === 0)
            return null;
        if (candidates.length === 1)
            return candidates[0];
        // The most specific: exact source and target types first.
        var exact = candidates.filter(function (candidate) {
            return CS.sameType(candidate.paramType, from) && CS.sameType(candidate.returnType, to);
        });
        if (exact.length >= 1)
            return exact[0];
        var bySource = candidates.filter(function (candidate) { return CS.sameType(candidate.paramType, from); });
        if (bySource.length === 1)
            return bySource[0];
        var byTarget = candidates.filter(function (candidate) { return CS.sameType(candidate.returnType, to); });
        if (byTarget.length === 1)
            return byTarget[0];
        var implicitOnes = candidates.filter(function (candidate) { return !candidate.explicit; });
        if (implicitOnes.length === 1)
            return implicitOnes[0];
        return candidates[0];
    };

    // A standard conversion (no user-defined one) of the expression.
    C.standardConversion = function (expr, from, to, explicit) {
        if (CS.sameType(from, to))
            return { kind: 'identity' };
        if (expr.constant !== undefined && expr.constant !== null && CS.isSpecial(from, 'int') && CS.isIntegral(to) &&
            Conversions.constantFits(expr.constant, to))
            return { kind: 'constant' };
        var conversion = Conversions.implicit(from, to);
        if (conversion === null && explicit)
            conversion = Conversions.explicit(from, to);
        return conversion;
    };

    // --- Constant folding

    // A binary or unary operation of constants becomes a constant;
    // overflow is an error unless unchecked (C# 12.23).
    C.fold = function (expr, scope) {
        var uncheckedContext = scope !== undefined && this.explicitUnchecked(scope);
        if (expr.k === 'unary') {
            var operand = expr.operand;
            if (operand.constant === undefined || operand.constant === null || expr.lifted)
                return expr;
            var value = operand.constant;
            var folded;
            switch (expr.kind) {
            case 'bool':
                folded = !value;
                break;
            case 'f32':
            case 'f64':
                folded = expr.op === '-' ? -value : value;
                if (expr.kind === 'f32')
                    folded = Math.fround(folded);
                break;
            case 'decimal':
                folded = expr.op === '-' ? CS.decimal.neg(value) : value;
                break;
            case 'enum':
                folded = this.wrapInteger(big.not(value), expr.type, expr, true);
                break;
            default:
                if (expr.op === '~')
                    folded = this.wrapInteger(big.not(value), expr.type, expr, true);
                else
                    folded = this.wrapInteger(expr.op === '-' ? big.neg(value) : value, expr.type, expr, uncheckedContext);
            }
            expr.constant = folded;
            return expr;
        }
        if (expr.k !== 'binary' || expr.lifted)
            return expr;
        var left = expr.left.constant, right = expr.right.constant;
        if (left === undefined || right === undefined || left === null || right === null)
            return expr;
        var op = expr.op;
        var result;
        switch (expr.kind) {
        case 'bool':
            result = op === '&' ? left && right : op === '|' ? left || right : op === '^' ? left !== right :
                op === '==' ? left === right : left !== right;
            break;
        case 'string':
            result = op === '==' ? left === right : left !== right;
            break;
        case 'f32':
        case 'f64':
            result = this.foldFloat(op, left, right);
            if (expr.kind === 'f32' && typeof result === 'number')
                result = Math.fround(result);
            break;
        case 'decimal':
            result = this.foldDecimal(op, left, right, expr);
            break;
        case 'enum': {
            var enumResult = this.foldInteger(op, left, right, expr.resultType && CS.isEnum(expr.resultType)
                ? expr.resultType.sym.complete().enumUnderlying : expr.resultType, expr, true);
            result = enumResult;
            break;
        }
        default:
            if (expr.kind === undefined || expr.kind === 'user' || expr.kind === 'reference' || expr.kind === 'delegate' ||
                expr.kind === 'nullCheck')
                return expr;
            result = this.foldInteger(op, left, right, expr.type, expr, uncheckedContext);
        }
        if (result !== undefined)
            expr.constant = result;
        return expr;
    };

    C.foldFloat = function (op, left, right) {
        switch (op) {
        case '+':
            return left + right;
        case '-':
            return left - right;
        case '*':
            return left * right;
        case '/':
            return left / right;
        case '%':
            return left % right;
        case '==':
            return left === right;
        case '!=':
            return left !== right;
        case '<':
            return left < right;
        case '>':
            return left > right;
        case '<=':
            return left <= right;
        case '>=':
            return left >= right;
        }
        return undefined;
    };

    C.foldDecimal = function (op, left, right, expr) {
        var decimal = CS.decimal;
        var self = this;
        function guarded(callback) {
            var previous = decimal.onOverflow;
            var previousZero = decimal.onDivideByZero;
            decimal.onOverflow = function () {
                return new T.CompileError('error CS0463: Evaluation of the decimal constant expression failed', expr.line, expr.column, self.source);
            };
            decimal.onDivideByZero = function () {
                return new T.CompileError('error CS0020: Division by constant zero', expr.line, expr.column, self.source);
            };
            try {
                return callback();
            } finally {
                decimal.onOverflow = previous;
                decimal.onDivideByZero = previousZero;
            }
        }
        switch (op) {
        case '+':
            return guarded(function () { return decimal.add(left, right); });
        case '-':
            return guarded(function () { return decimal.sub(left, right); });
        case '*':
            return guarded(function () { return decimal.mul(left, right); });
        case '/':
            return guarded(function () { return decimal.div(left, right); });
        case '%':
            return guarded(function () { return decimal.rem(left, right); });
        case '==':
            return decimal.cmp(left, right) === 0;
        case '!=':
            return decimal.cmp(left, right) !== 0;
        case '<':
            return decimal.cmp(left, right) < 0;
        case '>':
            return decimal.cmp(left, right) > 0;
        case '<=':
            return decimal.cmp(left, right) <= 0;
        case '>=':
            return decimal.cmp(left, right) >= 0;
        }
        return undefined;
    };

    C.foldInteger = function (op, left, right, type, expr, uncheckedContext) {
        switch (op) {
        case '==':
            return big.cmp(left, right) === 0;
        case '!=':
            return big.cmp(left, right) !== 0;
        case '<':
            return big.cmp(left, right) < 0;
        case '>':
            return big.cmp(left, right) > 0;
        case '<=':
            return big.cmp(left, right) <= 0;
        case '>=':
            return big.cmp(left, right) >= 0;
        }
        if (type === undefined || type === null)
            return undefined;
        var value;
        switch (op) {
        case '+':
            value = big.add(left, right);
            break;
        case '-':
            value = big.sub(left, right);
            break;
        case '*':
            value = big.mul(left, right);
            break;
        case '/':
        case '%':
            if (big.sign(right) === 0)
                this.error(expr, 'CS0020', 'Division by constant zero');
            value = op === '/' ? big.quot(left, right) : big.rem(left, right);
            break;
        case '&':
            value = big.and(left, right);
            break;
        case '|':
            value = big.or(left, right);
            break;
        case '^':
            value = big.xor(left, right);
            break;
        case '<<':
        case '>>':
        case '>>>': {
            var bits = CS.isSpecial(type, 'long') || CS.isSpecial(type, 'ulong') ? 64 : 32;
            var count = big.toFloat(big.and(right, bits - 1));
            if (op === '<<') {
                value = big.shl(left, count);
                return this.wrapInteger(value, type, expr, true);
            }
            if (op === '>>>' && big.sign(left) < 0) {
                var unsigned = big.add(left, big.pow(2, bits));
                return this.wrapInteger(big.shr(unsigned, count), type, expr, true);
            }
            return big.shr(left, count);
        }
        default:
            return undefined;
        }
        if (op === '&' || op === '|' || op === '^')
            return this.wrapInteger(value, type, expr, true);
        return this.wrapInteger(value, type, expr, uncheckedContext);
    };

    // An integer result in the range of its type: overflow is an error in
    // a checked context (the default for constants), wraps when unchecked.
    C.wrapInteger = function (value, type, expr, uncheckedContext) {
        var keyword = CS.isEnum(type) ? CS.keywordOf(type.sym.complete().enumUnderlying) : CS.keywordOf(type);
        var range = Conversions.rangeOf(keyword);
        if (range === undefined)
            return value;
        if (big.cmp(value, range[0]) >= 0 && big.cmp(value, range[1]) <= 0)
            return value;
        if (!uncheckedContext)
            this.error(expr, 'CS0220', 'The operation overflows at compile time in checked mode');
        var modulus = big.add(big.sub(range[1], range[0]), 1);
        return big.add(big.mod(big.sub(value, range[0]), modulus), range[0]);
    };
})(globalThis);
