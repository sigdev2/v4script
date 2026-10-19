// Pascal: the run time of a session ($R in the translated code) - run-time
// errors and exceptions, output, byte strings, sets, arrays, pointers,
// classes, Random as in FPC (the Mersenne Twister).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Pascal = T.pascal;
    if (Pascal.Runtime)
        return;

    var utf8 = T.utf8;
    var i64 = T.i64;
    var u64 = T.u64;

    // --- Run-time errors

    // The texts of run-time errors (as FPC prints them).
    var MESSAGES = {
        1: 'Out of memory', 2: 'File not found', 3: 'Path not found', 4: 'Too many open files', 5: 'Access denied',
        6: 'Invalid file handle', 100: 'Read past end of file', 101: 'Disk full', 102: 'File not assigned',
        103: 'File not open', 104: 'File not open for input', 105: 'File not open for output', 106: 'Invalid input',
        200: 'Division by zero', 201: 'Range check error', 202: 'Stack overflow', 203: 'Out of memory',
        204: 'Invalid pointer operation', 205: 'Floating point overflow', 206: 'Floating point underflow',
        207: 'Invalid floating point operation', 208: 'Floating point division by zero', 210: 'Object reference is Nil',
        211: 'Abstract method called', 215: 'Arithmetic overflow', 216: 'Access violation', 217: 'Control-C hit',
        219: 'Invalid type cast', 227: 'Assertion failed'
    };
    Pascal.MESSAGES = MESSAGES;

    // The SysUtils exception class for an error code (as in FPC).
    var EXCEPTION_CLASSES = {
        1: 'eoutofmemory', 203: 'eoutofmemory', 204: 'einvalidpointer', 200: 'edivbyzero', 201: 'erangeerror',
        202: 'estackoverflow', 205: 'eoverflow', 206: 'eunderflow', 207: 'einvalidop', 208: 'ezerodivide',
        210: 'eobjectcheck', 211: 'eabstracterror', 215: 'eintoverflow', 216: 'eaccessviolation', 217: 'econtrolc',
        219: 'einvalidcast', 227: 'eassertionfailed'
    };

    // A run-time error without SysUtils: "Runtime error 200".
    function RunError(code, message) {
        T.LanguageError.call(this, 'Runtime error ' + code + (message || MESSAGES[code] ? ': ' + (message || MESSAGES[code]) : ''));
        this.code = code;
    }
    RunError.prototype = Object.create(T.LanguageError.prototype);
    RunError.prototype.constructor = RunError;
    Pascal.RunError = RunError;

    // Halt: the end of the program, not an error; except does not catch it.
    function Halt(code) {
        this.code = code;
    }
    Pascal.Halt = Halt;

    // --- Environment

    function Runtime(session) {
        this.session = session;
        this.env = session.env;
        this.global = this.env.global;
        this.column = 0;
        this.row = 0;
        // Text of a Write statement not written yet (see wpart).
        this.pending = '';
        this.twister = { words: new Uint32Array(624), position: 624, seeded: false, leftSeed: 0 };
        this.lastLimit = 0;
        // Masked floating-point exceptions (Math.SetExceptionMask), bits by
        // TFPUException; as in FPC, denormals, underflow and precision.
        this.fpuMask = (1 << 1) | (1 << 4) | (1 << 5);
        this.graphics = null;
        this.files = null;
        this.ioResult = 0;
        this.exitCode = 0;
        this.crt = { textAttr: 7, x: 1 };
    }
    Pascal.Runtime = Runtime;

    Runtime.prototype.reset = function () {
        this.ioResult = 0;
        this.exitCode = 0;
    };

    // A run-time error with a code: a SysUtils exception if the unit is loaded.
    Runtime.prototype.re = function (code, message) {
        throw this.makeError(code, message);
    };

    Runtime.prototype.makeError = function (code, message) {
        var name = EXCEPTION_CLASSES[code];
        var text = message || MESSAGES[code] || 'Unknown runtime error ' + code;
        if (code >= 1 && code <= 106 && name === undefined)
            name = 'einouterror';
        var made = name !== undefined ? this.session.makeException(name, text) : null;
        if (made !== null) {
            if (name === 'einouterror')
                made.errorcode = code;
            made.stack = new Error(text).stack;
            return made;
        }
        return new RunError(code, message);
    };

    Runtime.prototype.range = function () {
        this.re(201);
    };
    Runtime.prototype.dz = function () {
        this.re(200);
    };
    Runtime.prototype.nilError = function () {
        this.re(216);
    };

    // raise: the place of the exception is the stack at the raise.
    Runtime.prototype.raise = function (object) {
        if (object === null || object === undefined)
            return this.makeError(216);
        if (typeof object === 'object')
            Object.defineProperty(object, 'stack', { value: new Error('raise').stack, configurable: true, writable: true });
        return object;
    };

    // What except catches: JavaScript errors become Pascal exceptions; Halt
    // and the end of the program pass through.
    Runtime.prototype.exc = function (error) {
        if (error instanceof Halt)
            throw error;
        if (error !== null && typeof error === 'object' && error.$pascal === true)
            return error;
        if (error instanceof RunError)
            return error;
        var code = 0;
        if (error instanceof TypeError)
            code = 216;
        else if (error instanceof RangeError && /stack|call depth|recursion/i.test(String(error.message)))
            code = 202;
        if (code !== 0) {
            var converted = this.makeError(code);
            if (error && error.stack)
                Object.defineProperty(converted, 'stack', { value: error.stack, configurable: true, writable: true });
            return converted;
        }
        var made = this.session.makeException('exception', jsErrorText(error));
        if (made !== null) {
            if (error && error.stack)
                Object.defineProperty(made, 'stack', { value: error.stack, configurable: true, writable: true });
            return made;
        }
        return error;
    };

    function jsErrorText(error) {
        if (error !== null && typeof error === 'object' && error.message !== undefined)
            return (error.name && error.name !== 'Error' ? error.name + ': ' : '') + error.message;
        return String(error);
    }
    Pascal.jsErrorText = jsErrorText;

    Runtime.prototype.halt = function (code) {
        this.exitCode = code === undefined ? 0 : code;
        throw new Halt(this.exitCode);
    };

    // --- Output

    // UTF-8 bytes to the console of the host; the column is kept for WhereX and tabs.
    // Write keeps the text of its arguments here until the last one, as the
    // buffer of a text file in FPC: the cursor moves when the whole
    // statement is written, and the text before an error in an argument
    // comes out with the next output.
    Runtime.prototype.wpart = function (text) {
        this.pending += text;
    };
    Runtime.prototype.w = function (text) {
        if (this.pending.length > 0) {
            text = this.pending + text;
            this.pending = '';
        }
        if (text.length === 0)
            return;
        this.env.out.write(utf8.decode(text));
        var end = text.lastIndexOf('\n');
        if (end >= 0) {
            for (var at = text.indexOf('\n'); at >= 0; at = text.indexOf('\n', at + 1))
                ++this.row;
        }
        this.column = end >= 0 ? text.length - end - 1 : this.column + text.length;
    };
    Runtime.prototype.wl = function (text) {
        this.w((text || '') + '\n');
    };
    Runtime.prototype.werr = function (text) {
        this.w('');
        this.env.out.flush();
        this.env.err.write(utf8.decode(text));
    };
    Runtime.prototype.flush = function () {
        this.w('');
        this.env.out.flush();
        this.env.err.flush();
    };
    Runtime.prototype.present = function () {
        if (this.graphics !== null)
            this.graphics.present();
    };

    // --- Strings (UTF-8 bytes in a JavaScript string)

    // text[index]: the code of a character with an index check.
    Runtime.prototype.sc = function (text, index) {
        if (!(index >= 1 && index <= text.length))
            this.re(201);
        return text.charCodeAt(index - 1);
    };
    // text[index] := code: a new string.
    Runtime.prototype.ssc = function (text, index, code) {
        if (!(index >= 1 && index <= text.length))
            this.re(201);
        return text.substring(0, index - 1) + String.fromCharCode(code) + text.substring(index);
    };
    // ShortString[0] is the length.
    Runtime.prototype.shortLength = function (text, length) {
        length &= 255;
        if (length <= text.length)
            return text.substring(0, length);
        return text + new Array(length - text.length + 1).join('\0');
    };
    Runtime.prototype.chr = function (code) {
        return String.fromCharCode(code & 255);
    };
    Runtime.prototype.wchr = function (code) {
        return utf8.encodeRune(code & 65535);
    };
    Runtime.prototype.copy = function (text, index, count) {
        index = Number(index);
        count = Number(count);
        if (index < 1)
            index = 1;
        if (count <= 0 || index > text.length)
            return '';
        return text.substr(index - 1, count);
    };
    Runtime.prototype.pos = function (sub, text, offset) {
        if (sub.length === 0)
            return 0;
        var from = offset === undefined ? 0 : Math.max(0, offset - 1);
        return text.indexOf(sub, from) + 1;
    };
    Runtime.prototype.del = function (text, index, count) {
        if (index < 1 || index > text.length || count <= 0)
            return text;
        return text.substring(0, index - 1) + text.substring(index - 1 + count);
    };
    Runtime.prototype.ins = function (sub, text, index) {
        if (index < 1)
            index = 1;
        if (index > text.length + 1)
            index = text.length + 1;
        return text.substring(0, index - 1) + sub + text.substring(index - 1);
    };
    Runtime.prototype.setLength = function (text, length) {
        if (length <= 0)
            return '';
        if (length <= text.length)
            return text.substring(0, length);
        return text + new Array(length - text.length + 1).join('\0');
    };
    Runtime.prototype.upcase = function (code) {
        return code >= 97 && code <= 122 ? code - 32 : code;
    };
    Runtime.prototype.lowcase = function (code) {
        return code >= 65 && code <= 90 ? code + 32 : code;
    };
    Runtime.prototype.upper = function (text) {
        return text.replace(/[a-z]+/g, function (part) { return part.toUpperCase(); });
    };
    Runtime.prototype.lower = function (text) {
        return text.replace(/[A-Z]+/g, function (part) { return part.toLowerCase(); });
    };
    Runtime.prototype.stringOfChar = function (code, count) {
        if (count <= 0)
            return '';
        return new Array(count + 1).join(String.fromCharCode(code));
    };
    // String comparison: -1, 0, 1 (by bytes).
    Runtime.prototype.compare = function (left, right) {
        return left < right ? -1 : (left > right ? 1 : 0);
    };
    // A JavaScript string (UTF-16) to a Pascal string (UTF-8 bytes) and back.
    Runtime.prototype.fromJs = function (text) {
        return utf8.encode(String(text));
    };
    Runtime.prototype.toJs = function (bytes) {
        return utf8.decode(bytes);
    };

    // --- Sets: up to 32 elements a number, more - 8 words of 32 bits.

    var EMPTY = Pascal.EMPTY_BIG_SET;

    // A set from values and ranges: [x, x, lo, hi, ...], pairs.
    Runtime.prototype.setOf = function (pairs, small) {
        if (small) {
            var bits = 0;
            for (var at = 0; at < pairs.length; at += 2) {
                for (var element = pairs[at]; element <= pairs[at + 1]; ++element) {
                    if (element >= 0 && element < 32)
                        bits |= 1 << element;
                }
            }
            return bits;
        }
        var words = [0, 0, 0, 0, 0, 0, 0, 0];
        for (var index = 0; index < pairs.length; index += 2) {
            var lo = Math.max(0, pairs[index]), hi = Math.min(255, pairs[index + 1]);
            for (var member = lo; member <= hi; ++member)
                words[member >> 5] |= 1 << (member & 31);
        }
        return words;
    };
    Runtime.prototype.sin = function (set, element) {
        return element >= 0 && element <= 255 && (set[element >> 5] >>> (element & 31) & 1) !== 0;
    };
    Runtime.prototype.sunion = function (left, right) {
        var result = new Array(8);
        for (var byteIndex = 0; byteIndex < 8; ++byteIndex)
            result[byteIndex] = left[byteIndex] | right[byteIndex];
        return result;
    };
    Runtime.prototype.sdiff = function (left, right) {
        var result = new Array(8);
        for (var byteIndex = 0; byteIndex < 8; ++byteIndex)
            result[byteIndex] = left[byteIndex] & ~right[byteIndex];
        return result;
    };
    Runtime.prototype.sinter = function (left, right) {
        var result = new Array(8);
        for (var byteIndex = 0; byteIndex < 8; ++byteIndex)
            result[byteIndex] = left[byteIndex] & right[byteIndex];
        return result;
    };
    Runtime.prototype.sxor = function (left, right) {
        var result = new Array(8);
        for (var byteIndex = 0; byteIndex < 8; ++byteIndex)
            result[byteIndex] = left[byteIndex] ^ right[byteIndex];
        return result;
    };
    Runtime.prototype.seq = function (left, right) {
        for (var byteIndex = 0; byteIndex < 8; ++byteIndex) {
            if (left[byteIndex] !== right[byteIndex])
                return false;
        }
        return true;
    };
    // left <= right: left is a subset of right.
    Runtime.prototype.sle = function (left, right) {
        for (var byteIndex = 0; byteIndex < 8; ++byteIndex) {
            if ((left[byteIndex] & ~right[byteIndex]) !== 0)
                return false;
        }
        return true;
    };
    Runtime.prototype.sinc = function (set, element) {
        if (element < 0 || element > 255)
            return set;
        var result = set.slice();
        result[element >> 5] |= 1 << (element & 31);
        return result;
    };
    Runtime.prototype.sexc = function (set, element) {
        if (element < 0 || element > 255)
            return set;
        var result = set.slice();
        result[element >> 5] &= ~(1 << (element & 31));
        return result;
    };
    // A small set into a large one and back.
    Runtime.prototype.sbig = function (bits) {
        return [bits | 0, 0, 0, 0, 0, 0, 0, 0];
    };
    Runtime.prototype.ssmall = function (set) {
        return set[0] | 0;
    };
    // The elements of a set in order (for x in s, output).
    Runtime.prototype.selements = function (set, small) {
        var result = [];
        if (small) {
            for (var bit = 0; bit < 32; ++bit) {
                if ((set >>> bit & 1) !== 0)
                    result.push(bit);
            }
            return result;
        }
        for (var element = 0; element < 256; ++element) {
            if ((set[element >> 5] >>> (element & 31) & 1) !== 0)
                result.push(element);
        }
        return result;
    };
    Pascal.EMPTY_SET = EMPTY;

    // --- Arrays

    // SetLength of a dynamic array: a new array, the old values at the
    // start (as FPC: the array becomes unique).
    Runtime.prototype.resize = function (type, array, length) {
        length = Number(length);
        if (!(length >= 0))
            this.re(201);
        if (length === 0)
            return type.empty();
        var made = type.newArray(length);
        var keep = Math.min(length, array.length);
        var element = type.of;
        if (Pascal.types.isAggregate(element)) {
            for (var index = 0; index < keep; ++index)
                element.assign(made[index], array[index]);
        } else {
            for (var at = 0; at < keep; ++at)
                made[at] = array[at];
        }
        return made;
    };
    // A multidimensional SetLength(a, n, m...): nested arrays.
    Runtime.prototype.resizeDeep = function (type, array, sizes, level) {
        level = level || 0;
        var made = this.resize(type, array, sizes[level]);
        if (level + 1 < sizes.length && type.of.kind === 'dynarray') {
            for (var index = 0; index < made.length; ++index)
                made[index] = this.resizeDeep(type.of, made[index], sizes, level + 1);
        }
        return made;
    };
    // Copy(a, start, count) of a dynamic array.
    Runtime.prototype.copyArray = function (type, array, start, count) {
        if (start === undefined)
            start = 0;
        if (count === undefined)
            count = array.length;
        if (start < 0)
            start = 0;
        if (count <= 0 || start >= array.length)
            return type.empty();
        var end = Math.min(array.length, start + count);
        var made = type.newArray(end - start);
        var element = type.of;
        for (var index = start; index < end; ++index) {
            if (Pascal.types.isAggregate(element))
                element.assign(made[index - start], array[index]);
            else
                made[index - start] = array[index];
        }
        return made;
    };
    // An array of values [a, b, c] (the constructor of a dynamic array).
    Runtime.prototype.arrayOf = function (type, values) {
        if (values.length === 0)
            return type.empty();
        var made = type.newArray(values.length);
        var element = type.of;
        for (var index = 0; index < values.length; ++index) {
            if (Pascal.types.isAggregate(element))
                element.assign(made[index], values[index]);
            else
                made[index] = values[index];
        }
        return made;
    };
    // Concatenation of dynamic arrays (a + b, Concat).
    Runtime.prototype.concatArrays = function (type, list) {
        var total = 0;
        list.forEach(function (array) { total += array.length; });
        if (total === 0)
            return type.empty();
        var made = type.newArray(total);
        var at = 0;
        list.forEach(function (array) {
            for (var index = 0; index < array.length; ++index)
                made[at++] = Pascal.types.isAggregate(type.of) ? type.of.clone(array[index]) : array[index];
        });
        return made;
    };
    Runtime.prototype.deleteArray = function (type, array, index, count) {
        if (index < 0 || index >= array.length || count <= 0)
            return array;
        var keep = [];
        for (var at = 0; at < array.length; ++at) {
            if (at < index || at >= index + count)
                keep.push(array[at]);
        }
        return this.arrayOf(type, keep);
    };
    Runtime.prototype.insertArray = function (type, values, array, index) {
        var list = Array.prototype.slice.call(array);
        index = Math.max(0, Math.min(index, list.length));
        var items = Array.prototype.slice.call(values);
        return this.arrayOf(type, list.slice(0, index).concat(items, list.slice(index)));
    };
    // Equality of dynamic arrays: one reference or both nil.
    Runtime.prototype.sameArray = function (left, right) {
        return left === right || (left.length === 0 && right.length === 0);
    };

    // --- Pointers

    // A pointer to a place (object, key): the property v reads and writes it.
    function Reference(object, key) {
        this.o = object;
        this.k = key;
    }
    Object.defineProperty(Reference.prototype, 'v', {
        get: function () { return this.o[this.k]; },
        set: function (value) { this.o[this.k] = value; }
    });
    Pascal.Reference = Reference;

    Runtime.prototype.ref = function (object, key) {
        return new Reference(object, key);
    };
    Runtime.prototype.box = function (value) {
        return { v: value };
    };
    // Pointer equality: two pointers to one place are equal.
    Runtime.prototype.samePointer = function (left, right) {
        if (left === right)
            return true;
        return left instanceof Reference && right instanceof Reference && left.o === right.o && left.k === right.k;
    };
    Runtime.prototype.deref = function (pointer) {
        if (pointer === null || pointer === undefined)
            this.re(216);
        return pointer;
    };

    // --- Classes

    // A new class: a JavaScript constructor with a prototype chain.
    Runtime.prototype.defineClass = function (parent, name, init) {
        var classType = function () {};
        if (parent !== null)
            classType.prototype = Object.create(parent.prototype);
        classType.prototype.constructor = classType;
        Object.defineProperty(classType.prototype, '$pascal', { value: true, writable: false });
        classType.$name = name;
        classType.$parent = parent;
        classType.$init = init || (parent !== null ? parent.$init : function () {});
        return classType;
    };

    // An instance without a constructor: the fields are zeros.
    Runtime.prototype.alloc = function (classType) {
        var object = new classType();
        classType.$init(object);
        return object;
    };

    Runtime.prototype.isA = function (object, classType) {
        return object !== null && object !== undefined && object instanceof classType;
    };

    Runtime.prototype.as = function (object, classType) {
        if (object === null || object === undefined)
            return object;
        if (!(object instanceof classType))
            this.re(219);
        return object;
    };

    Runtime.prototype.classOf = function (object) {
        if (object === null || object === undefined)
            this.re(216);
        return object.constructor;
    };

    Runtime.prototype.inheritsFrom = function (classType, base) {
        for (var ancestor = classType; ancestor !== null && ancestor !== undefined; ancestor = ancestor.$parent) {
            if (ancestor === base)
                return true;
        }
        return false;
    };

    Runtime.prototype.abstractError = function () {
        this.re(211);
    };

    // A method of an object as a value of a procedural type "of object".
    Runtime.prototype.method = function (object, name) {
        if (object === null || object === undefined)
            this.re(216);
        var fn = object[name];
        var bound = function () {
            return fn.apply(object, arguments);
        };
        bound.$self = object;
        bound.$code = fn;
        return bound;
    };
    Runtime.prototype.sameMethod = function (left, right) {
        if (left === right)
            return true;
        if (left === null || right === null || left === undefined || right === undefined)
            return false;
        return left.$self !== undefined && left.$self === right.$self && left.$code === right.$code;
    };

    // --- Random numbers: the Mersenne Twister MT19937 (Matsumoto and
    // Nishimura, 1998). What Free Pascal does around it was matched by its
    // output: the generator is seeded again whenever RandSeed differs from
    // the value it left there (the complement of the seed), Random(l) takes
    // the high half of the 64-bit product, Random(Int64) - two numbers.

    var MT_SIZE = 624;
    var MT_SHIFT = 397;

    function seedTwister(words, seed) {
        words[0] = seed >>> 0;
        for (var index = 1; index < MT_SIZE; ++index) {
            var previous = words[index - 1];
            words[index] = (Math.imul(1812433253, previous ^ (previous >>> 30)) + index) >>> 0;
        }
    }

    function regenerate(words) {
        for (var index = 0; index < MT_SIZE; ++index) {
            var bits = (words[index] & 0x80000000) | (words[(index + 1) % MT_SIZE] & 0x7FFFFFFF);
            var next = words[(index + MT_SHIFT) % MT_SIZE] ^ (bits >>> 1);
            words[index] = ((bits & 1) !== 0 ? next ^ 0x9908B0DF : next) >>> 0;
        }
    }

    function temper(value) {
        value ^= value >>> 11;
        value ^= (value << 7) & 0x9D2C5680;
        value ^= (value << 15) & 0xEFC60000;
        value ^= value >>> 18;
        return value >>> 0;
    }

    // The next 32 random bits as an unsigned number.
    Runtime.prototype.nextRandom = function () {
        var twister = this.twister;
        var seed = this.session.getRandSeed();
        if (!twister.seeded || seed !== twister.leftSeed) {
            seedTwister(twister.words, seed);
            twister.position = MT_SIZE;
            twister.seeded = true;
            twister.leftSeed = (~seed) >>> 0;
            this.session.setRandSeed(twister.leftSeed);
        }
        if (twister.position >= MT_SIZE) {
            regenerate(twister.words);
            twister.position = 0;
        }
        return temper(twister.words[twister.position++]);
    };

    // Random without an argument: [0, 1).
    Runtime.prototype.random = function () {
        return this.nextRandom() / 4294967296;
    };

    // floor(left * right / 2^32) exactly: left is unsigned 32-bit, right a 32-bit integer.
    function productHigh(left, right) {
        var upper = (left >>> 16) * right;
        var lower = (left & 0xFFFF) * right;
        var quotient = Math.floor(upper / 65536);
        var remainder = upper - quotient * 65536;
        return quotient + Math.floor((remainder * 65536 + lower) / 4294967296);
    }

    // Random(range) for LongInt: [0, range) or (range, 0] for a negative range.
    Runtime.prototype.randomInt = function (range) {
        var limit = range < 0 ? range + 1 : range;
        return productHigh(this.nextRandom(), limit) | 0;
    };

    // Random(range) for Int64: 63 random bits modulo range (never negative).
    Runtime.prototype.randomInt64 = function (range) {
        var low = this.nextRandom();
        var high = this.nextRandom() & 0x7FFFFFFF;
        if (i64.eq(range, 0))
            return 0;
        return i64.mod(i64.make(high, low | 0), range);
    };

    Runtime.prototype.randomize = function () {
        var seed = (Date.now() * 1000 + Math.floor(Math.random() * 1000)) % 4294967296;
        this.session.setRandSeed(seed >>> 0);
    };

    // --- Numbers

    // Round: to the nearest, a half to even (as FPC on x86).
    Runtime.prototype.round = function (value) {
        if (!isFinite(value))
            this.re(207);
        var rounded = Math.round(value);
        if (Math.abs(value - Math.trunc(value)) === 0.5 && rounded % 2 !== 0)
            rounded -= 1;
        return this.toInt64(rounded);
    };
    Runtime.prototype.trunc = function (value) {
        if (!isFinite(value))
            this.re(207);
        return this.toInt64(Math.trunc(value));
    };
    Runtime.prototype.toInt64 = function (value) {
        if (value >= -9007199254740991 && value <= 9007199254740991)
            return value + 0;
        if (!(value >= -9223372036854775808 && value < 9223372036854775808))
            this.re(207);
        return i64.fromFloat(value);
    };
    Runtime.prototype.frac = function (value) {
        return value - Math.trunc(value);
    };
    Runtime.prototype.int = function (value) {
        return Math.trunc(value);
    };
    var FPU_INVALID = 1, FPU_ZERO_DIVIDE = 4, FPU_OVERFLOW = 8;

    // A floating-point exception: an error unless masked.
    Runtime.prototype.fpuError = function (bit, code) {
        if ((this.fpuMask & bit) === 0)
            this.re(code);
    };
    // Division of reals: by zero - an error, as an FPU with exceptions.
    Runtime.prototype.fdiv = function (dividend, divisor) {
        if (divisor === 0) {
            if (dividend === 0 || dividend !== dividend)
                this.fpuError(FPU_INVALID, 207);
            else
                this.fpuError(FPU_ZERO_DIVIDE, 208);
        }
        return dividend / divisor;
    };
    // A real after operations: an infinity and NaN are errors of the FPU.
    Runtime.prototype.fchk = function (value) {
        if (value !== value)
            this.fpuError(FPU_INVALID, 207);
        else if (value === Infinity || value === -Infinity)
            this.fpuError(FPU_OVERFLOW, 205);
        return value;
    };
    Runtime.prototype.sqrt = function (value) {
        if (value < 0)
            this.fpuError(FPU_INVALID, 207);
        return Math.sqrt(value);
    };
    Runtime.prototype.ln = function (value) {
        if (value < 0 || value !== value)
            this.fpuError(FPU_INVALID, 207);
        else if (value === 0)
            this.fpuError(FPU_ZERO_DIVIDE, 208);
        return Math.log(value);
    };
    Runtime.prototype.exp = function (value) {
        var result = Math.exp(value);
        if (result === Infinity && value !== Infinity)
            this.fpuError(FPU_OVERFLOW, 205);
        return result;
    };
    // div and mod: division by zero is error 200.
    Runtime.prototype.idiv = function (dividend, divisor) {
        if (divisor === 0)
            this.re(200);
        return Math.trunc(dividend / divisor) + 0;
    };
    Runtime.prototype.imod = function (dividend, divisor) {
        if (divisor === 0)
            this.re(200);
        return (dividend % divisor) + 0;
    };

    // --- Waiting (Delay, Sleep): real time, the program goes on by a
    // timer.

    Runtime.prototype.sleep = function* (milliseconds) {
        milliseconds = Number(milliseconds);
        if (!(milliseconds > 0)) {
            this.env.scheduler.sleep(0);
            yield;
            return;
        }
        this.env.scheduler.sleep(Math.round(milliseconds));
        yield;
    };

    Runtime.prototype.sleepNow = function (milliseconds) {
        return this.env.scheduler.runNested(this.sleep(milliseconds));
    };
})(globalThis);
