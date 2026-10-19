// Scheme: syntax expansion - scopes, special forms, syntax-rules macros
// (hygiene by renaming), definitions in bodies. The result is an
// intermediate tree (the IR nodes below) that compiler.js translates into
// JavaScript in continuation-passing style.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var S = T.scheme;
    if (S.expand)
        return;

    var Pair = S.Pair, NIL = S.NIL, Sym = S.Sym, intern = S.intern;

    // --- Identifiers
    //
    // An identifier is a symbol or an Alias: a name a macro template
    // introduced. An Alias is looked up first in the scopes where it is
    // bound (bindings made by the same template), then in the environment of
    // the macro definition.

    var aliasCounter = 0;
    function Alias(id, env) {
        this.id = id;
        this.env = env;
        this.sym = id instanceof Alias ? id.sym : id;
        this.mark = ++aliasCounter;
    }

    function isIdentifier(form) {
        return form instanceof Sym || form instanceof Alias;
    }
    function nameOf(id) {
        return id instanceof Alias ? id.sym.name : id.name;
    }

    // Data without Aliases (quote, case, syntax->datum).
    function strip(datum) {
        if (datum instanceof Alias)
            return datum.sym;
        if (datum instanceof Pair) {
            var items = [];
            var tail = datum;
            while (tail instanceof Pair) {
                items.push(strip(tail.car));
                tail = tail.cdr;
            }
            var result = S.arrayToList(items, strip(tail));
            var line = S.lines.get(datum);
            if (line !== undefined && result instanceof Pair)
                S.lines.set(result, line);
            return result;
        }
        if (Array.isArray(datum)) {
            var changed = false;
            var copy = datum.map(function (item) {
                var stripped = strip(item);
                if (stripped !== item)
                    changed = true;
                return stripped;
            });
            return changed ? copy : datum;
        }
        return datum;
    }

    // --- Translation-time environments

    // The top level: name -> binding. The units of the language share one
    // such environment, a library (define-library) has its own.
    function TopEnv(name) {
        this.name = name;
        this.table = new Map();
        this.library = null;
    }

    function Scope(parent) {
        this.parent = parent;
        this.map = new Map();
        this.top = parent instanceof TopEnv ? parent : parent.top;
    }

    // The binding of an identifier or null (unbound: a global variable).
    function lookup(id, env) {
        for (;;) {
            var scope = env;
            while (scope instanceof Scope) {
                var found = scope.map.get(id);
                if (found !== undefined)
                    return found;
                scope = scope.parent;
            }
            if (id instanceof Alias) {
                env = id.env;
                id = id.id;
                continue;
            }
            var binding = scope.table.get(id.name);
            if (binding !== undefined && binding.kind === 'lazy')
                binding = S.resolveLazy(scope, id.name, binding);
            return binding === undefined ? null : binding;
        }
    }

    // The top environment where to look up an unbound identifier.
    function topOf(id, env) {
        while (id instanceof Alias) {
            env = id.env;
            id = id.id;
        }
        return env instanceof TopEnv ? env : env.top;
    }

    // Whether two identifiers are bound alike (free-identifier=?).
    function sameBinding(left, leftEnv, right, rightEnv) {
        var leftBinding = lookup(left, leftEnv), rightBinding = lookup(right, rightEnv);
        if (leftBinding === null && rightBinding === null)
            return nameOf(left) === nameOf(right);
        return leftBinding === rightBinding;
    }

    // --- Variables and cells

    var varCounter = 0;
    function Var(name) {
        this.name = name;
        this.id = ++varCounter;
        this.js = jsVarName(name) + '_' + this.id;
        this.assigned = false;
    }

    function jsVarName(name) {
        var result = name.replace(/[^A-Za-z0-9_]/g, '$');
        if (result.length === 0 || /^[0-9]/.test(result))
            result = 'v' + result;
        return result.length > 24 ? result.substring(0, 24) : result;
    }

    // A global variable: v is the value (undefined - not defined).
    function Cell(name) {
        this.name = name;
        this.v = undefined;
    }

    // The binding of a global variable in an environment: imported - read only.
    function globalBinding(cell, imported) {
        return { kind: 'global', cell: cell, imported: !!imported };
    }

    // The cell of a name in the top environment (created when first mentioned).
    function globalCell(top, name) {
        var binding = top.table.get(name);
        if (binding !== undefined && binding.kind === 'global')
            return binding;
        binding = globalBinding(new Cell(name), false);
        top.table.set(name, binding);
        return binding;
    }

    // --- IR nodes

    var IR = {
        constant: function (value) { return { t: 'const', value: value }; },
        lref: function (variable) { return { t: 'lref', v: variable }; },
        lset: function (variable, expression) {
            variable.assigned = true;
            variable.sets = (variable.sets || 0) + 1;
            return { t: 'lset', v: variable, e: expression };
        },
        gref: function (cell, line) { return { t: 'gref', cell: cell, line: line }; },
        gset: function (cell, expression, define, line) {
            return { t: 'gset', cell: cell, e: expression, define: define, line: line };
        },
        prim: function (primitive) { return { t: 'prim', p: primitive }; },
        if_: function (test, consequent, alternative) { return { t: 'if', c: test, a: consequent, b: alternative }; },
        lambda: function (params, rest, body, name, line) {
            return { t: 'lambda', params: params, rest: rest, body: body, name: name || '', line: line };
        },
        caseLambda: function (clauses, name, line) { return { t: 'case-lambda', clauses: clauses, name: name || '', line: line }; },
        seq: function (list) { return list.length === 1 ? list[0] : { t: 'seq', list: list }; },
        call: function (callee, args, line) { return { t: 'call', f: callee, args: args, line: line }; },
        pcall: function (primitive, args, line) { return { t: 'pcall', p: primitive, args: args, line: line }; },
        let_: function (vars, inits, body) { return { t: 'let', vars: vars, inits: inits, body: body }; },
        // A body with internal definitions: vars are declared, items in order.
        body: function (vars, items) { return { t: 'body', vars: vars, items: items }; },
        // define-values: the values of expression are spread into vars (+ rest).
        defvals: function (targets, rest, expression, line) {
            return { t: 'defvals', targets: targets, rest: rest, e: expression, line: line };
        },
        unspec: function () { return { t: 'const', value: S.UNSPEC }; }
    };

    // The target of define-values: a local variable or a global cell.
    function localTarget(variable) { variable.assigned = true; return { v: variable }; }
    function globalTarget(cell) { return { cell: cell }; }

    // --- Syntax errors

    function lineOf(form, ctx) {
        var line = form instanceof Pair ? S.lines.get(form) : undefined;
        return line !== undefined ? line : ctx.line;
    }

    function syntaxError(message, form, ctx) {
        throw new T.CompileError(message, lineOf(form, ctx), 0, ctx.source);
    }

    function listOf(form, ctx, what) {
        var items = S.listToArray(form);
        if (items === null)
            syntaxError((what || 'syntax') + ': bad syntax (not a proper list)', form, ctx);
        return items;
    }

    // --- The expansion context

    // ctx: { top, source, line, session, unit } - unit collects what the
    // translation needs (references to host files, libraries).
    function withLine(ctx, form) {
        var line = form instanceof Pair ? S.lines.get(form) : undefined;
        if (line === undefined || line === ctx.line)
            return ctx;
        var copy = Object.create(ctx);
        copy.line = line;
        return copy;
    }

    // --- Expanding an expression

    function expand(form, env, ctx) {
        if (isIdentifier(form))
            return expandReference(form, env, ctx);
        if (form instanceof Pair) {
            ctx = withLine(ctx, form);
            var head = form.car;
            if (isIdentifier(head)) {
                var binding = lookup(head, env);
                if (binding !== null) {
                    if (binding.kind === 'special')
                        return binding.fn(form, env, ctx);
                    if (binding.kind === 'macro')
                        return expand(expandMacro(binding, form, env, ctx), env, ctx);
                    if (binding.kind === 'aux')
                        syntaxError('invalid use of syntax: ' + nameOf(head), form, ctx);
                } else {
                    var method = dottedName(head);
                    if (method !== null)
                        return expandJsCall(head, method, form, env, ctx);
                }
            }
            var items = listOf(form, ctx, 'application');
            var operator = expand(head, env, ctx);
            var args = [];
            for (var index = 1; index < items.length; ++index)
                args.push(expand(items[index], env, ctx));
            if (operator.t === 'prim')
                return IR.pcall(operator.p, args, ctx.line);
            return IR.call(operator, args, ctx.line);
        }
        if (form === NIL)
            syntaxError('empty application ()', form, ctx);
        return IR.constant(strip(form));
    }

    // A name of the form a.b.c: the parts or null.
    function dottedName(id) {
        if (!(id instanceof Sym))
            return null;
        var name = id.name;
        if (name.indexOf('.') <= 0 || name.charAt(name.length - 1) === '.' || name.indexOf('..') >= 0)
            return null;
        if (S.N.parse(name, 10) !== null)
            return null;
        return name.split('.');
    }

    // The start of a path a.b.c: a Scheme variable or a global JavaScript
    // value (without conversion: the path goes over JavaScript objects as
    // they are).
    function jsBase(head, env, ctx) {
        var id = intern(head);
        var binding = lookup(id, env);
        if (binding !== null && binding.kind !== 'special' && binding.kind !== 'macro' && binding.kind !== 'aux')
            return expandReference(id, env, ctx);
        return IR.pcall(S.prims['%js-global'], [IR.constant(head)], ctx.line);
    }

    // a.b.c as a value: (%js-ref a ["b" "c"]).
    function jsPath(parts, env, ctx) {
        return IR.pcall(S.prims['%js-ref'], [jsBase(parts[0], env, ctx), IR.constant(parts.slice(1))], ctx.line);
    }

    // (a.b.m x ...): (%js-invoke a ["b"] "m" x ...).
    function expandJsCall(head, parts, form, env, ctx) {
        var items = listOf(form, ctx, 'application');
        var args = [jsBase(parts[0], env, ctx), IR.constant(parts.slice(1, parts.length - 1)),
                    IR.constant(parts[parts.length - 1])];
        for (var index = 1; index < items.length; ++index)
            args.push(expand(items[index], env, ctx));
        return IR.pcall(S.prims['%js-invoke'], args, ctx.line);
    }

    function expandReference(id, env, ctx) {
        var binding = lookup(id, env);
        if (binding === null) {
            var parts = dottedName(id);
            if (parts !== null)
                return jsPath(parts, env, ctx);
            binding = globalCell(topOf(id, env), nameOf(id));
        }
        switch (binding.kind) {
        case 'local':
            return IR.lref(binding.v);
        case 'global':
            return IR.gref(binding.cell, ctx.line);
        case 'prim':
            return IR.prim(binding.p);
        }
        syntaxError('invalid use of syntax: ' + nameOf(id), id, ctx);
    }

    // --- Bodies: definitions, then expressions (letrec*)

    // Expands the macros at the start of a form while it is a macro call.
    function expandHead(form, env, ctx) {
        for (;;) {
            if (!(form instanceof Pair) || !isIdentifier(form.car))
                return { form: form, binding: null };
            var binding = lookup(form.car, env);
            if (binding === null || binding.kind !== 'macro')
                return { form: form, binding: binding };
            form = expandMacro(binding, form, env, withLine(ctx, form));
        }
    }

    function isSpecial(binding, name) {
        return binding !== null && binding.kind === 'special' && binding.name === name;
    }

    // (define (f . args) body...) -> [identifier, the value form]
    function parseDefine(form, ctx) {
        var items = listOf(form, ctx, 'define');
        if (items.length < 2)
            syntaxError('define: bad syntax', form, ctx);
        var target = items[1];
        if (isIdentifier(target)) {
            if (items.length > 3)
                syntaxError('define: bad syntax (more than one expression)', form, ctx);
            return { id: target, value: items.length === 3 ? items[2] : null, lambda: false };
        }
        // A curried (define ((f a) b) ...) - nested lambdas.
        var body = form.cdr.cdr;
        while (target instanceof Pair && target.car instanceof Pair) {
            body = S.list(new Pair(S.LAMBDA_ID, new Pair(target.cdr, body)));
            target = target.car;
        }
        if (!(target instanceof Pair) || !isIdentifier(target.car))
            syntaxError('define: bad syntax', form, ctx);
        if (body === NIL)
            syntaxError('define: empty body', form, ctx);
        var lambda = new Pair(S.LAMBDA_ID, new Pair(target.cdr, body));
        S.lines.set(lambda, lineOf(form, ctx));
        return { id: target.car, value: lambda, lambda: true };
    }

    function expandBody(forms, env, ctx, what) {
        var scope = new Scope(env);
        var queue = listOf(forms, ctx, what || 'body');
        var entries = [];
        var vars = [];
        while (queue.length > 0) {
            var original = queue.shift();
            var head = expandHead(original, scope, ctx);
            var form = head.form;
            var formCtx = withLine(ctx, form instanceof Pair ? form : original);
            var binding = head.binding;
            if (isSpecial(binding, 'begin')) {
                queue = listOf(form.cdr, formCtx, 'begin').concat(queue);
                continue;
            }
            if (isSpecial(binding, 'define')) {
                var parsed = parseDefine(form, formCtx);
                var variable = new Var(nameOf(parsed.id));
                scope.map.set(parsed.id, { kind: 'local', v: variable });
                vars.push(variable);
                entries.push({ kind: 'define', v: variable, value: parsed.value, ctx: formCtx });
                continue;
            }
            if (isSpecial(binding, 'define-values')) {
                var spec = parseFormals(form.cdr.car, formCtx, form);
                var targets = spec.params.map(function (id) {
                    var made = new Var(nameOf(id));
                    scope.map.set(id, { kind: 'local', v: made });
                    vars.push(made);
                    return made;
                });
                var restVar = null;
                if (spec.rest !== null) {
                    restVar = new Var(nameOf(spec.rest));
                    scope.map.set(spec.rest, { kind: 'local', v: restVar });
                    vars.push(restVar);
                }
                var valueForm = listOf(form, formCtx, 'define-values');
                if (valueForm.length !== 3)
                    syntaxError('define-values: bad syntax', form, formCtx);
                entries.push({ kind: 'values', targets: targets, rest: restVar, value: valueForm[2], ctx: formCtx });
                continue;
            }
            if (isSpecial(binding, 'define-record-type')) {
                queue.unshift(recordDefinition(form, formCtx));
                continue;
            }
            if (isSpecial(binding, 'define-syntax')) {
                defineSyntax(form, scope, formCtx, function (id, macro) { scope.map.set(id, macro); });
                continue;
            }
            entries.push({ kind: 'expr', form: form, ctx: formCtx });
        }
        if (entries.length === 0)
            syntaxError((what || 'body') + ': empty body', forms, ctx);
        var items = entries.map(function (entry) {
            if (entry.kind === 'define') {
                var value = entry.value === null ? IR.unspec() : expand(entry.value, scope, entry.ctx);
                nameLambda(value, entry.v.name);
                return IR.lset(entry.v, value);
            }
            if (entry.kind === 'values') {
                return IR.defvals(entry.targets.map(localTarget), entry.rest === null ? null : localTarget(entry.rest),
                                  expand(entry.value, scope, entry.ctx), entry.ctx.line);
            }
            return expand(entry.form, scope, entry.ctx);
        });
        if (entries[entries.length - 1].kind !== 'expr')
            items.push(IR.unspec());
        if (vars.length === 0)
            return IR.seq(items);
        return IR.body(vars, items);
    }

    function nameLambda(node, name) {
        if (node.t === 'lambda' || node.t === 'case-lambda') {
            if (node.name === '')
                node.name = name;
        }
    }

    // A parameter list: { params: [identifiers], rest: identifier|null }
    function parseFormals(formals, ctx, form) {
        var params = [];
        var seen = new Set();
        function add(id) {
            if (!isIdentifier(id))
                syntaxError('bad parameter list', form, ctx);
            if (seen.has(id))
                syntaxError('duplicate parameter: ' + nameOf(id), form, ctx);
            seen.add(id);
            return id;
        }
        while (formals instanceof Pair) {
            params.push(add(formals.car));
            formals = formals.cdr;
        }
        var rest = null;
        if (formals !== NIL)
            rest = add(formals);
        return { params: params, rest: rest };
    }

    // --- Special forms

    var specials = Object.create(null);

    function special(name, fn) {
        specials[name] = fn;
    }

    function args(form, ctx, min, max, name) {
        var items = listOf(form, ctx, name);
        if (items.length - 1 < min || (max >= 0 && items.length - 1 > max))
            syntaxError(name + ': bad syntax', form, ctx);
        return items;
    }

    special('quote', function (form, env, ctx) {
        var items = args(form, ctx, 1, 1, 'quote');
        return IR.constant(strip(items[1]));
    });

    special('if', function (form, env, ctx) {
        var items = args(form, ctx, 2, 3, 'if');
        return IR.if_(expand(items[1], env, ctx), expand(items[2], env, ctx),
                      items.length > 3 ? expand(items[3], env, ctx) : IR.unspec());
    });

    function makeLambda(formals, body, env, ctx, form, name) {
        var spec = parseFormals(formals, ctx, form);
        var scope = new Scope(env);
        var params = spec.params.map(function (id) {
            var variable = new Var(nameOf(id));
            scope.map.set(id, { kind: 'local', v: variable });
            return variable;
        });
        var rest = null;
        if (spec.rest !== null) {
            rest = new Var(nameOf(spec.rest));
            scope.map.set(spec.rest, { kind: 'local', v: rest });
        }
        return IR.lambda(params, rest, expandBody(body, scope, ctx, 'lambda'), name, ctx.line);
    }

    special('lambda', function (form, env, ctx) {
        args(form, ctx, 2, -1, 'lambda');
        return makeLambda(form.cdr.car, form.cdr.cdr, env, ctx, form, '');
    });

    special('case-lambda', function (form, env, ctx) {
        var items = args(form, ctx, 0, -1, 'case-lambda');
        var clauses = items.slice(1).map(function (clause) {
            if (!(clause instanceof Pair))
                syntaxError('case-lambda: bad clause', form, ctx);
            return makeLambda(clause.car, clause.cdr, env, withLine(ctx, clause), form, '');
        });
        return IR.caseLambda(clauses, '', ctx.line);
    });

    special('set!', function (form, env, ctx) {
        var items = args(form, ctx, 2, 2, 'set!');
        var target = items[1];
        if (!isIdentifier(target))
            syntaxError('set!: not a variable', form, ctx);
        var value = expand(items[2], env, ctx);
        var binding = lookup(target, env);
        if (binding === null) {
            var parts = dottedName(target);
            if (parts !== null) {
                return IR.pcall(S.prims['%js-set!'], [jsBase(parts[0], env, ctx),
                                                       IR.constant(parts.slice(1, parts.length - 1)),
                                                       IR.constant(parts[parts.length - 1]), value], ctx.line);
            }
            binding = globalCell(topOf(target, env), nameOf(target));
        }
        switch (binding.kind) {
        case 'local':
            return IR.lset(binding.v, value);
        case 'global':
            if (binding.imported)
                syntaxError('set!: cannot change imported variable: ' + nameOf(target), form, ctx);
            return IR.gset(binding.cell, value, false, ctx.line);
        case 'prim':
            syntaxError('set!: cannot change built-in procedure: ' + nameOf(target), form, ctx);
        }
        syntaxError('set!: not a variable: ' + nameOf(target), form, ctx);
    });

    special('begin', function (form, env, ctx) {
        var items = listOf(form, ctx, 'begin');
        if (items.length === 1)
            return IR.unspec();
        return IR.seq(items.slice(1).map(function (item) { return expand(item, env, ctx); }));
    });

    function definitionContext(name) {
        return function (form, env, ctx) {
            syntaxError(name + ': not allowed here (only at the start of a body or at top level)', form, ctx);
        };
    }
    special('define', definitionContext('define'));
    special('define-values', definitionContext('define-values'));
    special('define-record-type', definitionContext('define-record-type'));
    special('define-syntax', definitionContext('define-syntax'));
    special('define-library', definitionContext('define-library'));
    special('import', definitionContext('import'));

    // (let ((v e) ...) body) and the named let.
    function bindingList(list, ctx, form, name) {
        var items = listOf(list, ctx, name);
        return items.map(function (item) {
            if (isIdentifier(item))
                return { id: item, init: null };
            var parts = S.listToArray(item);
            if (parts === null || parts.length < 1 || parts.length > 2 || !isIdentifier(parts[0]))
                syntaxError(name + ': bad binding', form, ctx);
            return { id: parts[0], init: parts.length > 1 ? parts[1] : null };
        });
    }

    special('let', function (form, env, ctx) {
        var items = args(form, ctx, 1, -1, 'let');
        if (isIdentifier(items[1])) {
            // (let name ((v e) ...) body)
            if (items.length < 4)
                syntaxError('let: bad syntax', form, ctx);
            var name = items[1];
            var named = bindingList(items[2], ctx, form, 'let');
            var inits = named.map(function (binding) {
                return binding.init === null ? IR.unspec() : expand(binding.init, env, ctx);
            });
            var loopScope = new Scope(env);
            var loopVar = new Var(nameOf(name));
            loopScope.map.set(name, { kind: 'local', v: loopVar });
            var formals = S.arrayToList(named.map(function (binding) { return binding.id; }));
            var lambda = makeLambda(formals, form.cdr.cdr.cdr, loopScope, ctx, form, nameOf(name));
            return IR.body([loopVar], [IR.lset(loopVar, lambda), IR.call(IR.lref(loopVar), inits, ctx.line)]);
        }
        var bindings = bindingList(items[1], ctx, form, 'let');
        var scope = new Scope(env);
        var vars = [];
        var values = [];
        var seen = new Set();
        bindings.forEach(function (binding) {
            if (seen.has(binding.id))
                syntaxError('let: duplicate variable: ' + nameOf(binding.id), form, ctx);
            seen.add(binding.id);
            values.push(binding.init === null ? IR.unspec() : expand(binding.init, env, ctx));
            var variable = new Var(nameOf(binding.id));
            nameLambda(values[values.length - 1], variable.name);
            scope.map.set(binding.id, { kind: 'local', v: variable });
            vars.push(variable);
        });
        if (vars.length === 0)
            return expandBody(form.cdr.cdr, scope, ctx, 'let');
        return IR.let_(vars, values, expandBody(form.cdr.cdr, scope, ctx, 'let'));
    });

    special('let*', function (form, env, ctx) {
        var items = args(form, ctx, 2, -1, 'let*');
        var bindings = bindingList(items[1], ctx, form, 'let*');
        function build(index, scope) {
            if (index === bindings.length)
                return expandBody(form.cdr.cdr, scope, ctx, 'let*');
            var binding = bindings[index];
            var value = binding.init === null ? IR.unspec() : expand(binding.init, scope, ctx);
            var inner = new Scope(scope);
            var variable = new Var(nameOf(binding.id));
            nameLambda(value, variable.name);
            inner.map.set(binding.id, { kind: 'local', v: variable });
            return IR.let_([variable], [value], build(index + 1, inner));
        }
        return build(0, env);
    });

    function letrec(name) {
        return function (form, env, ctx) {
            var items = args(form, ctx, 2, -1, name);
            var bindings = bindingList(items[1], ctx, form, name);
            var scope = new Scope(env);
            var vars = bindings.map(function (binding) {
                var variable = new Var(nameOf(binding.id));
                scope.map.set(binding.id, { kind: 'local', v: variable });
                return variable;
            });
            var sets = bindings.map(function (binding, index) {
                var value = binding.init === null ? IR.unspec() : expand(binding.init, scope, ctx);
                nameLambda(value, vars[index].name);
                return IR.lset(vars[index], value);
            });
            return IR.body(vars, sets.concat([expandBody(form.cdr.cdr, scope, ctx, name)]));
        };
    }
    special('letrec', letrec('letrec'));
    special('letrec*', letrec('letrec*'));

    // let-values: the values of init are spread over the formals.
    function letValues(name, sequential) {
        return function (form, env, ctx) {
            var items = args(form, ctx, 2, -1, name);
            var clauses = listOf(items[1], ctx, name).map(function (clause) {
                var parts = S.listToArray(clause);
                if (parts === null || parts.length !== 2)
                    syntaxError(name + ': bad binding', form, ctx);
                return { formals: parseFormals(parts[0], ctx, form), init: parts[1] };
            });
            var scope = new Scope(env);
            var vars = [];
            var items2 = [];
            var current = env;
            clauses.forEach(function (clause) {
                var value = expand(clause.init, sequential ? current : env, ctx);
                var target = sequential ? new Scope(current) : scope;
                var targets = clause.formals.params.map(function (id) {
                    var variable = new Var(nameOf(id));
                    target.map.set(id, { kind: 'local', v: variable });
                    vars.push(variable);
                    return localTarget(variable);
                });
                var rest = null;
                if (clause.formals.rest !== null) {
                    var rv = new Var(nameOf(clause.formals.rest));
                    target.map.set(clause.formals.rest, { kind: 'local', v: rv });
                    vars.push(rv);
                    rest = localTarget(rv);
                }
                items2.push(IR.defvals(targets, rest, value, ctx.line));
                if (sequential)
                    current = target;
            });
            var body = expandBody(form.cdr.cdr, sequential ? current : scope, ctx, name);
            return IR.body(vars, items2.concat([body]));
        };
    }
    special('let-values', letValues('let-values', false));
    special('let*-values', letValues('let*-values', true));

    special('receive', function (form, env, ctx) {
        var items = args(form, ctx, 3, -1, 'receive');
        var formals = parseFormals(items[1], ctx, form);
        var value = expand(items[2], env, ctx);
        var scope = new Scope(env);
        var vars = [];
        var targets = formals.params.map(function (id) {
            var variable = new Var(nameOf(id));
            scope.map.set(id, { kind: 'local', v: variable });
            vars.push(variable);
            return localTarget(variable);
        });
        var rest = null;
        if (formals.rest !== null) {
            var rv = new Var(nameOf(formals.rest));
            scope.map.set(formals.rest, { kind: 'local', v: rv });
            vars.push(rv);
            rest = localTarget(rv);
        }
        return IR.body(vars, [IR.defvals(targets, rest, value, ctx.line),
                              expandBody(form.cdr.cdr.cdr, scope, ctx, 'receive')]);
    });

    // Compares an identifier with an auxiliary word (else, =>, ...).
    function isAux(form, env, name) {
        if (!isIdentifier(form))
            return false;
        var binding = lookup(form, env);
        return binding !== null && binding.kind === 'aux' && binding.name === name;
    }

    function temp(name) {
        return new Var(name);
    }

    special('and', function (form, env, ctx) {
        var items = listOf(form, ctx, 'and').slice(1);
        if (items.length === 0)
            return IR.constant(true);
        function build(index) {
            var expression = expand(items[index], env, ctx);
            if (index === items.length - 1)
                return expression;
            return IR.if_(expression, build(index + 1), IR.constant(false));
        }
        return build(0);
    });

    special('or', function (form, env, ctx) {
        var items = listOf(form, ctx, 'or').slice(1);
        if (items.length === 0)
            return IR.constant(false);
        function build(index) {
            var expression = expand(items[index], env, ctx);
            if (index === items.length - 1)
                return expression;
            var temporary = temp('or');
            return IR.let_([temporary], [expression], IR.if_(IR.lref(temporary), IR.lref(temporary), build(index + 1)));
        }
        return build(0);
    });

    special('when', function (form, env, ctx) {
        var items = args(form, ctx, 2, -1, 'when');
        return IR.if_(expand(items[1], env, ctx), IR.seq(items.slice(2).map(function (part) {
            return expand(part, env, ctx);
        })),
                      IR.unspec());
    });
    special('unless', function (form, env, ctx) {
        var items = args(form, ctx, 2, -1, 'unless');
        return IR.if_(expand(items[1], env, ctx), IR.unspec(),
                      IR.seq(items.slice(2).map(function (part) { return expand(part, env, ctx); })));
    });

    // The clauses of cond (and guard): the else value - when none fits.
    function condClauses(clauses, env, ctx, form, otherwise, name) {
        function build(index) {
            if (index === clauses.length)
                return otherwise();
            var clause = clauses[index];
            var clauseCtx = withLine(ctx, clause);
            var parts = S.listToArray(clause);
            if (parts === null || parts.length === 0)
                syntaxError(name + ': bad clause', form, ctx);
            if (isAux(parts[0], env, 'else')) {
                if (index !== clauses.length - 1)
                    syntaxError(name + ': else must be the last clause', form, ctx);
                if (parts.length < 2)
                    syntaxError(name + ': empty else clause', form, ctx);
                return IR.seq(parts.slice(1).map(function (part) { return expand(part, env, clauseCtx); }));
            }
            var test = expand(parts[0], env, clauseCtx);
            if (parts.length === 1) {
                var temporary = temp('t');
                return IR.let_([temporary], [test], IR.if_(IR.lref(temporary), IR.lref(temporary), build(index + 1)));
            }
            if (isAux(parts[1], env, '=>')) {
                if (parts.length !== 3)
                    syntaxError(name + ': bad => clause', form, ctx);
                var tested = temp('t');
                var receiver = expand(parts[2], env, clauseCtx);
                return IR.let_([tested], [test], IR.if_(IR.lref(tested),
                                                        applyTo(receiver, [IR.lref(tested)], clauseCtx.line),
                                                        build(index + 1)));
            }
            return IR.if_(test, IR.seq(parts.slice(1).map(function (part) { return expand(part, env, clauseCtx); })),
                          build(index + 1));
        }
        return build(0);
    }

    function applyTo(callee, argsList, line) {
        if (callee.t === 'prim')
            return IR.pcall(callee.p, argsList, line);
        return IR.call(callee, argsList, line);
    }

    special('cond', function (form, env, ctx) {
        var items = listOf(form, ctx, 'cond');
        return condClauses(items.slice(1), env, ctx, form, IR.unspec, 'cond');
    });

    special('case', function (form, env, ctx) {
        var items = args(form, ctx, 1, -1, 'case');
        var key = temp('key');
        var clauses = items.slice(2);
        function build(index) {
            if (index === clauses.length)
                return IR.unspec();
            var clause = clauses[index];
            var clauseCtx = withLine(ctx, clause);
            var parts = S.listToArray(clause);
            if (parts === null || parts.length < 2)
                syntaxError('case: bad clause', form, ctx);
            var body;
            if (isAux(parts[1], env, '=>')) {
                if (parts.length !== 3)
                    syntaxError('case: bad => clause', form, ctx);
                body = applyTo(expand(parts[2], env, clauseCtx), [IR.lref(key)], clauseCtx.line);
            } else {
                body = IR.seq(parts.slice(1).map(function (part) { return expand(part, env, clauseCtx); }));
            }
            if (isAux(parts[0], env, 'else')) {
                if (index !== clauses.length - 1)
                    syntaxError('case: else must be the last clause', form, ctx);
                return body;
            }
            var data = S.listToArray(parts[0]);
            if (data === null)
                syntaxError('case: bad datum list', form, ctx);
            var test = null;
            data.forEach(function (datum) {
                var one = IR.pcall(S.prims['eqv?'], [IR.lref(key), IR.constant(strip(datum))], clauseCtx.line);
                test = test === null ? one : IR.if_(test, IR.constant(true), one);
            });
            if (test === null)
                return build(index + 1);
            return IR.if_(test, body, build(index + 1));
        }
        return IR.let_([key], [expand(items[1], env, ctx)], build(0));
    });

    special('do', function (form, env, ctx) {
        var items = args(form, ctx, 2, -1, 'do');
        var specs = listOf(items[1], ctx, 'do').map(function (spec) {
            var parts = S.listToArray(spec);
            if (parts === null || parts.length < 2 || parts.length > 3 || !isIdentifier(parts[0]))
                syntaxError('do: bad variable clause', form, ctx);
            return { id: parts[0], init: parts[1], step: parts.length > 2 ? parts[2] : null };
        });
        var exit = S.listToArray(items[2]);
        if (exit === null || exit.length < 1)
            syntaxError('do: bad exit clause', form, ctx);
        var inits = specs.map(function (spec) { return expand(spec.init, env, ctx); });
        var loopVar = temp('do-loop');
        var scope = new Scope(env);
        var vars = specs.map(function (spec) {
            var variable = new Var(nameOf(spec.id));
            scope.map.set(spec.id, { kind: 'local', v: variable });
            return variable;
        });
        var test = expand(exit[0], scope, ctx);
        var result = exit.length > 1 ? IR.seq(exit.slice(1).map(function (part) {
            return expand(part, scope, ctx);
        })) : IR.unspec();
        var commands = items.slice(3).map(function (part) { return expand(part, scope, ctx); });
        var steps = specs.map(function (spec, index) {
            return spec.step === null ? IR.lref(vars[index]) : expand(spec.step, scope, ctx);
        });
        var again = IR.call(IR.lref(loopVar), steps, ctx.line);
        var body = IR.if_(test, result, IR.seq(commands.concat([again])));
        var lambda = IR.lambda(vars, null, body, 'do-loop', ctx.line);
        return IR.body([loopVar], [IR.lset(loopVar, lambda), IR.call(IR.lref(loopVar), inits, ctx.line)]);
    });

    special('delay', function (form, env, ctx) {
        var items = args(form, ctx, 1, 1, 'delay');
        return IR.pcall(S.prims['%delay'], [IR.lambda([], null, expand(items[1], env, ctx), '', ctx.line), IR.constant(false)],
                        ctx.line);
    });
    special('delay-force', function (form, env, ctx) {
        var items = args(form, ctx, 1, 1, 'delay-force');
        return IR.pcall(S.prims['%delay'], [IR.lambda([], null, expand(items[1], env, ctx), '', ctx.line), IR.constant(true)],
                        ctx.line);
    });

    special('parameterize', function (form, env, ctx) {
        var items = args(form, ctx, 2, -1, 'parameterize');
        var bindings = listOf(items[1], ctx, 'parameterize').map(function (binding) {
            var parts = S.listToArray(binding);
            if (parts === null || parts.length !== 2)
                syntaxError('parameterize: bad binding', form, ctx);
            return parts;
        });
        var params = bindings.map(function (binding) { return expand(binding[0], env, ctx); });
        var values = bindings.map(function (binding) { return expand(binding[1], env, ctx); });
        var body = IR.lambda([], null, expandBody(form.cdr.cdr, new Scope(env), ctx, 'parameterize'), '', ctx.line);
        return IR.pcall(S.prims['%parameterize'], [IR.pcall(S.prims.list, params, ctx.line),
                                                   IR.pcall(S.prims.list, values, ctx.line), body], ctx.line);
    });

    // (guard (e clause...) body...): the handler is (lambda (e) (cond
    // clause... (else <no match>))); no match - raise-continuable again
    // where the exception happened.
    special('guard', function (form, env, ctx) {
        var items = args(form, ctx, 2, -1, 'guard');
        var spec = items[1];
        if (!(spec instanceof Pair) || !isIdentifier(spec.car))
            syntaxError('guard: bad syntax', form, ctx);
        var scope = new Scope(env);
        var variable = new Var(nameOf(spec.car));
        scope.map.set(spec.car, { kind: 'local', v: variable });
        var clauses = listOf(spec.cdr, ctx, 'guard');
        var handlerBody = condClauses(clauses, scope, ctx, form, function () { return IR.constant(S.NO_MATCH); }, 'guard');
        var handler = IR.lambda([variable], null, handlerBody, 'guard', ctx.line);
        var body = IR.lambda([], null, expandBody(form.cdr.cdr, new Scope(env), ctx, 'guard'), '', ctx.line);
        return IR.pcall(S.prims['%guard'], [body, handler], ctx.line);
    });

    special('assert', function (form, env, ctx) {
        var items = args(form, ctx, 1, -1, 'assert');
        var test = expand(items[1], env, ctx);
        return IR.if_(test, IR.unspec(), IR.pcall(S.prims['%assertion-failed'], [IR.constant(strip(items[1]))], ctx.line));
    });

    // --- Quasiquotation

    special('quasiquote', function (form, env, ctx) {
        var items = args(form, ctx, 1, 1, 'quasiquote');
        return quasi(items[1], 1, env, ctx);
    });
    special('unquote', function (form, env, ctx) {
        syntaxError('unquote: not inside quasiquote', form, ctx);
    });
    special('unquote-splicing', function (form, env, ctx) {
        syntaxError('unquote-splicing: not inside quasiquote', form, ctx);
    });

    function isForm(form, env, name) {
        if (!(form instanceof Pair) || !isIdentifier(form.car))
            return false;
        var binding = lookup(form.car, env);
        return binding !== null && binding.kind === 'special' && binding.name === name &&
            form.cdr instanceof Pair && form.cdr.cdr === NIL;
    }

    function hasUnquote(form, env) {
        if (form instanceof Pair) {
            if (isForm(form, env, 'unquote') || isForm(form, env, 'unquote-splicing'))
                return true;
            return hasUnquote(form.car, env) || hasUnquote(form.cdr, env);
        }
        if (Array.isArray(form))
            return form.some(function (item) { return hasUnquote(item, env); });
        return false;
    }

    function quasi(form, depth, env, ctx) {
        if (!hasUnquote(form, env))
            return IR.constant(strip(form));
        var line = lineOf(form, ctx);
        if (form instanceof Pair) {
            if (isForm(form, env, 'unquote')) {
                if (depth === 1)
                    return expand(form.cdr.car, env, ctx);
                return IR.pcall(S.prims.list,
                                [IR.constant(intern('unquote')), quasi(form.cdr.car, depth - 1, env, ctx)], line);
            }
            if (isForm(form, env, 'quasiquote'))
                return IR.pcall(S.prims.list,
                                [IR.constant(intern('quasiquote')), quasi(form.cdr.car, depth + 1, env, ctx)], line);
            if (isForm(form.car, env, 'unquote-splicing')) {
                var rest = quasi(form.cdr, depth, env, ctx);
                if (depth === 1)
                    return IR.pcall(S.prims.append, [expand(form.car.cdr.car, env, ctx), rest], line);
                var inner = IR.pcall(S.prims.list, [IR.constant(intern('unquote-splicing')),
                                                    quasi(form.car.cdr.car, depth - 1, env, ctx)], line);
                return IR.pcall(S.prims.cons, [inner, rest], line);
            }
            return IR.pcall(S.prims.cons, [quasi(form.car, depth, env, ctx), quasi(form.cdr, depth, env, ctx)], line);
        }
        if (Array.isArray(form))
            return IR.pcall(S.prims['list->vector'], [quasi(S.arrayToList(form), depth, env, ctx)], line);
        return IR.constant(strip(form));
    }

    // --- Records

    // (define-record-type <name> (ctor field...) pred (field acc [mod])...)
    // -> (define-values (<name> ctor pred acc mod ...) (%record ...))
    function recordDefinition(form, ctx) {
        var items = listOf(form, ctx, 'define-record-type');
        if (items.length < 3)
            syntaxError('define-record-type: bad syntax', form, ctx);
        var typeName = items[1];
        if (typeName instanceof Pair)
            typeName = typeName.car;
        if (!isIdentifier(typeName))
            syntaxError('define-record-type: bad type name', form, ctx);
        // (define-record-type name constructor predicate field...)
        var predicate = items.length > 3 ? items[3] : false;
        var fields = items.slice(4).map(function (spec) {
            if (isIdentifier(spec))
                return { name: spec, accessor: null, modifier: null };
            var parts = S.listToArray(spec);
            if (parts === null || parts.length < 1 || parts.length > 3 || !parts.every(isIdentifier))
                syntaxError('define-record-type: bad field', form, ctx);
            return { name: parts[0], accessor: parts[1] || null, modifier: parts[2] || null };
        });
        var fieldNames = fields.map(function (field) { return nameOf(field.name); });
        var ctor = items[2];
        var ctorName = null, ctorFields = null;
        if (isIdentifier(ctor)) {
            ctorName = ctor;
            ctorFields = fieldNames.slice();
        } else if (ctor instanceof Pair) {
            var ctorParts = S.listToArray(ctor);
            if (ctorParts === null || !ctorParts.every(isIdentifier))
                syntaxError('define-record-type: bad constructor', form, ctx);
            ctorName = ctorParts[0];
            ctorFields = ctorParts.slice(1).map(nameOf);
            ctorFields.forEach(function (name) {
                if (fieldNames.indexOf(name) < 0)
                    syntaxError('define-record-type: unknown field in constructor: ' + name, form, ctx);
            });
        } else if (ctor !== false) {
            syntaxError('define-record-type: bad constructor', form, ctx);
        }
        var names = [typeName];
        var spec = [];
        if (ctorName !== null) {
            names.push(ctorName);
            spec.push(S.list(intern('constructor'), S.arrayToList(ctorFields.map(intern))));
        }
        if (isIdentifier(predicate)) {
            names.push(predicate);
            spec.push(S.list(intern('predicate')));
        }
        fields.forEach(function (field) {
            if (field.accessor !== null) {
                names.push(field.accessor);
                spec.push(S.list(intern('accessor'), intern(nameOf(field.name))));
            }
            if (field.modifier !== null) {
                names.push(field.modifier);
                spec.push(S.list(intern('modifier'), intern(nameOf(field.name))));
            }
        });
        var call = S.list(S.RECORD_ID, S.list(S.QUOTE_ID, intern(nameOf(typeName))),
                          S.list(S.QUOTE_ID, S.arrayToList(fieldNames.map(intern))),
                          S.list(S.QUOTE_ID, S.arrayToList(spec)));
        var result = S.list(S.DEFINE_VALUES_ID, S.arrayToList(names), call);
        markLines(result, lineOf(form, ctx));
        return result;
    }

    function markLines(form, line) {
        while (form instanceof Pair) {
            if (!S.lines.has(form))
                S.lines.set(form, line);
            markLines(form.car, line);
            form = form.cdr;
        }
    }

    // --- syntax-rules macros

    function SyntaxRules(ellipsis, literals, rules, env, name) {
        this.ellipsis = ellipsis;   // the ellipsis identifier
        this.literals = literals;   // identifiers
        this.rules = rules;         // [{ pattern, template }]
        this.env = env;             // the environment of the definition
        this.name = name;
    }

    function parseSyntaxRules(spec, env, ctx, name) {
        var items = S.listToArray(spec);
        if (items === null || items.length < 1 || !isIdentifier(items[0]))
            syntaxError('define-syntax: bad transformer for ' + name, spec, ctx);
        var head = lookup(items[0], env);
        if (head !== null && head.kind === 'special' && head.name === 'er-macro-transformer')
            syntaxError('only syntax-rules macros are supported', spec, ctx);
        if (head === null || head.kind !== 'special' || head.name !== 'syntax-rules')
            syntaxError('define-syntax: expected syntax-rules for ' + name, spec, ctx);
        var index = 1;
        var ellipsis = intern('...');
        if (isIdentifier(items[1])) {
            ellipsis = items[1];
            index = 2;
        }
        var literals = S.listToArray(items[index]);
        if (literals === null || !literals.every(isIdentifier))
            syntaxError('syntax-rules: bad literal list', spec, ctx);
        var rules = items.slice(index + 1).map(function (rule) {
            var parts = S.listToArray(rule);
            if (parts === null || parts.length !== 2 || !(parts[0] instanceof Pair || isIdentifier(parts[0])))
                syntaxError('syntax-rules: bad rule', rule, ctx);
            return { pattern: parts[0], template: parts[1] };
        });
        return new SyntaxRules(ellipsis, literals, rules, env, name);
    }

    function defineSyntax(form, env, ctx, bind) {
        var items = listOf(form, ctx, 'define-syntax');
        if (items.length !== 3 || !isIdentifier(items[1]))
            syntaxError('define-syntax: bad syntax', form, ctx);
        var name = nameOf(items[1]);
        var spec = items[2];
        if (isIdentifier(spec)) {
            // An alias of another macro or special form.
            var other = lookup(spec, env);
            if (other !== null && (other.kind === 'macro' || other.kind === 'special')) {
                bind(items[1], other);
                return;
            }
        }
        var rules = parseSyntaxRules(spec, env, ctx, name);
        bind(items[1], { kind: 'macro', rules: rules, name: name });
    }

    special('syntax-rules', function (form, env, ctx) {
        syntaxError('syntax-rules: only inside define-syntax', form, ctx);
    });
    special('er-macro-transformer', function (form, env, ctx) {
        syntaxError('only syntax-rules macros are supported', form, ctx);
    });

    special('syntax-error', function (form, env, ctx) {
        var items = listOf(form, ctx, 'syntax-error');
        var message = items[1] instanceof S.SString ? items[1].s : S.write(strip(items[1]), 'display');
        var irritants = items.slice(2).map(function (item) { return S.write(strip(item), 'write'); });
        syntaxError(message + (irritants.length > 0 ? ' ' + irritants.join(' ') : ''), form, ctx);
    });

    function letSyntax(name, recursive) {
        return function (form, env, ctx) {
            var items = args(form, ctx, 2, -1, name);
            var scope = new Scope(env);
            listOf(items[1], ctx, name).forEach(function (binding) {
                var parts = S.listToArray(binding);
                if (parts === null || parts.length !== 2 || !isIdentifier(parts[0]))
                    syntaxError(name + ': bad binding', form, ctx);
                var rules = parseSyntaxRules(parts[1], recursive ? scope : env, ctx, nameOf(parts[0]));
                scope.map.set(parts[0], { kind: 'macro', rules: rules, name: nameOf(parts[0]) });
            });
            return expandBody(form.cdr.cdr, scope, ctx, name);
        };
    }
    special('let-syntax', letSyntax('let-syntax', false));
    special('letrec-syntax', letSyntax('letrec-syntax', true));

    function isEllipsis(form, macro) {
        return isIdentifier(form) && nameOf(form) === nameOf(macro.ellipsis);
    }
    function isLiteral(form, macro) {
        for (var index = 0; index < macro.literals.length; ++index) {
            var literal = macro.literals[index];
            if (literal === form || (isIdentifier(form) && nameOf(literal) === nameOf(form) &&
                                     !(form instanceof Alias) && !(literal instanceof Alias)))
                return true;
        }
        return false;
    }

    function EllipsisMatch(items) {
        this.items = items;
    }

    function patternVars(pattern, macro, out) {
        if (isIdentifier(pattern)) {
            if (!isLiteral(pattern, macro) && !isEllipsis(pattern, macro) && nameOf(pattern) !== '_')
                out.push(pattern);
        } else if (pattern instanceof Pair) {
            patternVars(pattern.car, macro, out);
            patternVars(pattern.cdr, macro, out);
        } else if (Array.isArray(pattern)) {
            pattern.forEach(function (item) { patternVars(item, macro, out); });
        }
        return out;
    }

    function matchPattern(pattern, form, macro, useEnv, bindings) {
        if (isIdentifier(pattern)) {
            if (isLiteral(pattern, macro))
                return isIdentifier(form) && sameBinding(form, useEnv, pattern, macro.env);
            if (nameOf(pattern) === '_')
                return true;
            bindings.set(pattern, form);
            return true;
        }
        if (pattern instanceof Pair) {
            if (pattern.cdr instanceof Pair && isEllipsis(pattern.cdr.car, macro)) {
                var restPattern = pattern.cdr.cdr;
                var minimum = 0;
                for (var patternPart = restPattern; patternPart instanceof Pair; patternPart = patternPart.cdr)
                    ++minimum;
                var available = 0;
                for (var formPart = form; formPart instanceof Pair; formPart = formPart.cdr)
                    ++available;
                var count = available - minimum;
                if (count < 0)
                    return false;
                var vars = patternVars(pattern.car, macro, []);
                var matches = [];
                for (var index = 0; index < count; ++index) {
                    var one = new Map();
                    if (!matchPattern(pattern.car, form.car, macro, useEnv, one))
                        return false;
                    matches.push(one);
                    form = form.cdr;
                }
                vars.forEach(function (variable) {
                    bindings.set(variable, new EllipsisMatch(matches.map(function (match) {
                        return match.get(variable);
                    })));
                });
                return matchPattern(restPattern, form, macro, useEnv, bindings);
            }
            if (!(form instanceof Pair))
                return false;
            return matchPattern(pattern.car, form.car, macro, useEnv, bindings) &&
                matchPattern(pattern.cdr, form.cdr, macro, useEnv, bindings);
        }
        if (pattern === NIL)
            return form === NIL;
        if (Array.isArray(pattern)) {
            if (!Array.isArray(form))
                return false;
            return matchPattern(S.arrayToList(pattern), S.arrayToList(form), macro, useEnv, bindings);
        }
        return S.isEqual(pattern, strip(form));
    }

    function Expansion(macro, line) {
        this.macro = macro;
        this.renames = new Map();
        this.line = line;
    }
    Expansion.prototype.rename = function (id) {
        var made = this.renames.get(id);
        if (made === undefined) {
            made = new Alias(id, this.macro.env);
            this.renames.set(id, made);
        }
        return made;
    };
    Expansion.prototype.pair = function (car, cdr) {
        var pair = new Pair(car, cdr);
        S.lines.set(pair, this.line);
        return pair;
    };

    function instantiate(template, bindings, expansion, escaped, ctx) {
        var macro = expansion.macro;
        if (isIdentifier(template)) {
            if (bindings.has(template)) {
                var value = bindings.get(template);
                if (value instanceof EllipsisMatch)
                    throw new T.CompileError(macro.name + ': pattern variable ' + nameOf(template) +
                                             ' used without ellipsis', expansion.line, 0, ctx.source);
                return value;
            }
            return expansion.rename(template);
        }
        if (template instanceof Pair) {
            if (!escaped && isEllipsis(template.car, macro) && template.cdr instanceof Pair)
                return instantiate(template.cdr.car, bindings, expansion, true, ctx);
            if (!escaped && template.cdr instanceof Pair && isEllipsis(template.cdr.car, macro)) {
                var depth = 1;
                var rest = template.cdr.cdr;
                while (rest instanceof Pair && isEllipsis(rest.car, macro)) {
                    ++depth;
                    rest = rest.cdr;
                }
                var results = expandEllipsis(template.car, bindings, expansion, depth, ctx);
                var tail = instantiate(rest, bindings, expansion, escaped, ctx);
                for (var index = results.length - 1; index >= 0; --index)
                    tail = expansion.pair(results[index], tail);
                return tail;
            }
            return expansion.pair(instantiate(template.car, bindings, expansion, escaped, ctx),
                                  instantiate(template.cdr, bindings, expansion, escaped, ctx));
        }
        if (Array.isArray(template))
            return S.listToArray(instantiate(S.arrayToList(template), bindings, expansion, escaped, ctx));
        return template;
    }

    function expandEllipsis(template, bindings, expansion, depth, ctx) {
        var vars = patternVars(template, expansion.macro, []).filter(function (variable) {
            return bindings.get(variable) instanceof EllipsisMatch;
        });
        if (vars.length === 0)
            throw new T.CompileError(expansion.macro.name + ': no pattern variables before ellipsis in template',
                                     expansion.line, 0, ctx.source);
        var length = -1;
        vars.forEach(function (variable) {
            var count = bindings.get(variable).items.length;
            if (length >= 0 && count !== length)
                throw new T.CompileError(expansion.macro.name + ': mismatched ellipsis lengths', expansion.line, 0,
                                         ctx.source);
            length = count;
        });
        var results = [];
        for (var index = 0; index < length; ++index) {
            var inner = new Map(bindings);
            vars.forEach(function (variable) { inner.set(variable, bindings.get(variable).items[index]); });
            if (depth > 1)
                results = results.concat(expandEllipsis(template, inner, expansion, depth - 1, ctx));
            else
                results.push(instantiate(template, inner, expansion, false, ctx));
        }
        return results;
    }

    function expandMacro(binding, form, env, ctx) {
        var macro = binding.rules;
        var line = lineOf(form, ctx);
        for (var index = 0; index < macro.rules.length; ++index) {
            var rule = macro.rules[index];
            var bindings = new Map();
            var pattern = rule.pattern;
            // The first element of the pattern (the macro name) is not compared.
            var matched = pattern instanceof Pair ? matchPattern(pattern.cdr, form.cdr, macro, env, bindings)
                : isIdentifier(pattern);
            if (matched) {
                if (++ctx.unit.expansions > 100000)
                    throw new T.CompileError('macro expansion is too deep (endless recursion?): ' + macro.name, line, 0,
                                             ctx.source);
                return instantiate(rule.template, bindings, new Expansion(macro, line), false, ctx);
            }
        }
        throw new T.CompileError(macro.name + ': no matching syntax rule for ' + S.write(strip(form), 'write'), line, 0,
                                 ctx.source);
    }

    // --- cond-expand and features

    S.features = ['r7rs', 'exact-closed', 'exact-complex', 'ieee-float', 'full-unicode', 'ratios', 'v4script',
                  'srfi-0', 'srfi-1', 'srfi-2', 'srfi-6', 'srfi-8', 'srfi-9', 'srfi-11', 'srfi-13', 'srfi-16', 'srfi-18',
                  'srfi-23', 'srfi-27', 'srfi-28', 'srfi-30', 'srfi-39', 'srfi-62', 'srfi-69', 'srfi-87', 'srfi-95'];

    function featureMatches(requirement, env, ctx, form) {
        if (isIdentifier(requirement)) {
            var name = nameOf(requirement);
            return name === 'else' || S.features.indexOf(name) >= 0;
        }
        var parts = S.listToArray(requirement);
        if (parts === null || parts.length === 0 || !isIdentifier(parts[0]))
            syntaxError('cond-expand: bad feature requirement', form, ctx);
        switch (nameOf(parts[0])) {
        case 'and':
            return parts.slice(1).every(function (requirement) { return featureMatches(requirement, env, ctx, form); });
        case 'or':
            return parts.slice(1).some(function (requirement) { return featureMatches(requirement, env, ctx, form); });
        case 'not':
            return !featureMatches(parts[1], env, ctx, form);
        case 'library':
            return S.libraryExists(strip(parts[1]), ctx);
        }
        syntaxError('cond-expand: bad feature requirement', form, ctx);
    }

    // The matching clause of cond-expand: a list of forms.
    function condExpandForms(form, env, ctx) {
        var clauses = listOf(form, ctx, 'cond-expand').slice(1);
        for (var index = 0; index < clauses.length; ++index) {
            var parts = S.listToArray(clauses[index]);
            if (parts === null || parts.length === 0)
                syntaxError('cond-expand: bad clause', form, ctx);
            if (featureMatches(parts[0], env, ctx, form))
                return parts.slice(1);
        }
        return [];
    }
    S.condExpandForms = condExpandForms;

    special('cond-expand', function (form, env, ctx) {
        var forms = condExpandForms(form, env, ctx);
        if (forms.length === 0)
            return IR.unspec();
        var begin = new Pair(S.BEGIN_ID, S.arrayToList(forms));
        S.lines.set(begin, ctx.line);
        return expand(begin, env, ctx);
    });

    // --- include

    function includeForms(form, ctx, fold) {
        var items = listOf(form, ctx, 'include');
        var forms = [];
        items.slice(1).forEach(function (item) {
            if (!(item instanceof S.SString))
                syntaxError('include: expected a file name string', form, ctx);
            var text = ctx.session.attachmentText(item.s);
            if (text === null)
                syntaxError('include: attachment not found: ' + item.s, form, ctx);
            if (fold)
                text = '#!fold-case\n' + text;
            S.readAll(text, item.s).forEach(function (entry) {
                forms.push({ datum: entry.datum, source: item.s, line: entry.line - (fold ? 1 : 0) });
            });
        });
        return forms;
    }
    S.includeForms = includeForms;

    special('include', function (form, env, ctx) {
        return includeExpression(form, env, ctx, false);
    });
    special('include-ci', function (form, env, ctx) {
        return includeExpression(form, env, ctx, true);
    });
    function includeExpression(form, env, ctx, fold) {
        var forms = includeForms(form, ctx, fold);
        if (forms.length === 0)
            return IR.unspec();
        return IR.seq(forms.map(function (entry) {
            var inner = Object.create(ctx);
            inner.source = entry.source;
            inner.line = entry.line;
            return expand(entry.datum, env, inner);
        }));
    }

    // --- The top level

    // A top-level form -> a list of IR (one per part that runs).
    function expandTop(form, top, ctx, out) {
        var head = expandHead(form, top, ctx);
        form = head.form;
        ctx = withLine(ctx, form);
        var binding = head.binding;
        if (isSpecial(binding, 'begin')) {
            listOf(form, ctx, 'begin').slice(1).forEach(function (item) { expandTop(item, top, ctx, out); });
            return out;
        }
        if (isSpecial(binding, 'define')) {
            var parsed = parseDefine(form, ctx);
            var name = nameOf(parsed.id);
            var cell = defineGlobal(top, name);
            var value = parsed.value === null ? IR.unspec() : expand(parsed.value, top, ctx);
            nameLambda(value, name);
            out.push({ ir: IR.gset(cell, value, true, ctx.line), line: ctx.line, source: ctx.source, define: true });
            return out;
        }
        if (isSpecial(binding, 'define-values')) {
            var items = listOf(form, ctx, 'define-values');
            if (items.length !== 3)
                syntaxError('define-values: bad syntax', form, ctx);
            var spec = parseFormals(items[1], ctx, form);
            var targets = spec.params.map(function (id) { return globalTarget(defineGlobal(top, nameOf(id))); });
            var rest = spec.rest === null ? null : globalTarget(defineGlobal(top, nameOf(spec.rest)));
            out.push({ ir: IR.defvals(targets, rest, expand(items[2], top, ctx), ctx.line), line: ctx.line,
                       source: ctx.source, define: true });
            return out;
        }
        if (isSpecial(binding, 'define-record-type'))
            return expandTop(recordDefinition(form, ctx), top, ctx, out);
        if (isSpecial(binding, 'define-syntax')) {
            defineSyntax(form, top, ctx, function (id, macro) { top.table.set(nameOf(id), macro); });
            return out;
        }
        if (isSpecial(binding, 'import')) {
            S.importInto(top, form, ctx, out);
            return out;
        }
        if (isSpecial(binding, 'define-library')) {
            S.defineLibrary(form, top, ctx, out);
            return out;
        }
        if (isSpecial(binding, 'cond-expand')) {
            condExpandForms(form, top, ctx).forEach(function (item) { expandTop(item, top, ctx, out); });
            return out;
        }
        if (isSpecial(binding, 'include') || isSpecial(binding, 'include-ci')) {
            includeForms(form, ctx, binding.name === 'include-ci').forEach(function (entry) {
                var inner = Object.create(ctx);
                inner.source = entry.source;
                inner.line = entry.line;
                expandTop(entry.datum, top, inner, out);
            });
            return out;
        }
        out.push({ ir: expand(form, top, ctx), line: ctx.line, source: ctx.source, define: false });
        return out;
    }

    // A definition at the top level: a new cell if the name was built-in
    // or imported (the old code keeps the old binding).
    function defineGlobal(top, name) {
        var binding = top.table.get(name);
        if (binding !== undefined && binding.kind === 'global' && !binding.imported)
            return binding.cell;
        var cell = new Cell(name);
        top.table.set(name, globalBinding(cell, false));
        return cell;
    }

    // The bindings of special forms and auxiliary words go into the top-level environment.
    function installSyntax(top) {
        Object.keys(specials).forEach(function (name) {
            top.table.set(name, { kind: 'special', name: name, fn: specials[name] });
        });
        ['else', '=>', '...', '_', 'field'].forEach(function (name) {
            top.table.set(name, { kind: 'aux', name: name });
        });
    }

    // The names of special forms the expander uses to build forms itself:
    // they are looked up in the environment of special forms, not where
    // they are used.
    var SYNTAX_ENV = new TopEnv('syntax');
    installSyntax(SYNTAX_ENV);
    S.LAMBDA_ID = new Alias(intern('lambda'), SYNTAX_ENV);
    S.BEGIN_ID = new Alias(intern('begin'), SYNTAX_ENV);
    S.QUOTE_ID = new Alias(intern('quote'), SYNTAX_ENV);
    S.DEFINE_VALUES_ID = new Alias(intern('define-values'), SYNTAX_ENV);
    S.RECORD_ID = new Alias(intern('%record'), SYNTAX_ENV);
    S.NO_MATCH = { noMatch: true };

    S.Alias = Alias;
    S.isIdentifier = isIdentifier;
    S.nameOf = nameOf;
    S.strip = strip;
    S.TopEnv = TopEnv;
    S.Scope = Scope;
    S.lookup = lookup;
    S.Var = Var;
    S.Cell = Cell;
    S.IR = IR;
    S.specials = specials;
    S.installSyntax = installSyntax;
    S.SYNTAX_ENV = SYNTAX_ENV;
    S.globalBinding = globalBinding;
    S.globalCell = globalCell;
    S.defineGlobal = defineGlobal;
    S.expand = expand;
    S.expandTop = expandTop;
    S.expandBody = expandBody;
    S.syntaxError = syntaxError;
    S.listOf = listOf;
    S.lineOf = lineOf;
    S.parseFormals = parseFormals;
    S.defineSyntax = defineSyntax;
})(globalThis);
