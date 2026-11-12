// Kotlin: tokens. A token knows whether a line break or a space is before
// it (newline, space): Kotlin separates statements by line breaks, and
// "@" is an annotation or a label by the spaces around it. A string with
// templates is one token with its parts; the expression of "${...}" is a
// list of tokens of its own.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Kt = T.kotlin = T.kotlin || {};
    if (Kt.lex)
        return;

    var KEYWORDS = {};
    ('as break class continue do else false for fun if in interface is null object package return super this throw ' +
     'true try typealias typeof val var when while').split(' ').forEach(function (word) { KEYWORDS[word] = true; });
    Kt.KEYWORDS = KEYWORDS;

    var OPERATORS = [
        '===', '!==', '..<', '?.', '?:', '!!', '::', '..', '->', '++', '--', '&&', '||', '==', '!=', '<=', '>=', '+=',
        '-=', '*=', '/=', '%=', '+', '-', '*', '/', '%', '=', '<', '>', '!', '?', ':', '.', ',', ';', '(', ')', '[',
        ']', '{', '}', '@', '#', '&'
    ];

    var OPERATORS_BY_CHAR = Object.create(null);
    OPERATORS.forEach(function (op) {
        (OPERATORS_BY_CHAR[op.charAt(0)] = OPERATORS_BY_CHAR[op.charAt(0)] || []).push(op);
    });
    Object.keys(OPERATORS_BY_CHAR).forEach(function (first) {
        OPERATORS_BY_CHAR[first].sort(function (left, right) { return right.length - left.length; });
    });

    // Words after which "@name" without a space is a label reference.
    var LABEL_USERS = { 'return': true, 'break': true, 'continue': true, 'this': true, 'super': true };

    function isIdentifierPart(code) {
        return (code >= 97 && code <= 122) || (code >= 65 && code <= 90) || (code >= 48 && code <= 57) || code === 95 ||
            (code >= 0x80 && T.isLetter(code));
    }

    function isIdentifierStart(code) {
        return (code >= 97 && code <= 122) || (code >= 65 && code <= 90) || code === 95 || (code >= 0x80 && T.isLetter(code));
    }

    function isHexDigit(code) {
        return (code >= 48 && code <= 57) || (code >= 97 && code <= 102) || (code >= 65 && code <= 70);
    }

    function isDecimalDigit(code) {
        return code >= 48 && code <= 57;
    }

    function isBinaryDigit(code) {
        return code === 48 || code === 49;
    }

    // The lexer walks character codes: regular expressions from a position
    // and substr over a long text are slow in V4.
    Kt.lex = function (input, source) {
        var text = input.replace(/\r\n?/g, '\n');
        var length = text.length;
        var pos = 0, line = 1, lineStart = 0;
        source = source || '';

        function fail(message, atLine, atColumn) {
            throw new T.CompileError(message, atLine || line, atColumn || pos - lineStart + 1, source);
        }
        function code(at) {
            return at < length ? text.charCodeAt(at) : -1;
        }
        function startsAt(at, prefix) {
            if (at + prefix.length > length)
                return false;
            for (var index = 0; index < prefix.length; ++index) {
                if (text.charCodeAt(at + index) !== prefix.charCodeAt(index))
                    return false;
            }
            return true;
        }
        function newLine(at) {
            ++line;
            lineStart = at + 1;
        }
        function digits(test) {
            while (pos < length && (test(text.charCodeAt(pos)) || (text.charCodeAt(pos) === 95 && test(code(pos + 1)))))
                ++pos;
        }

        // An escape after "\" in a string or character literal.
        function escape(tokenLine, tokenColumn) {
            var ch = text.charAt(pos);
            switch (ch) {
            case 't': ++pos; return '\t';
            case 'b': ++pos; return '\b';
            case 'n': ++pos; return '\n';
            case 'r': ++pos; return '\r';
            case '\'': ++pos; return '\'';
            case '"': ++pos; return '"';
            case '\\': ++pos; return '\\';
            case '$': ++pos; return '$';
            case 'u': {
                var hex = text.substring(pos + 1, pos + 5);
                if (hex.length !== 4 || !/^[0-9a-fA-F]{4}$/.test(hex))
                    fail('illegal escape: \'\\u' + hex.replace(/[^0-9a-fA-F].*$/, '') + '\'.', tokenLine, tokenColumn);
                pos += 5;
                return String.fromCharCode(parseInt(hex, 16));
            }
            }
            fail('illegal escape: \'\\' + ch + '\'.', line, pos - lineStart);
        }

        // A string literal from pos (at the first quote); returns the token.
        // Parts: { kind: 'text', value }, { kind: 'name', name, line,
        // column }, { kind: 'expr', tokens, line, column }.
        function stringLiteral(tokenLine, tokenColumn, spaceBefore, newlineBefore) {
            var start = pos;
            var raw = startsAt(pos, '"""');
            pos += raw ? 3 : 1;
            var parts = [];
            var current = '';
            for (;;) {
                if (pos >= length || (!raw && text.charCodeAt(pos) === 10))
                    fail('syntax error: Expecting \'"\'.', line, pos - lineStart + 1);
                var ch = text.charCodeAt(pos);
                if (raw && startsAt(pos, '"""')) {
                    // More quotes at the end belong to the text: """a"""" is a".
                    var end = pos + 3;
                    while (code(end) === 34)
                        ++end;
                    current += text.substring(pos, end - 3);
                    pos = end;
                    break;
                }
                if (!raw && ch === 34) {
                    ++pos;
                    break;
                }
                if (!raw && ch === 92) {
                    ++pos;
                    current += escape(line, pos - lineStart);
                    continue;
                }
                if (ch === 36) {
                    var next = code(pos + 1);
                    if (next === 123) {
                        if (current.length > 0)
                            parts.push({ kind: 'text', value: current });
                        current = '';
                        var exprLine = line, exprColumn = pos - lineStart + 1;
                        pos += 2;
                        var inner = scan(true);
                        parts.push({ kind: 'expr', tokens: inner, line: exprLine, column: exprColumn });
                        continue;
                    }
                    if (isIdentifierStart(next) || next === 96) {
                        if (current.length > 0)
                            parts.push({ kind: 'text', value: current });
                        current = '';
                        var nameColumn = pos - lineStart + 2;
                        ++pos;
                        var nameStart = pos;
                        if (next === 96) {
                            var close = text.indexOf('`', pos + 1);
                            if (close < 0)
                                fail('syntax error: Expecting \'`\'.');
                            pos = close + 1;
                            parts.push({ kind: 'name', name: text.substring(nameStart + 1, close), line: line, column: nameColumn });
                        } else {
                            while (pos < length && isIdentifierPart(text.charCodeAt(pos)))
                                ++pos;
                            parts.push({ kind: 'name', name: text.substring(nameStart, pos), line: line, column: nameColumn });
                        }
                        continue;
                    }
                }
                if (ch === 10)
                    newLine(pos);
                current += text.charAt(pos);
                ++pos;
            }
            if (current.length > 0 || parts.length === 0)
                parts.push({ kind: 'text', value: current });
            var simple = parts.length === 1 && parts[0].kind === 'text';
            return { type: 'string', value: simple ? parts[0].value : null, parts: parts, raw: raw,
                     text: text.substring(start, pos), line: tokenLine, column: tokenColumn, space: spaceBefore,
                     newline: newlineBefore };
        }

        function charLiteral(tokenLine, tokenColumn) {
            var start = pos;
            ++pos;
            var content = '';
            var count = 0;
            for (;;) {
                if (pos >= length || text.charCodeAt(pos) === 10)
                    fail('syntax error: Expecting \'\'\'.', tokenLine, tokenColumn);
                var ch = text.charCodeAt(pos);
                if (ch === 39)
                    break;
                if (ch === 92) {
                    ++pos;
                    content += escape(tokenLine, tokenColumn);
                } else {
                    content += text.charAt(pos);
                    ++pos;
                }
                ++count;
            }
            ++pos;
            if (count === 0)
                fail('empty character literal.', tokenLine, tokenColumn);
            if (count > 1 || content.length !== 1)
                fail('too many characters in a character literal.', tokenLine, tokenColumn);
            return content.charCodeAt(0);
        }

        // A number: { type: 'int', digits, radix, suffix } or { type: 'float', value, single }.
        function number(tokenLine, tokenColumn) {
            var start = pos;
            var first = text.charCodeAt(pos);
            var next = code(pos + 1);
            var radix = 10;
            var isFloat = false;
            var digitsStart;
            if (first === 48 && (next === 120 || next === 88)) {
                pos += 2;
                digitsStart = pos;
                radix = 16;
                digits(isHexDigit);
            } else if (first === 48 && (next === 98 || next === 66)) {
                pos += 2;
                digitsStart = pos;
                radix = 2;
                digits(isBinaryDigit);
            } else {
                digitsStart = pos;
                digits(isDecimalDigit);
                if (code(pos) === 46 && isDecimalDigit(code(pos + 1))) {
                    ++pos;
                    digits(isDecimalDigit);
                    isFloat = true;
                }
                var marker = code(pos);
                if (marker === 101 || marker === 69) {
                    var afterSign = code(pos + 1) === 43 || code(pos + 1) === 45 ? pos + 2 : pos + 1;
                    if (isDecimalDigit(code(afterSign))) {
                        pos = afterSign;
                        digits(isDecimalDigit);
                        isFloat = true;
                    }
                }
            }
            var body = text.substring(digitsStart, pos).replace(/_/g, '');
            if (radix !== 10 && body.length === 0)
                fail('value out of range.', tokenLine, tokenColumn);
            var suffix = '';
            var marker2 = code(pos);
            if ((marker2 === 102 || marker2 === 70) && radix === 10) {
                ++pos;
                return { type: 'float', value: Number(body), single: true, text: text.substring(start, pos) };
            }
            if (isFloat)
                return { type: 'float', value: Number(body), single: false, text: text.substring(start, pos) };
            if (marker2 === 117 || marker2 === 85) {
                ++pos;
                suffix = 'u';
                if (code(pos) === 76) {
                    ++pos;
                    suffix = 'uL';
                }
            } else if (marker2 === 76) {
                ++pos;
                suffix = 'L';
            }
            return { type: 'int', digits: body, radix: radix, suffix: suffix, text: text.substring(start, pos) };
        }

        // The tokens up to the end or (inTemplate) up to the "}" that closes "${".
        function scan(inTemplate) {
            var tokens = [];
            var depth = 0;
            var spaceBefore = true, newlineBefore = false;
            function push(item) {
                item.space = spaceBefore;
                item.newline = newlineBefore;
                tokens.push(item);
                spaceBefore = false;
                newlineBefore = false;
                return item;
            }
            for (;;) {
                if (pos >= length) {
                    if (inTemplate)
                        fail('syntax error: Expecting \'}\'.');
                    break;
                }
                var charCode = text.charCodeAt(pos);
                if (charCode === 32 || charCode === 9 || charCode === 12) {
                    ++pos;
                    spaceBefore = true;
                    continue;
                }
                if (charCode === 10) {
                    newLine(pos);
                    ++pos;
                    spaceBefore = true;
                    newlineBefore = true;
                    continue;
                }
                if (charCode === 47 && code(pos + 1) === 47) {
                    var lineEnd = text.indexOf('\n', pos);
                    pos = lineEnd < 0 ? length : lineEnd;
                    spaceBefore = true;
                    continue;
                }
                var tokenLine = line, column = pos - lineStart + 1;
                if (charCode === 47 && code(pos + 1) === 42) {
                    // Block comments nest in Kotlin.
                    var level = 1;
                    pos += 2;
                    while (level > 0) {
                        if (pos >= length)
                            fail('syntax error: Unclosed comment.', line, pos - lineStart + 1);
                        var commentChar = text.charCodeAt(pos);
                        if (commentChar === 47 && code(pos + 1) === 42) {
                            ++level;
                            pos += 2;
                        } else if (commentChar === 42 && code(pos + 1) === 47) {
                            --level;
                            pos += 2;
                        } else {
                            if (commentChar === 10) {
                                newLine(pos);
                                newlineBefore = true;
                            }
                            ++pos;
                        }
                    }
                    spaceBefore = true;
                    continue;
                }
                if (charCode === 35 && code(pos + 1) === 33 && pos === 0) {
                    var shebangEnd = text.indexOf('\n', pos);
                    pos = shebangEnd < 0 ? length : shebangEnd;
                    continue;
                }
                if (charCode === 34) {
                    var saveSpace = spaceBefore, saveNewline = newlineBefore;
                    var stringToken = stringLiteral(tokenLine, column, saveSpace, saveNewline);
                    tokens.push(stringToken);
                    spaceBefore = false;
                    newlineBefore = false;
                    continue;
                }
                if (charCode === 39) {
                    var start = pos;
                    var value = charLiteral(tokenLine, column);
                    push({ type: 'char', value: value, text: text.substring(start, pos), line: tokenLine, column: column });
                    continue;
                }
                if (isDecimalDigit(charCode) || (charCode === 46 && isDecimalDigit(code(pos + 1)) &&
                                                 !(tokens.length > 0 && tokens[tokens.length - 1].type === 'op' &&
                                                   tokens[tokens.length - 1].value === '.' && !spaceBefore))) {
                    var literal = number(tokenLine, column);
                    if (isIdentifierPart(code(pos)))
                        fail('literals must be surrounded by whitespace.', tokenLine, column);
                    literal.line = tokenLine;
                    literal.column = column;
                    literal.value = literal.type === 'int' ? literal.text : literal.value;
                    push(literal);
                    continue;
                }
                if (charCode === 96) {
                    var close = text.indexOf('`', pos + 1);
                    var lineBreak = text.indexOf('\n', pos + 1);
                    if (close < 0 || (lineBreak >= 0 && lineBreak < close))
                        fail('syntax error: Expecting \'`\'.', tokenLine, column);
                    var quoted = text.substring(pos + 1, close);
                    pos = close + 1;
                    push({ type: 'ident', value: quoted, text: '`' + quoted + '`', line: tokenLine, column: column, quoted: true });
                    continue;
                }
                if (isIdentifierStart(charCode)) {
                    var wordStart = pos;
                    ++pos;
                    while (pos < length && isIdentifierPart(text.charCodeAt(pos)))
                        ++pos;
                    var word = text.substring(wordStart, pos);
                    // name@ - a label (this@, return@... take a label reference instead).
                    if (code(pos) === 64 && LABEL_USERS[word] !== true && KEYWORDS[word] !== true) {
                        ++pos;
                        push({ type: 'label', value: word, text: word + '@', line: tokenLine, column: column });
                        continue;
                    }
                    if (word === 'as' && code(pos) === 63) {
                        ++pos;
                        push({ type: 'keyword', value: 'as?', text: 'as?', line: tokenLine, column: column });
                        continue;
                    }
                    var item = push({ type: KEYWORDS[word] === true ? 'keyword' : 'ident', value: word, text: word,
                                      line: tokenLine, column: column });
                    // this@Outer, return@forEach: the label belongs to the word.
                    if (LABEL_USERS[word] === true && code(pos) === 64 && isIdentifierStart(code(pos + 1))) {
                        var labelStart = pos + 1;
                        pos = labelStart;
                        while (pos < length && isIdentifierPart(text.charCodeAt(pos)))
                            ++pos;
                        item.label = text.substring(labelStart, pos);
                        item.text = word + '@' + item.label;
                    }
                    continue;
                }
                if (charCode === 33 && (startsAt(pos, '!in') || startsAt(pos, '!is')) && !isIdentifierPart(code(pos + 3))) {
                    var negated = text.substring(pos, pos + 3);
                    pos += 3;
                    push({ type: 'op', value: negated, text: negated, line: tokenLine, column: column });
                    continue;
                }
                if (inTemplate) {
                    if (charCode === 123) {
                        ++depth;
                    } else if (charCode === 125) {
                        if (depth === 0) {
                            ++pos;
                            break;
                        }
                        --depth;
                    }
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
                    fail('syntax error: Expecting an element.', tokenLine, column);
                pos += operator.length;
                push({ type: 'op', value: operator, text: operator, line: tokenLine, column: column });
            }
            tokens.push({ type: 'eof', value: '', text: '', line: line, column: pos - lineStart + 1, space: true,
                          newline: spaceBefore && newlineBefore });
            return tokens;
        }

        return scan(false);
    };
})(globalThis);
