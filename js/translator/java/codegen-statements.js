// Java: translation of statements - variables, loops, switch, exceptions.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Java = T.java;
    var Generator = Java.Generator;
    if (Generator.prototype.statements)
        return;

    var J = T.J;

    Generator.prototype.statements = function (list) {
        var result = [];
        for (var index = 0; index < list.length; ++index)
            result = result.concat(this.statement(list[index]));
        return result;
    };

    Generator.prototype.body = function (node) {
        var list = this.statement(node);
        return list.length === 1 && list[0].k === 'block' ? list[0] : J.block(list);
    };

    function labelName(label) {
        return 'L_' + label.replace(/\$/g, '$$$$');
    }

    var HANDLERS = {
        block: 'blockStatement', local: 'localStatement', localclass: 'localClassStatement', expr: 'expressionStatement',
        'if': 'ifStatement', 'while': 'whileStatement', 'do': 'doStatement', 'for': 'forStatement',
        foreach: 'foreachStatement', labeled: 'labeledStatement', 'break': 'jumpStatement', 'continue': 'jumpStatement',
        'return': 'returnStatement', 'throw': 'throwStatement', 'try': 'tryStatement', 'switch': 'switchStatement',
        'yield': 'yieldStatement', sync: 'syncStatement'
    };

    Generator.prototype.statement = function (node) {
        if (node.k === 'empty' || node.k === 'assert')
            return [];
        var handler = HANDLERS[node.k];
        if (handler === undefined)
            throw new T.CompileError('cannot translate statement', node.line, node.column, this.source);
        var self = this;
        return this[handler](node).map(function (statement) { return J.at(statement, statement.line || node.line); });
    };
    Generator.prototype.blockStatement = function (node) {
        return [J.block(this.statements(node.statements))];
    };

    Generator.prototype.localStatement = function (node) {
        var self = this;
        return node.vars.map(function (variable) {
            var type = Java.finalType(variable.declaredType);
            var init = variable.init === null ? self.defaultValue(type) : self.valueAs(variable.init, type);
            return J.at(J.let_(variable.local.jsName, init), variable.line);
        });
    };

    Generator.prototype.localClassStatement = function (node) {
        var sym = node.decl.sym;
        var expression = this.localClassExpression(sym);
        return [J.let_(this.localClasses.get(sym), expression)];
    };

    // The last expression of a top-level unit is its value.
    Generator.prototype.expressionStatement = function (node) {
        if (node === this.valueStatement) {
            var shown = J.call(this.rt('show'), [this.expression(node.expr), J.str(Java.descriptor(node.expr.type))]);
            return [J.expr(J.assign(J.id('$value'), shown))];
        }
        return [J.expr(this.expression(node.expr))];
    };

    Generator.prototype.ifStatement = function (node) {
        return [J.if_(this.valueAs(node.cond, Java.types.boolean), this.body(node.then),
                      node.otherwise === null ? null : this.body(node.otherwise))];
    };

    Generator.prototype.whileStatement = function (node) {
        return [J.while_(this.valueAs(node.cond, Java.types.boolean), this.body(node.body))];
    };

    Generator.prototype.doStatement = function (node) {
        return [J.doWhile(this.body(node.body), this.valueAs(node.cond, Java.types.boolean))];
    };

    // A label goes on the loop itself (not on a block around it): otherwise
    // continue with the label is a JavaScript error.
    Generator.prototype.labeledStatement = function (node) {
        var list = this.statement(node.body);
        return [J.label(labelName(node.label), list.length === 1 ? list[0] : J.block(list))];
    };

    Generator.prototype.jumpStatement = function (node) {
        var label = node.label !== null ? labelName(node.label) : null;
        return [node.k === 'break' ? J.brk(label) : J.cont(label)];
    };

    Generator.prototype.syncStatement = function (node) {
        return [J.block([J.expr(this.expression(node.lock))].concat(this.statements(node.body.statements)))];
    };
    Generator.prototype.forStatement = function (node) {
        var self = this;
        var before = [];
        var init = null;
        var locals = node.init.filter(function (item) { return item.k === 'local'; });
        if (locals.length > 0 && locals.length === node.init.length) {
            var list = [];
            locals.forEach(function (item) {
                self.localStatement(item).forEach(function (declaration) {
                    list.push({ name: declaration.name, init: declaration.init });
                });
            });
            init = J.vars(list, 'let');
        } else if (node.init.length > 0) {
            init = J.seq(node.init.map(function (item) { return self.expression(item.expr); }));
        }
        var test = node.cond === null ? null : this.valueAs(node.cond, Java.types.boolean);
        var update = node.update.length === 0 ? null : J.seq(node.update.map(function (item) { return self.expression(item.expr); }));
        return before.concat([J.for_(init, test, update, this.body(node.body))]);
    };

    // for (x : array) - by index; for (x : Iterable) - with an iterator.
    Generator.prototype.foreachStatement = function (node) {
        var variable = node.variable;
        var varType = Java.finalType(variable.type);
        var elemType = Java.finalType(node.elemType);
        var body = this.statements(node.body.k === 'block' ? node.body.statements : [node.body]);
        var source = J.id(this.fn.scope.temp());
        var cursor = J.id(this.fn.scope.temp());
        if (node.overArray) {
            var element = this.convert(J.idx(source, cursor), elemType, varType);
            // One for statement: the continue label must be on the loop.
            var start = J.seq([J.assign(source, this.expression(node.iterable)), J.assign(cursor, J.num(0))]);
            return [J.for_(start, J.bin('<', cursor, J.mem(source, 'length')), J.update('++', true, cursor),
                           J.block([J.let_(variable.jsName, element)].concat(body)))];
        }
        var iterator = Java.symtab.classNamed('java.util.Iterator').complete();
        var iterable = Java.symtab.classNamed('java.lang.Iterable').complete();
        var next = this.convert(J.call(J.mem(cursor, iterator.methods.next[0].jsName), []), elemType, varType);
        var start = J.call(J.mem(this.expression(node.iterable), iterable.methods.iterator[0].jsName), []);
        var condition = J.call(J.mem(cursor, iterator.methods.hasNext[0].jsName), []);
        return [J.for_(J.assign(cursor, start), condition, null, J.block([J.let_(variable.jsName, next)].concat(body)))];
    };

    Generator.prototype.returnStatement = function (node) {
        var fn = this.fn;
        if (fn.kind === 'lambda')
            return node.expr === null ? [J.ret(null)] : this.returnValue(this.valueAs(node.expr, fn.lambdaReturns));
        var method = this.methodContext(fn).method;
        if (method !== null && method.isCtor)
            return [J.ret(J.this_())];
        if (node.expr === null)
            return [J.ret(null)];
        return this.returnValue(this.valueAs(node.expr, method.returns));
    };

    // Whether the expression has a call (without going into functions).
    function hasCall(node) {
        if (node === null || typeof node !== 'object')
            return false;
        if (Array.isArray(node))
            return node.some(hasCall);
        if (node.k === 'call')
            return true;
        if (node.k === 'fn')
            return false;
        for (var key in node) {
            if (key !== 'k' && hasCall(node[key]))
                return true;
        }
        return false;
    }

    // return without a call in the value: V4 in strict code runs a call in
    // return as a tail call - even where it is not one (in return a.b = c ?
    // d : f() the assignment is lost), and the frame of the function
    // disappears from the error stack. The value goes into a temporary in a
    // statement of its own.
    Generator.prototype.returnValue = function (js) {
        if (this.fn.async || !hasCall(js))
            return [J.ret(js)];
        var temp = this.temp();
        return [J.expr(J.assign(temp, js)), J.ret(temp)];
    };

    Generator.prototype.throwStatement = function (node) {
        return [J.throw_(J.call(this.rt('thrown'), [this.expression(node.expr)]))];
    };
    // Resources are closed (in reverse order) before catch and finally.
    Generator.prototype.resourceBlock = function (resources, body) {
        if (resources.length === 0)
            return body;
        var resource = resources[0];
        var inner = this.resourceBlock(resources.slice(1), body);
        var name = resource.variable ? resource.variable.jsName : this.fn.scope.temp();
        var value = resource.variable ? this.valueAs(resource.init, resource.variable.type) : this.expression(resource.init);
        var closeable = Java.symtab.classNamed('java.lang.AutoCloseable').complete();
        var close = J.expr(J.call(J.mem(J.id(name), closeable.methods.close[0].jsName), []));
        var declaration = resource.variable ? J.let_(name, value) : J.expr(J.assign(J.id(name), value));
        return [J.block([declaration, J.try_(inner, null, null, [J.if_(J.bin('!==', J.id(name), J.nul()), close, null)])])];
    };

    Generator.prototype.tryStatement = function (node) {
        var self = this;
        var body = this.resourceBlock(node.resources, this.statements(node.body.statements));
        var finalizer = node.finalizer === null ? null : this.statements(node.finalizer.statements);
        if (node.catches.length === 0)
            return finalizer === null ? [J.block(body)] : [J.try_(body, null, null, finalizer)];
        // catch ($e): a JavaScript error becomes a Java exception; then the branch is chosen.
        var error = J.id('$e');
        var chain = J.throw_(error);
        for (var index = node.catches.length - 1; index >= 0; --index) {
            var clause = node.catches[index];
            var tests = clause.catchTypes.map(function (type) { return self.typeTest(error, type); });
            var test = tests.reduce(function (left, right) { return J.or(left, right); });
            var handler = J.block([J.let_(clause.variable.jsName, error)].concat(this.statements(clause.body.statements)));
            chain = J.if_(test, handler, chain);
        }
        var handlerBody = [J.expr(J.assign(error, J.call(this.rt('caught'), [error]))), chain];
        return [J.try_(body, '$e', handlerBody, finalizer)];
    };
    // Whether a chain of checks is needed instead of a JavaScript switch.
    function needsChain(node) {
        if (node.selectorInfo.kind === 'pattern')
            return true;
        return node.cases.some(function (entry) {
            return entry.guard !== null || entry.labels.some(function (label) {
                return label.k === 'pattern' || label.k === 'recordpattern' || label.isNull;
            });
        });
    }

    // The body of a branch: arm(entry) - the statements of an arrow branch.
    Generator.prototype.switchCases = function (node, arm) {
        var self = this;
        var info = node.selectorInfo;
        var cases = [];
        node.cases.forEach(function (entry) {
            var tests = entry.labels.map(function (label) {
                if (label.enumField !== undefined)
                    return J.mem(self.classRef(info.sym), label.enumField.jsName);
                return self.literal(label.caseValue);
            });
            if (entry.isDefault)
                tests.push(null);
            var body = node.arrow ? arm(entry) : self.statements(entry.body);
            tests.forEach(function (test, index) {
                cases.push({ test: test, body: index === tests.length - 1 ? body : [] });
            });
        });
        return cases;
    };

    Generator.prototype.switchSelectorValue = function (node) {
        var info = node.selectorInfo;
        if (info.kind === 'int')
            return this.valueAs(node.selector, Java.types.int);
        return J.call(this.rt('nonNull'), [this.expression(node.selector)]);
    };
    // A switch with patterns, null and when - an if chain inside switch (0),
    // so that break leaves it.
    Generator.prototype.switchChain = function (node, arm) {
        var self = this;
        var value = J.id(this.fn.scope.temp());
        var hasNull = node.cases.some(function (entry) { return entry.labels.some(function (label) { return label.isNull; }); });
        var chain = node.hasDefault ? null : J.throw_(J.call(this.rt('matchException'), [value]));
        var defaultEntry = node.cases.filter(function (entry) { return entry.isDefault; })[0];
        if (defaultEntry !== undefined)
            chain = J.block(arm(defaultEntry));
        for (var index = node.cases.length - 1; index >= 0; --index) {
            var entry = node.cases[index];
            var tests = entry.labels.map(function (label) {
                if (label.isNull)
                    return J.bin('===', value, J.nul());
                if (label.k === 'pattern' || label.k === 'recordpattern')
                    return self.patternMatch(value, label, false);
                if (label.enumField !== undefined)
                    return J.bin('===', value, J.mem(self.classRef(node.selectorInfo.sym), label.enumField.jsName));
                if (node.selectorInfo.kind === 'string')
                    return J.bin('===', value, self.literal(label.caseValue));
                return J.bin('===', self.convert(value, node.selector.type, Java.types.int), self.literal(label.caseValue));
            });
            if (tests.length === 0)
                continue;
            var test = tests.reduce(function (left, right) { return J.or(left, right); });
            if (entry.guard !== null)
                test = J.and(test, this.valueAs(entry.guard, Java.types.boolean));
            chain = J.if_(test, J.block(arm(entry)), chain);
        }
        var statements = [J.expr(J.assign(value, this.expression(node.selector)))];
        if (!hasNull)
            statements.push(J.if_(J.bin('===', value, J.nul()), J.throw_(J.call(this.rt('npe'), [])), null));
        if (chain !== null)
            statements.push(chain);
        return J.switch_(J.num(0), [{ test: null, body: statements }]);
    };
    Generator.prototype.switchStatement = function (node) {
        var self = this;
        var arm = function (entry) {
            if (!node.arrow)
                return self.statements(entry.body);
            var body = entry.body.k === 'expr' ? [J.expr(self.expression(entry.body.expr))] : self.statement(entry.body);
            return body.concat([J.brk(null)]);
        };
        if (needsChain(node))
            return [this.switchChain(node, arm)];
        return [J.switch_(this.switchSelectorValue(node), this.switchCases(node, arm))];
    };

    // A switch expression is a function in place: the branches return the value.
    Generator.prototype.switchExpression = function (node) {
        var self = this;
        var savedType = this.switchType;
        var type = Java.finalType(node.type);
        this.switchType = type;
        var arm = function (entry) {
            if (!node.arrow)
                return self.statements(entry.body);
            if (entry.body.k === 'expr')
                return self.returnValue(self.valueAs(entry.body.expr, type));
            return self.statement(entry.body);
        };
        var statement = needsChain(node) ? this.switchChain(node, arm)
                                         : J.switch_(this.switchSelectorValue(node), this.switchCases(node, arm));
        this.switchType = savedType;
        var body = [statement, J.throw_(J.call(this.rt('matchException'), [J.nul()]))];
        var fn = J.fn(null, [], body, this.fn.async);
        var call = J.call(J.mem(fn, 'call'), [J.this_()]);
        return this.fn.async ? J.yield_(call, true) : call;
    };

    Generator.prototype.yieldStatement = function (node) {
        return this.returnValue(this.valueAs(node.expr, this.switchType));
    };
})(globalThis);
