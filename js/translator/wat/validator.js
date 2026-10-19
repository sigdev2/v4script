// WAT: validation of a module by the WebAssembly 2.0 spec (the algorithm
// of its appendix: a type stack and control frames, an unknown type after
// an unconditional branch). Errors are 'invalid' with the texts of the spec.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var W = T.wat;
    if (W.validate)
        return;

    var OPS = W.OPS;
    var UNKNOWN = 'unknown';
    var MAX_PAGES = 65536;

    function Validator(module, source) {
        this.module = module;
        this.source = source || '';
    }

    Validator.prototype.fail = function (message, node) {
        throw W.error('invalid', message, node ? node.line : 0, node ? node.col : 0, this.source);
    };

    Validator.prototype.typeAt = function (index, node) {
        var type = this.module.types[index];
        if (type === undefined)
            this.fail('unknown type ' + index, node);
        return type;
    };

    Validator.prototype.funcType = function (index, node) {
        var func = this.module.funcs[index];
        if (func === undefined)
            this.fail('unknown function ' + index, node);
        return this.typeAt(func.typeIndex, func);
    };

    Validator.prototype.limits = function (limits, range, node, what) {
        if (limits.min > range)
            this.fail(what === 'memory' ? 'memory size must be at most 65536 pages (4GiB)' : 'table size must be at most 2^32-1', node);
        if (limits.max !== null && limits.max > range)
            this.fail(what === 'memory' ? 'memory size must be at most 65536 pages (4GiB)' : 'table size must be at most 2^32-1', node);
        if (limits.max !== null && limits.min > limits.max)
            this.fail('size minimum must not be greater than maximum', node);
    };

    // --- Module

    Validator.prototype.run = function () {
        var module = this.module;
        var self = this;
        module.funcs.forEach(function (func) {
            self.typeAt(func.typeIndex, func);
        });
        module.tables.forEach(function (table) {
            self.limits(table.type, 4294967295, table, 'table');
        });
        if (module.mems.length > 1)
            this.fail('multiple memories', module.mems[1]);
        module.mems.forEach(function (memory) {
            self.limits(memory.type, MAX_PAGES, memory, 'memory');
        });
        // Functions that ref.func may refer to: everything outside function bodies.
        var refs = {};
        module.exports.forEach(function (entry) {
            if (entry.kind === 'func')
                refs[entry.index] = true;
        });
        module.globals.forEach(function (item) {
            if (item.init)
                self.collectRefs(item.init, refs);
        });
        module.elems.forEach(function (segment) {
            segment.init.forEach(function (expr) {
                self.collectRefs(expr, refs);
            });
        });
        this.refs = refs;
        var importedGlobals = 0;
        module.globals.forEach(function (item) {
            if (item.import)
                ++importedGlobals;
        });
        this.importedGlobals = importedGlobals;
        module.globals.forEach(function (item) {
            if (item.init)
                self.constant(item.init, item.type.type, item);
        });
        module.elems.forEach(function (segment) {
            if (segment.mode === 'active') {
                var table = module.tables[segment.table];
                if (table === undefined)
                    self.fail('unknown table ' + segment.table, segment);
                self.constant(segment.offset, 'i32', segment);
                if (table.type.ref !== segment.type)
                    self.fail('type mismatch', segment);
            }
            segment.init.forEach(function (expr) {
                self.constant(expr, segment.type, segment);
            });
        });
        module.datas.forEach(function (segment) {
            if (segment.mode === 'active') {
                if (module.mems[segment.memory] === undefined)
                    self.fail('unknown memory ' + segment.memory, segment);
                self.constant(segment.offset, 'i32', segment);
            }
        });
        module.funcs.forEach(function (func, index) {
            if (func.import === null)
                self.func(func, index);
        });
        if (module.start !== null) {
            var startType = this.funcType(module.start.index, module.start);
            if (startType.params.length > 0 || startType.results.length > 0)
                this.fail('start function must have type [] -> []', module.start);
        }
        var names = {};
        module.exports.forEach(function (entry) {
            if (Object.prototype.hasOwnProperty.call(names, entry.name))
                self.fail('duplicate export name ' + JSON.stringify(entry.name), entry);
            names[entry.name] = true;
            var space = { func: module.funcs, table: module.tables, memory: module.mems, global: module.globals }[entry.kind];
            if (space[entry.index] === undefined)
                self.fail('unknown ' + (entry.kind === 'func' ? 'function' : entry.kind) + ' ' + entry.index, entry);
        });
    };

    Validator.prototype.collectRefs = function (expr, refs) {
        expr.forEach(function (node) {
            if (node.op === 'ref.func')
                refs[node.func] = true;
        });
    };

    // A constant expression of the type type.
    Validator.prototype.constant = function (expr, type, owner) {
        var module = this.module;
        var stack = [];
        for (var index = 0; index < expr.length; ++index) {
            var node = expr[index];
            switch (node.op) {
            case 'i32.const':
            case 'i64.const':
            case 'f32.const':
            case 'f64.const':
                stack.push(node.op.substring(0, 3));
                break;
            case 'ref.null':
                stack.push(node.ref);
                break;
            case 'ref.func':
                if (module.funcs[node.func] === undefined)
                    this.fail('unknown function ' + node.func, node);
                stack.push('funcref');
                break;
            case 'global.get': {
                var item = module.globals[node.index];
                if (item === undefined || node.index >= this.importedGlobals)
                    this.fail('unknown global ' + node.index, node);
                if (item.type.mutable)
                    this.fail('constant expression required', node);
                stack.push(item.type.type);
                break;
            }
            default:
                this.fail('constant expression required', node);
            }
        }
        if (stack.length !== 1 || stack[0] !== type)
            this.fail('type mismatch', expr[expr.length - 1] || owner);
    };

    // --- A function body

    Validator.prototype.func = function (func) {
        var type = this.typeAt(func.typeIndex, func);
        this.locals = type.params.concat(func.locals);
        this.vals = [];
        this.ctrls = [];
        this.returns = type.results;
        this.pushCtrl('block', [], type.results, func);
        this.sequence(func.body);
        this.end(func.endLine ? { line: func.endLine } : func);
    };

    Validator.prototype.push = function (type) {
        this.vals.push(type);
    };

    Validator.prototype.popAny = function (node) {
        var frame = this.ctrls[this.ctrls.length - 1];
        if (this.vals.length === frame.height) {
            if (frame.unreachable)
                return UNKNOWN;
            this.fail('type mismatch', node);
        }
        return this.vals.pop();
    };

    Validator.prototype.pop = function (expect, node) {
        var actual = this.popAny(node);
        if (actual !== expect && actual !== UNKNOWN && expect !== UNKNOWN)
            this.fail('type mismatch', node);
        return actual === UNKNOWN ? expect : actual;
    };

    Validator.prototype.popAll = function (types, node) {
        for (var index = types.length - 1; index >= 0; --index)
            this.pop(types[index], node);
    };

    Validator.prototype.pushAll = function (types) {
        for (var index = 0; index < types.length; ++index)
            this.vals.push(types[index]);
    };

    Validator.prototype.pushCtrl = function (op, params, results, node) {
        this.ctrls.push({ op: op, params: params, results: results, height: this.vals.length, unreachable: false, node: node });
        this.pushAll(params);
    };

    Validator.prototype.popCtrl = function (node) {
        var frame = this.ctrls[this.ctrls.length - 1];
        this.popAll(frame.results, node);
        if (this.vals.length !== frame.height)
            this.fail('type mismatch', node);
        this.ctrls.pop();
        return frame;
    };

    Validator.prototype.end = function (node) {
        this.popCtrl(node);
    };

    Validator.prototype.unreachable = function () {
        var frame = this.ctrls[this.ctrls.length - 1];
        this.vals.length = frame.height;
        frame.unreachable = true;
    };

    Validator.prototype.labelTypes = function (frame) {
        return frame.op === 'loop' ? frame.params : frame.results;
    };

    Validator.prototype.frameAt = function (depth, node) {
        if (depth >= this.ctrls.length)
            this.fail('unknown label', node);
        return this.ctrls[this.ctrls.length - 1 - depth];
    };

    Validator.prototype.sequence = function (list) {
        for (var index = 0; index < list.length; ++index)
            this.instruction(list[index]);
    };

    Validator.prototype.memory = function (node) {
        if (this.module.mems[0] === undefined)
            this.fail('unknown memory 0', node);
    };

    Validator.prototype.table = function (index, node) {
        var table = this.module.tables[index];
        if (table === undefined)
            this.fail('unknown table ' + index, node);
        return table;
    };

    Validator.prototype.blockType = function (type, node) {
        if (type.deferred)
            this.typeAt(type.index, node);
    };

    Validator.prototype.instruction = function (node) {
        var module = this.module;
        var op = node.op;
        var info = OPS[op];
        switch (op) {
        case 'unreachable':
            this.unreachable();
            return;
        case 'block':
        case 'loop':
            this.blockType(node.type, node);
            this.popAll(node.type.params, node);
            this.pushCtrl(op, node.type.params, node.type.results, node);
            this.sequence(node.body);
            this.pushAll(this.popCtrl(node.endLine ? { line: node.endLine, col: 0 } : node).results);
            return;
        case 'if':
            this.blockType(node.type, node);
            this.pop('i32', node);
            this.popAll(node.type.params, node);
            this.pushCtrl('if', node.type.params, node.type.results, node);
            this.sequence(node.then);
            var frame = this.popCtrl(node);
            this.pushCtrl('else', frame.params, frame.results, node);
            this.sequence(node.else);
            this.pushAll(this.popCtrl(node).results);
            return;
        case 'br': {
            var target = this.frameAt(node.depth, node);
            this.popAll(this.labelTypes(target), node);
            this.unreachable();
            return;
        }
        case 'br_if': {
            var conditional = this.frameAt(node.depth, node);
            this.pop('i32', node);
            var types = this.labelTypes(conditional);
            this.popAll(types, node);
            this.pushAll(types);
            return;
        }
        case 'br_table': {
            this.pop('i32', node);
            var defaultTypes = this.labelTypes(this.frameAt(node.default, node));
            var arity = defaultTypes.length;
            for (var index = 0; index < node.depths.length; ++index) {
                var labelTypes = this.labelTypes(this.frameAt(node.depths[index], node));
                if (labelTypes.length !== arity)
                    this.fail('type mismatch', node);
                // The types are checked for every label on a copy of the stack.
                var saved = this.vals.slice();
                this.popAll(labelTypes, node);
                this.vals = saved;
            }
            this.popAll(defaultTypes, node);
            this.unreachable();
            return;
        }
        case 'return':
            this.popAll(this.returns, node);
            this.unreachable();
            return;
        case 'call': {
            var calleeType = this.funcType(node.func, node);
            this.popAll(calleeType.params, node);
            this.pushAll(calleeType.results);
            return;
        }
        case 'call_indirect': {
            var table = this.table(node.table, node);
            if (table.type.ref !== 'funcref')
                this.fail('type mismatch', node);
            var indirectType = this.typeAt(node.typeIndex, node);
            this.pop('i32', node);
            this.popAll(indirectType.params, node);
            this.pushAll(indirectType.results);
            return;
        }
        case 'drop':
            node.type = this.popAny(node);
            return;
        case 'select': {
            if (node.types !== null) {
                if (node.types.length !== 1)
                    this.fail('invalid result arity', node);
                this.pop('i32', node);
                this.pop(node.types[0], node);
                this.pop(node.types[0], node);
                this.push(node.types[0]);
                return;
            }
            this.pop('i32', node);
            var first = this.popAny(node);
            var second = this.popAny(node);
            if (W.isRef(first) || W.isRef(second))
                this.fail('type mismatch', node);
            if (first !== second && first !== UNKNOWN && second !== UNKNOWN)
                this.fail('type mismatch', node);
            this.push(first === UNKNOWN ? second : first);
            return;
        }
        case 'local.get':
        case 'local.set':
        case 'local.tee': {
            var localType = this.locals[node.index];
            if (localType === undefined)
                this.fail('unknown local ' + node.index, node);
            if (op === 'local.get') {
                this.push(localType);
            } else {
                this.pop(localType, node);
                if (op === 'local.tee')
                    this.push(localType);
            }
            return;
        }
        case 'global.get':
        case 'global.set': {
            var item = module.globals[node.index];
            if (item === undefined)
                this.fail('unknown global ' + node.index, node);
            if (op === 'global.get') {
                this.push(item.type.type);
            } else {
                if (!item.type.mutable)
                    this.fail('global is immutable', node);
                this.pop(item.type.type, node);
            }
            return;
        }
        case 'table.get':
            this.pop('i32', node);
            this.push(this.table(node.table, node).type.ref);
            return;
        case 'table.set':
            this.pop(this.table(node.table, node).type.ref, node);
            this.pop('i32', node);
            return;
        case 'table.size':
            this.table(node.table, node);
            this.push('i32');
            return;
        case 'table.grow':
            this.pop('i32', node);
            this.pop(this.table(node.table, node).type.ref, node);
            this.push('i32');
            return;
        case 'table.fill':
            this.pop('i32', node);
            this.pop(this.table(node.table, node).type.ref, node);
            this.pop('i32', node);
            return;
        case 'table.copy': {
            var dst = this.table(node.dst, node), src = this.table(node.src, node);
            if (dst.type.ref !== src.type.ref)
                this.fail('type mismatch', node);
            this.popAll(['i32', 'i32', 'i32'], node);
            return;
        }
        case 'table.init': {
            var initTable = this.table(node.table, node);
            var segment = module.elems[node.elem];
            if (segment === undefined)
                this.fail('unknown elem segment ' + node.elem, node);
            if (initTable.type.ref !== segment.type)
                this.fail('type mismatch', node);
            this.popAll(['i32', 'i32', 'i32'], node);
            return;
        }
        case 'elem.drop':
            if (module.elems[node.elem] === undefined)
                this.fail('unknown elem segment ' + node.elem, node);
            return;
        case 'memory.init':
            this.memory(node);
            if (module.datas[node.data] === undefined)
                this.fail('unknown data segment ' + node.data, node);
            this.popAll(['i32', 'i32', 'i32'], node);
            return;
        case 'data.drop':
            if (module.datas[node.data] === undefined)
                this.fail('unknown data segment ' + node.data, node);
            return;
        case 'ref.null':
            this.push(node.ref);
            return;
        case 'ref.is_null': {
            var ref = this.popAny(node);
            if (ref !== UNKNOWN && !W.isRef(ref))
                this.fail('type mismatch', node);
            this.push('i32');
            return;
        }
        case 'ref.func':
            if (module.funcs[node.func] === undefined)
                this.fail('unknown function ' + node.func, node);
            if (this.refs[node.func] !== true)
                this.fail('undeclared function reference', node);
            this.push('funcref');
            return;
        }
        if (info.imm === 'memarg' || info.imm === 'memory' || info.imm === 'memory2') {
            this.memory(node);
            if (info.imm === 'memarg' && node.align > info.natural)
                this.fail('alignment must not be larger than natural', node);
        }
        if (info.params === null)
            throw new Error('no validation for ' + op);
        this.popAll(info.params, node);
        this.pushAll(info.results);
    };

    W.validate = function (module, source) {
        new Validator(module, source).run();
        return module;
    };
})(globalThis);
