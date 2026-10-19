// C++: translation of checked expressions into a JavaScript tree over the
// linear memory of C (js/translator/c/codegen.js gives loads, stores and
// conversions). Three ways to translate an expression: value(e) - a scalar,
// address(e) - the address of an object, init(dest, e) - an object built
// at an address (constructors, aggregates, results of calls). Temporaries
// live in the frame of the function; those with destructors are destroyed
// at the end of their full-expression (cleanups).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var C = T.c;
    var X = T.cpp;
    if (X.Generator)
        return;

    var J = T.J;
    var ops = T.ops;
    var big = T.big;
    var types = X.types;
    var unqual = X.unqual;

    function Generator(session) {
        C.Generator.call(this, null, session);
        this.cleanups = null;
        this.scopes = [];
        this.functions = [];
    }
    Generator.prototype = Object.create(C.Generator.prototype);
    Generator.prototype.constructor = Generator;
    X.Generator = Generator;

    function kindOf(type) {
        type = unqual(type);
        switch (type.kind) {
        case 'pointer':
        case 'function':
        case 'nullptr':
        case 'lref':
        case 'rref':
            return 'ptr';
        case 'valist':
            return 'valist';
        case 'enum':
            return type.num;
        }
        return C.numKind(type);
    }
    X.kindOf = kindOf;

    function plainScalar(type) {
        type = unqual(type);
        if (type.kind === 'enum')
            return type.underlying;
        if (type.kind === 'nullptr')
            return X.pointerTo(types.void);
        return type;
    }

    Generator.prototype.error = function (node, message) {
        throw new T.CompileError(message, node ? node.line : 0, 0, node && node.file ? node.file : '');
    };

    Generator.prototype.literal = function (value, type) {
        var plain = plainScalar(type);
        if (plain.kind === 'pointer')
            value = X.wrapValue(value, plain);
        return C.Generator.prototype.literal.call(this, value, plain);
    };

    Generator.prototype.convertValue = function (js, from, to) {
        from = plainScalar(from);
        to = plainScalar(to);
        if (to.kind === 'void' || from === to)
            return js;
        return C.Generator.prototype.convert.call(this, js, from, to);
    };

    Generator.prototype.loadAt = function (type, address, checked) {
        var plain = plainScalar(type);
        if (X.isRef(plain))
            plain = X.pointerTo(types.void);
        return this.load(plain, address, checked);
    };

    Generator.prototype.storeAt = function (type, address, value, checked) {
        var plain = plainScalar(type);
        if (X.isRef(plain))
            plain = X.pointerTo(types.void);
        return this.store(plain, address, value, checked);
    };

    Generator.prototype.F = function (func) {
        return J.idx(J.id(func.async && this.fn.async ? '$G' : '$F'), J.num(this.session.functionIndex(func)));
    };

    Generator.prototype.callFunction = function (func, args) {
        var call = J.call(this.F(func), args);
        if (func.async && this.fn.async)
            return J.yield_(call, true);
        return call;
    };

    Generator.prototype.c = function (name) {
        return J.mem(J.id('$c'), name);
    };

    // A simple expression: the same value when used twice.
    function isStable(node) {
        return node.k === 'id' || node.k === 'num' || (node.k === 'bin' && node.op === '+' && node.left.k === 'id' &&
                                                       node.right.k === 'num');
    }

    // [setup, stable expression] for a value used more than once.
    Generator.prototype.stable = function (node) {
        if (isStable(node))
            return [null, node];
        var temporary = this.temp();
        return [J.assign(temporary, node), temporary];
    };

    function withSetup(setup, node) {
        return setup === null ? node : J.seq([setup, node]);
    }

    // --- Places of objects

    Generator.prototype.objectAddress = function (object) {
        if (object.storage === 'global' || object.storage === 'static') {
            if (object.address === undefined)
                this.session.allocateObject(object);
            return J.num(object.address);
        }
        if (object.indirect)
            return J.id(object.jsName);
        if (object.returnSlot)
            return J.id('$ret');
        if (object.frameOffset !== undefined)
            return object.frameOffset === 0 ? J.id('$fp') : J.bin('+', J.id('$fp'), J.num(object.frameOffset));
        return null;
    };

    // A local lives in the frame: classes, arrays, scalars whose address
    // is taken. A reference is a JavaScript variable with an address.
    Generator.prototype.placeObject = function (object) {
        if (object.placed)
            return;
        object.placed = true;
        var type = object.type;
        if (X.isRef(type) || object.indirect)
            return;
        var plain = unqual(type);
        if (object.returnSlot)
            return;
        if (object.addressTaken || X.isRecord(plain) || plain.kind === 'array')
            object.frameOffset = this.frameSlot(Math.max(plain.size, 1), plain.align);
    };

    // The address that a reference variable holds.
    Generator.prototype.referenceTarget = function (object) {
        var place = this.objectAddress(object);
        if (place === null)
            return J.id(object.jsName);
        return J.call(this.M('loadPointer'), [place]);
    };

    // --- Full-expressions and temporaries

    // Translates within a full-expression: temporaries made in callback are
    // destroyed after it; the result is { node, cleanups }.
    Generator.prototype.full = function (callback) {
        var saved = this.cleanups;
        this.cleanups = [];
        try {
            var node = callback.call(this);
            return { node: node, cleanups: this.cleanups };
        } finally {
            this.cleanups = saved;
        }
    };

    // The destructor calls of cleanups, newest first.
    Generator.prototype.destroyAll = function (cleanups) {
        var self = this;
        return cleanups.slice().reverse().map(function (item) {
            return self.destroy(item.address, item.type, item.dtor);
        });
    };

    // A value with its temporaries destroyed after it.
    Generator.prototype.fullValue = function (callback) {
        var result = this.full(callback);
        if (result.cleanups.length === 0)
            return result.node;
        var temporary = this.temp();
        return J.seq([J.assign(temporary, result.node)].concat(this.destroyAll(result.cleanups), [temporary]));
    };

    Generator.prototype.fullEffect = function (callback) {
        var result = this.full(callback);
        if (result.cleanups.length === 0)
            return result.node;
        return J.seq([result.node].concat(this.destroyAll(result.cleanups)));
    };

    // A branch evaluated conditionally destroys its own temporaries.
    Generator.prototype.branch = function (ir, callback) {
        if (!ir.conditional || this.cleanups === null)
            return callback.call(this);
        return this.fullValue(callback);
    };

    // The destruction of an object (an array: its elements, last first).
    Generator.prototype.destroy = function (address, type, dtor) {
        var plain = unqual(type);
        if (plain.kind === 'array') {
            var element = plain;
            var count = 1;
            while (element.kind === 'array') {
                count *= element.length;
                element = unqual(element.of);
            }
            return J.call(this.c('destroyArray'), [address, J.num(count), J.num(element.size),
                                                   this.functionTable(dtor)]);
        }
        return this.callFunction(dtor, [address]);
    };

    // The function itself (for runtime helpers that call it).
    Generator.prototype.functionTable = function (func) {
        return J.idx(J.id('$F'), J.num(this.session.functionIndex(func)));
    };

    // A temporary object in the frame, initialized from a prvalue.
    Generator.prototype.materialize = function (ir, init, dtor) {
        var type = unqual(ir.type);
        var offset = this.frameSlot(Math.max(type.size, 1), type.align);
        this.fn.usesFrame = true;
        var address = offset === 0 ? J.id('$fp') : J.bin('+', J.id('$fp'), J.num(offset));
        var initialize = this.init(address, init || ir.init || ir);
        if (dtor !== null && dtor !== undefined && this.cleanups !== null)
            this.cleanups.push({ address: address, type: type, dtor: dtor });
        else if (dtor !== null && dtor !== undefined)
            this.registerScopeObject(address, type, dtor);
        return isEmptyNode(initialize) ? address : J.seq([initialize, address]);
    };

    function isEmptyNode(node) {
        return node === null || node.k === 'undef';
    }

    // --- Values

    Generator.prototype.value = function (ir) {
        if (ir.value !== undefined && ir.k !== 'var' && X.isScalar(unqual(ir.type)))
            return this.literal(ir.value, ir.type);
        switch (ir.k) {
        case 'const':
            return this.literal(ir.value, ir.type);
        case 'var':
            return this.variableValue(ir);
        case 'field':
            if (ir.bitfield)
                return this.loadBitfield({ bitfield: ir.bitfield }, this.address(ir));
            return this.loadAt(ir.type, this.address(ir), !this.isDirect(ir));
        case 'deref':
            if (unqual(ir.type).kind === 'function')
                return this.value(ir.pointer);
            return this.loadAt(ir.type, this.value(ir.pointer), true);
        case 'string':
        case 'decay':
            return this.address(ir.k === 'decay' ? ir.operand : ir);
        case 'addr':
            return this.address(ir.operand);
        case 'fnaddr':
            return J.num(this.memory.functionAddress(this.session.functionIndex(ir.func)));
        case 'func':
            return J.num(this.memory.functionAddress(this.session.functionIndex(ir.func)));
        case 'this':
            return J.id('$this');
        case 'conv':
            if (ir.same)
                return this.value(ir.operand);
            if (unqual(ir.to).kind === 'void')
                return this.effect(ir.operand);
            return this.convertValue(this.value(ir.operand), ir.from, ir.to);
        case 'ptradj':
            return this.pointerAdjust(ir);
        case 'glvadj':
            return this.loadAt(ir.type, this.address(ir), true);
        case 'unary':
            return ops.unary(kindOf(ir.type), ir.op === '~' ? '^' : ir.op, this.value(ir.operand), this.opsContext());
        case 'not':
            return J.cond(this.test(ir.operand), J.num(0), J.num(1));
        case 'binary':
            return this.binaryValue(ir);
        case 'compare':
        case 'logical':
            return J.cond(this.test(ir), J.num(1), J.num(0));
        case 'ptrarith':
            return this.pointerArithmetic(ir);
        case 'ptrdiff': {
            var difference = J.bin('-', this.value(ir.left), this.value(ir.right));
            return ir.elemSize === 1 ? difference : J.bin('|', J.bin('/', difference, J.num(ir.elemSize)), J.num(0));
        }
        case 'assign':
            return this.assignValue(ir);
        case 'compound':
            return this.compoundValue(ir);
        case 'incdec':
            return this.incrementValue(ir);
        case 'cond':
            return J.cond(this.test(ir.cond), this.branch(ir.then, function () { return this.value(ir.then); }),
                          this.branch(ir.otherwise, function () { return this.value(ir.otherwise); }));
        case 'comma':
            return this.commaValue(ir, 'value');
        case 'call':
        case 'icall':
            if (ir.cat !== 'prvalue')
                return this.loadAt(ir.type, this.callExpression(ir, null), true);
            return this.callExpression(ir, null);
        case 'new':
            return this.newExpression(ir);
        case 'delete':
            return this.deleteExpression(ir);
        case 'throw':
            return this.throwExpression(ir);
        case 'typeid':
            return this.typeidAddress(ir);
        case 'dyncast':
            return this.dynamicCastValue(ir);
        case 'vaarg':
            return J.call(this.c('vaArg'), [this.value(ir.list), J.str(kindOf(ir.type))]);
        case 'vastart':
            return this.vaStore(ir.list, J.call(this.c('vaStart'), [J.id('$va')]));
        case 'vaend':
            return J.undef();
        case 'vacopy':
            return this.vaStore(ir.list, J.call(this.c('vaCopy'), [this.value(ir.source)]));
        case 'vlasize':
            return J.call(J.path('Math.max'), [J.num(0), this.vlaBytes(ir.arrayType)]);
        case 'temp':
        case 'argument':
            if (X.isScalar(unqual(ir.type)))
                return this.value(ir.init);
            return this.address(ir);
        case 'seq':
            return J.seq(ir.before.map(this.effect, this).concat([this.value(ir.value)]));
        case 'dtorcall': {
            var cls = unqual(ir.cls);
            if (cls.dtor === null || (cls.dtor.implicit && cls.dtor.trivial))
                return this.effect(ir.object);
            var objectAddress = this.address(ir.object);
            if (cls.dtor.isVirtual)
                return this.virtualCall(cls.dtor, objectAddress, []);
            return this.callFunction(cls.dtor, [objectAddress]);
        }
        case 'probe':
            return J.id(ir.jsName);
        }
        if (X.isRecord(unqual(ir.type)) || unqual(ir.type).kind === 'array')
            return this.address(ir);
        this.error(ir, 'cannot translate expression ' + ir.k);
    };

    Generator.prototype.vaStore = function (list, value) {
        if (list.k === 'var' && this.objectAddress(list.obj) === null)
            return J.assign(J.id(list.obj.jsName), value);
        this.error(list, 'va_list in memory is not supported');
    };

    Generator.prototype.vlaBytes = function (type) {
        if (!type.vla)
            return J.num(type.size);
        return J.bin('*', this.convertValue(this.value(type.vla), type.vla.type, types.long), this.vlaBytes(type.of));
    };

    // Access to a variable of the function itself needs no address check.
    Generator.prototype.isDirect = function (ir) {
        while (ir.k === 'field' && !ir.ref)
            ir = ir.object;
        return ir.k === 'var' && !X.isRef(ir.obj.type) && !ir.obj.indirect;
    };

    Generator.prototype.variableValue = function (ir) {
        var object = ir.obj;
        if (ir.value !== undefined && X.isScalar(unqual(ir.type)))
            return this.literal(ir.value, ir.type);
        if (X.isRef(object.type))
            return this.loadAt(ir.type, this.referenceTarget(object), true);
        var place = this.objectAddress(object);
        if (place === null)
            return J.id(object.jsName);
        return this.loadAt(ir.type, place, false);
    };

    Generator.prototype.pointerAdjust = function (ir) {
        var pointer = this.stable(this.value(ir.operand));
        var adjusted = J.bin(ir.offset < 0 ? '-' : '+', pointer[1], J.num(Math.abs(ir.offset)));
        if (!ir.nullCheck)
            return withSetup(pointer[0], adjusted);
        return withSetup(pointer[0], J.cond(J.bin('===', pointer[1], J.num(0)), J.num(0), adjusted));
    };

    Generator.prototype.binaryValue = function (ir) {
        var kind = kindOf(ir.opType);
        var left = this.value(ir.left), right = this.value(ir.right);
        if (ir.op === '<<' || ir.op === '>>') {
            if (ir.right.value === undefined)
                right = J.bin('&', this.convertValue(right, ir.right.type, types.int),
                              J.num(unqual(ir.opType).size * 8 - 1));
            else
                right = J.num(big.toFloat(ir.right.value) & (unqual(ir.opType).size * 8 - 1));
        }
        return ops.binary(kind, ir.op, left, right, this.opsContext());
    };

    // A pointer plus an integer (the C rules for wide indices).
    Generator.prototype.pointerArithmetic = function (ir) {
        var pointer = this.value(ir.pointer);
        var index = ir.index;
        var size = ir.elemSize;
        if (index.value !== undefined) {
            var constant = C.wrapConstant(index.value, types.long);
            var offset = big.toFloat(constant) * size;
            if (ir.op === '-')
                offset = -offset;
            if (Math.abs(offset) >= 2147483648)
                return J.seq([pointer, J.num(4294967295)]);
            return offset === 0 ? pointer : J.bin('+', pointer, J.num(offset));
        }
        var kind = kindOf(index.type);
        var indexValue = this.value(index);
        if (kind === 'i64' || kind === 'u64') {
            var indexTemporary = this.temp();
            indexValue = J.cond(J.bin('===', J.un('typeof', J.assign(indexTemporary, indexValue)), J.str('number')),
                                indexTemporary, J.call(J.mem(J.mem(J.id('$T'), 'i64'), 'toFloat'), [indexTemporary]));
            var temporary = this.temp();
            var scaledIndex = size === 1 ? indexValue : J.bin('*', indexValue, J.num(size));
            var sum = J.assign(temporary, J.bin(ir.op, pointer, scaledIndex));
            return J.cond(J.and(J.bin('>=', sum, J.num(0)), J.bin('<', temporary, J.num(4294967296))), temporary,
                          J.num(4294967295));
        }
        if (kind !== 'i32' && kind !== 'u32' && kind !== 'i16' && kind !== 'u16' && kind !== 'i8' && kind !== 'u8')
            indexValue = this.convertValue(indexValue, index.type, types.int);
        var scaled = size === 1 ? indexValue : J.bin('*', indexValue, J.num(size));
        return J.bin(ir.op, pointer, scaled);
    };

    Generator.prototype.commaValue = function (ir, mode) {
        var parts = [];
        for (var index = 0; index < ir.list.length - 1; ++index)
            parts.push(this.effect(ir.list[index]));
        var last = ir.list[ir.list.length - 1];
        if (last === undefined)
            return J.undef();
        parts.push(mode === 'value' ? this.value(last) : (mode === 'address' ? this.address(last) : this.effect(last)));
        return J.seq(parts);
    };

    // --- Conditions

    // A boolean condition as a JavaScript boolean.
    Generator.prototype.test = function (ir) {
        if (ir.value !== undefined && X.isScalar(unqual(ir.type)))
            return J.bool(!X.isZeroValue(ir.value));
        switch (ir.k) {
        case 'logical':
            return J.bin(ir.op, this.test(ir.left), this.branch(ir.right, function () { return this.test(ir.right); }));
        case 'not':
            return J.not(this.test(ir.operand));
        case 'compare':
            return this.comparisonTest(ir);
        case 'conv':
            if (X.isBool(ir.to) && !ir.same) {
                var from = plainScalar(ir.from);
                var kind = kindOf(from);
                var value = this.value(ir.operand);
                if (kind === 'f64' || kind === 'f32')
                    return J.and(J.bin('!==', value, J.num(0)), J.bin('===', value, value)) === null ? null
                        : J.bin('!==', J.bin('|', J.bin('!==', value, J.num(0)), J.num(0)), J.num(0));
                return J.bin('!==', value, J.num(0));
            }
            break;
        }
        return J.bin('!==', this.value(ir), J.num(0));
    };

    Generator.prototype.comparisonTest = function (ir) {
        var kind = kindOf(ir.opType);
        var left = this.value(ir.left), right = this.value(ir.right);
        if (kind === 'ptr' || kind === 'f64' || kind === 'f32' || kind === 'i32' || kind === 'u32' || kind === 'i8' ||
            kind === 'u8' || kind === 'i16' || kind === 'u16') {
            var op = ir.op === '==' ? '===' : (ir.op === '!=' ? '!==' : ir.op);
            return J.bin(op, left, right);
        }
        return ops.binary(kind, ir.op, left, right, this.opsContext());
    };

    // --- Assignment

    // A place to write: { setup, get, set(value) }.
    Generator.prototype.place = function (ir) {
        var self = this;
        var type = ir.type;
        if (ir.k === 'var' && !X.isRef(ir.obj.type)) {
            var where = this.objectAddress(ir.obj);
            if (where === null) {
                var name = J.id(ir.obj.jsName);
                return { setup: [], get: name, set: function (value) { return J.assign(name, value); }, address: null };
            }
            return { setup: [], get: this.loadAt(type, where, false),
                     set: function (value) { return self.storeAt(type, where, value, false); }, address: where };
        }
        var address = this.temp();
        var setup = J.assign(address, this.address(ir));
        if (ir.bitfield) {
            return { setup: [setup], get: this.loadBitfield({ bitfield: ir.bitfield }, address),
                     set: function (value) { return self.storeBitfield({ bitfield: ir.bitfield }, address, value); },
                     address: address };
        }
        var checked = !this.isDirect(ir);
        return { setup: [setup], get: this.loadAt(type, address, checked),
                 set: function (value) { return self.storeAt(type, address, value, checked); }, address: address };
    };

    function seqWith(setup, node) {
        return setup.length === 0 ? node : J.seq(setup.concat([node]));
    }

    Generator.prototype.assignValue = function (ir) {
        var place = this.place(ir.target);
        return seqWith(place.setup, place.set(this.value(ir.source)));
    };

    Generator.prototype.compoundValue = function (ir) {
        var place = this.place(ir.target);
        var target = ir.target.type;
        var result;
        if (ir.pointer) {
            result = this.pointerStep(place.get, ir.source, ir.elemSize, ir.op);
        } else {
            var type = ir.opType;
            var right = this.value(ir.source);
            if (ir.op === '<<' || ir.op === '>>')
                right = ir.source.value === undefined ? J.bin('&', this.convertValue(right, ir.source.type, types.int),
                                                              J.num(unqual(type).size * 8 - 1)) : right;
            result = this.convertValue(ops.binary(kindOf(type), ir.op, this.convertValue(place.get, target, type),
                                                  right,
                                                  this.opsContext()), type, target);
        }
        return seqWith(place.setup, place.set(result));
    };

    Generator.prototype.pointerStep = function (pointer, indexIr, size, op) {
        if (indexIr.value !== undefined) {
            var offset = big.toFloat(C.wrapConstant(indexIr.value, types.long)) * size;
            return J.bin(op, pointer, J.num(offset));
        }
        var index = this.convertValue(this.value(indexIr), indexIr.type, types.long);
        if (kindOf(types.long) === 'i64')
            index = J.call(J.mem(J.mem(J.id('$T'), 'i64'), 'toFloat'), [index]);
        return J.bin(op, pointer, size === 1 ? index : J.bin('*', index, J.num(size)));
    };

    Generator.prototype.incrementValue = function (ir) {
        var place = this.place(ir.target);
        var type = unqual(ir.target.type);
        var plus = ir.op === '++' ? '+' : '-';
        var self = this;
        function step(from) {
            if (type.kind === 'pointer')
                return J.bin(plus, from, J.num(unqual(type.to).kind === 'void' ? 1 : unqual(type.to).size));
            var promoted = X.isIntegral(type) || type.kind === 'enum' ? X.promote(type) : type;
            return self.convertValue(ops.binary(kindOf(promoted), plus, self.convertValue(from, type, promoted),
                                                self.literal(1, promoted), self.opsContext()), promoted, type);
        }
        if (ir.prefix)
            return seqWith(place.setup, place.set(step(place.get)));
        var old = this.temp();
        return seqWith(place.setup, J.seq([J.assign(old, place.get), place.set(step(old)), old]));
    };

    // --- Effects

    Generator.prototype.effect = function (ir) {
        switch (ir.k) {
        case 'incdec':
            if (!ir.prefix)
                return this.incrementValue({ op: ir.op, prefix: true, target: ir.target, type: ir.type });
            break;
        case 'comma':
            return this.commaValue(ir, 'effect');
        case 'conv':
            if (unqual(ir.to).kind === 'void')
                return this.effect(ir.operand);
            break;
        case 'cond':
            if (unqual(ir.type).kind === 'void' || X.isRecord(unqual(ir.type)))
                return J.cond(this.test(ir.cond), this.branch(ir.then, function () { return this.effect(ir.then); }),
                              this.branch(ir.otherwise, function () { return this.effect(ir.otherwise); }));
            break;
        case 'assignobj':
            return this.assignObject(ir);
        case 'const':
            return J.undef();
        case 'temp':
            return this.address(ir);
        }
        if (X.isRecord(unqual(ir.type)) && ir.cat === 'prvalue')
            return this.materialize(ir, ir, null);
        if (X.isRecord(unqual(ir.type)) || unqual(ir.type).kind === 'array')
            return this.address(ir);
        if (unqual(ir.type).kind === 'void')
            return this.voidValue(ir);
        return this.value(ir);
    };

    Generator.prototype.voidValue = function (ir) {
        switch (ir.k) {
        case 'call':
        case 'icall':
            return this.callExpression(ir, null);
        case 'throw':
            return this.throwExpression(ir);
        case 'delete':
            return this.deleteExpression(ir);
        case 'dtorcall':
        case 'vastart':
        case 'vaend':
        case 'vacopy':
            return this.value(ir);
        case 'comma':
            return this.commaValue(ir, 'effect');
        case 'pseudodtor':
            return this.effect(ir.object);
        }
        return this.value(ir);
    };

    // target = source for objects copied as bytes (anonymous unions, trivial arrays and classes); a base
    // subobject without its tail padding.
    Generator.prototype.assignObject = function (ir) {
        var size = assignedBytes(unqual(ir.type));
        if (size === 0)
            return J.seq([this.address(ir.target), this.address(ir.source)]);
        return J.call(this.M('copy'), [this.address(ir.target), this.address(ir.source), J.num(size)]);
    };

    // An empty class has no bytes to assign: its byte may be shared with a
    // member (the deleter of unique_ptr).
    function assignedBytes(type) {
        if (type.isClass && X.isEmptyClass(type))
            return 0;
        return type.isClass && type.dsize !== undefined ? type.dsize : type.size;
    }

    // --- Addresses

    Generator.prototype.address = function (ir) {
        switch (ir.k) {
        case 'var': {
            var object = ir.obj;
            if (X.isRef(object.type))
                return this.referenceTarget(object);
            var place = this.objectAddress(object);
            if (place === null)
                this.error(ir, "internal error: '" + object.name + "' is not in memory");
            return place;
        }
        case 'string':
            return J.num(this.session.literal(ir.bytes, ir.wide));
        case 'assignobj': {
            var assigned = this.temp();
            var type = unqual(ir.type);
            return J.seq([J.assign(assigned, this.address(ir.target)),
                          J.call(this.M('copy'), [assigned, this.address(ir.source), J.num(assignedBytes(type))]),
                          assigned]);
        }
        case 'field': {
            var base = this.address(ir.object);
            var at = ir.field.offset === 0 ? base : J.bin('+', base, J.num(ir.field.offset));
            if (ir.ref)
                return J.call(this.M('loadPointer'), [at]);
            return at;
        }
        case 'deref':
            if (unqual(ir.pointer.type).kind === 'pointer' && unqual(ir.type).isClass && !this.isTrusted(ir.pointer))
                return J.call(this.M('check'), [this.value(ir.pointer), J.num(Math.max(1, unqual(ir.type).size))]);
            return this.value(ir.pointer);
        case 'glvadj': {
            var inner = this.address(ir.operand);
            if (ir.offset === 0)
                return inner;
            return J.bin(ir.offset < 0 ? '-' : '+', inner, J.num(Math.abs(ir.offset)));
        }
        case 'temp':
        case 'argument':
            return this.materialize(ir, ir.init, ir.dtor);
        case 'call':
        case 'icall':
            if (ir.cat !== 'prvalue')
                return this.callExpression(ir, null);
            return this.materialize(ir, ir, null);
        case 'assign':
        case 'compound':
        case 'incdec': {
            if (ir.k === 'incdec' && !ir.prefix)
                break;
            var address = this.temp();
            return J.seq([J.assign(address, this.address(ir.target)), this.assignAt(ir, address), address]);
        }
        case 'cond':
            return J.cond(this.test(ir.cond), this.branch(ir.then, function () { return this.address(ir.then); }),
                          this.branch(ir.otherwise, function () { return this.address(ir.otherwise); }));
        case 'comma':
            return this.commaValue(ir, 'address');
        case 'func':
        case 'fnaddr':
            return J.num(this.memory.functionAddress(this.session.functionIndex(ir.func)));
        case 'probe':
            return J.id(ir.jsName);
        case 'this':
            return J.id('$this');
        case 'conv':
            if (ir.same)
                return this.address(ir.operand);
            break;
        case 'seq':
            return J.seq(ir.before.map(this.effect, this).concat([this.address(ir.value)]));
        case 'typeid':
            return this.typeidAddress(ir);
        case 'dyncast':
            return this.dynamicCastValue(ir);
        }
        if (ir.cat === 'prvalue' && (X.isRecord(unqual(ir.type)) || unqual(ir.type).kind === 'array'))
            return this.materialize(ir, ir, null);
        if (ir.cat === 'prvalue') {
            // A scalar prvalue where an object is needed: a temporary.
            var scalarType = unqual(ir.type);
            var offset = this.frameSlot(Math.max(scalarType.size, 1), scalarType.align);
            var slot = J.bin('+', J.id('$fp'), J.num(offset));
            return J.seq([this.storeAt(scalarType, slot, this.value(ir), false), slot]);
        }
        this.error(ir, 'expression is not addressable (' + ir.k + ')');
    };

    // Pointers from new and this are valid: no check of the object.
    Generator.prototype.isTrusted = function (pointer) {
        return pointer.k === 'this';
    };

    Generator.prototype.assignAt = function (ir, address) {
        var type = ir.target.type;
        var self = this;
        var place = { setup: [], get: this.loadAt(type, address, true),
                      set: function (value) { return self.storeAt(type, address, value, true); } };
        if (ir.target.bitfield)
            place = { setup: [], get: this.loadBitfield({ bitfield: ir.target.bitfield }, address),
                      set: function (value) {
                          return self.storeBitfield({ bitfield: ir.target.bitfield }, address, value);
                      } };
        if (ir.k === 'assign')
            return place.set(this.value(ir.source));
        if (ir.k === 'compound') {
            if (ir.pointer)
                return place.set(this.pointerStep(place.get, ir.source, ir.elemSize, ir.op));
            var opType = ir.opType;
            var right = this.value(ir.source);
            return place.set(this.convertValue(ops.binary(kindOf(opType), ir.op,
                                                          this.convertValue(place.get, type, opType),
                                                          right, this.opsContext()), opType, type));
        }
        var plain = unqual(type);
        var plus = ir.op === '++' ? '+' : '-';
        if (plain.kind === 'pointer')
            return place.set(J.bin(plus, place.get, J.num(unqual(plain.to).size)));
        var promoted = X.isIntegral(plain) || plain.kind === 'enum' ? X.promote(plain) : plain;
        return place.set(this.convertValue(ops.binary(kindOf(promoted), plus,
                                                      this.convertValue(place.get, plain, promoted),
                                                      this.literal(1, promoted), this.opsContext()), promoted, plain));
    };

    // --- Objects built at an address

    // An expression that fills the memory at dest (a stable expression)
    // with the value of ir.
    Generator.prototype.init = function (dest, ir) {
        var type = unqual(ir.type);
        switch (ir.k) {
        case 'construct': {
            var args = this.callArguments(ir.ctor, ir.args);
            var construct = this.callFunction(ir.ctor, [dest].concat(args));
            if (ir.zeroFirst)
                return J.seq([J.call(this.M('fill'), [dest, J.num(0), J.num(type.size)]), construct]);
            return construct;
        }
        case 'copy':
            return J.call(this.M('copy'), [dest, this.address(ir.source), J.num(type.size)]);
        case 'arraycopy':
            return J.call(this.M('copy'), [dest, this.address(ir.source), J.num(type.size)]);
        case 'default':
            return J.undef();
        case 'zero':
            return J.call(this.M('fill'), [dest, J.num(0), J.num(type.size)]);
        case 'aggregate':
            return this.aggregateInit(dest, ir);
        case 'arrayinit':
            return this.arrayInit(dest, ir);
        case 'arrayeach':
            return this.arrayEach(dest, ir);
        case 'initlist':
            return this.initializerList(dest, ir);
        case 'call':
        case 'icall':
            if (ir.cat === 'prvalue' && X.isRecord(type))
                return this.callExpression(ir, dest);
            break;
        case 'cond':
            if (ir.cat === 'prvalue')
                return J.cond(this.test(ir.cond),
                              this.branch(ir.then, function () { return this.init(dest, ir.then); }),
                              this.branch(ir.otherwise, function () { return this.init(dest, ir.otherwise); }));
            break;
        case 'comma': {
            var parts = [];
            for (var index = 0; index < ir.list.length - 1; ++index)
                parts.push(this.effect(ir.list[index]));
            parts.push(this.init(dest, ir.list[ir.list.length - 1]));
            return J.seq(parts);
        }
        case 'temp':
        case 'argument':
            if (ir.cat !== 'prvalue')
                return this.init(dest, ir.init);
            break;
        case 'seq':
            return J.seq(ir.before.map(this.effect, this).concat([this.init(dest, ir.value)]));
        }
        if (X.isRecord(type) || type.kind === 'array') {
            // A glvalue of the class: a byte copy (trivially copyable).
            return J.call(this.M('copy'), [dest, this.address(ir), J.num(type.size)]);
        }
        return this.storeAt(type, dest, this.value(ir), false);
    };

    Generator.prototype.offsetAddress = function (base, offset) {
        return offset === 0 ? base : J.bin('+', base, J.num(offset));
    };

    // A part of an object: a reference member gets the address, a scalar
    // the value, an object its initialization.
    Generator.prototype.initPart = function (address, type, ir) {
        if (X.isRef(type))
            return J.call(this.M('storePointer'), [address, this.address(ir)]);
        if (ir === null || ir === undefined)
            return J.undef();
        var plain = unqual(type);
        if (X.isRecord(plain) || plain.kind === 'array')
            return this.init(address, ir);
        if (ir.k === 'default')
            return J.undef();
        return this.storeAt(plain, address, this.value(ir), false);
    };

    Generator.prototype.aggregateInit = function (dest, ir) {
        var type = unqual(ir.type);
        var self = this;
        var stable = this.stable(dest);
        var steps = [];
        if (stable[0] !== null)
            steps.push(stable[0]);
        var base = stable[1];
        steps.push(J.call(this.M('fill'), [base, J.num(0), J.num(type.size)]));
        ir.items.forEach(function (item) {
            var offset = item.offset !== null && item.offset !== undefined ? item.offset : item.field.offset;
            if (item.field !== undefined && item.field !== null && item.field.bits !== null &&
                item.field.bits !== undefined) {
                steps.push(self.storeBitfield({ bitfield: item.field }, self.offsetAddress(base, item.field.offset),
                                              self.value(item.init)));
                return;
            }
            var part = self.initPart(self.offsetAddress(base, offset), item.type, item.init);
            if (!isEmptyNode(part))
                steps.push(part);
        });
        if (type.polymorphic)
            steps.push(this.setVtables(type, base));
        return J.seq(steps);
    };

    Generator.prototype.arrayInit = function (dest, ir) {
        var type = unqual(ir.type);
        var element = unqual(type.of);
        if (ir.string !== undefined) {
            var bytes = ir.string.slice();
            while (bytes.length < type.length)
                bytes.push(0);
            bytes = bytes.slice(0, type.length);
            var source = this.session.literal(bytes, ir.wide, true);
            return J.call(this.M('copy'), [dest, J.num(source), J.num(type.size)]);
        }
        var stable = this.stable(dest);
        var steps = [];
        if (stable[0] !== null)
            steps.push(stable[0]);
        var base = stable[1];
        var self = this;
        if (ir.fill === null || ir.items.length < type.length && X.isScalar(element))
            steps.push(J.call(this.M('fill'), [base, J.num(0), J.num(type.size)]));
        ir.items.forEach(function (item, index) {
            var part = self.initPart(self.offsetAddress(base, index * element.size), element, item);
            if (!isEmptyNode(part))
                steps.push(part);
        });
        if (ir.fill !== null && ir.items.length < type.length) {
            var probe = this.temp();
            var fill = this.init(probe, ir.fill);
            if (!isEmptyNode(fill))
                steps.push(J.call(this.c('each'), [J.bin('+', base, J.num(ir.items.length * element.size)),
                                                   J.num(type.length - ir.items.length), J.num(element.size),
                                                   J.fn(null, [probe.name], [J.ret(fill)])]));
        }
        return J.seq(steps);
    };

    // An array of classes copied element by element.
    Generator.prototype.arrayEach = function (dest, ir) {
        var type = unqual(ir.type);
        var element = unqual(type.of);
        var target = this.temp();
        var probeName = this.temp();
        ir.probe.jsName = probeName.name;
        var body = this.init(target, ir.elemInit);
        return J.call(this.c('eachPair'), [dest, this.address(ir.source), J.num(type.length), J.num(element.size),
                                           J.fn(null, [target.name, probeName.name], [J.ret(body)])]);
    };

    // std::initializer_list: the array in the frame, then { pointer, size }.
    Generator.prototype.initializerList = function (dest, ir) {
        var arrayType = unqual(ir.array.type);
        var offset = this.frameSlot(Math.max(arrayType.size, 1), arrayType.align);
        var array = J.bin('+', J.id('$fp'), J.num(offset));
        var stable = this.stable(dest);
        var steps = [];
        if (stable[0] !== null)
            steps.push(stable[0]);
        steps.push(this.arrayInit(array, ir.array));
        steps.push(J.call(this.M('storePointer'), [stable[1], array]));
        steps.push(J.call(this.M('store64'), [J.bin('+', stable[1], J.num(8)), J.num(ir.length)]));
        return J.seq(steps);
    };

    // The vtable pointers of an object of a polymorphic class.
    Generator.prototype.setVtables = function (cls, address) {
        var self = this;
        var stable = this.stable(address);
        var steps = [];
        if (stable[0] !== null)
            steps.push(stable[0]);
        X.vtableLayout(cls).forEach(function (entry) {
            var vtable = self.session.vtableIndex(cls, entry.offset, self);
            steps.push(J.call(self.M('storePointer'), [self.offsetAddress(stable[1], entry.offset), J.num(vtable)]));
        });
        return J.seq(steps);
    };

    // --- Calls

    // The arguments of a call as the function takes them.
    Generator.prototype.callArguments = function (func, args) {
        var self = this;
        var params = func.type.params;
        var result = [];
        var extras = { v: [], t: [] };
        args.forEach(function (arg, index) {
            if (index < params.length) {
                result.push(self.argument(params[index], arg));
                return;
            }
            extras.v.push(self.value(arg));
            var original = arg.original || arg.type;
            extras.t.push(J.str(C.argumentTag(cTypeOf(unqual(arg.type)), cTypeOf(unqual(original)))));
        });
        if (func.type.variadic)
            result.push(J.obj([['v', J.arr(extras.v)], ['t', J.arr(extras.t)]]));
        return result;
    };

    // A C++ type as the C helpers understand it (js_value, char pointers).
    function cTypeOf(type) {
        if (type.kind === 'enum')
            return type.underlying;
        if (type.kind === 'pointer') {
            var to = unqual(type.to);
            if (to.isClass && to.tag === 'js_object')
                return { kind: 'pointer', to: { kind: 'struct', tag: 'js_object' }, size: 8, align: 8 };
            return { kind: 'pointer', to: to.kind === 'enum' ? to.underlying : to, size: 8, align: 8 };
        }
        if (type === types.bool)
            return C.types.bool;
        return type;
    }
    X.cTypeOf = cTypeOf;

    Generator.prototype.argument = function (param, arg) {
        if (X.isRef(param))
            return this.address(arg);
        var plain = unqual(param);
        if (X.isRecord(plain))
            return this.address(arg);
        return this.value(arg);
    };

    // A call; dest - the place of a class result (null: a temporary).
    Generator.prototype.callExpression = function (ir, dest) {
        var returns = ir.k === 'call' ? ir.func.type.returns : ir.fnType.returns;
        var resultType = unqual(returns);
        var args = [];
        var resultAddress = null;
        if (!X.isRef(returns) && X.isRecord(resultType)) {
            if (dest === null) {
                var offset = this.frameSlot(Math.max(resultType.size, 1), resultType.align);
                resultAddress = J.bin('+', J.id('$fp'), J.num(offset));
            } else {
                resultAddress = dest;
            }
            args.push(resultAddress);
        }
        var call;
        if (ir.k === 'icall') {
            var self = this;
            var fnArgs = ir.args.map(function (arg, index) {
                return index < ir.fnType.params.length ? self.argument(ir.fnType.params[index], arg) : self.value(arg);
            });
            if (ir.fnType.variadic) {
                var extra = ir.args.slice(ir.fnType.params.length);
                fnArgs = fnArgs.slice(0, ir.fnType.params.length);
                fnArgs.push(J.obj([['v', J.arr(extra.map(this.value, this))],
                                   ['t', J.arr(extra.map(function (arg) {
                                       return J.str(C.argumentTag(cTypeOf(unqual(arg.type)),
                                                                  cTypeOf(unqual(arg.type))));
                                   }))]]));
            }
            var generator = this.fn.async && this.session.asyncPossible;
            var callee = J.call(this.M(generator ? 'callableAsync' : 'callable'), [this.value(ir.callee)]);
            call = J.call(callee, args.concat(fnArgs));
            if (generator)
                call = J.yield_(call, true);
        } else {
            var func = ir.func;
            if (func.lambdaInvoker !== undefined)
                return J.seq([this.effect(ir.object),
                              J.num(this.memory.functionAddress(this.session.functionIndex(func.lambdaInvoker)))]);
            var callArgs = this.callArguments(func, ir.args);
            if (ir.object !== null && ir.object !== undefined) {
                var object = this.address(ir.object);
                if (ir.virtual && func.isVirtual) {
                    call = this.virtualCall(func, object, args.concat(callArgs));
                } else {
                    call = this.callFunction(func, args.concat([object], callArgs));
                }
            } else {
                call = this.callFunction(func, args.concat(callArgs));
            }
        }
        if (resultAddress !== null && dest === null) {
            // The temporary result: destroyed at the end of the full-expression.
            var dtor = resultType.dtor;
            if (dtor !== null && dtor !== undefined && !(dtor.implicit && dtor.trivial) && this.cleanups !== null)
                this.cleanups.push({ address: resultAddress, type: resultType, dtor: dtor });
            return J.seq([call, resultAddress]);
        }
        return call;
    };

    // A virtual call: the function from the vtable of the object.
    Generator.prototype.virtualCall = function (func, object, args) {
        var root = func.root || func;
        var owner = func.owner;
        var slot = owner.slots.indexOf(root);
        if (slot < 0)
            this.error(null, "internal error: no vtable slot for '" + X.functionSignature(func) + "'");
        // The object goes first among the arguments (after a struct result).
        var stable = this.stable(object);
        var table = J.idx(J.id('$V'), J.call(this.M('loadPointer'), [stable[1]]));
        var index = J.idx(table, J.num(slot));
        var generator = this.fn.async && this.session.asyncPossible;
        var callee = J.idx(J.id(generator ? '$G' : '$F'), index);
        var structResult = args.length > 0 && X.isRecord(unqual(func.type.returns)) && !X.isRef(func.type.returns);
        var callArgs = structResult ? [args[0], stable[1]].concat(args.slice(1)) : [stable[1]].concat(args);
        var call = J.call(callee, callArgs);
        if (generator)
            call = J.yield_(call, true);
        return withSetup(stable[0], call);
    };
})(globalThis);
