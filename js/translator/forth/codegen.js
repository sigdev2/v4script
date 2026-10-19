// Forth: translation of a definition (a list of operations) into a
// JavaScript function function (sp) -> sp. Inside a straight-line part
// the stack is expressions and temporaries (a "virtual stack"); they go
// into the stack array at the boundaries of parts and before calls.
// Labels and jumps of IF/BEGIN/DO become nested blocks and loops with
// break/continue, and when the jumps do not nest (CS-ROLL, AHEAD into a
// loop) - a switch state machine. Design: docs/internals/forth.md.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Forth = T.forth;
    if (Forth.codegen)
        return;

    var J = T.J;
    var ops = T.ops;
    var i64 = T.i64;
    var MAX = 9007199254740991;

    // The lowest cells of the stack array are a reserve: going below the
    // bottom by a few cells reads zeros, and the check of the interpreter
    // reports Stack underflow.
    var STACK_GUARD = 16;
    var STACK_CELLS = 65536;
    Forth.STACK_GUARD = STACK_GUARD;
    Forth.STACK_EMPTY = STACK_GUARD - 1;
    Forth.STACK_LIMIT = STACK_GUARD + STACK_CELLS - 1;

    var CHUNK_PARAMS = ['$F', '$T', '$D'];

    function literalNode(value) {
        return typeof value === 'number' ? J.num(value) : null;
    }

    // --- The virtual stack: the elements over the top of the real stack
    // that are not written yet (items), and how many cells of the real stack
    // have been taken
    // (taken).

    function VirtualStack(array, pointer, local) {
        this.array = array;       // the array name: S, FS, R
        this.pointer = pointer;   // the pointer expression: sp, $F.fp, $F.rp
        this.local = local;       // the pointer is a local variable (sp)
        this.items = [];
        this.taken = 0;
    }

    VirtualStack.prototype.slot = function (offset) {
        var index = offset === 0 ? this.pointer()
                                 : J.bin(offset > 0 ? '+' : '-', this.pointer(), J.num(Math.abs(offset)));
        return J.idx(J.id(this.array), index);
    };

    // --- Translating the operations into a flat list: statements, labels, jumps.

    function Lowering(system, definition) {
        this.system = system;
        this.definition = definition;
        this.items = [];
        this.constants = [];
        this.constantIndex = new Map();
        this.bound = [];
        this.temps = 0;
        this.maxTemps = 0;
        this.line = 0;
        this.source = definition.source;
        this.async = definition.async;
        var sp = function () { return J.id('sp'); };
        this.data = new VirtualStack('S', sp, true);
        this.floats = new VirtualStack('FS', function () { return J.path('$F.fp'); }, false);
        this.returns = new VirtualStack('R', function () { return J.path('$F.rp'); }, false);
    }

    Lowering.prototype.at = function (node) {
        return J.at(node, this.line, this.source);
    };

    Lowering.prototype.emit = function (node) {
        this.items.push({ k: 's', node: this.at(node) });
    };

    Lowering.prototype.emitExpr = function (expression) {
        this.emit(J.expr(expression));
    };

    Lowering.prototype.temp = function () {
        var name = '$t' + (this.temps++);
        if (this.temps > this.maxTemps)
            this.maxTemps = this.temps;
        return name;
    };

    // A value the translator built (an object, a function) is a chunk
    // variable in the code.
    Lowering.prototype.constant = function (value) {
        var index = this.constantIndex.get(value);
        if (index === undefined) {
            index = this.constants.length;
            this.constants.push(value);
            this.constantIndex.set(value, index);
        }
        return J.id('$c' + index);
    };

    Lowering.prototype.helper = function (name) {
        return J.mem(J.id('$F'), name);
    };

    Lowering.prototype.memory = function (name, args) {
        return J.call(J.mem(J.id('$m'), name), args);
    };

    // A computed value goes to a temporary (the order of evaluation is that
    // of the source).
    Lowering.prototype.value = function (expression) {
        if (expression.k === 'id' || expression.k === 'num')
            return { e: expression };
        var name = this.temp();
        this.emitExpr(J.assign(J.id(name), expression));
        return { e: J.id(name) };
    };

    Lowering.prototype.flag = function (test) {
        if (test.k === 'bool')
            return { e: J.num(test.value ? -1 : 0), lit: test.value ? -1 : 0 };
        var name = this.temp();
        this.emitExpr(J.assign(J.id(name), test));
        return { e: J.id(name), bool: true };
    };

    Lowering.prototype.literal = function (value) {
        var node = literalNode(value);
        if (node === null)
            node = this.constant(value);
        return { e: node, lit: value };
    };

    // A cell from an element: a flag (true/false) becomes -1/0.
    Lowering.prototype.cell = function (item) {
        return item.bool ? J.cond(item.e, J.num(-1), J.num(0)) : item.e;
    };

    var negate = T.negate;
    Forth.negate = negate;

    // The condition "not zero".
    Lowering.prototype.test = function (item) {
        if (item.bool)
            return item.e;
        if (item.lit !== undefined)
            return J.bool(item.lit !== 0);
        return J.bin('!==', item.e, J.num(0));
    };

    Lowering.prototype.opsContext = function () {
        var self = this;
        return {
            temp: function () { return self.temp(); },
            helper: function (name) { return J.mem(J.id('$T'), name); },
            divideByZero: J.call(self.helper('divisionByZero'), [])
        };
    };

    // Cell arithmetic: 64 bits wrapping on overflow.
    Lowering.prototype.i64 = function (operator, left, right) {
        return ops.binary('i64', operator, left, right, this.opsContext());
    };

    Lowering.prototype.i64Unary = function (operator, operand) {
        return ops.unary('i64', operator, operand, this.opsContext());
    };

    Lowering.prototype.pop = function (stack) {
        if (stack.items.length > 0)
            return stack.items.pop();
        var name = this.temp();
        stack.taken += 1;
        this.emitExpr(J.assign(J.id(name), stack.slot(1 - stack.taken)));
        return { e: J.id(name), origin: 1 - stack.taken };
    };

    // Takes a cell of the real stack without reading it.
    Lowering.prototype.skip = function (stack) {
        stack.taken += 1;
        return null;
    };

    Lowering.prototype.push = function (stack, item) {
        stack.items.push(item);
    };

    Lowering.prototype.popData = function () {
        return this.pop(this.data);
    };

    Lowering.prototype.pushData = function (item) {
        this.data.items.push(item);
    };

    Lowering.prototype.popFloat = function () {
        return this.pop(this.floats);
    };

    Lowering.prototype.pushFloat = function (item) {
        this.floats.items.push(item);
    };

    // The n-th element from the top (0 - the top) without taking it.
    Lowering.prototype.peek = function (stack, depth) {
        while (stack.items.length <= depth) {
            // The missing ones from below go to the start of the virtual stack.
            var name = this.temp();
            stack.taken += 1;
            this.emitExpr(J.assign(J.id(name), stack.slot(1 - stack.taken)));
            stack.items.unshift({ e: J.id(name), origin: 1 - stack.taken });
        }
        return stack.items[stack.items.length - 1 - depth];
    };

    Lowering.prototype.flushStack = function (stack, keep) {
        var count = stack.items.length;
        for (var index = 0; index < count; ++index) {
            var item = stack.items[index];
            var offset = index + 1 - stack.taken;
            // The cell is in its old place - nothing to write.
            if (item.origin === offset)
                continue;
            this.emitExpr(J.assign(stack.slot(offset), stack === this.floats ? item.e : this.cell(item)));
        }
        var delta = count - stack.taken;
        if (delta !== 0) {
            var target = stack.pointer();
            this.emitExpr(J.assign(target, J.num(Math.abs(delta)), delta > 0 ? '+=' : '-='));
        }
        stack.items = [];
        stack.taken = 0;
    };

    // Before a call: the data and float stacks go into the arrays. The
    // return stack stays virtual: the called word does not see it.
    Lowering.prototype.flushCall = function () {
        this.flushStack(this.data);
        this.flushStack(this.floats);
    };

    // At the boundary of a part - all three.
    Lowering.prototype.flushAll = function () {
        this.flushStack(this.data);
        this.flushStack(this.floats);
        this.flushStack(this.returns);
    };

    Lowering.prototype.endBlock = function () {
        this.flushAll();
        this.temps = 0;
    };

    // The value of a local changes: the stack elements that refer to it get
    // copies.
    Lowering.prototype.detach = function (name) {
        var self = this;
        [this.data, this.floats, this.returns].forEach(function (stack) {
            stack.items = stack.items.map(function (item) {
                if (item.e.k === 'id' && item.e.name === name) {
                    var temp = self.temp();
                    self.emitExpr(J.assign(J.id(temp), item.e));
                    return { e: J.id(temp), bool: item.bool };
                }
                return item;
            });
        });
    };

    Lowering.prototype.label = function (id, loopHead) {
        this.endBlock();
        this.items.push({ k: 'label', id: id });
        if (loopHead)
            this.emitStackCheck();
    };

    Lowering.prototype.emitStackCheck = function () {
        this.emit(J.if_(J.or(J.bin('>', J.id('sp'), J.num(Forth.STACK_LIMIT)), J.bin('<', J.id('sp'), J.num(Forth.STACK_EMPTY))),
                        J.expr(J.call(this.helper('stackError'), [J.id('sp')]))));
    };

    Lowering.prototype.jump = function (id, test) {
        this.endBlock();
        this.items.push({ k: 'goto', id: id, test: test || null, line: this.line, source: this.source });
    };

    // Calls the function of a word (sp) -> sp: a generator with yield*.
    Lowering.prototype.callFunction = function (callee, async) {
        this.flushCall();
        var call = J.call(callee, [J.id('sp')]);
        if (async) {
            if (!this.async)
                throw new Error('async call in a sync definition');
            call = J.yield_(call, true);
        }
        this.emitExpr(J.assign(J.id('sp'), call));
    };

    // A word call: the words of the system (kind prim) translate
    // themselves, the others by their kind.
    Lowering.prototype.callWord = function (word) {
        var system = this.system;
        while (word.kind === 'alias')
            word = word.target;
        switch (word.kind) {
        case 'prim':
            word.prim.lower(this, word);
            return;
        case 'colon':
            if (word === this.definition.word && word.fn === null) {
                this.callFunction(J.id('$self'), this.async);
                return;
            }
            this.callFunction(this.constant(word.async ? word.gen : word.fn), word.async);
            return;
        case 'create':
            this.pushData(this.literal(word.body));
            if (word.does !== null)
                this.callFunction(this.constant(word.does.async ? word.does.gen : word.does.fn), word.does.async);
            return;
        case 'constant':
            this.pushData(this.literal(word.value));
            return;
        case '2constant':
            this.pushData(this.literal(word.value[0]));
            this.pushData(this.literal(word.value[1]));
            return;
        case 'fconstant':
            this.pushFloat({ e: J.num(word.value) });
            return;
        case 'value':
            this.pushData(this.value(this.memory('cell', [J.num(word.body)])));
            return;
        case '2value':
            this.pushData(this.value(this.memory('cell', [J.num(word.body + 8)])));
            this.pushData(this.value(this.memory('cell', [J.num(word.body)])));
            return;
        case 'fvalue':
            this.pushFloat(this.value(this.memory('float', [J.num(word.body)])));
            return;
        case 'defer':
            this.pushData(this.value(this.memory('cell', [J.num(word.body)])));
            this.executeTop();
            return;
        case 'field': {
            var base = this.popData();
            this.pushData(word.value === 0 ? base : this.value(this.i64('+', this.cell(base), J.num(word.value))));
            return;
        }
        case 'native':
            if (word.async && this.async) {
                this.callFunction(this.constant(word.gen), true);
                return;
            }
            this.callFunction(this.constant(word.fn), false);
            return;
        }
        throw new Error('Cannot compile word ' + word.name + ' (' + word.kind + ')');
    };

    // EXECUTE: with a wait in a generator, at once in a plain function.
    Lowering.prototype.executeTop = function () {
        var xt = this.popData();
        this.flushCall();
        var call = J.call(this.helper(this.async ? 'executeGen' : 'execute'), [this.cell(xt), J.id('sp')]);
        this.emitExpr(J.assign(J.id('sp'), this.async ? J.yield_(call, true) : call));
    };

    // A word that works with the real stack itself: helper(sp) -> sp.
    Lowering.prototype.stackHelper = function (name, args) {
        this.flushCall();
        this.emitExpr(J.assign(J.id('sp'), J.call(this.helper(name), [J.id('sp')].concat(args || []))));
    };

    Lowering.prototype.loopVariables = function (loop) {
        return { index: J.id('$i' + loop.id), limit: J.id('$l' + loop.id) };
    };

    Lowering.prototype.lowerOp = function (op) {
        this.line = op.line;
        this.source = op.source !== undefined ? op.source : this.definition.source;
        switch (op.k) {
        case 'lit':
            this.pushData(this.literal(op.value));
            return;
        case 'flit':
            this.pushFloat({ e: J.num(op.value) });
            return;
        case 'call':
            this.callWord(op.word);
            return;
        case 'label':
            this.label(op.id, op.loopHead);
            return;
        case 'goto':
            if (op.cond === 'zero') {
                var flag = this.popData();
                this.jump(op.id, negate(this.test(flag)));
            } else {
                this.jump(op.id, null);
            }
            return;
        case 'do': {
            var vars = this.loopVariables(op.loop);
            var start = this.popData();
            var limit = this.popData();
            this.emitExpr(J.assign(vars.index, this.cell(start)));
            this.emitExpr(J.assign(vars.limit, this.cell(limit)));
            if (op.check) {
                var same = ops.equals('i64', false, vars.index, vars.limit, this.opsContext());
                this.jump(op.loop.exit, same);
            }
            this.label(op.loop.top, true);
            return;
        }
        case 'loop': {
            var loopVars = this.loopVariables(op.loop);
            var index = loopVars.index;
            if (op.plus) {
                var step = this.popData();
                this.flushAll();
                var ended = this.temp();
                this.emitExpr(J.assign(J.id(ended), J.call(this.helper('plusLoop'), [index, loopVars.limit, this.cell(step)])));
                this.emitExpr(J.assign(index, this.helper('index')));
                this.jump(op.loop.top, negate(J.id(ended)));
                return;
            }
            this.endBlock();
            this.emitExpr(J.assign(index, J.cond(J.and(J.bin('===', J.un('typeof', index), J.str('number')),
                                                        J.bin('<', index, J.num(MAX))),
                                                  J.bin('+', index, J.num(1)),
                                                  J.call(J.path('$T.i64.add'), [index, J.num(1)]))));
            this.jump(op.loop.top, ops.equals('i64', true, index, loopVars.limit, this.opsContext()));
            return;
        }
        case 'leave':
            this.jump(op.loop.exit, null);
            return;
        case 'index':
            this.pushData({ e: this.loopVariables(op.loop).index });
            return;
        case 'exit':
            this.flushCall();
            this.emit(J.ret(J.id('sp')));
            return;
        case 'local':
            if (op.local.float)
                this.pushFloat({ e: J.id(op.local.js) });
            else
                this.pushData({ e: J.id(op.local.js) });
            return;
        case 'to-local': {
            var local = op.local;
            var item = local.float ? this.popFloat() : this.popData();
            this.detach(local.js);
            var value = local.float ? item.e : this.cell(item);
            if (op.plus)
                value = local.float ? J.bin('+', J.id(local.js), value) : this.i64('+', J.id(local.js), value);
            this.emitExpr(J.assign(J.id(local.js), value));
            return;
        }
        case 'locals': {
            var list = op.list;
            var values = [];
            for (var at = list.length - 1; at >= 0; --at)
                values[at] = list[at].float ? this.popFloat().e : this.cell(this.popData());
            for (var position = 0; position < list.length; ++position) {
                this.detach(list[position].js);
                this.emitExpr(J.assign(J.id(list[position].js), values[position]));
            }
            return;
        }
        case 'does':
            this.flushCall();
            this.emitExpr(J.call(this.helper('setDoes'), [this.constant(op.ref)]));
            this.emit(J.ret(J.id('sp')));
            return;
        case 'code':
            op.gen(this, op);
            return;
        }
        throw new Error('Unknown Forth op ' + op.k);
    };

    // --- A whole definition

    // A definition is asynchronous (a generator) if it calls a word that
    // waits (MS) or executes a word by xt while such words exist.
    function isAsync(system, definition) {
        return definition.ops.some(function (op) {
            if (op.k === 'code')
                return !!op.async || (!!op.dynamic && system.anyAsync);
            if (op.k !== 'call')
                return false;
            var word = op.word;
            while (word.kind === 'alias')
                word = word.target;
            if (word.kind === 'prim')
                return !!word.prim.dynamic && system.anyAsync;
            if (word.kind === 'defer')
                return system.anyAsync;
            if (word.kind === 'native')
                return !!word.async;
            if (word.kind === 'create')
                return word.does !== null && word.does.async;
            return !!word.async;
        });
    }

    // The function of a definition: { fn, gen, async }. A generator is
    // called with yield*, and plain code calls fn, which runs it at once.
    Forth.compileDefinition = function (system, definition) {
        definition.async = isAsync(system, definition);
        var lowering = new Lowering(system, definition);
        lowering.line = definition.line;
        if (!definition.primitive)
            lowering.emitStackCheck();
        definition.ops.forEach(function (op) {
            lowering.lowerOp(op);
        });
        lowering.line = definition.endLine || definition.line;
        lowering.flushCall();
        lowering.emit(J.ret(J.id('sp')));
        var body = T.structure(lowering.items, [J.ret(J.id('sp'))]);
        var declarations = [];
        for (var temp = 0; temp < lowering.maxTemps; ++temp)
            declarations.push({ name: '$t' + temp, init: null });
        for (var loop = 1; loop <= definition.loopCount; ++loop) {
            declarations.push({ name: '$i' + loop, init: null });
            declarations.push({ name: '$l' + loop, init: null });
        }
        definition.locals.forEach(function (local) {
            declarations.push({ name: local.js, init: J.num(0) });
        });
        if (declarations.length > 0)
            body.unshift(J.vars(declarations));
        var prologue = [{ name: '$m', init: J.path('$F.m') }, { name: 'S', init: J.path('$F.S') },
                        { name: 'FS', init: J.path('$F.FS') }, { name: 'R', init: J.path('$F.R') }];
        lowering.constants.forEach(function (value, index) {
            prologue.push({ name: '$c' + index, init: J.idx(J.id('$D'), J.num(index)) });
        });
        var statements = [J.vars(prologue), J.ret(J.fn('$self', ['sp'], body, definition.async))];
        var made = system.env.compileChunk(statements, CHUNK_PARAMS, [system, T, lowering.constants],
                                           definition.source, { library: !!definition.primitive });
        if (!definition.async)
            return { fn: made, gen: null, async: false };
        return {
            fn: function (sp) { return system.env.scheduler.runNested(made(sp)); },
            gen: made,
            async: true
        };
    };

    Forth.codegen = true;
})(globalThis);
