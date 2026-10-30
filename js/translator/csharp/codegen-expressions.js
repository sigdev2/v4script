// C#: translation of bound expressions into JavaScript - literals,
// variables (ref parameters as references), member access, calls,
// arithmetic with the overflow and division rules of C#, conversions and
// boxing, strings, delegates and lambdas, object creation, arrays.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    var G = CS.Generator.prototype;
    if (G.expression)
        return;

    var J = T.J;
    var big = T.big;
    var MAX = 9007199254740991;

    G.expression = function (expr) {
        var method = this['expr_' + expr.k];
        if (method === undefined)
            throw new Error('C# codegen: unknown expression ' + expr.k);
        if (expr.constant !== undefined && expr.k !== 'conversion' || (expr.k === 'conversion' && expr.constant !== undefined &&
                                                                      typeof expr.constant === 'string'))
            return this.literalValue(expr.constant, expr.type);
        return method.call(this, expr);
    };

    G.expr_literal = function (expr) {
        return this.literalValue(expr.constant, expr.type);
    };

    // An expression whose value is not used.
    G.effect = function (expr) {
        switch (expr.k) {
        case 'assign':
            return this.assignment(expr, false);
        case 'increment':
            return this.incrementCode(expr, false);
        case 'compoundAssign':
            return this.compoundCode(expr, false);
        }
        return this.expression(expr);
    };

    // A constant of a type.
    G.literalValue = function (value, type) {
        if (value === null || value === undefined)
            return J.nul();
        if (typeof value === 'boolean')
            return J.bool(value);
        if (typeof value === 'string')
            return J.str(value);
        if (CS.decimal.is(value))
            return this.constant(value);
        var kind = type !== undefined ? this.numericKind(type) : null;
        if (kind === 'decimal')
            return this.constant(CS.decimal.is(value) ? value : CS.decimal.fromInteger(value));
        if (kind === 'f32' || kind === 'f64') {
            var number = typeof value === 'number' ? value : big.toFloat(value);
            if (number === 0 && 1 / number < 0)
                return J.un('-', J.num(0));
            return number < 0 ? J.un('-', J.num(-number)) : J.num(number);
        }
        if (typeof value === 'number') {
            if (value < 0)
                return J.un('-', J.num(-value));
            return J.num(value);
        }
        // A T.big integer: a number if it is exact, an Int64 otherwise.
        var exact = big.toFloat(value);
        if (Math.abs(exact) <= MAX && typeof value === 'number')
            return exact < 0 ? J.un('-', J.num(-exact)) : J.num(exact);
        if (typeof value === 'number')
            return J.num(value);
        return this.constant(T.bigToI64(value, kind !== 'u64'));
    };

    // --- Placeholders of the checker

    G.expr_placeholder = function (expr) {
        if (expr.value !== undefined)
            return expr.value;
        throw new Error('C# codegen: unbound placeholder');
    };

    // A value the code put into a place first (object initializers,
    // compound assignments, ?.).
    G.withPlaceholder = function (key, value, callback) {
        var saved = this.placeholders && this.placeholders[key];
        this.placeholders = this.placeholders || Object.create(null);
        this.placeholders[key] = value;
        try {
            return callback();
        } finally {
            this.placeholders[key] = saved;
        }
    };

    G.expr_initTarget = function () {
        return this.placeholders.initTarget;
    };

    G.expr_compoundTarget = function () {
        return this.placeholders.compoundTarget;
    };

    G.expr_receiverValue = function () {
        return this.placeholders.receiverValue;
    };

    G.expr_tupleItem = function (expr) {
        return J.mem(this.placeholders[expr.side + 'Tuple'], 'Item' + (expr.index + 1));
    };

    // --- Variables

    G.expr_local = function (expr) {
        var local = expr.sym;
        var name = J.id(this.localName(local));
        // in parameters are passed by value.
        if (local.refKind === 'ref' || local.refKind === 'out' || local.refKind === 'ref readonly')
            return J.mem(name, 'v');
        return name;
    };

    G.expr_this = function (expr) {
        return this.thisRef();
    };

    G.expr_base = function () {
        return this.thisRef();
    };

    G.expr_discard = function () {
        return J.undef();
    };

    // The holder of a static member: the type (constructed for generic types).
    G.staticHolder = function (ownerType, member) {
        if (ownerType === null || ownerType === undefined)
            return this.typeSymRef(member.owner);
        if (ownerType.kind === 'named' && ownerType.args.length > 0)
            return this.typeRef(ownerType);
        return this.typeSymRef(ownerType.kind === 'named' ? ownerType.sym : member.owner);
    };

    G.expr_field = function (expr) {
        var field = expr.field;
        if (field.isStatic)
            return J.mem(this.staticHolder(expr.ownerType, field), field.jsName);
        return J.mem(this.receiver(expr.receiver), field.jsName);
    };

    // The receiver of a member: struct values stay the variables they are.
    G.receiver = function (receiver) {
        if (receiver === null)
            return this.thisRef();
        if (receiver.k === 'base')
            return this.thisRef();
        return this.expression(receiver);
    };

    // --- Properties

    // A property read: the backing field of a non-virtual auto-property,
    // otherwise the getter.
    G.expr_property = function (expr) {
        var property = expr.property;
        var intrinsic = this.propertyIntrinsic(expr);
        if (intrinsic !== null)
            return intrinsic;
        if (expr.fromEnd !== undefined)
            return this.fromEndIndexer(expr);
        if (this.isDirectProperty(expr))
            return J.mem(property.isStatic ? this.staticHolder(expr.ownerType, property) : this.receiver(expr.receiver),
                         property.backingField.jsName);
        var getter = CS.findGetter(property);
        var self = this;
        var args = expr.args.map(function (arg) { return self.argument(arg); });
        if (expr.isBase)
            return J.call(J.mem(J.mem(this.baseProto(getter), getter.jsName), 'call'), [this.thisRef()].concat(args));
        if (property.isStatic)
            return this.staticCall(expr.ownerType, getter, args, expr.typeParam);
        return this.instanceCall(expr.receiver, getter, args, expr.ownerType);
    };

    // An auto-property that nothing can override: its field directly.
    G.isDirectProperty = function (expr) {
        var property = expr.property;
        if (!property.isAuto || property.backingField === null)
            return false;
        if (property.isVirtual || property.isAbstract || property.isOverride || property.owner.kind === 'interface')
            return false;
        if (expr.receiver !== null && expr.receiver.type !== undefined && expr.receiver.type.kind === 'tparam')
            return false;
        return true;
    };

    // ^i on a list: list[list.Count - i].
    G.fromEndIndexer = function (expr) {
        var receiver = this.stable(this.receiver(expr.receiver));
        var count = this.memberRead(receiver.ref, expr.countMember, expr.receiver.type);
        var index = J.call(this.rt('fromEndIndex'), [this.expression(expr.fromEnd), count]);
        var getter = CS.findGetter(expr.property);
        return this.withSetup(receiver.setup, J.call(J.mem(receiver.ref, getter.jsName), [index]));
    };

    // A read of a property or field found by lookup on an expression.
    G.memberRead = function (receiver, entry, type) {
        var member = entry.member;
        if (member.symbolKind === 'field')
            return J.mem(receiver, member.jsName);
        if (CS.isSpecial(type, 'string') && member.name === 'Length')
            return J.mem(receiver, 'length');
        if (type.kind === 'array' && member.name === 'Length')
            return J.call(this.rt('arrayLength'), [receiver]);
        var getter = CS.findGetter(member);
        if (member.isAuto && !member.isVirtual && !member.isAbstract && !member.isOverride && member.owner.kind !== 'interface')
            return J.mem(receiver, member.backingField.jsName);
        return J.call(J.mem(receiver, getter.jsName), []);
    };

    // base.M: the member as the base class of the current type has it (an
    // override there counts).
    G.baseProto = function (member) {
        var context = this.methodContext();
        var sym = context !== null ? context.typeSym : null;
        if (sym === null || sym === undefined || sym.baseType === null)
            return J.mem(this.typeSymRef(member.owner), 'prototype');
        return J.mem(this.typeSymRef(sym.baseType.sym), 'prototype');
    };

    // Fast paths: string.Length, array.Length, Nullable.HasValue and Value.
    G.propertyIntrinsic = function (expr) {
        var property = expr.property;
        var owner = property.owner.qname;
        if (owner === 'System.String' && property.name === 'Length' && !property.isStatic)
            return J.mem(this.receiver(expr.receiver), 'length');
        if (owner === 'System.Array' && property.name === 'Length' && expr.receiver !== null &&
            expr.receiver.type.kind === 'array' && expr.receiver.type.rank === 1)
            return J.mem(this.receiver(expr.receiver), 'length');
        if (owner === 'System.Nullable' && property.name === 'HasValue')
            return J.bin('!==', this.receiver(expr.receiver), J.nul());
        if (owner === 'System.Nullable' && property.name === 'Value')
            return J.call(this.rt('nullableValue'), [this.receiver(expr.receiver)]);
        return null;
    };

    // --- Calls

    G.expr_call = function (expr) {
        var method = expr.method;
        var intrinsic = this.callIntrinsic(expr);
        if (intrinsic !== null)
            return intrinsic;
        var args = this.callArguments(expr);
        var call;
        if (expr.localFunction || method.isLocal) {
            call = J.call(J.id(this.localName(method.local)), this.typeArgumentValues(expr).concat(args));
            return this.fiberCall(call, method);
        }
        if (expr.extension || method.isStatic) {
            call = this.staticCall(expr.ownerType, method, this.typeArgumentValues(expr).concat(args), expr.typeParam);
        } else if (expr.isBase) {
            var target = J.mem(this.baseProto(method), method.jsName);
            call = J.call(J.mem(target, 'call'), [this.thisRef()].concat(this.typeArgumentValues(expr), args));
        } else {
            call = this.instanceCall(expr.receiver, method, this.typeArgumentValues(expr).concat(args), expr.ownerType);
        }
        return this.fiberCall(call, method);
    };

    // The type arguments of a generic method as values.
    G.typeArgumentValues = function (expr) {
        var self = this;
        if (expr.method.typeParams.length === 0)
            return [];
        return expr.typeArgs.map(function (type) { return self.typeRef(type); });
    };

    // A static method: Owner.M(args); a generic owner is this of the call.
    G.staticCall = function (ownerType, method, args, typeParam) {
        var holder = this.typeSymRef(method.owner);
        // T.M(): the member of the type argument (or the default of the interface).
        if (typeParam !== null && typeParam !== undefined)
            return J.call(this.rt('callStatic'), [this.typeRef(typeParam), J.str(method.jsName), this.typeRef(ownerType), J.arr(args)]);
        if (ownerType !== null && ownerType !== undefined && ownerType.kind === 'named' && ownerType.args.length > 0 &&
            method.owner.allTypeParams.length > 0)
            return J.call(J.mem(J.mem(holder, method.jsName), 'call'), [this.typeRef(ownerType)].concat(args));
        return J.call(J.mem(holder, method.jsName), args);
    };

    // An instance method on a receiver: values of primitive types call the
    // methods of their type with this = the value; type parameters decide
    // at run time.
    G.instanceCall = function (receiver, method, args, ownerType) {
        var target = this.receiver(receiver);
        // d.Invoke(...): delegates are functions.
        if (method.isDelegateInvoke)
            return J.call(target, args);
        var type = receiver === null ? null : receiver.type;
        if (type !== null && type !== undefined) {
            if (type.kind === 'tparam' && !CS.typeParamIsReference(type.sym))
                return J.call(this.rt('tcall'), [this.typeRef(type), target, J.str(method.jsName), J.arr(args)]);
            var under = type;
            if (under.kind === 'named' && (under.sym.primitive === 'number' || this.numericKind(under) !== null || CS.isEnum(under))) {
                // Numbers: the method of their own type (Number.prototype has Int32's).
                var owner = CS.isEnum(under) ? under : under;
                return J.call(J.mem(J.mem(J.mem(this.typeSymRef(owner.sym), 'prototype'), method.jsName), 'call'), [target].concat(args));
            }
            if (CS.isNullableValue(type))
                return J.call(J.mem(J.mem(J.mem(this.typeSymRef(method.owner), 'prototype'), method.jsName), 'call'), [target].concat(args));
        }
        return J.call(J.mem(target, method.jsName), args);
    };

    // The arguments of a call in the order of the parameters; written
    // named arguments keep their order of evaluation through temporaries.
    G.callArguments = function (expr) {
        var self = this;
        var args = expr.args;
        if (!expr.argOrder)
            return args.map(function (arg) { return self.argument(arg); });
        // Evaluate in the written order: temporaries for the reordered ones.
        var values = args.map(function (arg) { return self.argument(arg); });
        var setups = [];
        var byWritten = args.map(function (arg, index) { return { arg: arg, index: index }; }).filter(function (item) {
            return item.arg.argPosition !== undefined;
        });
        byWritten.sort(function (left, right) { return left.arg.argPosition - right.arg.argPosition; });
        byWritten.forEach(function (item) {
            if (J.isSimple(values[item.index]))
                return;
            var temp = self.temp();
            setups.push(J.assign(temp, values[item.index]));
            values[item.index] = temp;
        });
        if (setups.length > 0)
            this.pendingSetups = (this.pendingSetups || []).concat(setups);
        expr.setupBefore = setups;
        return values.map(function (value, index) {
            if (index === 0 && setups.length > 0)
                return J.seq(setups.concat([value]));
            return value;
        });
    };

    // An argument: by value (with copies of structs) or by reference.
    G.argument = function (arg) {
        if (arg.k === 'refArg')
            return this.reference(arg);
        return this.storedValue(arg);
    };

    // ref x, out x: an object with v that reads and writes the variable.
    G.reference = function (arg) {
        var target = arg.target;
        var self = this;
        switch (target.k) {
        case 'discard':
            return J.call(this.rt('discardRef'), []);
        case 'local': {
            var local = target.sym;
            var name = this.localName(local);
            if (local.refKind !== '' && local.refKind !== 'in' && local.kind === 'param' || local.refKind === 'ref')
                return J.id(name);
            if (local.declaredInExpression !== true && arg.declares !== undefined)
                this.declareHoisted(local);
            var value = J.id('$v');
            return J.call(this.rt('ref'), [J.fn(null, [], [J.ret(J.id(name))]),
                                             J.fn(null, ['$v'], [J.expr(J.assign(J.id(name), value))])]);
        }
        case 'field':
            if (target.field.isStatic)
                return J.call(this.rt('fieldRef'), [this.staticHolder(target.ownerType, target.field), J.str(target.field.jsName)]);
            return J.call(this.rt('fieldRef'), [this.receiver(target.receiver), J.str(target.field.jsName)]);
        case 'arrayElement':
            if (target.array.type.rank > 1)
                return J.call(this.rt('elementRef'), [J.mem(this.expression(target.array), 'a'),
                                                      J.call(this.rt('multiIndex'), [this.expression(target.array),
                                                                                     J.arr(target.indices.map(function (index) {
                                                                                         return self.indexValue(index);
                                                                                     }))])]);
            return J.call(this.rt('elementRef'), [this.expression(target.array), this.indexValue(target.indices[0])]);
        case 'this':
            return J.call(this.rt('ref'), [J.fn(null, [], [J.ret(this.thisRef())]), J.fn(null, ['$v'], [J.expr(J.call(this.rt('assignStruct'), [this.thisRef(), J.id('$v')]))])]);
        case 'call':
            return this.expression(target);
        }
        return J.call(this.rt('valueRef'), [this.expression(target)]);
    };

    // A local declared inside an expression (out var, a pattern): declared
    // at the start of its block.
    G.declareHoisted = function (local) {
        if (local.hoisted)
            return;
        local.hoisted = true;
        if (this.blockHoisted !== undefined && this.blockHoisted !== null)
            this.blockHoisted.push(local);
        else
            this.fn.hoisted.push(this.localName(local));
    };

    // A call of a method that may wait: in a fiber, yield*.
    G.fiberCall = function (call, method) {
        if (!method.fiber || !this.fn.generator)
            return call;
        if (call.k !== 'call')
            return call;
        return J.yield_(J.call(this.rt('fiber'), [this.fiberTarget(call)]), true);
    };

    // The generator of a call: x.m(args) -> x.m.$gen(args).
    G.fiberTarget = function (call) {
        var callee = call.callee;
        if (callee.k === 'mem')
            return J.call(this.rt('genOf'), [callee.object, J.str(callee.name), J.arr(call.args)]);
        if (callee.k === 'mem' && callee.name === 'call')
            return call;
        return J.call(this.rt('genApply'), [callee, J.nul(), J.arr(call.args)]);
    };

    G.expr_nothing = function () {
        return J.undef();
    };

    G.expr_delegateCall = function (expr) {
        var self = this;
        var args = expr.args.map(function (arg) { return self.argument(arg); });
        var target = this.expression(expr.target);
        if (this.fn.generator && this.session.mayWait(expr.target.type))
            return J.yield_(J.call(this.rt('fiber'), [J.call(this.rt('genApply'), [target, J.nul(), J.arr(args)])]), true);
        return J.call(target, args);
    };

    // Fast paths of library calls.
    G.callIntrinsic = function (expr) {
        var method = expr.method;
        var owner = method.owner.qname;
        var self = this;
        function arg(index) {
            return self.argument(expr.args[index]);
        }
        if (owner === 'System.Object' && method.name === 'ReferenceEquals')
            return J.bin('===', arg(0), arg(1));
        if (owner === 'System.String' && method.name === 'Concat' && method.params.length >= 2 &&
            method.params.every(function (param) { return CS.isSpecial(param.type, 'string'); }))
            return J.call(J.mem(J.arr(expr.args.map(function (item) { return J.call(self.rt('s'), [self.argument(item)]); })), 'join'), [J.str('')]);
        if (owner === 'System.Math' && method.params.length === 1 && CS.isSpecial(method.params[0].type, 'double')) {
            var simple = { Sqrt: 'sqrt', Sin: 'sin', Cos: 'cos', Tan: 'tan', Exp: 'exp', Log: 'log', Floor: 'floor', Ceiling: 'ceil',
                           Atan: 'atan', Asin: 'asin', Acos: 'acos', Log10: 'log10', Log2: 'log2', Cbrt: 'cbrt', Sinh: 'sinh',
                           Cosh: 'cosh', Tanh: 'tanh', Truncate: 'trunc' };
            if (simple[method.name] !== undefined && expr.args.length === 1)
                return J.call(J.path('Math.' + simple[method.name]), [arg(0)]);
        }
        if (owner === 'System.Math' && method.params.length === 2 && method.name === 'Pow')
            return J.call(J.path('Math.pow'), [arg(0), arg(1)]);
        if (owner === 'System.Math' && method.name === 'Atan2')
            return J.call(J.path('Math.atan2'), [arg(0), arg(1)]);
        if (owner === 'System.Math' && (method.name === 'Max' || method.name === 'Min') && method.params.length === 2) {
            var kind = this.numericKind(method.params[0].type);
            if (kind === 'i32' || kind === 'u32' || kind === 'i16' || kind === 'u16' || kind === 'i8' || kind === 'u8')
                return J.call(J.path(method.name === 'Max' ? 'Math.max' : 'Math.min'), [arg(0), arg(1)]);
        }
        if (owner === 'System.Nullable' && method.name === 'GetValueOrDefault' && expr.args.length === 0) {
            var receiver = this.stable(this.receiver(expr.receiver));
            return this.withSetup(receiver.setup, J.cond(J.bin('===', receiver.ref, J.nul()),
                                                         this.defaultValue(expr.receiver.type.args[0]), receiver.ref));
        }
        return null;
    };

    // --- Object creation

    G.expr_new = function (expr) {
        var ctor = expr.ctor;
        var args = this.callArguments(expr);
        var created = J.new_(this.typeRef(expr.type), []);
        return J.call(J.mem(created, ctor.jsName), args);
    };

    G.expr_newTypeParam = function (expr) {
        return J.call(this.rt('newOf'), [this.typeRef(expr.type)]);
    };

    G.expr_default = function (expr) {
        return this.defaultValue(expr.type);
    };

    // An object with an initializer: a temporary holds it while the
    // members are assigned.
    G.expr_initialized = function (expr) {
        var self = this;
        var temp = this.temp();
        var parts = [J.assign(temp, this.expression(expr.created))];
        this.withPlaceholder('initTarget', temp, function () {
            parts = parts.concat(self.initializerItems(expr.items, temp));
        });
        parts.push(temp);
        return J.seq(parts);
    };

    G.initializerItems = function (items, target) {
        var self = this;
        var parts = [];
        items.forEach(function (item) {
            self.withPlaceholder('initTarget', target, function () {
                if (item.kind === 'assign') {
                    parts.push(self.assignTo(item.target, item.value, false));
                } else if (item.kind === 'add') {
                    parts.push(self.expression(item.call));
                } else if (item.kind === 'nested') {
                    var inner = self.temp();
                    parts.push(J.assign(inner, self.expression(item.target)));
                    parts = parts.concat(self.initializerItems(item.items, inner));
                }
            });
        });
        return parts;
    };

    // --- Arrays

    G.expr_newArray = function (expr) {
        var self = this;
        var type = expr.type;
        var elem = type.elem;
        if (expr.init === null || expr.init === undefined) {
            if (type.rank === 1)
                return J.call(this.rt('newArray'), [this.typeRef(elem), this.indexValue(expr.sizes[0])]);
            return J.call(this.rt('newMultiArray'), [this.typeRef(elem), J.arr(expr.sizes.map(function (size) { return self.indexValue(size); }))]);
        }
        if (type.rank === 1)
            return J.call(this.rt('arrayOf'), [this.typeRef(elem), J.arr(expr.init.map(function (item) { return self.storedValue(item); }))]);
        // A multi-dimensional array from nested rows.
        var dims = [];
        var level = expr.init;
        for (var depth = 0; depth < type.rank; ++depth) {
            dims.push(level.length);
            level = level.length > 0 ? level[0] : [];
        }
        var flat = [];
        (function collect(rows, depth) {
            if (depth === type.rank - 1) {
                rows.forEach(function (item) { flat.push(self.storedValue(item)); });
                return;
            }
            rows.forEach(function (row) { collect(row, depth + 1); });
        })(expr.init, 0);
        return J.call(this.rt('multiArrayOf'), [this.typeRef(elem), J.arr(dims.map(function (dim) { return J.num(dim); })), J.arr(flat)]);
    };

    // An index of an array as a number (long and uint indices too).
    G.indexValue = function (index) {
        var kind = this.numericKind(index.type);
        var value = this.expression(index);
        if (kind === 'i64' || kind === 'u64')
            return J.call(this.rt('longIndex'), [value]);
        return value;
    };

    G.expr_arrayElement = function (expr) {
        var self = this;
        if (expr.indices.length > 1 || expr.array.type.rank > 1) {
            var array = this.stable(this.expression(expr.array));
            var position = J.call(this.rt('multiIndex'), [array.ref, J.arr(expr.indices.map(function (index) { return self.indexValue(index); }))]);
            return this.withSetup(array.setup, J.idx(J.mem(array.ref, 'a'), position));
        }
        var arrayValue = this.stable(this.expression(expr.array));
        var indexValue = this.stable(this.indexValue(expr.indices[0]));
        var check = J.bin('<', J.bin('>>>', indexValue.ref, J.num(0)), J.mem(arrayValue.ref, 'length'));
        return this.withSetup(arrayValue.setup.concat(indexValue.setup),
                              J.cond(check, J.idx(arrayValue.ref, indexValue.ref), J.call(this.rt('throwIndex'), [])));
    };

    G.expr_fromEndElement = function (expr) {
        var array = this.stable(this.expression(expr.array));
        var index = J.call(this.rt('fromEndIndex'), [this.expression(expr.index), J.mem(array.ref, 'length')]);
        return this.withSetup(array.setup, J.call(this.rt('elementAt'), [array.ref, index]));
    };

    G.expr_arraySlice = function (expr) {
        return J.call(this.rt('arraySlice'), [this.expression(expr.array), this.expression(expr.range)]);
    };

    G.expr_stringChar = function (expr) {
        var text = this.stable(this.expression(expr.string));
        var index = this.expression(expr.index);
        var code = this.temp();
        return this.withSetup(text.setup, J.cond(J.bin('===', J.assign(code, J.method(text.ref, 'charCodeAt', [index])), code), code,
                                                 J.call(this.rt('throwIndex'), [])));
    };

    G.expr_stringFromEnd = function (expr) {
        return J.call(this.rt('stringFromEnd'), [this.expression(expr.string), this.expression(expr.index)]);
    };

    G.expr_stringSlice = function (expr) {
        return J.call(this.rt('stringSlice'), [this.expression(expr.string), this.expression(expr.range)]);
    };

    // A value used twice: simple values as they are, the rest through a
    // temporary. { setup: [assignments], ref }.
    G.stable = function (value) {
        if (J.isSimple(value))
            return { setup: [], ref: value };
        var temp = this.temp();
        return { setup: [J.assign(temp, value)], ref: temp };
    };

    G.withSetup = function (setup, value) {
        if (setup.length === 0)
            return value;
        return J.seq(setup.concat([value]));
    };

    // --- Delegates and lambdas

    G.expr_newDelegate = function (expr) {
        var method = expr.method;
        var type = this.typeRef(expr.type);
        var self = this;
        var typeArgs = method.typeParams.length > 0 ? expr.typeArgs.map(function (arg) { return self.typeRef(arg); }) : [];
        if (expr.localFunction || method.isLocal) {
            var local = J.id(this.localName(method.local));
            if (typeArgs.length > 0)
                return J.call(this.rt('boundDelegate'), [type, J.nul(), local, J.arr(typeArgs)]);
            return J.call(this.rt('delegate'), [type, J.nul(), local]);
        }
        if (expr.extension) {
            var extension = J.mem(this.typeSymRef(method.owner), method.jsName);
            return J.call(this.rt('extensionDelegate'), [type, this.expression(expr.receiver), extension, J.arr(typeArgs)]);
        }
        if (method.isStatic) {
            var holder = this.typeSymRef(method.owner);
            var thisValue = expr.ownerType !== null && expr.ownerType.kind === 'named' && expr.ownerType.args.length > 0 &&
                method.owner.allTypeParams.length > 0 ? this.typeRef(expr.ownerType) : holder;
            if (typeArgs.length > 0)
                return J.call(this.rt('boundDelegate'), [type, thisValue, J.mem(holder, method.jsName), J.arr(typeArgs)]);
            return J.call(this.rt('delegate'), [type, thisValue, J.mem(holder, method.jsName)]);
        }
        var receiver = expr.receiver;
        var target = this.stable(this.receiver(receiver));
        var fn;
        if (expr.isBase)
            fn = J.mem(this.baseProto(method), method.jsName);
        else if (receiver !== null && receiver.type !== undefined && receiver.type.kind === 'named' && this.numericKind(receiver.type) !== null)
            fn = J.mem(J.mem(this.typeSymRef(receiver.type.sym), 'prototype'), method.jsName);
        else
            fn = J.mem(target.ref, method.jsName);
        var targetValue = target.ref;
        if (receiver !== null && receiver.type !== undefined && this.isMutableStruct(receiver.type))
            targetValue = J.method(target.ref, '$copy', []);
        if (typeArgs.length > 0)
            return this.withSetup(target.setup, J.call(this.rt('boundDelegate'), [type, targetValue, fn, J.arr(typeArgs)]));
        return this.withSetup(target.setup, J.call(this.rt('delegate'), [type, targetValue, fn]));
    };

    G.expr_lambda = function (expr) {
        var code = this.lambdaFunction(expr);
        return J.call(this.rt('lambda'), [this.typeRef(expr.type), code]);
    };

    // The function of a lambda: this through the method's variable.
    G.lambdaFunction = function (expr) {
        var self = this;
        var saved = this.fn;
        var fn = this.pushFunction('lambda', saved !== null ? saved.typeSym : null, saved !== null ? saved.method : null);
        fn.isStatic = saved !== null ? saved.isStatic : false;
        var params = expr.params.map(function (param) { return self.localName(param); });
        var body = this.functionBody(expr.fn, expr.body, null);
        var code = this.finishFunction(fn, expr.fn, params, body, null);
        this.fn = saved;
        return code;
    };

    // --- Unary and binary operators

    G.numberContext = function () {
        var self = this;
        return {
            temp: function () { return self.fn.scope.temp(); },
            helper: function (name) {
                if (name === 'i64')
                    return J.mem(J.id('$cs'), 'i64');
                if (name === 'u64')
                    return J.mem(J.id('$cs'), 'u64');
                return J.mem(J.id('$T'), name);
            },
            divideByZero: J.call(this.rt('divideByZero'), [])
        };
    };

    G.expr_unary = function (expr) {
        var operand = expr.operand;
        if (expr.kind === 'user')
            return this.staticCall(expr.ownerType, expr.method, [this.storedValue(operand)]);
        if (expr.lifted) {
            var value = this.stable(this.expression(operand));
            var inner = this.unaryCode(expr.op, expr.kind, value.ref, expr);
            return this.withSetup(value.setup, J.cond(J.bin('===', value.ref, J.nul()), J.nul(), inner));
        }
        return this.unaryCode(expr.op, expr.kind, this.expression(operand), expr);
    };

    G.unaryCode = function (op, kind, value, expr) {
        var ctx = this.numberContext();
        switch (kind) {
        case 'bool':
            return J.not(value);
        case 'decimal':
            return op === '-' ? J.call(J.mem(this.rt('dec'), 'neg'), [value]) : value;
        case 'enum': {
            var enumKind = this.numericKind(expr.operand.type);
            return T.ops.unary(enumKind, '^', value, ctx);
        }
        case 'f32':
        case 'f64':
            return op === '-' ? J.un('-', value) : value;
        }
        if (op === '+')
            return value;
        if (expr.checked && op === '-') {
            if (kind === 'i32')
                return J.call(this.rt('checkedNegate32'), [value]);
            if (kind === 'i64')
                return J.call(this.rt('checkedNegate64'), [value]);
        }
        return T.ops.unary(kind, op === '~' ? '^' : '-', value, ctx);
    };

    G.expr_logical = function (expr) {
        var left = this.expression(expr.left), right = this.expression(expr.right);
        return expr.op === '&&' ? J.and(left, right) : J.or(left, right);
    };

    G.expr_userLogical = function (expr) {
        var left = this.stable(this.expression(expr.left));
        var test = this.staticCall(expr.testOwner, expr.test, [left.ref]);
        var operator = expr.operator;
        var combined = this.staticCall(operator.ownerType, operator.method, [left.ref, this.expression(expr.right)]);
        return this.withSetup(left.setup, J.cond(test, left.ref, combined));
    };

    G.expr_binary = function (expr) {
        switch (expr.kind) {
        case 'user':
            if (expr.lifted) {
                var leftLifted = this.stable(this.expression(expr.left)), rightLifted = this.stable(this.expression(expr.right));
                var liftedCall = this.staticCall(expr.ownerType, expr.method, [leftLifted.ref, rightLifted.ref]);
                var comparison = expr.op === '==' || expr.op === '!=' || expr.op === '<' || expr.op === '>' || expr.op === '<=' ||
                    expr.op === '>=';
                var bothNull = J.or(J.bin('===', leftLifted.ref, J.nul()), J.bin('===', rightLifted.ref, J.nul()));
                var whenNull = comparison ? (expr.op === '==' ? J.bin('===', leftLifted.ref, rightLifted.ref)
                                                              : (expr.op === '!=' ? J.bin('!==', leftLifted.ref, rightLifted.ref) : J.bool(false)))
                                          : J.nul();
                return this.withSetup(leftLifted.setup.concat(rightLifted.setup), J.cond(bothNull, whenNull, liftedCall));
            }
            return this.staticCall(expr.ownerType, expr.method, [this.storedValue(expr.left), this.storedValue(expr.right)]);
        case 'string':
        case 'reference':
            return J.bin(expr.op === '==' ? '===' : '!==', this.expression(expr.left), this.expression(expr.right));
        case 'nullCheck':
            return J.bin(expr.op === '==' ? '===' : '!==', this.expression(expr.left), J.nul());
        case 'delegate':
            if (expr.op === '+')
                return J.call(this.rt('combine'), [this.expression(expr.left), this.expression(expr.right)]);
            if (expr.op === '-')
                return J.call(this.rt('removeDelegate'), [this.expression(expr.left), this.expression(expr.right)]);
            var equal = J.call(this.rt('delegateEquals'), [this.expression(expr.left), this.expression(expr.right)]);
            return expr.op === '==' ? equal : J.not(equal);
        case 'bool':
            if (expr.lifted)
                return J.call(this.rt('liftedBool'), [J.str(expr.op), this.expression(expr.left), this.expression(expr.right)]);
            switch (expr.op) {
            case '&':
                return J.call(J.path('Boolean'), [J.bin('&', this.expression(expr.left), this.expression(expr.right))]);
            case '|':
                return J.call(J.path('Boolean'), [J.bin('|', this.expression(expr.left), this.expression(expr.right))]);
            case '^':
            case '!=':
                return J.bin('!==', this.expression(expr.left), this.expression(expr.right));
            case '==':
                return J.bin('===', this.expression(expr.left), this.expression(expr.right));
            }
            break;
        case 'enum':
            return this.enumBinary(expr);
        }
        if (expr.lifted)
            return this.liftedBinary(expr);
        return this.numericBinary(expr.op, expr.kind, this.expression(expr.left), this.expression(expr.right), expr);
    };

    // An operation of nullable operands: null if one is null; comparisons
    // are false (== compares the null too).
    G.liftedBinary = function (expr) {
        var left = this.stable(this.expression(expr.left)), right = this.stable(this.expression(expr.right));
        var op = expr.op;
        var anyNull = J.or(J.bin('===', left.ref, J.nul()), J.bin('===', right.ref, J.nul()));
        var operation = this.numericBinary(op, expr.kind, left.ref, right.ref, expr);
        var whenNull;
        if (op === '==')
            whenNull = J.bin('===', left.ref, right.ref);
        else if (op === '!=')
            whenNull = J.bin('!==', left.ref, right.ref);
        else if (op === '<' || op === '>' || op === '<=' || op === '>=')
            whenNull = J.bool(false);
        else
            whenNull = J.nul();
        return this.withSetup(left.setup.concat(right.setup), J.cond(anyNull, whenNull, operation));
    };

    G.enumBinary = function (expr) {
        var kind = expr.enumKind;
        var enumType = expr.enumType;
        var underlyingKind = this.numericKind(enumType.sym.complete().enumUnderlying);
        var left = this.expression(expr.left), right = this.expression(expr.right);
        var op = expr.op;
        var result;
        if (op === '==' || op === '!=' || op === '<' || op === '>' || op === '<=' || op === '>=')
            result = T.ops.binary(underlyingKind === 'i64' || underlyingKind === 'u64' ? underlyingKind : 'i32', op, left, right, this.numberContext());
        else
            result = this.numericBinary(op, underlyingKind === 'i64' || underlyingKind === 'u64' ? underlyingKind : kind, left, right, expr);
        if (expr.lifted) {
        }
        // The result of + and - of an enum is wrapped to its underlying type.
        if ((op === '+' || op === '-') && underlyingKind !== 'i32' && underlyingKind !== 'i64' && underlyingKind !== 'u64')
            result = T.ops.wrap(underlyingKind, result);
        return result;
    };

    // Arithmetic, comparisons, bits and shifts of a numeric kind.
    G.numericBinary = function (op, kind, left, right, expr) {
        var ctx = this.numberContext();
        if (kind === 'decimal') {
            var names = { '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '%': 'rem' };
            if (names[op] !== undefined)
                return J.call(J.mem(this.rt('dec'), names[op]), [left, right]);
            return J.bin(op === '==' ? '===' : (op === '!=' ? '!==' : op),
                         J.call(J.mem(this.rt('dec'), 'cmp'), [left, right]), J.num(0));
        }
        if (op === '<<' || op === '>>' || op === '>>>')
            return this.shift(op, kind, left, right);
        if (expr.checked && (op === '+' || op === '-' || op === '*') && kind !== 'f32' && kind !== 'f64')
            return this.checkedArithmetic(op, kind, left, right);
        if ((op === '/' || op === '%') && (kind === 'i32' || kind === 'u32'))
            return this.integerDivision(op, kind, left, right);
        if ((op === '/' || op === '%') && kind === 'i64') {
            if (right.k === 'num' && right.value !== 0 && right.value !== -1)
                return T.ops.binary(kind, op, left, right, ctx);
            return J.call(J.mem(this.rt('i64'), op === '/' ? 'divide' : 'remainder'), [left, right]);
        }
        if (op === '/' && (kind === 'f32' || kind === 'f64')) {
            var quotient = J.bin('/', left, right);
            return kind === 'f32' ? J.call(J.path('Math.fround'), [quotient]) : quotient;
        }
        if (op === '%' && (kind === 'f32' || kind === 'f64')) {
            var remainder = J.bin('%', left, right);
            return kind === 'f32' ? J.call(J.path('Math.fround'), [remainder]) : remainder;
        }
        return T.ops.binary(kind, op, left, right, ctx);
    };

    // int and uint / and %: DivideByZeroException; int.MinValue / -1
    // overflows (as on x64).
    G.integerDivision = function (op, kind, left, right) {
        if (right.k === 'num' && right.value !== 0 && right.value !== -1) {
            if (op === '/')
                return kind === 'u32' ? J.bin('>>>', J.bin('/', left, right), J.num(0)) : J.bin('|', J.bin('/', left, right), J.num(0));
            return kind === 'u32' ? J.bin('%', left, right) : J.bin('|', J.bin('%', left, right), J.num(0));
        }
        var name = (kind === 'u32' ? 'u' : 'i') + (op === '/' ? 'div' : 'mod');
        return J.call(this.rt(name), [left, right]);
    };

    // Shifts: the count is masked (31 or 63), as in C#.
    G.shift = function (op, kind, left, right) {
        var count = J.bin('&', right, J.num(kind === 'i64' || kind === 'u64' ? 63 : 31));
        if (right.k === 'num')
            count = J.num(right.value & (kind === 'i64' || kind === 'u64' ? 63 : 31));
        switch (kind) {
        case 'i32':
            return op === '>>>' ? J.bin('|', J.bin('>>>', left, count), J.num(0)) : J.bin(op, left, count);
        case 'u32':
            if (op === '<<')
                return J.bin('>>>', J.bin('<<', left, count), J.num(0));
            return J.bin('>>>', left, count);
        case 'i64':
            if (op === '<<')
                return J.call(J.mem(this.rt('i64'), 'shl'), [left, count]);
            if (op === '>>')
                return J.call(J.mem(this.rt('i64'), 'shr'), [left, count]);
            return J.call(this.rt('lushr'), [left, count]);
        case 'u64':
            if (op === '<<')
                return J.call(J.mem(this.rt('u64'), 'shl'), [left, count]);
            return J.call(J.mem(this.rt('u64'), 'shr'), [left, count]);
        }
        return J.bin(op, left, count);
    };

    G.checkedArithmetic = function (op, kind, left, right) {
        var names = { '+': 'Add', '-': 'Sub', '*': 'Mul' };
        return J.call(this.rt('checked' + names[op]), [J.str(kind), left, right]);
    };

    // a + b + c with a string: every part as its text.
    G.expr_concat = function (expr) {
        var self = this;
        var parts = expr.parts.map(function (part) { return self.stringOf(part); });
        if (parts.length <= 12) {
            var result = parts[0];
            // A string first keeps + a concatenation.
            if (!(expr.parts[0].type.kind === 'named' && CS.isSpecial(expr.parts[0].type, 'string') && expr.parts[0].constant !== undefined &&
                  expr.parts[0].constant !== null) && result.k !== 'str')
                result = J.bin('+', J.str(''), result);
            for (var index = 1; index < parts.length; ++index)
                result = J.bin('+', result, parts[index]);
            return result;
        }
        return J.method(J.arr(parts), 'join', [J.str('')]);
    };

    // The text of a value of a known type (ToString(), null as "").
    G.stringOf = function (expr) {
        var type = expr.type;
        if (expr.constant !== undefined) {
            if (expr.constant === null)
                return J.str('');
            if (typeof expr.constant === 'string')
                return J.str(expr.constant);
        }
        var value = this.expression(expr);
        return this.stringValue(value, type);
    };

    G.stringValue = function (value, type) {
        if (type.kind === 'null')
            return J.str('');
        if (CS.isSpecial(type, 'string'))
            return J.call(this.rt('s'), [value]);
        var kind = this.numericKind(type);
        if (CS.isEnum(type))
            return J.call(this.rt('enumName'), [this.typeRef(type), value]);
        switch (kind) {
        case 'i8':
        case 'u8':
        case 'i16':
        case 'u16':
        case 'i32':
        case 'u32':
            if (CS.isSpecial(type, 'char'))
                return J.call(J.path('String.fromCharCode'), [value]);
            return J.call(J.path('String'), [value]);
        case 'i64':
            return J.call(J.path('String'), [value]);
        case 'u64':
            return J.call(J.mem(J.mem(J.id('$T'), 'u64'), 'str'), [value]);
        case 'f64':
            return J.call(this.rt('doubleString'), [value]);
        case 'f32':
            return J.call(this.rt('singleString'), [value]);
        case 'decimal':
            return J.call(J.mem(this.rt('dec'), 'str'), [value]);
        }
        if (CS.isSpecial(type, 'bool'))
            return J.cond(value, J.str('True'), J.str('False'));
        if (type.kind === 'tparam' || CS.isNullableValue(type) || (type.kind === 'named' && type.sym.kind === 'struct'))
            return J.call(this.rt('str'), [this.typeRef(type), value]);
        return J.call(this.rt('objectString'), [value]);
    };

    G.expr_interpolated = function (expr) {
        var self = this;
        var parts = expr.parts.map(function (part) {
            if (typeof part === 'string')
                return J.str(part);
            if (part.alignment === null && part.format === null)
                return self.stringOf(part.expr);
            var value = self.expression(part.expr);
            var formatted = part.format !== null ? self.formatted(value, part.expr.type, part.format) : self.stringValue(value, part.expr.type);
            if (part.alignment !== null)
                formatted = J.call(self.rt('align'), [formatted, J.num(part.alignment)]);
            return formatted;
        }).filter(function (part) { return !(part.k === 'str' && part.value === ''); });
        if (parts.length === 0)
            return J.str('');
        if (parts.length === 1)
            return parts[0].k === 'str' ? parts[0] : J.bin('+', J.str(''), parts[0]);
        if (parts.length > 12)
            return J.method(J.arr(parts), 'join', [J.str('')]);
        var result = parts[0].k === 'str' ? parts[0] : J.bin('+', J.str(''), parts[0]);
        for (var index = 1; index < parts.length; ++index)
            result = J.bin('+', result, parts[index]);
        return result;
    };

    // {value:F2}: ToString(format) of a formattable value.
    G.formatted = function (value, type, format) {
        return J.call(this.rt('formatValue'), [this.typeRef(type), value, J.str(format)]);
    };

    // --- Other expressions

    G.expr_coalesce = function (expr) {
        var left = this.stable(this.expression(expr.left));
        return this.withSetup(left.setup, J.cond(J.bin('!==', left.ref, J.nul()), left.ref, this.expression(expr.right)));
    };

    G.expr_conditional = function (expr) {
        return J.cond(this.expression(expr.cond), this.expression(expr.then), this.expression(expr.otherwise));
    };

    G.expr_typeof = function (expr) {
        if (expr.target.kind === 'void')
            return J.call(this.rt('typeObject'), [J.mem(J.id('$K'), CS.symtab.typeNamed('System.Void').jsId)]);
        return J.call(this.rt('typeObject'), [this.typeRef(expr.target)]);
    };

    G.expr_as = function (expr) {
        var type = expr.targetType;
        if (CS.isNullableValue(type))
            return J.call(this.rt('asValue'), [this.expression(expr.operand), this.typeRef(type.args[0])]);
        return J.call(this.rt('as'), [this.expression(expr.operand), this.typeRef(type)]);
    };

    G.expr_throwExpr = function (expr) {
        return J.call(this.rt('throwValue'), [this.expression(expr.expr)]);
    };

    G.expr_tuple = function (expr) {
        var self = this;
        var type = expr.type;
        var values = expr.items.map(function (item) { return self.storedValue(item); });
        return J.call(this.rt('tuple'), [this.typeRef(type), J.arr(values)]);
    };

    G.expr_tupleEquality = function (expr) {
        var self = this;
        var left = this.stable(this.expression(expr.left)), right = this.stable(this.expression(expr.right));
        var result = null;
        this.withPlaceholder('leftTuple', left.ref, function () {
            self.withPlaceholder('rightTuple', right.ref, function () {
                expr.comparisons.forEach(function (comparison) {
                    var code = self.expression(comparison);
                    if (expr.op === '==')
                        result = result === null ? code : J.and(result, code);
                    else
                        result = result === null ? code : J.or(result, code);
                });
            });
        });
        return this.withSetup(left.setup.concat(right.setup), result);
    };

    G.expr_newAnonymous = function (expr) {
        var self = this;
        return J.call(this.rt('anonymous'), [this.typeRef(expr.type), J.arr(expr.values.map(function (value) {
            return self.storedValue(value);
        }))]);
    };

    G.expr_with = function (expr) {
        var self = this;
        var temp = this.temp();
        var operand = this.expression(expr.operand);
        var copy;
        if (expr.clone !== null)
            copy = J.method(operand, expr.clone.member.jsName, []);
        else if (this.isMutableStruct(expr.type))
            copy = J.method(operand, '$copy', []);
        else if (expr.type.kind === 'named' && expr.type.sym.isAnonymous)
            copy = J.call(this.rt('cloneAnonymous'), [operand]);
        else
            copy = operand;
        var parts = [J.assign(temp, copy)];
        this.withPlaceholder('initTarget', temp, function () {
            parts = parts.concat(self.initializerItems(expr.assignments, temp));
        });
        parts.push(temp);
        return J.seq(parts);
    };

    // a?.b: null if a is null.
    G.expr_condAccess = function (expr) {
        var self = this;
        var receiver = this.stable(this.expression(expr.receiver));
        var access;
        this.withPlaceholder('receiverValue', receiver.ref, function () {
            access = self.expression(expr.access);
        });
        return this.withSetup(receiver.setup, J.cond(J.bin('===', receiver.ref, J.nul()), expr.type.kind === 'void' ? J.undef() : J.nul(),
                                                     access));
    };

    G.expr_fromEnd = function (expr) {
        return J.call(this.rt('index'), [this.expression(expr.operand), J.bool(true)]);
    };

    G.expr_range = function (expr) {
        var self = this;
        function part(value) {
            if (value === null)
                return J.nul();
            if (value.type !== undefined && value.type.kind === 'named' && value.type.sym.qname === 'System.Index')
                return self.expression(value);
            return J.call(self.rt('index'), [self.expression(value), J.bool(false)]);
        }
        return J.call(this.rt('range'), [part(expr.from), part(expr.to)]);
    };

    G.expr_collectionExpr = function (expr) {
        var self = this;
        var target = expr.target;
        var elementType = target.elementType;
        var hasSpread = expr.items.some(function (item) { return item.spread; });
        var values;
        if (!hasSpread) {
            values = J.arr(expr.items.map(function (item) { return self.storedValue(item.expr); }));
        } else {
            values = J.call(this.rt('spreadItems'), [J.arr(expr.items.map(function (item) {
                if (!item.spread)
                    return J.arr([self.storedValue(item.expr)]);
                return J.call(self.rt('itemsOf'), [self.expression(item.expr)]);
            }))]);
        }
        if (target.kind === 'array')
            return J.call(this.rt('arrayOf'), [this.typeRef(elementType), values]);
        var listType = this.typeRef(expr.listType);
        return J.call(this.rt('collectionOf'), [listType, values]);
    };

    G.expr_await = function (expr) {
        if (!this.fn.generator)
            return J.call(this.rt('awaitSync'), [this.expression(expr.expr)]);
        var value = this.expression(expr.expr);
        if (expr.awaiter.kind === 'awaiter')
            value = J.method(value, expr.awaiter.getAwaiter.member.jsName, []);
        return J.yield_(J.call(this.rt('await'), [value]), true);
    };

    G.expr_dynamicMember = function (expr) {
        return J.call(this.rt('dynamicGet'), [this.expression(expr.receiver), J.str(expr.name)]);
    };

    G.expr_dynamicIndex = function (expr) {
        var self = this;
        return J.call(this.rt('dynamicIndex'), [this.expression(expr.receiver), J.arr(expr.args.map(function (arg) {
            return self.expression(arg);
        }))]);
    };

    G.expr_dynamicCall = function (expr) {
        var self = this;
        var args = J.arr(expr.args.map(function (arg) { return J.call(self.rt('toJs'), [self.expression(arg)]); }));
        var target = expr.target;
        if (target.k === 'dynamicMember')
            return J.call(this.rt('dynamicInvokeMember'), [this.expression(target.receiver), J.str(target.name), args]);
        return J.call(this.rt('dynamicInvoke'), [this.expression(target), args]);
    };

    G.expr_dynamicBinary = function (expr) {
        return J.call(this.rt('dynamicBinary'), [J.str(expr.op), this.expression(expr.left), this.expression(expr.right)]);
    };

    G.expr_dynamicUnary = function (expr) {
        return J.call(this.rt('dynamicUnary'), [J.str(expr.op), this.expression(expr.operand)]);
    };

    G.expr_refArg = function (expr) {
        return this.reference(expr);
    };

    G.expr_eventAssign = function (expr) {
        var event = expr.event;
        var accessor = expr.op === '+' ? event.adder : event.remover;
        if (event.isStatic)
            return this.staticCall(expr.ownerType, accessor, [this.expression(expr.value)]);
        return this.instanceCall(expr.receiver, accessor, [this.expression(expr.value)], expr.ownerType);
    };

    G.expr_discardAssign = function (expr) {
        return this.expression(expr.value);
    };
})(globalThis);
