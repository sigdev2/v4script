// Java: tokens. Java strings are UTF-16 like JavaScript strings, so a
// literal is kept as a JavaScript string as it is.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Java = T.java = T.java || {};
    if (Java.lex)
        return;

    var KEYWORDS = {};
    ('abstract assert boolean break byte case catch char class const continue default do double else enum extends ' +
     'final finally float for goto if implements import instanceof int interface long native new package private ' +
     'protected public return short static strictfp super switch synchronized this throw throws transient try void ' +
     'volatile while true false null').split(' ').forEach(function (word) { KEYWORDS[word] = true; });
    Java.KEYWORDS = KEYWORDS;

    var OPERATORS = [
        '>>>=', '<<=', '>>=', '...', '->', '::',
        '&&', '||', '++', '--', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<',
        '+', '-', '*', '/', '%', '&', '|', '^', '<', '>', '=', '!', '~', '?', ':', '(', ')', '[', ']', '{', '}', ',', ';',
        '.', '@'
    ];

    var SIMPLE_ESCAPES = { b: 8, t: 9, n: 10, f: 12, r: 13, s: 32, '"': 34, "'": 39, '\\': 92 };

    function token(type, value, text, line, column) {
        return { type: type, value: value, text: text, line: line, column: column };
    }

    // \uXXXX are replaced before parsing, as in Java.
    function unicodeEscapes(text) {
        if (text.indexOf('\\u') < 0)
            return text;
        return text.replace(/(\\+)u+([0-9a-fA-F]{4})/g, function (all, slashes, hex) {
            if (slashes.length % 2 === 0)
                return all;
            return slashes.substring(1) + String.fromCharCode(parseInt(hex, 16));
        });
    }

    // A text block """...""": the indentation is removed by the leftmost line.
    function textBlock(raw) {
        var lines = raw.split('\n');
        lines.shift();
        var minimum = Infinity;
        lines.forEach(function (line, index) {
            var last = index === lines.length - 1;
            if (line.trim() === '' && !last)
                return;
            var indent = /^[ \t]*/.exec(line)[0].length;
            minimum = Math.min(minimum, indent);
        });
        if (minimum === Infinity)
            minimum = 0;
        return lines.map(function (line, index) {
            var stripped = line.substring(Math.min(minimum, line.length));
            return index === lines.length - 1 ? stripped : stripped.replace(/[ \t]+$/, '');
        }).join('\n');
    }

    // Operators by the first character, the long ones first.
    var OPERATORS_BY_CHAR = Object.create(null);
    OPERATORS.forEach(function (op) {
        (OPERATORS_BY_CHAR[op.charAt(0)] = OPERATORS_BY_CHAR[op.charAt(0)] || []).push(op);
    });
    Object.keys(OPERATORS_BY_CHAR).forEach(function (first) {
        OPERATORS_BY_CHAR[first].sort(function (left, right) { return right.length - left.length; });
    });

    function isIdentifierPart(code) {
        return (code >= 97 && code <= 122) || (code >= 65 && code <= 90) || (code >= 48 && code <= 57) || code === 95 ||
            code === 36 || code >= 0x80;
    }

    function isHexDigit(code) {
        return (code >= 48 && code <= 57) || (code >= 97 && code <= 102) || (code >= 65 && code <= 70);
    }

    // The lexer walks character codes: regular expressions from a position
    // and substr over the whole text are slow in V4 (hundreds of
    // milliseconds on a long library source).
    Java.lex = function (input, source) {
        var text = unicodeEscapes(input.replace(/\r\n?/g, '\n'));
        var length = text.length;
        var pos = 0, line = 1, lineStart = 0;
        var tokens = [];

        function fail(message, atLine, atColumn) {
            throw new T.CompileError(message, atLine || line, atColumn || pos - lineStart + 1, source || '');
        }
        function code(at) {
            return at < length ? text.charCodeAt(at) : -1;
        }
        // A shift inside a line without line breaks.
        function skip(count) {
            pos += count;
        }
        function startsAt(at, prefix) {
            for (var index = 0; index < prefix.length; ++index)
                if (text.charCodeAt(at + index) !== prefix.charCodeAt(index))
                    return false;
            return at + prefix.length <= length;
        }
        // An escape after "\" (pos is at the character after "\").
        function escape() {
            var ch = text.charAt(pos);
            var simple = SIMPLE_ESCAPES[ch];
            if (simple !== undefined) {
                ++pos;
                return String.fromCharCode(simple);
            }
            if (ch >= '0' && ch <= '7') {
                var max = ch <= '3' ? 3 : 2;
                var end = pos;
                while (end < length && end - pos < max && text.charAt(end) >= '0' && text.charAt(end) <= '7')
                    ++end;
                var octal = text.substring(pos, end);
                pos = end;
                return String.fromCharCode(parseInt(octal, 8));
            }
            fail('illegal escape character');
        }
        function digits(isDigit) {
            while (pos < length && (isDigit(text.charCodeAt(pos)) || text.charCodeAt(pos) === 95))
                ++pos;
        }
        function decimalDigit(code) {
            return code >= 48 && code <= 57;
        }

        while (pos < length) {
            var charCode = text.charCodeAt(pos);
            if (charCode === 32 || charCode === 9 || charCode === 12) {
                ++pos;
                continue;
            }
            if (charCode === 10) {
                ++pos;
                ++line;
                lineStart = pos;
                continue;
            }
            if (charCode === 47 && code(pos + 1) === 47) {
                var lineEnd = text.indexOf('\n', pos);
                pos = lineEnd < 0 ? length : lineEnd;
                continue;
            }
            var tokenLine = line, column = pos - lineStart + 1;
            if (charCode === 47 && code(pos + 1) === 42) {
                var close = text.indexOf('*/', pos + 2);
                if (close < 0)
                    fail('unclosed comment', tokenLine, column);
                for (var at = pos; at < close; ++at) {
                    if (text.charCodeAt(at) === 10) {
                        ++line;
                        lineStart = at + 1;
                    }
                }
                pos = close + 2;
                continue;
            }
            var start = pos;
            if (charCode === 34 && startsAt(pos, '"""')) {
                pos += 3;
                while (pos < length && (text.charCodeAt(pos) === 32 || text.charCodeAt(pos) === 9))
                    ++pos;
                if (code(pos) !== 10)
                    fail('illegal text block open delimiter sequence, missing line terminator');
                var raw = '';
                for (;;) {
                    if (pos >= length)
                        fail('unclosed text block', tokenLine, column);
                    if (startsAt(pos, '"""')) {
                        pos += 3;
                        break;
                    }
                    var blockChar = text.charAt(pos);
                    if (blockChar === '\\') {
                        ++pos;
                        if (text.charAt(pos) === '\n') {
                            ++pos;
                            ++line;
                            lineStart = pos;
                            raw += '\u0001';
                            continue;
                        }
                        raw += '\u0002' + escape().charCodeAt(0) + '\u0003';
                        continue;
                    }
                    if (blockChar === '\n') {
                        ++line;
                        lineStart = pos + 1;
                    }
                    raw += blockChar;
                    ++pos;
                }
                var value = textBlock(raw).replace(/\u0001\n?/g, '').replace(/\u0002(\d+)\u0003/g, function (all, number) {
                    return String.fromCharCode(Number(number));
                });
                tokens.push(token('string', value, text.substring(start, pos), tokenLine, column));
                continue;
            }
            if (charCode === 34 || charCode === 39) {
                var quote = text.charAt(pos);
                ++pos;
                var content = '';
                var chunk = pos;
                for (;;) {
                    if (pos >= length || text.charCodeAt(pos) === 10)
                        fail(charCode === 34 ? 'unclosed string literal' : 'unclosed character literal', tokenLine,
                             column);
                    var current = text.charCodeAt(pos);
                    if (current === charCode) {
                        content += text.substring(chunk, pos);
                        ++pos;
                        break;
                    }
                    if (current === 92) {
                        content += text.substring(chunk, pos);
                        ++pos;
                        content += escape();
                        chunk = pos;
                        continue;
                    }
                    ++pos;
                }
                if (charCode === 39) {
                    if (content.length === 0)
                        fail('empty character literal', tokenLine, column);
                    if (content.length !== 1)
                        fail('unclosed character literal', tokenLine, column);
                    tokens.push(token('char', content.charCodeAt(0), text.substring(start, pos), tokenLine, column));
                } else {
                    tokens.push(token('string', content, text.substring(start, pos), tokenLine, column));
                }
                void quote;
                continue;
            }
            if (decimalDigit(charCode) || (charCode === 46 && decimalDigit(code(pos + 1)))) {
                var isFloat = false;
                var next = code(pos + 1);
                if (charCode === 48 && (next === 120 || next === 88)) {
                    pos += 2;
                    digits(isHexDigit);
                    if (code(pos) === 46) {
                        ++pos;
                        digits(isHexDigit);
                        isFloat = true;
                    }
                    if (code(pos) === 112 || code(pos) === 80) {
                        ++pos;
                        if (code(pos) === 43 || code(pos) === 45)
                            ++pos;
                        digits(decimalDigit);
                        isFloat = true;
                    }
                } else if (charCode === 48 && (next === 98 || next === 66)) {
                    pos += 2;
                    digits(function (digit) { return digit === 48 || digit === 49; });
                } else {
                    digits(decimalDigit);
                    if (code(pos) === 46 && !(code(pos + 1) === 46)) {
                        ++pos;
                        digits(decimalDigit);
                        isFloat = true;
                    }
                    var marker = code(pos);
                    if (marker === 101 || marker === 69) {
                        var afterSign = code(pos + 1) === 43 || code(pos + 1) === 45 ? pos + 2 : pos + 1;
                        if (decimalDigit(code(afterSign))) {
                            pos = afterSign;
                            digits(decimalDigit);
                            isFloat = true;
                        }
                    }
                }
                var suffix = code(pos);
                if (suffix === 108 || suffix === 76) {
                    ++pos;
                    isFloat = false;
                } else if (suffix === 102 || suffix === 70 || suffix === 100 || suffix === 68) {
                    ++pos;
                    isFloat = true;
                }
                var number = text.substring(start, pos);
                if (isIdentifierPart(code(pos)))
                    fail("';' expected");
                tokens.push(token(isFloat ? 'float' : 'int', number, number, tokenLine, column));
                continue;
            }
            if (T.isLetter(charCode) || charCode === 36) {
                ++pos;
                while (pos < length && isIdentifierPart(text.charCodeAt(pos)))
                    ++pos;
                var word = text.substring(start, pos);
                tokens.push(token(KEYWORDS[word] === true ? 'keyword' : 'ident', word, word, tokenLine, column));
                continue;
            }
            var candidates = OPERATORS_BY_CHAR[text.charAt(pos)];
            var operator = null;
            for (var index = 0; candidates !== undefined && index < candidates.length; ++index) {
                if (startsAt(pos, candidates[index])) {
                    operator = candidates[index];
                    break;
                }
            }
            if (operator === null)
                fail("illegal character: '" + text.charAt(pos) + "'");
            skip(operator.length);
            tokens.push(token('op', operator, operator, tokenLine, column));
        }
        tokens.push(token('eof', '', '', line, pos - lineStart + 1));
        return tokens;
    };
})(globalThis);
