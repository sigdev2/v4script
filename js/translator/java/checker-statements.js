// Java: checking statements, reachability, the bodies of methods and classes.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Java = T.java;
    var Checker = Java.Checker;
    if (Checker.prototype.statement)
        return;

    var types = Java.types;
    var localCounter = 0;

    // A local variable. A name cannot repeat in the same method or lambda
    // (except the variables of instanceof patterns).
    Checker.prototype.declareLocal = function (name, type, env, node, options) {
        options = options || {};
        for (var current = env; current !== null; current = current.parent) {
            if (current.vars !== null && current.vars[name] !== undefined) {
                var existing = current.vars[name];
                if (!(options.pattern && existing.pattern))
                    this.error(node, 'variable ' + name + ' is already defined in ' + this.scopeText(env));
            }
            if (current.kind === 'method' || current.kind === 'class' || current.kind === 'top')
                break;
        }
        var variable = { kind: 'local', name: name, type: type, node: node, isFinal: !!options.isFinal,
                         hasInit: !!options.hasInit || !!options.param || !!options.pattern, pattern: !!options.pattern,
                         param: !!options.param, jsName: T.jsName(name) };
        if (options.pattern)
            variable.jsName = T.jsName(name) + '$' + (++localCounter);
        env.declareVar(variable);
        return variable;
    };

    Checker.prototype.scopeText = function (env) {
        for (var current = env; current !== null; current = current.parent) {
            if (current.kind === 'method' && current.method && current.method.name)
                return current.method.isCtor ? 'constructor ' + current.method.owner.name + '(' +
                    current.method.params.map(function (param) { return Java.typeString(param); }).join(',') + ')'
                    : 'method ' + current.method.name + '(' + current.method.params.map(function (param) { return Java.typeString(param); }).join(',') + ')';
            if (current.kind === 'top')
                return 'this block';
        }
        return 'this scope';
    };

    Checker.prototype.blockStatements = function (statements, env) {
        for (var index = 0; index < statements.length; ++index) {
            if (index > 0 && !this.canCompleteNormally(statements[index - 1]))
                this.error(statements[index], 'unreachable statement');
            this.statement(statements[index], env);
        }
    };
    Checker.prototype.statement = function (node, env) {
        var self = this;
        switch (node.k) {
        case 'block':
            this.blockStatements(node.statements, env.child('block'));
            return;
        case 'local':
            this.localDeclaration(node, env);
            return;
        case 'localclass':
            this.localClass(node, env);
            return;
        case 'expr':
            if (node.expr.statementValue && !node.valueAllowed)
                this.error(node.expr, 'not a statement');
            this.expr(node.expr, env);
            return;
        case 'empty':
            return;
        case 'if': {
            this.condition(node.cond, env);
            this.statement(node.then, env.child('block'));
            if (node.otherwise !== null)
                this.statement(node.otherwise, env.child('block'));
            return;
        }
        case 'while':
            this.condition(node.cond, env);
            this.loopBody(node, node.body, env);
            return;
        case 'do':
            this.loopBody(node, node.body, env);
            this.condition(node.cond, env);
            return;
        case 'for': {
            var forEnv = env.child('block');
            node.init.forEach(function (item) { self.statement(item, forEnv); });
            if (node.cond !== null)
                this.condition(node.cond, forEnv);
            node.update.forEach(function (item) { self.expr(item.expr, forEnv); });
            this.loopBody(node, node.body, forEnv);
            return;
        }
        case 'foreach':
            this.foreachStatement(node, env);
            return;
        case 'labeled':
            if (this.labelTarget(env, node.label) !== null)
                this.error(node, 'label ' + node.label + ' already in use');
            this.statement(node.body, env.child('block', { label: node.label, labeled: node }));
            return;
        case 'break':
        case 'continue':
            this.jumpStatement(node, env);
            return;
        case 'return':
            this.returnStatement(node, env);
            return;
        case 'throw':
            this.throwStatement(node, env);
            return;
        case 'switch':
            this.switchStatement(node, env);
            return;
        case 'try':
            this.tryStatement(node, env);
            return;
        case 'sync':
            this.expr(node.lock, env);
            this.statement(node.body, env.child('block'));
            return;
        case 'assert':
            this.condition(node.cond, env);
            if (node.message !== null)
                this.expr(node.message, env);
            return;
        case 'yield':
            this.yieldStatement(node, env);
            return;
        case 'ctorcall':
            this.error(node, 'call to ' + node.kind + ' must be first statement in constructor');
            return;
        }
        this.error(node, 'not a statement');
    };

    Checker.prototype.loopBody = function (loop, body, env) {
        this.statement(body, env.child('block', { loop: loop }));
    };
    // Local variables; var takes the type of the initializer.
    Checker.prototype.localDeclaration = function (node, env) {
        var self = this;
        var declared = this.resolveType(node.type, env, true);
        node.vars.forEach(function (variable) {
            var type = declared;
            if (type === null) {
                if (variable.init === null)
                    self.error(variable, 'cannot infer type for local variable ' + variable.name + "; (cannot use 'var' on variable without initializer)");
                if (variable.init.k === 'arrayinit')
                    self.error(variable, 'cannot infer type for local variable ' + variable.name + '; (array initializer needs an explicit target-type)');
                if (variable.init.k === 'lambda' || variable.init.k === 'methodref')
                    self.error(variable, 'cannot infer type for local variable ' + variable.name + '; (lambda expression needs an explicit target-type)');
                self.expr(variable.init, env);
                type = Java.finalType(variable.init.type);
                if (type.kind === 'null')
                    self.error(variable, 'cannot infer type for local variable ' + variable.name + "; (variable initializer is 'null')");
                if (type.kind === 'void')
                    self.error(variable, 'cannot infer type for local variable ' + variable.name + "; (variable initializer is 'void')");
            } else {
                type = self.resolveType(variable.type, env);
                if (variable.init !== null)
                    self.exprAs(variable.init, env, type);
            }
            variable.declaredType = type;
            var local = self.declareLocal(variable.name, type, env, variable, { isFinal: !!node.mods.final,
                                                                                hasInit: variable.init !== null });
            // A constant: final with a constant initializer.
            if (node.mods.final && variable.init !== null && variable.init.cv !== undefined &&
                (Java.resolved(type).kind === 'prim' || Java.typeString(type) === 'String'))
                local.cv = Java.convertConstant(variable.init.cv, Java.primitiveOf(variable.init.type) || variable.init.type,
                                                Java.resolved(type).kind === 'prim' ? type : { name: 'String' });
            variable.local = local;
        });
    };

    Checker.prototype.localClass = function (node, env) {
        var decl = node.decl;
        var sym = this.enterClass(decl, null, env, '', false);
        sym.isLocal = true;
        var enclosing = env.enclosing('class');
        sym.enclosingClass = enclosing !== null ? enclosing.cls : null;
        sym.jsId = 'Local$' + sym.name + '$' + sym.jsId;
        sym.binaryName = this.nestedBinaryName(env, sym.name);
        sym.displayName = decl.name;
        if (decl.kind === 'class' && sym.enclosingClass !== null && !this.isStaticContext(env, sym.enclosingClass))
            sym.capturesThis = true;
        env.declareType(sym);
        sym.complete();
        this.checkClassBody(sym);
    };

    // for (T x : an array or an Iterable).
    Checker.prototype.foreachStatement = function (node, env) {
        var iterableType = Java.resolved(this.expr(node.iterable, env));
        var elem;
        if (iterableType.kind === 'array') {
            elem = iterableType.elem;
            node.overArray = true;
        } else {
            var classType = this.classOf(iterableType);
            var iterable = classType === null ? null : Java.asSuper(classType, Java.symtab.classNamed('java.lang.Iterable'));
            if (iterable === null)
                this.error(node.iterable, 'for-each not applicable to expression type; required: array or java.lang.Iterable, found: ' +
                           this.typeName(iterableType));
            elem = iterable.args.length > 0 ? Java.resolved(iterable.args[0]) : Java.objectType();
            if (elem.kind === 'wild')
                elem = elem.upper && elem.bound !== null ? elem.bound : Java.objectType();
        }
        var bodyEnv = env.child('block', { loop: node });
        var declared = this.resolveType(node.type, env, true);
        var type = declared === null ? elem : declared;
        if (declared !== null && !Java.isAssignable(elem, declared))
            this.error(node, 'incompatible types: ' + this.typeName(elem) + ' cannot be converted to ' + this.typeName(declared));
        node.elemType = elem;
        node.variable = this.declareLocal(node.name, type, bodyEnv, node, { isFinal: !!node.mods.final, hasInit: true });
        this.statement(node.body, bodyEnv);
    };
    // A labeled statement in this method (or null).
    Checker.prototype.labelTarget = function (env, label) {
        for (var current = env; current !== null; current = current.parent) {
            if (current.label === label)
                return current.labeled;
            if (current.kind === 'method' || current.kind === 'lambda' || current.kind === 'class' || current.kind === 'top')
                return null;
        }
        return null;
    };

    Checker.prototype.jumpStatement = function (node, env) {
        if (node.label !== null) {
            var target = this.labelTarget(env, node.label);
            if (target === null)
                this.error(node, 'undefined label: ' + node.label);
            if (node.k === 'continue') {
                var body = target.body;
                if (body.k !== 'while' && body.k !== 'do' && body.k !== 'for' && body.k !== 'foreach')
                    this.error(node, 'not a loop label: ' + node.label);
                node.target = body;
            } else {
                node.target = target;
            }
            return;
        }
        for (var current = env; current !== null; current = current.parent) {
            if (current.loop !== undefined) {
                node.target = current.loop;
                return;
            }
            if (node.k === 'break' && current.switchNode !== undefined) {
                node.target = current.switchNode;
                return;
            }
            if (current.switchExpr !== undefined)
                this.error(node, 'attempting to ' + node.k + ' out of a switch expression');
            if (current.kind === 'method' || current.kind === 'lambda' || current.kind === 'class' || current.kind === 'top')
                break;
        }
        this.error(node, node.k === 'break' ? 'break outside switch or loop' : 'continue outside of loop');
    };

    // The nearest method or lambda.
    Checker.prototype.functionEnv = function (env) {
        for (var current = env; current !== null; current = current.parent) {
            if (current.kind === 'method' || current.kind === 'lambda')
                return current;
            if (current.switchExpr !== undefined)
                return current;
            if (current.kind === 'class' || current.kind === 'top')
                return null;
        }
        return null;
    };

    Checker.prototype.returnStatement = function (node, env) {
        var owner = this.functionEnv(env);
        if (owner === null || owner.topLevel)
            this.error(node, 'return outside method');
        if (owner.switchExpr !== undefined)
            this.error(node, 'attempting to return out of a switch expression');
        if (owner.kind === 'lambda') {
            var returns = Java.resolved(owner.returns);
            if (node.expr === null) {
                if (returns.kind !== 'void')
                    this.error(node, 'bad return type in lambda expression: missing return value');
                return;
            }
            if (returns.kind === 'void')
                this.error(node.expr, 'bad return type in lambda expression: unexpected return value');
            this.expr(node.expr, env, owner.returns);
            this.lambdaReturn(node.expr, owner.returns);
            return;
        }
        var method = owner.method;
        var expected = method.isCtor || method.isInit ? types.void : method.returns;
        if (node.expr === null) {
            if (expected.kind !== 'void')
                this.error(node, 'incompatible types: missing return value');
            return;
        }
        if (expected.kind === 'void')
            this.error(node.expr, 'incompatible types: unexpected return value');
        this.exprAs(node.expr, env, expected);
    };

    Checker.prototype.throwStatement = function (node, env) {
        this.expr(node.expr, env);
        var throwable = Java.classType(Java.symtab.classNamed('java.lang.Throwable'), []);
        if (!Java.isSubtype(node.expr.type, throwable))
            this.error(node.expr, 'incompatible types: ' + this.typeName(node.expr.type) + ' cannot be converted to Throwable');
    };

    Checker.prototype.yieldStatement = function (node, env) {
        for (var current = env; current !== null; current = current.parent) {
            if (current.switchExpr !== undefined) {
                this.switchArmValue(node.expr, env, current.switchExpr);
                node.target = current.switchExpr.node;
                return;
            }
            if (current.kind === 'method' || current.kind === 'lambda' || current.kind === 'class' || current.kind === 'top')
                break;
        }
        this.error(node, 'yield outside of switch expression');
    };
    // --- switch

    // The kind of a switch: int, string, enum or pattern (a reference).
    Checker.prototype.switchSelector = function (node, env) {
        var type = Java.resolved(this.expr(node.selector, env));
        var prim = Java.primitiveOf(type);
        if (prim !== null && (prim.name === 'int' || prim.name === 'char' || prim.name === 'short' || prim.name === 'byte'))
            return { kind: 'int', type: type, prim: prim };
        if (prim !== null)
            this.error(node.selector, 'constant label of type ' + prim.name + ' is not compatible with switch selector');
        if (type.kind === 'class' && type.sym.qname === 'java.lang.String')
            return { kind: 'string', type: type };
        if (type.kind === 'class' && type.sym.complete().flavor === 'enum')
            return { kind: 'enum', type: type, sym: type.sym };
        return { kind: 'pattern', type: type };
    };

    // The labels of one case; patterns declare variables in armEnv.
    Checker.prototype.caseLabels = function (entry, selector, seen, armEnv, info) {
        var self = this;
        entry.labels.forEach(function (label) {
            if (label.k === 'pattern' || label.k === 'recordpattern') {
                var total = self.checkPattern(label, selector.type, armEnv, false);
                if (entry.guard === null) {
                    if (total)
                        info.total = true;
                    if (label.covers)
                        (info.covered = info.covered || []).push(label.testType.sym);
                }
                info.patterns = true;
                return;
            }
            if (label.k === 'literal' && label.kind === 'null') {
                if (selector.kind === 'int')
                    self.error(label, 'incompatible types: <null> cannot be converted to ' + self.typeName(selector.type));
                label.isNull = true;
                if (seen['null'])
                    self.error(label, 'duplicate case label');
                seen['null'] = true;
                return;
            }
            if (selector.kind === 'enum' && (label.k === 'name' || label.k === 'select')) {
                var name = label.name;
                var field = selector.sym.fields[name];
                if (field === undefined || field.enumConstant === undefined)
                    self.error(label, 'an enum switch case label must be the unqualified name of an enumeration constant');
                label.enumField = field;
                if (seen['enum:' + name])
                    self.error(label, 'duplicate case label');
                seen['enum:' + name] = true;
                info.enumCount = (info.enumCount || 0) + 1;
                return;
            }
            self.expr(label, armEnv);
            if (label.cv === undefined)
                self.error(label, 'constant expression required');
            if (selector.kind === 'pattern')
                self.error(label, 'constant label of type ' + self.typeName(label.type) + ' is not compatible with switch selector');
            var target = selector.kind === 'int' ? selector.prim : selector.type;
            if (!Java.isAssignable(label.type, target, label.cv))
                self.checkAssignable(label, target);
            var key = selector.kind === 'string' ? 's:' + label.cv : 'n:' + Java.convertConstant(label.cv, Java.primitiveOf(label.type), selector.prim);
            if (seen[key])
                self.error(label, 'duplicate case label');
            seen[key] = true;
            label.caseValue = selector.kind === 'string' ? label.cv : Java.convertConstant(label.cv, Java.primitiveOf(label.type), types.int);
        });
        if (entry.guard !== null)
            this.condition(entry.guard, armEnv);
    };
    // Shared by switch: labels, branch bodies. info.isExpr - for an expression.
    Checker.prototype.switchBody = function (node, env, info) {
        var self = this;
        var selector = this.switchSelector(node, env);
        node.selectorInfo = selector;
        var seen = Object.create(null);
        var hasDefault = false;
        var blockEnv = env.child('block', info.isExpr ? { switchExpr: info } : { switchNode: node });
        node.cases.forEach(function (entry) {
            if (entry.isDefault) {
                if (hasDefault)
                    self.error(entry, 'duplicate default label');
                hasDefault = true;
            }
            var armEnv = node.arrow ? blockEnv.child('block') : blockEnv;
            self.caseLabels(entry, selector, seen, armEnv, info);
            if (!node.arrow) {
                self.blockStatements(entry.body, armEnv);
                return;
            }
            self.switchArm(entry, armEnv, info);
        });
        node.hasDefault = hasDefault;
        var enumCount = selector.kind === 'enum' ? Object.keys(selector.sym.fields).filter(function (name) {
            return selector.sym.fields[name].enumConstant !== undefined;
        }).length : -1;
        node.exhaustive = hasDefault || !!info.total || (selector.kind === 'enum' && info.enumCount === enumCount) ||
            (selector.kind === 'pattern' && info.covered !== undefined && this.sealedCovered(selector.type, info.covered));
        if ((info.isExpr || info.patterns) && !node.exhaustive)
            this.error(node, info.isExpr ? 'the switch expression does not cover all possible input values'
                                         : 'the switch statement does not cover all possible input values');
    };

    // A pattern (case, instanceof): declares variables; true if it matches
    // any value of the type type (except null at the top level).
    // pattern.covers - the pattern catches any value of its class (for the
    // exhaustiveness of a switch over a sealed hierarchy).
    Checker.prototype.checkPattern = function (pattern, type, env, nested) {
        var self = this;
        type = Java.resolved(type);
        if (pattern.k === 'pattern') {
            var declared = this.resolveType(pattern.type, env, nested);
            var patternType = declared === null ? type : declared;
            if (declared === null && !nested)
                this.error(pattern, "'var' is not allowed here");
            if (patternType.kind === 'prim' || type.kind === 'prim') {
                if (!(patternType.kind === 'prim' && type.kind === 'prim' && patternType.name === type.name))
                    this.error(pattern, 'incompatible types: ' + this.typeName(type) + ' cannot be converted to ' + this.typeName(patternType));
            } else if (!this.isCastable(type, patternType)) {
                this.error(pattern, 'incompatible types: ' + this.typeName(type) + ' cannot be converted to ' + this.typeName(patternType));
            }
            pattern.testType = patternType;
            pattern.variable = this.declareLocal(pattern.name, patternType, env, pattern, { pattern: true });
            pattern.total = patternType.kind === 'prim' || Java.isSubtypeNoBounds(Java.erasure(type), Java.erasure(patternType));
            pattern.covers = patternType.kind === 'class';
            return pattern.total;
        }
        var recordType = this.resolveType(pattern.type, env);
        if (recordType.kind !== 'class' || recordType.sym.complete().flavor !== 'record')
            this.error(pattern, Java.typeString(recordType) + ' is not a record class');
        var sym = recordType.sym;
        if (recordType.args.length === 0 && sym.typeParams.length > 0) {
            var fromSelector = Java.asSuper(type, sym);
            if (fromSelector !== null)
                recordType = fromSelector;
        }
        if (!this.isCastable(type, recordType))
            this.error(pattern, 'incompatible types: ' + this.typeName(type) + ' cannot be converted to ' + this.typeName(recordType));
        var components = sym.node.components;
        if (components.length !== pattern.patterns.length)
            this.error(pattern, 'incorrect number of nested patterns; required: ' +
                       components.map(function (component) { return Java.typeString(sym.fields[component.name].type); }).join(',') +
                       '; found: ' + pattern.patterns.length);
        var map = Java.typeMap(recordType);
        pattern.testType = recordType;
        pattern.accessors = components.map(function (component) {
            return sym.methods[component.name].filter(function (method) { return method.params.length === 0; })[0];
        });
        var allTotal = true;
        pattern.patterns.forEach(function (sub, index) {
            var componentType = Java.subst(sym.fields[components[index].name].type, map);
            if (!self.checkPattern(sub, componentType, env, true))
                allTotal = false;
        });
        pattern.covers = allTotal;
        pattern.total = allTotal && Java.isSubtypeNoBounds(Java.erasure(type), Java.erasure(recordType));
        return pattern.total;
    };

    // Whether the patterns cover a type: the class itself or (sealed) all
    // permitted subclasses, each one covered.
    Checker.prototype.sealedCovered = function (type, covered) {
        var self = this;
        type = Java.resolved(type);
        var sym = type.kind === 'class' ? type.sym : null;
        if (sym === null)
            return false;
        var seen = [];
        function covers(current) {
            if (covered.indexOf(current) >= 0)
                return true;
            if (seen.indexOf(current) >= 0)
                return false;
            seen.push(current);
            current.complete();
            if (!current.mods.sealed)
                return false;
            var subclasses = self.permittedSubclasses(current);
            return subclasses.length > 0 && subclasses.every(covers);
        }
        return covers(sym);
    };

    // The subclasses of a sealed class: from permits, otherwise the direct
    // subclasses declared next to it (in the same class or unit).
    Checker.prototype.permittedSubclasses = function (sym) {
        if (sym.permitted !== undefined)
            return sym.permitted;
        var result = [];
        if (sym.node.permits) {
            var checker = sym.checker || this;
            result = sym.node.permits.map(function (item) { return checker.resolveType(item, sym.env).sym; });
        } else {
            var top = sym;
            while (top.outer !== null && top.outer !== undefined)
                top = top.outer;
            var candidates = [];
            var collect = function (current) {
                candidates.push(current);
                Object.keys(current.memberTypes).forEach(function (name) { collect(current.memberTypes[name]); });
            };
            if (top.library) {
                collect(top);
            } else {
                var session = this.session;
                var names = Object.keys(session.userClasses).concat(session.pending ? Object.keys(session.pending.classes) : []);
                names.forEach(function (name) { collect(session.userClass(name)); });
            }
            result = candidates.filter(function (candidate) {
                candidate.complete();
                var direct = (candidate.superclass !== null ? [candidate.superclass] : []).concat(candidate.interfaces);
                return direct.some(function (parent) { return parent.sym === sym; });
            });
        }
        sym.permitted = result;
        return result;
    };

    // An arrow branch: an expression, a block or throw.
    Checker.prototype.switchArm = function (entry, armEnv, info) {
        var body = entry.body;
        if (body.k !== 'expr') {
            this.statement(body, armEnv);
            if (info.isExpr && body.k === 'block' && this.canCompleteNormally(body))
                this.error(entry, 'switch rule completes without providing a value');
            return;
        }
        if (info.isExpr) {
            this.switchArmValue(body.expr, armEnv, info);
            return;
        }
        var kind = body.expr.k;
        if (!(kind === 'call' || kind === 'assign' || kind === 'prefix' || kind === 'postfix' || kind === 'new'))
            this.error(body.expr, 'not a statement');
        this.expr(body.expr, armEnv);
    };

    Checker.prototype.switchStatement = function (node, env) {
        this.switchBody(node, env, { isExpr: false, node: node });
    };
    // The value of a branch of a switch expression (the expression after -> or yield).
    Checker.prototype.switchArmValue = function (value, env, info) {
        if (info.expected !== null) {
            this.exprAs(value, env, info.expected);
        } else {
            this.expr(value, env);
            if (Java.resolved(value.type).kind === 'void')
                this.error(value, "'void' type not allowed here");
        }
        info.values.push(value);
    };

    Checker.prototype.switchExpr = function (node, env, expected) {
        var target = expected !== null && expected !== Java.POLY && Java.resolved(expected).kind !== 'void' ? expected : null;
        var info = { isExpr: true, node: node, expected: target, values: [] };
        this.switchBody(node, env, info);
        node.valueNodes = info.values;
        if (target !== null)
            return target;
        var valueTypes = info.values.map(function (value) { return Java.resolved(value.type); });
        var prims = valueTypes.map(Java.primitiveOf);
        if (valueTypes.length > 0 && prims.every(function (prim) { return prim !== null && prim.name === 'boolean'; }))
            return types.boolean;
        if (valueTypes.length > 0 && prims.every(function (prim) { return prim !== null && prim.num !== null; })) {
            var result = prims[0];
            if (!prims.every(function (prim) { return prim.name === prims[0].name; })) {
                result = Java.unaryPromotion(prims[0]);
                prims.forEach(function (prim) { result = Java.binaryPromotion(result, Java.unaryPromotion(prim)); });
            }
            return result;
        }
        var lub = Java.lub(valueTypes);
        return lub.kind === 'null' ? Java.objectType() : lub;
    };
    Checker.prototype.tryStatement = function (node, env) {
        var self = this;
        var tryEnv = env.child('block');
        var closeable = Java.classType(Java.symtab.classNamed('java.lang.AutoCloseable'), []);
        node.resources.forEach(function (resource) {
            var type;
            if (resource.name !== null) {
                var declared = self.resolveType(resource.type, tryEnv, true);
                if (declared === null) {
                    self.expr(resource.init, tryEnv);
                    type = Java.finalType(resource.init.type);
                } else {
                    type = declared;
                    self.exprAs(resource.init, tryEnv, type);
                }
                resource.variable = self.declareLocal(resource.name, type, tryEnv, resource, { isFinal: true, hasInit: true });
            } else {
                type = self.expr(resource.init, tryEnv);
            }
            resource.resourceType = type;
            if (!Java.isSubtype(type, closeable))
                self.error(resource, 'incompatible types: try-with-resources not applicable to variable type (' +
                           self.typeName(type) + ' cannot be converted to AutoCloseable)');
        });
        this.statement(node.body, tryEnv);
        var throwable = Java.classType(Java.symtab.classNamed('java.lang.Throwable'), []);
        node.catches.forEach(function (clause) {
            clause.catchTypes = clause.types.map(function (item) {
                var type = self.resolveType(item, env);
                if (!Java.isSubtype(type, throwable))
                    self.error(item, 'incompatible types: ' + self.typeName(type) + ' cannot be converted to Throwable');
                return type;
            });
            var catchEnv = env.child('block');
            var variableType = clause.catchTypes.length === 1 ? clause.catchTypes[0] : Java.lub(clause.catchTypes);
            clause.variable = self.declareLocal(clause.name, variableType, catchEnv, clause, { hasInit: true });
            self.statement(clause.body, catchEnv);
        });
        if (node.finalizer !== null)
            this.statement(node.finalizer, env.child('block'));
    };
    // --- Reachability (JLS 14.22, simplified)

    // Whether there is a break inside that leaves target.
    function containsBreak(node, target) {
        if (node === null || node === undefined || typeof node !== 'object')
            return false;
        if (Array.isArray(node))
            return node.some(function (item) { return containsBreak(item, target); });
        switch (node.k) {
        case 'break':
            return node.target === target;
        case 'block':
            return containsBreak(node.statements, target);
        case 'if':
            return containsBreak(node.then, target) || containsBreak(node.otherwise, target);
        case 'while':
        case 'do':
        case 'for':
        case 'foreach':
        case 'labeled':
        case 'sync':
            return containsBreak(node.body, target);
        case 'switch':
            return node.cases.some(function (entry) { return containsBreak(entry.body, target); });
        case 'try':
            return containsBreak(node.body, target) || containsBreak(node.finalizer, target) ||
                node.catches.some(function (clause) { return containsBreak(clause.body, target); });
        }
        return false;
    }

    function constantTrue(node) {
        return node === null || node.cv === true;
    }

    Checker.prototype.canCompleteNormally = function (node) {
        var self = this;
        switch (node.k) {
        case 'block':
            return node.statements.length === 0 || this.canCompleteNormally(node.statements[node.statements.length - 1]);
        case 'return':
        case 'throw':
        case 'break':
        case 'continue':
        case 'yield':
            return false;
        case 'if':
            return node.otherwise === null || this.canCompleteNormally(node.then) || this.canCompleteNormally(node.otherwise);
        case 'while':
        case 'for':
            return !constantTrue(node.cond) || containsBreak(node.body, node);
        case 'do':
            return (this.canCompleteNormally(node.body) && !constantTrue(node.cond)) || containsBreak(node.body, node);
        case 'labeled':
            return this.canCompleteNormally(node.body) || containsBreak(node.body, node);
        case 'sync':
            return this.canCompleteNormally(node.body);
        case 'switch':
            return this.switchCompletes(node);
        case 'try':
            if (node.finalizer !== null && !this.canCompleteNormally(node.finalizer))
                return false;
            return this.canCompleteNormally(node.body) ||
                node.catches.some(function (clause) { return self.canCompleteNormally(clause.body); });
        }
        return true;
    };

    Checker.prototype.switchCompletes = function (node) {
        var self = this;
        if (containsBreak(node.cases.map(function (entry) { return entry.body; }), node))
            return true;
        if (!node.exhaustive)
            return true;
        if (node.arrow)
            return node.cases.some(function (entry) { return entry.body.k === 'expr' || self.canCompleteNormally(entry.body); });
        var last = node.cases[node.cases.length - 1];
        return last === undefined || last.body.length === 0 || this.canCompleteNormally({ k: 'block', statements: last.body });
    };
    // --- Method bodies

    // The parameters of a method are variables of the body.
    Checker.prototype.methodEnv = function (method) {
        var self = this;
        var bodyEnv = method.env.child('block');
        method.paramVars = method.paramNames.map(function (name, index) {
            return self.declareLocal(name, method.params[index], bodyEnv, method.node, { param: true });
        });
        return bodyEnv;
    };

    Checker.prototype.checkMethodBody = function (method) {
        var node = method.node;
        if (node === null || !node.body)
            return;
        this.captures = [];
        var bodyEnv = this.methodEnv(method);
        this.enterFunction({ method: method });
        try {
            if (method.isCtor) {
                this.checkConstructorBody(method, node.body, bodyEnv);
            } else {
                this.blockStatements(node.body.statements, bodyEnv);
                if (method.returns.kind !== 'void' && this.canCompleteNormally(node.body))
                    this.error({ line: node.body.endLine || node.line, column: 1 }, 'missing return statement');
            }
        } finally {
            this.leaveFunction();
        }
        this.checkCaptures();
    };

    // --- Functions and their calls: they decide which functions become
    // fibers (Session.markAsync).

    Checker.prototype.enterFunction = function (info) {
        info.calls = [];
        info.async = false;
        (this.functionStack = this.functionStack || []).push(info);
        (this.functions = this.functions || []).push(info);
    };

    Checker.prototype.leaveFunction = function () {
        this.functionStack.pop();
    };

    // virtual - a call on an object: it may turn out to be an override that is a fiber.
    Checker.prototype.noteCall = function (method, virtual) {
        var stack = this.functionStack;
        if (stack !== undefined && stack.length > 0)
            stack[stack.length - 1].calls.push({ method: method, virtual: virtual });
    };

    // this(...) or super(...) as the first statement, otherwise an implicit super().
    Checker.prototype.checkConstructorBody = function (method, body, env) {
        var sym = method.owner;
        var statements = body.statements;
        var first = statements.length > 0 && statements[0].k === 'expr' && statements[0].expr.k === 'ctorcall' ? statements[0].expr : null;
        method.explicitCall = first;
        if (first !== null) {
            if (sym.flavor === 'enum' && first.kind === 'super')
                this.error(first, 'call to super not allowed in enum constructor');
            if (sym.flavor === 'record' && method.compact)
                this.error(first, 'canonical constructor must not contain explicit constructor invocation');
            this.constructorCall(first, env.child('block', { ctorPrologue: true }), sym,
                                 first.kind === 'this' ? sym.thisType : sym.superclass);
        } else if (sym.superclass !== null && sym.flavor === 'class') {
            this.implicitSuper(method, sym);
        }
        this.blockStatements(first !== null ? statements.slice(1) : statements, env);
    };

    Checker.prototype.implicitSuper = function (method, sym) {
        var superSym = sym.superclass.sym.complete();
        var noArgs = superSym.ctors.filter(function (ctor) { return ctor.params.length === 0 || (ctor.varargs && ctor.params.length === 1); });
        if (noArgs.length === 0)
            this.error(method.node || sym.node, 'constructor ' + superSym.name + ' in class ' + superSym.displayName +
                       ' cannot be applied to given types; required: ' +
                       superSym.ctors[0].params.map(function (param) { return Java.typeString(param); }).join(',') + '; found: no arguments');
        method.implicitSuper = noArgs[0];
    };

    Checker.prototype.constructorCall = function (node, env, sym, targetType) {
        var targetSym = targetType.sym.complete();
        var args = this.preArguments(node.args, env);
        var candidates = targetSym.ctors.map(function (ctor) { return { method: ctor, map: null }; });
        var choice = this.chooseMethod(node, candidates, args, targetSym.name, targetSym.displayName, Java.typeMap(targetType));
        this.completeCall(node, choice, args, env, null, Java.typeMap(targetType), null);
        node.targetSym = targetSym;
        node.type = types.void;
    };
    // The environment of a field initializer or an initializer block.
    Checker.prototype.initializerEnv = function (sym, isStatic) {
        var pseudo = { kind: 'method', name: isStatic ? '<clinit>' : '<init>', owner: sym, isStatic: isStatic, isInit: true,
                       isStaticInit: isStatic, isInstanceInit: !isStatic, params: [], paramNames: [], returns: types.void };
        return sym.classEnv.child('method', { method: pseudo, isStatic: isStatic }).child('block');
    };

    // The constant value of a field (final with a constant initializer) -
    // on first demand: a case needs it before the class body is checked.
    Checker.prototype.fieldConstant = function (field) {
        if (field.constantState !== undefined)
            return field.constant;
        field.constantState = 'pending';
        var node = field.node;
        var checker = field.owner.checker;
        if (field.isFinal && node && node.init && node.init.k !== 'arrayinit' && checker) {
            var type = Java.resolved(field.type);
            var isString = type.kind === 'class' && type.sym.qname === 'java.lang.String';
            if (type.kind === 'prim' || isString) {
                var saved = checker.captures;
                try {
                    checker.expr(node.init, checker.initializerEnv(field.owner, field.isStatic), type);
                    if (node.init.cv !== undefined && Java.isAssignable(node.init.type, type, node.init.cv))
                        field.constant = Java.convertConstant(node.init.cv, Java.primitiveOf(node.init.type) || node.init.type,
                                                              isString ? { name: 'String' } : type);
                } catch (error) {
                    if (!(error instanceof T.CompileError))
                        throw error;
                } finally {
                    checker.captures = saved;
                }
            }
        }
        field.constantState = 'done';
        return field.constant;
    };
    // --- Class bodies

    Checker.prototype.checkClassBody = function (sym) {
        var self = this;
        sym.complete();
        if (sym.bodyChecked)
            return;
        sym.bodyChecked = true;
        var node = sym.node;
        (node.constants || []).forEach(function (constant) { self.enumConstant(sym, constant); });
        node.members.forEach(function (member) {
            switch (member.k) {
            case 'field':
                member.vars.forEach(function (variable) {
                    if (variable.init === null)
                        return;
                    var field = sym.fields[variable.name];
                    self.captures = [];
                    self.exprAs(variable.init, self.initializerEnv(sym, field.isStatic), field.type);
                    self.checkCaptures();
                    self.fieldConstant(field);
                });
                break;
            case 'method':
                // A library method - at the first call (Session.compileLazyMethod).
                if (sym.lazyMethods && member.body) {
                    member.sym.lazy = true;
                    break;
                }
                self.checkMethodBody(member.sym);
                self.checkOverride(member);
                break;
            case 'ctor':
                self.checkMethodBody(member.sym);
                break;
            case 'initializer':
                self.captures = [];
                self.blockStatements(member.body.statements, self.initializerEnv(sym, member.isStatic));
                self.checkCaptures();
                break;
            case 'class':
                self.checkClassBody(member.sym);
                break;
            }
        });
        sym.ctors.forEach(function (ctor) {
            if (ctor.implicit && sym.superclass !== null && sym.flavor === 'class' && !sym.isAnonymous)
                self.implicitSuper(ctor, sym);
        });
        this.checkAbstracts(sym);
    };

    Checker.prototype.checkOverride = function (member) {
        var method = member.sym;
        var annotated = (member.mods.annotations || []).some(function (annotation) { return annotation.name === 'Override'; });
        if (annotated && (method.isStatic || method.overrides === undefined))
            this.error(member, 'method does not override or implement a method from a supertype');
    };
    // An enum constant: a constructor by the arguments, the body is a subclass.
    Checker.prototype.enumConstant = function (sym, constant) {
        var self = this;
        var env = this.initializerEnv(sym, true);
        var args = this.preArguments(constant.args, env);
        var candidates = sym.ctors.map(function (ctor) { return { method: ctor, map: null }; });
        var choice = this.chooseMethod(constant, candidates, args, sym.name, sym.displayName, null);
        this.completeCall(constant, choice, args, env, null, null, null);
        if (constant.body === null)
            return;
        var sub = this.enterClass(constant.body, null, sym.classEnv, '', false);
        sub.isAnonymous = true;
        sub.displayName = sym.displayName;
        sub.jsId = sym.jsId + '$' + constant.name;
        sub.binaryName = this.nestedBinaryName(sym.classEnv, null);
        sub.completer = function (target) {
            target.typeParams = [];
            target.thisType = Java.classType(target, []);
            target.superclass = Java.classType(sym, []);
            target.interfaces = [];
            self.completeMembers(target);
        };
        sub.complete();
        var ctor = Java.MethodSymbol('<init>', sub, {});
        ctor.isCtor = true;
        ctor.params = constant.instance.formals.slice();
        ctor.jsName = '$init';
        ctor.anonymous = true;
        ctor.superCtor = constant.method;
        sub.ctors = [ctor];
        constant.subclass = sub;
        this.checkClassBody(sub);
    };

    // A non-abstract class implements all abstract methods of its supertypes.
    Checker.prototype.checkAbstracts = function (sym) {
        if (sym.isInterface() || sym.mods.abstract)
            return;
        if (sym.flavor === 'enum' && (sym.node.constants || []).some(function (constant) { return constant.body !== null; }))
            return;
        var self = this;
        var names = Object.create(null);
        Java.supertypeClosure(sym.thisType).forEach(function (type) {
            Object.keys(type.sym.complete().methods).forEach(function (name) { names[name] = true; });
        });
        Object.keys(names).forEach(function (name) {
            var found = Java.findMethods(sym.thisType, name);
            found.forEach(function (item) {
                if (!item.method.isAbstract || item.method.isStatic)
                    return;
                var signature = Java.erasedParams(item.method, item.map);
                var implemented = found.some(function (other) {
                    return !other.method.isAbstract && !other.method.isStatic &&
                        Java.erasedParams(other.method, other.map) === signature;
                });
                if (!implemented)
                    self.error(sym.node, sym.displayName + ' is not abstract and does not override abstract method ' +
                               self.methodText(item.method) + ' in ' + item.method.owner.displayName);
            });
        });
    };
})(globalThis);
