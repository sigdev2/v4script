// Pascal: expressions - places (variables, fields, elements), type
// conversions, operations. Integers: + - * div mod give Int64 (as FPC on
// x86_64), and/or/xor/not/shl/shr keep the type of the operand; the
// arithmetic uses JavaScript numbers while the range is exact, the hybrid
// T.i64 otherwise.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Pascal = T.pascal;
    var Compiler = Pascal.Compiler;
    if (Compiler.prototype.compileExpr)
        return;

    var J = T.J;
    var t = Pascal.t;
    var types = Pascal.types;
    var big = T.big;
    var Value = Pascal.Value;
    var ops = T.ops;
    var MAX_SAFE = types.MAX_SAFE;

    // --- Places

    function Ref(type) {
        this.type = type;
    }
    Pascal.Ref = Ref;
    Ref.prototype.readOnly = false;
    Ref.prototype.pair = function () {
        return null;
    };
    Ref.prototype.stable = function () {
        return { setup: [], ref: this };
    };

    // A property of an object: $V.x, record.field, array[index], box.v.
    function PropRef(type, object, key) {
        Ref.call(this, type);
        this.object = object;
        this.key = key;
    }
    PropRef.prototype = Object.create(Ref.prototype);
    Pascal.PropRef = PropRef;
    function access(object, key) {
        if (key.k === 'str' && /^[A-Za-z_$][\w$]*$/.test(key.value))
            return J.mem(object, key.value);
        return J.idx(object, key);
    }
    PropRef.prototype.get = function () {
        return access(this.object, this.key);
    };
    PropRef.prototype.set = function (value) {
        return J.assign(access(this.object, this.key), value);
    };
    PropRef.prototype.pair = function () {
        return [this.object, this.key];
    };
    PropRef.prototype.address = function (compiler) {
        if (types.isAggregate(this.type))
            return this.get();
        return compiler.rt('ref', [this.object, this.key]);
    };
    PropRef.prototype.stable = function (compiler) {
        var setup = [];
        var object = this.object, key = this.key;
        if (!J.isSimple(object)) {
            var objectName = compiler.temp();
            setup.push(J.assign(J.id(objectName), object));
            object = J.id(objectName);
        }
        if (!J.isSimple(key)) {
            var keyName = compiler.temp();
            setup.push(J.assign(J.id(keyName), key));
            key = J.id(keyName);
        }
        var ref = new PropRef(this.type, object, key);
        ref.readOnly = this.readOnly;
        ref.loopVariable = this.loopVariable;
        return { setup: setup, ref: ref };
    };

    // A local variable of a function (it may end up in a box).
    function LocalRef(compiler, symbol) {
        Ref.call(this, symbol.type);
        this.compiler = compiler;
        this.symbol = symbol;
        this.readOnly = !!symbol.readOnly;
        this.loopVariable = !!symbol.loopVariable;
    }
    LocalRef.prototype = Object.create(Ref.prototype);
    Pascal.LocalRef = LocalRef;
    LocalRef.prototype.get = function () {
        return this.compiler.localNode(this.symbol);
    };
    LocalRef.prototype.set = function (value) {
        return J.assign(this.compiler.localNode(this.symbol), value);
    };
    LocalRef.prototype.pair = function () {
        if (types.isAggregate(this.type))
            return null;
        this.symbol.boxed = true;
        return [J.id(this.symbol.js), J.str('v')];
    };
    LocalRef.prototype.address = function () {
        if (types.isAggregate(this.type))
            return this.get();
        this.symbol.boxed = true;
        return J.id(this.symbol.js);
    };

    // A character of a string s[i]: reading gives the code, writing a new string.
    function CharRef(compiler, base, index, type) {
        Ref.call(this, type);
        this.compiler = compiler;
        this.base = base;
        this.index = index;
    }
    CharRef.prototype = Object.create(Ref.prototype);
    CharRef.prototype.get = function () {
        return this.compiler.rt('sc', [this.base.get(), this.index]);
    };
    CharRef.prototype.set = function (value) {
        return this.base.set(this.compiler.rt('ssc', [this.base.get(), this.index, value]));
    };
    CharRef.prototype.stable = function (compiler) {
        var base = this.base.stable(compiler);
        var setup = base.setup.slice();
        var index = this.index;
        if (!J.isSimple(index)) {
            var name = compiler.temp();
            setup.push(J.assign(J.id(name), index));
            index = J.id(name);
        }
        return { setup: setup, ref: new CharRef(compiler, base.ref, index, this.type) };
    };
    CharRef.prototype.address = function (compiler) {
        compiler.error('Can\'t take the address of a string element', null);
    };

    // The length of a ShortString: s[0].
    function ShortLengthRef(compiler, base) {
        Ref.call(this, t.char);
        this.compiler = compiler;
        this.base = base;
    }
    ShortLengthRef.prototype = Object.create(Ref.prototype);
    ShortLengthRef.prototype.get = function () {
        return J.mem(this.base.get(), 'length');
    };
    ShortLengthRef.prototype.set = function (value) {
        return this.base.set(this.compiler.rt('shortLength', [this.base.get(), value]));
    };

    // A class property: reading by a field or a method, writing by a field or a method.
    function PropertyRef(compiler, object, property, indexArgs, node) {
        Ref.call(this, property.type);
        this.compiler = compiler;
        this.object = object;
        this.property = property;
        this.indexArgs = indexArgs || [];
        this.node = node;
        this.readOnly = property.write === null;
    }
    PropertyRef.prototype = Object.create(Ref.prototype);
    Pascal.PropertyRef = PropertyRef;
    PropertyRef.prototype.get = function () {
        return this.compiler.propertyRead(this);
    };
    PropertyRef.prototype.set = function (value) {
        return this.compiler.propertyWrite(this, value);
    };
    PropertyRef.prototype.stable = function (compiler) {
        var setup = [];
        var object = this.object;
        if (object !== null && !J.isSimple(object)) {
            var name = compiler.temp();
            setup.push(J.assign(J.id(name), object));
            object = J.id(name);
        }
        var args = this.indexArgs.map(function (arg) {
            if (J.isSimple(arg))
                return arg;
            var temp = compiler.temp();
            setup.push(J.assign(J.id(temp), arg));
            return J.id(temp);
        });
        return { setup: setup, ref: new PropertyRef(compiler, object, this.property, args, this.node) };
    };

    // A member of a JavaScript value: o.name.
    function JsRef(compiler, object, key) {
        Ref.call(this, t.js);
        this.compiler = compiler;
        this.object = object;
        this.key = key;
    }
    JsRef.prototype = Object.create(Ref.prototype);
    JsRef.prototype.get = function () {
        return this.compiler.rt('jg', [this.object, this.key]);
    };
    JsRef.prototype.set = function (value) {
        return this.compiler.rt('jset', [this.object, this.key, value]);
    };
    JsRef.prototype.stable = function (compiler) {
        var setup = [];
        var object = this.object, key = this.key;
        if (!J.isSimple(object)) {
            var objectName = compiler.temp();
            setup.push(J.assign(J.id(objectName), object));
            object = J.id(objectName);
        }
        if (!J.isSimple(key)) {
            var keyName = compiler.temp();
            setup.push(J.assign(J.id(keyName), key));
            key = J.id(keyName);
        }
        return { setup: setup, ref: new JsRef(compiler, object, key) };
    };

    Compiler.prototype.localRef = function (symbol) {
        return new LocalRef(this, symbol);
    };

    // The place of a variable by its symbol.
    Compiler.prototype.symbolRef = function (symbol, node) {
        switch (symbol.storage) {
        case 'local':
            if (symbol.fn !== this.fn && symbol.fn !== undefined && symbol.fn.kind === 'main')
                return this.localRef(symbol);
            return this.localRef(symbol);
        case 'global': {
            var ref = new PropRef(symbol.type, J.id('$V'), J.str(symbol.js));
            ref.readOnly = !!symbol.readOnly;
            ref.loopVariable = !!symbol.loopVariable;
            ref.symbol = symbol;
            return ref;
        }
        case 'varparam': {
            var param = new PropRef(symbol.type, J.id(symbol.objectJs), J.id(symbol.keyJs));
            param.symbol = symbol;
            return param;
        }
        case 'system':
            return symbol.ref(this, node);
        }
        this.error('variable expected', node);
    };

    // --- Values

    Compiler.prototype.refValue = function (ref) {
        var value = new Value(ref.type, null);
        value.ref = ref;
        value.lazyNode = function () { return ref.get(); };
        value.range = types.range(ref.type);
        return value;
    };

    // A constant in the code.
    Compiler.prototype.constValue = function (type, constant, node) {
        var value = new Value(type, null);
        value.constant = constant;
        var self = this;
        value.lazyNode = function () { return self.constantNode(type, constant); };
        if (types.isOrdinal(type) && constant !== null) {
            var number = big.toFloat(Pascal.ordinalOf(constant));
            value.range = [number, number];
        }
        return value;
    };

    Compiler.prototype.constantNode = function (type, constant) {
        if (constant === null)
            return J.nul();
        switch (type.kind) {
        case 'int':
            if (typeof constant === 'number')
                return constant < 0 ? J.un('-', J.num(-constant)) : J.num(constant);
            return this.constant(T.bigToI64(constant, type.ik !== 'u64'));
        case 'real':
            return constant < 0 || (constant === 0 && 1 / constant < 0) ? J.un('-', J.num(-constant)) : J.num(constant);
        case 'char':
        case 'enum':
            return J.num(constant);
        case 'bool':
            return J.bool(constant);
        case 'string':
            return J.str(constant);
        case 'set':
            return this.setConstantNode(type, constant);
        case 'nil':
        case 'pointer':
        case 'class':
        case 'proc':
            return J.nul();
        case 'js':
            return constant === null ? J.nul() : J.str(constant);
        }
        return J.nul();
    };

    // A constant set: [elements] - a number or 8 words.
    Compiler.prototype.setConstantNode = function (type, elements) {
        var small = type.small !== false && elements.every(function (element) {
            return element >= 0 && element < 32;
        }) && type.small !== undefined ? type.small : false;
        if (type.of === null || type.small === undefined)
            small = elements.every(function (element) { return element >= 0 && element < 32; });
        if (small) {
            var bits = 0;
            elements.forEach(function (element) { bits |= 1 << element; });
            return J.num(bits);
        }
        var words = [0, 0, 0, 0, 0, 0, 0, 0];
        elements.forEach(function (element) { words[element >> 5] |= 1 << (element & 31); });
        Object.freeze(words);
        return this.constant(words);
    };

    // The type of an integer constant: the smallest that fits (as FPC).
    Pascal.constIntType = function (value) {
        if (big.cmp(value, -128) >= 0 && big.cmp(value, 127) <= 0)
            return t.shortint;
        if (big.cmp(value, 0) >= 0 && big.cmp(value, 255) <= 0)
            return t.byte;
        if (big.cmp(value, -32768) >= 0 && big.cmp(value, 32767) <= 0)
            return t.smallint;
        if (big.cmp(value, 0) >= 0 && big.cmp(value, 65535) <= 0)
            return t.word;
        if (big.cmp(value, -2147483648) >= 0 && big.cmp(value, 2147483647) <= 0)
            return t.longint;
        if (big.cmp(value, 0) >= 0 && big.cmp(value, 4294967295) <= 0)
            return t.cardinal;
        if (big.cmp(value, t.int64.lo) >= 0 && big.cmp(value, t.int64.hi) <= 0)
            return t.int64;
        return t.qword;
    };

    // The type of a float constant: Single if it is exact in it, otherwise
    // Double if the decimal notation is exact in Double, otherwise Extended.
    function realLiteralType(text, value) {
        if (Math.fround(value) === value)
            return t.single;
        var exact = T.rat.parse(text.replace(/^\+/, ''));
        if (exact !== null && isFinite(value) && T.rat.cmp(exact, T.rat.fromFloat(value)) === 0)
            return t.double;
        return t.extended;
    }

    // --- Expression

    // asCallee - a name before the parentheses of a call: the name of a
    // function is a call, not its result.
    Compiler.prototype.compileExpr = function (node, expected, asCallee) {
        switch (node.k) {
        case 'int':
            return this.constValue(Pascal.constIntType(node.value), node.value, node);
        case 'real':
            return this.constValue(realLiteralType(node.text, node.value), node.value, node);
        case 'string':
            if (node.value.length === 1)
                return this.charConstant(node.value.charCodeAt(0), true);
            return this.constValue(t.ansistring, node.value, node);
        case 'nil':
            return this.constValue(t.nil, null, node);
        case 'paren': {
            var inner = this.compileExpr(node.expr, expected);
            if (inner.kind !== undefined)
                return inner;
            var copy = this.copyValue(inner);
            copy.ref = null;
            return copy;
        }
        case 'name':
            return this.compileName(node, expected, asCallee);
        case 'unary':
            return this.compileUnary(node, expected);
        case 'binary':
            return this.compileBinary(node, expected);
        case 'call':
            return this.compileCall(node, expected, false);
        case 'index':
            return this.compileIndex(node);
        case 'member':
            return this.compileMember(node, expected);
        case 'deref':
            return this.compileDeref(node);
        case 'addr':
            return this.compileAddress(node, expected);
        case 'setlit':
            return this.compileSetLiteral(node, expected);
        case 'inherited':
            return this.compileInherited(node, expected, false);
        case 'format':
            this.error('Illegal expression', node);
        }
        this.error('Illegal expression', node);
    };

    Compiler.prototype.copyValue = function (value) {
        var copy = new Value(value.type, null);
        for (var key in value) {
            if (key !== 'ownNode' && key !== 'lazyNode' && Object.prototype.hasOwnProperty.call(value, key))
                copy[key] = value[key];
        }
        copy.node = value.node;
        return copy;
    };

    Compiler.prototype.charConstant = function (code, literal) {
        var value = this.constValue(t.char, code);
        value.charLiteral = literal;
        return value;
    };

    // The value of an expression (not a type, not a routine without a call).
    Compiler.prototype.compileValue = function (node, expected) {
        var value = this.compileExpr(node, expected);
        return this.toValue(value, node, expected);
    };

    Compiler.prototype.toValue = function (value, node, expected) {
        if (value.kind === 'type') {
            // A class type as a value is a class reference.
            if (value.type.kind === 'class' && !value.type.isObject)
                return this.classRefValue(value.type);
            this.error('Illegal expression', node);
        }
        if (value.kind === 'routine' || value.kind === 'builtin' || value.kind === 'method')
            return this.callValueWithoutArgs(value, node, expected);
        if (value.kind === 'unit')
            this.error('Illegal expression', node);
        return value;
    };

    Compiler.prototype.classRefValue = function (classType) {
        var value = new Value(this.classRefType(classType), this.classNode(classType));
        value.classConstant = classType;
        return value;
    };

    Compiler.prototype.classRefType = function (classType) {
        if (classType.refType === undefined)
            classType.refType = new Pascal.Type('classref', { name: null, of: classType, size: 8 });
        return classType.refType;
    };

    // --- Names

    Compiler.prototype.compileName = function (node, expected, asCallee) {
        var symbol = this.lookup(node.name);
        if (symbol === null)
            this.notFound(node);
        return this.symbolValue(symbol, node, expected, asCallee);
    };

    Compiler.prototype.symbolValue = function (symbol, node, expected, asCallee) {
        switch (symbol.kind) {
        case 'const': {
            var value = this.constValue(symbol.type, symbol.value, node);
            if (symbol.value0 !== undefined && symbol.value0.charLiteral)
                value.charLiteral = true;
            return value;
        }
        case 'var':
            return this.refValue(this.symbolRef(symbol, node));
        case 'type':
            return { kind: 'type', type: symbol.byMode !== undefined ? symbol.byMode(this.switches(node)) : symbol.type, node: node };
        case 'routine':
            if (!asCallee && this.isObjfpc(node)) {
                var result = this.resultOf(symbol);
                if (result !== null)
                    return result;
            }
            return { kind: 'routine', symbol: symbol, node: node, self: null };
        case 'builtin':
            return { kind: 'builtin', symbol: symbol, node: node };
        case 'unit':
            return { kind: 'unit', unit: symbol.unit, node: node };
        case 'member':
            return this.memberOfSelf(symbol, node, expected);
        case 'withmember':
            return this.memberOfWith(symbol, node, expected);
        case 'label':
            this.error('Illegal expression', node);
        }
        this.error('Illegal expression', node);
    };

    // The name of a function or a method in its body (and in nested ones)
    // is its result; in the modes other than objfpc only on the left of :=,
    // in an expression it is a call.
    Compiler.prototype.resultOf = function (symbol) {
        var procs = symbol.kind === 'routine' ? symbol.procs
                    : symbol.kind === 'member' && symbol.member.kind === 'method' ? symbol.member.procs
                    : null;
        if (procs === null)
            return null;
        for (var fn = this.fn; fn !== null && fn !== undefined; fn = fn.parent) {
            if (fn.resultVar !== null && procs.indexOf(fn.proc) >= 0)
                return this.refValue(this.localRef(fn.resultVar));
        }
        return null;
    };

    // --- Conversions

    // Whether a value of the type from can be assigned to a place of the type to (and how).
    Compiler.prototype.assignable = function (to, value) {
        var from = value.type;
        if (from === to)
            return true;
        switch (to.kind) {
        case 'int':
            return from.kind === 'int' || (from.kind === 'js');
        case 'real':
            return from.kind === 'int' || from.kind === 'real' || from.kind === 'js';
        case 'char':
            if (from.kind === 'char')
                return !!from.wide === !!to.wide || value.isConstant();
            if (from.kind === 'string' && value.isConstant() && value.constant.length === 1)
                return true;
            return from.kind === 'js';
        case 'bool':
            return from.kind === 'bool' || from.kind === 'js';
        case 'enum':
            return from.kind === 'enum' && types.base(from) === types.base(to);
        case 'string':
            return from.kind === 'string' || from.kind === 'char' || from.kind === 'js';
        case 'set':
            if (from.kind !== 'set')
                return false;
            if (from.of === null)
                return true;
            return types.sameOrdinalBase(types.base(from.of), types.base(to.of));
        case 'pointer':
            if (from.kind === 'nil')
                return true;
            if (from.kind === 'pointer')
                return to.to === null || from.to === null || types.equal(to.to, from.to) || (from.untypedAddress === true);
            // A class object, a class reference, a procedure go to Pointer without a cast.
            if ((from.kind === 'classref' || (from.kind === 'class' && !from.isObject) || from.kind === 'proc') &&
                to.to === null)
                return true;
            return false;
        case 'class':
            if (to.isObject)
                return from === to || (from.kind === 'class' && from.isObject && types.inherits(from, to));
            if (from.kind === 'nil')
                return true;
            if (from.kind === 'class' && !from.isObject)
                return types.inherits(from, to);
            if (from.kind === 'js')
                return true;
            return false;
        case 'classref':
            if (from.kind === 'nil')
                return true;
            return from.kind === 'classref' && types.inherits(from.of, to.of);
        case 'proc':
            if (from.kind === 'nil')
                return true;
            if (from.kind === 'proc')
                return types.sameSignature(from, to) && !!from.ofObject === !!to.ofObject;
            return false;
        case 'dynarray':
            if (from.kind === 'nil')
                return true;
            if (from.kind === 'dynarray')
                return types.equal(from.of, to.of);
            if (from.kind === 'arrayliteral')
                return true;
            return false;
        case 'array':
            return types.equal(from, to) || (from.kind === 'array' && from.length === to.length &&
                types.equal(types.base(from.index), types.base(to.index)) && types.equal(from.of, to.of) && from.index === to.index);
        case 'record':
        case 'file':
            return from === to;
        case 'js':
            return from.kind !== 'void' && from.kind !== 'file';
        case 'openarray':
            return from.kind === 'array' || from.kind === 'dynarray' || from.kind === 'openarray' || from.kind === 'arrayliteral';
        }
        return types.equal(from, to);
    };

    // A value converted to the type of a place (an implicit conversion). An
    // incompatible one is the error "Incompatible types".
    Compiler.prototype.convertValue = function (value, to, node, options) {
        value = this.toValue(value, node, to);
        var from = value.type;
        if (to.kind === 'proc' && from.kind === 'proc' && value.routineChoice !== undefined)
            return value;
        if (!this.assignable(to, value)) {
            if (to.kind === 'proc' && value.routineSymbol !== undefined)
                return this.procedureValue(value, to, node);
            if (to.kind === 'int' && from.kind === 'real')
                this.incompatible(from, to, node);
            this.incompatible(from, to, node);
        }
        if (from.kind === 'js' && to.kind !== 'js')
            return this.fromJs(value, to, node);
        switch (to.kind) {
        case 'int':
            return this.convertInt(value, to, options);
        case 'real':
            return this.convertReal(value, to);
        case 'char':
            if (from.kind === 'string')
                return this.charConstant(value.constant.charCodeAt(0), true);
            return value;
        case 'string':
            if (from.kind === 'char') {
                if (value.isConstant())
                    return this.constValue(t.ansistring, String.fromCharCode(value.constant));
                return new Value(to, this.charToString(value));
            }
            if (to.short !== null && to.short !== undefined && (from.short === null || from.short === undefined || from.short > to.short)) {
                if (value.isConstant())
                    return this.constValue(to, value.constant.substring(0, to.short));
                return new Value(to, this.rt('copy', [value.node, J.num(1), J.num(to.short)]));
            }
            return value;
        case 'set':
            return this.convertSet(value, to);
        case 'js':
            return this.toJs(value, node);
        case 'dynarray':
            if (from.kind === 'nil')
                return new Value(to, J.call(J.mem(this.typeRef(to), 'empty'), []));
            if (from.kind === 'arrayliteral')
                return this.arrayLiteralValue(value, to, node);
            return value;
        case 'openarray':
            if (from.kind === 'arrayliteral')
                return this.arrayLiteralValue(value, new Pascal.Type('dynarray', { name: null, of: to.of }), node);
            return value;
        }
        return value;
    };

    // A Char as a string: String.fromCharCode(c); a wide one in UTF-8.
    Compiler.prototype.charToString = function (value) {
        if (value.type.wide)
            return this.rt('wchr', [value.node]);
        if (value.node.k === 'call' && value.node.callee.k === 'mem' && value.node.callee.name === 'sc')
            return J.call(J.path('String.fromCharCode'), [value.node]);
        return J.call(J.path('String.fromCharCode'), [value.node]);
    };

    // A string value from a string or a character.
    Compiler.prototype.stringValue = function (value, node) {
        value = this.toValue(value, node);
        if (value.type.kind === 'string')
            return value;
        if (value.type.kind === 'char')
            return this.convertValue(value, t.ansistring, node);
        if (value.type.kind === 'js')
            return this.fromJs(value, t.ansistring, node);
        this.incompatible(value.type, t.ansistring, node);
    };

    // An integer to the integer type to: truncated to the size (as FPC with $R-).
    Compiler.prototype.convertInt = function (value, to, options) {
        if (value.isConstant()) {
            var wrapped = Pascal.wrapConstant(value.constant, to);
            return this.constValue(to, wrapped);
        }
        var range = value.range || types.range(value.type);
        var target = types.range(to);
        var kind = to.ik;
        if (range[0] >= target[0] && range[1] <= target[1] && !value.wide)
            return this.retype(value, to);
        var node;
        if (value.wrapped32) {
            // The low 32 bits, signed, already.
            node = kind === 'i32' ? value.node : (kind === 'i64' || kind === 'u64' ? (kind === 'u64' ? this.u64FromI32(value.node) : value.node) : ops.wrap(kind, value.node));
            if (kind === 'u32')
                node = J.bin('>>>', value.node, J.num(0));
        } else if (value.wide || !types.isSafeRange(range)) {
            var fromKind = value.type.kind === 'int' && value.type.ik === 'u64' ? 'u64' : 'i64';
            node = ops.convert(fromKind, kind, value.node, this.opsContext());
            if (kind === 'i64' && fromKind === 'i64')
                node = value.node;
        } else {
            if (kind === 'i64')
                node = value.node;
            else if (kind === 'u64')
                node = range[0] >= 0 ? value.node : J.call(J.mem(this.helper('u64'), 'fromSigned'), [value.node]);
            else
                node = ops.wrap(kind, value.node);
        }
        var result = new Value(to, node);
        result.range = target;
        result.wide = kind === 'i64' || kind === 'u64' ? !!value.wide || !types.isSafeRange(range) : false;
        return result;
    };

    Compiler.prototype.u64FromI32 = function (node) {
        return J.cond(J.bin('<', node, J.num(0)), J.call(J.mem(this.helper('u64'), 'fromSigned'), [node]), node);
    };

    Compiler.prototype.retype = function (value, type) {
        var copy = this.copyValue(value);
        copy.type = type;
        copy.ref = null;
        return copy;
    };

    // An integer constant truncated to the type (as an assignment with $R-).
    Pascal.wrapConstant = function (value, type) {
        if (type.kind !== 'int')
            return value;
        if (big.cmp(value, type.lo) >= 0 && big.cmp(value, type.hi) <= 0)
            return value;
        var base = INT_BOUNDS[type.ik];
        var bits = base.bits;
        var modulus = big.pow(2, bits);
        var low = big.mod(value, modulus);
        if (base.signed && big.cmp(low, big.pow(2, bits - 1)) >= 0)
            low = big.sub(low, modulus);
        return low;
    };
    var INT_BOUNDS = {
        i8: { bits: 8, signed: true }, u8: { bits: 8, signed: false }, i16: { bits: 16, signed: true },
        u16: { bits: 16, signed: false }, i32: { bits: 32, signed: true }, u32: { bits: 32, signed: false },
        i64: { bits: 64, signed: true }, u64: { bits: 64, signed: false }
    };

    Compiler.prototype.convertReal = function (value, to) {
        var from = value.type;
        if (value.isConstant()) {
            var number = from.kind === 'int' ? big.toFloat(value.constant) : value.constant;
            if (to.rk === 'f32')
                number = Math.fround(number);
            if (to.print === 'comp' || to.print === 'currency')
                number = Pascal.toUnits(number, to.print === 'comp' ? 1 : 10000);
            var constant = this.constValue(to, number);
            return constant;
        }
        var node = value.node;
        if (from.kind === 'int') {
            if (value.wide || !types.isSafeRange(value.range || types.range(from)))
                node = J.call(J.mem(this.helper(from.ik === 'u64' ? 'u64' : 'i64'), 'toFloat'), [node]);
        }
        if (to.rk === 'f32' && !(from.kind === 'real' && from.rk === 'f32'))
            node = J.call(J.path('Math.fround'), [node]);
        if ((to.print === 'comp' || to.print === 'currency') && from !== to)
            node = this.rt('toUnits', [node, J.num(to.print === 'comp' ? 1 : 10000)]);
        var result = new Value(to, node);
        result.mayOverflow = value.mayOverflow;
        return result;
    };

    Compiler.prototype.convertSet = function (value, to) {
        var from = value.type;
        if (value.isConstant())
            return this.constValue(to, value.constant);
        if (from.small === to.small)
            return this.retype(value, to);
        if (to.small)
            return new Value(to, this.rt('ssmall', [value.node]));
        return new Value(to, this.rt('sbig', [value.node]));
    };

    // An assignment as a JavaScript expression.
    Compiler.prototype.assignTo = function (ref, value, node) {
        var type = ref.type;
        if (ref.readOnly)
            this.error(ref.loopVariable ? 'Illegal assignment to for-loop variable "' + (ref.symbol ? ref.symbol.text : '') + '"'
                                        : "Can't assign values to const variable", node);
        var converted = this.convertValue(value, type, node, { assign: true });
        var valueNode = converted.node;
        if (types.isAggregate(type))
            return J.call(J.mem(this.typeRef(type), 'assign'), [ref.get(), valueNode]);
        if (type.kind === 'real' && converted.mayOverflow)
            valueNode = this.checkedReal(valueNode);
        return ref.set(valueNode);
    };

    // A float after arithmetic: an infinity and NaN are FPU errors.
    Compiler.prototype.checkedReal = function (node) {
        var name = this.temp();
        return J.cond(J.bin('===', J.bin('-', J.assign(J.id(name), node), J.id(name)), J.num(0)), J.id(name),
                      this.rt('fchk', [J.id(name)]));
    };

    // --- Unary operations

    Compiler.prototype.compileUnary = function (node, expected) {
        var arg = this.compileValue(node.arg, expected);
        var type = arg.type;
        if (node.op === 'not') {
            if (type.kind === 'bool') {
                if (arg.isConstant())
                    return this.constValue(t.boolean, !arg.constant);
                return new Value(t.boolean, J.not(this.boolNode(arg)));
            }
            if (type.kind === 'int')
                return this.intNot(arg);
            if (type.kind === 'js')
                return new Value(t.boolean, J.not(this.rt('jtrue', [arg.node])));
            this.error('Operator is not overloaded: "not ' + types.display(type) + '"', node);
        }
        if (type.kind === 'js')
            arg = this.fromJs(arg, t.double, node);
        type = arg.type;
        if (type.kind === 'real') {
            if (node.op === '+')
                return arg;
            if (arg.isConstant())
                return this.constValue(type, -arg.constant);
            var negated = new Value(type, J.un('-', arg.node));
            negated.mayOverflow = arg.mayOverflow;
            return negated;
        }
        if (type.kind === 'int') {
            if (node.op === '+')
                return this.retype(arg, arg.type);
            return this.intArith('-', this.constValue(t.shortint, 0), arg, node);
        }
        this.error('Operator is not overloaded: "' + node.op + ' ' + types.display(type) + '"', node);
    };

    // not of an integer: the same type.
    Compiler.prototype.intNot = function (arg) {
        var type = arg.type;
        if (arg.isConstant())
            return this.constValue(type, Pascal.wrapConstant(big.not(arg.constant), type));
        var kind = type.ik;
        var node;
        if (kind === 'i64' || kind === 'u64')
            node = ops.unary(kind, '^', arg.node, this.opsContext());
        else
            node = ops.wrap(kind === 'i32' ? 'i32' : kind, J.un('~', arg.node));
        if (kind === 'i32' || kind === 'i8' || kind === 'i16')
            node = kind === 'i32' ? J.un('~', arg.node) : ops.wrap(kind, J.un('~', arg.node));
        var result = new Value(type, node);
        result.range = types.range(type);
        result.wide = kind === 'i64' || kind === 'u64';
        return result;
    };

    // A Boolean in the code is a JavaScript boolean.
    Compiler.prototype.boolNode = function (value) {
        return value.node;
    };

    // --- Binary operations

    var ARITHMETIC = { '+': true, '-': true, '*': true, '/': true, 'div': true, 'mod': true };
    var COMPARISON = { '=': '===', '<>': '!==', '<': '<', '>': '>', '<=': '<=', '>=': '>=' };

    Compiler.prototype.compileBinary = function (node, expected) {
        var op = node.op;
        if (op === 'is')
            return this.compileIs(node);
        if (op === 'as')
            return this.compileAs(node);
        if (op === 'in')
            return this.compileIn(node);
        if (op === 'and' || op === 'or') {
            var leftLogic = this.compileValue(node.left);
            if (leftLogic.type.kind === 'bool') {
                var rightLogic = this.compileValue(node.right);
                if (rightLogic.type.kind !== 'bool')
                    this.error('Operator is not overloaded: "' + types.display(leftLogic.type) + '" ' + op + ' "' + types.display(rightLogic.type) + '"', node);
                return this.logical(op, leftLogic, rightLogic, node);
            }
            return this.binaryValues(op, leftLogic, this.compileValue(node.right), node, expected);
        }
        var setExpected = null;
        // An integer up to 32 bits in place of the result: + - * may be
        // computed modulo 2^32 (Math.imul), as FPC would truncate them.
        var demand = Pascal.isNarrowInt(expected) && (op === '+' || op === '-' || op === '*') ? expected : undefined;
        var left = this.compileValue(node.left, expected && expected.kind === 'set' ? expected : demand);
        if (left.type.kind === 'set')
            setExpected = left.type;
        var right = this.compileValue(node.right, setExpected || (left.type.kind === 'set' ? left.type : demand));
        if (setExpected === null && right.type.kind === 'set' && node.left.k === 'setlit')
            left = this.compileValue(node.left, right.type);
        return this.binaryValues(op, left, right, node, expected);
    };

    Compiler.prototype.binaryValues = function (op, left, right, node, expected) {
        var lt = left.type, rt = right.type;
        this.demand32 = Pascal.isNarrowInt(expected) && op === '*';
        // JavaScript values: to the type of the other operand.
        if (lt.kind === 'js' || rt.kind === 'js')
            return this.jsBinary(op, left, right, node);
        if (lt.kind === 'set' || rt.kind === 'set')
            return this.setBinary(op, left, right, node);
        if (COMPARISON[op] !== undefined)
            return this.compare(op, left, right, node);
        if (op === 'and' || op === 'or' || op === 'xor') {
            if (lt.kind === 'bool' && rt.kind === 'bool')
                return this.logical(op, left, right, node);
            if (lt.kind === 'int' && rt.kind === 'int')
                return this.intBitwise(op, left, right, node);
            this.badOperands(op, left, right, node);
        }
        if (op === 'shl' || op === 'shr' || op === '<<' || op === '>>') {
            if (lt.kind === 'int' && rt.kind === 'int')
                return this.intShift(op === '<<' ? 'shl' : (op === '>>' ? 'shr' : op), left, right, node);
            this.badOperands(op, left, right, node);
        }
        if (op === '**')
            return this.power(left, right, node);
        if (op === '+' && (types.isStringLike(lt) || types.isStringLike(rt)) &&
            (types.isStringLike(lt) && types.isStringLike(rt)))
            return this.concat(left, right, node);
        if (op === '+' && lt.kind === 'dynarray' && rt.kind === 'dynarray' && types.equal(lt, rt))
            return new Value(lt, this.rt('concatArrays', [this.typeRef(lt), J.arr([left.node, right.node])]));
        if (op === '+' && lt.kind === 'pointer' && rt.kind === 'int' || op === '-' && lt.kind === 'pointer')
            this.error('pointer arithmetic is not supported', node);
        if (ARITHMETIC[op] !== undefined) {
            if (op === '/') {
                if (!types.isNumeric(lt) || !types.isNumeric(rt))
                    this.badOperands(op, left, right, node);
                return this.realArith(op, left, right, node);
            }
            if (lt.kind === 'int' && rt.kind === 'int')
                return this.intArith(op, left, right, node);
            if (types.isNumeric(lt) && types.isNumeric(rt)) {
                if (op === 'div' || op === 'mod')
                    this.badOperands(op, left, right, node);
                return this.realArith(op, left, right, node);
            }
        }
        this.badOperands(op, left, right, node);
    };

    Compiler.prototype.badOperands = function (op, left, right, node) {
        this.error('Operator is not overloaded: "' + types.display(left.type) + '" ' + op + ' "' + types.display(right.type) + '"', node);
    };

    Compiler.prototype.logical = function (op, left, right, node) {
        if (left.isConstant() && right.isConstant()) {
            var leftConstant = left.constant, rightConstant = right.constant;
            var folded = op === 'and' ? leftConstant && rightConstant
                : (op === 'or' ? leftConstant || rightConstant : leftConstant !== rightConstant);
            return this.constValue(t.boolean, folded);
        }
        var full = this.switches(node).B;
        if (op === 'xor')
            return new Value(t.boolean, J.bin('!==', this.boolNode(left), this.boolNode(right)));
        if (full) {
            // {$B+}: both sides are always evaluated.
            var bit = J.bin(op === 'and' ? '&' : '|', J.un('+', left.node), J.un('+', right.node));
            return new Value(t.boolean, J.bin('!==', bit, J.num(0)));
        }
        return new Value(t.boolean, op === 'and' ? J.and(left.node, right.node) : J.or(left.node, right.node));
    };

    // The result type of + - * div mod for integers (as FPC on 64 bits):
    // both QWord (or QWord and an unsigned one) give QWord, otherwise Int64.
    function arithmeticResultType(left, right) {
        var leftType = left.type, rightType = right.type;
        var unsigned = function (value) {
            return value.type.ik.charAt(0) === 'u' || (value.isConstant() && big.sign(value.constant) >= 0);
        };
        if ((leftType.ik === 'u64' && unsigned(right)) || (rightType.ik === 'u64' && unsigned(left)))
            return t.qword;
        return t.int64;
    }

    // Integer arithmetic.
    Compiler.prototype.intArith = function (op, left, right, node) {
        var resultType = arithmeticResultType(left, right);
        if (left.isConstant() && right.isConstant())
            return this.foldInt(op, left.constant, right.constant, resultType, node);
        var unsigned = resultType === t.qword;
        var ctx = this.opsContext();
        var lr = left.range || types.range(left.type), rr = right.range || types.range(right.type);
        var range = intervalOp(op, lr, rr);
        var plain = !left.wide && !right.wide && types.isSafeRange(lr) && types.isSafeRange(rr) && types.isSafeRange(range);
        var result;
        if (op === 'div' || op === 'mod') {
            if (plain) {
                var divisor = right.node;
                var dividend = left.node;
                var zeroCheck = !(right.isConstant() && !big.eq(right.constant, 0));
                var int32 = range[0] >= -2147483648 && range[1] <= 2147483647 && lr[0] >= -2147483648 && lr[1] <= 2147483647;
                var stableDividend = dividend, stableDivisor = divisor, setups = [];
                if (zeroCheck && !J.isSimple(stableDivisor)) {
                    if (!J.isSimple(stableDividend)) {
                        var dividendName = this.temp();
                        setups.push(J.assign(J.id(dividendName), stableDividend));
                        stableDividend = J.id(dividendName);
                    }
                    var divisorName = this.temp();
                    setups.push(J.assign(J.id(divisorName), stableDivisor));
                    stableDivisor = J.id(divisorName);
                }
                var raw = J.bin(op === 'div' ? '/' : '%', stableDividend, stableDivisor);
                var operation;
                if (op === 'div')
                    operation = int32
                        ? J.bin('|', raw, J.num(0))
                        : J.bin('+', J.call(J.path('Math.trunc'), [raw]), J.num(0));
                else
                    operation = int32 ? J.bin('|', raw, J.num(0)) : J.bin('+', raw, J.num(0));
                if (zeroCheck)
                    operation = J.cond(J.bin('===', stableDivisor, J.num(0)), this.rt('dz', []), operation);
                setups.push(operation);
                result = new Value(resultType, J.seq(setups));
            } else {
                result = new Value(resultType, ops.binary(unsigned ? 'u64' : 'i64', op === 'div' ? '/' : '%',
                                                          this.hybrid(left, unsigned), this.hybrid(right, unsigned), ctx));
                result.wide = true;
            }
        } else if (plain) {
            result = new Value(resultType, J.bin(op, left.node, right.node));
        } else if (op === '*' && this.demand32 && !left.wide && !right.wide) {
            // Only the low 32 bits are needed: Math.imul.
            result = new Value(resultType, J.call(J.path('Math.imul'), [this.int32Node(left), this.int32Node(right)]));
            result.range = [-2147483648, 2147483647];
            return result;
        } else {
            var kind = unsigned ? 'u64' : 'i64';
            result = new Value(resultType, ops.binary(kind, op, this.hybrid(left, unsigned), this.hybrid(right, unsigned), ctx));
            result.wide = true;
        }
        result.range = plain ? range : types.range(resultType);
        return result;
    };

    // The low 32 bits of a number, signed (without the hybrid).
    Compiler.prototype.int32Node = function (value) {
        var range = value.range || types.range(value.type);
        if (range[0] >= -2147483648 && range[1] <= 2147483647)
            return value.node;
        return J.bin('|', value.node, J.num(0));
    };

    Pascal.isNarrowInt = function (type) {
        return type !== undefined && type !== null && type.kind === 'int' && type.ik !== 'i64' && type.ik !== 'u64';
    };

    // A value as the hybrid T.i64 (numbers are a hybrid already).
    Compiler.prototype.hybrid = function (value, unsigned) {
        if (value.isConstant() && typeof value.constant !== 'number')
            return this.constant(T.bigToI64(value.constant, !unsigned));
        if (unsigned && value.type.kind === 'int' && value.type.ik !== 'u64') {
            var range = value.range || types.range(value.type);
            if (range[0] < 0)
                return J.call(J.mem(this.helper('u64'), 'fromSigned'), [value.node]);
        }
        if (!unsigned && value.type.kind === 'int' && value.type.ik === 'u64')
            return J.call(J.mem(this.helper('i64'), 'fromUnsigned'), [value.node]);
        return value.node;
    };

    function intervalOp(op, left, right) {
        var candidates;
        switch (op) {
        case '+':
            return [left[0] + right[0], left[1] + right[1]];
        case '-':
            return [left[0] - right[1], left[1] - right[0]];
        case '*':
            candidates = [left[0] * right[0], left[0] * right[1], left[1] * right[0], left[1] * right[1]];
            return [Math.min.apply(null, candidates), Math.max.apply(null, candidates)];
        case 'div': {
            var magnitude = Math.max(Math.abs(left[0]), Math.abs(left[1]));
            return [-magnitude, magnitude];
        }
        case 'mod': {
            var bound = Math.max(Math.abs(right[0]), Math.abs(right[1]));
            var low = left[0] < 0 ? -(bound - 1) : 0, high = left[1] > 0 ? bound - 1 : 0;
            return [low, high];
        }
        }
        return [-Infinity, Infinity];
    }

    Compiler.prototype.foldInt = function (op, left, right, type, node) {
        var value;
        switch (op) {
        case '+': value = big.add(left, right); break;
        case '-': value = big.sub(left, right); break;
        case '*': value = big.mul(left, right); break;
        case 'div':
        case 'mod':
            if (big.sign(right) === 0)
                this.error('Division by zero', node);
            value = op === 'div' ? big.quot(left, right) : big.rem(left, right);
            break;
        }
        // Constants are computed exactly; the type by the value (as FPC).
        if (big.cmp(value, t.int64.lo) < 0 || big.cmp(value, t.qword.hi) > 0)
            this.error('Overflow in arithmetic operation', node);
        return this.constValue(Pascal.constIntType(value), value);
    };

    // and/or/xor of integers: the common type of the operands (as FPC).
    Compiler.prototype.intBitwise = function (op, left, right, node) {
        var type = bitwiseType(left, right);
        if (left.isConstant() && right.isConstant()) {
            var operation = op === 'and' ? big.and : (op === 'or' ? big.or : big.xor);
            var folded = operation(left.constant, right.constant);
            return this.constValue(Pascal.constIntType(folded), folded);
        }
        var kind = type.ik;
        var jsOp = op === 'and' ? '&' : (op === 'or' ? '|' : '^');
        var node2;
        var wide = kind === 'i64' || kind === 'u64';
        if (wide) {
            node2 = ops.binary(kind, jsOp, this.hybrid(left, kind === 'u64'), this.hybrid(right, kind === 'u64'), this.opsContext());
        } else {
            var leftNode = this.convertInt(left, type).node, rightNode = this.convertInt(right, type).node;
            node2 = J.bin(jsOp, leftNode, rightNode);
            if (kind === 'u32')
                node2 = J.bin('>>>', node2, J.num(0));
        }
        var result = new Value(type, node2);
        result.range = types.range(type);
        result.wide = wide;
        return result;
    };

    // The common type for and/or/xor: the type of an operand if the other
    // one is a constant, otherwise the smallest that holds both.
    function bitwiseType(left, right) {
        var leftType = left.type, rightType = right.type;
        if (left.isConstant() && !right.isConstant())
            return widen(rightType, left.constant);
        if (right.isConstant() && !left.isConstant())
            return widen(leftType, right.constant);
        if (leftType.ik === rightType.ik)
            return types.base(leftType).name ? standardInt(leftType.ik) : standardInt(leftType.ik);
        var lo = big.cmp(leftType.lo, rightType.lo) < 0 ? leftType.lo : rightType.lo;
        var hi = big.cmp(leftType.hi, rightType.hi) > 0 ? leftType.hi : rightType.hi;
        return standardInt(Pascal.intKindFor(lo, hi));
    }
    function widen(type, constant) {
        var ik = type.ik;
        if (big.cmp(constant, type.lo) >= 0 && big.cmp(constant, type.hi) <= 0)
            return standardInt(ik);
        return standardInt(Pascal.intKindFor(big.cmp(constant, type.lo) < 0 ? constant : type.lo,
                                             big.cmp(constant, type.hi) > 0 ? constant : type.hi));
    }
    function standardInt(ik) {
        return { i8: t.shortint, u8: t.byte, i16: t.smallint, u16: t.word, i32: t.longint, u32: t.cardinal, i64: t.int64,
                 u64: t.qword }[ik];
    }
    Pascal.standardInt = standardInt;

    // shl/shr: the type of the left operand, at least 32 bits; the count
    // modulo the size; shr is logical.
    Compiler.prototype.intShift = function (op, left, right, node) {
        var type = left.type;
        var kind = type.ik;
        if (kind === 'i8' || kind === 'i16' || kind === 'u8' || kind === 'u16')
            kind = 'i32';
        if (kind === 'i32' && type.ik !== 'i32' && left.isConstant())
            kind = 'i64';
        var resultType = standardInt(kind);
        var bits = kind === 'i64' || kind === 'u64' ? 64 : 32;
        if (left.isConstant() && right.isConstant()) {
            // Constants as 64-bit ones (1 shl 40 = 2^40).
            var count = big.toFloat(right.constant) & 63;
            var value = left.constant;
            var folded;
            if (op === 'shl') {
                folded = Pascal.wrapConstant(big.shl(value, count), t.int64);
            } else {
                var unsignedValue = big.sign(value) < 0 ? big.add(value, big.pow(2, 64)) : value;
                folded = big.shr(unsignedValue, count);
                folded = Pascal.wrapConstant(folded, t.int64);
            }
            return this.constValue(Pascal.constIntType(folded), folded);
        }
        var countNode = right.isConstant() ? J.num(big.toFloat(right.constant) & (bits - 1))
                                           : J.bin('&', this.convertInt(right, t.longint).node, J.num(bits - 1));
        var result;
        if (bits === 64) {
            var unsigned = kind === 'u64';
            var helperName = op === 'shl' ? 'shl' : 'shr';
            var operand = this.hybrid(left, unsigned);
            var helper = this.helper(unsigned ? 'u64' : 'i64');
            var shifted;
            if (op === 'shr' && !unsigned)
                shifted = J.call(J.mem(this.helper('i64'), 'fromUnsigned'),
                                 [J.call(J.mem(this.helper('u64'), 'shr'), [J.call(J.mem(this.helper('u64'), 'fromSigned'), [operand]), countNode])]);
            else
                shifted = J.call(J.mem(helper, helperName), [operand, countNode]);
            result = new Value(resultType, shifted);
            result.wide = true;
        } else {
            var base = this.convertInt(left, resultType).node;
            var node2;
            if (op === 'shl')
                node2 = J.bin('<<', base, countNode);
            else
                node2 = J.bin('>>>', base, countNode);
            if (kind === 'u32' || op === 'shr')
                node2 = kind === 'u32' ? J.bin('>>>', node2, J.num(0)) : J.bin('|', node2, J.num(0));
            result = new Value(resultType, node2);
        }
        result.range = types.range(resultType);
        return result;
    };

    // Float arithmetic: the type is the largest of the operands (Single,
    // Double, Extended); an integer with a float gives the float type; / of
    // two integers gives Double.
    Compiler.prototype.realArith = function (op, left, right, node) {
        var type = realResultType(left.type, right.type, op);
        var leftReal = this.convertReal(left, type), rightReal = this.convertReal(right, type);
        if (left.isConstant() && right.isConstant()) {
            var leftNumber = leftReal.constant, rightNumber = rightReal.constant;
            var value;
            switch (op) {
            case '+': value = leftNumber + rightNumber; break;
            case '-': value = leftNumber - rightNumber; break;
            case '*': value = leftNumber * rightNumber; break;
            case '/':
                // 0.0/0.0 and 1.0/0.0 are the constants NaN and Infinity (as in the Math unit of FPC).
                if (rightNumber === 0 && left.type.kind === 'int' && right.type.kind === 'int')
                    this.error('Division by zero', node);
                value = leftNumber / rightNumber;
                break;
            }
            if (type.rk === 'f32')
                value = Math.fround(value);
            return this.constValue(type, value);
        }
        var result;
        if (op === '/') {
            if (rightReal.isConstant() && rightReal.constant !== 0)
                result = J.bin('/', leftReal.node, rightReal.node);
            else
                result = this.rt('fdiv', [leftReal.node, rightReal.node]);
        } else {
            result = J.bin(op, leftReal.node, rightReal.node);
        }
        if (type.rk === 'f32')
            result = J.call(J.path('Math.fround'), [result]);
        var made = new Value(type, result);
        made.mayOverflow = true;
        return made;
    };

    function realResultType(left, right, op) {
        if (left.kind === 'int' && right.kind === 'int')
            return t.double;
        var leftReal = left.kind === 'real' ? left : null, rightReal = right.kind === 'real' ? right : null;
        var rank = function (type) {
            if (type === null)
                return 0;
            return type.rk === 'f32' ? 1 : (type.rk === 'f64' ? 2 : 3);
        };
        var top = Math.max(rank(leftReal), rank(rightReal));
        void op;
        return top === 1 ? t.single : (top === 2 ? t.double : t.extended);
    }

    Compiler.prototype.power = function (left, right, node) {
        if (left.type.kind === 'int' && right.type.kind === 'int') {
            if (left.isConstant() && right.isConstant() && big.sign(right.constant) >= 0)
                return this.constValue(t.int64, big.pow(left.constant, big.toFloat(right.constant)));
            return new Value(t.int64, J.call(J.mem(J.id('$R'), 'ipower'), [this.hybrid(left, false), this.hybrid(right, false)]));
        }
        if (!types.isNumeric(left.type) || !types.isNumeric(right.type))
            this.badOperands('**', left, right, node);
        var made = new Value(t.double, J.call(J.path('Math.pow'), [this.convertReal(left, t.double).node,
                                                                    this.convertReal(right, t.double).node]));
        made.mayOverflow = true;
        return made;
    };

    // Concatenation of strings and characters.
    Compiler.prototype.concat = function (left, right, node) {
        var leftText = this.stringValue(left, node), rightText = this.stringValue(right, node);
        if (leftText.isConstant() && rightText.isConstant())
            return this.constValue(t.ansistring, leftText.constant + rightText.constant);
        var bothShort = (leftText.type.short !== null && leftText.type.short !== undefined) &&
            (rightText.type.short !== null && rightText.type.short !== undefined);
        var type = bothShort ? t.shortstring : t.ansistring;
        return new Value(type, J.bin('+', leftText.node, rightText.node));
    };

    // --- Comparisons

    Compiler.prototype.compare = function (op, left, right, node) {
        var lt = left.type, rt = right.type;
        var jsOp = COMPARISON[op];
        if (left.isConstant() && right.isConstant() && left.type.kind !== 'nil')
            return this.foldCompare(op, left, right, node);
        if (lt.kind === 'int' && rt.kind === 'int') {
            if (left.wide || right.wide || !types.isSafeRange(left.range || types.range(lt)) || !types.isSafeRange(right.range || types.range(rt))) {
                var unsigned = lt.ik === 'u64' && rt.ik === 'u64';
                var cmpOp = op === '=' ? '==' : (op === '<>' ? '!=' : op);
                return new Value(t.boolean, ops.binary(unsigned ? 'u64' : 'i64', cmpOp, this.hybrid(left, unsigned),
                                                        this.hybrid(right, unsigned), this.opsContext()));
            }
            return new Value(t.boolean, J.bin(jsOp, left.node, right.node));
        }
        if (types.isNumeric(lt) && types.isNumeric(rt)) {
            var type = realResultType(lt, rt, op);
            return new Value(t.boolean, J.bin(jsOp, this.convertReal(left, type).node, this.convertReal(right, type).node));
        }
        if (types.isStringLike(lt) && types.isStringLike(rt)) {
            if (lt.kind === 'char' && rt.kind === 'char')
                return new Value(t.boolean, J.bin(jsOp, left.node, right.node));
            // A string of one constant character and a character.
            if (lt.kind === 'char' && right.isConstant() && right.constant.length === 1)
                return new Value(t.boolean, J.bin(jsOp, left.node, J.num(right.constant.charCodeAt(0))));
            if (rt.kind === 'char' && left.isConstant() && left.constant.length === 1)
                return new Value(t.boolean, J.bin(jsOp, J.num(left.constant.charCodeAt(0)), right.node));
            return new Value(t.boolean, J.bin(jsOp, this.stringValue(left, node).node, this.stringValue(right, node).node));
        }
        if (lt.kind === 'bool' && rt.kind === 'bool') {
            if (op === '=' || op === '<>')
                return new Value(t.boolean, J.bin(jsOp, left.node, right.node));
            return new Value(t.boolean, J.bin(jsOp, J.un('+', left.node), J.un('+', right.node)));
        }
        if (lt.kind === 'enum' && rt.kind === 'enum') {
            if (types.base(lt) !== types.base(rt))
                this.badOperands(op, left, right, node);
            return new Value(t.boolean, J.bin(jsOp, left.node, right.node));
        }
        if (op === '=' || op === '<>')
            return this.compareReferences(op, left, right, node);
        this.badOperands(op, left, right, node);
    };

    // Reference equality: pointers, objects, classes, procedures, arrays.
    Compiler.prototype.compareReferences = function (op, left, right, node) {
        var lt = left.type, rt = right.type;
        var negate = op === '<>';
        var nullable = function (type) {
            return types.isNullable(type) || type.kind === 'dynarray';
        };
        if (!nullable(lt) || !nullable(rt))
            this.badOperands(op, left, right, node);
        var result;
        if (lt.kind === 'dynarray' || rt.kind === 'dynarray') {
            if (lt.kind === 'nil' || rt.kind === 'nil') {
                var array = lt.kind === 'nil' ? right : left;
                result = J.bin('===', J.mem(array.node, 'length'), J.num(0));
            } else {
                result = this.rt('sameArray', [left.node, right.node]);
            }
        } else if (lt.kind === 'pointer' && rt.kind === 'pointer' && !(lt.to !== null && types.isAggregate(lt.to)) &&
                   !(rt.to !== null && types.isAggregate(rt.to))) {
            result = this.rt('samePointer', [left.node, right.node]);
        } else if (lt.kind === 'proc' && rt.kind === 'proc' && (lt.ofObject || rt.ofObject)) {
            result = this.rt('sameMethod', [left.node, right.node]);
        } else {
            if (lt.kind === 'class' && rt.kind === 'class' && !types.inherits(lt, rt) && !types.inherits(rt, lt))
                this.badOperands(op, left, right, node);
            result = J.bin('===', this.nullNode(left), this.nullNode(right));
        }
        return new Value(t.boolean, negate ? T.negate(result) : result);
    };

    // nil and undefined are one (JavaScript values).
    Compiler.prototype.nullNode = function (value) {
        return value.node;
    };

    Compiler.prototype.foldCompare = function (op, left, right, node) {
        var leftConstant = left.constant, rightConstant = right.constant;
        var lt = left.type, rt = right.type;
        if (lt.kind === 'char' && rt.kind === 'string')
            leftConstant = String.fromCharCode(leftConstant);
        if (rt.kind === 'char' && lt.kind === 'string')
            rightConstant = String.fromCharCode(rightConstant);
        var order;
        if (lt.kind === 'int' && rt.kind === 'int') {
            order = big.cmp(leftConstant, rightConstant);
        } else if (types.isNumeric(lt) && types.isNumeric(rt)) {
            var leftNumber = lt.kind === 'int' ? big.toFloat(leftConstant) : leftConstant;
            var rightNumber = rt.kind === 'int' ? big.toFloat(rightConstant) : rightConstant;
            order = leftNumber < rightNumber ? -1
                : (leftNumber > rightNumber ? 1 : (leftNumber === rightNumber ? 0 : NaN));
        } else if (typeof leftConstant === 'boolean' && typeof rightConstant === 'boolean') {
            order = (+leftConstant) - (+rightConstant);
        } else if (lt.kind === 'set' && rt.kind === 'set') {
            var leftKey = leftConstant.join(','), rightKey = rightConstant.join(',');
            if (op === '=' || op === '<>')
                return this.constValue(t.boolean, (leftKey === rightKey) === (op === '='));
            var subset = function (part, whole) {
                return part.every(function (element) { return whole.indexOf(element) >= 0; });
            };
            var isSubset = op === '<=' ? subset(leftConstant, rightConstant) : subset(rightConstant, leftConstant);
            return this.constValue(t.boolean, isSubset);
        } else {
            order = leftConstant < rightConstant ? -1 : (leftConstant > rightConstant ? 1 : 0);
        }
        var value;
        switch (op) {
        case '=': value = order === 0; break;
        case '<>': value = order !== 0; break;
        case '<': value = order < 0; break;
        case '>': value = order > 0; break;
        case '<=': value = order <= 0; break;
        case '>=': value = order >= 0; break;
        }
        void node;
        return this.constValue(t.boolean, value);
    };

    // --- Sets

    Compiler.prototype.compileSetLiteral = function (node, expected) {
        var self = this;
        // [1, 2, 3] in place of an open or dynamic array is an array.
        if (expected !== undefined && expected !== null &&
            (expected.kind === 'openarray' || expected.kind === 'dynarray' || expected.kind === 'arrayofconst'))
            return this.arrayLiteral(node, expected);
        var elementType = expected && expected.kind === 'set' ? expected.of : null;
        var values = [];
        var constant = true;
        node.items.forEach(function (item) {
            var lo = self.compileValue(item.lo, elementType || undefined);
            var hi = item.hi !== null ? self.compileValue(item.hi, elementType || undefined) : null;
            if (lo.type.kind === 'string' && lo.isConstant() && lo.constant.length === 1)
                lo = self.charConstant(lo.constant.charCodeAt(0), true);
            if (hi !== null && hi.type.kind === 'string' && hi.isConstant() && hi.constant.length === 1)
                hi = self.charConstant(hi.constant.charCodeAt(0), true);
            if (!types.isOrdinal(lo.type) || (hi !== null && !types.isOrdinal(hi.type)))
                self.error('Ordinal expression expected', item.lo);
            if (elementType === null)
                elementType = lo.type;
            else if (!types.sameOrdinalBase(types.base(elementType), types.base(lo.type)))
                self.incompatible(lo.type, elementType, item.lo);
            if (!lo.isConstant() || (hi !== null && !hi.isConstant()))
                constant = false;
            values.push({ lo: lo, hi: hi });
        });
        var type;
        if (elementType === null) {
            type = expected && expected.kind === 'set' ? expected : t.emptyset;
        } else if (expected && expected.kind === 'set') {
            type = expected;
        } else {
            var base = types.base(elementType);
            var lo = big.toFloat(types.lo(base)), hi = big.toFloat(types.hi(base));
            if (base.kind === 'int') {
                lo = 0;
                hi = 255;
            }
            type = new Pascal.Type('set', { name: null, of: base.kind === 'int' ? Pascal.subrange(t.byte, 0, 255) : base,
                                             lo: Math.max(0, lo), hi: Math.min(255, hi), small: Math.min(255, hi) < 32 });
        }
        if (constant) {
            var elements = [];
            values.forEach(function (item) {
                var from = big.toFloat(Pascal.ordinalOf(item.lo.constant));
                var to = item.hi !== null ? big.toFloat(Pascal.ordinalOf(item.hi.constant)) : from;
                for (var element = from; element <= to; ++element) {
                    if (element < 0 || element > 255)
                        self.error('range check error while evaluating constants (' + element +
                            ' must be between 0 and 255)', node);
                    if (elements.indexOf(element) < 0)
                        elements.push(element);
                }
            });
            elements.sort(function (left, right) { return left - right; });
            var made = this.constValue(type, elements);
            made.setLiteral = true;
            return made;
        }
        var pairs = [];
        values.forEach(function (item) {
            var lo = self.ordinalNode(item.lo);
            pairs.push(lo, item.hi !== null ? self.ordinalNode(item.hi) : lo);
        });
        // Pairs with a repeated expression: the value is computed once.
        var setup = [];
        for (var index = 0; index < pairs.length; index += 2) {
            if (pairs[index] === pairs[index + 1] && !J.isSimple(pairs[index])) {
                var name = this.temp();
                setup.push(J.assign(J.id(name), pairs[index]));
                pairs[index] = J.id(name);
                pairs[index + 1] = J.id(name);
            }
        }
        var built = this.rt('setOf', [J.arr(pairs), J.bool(type.small)]);
        var result = new Value(type, setup.length > 0 ? J.seq(setup.concat([built])) : built);
        result.setLiteral = true;
        return result;
    };

    // An ordinal value as a number (Boolean is 0/1).
    Compiler.prototype.ordinalNode = function (value) {
        if (value.type.kind === 'bool') {
            if (value.isConstant())
                return J.num(value.constant ? 1 : 0);
            return J.un('+', value.node);
        }
        if (value.type.kind === 'int' && (value.wide || !types.isSafeRange(value.range || types.range(value.type))))
            return this.convertInt(value, t.int64).node;
        return value.node;
    };

    Compiler.prototype.setBinary = function (op, left, right, node) {
        var lt = left.type, rt = right.type;
        if (lt.kind !== 'set' || rt.kind !== 'set')
            this.badOperands(op, left, right, node);
        if (lt.of !== null && rt.of !== null && !types.sameOrdinalBase(types.base(lt.of), types.base(rt.of)))
            this.badOperands(op, left, right, node);
        var type = lt.of !== null ? lt : rt;
        if (left.isConstant() && right.isConstant() && op !== '=' && op !== '<>' && op !== '<=' && op !== '>=') {
            var leftElements = left.constant, rightElements = right.constant, result;
            switch (op) {
            case '+': result = leftElements.concat(rightElements.filter(function (element) {
                return leftElements.indexOf(element) < 0;
            })); break;
            case '-': result = leftElements.filter(function (element) {
                return rightElements.indexOf(element) < 0;
            }); break;
            case '*': result = leftElements.filter(function (element) {
                return rightElements.indexOf(element) >= 0;
            }); break;
            case '><': result = leftElements.filter(function (element) {
                return rightElements.indexOf(element) < 0;
            }).concat(rightElements.filter(function (element) { return leftElements.indexOf(element) < 0; })); break;
            default: this.badOperands(op, left, right, node);
            }
            result.sort(function (left, right) { return left - right; });
            return this.constValue(type, result);
        }
        if (left.isConstant() && right.isConstant())
            return this.foldCompare(op, left, right, node);
        // Both are of the same kind (small or large).
        var small = type.small && (lt.of === null || lt.small) && (rt.of === null || rt.small);
        var leftSet = this.setNode(left, small), rightSet = this.setNode(right, small);
        var made;
        if (small) {
            switch (op) {
            case '+': made = J.bin('|', leftSet, rightSet); break;
            case '-': made = J.bin('&', leftSet, J.un('~', rightSet)); break;
            case '*': made = J.bin('&', leftSet, rightSet); break;
            case '><': made = J.bin('^', leftSet, rightSet); break;
            case '=': return new Value(t.boolean, J.bin('===', leftSet, rightSet));
            case '<>': return new Value(t.boolean, J.bin('!==', leftSet, rightSet));
            case '<=': return new Value(t.boolean, J.bin('===', J.bin('&', leftSet, J.un('~', rightSet)), J.num(0)));
            case '>=': return new Value(t.boolean, J.bin('===', J.bin('&', rightSet, J.un('~', leftSet)), J.num(0)));
            default: this.badOperands(op, left, right, node);
            }
            return new Value(small === type.small ? type : this.smallSet(type), made);
        }
        switch (op) {
        case '+': made = this.rt('sunion', [leftSet, rightSet]); break;
        case '-': made = this.rt('sdiff', [leftSet, rightSet]); break;
        case '*': made = this.rt('sinter', [leftSet, rightSet]); break;
        case '><': made = this.rt('sxor', [leftSet, rightSet]); break;
        case '=': return new Value(t.boolean, this.rt('seq', [leftSet, rightSet]));
        case '<>': return new Value(t.boolean, J.not(this.rt('seq', [leftSet, rightSet])));
        case '<=': return new Value(t.boolean, this.rt('sle', [leftSet, rightSet]));
        case '>=': return new Value(t.boolean, this.rt('sle', [rightSet, leftSet]));
        default: this.badOperands(op, left, right, node);
        }
        return new Value(type.small ? this.bigSet(type) : type, made);
    };

    Compiler.prototype.smallSet = function (type) {
        return type;
    };
    Compiler.prototype.bigSet = function (type) {
        return new Pascal.Type('set', { name: null, of: type.of, lo: type.lo, hi: type.hi, small: false });
    };

    // A set of the required kind in the code.
    Compiler.prototype.setNode = function (value, small) {
        var type = value.type;
        if (value.isConstant())
            return this.setConstantNode({ kind: 'set', of: type.of, small: small }, value.constant);
        var isSmall = type.of === null ? true : type.small;
        if (isSmall === small)
            return value.node;
        return small ? this.rt('ssmall', [value.node]) : this.rt('sbig', [value.node]);
    };

    // x in S.
    Compiler.prototype.compileIn = function (node) {
        var element = this.compileValue(node.left);
        if (element.type.kind === 'string' && element.isConstant() && element.constant.length === 1)
            element = this.charConstant(element.constant.charCodeAt(0), true);
        var set = this.compileValue(node.right, element.type.kind !== 'set' ?
            new Pascal.Type('set', { name: null, of: element.type, small: undefined }) : undefined);
        if (set.type.kind !== 'set' || !types.isOrdinal(element.type))
            this.error('Operator is not overloaded: "' + types.display(element.type) + '" in "' + types.display(set.type) + '"', node);
        if (set.type.of !== null && !types.sameOrdinalBase(types.base(set.type.of), types.base(element.type)))
            this.incompatible(element.type, set.type.of, node.left);
        if (set.isConstant() && element.isConstant())
            return this.constValue(t.boolean, set.constant.indexOf(big.toFloat(Pascal.ordinalOf(element.constant))) >= 0);
        var ordinal = this.ordinalNode(element);
        // A constant set: range checks.
        if (set.isConstant()) {
            var elements = set.constant;
            if (elements.length === 0)
                return new Value(t.boolean, J.seq([ordinal, J.bool(false)]));
            var value = J.isSimple(ordinal) ? ordinal : null;
            var setup = null;
            if (value === null) {
                var name = this.temp();
                setup = J.assign(J.id(name), ordinal);
                value = J.id(name);
            }
            var tests = [];
            for (var index = 0; index < elements.length;) {
                var start = elements[index];
                var end = start;
                while (index + 1 < elements.length && elements[index + 1] === end + 1) {
                    ++index;
                    ++end;
                }
                ++index;
                if (start === end)
                    tests.push(J.bin('===', value, J.num(start)));
                else
                    tests.push(J.and(J.bin('>=', value, J.num(start)), J.bin('<=', value, J.num(end))));
            }
            var test = tests.reduce(function (left, right) { return J.or(left, right); });
            if (tests.length > 6) {
                var words = this.setNode(this.constValue({ kind: 'set', of: set.type.of, small: false }, elements), false);
                test = this.rt('sin', [words, value]);
            }
            return new Value(t.boolean, setup !== null ? J.seq([setup, test]) : test);
        }
        var range = element.range || types.range(element.type);
        var small = set.type.of === null || set.type.small;
        if (small) {
            var bit = J.bin('!==', J.bin('&', J.bin('>>>', set.node, ordinal), J.num(1)), J.num(0));
            if (range[0] >= 0 && range[1] < 32)
                return new Value(t.boolean, bit);
            var temp = this.temp();
            var inRange = J.bin('<', J.bin('>>>', J.assign(J.id(temp), ordinal), J.num(0)), J.num(32));
            var bitSet = J.bin('!==', J.bin('&', J.bin('>>>', set.node, J.id(temp)), J.num(1)), J.num(0));
            return new Value(t.boolean, J.and(inRange, bitSet));
        }
        return new Value(t.boolean, this.rt('sin', [set.node, ordinal]));
    };

    // --- is, as

    Compiler.prototype.compileIs = function (node) {
        var object = this.compileValue(node.left);
        var target = this.compileExpr(node.right);
        var classType = this.classOperand(target, node.right);
        if (object.type.kind !== 'class' && object.type.kind !== 'js')
            this.error('class type expected, but got "' + types.display(object.type) + '"', node.left);
        return new Value(t.boolean, this.rt('isA', [object.node, classType]));
    };

    Compiler.prototype.compileAs = function (node) {
        var object = this.compileValue(node.left);
        var target = this.compileExpr(node.right);
        if (target.kind !== 'type' || target.type.kind !== 'class')
            this.error('Class type expected', node.right);
        if (object.type.kind !== 'class')
            this.error('class type expected, but got "' + types.display(object.type) + '"', node.left);
        return new Value(target.type, this.rt('as', [object.node, this.classNode(target.type)]));
    };

    // The class on the right of is: a class name or a class reference.
    Compiler.prototype.classOperand = function (target, node) {
        if (target.kind === 'type') {
            if (target.type.kind !== 'class')
                this.error('Class type expected', node);
            return this.classNode(target.type);
        }
        target = this.toValue(target, node);
        if (target.type.kind !== 'classref')
            this.error('Class type expected', node);
        return target.node;
    };

    // --- JavaScript values (the type JSValue)

    Compiler.prototype.jsBinary = function (op, left, right, node) {
        var lt = left.type, rt = right.type;
        if (lt.kind === 'js' && rt.kind === 'js') {
            if (COMPARISON[op] !== undefined)
                return new Value(t.boolean, this.rt('jcmp', [left.node, right.node, J.str(op)]));
            if (op === '+')
                return new Value(t.js, this.rt('jadd', [left.node, right.node]));
            return this.binaryValues(op, this.fromJs(left, t.double, node), this.fromJs(right, t.double, node), node);
        }
        var other = lt.kind === 'js' ? rt : lt;
        var target = types.isStringLike(other) ? t.ansistring : (other.kind === 'bool' ? t.boolean : (other.kind === 'int' && op !== '/' ? t.int64 : t.double));
        if (other.kind === 'nil' || other.kind === 'class' || other.kind === 'pointer') {
            if (op === '=' || op === '<>') {
                var test = J.bin('==', lt.kind === 'js' ? left.node : right.node, J.nul());
                if (other.kind !== 'nil')
                    test = J.bin('===', left.node, right.node);
                return new Value(t.boolean, op === '=' ? test : J.not(test));
            }
        }
        var leftValue = lt.kind === 'js' ? this.fromJs(left, target, node) : left;
        var rightValue = rt.kind === 'js' ? this.fromJs(right, target, node) : right;
        return this.binaryValues(op, leftValue, rightValue, node);
    };

    // A JavaScript value in a Pascal type.
    Compiler.prototype.fromJs = function (value, to, node) {
        var kind;
        switch (to.kind) {
        case 'int': kind = 'int'; break;
        case 'real': kind = 'real'; break;
        case 'string': kind = 'string'; break;
        case 'char': kind = 'char'; break;
        case 'bool': kind = 'bool'; break;
        case 'class': kind = 'object'; break;
        default:
            this.incompatible(t.js, to, node);
        }
        var converted = this.rt('jto', [value.node, J.str(kind)]);
        if (to.kind === 'int')
            return this.convertInt(new Value(t.int64, converted, { range: types.range(t.int64), wide: true }), to);
        if (to.kind === 'real' && to.rk === 'f32')
            converted = J.call(J.path('Math.fround'), [converted]);
        return new Value(to, converted);
    };

    // A Pascal value in JavaScript.
    Compiler.prototype.toJs = function (value, node) {
        var type = value.type;
        if (type.kind === 'js')
            return value;
        return new Value(t.js, this.jsNode(value, node));
    };

    Compiler.prototype.jsNode = function (value, node) {
        var type = value.type;
        switch (type.kind) {
        case 'int':
            if (value.wide || !types.isSafeRange(value.range || types.range(type)))
                return this.rt('jfromInt64', [value.node]);
            return value.node;
        case 'real':
        case 'bool':
        case 'nil':
            return value.node;
        case 'char':
            return J.call(J.path('String.fromCharCode'), [value.node]);
        case 'string':
            if (value.isConstant())
                return J.str(T.utf8.decode(value.constant));
            return this.rt('toJs', [value.node]);
        case 'enum':
            return value.node;
        case 'class':
        case 'pointer':
        case 'classref':
            return value.node;
        case 'proc':
            return this.rt('jfunction', [value.node, this.typeRef(type)]);
        default:
            return this.rt('jfromValue', [value.node, this.typeRef(type)]);
        }
    };
})(globalThis);
