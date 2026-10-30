// C#: translation of patterns into tests - is, switch expressions, case
// labels. A test reads a value that is evaluated once and assigns the
// variables of the pattern on success.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    var G = CS.Generator.prototype;
    if (G.patternTest)
        return;

    var J = T.J;

    G.expr_isPattern = function (expr) {
        var value = this.stable(this.expression(expr.operand));
        return this.withSetup(value.setup, this.patternTest(expr.pattern, value.ref, expr.operand.type));
    };

    // A test of a pattern on a value (a simple expression); type - the
    // static type of the value.
    G.patternTest = function (pattern, value, type) {
        switch (pattern.kind) {
        case 'discard':
            return J.bool(true);
        case 'var':
            return J.seq([this.bindTarget(pattern.target, value, type), J.bool(true)]);
        case 'null':
            return J.bin('===', value, J.nul());
        case 'constant':
            return this.constantTest(pattern, value, type);
        case 'type':
            return this.typeTest(value, type, pattern.type);
        case 'declaration': {
            var test = this.typeTest(value, type, pattern.type);
            if (pattern.target.kind === 'discard')
                return test;
            var bound = this.narrowedValue(value, type, pattern.type);
            return J.and(test, J.seq([this.bindTarget(pattern.target, bound, pattern.type), J.bool(true)]));
        }
        case 'relational':
            return this.relationalTest(pattern, value, type);
        case 'not':
            return J.not(this.patternTest(pattern.pattern, value, type));
        case 'or':
            return J.or(this.patternTest(pattern.left, value, type), this.patternTest(pattern.right, value, type));
        case 'and': {
            var left = this.patternTest(pattern.left, value, type);
            var narrowedType = narrowed(pattern.left, type);
            if (narrowedType !== type && CS.isValueType(narrowedType) && !CS.isValueType(type)) {
                var inner = this.temp();
                return J.and(left, J.seq([J.assign(inner, this.narrowedValue(value, type, narrowedType)),
                                          this.patternTest(pattern.right, inner, narrowedType)]));
            }
            return J.and(left, this.patternTest(pattern.right, value, narrowedType));
        }
        case 'recursive':
            return this.recursiveTest(pattern, value, type);
        case 'list':
            return this.listTest(pattern, value, type);
        }
        throw new Error('C# codegen: unknown pattern ' + pattern.kind);
    };

    function narrowed(pattern, type) {
        if (pattern.kind === 'type' || pattern.kind === 'declaration')
            return pattern.type;
        if (pattern.kind === 'recursive' && pattern.type !== null)
            return pattern.type;
        if (pattern.kind === 'and')
            return narrowed(pattern.right, narrowed(pattern.left, type));
        return type;
    }

    // Whether a value of the static type is of the tested type.
    G.typeTest = function (value, from, to) {
        var target = CS.underlyingNullable(to);
        // The same value type: only not null for nullable inputs.
        if (CS.sameType(CS.underlyingNullable(from), target) && CS.isValueType(target))
            return CS.isNullableValue(from) ? J.bin('!==', value, J.nul()) : J.bool(true);
        if (CS.sameType(from, target) || (CS.Conversions.isImplicitReference(from, target) && from.kind !== 'tparam'))
            return J.bin('!==', value, J.nul());
        if (from.kind === 'tparam' && !CS.typeParamIsReference(from.sym))
            return J.call(this.rt('is'), [J.call(this.rt('toObject'), [this.typeRef(from), value]), this.typeRef(target)]);
        if (CS.isSpecial(target, 'int'))
            return J.bin('===', J.un('typeof', value), J.str('number'));
        if (CS.isSpecial(target, 'string'))
            return J.bin('===', J.un('typeof', value), J.str('string'));
        if (CS.isSpecial(target, 'bool'))
            return J.bin('===', J.un('typeof', value), J.str('boolean'));
        return J.call(this.rt('is'), [value, this.typeRef(target)]);
    };

    // The value as the narrowed type: unboxed for value types.
    G.narrowedValue = function (value, from, to) {
        var target = CS.underlyingNullable(to);
        if (CS.sameType(CS.underlyingNullable(from), target))
            return value;
        if (from.kind === 'tparam' && !CS.typeParamIsReference(from.sym)) {
            if (CS.isValueType(target))
                return J.call(this.rt('unbox'), [this.typeRef(target), J.call(this.rt('toObject'), [this.typeRef(from), value])]);
            return J.call(this.rt('toObject'), [this.typeRef(from), value]);
        }
        if (CS.isValueType(target) && !CS.isValueType(from)) {
            if (CS.isSpecial(target, 'int') || CS.isSpecial(target, 'bool'))
                return value;
            return J.call(this.rt('unboxed'), [value]);
        }
        return value;
    };

    // The variables of a designation get the value.
    G.bindTarget = function (target, value, type) {
        var self = this;
        switch (target.kind) {
        case 'discard':
            return J.undef();
        case 'local': {
            this.declareHoisted(target.local);
            var stored = this.isMutableStruct(type) ? J.method(value, '$copy', []) : value;
            return J.assign(J.id(this.localName(target.local)), stored);
        }
        case 'deconstruct': {
            var reads = [], writes = [];
            var deconstructTarget = { kind: 'nested', type: type, deconstructor: target.deconstructor,
                                      items: target.items.map(function (item) { return self.patternTargetAsDeconstruct(item); }) };
            this.deconstructInto(deconstructTarget, value, reads, writes);
            return J.seq(reads.concat(writes).concat([J.undef()]));
        }
        }
        return J.undef();
    };

    G.patternTargetAsDeconstruct = function (item) {
        var self = this;
        if (item.kind === 'discard')
            return { kind: 'discard' };
        if (item.kind === 'local')
            return { kind: 'variable', target: { k: 'local', sym: item.local, type: item.local.type }, declares: item.local };
        return { kind: 'nested', type: null, deconstructor: item.deconstructor, items: item.items.map(function (inner) {
            return self.patternTargetAsDeconstruct(inner);
        }) };
    };

    // value == constant by the kind of the type.
    G.constantTest = function (pattern, value, type) {
        var constant = pattern.value;
        var valueType = pattern.valueType;
        var test = null;
        var compared = value;
        if (pattern.testType !== null) {
            test = this.typeTest(value, type, pattern.testType);
            compared = this.narrowedValue(value, type, pattern.testType);
        }
        var equality = this.equalityTest(compared, constant, valueType);
        return test === null ? equality : J.and(test, equality);
    };

    G.equalityTest = function (value, constant, type) {
        var kind = this.numericKind(type);
        var literal = this.expression(constant);
        if (kind === 'decimal')
            return J.call(J.mem(this.rt('dec'), 'eq'), [value, literal]);
        if (kind === 'i64' || kind === 'u64')
            return T.ops.equals(kind, false, value, literal, this.numberContext());
        if ((kind === 'f64' || kind === 'f32') && constant.constant !== constant.constant)
            return J.bin('!==', value, value);
        return J.bin('===', value, literal);
    };

    G.relationalTest = function (pattern, value, type) {
        var test = null;
        var compared = value;
        if (pattern.testType !== null) {
            test = this.typeTest(value, type, pattern.testType);
            compared = this.narrowedValue(value, type, pattern.testType);
        }
        var kind = this.numericKind(pattern.valueType);
        var literal = this.expression(pattern.value);
        var comparison;
        if (kind === 'decimal')
            comparison = J.bin(pattern.op, J.call(J.mem(this.rt('dec'), 'cmp'), [compared, literal]), J.num(0));
        else
            comparison = T.ops.compare(kind === 'i64' || kind === 'u64' ? kind : 'f64', pattern.op, compared, literal, this.numberContext());
        return test === null ? comparison : J.and(test, comparison);
    };

    // Type(a, b) { P: x } v
    G.recursiveTest = function (pattern, value, type) {
        var self = this;
        var tests = [];
        var current = value;
        var currentType = type;
        if (pattern.type !== null) {
            tests.push(this.typeTest(value, type, pattern.type));
            var narrowedValue = this.narrowedValue(value, type, pattern.type);
            if (narrowedValue !== value) {
                var temp = this.temp();
                tests.push(J.seq([J.assign(temp, narrowedValue), J.bool(true)]));
                current = temp;
            }
            currentType = pattern.type;
        } else if (!CS.isValueType(type) || CS.isNullableValue(type)) {
            tests.push(J.bin('!==', value, J.nul()));
        }
        if (pattern.positional !== null) {
            var positional = pattern.positional;
            if (positional.deconstructor === null) {
                positional.items.forEach(function (item, index) {
                    var element = self.temp();
                    tests.push(J.seq([J.assign(element, self.tupleItemRead(current, currentType, index)),
                                      self.patternTest(item, element, item.inputType)]));
                });
            } else {
                var temps = positional.items.map(function () { return self.temp(); });
                var refs = temps.map(function (temp) {
                    return J.call(self.rt('ref'), [J.fn(null, [], [J.ret(temp)]), J.fn(null, ['$v'], [J.expr(J.assign(temp, J.id('$v')))])]);
                });
                var deconstructor = positional.deconstructor;
                var call = deconstructor.extension
                    ? self.staticCall(deconstructor.owner, deconstructor.method, (deconstructor.typeArgs || []).map(function (arg) {
                        return self.typeRef(arg);
                    }).concat([current]).concat(refs))
                    : self.instanceCall({ k: 'placeholder', value: current, type: currentType }, deconstructor.method, refs, deconstructor.owner);
                tests.push(J.seq([call, J.bool(true)]));
                positional.items.forEach(function (item, index) {
                    tests.push(self.patternTest(item, temps[index], item.inputType));
                });
            }
        }
        if (pattern.properties !== null) {
            pattern.properties.forEach(function (property) {
                var holder = current;
                var holderType = currentType;
                property.members.forEach(function (member, index) {
                    var read = self.temp();
                    var access = self.memberRead(holder, member, holderType);
                    tests.push(J.seq([J.assign(read, access), J.bool(true)]));
                    if (index < property.members.length - 1 && !CS.isValueType(member.type))
                        tests.push(J.bin('!==', read, J.nul()));
                    holder = read;
                    holderType = member.type;
                });
                tests.push(self.patternTest(property.pattern, holder, holderType));
            });
        }
        if (pattern.target !== null)
            tests.push(J.seq([this.bindTarget(pattern.target, current, currentType), J.bool(true)]));
        if (tests.length === 0)
            return J.bool(true);
        return tests.reduce(function (left, right) { return J.and(left, right); });
    };

    // [a, .., b]
    G.listTest = function (pattern, value, type) {
        var self = this;
        var tests = [];
        if (!CS.isValueType(type))
            tests.push(J.bin('!==', value, J.nul()));
        var length = this.temp();
        var lengthRead;
        if (pattern.countMember === null)
            lengthRead = type.kind === 'array' ? J.mem(value, 'length') : J.mem(value, 'length');
        else
            lengthRead = this.memberRead(value, pattern.countMember, type);
        tests.push(J.seq([J.assign(length, lengthRead), J.bool(true)]));
        var items = pattern.items;
        var fixed = items.filter(function (item) { return item.kind !== 'slice'; }).length;
        tests.push(pattern.slice >= 0 ? J.bin('>=', length, J.num(fixed)) : J.bin('===', length, J.num(fixed)));
        var indexer = null;
        if (pattern.countMember !== null) {
            var found = CS.lookupMembers(type, 'this[]').filter(function (entry) {
                return entry.member.params.length === 1 && CS.isSpecial(entry.member.params[0].type, 'int');
            });
            indexer = CS.findGetter(found[0].member);
        }
        function element(index) {
            if (CS.isSpecial(type, 'string'))
                return J.method(value, 'charCodeAt', [index]);
            if (indexer !== null)
                return J.method(value, indexer.jsName, [index]);
            return J.idx(value, index);
        }
        items.forEach(function (item, position) {
            if (item.kind === 'slice') {
                if (item.pattern !== null) {
                    var slice = self.temp();
                    var after = items.length - position - 1;
                    tests.push(J.seq([J.assign(slice, J.call(self.rt('sliceOf'), [value, J.num(position), J.bin('-', length, J.num(after))])),
                                      self.patternTest(item.pattern, slice, type)]));
                }
                return;
            }
            var index = pattern.slice >= 0 && position > pattern.slice
                ? J.bin('-', length, J.num(items.length - position)) : J.num(position);
            var read = self.temp();
            tests.push(J.seq([J.assign(read, element(index)), self.patternTest(item, read, pattern.elementType)]));
        });
        if (pattern.target !== null)
            tests.push(J.seq([this.bindTarget(pattern.target, value, type), J.bool(true)]));
        return tests.reduce(function (left, right) { return J.and(left, right); });
    };

    // x switch { p1 => a, p2 when c => b, ... }: nested conditionals; no
    // match is a SwitchExpressionException.
    G.expr_switchExpr = function (expr) {
        var value = this.stable(this.expression(expr.operand));
        var type = expr.operand.type;
        var result = J.call(this.rt('switchFailed'), [this.objectValue(value.ref, type)]);
        for (var index = expr.arms.length - 1; index >= 0; --index) {
            var arm = expr.arms[index];
            var test = this.patternTest(arm.pattern, value.ref, type);
            if (arm.when !== null)
                test = J.and(test, this.expression(arm.when));
            var armValue = arm.expr.k === 'throwExpr' ? this.expression(arm.expr) : this.storedValue(arm.expr);
            if (test.k === 'bool' && test.value === true)
                result = armValue;
            else
                result = J.cond(test, armValue, result);
        }
        return this.withSetup(value.setup, result);
    };

    // A value as an object (for messages).
    G.objectValue = function (value, type) {
        if (CS.isValueType(type) && !CS.isSpecial(type, 'int') && !CS.isSpecial(type, 'bool'))
            return J.call(this.rt('box'), [this.typeRef(CS.underlyingNullable(type)), value]);
        if (type.kind === 'tparam')
            return J.call(this.rt('toObject'), [this.typeRef(type), value]);
        return value;
    };
})(globalThis);
