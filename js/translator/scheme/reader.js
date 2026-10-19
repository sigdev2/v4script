// Scheme: reading text into data (the code of a unit, read,
// string->symbol...). The line of every pair read is remembered (S.lines) -
// translation and run-time errors name the line of the unit by it.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var S = T.scheme;
    if (S.Reader)
        return;

    var Pair = S.Pair, NIL = S.NIL;

    // Pair -> the source line where it opens. A Map, not a WeakMap: a
    // WeakMap with thousands of keys crashes V4 (Qt 6.4.1) during garbage
    // collection; the session clears the table before every unit.
    S.lines = new Map();

    var CHAR_NAMES = { alarm: 7, backspace: 8, 'delete': 127, escape: 27, newline: 10, 'null': 0, nul: 0,
                       'return': 13, space: 32, tab: 9, linefeed: 10, page: 12, rubout: 127, altmode: 27 };

    var QUOTES = { "'": 'quote', '`': 'quasiquote', ',': 'unquote', ',@': 'unquote-splicing' };

    function isDelimiter(character) {
        return character === '' || character === '(' || character === ')' || character === '[' || character === ']' ||
            character === '"' || character === ';' || /\s/.test(character);
    }

    // A read error: in code a translation error, in read a read-error object.
    function ReadError(message, line) {
        this.message = message;
        this.line = line;
    }

    function Placeholder(label) {
        this.label = label;
    }

    function Reader(text, source) {
        this.text = text;
        this.source = source || '';
        this.pos = 0;
        this.line = 1;
        this.foldCase = false;
        this.labels = null;
        this.lastLine = 1;
        if (text.charCodeAt(0) === 0xFEFF)
            this.pos = 1;
        // #! in the first line of a file is a launcher line.
        if (this.text.substr(this.pos, 2) === '#!' && !/^#!(fold-case|no-fold-case)/.test(this.text.substr(this.pos))) {
            while (this.pos < this.text.length && this.text.charAt(this.pos) !== '\n')
                ++this.pos;
        }
    }

    Reader.prototype.fail = function (message, line) {
        throw new ReadError(message, line || this.line);
    };

    Reader.prototype.peek = function () {
        return this.text.charAt(this.pos);
    };

    Reader.prototype.next = function () {
        var character = this.text.charAt(this.pos++);
        if (character === '\n')
            ++this.line;
        return character;
    };

    // Skips spaces and comments; false at the end of the text.
    Reader.prototype.skip = function () {
        var text = this.text;
        for (;;) {
            if (this.pos >= text.length)
                return false;
            var character = text.charAt(this.pos);
            if (character === ';') {
                while (this.pos < text.length && text.charAt(this.pos) !== '\n')
                    ++this.pos;
                continue;
            }
            if (character === '#' && text.charAt(this.pos + 1) === '|') {
                var start = this.line;
                this.pos += 2;
                var depth = 1;
                while (depth > 0) {
                    if (this.pos >= text.length)
                        this.fail("unterminated block comment '#|'", start);
                    if (text.charAt(this.pos) === '|' && text.charAt(this.pos + 1) === '#') {
                        --depth;
                        this.pos += 2;
                    } else if (text.charAt(this.pos) === '#' && text.charAt(this.pos + 1) === '|') {
                        ++depth;
                        this.pos += 2;
                    } else {
                        this.next();
                    }
                }
                continue;
            }
            if (character === '#' && text.charAt(this.pos + 1) === ';') {
                this.pos += 2;
                var line = this.line;
                if (this.readItem() === S.EOF)
                    this.fail("'#;' at end of code", line);
                continue;
            }
            if (character === '#' && text.charAt(this.pos + 1) === '!') {
                var directive = /^#!(fold-case|no-fold-case)/.exec(text.substr(this.pos, 16));
                if (directive !== null && isDelimiter(text.charAt(this.pos + directive[0].length))) {
                    this.foldCase = directive[1] === 'fold-case';
                    this.pos += directive[0].length;
                    continue;
                }
            }
            if (/\s/.test(character)) {
                this.next();
                continue;
            }
            return true;
        }
    };

    // The next value or S.EOF.
    Reader.prototype.read = function () {
        this.labels = null;
        if (!this.skip())
            return S.EOF;
        this.lastLine = this.line;
        var value = this.readItem();
        if (value === CLOSE)
            this.fail("unexpected ')'");
        if (value === DOT)
            this.fail("unexpected '.'");
        return value;
    };

    var CLOSE = { close: true };
    var DOT = { dot: true };

    Reader.prototype.readItem = function () {
        if (!this.skip())
            return S.EOF;
        var line = this.line;
        var character = this.next();
        switch (character) {
        case '(':
        case '[':
            return this.readList(character === '(' ? ')' : ']', line);
        case ')':
        case ']':
            return CLOSE;
        case '"':
            return S.str(this.readString('"', line));
        case "'":
        case '`':
            return this.readQuoted(QUOTES[character], line);
        case ',':
            if (this.peek() === '@') {
                this.next();
                return this.readQuoted('unquote-splicing', line);
            }
            return this.readQuoted('unquote', line);
        case '|': {
            var name = this.readString('|', line);
            return S.intern(name);
        }
        case '#':
            return this.readHash(line);
        }
        --this.pos;
        var token = this.token();
        if (token === '.')
            return DOT;
        var number = S.N.parse(token, 10);
        if (number !== null)
            return number;
        return S.intern(this.foldCase ? token.toLowerCase() : token);
    };

    Reader.prototype.token = function () {
        var start = this.pos;
        while (this.pos < this.text.length && !isDelimiter(this.text.charAt(this.pos))) {
            if (this.text.charAt(this.pos) === '|')
                break;
            ++this.pos;
        }
        return this.text.substring(start, this.pos);
    };

    Reader.prototype.readQuoted = function (name, line) {
        var value = this.readItem();
        if (value === S.EOF || value === CLOSE || value === DOT)
            this.fail("nothing after '" + (name === 'quote' ? "'" : name === 'quasiquote' ? '`' : name === 'unquote' ? ',' : ',@') + "'", line);
        var pair = new Pair(S.intern(name), new Pair(value, NIL));
        S.lines.set(pair, line);
        return pair;
    };

    Reader.prototype.readList = function (closer, line) {
        var items = [];
        var tail = NIL;
        for (;;) {
            var item = this.readItem();
            if (item === S.EOF)
                this.fail("missing ')' for '(' on line " + line, line);
            if (item === CLOSE)
                break;
            if (item === DOT) {
                if (items.length === 0)
                    this.fail("unexpected '.'");
                tail = this.readItem();
                if (tail === S.EOF || tail === CLOSE || tail === DOT)
                    this.fail('bad dotted list');
                var end = this.readItem();
                if (end !== CLOSE)
                    this.fail(end === S.EOF ? "missing ')' for '(' on line " + line : "more than one item after '.'", line);
                break;
            }
            items.push(item);
        }
        var result = tail;
        for (var index = items.length - 1; index >= 0; --index)
            result = new Pair(items[index], result);
        if (result instanceof Pair)
            S.lines.set(result, line);
        return result;
    };

    // The text up to the closing quote with escape sequences.
    Reader.prototype.readString = function (quote, line) {
        var parts = [];
        for (;;) {
            if (this.pos >= this.text.length)
                this.fail(quote === '"' ? 'unterminated string' : "unterminated '|'", line);
            var character = this.next();
            if (character === quote)
                break;
            if (character !== '\\') {
                parts.push(character);
                continue;
            }
            var escape = this.next();
            switch (escape) {
            case 'a': parts.push('\x07'); break;
            case 'b': parts.push('\b'); break;
            case 't': parts.push('\t'); break;
            case 'n': parts.push('\n'); break;
            case 'r': parts.push('\r'); break;
            case '"': parts.push('"'); break;
            case '\\': parts.push('\\'); break;
            case '|': parts.push('|'); break;
            case 'x':
            case 'X': {
                var end = this.text.indexOf(';', this.pos);
                var digits = end < 0 ? '' : this.text.substring(this.pos, end);
                if (!/^[0-9a-fA-F]{1,6}$/.test(digits) || parseInt(digits, 16) > 0x10FFFF)
                    this.fail('bad \\x escape in string');
                parts.push(String.fromCodePoint(parseInt(digits, 16)));
                this.pos = end + 1;
                break;
            }
            default:
                if (/[ \t\r\n]/.test(escape)) {
                    // \ at the end of a line: the line break and the indentation around do not count.
                    var newline = escape === '\n';
                    while (/[ \t\r]/.test(this.peek()))
                        this.next();
                    if (!newline && this.peek() === '\n') {
                        newline = true;
                        this.next();
                    }
                    if (!newline)
                        this.fail("bad escape '\\ '");
                    while (/[ \t]/.test(this.peek()))
                        this.next();
                    break;
                }
                this.fail("unknown escape '\\" + escape + "'");
            }
        }
        return parts.join('');
    };

    Reader.prototype.readHash = function (line) {
        var character = this.peek();
        if (character === '(') {
            this.next();
            var list = this.readList(')', line);
            var vector = S.listToArray(list);
            if (vector === null)
                this.fail('bad vector syntax', line);
            return vector;
        }
        if (character === '\\') {
            this.next();
            var first = this.text.codePointAt(this.pos);
            if (first === undefined)
                this.fail("'#\\' at end of code", line);
            this.pos += first > 0xFFFF ? 2 : 1;
            if (first === 10)
                ++this.line;
            var rest = isDelimiter(String.fromCodePoint(first)) ? '' : this.token();
            if (rest.length === 0)
                return S.char(first);
            var name = String.fromCodePoint(first) + rest;
            var lower = this.foldCase ? name.toLowerCase() : name;
            if (CHAR_NAMES[lower] !== undefined && Object.prototype.hasOwnProperty.call(CHAR_NAMES, lower))
                return S.char(CHAR_NAMES[lower]);
            if ((first === 120 || first === 88) && /^[0-9a-fA-F]+$/.test(rest)) {
                var code = parseInt(rest, 16);
                if (code <= 0x10FFFF)
                    return S.char(code);
            }
            this.fail('unknown character name #\\' + name, line);
        }
        if (/\d/.test(character)) {
            var match = /^(\d+)([=#])/.exec(this.text.substr(this.pos, 12));
            if (match !== null) {
                this.pos += match[0].length;
                return this.readLabel(Number(match[1]), match[2], line);
            }
        }
        var token = this.token();
        var lowerToken = token.toLowerCase();
        if (lowerToken === 't' || lowerToken === 'true')
            return true;
        if (lowerToken === 'f' || lowerToken === 'false')
            return false;
        if (lowerToken === 'u8' && this.peek() === '(') {
            this.next();
            var bytes = S.listToArray(this.readList(')', line));
            if (bytes === null || !bytes.every(function (byte) {
                return typeof byte === 'number' && byte >= 0 && byte <= 255 && Number.isInteger(byte);
            }))
                this.fail('bad bytevector: elements must be exact integers 0..255', line);
            return new Uint8Array(bytes);
        }
        if (lowerToken === '!eof')
            return S.EOF;
        if (lowerToken === '!default')
            return S.DEFAULT;
        if (lowerToken === '!unspecific')
            return S.UNSPEC;
        var number = S.N.parse('#' + token, 10);
        if (number !== null)
            return number;
        this.fail("bad syntax '#" + token + "'", line);
    };

    Reader.prototype.readLabel = function (label, kind, line) {
        if (this.labels === null)
            this.labels = new Map();
        if (kind === '#') {
            if (!this.labels.has(label))
                this.fail('undefined label #' + label + '#', line);
            return this.labels.get(label);
        }
        var placeholder = new Placeholder(label);
        this.labels.set(label, placeholder);
        var value = this.readItem();
        if (value === S.EOF || value === CLOSE || value === DOT)
            this.fail('nothing after #' + label + '=', line);
        this.labels.set(label, value);
        return patch(value, placeholder, value, new Set());
    };

    // Replaces the placeholder of a label in a value read already.
    function patch(value, placeholder, replacement, seen) {
        if (value === placeholder)
            return replacement;
        if (seen.has(value))
            return value;
        if (value instanceof Pair) {
            seen.add(value);
            var pair = value;
            while (pair instanceof Pair) {
                pair.car = patch(pair.car, placeholder, replacement, seen);
                if (pair.cdr === placeholder) {
                    pair.cdr = replacement;
                    break;
                }
                if (!(pair.cdr instanceof Pair) || seen.has(pair.cdr)) {
                    pair.cdr = patch(pair.cdr, placeholder, replacement, seen);
                    break;
                }
                pair = pair.cdr;
                seen.add(pair);
            }
        } else if (Array.isArray(value)) {
            seen.add(value);
            for (var index = 0; index < value.length; ++index)
                value[index] = patch(value[index], placeholder, replacement, seen);
        }
        return value;
    }

    // All values of a text (the code of a unit or of a file). An error is a CompileError.
    S.readAll = function (text, source) {
        var reader = new Reader(text, source);
        var result = [];
        try {
            for (;;) {
                var value = reader.read();
                if (value === S.EOF)
                    break;
                result.push({ datum: value, line: reader.lastLine || 0 });
            }
        } catch (error) {
            if (error instanceof ReadError)
                throw new T.CompileError(error.message, error.line, 0, source || '');
            throw error;
        }
        return result;
    };

    S.Reader = Reader;
    S.ReadError = ReadError;
})(globalThis);
