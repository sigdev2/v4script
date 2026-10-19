// Java: checking expressions - literals, names, fields, operations,
// casts. The marking for translation: node.type, node.cv (the value of a
// constant), node.ref (what a name refers to), node.conv (the conversion
// of the value).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Java = T.java;
    var Checker = Java.Checker;
    if (Checker.prototype.expr)
        return;

    var types = Java.types;
    var i64 = T.i64, big = T.big;

    // An argument of a call: a generic call inside leaves the inference
    // variables unresolved - the outer call resolves them.
    Java.POLY = { kind: 'poly' };

    Checker.prototype.expr = function (node, env, expected) {
        var type = this.exprOnce(node, env, expected === undefined ? null : expected);
        node.type = type;
        return type;
    };

    Checker.prototype.exprOnce = function (node, env, expected) {
        switch (node.k) {
        case 'literal':
            return this.literal(node);
        case 'name':
            return this.nameExpr(node, env);
        case 'select':
            return this.selectExpr(node, env);
        case 'parens': {
            var inner = this.expr(node.expr, env, expected);
            node.cv = node.expr.cv;
            return inner;
        }
        case 'call':
            return this.callExpr(node, env, expected);
        case 'new':
            return this.newExpr(node, env, expected);
        case 'newarray':
            return this.newArrayExpr(node, env);
        case 'arrayinit':
            if (expected === null || expected === Java.POLY || Java.resolved(expected).kind !== 'array')
                this.error(node, 'illegal initializer for ' + (expected && expected.kind ? this.typeName(expected) : 'expression'));
            this.arrayInit(node, Java.resolved(expected), env);
            return expected;
        case 'index':
            return this.indexExpr(node, env);
        case 'prefix':
        case 'postfix':
            return this.incrementExpr(node, env);
        case 'unary':
            return this.unaryExpr(node, env);
        case 'binary':
            return this.binaryExpr(node, env);
        case 'assign':
            return this.assignExpr(node, env);
        case 'cond':
            return this.condExpr(node, env, expected);
        case 'instanceof':
            return this.instanceofExpr(node, env);
        case 'cast':
            return this.castExpr(node, env);
        case 'lambda':
            return this.lambdaExpr(node, env, expected);
        case 'methodref':
            return this.methodRefExpr(node, env, expected);
        case 'this':
            return this.thisExpr(node, env);
        case 'super':
            this.error(node, "'.' expected");
            break;
        case 'classlit':
            return this.classLiteral(node, env);
        case 'switchexpr':
            return this.switchExpr(node, env, expected);
        case 'ctorcall':
            this.error(node, 'call to ' + node.kind + ' must be first statement in constructor');
            break;
        }
        this.error(node, 'illegal start of expression');
    };
    // --- Literals

    Checker.prototype.literal = function (node) {
        switch (node.kind) {
        case 'int':
            return this.integerLiteral(node);
        case 'float': {
            var text = node.text.replace(/_/g, '');
            var isFloat = /[fF]$/.test(text);
            var digits = text.replace(/[fFdD]$/, '');
            var value = /^0[xX]/.test(digits) ? T.rat.toFloat(T.rat.parse(digits.toLowerCase())) : Number(digits);
            if (!isFinite(value) || (isFloat && !isFinite(Math.fround(value))))
                this.error(node, 'floating-point number too large');
            if (value === 0 && /[1-9]/.test(digits.replace(/[eEpP].*$/, '')))
                this.error(node, 'floating-point number too small');
            node.cv = isFloat ? Math.fround(value) : value;
            return isFloat ? types.float : types.double;
        }
        case 'char':
            node.cv = node.value;
            return types.char;
        case 'string':
            node.cv = node.value;
            return Java.stringType();
        case 'boolean':
            node.cv = node.value;
            return types.boolean;
        case 'null':
            return types.nul;
        }
        this.error(node, 'illegal literal');
    };

    Checker.prototype.integerLiteral = function (node) {
        var text = node.text.replace(/_/g, '');
        var negative = text.charAt(0) === '-';
        if (negative)
            text = text.substring(1);
        var isLong = /[lL]$/.test(text);
        if (isLong)
            text = text.slice(0, -1);
        var radix = 10, digits = text;
        if (/^0[xX]/.test(text)) {
            radix = 16;
            digits = text.substring(2);
        } else if (/^0[bB]/.test(text)) {
            radix = 2;
            digits = text.substring(2);
        } else if (text.length > 1 && text.charAt(0) === '0') {
            radix = 8;
            digits = text.substring(1);
        }
        var value = big.parse(digits, radix);
        if (value === null)
            this.error(node, 'illegal digit in literal');
        var bits = isLong ? 64 : 32;
        // A decimal one up to 2^(n-1) (the minus is separate), the others all n bits.
        var limit = radix === 10 ? big.pow(2, bits - 1) : big.sub(big.pow(2, bits), 1);
        if (big.cmp(value, limit) > 0 || (radix === 10 && !negative && big.cmp(value, limit) === 0))
            this.error(node, 'integer number too large');
        if (negative)
            value = big.neg(value);
        if (isLong) {
            node.cv = T.bigToI64(value, true);
            return types.long;
        }
        node.cv = big.toFloat(value) | 0;
        return types.int;
    };
    // --- Names

    // A variable by a simple name: { kind: 'local', variable } or
    // { kind: 'field', field, map, cls, depth } (depth - how many outer
    // classes from the current one) or null.
    Checker.prototype.lookupVariable = function (name, env) {
        var depth = 0;
        var crossedMethod = null;
        for (var current = env; current !== null; current = current.parent) {
            if (current.vars !== null && current.vars[name] !== undefined) {
                var variable = current.vars[name];
                return { kind: 'local', variable: variable, captured: crossedMethod };
            }
            if (current.kind === 'method' || current.kind === 'lambda')
                crossedMethod = crossedMethod || current;
            if (current.kind === 'class' && !current.cls.isSession) {
                var cls = current.cls;
                var found = Java.findField(cls.complete().thisType, name);
                if (found !== null)
                    return { kind: 'field', field: found.field, map: found.map, cls: cls, depth: depth, env: current };
                ++depth;
                // Method variables beyond a local class are captured.
                crossedMethod = crossedMethod || current;
            }
            if (current.kind === 'top') {
                var sessionVar = current.pkg === '' && !current.module ? this.session.userVariable(name, current) : null;
                if (sessionVar !== null)
                    return { kind: 'field', field: sessionVar, map: null, cls: sessionVar.owner, depth: -1, env: current };
                var imported = this.staticImported(current, name, 'field');
                if (imported !== null)
                    return { kind: 'field', field: imported.field, map: imported.map, cls: imported.field.owner, depth: -1, env: current };
            }
        }
        return null;
    };

    // Whether the context between env and the class cls of the field is static.
    Checker.prototype.isStaticContext = function (env, cls) {
        for (var current = env; current !== null; current = current.parent) {
            if (current.kind === 'method' && current.isStatic)
                return true;
            if (current.kind === 'class') {
                if (current.cls === cls)
                    return false;
                if (!current.cls.isInner && !current.cls.isLocal && !current.cls.isAnonymous)
                    return true;
            }
            if (current.kind === 'staticinit')
                return true;
        }
        return false;
    };

    Checker.prototype.nameExpr = function (node, env) {
        var ref = this.lookupVariable(node.name, env);
        if (ref === null) {
            var type = this.lookupTypeName(node.name, env);
            if (type !== null)
                this.error(node, 'cannot find symbol: variable ' + node.name);
            this.error(node, 'cannot find symbol: variable ' + node.name);
        }
        node.ref = ref;
        if (ref.kind === 'local') {
            var variable = ref.variable;
            if (ref.captured !== null && ref.captured !== undefined) {
                variable.captured = variable.captured || node;
                this.noteCapture(variable, node);
            }
            if (variable.cv !== undefined)
                node.cv = variable.cv;
            return variable.type;
        }
        var field = ref.field;
        if (!field.isStatic && ref.depth >= 0 && this.isStaticContext(env, ref.cls))
            this.error(node, 'non-static variable ' + node.name + ' cannot be referenced from a static context');
        if (this.fieldConstant(field) !== undefined)
            node.cv = field.constant;
        return Java.subst(field.type, ref.map);
    };
    // The left part of a.b: an expression, a type or a package.
    // The result: { kind: 'expr', type } | { kind: 'type', type } |
    // { kind: 'package', name }.
    Checker.prototype.qualifier = function (node, env) {
        if (node.k === 'name') {
            if (this.lookupVariable(node.name, env) !== null)
                return { kind: 'expr', type: this.expr(node, env) };
            var type = this.lookupTypeName(node.name, env);
            if (type !== null) {
                node.qualifierType = type.kind === 'tvar' ? type : Java.classType(type, []);
                return { kind: 'type', type: node.qualifierType };
            }
            return { kind: 'package', name: node.name };
        }
        if (node.k === 'select') {
            var left = this.qualifier(node.target, env);
            if (left.kind === 'package') {
                var qname = left.name + '.' + node.name;
                var sym = this.symtab.lookupQualified(qname);
                if (sym !== null) {
                    node.qualifierType = Java.classType(sym, []);
                    return { kind: 'type', type: node.qualifierType };
                }
                return { kind: 'package', name: qname };
            }
            if (left.kind === 'type' && left.type.kind === 'class') {
                var field = Java.findField(left.type.sym.complete().thisType, node.name);
                if (field === null) {
                    var member = Java.findMemberType(left.type.sym, node.name);
                    if (member !== null) {
                        node.qualifierType = Java.classType(member, []);
                        return { kind: 'type', type: node.qualifierType };
                    }
                }
            }
            node.type = this.selectFrom(node, env, left);
            return { kind: 'expr', type: node.type };
        }
        return { kind: 'expr', type: this.expr(node, env) };
    };

    Checker.prototype.selectExpr = function (node, env) {
        return this.selectFrom(node, env, this.qualifier(node.target, env));
    };

    Checker.prototype.selectFrom = function (node, env, left) {
        if (left.kind === 'package')
            this.error(node.target, 'cannot find symbol: variable ' + left.name.split('.')[0]);
        if (left.kind === 'type') {
            var owner = left.type;
            if (owner.kind !== 'class')
                this.error(node, 'cannot select from a type variable');
            var staticField = Java.findField(owner.sym.complete().thisType, node.name);
            if (staticField === null) {
                if (node.name === 'length')
                    this.error(node, 'cannot find symbol: variable length');
                this.error(node, 'cannot find symbol: variable ' + node.name + ' in ' + owner.sym.displayName);
            }
            if (!staticField.field.isStatic)
                this.error(node, 'non-static variable ' + node.name + ' cannot be referenced from a static context');
            node.ref = { kind: 'static', field: staticField.field };
            if (this.fieldConstant(staticField.field) !== undefined)
                node.cv = staticField.field.constant;
            return staticField.field.type;
        }
        var targetType = Java.resolved(left.type);
        if (targetType.kind === 'array') {
            if (node.name !== 'length')
                this.error(node, 'cannot find symbol: variable ' + node.name);
            node.ref = { kind: 'length' };
            return types.int;
        }
        if (targetType.kind === 'prim')
            this.error(node, targetType.name + ' cannot be dereferenced');
        var classType = this.classOf(targetType);
        var found = classType === null ? null : Java.findField(classType, node.name);
        if (found === null)
            this.error(node, 'cannot find symbol: variable ' + node.name);
        node.ref = { kind: 'instance', field: found.field };
        if (found.field.isStatic && this.fieldConstant(found.field) !== undefined)
            node.cv = found.field.constant;
        var map = Java.typeMap(Java.asSuper(classType, found.field.owner) || classType);
        return Java.subst(found.field.type, map);
    };

    // The class of a value: a class type, the bound of a type variable.
    Checker.prototype.classOf = function (type) {
        type = Java.resolved(type);
        if (type.kind === 'class')
            return type;
        if (type.kind === 'tvar')
            return type.sym.bounds.length > 0 ? this.classOf(type.sym.bounds[0]) : Java.objectType();
        if (type.kind === 'wild')
            return type.upper && type.bound !== null ? this.classOf(type.bound) : Java.objectType();
        if (type.kind === 'inter')
            return this.classOf(type.types[0]);
        if (type.kind === 'ivar')
            return this.classOf(Java.resolveVar(type));
        return null;
    };
    // --- Assigning a value to a type

    // The value node (checked already) fits target; otherwise an error as
    // javac reports it.
    Checker.prototype.checkAssignable = function (node, target) {
        var source = Java.resolved(node.type);
        target = Java.resolved(target);
        if (target.kind === 'void')
            return;
        if (Java.isAssignable(source, target, node.cv))
            return;
        if (source.kind === 'void')
            this.error(node, "'void' type not allowed here");
        var sourcePrim = Java.primitiveOf(source), targetPrim = Java.primitiveOf(target);
        if (sourcePrim !== null && targetPrim !== null && sourcePrim.num !== null && targetPrim.num !== null &&
            (source.kind === 'prim' || target.kind === 'prim') && Java.isPrimitiveWidening(targetPrim, sourcePrim))
            this.error(node, 'incompatible types: possible lossy conversion from ' + sourcePrim.name + ' to ' +
                       targetPrim.name);
        this.error(node, 'incompatible types: ' + this.typeName(Java.finalType(source)) + ' cannot be converted to ' +
                   this.typeName(Java.finalType(target)));
    };

    // An expression in an assignment context to the type target.
    Checker.prototype.exprAs = function (node, env, target) {
        if (node.k === 'arrayinit') {
            var resolved = Java.resolved(target);
            if (resolved.kind !== 'array')
                this.error(node, 'illegal initializer for ' + this.typeName(target));
            this.arrayInit(node, resolved, env);
            node.type = target;
            return target;
        }
        this.expr(node, env, target);
        this.checkAssignable(node, target);
        node.targetType = target;
        return node.type;
    };

    Checker.prototype.arrayInit = function (node, arrayType, env) {
        var self = this;
        node.type = arrayType;
        node.items.forEach(function (item) {
            self.exprAs(item, env, arrayType.elem);
        });
    };

    Checker.prototype.newArrayExpr = function (node, env) {
        var self = this;
        var type = this.resolveType(node.elem, env);
        if (type.kind === 'class' && type.args.length > 0 && !type.args.every(function (arg) {
            return arg.kind === 'wild' && arg.bound === null;
        }))
            this.error(node, 'generic array creation');
        node.dims.forEach(function (dim) {
            self.expr(dim, env);
            var prim = Java.primitiveOf(dim.type);
            if (prim === null || !Java.isPrimitiveWidening(Java.unaryPromotion(prim), types.int))
                self.checkAssignable(dim, types.int);
        });
        var total = node.dims.length + node.extraDims;
        for (var index = 0; index < total; ++index)
            type = Java.arrayType(type);
        if (node.init !== null)
            this.arrayInit(node.init, type, env);
        return type;
    };

    Checker.prototype.indexExpr = function (node, env) {
        var target = Java.resolved(this.expr(node.target, env));
        if (target.kind !== 'array')
            this.error(node, 'array required, but ' + this.typeName(target) + ' found');
        this.expr(node.index, env);
        var index = Java.primitiveOf(node.index.type);
        if (index === null || index.num === null || !Java.isPrimitiveWidening(Java.unaryPromotion(index), types.int))
            this.checkAssignable(node.index, types.int);
        return target.elem;
    };
    // --- Constant folding

    function toLong(value) {
        return typeof value === 'number' && !Number.isInteger(value) ? i64.fromFloat(value) : value;
    }

    // The value of a constant in the primitive type.
    Java.convertConstant = function (value, from, to) {
        if (to.name === 'String' || to.kind !== 'prim')
            return value;
        if (from.name === 'boolean' || to.name === 'boolean')
            return value;
        if (from.name === 'long') {
            if (to.name === 'long')
                return value;
            if (to.num === 'f64')
                return i64.toFloat(value);
            if (to.num === 'f32')
                return Math.fround(i64.toFloat(value));
            return Java.wrapInt(i64.low32(value), to);
        }
        if (to.name === 'long')
            return from.num === 'f64' || from.num === 'f32' ? Java.doubleToLong(value) : value;
        if (to.num === 'f64')
            return value;
        if (to.num === 'f32')
            return Math.fround(value);
        var integer = from.num === 'f64' || from.num === 'f32' ? Java.doubleToInt(value) : value;
        return Java.wrapInt(integer, to);
    };

    Java.wrapInt = function (value, type) {
        switch (type.name) {
        case 'int':
            return value | 0;
        case 'short':
            return (value << 16) >> 16;
        case 'byte':
            return (value << 24) >> 24;
        case 'char':
            return value & 65535;
        }
        return value;
    };

    // A cast of a float to int in Java: saturation, NaN is 0.
    Java.doubleToInt = function (value) {
        if (value !== value)
            return 0;
        if (value >= 2147483647)
            return 2147483647;
        if (value <= -2147483648)
            return -2147483648;
        return Math.trunc(value) | 0;
    };

    Java.doubleToLong = function (value) {
        if (value !== value)
            return 0;
        if (value >= 9223372036854775807)
            return T.bigToI64(big.sub(big.pow(2, 63), 1), true);
        if (value <= -9223372036854775808)
            return T.bigToI64(big.neg(big.pow(2, 63)), true);
        return i64.fromFloat(value);
    };

    function foldArithmetic(op, left, right, type) {
        if (type.name === 'long') {
            left = toLong(left);
            right = toLong(right);
            switch (op) {
            case '+': return i64.add(left, right);
            case '-': return i64.sub(left, right);
            case '*': return i64.mul(left, right);
            case '/': return i64.toFloat(right) === 0 ? undefined : i64.div(left, right);
            case '%': return i64.toFloat(right) === 0 ? undefined : i64.mod(left, right);
            case '&': return i64.and(left, right);
            case '|': return i64.or(left, right);
            case '^': return i64.xor(left, right);
            }
            return undefined;
        }
        if (type.num === 'f64' || type.num === 'f32') {
            var result;
            switch (op) {
            case '+': result = left + right; break;
            case '-': result = left - right; break;
            case '*': result = left * right; break;
            case '/': result = left / right; break;
            case '%': result = left % right; break;
            default: return undefined;
            }
            return type.num === 'f32' ? Math.fround(result) : result;
        }
        switch (op) {
        case '+': return (left + right) | 0;
        case '-': return (left - right) | 0;
        case '*': return Math.imul(left, right);
        case '/': return right === 0 ? undefined : (left / right) | 0;
        case '%': return right === 0 ? undefined : (left % right) | 0;
        case '&': return left & right;
        case '|': return left | right;
        case '^': return left ^ right;
        case '<<': return left << (right & 31);
        case '>>': return left >> (right & 31);
        case '>>>': return (left >>> (right & 31)) | 0;
        }
        return undefined;
    }
    Java.foldArithmetic = foldArithmetic;
    // --- Operations

    Checker.prototype.numericOperand = function (node, op) {
        var prim = Java.primitiveOf(node.type);
        if (prim === null || prim.num === null)
            this.error(node, 'bad operand type ' + this.typeName(node.type) + " for unary operator '" + op + "'");
        return prim;
    };

    Checker.prototype.unaryExpr = function (node, env) {
        this.expr(node.arg, env);
        var arg = node.arg;
        var op = node.op;
        if (op === '!') {
            var bool = Java.primitiveOf(arg.type);
            if (bool === null || bool.name !== 'boolean')
                this.error(node, 'bad operand type ' + this.typeName(arg.type) + " for unary operator '!'");
            node.opType = types.boolean;
            if (arg.cv !== undefined)
                node.cv = !arg.cv;
            return types.boolean;
        }
        var prim = this.numericOperand(arg, op);
        if (op === '~' && !Java.isIntegral(prim))
            this.error(node, 'bad operand type ' + this.typeName(arg.type) + " for unary operator '~'");
        var type = Java.unaryPromotion(prim);
        node.opType = type;
        if (arg.cv !== undefined) {
            var value = Java.convertConstant(arg.cv, prim, type);
            if (op === '-')
                node.cv = type.name === 'long' ? i64.neg(toLong(value)) : (type.num === 'i32' ? (-value) | 0 : -value);
            else if (op === '~')
                node.cv = type.name === 'long' ? i64.not(toLong(value)) : ~value;
            else
                node.cv = value;
        }
        return type;
    };

    Checker.prototype.incrementExpr = function (node, env) {
        this.assignTarget(node.arg, env, true);
        var prim = this.numericOperand(node.arg, node.op);
        node.opType = prim;
        return node.arg.type;
    };
    Checker.prototype.badOperands = function (node) {
        this.error(node, "bad operand types for binary operator '" + node.op + "'; first type: " +
                   this.typeName(node.left.type) + ', second type: ' + this.typeName(node.right.type));
    };

    Checker.prototype.binaryExpr = function (node, env) {
        var op = node.op;
        var left = node.left, right = node.right;
        this.expr(left, env);
        this.expr(right, env);
        var lt = Java.resolved(left.type), rt = Java.resolved(right.type);
        if (lt.kind === 'void' || rt.kind === 'void')
            this.error(lt.kind === 'void' ? left : right, "'void' type not allowed here");
        var string = Java.symtab.classNamed('java.lang.String');
        var isString = function (type) { return type.kind === 'class' && type.sym === string; };
        if (op === '+' && (isString(lt) || isString(rt))) {
            node.opType = 'string';
            if (left.cv !== undefined && right.cv !== undefined && Java.constantString(left) !== null &&
                Java.constantString(right) !== null)
                node.cv = Java.constantString(left) + Java.constantString(right);
            return Java.stringType();
        }
        var lp = Java.primitiveOf(lt), rp = Java.primitiveOf(rt);
        if (op === '&&' || op === '||') {
            if (lp === null || rp === null || lp.name !== 'boolean' || rp.name !== 'boolean')
                this.badOperands(node);
            node.opType = types.boolean;
            if (left.cv !== undefined && right.cv !== undefined)
                node.cv = op === '&&' ? left.cv && right.cv : left.cv || right.cv;
            return types.boolean;
        }
        if (op === '==' || op === '!=')
            return this.equalityExpr(node, lt, rt, lp, rp);
        if (lp === null || rp === null)
            this.badOperands(node);
        if (op === '&' || op === '|' || op === '^') {
            if (lp.name === 'boolean' && rp.name === 'boolean') {
                node.opType = types.boolean;
                if (left.cv !== undefined && right.cv !== undefined)
                    node.cv = op === '&' ? left.cv && right.cv : (op === '|' ? left.cv || right.cv : left.cv !== right.cv);
                return types.boolean;
            }
            if (!Java.isIntegral(lp) || !Java.isIntegral(rp))
                this.badOperands(node);
        } else if (lp.num === null || rp.num === null) {
            this.badOperands(node);
        }
        if (op === '<<' || op === '>>' || op === '>>>') {
            if (!Java.isIntegral(lp) || !Java.isIntegral(rp))
                this.badOperands(node);
            var shifted = Java.unaryPromotion(lp);
            node.opType = shifted;
            node.countType = Java.unaryPromotion(rp);
            if (left.cv !== undefined && right.cv !== undefined) {
                var count = Number(i64.toFloat(Java.convertConstant(right.cv, rp, types.long)));
                var base = Java.convertConstant(left.cv, lp, shifted);
                node.cv = shifted.name === 'long' ? (op === '<<' ? i64.shl(toLong(base), count & 63)
                                                                 : (op === '>>' ? i64.shr(toLong(base), count & 63)
                                                                                : T.u64.shr(T.u64.fromSigned(toLong(base)), count & 63)))
                                                  : foldArithmetic(op, base, count, shifted);
                if (shifted.name === 'long' && op === '>>>')
                    node.cv = i64.fromUnsigned(node.cv);
            }
            return shifted;
        }
        var type = Java.binaryPromotion(Java.unaryPromotion(lp), Java.unaryPromotion(rp));
        node.opType = type;
        var relational = op === '<' || op === '>' || op === '<=' || op === '>=';
        if (left.cv !== undefined && right.cv !== undefined) {
            var leftConstant = Java.convertConstant(left.cv, lp, type);
            var rightConstant = Java.convertConstant(right.cv, rp, type);
            if (relational) {
                var order = type.name === 'long' ? i64.cmp(toLong(leftConstant), toLong(rightConstant)) : (leftConstant < rightConstant ? -1 : (leftConstant > rightConstant ? 1 : (leftConstant === rightConstant ? 0 : NaN)));
                node.cv = op === '<' ? order < 0 : (op === '>' ? order > 0 : (op === '<=' ? order <= 0 : order >= 0));
            } else {
                var folded = foldArithmetic(op, leftConstant, rightConstant, type);
                if (folded !== undefined)
                    node.cv = folded;
            }
        }
        return relational ? types.boolean : type;
    };
    // The text of a constant for string concatenation (floats are not concatenated in advance).
    Java.constantString = function (node) {
        var value = node.cv;
        var type = Java.resolved(node.type);
        if (typeof value === 'string')
            return value;
        if (type.kind !== 'prim')
            return null;
        switch (type.name) {
        case 'char':
            return String.fromCharCode(value);
        case 'boolean':
            return String(value);
        case 'long':
            return i64.str(value);
        case 'int':
        case 'short':
        case 'byte':
            return String(value);
        }
        return null;
    };

    Checker.prototype.equalityExpr = function (node, lt, rt, lp, rp) {
        var left = node.left, right = node.right;
        if (lp !== null && rp !== null && (lt.kind === 'prim' || rt.kind === 'prim')) {
            if ((lp.name === 'boolean') !== (rp.name === 'boolean'))
                this.badOperands(node);
            var type = lp.name === 'boolean' ? types.boolean : Java.binaryPromotion(Java.unaryPromotion(lp), Java.unaryPromotion(rp));
            node.opType = type;
            if (left.cv !== undefined && right.cv !== undefined) {
                var leftConstant = Java.convertConstant(left.cv, lp, type);
                var rightConstant = Java.convertConstant(right.cv, rp, type);
                var equal = type.name === 'long'
                    ? i64.eq(toLong(leftConstant), toLong(rightConstant))
                    : leftConstant === rightConstant;
                node.cv = node.op === '==' ? equal : !equal;
            }
            return types.boolean;
        }
        if (lt.kind === 'prim' || rt.kind === 'prim')
            this.badOperands(node);
        if (!this.isCastable(lt, rt) && !this.isCastable(rt, lt))
            this.error(node, 'incomparable types: ' + this.typeName(lt) + ' and ' + this.typeName(rt));
        node.opType = 'ref';
        if (typeof left.cv === 'string' && typeof right.cv === 'string')
            node.cv = node.op === '==' ? left.cv === right.cv : left.cv !== right.cv;
        return types.boolean;
    };

    // The variable on the left of an assignment: a name, a field, an array element.
    Checker.prototype.assignTarget = function (node, env, compound) {
        var inner = node;
        while (inner.k === 'parens')
            inner = inner.expr;
        if (inner.k !== 'name' && inner.k !== 'select' && inner.k !== 'index')
            this.error(node, 'unexpected type; required: variable, found: value');
        this.expr(inner, env);
        node.type = inner.type;
        if (inner.k === 'name' || inner.k === 'select') {
            var ref = inner.ref;
            if (ref.kind === 'length')
                this.error(node, 'cannot assign a value to final variable length');
            if (ref.kind === 'local') {
                var variable = ref.variable;
                if (variable.isFinal && (variable.assigned || variable.hasInit))
                    this.error(node, 'cannot assign a value to final variable ' + variable.name);
                variable.assignCount = (variable.assignCount || 0) + 1;
                variable.reassigned = !!variable.hasInit || variable.assignCount > 1 || !!compound;
                variable.assigned = true;
                if (ref.captured)
                    this.error(node, 'local variables referenced from ' + (ref.captured.kind === 'lambda' ? 'a lambda expression'
                                                                                                         : 'an inner class') +
                               ' must be final or effectively final');
                delete variable.cv;
            } else {
                var field = ref.field;
                if (field.isFinal && !this.inInitializerOf(env, field))
                    this.error(node, 'cannot assign a value to final variable ' + field.name);
            }
        }
        return inner.type;
    };

    // Whether a final field may be assigned here: a constructor or an
    // initializer of its class.
    Checker.prototype.inInitializerOf = function (env, field) {
        for (var current = env; current !== null; current = current.parent) {
            if (current.kind === 'method') {
                var method = current.method;
                return method !== null && method !== undefined && method.owner === field.owner &&
                    (field.isStatic ? method.isStaticInit === true : method.isCtor || method.isInstanceInit === true);
            }
            if (current.kind === 'lambda' || current.kind === 'class')
                return false;
        }
        return false;
    };
    Checker.prototype.noteCapture = function (variable, node) {
        if (this.captures !== undefined)
            this.captures.push({ variable: variable, node: node });
    };

    // Variables captured by lambdas and local classes do not change.
    Checker.prototype.checkCaptures = function () {
        var self = this;
        (this.captures || []).forEach(function (capture) {
            if (capture.variable.reassigned)
                self.error(capture.node, 'local variables referenced from ' + (capture.variable.capturedByClass ? 'an inner class'
                                                                                                                 : 'a lambda expression') +
                           ' must be final or effectively final');
        });
        this.captures = [];
    };

    Checker.prototype.assignExpr = function (node, env) {
        var target = this.assignTarget(node.target, env, node.op !== '=');
        if (node.op === '=') {
            this.exprAs(node.rhs, env, target);
            return target;
        }
        this.expr(node.rhs, env);
        var op = node.op.slice(0, -1);
        var string = Java.symtab.classNamed('java.lang.String');
        var resolvedTarget = Java.resolved(target);
        if (op === '+' && resolvedTarget.kind === 'class' && resolvedTarget.sym === string) {
            if (Java.resolved(node.rhs.type).kind === 'void')
                this.error(node.rhs, "'void' type not allowed here");
            node.opType = 'string';
            return target;
        }
        var lp = Java.primitiveOf(target), rp = Java.primitiveOf(node.rhs.type);
        var fake = { op: op, left: node.target, right: node.rhs, line: node.line, column: node.column };
        if (lp === null || rp === null)
            this.badOperands(fake);
        if (op === '&' || op === '|' || op === '^') {
            if (lp.name === 'boolean' && rp.name === 'boolean') {
                node.opType = types.boolean;
                return target;
            }
            if (!Java.isIntegral(lp) || !Java.isIntegral(rp))
                this.badOperands(fake);
        } else if (lp.num === null || rp.num === null) {
            this.badOperands(fake);
        }
        if (op === '<<' || op === '>>' || op === '>>>') {
            if (!Java.isIntegral(lp) || !Java.isIntegral(rp))
                this.badOperands(fake);
            node.opType = Java.unaryPromotion(lp);
            node.countType = Java.unaryPromotion(rp);
            return target;
        }
        node.opType = Java.binaryPromotion(Java.unaryPromotion(lp), Java.unaryPromotion(rp));
        return target;
    };
    Checker.prototype.condition = function (node, env) {
        this.expr(node, env);
        var prim = Java.primitiveOf(node.type);
        if (prim === null || prim.name !== 'boolean')
            this.error(node, 'incompatible types: ' + this.typeName(node.type) + ' cannot be converted to boolean');
    };

    // ?: - numeric, boolean or reference (then by the target).
    Checker.prototype.condExpr = function (node, env, expected) {
        this.condition(node.cond, env);
        var target = expected !== null && expected !== Java.POLY ? expected : null;
        var poly = function (item) { return item.k === 'lambda' || item.k === 'methodref'; };
        if (target !== null && Java.resolved(target).kind !== 'prim' && (poly(node.then) || poly(node.otherwise))) {
            this.exprAs(node.then, env, target);
            this.exprAs(node.otherwise, env, target);
            node.opType = 'ref';
            return target;
        }
        this.expr(node.then, env, expected);
        this.expr(node.otherwise, env, expected);
        var thenType = Java.resolved(node.then.type), otherwiseType = Java.resolved(node.otherwise.type);
        var thenPrimitive = Java.primitiveOf(thenType), otherwisePrimitive = Java.primitiveOf(otherwiseType);
        var type;
        var isSmall = function (primitive) {
            return primitive.name === 'byte' || primitive.name === 'short' || primitive.name === 'char';
        };
        if (thenPrimitive !== null && otherwisePrimitive !== null &&
            (thenType.kind === 'prim' || otherwiseType.kind === 'prim' ||
             (thenPrimitive.name === otherwisePrimitive.name && thenPrimitive.num !== null)) &&
            (thenPrimitive.name === 'boolean') === (otherwisePrimitive.name === 'boolean')) {
            if (thenPrimitive.name === 'boolean') {
                type = types.boolean;
            } else if (thenPrimitive.name === otherwisePrimitive.name) {
                type = thenPrimitive;
            } else if (node.otherwise.cv !== undefined && otherwisePrimitive.name === 'int' && isSmall(thenPrimitive) &&
                       Java.isAssignable(otherwisePrimitive, thenPrimitive, node.otherwise.cv)) {
                type = thenPrimitive;
            } else if (node.then.cv !== undefined && thenPrimitive.name === 'int' && isSmall(otherwisePrimitive) &&
                       Java.isAssignable(thenPrimitive, otherwisePrimitive, node.then.cv)) {
                type = otherwisePrimitive;
            } else {
                type = Java.binaryPromotion(Java.unaryPromotion(thenPrimitive),
                                            Java.unaryPromotion(otherwisePrimitive));
            }
            node.opType = type;
            if (node.cond.cv !== undefined && node.then.cv !== undefined && node.otherwise.cv !== undefined) {
                node.cv = node.cond.cv
                    ? Java.convertConstant(node.then.cv, thenPrimitive, type)
                    : Java.convertConstant(node.otherwise.cv, otherwisePrimitive, type);
            }
            return type;
        }
        if (thenType.kind === 'void' || otherwiseType.kind === 'void')
            this.error(thenType.kind === 'void' ? node.then : node.otherwise, "'void' type not allowed here");
        node.opType = 'ref';
        if (target !== null && Java.resolved(target).kind !== 'prim' &&
            Java.isAssignable(thenType, target, node.then.cv) &&
            Java.isAssignable(otherwiseType, target, node.otherwise.cv))
            return target;
        type = Java.lub([thenType, otherwiseType]);
        return type.kind === 'null' ? Java.objectType() : type;
    };
    // Whether a value of the type source may be of the type target (for casts
    // and ==).
    Checker.prototype.isCastable = function (source, target) {
        source = Java.resolved(source);
        target = Java.resolved(target);
        if (source.kind === 'null' || target.kind === 'null')
            return true;
        if (source.kind === 'prim' || target.kind === 'prim')
            return false;
        if (Java.isSubtypeNoBounds(Java.erasure(source), Java.erasure(target)) || Java.isSubtypeNoBounds(Java.erasure(target), Java.erasure(source)))
            return true;
        if (source.kind === 'tvar' || target.kind === 'tvar' || source.kind === 'inter' || target.kind === 'inter' || source.kind === 'ivar' || target.kind === 'ivar')
            return true;
        if (source.kind === 'class' && target.kind === 'class') {
            // An interface and a non-final class - may be.
            if (source.sym.isInterface() && !target.sym.mods.final && target.sym.flavor !== 'enum' &&
                target.sym.flavor !== 'record')
                return true;
            if (target.sym.isInterface() && !source.sym.mods.final && source.sym.flavor !== 'enum' &&
                source.sym.flavor !== 'record')
                return true;
            if (source.sym.isInterface() && target.sym.isInterface())
                return true;
            return false;
        }
        if (source.kind === 'array' && target.kind === 'array')
            return this.isCastable(source.elem, target.elem) || Java.sameType(source.elem, target.elem);
        return false;
    };

    Checker.prototype.instanceofExpr = function (node, env) {
        this.expr(node.expr, env);
        var source = Java.resolved(node.expr.type);
        if (source.kind === 'prim')
            this.error(node.expr, 'unexpected type; required: reference, found: ' + source.name);
        if (node.pattern) {
            this.checkPattern(node.pattern, source, env, false);
            node.testType = node.pattern.testType;
            return types.boolean;
        }
        var target = this.resolveType(node.type, env);
        if (target.kind === 'prim')
            this.error(node.type, 'unexpected type; required: class or array, found: ' + target.name);
        if (!this.isCastable(source, target))
            this.error(node, 'incompatible types: ' + this.typeName(source) + ' cannot be converted to ' + this.typeName(target));
        node.testType = target;
        if (node.binding !== null)
            node.variable = this.declareLocal(node.binding, target, env, node, { pattern: true });
        return types.boolean;
    };

    Checker.prototype.castExpr = function (node, env) {
        var self = this;
        var targets = node.types.map(function (item) { return self.resolveType(item, env); });
        var target = targets.length === 1 ? targets[0] : { kind: 'inter', types: targets };
        node.castType = target;
        var operand = node.expr;
        if (operand.k === 'lambda' || operand.k === 'methodref') {
            var functional = targets.filter(function (item) { return Java.functionalMethod(item) !== null; })[0] || target;
            this.expr(operand, env, functional);
            return target;
        }
        this.expr(operand, env, target.kind === 'prim' ? null : Java.POLY);
        this.flushPostponed(operand);
        var source = Java.resolved(operand.type);
        var resolvedTarget = Java.resolved(target);
        if (resolvedTarget.kind === 'prim' || source.kind === 'prim') {
            var sp = Java.primitiveOf(source), tp = Java.primitiveOf(resolvedTarget);
            var ok;
            if (resolvedTarget.kind === 'prim' && source.kind === 'prim')
                ok = (sp.name === 'boolean') === (tp.name === 'boolean');
            else if (resolvedTarget.kind === 'prim')
                ok = (sp !== null && Java.isPrimitiveWidening(sp, tp)) || (sp === null && this.isCastable(source, Java.boxedType(Java.symtab, tp)));
            else
                ok = Java.isConvertible(source, resolvedTarget, false);
            if (!ok)
                this.error(node, 'incompatible types: ' + this.typeName(source) + ' cannot be converted to ' + this.typeName(target));
            if (operand.cv !== undefined && sp !== null && tp !== null && (source.kind === 'prim' && resolvedTarget.kind === 'prim'))
                node.cv = Java.convertConstant(operand.cv, sp, tp);
            return target;
        }
        if (!this.isCastable(source, resolvedTarget))
            this.error(node, 'incompatible types: ' + this.typeName(source) + ' cannot be converted to ' + this.typeName(target));
        if (typeof operand.cv === 'string')
            node.cv = operand.cv;
        return target;
    };
    // this and Outer.this: depth - how many outer instances to go through.
    Checker.prototype.thisExpr = function (node, env) {
        var wanted = null;
        if (node.qualifier !== null) {
            var qualifier = this.qualifier(node.qualifier, env);
            if (qualifier.kind !== 'type' || qualifier.type.kind !== 'class')
                this.error(node, 'not an enclosing class');
            wanted = qualifier.type.sym;
        }
        var depth = 0;
        for (var current = env; current !== null; current = current.parent) {
            if (current.kind === 'method' && current.isStatic)
                this.error(node, 'non-static variable this cannot be referenced from a static context');
            if (current.kind === 'staticinit')
                this.error(node, 'non-static variable this cannot be referenced from a static context');
            if (current.kind === 'class') {
                if (wanted === null || current.cls === wanted) {
                    node.depth = depth;
                    node.cls = current.cls;
                    return current.cls.thisType;
                }
                ++depth;
            }
            if (current.kind === 'top')
                break;
        }
        this.error(node, wanted === null ? 'non-static variable this cannot be referenced from a static context'
                                         : 'not an enclosing class: ' + wanted.displayName);
    };

    Checker.prototype.classLiteral = function (node, env) {
        var type;
        if (node.fromName) {
            var qualifier = this.qualifier(node.type, env);
            if (qualifier.kind !== 'type')
                this.error(node, 'cannot find symbol: class ' + (node.type.name || ''));
            type = qualifier.type;
        } else {
            type = this.resolveType(node.type, env);
        }
        node.classType = type;
        var arg = type.kind === 'prim' ? Java.boxedType(Java.symtab, type)
                                       : (type.kind === 'void' ? Java.classType(Java.symtab.classNamed('java.lang.Void'), [])
                                                               : Java.erasure(type));
        return Java.classType(Java.symtab.classNamed('java.lang.Class'), [arg]);
    };
})(globalThis);
