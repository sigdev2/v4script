// Pascal: built-in routines of System - what the FPC compiler does
// itself (Write, Inc, Length, High, New...): parsing the arguments by
// their types and translation in place.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Pascal = T.pascal;
    var Compiler = Pascal.Compiler;
    if (Pascal.builtins)
        return;

    var J = T.J;
    var t = Pascal.t;
    var types = Pascal.types;
    var big = T.big;
    var Value = Pascal.Value;

    var builtins = Object.create(null);
    Pascal.builtins = builtins;

    function def(name, handler) {
        builtins[name] = handler;
    }

    Compiler.prototype.callBuiltin = function (symbol, args, node, expected, statement) {
        var result = symbol.handler.call(this, args, node, expected, statement, symbol);
        if (result === undefined || result === null)
            result = new Value(t.void, J.num(0));
        if (result.type === t.void && !statement)
            this.error('Illegal expression', node);
        return result;
    };

    function argCount(compiler, args, node, min, max, name) {
        if (args.length < min || args.length > max)
            compiler.error('Wrong number of parameters specified for call to "' + name + '"', node);
    }

    function voidValue(nodeJs) {
        return new Value(t.void, nodeJs);
    }

    // A place for a var argument of a built-in routine.
    Compiler.prototype.lvalue = function (argNode) {
        var value = this.compileExpr(argNode);
        if (value.ref === null || value.ref === undefined)
            this.error('Variable identifier expected', argNode);
        if (value.ref.readOnly)
            this.error(value.ref.loopVariable ? 'Illegal assignment to for-loop variable' : "Can't assign values to const variable", argNode);
        this.noteModified(value.ref);
        return value;
    };

    // Changes a place: setup and the assignment in one expression.
    Compiler.prototype.update = function (ref, compute) {
        var stable = ref.stable(this);
        var current = this.refValue(stable.ref);
        var assignment = compute(current, stable.ref);
        return J.seq(stable.setup.concat([assignment]));
    };

    // --- Output

    // The text of a value for Write: a byte string in the code.
    // forStr - for Str, which takes widths differently (Pascal.strWidth).
    Compiler.prototype.writeText = function (arg, forStr) {
        var format = arg.k === 'format' ? arg : null;
        var expr = format !== null ? arg.expr : arg;
        var value = this.compileValue(expr);
        var width = null, digits = null;
        var type = value.type;
        if (format !== null) {
            width = this.convertValue(this.compileValue(format.width), t.longint, format.width);
            if (format.digits !== null)
                digits = this.convertValue(this.compileValue(format.digits), t.longint, format.digits);
            if (forStr) {
                var real = type.kind === 'real';
                width = width.isConstant() ? this.constValue(t.longint, Pascal.strWidth(big.toFloat(width.constant), real))
                                           : new Value(t.longint, this.rt('strWidth', [width.node, J.bool(real)]));
            }
        }
        var self = this;
        var constantWidth = width === null || width.isConstant();
        var widthNumber = width !== null && width.isConstant() ? big.toFloat(width.constant) : undefined;
        function padded(textNode, constantText) {
            if (constantText !== undefined && constantWidth)
                return self.constValue(t.ansistring, Pascal.pad(constantText, widthNumber));
            if (width === null)
                return new Value(t.ansistring, textNode);
            return new Value(t.ansistring, self.rt('pad', [textNode, width.node]));
        }
        if (digits !== null && type.kind !== 'real')
            this.error('Illegal parameter', format.digits);
        switch (type.kind) {
        case 'int':
            if (value.isConstant())
                return padded(null, big.str(value.constant));
            return padded(this.intText(value));
        case 'real': {
            var rk = type.print || type.rk;
            if (value.isConstant() && constantWidth && (digits === null || digits.isConstant()))
                return this.constValue(t.ansistring, Pascal.strReal(width === null ? Pascal.NO_WIDTH : widthNumber,
                                                                     digits === null ? -1 : big.toFloat(digits.constant), value.constant, rk));
            var real = value.mayOverflow ? this.checkedReal(value.node) : value.node;
            return new Value(t.ansistring, this.rt('real', [real, J.str(rk), width === null ? J.num(Pascal.NO_WIDTH) : width.node,
                                                             digits === null ? J.num(-1) : digits.node]));
        }
        case 'bool':
            if (value.isConstant())
                return padded(null, value.constant ? 'TRUE' : 'FALSE');
            return padded(J.cond(value.node, J.str('TRUE'), J.str('FALSE')));
        case 'char':
            if (value.isConstant())
                return padded(null, type.wide ? T.utf8.encodeRune(value.constant) : String.fromCharCode(value.constant));
            return padded(this.charToString(value));
        case 'string':
            if (value.isConstant())
                return padded(null, value.constant);
            return padded(value.node);
        case 'enum': {
            var names = this.enumNames(type);
            if (value.isConstant())
                return padded(null, Pascal.enumName(type, value.constant));
            return padded(J.idx(names, value.node));
        }
        case 'js':
            return padded(this.rt('jstr', [value.node]));
        }
        this.error("Can't read or write variables of this type", expr);
    };

    // An integer as a string (a hybrid goes through T.i64).
    Compiler.prototype.intText = function (value) {
        if (value.wide || !types.isSafeRange(value.range || types.range(value.type)))
            return J.call(J.mem(this.helper(value.type.ik === 'u64' ? 'u64' : 'i64'), 'str'), [value.node]);
        return J.call(J.id('String'), [value.node]);
    };

    // The names of an enum: an array (or an object when values are skipped).
    Compiler.prototype.enumNames = function (type) {
        var base = types.base(type);
        if (base.namesTable === undefined) {
            var table = {};
            base.items.forEach(function (item) { table[item.value] = item.text; });
            base.namesTable = table;
        }
        return this.constant(base.namesTable);
    };

    // Joins the parts of Write into one string.
    Compiler.prototype.joinTexts = function (parts) {
        var constantText = '';
        var nodes = [];
        parts.forEach(function (part) {
            if (part.isConstant()) {
                constantText += part.constant;
                return;
            }
            if (constantText.length > 0) {
                nodes.push(J.str(constantText));
                constantText = '';
            }
            nodes.push(part.node);
        });
        if (constantText.length > 0 || nodes.length === 0)
            nodes.push(J.str(constantText));
        var result = nodes[0];
        for (var index = 1; index < nodes.length; ++index)
            result = J.bin('+', result, nodes[index]);
        if (nodes.length === 1 && nodes[0].k === 'str') {
            var constant = this.constValue(t.ansistring, nodes[0].value);
            return constant;
        }
        return new Value(t.ansistring, result);
    };

    // Is the first argument a file?
    Compiler.prototype.fileArgument = function (args) {
        if (args.length === 0 || args[0].k === 'format')
            return null;
        var first = this.compileExpr(args[0]);
        if (first.kind === undefined && first.type !== undefined && first.type.kind === 'file')
            return first;
        return null;
    };

    function writeBuiltin(newline) {
        return function (args, node) {
            var self = this;
            var file = this.fileArgument(args);
            var rest = file !== null ? args.slice(1) : args;
            if (file !== null && !file.type.text) {
                if (newline)
                    this.error('Wrong number of parameters specified for call to "WriteLn"', node);
                return voidValue(this.rt('fwriteTyped', [file.node, J.arr(rest.map(function (arg) {
                    return self.convertValue(self.compileValue(arg), file.type.of, arg).node;
                }))]));
            }
            var parts = rest.map(function (arg) { return self.writeText(arg); });
            if (newline)
                parts.push(this.constValue(t.ansistring, '\n'));
            if (parts.length === 0)
                return voidValue(J.num(0));
            // The text of every computed argument is kept before the next
            // one is computed, as in FPC: an error in an argument leaves the
            // text before it in the buffer (Runtime.prototype.wpart).
            var chunks = [];
            parts.forEach(function (part) {
                if (chunks.length === 0 || !part.isConstant())
                    chunks.push([]);
                chunks[chunks.length - 1].push(part);
            });
            var writes = chunks.map(function (chunk, index) {
                var text = self.joinTexts(chunk);
                if (file !== null)
                    return self.rt('fwrite', [file.node, text.node]);
                return self.rt(index < chunks.length - 1 ? 'wpart' : 'w', [text.node]);
            });
            return voidValue(writes.length === 1 ? writes[0] : J.seq(writes));
        };
    }
    def('write', writeBuiltin(false));
    def('writeln', writeBuiltin(true));

    // WriteStr(s, args...) - as Write into a string.
    def('writestr', function (args, node) {
        var self = this;
        argCount(this, args, node, 1, 1000, 'WriteStr');
        var target = this.lvalue(args[0]);
        var parts = args.slice(1).map(function (arg) { return self.writeText(arg); });
        var text = this.joinTexts(parts);
        return voidValue(this.assignTo(target.ref, text, node));
    });

    // Str(x:w:d, s).
    def('str', function (args, node) {
        argCount(this, args, node, 2, 2, 'Str');
        var target = this.lvalue(args[1]);
        if (target.type.kind !== 'string')
            this.error('Incompatible type for arg no. 2: Got "' + types.display(target.type) + '", expected "ShortString"', args[1]);
        var text = this.writeText(args[0], true);
        return voidValue(this.assignTo(target.ref, text, node));
    });

    // --- Input: the host input for the console; files are read.

    function readBuiltin(line) {
        return function (args, node) {
            var self = this;
            var file = this.fileArgument(args);
            var rest = file !== null ? args.slice(1) : args;
            var fileNode = file !== null ? file.node : this.rt('input', []);
            var statements = [];
            rest.forEach(function (arg) {
                var target = self.lvalue(arg);
                var type = target.type;
                var kind;
                switch (type.kind) {
                case 'int': kind = 'int'; break;
                case 'real': kind = 'real'; break;
                case 'string': kind = 'string'; break;
                case 'char': kind = 'char'; break;
                default:
                    if (file !== null && !file.type.text) {
                        statements.push(self.rt('freadTyped', [fileNode, target.ref.get()]));
                        return;
                    }
                    self.error("Can't read or write variables of this type", arg);
                }
                if (file !== null && !file.type.text) {
                    var typed = new Value(type, self.rt('freadValue', [fileNode]));
                    statements.push(self.assignTo(target.ref, typed, arg));
                    return;
                }
                var read = self.rt('fread', [fileNode, J.str(kind)]);
                var value;
                if (kind === 'int')
                    value = self.convertInt(new Value(t.int64, read, { range: types.range(t.int64), wide: true }), type);
                else
                    value = new Value(kind === 'real' ? t.double : (kind === 'char' ? t.char : t.ansistring), read);
                statements.push(self.assignTo(target.ref, kind === 'real' ? self.convertReal(value, type) : value, arg));
            });
            if (line)
                statements.push(this.rt('freadln', [fileNode]));
            if (statements.length === 0)
                return voidValue(J.num(0));
            return voidValue(J.seq(statements));
        };
    }
    def('read', readBuiltin(false));
    def('readln', readBuiltin(true));

    // --- Ordinals

    def('ord', function (args, node) {
        argCount(this, args, node, 1, 1, 'Ord');
        var value = this.compileValue(args[0]);
        if (value.type.kind === 'string' && value.isConstant() && value.constant.length === 1)
            value = this.charConstant(value.constant.charCodeAt(0), true);
        if (!types.isOrdinal(value.type))
            this.error('Ordinal expression expected', args[0]);
        if (value.isConstant()) {
            var ordinal = Pascal.ordinalOf(value.constant);
            return this.constValue(value.type.kind === 'int' ? value.type : Pascal.constIntType(ordinal), ordinal);
        }
        if (value.type.kind === 'int')
            return value;
        var result = new Value(value.type.kind === 'char' ? (value.type.wide ? t.word : t.byte) : (value.type.kind === 'bool' ? t.byte : t.longint),
                               this.ordinalNode(value));
        result.range = types.range(value.type);
        return result;
    });

    def('chr', function (args, node) {
        argCount(this, args, node, 1, 1, 'Chr');
        var value = this.convertValue(this.compileValue(args[0], t.byte), t.byte, args[0]);
        if (value.isConstant())
            return this.charConstant(big.toFloat(value.constant), false);
        return new Value(t.char, value.node, { range: [0, 255] });
    });

    function succPred(delta, name) {
        return function (args, node) {
            argCount(this, args, node, 1, 1, name);
            var value = this.compileValue(args[0]);
            if (!types.isOrdinal(value.type))
                this.error('Ordinal expression expected', args[0]);
            var type = value.type;
            if (value.isConstant()) {
                var next = big.add(Pascal.ordinalOf(value.constant), delta);
                if (type.kind === 'bool')
                    return this.constValue(type, big.sign(next) !== 0);
                if (type.kind === 'int')
                    return this.constValue(type, next);
                return this.constValue(type, big.toFloat(next));
            }
            if (type.kind === 'bool')
                return new Value(type, J.bin('!==', J.bin('+', J.un('+', value.node), J.num(delta)), J.num(0)));
            if (type.kind === 'int')
                return this.convertInt(this.intArith('+', value, this.constValue(t.shortint, delta), node), type);
            return new Value(type, J.bin('+', value.node, J.num(delta)));
        };
    }
    def('succ', succPred(1, 'Succ'));
    def('pred', succPred(-1, 'Pred'));

    function incDec(sign, name) {
        return function (args, node) {
            argCount(this, args, node, 1, 2, name);
            var target = this.lvalue(args[0]);
            var type = target.type;
            if (type.kind === 'pointer')
                this.error('pointer arithmetic is not supported', args[0]);
            if (!types.isOrdinal(type))
                this.error('Ordinal expression expected', args[0]);
            var amount = args.length > 1 ? this.compileValue(args[1], type.kind === 'int' ? type : t.longint) : this.constValue(t.shortint, 1);
            if (amount.type.kind !== 'int')
                this.incompatible(amount.type, t.longint, args[1]);
            var self = this;
            return voidValue(this.update(target.ref, function (current, ref) {
                if (type.kind === 'int') {
                    self.demand32 = false;
                    var sum = self.intArith(sign > 0 ? '+' : '-', current, amount, node);
                    return ref.set(self.convertInt(sum, type).node);
                }
                if (type.kind === 'bool')
                    return ref.set(J.bin('!==', J.bin('&', J.bin(sign > 0 ? '+' : '-', J.un('+', current.node), amount.node), J.num(1)), J.num(0)));
                var base = types.base(type);
                var mask = type.kind === 'char' ? (type.wide ? 65535 : 255) : null;
                var next = J.bin(sign > 0 ? '+' : '-', current.node, self.convertInt(amount, t.longint).node);
                void base;
                return ref.set(mask !== null ? J.bin('&', next, J.num(mask)) : next);
            }));
        };
    }
    def('inc', incDec(1, 'Inc'));
    def('dec', incDec(-1, 'Dec'));

    def('odd', function (args, node) {
        argCount(this, args, node, 1, 1, 'Odd');
        var value = this.compileValue(args[0]);
        if (value.type.kind !== 'int')
            this.error('Ordinal expression expected', args[0]);
        if (value.isConstant())
            return this.constValue(t.boolean, big.toFloat(big.and(value.constant, 1)) === 1);
        if (value.wide || !types.isSafeRange(value.range || types.range(value.type)))
            return new Value(t.boolean, J.bin('!==', J.bin('&', J.call(J.mem(this.helper('i64'), 'low32'), [value.node]), J.num(1)), J.num(0)));
        return new Value(t.boolean, J.bin('!==', J.bin('%', value.node, J.num(2)), J.num(0)));
    });

    // The type or the value of the argument of High/Low/SizeOf.
    Compiler.prototype.typeOrValue = function (arg) {
        var value = this.compileExpr(arg);
        if (value.kind === 'type')
            return { type: value.type, value: null };
        value = this.toValue(value, arg);
        return { type: value.type, value: value };
    };

    function highLow(high, name) {
        return function (args, node) {
            argCount(this, args, node, 1, 1, name);
            var subject = this.typeOrValue(args[0]);
            var type = subject.type;
            if (types.isOrdinal(type)) {
                var bound = high ? types.hi(type) : types.lo(type);
                if (type.kind === 'bool')
                    return this.constValue(type, big.toFloat(bound) !== 0);
                if (type.kind === 'int')
                    return this.constValue(types.base(type).subrangeOf ? types.base(type) : type, bound);
                return this.constValue(type, big.toFloat(bound));
            }
            if (type.kind === 'array') {
                var index = type.index;
                var value = high ? types.hi(index) : types.lo(index);
                if (index.kind === 'int')
                    return this.constValue(Pascal.constIntType(value), value);
                if (index.kind === 'bool')
                    return this.constValue(index, big.toFloat(value) !== 0);
                return this.constValue(index, big.toFloat(value));
            }
            if (type.kind === 'dynarray' || type.kind === 'openarray') {
                if (!high)
                    return this.constValue(t.shortint, 0);
                if (subject.value === null)
                    this.error('Illegal expression', args[0]);
                var made = new Value(t.int64, J.bin('-', J.mem(subject.value.node, 'length'), J.num(1)));
                made.range = [-1, 2147483647];
                return made;
            }
            if (type.kind === 'string') {
                if (type.short !== null && type.short !== undefined)
                    return this.constValue(t.byte, high ? type.short : 0);
                if (!high)
                    return this.constValue(t.shortint, 1);
                this.error('Illegal expression', args[0]);
            }
            this.error('Type identifier expected', args[0]);
        };
    }
    def('high', highLow(true, 'High'));
    def('low', highLow(false, 'Low'));

    def('sizeof', function (args, node) {
        argCount(this, args, node, 1, 1, 'SizeOf');
        var subject = this.typeOrValue(args[0]);
        return this.constValue(Pascal.constIntType(types.sizeOf(subject.type)), types.sizeOf(subject.type));
    });
    def('bitsizeof', function (args, node) {
        argCount(this, args, node, 1, 1, 'BitSizeOf');
        var subject = this.typeOrValue(args[0]);
        return this.constValue(t.longint, types.sizeOf(subject.type) * 8);
    });

    def('length', function (args, node) {
        argCount(this, args, node, 1, 1, 'Length');
        var value = this.compileValue(args[0]);
        var type = value.type;
        switch (type.kind) {
        case 'string':
            if (value.isConstant())
                return this.constValue(Pascal.constIntType(value.constant.length), value.constant.length);
            return new Value(t.int64, J.mem(value.node, 'length'), { range: [0, 2147483647] });
        case 'char':
            return this.constValue(t.shortint, 1);
        case 'array':
            return this.constValue(Pascal.constIntType(type.length), type.length);
        case 'dynarray':
        case 'openarray':
            return new Value(t.int64, J.mem(value.node, 'length'), { range: [0, 2147483647] });
        }
        this.error('Type mismatch', args[0]);
    });

    def('setlength', function (args, node) {
        argCount(this, args, node, 2, 10, 'SetLength');
        var self = this;
        var target = this.lvalue(args[0]);
        var type = target.type;
        var sizes = args.slice(1).map(function (arg) {
            return self.convertValue(self.compileValue(arg, t.int64), t.int64, arg).node;
        });
        if (type.kind === 'string') {
            if (sizes.length !== 1)
                this.error('Wrong number of parameters specified for call to "SetLength"', node);
            return voidValue(this.update(target.ref, function (current, ref) {
                var made = self.rt('setLength', [current.node, sizes[0]]);
                if (type.short !== null && type.short !== undefined)
                    made = self.rt('copy', [made, J.num(1), J.num(type.short)]);
                return ref.set(made);
            }));
        }
        if (type.kind !== 'dynarray')
            this.error('Type mismatch', args[0]);
        return voidValue(this.update(target.ref, function (current, ref) {
            if (sizes.length === 1)
                return ref.set(self.rt('resize', [self.typeRef(type), current.node, sizes[0]]));
            return ref.set(self.rt('resizeDeep', [self.typeRef(type), current.node, J.arr(sizes)]));
        }));
    });

    // --- Strings

    def('copy', function (args, node) {
        argCount(this, args, node, 1, 3, 'Copy');
        var value = this.compileValue(args[0]);
        var self = this;
        var rest = args.slice(1).map(function (arg) { return self.convertValue(self.compileValue(arg, t.int64), t.int64, arg); });
        if (value.type.kind === 'dynarray' || value.type.kind === 'openarray') {
            var arrayType = value.type.kind === 'openarray' ? new Pascal.Type('dynarray', { name: null, of: value.type.of }) : value.type;
            var bounds = rest.map(function (item) { return item.node; });
            return new Value(arrayType, this.rt('copyArray', [this.typeRef(arrayType), value.node].concat(bounds)));
        }
        var text = this.stringValue(value, args[0]);
        if (rest.length === 0)
            return text;
        if (text.isConstant() && rest.every(function (item) { return item.isConstant(); })) {
            var start = big.toFloat(rest[0].constant);
            var count = rest.length > 1 ? big.toFloat(rest[1].constant) : 2147483647;
            var source = text.constant;
            if (start < 1)
                start = 1;
            return this.constValue(t.ansistring,
                                   count <= 0 || start > source.length ? '' : source.substr(start - 1, count));
        }
        return new Value(t.ansistring, this.rt('copy', [text.node, rest[0].node, rest.length > 1 ? rest[1].node : J.num(2147483647)]));
    });

    def('pos', function (args, node) {
        argCount(this, args, node, 2, 3, 'Pos');
        var sub = this.stringValue(this.compileValue(args[0]), args[0]);
        var text = this.stringValue(this.compileValue(args[1]), args[1]);
        var callArgs = [sub.node, text.node];
        if (args.length > 2)
            callArgs.push(this.convertValue(this.compileValue(args[2]), t.int64, args[2]).node);
        return new Value(t.int64, this.rt('pos', callArgs), { range: [0, 2147483647] });
    });

    def('delete', function (args, node) {
        argCount(this, args, node, 3, 3, 'Delete');
        var self = this;
        var target = this.lvalue(args[0]);
        var index = this.convertValue(this.compileValue(args[1]), t.int64, args[1]);
        var count = this.convertValue(this.compileValue(args[2]), t.int64, args[2]);
        if (target.type.kind === 'dynarray')
            return voidValue(this.update(target.ref, function (current, ref) {
                return ref.set(self.rt('deleteArray', [self.typeRef(target.type), current.node, index.node, count.node]));
            }));
        if (target.type.kind !== 'string')
            this.error('Type mismatch', args[0]);
        return voidValue(this.update(target.ref, function (current, ref) {
            return ref.set(self.rt('del', [current.node, index.node, count.node]));
        }));
    });

    def('insert', function (args, node) {
        argCount(this, args, node, 3, 3, 'Insert');
        var self = this;
        var target = this.lvalue(args[1]);
        var index = this.convertValue(this.compileValue(args[2]), t.int64, args[2]);
        if (target.type.kind === 'dynarray') {
            var inserted = this.compileValue(args[0], target.type);
            var list = inserted.type.kind === 'dynarray' ? inserted.node : J.arr([this.convertValue(inserted, target.type.of, args[0]).node]);
            return voidValue(this.update(target.ref, function (current, ref) {
                return ref.set(self.rt('insertArray', [self.typeRef(target.type), list, current.node, index.node]));
            }));
        }
        var sub = this.stringValue(this.compileValue(args[0]), args[0]);
        if (target.type.kind !== 'string')
            this.error('Type mismatch', args[1]);
        return voidValue(this.update(target.ref, function (current, ref) {
            var made = self.rt('ins', [sub.node, current.node, index.node]);
            if (target.type.short !== null && target.type.short !== undefined)
                made = self.rt('copy', [made, J.num(1), J.num(target.type.short)]);
            return ref.set(made);
        }));
    });

    def('concat', function (args, node) {
        if (args.length === 0)
            this.error('Wrong number of parameters specified for call to "Concat"', node);
        var self = this;
        var first = this.compileValue(args[0]);
        if (first.type.kind === 'dynarray') {
            // The others are of the same type: [1, 2] is an array literal here.
            var arrays = args.slice(1).map(function (arg) {
                return self.convertValue(self.compileValue(arg, first.type), first.type, arg).node;
            });
            return new Value(first.type, this.rt('concatArrays', [this.typeRef(first.type), J.arr([first.node].concat(arrays))]));
        }
        var values = [first].concat(args.slice(1).map(function (arg) { return self.compileValue(arg); }));
        var result = this.stringValue(values[0], args[0]);
        for (var index = 1; index < values.length; ++index)
            result = this.concat(result, values[index], args[index]);
        return result;
    });

    def('upcase', function (args, node) {
        argCount(this, args, node, 1, 1, 'UpCase');
        var value = this.compileValue(args[0]);
        if (value.type.kind === 'char') {
            if (value.isConstant())
                return this.charConstant(value.constant >= 97 && value.constant <= 122 ? value.constant - 32 : value.constant, false);
            return new Value(t.char, this.rt('upcase', [value.node]));
        }
        var text = this.stringValue(value, args[0]);
        return new Value(t.ansistring, this.rt('upper', [text.node]));
    });

    def('lowercase', function (args, node) {
        argCount(this, args, node, 1, 1, 'LowerCase');
        var value = this.compileValue(args[0]);
        if (value.type.kind === 'char')
            return new Value(t.char, this.rt('lowcase', [value.node]));
        var text = this.stringValue(value, args[0]);
        return new Value(t.ansistring, this.rt('lower', [text.node]));
    });

    def('stringofchar', function (args, node) {
        argCount(this, args, node, 2, 2, 'StringOfChar');
        var character = this.convertValue(this.compileValue(args[0], t.char), t.char, args[0]);
        var count = this.convertValue(this.compileValue(args[1]), t.int64, args[1]);
        return new Value(t.ansistring, this.rt('stringOfChar', [character.node, count.node]));
    });

    // Val(s, x, code).
    def('val', function (args, node) {
        argCount(this, args, node, 3, 3, 'Val');
        var text = this.stringValue(this.compileValue(args[0]), args[0]);
        var target = this.lvalue(args[1]);
        var code = this.lvalue(args[2]);
        if (code.type.kind !== 'int')
            this.error('Incompatible type for arg no. 3', args[2]);
        var temp = this.temp();
        var parsed;
        var type = target.type;
        if (type.kind === 'int')
            parsed = this.rt('valInt', [text.node, J.str(type.ik)]);
        else if (type.kind === 'real')
            parsed = this.rt('valReal', [text.node]);
        else if (type.kind === 'enum')
            parsed = this.rt('valEnum', [text.node, this.enumNames(type)]);
        else
            this.error('Incompatible type for arg no. 2', args[1]);
        var value = type.kind === 'int' ? new Value(type, J.mem(J.id(temp), 'value'), { range: types.range(type), wide: types.isWide(type) })
                                        : new Value(type.kind === 'real' ? t.double : type, J.mem(J.id(temp), 'value'));
        if (type.kind === 'real' && type.rk === 'f32')
            value = this.convertReal(value, type);
        var codeValue = new Value(t.longint, J.mem(J.id(temp), 'code'), { range: [0, 2147483647] });
        return voidValue(J.seq([J.assign(J.id(temp), parsed), this.assignTo(target.ref, value, args[1]),
                                this.assignTo(code.ref, codeValue, args[2])]));
    });

    // --- Numbers

    def('abs', function (args, node) {
        argCount(this, args, node, 1, 1, 'Abs');
        var value = this.compileValue(args[0]);
        var type = value.type;
        if (value.isConstant()) {
            if (type.kind === 'int')
                return this.constValue(type, big.sign(value.constant) < 0 ? big.neg(value.constant) : value.constant);
            if (type.kind === 'real')
                return this.constValue(type, Math.abs(value.constant));
        }
        if (type.kind === 'int') {
            if (value.wide || !types.isSafeRange(value.range || types.range(type)))
                return new Value(type, this.rt('abs64', [value.node]), { wide: true, range: types.range(type) });
            var made = new Value(type, J.call(J.path('Math.abs'), [value.node]));
            if (type.ik === 'i32')
                made.node = J.bin('|', made.node, J.num(0));
            var range = value.range || types.range(type);
            made.range = [0, Math.max(Math.abs(range[0]), Math.abs(range[1]))];
            return made;
        }
        if (type.kind === 'real')
            return new Value(type, J.call(J.path('Math.abs'), [value.node]));
        if (type.kind === 'js')
            return new Value(t.double, J.call(J.path('Math.abs'), [this.fromJs(value, t.double, args[0]).node]));
        this.error('Incompatible type for arg no. 1', args[0]);
    });

    def('sqr', function (args, node) {
        argCount(this, args, node, 1, 1, 'Sqr');
        var value = this.compileValue(args[0]);
        if (value.type.kind === 'int')
            return this.intArith('*', value, value, node);
        if (value.type.kind === 'real') {
            if (value.isConstant())
                return this.constValue(value.type, value.constant * value.constant);
            var temp = this.temp();
            var made = new Value(value.type, J.bin('*', J.assign(J.id(temp), value.node), J.id(temp)));
            if (value.type.rk === 'f32')
                made.node = J.call(J.path('Math.fround'), [made.node]);
            made.mayOverflow = true;
            return made;
        }
        this.error('Incompatible type for arg no. 1', args[0]);
    });

    // A float function: Sqrt keeps Single and Double, the others give Extended.
    function realFunction(name, title, keepType, fold) {
        def(name, function (args, node) {
            argCount(this, args, node, 1, 1, title);
            var value = this.compileValue(args[0]);
            if (value.type.kind === 'js')
                value = this.fromJs(value, t.double, args[0]);
            if (!types.isNumeric(value.type))
                this.error('Incompatible type for arg no. 1: Got "' + types.display(value.type) + '", expected "ValReal"', args[0]);
            var resultType = keepType && value.type.kind === 'real' && value.type.rk !== 'f80' ? value.type : t.extended;
            var real = this.convertReal(value, value.type.kind === 'real' ? value.type : t.extended);
            if (real.isConstant() && fold !== null) {
                var folded = fold(real.constant);
                if (folded === folded && isFinite(folded))
                    return this.constValue(t.extended, resultType.rk === 'f32' ? Math.fround(folded) : folded);
            }
            var result = this.rtCall(name, real.node);
            if (resultType.rk === 'f32')
                result = J.call(J.path('Math.fround'), [result]);
            return new Value(resultType, result);
        });
    }
    Compiler.prototype.rtCall = function (name, arg) {
        switch (name) {
        case 'sqrt': return this.rt('sqrt', [arg]);
        case 'ln': return this.rt('ln', [arg]);
        case 'exp': return this.rt('exp', [arg]);
        case 'sin': return J.call(J.path('Math.sin'), [arg]);
        case 'cos': return J.call(J.path('Math.cos'), [arg]);
        case 'arctan': return J.call(J.path('Math.atan'), [arg]);
        case 'int': return J.call(J.path('Math.trunc'), [arg]);
        case 'frac': return this.rt('frac', [arg]);
        }
        throw new Error('unknown real function ' + name);
    };
    realFunction('sqrt', 'Sqrt', true, function (value) { return value < 0 ? NaN : Math.sqrt(value); });
    realFunction('sin', 'Sin', false, Math.sin);
    realFunction('cos', 'Cos', false, Math.cos);
    realFunction('arctan', 'ArcTan', false, Math.atan);
    realFunction('exp', 'Exp', false, Math.exp);
    realFunction('ln', 'Ln', false, function (value) { return value <= 0 ? NaN : Math.log(value); });
    realFunction('int', 'Int', false, Math.trunc);
    realFunction('frac', 'Frac', false, function (value) { return value - Math.trunc(value); });

    def('pi', function (args, node) {
        argCount(this, args, node, 0, 0, 'Pi');
        return this.constValue(t.extended, Math.PI);
    });

    function roundTrunc(name, title) {
        def(name, function (args, node) {
            argCount(this, args, node, 1, 1, title);
            var value = this.compileValue(args[0]);
            if (value.type.kind === 'int')
                return this.convertInt(value, t.int64);
            if (value.type.kind === 'js')
                value = this.fromJs(value, t.double, args[0]);
            if (value.type.kind !== 'real')
                this.error('Incompatible type for arg no. 1: Got "' + types.display(value.type) + '", expected "ValReal"', args[0]);
            if (value.isConstant()) {
                var number = value.constant;
                var result = name === 'trunc' ? Math.trunc(number) : roundEven(number);
                return this.constValue(t.int64, big.fromFloat(result));
            }
            var made = new Value(t.int64, this.rt(name, [value.node]));
            made.range = types.range(t.int64);
            made.wide = true;
            return made;
        });
    }
    function roundEven(value) {
        var rounded = Math.round(value);
        if (Math.abs(value - Math.trunc(value)) === 0.5 && rounded % 2 !== 0)
            rounded -= 1;
        return rounded;
    }
    roundTrunc('round', 'Round');
    roundTrunc('trunc', 'Trunc');

    def('random', function (args, node) {
        argCount(this, args, node, 0, 1, 'Random');
        if (args.length === 0)
            return new Value(t.extended, this.rt('random', []));
        var limit = this.compileValue(args[0]);
        if (limit.type.kind !== 'int')
            this.error('Incompatible type for arg no. 1: Got "' + types.display(limit.type) + '", expected "LongInt"', args[0]);
        if (limit.type.ik === 'i64' || limit.type.ik === 'u64' || limit.type.ik === 'u32')
            return new Value(t.int64, this.rt('randomInt64', [this.hybrid(limit, false)]), { wide: true, range: types.range(t.int64) });
        var made = new Value(t.longint, this.rt('randomInt', [this.convertInt(limit, t.longint).node]));
        made.range = types.range(t.longint);
        return made;
    });

    def('randomize', function (args, node) {
        argCount(this, args, node, 0, 0, 'Randomize');
        return voidValue(this.rt('randomize', []));
    });

    def('hi', function (args, node) {
        argCount(this, args, node, 1, 1, 'Hi');
        var value = this.compileValue(args[0]);
        if (value.type.kind !== 'int')
            this.error('Incompatible type for arg no. 1', args[0]);
        var size = value.type.size;
        if (size <= 2)
            return new Value(t.byte, J.bin('&', J.bin('>>', this.convertInt(value, t.longint).node, J.num(8)), J.num(255)));
        if (size === 4)
            return new Value(t.word, J.bin('>>>', this.convertInt(value, t.cardinal).node, J.num(16)));
        return new Value(t.cardinal, J.bin('>>>', J.call(J.mem(this.helper('i64'), 'hi32'), [this.hybrid(value, false)]), J.num(0)));
    });

    def('lo', function (args, node) {
        argCount(this, args, node, 1, 1, 'Lo');
        var value = this.compileValue(args[0]);
        if (value.type.kind !== 'int')
            this.error('Incompatible type for arg no. 1', args[0]);
        var size = value.type.size;
        if (size <= 2)
            return new Value(t.byte, J.bin('&', this.convertInt(value, t.longint).node, J.num(255)));
        if (size === 4)
            return new Value(t.word, J.bin('&', this.convertInt(value, t.longint).node, J.num(65535)));
        return new Value(t.cardinal, this.convertInt(value, t.cardinal).node);
    });

    def('swap', function (args, node) {
        argCount(this, args, node, 1, 1, 'Swap');
        var value = this.compileValue(args[0]);
        if (value.type.kind !== 'int' || value.type.size > 4)
            this.error('Incompatible type for arg no. 1', args[0]);
        if (value.type.size === 2) {
            var signedNode = this.convertInt(value, t.longint).node;
            var temp = this.temp();
            var high = J.bin('>>', J.bin('&', J.assign(J.id(temp), signedNode), J.num(0xFF00)), J.num(8));
            var low = J.bin('<<', J.bin('&', J.id(temp), J.num(255)), J.num(8));
            return this.convertInt(new Value(t.longint, J.bin('|', high, low)), value.type);
        }
        var unsignedNode = this.convertInt(value, t.cardinal).node;
        var name = this.temp();
        var swapped = J.bin('|', J.bin('>>>', J.assign(J.id(name), unsignedNode), J.num(16)),
                            J.bin('<<', J.id(name), J.num(16)));
        return this.convertInt(new Value(t.cardinal, J.bin('>>>', swapped, J.num(0))), value.type);
    });

    // --- Sets

    function includeExclude(include, name) {
        return function (args, node) {
            argCount(this, args, node, 2, 2, name);
            var self = this;
            var target = this.lvalue(args[0]);
            if (target.type.kind !== 'set')
                this.error('Type mismatch', args[0]);
            var element = this.convertValue(this.compileValue(args[1], target.type.of), target.type.of, args[1]);
            var ordinal = this.ordinalNode(element);
            return voidValue(this.update(target.ref, function (current, ref) {
                if (target.type.small) {
                    var bit = J.bin('<<', J.num(1), ordinal);
                    return ref.set(include ? J.bin('|', current.node, bit) : J.bin('&', current.node, J.un('~', bit)));
                }
                return ref.set(self.rt(include ? 'sinc' : 'sexc', [current.node, ordinal]));
            }));
        };
    }
    def('include', includeExclude(true, 'Include'));
    def('exclude', includeExclude(false, 'Exclude'));

    // --- Pointers and memory

    def('new', function (args, node, expected) {
        argCount(this, args, node, 1, 2, 'New');
        var subject = this.compileExpr(args[0]);
        if (subject.kind === 'type') {
            // p := New(PRec) - a function.
            if (subject.type.kind !== 'pointer' || subject.type.to === null)
                this.error('Pointer type expected', args[0]);
            return new Value(subject.type, this.newTarget(subject.type.to, args[1], node));
        }
        var target = this.lvalue(args[0]);
        if (target.type.kind !== 'pointer' || target.type.to === null)
            this.error('Pointer type expected', args[0]);
        return voidValue(target.ref.set(this.newTarget(target.type.to, args[1], node)));
    });

    // A new place for New: an aggregate is an object, anything else a box.
    Compiler.prototype.newTarget = function (type, constructorNode, node) {
        if (type.kind === 'class' && type.isObject) {
            var object = J.call(J.mem(this.typeRef(type), 'zero'), []);
            if (constructorNode === undefined)
                return object;
            // New(p, Init(x)): the constructor of an object.
            var name = this.temp();
            var callee = constructorNode.k === 'call' ? constructorNode.callee : constructorNode;
            var callArgs = constructorNode.k === 'call' ? constructorNode.args : [];
            if (callee.k !== 'name')
                this.error('Constructor expected', constructorNode);
            var member = this.findMember(type, callee.name);
            if (member === null || member.kind !== 'method')
                this.error('Identifier not found "' + callee.text + '"', callee);
            var values = this.compileArgs(callArgs);
            var proc = this.chooseOverload(member.procs, values, constructorNode, callee.text);
            var call = this.methodCallNode(proc, J.id(name), this.passArgs(proc, values, callArgs, constructorNode), false, false);
            return J.seq([J.assign(J.id(name), object), call, J.id(name)]);
        }
        if (constructorNode !== undefined)
            this.error('Object type expected', node);
        if (types.isAggregate(type))
            return J.call(J.mem(this.typeRef(type), 'zero'), []);
        return J.obj([['v', this.zeroNode(type)]]);
    };

    def('dispose', function (args, node) {
        argCount(this, args, node, 1, 2, 'Dispose');
        var value = this.compileValue(args[0]);
        if (value.type.kind !== 'pointer')
            this.error('Pointer type expected', args[0]);
        if (args.length === 2) {
            var type = value.type.to;
            var callee = args[1].k === 'call' ? args[1].callee : args[1];
            var callArgs = args[1].k === 'call' ? args[1].args : [];
            var member = type && type.kind === 'class' ? this.findMember(type, callee.name) : null;
            if (member === null || member.kind !== 'method')
                this.error('Destructor expected', args[1]);
            var values = this.compileArgs(callArgs);
            var proc = this.chooseOverload(member.procs, values, args[1], callee.text);
            return voidValue(this.methodCallNode(proc, value.node, this.passArgs(proc, values, callArgs, args[1]), false, false));
        }
        return voidValue(this.rt('deref', [value.node]));
    });

    def('assigned', function (args, node) {
        argCount(this, args, node, 1, 1, 'Assigned');
        var value = this.compileExpr(args[0]);
        if (value.kind === 'routine' || value.kind === 'method')
            this.error('Illegal expression', args[0]);
        var type = value.type;
        if (type.kind === 'dynarray')
            return new Value(t.boolean, J.bin('!==', J.mem(value.node, 'length'), J.num(0)));
        if (!types.isNullable(type))
            this.error('Pointer type expected', args[0]);
        return new Value(t.boolean, J.bin('!=', value.node, J.nul()));
    });

    def('addr', function (args, node) {
        argCount(this, args, node, 1, 1, 'Addr');
        return this.compileAddress({ k: 'addr', arg: args[0], line: node.line, column: node.column, source: node.source });
    });

    def('default', function (args, node) {
        argCount(this, args, node, 1, 1, 'Default');
        var subject = this.compileExpr(args[0]);
        if (subject.kind !== 'type')
            this.error('Type identifier expected', args[0]);
        var type = subject.type;
        if (types.isOrdinal(type))
            return this.constValue(type, type.kind === 'bool' ? false : (type.kind === 'int' ? 0 : 0));
        return new Value(type, this.zeroNode(type));
    });

    def('fillchar', function (args, node) {
        argCount(this, args, node, 3, 3, 'FillChar');
        var target = this.lvalue(args[0]);
        var count = this.convertValue(this.compileValue(args[1]), t.int64, args[1]);
        var value = this.compileValue(args[2]);
        var byte = value.type.kind === 'char' || value.type.kind === 'bool' ? this.ordinalNode(value)
                                                                           : this.convertValue(value, t.byte, args[2]).node;
        if (!types.isAggregate(target.type) && target.type.kind !== 'dynarray') {
            var self = this;
            return voidValue(this.update(target.ref, function (current, ref) {
                return ref.set(self.rt('fillScalar', [self.typeRef(target.type), byte]));
            }));
        }
        return voidValue(this.rt('fillChar', [target.ref.get(), this.typeRef(target.type), count.node, byte]));
    });

    def('move', function (args, node) {
        argCount(this, args, node, 3, 3, 'Move');
        var source = this.compileValue(args[0]);
        var target = this.lvalue(args[1]);
        var count = this.convertValue(this.compileValue(args[2]), t.int64, args[2]);
        return voidValue(this.rt('move', [source.node, target.ref.get(), this.typeRef(target.type), count.node]));
    });

    function unsupported(name) {
        def(name, function (args, node) {
            this.error('"' + name + '" is not supported: the program has no raw memory', node);
        });
    }
    ['getmem', 'freemem', 'reallocmem', 'allocmem'].forEach(unsupported);

    // --- Control

    def('exit', function (args, node) {
        argCount(this, args, node, 0, 1, 'Exit');
        var fn = this.fn;
        if (fn.kind === 'main') {
            if (args.length > 0)
                this.error('Illegal expression', args[0]);
            var exitMain = new Value(t.void, J.num(0));
            exitMain.exit = true;
            return exitMain;
        }
        var made;
        if (args.length > 0) {
            if (fn.resultVar === null)
                this.error('Procedures cannot return a value', args[0]);
            var value = this.compileValue(args[0], fn.resultVar.type);
            made = new Value(t.void, J.num(0));
            made.exitValue = this.convertValue(value, fn.resultVar.type, args[0]);
        } else {
            made = new Value(t.void, J.num(0));
        }
        made.exit = true;
        return made;
    });

    def('break', function (args, node) {
        argCount(this, args, node, 0, 0, 'Break');
        var made = new Value(t.void, J.num(0));
        made.loopJump = 'break';
        return made;
    });

    def('continue', function (args, node) {
        argCount(this, args, node, 0, 0, 'Continue');
        var made = new Value(t.void, J.num(0));
        made.loopJump = 'continue';
        return made;
    });

    def('halt', function (args, node) {
        argCount(this, args, node, 0, 1, 'Halt');
        var code = args.length > 0 ? this.convertValue(this.compileValue(args[0]), t.longint, args[0]).node : J.num(0);
        return voidValue(this.rt('halt', [code]));
    });

    def('runerror', function (args, node) {
        argCount(this, args, node, 0, 1, 'RunError');
        var code = args.length > 0 ? this.convertValue(this.compileValue(args[0]), t.word, args[0]).node : J.num(0);
        return voidValue(this.rt('re', [code]));
    });

    def('assert', function (args, node) {
        argCount(this, args, node, 1, 2, 'Assert');
        if (!this.switches(node).C)
            return voidValue(J.num(0));
        var test = this.convertValue(this.compileValue(args[0]), t.boolean, args[0]);
        var message = args.length > 1 ? this.stringValue(this.compileValue(args[1]), args[1]).node : J.str('Assertion failed');
        var where = ' (' + (this.source || 'block') + ', line ' + node.line + ')';
        return voidValue(J.cond(test.node, J.num(0), this.rt('assertFail', [message, J.str(where)])));
    });

    def('paramcount', function (args, node) {
        argCount(this, args, node, 0, 0, 'ParamCount');
        return this.constValue(t.longint, 0);
    });
    def('paramstr', function (args, node) {
        argCount(this, args, node, 1, 1, 'ParamStr');
        var index = this.convertValue(this.compileValue(args[0]), t.longint, args[0]);
        return new Value(t.ansistring, J.cond(J.bin('===', index.node, J.num(0)), J.str('program'), J.str('')));
    });

    // --- Files

    def('assign', fileProc('assign', 2, 2, true));
    def('assignfile', fileProc('assign', 2, 2, true));
    def('reset', fileProc('reset', 1, 2, false));
    def('rewrite', fileProc('rewrite', 1, 2, false));
    def('append', fileProc('append', 1, 1, false));
    def('close', fileProc('close', 1, 1, false));
    def('closefile', fileProc('close', 1, 1, false));
    def('flush', fileProc('flush', 1, 1, false));
    def('erase', fileProc('erase', 1, 1, false));
    def('rename', fileProc('rename', 2, 2, true));
    def('seek', fileProc('seek', 2, 2, false));
    def('truncate', fileProc('truncate', 1, 1, false));

    function fileProc(method, min, max, withString) {
        return function (args, node) {
            argCount(this, args, node, min, max, method);
            var file = this.compileValue(args[0]);
            if (file.type.kind !== 'file')
                this.error('Incompatible type for arg no. 1: Got "' + types.display(file.type) + '", expected "Text"', args[0]);
            var extra = [];
            if (args.length > 1) {
                if (withString)
                    extra.push(this.stringValue(this.compileValue(args[1]), args[1]).node);
                else
                    extra.push(this.convertValue(this.compileValue(args[1]), t.int64, args[1]).node);
            }
            var io = J.bool(this.switches(node).I);
            return voidValue(this.rt('file_' + method, [file.node].concat(extra, [io])));
        };
    }

    function fileFunction(method, type, consoleValue) {
        return function (args, node) {
            if (args.length === 0) {
                if (consoleValue !== undefined)
                    return new Value(type, this.rt('file_' + method, [this.rt('input', []), J.bool(true)]));
                this.error('Wrong number of parameters specified for call to "' + method + '"', node);
            }
            argCount(this, args, node, 1, 1, method);
            var file = this.compileValue(args[0]);
            if (file.type.kind !== 'file')
                this.error('Incompatible type for arg no. 1: Got "' + types.display(file.type) + '", expected "Text"', args[0]);
            var made = new Value(type, this.rt('file_' + method, [file.node, J.bool(this.switches(node).I)]));
            if (type.kind === 'int')
                made.range = [0, 2147483647];
            return made;
        };
    }
    def('eof', fileFunction('eof', t.boolean, true));
    def('eoln', fileFunction('eoln', t.boolean, true));
    def('seekeof', fileFunction('seekeof', t.boolean, true));
    def('seekeoln', fileFunction('seekeoln', t.boolean, true));
    def('filepos', fileFunction('filepos', t.int64));
    def('filesize', fileFunction('filesize', t.int64));

    def('ioresult', function (args, node) {
        argCount(this, args, node, 0, 0, 'IOResult');
        return new Value(t.word, this.rt('takeIoResult', []), { range: [0, 65535] });
    });

    // --- Waiting (Crt.Delay, SysUtils.Sleep)

    Compiler.prototype.waitCall = function (milliseconds) {
        var node = this.rt('sleepNow', [milliseconds]);
        var self = this;
        this.fn.calls.push({ waits: true, node: node, generatorCallee: function () {
            return self.rt('sleep', [milliseconds]);
        } });
        return node;
    };

    Pascal.waitBuiltin = function (name) {
        return function (args, node) {
            argCount(this, args, node, 1, 1, name);
            var ms = this.convertValue(this.compileValue(args[0]), t.int64, args[0]);
            return voidValue(this.waitCall(ms.node));
        };
    };
})(globalThis);
