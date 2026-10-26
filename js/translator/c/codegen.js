// C: translation into a JavaScript tree over linear memory. Scalars whose
// address is never taken are JavaScript variables; arrays, structs and
// everything pointed to live in the stack frame ($fp + offset) or in
// static memory. The value of a struct or an array in an expression is
// its address.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var C = T.c;
    if (C.Generator)
        return;

    var J = T.J;
    var ops = T.ops;
    var big = T.big;
    var types = C.types;

    function Generator(checker, session) {
        this.checker = checker;
        this.session = session;
        this.memory = session.memory;
        this.constants = [];
        this.constantIndex = new Map();
        this.fn = null;
        this.asyncPossible = false;
    }
    C.Generator = Generator;

    Generator.prototype.constant = function (value) {
        var index = this.constantIndex.get(value);
        if (index === undefined) {
            index = this.constants.length;
            this.constants.push(value);
            this.constantIndex.set(value, index);
        }
        return J.idx(J.id('$D'), J.num(index));
    };

    Generator.prototype.error = function (node, message) {
        throw new T.CompileError(message, node ? node.line : 0, node ? node.column : 0, node && node.file ? node.file : '');
    };

    Generator.prototype.M = function (name) {
        return J.mem(J.id('$M'), name);
    };

    Generator.prototype.temp = function () {
        return J.id(this.fn.scope.temp());
    };

    Generator.prototype.opsContext = function () {
        var self = this;
        if (this.fn.opsContext === undefined) {
            this.fn.opsContext = {
                temp: function () { return self.fn.scope.temp(); },
                helper: function (name) { return J.mem(J.id('$T'), name); },
                divideByZero: J.call(J.mem(J.id('$c'), 'divideByZero'), [])
            };
        }
        return this.fn.opsContext;
    };

    function kindOf(type) {
        if (type.kind === 'pointer' || type.kind === 'function')
            return 'ptr';
        if (type.kind === 'valist')
            return 'valist';
        return C.numKind(type);
    }
    C.kindOf = kindOf;

    // A constant in the representation of its type.
    Generator.prototype.literal = function (value, type) {
        var kind = kindOf(type);
        if (kind === 'f64' || kind === 'f32')
            return J.num(typeof value === 'number' ? value : big.toFloat(value));
        if (typeof value === 'number' && !Number.isInteger(value))
            value = big.fromFloat(value);
        value = C.wrapConstant(value, type.kind === 'pointer' ? types.ulong : (type.kind === 'enum' ? types.int : type));
        if (kind === 'i64' || kind === 'u64' || kind === 'ptr') {
            if (big.cmp(value, -9007199254740991) >= 0 && big.cmp(value, 9007199254740991) <= 0)
                return J.num(big.toFloat(value));
            return this.constant(T.bigToI64(value, kind === 'i64'));
        }
        return J.num(big.toFloat(value));
    };

    // --- Memory

    var VIEWS = {
        i8: ['I8', 0], u8: ['U8', 0], i16: ['I16', 1], u16: ['U16', 1], i32: ['I32', 2], u32: ['U32', 2],
        f32: ['F32', 2], f64: ['F64', 3]
    };

    // Checks the address temporary (assigned here) with one comparison:
    // outside the memory or misaligned - (temporary & (size - 1)) in the
    // high bits makes the number greater than lim (the memory is smaller
    // than 2^29).
    Generator.prototype.addressTest = function (temporary, address, shift) {
        var offset = J.bin('-', J.assign(temporary, address), J.num(C.runtime.NULL_PAGE));
        if (shift > 0)
            offset = J.bin('|', offset,
                           J.bin('<<', J.bin('&', temporary, J.num((1 << shift) - 1)), J.num(shift === 3 ? 29 : 30)));
        return J.bin('<', J.bin('>>>', offset, J.num(0)), this.M('lim'));
    };

    // The index of a view by an address; with the check the address goes
    // through a temporary, and a misaligned one is read through a spare
    // cell ($M.misaligned).
    Generator.prototype.viewIndex = function (address, shift, checked) {
        if (!checked)
            return shift === 0 ? address : J.bin('>>', address, J.num(shift));
        var temporary = this.temp();
        var test = this.addressTest(temporary, address, shift);
        if (shift === 0)
            return J.cond(test, temporary, J.call(this.M('fault'), [temporary]));
        return J.cond(test, J.bin('>>', temporary, J.num(shift)),
                      J.call(this.M('misaligned'), [temporary, J.num(shift)]));
    };

    function isSimple(node) {
        return node.k === 'id' || node.k === 'num';
    }

    Generator.prototype.load = function (type, address, checked) {
        if (type.kind === 'array' || C.isRecord(type) || type.kind === 'function')
            return address;
        var kind = kindOf(type);
        if (kind === 'ptr')
            return J.call(this.M('loadPointer'), [address]);
        if (kind === 'i64' || kind === 'u64')
            return J.call(this.M('load64'), [address, J.bool(kind === 'i64')]);
        if (kind === 'valist')
            this.error(null, 'va_list in memory is not supported');
        var view = VIEWS[kind];
        return J.idx(this.M(view[0]), this.viewIndex(address, view[1], checked));
    };

    // Writes a value converted already; the expression is that value.
    Generator.prototype.store = function (type, address, value, checked) {
        if (C.isRecord(type) || type.kind === 'array')
            return J.call(this.M('copy'), [address, value, J.num(type.size)]);
        var kind = kindOf(type);
        if (kind === 'ptr')
            return J.call(this.M('storePointer'), [address, value]);
        if (kind === 'i64' || kind === 'u64')
            return J.call(this.M('store64'), [address, value]);
        var view = VIEWS[kind];
        if (!checked || view[1] === 0)
            return J.assign(J.idx(this.M(view[0]), this.viewIndex(address, view[1], checked)), value);
        var temporary = this.temp();
        var steps = [];
        if (!isSimple(value)) {
            var valueTemporary = this.temp();
            steps.push(J.assign(valueTemporary, value));
            value = valueTemporary;
        }
        steps.push(J.cond(this.addressTest(temporary, address, view[1]),
                          J.assign(J.idx(this.M(view[0]), J.bin('>>', temporary, J.num(view[1]))), value),
                          J.call(this.M('storeMisaligned'), [temporary, J.num(view[1]), J.str(view[0]), value])));
        return steps.length === 1 ? steps[0] : J.seq(steps);
    };

    // --- Conversions

    Generator.prototype.convert = function (js, from, to) {
        if (to.kind === 'void')
            return js;
        if (from.kind === 'array')
            from = C.pointer(from.of);
        else if (from.kind === 'function')
            from = C.pointer(from);
        if (C.isRecord(to) || to.kind === 'valist' || to.kind === 'array')
            return js;
        var fromKind = kindOf(from), toKind = kindOf(to);
        if (to === types.bool) {
            if (from === types.bool)
                return js;
            return J.cond(J.bin('!==', js, J.num(0)), J.num(1), J.num(0));
        }
        if (fromKind === toKind)
            return js;
        if (toKind === 'ptr') {
            if (fromKind === 'i64' || fromKind === 'u64')
                return J.call(J.mem(J.id('$c'), 'toAddress'), [js]);
            if (fromKind === 'f64' || fromKind === 'f32')
                return J.call(J.path('Math.trunc'), [js]);
            return js;
        }
        if (fromKind === 'ptr')
            return toKind === 'i64' || toKind === 'u64' ? js : ops.wrap(toKind, js);
        return ops.convert(fromKind, toKind, js, this.opsContext());
    };

    // The value of node converted to the type to.
    Generator.prototype.valueAs = function (node, to) {
        return this.convert(this.rvalue(node), node.type, to);
    };

    // --- Variables

    // The place of a variable in memory: the frame, static memory; null -
    // it lives in JavaScript.
    Generator.prototype.addressOfObject = function (object) {
        if (object.storage === 'global' || object.storage === 'static') {
            if (object.address === undefined)
                this.session.allocateObject(object);
            return J.num(object.address);
        }
        if (object.vlaAddress)
            return J.id(object.jsName);
        if (object.frameOffset === undefined)
            return null;
        return J.bin('+', J.id('$fp'), J.num(object.frameOffset));
    };

    // The variable lives in the stack frame: arrays, structs and whatever
    // has its address taken.
    Generator.prototype.placeLocal = function (object) {
        var type = object.type;
        if (C.isVariablySized(type)) {
            object.vlaAddress = true;
            return;
        }
        if (object.addressTaken || C.isRecord(type) || type.kind === 'array')
            object.frameOffset = this.frameSlot(type.size, type.align);
    };

    Generator.prototype.frameSlot = function (size, align) {
        var offset = Math.ceil(this.fn.frameSize / Math.max(align, 1)) * Math.max(align, 1);
        this.fn.frameSize = offset + size;
        return offset;
    };

    // --- Expressions

    // The address of an lvalue.
    Generator.prototype.address = function (node) {
        switch (node.k) {
        case 'paren':
            return this.address(node.expr);
        case 'ident': {
            var object = node.obj;
            if (object.kind === 'func')
                return J.num(this.memory.functionAddress(object.index));
            var place = this.addressOfObject(object);
            if (place === null)
                this.error(node, "internal error: '" + object.name + "' is not in memory");
            return place;
        }
        case 'string':
            return J.num(this.session.literal(node.bytes, node.wide));
        case 'index': {
            var base = node.swapped ? node.index : node.expr;
            var offset = node.swapped ? node.expr : node.index;
            return this.pointerOffset(this.rvalue(base), offset, this.stride(node), false);
        }
        case 'member': {
            var record = node.arrow ? this.rvalue(node.expr) : this.address(node.expr);
            return node.offset === 0 ? record : J.bin('+', record, J.num(node.offset));
        }
        case 'unary':
            if (node.op === '*')
                return this.rvalue(node.expr);
            break;
        case 'compound':
            return this.compoundLiteral(node);
        case 'call':
        case 'assign':
        case 'cond':
        case 'comma':
            // A struct value: its address is the value itself.
            if (C.isRecord(node.type))
                return this.rvalue(node);
            break;
        }
        this.error(node, 'expression is not addressable');
    };

    // A pointer plus an integer: p + i * size.
    // Addresses are the low 32 bits. An offset that takes the pointer past
    // 2^32 (a 64-bit index) gives a surely bad address, not someone else's
    // memory.
    var BAD_ADDRESS = 4294967295;

    // size: a number, or the expression of a variably sized element.
    Generator.prototype.pointerOffset = function (pointer, indexNode, size, negate) {
        var sizeExpr = typeof size === 'number' ? J.num(size) : size;
        if (indexNode.value !== undefined && typeof size === 'number') {
            // A 64-bit unsigned has the same bits as a signed one: (size_t)-1 is -1.
            var constant = C.wrapConstant(indexNode.value, types.long);
            var offset = big.toFloat(constant) * size;
            if (negate)
                offset = -offset;
            if (Math.abs(offset) >= 2147483648)
                return J.seq([pointer, J.num(BAD_ADDRESS)]);
            return offset === 0 ? pointer : J.bin('+', pointer, J.num(offset));
        }
        var kind = kindOf(indexNode.type);
        var index = this.rvalue(indexNode);
        if (kind === 'i64' || kind === 'u64') {
            var indexTemporary = this.temp();
            index = J.cond(J.bin('===', J.un('typeof', J.assign(indexTemporary, index)), J.str('number')),
                           indexTemporary, J.call(J.mem(J.mem(J.id('$T'), 'i64'), 'toFloat'), [indexTemporary]));
            var temporary = this.temp();
            var scaledIndex = size === 1 ? index : J.bin('*', index, sizeExpr);
            var sum = J.assign(temporary, J.bin(negate ? '-' : '+', pointer, scaledIndex));
            return J.cond(J.and(J.bin('>=', sum, J.num(0)), J.bin('<', temporary, J.num(4294967296))), temporary,
                          J.num(BAD_ADDRESS));
        }
        var scaled = size === 1 ? index : J.bin('*', index, sizeExpr);
        return J.bin(negate ? '-' : '+', pointer, scaled);
    };

    // The bytes of the element of pointer arithmetic: known at run time for
    // a variably sized array.
    Generator.prototype.stride = function (node) {
        return node.elemType ? this.vlaSize(node.elemType) : node.elemSize;
    };

    Generator.prototype.pointerStep = function (to) {
        if (C.isVariablySized(to))
            return this.vlaSize(to);
        return J.num(to.kind === 'void' ? 1 : to.size);
    };

    // Whether the address needs a check: access to an own variable does not.
    function isDirect(node) {
        while (node.k === 'paren')
            node = node.expr;
        if (node.k === 'ident')
            return true;
        if (node.k === 'member' && !node.arrow)
            return isDirect(node.expr);
        return false;
    }

    Generator.prototype.rvalue = function (node) {
        if (node.value !== undefined && (C.isArithmetic(node.type) || node.type.kind === 'pointer'))
            return this.literal(node.value, node.type);
        switch (node.k) {
        case 'paren':
            return this.rvalue(node.expr);
        case 'ident':
            return this.identifier(node);
        case 'string':
            return J.num(this.session.literal(node.bytes, node.wide));
        case 'index':
        case 'member':
            if (node.bitfield)
                return this.loadBitfield(node);
            return this.load(node.type, this.address(node), !isDirect(node));
        case 'call':
            return this.call(node);
        case 'unary':
            return this.unary(node);
        case 'preinc':
        case 'postinc':
            return this.increment(node, node.k === 'postinc');
        case 'cast':
            return this.convert(this.rvalue(node.expr), node.expr.type, node.type);
        case 'binary':
            return this.binary(node);
        case 'assign':
            return this.assign(node);
        case 'cond':
            return J.cond(this.cond(node.cond), this.valueAs(node.then === null ? node.cond : node.then, node.type),
                          this.valueAs(node.otherwise, node.type));
        case 'comma':
            var self = this;
            return J.seq(node.list.map(function (item, index) {
                return index === node.list.length - 1 ? self.rvalue(item) : self.effect(item);
            }));
        case 'sizeof':
            return J.call(J.path('Math.max'), [J.num(0), this.vlaSize(node.vlaType)]);
        case 'compound':
            return this.load(node.type, this.compoundLiteral(node), false);
        case 'vaarg':
            return J.call(J.mem(J.id('$c'), 'vaArg'), [this.rvalue(node.ap), J.str(kindOf(node.type))]);
        case 'vastart': {
            var list = this.place(node.ap);
            return withSetup(list.setup, list.set(J.call(J.mem(J.id('$c'), 'vaStart'), [J.id('$va')])));
        }
        case 'vaend':
            return J.undef();
        case 'vacopy': {
            var copy = this.place(node.ap);
            return withSetup(copy.setup, copy.set(J.call(J.mem(J.id('$c'), 'vaCopy'), [this.rvalue(node.source)])));
        }
        }
        this.error(node, 'cannot translate expression');
    };

    // An expression for its side effect.
    Generator.prototype.effect = function (node) {
        if (node.k === 'postinc')
            return this.increment(node, false);
        return this.rvalue(node);
    };

    Generator.prototype.identifier = function (node) {
        var object = node.obj;
        if (object.kind === 'func')
            return J.num(this.memory.functionAddress(object.index));
        if (object.kind === 'enumconst')
            return this.literal(object.value, types.int);
        var place = this.addressOfObject(object);
        if (place === null)
            return J.id(object.jsName);
        return this.load(object.type, place, false);
    };

    Generator.prototype.vlaSize = function (type) {
        if (!C.isVariablySized(type))
            return J.num(type.size);
        return J.bin('*', type.vla ? this.vlaLength(type) : J.num(type.length), this.vlaSize(type.of));
    };

    Generator.prototype.vlaLength = function (type) {
        if (type.lengthVariable !== undefined)
            return J.id(type.lengthVariable);
        return this.convert(this.rvalue(type.vla), type.vla.type, types.long);
    };

    // --- Boolean conditions (without 0/1)

    Generator.prototype.cond = function (node) {
        while (node.k === 'paren')
            node = node.expr;
        if (node.value !== undefined && C.isArithmetic(node.type))
            return J.bool(!(typeof node.value === 'number' ? node.value === 0 : big.sign(node.value) === 0));
        if (node.k === 'binary') {
            switch (node.op) {
            case '&&':
            case '||':
                return J.bin(node.op, this.cond(node.left), this.cond(node.right));
            case '<':
            case '>':
            case '<=':
            case '>=':
            case '==':
            case '!=':
                return this.comparison(node);
            }
        }
        if (node.k === 'unary' && node.op === '!')
            return J.not(this.cond(node.expr));
        return J.bin('!==', this.rvalue(node), J.num(0));
    };

    Generator.prototype.comparison = function (node) {
        var type = node.opType;
        var left = this.valueAs(node.left, type), right = this.valueAs(node.right, type);
        var kind = kindOf(type);
        if (kind === 'ptr' || kind === 'f64' || kind === 'f32' || kind === 'i32' || kind === 'u32' || kind === 'i8' ||
            kind === 'u8' || kind === 'i16' || kind === 'u16') {
            var op = node.op === '==' ? '===' : (node.op === '!=' ? '!==' : node.op);
            return J.bin(op, left, right);
        }
        return ops.binary(kind, node.op, left, right, this.opsContext());
    };

    // --- Unary operators

    Generator.prototype.unary = function (node) {
        var ctx = this.opsContext();
        switch (node.op) {
        case '&':
            if (node.expr.type.kind === 'function')
                return this.rvalue(node.expr);
            return this.address(node.expr);
        case '*': {
            var pointer = this.rvalue(node.expr);
            if (node.type.kind === 'function' || node.type.kind === 'array' || C.isRecord(node.type))
                return C.isRecord(node.type) ? J.call(this.M('check'), [pointer, J.num(node.type.size)]) : pointer;
            return this.load(node.type, pointer, true);
        }
        case '+':
            return this.valueAs(node.expr, node.type);
        case '-':
            return ops.unary(kindOf(node.type), '-', this.valueAs(node.expr, node.type), ctx);
        case '~':
            return ops.unary(kindOf(node.type), '^', this.valueAs(node.expr, node.type), ctx);
        case '!':
            return J.cond(this.cond(node.expr), J.num(0), J.num(1));
        }
        this.error(node, 'unknown operator');
    };

    // --- Binary operators

    Generator.prototype.binary = function (node) {
        var op = node.op;
        var ctx = this.opsContext();
        if (op === '&&' || op === '||' || op === '<' || op === '>' || op === '<=' || op === '>=' || op === '==' || op === '!=')
            return J.cond(this.cond(node), J.num(1), J.num(0));
        if (node.pointerDifference) {
            var difference = J.bin('-', this.rvalue(node.left), this.rvalue(node.right));
            if (node.elemType)
                return J.bin('|', J.bin('/', difference, this.vlaSize(node.elemType)), J.num(0));
            return node.elemSize === 1 ? difference : J.bin('|', J.bin('/', difference, J.num(node.elemSize)), J.num(0));
        }
        if (node.pointerArithmetic) {
            var pointerNode = node.pointerArithmetic === 'left' ? node.left : node.right;
            var indexNode = node.pointerArithmetic === 'left' ? node.right : node.left;
            return this.pointerOffset(this.rvalue(pointerNode), indexNode, this.stride(node), op === '-');
        }
        var type = node.opType;
        var kind = kindOf(type);
        if (op === '<<' || op === '>>') {
            var count = this.valueAs(node.right, types.int);
            if (node.right.value === undefined)
                count = J.bin('&', count, J.num(type.size * 8 - 1));
            return ops.binary(kind, op, this.valueAs(node.left, type), count, ctx);
        }
        return ops.binary(kind, op, this.valueAs(node.left, type), this.valueAs(node.right, type), ctx);
    };

    // --- Assignment and ++/--

    // A place to write to: { setup, get, set(value) }.
    Generator.prototype.place = function (node) {
        var self = this;
        while (node.k === 'paren')
            node = node.expr;
        var type = node.type;
        if (node.k === 'ident' && node.obj.kind === 'var') {
            var where = this.addressOfObject(node.obj);
            if (where === null) {
                var name = J.id(node.obj.jsName);
                return { setup: [], get: name, set: function (value) { return J.assign(name, value); } };
            }
            return { setup: [], get: this.load(type, where, false),
                     set: function (value) { return self.store(type, where, value, false); } };
        }
        if (node.bitfield) {
            var holder = this.temp();
            var setupBit = J.assign(holder, this.address(node));
            return { setup: [setupBit], get: this.loadBitfield(node, holder),
                     set: function (value) { return self.storeBitfield(node, holder, value); } };
        }
        var address = this.temp();
        var setup = J.assign(address, this.address(node));
        var checked = !isDirect(node);
        return { setup: [setup], get: this.load(type, address, checked),
                 set: function (value) { return self.store(type, address, value, checked); } };
    };

    function withSetup(setup, node) {
        return setup.length === 0 ? node : J.seq(setup.concat([node]));
    }

    Generator.prototype.assign = function (node) {
        var place = this.place(node.target);
        var target = node.target.type;
        if (node.op === '=')
            return withSetup(place.setup, place.set(this.valueAs(node.source, target)));
        var op = node.op.slice(0, -1);
        var result;
        if (node.pointerArithmetic) {
            result = this.pointerOffset(place.get, node.source, this.stride(node), op === '-');
        } else {
            var type = node.opType;
            var right = op === '<<' || op === '>>' ? this.valueAs(node.source, types.int) : this.valueAs(node.source, type);
            if ((op === '<<' || op === '>>') && node.source.value === undefined)
                right = J.bin('&', right, J.num(type.size * 8 - 1));
            result = this.convert(ops.binary(kindOf(type), op, this.convert(place.get, target, type), right, this.opsContext()),
                                  type, target);
        }
        return withSetup(place.setup, place.set(result));
    };

    Generator.prototype.increment = function (node, postfix) {
        var place = this.place(node.expr);
        var type = node.type;
        var step;
        if (type.kind === 'pointer') {
            step = J.bin(node.op === '++' ? '+' : '-', place.get, this.pointerStep(type.to));
        } else {
            var opType = C.isInteger(type) ? C.promote(type) : type;
            var one = this.literal(1, opType);
            step = this.convert(ops.binary(kindOf(opType), node.op === '++' ? '+' : '-', this.convert(place.get, type, opType),
                                           one, this.opsContext()), opType, type);
        }
        if (!postfix)
            return withSetup(place.setup, place.set(step));
        // x++: the old value goes to a temporary.
        var old = this.temp();
        var stepFromOld;
        if (type.kind === 'pointer') {
            stepFromOld = J.bin(node.op === '++' ? '+' : '-', old, this.pointerStep(type.to));
        } else {
            var promoted = C.isInteger(type) ? C.promote(type) : type;
            stepFromOld = this.convert(ops.binary(kindOf(promoted), node.op === '++' ? '+' : '-', this.convert(old, type, promoted),
                                                  this.literal(1, promoted), this.opsContext()), promoted, type);
        }
        return withSetup(place.setup, J.seq([J.assign(old, place.get), place.set(stepFromOld), old]));
    };

    // --- Bit fields

    Generator.prototype.bitfieldUnit = function (field) {
        var size = field.type.size;
        if (size === 8)
            this.error(null, '64-bit bit-fields are not supported');
        return size === 4 ? ['U32', 2] : (size === 2 ? ['U16', 1] : ['U8', 0]);
    };

    Generator.prototype.loadBitfield = function (node, address) {
        var field = node.bitfield;
        var unit = this.bitfieldUnit(field);
        var raw = J.idx(this.M(unit[0]), this.viewIndex(address || this.address(node), unit[1], true));
        var bits = field.bits;
        if (field.type.signed) {
            var left = 32 - field.bitOffset - bits;
            return J.bin('>>', J.bin('<<', raw, J.num(left)), J.num(32 - bits));
        }
        var mask = bits === 32 ? 0xFFFFFFFF : (Math.pow(2, bits) - 1);
        return J.bin('>>>', J.bin('&', J.bin('>>>', raw, J.num(field.bitOffset)), J.num(mask)), J.num(0));
    };

    Generator.prototype.storeBitfield = function (node, address, value) {
        var field = node.bitfield;
        var unit = this.bitfieldUnit(field);
        var mask = (bitsMask(field.bits) * Math.pow(2, field.bitOffset)) >>> 0;
        var slot = J.idx(this.M(unit[0]), this.viewIndex(address, unit[1], true));
        var valueTemporary = this.temp();
        var combined = J.bin('|', J.bin('&', slot, J.num(~mask >>> 0)),
                             J.bin('&', J.bin('<<', J.assign(valueTemporary, value), J.num(field.bitOffset)),
                                   J.num(mask)));
        var slot2 = J.idx(this.M(unit[0]), this.viewIndex(address, unit[1], true));
        return J.seq([J.assign(slot2, combined), valueTemporary]);
    };

    function bitsMask(bits) {
        return bits >= 32 ? 0xFFFFFFFF : Math.pow(2, bits) - 1;
    }

    // --- Compound literal

    Generator.prototype.compoundLiteral = function (node) {
        var object = node.object;
        if (object === undefined) {
            // Outside functions - static memory.
            if (node.staticAddress === undefined)
                node.staticAddress = this.memory.allocateStatic(node.type.size, node.type.align);
            this.fn.preInit.push(this.initialize(J.num(node.staticAddress), node.type, node.init));
            return J.num(node.staticAddress);
        }
        if (object.frameOffset === undefined)
            object.frameOffset = this.frameSlot(node.type.size, node.type.align);
        var address = J.bin('+', J.id('$fp'), J.num(object.frameOffset));
        return J.seq([this.initialize(address, node.type, node.init), address]);
    };

    // --- Memory initialization

    // An expression that fills the memory at an address with an initializer.
    Generator.prototype.initialize = function (address, type, init) {
        var self = this;
        var steps = [];
        if (init.k !== 'initlist') {
            if (type.kind === 'array' && init.k === 'string') {
                var bytes = init.bytes.slice();
                var length = type.length !== null && type.length >= 0 ? type.length : bytes.length + 1;
                while (bytes.length < length)
                    bytes.push(0);
                bytes = bytes.slice(0, length);
                var source = this.session.literal(bytes, init.wide, true);
                return J.call(this.M('copy'), [address, J.num(source), J.num(length * type.of.size)]);
            }
            return this.store(type, address, this.valueAs(init, type), false);
        }
        if (C.isScalar(type))
            return init.items.length > 0 ? this.initialize(address, type, init.items[0].value) : this.store(type, address, this.literal(0, type), false);
        var base = this.temp();
        steps.push(J.assign(base, address));
        steps.push(J.call(this.M('fill'), [base, J.num(0), J.num(type.size)]));
        if (type.kind === 'array') {
            init.items.forEach(function (item) {
                for (var position = item.position; position <= item.lastPosition; ++position) {
                    var elementAddress = position === 0 ? base : J.bin('+', base, J.num(position * type.of.size));
                    steps.push(self.initialize(elementAddress, type.of, item.value));
                }
            });
        } else {
            init.items.forEach(function (item) {
                var offset = 0;
                item.fieldPath.forEach(function (field) { offset += field.offset; });
                var field = item.fieldPath[item.fieldPath.length - 1];
                var fieldAddress = offset === 0 ? base : J.bin('+', base, J.num(offset));
                if (field.bits !== null) {
                    steps.push(self.storeBitfield({ bitfield: field }, fieldAddress, self.valueAs(item.value, field.type)));
                    return;
                }
                steps.push(self.initialize(fieldAddress, field.type, item.value));
            });
        }
        return J.seq(steps);
    };
})(globalThis);
