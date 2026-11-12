// Kotlin: translation of operators - arithmetic of the primitive types by
// T.ops (Int wraps, Long is exact, division by zero throws), comparisons,
// equality, &&, ||, elvis, in, ranges, increments of any assignable
// target, !!, is and as.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Kt = T.kotlin;
    var Generator = Kt.Generator;
    if (Generator.prototype.binaryValue)
        return;

    var J = T.J;

    // The kind of an operand as T.ops takes it (Char and Boolean as they are).
    function opsKind(kind) {
        return kind === 'char' ? 'u16' : kind;
    }

    // A primitive value of kind from as kind to (Int to Long, Int to Double).
    Generator.prototype.numeric = function (js, from, to) {
        if (from === to || from === 'bool')
            return js;
        if (from === 'char' && to === 'i32')
            return js;
        if ((from === 'i8' || from === 'i16') && to === 'i32')
            return js;
        if ((from === 'f32' || from === 'f64') && (to === 'i32' || to === 'i16' || to === 'i8' || to === 'char')) {
            var integer = J.call(this.rt('d2i'), [js]);
            if (to === 'i32')
                return integer;
            return T.ops.convert('i32', opsKind(to), integer, this.opsContext());
        }
        if ((from === 'f32' || from === 'f64') && to === 'i64')
            return J.call(this.rt('d2l'), [js]);
        return T.ops.convert(opsKind(from), opsKind(to), js, this.opsContext());
    };

    // A primitive operand of node as kind.
    Generator.prototype.operand = function (node, kind) {
        var js = this.expression(node);
        var type = Kt.resolved(node.type);
        if (node.k === 'delegateArg' && node.js === undefined)
            return js;
        var from = Kt.isPrimitive(type) ? Kt.primKind(type) : null;
        if (from === null)
            js = this.unbox(js, kind);
        else
            js = this.numeric(js, from, kind);
        return js;
    };

    Generator.prototype.binaryValue = function (node) {
        var self = this;
        switch (node.op) {
        case '&&':
        case '||':
            return this.logicalValue(node);
        case '?:':
            return this.elvisValue(node);
        case '==':
        case '!=':
        case '===':
        case '!==':
            return this.equalityValue(node);
        case 'in':
        case '!in':
            return this.containsValue(node);
        case '..':
        case '..<':
            return this.rangeValue(node);
        }
        var intrinsic = node.intrinsic;
        if (intrinsic !== undefined) {
            var operands;
            switch (intrinsic.kind) {
            case 'arith':
                operands = this.ordered([function () { return self.operand(node.left, intrinsic.operand); },
                                         function () { return self.operand(node.right, intrinsic.operand); }]);
                return T.ops.binary(intrinsic.operand, node.op, operands[0], operands[1], this.opsContext());
            case 'compare':
                operands = this.ordered([function () { return self.operand(node.left, intrinsic.operand); },
                                         function () { return self.operand(node.right, intrinsic.operand); }]);
                if (intrinsic.operand === 'u32' || intrinsic.operand === 'u64')
                    return T.ops.compare(intrinsic.operand, node.op, operands[0], operands[1], this.opsContext());
                return T.ops.compare(opsKind(intrinsic.operand), node.op, operands[0], operands[1], this.opsContext());
            case 'charArith':
                operands = this.ordered([function () { return self.expression(node.left); },
                                         function () { return self.operand(node.right, 'i32'); }]);
                return J.bin('&', J.bin(node.op, operands[0], operands[1]), J.num(65535));
            case 'charDiff':
                operands = this.ordered([function () { return self.expression(node.left); },
                                         function () { return self.expression(node.right); }]);
                return J.bin('-', operands[0], operands[1]);
            case 'unsigned':
                operands = this.ordered([function () { return self.operand(node.left, intrinsic.operand); },
                                         function () { return self.operand(node.right, intrinsic.operand); }]);
                return T.ops.binary(intrinsic.operand, node.op, operands[0], operands[1], this.opsContext());
            case 'concat': {
                operands = this.ordered([function () { return self.expression(node.left); },
                                         function () { return self.stringOf(self.expression(node.right), node.right.type); }]);
                return J.bin('+', operands[0], operands[1]);
            }
            }
        }
        if (node.call !== undefined) {
            if ({ '<': true, '>': true, '<=': true, '>=': true }[node.op] === true) {
                var compare = this.callCode(node.call, { type: Kt.intType() }, false);
                return J.bin(node.op, compare, J.num(0));
            }
            return this.callCode(node.call, node, false);
        }
        throw new Error('Kotlin: cannot translate the operator ' + node.op);
    };

    Generator.prototype.logicalValue = function (node) {
        var left = this.valueAs(node.left, Kt.booleanType());
        var right = this.capture(function () { return this.valueAs(node.right, Kt.booleanType()); }.bind(this));
        if (right.pre.length === 0)
            return node.op === '&&' ? J.and(left, right.js) : J.or(left, right.js);
        var temp = this.temp();
        this.lift(J.expr(J.assign(temp, left)));
        var test = node.op === '&&' ? temp : J.not(temp);
        this.lift(J.if_(test, J.block(right.pre.concat([J.expr(J.assign(temp, right.js))]))));
        return temp;
    };

    // a ?: b
    Generator.prototype.elvisValue = function (node) {
        var resultType = node.type;
        var left = this.expression(node.left);
        var self = this;
        var right = this.capture(function () { return self.valueAs(node.right, resultType); });
        var temp = this.temp();
        var present = this.convert(temp, node.left.type, resultType);
        if (right.pre.length === 0)
            return J.cond(J.bin('!=', J.assign(temp, left), J.nul()), present, right.js);
        this.lift(J.expr(J.assign(temp, left)));
        var fallback = right.pre.slice();
        if (!Kt.isJump(node.right.type))
            fallback.push(J.expr(J.assign(temp, right.js)));
        var converted = present === temp ? null : J.expr(J.assign(temp, present));
        this.lift(J.if_(J.bin('==', temp, J.nul()), J.block(fallback), converted));
        return temp;
    };

    Generator.prototype.equalityValue = function (node) {
        var self = this;
        var negate = node.op === '!=' || node.op === '!==';
        var intrinsic = node.intrinsic;
        var operands;
        if (intrinsic !== undefined && intrinsic.kind === 'primEquals') {
            operands = this.ordered([function () { return self.expression(node.left); }, function () { return self.expression(node.right); }]);
            if (intrinsic.operand === 'i64' || intrinsic.operand === 'u64')
                return T.ops.equals('i64', negate, operands[0], operands[1], this.opsContext());
            return J.bin(negate ? '!==' : '===', operands[0], operands[1]);
        }
        var leftNull = node.left.k === 'null', rightNull = node.right.k === 'null';
        if (leftNull || rightNull) {
            var value = this.expression(leftNull ? node.right : node.left);
            return J.bin(negate ? '!=' : '==', value, J.nul());
        }
        operands = this.ordered([function () { return self.valueAs(node.left, Kt.nullableAny()); },
                                 function () { return self.valueAs(node.right, Kt.nullableAny()); }]);
        if (node.op === '===' || node.op === '!==')
            return J.call(this.kt(negate ? 'notSame' : 'same'), operands);
        var equal = J.call(this.kt('eq'), operands);
        return negate ? J.not(equal) : equal;
    };

    // x in range: intrinsics for primitive ranges, otherwise contains.
    Generator.prototype.containsValue = function (node) {
        var negate = node.op === '!in';
        var result;
        if (node.intrinsic !== undefined && node.intrinsic.kind === 'inRange')
            result = this.inRange(node.left, node.right, node.intrinsic.operand);
        else
            result = this.containsCall(node.call, node.right, node.left);
        return negate ? J.not(result) : result;
    };

    Generator.prototype.containsCall = function (call, container, element) {
        void container;
        void element;
        return this.callCode(call, { type: Kt.booleanType() }, false);
    };

    // a <= x && x <= b for x in a..b (x < b for a..<b).
    Generator.prototype.inRange = function (valueNode, rangeNode, kind) {
        var self = this;
        var operandKind = kind === 'char' ? 'char' : kind;
        var values = this.ordered([function () { return self.operand(valueNode, operandKind); },
                                   function () { return self.operand(rangeNode.left, operandKind); },
                                   function () { return self.operand(rangeNode.right, operandKind); }]);
        var value = this.stable(values[0]);
        var ctx = this.opsContext();
        var first = value.setup !== null ? J.seq([value.setup, value.value]) : value.value;
        var low = T.ops.compare(opsKind(operandKind), '<=', values[1], first, ctx);
        var high = T.ops.compare(opsKind(operandKind), rangeNode.op === '..<' ? '<' : '<=', value.value, values[2], ctx);
        return J.and(low, high);
    };

    // a..b - an IntRange (LongRange, CharRange) or rangeTo.
    Generator.prototype.rangeValue = function (node) {
        var self = this;
        if (node.intrinsic === undefined)
            return this.callCode(node.call, node, false);
        var kind = node.intrinsic.operand;
        var values = this.ordered([function () { return self.operand(node.left, kind); },
                                   function () { return self.operand(node.right, kind); }]);
        var names = { i32: 'IntRange', i64: 'LongRange', char: 'CharRange', u32: 'UIntRange', u64: 'ULongRange' };
        var cls = this.session.libraryClass('kotlin.ranges.' + names[kind]);
        var end = values[1];
        if (node.op === '..<') {
            // a..<b is a..(b - 1); an empty range when b is the minimum.
            return J.call(this.kt('rangeUntil'), [this.classRef(cls), J.str(kind), values[0], end]);
        }
        var ctor = cls.complete().ctors[0];
        return J.call(J.mem(J.new_(this.classRef(cls), []), ctor.jsName), [values[0], end]);
    };

    // --- Infix calls

    Generator.prototype.infixValue = function (node) {
        var self = this;
        var intrinsic = node.intrinsic;
        if (intrinsic === undefined)
            return this.callCode(node.call, node, false);
        var operands = this.ordered([function () { return self.expression(node.left); }, function () { return self.expression(node.right); }]);
        var left = operands[0], right = operands[1];
        switch (intrinsic.kind) {
        case 'bitwise': {
            var op = { and: '&', or: '|', xor: '^' }[intrinsic.op];
            if (intrinsic.operand === 'i32')
                return J.bin(op, left, right);
            return T.ops.binary(intrinsic.operand, op, left, right, this.opsContext());
        }
        case 'shift':
            if (intrinsic.operand === 'i32') {
                var count = J.bin('&', right, J.num(31));
                if (intrinsic.op === 'shl')
                    return J.bin('<<', left, count);
                if (intrinsic.op === 'shr')
                    return J.bin('>>', left, count);
                return J.bin('|', J.bin('>>>', left, count), J.num(0));
            }
            var wideCount = J.bin('&', right, J.num(63));
            if (intrinsic.op === 'ushr')
                return J.call(this.rt('lushr'), [left, wideCount]);
            return J.call(J.mem(J.mem(J.id('$T'), 'i64'), intrinsic.op === 'shl' ? 'shl' : 'shr'), [left, wideCount]);
        case 'boolOp':
            if (intrinsic.op === 'xor')
                return J.bin('!==', left, right);
            return J.un('!', J.un('!', J.bin(intrinsic.op === 'and' ? '&' : '|', left, right)));
        }
        throw new Error('Kotlin: unknown infix intrinsic ' + intrinsic.kind);
    };

    // --- Unary operators

    Generator.prototype.prefixValue = function (node) {
        if (node.op === '++' || node.op === '--')
            return this.incrementValue(node, true);
        var intrinsic = node.intrinsic;
        if (node.op === '!') {
            if (intrinsic !== undefined && intrinsic.kind === 'not')
                return J.not(this.valueAs(node.arg, Kt.booleanType()));
            return this.callCode(node.call, node, false);
        }
        if (intrinsic !== undefined) {
            if (intrinsic.kind === 'negate' && intrinsic.operand === undefined) {
                // A negative literal.
                var value = this.literalOf(node);
                if (value !== null)
                    return this.integerConstant(value, Kt.primKind(node.type));
            }
            var kind = intrinsic.operand;
            var operand = this.operand(node.arg, kind);
            if (intrinsic.kind === 'plus')
                return operand;
            return T.ops.unary(kind, '-', operand, this.opsContext());
        }
        return this.callCode(node.call, node, false);
    };

    // The value of an integer literal expression (for -1).
    Generator.prototype.literalOf = function (node) {
        while (node.k === 'paren')
            node = node.expr;
        if (node.k === 'int')
            return node.value !== undefined ? node.value : T.big.parse(node.digits, node.radix);
        if (node.k === 'prefix' && (node.op === '-' || node.op === '+')) {
            var inner = this.literalOf(node.arg);
            return inner === null ? null : (node.op === '-' ? T.big.neg(inner) : inner);
        }
        return null;
    };

    Generator.prototype.postfixValue = function (node) {
        if (node.op === '!!') {
            var value = this.expression(node.arg);
            if (!Kt.isNullable(node.arg.type) && !Kt.resolved(node.arg.type).flexible)
                return value;
            return this.convert(J.call(this.kt('nn'), [value]), node.arg.type, node.type);
        }
        return this.incrementValue(node, false);
    };

    // An assignable target: { read, write(value), type } with stable receivers.
    Generator.prototype.assignTarget = function (target) {
        var self = this;
        while (target.k === 'paren')
            target = target.expr;
        var type = target.type;
        if (target.k === 'name') {
            var ref = target.ref;
            if (ref.kind === 'local') {
                var variable = ref.sym;
                return { type: variable.type, read: function () { return self.localValue(variable); },
                         write: function (value) { return self.localWrite(variable, value); } };
            }
            if (ref.kind === 'field') {
                var holder = this.fieldHolder(ref.prop);
                return { type: ref.prop.type, read: function () { return J.mem(holder, ref.prop.jsName); },
                         write: function (value) { return J.assign(J.mem(holder, ref.prop.jsName), value); } };
            }
            if (ref.kind === 'prop')
                return this.propertyTarget(ref, null, target);
        }
        if (target.k === 'member') {
            if (target.ref.kind === 'dynamic') {
                var object = this.stable(this.expression(target.target));
                if (object.setup !== null)
                    this.lift(J.expr(object.setup));
                return { type: Kt.DYNAMIC, read: function () { return J.call(self.kt('dynamicGet'), [object.value, J.str(target.name)]); },
                         write: function (value) { return J.call(self.kt('dynamicSet'), [object.value, J.str(target.name), value]); } };
            }
            var memberRef = target.ref;
            if (memberRef.staticOf !== undefined || memberRef.sym.isStatic || (memberRef.sym.owner === null && memberRef.sym.receiver === null))
                return this.propertyTarget(memberRef, null, target);
            var receiver = this.stable(this.expression(target.target));
            if (receiver.setup !== null)
                this.lift(J.expr(receiver.setup));
            return this.propertyTarget(memberRef, receiver.value, target);
        }
        if (target.k === 'index')
            return this.indexTarget(target);
        void type;
        throw new Error('Kotlin: cannot assign to ' + target.k);
    };

    Generator.prototype.localWrite = function (variable, value) {
        if (variable.delegated)
            return this.localDelegateSet(variable, value);
        if (variable.jsName === null || variable.jsName === undefined)
            variable.jsName = this.localName(variable);
        if (variable.boxed)
            return J.assign(J.mem(J.id(variable.jsName), 'v'), value);
        return J.assign(J.id(variable.jsName), value);
    };

    // A property as a target: a field, a setter, a static, a top-level one.
    Generator.prototype.propertyTarget = function (ref, receiverJs, node) {
        var self = this;
        var prop = ref.sym;
        var type = Kt.subst(prop.type, ref.map || new Map());
        var receiver = receiverJs;
        if (receiver === null && prop.owner !== null && !prop.isStatic && prop.receiver === null)
            receiver = this.receiverFor(ref, null);
        if (receiver !== null && !J.isSimple(receiver)) {
            var stable = this.stable(receiver);
            if (stable.setup !== null)
                this.lift(J.expr(stable.setup));
            receiver = stable.value;
        }
        return {
            type: type,
            read: function () { return self.convert(self.propertyRead(ref, receiver, node), self.declaredPropertyType(prop), type); },
            write: function (value) { return self.propertyWrite(ref, receiver, self.convert(value, type, self.declaredPropertyType(prop))); }
        };
    };

    Generator.prototype.propertyWrite = function (ref, receiverJs, value) {
        var prop = ref.sym;
        if (prop.java !== null) {
            if (prop.java.field !== undefined) {
                if (prop.isStatic)
                    return J.assign(J.mem(J.call(this.kt('initialized'), [this.classRef(prop.owner)]), prop.jsName), value);
                return J.assign(J.mem(this.receiverFor(ref, receiverJs), prop.jsName), value);
            }
            return J.call(J.mem(this.receiverFor(ref, receiverJs), prop.java.setter.jsName), [value]);
        }
        if (prop.owner === null) {
            var holder = this.topHolder(prop);
            if (prop.receiver !== null)
                return J.call(J.mem(holder, prop.setterName), [this.receiverFor(ref, receiverJs), value]);
            if (prop.customSetter || prop.delegated)
                return J.call(J.mem(holder, prop.setterName), [value]);
            return J.assign(J.mem(holder, prop.jsName), value);
        }
        var target = this.receiverFor(ref, receiverJs);
        if (prop.receiver !== null)
            return J.call(J.mem(this.thisOf(prop.owner), prop.setterName), [target, value]);
        if (this.directWrite(prop))
            return J.assign(J.mem(target, prop.jsName), value);
        // A val assigned in the constructor: the field itself.
        if (!prop.mutable && prop.hasField)
            return J.assign(J.mem(target, prop.jsName), value);
        return J.call(J.mem(target, prop.setterName), [value]);
    };

    // a[i] as a target: get and set with stable a and i.
    Generator.prototype.indexTarget = function (target) {
        var self = this;
        var values = this.ordered([function () { return self.expression(target.target); }].concat(target.indices.map(function (index) {
            return function () { return self.expression(index); };
        })));
        var stables = values.map(function (value) {
            var stable = self.stable(value);
            if (stable.setup !== null)
                self.lift(J.expr(stable.setup));
            return stable.value;
        });
        var getCall = target.call;
        return {
            type: target.type,
            read: function () {
                return self.withValues(getCall, stables[0], target.indices, stables.slice(1), function () {
                    return self.callCode(getCall, target, false);
                });
            },
            write: null,
            receiver: stables[0],
            indices: stables.slice(1)
        };
    };

    // A call where the receiver and the arguments are given JavaScript values.
    Generator.prototype.withValues = function (call, receiverJs, indexNodes, indexValues, thunk) {
        var saved = [];
        var receiverNode = call.receiverNode;
        var savedReceiver = receiverNode !== null && receiverNode !== undefined ? { k: receiverNode.k, js: receiverNode.js } : null;
        if (receiverNode !== null && receiverNode !== undefined) {
            call.receiverNode = { k: 'delegateArg', type: receiverNode.type, js: receiverJs, line: receiverNode.line };
        }
        indexNodes.forEach(function (node, index) {
            saved.push(node);
            void index;
        });
        var slots = call.slots;
        var replaced = [];
        slots.forEach(function (slot) {
            slot.actuals.forEach(function (actual) {
                var position = indexNodes.indexOf(actual.value);
                if (position >= 0) {
                    replaced.push({ actual: actual, value: actual.value });
                    actual.value = { k: 'delegateArg', type: actual.value.type, js: indexValues[position], line: actual.value.line,
                                     column: actual.value.column };
                }
            });
        });
        var result = thunk();
        replaced.forEach(function (item) { item.actual.value = item.value; });
        call.receiverNode = receiverNode;
        void savedReceiver;
        return result;
    };

    // ++x, x++ (and --): inc/dec of the target; the value before or after.
    Generator.prototype.incrementValue = function (node, prefix) {
        var self = this;
        var argument = node.arg;
        var target = this.assignTarget(argument);
        var type = Kt.resolved(argument.type);
        var intrinsic = node.intrinsic;
        var next = function (current) {
            if (intrinsic !== undefined && intrinsic.kind === 'increment') {
                var kind = intrinsic.operand;
                if (kind === 'char')
                    return J.bin('&', J.bin(node.op === '++' ? '+' : '-', current, J.num(1)), J.num(65535));
                var promoted = kind === 'i8' || kind === 'i16' ? kind : kind;
                return T.ops.binary(opsKind(promoted), node.op === '++' ? '+' : '-', current, J.num(1), self.opsContext());
            }
            return self.withReceiverValue(node.call, current, function () { return self.callCode(node.call, { type: type }, false); });
        };
        if (target.write === null) {
            // a[i]++: get, then set.
            var setCall = node.setCall || this.findSetCall(node);
            var old = this.temp();
            var oldValue = target.read();
            var newValue = next(old);
            var assignNew = this.temp();
            this.lift(J.expr(J.assign(old, oldValue)));
            this.lift(J.expr(J.assign(assignNew, newValue)));
            this.lift(J.expr(this.indexSet(setCall, target, assignNew, argument)));
            return prefix ? assignNew : old;
        }
        if (prefix) {
            var current = target.read();
            return target.write(next(current));
        }
        var before = this.temp();
        return J.seq([J.assign(before, target.read()), target.write(next(before)), before]);
    };

    // A call with its receiver given as JavaScript (inc(), dec()).
    Generator.prototype.withReceiverValue = function (call, receiverJs, thunk) {
        var receiverNode = call.receiverNode;
        call.receiverNode = { k: 'delegateArg', type: receiverNode !== null && receiverNode !== undefined ? receiverNode.type : null,
                              js: receiverJs, line: 0 };
        var result = thunk();
        call.receiverNode = receiverNode;
        return result;
    };

    Generator.prototype.findSetCall = function (node) {
        return node.setCall;
    };

    // a.set(i, value) with stable a and i.
    Generator.prototype.indexSet = function (setCall, target, valueJs, node) {
        var self = this;
        var receiverNode = setCall.receiverNode;
        var indexNodes = [];
        var actuals = [];
        setCall.slots.forEach(function (slot) {
            slot.actuals.forEach(function (actual) { actuals.push(actual); });
        });
        var indices = target.indices;
        actuals.forEach(function (actual, position) {
            if (position < indices.length)
                indexNodes.push(actual.value);
        });
        var saved = actuals.map(function (actual) { return actual.value; });
        actuals.forEach(function (actual, position) {
            var js = position < indices.length ? indices[position] : valueJs;
            actual.value = { k: 'delegateArg', type: actual.value.type, js: js, line: actual.value.line, column: actual.value.column };
        });
        setCall.receiverNode = { k: 'delegateArg', type: receiverNode !== null && receiverNode !== undefined ? receiverNode.type : null,
                                 js: target.receiver, line: 0 };
        var call = this.callCode(setCall, { type: Kt.unitType() }, false);
        setCall.receiverNode = receiverNode;
        actuals.forEach(function (actual, position) { actual.value = saved[position]; });
        void node;
        void self;
        return call;
    };

    // --- Type tests and casts

    // value is type: a check by the class of the run time.
    Generator.prototype.typeTest = function (js, valueType, target, negated) {
        var test = this.isTest(js, Kt.resolved(target));
        return negated ? J.not(test) : test;
    };

    Generator.prototype.isTest = function (js, target) {
        var nullable = Kt.isNullable(target) && target.kind !== 'param';
        var stable = nullable ? this.stable(js) : { setup: null, value: js };
        var value = stable.setup !== null ? J.seq([stable.setup, stable.value]) : stable.value;
        var test = this.classTest(value, Kt.makeNotNull(target));
        if (nullable)
            return J.or(J.bin('==', stable.setup !== null ? J.seq([stable.setup, stable.value]) : stable.value, J.nul()),
                        this.classTest(stable.value, Kt.makeNotNull(target)));
        return test;
    };

    // A non-null type test.
    Generator.prototype.classTest = function (js, target) {
        switch (target.kind) {
        case 'fun':
            return J.bin('===', J.un('typeof', js), J.str('function'));
        case 'param':
            return J.call(this.kt('isType'), [js, this.typeObject(target)]);
        case 'nothing':
            return J.bool(false);
        case 'error':
        case 'dynamic':
            return J.bool(true);
        }
        var sym = target.sym;
        if (sym === Kt.builtins.Any)
            return J.bin('!=', js, J.nul());
        if (sym.arrayDescriptor !== undefined) {
            if (sym === Kt.builtins.Array)
                return J.call(J.path('Array.isArray'), [js]);
            return J.call(this.rt('isArray'), [js, J.str(sym.arrayDescriptor)]);
        }
        if (sym === Kt.builtins.String)
            return J.bin('===', J.un('typeof', js), J.str('string'));
        if (sym === Kt.builtins.Int)
            return J.bin('===', J.un('typeof', js), J.str('number'));
        if (sym === Kt.builtins.Boolean)
            return J.bin('===', J.un('typeof', js), J.str('boolean'));
        if (sym === Kt.builtins.Function)
            return J.bin('===', J.un('typeof', js), J.str('function'));
        if (sym.prim !== null && sym.java === null)
            return J.call(this.kt('isUnsigned'), [js, J.str(sym.prim)]);
        return J.call(this.rt('is'), [js, this.classRef(sym)]);
    };

    Generator.prototype.castValue = function (node) {
        var js = this.expression(node.expr);
        var target = Kt.resolved(node.testType);
        var valueType = node.expr.type;
        // The value boxed (as the cast sees it), then the target representation.
        var boxed = this.convert(js, valueType, Kt.nullableAny());
        if (Kt.isSubtype(valueType, target) && !Kt.resolved(valueType).flexible) {
            var result = this.convert(js, valueType, node.type);
            return result;
        }
        var cast;
        if (node.safe) {
            var stable = this.stable(boxed);
            var tested = stable.setup !== null ? J.seq([stable.setup, stable.value]) : stable.value;
            cast = J.cond(this.isTest(tested, Kt.makeNotNull(target)), stable.value, J.nul());
            return this.convert(cast, Kt.nullableAny(), node.type);
        }
        cast = J.call(this.kt('cast'), [boxed, this.typeObject(target)]);
        return this.convert(cast, Kt.nullableAny(), node.type);
    };
})(globalThis);
