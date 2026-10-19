// BASIC: splitting the text into tokens. The dialect is QBasic
// (QuickBASIC 4.5): case-insensitive names, type suffixes (% & ! # $),
// labels - line numbers and "name:" at the start of a line, ":" separates
// statements, REM and "'" are comments (with the metacommands $INCLUDE,
// $DYNAMIC, $STATIC), DATA has raw values. Design: docs/internals/basic.md.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Basic = T.basic = T.basic || {};
    if (Basic.lex)
        return;

    var CompileError = T.CompileError;

    // Keywords only without a suffix: STRING$ and MID$ are function names.
    var KEYWORDS = {};
    ('ACCESS ALIAS AND ANY APPEND AS BASE BEEP BINARY BYVAL CALL CASE CHAIN CHDIR CIRCLE CLEAR CLOSE CLS COLOR ' +
     'COM COMMON CONST DATA DECLARE DEF DEFDBL DEFINT DEFLNG DEFSNG DEFSTR DIM DO DOUBLE DRAW ELSE ELSEIF END ' +
     'ENVIRON EQV ERASE ERROR EXIT FIELD FILES FOR FUNCTION GET GOSUB GOTO IF IMP INPUT INTEGER IS KEY KILL LET ' +
     'LINE LOCATE LOCK LONG LOOP LPRINT LSET MKDIR MOD NAME NEXT NOT OBJECT OFF ON OPEN OPTION OR OUT OUTPUT ' +
     'PAINT PALETTE PCOPY POKE PRESET PRINT PSET PUT RANDOM RANDOMIZE READ REDIM REM RESET RESTORE RESUME RETURN ' +
     'RMDIR RSET RUN SCREEN SEEK SELECT SHARED SHELL SINGLE SLEEP SOUND STATIC STEP STOP STRING SUB SWAP SYSTEM ' +
     'THEN TO TROFF TRON TYPE UNLOCK UNTIL USING VIEW WAIT WEND WHILE WIDTH WINDOW WRITE XOR PRESERVE')
        .split(' ').forEach(function (word) { KEYWORDS[word] = true; });
    Basic.KEYWORDS = KEYWORDS;

    var SUFFIXES = { '%': 'i', '&': 'l', '!': 'f', '#': 'd', '$': 's' };
    Basic.SUFFIXES = SUFFIXES;

    var MAX_INCLUDE_DEPTH = 16;

    function isNameStart(code) {
        return T.isLetter(code) && code !== 95;
    }

    function isNamePart(code) {
        return T.isLetter(code) || T.isDigit(code) || code === 46;
    }

    function Lexer(text, source, options) {
        this.s = new T.Scanner(text, source);
        this.source = source || '';
        this.options = options || {};
        this.tokens = [];
        this.lineStart = true;
        this.depth = this.options.depth || 0;
    }

    Lexer.prototype.error = function (message) {
        this.s.error(message);
    };

    Lexer.prototype.push = function (type, value, text, line, column, extra) {
        var token = { type: type, value: value, text: text, line: line, column: column, source: this.source,
                      start: this.lineStart };
        if (extra !== undefined) {
            for (var key in extra)
                token[key] = extra[key];
        }
        this.lineStart = false;
        this.tokens.push(token);
        return token;
    };

    Lexer.prototype.newline = function (line, column) {
        var last = this.tokens.length > 0 ? this.tokens[this.tokens.length - 1] : null;
        if (last !== null && last.type !== 'newline')
            this.push('newline', '\n', '\n', line, column);
        this.lineStart = true;
    };

    Lexer.prototype.run = function () {
        var source = this.s;
        while (!source.atEnd()) {
            var code = source.code();
            if (code === 10) {
                this.newline(source.line, source.column());
                source.advance();
                continue;
            }
            if (code === 32 || code === 9 || code === 13 || code === 0xFEFF) {
                source.advance();
                continue;
            }
            // "_" at the end of a line continues it on the next one (as in QB64).
            if (code === 95 && this.continuation())
                continue;
            var line = source.line, column = source.column();
            if (code === 39) {
                source.advance();
                this.comment(line, column);
                continue;
            }
            if (code === 34) {
                this.string(line, column);
                continue;
            }
            if (T.isDigit(code) || (code === 46 && T.isDigit(source.code(1)))) {
                this.number(line, column);
                continue;
            }
            if (code === 38) {
                this.radixNumber(line, column);
                continue;
            }
            if (isNameStart(code) || (code === 95 && isNameStart(source.code(1)))) {
                this.word(line, column);
                continue;
            }
            this.operator(line, column);
        }
        this.newline(source.line, source.column());
        this.push('eof', '', '', source.line, source.column());
        return this.tokens;
    };

    Lexer.prototype.continuation = function () {
        var source = this.s;
        var index = source.pos + 1;
        while (index < source.text.length &&
               (source.text.charCodeAt(index) === 32 || source.text.charCodeAt(index) === 9 ||
                source.text.charCodeAt(index) === 13))
            ++index;
        if (index < source.text.length && source.text.charCodeAt(index) !== 10)
            return false;
        if (source.pos > 0 && isNamePart(source.text.charCodeAt(source.pos - 1)))
            return false;
        source.advance(index - source.pos + 1);
        return true;
    };

    Lexer.prototype.restOfLine = function () {
        var source = this.s;
        var start = source.pos;
        while (!source.atEnd() && source.code() !== 10)
            source.advance();
        return source.text.substring(start, source.pos).replace(/\r$/, '');
    };

    // A comment up to the end of the line; a metacommand is a 'meta' token.
    Lexer.prototype.comment = function (line, column) {
        var text = this.restOfLine();
        var match = /^\s*\$(INCLUDE|DYNAMIC|STATIC)\b\s*(?::\s*'([^']*)'?)?/i.exec(text);
        if (match === null)
            return;
        var name = match[1].toUpperCase();
        if (name === 'INCLUDE') {
            if (match[2] === undefined)
                throw new CompileError("Expected: $INCLUDE: 'file'", line, column, this.source);
            this.include(match[2].trim(), line, column);
            return;
        }
        this.push('meta', name, text, line, column);
    };

    // $INCLUDE: 'name' - the text of the host file in place of the metacommand.
    Lexer.prototype.include = function (name, line, column) {
        if (this.depth >= MAX_INCLUDE_DEPTH)
            throw new CompileError('$INCLUDE nested too deeply: ' + name, line, column, this.source);
        var text = this.options.attachment ? this.options.attachment(name) : null;
        if (text === null)
            throw new CompileError('File not found: ' + name, line, column, this.source);
        var inner = new Lexer(text, name, { attachment: this.options.attachment, depth: this.depth + 1 });
        var tokens = inner.run();
        this.newline(line, column);
        for (var index = 0; index < tokens.length - 1; ++index)
            this.tokens.push(tokens[index]);
        this.newline(line, column);
    };

    Lexer.prototype.string = function (line, column) {
        var source = this.s;
        source.advance();
        var start = source.pos;
        while (!source.atEnd() && source.code() !== 34 && source.code() !== 10)
            source.advance();
        var value = source.text.substring(start, source.pos).replace(/\r$/, '');
        if (source.code() === 34)
            source.advance();
        this.push('string', value, '"' + value + '"', line, column);
    };

    // The type of a number without a suffix: an integer is INTEGER or LONG
    // by its size, otherwise SINGLE if it has at most 7 digits, otherwise
    // DOUBLE (as in QBasic).
    Lexer.prototype.number = function (line, column) {
        var source = this.s;
        var start = source.pos;
        var text = source.match(/[0-9]*\.?[0-9]*/y);
        var mantissa = text;
        var exponent = '';
        var kind = '';
        var marker = source.text.charAt(source.pos + text.length);
        if (/[eEdD]/.test(marker)) {
            var tail = /[eEdD][+-]?[0-9]*/y;
            tail.lastIndex = source.pos + text.length;
            var found = tail.exec(source.text);
            exponent = found[0];
            kind = /[dD]/.test(marker) ? 'd' : 'f';
        }
        source.advance(text.length + exponent.length);
        var suffix = source.peek();
        var digits = mantissa.replace('.', '').replace(/^0+/, '');
        var value = Number(mantissa + (exponent.length > 1 ? 'e' + exponent.substring(1).replace(/^([+-]?)$/, '$10') : ''));
        if (mantissa === '.')
            this.error('Syntax error');
        if (SUFFIXES[suffix] !== undefined && suffix !== '$') {
            source.advance();
            kind = SUFFIXES[suffix];
            if ((kind === 'i' || kind === 'l') && (mantissa.indexOf('.') >= 0 || exponent.length > 0))
                this.error('Syntax error');
        } else if (kind === '') {
            if (mantissa.indexOf('.') < 0)
                kind = value <= 32767 ? 'i' : (value <= 2147483647 ? 'l' : (digits.length > 7 ? 'd' : 'f'));
            else
                kind = digits.replace(/0+$/, '').length > 7 ? 'd' : 'f';
        } else if (kind === 'f' && digits.replace(/0+$/, '').length > 7) {
            kind = 'd';
        }
        if (kind === 'i' && value > 32767 || kind === 'l' && value > 2147483647)
            this.error('Overflow');
        // Without a suffix a number outside SINGLE is DOUBLE (1.5E+300), as in QBasic.
        if (kind === 'f' && suffix !== '!' && !isFinite(Math.fround(value)))
            kind = 'd';
        if (kind === 'f')
            value = Math.fround(value);
        if (!isFinite(value))
            this.error('Overflow');
        this.push('number', value, source.text.substring(start, source.pos), line, column, { kind: kind });
    };

    // &H, &O, &B and & - hexadecimal, octal, binary. A value in 16 bits is
    // INTEGER (&HFFFF = -1), in 32 - LONG.
    Lexer.prototype.radixNumber = function (line, column) {
        var source = this.s;
        var start = source.pos;
        var letter = source.peek(1).toUpperCase();
        var base = letter === 'H' ? 16 : (letter === 'B' ? 2 : 8);
        var skip = letter === 'H' || letter === 'O' || letter === 'B' ? 2 : 1;
        var pattern = base === 16 ? /[0-9A-Fa-f]+/y : (base === 2 ? /[01]+/y : /[0-7]+/y);
        pattern.lastIndex = source.pos + skip;
        var found = pattern.exec(source.text);
        if (found === null)
            this.error('Syntax error');
        source.advance(skip + found[0].length);
        var value = parseInt(found[0], base);
        var kind = value <= 0xFFFF ? 'i' : 'l';
        if (source.peek() === '%' || source.peek() === '&') {
            kind = source.peek() === '%' ? 'i' : 'l';
            source.advance();
        }
        if (kind === 'i' && value > 0xFFFF || value > 0xFFFFFFFF)
            this.error('Overflow');
        if (kind === 'i')
            value = value << 16 >> 16;
        else
            value = value | 0;
        this.push('number', value, source.text.substring(start, source.pos), line, column, { kind: kind });
    };

    Lexer.prototype.word = function (line, column) {
        var source = this.s;
        var start = source.pos;
        source.advance();
        while (!source.atEnd() && (isNamePart(source.code()) || (source.code() === 95 && !this.atContinuation())))
            source.advance();
        var name = source.text.substring(start, source.pos);
        // A point at the end of a name is not part of it (a. is an error, "PRINT a." is not).
        while (name.charAt(name.length - 1) === '.') {
            name = name.substring(0, name.length - 1);
            source.pos -= 1;
        }
        var upper = name.toUpperCase();
        var suffix = source.peek();
        if (SUFFIXES[suffix] !== undefined && !(suffix === '#' && KEYWORDS[upper] === true)) {
            // "&&", "!=" and the like are not suffixes.
            source.advance();
            this.push('name', name.toLowerCase(), name + suffix, line, column, { name: name, suffix: suffix });
            return;
        }
        if (KEYWORDS[upper] === true && name.indexOf('.') < 0) {
            if (upper === 'REM') {
                this.comment(line, column);
                return;
            }
            if (upper === 'DATA') {
                this.data(line, column);
                return;
            }
            this.push('keyword', upper, name, line, column);
            return;
        }
        this.push('name', name.toLowerCase(), name, line, column, { name: name, suffix: '' });
    };

    Lexer.prototype.atContinuation = function () {
        var source = this.s;
        var index = source.pos + 1;
        while (index < source.text.length &&
               (source.text.charCodeAt(index) === 32 || source.text.charCodeAt(index) === 9 ||
                source.text.charCodeAt(index) === 13))
            ++index;
        return index >= source.text.length || source.text.charCodeAt(index) === 10;
    };

    // DATA: values separated by commas up to the end of the line or a ":"
    // outside quotes; strings without quotes as they are, without the outer
    // spaces.
    Lexer.prototype.data = function (line, column) {
        var source = this.s;
        var items = [];
        for (;;) {
            while (source.code() === 32 || source.code() === 9)
                source.advance();
            var itemColumn = source.column();
            if (source.code() === 34) {
                source.advance();
                var start = source.pos;
                while (!source.atEnd() && source.code() !== 34 && source.code() !== 10)
                    source.advance();
                var quoted = source.text.substring(start, source.pos).replace(/\r$/, '');
                if (source.code() === 34)
                    source.advance();
                while (source.code() === 32 || source.code() === 9)
                    source.advance();
                items.push({ value: quoted, quoted: true, column: itemColumn });
            } else {
                var from = source.pos;
                while (!source.atEnd() && source.code() !== 44 && source.code() !== 58 && source.code() !== 10)
                    source.advance();
                items.push({ value: source.text.substring(from, source.pos).replace(/[\s\r]+$/, ''), quoted: false, column: itemColumn });
            }
            if (source.code() !== 44)
                break;
            source.advance();
        }
        if (!source.atEnd() && source.code() !== 58 && source.code() !== 10 && source.code() !== 13)
            this.error('Expected: , or end-of-statement');
        this.push('data', items, 'DATA', line, column);
    };

    var TWO_CHAR = { '<=': '<=', '>=': '>=', '<>': '<>', '=<': '<=', '=>': '>=', '><': '<>' };

    Lexer.prototype.operator = function (line, column) {
        var source = this.s;
        var pair = source.text.substr(source.pos, 2);
        if (TWO_CHAR[pair] !== undefined) {
            source.advance(2);
            this.push('op', TWO_CHAR[pair], pair, line, column);
            return;
        }
        var ch = source.peek();
        if ('+-*/\\^=<>(),;:.#?'.indexOf(ch) < 0)
            this.error('Syntax error: unexpected ' + JSON.stringify(ch));
        source.advance();
        this.push('op', ch, ch, line, column);
    };

    // The tokens of a text; options.attachment(name) - the text of a file for $INCLUDE.
    Basic.lex = function (text, source, options) {
        return new Lexer(text, source, options).run();
    };
})(globalThis);
