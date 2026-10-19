// WAT: tokens of the WebAssembly text format and the tree of
// S-expressions. A token is { t: 'kw' | 'id' | 'num' | 'str' | 'reserved',
// v, line, col }, a string also has bytes; a list is { t: 'list', items,
// line, col }.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var W = T.wat = T.wat || {};
    if (W.lexer)
        return;
    W.lexer = true;

    // A module error: kind - 'malformed' (text), 'invalid' (validation),
    // 'unlinkable' (import), 'uninstantiable'. The assert_* commands tell them apart.
    W.error = function (kind, message, line, column, source) {
        var error = new T.CompileError(message, line || 0, column || 0, source || '');
        error.wasmKind = kind;
        return error;
    };

    // idchar: 0-9 A-Z a-z ! # $ % & ' * + - . / : < = > ? @ \ ^ _ ` | ~
    var ID_CHARS = [];
    (function () {
        var extra = "!#$%&'*+-./:<=>?@\\^_`|~";
        for (var code = 0; code < 128; ++code) {
            ID_CHARS[code] = (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) ||
                extra.indexOf(String.fromCharCode(code)) >= 0;
        }
    })();

    function isIdChar(code) {
        return code < 128 && ID_CHARS[code] === true;
    }
    W.isIdChar = isIdChar;

    // A character of a string as UTF-8 bytes.
    function pushUtf8(bytes, code) {
        if (code < 0x80)
            bytes.push(code);
        else if (code < 0x800)
            bytes.push(0xC0 | (code >> 6), 0x80 | (code & 63));
        else if (code < 0x10000)
            bytes.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
        else
            bytes.push(0xF0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    }
    W.pushUtf8 = pushUtf8;

    // UTF-8 bytes as a JavaScript string; an invalid encoding gives null.
    W.decodeUtf8 = function (bytes) {
        var text = '';
        for (var index = 0; index < bytes.length;) {
            var byte = bytes[index];
            var code, need;
            if (byte < 0x80) {
                text += String.fromCharCode(byte);
                ++index;
                continue;
            } else if (byte >= 0xC2 && byte <= 0xDF) {
                code = byte & 31; need = 1;
            } else if (byte >= 0xE0 && byte <= 0xEF) {
                code = byte & 15; need = 2;
            } else if (byte >= 0xF0 && byte <= 0xF4) {
                code = byte & 7; need = 3;
            } else {
                return null;
            }
            for (var offset = 1; offset <= need; ++offset) {
                var next = bytes[index + offset];
                if (next === undefined || (next & 0xC0) !== 0x80)
                    return null;
                code = (code << 6) | (next & 63);
            }
            if ((need === 2 && (code < 0x800 || (code >= 0xD800 && code <= 0xDFFF))) ||
                (need === 3 && (code < 0x10000 || code > 0x10FFFF)))
                return null;
            text += code < 0x10000 ? String.fromCharCode(code)
                                   : String.fromCharCode(0xD800 + ((code - 0x10000) >> 10), 0xDC00 + ((code - 0x10000) & 1023));
            index += need + 1;
        }
        return text;
    };

    function Lexer(text, source) {
        this.text = text;
        this.source = source || '';
        this.pos = 0;
        this.line = 1;
        this.lineStart = 0;
    }

    Lexer.prototype.fail = function (message, line, column) {
        throw W.error('malformed', message, line || this.line, column || (this.pos - this.lineStart + 1), this.source);
    };

    Lexer.prototype.newline = function (index) {
        ++this.line;
        this.lineStart = index + 1;
    };

    // Spaces and comments; false - the end of the text.
    Lexer.prototype.skip = function () {
        var text = this.text;
        for (;;) {
            if (this.pos >= text.length)
                return false;
            var code = text.charCodeAt(this.pos);
            if (code === 10) {
                this.newline(this.pos);
                ++this.pos;
            } else if (code === 32 || code === 9 || code === 13) {
                ++this.pos;
            } else if (code === 59 && text.charCodeAt(this.pos + 1) === 59) {
                // The end of a line is LF, CR or CR LF.
                while (this.pos < text.length && text.charCodeAt(this.pos) !== 10 && text.charCodeAt(this.pos) !== 13)
                    ++this.pos;
            } else if (code === 40 && text.charCodeAt(this.pos + 1) === 59) {
                this.blockComment();
            } else {
                return true;
            }
        }
    };

    // (; ... ;) - nested.
    Lexer.prototype.blockComment = function () {
        var text = this.text;
        var line = this.line, column = this.pos - this.lineStart + 1;
        var depth = 0;
        while (this.pos < text.length) {
            var code = text.charCodeAt(this.pos);
            if (code === 40 && text.charCodeAt(this.pos + 1) === 59) {
                ++depth;
                this.pos += 2;
            } else if (code === 59 && text.charCodeAt(this.pos + 1) === 41) {
                this.pos += 2;
                if (--depth === 0)
                    return;
            } else {
                if (code === 10)
                    this.newline(this.pos);
                ++this.pos;
            }
        }
        this.fail('unclosed comment', line, column);
    };

    // A string "..." -> bytes; this.pos is at the quote.
    Lexer.prototype.string = function (bytes) {
        var text = this.text;
        var line = this.line, column = this.pos - this.lineStart + 1;
        ++this.pos;
        for (;;) {
            if (this.pos >= text.length)
                this.fail('unclosed string', line, column);
            var code = text.charCodeAt(this.pos);
            if (code === 34) {
                ++this.pos;
                return;
            }
            if (code === 10 || code < 32 || code === 127)
                this.fail('illegal control character in string');
            if (code === 92) {
                var next = text.charAt(this.pos + 1);
                this.pos += 2;
                switch (next) {
                case 't': bytes.push(9); break;
                case 'n': bytes.push(10); break;
                case 'r': bytes.push(13); break;
                case '"': bytes.push(34); break;
                case "'": bytes.push(39); break;
                case '\\': bytes.push(92); break;
                case 'u': {
                    var match = /^\{([0-9A-Fa-f](?:_?[0-9A-Fa-f])*)\}/.exec(text.substring(this.pos, this.pos + 40));
                    if (match === null)
                        this.fail('malformed unicode escape');
                    var value = parseInt(match[1].replace(/_/g, ''), 16);
                    if (!(value < 0xD800 || (value > 0xDFFF && value <= 0x10FFFF)))
                        this.fail('malformed unicode escape');
                    pushUtf8(bytes, value);
                    this.pos += match[0].length;
                    break;
                }
                default: {
                    var hex = text.substring(this.pos - 1, this.pos + 1);
                    if (!/^[0-9A-Fa-f]{2}$/.test(hex))
                        this.fail('illegal escape');
                    bytes.push(parseInt(hex, 16));
                    this.pos += 1;
                }
                }
                continue;
            }
            if (code >= 0xD800 && code <= 0xDBFF) {
                var low = text.charCodeAt(this.pos + 1);
                if (!(low >= 0xDC00 && low <= 0xDFFF))
                    this.fail('malformed UTF-8 encoding');
                pushUtf8(bytes, 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00));
                this.pos += 2;
                continue;
            }
            if (code >= 0xDC00 && code <= 0xDFFF)
                this.fail('malformed UTF-8 encoding');
            pushUtf8(bytes, code);
            ++this.pos;
        }
    };

    var NUMBER = /^[+-]?(?:(?:[0-9](?:_?[0-9])*(?:\.(?:[0-9](?:_?[0-9])*)?)?(?:[eE][+-]?[0-9](?:_?[0-9])*)?)|(?:0x[0-9A-Fa-f](?:_?[0-9A-Fa-f])*(?:\.(?:[0-9A-Fa-f](?:_?[0-9A-Fa-f])*)?)?(?:[pP][+-]?[0-9](?:_?[0-9])*)?)|inf|nan|nan:0x[0-9A-Fa-f](?:_?[0-9A-Fa-f])*)$/;

    // The next token or null at the end of the text.
    Lexer.prototype.token = function () {
        if (!this.skip())
            return null;
        var text = this.text;
        var start = this.pos;
        var line = this.line, column = start - this.lineStart + 1;
        var code = text.charCodeAt(start);
        if (code === 40 || code === 41) {
            ++this.pos;
            return { t: code === 40 ? '(' : ')', v: code === 40 ? '(' : ')', line: line, col: column };
        }
        // A token is a continuous sequence of idchars and strings.
        var bytes = null;
        var plain = true;
        var strings = 0;
        while (this.pos < text.length) {
            code = text.charCodeAt(this.pos);
            if (code === 34) {
                if (bytes === null)
                    bytes = [];
                this.string(bytes);
                ++strings;
            } else if (isIdChar(code)) {
                plain = false;
                ++this.pos;
            } else if (code === 32 || code === 9 || code === 10 || code === 13 || code === 40 || code === 41 ||
                       (code === 59 && text.charCodeAt(this.pos + 1) === 59)) {
                break;
            } else {
                if (code > 127)
                    this.fail('malformed UTF-8 encoding');
                this.fail('unexpected character');
            }
        }
        var value = text.substring(start, this.pos);
        var token = { t: 'reserved', v: value, line: line, col: column };
        if (plain && strings === 1) {
            token.t = 'str';
            token.bytes = bytes;
        } else if (strings === 0) {
            var first = value.charCodeAt(0);
            if (first === 36 && value.length > 1)
                token.t = 'id';
            else if (first >= 97 && first <= 122 && !NUMBER.test(value))
                token.t = 'kw';
            else if (NUMBER.test(value))
                token.t = 'num';
        } else if (value.charCodeAt(0) === 36 && value.charCodeAt(1) === 34 && strings === 1 &&
                   text.charCodeAt(this.pos - 1) === 34) {
            // $"name" - a name as a string (WebAssembly 3.0); not supported.
            token.t = 'reserved';
        }
        return token;
    };

    // A text into a list of top-level S-expressions.
    W.read = function (text, source) {
        var lexer = new Lexer(text, source);
        var top = { t: 'list', items: [], line: 1, col: 1 };
        var stack = [top];
        for (;;) {
            var token = lexer.token();
            if (token === null)
                break;
            var current = stack[stack.length - 1];
            if (token.t === '(') {
                var list = { t: 'list', items: [], line: token.line, col: token.col };
                current.items.push(list);
                stack.push(list);
            } else if (token.t === ')') {
                if (stack.length === 1)
                    lexer.fail('unexpected token )', token.line, token.col);
                current.endLine = token.line;
                stack.pop();
            } else {
                current.items.push(token);
            }
        }
        if (stack.length > 1) {
            var open = stack[stack.length - 1];
            lexer.fail('unexpected end (unclosed parenthesis)', open.line, open.col);
        }
        return top.items;
    };

    // The head of a list is the keyword head (or any if head is not given).
    W.isForm = function (node, head) {
        return node !== undefined && node.t === 'list' && node.items.length > 0 && node.items[0].t === 'kw' &&
            (head === undefined || node.items[0].v === head);
    };

    W.headOf = function (node) {
        return node !== undefined && node.t === 'list' && node.items.length > 0 && node.items[0].t === 'kw'
            ? node.items[0].v : null;
    };
})(globalThis);
