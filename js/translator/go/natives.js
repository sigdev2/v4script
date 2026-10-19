// Go: standard library functions in JavaScript (stdlib.js declares them
// without a body). Natives[path](ctx) -> { name: function, 'Type.Method':
// function, $async: { name: true } } - the asynchronous ones (generators)
// wait in a fiber.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Go = T.go;
    if (Go.natives)
        return;

    var rt = Go.runtime;
    var utf8 = T.utf8;
    var i64 = T.i64, u64 = T.u64, big = T.big;
    var natives = {};
    Go.natives = natives;

    function slice(array) {
        return rt.slice(array);
    }

    function each(text, callback) {
        for (var index = 0; index < text.length;) {
            var rune = utf8.decodeRune(text, index);
            callback(rune[0], index, rune[1]);
            index += rune[1];
        }
    }

    function runes(text) {
        var list = [];
        each(text, function (rune) { list.push(rune); });
        return list;
    }

    function write(writer, bytes) {
        writer.write(utf8.decode(bytes));
    }

    // --- errors

    natives.errors = function () {
        return {
            comparableError: function (error) {
                return error === null || error.$t.comparable;
            },
            // errors.As(err, &target): target is a pointer to a variable of
            // an interface or a concrete type.
            As: function (error, target) {
                var pointerDesc = rt.typeOf(target);
                if (pointerDesc === null || pointerDesc.kind !== 'ptr')
                    throw rt.panic(rt.boxString('errors: target must be a non-nil pointer'));
                var wanted = pointerDesc.elem;
                var cell = rt.valueOf(target);
                while (error !== null) {
                    var dynamic = error.$t;
                    if (wanted.kind === 'iface' ? rt.implements(dynamic, wanted) : dynamic === wanted) {
                        var value = wanted.kind === 'iface' ? error : rt.valueOf(error);
                        if (wanted.kind === 'struct')
                            cell.$set(value);
                        else
                            cell.v = value;
                        return true;
                    }
                    if (typeof error.As === 'function' && error.As(target))
                        return true;
                    error = typeof error.Unwrap === 'function' ? error.Unwrap() : null;
                    if (error instanceof rt.Slice)
                        error = error.n > 0 ? error.a[error.o] : null;
                }
                return false;
            }
        };
    };

    // --- os

    // Bytes of standard input that a read did not take yet.
    var pendingInput = [];

    natives.os = function (ctx) {
        return {
            // Up to len(b) bytes of standard input (UTF-8); -1 at the end.
            'File.read': function (bytes) {
                if (pendingInput.length === 0) {
                    var line = ctx.env.input.readLine();
                    if (line === null)
                        return -1;
                    var encoded = utf8.encode(line + '\n');
                    for (var index = 0; index < encoded.length; ++index)
                        pendingInput.push(encoded.charCodeAt(index));
                }
                var count = Math.min(bytes.n, pendingInput.length);
                for (var offset = 0; offset < count; ++offset)
                    bytes.a[bytes.o + offset] = pendingInput[offset];
                pendingInput.splice(0, count);
                return count;
            },
            'File.Write': function (bytes) {
                var text = rt.bytesToString(bytes);
                write(this.fd === 2 ? ctx.env.err : ctx.env.out, text);
                return [bytes.n, null];
            },
            Exit: function (code) {
                throw new rt.GoExit(code);
            }
        };
    };

    function GoExit(code) {
        T.LanguageError.call(this, 'exit status ' + code, null);
        this.goExit = true;
        this.code = code;
    }
    GoExit.prototype = Object.create(T.LanguageError.prototype);
    rt.GoExit = GoExit;

    // --- fmt

    natives.fmt = function (ctx) {
        return {
            Println: function (args) {
                var text = rt.sprintln(rt.toArray(args));
                write(ctx.env.out, text);
                return [text.length, null];
            },
            Print: function (args) {
                var text = rt.sprint(rt.toArray(args));
                write(ctx.env.out, text);
                return [text.length, null];
            },
            Printf: function (format, args) {
                var text = rt.sprintf(format, rt.toArray(args));
                write(ctx.env.out, text);
                return [text.length, null];
            },
            Sprintf: function (format, args) {
                return rt.sprintf(format, rt.toArray(args));
            },
            Sprint: function (args) {
                return rt.sprint(rt.toArray(args));
            },
            Sprintln: function (args) {
                return rt.sprintln(rt.toArray(args));
            },
            wrapIndex: function (format) {
                // The argument number for %w.
                var index = 0;
                for (var position = 0; position < format.length; ++position) {
                    if (format.charAt(position) !== '%')
                        continue;
                    var match = /^%[-+# 0]*(\d+|\*)?(\.(\d+|\*)?)?([a-zA-Z%])/.exec(format.substring(position));
                    if (match === null)
                        continue;
                    position += match[0].length - 1;
                    if (match[4] === '%')
                        continue;
                    if (match[4] === 'w')
                        return index;
                    index += 1 + (match[1] === '*' ? 1 : 0) + (match[3] === '*' ? 1 : 0);
                }
                return -1;
            },
            // Sscan: words of the string go to the variables by pointers.
            Sscan: function (text, args) {
                var words = utf8.decode(text).split(/\s+/).filter(function (word) { return word.length > 0; });
                return assignWords(words, rt.toArray(args));
            },
            scanInput: function (line, args) {
                var targets = rt.toArray(args);
                var words = readWords(ctx.env.input, targets.length, line);
                if (words.problem !== '')
                    return [0, utf8.encode(words.problem)];
                var result = assignWords(words.list, targets);
                if (result[1] === null)
                    return [result[0], ''];
                return [result[0], utf8.encode(words.list.length < targets.length && words.atEnd
                    ? (words.list.length === 0 ? 'EOF' : 'unexpected EOF') : utf8.decode(result[1].Error()))];
            }
        };
    };

    // Words of standard input for fmt.Scan (line: Scanln - only the
    // current line, which is read to its end).
    function readWords(input, count, line) {
        var list = [];
        var atEnd = false;
        var character;
        while (list.length < count) {
            while ((character = input.peekChar()) !== null && /\s/.test(character)) {
                if (character === '\n' && line) {
                    if (list.length < count) {
                        input.readChar();
                        return { list: list, atEnd: false, problem: 'unexpected newline' };
                    }
                    break;
                }
                input.readChar();
            }
            if (character === null) {
                atEnd = true;
                break;
            }
            var word = '';
            while ((character = input.peekChar()) !== null && !/\s/.test(character))
                word += input.readChar();
            list.push(word);
        }
        if (line) {
            var rest = '';
            while ((character = input.readChar()) !== null && character !== '\n')
                rest += character;
            if (/\S/.test(rest))
                return { list: list, atEnd: false, problem: 'expected newline' };
        }
        return { list: list, atEnd: atEnd, problem: '' };
    }

    function assignWords(words, targets) {
                var count = 0;
                for (var index = 0; index < targets.length; ++index) {
                    if (index >= words.length)
                        return [count, rt.errorValue('unexpected EOF')];
                    var pointer = targets[index];
                    var elem = pointer.$t.elem;
                    var cell = rt.valueOf(pointer);
                    var word = words[index];
                    var number = Number(word);
                    switch (elem.kind) {
                    case 'string':
                        cell.v = utf8.encode(word);
                        break;
                    case 'bool':
                        cell.v = word === 'true';
                        break;
                    case 'float32':
                    case 'float64':
                        if (isNaN(number))
                            return [count, rt.errorValue('strconv.ParseFloat: parsing ' + T.quote(word) + ': invalid syntax')];
                        cell.v = number;
                        break;
                    default:
                        if (!/^[+-]?\d+$/.test(word))
                            return [count, rt.errorValue('expected integer')];
                        cell.v = elem.kind === 'int' || elem.kind === 'int64' ? i64.parse(word) : Number(word);
                    }
                    ++count;
                }
                return [count, null];
    }

    // --- strings

    function upperRune(rune) {
        var upper = String.fromCodePoint(rune).toUpperCase();
        return upper.codePointAt(0) !== undefined && upper.length === String.fromCodePoint(upper.codePointAt(0)).length
            ? upper.codePointAt(0) : rune;
    }

    function lowerRune(rune) {
        var lower = String.fromCodePoint(rune).toLowerCase();
        return lower.codePointAt(0) !== undefined && lower.length === String.fromCodePoint(lower.codePointAt(0)).length
            ? lower.codePointAt(0) : rune;
    }

    function mapRunes(text, mapping) {
        if (!/[^\x00-\x7f]/.test(text))
            return mapping === upperRune ? text.toUpperCase() : (mapping === lowerRune ? text.toLowerCase() : null);
        var bytes = [];
        each(text, function (rune) { utf8.appendRune(bytes, mapping(rune)); });
        return utf8.fromBytes(bytes);
    }

    var SPACE = /^[\s\u0085]+|[\s\u0085]+$/g;

    function trimSet(text, cutset, left, right) {
        var set = runes(cutset);
        var list = [];
        each(text, function (rune, index, size) { list.push([rune, index, size]); });
        var start = 0, end = list.length;
        if (left) {
            while (start < end && set.indexOf(list[start][0]) >= 0)
                ++start;
        }
        if (right) {
            while (end > start && set.indexOf(list[end - 1][0]) >= 0)
                --end;
        }
        if (start >= end)
            return '';
        return text.substring(list[start][1], list[end - 1][1] + list[end - 1][2]);
    }

    function splitRunes(text, limit) {
        var parts = [];
        each(text, function (rune, index, size) { parts.push(text.substring(index, index + size)); });
        if (limit > 0 && parts.length > limit) {
            var head = parts.slice(0, limit - 1);
            head.push(parts.slice(limit - 1).join(''));
            return head;
        }
        return parts;
    }

    function genSplit(text, separator, after, limit) {
        if (limit === 0)
            return rt.NIL;
        if (separator === '')
            return slice(splitRunes(text, limit));
        var parts = [];
        var start = 0;
        for (;;) {
            if (limit > 0 && parts.length === limit - 1)
                break;
            var found = text.indexOf(separator, start);
            if (found < 0)
                break;
            parts.push(text.substring(start, found + (after ? separator.length : 0)));
            start = found + separator.length;
        }
        parts.push(text.substring(start));
        return slice(parts);
    }

    natives.strings = function () {
        return {
            Contains: function (text, sub) { return text.indexOf(sub) >= 0; },
            ContainsRune: function (text, rune) { return text.indexOf(utf8.encodeRune(rune)) >= 0; },
            ContainsAny: function (text, chars) {
                return runes(chars).some(function (rune) { return text.indexOf(utf8.encodeRune(rune)) >= 0; });
            },
            Index: function (text, sub) { return text.indexOf(sub); },
            IndexByte: function (text, byte) { return text.indexOf(String.fromCharCode(byte)); },
            IndexRune: function (text, rune) {
                if (rune === 0xFFFD) {
                    var found = -1;
                    each(text, function (rune, index) {
                        if (found < 0 && rune === 0xFFFD)
                            found = index;
                    });
                    return found;
                }
                return text.indexOf(utf8.encodeRune(rune));
            },
            IndexAny: function (text, chars) {
                var set = runes(chars);
                var found = -1;
                each(text, function (rune, index) {
                    if (found < 0 && set.indexOf(rune) >= 0)
                        found = index;
                });
                return found;
            },
            LastIndex: function (text, sub) { return sub === '' ? text.length : text.lastIndexOf(sub); },
            LastIndexByte: function (text, byte) { return text.lastIndexOf(String.fromCharCode(byte)); },
            LastIndexAny: function (text, chars) {
                var set = runes(chars);
                var found = -1;
                each(text, function (rune, index) {
                    if (set.indexOf(rune) >= 0)
                        found = index;
                });
                return found;
            },
            Split: function (text, sep) { return genSplit(text, sep, false, -1); },
            SplitN: function (text, sep, count) { return genSplit(text, sep, false, count); },
            SplitAfter: function (text, sep) { return genSplit(text, sep, true, -1); },
            Fields: function (text) {
                var words = utf8.decode(text).split(/[\s\u0085]+/).filter(function (word) { return word.length > 0; });
                return words.length === 0 ? rt.NIL : slice(words.map(utf8.encode));
            },
            Join: function (elems, sep) { return rt.toArray(elems).join(sep); },
            Repeat: function (text, count) {
                if (typeof count !== 'number' || count < 0)
                    throw rt.panic(rt.boxString('strings: negative Repeat count'));
                if (text.length * count > 1e8)
                    throw rt.panic(rt.boxString('strings: Repeat output length overflow'));
                return text.repeat(count);
            },
            Replace: function (text, old, replacement, limit) {
                if (limit === 0 || old === replacement)
                    return text;
                if (old === '') {
                    var parts = splitRunes(text, -1);
                    var result = '';
                    var count = 0;
                    for (var index = 0; index <= parts.length; ++index) {
                        if (limit < 0 || count < limit) {
                            result += replacement;
                            ++count;
                        }
                        if (index < parts.length)
                            result += parts[index];
                    }
                    return result;
                }
                var output = '';
                var start = 0;
                var replaced = 0;
                for (;;) {
                    if (limit >= 0 && replaced >= limit)
                        break;
                    var found = text.indexOf(old, start);
                    if (found < 0)
                        break;
                    output += text.substring(start, found) + replacement;
                    start = found + old.length;
                    ++replaced;
                }
                return output + text.substring(start);
            },
            ToUpper: function (text) { return mapRunes(text, upperRune); },
            ToLower: function (text) { return mapRunes(text, lowerRune); },
            Title: function (text) {
                return utf8.encode(utf8.decode(text).replace(/(^|[\s\-_.,;:!?(){}\[\]"'])(\S)/g, function (match, before, letter) {
                    return before + letter.toUpperCase();
                }));
            },
            TrimSpace: function (text) {
                if (!/[^\x00-\x7f]/.test(text))
                    return text.replace(/^[ \t\n\v\f\r]+|[ \t\n\v\f\r]+$/g, '');
                return utf8.encode(utf8.decode(text).replace(SPACE, ''));
            },
            Trim: function (text, cutset) { return trimSet(text, cutset, true, true); },
            TrimLeft: function (text, cutset) { return trimSet(text, cutset, true, false); },
            TrimRight: function (text, cutset) { return trimSet(text, cutset, false, true); },
            Count: function (text, sub) {
                if (sub === '')
                    return utf8.runeCount(text) + 1;
                var count = 0;
                for (var index = text.indexOf(sub); index >= 0; index = text.indexOf(sub, index + sub.length))
                    ++count;
                return count;
            },
            replaceAllPairs: function (text, pairs) {
                var list = rt.toArray(pairs);
                var output = '';
                var index = 0;
                while (index <= text.length) {
                    var matched = false;
                    for (var pairIndex = 0; pairIndex < list.length; pairIndex += 2) {
                        var old = list[pairIndex];
                        if (old === '' ? true : text.substr(index, old.length) === old) {
                            output += list[pairIndex + 1];
                            if (old === '') {
                                if (index < text.length) {
                                    var size = utf8.decodeRune(text, index)[1];
                                    output += text.substr(index, size);
                                    index += size;
                                } else {
                                    index += 1;
                                }
                            } else {
                                index += old.length;
                            }
                            matched = true;
                            break;
                        }
                    }
                    if (!matched) {
                        if (index < text.length)
                            output += text.charAt(index);
                        ++index;
                    }
                }
                return output;
            }
        };
    };

    // --- strconv

    var MAX_BITS = { 0: 64, 8: 8, 16: 16, 32: 32, 64: 64 };

    function parseIntegerText(text, base, signed) {
        var negative = false;
        var digits = text;
        if (signed && (digits.charAt(0) === '+' || digits.charAt(0) === '-')) {
            negative = digits.charAt(0) === '-';
            digits = digits.substring(1);
        }
        var underscores = false;
        if (base === 0) {
            base = 10;
            underscores = true;
            if (/^0[xX]/.test(digits)) {
                base = 16;
                digits = digits.substring(2);
            } else if (/^0[bB]/.test(digits)) {
                base = 2;
                digits = digits.substring(2);
            } else if (/^0[oO]/.test(digits)) {
                base = 8;
                digits = digits.substring(2);
            } else if (/^0\d/.test(digits)) {
                base = 8;
                digits = digits.substring(1);
            }
        }
        if (underscores)
            digits = digits.replace(/_/g, '');
        if (digits.length === 0 || base < 2 || base > 36)
            return null;
        var value = big.parse(digits, base);
        if (value === null)
            return null;
        return negative ? big.neg(value) : value;
    }

    natives.strconv = function () {
        return {
            parseInt: function (text, base, bitSize) {
                var value = parseIntegerText(text, base, true);
                if (value === null)
                    return [0, 1];
                var bits = MAX_BITS[bitSize] || 64;
                var limit = big.pow(2, bits - 1);
                if (big.cmp(value, big.sub(limit, 1)) > 0)
                    return [T.bigToI64(big.sub(limit, 1), true), 2];
                if (big.cmp(value, big.neg(limit)) < 0)
                    return [T.bigToI64(big.neg(limit), true), 2];
                return [T.bigToI64(value, true), 0];
            },
            parseUint: function (text, base, bitSize) {
                var value = parseIntegerText(text, base, false);
                if (value === null)
                    return [0, 1];
                var bits = MAX_BITS[bitSize] || 64;
                var limit = big.sub(big.pow(2, bits), 1);
                if (big.cmp(value, limit) > 0)
                    return [T.bigToI64(limit, false), 2];
                return [T.bigToI64(value, false), 0];
            },
            parseFloat: function (text, bitSize) {
                var clean = text.replace(/_/g, '');
                var lower = clean.toLowerCase();
                if (/^[+-]?(inf|infinity)$/.test(lower))
                    return [lower.charAt(0) === '-' ? -Infinity : Infinity, 0];
                if (/^[+-]?nan$/.test(lower))
                    return [NaN, 0];
                if (!/^[+-]?((\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?|0[xX][0-9a-fA-F]*(\.[0-9a-fA-F]*)?[pP][+-]?\d+)$/.test(clean))
                    return [0, 1];
                var value;
                if (/0[xX]/.test(clean)) {
                    var match = /^([+-]?)0[xX]([0-9a-fA-F]*)(?:\.([0-9a-fA-F]*))?[pP]([+-]?\d+)$/.exec(clean);
                    value = parseInt(match[2] || '0', 16);
                    var fraction = match[3] || '';
                    for (var index = 0; index < fraction.length; ++index)
                        value += parseInt(fraction.charAt(index), 16) / Math.pow(16, index + 1);
                    value *= Math.pow(2, Number(match[4]));
                    if (match[1] === '-')
                        value = -value;
                } else {
                    value = Number(clean);
                }
                if (bitSize === 32)
                    value = Math.fround(value);
                if (!isFinite(value))
                    return [value, 2];
                return [value, 0];
            },
            FormatInt: function (value, base) {
                if (base < 2 || base > 36)
                    throw rt.panic(rt.boxString('strconv: illegal AppendInt/FormatInt base'));
                return i64.str(value, base);
            },
            FormatUint: function (value, base) {
                return u64.str(value, base);
            },
            FormatFloat: function (value, format, precision, bitSize) {
                var verb = String.fromCharCode(format);
                var flags = precision >= 0 ? { precision: precision } : {};
                if (precision < 0) {
                    var negative = value < 0 || (value === 0 && 1 / value < 0);
                    var magnitude = Math.abs(value);
                    if (!isFinite(value))
                        return value !== value ? 'NaN' : (value > 0 ? '+Inf' : '-Inf');
                    var shortest;
                    if (verb === 'g' || verb === 'G') {
                        shortest = rt.shortestFloat(magnitude, bitSize, verb === 'G');
                    } else if (verb === 'f') {
                        var digits = T.numbers.shortest(bitSize === 32 ? Math.fround(magnitude) : magnitude);
                        var places = Math.max(0, digits.digits.length - digits.exponent);
                        shortest = T.numbers.fixed(magnitude, places, true);
                    } else if (verb === 'e' || verb === 'E') {
                        var exponentDigits = T.numbers.shortest(magnitude);
                        shortest = T.numbers.exponential(magnitude, Math.max(0, exponentDigits.digits.length - 1), true, 2, verb === 'E');
                    } else {
                        shortest = String(magnitude);
                    }
                    return (negative ? '-' : '') + shortest;
                }
                return rt.format(bitSize === 32 ? Go.desc(Go.types.float32) : rt.types.float64, value, verb, flags);
            },
            Quote: function (text) { return rt.quoteString(text, false); },
            QuoteToASCII: function (text) { return rt.quoteString(text, true); },
            QuoteRune: function (rune) { return rt.quoteRune(rune, false); },
            unquote: function (text) {
                try {
                    var tokens = Go.lex(text, '');
                    if (tokens.length >= 2 && (tokens[0].type === 'string' || tokens[0].type === 'rune') &&
                        tokens[1].type !== 'string' && (tokens[1].type === 'eof' || tokens[1].implicit) &&
                        tokens[tokens.length - 1].type === 'eof' && tokens.length <= 3) {
                        var token = tokens[0];
                        return [token.type === 'rune' ? utf8.encodeRune(token.value) : token.value, true];
                    }
                } catch (error) {
                }
                return ['', false];
            }
        };
    };

    // --- math

    function gamma(value) {
        if (value < 0.5)
            return Math.PI / (Math.sin(Math.PI * value) * gamma(1 - value));
        value -= 1;
        var shift = 7;
        var coefficients = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
                            -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
                            1.5056327351493116e-7];
        var sum = coefficients[0];
        var shifted = value + shift + 0.5;
        for (var term = 1; term < 9; ++term)
            sum += coefficients[term] / (value + term);
        return Math.sqrt(2 * Math.PI) * Math.pow(shifted, value + 0.5) * Math.exp(-shifted) * sum;
    }

    function erf(value) {
        var sign = value < 0 ? -1 : 1;
        value = Math.abs(value);
        var scaled = 1 / (1 + 0.3275911 * value);
        var result = 1 - (((((1.061405429 * scaled - 1.453152027) * scaled) + 1.421413741) * scaled - 0.284496736) * scaled + 0.254829592) * scaled * Math.exp(-value * value);
        return sign * result;
    }

    function roundHalfEven(value) {
        if (!isFinite(value))
            return value;
        var floor = Math.floor(value);
        var difference = value - floor;
        if (difference < 0.5)
            return floor;
        if (difference > 0.5)
            return floor + 1;
        return floor % 2 === 0 ? floor : floor + 1;
    }

    natives.math = function () {
        var view = new DataView(new ArrayBuffer(8));
        return {
            Abs: Math.abs,
            Sqrt: Math.sqrt,
            Cbrt: Math.cbrt,
            Pow: function (base, exponent) {
                if (base === 1 || exponent === 0)
                    return 1;
                return Math.pow(base, exponent);
            },
            Exp: Math.exp,
            Expm1: Math.expm1,
            Log: Math.log,
            Log2: Math.log2,
            Log10: Math.log10,
            Log1p: Math.log1p,
            Floor: Math.floor,
            Ceil: Math.ceil,
            Trunc: Math.trunc,
            Round: function (value) {
                if (!isFinite(value))
                    return value;
                var rounded = Math.floor(Math.abs(value) + 0.5);
                if (Math.abs(value) + 0.5 === rounded && rounded - 0.5 !== Math.abs(value))
                    rounded -= 1;
                return value < 0 || (value === 0 && 1 / value < 0) ? -rounded : rounded;
            },
            RoundToEven: roundHalfEven,
            Mod: function (dividend, divisor) { return dividend % divisor; },
            Modf: function (value) {
                var integer = value < 0 ? Math.ceil(value) : Math.floor(value);
                return [integer, value - integer];
            },
            Remainder: function (dividend, divisor) { return dividend - roundHalfEven(dividend / divisor) * divisor; },
            Max: function (left, right) { return Math.max(left, right); },
            Min: function (left, right) { return Math.min(left, right); },
            Hypot: Math.hypot,
            Sin: Math.sin,
            Cos: Math.cos,
            Tan: Math.tan,
            Asin: Math.asin,
            Acos: Math.acos,
            Atan: Math.atan,
            Atan2: Math.atan2,
            Sinh: Math.sinh,
            Cosh: Math.cosh,
            Tanh: Math.tanh,
            Asinh: Math.asinh,
            Acosh: Math.acosh,
            Atanh: Math.atanh,
            Inf: function (sign) { return sign >= 0 ? Infinity : -Infinity; },
            NaN: function () { return NaN; },
            Signbit: function (value) { return value < 0 || (value === 0 && 1 / value < 0); },
            Copysign: function (value, sign) {
                var negative = sign < 0 || (sign === 0 && 1 / sign < 0);
                return negative ? -Math.abs(value) : Math.abs(value);
            },
            Float64bits: function (value) {
                view.setFloat64(0, value);
                return u64.make(view.getInt32(0), view.getInt32(4));
            },
            Float64frombits: function (bits) {
                view.setInt32(0, typeof bits === 'number' ? Math.floor(bits / 4294967296) | 0 : bits.hi);
                view.setInt32(4, typeof bits === 'number' ? bits | 0 : bits.lo);
                return view.getFloat64(0);
            },
            Float32bits: function (value) {
                view.setFloat32(0, value);
                return view.getUint32(0);
            },
            Float32frombits: function (bits) {
                view.setUint32(0, bits);
                return view.getFloat32(0);
            },
            Gamma: gamma,
            Erf: erf
        };
    };

    // --- math/rand: sfc32 on four 32-bit words.

    function seedState(object, seed) {
        var value = typeof seed === 'number' ? seed : i64.toFloat(seed);
        var word0 = (value | 0) ^ 0x9E3779B9, word1 = Math.floor(value / 4294967296) | 0;
        var word2 = 0x243F6A88, counter = 1;
        object.$s = [word0, word1, word2, counter];
        for (var index = 0; index < 15; ++index)
            next32(object);
    }

    function next32(object) {
        var state = object.$s;
        var word0 = state[0], word1 = state[1], word2 = state[2], counter = state[3];
        var result = (((word0 + word1) | 0) + counter) | 0;
        counter = (counter + 1) | 0;
        word0 = word1 ^ (word1 >>> 9);
        word1 = (word2 + (word2 << 3)) | 0;
        word2 = (word2 << 21) | (word2 >>> 11);
        word2 = (word2 + result) | 0;
        state[0] = word0;
        state[1] = word1;
        state[2] = word2;
        state[3] = counter;
        return result >>> 0;
    }

    natives['math/rand'] = function () {
        return {
            'rngSource.Int63': function () {
                if (this.$s === undefined)
                    seedState(this, 1);
                var high = next32(this) >>> 1;
                var low = next32(this);
                return i64.make(high, low | 0);
            },
            'rngSource.Seed': function (seed) {
                seedState(this, seed);
            },
            seedNow: function () {
                return Math.floor(Date.now() * 1000 + Math.random() * 1000);
            },
            'Rand.NormFloat64': function () {
                var radial = 0, angular = 0;
                while (radial === 0)
                    radial = this.Float64();
                while (angular === 0)
                    angular = this.Float64();
                return Math.sqrt(-2 * Math.log(radial)) * Math.cos(2 * Math.PI * angular);
            },
            'Rand.ExpFloat64': function () {
                return -Math.log(1 - this.Float64());
            }
        };
    };

    // --- sort

    // A merge sort of indices: less(i, j) compares elements that do not
    // move while sorting.
    function mergeSortIndices(count, less) {
        var order = [];
        for (var index = 0; index < count; ++index)
            order.push(index);
        var buffer = new Array(count);
        function sort(lo, hi) {
            if (hi - lo < 2)
                return;
            if (hi - lo <= 12) {
                for (var position = lo + 1; position < hi; ++position) {
                    var item = order[position];
                    var slot = position;
                    while (slot > lo && less(item, order[slot - 1])) {
                        order[slot] = order[slot - 1];
                        --slot;
                    }
                    order[slot] = item;
                }
                return;
            }
            var mid = (lo + hi) >> 1;
            sort(lo, mid);
            sort(mid, hi);
            var leftIndex = lo, rightIndex = mid, outIndex = lo;
            while (leftIndex < mid && rightIndex < hi) {
                if (less(order[rightIndex], order[leftIndex]))
                    buffer[outIndex++] = order[rightIndex++];
                else
                    buffer[outIndex++] = order[leftIndex++];
            }
            while (leftIndex < mid)
                buffer[outIndex++] = order[leftIndex++];
            while (rightIndex < hi)
                buffer[outIndex++] = order[rightIndex++];
            for (var copied = lo; copied < hi; ++copied)
                order[copied] = buffer[copied];
        }
        sort(0, count);
        return order;
    }

    function sortSlice(value, less) {
        var slice = rt.valueOf(value);
        if (!(slice instanceof rt.Slice))
            throw rt.panic(rt.boxString('sort.Slice: argument is not a slice'));
        var order = mergeSortIndices(slice.n, function (left, right) { return rt.sync(less(left, right)); });
        var copy = order.map(function (index) { return slice.a[slice.o + index]; });
        for (var index = 0; index < copy.length; ++index)
            slice.a[slice.o + index] = copy[index];
    }

    function sortArray(slice, compare) {
        var items = rt.toArray(slice);
        var order = mergeSortIndices(items.length, function (left, right) {
            return compare(items[left], items[right]) < 0;
        });
        for (var index = 0; index < order.length; ++index)
            slice.a[slice.o + index] = items[order[index]];
    }

    natives.sort = function () {
        return {
            Slice: sortSlice,
            SliceStable: sortSlice,
            SliceIsSorted: function (value, less) {
                var slice = rt.valueOf(value);
                for (var index = slice.n - 1; index > 0; --index) {
                    if (rt.sync(less(index, index - 1)))
                        return false;
                }
                return true;
            },
            Ints: function (slice) { sortArray(slice, i64.cmp); },
            Strings: function (slice) { sortArray(slice,
                function (left, right) { return left < right ? -1 : (left > right ? 1 : 0); }); },
            Float64s: function (slice) {
                sortArray(slice, function (left, right) {
                    if (left !== left)
                        return right !== right ? 0 : -1;
                    if (right !== right)
                        return 1;
                    return left < right ? -1 : (left > right ? 1 : 0);
                });
            }
        };
    };

    // --- unicode

    function isLetter(rune) {
        if (rune < 128)
            return (rune >= 65 && rune <= 90) || (rune >= 97 && rune <= 122);
        var text = String.fromCodePoint(rune);
        if (text.toUpperCase() !== text.toLowerCase())
            return true;
        return rune === 0xAA || rune === 0xBA || (rune >= 0x4E00 && rune <= 0x9FFF) || (rune >= 0x3400 && rune <= 0x4DBF) ||
            (rune >= 0x3041 && rune <= 0x30FF && rune !== 0x30FB) || (rune >= 0xAC00 && rune <= 0xD7A3) ||
            (rune >= 0x05D0 && rune <= 0x05EA) || (rune >= 0x0620 && rune <= 0x064A) || (rune >= 0x0E01 && rune <= 0x0E30) ||
            (rune >= 0x0904 && rune <= 0x0939) || (rune >= 0x1100 && rune <= 0x11FF) || rune === 0xDF;
    }

    function isDigit(rune) {
        return (rune >= 48 && rune <= 57) || (rune >= 0x660 && rune <= 0x669) || (rune >= 0x6F0 && rune <= 0x6F9) ||
            (rune >= 0x966 && rune <= 0x96F) || (rune >= 0xFF10 && rune <= 0xFF19);
    }

    function isSpace(rune) {
        return rune === 32 || (rune >= 9 && rune <= 13) || rune === 0x85 || rune === 0xA0 || rune === 0x1680 ||
            (rune >= 0x2000 && rune <= 0x200A) || rune === 0x2028 || rune === 0x2029 || rune === 0x202F || rune === 0x205F ||
            rune === 0x3000;
    }

    var ASCII_PUNCT = '!"#%&\'()*,-./:;?@[\\]_{}';
    var ASCII_SYMBOL = '$+<=>^`|~';

    function isPunct(rune) {
        if (rune < 128)
            return ASCII_PUNCT.indexOf(String.fromCharCode(rune)) >= 0;
        return rune === 0xA1 || rune === 0xA7 || rune === 0xAB || rune === 0xB6 || rune === 0xB7 || rune === 0xBB ||
            rune === 0xBF || (rune >= 0x2010 && rune <= 0x2027) || (rune >= 0x2030 && rune <= 0x205E) ||
            (rune >= 0x3001 && rune <= 0x3003) || (rune >= 0x3008 && rune <= 0x3011);
    }

    function isSymbol(rune) {
        if (rune < 128)
            return ASCII_SYMBOL.indexOf(String.fromCharCode(rune)) >= 0;
        return (rune >= 0xA2 && rune <= 0xA9 && rune !== 0xA7) || rune === 0xAC || rune === 0xAE || rune === 0xAF ||
            rune === 0xB0 || rune === 0xB1 || rune === 0xB4 || rune === 0xB8 || rune === 0xD7 || rune === 0xF7 ||
            (rune >= 0x2100 && rune <= 0x214F) || (rune >= 0x2190 && rune <= 0x23FF) || (rune >= 0x2500 && rune <= 0x27BF) ||
            (rune >= 0x20A0 && rune <= 0x20C0) || (rune >= 0x1F300 && rune <= 0x1FAFF);
    }

    function isMark(rune) {
        return (rune >= 0x300 && rune <= 0x36F) || (rune >= 0x483 && rune <= 0x489) || (rune >= 0x591 && rune <= 0x5BD) ||
            (rune >= 0x20D0 && rune <= 0x20FF) || (rune >= 0xFE20 && rune <= 0xFE2F);
    }

    natives.unicode = function () {
        return {
            IsLetter: isLetter,
            IsDigit: isDigit,
            IsNumber: function (rune) {
                return isDigit(rune) || rune === 0xB2 || rune === 0xB3 || rune === 0xB9 || (rune >= 0xBC && rune <= 0xBE) ||
                    (rune >= 0x2150 && rune <= 0x218B) || (rune >= 0x2460 && rune <= 0x249B);
            },
            IsSpace: isSpace,
            IsUpper: function (rune) {
                var text = String.fromCodePoint(rune);
                return text !== text.toLowerCase() && text === text.toUpperCase();
            },
            IsLower: function (rune) {
                var text = String.fromCodePoint(rune);
                return text !== text.toUpperCase() && text === text.toLowerCase() || rune === 0xDF || rune === 0xAA || rune === 0xBA;
            },
            IsPunct: isPunct,
            IsSymbol: isSymbol,
            IsMark: isMark,
            IsPrint: function (rune) {
                if (rune === 32)
                    return true;
                if (rune < 32 || (rune >= 0x7F && rune < 0xA0) || rune === 0xAD || isSpace(rune))
                    return false;
                return rune <= 0x10FFFF && !(rune >= 0xD800 && rune <= 0xDFFF);
            },
            ToUpper: upperRune,
            ToLower: lowerRune
        };
    };

    natives['unicode/utf8'] = function () {
        return {
            RuneCountInString: utf8.runeCount,
            DecodeRuneInString: function (text) {
                if (text.length === 0)
                    return [0xFFFD, 0];
                var rune = utf8.decodeRune(text, 0);
                return [rune[0], rune[1]];
            },
            DecodeLastRuneInString: function (text) {
                if (text.length === 0)
                    return [0xFFFD, 0];
                var start = text.length - 1;
                while (start > 0 && start > text.length - 4 && (text.charCodeAt(start) & 0xC0) === 0x80)
                    --start;
                var rune = utf8.decodeRune(text, start);
                if (start + rune[1] !== text.length)
                    return [0xFFFD, 1];
                return [rune[0], rune[1]];
            },
            ValidString: utf8.isValid
        };
    };

    // --- time

    function nanosToMillis(ns) {
        return i64.toFloat(ns) / 1e6;
    }

    function millisToNanos(ms) {
        return i64.mul(Math.round(ms * 1000), 1000);
    }

    function durationString(duration) {
        var negative = i64.cmp(duration, 0) < 0;
        var magnitude = negative ? T.i64ToBig(i64.neg(duration), false) : T.i64ToBig(duration, true);
        if (typeof duration === 'object' && duration.hi === -2147483648 && duration.lo === 0)
            magnitude = big.pow(2, 63);
        var ns = big.toFloat(magnitude);
        var text;
        if (ns === 0)
            return '0s';
        if (ns < 1000) {
            text = ns + 'ns';
        } else if (ns < 1e6) {
            text = trimFraction(big.str(magnitude), 3) + 'µs';
        } else if (ns < 1e9) {
            text = trimFraction(big.str(magnitude), 6) + 'ms';
        } else {
            var seconds = big.quot(magnitude, 1e9);
            var fraction = big.rem(magnitude, 1e9);
            var hours = big.quot(seconds, 3600);
            var minutes = big.quot(big.rem(seconds, 3600), 60);
            var secs = big.rem(seconds, 60);
            var secondText = trimFraction(big.str(big.add(big.mul(secs, 1e9), fraction)), 9) + 's';
            text = '';
            if (big.sign(hours) > 0)
                text = big.str(hours) + 'h' + big.str(minutes) + 'm' + secondText;
            else if (big.sign(minutes) > 0)
                text = big.str(minutes) + 'm' + secondText;
            else
                text = secondText;
        }
        return utf8.encode((negative ? '-' : '') + text);
    }

    // "1500" with 3 fraction digits -> "1.5".
    function trimFraction(digits, places) {
        while (digits.length <= places)
            digits = '0' + digits;
        var whole = digits.substring(0, digits.length - places);
        var fraction = digits.substring(digits.length - places).replace(/0+$/, '');
        return whole + (fraction ? '.' + fraction : '');
    }

    var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
                  'November', 'December'];
    var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    function pad(value, width, filler) {
        var text = String(value);
        while (text.length < width)
            text = (filler || '0') + text;
        return text;
    }

    function dateParts(ns, local) {
        var ms = nanosToMillis(ns);
        var date = new Date(Math.floor(ms));
        var nanos = Number(big.str(big.mod(T.i64ToBig(ns, true), 1e9)));
        if (local) {
            return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), hour: date.getHours(),
                     minute: date.getMinutes(), second: date.getSeconds(), weekday: date.getDay(), nanos: nanos,
                     offset: -date.getTimezoneOffset(), date: date };
        }
        return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: date.getUTCHours(),
                 minute: date.getUTCMinutes(), second: date.getUTCSeconds(), weekday: date.getUTCDay(), nanos: nanos, offset: 0,
                 date: date };
    }

    function yearDay(parts) {
        var start = Date.UTC(parts.year, 0, 1);
        var current = Date.UTC(parts.year, parts.month - 1, parts.day);
        return Math.round((current - start) / 86400000) + 1;
    }

    function zoneText(offset, colon, zulu) {
        if (zulu && offset === 0)
            return 'Z';
        var sign = offset < 0 ? '-' : '+';
        offset = Math.abs(offset);
        return sign + pad(Math.floor(offset / 60), 2) + (colon ? ':' : '') + pad(offset % 60, 2);
    }

    var LAYOUT_TOKENS = ['January', 'Jan', 'Monday', 'Mon', 'MST', '2006', '-07:00', '-0700', '-07', 'Z07:00', 'Z0700',
                         '01', '02', '_2', '03', '04', '05', '06', '15', 'PM', 'pm', '1', '2', '3', '4', '5'];

    function formatTime(ns, local, layout) {
        var parts = dateParts(ns, local);
        var output = '';
        var text = utf8.decode(layout);
        for (var index = 0; index < text.length;) {
            // A fraction of a second: .000 / .999 (,000 too).
            var fraction = /^[.,](0+|9+)(?![0-9])/.exec(text.substring(index));
            if (fraction !== null && (index > 0 && /[0-9]/.test(text.charAt(index - 1)) || true)) {
                var count = fraction[1].length;
                var digits = pad(parts.nanos, 9).substring(0, count);
                if (fraction[1].charAt(0) === '9') {
                    digits = digits.replace(/0+$/, '');
                    output += digits.length > 0 ? fraction[0].charAt(0) + digits : '';
                } else {
                    output += fraction[0].charAt(0) + digits;
                }
                index += fraction[0].length;
                continue;
            }
            var matched = null;
            for (var tokenIndex = 0; tokenIndex < LAYOUT_TOKENS.length; ++tokenIndex) {
                if (text.substr(index, LAYOUT_TOKENS[tokenIndex].length) === LAYOUT_TOKENS[tokenIndex]) {
                    matched = LAYOUT_TOKENS[tokenIndex];
                    break;
                }
            }
            if (matched === null) {
                output += text.charAt(index);
                ++index;
                continue;
            }
            index += matched.length;
            switch (matched) {
            case 'January':
                output += MONTHS[parts.month - 1];
                break;
            case 'Jan':
                output += MONTHS[parts.month - 1].substring(0, 3);
                break;
            case 'Monday':
                output += DAYS[parts.weekday];
                break;
            case 'Mon':
                output += DAYS[parts.weekday].substring(0, 3);
                break;
            case 'MST':
                output += local ? zoneText(parts.offset, false, false) : 'UTC';
                break;
            case '2006':
                output += pad(parts.year, 4);
                break;
            case '06':
                output += pad(parts.year % 100, 2);
                break;
            case '-07:00':
                output += zoneText(parts.offset, true, false);
                break;
            case '-0700':
                output += zoneText(parts.offset, false, false);
                break;
            case '-07':
                output += zoneText(parts.offset, false, false).substring(0, 3);
                break;
            case 'Z07:00':
                output += zoneText(parts.offset, true, true);
                break;
            case 'Z0700':
                output += zoneText(parts.offset, false, true);
                break;
            case '01':
                output += pad(parts.month, 2);
                break;
            case '1':
                output += parts.month;
                break;
            case '02':
                output += pad(parts.day, 2);
                break;
            case '_2':
                output += pad(parts.day, 2, ' ');
                break;
            case '2':
                output += parts.day;
                break;
            case '15':
                output += pad(parts.hour, 2);
                break;
            case '03':
                output += pad(parts.hour % 12 === 0 ? 12 : parts.hour % 12, 2);
                break;
            case '3':
                output += parts.hour % 12 === 0 ? 12 : parts.hour % 12;
                break;
            case '04':
                output += pad(parts.minute, 2);
                break;
            case '4':
                output += parts.minute;
                break;
            case '05':
                output += pad(parts.second, 2);
                break;
            case '5':
                output += parts.second;
                break;
            case 'PM':
                output += parts.hour >= 12 ? 'PM' : 'AM';
                break;
            case 'pm':
                output += parts.hour >= 12 ? 'pm' : 'am';
                break;
            }
        }
        return utf8.encode(output);
    }

    natives.time = function () {
        return {
            'Duration.String': function (duration) { return durationString(duration); },
            itoa: function (value) { return i64.str(value); },
            nowNanos: function () { return millisToNanos(Date.now()); },
            dateNanos: function (year, month, day, hour, minute, second, utc) {
                var ms = utc ? Date.UTC(year, month - 1, day, hour, minute, second)
                             : new Date(year, month - 1, day, hour, minute, second).getTime();
                return millisToNanos(ms);
            },
            fields: function (ns, local) {
                var parts = dateParts(ns, local);
                return [parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second, parts.weekday,
                        yearDay(parts)];
            },
            format: formatTime,
            Sleep: function* (duration) {
                yield* rt.sleep(duration);
            },
            parseDuration: function (text) {
                var source = utf8.decode(text);
                if (source === '0')
                    return [0, true];
                var match = /^([+-]?)((?:\d+(?:\.\d*)?|\.\d+)(?:ns|us|µs|μs|ms|s|m|h))+$/.exec(source);
                if (match === null)
                    return [0, false];
                var units = { ns: 1, us: 1e3, 'µs': 1e3, 'μs': 1e3, ms: 1e6, s: 1e9, m: 6e10, h: 3.6e12 };
                var total = 0;
                var part = /(\d+(?:\.\d*)?|\.\d+)(ns|us|µs|μs|ms|s|m|h)/g;
                var found;
                while ((found = part.exec(source)) !== null)
                    total += Number(found[1]) * units[found[2]];
                if (match[1] === '-')
                    total = -total;
                return [i64.fromFloat(Math.round(total)), true];
            },
            $async: { Sleep: true }
        };
    };

    // --- bytes

    natives.bytes = function () {
        var strings = natives.strings();
        return {
            indexString: function (text, sep) { return text.indexOf(sep); },
            toUpper: strings.ToUpper,
            toLower: strings.ToLower,
            trimSpace: strings.TrimSpace
        };
    };

    // --- syscall/js and host modules

    // The string of a JavaScript value for fmt.
    Go.jsText = function (value) {
        if (value === undefined)
            return '<undefined>';
        if (value === null)
            return '<null>';
        if (typeof value === 'string')
            return value;
        return rt.env !== undefined ? rt.env.host.format(value) : String(value);
    };

    // A Go value (an interface) in JavaScript.
    function toJS(value) {
        if (value === null || value === undefined)
            return null;
        return toJSValue(value.$t, rt.valueOf(value));
    }
    rt.toJS = toJS;

    function toJSValue(desc, value) {
        switch (desc.kind) {
        case 'string':
            return utf8.decode(value);
        case 'int':
        case 'int64':
        case 'uint':
        case 'uint64':
        case 'uintptr':
            return typeof value === 'number' ? value : (desc.kind.charAt(0) === 'u' ? u64 : i64).toFloat(value);
        case 'slice':
            return value.a === null ? [] : rt.toArray(value).map(function (item) { return toJSValue(desc.elem, item); });
        case 'array':
            return value.map(function (item) { return toJSValue(desc.elem, item); });
        case 'map': {
            var object = {};
            rt.mapEntries(value).forEach(function (entry) {
                var key = toJSValue(desc.key, entry[0]);
                object[typeof key === 'string' ? key : JSON.stringify(key)] = toJSValue(desc.elem, entry[1]);
            });
            return object;
        }
        case 'struct': {
            if (desc.str === 'js.Value')
                return value.ref;
            if (desc.str === 'js.Func' || desc.str === 'js.Error')
                return value.Value.ref;
            var result = {};
            desc.fields.forEach(function (field) {
                if (field.exported)
                    result[field.name] = toJSValue(field.desc, value[field.js]);
            });
            return result;
        }
        case 'ptr':
            if (value === null)
                return null;
            if (desc.elem.kind === 'struct' || desc.elem.kind === 'array')
                return toJSValue(desc.elem, value);
            return toJSValue(desc.elem, value.v);
        case 'iface':
            return toJS(value);
        case 'func':
            return value === null ? null : functionToJS(desc, value);
        }
        return value;
    }
    rt.toJSValue = toJSValue;

    // A Go function for JavaScript: the arguments by the parameter types.
    function functionToJS(desc, fn) {
        return function () {
            var args = [];
            var params = desc.params;
            for (var index = 0; index < params.length; ++index) {
                if (desc.variadic && index === params.length - 1) {
                    var rest = [];
                    for (var argumentIndex = index; argumentIndex < arguments.length; ++argumentIndex)
                        rest.push(fromJS(params[index].elem, arguments[argumentIndex]));
                    args.push(rt.slice(rest));
                } else {
                    args.push(fromJS(params[index], arguments[index]));
                }
            }
            var result = rt.sync(fn.apply(null, args));
            if (desc.results.length === 0)
                return undefined;
            if (desc.results.length === 1)
                return toJSValue(desc.results[0], result);
            return desc.results.map(function (resultDesc, index) { return toJSValue(resultDesc, result[index]); });
        };
    }

    var valueDesc = null;

    function makeValue(raw) {
        return new valueDesc.ctor(raw === undefined ? undefined : raw);
    }

    // A JavaScript value as a Go value of the type desc.
    function fromJS(desc, value) {
        switch (desc.kind) {
        case 'string':
            return value === undefined || value === null ? '' : utf8.encode(String(value));
        case 'bool':
            return !!value;
        case 'int':
        case 'int64':
            return i64.fromFloat(Number(value) || 0);
        case 'uint':
        case 'uint64':
        case 'uintptr':
            return u64.fromFloat(Number(value) || 0);
        case 'int8':
        case 'int16':
        case 'int32':
        case 'uint8':
        case 'uint16':
        case 'uint32':
            return T.truncateInt(Number(value) || 0) & (desc.kind === 'uint8' ? 255 : (desc.kind === 'uint16' ? 65535 : -1));
        case 'float32':
            return Math.fround(Number(value));
        case 'float64':
            return Number(value);
        case 'slice':
            if (!Array.isArray(value))
                return rt.NIL;
            return rt.slice(value.map(function (item) { return fromJS(desc.elem, item); }));
        case 'map': {
            var map = rt.makeMap(desc.keyFn);
            if (value !== null && typeof value === 'object') {
                Object.keys(value).forEach(function (key) {
                    rt.mapSet(map, fromJS(desc.key, key), fromJS(desc.elem, value[key]));
                });
            }
            return map;
        }
        case 'struct':
            if (desc.str === 'js.Value')
                return makeValue(value);
            return desc.zero();
        case 'iface':
            return boxJS(value);
        }
        return desc.zero();
    }
    rt.fromJS = fromJS;

    // A JavaScript value in a Go interface (any): numbers are int or
    // float64, strings, booleans, everything else is a js.Value.
    function boxJS(value) {
        if (value === null || value === undefined)
            return null;
        switch (typeof value) {
        case 'number':
            if (Number.isInteger(value) && Math.abs(value) <= 9007199254740991)
                return new rt.types.int.box(value);
            return new rt.types.float64.box(value);
        case 'string':
            return new rt.types.string.box(utf8.encode(value));
        case 'boolean':
            return new rt.types.bool.box(value);
        }
        return new valueDesc.box(makeValue(value));
    }

    function jsCallArgs(args) {
        return rt.toArray(args).map(toJS);
    }

    function check(value) {
        // A JavaScript exception becomes the panic js.Error.
        return value;
    }

    natives['syscall/js'] = function (ctx) {
        valueDesc = ctx.desc('Value');
        var funcDesc = ctx.desc('Func');
        function wrapError(error) {
            var panic = rt.panic(new valueDesc.box(makeValue(error)));
            panic.message = 'panic: JavaScript error: ' + jsErrorText(error);
            panic.stack = error && error.stack ? error.stack : panic.stack;
            return panic;
        }
        function guard(callback) {
            try {
                return callback();
            } catch (error) {
                if (error instanceof T.LanguageError)
                    throw error;
                throw wrapError(error);
            }
        }
        function object(value, what) {
            var raw = value.ref;
            if (raw === null || raw === undefined || (typeof raw !== 'object' && typeof raw !== 'function'))
                throw rt.panic(rt.boxString('syscall/js: call of Value.' + what + ' on ' + typeName(raw)));
            return raw;
        }
        return {
            Global: function () { return makeValue(ctx.env.global); },
            Null: function () { return makeValue(null); },
            Undefined: function () { return makeValue(undefined); },
            ValueOf: function (value) { return makeValue(toJS(value)); },
            FuncOf: function (fn) {
                var jsFunction = function () {
                    var args = [];
                    for (var index = 0; index < arguments.length; ++index)
                        args.push(makeValue(arguments[index]));
                    var result = rt.sync(fn(makeValue(this), rt.slice(args)));
                    return toJS(result);
                };
                var func = funcDesc.zero();
                func.Value = makeValue(jsFunction);
                return func;
            },
            'Value.Get': function (property) {
                var raw = object(this, 'Get');
                return makeValue(raw[utf8.decode(property)]);
            },
            'Value.Set': function (property, value) {
                var raw = object(this, 'Set');
                guard(function () { raw[utf8.decode(property)] = toJS(value); });
            },
            'Value.Delete': function (property) {
                delete object(this, 'Delete')[utf8.decode(property)];
            },
            'Value.Index': function (index) {
                return makeValue(object(this, 'Index')[i64.toFloat(index)]);
            },
            'Value.SetIndex': function (index, value) {
                object(this, 'SetIndex')[i64.toFloat(index)] = toJS(value);
            },
            'Value.Call': function (name, args) {
                var raw = object(this, 'Call');
                var method = utf8.decode(name);
                if (typeof raw[method] !== 'function')
                    throw rt.panic(rt.boxString('syscall/js: Value.Call: property ' + method + ' is not a function'));
                return makeValue(guard(function () { return check(raw[method].apply(raw, jsCallArgs(args))); }));
            },
            'Value.Invoke': function (args) {
                var raw = this.ref;
                if (typeof raw !== 'function')
                    throw rt.panic(rt.boxString('syscall/js: call of Value.Invoke on ' + typeName(raw)));
                return makeValue(guard(function () { return raw.apply(null, jsCallArgs(args)); }));
            },
            'Value.New': function (args) {
                var raw = this.ref;
                var list = jsCallArgs(args);
                return makeValue(guard(function () { return new (Function.prototype.bind.apply(raw, [null].concat(list)))(); }));
            },
            'Value.Length': function () {
                return Number(object(this, 'Length').length) || 0;
            },
            'Value.Int': function () {
                if (typeof this.ref !== 'number')
                    throw rt.panic(rt.boxString('syscall/js: call of Value.Int on ' + typeName(this.ref)));
                return i64.fromFloat(this.ref);
            },
            'Value.Float': function () {
                if (typeof this.ref !== 'number')
                    throw rt.panic(rt.boxString('syscall/js: call of Value.Float on ' + typeName(this.ref)));
                return this.ref;
            },
            'Value.String': function () {
                var raw = this.ref;
                if (typeof raw === 'string')
                    return utf8.encode(raw);
                if (raw === undefined)
                    return '<undefined>';
                if (raw === null)
                    return '<null>';
                return utf8.encode('<' + typeName(raw) + ': ' + Go.jsText(raw) + '>');
            },
            'Value.Bool': function () {
                if (typeof this.ref !== 'boolean')
                    throw rt.panic(rt.boxString('syscall/js: call of Value.Bool on ' + typeName(this.ref)));
                return this.ref;
            },
            'Value.Truthy': function () { return !!this.ref; },
            'Value.IsNull': function () { return this.ref === null; },
            'Value.IsUndefined': function () { return this.ref === undefined; },
            'Value.IsNaN': function () { return this.ref !== this.ref; },
            'Value.Type': function () {
                var names = ['undefined', 'null', 'boolean', 'number', 'string', 'symbol', 'object', 'function'];
                return names.indexOf(typeName(this.ref));
            },
            'Value.Equal': function (other) { return this.ref === other.ref; },
            'Value.InstanceOf': function (type) { return this.ref instanceof type.ref; },
            'Value.Interface': function () { return boxJS(this.ref); }
        };
    };

    // The text of an error as "TypeError: x is not a function"
    function jsErrorText(error) {
        if (error !== null && typeof error === 'object' && error.message !== undefined)
            return (error.name ? error.name + ': ' : '') + error.message;
        return String(error);
    }

    function typeName(value) {
        if (value === null)
            return 'null';
        return typeof value;
    }

    // A package of a host module: functions declared by Session.hostSource
    // with Go types, arguments and results converted by these types.
    Go.hostNatives = function (module) {
        return function (ctx) {
            var table = {};
            module.functions.forEach(function (fn) {
                var name = fn.names.pascal;
                var desc = ctx.desc(name);
                table[name] = function () {
                    var args = [];
                    for (var index = 0; index < desc.params.length; ++index) {
                        if (desc.variadic && index === desc.params.length - 1)
                            args = args.concat(jsCallArgs(arguments[index]));
                        else
                            args.push(toJSValue(desc.params[index], arguments[index]));
                    }
                    var result;
                    try {
                        result = fn.invoke(args);
                    } catch (error) {
                        if (error instanceof T.LanguageError)
                            throw error;
                        var panic = rt.panic(rt.boxString(jsErrorText(error)));
                        panic.stack = error && error.stack ? error.stack : panic.stack;
                        throw panic;
                    }
                    return desc.results.length === 0 ? undefined : fromJS(desc.results[0], result);
                };
            });
            return table;
        };
    };
})(globalThis);
