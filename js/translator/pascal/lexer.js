// Pascal: tokens. Names are case-insensitive (value in lower case, text
// as written), strings are UTF-8 bytes, the directives {$...} - conditional
// compilation right here, switches ($mode, $R, $H...) become 'directive'
// tokens for the parser. Design: docs/internals/pascal.md.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Pascal = T.pascal = T.pascal || {};
    if (Pascal.lexer)
        return;
    Pascal.lexer = true;

    var CompileError = T.CompileError;
    var big = T.big;
    var utf8 = T.utf8;

    var KEYWORDS = {};
    ('and array as asm begin case class const constructor destructor dispinterface div do downto else end except ' +
     'exports file finalization finally for function goto if implementation in inherited initialization inline ' +
     'interface is label library mod nil not object of operator or packed procedure program property raise record ' +
     'repeat resourcestring set shl shr string then threadvar to try type unit until uses var while with xor')
        .split(' ').forEach(function (word) { KEYWORDS[word] = true; });
    Pascal.KEYWORDS = KEYWORDS;

    // Signs: the long ones before the short ones.
    var OPERATORS = [':=', '+=', '-=', '*=', '/=', '<=', '>=', '<>', '><', '..', '**', '(.', '.)',
                     '(', ')', '[', ']', ',', ';', ':', '.', '^', '@', '+', '-', '*', '/', '=', '<', '>'];

    // Symbols that are always defined (as in FPC 3.2.2 for x86_64-linux).
    var PREDEFINED = ['FPC', 'VER3', 'VER3_2', 'VER3_2_2', 'CPUX86_64', 'CPU64', 'CPUAMD64', 'LINUX', 'UNIX',
                      'ENDIAN_LITTLE', 'FPC_HAS_FEATURE_EXCEPTIONS', 'V4SCRIPT'];
    var NUMERIC_SYMBOLS = { FPC_FULLVERSION: 30202, FPC_VERSION: 3, FPC_RELEASE: 2, FPC_PATCH: 2 };

    // The default switches: {$mode objfpc}{$H+}.
    Pascal.DEFAULT_SWITCHES = { mode: 'objfpc', H: true, R: false, Q: false, I: true, B: false, C: false, J: true,
                                X: true, scopedEnums: false };

    function modeSymbol(mode) {
        return 'FPC_' + mode.toUpperCase();
    }

    function isIdentStart(code) {
        return T.isLetter(code);
    }

    function isIdentPart(code) {
        return T.isLetter(code) || T.isDigit(code);
    }

    // options: { attachment(name) - the text of a file or null, switches }
    function Lexer(text, source, options) {
        this.options = options || {};
        this.tokens = [];
        this.defines = Object.create(null);
        var self = this;
        PREDEFINED.forEach(function (name) { self.defines[name] = true; });
        this.mode = (this.options.switches || Pascal.DEFAULT_SWITCHES).mode;
        this.defines[modeSymbol(this.mode)] = true;
        // Conditional compilation: a stack of { active, taken, outer }.
        this.conditions = [];
        this.includeDepth = 0;
        this.lexText(text, source || '');
        var last = this.tokens.length > 0 ? this.tokens[this.tokens.length - 1] : null;
        this.tokens.push({ type: 'eof', value: '', text: '', line: last ? last.line : 1, column: last ? last.column : 1,
                           source: source || '' });
        if (this.conditions.length > 0)
            throw new CompileError('$ENDIF expected', last ? last.line : 1, 1, source || '');
    }

    Lexer.prototype.active = function () {
        return this.conditions.length === 0 || this.conditions[this.conditions.length - 1].active;
    };

    Lexer.prototype.lexText = function (text, source) {
        var scanner = new T.Scanner(text, source);
        this.scanner = scanner;
        while (true) {
            this.skipSpace(scanner);
            if (scanner.atEnd())
                break;
            var line = scanner.line, column = scanner.column();
            var code = scanner.code();
            var token = null;
            if (!this.active()) {
                // Skipping text under a false condition: only directives and
                // comments are parsed (skipSpace), the rest character by character.
                if (code === 39)
                    this.skipString(scanner);
                else
                    scanner.advance(1);
                continue;
            }
            if (isIdentStart(code) || (code === 38 && isIdentStart(scanner.code(1)))) {
                token = this.identifier(scanner);
            } else if (T.isDigit(code) || (code === 36 && /[0-9A-Fa-f]/.test(scanner.peek(1))) ||
                       (code === 38 && /[0-7]/.test(scanner.peek(1))) || (code === 37 && /[01]/.test(scanner.peek(1)))) {
                token = this.number(scanner);
            } else if (code === 39 || code === 35) {
                token = this.string(scanner);
            } else {
                for (var index = 0; index < OPERATORS.length; ++index) {
                    if (scanner.startsWith(OPERATORS[index])) {
                        var op = OPERATORS[index];
                        // "(." and ".)" are another notation of the brackets [ ].
                        if (op === '(.')
                            op = '[';
                        else if (op === '.)')
                            op = ']';
                        scanner.advance(OPERATORS[index].length);
                        token = { type: 'op', value: op, text: OPERATORS[index] };
                        break;
                    }
                }
                if (token === null)
                    scanner.error("illegal character '" + scanner.peek() + "'");
            }
            token.line = line;
            token.column = column;
            token.source = source;
            this.tokens.push(token);
        }
    };

    Lexer.prototype.skipString = function (scanner) {
        scanner.advance(1);
        while (!scanner.atEnd() && scanner.code() !== 39 && scanner.code() !== 10)
            scanner.advance(1);
        scanner.advance(1);
    };

    // Spaces, comments and directives.
    Lexer.prototype.skipSpace = function (scanner) {
        for (;;) {
            var code = scanner.code();
            if (code === 32 || code === 9 || code === 10 || code === 13 || code === 12 || code === 0xFEFF) {
                scanner.advance(1);
                continue;
            }
            if (code === 47 && scanner.code(1) === 47) {
                while (!scanner.atEnd() && scanner.code() !== 10)
                    scanner.advance(1);
                continue;
            }
            if (code === 123) {
                this.comment(scanner, '{', '}');
                continue;
            }
            if (code === 40 && scanner.code(1) === 42) {
                this.comment(scanner, '(*', '*)');
                continue;
            }
            return;
        }
    };

    // A comment or a directive. Nested comments as in the fpc and objfpc
    // modes (not in tp and delphi).
    Lexer.prototype.comment = function (scanner, open, close) {
        var line = scanner.line, column = scanner.column();
        scanner.advance(open.length);
        var start = scanner.pos;
        var nested = this.mode === 'objfpc' || this.mode === 'fpc';
        var level = 1;
        while (!scanner.atEnd()) {
            if (scanner.startsWith(close)) {
                if (--level === 0)
                    break;
                scanner.advance(close.length);
                continue;
            }
            if (nested && scanner.startsWith(open)) {
                ++level;
                scanner.advance(open.length);
                continue;
            }
            scanner.advance(1);
        }
        if (scanner.atEnd())
            throw new CompileError('unterminated comment', line, column, scanner.source);
        var body = scanner.text.substring(start, scanner.pos);
        scanner.advance(close.length);
        if (body.charAt(0) === '$')
            this.directive(body.substring(1), line, column, scanner);
    };

    Lexer.prototype.directive = function (body, line, column, scanner) {
        var match = /^([A-Za-z_][A-Za-z0-9_]*)([+-]?)\s*([\s\S]*)$/.exec(body);
        if (match === null)
            return;
        var name = match[1].toUpperCase();
        var sign = match[2];
        var argument = match[3].trim();
        var self = this;
        var source = scanner.source;
        function fail(message) {
            throw new CompileError(message, line, column, source);
        }
        // Conditional compilation works in skipped text too.
        switch (name) {
        case 'IFDEF':
        case 'IFNDEF':
        case 'IF':
        case 'IFOPT': {
            var outer = this.active();
            var value = false;
            if (outer) {
                if (name === 'IFDEF')
                    value = this.defines[firstWord(argument)] === true;
                else if (name === 'IFNDEF')
                    value = this.defines[firstWord(argument)] !== true;
                else if (name === 'IFOPT')
                    value = this.ifopt(argument);
                else
                    value = this.evaluate(argument, fail);
            }
            this.conditions.push({ active: outer && value, taken: value, outer: outer });
            return;
        }
        case 'ELSEIF': {
            var top = this.conditions[this.conditions.length - 1];
            if (top === undefined)
                fail('$ELSEIF without $IF');
            var take = top.outer && !top.taken && this.evaluate(argument, fail);
            top.active = take;
            top.taken = top.taken || take;
            return;
        }
        case 'ELSE': {
            var current = this.conditions[this.conditions.length - 1];
            if (current === undefined)
                fail('$ELSE without $IF');
            current.active = current.outer && !current.taken;
            current.taken = true;
            return;
        }
        case 'ENDIF':
        case 'IFEND':
            if (this.conditions.length === 0)
                fail('$ENDIF without $IF');
            this.conditions.pop();
            return;
        }
        if (!this.active())
            return;
        switch (name) {
        case 'DEFINE':
            this.defines[firstWord(argument)] = true;
            return;
        case 'UNDEF':
            delete this.defines[firstWord(argument)];
            return;
        case 'MODE': {
            var mode = firstWord(argument).toLowerCase();
            if (mode === 'iso' || mode === 'extendedpascal' || mode === 'macpas')
                mode = 'fpc';
            if (['objfpc', 'fpc', 'tp', 'delphi', 'delphiunicode'].indexOf(mode) < 0)
                fail('Illegal compiler switch "MODE ' + argument + '"');
            if (mode === 'delphiunicode')
                mode = 'delphi';
            delete this.defines[modeSymbol(this.mode)];
            this.mode = mode;
            this.defines[modeSymbol(mode)] = true;
            // FPC keeps $H- in objfpc, but here a program starts with {$H+}
            // and keeps it: short strings only in tp and fpc.
            this.emit({ mode: mode, H: mode === 'objfpc' || mode === 'delphi' }, line, column, source);
            return;
        }
        case 'I':
        case 'INCLUDE':
            if (sign !== '' || /^(ON|OFF)$/i.test(argument)) {
                this.emit({ I: sign === '+' || /^ON$/i.test(argument) }, line, column, source);
                return;
            }
            this.include(argument, fail);
            return;
        case 'IOCHECKS':
            this.emit({ I: /^ON$/i.test(argument) }, line, column, source);
            return;
        case 'H':
        case 'LONGSTRINGS':
            this.emit({ H: sign === '+' || /^ON$/i.test(argument) }, line, column, source);
            return;
        case 'R':
        case 'RANGECHECKS':
            this.emit({ R: sign === '+' || /^ON$/i.test(argument) }, line, column, source);
            return;
        case 'Q':
        case 'OVERFLOWCHECKS':
            this.emit({ Q: sign === '+' || /^ON$/i.test(argument) }, line, column, source);
            return;
        case 'B':
        case 'BOOLEVAL':
            this.emit({ B: sign === '+' || /^ON$/i.test(argument) }, line, column, source);
            return;
        case 'C':
        case 'ASSERTIONS':
            this.emit({ C: sign === '+' || /^ON$/i.test(argument) }, line, column, source);
            return;
        case 'J':
        case 'WRITEABLECONST':
            this.emit({ J: sign === '+' || /^ON$/i.test(argument) }, line, column, source);
            return;
        case 'SCOPEDENUMS':
            this.emit({ scopedEnums: /^ON$/i.test(argument) }, line, column, source);
            return;
        case 'ERROR':
        case 'FATAL':
            fail(argument);
            return;
        }
        // Other directives ($APPTYPE, $CODEPAGE, $GOTO, $INLINE, $MODESWITCH,
        // $WARNINGS, $HINTS, $NOTES, $MACRO, $COPERATORS...) change nothing.
    };

    Lexer.prototype.emit = function (change, line, column, source) {
        this.tokens.push({ type: 'directive', value: change, text: '', line: line, column: column, source: source });
    };

    Lexer.prototype.ifopt = function (argument) {
        // Without the switch state in the lexer: R-, Q-, B- by default.
        var match = /^([A-Za-z])([+-])/.exec(argument);
        if (match === null)
            return false;
        var defaults = { H: true, I: true, J: true, X: true };
        var on = defaults[match[1].toUpperCase()] === true;
        return match[2] === '+' ? on : !on;
    };

    // $IF: defined(X), numbers, symbols, comparisons, and/or/not.
    Lexer.prototype.evaluate = function (text, fail) {
        var self = this;
        var tokens = text.match(/\s*(defined|declared|undefined|not|and|or|[A-Za-z_]\w*|\d+|<>|<=|>=|[()<>=])/gi) || [];
        tokens = tokens.map(function (item) { return item.trim(); });
        var position = 0;
        function peek() { return tokens[position]; }
        function next() { return tokens[position++]; }
        function primary() {
            var token = next();
            if (token === undefined)
                fail('Error in $IF expression');
            var lower = token.toLowerCase();
            if (lower === 'not')
                return !truthy(primary());
            if (lower === 'defined' || lower === 'undefined' || lower === 'declared') {
                var open = peek() === '(';
                if (open)
                    next();
                var name = next();
                if (open)
                    next();
                var defined = self.defines[String(name).toUpperCase()] === true;
                return lower === 'undefined' ? !defined : (lower === 'declared' ? false : defined);
            }
            if (token === '(') {
                var value = expression();
                next();
                return value;
            }
            if (/^\d+$/.test(token))
                return Number(token);
            var upper = token.toUpperCase();
            if (NUMERIC_SYMBOLS[upper] !== undefined)
                return NUMERIC_SYMBOLS[upper];
            if (upper === 'TRUE')
                return true;
            if (upper === 'FALSE')
                return false;
            return self.defines[upper] === true;
        }
        function truthy(value) {
            return value === true || (typeof value === 'number' && value !== 0);
        }
        function comparison() {
            var left = primary();
            var op = peek();
            if (op === '=' || op === '<>' || op === '<' || op === '>' || op === '<=' || op === '>=') {
                next();
                var right = primary();
                switch (op) {
                case '=': return left === right;
                case '<>': return left !== right;
                case '<': return left < right;
                case '>': return left > right;
                case '<=': return left <= right;
                }
                return left >= right;
            }
            return left;
        }
        function conjunction() {
            var value = comparison();
            while (peek() !== undefined && peek().toLowerCase() === 'and') {
                next();
                var right = comparison();
                value = truthy(value) && truthy(right);
            }
            return value;
        }
        function expression() {
            var value = conjunction();
            while (peek() !== undefined && peek().toLowerCase() === 'or') {
                next();
                var right = conjunction();
                value = truthy(value) || truthy(right);
            }
            return value;
        }
        return truthy(expression());
    };

    // {$I name}: the text of a file in this place.
    Lexer.prototype.include = function (argument, fail) {
        var name = argument.replace(/^'(.*)'$/, '$1').trim();
        if (this.includeDepth > 16)
            fail('include files are nested too deeply');
        var reader = this.options.attachment;
        var text = reader ? reader(name) : null;
        if ((text === null || text === undefined) && !/\.\w+$/.test(name)) {
            text = reader ? reader(name + '.inc') : null;
            if (text === null || text === undefined)
                text = reader ? reader(name + '.pas') : null;
            else
                name += '.inc';
        }
        if (text === null || text === undefined)
            fail("Can't open include file \"" + name + '"');
        var scanner = this.scanner;
        ++this.includeDepth;
        try {
            this.lexText(text, name);
        } finally {
            --this.includeDepth;
            this.scanner = scanner;
        }
    };

    function firstWord(text) {
        var match = /^[A-Za-z_]\w*/.exec(text);
        return match === null ? '' : match[0].toUpperCase();
    }

    Lexer.prototype.identifier = function (scanner) {
        var escaped = false;
        if (scanner.code() === 38) {
            escaped = true;
            scanner.advance(1);
        }
        var start = scanner.pos;
        scanner.advance(1);
        while (!scanner.atEnd() && isIdentPart(scanner.code()))
            scanner.advance(1);
        var text = scanner.text.substring(start, scanner.pos);
        var value = text.toLowerCase();
        if (!escaped && KEYWORDS[value] === true)
            return { type: 'keyword', value: value, text: text };
        return { type: 'ident', value: value, text: text };
    };

    Lexer.prototype.number = function (scanner) {
        var start = scanner.pos;
        var code = scanner.code();
        var radix = 10;
        if (code === 36 || code === 38 || code === 37) {
            radix = code === 36 ? 16 : (code === 38 ? 8 : 2);
            scanner.advance(1);
            var digitsStart = scanner.pos;
            var pattern = radix === 16 ? /[0-9A-Fa-f_]/ : (radix === 8 ? /[0-7_]/ : /[01_]/);
            while (!scanner.atEnd() && pattern.test(scanner.peek()))
                scanner.advance(1);
            var digits = scanner.text.substring(digitsStart, scanner.pos).replace(/_/g, '');
            return { type: 'int', value: big.parse(digits, radix), text: scanner.text.substring(start, scanner.pos) };
        }
        while (!scanner.atEnd() && (T.isDigit(scanner.code()) || scanner.code() === 95))
            scanner.advance(1);
        var real = false;
        if (scanner.code() === 46 && T.isDigit(scanner.code(1))) {
            real = true;
            scanner.advance(1);
            while (!scanner.atEnd() && T.isDigit(scanner.code()))
                scanner.advance(1);
        }
        if ((scanner.code() === 101 || scanner.code() === 69) &&
            (T.isDigit(scanner.code(1)) || ((scanner.code(1) === 43 || scanner.code(1) === 45) && T.isDigit(scanner.code(2))))) {
            real = true;
            scanner.advance(2);
            while (!scanner.atEnd() && T.isDigit(scanner.code()))
                scanner.advance(1);
        }
        var text = scanner.text.substring(start, scanner.pos).replace(/_/g, '');
        if (real)
            return { type: 'real', value: Number(text), text: text };
        return { type: 'int', value: big.parse(text, 10), text: text };
    };

    // A string: parts in quotes and #code in a row are one byte string.
    Lexer.prototype.string = function (scanner) {
        var value = '';
        var start = scanner.pos;
        var parts = 0;
        for (;;) {
            var code = scanner.code();
            if (code === 39) {
                scanner.advance(1);
                var text = '';
                for (;;) {
                    if (scanner.atEnd() || scanner.code() === 10 || scanner.code() === 13)
                        scanner.error('String exceeds line');
                    if (scanner.code() === 39) {
                        if (scanner.code(1) === 39) {
                            text += "'";
                            scanner.advance(2);
                            continue;
                        }
                        scanner.advance(1);
                        break;
                    }
                    text += scanner.peek();
                    scanner.advance(1);
                }
                value += utf8.encode(text);
                ++parts;
                continue;
            }
            if (code === 35) {
                scanner.advance(1);
                var number;
                if (scanner.code() === 36) {
                    scanner.advance(1);
                    number = scanner.match(/[0-9A-Fa-f]+/y);
                    if (number === null)
                        scanner.error('illegal char constant');
                    scanner.advance(number.length);
                    number = parseInt(number, 16);
                } else {
                    number = scanner.match(/[0-9]+/y);
                    if (number === null)
                        scanner.error('illegal char constant');
                    scanner.advance(number.length);
                    number = Number(number);
                }
                value += number < 256 ? String.fromCharCode(number) : utf8.encodeRune(number);
                ++parts;
                continue;
            }
            break;
        }
        return { type: 'string', value: value, text: scanner.text.substring(start, scanner.pos) };
    };

    Pascal.tokenize = function (text, source, options) {
        return new Lexer(text, source, options).tokens;
    };
})(globalThis);
