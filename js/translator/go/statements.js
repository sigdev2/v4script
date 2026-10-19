// Go: checking calls, built-in functions, statements and declarations
// (continues checker.js).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Go = T.go;
    var Checker = Go.Checker;
    if (Checker.prototype.call)
        return;

    var types = Go.types;
    var G = Go.T;
    var big = T.big;
    var rat = T.rat;
    var exprString = Go.exprString;
    var FunctionInfo = Go.FunctionInfo;

    // --- Calls

    Checker.prototype.call = function (node) {
        var fn = node.fn;
        this.expr(fn);
        if (fn.mode === 'type')
            return this.conversion(node, fn.type);
        if (fn.mode === 'builtin')
            return this.builtin(node, fn.obj.name);
        if (fn.generic)
            this.instantiateCall(node);
        this.value(fn);
        var sig = G.underlying(fn.type);
        if (sig.kind !== 'func')
            this.error(node, 'invalid operation: cannot call non-function ' + this.describe(fn));
        node.signature = sig;
        node.callKind = this.callKind(fn);
        if (node.callKind === 'dynamic' && this.func !== null)
            this.func.dynamicCalls = true;
        this.arguments(node, sig, exprString(fn));
        this.callResult(node, sig);
        return node;
    };

    Checker.prototype.callKind = function (fn) {
        while (fn.k === 'paren')
            fn = fn.x;
        if (fn.k === 'ident' && fn.obj && fn.obj.kind === 'func')
            return 'static';
        if (fn.k === 'sel') {
            if (fn.selKind === 'qualified' && fn.obj.kind === 'func')
                return 'static';
            if (fn.selKind === 'method')
                return fn.interfaceMethod ? 'dynamic' : 'method';
        }
        if (fn.instance)
            return 'static';
        return 'dynamic';
    };

    Checker.prototype.callResult = function (node, sig) {
        if (sig.results.length === 0) {
            node.mode = 'novalue';
            node.type = G.tuple([]);
        } else if (sig.results.length === 1) {
            node.mode = 'value';
            node.type = sig.results[0].type;
        } else {
            node.mode = 'value';
            node.type = G.tuple(sig.results.map(function (result) { return result.type; }));
        }
    };

    // The arguments of a call: count, types, variadic, f(g()) with several
    // values.
    Checker.prototype.arguments = function (node, sig, name) {
        var args = node.args;
        var params = sig.params;
        var self = this;
        var savedContext = this.context;
        this.context = 'argument to ' + name;
        if (args.length === 1 && params.length !== 1 || (args.length === 1 && sig.variadic)) {
            this.expr(args[0], params.length > 0 ? params[0].type : undefined);
            if (args[0].mode !== 'novalue' && args[0].type && args[0].type.kind === 'tuple') {
                // f(g()) - the results of g become the arguments.
                var tuple = args[0].type.types;
                node.spread = true;
                var count = tuple.length;
                if (!sig.variadic && count !== params.length || sig.variadic && count < params.length - 1)
                    this.error(node, (count < params.length ? 'not enough' : 'too many') + ' arguments in call to ' + name +
                               '\n\thave ' + G.typeString(args[0].type) + '\n\twant ' + G.signatureString(sig).replace(/\).*$/, ')'));
                tuple.forEach(function (type, index) {
                    var target = index >= params.length - 1 && sig.variadic ? params[params.length - 1].type.elem
                                                                             : params[index].type;
                    var fake = { k: 'ident', name: exprString(args[0]), mode: 'value', type: type, line: args[0].line,
                                 column: args[0].column };
                    self.assign(fake, target, 'argument to ' + name);
                });
                node.spreadTypes = tuple;
                this.context = savedContext;
                return;
            }
        }
        var fixed = sig.variadic ? params.length - 1 : params.length;
        if (node.ellipsis) {
            if (!sig.variadic)
                this.error(node, 'have (...) arguments but function is not variadic: ' + name);
            if (args.length !== params.length)
                this.error(node, (args.length < params.length ? 'not enough' : 'too many') + ' arguments in call to ' + name);
        } else if (args.length < fixed || (!sig.variadic && args.length > params.length)) {
            var have = args.map(function (arg) {
                if (!arg.type)
                    self.expr(arg);
                return G.isUntyped(arg.type) && arg.mode === 'const' ? 'number' : G.typeString(arg.type);
            });
            this.error(args.length < fixed ? node : args[params.length],
                       (args.length < fixed ? 'not enough' : 'too many') + ' arguments in call to ' + name +
                       '\n\thave (' + have.join(', ') + ')\n\twant ' + G.signatureString(sig).replace(/\)[^)]*$/, ')'));
        }
        args.forEach(function (arg, index) {
            var target;
            if (index < fixed)
                target = params[index].type;
            else if (node.ellipsis)
                target = params[params.length - 1].type;
            else
                target = params[params.length - 1].type.elem;
            if (!arg.type || arg.mode === undefined)
                self.value(arg, target);
            else
                self.value(arg, target);
            self.assign(arg, target, 'argument to ' + name);
        });
        this.context = savedContext;
    };

    // --- Conversions T(x)

    Checker.prototype.conversion = function (node, target) {
        if (node.args.length !== 1)
            this.error(node, (node.args.length === 0 ? 'missing argument' : 'too many arguments') + ' in conversion to ' +
                       this.typeName(target));
        var arg = node.args[0];
        this.value(arg, target);
        node.callKind = 'conversion';
        node.convType = target;
        if (arg.mode === 'const' && G.isBasic(target) && !G.isInterface(target)) {
            var value = arg.value;
            // string(65) - a string of a rune.
            if (G.isString(target) && G.isInteger(arg.type)) {
                var code = big.toFloat(value);
                node.value = T.utf8.encodeRune(code >= 0 && code <= 0x10FFFF ? code : 0xFFFD);
                node.mode = 'const';
                node.type = target;
                return node;
            }
            if (G.isInteger(target) && (G.isFloat(arg.type))) {
                if (!rat.isInteger(value))
                    this.error(arg, 'cannot convert ' + this.describe(arg) + ' to type ' + this.typeName(target) + ' (truncated)');
                value = rat.trunc(value);
            }
            var converted = G.represent(value, target);
            if (converted === undefined) {
                if (G.isNumeric(target) && G.isNumeric(arg.type))
                    this.error(arg, 'cannot convert ' + this.describe(arg) + ' to type ' + this.typeName(target) +
                               (G.isInteger(target) ? ' (overflows)' : ''));
                this.error(arg, 'cannot convert ' + this.describe(arg) + ' to type ' + this.typeName(target));
            }
            node.mode = 'const';
            node.type = target;
            node.value = converted;
            return node;
        }
        if (G.isUntyped(arg.type)) {
            if (arg.type === types.untypedNil) {
                var underlyingType = G.underlying(target);
                if (['pointer', 'func', 'slice', 'map', 'chan', 'interface'].indexOf(underlyingType.kind) < 0)
                    this.error(arg, 'cannot convert nil to type ' + this.typeName(target));
                arg.type = target;
            } else if (G.isInterface(target)) {
                this.defaultUntyped(arg);
            } else if (this.convertUntyped(arg, target) !== null) {
                this.defaultUntyped(arg);
            }
        }
        if (!this.convertible(arg, target))
            this.error(arg, 'cannot convert ' + this.describe(arg) + ' to type ' + this.typeName(target));
        node.mode = 'value';
        node.type = target;
        return node;
    };

    // --- Built-in functions

    Checker.prototype.builtin = function (node, name) {
        var args = node.args;
        var self = this;
        node.callKind = 'builtin';
        node.builtin = name;
        function count(min, max) {
            if (args.length < min)
                self.error(node, 'not enough arguments for ' + exprString(node) + ' (expected ' + min + ', found ' + args.length + ')');
            if (max !== undefined && args.length > max)
                self.error(args[max], 'too many arguments for ' + exprString(node) + ' (expected ' + max + ', found ' + args.length + ')');
        }
        if (node.ellipsis && name !== 'append')
            this.error(node, 'invalid operation: invalid use of ... with built-in ' + name);
        switch (name) {
        case 'len':
        case 'cap': {
            count(1, 1);
            var arg = this.value(args[0]);
            var type = arg.type;
            var underlyingType = G.underlying(type);
            if (underlyingType.kind === 'pointer' && G.underlying(underlyingType.elem).kind === 'array')
                underlyingType = G.underlying(underlyingType.elem);
            var kind = underlyingType.kind;
            var ok = kind === 'array' || kind === 'slice' || kind === 'chan' ||
                (name === 'len' && (G.isString(type) || kind === 'map'));
            if (!ok)
                this.error(arg, 'invalid argument: ' + this.describe(arg) + ' for built-in ' + name);
            node.type = types.int;
            node.mode = 'value';
            if (arg.mode === 'const' && G.isString(type)) {
                node.mode = 'const';
                node.value = arg.value.length;
            } else if (underlyingType.kind === 'array' && !containsCallOrReceive(arg)) {
                node.mode = 'const';
                node.value = underlyingType.length;
                node.arrayLength = true;
            }
            if (G.isUntyped(type))
                this.defaultUntyped(arg);
            return node;
        }
        case 'append': {
            count(1);
            var target = this.value(args[0]);
            if (target.type === types.untypedNil)
                this.error(target, 'first argument to append must be a typed slice; have untyped nil');
            var su = G.underlying(target.type);
            if (su.kind !== 'slice')
                this.error(target, 'invalid argument: ' + this.describe(target) + ' (first argument to append must be a slice)');
            var elem = su.elem;
            if (node.ellipsis) {
                if (args.length !== 2)
                    this.error(node, 'can only use ... with final argument in list');
                var rest = this.value(args[1], target.type);
                if (G.isString(rest.type) && G.underlying(elem) === types.uint8) {
                    if (G.isUntyped(rest.type))
                        this.defaultUntyped(rest);
                    node.appendString = true;
                } else {
                    this.assign(rest, G.slice(elem), 'append');
                }
            } else {
                for (var index = 1; index < args.length; ++index) {
                    this.value(args[index], elem);
                    this.assign(args[index], elem, 'argument to append');
                }
            }
            node.mode = 'value';
            node.type = target.type;
            return node;
        }
        case 'make': {
            count(1, 3);
            var made = this.typeExpr(args[0]);
            args[0].mode = 'type';
            args[0].type = made;
            var mu = G.underlying(made);
            if (mu.kind !== 'slice' && mu.kind !== 'map' && mu.kind !== 'chan')
                this.error(args[0], 'invalid argument: cannot make ' + exprString(args[0]) + '; type must be slice, map, or channel');
            if (mu.kind === 'slice' && args.length < 2)
                this.error(node, 'invalid operation: ' + exprString(node) + ' expects 2 or 3 arguments; found 1');
            if (mu.kind !== 'slice' && args.length > 2)
                this.error(node, 'invalid operation: ' + exprString(node) + ' expects 1 or 2 arguments; found 3');
            for (var argumentIndex = 1; argumentIndex < args.length; ++argumentIndex)
                this.sizeArgument(args[argumentIndex]);
            if (args.length === 3 && args[1].mode === 'const' && args[2].mode === 'const' &&
                big.cmp(args[1].value, args[2].value) > 0)
                this.error(args[1], 'invalid argument: length and capacity swapped');
            node.mode = 'value';
            node.type = made;
            return node;
        }
        case 'new': {
            count(1, 1);
            var allocated = this.typeExpr(args[0]);
            args[0].mode = 'type';
            args[0].type = allocated;
            node.mode = 'value';
            node.type = G.pointer(allocated);
            return node;
        }
        case 'delete': {
            count(2, 2);
            var map = this.value(args[0]);
            var mapType = G.underlying(map.type);
            if (mapType.kind !== 'map')
                this.error(map, 'invalid argument: ' + this.describe(map) + ' is not a map');
            this.value(args[1], mapType.key);
            this.assign(args[1], mapType.key, 'argument to delete');
            node.mode = 'novalue';
            node.type = G.tuple([]);
            return node;
        }
        case 'copy': {
            count(2, 2);
            var destination = this.value(args[0]);
            var source = this.value(args[1]);
            var du = G.underlying(destination.type);
            if (du.kind !== 'slice')
                this.error(destination, 'invalid argument: copy expects slice arguments; found ' + this.describe(destination) +
                           ' and ' + this.describe(source));
            if (G.isString(source.type) && G.underlying(du.elem) === types.uint8) {
                if (G.isUntyped(source.type))
                    this.defaultUntyped(source);
                node.copyString = true;
            } else if (G.underlying(source.type).kind !== 'slice' || !G.identical(G.underlying(source.type).elem, du.elem)) {
                this.error(node, 'invalid argument: arguments to copy ' + this.describe(destination) + ' and ' +
                           this.describe(source) + ' have different element types');
            }
            node.mode = 'value';
            node.type = types.int;
            return node;
        }
        case 'panic': {
            count(1, 1);
            this.value(args[0], Go.anyType);
            this.assign(args[0], Go.anyType, 'argument to panic');
            node.mode = 'novalue';
            node.type = G.tuple([]);
            return node;
        }
        case 'recover':
            count(0, 0);
            if (this.func !== null)
                this.func.hasRecover = true;
            node.mode = 'value';
            node.type = Go.anyType;
            return node;
        case 'print':
        case 'println':
            args.forEach(function (arg) {
                self.value(arg);
                self.defaultUntyped(arg);
            });
            node.mode = 'novalue';
            node.type = G.tuple([]);
            return node;
        case 'min':
        case 'max': {
            count(1);
            args.forEach(function (arg) { self.value(arg); });
            var resultType = null;
            args.forEach(function (arg) {
                if (!G.isUntyped(arg.type))
                    resultType = resultType || arg.type;
            });
            if (resultType === null) {
                resultType = args[0].type;
                args.forEach(function (arg) {
                    if (G.isFloat(arg.type))
                        resultType = arg.type;
                });
            }
            args.forEach(function (arg) {
                if (G.isUntyped(arg.type))
                    self.convertUntyped(arg, resultType);
                if (!G.identical(arg.type, resultType) && !G.isUntyped(resultType))
                    self.error(arg, 'invalid argument: mismatched types ' + self.typeName(args[0].type) + ' (previous argument) and ' +
                               self.typeName(arg.type) + ' (type of ' + exprString(arg) + ')');
                if (!G.ordered(arg.type))
                    self.error(arg, 'invalid argument: ' + self.describe(arg) + ' cannot be ordered');
            });
            node.type = resultType;
            if (args.every(function (arg) { return arg.mode === 'const'; })) {
                node.mode = 'const';
                var best = args[0].value;
                args.forEach(function (arg) {
                    var less = typeof best === 'string' ? arg.value < best
                        : (rat.is(best) || rat.is(arg.value)
                            ? rat.cmp(rat.is(arg.value) ? arg.value : rat.fromInt(arg.value), rat.is(best) ? best : rat.fromInt(best)) < 0
                            : big.cmp(arg.value, best) < 0);
                    if (name === 'min' ? less : (!less && arg.value !== best))
                        best = arg.value;
                });
                node.value = best;
            } else {
                node.mode = 'value';
                if (G.isUntyped(node.type))
                    node.type = G.defaultType(node.type);
            }
            return node;
        }
        case 'clear': {
            count(1, 1);
            var cleared = this.value(args[0]);
            var cu = G.underlying(cleared.type);
            if (cu.kind !== 'map' && cu.kind !== 'slice')
                this.error(cleared, 'invalid argument: ' + this.describe(cleared) + ' must be a map or slice');
            node.mode = 'novalue';
            node.type = G.tuple([]);
            return node;
        }
        case 'close': {
            count(1, 1);
            var channel = this.value(args[0]);
            var chanType = G.underlying(channel.type);
            if (chanType.kind !== 'chan')
                this.error(channel, 'invalid operation: non-chan argument ' + this.describe(channel));
            if (chanType.dir === 'recv')
                this.error(channel, 'invalid operation: cannot close receive-only channel ' + this.describe(channel));
            node.mode = 'novalue';
            node.type = G.tuple([]);
            return node;
        }
        }
        this.error(node, name + ' is not supported');
    };

    function containsCallOrReceive(node) {
        if (!node || typeof node !== 'object')
            return false;
        if (node.k === 'call' && node.callKind !== 'conversion' && node.callKind !== 'builtin')
            return true;
        if (node.k === 'unary' && node.op === '<-')
            return true;
        var found = false;
        ['x', 'y', 'index', 'fn'].forEach(function (key) {
            if (!found && node[key] && typeof node[key] === 'object')
                found = containsCallOrReceive(node[key]);
        });
        return found;
    }

    Checker.prototype.sizeArgument = function (node) {
        this.value(node);
        if (node.mode === 'const') {
            if (G.isUntyped(node.type) && G.isFloat(node.type) && rat.isInteger(node.value)) {
                node.value = rat.trunc(node.value);
                node.type = types.untypedInt;
            }
            if (!G.isInteger(node.type))
                this.error(node, exprString(node) + ' (' + this.describe(node).replace(/^[^(]*\(|\)$/g, '') + ') truncated to int');
            if (big.sign(node.value) < 0)
                this.error(node, 'invalid argument: index ' + exprString(node) + ' (constant of type int) must not be negative');
            this.convertUntyped(node, types.int);
        } else if (!G.isInteger(node.type)) {
            this.error(node, 'cannot convert ' + this.describe(node) + ' to type int');
        }
    };

    // --- Statements

    Checker.prototype.statementList = function (list) {
        for (var index = 0; index < list.length; ++index)
            this.statement(list[index], index === list.length - 1);
    };

    Checker.prototype.statement = function (node, last) {
        var self = this;
        switch (node.k) {
        case 'declstmt':
            this.localDeclaration(node.decl);
            return;
        case 'exprstmt': {
            var expression = node.x;
            this.expr(expression);
            var isCall = expression.k === 'call' || (expression.k === 'paren' && expression.x.k === 'call');
            var isReceive = expression.k === 'unary' && expression.op === '<-';
            if (expression.mode === 'type')
                this.error(expression, exprString(expression) + ' (type) is not an expression');
            if (expression.mode === 'builtin')
                this.error(expression, exprString(expression) + ' (built-in function) must be called');
            var allowValue = this.allowValue === node;
            if (!isCall && !isReceive && !allowValue)
                this.error(expression, exprString(expression) + ' (' + this.describe(expression).replace(/^[^(]*\(|\)$/g, '') + ') is not used');
            var unusedText = exprString(expression) + ' (value of type ' + this.typeName(expression.type) +
                ') is not used';
            if (isCall && expression.callKind === 'builtin' && ['len', 'cap', 'append', 'make', 'new', 'min', 'max', 'complex'].indexOf(expression.builtin) >= 0 &&
                !allowValue)
                this.error(expression, unusedText);
            if (isCall && expression.callKind === 'conversion' && !allowValue)
                this.error(expression, unusedText);
            if (expression.mode !== 'novalue' && expression.type && expression.type.kind !== 'tuple')
                this.defaultUntyped(expression);
            return;
        }
        case 'send': {
            this.value(node.ch);
            var chanType = G.underlying(node.ch.type);
            if (chanType.kind !== 'chan')
                this.error(node, 'invalid operation: cannot send to non-channel ' + this.describe(node.ch));
            if (chanType.dir === 'recv')
                this.error(node, 'invalid operation: cannot send to receive-only channel ' + this.describe(node.ch));
            this.value(node.value, chanType.elem);
            this.assign(node.value, chanType.elem, 'send');
            if (this.func !== null)
                this.func.blocking = true;
            return;
        }
        case 'incdec':
            this.value(node.x);
            if (!G.isNumeric(node.x.type))
                this.error(node, 'invalid operation: ' + exprString(node.x) + node.op + ' (non-numeric type ' +
                           this.typeName(node.x.type) + ')');
            this.addressable(node.x, node.op === '++' ? 'assign to' : 'assign to');
            return;
        case 'assign':
            this.assignment(node);
            return;
        case 'go':
        case 'defer':
            this.expr(node.call);
            if (node.call.callKind === 'conversion')
                this.error(node, node.k + ' requires function call, not conversion');
            if (node.call.callKind === 'builtin' && ['append', 'cap', 'len', 'make', 'new', 'min', 'max'].indexOf(node.call.builtin) >= 0)
                this.error(node, node.k + ' discards result of ' + exprString(node.call));
            if (node.k === 'defer' && this.func !== null)
                this.func.hasDefer = true;
            if (node.k === 'go' && this.func !== null)
                this.func.hasGo = true;
            return;
        case 'return':
            this.returnStatement(node);
            return;
        case 'branch':
            this.branch(node);
            return;
        case 'block':
            this.openScope('block');
            this.statementList(node.list);
            this.closeScope();
            return;
        case 'if':
            this.openScope('block');
            if (node.init !== null)
                this.statement(node.init);
            this.condition(node.cond, 'if');
            this.openScope('block');
            this.statementList(node.then.list);
            this.closeScope();
            if (node.otherwise !== null)
                this.statement(node.otherwise);
            this.closeScope();
            return;
        case 'for':
            this.openScope('block');
            if (node.init !== null)
                this.statement(node.init);
            if (node.cond !== null)
                this.condition(node.cond, 'for');
            if (node.post !== null) {
                if (node.post.k === 'assign' && node.post.op === ':=')
                    this.error(node.post, 'cannot declare in post statement of for loop');
                this.statement(node.post);
            }
            this.loop(node, function () { self.statementList(node.body.list); });
            this.closeScope();
            return;
        case 'range':
            this.rangeStatement(node);
            return;
        case 'switch':
            this.switchStatement(node);
            return;
        case 'typeswitch':
            this.typeSwitch(node);
            return;
        case 'select':
            this.selectStatement(node);
            return;
        case 'labeled':
            this.labeled(node);
            return;
        case 'empty':
            return;
        }
        this.error(node, 'unexpected statement ' + node.k);
    };

    Checker.prototype.condition = function (node, what) {
        this.value(node);
        if (!G.isBoolean(node.type))
            this.error(node, 'non-boolean condition in ' + what + ' statement');
        if (G.isUntyped(node.type))
            this.defaultUntyped(node);
    };

    // A loop/switch/select as the target of break and continue.
    Checker.prototype.loop = function (node, body) {
        var saved = this.breakTargets || [];
        this.breakTargets = saved.concat([node]);
        try {
            body();
        } finally {
            this.breakTargets = saved;
        }
    };

    Checker.prototype.addressable = function (node, what) {
        if (node.mode === 'var' || node.mode === 'mapindex') {
            this.markMutated(node);
            return;
        }
        if (node.k === 'sel' && node.selKind === 'field' && node.x.mode === 'mapindex')
            this.error(node, 'cannot ' + what + ' struct field ' + exprString(node) + ' in map');
        this.error(node, 'cannot ' + what + ' ' + this.describe(node).replace(/ \(value of type .*\)$/, '') +
                   (node.mode === 'const' ? '' : ' (neither addressable nor a map index expression)'));
    };

    Checker.prototype.assignment = function (node) {
        var self = this;
        var op = node.op;
        if (op !== '=' && op !== ':=') {
            // x op= y
            if (node.lhs.length !== 1 || node.rhs.length !== 1)
                this.error(node, 'assignment operation ' + op + ' requires single-valued expressions');
            this.value(node.lhs[0]);
            this.addressable(node.lhs[0], 'assign to');
            var binaryNode = { k: 'binary', op: op.substring(0, op.length - 1), x: node.lhs[0], y: node.rhs[0],
                               line: node.line, column: node.column };
            // The left side is checked already; binary checks it again -
            // harmless.
            this.binary(binaryNode);
            node.binary = binaryNode;
            if (binaryNode.mode === 'const')
                binaryNode.mode = 'value';
            return;
        }
        var define = op === ':=';
        var lhs = node.lhs, rhs = node.rhs;
        // A right side with several values: a call or comma-ok.
        if (lhs.length !== rhs.length) {
            if (rhs.length !== 1)
                this.error(node, 'assignment mismatch: ' + lhs.length + ' variable' + (lhs.length > 1 ? 's' : '') +
                           ' but ' + rhs.length + ' value' + (rhs.length > 1 ? 's' : ''));
            var source = rhs[0];
            this.expr(source);
            var resultTypes;
            if (source.type && source.type.kind === 'tuple') {
                resultTypes = source.type.types;
                node.tupleAssign = true;
            } else if (lhs.length === 2 && (source.mode === 'commaok' || source.mode === 'mapindex')) {
                resultTypes = [source.type, types.untypedBool];
                node.commaOk = true;
                source.commaOk = true;
            } else {
                this.error(node, 'assignment mismatch: ' + lhs.length + ' variables but ' + exprString(source) +
                           ' returns ' + (source.mode === 'novalue' ? 'no values' : '1 value'));
            }
            if (resultTypes.length !== lhs.length)
                this.error(node, 'assignment mismatch: ' + lhs.length + ' variable' + (lhs.length > 1 ? 's' : '') +
                           ' but ' + exprString(source) + ' returns ' + resultTypes.length + ' value' + (resultTypes.length > 1 ? 's' : ''));
            node.resultTypes = resultTypes;
            if (define) {
                this.defineVariables(node, lhs, resultTypes.map(function (type) {
                    return type === types.untypedBool ? types.bool : type;
                }));
            } else {
                lhs.forEach(function (target, index) {
                    if (target.k === 'ident' && target.name === '_')
                        return;
                    self.value(target);
                    self.addressable(target, 'assign to');
                    var fake = { k: 'ident', name: exprString(source), mode: 'value', type: resultTypes[index],
                                 line: source.line, column: source.column };
                    self.assign(fake, target.type, 'assignment');
                });
            }
            return;
        }
        if (define) {
            var valueTypes = rhs.map(function (value) {
                self.value(value);
                if (value.type === types.untypedNil)
                    self.error(value, 'use of untyped nil in assignment');
                self.defaultUntyped(value);
                return value.type;
            });
            this.defineVariables(node, lhs, valueTypes);
            return;
        }
        lhs.forEach(function (target, index) {
            var value = rhs[index];
            if (target.k === 'ident' && target.name === '_') {
                self.value(value);
                if (value.type === types.untypedNil)
                    self.error(value, 'use of untyped nil in assignment');
                self.defaultUntyped(value);
                target.blank = true;
                return;
            }
            self.value(target);
            self.addressable(target, 'assign to');
            self.value(value, target.type);
            self.assign(value, target.type, 'assignment');
        });
    };

    // a, b := ... - at least one new variable in this scope.
    Checker.prototype.defineVariables = function (node, lhs, valueTypes) {
        var self = this;
        var anyNew = false;
        var topLevel = this.scope.kind === 'block-top';
        node.defines = [];
        lhs.forEach(function (target, index) {
            if (target.k !== 'ident')
                self.error(target, 'non-name ' + exprString(target) + ' on left side of :=');
            if (target.name === '_') {
                target.blank = true;
                node.defines.push(null);
                return;
            }
            var existing = self.scope.lookupLocal(target.name);
            if (existing !== null && existing.kind === 'var' && !(topLevel && existing.fromPackage)) {
                target.obj = existing;
                target.mode = 'var';
                target.type = existing.type;
                var fake = { k: 'ident', name: '', mode: 'value', type: valueTypes[index], line: target.line, column: target.column };
                self.assign(fake, existing.type, 'assignment');
                node.defines.push(null);
                return;
            }
            anyNew = true;
            var object = topLevel ? self.globalVar(target.name, valueTypes[index], target)
                                  : self.newVar(target.name, valueTypes[index], target);
            target.obj = object;
            target.mode = 'var';
            target.type = object.type;
            node.defines.push(object);
        });
        if (!anyNew)
            this.error(node, 'no new variables on left side of :=');
        node.defines.forEach(function (object) {
            if (object !== null)
                self.declare(object, node);
        });
    };

    Checker.prototype.returnStatement = function (node) {
        var info = this.func;
        if (info === null || info.topLevel)
            this.error(node, 'return outside function');
        var results = info.signature.results;
        var values = node.results;
        var self = this;
        if (values.length === 0) {
            if (results.length > 0 && info.results.length === 0)
                this.error(node, 'not enough return values\n\thave ()\n\twant (' +
                           results.map(function (result) { return G.typeString(result.type); }).join(', ') + ')');
            node.naked = results.length > 0;
            return;
        }
        if (values.length === 1 && results.length > 1) {
            this.expr(values[0]);
            if (values[0].type && values[0].type.kind === 'tuple') {
                var tuple = values[0].type.types;
                if (tuple.length !== results.length)
                    this.error(node, (tuple.length < results.length ? 'not enough' : 'too many') + ' return values');
                tuple.forEach(function (type, index) {
                    var fake = { k: 'ident', name: exprString(values[0]), mode: 'value', type: type, line: node.line,
                                 column: node.column };
                    self.assign(fake, results[index].type, 'return statement');
                });
                node.spread = true;
                return;
            }
        }
        if (values.length !== results.length) {
            values.forEach(function (value) {
                if (!value.type)
                    self.expr(value);
            });
            this.error(values.length > results.length ? values[results.length] || node : node,
                       (values.length < results.length ? 'not enough' : 'too many') + ' return values\n\thave (' +
                       values.map(function (value) { return G.isUntyped(value.type) ? 'number' : G.typeString(value.type); }).join(', ') +
                       ')\n\twant (' + results.map(function (result) { return G.typeString(result.type); }).join(', ') + ')');
        }
        values.forEach(function (value, index) {
            self.value(value, results[index].type);
            self.assign(value, results[index].type, 'return statement');
        });
    };

    Checker.prototype.branch = function (node) {
        var targets = this.breakTargets || [];
        switch (node.tok) {
        case 'break':
        case 'continue': {
            if (node.label !== null) {
                var labeled = this.func.labels[node.label];
                if (labeled === undefined)
                    this.error(node, 'invalid ' + node.tok + ' label ' + node.label);
                if (targets.indexOf(labeled.stmt) < 0)
                    this.error(node, 'invalid ' + node.tok + ' label ' + node.label);
                if (node.tok === 'continue' && labeled.stmt.k !== 'for' && labeled.stmt.k !== 'range')
                    this.error(node, 'invalid continue label ' + node.label);
                node.target = labeled.stmt;
                labeled.stmt.labelUsed = true;
                if (node.tok === 'break')
                    labeled.stmt.hasBreak = true;
                return;
            }
            var found = null;
            for (var index = targets.length - 1; index >= 0; --index) {
                var target = targets[index];
                if (node.tok === 'break' || target.k === 'for' || target.k === 'range') {
                    found = target;
                    break;
                }
            }
            if (found === null)
                this.error(node, node.tok + ' is not in a loop' + (node.tok === 'break' ? ', switch, or select' : ''));
            node.target = found;
            if (node.tok === 'break')
                found.hasBreak = true;
            return;
        }
        case 'fallthrough':
            if (!this.fallthroughAllowed || this.fallthroughAllowed !== node)
                this.error(node, 'fallthrough statement out of place');
            return;
        case 'goto':
            this.error(node, 'goto is not supported');
        }
    };

    Checker.prototype.labeled = function (node) {
        if (this.func.labels[node.label] !== undefined)
            this.error(node, 'label ' + node.label + ' already defined');
        this.func.labels[node.label] = node;
        node.stmt.label = node.label;
        this.statement(node.stmt);
    };

    Checker.prototype.rangeStatement = function (node) {
        var self = this;
        this.openScope('block');
        this.value(node.x);
        var type = node.x.type;
        var underlyingType = G.underlying(type);
        var keyType, valueType = null;
        if (underlyingType.kind === 'pointer' && G.underlying(underlyingType.elem).kind === 'array') {
            node.derefArray = true;
            underlyingType = G.underlying(underlyingType.elem);
        }
        if (G.isString(type)) {
            node.rangeKind = 'string';
            keyType = types.int;
            valueType = types.rune;
            this.defaultUntyped(node.x);
        } else if (G.isInteger(type)) {
            node.rangeKind = 'int';
            this.defaultUntyped(node.x);
            keyType = node.x.type;
            if (node.value !== null)
                this.error(node.value, 'range over ' + this.describe(node.x) + ' permits only one iteration variable');
        } else {
            switch (underlyingType.kind) {
            case 'array':
            case 'slice':
                node.rangeKind = underlyingType.kind;
                keyType = types.int;
                valueType = underlyingType.elem;
                break;
            case 'map':
                node.rangeKind = 'map';
                keyType = underlyingType.key;
                valueType = underlyingType.elem;
                break;
            case 'chan':
                node.rangeKind = 'chan';
                keyType = underlyingType.elem;
                if (underlyingType.dir === 'send')
                    this.error(node.x, 'invalid operation: range ' + exprString(node.x) + ' receive from send-only channel');
                if (node.value !== null)
                    this.error(node.value, 'range over ' + this.describe(node.x) + ' permits only one iteration variable');
                if (this.func !== null)
                    this.func.blocking = true;
                break;
            case 'func':
                this.error(node.x, 'range over function iterators is not supported');
                break;
            default:
                this.error(node.x, 'cannot range over ' + this.describe(node.x));
            }
        }
        var targets = [node.key, node.value];
        var targetTypes = [keyType, valueType];
        if (node.define) {
            node.defines = [];
            targets.forEach(function (target, index) {
                if (target === null) {
                    node.defines.push(null);
                    return;
                }
                if (target.k !== 'ident')
                    self.error(target, 'non-name ' + exprString(target) + ' on left side of :=');
                if (target.name === '_') {
                    node.defines.push(null);
                    return;
                }
                var object = self.newVar(target.name, targetTypes[index], target);
                target.obj = object;
                target.mode = 'var';
                target.type = object.type;
                node.defines.push(object);
            });
            node.defines.forEach(function (object) {
                if (object !== null)
                    self.declare(object, node);
            });
        } else {
            targets.forEach(function (target, index) {
                if (target === null || (target.k === 'ident' && target.name === '_'))
                    return;
                self.value(target);
                self.addressable(target, 'assign to');
                var fake = { k: 'ident', name: '', mode: 'value', type: targetTypes[index], line: target.line, column: target.column };
                self.assign(fake, target.type, 'range');
            });
        }
        this.loop(node, function () {
            self.openScope('block');
            self.statementList(node.body.list);
            self.closeScope();
        });
        this.closeScope();
    };

    Checker.prototype.switchStatement = function (node) {
        var self = this;
        this.openScope('block');
        if (node.init !== null)
            this.statement(node.init);
        var tagType = types.bool;
        if (node.tag !== null) {
            this.value(node.tag);
            this.defaultUntyped(node.tag);
            tagType = node.tag.type;
        }
        var hasDefault = false;
        this.loop(node, function () {
            node.clauses.forEach(function (clause, index) {
                if (clause.values === null) {
                    if (hasDefault)
                        self.error(clause, 'multiple defaults in switch');
                    hasDefault = true;
                } else {
                    clause.values.forEach(function (value) {
                        self.value(value);
                        if (node.tag === null) {
                            if (!G.isBoolean(value.type))
                                self.error(value, 'invalid case ' + exprString(value) + ' in switch (mismatched types ' +
                                           self.typeName(value.type) + ' and bool)');
                            self.defaultUntyped(value);
                        } else {
                            if (G.isUntyped(value.type)) {
                                if (self.convertUntyped(value, tagType) !== null)
                                    self.error(value, 'invalid case ' + exprString(value) + ' in switch on ' + exprString(node.tag) +
                                               ' (mismatched types ' + self.typeName(value.type) + ' and ' + self.typeName(tagType) + ')');
                            } else if (self.assignable(value, tagType) !== null && self.assignable(node.tag, value.type) !== null) {
                                self.error(value, 'invalid case ' + exprString(value) + ' in switch on ' + exprString(node.tag) +
                                           ' (mismatched types ' + self.typeName(value.type) + ' and ' + self.typeName(tagType) + ')');
                            }
                            value.compareType = G.isInterface(tagType) !== G.isInterface(value.type)
                                ? (G.isInterface(tagType) ? tagType : value.type) : tagType;
                        }
                    });
                }
                self.openScope('block');
                var body = clause.body;
                var last = body.length > 0 ? body[body.length - 1] : null;
                if (last !== null && last.k === 'branch' && last.tok === 'fallthrough') {
                    if (index === node.clauses.length - 1)
                        self.error(last, 'cannot fallthrough final case in switch');
                    clause.fallthrough = true;
                    self.fallthroughAllowed = last;
                }
                self.statementList(body);
                self.fallthroughAllowed = null;
                self.closeScope();
            });
        });
        node.hasDefault = hasDefault;
        this.closeScope();
    };

    Checker.prototype.typeSwitch = function (node) {
        var self = this;
        this.openScope('block');
        if (node.init !== null)
            this.statement(node.init);
        this.value(node.x);
        if (!G.isInterface(node.x.type))
            this.error(node.x, exprString(node.x) + ' (' + this.describe(node.x).replace(/^[^(]*\(|\)$/g, '') + ') is not an interface');
        var hasDefault = false;
        node.bindings = [];
        this.loop(node, function () {
            node.clauses.forEach(function (clause) {
                var caseTypes = [];
                if (clause.values === null) {
                    if (hasDefault)
                        self.error(clause, 'multiple defaults in switch');
                    hasDefault = true;
                } else {
                    clause.values.forEach(function (value) {
                        if (value.k === 'ident' && value.name === 'nil' && self.scope.lookup('nil').kind === 'nil') {
                            value.isNil = true;
                            caseTypes.push(null);
                            return;
                        }
                        var type = self.typeExpr(value);
                        value.caseType = type;
                        self.checkAssertable(value, node.x.type, type);
                        caseTypes.push(type);
                    });
                }
                self.openScope('block');
                if (node.bind !== null) {
                    var bindType = caseTypes.length === 1 && caseTypes[0] !== null ? caseTypes[0] : node.x.type;
                    var object = self.newVar(node.bind, bindType, clause);
                    object.used = true;
                    self.declare(object, clause);
                    clause.binding = object;
                    node.bindings.push(object);
                }
                self.statementList(clause.body);
                self.closeScope();
            });
        });
        node.hasDefault = hasDefault;
        this.closeScope();
    };

    Checker.prototype.selectStatement = function (node) {
        var self = this;
        if (this.func !== null)
            this.func.blocking = true;
        var hasDefault = false;
        this.loop(node, function () {
            node.clauses.forEach(function (clause) {
                self.openScope('block');
                var comm = clause.comm;
                if (comm === null) {
                    if (hasDefault)
                        self.error(clause, 'multiple defaults in select');
                    hasDefault = true;
                } else if (comm.k === 'send') {
                    self.statement(comm);
                    clause.commKind = 'send';
                } else {
                    var receive = comm.k === 'exprstmt' ? comm.x : (comm.k === 'assign' ? comm.rhs[0] : null);
                    while (receive !== null && receive.k === 'paren')
                        receive = receive.x;
                    if (receive === null || receive.k !== 'unary' || receive.op !== '<-' ||
                        (comm.k === 'assign' && comm.rhs.length !== 1))
                        self.error(comm, 'select case must be receive, send or assign recv');
                    self.statement(comm);
                    clause.commKind = 'receive';
                    clause.receive = receive;
                }
                self.statementList(clause.body);
                self.closeScope();
            });
        });
        node.hasDefault = hasDefault;
    };

    // --- Terminating statements (for "missing return")

    Checker.prototype.isTerminatingList = function (list) {
        for (var index = list.length - 1; index >= 0; --index) {
            if (list[index].k !== 'empty')
                return this.isTerminating(list[index]);
        }
        return false;
    };

    Checker.prototype.isTerminating = function (node) {
        var self = this;
        switch (node.k) {
        case 'return':
            return true;
        case 'branch':
            return node.tok === 'goto';
        case 'exprstmt': {
            var expression = node.x;
            while (expression.k === 'paren')
                expression = expression.x;
            return expression.k === 'call' && expression.callKind === 'builtin' && expression.builtin === 'panic';
        }
        case 'block':
            return this.isTerminatingList(node.list);
        case 'if':
            return node.otherwise !== null && this.isTerminatingList(node.then.list) && this.isTerminating(node.otherwise);
        case 'for':
            return node.cond === null && !node.hasBreak;
        case 'range':
            return false;
        case 'labeled':
            return this.isTerminating(node.stmt);
        case 'switch':
        case 'typeswitch':
            return node.hasDefault && !node.hasBreak && node.clauses.every(function (clause) {
                return clause.fallthrough || self.isTerminatingList(clause.body);
            });
        case 'select':
            return !node.hasBreak && node.clauses.every(function (clause) { return self.isTerminatingList(clause.body); });
        }
        return false;
    };

    // --- Declarations inside functions

    Checker.prototype.localDeclaration = function (decl) {
        var self = this;
        switch (decl.k) {
        case 'var':
            decl.specs.forEach(function (spec) { self.varSpec(spec, false); });
            return;
        case 'const':
            decl.specs.forEach(function (spec) { self.constSpec(spec); });
            return;
        case 'type':
            this.typeDeclarations(decl.specs, false);
            return;
        }
    };

    Checker.prototype.varSpec = function (spec, global) {
        var self = this;
        var declared = spec.type !== null ? this.typeExpr(spec.type) : null;
        var values = spec.values;
        var valueTypes = [];
        spec.objects = [];
        if (values !== null) {
            if (values.length === 1 && spec.names.length > 1) {
                var source = values[0];
                this.expr(source, declared || undefined);
                if (source.type && source.type.kind === 'tuple') {
                    valueTypes = source.type.types.slice();
                    spec.tupleAssign = true;
                } else if (spec.names.length === 2 && (source.mode === 'commaok' || source.mode === 'mapindex')) {
                    valueTypes = [source.type, types.bool];
                    spec.commaOk = true;
                    source.commaOk = true;
                } else {
                    this.error(spec, 'assignment mismatch: ' + spec.names.length + ' variables but 1 value');
                }
                if (valueTypes.length !== spec.names.length)
                    this.error(spec, 'assignment mismatch: ' + spec.names.length + ' variables but ' + exprString(source) +
                               ' returns ' + valueTypes.length + ' values');
                if (declared !== null) {
                    valueTypes.forEach(function (type) {
                        var fake = { k: 'ident', name: exprString(source), mode: 'value', type: type, line: spec.line, column: spec.column };
                        self.assign(fake, declared, 'assignment');
                    });
                }
            } else {
                if (values.length !== spec.names.length)
                    this.error(spec, (values.length < spec.names.length ? 'assignment mismatch: ' + spec.names.length +
                               ' variables but ' + values.length + ' value' + (values.length > 1 ? 's' : '')
                        : 'extra init expr'));
                values.forEach(function (value) {
                    self.value(value, declared || undefined);
                    if (declared !== null) {
                        self.assign(value, declared, 'variable declaration');
                    } else {
                        if (value.type === types.untypedNil)
                            self.error(value, 'use of untyped nil in variable declaration');
                        self.defaultUntyped(value);
                    }
                    valueTypes.push(value.type);
                });
            }
        } else if (declared === null) {
            this.error(spec, 'missing type or init expr');
        }
        spec.names.forEach(function (name, index) {
            var type = declared !== null ? declared : valueTypes[index];
            var object = global ? self.globalVar(name, type, spec) : self.newVar(name, type, spec);
            spec.objects.push(object);
        });
        spec.objects.forEach(function (object) {
            self.declare(object, spec);
        });
    };

    Checker.prototype.constSpec = function (spec) {
        var self = this;
        var savedIota = this.iota;
        this.iota = spec.iota;
        var declared = spec.type !== null ? this.typeExpr(spec.type) : null;
        if (declared !== null && !G.isBasic(declared))
            this.error(spec, 'invalid constant type ' + this.typeName(declared));
        if (spec.values.length !== spec.names.length)
            this.error(spec, spec.values.length < spec.names.length ? 'missing init expr for const declaration' : 'extra init expr');
        var objects = [];
        spec.values.forEach(function (template, index) {
            // Repeated expressions are checked again (with their own iota).
            var value = spec.implicit ? cloneNode(template) : template;
            self.expr(value);
            if (value.mode !== 'const')
                self.error(value, exprString(value) + ' (' + self.describe(value).replace(/^[^(]*\(|\)$/g, '') +
                               ') is not constant');
            var type = value.type;
            var constantValue = value.value;
            if (declared !== null) {
                if (G.isUntyped(type)) {
                    var error = self.convertUntyped(value, declared);
                    if (error !== null)
                        self.error(value, error);
                    constantValue = value.value;
                } else if (!G.identical(type, declared)) {
                    self.error(value, 'cannot use ' + self.describe(value) + ' as ' + self.typeName(declared) + ' value in constant declaration');
                }
                type = declared;
            }
            objects.push({ kind: 'const', name: spec.names[index], type: type, value: constantValue, line: spec.line });
        });
        objects.forEach(function (object) { self.declare(object, spec); });
        this.iota = savedIota;
    };

    // The fields of the parse tree; everything else is the marking of the
    // check, which a copy does not get (a copy is checked again, in another
    // type environment).
    var SYNTAX_KEYS = {};
    ('k line column name kind x y op fn args ellipsis index indices low high max typeExpr elements key elem length dir ' +
     'signature params results variadic fields names tag methods embeds terms tilde list endLine label tok call init ' +
     'cond then otherwise post body define clauses values comm stmt lhs rhs ch decl specs typeParams receiver iota ' +
     'implicit alias constraint packageName imports items path raw').split(' ').forEach(function (key) { SYNTAX_KEYS[key] = true; });

    function cloneNode(node) {
        if (node === null || typeof node !== 'object')
            return node;
        if (Array.isArray(node))
            return node.map(cloneNode);
        var copy = {};
        Object.keys(node).forEach(function (key) {
            var value = node[key];
            if (SYNTAX_KEYS[key] === true)
                copy[key] = cloneNode(value);
            else if (key === 'value' && (node.k === 'lit' || value === null || (typeof value === 'object' && value.k !== undefined)))
                copy[key] = cloneNode(value);
            else if (key === 'type' && (value === null || (typeof value === 'object' && value.k !== undefined)))
                copy[key] = cloneNode(value);
        });
        return copy;
    }
    Go.cloneNode = cloneNode;

    // Type declarations: all names first (they refer to each other), then
    // their structure.
    Checker.prototype.typeDeclarations = function (specs, topLevel) {
        var self = this;
        var pending = [];
        specs.forEach(function (spec) {
            if (spec.typeParams !== null) {
                self.declareGenericType(spec);
                return;
            }
            if (spec.alias) {
                pending.push({ spec: spec, alias: true });
                return;
            }
            var object = null;
            if (topLevel) {
                // The same type on a repeated run of the unit is the same
                // object: the values in variables keep their type.
                var previous = self.pkg.scope.lookupLocal(spec.name);
                if (previous !== null && previous.kind === 'typename' && previous.type.kind === 'named' &&
                    !previous.type.builtin && !previous.generic) {
                    object = { kind: 'typename', name: spec.name, type: previous.type, line: spec.line };
                    var type = previous.type;
                    var savedUnderlying = type.underlying, savedMethods = type.methods.slice(), savedDesc = type.desc;
                    self.undo.push(function () {
                        type.underlying = savedUnderlying;
                        type.methods = savedMethods;
                        type.desc = savedDesc;
                    });
                    object.reused = true;
                    object.previousUnderlying = savedUnderlying;
                }
            }
            if (object === null) {
                var named = G.named(spec.name, self.pkg.name, null);
                named.local = !topLevel;
                object = { kind: 'typename', name: spec.name, type: named, line: spec.line };
            }
            self.declare(object, spec);
            spec.object = object;
            pending.push({ spec: spec, object: object });
        });
        pending.forEach(function (item) {
            if (item.alias) {
                var aliased = self.typeExpr(item.spec.type);
                var aliasObject = { kind: 'typename', name: item.spec.name, type: aliased, line: item.spec.line };
                self.declare(aliasObject, item.spec);
                item.spec.object = aliasObject;
                return;
            }
            var named = item.object.type;
            named.resolving = true;
            var underlying = self.typeExpr(item.spec.type);
            named.resolving = false;
            if (underlying === named || (underlying.kind === 'named' && G.underlying(underlying) === null))
                self.error(item.spec, 'invalid recursive type ' + item.spec.name);
            var underlyingType = underlying.kind === 'named' ? underlying.underlying : underlying;
            if (underlyingType === null)
                self.error(item.spec, 'invalid recursive type ' + item.spec.name);
            if (item.object.reused && !G.identical(item.object.previousUnderlying, underlyingType)) {
                // The structure differs: new values are of the new kind.
                named.desc = undefined;
                named.methods = [];
            }
            named.underlying = underlyingType;
            if (item.object.reused && G.identical(item.object.previousUnderlying, underlyingType))
                named.underlying = item.object.previousUnderlying;
            self.checkRecursiveStruct(item.spec, named);
        });
    };

    // A struct cannot contain itself without a pointer.
    Checker.prototype.checkRecursiveStruct = function (spec, named) {
        var self = this;
        var path = [];
        function visit(type) {
            if (type.kind === 'named') {
                if (path.indexOf(type) >= 0) {
                    if (type === named)
                        self.error(spec, 'invalid recursive type ' + named.name);
                    return;
                }
                path.push(type);
                visit(type.underlying);
                path.pop();
                return;
            }
            if (type.kind === 'struct')
                type.fields.forEach(function (field) { visit(field.type); });
            else if (type.kind === 'array')
                visit(type.elem);
        }
        visit(named);
    };

    // --- Declarations of functions and methods

    Checker.prototype.declareFunction = function (decl) {
        if (decl.typeParams !== null && decl.receiver === null) {
            this.declareGenericFunction(decl);
            return;
        }
        if (decl.receiver !== null) {
            // A method of a generic type: every instance has its signature.
            var receiverType = decl.receiver.type;
            if (receiverType.k === 'pointer' || receiverType.k === 'star')
                receiverType = receiverType.elem || receiverType.x;
            if (receiverType.k === 'instance' || receiverType.k === 'index') {
                this.declareGenericMethod(decl, receiverType, decl.receiver.type !== receiverType);
                return;
            }
        }
        var signature = this.signatureType(decl.signature, null);
        if (decl.body === null && !this.pkg.natives)
            this.error(decl, 'missing function body');
        if (decl.receiver !== null) {
            this.declareMethod(decl, signature);
            return;
        }
        if (decl.name === 'init' || decl.name === 'main') {
            if (signature.params.length > 0 || signature.results.length > 0)
                this.error(decl, 'func ' + decl.name + ' must have no arguments and no return values');
        }
        var object = { kind: 'func', name: decl.name, type: signature, pkg: this.pkg, decl: decl,
                       jsName: T.propertyName(decl.name), line: decl.line, async: false, native: decl.body === null };
        decl.object = object;
        if (decl.name === 'init') {
            decl.object.jsName = '$init' + (++this.pkg.initCounter);
            this.pkg.inits = this.pkg.inits || [];
            return;
        }
        if (decl.name === '_')
            return;
        var existing = this.scope.lookupLocal(decl.name);
        if (existing !== null && this.scope.kind === 'block-top' && existing.blockDeclared)
            this.error(decl, decl.name + ' redeclared in this block');
        object.blockDeclared = true;
        this.declare(object, decl);
    };

    Checker.prototype.declareMethod = function (decl, signature) {
        var receiver = decl.receiver;
        var receiverTypeNode = receiver.type;
        var pointerReceiver = false;
        if (receiverTypeNode.k === 'pointer' || receiverTypeNode.k === 'star') {
            pointerReceiver = true;
            receiverTypeNode = receiverTypeNode.elem || receiverTypeNode.x;
        }
        // A method of a generic type: func (s *Stack[T]) Push(v T)
        if (receiverTypeNode.k === 'instance' || receiverTypeNode.k === 'index') {
            this.declareGenericMethod(decl, receiverTypeNode, pointerReceiver);
            return;
        }
        if (receiverTypeNode.k !== 'ident')
            this.error(receiver, 'invalid receiver type ' + exprString(receiver.type));
        var object = this.scope.lookup(receiverTypeNode.name);
        if (object === null)
            this.error(receiverTypeNode, 'undefined: ' + receiverTypeNode.name);
        if (object.kind !== 'typename' || object.type.kind !== 'named' || object.type.builtin)
            this.error(receiverTypeNode, 'cannot define new methods on non-local type ' + receiverTypeNode.name);
        var named = object.type;
        if (named.pkg !== this.pkg.name)
            this.error(receiverTypeNode, 'cannot define new methods on non-local type ' + G.typeString(named));
        var underlyingType = G.underlying(named);
        if (underlyingType.kind === 'pointer' || underlyingType.kind === 'interface')
            this.error(receiverTypeNode, 'invalid receiver type ' + receiverTypeNode.name + ' (pointer or interface type)');
        if (underlyingType.kind === 'struct' && underlyingType.fields.some(function (field) {
            return field.name === decl.name;
        }))
            this.error(decl, 'field and method with the same name ' + decl.name);
        var method = { kind: 'func', name: decl.name, type: signature, pkg: this.pkg, decl: decl, recv: named,
                       pointerReceiver: pointerReceiver, jsName: T.propertyName(decl.name), line: decl.line,
                       async: false, native: decl.body === null, method: true };
        var methods = named.methods;
        for (var index = 0; index < methods.length; ++index) {
            if (methods[index].name === decl.name) {
                if (methods[index].declaredBy === this)
                    this.error(decl, 'method ' + named.name + '.' + decl.name + ' already declared');
                if (!object.reused && !named.local) {
                    var saved = methods.slice();
                    this.undo.push(function () { named.methods = saved; });
                }
                methods.splice(index, 1);
                break;
            }
        }
        if (object.reused === undefined && !named.local && this.scope.lookupLocal(receiverTypeNode.name) === null) {
            var savedMethods = methods.slice();
            this.undo.push(function () { named.methods = savedMethods; });
        }
        method.declaredBy = this;
        methods.push(method);
        decl.object = method;
        decl.receiverType = pointerReceiver ? G.pointer(named) : named;
    };

    // The body of a function or a method declared in the unit.
    Checker.prototype.functionDeclarationBody = function (decl) {
        if (decl.body === null || decl.object === undefined || decl.object.generic)
            return;
        var object = decl.object;
        var info = new FunctionInfo(null, object.type, decl, decl.name);
        info.object = object;
        decl.info = info;
        object.info = info;
        var receiver = null;
        if (decl.receiver !== null)
            receiver = { name: decl.receiver.name, type: decl.receiverType, node: decl.receiver };
        this.functionBody(info, decl.signature, receiver, decl.body);
    };

    Go.Checker = Checker;
})(globalThis);
