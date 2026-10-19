// Forth: words that work with the system itself - definitions and control
// structures (executed while compiling), input parsing, exceptions, the
// search order, strings, the heap, time, tools.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Forth = T.forth;
    if (Forth.installWords)
        return;

    var J = T.J;
    var layout = Forth.layout;
    var ForthError = Forth.ForthError;
    var i64 = T.i64, utf8 = T.utf8;
    var System = Forth.System;

    // Libraries that can be included without a host file. random.fs is
    // written here, not taken from gforth: it is the same linear
    // congruential generator (seed * 272958469 + 1 modulo 2^64, the range
    // from the high cell of the product), so programs get the numbers they
    // would get in gforth.
    var LIBRARIES = {
        'random.fs': 'variable seed\n' +
                     ': rnd ( -- u ) seed @ 272958469 * 1+ dup seed ! ;\n' +
                     ': random ( u -- 0..u-1 ) rnd um* nip ;\n'
    };

    // A word in JavaScript: body works with system.sp (the sp of the call
    // is put there). gen - when the word waits.
    function native(system, name, body, options) {
        options = options || {};
        var word = new Forth.Word(system, name, 'native');
        word.fn = function (sp) {
            system.sp = sp;
            body();
            return system.sp;
        };
        if (options.gen) {
            var gen = options.gen;
            word.gen = function* (sp) {
                system.sp = sp;
                yield* gen();
                return system.sp;
            };
            word.async = true;
        }
        word.immediate = !!options.immediate;
        word.compileOnly = !!options.compileOnly;
        system.forth.add(word);
        return word;
    }

    // Code into a definition: gen(c) writes the translation itself.
    function code(system, gen, flags) {
        var op = system.requireDefinition().add({ k: 'code', gen: gen });
        if (flags)
            Object.keys(flags).forEach(function (key) { op[key] = flags[key]; });
        return op;
    }

    function wordNamed(system, name) {
        return system.forth.find(Forth.key(name));
    }

    // --- Helpers of the translated code

    System.prototype.compileXt = function (xt) {
        this.requireDefinition().add({ k: 'call', word: this.wordOf(xt) });
    };

    System.prototype.throwCode = function (code) {
        if (code === 0)
            return;
        throw new ForthError(typeof code === 'number' ? code : i64.toFloat(code));
    };

    System.prototype.abortQuote = function (bytes) {
        throw new ForthError(-2, utf8.decode(bytes));
    };

    // The THROW code for an error that CATCH can catch; null - it cannot
    // (a stop, BYE, a translator error).
    System.prototype.catchCode = function (error) {
        if (error instanceof ForthError)
            return error.code;
        if (error instanceof Forth.ForthExit || error instanceof T.CompileError || error instanceof T.LanguageError)
            return null;
        if (error instanceof RangeError && /stack|call depth|recursion/i.test(String(error.message)))
            return -5;
        return null;
    };

    System.prototype.catchState = function () {
        return { rp: this.rp, fp: this.fp, inputs: this.inputs.length, definition: this.definition,
                 definitions: this.definitions.slice(), state: this.m.cell(layout.STATE) };
    };

    System.prototype.catchRestore = function (saved, sp, code) {
        this.rp = saved.rp;
        this.fp = saved.fp;
        this.restoreInputs(saved.inputs);
        this.definition = saved.definition;
        this.definitions = saved.definitions;
        this.m.setCell(layout.STATE, saved.state);
        this.clearGuards();
        this.S[++sp] = code;
        return sp;
    };

    // CATCH ( i*x xt -- j*x 0 | i*x n )
    System.prototype.catchXt = function (sp) {
        var xt = this.S[sp--];
        var saved = this.catchState();
        try {
            sp = this.execute(xt, sp);
        } catch (error) {
            var code = this.catchCode(error);
            if (code === null)
                throw error;
            return this.catchRestore(saved, sp, code);
        }
        this.S[++sp] = 0;
        return sp;
    };

    System.prototype.catchXtGen = function* (sp) {
        var xt = this.S[sp--];
        var saved = this.catchState();
        try {
            sp = yield* this.executeGen(xt, sp);
        } catch (error) {
            var code = this.catchCode(error);
            if (code === null)
                throw error;
            return this.catchRestore(saved, sp, code);
        }
        this.S[++sp] = 0;
        return sp;
    };

    // A string from memory with \-sequences parsed (S\").
    System.prototype.parseEscaped = function () {
        var input = this.input;
        var U8 = this.m.U8;
        var start = input.address, end = input.address + input.length;
        var at = start + Math.min(this.toIn(), input.length);
        var text = '';
        var simple = { a: 7, b: 8, e: 27, f: 12, l: 10, n: 10, q: 34, r: 13, t: 9, v: 11, z: 0, '"': 34, '\\': 92 };
        while (at < end && U8[at] !== 34) {
            var code = U8[at++];
            if (code !== 92 || at >= end) {
                text += String.fromCharCode(code);
                continue;
            }
            var next = String.fromCharCode(U8[at++]);
            if (next === 'm') {
                text += '\r\n';
            } else if (next === 'x') {
                var hex = this.m.bytes(at, Math.min(2, end - at));
                at += hex.length;
                text += String.fromCharCode(parseInt(hex, 16) || 0);
            } else if (simple[next] !== undefined) {
                text += String.fromCharCode(simple[next]);
            } else {
                text += next;
            }
        }
        this.setToIn(Math.min(at + 1, end) - start);
        return text;
    };

    // A string for S" and the like: a constant in the definition when
    // compiling, a transient one when interpreting.
    System.prototype.stringLiteral = function (bytes) {
        if (this.compiling() && this.definition !== null) {
            var address = this.literalString(bytes);
            this.definition.add({ k: 'lit', value: address });
            this.definition.add({ k: 'lit', value: bytes.length });
        } else {
            this.push(this.transientString(bytes));
            this.push(bytes.length);
        }
    };

    System.prototype.nameString = function (word) {
        return this.transientString(word.name);
    };

    // A word by the name from the input: a local (when compiling) or from the dictionary.
    System.prototype.findTarget = function () {
        var name = this.parseNameText();
        if (this.definition !== null && this.compiling()) {
            var local = this.definition.scope[Forth.key(name)];
            if (local !== undefined)
                return { local: local };
        }
        return { word: this.findOrFail(name) };
    };

    System.prototype.wordlistOf = function (id) {
        var number = this.number(id);
        var list = this.wordlists[number - 1];
        if (list === undefined)
            throw new ForthError(-24, 'Invalid word list');
        return list;
    };

    // Input from a file: a host file or a built-in library.
    System.prototype.readFile = function (name) {
        var clean = name.replace(/^\.\//, '');
        var text = this.env.readModule(clean);
        if (text === null && Object.prototype.hasOwnProperty.call(LIBRARIES, clean))
            text = LIBRARIES[clean];
        if (text === null)
            throw new ForthError(-38, 'No such attachment: ' + clean);
        return { name: clean, text: text };
    };

    System.prototype.includeInput = function (bytes) {
        var file = this.readFile(utf8.decode(bytes));
        var input = this.fileInput(file.text, file.name);
        return { file: file, input: input };
    };

    // REQUIRE: a file already included with the same text is not included again.
    System.prototype.requireInput = function (bytes) {
        var file = this.readFile(utf8.decode(bytes));
        var known = this.required[file.name];
        if (known !== undefined && known.text === file.text)
            return null;
        this.required[file.name] = { text: file.text };
        return this.fileInput(file.text, file.name);
    };

    // [IF]: skips words up to [ELSE] or [THEN] of its level.
    System.prototype.skipConditional = function (stopAtElse) {
        var depth = 0;
        for (;;) {
            var token = this.parseName();
            if (token.length === 0) {
                if (!this.refill())
                    throw new ForthError(-58, '[IF] without [THEN]');
                continue;
            }
            var key = Forth.key(this.m.bytes(token.address, token.length));
            if (key === '[IF]') {
                ++depth;
            } else if (key === '[ELSE]') {
                if (depth === 0 && stopAtElse)
                    return;
            } else if (key === '[THEN]') {
                if (depth === 0)
                    return;
                --depth;
            }
        }
    };

    System.prototype.dump = function (address, length) {
        address = this.number(address);
        length = this.number(length);
        for (var line = 0; line < length; line += 16) {
            var count = Math.min(16, length - line);
            var bytes = this.m.bytes(address + line, count);
            var hex = '';
            var text = '';
            for (var index = 0; index < 16; ++index) {
                if (index < count) {
                    var code = bytes.charCodeAt(index);
                    hex += (code < 16 ? '0' : '') + code.toString(16).toUpperCase() + ' ';
                    text += code >= 32 && code < 127 ? bytes.charAt(index) : '.';
                } else {
                    hex += '   ';
                }
                if (index === 7)
                    hex += ' ';
            }
            this.write((address + line).toString(16).toUpperCase() + ': ' + hex + ' ' + text + '\n');
        }
    };

    System.prototype.words = function (list) {
        var names = [];
        for (var index = list.list.length - 1; index >= 0; --index) {
            var word = list.list[index];
            if (!word.hidden && word.name.length > 0 && word.find !== false && list.find(word.key) === word)
                names.push(word.name);
        }
        var line = '';
        var self = this;
        names.forEach(function (name) {
            if (line.length > 0 && line.length + name.length + 1 > 79) {
                self.write(line + '\n');
                line = '';
            }
            line += (line.length > 0 ? ' ' : '') + name;
        });
        this.write(line + '\n');
    };

    var ENVIRONMENT = {
        '/COUNTED-STRING': [255], '/HOLD': [layout.HOLD_END - layout.HOLD_START], '/PAD': [layout.PAD_SIZE],
        'ADDRESS-UNIT-BITS': [8], 'FLOORED': [-1], 'MAX-CHAR': [255], 'MAX-N': [i64.make(0x7FFFFFFF, -1)],
        'MAX-U': [-1], 'MAX-D': [-1, i64.make(0x7FFFFFFF, -1)], 'MAX-UD': [-1, -1],
        'RETURN-STACK-CELLS': [65536], 'STACK-CELLS': [65536], 'FLOATING-STACK': [65536], '#LOCALS': [256],
        'WORDLISTS': [1024], 'XCHAR-ENCODING': []
    };

    // --- Installation

    Forth.installWords = function (system) {
        Forth.installCoreWords(system);
        var nativeWord = function (name, body, options) { return native(system, name, body, options); };
        var immediate = function (name, body) { return native(system, name, body, { immediate: true }); };
        var compiler = function (name, body) { return native(system, name, body, { immediate: true, compileOnly: true }); };
        var def = function () { return system.requireDefinition(); };
        var pop = function () { return system.pop(); };
        var push = function (value) { system.push(value); };
        var num = function (value) { return system.number(value); };
        var memory = system.m;
        var OVER = wordNamed(system, 'OVER'), EQUALS = wordNamed(system, '='), DROP = wordNamed(system, 'DROP');

        // A word that does nothing until DEFER is set.
        var unset = new Forth.Word(system, '(defer)', 'native');
        unset.fn = function () { throw new ForthError(-21, 'Deferred word is not set'); };

        // Control structures
        compiler('IF', function () { system.ifForward('zero'); });
        compiler('AHEAD', function () { system.ifForward(null); });
        compiler('THEN', function () { system.resolveOrig(); });
        compiler('ENDIF', function () { system.resolveOrig(); });
        compiler('ELSE', function () {
            system.ifForward(null);
            system.csRoll(1);
            system.resolveOrig();
        });
        compiler('BEGIN', function () { system.markDest(); });
        compiler('UNTIL', function () { system.resolveDest('zero'); });
        compiler('AGAIN', function () { system.resolveDest(null); });
        compiler('WHILE', function () {
            system.ifForward('zero');
            system.csRoll(1);
        });
        compiler('REPEAT', function () {
            system.resolveDest(null);
            system.resolveOrig();
        });
        var doLoop = function (check) {
            var definition = def();
            var loop = definition.newLoop();
            definition.add({ k: 'do', loop: loop, check: check });
            definition.cf.push({ kind: 'do', loop: loop });
        };
        compiler('DO', function () { doLoop(false); });
        compiler('?DO', function () { doLoop(true); });
        var endLoop = function (plus) {
            var entry = system.cfPop('do');
            def().add({ k: 'loop', loop: entry.loop, plus: plus });
            def().add({ k: 'label', id: entry.loop.exit });
        };
        compiler('LOOP', function () { endLoop(false); });
        compiler('+LOOP', function () { endLoop(true); });
        compiler('LEAVE', function () { def().add({ k: 'leave', loop: system.loopAt(0) }); });
        compiler('UNLOOP', function () { system.loopAt(0); });
        compiler('I', function () { def().add({ k: 'index', loop: system.loopAt(0) }); });
        compiler('J', function () { def().add({ k: 'index', loop: system.loopAt(1) }); });
        compiler('K', function () { def().add({ k: 'index', loop: system.loopAt(2) }); });
        compiler('RECURSE', function () { def().add({ k: 'call', word: def().word }); });
        compiler('CASE', function () { def().cf.push({ kind: 'case' }); });
        compiler('OF', function () {
            var definition = def();
            definition.add({ k: 'call', word: OVER });
            definition.add({ k: 'call', word: EQUALS });
            system.ifForward('zero');
            definition.add({ k: 'call', word: DROP });
        });
        compiler('ENDOF', function () {
            system.ifForward(null);
            system.csRoll(1);
            system.resolveOrig();
        });
        compiler('ENDCASE', function () {
            var definition = def();
            definition.add({ k: 'call', word: DROP });
            while (definition.cf.length > 0 && definition.cf[definition.cf.length - 1].kind === 'orig')
                system.resolveOrig();
            system.cfPop('case');
        });
        immediate('CS-PICK', function () { system.csPick(num(pop())); });
        immediate('CS-ROLL', function () { system.csRoll(num(pop())); });
        Forth.customWord(system, 'EXIT', function (lowering) {
            lowering.flushCall();
            lowering.emit(J.ret(J.id('sp')));
        }, { compileOnly: true });

        // Definitions
        nativeWord(':', function () {
            var word = new Forth.Word(system, system.parseNameText(), 'colon');
            system.beginDefinition(word, ':');
        });
        nativeWord(':NONAME', function () {
            system.beginDefinition(new Forth.Word(system, '', 'colon'), 'noname');
        });
        compiler(';', function () {
            var definition = def();
            var kind = definition.kind === 'does' ? definition.main.kind : definition.kind;
            if (kind === 'quotation')
                throw new ForthError(-22);
            var word = system.finishDefinition();
            if (kind === 'noname')
                push(system.xtOf(word));
        });
        compiler('[:', function () {
            system.beginDefinition(new Forth.Word(system, '', 'colon'), 'quotation');
        });
        compiler(';]', function () {
            if (def().kind !== 'quotation')
                throw new ForthError(-22);
            var word = system.finishDefinition();
            def().add({ k: 'lit', value: system.xtOf(word) });
        });
        compiler('DOES>', function () {
            var definition = def();
            if (definition.cf.length > 0 || definition.kind === 'does')
                throw new ForthError(-22);
            var ref = { fn: null, gen: null, async: false };
            definition.add({ k: 'does', ref: ref });
            definition.doesRef = ref;
            var part = new Forth.Definition(system, new Forth.Word(system, '', 'colon'), 'does');
            part.main = definition;
            system.definition = part;
        });
        immediate('[', function () { system.setCompiling(false); });
        nativeWord(']', function () {
            def();
            system.setCompiling(true);
        });
        compiler('LITERAL', function () { def().add({ k: 'lit', value: pop() }); });
        compiler('2LITERAL', function () {
            var hi = pop(), lo = pop();
            def().add({ k: 'lit', value: lo });
            def().add({ k: 'lit', value: hi });
        });
        compiler('FLITERAL', function () { def().add({ k: 'flit', value: system.popFloat() }); });
        compiler('SLITERAL', function () {
            var length = pop(), address = pop();
            var bytes = system.text(address, length);
            def().add({ k: 'lit', value: system.literalString(bytes) });
            def().add({ k: 'lit', value: bytes.length });
        });
        compiler('POSTPONE', function () {
            var word = system.findOrFail(system.parseNameText());
            if (word.immediate) {
                def().add({ k: 'call', word: word });
                return;
            }
            var xt = word.xt;
            code(system, function (lowering) {
                lowering.flushCall();
                lowering.emitExpr(J.call(lowering.helper('compileXt'), [J.num(xt)]));
            });
        });
        compiler('[COMPILE]', function () {
            def().add({ k: 'call', word: system.findOrFail(system.parseNameText()) });
        });
        nativeWord('COMPILE,', function () { system.compileXt(pop()); });
        nativeWord('IMMEDIATE', function () {
            if (system.latest !== null)
                system.latest.immediate = true;
        });
        nativeWord('COMPILE-ONLY', function () {
            if (system.latest !== null)
                system.latest.compileOnly = true;
        });
        nativeWord('RESTRICT', function () {
            if (system.latest !== null)
                system.latest.compileOnly = true;
        });

        // Words with data
        var created = function (kind, size, alignment) {
            if (alignment)
                system.align();
            var word = system.defineNext(kind);
            word.body = system.here();
            if (size > 0) {
                system.allot(size);
                memory.fill(word.body, size, 0);
            }
            return word;
        };
        nativeWord('CREATE', function () {
            system.makeCreated(created('create', 0, true));
        });
        nativeWord('VARIABLE', function () {
            system.makeCreated(created('create', 8, true));
        });
        nativeWord('2VARIABLE', function () {
            system.makeCreated(created('create', 16, true));
        });
        nativeWord('FVARIABLE', function () {
            system.makeCreated(created('create', 8, true));
        });
        nativeWord('BUFFER:', function () {
            var size = system.count(pop());
            system.makeCreated(created('create', size, true));
        });
        nativeWord('CONSTANT', function () {
            var value = pop();
            Forth.constantWord(system, system.parseNameText(), value);
        });
        nativeWord('2CONSTANT', function () {
            var hi = pop(), lo = pop();
            var word = system.defineNext('2constant');
            word.value = [lo, hi];
            word.fn = function (sp) {
                system.S[++sp] = lo;
                system.S[++sp] = hi;
                return sp;
            };
        });
        nativeWord('FCONSTANT', function () {
            var value = system.popFloat();
            var word = system.defineNext('fconstant');
            word.value = value;
            word.fn = function (sp) {
                system.FS[++system.fp] = value;
                return sp;
            };
        });
        nativeWord('VALUE', function () {
            var value = pop();
            var word = created('value', 8, true);
            memory.setCell(word.body, value);
            var body = word.body;
            word.fn = function (sp) {
                system.S[++sp] = memory.cell(body);
                return sp;
            };
        });
        nativeWord('2VALUE', function () {
            var hi = pop(), lo = pop();
            var word = created('2value', 16, true);
            var body = word.body;
            memory.setCell(body, hi);
            memory.setCell(body + 8, lo);
            word.fn = function (sp) {
                system.S[++sp] = memory.cell(body + 8);
                system.S[++sp] = memory.cell(body);
                return sp;
            };
        });
        nativeWord('FVALUE', function () {
            var value = system.popFloat();
            var word = created('fvalue', 8, true);
            var body = word.body;
            memory.setFloat(body, value);
            word.fn = function (sp) {
                system.FS[++system.fp] = memory.float(body);
                return sp;
            };
        });
        nativeWord('DEFER', function () {
            var word = created('defer', 8, true);
            var body = word.body;
            memory.setCell(body, unset.xt);
            word.fn = function (sp) {
                return system.execute(memory.cell(body), sp);
            };
        });
        var deferBody = function (word) {
            while (word.kind === 'alias')
                word = word.target;
            if (word.kind !== 'defer')
                throw new ForthError(-32);
            return word.body;
        };
        nativeWord('DEFER@', function () { push(memory.cell(deferBody(system.wordOf(pop())))); });
        nativeWord('DEFER!', function () {
            var word = system.wordOf(pop());
            memory.setCell(deferBody(word), pop());
        });

        // TO, +TO, IS, ACTION-OF: when compiling, a store in the definition.
        var store = function (word, plus) {
            while (word.kind === 'alias')
                word = word.target;
            var body = word.body;
            switch (word.kind) {
            case 'value':
                return function (lowering) {
                    var value = lowering.cell(lowering.popData());
                    var target = J.num(body);
                    if (plus)
                        value = lowering.i64('+', lowering.value(lowering.memory('cell', [target])).e, value);
                    lowering.emitExpr(lowering.memory('setCell', [target, value]));
                };
            case '2value':
                return function (lowering) {
                    var hi = lowering.cell(lowering.popData()), lo = lowering.cell(lowering.popData());
                    lowering.emitExpr(lowering.memory('setCell', [J.num(body), hi]));
                    lowering.emitExpr(lowering.memory('setCell', [J.num(body + 8), lo]));
                };
            case 'fvalue':
                return function (lowering) {
                    var value = lowering.popFloat().e;
                    if (plus)
                        value = J.bin('+', lowering.memory('float', [J.num(body)]), value);
                    lowering.emitExpr(lowering.memory('setFloat', [J.num(body), value]));
                };
            case 'defer':
                return function (lowering) {
                    lowering.emitExpr(lowering.memory('setCell', [J.num(body), lowering.cell(lowering.popData())]));
                };
            }
            throw new ForthError(-32, 'Invalid name argument: ' + utf8.decode(word.name));
        };
        var storeNow = function (word, plus) {
            while (word.kind === 'alias')
                word = word.target;
            var body = word.body;
            switch (word.kind) {
            case 'value':
                var value = pop();
                memory.setCell(body, plus ? i64.add(memory.cell(body), value) : value);
                return;
            case '2value':
                memory.setCell(body, pop());
                memory.setCell(body + 8, pop());
                return;
            case 'fvalue':
                var number = system.popFloat();
                memory.setFloat(body, plus ? memory.float(body) + number : number);
                return;
            case 'defer':
                memory.setCell(body, pop());
                return;
            }
            throw new ForthError(-32, 'Invalid name argument: ' + utf8.decode(word.name));
        };
        var assign = function (plus) {
            return function () {
                var target = system.findTarget();
                if (target.local !== undefined) {
                    def().add({ k: 'to-local', local: target.local, plus: plus });
                    return;
                }
                if (system.compiling() && system.definition !== null) {
                    var gen = store(target.word, plus);
                    code(system, gen);
                } else {
                    storeNow(target.word, plus);
                }
            };
        };
        immediate('TO', assign(false));
        immediate('+TO', assign(true));
        immediate('IS', function () {
            var target = system.findTarget();
            if (target.word === undefined || deferBody(target.word) === 0)
                throw new ForthError(-32);
            if (system.compiling() && system.definition !== null)
                code(system, store(target.word, false));
            else
                storeNow(target.word, false);
        });
        immediate('ACTION-OF', function () {
            var target = system.findTarget();
            var body = deferBody(target.word);
            if (system.compiling() && system.definition !== null)
                code(system, function (lowering) {
                    lowering.pushData(lowering.value(lowering.memory('cell', [J.num(body)])));
                });
            else
                push(memory.cell(body));
        });

        nativeWord('MARKER', function () {
            var word = system.defineNext('native');
            var count = system.xts.length - 1;
            var dp = system.here();
            var order = system.order.slice();
            var current = system.current;
            word.fn = function (sp) {
                for (var index = system.xts.length - 1; index >= count; --index) {
                    var forgotten = system.xts[index];
                    if (forgotten.wordlist !== null) {
                        forgotten.wordlist.remove(forgotten);
                        forgotten.wordlist = null;
                    }
                }
                system.dp = dp;
                system.literals.forEach(function (address, bytes) {
                    if (address >= dp)
                        system.literals.delete(bytes);
                });
                system.order = order.slice();
                system.current = current;
                return sp;
            };
        });
        nativeWord('SYNONYM', function () {
            var name = system.parseNameText();
            var target = system.findOrFail(system.parseNameText());
            var word = system.define(name, 'alias');
            word.target = target;
            word.immediate = target.immediate;
            word.compileOnly = target.compileOnly;
        });

        // Structures (Forth 2012)
        var field = function (name, offset) {
            var word = system.define(name, 'field');
            word.value = offset;
            word.fn = function (sp) {
                var base = system.S[sp];
                system.S[sp] = typeof base === 'number' && typeof offset === 'number' ? base + offset : i64.add(base, offset);
                return sp;
            };
        };
        nativeWord('+FIELD', function () {
            var size = pop(), offset = pop();
            field(system.parseNameText(), offset);
            push(i64.add(offset, size));
        });
        var typedField = function (size, alignment) {
            return function () {
                var offset = system.aligned(pop(), alignment);
                field(system.parseNameText(), offset);
                push(offset + size);
            };
        };
        nativeWord('FIELD:', typedField(8, 8));
        nativeWord('CFIELD:', typedField(1, 1));
        nativeWord('FFIELD:', typedField(8, 8));
        nativeWord('DFFIELD:', typedField(8, 8));
        nativeWord('SFFIELD:', typedField(4, 4));
        nativeWord('BEGIN-STRUCTURE', function () {
            var word = Forth.constantWord(system, system.parseNameText(), 0);
            push(word.xt);
            push(0);
        });
        nativeWord('END-STRUCTURE', function () {
            var size = pop();
            var word = system.wordOf(pop());
            word.value = size;
            word.fn = function (sp) {
                system.S[++sp] = size;
                return sp;
            };
        });

        // Input parsing and the interpreter
        nativeWord("'", function () { push(system.xtOf(system.findOrFail(system.parseNameText()))); });
        compiler("[']", function () {
            def().add({ k: 'lit', value: system.xtOf(system.findOrFail(system.parseNameText())) });
        });
        var firstChar = function () {
            var name = system.parseNameText();
            return utf8.decodeRune(name, 0)[0];
        };
        nativeWord('CHAR', function () { push(firstChar()); });
        compiler('[CHAR]', function () { def().add({ k: 'lit', value: firstChar() }); });
        immediate('S"', function () { system.stringLiteral(system.parseText(34)); });
        immediate('S\\"', function () { system.stringLiteral(system.parseEscaped()); });
        immediate('C"', function () {
            var bytes = system.parseText(34);
            var address = system.literalString(String.fromCharCode(Math.min(bytes.length, 255)) + bytes);
            if (system.compiling() && system.definition !== null)
                def().add({ k: 'lit', value: address });
            else
                push(address);
        });
        var writeLiteral = function (bytes) {
            if (system.compiling() && system.definition !== null)
                code(system, function (lowering) {
                    lowering.emitExpr(J.call(lowering.helper('writeBytes'), [J.str(bytes)]));
                });
            else
                system.write(bytes);
        };
        immediate('."', function () { writeLiteral(system.parseText(34)); });
        immediate('.\\"', function () { writeLiteral(system.parseEscaped()); });
        immediate('.(', function () { system.write(system.parseText(41)); });
        immediate('(', function () { system.parseMultiline(41); });
        immediate('\\', function () { system.setToIn(system.input.length); });
        compiler('ABORT"', function () {
            var bytes = system.parseText(34);
            code(system, function (lowering) {
                var flag = lowering.popData();
                lowering.flushCall();
                lowering.emit(J.if_(lowering.test(flag),
                                    J.expr(J.call(lowering.helper('abortQuote'), [J.str(bytes)]))));
            });
        });
        nativeWord('ABORT', function () { throw new ForthError(-1); });
        nativeWord('BYE', function () { throw new Forth.ForthExit(); });
        nativeWord('QUIT', function () { throw new Forth.ForthExit(); });
        Forth.prim(system, 'THROW', [1, 0], function (lowering, errorCode) {
            lowering.emitExpr(J.call(lowering.helper('throwCode'), [errorCode]));
            return [];
        });
        Forth.customWord(system, 'CATCH', function (lowering) {
            lowering.flushCall();
            var call = J.call(lowering.helper(lowering.async ? 'catchXtGen' : 'catchXt'), [J.id('sp')]);
            lowering.emitExpr(J.assign(J.id('sp'), lowering.async ? J.yield_(call, true) : call));
        }, { dynamic: true }).fn = function (sp) { return system.catchXt(sp); };
        var catchWord = wordNamed(system, 'CATCH');
        catchWord.gen = function* (sp) {
            sp = yield* system.catchXtGen(sp);
            return sp;
        };
        Forth.customWord(system, 'EXECUTE', function (lowering) {
            lowering.executeTop();
        }, { dynamic: true }).fn = function (sp) {
            return system.execute(system.S[sp], sp - 1);
        };
        var executeWord = wordNamed(system, 'EXECUTE');
        executeWord.gen = function* (sp) {
            sp = yield* system.executeGen(system.S[sp], sp - 1);
            return sp;
        };
        // EXECUTE and CATCH from the interpreter may wait: a generator when
        // words that wait exist.
        Object.defineProperty(executeWord, 'async', { get: function () { return system.anyAsync; }, set: function () {} });
        Object.defineProperty(catchWord, 'async', { get: function () { return system.anyAsync; }, set: function () {} });

        nativeWord('EVALUATE', function () {
            var length = pop(), address = pop();
            system.interpretNow(system.evaluateInput(num(address), num(length)));
        }, {
            gen: function* () {
                var length = pop(), address = pop();
                yield* system.interpretInput(system.evaluateInput(num(address), num(length)));
            }
        });
        var including = function (bytesOf) {
            return {
                body: function () {
                    var input = system.includeInput(bytesOf()).input;
                    system.interpretNow(input);
                },
                gen: function* () {
                    var input = system.includeInput(bytesOf()).input;
                    yield* system.interpretInput(input);
                }
            };
        };
        var requiring = function (bytesOf) {
            return {
                body: function () {
                    var input = system.requireInput(bytesOf());
                    if (input !== null)
                        system.interpretNow(input);
                },
                gen: function* () {
                    var input = system.requireInput(bytesOf());
                    if (input !== null)
                        yield* system.interpretInput(input);
                }
            };
        };
        var stringArgument = function () {
            var length = pop(), address = pop();
            return system.text(address, length);
        };
        var nameArgument = function () { return system.parseNameText(); };
        [['INCLUDED', including(stringArgument)], ['INCLUDE', including(nameArgument)],
         ['REQUIRED', requiring(stringArgument)], ['REQUIRE', requiring(nameArgument)]].forEach(function (item) {
            nativeWord(item[0], item[1].body, { gen: item[1].gen });
        });
        nativeWord('SOURCE', function () {
            push(system.input.address);
            push(system.input.length);
        });
        nativeWord('SOURCE-ID', function () { push(system.input.id); });
        nativeWord('REFILL', function () { push(system.refill() ? -1 : 0); });
        nativeWord('SAVE-INPUT', function () {
            push(system.input.line);
            push(system.toIn());
            push(2);
        });
        nativeWord('RESTORE-INPUT', function () {
            var count = num(pop());
            var values = [];
            for (var index = 0; index < count; ++index)
                values.push(pop());
            var input = system.input;
            if (count !== 2) {
                push(-1);
                return;
            }
            var line = num(values[1]);
            if (input.kind === 'file' && line !== input.line) {
                input.line = line;
                system.loadLine(input);
            }
            system.setToIn(values[0]);
            push(0);
        });
        nativeWord('PARSE', function () {
            var token = system.parse(num(pop()) & 255);
            push(token.address);
            push(token.length);
        });
        nativeWord('PARSE-NAME', function () {
            var token = system.parseName();
            push(token.address);
            push(token.length);
        });
        nativeWord('WORD', function () {
            var delimiter = num(pop()) & 255;
            var input = system.input;
            var U8 = memory.U8;
            var start = input.address, end = input.address + input.length;
            var at = start + Math.min(system.toIn(), input.length);
            var skip = function (code) { return delimiter === 32 ? code <= 32 : code === delimiter; };
            while (at < end && skip(U8[at]))
                ++at;
            var begin = at;
            while (at < end && !skip(U8[at]))
                ++at;
            system.setToIn(Math.min(at + 1, end) - start);
            var bytes = memory.bytes(begin, Math.min(at - begin, 255));
            memory.writeBytes(layout.WORD_BUFFER, String.fromCharCode(bytes.length) + bytes + ' ');
            push(layout.WORD_BUFFER);
        });
        var findResult = function (word) {
            if (word === null)
                return false;
            push(system.xtOf(word));
            push(word.immediate ? 1 : -1);
            return true;
        };
        nativeWord('FIND', function () {
            var address = pop();
            var name = system.text(num(address) + 1, memory.byte(address));
            if (!findResult(system.findWord(name))) {
                push(address);
                push(0);
            }
        });
        nativeWord('SEARCH-WORDLIST', function () {
            var list = system.wordlistOf(pop());
            var length = pop(), address = pop();
            if (!findResult(list.find(Forth.key(system.text(address, length)))))
                push(0);
        });
        nativeWord('FIND-NAME', function () {
            var length = pop(), address = pop();
            var word = system.findWord(system.text(address, length));
            push(word === null ? 0 : word.xt);
        });
        nativeWord('>BODY', function () {
            var word = system.wordOf(pop());
            while (word.kind === 'alias')
                word = word.target;
            if (word.body === 0)
                throw new ForthError(-31);
            push(word.body);
        });
        nativeWord('NAME>STRING', function () {
            var word = system.wordOf(pop());
            push(system.nameString(word));
            push(word.name.length);
        });
        nativeWord('NAME>INTERPRET', function () {
            push(system.wordOf(pop()).xt);
        });
        nativeWord('NAME>COMPILE', function () {
            var word = system.wordOf(pop());
            push(word.xt);
            push(word.immediate ? wordNamed(system, 'EXECUTE').xt : wordNamed(system, 'COMPILE,').xt);
        });
        nativeWord('>NAME', function () { push(system.wordOf(pop()).xt); });
        nativeWord('LATESTXT', function () { push(system.latest === null ? 0 : system.latest.xt); });
        nativeWord('LATEST', function () { push(system.latest === null ? 0 : system.latest.xt); });
        nativeWord('TRAVERSE-WORDLIST', function () {
            var list = system.wordlistOf(pop());
            var xt = pop();
            for (var index = list.list.length - 1; index >= 0; --index) {
                var word = list.list[index];
                if (word.hidden || list.find(word.key) !== word)
                    continue;
                push(word.xt);
                system.sp = system.execute(xt, system.sp);
                if (pop() === 0)
                    break;
            }
        });
        immediate('[IF]', function () {
            if (pop() === 0)
                system.skipConditional(true);
        });
        immediate('[ELSE]', function () { system.skipConditional(false); });
        immediate('[THEN]', function () {});
        immediate('[DEFINED]', function () { push(system.findWord(system.parseNameText()) !== null ? -1 : 0); });
        immediate('[UNDEFINED]', function () { push(system.findWord(system.parseNameText()) === null ? -1 : 0); });

        // Locals: {: a b | c -- d :}, { a b -- c } (gforth), LOCALS| b a |
        var locals = function (terminator) {
            return function () {
                var definition = def();
                var list = [];
                var mode = 'args';
                var float = false;
                for (;;) {
                    var token = system.parseName();
                    if (token.length === 0) {
                        if (!system.refill())
                            throw new ForthError(-22, 'Locals without ' + terminator);
                        continue;
                    }
                    var name = memory.bytes(token.address, token.length);
                    var key = Forth.key(name);
                    if (key === terminator)
                        break;
                    if (mode === 'comment')
                        continue;
                    if (key === '|') {
                        mode = 'uninitialized';
                        continue;
                    }
                    if (key === '--') {
                        mode = 'comment';
                        continue;
                    }
                    if (key === 'F:') {
                        float = true;
                        continue;
                    }
                    if (key === 'W:') {
                        float = false;
                        continue;
                    }
                    var local = definition.addLocal(name, float);
                    float = false;
                    if (mode === 'args')
                        list.push(local);
                }
                if (list.length > 0)
                    definition.add({ k: 'locals', list: list });
            };
        };
        compiler('{:', locals(':}'));
        compiler('{', locals('}'));
        compiler('LOCALS|', function () {
            var definition = def();
            var list = [];
            for (;;) {
                var name = system.parseNameText();
                if (name === '|')
                    break;
                list.unshift(definition.addLocal(name, false));
            }
            if (list.length > 0)
                definition.add({ k: 'locals', list: list });
        });

        // Search order
        nativeWord('FORTH-WORDLIST', function () { push(system.forth.id); });
        nativeWord('WORDLIST', function () { push(new Forth.Wordlist(system, '').id); });
        nativeWord('GET-CURRENT', function () { push(system.current.id); });
        nativeWord('SET-CURRENT', function () { system.current = system.wordlistOf(pop()); });
        nativeWord('DEFINITIONS', function () { system.current = system.order[system.order.length - 1]; });
        nativeWord('GET-ORDER', function () {
            system.order.forEach(function (list) { push(list.id); });
            push(system.order.length);
        });
        nativeWord('SET-ORDER', function () {
            var count = num(pop());
            if (count === -1) {
                system.order = [system.forth];
                return;
            }
            var order = [];
            for (var index = 0; index < count; ++index)
                order.unshift(system.wordlistOf(pop()));
            system.order = order;
        });
        nativeWord('ALSO', function () {
            if (system.order.length === 0)
                throw new ForthError(-50);
            system.order.push(system.order[system.order.length - 1]);
        });
        nativeWord('>ORDER', function () { system.order.push(system.wordlistOf(pop())); });
        nativeWord('ONLY', function () { system.order = [system.forth]; });
        nativeWord('PREVIOUS', function () {
            if (system.order.length === 0)
                throw new ForthError(-50);
            system.order.pop();
        });
        nativeWord('FORTH', function () {
            if (system.order.length === 0)
                system.order.push(system.forth);
            else
                system.order[system.order.length - 1] = system.forth;
        });
        nativeWord('VOCABULARY', function () {
            var word = system.defineNext('native');
            var list = new Forth.Wordlist(system, utf8.decode(word.name));
            word.body = 0;
            word.fn = function (sp) {
                if (system.order.length === 0)
                    system.order.push(list);
                else
                    system.order[system.order.length - 1] = list;
                return sp;
            };
            word.wordlistId = list.id;
        });
        nativeWord('ORDER', function () {
            var names = system.order.slice().reverse().map(function (list) { return list.name || ('#' + list.id); });
            system.write(names.join(' ') + '   ' + (system.current.name || ('#' + system.current.id)) + '\n');
        });

        // Strings
        nativeWord('COMPARE', function () {
            var length2 = pop(), address2 = pop(), length1 = pop(), address1 = pop();
            var text1 = system.text(address1, length1), text2 = system.text(address2, length2);
            push(text1 === text2 ? 0 : (text1 < text2 ? -1 : 1));
        });
        nativeWord('SEARCH', function () {
            var length2 = pop(), address2 = pop(), length1 = pop(), address1 = pop();
            var text1 = system.text(address1, length1), text2 = system.text(address2, length2);
            var index = text1.indexOf(text2);
            if (index < 0) {
                push(address1);
                push(length1);
                push(0);
            } else {
                push(num(address1) + index);
                push(num(length1) - index);
                push(-1);
            }
        });
        Forth.prim(system, '/STRING', [3, 2], function (lowering, address, length, count) {
            return [lowering.i64('+', address, count), lowering.i64('-', length, count)];
        });
        nativeWord('-TRAILING', function () {
            var length = num(pop()), address = num(system.S[system.sp]);
            while (length > 0 && memory.byte(address + length - 1) === 32)
                --length;
            push(length);
        });
        Forth.prim(system, 'TOUPPER', [1, 1], function (lowering, ch) {
            return [J.cond(J.and(J.bin('>=', ch, J.num(97)), J.bin('<=', ch, J.num(122))), J.bin('-', ch, J.num(32)), ch)];
        });

        // Heap
        nativeWord('ALLOCATE', function () {
            var address = memory.allocate(system.count(pop()));
            push(address);
            push(address === 0 ? -59 : 0);
        });
        nativeWord('FREE', function () { push(memory.free(num(pop())) ? 0 : -60); });
        nativeWord('RESIZE', function () {
            var size = system.count(pop()), address = num(pop());
            var moved = memory.resize(address, size);
            push(moved > 0 ? moved : address);
            push(moved > 0 ? 0 : -61);
        });

        // Time, keyboard, screen
        nativeWord('MS', function () {
            var milliseconds = num(pop());
            var until = Date.now() + Math.max(0, milliseconds);
            while (Date.now() < until) {
                // A word that cannot give up control: it waits in a busy
                // loop (the watchdog interrupts one that is too long).
            }
        }, {
            gen: function* () {
                var milliseconds = num(pop());
                system.env.scheduler.sleep(Math.max(0, milliseconds));
                yield;
            }
        });
        nativeWord('TIME&DATE', function () {
            var now = new Date();
            [now.getSeconds(), now.getMinutes(), now.getHours(), now.getDate(), now.getMonth() + 1,
             now.getFullYear()].forEach(push);
        });
        nativeWord('UTIME', function () {
            push(Date.now() * 1000);
            push(0);
        });
        nativeWord('PAGE', function () {
            system.flushOutput();
            system.env.clear();
        });
        nativeWord('AT-XY', function () {
            pop();
            pop();
        });

        // Standard input of the host: KEY takes bytes of the current line
        // (UTF-8, the line break as 10), 4 (end of transmission) at the end
        // of input; ACCEPT takes the rest of the line or the next one.
        var keys = '';
        function nextLine() {
            system.flushOutput();
            var line = system.env.input.readLine();
            return line === null ? null : utf8.encode(line + '\n');
        }
        nativeWord('KEY', function () {
            if (keys.length === 0) {
                var line = nextLine();
                if (line === null) {
                    push(4);
                    return;
                }
                keys = line;
            }
            push(keys.charCodeAt(0));
            keys = keys.substring(1);
        });
        nativeWord('KEY?', function () { push(keys.length > 0 || system.env.input.isReady() ? -1 : 0); });
        nativeWord('ACCEPT', function () {
            var length = system.count(pop()), address = pop();
            var line = keys.length > 0 ? keys : nextLine();
            keys = '';
            var bytes = line === null ? '' : line.replace(/\n$/, '').substring(0, length);
            system.m.writeBytes(address, bytes);
            push(bytes.length);
        });

        // Tools
        nativeWord('WORDS', function () { system.words(system.order[system.order.length - 1] || system.forth); });
        nativeWord('DUMP', function () {
            var length = pop();
            system.dump(pop(), length);
        });
        nativeWord('ENVIRONMENT?', function () {
            var length = pop(), address = pop();
            var value = ENVIRONMENT[Forth.key(system.text(address, length))];
            if (value === undefined) {
                push(0);
                return;
            }
            value.forEach(push);
            push(-1);
        });

        Forth.installJsWords(system);
    };

})(globalThis);
