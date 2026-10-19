// BASIC: statements become parts with labels and jumps (as in Forth);
// from them comes structured code (T.structure) or, with GOSUB or ON
// ERROR, a switch state machine with an error trap. Assembles the chunk
// of a unit: procedures and the main code.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Basic = T.basic;
    if (Basic.statementsReady)
        return;
    Basic.statementsReady = true;

    var J = T.J;
    var Compiler = Basic.Compiler;
    var Unit = Basic.Unit;
    var Scope = Basic.Scope;
    var DefTypes = Basic.DefTypes;
    var E = Basic.E;
    var literal = Basic.literal;
    var isNumeric = Basic.isNumeric;
    var kindOf = Basic.kindOf;
    var SUFFIXES = Basic.SUFFIXES;

    function B(name, args) {
        return J.method(J.id('$B'), name, args || []);
    }

    // --- Tree walk

    // All statement nodes (with nested bodies).
    function forEachStatement(list, callback) {
        list.forEach(function (node) {
            callback(node);
            switch (node.k) {
            case 'if':
                node.branches.forEach(function (branch) { forEachStatement(branch.body, callback); });
                if (node.otherwise !== null)
                    forEachStatement(node.otherwise, callback);
                break;
            case 'for':
            case 'do':
                forEachStatement(node.body, callback);
                break;
            case 'select':
                node.cases.forEach(function (item) { forEachStatement(item.body, callback); });
                if (node.otherwise !== null)
                    forEachStatement(node.otherwise, callback);
                break;
            }
        });
    }
    Basic.forEachStatement = forEachStatement;

    // All ref nodes in expressions and statements.
    function forEachNode(value, callback) {
        if (value === null || typeof value !== 'object')
            return;
        if (Array.isArray(value)) {
            for (var index = 0; index < value.length; ++index)
                forEachNode(value[index], callback);
            return;
        }
        if (value.k !== undefined)
            callback(value);
        for (var key in value) {
            if (key === 'line' || key === 'column' || key === 'source' || key === 'defs')
                continue;
            var child = value[key];
            if (child !== null && typeof child === 'object')
                forEachNode(child, callback);
        }
    }

    // Names that get assigned: the soft names of host modules do not hide
    // the variables of the program.
    function collectAssigned(list, unit) {
        forEachStatement(list, function (node) {
            var targets = [];
            switch (node.k) {
            case 'let':
            case 'lset':
                targets.push(node.target);
                break;
            case 'for':
                targets.push(node.variable);
                break;
            case 'input':
            case 'read':
                targets = targets.concat(node.targets);
                break;
            case 'swap':
                targets.push(node.a, node.b);
                break;
            case 'dim':
            case 'shared':
            case 'static':
                node.items.forEach(function (item) {
                    unit.assigned[item.name] = item.bounds !== null ? 'array' : 'scalar';
                });
                break;
            }
            targets.forEach(function (target) {
                if (target.k === 'ref' && target.chain.length === 0 && target.name.indexOf('.') < 0)
                    unit.assigned[target.name] = target.args !== null ? 'array' : 'scalar';
            });
        });
    }

    // --- Compiling a unit

    Compiler.prototype.compile = function () {
        var self = this;
        var program = this.program;
        this.defineTypes();
        this.declareProcedures();
        this.prescanModule();
        this.computeAsync();
        program.procedures.forEach(function (node) {
            var key = node.k === 'def' ? 'fn:' + node.name : node.name;
            self.compileProcedure(self.newProcs[key]);
        });
        this.compileMain();
        return this.assemble();
    };

    // CONST and DIM SHARED of the module level go before the procedures: the procedures see them.
    Compiler.prototype.prescanModule = function () {
        var self = this;
        var unit = new Unit(this, 'main');
        unit.deftypes = new DefTypes(this.session.deftypes);
        this.unit = unit;
        var prescanned = this.prescanned = new Set();
        var optionBase = this.optionBase;
        var visit = function (list, top) {
            list.forEach(function (node) {
                switch (node.k) {
                case 'deftype':
                    if (top)
                        unit.deftypes.apply(node);
                    break;
                case 'optionbase':
                    self.optionBase = node.base;
                    break;
                case 'const':
                    if (top) {
                        node.items.forEach(function (item) { self.defineConst(self.module, item, true); });
                        prescanned.add(node);
                    }
                    break;
                case 'dim':
                    if (node.shared) {
                        self.declareDim(node, true);
                        prescanned.add(node);
                    }
                    break;
                case 'if':
                    node.branches.forEach(function (branch) { visit(branch.body, false); });
                    if (node.otherwise !== null)
                        visit(node.otherwise, false);
                    break;
                case 'for':
                case 'do':
                    visit(node.body, false);
                    break;
                case 'select':
                    node.cases.forEach(function (item) { visit(item.body, false); });
                    if (node.otherwise !== null)
                        visit(node.otherwise, false);
                    break;
                }
            });
        };
        visit(this.program.items, true);
        this.optionBase = optionBase;
        this.unit = null;
    };

    // Asynchrony: a procedure waits (SLEEP, _DELAY, _LIMIT) or calls one
    // that waits. Waiting procedures are generators, called with yield*.
    Compiler.prototype.computeAsync = function () {
        var self = this;
        var info = new Map();
        var scan = function (body) {
            var result = { sleeps: false, calls: [] };
            forEachNode(body, function (node) {
                if (node.k === 'sleep')
                    result.sleeps = true;
                if (node.k === 'call' && node.target.chain.length === 0) {
                    var name = node.target.name;
                    if (name === '_delay' || name === '_limit' || name === '_display')
                        result.sleeps = true;
                    result.calls.push(name);
                }
                if (node.k === 'ref' && !node.keyword) {
                    result.calls.push(node.name);
                    if (node.name.substring(0, 2) === 'fn')
                        result.calls.push('fn:' + node.name);
                }
            });
            return result;
        };
        var procs = Object.keys(this.newProcs).map(function (key) { return self.newProcs[key]; });
        procs.forEach(function (proc) {
            var node = proc.node;
            info.set(proc, scan(node.body !== null ? node.body : node.expression));
        });
        var isAsync = function (calls) {
            return calls.some(function (name) {
                var proc = self.procs[name];
                return proc !== undefined && proc.async;
            });
        };
        for (var changed = true; changed;) {
            changed = false;
            procs.forEach(function (proc) {
                if (proc.async)
                    return;
                var found = info.get(proc);
                if (found.sleeps || isAsync(found.calls)) {
                    proc.async = true;
                    changed = true;
                }
            });
        }
        var main = scan(this.program.items);
        this.mainAsync = main.sleeps || isAsync(main.calls);
    };

    // The labels of a translation unit: name -> { id, node }.
    Compiler.prototype.collectLabels = function (list) {
        var unit = this.unit;
        var self = this;
        forEachStatement(list, function (node) {
            if (node.k !== 'label')
                return;
            if (unit.labels[node.name] !== undefined)
                self.fail('Duplicate label', node);
            unit.labels[node.name] = { id: unit.newLabel(), node: node };
        });
        var flags = { gosub: false, error: false };
        var referenced = unit.referenced = Object.create(null);
        forEachStatement(list, function (node) {
            if (node.k === 'gosub' || node.k === 'return' || (node.k === 'ongoto' && node.gosub))
                flags.gosub = true;
            if (node.k === 'onerror' || node.k === 'resume')
                flags.error = true;
            if (node.label !== undefined && node.label !== null && node.k !== 'label')
                referenced[node.label.name] = true;
            if (node.k === 'ongoto')
                node.labels.forEach(function (label) { referenced[label.name] = true; });
        });
        unit.machine = flags.gosub || flags.error;
        unit.errorMode = flags.error;
    };

    Compiler.prototype.labelId = function (reference) {
        var label = this.unit.labels[reference.name];
        if (label === undefined)
            this.fail('Label not defined', reference);
        return label.id;
    };

    // --- Parts

    Compiler.prototype.emit = function (generated, node) {
        var kind = generated.k;
        var statement = kind === 'expr' || kind === 'if' || kind === 'block' || kind === 'var' || kind === 'throw' ||
            kind === 'vars' ? generated : J.expr(generated);
        this.unit.items.push({ k: 's', node: J.at(statement, node.line, node.source) });
    };

    Compiler.prototype.label = function (id) {
        this.unit.items.push({ k: 'label', id: id });
    };

    Compiler.prototype.jump = function (id, test, node) {
        this.unit.items.push({ k: 'goto', id: id, test: test || null, line: node ? node.line : 0,
                               source: node ? node.source : undefined });
    };

    // A jump to a number computed at run time (RETURN, RESUME).
    Compiler.prototype.dynamicJump = function (target, node) {
        this.unit.items.push({ k: 'dyn', node: target, line: node.line, source: node.source });
    };

    Compiler.prototype.statements = function (list) {
        for (var index = 0; index < list.length; ++index)
            this.statement(list[index]);
    };

    Compiler.prototype.statement = function (node) {
        var unit = this.unit;
        if (node.k === 'label') {
            this.label(unit.labels[node.name].id);
            // "Name:" at the start of a line is a label; if it is a SUB
            // without parameters and nothing jumps to the label, it is a
            // call (as in QB64).
            var sub = node.number === null && !unit.referenced[node.name] ? this.lookupProc(node.name) : null;
            if (sub !== null && sub.kind === 'sub' && sub.params.length === 0)
                this.emit(this.callProcedure(sub, [], node, true).j, node);
            if (node.number !== null)
                unit.lastLineNumber = node.number;
            return;
        }
        if (unit.errorMode) {
            // The start of a statement is a branch of its own: RESUME and RESUME NEXT.
            var id = unit.newLabel();
            this.label(id);
            this.emit(J.assign(J.id('$cur'), J.num(id)), node);
            unit.statementStarts.push({ id: id, erl: unit.lastLineNumber });
        }
        var method = STATEMENTS[node.k];
        if (method === undefined)
            this.fail('Syntax error', node);
        method.call(this, node);
    };

    var STATEMENTS = {};
    Basic.STATEMENTS = STATEMENTS;

    STATEMENTS.data = function () {};

    STATEMENTS.let = function (node) {
        var target = node.target;
        if (target.k === 'ref' && target.name === 'mid' && target.suffix === '$' && target.args !== null) {
            if (target.args.length < 2 || target.args.length > 3)
                this.fail('Argument-count mismatch', target);
            var lv = this.lvalue(target.args[0]);
            if (lv.type !== 's')
                this.fail('Type mismatch', target);
            var start = this.convert(this.expr(target.args[1]), 'l', target.args[1]).j;
            var count = target.args.length === 3 ? this.convert(this.expr(target.args[2]), 'l', target.args[2]).j : J.undef();
            var value = this.string(this.value(this.expr(node.value)), node.value).j;
            this.emit(J.seq(lv.setup.concat([lv.set(J.call(J.path('$B.midAssign'), [lv.get, start, count, value]))])), node);
            return;
        }
        if (target.k === 'ref' && target.args !== null && target.chain.length === 0 && target.name.indexOf('.') < 0) {
            var objectVar = this.objectVariable(target.name, target.suffix);
            if (objectVar !== null) {
                var jsValue = this.toJsValue(this.expr(node.value), node.value).j;
                this.emit(B('jsi', [this.varRef(objectVar), J.arr(this.jsArguments(target.args)), jsValue]), node);
                return;
            }
        }
        var place = this.lvalue(target);
        this.emit(this.assignTo(place, this.expr(node.value), node.value), node);
    };

    STATEMENTS.lset = function (node) {
        var place = this.lvalue(node.target);
        if (place.type !== 's')
            this.fail('Type mismatch', node);
        var value = this.string(this.value(this.expr(node.value)), node.value).j;
        this.emit(J.seq(place.setup.concat([place.set(J.call(J.path('$B.lset'), [place.get, value, J.bool(node.right)]))])),
                  node);
    };

    STATEMENTS.call = function (node) {
        var target = node.target;
        var args = node.args;
        // A method of a JavaScript object: "object.method arguments".
        var dotted = this.splitDotted(target);
        if (dotted !== null || target.chain.length > 0) {
            var chain = dotted !== null ? dotted.chain : target.chain;
            var base = dotted !== null ? dotted.base : this.referenceBase(target);
            var last = chain[chain.length - 1];
            var objectE = chain.length > 1 ? this.chain(base, chain.slice(0, -1), target) : base;
            if (objectE.t !== 'o')
                this.fail('Expected: =', target);
            var callArgs = last.args !== null ? last.args : [];
            if (last.args !== null && args.length > 0)
                this.fail('Expected: end-of-statement', node);
            if (last.args === null)
                callArgs = args;
            this.emit(B('jc', [objectE.j, J.str(last.name), J.arr(this.jsArguments(callArgs))]), node);
            return;
        }
        if (target.args !== null) {
            if (args.length > 0)
                this.fail('Expected: end-of-statement', node);
            args = target.args;
            // "Name (x)" without CALL: x in parentheses goes by value, as in QBasic.
            if (!node.explicit && target.spaced && args.length === 1)
                args = [{ k: 'paren', arg: args[0], line: args[0].line, column: args[0].column, source: args[0].source }];
        }
        var name = target.name;
        var proc = this.lookupProc(name);
        if (proc !== null && proc.kind !== 'def') {
            if (target.suffix !== '' && (proc.kind === 'sub' || SUFFIXES[target.suffix] !== proc.type))
                this.fail('Duplicate definition', target);
            this.emit(this.callProcedure(proc, args, target, true).j, node);
            return;
        }
        var builtin = Basic.statementBuiltins[name + target.suffix];
        if (builtin !== undefined) {
            builtin.call(this, args, node);
            return;
        }
        var objectVar = this.objectVariable(name, target.suffix);
        if (objectVar !== null) {
            this.emit(B('ja', [this.varRef(objectVar), J.arr(this.jsArguments(args))]), node);
            return;
        }
        this.fail('Subprogram not defined', target);
    };

    // --- PRINT, WRITE, INPUT

    Compiler.prototype.printValue = function (node) {
        var expression = this.value(this.expr(node));
        if (expression.t === 's')
            return B('ps', [expression.j]);
        if (expression.t === 'o')
            return B('po', [expression.j]);
        if (!isNumeric(expression.t))
            this.fail('Type mismatch', node);
        expression = this.checked(expression);
        return B('pn', [expression.j, J.str(expression.t)]);
    };

    STATEMENTS.print = function (node) {
        if (node.channel !== null) {
            this.filePrint(node);
            return;
        }
        var self = this;
        var calls = [];
        var items = node.items;
        var newline = items.length === 0 || items[items.length - 1].k !== 'sep';
        if (node.using !== null) {
            var format = this.string(this.value(this.expr(node.using)), node.using).j;
            var values = [];
            items.forEach(function (item) {
                if (item.k !== 'expr')
                    return;
                var expression = self.value(self.expr(item.expr));
                if (expression.t === 'o')
                    expression = self.numeric(expression, item.expr);
                if (expression.t !== 's' && !isNumeric(expression.t))
                    self.fail('Type mismatch', item.expr);
                values.push(expression.t === 's' ? expression.j : self.checked(expression).j, J.str(expression.t));
            });
            this.emit(B('using', [format, J.arr(values), J.bool(newline)]), node);
            return;
        }
        items.forEach(function (item) {
            switch (item.k) {
            case 'sep':
                if (item.value === ',')
                    calls.push(B('pz'));
                break;
            case 'tab':
            case 'spc':
                calls.push(B(item.k, [self.convert(self.expr(item.arg), 'l', item.arg).j]));
                break;
            default:
                calls.push(self.printValue(item.expr));
            }
        });
        if (newline)
            calls.push(B('pe'));
        calls.forEach(function (call) { self.emit(call, node); });
    };

    STATEMENTS.write = function (node) {
        if (node.channel !== null) {
            this.fileWrite(node);
            return;
        }
        var self = this;
        var values = [];
        node.items.forEach(function (item) {
            var expression = self.value(self.expr(item));
            if (expression.t === 'o')
                expression = E('s', B('oshow', [expression.j]));
            if (expression.t !== 's' && !isNumeric(expression.t))
                self.fail('Type mismatch', item);
            values.push(expression.t === 's' ? expression.j : self.checked(expression).j, J.str(expression.t));
        });
        this.emit(B('writeValues', [J.arr(values)]), node);
    };

    STATEMENTS.input = function (node) {
        if (node.channel !== null) {
            this.fileInput(node);
            return;
        }
        var self = this;
        var places = node.targets.map(function (target) {
            var place = self.lvalue(target);
            if (node.lineInput && place.type !== 's')
                self.fail('Type mismatch', target);
            if (typeof place.type !== 'string' || place.type === 'o')
                self.fail('Type mismatch', target);
            return place;
        });
        var values = J.id(this.temp());
        this.emit(J.assign(values, B('input', [node.prompt !== null ? J.str(node.prompt) : J.str(''), J.bool(node.question),
                                               J.bool(node.keepLine),
                                               J.arr(places.map(function (place) { return J.str(place.type === 's' ? 's' : 'd'); })),
                                               J.bool(!!node.lineInput)])), node);
        places.forEach(function (place, index) {
            var value = E(place.type === 's' ? 's' : 'd', J.idx(values, J.num(index)));
            self.emit(self.assignTo(place, value, node.targets[index]), node);
        });
    };

    // --- Branches and loops

    STATEMENTS['if'] = function (node) {
        var unit = this.unit;
        var end = unit.newLabel();
        var self = this;
        node.branches.forEach(function (branch, index) {
            var last = index === node.branches.length - 1 && node.otherwise === null;
            var next = last ? end : unit.newLabel();
            var test = self.condition(branch.condition);
            self.jump(next, T.negate(test), branch.condition);
            self.statements(branch.body);
            if (!last) {
                self.jump(end, null, node);
                self.label(next);
            }
        });
        if (node.otherwise !== null)
            this.statements(node.otherwise);
        this.label(end);
    };

    Compiler.prototype.loop = function (kind, exit, body) {
        this.unit.loops.push({ kind: kind, exit: exit });
        try {
            this.statements(body);
        } finally {
            this.unit.loops.pop();
        }
    };

    // FOR: the end and the step are evaluated once, in the type of the
    // counter; after the last step the counter is past the limit (an
    // INTEGER up to 32767 overflows, as in QBasic).
    STATEMENTS['for'] = function (node) {
        var unit = this.unit;
        var place = this.lvalue(node.variable);
        if (!isNumeric(place.type))
            this.fail('Type mismatch', node.variable);
        if (place.setup.length > 0)
            this.fail('Expected: simple variable', node.variable);
        var type = place.type;
        var counter = place.get;
        this.emit(place.set(this.convert(this.expr(node.from), type, node.from).j), node);
        var to = this.convert(this.expr(node.to), type, node.to);
        var step = node.step !== null ? this.convert(this.expr(node.step), type, node.step) : literal(1, type);
        var limit = to.j, increment = step.j;
        if (to.c === undefined) {
            var limitName = J.id(this.temp());
            this.emit(J.assign(limitName, to.j), node);
            limit = limitName;
        }
        if (step.c === undefined) {
            var stepName = J.id(this.temp());
            this.emit(J.assign(stepName, step.j), node);
            increment = stepName;
        }
        var top = unit.newLabel(), exit = unit.newLabel();
        this.label(top);
        var test;
        if (step.c !== undefined)
            test = J.bin(step.c >= 0 ? '>' : '<', counter, limit);
        else
            test = J.cond(J.bin('>=', increment, J.num(0)), J.bin('>', counter, limit), J.bin('<', counter, limit));
        this.jump(exit, test, node);
        this.loop('FOR', exit, node.body);
        var nextNode = { line: node.nextLine, source: node.nextSource };
        var sum = this.arithmetic('+', E(type, counter), step.c !== undefined ? step : E(type, increment), node);
        var stored = type === 'f' || type === 'd' ? this.checked(sum) : sum;
        this.emit(place.set(stored.j), nextNode);
        this.jump(top, null, nextNode);
        this.label(exit);
    };

    STATEMENTS['do'] = function (node) {
        var unit = this.unit;
        var top = unit.newLabel(), exit = unit.newLabel();
        this.label(top);
        if (node.pre !== null) {
            var test = this.condition(node.pre.condition);
            this.jump(exit, node.pre.until ? test : T.negate(test), node.pre.condition);
        }
        this.loop('DO', exit, node.body);
        var loopNode = { line: node.loopLine, source: node.loopSource };
        if (node.post !== null) {
            var post = this.condition(node.post.condition);
            this.jump(top, node.post.until ? T.negate(post) : post, loopNode);
        } else {
            this.jump(top, null, loopNode);
        }
        this.label(exit);
    };

    STATEMENTS.select = function (node) {
        var unit = this.unit;
        var self = this;
        var subject = this.value(this.expr(node.subject));
        if (subject.t === 'o')
            subject = this.numeric(subject, node.subject);
        if (subject.t !== 's' && !isNumeric(subject.t))
            this.fail('Type mismatch', node.subject);
        subject = subject.t === 's' ? subject : this.checked(subject);
        var name = J.id(this.temp());
        this.emit(J.assign(name, subject.j), node);
        var current = E(subject.t, name);
        var end = unit.newLabel();
        node.cases.forEach(function (item) {
            var next = unit.newLabel();
            var tests = item.tests.map(function (test) {
                if (test.k === 'range') {
                    var low = self.compare('>=', current, self.value(self.expr(test.from)), test.from);
                    var high = self.compare('<=', current, self.value(self.expr(test.to)), test.to);
                    return J.and(low.j, high.j);
                }
                return self.compare(test.op, current, self.value(self.expr(test.value)), test.value).j;
            });
            var match = tests.reduce(function (all, test) { return all === null ? test : J.or(all, test); }, null);
            self.jump(next, T.negate(match), item);
            self.statements(item.body);
            self.jump(end, null, item);
            self.label(next);
        });
        if (node.otherwise !== null)
            this.statements(node.otherwise);
        this.label(end);
    };

    STATEMENTS['goto'] = function (node) {
        this.jump(this.labelId(node.label), null, node);
    };

    STATEMENTS.gosub = function (node) {
        var back = this.unit.newLabel();
        this.emit(J.method(J.id('$gs'), 'push', [J.num(back)]), node);
        this.jump(this.labelId(node.label), null, node);
        this.label(back);
    };

    STATEMENTS['return'] = function (node) {
        if (node.label !== null) {
            this.emit(B('back', [J.id('$gs')]), node);
            this.jump(this.labelId(node.label), null, node);
            return;
        }
        this.dynamicJump(B('back', [J.id('$gs')]), node);
    };

    STATEMENTS.ongoto = function (node) {
        var unit = this.unit;
        var self = this;
        var selector = J.id(this.temp());
        this.emit(J.assign(selector, B('onIndex', [this.convert(this.expr(node.selector), 'l', node.selector).j])), node);
        var back = node.gosub ? unit.newLabel() : 0;
        node.labels.forEach(function (label, index) {
            var target = self.labelId(label);
            var test = J.bin('===', selector, J.num(index + 1));
            if (!node.gosub) {
                self.jump(target, test, node);
                return;
            }
            var skip = unit.newLabel();
            self.jump(skip, T.negate(test), node);
            self.emit(J.method(J.id('$gs'), 'push', [J.num(back)]), node);
            self.jump(target, null, node);
            self.label(skip);
        });
        if (node.gosub)
            this.label(back);
    };

    STATEMENTS.onerror = function (node) {
        if (node.label === null) {
            this.emit(J.assign(J.id('$h'), J.num(0)), node);
            this.emit(J.if_(J.id('$ea'), J.expr(B('e', [J.mem(J.id('$B'), 'err')]))), node);
            return;
        }
        this.emit(J.assign(J.id('$h'), J.num(this.labelId(node.label))), node);
    };

    STATEMENTS.resume = function (node) {
        this.emit(J.if_(J.not(J.id('$ea')), J.expr(B('e', [J.num(20)]))), node);
        this.emit(J.assign(J.id('$ea'), J.bool(false)), node);
        this.emit(J.assign(J.mem(J.id('$B'), 'err'), J.num(0)), node);
        if (node.label !== null) {
            this.jump(this.labelId(node.label), null, node);
            return;
        }
        this.dynamicJump(J.id(node.next ? '$rn' : '$rc'), node);
    };

    STATEMENTS.error = function (node) {
        var code = this.convert(this.expr(node.code), 'i', node.code).j;
        this.emit(B('raise', [code]), node);
    };

    STATEMENTS.exit = function (node) {
        var unit = this.unit;
        var what = node.what;
        if (what === 'FOR' || what === 'DO') {
            for (var index = unit.loops.length - 1; index >= 0; --index) {
                if (unit.loops[index].kind === what) {
                    this.jump(unit.loops[index].exit, null, node);
                    return;
                }
            }
            this.fail('EXIT ' + what + ' not within ' + what + '...' + (what === 'FOR' ? 'NEXT' : 'LOOP'), node);
        }
        var kinds = { SUB: 'sub', FUNCTION: 'function', DEF: 'def' };
        if (unit.kind !== kinds[what])
            this.fail('EXIT ' + what + ' not within ' + what, node);
        this.jump(unit.endLabel, null, node);
    };

    STATEMENTS.end = function (node) {
        this.emit(B('end'), node);
    };

    // --- Declarations

    // DIM, REDIM, COMMON: variables and arrays; prescan - a declaration
    // without code (DIM SHARED before the procedures are translated).
    Compiler.prototype.declareDim = function (node, prescan) {
        var self = this;
        var unit = this.unit;
        var scope = unit.scope;
        var main = unit.kind === 'main';
        if (node.shared && !main)
            this.fail('Illegal in procedure', node);
        node.items.forEach(function (item) {
            var type, length = 0;
            if (item.type !== null) {
                var resolved = self.resolveType(item.type, item);
                type = resolved.type;
                length = resolved.length;
            } else if (item.suffix !== '') {
                type = SUFFIXES[item.suffix];
            } else {
                type = unit.deftypes.typeOf(item.name);
            }
            var key = item.name + '|' + (typeof type === 'string' ? type : 'r');
            if (item.bounds === null) {
                // A simple variable or a record.
                var previous = scope.declared[item.name];
                var own = Object.prototype.hasOwnProperty.call(scope.declared, item.name);
                if (item.type !== null) {
                    if (previous !== undefined && previous !== key && own && !prescan)
                        self.fail('Duplicate definition', item);
                    scope.declared[item.name] = key;
                }
                var variable;
                if (main) {
                    variable = scope.vars[key];
                    if (variable !== undefined && (variable.type !== type || variable.length !== length)) {
                        // The record type or the string length changed: a new variable.
                        variable = undefined;
                    }
                    if (variable === undefined) {
                        variable = new Basic.Variable(key, item.name, item.display, type, {
                            js: Basic.jsName('v', item.name, type), storage: 'module', length: length
                        });
                        scope.vars[key] = variable;
                    }
                    if (node.shared)
                        self.markGlobal(key);
                    if (!prescan)
                        self.useModule(variable);
                } else if (!prescan) {
                    if (scope.vars[key] !== undefined && Object.prototype.hasOwnProperty.call(scope.vars, key) &&
                        !scope.vars[key].implicitLocal)
                        self.fail('Duplicate definition', item);
                    variable = self.declareLocal(scope, key, item.name, item.display, type, length, false);
                }
                return;
            }
            // An array.
            if (item.type !== null || scope.declaredArrays[item.name] === undefined)
                scope.declaredArrays[item.name] = key;
            else
                key = scope.declaredArrays[item.name];
            var dims = item.bounds.length > 0 ? item.bounds.length : -1;
            var array;
            if (main || node.shared) {
                array = self.module.arrays[key];
                if (array !== undefined && (array.type !== type || array.length !== length))
                    array = undefined;
                if (array === undefined) {
                    array = new Basic.Variable(key, item.name, item.display, type, {
                        js: Basic.jsName('a', item.name, type), storage: 'module', array: true, dims: dims,
                        length: length
                    });
                    self.module.arrays[key] = array;
                }
                if (node.shared)
                    self.markGlobal(key);
            } else {
                array = scope.arrays[key];
                if (array === undefined)
                    array = self.declareLocalArray(scope, key, item.name, item.display, type, length, dims, false, false);
            }
            if (array.dims < 0)
                array.dims = dims;
            else if (dims >= 0 && array.dims !== dims)
                self.fail('Wrong number of dimensions', item);
            if (prescan)
                return;
            if (main)
                unit.usedArrays[array.js] = array;
            if (item.bounds.length === 0)
                return;
            self.emitDim(array, item, node.redim, node.preserve);
        });
    };

    Compiler.prototype.emitDim = function (array, item, redim, preserve) {
        var self = this;
        var bounds = [];
        var dynamic = redim || this.dynamicArrays === true;
        item.bounds.forEach(function (bound) {
            var lower = bound.lower !== null ? self.convert(self.expr(bound.lower), 'l', bound.lower)
                                             : literal(self.optionBase, 'l');
            var upper = self.convert(self.expr(bound.upper), 'l', bound.upper);
            if (lower.c === undefined || upper.c === undefined)
                dynamic = true;
            bounds.push(lower.j, upper.j);
        });
        this.emit(J.method(this.arrayRef(array), 'dim', [J.arr(bounds), J.bool(!!preserve), J.bool(dynamic)]), item);
    };

    STATEMENTS.dim = function (node) {
        if (this.prescanned.has(node)) {
            // Declared already; arrays get their sizes at run time.
            var self = this;
            node.items.forEach(function (item) {
                if (item.bounds !== null && item.bounds.length > 0) {
                    var key = self.module.declaredArrays[item.name];
                    var array = self.module.arrays[key];
                    self.unit.usedArrays[array.js] = array;
                    self.emitDim(array, item, node.redim, node.preserve);
                } else if (item.bounds === null) {
                    var scalarKey = self.module.declared[item.name] ||
                        item.name + '|' + (item.suffix !== '' ? SUFFIXES[item.suffix] : self.unit.deftypes.typeOf(item.name));
                    var variable = self.module.vars[scalarKey];
                    if (variable !== undefined)
                        self.useModule(variable);
                }
            });
            return;
        }
        this.declareDim(node, false);
    };

    STATEMENTS.shared = function (node) {
        var unit = this.unit;
        var self = this;
        if (unit.kind === 'main' || unit.kind === 'def')
            this.fail('Illegal outside of SUB, FUNCTION or DEF FN', node);
        node.items.forEach(function (item) {
            var type, length = 0;
            if (item.type !== null) {
                var resolved = self.resolveType(item.type, item);
                type = resolved.type;
                length = resolved.length;
            } else if (item.suffix !== '') {
                type = SUFFIXES[item.suffix];
            } else if (item.bounds !== null && self.module.declaredArrays[item.name] !== undefined) {
                type = null;
            } else if (item.bounds === null && self.module.declared[item.name] !== undefined) {
                type = null;
            } else {
                type = unit.deftypes.typeOf(item.name);
            }
            if (item.bounds !== null) {
                var arrayKey = type === null ? self.module.declaredArrays[item.name]
                                             : item.name + '|' + (typeof type === 'string' ? type : 'r');
                var array = self.module.arrays[arrayKey];
                if (array === undefined)
                    array = self.moduleArray(arrayKey, item.name, item.display, arrayKey.split('|')[1], length, -1, true);
                unit.scope.sharedArrays[arrayKey] = array;
                unit.scope.declaredArrays[item.name] = arrayKey;
                self.markShared(arrayKey);
                return;
            }
            var key = type === null ? self.module.declared[item.name]
                                    : item.name + '|' + (typeof type === 'string' ? type : 'r');
            var variable = self.module.vars[key];
            if (variable === undefined) {
                if (typeof type !== 'string')
                    self.fail('Type mismatch', item);
                variable = self.moduleVariable(key, item.name, item.display, type, length);
            }
            unit.scope.shared[key] = variable;
            if (item.type !== null || type === null)
                unit.scope.declared[item.name] = key;
            self.markShared(key);
        });
    };

    STATEMENTS['static'] = function (node) {
        var unit = this.unit;
        var self = this;
        if (unit.kind === 'main')
            this.fail('Illegal outside of SUB, FUNCTION or DEF FN', node);
        node.items.forEach(function (item) {
            var type, length = 0;
            if (item.type !== null) {
                var resolved = self.resolveType(item.type, item);
                type = resolved.type;
                length = resolved.length;
                unit.scope.declared[item.name] = item.name + '|' + (typeof type === 'string' ? type : 'r');
            } else {
                type = item.suffix !== '' ? SUFFIXES[item.suffix] : unit.deftypes.typeOf(item.name);
            }
            var key = item.name + '|' + (typeof type === 'string' ? type : 'r');
            if (item.bounds !== null) {
                unit.scope.declaredArrays[item.name] = key;
                self.declareLocalArray(unit.scope, key, item.name, item.display, type, length, -1, true, false);
                return;
            }
            self.declareLocal(unit.scope, key, item.name, item.display, type, length, true);
        });
    };

    STATEMENTS['const'] = function (node) {
        if (this.prescanned.has(node))
            return;
        var self = this;
        var scope = this.unit.scope;
        node.items.forEach(function (item) { self.defineConst(scope, item, true); });
    };

    STATEMENTS.deftype = function (node) {
        this.unit.deftypes.apply(node);
    };

    STATEMENTS.optionbase = function (node) {
        this.optionBase = node.base;
    };

    STATEMENTS.erase = function (node) {
        var self = this;
        node.names.forEach(function (name) {
            var array = self.array(name.name, name.suffix, name.name, name, -1, false);
            if (array === null)
                self.fail('Array not defined', name);
            self.emit(J.method(self.arrayRef(array), 'eraseArray', []), node);
        });
    };

    STATEMENTS.clear = function (node) {
        this.emit(B('clearProgram'), node);
    };

    // --- Data and the rest

    STATEMENTS.read = function (node) {
        var self = this;
        var data = this.constant(this.data);
        node.targets.forEach(function (target) {
            var place = self.lvalue(target);
            var value;
            if (place.type === 's')
                value = E('s', B('readString', [data]));
            else if (place.type === 'o')
                value = E('o', B('readString', [data]));
            else if (isNumeric(place.type))
                value = E('d', B('readNumber', [data]));
            else
                self.fail('Type mismatch', target);
            self.emit(self.assignTo(place, value, target), node);
        });
    };

    STATEMENTS.restore = function (node) {
        var data = this.constant(this.data);
        if (node.label === null) {
            this.emit(J.method(data, 'restore', [J.num(0)]), node);
            return;
        }
        var label = this.unit.labels[node.label.name];
        if (label === undefined)
            this.fail('Label not defined', node.label);
        this.emit(J.method(data, 'restore', [J.num(label.node.dataIndex)]), node);
    };

    STATEMENTS.swap = function (node) {
        var leftPlace = this.lvalue(node.a), rightPlace = this.lvalue(node.b);
        if (leftPlace.type !== rightPlace.type || leftPlace.member || rightPlace.member)
            this.fail('Type mismatch', node);
        var setup = leftPlace.setup.concat(rightPlace.setup);
        if (typeof leftPlace.type !== 'string') {
            var record = this.constant(leftPlace.type);
            var copy = J.id(this.temp());
            setup.push(J.assign(copy, J.method(record, 'copy', [leftPlace.get])),
                       J.method(record, 'assign', [leftPlace.get, rightPlace.get]),
                       J.method(record, 'assign', [rightPlace.get, copy]));
            this.emit(J.seq(setup), node);
            return;
        }
        var temporary = J.id(this.temp());
        var second = leftPlace.length > 0
            ? J.call(J.path('$B.fixed'), [rightPlace.get, J.num(leftPlace.length)])
            : rightPlace.get;
        var first = rightPlace.length > 0
            ? J.call(J.path('$B.fixed'), [temporary, J.num(rightPlace.length)])
            : temporary;
        setup.push(J.assign(temporary, leftPlace.get), leftPlace.set(second), rightPlace.set(first));
        this.emit(J.seq(setup), node);
    };

    STATEMENTS.randomize = function (node) {
        var seed = node.seed !== null ? this.convert(this.expr(node.seed), 'd', node.seed).j : B('timer');
        this.emit(B('randomize', [seed]), node);
    };

    STATEMENTS.sleep = function (node) {
        var time = node.time !== null ? this.convert(this.expr(node.time), 'd', node.time).j : J.num(0);
        this.wait('sleep', time, node);
    };

    // A wait: yield* in an asynchronous translation unit, otherwise in place.
    Compiler.prototype.wait = function (kind, value, node) {
        if (this.unit.async)
            this.emit(J.yield_(B(kind, [value]), true), node);
        else
            this.emit(B(kind + 'Now', [value]), node);
    };

    STATEMENTS.cls = function (node) {
        this.emit(B('cls'), node);
    };

    STATEMENTS.ignored = function (node) {
        var self = this;
        node.args.forEach(function (arg) {
            var expression = self.value(self.expr(arg));
            if (expression.c === undefined)
                self.emit(expression.j, node);
        });
    };

    // --- Files: read-only files of the host

    STATEMENTS.open = function (node) {
        var file = this.string(this.value(this.expr(node.file)), node.file).j;
        var number = this.convert(this.expr(node.number), 'l', node.number).j;
        this.emit(B('fileOpen', [file, J.str(node.mode), number]), node);
    };

    STATEMENTS.close = function (node) {
        var self = this;
        var numbers = node.numbers.map(function (item) { return self.convert(self.expr(item), 'l', item).j; });
        this.emit(B('fileClose', [J.arr(numbers)]), node);
    };

    // PRINT # and WRITE #: there are no files to write - an error at run time.
    Compiler.prototype.filePrint = function (node) {
        var self = this;
        node.items.forEach(function (item) {
            if (item.k === 'expr')
                self.value(self.expr(item.expr));
        });
        this.emit(B('fileWriteLine', [this.convert(this.expr(node.channel), 'l', node.channel).j]), node);
    };

    Compiler.prototype.fileWrite = function (node) {
        var self = this;
        node.items.forEach(function (item) { self.value(self.expr(item)); });
        this.emit(B('fileWriteLine', [this.convert(this.expr(node.channel), 'l', node.channel).j]), node);
    };

    // INPUT # and LINE INPUT #: values from a file by the rules of QBasic.
    Compiler.prototype.fileInput = function (node) {
        var self = this;
        var channel = J.id(this.temp());
        this.emit(J.assign(channel, this.convert(this.expr(node.channel), 'l', node.channel).j), node);
        node.targets.forEach(function (target) {
            var place = self.lvalue(target);
            var value;
            if (node.lineInput) {
                if (place.type !== 's')
                    self.fail('Type mismatch', target);
                value = E('s', B('fileLine', [channel]));
            } else if (place.type === 's' || place.type === 'o') {
                value = E(place.type, B('fileField', [channel, J.bool(false)]));
            } else if (isNumeric(place.type)) {
                value = E('d', B('val', [B('fileField', [channel, J.bool(true)])]));
            } else {
                self.fail('Type mismatch', target);
            }
            self.emit(self.assignTo(place, value, target), node);
        });
    };

    // --- Graphics

    Compiler.prototype.coordinate = function (node) {
        return this.convert(this.expr(node), 'd', node).j;
    };

    Compiler.prototype.graphicsPoint = function (point) {
        return [this.coordinate(point.x), this.coordinate(point.y), J.bool(point.relative)];
    };

    // A point "[STEP] (x, y)" as an object { x, y, relative }.
    Compiler.prototype.pointObject = function (point) {
        return J.obj([['x', this.coordinate(point.x)], ['y', this.coordinate(point.y)], ['relative', J.bool(point.relative)]]);
    };

    Compiler.prototype.optionalColor = function (node) {
        return node === null ? J.nul() : this.convert(this.expr(node), 'l', node).j;
    };

    Compiler.prototype.optionalNumber = function (node) {
        return node === null ? J.nul() : this.convert(this.expr(node), 'd', node).j;
    };

    function screen() {
        return B('g');
    }

    STATEMENTS.screen = function (node) {
        var mode = this.value(this.expr(node.mode));
        if (mode.t === 'o')
            this.emit(B('screenImage', [mode.j]), node);
        else
            this.emit(B('screen', [this.convert(mode, 'i', node.mode).j]), node);
    };

    STATEMENTS.pset = function (node) {
        var point = this.graphicsPoint(node.point);
        this.emit(J.method(screen(), 'pset', point.concat([this.optionalColor(node.color), J.bool(node.reset)])), node);
    };

    STATEMENTS.line = function (node) {
        var from = node.from === null ? J.nul() : this.pointObject(node.from);
        var style = node.style === null ? J.nul() : this.convert(this.expr(node.style), 'l', node.style).j;
        this.emit(J.method(screen(), 'line', [from, this.pointObject(node.to), this.optionalColor(node.color),
                                              J.str(node.box), style]), node);
    };

    STATEMENTS.circle = function (node) {
        this.emit(J.method(screen(), 'circle', [this.pointObject(node.center), this.coordinate(node.radius),
                                                 this.optionalColor(node.color),
                                                 this.optionalNumber(node.start), this.optionalNumber(node.end),
                                                 this.optionalNumber(node.aspect)]), node);
    };

    STATEMENTS.paint = function (node) {
        if (node.color !== null && this.value(this.expr(node.color)).t === 's')
            this.fail('Advanced feature unavailable', node.color);
        this.emit(J.method(screen(), 'paint', [this.pointObject(node.point), this.optionalColor(node.color),
                                               this.optionalColor(node.border)]), node);
    };

    STATEMENTS.color = function (node) {
        var args = node.args;
        this.emit(B('colorStatement', [this.optionalColor(args[0] || null), this.optionalColor(args[1] || null)]), node);
    };

    STATEMENTS.palette = function (node) {
        if (node.args.length === 0) {
            this.emit(J.method(screen(), 'setPalette', [J.nul(), J.nul()]), node);
            return;
        }
        this.emit(J.method(screen(), 'setPalette', [this.convert(this.expr(node.args[0]), 'l', node.args[0]).j,
                                                    this.convert(this.expr(node.args[1]), 'l', node.args[1]).j]), node);
    };

    STATEMENTS.draw = function (node) {
        this.emit(J.method(screen(), 'draw', [this.string(this.value(this.expr(node.commands)), node.commands).j]), node);
    };

    STATEMENTS.window = function (node) {
        if (node.from === null) {
            this.emit(J.method(screen(), 'setWindow', [J.bool(false), J.nul(), J.nul(), J.nul(), J.nul()]), node);
            return;
        }
        this.emit(J.method(screen(), 'setWindow', [J.bool(node.screen), this.coordinate(node.from.x),
                                                   this.coordinate(node.from.y), this.coordinate(node.to.x),
                                                   this.coordinate(node.to.y)]), node);
    };

    // --- Translation units

    Compiler.prototype.beginUnit = function (unit, list) {
        this.unit = unit;
        collectAssigned(list, unit);
        this.collectLabels(list);
        unit.endLabel = unit.newLabel();
    };

    // The body of a translation unit: structured code or a state machine.
    Compiler.prototype.unitBody = function (unit) {
        this.label(unit.endLabel);
        if (!unit.machine)
            return T.structure(unit.items, [J.brk('$run')]);
        return this.machine(unit);
    };

    // The state machine: a branch per label, a jump changes $pc. With ON
    // ERROR - a trap: an error leads to the handler, RESUME to the start of
    // the failed statement ($rc) or of the next one ($rn).
    Compiler.prototype.machine = function (unit) {
        var cases = [{ test: J.num(0), body: [] }];
        unit.items.forEach(function (item) {
            if (item.k === 'label') {
                cases.push({ test: J.num(item.id), body: [] });
                return;
            }
            var body = cases[cases.length - 1].body;
            if (item.k === 's') {
                body.push(item.node);
                return;
            }
            var target = item.k === 'dyn' ? item.node : J.num(item.id);
            var jump = J.block([J.expr(J.assign(J.id('$pc'), target)), J.cont('$run')]);
            body.push(J.at(item.test ? J.if_(item.test, jump) : jump, item.line, item.source));
        });
        var dispatch = [J.switch_(J.id('$pc'), cases), J.brk('$run')];
        var declarations = [J.var_('$pc', J.num(0)), J.var_('$gs', J.arr([]))];
        if (!unit.errorMode)
            return declarations.concat([J.label('$run', J.for_(null, null, null, J.block(dispatch)))]);
        // The next statement and the line number (ERL) for each one.
        var next = {}, erl = {};
        unit.statementStarts.forEach(function (start, index) {
            var following = unit.statementStarts[index + 1];
            next[start.id] = following !== undefined ? following.id : unit.endLabel;
            erl[start.id] = start.erl;
        });
        var tables = this.constant({ next: next, erl: erl });
        var handler = [
            J.expr(J.assign(J.id('$pc'), B('trap', [J.id('$e'), J.id('$h'), J.id('$ea'), J.id('$cur'), tables]))),
            J.expr(J.assign(J.id('$ea'), J.bool(true))),
            J.expr(J.assign(J.id('$rc'), J.id('$cur'))),
            J.expr(J.assign(J.id('$rn'), J.idx(J.mem(tables, 'next'), J.id('$cur'))))
        ];
        return declarations.concat([
            J.var_('$h', J.num(0)), J.var_('$ea', J.bool(false)), J.var_('$cur', J.num(0)), J.var_('$rc', J.num(0)),
            J.var_('$rn', J.num(0)),
            J.label('$run', J.for_(null, null, null, J.block([J.try_(dispatch, '$e', handler)]))),
            J.if_(J.id('$ea'), J.expr(B('e', [J.num(19)])))
        ]);
    };

    // Declarations of the locals: default values.
    Compiler.prototype.initialValue = function (variable) {
        if (variable.array) {
            var array = B('array', [J.str(kindOf(variable.type)), J.num(variable.length),
                                    typeof variable.type === 'string' ? J.nul() : this.constant(variable.type)]);
            if (variable.implicit)
                return J.method(array, 'dim', [J.arr(this.implicitBounds(variable)), J.bool(false), J.bool(false)]);
            return array;
        }
        if (typeof variable.type !== 'string')
            return J.method(this.constant(variable.type), 'create', []);
        switch (variable.type) {
        case 's':
            return J.str(variable.length > 0 ? new Array(variable.length + 1).join(' ') : '');
        case 'o':
            return J.nul();
        }
        return J.num(0);
    };

    Compiler.prototype.implicitBounds = function (variable) {
        var bounds = [];
        for (var index = 0; index < Math.max(variable.dims, 1); ++index)
            bounds.push(J.num(this.optionBase), J.num(10));
        return bounds;
    };

    // A procedure: function p_name(parameters), or function* for one that waits.
    Compiler.prototype.compileProcedure = function (proc) {
        var self = this;
        var node = proc.node;
        var unit = new Unit(this, proc.kind, proc);
        unit.async = proc.async;
        unit.isStaticProc = !!node.isStatic;
        unit.deftypes = new DefTypes(proc.deftypes);
        unit.calls = Object.create(null);
        var body = node.body !== null ? node.body : [];
        this.beginUnit(unit, body);
        var scope = unit.scope;
        var params = proc.params.map(function (param) {
            var key = param.name + '|' + (typeof param.type === 'string' ? param.type : 'r');
            var variable = new Basic.Variable(key, param.name, param.display, param.type, {
                js: Basic.jsName(param.array ? 'a' : 'v', param.name, param.type), storage: 'param', array: param.array,
                byval: param.byval
            });
            if (param.array) {
                scope.arrays[key] = variable;
                if (param.explicit || param.suffix === '')
                    scope.declaredArrays[param.name] = key;
            } else {
                scope.vars[key] = variable;
                if (param.explicit)
                    scope.declared[param.name] = key;
            }
            return variable;
        });
        if (proc.kind === 'def' && node.expression !== null) {
            var result = this.convert(this.expr(node.expression), proc.type, node.expression);
            this.emit(J.assign(J.id('$r'), result.j), node);
        } else {
            this.statements(body);
        }
        var statements = this.unitBody(unit);
        var head = unit.temps.declarations();
        unit.locals.forEach(function (variable) {
            head.push(J.var_(variable.js, self.initialValue(variable)));
        });
        if (proc.kind !== 'sub')
            head.push(J.var_('$r', proc.type === 's' ? J.str('') : (proc.type === 'o' ? J.nul() : J.num(0))));
        Object.keys(unit.usedArrays).forEach(function (js) {
            var array = unit.usedArrays[js];
            if (array.storage === 'module')
                head.push(J.var_(js, J.mem(J.id('$V'), js)));
        });
        var tail = [];
        if (proc.kind !== 'def') {
            params.forEach(function (variable, index) {
                if (!variable.array && !variable.byval && typeof variable.type === 'string')
                    tail.push(J.expr(J.assign(J.idx(J.mem(J.id('$B'), 'o'), J.num(index)), J.id(variable.js))));
            });
        }
        if (proc.kind !== 'sub')
            tail.push(J.ret(J.id('$r')));
        var fn = J.fnDecl(proc.js, params.map(function (variable) { return variable.js; }),
                          head.concat(statements).concat(tail), proc.async);
        T.setSource(fn, this.source);
        fn.line = node.line;
        this.chunk.push({ proc: proc, fn: fn, statics: unit.statics });
        proc.calls = unit.calls;
        this.unit = null;
    };

    Compiler.prototype.compileMain = function () {
        var self = this;
        var unit = new Unit(this, 'main');
        unit.async = this.mainAsync;
        unit.deftypes = new DefTypes(this.session.deftypes);
        unit.calls = Object.create(null);
        this.mainUnit = unit;
        this.beginUnit(unit, this.program.items);
        this.statements(this.program.items);
        var statements = this.unitBody(unit);
        var head = unit.temps.declarations();
        var tail = [];
        Object.keys(unit.used).forEach(function (js) {
            var variable = unit.used[js];
            if (self.isShared(variable.key))
                return;
            head.push(J.var_(js, J.mem(J.id('$V'), js)));
            if (typeof variable.type === 'string')
                tail.push(J.expr(J.assign(J.mem(J.id('$V'), js), J.id(js))));
        });
        Object.keys(unit.usedArrays).forEach(function (js) {
            head.push(J.var_(js, J.mem(J.id('$V'), js)));
        });
        var body = tail.length > 0 ? [J.try_(statements, null, null, tail)] : statements;
        this.mainFunction = J.fnDecl('$main', [], head.concat(body), unit.async);
        T.setSource(this.mainFunction, this.source);
        this.finalDefTypes = unit.deftypes;
        this.unit = null;
    };

    // The chunk: function ($B, $V, $P, $D) { constants; procedures; return { main, procs } }.
    Compiler.prototype.assemble = function () {
        var self = this;
        var statements = [];
        var constants = this.constants.map(function (value, index) {
            return { name: '$c' + index, init: J.idx(J.id('$D'), J.num(index)) };
        });
        // Constants may appear during assembly - their list is built after the procedures.
        var procedures = [];
        this.chunk.forEach(function (item) {
            item.statics.forEach(function (variable) {
                statements.push(J.var_(variable.js, self.initialValue(variable)));
            });
            procedures.push(item.fn);
        });
        var exported = J.obj([['main', J.id('$main')], ['procs', J.obj(this.chunk.map(function (item) {
            return [item.proc.js, J.id(item.proc.js)];
        }))]]);
        constants = this.constants.map(function (value, index) {
            return { name: '$c' + index, init: J.idx(J.id('$D'), J.num(index)) };
        });
        var all = [];
        if (constants.length > 0)
            all.push(J.vars(constants));
        return {
            statements: all.concat(statements).concat(procedures).concat([this.mainFunction, J.ret(exported)]),
            constants: this.constants
        };
    };
})(globalThis);
