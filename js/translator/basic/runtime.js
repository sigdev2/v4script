// BASIC: values and the run time - errors with QBasic codes, numbers as
// text (STR$, PRINT), PRINT USING, VAL, string functions, arrays and
// records, RND, output with the cursor position, DATA, time. Design:
// docs/internals/basic.md.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Basic = T.basic;
    if (Basic.runtime)
        return;
    Basic.runtime = true;

    var numbers = T.numbers;

    // --- Errors

    var MESSAGES = {
        1: 'NEXT without FOR', 2: 'Syntax error', 3: 'RETURN without GOSUB', 4: 'Out of DATA',
        5: 'Illegal function call', 6: 'Overflow', 7: 'Out of memory', 8: 'Label not defined',
        9: 'Subscript out of range', 10: 'Duplicate definition', 11: 'Division by zero', 12: 'Illegal in direct mode',
        13: 'Type mismatch', 14: 'Out of string space', 16: 'String formula too complex', 17: 'Cannot continue',
        18: 'Function not defined', 19: 'No RESUME', 20: 'RESUME without error', 24: 'Device timeout',
        25: 'Device fault', 26: 'FOR without NEXT', 27: 'Out of paper', 29: 'WHILE without WEND',
        30: 'WEND without WHILE', 33: 'Duplicate label', 35: 'Subprogram not defined', 37: 'Argument-count mismatch',
        38: 'Array not defined', 40: 'Variable required', 50: 'FIELD overflow', 51: 'Internal error',
        52: 'Bad file name or number', 53: 'File not found', 54: 'Bad file mode', 55: 'File already open',
        56: 'FIELD statement active', 57: 'Device I/O error', 58: 'File already exists', 59: 'Bad record length',
        61: 'Disk full', 62: 'Input past end of file', 63: 'Bad record number', 64: 'Bad file name',
        67: 'Too many files', 68: 'Device unavailable', 69: 'Communication-buffer overflow', 70: 'Permission denied',
        71: 'Disk not ready', 72: 'Disk-media error', 73: 'Advanced feature unavailable', 74: 'Rename across disks',
        75: 'Path/File access error', 76: 'Path not found'
    };
    Basic.MESSAGES = MESSAGES;

    Basic.message = function (code) {
        return MESSAGES[code] !== undefined ? MESSAGES[code] : 'Unprintable error';
    };

    // A run-time error with a QBasic code (ERR); trappable - ON ERROR catches it.
    function BasicError(code, message) {
        T.LanguageError.call(this, message || Basic.message(code));
        this.code = code;
        this.trappable = true;
    }
    BasicError.prototype = Object.create(T.LanguageError.prototype);
    BasicError.prototype.constructor = BasicError;
    Basic.BasicError = BasicError;

    // END, STOP, SYSTEM: the program ends without an error.
    function BasicEnd() {
        this.message = 'END';
    }
    Basic.BasicEnd = BasicEnd;

    function fail(code) {
        throw new BasicError(code);
    }
    Basic.fail = fail;

    // --- Numbers

    var I16_MIN = -32768, I16_MAX = 32767;
    var I32_MIN = -2147483648, I32_MAX = 2147483647;

    // Rounding half to even (CINT, CLNG, assignment to an integer).
    function roundEven(value) {
        var rounded = Math.round(value);
        if (rounded - value === 0.5 && rounded % 2 !== 0)
            rounded -= 1;
        return rounded;
    }
    Basic.roundEven = roundEven;

    function cint(value) {
        if (!(value >= -32768.5 && value <= 32767.5))
            fail(6);
        var rounded = roundEven(value);
        if (rounded < I16_MIN || rounded > I16_MAX)
            fail(6);
        return rounded;
    }

    function clng(value) {
        if (!(value >= -2147483648.5 && value <= 2147483647.5))
            fail(6);
        var rounded = roundEven(value);
        if (rounded < I32_MIN || rounded > I32_MAX)
            fail(6);
        return rounded;
    }

    function csng(value) {
        var rounded = Math.fround(value);
        if (rounded - rounded !== 0)
            fail(6);
        return rounded;
    }

    // A float after arithmetic: an infinity is an overflow.
    function finite(value) {
        if (value - value !== 0)
            fail(6);
        return value;
    }

    Basic.cint = cint;
    Basic.clng = clng;
    Basic.csng = csng;
    Basic.finite = finite;

    // --- Numbers as text: as STR$ and PRINT in QBasic (QB64: qbs_str).

    // The digits of a number in scientific notation: { digits (significant,
    // without trailing zeros), exponent (of the first digit) }; precision -
    // how many digits.
    function scientific(value, precision) {
        var rounded = numbers.rounded(value, precision, 'significant', true);
        var digits = rounded.digits.replace(/0+$/, '');
        return { digits: digits, exponent: rounded.exponent - 1 };
    }

    function exponentText(exponent) {
        var abs = Math.abs(exponent);
        return (exponent < 0 ? '-' : '+') + (abs < 10 ? '0' : '') + abs;
    }

    function formatFloat(value, precision, letter, lowest, highest) {
        if (value === 0 || value !== value)
            return ' 0';
        var sign = value < 0 ? '-' : ' ';
        var abs = Math.abs(value);
        var parts = scientific(abs, precision);
        if (letter === 'D' && parts.digits.length === 16 && parts.digits.charAt(15) === '9') {
            // As QB64: a 16th digit of 9 rounds to 15 digits.
            parts = scientific(abs, 15);
        }
        var digits = parts.digits;
        var exponent = parts.exponent;
        if (exponent <= highest && exponent - digits.length >= lowest) {
            var places = Math.max(0, digits.length - exponent - 1);
            var text = numbers.fixed(abs, places, true);
            if (text.charAt(0) === '0' && text.length > 1)
                text = text.substring(1);
            return sign + text;
        }
        var mantissa = digits.charAt(0) + (digits.length > 1 ? '.' + digits.substring(1) : '');
        return sign + mantissa + letter + exponentText(exponent);
    }

    // A number as STR$: a positive one with a space in front.
    function formatNumber(value, kind) {
        if (kind === 'i' || kind === 'l')
            return (value < 0 ? '' : ' ') + String(value);
        if (kind === 'f')
            return formatFloat(value, 7, 'E', -8, 6);
        return formatFloat(value, 16, 'D', -17, 15);
    }
    Basic.formatNumber = formatNumber;

    // VAL: the number at the start of a string; spaces inside the number
    // are skipped, &H, &O, &B are integers (signed in 16 bits, as INTEGER).
    function val(text) {
        var index = 0, length = text.length;
        while (index < length && ' \t\n\r'.indexOf(text.charAt(index)) >= 0)
            ++index;
        if (text.charAt(index) === '&') {
            var letter = text.charAt(index + 1).toUpperCase();
            var base = letter === 'H' ? 16 : (letter === 'B' ? 2 : 8);
            index += letter === 'H' || letter === 'O' || letter === 'B' ? 2 : 1;
            var digitsPattern = base === 16 ? /[0-9A-Fa-f]/ : (base === 2 ? /[01]/ : /[0-7]/);
            var value = 0, count = 0;
            while (index < length && (digitsPattern.test(text.charAt(index)) || text.charAt(index) === ' ')) {
                if (text.charAt(index) !== ' ') {
                    value = value * base + parseInt(text.charAt(index), base);
                    ++count;
                }
                ++index;
            }
            if (count === 0)
                return 0;
            if (value <= 0xFFFF)
                return value << 16 >> 16;
            if (value <= 0xFFFFFFFF)
                return value | 0;
            fail(6);
        }
        var out = '';
        var character = text.charAt(index);
        if (character === '-' || character === '+') {
            out += character;
            ++index;
        }
        var seenDigit = false, seenPoint = false;
        while (index < length) {
            character = text.charAt(index);
            if (character >= '0' && character <= '9') {
                out += character;
                seenDigit = true;
            } else if (character === '.' && !seenPoint) {
                out += character;
                seenPoint = true;
            } else if (character !== ' ' && character !== '\t' && character !== '\n') {
                break;
            }
            ++index;
        }
        if (!seenDigit)
            return 0;
        character = text.charAt(index).toUpperCase();
        if (character === 'E' || character === 'D') {
            var exponent = '';
            var at = index + 1;
            if (text.charAt(at) === '-' || text.charAt(at) === '+')
                exponent += text.charAt(at++);
            var expDigits = '';
            while (at < length && ((text.charAt(at) >= '0' && text.charAt(at) <= '9') || text.charAt(at) === ' ')) {
                if (text.charAt(at) !== ' ')
                    expDigits += text.charAt(at);
                ++at;
            }
            if (expDigits.length > 0)
                out += 'e' + exponent + expDigits;
        }
        var result = Number(out);
        if (!isFinite(result))
            fail(6);
        return result;
    }
    Basic.val = val;

    // --- PRINT USING (after QB64: print_using; printUsing keeps its short
    // names s, x, c, z..z4, ii for comparison with that source)

    // The digits of a value for a format: { neg, dig (a digit string), dp } -
    // value = dig * 10^dp. Floats give the exact decimal digits of the
    // binary value.
    function usingDigits(value, kind) {
        if (kind === 'i' || kind === 'l')
            return { neg: value < 0, dig: String(Math.abs(value)), dp: 0 };
        var neg = value < 0 || (value === 0 && 1 / value < 0);
        if (value === 0)
            return { neg: neg, dig: '0', dp: 0 };
        var exact = numbers.exactDigits(Math.abs(value));
        return { neg: neg, dig: exact.digits, dp: exact.exponent - exact.digits.length };
    }

    // One value by the format from the position start: { text, next } - the
    // text (literals before the field, the field, literals after it up to
    // the next field) and the position of the next field (0 - from the start
    // of the format).
    function printUsing(format, start, value, kind) {
        var type = kind === 's' ? 2 : 1;
        var pu = type === 1 ? usingDigits(value, kind) : null;
        var dig = pu !== null ? pu.dig.split('') : [];
        var ndig = dig.length;
        var dp = pu !== null ? pu.dp : 0;
        var neg = pu !== null && pu.neg;
        var expChar = kind === 'd' ? 'D' : 'E';
        var len = format.length;
        var s = start, x, c, out = '';
        for (;;) {
            var rounded = false;
            repass: for (;;) {
                x = s - 1;
                var leadingPlus = 0, dollar = 0, asterisk = 0, before = 0, commas = 0, point = 0, after = 0;
                var trailingPlus = 0, expDigits = 0, trailingMinus = 0, beforeWithCommas = 0, leadingZero = 0;
                var stage = 0;
                for (;;) {
                    ++x;
                    if (x >= len)
                        break;
                    c = format.charAt(x);
                    var left = len - x;
                    if (stage >= 2 && stage <= 4 && (c === '+' || c === '-')) {
                        if (c === '+')
                            trailingPlus = 1;
                        else
                            trailingMinus = 1;
                        ++x;
                        break;
                    }
                    if (stage >= 2 && stage <= 3) {
                        if (left >= 5 && format.substr(x, 5) === '^^^^^') {
                            expDigits = 3;
                            stage = 4;
                            x += 4;
                            continue;
                        }
                        if (left >= 4 && format.substr(x, 4) === '^^^^') {
                            expDigits = 2;
                            stage = 4;
                            x += 3;
                            continue;
                        }
                    }
                    if (stage === 3 && c === '#') {
                        ++after;
                        continue;
                    }
                    if (stage === 2 && c === ',') {
                        commas = 1;
                        ++before;
                        continue;
                    }
                    if (stage <= 2 && c === '#') {
                        ++before;
                        stage = 2;
                        continue;
                    }
                    if (stage <= 2 && c === '.') {
                        point = 1;
                        stage = 3;
                        continue;
                    }
                    if (stage <= 1) {
                        if (left >= 3 && format.substr(x, 3) === '**$') {
                            asterisk = 1;
                            before = 2;
                            dollar = 1;
                            stage = 2;
                            x += 2;
                            continue;
                        }
                        if (left >= 2 && format.substr(x, 2) === '**') {
                            asterisk = 1;
                            before = 2;
                            stage = 2;
                            ++x;
                            continue;
                        }
                        if (left >= 2 && format.substr(x, 2) === '$$') {
                            dollar = 1;
                            before = 1;
                            stage = 2;
                            ++x;
                            continue;
                        }
                    }
                    if (stage === 0 && c === '+') {
                        leadingPlus = 1;
                        stage = 1;
                        continue;
                    }
                    break;
                }

                if (stage <= 1 || (before === 0 && after === 0)) {
                    // A string field or a literal.
                    var size = 0;
                    x = s;
                    if (x < len) {
                        c = format.charAt(x);
                        if (c === '&')
                            size = -1;
                        if (c === '!')
                            size = 1;
                        if (c === '\\') {
                            var count = 1;
                            ++x;
                            for (;;) {
                                if (x >= len) {
                                    count = 0;
                                    break;
                                }
                                c = format.charAt(x);
                                ++count;
                                if (c === ' ') {
                                    ++x;
                                    continue;
                                }
                                if (c !== '\\')
                                    count = 0;
                                break;
                            }
                            size = count;
                        }
                        if (size !== 0) {
                            if (type === 0)
                                return { text: out, next: s };
                            if (type === 1)
                                fail(13);
                            if (size !== -1) {
                                s += size;
                                for (var position = 0; position < size; ++position)
                                    out += position < value.length ? value.charAt(position) : ' ';
                            } else {
                                out += value;
                                ++s;
                            }
                            type = 0;
                            if (s >= len)
                                return { text: out, next: 0 };
                            break repass;
                        }
                    }
                    if (format.charAt(s) === '_' && s < len - 1)
                        ++s;
                    out += format.charAt(s);
                    ++s;
                    if (s >= len) {
                        s = 0;
                        if (type === 0)
                            return { text: out, next: 0 };
                        if (start === 0)
                            fail(5);
                    }
                    break repass;
                }

                if (type === 0)
                    return { text: out, next: s };
                if (type === 2)
                    fail(13);
                var extraSign = 0;
                if (expDigits) {
                    if (!leadingPlus && !trailingPlus && !trailingMinus) {
                        --before;
                        if (before === -1) {
                            --after;
                            before = 0;
                            if (after === 0) {
                                point = 0;
                                ++before;
                            }
                        }
                        extraSign = 1;
                    }
                } else {
                    if (neg && !leadingPlus && !trailingPlus && !trailingMinus) {
                        --before;
                        extraSign = 1;
                    }
                    if (commas) {
                        beforeWithCommas = before;
                        before -= Math.floor(before / 4);
                    }
                }
                if (before === 0 && ndig + dp === 1 && dig[0] === '0')
                    --dp;
                var cantFit = 0, z = 0, z2 = 0, z3, z4 = 0, expText = '';
                if (expDigits) {
                    if (extraSign && !neg && before <= 0) {
                        extraSign = 0;
                        ++before;
                        if (before === 1 && after > 0) {
                            --before;
                            extraSign = 2;
                        }
                    }
                    if (before === 0 && after === 0) {
                        cantFit = 1;
                        before = 1;
                    }
                    z2 = ndig + dp - 1;
                    z3 = before ? before - 1 : -1;
                    z = z2 - z3;
                    expText = String(Math.abs(z));
                    z2 = expText.length;
                    if (z2 > expDigits) {
                        cantFit = 1;
                        expDigits = z2;
                    }
                } else {
                    z = ndig + dp;
                    if (before < z) {
                        before = z;
                        cantFit = 1;
                        if (commas)
                            beforeWithCommas = before + Math.floor((before - 1) / 3);
                    }
                }
                var field = cantFit ? '%' : '';
                var ii = 0;
                if (leadingPlus)
                    field += neg ? '-' : '+';
                if (expDigits) {
                    if (dollar)
                        field += '$';
                    if (extraSign)
                        field += neg ? '-' : (extraSign === 2 ? '0' : ' ');
                    for (z3 = 0; z3 < before; ++z3)
                        field += ii < ndig ? dig[ii++] : '0';
                    if (point)
                        field += '.';
                    for (z3 = 0; z3 < after; ++z3)
                        field += ii < ndig ? dig[ii++] : '0';
                    if (!rounded && ii < ndig && dig[ii] >= '5') {
                        rounded = true;
                        roundUp(ii);
                        continue repass;
                    }
                    field += expChar + (z >= 0 ? '+' : '-');
                    for (z3 = 0; z3 < expDigits - z2; ++z3)
                        field += '0';
                    field += expText;
                } else {
                    if (!commas)
                        beforeWithCommas = before;
                    z = ndig + dp;
                    z4 = z < 0 ? -z : 0;
                    if (commas)
                        z = z + Math.floor((z - 1) / 3);
                    if (z < 0)
                        z = 0;
                    z2 = beforeWithCommas - z;
                    if (z === 0 && z2 > 0) {
                        leadingZero = 1;
                        --z2;
                    }
                    for (z3 = 0; z3 < z2; ++z3)
                        field += asterisk ? '*' : ' ';
                    if (extraSign)
                        field += '-';
                    if (dollar)
                        field += '$';
                    if (leadingZero)
                        field += '0';
                    for (z3 = 0; z3 < z; ++z3) {
                        if (commas && ((z - z3) & 3) === 0)
                            field += ',';
                        else
                            field += ii < ndig ? dig[ii++] : '0';
                    }
                    if (point)
                        field += '.';
                    for (z3 = 0; z3 < after; ++z3) {
                        if (z4) {
                            --z4;
                            field += '0';
                        } else {
                            field += ii < ndig ? dig[ii++] : '0';
                        }
                    }
                    if (!rounded && ii < ndig && dig[ii] >= '5') {
                        rounded = true;
                        roundUp(ii);
                        continue repass;
                    }
                }
                if (trailingPlus)
                    field += neg ? '-' : '+';
                if (trailingMinus)
                    field += neg ? '-' : ' ';
                out += field;
                s = x;
                type = 0;
                if (s >= len)
                    return { text: out, next: 0 };
                break repass;
            }
        }

        // The last printed digit (before ii) goes up with a carry.
        function roundUp(ii) {
            dig.unshift('0');
            var at = ii;
            for (;;) {
                if (dig[at] === '9') {
                    dig[at] = '0';
                    --at;
                    continue;
                }
                dig[at] = String.fromCharCode(dig[at].charCodeAt(0) + 1);
                break;
            }
            if (dig[0] !== '0')
                ++ndig;
            else
                dig.shift();
        }
    }
    Basic.printUsing = printUsing;

    // --- Strings

    function checkCount(count) {
        if (count < 0)
            fail(5);
        return count;
    }

    Basic.left = function (text, count) {
        return text.substring(0, checkCount(count));
    };
    Basic.right = function (text, count) {
        checkCount(count);
        return count >= text.length ? text : text.substring(text.length - count);
    };
    Basic.mid = function (text, start, count) {
        if (start < 1)
            fail(5);
        if (count === undefined)
            return text.substring(start - 1);
        return text.substr(start - 1, checkCount(count));
    };
    // MID$(s$, start, length) = value: replaces in place, the length of the string stays.
    Basic.midAssign = function (text, start, length, value) {
        if (start < 1 || start > text.length)
            fail(5);
        var count = Math.min(length === undefined ? value.length : checkCount(length), value.length,
                             text.length - start + 1);
        return text.substring(0, start - 1) + value.substring(0, count) + text.substring(start - 1 + count);
    };
    Basic.instr = function (start, text, find) {
        if (start < 1)
            fail(5);
        if (start > text.length)
            return 0;
        if (find.length === 0)
            return start;
        return text.indexOf(find, start - 1) + 1;
    };
    Basic.chr = function (code) {
        if (code < 0 || code > 0x10FFFF)
            fail(5);
        return String.fromCodePoint(code);
    };
    Basic.asc = function (text) {
        if (text.length === 0)
            fail(5);
        return text.codePointAt(0);
    };
    Basic.space = function (count) {
        return new Array(checkCount(count) + 1).join(' ');
    };
    Basic.string = function (count, character) {
        checkCount(count);
        var ch = typeof character === 'string'
            ? (character.length === 0 ? fail(5) : String.fromCodePoint(character.codePointAt(0)))
            : Basic.chr(character);
        return new Array(count + 1).join(ch);
    };
    Basic.ltrim = function (text) {
        return text.replace(/^ +/, '');
    };
    Basic.rtrim = function (text) {
        return text.replace(/ +$/, '');
    };
    // HEX$ and OCT$: a negative value as a complement to 16 bits (INTEGER) or 32.
    Basic.radix = function (value, base, wide) {
        if (value < 0)
            value = !wide && value >= -32768 ? value + 65536 : value + 4294967296;
        return value.toString(base).toUpperCase();
    };
    // A fixed-length string: padded with spaces or cut.
    Basic.fixed = function (text, length) {
        if (text.length === length)
            return text;
        if (text.length > length)
            return text.substring(0, length);
        return text + new Array(length - text.length + 1).join(' ');
    };
    // LSET and RSET: within the length of the old value.
    Basic.lset = function (old, value, right) {
        var length = old.length;
        if (value.length >= length)
            return value.substring(0, length);
        var pad = new Array(length - value.length + 1).join(' ');
        return right ? pad + value : value + pad;
    };

    // MKI$, MKL$, MKS$, MKD$ and CVI...: the bytes of a value as a string of characters 0..255.
    var conversion = new DataView(new ArrayBuffer(8));
    Basic.mk = function (value, kind) {
        var size = { i: 2, l: 4, f: 4, d: 8 }[kind];
        if (kind === 'i')
            conversion.setInt16(0, value, true);
        else if (kind === 'l')
            conversion.setInt32(0, value, true);
        else if (kind === 'f')
            conversion.setFloat32(0, value, true);
        else
            conversion.setFloat64(0, value, true);
        var text = '';
        for (var index = 0; index < size; ++index)
            text += String.fromCharCode(conversion.getUint8(index));
        return text;
    };
    Basic.cv = function (text, kind) {
        var size = { i: 2, l: 4, f: 4, d: 8 }[kind];
        if (text.length < size)
            fail(5);
        for (var index = 0; index < size; ++index)
            conversion.setUint8(index, text.charCodeAt(index) & 255);
        if (kind === 'i')
            return conversion.getInt16(0, true);
        if (kind === 'l')
            return conversion.getInt32(0, true);
        if (kind === 'f')
            return conversion.getFloat32(0, true);
        return conversion.getFloat64(0, true);
    };

    // --- Records (TYPE)

    // A record description: fields { name, js, kind ('i' 'l' 'f' 'd' 's' 'o'
    // 'r'), length (STRING * n), record (the nested description) }.
    function RecordType(name, display) {
        this.name = name;
        this.display = display;
        this.fields = [];
        this.size = 0;
    }
    RecordType.prototype.create = function () {
        var object = {};
        var fields = this.fields;
        for (var index = 0; index < fields.length; ++index) {
            var field = fields[index];
            object[field.js] = defaultValue(field.kind, field.length, field.record);
        }
        return object;
    };
    // Assigning a record copies the fields into the existing object.
    RecordType.prototype.assign = function (target, source) {
        var fields = this.fields;
        for (var index = 0; index < fields.length; ++index) {
            var field = fields[index];
            if (field.kind === 'r')
                field.record.assign(target[field.js], source[field.js]);
            else
                target[field.js] = source[field.js];
        }
        return target;
    };
    RecordType.prototype.copy = function (source) {
        return this.assign(this.create(), source);
    };
    Basic.RecordType = RecordType;

    var SIZES = { i: 2, l: 4, f: 4, d: 8, o: 8 };
    Basic.sizeOf = function (kind, length, record) {
        if (kind === 's')
            return length || 0;
        if (kind === 'r')
            return record.size;
        return SIZES[kind];
    };

    function defaultValue(kind, length, record) {
        switch (kind) {
        case 's': return length ? new Array(length + 1).join(' ') : '';
        case 'o': return null;
        case 'r': return record.create();
        }
        return 0;
    }
    Basic.defaultValue = defaultValue;

    // --- Arrays
    //
    // An array is an object that lives as long as its variable: DIM, REDIM
    // and ERASE change it in place, so references to it in the translated
    // code (and procedure parameters) do not go stale. Storage is row by
    // row, d - the data, l0/n0 - the lower bound and the length of the first
    // dimension.

    function BArray(kind, length, record) {
        this.kind = kind;
        this.length = length || 0;
        this.record = record || null;
        this.dims = 0;
        this.lower = [];
        this.counts = [];
        this.l0 = 0;
        this.n0 = 0;
        this.d = EMPTY;
        this.dimensioned = false;
    }
    var EMPTY = [];

    function storage(kind, count, length, record) {
        switch (kind) {
        case 'i': return new Int16Array(count);
        case 'l': return new Int32Array(count);
        case 'f': return new Float32Array(count);
        case 'd': return new Float64Array(count);
        }
        var data = new Array(count);
        for (var index = 0; index < count; ++index)
            data[index] = defaultValue(kind, length, record);
        return data;
    }

    // bounds: [lower, upper, lower, upper, ...]; dynamic - the bounds were
    // computed at run time (ERASE frees the array instead of clearing it).
    BArray.prototype.dim = function (bounds, preserve, dynamic) {
        this.dynamic = !!dynamic;
        var dims = bounds.length / 2;
        var lower = [], counts = [], total = 1;
        for (var index = 0; index < dims; ++index) {
            var lo = bounds[2 * index], hi = bounds[2 * index + 1];
            if (hi < lo)
                fail(9);
            lower.push(lo);
            counts.push(hi - lo + 1);
            total *= hi - lo + 1;
        }
        if (total > 100000000)
            fail(7);
        var old = this.d;
        var data = storage(this.kind, total, this.length, this.record);
        if (preserve && this.dimensioned) {
            if (dims !== this.dims)
                fail(9);
            // REDIM PRESERVE: the elements stay at the same indices (by the
            // first dimension when there is one, otherwise in storage order,
            // as in QB64).
            var keep = Math.min(old.length, data.length);
            if (dims === 1) {
                var shift = this.l0 - lower[0];
                for (var at = 0; at < old.length; ++at) {
                    var to = at + shift;
                    if (to >= 0 && to < data.length)
                        data[to] = old[at];
                }
            } else {
                for (var element = 0; element < keep; ++element)
                    data[element] = old[element];
            }
        }
        this.dims = dims;
        this.lower = lower;
        this.counts = counts;
        this.l0 = lower[0];
        this.n0 = counts[0];
        this.d = data;
        this.dimensioned = true;
        return this;
    };

    BArray.prototype.erase = function () {
        this.dims = 0;
        this.lower = [];
        this.counts = [];
        this.l0 = 0;
        this.n0 = 0;
        this.d = EMPTY;
        this.dimensioned = false;
    };

    // A static array: ERASE clears the elements.
    BArray.prototype.clear = function () {
        this.d = storage(this.kind, this.d.length, this.length, this.record);
    };

    BArray.prototype.eraseArray = function () {
        if (this.dynamic)
            this.erase();
        else
            this.clear();
    };

    BArray.prototype.index = function (subscripts) {
        if (subscripts.length !== this.dims)
            fail(9);
        var offset = 0;
        for (var index = 0; index < subscripts.length; ++index) {
            var position = subscripts[index] - this.lower[index];
            if (!(position >= 0 && position < this.counts[index]))
                fail(9);
            offset = offset * this.counts[index] + position;
        }
        return offset;
    };
    BArray.prototype.ix2 = function (row, column) {
        if (this.dims !== 2)
            fail(9);
        var rowOffset = row - this.l0, columnOffset = column - this.lower[1];
        if (!(rowOffset >= 0 && rowOffset < this.n0 && columnOffset >= 0 && columnOffset < this.counts[1]))
            fail(9);
        return rowOffset * this.counts[1] + columnOffset;
    };
    BArray.prototype.bound = function (dimension, upper) {
        if (!this.dimensioned || dimension < 1 || dimension > this.dims)
            fail(9);
        var lo = this.lower[dimension - 1];
        return upper ? lo + this.counts[dimension - 1] - 1 : lo;
    };
    Basic.BArray = BArray;

    // --- The run time of the session ($B in the translated code)

    function Runtime(env) {
        this.env = env;
        this.global = env.global;
        this.session = null;
        this.column = 0;
        this.seed = 327680;
        this.seedFirst = 327680;
        this.err = 0;
        this.erl = 0;
        // Values of the parameters by reference after a procedure call.
        this.o = [];
        this.lastLimit = 0;
        this.graphics = null;
    }
    Basic.Runtime = Runtime;

    Runtime.prototype.reset = function () {
        this.column = 0;
        this.err = 0;
        this.erl = 0;
    };

    // --- Output

    Runtime.prototype.write = function (text) {
        if (text.length === 0)
            return;
        this.env.out.write(text);
        var end = text.lastIndexOf('\n');
        this.column = end >= 0 ? text.length - end - 1 : this.column + text.length;
    };

    Runtime.prototype.flush = function () {
        this.env.out.flush();
    };

    // The picture goes to the canvas (graphics) when a run or its step ends.
    Runtime.prototype.present = function () {
        if (this.graphics !== null)
            this.graphics.present();
    };

    // PRINT: a number with a space after it, a string, "," (a zone of 14 characters), the line end.
    Runtime.prototype.pn = function (value, kind) {
        this.write(formatNumber(value, kind) + ' ');
    };
    Runtime.prototype.ps = function (text) {
        this.write(text);
    };
    Runtime.prototype.pz = function () {
        var next = (Math.floor(this.column / 14) + 1) * 14;
        this.write(new Array(next - this.column + 1).join(' '));
    };
    Runtime.prototype.pe = function () {
        this.write('\n');
    };
    // TAB(n): to column n (from 1); when already past it - on a new line.
    Runtime.prototype.tab = function (column) {
        column = Math.max(1, Math.min(column, 32767)) - 1;
        if (this.column > column)
            this.write('\n');
        this.write(new Array(column - this.column + 1).join(' '));
    };
    Runtime.prototype.spc = function (count) {
        this.write(new Array(Math.max(0, Math.min(count, 32767)) + 1).join(' '));
    };
    // PRINT USING: values [value, kind, ...]; newline - a line break at the end.
    Runtime.prototype.using = function (format, values, newline) {
        if (format.length === 0)
            fail(5);
        var text = '';
        var position = 0;
        for (var index = 0; index < values.length; index += 2) {
            var result = printUsing(format, position, values[index], values[index + 1]);
            text += result.text;
            position = result.next;
        }
        this.write(text);
        if (newline)
            this.write('\n');
    };
    // WRITE: values separated by commas, strings in quotes, numbers without spaces.
    Runtime.prototype.writeValues = function (values) {
        var parts = [];
        for (var index = 0; index < values.length; index += 2) {
            var kind = values[index + 1];
            var value = values[index];
            if (kind === 's')
                parts.push('"' + value + '"');
            else
                parts.push(formatNumber(value, kind).replace(/^ /, ''));
        }
        this.write(parts.join(',') + '\n');
    };
    Runtime.prototype.pos = function () {
        return this.column + 1;
    };
    Runtime.prototype.cls = function () {
        this.flush();
        this.column = 0;
        this.env.clear();
        if (this.graphics !== null)
            this.graphics.clear();
    };

    // Fields of an INPUT line: separated by commas, a string may be quoted.
    function inputFields(line) {
        var fields = [];
        var at = 0;
        for (;;) {
            while (at < line.length && (line.charAt(at) === ' ' || line.charAt(at) === '\t'))
                ++at;
            var value;
            if (line.charAt(at) === '"') {
                var close = line.indexOf('"', at + 1);
                if (close < 0)
                    close = line.length;
                value = line.substring(at + 1, close);
                at = close + 1;
                while (at < line.length && line.charAt(at) !== ',')
                    ++at;
            } else {
                var start = at;
                while (at < line.length && line.charAt(at) !== ',')
                    ++at;
                value = line.substring(start, at).replace(/\s+$/, '');
            }
            fields.push(value);
            if (at >= line.length)
                return fields;
            ++at;
        }
    }

    // INPUT from the keyboard (standard input of the host): the prompt, a
    // line, its fields in the variables by their kinds ('s' or a number);
    // a wrong line - "Redo from start" and again. LINE INPUT takes the line
    // as it is. At the end of input the variables get empty values.
    Runtime.prototype.input = function (prompt, question, keepLine, kinds, lineInput) {
        for (;;) {
            this.write((prompt || '') + (question ? '? ' : ''));
            this.flush();
            var line = this.env.input.readLine();
            if (!keepLine)
                this.write('\n');
            if (line === null)
                return kinds.map(function (kind) { return kind === 's' ? '' : 0; });
            if (lineInput)
                return [line];
            var fields = inputFields(line);
            var values = [];
            var ok = fields.length === kinds.length || (kinds.length === 1 && fields.length === 1);
            for (var index = 0; ok && index < kinds.length; ++index) {
                var field = fields[index].trim();
                if (kinds[index] === 's')
                    values.push(fields[index].replace(/^\s+/, ''));
                else if (field === '')
                    values.push(0);
                else if (/^[+-]?(\d+\.?\d*|\.\d+)([edED][+-]?\d+)?[!#%&]?$/.test(field))
                    values.push(Number(field.replace(/[!#%&]$/, '').replace(/[dD]/, 'e')));
                else
                    ok = false;
            }
            if (ok)
                return values;
            this.write('Redo from start\n');
        }
    };

    // INKEY$: the next character of standard input or "" - waits for a
    // line only when nothing is read yet.
    Runtime.prototype.inkey = function () {
        this.flush();
        var character = this.env.input.readChar();
        return character === null ? '' : (character === '\n' ? '\r' : character);
    };

    // INPUT$(n) from the keyboard: n characters (fewer at the end of input).
    Runtime.prototype.inputChars = function (count) {
        this.flush();
        var text = '';
        var character;
        while (text.length < count && (character = this.env.input.readChar()) !== null)
            text += character === '\n' ? '\r' : character;
        return text;
    };

    // --- Random numbers (as QBasic: a 24-bit linear congruential generator)

    var randomBytes = new DataView(new ArrayBuffer(8));

    Runtime.prototype.rnd = function (argument) {
        if (argument === undefined)
            argument = 1;
        if (argument !== 0) {
            if (argument < 0) {
                randomBytes.setFloat32(0, argument, true);
                var bits = randomBytes.getUint32(0, true);
                this.seed = (bits & 0xFFFFFF) + (bits >>> 24);
            }
            this.seed = (Math.imul(this.seed, 16598013) + 12820163) & 0xFFFFFF;
        }
        return Math.fround(this.seed / 0x1000000);
    };

    Runtime.prototype.randomize = function (seed) {
        randomBytes.setFloat64(0, seed, true);
        var bits = randomBytes.getUint32(4, true);
        bits = (bits ^ (bits >>> 16)) >>> 0;
        this.seed = ((bits & 0xFFFF) << 8) | (this.seed & 0xFF);
    };

    // --- Time

    Runtime.prototype.timer = function () {
        var now = new Date();
        var midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return Math.fround((now.getTime() - midnight.getTime()) / 1000);
    };

    function two(value) {
        return (value < 10 ? '0' : '') + value;
    }

    Runtime.prototype.date = function () {
        var now = new Date();
        return two(now.getMonth() + 1) + '-' + two(now.getDate()) + '-' + now.getFullYear();
    };

    Runtime.prototype.time = function () {
        var now = new Date();
        return two(now.getHours()) + ':' + two(now.getMinutes()) + ':' + two(now.getSeconds());
    };

    // SLEEP n (seconds), _DELAY: a real wait, the program goes on by a
    // timer. Without an argument (wait for a key) - at once.
    Runtime.prototype.sleep = function* (seconds) {
        if (!(seconds > 0))
            return;
        this.env.scheduler.sleep(Math.round(seconds * 1000));
        yield;
    };

    // _LIMIT n: at most n times a second.
    Runtime.prototype.limit = function* (rate) {
        if (!(rate > 0))
            return;
        var period = 1000 / rate;
        var now = Date.now();
        var wait = this.lastLimit + period - now;
        if (wait > 0 && wait <= period) {
            this.lastLimit += period;
            this.env.scheduler.sleep(Math.round(wait));
            yield;
            return;
        }
        this.lastLimit = now;
        // Let others run: the canvas and the console update.
        this.env.scheduler.sleep(0);
        yield;
    };

    Runtime.prototype.sleepNow = function (seconds) {
        return this.env.scheduler.runNested(this.sleep(seconds));
    };

    Runtime.prototype.limitNow = function (rate) {
        return this.env.scheduler.runNested(this.limit(rate));
    };

    // --- Arithmetic that takes too much room in the code

    Runtime.prototype.ov = function () {
        fail(6);
    };
    Runtime.prototype.dz = function () {
        fail(11);
    };
    Runtime.prototype.e = function (code) {
        fail(code);
    };
    // Integer division and MOD: the operands are integers already.
    Runtime.prototype.idiv = function (dividend, divisor, wide) {
        if (divisor === 0)
            fail(11);
        var quotient = Math.trunc(dividend / divisor);
        if (wide ? quotient > I32_MAX : quotient > I16_MAX)
            fail(6);
        return quotient;
    };
    Runtime.prototype.mod = function (dividend, divisor) {
        if (divisor === 0)
            fail(11);
        return (dividend % divisor) + 0;
    };
    Runtime.prototype.pow = function (base, exponent) {
        if (base < 0 && exponent !== Math.floor(exponent))
            fail(5);
        if (base === 0 && exponent < 0)
            fail(11);
        return Math.pow(base, exponent);
    };
    Runtime.prototype.sqr = function (value) {
        if (value < 0)
            fail(5);
        return Math.sqrt(value);
    };
    Runtime.prototype.log = function (value) {
        if (!(value > 0))
            fail(5);
        return Math.log(value);
    };
    Runtime.prototype.cint = cint;
    Runtime.prototype.clng = clng;
    Runtime.prototype.csng = csng;
    Runtime.prototype.fin = finite;
    Runtime.prototype.str = formatNumber;
    Runtime.prototype.val = val;
    ['left', 'right', 'mid', 'midAssign', 'instr', 'chr', 'asc', 'space', 'string', 'ltrim', 'rtrim', 'radix', 'fixed',
     'lset', 'mk', 'cv'].forEach(function (name) {
        Runtime.prototype[name] = Basic[name];
    });

    // --- DATA

    // The data of a unit: DATA values in order and the READ position.
    function DataSet(items) {
        this.items = items;
        this.position = 0;
    }
    DataSet.prototype.next = function () {
        if (this.position >= this.items.length)
            fail(4);
        return this.items[this.position++];
    };
    DataSet.prototype.restore = function (index) {
        this.position = index;
    };
    Basic.DataSet = DataSet;

    Runtime.prototype.readNumber = function (data, kind) {
        var item = data.next();
        if (item.quoted)
            fail(2);
        var text = item.value.trim();
        if (text.length === 0)
            return 0;
        if (!/^[+-]?(\d+\.?\d*|\.\d+)([EeDd][+-]?\d+)?[%&!#]?$/.test(text) && !/^&[HhOoBb]?[0-9A-Fa-f]+[%&]?$/.test(text))
            fail(2);
        return val(text.replace(/[%&!#]$/, ''));
    };
    Runtime.prototype.readString = function (data) {
        return data.next().value;
    };
})(globalThis);
