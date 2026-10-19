// Forth: the program memory (bytes, cells of 8 bytes), errors with THROW
// codes, double numbers and float output. Design: docs/internals/forth.md.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Forth = T.forth = T.forth || {};
    if (Forth.runtime)
        return;

    var i64 = T.i64, big = T.big, numbers = T.numbers;
    var TWO32 = 4294967296;
    var TWO64 = big.mul(TWO32, TWO32);

    // The memory map: the zero page is inaccessible, then the system
    // variables and buffers, the dictionary (HERE grows up to
    // DICTIONARY_END), the ALLOCATE heap. The memory buffer grows as
    // needed: without ALLOCATE it is no larger than the dictionary.
    var layout = {
        NULL_PAGE: 4096,
        VARIABLES: 4096,            // STATE, BASE, >IN, BLK, DPL - a cell each
        WORD_BUFFER: 4608,          // WORD: a counted string
        HOLD_START: 4864,
        HOLD_END: 5632,             // <# # #> - down from HOLD_END
        PAD: 5632,
        PAD_SIZE: 1024,
        INPUT: 8192,                // the line the interpreter parses
        INPUT_SIZE: 65536,
        TRANSIENT: 73728,           // transient strings: S" outside a definition, JS>S
        TRANSIENT_SLOTS: 16,
        TRANSIENT_SIZE: 4096,
        DICTIONARY: 139264,
        DICTIONARY_END: 8 * 1024 * 1024,
        HEAP: 8 * 1024 * 1024,
        MAX_SIZE: 512 * 1024 * 1024
    };
    layout.STATE = layout.VARIABLES;
    layout.BASE = layout.VARIABLES + 8;
    layout.TO_IN = layout.VARIABLES + 16;
    layout.BLK = layout.VARIABLES + 24;
    layout.DPL = layout.VARIABLES + 32;
    layout.PRECISION = layout.VARIABLES + 40;
    Forth.layout = layout;

    var INITIAL_SIZE = 1024 * 1024;

    // --- Errors

    var MESSAGES = {
        '-1': 'Aborted', '-2': 'Aborted', '-3': 'Stack overflow', '-4': 'Stack underflow',
        '-5': 'Return stack overflow', '-6': 'Return stack underflow', '-7': 'Do-loops nested too deeply',
        '-8': 'Dictionary overflow', '-9': 'Invalid memory address', '-10': 'Division by zero',
        '-11': 'Result out of range', '-12': 'Argument type mismatch', '-13': 'Undefined word',
        '-14': 'Interpreting a compile-only word', '-15': 'Invalid FORGET',
        '-16': 'Attempt to use zero-length string as a name', '-17': 'Pictured numeric output string overflow',
        '-18': 'Parsed string overflow', '-19': 'Word name too long', '-20': 'Write to a read-only location',
        '-21': 'Unsupported operation', '-22': 'Control structure mismatch', '-23': 'Address alignment exception',
        '-24': 'Invalid numeric argument', '-25': 'Return stack imbalance', '-26': 'Loop parameters unavailable',
        '-27': 'Invalid recursion', '-28': 'User interrupt', '-29': 'Compiler nesting',
        '-30': 'Obsolescent feature', '-31': '>BODY used on non-CREATEd definition', '-32': 'Invalid name argument',
        '-37': 'File I/O exception', '-38': 'Non-existent file', '-39': 'Unexpected end of file',
        '-40': 'Invalid BASE for floating point conversion', '-41': 'Loss of precision',
        '-42': 'Floating-point divide by zero', '-43': 'Floating-point result out of range',
        '-44': 'Floating-point stack overflow', '-45': 'Floating-point stack underflow',
        '-46': 'Floating-point invalid argument', '-47': 'Compilation word list deleted', '-48': 'Invalid POSTPONE',
        '-49': 'Search-order overflow', '-50': 'Search-order underflow', '-51': 'Compilation word list changed',
        '-52': 'Control-flow stack overflow', '-53': 'Exception stack overflow', '-54': 'Floating-point underflow',
        '-55': 'Floating-point unidentified fault', '-56': 'QUIT', '-57': 'Error in sending or receiving a character',
        '-58': '[IF], [ELSE], or [THEN] exception', '-59': 'ALLOCATE', '-60': 'FREE', '-61': 'RESIZE',
        '-77': 'Malformed xchar', '-256': 'JavaScript error'
    };
    Forth.JS_ERROR = -256;

    Forth.messageFor = function (code) {
        var text = MESSAGES[String(code)];
        return text !== undefined ? text : 'error ' + code;
    };

    // A Forth exception (THROW): a code and a text for the user.
    function ForthError(code, message) {
        T.LanguageError.call(this, message === undefined || message === null ? Forth.messageFor(code) : message, null);
        this.code = code;
    }
    ForthError.prototype = Object.create(T.LanguageError.prototype);
    Forth.ForthError = ForthError;

    // BYE and QUIT: the program ends without an error.
    function ForthExit() {
        T.LanguageError.call(this, 'bye', null);
    }
    ForthExit.prototype = Object.create(T.LanguageError.prototype);
    Forth.ForthExit = ForthExit;

    // --- Memory

    function Memory() {
        this.size = 0;
        this.attach(new ArrayBuffer(INITIAL_SIZE));
        this.brk = layout.HEAP;
        this.allocated = new Map();   // address -> block size
        this.bins = new Map();        // class size -> [free addresses]
        this.large = [];              // [address, size] of free large blocks
    }

    Memory.prototype.attach = function (buffer) {
        var old = this.U8;
        this.buffer = buffer;
        this.U8 = new Uint8Array(buffer);
        this.I32 = new Int32Array(buffer);
        this.U32 = new Uint32Array(buffer);
        this.F32 = new Float32Array(buffer);
        this.F64 = new Float64Array(buffer);
        this.view = new DataView(buffer);
        if (old !== undefined)
            this.U8.set(old);
        this.size = buffer.byteLength;
        // The last address from which 8 bytes are intact.
        this.last = this.size - 8;
    };

    Memory.prototype.grow = function (needed) {
        if (needed <= this.size)
            return true;
        var size = Math.max(this.size * 2, Math.ceil(needed / 1048576) * 1048576);
        if (needed > layout.MAX_SIZE)
            return false;
        size = Math.min(size, layout.MAX_SIZE);
        this.attach(new ArrayBuffer(size));
        return true;
    };

    Memory.prototype.fault = function () {
        throw new ForthError(-9);
    };

    // An address and a length inside the memory; the address is a number
    // (an Int64 object gives NaN in comparisons and fails too).
    Memory.prototype.check = function (address, length) {
        if (!(address >= layout.NULL_PAGE && address + length <= this.size))
            this.fault();
        return address;
    };

    Memory.prototype.cell = function (address) {
        if ((address & 7) === 0 && address >= layout.NULL_PAGE && address <= this.last) {
            var hi = this.I32[(address >> 2) + 1];
            var lo = this.U32[address >> 2];
            if (hi >= -2097152 && hi < 2097152 && (hi !== -2097152 || lo !== 0))
                return hi * TWO32 + lo;
            return i64.make(hi, lo | 0);
        }
        this.check(address, 8);
        return i64.make(this.view.getInt32(address + 4, true), this.view.getInt32(address, true));
    };

    Memory.prototype.setCell = function (address, value) {
        var lo, hi;
        if (typeof value === 'number') {
            lo = value | 0;
            hi = Math.floor(value / TWO32) | 0;
        } else {
            lo = value.lo;
            hi = value.hi;
        }
        if ((address & 7) === 0 && address >= layout.NULL_PAGE && address <= this.last) {
            this.I32[address >> 2] = lo;
            this.I32[(address >> 2) + 1] = hi;
            return;
        }
        this.check(address, 8);
        this.view.setInt32(address, lo, true);
        this.view.setInt32(address + 4, hi, true);
    };

    Memory.prototype.byte = function (address) {
        if (address >= layout.NULL_PAGE && address < this.size)
            return this.U8[address];
        return this.fault();
    };

    Memory.prototype.setByte = function (address, value) {
        if (!(address >= layout.NULL_PAGE && address < this.size))
            this.fault();
        this.U8[address] = typeof value === 'number' ? value : value.lo;
    };

    // 16 and 32 bits (W@, L@ of gforth): unsigned.
    Memory.prototype.word16 = function (address) {
        this.check(address, 2);
        return this.view.getUint16(address, true);
    };

    Memory.prototype.setWord16 = function (address, value) {
        this.check(address, 2);
        this.view.setUint16(address, typeof value === 'number' ? value & 0xFFFF : value.lo & 0xFFFF, true);
    };

    Memory.prototype.word32 = function (address) {
        this.check(address, 4);
        return this.view.getUint32(address, true);
    };

    Memory.prototype.setWord32 = function (address, value) {
        this.check(address, 4);
        this.view.setUint32(address, typeof value === 'number' ? value >>> 0 : value.lo >>> 0, true);
    };

    Memory.prototype.float = function (address) {
        if ((address & 7) === 0 && address >= layout.NULL_PAGE && address <= this.last)
            return this.F64[address >> 3];
        this.check(address, 8);
        return this.view.getFloat64(address, true);
    };

    Memory.prototype.setFloat = function (address, value) {
        if ((address & 7) === 0 && address >= layout.NULL_PAGE && address <= this.last) {
            this.F64[address >> 3] = value;
            return;
        }
        this.check(address, 8);
        this.view.setFloat64(address, value, true);
    };

    Memory.prototype.sfloat = function (address) {
        this.check(address, 4);
        return this.view.getFloat32(address, true);
    };

    Memory.prototype.setSfloat = function (address, value) {
        this.check(address, 4);
        this.view.setFloat32(address, value, true);
    };

    // The bytes [start, start + length) as a JavaScript string (a character
    // per byte). V4 ignores the offset of a subarray in apply - hence a plain
    // array.
    Memory.prototype.bytes = function (start, length) {
        if (length <= 0)
            return '';
        this.check(start, length);
        var text = '';
        var view = this.U8;
        var chunk = [];
        for (var at = start, end = start + length; at < end; ++at) {
            chunk.push(view[at]);
            if (chunk.length === 4096) {
                text += String.fromCharCode.apply(null, chunk);
                chunk = [];
            }
        }
        return chunk.length > 0 ? text + String.fromCharCode.apply(null, chunk) : text;
    };

    Memory.prototype.writeBytes = function (address, bytes) {
        if (bytes.length === 0)
            return;
        this.check(address, bytes.length);
        for (var index = 0; index < bytes.length; ++index)
            this.U8[address + index] = bytes.charCodeAt(index);
    };

    Memory.prototype.copy = function (target, source, length) {
        if (length <= 0)
            return;
        this.check(target, length);
        this.check(source, length);
        this.U8.copyWithin(target, source, source + length);
    };

    Memory.prototype.fill = function (target, length, value) {
        if (length <= 0)
            return;
        this.check(target, length);
        this.U8.fill(value & 255, target, target + length);
    };

    // --- The heap (ALLOCATE): size classes, as malloc in C.

    function sizeClass(size) {
        if (size <= 16)
            return 16;
        if (size <= 65536) {
            var power = 1 << (31 - Math.clz32(size - 1));
            var step = Math.max(16, power >> 2);
            return Math.ceil(size / step) * step;
        }
        return Math.ceil(size / 4096) * 4096;
    }

    // An address or 0 when there is no memory.
    Memory.prototype.allocate = function (size) {
        if (!(size >= 0) || size > layout.MAX_SIZE)
            return 0;
        var block = sizeClass(Math.max(1, size));
        var address = 0;
        if (block <= 65536) {
            var bin = this.bins.get(block);
            if (bin !== undefined && bin.length > 0)
                address = bin.pop();
        } else {
            for (var index = 0; index < this.large.length; ++index) {
                if (this.large[index][1] >= block) {
                    address = this.large[index][0];
                    block = this.large[index][1];
                    this.large.splice(index, 1);
                    break;
                }
            }
        }
        if (address === 0) {
            var end = this.brk + block;
            if (!this.grow(end))
                return 0;
            address = this.brk;
            this.brk = end;
        }
        this.allocated.set(address, block);
        return address;
    };

    // false - the address is not from ALLOCATE (or freed already).
    Memory.prototype.free = function (address) {
        var block = this.allocated.get(address);
        if (block === undefined)
            return false;
        this.allocated.delete(address);
        if (block <= 65536) {
            var bin = this.bins.get(block);
            if (bin === undefined) {
                bin = [];
                this.bins.set(block, bin);
            }
            bin.push(address);
        } else {
            this.large.push([address, block]);
        }
        return true;
    };

    // A new address or 0; -1 - the address is not from ALLOCATE.
    Memory.prototype.resize = function (address, size) {
        var block = this.allocated.get(address);
        if (block === undefined)
            return -1;
        if (size <= block)
            return address;
        var moved = this.allocate(size);
        if (moved === 0)
            return 0;
        this.U8.copyWithin(moved, address, address + block);
        this.free(address);
        return moved;
    };

    Forth.Memory = Memory;

    // --- Cells and double numbers
    //
    // A cell is a 64-bit integer T.i64 (a number up to 2^53, an Int64
    // beyond). A double number is two cells (low, high); arithmetic on it goes
    // through
    // T.big.

    var cells = {
        // A cell as an unsigned integer (T.big).
        toUnsignedBig: function (value) {
            if (typeof value === 'number')
                return value >= 0 ? value : big.add(value, TWO64);
            return T.i64ToBig(value, false);
        },
        toBig: function (value) {
            return T.i64ToBig(value, true);
        },
        fromBig: function (value) {
            return T.bigToI64(value, true);
        },
        // A double (lo, hi) as a signed T.big.
        doubleToBig: function (lo, hi) {
            if (typeof lo === 'number' && typeof hi === 'number') {
                if (hi === 0 && lo >= 0)
                    return lo;
                if (hi === -1 && lo < 0)
                    return lo;
            }
            return big.add(big.mul(cells.toBig(hi), TWO64), cells.toUnsignedBig(lo));
        },
        // A T.big as a double: [lo, hi] (modulo 2^128).
        bigToDouble: function (value) {
            if (typeof value === 'number' && value >= -i64.MAX_SAFE && value <= i64.MAX_SAFE)
                return [value, value < 0 ? -1 : 0];
            var low = T.bigToI64(value, true);
            var high = T.bigToI64(big.div(value, TWO64), true);
            return [low, high];
        },
        unsignedDoubleToBig: function (lo, hi) {
            if (typeof hi === 'number' && hi === 0)
                return cells.toUnsignedBig(lo);
            return big.add(big.mul(cells.toUnsignedBig(hi), TWO64), cells.toUnsignedBig(lo));
        },
        TWO64: TWO64
    };
    Forth.cells = cells;

    // --- Floats: REPRESENT, F., FS., FE.

    var floats = {
        // Digits (precision significant ones) and an exponent: value = 0.digits * 10^exponent.
        represent: function (value, precision) {
            var result = numbers.rounded(value, precision, 'significant', true);
            var digits = result.digits;
            while (digits.length < precision)
                digits += '0';
            return { digits: digits.substring(0, precision), exponent: value === 0 ? 1 : result.exponent,
                     negative: value < 0 || (value === 0 && 1 / value < 0) };
        },
        special: function (value) {
            if (value !== value)
                return 'nan';
            if (value === Infinity)
                return 'inf';
            if (value === -Infinity)
                return '-inf';
            return null;
        },
        // F.: without an exponent, extra zeros on the right removed, always a point.
        fixed: function (value, precision) {
            var special = floats.special(value);
            if (special !== null)
                return special;
            var representation = floats.represent(value, precision);
            var digits = representation.digits.replace(/0+$/, '');
            var exponent = representation.exponent;
            var text;
            if (digits.length === 0)
                text = '0.';
            else if (exponent <= 0)
                text = '0.' + new Array(-exponent + 1).join('0') + digits;
            else if (digits.length <= exponent)
                text = digits + new Array(exponent - digits.length + 1).join('0') + '.';
            else
                text = digits.substring(0, exponent) + '.' + digits.substring(exponent);
            return (representation.negative && digits.length > 0 ? '-' : '') + text;
        },
        // FS. (engineering = false) and FE. (the exponent is a multiple of 3).
        exponential: function (value, precision, engineering) {
            var special = floats.special(value);
            if (special !== null)
                return special;
            var representation = floats.represent(value, precision);
            var exponent = value === 0 ? 0 : representation.exponent - 1;
            var whole = 1;
            if (engineering) {
                var shift = ((exponent % 3) + 3) % 3;
                whole += shift;
                exponent -= shift;
            }
            var digits = representation.digits;
            while (digits.length < whole)
                digits += '0';
            return (representation.negative ? '-' : '') + digits.substring(0, whole) + '.' + digits.substring(whole) +
                'E' + exponent;
        }
    };
    Forth.floats = floats;

    // The name of a word as a dictionary key: Latin letters case-insensitive, as in gforth.
    Forth.key = function (name) {
        return /[a-z]/.test(name) ? name.replace(/[a-z]+/g, function (part) { return part.toUpperCase(); }) : name;
    };

    Forth.runtime = true;
})(globalThis);
