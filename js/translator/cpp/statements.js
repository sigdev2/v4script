// C++: statements (continues parser.js). A statement is parsed and checked
// at once into the tree that codegen translates: { k: 'block' | 'expr' |
// 'decl' | 'if' | 'while' | 'do' | 'for' | 'switch' | 'case' | 'default' |
// 'break' | 'continue' | 'return' | 'try' | 'empty', ... }. Expressions in
// it are checked trees (check.js).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var X = T.cpp;
    var Parser = X.Parser;
    if (Object.prototype.hasOwnProperty.call(Parser.prototype, 'statement'))
        return;

    var types = X.types;
    var big = T.big;

    Parser.prototype.statement = function () {
        this.skipAttributes();
        var tok = this.peek();
        if (tok.type === 'ident' && this.is(':', 1) && !this.is('::', 1)) {
            this.next();
            this.next();
            if (this.is('}'))
                return this.statementNode('empty', tok, {});
            return this.statement();
        }
        if (tok.type === 'keyword') {
            switch (tok.value) {
            case 'if':
                return this.ifStatement();
            case 'while':
                return this.whileStatement();
            case 'do':
                return this.doStatement();
            case 'for':
                return this.forStatement();
            case 'switch':
                return this.switchStatement();
            case 'case':
                return this.caseLabel();
            case 'default':
                if (!this.is(':', 1))
                    break;
                return this.defaultLabel();
            case 'break':
                this.next();
                this.expect(';');
                if (this.loops === 0 && this.switches.length === 0)
                    this.error(tok, 'break statement not within loop or switch');
                return this.statementNode('break', tok, {});
            case 'continue':
                this.next();
                this.expect(';');
                if (this.loops === 0)
                    this.error(tok, 'continue statement not within a loop');
                return this.statementNode('continue', tok, {});
            case 'return':
                return this.returnStatement();
            case 'try':
                return this.tryStatement();
            case 'goto':
                this.error(tok, 'goto is not supported');
                break;
            }
        }
        if (this.is('{'))
            return this.compoundStatement(true);
        if (this.accept(';'))
            return this.statementNode('empty', tok, {});
        if (this.startsDeclaration('block')) {
            var declarations = this.declaration('block');
            if (declarations.length === 1)
                return declarations[0];
            return this.statementNode('group', tok, { items: declarations });
        }
        var expr = this.expression();
        this.expect(';', "';'");
        var value = this.check(expr);
        // A discarded class value is a temporary destroyed at once.
        if (value.cat === 'prvalue' && unqualified(value.type).isClass)
            value = this.materialize(value);
        return this.statementNode('expr', tok, { expr: this.markFull(value) });
    };

    function unqualified(type) {
        return X.unqual(type);
    }

    // A statement as the body of if/while/for: a scope of its own.
    Parser.prototype.substatement = function () {
        if (this.is('{'))
            return this.compoundStatement(true);
        this.pushScope('block');
        try {
            var tok = this.peek();
            var statement = this.statement();
            return this.statementNode('block', tok, { items: [statement] });
        } finally {
            this.popScope();
        }
    };

    Parser.prototype.compoundStatement = function (newScope) {
        var tok = this.expect('{');
        if (newScope)
            this.pushScope('block');
        var items = [];
        try {
            while (!this.is('}')) {
                if (this.peek().type === 'eof')
                    this.fail("expected '}' at end of input", tok);
                items.push(this.statement());
            }
        } finally {
            if (newScope)
                this.popScope();
        }
        var end = this.next();
        return this.statementNode('block', tok, { items: items, endLine: end.line });
    };

    // A condition: an expression or a declaration with an initializer;
    // { decl, cond } where cond is a boolean tree.
    Parser.prototype.condition = function (what) {
        var tok = this.peek();
        if (this.startsDeclaration('block') && !this.is('(')) {
            var specs = this.declSpecifiers('block');
            if (this.startsBinding(specs)) {
                var bindings = this.structuredBinding(specs, tok);
                return { decl: bindings, cond: null };
            }
            var declarator = this.declarator(false, 'block');
            var name = X.declaratorName(declarator);
            var type = this.declaratorType(declarator, specs.type);
            var init = this.initializerSyntax();
            if (init === null)
                this.fail("expected initializer" + this.before());
            var decls = this.localVariable(name, type, init, specs);
            var object = decls[0].obj;
            var ref = this.node('name', name, { entity: object, name: name.name, qualifier: null, args: null });
            return { decl: decls, cond: what === 'switch' ? this.check(ref) : this.booleanCondition(ref) };
        }
        var expr = this.expression();
        return { decl: [], cond: what === 'switch' ? this.check(expr) : this.booleanCondition(expr) };
    };

    // An expression converted to bool (contextually).
    Parser.prototype.booleanCondition = function (syntax) {
        var expr = this.check(syntax);
        return this.markFull(this.contextualBool(expr, syntax));
    };

    Parser.prototype.ifStatement = function () {
        var tok = this.next();
        var isConstexpr = !!this.accept('constexpr');
        this.expect('(');
        this.pushScope('block');
        try {
            var init = [];
            if (this.hasInitStatement()) {
                init = this.initStatement();
            }
            var condition = this.condition('if');
            this.expect(')');
            if (isConstexpr)
                this.constantIr(condition.cond);
            if (isConstexpr && condition.cond.value !== undefined) {
                var taken = big.sign(condition.cond.value) !== 0;
                var then = taken ? this.substatement() : this.discardedStatement();
                var otherwise = null;
                if (this.accept('else'))
                    otherwise = taken ? this.discardedStatement() : this.substatement();
                var chosen = taken ? then : (otherwise || this.statementNode('empty', tok, {}));
                return this.statementNode('block', tok, { items: init.concat(condition.decl, [chosen]) });
            }
            var thenStatement = this.substatement();
            var elseStatement = null;
            if (this.accept('else'))
                elseStatement = this.substatement();
            var statement = this.statementNode('if', tok, { cond: condition.cond, then: thenStatement,
                                                            otherwise: elseStatement });
            if (init.length === 0 && condition.decl.length === 0)
                return statement;
            return this.statementNode('block', tok, { items: init.concat(condition.decl, [statement]) });
        } finally {
            this.popScope();
        }
    };

    // The branch of if constexpr that is not taken: skipped, not checked.
    Parser.prototype.discardedStatement = function () {
        var tok = this.peek();
        if (this.is('{')) {
            this.index = this.matching(this.index);
            return this.statementNode('empty', tok, {});
        }
        // Up to the ';' or the '}' of a body (while (...) { }) at depth 0.
        var depth = 0;
        var body = false;
        for (;;) {
            var previous = this.index > 0 ? this.tokens[this.index - 1] : null;
            var current = this.next();
            if (current.type === 'eof')
                break;
            if (current.type !== 'op' && current.type !== 'keyword')
                continue;
            if (current.value === '{' || current.value === '(' || current.value === '[') {
                if (current.value === '{' && depth === 0 && previous !== null &&
                    (previous.value === ')' || previous.value === 'else' || previous.value === 'try'))
                    body = true;
                ++depth;
            } else if (current.value === '}' || current.value === ')' || current.value === ']') {
                --depth;
                if (current.value === '}' && depth === 0 && body && tok.value !== 'do' && !this.is('catch') &&
                    !this.is('else'))
                    break;
            } else if (current.value === ';' && depth === 0) {
                break;
            }
        }
        if (tok.value === 'if' && this.is('else')) {
            this.next();
            this.discardedStatement();
        }
        return this.statementNode('empty', tok, {});
    };

    // if (init; cond) - whether there is an init-statement before ';'.
    Parser.prototype.hasInitStatement = function () {
        var depth = 0;
        for (var offset = 0; ; ++offset) {
            var tok = this.peek(offset);
            if (tok.type === 'eof')
                return false;
            if (tok.type !== 'op')
                continue;
            if (tok.value === '(' || tok.value === '[' || tok.value === '{')
                ++depth;
            else if (tok.value === ')' || tok.value === ']' || tok.value === '}') {
                if (depth === 0)
                    return false;
                --depth;
            } else if (tok.value === ';' && depth === 0)
                return true;
        }
    };

    Parser.prototype.initStatement = function () {
        if (this.accept(';'))
            return [];
        if (this.startsDeclaration('block'))
            return this.declaration('block');
        var tok = this.peek();
        var expr = this.expression();
        this.expect(';');
        return [this.statementNode('expr', tok, { expr: this.fullExpression(expr) })];
    };

    Parser.prototype.loopBody = function () {
        ++this.loops;
        try {
            return this.substatement();
        } finally {
            --this.loops;
        }
    };

    Parser.prototype.whileStatement = function () {
        var tok = this.next();
        this.expect('(');
        this.pushScope('block');
        try {
            var condition = this.condition('while');
            this.expect(')');
            var body = this.loopBody();
            return this.statementNode('while', tok, { cond: condition.cond, decl: condition.decl, body: body });
        } finally {
            this.popScope();
        }
    };

    Parser.prototype.doStatement = function () {
        var tok = this.next();
        var body = this.loopBody();
        this.expect('while');
        this.expect('(');
        var condition = this.booleanCondition(this.expression());
        this.expect(')');
        this.expect(';');
        return this.statementNode('do', tok, { body: body, cond: condition });
    };

    Parser.prototype.forStatement = function () {
        var tok = this.next();
        this.expect('(');
        this.pushScope('block');
        try {
            if (this.isRangeFor())
                return this.rangeFor(tok);
            var init = this.initStatement();
            var condition = null;
            var conditionDecl = [];
            if (!this.is(';')) {
                var parsed = this.condition('for');
                condition = parsed.cond;
                conditionDecl = parsed.decl;
            }
            this.expect(';');
            var step = null;
            if (!this.is(')'))
                step = this.fullExpression(this.expression());
            this.expect(')');
            var body = this.loopBody();
            if (conditionDecl.length > 0)
                this.error(tok, 'a declaration in the condition of for is not supported');
            return this.statementNode('for', tok, { init: init, cond: condition, step: step, body: body });
        } finally {
            this.popScope();
        }
    };

    // for (decl : range) - a ':' at depth 0 before ')'.
    Parser.prototype.isRangeFor = function () {
        var depth = 0;
        for (var offset = 0; ; ++offset) {
            var tok = this.peek(offset);
            if (tok.type === 'eof')
                return false;
            if (tok.type !== 'op')
                continue;
            if (tok.value === '(' || tok.value === '[' || tok.value === '{')
                ++depth;
            else if (tok.value === ')' || tok.value === ']' || tok.value === '}') {
                if (depth === 0)
                    return false;
                --depth;
            } else if (depth === 0 && (tok.value === ';'))
                return false;
            else if (depth === 0 && tok.value === ':')
                return true;
        }
    };

    // for (x : {1, 2, 3}): the range is a std::initializer_list.
    Parser.prototype.listRange = function (syntax, tok) {
        var items = this.checkListItems(syntax.items);
        if (items.length === 0 || items[0].k === 'braced' || items[0].k === 'designated')
            this.error(tok, "unable to deduce 'std::initializer_list<auto>&&' from '" + this.describeSyntax(syntax) +
                       "'");
        var listType = this.specialize(this.session.stdTemplate('initializer_list'),
                                       [{ kind: 'type', type: X.decay(X.unqual(items[0].type)) }], tok);
        var checked = items.map(function (item) {
            return item.k === 'braced' ? item : { k: 'checked', ir: item, line: tok.line, file: tok.file };
        });
        return this.listInitialize(listType, checked, syntax, true);
    };

    // for (T x : range) body, as the standard spells it out:
    // auto&& r = range; for (auto b = begin, e = end; b != e; ++b) { T x = *b; body }
    Parser.prototype.rangeFor = function (tok) {
        var specs = this.declSpecifiers('block');
        var bindingNames = null;
        var declarator = null;
        if (this.startsBinding(specs)) {
            this.next();
            bindingNames = [];
            do {
                bindingNames.push(this.expectIdent());
            } while (this.accept(','));
            this.expect(']');
        } else {
            declarator = this.declarator(false, 'block');
        }
        this.expect(':');
        var rangeTok = this.peek();
        var rangeSyntax = this.is('{') ? this.bracedList() : this.expression();
        this.expect(')');
        var range = rangeSyntax.k === 'braced' ? this.listRange(rangeSyntax, rangeTok) : this.check(rangeSyntax);
        var statements = [];
        // The range: a reference to it (a temporary lives as long as the loop).
        var rangeType = range.cat === 'prvalue' ? X.rref(range.type) : X.lref(range.type);
        var rangeObject = this.func.newLocal('__for_range', rangeType, rangeTok);
        statements.push(this.statementNode('decl', rangeTok, { obj: rangeObject,
                                                               init: this.bindReference(rangeType, range, rangeTok) }));
        var rangeRef = this.node('name', rangeTok,
                                 { entity: rangeObject, name: '__for_range', qualifier: null, args: null });
        var beginSyntax, endSyntax;
        var plain = X.unqual(range.type);
        if (plain.kind === 'array') {
            beginSyntax = rangeRef;
            endSyntax = this.node('binary', rangeTok, { op: '+', left: rangeRef,
                                                        right: this.node('int', rangeTok,
                                                                         { text: String(plain.length) }) });
        } else if (plain.isClass &&
                   (X.lookupMember(plain, 'begin') !== null && X.lookupMember(plain, 'end') !== null)) {
            beginSyntax = this.memberCallSyntax(rangeRef, 'begin', rangeTok);
            endSyntax = this.memberCallSyntax(rangeRef, 'end', rangeTok);
        } else {
            beginSyntax = this.freeCallSyntax('begin', [rangeRef], rangeTok);
            endSyntax = this.freeCallSyntax('end', [rangeRef], rangeTok);
        }
        var beginIr = this.check(beginSyntax);
        var endIr = this.check(endSyntax);
        var beginObject = this.func.newLocal('__for_begin', X.decay(beginIr.type), rangeTok);
        var endObject = this.func.newLocal('__for_end', X.decay(endIr.type), rangeTok);
        statements.push(this.statementNode('decl', rangeTok, {
            obj: beginObject, init: this.initializeFrom(beginObject.type, beginIr, rangeTok) }));
        statements.push(this.statementNode('decl', rangeTok, {
            obj: endObject, init: this.initializeFrom(endObject.type, endIr, rangeTok) }));
        var beginRef = this.node('name', rangeTok,
                                 { entity: beginObject, name: '__for_begin', qualifier: null, args: null });
        var endRef = this.node('name', rangeTok, { entity: endObject, name: '__for_end', qualifier: null, args: null });
        var condition = this.booleanCondition(this.node('binary', rangeTok,
                                                        { op: '!=', left: beginRef, right: endRef }));
        var step = this.fullExpression(this.node('preinc', rangeTok, { op: '++', expr: beginRef }));
        // The loop variable in the body scope.
        this.pushScope('block');
        var bodyItems;
        try {
            var element = this.node('unary', rangeTok, { op: '*', expr: beginRef });
            var elementDecl;
            if (bindingNames !== null) {
                elementDecl = this.bindStructured(specs, bindingNames, tok, element);
            } else {
                var name = X.declaratorName(declarator);
                var type = this.declaratorType(declarator, specs.type);
                elementDecl = this.localVariable(name, type, this.node('copy', rangeTok, { expr: element }), specs);
            }
            var body = this.loopBody();
            bodyItems = elementDecl.concat([body]);
        } finally {
            this.popScope();
        }
        statements.push(this.statementNode('for', tok, {
            init: [], cond: condition, step: step, body: this.statementNode('block', tok, { items: bodyItems }) }));
        return this.statementNode('block', tok, { items: statements });
    };

    Parser.prototype.memberCallSyntax = function (object, name, tok) {
        var member = this.node('member', tok, { expr: object, arrow: false,
                                                 name: this.node('name', tok, { name: name, qualifier: null, args: null,
                                                                                entity: null }) });
        return this.node('call', tok, { fn: member, args: [] });
    };

    Parser.prototype.freeCallSyntax = function (name, args, tok) {
        var callee = this.node('name', tok, { name: name, qualifier: null, args: null, entity: this.lookup(name),
                                               adlOnly: this.lookup(name) === null });
        return this.node('call', tok, { fn: callee, args: args });
    };

    // --- switch

    Parser.prototype.switchStatement = function () {
        var tok = this.next();
        this.expect('(');
        this.pushScope('block');
        try {
            var init = this.hasInitStatement() ? this.initStatement() : [];
            var condition = this.condition('switch');
            this.expect(')');
            var value = condition.cond;
            var valueType = X.unqual(value.type);
            if (valueType.isClass)
                value = this.convertToIntegral(value, tok);
            valueType = X.unqual(value.type);
            if (!X.isIntegralLike(valueType) && valueType.kind !== 'enum')
                this.error(tok, "switch quantity not an integer");
            var opType = X.promote(valueType);
            var info = { opType: opType, values: Object.create(null), hasDefault: false };
            this.switches.push(info);
            var body;
            try {
                body = this.substatement();
            } finally {
                this.switches.pop();
            }
            var statement = this.statementNode('switch', tok, { expr: this.markFull(this.convertScalar(value, opType)),
                                                                opType: opType, body: body });
            if (init.length === 0 && condition.decl.length === 0)
                return statement;
            return this.statementNode('block', tok, { items: init.concat(condition.decl, [statement]) });
        } finally {
            this.popScope();
        }
    };

    Parser.prototype.caseLabel = function () {
        var tok = this.next();
        var current = this.switches[this.switches.length - 1];
        if (current === undefined)
            this.error(tok, "case label not within a switch statement");
        var low = this.caseValue(current);
        var high = low;
        if (this.accept('...'))
            high = this.caseValue(current);
        this.expect(':');
        var key = big.str(low);
        if (current.values[key])
            this.error(tok, "duplicate case value");
        current.values[key] = true;
        return this.statementNode('case', tok, { low: low, high: high });
    };

    Parser.prototype.caseValue = function (current) {
        var syntax = this.conditional();
        var value = this.constantValue(syntax, 'case label');
        return X.wrapValue(value, current.opType);
    };

    Parser.prototype.defaultLabel = function () {
        var tok = this.next();
        this.expect(':');
        var current = this.switches[this.switches.length - 1];
        if (current === undefined)
            this.error(tok, "'default' label not within a switch statement");
        if (current.hasDefault)
            this.error(tok, 'multiple default labels in one switch');
        current.hasDefault = true;
        return this.statementNode('default', tok, {});
    };

    // --- return

    Parser.prototype.returnStatement = function () {
        var tok = this.next();
        var context = this.func;
        var syntax = null;
        if (!this.is(';'))
            syntax = this.is('{') ? this.bracedList() : this.expression();
        this.expect(';', "';'");
        if (context.isTop)
            this.error(tok, "return statement outside of a function is not supported");
        var returns = context.returnType;
        if (X.containsAuto(returns)) {
            returns = this.deduceReturn(context, syntax, tok);
        }
        var plain = X.unqual(returns);
        if (syntax === null) {
            if (plain.kind !== 'void' && !context.isCtor && !context.isDtor)
                this.error(tok, "return-statement with no value, in function returning '" + X.typeString(returns) +
                           "'");
            return this.statementNode('return', tok, { value: null });
        }
        if (plain.kind === 'void') {
            var expr = this.check(syntax);
            if (X.unqual(expr.type).kind !== 'void')
                this.error(tok, "return-statement with a value, in function returning 'void'");
            return this.statementNode('return', tok, { value: null, effect: this.markFull(expr) });
        }
        var value = this.initializeReturn(returns, syntax, tok);
        var statement = this.statementNode('return', tok, { value: this.markFull(value), type: returns });
        if (X.isRecord(plain))
            context.classReturns.push({ statement: statement, object: this.returnedLocal(syntax, plain) });
        return statement;
    };

    // The local object that return names: a candidate for the return slot
    // when it is declared in the outermost block, as g++ 13 requires.
    Parser.prototype.returnedLocal = function (syntax, type) {
        while (syntax.k === 'paren')
            syntax = syntax.expr;
        if (syntax.k !== 'name' || syntax.qualifier !== null && syntax.qualifier !== undefined)
            return null;
        var object = syntax.entity;
        if (object === null || object === undefined || object.kind !== 'var' || object.storage !== 'local' ||
            object.param || !object.outermost || object.context !== this.func || X.isRef(object.type) ||
            X.unqual(object.type) !== type || (X.cvOf(object.type) & X.VOLATILE) !== 0)
            return null;
        return object;
    };

    // The return type of auto f() from its first return.
    Parser.prototype.deduceReturn = function (context, syntax, tok) {
        var deduced;
        if (syntax === null) {
            deduced = types.void;
        } else {
            var probe = this.check(syntax);
            deduced = this.deducePlaceholder(context.returnType, probe, tok);
        }
        context.returnType = deduced;
        if (context.func !== null) {
            var type = context.func.type;
            context.func.type = X.functionType(deduced, type.params, type.variadic, type.cv, type.ref, type.noexcept);
            if (context.lambdaClass)
                context.lambdaClass.returnDeduced = deduced;
        }
        return deduced;
    };

    // --- try

    Parser.prototype.tryStatement = function () {
        var tok = this.next();
        var body = this.compoundStatement(true);
        var handlers = [];
        while (this.is('catch')) {
            var catchTok = this.next();
            this.expect('(');
            this.pushScope('catch');
            try {
                var handler = { type: null, obj: null, line: catchTok.line };
                if (this.accept('...')) {
                    handler.all = true;
                } else {
                    var specs = this.typeSpecifiers();
                    var declarator = this.declarator(true, 'param');
                    var type = this.declaratorType(declarator, specs.type);
                    handler.type = type;
                    var name = X.declaratorName(declarator);
                    var objectName = name !== null ? name.name : '__exception';
                    handler.obj = this.func.newLocal(objectName, type, catchTok);
                    if (name !== null)
                        X.declare(this.scope, name.name, handler.obj);
                    var caught = X.unqual(X.removeRef(type));
                    if (caught.isClass && !caught.complete)
                        this.error(catchTok, "invalid use of incomplete type '" + X.typeString(caught) + "'");
                    if (!X.isRef(type) && caught.isClass)
                        handler.copy = this.copyFromAddress(caught, catchTok);
                }
                this.expect(')');
                handler.body = this.compoundStatement(false);
                handlers.push(handler);
            } finally {
                this.popScope();
            }
        }
        if (handlers.length === 0)
            this.fail("expected 'catch'" + this.before());
        this.func.hasTry = true;
        return this.statementNode('try', tok, { body: body, handlers: handlers });
    };
})(globalThis);
