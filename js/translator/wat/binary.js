// WAT: the WebAssembly 2.0 binary format (.wasm) into the same module tree
// that parser.js gives: (module binary "...") in a script. Errors are
// 'malformed'.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var W = T.wat;
    if (W.decodeBinary)
        return;

    var OPS_BY_CODE = W.OPS_BY_CODE;

    var VALUE_TYPES = { 0x7F: 'i32', 0x7E: 'i64', 0x7D: 'f32', 0x7C: 'f64', 0x70: 'funcref', 0x6F: 'externref' };
    var REF_TYPES = { 0x70: 'funcref', 0x6F: 'externref' };

    function Decoder(bytes, options) {
        this.bytes = bytes;
        this.pos = 0;
        this.end = bytes.length;
        this.source = options.source || '';
        this.line = options.line || 0;
    }

    Decoder.prototype.fail = function (message) {
        throw W.error('malformed', message + ' (at byte 0x' + this.pos.toString(16) + ')', this.line, 0, this.source);
    };

    Decoder.prototype.byte = function () {
        if (this.pos >= this.end)
            this.fail(this.end < this.bytes.length ? 'unexpected end of section or function' : 'unexpected end');
        return this.bytes[this.pos++];
    };

    // An unsigned LEB128, at most ceil(bits / 7) bytes long.
    Decoder.prototype.u32 = function () {
        var result = 0;
        var shift = 0;
        for (var count = 0; ; ++count) {
            var byte = this.byte();
            if (count === 4) {
                if (byte & 0x80)
                    this.fail('integer representation too long');
                if (byte & 0x70)
                    this.fail('integer too large');
            }
            result += (byte & 0x7F) * Math.pow(2, shift);
            shift += 7;
            if (!(byte & 0x80))
                return result;
        }
    };

    // A signed LEB128 of bits (32, 33, 64) -> T.big.
    Decoder.prototype.signed = function (bits) {
        var big = T.big;
        var result = 0;
        var shift = 0;
        var maxBytes = Math.ceil(bits / 7);
        for (var count = 0; ; ++count) {
            var byte = this.byte();
            if (count === maxBytes - 1) {
                if (byte & 0x80)
                    this.fail('integer representation too long');
                // The unused bits of the last byte copy the sign.
                var used = bits - 7 * (maxBytes - 1);
                var rest = byte >> (used - 1) & (0x7F >> (used - 1));
                if (rest !== 0 && rest !== (0x7F >> (used - 1)))
                    this.fail('integer too large');
            }
            result = big.add(result, big.mul(byte & 0x7F, big.pow(2, shift)));
            shift += 7;
            if (!(byte & 0x80)) {
                if (byte & 0x40)
                    result = big.sub(result, big.pow(2, shift));
                return result;
            }
        }
    };

    Decoder.prototype.s32 = function () {
        return T.big.toFloat(this.signed(32)) | 0;
    };

    Decoder.prototype.s64 = function () {
        return T.bigToI64(this.signed(64), true);
    };

    Decoder.prototype.f32 = function () {
        var view = new DataView(new ArrayBuffer(4));
        for (var index = 0; index < 4; ++index)
            view.setUint8(index, this.byte());
        return view.getFloat32(0, true);
    };

    Decoder.prototype.f64 = function () {
        var view = new DataView(new ArrayBuffer(8));
        for (var index = 0; index < 8; ++index)
            view.setUint8(index, this.byte());
        return view.getFloat64(0, true);
    };

    Decoder.prototype.vector = function (read) {
        var count = this.u32();
        var result = [];
        for (var index = 0; index < count; ++index)
            result.push(read.call(this));
        return result;
    };

    Decoder.prototype.name = function () {
        var length = this.u32();
        if (this.pos + length > this.end)
            this.fail('length out of bounds');
        var text = W.decodeUtf8(this.bytes.slice(this.pos, this.pos + length));
        if (text === null)
            this.fail('malformed UTF-8 encoding');
        this.pos += length;
        return text;
    };

    Decoder.prototype.valueType = function () {
        var code = this.byte();
        if (VALUE_TYPES[code] === undefined)
            this.fail(code === 0x7B ? 'SIMD (v128) is not supported' : 'malformed value type');
        return VALUE_TYPES[code];
    };

    Decoder.prototype.refType = function () {
        var code = this.byte();
        if (REF_TYPES[code] === undefined)
            this.fail('malformed reference type');
        return REF_TYPES[code];
    };

    Decoder.prototype.limits = function () {
        var flags = this.byte();
        if (flags > 1)
            this.fail('integer too large');
        var min = this.u32();
        var max = flags === 1 ? this.u32() : null;
        return { min: min, max: max };
    };

    Decoder.prototype.globalType = function () {
        var type = this.valueType();
        var mutability = this.byte();
        if (mutability > 1)
            this.fail('malformed mutability');
        return { type: type, mutable: mutability === 1 };
    };

    // --- Instructions

    Decoder.prototype.blockType = function (module) {
        var code = this.bytes[this.pos];
        if (code === 0x40) {
            ++this.pos;
            return { params: [], results: [], index: null };
        }
        if (VALUE_TYPES[code] !== undefined) {
            ++this.pos;
            return { params: [], results: [VALUE_TYPES[code]], index: null };
        }
        var index = T.big.toFloat(this.signed(33));
        if (index < 0)
            this.fail('malformed block type');
        var type = module.types[index];
        if (type === undefined)
            return { params: [], results: [], index: index, deferred: true };
        return { params: type.params, results: type.results, index: index };
    };

    Decoder.prototype.memarg = function (node) {
        var align = this.u32();
        if (align >= 64)
            this.fail('malformed memop flags');
        if (align >= 32)
            this.fail('multiple memories are not supported');
        node.align = align;
        node.offset = this.u32();
    };

    Decoder.prototype.zero = function () {
        if (this.byte() !== 0)
            this.fail('zero byte expected');
    };

    // Instructions up to end (or else): -> { body, terminator }.
    Decoder.prototype.instructions = function (module, context) {
        var body = [];
        for (;;) {
            var code = this.byte();
            if (code === 0x0B)
                return { body: body, terminator: 'end' };
            if (code === 0x05)
                return { body: body, terminator: 'else' };
            if (code === 0xFC)
                code = 0xFC00 + this.u32();
            var info = OPS_BY_CODE[code];
            if (info === undefined)
                this.fail(code >= 0xFC00 ? 'illegal opcode 0xfc ' + (code - 0xFC00) : 'illegal opcode 0x' + code.toString(16));
            var node = { op: info.name, line: this.line, col: 0 };
            switch (info.imm) {
            case 'block': {
                node.type = this.blockType(module);
                node.label = null;
                var inner = this.instructions(module, context);
                if (info.name === 'if') {
                    node.then = inner.body;
                    node.else = [];
                    if (inner.terminator === 'else') {
                        var other = this.instructions(module, context);
                        if (other.terminator !== 'end')
                            this.fail('END opcode expected');
                        node.else = other.body;
                    }
                } else {
                    if (inner.terminator !== 'end')
                        this.fail('illegal opcode 0x5');
                    node.body = inner.body;
                }
                break;
            }
            case 'label': node.depth = this.u32(); break;
            case 'labels':
                node.depths = this.vector(this.u32);
                node.default = this.u32();
                break;
            case 'func': node.func = this.u32(); break;
            case 'call_indirect':
                node.typeIndex = this.u32();
                node.table = this.u32();
                break;
            case 'select':
                node.types = code === 0x1C ? this.vector(this.valueType) : null;
                break;
            case 'local': node.index = this.u32(); break;
            case 'global': node.index = this.u32(); break;
            case 'table': node.table = this.u32(); break;
            case 'memory': this.zero(); break;
            case 'memory2': this.zero(); this.zero(); break;
            case 'memarg': this.memarg(node); break;
            case 'i32': node.value = this.s32(); break;
            case 'i64': node.value = this.s64(); break;
            case 'f32': node.value = this.f32(); break;
            case 'f64': node.value = this.f64(); break;
            case 'heaptype': node.ref = this.refType(); break;
            case 'data':
                node.data = this.u32();
                if (info.name === 'memory.init')
                    this.zero();
                if (context.dataCount === null)
                    this.fail('data count section required');
                break;
            case 'elem': node.elem = this.u32(); break;
            case 'table_init':
                node.elem = this.u32();
                node.table = this.u32();
                break;
            case 'table_copy':
                node.dst = this.u32();
                node.src = this.u32();
                break;
            case '':
                break;
            default:
                throw new Error('binary immediate ' + info.imm);
            }
            if (code === 0x1C)
                node.op = 'select';
            body.push(node);
        }
    };

    Decoder.prototype.constExpr = function (module, context) {
        var result = this.instructions(module, context);
        if (result.terminator !== 'end')
            this.fail('illegal opcode 0x5');
        return result.body;
    };

    // --- Module

    var SECTION_ORDER = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 12: 10, 10: 11, 11: 12 };

    W.decodeBinary = function (bytes, options) {
        options = options || {};
        var decoder = new Decoder(bytes, options);
        var module = { id: options.id || null, types: [], funcs: [], tables: [], mems: [], globals: [], elems: [], datas: [],
                       imports: [], exports: [], start: null, line: options.line || 0 };
        var line = decoder.line;
        var magic = [0x00, 0x61, 0x73, 0x6D];
        for (var magicIndex = 0; magicIndex < 4; ++magicIndex) {
            if (decoder.pos >= bytes.length || decoder.byte() !== magic[magicIndex])
                decoder.fail('magic header not detected');
        }
        var version = [0x01, 0x00, 0x00, 0x00];
        for (var versionIndex = 0; versionIndex < 4; ++versionIndex) {
            if (decoder.pos >= bytes.length)
                decoder.fail('unknown binary version');
            if (decoder.byte() !== version[versionIndex])
                decoder.fail('unknown binary version');
        }
        var context = { dataCount: null };
        var functionTypes = null;
        var lastOrder = 0;
        var counts = { funcs: 0, tables: 0, mems: 0, globals: 0 };
        while (decoder.pos < bytes.length) {
            var id = decoder.byte();
            if (id > 12)
                decoder.fail('malformed section id');
            var size = decoder.u32();
            var start = decoder.pos;
            if (start + size > bytes.length)
                decoder.fail('length out of bounds');
            decoder.end = start + size;
            if (id !== 0) {
                var order = SECTION_ORDER[id];
                if (order <= lastOrder)
                    decoder.fail('unexpected content after last section');
                lastOrder = order;
            }
            switch (id) {
            case 0:
                decoder.name();
                decoder.pos = decoder.end;
                break;
            case 1:
                module.types = decoder.vector(function () {
                    if (this.byte() !== 0x60)
                        this.fail('integer representation too long');
                    return { params: this.vector(this.valueType), results: this.vector(this.valueType) };
                });
                break;
            case 2:
                decoder.vector(function () {
                    var entry = { module: this.name(), name: this.name(), line: line };
                    var kind = this.byte();
                    switch (kind) {
                    case 0:
                        entry.kind = 'func';
                        entry.index = counts.funcs++;
                        module.funcs[entry.index] = { typeIndex: this.u32(), import: entry, line: line, name: null };
                        break;
                    case 1:
                        entry.kind = 'table';
                        entry.index = counts.tables++;
                        var ref = this.refType();
                        var limits = this.limits();
                        limits.ref = ref;
                        module.tables[entry.index] = { type: limits, import: entry, line: line };
                        break;
                    case 2:
                        entry.kind = 'memory';
                        entry.index = counts.mems++;
                        module.mems[entry.index] = { type: this.limits(), import: entry, line: line };
                        break;
                    case 3:
                        entry.kind = 'global';
                        entry.index = counts.globals++;
                        module.globals[entry.index] = { type: this.globalType(), import: entry, line: line };
                        break;
                    default:
                        this.fail('malformed import kind');
                    }
                    module.imports.push(entry);
                });
                break;
            case 3:
                functionTypes = decoder.vector(decoder.u32);
                break;
            case 4:
                decoder.vector(function () {
                    var ref = this.refType();
                    var limits = this.limits();
                    limits.ref = ref;
                    module.tables[counts.tables++] = { type: limits, import: null, line: line };
                });
                break;
            case 5:
                decoder.vector(function () {
                    module.mems[counts.mems++] = { type: this.limits(), import: null, line: line };
                });
                break;
            case 6:
                decoder.vector(function () {
                    var type = this.globalType();
                    module.globals[counts.globals++] = { type: type, import: null, init: this.constExpr(module, context), line: line };
                });
                break;
            case 7:
                decoder.vector(function () {
                    var name = this.name();
                    var kind = this.byte();
                    if (kind > 3)
                        this.fail('malformed export kind');
                    module.exports.push({ name: name, kind: ['func', 'table', 'memory', 'global'][kind], index: this.u32(), line: line });
                });
                break;
            case 8:
                module.start = { index: decoder.u32(), line: line };
                break;
            case 9:
                module.elems = decoder.vector(function () {
                    return this.elemSegment(module, context);
                });
                break;
            case 12:
                context.dataCount = decoder.u32();
                break;
            case 10: {
                var bodies = decoder.vector(function () {
                    var bodySize = this.u32();
                    var bodyEnd = this.pos + bodySize;
                    if (bodyEnd > this.end)
                        this.fail('length out of bounds');
                    var sectionEnd = this.end;
                    this.end = bodyEnd;
                    var locals = [];
                    var total = 0;
                    var groups = this.vector(function () {
                        var count = this.u32();
                        return [count, this.valueType()];
                    });
                    groups.forEach(function (group) {
                        total += group[0];
                    });
                    if (total > 50000)
                        this.fail('too many locals');
                    groups.forEach(function (group) {
                        for (var repeat = 0; repeat < group[0]; ++repeat)
                            locals.push(group[1]);
                    });
                    var body = this.instructions(module, context);
                    if (body.terminator !== 'end')
                        this.fail('illegal opcode 0x5');
                    if (this.pos !== bodyEnd)
                        this.fail('section size mismatch');
                    this.end = sectionEnd;
                    return { locals: locals, body: body.body };
                });
                if (functionTypes === null)
                    functionTypes = [];
                if (bodies.length !== functionTypes.length)
                    decoder.fail('function and code section have inconsistent lengths');
                bodies.forEach(function (body, index) {
                    module.funcs[counts.funcs++] = { typeIndex: functionTypes[index], import: null, locals: body.locals,
                                                     body: body.body, line: line, name: null };
                });
                functionTypes = [];
                break;
            }
            case 11:
                module.datas = decoder.vector(function () {
                    var flags = this.u32();
                    var segment = { mode: 'passive', memory: 0, offset: null, bytes: null, line: line };
                    if (flags === 0 || flags === 2) {
                        segment.mode = 'active';
                        if (flags === 2)
                            segment.memory = this.u32();
                        segment.offset = this.constExpr(module, context);
                    } else if (flags !== 1) {
                        this.fail('malformed data segment kind');
                    }
                    var length = this.u32();
                    if (this.pos + length > this.end)
                        this.fail('unexpected end of section or function');
                    segment.bytes = this.bytes.slice(this.pos, this.pos + length);
                    this.pos += length;
                    return segment;
                });
                if (context.dataCount !== null && context.dataCount !== module.datas.length)
                    decoder.fail('data count and data section have inconsistent lengths');
                break;
            }
            if (decoder.pos !== decoder.end)
                decoder.fail('section size mismatch');
            decoder.end = bytes.length;
        }
        if (functionTypes !== null && functionTypes.length > 0)
            decoder.fail('function and code section have inconsistent lengths');
        if (context.dataCount !== null && context.dataCount !== module.datas.length)
            decoder.fail('data count and data section have inconsistent lengths');
        return module;
    };

    Decoder.prototype.elemSegment = function (module, context) {
        var flags = this.u32();
        if (flags > 7)
            this.fail('malformed elements segment kind');
        var segment = { mode: 'passive', table: 0, offset: null, type: 'funcref', init: [], line: this.line };
        var passiveOrDeclarative = (flags & 1) !== 0;
        var explicitTable = (flags & 2) !== 0;
        var expressions = (flags & 4) !== 0;
        if (!passiveOrDeclarative) {
            segment.mode = 'active';
            if (explicitTable)
                segment.table = this.u32();
            segment.offset = this.constExpr(module, context);
        } else {
            segment.mode = explicitTable ? 'declarative' : 'passive';
        }
        var line = this.line;
        if (passiveOrDeclarative || explicitTable) {
            if (expressions)
                segment.type = this.refType();
            else if (this.byte() !== 0x00)
                this.fail('malformed element kind');
        }
        if (expressions) {
            segment.init = this.vector(function () {
                return this.constExpr(module, context);
            });
        } else {
            segment.init = this.vector(function () {
                return [{ op: 'ref.func', func: this.u32(), line: line }];
            });
        }
        return segment;
    };
})(globalThis);
