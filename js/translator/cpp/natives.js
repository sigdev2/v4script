// C++: functions of the library written in JavaScript (the C++ headers
// declare them as __v4_*): number formatting and parsing for the streams,
// reading from standard input and from strings, the hash of std::hash.
// They get values as the translated code passes them (js/translator/c/libc.js).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var C = T.c;
    var X = T.cpp;
    if (X.natives)
        return;

    var CError = C.runtime.CError;
    var i64 = T.i64, u64 = T.u64;

    // The flags of std::ios_base (the values of libstdc++).
    var FLAGS = { boolalpha: 1, dec: 2, fixed: 4, hex: 8, internal: 16, left: 32, oct: 64, right: 128, scientific: 256,
                  showbase: 512, showpoint: 1024, showpos: 2048, skipws: 4096, uppercase: 16384 };

    // Results of reading: a value was read, the end was reached, failure.
    var GOT = 1, END = 2, FAIL = 4;

    function number(value) {
        return typeof value === 'number' ? value : u64.toFloat(value);
    }

    // --- 64-bit multiplication for the hash (16-bit limbs)

    function multiply(left, right) {
        var a = [left.lo & 0xFFFF, left.lo >>> 16, left.hi & 0xFFFF, left.hi >>> 16];
        var b = [right.lo & 0xFFFF, right.lo >>> 16, right.hi & 0xFFFF, right.hi >>> 16];
        var result = [0, 0, 0, 0];
        for (var i = 0; i < 4; ++i) {
            var carry = 0;
            for (var j = 0; i + j < 4; ++j) {
                var sum = result[i + j] + a[i] * b[j] + carry;
                result[i + j] = sum & 0xFFFF;
                carry = Math.floor(sum / 65536);
            }
        }
        return { lo: (result[0] | (result[1] << 16)) >>> 0, hi: (result[2] | (result[3] << 16)) >>> 0 };
    }

    function xor(left, right) {
        return { lo: (left.lo ^ right.lo) >>> 0, hi: (left.hi ^ right.hi) >>> 0 };
    }

    // x ^ (x >> 47)
    function shiftMix(value) {
        return { lo: (value.lo ^ (value.hi >>> 15)) >>> 0, hi: value.hi >>> 0 };
    }

    var MULTIPLIER = { lo: 0x5bd1e995, hi: 0xc6a4a793 };

    // MurmurHash64A of Austin Appleby (public domain): the hash of strings
    // in std::hash, as g++ computes it.
    function murmur(memory, address, length, seed) {
        var hash = xor(seed, multiply({ lo: length >>> 0, hi: Math.floor(length / 4294967296) >>> 0 }, MULTIPLIER));
        var blocks = length - length % 8;
        var bytes = memory.U8;
        for (var at = 0; at < blocks; at += 8) {
            var p = address + at;
            var block = { lo: (bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16) | (bytes[p + 3] << 24)) >>> 0,
                          hi: (bytes[p +
                                     4] | (bytes[p + 5] << 8) | (bytes[p + 6] << 16) | (bytes[p + 7] << 24)) >>> 0 };
            block = multiply(shiftMix(multiply(block, MULTIPLIER)), MULTIPLIER);
            hash = multiply(xor(hash, block), MULTIPLIER);
        }
        var rest = length % 8;
        if (rest > 0) {
            var tail = { lo: 0, hi: 0 };
            for (var index = rest - 1; index >= 0; --index) {
                var byte = bytes[address + blocks + index];
                if (index >= 4)
                    tail.hi = (tail.hi | (byte << ((index - 4) * 8))) >>> 0;
                else
                    tail.lo = (tail.lo | (byte << (index * 8))) >>> 0;
            }
            hash = multiply(xor(hash, tail), MULTIPLIER);
        }
        hash = shiftMix(multiply(shiftMix(hash), MULTIPLIER));
        return u64.make(hash.hi | 0, hash.lo | 0);
    }

    // --- Sources of input: a FILE of C or a std::string with a position

    function Source(session, file, text, position) {
        this.memory = session.memory;
        this.natives = session.natives;
        this.file = file;
        if (file === 0) {
            this.data = this.memory.loadPointer(text);
            this.length = number(this.memory.load64(text + 8, false));
            this.positionAddress = position;
            this.position = number(this.memory.load64(position, false));
        }
    }
    Source.prototype.get = function () {
        if (this.file !== 0)
            return this.natives.fgetc(this.file);
        if (this.position >= this.length)
            return -1;
        return this.memory.U8[this.data + this.position++];
    };
    Source.prototype.unget = function (byte) {
        if (byte < 0)
            return;
        if (this.file !== 0)
            this.natives.ungetc(byte, this.file);
        else
            --this.position;
    };
    Source.prototype.done = function () {
        if (this.file === 0)
            this.memory.store64(this.positionAddress, this.position);
    };

    function isSpace(byte) {
        return byte === 32 || (byte >= 9 && byte <= 13);
    }

    // Skips white space; the first byte after it (taken).
    function skipSpace(source) {
        var byte = source.get();
        while (byte >= 0 && isSpace(byte))
            byte = source.get();
        return byte;
    }

    function digitValue(byte) {
        if (byte >= 48 && byte <= 57)
            return byte - 48;
        if (byte >= 97 && byte <= 102)
            return byte - 87;
        if (byte >= 65 && byte <= 70)
            return byte - 55;
        return 99;
    }

    X.natives = function (session) {
        var memory = session.memory;
        var table = {};

        function writeText(address, size, text) {
            var length = Math.min(text.length, size - 1);
            for (var index = 0; index < length; ++index)
                memory.U8[address + index] = text.charCodeAt(index);
            memory.U8[address + length] = 0;
            return length;
        }

        // Microseconds of the system clock (since 1970) or of a steady one.
        var steadyStart = Date.now();
        table.__v4_clock = function (steady) {
            var now = typeof performance !== 'undefined' && performance.now ? performance.now()
                                                                            : Date.now() - steadyStart;
            return steady ? Math.floor(now * 1000) : Date.now() * 1000;
        };

        table.__v4_random_device = function () {
            return Math.floor(Math.random() * 4294967296) >>> 0;
        };

        table.__v4_terminate = function () {
            throw new CError('terminate called without an active exception', 134);
        };

        table.__v4_hash_bytes = function (address, length, seed) {
            var size = number(length);
            if (size > 0)
                memory.check(address, size);
            var seedValue = typeof seed === 'number' ? { lo: seed >>> 0, hi: Math.floor(seed / 4294967296) >>> 0 }
                                                     : { lo: seed.lo >>> 0, hi: seed.hi >>> 0 };
            return murmur(memory, address, size, seedValue);
        };

        // An integer in the base and with the signs of the flags.
        table.__v4_format_integer = function (out, value, isUnsigned, flags) {
            var base = flags & FLAGS.hex ? 16 : (flags & FLAGS.oct ? 8 : 10);
            var negative = false;
            var digits;
            if (isUnsigned) {
                // The header passes the bits as a long long.
                digits = typeof value === 'number' && value >= 0 ? value.toString(base)
                                                                 : u64.str(u64.fromSigned(value), base);
            } else {
                var text = typeof value === 'number' ? String(value) : i64.str(value);
                negative = text.charAt(0) === '-';
                digits = negative ? text.substring(1) : text;
                if (base !== 10)
                    digits = typeof value === 'number' ? Math.abs(value).toString(base) : digits;
            }
            if (flags & FLAGS.uppercase)
                digits = digits.toUpperCase();
            var prefix = '';
            if (base === 10 && !isUnsigned)
                prefix = negative ? '-' : (flags & FLAGS.showpos ? '+' : '');
            else if (base === 10 && negative)
                prefix = '-';
            if (flags & FLAGS.showbase) {
                if (base === 16 && digits !== '0')
                    prefix += flags & FLAGS.uppercase ? '0X' : '0x';
                else if (base === 8 && digits !== '0')
                    prefix += '0';
            }
            return writeText(out, 128, prefix + digits);
        };

        // A double as printf would print it for the flags and precision.
        table.__v4_format_float = function (out, size, value, flags, precision) {
            var field = flags & (FLAGS.fixed | FLAGS.scientific);
            var conversion = field === FLAGS.fixed ? 'f' : (field === FLAGS.scientific ? 'e'
                                                                                    : (field === 0 ? 'g' : 'a'));
            if (flags & FLAGS.uppercase)
                conversion = conversion.toUpperCase();
            var format = '%' + (flags & FLAGS.showpos ? '+' : '') + (flags & FLAGS.showpoint ? '#' : '') +
                (conversion === 'a' || conversion === 'A' ? '' : '.*') + conversion;
            var places = number(precision);
            var args = conversion === 'a' || conversion === 'A' ? { v: [value], t: ['f64'] }
                                                                : { v: [places < 0 ? 6 : places, value],
                                                                    t: ['i32', 'f64'] };
            var formatAddress = session.literal(format, false);
            var text = C.format(memory, memory.cstring(formatAddress), new C.Arguments(args, 0));
            return writeText(out, size, text);
        };

        function finish(source, status) {
            source.done();
            return status;
        }

        table.__v4_read_integer = function (file, text, position, out, isUnsigned, flags) {
            var source = new Source(session, file, text, position);
            var byte = flags & FLAGS.skipws ? skipSpace(source) : source.get();
            if (byte < 0)
                return finish(source, END | FAIL);
            var negative = false;
            if (byte === 45 || byte === 43) {
                negative = byte === 45;
                byte = source.get();
            }
            var base = flags & FLAGS.hex ? 16 : (flags & FLAGS.oct ? 8 : (flags & FLAGS.dec ? 10 : 0));
            var digits = '';
            if ((base === 16 || base === 0) && byte === 48) {
                digits = '0';
                byte = source.get();
                if (byte === 120 || byte === 88) {
                    base = 16;
                    digits = '';
                    byte = source.get();
                } else if (base === 0) {
                    base = 8;
                }
            }
            if (base === 0)
                base = 10;
            while (byte >= 0 && digitValue(byte) < base) {
                digits += String.fromCharCode(byte);
                byte = source.get();
            }
            var status = 0;
            if (byte < 0)
                status |= END;
            else
                source.unget(byte);
            if (digits === '') {
                memory.store64(out, 0);
                return finish(source, status | FAIL);
            }
            var magnitude = T.big.parse(digits, base);
            var value = negative ? T.big.neg(magnitude) : magnitude;
            var low = isUnsigned ? T.big.fromFloat(0) : T.big.neg(T.big.pow(2, 63));
            var high = isUnsigned ? T.big.sub(T.big.pow(2, 64), 1) : T.big.sub(T.big.pow(2, 63), 1);
            if (isUnsigned && negative && T.big.cmp(magnitude, high) <= 0) {
                // "-1" read into an unsigned type wraps, as strtoull does.
                value = T.big.sub(T.big.pow(2, 64), magnitude);
                if (T.big.sign(magnitude) === 0)
                    value = magnitude;
            }
            if (T.big.cmp(value, low) < 0 || T.big.cmp(value, high) > 0) {
                memory.store64(out, T.bigToI64(T.big.cmp(value, low) < 0 ? low : high, !isUnsigned));
                return finish(source, status | FAIL | GOT);
            }
            memory.store64(out, T.bigToI64(value, !isUnsigned));
            return finish(source, status | GOT);
        };

        table.__v4_read_float = function (file, text, position, out) {
            var source = new Source(session, file, text, position);
            var byte = skipSpace(source);
            if (byte < 0)
                return finish(source, END | FAIL);
            var token = '';
            function take() {
                token += String.fromCharCode(byte);
                byte = source.get();
            }
            if (byte === 45 || byte === 43)
                take();
            var digits = 0;
            while (byte >= 48 && byte <= 57) {
                take();
                ++digits;
            }
            if (byte === 46) {
                take();
                while (byte >= 48 && byte <= 57) {
                    take();
                    ++digits;
                }
            }
            if (digits > 0 && (byte === 101 || byte === 69)) {
                var mark = token.length;
                take();
                if (byte === 45 || byte === 43)
                    take();
                var exponentDigits = 0;
                while (byte >= 48 && byte <= 57) {
                    take();
                    ++exponentDigits;
                }
                if (exponentDigits === 0)
                    token = token.substring(0, mark);
            }
            var status = 0;
            if (byte < 0)
                status |= END;
            else
                source.unget(byte);
            if (digits === 0) {
                memory.F64[out >> 3] = 0;
                return finish(source, status | FAIL);
            }
            memory.F64[out >> 3] = Number(token);
            return finish(source, status | GOT);
        };

        // A word up to white space: a new buffer (malloc) and its length.
        table.__v4_read_word = function (file, text, position, out, length) {
            var source = new Source(session, file, text, position);
            var byte = skipSpace(source);
            if (byte < 0)
                return finish(source, END | FAIL);
            var bytes = [];
            while (byte >= 0 && !isSpace(byte)) {
                bytes.push(byte);
                byte = source.get();
            }
            var status = GOT;
            if (byte < 0)
                status |= END;
            else
                source.unget(byte);
            var buffer = memory.malloc(bytes.length + 1);
            memory.writeBytes(buffer, bytes, true);
            memory.storePointer(out, buffer);
            memory.store64(length, bytes.length);
            return finish(source, status);
        };

        table.__v4_read_char = function (file, text, position, skip) {
            var source = new Source(session, file, text, position);
            var byte = skip ? skipSpace(source) : source.get();
            return finish(source, byte);
        };

        table.__v4_peek_char = function (file, text, position) {
            var source = new Source(session, file, text, position);
            var byte = source.get();
            source.unget(byte);
            return finish(source, byte);
        };

        table.__v4_unget_char = function (file, text, position, byte) {
            var source = new Source(session, file, text, position);
            source.unget(byte);
            return finish(source, byte);
        };

        // A line up to the delimiter (taken, not stored).
        table.__v4_getline = function (file, text, position, delimiter, out, length, limit) {
            var source = new Source(session, file, text, position);
            var bytes = [];
            var status = 0;
            var maximum = number(limit);
            for (;;) {
                if (maximum >= 0 && bytes.length >= maximum) {
                    status |= FAIL;
                    break;
                }
                var byte = source.get();
                if (byte < 0) {
                    status |= END;
                    if (bytes.length === 0)
                        status |= FAIL;
                    break;
                }
                status |= GOT;
                if (byte === (delimiter & 255))
                    break;
                bytes.push(byte);
            }
            var buffer = memory.malloc(bytes.length + 1);
            memory.writeBytes(buffer, bytes, true);
            memory.storePointer(out, buffer);
            memory.store64(length, bytes.length);
            return finish(source, status);
        };

        table.__v4_ignore = function (file, text, position, count, delimiter) {
            var source = new Source(session, file, text, position);
            var limit = number(count);
            var status = 0;
            for (var index = 0; limit < 0 || index < limit; ++index) {
                var byte = source.get();
                if (byte < 0) {
                    status |= END;
                    break;
                }
                if (delimiter >= 0 && byte === (delimiter & 255))
                    break;
            }
            return finish(source, status);
        };

        return table;
    };
})(globalThis);
