// WAT: translation of a checked module into JavaScript. The chunk of a
// module is function ($W, $T, $D), the functions of the module are
// JavaScript functions, the operand stack is virtual (see
// docs/internals/wat.md).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var W = T.wat;
    if (W.compileModule)
        return;

    var J = T.J;
    var OPS = W.OPS;

    function num(value) {
        return J.num(value);
    }

    // --- Module

    function ModuleCompiler(module, source) {
        this.module = module;
        this.source = source || '';
        this.consts = [];
        this.globalCells = [];   // a global in a cell $D.g[i] (imported, exported)
        var exported = {};
        module.exports.forEach(function (entry) {
            if (entry.kind === 'global')
                exported[entry.index] = true;
        });
        var self = this;
        module.globals.forEach(function (item, index) {
            self.globalCells[index] = item.import !== null || exported[index] === true;
        });
    }

    // A constant that cannot be written as a literal (Int64) comes from $D.k.
    ModuleCompiler.prototype.constant = function (value) {
        this.consts.push(value);
        return J.idx(J.id('$K'), num(this.consts.length - 1));
    };

    ModuleCompiler.prototype.globalRef = function (index) {
        return this.globalCells[index] ? J.mem(J.id('G' + index), 'value') : J.id('g' + index);
    };

    ModuleCompiler.prototype.funcRef = function (index) {
        return J.id('f' + index);
    };

    // A number constant of the type type as an expression.
    ModuleCompiler.prototype.literal = function (node) {
        var type = node.op.substring(0, 3);
        if (type === 'i64' && typeof node.value !== 'number')
            return this.constant(node.value);
        if ((type === 'f32' || type === 'f64') && node.nan !== undefined && node.nan !== 'canonical') {
            var maker = type === 'f32' ? 'nanF32' : 'nanF64';
            return J.call(J.path('$W.' + maker), [num(node.nan), J.bool(!!node.negative)]);
        }
        if ((type === 'f32' || type === 'f64') && node.nan === 'canonical' && node.negative)
            return J.un('-', J.id('NaN'));
        return num(node.value);
    };

    // A constant expression (globals, offsets, elements).
    ModuleCompiler.prototype.constExpr = function (expr) {
        var node = expr[expr.length - 1];
        switch (node.op) {
        case 'i32.const':
        case 'i64.const':
        case 'f32.const':
        case 'f64.const':
            return this.literal(node);
        case 'ref.null':
            return J.nul();
        case 'ref.func':
            return this.funcRef(node.func);
        case 'global.get':
            return this.globalRef(node.index);
        }
        throw W.error('invalid', 'constant expression required', node.line, node.col, this.source);
    };

    ModuleCompiler.prototype.compile = function () {
        var module = this.module;
        var self = this;
        var body = [J.expr(J.str('use strict'))];
        var decls = [{ name: '$K', init: J.mem(J.id('$D'), 'k') }, { name: '$w', init: J.mem(J.id('$W'), 'i64') },
                     { name: '$i64', init: J.mem(J.id('$T'), 'i64') }];
        module.mems.forEach(function (memory, index) {
            decls.push({ name: 'm' + index, init: J.idx(J.mem(J.id('$D'), 'm'), num(index)) });
        });
        module.tables.forEach(function (table, index) {
            decls.push({ name: 't' + index, init: J.idx(J.mem(J.id('$D'), 't'), num(index)) });
        });
        module.globals.forEach(function (item, index) {
            if (self.globalCells[index])
                decls.push({ name: 'G' + index, init: J.idx(J.mem(J.id('$D'), 'g'), num(index)) });
            else
                decls.push({ name: 'g' + index, init: W.isRef(item.type.type) ? J.nul() : num(0) });
        });
        module.funcs.forEach(function (func, index) {
            if (func.import !== null)
                decls.push({ name: 'f' + index, init: J.idx(J.mem(J.id('$D'), 'f'), num(index)) });
        });
        body.push(J.vars(decls));
        var functionNodes = [];
        module.funcs.forEach(function (func, index) {
            if (func.import === null) {
                var compiled = new FunctionCompiler(self, func, index).compile();
                body.push(compiled);
                functionNodes.push(index);
            }
        });
        // init(): the globals and the values of elem segments in order.
        var init = [];
        module.globals.forEach(function (item, index) {
            if (item.import === null)
                init.push(J.at(J.expr(J.assign(self.globalRef(index), self.constExpr(item.init))), item.line));
        });
        module.elems.forEach(function (segment, index) {
            init.push(J.at(J.expr(J.assign(J.idx(J.mem(J.id('$D'), 'e'), num(index)),
                                           J.arr(segment.init.map(function (expr) {
                                               return self.constExpr(expr);
                                           })))), segment.line));
        });
        // The offsets of active segments - after the globals.
        var offsets = [];
        module.elems.forEach(function (segment) {
            offsets.push(segment.mode === 'active' ? self.constExpr(segment.offset) : num(0));
        });
        var dataOffsets = [];
        module.datas.forEach(function (segment) {
            dataOffsets.push(segment.mode === 'active' ? self.constExpr(segment.offset) : num(0));
        });
        var funcs = module.funcs.map(function (func, index) {
            return J.id('f' + index);
        });
        body.push(J.ret(J.obj([
            ['funcs', J.arr(funcs)],
            ['init', J.fn(null, [], init)],
            ['offsets', J.fn(null, [], [J.ret(J.obj([['elems', J.arr(offsets)], ['datas', J.arr(dataOffsets)]]))])],
            ['getGlobal', this.globalAccessor(false)],
            ['setGlobal', this.globalAccessor(true)]
        ])));
        return body;
    };

    // Access to internal globals by number (for debugging and get).
    ModuleCompiler.prototype.globalAccessor = function (set) {
        var self = this;
        var cases = [];
        this.module.globals.forEach(function (item, index) {
            var target = self.globalRef(index);
            cases.push({ test: num(index), body: set ? [J.expr(J.assign(target, J.id('v'))), J.ret()] : [J.ret(target)] });
        });
        return J.fn(null, set ? ['i', 'v'] : ['i'], [J.switch_(J.id('i'), cases)]);
    };

    // --- Function

    var MEMORY_VIEWS = {
        'i32.load': ['I32', 2, 'i32'], 'f32.load': ['F32', 2, 'f32'], 'f64.load': ['F64', 3, 'f64'],
        'i32.load8_s': ['I8', 0, 'i8'], 'i32.load8_u': ['U8', 0, 'u8'], 'i32.load16_s': ['I16', 1, 'i16'],
        'i32.load16_u': ['U16', 1, 'u16'], 'i64.load8_s': ['I8', 0, 'i8'], 'i64.load8_u': ['U8', 0, 'u8'],
        'i64.load16_s': ['I16', 1, 'i16'], 'i64.load16_u': ['U16', 1, 'u16'], 'i64.load32_s': ['I32', 2, 'i32'],
        'i64.load32_u': ['U32', 2, 'i64_32u'],
        'i32.store': ['I32', 2, 'i32'], 'f32.store': ['F32', 2, 'f32'], 'f64.store': ['F64', 3, 'f64'],
        'i32.store8': ['U8', 0, 'i8'], 'i32.store16': ['U16', 1, 'i16'], 'i64.store8': ['U8', 0, 'i8'],
        'i64.store16': ['U16', 1, 'i16'], 'i64.store32': ['I32', 2, 'i32']
    };
    var LIMITS = ['lim1', 'lim2', 'lim4', 'lim8'];

    function FunctionCompiler(gen, func, index) {
        this.gen = gen;
        this.module = gen.module;
        this.func = func;
        this.index = index;
        this.type = this.module.types[func.typeIndex];
        this.localTypes = this.type.params.concat(func.locals);
        this.stack = [];
        this.frames = [];
        this.out = [];
        this.maxSlot = -1;
        this.temps = new T.FunctionScope('$t');
        this.labels = 0;
        this.reachable = true;
        this.line = func.line;
        var self = this;
        this.ctx = {
            temp: function () { return self.temps.temp(); },
            helper: function (name) { return J.mem(J.id('$T'), name); },
            divideByZero: J.call(J.path('$W.divideByZero'), [])
        };
    }

    FunctionCompiler.prototype.slot = function (index) {
        if (index > this.maxSlot)
            this.maxSlot = index;
        return J.id('s' + index);
    };

    FunctionCompiler.prototype.local = function (index) {
        return J.id('l' + index);
    };

    FunctionCompiler.prototype.emit = function (statement, line) {
        this.out.push(J.at(statement, line || this.line));
    };

    // --- The virtual stack
    //
    // An element: { type, expr, pure (no traps, no reads of memory,
    // globals, tables), locals (the numbers of the locals read), slots (the
    // s<i> read), bool (expr is a boolean i32 comparison), line }.

    function union(left, right) {
        if (left.length === 0)
            return right;
        if (right.length === 0)
            return left;
        var result = left.slice();
        for (var index = 0; index < right.length; ++index) {
            if (result.indexOf(right[index]) < 0)
                result.push(right[index]);
        }
        return result;
    }

    FunctionCompiler.prototype.entry = function (type, expr, pure, operands, bool) {
        var locals = [], slots = [];
        var allPure = pure;
        (operands || []).forEach(function (operand) {
            locals = union(locals, operand.locals);
            slots = union(slots, operand.slots);
            if (!operand.pure)
                allPure = false;
        });
        return { type: type, expr: expr, pure: allPure, locals: locals, slots: slots, bool: !!bool, line: this.line };
    };

    FunctionCompiler.prototype.push = function (entry) {
        this.stack.push(entry);
    };

    FunctionCompiler.prototype.pop = function () {
        this.settleLines(1);
        return this.stack.pop();
    };

    // An operand that may trap from another line is computed separately,
    // with its own line: the place of an error is the instruction where it
    // happened.
    FunctionCompiler.prototype.settleLines = function (count) {
        for (var index = Math.max(0, this.stack.length - count); index < this.stack.length; ++index) {
            var entry = this.stack[index];
            if (!entry.pure && entry.line !== this.line) {
                this.flushImpure();
                return;
            }
        }
    };

    // The value of an element as an i32 (a boolean becomes 0/1).
    FunctionCompiler.prototype.value = function (entry) {
        return entry.bool ? J.bin('|', entry.expr, num(0)) : entry.expr;
    };

    // The value of an element as a condition.
    FunctionCompiler.prototype.condition = function (entry) {
        return entry.bool ? entry.expr : J.bin('!==', entry.expr, num(0));
    };

    FunctionCompiler.prototype.isInSlot = function (entry, position) {
        return entry.expr.k === 'id' && entry.expr.name === 's' + position && !entry.bool;
    };

    // Before writing to s<position>: the elements below that read it go to
    // their own cells.
    FunctionCompiler.prototype.prepareSlot = function (position) {
        for (var index = 0; index < this.stack.length && index < position; ++index) {
            if (this.stack[index].slots.indexOf(position) >= 0 && !this.isInSlot(this.stack[index], index))
                this.flushEntry(index);
        }
    };

    // A stack element goes into its cell s<index>.
    FunctionCompiler.prototype.flushEntry = function (index) {
        var entry = this.stack[index];
        if (this.isInSlot(entry, index))
            return;
        this.prepareSlot(index);
        this.emit(J.expr(J.assign(this.slot(index), this.value(entry))), entry.line);
        this.stack[index] = this.slotEntry(index, entry.type);
    };

    FunctionCompiler.prototype.slotEntry = function (index, type) {
        return { type: type, expr: this.slot(index), pure: true, locals: [], slots: [index], bool: false, line: this.line };
    };

    // Everything that may trap or reads something mutable is computed now
    // (before an instruction with an effect).
    FunctionCompiler.prototype.flushImpure = function () {
        for (var index = 0; index < this.stack.length; ++index) {
            if (!this.stack[index].pure)
                this.flushEntry(index);
        }
    };

    FunctionCompiler.prototype.flushAll = function () {
        for (var index = 0; index < this.stack.length; ++index)
            this.flushEntry(index);
    };

    // The result of an effect goes into the cell of the stack top.
    FunctionCompiler.prototype.pushStatement = function (type, expr) {
        var position = this.stack.length;
        this.prepareSlot(position);
        this.emit(J.expr(J.assign(this.slot(position), expr)));
        this.push(this.slotEntry(position, type));
    };

    FunctionCompiler.prototype.pushResults = function (types, expr) {
        if (types.length === 0) {
            this.emit(J.expr(expr));
            return;
        }
        if (types.length === 1) {
            this.pushStatement(types[0], expr);
            return;
        }
        var temp = this.temps.temp();
        this.emit(J.expr(J.assign(J.id(temp), expr)));
        for (var index = 0; index < types.length; ++index)
            this.pushStatement(types[index], J.idx(J.id(temp), num(index)));
    };

    FunctionCompiler.prototype.popN = function (count) {
        if (count === 0)
            return [];
        this.settleLines(count);
        return this.stack.splice(this.stack.length - count, count);
    };

    // --- A whole function

    FunctionCompiler.prototype.compile = function () {
        var func = this.func;
        var params = [];
        for (var paramIndex = 0; paramIndex < this.type.params.length; ++paramIndex)
            params.push('l' + paramIndex);
        var frame = { kind: 'func', label: null, base: 0, params: [], results: this.type.results, branched: false,
                      breaks: false, continues: false };
        this.frames.push(frame);
        this.sequence(func.body);
        if (this.reachable) {
            this.line = func.endLine || func.line;
            this.emitReturn(this.type.results, this.line);
        }
        this.frames.pop();
        var body = [];
        var decls = [];
        for (var index = this.type.params.length; index < this.localTypes.length; ++index)
            decls.push({ name: 'l' + index, init: W.isRef(this.localTypes[index]) ? J.nul() : num(0) });
        for (var slot = 0; slot <= this.maxSlot; ++slot)
            decls.push({ name: 's' + slot, init: null });
        this.temps.temps.forEach(function (name) {
            decls.push({ name: name, init: null });
        });
        if (decls.length > 0)
            body.push(J.vars(decls));
        body = body.concat(this.out);
        var node = J.at(J.fnDecl('f' + this.index, params, body), func.line);
        return node;
    };

    // V4 runs "return call" as a tail call and loses the frame of the
    // function (the line of an error): a value that may trap goes into a
    // variable first.
    FunctionCompiler.prototype.settleReturn = function (count) {
        for (var index = Math.max(0, this.stack.length - count); index < this.stack.length; ++index) {
            if (!this.stack[index].pure) {
                this.flushImpure();
                return;
            }
        }
    };

    FunctionCompiler.prototype.emitReturn = function (types, line) {
        this.settleReturn(types.length);
        var values = this.popN(types.length);
        var self = this;
        if (values.length === 0)
            this.emit(J.ret(), line);
        else if (values.length === 1)
            this.emit(J.ret(this.value(values[0])), line);
        else
            this.emit(J.ret(J.arr(values.map(function (entry) { return self.value(entry); }))), line);
    };

    FunctionCompiler.prototype.sequence = function (list) {
        for (var index = 0; index < list.length; ++index) {
            if (!this.reachable)
                return;
            this.line = list[index].line;
            this.instruction(list[index]);
        }
    };

    // --- Blocks

    FunctionCompiler.prototype.newLabel = function () {
        return 'L' + (++this.labels);
    };

    // The results of a block on the top go into the cells base, base + 1, ...
    FunctionCompiler.prototype.settle = function (frame) {
        for (var index = frame.base; index < this.stack.length; ++index)
            this.flushEntry(index);
    };

    FunctionCompiler.prototype.restore = function (frame, types) {
        this.stack.length = frame.base;
        for (var index = 0; index < types.length; ++index)
            this.push(this.slotEntry(frame.base + index, types[index]));
    };

    FunctionCompiler.prototype.block = function (node) {
        var type = node.type;
        this.flushAll();
        var frame = { kind: node.op, label: this.newLabel(), base: this.stack.length - type.params.length,
                      params: type.params, results: type.results, branched: false, breaks: false, continues: false };
        var saved = this.out;
        this.out = [];
        this.frames.push(frame);
        this.sequence(node.body);
        var endReachable = this.reachable;
        if (endReachable)
            this.settle(frame);
        this.frames.pop();
        var body = this.out;
        this.out = saved;
        if (node.op === 'loop') {
            if (frame.continues) {
                if (endReachable)
                    body.push(J.brk(frame.label));
                this.out.push(J.at(J.label(frame.label, J.for_(null, null, null, J.block(body))), node.line));
            } else if (frame.breaks) {
                this.out.push(J.at(J.label(frame.label, J.block(body)), node.line));
            } else {
                this.out = this.out.concat(body);
            }
            this.reachable = endReachable;
        } else {
            if (frame.breaks)
                this.out.push(J.at(J.label(frame.label, J.block(body)), node.line));
            else
                this.out = this.out.concat(body);
            this.reachable = endReachable || frame.branched;
        }
        this.restore(frame, type.results);
    };

    FunctionCompiler.prototype.ifElse = function (node) {
        var type = node.type;
        var condition = this.pop();
        this.flushAll();
        var test = this.condition(condition);
        var frame = { kind: 'if', label: this.newLabel(), base: this.stack.length - type.params.length,
                      params: type.params, results: type.results, branched: false, breaks: false, continues: false };
        var saved = this.out;
        this.frames.push(frame);
        this.out = [];
        this.sequence(node.then);
        var thenReachable = this.reachable;
        if (thenReachable)
            this.settle(frame);
        var thenBody = this.out;
        this.restore(frame, type.params);
        this.reachable = true;
        this.out = [];
        this.sequence(node.else);
        var elseReachable = this.reachable;
        if (elseReachable)
            this.settle(frame);
        var elseBody = this.out;
        this.frames.pop();
        this.out = saved;
        var statement = J.if_(test, J.block(thenBody), elseBody.length > 0 ? J.block(elseBody) : null);
        if (frame.breaks)
            statement = J.label(frame.label, statement);
        this.out.push(J.at(statement, node.line));
        this.reachable = thenReachable || elseReachable || frame.branched;
        this.restore(frame, type.results);
    };

    // A jump to the frame depth: the label values go into its cells, break/continue.
    FunctionCompiler.prototype.branchStatements = function (depth) {
        var frame = this.frames[this.frames.length - 1 - depth];
        var statements = [];
        if (frame.kind === 'func') {
            this.settleReturn(frame.results.length);
            var values = this.stack.slice(this.stack.length - frame.results.length);
            var self = this;
            if (values.length === 0)
                statements.push(J.ret());
            else if (values.length === 1)
                statements.push(J.ret(this.value(values[0])));
            else
                statements.push(J.ret(J.arr(values.map(function (entry) { return self.value(entry); }))));
            return statements;
        }
        var types = frame.kind === 'loop' ? frame.params : frame.results;
        var start = this.stack.length - types.length;
        for (var index = 0; index < types.length; ++index) {
            if (start + index !== frame.base + index || !this.isInSlot(this.stack[start + index], start + index))
                statements.push(J.expr(J.assign(this.slot(frame.base + index), this.value(this.stack[start + index]))));
        }
        if (frame.kind === 'loop') {
            frame.continues = true;
            statements.push(J.cont(frame.label));
        } else {
            frame.breaks = true;
            frame.branched = true;
            statements.push(J.brk(frame.label));
        }
        return statements;
    };

    FunctionCompiler.prototype.br = function (node) {
        this.flushImpure();
        var self = this;
        this.branchStatements(node.depth).forEach(function (statement) {
            self.emit(statement);
        });
        this.reachable = false;
    };

    FunctionCompiler.prototype.brIf = function (node) {
        var condition = this.pop();
        this.flushAll();
        var statements = this.branchStatements(node.depth);
        this.emit(J.if_(this.condition(condition), statements.length === 1 ? statements[0] : J.block(statements)));
    };

    FunctionCompiler.prototype.brTable = function (node) {
        var index = this.pop();
        this.flushAll();
        var self = this;
        var cases = [];
        var groups = {};
        // Equal targets - one branch with several cases.
        node.depths.forEach(function (depth, position) {
            if (depth === node.default)
                return;
            if (groups[depth] === undefined) {
                groups[depth] = { tests: [], depth: depth };
                cases.push(groups[depth]);
            }
            groups[depth].tests.push(position);
        });
        var switchCases = [];
        cases.forEach(function (group) {
            group.tests.forEach(function (test, position) {
                switchCases.push({ test: num(test), body: position === group.tests.length - 1 ? self.branchStatements(group.depth) : [] });
            });
        });
        var defaultStatements = this.branchStatements(node.default);
        if (switchCases.length === 0) {
            this.emit(J.expr(this.value(index)));
            defaultStatements.forEach(function (statement) {
                self.emit(statement);
            });
        } else {
            switchCases.push({ test: null, body: defaultStatements });
            this.emit(J.switch_(this.value(index), switchCases));
        }
        this.reachable = false;
    };

    // --- Instructions

    FunctionCompiler.prototype.instruction = function (node) {
        var op = node.op;
        switch (op) {
        case 'nop':
            return;
        case 'unreachable':
            this.flushImpure();
            this.emit(J.expr(J.call(J.path('$W.unreachable'), [])));
            this.reachable = false;
            return;
        case 'block':
        case 'loop':
            this.block(node);
            return;
        case 'if':
            this.ifElse(node);
            return;
        case 'br':
            this.br(node);
            return;
        case 'br_if':
            this.brIf(node);
            return;
        case 'br_table':
            this.brTable(node);
            return;
        case 'return':
            this.flushImpure();
            this.emitReturn(this.type.results);
            this.reachable = false;
            return;
        case 'call':
            this.call(node);
            return;
        case 'call_indirect':
            this.callIndirect(node);
            return;
        case 'drop': {
            var dropped = this.pop();
            if (!dropped.pure) {
                this.flushImpure();
                this.emit(J.expr(dropped.expr), dropped.line);
            }
            return;
        }
        case 'select':
            this.select(node);
            return;
        case 'local.get':
            this.push(this.entryLocal(node.index));
            return;
        case 'local.set':
        case 'local.tee':
            this.setLocal(node.index, op === 'local.tee');
            return;
        case 'global.get': {
            var item = this.module.globals[node.index];
            this.push(this.entry(item.type.type, this.gen.globalRef(node.index), !item.type.mutable));
            return;
        }
        case 'global.set': {
            var value = this.pop();
            this.flushImpure();
            this.emit(J.expr(J.assign(this.gen.globalRef(node.index), this.value(value))));
            return;
        }
        case 'i32.const':
        case 'i64.const':
        case 'f32.const':
        case 'f64.const':
            this.push(this.entry(op.substring(0, 3), this.gen.literal(node), true));
            return;
        case 'ref.null':
            this.push(this.entry(node.ref, J.nul(), true));
            return;
        case 'ref.is_null': {
            var ref = this.pop();
            this.push(this.entry('i32', J.bin('===', ref.expr, J.nul()), true, [ref], true));
            return;
        }
        case 'ref.func':
            this.push(this.entry('funcref', this.gen.funcRef(node.func), true));
            return;
        case 'memory.size':
            this.push(this.entry('i32', J.mem(J.id('m0'), 'pages'), false));
            return;
        case 'memory.grow': {
            var delta = this.pop();
            this.flushImpure();
            this.pushStatement('i32', J.call(J.mem(J.id('m0'), 'grow'), [this.value(delta)]));
            return;
        }
        case 'memory.fill':
        case 'memory.copy': {
            var operands = this.popN(3);
            this.flushImpure();
            this.emit(J.expr(J.call(J.mem(J.id('m0'), op === 'memory.fill' ? 'fill' : 'copy'), operands.map(this.value, this))));
            return;
        }
        case 'memory.init': {
            var initOperands = this.popN(3);
            this.flushImpure();
            this.emit(J.expr(J.call(J.mem(J.id('m0'), 'init'),
                                    [J.idx(J.mem(J.id('$D'), 'd'), num(node.data))].concat(initOperands.map(this.value, this)))));
            return;
        }
        case 'data.drop':
            this.emit(J.expr(J.assign(J.idx(J.mem(J.id('$D'), 'd'), num(node.data)), J.arr([]))));
            return;
        case 'table.get': {
            var tableIndex = this.pop();
            this.push(this.entry(this.module.tables[node.table].type.ref,
                                 J.call(J.mem(J.id('t' + node.table), 'get'), [this.value(tableIndex)]), false, [tableIndex]));
            return;
        }
        case 'table.set': {
            var setOperands = this.popN(2);
            this.flushImpure();
            this.emit(J.expr(J.call(J.mem(J.id('t' + node.table), 'set'), setOperands.map(this.value, this))));
            return;
        }
        case 'table.size':
            this.push(this.entry('i32', J.mem(J.mem(J.id('t' + node.table), 'e'), 'length'), false));
            return;
        case 'table.grow': {
            var growOperands = this.popN(2);
            this.flushImpure();
            this.pushStatement('i32', J.call(J.mem(J.id('t' + node.table), 'grow'), growOperands.map(this.value, this)));
            return;
        }
        case 'table.fill': {
            var fillOperands = this.popN(3);
            this.flushImpure();
            this.emit(J.expr(J.call(J.mem(J.id('t' + node.table), 'fill'), fillOperands.map(this.value, this))));
            return;
        }
        case 'table.copy': {
            var copyOperands = this.popN(3);
            this.flushImpure();
            this.emit(J.expr(J.call(J.mem(J.id('t' + node.dst), 'copy'),
                                    [J.id('t' + node.src)].concat(copyOperands.map(this.value, this)))));
            return;
        }
        case 'table.init': {
            var tableInit = this.popN(3);
            this.flushImpure();
            this.emit(J.expr(J.call(J.mem(J.id('t' + node.table), 'init'),
                                    [J.idx(J.mem(J.id('$D'), 'e'), num(node.elem))].concat(tableInit.map(this.value, this)))));
            return;
        }
        case 'elem.drop':
            this.emit(J.expr(J.assign(J.idx(J.mem(J.id('$D'), 'e'), num(node.elem)), J.arr([]))));
            return;
        }
        var info = OPS[op];
        if (info.imm === 'memarg') {
            if (info.results.length === 1)
                this.load(node, info);
            else
                this.store(node, info);
            return;
        }
        if (info.params.length === 2)
            this.binary(op);
        else
            this.unary(op);
    };

    FunctionCompiler.prototype.entryLocal = function (index) {
        return { type: this.localTypes[index], expr: this.local(index), pure: true, locals: [index], slots: [], bool: false,
                 line: this.line };
    };

    FunctionCompiler.prototype.setLocal = function (index, tee) {
        var value = this.pop();
        // Whoever reads the old value is computed before the write.
        for (var position = 0; position < this.stack.length; ++position) {
            if (this.stack[position].locals.indexOf(index) >= 0)
                this.flushEntry(position);
        }
        if (!value.pure)
            this.flushImpure();
        if (value.expr.k === 'id' && value.expr.name === 'l' + index) {
            if (tee)
                this.push(this.entryLocal(index));
            return;
        }
        this.emit(J.expr(J.assign(this.local(index), this.value(value))));
        if (tee)
            this.push(this.entryLocal(index));
    };

    FunctionCompiler.prototype.call = function (node) {
        var callee = this.module.types[this.module.funcs[node.func].typeIndex];
        var args = this.popN(callee.params.length);
        this.flushImpure();
        this.pushResults(callee.results, J.call(this.gen.funcRef(node.func), args.map(this.value, this)));
    };

    FunctionCompiler.prototype.callIndirect = function (node) {
        var type = this.module.types[node.typeIndex];
        var index = this.pop();
        // The arguments are computed before the index: if they may trap,
        // they go first.
        this.flushImpure();
        var args = this.popN(type.params.length);
        var signature = W.rt.signature(type);
        var callee = J.call(J.path('$W.indirect'), [J.id('t' + node.table), this.value(index), J.str(signature)]);
        this.pushResults(type.results, J.call(callee, args.map(this.value, this)));
    };

    FunctionCompiler.prototype.select = function () {
        var condition = this.pop();
        var operands = this.popN(2);
        // Both values are always computed: those that may trap in advance.
        if (!operands[0].pure || !operands[1].pure) {
            this.stack.push(operands[0], operands[1]);
            this.flushImpure();
            operands = this.popN(2);
        }
        var expr = J.cond(this.condition(condition), this.value(operands[0]), this.value(operands[1]));
        this.push(this.entry(operands[0].type, expr, true, [operands[0], operands[1], condition]));
    };

    // --- Memory

    // An address: unsigned plus the offset (up to 2^33, exact in double).
    FunctionCompiler.prototype.address = function (entry, offset) {
        var base = this.value(entry);
        if (base.k === 'num')
            return num((base.value >>> 0) + offset);
        var unsigned = J.bin('>>>', base, num(0));
        return offset === 0 ? unsigned : J.bin('+', unsigned, num(offset));
    };

    FunctionCompiler.prototype.load = function (node, info) {
        var address = this.pop();
        var type = info.results[0];
        var addressExpr = this.address(address, node.offset);
        var expr;
        if (node.op === 'i64.load') {
            expr = J.call(J.mem(J.id('m0'), 'load64'), [addressExpr]);
        } else {
            var view = MEMORY_VIEWS[node.op];
            var shift = view[1];
            var temporary = J.id(this.temps.temp());
            var test = J.bin('<=', J.assign(temporary, addressExpr), J.mem(J.id('m0'), LIMITS[shift]));
            if (shift > 0)
                test = J.and(test, J.bin('===', J.bin('&', temporary, num((1 << shift) - 1)), num(0)));
            var fast = J.idx(J.mem(J.id('m0'), view[0]), shift > 0 ? J.bin('>>', temporary, num(shift)) : temporary);
            var slow = J.call(J.mem(J.id('m0'), 'load'), [J.str(view[2]), temporary]);
            expr = J.cond(test, fast, slow);
        }
        this.push(this.entry(type, expr, false, [address]));
    };

    FunctionCompiler.prototype.store = function (node) {
        var operands = this.popN(2);
        this.flushImpure();
        var addressExpr = this.address(operands[0], node.offset);
        var value = this.value(operands[1]);
        var op = node.op;
        var statement;
        if (op === 'i64.store') {
            statement = J.call(J.mem(J.id('m0'), 'store64'), [addressExpr, value]);
        } else {
            if (op.substring(0, 3) === 'i64')
                value = J.call(J.path('$W.loOf'), [value]);
            var view = MEMORY_VIEWS[op];
            var shift = view[1];
            var temporary = J.id(this.temps.temp());
            var test = J.bin('<=', J.assign(temporary, addressExpr), J.mem(J.id('m0'), LIMITS[shift]));
            if (shift > 0)
                test = J.and(test, J.bin('===', J.bin('&', temporary, num((1 << shift) - 1)), num(0)));
            var target = J.idx(J.mem(J.id('m0'), view[0]), shift > 0 ? J.bin('>>', temporary, num(shift)) : temporary);
            var slow = J.call(J.mem(J.id('m0'), 'store'), [J.str(view[2]), temporary]);
            // One value for both branches.
            if (!J.isSimple(value)) {
                var valueTemporary = J.id(this.temps.temp());
                this.emit(J.expr(J.cond(test, J.assign(target, J.assign(valueTemporary, value)),
                                        callWith(slow, valueTemporary, value))));
                return;
            }
            statement = J.cond(test, J.assign(target, value), callWith(slow, null, value));
        }
        this.emit(J.expr(statement));
    };

    function callWith(call, temp, value) {
        call.args.push(temp === null ? value : J.assign(temp, value));
        return call;
    }

    // --- Arithmetic

    function bin(op, left, right) {
        return J.bin(op, left, right);
    }

    function isConst(entry) {
        return entry.expr.k === 'num' || (entry.expr.k === 'un' && entry.expr.op === '-' && entry.expr.arg.k === 'num');
    }

    function constValue(entry) {
        return entry.expr.k === 'num' ? entry.expr.value : -entry.expr.arg.value;
    }

    // An operand needed twice: a simple one as it is, otherwise through a
    // temporary. [the computation or null, the reference].
    FunctionCompiler.prototype.twice = function (expr) {
        if (J.isSimple(expr))
            return [null, expr];
        var temporary = J.id(this.temps.temp());
        return [J.assign(temporary, expr), temporary];
    };

    function seq(setups, expr) {
        var list = setups.filter(function (item) { return item !== null; });
        if (list.length === 0)
            return expr;
        list.push(expr);
        return J.seq(list);
    }

    var I32_COMPARE = { eq: '===', ne: '!==', lt_s: '<', gt_s: '>', le_s: '<=', ge_s: '>=' };
    var U_COMPARE = { lt_u: '<', gt_u: '>', le_u: '<=', ge_u: '>=' };
    var F_COMPARE = { eq: '===', ne: '!==', lt: '<', gt: '>', le: '<=', ge: '>=' };
    var I64_UNSIGNED = { lt_u: 'ltU', gt_u: 'gtU', le_u: 'leU', ge_u: 'geU' };

    FunctionCompiler.prototype.binary = function (op) {
        var operands = this.popN(2);
        var left = operands[0], right = operands[1];
        var leftValue = this.value(left), rightValue = this.value(right);
        var type = op.substring(0, 3);
        var name = op.substring(4);
        var result = OPS[op].results[0];
        var expr, pure = true, bool = false;
        var self = this;
        if (type === 'i32') {
            switch (name) {
            case 'add': expr = bin('|', bin('+', leftValue, rightValue), num(0)); break;
            case 'sub': expr = bin('|', bin('-', leftValue, rightValue), num(0)); break;
            case 'mul': expr = J.call(J.path('Math.imul'), [leftValue, rightValue]); break;
            case 'and': expr = bin('&', leftValue, rightValue); break;
            case 'or': expr = bin('|', leftValue, rightValue); break;
            case 'xor': expr = bin('^', leftValue, rightValue); break;
            case 'shl': expr = bin('<<', leftValue, rightValue); break;
            case 'shr_s': expr = bin('>>', leftValue, rightValue); break;
            case 'shr_u': expr = bin('|', bin('>>>', leftValue, rightValue), num(0)); break;
            case 'rotl':
            case 'rotr': {
                var left1 = name === 'rotl' ? '<<' : '>>>', right1 = name === 'rotl' ? '>>>' : '<<';
                if (isConst(right)) {
                    var shift = constValue(right) & 31;
                    if (shift === 0) {
                        expr = leftValue;
                    } else {
                        var repeated = this.twice(leftValue);
                        var shiftedOut = bin(left1, repeated[1], num(shift));
                        expr = seq([repeated[0]], bin('|', shiftedOut, bin(right1, repeated[1], num(32 - shift))));
                    }
                } else {
                    var leftRepeated = this.twice(leftValue), rightRepeated = this.twice(rightValue);
                    var leftShifted = bin(left1, leftRepeated[1], rightRepeated[1]);
                    var rightShifted = bin(right1, leftRepeated[1], bin('-', num(32), rightRepeated[1]));
                    expr = seq([leftRepeated[0], rightRepeated[0]], bin('|', leftShifted, rightShifted));
                }
                break;
            }
            case 'div_s':
            case 'div_u':
            case 'rem_s':
            case 'rem_u': {
                var unsigned = name.charAt(4) === 'u';
                var division = name.substring(0, 3) === 'div';
                var dividendPair = this.twice(leftValue), divisorPair = this.twice(rightValue);
                var dividendOperand = unsigned ? bin('>>>', dividendPair[1], num(0)) : dividendPair[1];
                var divisorOperand = unsigned ? bin('>>>', divisorPair[1], num(0)) : divisorPair[1];
                var operation = bin('|', bin(division ? '/' : '%', dividendOperand, divisorOperand), num(0));
                if (isConst(right) && constValue(right) !== 0 && !(name === 'div_s' && constValue(right) === -1)) {
                    expr = seq([dividendPair[0], divisorPair[0]], operation);
                } else {
                    pure = false;
                    if (name === 'div_s') {
                        var overflows = J.and(bin('===', dividendPair[1], num(-2147483648)),
                                              bin('===', divisorPair[1], num(-1)));
                        operation = J.cond(overflows, J.call(J.path('$W.overflow'), []), operation);
                    }
                    expr = seq([dividendPair[0], divisorPair[0]],
                               J.cond(bin('===', divisorPair[1], num(0)), J.call(J.path('$W.divideByZero'), []),
                                      operation));
                }
                break;
            }
            default:
                if (I32_COMPARE[name] !== undefined)
                    expr = bin(I32_COMPARE[name], leftValue, rightValue);
                else if (U_COMPARE[name] !== undefined)
                    expr = bin(U_COMPARE[name], bin('>>>', leftValue, num(0)), bin('>>>', rightValue, num(0)));
                else
                    throw new Error('i32 op ' + op);
                bool = true;
            }
        } else if (type === 'i64') {
            var ctx = this.ctx;
            switch (name) {
            case 'add': expr = T.ops.binary('i64', '+', leftValue, rightValue, ctx); break;
            case 'sub': expr = T.ops.binary('i64', '-', leftValue, rightValue, ctx); break;
            case 'mul': expr = T.ops.binary('i64', '*', leftValue, rightValue, ctx); break;
            case 'and': expr = T.ops.binary('i64', '&', leftValue, rightValue, ctx); break;
            case 'or': expr = T.ops.binary('i64', '|', leftValue, rightValue, ctx); break;
            case 'xor': expr = T.ops.binary('i64', '^', leftValue, rightValue, ctx); break;
            case 'shl': expr = J.call(J.path('$w.shl'), [leftValue, rightValue]); break;
            case 'shr_s': expr = J.call(J.path('$w.shrS'), [leftValue, rightValue]); break;
            case 'shr_u': expr = J.call(J.path('$w.shrU'), [leftValue, rightValue]); break;
            case 'rotl': expr = J.call(J.path('$w.rotl'), [leftValue, rightValue]); break;
            case 'rotr': expr = J.call(J.path('$w.rotr'), [leftValue, rightValue]); break;
            case 'div_s': expr = J.call(J.path('$w.divS'), [leftValue, rightValue]); pure = false; break;
            case 'div_u': expr = J.call(J.path('$w.divU'), [leftValue, rightValue]); pure = false; break;
            case 'rem_s': expr = J.call(J.path('$w.remS'), [leftValue, rightValue]); pure = false; break;
            case 'rem_u': expr = J.call(J.path('$w.remU'), [leftValue, rightValue]); pure = false; break;
            case 'eq': expr = T.ops.equals('i64', false, leftValue, rightValue, ctx); bool = true; break;
            case 'ne': expr = T.ops.equals('i64', true, leftValue, rightValue, ctx); bool = true; break;
            case 'lt_s': expr = T.ops.compare('i64', '<', leftValue, rightValue, ctx); bool = true; break;
            case 'gt_s': expr = T.ops.compare('i64', '>', leftValue, rightValue, ctx); bool = true; break;
            case 'le_s': expr = T.ops.compare('i64', '<=', leftValue, rightValue, ctx); bool = true; break;
            case 'ge_s': expr = T.ops.compare('i64', '>=', leftValue, rightValue, ctx); bool = true; break;
            default:
                if (I64_UNSIGNED[name] === undefined)
                    throw new Error('i64 op ' + op);
                expr = J.call(J.path('$w.' + I64_UNSIGNED[name]), [leftValue, rightValue]);
                bool = true;
            }
        } else {
            var f32 = type === 'f32';
            switch (name) {
            case 'add': case 'sub': case 'mul': case 'div': {
                var symbol = { add: '+', sub: '-', mul: '*', div: '/' }[name];
                expr = bin(symbol, leftValue, rightValue);
                if (f32)
                    expr = J.call(J.path('Math.fround'), [expr]);
                break;
            }
            case 'min': expr = J.call(J.path('Math.min'), [leftValue, rightValue]); break;
            case 'max': expr = J.call(J.path('Math.max'), [leftValue, rightValue]); break;
            case 'copysign': expr = J.call(J.path('$W.copysign'), [leftValue, rightValue]); break;
            default:
                if (F_COMPARE[name] === undefined)
                    throw new Error('float op ' + op);
                expr = bin(F_COMPARE[name], leftValue, rightValue);
                bool = true;
            }
        }
        if (bool && result !== 'i32')
            throw new Error('bool result ' + op);
        this.push(self.entry(result, expr, pure, [left, right], bool));
    };

    FunctionCompiler.prototype.unary = function (op) {
        var operand = this.pop();
        var value = this.value(operand);
        var result = OPS[op].results[0];
        var expr, pure = true, bool = false;
        switch (op) {
        case 'i32.eqz':
            expr = operand.bool ? J.not(operand.expr) : bin('===', value, num(0));
            bool = true;
            break;
        case 'i64.eqz':
            expr = bin('===', value, num(0));
            bool = true;
            break;
        case 'i32.clz': expr = J.call(J.path('Math.clz32'), [value]); break;
        case 'i32.ctz': expr = J.call(J.path('$W.ctz32'), [value]); break;
        case 'i32.popcnt': expr = J.call(J.path('$W.popcnt32'), [value]); break;
        case 'i32.extend8_s': expr = bin('>>', bin('<<', value, num(24)), num(24)); break;
        case 'i32.extend16_s': expr = bin('>>', bin('<<', value, num(16)), num(16)); break;
        case 'i64.clz': expr = J.call(J.path('$w.clz'), [value]); break;
        case 'i64.ctz': expr = J.call(J.path('$w.ctz'), [value]); break;
        case 'i64.popcnt': expr = J.call(J.path('$w.popcnt'), [value]); break;
        case 'i64.extend8_s': expr = J.call(J.path('$w.extend8'), [value]); break;
        case 'i64.extend16_s': expr = J.call(J.path('$w.extend16'), [value]); break;
        case 'i64.extend32_s': expr = J.call(J.path('$w.extend32'), [value]); break;
        case 'i32.wrap_i64': expr = J.call(J.path('$W.loOf'), [value]); break;
        case 'i64.extend_i32_s': expr = value; break;
        case 'i64.extend_i32_u': expr = bin('>>>', value, num(0)); break;
        case 'i32.trunc_f32_s':
        case 'i32.trunc_f64_s': expr = J.call(J.path('$W.truncI32'), [value]); pure = false; break;
        case 'i32.trunc_f32_u':
        case 'i32.trunc_f64_u': expr = J.call(J.path('$W.truncU32'), [value]); pure = false; break;
        case 'i64.trunc_f32_s':
        case 'i64.trunc_f64_s': expr = J.call(J.path('$w.truncS'), [value]); pure = false; break;
        case 'i64.trunc_f32_u':
        case 'i64.trunc_f64_u': expr = J.call(J.path('$w.truncU'), [value]); pure = false; break;
        case 'i32.trunc_sat_f32_s':
        case 'i32.trunc_sat_f64_s': expr = J.call(J.path('$W.truncSatI32'), [value]); break;
        case 'i32.trunc_sat_f32_u':
        case 'i32.trunc_sat_f64_u': expr = J.call(J.path('$W.truncSatU32'), [value]); break;
        case 'i64.trunc_sat_f32_s':
        case 'i64.trunc_sat_f64_s': expr = J.call(J.path('$w.truncSatS'), [value]); break;
        case 'i64.trunc_sat_f32_u':
        case 'i64.trunc_sat_f64_u': expr = J.call(J.path('$w.truncSatU'), [value]); break;
        case 'f32.convert_i32_s': expr = J.call(J.path('Math.fround'), [value]); break;
        case 'f32.convert_i32_u': expr = J.call(J.path('Math.fround'), [bin('>>>', value, num(0))]); break;
        case 'f32.convert_i64_s': expr = J.call(J.path('$w.toF32S'), [value]); break;
        case 'f32.convert_i64_u': expr = J.call(J.path('$w.toF32U'), [value]); break;
        case 'f32.demote_f64': expr = J.call(J.path('Math.fround'), [value]); break;
        case 'f64.convert_i32_s': expr = value; break;
        case 'f64.convert_i32_u': expr = bin('>>>', value, num(0)); break;
        case 'f64.convert_i64_s': expr = J.call(J.path('$w.toF64S'), [value]); break;
        case 'f64.convert_i64_u': expr = J.call(J.path('$w.toF64U'), [value]); break;
        case 'f64.promote_f32': expr = value; break;
        case 'i32.reinterpret_f32': expr = J.call(J.path('$W.i32FromF32'), [value]); break;
        case 'i64.reinterpret_f64': expr = J.call(J.path('$W.i64FromF64'), [value]); break;
        case 'f32.reinterpret_i32': expr = J.call(J.path('$W.f32FromI32'), [value]); break;
        case 'f64.reinterpret_i64': expr = J.call(J.path('$W.f64FromI64'), [value]); break;
        default: {
            var name = op.substring(4);
            var f32 = op.charAt(1) === '3';
            switch (name) {
            case 'abs': expr = J.call(J.path('Math.abs'), [value]); break;
            case 'neg': expr = J.un('-', value); break;
            case 'ceil': expr = J.call(J.path('Math.ceil'), [value]); break;
            case 'floor': expr = J.call(J.path('Math.floor'), [value]); break;
            case 'trunc': expr = J.call(J.path('Math.trunc'), [value]); break;
            case 'nearest': expr = J.call(J.path('$W.nearest'), [value]); break;
            case 'sqrt':
                expr = J.call(J.path('Math.sqrt'), [value]);
                if (f32)
                    expr = J.call(J.path('Math.fround'), [expr]);
                break;
            default:
                throw new Error('unary op ' + op);
            }
        }
        }
        this.push(this.entry(result, expr, pure, [operand], bool));
    };

    W.compileModule = function (module, source) {
        var compiler = new ModuleCompiler(module, source);
        var statements = compiler.compile();
        T.setSource(statements, source || '');
        return { statements: statements, consts: compiler.consts, globalCells: compiler.globalCells };
    };
})(globalThis);
