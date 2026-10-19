// Java: the native methods of java.lang and java.io. The key is
// name(parameter types after erasure); the receiver is this (a string, a
// number or an object).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Java = T.java;
    Java.natives = Java.natives || {};
    if (Java.natives['java.lang.Object'])
        return;

    var i64 = T.i64;
    var natives = Java.natives;

    function rt() {
        return Java.rt;
    }

    function fail(name, message) {
        return rt().exception(name, message);
    }

    natives['java.lang.Object'] = {
        'equals(Object)': function (other) { return this === other; },
        'hashCode()': function () { return rt().identityHash(this); },
        'toString()': function () {
            return rt().className(this) + '@' + rt().hashCode(this).toString(16);
        },
        'getClass()': function () { return rt().classOfValue(this); },
        'wait()': Java.asyncNative(function* () { yield* rt().waitFiber(this, 0); }),
        'wait(long)': Java.asyncNative(function* (millis) { yield* rt().waitFiber(this, i64.toFloat(millis)); }),
        'notify()': function () { rt().notify(this, false); },
        'notifyAll()': function () { rt().notify(this, true); },
        // A shallow copy: the fields are own properties of the object.
        'clone()': function () {
            if (rt().arrayDescriptor(this) !== null)
                return rt().cloneArray(this);
            if (!rt().is(this, rt().byName('java.lang.Cloneable')))
                throw fail('java.lang.CloneNotSupportedException', rt().className(this));
            var copy = Object.create(Object.getPrototypeOf(this));
            var self = this;
            Object.keys(this).forEach(function (key) { copy[key] = self[key]; });
            return copy;
        }
    };

    // A string index out of bounds.
    function checkIndex(text, index) {
        if (index < 0 || index >= text.length)
            throw fail('java.lang.StringIndexOutOfBoundsException', 'Index ' + index + ' out of bounds for length ' + text.length);
        return index;
    }

    function checkRange(text, start, end) {
        if (start < 0 || end > text.length || start > end)
            throw fail('java.lang.StringIndexOutOfBoundsException', 'Range [' + start + ', ' + end + ') out of bounds for length ' + text.length);
    }

    // A part of a char array (String(char[], offset, count)).
    function charsRange(chars, offset, count) {
        rt().nonNull(chars);
        if (offset < 0 || count < 0 || offset > chars.length - count)
            throw fail('java.lang.StringIndexOutOfBoundsException', 'Range [' + offset + ', ' + offset + ' + ' + count +
                       ') out of bounds for length ' + chars.length);
        return String.fromCharCode.apply(null, Array.prototype.slice.call(chars, offset, offset + count));
    }

    // trim in Java removes the characters <= space.
    function javaTrim(text) {
        var start = 0, end = text.length;
        while (start < end && text.charCodeAt(start) <= 32)
            ++start;
        while (end > start && text.charCodeAt(end - 1) <= 32)
            --end;
        return text.substring(start, end);
    }
    Java.trim = javaTrim;
    // --- Regular expressions: Java -> JavaScript (the common part is the same).

    var regexCache = new Map();
    Java.regex = function (pattern, flags) {
        var key = pattern + '/' + (flags || '');
        var found = regexCache.get(key);
        if (found !== undefined)
            return found;
        // \Q...\E - literal text (Pattern.quote).
        pattern = pattern.replace(/\\Q([\s\S]*?)(?:\\E|$)/g, function (all, text) {
            return text.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&');
        });
        var source = pattern.replace(/\(\?<([a-zA-Z][a-zA-Z0-9]*)>/g, '(').replace(/\\p\{Alpha\}/g, '[A-Za-z]')
            .replace(/\\p\{Digit\}/g, '[0-9]').replace(/\\p\{Alnum\}/g, '[A-Za-z0-9]').replace(/\\p\{Punct\}/g, '[!-\\/:-@\\[-`{-~]')
            .replace(/\\p\{Upper\}/g, '[A-Z]').replace(/\\p\{Lower\}/g, '[a-z]').replace(/\\p\{Space\}/g, '\\s')
            .replace(/\\p\{L\}/g, '[A-Za-z\\u00C0-\\u024F\\u0400-\\u04FF]').replace(/\\Z|\\z/g, '$').replace(/\\A/g, '^');
        try {
            found = new RegExp(source, flags || '');
        } catch (error) {
            throw fail('java.util.regex.PatternSyntaxException', String(error.message) + ' near index 0\n' + pattern);
        }
        regexCache.set(key, found);
        return found;
    };

    // A replacement in the Java style: $1, \$ is literal.
    Java.replacement = function (text) {
        var out = '';
        for (var index = 0; index < text.length; ++index) {
            var ch = text.charAt(index);
            if (ch === '\\' && index + 1 < text.length) {
                var next = text.charAt(++index);
                out += next === '$' ? '$$' : next;
            } else if (ch === '$') {
                var digits = /^\d+/.exec(text.substring(index + 1));
                if (digits === null)
                    throw fail('java.lang.IllegalArgumentException', 'Illegal group reference');
                out += '$' + digits[0];
                index += digits[0].length;
            } else {
                out += ch;
            }
        }
        return out;
    };

    // String.split: empty trailing parts are removed (limit 0), groups do not go in.
    Java.split = function (text, pattern, limit) {
        var regex = Java.regex(pattern, 'g');
        var parts = [];
        var start = 0;
        regex.lastIndex = 0;
        var match;
        while ((limit <= 0 || parts.length < limit - 1) && (match = regex.exec(text)) !== null) {
            if (match[0].length === 0) {
                if (match.index >= text.length)
                    break;
                if (match.index === 0) {
                    regex.lastIndex = 1;
                    continue;
                }
                parts.push(text.substring(start, match.index));
                start = match.index;
                regex.lastIndex = match.index + 1;
                continue;
            }
            if (!(match.index === 0 && match[0].length > 0 && start === 0 && parts.length === 0 && false))
                parts.push(text.substring(start, match.index));
            start = match.index + match[0].length;
        }
        parts.push(text.substring(start));
        if (limit === 0) {
            while (parts.length > 1 && parts[parts.length - 1] === '')
                parts.pop();
            if (parts.length === 1 && parts[0] === '' && text.length > 0)
                parts = [];
        }
        return parts;
    };
    function stringArray(list) {
        return rt().arrayOf('[Ljava.lang.String;', list);
    }

    // A CharSequence as a string (a string, a StringBuilder and others).
    function text(value) {
        return rt().str(value);
    }

    natives['java.lang.String'] = {
        '<init>()': function () { return ''; },
        '<init>(String)': function (original) { return rt().nonNull(original); },
        '<init>(char[])': function (chars) { return String.fromCharCode.apply(null, Array.prototype.slice.call(chars)); },
        '<init>(char[],int,int)': charsRange,
        '<init>(StringBuilder)': function (builder) { return builder.$s; },
        'length()': function () { return this.length; },
        'charAt(int)': function (index) { return this.charCodeAt(checkIndex(this, index)); },
        'isEmpty()': function () { return this.length === 0; },
        'isBlank()': function () { return /^\s*$/.test(this); },
        'subSequence(int,int)': function (start, end) { checkRange(this, start, end); return this.substring(start, end); },
        'substring(int)': function (start) { checkRange(this, start, this.length); return this.substring(start); },
        'substring(int,int)': function (start, end) { checkRange(this, start, end); return this.substring(start, end); },
        'indexOf(int)': function (ch) { return this.indexOf(String.fromCharCode(ch)); },
        'indexOf(int,int)': function (ch, from) { return this.indexOf(String.fromCharCode(ch), Math.max(0, from)); },
        'indexOf(String)': function (text) { return this.indexOf(rt().nonNull(text)); },
        'indexOf(String,int)': function (text, from) { return this.indexOf(rt().nonNull(text), Math.max(0, from)); },
        'lastIndexOf(int)': function (ch) { return this.lastIndexOf(String.fromCharCode(ch)); },
        'lastIndexOf(int,int)': function (ch, from) { return from < 0 ? -1 : this.lastIndexOf(String.fromCharCode(ch), from); },
        'lastIndexOf(String)': function (text) { return this.lastIndexOf(rt().nonNull(text)); },
        'lastIndexOf(String,int)': function (text, from) { return from < 0 ? -1 : this.lastIndexOf(rt().nonNull(text), from); },
        'contains(CharSequence)': function (part) { return this.indexOf(text(rt().nonNull(part))) >= 0; },
        'startsWith(String)': function (prefix) { return this.startsWith(rt().nonNull(prefix)); },
        'startsWith(String,int)': function (prefix, offset) { return offset >= 0 && this.startsWith(rt().nonNull(prefix), offset); },
        'endsWith(String)': function (suffix) { return this.endsWith(rt().nonNull(suffix)); },
        'equals(Object)': function (other) { return typeof other === 'string' && String(this) === other; },
        'equalsIgnoreCase(String)': function (other) {
            return typeof other === 'string' && this.length === other.length && this.toUpperCase() === other.toUpperCase();
        },
        'compareTo(String)': function (other) { return Java.compareStrings(String(this), rt().nonNull(other)); },
        'compareToIgnoreCase(String)': function (other) {
            return Java.compareStrings(this.toUpperCase().toLowerCase(), rt().nonNull(other).toUpperCase().toLowerCase());
        },
        'hashCode()': function () { return Java.stringHash(String(this)); },
        'toString()': function () { return String(this); },
        'toUpperCase()': function () { return this.toUpperCase(); },
        'toLowerCase()': function () { return this.toLowerCase(); },
        'trim()': function () { return javaTrim(String(this)); },
        'strip()': function () { return this.trim(); },
        'stripLeading()': function () { return this.replace(/^\s+/, ''); },
        'stripTrailing()': function () { return this.replace(/\s+$/, ''); },
        'concat(String)': function (other) { return String(this) + rt().nonNull(other); },
        'replace(char,char)': function (from, to) { return this.split(String.fromCharCode(from)).join(String.fromCharCode(to)); },
        'replace(CharSequence,CharSequence)': function (from, to) {
            return this.split(text(rt().nonNull(from))).join(text(rt().nonNull(to)));
        },
        'replaceAll(String,String)': function (regex, replacement) {
            return this.replace(Java.regex(regex, 'g'), Java.replacement(replacement));
        },
        'replaceFirst(String,String)': function (regex, replacement) {
            return this.replace(Java.regex(regex, ''), Java.replacement(replacement));
        },
        'matches(String)': function (regex) { return Java.regex('^(?:' + regex + ')$', '').test(this); },
        'split(String)': function (regex) { return stringArray(Java.split(String(this), regex, 0)); },
        'split(String,int)': function (regex, limit) { return stringArray(Java.split(String(this), regex, limit)); },
        'toCharArray()': function () {
            var chars = new Uint16Array(this.length);
            for (var index = 0; index < this.length; ++index)
                chars[index] = this.charCodeAt(index);
            return chars;
        },
        'repeat(int)': function (count) {
            if (count < 0)
                throw fail('java.lang.IllegalArgumentException', 'count is negative: ' + count);
            return this.repeat(count);
        },
        'intern()': function () { return String(this); },
        'codePointAt(int)': function (index) { return this.codePointAt(checkIndex(this, index)); }
    };
    var stringNatives = natives['java.lang.String'];
    stringNatives['valueOf(Object)'] = function (value) { return rt().str(value); };
    stringNatives['valueOf(char[])'] = function (chars) { return String.fromCharCode.apply(null, Array.prototype.slice.call(chars)); };
    stringNatives['copyValueOf(char[])'] = stringNatives['valueOf(char[])'];
    stringNatives['valueOf(char[],int,int)'] = charsRange;
    stringNatives['copyValueOf(char[],int,int)'] = stringNatives['valueOf(char[],int,int)'];
    stringNatives['format(Locale,String,Object[])'] = function (locale, format, args) { return Java.format(rt().nonNull(format), args); };
    stringNatives['toLowerCase(Locale)'] = function () { return this.toLowerCase(); };
    stringNatives['toUpperCase(Locale)'] = function () { return this.toUpperCase(); };
    stringNatives['regionMatches(int,String,int,int)'] = function (offset, other, otherOffset, length) {
        return regionMatches(String(this), false, offset, rt().nonNull(other), otherOffset, length);
    };
    stringNatives['regionMatches(boolean,int,String,int,int)'] = function (ignoreCase, offset, other, otherOffset, length) {
        return regionMatches(String(this), ignoreCase, offset, rt().nonNull(other), otherOffset, length);
    };
    stringNatives['contentEquals(CharSequence)'] = function (other) { return String(this) === text(rt().nonNull(other)); };
    // indent(n): shifted lines, each with \n at the end.
    stringNatives['indent(int)'] = function (amount) {
        if (this.length === 0)
            return '';
        var lines = String(this).split(/\r\n|\r|\n/);
        if (lines[lines.length - 1] === '')
            lines.pop();
        return lines.map(function (line) {
            if (amount > 0)
                return new Array(amount + 1).join(' ') + line;
            if (amount < 0) {
                var drop = 0;
                while (drop < -amount && drop < line.length && /\s/.test(line.charAt(drop)))
                    ++drop;
                return line.substring(drop);
            }
            return line;
        }).join('\n') + '\n';
    };
    stringNatives['stripIndent()'] = function () { return Java.stripIndent(String(this)); };
    stringNatives['getBytes()'] = function () {
        var bytes = T.utf8.encode(String(this));
        var result = new Int8Array(bytes.length);
        for (var index = 0; index < bytes.length; ++index)
            result[index] = bytes.charCodeAt(index);
        return result;
    };
    stringNatives['<init>(byte[])'] = function (bytes) {
        var text = '';
        for (var index = 0; index < rt().nonNull(bytes).length; ++index)
            text += String.fromCharCode(bytes[index] & 255);
        return T.utf8.decode(text);
    };

    function regionMatches(self, ignoreCase, offset, other, otherOffset, length) {
        if (offset < 0 || otherOffset < 0 || offset > self.length - length || otherOffset > other.length - length)
            return false;
        var part = self.substring(offset, offset + length);
        var otherPart = other.substring(otherOffset, otherOffset + length);
        return ignoreCase
            ? part.toUpperCase().toLowerCase() === otherPart.toUpperCase().toLowerCase()
            : part === otherPart;
    }

    // The indentation of a text block: the common smallest indentation of
    // the non-empty lines (and of the last line) is removed, trailing spaces
    // too.
    Java.stripIndent = function (value) {
        var lines = value.split(/\r\n|\r|\n/);
        var minimum = Infinity;
        lines.forEach(function (line, index) {
            var blank = /^\s*$/.test(line);
            if (blank && index !== lines.length - 1)
                return;
            var indent = line.length - line.replace(/^\s+/, '').length;
            minimum = Math.min(minimum, blank ? line.length : indent);
        });
        if (minimum === Infinity)
            minimum = 0;
        return lines.map(function (line) { return line.substring(Math.min(minimum, line.length)).replace(/\s+$/, ''); }).join('\n');
    };
    stringNatives['valueOf(boolean)'] = function (value) { return String(value); };
    stringNatives['valueOf(char)'] = function (value) { return String.fromCharCode(value); };
    stringNatives['valueOf(int)'] = function (value) { return String(value); };
    stringNatives['valueOf(long)'] = function (value) { return i64.str(value); };
    stringNatives['valueOf(float)'] = function (value) { return Java.floatToString(value); };
    stringNatives['valueOf(double)'] = function (value) { return Java.doubleToString(value); };
    stringNatives['format(String,Object[])'] = function (format, args) { return Java.format(rt().nonNull(format), args); };
    stringNatives['formatted(Object[])'] = function (args) { return Java.format(String(this), args); };
    stringNatives['join(CharSequence,CharSequence[])'] = function (delimiter, parts) {
        return Array.prototype.map.call(parts, text).join(text(delimiter));
    };
    stringNatives['join(CharSequence,Iterable)'] = function (delimiter, parts) {
        var list = [];
        for (var it = parts.iterator$0(); it.hasNext$0();)
            list.push(text(it.next$0()));
        return list.join(text(delimiter));
    };
    stringNatives['chars()'] = function () {
        var codes = new Int32Array(this.length);
        for (var index = 0; index < this.length; ++index)
            codes[index] = this.charCodeAt(index);
        return rt().callStatic('java.util.Arrays', 'stream(int[])', [codes]);
    };
    stringNatives['lines()'] = function () {
        var lines = String(this).split(/\r\n|\r|\n/);
        if (lines.length > 0 && lines[lines.length - 1] === '')
            lines.pop();
        return rt().callStatic('java.util.Arrays', 'stream(Object[])', [stringArray(lines)]);
    };
    // Integer.parseInt: digits in a radix, a sign, a limit check.
    function parseInteger(textValue, radix, bits) {
        if (textValue === null || textValue === undefined)
            throw fail('java.lang.NumberFormatException', 'Cannot parse null string');
        var digits = textValue;
        var negative = false;
        if (digits.charAt(0) === '-' || digits.charAt(0) === '+') {
            negative = digits.charAt(0) === '-';
            digits = digits.substring(1);
        }
        var value = digits.length === 0 || /[^0-9a-zA-Z]/.test(digits) ? null : T.big.parse(digits, radix);
        if (value === null)
            throw fail('java.lang.NumberFormatException', 'For input string: "' + textValue + '"' +
                       (radix !== 10 ? ' under radix ' + radix : ''));
        if (negative)
            value = T.big.neg(value);
        var limit = T.big.pow(2, bits - 1);
        if (T.big.cmp(value, T.big.neg(limit)) < 0 || T.big.cmp(value, T.big.sub(limit, 1)) > 0)
            throw fail('java.lang.NumberFormatException', 'For input string: "' + textValue + '"' +
                       (radix !== 10 ? ' under radix ' + radix : ''));
        return bits === 32 ? T.big.toFloat(value) : T.bigToI64(value, true);
    }
    Java.parseInteger = parseInteger;

    function unsignedText(value, shift, bits) {
        // The binary, octal, hexadecimal notation of two's complement.
        var radix = 1 << shift;
        if (bits === 32)
            return (value >>> 0).toString(radix);
        return T.u64.str(T.u64.fromSigned(value), radix);
    }

    natives['java.lang.Integer'] = {
        '<init>(int)': function (value) { return value; },
        'intValue()': function () { return Number(this); },
        'longValue()': function () { return Number(this); },
        'doubleValue()': function () { return Number(this); },
        'floatValue()': function () { return Number(this); },
        'shortValue()': function () { return (this << 16) >> 16; },
        'byteValue()': function () { return (this << 24) >> 24; },
        'equals(Object)': function (other) { return typeof other === 'number' && Number(this) === other; },
        'hashCode()': function () { return Number(this); },
        'toString()': function () { return String(Number(this)); },
        'compareTo(Integer)': function (other) { var value = Number(this), otherValue = rt().nonNull(other); return value < otherValue ? -1 : (value === otherValue ? 0 : 1); },
        'valueOf(int)': function (value) { return value; },
        'valueOf(String)': function (textValue) { return parseInteger(textValue, 10, 32); },
        'valueOf(String,int)': function (textValue, radix) { return parseInteger(textValue, radix, 32); },
        'parseInt(String)': function (textValue) { return parseInteger(textValue, 10, 32); },
        'parseInt(String,int)': function (textValue, radix) { return parseInteger(textValue, radix, 32); },
        'toString(int)': function (value) { return String(value); },
        'toString(int,int)': function (value, radix) { return value.toString(radix); },
        'toBinaryString(int)': function (value) { return unsignedText(value, 1, 32); },
        'toHexString(int)': function (value) { return unsignedText(value, 4, 32); },
        'toOctalString(int)': function (value) { return unsignedText(value, 3, 32); },
        'bitCount(int)': function (value) {
            value = value - ((value >>> 1) & 0x55555555);
            value = (value & 0x33333333) + ((value >>> 2) & 0x33333333);
            return (Math.imul((value + (value >>> 4)) & 0x0F0F0F0F, 0x01010101) >>> 24);
        },
        'reverse(int)': function (value) {
            var result = 0;
            for (var bit = 0; bit < 32; ++bit)
                result = (result << 1) | ((value >>> bit) & 1);
            return result | 0;
        },
        'highestOneBit(int)': function (value) { return value === 0 ? 0 : (1 << (31 - Math.clz32(value))) | 0; },
        'lowestOneBit(int)': function (value) { return value & -value; },
        'numberOfLeadingZeros(int)': function (value) { return Math.clz32(value); },
        'numberOfTrailingZeros(int)': function (value) { return value === 0 ? 32 : 31 - Math.clz32(value & -value); }
    };

    natives['java.lang.Boolean'] = {
        '<init>(boolean)': function (value) { return value; },
        'booleanValue()': function () { return this === true || (typeof this === 'object' && this.valueOf() === true); },
        'equals(Object)': function (other) { return typeof other === 'boolean' && Boolean(this.valueOf()) === other; },
        'hashCode()': function () { return this.valueOf() ? 1231 : 1237; },
        'toString()': function () { return String(this.valueOf()); },
        'compareTo(Boolean)': function (other) { var value = Boolean(this.valueOf()); return value === other ? 0 : (value ? 1 : -1); },
        'valueOf(boolean)': function (value) { return value; },
        'valueOf(String)': function (textValue) { return textValue !== null && textValue.toLowerCase() === 'true'; },
        'parseBoolean(String)': function (textValue) { return textValue !== null && textValue.toLowerCase() === 'true'; },
        'toString(boolean)': function (value) { return String(value); }
    };
    function bitCount64(value) {
        var count = 0;
        var text = T.u64.str(T.u64.fromSigned(value), 2);
        for (var index = 0; index < text.length; ++index)
            count += text.charAt(index) === '1' ? 1 : 0;
        return count;
    }

    natives['java.lang.Long'] = {
        'valueOf(long)': function (value) { return rt().boxJ(value); },
        'parseLong(String)': function (textValue) { return parseInteger(textValue, 10, 64); },
        'parseLong(String,int)': function (textValue, radix) { return parseInteger(textValue, radix, 64); },
        'toString(long)': function (value) { return i64.str(value); },
        'toString(long,int)': function (value, radix) { return i64.str(value, radix); },
        'toBinaryString(long)': function (value) { return unsignedText(value, 1, 64); },
        'toHexString(long)': function (value) { return unsignedText(value, 4, 64); },
        'toOctalString(long)': function (value) { return unsignedText(value, 3, 64); },
        'bitCount(long)': bitCount64,
        'numberOfTrailingZeros(long)': function (value) {
            var text = T.u64.str(T.u64.fromSigned(value), 2);
            var zeros = text.length - text.replace(/0+$/, '').length;
            return text === '0' ? 64 : zeros;
        },
        'numberOfLeadingZeros(long)': function (value) {
            var text = T.u64.str(T.u64.fromSigned(value), 2);
            return text === '0' ? 64 : 64 - text.length;
        }
    };

    natives['java.lang.Short'] = { 'valueOf(short)': function (value) { return rt().boxS(value); } };
    natives['java.lang.Byte'] = { 'valueOf(byte)': function (value) { return rt().boxB(value); } };

    var bits = new DataView(new ArrayBuffer(8));

    natives['java.lang.Double'] = {
        'equals(Object)': function (other) {
            return rt().is(other, rt().byName('java.lang.Double')) &&
                (this.value === other.value ? (this.value !== 0 || 1 / this.value === 1 / other.value) : (this.value !== this.value && other.value !== other.value));
        },
        'valueOf(double)': function (value) { return rt().boxD(value); },
        'parseDouble(String)': function (textValue) {
            if (textValue === null)
                throw fail('java.lang.NullPointerException');
            var trimmed = javaTrim(textValue);
            var parsed = Java.parseFloatText(trimmed);
            if (parsed === null)
                throw fail('java.lang.NumberFormatException', trimmed.length === 0 ? 'empty String' : 'For input string: "' + textValue + '"');
            return parsed;
        },
        'toString(double)': function (value) { return Java.doubleToString(value); },
        'compare(double,double)': function (left, right) {
            if (left < right)
                return -1;
            if (left > right)
                return 1;
            var aBits = left === 0 && 1 / left < 0 ? -1 : (left !== left ? 2 : 0);
            var bBits = right === 0 && 1 / right < 0 ? -1 : (right !== right ? 2 : 0);
            return aBits < bBits ? -1 : (aBits > bBits ? 1 : 0);
        },
        'hashCode(double)': function (value) {
            bits.setFloat64(0, value !== value ? NaN : value);
            return (bits.getInt32(0) ^ bits.getInt32(4)) | 0;
        },
        'doubleToLongBits(double)': function (value) {
            bits.setFloat64(0, value !== value ? NaN : value);
            return i64.make(bits.getInt32(0), bits.getInt32(4));
        },
        'longBitsToDouble(long)': function (value) {
            bits.setInt32(0, typeof value === 'number' ? Math.floor(value / 4294967296) | 0 : value.hi);
            bits.setInt32(4, typeof value === 'number' ? value | 0 : value.lo);
            return bits.getFloat64(0);
        }
    };

    var floatBits = new DataView(new ArrayBuffer(4));

    function floatToIntBits(value) {
        floatBits.setFloat32(0, value !== value ? NaN : value);
        return floatBits.getInt32(0);
    }

    natives['java.lang.Float'] = {
        'floatToIntBits(float)': floatToIntBits,
        'hashCode(float)': floatToIntBits,
        'intBitsToFloat(int)': function (bits) {
            floatBits.setInt32(0, bits);
            return floatBits.getFloat32(0);
        },
        'equals(Object)': function (other) {
            return rt().is(other, rt().byName('java.lang.Float')) && (this.value === other.value || (this.value !== this.value && other.value !== other.value));
        },
        'valueOf(float)': function (value) { return rt().boxF(value); },
        'toString(float)': function (value) { return Java.floatToString(value); }
    };

    // A Java number from text: 1.5, 1e3, 0x1p3, NaN, Infinity, the suffixes d/f.
    Java.parseFloatText = function (textValue) {
        var body = textValue.replace(/[dDfF]$/, '');
        if (/^[+-]?(NaN|Infinity)$/.test(body))
            return Number(body);
        if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(body))
            return Number(body);
        if (/^[+-]?0[xX]/.test(body)) {
            var negative = body.charAt(0) === '-';
            var value = T.rat.toFloat(T.rat.parse(body.replace(/^[+-]/, '').toLowerCase()));
            return negative ? -value : value;
        }
        return null;
    };
    function charText(ch) {
        return String.fromCharCode(ch);
    }

    natives['java.lang.Character'] = {
        'valueOf(char)': function (value) { return rt().boxC(value); },
        'isDigit(char)': function (ch) { return /\d/.test(charText(ch)) || (ch >= 0x660 && ch <= 0x669); },
        'isLetter(char)': function (ch) { var text = charText(ch); return text.toUpperCase() !== text.toLowerCase() || /[A-Za-z]/.test(text) || ch === 0xAA || ch === 0xBA; },
        'isLetterOrDigit(char)': function (ch) {
            var text = charText(ch);
            return /\d/.test(text) || text.toUpperCase() !== text.toLowerCase();
        },
        'isAlphabetic(int)': function (ch) {
            var text = charText(ch);
            return text.toUpperCase() !== text.toLowerCase();
        },
        'isWhitespace(char)': function (ch) {
            return (ch >= 9 && ch <= 13) || (ch >= 28 && ch <= 32) || ch === 0x1680 || (ch >= 0x2000 && ch <= 0x2006) ||
                (ch >= 0x2008 && ch <= 0x200A) || ch === 0x2028 || ch === 0x2029 || ch === 0x205F || ch === 0x3000;
        },
        'isSpaceChar(char)': function (ch) { return ch === 32 || ch === 0xA0 || ch === 0x3000 || (ch >= 0x2000 && ch <= 0x200A); },
        'isUpperCase(char)': function (ch) { var text = charText(ch); return text !== text.toLowerCase() && text === text.toUpperCase(); },
        'isLowerCase(char)': function (ch) { var text = charText(ch); return text !== text.toUpperCase() && text === text.toLowerCase(); },
        'toUpperCase(char)': function (ch) { var text = charText(ch).toUpperCase(); return text.length === 1 ? text.charCodeAt(0) : ch; },
        'toLowerCase(char)': function (ch) { var text = charText(ch).toLowerCase(); return text.length === 1 ? text.charCodeAt(0) : ch; },
        'getNumericValue(char)': function (ch) {
            var value = parseInt(charText(ch), 36);
            return value !== value ? -1 : value;
        },
        'digit(char,int)': function (ch, radix) {
            var value = parseInt(charText(ch), 36);
            return value !== value || value >= radix ? -1 : value;
        },
        'forDigit(int,int)': function (digit, radix) {
            return digit < 0 || digit >= radix || radix < 2 || radix > 36 ? 0 : digit.toString(radix).charCodeAt(0);
        },
        'toString(int)': function (codePoint) {
            if (codePoint < 0 || codePoint > 0x10FFFF)
                throw fail('java.lang.IllegalArgumentException', 'Not a valid Unicode code point: 0x' + (codePoint >>> 0).toString(16).toUpperCase());
            return String.fromCodePoint(codePoint);
        }
    };

    // Math.round: floor(value + 0.5) with an exact half.
    function roundHalfUp(value) {
        if (value !== value)
            return 0;
        var floor = Math.floor(value);
        return value - floor >= 0.5 ? floor + 1 : floor;
    }

    natives['java.lang.Math'] = {
        'max(float,float)': function (left, right) {
            return left !== left || right !== right ? NaN : Math.max(left, right);
        },
        'max(double,double)': function (left, right) {
            return left !== left || right !== right ? NaN : Math.max(left, right);
        },
        'min(float,float)': function (left, right) {
            return left !== left || right !== right ? NaN : Math.min(left, right);
        },
        'min(double,double)': function (left, right) {
            return left !== left || right !== right ? NaN : Math.min(left, right);
        },
        'sqrt(double)': Math.sqrt, 'cbrt(double)': Math.cbrt, 'pow(double,double)': Math.pow, 'exp(double)': Math.exp,
        'log(double)': Math.log, 'log10(double)': Math.log10, 'log1p(double)': Math.log1p, 'expm1(double)': Math.expm1,
        'sin(double)': Math.sin, 'cos(double)': Math.cos, 'tan(double)': Math.tan, 'asin(double)': Math.asin,
        'acos(double)': Math.acos, 'atan(double)': Math.atan, 'atan2(double,double)': Math.atan2, 'sinh(double)': Math.sinh,
        'cosh(double)': Math.cosh, 'tanh(double)': Math.tanh, 'hypot(double,double)': Math.hypot, 'floor(double)': Math.floor,
        'ceil(double)': Math.ceil,
        'rint(double)': function (value) {
            var floor = Math.floor(value), rest = value - floor;
            return rest > 0.5 || (rest === 0.5 && floor % 2 !== 0) ? floor + 1 : (value === 0 ? value : floor);
        },
        'round(double)': function (value) { return Java.doubleToLong(roundHalfUp(value)); },
        'round(float)': function (value) { return rt().d2i(roundHalfUp(value)); },
        'signum(double)': function (value) { return value > 0 ? 1 : (value < 0 ? -1 : value); },
        'signum(float)': function (value) { return value > 0 ? 1 : (value < 0 ? -1 : value); },
        'random()': function () { return Math.random(); },
        'toRadians(double)': function (value) { return value / 180 * Math.PI; },
        'toDegrees(double)': function (value) { return value * 180 / Math.PI; },
        'nextUp(double)': function (value) { return nextAfter(value, Infinity); },
        'nextDown(double)': function (value) { return nextAfter(value, -Infinity); },
        'nextAfter(double,double)': nextAfter,
        'ulp(double)': function (value) {
            value = Math.abs(value);
            if (value !== value)
                return NaN;
            if (value === Infinity)
                return Infinity;
            return nextAfter(value, Infinity) - value;
        },
        'addExact(int,int)': function (left, right) { return exactInt(left + right); },
        'multiplyExact(int,int)': function (left, right) { return exactInt(left * right); },
        'subtractExact(int,int)': function (left, right) { return exactInt(left - right); },
        'negateExact(int)': function (value) { return exactInt(-value); },
        'toIntExact(long)': function (value) { return exactInt(i64.toFloat(value)); },
        'addExact(long,long)': function (left, right) { return exactLong(T.big.add(T.i64ToBig(left, true), T.i64ToBig(right, true))); },
        'multiplyExact(long,long)': function (left, right) { return exactLong(T.big.mul(T.i64ToBig(left, true), T.i64ToBig(right, true))); }
    };

    // The adjacent double in the direction direction.
    function nextAfter(value, direction) {
        if (value !== value || direction !== direction)
            return NaN;
        if (value === direction)
            return direction;
        if (value === 0)
            return direction > 0 ? Number.MIN_VALUE : -Number.MIN_VALUE;
        bits.setFloat64(0, value);
        var hi = bits.getUint32(0), lo = bits.getUint32(4);
        if ((direction > value) === (value > 0)) {
            lo = (lo + 1) >>> 0;
            if (lo === 0)
                hi = (hi + 1) >>> 0;
        } else {
            if (lo === 0)
                hi = (hi - 1) >>> 0;
            lo = (lo - 1) >>> 0;
        }
        bits.setUint32(0, hi);
        bits.setUint32(4, lo);
        return bits.getFloat64(0);
    }

    function exactInt(value) {
        if (value > 2147483647 || value < -2147483648)
            throw fail('java.lang.ArithmeticException', 'integer overflow');
        return value;
    }

    function exactLong(value) {
        if (T.big.cmp(value, T.big.sub(T.big.pow(2, 63), 1)) > 0 || T.big.cmp(value, T.big.neg(T.big.pow(2, 63))) < 0)
            throw fail('java.lang.ArithmeticException', 'long overflow');
        return T.bigToI64(value, true);
    }
    // StringBuilder: the text is a string in the field $s; constructors are
    // functions of the class (this is the constructor).
    function builder(classType, value) {
        var object = new classType();
        object.$s = value;
        return object;
    }

    function builderIndex(sb, index, inclusive) {
        if (index < 0 || index > sb.$s.length - (inclusive ? 0 : 1))
            throw fail('java.lang.StringIndexOutOfBoundsException', inclusive ? 'Range [' + index + ', ' + sb.$s.length + ') out of bounds for length ' + sb.$s.length
                                                                         : 'Index ' + index + ' out of bounds for length ' + sb.$s.length);
        return index;
    }

    function appender(convert) {
        return function (value) {
            this.$s += convert(value);
            return this;
        };
    }

    natives['java.lang.StringBuilder'] = {
        '<init>()': function () { return builder(this, ''); },
        '<init>(int)': function () { return builder(this, ''); },
        '<init>(String)': function (value) { return builder(this, rt().nonNull(value)); },
        '<init>(CharSequence)': function (value) { return builder(this, text(rt().nonNull(value))); },
        'append(Object)': appender(function (value) { return rt().str(value); }),
        'append(String)': appender(function (value) { return rt().s(value); }),
        'append(CharSequence)': appender(function (value) { return rt().str(value); }),
        'append(CharSequence,int,int)': function (value, start, end) { this.$s += text(value).substring(start, end); return this; },
        'append(char[])': appender(function (chars) { return String.fromCharCode.apply(null, Array.prototype.slice.call(chars)); }),
        'append(boolean)': appender(String),
        'append(char)': appender(charText),
        'append(int)': appender(String),
        'append(long)': appender(function (value) { return i64.str(value); }),
        'append(float)': appender(Java.floatToString),
        'append(double)': appender(Java.doubleToString),
        'insert(int,String)': function (offset, value) { return insertText(this, offset, rt().s(value)); },
        'insert(int,char)': function (offset, ch) { return insertText(this, offset, charText(ch)); },
        'insert(int,int)': function (offset, value) { return insertText(this, offset, String(value)); },
        'insert(int,Object)': function (offset, value) { return insertText(this, offset, rt().str(value)); },
        'reverse()': function () { this.$s = this.$s.split('').reverse().join(''); return this; },
        'delete(int,int)': function (start, end) {
            var length = this.$s.length;
            end = Math.min(end, length);
            if (start < 0 || start > end)
                throw fail('java.lang.StringIndexOutOfBoundsException', 'Range [' + start + ', ' + end + ') out of bounds for length ' + length);
            this.$s = this.$s.substring(0, start) + this.$s.substring(end);
            return this;
        },
        'deleteCharAt(int)': function (index) {
            builderIndex(this, index, false);
            this.$s = this.$s.substring(0, index) + this.$s.substring(index + 1);
            return this;
        },
        'replace(int,int,String)': function (start, end, value) {
            end = Math.min(end, this.$s.length);
            this.$s = this.$s.substring(0, start) + value + this.$s.substring(end);
            return this;
        },
        'length()': function () { return this.$s.length; },
        'charAt(int)': function (index) { return this.$s.charCodeAt(builderIndex(this, index, false)); },
        'setCharAt(int,char)': function (index, ch) {
            builderIndex(this, index, false);
            this.$s = this.$s.substring(0, index) + charText(ch) + this.$s.substring(index + 1);
        },
        'setLength(int)': function (length) {
            this.$s = length <= this.$s.length ? this.$s.substring(0, length) : this.$s + new Array(length - this.$s.length + 1).join('\u0000');
        },
        'indexOf(String)': function (value) { return this.$s.indexOf(value); },
        'indexOf(String,int)': function (value, from) { return this.$s.indexOf(value, from); },
        'lastIndexOf(String)': function (value) { return this.$s.lastIndexOf(value); },
        'substring(int)': function (start) { checkRange(this.$s, start, this.$s.length); return this.$s.substring(start); },
        'substring(int,int)': function (start, end) { checkRange(this.$s, start, end); return this.$s.substring(start, end); },
        'subSequence(int,int)': function (start, end) { checkRange(this.$s, start, end); return this.$s.substring(start, end); },
        'isEmpty()': function () { return this.$s.length === 0; },
        'compareTo(StringBuilder)': function (other) { return Java.compareStrings(this.$s, other.$s); },
        'toString()': function () { return this.$s; },
        'chars()': function () { return stringNatives['chars()'].call(this.$s); }
    };

    function insertText(sb, offset, value) {
        builderIndex(sb, offset, true);
        sb.$s = sb.$s.substring(0, offset) + value + sb.$s.substring(offset);
        return sb;
    }
    // System.exit: an exception the session understands as the end of the program.
    function SystemExit(status) {
        T.LanguageError.call(this, 'exit status ' + status, null);
        this.status = status;
    }
    SystemExit.prototype = Object.create(T.LanguageError.prototype);
    Java.SystemExit = SystemExit;

    function arrayName(array) {
        var descriptor = rt().arrayDescriptor(array);
        var names = { I: 'int', D: 'double', B: 'byte', S: 'short', C: 'char', F: 'float', J: 'long', Z: 'boolean' };
        var elem = descriptor === null ? 'object' : descriptor.substring(1);
        return (names[elem] || 'object') + '[' + array.length + ']';
    }

    natives['java.lang.System'] = {
        'currentTimeMillis()': function () { return Date.now(); },
        'nanoTime()': function () { return Date.now() * 1000000; },
        'arraycopy(Object,int,Object,int,int)': function (source, sourcePosition, target, targetPosition, length) {
            rt().nonNull(source);
            rt().nonNull(target);
            if (sourcePosition < 0 || targetPosition < 0 || length < 0 || sourcePosition + length > source.length ||
                targetPosition + length > target.length) {
                var message = sourcePosition + length > source.length
                    ? 'arraycopy: last source index ' + (sourcePosition + length) + ' out of bounds for ' + arrayName(source)
                    : 'arraycopy: last destination index ' + (targetPosition + length) + ' out of bounds for ' + arrayName(target);
                throw fail('java.lang.ArrayIndexOutOfBoundsException', message);
            }
            if (source === target && sourcePosition < targetPosition) {
                for (var back = length - 1; back >= 0; --back)
                    target[targetPosition + back] = source[sourcePosition + back];
            } else {
                for (var index = 0; index < length; ++index)
                    target[targetPosition + index] = source[sourcePosition + index];
            }
        },
        'exit(int)': function (status) { throw new SystemExit(status); },
        'identityHashCode(Object)': function (value) {
            return value === null ? 0 : (typeof value === 'object' ? rt().identityHash(value) : rt().hashCode(value));
        },
        'getProperty(String)': function (key) {
            var known = { 'line.separator': '\n', 'java.version': '19', 'file.separator': '/', 'path.separator': ':', 'os.name': 'V4Script' };
            return known[key] !== undefined ? known[key] : null;
        },
        'getenv(String)': function () { return null; }
    };

    // Threads are fibers: run() starts when the current fiber yields.
    natives['java.lang.Thread'] = {
        'start()': function () { rt().startThread(this); },
        'join()': Java.asyncNative(function* () { yield* rt().joinThread(this); }),
        'join(long)': Java.asyncNative(function* (millis) { yield* rt().joinThread(this, i64.toFloat(millis)); }),
        'isAlive()': function () { return !!this.$started && !this.$done; },
        'currentThread()': function () { return rt().currentThread(); },
        'sleep(long)': Java.asyncNative(function* (millis) { yield* rt().sleepFiber(i64.toFloat(millis)); }),
        'yield()': function () {},
        'onSpinWait()': function () {}
    };
    natives['java.lang.Throwable'] = {
        'fillInStackTrace()': function () {
            Object.defineProperty(this, 'stack', { value: new Error('').stack, writable: true, configurable: true, enumerable: false });
            // The place is the first throw (not the exception constructor).
            Object.defineProperty(this, '$fresh', { value: true, writable: true, configurable: true, enumerable: false });
            return this;
        },
        'printStackTrace()': function () {
            var lines = [];
            for (var current = this, depth = 0; current !== null && current !== undefined && depth < 20; current = current.getCause$0(), ++depth)
                lines.push((depth > 0 ? 'Caused by: ' : '') + rt().str(current));
            rt().write(true, lines.join('\n') + '\n');
        },
        'getStackTrace()': function () { return rt().arrayOf('[Ljava.lang.StackTraceElement;', []); }
    };

    function classInfo(object) {
        return object.$info;
    }

    natives['java.lang.Class'] = {
        'getName()': function () { return classInfo(this).name; },
        'getSimpleName()': function () {
            var info = classInfo(this);
            if (info.kind !== 'array')
                return info.kind === 'class' ? info.simpleName : info.name;
            // [[I - int[][], [Ljava.lang.String; - String[].
            var depth = info.name.lastIndexOf('[') + 1;
            var elem = info.name.substring(depth);
            var names = { I: 'int', J: 'long', D: 'double', F: 'float', S: 'short', B: 'byte', C: 'char', Z: 'boolean' };
            var simple = names[elem] || elem.substring(1, elem.length - 1).replace(/^.*[.$]/, '');
            return simple + new Array(depth + 1).join('[]');
        },
        'isInstance(Object)': function (value) {
            var info = classInfo(this);
            return info.kind === 'class' ? rt().is(value, info.ctor) : (info.kind === 'array' ? rt().isArray(value, info.name) : false);
        },
        'isInterface()': function () { var info = classInfo(this); return info.kind === 'class' && info.ctor.$meta.isInterface; },
        'isArray()': function () { return classInfo(this).kind === 'array'; },
        'isEnum()': function () { var info = classInfo(this); return info.kind === 'class' && info.ctor.$meta.flavor === 'enum'; },
        'isRecord()': function () { var info = classInfo(this); return info.kind === 'class' && info.ctor.$meta.flavor === 'record'; },
        'getEnumConstants()': function () {
            var info = classInfo(this);
            return info.kind === 'class' && info.ctor.$meta.flavor === 'enum' ? rt().enumValues(info.ctor) : null;
        },
        'getSuperclass()': function () {
            var info = classInfo(this);
            return info.kind === 'class' && info.ctor.$super ? rt().classOf(info.ctor.$super) : null;
        },
        'toString()': function () {
            var info = classInfo(this);
            if (info.kind === 'primitive')
                return info.name;
            return (info.kind === 'class' && info.ctor.$meta.isInterface ? 'interface ' : 'class ') + info.name;
        }
    };

    natives['java.lang.Enum'] = {
        'hashCode()': function () { return rt().identityHash(this); },
        'getDeclaringClass()': function () {
            var classType = this.constructor;
            return rt().classOf(classType.$meta.flavor === 'enum' ? classType : classType.$super);
        }
    };
    // Records: the component fields come from the class description.
    function recordValue(record, index) {
        return record[record.constructor.$meta.components[index]];
    }

    natives['java.lang.Record'] = {
        'equals(Object)': function (other) {
            if (other === null || other === undefined || other.constructor !== this.constructor)
                return false;
            var meta = this.constructor.$meta;
            for (var index = 0; index < meta.components.length; ++index) {
                var leftValue = recordValue(this, index), rightValue = recordValue(other, index);
                var descriptor = meta.componentTypes[index];
                var differs;
                if (descriptor === 'J')
                    differs = !i64.eq(leftValue, rightValue);
                else if (descriptor.length === 1)
                    differs = !(leftValue === rightValue || (leftValue !== leftValue && rightValue !== rightValue));
                else
                    differs = !(leftValue === rightValue || (leftValue !== null && rt().equals(leftValue, rightValue)));
                if (differs)
                    return false;
            }
            return true;
        },
        'hashCode()': function () {
            var meta = this.constructor.$meta;
            var hash = 0;
            for (var index = 0; index < meta.components.length; ++index) {
                var value = recordValue(this, index);
                var descriptor = meta.componentTypes[index];
                var part;
                if (descriptor === 'J')
                    part = i64.low32(i64.xor(value, i64.shr(value, 32)));
                else if (descriptor === 'D' || descriptor === 'F')
                    part = natives['java.lang.Double']['hashCode(double)'](value);
                else if (descriptor === 'Z')
                    part = value ? 1231 : 1237;
                else if (descriptor.length === 1)
                    part = value;
                else
                    part = value === null ? 0 : rt().hashCode(value);
                hash = (Math.imul(hash, 31) + part) | 0;
            }
            return hash;
        },
        'toString()': function () {
            var meta = this.constructor.$meta;
            var self = this;
            var parts = meta.componentNames.map(function (name, index) {
                return name + '=' + String(rt().show(recordValue(self, index), meta.componentTypes[index]));
            });
            return meta.simpleName + '[' + parts.join(', ') + ']';
        }
    };
    // --- java.io.PrintStream: the console of the host (the error stream is a separate stream).

    function printer(convert, newline) {
        return function (value) {
            rt().write(this.error, (convert === null ? '' : convert(value)) + (newline ? '\n' : ''));
        };
    }

    function charsText(chars) {
        rt().nonNull(chars);
        return String.fromCharCode.apply(null, Array.prototype.slice.call(chars));
    }

    var printNatives = {};
    [['String', function (value) { return rt().s(value); }], ['Object', function (value) { return rt().str(value); }],
     ['char[]', charsText], ['boolean', String], ['char', charText], ['int', String],
     ['long', function (value) { return i64.str(value); }], ['float', Java.floatToString],
     ['double', Java.doubleToString]].forEach(function (entry) {
        printNatives['print(' + entry[0] + ')'] = printer(entry[1], false);
        printNatives['println(' + entry[0] + ')'] = printer(entry[1], true);
    });
    printNatives['println()'] = printer(null, true);
    printNatives['printf(String,Object[])'] = function (format, args) {
        rt().write(this.error, Java.format(rt().nonNull(format), args));
        return this;
    };
    printNatives['format(String,Object[])'] = printNatives['printf(String,Object[])'];
    printNatives['append(CharSequence)'] = function (value) { rt().write(this.error, rt().str(value)); return this; };
    printNatives['append(char)'] = function (ch) { rt().write(this.error, charText(ch)); return this; };
    printNatives['write(int)'] = function (value) { rt().write(this.error, charText(value & 255)); };
    natives['java.io.PrintStream'] = printNatives;
})(globalThis);
