// C++: constant evaluation - calls of constexpr functions where a constant
// is needed (static_assert, array bounds, template arguments, cases,
// constants). The checker folds operators on constants; this interprets the
// checked bodies of constexpr functions over scalars: locals, loops,
// branches, switch and calls. What it cannot evaluate (references, objects,
// pointers, too many steps) is not a constant: the call runs when the
// program runs where that is allowed.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var X = T.cpp;
    var Parser = X.Parser;
    if (Object.prototype.hasOwnProperty.call(Parser.prototype, 'evaluateConstant'))
        return;

    var types = X.types;
    var unqual = X.unqual;
    var big = T.big;

    // The limits of g++ are 512 nested calls and 2^25 operations; a script
    // gives up sooner and runs the call.
    var DEPTH_LIMIT = 512;
    var STEP_LIMIT = 500000;

    function NotConstant() {}
    var NOT_CONSTANT = new NotConstant();
    var BREAK = { kind: 'break' };
    var CONTINUE = { kind: 'continue' };

    // ir with its value when it is a constant expression.
    Parser.prototype.constantIr = function (ir) {
        if (ir.value === undefined && !this.pattern) {
            var value = this.evaluateConstant(ir);
            if (value !== undefined)
                ir.value = value;
        }
        return ir;
    };

    // The value of a scalar expression, or undefined.
    Parser.prototype.evaluateConstant = function (ir) {
        if (ir.value !== undefined)
            return ir.value;
        if (!X.isScalar(unqual(ir.type)) || unqual(ir.type).kind === 'pointer')
            return undefined;
        var evaluator = new Evaluator(this);
        try {
            return evaluator.value(ir, null);
        } catch (error) {
            if (error === NOT_CONSTANT)
                return undefined;
            throw error;
        }
    };

    function Evaluator(parser) {
        this.parser = parser;
        this.steps = 0;
        this.depth = 0;
    }

    function fail() {
        throw NOT_CONSTANT;
    }

    function isZero(value) {
        return X.isZeroValue(value);
    }

    // A local of a frame: locals is a Map of objects to values.
    function slot(frame, ir) {
        if (ir.k !== 'var' || frame === null || !frame.locals.has(ir.obj))
            fail();
        return ir.obj;
    }

    Evaluator.prototype.step = function () {
        if (++this.steps > STEP_LIMIT)
            fail();
    };

    Evaluator.prototype.value = function (ir, frame) {
        this.step();
        if (ir.value !== undefined)
            return ir.value;
        switch (ir.k) {
        case 'var':
            if (frame !== null && frame.locals.has(ir.obj)) {
                var stored = frame.locals.get(ir.obj);
                if (stored === undefined)
                    fail();
                return stored;
            }
            if (ir.obj.constValue !== undefined && X.isConst(ir.obj.type))
                return ir.obj.constValue;
            return fail();
        case 'conv': {
            if (ir.to.kind === 'void' || !X.isScalar(ir.to) || !X.isScalar(unqual(ir.from)))
                fail();
            var operand = this.value(ir.operand, frame);
            if (ir.from === ir.to)
                return operand;
            var converted = this.parser.foldConversion(operand, unqual(ir.from), ir.to);
            return converted === undefined ? fail() : converted;
        }
        case 'unary':
            return this.unary(ir, this.value(ir.operand, frame));
        case 'not':
            return isZero(this.value(ir.operand, frame)) ? 1 : 0;
        case 'binary':
            return this.binary(ir.op, this.value(ir.left, frame), this.value(ir.right, frame), ir.opType);
        case 'compare':
            if (ir.opType.kind === 'pointer')
                fail();
            return X.compareConstants(ir.op, this.value(ir.left, frame), this.value(ir.right, frame), ir.opType) ? 1
                                                                                                                  : 0;
        case 'logical': {
            var left = !isZero(this.value(ir.left, frame));
            if (ir.op === '&&' ? !left : left)
                return left ? 1 : 0;
            return isZero(this.value(ir.right, frame)) ? 0 : 1;
        }
        case 'cond':
            return this.value(isZero(this.value(ir.cond, frame)) ? ir.otherwise : ir.then, frame);
        case 'comma': {
            var last;
            for (var index = 0; index < ir.list.length; ++index)
                last = this.value(ir.list[index], frame);
            return last;
        }
        case 'assign': {
            var target = slot(frame, ir.target);
            var assigned = X.wrapValue(this.value(ir.source, frame), target.type);
            frame.locals.set(target, assigned);
            return assigned;
        }
        case 'compound':
            return this.compound(ir, frame);
        case 'incdec':
            return this.incdec(ir, frame);
        case 'call':
            return this.call(ir, frame);
        }
        return fail();
    };

    Evaluator.prototype.unary = function (ir, operand) {
        if (ir.op === '+')
            return operand;
        if (ir.op === '-')
            return ir.type.kind === 'float' ? -X.wrapValue(operand, ir.type) : X.wrapValue(big.neg(operand), ir.type);
        return X.wrapValue(big.not(operand), ir.type);
    };

    Evaluator.prototype.binary = function (op, left, right, type) {
        if (op === '<<' || op === '>>') {
            var amount = big.toFloat(right);
            if (amount < 0 || amount >= type.size * 8)
                fail();
            return X.wrapValue(op === '<<' ? big.shl(left, amount) : big.shr(left, amount), type);
        }
        if ((op === '/' || op === '%') && type.kind !== 'float' && isZero(right))
            fail();
        var result = X.foldArithmetic(op, left, right, type);
        return result === undefined ? fail() : result;
    };

    Evaluator.prototype.compound = function (ir, frame) {
        if (ir.pointer)
            fail();
        var target = slot(frame, ir.target);
        var targetType = unqual(target.type);
        var source = this.value(ir.source, frame);
        var current = frame.locals.get(target);
        if (current === undefined)
            fail();
        var widened = this.parser.foldConversion(current, targetType, ir.opType);
        var result = this.binary(ir.op, widened, source, ir.opType);
        var stored = this.parser.foldConversion(result, ir.opType, targetType);
        if (stored === undefined)
            fail();
        frame.locals.set(target, stored);
        return stored;
    };

    Evaluator.prototype.incdec = function (ir, frame) {
        var target = slot(frame, ir.target);
        var type = unqual(target.type);
        var old = frame.locals.get(target);
        if (old === undefined || !(X.isIntegral(type) || type.kind === 'float') || type === types.bool)
            fail();
        var updated = X.foldArithmetic(ir.op === '++' ? '+' : '-', old, 1, type);
        frame.locals.set(target, updated);
        return ir.prefix ? updated : old;
    };

    Evaluator.prototype.call = function (ir, frame) {
        var func = ir.func;
        if (!func.constexpr || ir.object !== null && ir.object !== undefined || func.isMember && !func.isStatic ||
            func.type.variadic || this.depth >= DEPTH_LIMIT)
            fail();
        var returns = unqual(func.type.returns);
        if (!X.isScalar(returns) || returns.kind === 'pointer' || ir.args.length !== func.type.params.length)
            fail();
        if (!func.compiled && !func.compiling)
            this.parser.session.compileBody(func);
        if (!func.compiled || func.body === null || func.body === undefined)
            fail();
        var locals = new Map();
        var params = func.context.params;
        for (var index = 0; index < ir.args.length; ++index) {
            var type = unqual(func.type.params[index]);
            if (!X.isScalar(type) || type.kind === 'pointer' || X.isRef(func.type.params[index]))
                fail();
            var argument = X.wrapValue(this.value(ir.args[index], frame), type);
            if (params[index] !== null)
                locals.set(params[index], argument);
        }
        ++this.depth;
        try {
            var completion = this.statement(func.body, { locals: locals });
            if (completion === null || completion.kind !== 'return' || completion.value === undefined)
                fail();
            return X.wrapValue(completion.value, returns);
        } finally {
            --this.depth;
        }
    };

    // Runs a statement: null, BREAK, CONTINUE or { kind: 'return', value }.
    Evaluator.prototype.statement = function (node, frame) {
        this.step();
        switch (node.k) {
        case 'block':
        case 'group':
            return this.statements(node.items, 0, frame);
        case 'empty':
            return null;
        case 'expr':
            this.value(node.expr, frame);
            return null;
        case 'decl':
            return this.declaration(node, frame);
        case 'if':
            if (!isZero(this.value(node.cond, frame)))
                return this.statement(node.then, frame);
            return node.otherwise === null ? null : this.statement(node.otherwise, frame);
        case 'while':
            for (;;) {
                this.declarations(node.decl, frame);
                if (isZero(this.value(node.cond, frame)))
                    return null;
                var inWhile = this.statement(node.body, frame);
                if (inWhile === BREAK)
                    return null;
                if (inWhile !== null && inWhile !== CONTINUE)
                    return inWhile;
            }
        case 'do':
            for (;;) {
                var inDo = this.statement(node.body, frame);
                if (inDo === BREAK)
                    return null;
                if (inDo !== null && inDo !== CONTINUE)
                    return inDo;
                if (isZero(this.value(node.cond, frame)))
                    return null;
            }
        case 'for':
            return this.forStatement(node, frame);
        case 'switch':
            return this.switchStatement(node, frame);
        case 'break':
            return BREAK;
        case 'continue':
            return CONTINUE;
        case 'return':
            return { kind: 'return', value: node.value === null ? undefined : this.value(node.value, frame) };
        }
        return fail();
    };

    Evaluator.prototype.statements = function (items, start, frame) {
        for (var index = start; index < items.length; ++index) {
            var item = items[index];
            if (item.k === 'case' || item.k === 'default')
                continue;
            var completion = this.statement(item, frame);
            if (completion !== null)
                return completion;
        }
        return null;
    };

    Evaluator.prototype.declaration = function (node, frame) {
        var type = unqual(node.obj.type);
        if (!X.isScalar(type) || type.kind === 'pointer' || X.isRef(node.obj.type) || node.obj.storage !== 'local' ||
            node.dtor !== null && node.dtor !== undefined)
            fail();
        frame.locals.set(node.obj, node.init === null ? undefined : X.wrapValue(this.value(node.init, frame), type));
        return null;
    };

    Evaluator.prototype.declarations = function (list, frame) {
        for (var index = 0; index < (list || []).length; ++index)
            this.statement(list[index], frame);
    };

    Evaluator.prototype.forStatement = function (node, frame) {
        this.declarations(node.init, frame);
        for (;;) {
            if (node.cond !== null && isZero(this.value(node.cond, frame)))
                return null;
            var completion = this.statement(node.body, frame);
            if (completion === BREAK)
                return null;
            if (completion !== null && completion !== CONTINUE)
                return completion;
            if (node.step !== null)
                this.value(node.step, frame);
        }
    };

    Evaluator.prototype.switchStatement = function (node, frame) {
        var value = this.value(node.expr, frame);
        var items = node.body.k === 'block' ? node.body.items : fail();
        var start = -1;
        for (var index = 0; index < items.length; ++index) {
            var item = items[index];
            if (item.k === 'case' && big.cmp(value, item.low) >= 0 && big.cmp(value, item.high) <= 0) {
                start = index;
                break;
            }
            if (item.k === 'default' && start < 0)
                start = index;
        }
        if (start < 0)
            return null;
        var completion = this.statements(items, start, frame);
        return completion === BREAK ? null : completion;
    };
})(globalThis);
