// Java: translation of expressions - conversions, boxing, names, operations.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Java = T.java;
    var Generator = Java.Generator;
    if (Generator.prototype.expression)
        return;

    var J = T.J;
    var ops = T.ops;

    var KINDS = { byte: 'i8', short: 'i16', char: 'u16', int: 'i32', long: 'i64', float: 'f32', double: 'f64' };
    Java.KINDS = KINDS;

    // Boxing: Integer and Boolean are the numbers and booleans themselves.
    var BOX = { char: 'boxC', long: 'boxJ', double: 'boxD', float: 'boxF', short: 'boxS', byte: 'boxB' };

    Generator.prototype.opsContext = function () {
        var self = this;
        if (this.fn.opsContext === undefined) {
            this.fn.opsContext = {
                temp: function () { return self.fn.scope.temp(); },
                helper: function (name) { return J.mem(J.id('$T'), name); },
                divideByZero: J.call(this.rt('divideByZero'), [])
            };
        }
        return this.fn.opsContext;
    };

    Generator.prototype.convertPrimitive = function (js, from, to) {
        if (from.name === to.name || from.name === 'boolean' || to.name === 'boolean')
            return js;
        var fromKind = KINDS[from.name], toKind = KINDS[to.name];
        if ((fromKind === 'f32' || fromKind === 'f64') && toKind !== 'f32' && toKind !== 'f64') {
            // Saturation, NaN is 0 (as in Java).
            if (toKind === 'i64')
                return J.call(this.rt('d2l'), [js]);
            var integer = J.call(this.rt('d2i'), [js]);
            return toKind === 'i32' ? integer : ops.wrap(toKind, integer);
        }
        return ops.convert(fromKind, toKind, js, this.opsContext());
    };
    // A value of the type from in the type to (assignment, argument, return).
    Generator.prototype.convert = function (js, from, to) {
        from = Java.finalType(from);
        to = Java.finalType(to);
        if (to.kind === 'void' || from.kind === 'null')
            return js;
        if (from.kind === 'prim' && to.kind === 'prim')
            return this.convertPrimitive(js, from, to);
        if (from.kind === 'prim') {
            var target = Java.unboxedType(to);
            var value = target !== null && target.name !== from.name ? this.convertPrimitive(js, from, target) : js;
            var kind = target !== null ? target.name : from.name;
            return BOX[kind] !== undefined ? J.call(this.rt(BOX[kind]), [value]) : value;
        }
        if (to.kind === 'prim') {
            var unboxed = Java.primitiveOf(from);
            if (unboxed === null)
                return J.call(this.rt('unboxCast'), [js, J.str(to.name)]);
            var helper = unboxed.name === 'int' ? 'unboxI' : (unboxed.name === 'boolean' ? 'unboxZ' : 'unbox');
            var plain = J.call(this.rt(helper), [js]);
            return unboxed.name === to.name ? plain : this.convertPrimitive(plain, unboxed, to);
        }
        return js;
    };

    Generator.prototype.valueAs = function (node, to) {
        if (node.k === 'arrayinit')
            return this.arrayInitializer(node, Java.finalType(to));
        return this.convert(this.expression(node), node.type, to);
    };

    // A constant in the representation of its type.
    Generator.prototype.literal = function (value) {
        if (typeof value === 'string')
            return J.str(value);
        if (typeof value === 'boolean')
            return J.bool(value);
        if (typeof value === 'number' && isFinite(value) && !(value === 0 && 1 / value < 0))
            return J.num(value);
        return this.constant(value);
    };
    var HANDLERS = {
        literal: 'literalExpression', parens: 'parensExpression', name: 'nameExpression', select: 'selectExpression',
        call: 'callExpression', 'new': 'newExpression', newarray: 'newArrayExpression', index: 'indexExpression',
        prefix: 'incrementExpression', postfix: 'incrementExpression', unary: 'unaryExpression',
        binary: 'binaryExpression', assign: 'assignExpression', cond: 'condExpression',
        'instanceof': 'instanceofExpression', cast: 'castExpression', lambda: 'lambdaExpression',
        methodref: 'methodRefExpression', classlit: 'classLiteralExpression', switchexpr: 'switchExpression'
    };

    Generator.prototype.expression = function (node) {
        var type = node.type !== undefined ? Java.finalType(node.type) : null;
        if (node.cv !== undefined && type !== null &&
            (type.kind === 'prim' || (type.kind === 'class' && type.sym.qname === 'java.lang.String')))
            return this.literal(node.cv);
        if (node.k === 'this')
            return this.thisRef(node.depth);
        if (node.k === 'arrayinit')
            return this.arrayInitializer(node, type);
        var handler = HANDLERS[node.k];
        if (handler === undefined)
            throw new T.CompileError('cannot translate expression', node.line, node.column, this.source);
        return this[handler](node);
    };

    Generator.prototype.literalExpression = function (node) {
        return node.kind === 'null' ? J.nul() : this.literal(node.cv);
    };

    Generator.prototype.parensExpression = function (node) {
        return this.expression(node.expr);
    };
    // --- Names and fields

    Generator.prototype.nameExpression = function (node) {
        var ref = node.ref;
        if (ref.kind === 'local')
            return J.id(ref.variable.jsName);
        var field = ref.field;
        if (field.isStatic || ref.depth < 0)
            return J.mem(this.classRef(field.owner), field.jsName);
        return J.mem(this.thisRef(ref.depth), field.jsName);
    };

    Generator.prototype.selectExpression = function (node) {
        var ref = node.ref;
        if (ref.kind === 'length')
            return J.mem(this.expression(node.target), 'length');
        if (ref.kind === 'static' || ref.field.isStatic)
            return J.mem(this.classRef(ref.field.owner), ref.field.jsName);
        return J.mem(this.expression(node.target), ref.field.jsName);
    };

    function withSetup(setup, node) {
        return setup.length === 0 ? node : J.seq(setup.concat([node]));
    }
    Java.withSetup = withSetup;

    // A place to write to: { setup, get, set(value) }.
    Generator.prototype.place = function (node) {
        while (node.k === 'parens')
            node = node.expr;
        if (node.k === 'name' && node.ref.kind === 'local') {
            var name = J.id(node.ref.variable.jsName);
            return { setup: [], get: name, set: function (value) { return J.assign(name, value); } };
        }
        if (node.k === 'index') {
            var array = this.temp(), index = this.temp();
            var element = J.idx(array, index);
            return { setup: [J.assign(array, this.expression(node.target)), J.assign(index, this.arrayIndex(node.index, array))],
                     get: element, set: function (value) { return J.assign(element, value); } };
        }
        var field = node.ref.field;
        if (field.isStatic || (node.k === 'name' && node.ref.depth < 0)) {
            var target = J.mem(this.classRef(field.owner), field.jsName);
            return { setup: [], get: target, set: function (value) { return J.assign(target, value); } };
        }
        var receiver = this.temp();
        var owner = node.k === 'name' ? this.thisRef(node.ref.depth) : this.expression(node.target);
        var member = J.mem(receiver, field.jsName);
        return { setup: [J.assign(receiver, owner)], get: member, set: function (value) { return J.assign(member, value); } };
    };
    // --- Arrays

    var DESCRIPTORS = { boolean: 'Z', byte: 'B', short: 'S', char: 'C', int: 'I', long: 'J', float: 'F', double: 'D' };

    // A type descriptor as in the JVM: I, [I, [Ljava.lang.String;
    Java.descriptor = function (type) {
        type = Java.erasure(Java.finalType(type));
        if (type.kind === 'prim')
            return DESCRIPTORS[type.name];
        if (type.kind === 'array')
            return '[' + Java.descriptor(type.elem);
        if (type.kind === 'class')
            return 'L' + type.sym.qname + ';';
        return 'Ljava.lang.Object;';
    };

    // An index with a bounds check; array is a simple expression.
    Generator.prototype.arrayIndex = function (indexNode, array) {
        var index = this.valueAs(indexNode, Java.types.int);
        var temporary = this.temp();
        return J.cond(J.bin('<', J.bin('>>>', J.assign(temporary, index), J.num(0)), J.mem(array, 'length')), temporary,
                      J.call(this.rt('indexOutOfBounds'), [temporary, array]));
    };

    Generator.prototype.indexExpression = function (node) {
        var array = this.temp();
        return J.seq([J.assign(array, this.expression(node.target)), J.idx(array, this.arrayIndex(node.index, array))]);
    };

    Generator.prototype.newArrayExpression = function (node) {
        var self = this;
        var type = Java.finalType(node.type);
        if (node.init !== null)
            return this.arrayInitializer(node.init, type);
        var dims = node.dims.map(function (dim) { return self.valueAs(dim, Java.types.int); });
        return J.call(this.rt('newArray'), [J.str(Java.descriptor(type)), J.arr(dims)]);
    };

    Generator.prototype.arrayInitializer = function (node, type) {
        var self = this;
        type = Java.resolved(type);
        var items = node.items.map(function (item) {
            return item.k === 'arrayinit' ? self.arrayInitializer(item, type.elem) : self.valueAs(item, type.elem);
        });
        return J.call(this.rt('arrayOf'), [J.str(Java.descriptor(type)), J.arr(items)]);
    };
    // --- Operations

    // The text of a value in string concatenation (as String.valueOf).
    Generator.prototype.stringOf = function (js, type) {
        type = Java.finalType(type);
        if (type.kind === 'prim') {
            switch (type.name) {
            case 'char':
                return J.call(J.path('String.fromCharCode'), [js]);
            case 'long':
                return J.call(J.path('$T.i64.str'), [js]);
            case 'double':
                return J.call(this.rt('dstr'), [js]);
            case 'float':
                return J.call(this.rt('fstr'), [js]);
            }
            return J.bin('+', J.str(''), js);
        }
        if (js.k === 'str')
            return js;
        if (type.kind === 'class' && type.sym.qname === 'java.lang.String')
            return J.call(this.rt('s'), [js]);
        return J.call(this.rt('str'), [js]);
    };

    Generator.prototype.unaryExpression = function (node) {
        if (node.op === '!')
            return J.not(this.valueAs(node.arg, Java.types.boolean));
        var type = node.opType;
        var value = this.valueAs(node.arg, type);
        if (node.op === '+')
            return value;
        return ops.unary(KINDS[type.name], node.op === '-' ? '-' : '^', value, this.opsContext());
    };

    // Binary arithmetic on converted values; a shift by the mask.
    Generator.prototype.arithmetic = function (op, type, left, right, countType) {
        var kind = KINDS[type.name];
        if (op === '<<' || op === '>>' || op === '>>>') {
            var count = countType !== undefined && countType.name === 'long' ? J.call(J.path('$T.i64.low32'), [right]) : right;
            if (kind === 'i64') {
                count = J.bin('&', count, J.num(63));
                if (op === '>>>')
                    return J.call(this.rt('lushr'), [left, count]);
                return J.call(J.path(op === '<<' ? '$T.i64.shl' : '$T.i64.shr'), [left, count]);
            }
            count = J.bin('&', count, J.num(31));
            if (op === '>>>')
                return J.bin('|', J.bin('>>>', left, count), J.num(0));
            return J.bin(op, left, count);
        }
        return ops.binary(kind, op, left, right, this.opsContext());
    };
    Generator.prototype.binaryExpression = function (node) {
        var op = node.op;
        if (node.opType === 'string')
            return this.concatenation(node);
        if (op === '&&' || op === '||') {
            var leftTest = this.valueAs(node.left, Java.types.boolean);
            var rightTest = this.valueAs(node.right, Java.types.boolean);
            return op === '&&' ? J.and(leftTest, rightTest) : J.or(leftTest, rightTest);
        }
        if (node.opType === 'ref')
            return J.bin(op === '==' ? '===' : '!==', this.expression(node.left), this.expression(node.right));
        var type = node.opType;
        if (type.name === 'boolean') {
            var leftValue = this.valueAs(node.left, type), rightValue = this.valueAs(node.right, type);
            if (op === '==')
                return J.bin('===', leftValue, rightValue);
            if (op === '!=' || op === '^')
                return J.bin('!==', leftValue, rightValue);
            return J.not(J.not(J.bin(op, leftValue, rightValue)));
        }
        var shift = op === '<<' || op === '>>' || op === '>>>';
        var left = this.valueAs(node.left, type);
        var right = this.valueAs(node.right, shift ? node.countType : type);
        if (op === '==' || op === '!=' || op === '<' || op === '>' || op === '<=' || op === '>=')
            return ops.binary(KINDS[type.name], op, left, right, this.opsContext());
        return this.arithmetic(op, type, left, right, node.countType);
    };

    // a + b + c with a string is one concatenation.
    Generator.prototype.concatenation = function (node) {
        var self = this;
        var parts = [];
        (function collect(item) {
            if (item.k === 'binary' && item.op === '+' && item.opType === 'string' && item.cv === undefined) {
                collect(item.left);
                collect(item.right);
                return;
            }
            parts.push(item);
        })(node);
        var result = null;
        parts.forEach(function (part) {
            var text = self.stringOf(self.expression(part), part.type);
            result = result === null ? text : J.bin('+', result, text);
        });
        return result;
    };
    Generator.prototype.assignExpression = function (node) {
        var place = this.place(node.target);
        var targetType = Java.finalType(node.target.type);
        if (node.op === '=')
            return withSetup(place.setup, place.set(this.valueAs(node.rhs, targetType)));
        var op = node.op.slice(0, -1);
        var result;
        if (node.opType === 'string') {
            result = J.bin('+', this.stringOf(place.get, targetType), this.stringOf(this.expression(node.rhs), node.rhs.type));
        } else if (node.opType.name === 'boolean') {
            var current = this.convert(place.get, targetType, node.opType);
            var other = this.valueAs(node.rhs, node.opType);
            var combined = op === '^' ? J.bin('!==', current, other) : J.not(J.not(J.bin(op, current, other)));
            result = this.convert(combined, node.opType, targetType);
        } else {
            var type = node.opType;
            var shift = op === '<<' || op === '>>' || op === '>>>';
            var left = this.convert(place.get, targetType, type);
            var right = this.valueAs(node.rhs, shift ? node.countType : type);
            // Narrowing back to the type of the variable (b += 1 for a byte).
            var prim = Java.primitiveOf(targetType);
            var value = this.convertPrimitive(this.arithmetic(op, type, left, right, node.countType), type, prim);
            result = this.convert(value, prim, targetType);
        }
        return withSetup(place.setup, place.set(result));
    };

    Generator.prototype.incrementExpression = function (node) {
        var self = this;
        var place = this.place(node.arg);
        var type = Java.finalType(node.arg.type);
        var prim = node.opType;
        var promoted = Java.unaryPromotion(prim);
        var op = node.op === '++' ? '+' : '-';
        function stepFrom(value) {
            var number = self.convertPrimitive(self.convert(value, type, prim), prim, promoted);
            var stepped = ops.binary(KINDS[promoted.name], op, number, J.num(1), self.opsContext());
            return self.convert(self.convertPrimitive(stepped, promoted, prim), prim, type);
        }
        if (node.k === 'prefix')
            return withSetup(place.setup, place.set(stepFrom(place.get)));
        var old = this.temp();
        return withSetup(place.setup, J.seq([J.assign(old, place.get), place.set(stepFrom(old)), old]));
    };

    Generator.prototype.condExpression = function (node) {
        var type = Java.finalType(node.type);
        return J.cond(this.valueAs(node.cond, Java.types.boolean), this.valueAs(node.then, type), this.valueAs(node.otherwise, type));
    };
    // Checks the type of a value (instanceof, a cast, a case with a pattern).
    Generator.prototype.typeTest = function (js, type) {
        type = Java.erasure(Java.finalType(type));
        if (type.kind === 'array')
            return J.call(this.rt('isArray'), [js, J.str(Java.descriptor(type))]);
        if (type.kind === 'class' && type.sym === Java.symtab.object)
            return J.bin('!=', js, J.nul());
        return J.call(this.rt('is'), [js, this.classRef(type.sym)]);
    };

    // A pattern variable is a var at the start of the function.
    Generator.prototype.hoist = function (name) {
        if (this.fn.hoisted.indexOf(name) < 0)
            this.fn.hoisted.push(name);
    };

    // A match of the value value (a simple expression) with a pattern: a
    // type check and stores to the pattern variables. A nested pattern that
    // matches any value of the component matches null too.
    Generator.prototype.patternMatch = function (value, pattern, nested) {
        var self = this;
        if (pattern.k === 'pattern') {
            this.hoist(pattern.variable.jsName);
            var bind = J.seq([J.assign(J.id(pattern.variable.jsName), value), J.bool(true)]);
            return nested && pattern.total ? bind : J.and(this.typeTest(value, pattern.testType), bind);
        }
        var parts = [this.typeTest(value, pattern.testType)];
        pattern.patterns.forEach(function (sub, index) {
            var component = self.temp();
            var accessor = J.call(J.mem(value, pattern.accessors[index].jsName), []);
            parts.push(J.seq([J.assign(component, accessor), self.patternMatch(component, sub, true)]));
        });
        return parts.reduce(function (left, right) { return J.and(left, right); });
    };

    Generator.prototype.instanceofExpression = function (node) {
        var value = this.temp();
        if (node.pattern)
            return J.seq([J.assign(value, this.expression(node.expr)), this.patternMatch(value, node.pattern, false)]);
        var test = this.typeTest(J.assign(value, this.expression(node.expr)), node.testType);
        if (!node.variable)
            return test;
        this.hoist(node.variable.jsName);
        return J.and(test, J.seq([J.assign(J.id(node.variable.jsName), value), J.bool(true)]));
    };

    Generator.prototype.castExpression = function (node) {
        var target = Java.finalType(node.castType);
        var operand = node.expr;
        if (operand.k === 'lambda' || operand.k === 'methodref')
            return this.expression(operand);
        var source = Java.finalType(operand.type);
        if (target.kind === 'prim' || source.kind === 'prim')
            return this.convert(this.expression(operand), source, target);
        var erased = Java.erasure(target.kind === 'inter' ? target.types[0] : target);
        var js = this.expression(operand);
        if ((erased.kind === 'class' && erased.sym === Java.symtab.object) || Java.isSubtypeNoBounds(Java.erasure(source), erased))
            return js;
        if (erased.kind === 'array')
            return J.call(this.rt('castArray'), [js, J.str(Java.descriptor(erased))]);
        return J.call(this.rt('cast'), [js, this.classRef(erased.sym)]);
    };

    Generator.prototype.classLiteralExpression = function (node) {
        var type = Java.finalType(node.classType);
        if (type.kind === 'prim' || type.kind === 'void')
            return J.call(this.rt('primitiveClass'), [J.str(type.name)]);
        if (type.kind === 'array')
            return J.call(this.rt('arrayClass'), [J.str(Java.descriptor(type))]);
        return J.call(this.rt('classOf'), [this.classRef(Java.erasure(type).sym)]);
    };
    // --- Calls

    // Classes whose values are JavaScript primitives.
    Java.PRIMITIVE_REPR = { 'java.lang.String': true, 'java.lang.Integer': true, 'java.lang.Boolean': true };
    // Types whose variable may hold such a value.
    var HOLDERS = { 'java.lang.Object': true, 'java.lang.Comparable': true, 'java.lang.CharSequence': true,
                    'java.lang.Number': true, 'java.io.Serializable': true };

    Generator.prototype.argumentsFor = function (args, instance, varargs) {
        var self = this;
        var formals = instance.formals.map(Java.finalType);
        if (!varargs)
            return args.map(function (arg, index) { return self.valueAs(arg, formals[index]); });
        var fixed = formals.length - 1;
        var result = [];
        for (var index = 0; index < fixed; ++index)
            result.push(this.valueAs(args[index], formals[index]));
        var arrayType = formals[fixed];
        var rest = args.slice(fixed).map(function (arg) { return self.valueAs(arg, arrayType.elem); });
        result.push(J.call(this.rt('arrayOf'), [J.str(Java.descriptor(arrayType)), J.arr(rest)]));
        return result;
    };

    Generator.prototype.callArguments = function (node) {
        return this.argumentsFor(node.args, node.instance, node.varargsCall);
    };

    Generator.prototype.emptyVarargs = function (method) {
        return J.call(this.rt('arrayOf'), [J.str(Java.descriptor(method.params[method.params.length - 1])), J.arr([])]);
    };

    // A method call on a value: a native of a primitive class, through $j
    // (the value may be a string or a number) or an ordinary one.
    Generator.prototype.invoke = function (receiver, receiverType, method, args) {
        var owner = method.owner;
        if (Java.PRIMITIVE_REPR[owner.qname] && method.isNative) {
            // A native with this = null would return 0 (Number(null)) instead of an NPE.
            if (receiver.k !== 'str' && receiver.k !== 'this')
                receiver = J.call(this.rt('nonNull'), [receiver]);
            return J.call(J.mem(this.nativeFunction(owner, method), 'call'), [receiver].concat(args));
        }
        var erased = receiverType === null ? null : Java.erasure(Java.finalType(receiverType));
        var holder = erased === null || erased.kind === 'array' ||
            (erased.kind === 'class' && (HOLDERS[erased.sym.qname] || Java.PRIMITIVE_REPR[erased.sym.qname]));
        if (!holder)
            return J.call(J.mem(receiver, method.jsName), args);
        switch (method.jsName) {
        case 'toString':
            // str(null) is "null" (as in string concatenation), but a call is an NPE.
            if (receiver.k !== 'str' && receiver.k !== 'this')
                receiver = J.call(this.rt('nonNull'), [receiver]);
            return J.call(this.rt('str'), [receiver]);
        case 'equals':
            return J.call(this.rt('equals'), [receiver].concat(args));
        case 'hashCode':
            return J.call(this.rt('hashCode'), [receiver]);
        }
        return J.call(this.rt('invoke'), [receiver, J.str(method.jsName), J.arr(args)]);
    };
    Generator.prototype.callExpression = function (node) {
        var method = node.method;
        var args = this.callArguments(node);
        var call;
        if (this.fn.async && this.asyncPossible(method, !method.isStatic && node.callKind !== 'super'))
            return this.fiberCall(node, method, args);
        if (method.isStatic) {
            call = J.call(J.mem(this.classRef(method.owner), method.jsName), args);
        } else if (node.callKind === 'implicit') {
            call = J.call(J.mem(this.thisRef(node.site.depth), method.jsName), args);
        } else if (node.callKind === 'super') {
            var superSym = Java.erasure(node.superType).sym;
            var target = J.mem(J.mem(this.classRef(superSym), 'prototype'), method.jsName);
            call = J.call(J.mem(target, 'call'), [this.thisRef(0)].concat(args));
        } else {
            call = this.invoke(this.expression(node.target), node.receiverType, method, args);
        }
        return this.finishCall(method, call);
    };

    // Whether a call may wait: the method is a fiber or (a call on an
    // object) some override with the same name is a fiber.
    Generator.prototype.asyncPossible = function (method, virtual) {
        if (method.async)
            return true;
        // A library method that waits calls user code (task.run()): any
        // call on an object may wait.
        if (virtual && this.source === T.LIBRARY_SOURCE)
            return true;
        var names = this.session.asyncNames;
        return virtual && names !== undefined && names[method.jsName] === true;
    };

    // A call from a fiber: yield* of the generator of the method (the
    // fiber wrapper has $gen) or the value of an ordinary method.
    Generator.prototype.fiberCall = function (node, method, args) {
        var call;
        if (method.isStatic) {
            call = J.call(this.rt('fiberCall'), [this.classRef(method.owner), J.str(method.jsName), J.arr(args)]);
        } else if (node.callKind === 'implicit') {
            call = J.call(this.rt('fiberCall'), [this.thisRef(node.site.depth), J.str(method.jsName), J.arr(args)]);
        } else if (node.callKind === 'super') {
            var superSym = Java.erasure(node.superType).sym;
            var target = J.mem(J.mem(this.classRef(superSym), 'prototype'), method.jsName);
            call = J.call(this.rt('fiberApply'), [target, this.thisRef(0), J.arr(args)]);
        } else {
            call = J.call(this.rt('fiberCall'), [this.expression(node.target), J.str(method.jsName), J.arr(args)]);
        }
        return J.yield_(call, true);
    };

    // A method reference and other calls: an ordinary call (a fiber goes
    // through a wrapper that waits in place).
    Generator.prototype.finishCall = function (method, call) {
        return call;
    };

    // A fiber function: a generator and a wrapper for ordinary calls.
    Generator.prototype.asyncFunction = function (code) {
        return J.call(this.rt('asyncFunction'), [code]);
    };
    // A local or anonymous class is an expression that defines it (anew on
    // every run: the methods see the variables around).
    Generator.prototype.localClassExpression = function (sym) {
        var self = this;
        var name = '$C' + sym.jsId.replace(/[^A-Za-z0-9_]/g, '_');
        var classes = this.collectClasses(sym, []);
        classes.forEach(function (item, index) {
            self.localClasses.set(item, index === 0 ? name : name + '$' + index);
        });
        var body = [];
        this.orderClasses(classes).forEach(function (item) {
            body = body.concat(self.classDefinition(item, self.localClasses.get(item)));
        });
        classes.forEach(function (item) {
            body.push(J.expr(J.call(self.rt('finishClass'), [J.id(self.localClasses.get(item))])));
        });
        body.push(J.ret(J.id(name)));
        return J.call(J.fn(null, [], body), []);
    };

    Generator.prototype.newExpression = function (node) {
        var sym = node.anonymous || Java.erasure(Java.finalType(node.classType)).sym;
        var args = this.callArguments(node);
        if (!node.anonymous && node.method.isNative)
            return J.call(J.mem(this.classRef(sym), node.method.jsName), args);
        if (!node.anonymous && Java.hasOuter(sym)) {
            var outer = node.outer !== null ? this.expression(node.outer) : this.thisRef(node.outerDepth);
            args = [outer].concat(args);
        }
        var constructorRef = node.anonymous ? this.localClassExpression(sym) : this.classRef(sym);
        var ctorName = node.anonymous ? '$init' : node.method.jsName;
        return J.call(J.mem(J.new_(constructorRef, []), ctorName), args);
    };

    // A lambda is an object of the interface whose method is a function.
    Generator.prototype.functionalObject = function (functional, code) {
        var iface = Java.erasure(Java.finalType(functional.target)).sym;
        return J.call(this.rt('lambda'), [this.classRef(iface), J.str(functional.method.jsName), code]);
    };

    Generator.prototype.lambdaExpression = function (node) {
        var functional = node.functional;
        var saved = this.fn;
        var fn = this.pushFunction(saved.cls, 'lambda', saved);
        fn.lambdaReturns = Java.finalType(functional.returns);
        fn.async = !!node.async;
        var params = node.paramVars.map(function (variable) { return variable.jsName; });
        var body;
        if (node.body.k === 'block')
            body = this.statements(node.body.statements);
        else if (fn.lambdaReturns.kind === 'void')
            body = [J.expr(this.expression(node.body))];
        else
            body = this.returnValue(this.valueAs(node.body, fn.lambdaReturns));
        var code = this.functionCode(fn, params, body);
        this.fn = saved;
        return this.functionalObject(functional, fn.async ? this.asyncFunction(code) : code);
    };
    // The arguments of a method reference: function parameters into method parameters.
    Generator.prototype.referenceArguments = function (names, types, instance, varargs) {
        var self = this;
        var formals = instance.formals.map(Java.finalType);
        var converted = function (index, formal) { return self.convert(J.id(names[index]), types[index], formal); };
        if (!varargs)
            return names.map(function (name, index) { return converted(index, formals[index]); });
        var fixed = formals.length - 1;
        var result = [];
        for (var index = 0; index < fixed; ++index)
            result.push(converted(index, formals[index]));
        var rest = [];
        for (var extra = fixed; extra < names.length; ++extra)
            rest.push(converted(extra, formals[fixed].elem));
        result.push(J.call(this.rt('arrayOf'), [J.str(Java.descriptor(formals[fixed])), J.arr(rest)]));
        return result;
    };

    // The call inside the function of a reference; receiver - for bound and super.
    Generator.prototype.referenceCall = function (node, names, params, receiver) {
        var method = node.method;
        var args;
        switch (node.refKind) {
        case 'arraynew':
            return J.call(this.rt('newArray'), [J.str(Java.descriptor(node.arrayType)),
                                                 J.arr([this.convert(J.id(names[0]), params[0], Java.types.int)])]);
        case 'new': {
            var sym = Java.erasure(node.classType).sym;
            args = this.referenceArguments(names, params, node.instance, node.varargsCall);
            if (method.isNative)
                return J.call(J.mem(this.classRef(sym), method.jsName), args);
            if (Java.hasOuter(sym))
                args = [this.thisRef(node.outerDepth)].concat(args);
            return J.call(J.mem(J.new_(this.classRef(sym), []), method.jsName), args);
        }
        case 'static':
            args = this.referenceArguments(names, params, node.instance, node.varargsCall);
            return J.call(J.mem(this.classRef(method.owner), method.jsName), args);
        case 'unbound':
            args = this.referenceArguments(names.slice(1), params.slice(1), node.instance, node.varargsCall);
            return this.invoke(J.id(names[0]), params[0], method, args);
        case 'super': {
            args = this.referenceArguments(names, params, node.instance, node.varargsCall);
            var superSym = Java.erasure(node.receiverType).sym;
            var target = J.mem(J.mem(this.classRef(superSym), 'prototype'), method.jsName);
            return J.call(J.mem(target, 'call'), [receiver].concat(args));
        }
        }
        args = this.referenceArguments(names, params, node.instance, node.varargsCall);
        return this.invoke(receiver, node.receiverType, method, args);
    };
    Generator.prototype.methodRefExpression = function (node) {
        var functional = node.functional;
        var params = functional.params.map(Java.finalType);
        var names = params.map(function (param, index) { return '$p' + index; });
        var returns = Java.finalType(functional.returns);
        var bound = node.refKind === 'bound' || node.refKind === 'super';
        // The receiver is evaluated once, when the reference is created.
        var receiverValue = !bound ? null : (node.refKind === 'super' ? this.thisRef(0) : this.expression(node.target));
        var saved = this.fn;
        var fn = this.pushFunction(saved.cls, 'lambda', saved);
        var call = this.referenceCall(node, names, params, J.id('$r'));
        var resultType;
        if (node.refKind === 'arraynew')
            resultType = node.arrayType;
        else if (node.refKind === 'new')
            resultType = node.classType;
        else
            resultType = Java.subst(node.method.returns, node.instance.map);
        var body = returns.kind === 'void' ? [J.expr(this.finishCall(node.method, call))]
                                           : this.returnValue(this.convert(this.finishCall(node.method, call), Java.finalType(resultType), returns));
        var code = this.functionCode(fn, names, body);
        this.fn = saved;
        var object = this.functionalObject(functional, code);
        if (!bound)
            return object;
        return J.call(J.fn(null, ['$r'], [J.ret(object)]), [receiverValue]);
    };
})(globalThis);
