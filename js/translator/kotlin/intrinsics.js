// Kotlin: the members of the primitive types (operators, conversions,
// bitwise functions) as intrinsics, and their translation; the intrinsic
// members of String and arrays.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Kt = T.kotlin;
    if (Kt.primitiveMembers)
        return;

    var J = T.J;

    var NUMERIC = ['Byte', 'Short', 'Int', 'Long', 'Float', 'Double'];
    var KINDS = { Byte: 'i8', Short: 'i16', Int: 'i32', Long: 'i64', Float: 'f32', Double: 'f64', Char: 'char', Boolean: 'bool',
                  UByte: 'u8', UShort: 'u16', UInt: 'u32', ULong: 'u64' };

    function fun(sym, name, params, returns, intrinsic, operator, infix) {
        var fn = Kt.FunSym(name, sym, {});
        fn.params = params.map(function (type, index) { return Kt.ParamSym('p' + index, type); });
        fn.returns = returns;
        fn.intrinsic = intrinsic;
        fn.operator = !!operator;
        fn.infix = !!infix;
        fn.jsName = name + '$intrinsic';
        fn.overridden = overriddenBy(sym, fn);
        fn.isOverride = fn.overridden.length > 0;
        sym.addMember(fn);
        return fn;
    }

    // An intrinsic overrides the member of a supertype with the same
    // signature (Number.toLong, Comparable<Int>.compareTo, Any.toString).
    function overriddenBy(sym, fn) {
        var result = [];
        Kt.supertypeClosure(Kt.classType(sym, [])).slice(1).forEach(function (superType) {
            var owner = superType.sym;
            owner.complete();
            var map = Kt.typeMap(superType);
            (owner.members[fn.name] || []).forEach(function (member) {
                if (member.kind !== 'fun' || member.params.length !== fn.params.length)
                    return;
                if (member.params.every(function (param, index) {
                    return Kt.sameType(Kt.subst(param.type, map), fn.params[index].type);
                }))
                    result.push(member);
            });
        });
        return result;
    }

    function prop(sym, name, type, intrinsic) {
        var member = Kt.PropSym(name, sym, {});
        member.type = type;
        member.intrinsic = intrinsic;
        member.hasField = false;
        member.getterName = name + '$intrinsic';
        sym.addMember(member);
        return member;
    }

    // The intrinsic members of a primitive class (after the builtins are loaded).
    Kt.primitiveMembers = function (sym) {
        var kind = KINDS[sym.name];
        var self = Kt.classType(sym, []);
        var t = function (name) { return Kt.builtinType(name); };
        if (NUMERIC.indexOf(sym.name) >= 0) {
            ['plus', 'minus', 'times', 'div', 'rem'].forEach(function (name) {
                var op = { plus: '+', minus: '-', times: '*', div: '/', rem: '%' }[name];
                NUMERIC.forEach(function (other) {
                    var operand = Kt.promote(kind, KINDS[other]);
                    fun(sym, name, [t(other)], Kt.typeOfKind(operand), { op: 'arith', operator: op, kind: operand }, true);
                });
            });
            NUMERIC.forEach(function (other) {
                fun(sym, 'compareTo', [t(other)], t('Int'), { op: 'compareTo', kind: Kt.promote(kind, KINDS[other]) }, true);
            });
            var unaryKind = kind === 'i8' || kind === 'i16' ? 'i32' : kind;
            fun(sym, 'unaryMinus', [], Kt.typeOfKind(unaryKind), { op: 'negate', kind: unaryKind }, true);
            fun(sym, 'unaryPlus', [], Kt.typeOfKind(unaryKind), { op: 'plus', kind: unaryKind }, true);
            fun(sym, 'inc', [], self, { op: 'inc', kind: kind }, true);
            fun(sym, 'dec', [], self, { op: 'dec', kind: kind }, true);
            ['Byte', 'Short', 'Int', 'Long', 'Float', 'Double', 'Char'].forEach(function (target) {
                fun(sym, 'to' + target, [], t(target), { op: 'convert', from: kind, to: KINDS[target] });
            });
            ['UByte', 'UShort', 'UInt', 'ULong'].forEach(function (target) {
                if (Kt.isIntegralKind(kind) || target === 'UInt' || target === 'ULong')
                    fun(sym, 'to' + target, [], t(target), { op: 'convert', from: kind, to: KINDS[target] });
            });
            if (Kt.isIntegralKind(kind)) {
                ['Byte', 'Short', 'Int', 'Long'].forEach(function (other) {
                    var wide = kind === 'i64' || other === 'Long';
                    fun(sym, 'rangeTo', [t(other)], t(wide ? 'LongRange' : 'IntRange'), { op: 'range', kind: wide ? 'i64' : 'i32' }, true);
                    fun(sym, 'rangeUntil', [t(other)], t(wide ? 'LongRange' : 'IntRange'), { op: 'rangeUntil', kind: wide ? 'i64' : 'i32' }, true);
                });
            }
            if (kind === 'i32' || kind === 'i64') {
                ['and', 'or', 'xor'].forEach(function (name) {
                    fun(sym, name, [self], self, { op: 'bitwise', operator: name, kind: kind }, false, true);
                });
                ['shl', 'shr', 'ushr'].forEach(function (name) {
                    fun(sym, name, [t('Int')], self, { op: 'shift', operator: name, kind: kind }, false, true);
                });
                fun(sym, 'inv', [], self, { op: 'inv', kind: kind });
            }
        } else if (sym.name === 'Char') {
            fun(sym, 'plus', [t('Int')], self, { op: 'charArith', operator: '+' }, true);
            fun(sym, 'minus', [t('Int')], self, { op: 'charArith', operator: '-' }, true);
            fun(sym, 'minus', [self], t('Int'), { op: 'charDiff' }, true);
            fun(sym, 'compareTo', [self], t('Int'), { op: 'compareTo', kind: 'char' }, true);
            fun(sym, 'inc', [], self, { op: 'inc', kind: 'char' }, true);
            fun(sym, 'dec', [], self, { op: 'dec', kind: 'char' }, true);
            fun(sym, 'rangeTo', [self], t('CharRange'), { op: 'range', kind: 'char' }, true);
            fun(sym, 'rangeUntil', [self], t('CharRange'), { op: 'rangeUntil', kind: 'char' }, true);
            ['Byte', 'Short', 'Int', 'Long', 'Float', 'Double'].forEach(function (target) {
                fun(sym, 'to' + target, [], t(target), { op: 'convert', from: 'char', to: KINDS[target] });
            });
            fun(sym, 'toChar', [], self, { op: 'convert', from: 'char', to: 'char' });
            prop(sym, 'code', t('Int'), { op: 'code' });
        } else if (sym.name === 'Boolean') {
            fun(sym, 'not', [], self, { op: 'not' }, true);
            ['and', 'or', 'xor'].forEach(function (name) {
                fun(sym, name, [self], self, { op: 'boolOp', operator: name }, false, true);
            });
            fun(sym, 'compareTo', [self], t('Int'), { op: 'compareTo', kind: 'bool' }, true);
        } else if (Kt.isUnsignedKind(kind)) {
            // As in Kotlin: UByte + UByte is a UInt, anything with a ULong is a ULong.
            ['plus', 'minus', 'times', 'div', 'rem'].forEach(function (name) {
                var op = { plus: '+', minus: '-', times: '*', div: '/', rem: '%' }[name];
                ['UByte', 'UShort', 'UInt', 'ULong'].forEach(function (other) {
                    var wide = kind === 'u64' || other === 'ULong' ? 'u64' : 'u32';
                    fun(sym, name, [t(other)], t(wide === 'u64' ? 'ULong' : 'UInt'), { op: 'unsigned', operator: op, kind: wide }, true);
                });
            });
            fun(sym, 'compareTo', [self], t('Int'), { op: 'compareTo', kind: kind }, true);
            ['Byte', 'Short', 'Int', 'Long', 'UByte', 'UShort', 'UInt', 'ULong', 'Double'].forEach(function (target) {
                fun(sym, 'to' + target, [], t(target), { op: 'convert', from: kind, to: KINDS[target] });
            });
        }
        fun(sym, 'toString', [], t('String'), { op: 'toString', kind: kind });
        fun(sym, 'hashCode', [], t('Int'), { op: 'hashCode', kind: kind });
        var equals = fun(sym, 'equals', [Kt.nullableAny()], t('Boolean'), { op: 'equals', kind: kind }, true);
        equals.isOverride = true;
    };

    // Int, Long, Short... as the extension functions of the integer types need (toInt() on Number).
    var Generator = Kt.Generator;

    // A call of an intrinsic member: String, arrays, primitives.
    Generator.prototype.intrinsicCall = function (fn, receiver, receiverType, args, result, node) {
        var intrinsic = fn.intrinsic;
        if (receiver === null)
            receiver = this.implicitReceiver(result);
        if (typeof intrinsic === 'string')
            return this.namedIntrinsic(intrinsic, fn, receiver, receiverType, args, result, node);
        var kind = intrinsic.kind;
        var ctx = this.opsContext();
        var self = this;
        // Primitive operands: the receiver and the argument as the operand kind.
        var operand = function (js, type, target) {
            var from = Kt.isPrimitive(type) ? Kt.primKind(type) : null;
            if (from === null)
                return self.unbox(js, target);
            return self.numeric(js, from, target);
        };
        var receiverKind = receiverType !== null ? Kt.primKind(Kt.makeNotNull(receiverType)) : null;
        var argType = fn.params.length > 0 ? fn.params[0].type : null;
        switch (intrinsic.op) {
        case 'arith':
            return T.ops.binary(kind, intrinsic.operator, operand(receiver, receiverType, kind), operand(args[0], argType, kind), ctx);
        case 'unsigned':
            return T.ops.binary(kind, intrinsic.operator, operand(receiver, receiverType, kind), operand(args[0], argType, kind), ctx);
        case 'compareTo': {
            var left = this.stable(operand(receiver, receiverType, kind === 'bool' || kind === 'char' ? kind : kind));
            var right = this.stable(operand(args[0], argType, kind === 'bool' || kind === 'char' ? kind : kind));
            var opsKind = kind === 'char' ? 'u16' : (kind === 'bool' ? 'i32' : kind);
            var setups = [left.setup, right.setup].filter(function (item) { return item !== null; });
            var less = T.ops.compare(opsKind, '<', left.value, right.value, ctx);
            var greater = T.ops.compare(opsKind, '>', left.value, right.value, ctx);
            var compare = J.cond(less, J.un('-', J.num(1)), J.cond(greater, J.num(1), J.num(0)));
            if (kind === 'f64' || kind === 'f32')
                compare = J.call(this.kt('compareDoubles'), [left.value, right.value]);
            return setups.length > 0 ? J.seq(setups.concat([compare])) : compare;
        }
        case 'negate':
            return T.ops.unary(kind, '-', operand(receiver, receiverType, kind), ctx);
        case 'plus':
            return operand(receiver, receiverType, kind);
        case 'inc':
        case 'dec':
            if (kind === 'char')
                return J.bin('&', J.bin(intrinsic.op === 'inc' ? '+' : '-', receiver, J.num(1)), J.num(65535));
            return T.ops.binary(kind === 'char' ? 'u16' : kind, intrinsic.op === 'inc' ? '+' : '-', receiver, J.num(1), ctx);
        case 'convert':
            return this.conversion(receiver, intrinsic.from, intrinsic.to);
        case 'range':
        case 'rangeUntil': {
            var names = { i32: 'IntRange', i64: 'LongRange', char: 'CharRange' };
            var cls = this.session.libraryClass('kotlin.ranges.' + names[kind]);
            var from = operand(receiver, receiverType, kind);
            var to = operand(args[0], argType, kind);
            if (intrinsic.op === 'rangeUntil')
                return J.call(this.kt('rangeUntil'), [this.classRef(cls), J.str(kind), from, to]);
            return J.call(J.mem(J.new_(this.classRef(cls), []), cls.complete().ctors[0].jsName), [from, to]);
        }
        case 'bitwise': {
            var op = { and: '&', or: '|', xor: '^' }[intrinsic.operator];
            if (kind === 'i32')
                return J.bin(op, receiver, args[0]);
            return T.ops.binary(kind, op, receiver, args[0], ctx);
        }
        case 'shift':
            if (kind === 'i32') {
                var count = J.bin('&', args[0], J.num(31));
                if (intrinsic.operator === 'shl')
                    return J.bin('<<', receiver, count);
                if (intrinsic.operator === 'shr')
                    return J.bin('>>', receiver, count);
                return J.bin('|', J.bin('>>>', receiver, count), J.num(0));
            }
            if (intrinsic.operator === 'ushr')
                return J.call(this.rt('lushr'), [receiver, J.bin('&', args[0], J.num(63))]);
            return J.call(J.mem(J.mem(J.id('$T'), 'i64'), intrinsic.operator), [receiver, J.bin('&', args[0], J.num(63))]);
        case 'inv':
            return T.ops.unary(kind, '^', receiver, ctx);
        case 'not':
            return J.not(receiver);
        case 'boolOp':
            if (intrinsic.operator === 'xor')
                return J.bin('!==', receiver, args[0]);
            return J.un('!', J.un('!', J.bin(intrinsic.operator === 'and' ? '&' : '|', receiver, args[0])));
        case 'charArith':
            return J.bin('&', J.bin(intrinsic.operator, receiver, operand(args[0], argType, 'i32')), J.num(65535));
        case 'charDiff':
            return J.bin('-', receiver, args[0]);
        case 'code':
            return receiver;
        case 'toString': {
            // In a template a number is concatenated as it is; here it becomes a string.
            var text = this.stringOf(operand(receiver, receiverType, kind), Kt.typeOfKind(kind));
            return text.k === 'call' ? text : J.bin('+', J.str(''), text);
        }
        case 'hashCode':
            return J.call(this.rt('hashCode'), [this.box(operand(receiver, receiverType, kind), kind)]);
        case 'equals':
            return J.call(this.kt('eq'), [this.box(operand(receiver, receiverType, kind), kind), args[0]]);
        }
        void receiverKind;
        throw new Error('Kotlin: unknown intrinsic ' + intrinsic.op);
    };

    // Number conversions as Kotlin/JVM does them: Double to Int saturates,
    // Int to Byte wraps, Int to Char keeps 16 bits.
    Generator.prototype.conversion = function (js, from, to) {
        if (from === to)
            return js;
        if (to === 'char') {
            if (from === 'f32' || from === 'f64')
                return J.bin('&', J.call(this.rt('d2i'), [js]), J.num(65535));
            if (from === 'i64')
                return J.bin('&', T.ops.convert('i64', 'i32', js, this.opsContext()), J.num(65535));
            return J.bin('&', js, J.num(65535));
        }
        if (from === 'char')
            return this.numeric(js, 'u16', to);
        return this.numeric(js, from, to);
    };

    // String.plus, String.get, String.length, arrays.
    Generator.prototype.namedIntrinsic = function (name, fn, receiver, receiverType, args, result, node) {
        switch (name) {
        case 'concat':
            return J.bin('+', receiver, J.call(this.kt('str'), [args[0]]));
        case 'charAt':
            return J.call(this.kt('charAt'), [receiver, args[0]]);
        case 'arrayGet':
            return J.call(this.kt('arrayGet'), [receiver, args[0]]);
        case 'arraySet':
            return J.call(this.kt('arraySet'), [receiver, args[0], args[1]]);
        case 'arrayIterator':
            return J.call(this.kt('arrayIterator'), [receiver]);
        }
        var native = this.session.nativeFor(fn);
        if (native !== null)
            return J.call(J.mem(this.constant(native), 'call'), [receiver].concat(args));
        void receiverType;
        void node;
        throw new Error('Kotlin: unknown intrinsic ' + name);
    };
})(globalThis);
