// BASIC: built-in functions (LEFT$, SQR, TIMER...) and call statements
// (_DELAY, _LIMIT, CLEARCONSOLE), names of host modules and JavaScript.
// Names of QBasic functions are reserved; names of host modules and
// JavaScript (GREET, APP, JS...) are "soft": a variable or an array of the
// program with that name hides them.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Basic = T.basic;
    if (Basic.builtins)
        return;

    var J = T.J;
    var Compiler = Basic.Compiler;
    var E = Basic.E;
    var literal = Basic.literal;
    var isNumeric = Basic.isNumeric;

    function B(name, args) {
        return J.method(J.id('$B'), name, args || []);
    }

    var builtins = Basic.builtins = Object.create(null);
    var statementBuiltins = Basic.statementBuiltins = Object.create(null);

    function define(names, min, max, compile, options) {
        names.split(' ').forEach(function (name) {
            builtins[name] = { min: min, max: max, compile: compile, soft: !!(options && options.soft),
                               raw: !!(options && options.raw) };
        });
    }

    // Arguments of a built-in function: count check, parsing.
    Compiler.prototype.builtinCall = function (node, builtin) {
        var name = node.name + node.suffix;
        if (builtin === undefined)
            builtin = builtins[name];
        if (builtin === undefined)
            this.fail('Function not defined', node);
        var args = node.args || [];
        if (args.length < builtin.min || args.length > builtin.max) {
            if (node.args === null && builtin.min > 0)
                this.fail('Expected: (', node);
            this.fail('Argument-count mismatch', node);
        }
        var self = this;
        var compiled = builtin.raw ? args : args.map(function (arg) {
            if (arg.k === 'array')
                self.fail('Expected: expression', arg);
            return self.value(self.expr(arg));
        });
        return builtin.compile.call(this, compiled, node, name);
    };

    Compiler.prototype.num = function (expression, node) {
        return this.checked(this.numeric(expression, node));
    };

    Compiler.prototype.str = function (expression, node) {
        return this.string(expression, node);
    };

    Compiler.prototype.long = function (expression, node) {
        return this.convert(expression, 'l', node);
    };

    Compiler.prototype.int16 = function (expression, node) {
        return this.convert(expression, 'i', node);
    };

    // The type of a floating-point function: DOUBLE for DOUBLE, otherwise SINGLE.
    function floatType(expression) {
        return expression.t === 'd' ? 'd' : 'f';
    }

    function single(type, node) {
        return type === 'f' ? J.call(J.path('Math.fround'), [node]) : node;
    }

    function constantOr(self, args, fn, type, node) {
        if (args.every(function (arg) { return arg.c !== undefined; })) {
            return self.fold(function () {
                return literal(fn.apply(null, args.map(function (arg) { return arg.c; })), type);
            }, node);
        }
        return null;
    }

    // --- Numbers

    define('abs', 1, 1, function (args, node) {
        var argument = this.num(args[0], node);
        if (argument.t === 'i' || argument.t === 'l')
            return E(argument.t, this.rangeCheck(J.call(J.path('Math.abs'), [argument.j]), argument.t));
        return E(argument.t, J.call(J.path('Math.abs'), [argument.j]));
    });

    define('sgn', 1, 1, function (args, node) {
        var argument = this.num(args[0], node);
        return E('i', J.call(J.path('Math.sign'), [argument.j]));
    });

    define('int fix', 1, 1, function (args, node, name) {
        var argument = this.num(args[0], node);
        if (argument.t === 'i' || argument.t === 'l')
            return argument;
        var folded = constantOr(this, [argument], name === 'int' ? Math.floor : Math.trunc, argument.t, node);
        if (folded !== null)
            return folded;
        return E(argument.t, J.call(J.path(name === 'int' ? 'Math.floor' : 'Math.trunc'), [argument.j]));
    });

    define('cint', 1, 1, function (args, node) { return this.convert(this.numeric(args[0], node), 'i', node); });
    define('clng', 1, 1, function (args, node) { return this.convert(this.numeric(args[0], node), 'l', node); });
    define('csng', 1, 1, function (args, node) { return this.convert(this.numeric(args[0], node), 'f', node); });
    define('cdbl', 1, 1, function (args, node) { return this.convert(this.numeric(args[0], node), 'd', node); });

    // SIN, COS, TAN, ATN, EXP - no special cases; SQR and LOG - checked.
    var MATH = { sin: 'Math.sin', cos: 'Math.cos', tan: 'Math.tan', atn: 'Math.atan', exp: 'Math.exp' };
    define('sin cos tan atn exp', 1, 1, function (args, node, name) {
        var argument = this.num(args[0], node);
        var type = floatType(argument);
        var call = single(type, J.call(J.path(MATH[name]), [argument.j]));
        return E(type, call, { u: name === 'exp' || name === 'tan' });
    });

    define('sqr log', 1, 1, function (args, node, name) {
        var argument = this.num(args[0], node);
        var type = floatType(argument);
        return E(type, single(type, B(name, [argument.j])));
    });

    define('rnd', 0, 1, function (args, node) {
        if (args.length === 0)
            return E('f', B('rnd', []));
        return E('f', B('rnd', [this.num(args[0], node).j]));
    });

    define('timer', 0, 0, function () {
        return E('f', B('timer'));
    });

    define('_pi', 0, 1, function (args, node) {
        if (args.length === 0)
            return literal(Math.PI, 'd');
        return E('d', J.bin('*', J.num(Math.PI), this.convert(args[0], 'd', node).j), { u: true });
    });

    define('_round', 1, 1, function (args, node) {
        return E('l', B('clng', [this.num(args[0], node).j]));
    });

    // --- Strings

    define('len', 1, 1, function (args, node) {
        var arg = args[0];
        var expression = this.value(this.expr(arg));
        if (expression.t === 's')
            return E('l', J.mem(expression.j, 'length'));
        if (expression.t === 'o')
            return E('l', J.mem(B('os', [expression.j]), 'length'));
        if (isNumeric(expression.t))
            return literal({ i: 2, l: 4, f: 4, d: 8 }[expression.t], 'l');
        return literal(expression.t.size, 'l');
    }, { raw: true });

    define('left$ right$', 2, 2, function (args, node, name) {
        var text = this.str(args[0], node), count = this.long(args[1], node);
        return E('s', J.call(J.path(name === 'left$' ? '$B.left' : '$B.right'), [text.j, count.j]));
    });

    define('mid$', 2, 3, function (args, node) {
        var call = [this.str(args[0], node).j, this.long(args[1], node).j];
        if (args.length === 3)
            call.push(this.long(args[2], node).j);
        return E('s', J.call(J.path('$B.mid'), call));
    });

    define('instr', 2, 3, function (args, node) {
        var start = args.length === 3 ? this.long(args[0], node).j : J.num(1);
        var rest = args.length === 3 ? args.slice(1) : args;
        return E('l', J.call(J.path('$B.instr'), [start, this.str(rest[0], node).j, this.str(rest[1], node).j]));
    });

    define('chr$', 1, 1, function (args, node) {
        var code = this.long(args[0], node);
        if (code.c !== undefined && code.c >= 0 && code.c <= 0x10FFFF)
            return literal(String.fromCodePoint(code.c), 's');
        return E('s', J.call(J.path('$B.chr'), [code.j]));
    });

    define('asc', 1, 2, function (args, node) {
        var text = this.str(args[0], node);
        if (args.length === 2)
            text = E('s', J.call(J.path('$B.mid'), [text.j, this.long(args[1], node).j, J.num(1)]));
        return E('l', J.call(J.path('$B.asc'), [text.j]));
    });

    define('str$', 1, 1, function (args, node) {
        var argument = this.num(args[0], node);
        if (argument.c !== undefined)
            return literal(Basic.formatNumber(argument.c, argument.t), 's');
        return E('s', B('str', [argument.j, J.str(argument.t)]));
    });

    define('val', 1, 1, function (args, node) {
        return E('d', B('val', [this.str(args[0], node).j]));
    });

    define('ucase$ lcase$', 1, 1, function (args, node, name) {
        return E('s', J.method(this.str(args[0], node).j, name === 'ucase$' ? 'toUpperCase' : 'toLowerCase', []));
    });

    define('ltrim$ rtrim$ _trim$', 1, 1, function (args, node, name) {
        var text = this.str(args[0], node).j;
        if (name === '_trim$')
            return E('s', J.call(J.path('$B.ltrim'), [J.call(J.path('$B.rtrim'), [text])]));
        return E('s', J.call(J.path(name === 'ltrim$' ? '$B.ltrim' : '$B.rtrim'), [text]));
    });

    define('space$', 1, 1, function (args, node) {
        return E('s', J.call(J.path('$B.space'), [this.long(args[0], node).j]));
    });

    define('string$', 2, 2, function (args, node) {
        var count = this.long(args[0], node).j;
        var what = args[1].t === 's' || args[1].t === 'o' ? this.str(args[1], node).j : this.long(args[1], node).j;
        return E('s', J.call(J.path('$B.string'), [count, what]));
    });

    define('hex$ oct$ _bin$', 1, 1, function (args, node, name) {
        var argument = this.num(args[0], node);
        var wide = argument.t === 'l' || argument.t === 'd';
        var count = this.long(argument, node).j;
        var base = name === 'hex$' ? 16 : (name === 'oct$' ? 8 : 2);
        return E('s', J.call(J.path('$B.radix'), [count, J.num(base), J.bool(wide)]));
    });

    define('date$', 0, 0, function () { return E('s', B('date')); });
    define('time$', 0, 0, function () { return E('s', B('time')); });
    define('inkey$', 0, 0, function () { return E('s', B('inkey')); });
    define('command$ environ$', 0, 1, function () { return literal('', 's'); });

    define('input$', 1, 2, function (args, node) {
        var count = this.long(args[0], node).j;
        if (args.length === 2)
            return E('s', B('fileReadChars', [this.long(args[1], node).j, count]));
        return E('s', B('inputChars', [count]));
    });

    define('mki$ mkl$ mks$ mkd$', 1, 1, function (args, node, name) {
        var kind = { 'mki$': 'i', 'mkl$': 'l', 'mks$': 'f', 'mkd$': 'd' }[name];
        return E('s', J.call(J.path('$B.mk'), [this.convert(args[0], kind, node).j, J.str(kind)]));
    });

    define('cvi cvl cvs cvd', 1, 1, function (args, node, name) {
        var kind = { cvi: 'i', cvl: 'l', cvs: 'f', cvd: 'd' }[name];
        return E(kind, J.call(J.path('$B.cv'), [this.str(args[0], node).j, J.str(kind)]));
    });

    // --- Errors, arrays, screen

    define('err', 0, 0, function () { return E('i', J.mem(J.id('$B'), 'err')); });
    define('erl', 0, 0, function () { return E('l', J.mem(J.id('$B'), 'erl')); });

    define('lbound ubound', 1, 2, function (args, node, name) {
        var target = args[0];
        if (!(target.k === 'array' || (target.k === 'ref' && target.args === null && target.chain.length === 0)))
            this.fail('Expected: array', target);
        var array = this.array(target.name, target.suffix, target.display, target, -1, false);
        if (array === null)
            this.fail('Array not defined', target);
        var dimension = args.length === 2 ? this.long(this.value(this.expr(args[1])), args[1]).j : J.num(1);
        return E('l', J.method(this.arrayRef(array), 'bound', [dimension, J.bool(name === 'ubound')]));
    }, { raw: true });

    define('pos', 1, 1, function () { return E('i', B('pos')); });
    define('csrlin', 0, 0, function () { return literal(1, 'i'); });
    define('fre', 1, 1, function () { return literal(524288, 'l'); });
    define('peek inp', 1, 1, function () { return literal(0, 'i'); });
    define('lpos', 1, 1, function () { return literal(1, 'i'); });
    define('screen', 2, 3, function (args) { return literal(32, 'i'); });
    define('freefile', 0, 0, function () { return E('i', B('freeFile')); });
    define('eof lof loc', 1, 1, function (args, node, name) {
        return E(name === 'eof' ? 'i' : 'l', B('file' + name.toUpperCase(), [this.long(args[0], node).j]));
    });

    // --- Graphics

    define('point', 1, 2, function (args, node) {
        if (args.length === 1)
            return E('d', J.method(B('g'), 'lastPoint', [this.long(args[0], node).j]));
        return E('l', J.method(B('g'), 'point', [this.convert(args[0], 'd', node).j, this.convert(args[1], 'd', node).j]));
    });

    define('_rgb _rgb32', 3, 3, function (args, node, name) {
        var self = this;
        var values = args.map(function (arg) { return self.convert(arg, 'd', node).j; });
        return E('l', B('rgb', values.concat([J.bool(name === '_rgb32')])));
    });

    define('_newimage', 2, 3, function (args, node) {
        var self = this;
        var values = args.map(function (arg) { return self.convert(arg, 'l', node).j; });
        if (values.length === 2)
            values.push(J.num(256));
        return E('o', B('newImage', values));
    });

    define('_width _height', 0, 1, function (args, node, name) {
        return E('l', B('screenSize', [J.bool(name === '_height')]));
    });

    // --- Host modules and JavaScript (soft names)

    // Names that start a chain "name.member": JS, a host module (APP.greet)
    // and functions of host modules without parameters that give a value
    // (THISBLOCK.id).
    var objectRoots = { js: true };

    define('js', 0, 0, function () { return E('o', J.mem(J.id('$B'), 'global')); }, { soft: true });

    var RESULT_KINDS = { string: 's', number: 'd', int: 'd', bool: 'i', value: 'o', array: 'o' };

    // Host modules as built-ins: GREET("Ann") for a global module (unless
    // QBasic has the name), APP.greet("Ann") for every module; functions
    // without a value are statements: LOG "text". Integers are DOUBLE in
    // BASIC, flags are -1 and 0.
    Basic.installHostModules = function (modules) {
        modules.forEach(function (module, moduleIndex) {
            var moduleName = module.name.toLowerCase();
            if (builtins[moduleName] === undefined || builtins[moduleName].host) {
                define(moduleName, 0, 0, function () {
                    return E('o', B('hostModule', [J.num(moduleIndex)]));
                }, { soft: true });
                builtins[moduleName].host = true;
                objectRoots[moduleName] = true;
            }
            if (!module.global)
                return;
            module.functions.forEach(function (fn, fnIndex) {
                // Names that an earlier session gave to host functions may
                // be taken again; names of QBasic may not.
                var name = fn.names.upper.toLowerCase();
                if ((builtins[name] !== undefined && !builtins[name].host) ||
                    (statementBuiltins[name] !== undefined && !statementBuiltins[name].host))
                    return;
                delete builtins[name];
                delete statementBuiltins[name];
                var parameters = fn.getter ? [] : fn.parameters;
                var compileArguments = function (compiler, args, node) {
                    return args.map(function (arg, index) {
                        switch (parameters[index].type) {
                        case 'string':
                            return compiler.str(arg, node).j;
                        case 'number':
                        case 'int':
                            return compiler.convert(arg, 'd', node).j;
                        case 'bool':
                            return J.bin('!==', compiler.convert(arg, 'd', node).j, J.num(0));
                        }
                        return compiler.toJsValue(arg, node).j;
                    });
                };
                if (fn.result === 'void') {
                    // Arguments of a statement come as they were parsed.
                    statementBuiltins[name] = function (args, node) {
                        if (args.length < fn.required || args.length > parameters.length)
                            this.fail('Argument-count mismatch', node);
                        var self = this;
                        var values = args.map(function (arg) { return self.value(self.expr(arg)); });
                        this.emit(B('hostCall', [J.num(moduleIndex), J.num(fnIndex), J.arr(compileArguments(this, values, node))]),
                                  node);
                    };
                    statementBuiltins[name].host = true;
                    return;
                }
                define(name, fn.required, parameters.length, function (args, node) {
                    return E(RESULT_KINDS[fn.result],
                             B('hostCall', [J.num(moduleIndex), J.num(fnIndex), J.arr(compileArguments(this, args, node))]));
                }, { soft: true });
                builtins[name].host = true;
                if (parameters.length === 0 && (fn.result === 'value' || fn.result === 'array'))
                    objectRoots[name] = true;
            });
        });
    };
    define('jsarray', 0, 255, function (args, node) {
        return E('o', J.arr(this.jsArguments(node.args || [])));
    }, { soft: true, raw: true });
    define('jsobject', 0, 0, function () { return E('o', J.obj([])); }, { soft: true });
    define('jsnull', 0, 0, function () { return E('o', J.nul()); }, { soft: true });
    define('jsundefined', 0, 0, function () { return E('o', J.undef()); }, { soft: true });
    define('jsnew', 1, 255, function (args, node) {
        var list = this.jsArguments(node.args);
        return E('o', B('jnew', [list[0], J.arr(list.slice(1))]));
    }, { soft: true, raw: true });
    define('jsfunction', 1, 1, function (args, node) {
        return E('o', B('jfunction', [this.str(args[0], node).j]));
    }, { soft: true });
    define('jstype$', 1, 1, function (args, node) {
        return E('s', B('jtype', [this.toJsValue(args[0], node).j]));
    }, { soft: true });
    define('jsisnull', 1, 1, function (args, node) {
        return E('b', B('jnull', [this.toJsValue(args[0], node).j]));
    }, { soft: true });

    // The start of a chain "name.member": JS, a host module, a host value.
    Compiler.prototype.apiObject = function (name, node) {
        var builtin = builtins[name];
        if (builtin === undefined || !builtin.soft || builtin.min > 0 || this.isUserName(name, '', false))
            return null;
        if (!objectRoots[name])
            return null;
        return builtin.compile.call(this, [], node, name);
    };

    // --- Statements that are calls

    statementBuiltins._delay = function (args, node) {
        if (args.length !== 1)
            this.fail('Argument-count mismatch', node);
        this.wait('sleep', this.convert(this.value(this.expr(args[0])), 'd', args[0]).j, node);
    };

    statementBuiltins._limit = function (args, node) {
        if (args.length !== 1)
            this.fail('Argument-count mismatch', node);
        this.wait('limit', this.convert(this.value(this.expr(args[0])), 'd', args[0]).j, node);
    };

    statementBuiltins._display = function (args, node) {
        this.wait('display', J.num(0), node);
    };

    statementBuiltins.clearconsole = function (args, node) {
        if (args.length !== 0)
            this.fail('Argument-count mismatch', node);
        this.emit(B('cls'), node);
    };

    ['_title', '_autodisplay', '_fullscreen', '_dest', '_source', '_font', '_icon', '_screenmove', '_mousehide',
     '_mouseshow', '_printmode'].forEach(function (name) {
        statementBuiltins[name] = function (args, node) {};
    });
})(globalThis);
