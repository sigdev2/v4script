// Go: translation of the checked tree into a JavaScript tree - expressions.
//
// The representation of values: integers up to 32 bits and floats are
// numbers, int/int64/uint64 are the hybrid T.i64, strings are UTF-8 bytes,
// slices are rt.Slice (nil is rt.NIL), maps are rt.GoMap or null, structs
// are objects of their own class, arrays are JavaScript arrays, a pointer
// to a struct or an array is the object itself, to anything else a cell
// (.v), an interface is null, a struct object (a pointer) or a box with
// the field v and the description $t.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Go = T.go;
    if (Go.Generator)
        return;

    var J = T.J;
    var G = Go.T;
    var types = Go.types;
    var ops = T.ops;
    var big = T.big;
    var desc = Go.desc;

    function Generator(checker) {
        this.checker = checker;
        this.session = checker.session;
        this.pkg = checker.pkg;
        this.source = checker.source;
        this.constants = [];
        this.constantIndex = new Map();
        this.fn = null;
        this.labelCounter = 0;
        this.asyncPossible = false;
    }
    Go.Generator = Generator;

    // --- Constants of the code: values, descriptions, package objects

    Generator.prototype.constant = function (value) {
        var index = this.constantIndex.get(value);
        if (index === undefined) {
            index = this.constants.length;
            this.constants.push(value);
            this.constantIndex.set(value, index);
        }
        return J.idx(J.id('$D'), J.num(index));
    };

    Generator.prototype.descOf = function (type) {
        return this.constant(desc(type));
    };

    Generator.prototype.pkgRef = function (pkg) {
        if (pkg === this.pkg)
            return J.id('$m');
        return this.constant(pkg.runtime);
    };

    Generator.prototype.rt = function (name) {
        return J.mem(J.id('$go'), name);
    };

    Generator.prototype.rtCall = function (name, args) {
        return J.call(this.rt(name), args);
    };

    Generator.prototype.temp = function () {
        return J.id(this.fn.scope.temp());
    };

    // The context for T.ops.
    Generator.prototype.opsContext = function () {
        var self = this;
        if (this.fn.opsContext === undefined) {
            this.fn.opsContext = {
                temp: function () { return self.fn.scope.temp(); },
                helper: function (name) { return J.mem(J.id('$T'), name); },
                divideByZero: J.call(self.rt('divideByZero'), [])
            };
        }
        return this.fn.opsContext;
    };

    Generator.prototype.at = function (node, statement) {
        return J.at(statement, node.line);
    };

    // The value of a constant in the representation of its type.
    Generator.prototype.constantValue = function (value, type) {
        if (typeof value === 'boolean')
            return J.bool(value);
        if (typeof value === 'string')
            return J.str(value);
        var kind = G.numKind(type);
        if (kind === 'f64' || kind === 'f32') {
            var number = T.rat.is(value) ? T.rat.toFloat(value) : (typeof value === 'number' ? value : big.toFloat(value));
            return J.num(kind === 'f32' ? Math.fround(number) : number);
        }
        if (kind === 'i64' || kind === 'u64') {
            if (typeof value === 'number')
                return J.num(value);
            if (big.cmp(value, -9007199254740991) >= 0 && big.cmp(value, 9007199254740991) <= 0)
                return J.num(big.toFloat(value));
            return this.constant(T.bigToI64(value, kind === 'i64'));
        }
        return J.num(typeof value === 'number' ? value : big.toFloat(value));
    };

    // The zero value of a type.
    Generator.prototype.zero = function (type) {
        var underlyingType = G.underlying(type);
        switch (underlyingType.kind) {
        case 'basic':
            if (underlyingType.info === 'bool')
                return J.bool(false);
            if (underlyingType.info === 'string')
                return J.str('');
            return J.num(0);
        case 'slice':
            return this.rt('NIL');
        case 'struct':
        case 'array':
            return J.method(this.descOf(type), 'zero', []);
        }
        return J.nul();
    };

    // The zero value to keep in a slice/map: a primitive or a function.
    Generator.prototype.zeroFiller = function (type) {
        var underlyingType = G.underlying(type);
        if (underlyingType.kind === 'struct' || underlyingType.kind === 'array')
            return J.mem(this.descOf(type), 'zero');
        return this.zero(type);
    };

    // --- Copies and interfaces

    // The expression gives a new value (no copy is needed when storing it).
    function isFresh(node) {
        while (node.k === 'paren')
            node = node.x;
        switch (node.k) {
        case 'composite':
        case 'binary':
        case 'funclit':
            return true;
        case 'call':
            if (node.callKind === 'conversion')
                return isFresh(node.args[0]);
            return true;
        case 'unary':
            return true;
        }
        return node.mode === 'const';
    }
    Go.isFresh = isFresh;

    function needsCopy(type) {
        var underlyingType = G.underlying(type);
        return underlyingType.kind === 'struct' || underlyingType.kind === 'array';
    }

    Generator.prototype.copyOf = function (js, type) {
        var underlyingType = G.underlying(type);
        if (underlyingType.kind === 'struct')
            return J.method(js, '$copy', []);
        if (underlyingType.kind === 'array')
            return J.method(this.descOf(type), 'copy', [js]);
        return js;
    };

    // The value node to store in a place of the type target: a box for an
    // interface, a copy of a struct or an array.
    Generator.prototype.valueFor = function (node, target) {
        var js = this.expr(node);
        return this.convertFor(js, node.type, target, isFresh(node), node);
    };

    Generator.prototype.convertFor = function (js, from, target, fresh, node) {
        if (target === undefined || target === null)
            return js;
        if (from === types.untypedNil)
            return this.nilOf(target);
        if (G.isInterface(target) && !G.isTypeParam(target) && !G.isInterface(from))
            return this.box(js, from, fresh, node);
        if (needsCopy(from) && !fresh)
            return this.copyOf(js, from);
        return js;
    };

    Generator.prototype.nilOf = function (type) {
        return G.underlying(type).kind === 'slice' ? this.rt('NIL') : J.nul();
    };

    // A value of a concrete type in an interface.
    Generator.prototype.box = function (js, type, fresh, node) {
        if (G.isUntyped(type))
            type = G.defaultType(type);
        var underlyingType = G.underlying(type);
        var descriptor = this.descOf(type);
        if (underlyingType.kind === 'pointer' && G.underlying(underlyingType.elem).kind === 'struct') {
            // A pointer to a struct is the object itself (nil is a box with nil).
            if (node && (node.k === 'unary' && node.op === '&'))
                return js;
            var value = ops.stable(js, this.opsContext());
            var check = J.cond(J.bin('!==', value[1], J.nul()), value[1], J.new_(J.mem(descriptor, 'box'), [J.nul()]));
            return value[0] === null ? check : J.seq([value[0], check]);
        }
        if ((underlyingType.kind === 'struct' || underlyingType.kind === 'array') && !fresh)
            js = this.copyOf(js, type);
        return J.new_(J.mem(descriptor, 'box'), [js]);
    };

    // --- Expressions

    Generator.prototype.expr = function (node) {
        if (node.mode === 'const' && node.value !== undefined)
            return this.constantValue(node.value, node.type);
        switch (node.k) {
        case 'ident':
            return this.identifier(node);
        case 'paren':
            return this.expr(node.x);
        case 'funclit':
            return this.funcLiteral(node);
        case 'composite':
            return this.composite(node);
        case 'sel':
            return this.selector(node);
        case 'index':
            return this.index(node);
        case 'slice':
            return this.sliceExpr(node);
        case 'assert':
            return J.call(this.rt('assert'), [this.expr(node.x), this.descOf(node.assertType),
                                                J.str(G.typeString(node.x.type))]);
        case 'call':
            return this.call(node);
        case 'star':
            return this.deref(node);
        case 'unary':
            return this.unary(node);
        case 'binary':
            return this.binary(node);
        }
        throw new T.CompileError('cannot translate ' + node.k, node.line, node.column, this.source);
    };

    Generator.prototype.identifier = function (node) {
        var object = node.obj;
        switch (object.kind) {
        case 'var':
            if (object.global)
                return J.mem(this.pkgRef(object.pkg), object.jsName);
            if (object.boxed)
                return J.mem(J.id(object.jsName), 'v');
            return J.id(object.jsName);
        case 'func':
            return J.mem(this.pkgRef(object.pkg), object.jsName);
        case 'nil':
            return this.nilOf(node.type);
        case 'const':
            return this.constantValue(object.value, node.type);
        }
        throw new T.CompileError('cannot use ' + node.name + ' as value', node.line, node.column, this.source);
    };

    // The address of a variable, a field, an element: a Go pointer.
    Generator.prototype.addressOf = function (node) {
        while (node.k === 'paren')
            node = node.x;
        var underlyingType = G.underlying(node.type);
        if (underlyingType.kind === 'struct' || underlyingType.kind === 'array')
            return this.expr(node);
        switch (node.k) {
        case 'ident': {
            var object = node.obj;
            if (object.global)
                return J.call(this.rt('fieldRef'), [this.pkgRef(object.pkg), J.str(object.jsName)]);
            return J.id(object.jsName);
        }
        case 'sel':
            if (node.selKind === 'qualified')
                return J.call(this.rt('fieldRef'), [this.pkgRef(node.pkg), J.str(node.obj.jsName)]);
            return J.call(this.rt('fieldRef'), [this.fieldObject(node), J.str(T.propertyName(node.field.name))]);
        case 'index': {
            var place = this.indexPlace(node);
            return J.call(this.rt('elemRef'), [place.array, place.index]);
        }
        case 'star':
            return this.expr(node.x);
        }
        throw new T.CompileError('cannot take address of ' + Go.exprString(node), node.line, node.column, this.source);
    };

    // --- Function literals

    Generator.prototype.funcLiteral = function (node) {
        return this.functionNode(node.info, null, node.body, null);
    };

    // --- Composite literals

    Generator.prototype.composite = function (node) {
        var type = node.litType;
        var underlyingType = G.underlying(type);
        var self = this;
        var result;
        switch (underlyingType.kind) {
        case 'struct': {
            var values = underlyingType.fields.map(function (field) { return self.zero(field.type); });
            node.elements.forEach(function (element) {
                var field = underlyingType.fields[element.fieldIndex];
                values[element.fieldIndex] = self.valueFor(element.value, field.type);
            });
            result = J.new_(J.mem(this.descOf(type), 'ctor'), values);
            break;
        }
        case 'array':
        case 'slice': {
            var length = node.length;
            var items = [];
            var sparse = false;
            node.elements.forEach(function (element) {
                if (element.index !== items.length)
                    sparse = true;
            });
            if (!sparse && length === node.elements.length) {
                items = node.elements.map(function (element) {
                    return self.valueFor(element.value, underlyingType.elem);
                });
                result = J.arr(items);
            } else {
                // Gaps get zero values.
                var temp = this.temp();
                var filler = needsCopy(underlyingType.elem)
                    ? J.call(J.mem(this.descOf(underlyingType.elem), 'zero'), [])
                    : this.zero(underlyingType.elem);
                var list = [J.assign(temp, J.new_(J.id('Array'), [J.num(length)]))];
                for (var index = 0; index < length; ++index)
                    list.push(J.assign(J.idx(temp, J.num(index)), filler));
                node.elements.forEach(function (element) {
                    list.push(J.assign(J.idx(temp, J.num(element.index)),
                                       self.valueFor(element.value, underlyingType.elem)));
                });
                list.push(temp);
                result = J.seq(list);
            }
            if (underlyingType.kind === 'slice')
                result = J.call(this.rt('slice'), [result]);
            break;
        }
        case 'map': {
            var mapDesc = desc(type);
            var map = this.temp();
            var steps = [J.assign(map, J.call(this.rt('makeMap'), [mapDesc.keyFn === null ? J.nul() : this.constant(mapDesc.keyFn)]))];
            node.elements.forEach(function (element) {
                steps.push(J.call(self.rt('mapSet'), [map, self.valueFor(element.key, underlyingType.key), self.valueFor(element.value, underlyingType.elem)]));
            });
            steps.push(map);
            result = J.seq(steps);
            break;
        }
        }
        return result;
    };

    // --- Selection of a field and a method

    // The object that holds the field node (promoted through embedded fields).
    Generator.prototype.fieldObject = function (node) {
        var object = this.expr(node.x);
        var type = G.underlying(node.x.type);
        if (type.kind === 'pointer')
            type = G.underlying(type.elem);
        var path = node.lookup.path;
        for (var index = 0; index < path.length - 1; ++index) {
            var field = type.fields[path[index]];
            object = J.mem(object, T.propertyName(field.name));
            type = G.underlying(field.type.kind === 'pointer' ? field.type.elem : field.type);
        }
        return object;
    };

    // The receiver of a promoted method: the value along the path of embedded fields.
    Generator.prototype.receiverPath = function (node) {
        var object = this.expr(node.x);
        var type = node.x.type;
        var path = node.lookup.path;
        for (var index = 0; index < path.length; ++index) {
            var underlyingType = G.underlying(type);
            if (underlyingType.kind === 'pointer')
                underlyingType = G.underlying(underlyingType.elem);
            var field = underlyingType.fields[path[index]];
            object = J.mem(object, T.propertyName(field.name));
            type = field.type;
        }
        return { js: object, type: type, node: path.length === 0 ? node.x : null };
    };

    Generator.prototype.selector = function (node) {
        switch (node.selKind) {
        case 'qualified': {
            var object = node.obj;
            if (object.kind === 'var' || object.kind === 'func')
                return J.mem(this.pkgRef(node.pkg), object.jsName);
            if (object.kind === 'const')
                return this.constantValue(object.value, node.type);
            break;
        }
        case 'field':
            return J.mem(this.fieldObject(node), T.propertyName(node.field.name));
        case 'method':
            return this.methodValue(node);
        case 'methodexpr':
            return this.methodExpression(node);
        }
        throw new T.CompileError('cannot translate selector ' + Go.exprString(node), node.line, node.column, this.source);
    };

    // x.M without a call: a function with the receiver bound (evaluated now).
    Generator.prototype.methodValue = function (node) {
        var method = node.method;
        var name = T.propertyName(node.name);
        if (node.interfaceMethod)
            return J.call(this.rt('bindMethod'), [this.receiverPath(node).js, J.str(name)]);
        var receiver = this.methodReceiver(node, method);
        var owner = method.recv;
        if (G.underlying(owner).kind === 'struct') {
            var value = method.pointerReceiver ? receiver : this.copyOf(receiver, owner);
            return J.call(this.rt('bindMethod'), [value, J.str(name)]);
        }
        return J.call(this.rt('bindStatic'), [J.mem(J.mem(this.descOf(owner), 'methods'), name), receiver]);
    };

    Generator.prototype.methodExpression = function (node) {
        var method = node.method;
        var name = T.propertyName(node.name);
        var owner = method.recv;
        if (owner === undefined)
            return J.call(this.rt('methodOfInterface'), [J.str(name)]);
        if (G.underlying(owner).kind === 'struct')
            return J.call(this.rt('methodOfStruct'), [J.str(name), J.bool(node.x.type.kind !== 'pointer' && !method.pointerReceiver)]);
        return J.call(this.rt('methodOfValue'), [J.mem(J.mem(this.descOf(owner), 'methods'), name),
                                                 J.bool(node.x.type.kind === 'pointer' && !method.pointerReceiver)]);
    };

    // The receiver for a method call: a pointer or a value, as the method
    // needs.
    Generator.prototype.methodReceiver = function (node, method) {
        var path = this.receiverPath(node);
        var owner = method.recv;
        var isStruct = G.underlying(owner).kind === 'struct';
        var receiverIsPointer = G.underlying(path.type).kind === 'pointer';
        if (isStruct)
            return path.js;
        if (method.pointerReceiver) {
            if (receiverIsPointer)
                return path.js;
            if (path.node !== null)
                return this.addressOf(path.node);
            return J.call(this.rt('fieldRef'), [path.js.object, J.str(path.js.name)]);
        }
        if (receiverIsPointer)
            return J.mem(path.js, 'v');
        return path.js;
    };

    // --- Indices

    // The array and the element number (bounds checked) for a[i], s[i].
    Generator.prototype.indexPlace = function (node) {
        var ctx = this.opsContext();
        var container = this.expr(node.x);
        var indexJs = this.expr(node.index);
        var indexConst = node.index.mode === 'const';
        if (node.indexKind === 'array') {
            var length = G.underlying(node.derefArray ? G.underlying(node.x.type).elem : node.x.type).length;
            if (indexConst)
                return { array: container, index: indexJs, setup: null };
            var array = ops.stable(container, ctx);
            var stableIndex = ops.stable(indexJs, ctx);
            var inBounds = J.and(J.bin('>=', stableIndex[1], J.num(0)), J.bin('<', stableIndex[1], J.num(length)));
            var checked = J.cond(inBounds, stableIndex[1], J.call(this.rt('oob'), [stableIndex[1], J.num(length)]));
            return { array: array[1], index: checked, setup: [array[0], stableIndex[0]] };
        }
        // A slice: s.a[s.o + i]
        var slice = ops.stable(container, ctx);
        var position = ops.stable(indexJs, ctx);
        var length2 = J.mem(slice[1], 'n');
        var test = indexConst ? J.bin('<', position[1], length2)
                              : J.and(J.bin('>=', position[1], J.num(0)), J.bin('<', position[1], length2));
        var offset = J.cond(test, J.bin('+', J.mem(slice[1], 'o'), position[1]),
                            J.call(this.rt('oob'), [position[1], length2]));
        return { array: J.mem(slice[1], 'a'), index: offset, setup: [slice[0], position[0]] };
    };

    function withSetup(setup, node) {
        var list = (setup || []).filter(function (item) { return item !== null; });
        if (list.length === 0)
            return node;
        return J.seq(list.concat([node]));
    }

    Generator.prototype.index = function (node) {
        if (node.instance)
            return J.mem(this.pkgRef(node.instance.pkg), node.instance.jsName);
        switch (node.indexKind) {
        case 'string':
            return J.call(this.rt('stringIndex'), [this.expr(node.x), this.expr(node.index)]);
        case 'map': {
            var mapType = G.underlying(node.x.type);
            return J.call(this.rt('mapGet'), [this.expr(node.x), this.valueFor(node.index, mapType.key),
                                              this.zeroFiller(mapType.elem)]);
        }
        }
        var place = this.indexPlace(node);
        return withSetup(place.setup, J.idx(place.array, place.index));
    };

    Generator.prototype.sliceExpr = function (node) {
        var self = this;
        var bounds = [node.low, node.high, node.max].map(function (item) {
            return item === null ? J.undef() : self.expr(item);
        });
        while (bounds.length > 0 && bounds[bounds.length - 1].k === 'undef')
            bounds.pop();
        switch (node.sliceKind) {
        case 'string':
            return J.call(this.rt('sliceString'), [this.expr(node.x)].concat(bounds));
        case 'array':
            return J.call(this.rt('sliceArray'), [this.expr(node.x)].concat(bounds));
        }
        return J.call(this.rt('reslice'), [this.expr(node.x)].concat(bounds));
    };

    // --- Pointers

    Generator.prototype.deref = function (node) {
        var pointer = this.expr(node.x);
        var underlyingType = G.underlying(node.type);
        if (underlyingType.kind === 'struct' || underlyingType.kind === 'array')
            return J.call(this.rt('nilPointerCheck'), [pointer]);
        return J.mem(pointer, 'v');
    };

    // --- Operations

    Generator.prototype.unary = function (node) {
        var ctx = this.opsContext();
        switch (node.op) {
        case '&':
            if (node.compositeAddress) {
                var inner = node.x;
                while (inner.k === 'paren')
                    inner = inner.x;
                var underlyingType = G.underlying(inner.type);
                var value = this.expr(inner);
                if (underlyingType.kind === 'struct' || underlyingType.kind === 'array')
                    return value;
                return J.new_(this.rt('Cell'), [value]);
            }
            return this.addressOf(node.x);
        case '<-':
            return this.receive(node, false);
        case '!':
            return J.not(this.expr(node.x));
        case '+':
            return this.expr(node.x);
        case '-':
        case '^': {
            var kind = G.numKind(node.type);
            return ops.unary(kind, node.op === '^' ? '^' : '-', this.expr(node.x), ctx);
        }
        }
        throw new T.CompileError('unknown operator ' + node.op, node.line, node.column, this.source);
    };

    // <-ch: the value (or [value, ok]).
    Generator.prototype.receive = function (node, commaOk) {
        var channel = this.expr(node.x);
        var elem = G.underlying(node.x.type).elem;
        var call = J.call(this.rt(commaOk ? 'recv2' : 'recv'), [channel, this.zeroFiller(elem)]);
        return this.await(call, true);
    };

    // A call of a generator function from Go code: yield* in a fiber,
    // otherwise it runs at once.
    Generator.prototype.await = function (call) {
        if (this.fn.async)
            return J.yield_(call, true);
        return J.call(this.rt('sync'), [call]);
    };

    Generator.prototype.binary = function (node) {
        var op = node.op;
        var ctx = this.opsContext();
        if (op === '&&' || op === '||')
            return J.bin(op, this.expr(node.x), this.expr(node.y));
        if (op === '==' || op === '!=' || op === '<' || op === '<=' || op === '>' || op === '>=')
            return this.comparison(node);
        var type = node.type;
        if (G.isString(type))
            return J.bin('+', this.expr(node.x), this.expr(node.y));
        var kind = G.numKind(type);
        if (op === '<<' || op === '>>') {
            var count = this.expr(node.y);
            if (node.y.mode !== 'const')
                count = J.call(this.rt('shiftCount'), [count]);
            else
                count = J.num(Math.min(1000, big.toFloat(node.y.value)));
            return ops.binary(kind, op, this.expr(node.x), count, ctx);
        }
        return ops.binary(kind, op, this.expr(node.x), this.expr(node.y), ctx);
    };

    Generator.prototype.comparison = function (node) {
        var op = node.op;
        var type = node.compareType;
        var negate = op === '!=';
        var ctx = this.opsContext();
        if (node.nilCompare) {
            var other = node.x.type === types.untypedNil || node.x.k === 'ident' && node.x.obj && node.x.obj.kind === 'nil'
                ? node.y : node.x;
            var value = this.expr(other);
            var underlyingType = G.underlying(other.type);
            var test = underlyingType.kind === 'slice'
                ? J.bin('===', J.mem(value, 'a'), J.nul())
                : J.bin('===', value, J.nul());
            return negate ? J.not(test) : test;
        }
        var left = this.valueFor(node.x, type);
        var right = this.valueFor(node.y, type);
        var tu = G.underlying(type);
        if (op !== '==' && op !== '!=') {
            if (G.isString(type))
                return J.bin(op, left, right);
            return ops.binary(G.numKind(type), op, left, right, ctx);
        }
        var equal;
        switch (tu.kind) {
        case 'basic': {
            var kind = G.numKind(type);
            if (kind !== null)
                return ops.binary(kind, op, left, right, ctx);
            return J.bin(negate ? '!==' : '===', left, right);
        }
        case 'interface':
            equal = J.call(this.rt('ifaceEqual'), [left, right]);
            break;
        case 'struct':
            equal = J.method(left, '$eq', [right]);
            break;
        case 'array':
            equal = J.call(this.rt('equal'), [this.descOf(type), left, right]);
            break;
        case 'pointer': {
            var elem = G.underlying(tu.elem);
            if (elem.kind === 'struct' || elem.kind === 'array')
                return J.bin(negate ? '!==' : '===', left, right);
            equal = J.call(this.rt('pointerEqual'), [left, right]);
            break;
        }
        default:
            return J.bin(negate ? '!==' : '===', left, right);
        }
        return negate ? J.not(equal) : equal;
    };

    Go.Generator = Generator;
})(globalThis);
