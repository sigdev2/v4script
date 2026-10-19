// WAT: execution - traps, i64 and float arithmetic by the rules of
// WebAssembly, exact conversions, linear memory, tables, globals, values
// between WebAssembly and JavaScript. $W in the translated code.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var W = T.wat;
    if (W.rt)
        return;

    var i64 = T.i64, u64 = T.u64;
    var TWO32 = 4294967296;
    var MAX_SAFE = 9007199254740991;
    var PAGE = 65536;
    // The memory limit: a larger ArrayBuffer cannot be allocated reliably.
    var MAX_PAGES = 8192;

    // --- Errors

    function Trap(message) {
        T.LanguageError.call(this, message);
        this.trap = true;
    }
    Trap.prototype = Object.create(T.LanguageError.prototype);
    Trap.prototype.constructor = Trap;

    // The end of a WASI program (proc_exit).
    function Exit(code) {
        T.LanguageError.call(this, 'exit status ' + code);
        this.exitCode = code;
    }
    Exit.prototype = Object.create(T.LanguageError.prototype);
    Exit.prototype.constructor = Exit;

    var rt = {
        Trap: Trap,
        Exit: Exit,
        PAGE: PAGE,
        MAX_PAGES: MAX_PAGES,
        trap: function (message) {
            throw new Trap(message);
        },
        unreachable: function () {
            throw new Trap('unreachable');
        },
        divideByZero: function () {
            throw new Trap('integer divide by zero');
        },
        overflow: function () {
            throw new Trap('integer overflow');
        },
        invalidConversion: function () {
            throw new Trap('invalid conversion to integer');
        },
        outOfBounds: function () {
            throw new Trap('out of bounds memory access');
        }
    };

    // --- The binary representation of floats

    var scratch = new ArrayBuffer(8);
    var scratchF64 = new Float64Array(scratch);
    var scratchF32 = new Float32Array(scratch);
    var scratchI32 = new Int32Array(scratch);

    rt.i32FromF32 = function (value) {
        scratchF32[0] = value;
        return scratchI32[0];
    };
    rt.f32FromI32 = function (bits) {
        scratchI32[0] = bits;
        return scratchF32[0];
    };
    rt.i64FromF64 = function (value) {
        scratchF64[0] = value;
        return i64.make(scratchI32[1], scratchI32[0]);
    };
    rt.f64FromI64 = function (value) {
        if (typeof value === 'number') {
            scratchI32[0] = value | 0;
            scratchI32[1] = Math.floor(value / TWO32) | 0;
        } else {
            scratchI32[0] = value.lo;
            scratchI32[1] = value.hi;
        }
        return scratchF64[0];
    };
    // A NaN with a given payload (if the engine keeps it).
    rt.nanF32 = function (payload, negative) {
        return rt.f32FromI32((negative ? 0xFF800000 : 0x7F800000) | payload);
    };
    rt.nanF64 = function (payload, negative) {
        var hi = Math.floor(payload / TWO32);
        return rt.f64FromI64(i64.make((negative ? 0xFFF00000 : 0x7FF00000) | hi, (payload - hi * TWO32) | 0));
    };

    // --- i32

    rt.ctz32 = function (value) {
        return value === 0 ? 32 : 31 - Math.clz32(value & -value);
    };
    rt.popcnt32 = function (value) {
        value = value - ((value >>> 1) & 0x55555555);
        value = (value & 0x33333333) + ((value >>> 2) & 0x33333333);
        return (Math.imul((value + (value >>> 4)) & 0x0F0F0F0F, 0x01010101) >>> 24);
    };

    // A float to an integer: NaN is an invalid conversion, out of range an overflow.
    rt.truncI32 = function (value) {
        if (value !== value)
            rt.invalidConversion();
        if (!(value > -2147483649 && value < 2147483648))
            rt.overflow();
        return value < 0 ? Math.ceil(value) | 0 : Math.floor(value) | 0;
    };
    rt.truncU32 = function (value) {
        if (value !== value)
            rt.invalidConversion();
        if (!(value > -1 && value < 4294967296))
            rt.overflow();
        return Math.trunc(value) | 0;
    };
    rt.truncSatI32 = function (value) {
        if (value !== value)
            return 0;
        if (value <= -2147483648)
            return -2147483648;
        if (value >= 2147483647)
            return 2147483647;
        return Math.trunc(value) | 0;
    };
    rt.truncSatU32 = function (value) {
        if (value !== value || value <= 0)
            return 0;
        if (value >= 4294967295)
            return -1;
        return Math.trunc(value) | 0;
    };

    // --- i64 (the hybrid T.i64: a number up to 2^53, an Int64 beyond)

    function hiOf(value) {
        return typeof value === 'number' ? Math.floor(value / TWO32) | 0 : value.hi;
    }
    function loOf(value) {
        return typeof value === 'number' ? value | 0 : value.lo;
    }
    rt.hiOf = hiOf;
    rt.loOf = loOf;

    var I64_MIN = i64.make(-2147483648, 0);

    var w64 = {
        divS: function (dividend, divisor) {
            if (divisor === 0)
                rt.divideByZero();
            if (divisor === -1 && typeof dividend === 'object' && dividend.hi === -2147483648 && dividend.lo === 0)
                rt.overflow();
            if (typeof dividend === 'number' && typeof divisor === 'number')
                return Math.trunc(dividend / divisor) + 0;
            return i64.div(dividend, divisor);
        },
        remS: function (dividend, divisor) {
            if (divisor === 0)
                rt.divideByZero();
            if (typeof dividend === 'number' && typeof divisor === 'number')
                return (dividend % divisor) + 0;
            if (divisor === -1)
                return 0;
            return i64.mod(dividend, divisor);
        },
        divU: function (dividend, divisor) {
            if (divisor === 0)
                rt.divideByZero();
            if (typeof dividend === 'number' && typeof divisor === 'number' && dividend >= 0 && divisor > 0)
                return Math.trunc(dividend / divisor) + 0;
            return i64.fromUnsigned(u64.div(dividend, divisor));
        },
        remU: function (dividend, divisor) {
            if (divisor === 0)
                rt.divideByZero();
            if (typeof dividend === 'number' && typeof divisor === 'number' && dividend >= 0 && divisor > 0)
                return (dividend % divisor) + 0;
            return i64.fromUnsigned(u64.mod(dividend, divisor));
        },
        shl: function (value, count) {
            return i64.shl(value, loOf(count) & 63);
        },
        shrS: function (value, count) {
            return i64.shr(value, loOf(count) & 63);
        },
        shrU: function (value, count) {
            count = loOf(count) & 63;
            if (count === 0)
                return value;
            return i64.fromUnsigned(u64.shr(value, count));
        },
        rotl: function (value, count) {
            count = loOf(count) & 63;
            if (count === 0)
                return value;
            return i64.or(i64.shl(value, count), i64.fromUnsigned(u64.shr(value, 64 - count)));
        },
        rotr: function (value, count) {
            count = loOf(count) & 63;
            if (count === 0)
                return value;
            return i64.or(i64.fromUnsigned(u64.shr(value, count)), i64.shl(value, 64 - count));
        },
        clz: function (value) {
            var hi = hiOf(value);
            return hi !== 0 ? Math.clz32(hi) : 32 + Math.clz32(loOf(value));
        },
        ctz: function (value) {
            var lo = loOf(value);
            return lo !== 0 ? rt.ctz32(lo) : 32 + rt.ctz32(hiOf(value));
        },
        popcnt: function (value) {
            return rt.popcnt32(hiOf(value)) + rt.popcnt32(loOf(value));
        },
        ltU: function (left, right) { return compareUnsigned(left, right) < 0; },
        leU: function (left, right) { return compareUnsigned(left, right) <= 0; },
        gtU: function (left, right) { return compareUnsigned(left, right) > 0; },
        geU: function (left, right) { return compareUnsigned(left, right) >= 0; },
        lt: function (left, right) { return i64.cmp(left, right) < 0; },
        le: function (left, right) { return i64.cmp(left, right) <= 0; },
        gt: function (left, right) { return i64.cmp(left, right) > 0; },
        ge: function (left, right) { return i64.cmp(left, right) >= 0; },
        eq: function (left, right) { return i64.eq(left, right); },
        extend8: function (value) { return (loOf(value) << 24) >> 24; },
        extend16: function (value) { return (loOf(value) << 16) >> 16; },
        extend32: function (value) { return loOf(value); },
        // Unsigned from an i32.
        fromU32: function (value) { return value >>> 0; },
        // Floats -> i64 with traps and with saturation.
        truncS: function (value) {
            if (value !== value)
                rt.invalidConversion();
            if (!(value >= -9223372036854775808 && value < 9223372036854775808))
                rt.overflow();
            return noNegativeZero(i64.fromFloat(value));
        },
        truncU: function (value) {
            if (value !== value)
                rt.invalidConversion();
            if (!(value > -1 && value < 18446744073709551616))
                rt.overflow();
            return noNegativeZero(i64.fromUnsigned(u64.fromFloat(Math.trunc(value))));
        },
        truncSatS: function (value) {
            if (value !== value)
                return 0;
            if (value < -9223372036854775808)
                return I64_MIN;
            if (value >= 9223372036854775808)
                return i64.make(2147483647, -1);
            return noNegativeZero(i64.fromFloat(value));
        },
        truncSatU: function (value) {
            if (value !== value || value <= 0)
                return 0;
            if (value >= 18446744073709551616)
                return -1;
            return noNegativeZero(i64.fromUnsigned(u64.fromFloat(Math.trunc(value))));
        },
        // i64 -> f64 (one rounding: hi * 2^32 is exact, the addition rounds).
        toF64S: function (value) {
            return typeof value === 'number' ? value : value.hi * TWO32 + (value.lo >>> 0);
        },
        // i64 -> f32 without double rounding: the high 32 bits of the
        // magnitude and a "something else was there" bit (round to odd),
        // then one fround.
        toF32S: function (value) {
            if (typeof value === 'number' && value >= -MAX_SAFE && value <= MAX_SAFE)
                return Math.fround(value);
            var hi = hiOf(value), lo = loOf(value);
            var negative = hi < 0;
            if (negative) {
                lo = ~lo + 1 | 0;
                hi = (~hi + (lo === 0 ? 1 : 0)) | 0;
            }
            var magnitude = toF32Magnitude(hi >>> 0, lo >>> 0);
            return negative ? -magnitude : magnitude;
        },
        toF32U: function (value) {
            if (typeof value === 'number' && value >= 0 && value <= MAX_SAFE)
                return Math.fround(value);
            return toF32Magnitude(hiOf(value) >>> 0, loOf(value) >>> 0);
        }
    };

    function noNegativeZero(value) {
        return typeof value === 'number' ? value + 0 : value;
    }

    // Compares bits as unsigned numbers.
    function compareUnsigned(left, right) {
        if (typeof left === 'number' && typeof right === 'number' && left >= 0 && right >= 0)
            return left < right ? -1 : (left > right ? 1 : 0);
        var leftHigh = hiOf(left) >>> 0, rightHigh = hiOf(right) >>> 0;
        if (leftHigh !== rightHigh)
            return leftHigh < rightHigh ? -1 : 1;
        var leftLow = loOf(left) >>> 0, rightLow = loOf(right) >>> 0;
        return leftLow < rightLow ? -1 : (leftLow > rightLow ? 1 : 0);
    }

    function toF32Magnitude(hi, lo) {
        if (hi < 2097152)
            return Math.fround(hi * TWO32 + lo);
        // A shift so that 32 bits remain.
        var shift = 32 - Math.clz32(hi);
        var top = (hi * Math.pow(2, 32 - shift)) + Math.floor(lo / Math.pow(2, shift));
        var sticky = (lo % Math.pow(2, shift)) !== 0;
        if (sticky && top % 2 === 0)
            top += 1;
        return Math.fround(top) * Math.pow(2, shift);
    }

    // An unsigned i64 -> f64 (correct rounding).
    w64.toF64U = function (value) {
        if (typeof value === 'number' && value >= 0)
            return value;
        return (hiOf(value) >>> 0) * TWO32 + (loOf(value) >>> 0);
    };

    rt.i64 = w64;

    // --- Floats

    // Rounding to the nearest even keeping the sign of zero. Without
    // Math.round: in V4 it errs on numbers near 2^52.
    rt.nearest = function (value) {
        if (value !== value || value === 0 || !(Math.abs(value) < 4503599627370496))
            return value;
        var floor = Math.floor(value);
        var fraction = value - floor;
        var rounded = fraction < 0.5 ? floor : (fraction > 0.5 || floor % 2 !== 0 ? floor + 1 : floor);
        if (rounded === 0)
            return value < 0 ? -0 : 0;
        return rounded;
    };

    rt.copysign = function (value, sign) {
        var negative = sign < 0 || (sign === 0 && 1 / sign < 0);
        if (sign !== sign) {
            scratchF64[0] = sign;
            negative = scratchI32[1] < 0;
        }
        var magnitude = Math.abs(value);
        return negative ? -magnitude : magnitude;
    };

    // --- Linear memory

    function Memory(min, max) {
        this.pages = min;
        this.max = max;
        this.attach(new ArrayBuffer(min * PAGE));
    }

    Memory.prototype.attach = function (buffer) {
        var old = this.U8;
        this.buffer = buffer;
        this.I8 = new Int8Array(buffer);
        this.U8 = new Uint8Array(buffer);
        this.I16 = new Int16Array(buffer);
        this.U16 = new Uint16Array(buffer);
        this.I32 = new Int32Array(buffer);
        this.U32 = new Uint32Array(buffer);
        this.F32 = new Float32Array(buffer);
        this.F64 = new Float64Array(buffer);
        this.dv = new DataView(buffer);
        if (old !== undefined)
            this.U8.set(old);
        this.size = buffer.byteLength;
        // The last address from which 1, 2, 4, 8 bytes fit.
        this.lim1 = this.size - 1;
        this.lim2 = this.size - 2;
        this.lim4 = this.size - 4;
        this.lim8 = this.size - 8;
    };

    // memory.grow: the old size in pages or -1.
    Memory.prototype.grow = function (delta) {
        delta = delta >>> 0;
        var old = this.pages;
        if (delta === 0)
            return old;
        var limit = this.max === null ? 65536 : this.max;
        if (old + delta > limit || old + delta > MAX_PAGES)
            return -1;
        var buffer;
        try {
            buffer = new ArrayBuffer((old + delta) * PAGE);
        } catch (error) {
            return -1;
        }
        this.attach(buffer);
        this.pages = old + delta;
        return old;
    };

    Memory.prototype.check = function (address, length) {
        if (address < 0 || address + length > this.size)
            rt.outOfBounds();
    };

    // The slow path: the address is misaligned or outside the memory (the
    // address is unsigned plus the offset, up to 2^33).
    Memory.prototype.load = function (kind, address) {
        var dv = this.dv;
        switch (kind) {
        case 'i32': this.check(address, 4); return dv.getInt32(address, true);
        case 'i8': this.check(address, 1); return dv.getInt8(address);
        case 'u8': this.check(address, 1); return dv.getUint8(address);
        case 'i16': this.check(address, 2); return dv.getInt16(address, true);
        case 'u16': this.check(address, 2); return dv.getUint16(address, true);
        case 'f32': this.check(address, 4); return dv.getFloat32(address, true);
        case 'f64': this.check(address, 8); return dv.getFloat64(address, true);
        case 'i64':
            this.check(address, 8);
            return i64.make(dv.getInt32(address + 4, true), dv.getInt32(address, true));
        case 'i64_32s': this.check(address, 4); return dv.getInt32(address, true);
        case 'i64_32u': this.check(address, 4); return dv.getUint32(address, true);
        }
        throw new Error('load ' + kind);
    };

    Memory.prototype.store = function (kind, address, value) {
        var dv = this.dv;
        switch (kind) {
        case 'i32': this.check(address, 4); dv.setInt32(address, value, true); return;
        case 'i8': this.check(address, 1); dv.setInt8(address, value); return;
        case 'i16': this.check(address, 2); dv.setInt16(address, value, true); return;
        case 'f32': this.check(address, 4); dv.setFloat32(address, value, true); return;
        case 'f64': this.check(address, 8); dv.setFloat64(address, value, true); return;
        case 'i64':
            this.check(address, 8);
            dv.setInt32(address, loOf(value), true);
            dv.setInt32(address + 4, hiOf(value), true);
            return;
        }
        throw new Error('store ' + kind);
    };

    // 64-bit values: aligned ones as two words.
    Memory.prototype.load64 = function (address) {
        if (address <= this.lim8 && (address & 3) === 0) {
            var index = address >> 2;
            return i64.make(this.I32[index + 1], this.I32[index]);
        }
        return this.load('i64', address);
    };

    Memory.prototype.store64 = function (address, value) {
        if (address <= this.lim8 && (address & 3) === 0) {
            var index = address >> 2;
            if (typeof value === 'number') {
                this.I32[index] = value | 0;
                this.I32[index + 1] = Math.floor(value / TWO32) | 0;
            } else {
                this.I32[index] = value.lo;
                this.I32[index + 1] = value.hi;
            }
            return;
        }
        this.store('i64', address, value);
    };

    Memory.prototype.fill = function (target, value, length) {
        target = target >>> 0;
        length = length >>> 0;
        if (target + length > this.size)
            rt.outOfBounds();
        this.U8.fill(value & 255, target, target + length);
    };

    Memory.prototype.copy = function (target, source, length) {
        target = target >>> 0;
        source = source >>> 0;
        length = length >>> 0;
        if (target + length > this.size || source + length > this.size)
            rt.outOfBounds();
        this.U8.copyWithin(target, source, source + length);
    };

    // memory.init: the bytes of a segment (empty after data.drop).
    Memory.prototype.init = function (bytes, target, source, length) {
        target = target >>> 0;
        source = source >>> 0;
        length = length >>> 0;
        if (source + length > bytes.length || target + length > this.size)
            rt.outOfBounds();
        for (var index = 0; index < length; ++index)
            this.U8[target + index] = bytes[source + index];
    };

    rt.Memory = Memory;

    // --- Tables

    function Table(type, min, max, init) {
        this.type = type;
        this.max = max;
        this.e = [];
        for (var index = 0; index < min; ++index)
            this.e.push(init === undefined ? null : init);
    }

    Table.prototype.outOfBounds = function () {
        throw new Trap('out of bounds table access');
    };

    Table.prototype.get = function (index) {
        index = index >>> 0;
        if (index >= this.e.length)
            this.outOfBounds();
        return this.e[index];
    };

    Table.prototype.set = function (index, value) {
        index = index >>> 0;
        if (index >= this.e.length)
            this.outOfBounds();
        this.e[index] = value;
    };

    Table.prototype.grow = function (value, delta) {
        delta = delta >>> 0;
        var old = this.e.length;
        var limit = this.max === null ? 4294967295 : this.max;
        if (old + delta > limit || old + delta > 10000000)
            return -1;
        for (var index = 0; index < delta; ++index)
            this.e.push(value);
        return old;
    };

    Table.prototype.fill = function (target, value, length) {
        target = target >>> 0;
        length = length >>> 0;
        if (target + length > this.e.length)
            this.outOfBounds();
        for (var index = 0; index < length; ++index)
            this.e[target + index] = value;
    };

    Table.prototype.copy = function (source, target, sourceStart, length) {
        target = target >>> 0;
        sourceStart = sourceStart >>> 0;
        length = length >>> 0;
        if (target + length > this.e.length || sourceStart + length > source.e.length)
            this.outOfBounds();
        var values = source.e.slice(sourceStart, sourceStart + length);
        for (var index = 0; index < length; ++index)
            this.e[target + index] = values[index];
    };

    // table.init: the values of a segment (empty after elem.drop).
    Table.prototype.init = function (values, target, source, length) {
        target = target >>> 0;
        source = source >>> 0;
        length = length >>> 0;
        if (source + length > values.length || target + length > this.e.length)
            this.outOfBounds();
        for (var index = 0; index < length; ++index)
            this.e[target + index] = values[source + index];
    };

    rt.Table = Table;

    // The cell of a global (imports and exports share it between modules).
    function Global(type, mutable, value) {
        this.type = type;
        this.mutable = mutable;
        this.value = value;
    }
    rt.Global = Global;

    // --- Functions and signatures

    rt.signature = function (type) {
        return type.params.join(' ') + '->' + type.results.join(' ');
    };

    // call_indirect: a table element with checks.
    rt.indirect = function (table, index, signature) {
        index = index >>> 0;
        if (index >= table.e.length)
            throw new Trap('undefined element');
        var fn = table.e[index];
        if (fn === null)
            throw new Trap('uninitialized element ' + index);
        if (fn.$sig !== signature)
            throw new Trap('indirect call type mismatch');
        return fn;
    };

    // --- WebAssembly <-> JavaScript values

    rt.toJS = function (value, type) {
        switch (type) {
        case 'i64':
            return typeof value === 'number' ? value : i64.toFloat(value);
        case 'funcref':
            return value === null ? null : rt.jsFunction(value);
        }
        return value;
    };

    rt.fromJS = function (value, type) {
        switch (type) {
        case 'i32':
            return Number(value) | 0;
        case 'i64': {
            var number = Math.trunc(Number(value));
            if (number !== number)
                return 0;
            if (number >= -MAX_SAFE && number <= MAX_SAFE)
                return number + 0;
            if (number === Infinity || number === -Infinity)
                return 0;
            return T.bigToI64(T.big.fromFloat(number), true);
        }
        case 'f32':
            return Math.fround(Number(value));
        case 'f64':
            return Number(value);
        case 'funcref':
            if (value === null || value === undefined)
                return null;
            if (typeof value === 'function' && value.$wasm !== undefined)
                return value.$wasm;
            if (typeof value === 'function' && value.$sig !== undefined)
                return value;
            throw new TypeError('type mismatch: not a WebAssembly function');
        }
        return value;
    };

    // A WebAssembly function for JavaScript: the arguments and the result
    // by the types. A trap inside goes to JavaScript as an exception.
    rt.jsFunction = function (fn) {
        if (fn.$js !== undefined)
            return fn.$js;
        var type = fn.$type;
        var wrapper = function () {
            var args = [];
            for (var index = 0; index < type.params.length; ++index)
                args.push(rt.fromJS(arguments[index], type.params[index]));
            var result = fn.apply(null, args);
            return rt.resultsToJS(result, type.results);
        };
        wrapper.$wasm = fn;
        Object.defineProperty(fn, '$js', { value: wrapper, configurable: true });
        return wrapper;
    };

    rt.resultsToJS = function (result, types) {
        if (types.length === 0)
            return undefined;
        if (types.length === 1)
            return rt.toJS(result, types[0]);
        return result.map(function (value, index) {
            return rt.toJS(value, types[index]);
        });
    };

    // A JavaScript function as an import: this is the object that holds it.
    rt.hostFunction = function (fn, self, type, before) {
        var params = type.params, results = type.results;
        var wrapped = function () {
            var args = [];
            for (var index = 0; index < params.length; ++index)
                args.push(rt.toJS(arguments[index], params[index]));
            if (before)
                before();
            var result = fn.apply(self, args);
            if (results.length === 0)
                return undefined;
            if (results.length === 1)
                return rt.fromJS(result, results[0]);
            var list = Array.prototype.slice.call(result);
            if (list.length !== results.length)
                throw new TypeError('the function returned ' + list.length + ' values, ' + results.length + ' expected');
            return list.map(function (value, index) {
                return rt.fromJS(value, results[index]);
            });
        };
        rt.markFunction(wrapped, type);
        return wrapped;
    };

    rt.markFunction = function (fn, type) {
        fn.$sig = rt.signature(type);
        fn.$type = type;
        return fn;
    };

    // --- Value output

    rt.format = function (value, type) {
        switch (type) {
        case 'i32':
            return String(value);
        case 'i64':
            return i64.str(value);
        case 'f32':
            return W.numbers.formatF32(value);
        case 'f64':
            return W.numbers.formatF64(value);
        case 'funcref':
            return value === null ? 'null' : 'ref.func' + (value.$name ? ' $' + value.$name : '');
        case 'externref':
            if (value === null)
                return 'null';
            if (value !== null && typeof value === 'object' && value.$hostRef !== undefined)
                return 'ref.extern ' + value.$hostRef;
            return typeof value === 'string' ? JSON.stringify(value) : String(value);
        }
        return String(value);
    };

    W.rt = rt;
})(globalThis);
