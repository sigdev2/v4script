// C: the standard library - the functions that the built-in headers
// (headers.js) declare. A function gets values in the representation of
// the translated code: integers up to 32 bits and pointers are numbers,
// 64-bit ones are T.i64/T.u64, variable arguments come last as { v, t },
// a struct result comes first as an address.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var C = T.c;
    if (C.libc)
        return;

    var rt = C.runtime;
    var CError = rt.CError, CExit = rt.CExit;
    var i64 = T.i64, u64 = T.u64, utf8 = T.utf8, big = T.big;

    var EOF = -1;
    var ERRNO = { EPERM: 1, ENOENT: 2, EBADF: 9, ENOMEM: 12, EACCES: 13, EINVAL: 22, EROFS: 30, EDOM: 33, ERANGE: 34 };
    var ERROR_TEXTS = {
        0: 'Success', 1: 'Operation not permitted', 2: 'No such file or directory', 9: 'Bad file descriptor',
        12: 'Cannot allocate memory', 13: 'Permission denied', 22: 'Invalid argument', 30: 'Read-only file system',
        33: 'Numerical argument out of domain', 34: 'Numerical result out of range'
    };

    // size_t and long as numbers.
    function unsigned(value) {
        return typeof value === 'number' ? value : u64.toFloat(value);
    }
    function signed(value) {
        return typeof value === 'number' ? value : i64.toFloat(value);
    }

    function isSpace(code) {
        return code === 32 || (code >= 9 && code <= 13);
    }

    // --- rand as in glibc (TYPE_3: an additive lagged generator)

    function Random() {
        this.seed(1);
    }
    Random.prototype.seed = function (seed) {
        var state = new Int32Array(31);
        var word = seed | 0;
        if (word === 0)
            word = 1;
        state[0] = word;
        for (var index = 1; index < 31; ++index) {
            // 16807 * word mod (2^31 - 1) by Schrage, signed, as in glibc.
            var hi = (word / 127773) | 0;
            var lo = word % 127773;
            word = 16807 * lo - 2836 * hi;
            if (word < 0)
                word += 2147483647;
            state[index] = word;
        }
        this.state = state;
        this.front = 3;
        this.rear = 0;
        for (var skip = 0; skip < 310; ++skip)
            this.next();
    };
    Random.prototype.next = function () {
        var state = this.state;
        var value = (state[this.front] + state[this.rear]) | 0;
        state[this.front] = value;
        var result = (value >>> 1) & 0x7FFFFFFF;
        if (++this.front >= 31) {
            this.front = 0;
            ++this.rear;
        } else if (++this.rear >= 31) {
            this.rear = 0;
        }
        return result;
    };

    // --- Gamma and the error function

    var LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
                   -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
                   1.5056327351493116e-7];

    function gamma(value) {
        if (value !== value)
            return NaN;
        if (value === Infinity)
            return Infinity;
        if (value === Math.floor(value)) {
            if (value <= 0)
                return NaN;
            if (value <= 171) {
                var product = 1;
                for (var factor = 2; factor < value; ++factor)
                    product *= factor;
                return product;
            }
            return Infinity;
        }
        if (value < 0.5)
            return Math.PI / (Math.sin(Math.PI * value) * gamma(1 - value));
        value -= 1;
        var sum = LANCZOS[0];
        var shifted = value + 7.5;
        for (var index = 1; index < 9; ++index)
            sum += LANCZOS[index] / (value + index);
        return Math.sqrt(2 * Math.PI) * Math.pow(shifted, value + 0.5) * Math.exp(-shifted) * sum;
    }

    function logGamma(value) {
        if (value !== value)
            return NaN;
        if (value === Math.floor(value) && value <= 0)
            return Infinity;
        if (value < 0.5)
            return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * value))) - logGamma(1 - value);
        if (value < 30)
            return Math.log(Math.abs(gamma(value)));
        value -= 1;
        var sum = LANCZOS[0];
        var shifted = value + 7.5;
        for (var index = 1; index < 9; ++index)
            sum += LANCZOS[index] / (value + index);
        return 0.5 * Math.log(2 * Math.PI) + (value + 0.5) * Math.log(shifted) - shifted + Math.log(sum);
    }

    function erf(argument) {
        if (argument !== argument)
            return NaN;
        var magnitude = Math.abs(argument);
        if (magnitude < 2.5) {
            // The Taylor series.
            var term = magnitude, sum = magnitude;
            var square = magnitude * magnitude;
            for (var order = 1; order < 100; ++order) {
                term *= -square / order;
                var add = term / (2 * order + 1);
                sum += add;
                if (Math.abs(add) < 1e-17 * Math.abs(sum))
                    break;
            }
            var value = 2 / Math.sqrt(Math.PI) * sum;
            return argument < 0 ? -value : value;
        }
        var result = 1 - erfcLarge(magnitude);
        return argument < 0 ? -result : result;
    }

    // erfc for value >= 2.5 - a continued fraction (the Lentz method).
    function erfcLarge(value) {
        if (value > 27)
            return 0;
        var tiny = 1e-300;
        var fraction = value, cc = value, denominator = 0;
        for (var level = 1; level < 200; ++level) {
            var an = level / 2;
            denominator = value + an * denominator;
            denominator = denominator === 0 ? tiny : denominator;
            cc = value + an / cc;
            cc = cc === 0 ? tiny : cc;
            denominator = 1 / denominator;
            var delta = cc * denominator;
            fraction *= delta;
            if (Math.abs(delta - 1) < 1e-16)
                break;
        }
        return Math.exp(-value * value) / Math.sqrt(Math.PI) / fraction;
    }

    function erfc(value) {
        if (value !== value)
            return NaN;
        if (value >= 2.5)
            return erfcLarge(value);
        return 1 - erf(value);
    }

    // Rounding: half away from zero (round) and to even (rint).
    function roundAway(value) {
        if (!isFinite(value))
            return value;
        var magnitude = Math.abs(value);
        var whole = Math.floor(magnitude);
        if (magnitude - whole >= 0.5)
            whole += 1;
        return value < 0 || (value === 0 && 1 / value < 0) ? -whole : whole;
    }
    function roundEven(value) {
        if (!isFinite(value))
            return value;
        var magnitude = Math.abs(value);
        var whole = Math.floor(magnitude);
        var rest = magnitude - whole;
        if (rest > 0.5 || (rest === 0.5 && whole % 2 === 1))
            whole += 1;
        return value < 0 || (value === 0 && 1 / value < 0) ? -whole : whole;
    }

    var bits = new DataView(new ArrayBuffer(8));
    function nextAfter(from, toward) {
        if (from !== from || toward !== toward)
            return NaN;
        if (from === toward)
            return toward;
        if (from === 0)
            return toward > 0 ? 5e-324 : -5e-324;
        bits.setFloat64(0, from);
        var high = bits.getUint32(0), low = bits.getUint32(4);
        if ((toward > from) === (from > 0)) {
            low = (low + 1) >>> 0;
            if (low === 0)
                high = (high + 1) >>> 0;
        } else {
            if (low === 0)
                high = (high - 1) >>> 0;
            low = (low - 1) >>> 0;
        }
        bits.setUint32(0, high);
        bits.setUint32(4, low);
        return bits.getFloat64(0);
    }

    function scale(value, exponent) {
        while (exponent > 1023) {
            value *= Math.pow(2, 1023);
            exponent -= 1023;
            if (!isFinite(value))
                return value;
        }
        while (exponent < -1022) {
            value *= Math.pow(2, -1022);
            exponent += 1022;
            if (value === 0)
                return value;
        }
        return value * Math.pow(2, exponent);
    }

    // --- Time

    var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
                       'November', 'December'];

    function two(size) {
        return size < 10 ? '0' + size : String(size);
    }

    // --- The library of a session

    C.libc = function (session) {
        var memory = session.memory;
        var random = new Random();
        var tokenNext = 0;
        var exitHandlers = [];
        var staticStrings = Object.create(null);
        var tmAddress = 0;
        var asctimeAddress = 0;
        var startTime = Date.now();

        function setErrno(code) {
            memory.I32[session.errnoAddress >> 2] = code;
        }

        // A string that lives until the end of the session (strerror, tm_zone).
        function staticString(text) {
            var address = staticStrings[text];
            if (address === undefined) {
                address = memory.allocateStatic(text.length + 1, 1);
                memory.writeBytes(address, text, true);
                staticStrings[text] = address;
            }
            return address;
        }

        function length(address) {
            memory.check(address, 1);
            var end = memory.U8.indexOf(0, address);
            if (end < 0)
                memory.fault(memory.size);
            return end - address;
        }

        function bytes(address) {
            return memory.cstring(address);
        }

        // --- Files: stdout, stderr, stdin (the host input) and read-only files of the host

        function OutputStream(writer) {
            this.writer = writer;
            this.pending = '';
        }
        OutputStream.prototype.write = function (data) {
            var text = this.pending + data;
            var end = text.lastIndexOf('\n');
            if (end < 0) {
                this.pending = text;
                if (text.length > 65536)
                    this.cut();
                return;
            }
            this.writer.write(utf8.decode(text.substring(0, end + 1)));
            this.pending = text.substring(end + 1);
        };
        // Long output without a line break is cut at a character boundary.
        OutputStream.prototype.cut = function () {
            var at = this.pending.length;
            while (at > 0 && this.pending.charCodeAt(at - 1) >= 0x80)
                --at;
            if (at === 0)
                return;
            this.writer.write(utf8.decode(this.pending.substring(0, at)));
            this.pending = this.pending.substring(at);
        };
        OutputStream.prototype.flush = function () {
            if (this.pending.length > 0) {
                this.writer.write(utf8.decode(this.pending));
                this.pending = '';
            }
        };

        var files = new Map();
        function makeFile(stream) {
            var address = memory.allocateStatic(16, 8);
            files.set(address, stream);
            return address;
        }
        var stdout = { output: new OutputStream(session.env.out), error: false, eof: false };
        var stderr = { output: new OutputStream(session.env.err), error: false, eof: false };
        // Standard input: lines of the host as UTF-8 bytes, read on demand.
        var stdin = {
            data: '', position: 0, error: false, eof: false, pushed: [],
            refill: function () {
                var line = session.env.input.readLine();
                if (line === null)
                    return false;
                this.data = this.data.substring(this.position) + utf8.encode(line + '\n');
                this.position = 0;
                return true;
            }
        };
        session.stdoutAddress = makeFile(stdout);
        session.stderrAddress = makeFile(stderr);
        session.stdinAddress = makeFile(stdin);
        session.flushOutput = function () {
            stdout.output.flush();
            stderr.output.flush();
        };
        session.resetLibrary = function () {
            stdout.output.pending = '';
            stderr.output.pending = '';
            // Input that a run took from the host but did not read stays for
            // the next one.
            stdin.pushed = [];
            stdin.eof = false;
            exitHandlers = [];
            tokenNext = 0;
        };

        function file(address) {
            var stream = files.get(address);
            if (stream === undefined) {
                if (address === 0)
                    throw new CError('Segmentation fault (null FILE pointer)', 139);
                throw new CError('invalid FILE pointer', 139);
            }
            return stream;
        }

        function write(address, data) {
            var stream = file(address);
            if (stream.output === undefined) {
                stream.error = true;
                setErrno(ERRNO.EBADF);
                return false;
            }
            stream.output.write(data);
            return true;
        }

        function readByte(stream) {
            if (stream.pushed !== undefined && stream.pushed.length > 0)
                return stream.pushed.pop();
            if (stream.data === undefined || stream.position >= stream.data.length) {
                if (stream.refill === undefined || !stream.refill()) {
                    stream.eof = true;
                    return EOF;
                }
            }
            return stream.data.charCodeAt(stream.position++);
        }

        function printTo(address, format, list, start) {
            var text = C.format(memory, bytes(format), new C.Arguments(list, start));
            return write(address, text) ? text.length : EOF;
        }

        function printInto(target, limit, format, list, start) {
            var text = C.format(memory, bytes(format), new C.Arguments(list, start));
            if (limit === null)
                memory.writeBytes(target, text, true);
            else if (limit > 0)
                memory.writeBytes(target, text.substring(0, limit - 1), true);
            return text.length;
        }

        // scanf on standard input: when the conversions run to the end of
        // what is read, the next line comes and the scan starts again - as
        // scanf in C waits for more input.
        function scanStandardInput(format, list) {
            for (;;) {
                var data = stdin.data;
                var pushed = stdin.pushed.length > 0 ? String.fromCharCode.apply(null, stdin.pushed.slice().reverse()) : '';
                var input = pushed + data.substring(stdin.position);
                var result = C.scan(memory, input, 0, bytes(format), new C.Arguments(list, 0));
                if (result.end >= input.length && stdin.refill())
                    continue;
                stdin.pushed = [];
                stdin.position += Math.max(0, result.end - pushed.length);
                if (stdin.position >= stdin.data.length && result.count < 0)
                    stdin.eof = true;
                return result.count;
            }
        }

        function scanFrom(stream, format, list) {
            if (stream === stdin)
                return scanStandardInput(format, list);
            var data = stream.data || '';
            var pushed = stream.pushed && stream.pushed.length > 0 ? String.fromCharCode.apply(null, stream.pushed.slice().reverse()) : '';
            var input = pushed + data.substring(stream.position);
            var result = C.scan(memory, input, 0, bytes(format), new C.Arguments(list, 0));
            var used = result.end;
            if (stream.pushed)
                stream.pushed = [];
            stream.position += Math.max(0, used - pushed.length);
            if (stream.position >= data.length && result.count < 0)
                stream.eof = true;
            return result.count;
        }

        function exit(status) {
            while (exitHandlers.length > 0)
                memory.callable(exitHandlers.pop())();
            throw new CExit(status & 255);
        }
        session.runExitHandlers = function () {
            while (exitHandlers.length > 0)
                memory.callable(exitHandlers.pop())();
        };

        // --- strtol and strtod

        function skipSpaces(address) {
            while (isSpace(memory.U8[address]))
                ++address;
            return address;
        }

        function strtoInteger(address, endPointer, base, isSigned) {
            base = base | 0;
            if (base !== 0 && (base < 2 || base > 36)) {
                setErrno(ERRNO.EINVAL);
                if (endPointer !== 0)
                    memory.storePointer(endPointer, address);
                return 0;
            }
            var start = skipSpaces(address);
            var text = memory.cstring(start);
            var parsed = C.parseIntegerPrefix(text, base);
            if (parsed === null) {
                if (endPointer !== 0)
                    memory.storePointer(endPointer, address);
                return 0;
            }
            if (endPointer !== 0)
                memory.storePointer(endPointer, start + parsed.length);
            var value = parsed.value;
            if (isSigned) {
                var max = big.sub(big.pow(2, 63), 1), min = big.neg(big.pow(2, 63));
                if (big.cmp(value, max) > 0) {
                    setErrno(ERRNO.ERANGE);
                    value = max;
                } else if (big.cmp(value, min) < 0) {
                    setErrno(ERRNO.ERANGE);
                    value = min;
                }
                return T.bigToI64(value, true);
            }
            var magnitude = parsed.negative ? big.neg(value) : value;
            if (big.cmp(magnitude, big.sub(big.pow(2, 64), 1)) > 0) {
                setErrno(ERRNO.ERANGE);
                return T.bigToI64(big.sub(big.pow(2, 64), 1), false);
            }
            return T.bigToI64(value, false);
        }

        function strtoFloat(address, endPointer) {
            var start = skipSpaces(address);
            var parsed = C.parseFloatPrefix(memory.cstring(start));
            if (parsed === null) {
                if (endPointer !== 0)
                    memory.storePointer(endPointer, address);
                return 0;
            }
            if (endPointer !== 0)
                memory.storePointer(endPointer, start + parsed.length);
            if (!isFinite(parsed.value) && parsed.value === parsed.value && !/inf/i.test(memory.cstring(start).substring(0, parsed.length)))
                setErrno(ERRNO.ERANGE);
            return parsed.value;
        }

        // --- Sorting: a stable merge sort (as qsort of glibc).

        function mergeSort(items, compare) {
            if (items.length < 2)
                return items;
            var buffer = items.slice();
            (function sort(from, to) {
                if (to - from < 2)
                    return;
                var middle = (from + to) >> 1;
                sort(from, middle);
                sort(middle, to);
                for (var position = from; position < to; ++position)
                    buffer[position] = items[position];
                var leftIndex = from, rightIndex = middle;
                for (var out = from; out < to; ++out) {
                    if (leftIndex < middle && (rightIndex >= to || compare(buffer[leftIndex], buffer[rightIndex]) <= 0))
                        items[out] = buffer[leftIndex++];
                    else
                        items[out] = buffer[rightIndex++];
                }
            })(0, items.length);
            return items;
        }

        // --- tm

        function tmPlace() {
            if (tmAddress === 0)
                tmAddress = memory.allocateStatic(64, 8);
            return tmAddress;
        }

        function writeTm(address, date, utc) {
            var get = function (name) { return date[(utc ? 'getUTC' : 'get') + name](); };
            var year = get('FullYear');
            var start = utc ? Date.UTC(year, 0, 1) : new Date(year, 0, 1).getTime();
            var dayOfYear = Math.floor((date.getTime() - start) / 86400000);
            var values = [get('Seconds'), get('Minutes'), get('Hours'), get('Date'), get('Month'), year - 1900, get('Day'),
                          dayOfYear, 0];
            for (var index = 0; index < values.length; ++index)
                memory.I32[(address >> 2) + index] = values[index];
            var offset = utc ? 0 : -date.getTimezoneOffset() * 60;
            memory.store64(address + 40, offset);
            memory.storePointer(address + 48, staticString(utc ? 'GMT' : zoneName(offset)));
            return address;
        }

        function zoneName(offset) {
            if (offset === 0)
                return 'UTC';
            var minutes = Math.abs(offset) / 60;
            return (offset < 0 ? '-' : '+') + two(Math.floor(minutes / 60)) + two(minutes % 60);
        }

        function readTm(address) {
            memory.check(address, 36);
            var base = address >> 2;
            return {
                sec: memory.I32[base], min: memory.I32[base + 1], hour: memory.I32[base + 2], mday: memory.I32[base + 3],
                mon: memory.I32[base + 4], year: memory.I32[base + 5], wday: memory.I32[base + 6], yday: memory.I32[base + 7]
            };
        }

        function strftime(format, tm) {
            var out = '';
            for (var index = 0; index < format.length; ++index) {
                var ch = format.charAt(index);
                if (ch !== '%' || index + 1 >= format.length) {
                    out += ch;
                    continue;
                }
                var code = format.charAt(++index);
                if (code === 'E' || code === 'O')
                    code = format.charAt(++index);
                var hour12 = tm.hour % 12 === 0 ? 12 : tm.hour % 12;
                switch (code) {
                case 'Y': out += String(tm.year + 1900); break;
                case 'y': out += two((tm.year + 1900) % 100); break;
                case 'C': out += two(Math.floor((tm.year + 1900) / 100)); break;
                case 'm': out += two(tm.mon + 1); break;
                case 'd': out += two(tm.mday); break;
                case 'e': out += (tm.mday < 10 ? ' ' : '') + tm.mday; break;
                case 'H': out += two(tm.hour); break;
                case 'I': out += two(hour12); break;
                case 'M': out += two(tm.min); break;
                case 'S': out += two(tm.sec); break;
                case 'p': out += tm.hour < 12 ? 'AM' : 'PM'; break;
                case 'a': out += DAYS[tm.wday] || '?'; break;
                case 'A': out += DAY_NAMES[tm.wday] || '?'; break;
                case 'b':
                case 'h': out += MONTHS[tm.mon] || '?'; break;
                case 'B': out += MONTH_NAMES[tm.mon] || '?'; break;
                case 'j': out += ('00' + (tm.yday + 1)).slice(-3); break;
                case 'u': out += String(tm.wday === 0 ? 7 : tm.wday); break;
                case 'w': out += String(tm.wday); break;
                case 'D': out += two(tm.mon + 1) + '/' + two(tm.mday) + '/' + two((tm.year + 1900) % 100); break;
                case 'F': out += (tm.year + 1900) + '-' + two(tm.mon + 1) + '-' + two(tm.mday); break;
                case 'T': out += two(tm.hour) + ':' + two(tm.min) + ':' + two(tm.sec); break;
                case 'R': out += two(tm.hour) + ':' + two(tm.min); break;
                case 'r': out += two(hour12) + ':' + two(tm.min) + ':' + two(tm.sec) + ' ' + (tm.hour < 12 ? 'AM' : 'PM'); break;
                case 'c': out += strftime('%a %b %e %H:%M:%S %Y', tm); break;
                case 'x': out += strftime('%m/%d/%y', tm); break;
                case 'X': out += strftime('%H:%M:%S', tm); break;
                case 'n': out += '\n'; break;
                case 't': out += '\t'; break;
                case '%': out += '%'; break;
                default: out += '%' + code; break;
                }
            }
            return out;
        }

        function asctime(tm) {
            var day = String(tm.mday);
            while (day.length < 3)
                day = ' ' + day;
            return (DAYS[tm.wday] || '???') + ' ' + (MONTHS[tm.mon] || '???') + day + ' ' + two(tm.hour) + ':' + two(tm.min) + ':' +
                two(tm.sec) + ' ' + (tm.year + 1900) + '\n';
        }

        function asctimeBuffer(text) {
            if (asctimeAddress === 0)
                asctimeAddress = memory.allocateStatic(64, 1);
            memory.writeBytes(asctimeAddress, text.substring(0, 63), true);
            return asctimeAddress;
        }

        // A wait: the fiber sleeps, the unit goes on by a timer.
        function* sleepFor(milliseconds) {
            session.env.scheduler.sleep(milliseconds);
            yield;
        }

        function ctypeOf(test) {
            return function (character) {
                return character >= 0 && character <= 127 && test(character) ? 1 : 0;
            };
        }

        var table = {
            // stdio
            printf: function (format, list) {
                return printTo(session.stdoutAddress, format, list, 0);
            },
            fprintf: function (stream, format, list) {
                return printTo(stream, format, list, 0);
            },
            sprintf: function (target, format, list) {
                return printInto(target, null, format, list, 0);
            },
            snprintf: function (target, size, format, list) {
                return printInto(target, unsigned(size), format, list, 0);
            },
            vprintf: function (format, ap) {
                return printTo(session.stdoutAddress, format, ap, ap ? ap.i : 0);
            },
            vfprintf: function (stream, format, ap) {
                return printTo(stream, format, ap, ap ? ap.i : 0);
            },
            vsprintf: function (target, format, ap) {
                return printInto(target, null, format, ap, ap ? ap.i : 0);
            },
            vsnprintf: function (target, size, format, ap) {
                return printInto(target, unsigned(size), format, ap, ap ? ap.i : 0);
            },
            puts: function (text) {
                return write(session.stdoutAddress, bytes(text) + '\n') ? 1 : EOF;
            },
            fputs: function (text, stream) {
                return write(stream, bytes(text)) ? 1 : EOF;
            },
            putchar: function (character) {
                return write(session.stdoutAddress, String.fromCharCode(character & 255)) ? character & 255 : EOF;
            },
            fputc: function (character, stream) {
                return write(stream, String.fromCharCode(character & 255)) ? character & 255 : EOF;
            },
            putc: function (character, stream) {
                return write(stream, String.fromCharCode(character & 255)) ? character & 255 : EOF;
            },
            getchar: function () {
                return readByte(stdin);
            },
            fgetc: function (stream) {
                return readByte(file(stream));
            },
            getc: function (stream) {
                return readByte(file(stream));
            },
            ungetc: function (character, stream) {
                if (character === EOF)
                    return EOF;
                var target = file(stream);
                if (target.pushed === undefined)
                    return EOF;
                target.pushed.push(character & 255);
                target.eof = false;
                return character & 255;
            },
            fgets: function (target, size, stream) {
                var source = file(stream);
                var limit = size - 1;
                if (limit < 0)
                    return 0;
                var line = '';
                while (line.length < limit) {
                    var byte = readByte(source);
                    if (byte === EOF)
                        break;
                    line += String.fromCharCode(byte);
                    if (byte === 10)
                        break;
                }
                if (line.length === 0 && limit > 0)
                    return 0;
                memory.writeBytes(target, line, true);
                return target;
            },
            scanf: function (format, list) {
                return scanFrom(stdin, format, list);
            },
            fscanf: function (stream, format, list) {
                return scanFrom(file(stream), format, list);
            },
            sscanf: function (text, format, list) {
                return C.scan(memory, bytes(text), 0, bytes(format), new C.Arguments(list, 0)).count;
            },
            fflush: function () {
                return 0;
            },
            perror: function (text) {
                var code = memory.I32[session.errnoAddress >> 2];
                var message = ERROR_TEXTS[code] || 'Unknown error ' + code;
                var prefix = text !== 0 && memory.U8[text] !== 0 ? bytes(text) + ': ' : '';
                write(session.stderrAddress, prefix + message + '\n');
            },
            // Files are read-only files of the host.
            fopen: function (path, mode) {
                var name = utf8.decode(bytes(path));
                var flags = bytes(mode);
                if (/[wa+]/.test(flags)) {
                    setErrno(ERRNO.EROFS);
                    return 0;
                }
                var text = session.env.readModule(name.replace(/^\.\//, ''));
                if (text === null) {
                    setErrno(ERRNO.ENOENT);
                    return 0;
                }
                return makeFile({ data: utf8.encode(text), position: 0, error: false, eof: false, pushed: [] });
            },
            fclose: function (stream) {
                file(stream);
                if (stream !== session.stdoutAddress && stream !== session.stderrAddress && stream !== session.stdinAddress)
                    files.delete(stream);
                return 0;
            },
            feof: function (stream) {
                return file(stream).eof ? 1 : 0;
            },
            ferror: function (stream) {
                return file(stream).error ? 1 : 0;
            },
            clearerr: function (stream) {
                var target = file(stream);
                target.eof = false;
                target.error = false;
            },
            fwrite: function (pointer, size, count, stream) {
                var total = unsigned(size) * unsigned(count);
                if (total === 0)
                    return 0;
                memory.check(pointer, total);
                return write(stream, memory.bytes(pointer, pointer + total)) ? unsigned(count) : 0;
            },
            fread: function (pointer, size, count, stream) {
                var source = file(stream);
                var itemSize = unsigned(size);
                var wanted = itemSize * unsigned(count);
                if (wanted === 0)
                    return 0;
                memory.check(pointer, wanted);
                var read = 0;
                while (read < wanted) {
                    var byte = readByte(source);
                    if (byte === EOF)
                        break;
                    memory.U8[pointer + read++] = byte;
                }
                return Math.floor(read / itemSize);
            },
            fseek: function (stream, offset, whence) {
                var target = file(stream);
                if (target.data === undefined)
                    return -1;
                var base = whence === 0 ? 0 : (whence === 1 ? target.position : target.data.length);
                var position = base + signed(offset);
                if (position < 0) {
                    setErrno(ERRNO.EINVAL);
                    return -1;
                }
                target.position = position;
                target.pushed = [];
                target.eof = false;
                return 0;
            },
            ftell: function (stream) {
                var target = file(stream);
                return target.data === undefined ? -1 : target.position - target.pushed.length;
            },
            rewind: function (stream) {
                var target = file(stream);
                if (target.data !== undefined) {
                    target.position = 0;
                    target.pushed = [];
                    target.eof = false;
                    target.error = false;
                }
            },
            remove: function () {
                setErrno(ERRNO.EROFS);
                return -1;
            },
            setbuf: function () {},
            setvbuf: function () {
                return 0;
            },

            // stdlib
            malloc: function (size) {
                var address = memory.malloc(size);
                if (address === 0)
                    setErrno(ERRNO.ENOMEM);
                return address;
            },
            calloc: function (count, size) {
                return memory.calloc(count, size);
            },
            realloc: function (pointer, size) {
                return memory.realloc(pointer, size);
            },
            free: function (pointer) {
                memory.free(pointer);
            },
            aligned_alloc: function (alignment, size) {
                return memory.malloc(size);
            },
            exit: function (status) {
                exit(status);
            },
            abort: function () {
                throw new CError('Aborted', 134);
            },
            _Exit: function (status) {
                throw new CExit(status & 255);
            },
            atexit: function (callback) {
                memory.callable(callback);
                exitHandlers.push(callback);
                return 0;
            },
            atoi: function (text) {
                var value = strtoInteger(text, 0, 10, true);
                return typeof value === 'number' ? value | 0 : value.lo;
            },
            atol: function (text) {
                return strtoInteger(text, 0, 10, true);
            },
            atoll: function (text) {
                return strtoInteger(text, 0, 10, true);
            },
            atof: function (text) {
                return strtoFloat(text, 0);
            },
            strtol: function (text, end, base) {
                return strtoInteger(text, end, base, true);
            },
            strtoll: function (text, end, base) {
                return strtoInteger(text, end, base, true);
            },
            strtoul: function (text, end, base) {
                return strtoInteger(text, end, base, false);
            },
            strtoull: function (text, end, base) {
                return strtoInteger(text, end, base, false);
            },
            strtod: function (text, end) {
                return strtoFloat(text, end);
            },
            strtof: function (text, end) {
                return Math.fround(strtoFloat(text, end));
            },
            abs: function (value) {
                return value < 0 ? -value | 0 : value;
            },
            labs: function (value) {
                if (typeof value === 'number')
                    return value < 0 ? -value : value;
                return value.hi < 0 ? i64.neg(value) : value;
            },
            llabs: function (value) {
                if (typeof value === 'number')
                    return value < 0 ? -value : value;
                return value.hi < 0 ? i64.neg(value) : value;
            },
            div: function (result, dividend, divisor) {
                if (divisor === 0)
                    rt.divideByZero();
                memory.check(result, 8);
                memory.I32[result >> 2] = (dividend / divisor) | 0;
                memory.I32[(result >> 2) + 1] = dividend % divisor;
                return result;
            },
            ldiv: function (result, dividend, divisor) {
                if (divisor === 0)
                    rt.divideByZero();
                memory.store64(result, i64.div(dividend, divisor));
                memory.store64(result + 8, i64.mod(dividend, divisor));
                return result;
            },
            rand: function () {
                return random.next();
            },
            srand: function (seed) {
                random.seed(seed);
            },
            qsort: function (base, count, size, compare) {
                var total = unsigned(count), width = unsigned(size);
                if (total < 2 || width === 0)
                    return;
                memory.check(base, total * width);
                var comparator = memory.callable(compare);
                var copy = memory.malloc(total * width);
                if (copy === 0)
                    throw new CError('out of memory', 1);
                try {
                    memory.copy(copy, base, total * width);
                    var order = [];
                    for (var index = 0; index < total; ++index)
                        order.push(index);
                    mergeSort(order, function (left, right) {
                        return comparator(copy + left * width, copy + right * width);
                    });
                    for (var position = 0; position < total; ++position)
                        memory.copy(base + position * width, copy + order[position] * width, width);
                } finally {
                    memory.free(copy);
                }
            },
            bsearch: function (key, base, count, size, compare) {
                var comparator = memory.callable(compare);
                var low = 0, high = unsigned(count), width = unsigned(size);
                while (low < high) {
                    var middle = (low + high) >>> 1;
                    var element = base + middle * width;
                    var order = comparator(key, element);
                    if (order === 0)
                        return element;
                    if (order < 0)
                        high = middle;
                    else
                        low = middle + 1;
                }
                return 0;
            },
            getenv: function () {
                return 0;
            },
            system: function () {
                return -1;
            },

            // string
            strlen: function (string) {
                return length(string);
            },
            strnlen: function (string, max) {
                var limit = unsigned(max);
                for (var count = 0; count < limit; ++count) {
                    memory.check(string + count, 1);
                    if (memory.U8[string + count] === 0)
                        return count;
                }
                return limit;
            },
            strcpy: function (target, source) {
                memory.copy(target, source, length(source) + 1);
                return target;
            },
            strncpy: function (target, source, size) {
                var limit = unsigned(size);
                var count = Math.min(length(source), limit);
                memory.copy(target, source, count);
                if (count < limit)
                    memory.fill(target + count, 0, limit - count);
                return target;
            },
            strcat: function (target, source) {
                memory.copy(target + length(target), source, length(source) + 1);
                return target;
            },
            strncat: function (target, source, size) {
                var count = Math.min(length(source), unsigned(size));
                var end = target + length(target);
                memory.copy(end, source, count);
                memory.U8[end + count] = 0;
                return target;
            },
            strcmp: function (left, right) {
                return compareStrings(left, right, Infinity, false);
            },
            strncmp: function (left, right, size) {
                return compareStrings(left, right, unsigned(size), false);
            },
            strcoll: function (left, right) {
                return compareStrings(left, right, Infinity, false);
            },
            strcasecmp: function (left, right) {
                return compareStrings(left, right, Infinity, true);
            },
            strncasecmp: function (left, right, size) {
                return compareStrings(left, right, unsigned(size), true);
            },
            strchr: function (string, character) {
                var end = string + length(string);
                character &= 255;
                if (character === 0)
                    return end;
                var found = memory.U8.indexOf(character, string);
                return found >= 0 && found < end ? found : 0;
            },
            strrchr: function (string, character) {
                var end = string + length(string);
                character &= 255;
                if (character === 0)
                    return end;
                var found = memory.U8.lastIndexOf(character, end);
                return found >= string ? found : 0;
            },
            strstr: function (haystack, needle) {
                var found = bytes(haystack).indexOf(bytes(needle));
                return found < 0 ? 0 : haystack + found;
            },
            strdup: function (string) {
                return memory.newString(bytes(string));
            },
            strndup: function (string, size) {
                var text = bytes(string);
                return memory.newString(text.substring(0, unsigned(size)));
            },
            strtok: function (string, delimiters) {
                var set = bytes(delimiters);
                var at = string !== 0 ? string : tokenNext;
                if (at === 0)
                    return 0;
                while (memory.U8[at] !== 0 && set.indexOf(String.fromCharCode(memory.U8[at])) >= 0)
                    ++at;
                if (memory.U8[at] === 0) {
                    tokenNext = 0;
                    return 0;
                }
                var start = at;
                while (memory.U8[at] !== 0 && set.indexOf(String.fromCharCode(memory.U8[at])) < 0)
                    ++at;
                if (memory.U8[at] === 0) {
                    tokenNext = 0;
                } else {
                    memory.U8[at] = 0;
                    tokenNext = at + 1;
                }
                return start;
            },
            strspn: function (string, accept) {
                var text = bytes(string), set = bytes(accept);
                var count = 0;
                while (count < text.length && set.indexOf(text.charAt(count)) >= 0)
                    ++count;
                return count;
            },
            strcspn: function (string, reject) {
                var text = bytes(string), set = bytes(reject);
                var count = 0;
                while (count < text.length && set.indexOf(text.charAt(count)) < 0)
                    ++count;
                return count;
            },
            strpbrk: function (string, accept) {
                var text = bytes(string), set = bytes(accept);
                for (var index = 0; index < text.length; ++index) {
                    if (set.indexOf(text.charAt(index)) >= 0)
                        return string + index;
                }
                return 0;
            },
            strerror: function (code) {
                return staticString(ERROR_TEXTS[code] || 'Unknown error ' + code);
            },
            memcpy: function (target, source, size) {
                return memory.copy(target, source, unsigned(size));
            },
            memmove: function (target, source, size) {
                return memory.copy(target, source, unsigned(size));
            },
            memset: function (target, value, size) {
                return memory.fill(target, value, unsigned(size));
            },
            memcmp: function (left, right, size) {
                var count = unsigned(size);
                if (count === 0)
                    return 0;
                memory.check(left, count);
                memory.check(right, count);
                for (var index = 0; index < count; ++index) {
                    var difference = memory.U8[left + index] - memory.U8[right + index];
                    if (difference !== 0)
                        return difference;
                }
                return 0;
            },
            memchr: function (string, character, size) {
                var count = unsigned(size);
                if (count === 0)
                    return 0;
                memory.check(string, count);
                var found = memory.U8.indexOf(character & 255, string);
                return found >= 0 && found < string + count ? found : 0;
            },

            // math
            fma: function (left, right, addend) { return left * right + addend; },
            ldexp: function (value, exponent) { return scale(value, exponent); },
            frexp: function (value, exponentPointer) {
                var exponent = 0;
                if (value !== 0 && isFinite(value)) {
                    exponent = Math.floor(Math.log2(Math.abs(value))) + 1;
                    var mantissa = scale(value, -exponent);
                    while (Math.abs(mantissa) >= 1) {
                        ++exponent;
                        mantissa /= 2;
                    }
                    while (Math.abs(mantissa) < 0.5) {
                        --exponent;
                        mantissa *= 2;
                    }
                    value = mantissa;
                }
                memory.check(exponentPointer, 4);
                memory.I32[exponentPointer >> 2] = exponent;
                return value;
            },
            modf: function (value, integerPointer) {
                var whole = isFinite(value) ? Math.trunc(value) : value;
                memory.check(integerPointer, 8);
                memory.F64[integerPointer >> 3] = whole;
                if (!isFinite(value))
                    return value !== value ? value : (value > 0 ? 0 : -0);
                var fraction = value - whole;
                return fraction === 0 && (value < 0 || 1 / value < 0) ? -0 : fraction;
            },
            nan: function () { return NaN; },
            lround: function (value) { return i64.fromFloat(roundAway(value)); },
            llround: function (value) { return i64.fromFloat(roundAway(value)); },
            lrint: function (value) { return i64.fromFloat(roundEven(value)); },
            __isnan: function (value) { return value !== value ? 1 : 0; },
            __isinf: function (value) { return value === Infinity ? 1 : (value === -Infinity ? -1 : 0); },
            __isfinite: function (value) { return isFinite(value) ? 1 : 0; },
            __signbit: function (value) { return value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0; },
            __builtin_inff: function () { return Infinity; },
            __builtin_nanf: function () { return NaN; },
            __builtin_huge_val: function () { return Infinity; },

            // ctype
            isalpha: ctypeOf(function (code) { return (code >= 65 && code <= 90) || (code >= 97 && code <= 122); }),
            isdigit: ctypeOf(function (code) { return code >= 48 && code <= 57; }),
            isalnum: ctypeOf(function (code) {
                return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
            }),
            isspace: ctypeOf(function (code) { return isSpace(code); }),
            isupper: ctypeOf(function (code) { return code >= 65 && code <= 90; }),
            islower: ctypeOf(function (code) { return code >= 97 && code <= 122; }),
            ispunct: ctypeOf(function (code) {
                return code > 32 && code < 127 &&
                    !((code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122));
            }),
            isprint: ctypeOf(function (code) { return code >= 32 && code < 127; }),
            isgraph: ctypeOf(function (code) { return code > 32 && code < 127; }),
            iscntrl: ctypeOf(function (code) { return code < 32 || code === 127; }),
            isxdigit: ctypeOf(function (code) {
                return (code >= 48 && code <= 57) || (code >= 65 && code <= 70) || (code >= 97 && code <= 102);
            }),
            isblank: ctypeOf(function (code) { return code === 32 || code === 9; }),
            toupper: function (code) { return code >= 97 && code <= 122 ? code - 32 : code; },
            tolower: function (code) { return code >= 65 && code <= 90 ? code + 32 : code; },

            // time
            time: function (result) {
                var now = Math.floor(Date.now() / 1000);
                if (result !== 0)
                    memory.store64(result, now);
                return now;
            },
            clock: function () {
                return (Date.now() - startTime) * 1000;
            },
            difftime: function (end, start) {
                return signed(end) - signed(start);
            },
            localtime: function (time) {
                return writeTm(tmPlace(), new Date(signed(memory.load64(time, true)) * 1000), false);
            },
            gmtime: function (time) {
                return writeTm(tmPlace(), new Date(signed(memory.load64(time, true)) * 1000), true);
            },
            mktime: function (address) {
                var tm = readTm(address);
                var date = new Date(tm.year + 1900, tm.mon, tm.mday, tm.hour, tm.min, tm.sec);
                writeTm(address, date, false);
                return Math.floor(date.getTime() / 1000);
            },
            strftime: function (target, max, format, address) {
                var text = strftime(bytes(format), readTm(address));
                var limit = unsigned(max);
                if (text.length + 1 > limit)
                    return 0;
                memory.writeBytes(target, text, true);
                return text.length;
            },
            asctime: function (address) {
                return asctimeBuffer(asctime(readTm(address)));
            },
            ctime: function (time) {
                var date = new Date(signed(memory.load64(time, true)) * 1000);
                return asctimeBuffer(asctime(readTm(writeTm(tmPlace(), date, false))));
            },
            nanosleep: function* (request) {
                var seconds = signed(memory.load64(request, true));
                var nanoseconds = signed(memory.load64(request + 8, true));
                yield* sleepFor(seconds * 1000 + nanoseconds / 1e6);
                return 0;
            },
            sleep: function* (seconds) {
                yield* sleepFor((seconds >>> 0) * 1000);
                return 0;
            },
            usleep: function* (microseconds) {
                yield* sleepFor((microseconds >>> 0) / 1000);
                return 0;
            },

            // assert
            __assert_fail: function (expression, fileName, line, functionName) {
                session.flushOutput();
                throw new CError(utf8.decode(bytes(functionName)) + ': Assertion `' + utf8.decode(bytes(expression)) + "' failed.",
                                 134);
            }
        };

        function compareStrings(left, right, limit, ignoreCase) {
            for (var index = 0; index < limit; ++index) {
                memory.check(left + index, 1);
                memory.check(right + index, 1);
                var leftByte = memory.U8[left + index], rightByte = memory.U8[right + index];
                if (ignoreCase) {
                    if (leftByte >= 65 && leftByte <= 90)
                        leftByte += 32;
                    if (rightByte >= 65 && rightByte <= 90)
                        rightByte += 32;
                }
                if (leftByte !== rightByte)
                    return leftByte - rightByte;
                if (leftByte === 0)
                    return 0;
            }
            return 0;
        }

        // math.h: double and float (with the suffix f).
        var unary = {
            sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, sinh: Math.sinh,
            cosh: Math.cosh, tanh: Math.tanh, asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh, exp: Math.exp,
            exp2: function (value) { return Math.pow(2, value); }, expm1: Math.expm1, log: Math.log, log2: Math.log2,
            log10: Math.log10, log1p: Math.log1p, sqrt: Math.sqrt, cbrt: Math.cbrt, fabs: Math.abs, floor: Math.floor,
            ceil: Math.ceil, round: roundAway, trunc: Math.trunc, rint: roundEven, nearbyint: roundEven, tgamma: gamma,
            lgamma: logGamma, erf: erf, erfc: erfc
        };
        var binary = {
            pow: Math.pow,
            atan2: Math.atan2,
            hypot: Math.hypot,
            fmod: function (dividend, divisor) { return dividend % divisor; },
            remainder: function (dividend, divisor) {
                if (divisor === 0 || !isFinite(dividend) || divisor !== divisor)
                    return NaN;
                if (!isFinite(divisor))
                    return dividend;
                var result = dividend % divisor;
                var divisorMagnitude = Math.abs(divisor);
                var twice = Math.abs(result) * 2;
                var oddQuotient = Math.abs(((dividend - result) / divisor) % 2) === 1;
                if (twice > divisorMagnitude || (twice === divisorMagnitude && oddQuotient))
                    result -= result > 0 ? divisorMagnitude : -divisorMagnitude;
                return result;
            },
            fmin: function (left, right) {
                return left !== left ? right : (right !== right ? left : Math.min(left, right));
            },
            fmax: function (left, right) {
                return left !== left ? right : (right !== right ? left : Math.max(left, right));
            },
            fdim: function (left, right) {
                return left !== left || right !== right ? NaN : (left > right ? left - right : 0);
            },
            copysign: function (value, sign) {
                return (sign < 0 || (sign === 0 && 1 / sign < 0) ? -1 : 1) * Math.abs(value);
            },
            nextafter: nextAfter
        };
        Object.keys(unary).forEach(function (name) {
            var fn = unary[name];
            table[name] = function (value) { return fn(value); };
            table[name + 'f'] = function (value) { return Math.fround(fn(value)); };
        });
        Object.keys(binary).forEach(function (name) {
            var fn = binary[name];
            table[name] = function (left, right) { return fn(left, right); };
            table[name + 'f'] = function (left, right) { return Math.fround(fn(left, right)); };
        });

        C.jsApi(session, table);
        return table;
    };

    C.libcAsync = { nanosleep: true, sleep: true, usleep: true };
})(globalThis);
