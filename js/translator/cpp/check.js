// C++: checking of expressions (continues parser.js). The syntax of an
// expression becomes a checked tree: { k, type (never a reference: the
// type of the value), cat ('lvalue' | 'xvalue' | 'prvalue'), value (a
// constant), line, file, ... }. Kinds: const, string, var, func, field,
// deref, addr, decay, fnaddr, this, conv, ptradj, glvadj, unary, not,
// binary, compare, logical, ptrarith, ptrdiff, assign, compound, incdec,
// cond, comma, call, icall, construct, zero, default, aggregate, copy, temp,
// arrayinit, initlist, new, delete, throw, typeid, dyncast, overload, seq.
// Overloads and calls are in overload.js, conversions and initialization
// in conversions.js, classes in classes.js.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var C = T.c;
    var X = T.cpp;
    var Parser = X.Parser;
    if (Object.prototype.hasOwnProperty.call(Parser.prototype, 'check'))
        return;

    var types = X.types;
    var big = T.big;
    var unqual = X.unqual;

    // --- The context of a function body

    function FunctionContext(session, func, parent) {
        this.session = session;
        this.func = func;
        this.parent = parent;
        this.locals = [];
        this.jsNames = Object.create(null);
        this.returnType = func !== null ? func.type.returns : types.void;
        this.isTop = false;
        this.thisClass = null;
        this.thisCv = 0;
        this.isCtor = false;
        this.isDtor = false;
        this.calls = [];
        this.blocking = false;
        this.dynamicCalls = false;
        this.hasTry = false;
        this.lambda = null;
        this.async = false;
        // The returns of a class value with the local each one names.
        this.classReturns = [];
    }
    X.FunctionContext = FunctionContext;

    FunctionContext.prototype.newLocal = function (name, type, tok) {
        var used = this.jsNames;
        var base = T.jsName(name.replace(/[^A-Za-z0-9_$]/g, '_'));
        var jsName = base;
        var counter = 1;
        while (used[jsName] !== undefined)
            jsName = base + '$' + (++counter);
        used[jsName] = true;
        var object = { kind: 'var', name: name, type: type, storage: 'local', jsName: jsName, addressTaken: false,
                       context: this, line: tok ? tok.line : 0, isConst: false };
        this.locals.push(object);
        return object;
    };

    // --- Tree nodes

    Parser.prototype.ir = function (kind, node, fields) {
        // A function with its address taken may be called indirectly (async analysis).
        if (kind === 'fnaddr')
            fields.func.addressTaken = true;
        fields.k = kind;
        fields.line = node ? node.line : 0;
        fields.file = node ? node.file : '';
        return fields;
    };

    Parser.prototype.constant = function (value, type, node) {
        return this.ir('const', node, { type: type, cat: 'prvalue', value: value });
    };

    // An integer constant wrapped into the range of a type.
    X.wrapValue = function (value, type) {
        type = unqual(type);
        if (type.kind === 'float')
            return typeof value === 'number' ? value : big.toFloat(value);
        if (typeof value === 'number' && !Number.isInteger(value))
            value = big.fromFloat(Math.trunc(value));
        if (type === types.bool)
            return big.sign(value) !== 0 ? 1 : 0;
        if (type.kind === 'enum')
            return C.wrapConstant(value, type.underlying);
        if (type.kind === 'pointer' || type.kind === 'nullptr')
            return C.wrapConstant(value, types.ulong);
        return C.wrapConstant(value, type);
    };

    function isZero(value) {
        return typeof value === 'number' ? value === 0 : big.sign(value) === 0;
    }
    X.isZeroValue = isZero;

    function toNumber(value) {
        return typeof value === 'number' ? value : big.toFloat(value);
    }

    // A null pointer constant: 0 of an integral type or nullptr.
    X.isNullPointerConstant = function (ir) {
        var type = unqual(ir.type);
        if (type.kind === 'nullptr')
            return true;
        return ir.value !== undefined && X.isIntegral(type) && type !== types.bool && isZero(ir.value) &&
            (ir.k === 'const' || ir.literalZero);
    };

    // The value of a constant integral expression (static_assert, cases,
    // array bounds, template arguments).
    Parser.prototype.constantValue = function (syntax, what) {
        var expr = this.constantIr(this.check(syntax));
        var type = unqual(expr.type);
        if (expr.value === undefined || !(X.isIntegral(type) || type.kind === 'enum'))
            this.error(syntax, "'" + this.describeSyntax(syntax) + "' is not a constant expression");
        return typeof expr.value === 'number' ? big.fromFloat(expr.value) : expr.value;
    };

    Parser.prototype.fullExpression = function (syntax) {
        return this.markFull(this.check(syntax));
    };

    // The end of a full-expression: its temporaries are destroyed here.
    Parser.prototype.markFull = function (ir) {
        ir.full = true;
        return ir;
    };

    // --- Value categories

    Parser.prototype.isGlvalue = function (ir) {
        return ir.cat === 'lvalue' || ir.cat === 'xvalue';
    };

    // A prvalue of a class becomes a temporary object (an xvalue).
    Parser.prototype.materialize = function (ir) {
        if (ir.cat !== 'prvalue')
            return ir;
        if (!X.isRecord(unqual(ir.type)) && unqual(ir.type).kind !== 'array')
            return ir;
        return this.ir('temp', ir, { init: ir, type: ir.type, cat: 'xvalue', dtor: this.elementDestructor(ir.type) });
    };

    // Array to pointer, function to pointer; the value of a scalar.
    Parser.prototype.decayValue = function (ir) {
        var type = unqual(ir.type);
        if (type.kind === 'array') {
            if (ir.cat === 'prvalue')
                ir = this.materialize(ir);
            return this.ir('decay', ir, { operand: ir, type: X.pointerTo(type.of), cat: 'prvalue' });
        }
        if (type.kind === 'function') {
            if (ir.k === 'func')
                return this.ir('fnaddr', ir, { func: ir.func, type: X.pointerTo(type), cat: 'prvalue' });
            return this.ir('addr', ir, { operand: ir, type: X.pointerTo(type), cat: 'prvalue' });
        }
        if (ir.k === 'overload')
            return this.resolveAddress(ir, null, ir);
        return ir;
    };

    // The scalar type of a value (no cv, no reference).
    function valueType(ir) {
        return unqual(ir.type);
    }

    // --- Conversions of scalars

    Parser.prototype.convertScalar = function (ir, to) {
        ir = this.decayValue(ir);
        to = unqual(to);
        var from = valueType(ir);
        if (from === to)
            return ir.cat === 'prvalue' ? ir : this.ir('conv', ir, { operand: ir, from: from, to: to, type: to,
                                                                    cat: 'prvalue', value: ir.value });
        if (to.kind === 'void')
            return this.ir('conv', ir, { operand: ir, from: from, to: to, type: to, cat: 'prvalue' });
        var value;
        if (ir.value !== undefined)
            value = this.foldConversion(ir.value, from, to);
        var result = this.ir('conv', ir, { operand: ir, from: from, to: to, type: to, cat: 'prvalue' });
        if (value !== undefined)
            result.value = value;
        return result;
    };

    Parser.prototype.foldConversion = function (value, from, to) {
        if (to.kind === 'float')
            return to === types.float ? Math.fround(toNumber(value)) : toNumber(value);
        if (to === types.bool)
            return isZero(value) ? 0 : 1;
        if (to.kind === 'pointer') {
            if (from.kind === 'nullptr' || ((X.isIntegral(from) || from.kind === 'enum') && isZero(value)))
                return 0;
            if (X.isIntegral(from) || from.kind === 'enum')
                return X.wrapValue(value, to);
            return undefined;
        }
        if (from.kind === 'float') {
            if (value !== value || !isFinite(value))
                return undefined;
            return X.wrapValue(big.fromFloat(Math.trunc(value)), to);
        }
        if (X.isIntegral(to) || to.kind === 'enum')
            return X.wrapValue(value, to);
        return undefined;
    };

    // A value as bool where a condition is expected (if, while, !, &&).
    Parser.prototype.contextualBool = function (ir, node) {
        ir = this.decayValue(ir);
        var type = valueType(ir);
        if (type === types.bool)
            return ir;
        if (type.isClass) {
            var converted = this.classToScalar(ir, types.bool, node, true);
            if (converted !== null)
                return converted;
            this.error(node, "could not convert '" + this.describeSyntax(node) + "' from '" + X.typeString(ir.type) +
                       "' to 'bool'");
        }
        if (!X.isScalar(type) || (type.kind === 'enum' && type.scoped))
            this.error(node, "could not convert '" + this.describeSyntax(node) + "' from '" + X.typeString(ir.type) +
                       "' to 'bool'");
        return this.convertScalar(ir, types.bool);
    };

    // --- The checker

    Parser.prototype.check = function (node) {
        var result = this.checkOnce(node);
        if (result.line === undefined || result.line === 0) {
            result.line = node.line;
            result.file = node.file;
        }
        return result;
    };

    Parser.prototype.checkOnce = function (node) {
        switch (node.k) {
        case 'checked':
            return node.ir;
        case 'int':
            return this.integerLiteral(node);
        case 'float':
            return this.floatLiteral(node);
        case 'char':
            return this.charLiteral(node);
        case 'string':
            return this.stringIr(node);
        case 'bool':
            return this.constant(node.value ? 1 : 0, types.bool, node);
        case 'nullptr':
            return this.constant(0, types.nullptr, node);
        case 'this':
            return this.thisPointer(node);
        case 'name':
            return this.nameIr(node);
        case 'paren': {
            var inner = this.check(node.expr);
            var copy = Object.create(null);
            Object.keys(inner).forEach(function (key) { copy[key] = inner[key]; });
            copy.parenthesized = true;
            return copy;
        }
        case 'call':
            return this.checkCall(node);
        case 'index':
            return this.subscript(node);
        case 'member':
            return this.memberAccess(node);
        case 'postinc':
        case 'preinc':
            return this.incrementExpr(node);
        case 'unary':
            return this.unaryExpr(node);
        case 'sizeof':
            return this.sizeofExpr(node);
        case 'alignof':
            return this.constant(big.fromFloat(unqual(X.removeRef(node.type)).align), types.ulong, node);
        case 'sizeofpack':
            return this.constant(big.fromFloat(this.packLength(node.pack, node)), types.ulong, node);
        case 'noexceptop':
            return this.noexceptOperator(node);
        case 'cast':
            return this.cStyleCast(node.type, this.check(node.expr), node);
        case 'xcast':
            return this.namedCast(node);
        case 'functional':
            return this.functionalCastIr(node);
        case 'binary':
            return this.binaryExpr(node);
        case 'assign':
            return this.assignExpr(node);
        case 'cond':
            return this.conditionalExpr(node);
        case 'comma':
            return this.commaExpr(node);
        case 'new':
            return this.newExpr(node);
        case 'delete':
            return this.deleteExpr(node);
        case 'throw':
            return this.throwExpr(node);
        case 'lambda':
            return this.lambdaIr(node);
        case 'typeid':
            return this.typeidExpr(node);
        case 'braced':
            this.error(node, "expected primary-expression before '{' token");
            break;
        case 'fold':
            return this.foldExpr(node);
        case 'expansion':
            this.error(node, "expected ')' before '...' token");
            break;
        case 'offsetof':
            return this.offsetofExpr(node);
        case 'funcname':
            return this.functionNameIr(node);
        case 'udl':
            return this.userLiteral(node);
        case 'vastart':
        case 'vaend':
        case 'vaarg':
        case 'vacopy':
            return this.vaExpr(node);
        case 'designated':
            this.error(node, 'designated initializer outside of an initializer list');
            break;
        case 'trait':
            return this.constant(this.typeTrait(node) ? 1 : 0, types.bool, node);
        }
        this.error(node, 'unexpected expression');
    };

    // --- Literals

    Parser.prototype.integerLiteral = function (node) {
        var text = node.text.replace(/'/g, '');
        var size = /[zZ]/.test(text);
        if (size)
            text = text.replace(/[zZ]/, '');
        var parsed = C.parseIntegerToken({ value: text, line: node.line, column: node.column, file: node.file });
        if (parsed === null)
            this.error(node, "invalid suffix on integer constant");
        var value = parsed.value;
        var candidates;
        if (size)
            candidates = parsed.unsigned ? [types.ulong] : [types.long];
        else if (parsed.unsigned)
            candidates = parsed.long === 2 ? [types.ullong] : (parsed.long === 1 ? [types.ulong, types.ullong]
                                                                                  : [types.uint, types.ulong,
                                                                                     types.ullong]);
        else if (parsed.decimal)
            candidates = parsed.long === 2 ? [types.llong] : (parsed.long === 1 ? [types.long, types.llong]
                                                                                : [types.int, types.long, types.llong]);
        else
            candidates = parsed.long === 2 ? [types.llong, types.ullong]
                : (parsed.long === 1 ? [types.long, types.ulong, types.llong, types.ullong]
                                     : [types.int, types.uint, types.long, types.ulong, types.llong, types.ullong]);
        for (var index = 0; index < candidates.length; ++index) {
            var type = candidates[index];
            var bits = type.size * 8;
            var max = type.signed ? big.sub(big.pow(2, bits - 1), 1) : big.sub(big.pow(2, bits), 1);
            if (big.cmp(value, max) <= 0) {
                var result = this.constant(value, type, node);
                result.literalZero = true;
                return result;
            }
        }
        if (parsed.decimal && !parsed.unsigned && big.cmp(value, big.sub(big.pow(2, 64), 1)) <= 0)
            return this.constant(value, types.ulong, node);
        this.error(node, 'integer constant is too large for its type');
    };

    Parser.prototype.floatLiteral = function (node) {
        var text = node.text.replace(/'/g, '');
        var suffix = '';
        if (/[fFlL]$/.test(text) && !/^0[xX][0-9a-fA-F.]*$/.test(text)) {
            suffix = text.slice(-1).toLowerCase();
            text = text.slice(0, -1);
        }
        var value;
        if (/^0[xX]/.test(text)) {
            value = T.rat.toFloat(T.rat.parse(text));
        } else {
            if (!/^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text))
                this.error(node, "invalid suffix on floating constant");
            value = Number(text);
        }
        var type = suffix === 'f' ? types.float : (suffix === 'l' ? types.ldouble : types.double);
        return this.constant(suffix === 'f' ? Math.fround(value) : value, type, node);
    };

    Parser.prototype.charLiteral = function (node) {
        var tok = node.tok;
        var prefix = /^(u8|u|U|L)/.exec(tok.value);
        var decoded = C.decodeQuoted(tok);
        if (decoded.bytes.length === 0)
            this.error(node, 'empty character constant');
        if (prefix !== null && prefix[1] !== 'u8') {
            var type = prefix[1] === 'L' ? types.wchar : (prefix[1] === 'u' ? types.char16 : types.char32);
            return this.constant(big.fromFloat(decoded.bytes[0]), type, node);
        }
        if (decoded.bytes.length > 1) {
            // A multi-character constant is an int, as in g++.
            var value = 0;
            decoded.bytes.forEach(function (byte) { value = (value << 8) | byte; });
            return this.constant(big.fromFloat(value), types.int, node);
        }
        var byte = decoded.bytes[0];
        if (prefix !== null)
            return this.constant(big.fromFloat(byte), types.uchar, node);
        return this.constant(big.fromFloat(byte > 127 ? byte - 256 : byte), types.char, node);
    };

    Parser.prototype.stringIr = function (node) {
        var charType = node.prefix === 'L' || node.prefix === 'U' ? (node.prefix === 'L' ? types.wchar : types.char32)
                                                                   : types.char;
        if (node.prefix === 'u')
            this.error(node, 'char16_t string literals are not supported');
        var type = X.arrayOf(X.qualify(charType, X.CONST), node.bytes.length + 1);
        return this.ir('string', node, { bytes: node.bytes, wide: charType !== types.char, type: type, cat: 'lvalue' });
    };

    Parser.prototype.functionNameIr = function (node) {
        var context = this.func;
        while (context !== null && context.lambda !== null && context.parent !== null && !node.pretty)
            context = context.parent;
        var text = 'main';
        if (context !== null && context.func !== null) {
            if (node.pretty) {
                var func = context.func;
                text = (func.isCtor || func.isDtor ? '' : X.typeString(func.type.returns) +
                        ' ') + X.functionSignature(func);
            } else {
                text = context.lambda !== null ? 'operator()' : context.func.name;
            }
        } else if (node.pretty) {
            text = 'int main()';
        }
        var bytes = T.utf8.encode(text).split('').map(function (char) { return char.charCodeAt(0); });
        return this.stringIr({ bytes: bytes, prefix: '', line: node.line, file: node.file });
    };

    // --- this and names

    Parser.prototype.thisPointer = function (node) {
        var context = this.func;
        // In a lambda, this is the captured this of the enclosing function.
        if (context !== null && context.lambda !== null)
            return this.capturedThis(node);
        if (context === null || context.thisClass === null)
            this.error(node, "invalid use of 'this' in non-member function");
        return this.ir('this', node,
                       { type: X.pointerTo(X.qualify(context.thisClass, context.thisCv)), cat: 'prvalue' });
    };

    // *this of the current member function.
    Parser.prototype.thisObject = function (node) {
        var pointer = this.thisPointer(node);
        return this.ir('deref', node, { pointer: pointer, type: pointer.type.to, cat: 'lvalue' });
    };

    Parser.prototype.nameIr = function (node) {
        var entity = node.entity;
        if (node.dependent && entity === null)
            this.error(node, "dependent name '" + (node.prefix || '') + node.name + "' cannot be used here");
        if (entity === null || entity === undefined) {
            if (node.qualifier !== null && node.qualifier !== undefined)
                this.error(node, "'" + node.name + "' is not a member of '" + this.scopeName(node.qualifier) + "'");
            this.error(node, "'" + node.name + "' was not declared in this scope");
        }
        switch (entity.kind) {
        case 'var':
            return this.variableIr(entity, node);
        case 'field':
            return this.implicitMember(entity, node);
        case 'functions':
        case 'template':
            if (entity.kind === 'template' && entity.what !== 'function')
                this.error(node, "missing template arguments before '" + this.peekText(node) + "'");
            return this.overloadIr(entity.kind === 'template' ? { kind: 'functions', name: entity.name,
                                                                  items: [entity] }
                                                              : entity, node, null);
        case 'func':
            return this.overloadIr({ kind: 'functions', name: entity.name, items: [entity] }, node, null);
        case 'enumerator':
            return this.constant(entity.value, entity.type, node);
        case 'constant':
            return this.constant(entity.value, entity.type, node);
        case 'parampack':
            return this.packParameter(entity, node);
        case 'capturefield': {
            if (this.func === null || this.func.lambda !== entity.info)
                this.error(node, "'" + node.name + "' is not captured");
            var captured = this.fieldIr(this.closureObject(this.func, node), entity.field, node);
            return entity.field.refCapture ? captured : captured;
        }
        case 'valuepack':
            return this.valuePackElement(entity, node);
        case 'ambiguous':
            this.error(node, "reference to '" + node.name + "' is ambiguous");
            break;
        case 'namespace':
            this.error(node, "expected primary-expression before '" + this.peekText(node) + "' token");
            break;
        }
        if (X.isTypeEntity(entity))
            this.error(node, "expected primary-expression before '" + this.peekText(node) + "' token");
        this.error(node, "'" + node.name + "' cannot be used here");
    };

    Parser.prototype.peekText = function (node) {
        return node.name;
    };

    Parser.prototype.variableIr = function (object, node) {
        if (object.storage === 'local' && this.func !== null && object.context !== this.func &&
            object.context !== undefined)
            return this.captureVariable(object, node);
        if (object.member && object.extern && object.constValue !== undefined)
            return this.constant(object.constValue, unqual(object.type), node);
        if (object.constValue !== undefined && X.isConst(object.type) && !object.addressNeeded) {
            var result = this.ir('var', node, { obj: object, type: X.removeRef(object.type), cat: 'lvalue' });
            result.value = object.constValue;
            return result;
        }
        var type = object.type;
        return this.ir('var', node, { obj: object, type: X.removeRef(type), cat: 'lvalue' });
    };

    // A data member named without an object: this->member.
    Parser.prototype.implicitMember = function (field, node) {
        var context = this.func;
        if (context === null || (context.thisClass === null && context.lambda === null) ||
            (context.func !== null && context.func.isStatic))
            this.error(node, "invalid use of non-static data member '" + X.qualifiedName(field.owner) + '::' +
                       field.name + "'");
        var object = this.thisObject(node);
        return this.fieldAccess(object, X.unqual(object.type), field.name, field, node);
    };

    // --- Member access

    Parser.prototype.memberAccess = function (node) {
        var object = this.check(node.expr);
        if (node.arrow)
            object = this.arrowObject(object, node);
        var type = unqual(object.type);
        if (!type.isClass) {
            if (node.name.destructor !== null && node.name.destructor !== undefined)
                return this.ir('pseudodtor', node, { object: object, type: types.void, cat: 'prvalue' });
            this.error(node, "request for member '" + node.name.name + "' in '" + this.describeSyntax(node.expr) +
                       "', which is of non-class type '" + X.typeString(object.type) + "'");
        }
        if (!type.complete)
            this.error(node, "invalid use of incomplete type '" + X.typeString(type) + "'");
        if (node.name.destructor !== null && node.name.destructor !== undefined)
            return this.ir('dtorref', node, { object: object, cls: type, type: types.void, cat: 'prvalue' });
        var memberName = node.name.name;
        var lookupClass = type;
        var qualified = node.name.qualifier !== null && node.name.qualifier !== undefined;
        if (qualified && node.name.qualifier.isClass) {
            // x.Base::f - the member of that base.
            lookupClass = node.name.qualifier;
            var baseOffset = X.baseOffset(type, lookupClass);
            if (baseOffset < 0)
                this.error(node, "'" + X.typeString(lookupClass) + "' is not a base of '" + X.typeString(type) + "'");
            object = this.baseSubobject(object, lookupClass, baseOffset, node);
            type = lookupClass;
        }
        var member = this.fieldAccess(object, type, memberName, null, node, node.name);
        // x.Base::f() calls Base::f, not the overrider.
        if (qualified && member.k === 'overload')
            member.qualified = true;
        return member;
    };

    // p-> : a pointer to a class, or a class with operator->.
    Parser.prototype.arrowObject = function (object, node) {
        for (var depth = 0; depth < 32; ++depth) {
            var type = valueType(this.decayValue(object));
            if (type.kind === 'pointer') {
                var pointer = this.decayValue(object);
                return this.ir('deref', node, { pointer: pointer, type: type.to, cat: 'lvalue' });
            }
            if (type.isClass) {
                object = this.operatorCall('->', [object], node, true);
                if (object === null)
                    break;
                continue;
            }
            break;
        }
        this.error(node, "base operand of '->' has non-pointer type '" + X.typeString(object.type) + "'");
    };

    // A member of an object: a field, a static member, methods.
    Parser.prototype.fieldAccess = function (object, cls, name, known, node, nameNode) {
        var found = known !== null ? X.lookupMember(cls, name) : X.lookupMember(cls, name);
        if (found === null)
            this.error(node, "'" + X.typeString(cls) + "' has no member named '" + name + "'");
        var entity = found.entity;
        if (entity.kind === 'field') {
            this.checkAccess(entity, found.owner, node);
            var owner = this.baseSubobject(object, found.owner, found.offset, node);
            return this.fieldIr(owner, entity, node);
        }
        if (entity.kind === 'var') {
            this.checkAccess(entity, found.owner, node);
            var staticIr = this.variableIr(entity, node);
            return object.cat === 'prvalue' || this.hasEffects(object)
                ? this.ir('comma', node, { list: [object, staticIr], type: staticIr.type, cat: staticIr.cat })
                : staticIr;
        }
        if (entity.kind === 'functions' || entity.kind === 'template' || entity.kind === 'func') {
            var set = entity.kind === 'functions' ? entity : { kind: 'functions', name: entity.name, items: [entity] };
            var result = this.overloadIr(set, nameNode || node, object);
            result.memberOwner = found.owner;
            result.memberOffset = found.offset;
            return result;
        }
        if (entity.kind === 'enumerator')
            return this.constant(entity.value, entity.type, node);
        this.error(node, "invalid use of '" + name + "'");
    };

    Parser.prototype.hasEffects = function (ir) {
        return !(ir.k === 'var' || ir.k === 'this' || ir.k === 'const' ||
                 (ir.k === 'deref' && this.hasEffects(ir.pointer) === false) ||
                 (ir.k === 'field' && !this.hasEffects(ir.object)));
    };

    // The base subobject of an object (static offset).
    Parser.prototype.baseSubobject = function (object, base, offset, node) {
        if (unqual(object.type) === base)
            return object;
        var cv = X.cvOf(object.type);
        if (object.cat === 'prvalue')
            object = this.materialize(object);
        return this.ir('glvadj', node, { operand: object, offset: offset, type: X.qualify(base, cv), cat: object.cat });
    };

    Parser.prototype.fieldIr = function (object, field, node) {
        if (object.cat === 'prvalue')
            object = this.materialize(object);
        if (field.viaAnonymous !== undefined) {
            var outer = this.fieldIr(object, field.viaAnonymous, node);
            return this.fieldIr(outer, field.inner, node);
        }
        var type = field.type;
        if (X.isRef(type))
            return this.ir('field', node, { object: object, field: field, offset: field.offset, ref: true,
                                            type: type.to, cat: 'lvalue' });
        var cv = X.cvOf(object.type);
        if (field.mutable)
            cv &= ~X.CONST;
        var result = this.ir('field', node, { object: object, field: field, offset: field.offset,
                                              type: X.qualify(type, cv),
                                              cat: object.cat === 'lvalue' ? 'lvalue' : 'xvalue' });
        if (field.bits !== null)
            result.bitfield = field;
        return result;
    };

    // Access control: private and protected members from outside.
    Parser.prototype.checkAccess = function (member, owner, node) {
        var access = member.access;
        if (access === undefined || access === 'public')
            return;
        if (this.canAccess(owner, access, member))
            return;
        var what = member.kind === 'func' ? X.functionSignature(member)
                                          : X.qualifiedName(owner) + '::' + member.name;
        this.error(node, "'" + what + "' is " + access + ' within this context');
    };

    Parser.prototype.canAccess = function (owner, access, member) {
        if (this.library || (this.func !== null && this.func.func !== null && this.func.func.library))
            return true;
        for (var context = this.func; context !== null; context = context.parent) {
            var cls = context.thisClass || (context.func !== null && context.func.owner && context.func.owner.isClass
                                            ? context.func.owner : null);
            if (context.func !== null && context.func.friendOf !== undefined)
                cls = context.func.friendOf;
            for (var current = cls; current !== null && current !== undefined && current.isClass;
                current = current.parent) {
                if (current === owner)
                    return true;
                if (access === 'protected' && X.isBaseOf(owner, current))
                    return true;
                if (owner.friends && owner.friends.indexOf(context.func) >= 0)
                    return true;
                if (owner.friendClasses && owner.friendClasses.indexOf(current) >= 0)
                    return true;
            }
            if (context.func !== null && owner.friends && owner.friends.indexOf(context.func) >= 0)
                return true;
            if (context.lambda === null)
                break;
        }
        // Members of the class itself in scopes (default arguments, initializers).
        for (var scope = this.scope; scope !== null && scope !== undefined; scope = scope.parent) {
            if (scope === owner || (scope.isClass && access === 'protected' && X.isBaseOf(owner, scope)))
                return true;
        }
        return false;
    };

    // --- Subscript

    Parser.prototype.subscript = function (node) {
        var base = this.check(node.expr);
        if (unqual(base.type).isClass) {
            var argument = node.index.k === 'braced' ? node.index : this.check(node.index);
            var call = this.operatorCall('[]', [base, argument], node, true);
            if (call !== null)
                return call;
            this.error(node, "no match for 'operator[]' (operand types are '" + X.typeString(base.type) + "' and '" +
                       X.typeString(argument.type) + "')");
        }
        var index = this.check(node.index);
        if (unqual(index.type).isClass)
            index = this.convertToIntegral(index, node);
        var left = this.decayValue(base), right = this.decayValue(index);
        if (valueType(left).kind !== 'pointer' && valueType(right).kind === 'pointer') {
            var swap = left;
            left = right;
            right = swap;
        }
        var pointerType = valueType(left);
        if (pointerType.kind !== 'pointer')
            this.error(node, "invalid types '" + X.typeString(base.type) + "[" + X.typeString(index.type) +
                       "]' for array subscript");
        if (!X.isIntegralLike(valueType(right)) && valueType(right).kind !== 'enum')
            this.error(node, "invalid types '" + X.typeString(base.type) + "[" + X.typeString(index.type) +
                       "]' for array subscript");
        var element = pointerType.to;
        if (unqual(element).kind === 'void' || (!X.isComplete(element) && unqual(element).kind !== 'array'))
            this.error(node, "invalid use of incomplete type '" + X.typeString(element) + "'");
        var address = this.ir('ptrarith', node, { op: '+', pointer: left, index: right, elemSize: unqual(element).size,
                                                  type: pointerType, cat: 'prvalue' });
        var cat = base.cat === 'prvalue' && unqual(base.type).kind === 'array' ? 'xvalue' : 'lvalue';
        return this.ir('deref', node, { pointer: address, type: element, cat: cat, indexed: true });
    };

    // --- ++ and --

    Parser.prototype.incrementExpr = function (node) {
        var target = this.check(node.expr);
        var prefix = node.k === 'preinc';
        if (unqual(target.type).isClass) {
            var args = prefix ? [target] : [target, this.constant(0, types.int, node)];
            var call = this.operatorCall(node.op, args, node, true, !prefix);
            if (call !== null)
                return call;
            this.error(node, "no match for 'operator" + node.op + "' (operand type is '" + X.typeString(target.type) +
                       "')");
        }
        this.modifiable(target, node, node.op === '++' ? 'increment' : 'decrement');
        var type = valueType(target);
        if (type === types.bool)
            this.error(node, "use of an operand of type 'bool' in 'operator" + node.op + "' is forbidden in C++17");
        if (!X.isArithmetic(type) && type.kind !== 'pointer' && !(type.kind === 'enum' && false))
            this.error(node, "no match for 'operator" + node.op + "' (operand type is '" + X.typeString(target.type) +
                       "')");
        if (type.kind === 'pointer' && !X.isComplete(type.to))
            this.error(node, "invalid use of incomplete type '" + X.typeString(type.to) + "'");
        return this.ir('incdec', node, { op: node.op, prefix: prefix, target: target, type: target.type,
                                         cat: prefix ? 'lvalue' : 'prvalue' });
    };

    // An lvalue that can be changed.
    Parser.prototype.modifiable = function (target, node, what) {
        if (target.cat !== 'lvalue') {
            if (what === 'increment' || what === 'decrement')
                this.error(node, 'lvalue required as ' + what + ' operand');
            this.error(node, 'lvalue required as left operand of assignment');
        }
        if (X.isConst(target.type)) {
            var name = this.targetName(target);
            if (target.k === 'field' && target.object && X.isConst(target.object.type))
                this.error(node, 'assignment of member ' + "'" + target.field.name + "' in read-only object");
            if (name !== null)
                this.error(node, (what === 'increment' ? 'increment' : (what === 'decrement' ? 'decrement'
                                                                                              : 'assignment')) +
                           ' of read-only ' + (target.k === 'field' ? 'member' : 'variable') + " '" + name + "'");
            this.error(node, 'assignment of read-only location');
        }
        if (unqual(target.type).kind === 'array')
            this.error(node, "invalid array assignment");
    };

    Parser.prototype.targetName = function (target) {
        if (target.k === 'var')
            return target.obj.name;
        if (target.k === 'field')
            return target.field.name;
        return null;
    };

    // --- Unary operators

    Parser.prototype.unaryExpr = function (node) {
        var op = node.op;
        if (op === '&')
            return this.addressOf(node);
        var operand = this.check(node.expr);
        var type = valueType(operand);
        if (type.isClass || (type.kind === 'enum' && op !== '!')) {
            var call = this.operatorCall(op, [operand], node, type.kind === 'enum' ? false : true);
            if (call !== null)
                return call;
            if (type.isClass && op === '!') {
                // The operand of ! converts to bool contextually (explicit operator bool).
                var test = this.contextualBool(operand, node.expr);
                return this.ir('not', node, { operand: test, type: types.bool, cat: 'prvalue' });
            }
            if (type.isClass) {
                var scalar = this.classToScalar(operand, null, node, false);
                if (scalar === null)
                    this.error(node, "no match for 'operator" + op + "' (operand type is '" +
                               X.typeString(operand.type) +
                               "')");
                operand = scalar;
                type = valueType(operand);
            }
        }
        switch (op) {
        case '*': {
            var pointer = this.decayValue(operand);
            var pointerType = valueType(pointer);
            if (pointerType.kind !== 'pointer')
                this.error(node, "invalid type argument of unary '*' (have '" + X.typeString(operand.type) + "')");
            if (unqual(pointerType.to).kind === 'void')
                this.error(node, "'" + X.typeString(pointerType) + "' is not a pointer-to-object type");
            if (pointerType.to.kind === 'function')
                return this.ir('deref', node, { pointer: pointer, type: pointerType.to, cat: 'lvalue' });
            return this.ir('deref', node, { pointer: pointer, type: pointerType.to, cat: 'lvalue' });
        }
        case '!': {
            var test = this.contextualBool(operand, node.expr);
            var result = this.ir('not', node, { operand: test, type: types.bool, cat: 'prvalue' });
            if (test.value !== undefined)
                result.value = isZero(test.value) ? 1 : 0;
            return result;
        }
        case '+':
        case '-':
        case '~': {
            var value = this.decayValue(operand);
            var valueTypeOf = valueType(value);
            if (op === '+' && valueTypeOf.kind === 'pointer')
                return value;
            if (op === '~' ? !X.isIntegralLike(valueTypeOf) : !X.isArithmeticLike(valueTypeOf))
                this.error(node, "wrong type argument to " + (op === '~' ? 'bit-complement' : 'unary ' +
                                                              (op === '-' ? 'minus' : 'plus')));
            var promoted = X.promote(valueTypeOf);
            var converted = this.convertScalar(value, promoted);
            var unaryIr = this.ir('unary', node, { op: op, operand: converted, type: promoted, cat: 'prvalue' });
            if (converted.value !== undefined) {
                if (op === '+')
                    unaryIr.value = converted.value;
                else if (op === '-')
                    unaryIr.value = promoted.kind === 'float' ? -toNumber(converted.value)
                                                              : X.wrapValue(big.neg(converted.value), promoted);
                else
                    unaryIr.value = X.wrapValue(big.not(converted.value), promoted);
            }
            return unaryIr;
        }
        }
        this.error(node, 'unknown operator');
    };

    Parser.prototype.addressOf = function (node) {
        var operand = this.check(node.expr);
        if (operand.k === 'overload')
            return this.resolveAddress(operand, null, node);
        if (operand.k === 'func')
            return this.ir('fnaddr', node,
                           { func: operand.func, type: X.pointerTo(operand.func.type), cat: 'prvalue' });
        if (operand.cat !== 'lvalue') {
            if (unqual(operand.type).isClass && operand.cat === 'xvalue')
                this.error(node, 'taking address of rvalue');
            this.error(node, 'lvalue required as unary \'&\' operand');
        }
        if (operand.bitfield)
            this.error(node, "attempt to take address of bit-field");
        this.markAddressTaken(operand);
        return this.ir('addr', node, { operand: operand, type: X.pointerTo(operand.type), cat: 'prvalue' });
    };

    // A variable whose address is taken lives in memory.
    Parser.prototype.markAddressTaken = function (ir) {
        while (ir.k === 'glvadj')
            ir = ir.operand;
        if (ir.k === 'var' && !X.isRef(ir.obj.type)) {
            ir.obj.addressTaken = true;
            if (ir.obj.constValue !== undefined)
                ir.obj.addressNeeded = true;
        }
    };

    // --- sizeof

    Parser.prototype.sizeofExpr = function (node) {
        var type;
        if (node.type !== undefined) {
            type = X.removeRef(node.type);
        } else {
            var operand = this.unevaluated(function () { return this.check(node.expr); });
            type = operand.type;
            if (operand.bitfield)
                this.error(node, "invalid application of 'sizeof' to a bit-field");
        }
        type = unqual(type);
        if (type.kind === 'function')
            this.error(node, "invalid application of 'sizeof' to a function type");
        if (type.vla) {
            var vla = this.ir('vlasize', node, { arrayType: type, type: types.ulong, cat: 'prvalue' });
            return vla;
        }
        if (!X.isComplete(type))
            this.error(node, "invalid application of 'sizeof' to incomplete type '" + X.typeString(type) + "'");
        return this.constant(big.fromFloat(type.size), types.ulong, node);
    };

    // Checks without generating: sizeof, decltype (no instantiation of
    // bodies is needed for them).
    Parser.prototype.unevaluated = function (callback) {
        var saved = this.isUnevaluated;
        this.isUnevaluated = true;
        try {
            return callback.call(this);
        } finally {
            this.isUnevaluated = saved;
        }
    };

    // noexcept(e): false when e calls a function that is not noexcept,
    // throws or allocates.
    Parser.prototype.noexceptOperator = function (node) {
        if (this.pattern && this.isDependentSyntax(node.expr))
            return this.constant(1, types.bool, node);
        var self = this;
        var checked = this.unevaluated(function () { return self.check(node.expr); });
        return this.constant(mayThrow(checked) ? 0 : 1, types.bool, node);
    };

    var NOT_OPERANDS = { type: 1, from: 1, to: 1, opType: 1, func: 1, ctor: 1, obj: 1, fnType: 1, set: 1, cls: 1 };

    function mayThrow(ir) {
        if (Array.isArray(ir))
            return ir.some(mayThrow);
        if (ir === null || typeof ir !== 'object' || typeof ir.k !== 'string')
            return false;
        switch (ir.k) {
        case 'throw':
        case 'new':
            return true;
        case 'call':
        case 'construct': {
            var func = ir.k === 'call' ? ir.func : ir.ctor;
            if (!func.type.noexcept && !func.isDtor && !(func.implicit && func.trivial))
                return true;
            break;
        }
        case 'icall':
            if (!ir.fnType.noexcept)
                return true;
            break;
        case 'dyncast':
            if (ir.reference)
                return true;
            break;
        }
        return Object.keys(ir).some(function (key) {
            var value = ir[key];
            return NOT_OPERANDS[key] !== 1 && value !== null && typeof value === 'object' && mayThrow(value);
        });
    }

    Parser.prototype.decltypeOf = function (expr, tok) {
        var self = this;
        var checked = this.unevaluated(function () { return self.check(expr); });
        if (checked.k === 'overload')
            checked = this.resolveAddress(checked, null, tok);
        var inner = expr;
        if (inner.k === 'name' && checked.k === 'var' && !checked.parenthesized)
            return checked.obj.type;
        if ((inner.k === 'member' || inner.k === 'name') && checked.k === 'field' && !checked.parenthesized)
            return checked.field.type;
        if (checked.cat === 'lvalue')
            return X.lref(checked.type);
        if (checked.cat === 'xvalue')
            return X.rref(checked.type);
        return checked.type;
    };

    // --- Casts

    Parser.prototype.namedCast = function (node) {
        var operand = this.check(node.expr);
        var target = node.type;
        switch (node.kind) {
        case 'static':
            return this.staticCast(target, operand, node, true);
        case 'const':
            return this.constCast(target, operand, node);
        case 'reinterpret':
            return this.reinterpretCast(target, operand, node);
        case 'dynamic':
            return this.dynamicCast(target, operand, node);
        }
    };

    // static_cast<T>(e); report - errors are reported (false: null when the
    // cast is not a static_cast, for C-style casts).
    Parser.prototype.staticCast = function (target, operand, node, report) {
        var to = unqual(X.removeRef(target));
        if (to.kind === 'void' && !X.isRef(target))
            return this.ir('conv', node, { operand: operand, from: operand.type, to: types.void, type: types.void,
                                           cat: 'prvalue' });
        if (X.isRef(target)) {
            var source = unqual(operand.type);
            if (to.isClass && source.isClass && to !== source && X.isBaseOf(source, to) && operand.cat !== 'prvalue') {
                // A downcast of a reference.
                var downOffset = X.baseOffset(to, source);
                return this.ir('glvadj', node,
                               { operand: operand, offset: -downOffset, type: X.qualify(to, X.cvOf(target.to)),
                                                 cat: target.kind === 'lref' ? 'lvalue' : 'xvalue' });
            }
            if (target.kind === 'rref' && this.isGlvalue(operand) && (source === to || X.isBaseOf(to, source))) {
                var moved = source === to ? operand : this.baseSubobject(operand, to, X.baseOffset(source, to), node);
                var copy = this.shallowCopy(moved);
                copy.cat = 'xvalue';
                copy.type = X.qualify(to, X.cvOf(target.to) | X.cvOf(operand.type));
                return copy;
            }
            var bound = this.attemptBind(target, operand, node);
            if (bound !== null)
                return this.glvalueFromBinding(bound, target, node);
            if (!report)
                return null;
            this.error(node, "invalid static_cast from type '" + X.typeString(operand.type) + "' to type '" +
                       X.typeString(target) + "'");
        }
        if (to.isClass)
            return this.directInitialize(to, [operand], node, true);
        var value = this.decayValue(operand);
        var from = valueType(value);
        if (from.isClass) {
            var converted = this.classToScalar(value, to, node, true);
            if (converted !== null)
                return converted;
        }
        if (X.isArithmeticLike(to) || to.kind === 'enum') {
            if (X.isArithmeticLike(from) || from.kind === 'enum')
                return this.convertScalar(value, to);
        }
        if (to.kind === 'pointer' && from.kind === 'pointer') {
            var toClass = unqual(to.to), fromClass = unqual(from.to);
            if (toClass.isClass && fromClass.isClass && toClass !== fromClass) {
                if (X.isBaseOf(toClass, fromClass))
                    return this.pointerToBase(value, toClass, to, node);
                if (X.isBaseOf(fromClass, toClass)) {
                    var offset = X.baseOffset(toClass, fromClass);
                    return this.ir('ptradj', node, { operand: value, offset: -offset, nullCheck: true, type: to,
                                                     cat: 'prvalue' });
                }
            }
            if (unqual(from.to).kind === 'void' || unqual(to.to).kind === 'void' || toClass === fromClass)
                return this.retype(value, to);
        }
        if (to.kind === 'pointer' && (from.kind === 'nullptr' || X.isNullPointerConstant(value)))
            return this.convertScalar(value, to);
        if (to.kind === 'nullptr' && from.kind === 'nullptr')
            return value;
        if (!report)
            return null;
        this.error(node, "invalid static_cast from type '" + X.typeString(operand.type) + "' to type '" +
                   X.typeString(target) + "'");
    };

    // The same value with another type (pointers of unrelated types).
    Parser.prototype.retype = function (ir, type) {
        var result = this.ir('conv', ir, { operand: ir, from: valueType(ir), to: unqual(type), type: unqual(type),
                                           cat: 'prvalue', same: true });
        if (ir.value !== undefined)
            result.value = ir.value;
        return result;
    };

    Parser.prototype.shallowCopy = function (ir) {
        var copy = Object.create(null);
        Object.keys(ir).forEach(function (key) { copy[key] = ir[key]; });
        return copy;
    };

    Parser.prototype.constCast = function (target, operand, node) {
        if (X.isRef(target)) {
            if (!this.isGlvalue(operand) && target.kind === 'lref')
                this.error(node, "invalid const_cast of an rvalue of type '" + X.typeString(operand.type) +
                           "' to type '" +
                           X.typeString(target) + "'");
            var copy = this.shallowCopy(this.materialize(operand));
            copy.type = target.to;
            copy.cat = target.kind === 'lref' ? 'lvalue' : 'xvalue';
            return copy;
        }
        var value = this.decayValue(operand);
        if (unqual(target).kind !== 'pointer' || valueType(value).kind !== 'pointer')
            this.error(node, "invalid const_cast from type '" + X.typeString(operand.type) + "' to type '" +
                       X.typeString(target) + "'");
        return this.retype(value, target);
    };

    Parser.prototype.reinterpretCast = function (target, operand, node) {
        if (X.isRef(target)) {
            var glvalue = this.materialize(operand);
            if (!this.isGlvalue(glvalue))
                this.error(node, "invalid cast of an rvalue expression of type '" + X.typeString(operand.type) +
                           "' to type '" + X.typeString(target) + "'");
            this.markAddressTaken(glvalue);
            var address = this.ir('addr', node, { operand: glvalue, type: X.pointerTo(glvalue.type), cat: 'prvalue' });
            return this.ir('deref', node, { pointer: this.retype(address, X.pointerTo(target.to)), type: target.to,
                                            cat: target.kind === 'lref' ? 'lvalue' : 'xvalue' });
        }
        var value = this.decayValue(operand);
        var from = valueType(value), to = unqual(target);
        if (to.kind === 'pointer' && (from.kind === 'pointer' || X.isIntegralLike(from) || from.kind === 'enum' ||
                                      from.kind === 'nullptr'))
            return from.kind === 'pointer' ? this.retype(value, to) : this.convertScalar(value, to);
        if ((X.isIntegral(to) || to.kind === 'enum') && from.kind === 'pointer') {
            if (to.size < 8)
                this.error(node, "cast from '" + X.typeString(from) + "' to '" + X.typeString(to) +
                           "' loses precision");
            return this.convertScalar(value, to);
        }
        if (from === to)
            return value;
        this.error(node, "invalid cast from type '" + X.typeString(operand.type) + "' to type '" +
                   X.typeString(target) + "'");
    };

    // (T)e: const_cast, static_cast, reinterpret_cast - the first that fits.
    Parser.prototype.cStyleCast = function (target, operand, node) {
        var to = unqual(X.removeRef(target));
        if (to.isClass && !X.isRef(target))
            return this.directInitialize(to, [operand], node, true);
        var result = this.staticCast(target, operand, node, false);
        if (result !== null)
            return result;
        if (X.isRef(target) || unqual(target).kind === 'pointer') {
            var value = X.isRef(target) ? operand : this.decayValue(operand);
            if (X.isRef(target) || valueType(value).kind === 'pointer' || X.isIntegralLike(valueType(value)) ||
                valueType(value).kind === 'nullptr')
                return this.reinterpretCast(target, operand, node);
        }
        if ((X.isIntegral(to) || to.kind === 'enum') && valueType(this.decayValue(operand)).kind === 'pointer')
            return this.reinterpretCast(target, operand, node);
        this.error(node, "invalid cast from type '" + X.typeString(operand.type) + "' to type '" +
                   X.typeString(target) + "'");
    };

    // T(args), T{args}.
    Parser.prototype.functionalCastIr = function (node) {
        var type = node.type;
        if (X.containsAuto(type)) {
            if (node.args.length !== 1)
                this.error(node, "invalid use of 'auto'");
            var only = this.check(node.args[0]);
            type = this.deducePlaceholder(type, only, node);
            return this.initializeFrom(type, only, node, true);
        }
        var plain = unqual(X.removeRef(type));
        if (plain.isClass && plain.abstract)
            this.error(node, "invalid cast to abstract class type '" + X.typeString(plain) + "'");
        if (node.braced)
            return this.listInitialize(type, node.args, node, false);
        var args = this.checkArguments(node.args);
        if (args.length === 1 && !plain.isClass)
            return this.cStyleCast(type, args[0], node);
        if (args.length === 0 && !plain.isClass) {
            if (plain.kind === 'void')
                return this.ir('conv', node,
                               { operand: this.constant(0, types.int, node), from: types.int, to: types.void,
                                               type: types.void, cat: 'prvalue' });
            return this.valueInitialize(plain, node);
        }
        if (!plain.isClass)
            this.error(node, "expression list treated as compound expression in functional cast");
        return this.directInitialize(plain, args, node, true);
    };

    // --- Binary operators

    var COMPARISONS = { '<': 1, '>': 1, '<=': 1, '>=': 1, '==': 1, '!=': 1 };

    Parser.prototype.binaryExpr = function (node) {
        var op = node.op;
        if (op === '&&' || op === '||')
            return this.logicalExpr(node);
        var left = this.check(node.left);
        var right = node.right.k === 'braced' ? node.right : this.check(node.right);
        var leftType = valueType(left), rightType = right.k === 'braced' ? types.void : valueType(right);
        if (leftType.isClass || rightType.isClass || leftType.kind === 'enum' || rightType.kind === 'enum') {
            var call = this.operatorCall(op, [left, right], node, leftType.isClass || rightType.isClass);
            if (call !== null)
                return call;
            if (leftType.isClass || rightType.isClass) {
                var scalars = this.classOperandsToScalars(left, right, op, node);
                left = scalars[0];
                right = scalars[1];
            }
        }
        if (right.k === 'braced')
            this.error(node, "expected primary-expression before '{' token");
        return this.builtinBinary(op, left, right, node);
    };

    // A class operand of a built-in operator through its conversion function.
    Parser.prototype.classOperandsToScalars = function (left, right, op, node) {
        var self = this;
        var converted = [left, right].map(function (operand) {
            if (!valueType(operand).isClass)
                return operand;
            var scalar = self.classToScalar(operand, null, node, false);
            if (scalar === null)
                self.error(node, "no match for 'operator" + op + "' (operand types are '" + X.typeString(left.type) +
                           "' and '" + X.typeString(right.type) + "')");
            return scalar;
        });
        return converted;
    };

    Parser.prototype.builtinBinary = function (op, leftIr, rightIr, node) {
        var left = this.decayValue(leftIr), right = this.decayValue(rightIr);
        var leftType = valueType(left), rightType = valueType(right);
        if (COMPARISONS[op] === 1)
            return this.comparison(op, left, right, node, leftIr, rightIr);
        if ((op === '+' || op === '-') && (leftType.kind === 'pointer' || rightType.kind === 'pointer'))
            return this.pointerArithmetic(op, left, right, node, leftIr, rightIr);
        if (leftType.kind === 'enum' && leftType.scoped || rightType.kind === 'enum' && rightType.scoped)
            this.invalidOperands(op, leftIr, rightIr, node);
        if (op === '<<' || op === '>>') {
            if (!X.isIntegralLike(leftType) || !X.isIntegralLike(rightType))
                this.invalidOperands(op, leftIr, rightIr, node);
            var shifted = X.promote(leftType);
            var leftValue = this.convertScalar(left, shifted);
            var count = this.convertScalar(right, X.promote(rightType));
            var shiftIr = this.ir('binary', node,
                                  { op: op, left: leftValue, right: count, opType: shifted, type: shifted,
                                                    cat: 'prvalue' });
            if (leftValue.value !== undefined && count.value !== undefined) {
                var amount = toNumber(count.value);
                if (amount >= 0 && amount < shifted.size * 8)
                    shiftIr.value = X.wrapValue(op === '<<' ? big.shl(leftValue.value, amount)
                                                            : big.shr(leftValue.value, amount), shifted);
            }
            return shiftIr;
        }
        var integerOnly = op === '%' || op === '&' || op === '|' || op === '^';
        if (op === ',')
            return this.ir('comma', node, { list: [left, right], type: right.type, cat: right.cat });
        if (integerOnly ? !(X.isIntegralLike(leftType) && X.isIntegralLike(rightType))
                        : !(X.isArithmeticLike(leftType) && X.isArithmeticLike(rightType)))
            this.invalidOperands(op, leftIr, rightIr, node);
        var common = X.commonType(leftType, rightType);
        var a = this.convertScalar(left, common), b = this.convertScalar(right, common);
        var result = this.ir('binary', node,
                             { op: op, left: a, right: b, opType: common, type: common, cat: 'prvalue' });
        if (a.value !== undefined && b.value !== undefined) {
            if ((op === '/' || op === '%') && common.kind !== 'float' && isZero(b.value))
                return result;
            result.value = foldArithmetic(op, a.value, b.value, common);
        }
        return result;
    };

    Parser.prototype.invalidOperands = function (op, left, right, node) {
        this.error(node, "invalid operands of types '" + X.typeString(left.type) + "' and '" +
                   X.typeString(right.type) +
                   "' to binary 'operator" + op + "'");
    };

    function foldArithmetic(op, left, right, type) {
        if (type.kind === 'float') {
            left = toNumber(left);
            right = toNumber(right);
            var result = op === '+' ? left + right
                                    : (op === '-' ? left - right : (op === '*' ? left * right : left / right));
            return type === types.float ? Math.fround(result) : result;
        }
        switch (op) {
        case '+':
            return X.wrapValue(big.add(left, right), type);
        case '-':
            return X.wrapValue(big.sub(left, right), type);
        case '*':
            return X.wrapValue(big.mul(left, right), type);
        case '/':
            return X.wrapValue(big.quot(left, right), type);
        case '%':
            return X.wrapValue(big.rem(left, right), type);
        case '&':
            return X.wrapValue(big.and(left, right), type);
        case '|':
            return X.wrapValue(big.or(left, right), type);
        case '^':
            return X.wrapValue(big.xor(left, right), type);
        }
        return undefined;
    }

    X.foldArithmetic = foldArithmetic;

    Parser.prototype.pointerArithmetic = function (op, left, right, node, leftIr, rightIr) {
        var leftType = valueType(left), rightType = valueType(right);
        if (op === '-' && leftType.kind === 'pointer' && rightType.kind === 'pointer') {
            if (unqual(leftType.to) !== unqual(rightType.to))
                this.invalidOperands(op, leftIr, rightIr, node);
            return this.ir('ptrdiff', node, { left: left, right: right, elemSize: Math.max(1, unqual(leftType.to).size),
                                              type: types.long, cat: 'prvalue' });
        }
        var pointer = leftType.kind === 'pointer' ? left : right;
        var index = leftType.kind === 'pointer' ? right : left;
        var pointerType = valueType(pointer);
        if (!X.isIntegralLike(valueType(index)) || (op === '-' && rightType.kind === 'pointer'))
            this.invalidOperands(op, leftIr, rightIr, node);
        var target = unqual(pointerType.to);
        if (target.kind === 'function' || (!X.isComplete(target) && target.kind !== 'void'))
            this.error(node, "invalid use of incomplete type '" + X.typeString(pointerType.to) + "'");
        return this.ir('ptrarith', node, { op: op, pointer: pointer, index: index,
                                           elemSize: target.kind === 'void' ? 1 : target.size, type: pointerType,
                                           cat: 'prvalue' });
    };

    Parser.prototype.comparison = function (op, left, right, node, leftIr, rightIr) {
        var leftType = valueType(left), rightType = valueType(right);
        var opType;
        if (X.isArithmeticLike(leftType) && X.isArithmeticLike(rightType)) {
            opType = X.commonType(leftType, rightType);
        } else if (leftType.kind === 'enum' && leftType === rightType) {
            opType = X.promote(leftType.underlying);
        } else if (leftType.kind === 'pointer' && rightType.kind === 'pointer') {
            opType = leftType;
            var leftTarget = unqual(leftType.to), rightTarget = unqual(rightType.to);
            if (leftTarget !== rightTarget) {
                if (leftTarget.isClass && rightTarget.isClass && X.isBaseOf(leftTarget, rightTarget))
                    right = this.pointerToBase(right, leftTarget, leftType, node);
                else if (leftTarget.isClass && rightTarget.isClass && X.isBaseOf(rightTarget, leftTarget)) {
                    left = this.pointerToBase(left, rightTarget, rightType, node);
                    opType = rightType;
                } else if (leftTarget.kind !== 'void' && rightTarget.kind !== 'void')
                    this.error(node, "comparison between distinct pointer types '" + X.typeString(leftType) +
                               "' and '" +
                               X.typeString(rightType) + "' lacks a cast");
            }
        } else if (leftType.kind === 'pointer' && (rightType.kind === 'nullptr' || X.isNullPointerConstant(right))) {
            opType = leftType;
        } else if (rightType.kind === 'pointer' && (leftType.kind === 'nullptr' || X.isNullPointerConstant(left))) {
            opType = rightType;
        } else if (leftType.kind === 'nullptr' && rightType.kind === 'nullptr') {
            opType = types.ulong;
        } else if (leftType.kind === 'pointer' && X.isIntegralLike(rightType) ||
                   rightType.kind === 'pointer' && X.isIntegralLike(leftType)) {
            this.error(node, 'ISO C++ forbids comparison between pointer and integer');
        } else {
            this.invalidOperands(op, leftIr, rightIr, node);
        }
        var a = this.convertScalar(left, opType), b = this.convertScalar(right, opType);
        var result = this.ir('compare', node, { op: op, left: a, right: b, opType: opType, type: types.bool,
                                                cat: 'prvalue' });
        if (a.value !== undefined && b.value !== undefined && opType.kind !== 'pointer')
            result.value = compareConstants(op, a.value, b.value, opType) ? 1 : 0;
        return result;
    };

    function compareConstants(op, left, right, type) {
        var order;
        if (type.kind === 'float') {
            left = toNumber(left);
            right = toNumber(right);
            if (left !== left || right !== right)
                return op === '!=';
            order = left < right ? -1 : (left > right ? 1 : 0);
        } else {
            order = big.cmp(X.wrapValue(left, type), X.wrapValue(right, type));
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
    X.compareConstants = compareConstants;

    Parser.prototype.logicalExpr = function (node) {
        var left = this.check(node.left);
        var right = this.check(node.right);
        if (valueType(left).isClass || valueType(right).isClass) {
            var call = this.operatorCall(node.op, [left, right], node, true);
            if (call !== null)
                return call;
        }
        var a = this.contextualBool(left, node.left), b = this.contextualBool(right, node.right);
        // Temporaries of the right side live only while it is evaluated.
        b.conditional = true;
        var result = this.ir('logical', node, { op: node.op, left: a, right: b, type: types.bool, cat: 'prvalue' });
        if (a.value !== undefined) {
            if (node.op === '&&' && isZero(a.value))
                result.value = 0;
            else if (node.op === '||' && !isZero(a.value))
                result.value = 1;
            else if (b.value !== undefined)
                result.value = isZero(b.value) ? 0 : 1;
        }
        return result;
    };

    // --- Assignment

    Parser.prototype.assignExpr = function (node) {
        var target = this.check(node.target);
        var targetType = valueType(target);
        if (targetType.isClass) {
            var source = node.source.k === 'braced' ? node.source : this.check(node.source);
            var call = this.operatorCall(node.op, [target, source], node, true);
            if (call !== null)
                return call;
            this.error(node, "no match for 'operator" + node.op + "' (operand types are '" + X.typeString(target.type) +
                       "' and '" + (source.k === 'braced' ? '<brace-enclosed initializer list>'
                                                          : X.typeString(source.type)) + "')");
        }
        if (target.k === 'overload')
            this.error(node, 'lvalue required as left operand of assignment');
        if (node.op !== '=' && targetType.kind === 'enum') {
            var sourceIr = this.check(node.source);
            var overloaded = this.operatorCall(node.op, [target, sourceIr], node, false);
            if (overloaded !== null)
                return overloaded;
        }
        this.modifiable(target, node, 'assign');
        if (node.op === '=') {
            var value = node.source.k === 'braced'
                ? this.listInitialize(targetType, node.source.items, node.source, true)
                : this.initializeFrom(targetType, this.check(node.source), node.source, false, 'assignment');
            return this.ir('assign', node, { target: target, source: value, type: target.type, cat: 'lvalue' });
        }
        var op = node.op.slice(0, -1);
        var right = this.decayValue(this.check(node.source));
        var rightType = valueType(right);
        if (rightType.isClass)
            right = this.classOperandsToScalars(target, right, op, node)[1];
        rightType = valueType(right);
        if (targetType.kind === 'pointer' && (op === '+' || op === '-')) {
            if (!X.isIntegralLike(rightType))
                this.invalidOperands(op, target, right, node);
            return this.ir('compound', node, { op: op, target: target, source: right, pointer: true,
                                               elemSize: Math.max(1, unqual(targetType.to).size), type: target.type,
                                               cat: 'lvalue' });
        }
        var integerOnly = op === '%' || op === '&' || op === '|' || op === '^' || op === '<<' || op === '>>';
        if (integerOnly ? !(X.isIntegralLike(targetType) && X.isIntegralLike(rightType))
                        : !(X.isArithmeticLike(targetType) && X.isArithmeticLike(rightType)))
            this.invalidOperands(op, target, right, node);
        var opType = op === '<<' || op === '>>' ? X.promote(targetType) : X.commonType(targetType, rightType);
        var source = op === '<<' || op === '>>' ? this.convertScalar(right, X.promote(rightType))
                                                : this.convertScalar(right, opType);
        return this.ir('compound', node, { op: op, target: target, source: source, opType: opType, type: target.type,
                                           cat: 'lvalue' });
    };

    // --- ?:

    Parser.prototype.conditionalExpr = function (node) {
        var condition = this.contextualBool(this.check(node.cond), node.cond);
        var then = this.check(node.then);
        var otherwise = this.check(node.otherwise);
        var result = this.unifyConditional(then, otherwise, node);
        var conditional = this.ir('cond', node, { cond: condition, then: result[0], otherwise: result[1],
                                                  type: result[2], cat: result[3] });
        result[0].conditional = true;
        result[1].conditional = true;
        if (condition.value !== undefined && result[0].value !== undefined && result[1].value !== undefined)
            conditional.value = isZero(condition.value) ? result[1].value : result[0].value;
        return conditional;
    };

    // The operands of ?: brought to one type: [then, otherwise, type, cat].
    Parser.prototype.unifyConditional = function (then, otherwise, node) {
        var thenType = valueType(then), otherType = valueType(otherwise);
        if (then.k === 'throw')
            return [then, otherwise, otherwise.type, otherwise.cat];
        if (otherwise.k === 'throw')
            return [then, otherwise, then.type, then.cat];
        if (thenType.kind === 'void' || otherType.kind === 'void')
            return [then, otherwise, types.void, 'prvalue'];
        if (thenType === otherType && then.cat === otherwise.cat && then.cat !== 'prvalue' &&
            X.cvOf(then.type) === X.cvOf(otherwise.type) && !then.bitfield && !otherwise.bitfield)
            return [then, otherwise, then.type, then.cat];
        if (thenType.isClass || otherType.isClass) {
            if (thenType === otherType) {
                var type = X.qualify(thenType, X.cvOf(then.type) | X.cvOf(otherwise.type));
                if (then.cat === 'lvalue' && otherwise.cat === 'lvalue')
                    return [then, otherwise, type, 'lvalue'];
                return [this.initializeFrom(thenType, then, node), this.initializeFrom(thenType, otherwise, node),
                        thenType, 'prvalue'];
            }
            if (otherType.isClass && X.isBaseOf(otherType, thenType))
                return [this.initializeFrom(otherType, then, node), this.initializeFrom(otherType, otherwise, node),
                        otherType, 'prvalue'];
            if (thenType.isClass && X.isBaseOf(thenType, otherType))
                return [this.initializeFrom(thenType, then, node), this.initializeFrom(thenType, otherwise, node),
                        thenType, 'prvalue'];
            if (thenType.isClass && this.attemptImplicit(thenType, otherwise, node) !== null)
                return [this.initializeFrom(thenType, then, node), this.initializeFrom(thenType, otherwise, node),
                        thenType, 'prvalue'];
            if (otherType.isClass && this.attemptImplicit(otherType, then, node) !== null)
                return [this.initializeFrom(otherType, then, node), this.initializeFrom(otherType, otherwise, node),
                        otherType, 'prvalue'];
            this.error(node, "operands to '?:' have different types '" + X.typeString(then.type) + "' and '" +
                       X.typeString(otherwise.type) + "'");
        }
        var a = this.decayValue(then), b = this.decayValue(otherwise);
        var aType = valueType(a), bType = valueType(b);
        if (X.isArithmeticLike(aType) && X.isArithmeticLike(bType)) {
            // The same type stays (char ? char), others convert as for '+'.
            var common = aType === bType ? aType : X.commonType(aType, bType);
            return [this.convertScalar(a, common), this.convertScalar(b, common), common, 'prvalue'];
        }
        if (aType.kind === 'enum' && aType === bType)
            return [a, b, aType, 'prvalue'];
        if (aType.kind === 'pointer' && (bType.kind === 'nullptr' || X.isNullPointerConstant(b)))
            return [a, this.convertScalar(b, aType), aType, 'prvalue'];
        if (bType.kind === 'pointer' && (aType.kind === 'nullptr' || X.isNullPointerConstant(a)))
            return [this.convertScalar(a, bType), b, bType, 'prvalue'];
        if (aType.kind === 'pointer' && bType.kind === 'pointer') {
            var composite = this.compositePointer(aType, bType, node);
            return [this.implicitPointer(a, composite, node), this.implicitPointer(b, composite, node), composite,
                    'prvalue'];
        }
        if (aType === bType)
            return [a, b, aType, 'prvalue'];
        this.error(node, "operands to '?:' have different types '" + X.typeString(then.type) + "' and '" +
                   X.typeString(otherwise.type) + "'");
    };

    Parser.prototype.compositePointer = function (left, right, node) {
        var a = unqual(left.to), b = unqual(right.to);
        var cv = X.cvOf(left.to) | X.cvOf(right.to);
        if (a === b)
            return X.pointerTo(X.qualify(a, cv));
        if (a.kind === 'void' || b.kind === 'void')
            return X.pointerTo(X.qualify(types.void, cv));
        if (a.isClass && b.isClass && X.isBaseOf(a, b))
            return X.pointerTo(X.qualify(a, cv));
        if (a.isClass && b.isClass && X.isBaseOf(b, a))
            return X.pointerTo(X.qualify(b, cv));
        this.error(node, "conditional expression between distinct pointer types '" + X.typeString(left) + "' and '" +
                   X.typeString(right) + "' lacks a cast");
    };

    Parser.prototype.commaExpr = function (node) {
        var self = this;
        var list = node.list.map(function (item) { return self.check(item); });
        for (var index = 1; index < list.length; ++index) {
            var leftType = valueType(list[index - 1]);
            if (leftType.isClass || valueType(list[index]).isClass) {
                var call = this.operatorCall(',', [list[index - 1], list[index]], node, true);
                if (call !== null) {
                    list.splice(index - 1, 2, call);
                    --index;
                }
            }
        }
        if (list.length === 1)
            return list[0];
        var last = list[list.length - 1];
        return this.ir('comma', node, { list: list, type: last.type, cat: last.cat, value: undefined });
    };

    // --- Type traits of the compiler

    // The value category of declval<T>(): an lvalue for T&, else an xvalue.
    function probeCategory(type) {
        return X.isRef(type) && type.kind === 'lref' ? 'lvalue' : 'xvalue';
    }

    Parser.prototype.typeTrait = function (node) {
        var first = node.types[0], second = node.types[1];
        var plain = unqual(first);
        switch (node.name) {
        case '__is_class':
            return plain.isClass === true && plain.kind !== 'union';
        case '__is_union':
            return plain.kind === 'union';
        case '__is_enum':
            return plain.kind === 'enum';
        case '__is_trivially_copyable':
            return X.isScalar(plain) || (plain.isClass && this.isTriviallyCopyable(plain)) ||
                (plain.kind === 'array' && this.isTriviallyCopyable(plain));
        case '__is_trivially_destructible':
            return !X.isRef(first) && plain.kind !== 'void' && this.isTriviallyDestructible(plain);
        case '__is_trivially_constructible':
            return X.isScalar(plain) || (plain.isClass && this.isTriviallyDefaultConstructible(plain));
        case '__is_empty':
            return plain.isClass === true && X.isEmptyClass(plain);
        case '__is_polymorphic':
            return plain.isClass === true && plain.polymorphic;
        case '__is_abstract':
            return plain.isClass === true && plain.abstract;
        case '__is_final':
            return plain.isClass === true && !!plain.final;
        case '__has_virtual_destructor':
            if (!plain.isClass)
                return false;
            this.declareImplicitMembers(plain);
            return plain.dtor !== null && plain.dtor.isVirtual;
        case '__is_aggregate':
            return plain.kind === 'array' || (plain.isClass === true && this.isAggregate(plain));
        case '__is_constructible1':
        case '__is_constructible':
            return this.isConstructible(first, node.types.slice(1), node);
        case '__is_nothrow_move_constructible':
            return !X.isRef(first) && plain.kind !== 'void' && plain.kind !== 'function' &&
                this.isNothrowMoveConstructible(plain);
        case '__is_standard_layout':
            return X.isScalar(plain) || (plain.isClass === true && !plain.polymorphic);
        case '__is_base_of':
            return plain.isClass === true && unqual(second).isClass === true && X.isBaseOf(plain, unqual(second));
        case '__is_same':
            return first === second;
        case '__is_convertible': {
            var probe = { k: 'probe', type: X.removeRef(first), cat: probeCategory(first), line: node.line,
                          file: node.file };
            if (unqual(first).kind === 'void')
                return unqual(second).kind === 'void';
            return this.conversion(second, probe, {}) !== null;
        }
        case '__is_assignable': {
            var target = { k: 'probe', type: X.removeRef(first), cat: probeCategory(first), line: node.line,
                           file: node.file };
            var value = { k: 'probe', type: X.removeRef(second), cat: probeCategory(second), line: node.line,
                          file: node.file };
            if (unqual(target.type).isClass)
                return true;
            return target.cat === 'lvalue' && !X.isConst(target.type) &&
                this.conversion(unqual(target.type), value, {}) !== null;
        }
        }
        return false;
    };

    // T(args) with arguments of the types (values of the categories the
    // reference types give).
    Parser.prototype.isConstructible = function (type, argTypes, node) {
        var plain = unqual(type);
        if (plain.kind === 'void' || plain.kind === 'function' ||
            argTypes.some(function (arg) { return unqual(arg).kind === 'void'; }))
            return false;
        var args = argTypes.map(function (arg) {
            return { k: 'probe', type: X.removeRef(arg), cat: arg.kind === 'lref' ? 'lvalue'
                : (arg.kind === 'rref' ? 'xvalue' : 'prvalue'), line: node.line, file: node.file };
        });
        if (X.isRef(type))
            return args.length === 1 && this.referenceConversion(type, args[0], {}) !== null;
        if (plain.kind === 'array')
            return args.length === 0 && plain.length !== null && this.isConstructible(plain.of, [], node);
        if (!plain.isClass) {
            if (args.length === 0)
                return true;
            return args.length === 1 && this.conversion(plain, args[0], { explicit: true }) !== null;
        }
        if (!plain.complete || plain.abstract)
            return false;
        if (args.length === 0 && this.isAggregate(plain))
            return true;
        var chosen = this.resolveOverload(this.classCtors(plain), args, node, { ctorOf: plain, silent: true,
                                                                              explicit: true });
        return chosen !== null && chosen.best !== null && !chosen.best.deleted;
    };

    // --- offsetof, typeid

    Parser.prototype.offsetofExpr = function (node) {
        var type = unqual(node.type);
        var offset = 0;
        var current = type;
        for (var index = 0; index < node.path.length; ++index) {
            if (!current.isClass)
                this.error(node, "'" + X.typeString(current) + "' is not a class type");
            var found = X.lookupMember(current, node.path[index]);
            if (found === null || found.entity.kind !== 'field')
                this.error(node, "'" + X.typeString(current) + "' has no member named '" + node.path[index] + "'");
            offset += found.offset + found.entity.offset;
            current = unqual(found.entity.type);
        }
        return this.constant(big.fromFloat(offset), types.ulong, node);
    };

    // --- Variadic C functions: va_start and friends

    Parser.prototype.vaExpr = function (node) {
        var list = this.check(node.ap);
        if (unqual(list.type) !== types.valist)
            this.error(node, "first argument to '" + node.k + "' is not of type 'va_list'");
        switch (node.k) {
        case 'vastart':
            if (this.func === null || this.func.func === null || !this.func.func.type.variadic)
                this.error(node, "'va_start' used in function with fixed arguments");
            return this.ir('vastart', node, { list: list, type: types.void, cat: 'prvalue' });
        case 'vaend':
            return this.ir('vaend', node, { list: list, type: types.void, cat: 'prvalue' });
        case 'vacopy':
            return this.ir('vacopy', node, { list: list, source: this.check(node.source), type: types.void,
                                             cat: 'prvalue' });
        }
        return this.ir('vaarg', node, { list: list, type: unqual(node.type), cat: 'prvalue' });
    };
})(globalThis);
