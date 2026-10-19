// Forth: the system - the dictionary and word lists, input sources, the
// text interpreter, numbers, compiling definitions, output and the helpers
// of the translated code ($F). One system per session: the dictionary and
// the memory are shared by all Forth units.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Forth = T.forth;
    if (Forth.System)
        return;

    var layout = Forth.layout;
    var ForthError = Forth.ForthError;
    var cells = Forth.cells;
    var i64 = T.i64, u64 = T.u64, big = T.big, utf8 = T.utf8;

    var XT_BASE = 4294967296;
    var EMPTY = Forth.STACK_EMPTY;
    var LIMIT = Forth.STACK_LIMIT;
    var STACK_SIZE = LIMIT + 1024;
    var MAX_INCLUDE_DEPTH = 64;

    // --- A word

    function Word(system, name, kind) {
        this.name = name;                 // UTF-8 bytes
        this.key = Forth.key(name);
        this.kind = kind;
        this.xt = XT_BASE + system.xts.length;
        system.xts.push(this);
        this.immediate = false;
        this.compileOnly = false;
        this.hidden = false;
        this.fn = null;                   // function (sp) -> sp
        this.gen = null;                  // a generator if the word waits (MS)
        this.async = false;
        this.body = 0;                    // the data field of CREATE, VALUE...
        this.value = 0;                   // CONSTANT
        this.does = null;                 // { fn, gen, async } after DOES>
        this.prim = null;                 // the translation of a system word
        this.target = null;               // SYNONYM
        this.wordlist = null;
        this.definition = null;
    }
    Forth.Word = Word;

    function Wordlist(system, name) {
        this.id = system.wordlists.length + 1;
        this.name = name;
        this.words = Object.create(null); // key -> [words in order]
        this.list = [];
        system.wordlists.push(this);
    }

    Wordlist.prototype.find = function (key) {
        var list = this.words[key];
        if (list === undefined)
            return null;
        for (var index = list.length - 1; index >= 0; --index) {
            if (!list[index].hidden)
                return list[index];
        }
        return null;
    };

    Wordlist.prototype.add = function (word) {
        var list = this.words[word.key];
        if (list === undefined)
            list = this.words[word.key] = [];
        list.push(word);
        this.list.push(word);
        word.wordlist = this;
    };

    Wordlist.prototype.remove = function (word) {
        var list = this.words[word.key];
        if (list !== undefined) {
            var index = list.lastIndexOf(word);
            if (index >= 0)
                list.splice(index, 1);
        }
        var at = this.list.lastIndexOf(word);
        if (at >= 0)
            this.list.splice(at, 1);
    };

    // --- The definition being compiled

    function Definition(system, word, kind) {
        this.system = system;
        this.word = word;
        this.kind = kind;         // ':', 'noname', 'quotation', 'does', 'prim'
        this.ops = [];
        this.cf = [];             // the control-flow stack: orig, dest, do, case
        this.labels = 0;
        this.loopCount = 0;
        this.locals = [];
        this.scope = Object.create(null);
        this.source = system.sourceName();
        this.line = system.lineNumber();
        this.endLine = this.line;
        this.async = false;
        this.primitive = false;
        this.main = null;         // for the part after DOES>
        this.doesRef = null;
        this.savedState = 0;
    }

    Definition.prototype.add = function (op) {
        op.line = this.system.lineNumber();
        op.source = this.system.sourceName();
        this.ops.push(op);
        return op;
    };

    Definition.prototype.newLabel = function () {
        return ++this.labels;
    };

    Definition.prototype.newLoop = function () {
        return { id: ++this.loopCount, top: this.newLabel(), exit: this.newLabel() };
    };

    Definition.prototype.addLocal = function (name, float) {
        var local = { name: name, key: Forth.key(name), js: '$a' + (this.locals.length + 1), float: !!float };
        this.locals.push(local);
        this.scope[local.key] = local;
        return local;
    };

    Forth.Definition = Definition;

    // --- An input source: a file (a unit, a host file) by lines or an
    // EVALUATE string in memory.

    function Input(kind, name, id) {
        this.kind = kind;
        this.name = name;         // '' - the unit, otherwise the file name
        this.id = id;             // SOURCE-ID
        this.lines = null;
        this.line = -1;
        this.address = 0;
        this.length = 0;
        this.toIn = 0;
    }

    // --- The system

    function System(env) {
        this.env = env;
        this.m = new Forth.Memory();
        this.S = makeArray(STACK_SIZE);
        this.FS = makeArray(STACK_SIZE);
        this.R = makeArray(STACK_SIZE);
        this.sp = EMPTY;
        this.fp = EMPTY;
        this.rp = EMPTY;
        this.xts = [];
        this.wordlists = [];
        this.forth = new Wordlist(this, 'Forth');
        this.order = [this.forth];
        this.current = this.forth;
        this.dp = layout.DICTIONARY;
        this.definition = null;
        this.definitions = [];
        this.latest = null;
        this.inputs = [];
        this.input = null;
        this.fileIds = 0;
        this.output = '';
        this.transient = 0;
        this.transientHeap = [];
        this.literals = new Map();
        this.required = Object.create(null);
        this.anyAsync = false;
        this.index = 0;
        this.x = 0;
        this.hld = layout.HOLD_END;
        this.hooks = [];
        this.m.setCell(layout.BASE, 10);
        this.m.setCell(layout.PRECISION, 15);
        Forth.installWords(this);
    }
    Forth.System = System;

    function makeArray(size) {
        var array = new Array(size);
        for (var index = 0; index < size; ++index)
            array[index] = 0;
        return array;
    }

    // Before every run of a unit: empty stacks, interpretation, decimal
    // base, the default search order.
    System.prototype.reset = function () {
        this.sp = EMPTY;
        this.fp = EMPTY;
        this.rp = EMPTY;
        this.clearGuards();
        this.definition = null;
        this.definitions = [];
        this.inputs = [];
        this.input = null;
        this.output = '';
        this.hld = layout.HOLD_END;
        this.order = [this.forth];
        this.current = this.forth;
        this.m.setCell(layout.STATE, 0);
        this.m.setCell(layout.BASE, 10);
        this.m.setCell(layout.BLK, 0);
    };

    System.prototype.clearGuards = function () {
        for (var index = 0; index <= EMPTY; ++index) {
            this.S[index] = 0;
            this.FS[index] = 0;
            this.R[index] = 0;
        }
    };

    // --- Errors

    System.prototype.stackError = function (sp) {
        if (sp < EMPTY)
            throw new ForthError(-4);
        throw new ForthError(-3);
    };

    System.prototype.divisionByZero = function () {
        throw new ForthError(-10);
    };

    // After every word the interpreter executed.
    System.prototype.checkStacks = function () {
        if (this.sp < EMPTY || this.sp > LIMIT) {
            var underflow = this.sp < EMPTY;
            this.sp = EMPTY;
            this.clearGuards();
            throw new ForthError(underflow ? -4 : -3);
        }
        if (this.fp < EMPTY || this.fp > LIMIT) {
            var floatUnderflow = this.fp < EMPTY;
            this.fp = EMPTY;
            this.clearGuards();
            throw new ForthError(floatUnderflow ? -45 : -44);
        }
        if (this.rp < EMPTY || this.rp > LIMIT) {
            var returnUnderflow = this.rp < EMPTY;
            this.rp = EMPTY;
            this.clearGuards();
            throw new ForthError(returnUnderflow ? -6 : -5);
        }
    };

    // --- The data stack outside translated code

    System.prototype.push = function (value) {
        this.S[++this.sp] = value;
    };

    System.prototype.pop = function () {
        if (this.sp <= EMPTY)
            throw new ForthError(-4);
        return this.S[this.sp--];
    };

    System.prototype.pushFloat = function (value) {
        this.FS[++this.fp] = value;
    };

    System.prototype.popFloat = function () {
        if (this.fp <= EMPTY)
            throw new ForthError(-45);
        return this.FS[this.fp--];
    };

    // A number from a cell for JavaScript and counters.
    System.prototype.number = function (value) {
        return typeof value === 'number' ? value : i64.toFloat(value);
    };

    // A non-negative size or count: a negative one is an error.
    System.prototype.count = function (value) {
        var number = this.number(value);
        if (number < 0)
            throw new ForthError(-24);
        return number;
    };

    // --- The dictionary

    System.prototype.here = function () {
        return this.dp;
    };

    System.prototype.allot = function (count) {
        var target = this.dp + this.number(count);
        if (target > layout.DICTIONARY_END || target < layout.DICTIONARY)
            throw new ForthError(-8);
        if (!this.m.grow(target + 8))
            throw new ForthError(-8);
        this.dp = target;
    };

    System.prototype.align = function () {
        var aligned = (this.dp + 7) & ~7;
        if (aligned !== this.dp)
            this.allot(aligned - this.dp);
    };

    System.prototype.comma = function (value) {
        var address = this.dp;
        this.allot(8);
        this.m.setCell(address, value);
    };

    System.prototype.charComma = function (value) {
        var address = this.dp;
        this.allot(1);
        this.m.setByte(address, value);
    };

    // A new word in the current list (visible at once).
    System.prototype.define = function (name, kind) {
        if (name.length === 0)
            throw new ForthError(-16);
        var word = new Word(this, name, kind);
        this.current.add(word);
        this.latest = word;
        return word;
    };

    // The word whose name is next in the input.
    System.prototype.defineNext = function (kind) {
        return this.define(this.parseNameText(), kind);
    };

    System.prototype.findWord = function (name) {
        var key = Forth.key(name);
        for (var index = this.order.length - 1; index >= 0; --index) {
            var word = this.order[index].find(key);
            if (word !== null)
                return word;
        }
        return null;
    };

    System.prototype.findOrFail = function (name) {
        var word = this.findWord(name);
        if (word === null)
            throw new ForthError(-13, 'Undefined word: ' + utf8.decode(name));
        return word;
    };

    System.prototype.wordOf = function (xt) {
        var index = typeof xt === 'number' ? xt - XT_BASE : -1;
        var word = this.xts[index];
        if (word === undefined)
            throw new ForthError(-9);
        return word;
    };

    // The xt of a word that waits: now any EXECUTE may wait.
    System.prototype.xtOf = function (word) {
        if (this.isAsync(word))
            this.anyAsync = true;
        return word.xt;
    };

    System.prototype.isAsync = function (word) {
        while (word.kind === 'alias')
            word = word.target;
        if (word.kind === 'create')
            return word.does !== null && word.does.async;
        return !!word.async;
    };

    // The function of a word (sp) -> sp; system words are translated when
    // first executed.
    System.prototype.callable = function (word) {
        if (word.fn === null)
            this.prepare(word);
        return word.fn;
    };

    System.prototype.generator = function (word) {
        if (word.fn === null)
            this.prepare(word);
        return word.gen;
    };

    System.prototype.prepare = function (word) {
        if (word.kind === 'alias') {
            var target = word.target;
            word.fn = this.callable(target);
            word.gen = this.generator(target);
            word.async = this.isAsync(target);
            return;
        }
        if (word.kind !== 'prim')
            throw new ForthError(-21, 'Cannot execute ' + utf8.decode(word.name));
        var definition = new Definition(this, word, 'prim');
        definition.primitive = true;
        definition.add({ k: 'call', word: word });
        var made = Forth.compileDefinition(this, definition);
        word.fn = made.fn;
        word.gen = made.gen;
        word.async = made.async;
    };

    System.prototype.execute = function (xt, sp) {
        var word = this.wordOf(xt);
        return this.callable(word)(sp);
    };

    System.prototype.executeGen = function* (xt, sp) {
        var word = this.wordOf(xt);
        if (this.isAsync(word)) {
            sp = yield* this.generator(word)(sp);
            return sp;
        }
        return this.callable(word)(sp);
    };

    // Executes a word by the interpreter (this.sp).
    System.prototype.run = function* (word) {
        while (word.kind === 'alias')
            word = word.target;
        if (word.kind === 'defer')
            this.sp = yield* this.executeGen(this.m.cell(word.body), this.sp);
        else if (this.isAsync(word))
            this.sp = yield* this.generator(word)(this.sp);
        else
            this.sp = this.callable(word)(this.sp);
        this.checkStacks();
    };

    // DOES>: the behavior of the last CREATE word.
    System.prototype.setDoes = function (ref) {
        var word = this.latest;
        if (word === null || word.kind !== 'create')
            throw new ForthError(-31);
        word.does = ref;
        word.fn = null;
        word.gen = null;
        this.makeCreated(word);
    };

    System.prototype.makeCreated = function (word) {
        var stack = this.S;
        var body = word.body;
        var ref = word.does;
        if (ref === null) {
            word.fn = function (sp) {
                stack[++sp] = body;
                return sp;
            };
            word.gen = null;
            word.async = false;
            return;
        }
        word.fn = function (sp) {
            stack[++sp] = body;
            return ref.fn(sp);
        };
        word.gen = function* (sp) {
            stack[++sp] = body;
            sp = yield* ref.gen(sp);
            return sp;
        };
        word.async = ref.async;
    };

    // +LOOP: true - the loop ended (the index crossed the boundary between
    // limit - 1 and limit); the new index is in this.index.
    System.prototype.plusLoop = function (index, limit, step) {
        if (typeof index === 'number' && typeof limit === 'number' && typeof step === 'number') {
            var before = index - limit;
            var after = before + step;
            var next = index + step;
            if (next >= -i64.MAX_SAFE && next <= i64.MAX_SAFE && Math.abs(before) <= i64.MAX_SAFE &&
                Math.abs(after) <= i64.MAX_SAFE) {
                this.index = next;
                return (before < 0) !== (after < 0) && (before < 0) !== (step < 0);
            }
        }
        var difference = i64.sub(index, limit);
        var moved = i64.add(difference, step);
        this.index = i64.add(index, step);
        var sign = function (value) { return i64.lt(value, 0); };
        return sign(difference) !== sign(moved) && sign(difference) !== sign(step);
    };

    // --- Input

    System.prototype.sourceName = function () {
        for (var index = this.inputs.length - 1; index >= 0; --index) {
            if (this.inputs[index].kind === 'file')
                return this.inputs[index].name;
        }
        return '';
    };

    System.prototype.lineNumber = function () {
        for (var index = this.inputs.length - 1; index >= 0; --index) {
            if (this.inputs[index].kind === 'file')
                return this.inputs[index].line + 1;
        }
        return 0;
    };

    // The place for an error: a line of the unit or of a file.
    System.prototype.place = function () {
        return { line: this.lineNumber(), source: this.sourceName() };
    };

    System.prototype.toIn = function () {
        return this.number(this.m.cell(layout.TO_IN));
    };

    System.prototype.setToIn = function (value) {
        this.m.setCell(layout.TO_IN, value);
    };

    System.prototype.pushInput = function (input) {
        if (this.inputs.length >= MAX_INCLUDE_DEPTH)
            throw new ForthError(-29, 'Too many nested INCLUDE or EVALUATE');
        if (this.input !== null)
            this.input.toIn = this.toIn();
        this.inputs.push(input);
        this.input = input;
        this.setToIn(0);
    };

    System.prototype.popInput = function () {
        this.inputs.pop();
        this.input = this.inputs.length > 0 ? this.inputs[this.inputs.length - 1] : null;
        if (this.input !== null) {
            if (this.input.kind === 'file')
                this.loadLine(this.input);
            this.setToIn(this.input.toIn);
        }
    };

    // Input up to the depth depth (CATCH, an error).
    System.prototype.restoreInputs = function (depth) {
        while (this.inputs.length > depth)
            this.popInput();
    };

    System.prototype.fileInput = function (text, name) {
        var input = new Input('file', name, ++this.fileIds);
        input.lines = utf8.encode(text).split('\n').map(function (line) {
            return line.charAt(line.length - 1) === '\r' ? line.substring(0, line.length - 1) : line;
        });
        return input;
    };

    System.prototype.loadLine = function (input) {
        var line = input.line >= 0 && input.line < input.lines.length ? input.lines[input.line] : '';
        if (line.length > layout.INPUT_SIZE)
            throw new ForthError(-18, 'Line is too long');
        this.m.writeBytes(layout.INPUT, line);
        input.address = layout.INPUT;
        input.length = line.length;
    };

    // The next line of a file; false - the end (at once for EVALUATE).
    System.prototype.refill = function () {
        var input = this.input;
        if (input === null || input.kind !== 'file')
            return false;
        if (input.line + 1 >= input.lines.length)
            return false;
        input.line += 1;
        this.loadLine(input);
        this.setToIn(0);
        return true;
    };

    // Parsing: spaces and control characters are separators.
    System.prototype.parseName = function () {
        var input = this.input;
        var U8 = this.m.U8;
        var start = input.address, end = input.address + input.length;
        var at = start + this.toIn();
        while (at < end && U8[at] <= 32)
            ++at;
        var begin = at;
        while (at < end && U8[at] > 32)
            ++at;
        this.setToIn(Math.min(at + 1, end) - start);
        this.parsed = { address: begin, length: at - begin };
        return this.parsed;
    };

    System.prototype.parseNameText = function () {
        var token = this.parseName();
        if (token.length === 0)
            throw new ForthError(-16);
        return this.m.bytes(token.address, token.length);
    };

    // PARSE: up to the character char (or the end of the line).
    System.prototype.parse = function (char) {
        var input = this.input;
        var U8 = this.m.U8;
        var start = input.address, end = input.address + input.length;
        var begin = start + Math.min(this.toIn(), input.length);
        var at = begin;
        while (at < end && U8[at] !== char)
            ++at;
        this.setToIn(Math.min(at + 1, end) - start);
        return { address: begin, length: at - begin, closed: at < end };
    };

    System.prototype.parseText = function (char) {
        var token = this.parse(char);
        return this.m.bytes(token.address, token.length);
    };

    // A string up to char, in a file also from the following lines (a comment in parentheses).
    System.prototype.parseMultiline = function (char) {
        var text = '';
        for (;;) {
            var token = this.parse(char);
            text += this.m.bytes(token.address, token.length);
            if (token.closed || !this.refill())
                return text;
            text += '\n';
        }
    };

    // --- The text interpreter

    System.prototype.compiling = function () {
        return this.m.cell(layout.STATE) !== 0;
    };

    System.prototype.setCompiling = function (on) {
        this.m.setCell(layout.STATE, on ? -1 : 0);
    };

    System.prototype.interpret = function* () {
        var memory = this.m;
        for (;;) {
            var token = this.parseName();
            if (token.length === 0) {
                if (!this.refill())
                    return;
                continue;
            }
            var name = memory.bytes(token.address, token.length);
            var definition = this.definition;
            if (definition !== null && memory.cell(layout.STATE) !== 0) {
                var local = definition.scope[Forth.key(name)];
                if (local !== undefined) {
                    definition.add({ k: 'local', local: local });
                    continue;
                }
            }
            var word = this.findWord(name);
            if (word !== null) {
                if (memory.cell(layout.STATE) !== 0 && !word.immediate) {
                    this.compileWord(word);
                    continue;
                }
                if (word.compileOnly && memory.cell(layout.STATE) === 0)
                    throw new ForthError(-14, 'Interpreting a compile-only word: ' + utf8.decode(name));
                yield* this.run(word);
                continue;
            }
            var number = this.parseNumber(name);
            if (number === null)
                throw new ForthError(-13, 'Undefined word: ' + utf8.decode(name));
            if (memory.cell(layout.STATE) !== 0)
                this.compileNumber(number);
            else
                this.pushNumber(number);
        }
    };

    // A whole input: a unit, a file or an EVALUATE string.
    System.prototype.interpretInput = function* (input) {
        this.pushInput(input);
        if (input.kind === 'file' && !this.refill()) {
            this.popInput();
            return;
        }
        yield* this.interpret();
        this.popInput();
    };

    // From plain code (EVALUATE in a word that does not wait): at once.
    System.prototype.interpretNow = function (input) {
        return this.env.scheduler.runNested(this.interpretInput(input));
    };

    System.prototype.evaluateInput = function (address, length) {
        var input = new Input('string', '', -1);
        this.m.check(address, Math.max(length, 0));
        input.address = address;
        input.length = length;
        return input;
    };

    System.prototype.compileWord = function (word) {
        this.definition.add({ k: 'call', word: word });
    };

    System.prototype.compileNumber = function (number) {
        var definition = this.definition;
        if (number.kind === 'float') {
            definition.add({ k: 'flit', value: number.value });
        } else if (number.kind === 'double') {
            definition.add({ k: 'lit', value: number.lo });
            definition.add({ k: 'lit', value: number.hi });
        } else {
            definition.add({ k: 'lit', value: number.value });
        }
    };

    System.prototype.pushNumber = function (number) {
        if (number.kind === 'float') {
            this.pushFloat(number.value);
        } else if (number.kind === 'double') {
            this.push(number.lo);
            this.push(number.hi);
        } else {
            this.push(number.value);
        }
    };

    // --- Numbers

    function digitValue(code) {
        if (code >= 48 && code <= 57)
            return code - 48;
        if (code >= 65 && code <= 90)
            return code - 55;
        if (code >= 97 && code <= 122)
            return code - 87;
        return 99;
    }
    Forth.digitValue = digitValue;

    var FLOAT_PATTERN = /^[+-]?[0-9]+(\.[0-9]*)?[eE][+-]?[0-9]*$/;

    // A number by the rules of Forth 2012 and gforth: the prefixes # $ % &,
    // 'c', a sign, a point makes a double, with e in decimal base a float.
    System.prototype.parseNumber = function (name) {
        var base = this.number(this.m.cell(layout.BASE));
        if (name.length >= 3 && name.charAt(0) === "'" && name.charAt(name.length - 1) === "'") {
            var inner = name.substring(1, name.length - 1);
            var rune = utf8.decodeRune(inner, 0);
            if (rune[1] === inner.length)
                return { kind: 'single', value: rune[0] };
        }
        var at = 0;
        var prefix = name.charAt(0);
        if (prefix === '#' || prefix === '&') {
            base = 10;
            at = 1;
        } else if (prefix === '$') {
            base = 16;
            at = 1;
        } else if (prefix === '%') {
            base = 2;
            at = 1;
        }
        var negative = false;
        if (name.charAt(at) === '-') {
            negative = true;
            ++at;
        }
        var value = 0;
        var digits = 0;
        var dot = -1;
        var ok = at < name.length && base >= 2 && base <= 36;
        for (var index = at; ok && index < name.length; ++index) {
            var code = name.charCodeAt(index);
            if (code === 46 && dot < 0) {
                dot = index;
                continue;
            }
            var digit = digitValue(code);
            if (digit >= base) {
                ok = false;
                break;
            }
            value = big.add(big.mul(value, base), digit);
            ++digits;
        }
        if (ok && digits > 0) {
            if (negative)
                value = big.neg(value);
            if (dot >= 0) {
                this.m.setCell(layout.DPL, name.length - dot - 1);
                var pair = cells.bigToDouble(value);
                return { kind: 'double', lo: pair[0], hi: pair[1] };
            }
            this.m.setCell(layout.DPL, -1);
            return { kind: 'single', value: cells.fromBig(value) };
        }
        if (base === 10 && FLOAT_PATTERN.test(name)) {
            var text = name.replace(/[eE]([+-]?)$/, 'e$10');
            return { kind: 'float', value: Number(text) };
        }
        return null;
    };

    // --- Compiling definitions

    System.prototype.beginDefinition = function (word, kind) {
        var definition = new Definition(this, word, kind);
        definition.savedState = this.compiling() ? -1 : 0;
        if (this.definition !== null)
            this.definitions.push(this.definition);
        this.definition = definition;
        this.setCompiling(true);
        return definition;
    };

    System.prototype.requireDefinition = function () {
        if (this.definition === null)
            throw new ForthError(-14);
        return this.definition;
    };

    // The end of a definition or of the part after DOES>: translation into a function.
    System.prototype.finishDefinition = function () {
        var definition = this.requireDefinition();
        if (definition.cf.length > 0)
            throw new ForthError(-22);
        definition.endLine = this.lineNumber();
        var made = Forth.compileDefinition(this, definition);
        if (definition.kind === 'does') {
            var ref = definition.main.doesRef;
            ref.fn = made.fn;
            ref.gen = made.gen;
            ref.async = made.async;
            definition.main.endLine = definition.endLine;
            var main = Forth.compileDefinition(this, definition.main);
            this.installDefinition(definition.main, main);
            definition = definition.main;
        } else {
            this.installDefinition(definition, made);
        }
        this.definition = this.definitions.length > 0 ? this.definitions.pop() : null;
        this.setCompiling(definition.savedState !== 0);
        return definition.word;
    };

    System.prototype.installDefinition = function (definition, made) {
        var word = definition.word;
        word.fn = made.fn;
        word.gen = made.gen;
        word.async = made.async;
        word.definition = definition;
        if (definition.kind === ':') {
            this.current.add(word);
            this.latest = word;
        } else if (definition.kind === 'noname') {
            this.latest = word;
        }
    };

    // A definition abandoned by an error or a stop: forget it.
    System.prototype.abandonDefinitions = function () {
        this.definition = null;
        this.definitions = [];
        this.setCompiling(false);
    };

    // --- Control structures (the control-flow stack of a definition)

    System.prototype.cfPop = function (kind) {
        var cf = this.requireDefinition().cf;
        var entry = cf.pop();
        if (entry === undefined || (kind !== undefined && entry.kind !== kind))
            throw new ForthError(-22);
        return entry;
    };

    System.prototype.ifForward = function (cond) {
        var definition = this.requireDefinition();
        var label = definition.newLabel();
        definition.add({ k: 'goto', id: label, cond: cond });
        definition.cf.push({ kind: 'orig', label: label });
    };

    System.prototype.resolveOrig = function () {
        var entry = this.cfPop('orig');
        this.definition.add({ k: 'label', id: entry.label });
    };

    System.prototype.markDest = function () {
        var definition = this.requireDefinition();
        var label = definition.newLabel();
        definition.add({ k: 'label', id: label, loopHead: true });
        definition.cf.push({ kind: 'dest', label: label });
    };

    System.prototype.resolveDest = function (cond) {
        var entry = this.cfPop('dest');
        this.definition.add({ k: 'goto', id: entry.label, cond: cond });
    };

    // CS-ROLL and CS-PICK: only orig and dest.
    System.prototype.csRoll = function (count) {
        var cf = this.requireDefinition().cf;
        if (count < 0 || count >= cf.length)
            throw new ForthError(-22);
        var entry = cf.splice(cf.length - 1 - count, 1)[0];
        cf.push(entry);
    };

    System.prototype.csPick = function (count) {
        var cf = this.requireDefinition().cf;
        if (count < 0 || count >= cf.length)
            throw new ForthError(-22);
        var entry = cf[cf.length - 1 - count];
        if (entry.kind !== 'dest')
            throw new ForthError(-22);
        cf.push({ kind: 'dest', label: entry.label });
    };

    // The n-th open DO loop from the inside (0 - the innermost).
    System.prototype.loopAt = function (depth) {
        var cf = this.requireDefinition().cf;
        for (var index = cf.length - 1; index >= 0; --index) {
            if (cf[index].kind === 'do') {
                if (depth === 0)
                    return cf[index].loop;
                --depth;
            }
        }
        throw new ForthError(-26);
    };

    // --- Strings in memory

    // A string literal of a definition (S", C", SLITERAL) lives in the
    // dictionary, as in gforth; one per text.
    System.prototype.literalString = function (bytes) {
        var address = this.literals.get(bytes);
        if (address !== undefined && address < this.dp)
            return address;
        address = this.here();
        this.allot(bytes.length);
        this.m.writeBytes(address, bytes);
        this.align();
        this.literals.set(bytes, address);
        return address;
    };

    // A transient string (S" when interpreting, JS>S, NAME>STRING): lives
    // until TRANSIENT_SLOTS new ones appear. A long one goes to the heap.
    System.prototype.transientString = function (bytes) {
        var slot = this.transient;
        this.transient = (slot + 1) % layout.TRANSIENT_SLOTS;
        var previous = this.transientHeap[slot];
        if (previous !== undefined && previous !== 0) {
            this.m.free(previous);
            this.transientHeap[slot] = 0;
        }
        var address = layout.TRANSIENT + slot * layout.TRANSIENT_SIZE;
        if (bytes.length > layout.TRANSIENT_SIZE) {
            address = this.m.allocate(bytes.length);
            if (address === 0)
                throw new ForthError(-59);
            this.transientHeap[slot] = address;
        }
        this.m.writeBytes(address, bytes);
        return address;
    };

    System.prototype.text = function (address, length) {
        return this.m.bytes(address, this.count(length));
    };

    // --- Output: bytes collect until the end of a line and go to the console as text.

    System.prototype.write = function (bytes) {
        this.output += bytes;
        var end = this.output.lastIndexOf('\n');
        if (end >= 0) {
            this.env.out.write(utf8.decode(this.output.substring(0, end + 1)));
            this.output = this.output.substring(end + 1);
        }
    };

    System.prototype.flushOutput = function () {
        if (this.output.length > 0) {
            this.env.out.write(utf8.decode(this.output));
            this.output = '';
        }
        this.env.out.flush();
    };

    // EMIT: a byte; a character beyond 255 as its UTF-8 bytes (as XEMIT).
    System.prototype.emit = function (code) {
        code = this.number(code);
        if (code >= 0 && code < 256)
            this.write(String.fromCharCode(code));
        else
            this.write(utf8.encodeRune(code));
    };

    System.prototype.type = function (address, length) {
        this.write(this.text(address, length));
    };

    System.prototype.spaces = function (count) {
        count = this.number(count);
        if (count > 0)
            this.write(new Array(count + 1).join(' '));
    };

    System.prototype.base = function () {
        var base = this.number(this.m.cell(layout.BASE));
        if (base < 2 || base > 36)
            throw new ForthError(-24, 'Invalid BASE ' + base);
        return base;
    };

    System.prototype.formatSigned = function (value) {
        return i64.str(value, this.base()).toUpperCase();
    };

    System.prototype.formatUnsigned = function (value) {
        if (typeof value === 'number' && value >= 0)
            return value.toString(this.base()).toUpperCase();
        return u64.str(u64.fromSigned(value), this.base()).toUpperCase();
    };

    System.prototype.formatDouble = function (lo, hi, signed) {
        var value = signed ? cells.doubleToBig(lo, hi) : cells.unsignedDoubleToBig(lo, hi);
        return big.str(value, this.base()).toUpperCase();
    };

    System.prototype.formatFloat = function (value) {
        return Forth.floats.fixed(value, this.precision());
    };

    System.prototype.precision = function () {
        var precision = this.number(this.m.cell(layout.PRECISION));
        return Math.max(1, Math.min(precision, 17));
    };

    // A right-aligned number (.R, U.R, D.R).
    System.prototype.writeRight = function (text, width) {
        width = this.number(width);
        while (text.length < width)
            text = ' ' + text;
        this.write(text);
    };

    // The stack as .S shows it: <depth> elements.
    System.prototype.describeStack = function () {
        var items = [];
        for (var index = EMPTY + 1; index <= this.sp; ++index)
            items.push(this.formatSigned(this.S[index]));
        return '<' + (this.sp - EMPTY) + '> ' + items.join(' ');
    };

    System.prototype.describeFloats = function () {
        var items = [];
        for (var index = EMPTY + 1; index <= this.fp; ++index)
            items.push(this.formatFloat(this.FS[index]));
        return '<' + (this.fp - EMPTY) + '> ' + items.join(' ');
    };

    Forth.Wordlist = Wordlist;
})(globalThis);
