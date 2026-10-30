// C#: tokens and the preprocessor. C# strings are UTF-16 like JavaScript
// strings, so a literal is kept as a JavaScript string as it is.
// Interpolated strings are one token with their parts; the expressions of
// the holes are tokens too (parsed by parser-expressions.js). See
// docs/internals/csharp.md.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp = T.csharp || {};
    if (CS.lex)
        return;

    var KEYWORDS = {};
    ('abstract as base bool break byte case catch char checked class const continue decimal default delegate do ' +
     'double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface ' +
     'internal is lock long namespace new null object operator out override params private protected public readonly ' +
     'ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ' +
     'ulong unchecked unsafe ushort using virtual void volatile while').split(' ').forEach(function (word) {
        KEYWORDS[word] = true;
    });
    CS.KEYWORDS = KEYWORDS;

    // ">" is always a token of its own: the parser joins ">" ">" into a shift
    // when they stand side by side (List<List<int>> closes two lists).
    var OPERATORS = [
        '<<=', '??=', '...',
        '=>', '==', '!=', '<=', '&&', '||', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '??',
        '?.', '::', '..', '->',
        '+', '-', '*', '/', '%', '&', '|', '^', '<', '>', '=', '!', '~', '?', ':', '(', ')', '[', ']', '{', '}', ',', ';',
        '.'
    ];

    var OPERATORS_BY_CHAR = Object.create(null);
    OPERATORS.forEach(function (op) {
        (OPERATORS_BY_CHAR[op.charAt(0)] = OPERATORS_BY_CHAR[op.charAt(0)] || []).push(op);
    });
    Object.keys(OPERATORS_BY_CHAR).forEach(function (first) {
        OPERATORS_BY_CHAR[first].sort(function (left, right) { return right.length - left.length; });
    });

    var SIMPLE_ESCAPES = { "'": 39, '"': 34, '\\': 92, '0': 0, a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11 };

    function isIdentifierStart(code) {
        return (code >= 97 && code <= 122) || (code >= 65 && code <= 90) || code === 95 ||
            (code >= 0x80 && T.isLetter(code));
    }

    function isIdentifierPart(code) {
        return (code >= 97 && code <= 122) || (code >= 65 && code <= 90) || (code >= 48 && code <= 57) || code === 95 ||
            (code >= 0x80 && T.isLetter(code));
    }

    function isDecimalDigit(code) {
        return code >= 48 && code <= 57;
    }

    function isHexDigit(code) {
        return (code >= 48 && code <= 57) || (code >= 97 && code <= 102) || (code >= 65 && code <= 70);
    }

    function isBinaryDigit(code) {
        return code === 48 || code === 49;
    }

    function isSpace(code) {
        return code === 32 || code === 9 || code === 11 || code === 12 || code === 0xFEFF || code === 0xA0;
    }

    function Lexer(text, source, defines) {
        this.text = text;
        this.length = text.length;
        this.source = source || '';
        this.pos = 0;
        this.line = 1;
        this.lineStart = 0;
        // The preprocessor: defined symbols and the stack of #if sections
        // ({ active, taken, sawElse, line }).
        this.defines = defines || Object.create(null);
        this.conditions = [];
        // Whitespace or a comment before the current token.
        this.spaced = false;
        this.lineBreak = false;
        this.atLineStart = true;
    }

    Lexer.prototype.fail = function (code, message, line, column) {
        throw new T.CompileError('error ' + code + ': ' + message, line || this.line, column || this.pos - this.lineStart + 1,
                                 this.source);
    };

    Lexer.prototype.code = function (at) {
        return at < this.length ? this.text.charCodeAt(at) : -1;
    };

    Lexer.prototype.startsAt = function (at, prefix) {
        for (var index = 0; index < prefix.length; ++index) {
            if (this.text.charCodeAt(at + index) !== prefix.charCodeAt(index))
                return false;
        }
        return at + prefix.length <= this.length;
    };

    Lexer.prototype.newline = function () {
        ++this.pos;
        ++this.line;
        this.lineStart = this.pos;
        this.atLineStart = true;
        this.lineBreak = true;
    };

    Lexer.prototype.token = function (type, value, start, line, column) {
        var token = { type: type, value: value, text: this.text.substring(start, this.pos), line: line, column: column,
                      spaced: this.spaced, newline: this.lineBreak, start: start, end: this.pos };
        this.spaced = false;
        this.lineBreak = false;
        this.atLineStart = false;
        return token;
    };

    // Whitespace, comments and preprocessor lines; inactive #if sections
    // are skipped here too.
    Lexer.prototype.skipTrivia = function () {
        for (;;) {
            var code = this.code(this.pos);
            if (code === 35 && this.atLineStart) {
                this.directive();
                continue;
            }
            if (this.conditions.length > 0 && !this.conditions[this.conditions.length - 1].active && code !== -1 &&
                code !== 10 && !isSpace(code)) {
                // An inactive section: the rest of the line is skipped.
                var lineEnd = this.text.indexOf('\n', this.pos);
                this.pos = lineEnd < 0 ? this.length : lineEnd;
                continue;
            }
            if (code === 10) {
                this.newline();
                this.spaced = true;
                continue;
            }
            if (code === 13) {
                ++this.pos;
                this.spaced = true;
                continue;
            }
            if (isSpace(code)) {
                ++this.pos;
                this.spaced = true;
                continue;
            }
            if (code === 47 && this.code(this.pos + 1) === 47) {
                var end = this.text.indexOf('\n', this.pos);
                this.pos = end < 0 ? this.length : end;
                this.spaced = true;
                continue;
            }
            if (code === 47 && this.code(this.pos + 1) === 42) {
                var startLine = this.line, startColumn = this.pos - this.lineStart + 1;
                var close = this.text.indexOf('*/', this.pos + 2);
                if (close < 0)
                    this.fail('CS1035', "End-of-file found, '*/' expected", startLine, startColumn);
                for (var at = this.pos; at < close; ++at) {
                    if (this.text.charCodeAt(at) === 10) {
                        ++this.line;
                        this.lineStart = at + 1;
                        this.lineBreak = true;
                    }
                }
                this.pos = close + 2;
                this.spaced = true;
                continue;
            }
            return;
        }
    };

    // --- The preprocessor

    // #if, #elif, #else, #endif, #define, #undef, #error; #region, #pragma,
    // #nullable, #line and #warning do nothing.
    Lexer.prototype.directive = function () {
        var line = this.line, column = this.pos - this.lineStart + 1;
        var end = this.text.indexOf('\n', this.pos);
        if (end < 0)
            end = this.length;
        var content = this.text.substring(this.pos + 1, end).replace(/\r$/, '');
        var comment = content.indexOf('//');
        var word = /^\s*([a-z]*)/.exec(content)[1];
        var rest = content.substring(content.indexOf(word) + word.length);
        if (comment >= 0 && word !== 'region' && word !== 'endregion' && word !== 'error' && word !== 'warning')
            rest = rest.substring(0, rest.indexOf('//') >= 0 ? rest.indexOf('//') : rest.length);
        rest = rest.trim();
        this.pos = end;
        var top = this.conditions.length > 0 ? this.conditions[this.conditions.length - 1] : null;
        var outerActive = this.conditions.every(function (item, index, list) {
            return index === list.length - 1 || item.active;
        });
        var active = top === null || top.active;
        switch (word) {
        case 'if':
            this.conditions.push({ active: active && this.condition(rest, line), taken: false, sawElse: false, line: line });
            this.conditions[this.conditions.length - 1].taken = this.conditions[this.conditions.length - 1].active;
            break;
        case 'elif':
            if (top === null || top.sawElse)
                this.fail('CS1028', 'Unexpected preprocessor directive', line, column);
            top.active = !top.taken && outerActive && this.condition(rest, line);
            top.taken = top.taken || top.active;
            break;
        case 'else':
            if (top === null || top.sawElse)
                this.fail('CS1028', 'Unexpected preprocessor directive', line, column);
            top.sawElse = true;
            top.active = !top.taken && outerActive;
            top.taken = true;
            break;
        case 'endif':
            if (top === null)
                this.fail('CS1028', 'Unexpected preprocessor directive', line, column);
            this.conditions.pop();
            break;
        case 'define':
        case 'undef':
            if (active) {
                if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(rest))
                    this.fail('CS1001', 'Identifier expected', line, column);
                if (word === 'define')
                    this.defines[rest] = true;
                else
                    delete this.defines[rest];
            }
            break;
        case 'error':
            if (active)
                this.fail('CS1029', '#error: \'' + rest + '\'', line, column);
            break;
        case 'region':
        case 'endregion':
        case 'pragma':
        case 'nullable':
        case 'line':
        case 'warning':
            break;
        default:
            if (active)
                this.fail('CS1024', 'Preprocessor directive expected', line, column);
        }
    };

    // A condition of #if: symbols, true, false, !, ==, !=, &&, || and parentheses.
    Lexer.prototype.condition = function (text, line) {
        var self = this;
        var parts = text.match(/\s*(\|\||&&|==|!=|!|\(|\)|[A-Za-z_][A-Za-z0-9_]*)/g);
        var index = 0;
        if (parts === null || parts.join('').replace(/\s+/g, '') !== text.replace(/\s+/g, ''))
            this.fail('CS1517', 'Invalid preprocessor expression', line, 1);
        parts = parts.map(function (part) { return part.trim(); });
        function primary() {
            var part = parts[index++];
            if (part === '!')
                return !primary();
            if (part === '(') {
                var value = or();
                if (parts[index++] !== ')')
                    self.fail('CS1026', ') expected', line, 1);
                return value;
            }
            if (part === 'true')
                return true;
            if (part === 'false')
                return false;
            if (part === undefined || !/^[A-Za-z_]/.test(part))
                self.fail('CS1517', 'Invalid preprocessor expression', line, 1);
            return self.defines[part] === true;
        }
        function equality() {
            var value = primary();
            while (parts[index] === '==' || parts[index] === '!=') {
                var op = parts[index++];
                var right = primary();
                value = op === '==' ? value === right : value !== right;
            }
            return value;
        }
        function and() {
            var value = equality();
            while (parts[index] === '&&') {
                ++index;
                value = equality() && value;
            }
            return value;
        }
        function or() {
            var value = and();
            while (parts[index] === '||') {
                ++index;
                value = and() || value;
            }
            return value;
        }
        var result = or();
        if (index !== parts.length)
            this.fail('CS1517', 'Invalid preprocessor expression', line, 1);
        return result;
    };

    // --- Literals

    // An escape after "\" (pos is at "\").
    Lexer.prototype.escape = function () {
        var start = this.pos;
        ++this.pos;
        var ch = this.text.charAt(this.pos);
        var simple = SIMPLE_ESCAPES[ch];
        if (simple !== undefined) {
            ++this.pos;
            return String.fromCharCode(simple);
        }
        if (ch === 'x' || ch === 'u' || ch === 'U') {
            var max = ch === 'x' ? 4 : (ch === 'u' ? 4 : 8);
            var min = ch === 'x' ? 1 : max;
            ++this.pos;
            var digitsStart = this.pos;
            while (this.pos - digitsStart < max && isHexDigit(this.code(this.pos)))
                ++this.pos;
            if (this.pos - digitsStart < min)
                this.fail('CS1009', 'Unrecognized escape sequence', this.line, start - this.lineStart + 1);
            var value = parseInt(this.text.substring(digitsStart, this.pos), 16);
            if (value > 0xFFFF) {
                if (value > 0x10FFFF)
                    this.fail('CS1009', 'Unrecognized escape sequence', this.line, start - this.lineStart + 1);
                value -= 0x10000;
                return String.fromCharCode(0xD800 + (value >> 10), 0xDC00 + (value & 0x3FF));
            }
            return String.fromCharCode(value);
        }
        this.fail('CS1009', 'Unrecognized escape sequence', this.line, start - this.lineStart + 1);
    };

    // "..." (pos after the quote); stops at the closing quote.
    Lexer.prototype.regularString = function (line, column) {
        var content = '';
        var chunk = this.pos;
        for (;;) {
            var code = this.code(this.pos);
            if (code === -1 || code === 10 || code === 13)
                this.fail('CS1010', 'Newline in constant', line, column);
            if (code === 34) {
                content += this.text.substring(chunk, this.pos);
                ++this.pos;
                return content;
            }
            if (code === 92) {
                content += this.text.substring(chunk, this.pos);
                content += this.escape();
                chunk = this.pos;
                continue;
            }
            ++this.pos;
        }
    };

    // @"..." (pos after the quote): "" is a quote, lines may break.
    Lexer.prototype.verbatimString = function (line, column) {
        var content = '';
        var chunk = this.pos;
        for (;;) {
            var code = this.code(this.pos);
            if (code === -1)
                this.fail('CS1039', 'Unterminated string literal', line, column);
            if (code === 34) {
                content += this.text.substring(chunk, this.pos);
                ++this.pos;
                if (this.code(this.pos) === 34) {
                    content += '"';
                    ++this.pos;
                    chunk = this.pos;
                    continue;
                }
                return content.replace(/\r\n/g, '\n');
            }
            if (code === 10) {
                ++this.line;
                this.lineStart = this.pos + 1;
            }
            ++this.pos;
        }
    };

    // The number of quotes of a raw string at pos (3 or more).
    Lexer.prototype.quoteRun = function (at) {
        var count = 0;
        while (this.code(at + count) === 34)
            ++count;
        return count;
    };

    // Indentation of a multi-line raw string: the whitespace before the
    // closing quotes is removed from every line; the first and the last
    // line break go. parts: text strings and holes.
    function rawIndentation(lexer, parts, line, column) {
        var first = parts.length > 0 && typeof parts[0] === 'string' ? parts[0] : '';
        if (first.indexOf('\n') < 0 || /\S/.test(first.substring(0, first.indexOf('\n'))))
            lexer.fail('CS8999', 'Line does not start with the same whitespace as the closing line of the raw string literal',
                       line, column);
        var last = typeof parts[parts.length - 1] === 'string' ? parts[parts.length - 1] : '';
        var lastBreak = last.lastIndexOf('\n');
        if (lastBreak < 0 || /\S/.test(last.substring(lastBreak + 1)))
            lexer.fail('CS9000', 'Raw string literal delimiter must be on its own line', line, column);
        var indent = last.substring(lastBreak + 1);
        parts[parts.length - 1] = last.substring(0, lastBreak);
        parts[0] = parts[0].substring(parts[0].indexOf('\n') + 1);
        return parts.map(function (part, index) {
            if (typeof part !== 'string')
                return part;
            var lines = part.split('\n');
            return lines.map(function (text, lineIndex) {
                // The first line of a part after a hole continues that line.
                if (lineIndex === 0 && index > 0)
                    return text;
                if (text.substring(0, indent.length) === indent)
                    return text.substring(indent.length);
                if (/^\s*$/.test(text))
                    return '';
                lexer.fail('CS9003', 'Line does not start with the same whitespace as the closing line of the raw string literal',
                           line, column);
            }).join('\n');
        });
    }

    // """...""" (pos at the first quote): a raw string without holes.
    Lexer.prototype.rawString = function (line, column) {
        var quotes = this.quoteRun(this.pos);
        this.pos += quotes;
        var start = this.pos;
        var delimiter = new Array(quotes + 1).join('"');
        for (;;) {
            if (this.pos >= this.length)
                this.fail('CS8997', 'Unterminated raw string literal', line, column);
            if (this.code(this.pos) === 34 && this.startsAt(this.pos, delimiter)) {
                var content = this.text.substring(start, this.pos).replace(/\r\n/g, '\n');
                this.pos += quotes;
                if (this.code(this.pos) === 34)
                    this.fail('CS8998', 'The raw string literal does not start with enough quote characters to allow this many consecutive quote characters as content', line, column);
                if (content.indexOf('\n') < 0)
                    return content;
                return rawIndentation(this, [content], line, column)[0];
            }
            if (this.code(this.pos) === 10) {
                ++this.line;
                this.lineStart = this.pos + 1;
            }
            ++this.pos;
        }
    };

    // An interpolated string (pos after the $ signs, at " or @"): parts
    // are text strings and holes { tokens, alignment, format, line,
    // column }. dollars - the number of $ (raw strings: the braces of a
    // hole).
    Lexer.prototype.interpolated = function (line, column, dollars, verbatim) {
        var parts = [];
        var text = '';
        var raw = false, quotes = 1;
        if (this.code(this.pos) === 34 && this.quoteRun(this.pos) >= 3 && !verbatim) {
            raw = true;
            quotes = this.quoteRun(this.pos);
        }
        this.pos += raw ? quotes : 1;
        var delimiter = new Array(quotes + 1).join('"');
        var braces = raw ? dollars : 1;
        for (;;) {
            var code = this.code(this.pos);
            if (code === -1)
                this.fail(raw ? 'CS8997' : 'CS1039', raw ? 'Unterminated raw string literal' : 'Unterminated string literal',
                          line, column);
            if (code === 34) {
                if (raw) {
                    if (this.startsAt(this.pos, delimiter)) {
                        this.pos += quotes;
                        break;
                    }
                    text += '"';
                    ++this.pos;
                    continue;
                }
                if (verbatim && this.code(this.pos + 1) === 34) {
                    text += '"';
                    this.pos += 2;
                    continue;
                }
                ++this.pos;
                break;
            }
            if ((code === 10 || code === 13) && !verbatim && !raw)
                this.fail('CS1010', 'Newline in constant', line, column);
            if (code === 10) {
                ++this.line;
                this.lineStart = this.pos + 1;
                text += '\n';
                ++this.pos;
                continue;
            }
            if (code === 13 && (verbatim || raw)) {
                ++this.pos;
                continue;
            }
            if (code === 92 && !verbatim && !raw) {
                text += this.escape();
                continue;
            }
            if (code === 123) {
                var run = 0;
                while (this.code(this.pos + run) === 123)
                    ++run;
                if (!raw && run >= 2) {
                    text += '{';
                    this.pos += 2;
                    continue;
                }
                if (raw && run < braces) {
                    text += this.text.substring(this.pos, this.pos + run);
                    this.pos += run;
                    continue;
                }
                if (raw && run > braces) {
                    // Extra braces before the hole are text.
                    text += this.text.substring(this.pos, this.pos + run - braces);
                    this.pos += run - braces;
                }
                if (raw && run > 2 * braces - 1 && braces > 1)
                    this.fail('CS9006', 'The interpolated raw string literal does not start with enough \'$\' characters to allow this many consecutive opening braces as content', line, column);
                parts.push(text);
                text = '';
                this.pos += braces;
                parts.push(this.hole(braces, line, column));
                continue;
            }
            if (code === 125) {
                if (!raw) {
                    if (this.code(this.pos + 1) === 125) {
                        text += '}';
                        this.pos += 2;
                        continue;
                    }
                    this.fail('CS8086', "A '}' character must be escaped (by doubling) in an interpolated string.", this.line,
                              this.pos - this.lineStart + 1);
                }
                var closing = 0;
                while (this.code(this.pos + closing) === 125)
                    ++closing;
                if (closing >= braces)
                    this.fail('CS9007', 'Too many closing braces', this.line, this.pos - this.lineStart + 1);
                text += this.text.substring(this.pos, this.pos + closing);
                this.pos += closing;
                continue;
            }
            text += this.text.charAt(this.pos);
            ++this.pos;
        }
        parts.push(text);
        if (raw && parts.join('').indexOf('\n') >= 0) {
            var multiline = parts.some(function (part) { return typeof part === 'string' && part.indexOf('\n') >= 0; });
            if (multiline)
                parts = rawIndentation(this, parts, line, column);
        }
        return parts.filter(function (part, index) { return typeof part !== 'string' || part.length > 0 || index === 0; });
    };

    // A hole of an interpolated string (pos after "{"): the expression
    // tokens up to a top-level "," (alignment), ":" (format) or "}".
    Lexer.prototype.hole = function (braces, line, column) {
        var holeLine = this.line, holeColumn = this.pos - this.lineStart + 1;
        var tokens = [];
        var depth = 0;
        var alignment = null, format = null;
        var target = tokens;
        for (;;) {
            this.skipTrivia();
            var code = this.code(this.pos);
            if (code === -1)
                this.fail('CS1039', 'Unterminated string literal', line, column);
            if (depth === 0 && code === 125) {
                for (var index = 0; index < braces; ++index) {
                    if (this.code(this.pos + index) !== 125)
                        this.fail('CS8076', "Missing close delimiter '}' for interpolated expression started with '{'.", line,
                                  column);
                }
                this.pos += braces;
                break;
            }
            if (depth === 0 && code === 44 && target === tokens) {
                ++this.pos;
                alignment = [];
                target = alignment;
                continue;
            }
            if (depth === 0 && code === 58 && this.code(this.pos + 1) !== 58) {
                // The format: text up to the closing brace.
                ++this.pos;
                var start = this.pos;
                while (this.pos < this.length && this.code(this.pos) !== 125) {
                    if (this.code(this.pos) === 10)
                        this.fail('CS1010', 'Newline in constant', line, column);
                    ++this.pos;
                }
                format = this.text.substring(start, this.pos);
                continue;
            }
            var token = this.next();
            if (token.type === 'op') {
                if (token.value === '(' || token.value === '[' || token.value === '{')
                    ++depth;
                else if (token.value === ')' || token.value === ']' || token.value === '}')
                    --depth;
            }
            target.push(token);
        }
        if (tokens.length === 0)
            this.fail('CS1733', 'Expected expression', holeLine, holeColumn);
        var eof = { type: 'eof', value: '', text: '', line: this.line, column: this.pos - this.lineStart + 1, spaced: false,
                    newline: false, start: this.pos, end: this.pos };
        tokens.push(eof);
        if (alignment !== null)
            alignment.push(eof);
        return { tokens: tokens, alignment: alignment, format: format, line: holeLine, column: holeColumn };
    };

    // A number: { text (digits without "_" and the prefix), radix, suffix }.
    Lexer.prototype.number = function (line, column) {
        var code = this.code(this.pos);
        var next = this.code(this.pos + 1);
        var self = this;
        function digits(test) {
            var from = self.pos;
            while (self.pos < self.length && (test(self.code(self.pos)) || self.code(self.pos) === 95))
                ++self.pos;
            if (self.code(self.pos - 1) === 95)
                self.fail('CS1013', 'Invalid number', line, column);
            return self.text.substring(from, self.pos).replace(/_/g, '');
        }
        var radix = 10, whole, isReal = false, fraction = '', exponent = '';
        if (code === 48 && (next === 120 || next === 88)) {
            this.pos += 2;
            radix = 16;
            whole = digits(isHexDigit);
        } else if (code === 48 && (next === 98 || next === 66)) {
            this.pos += 2;
            radix = 2;
            whole = digits(isBinaryDigit);
        } else {
            whole = code === 46 ? '' : digits(isDecimalDigit);
            if (this.code(this.pos) === 46 && isDecimalDigit(this.code(this.pos + 1))) {
                ++this.pos;
                fraction = digits(isDecimalDigit);
                isReal = true;
            }
            var marker = this.code(this.pos);
            if (marker === 101 || marker === 69) {
                var afterSign = this.code(this.pos + 1) === 43 || this.code(this.pos + 1) === 45 ? this.pos + 2 : this.pos + 1;
                if (isDecimalDigit(this.code(afterSign))) {
                    var sign = this.code(this.pos + 1) === 45 ? '-' : '';
                    this.pos = afterSign;
                    exponent = sign + digits(isDecimalDigit);
                    isReal = true;
                } else {
                    this.fail('CS0595', 'Invalid real literal.', line, column);
                }
            }
        }
        if (whole === '' && radix !== 10)
            this.fail('CS1013', 'Invalid number', line, column);
        var suffix = '';
        var s1 = this.code(this.pos), s2 = this.code(this.pos + 1);
        var lower1 = s1 | 32, lower2 = s2 | 32;
        if (radix === 10 && (lower1 === 102 || lower1 === 100 || lower1 === 109)) {
            suffix = String.fromCharCode(lower1);
            ++this.pos;
            isReal = true;
        } else if (!isReal && (lower1 === 117 || lower1 === 108)) {
            if ((lower1 === 117 && lower2 === 108) || (lower1 === 108 && lower2 === 117)) {
                suffix = 'ul';
                this.pos += 2;
            } else {
                suffix = String.fromCharCode(lower1);
                ++this.pos;
            }
        }
        if (isIdentifierPart(this.code(this.pos)))
            this.fail('CS1002', '; expected', line, this.pos - this.lineStart + 1);
        if (isReal)
            return { type: 'real', value: { whole: whole || '0', fraction: fraction, exponent: exponent, suffix: suffix } };
        return { type: 'int', value: { digits: whole, radix: radix, suffix: suffix } };
    };

    // The next token after the trivia.
    Lexer.prototype.next = function () {
        this.skipTrivia();
        var line = this.line, column = this.pos - this.lineStart + 1;
        var start = this.pos;
        if (this.pos >= this.length) {
            if (this.conditions.length > 0)
                this.fail('CS1027', '#endif directive expected', line, column);
            return this.token('eof', '', start, line, column);
        }
        var code = this.code(this.pos);
        var next = this.code(this.pos + 1);
        // Strings: "...", @"...", """...""", $"...", $@"...", @$"...", $$"""...""".
        if (code === 34) {
            if (this.quoteRun(this.pos) >= 3)
                return this.token('string', this.rawString(line, column), start, line, column);
            ++this.pos;
            return this.token('string', this.regularString(line, column), start, line, column);
        }
        if (code === 64 && next === 34) {
            this.pos += 2;
            return this.token('string', this.verbatimString(line, column), start, line, column);
        }
        if (code === 36 || (code === 64 && next === 36)) {
            var at = this.pos;
            var verbatim = false;
            if (code === 64) {
                verbatim = true;
                ++at;
            }
            var dollars = 0;
            while (this.code(at + dollars) === 36)
                ++dollars;
            at += dollars;
            if (!verbatim && this.code(at) === 64) {
                verbatim = true;
                ++at;
            }
            if (this.code(at) === 34) {
                if (dollars > 1 && (verbatim || this.quoteRun(at) < 3))
                    this.fail('CS1056', "Unexpected character '$'", line, column);
                this.pos = at;
                var parts = this.interpolated(line, column, dollars, verbatim);
                return this.token('interp', parts, start, line, column);
            }
            this.fail('CS1056', "Unexpected character '" + this.text.charAt(this.pos) + "'", line, column);
        }
        if (code === 39) {
            ++this.pos;
            var value;
            var current = this.code(this.pos);
            if (current === 39)
                this.fail('CS1011', 'Empty character literal', line, column);
            if (current === -1 || current === 10 || current === 13)
                this.fail('CS1010', 'Newline in constant', line, column);
            if (current === 92) {
                value = this.escape();
                if (value.length !== 1)
                    this.fail('CS1012', 'Too many characters in character literal', line, column);
            } else {
                value = this.text.charAt(this.pos);
                ++this.pos;
            }
            if (this.code(this.pos) !== 39) {
                while (this.pos < this.length && this.code(this.pos) !== 39 && this.code(this.pos) !== 10)
                    ++this.pos;
                this.fail(this.code(this.pos) === 39 ? 'CS1012' : 'CS1010',
                          this.code(this.pos) === 39 ? 'Too many characters in character literal' : 'Newline in constant',
                          line, column);
            }
            ++this.pos;
            return this.token('char', value.charCodeAt(0), start, line, column);
        }
        if (isDecimalDigit(code) || (code === 46 && isDecimalDigit(next))) {
            var number = this.number(line, column);
            return this.token(number.type, number.value, start, line, column);
        }
        if (isIdentifierStart(code) || (code === 64 && isIdentifierStart(next)) || code === 92) {
            var verbatimName = code === 64;
            if (verbatimName)
                ++this.pos;
            var nameStart = this.pos;
            var name = '';
            for (;;) {
                var part = this.code(this.pos);
                if (isIdentifierPart(part)) {
                    ++this.pos;
                    continue;
                }
                if (part === 92 && (this.code(this.pos + 1) === 117 || this.code(this.pos + 1) === 85)) {
                    name += this.text.substring(nameStart, this.pos);
                    name += this.escape();
                    nameStart = this.pos;
                    continue;
                }
                break;
            }
            name += this.text.substring(nameStart, this.pos);
            if (name.length === 0)
                this.fail('CS1056', "Unexpected character '\\'", line, column);
            if (!verbatimName && KEYWORDS[name] === true)
                return this.token('keyword', name, start, line, column);
            var token = this.token('ident', name, start, line, column);
            if (verbatimName)
                token.verbatim = true;
            return token;
        }
        var candidates = OPERATORS_BY_CHAR[this.text.charAt(this.pos)];
        if (candidates !== undefined) {
            for (var index = 0; index < candidates.length; ++index) {
                if (this.startsAt(this.pos, candidates[index])) {
                    this.pos += candidates[index].length;
                    return this.token('op', candidates[index], start, line, column);
                }
            }
        }
        this.fail('CS1056', "Unexpected character '" + this.text.charAt(this.pos) + "'", line, column);
    };

    // The tokens of a text; source - the file name for errors.
    CS.lex = function (input, source, defines) {
        var lexer = new Lexer(input, source, defines);
        var tokens = [];
        for (;;) {
            var token = lexer.next();
            tokens.push(token);
            if (token.type === 'eof')
                return tokens;
        }
    };
    CS.isIdentifierStart = isIdentifierStart;
})(globalThis);
