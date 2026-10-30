// C#: translation of statements - blocks with the declarations of their
// locals, loops (the variable of for is shared by the iterations, the one
// of foreach is new in each), foreach over arrays, strings and
// enumerators, switch, try with the conversion of JavaScript errors,
// using, yield; function bodies of iterators and async methods.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    var G = CS.Generator.prototype;
    if (G.statements)
        return;

    var J = T.J;

    // --- Function bodies

    // The statements of a body; iterators and async methods wrap them in a
    // generator.
    G.functionBody = function (info, body, method) {
        if (info !== undefined && info !== null && info.iterator)
            return this.iteratorBody(info, body);
        if (info !== undefined && info !== null && info.isAsync)
            return this.asyncBody(info, body);
        if (info !== undefined && info !== null && info.fiber) {
            this.fn.generator = true;
            return this.statements(body.statements);
        }
        return this.statements(body.statements);
    };

    // The function itself: a generator for fibers, a wrapper for plain
    // calls (fiber - the function waits).
    G.finishFunction = function (fn, info, params, body, method) {
        var isGenerator = fn.generator && !(info && (info.iterator || info.isAsync));
        var code = this.functionCode(fn, params, body, isGenerator);
        if (isGenerator)
            return J.call(this.rt('fiberFunction'), [code]);
        return code;
    };

    // An iterator: the body is a generator; the result is an enumerable
    // (or enumerator) over it.
    G.iteratorBody = function (info, body) {
        var outer = this.fn;
        var inner = this.pushFunction('lambda', outer.typeSym, outer.method);
        inner.isStatic = outer.isStatic;
        inner.generator = true;
        inner.innerGenerator = true;
        inner.iterator = true;
        inner.asyncIterator = info.iteratorKind === 'asyncEnumerable';
        var statements = this.statements(body.statements);
        var generator = this.functionCode(inner, [], statements, true);
        this.fn = outer;
        var kind = info.iteratorKind;
        var element = this.typeRef(info.elementType);
        if (kind === 'asyncEnumerable')
            return [J.ret(J.call(this.rt('asyncIterator'), [element, generator]))];
        return [J.ret(J.call(this.rt(kind === 'enumerator' ? 'enumerator' : 'enumerable'), [element, generator]))];
    };

    // An async method: a generator run by the scheduler; the result is a
    // Task (void - nothing).
    G.asyncBody = function (info, body) {
        var outer = this.fn;
        var inner = this.pushFunction('lambda', outer.typeSym, outer.method);
        inner.isStatic = outer.isStatic;
        inner.generator = true;
        inner.innerGenerator = true;
        inner.async = true;
        var statements = this.statements(body.statements);
        var generator = this.functionCode(inner, [], statements, true);
        this.fn = outer;
        var resultType = info.returnType !== null && info.returnType.kind !== 'void' ? this.typeRef(info.returnType) : J.nul();
        if (info.asyncVoid)
            return [J.expr(J.call(this.rt('asyncVoid'), [generator]))];
        var declared = info.declaredReturn;
        var valueTask = declared !== null && declared !== undefined && declared.kind === 'named' &&
            declared.sym.qname === 'System.Threading.Tasks.ValueTask';
        return [J.ret(J.call(this.rt('async'), valueTask ? [generator, resultType, J.bool(true)] : [generator, resultType]))];
    };

    // --- Statements

    G.statements = function (list) {
        var self = this;
        var result = [];
        // Local functions first: they may be called before their declaration.
        list.forEach(function (statement) {
            if (statement.k === 'localFunction')
                result = result.concat(self.localFunctionDeclaration(statement));
        });
        return result.concat(this.labeledStatements(list.filter(function (statement) { return statement.k !== 'localFunction'; })));
    };

    // goto label: the statements before a label that a goto jumps forward
    // to go into a labeled block (goto - break), the label and the rest
    // into a labeled loop when a goto jumps back (goto - continue).
    G.labeledStatements = function (list) {
        var self = this;
        var index = 0;
        while (index < list.length && !(list[index].k === 'labeled' && (list[index].label.forward || list[index].label.backward)))
            ++index;
        if (index === list.length) {
            var plain = [];
            list.forEach(function (statement) { plain = plain.concat(self.statement(statement)); });
            return plain;
        }
        var label = list[index].label;
        var result = [];
        if (label.forward) {
            label.forwardName = '$goto' + (++this.labelCounter);
            var before = this.labeledStatements(list.slice(0, index));
            // The locals of the block stay visible after the label.
            var names = [];
            before = before.map(function (statement) { return liftLocals(statement, names); });
            if (names.length > 0)
                result.push(J.vars(names.map(function (name) { return { name: name, init: null }; }), 'let'));
            result.push(J.label(label.forwardName, J.block(before)));
        } else {
            result = this.labeledStatements(list.slice(0, index));
        }
        var rest = [list[index].statement].concat(list.slice(index + 1));
        if (!label.backward)
            return result.concat(this.labeledStatements(rest));
        label.backwardName = '$goto' + (++this.labelCounter);
        this.fn.breakTargets.push({ kind: 'goto' });
        try {
            var body = this.labeledStatements(rest);
        } finally {
            this.fn.breakTargets.pop();
        }
        body.push(J.brk(label.backwardName));
        result.push(J.label(label.backwardName, J.for_(null, null, null, J.block(body))));
        return result;
    };

    // let x = v at the top of a block: x = v, the name into names.
    function liftLocals(statement, names) {
        if (statement.k === 'var' && (statement.kind === 'let' || statement.kind === 'const')) {
            names.push(statement.name);
            return statement.init === null ? J.empty() : J.at(J.expr(J.assign(J.id(statement.name), statement.init)), statement.line);
        }
        if (statement.k === 'vars' && (statement.kind === 'let' || statement.kind === 'const')) {
            var assignments = [];
            statement.list.forEach(function (item) {
                names.push(item.name);
                if (item.init !== null && item.init !== undefined)
                    assignments.push(J.assign(J.id(item.name), item.init));
            });
            return assignments.length === 0 ? J.empty() : J.at(J.expr(J.seq(assignments)), statement.line);
        }
        return statement;
    }

    G.stmt_labeled = function (stmt) {
        return this.statement(stmt.statement);
    };

    G.stmt_gotoLabel = function (stmt) {
        var label = stmt.label;
        if (label.backwardName !== undefined)
            return J.at(J.cont(label.backwardName), stmt.line);
        return J.at(J.brk(label.forwardName), stmt.line);
    };

    G.statement = function (stmt) {
        var method = this['stmt_' + stmt.k];
        if (method === undefined)
            throw new Error('C# codegen: unknown statement ' + stmt.k);
        var result = method.call(this, stmt);
        if (!Array.isArray(result))
            result = [result];
        // A loop that break or continue named (from a goto loop or a switch
        // with goto case): its label.
        if (stmt.body && stmt.body.$loopTarget && stmt.body.$loopTarget.label !== null)
            result = result.map(function (node) { return labelLoop(node, stmt.body.$loopTarget.label); });
        if (result.length > 0 && stmt.line && result[0].line === undefined)
            J.at(result[0], stmt.line);
        return result;
    };

    // The loop of a translated loop statement (inside its blocks) with a label.
    function labelLoop(node, label) {
        switch (node.k) {
        case 'for':
        case 'while':
        case 'dowhile':
            return J.at(J.label(label, node), node.line);
        case 'block':
            node.body = node.body.map(function (item) { return labelLoop(item, label); });
            return node;
        case 'try':
            node.body = node.body.map(function (item) { return labelLoop(item, label); });
            return node;
        }
        return node;
    }

    // A block: the locals declared inside expressions (out var, patterns)
    // get their declarations at its start.
    G.blockStatements = function (block) {
        var savedHoisted = this.blockHoisted;
        this.blockHoisted = [];
        var body = this.statements(block.statements);
        var hoisted = this.blockHoisted;
        this.blockHoisted = savedHoisted;
        var self = this;
        if (hoisted.length > 0)
            body.unshift(J.vars(hoisted.map(function (local) { return { name: self.localName(local), init: null }; }), 'let'));
        return body;
    };

    G.stmt_block = function (stmt) {
        return J.at(J.block(this.blockStatements(stmt)), stmt.line);
    };

    G.stmt_empty = function () {
        return [];
    };

    G.stmt_expr = function (stmt) {
        var expr = stmt.expr;
        if (expr.k === 'nothing')
            return [];
        if (this.valueStatement === stmt)
            return J.at(J.expr(J.assign(J.id('$value'), this.valueOf(expr))), stmt.line);
        return J.at(J.expr(this.effect(expr)), stmt.line);
    };

    // The value of the last expression of a unit for the host.
    G.valueOf = function (expr) {
        return J.call(this.rt('show'), [this.typeRef(expr.type.kind === 'null' ? CS.objectType() : expr.type), this.expression(expr)]);
    };

    G.stmt_localDecl = function (stmt) {
        var local = stmt.sym;
        var value = stmt.init !== null ? this.storedValue(stmt.init) : this.defaultValue(local.type);
        return J.at(J.let_(this.localName(local), value), stmt.line);
    };

    G.stmt_declarations = function (stmt) {
        var self = this;
        return stmt.list.map(function (item) { return self.stmt_localDecl(item); });
    };

    G.stmt_refLocalDecl = function (stmt) {
        return J.at(J.let_(this.localName(stmt.sym), this.reference({ target: stmt.target })), stmt.line);
    };

    G.stmt_if = function (stmt) {
        var then = this.embedded(stmt.then);
        var otherwise = stmt.otherwise !== null ? this.embedded(stmt.otherwise) : null;
        return J.at(J.if_(this.expression(stmt.cond), then, otherwise), stmt.line);
    };

    // An embedded statement as one JavaScript statement.
    G.embedded = function (stmt) {
        var list = this.statement(stmt);
        if (list.length === 1 && list[0].k !== 'var' && list[0].k !== 'vars')
            return list[0];
        return J.block(list);
    };

    G.loopBody = function (stmt) {
        var target = { kind: 'loop', label: null };
        stmt.$loopTarget = target;
        this.fn.breakTargets.push(target);
        try {
            return this.embedded(stmt);
        } finally {
            this.fn.breakTargets.pop();
        }
    };

    G.stmt_while = function (stmt) {
        var cond = this.expression(stmt.cond);
        var hoisted = this.declarationsOf(stmt.locals);
        var loop = J.at(J.while_(cond, this.loopBody(stmt.body)), stmt.line);
        return hoisted.length > 0 ? J.block(hoisted.concat([loop])) : loop;
    };

    G.stmt_do = function (stmt) {
        var body = this.loopBody(stmt.body);
        var hoisted = this.declarationsOf(stmt.locals);
        var loop = J.at(J.doWhile(body, this.expression(stmt.cond)), stmt.line);
        return hoisted.length > 0 ? J.block(hoisted.concat([loop])) : loop;
    };

    // let declarations of locals that expressions declare (patterns, out var).
    G.declarationsOf = function (locals) {
        var self = this;
        var list = (locals || []).filter(function (local) {
            return local.kind === 'pattern' || local.kind === 'local' && local.hoisted !== true && false;
        });
        list.forEach(function (local) { local.hoisted = true; });
        if (list.length === 0)
            return [];
        return [J.vars(list.map(function (local) { return { name: self.localName(local), init: null }; }), 'let')];
    };

    // for: the variables before the loop (one variable for all iterations,
    // as in C#: closures see the last value).
    G.stmt_for = function (stmt) {
        var self = this;
        var setup = [];
        stmt.init.forEach(function (item) { setup = setup.concat(self.statement(item)); });
        var savedHoisted = this.blockHoisted;
        this.blockHoisted = [];
        var cond = stmt.cond !== null ? this.expression(stmt.cond) : null;
        var updates = stmt.updates.map(function (update) { return self.effect(update); });
        var update = updates.length === 0 ? null : J.seq(updates);
        var body = this.loopBody(stmt.body);
        var hoisted = this.blockHoisted;
        this.blockHoisted = savedHoisted;
        if (hoisted.length > 0)
            setup.unshift(J.vars(hoisted.map(function (local) { return { name: self.localName(local), init: null }; }), 'let'));
        var loop = J.at(J.for_(null, cond, update, body), stmt.line);
        if (setup.length === 0)
            return loop;
        return J.at(J.block(setup.concat([loop])), stmt.line);
    };

    G.stmt_foreach = function (stmt) {
        var info = stmt.info;
        switch (info.kind) {
        case 'array':
            return info.rank > 1 ? this.foreachMulti(stmt) : this.foreachArray(stmt);
        case 'string':
            return this.foreachString(stmt);
        case 'dynamic':
            return this.foreachDynamic(stmt);
        }
        if (this.isListEnumeration(stmt))
            return this.foreachList(stmt);
        return this.foreachEnumerator(stmt);
    };

    // The iteration variable (or a deconstruction) from the current value.
    G.foreachHead = function (stmt, current) {
        var self = this;
        if (stmt.variable !== null) {
            var value = current;
            if (stmt.conversion !== null)
                value = this.withPlaceholderValue(stmt.conversion, current);
            else if (this.needsCopy(stmt.variable.type) && this.isMutableStruct(stmt.variable.type))
                value = J.method(current, '$copy', []);
            return [J.let_(this.localName(stmt.variable), value)];
        }
        var reads = [], writes = [];
        var temp = this.temp();
        reads.push(J.assign(temp, current));
        this.deconstructInto(stmt.targets, temp, reads, writes);
        var declared = (stmt.locals || []).filter(function (local) { return local.kind === 'local'; });
        var head = [];
        if (declared.length > 0)
            head.push(J.vars(declared.map(function (local) {
                local.hoisted = true;
                return { name: self.localName(local), init: null };
            }), 'let'));
        head.push(J.expr(J.seq(reads.concat(writes))));
        return head;
    };

    G.foreachBody = function (stmt, head) {
        var body = this.loopBody(stmt.body);
        var list = head.concat(body.k === 'block' ? body.body : [body]);
        return J.block(list);
    };

    G.foreachArray = function (stmt) {
        var array = J.id(this.fn.scope.temp());
        var index = J.id(this.fn.scope.temp());
        var head = this.foreachHead(stmt, J.idx(array, index));
        var body = this.foreachBody(stmt, head);
        return J.at(J.block([J.expr(J.assign(array, this.expression(stmt.collection))),
                             J.for_(J.assign(index, J.num(0)), J.bin('<', index, J.mem(array, 'length')),
                                    J.update('++', true, index), body)]), stmt.line);
    };

    G.foreachMulti = function (stmt) {
        var array = J.id(this.fn.scope.temp());
        var index = J.id(this.fn.scope.temp());
        var head = this.foreachHead(stmt, J.idx(J.mem(array, 'a'), index));
        var body = this.foreachBody(stmt, head);
        return J.at(J.block([J.expr(J.assign(array, this.expression(stmt.collection))),
                             J.for_(J.assign(index, J.num(0)), J.bin('<', index, J.mem(J.mem(array, 'a'), 'length')),
                                    J.update('++', true, index), body)]), stmt.line);
    };

    G.foreachString = function (stmt) {
        var text = J.id(this.fn.scope.temp());
        var index = J.id(this.fn.scope.temp());
        var head = this.foreachHead(stmt, J.method(text, 'charCodeAt', [index]));
        var body = this.foreachBody(stmt, head);
        return J.at(J.block([J.expr(J.assign(text, this.expression(stmt.collection))),
                             J.for_(J.assign(index, J.num(0)), J.bin('<', index, J.mem(text, 'length')),
                                    J.update('++', true, index), body)]), stmt.line);
    };

    G.foreachDynamic = function (stmt) {
        var items = J.id(this.fn.scope.temp());
        var index = J.id(this.fn.scope.temp());
        var head = this.foreachHead(stmt, J.idx(items, index));
        var body = this.foreachBody(stmt, head);
        return J.at(J.block([J.expr(J.assign(items, J.call(this.rt('dynamicItems'), [this.expression(stmt.collection)]))),
                             J.for_(J.assign(index, J.num(0)), J.bin('<', index, J.mem(items, 'length')),
                                    J.update('++', true, index), body)]), stmt.line);
    };

    // foreach over List<T>: by index with the check of modification.
    G.isListEnumeration = function (stmt) {
        var info = stmt.info;
        var type = stmt.collection.type;
        return info.kind === 'enumerator' && !info.extension && type.kind === 'named' &&
            type.sym.qname === 'System.Collections.Generic.List' && info.getEnumerator.member.owner === type.sym;
    };

    G.foreachList = function (stmt) {
        var list = J.id(this.fn.scope.temp());
        var version = J.id(this.fn.scope.temp());
        var index = J.id(this.fn.scope.temp());
        var head = this.foreachHead(stmt, J.idx(J.mem(list, '_items'), index));
        var check = J.if_(J.bin('!==', J.mem(list, '_version'), version), J.expr(J.call(this.rt('modifiedDuringEnumeration'), [])));
        head.unshift(check);
        var body = this.foreachBody(stmt, head);
        // The check after the last iteration too (as MoveNext does).
        return J.at(J.block([J.expr(J.assign(list, this.expression(stmt.collection))),
                             J.expr(J.assign(version, J.mem(list, '_version'))),
                             J.for_(J.assign(index, J.num(0)), J.bin('<', index, J.mem(list, '_size')),
                                    J.update('++', true, index), body),
                             check]), stmt.line);
    };

    // foreach by GetEnumerator, MoveNext and Current; Dispose at the end.
    G.foreachEnumerator = function (stmt) {
        var info = stmt.info;
        var self = this;
        var enumerator = J.id(this.fn.scope.temp());
        var collection = this.expression(stmt.collection);
        var getEnumerator;
        var entry = info.getEnumerator;
        if (info.extension) {
            getEnumerator = this.staticCall(entry.owner, entry.member, info.getTypeArgs.map(function (arg) {
                return self.typeRef(arg);
            }).concat([collection]));
        } else {
            getEnumerator = this.instanceCall({ k: 'placeholder', value: collection, type: stmt.collection.type }, entry.member, [], entry.owner);
        }
        var moveNext = this.instanceCall({ k: 'placeholder', value: enumerator, type: info.enumeratorType }, info.moveNext.member, [],
                                         info.moveNext.owner);
        if (info.isAsync)
            moveNext = J.yield_(J.call(this.rt('await'), [moveNext]), true);
        else if (this.fn.generator && info.moveNext.member.fiber)
            moveNext = this.fiberCall(moveNext, info.moveNext.member);
        var getter = CS.findGetter(info.current.member);
        var current = this.instanceCall({ k: 'placeholder', value: enumerator, type: info.enumeratorType }, getter, [], info.current.owner);
        if (info.current.member.isAuto && !info.current.member.isVirtual && info.current.member.owner.kind !== 'interface')
            current = J.mem(enumerator, info.current.member.backingField.jsName);
        var head = this.foreachHead(stmt, current);
        var body = this.foreachBody(stmt, head);
        var loop = J.while_(moveNext, body);
        var statements = [J.expr(J.assign(enumerator, getEnumerator))];
        if (info.dispose) {
            var dispose = J.call(this.rt(info.isAsync ? 'disposeAsync' : 'dispose'), [enumerator]);
            if (info.isAsync)
                dispose = J.yield_(dispose, true);
            statements.push(J.try_([loop], null, null, [J.expr(dispose)]));
        } else {
            statements.push(loop);
        }
        return J.at(J.block(statements), stmt.line);
    };

    // switch: a JavaScript switch for constant labels, otherwise tests in
    // order; goto case runs it in a loop with the number of the section.
    G.stmt_switch = function (stmt) {
        if (this.usesGotoCase(stmt))
            return this.switchMachine(stmt);
        if (this.isConstantSwitch(stmt))
            return this.constantSwitch(stmt);
        return this.patternSwitch(stmt);
    };

    G.isConstantSwitch = function (stmt) {
        var kind = this.numericKind(stmt.expr.type);
        var simple = CS.isSpecial(stmt.expr.type, 'string') || CS.isSpecial(stmt.expr.type, 'bool') ||
            (kind !== null && kind !== 'i64' && kind !== 'u64' && kind !== 'decimal' && kind !== 'f32' && kind !== 'f64');
        if (!simple)
            return false;
        return stmt.sections.every(function (section) {
            return section.labels.every(function (label) {
                return label.pattern === null || (label.when === null && label.pattern.kind === 'constant' && label.pattern.testType === null) ||
                    (label.when === null && label.pattern.kind === 'null');
            });
        });
    };

    G.constantSwitch = function (stmt) {
        var self = this;
        var cases = [];
        var target = { kind: 'switch', label: null };
        this.fn.breakTargets.push(target);
        stmt.sections.forEach(function (section) {
            var body = self.sectionBody(section);
            section.labels.forEach(function (label, index) {
                var test = label.pattern === null ? null : (label.pattern.kind === 'null' ? J.nul() : self.expression(label.pattern.value));
                cases.push({ test: test, body: index === section.labels.length - 1 ? [J.block(body)] : [], line: section.line });
            });
        });
        this.fn.breakTargets.pop();
        var code = J.switch_(this.expression(stmt.expr), cases);
        return J.at(target.label !== null ? J.label(target.label, code) : code, stmt.line);
    };

    // The statements of a section in a block of their own (their locals).
    G.sectionBody = function (section) {
        var savedHoisted = this.blockHoisted;
        this.blockHoisted = [];
        var body = this.statements(section.statements);
        var hoisted = this.blockHoisted;
        this.blockHoisted = savedHoisted;
        var self = this;
        if (hoisted.length > 0)
            body.unshift(J.vars(hoisted.map(function (local) { return { name: self.localName(local), init: null }; }), 'let'));
        return body;
    };

    G.patternSwitch = function (stmt) {
        var self = this;
        var label = '$sw' + (++this.labelCounter);
        var value = J.id(this.fn.scope.temp());
        var type = stmt.expr.type;
        var body = [J.expr(J.assign(value, this.expression(stmt.expr)))];
        this.fn.breakTargets.push({ kind: 'switch', label: label });
        var defaultBody = null;
        var savedHoisted = this.blockHoisted;
        this.blockHoisted = [];
        stmt.sections.forEach(function (section) {
            var tests = [];
            var isDefault = false;
            section.labels.forEach(function (caseLabel) {
                if (caseLabel.pattern === null) {
                    isDefault = true;
                    return;
                }
                var test = self.patternTest(caseLabel.pattern, value, type);
                if (caseLabel.when !== null)
                    test = J.and(test, self.expression(caseLabel.when));
                tests.push(test);
            });
            var sectionStatements = self.sectionBody(section);
            if (isDefault && tests.length === 0) {
                defaultBody = sectionStatements;
                return;
            }
            if (isDefault) {
                // default together with other labels: the default runs it too.
                defaultBody = sectionStatements;
            }
            var test = tests.reduce(function (left, right) { return J.or(left, right); });
            body.push(J.at(J.if_(test, J.block(sectionStatements)), section.line));
        });
        if (defaultBody !== null)
            body.push(J.block(defaultBody));
        var hoisted = this.blockHoisted;
        this.blockHoisted = savedHoisted;
        this.fn.breakTargets.pop();
        if (hoisted.length > 0)
            body.unshift(J.vars(hoisted.map(function (local) { return { name: self.localName(local), init: null }; }), 'let'));
        return J.at(J.label(label, J.block(body)), stmt.line);
    };

    G.usesGotoCase = function (stmt) {
        var found = false;
        var seen = new Set();
        (function walk(node) {
            if (found || node === null || typeof node !== 'object' || seen.has(node))
                return;
            seen.add(node);
            if (Array.isArray(node)) {
                node.forEach(walk);
                return;
            }
            // Bound nodes only (symbols refer back to their declarations).
            if (typeof node.k !== 'string')
                return;
            if (node.k === 'gotoCase') {
                found = true;
                return;
            }
            if (node.k === 'switch' && node !== stmt)
                return;
            if (node.k === 'lambda' || node.k === 'localFunction')
                return;
            Object.keys(node).forEach(function (key) {
                if (key !== 'type' && key !== 'sym' && key !== 'method' && key !== 'info' && key !== 'pattern')
                    walk(node[key]);
            });
        })(stmt.sections.map(function (section) { return section.statements; }));
        return found;
    };

    // A switch with goto case: a loop over the number of the section.
    G.switchMachine = function (stmt) {
        var self = this;
        var label = '$sw' + (++this.labelCounter);
        var value = J.id(this.fn.scope.temp());
        var state = J.id(this.fn.scope.temp());
        var type = stmt.expr.type;
        var select = [];
        var defaultIndex = -1;
        stmt.sections.forEach(function (section, index) {
            section.labels.forEach(function (caseLabel) {
                if (caseLabel.pattern === null) {
                    defaultIndex = index;
                    return;
                }
                var test = self.patternTest(caseLabel.pattern, value, type);
                if (caseLabel.when !== null)
                    test = J.and(test, self.expression(caseLabel.when));
                select.push({ test: test, index: index });
            });
        });
        // The number of the first matching section (-1 - none).
        var choose = J.num(defaultIndex);
        for (var position = select.length - 1; position >= 0; --position)
            choose = J.cond(select[position].test, J.num(select[position].index), choose);
        this.fn.breakTargets.push({ kind: 'switch', label: label, machine: { state: state, stmt: stmt, value: value } });
        var cases = stmt.sections.map(function (section, index) {
            return { test: J.num(index), body: [J.block(self.sectionBody(section))] };
        });
        this.fn.breakTargets.pop();
        cases.push({ test: null, body: [J.brk(label)] });
        var loop = J.label(label, J.for_(null, null, null, J.block([J.switch_(state, cases), J.brk(label)])));
        return J.at(J.block([J.expr(J.assign(value, this.expression(stmt.expr))), J.expr(J.assign(state, choose)), loop]), stmt.line);
    };

    G.stmt_gotoCase = function (stmt) {
        var targets = this.fn.breakTargets;
        for (var index = targets.length - 1; index >= 0; --index) {
            var target = targets[index];
            if (target.kind !== 'switch' || target.machine === undefined)
                continue;
            var machine = target.machine;
            var sections = machine.stmt.sections;
            var number = -1;
            sections.forEach(function (section, position) {
                section.labels.forEach(function (label) {
                    if (stmt.isDefault && label.pattern === null)
                        number = position;
                    if (!stmt.isDefault && label.pattern !== null && label.pattern.kind === 'constant' &&
                        String(label.pattern.value.constant) === String(stmt.value.constant))
                        number = position;
                });
            });
            if (number < 0)
                throw new T.CompileError("error CS0159: No such label 'case " + (stmt.value ? stmt.value.constant : 'default') +
                                         ":' within the scope of the goto statement", stmt.line, 0, this.source);
            return [J.expr(J.assign(machine.state, J.num(number))), J.cont(target.label)];
        }
        throw new Error('C# codegen: goto case outside a switch');
    };

    G.stmt_break = function (stmt) {
        var targets = this.fn.breakTargets;
        var index = targets.length - 1;
        while (index >= 0 && targets[index].kind === 'goto')
            --index;
        var target = targets[index];
        // Inside the loop of a goto: the target by its name.
        if (target !== undefined && index < targets.length - 1 && target.label === null)
            target.label = (target.kind === 'switch' ? '$sw' : '$loop') + (++this.labelCounter);
        if (target !== undefined && target.label !== null && (target.kind === 'switch' || index < targets.length - 1))
            return J.at(J.brk(target.label), stmt.line);
        return J.at(J.brk(), stmt.line);
    };

    G.stmt_continue = function (stmt) {
        // A continue inside a switch machine: the loop of the switch is not it.
        var targets = this.fn.breakTargets;
        for (var index = targets.length - 1; index >= 0; --index) {
            if (targets[index].kind === 'loop') {
                var crossesMachine = targets.slice(index + 1).some(function (target) {
                    return target.machine !== undefined || target.kind === 'goto';
                });
                if (crossesMachine) {
                    if (targets[index].label === null)
                        targets[index].label = '$loop' + (++this.labelCounter);
                    return J.at(J.cont(targets[index].label), stmt.line);
                }
                break;
            }
        }
        return J.at(J.cont(), stmt.line);
    };

    G.stmt_return = function (stmt) {
        if (this.fn.iterator)
            return J.at(J.ret(), stmt.line);
        if (stmt.expr === null)
            return J.at(J.ret(), stmt.line);
        var value = stmt.isRef ? this.reference({ target: stmt.expr }) : this.storedValue(stmt.expr);
        // A call in return is not a tail call in V4: the value goes through
        // a temporary (see docs/internals/v4-pitfalls.md).
        if (!J.isSimple(value) && !this.fn.generator) {
            var temp = this.temp();
            return [J.at(J.expr(J.assign(temp, value)), stmt.line), J.ret(temp)];
        }
        return J.at(J.ret(value), stmt.line);
    };

    G.stmt_throw = function (stmt) {
        if (stmt.expr === null)
            return J.at(J.throw_(J.id(this.currentCatch())), stmt.line);
        return J.at(J.throw_(J.call(this.rt('thrown'), [this.expression(stmt.expr)])), stmt.line);
    };

    G.currentCatch = function () {
        var stack = this.fn.catchStack || [];
        return stack[stack.length - 1];
    };

    // try/catch: the error converted to an exception, then the clauses by
    // their types and filters; no match throws it on.
    G.stmt_try = function (stmt) {
        var block = this.blockStatements(stmt.block);
        var param = null, handler = null;
        if (stmt.catches.length > 0) {
            param = '$e' + (++this.labelCounter);
            var caught = J.id(param);
            this.fn.catchStack = (this.fn.catchStack || []).concat([param]);
            var chain = J.throw_(caught);
            for (var index = stmt.catches.length - 1; index >= 0; --index) {
                var clause = stmt.catches[index];
                var body = [];
                if (clause.local !== null)
                    body.push(J.let_(this.localName(clause.local), caught));
                body = body.concat(this.blockStatements(clause.body));
                var test = clause.all || CS.isSpecial(clause.type, 'object') || clause.type.sym.qname === 'System.Exception'
                    ? null : J.call(this.rt('is'), [caught, this.typeRef(clause.type)]);
                if (clause.filter !== null) {
                    var filterParts = [];
                    if (clause.local !== null) {
                        this.declareHoisted(clause.local);
                        filterParts.push(J.assign(J.id(this.localName(clause.local)), caught));
                    }
                    filterParts.push(this.expression(clause.filter));
                    var filter = J.seq(filterParts);
                    test = test === null ? filter : J.and(test, filter);
                    if (clause.local !== null)
                        body.shift();
                }
                chain = test === null ? J.block(body) : J.if_(test, J.block(body), chain);
            }
            this.fn.catchStack = this.fn.catchStack.slice(0, -1);
            handler = [J.expr(J.assign(caught, J.call(this.rt('caught'), [caught]))), chain.k === 'block' ? chain : chain];
            if (chain.k === 'block')
                handler = [handler[0]].concat(chain.body);
        }
        var fin = stmt.fin !== null ? this.blockStatements(stmt.fin) : null;
        return J.at(J.try_(block, param, handler, fin), stmt.line);
    };

    G.stmt_lock = function (stmt) {
        var check = J.expr(J.call(this.rt('lockOn'), [this.expression(stmt.expr)]));
        var body = this.embedded(stmt.body);
        return J.at(J.block([check].concat(body.k === 'block' ? body.body : [body])), stmt.line);
    };

    // using: Dispose in finally (in the reverse order of the resources).
    G.stmt_using = function (stmt) {
        var body = this.embedded(stmt.body);
        var statements = body.k === 'block' ? body.body : [body];
        var setup = [];
        for (var index = stmt.resources.length - 1; index >= 0; --index) {
            var resource = stmt.resources[index];
            var name = resource.local !== null ? this.localName(resource.local) : this.fn.scope.temp();
            var dispose = J.call(this.rt(stmt.isAwait ? 'disposeAsync' : 'dispose'), [J.id(name)]);
            if (stmt.isAwait)
                dispose = J.yield_(dispose, true);
            statements = [J.try_(statements, null, null, [J.expr(dispose)])];
            var value = this.expression(resource.expr);
            setup.unshift(resource.local !== null ? J.let_(name, value) : J.expr(J.assign(J.id(name), value)));
        }
        return J.at(J.block(setup.concat(statements)), stmt.line);
    };

    G.stmt_yieldReturn = function (stmt) {
        var value = this.storedValue(stmt.expr);
        // In an async iterator other yields are waits of the scheduler.
        if (this.fn.asyncIterator)
            value = J.call(this.rt('item'), [value]);
        return J.at(J.expr(J.yield_(value)), stmt.line);
    };

    G.stmt_yieldBreak = function (stmt) {
        return J.at(J.ret(), stmt.line);
    };

    // A local function: a function of the block (declared at its start).
    G.localFunctionDeclaration = function (stmt) {
        var self = this;
        var method = stmt.method;
        var saved = this.fn;
        var fn = this.pushFunction('lambda', saved !== null ? saved.typeSym : null, saved !== null ? saved.method : method);
        fn.isStatic = saved !== null ? saved.isStatic : true;
        var params = method.typeParams.map(function (param) { return self.typeParamName(param); }).concat(
            method.paramLocals.map(function (local) { return self.localName(local); }));
        var body = this.functionBody(stmt.fn, stmt.body, method);
        var code = this.finishFunction(fn, stmt.fn, params, body, method);
        this.fn = saved;
        return [J.at(J.let_(this.localName(method.local), code), stmt.line)];
    };

    G.stmt_localFunction = function () {
        return [];
    };
})(globalThis);
