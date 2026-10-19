// Scheme: translation of IR into JavaScript in continuation-passing style (CPS).
//
// A Scheme procedure is a JavaScript function ($k, arguments...) where $k
// is the continuation: a function of one value. All procedure calls are
// return f(...); the JavaScript stack grows until the depth counter $S.d
// exceeds LIMIT; then the function returns a Bounce, and the machine loop
// (machine.js) goes on with an empty stack. Built-in procedures that call
// no Scheme procedures are plain expressions: a continuation is needed only
// around procedure calls. Design: docs/internals/scheme.md.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var S = T.scheme;
    if (S.Compiler)
        return;

    var J = T.J;
    var LIMIT = 120;
    S.LIMIT = LIMIT;

    // --- Simple nodes: a value without a Scheme procedure call

    function isSimple(node) {
        if (node.s !== undefined)
            return node.s;
        var result;
        switch (node.t) {
        case 'const':
        case 'lref':
        case 'gref':
        case 'prim':
        case 'lambda':
        case 'case-lambda':
            result = true;
            break;
        case 'lset':
        case 'gset':
            result = isSimple(node.e);
            break;
        case 'if':
            result = isSimple(node.c) && isSimple(node.a) && isSimple(node.b);
            break;
        case 'seq':
            result = node.list.every(isSimple);
            break;
        case 'pcall':
            result = !node.p.cps && node.args.every(isSimple);
            break;
        case 'let':
            result = node.inits.every(isSimple) && isSimple(node.body);
            break;
        case 'body':
            result = node.items.every(isSimple);
            break;
        default:
            result = false;
        }
        node.s = result;
        return result;
    }

    // The node gives a JavaScript boolean (usable in if without !== false).
    function isBoolean(node) {
        if (node.t === 'const')
            return typeof node.value === 'boolean';
        if (node.t === 'pcall')
            return node.p.bool === true && arityOk(node.p, node.args.length);
        if (node.t === 'if')
            return isBoolean(node.a) && isBoolean(node.b);
        return false;
    }

    function arityOk(primitive, count) {
        return count >= primitive.min && (primitive.max < 0 || count <= primitive.max);
    }

    // A tail call to itself with simple arguments is a loop step, not a function.
    function isLoopJump(node, self) {
        if (self === null || node.t !== 'call' || !node.args.every(isSimple))
            return false;
        return (self.v !== undefined && node.f.t === 'lref' && node.f.v === self.v) ||
            (self.cell !== undefined && node.f.t === 'gref' && node.f.cell === self.cell);
    }

    // Whether the body of a loop procedure has functions (lambdas or
    // continuations) - then the loop variables are copied at every step.
    function loopMakesFunctions(node, self, tail) {
        switch (node.t) {
        case 'call':
            if (tail && isLoopJump(node, self))
                return false;
            return true;
        case 'if':
            return makesFunctions(node.c) || loopMakesFunctions(node.a, self, tail) || loopMakesFunctions(node.b, self, tail);
        case 'seq':
            return node.list.some(function (item, index) {
                return loopMakesFunctions(item, self, tail && index === node.list.length - 1);
            });
        case 'body':
            return node.items.some(function (item, index) {
                return loopMakesFunctions(item, self, tail && index === node.items.length - 1);
            });
        case 'let':
            return node.inits.some(makesFunctions) || loopMakesFunctions(node.body, self, tail);
        }
        return makesFunctions(node);
    }

    // Whether a node has functions (lambdas or continuations).
    function makesFunctions(node) {
        if (node.mf !== undefined)
            return node.mf;
        var result;
        switch (node.t) {
        case 'lambda':
        case 'case-lambda':
            result = true;
            break;
        case 'const':
        case 'lref':
        case 'gref':
        case 'prim':
            result = false;
            break;
        case 'lset':
        case 'gset':
            result = makesFunctions(node.e);
            break;
        case 'if':
            result = makesFunctions(node.c) || makesFunctions(node.a) || makesFunctions(node.b);
            break;
        case 'seq':
            result = node.list.some(makesFunctions);
            break;
        case 'body':
            result = node.items.some(makesFunctions);
            break;
        case 'let':
            result = node.inits.some(makesFunctions) || makesFunctions(node.body);
            break;
        case 'pcall':
            result = node.p.cps || node.args.some(makesFunctions);
            break;
        default:
            result = true;
        }
        if (!result && !isSimple(node))
            result = true;
        node.mf = result;
        return result;
    }

    // --- The JavaScript function being built

    function Fn(compiler, parent, isLambda) {
        this.c = compiler;
        this.parent = parent;
        this.temps = [];
        this.lambda = isLambda ? this : parent.lambda;
        this.selfVar = null;
        this.selfCell = null;
        this.selfName = null;
        this.loop = null;          // { label, params } of a loop procedure
    }
    Fn.prototype.temp = function () {
        var name = '$t' + (++this.c.counter);
        this.temps.push(name);
        return name;
    };
    Fn.prototype.declarations = function () {
        if (this.temps.length === 0)
            return [];
        return [J.vars(this.temps.map(function (name) { return { name: name, init: null }; }), 'let')];
    };

    // An expression that can be repeated: a name or a literal; otherwise a temporary.
    function once(node, fn, setup) {
        if (node.k === 'id' || node.k === 'num' || node.k === 'str' || node.k === 'bool' || node.k === 'null' ||
            node.k === 'undef')
            return node;
        var name = fn.temp();
        setup.push(J.assign(J.id(name), node));
        return J.id(name);
    }
    function withSetup(setup, node) {
        return setup.length === 0 ? node : J.seq(setup.concat([node]));
    }

    // --- The compiler

    function Compiler(session, options) {
        this.session = session;
        this.options = options || {};
        this.counter = 0;
        this.constants = [];
        this.constantIndex = new Map();
        this.source = this.options.source || '';
        this.places = new Map();
    }

    // A value among the chunk constants: the name of a local variable of the chunk.
    Compiler.prototype.constant = function (value) {
        var index = this.constantIndex.get(value);
        if (index === undefined) {
            index = this.constants.length;
            this.constants.push(value);
            this.constantIndex.set(value, index);
        }
        return J.id('$c' + index);
    };

    Compiler.prototype.next = function () {
        return ++this.counter;
    };

    function at(statement, line) {
        if (line)
            statement.line = line;
        return statement;
    }

    function depthCheck(selfName, args) {
        return J.if_(J.bin('>', J.update('++', true, J.mem(J.id('$S'), 'd')), J.num(LIMIT)),
                     J.ret(J.call(J.mem(J.id('$S'), 'bounce'), [J.id(selfName), args])));
    }

    // --- Simple expressions

    Compiler.prototype.literal = function (value) {
        if (typeof value === 'number') {
            if (value === 0 && 1 / value < 0)
                return this.constant(value);
            return value < 0 ? J.un('-', J.num(-value)) : J.num(value);
        }
        if (typeof value === 'boolean')
            return J.bool(value);
        if (value === S.NIL)
            return J.id('$NIL');
        if (value === S.UNSPEC)
            return J.id('$U');
        return this.constant(value);
    };

    Compiler.prototype.simple = function (node, fn, line) {
        var self = this;
        switch (node.t) {
        case 'const':
            return this.literal(node.value);
        case 'lref':
            return J.id(node.v.js);
        case 'gref':
            return this.globalRef(node.cell, fn);
        case 'prim':
            return this.constant(S.procOf(node.p));
        case 'lambda':
            return this.lambda(node, fn, null);
        case 'case-lambda':
            return this.caseLambda(node, fn);
        case 'lset':
            return J.seq([J.assign(J.id(node.v.js), this.simple(node.e, fn, line)), J.id('$U')]);
        case 'gset':
            return this.globalSet(node, this.simple(node.e, fn, line), fn);
        case 'if':
            return J.cond(this.test(node.c, fn, line), this.simple(node.a, fn, line), this.simple(node.b, fn, line));
        case 'seq':
            return J.seq(node.list.map(function (item) { return self.simple(item, fn, line); }));
        case 'pcall':
            return this.primitiveCall(node.p, node.args.map(function (arg) { return self.simple(arg, fn, node.line || line); }),
                                      fn, node.line || line);
        case 'let': {
            // In an expression let is assignments to variables of the function.
            var parts = [];
            node.vars.forEach(function (variable, index) {
                fn.temps.push(variable.js);
                parts.push(J.assign(J.id(variable.js), self.simple(node.inits[index], fn, line)));
            });
            parts.push(this.simple(node.body, fn, line));
            return J.seq(parts);
        }
        case 'body': {
            node.vars.forEach(function (variable) { fn.temps.push(variable.js); });
            return J.seq(node.items.map(function (item) { return self.simple(item, fn, line); }));
        }
        }
        throw new Error('not a simple node: ' + node.t);
    };

    // The condition of if: a JavaScript boolean.
    Compiler.prototype.test = function (node, fn, line) {
        var condition = this.simple(node, fn, line);
        if (isBoolean(node))
            return condition;
        if (node.t === 'pcall' && node.p.name === 'not' && node.args.length === 1)
            return condition;
        return J.bin('!==', condition, J.bool(false));
    };

    Compiler.prototype.globalRef = function (cell, fn) {
        var ref = this.constant(cell);
        if (cell.v !== undefined)
            return J.mem(ref, 'v');
        return J.cond(J.bin('!==', J.mem(ref, 'v'), J.undef()), J.mem(ref, 'v'), J.call(J.mem(J.id('$S'), 'unbound'), [ref]));
    };

    Compiler.prototype.globalSet = function (node, value, fn) {
        var ref = this.constant(node.cell);
        if (node.define || node.cell.v !== undefined)
            return J.seq([J.assign(J.mem(ref, 'v'), value), J.id('$U')]);
        return J.call(J.mem(J.id('$S'), 'setGlobal'), [ref, value]);
    };

    // A call of a built-in procedure (not CPS) is an expression.
    Compiler.prototype.primitiveCall = function (primitive, args, fn, line) {
        if (!arityOk(primitive, args.length))
            return J.call(J.mem(J.id('$S'), 'primitiveArity'),
                          [J.str(primitive.name), J.num(args.length)].concat(args));
        if (primitive.inline) {
            var inlined = primitive.inline(args, fn, this);
            if (inlined !== null && inlined !== undefined)
                return inlined;
        }
        return J.call(this.constant(primitive.fn), args);
    };

    // --- Lambda

    function procName(compiler, name) {
        var id = compiler.next();
        return '$f' + id + (name ? '_' + name.replace(/[^A-Za-z0-9_]/g, '$').substring(0, 20) : '');
    }

    // self - { v } or { cell }: the variable through which the procedure
    // calls itself (a tail call to itself is a loop).
    Compiler.prototype.lambda = function (node, fn, self) {
        var name = procName(this, node.name);
        if (node.name)
            S.procNames[name] = node.name;
        var inner = new Fn(this, fn, true);
        inner.selfName = name;
        if (self !== null) {
            inner.selfVar = self.v || null;
            inner.selfCell = self.cell || null;
        }
        var params = node.params.map(function (variable) { return variable.js; });
        var prologue = [];
        var line = node.line;
        if (node.rest === null) {
            var allParams = ['$k'].concat(params).concat(['$x']);
            var missing = params.length > 0 ? J.bin('===', J.id(params[params.length - 1]), J.undef()) : null;
            var extra = J.bin('!==', J.id('$x'), J.undef());
            prologue.push(J.if_(missing === null ? extra : J.or(missing, extra),
                                J.ret(J.call(J.mem(J.id('$S'), 'arity'),
                                             [J.id(name), J.arr(params.map(function (param) {
                                                 return J.id(param);
                                             })), J.id('$x')]))));
            var body = [];
            var canLoop = self !== null && params.length > 0;
            inner.loop = canLoop ? { label: '$L' + this.next(), params: node.params, used: false, copy: false } : null;
            var bodyParams = params;
            if (canLoop && loopMakesFunctions(node.body, self, true)) {
                // The loop variables are new at every step: closures and
                // continuations see the values of their step.
                inner.loop.copy = true;
                bodyParams = params.map(function (param) { return param + '$'; });
                allParams = ['$k'].concat(bodyParams).concat(['$x']);
                prologue = [J.if_(J.or(J.bin('===', J.id(bodyParams[bodyParams.length - 1]), J.undef()), extra),
                                  J.ret(J.call(J.mem(J.id('$S'), 'arity'),
                                               [J.id(name), J.arr(bodyParams.map(function (param) {
                                                   return J.id(param);
                                               })),
                                                J.id('$x')])))];
            }
            inner.loop && (inner.loop.paramNames = bodyParams);
            this.compile(node.body, { tail: true, k: J.id('$k') }, inner, body, line);
            var check = depthCheck(name, J.arr([J.id('$k')].concat(bodyParams.map(function (param) {
                return J.id(param);
            }))));
            var functionBody;
            if (inner.loop !== null && inner.loop.used) {
                var loopBody = [check];
                if (inner.loop.copy)
                    loopBody.push(J.vars(params.map(function (param, index) {
                        return { name: param, init: J.id(bodyParams[index]) };
                    }), 'let'));
                loopBody = loopBody.concat(inner.declarations()).concat(body);
                functionBody = prologue.concat([J.label(inner.loop.label, J.for_(null, null, null, J.block(loopBody)))]);
            } else {
                var copies = inner.loop !== null && inner.loop.copy
                    ? [J.vars(params.map(function (param, index) {
                        return { name: param, init: J.id(bodyParams[index]) };
                    }), 'let')] : [];
                functionBody = prologue.concat([check]).concat(copies).concat(inner.declarations()).concat(body);
            }
            return J.fn(name, allParams, functionBody);
        }
        // With a rest: (lambda (a . rest) ...) - through arguments.
        var restParams = ['$k'].concat(params);
        if (params.length > 0) {
            prologue.push(J.if_(J.bin('===', J.id(params[params.length - 1]), J.undef()),
                                J.ret(J.call(J.mem(J.id('$S'), 'arity'),
                                             [J.id(name), J.arr(params.map(function (param) {
                                                 return J.id(param);
                                             })), J.undef()]))));
        }
        prologue.push(depthCheck(name, J.id('arguments')));
        prologue.push(J.let_(node.rest.js, J.call(J.mem(J.id('$S'), 'rest'), [J.id('arguments'), J.num(params.length + 1)])));
        var restBody = [];
        this.compile(node.body, { tail: true, k: J.id('$k') }, inner, restBody, line);
        return J.fn(name, restParams, prologue.concat(inner.declarations()).concat(restBody));
    };

    Compiler.prototype.caseLambda = function (node, fn) {
        var self = this;
        var name = node.name || '';
        var clauses = node.clauses.map(function (clause) { return self.lambda(clause, fn, null); });
        var arities = node.clauses.map(function (clause) {
            return J.arr([J.num(clause.params.length), J.bool(clause.rest !== null)]);
        });
        return J.call(J.mem(J.id('$S'), 'caseLambda'), [J.arr(clauses), J.arr(arities), J.str(name)]);
    };

    // --- Continuations
    //
    // cont - { tail: true, k: a function expression } or { tail: false,
    // bind: function (value, list, fn) } - a translation-time continuation:
    // it appends the code that got the value.

    Compiler.prototype.deliver = function (cont, value, fn, list, line) {
        if (cont.tail) {
            list.push(at(J.ret(J.call(cont.k, [value])), line));
            return;
        }
        cont.bind(value, list, fn);
    };

    // A continuation as a JavaScript function (for a procedure call).
    Compiler.prototype.reify = function (cont, fn, line) {
        if (cont.tail)
            return cont.k;
        var id = this.next();
        var name = '$k' + id;
        var param = '$v' + id;
        var inner = new Fn(this, fn, false);
        var body = [];
        cont.bind(J.id(param), body, inner);
        var statements = [depthCheck(name, J.arr([J.id(param)]))].concat(inner.declarations()).concat(body);
        return J.fn(name, [param], statements);
    };

    // A continuation that can be called from several places (if branches).
    Compiler.prototype.shareable = function (cont, fn, list, line) {
        if (cont.tail)
            return cont;
        var fnExpr = this.reify(cont, fn, line);
        var name = fnExpr.name;
        list.push(at(J.let_(name + '$', fnExpr), line));
        return { tail: true, k: J.id(name + '$') };
    };

    // --- Translating a node into statements: control goes to cont

    Compiler.prototype.compile = function (node, cont, fn, list, line) {
        var self = this;
        if (node.line)
            line = node.line;
        if (isSimple(node) && node.t !== 'let' && node.t !== 'body' && node.t !== 'seq' && node.t !== 'if') {
            this.deliver(cont, this.simple(node, fn, line), fn, list, line);
            return;
        }
        switch (node.t) {
        case 'if':
            return this.compileIf(node, cont, fn, list, line);
        case 'seq':
            return this.compileSeq(node.list, cont, fn, list, line);
        case 'let':
            return this.compileLet(node, cont, fn, list, line);
        case 'body': {
            if (node.vars.length > 0)
                list.push(at(J.vars(node.vars.map(function (variable) {
                    return { name: variable.js, init: null };
                }), 'let'), line));
            return this.compileSeq(node.items, cont, fn, list, line);
        }
        case 'lset':
            if (node.e.t === 'lambda' && node.v.sets === 1) {
                list.push(at(J.expr(J.assign(J.id(node.v.js), this.lambda(node.e, fn, { v: node.v }))), line));
                this.deliver(cont, J.id('$U'), fn, list, line);
                return;
            }
            return this.compile(node.e, this.bindValue(function (value, list2, fn2) {
                list2.push(at(J.expr(J.assign(J.id(node.v.js), value)), line));
                self.deliver(cont, J.id('$U'), fn2, list2, line);
            }), fn, list, line);
        case 'gset':
            if (node.e.t === 'lambda' && node.define) {
                var ref = this.constant(node.cell);
                list.push(at(J.expr(J.assign(J.mem(ref, 'v'), this.lambda(node.e, fn, { cell: node.cell }))), line));
                this.deliver(cont, J.id('$U'), fn, list, line);
                return;
            }
            return this.compile(node.e, this.bindValue(function (value, list2, fn2) {
                list2.push(at(J.expr(self.globalSet(node, value, fn2)), line));
                self.deliver(cont, J.id('$U'), fn2, list2, line);
            }), fn, list, line);
        case 'defvals':
            return this.compile(node.e, this.bindValue(function (value, list2, fn2) {
                var name = '$m' + self.next();
                var count = node.targets.length;
                list2.push(at(J.let_(name, J.call(J.mem(J.id('$S'), 'valuesOf'),
                                                  [value, J.num(count), J.bool(node.rest !== null)])), line));
                node.targets.forEach(function (target, index) {
                    list2.push(J.expr(self.assignTarget(target, J.idx(J.id(name), J.num(index)))));
                });
                if (node.rest !== null)
                    list2.push(J.expr(self.assignTarget(node.rest, J.call(J.mem(J.id('$S'), 'tail'), [J.id(name), J.num(count)]))));
                self.deliver(cont, J.id('$U'), fn2, list2, line);
            }), fn, list, line);
        case 'call':
            return this.compileCall(node, cont, fn, list, line);
        case 'pcall':
            return this.compilePrimitive(node, cont, fn, list, line);
        }
        throw new Error('cannot compile ' + node.t);
    };

    Compiler.prototype.assignTarget = function (target, value) {
        if (target.v)
            return J.assign(J.id(target.v.js), value);
        return J.assign(J.mem(this.constant(target.cell), 'v'), value);
    };

    // A translation-time continuation that takes a value.
    Compiler.prototype.bindValue = function (fn) {
        return { tail: false, bind: fn };
    };

    Compiler.prototype.compileIf = function (node, cont, fn, list, line) {
        var self = this;
        if (isSimple(node.c)) {
            var test = this.test(node.c, fn, line);
            var shared = isSimple(node.a) && isSimple(node.b) && !cont.tail ? null : this.shareable(cont, fn, list, line);
            if (shared === null) {
                // Both branches are simple: one value for the continuation.
                this.deliver(cont, J.cond(test, this.simple(node.a, fn, line), this.simple(node.b, fn, line)), fn, list, line);
                return;
            }
            var thenList = [], elseList = [];
            this.compile(node.a, shared, fn, thenList, line);
            this.compile(node.b, shared, fn, elseList, line);
            list.push(at(J.if_(test, J.block(thenList), J.block(elseList)), line));
            return;
        }
        this.compile(node.c, this.bindValue(function (value, list2, fn2) {
            var shared2 = self.shareable(cont, fn2, list2, line);
            var thenList2 = [], elseList2 = [];
            self.compile(node.a, shared2, fn2, thenList2, line);
            self.compile(node.b, shared2, fn2, elseList2, line);
            var condition = isBoolean(node.c) ? value : J.bin('!==', value, J.bool(false));
            list2.push(at(J.if_(condition, J.block(thenList2), J.block(elseList2)), line));
        }), fn, list, line);
    };

    Compiler.prototype.compileSeq = function (items, cont, fn, list, line) {
        var self = this;
        for (var index = 0; index < items.length - 1; ++index) {
            var item = items[index];
            var itemLine = item.line || line;
            if (isSimple(item)) {
                if (item.t === 'const' || item.t === 'lref' || item.t === 'prim')
                    continue;
                if (item.t === 'lset' && item.e.t === 'lambda' && item.v.sets === 1) {
                    list.push(at(J.expr(J.assign(J.id(item.v.js), this.lambda(item.e, fn, { v: item.v }))), itemLine));
                    continue;
                }
                if (item.t === 'gset' && item.e.t === 'lambda' && item.define) {
                    list.push(at(J.expr(J.assign(J.mem(this.constant(item.cell), 'v'),
                                                 this.lambda(item.e, fn, { cell: item.cell }))), itemLine));
                    continue;
                }
                if (item.t === 'if' || item.t === 'let' || item.t === 'body' || item.t === 'seq') {
                    // As statements: the continuation is the rest of the sequence.
                    var rest = items.slice(index + 1);
                    if (item.t === 'if') {
                        list.push(at(J.if_(this.test(item.c, fn, itemLine), J.block(this.effectList(item.a, fn, itemLine)),
                                           J.block(this.effectList(item.b, fn, itemLine))), itemLine));
                        continue;
                    }
                    if (item.t === 'seq')
                        return this.compileSeq(item.list.concat(rest), cont, fn, list, line);
                    return this.compile(item, this.bindValue(function (value, list2, fn2) {
                        effect(value, list2, itemLine);
                        self.compileSeq(rest, cont, fn2, list2, line);
                    }), fn, list, itemLine);
                }
                list.push(at(J.expr(this.simple(item, fn, itemLine)), itemLine));
                continue;
            }
            var remaining = items.slice(index + 1);
            return this.compile(item, this.bindValue(function (value, list2, fn2) {
                effect(value, list2, itemLine);
                self.compileSeq(remaining, cont, fn2, list2, line);
            }), fn, list, itemLine);
        }
        this.compile(items[items.length - 1], cont, fn, list, line);
    };

    // A value that is not needed: evaluated for its effect (a call of a
    // built-in procedure), names and literals are skipped.
    function effect(value, list, line) {
        if (value.k === 'id' || value.k === 'num' || value.k === 'str' || value.k === 'bool' || value.k === 'undef')
            return;
        list.push(at(J.expr(value), line));
    }

    // A simple node for its effect: statements without a value.
    Compiler.prototype.effectList = function (node, fn, line) {
        var self = this;
        var list = [];
        if (node.t === 'const' || node.t === 'lref' || node.t === 'prim')
            return list;
        if (node.t === 'seq') {
            node.list.forEach(function (item) { list = list.concat(self.effectList(item, fn, item.line || line)); });
            return list;
        }
        if (node.t === 'if') {
            list.push(at(J.if_(this.test(node.c, fn, line), J.block(this.effectList(node.a, fn, line)),
                               J.block(this.effectList(node.b, fn, line))), line));
            return list;
        }
        list.push(at(J.expr(this.simple(node, fn, line)), node.line || line));
        return list;
    };

    Compiler.prototype.compileLet = function (node, cont, fn, list, line) {
        var self = this;
        var values = [];
        function next(index, fnNow, listNow) {
            if (index === node.vars.length) {
                if (node.vars.length > 0)
                    listNow.push(at(J.vars(node.vars.map(function (variable, position) {
                        return { name: variable.js, init: values[position] };
                    }), 'let'), line));
                self.compile(node.body, cont, fnNow, listNow, line);
                return;
            }
            var init = node.inits[index];
            if (isSimple(init)) {
                var laterComplex = node.inits.slice(index + 1).some(function (init) { return !isSimple(init); });
                var value = init.t === 'lambda' ? self.lambda(init, fnNow, null) : self.simple(init, fnNow, line);
                if (laterComplex && !(value.k === 'num' || value.k === 'bool' || value.k === 'str')) {
                    var name = '$a' + self.next();
                    listNow.push(at(J.let_(name, value), line));
                    value = J.id(name);
                }
                values[index] = value;
                next(index + 1, fnNow, listNow);
                return;
            }
            self.compile(init, self.bindValue(function (value2, list2, fn2) {
                values[index] = value2;
                if (node.inits.slice(index + 1).some(function (init) {
                    return !isSimple(init);
                }) && value2.k !== 'id') {
                    var name2 = '$a' + self.next();
                    list2.push(at(J.let_(name2, value2), line));
                    values[index] = J.id(name2);
                }
                next(index + 1, fn2, list2);
            }), fnNow, listNow, line);
        }
        next(0, fn, list);
    };

    // Arguments from left to right: simple ones as expressions, those with
    // calls through continuations; done(values, list, fn).
    Compiler.prototype.evaluateArgs = function (nodes, fn, list, line, done) {
        var self = this;
        var values = [];
        function lastComplex(from) {
            for (var position = nodes.length - 1; position >= from; --position) {
                if (!isSimple(nodes[position]))
                    return position;
            }
            return -1;
        }
        function step(index, fnNow, listNow) {
            if (index === nodes.length) {
                done(values, listNow, fnNow);
                return;
            }
            var node = nodes[index];
            if (isSimple(node)) {
                var value = self.simple(node, fnNow, line);
                // Before the next call the value is computed now (the order).
                if (lastComplex(index + 1) >= 0 && !(value.k === 'num' || value.k === 'bool' || value.k === 'str' ||
                                                     (node.t === 'lref' && !node.v.assigned) || node.t === 'lambda')) {
                    var name = '$a' + self.next();
                    listNow.push(at(J.let_(name, value), line));
                    value = J.id(name);
                }
                values[index] = value;
                step(index + 1, fnNow, listNow);
                return;
            }
            self.compile(node, self.bindValue(function (value2, list2, fn2) {
                if (lastComplex(index + 1) >= 0 && value2.k !== 'id') {
                    var name2 = '$a' + self.next();
                    list2.push(at(J.let_(name2, value2), line));
                    value2 = J.id(name2);
                }
                values[index] = value2;
                step(index + 1, fn2, list2);
            }), fnNow, listNow, line);
        }
        step(0, fn, list);
    };

    Compiler.prototype.compileCall = function (node, cont, fn, list, line) {
        var self = this;
        var nodes = [node.f].concat(node.args);
        this.evaluateArgs(nodes, fn, list, line, function (values, list2, fn2) {
            var callee = values[0];
            var args = values.slice(1);
            // A tail call to itself is a loop step.
            var lambdaFn = fn2.lambda;
            if (fn2 === lambdaFn && lambdaFn.loop !== null && cont.tail && cont.k.k === 'id' && cont.k.name === '$k' &&
                args.length === lambdaFn.loop.params.length &&
                ((node.f.t === 'lref' && node.f.v === lambdaFn.selfVar && node.f.v.sets === 1) ||
                 (node.f.t === 'gref' && node.f.cell === lambdaFn.selfCell))) {
                var loop = lambdaFn.loop;
                loop.used = true;
                var jump = [];
                var temps = args.map(function (arg, index) {
                    if (arg.k === 'id' && arg.name === loop.paramNames[index])
                        return null;
                    var name = '$n' + self.next();
                    jump.push(J.let_(name, arg));
                    return name;
                });
                temps.forEach(function (temp, index) {
                    if (temp !== null)
                        jump.push(J.expr(J.assign(J.id(loop.paramNames[index]), J.id(temp))));
                });
                jump.push(J.cont(loop.label));
                if (node.f.t === 'gref') {
                    var cellRef = self.constant(node.f.cell);
                    list2.push(at(J.if_(J.bin('===', J.mem(cellRef, 'v'), J.id(lambdaFn.selfName)), J.block(jump)), line));
                } else {
                    list2.push(at(J.block(jump), line));
                    return;
                }
            }
            self.notePlace(list2, line);
            var continuation = self.reify(cont, fn2, line);
            var target;
            if (node.f.t === 'lref' && node.f.v.sets === 1 && node.f.v.lambdaBound) {
                target = callee;
            } else {
                if (node.f.t === 'gref') {
                    // badProcedure recognizes an undefined variable.
                    callee = J.mem(self.constant(node.f.cell), 'v');
                }
                var setup = [];
                var procedure = once(callee, fn2, setup);
                var badArgs = [procedure];
                if (node.f.t === 'gref')
                    badArgs.push(self.constant(node.f.cell));
                target = withSetup(setup, J.cond(J.bin('===', J.un('typeof', procedure), J.str('function')), procedure,
                                                 J.call(J.mem(J.id('$S'), 'badProcedure'), badArgs)));
            }
            list2.push(at(J.ret(J.call(target, [continuation].concat(args))), line));
        });
    };

    // The place of a procedure call goes into $S.at: V4 drops the frames of
    // tail calls, and an error in the called procedure (raise, error, the
    // argument count) may leave no user line on the stack. Library code
    // does not change the place: an error in it is reported on the line of
    // the call from the unit.
    Compiler.prototype.notePlace = function (list, line) {
        if (this.options.library || !line)
            return;
        var key = line + ':' + this.source;
        var place = this.places.get(key);
        if (place === undefined) {
            place = this.constant({ line: line, source: this.source });
            this.places.set(key, place);
        }
        list.push(at(J.expr(J.assign(J.mem(J.id('$S'), 'at'), place)), line));
    };

    Compiler.prototype.compilePrimitive = function (node, cont, fn, list, line) {
        var self = this;
        var primitive = node.p;
        this.evaluateArgs(node.args, fn, list, line, function (values, list2, fn2) {
            if (!primitive.cps) {
                self.deliver(cont, self.primitiveCall(primitive, values, fn2, line), fn2, list2, line);
                return;
            }
            if (!arityOk(primitive, values.length)) {
                list2.push(at(J.expr(J.call(J.mem(J.id('$S'), 'primitiveArity'),
                                            [J.str(primitive.name), J.num(values.length)])), line));
                return;
            }
            self.notePlace(list2, line);
            var continuation = self.reify(cont, fn2, line);
            list2.push(at(J.ret(J.call(self.constant(primitive.fn), [continuation].concat(values))), line));
        });
    };

    // --- A code chunk: top-level forms

    // forms - [{ ir, line, source }] -> { statements } for compileChunk:
    // function ($S, $D) returns an array of the functions of the forms ($k).
    Compiler.prototype.unit = function (forms) {
        var self = this;
        var entries = forms.map(function (form) {
            var fn = new Fn(self, null, true);
            var body = [];
            markLambdaBound(form.ir);
            self.compile(form.ir, { tail: true, k: J.id('$k') }, fn, body, form.line);
            var statements = fn.declarations().concat(body);
            if (form.source !== undefined && form.source !== self.source)
                T.setSource(statements, form.source);
            return J.fn('$top' + self.next(), ['$k'], statements);
        });
        var header = [J.rawStmt('"use strict";'),
                      J.vars([{ name: '$N', init: J.mem(J.id('$S'), 'N') }, { name: '$Pair', init: J.mem(J.id('$S'), 'Pair') },
                              { name: '$NIL', init: J.mem(J.id('$S'), 'NIL') }, { name: '$U', init: J.mem(J.id('$S'), 'UNSPEC') },
                              { name: '$Char', init: J.mem(J.id('$S'), 'Char') }])];
        if (this.constants.length > 0) {
            header.push(J.vars(this.constants.map(function (value, index) {
                return { name: '$c' + index, init: J.idx(J.id('$D'), J.num(index)) };
            })));
        }
        return header.concat([J.ret(J.arr(entries))]);
    };

    // letrec/define variables assigned a lambda once: they are called
    // without checking that they are procedures.
    function markLambdaBound(node) {
        walk(node, function (inner) {
            if (inner.t === 'lset' && inner.e.t === 'lambda' && inner.v.sets === 1)
                inner.v.lambdaBound = true;
        });
    }

    function walk(node, visit) {
        if (node === null || typeof node !== 'object')
            return;
        visit(node);
        switch (node.t) {
        case 'lset':
        case 'gset':
            walk(node.e, visit);
            break;
        case 'if':
            walk(node.c, visit);
            walk(node.a, visit);
            walk(node.b, visit);
            break;
        case 'seq':
            node.list.forEach(function (item) { walk(item, visit); });
            break;
        case 'body':
            node.items.forEach(function (item) { walk(item, visit); });
            break;
        case 'let':
            node.inits.forEach(function (item) { walk(item, visit); });
            walk(node.body, visit);
            break;
        case 'lambda':
            walk(node.body, visit);
            break;
        case 'case-lambda':
            node.clauses.forEach(function (item) { walk(item, visit); });
            break;
        case 'call':
            walk(node.f, visit);
            node.args.forEach(function (item) { walk(item, visit); });
            break;
        case 'pcall':
            node.args.forEach(function (item) { walk(item, visit); });
            break;
        case 'defvals':
            walk(node.e, visit);
            break;
        }
    }

    S.Compiler = Compiler;
    S.isSimple = isSimple;
    S.once = once;
    S.withSetup = withSetup;
})(globalThis);
