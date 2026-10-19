// C: linear memory - one ArrayBuffer with views, the stack grows down from
// the top, a heap with malloc by size classes, address checks (Segmentation
// fault instead of silent garbage), the function table for function
// pointers.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var C = T.c = T.c || {};
    if (C.runtime)
        return;

    var i64 = T.i64, u64 = T.u64, utf8 = T.utf8;

    var NULL_PAGE = 4096;
    var STACK_SIZE = 1024 * 1024;
    var INITIAL_SIZE = 4 * 1024 * 1024;
    var MAX_SIZE = 512 * 1024 * 1024;
    // Function addresses are outside the data memory.
    var FUNCTION_BASE = 0x40000000;

    // An error of a C program (a signal, abort, exit).
    function CError(message, code) {
        T.LanguageError.call(this, message, null);
        this.code = code;
    }
    CError.prototype = Object.create(T.LanguageError.prototype);

    function CExit(code) {
        T.LanguageError.call(this, 'exit status ' + code, null);
        this.exitCode = code;
    }
    CExit.prototype = Object.create(T.LanguageError.prototype);

    function Memory() {
        this.size = 0;
        this.attach(new ArrayBuffer(INITIAL_SIZE));
        this.stackTop = NULL_PAGE + STACK_SIZE;
        this.stackLow = NULL_PAGE;
        this.sp = this.stackTop;
        this.brk = this.stackTop;
        this.allocated = new Map();      // address -> block size
        this.bins = new Map();           // class size -> [free addresses]
        this.large = [];                 // [address, size] of free large blocks
        // Function number -> a function that can be called at once
        // (functions), and a generator to call with yield* (generators).
        this.functions = [];
        this.generators = [];
        this.functionNames = [];
        // Runs a generator from plain code (the session sets it).
        this.runNested = null;
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
        if (old !== undefined)
            this.U8.set(old);
        this.size = buffer.byteLength;
        // The address check in the code: (p - 4096 >>> 0) < lim; 8 bytes of
        // room for the widest store.
        this.lim = this.size - NULL_PAGE - 8;
    };

    Memory.prototype.grow = function (needed) {
        var size = this.size;
        while (size < needed)
            size *= 2;
        if (size > MAX_SIZE)
            return false;
        this.attach(new ArrayBuffer(size));
        return true;
    };

    Memory.prototype.fault = function (address) {
        if (typeof address !== 'number')
            address = i64.toFloat(address);
        if (address >= 0 && address < NULL_PAGE)
            throw new CError('Segmentation fault (null pointer dereference)', 139);
        throw new CError('Segmentation fault (invalid address 0x' + (address >>> 0).toString(16) + ')', 139);
    };

    Memory.prototype.check = function (address, length) {
        if (typeof address !== 'number' || address < NULL_PAGE || address + length > this.size)
            this.fault(address);
        return address;
    };

    // --- Misaligned access (x86 allows it): through a spare cell in the
    // zero page, which a program cannot reach by itself.

    var SCRATCH = 16;

    Memory.prototype.misaligned = function (address, shift) {
        var size = 1 << shift;
        if (typeof address !== 'number' || address < NULL_PAGE || address + size > this.size)
            this.fault(address);
        this.U8.copyWithin(SCRATCH, address, address + size);
        return SCRATCH >> shift;
    };

    Memory.prototype.storeMisaligned = function (address, shift, view, value) {
        var size = 1 << shift;
        if (typeof address !== 'number' || address < NULL_PAGE || address + size > this.size)
            this.fault(address);
        this[view][SCRATCH >> shift] = value;
        this.U8.copyWithin(address, SCRATCH, SCRATCH + size);
        return value;
    };

    // --- 64-bit values and pointers

    // The address of 8 bytes in 4-byte words: an aligned one as it is,
    // otherwise a copy in the spare cell.
    Memory.prototype.wordAddress = function (address) {
        if (((address - NULL_PAGE | (address & 3) << 30) >>> 0) < this.lim)
            return address;
        return this.misaligned(address, 3) << 3;
    };

    Memory.prototype.load64 = function (address, signed) {
        address = this.wordAddress(address);
        var lo = this.U32[address >> 2] | 0;
        var hi = this.I32[(address >> 2) + 1];
        return signed ? i64.make(hi, lo) : u64.make(hi, lo);
    };

    Memory.prototype.store64 = function (address, value) {
        var target = address;
        address = this.wordAddress(address);
        if (typeof value === 'number') {
            this.U32[address >> 2] = value >>> 0;
            this.I32[(address >> 2) + 1] = Math.floor(value / 4294967296) | 0;
        } else {
            this.I32[address >> 2] = value.lo;
            this.I32[(address >> 2) + 1] = value.hi;
        }
        if (address !== target)
            this.U8.copyWithin(target, SCRATCH, SCRATCH + 8);
        return value;
    };

    // A pointer: 8 bytes, the value is the low 4 (addresses are below 2^32).
    Memory.prototype.loadPointer = function (address) {
        return this.U32[this.wordAddress(address) >> 2];
    };

    Memory.prototype.storePointer = function (address, value) {
        var target = address;
        address = this.wordAddress(address);
        this.U32[address >> 2] = value >>> 0;
        this.U32[(address >> 2) + 1] = 0;
        if (address !== target)
            this.U8.copyWithin(target, SCRATCH, SCRATCH + 8);
        return value;
    };

    // --- Stack

    Memory.prototype.stackOverflow = function () {
        throw new CError('Segmentation fault (stack overflow)', 139);
    };

    // A new stack frame: the address of its start (aligned to 16).
    Memory.prototype.enter = function (frameSize) {
        var frame = (this.sp - frameSize) & ~15;
        if (frame < this.stackLow)
            this.stackOverflow();
        this.sp = frame;
        return frame;
    };

    // --- Heap

    function sizeClass(size) {
        if (size <= 16)
            return 16;
        if (size <= 65536) {
            // Classes in steps of a quarter of a power of two: 16, 20, 24,
            // 28, 32, 40, 48, 56, 64, 80... (rounded up to a multiple of 16).
            var power = 1 << (31 - Math.clz32(size - 1));
            var step = Math.max(16, power >> 2);
            return Math.ceil(size / step) * step;
        }
        return Math.ceil(size / 4096) * 4096;
    }

    Memory.prototype.malloc = function (size) {
        if (typeof size !== 'number')
            size = u64.toFloat(size);
        if (!(size >= 0) || size > MAX_SIZE)
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
            if (end > this.size && !this.grow(end + NULL_PAGE))
                return 0;
            address = this.brk;
            this.brk = end;
        }
        this.allocated.set(address, block);
        return address;
    };

    Memory.prototype.calloc = function (count, size) {
        if (typeof count !== 'number')
            count = u64.toFloat(count);
        if (typeof size !== 'number')
            size = u64.toFloat(size);
        var total = count * size;
        var address = this.malloc(total);
        if (address !== 0)
            this.U8.fill(0, address, address + total);
        return address;
    };

    Memory.prototype.free = function (address) {
        if (address === 0)
            return;
        var block = this.allocated.get(address);
        if (block === undefined) {
            var freed = this.isFree(address);
            throw new CError(freed ? 'free(): double free detected' : 'free(): invalid pointer', 134);
        }
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
    };

    Memory.prototype.isFree = function (address) {
        var found = false;
        this.bins.forEach(function (bin) {
            if (!found && bin.indexOf(address) >= 0)
                found = true;
        });
        return found || this.large.some(function (item) { return item[0] === address; });
    };

    Memory.prototype.realloc = function (address, size) {
        if (typeof size !== 'number')
            size = u64.toFloat(size);
        if (address === 0)
            return this.malloc(size);
        var block = this.allocated.get(address);
        if (block === undefined)
            throw new CError('realloc(): invalid pointer', 134);
        if (size === 0) {
            this.free(address);
            return 0;
        }
        if (size <= block)
            return address;
        var moved = this.malloc(size);
        if (moved === 0)
            return 0;
        this.U8.copyWithin(moved, address, address + block);
        this.free(address);
        return moved;
    };

    // Memory for global variables and strings: zeroed, never freed.
    Memory.prototype.allocateStatic = function (size, align) {
        var address = this.malloc(Math.max(size, 1) + (align > 16 ? align : 0));
        if (address === 0)
            throw new CError('out of memory', 1);
        this.allocated.delete(address);
        if (align > 16)
            address = Math.ceil(address / align) * align;
        this.U8.fill(0, address, address + size);
        return address;
    };

    // --- Strings and blocks

    // A C string (up to the zero) - its bytes as a JavaScript string.
    Memory.prototype.cstring = function (address) {
        if (address === 0)
            throw new CError('Segmentation fault (null pointer dereference)', 139);
        this.check(address, 1);
        var end = this.U8.indexOf(0, address);
        if (end < 0)
            this.fault(this.size);
        return this.bytes(address, end);
    };

    // The bytes [start, end) as a string. V4 ignores the offset of a
    // subarray in apply, hence a plain array.
    Memory.prototype.bytes = function (start, end) {
        var text = '';
        var view = this.U8;
        var chunk = [];
        for (var at = start; at < end; ++at) {
            chunk.push(view[at]);
            if (chunk.length === 4096) {
                text += String.fromCharCode.apply(null, chunk);
                chunk = [];
            }
        }
        return chunk.length > 0 ? text + String.fromCharCode.apply(null, chunk) : text;
    };

    Memory.prototype.text = function (address) {
        return utf8.decode(this.cstring(address));
    };

    Memory.prototype.writeBytes = function (address, bytes, terminate) {
        this.check(address, bytes.length + (terminate ? 1 : 0));
        for (var index = 0; index < bytes.length; ++index)
            this.U8[address + index] = typeof bytes === 'string' ? bytes.charCodeAt(index) : bytes[index];
        if (terminate)
            this.U8[address + bytes.length] = 0;
    };

    // A new C string on the heap (UTF-8 bytes).
    Memory.prototype.newString = function (bytes) {
        var address = this.malloc(bytes.length + 1);
        if (address === 0)
            throw new CError('out of memory', 1);
        this.writeBytes(address, bytes, true);
        return address;
    };

    Memory.prototype.copy = function (target, source, length) {
        if (length <= 0)
            return target;
        this.check(target, length);
        this.check(source, length);
        this.U8.copyWithin(target, source, source + length);
        return target;
    };

    Memory.prototype.fill = function (target, value, length) {
        if (length <= 0)
            return target;
        this.check(target, length);
        this.U8.fill(value & 255, target, target + length);
        return target;
    };

    // --- Functions

    var GENERATOR_FUNCTION = Object.getPrototypeOf(function* () {});

    Memory.prototype.registerFunction = function (name) {
        var index = this.functionNames.indexOf(name);
        if (index < 0) {
            index = this.functionNames.length;
            this.functionNames.push(name);
            var self = this;
            this.define(index, function () { self.undefinedFunction(name); });
        }
        return index;
    };

    // The function under a number: a plain one or a generator (it waits in
    // sleep). Old code, translated when the function was different, calls
    // it through its own table - both tables are always valid.
    Memory.prototype.define = function (index, fn) {
        var self = this;
        if (Object.getPrototypeOf(fn) === GENERATOR_FUNCTION) {
            this.generators[index] = fn;
            this.functions[index] = function () {
                return self.runNested(fn.apply(null, arguments));
            };
        } else {
            this.functions[index] = fn;
            this.generators[index] = function* () {
                return fn.apply(null, arguments);
            };
        }
    };

    Memory.prototype.functionAddress = function (index) {
        return FUNCTION_BASE + index * 16;
    };

    Memory.prototype.functionIndex = function (address) {
        var index = (address - FUNCTION_BASE) / 16;
        if (index >= 0 && index === (index | 0) && index < this.functions.length)
            return index;
        if (address === 0)
            throw new CError('Segmentation fault (call through a null function pointer)', 139);
        throw new CError('Segmentation fault (call through an invalid function pointer)', 139);
    };

    // A function by its address (a function pointer).
    Memory.prototype.callable = function (address) {
        return this.functions[this.functionIndex(address)];
    };

    // The same for a call with yield* from a generator function.
    Memory.prototype.callableAsync = function (address) {
        return this.generators[this.functionIndex(address)];
    };

    Memory.prototype.undefinedFunction = function (name) {
        throw new CError("undefined reference to '" + name + "'", 1);
    };

    C.runtime = {
        Memory: Memory,
        CError: CError,
        CExit: CExit,
        NULL_PAGE: NULL_PAGE,
        FUNCTION_BASE: FUNCTION_BASE,
        // Division by zero is SIGFPE, as on x86.
        divideByZero: function () {
            throw new CError('Floating point exception (integer division by zero)', 136);
        },
        // An integer as an address.
        toAddress: function (value) {
            return typeof value === 'number' ? value : u64.toFloat(u64.fromSigned(value));
        },
        // A list of variable arguments: { v: values, t: kinds }.
        vaStart: function (list) {
            return { v: list.v, t: list.t, i: 0 };
        },
        vaCopy: function (list) {
            return list === null || list === undefined ? null : { v: list.v, t: list.t, i: list.i };
        },
        vaArg: function (list, kind) {
            if (list.i >= list.v.length)
                return 0;
            var value = list.v[list.i];
            var from = list.t[list.i++];
            return C.runtime.convertKind(value, from, kind);
        },
        // Converts a value from one kind to another (for va_arg and natives).
        convertKind: function (value, from, to) {
            if (from === to)
                return value;
            if (to === 'ptr')
                return C.runtime.toAddress(value);
            if (from === 'ptr')
                from = 'u64';
            if (to === 'f64' || to === 'f32') {
                var number = from === 'i64' ? i64.toFloat(value) : (from === 'u64' ? u64.toFloat(value) : value);
                return to === 'f32' ? Math.fround(number) : number;
            }
            if (from === 'f64' || from === 'f32')
                return to === 'i64' ? i64.fromFloat(value) : (to === 'u64' ? u64.fromFloat(value) : T.truncateInt(value));
            if (to === 'i64')
                return from === 'u64' ? i64.fromUnsigned(value) : value;
            if (to === 'u64')
                return from === 'i64' || (typeof value === 'number' && value < 0) ? u64.fromSigned(value) : value;
            var low = typeof value === 'number' ? value | 0 : value.lo;
            switch (to) {
            case 'u32':
                return low >>> 0;
            case 'i16':
                return (low << 16) >> 16;
            case 'u16':
                return low & 65535;
            case 'i8':
                return (low << 24) >> 24;
            case 'u8':
                return low & 255;
            }
            return low;
        }
    };
})(globalThis);
