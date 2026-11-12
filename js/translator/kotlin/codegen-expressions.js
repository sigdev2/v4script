// Kotlin: translation of expressions. if, when and try are expressions in
// Kotlin; when a part needs statements (a block, return inside an
// expression), they are lifted before the current statement (fn.pre) and
// the value goes through a temporary; earlier operands are evaluated into
// temporaries first, so the order of evaluation stays.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Kt = T.kotlin;
    var Generator = Kt.Generator;
    if (Generator.prototype.expression)
        return;

    var J = T.J;
    var big = T.big;

    // --- Lifting

    // Statements before the current one.
    Generator.prototype.lift = function (statement) {
        this.fn.pre.push(statement);
    };

    // The translation of thunk with its own lifted statements: { js, pre }.
    Generator.prototype.capture = function (thunk) {
        var saved = this.fn.pre;
        this.fn.pre = [];
        var js = thunk();
        var pre = this.fn.pre;
        this.fn.pre = saved;
        return { js: js, pre: pre };
    };

    // Statements for a value: the lifted ones, then wrap(value).
    Generator.prototype.withPre = function (thunk, wrap) {
        var captured = this.capture(thunk);
        return captured.pre.concat([wrap(captured.js)]);
    };

    // Operands in order: if a later one lifts statements, the earlier ones
    // go into temporaries before them.
    Generator.prototype.ordered = function (thunks) {
        var self = this;
        var values = [];
        thunks.forEach(function (thunk) {
            var before = self.fn.pre.length;
            var js = thunk();
            if (self.fn.pre.length > before) {
                var spills = [];
                values = values.map(function (value) {
                    if (isStable(value))
                        return value;
                    var temp = self.temp();
                    spills.push(J.expr(J.assign(temp, value)));
                    return temp;
                });
                if (spills.length > 0)
                    Array.prototype.splice.apply(self.fn.pre, [before, 0].concat(spills));
            }
            values.push(js);
        });
        return values;
    };

    function isStable(js) {
        return J.isLiteral(js) || js.k === 'this' || (js.k === 'id' && /^\$t\d+$/.test(js.name)) ||
            (js.k === 'mem' && js.object.k === 'id' && js.object.name === '$D') || (js.k === 'idx' && js.object.k === 'id' && js.object.name === '$D');
    }

    // A value used twice: a temporary unless it is simple.
    Generator.prototype.stable = function (js) {
        if (J.isSimple(js) && js.k !== 'id' || (js.k === 'id' && (/^\$t\d+$/.test(js.name) || /^\$this\d+$/.test(js.name))))
            return { setup: null, value: js };
        var temp = this.temp();
        return { setup: J.assign(temp, js), value: temp };
    };

    Generator.prototype.opsContext = function () {
        var self = this;
        if (this.fn.ops === null) {
            this.fn.ops = {
                temp: function () { return self.fn.scope.temp(); },
                helper: function (name) { return J.mem(J.id('$T'), name); },
                divideByZero: J.call(this.rt('divideByZero'), [])
            };
        }
        return this.fn.ops;
    };

    // --- Values

    // An expression as a value of type target.
    Generator.prototype.valueAs = function (node, target) {
        var js = this.expression(node);
        var type = node.type !== undefined ? node.type : Kt.ERROR;
        if (node.samConversion !== undefined && node.samConversion !== null && Kt.resolved(type).kind === 'fun')
            return this.samObject(js, node.samConversion);
        if (target === null || target === undefined)
            return js;
        return this.convert(js, type, target);
    };

    // A Kotlin function as an object of a Java functional interface (Runnable, Comparator).
    Generator.prototype.samObject = function (js, sam) {
        var iface = Kt.resolved(sam.iface).sym;
        var fn = sam.fn;
        var self = this;
        // Parameters are boxed by the interface; the function takes Kotlin values.
        var adapted = js;
        var needsAdapter = fn.params.some(function (param, index) {
            return Kt.isPrimitive(sam.type.params[index]) !== Kt.isPrimitive(param.type);
        }) || Kt.isPrimitive(sam.type.returns) !== Kt.isPrimitive(fn.returns);
        if (needsAdapter) {
            var target = this.stable(js);
            var params = fn.params.map(function (param, index) { return '$a' + index; });
            var args = fn.params.map(function (param, index) { return self.convert(J.id(params[index]), param.type, sam.type.params[index]); });
            var result = this.convert(J.call(target.value, args), sam.type.returns, fn.returns);
            adapted = J.fn(null, params, [J.ret(result)]);
            if (target.setup !== null)
                adapted = J.seq([target.setup, adapted]);
        }
        return J.call(this.rt('lambda'), [this.classRef(iface), J.str(fn.jsName), adapted]);
    };

    Generator.prototype.expression = function (node) {
        var js = this.expressionInner(node);
        if (node.smartCast !== undefined && node.smartCast !== null && node.k !== 'paren') {
            var declared = this.declaredTypeOf(node);
            if (declared !== null)
                js = this.convert(js, declared, node.smartCast);
        }
        return js;
    };

    // The type of a name before a smart cast.
    Generator.prototype.declaredTypeOf = function (node) {
        var ref = node.ref;
        if (node.k === 'this')
            return node.receiverInfo.type;
        if (ref === undefined || ref === null)
            return null;
        if (ref.kind === 'local')
            return ref.sym.type;
        if (ref.kind === 'prop')
            return Kt.subst(ref.sym.type, ref.map || new Map());
        return null;
    };

    Generator.prototype.expressionInner = function (node) {
        switch (node.k) {
        case 'int':
            return this.intLiteral(node);
        case 'float':
            return J.num(node.single ? Math.fround(node.value) : node.value);
        case 'char':
            return J.num(node.value);
        case 'bool':
            return J.bool(node.value);
        case 'null':
            return J.nul();
        case 'string':
            return this.stringTemplate(node);
        case 'name':
            return this.nameValue(node);
        case 'this':
            return this.receiverValue(node.receiverInfo);
        case 'paren':
            return this.expression(node.expr);
        case 'member':
            return this.memberValue(node);
        case 'call':
            return this.callValue(node);
        case 'index':
            return this.indexValue(node);
        case 'binary':
            return this.binaryValue(node);
        case 'infix':
            return this.infixValue(node);
        case 'prefix':
            return this.prefixValue(node);
        case 'postfix':
            return this.postfixValue(node);
        case 'is':
            return this.typeTest(this.expression(node.expr), node.expr.type, node.testType, node.negated);
        case 'as':
            return this.castValue(node);
        case 'if':
            return this.ifValue(node);
        case 'when':
            return this.whenValue(node);
        case 'try':
            return this.tryValue(node);
        case 'jump':
            return this.jumpValue(node);
        case 'lambda':
        case 'anonfun':
            return this.lambdaValue(node);
        case 'ref':
            return this.referenceValue(node);
        case 'objectexpr':
            return this.objectExpressionValue(node);
        case 'delegateArg':
            return node.js !== undefined ? node.js : J.nul();
        case 'subject':
            return node.js;
        }
        throw new Error('Kotlin: cannot translate ' + node.k);
    };

    // --- Literals

    Generator.prototype.intLiteral = function (node) {
        var value = node.value !== undefined ? node.value : big.parse(node.digits, node.radix);
        var kind = Kt.primKind(node.type);
        return this.integerConstant(value, kind);
    };

    Generator.prototype.integerConstant = function (value, kind) {
        if (kind === 'i64' || kind === 'u64') {
            var number = Number(big.str(value));
            if (Math.abs(number) <= 9007199254740991)
                return number < 0 ? J.un('-', J.num(-number)) : J.num(number);
            var wide = kind === 'u64' ? T.bigToI64(value, false) : T.bigToI64(value, true);
            return this.constant(wide);
        }
        if (kind === 'f64' || kind === 'f32')
            return J.num(Number(big.str(value)));
        var small = Number(big.str(value));
        if (kind === 'u32')
            small = small >>> 0;
        return small < 0 ? J.un('-', J.num(-small)) : J.num(small);
    };

    // "a$x" - concatenation; parts as Kotlin prints them.
    Generator.prototype.stringTemplate = function (node) {
        var self = this;
        var pieces = [];
        var thunks = [];
        node.parts.forEach(function (part) {
            if (part.kind === 'text') {
                if (part.value.length > 0)
                    thunks.push(function () { return J.str(part.value); });
            } else {
                thunks.push(function () { return self.stringOf(self.expression(part.expr), part.expr.type); });
            }
        });
        pieces = this.ordered(thunks);
        if (pieces.length === 0)
            return J.str('');
        if (pieces.length === 1)
            return pieces[0].k === 'str' ? pieces[0] : J.bin('+', J.str(''), pieces[0]);
        if (pieces.length > 8)
            return J.call(J.mem(J.arr(pieces), 'join'), [J.str('')]);
        var result = pieces[0].k === 'str' ? pieces[0] : J.bin('+', J.str(''), pieces[0]);
        for (var index = 1; index < pieces.length; ++index)
            result = J.bin('+', result, pieces[index]);
        return result;
    };

    // A value as text, as Kotlin prints it (Double 1.0, Char a, null).
    Generator.prototype.stringOf = function (js, type) {
        type = Kt.resolved(type);
        if (Kt.isPrimitive(type)) {
            switch (Kt.primKind(type)) {
            case 'i32':
            case 'i16':
            case 'i8':
            case 'bool':
            case 'u8':
            case 'u16':
            case 'u32':
                return js;
            case 'i64':
                return J.call(J.mem(J.mem(J.id('$T'), 'i64'), 'str'), [js]);
            case 'u64':
                return J.call(J.mem(J.mem(J.id('$T'), 'u64'), 'str'), [js]);
            case 'f64':
                return J.call(this.rt('dstr'), [js]);
            case 'f32':
                return J.call(this.rt('fstr'), [js]);
            case 'char':
                return J.call(J.path('String.fromCharCode'), [js]);
            }
        }
        if (Kt.isClass(type, 'String') && !type.nullable && !type.flexible)
            return js;
        return J.call(this.kt('str'), [js]);
    };

    // --- Names and properties

    Generator.prototype.nameValue = function (node) {
        var ref = node.ref;
        switch (ref.kind) {
        case 'local':
            return this.localValue(ref.sym);
        case 'prop':
            return this.propertyRead(ref, null, node);
        case 'object':
            return this.objectValue(ref.sym);
        case 'field':
            return J.mem(this.fieldHolder(ref.prop), ref.prop.jsName);
        }
        throw new Error('Kotlin: cannot translate the name ' + node.name);
    };

    Generator.prototype.objectValue = function (sym) {
        var method = this.fn !== null ? this.methodOf(this.fn) : null;
        if (method !== null && method.cls === sym && sym.kind === 'object' && !method.ctor)
            return this.thisOf(sym);
        if (method !== null && method.cls === sym && method.ctor)
            return this.thisOf(sym);
        return this.objectRef(sym);
    };

    // The holder of a field in an accessor: this or the top-level holder.
    Generator.prototype.fieldHolder = function (prop) {
        if (prop.owner !== null)
            return this.thisOf(prop.owner);
        return this.topHolder(prop);
    };

    Generator.prototype.localValue = function (variable) {
        if (variable.delegated)
            return this.localDelegateGet(variable);
        if (variable.jsName === null || variable.jsName === undefined)
            variable.jsName = this.localName(variable);
        if (variable.boxed)
            return J.mem(J.id(variable.jsName), 'v');
        return J.id(variable.jsName);
    };

    var localCounter = 0;
    Generator.prototype.localName = function (variable) {
        if (variable.name === '_' || variable.name === '$destructured')
            return '$u' + (++localCounter);
        return T.jsName(variable.name) + (variable.renamed ? '$' + (++localCounter) : '');
    };

    // A property: a constant, a field, a getter, a static, a top-level one.
    Generator.prototype.propertyRead = function (ref, receiverJs, node) {
        var prop = ref.sym;
        // A const of a library class not checked yet (Int.MAX_VALUE).
        if (prop.isConst && prop.constValue === undefined && prop.node !== null && prop.node.init !== null) {
            var checker = prop.checker || (prop.owner !== null ? prop.owner.checker : null);
            if (checker !== null && checker !== undefined)
                checker.checkPropertyInit(prop);
        }
        if (prop.isConst && prop.constValue !== undefined && prop.constValue !== null)
            return this.constantJs(prop.constValue, prop.type);
        if (prop.synthetic !== undefined && prop.synthetic !== null)
            return this.syntheticProperty(ref, receiverJs);
        if (prop.intrinsic !== null && prop.intrinsic !== undefined)
            return this.intrinsicProperty(prop, receiverJs, ref, node);
        if (prop.enumEntry !== undefined) {
            var enumRef = this.classRef(prop.owner);
            return J.mem(J.call(this.kt('initialized'), [enumRef]), prop.jsName);
        }
        if (prop.java !== null) {
            if (prop.java.field !== undefined) {
                if (prop.isStatic)
                    return J.mem(J.call(this.kt('initialized'), [this.classRef(prop.owner)]), prop.jsName);
                return J.mem(this.receiverFor(ref, receiverJs), prop.jsName);
            }
            return this.methodCall(this.receiverFor(ref, receiverJs), ref.receiverType || (prop.owner !== null ? Kt.classType(prop.owner, []) : null),
                                   prop.java.getter.jsName, [], prop.owner);
        }
        if (prop.owner === null) {
            // A top-level property (or extension).
            var holder = this.topHolder(prop);
            if (prop.receiver !== null)
                return J.call(J.mem(holder, prop.getterName), [this.convert(this.receiverFor(ref, receiverJs), ref.receiverType || prop.receiver, prop.receiver)]);
            if (prop.customGetter || prop.delegated || prop.lateinit)
                return J.call(J.mem(holder, prop.getterName), []);
            return J.mem(holder, prop.jsName);
        }
        var owner = prop.owner;
        if (owner.kind === 'object' && ref.receiver === null && receiverJs === null && ref.objectOf === undefined)
            receiverJs = this.objectValue(owner);
        if (prop.receiver !== null) {
            // A member extension property.
            var dispatch = ref.dispatch !== undefined ? this.receiverValue(ref.dispatch) : this.thisOf(owner);
            return J.call(J.mem(dispatch, prop.getterName), [this.receiverFor(ref, receiverJs)]);
        }
        var target = this.receiverFor(ref, receiverJs);
        if (owner.mappedBuiltin)
            return this.methodCall(target, ref.receiverType || Kt.classType(owner, []), prop.getterName, [], owner);
        if (this.directField(prop))
            return J.mem(target, prop.jsName);
        return J.call(J.mem(target, prop.getterName), []);
    };

    // A final property with default accessors is read and written as a field.
    Generator.prototype.directField = function (prop) {
        if (!prop.hasField || prop.lateinit || prop.delegated || prop.customGetter || prop.isOpen || prop.isOverride ||
            prop.isAbstract || prop.java !== null)
            return false;
        if (prop.owner !== null && prop.owner.isInterface())
            return false;
        return true;
    };

    Generator.prototype.directWrite = function (prop) {
        if (!this.directField(prop))
            return false;
        return !prop.customSetter;
    };

    // The receiver of a member: explicit, implicit, or this.
    Generator.prototype.receiverFor = function (ref, receiverJs) {
        if (receiverJs !== null && receiverJs !== undefined)
            return receiverJs;
        if (ref.receiver !== null && ref.receiver !== undefined)
            return this.receiverValue(ref.receiver);
        if (ref.objectOf !== undefined && ref.objectOf !== null)
            return this.objectRef(ref.objectOf);
        if (ref.sym.owner !== null && ref.sym.owner !== undefined && ref.sym.owner.kind === 'object')
            return this.objectValue(ref.sym.owner);
        return J.this_();
    };

    Generator.prototype.constantJs = function (value, type) {
        switch (value.kind) {
        case 'int':
            return this.integerConstant(value.value, Kt.primKind(type) || 'i32');
        case 'float':
            return J.num(value.value);
        case 'char':
            return J.num(value.value);
        case 'bool':
            return J.bool(value.value);
        case 'string':
            return J.str(value.value);
        }
        return J.nul();
    };

    Generator.prototype.syntheticProperty = function (ref, receiverJs) {
        var prop = ref.sym;
        switch (prop.synthetic.kind) {
        case 'enumEntries':
            return J.call(this.kt('enumEntries'), [this.classRef(prop.owner)]);
        }
        void receiverJs;
        throw new Error('Kotlin: unknown synthetic property ' + prop.name);
    };

    Generator.prototype.intrinsicProperty = function (prop, receiverJs, ref, node) {
        var receiver = this.receiverFor(ref, receiverJs);
        switch (prop.intrinsic) {
        case 'length':
            return J.mem(J.call(this.rt('nonNull'), [receiver]), 'length');
        case 'arraySize':
            return J.mem(receiver, 'length');
        }
        if (prop.intrinsic.op === 'code') {
            // Char.code: the char is its code; a boxed char is unboxed.
            var target = node !== null && node !== undefined ? node.target : undefined;
            if (target !== undefined && target !== null && target.type !== undefined && !Kt.isPrimitive(target.type))
                return this.unbox(receiver, 'char');
            return receiver;
        }
        return this.kotlinIntrinsicProperty(prop, receiver, ref, node);
    };

    Generator.prototype.kotlinIntrinsicProperty = function (prop, receiver, ref, node) {
        var native = this.session.nativeFor(prop);
        if (native !== null)
            return J.call(J.mem(this.constant(native), 'call'), [receiver]);
        void ref;
        void node;
        throw new Error('Kotlin: unknown intrinsic property ' + prop.name);
    };

    // value.name
    Generator.prototype.memberValue = function (node) {
        var ref = node.ref;
        if (ref.kind === 'object')
            return this.objectValue(ref.sym);
        if (ref.kind === 'dynamic')
            return J.call(this.kt('dynamicGet'), [this.expression(node.target), J.str(node.name)]);
        if (ref.kind === 'class')
            return J.nul();
        var prop = ref.sym;
        if (ref.staticOf !== undefined || (prop.isStatic && !ref.explicit) || (ref.receiver === null && !ref.explicit && prop.owner === null))
            return this.propertyRead(ref, null, node);
        var self = this;
        if (node.safe) {
            var target = this.stable(this.expression(node.target));
            var read = this.propertyRead(ref, target.value, node);
            read = this.convert(read, this.declared(Kt.subst(prop.type, ref.map || new Map())), node.type);
            var test = J.bin('==', target.setup !== null ? target.setup : target.value, J.nul());
            if (target.setup !== null)
                test = J.bin('==', J.seq([target.setup]), J.nul());
            return J.cond(target.setup !== null ? J.bin('==', target.setup, J.nul()) : J.bin('==', target.value, J.nul()), J.nul(), read);
        }
        void self;
        var receiverType = ref.receiverType || node.target.type;
        var receiver = this.expression(node.target);
        if (prop.receiver !== null && prop.owner === null)
            receiver = this.convert(receiver, receiverType, prop.receiver);
        var value = this.propertyRead(ref, receiver, node);
        // Generic properties are boxed: List<Double>.first() is unboxed by the caller.
        var declaredType = this.declaredPropertyType(prop);
        var actualType = Kt.subst(this.propertyTypeOf(prop), ref.map || new Map());
        if (node.smartCast === undefined)
            return this.convert(value, declaredType, actualType);
        return this.convert(value, declaredType, actualType);
    };

    Generator.prototype.propertyTypeOf = function (prop) {
        return prop.type !== null ? prop.type : Kt.nullableAny();
    };

    // The type of a property as its getter returns it (a type parameter is a box).
    Generator.prototype.declaredPropertyType = function (prop) {
        return prop.type !== null ? prop.type : Kt.nullableAny();
    };
})(globalThis);
