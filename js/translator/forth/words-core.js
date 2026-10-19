// Forth: words that translate right into the code of a definition -
// arithmetic, the stack, memory, number output, double and float numbers.
// Each one is described by its translation (prim); executing such a word
// with the interpreter translates a definition of this one word
// (System.prepare).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Forth = T.forth;
    if (Forth.coreWords)
        return;

    var J = T.J;
    var layout = Forth.layout;
    var cells = Forth.cells;
    var ForthError = Forth.ForthError;
    var i64 = T.i64, u64 = T.u64, big = T.big;
    var System = Forth.System;
    var EMPTY = Forth.STACK_EMPTY;
    var MAX = i64.MAX_SAFE;
    var TWO64 = cells.TWO64;

    // --- Word descriptions

    // A word with a translation: effect - [cells in, out, floats in, out];
    // gen(lowering, inputs...) returns the outputs (expressions or stack elements).
    // fold - evaluation at translation when all inputs are known numbers.
    function prim(system, name, effect, gen, fold, options) {
        var word = new Forth.Word(system, name, 'prim');
        word.prim = {
            lower: function (lowering) {
                lowerEffect(lowering, effect, gen, fold, options || {});
            }
        };
        system.forth.add(word);
        return word;
    }

    function lowerEffect(lowering, effect, gen, fold, options) {
        var cellsIn = effect[0], cellsOut = effect[1];
        var floatsIn = effect[2] || 0, floatsOut = effect[3] || 0;
        var floats = [];
        for (var floatIndex = 0; floatIndex < floatsIn; ++floatIndex)
            floats.unshift(lowering.popFloat());
        var inputs = [];
        for (var cellIndex = 0; cellIndex < cellsIn; ++cellIndex)
            inputs.unshift(lowering.popData());
        if (fold && floatsIn === 0 && inputs.every(function (item) { return item.lit !== undefined; })) {
            var folded = fold.apply(null, inputs.map(function (item) { return item.lit; }));
            if (folded !== null) {
                folded.forEach(function (value) { lowering.pushData(lowering.literal(value)); });
                return;
            }
        }
        var args = [lowering];
        inputs.forEach(function (item) { args.push(options.items ? item : lowering.cell(item)); });
        floats.forEach(function (item) { args.push(item.e); });
        var outputs = gen.apply(null, args) || [];
        for (var outputIndex = 0; outputIndex < outputs.length; ++outputIndex) {
            var output = outputs[outputIndex];
            var item = output.e !== undefined ? output : lowering.value(output);
            if (outputIndex < cellsOut)
                lowering.pushData(item);
            else
                lowering.pushFloat(item);
        }
    }

    // A word the translator expands itself (stack shuffles).
    function custom(system, name, lower, options) {
        var word = new Forth.Word(system, name, 'prim');
        word.prim = { lower: lower, dynamic: !!(options && options.dynamic) };
        if (options && options.compileOnly)
            word.compileOnly = true;
        system.forth.add(word);
        return word;
    }

    // A word that works with the real stack: $F[helper](sp) -> sp.
    function stackWord(system, name, helper) {
        var word = custom(system, name, function (lowering) { lowering.stackHelper(helper); });
        word.fn = function (sp) { return system[helper](sp); };
        return word;
    }

    function constant(system, name, value) {
        var word = system.define(name, 'constant');
        word.value = value;
        word.fn = function (sp) {
            system.S[++sp] = value;
            return sp;
        };
        return word;
    }

    Forth.prim = prim;
    Forth.customWord = custom;
    Forth.stackWord = stackWord;
    Forth.constantWord = constant;

    function call(lowering, name, args) {
        return J.call(lowering.helper(name), args);
    }

    function emitCall(lowering, name, args) {
        lowering.emitExpr(call(lowering, name, args));
    }

    function memoryCall(lowering, name, args) {
        return lowering.memory(name, args);
    }

    function isNumber(node) {
        return J.bin('===', J.un('typeof', node), J.str('number'));
    }

    function floorDiv(dividend, divisor) {
        return Math.floor(dividend / divisor) + 0;
    }

    function floorMod(dividend, divisor) {
        var remainder = dividend % divisor;
        if (remainder !== 0 && (remainder < 0) !== (divisor < 0))
            remainder += divisor;
        return remainder + 0;
    }

    // --- Helpers of the translated code

    // Division rounding down (as in gforth): the quotient, the remainder in x.
    System.prototype.divmod = function (dividend, divisor) {
        if (typeof divisor === 'number' && divisor === 0)
            throw new ForthError(-10);
        if (typeof dividend === 'number' && typeof divisor === 'number') {
            var quotient = Math.floor(dividend / divisor) + 0;
            this.x = dividend - quotient * divisor;
            if (quotient <= MAX && quotient >= -MAX)
                return quotient;
        }
        var bigDividend = cells.toBig(dividend), bigDivisor = cells.toBig(divisor);
        this.x = cells.fromBig(big.mod(bigDividend, bigDivisor));
        return cells.fromBig(big.div(bigDividend, bigDivisor));
    };

    System.prototype.div = function (dividend, divisor) {
        return this.divmod(dividend, divisor);
    };

    System.prototype.mod = function (dividend, divisor) {
        this.divmod(dividend, divisor);
        return this.x;
    };

    System.prototype.abs = function (value) {
        if (typeof value === 'number')
            return Math.abs(value);
        return i64.lt(value, 0) ? i64.neg(value) : value;
    };

    System.prototype.lshift = function (value, count) {
        count = this.number(count);
        if (count < 0 || count >= 64)
            return 0;
        if (typeof value === 'number' && count < 53) {
            var shifted = value * Math.pow(2, count);
            if (shifted >= -MAX && shifted <= MAX)
                return shifted;
        }
        return i64.shl(value, count);
    };

    System.prototype.rshift = function (value, count) {
        count = this.number(count);
        if (count < 0 || count >= 64)
            return 0;
        if (typeof value === 'number' && value >= 0)
            return Math.floor(value / Math.pow(2, count));
        return u64.shr(u64.fromSigned(value), count) === 0
            ? 0
            : i64.fromUnsigned(u64.shr(u64.fromSigned(value), count));
    };

    System.prototype.arshift = function (value, count) {
        count = this.number(count);
        if (typeof value === 'number' && count < 64)
            return Math.floor(value / Math.pow(2, count));
        return i64.shr(value, Math.min(count, 64));
    };

    System.prototype.ult = function (left, right) {
        if (typeof left === 'number' && typeof right === 'number' && left >= 0 && right >= 0)
            return left < right;
        return u64.lt(u64.fromSigned(left), u64.fromSigned(right));
    };

    // WITHIN: (value - lo) U< (hi - lo).
    System.prototype.within = function (value, lo, hi) {
        return this.ult(i64.sub(value, lo), i64.sub(hi, lo));
    };

    System.prototype.aligned = function (address, size) {
        address = this.number(address);
        return Math.ceil(address / size) * size;
    };

    System.prototype.dot = function (value) {
        this.write(this.formatSigned(value) + ' ');
    };

    System.prototype.udot = function (value) {
        this.write(this.formatUnsigned(value) + ' ');
    };

    System.prototype.dotR = function (value, width) {
        this.writeRight(this.formatSigned(value), width);
    };

    System.prototype.udotR = function (value, width) {
        this.writeRight(this.formatUnsigned(value), width);
    };

    System.prototype.fdot = function (value) {
        this.write(Forth.floats.fixed(value, this.precision()) + ' ');
    };

    System.prototype.fsdot = function (value) {
        this.write(Forth.floats.exponential(value, this.precision(), false) + ' ');
    };

    System.prototype.fedot = function (value) {
        this.write(Forth.floats.exponential(value, this.precision(), true) + ' ');
    };

    System.prototype.cr = function () {
        this.write('\n');
    };

    System.prototype.writeBytes = function (bytes) {
        this.write(bytes);
    };

    System.prototype.addStore = function (address, value) {
        var old = this.m.cell(address);
        var sum = typeof old === 'number' && typeof value === 'number' ? old + value : NaN;
        this.m.setCell(address, sum <= MAX && sum >= -MAX ? sum : i64.add(old, value));
    };

    System.prototype.move = function (from, to, count) {
        this.m.copy(this.number(to), this.number(from), this.number(count));
    };

    // CMOVE: byte by byte from the start (an overlap repeats bytes).
    System.prototype.cmove = function (from, to, count) {
        from = this.number(from);
        to = this.number(to);
        count = this.number(count);
        if (count <= 0)
            return;
        this.m.check(from, count);
        this.m.check(to, count);
        var U8 = this.m.U8;
        for (var index = 0; index < count; ++index)
            U8[to + index] = U8[from + index];
    };

    System.prototype.cmoveUp = function (from, to, count) {
        from = this.number(from);
        to = this.number(to);
        count = this.number(count);
        if (count <= 0)
            return;
        this.m.check(from, count);
        this.m.check(to, count);
        var U8 = this.m.U8;
        for (var index = count - 1; index >= 0; --index)
            U8[to + index] = U8[from + index];
    };

    System.prototype.fill = function (address, count, value) {
        this.m.fill(this.number(address), this.number(count), this.number(value));
    };

    System.prototype.qdup = function (sp) {
        var top = this.S[sp];
        if (top !== 0)
            this.S[++sp] = top;
        return sp;
    };

    System.prototype.pick = function (sp) {
        var depth = this.number(this.S[sp]);
        if (depth < 0 || sp - 1 - depth <= EMPTY - Forth.STACK_GUARD)
            throw new ForthError(-4);
        this.S[sp] = this.S[sp - 1 - depth];
        return sp;
    };

    System.prototype.roll = function (sp) {
        var depth = this.number(this.S[sp--]);
        if (depth < 0 || sp - depth <= EMPTY - Forth.STACK_GUARD)
            throw new ForthError(-4);
        var stack = this.S;
        var item = stack[sp - depth];
        for (var index = sp - depth; index < sp; ++index)
            stack[index] = stack[index + 1];
        stack[sp] = item;
        return sp;
    };

    System.prototype.fpick = function (sp) {
        var depth = this.number(this.S[sp--]);
        if (depth < 0)
            throw new ForthError(-4);
        var value = this.FS[this.fp - depth];
        this.FS[++this.fp] = value;
        return sp;
    };

    // --- Double numbers: from the stack and to it

    System.prototype.double = function (sp) {
        return cells.doubleToBig(this.S[sp - 1], this.S[sp]);
    };

    System.prototype.unsignedDouble = function (sp) {
        return cells.unsignedDoubleToBig(this.S[sp - 1], this.S[sp]);
    };

    System.prototype.putDouble = function (sp, value) {
        var pair = cells.bigToDouble(value);
        this.S[sp - 1] = pair[0];
        this.S[sp] = pair[1];
    };

    function reduce128(value) {
        // Modulo 2^128, signed.
        var modulus = big.mul(TWO64, TWO64);
        var reduced = big.mod(value, modulus);
        if (big.cmp(reduced, big.div(modulus, 2)) >= 0)
            reduced = big.sub(reduced, modulus);
        return reduced;
    }

    System.prototype.dplus = function (sp) {
        var right = this.double(sp);
        var left = this.double(sp - 2);
        this.putDouble(sp - 2, reduce128(big.add(left, right)));
        return sp - 2;
    };

    System.prototype.dminus = function (sp) {
        var right = this.double(sp);
        var left = this.double(sp - 2);
        this.putDouble(sp - 2, reduce128(big.sub(left, right)));
        return sp - 2;
    };

    System.prototype.dnegate = function (sp) {
        this.putDouble(sp, reduce128(big.neg(this.double(sp))));
        return sp;
    };

    System.prototype.dabs = function (sp) {
        var value = this.double(sp);
        if (big.sign(value) < 0)
            this.putDouble(sp, reduce128(big.neg(value)));
        return sp;
    };

    System.prototype.d2star = function (sp) {
        this.putDouble(sp, reduce128(big.mul(this.double(sp), 2)));
        return sp;
    };

    System.prototype.d2slash = function (sp) {
        this.putDouble(sp, big.div(this.double(sp), 2));
        return sp;
    };

    System.prototype.dcompare = function (sp, kind) {
        var right, left, result;
        if (kind === 'u<') {
            right = this.unsignedDouble(sp);
            left = this.unsignedDouble(sp - 2);
            result = big.cmp(left, right) < 0;
        } else {
            right = this.double(sp);
            left = this.double(sp - 2);
            var order = big.cmp(left, right);
            result = kind === '=' ? order === 0 : (kind === '<' ? order < 0 : order > 0);
        }
        sp -= 3;
        this.S[sp] = result ? -1 : 0;
        return sp;
    };

    System.prototype.dless = function (sp) { return this.dcompare(sp, '<'); };
    System.prototype.dequal = function (sp) { return this.dcompare(sp, '='); };
    System.prototype.dgreater = function (sp) { return this.dcompare(sp, '>'); };
    System.prototype.duless = function (sp) { return this.dcompare(sp, 'u<'); };

    System.prototype.dzeroEqual = function (sp) {
        var value = this.double(sp);
        this.S[--sp] = big.sign(value) === 0 ? -1 : 0;
        return sp;
    };

    System.prototype.dzeroLess = function (sp) {
        var hi = this.S[sp];
        this.S[--sp] = i64.lt(hi, 0) ? -1 : 0;
        return sp;
    };

    System.prototype.dmax = function (sp) {
        var right = this.double(sp), left = this.double(sp - 2);
        if (big.cmp(right, left) > 0)
            this.putDouble(sp - 2, right);
        return sp - 2;
    };

    System.prototype.dmin = function (sp) {
        var right = this.double(sp), left = this.double(sp - 2);
        if (big.cmp(right, left) < 0)
            this.putDouble(sp - 2, right);
        return sp - 2;
    };

    // M+ ( d n -- d' )
    System.prototype.mplus = function (sp) {
        var addend = cells.toBig(this.S[sp]);
        var value = this.double(sp - 1);
        this.putDouble(sp - 1, reduce128(big.add(value, addend)));
        return sp - 1;
    };

    // M* ( n1 n2 -- d )
    System.prototype.mstar = function (sp) {
        var left = this.S[sp - 1], right = this.S[sp];
        if (typeof left === 'number' && typeof right === 'number') {
            var product = left * right;
            if (product >= -MAX && product <= MAX) {
                this.S[sp - 1] = product + 0;
                this.S[sp] = product < 0 ? -1 : 0;
                return sp;
            }
        }
        this.putDouble(sp, big.mul(cells.toBig(left), cells.toBig(right)));
        return sp;
    };

    // UM* ( u1 u2 -- ud )
    System.prototype.umstar = function (sp) {
        var left = this.S[sp - 1], right = this.S[sp];
        if (typeof left === 'number' && typeof right === 'number' && left >= 0 && right >= 0) {
            var product = left * right;
            if (product <= MAX) {
                this.S[sp - 1] = product;
                this.S[sp] = 0;
                return sp;
            }
        }
        var value = big.mul(cells.toUnsignedBig(left), cells.toUnsignedBig(right));
        this.S[sp - 1] = T.bigToI64(value, true);
        this.S[sp] = T.bigToI64(big.div(value, TWO64), true);
        return sp;
    };

    function checkQuotient(value, unsigned) {
        var limit = unsigned ? TWO64 : big.div(TWO64, 2);
        if (big.cmp(value, limit) >= 0 || (!unsigned && big.cmp(value, big.neg(limit)) < 0) ||
            (unsigned && big.sign(value) < 0))
            throw new ForthError(-11);
        return value;
    }

    // UM/MOD ( ud u -- urem uquot )
    System.prototype.ummod = function (sp) {
        var divisor = cells.toUnsignedBig(this.S[sp]);
        if (big.sign(divisor) === 0)
            throw new ForthError(-10);
        var dividend = cells.unsignedDoubleToBig(this.S[sp - 2], this.S[sp - 1]);
        var quotient = checkQuotient(big.quot(dividend, divisor), true);
        this.S[sp - 2] = T.bigToI64(big.rem(dividend, divisor), true);
        this.S[sp - 1] = T.bigToI64(quotient, true);
        return sp - 1;
    };

    // FM/MOD and SM/REM ( d n -- rem quot )
    System.prototype.divideDouble = function (sp, floored) {
        var divisor = cells.toBig(this.S[sp]);
        if (big.sign(divisor) === 0)
            throw new ForthError(-10);
        var dividend = this.double(sp - 1);
        var quotient = floored ? big.div(dividend, divisor) : big.quot(dividend, divisor);
        var remainder = floored ? big.mod(dividend, divisor) : big.rem(dividend, divisor);
        checkQuotient(quotient, false);
        this.S[sp - 2] = cells.fromBig(remainder);
        this.S[sp - 1] = cells.fromBig(quotient);
        return sp - 1;
    };

    System.prototype.fmmod = function (sp) { return this.divideDouble(sp, true); };
    System.prototype.smrem = function (sp) { return this.divideDouble(sp, false); };

    // */ and */MOD: a double precision product, division rounding down.
    System.prototype.starSlashMod = function (multiplicand, multiplier, divisor) {
        if (typeof divisor === 'number' && divisor === 0)
            throw new ForthError(-10);
        if (typeof multiplicand === 'number' && typeof multiplier === 'number' && typeof divisor === 'number') {
            var product = multiplicand * multiplier;
            if (product >= -MAX && product <= MAX)
                return this.divmod(product, divisor);
        }
        var bigProduct = big.mul(cells.toBig(multiplicand), cells.toBig(multiplier));
        var bigDivisor = cells.toBig(divisor);
        var quotient = checkQuotient(big.div(bigProduct, bigDivisor), false);
        this.x = cells.fromBig(big.mod(bigProduct, bigDivisor));
        return cells.fromBig(quotient);
    };

    // M*/ ( d1 n1 +n2 -- d2 ): d1 * n1 / n2 with triple precision.
    System.prototype.mstarslash = function (sp) {
        var divisor = cells.toBig(this.S[sp]);
        if (big.sign(divisor) === 0)
            throw new ForthError(-10);
        var factor = cells.toBig(this.S[sp - 1]);
        var value = this.double(sp - 2);
        this.putDouble(sp - 2, reduce128(big.div(big.mul(value, factor), divisor)));
        return sp - 2;
    };

    // --- Pictured number output (<# # #>)

    System.prototype.hold = function (code) {
        if (this.hld <= layout.HOLD_START)
            throw new ForthError(-17);
        this.m.U8[--this.hld] = this.number(code) & 255;
    };

    System.prototype.holds = function (address, length) {
        var bytes = this.text(address, length);
        for (var index = bytes.length - 1; index >= 0; --index)
            this.hold(bytes.charCodeAt(index));
    };

    function digitChar(digit) {
        return digit < 10 ? 48 + digit : 55 + digit;
    }

    // # ( ud -- ud' )
    System.prototype.sharp = function (sp) {
        var base = this.base();
        var lo = this.S[sp - 1], hi = this.S[sp];
        if (hi === 0 && typeof lo === 'number' && lo >= 0) {
            this.hold(digitChar(lo % base));
            this.S[sp - 1] = Math.floor(lo / base);
            return sp;
        }
        var value = cells.unsignedDoubleToBig(lo, hi);
        this.hold(digitChar(this.number(big.rem(value, base))));
        var rest = big.quot(value, base);
        this.S[sp - 1] = T.bigToI64(rest, true);
        this.S[sp] = T.bigToI64(big.quot(rest, TWO64), true);
        return sp;
    };

    System.prototype.sharpS = function (sp) {
        do {
            sp = this.sharp(sp);
        } while (this.S[sp] !== 0 || this.S[sp - 1] !== 0);
        return sp;
    };

    // #> ( xd -- c-addr u )
    System.prototype.sharpGreater = function (sp) {
        this.S[sp - 1] = this.hld;
        this.S[sp] = layout.HOLD_END - this.hld;
        return sp;
    };

    // >NUMBER ( ud1 c-addr1 u1 -- ud2 c-addr2 u2 )
    System.prototype.toNumber = function (sp) {
        var base = this.base();
        var address = this.number(this.S[sp - 1]);
        var length = this.number(this.S[sp]);
        var value = cells.unsignedDoubleToBig(this.S[sp - 3], this.S[sp - 2]);
        while (length > 0) {
            var digit = Forth.digitValue(this.m.byte(address));
            if (digit >= base)
                break;
            value = big.add(big.mul(value, base), digit);
            ++address;
            --length;
        }
        var pair = cells.bigToDouble(reduce128(value));
        this.S[sp - 3] = pair[0];
        this.S[sp - 2] = pair[1];
        this.S[sp - 1] = address;
        this.S[sp] = length;
        return sp;
    };

    // >FLOAT ( c-addr u -- flag ) ( F: -- r | )
    System.prototype.toFloat = function (address, length) {
        var text = this.text(address, length).replace(/^\s+|\s+$/g, '');
        if (text.length === 0) {
            this.FS[++this.fp] = 0;
            return true;
        }
        var match = /^([+-]?)([0-9]*)(\.[0-9]*)?(?:([eEdD])([+-]?[0-9]*))?$/.exec(text);
        if (match === null || (match[2].length === 0 && (match[3] === undefined || match[3].length <= 1)))
            return false;
        var number = Number(match[1] + (match[2] || '0') + (match[3] || '') + 'e' + (match[5] || '0').replace(/^([+-]?)$/, '$10'));
        if (number !== number)
            return false;
        this.FS[++this.fp] = number;
        return true;
    };

    // REPRESENT ( c-addr u -- n flag1 flag2 ) ( F: r -- )
    System.prototype.represent = function (sp) {
        var value = this.FS[this.fp--];
        var address = this.number(this.S[sp - 1]);
        var length = this.number(this.S[sp]);
        var special = Forth.floats.special(value);
        if (special !== null) {
            this.m.writeBytes(address, special.substring(0, length));
            this.S[sp - 1] = 0;
            this.S[sp] = value < 0 ? -1 : 0;
            this.S[++sp] = 0;
            return sp;
        }
        var representation = Forth.floats.represent(value, Math.max(1, length));
        this.m.writeBytes(address, representation.digits.substring(0, length));
        this.S[sp - 1] = value === 0 ? 1 : representation.exponent;
        this.S[sp] = representation.negative ? -1 : 0;
        this.S[++sp] = -1;
        return sp;
    };

    System.prototype.fround = function (value) {
        var floor = Math.floor(value);
        var difference = value - floor;
        if (difference > 0.5)
            return floor + 1;
        if (difference < 0.5)
            return floor;
        return floor % 2 === 0 ? floor : floor + 1;
    };

    // F>D and F>S: dropping the fraction.
    System.prototype.floatToCell = function (value) {
        if (!isFinite(value))
            throw new ForthError(-11);
        return i64.fromFloat(value);
    };

    System.prototype.floatToDouble = function (sp) {
        var value = this.FS[this.fp--];
        if (!isFinite(value))
            throw new ForthError(-11);
        var pair = cells.bigToDouble(big.fromFloat(Math.trunc(value)));
        this.S[++sp] = pair[0];
        this.S[++sp] = pair[1];
        return sp;
    };

    System.prototype.doubleToFloat = function (sp) {
        this.FS[++this.fp] = big.toFloat(this.double(sp));
        return sp - 2;
    };

    System.prototype.cellToFloat = function (value) {
        return i64.toFloat(value);
    };

    System.prototype.fequal = function (left, right, tolerance) {
        if (tolerance > 0)
            return Math.abs(left - right) < tolerance;
        if (tolerance === 0)
            return left === right && (left !== 0 || 1 / left === 1 / right);
        return Math.abs(left - right) < -tolerance * (Math.abs(left) + Math.abs(right));
    };

    System.prototype.dotS = function (sp) {
        var saved = this.sp;
        this.sp = sp;
        this.write(this.describeStack() + ' ');
        this.sp = saved;
        return sp;
    };

    System.prototype.fdotS = function (sp) {
        this.write(this.describeFloats() + ' ');
        return sp;
    };

    System.prototype.fdepth = function (sp) {
        this.S[++sp] = this.fp - EMPTY;
        return sp;
    };

    System.prototype.clearStack = function () {
        return EMPTY;
    };

    System.prototype.fclearStack = function (sp) {
        this.fp = EMPTY;
        return sp;
    };

    // --- Installation

    Forth.installCoreWords = function (system) {
        var primitive = function (name, effect, gen, fold, options) {
            return prim(system, name, effect, gen, fold, options);
        };
        var shuffle = function (name, inputs, outputs) {
            // outputs - the numbers of the inputs (0 - the lowest). Cells of
            // the real stack that are not needed (DROP) are not read.
            return custom(system, name, function (lowering) {
                var stack = lowering.data;
                var virtual = Math.min(inputs, stack.items.length);
                var items = stack.items.splice(stack.items.length - virtual, virtual);
                for (var position = inputs - virtual - 1; position >= 0; --position)
                    items.unshift(outputs.indexOf(position) >= 0 ? lowering.pop(stack) : lowering.skip(stack));
                outputs.forEach(function (index) { lowering.pushData(items[index]); });
            });
        };
        var fshuffle = function (name, inputs, outputs) {
            return custom(system, name, function (lowering) {
                var items = [];
                for (var position = 0; position < inputs; ++position)
                    items.unshift(lowering.popFloat());
                outputs.forEach(function (index) { lowering.pushFloat(items[index]); });
            });
        };
        var flag = function (test) {
            return function (lowering) {
                var args = Array.prototype.slice.call(arguments, 1);
                return [lowering.flag(test.apply(null, [lowering].concat(args)))];
            };
        };
        var flagFold = function (test) {
            return function () { return [test.apply(null, arguments) ? -1 : 0]; };
        };

        // Arithmetic
        primitive('+', [2, 1], function (lowering, left, right) { return [lowering.i64('+', left, right)]; },
            function (left, right) { return [i64.add(left, right)]; });
        primitive('-', [2, 1], function (lowering, left, right) { return [lowering.i64('-', left, right)]; },
            function (left, right) { return [i64.sub(left, right)]; });
        primitive('*', [2, 1], function (lowering, left, right) { return [lowering.i64('*', left, right)]; },
            function (left, right) { return [i64.mul(left, right)]; });
        primitive('/', [2, 1], function (lowering, left, right) {
            if (right.k === 'num' && right.value > 0)
                return [J.cond(isNumber(left),
                               J.bin('+', J.call(J.path('Math.floor'), [J.bin('/', left, right)]), J.num(0)),
                               call(lowering, 'div', [left, right]))];
            return [call(lowering, 'div', [left, right])];
        }, function (left, right) {
            return typeof left === 'number' && typeof right === 'number' && right !== 0
                ? [floorDiv(left, right)]
                : null;
        });
        primitive('MOD', [2, 1], function (lowering, left, right) {
            if (right.k === 'num' && right.value > 0)
                return [J.cond(isNumber(left),
                               J.bin('+', J.bin('%', J.bin('+', J.bin('%', left, right), right), right), J.num(0)),
                               call(lowering, 'mod', [left, right]))];
            return [call(lowering, 'mod', [left, right])];
        }, function (left, right) {
            return typeof left === 'number' && typeof right === 'number' && right !== 0
                ? [floorMod(left, right)]
                : null;
        });
        primitive('/MOD', [2, 2], function (lowering, left, right) {
            var quotient = lowering.value(call(lowering, 'divmod', [left, right]));
            return [lowering.value(lowering.helper('x')), quotient];
        });
        primitive('*/', [3, 1], function (lowering, multiplicand, multiplier, divisor) {
            return [call(lowering, 'starSlashMod', [multiplicand, multiplier, divisor])];
        });
        primitive('*/MOD', [3, 2], function (lowering, multiplicand, multiplier, divisor) {
            var quotient = lowering.value(call(lowering, 'starSlashMod', [multiplicand, multiplier, divisor]));
            return [lowering.value(lowering.helper('x')), quotient];
        });
        primitive('NEGATE', [1, 1], function (lowering, value) { return [lowering.i64Unary('-', value)]; },
            function (value) { return [i64.neg(value)]; });
        primitive('ABS', [1, 1], function (lowering, value) {
            return [J.cond(isNumber(value), J.call(J.path('Math.abs'), [value]), call(lowering, 'abs', [value]))];
        });
        primitive('1+', [1, 1], function (lowering, value) { return [lowering.i64('+', value, J.num(1))]; },
            function (value) { return [i64.add(value, 1)]; });
        primitive('1-', [1, 1], function (lowering, value) { return [lowering.i64('-', value, J.num(1))]; },
            function (value) { return [i64.sub(value, 1)]; });
        primitive('2*', [1, 1], function (lowering, value) { return [lowering.i64('+', value, value)]; },
            function (value) { return [i64.add(value, value)]; });
        primitive('2/', [1, 1], function (lowering, value) {
            return [J.cond(isNumber(value), J.call(J.path('Math.floor'), [J.bin('/', value, J.num(2))]),
                           call(lowering, 'arshift', [value, J.num(1)]))];
        });
        primitive('LSHIFT', [2, 1], function (lowering, value, count) {
            return [call(lowering, 'lshift', [value, count])];
        });
        primitive('RSHIFT', [2, 1], function (lowering, value, count) {
            return [call(lowering, 'rshift', [value, count])];
        });
        primitive('AND', [2, 1], function (lowering, left, right) { return [lowering.i64('&', left, right)]; },
            function (left, right) { return [i64.and(left, right)]; });
        primitive('OR', [2, 1], function (lowering, left, right) { return [lowering.i64('|', left, right)]; },
            function (left, right) { return [i64.or(left, right)]; });
        primitive('XOR', [2, 1], function (lowering, left, right) { return [lowering.i64('^', left, right)]; },
            function (left, right) { return [i64.xor(left, right)]; });
        primitive('INVERT', [1, 1], function (lowering, value) { return [lowering.i64Unary('^', value)]; },
            function (value) { return [i64.not(value)]; });
        primitive('MIN', [2, 1], function (lowering, left, right) {
            return [J.cond(lowering.i64('<', left, right), left, right)];
        });
        primitive('MAX', [2, 1], function (lowering, left, right) {
            return [J.cond(lowering.i64('>', left, right), left, right)];
        });
        primitive('=', [2, 1], flag(function (lowering, left, right) { return lowering.i64('==', left, right); }),
            flagFold(i64.eq));
        primitive('<>', [2, 1], flag(function (lowering, left, right) { return lowering.i64('!=', left, right); }),
            flagFold(function (left, right) { return !i64.eq(left, right); }));
        primitive('<', [2, 1], flag(function (lowering, left, right) { return lowering.i64('<', left, right); }),
            flagFold(i64.lt));
        primitive('>', [2, 1], flag(function (lowering, left, right) { return lowering.i64('>', left, right); }),
            flagFold(i64.gt));
        primitive('U<', [2, 1], flag(function (lowering, left, right) {
            return call(lowering, 'ult', [left, right]);
        }));
        primitive('U>', [2, 1], flag(function (lowering, left, right) {
            return call(lowering, 'ult', [right, left]);
        }));
        primitive('0=', [1, 1], function (lowering, item) {
            return [lowering.flag(Forth.negate(lowering.test(item)))];
        }, flagFold(function (value) { return value === 0; }), { items: true });
        primitive('0<>', [1, 1], function (lowering, item) { return [lowering.flag(lowering.test(item))]; },
            flagFold(function (value) { return value !== 0; }), { items: true });
        primitive('0<', [1, 1], flag(function (lowering, value) { return lowering.i64('<', value, J.num(0)); }),
            flagFold(function (value) { return i64.lt(value, 0); }));
        primitive('0>', [1, 1], flag(function (lowering, value) { return lowering.i64('>', value, J.num(0)); }),
            flagFold(function (value) { return i64.gt(value, 0); }));
        primitive('WITHIN', [3, 1], flag(function (lowering, value, lo, hi) {
            return call(lowering, 'within', [value, lo, hi]);
        }));
        primitive('S>D', [1, 2], function (lowering, value) {
            return [value, J.cond(lowering.i64('<', value, J.num(0)), J.num(-1), J.num(0))];
        });
        primitive('D>S', [2, 1], function (lowering, lo) { return [lo]; });

        // Stack
        shuffle('DUP', 1, [0, 0]);
        shuffle('DROP', 1, []);
        shuffle('SWAP', 2, [1, 0]);
        shuffle('OVER', 2, [0, 1, 0]);
        shuffle('ROT', 3, [1, 2, 0]);
        shuffle('-ROT', 3, [2, 0, 1]);
        shuffle('NIP', 2, [1]);
        shuffle('TUCK', 2, [1, 0, 1]);
        shuffle('2DUP', 2, [0, 1, 0, 1]);
        shuffle('2DROP', 2, []);
        shuffle('2SWAP', 4, [2, 3, 0, 1]);
        shuffle('2OVER', 4, [0, 1, 2, 3, 0, 1]);
        shuffle('2ROT', 6, [2, 3, 4, 5, 0, 1]);
        shuffle('2NIP', 4, [2, 3]);
        shuffle('2TUCK', 4, [2, 3, 0, 1, 2, 3]);
        stackWord(system, '?DUP', 'qdup');
        custom(system, 'PICK', function (lowering) {
            var depth = lowering.peek(lowering.data, 0);
            if (depth.lit !== undefined && typeof depth.lit === 'number' && depth.lit >= 0 && depth.lit < 64) {
                lowering.popData();
                lowering.pushData(lowering.peek(lowering.data, depth.lit));
                return;
            }
            lowering.stackHelper('pick');
        }).fn = function (sp) { return system.pick(sp); };
        custom(system, 'ROLL', function (lowering) {
            var depth = lowering.peek(lowering.data, 0);
            if (depth.lit !== undefined && typeof depth.lit === 'number' && depth.lit >= 0 && depth.lit < 64) {
                lowering.popData();
                var items = [];
                for (var position = 0; position <= depth.lit; ++position)
                    items.unshift(lowering.popData());
                items.push(items.shift());
                items.forEach(function (item) { lowering.pushData(item); });
                return;
            }
            lowering.stackHelper('roll');
        }).fn = function (sp) { return system.roll(sp); };
        custom(system, 'DEPTH', function (lowering) {
            var extra = lowering.data.items.length - lowering.data.taken;
            lowering.pushData(lowering.value(J.bin('-', J.id('sp'), J.num(EMPTY - extra))));
        });
        stackWord(system, 'CLEARSTACK', 'clearStack');

        // The return stack: virtual inside a definition too.
        var returns = function (name, lower) {
            custom(system, name, lower, { compileOnly: true });
        };
        returns('>R', function (lowering) { lowering.push(lowering.returns, lowering.popData()); });
        returns('R>', function (lowering) { lowering.pushData(lowering.pop(lowering.returns)); });
        returns('R@', function (lowering) { lowering.pushData(lowering.peek(lowering.returns, 0)); });
        returns('RDROP', function (lowering) { lowering.pop(lowering.returns); });
        returns('2>R', function (lowering) {
            var second = lowering.popData(), first = lowering.popData();
            lowering.push(lowering.returns, first);
            lowering.push(lowering.returns, second);
        });
        returns('2R>', function (lowering) {
            var second = lowering.pop(lowering.returns), first = lowering.pop(lowering.returns);
            lowering.pushData(first);
            lowering.pushData(second);
        });
        returns('2R@', function (lowering) {
            var second = lowering.peek(lowering.returns, 0), first = lowering.peek(lowering.returns, 1);
            lowering.pushData(first);
            lowering.pushData(second);
        });
        returns('2RDROP', function (lowering) {
            lowering.pop(lowering.returns);
            lowering.pop(lowering.returns);
        });

        // Memory
        var cellNumber = function (value) { return typeof value === 'number' ? value : null; };
        primitive('@', [1, 1], function (lowering, address) { return [memoryCall(lowering, 'cell', [address])]; });
        primitive('!', [2, 0], function (lowering, value, address) {
            lowering.emitExpr(memoryCall(lowering, 'setCell', [address, value]));
            return [];
        });
        primitive('C@', [1, 1], function (lowering, address) { return [memoryCall(lowering, 'byte', [address])]; });
        primitive('C!', [2, 0], function (lowering, value, address) {
            lowering.emitExpr(memoryCall(lowering, 'setByte', [address, value]));
            return [];
        });
        primitive('W@', [1, 1], function (lowering, address) { return [memoryCall(lowering, 'word16', [address])]; });
        primitive('W!', [2, 0], function (lowering, value, address) {
            lowering.emitExpr(memoryCall(lowering, 'setWord16', [address, value]));
            return [];
        });
        primitive('L@', [1, 1], function (lowering, address) { return [memoryCall(lowering, 'word32', [address])]; });
        primitive('L!', [2, 0], function (lowering, value, address) {
            lowering.emitExpr(memoryCall(lowering, 'setWord32', [address, value]));
            return [];
        });
        primitive('+!', [2, 0], function (lowering, value, address) {
            emitCall(lowering, 'addStore', [address, value]);
            return [];
        });
        primitive('2@', [1, 2], function (lowering, address) {
            var second = lowering.value(memoryCall(lowering, 'cell', [lowering.i64('+', address, J.num(8))]));
            var first = lowering.value(memoryCall(lowering, 'cell', [address]));
            return [second, first];
        });
        primitive('2!', [3, 0], function (lowering, x1, x2, address) {
            lowering.emitExpr(memoryCall(lowering, 'setCell', [address, x2]));
            lowering.emitExpr(memoryCall(lowering, 'setCell', [lowering.i64('+', address, J.num(8)), x1]));
            return [];
        });
        primitive('CELLS', [1, 1], function (lowering, count) { return [lowering.i64('*', count, J.num(8))]; },
            function (count) { return [i64.mul(count, 8)]; });
        primitive('CELL+', [1, 1], function (lowering, address) { return [lowering.i64('+', address, J.num(8))]; },
            function (address) { return [i64.add(address, 8)]; });
        primitive('CELL-', [1, 1], function (lowering, address) { return [lowering.i64('-', address, J.num(8))]; },
            function (address) { return [i64.sub(address, 8)]; });
        primitive('CHARS', [1, 1], function (lowering, count) { return [count]; },
            function (count) { return [count]; });
        primitive('CHAR+', [1, 1], function (lowering, address) { return [lowering.i64('+', address, J.num(1))]; },
            function (address) { return [i64.add(address, 1)]; });
        primitive('FLOATS', [1, 1], function (lowering, count) { return [lowering.i64('*', count, J.num(8))]; },
            function (count) { return [i64.mul(count, 8)]; });
        primitive('FLOAT+', [1, 1], function (lowering, address) { return [lowering.i64('+', address, J.num(8))]; },
            function (address) { return [i64.add(address, 8)]; });
        primitive('DFLOATS', [1, 1], function (lowering, count) { return [lowering.i64('*', count, J.num(8))]; },
            function (count) { return [i64.mul(count, 8)]; });
        primitive('DFLOAT+', [1, 1], function (lowering, address) { return [lowering.i64('+', address, J.num(8))]; },
            function (address) { return [i64.add(address, 8)]; });
        primitive('SFLOATS', [1, 1], function (lowering, count) { return [lowering.i64('*', count, J.num(4))]; },
            function (count) { return [i64.mul(count, 4)]; });
        primitive('SFLOAT+', [1, 1], function (lowering, address) { return [lowering.i64('+', address, J.num(4))]; },
            function (address) { return [i64.add(address, 4)]; });
        primitive('ALIGNED', [1, 1], function (lowering, address) {
            return [call(lowering, 'aligned', [address, J.num(8)])];
        }, function (address) {
            var number = cellNumber(address);
            return number === null ? null : [Math.ceil(number / 8) * 8];
        });
        primitive('FALIGNED', [1, 1], function (lowering, address) {
            return [call(lowering, 'aligned', [address, J.num(8)])];
        });
        primitive('DFALIGNED', [1, 1], function (lowering, address) {
            return [call(lowering, 'aligned', [address, J.num(8)])];
        });
        primitive('SFALIGNED', [1, 1], function (lowering, address) {
            return [call(lowering, 'aligned', [address, J.num(4)])];
        });
        primitive('COUNT', [1, 2], function (lowering, address) {
            var length = lowering.value(memoryCall(lowering, 'byte', [address]));
            return [lowering.i64('+', address, J.num(1)), length];
        });
        primitive('MOVE', [3, 0], function (lowering, from, to, count) {
            emitCall(lowering, 'move', [from, to, count]);
            return [];
        });
        primitive('CMOVE', [3, 0], function (lowering, from, to, count) {
            emitCall(lowering, 'cmove', [from, to, count]);
            return [];
        });
        primitive('CMOVE>', [3, 0], function (lowering, from, to, count) {
            emitCall(lowering, 'cmoveUp', [from, to, count]);
            return [];
        });
        primitive('FILL', [3, 0], function (lowering, address, count, ch) {
            emitCall(lowering, 'fill', [address, count, ch]);
            return [];
        });
        primitive('ERASE', [2, 0], function (lowering, address, count) {
            emitCall(lowering, 'fill', [address, count, J.num(0)]);
            return [];
        });
        primitive('BLANK', [2, 0], function (lowering, address, count) {
            emitCall(lowering, 'fill', [address, count, J.num(32)]);
            return [];
        });
        primitive('HERE', [0, 1], function (lowering) { return [lowering.helper('dp')]; });
        primitive('PAD', [0, 1], function () { return [J.num(layout.PAD)]; }, function () { return [layout.PAD]; });
        primitive('ALLOT', [1, 0], function (lowering, count) { emitCall(lowering, 'allot', [count]); return []; });
        primitive(',', [1, 0], function (lowering, value) { emitCall(lowering, 'comma', [value]); return []; });
        primitive('C,', [1, 0], function (lowering, value) { emitCall(lowering, 'charComma', [value]); return []; });
        primitive('ALIGN', [0, 0], function (lowering) { emitCall(lowering, 'align', []); return []; });
        primitive('UNUSED', [0, 1], function (lowering) {
            return [J.bin('-', J.num(layout.DICTIONARY_END), lowering.helper('dp'))];
        });

        // Output
        primitive('EMIT', [1, 0], function (lowering, value) { emitCall(lowering, 'emit', [value]); return []; });
        primitive('XEMIT', [1, 0], function (lowering, value) { emitCall(lowering, 'emit', [value]); return []; });
        primitive('TYPE', [2, 0], function (lowering, address, length) {
            emitCall(lowering, 'type', [address, length]);
            return [];
        });
        primitive('CR', [0, 0], function (lowering) { emitCall(lowering, 'cr', []); return []; });
        primitive('SPACE', [0, 0], function (lowering) { emitCall(lowering, 'writeBytes', [J.str(' ')]); return []; });
        primitive('SPACES', [1, 0], function (lowering, count) { emitCall(lowering, 'spaces', [count]); return []; });
        primitive('.', [1, 0], function (lowering, value) { emitCall(lowering, 'dot', [value]); return []; });
        primitive('U.', [1, 0], function (lowering, value) { emitCall(lowering, 'udot', [value]); return []; });
        primitive('.R', [2, 0], function (lowering, value, width) {
            emitCall(lowering, 'dotR', [value, width]);
            return [];
        });
        primitive('U.R', [2, 0], function (lowering, value, width) {
            emitCall(lowering, 'udotR', [value, width]);
            return [];
        });
        primitive('?', [1, 0], function (lowering, address) {
            emitCall(lowering, 'dot', [memoryCall(lowering, 'cell', [address])]);
            return [];
        });
        primitive('D.', [2, 0], function (lowering, lo, hi) {
            emitCall(lowering, 'writeBytes',
                     [J.bin('+', call(lowering, 'formatDouble', [lo, hi, J.bool(true)]), J.str(' '))]);
            return [];
        });
        primitive('UD.', [2, 0], function (lowering, lo, hi) {
            emitCall(lowering, 'writeBytes',
                     [J.bin('+', call(lowering, 'formatDouble', [lo, hi, J.bool(false)]), J.str(' '))]);
            return [];
        });
        primitive('D.R', [3, 0], function (lowering, lo, hi, width) {
            emitCall(lowering, 'writeRight', [call(lowering, 'formatDouble', [lo, hi, J.bool(true)]), width]);
            return [];
        });
        primitive('UD.R', [3, 0], function (lowering, lo, hi, width) {
            emitCall(lowering, 'writeRight', [call(lowering, 'formatDouble', [lo, hi, J.bool(false)]), width]);
            return [];
        });
        stackWord(system, '.S', 'dotS');
        stackWord(system, 'F.S', 'fdotS');
        primitive('<#', [0, 0], function (lowering) {
            lowering.emitExpr(J.assign(lowering.helper('hld'), J.num(layout.HOLD_END)));
            return [];
        });
        primitive('HOLD', [1, 0], function (lowering, ch) { emitCall(lowering, 'hold', [ch]); return []; });
        primitive('HOLDS', [2, 0], function (lowering, address, length) {
            emitCall(lowering, 'holds', [address, length]);
            return [];
        });
        primitive('SIGN', [1, 0], function (lowering, value) {
            lowering.emit(J.if_(lowering.i64('<', value, J.num(0)), J.expr(call(lowering, 'hold', [J.num(45)]))));
            return [];
        });
        stackWord(system, '#', 'sharp');
        stackWord(system, '#S', 'sharpS');
        stackWord(system, '#>', 'sharpGreater');
        stackWord(system, '>NUMBER', 'toNumber');

        // Double numbers
        stackWord(system, 'D+', 'dplus');
        stackWord(system, 'D-', 'dminus');
        stackWord(system, 'DNEGATE', 'dnegate');
        stackWord(system, 'DABS', 'dabs');
        stackWord(system, 'D2*', 'd2star');
        stackWord(system, 'D2/', 'd2slash');
        stackWord(system, 'D<', 'dless');
        stackWord(system, 'D>', 'dgreater');
        stackWord(system, 'D=', 'dequal');
        stackWord(system, 'DU<', 'duless');
        stackWord(system, 'D0=', 'dzeroEqual');
        stackWord(system, 'D0<', 'dzeroLess');
        stackWord(system, 'DMAX', 'dmax');
        stackWord(system, 'DMIN', 'dmin');
        stackWord(system, 'M+', 'mplus');
        stackWord(system, 'M*', 'mstar');
        stackWord(system, 'UM*', 'umstar');
        stackWord(system, 'UM/MOD', 'ummod');
        stackWord(system, 'FM/MOD', 'fmmod');
        stackWord(system, 'SM/REM', 'smrem');
        stackWord(system, 'M*/', 'mstarslash');

        // Floats
        var math = function (name) { return J.path('Math.' + name); };
        var f1 = function (name, fn) {
            primitive(name, [0, 0, 1, 1], function (lowering, value) { return [fn(lowering, value)]; });
        };
        var f2 = function (name, fn) {
            primitive(name, [0, 0, 2, 1], function (lowering, left, right) { return [fn(lowering, left, right)]; });
        };
        f2('F+', function (lowering, left, right) { return J.bin('+', left, right); });
        f2('F-', function (lowering, left, right) { return J.bin('-', left, right); });
        f2('F*', function (lowering, left, right) { return J.bin('*', left, right); });
        f2('F/', function (lowering, left, right) { return J.bin('/', left, right); });
        f2('F**', function (lowering, left, right) { return J.call(math('pow'), [left, right]); });
        f2('FMAX', function (lowering, left, right) { return J.call(math('max'), [left, right]); });
        f2('FMIN', function (lowering, left, right) { return J.call(math('min'), [left, right]); });
        f2('FATAN2', function (lowering, left, right) { return J.call(math('atan2'), [left, right]); });
        f1('FNEGATE', function (lowering, value) { return J.un('-', value); });
        f1('FABS', function (lowering, value) { return J.call(math('abs'), [value]); });
        f1('FSQRT', function (lowering, value) { return J.call(math('sqrt'), [value]); });
        f1('FLOOR', function (lowering, value) { return J.call(math('floor'), [value]); });
        f1('FROUND', function (lowering, value) { return call(lowering, 'fround', [value]); });
        f1('FTRUNC', function (lowering, value) { return J.call(math('trunc'), [value]); });
        f1('F2*', function (lowering, value) { return J.bin('*', value, J.num(2)); });
        f1('F2/', function (lowering, value) { return J.bin('/', value, J.num(2)); });
        f1('1/F', function (lowering, value) { return J.bin('/', J.num(1), value); });
        f1('FSQ', function (lowering, value) { return J.bin('*', value, value); });
        ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'exp', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
         'expm1'].forEach(function (name) {
            f1('F' + name.toUpperCase(), function (lowering, value) { return J.call(math(name), [value]); });
        });
        f1('FLN', function (lowering, value) { return J.call(math('log'), [value]); });
        f1('FLOG', function (lowering, value) { return J.call(math('log10'), [value]); });
        f1('FLNP1', function (lowering, value) { return J.call(math('log1p'), [value]); });
        f1('FALOG', function (lowering, value) { return J.call(math('pow'), [J.num(10), value]); });
        primitive('FSINCOS', [0, 0, 1, 2], function (lowering, value) {
            return [J.call(math('sin'), [value]), J.call(math('cos'), [value])];
        });
        primitive('F<', [0, 1, 2, 0], function (lowering, left, right) {
            return [lowering.flag(J.bin('<', left, right))];
        });
        primitive('F>', [0, 1, 2, 0], function (lowering, left, right) {
            return [lowering.flag(J.bin('>', left, right))];
        });
        primitive('F=', [0, 1, 2, 0], function (lowering, left, right) {
            return [lowering.flag(J.bin('===', left, right))];
        });
        primitive('F<>', [0, 1, 2, 0], function (lowering, left, right) {
            return [lowering.flag(J.bin('!==', left, right))];
        });
        primitive('F<=', [0, 1, 2, 0], function (lowering, left, right) {
            return [lowering.flag(J.bin('<=', left, right))];
        });
        primitive('F>=', [0, 1, 2, 0], function (lowering, left, right) {
            return [lowering.flag(J.bin('>=', left, right))];
        });
        primitive('F0<', [0, 1, 1, 0], function (lowering, value) {
            return [lowering.flag(J.bin('<', value, J.num(0)))];
        });
        primitive('F0>', [0, 1, 1, 0], function (lowering, value) {
            return [lowering.flag(J.bin('>', value, J.num(0)))];
        });
        primitive('F0=', [0, 1, 1, 0], function (lowering, value) {
            return [lowering.flag(J.bin('===', value, J.num(0)))];
        });
        primitive('F0<>', [0, 1, 1, 0], function (lowering, value) {
            return [lowering.flag(J.bin('!==', value, J.num(0)))];
        });
        primitive('F~', [0, 1, 3, 0], function (lowering, left, right, tolerance) {
            return [lowering.flag(call(lowering, 'fequal', [left, right, tolerance]))];
        });
        primitive('F@', [1, 0, 0, 1], function (lowering, address) {
            return [memoryCall(lowering, 'float', [address])];
        });
        primitive('F!', [1, 0, 1, 0], function (lowering, address, value) {
            lowering.emitExpr(memoryCall(lowering, 'setFloat', [address, value]));
            return [];
        });
        primitive('DF@', [1, 0, 0, 1], function (lowering, address) {
            return [memoryCall(lowering, 'float', [address])];
        });
        primitive('DF!', [1, 0, 1, 0], function (lowering, address, value) {
            lowering.emitExpr(memoryCall(lowering, 'setFloat', [address, value]));
            return [];
        });
        primitive('SF@', [1, 0, 0, 1], function (lowering, address) {
            return [memoryCall(lowering, 'sfloat', [address])];
        });
        primitive('SF!', [1, 0, 1, 0], function (lowering, address, value) {
            lowering.emitExpr(memoryCall(lowering, 'setSfloat', [address, value]));
            return [];
        });
        primitive('S>F', [1, 0, 0, 1], function (lowering, value) { return [call(lowering, 'cellToFloat', [value])]; });
        primitive('F>S', [0, 1, 1, 0], function (lowering, value) { return [call(lowering, 'floatToCell', [value])]; });
        stackWord(system, 'D>F', 'doubleToFloat');
        stackWord(system, 'F>D', 'floatToDouble');
        primitive('F.', [0, 0, 1, 0], function (lowering, value) { emitCall(lowering, 'fdot', [value]); return []; });
        primitive('FS.', [0, 0, 1, 0], function (lowering, value) { emitCall(lowering, 'fsdot', [value]); return []; });
        primitive('FE.', [0, 0, 1, 0], function (lowering, value) { emitCall(lowering, 'fedot', [value]); return []; });
        primitive('>FLOAT', [2, 1], function (lowering, address, length) {
            return [lowering.flag(call(lowering, 'toFloat', [address, length]))];
        });
        stackWord(system, 'REPRESENT', 'represent');
        primitive('PRECISION', [0, 1], function (lowering) {
            return [memoryCall(lowering, 'cell', [J.num(layout.PRECISION)])];
        });
        primitive('SET-PRECISION', [1, 0], function (lowering, precision) {
            lowering.emitExpr(memoryCall(lowering, 'setCell', [J.num(layout.PRECISION), precision]));
            return [];
        });
        fshuffle('FDUP', 1, [0, 0]);
        fshuffle('FDROP', 1, []);
        fshuffle('FSWAP', 2, [1, 0]);
        fshuffle('FOVER', 2, [0, 1, 0]);
        fshuffle('FROT', 3, [1, 2, 0]);
        fshuffle('-FROT', 3, [2, 0, 1]);
        fshuffle('FNIP', 2, [1]);
        fshuffle('FTUCK', 2, [1, 0, 1]);
        fshuffle('F2DUP', 2, [0, 1, 0, 1]);
        fshuffle('F2DROP', 2, []);
        stackWord(system, 'FPICK', 'fpick');
        stackWord(system, 'FDEPTH', 'fdepth');
        stackWord(system, 'FCLEARSTACK', 'fclearStack');
        primitive('FALIGN', [0, 0], function (lowering) { emitCall(lowering, 'align', []); return []; });
        primitive('SFALIGN', [0, 0], function (lowering) { emitCall(lowering, 'align', []); return []; });
        primitive('DFALIGN', [0, 0], function (lowering) { emitCall(lowering, 'align', []); return []; });

        constant(system, 'TRUE', -1);
        constant(system, 'FALSE', 0);
        constant(system, 'BL', 32);
        constant(system, 'CELL', 8);
        constant(system, 'STATE', layout.STATE);
        constant(system, 'BASE', layout.BASE);
        constant(system, '>IN', layout.TO_IN);
        constant(system, 'BLK', layout.BLK);
        constant(system, 'DPL', layout.DPL);
        var pi = system.define('PI', 'fconstant');
        pi.value = Math.PI;
        pi.fn = function (sp) {
            system.FS[++system.fp] = Math.PI;
            return sp;
        };
        primitive('DECIMAL', [0, 0], function (lowering) {
            lowering.emitExpr(memoryCall(lowering, 'setCell', [J.num(layout.BASE), J.num(10)]));
            return [];
        });
        primitive('HEX', [0, 0], function (lowering) {
            lowering.emitExpr(memoryCall(lowering, 'setCell', [J.num(layout.BASE), J.num(16)]));
            return [];
        });
        primitive('NOOP', [0, 0], function () { return []; });
    };

    Forth.coreWords = true;
})(globalThis);
