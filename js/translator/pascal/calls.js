// Pascal: routine calls (overloads, var/const/out parameters, open
// arrays, default values), procedural values, type casts, members (fields,
// methods, properties, units), indices, pointers.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Pascal = T.pascal;
    var Compiler = Pascal.Compiler;
    if (Compiler.prototype.compileCall)
        return;

    var J = T.J;
    var t = Pascal.t;
    var types = Pascal.types;
    var big = T.big;
    var Value = Pascal.Value;
    var PropRef = Pascal.PropRef;

    // --- A call: f(x), obj.M(x), TFoo(x), TFoo.Create(x), p(x)

    // statement - a call statement (the result of a function is dropped).
    Compiler.prototype.compileCall = function (node, expected, statement) {
        var callee = this.compileExpr(node.callee, undefined, true);
        return this.callTarget(callee, node.args, node, expected, statement);
    };

    Compiler.prototype.callTarget = function (callee, args, node, expected, statement) {
        switch (callee.kind) {
        case 'routine':
            return this.callRoutine(callee.symbol.procs, args, node, null, statement, expected, callee);
        case 'builtin':
            return this.callBuiltin(callee.symbol, args, node, expected, statement);
        case 'method':
            return this.callMethod(callee, args, node, statement, expected);
        case 'type':
            return this.typeCast(callee.type, args, node);
        case 'unit':
            this.error('Illegal expression', node);
        }
        var value = callee;
        if (value.type.kind === 'proc')
            return this.callProcValue(value, args, node, statement);
        if (value.type.kind === 'js')
            return this.callJs(value, args, node);
        if (value.type.kind === 'classref' && value.constructorCall !== undefined)
            return value.constructorCall(args);
        this.error('Illegal expression', node);
    };

    // A routine without parentheses in an expression: a function is called,
    // a procedure is an error; in place of a procedural type it is a value
    // (in delphi).
    Compiler.prototype.callValueWithoutArgs = function (value, node, expected) {
        if (expected !== undefined && expected !== null && expected.kind === 'proc' && value.kind === 'routine' &&
            !this.isObjfpc(node))
            return this.procedureValue({ routineSymbol: value.symbol }, expected, node);
        if (value.kind === 'routine')
            return this.callRoutine(value.symbol.procs, [], node, null, false, expected, value);
        if (value.kind === 'builtin')
            return this.callBuiltin(value.symbol, [], node, expected, false);
        if (value.kind === 'method')
            return this.callMethod(value, [], node, false, expected);
        this.error('Illegal expression', node);
    };

    // --- Overload resolution

    // How well an argument fits a parameter: 0 - it does not, more is
    // better.
    Compiler.prototype.matchScore = function (param, arg) {
        var to = param.type;
        var from = arg.type;
        if (param.mode === 'var' || param.mode === 'out') {
            if (arg.ref === null || arg.ref === undefined)
                return 0;
            if (to === null)
                return 10;
            if (types.equal(to, from))
                return 100;
            if (to.kind === 'openarray' && (from.kind === 'array' || from.kind === 'dynarray') && types.equal(to.of, from.of))
                return 90;
            if (to.kind === 'class' && from.kind === 'class' && types.inherits(from, to) && from === to)
                return 100;
            if (to.kind === 'string' && from.kind === 'string')
                return 80;
            return 0;
        }
        if (to === null)
            return 10;
        if (from.kind === 'type' || from === undefined)
            return 0;
        if (to.kind === 'arrayofconst') {
            if (from.kind === 'arrayofconst')
                return 100;
            return from.kind === 'arrayliteral' || arg.setLiteral ? 60 : 0;
        }
        if (to.kind === 'openarray') {
            if ((from.kind === 'array' || from.kind === 'dynarray' || from.kind === 'openarray') && types.equal(to.of, from.of))
                return 90;
            if (arg.setLiteral || from.kind === 'arrayliteral')
                return 60;
            if (types.equal(to.of, from) || (to.of.kind === 'char' && from.kind === 'char'))
                return 20;
            return 0;
        }
        if (types.equal(to, from))
            return 100;
        if (!this.assignable(to, arg)) {
            if (to.kind === 'proc' && arg.routineSymbol !== undefined)
                return 50;
            return 0;
        }
        if (to.kind === 'int' && from.kind === 'int') {
            // Wider is better than narrower; closer in size is better.
            var fromRange = arg.range || types.range(from);
            var toRange = types.range(to);
            var fits = fromRange[0] >= toRange[0] && fromRange[1] <= toRange[1];
            if (!fits)
                return 30 - Math.abs(to.size - from.size);
            var signedSame = (to.ik.charAt(0) === from.ik.charAt(0)) ? 2 : 0;
            return 80 - to.size + signedSame;
        }
        if (to.kind === 'real' && from.kind === 'real') {
            var order = { f32: 1, f64: 2, f80: 3 };
            return order[to.rk] >= order[from.rk] ? 75 - order[to.rk] : 40;
        }
        if (to.kind === 'real' && from.kind === 'int')
            return to.rk === 'f80' ? 52 : (to.rk === 'f64' ? 51 : 50);
        if (to.kind === 'string' && from.kind === 'char')
            return 45;
        if (to.kind === 'char' && from.kind === 'string')
            return 70;
        if (to.kind === 'class' && from.kind === 'class') {
            var depth = 0;
            for (var current = from; current !== null && current !== to; current = current.parent)
                ++depth;
            return 85 - depth;
        }
        if (to.kind === 'js')
            return 15;
        if (from.kind === 'js')
            return 15;
        if (from.kind === 'nil')
            return 70;
        return 60;
    };

    // Arguments for the choice: values without evaluating type hints.
    Compiler.prototype.compileArgs = function (args, hints) {
        var self = this;
        return args.map(function (arg, index) {
            if (arg.k === 'format')
                self.error('Illegal expression', arg);
            var hint = hints ? hints[index] : undefined;
            var value = self.compileExpr(arg, hint);
            if (value.kind === 'routine' && (hint === undefined || hint === null || hint.kind !== 'proc'))
                value = self.toValue(value, arg, hint);
            else if (value.kind === 'type' || value.kind === 'builtin' || value.kind === 'method')
                value = self.toValue(value, arg, hint);
            return value;
        });
    };

    // Type hints for the arguments: the common parameter type of all
    // overloads if there is one (for [ ] and nil).
    function argumentHints(procs, count) {
        var hints = [];
        for (var index = 0; index < count; ++index) {
            var hint = null;
            for (var procIndex = 0; procIndex < procs.length && hint !== undefined; ++procIndex) {
                var param = procs[procIndex].params[index];
                if (param === undefined || param.type === null)
                    continue;
                if (hint === null)
                    hint = param.type;
                else if (hint !== param.type)
                    hint = hint.kind === param.type.kind && (hint.kind === 'openarray' || hint.kind === 'set' || hint.kind === 'proc' || hint.kind === 'dynarray') ? hint : undefined;
            }
            hints.push(hint === null ? undefined : hint);
        }
        return hints;
    }

    Pascal.argumentHints = argumentHints;

    Compiler.prototype.chooseOverload = function (procs, values, node, name) {
        var self = this;
        var best = null, bestScore = -1, ambiguous = false;
        procs.forEach(function (proc) {
            if (values.length > proc.params.length)
                return;
            var score = 0;
            for (var index = 0; index < proc.params.length; ++index) {
                var param = proc.params[index];
                if (index >= values.length) {
                    if (param.defaultValue === null)
                        return;
                    continue;
                }
                var paramScore = self.matchScore(param, values[index]);
                if (paramScore === 0)
                    return;
                score += paramScore;
            }
            // Fewer default values substituted is better.
            score = score * 100 - (proc.params.length - values.length);
            if (score > bestScore) {
                best = proc;
                bestScore = score;
                ambiguous = false;
            } else if (score === bestScore) {
                ambiguous = true;
            }
        });
        if (best === null) {
            if (procs.length === 1)
                this.explainMismatch(procs[0], values, node);
            this.error('Can\'t determine which overloaded function to call' + (name ? ' "' + name + '"' : ''), node);
        }
        if (ambiguous && procs.length > 1)
            this.error('Can\'t determine which overloaded function to call' + (name ? ' "' + name + '"' : ''), node);
        return best;
    };

    // An error as FPC reports it for a single routine.
    Compiler.prototype.explainMismatch = function (proc, values, node) {
        if (values.length > proc.params.length || values.length < proc.params.filter(function (param) {
            return param.defaultValue === null;
        }).length)
            this.error('Wrong number of parameters specified for call to "' + proc.text + '"', node);
        for (var index = 0; index < values.length; ++index) {
            var param = proc.params[index];
            var value = values[index];
            if (this.matchScore(param, value) === 0) {
                var argNode = node.args && node.args[index] ? node.args[index] : node;
                if ((param.mode === 'var' || param.mode === 'out') && (value.ref === null || value.ref === undefined))
                    this.error('Variable identifier expected', argNode);
                if ((param.mode === 'var' || param.mode === 'out') && param.type !== null)
                    this.error('Call by var for arg no. ' + (index + 1) + ' has to match exactly: Got "' +
                               types.display(value.type) + '" expected "' + types.display(param.type) + '"', argNode);
                this.error('Incompatible type for arg no. ' + (index + 1) + ': Got "' + types.display(value.type) +
                           '", expected "' + types.display(param.type) + '"', argNode);
            }
        }
    };

    // --- Arguments

    // The JavaScript arguments of a routine: values, pairs for var, arrays
    // for open arrays.
    Compiler.prototype.passArgs = function (proc, values, argNodes, node) {
        var self = this;
        var result = [];
        proc.params.forEach(function (param, index) {
            var value = values[index];
            var argNode = argNodes[index] || node;
            if (value === undefined) {
                // A default value.
                var defaultValue = self.convertValue(param.defaultValue, param.type, node);
                result.push(defaultValue.node);
                return;
            }
            result.push.apply(result, self.passArg(param, value, argNode));
        });
        return result;
    };

    Compiler.prototype.passArg = function (param, value, argNode) {
        var mode = param.mode;
        var type = param.type;
        if (mode === 'var' || mode === 'out') {
            var ref = value.ref;
            if (ref === null || ref === undefined)
                this.error('Variable identifier expected', argNode);
            if (ref.readOnly)
                this.error(ref.loopVariable ? 'Illegal assignment to for-loop variable' : "Can't assign values to const variable", argNode);
            if (ref instanceof Pascal.PropertyRef)
                this.error('Variable identifier expected', argNode);
            this.noteModified(ref);
            if (type !== null && Pascal.passesObject(type))
                return [ref.get()];
            if (type === null) {
                // An untyped var: an aggregate is the object itself, otherwise a box.
                if (types.isAggregate(value.type))
                    return [ref.get()];
                return [ref.address(this)];
            }
            if (type.kind === 'openarray')
                return [ref.get()];
            var pair = ref.pair();
            if (pair === null)
                this.error('Variable identifier expected', argNode);
            return pair;
        }
        if (type === null) {
            // An untyped const is the value as it is.
            return [value.node];
        }
        if (type.kind === 'openarray') {
            if (value.type.kind === 'array' || value.type.kind === 'dynarray' || value.type.kind === 'openarray')
                return [value.node];
            if (value.setLiteral || value.type.kind === 'arrayliteral')
                return [this.arrayLiteralValue(value, new Pascal.Type('dynarray', { name: null, of: type.of }), argNode).node];
            // A single value becomes an array of one element.
            return [J.arr([this.convertValue(value, type.of, argNode).node])];
        }
        if (type.kind === 'arrayofconst')
            return [this.arrayOfConst(value, argNode)];
        var converted = this.convertValue(value, type, argNode);
        if (type.kind === 'real' && converted.mayOverflow)
            return [this.checkedReal(converted.node)];
        return [converted.node];
    };

    // A store to an aggregate parameter: the function must copy it (see clone).
    Compiler.prototype.noteModified = function (ref) {
        if (ref instanceof Pascal.LocalRef && ref.symbol.isParam)
            ref.symbol.modified = true;
    };

    // --- A routine call

    Compiler.prototype.callRoutine = function (procs, args, node, self, statement, expected, callee) {
        var hints = argumentHints(procs, args.length);
        var values = this.compileArgs(args, hints);
        var proc = this.chooseOverload(procs, values, node, procs[0].text);
        return this.invoke(proc, values, args, node, self, statement);
    };

    // A call of the chosen routine.
    Compiler.prototype.invoke = function (proc, values, args, node, self, statement) {
        var jsArgs = this.passArgs(proc, values, args, node);
        var callNode;
        var calleeNode;
        if (proc.owner !== null)
            return this.invokeMethod(proc, self, jsArgs, node, statement, false);
        if (proc.nested)
            calleeNode = J.id(proc.js);
        else
            calleeNode = J.mem(J.id('$P'), proc.js);
        callNode = J.call(calleeNode, jsArgs);
        this.noteCall(proc, callNode, function (copy) {
            if (proc.nested)
                return copy;
            copy.callee = J.mem(copy.callee, 'gen');
            return copy;
        }, true);
        if (proc.result === null) {
            if (!statement)
                this.error('Illegal expression', node);
            return new Value(t.void, callNode);
        }
        var value = new Value(proc.result, callNode);
        value.range = types.range(proc.result);
        value.wide = proc.result.kind === 'int' && (proc.result.ik === 'i64' || proc.result.ik === 'u64');
        value.call = true;
        if (proc.result.kind === 'real')
            value.mayOverflow = false;
        return value;
    };

    // The call is remembered: if the callee turns out to wait (Delay), it
    // becomes yield* (see computeAsync).
    Compiler.prototype.noteCall = function (proc, callNode, generatorCallee, direct) {
        this.fn.calls.push({ proc: proc, node: callNode, generatorCallee: generatorCallee, direct: direct });
        if (proc.fn === undefined || proc.fn === null || proc.async)
            return;
    };

    // A call of a value of a procedural type.
    Compiler.prototype.callProcValue = function (value, args, node, statement) {
        var type = value.type;
        var values = this.compileArgs(args, type.params.map(function (param) { return param.type; }));
        var proc = { params: type.params, text: 'procedure variable', result: type.result };
        if (values.length > type.params.length)
            this.error('Wrong number of parameters specified for call to "<Procedure Variable>"', node);
        for (var index = 0; index < type.params.length; ++index) {
            if (index >= values.length) {
                if (type.params[index].defaultValue === null)
                    this.error('Wrong number of parameters specified for call to "<Procedure Variable>"', node);
                continue;
            }
            if (this.matchScore(type.params[index], values[index]) === 0)
                this.explainMismatch(proc, values, node);
        }
        var jsArgs = this.passArgs(proc, values, args, node);
        var target = value.node;
        if (!J.isSimple(target)) {
            var name = this.temp();
            target = J.seq([J.assign(J.id(name), target), J.id(name)]);
            target = J.id(name);
            jsArgs = jsArgs.slice();
            var callNode0 = J.call(this.rt('callable', [J.assign(J.id(name), value.node)]), jsArgs);
            return this.procCallResult(type, callNode0, statement, node);
        }
        var callNode = J.call(this.rt('callable', [target]), jsArgs);
        return this.procCallResult(type, callNode, statement, node);
    };

    Compiler.prototype.procCallResult = function (type, callNode, statement, node) {
        if (type.result === null) {
            if (!statement)
                this.error('Illegal expression', node);
            return new Value(t.void, callNode);
        }
        var value = new Value(type.result, callNode);
        value.range = types.range(type.result);
        value.wide = types.isWide(type.result);
        return value;
    };

    // @Proc or Proc in place of a procedural type: a JavaScript function.
    Compiler.prototype.procedureValue = function (source, to, node) {
        var symbol = source.routineSymbol;
        var self = this;
        var candidates = symbol.procs.filter(function (proc) {
            return types.sameSignature({ params: proc.params, result: proc.result }, to);
        });
        if (candidates.length === 0)
            this.incompatible(this.routineType(symbol.procs[0]), to, node);
        var proc = candidates[0];
        var made = new Value(to, this.routineNode(proc, source.selfNode));
        made.routineChoice = proc;
        void self;
        return made;
    };

    // The procedural type of a routine value.
    Compiler.prototype.routineType = function (proc) {
        return new Pascal.Type('proc', { name: null, params: proc.params, result: proc.result, ofObject: proc.owner !== null, size: 8 });
    };

    // A JavaScript function for a routine (the value @Proc).
    Compiler.prototype.routineNode = function (proc, selfNode) {
        if (proc.owner !== null) {
            if (proc.classMethod && proc.isStatic)
                return J.mem(this.classNode(proc.owner), proc.slot);
            return this.rt('method', [selfNode || this.selfNode(), J.str(proc.slot)]);
        }
        if (proc.native !== undefined && proc.native !== null && !proc.nested)
            return J.mem(J.id('$P'), proc.js);
        if (proc.nested)
            return this.nestedProcValue(proc);
        // A global one gets a wrapper: one that waits runs at once.
        return J.mem(J.id('$P'), proc.js);
    };

    Compiler.prototype.nestedProcValue = function (proc) {
        return J.id(proc.js);
    };

    // --- Type casts: Integer(x), TFoo(obj), Char(65), PInteger(p)

    Compiler.prototype.typeCast = function (type, args, node) {
        if (args.length !== 1)
            this.error('Wrong number of parameters specified for call to "' + types.display(type) + '"', node);
        var value = this.compileValue(args[0], type);
        var from = value.type;
        if (types.isOrdinal(type) && (types.isOrdinal(from) || from.kind === 'pointer' || from.kind === 'class' || from.kind === 'js')) {
            if (from.kind === 'js')
                return this.fromJs(value, type, node);
            return this.ordinalCast(value, type, node);
        }
        if (type.kind === 'real') {
            if (types.isNumeric(from))
                return this.convertReal(value, type);
            if (from.kind === 'js')
                return this.fromJs(value, type, node);
        }
        if (type.kind === 'string') {
            if (types.isStringLike(from))
                return this.convertValue(value, type, node);
            if (from.kind === 'js')
                return this.fromJs(value, type, node);
            if (from.kind === 'pointer' || from.kind === 'nil')
                return new Value(type, this.rt('pointerString', [value.node]));
        }
        if (type.kind === 'class' && !type.isObject) {
            if (from.kind === 'class' || from.kind === 'nil' || from.kind === 'pointer' || from.kind === 'js')
                return new Value(type, from.kind === 'js' ? this.rt('jto', [value.node, J.str('object')]) : value.node);
            if (from.kind === 'int')
                this.error('Illegal type conversion: "' + types.display(from) + '" to "' + types.display(type) + '"', node);
        }
        if (type.kind === 'pointer' || type.kind === 'classref' || type.kind === 'proc') {
            if (from.kind === 'pointer' || from.kind === 'nil' || from.kind === 'class' || from.kind === 'classref' ||
                from.kind === 'proc' || from.kind === 'dynarray' || from.kind === 'string')
                return new Value(type, value.node);
        }
        if (type.kind === 'js')
            return this.toJs(value, node);
        if (type.kind === 'dynarray' && (from.kind === 'dynarray' || from.kind === 'pointer' || from.kind === 'nil'))
            return new Value(type, value.node);
        if (types.equal(type, from) || (type.kind === from.kind && types.isAggregate(type) && types.sizeOf(type) === types.sizeOf(from)))
            return this.retype(value, type);
        this.error('Illegal type conversion: "' + types.display(from) + '" to "' + types.display(type) + '"', node);
    };

    // Integer(x), Char(65), TColor(1), Boolean(0), Byte(x).
    Compiler.prototype.ordinalCast = function (value, type, node) {
        var from = value.type;
        if (from.kind === 'pointer' || from.kind === 'class')
            this.error('Illegal type conversion: "' + types.display(from) + '" to "' + types.display(type) + '"', node);
        if (value.isConstant()) {
            var ordinal = Pascal.ordinalOf(value.constant);
            if (type.kind === 'int')
                return this.constValue(type, Pascal.wrapConstant(ordinal, type));
            if (type.kind === 'bool')
                return this.constValue(type, big.sign(ordinal) !== 0);
            return this.constValue(type, big.toFloat(ordinal) & (type.kind === 'char' ? (type.wide ? 65535 : 255) : 0xFFFFFFFF));
        }
        var number = this.ordinalNode(value);
        var asInt = new Value(from.kind === 'int' ? from : t.longint, number);
        asInt.range = value.range || types.range(from);
        asInt.wide = value.wide;
        if (type.kind === 'int')
            return this.convertInt(asInt, type);
        if (type.kind === 'bool')
            return new Value(type, J.bin('!==', this.convertInt(asInt, t.int64).node, J.num(0)));
        if (type.kind === 'char')
            return new Value(type, this.convertInt(asInt, type.wide ? t.word : t.byte).node);
        // An enum: the value as it is.
        return new Value(type, this.convertInt(asInt, t.longint).node);
    };

    // --- Members: a.b

    Compiler.prototype.compileMember = function (node, expected) {
        var object = this.compileExpr(node.object);
        if (object.kind === 'unit') {
            var symbol = object.unit.scope.here(node.name);
            if (symbol === null)
                this.notFound(node);
            return this.symbolValue(symbol, node, expected);
        }
        if (object.kind === 'type')
            return this.typeMember(object.type, node, expected);
        if (object.kind === 'routine' || object.kind === 'builtin' || object.kind === 'method')
            object = this.toValue(object, node.object);
        var type = object.type;
        switch (type.kind) {
        case 'record':
            return this.recordField(object, type, node);
        case 'class':
            return this.classMember(object, type, node, expected);
        case 'classref':
            return this.classRefMember(object, type, node, expected);
        case 'js':
            return this.refValue(new JsMemberRef(this, object.node, J.str(node.text)));
        case 'pointer':
            // p.x is p^.x (FPC allows it in objfpc for pointers to records).
            if (type.to !== null && type.to.kind === 'record')
                return this.recordField(this.derefValue(object, node), type.to, node);
            break;
        case 'enum':
            break;
        }
        this.error('Illegal qualifier', node);
    };

    function JsMemberRef(compiler, object, key) {
        Pascal.Ref.call(this, t.js);
        this.compiler = compiler;
        this.object = object;
        this.key = key;
    }
    JsMemberRef.prototype = Object.create(Pascal.Ref.prototype);
    JsMemberRef.prototype.get = function () {
        return this.compiler.rt('jg', [this.object, this.key]);
    };
    JsMemberRef.prototype.set = function (value) {
        return this.compiler.rt('jset', [this.object, this.key, value]);
    };
    JsMemberRef.prototype.stable = function (compiler) {
        if (J.isSimple(this.object))
            return { setup: [], ref: this };
        var name = compiler.temp();
        return { setup: [J.assign(J.id(name), this.object)], ref: new JsMemberRef(compiler, J.id(name), this.key) };
    };
    Pascal.JsMemberRef = JsMemberRef;

    Compiler.prototype.recordField = function (object, type, node) {
        var field = type.fieldMap[node.name];
        if (field === undefined)
            this.error('identifier idents no member "' + node.text + '"', node);
        var ref = new PropRef(field.type, object.node, J.str(field.js));
        if (object.ref !== null && object.ref !== undefined) {
            ref.readOnly = object.ref.readOnly && !object.ref.loopVariable;
            ref.root = object.ref.root || object.ref;
        } else if (!object.call) {
            ref.readOnly = false;
        }
        return this.refValue(ref);
    };

    // A member of a type: TColor.Red (scopedenums), TFoo.Create, TFoo.ClassMethod.
    Compiler.prototype.typeMember = function (type, node, expected) {
        if (type.kind === 'enum') {
            var item = types.base(type).scope[node.name];
            if (item === undefined)
                this.error('identifier idents no member "' + node.text + '"', node);
            return this.constValue(item.type, item.value, node);
        }
        if (type.kind === 'class')
            return this.classRefMember(this.classRefValue(type), this.classRefType(type), node, expected, type);
        this.error('Illegal qualifier', node);
    };

    // --- Indices: a[i], s[i], p[i], obj[i] (the default property)

    Compiler.prototype.compileIndex = function (node) {
        var object = this.compileExpr(node.object);
        if (object.kind === 'type')
            this.error('Illegal qualifier', node);
        object = this.toValue(object, node.object);
        var current = object;
        for (var index = 0; index < node.indexes.length; ++index)
            current = this.indexValue(current, node.indexes[index], node, node.indexes.slice(index));
        return current;
    };

    Compiler.prototype.indexValue = function (object, indexNode, node, rest) {
        var type = object.type;
        switch (type.kind) {
        case 'array':
            return this.arrayElement(object, type, this.compileValue(indexNode), indexNode, false);
        case 'dynarray':
        case 'openarray':
            return this.arrayElement(object, type, this.compileValue(indexNode), indexNode, true);
        case 'string':
            return this.stringElement(object, this.compileValue(indexNode), indexNode);
        case 'pointer':
            if (type.to !== null && type.to.kind === 'array')
                return this.arrayElement(this.derefValue(object, node), type.to, this.compileValue(indexNode), indexNode, false);
            break;
        case 'class':
            return this.defaultProperty(object, type, rest, node);
        case 'js':
            return this.refValue(new JsMemberRef(this, object.node, this.toJs(this.compileValue(indexNode), indexNode).node));
        }
        this.error('Illegal qualifier', node);
    };

    // An array element with an index check (always: an element outside the
    // array would be undefined in JavaScript).
    Compiler.prototype.arrayElement = function (object, type, index, indexNode, dynamic) {
        var elementType = type.of;
        if (!dynamic) {
            if (!types.isOrdinal(index.type) || !types.sameOrdinalBase(types.base(index.type), types.base(type.index)))
                this.incompatible(index.type, type.index, indexNode);
        } else if (index.type.kind !== 'int') {
            this.incompatible(index.type, t.int64, indexNode);
        }
        var lo = dynamic ? 0 : type.lo;
        var length = dynamic ? null : type.length;
        var offset;
        var range = index.range || types.range(index.type);
        if (index.isConstant()) {
            var position = big.toFloat(Pascal.ordinalOf(index.constant)) - lo;
            if (!dynamic && (position < 0 || position >= length))
                this.error('range check error while evaluating constants (' + big.str(Pascal.ordinalOf(index.constant)) +
                           ' must be between ' + lo + ' and ' + (lo + length - 1) + ')', indexNode);
            offset = J.num(position);
            if (dynamic)
                offset = this.checkedIndex(J.num(position), [position, position], object.node, null);
        } else {
            var number = this.ordinalNode(index);
            if (lo !== 0)
                number = J.bin('-', number, J.num(lo));
            var shifted = [range[0] - lo, range[1] - lo];
            offset = this.checkedIndex(number, shifted, dynamic ? object.node : null, length);
        }
        var holder = object.node;
        var ref = new PropRef(elementType, holder, offset);
        if (object.ref !== null && object.ref !== undefined) {
            ref.readOnly = object.ref.readOnly && !object.ref.loopVariable && !dynamic;
            ref.root = object.ref.root || object.ref;
        }
        return this.refValue(ref);
    };

    // An index with a check: (t = i) >>> 0 < length ? t : $R.range().
    Compiler.prototype.checkedIndex = function (number, range, arrayNode, length) {
        if (length !== null && range[0] >= 0 && range[1] < length)
            return number;
        var name = this.temp();
        var limit = length !== null ? J.num(length) : J.mem(arrayNode, 'length');
        var test;
        if (range[0] >= -2147483648 && range[1] <= 2147483647)
            test = J.bin('<', J.bin('>>>', J.assign(J.id(name), number), J.num(0)), limit);
        else
            test = J.and(J.bin('>=', J.assign(J.id(name), number), J.num(0)), J.bin('<', J.id(name), limit));
        return J.cond(test, J.id(name), this.rt('range', []));
    };

    Compiler.prototype.stringElement = function (object, index, indexNode) {
        if (index.type.kind !== 'int')
            this.incompatible(index.type, t.int64, indexNode);
        var base = object.ref;
        var indexNodeJs = this.ordinalNode(index);
        if (object.type.short !== null && object.type.short !== undefined && index.isConstant() && big.eq(index.constant, 0)) {
            if (base === null || base === undefined)
                this.error('Variable identifier expected', indexNode);
            return this.refValue(new ShortLengthRefWrap(this, base));
        }
        if (base === null || base === undefined) {
            // A character of a string value: read only.
            var value = new Value(t.char, this.rt('sc', [object.node, indexNodeJs]));
            value.range = [0, 255];
            return value;
        }
        var ref = new CharRefWrap(this, base, indexNodeJs);
        ref.readOnly = base.readOnly;
        return this.refValue(ref);
    };

    function CharRefWrap(compiler, base, index) {
        Pascal.Ref.call(this, t.char);
        this.compiler = compiler;
        this.base = base;
        this.index = index;
    }
    CharRefWrap.prototype = Object.create(Pascal.Ref.prototype);
    CharRefWrap.prototype.get = function () {
        return this.compiler.rt('sc', [this.base.get(), this.index]);
    };
    CharRefWrap.prototype.set = function (value) {
        return this.base.set(this.compiler.rt('ssc', [this.base.get(), this.index, value]));
    };
    CharRefWrap.prototype.stable = function (compiler) {
        var base = this.base.stable(compiler);
        var setup = base.setup.slice();
        var index = this.index;
        if (!J.isSimple(index)) {
            var name = compiler.temp();
            setup.push(J.assign(J.id(name), index));
            index = J.id(name);
        }
        return { setup: setup, ref: new CharRefWrap(compiler, base.ref, index) };
    };
    CharRefWrap.prototype.address = function () {
        this.compiler.error("Can't take the address of a string element", null);
    };

    function ShortLengthRefWrap(compiler, base) {
        Pascal.Ref.call(this, t.char);
        this.compiler = compiler;
        this.base = base;
    }
    ShortLengthRefWrap.prototype = Object.create(Pascal.Ref.prototype);
    ShortLengthRefWrap.prototype.get = function () {
        return J.mem(this.base.get(), 'length');
    };
    ShortLengthRefWrap.prototype.set = function (value) {
        return this.base.set(this.compiler.rt('shortLength', [this.base.get(), value]));
    };

    // --- Pointers

    Compiler.prototype.compileDeref = function (node) {
        var pointer = this.compileValue(node.object);
        if (pointer.type.kind !== 'pointer')
            this.error('Illegal qualifier', node);
        if (pointer.type.to === null)
            this.error('Illegal qualifier', node);
        return this.derefValue(pointer, node);
    };

    // p^: an aggregate is the object itself, anything else the box p.v.
    Compiler.prototype.derefValue = function (pointer, node) {
        var target = pointer.type.to;
        if (types.isAggregate(target)) {
            var objectRef = new AggregateRef(target, this.rt('deref', [pointer.node]));
            return this.refValue(objectRef);
        }
        var ref = new PropRef(target, pointer.node, J.str('v'));
        void node;
        return this.refValue(ref);
    };

    // An aggregate by an expression: reading gives the object, writing copies into it.
    function AggregateRef(type, node) {
        Pascal.Ref.call(this, type);
        this.node = node;
    }
    AggregateRef.prototype = Object.create(Pascal.Ref.prototype);
    AggregateRef.prototype.get = function () {
        return this.node;
    };
    AggregateRef.prototype.set = function () {
        throw new Error('aggregate set');
    };
    AggregateRef.prototype.address = function () {
        return this.node;
    };
    AggregateRef.prototype.stable = function (compiler) {
        if (J.isSimple(this.node))
            return { setup: [], ref: this };
        var name = compiler.temp();
        return { setup: [J.assign(J.id(name), this.node)], ref: new AggregateRef(this.type, J.id(name)) };
    };
    Pascal.AggregateRef = AggregateRef;

    // @x, @Proc, @obj.Method.
    Compiler.prototype.compileAddress = function (node, expected) {
        var target = this.compileExpr(node.arg, expected && expected.kind === 'proc' ? expected : undefined);
        if (target.kind === 'routine') {
            var symbol = target.symbol;
            if (expected !== undefined && expected !== null && expected.kind === 'proc')
                return this.procedureValue({ routineSymbol: symbol }, expected, node);
            if (symbol.procs.length > 1)
                this.error('Can\'t determine which overloaded function to call', node);
            var proc = symbol.procs[0];
            var made = new Value(this.routineType(proc), this.routineNode(proc, null));
            made.routineSymbol = symbol;
            made.routineChoice = proc;
            return made;
        }
        if (target.kind === 'method') {
            var methodProc = target.procs[0];
            if (expected !== undefined && expected !== null && expected.kind === 'proc') {
                var matching = target.procs.filter(function (proc) {
                    return types.sameSignature({ params: proc.params, result: proc.result }, expected);
                });
                if (matching.length > 0)
                    methodProc = matching[0];
            }
            var methodValue = new Value(this.routineType(methodProc), this.routineNode(methodProc, target.selfNode));
            methodValue.routineChoice = methodProc;
            return methodValue;
        }
        if (target.kind === 'type' || target.kind === 'unit' || target.kind === 'builtin')
            this.error('Variable identifier expected', node);
        if (target.ref === null || target.ref === undefined) {
            if (target.type.kind === 'proc' && node.raw)
                return target;
            this.error('Variable identifier expected', node);
        }
        if (target.ref instanceof Pascal.PropertyRef)
            this.error('Variable identifier expected', node);
        this.noteModified(target.ref);
        var address = target.ref.address(this);
        var pointerType = new Pascal.Type('pointer', { name: null, to: target.type, size: 8, untypedAddress: true });
        return new Value(pointerType, address);
    };

    // --- JavaScript values

    Compiler.prototype.callJs = function (value, args, node) {
        var self = this;
        var values = this.compileArgs(args);
        var jsArgs = values.map(function (arg, index) { return self.toJs(arg, args[index]).node; });
        // obj.method(...) - a method call with this.
        if (value.ref instanceof JsMemberRef)
            return new Value(t.js, this.rt('jc', [value.ref.object, value.ref.key, J.arr(jsArgs)]));
        return new Value(t.js, this.rt('ja', [value.node, J.arr(jsArgs)]));
    };

    // --- Open arrays and array of const

    // [a, b, c] in place of an open or dynamic array.
    Compiler.prototype.arrayLiteral = function (node, expected) {
        var self = this;
        var elementType = expected.kind === 'arrayofconst' ? null : expected.of;
        var values = node.items.map(function (item) {
            if (item.hi !== null)
                self.error('Illegal expression', item.hi);
            return self.compileValue(item.lo, elementType || undefined);
        });
        var value = new Value(new Pascal.Type('arrayliteral', { name: 'array constructor', of: elementType }), null);
        value.items = values;
        value.itemNodes = node.items.map(function (item) { return item.lo; });
        value.setLiteral = false;
        if (expected.kind === 'arrayofconst') {
            value.node = this.arrayOfConstNode(values, value.itemNodes);
            value.type = expected;
            value.arrayOfConst = true;
            return value;
        }
        return this.arrayLiteralValue(value, expected.kind === 'openarray' ? new Pascal.Type('dynarray', { name: null, of: expected.of }) : expected, node);
    };

    Compiler.prototype.arrayLiteralValue = function (value, type, node) {
        var self = this;
        var items = value.items;
        if (items === undefined) {
            // A constant set in place of an array: [1, 2, 3].
            if (value.isConstant())
                items = value.constant.map(function (value) {
                    return self.constValue(Pascal.constIntType(value), value);
                });
            else
                this.incompatible(value.type, type, node);
        }
        var nodes = items.map(function (item, index) {
            return self.convertValue(item, type.of, value.itemNodes ? value.itemNodes[index] : node).node;
        });
        if (types.typedArray(type.of) !== null || types.isAggregate(type.of))
            return new Value(type, this.rt('arrayOf', [this.typeRef(type), J.arr(nodes)]));
        return new Value(type, J.arr(nodes));
    };

    // array of const: [{ t: kind, v: value }] (as TVarRec).
    Compiler.prototype.arrayOfConst = function (value, node) {
        if (value.arrayOfConst || value.type.kind === 'arrayofconst')
            return value.node;
        if (value.items !== undefined)
            return this.arrayOfConstNode(value.items, value.itemNodes);
        if (value.setLiteral && value.isConstant()) {
            var self = this;
            return this.arrayOfConstNode(value.constant.map(function (value) {
                return self.constValue(Pascal.constIntType(value), value);
            }), []);
        }
        this.error('Incompatible type: got "' + types.display(value.type) + '" expected "Array Of Const"', node);
    };

    Compiler.prototype.arrayOfConstNode = function (values, nodes) {
        var self = this;
        return J.arr(values.map(function (value, index) {
            return self.varRec(value, nodes[index]);
        }));
    };

    // An element of array of const: vtInteger, vtExtended, vtAnsiString...
    Compiler.prototype.varRec = function (value, node) {
        value = this.toValue(value, node);
        var type = value.type;
        var vt;
        var valueNode = value.node;
        switch (type.kind) {
        case 'int':
            // Cardinal goes as an Integer with the same bits, as in FPC.
            if (type.ik === 'u32') {
                vt = 0;
                valueNode = J.bin('|', valueNode, J.num(0));
            } else if (type.ik === 'i64' || type.ik === 'u64' ||
                       (value.range && !(value.range[0] >= -2147483648 && value.range[1] <= 2147483647))) {
                vt = type.ik === 'u64' ? 17 : 16;
            } else {
                vt = 0;
            }
            break;
        case 'bool': vt = 1; break;
        case 'char': vt = type.wide ? 9 : 2; break;
        case 'real': vt = 3; break;
        case 'string': vt = 11; break;
        case 'pointer':
        case 'nil': vt = 5; break;
        case 'class': vt = 7; break;
        case 'classref': vt = 8; break;
        case 'enum': vt = 0; break;
        case 'js': vt = 13; break;
        default:
            this.error('Illegal type in array of const: "' + types.display(type) + '"', node);
        }
        return J.obj([['vtype', J.num(vt)], ['v', valueNode]]);
    };
})(globalThis);
