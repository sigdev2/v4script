// C: checking of expressions (continues checker.js) - types,
// conversions, pointer arithmetic, constant folding.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var C = T.c;
    var Checker = C.Checker;
    if (Checker.prototype.expr)
        return;

    var types = C.types;
    var big = T.big;
    var wrapConstant = C.wrapConstant;

    function isNullConstant(node) {
        if (node.value === undefined)
            return false;
        if (C.isInteger(node.type))
            return big.sign(node.value) === 0;
        return node.type.kind === 'pointer' && node.type.to.kind === 'void' && big.sign(node.value) === 0;
    }
    C.isNullConstant = isNullConstant;

    // The type of a value: an array and a function are pointers.
    Checker.prototype.decayed = function (node) {
        var type = node.type;
        if (type.kind === 'array')
            return C.pointer(type.of);
        if (type.kind === 'function')
            return C.pointer(type);
        return type;
    };

    Checker.prototype.expr = function (node) {
        if (node.type !== undefined && node.checked)
            return node;
        this.exprOnce(node);
        node.checked = true;
        return node;
    };

    Checker.prototype.exprOnce = function (node) {
        var self = this;
        switch (node.k) {
        case 'ident':
            return this.identifier(node);
        case 'int':
            return this.integerLiteral(node);
        case 'float': {
            var text = node.text.replace(/'/g, '');
            var suffix = /[fFlL]$/.test(text) && !/^0[xX]/.test(text) || /[pP][+-]?\d+[fFlL]$/.test(text) ? text.slice(-1).toLowerCase() : '';
            if (suffix !== '')
                text = text.slice(0, -1);
            var value;
            if (/^0[xX]/.test(text)) {
                var match = /^0[xX]([0-9a-fA-F]*)(?:\.([0-9a-fA-F]*))?[pP]([+-]?\d+)$/.exec(text);
                if (match === null)
                    this.error(node, 'invalid hexadecimal floating constant');
                value = T.rat.toFloat(T.rat.parse(text));
            } else {
                if (!/^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text))
                    this.error(node, 'invalid suffix on floating constant');
                value = Number(text);
            }
            node.type = suffix === 'f' ? types.float : (suffix === 'l' ? types.ldouble : types.double);
            node.value = suffix === 'f' ? Math.fround(value) : value;
            return;
        }
        case 'char':
            node.type = node.wide ? types.int : types.int;
            node.value = node.value;
            return;
        case 'string':
            node.type = C.array(node.wide ? types.int : types.char, node.bytes.length + 1);
            node.lvalue = true;
            return;
        case 'bool':
            node.type = types.int;
            node.value = node.value ? 1 : 0;
            return;
        case 'nullptr':
            node.type = C.pointer(types.void);
            node.value = 0;
            return;
        case 'paren':
            this.expr(node.expr);
            node.type = node.expr.type;
            node.lvalue = node.expr.lvalue;
            node.value = node.expr.value;
            node.bitfield = node.expr.bitfield;
            return;
        case 'call':
            return this.call(node);
        case 'index':
            return this.index(node);
        case 'member':
            return this.member(node);
        case 'postinc':
        case 'preinc':
            this.expr(node.expr);
            this.modifiable(node.expr, node.op === '++' ? 'increment' : 'decrement');
            var operandType = this.decayed(node.expr);
            if (!C.isScalar(operandType))
                this.error(node, 'cannot ' + (node.op === '++' ? 'increment' : 'decrement') + ' value of type ' +
                           this.typeName(operandType));
            if (operandType.kind === 'pointer' && !this.isComplete(operandType.to))
                this.error(node, 'arithmetic on a pointer to an incomplete type ' + this.typeName(operandType.to));
            node.type = operandType;
            return;
        case 'unary':
            return this.unary(node);
        case 'sizeof':
        case 'alignof': {
            var measured;
            if (node.typeName !== undefined) {
                measured = this.typeNameType(node.typeName);
            } else {
                this.expr(node.expr);
                measured = node.expr.type;
                if (node.expr.bitfield)
                    this.error(node, 'invalid application of \'sizeof\' to bit-field');
            }
            if (measured.kind === 'function')
                this.error(node, "invalid application of '" + node.k + "' to a function type");
            if (measured.vla && node.k === 'sizeof') {
                node.vlaType = measured;
                node.type = types.ulong;
                return;
            }
            if (!this.isComplete(measured))
                this.error(node, "invalid application of '" + node.k + "' to an incomplete type " + this.typeName(measured));
            node.type = types.ulong;
            node.value = node.k === 'sizeof' ? measured.size : measured.align;
            return;
        }
        case 'cast':
            return this.cast(node);
        case 'binary':
            return this.binary(node);
        case 'assign':
            return this.assign(node);
        case 'cond':
            return this.conditionalExpr(node);
        case 'comma':
            node.list.forEach(function (item) { self.expr(item); });
            var last = node.list[node.list.length - 1];
            node.type = this.decayed(last);
            return;
        case 'compound': {
            var literalType = this.typeNameType(node.typeName);
            this.initializer(node.init, literalType, node);
            if (literalType.kind === 'array' && literalType.length === null)
                literalType = C.array(literalType.of, node.init.inferredLength);
            node.type = literalType;
            node.lvalue = true;
            if (this.func !== null) {
                node.object = this.newLocal('$compound', literalType, node);
                node.object.addressTaken = true;
            }
            return;
        }
        case 'vastart':
        case 'vaend':
        case 'vacopy': {
            this.expr(node.ap);
            if (node.ap.type !== types.valist)
                this.error(node.ap, "argument to '" + (node.k === 'vastart' ? 'va_start' : (node.k === 'vaend' ? 'va_end' : 'va_copy')) +
                           "' is of type " + this.typeName(node.ap.type) + " and not 'va_list'");
            if (node.k !== 'vaend')
                this.modifiable(node.ap, 'assign');
            if (node.k === 'vastart' && (this.func === null || this.func.object === null || !this.func.type.variadic))
                this.error(node, "'va_start' used in function with fixed parameters");
            if (node.k === 'vacopy') {
                this.expr(node.source);
                if (node.source.type !== types.valist)
                    this.error(node.source, "argument to 'va_copy' is of type " + this.typeName(node.source.type) + " and not 'va_list'");
            }
            node.type = types.void;
            return;
        }
        case 'vaarg': {
            this.expr(node.ap);
            if (node.ap.type !== types.valist)
                this.error(node.ap, "first argument to 'va_arg' is of type " + this.typeName(node.ap.type) + " and not 'va_list'");
            node.type = this.typeNameType(node.typeName);
            return;
        }
        case 'offsetof': {
            var recordType = this.typeNameType(node.typeName);
            var offset = 0;
            var current = recordType;
            for (var index = 0; index < node.path.length; ++index) {
                if (!C.isRecord(current))
                    this.error(node, 'offsetof requires struct, union, or class type, ' + this.typeName(current) + ' invalid');
                var path = this.findField(current, node.path[index]);
                if (path === null)
                    this.error(node, "no member named '" + node.path[index] + "' in " + this.typeName(current));
                path.forEach(function (field) { offset += field.offset; });
                current = path[path.length - 1].type;
            }
            node.type = types.ulong;
            node.value = offset;
            return;
        }
        }
        this.error(node, 'unexpected expression');
    };

    Checker.prototype.identifier = function (node) {
        var object = this.scope.lookup(node.name);
        if (object === null && node.name === '__func__' && this.func !== null) {
            // The name of a function is a string.
            var name = T.utf8.encode(this.func.object !== null ? this.func.object.name : 'main');
            node.k = 'string';
            node.bytes = name.split('').map(function (ch) { return ch.charCodeAt(0); });
            node.wide = false;
            return this.exprOnce(node);
        }
        if (object === null)
            this.error(node, "use of undeclared identifier '" + node.name + "'");
        node.obj = object;
        switch (object.kind) {
        case 'var':
            node.type = object.type;
            node.lvalue = true;
            if (this.func !== null && object.storage === 'local' && object.func === undefined)
                object.func = this.func;
            return;
        case 'func':
            node.type = object.type;
            node.lvalue = false;
            if (this.func !== null)
                this.func.calls.push(object);
            // The address of the function is taken: it may be called through a pointer.
            if (!node.callee)
                object.addressTaken = true;
            return;
        case 'enumconst':
            node.type = types.int;
            node.value = object.value;
            return;
        case 'typedef':
            this.error(node, "unexpected type name '" + node.name + "': expected expression");
        }
    };

    // The type of an integer constant in C: the first that fits from a list.
    Checker.prototype.integerLiteral = function (node) {
        var parsed = C.parseIntegerToken({ value: node.text, line: node.line, column: node.column, file: node.file });
        if (parsed === null)
            this.error(node, "invalid integer constant '" + node.text + "'");
        var value = parsed.value;
        var candidates;
        if (parsed.unsigned)
            candidates = parsed.long === 2 ? [types.ullong] : (parsed.long === 1 ? [types.ulong, types.ullong] : [types.uint, types.ulong, types.ullong]);
        else if (parsed.decimal)
            candidates = parsed.long === 2 ? [types.llong] : (parsed.long === 1 ? [types.long, types.llong] : [types.int, types.long, types.llong]);
        else
            candidates = parsed.long === 2 ? [types.llong, types.ullong]
                : (parsed.long === 1 ? [types.long, types.ulong, types.llong, types.ullong]
                                     : [types.int, types.uint, types.long, types.ulong, types.llong, types.ullong]);
        for (var index = 0; index < candidates.length; ++index) {
            var type = candidates[index];
            var bits = type.size * 8;
            var max = type.signed ? big.sub(big.pow(2, bits - 1), 1) : big.sub(big.pow(2, bits), 1);
            if (big.cmp(value, max) <= 0) {
                node.type = type;
                node.value = value;
                return;
            }
        }
        this.error(node, 'integer literal is too large to be represented in any integer type');
    };

    // --- Conversions

    Checker.prototype.modifiable = function (node, what) {
        var inner = node;
        while (inner.k === 'paren')
            inner = inner.expr;
        if (!node.lvalue)
            this.error(node, 'expression is not assignable');
        if (node.type.kind === 'array')
            this.error(node, 'array type ' + this.typeName(node.type) + ' is not assignable');
        if (inner.k === 'ident' && inner.obj.isConst)
            this.error(node, "cannot assign to variable '" + inner.obj.name + "' with const-qualified type " +
                       this.typeName(inner.obj.type));
        void what;
    };

    // Whether the value of node can be stored in the type target
    // (assignment, argument, return, initialization).
    Checker.prototype.assignable = function (node, target, context) {
        var source = this.decayed(node);
        if (target.kind === 'valist' && source.kind === 'valist')
            return;
        if (C.isArithmetic(target) && C.isArithmetic(source))
            return;
        if (target === types.bool && source.kind === 'pointer')
            return;
        if (target.kind === 'pointer') {
            if (source.kind === 'pointer') {
                if (target.to.kind === 'void' || source.to.kind === 'void' || C.compatible(target.to, source.to) ||
                    (C.isInteger(target.to) && C.isInteger(source.to) && target.to.size === source.to.size))
                    return;
                // Incompatible pointers are only a warning in C; allowed,
                // as in gcc.
                return;
            }
            if (isNullConstant(node))
                return;
            if (C.isInteger(source))
                this.error(node, 'incompatible integer to pointer conversion ' + context + ' ' + this.typeName(target) +
                           ' with an expression of type ' + this.typeName(source));
        }
        if (C.isInteger(target) && source.kind === 'pointer')
            this.error(node, 'incompatible pointer to integer conversion ' + context + ' ' + this.typeName(target) +
                       ' with an expression of type ' + this.typeName(source));
        if (C.isRecord(target) && source === target)
            return;
        this.error(node, (context === 'initializing' ? 'initializing ' + this.typeName(target) + ' with an expression of incompatible type '
                                                     : context + ' ' + this.typeName(target) + ' from incompatible type ') +
                   this.typeName(source));
    };

    // --- Call

    Checker.prototype.call = function (node) {
        var self = this;
        var fn = node.fn;
        var inner = fn;
        while (inner.k === 'paren')
            inner = inner.expr;
        if (inner.k === 'ident' && this.scope.lookup(inner.name) === null) {
            this.error(inner, "call to undeclared function '" + inner.name +
                       "'; ISO C99 and later do not support implicit function declarations");
        }
        if (inner.k === 'ident')
            inner.callee = true;
        this.expr(fn);
        var fnType = this.decayed(fn);
        if (fnType.kind !== 'pointer' || fnType.to.kind !== 'function')
            this.error(node, 'called object type ' + this.typeName(fnType) + ' is not a function or function pointer');
        var signature = fnType.to;
        node.signature = signature;
        if (inner.k === 'ident' && inner.obj.kind === 'func')
            node.direct = inner.obj;
        var args = node.args;
        var params = signature.params;
        if (!signature.unspecified) {
            if (args.length < params.length)
                this.error(node, 'too few arguments to function call, expected ' + (signature.variadic ? 'at least ' : '') +
                           params.length + ', have ' + args.length);
            if (args.length > params.length && !signature.variadic)
                this.error(args[params.length], 'too many arguments to function call, expected ' + params.length +
                           ', have ' + args.length);
        }
        node.argTypes = [];
        args.forEach(function (arg, index) {
            self.expr(arg);
            var argType = self.decayed(arg);
            if (argType.kind === 'void')
                self.error(arg, "argument type 'void' is incomplete");
            if (index < params.length && !signature.unspecified) {
                self.assignable(arg, params[index], 'passing ' + self.typeName(argType) + ' to parameter of type');
                node.argTypes.push(params[index]);
            } else {
                // Variable arguments: the default promotions.
                var promoted = argType === types.float ? types.double : (C.isInteger(argType) ? C.promote(argType) : argType);
                node.argTypes.push(promoted);
            }
        });
        node.type = signature.returns;
        if (node.direct !== undefined && node.direct.nativeAsync && this.func !== null)
            this.func.blocking = true;
        if (node.direct === undefined && this.func !== null)
            this.func.dynamicCalls = true;
    };

    // --- Index and field

    Checker.prototype.index = function (node) {
        this.expr(node.expr);
        this.expr(node.index);
        var base = this.decayed(node.expr), index = this.decayed(node.index);
        if (base.kind !== 'pointer' && index.kind === 'pointer') {
            // i[a] is the same as a[i].
            node.swapped = true;
            var swap = base;
            base = index;
            index = swap;
        }
        if (base.kind !== 'pointer')
            this.error(node, 'subscripted value is not an array, pointer, or vector');
        if (!C.isInteger(index))
            this.error(node.index, 'array subscript is not an integer');
        if (base.to.kind === 'void' || !this.isComplete(base.to) && base.to.kind !== 'array')
            this.error(node, 'subscript of pointer to incomplete type ' + this.typeName(base.to));
        node.type = base.to;
        node.lvalue = true;
        node.elemSize = base.to.size;
    };

    Checker.prototype.member = function (node) {
        this.expr(node.expr);
        var base = node.expr.type;
        if (node.arrow) {
            base = this.decayed(node.expr);
            if (base.kind !== 'pointer')
                this.error(node, 'member reference type ' + this.typeName(base) + ' is not a pointer' +
                           (C.isRecord(base) ? "; did you mean to use '.'?" : ''));
            base = base.to;
        } else if (base.kind === 'pointer' && C.isRecord(base.to)) {
            this.error(node, 'member reference type ' + this.typeName(base) + " is a pointer; did you mean to use '->'?");
        }
        if (!C.isRecord(base))
            this.error(node, 'member reference base type ' + this.typeName(base) + ' is not a structure or union');
        if (!base.complete)
            this.error(node, 'incomplete definition of type ' + this.typeName(base));
        var path = this.findField(base, node.name);
        if (path === null)
            this.error(node, "no member named '" + node.name + "' in " + this.typeName(base));
        var offset = 0;
        path.forEach(function (field) { offset += field.offset; });
        var field = path[path.length - 1];
        node.offset = offset;
        node.field = field;
        node.type = field.type;
        node.lvalue = node.arrow || node.expr.lvalue;
        if (field.bits !== null)
            node.bitfield = field;
    };

    // --- Unary operators

    Checker.prototype.unary = function (node) {
        this.expr(node.expr);
        var operand = node.expr;
        var type;
        switch (node.op) {
        case '&': {
            var inner = operand;
            while (inner.k === 'paren')
                inner = inner.expr;
            if (operand.type.kind === 'function') {
                node.type = C.pointer(operand.type);
                return;
            }
            if (!operand.lvalue)
                this.error(node, 'cannot take the address of an rvalue of type ' + this.typeName(operand.type));
            if (operand.bitfield)
                this.error(node, 'address of bit-field requested');
            if (inner.k === 'ident' && inner.obj.kind === 'var')
                inner.obj.addressTaken = true;
            node.type = C.pointer(operand.type);
            return;
        }
        case '*': {
            type = this.decayed(operand);
            if (type.kind !== 'pointer')
                this.error(node, 'indirection requires pointer operand (' + this.typeName(type) + ' invalid)');
            if (type.to.kind === 'void')
                this.error(node, "indirection of non-volatile null pointer will be deleted, not trap; void pointer can't be dereferenced");
            node.type = type.to;
            node.lvalue = type.to.kind !== 'function';
            return;
        }
        case '+':
        case '-':
            type = this.decayed(operand);
            if (!C.isArithmetic(type))
                this.error(node, 'invalid argument type ' + this.typeName(type) + ' to unary expression');
            node.type = C.promote(type);
            if (operand.value !== undefined)
                node.value = wrapConstant(node.op === '-' ? negate(operand.value) : operand.value, node.type);
            return;
        case '~':
            type = this.decayed(operand);
            if (!C.isInteger(type))
                this.error(node, 'invalid argument type ' + this.typeName(type) + ' to unary expression');
            node.type = C.promote(type);
            if (operand.value !== undefined)
                node.value = wrapConstant(big.not(operand.value), node.type);
            return;
        case '!':
            type = this.decayed(operand);
            if (!C.isScalar(type))
                this.error(node, 'invalid argument type ' + this.typeName(type) + ' to unary expression');
            node.type = types.int;
            if (operand.value !== undefined)
                node.value = isZero(operand.value) ? 1 : 0;
            return;
        }
    };

    function negate(value) {
        return typeof value === 'number' && !Number.isInteger(value) ? -value : (typeof value === 'number' ? -value : big.neg(value));
    }

    function isZero(value) {
        return typeof value === 'number' ? value === 0 : big.sign(value) === 0;
    }

    function toNumber(value) {
        return typeof value === 'number' ? value : big.toFloat(value);
    }

    // --- Cast

    Checker.prototype.cast = function (node) {
        var target = this.typeNameType(node.typeName);
        this.expr(node.expr);
        var source = this.decayed(node.expr);
        node.type = target;
        if (target.kind === 'void')
            return;
        if (C.isRecord(target) || target.kind === 'array' || target.kind === 'function')
            this.error(node, 'used type ' + this.typeName(target) + ' where arithmetic or pointer type is required');
        if (!C.isScalar(source))
            this.error(node, 'operand of type ' + this.typeName(source) + ' where arithmetic or pointer type is required');
        if (C.isFloat(source) && target.kind === 'pointer' || C.isFloat(target) && source.kind === 'pointer')
            this.error(node, 'cannot cast ' + this.typeName(source) + ' to ' + this.typeName(target));
        if (node.expr.value !== undefined && (C.isArithmetic(target) || target.kind === 'pointer'))
            node.value = castConstant(node.expr.value, source, target);
    };

    function castConstant(value, source, target) {
        if (C.isFloat(target))
            return target === types.float ? Math.fround(toNumber(value)) : toNumber(value);
        if (C.isFloat(source))
            value = big.fromFloat(Math.trunc(value));
        return wrapConstant(value, target);
    }

    // --- Binary operators

    var COMPARISON = { '<': 1, '>': 1, '<=': 1, '>=': 1, '==': 1, '!=': 1 };

    Checker.prototype.binary = function (node) {
        this.expr(node.left);
        this.expr(node.right);
        var op = node.op;
        var left = this.decayed(node.left), right = this.decayed(node.right);
        var leftValue = node.left.value, rightValue = node.right.value;
        if (op === '&&' || op === '||') {
            if (!C.isScalar(left) || !C.isScalar(right))
                this.invalidOperands(node, left, right);
            node.type = types.int;
            if (leftValue !== undefined && rightValue !== undefined)
                node.value = (op === '&&' ? !isZero(leftValue) && !isZero(rightValue) : !isZero(leftValue) || !isZero(rightValue)) ? 1 : 0;
            else if (leftValue !== undefined && (op === '&&' ? isZero(leftValue) : !isZero(leftValue)))
                node.value = op === '&&' ? 0 : 1;
            return;
        }
        if (COMPARISON[op] === 1) {
            node.type = types.int;
            if (C.isArithmetic(left) && C.isArithmetic(right))
                node.opType = C.commonType(left, right);
            else if (left.kind === 'pointer' && right.kind === 'pointer')
                node.opType = left;
            else if (left.kind === 'pointer' && C.isInteger(right) || C.isInteger(left) && right.kind === 'pointer')
                node.opType = left.kind === 'pointer' ? left : right;
            else
                this.invalidOperands(node, left, right);
            if (leftValue !== undefined && rightValue !== undefined && node.opType.kind !== 'pointer')
                node.value = compareConstants(op, leftValue, rightValue, node.opType) ? 1 : 0;
            return;
        }
        if ((op === '+' || op === '-') && (left.kind === 'pointer' || right.kind === 'pointer')) {
            if (op === '+' && left.kind === 'pointer' && right.kind === 'pointer')
                this.invalidOperands(node, left, right);
            if (op === '-' && left.kind === 'pointer' && right.kind === 'pointer') {
                if (!C.compatible(left.to, right.to))
                    this.error(node, "'" + C.typeString(left) + "' and '" + C.typeString(right) + "' are not pointers to compatible types");
                node.pointerDifference = true;
                node.elemSize = Math.max(1, left.to.size);
                node.type = types.long;
                return;
            }
            var pointerType = left.kind === 'pointer' ? left : right;
            var offsetType = left.kind === 'pointer' ? right : left;
            if (!C.isInteger(offsetType))
                this.invalidOperands(node, left, right);
            if (op === '-' && right.kind === 'pointer')
                this.invalidOperands(node, left, right);
            if (!this.isComplete(pointerType.to) && pointerType.to.kind !== 'void')
                this.error(node, 'arithmetic on a pointer to an incomplete type ' + this.typeName(pointerType.to));
            node.pointerArithmetic = left.kind === 'pointer' ? 'left' : 'right';
            node.elemSize = pointerType.to.kind === 'void' || pointerType.to.kind === 'function' ? 1 : pointerType.to.size;
            node.type = pointerType;
            return;
        }
        if (op === '<<' || op === '>>') {
            if (!C.isInteger(left) || !C.isInteger(right))
                this.invalidOperands(node, left, right);
            node.type = C.promote(left);
            node.opType = node.type;
            node.countType = C.promote(right);
            if (leftValue !== undefined && rightValue !== undefined) {
                var count = toNumber(rightValue);
                if (count >= 0 && count < node.type.size * 8)
                    node.value = wrapConstant(op === '<<' ? big.shl(leftValue, count) : big.shr(leftValue, count), node.type);
            }
            return;
        }
        var integerOnly = op === '%' || op === '&' || op === '|' || op === '^';
        if (integerOnly ? !(C.isInteger(left) && C.isInteger(right)) : !(C.isArithmetic(left) && C.isArithmetic(right)))
            this.invalidOperands(node, left, right);
        node.type = C.commonType(left, right);
        node.opType = node.type;
        if (leftValue !== undefined && rightValue !== undefined) {
            if ((op === '/' || op === '%') && C.isInteger(node.type) && isZero(rightValue))
                return;
            node.value = arithmeticConstant(op, leftValue, rightValue, node.type);
        }
    };

    Checker.prototype.invalidOperands = function (node, left, right) {
        this.error(node, 'invalid operands to binary expression (' + this.typeName(left) + ' and ' + this.typeName(right) + ')');
    };

    function compareConstants(op, left, right, type) {
        var order;
        if (C.isFloat(type)) {
            left = toNumber(left);
            right = toNumber(right);
            order = left < right ? -1 : (left > right ? 1 : 0);
        } else {
            order = big.cmp(wrapConstant(left, type), wrapConstant(right, type));
        }
        switch (op) {
        case '<':
            return order < 0;
        case '>':
            return order > 0;
        case '<=':
            return order <= 0;
        case '>=':
            return order >= 0;
        case '==':
            return order === 0;
        }
        return order !== 0;
    }

    function arithmeticConstant(op, left, right, type) {
        if (C.isFloat(type)) {
            left = toNumber(left);
            right = toNumber(right);
            var result = op === '+' ? left + right
                : (op === '-' ? left - right : (op === '*' ? left * right : left / right));
            return type === types.float ? Math.fround(result) : result;
        }
        left = wrapConstant(left, type);
        right = wrapConstant(right, type);
        switch (op) {
        case '+':
            return wrapConstant(big.add(left, right), type);
        case '-':
            return wrapConstant(big.sub(left, right), type);
        case '*':
            return wrapConstant(big.mul(left, right), type);
        case '/':
            return wrapConstant(big.quot(left, right), type);
        case '%':
            return wrapConstant(big.rem(left, right), type);
        case '&':
            return wrapConstant(big.and(left, right), type);
        case '|':
            return wrapConstant(big.or(left, right), type);
        case '^':
            return wrapConstant(big.xor(left, right), type);
        }
        return undefined;
    }

    // --- Assignment

    Checker.prototype.assign = function (node) {
        this.expr(node.target);
        this.expr(node.source);
        this.modifiable(node.target, 'assign');
        var target = node.target.type;
        node.type = target;
        if (node.op === '=') {
            this.assignable(node.source, target, 'assigning to');
            return;
        }
        var op = node.op.slice(0, -1);
        var value = this.decayed(node.source);
        if (target.kind === 'pointer' && (op === '+' || op === '-')) {
            if (!C.isInteger(value))
                this.invalidOperands(node, target, value);
            node.pointerArithmetic = 'left';
            node.elemSize = target.to.kind === 'void' ? 1 : target.to.size;
            return;
        }
        var integerOnly = op === '%' || op === '&' || op === '|' || op === '^' || op === '<<' || op === '>>';
        if (integerOnly ? !(C.isInteger(target) && C.isInteger(value)) : !(C.isArithmetic(target) && C.isArithmetic(value)))
            this.invalidOperands(node, target, value);
        node.opType = op === '<<' || op === '>>' ? C.promote(target) : C.commonType(target, value);
    };

    // --- ?:

    Checker.prototype.conditionalExpr = function (node) {
        this.expr(node.cond);
        if (!C.isScalar(this.decayed(node.cond)))
            this.error(node.cond, 'used type ' + this.typeName(this.decayed(node.cond)) + ' where arithmetic or pointer type is required');
        var thenNode = node.then === null ? node.cond : node.then;
        this.expr(thenNode);
        this.expr(node.otherwise);
        var thenType = this.decayed(thenNode), otherwiseType = this.decayed(node.otherwise);
        if (C.isArithmetic(thenType) && C.isArithmetic(otherwiseType))
            node.type = C.commonType(thenType, otherwiseType);
        else if (thenType.kind === 'void' || otherwiseType.kind === 'void')
            node.type = types.void;
        else if (thenType.kind === 'pointer' && (otherwiseType.kind === 'pointer' || isNullConstant(node.otherwise)))
            node.type = otherwiseType.kind === 'pointer' && thenType.to.kind === 'void' ? otherwiseType : thenType;
        else if (otherwiseType.kind === 'pointer' && isNullConstant(thenNode))
            node.type = otherwiseType;
        else if (C.isRecord(thenType) && thenType === otherwiseType)
            node.type = thenType;
        else
            this.error(node, 'incompatible operand types (' + this.typeName(thenType) + ' and ' +
                this.typeName(otherwiseType) + ')');
        if (node.cond.value !== undefined && thenNode.value !== undefined && node.otherwise.value !== undefined &&
            C.isArithmetic(node.type))
            node.value = castConstant(isZero(node.cond.value) ? node.otherwise.value : thenNode.value,
                                      isZero(node.cond.value) ? otherwiseType : thenType, node.type);
    };
})(globalThis);
