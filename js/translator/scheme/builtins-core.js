// Scheme: the built-in procedures of R7RS - equality, numbers, pairs and
// lists, symbols, characters, strings, vectors, bytevectors, control,
// exceptions, promises, parameters, records. Procedures that call Scheme
// procedures (map, for-each...) are written in Scheme - library.js.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var S = T.scheme;
    if (S.prims['car'])
        return;

    var J = T.J;
    var N = S.N;
    var Pair = S.Pair, NIL = S.NIL, Sym = S.Sym, Char = S.Char, SString = S.SString, UNSPEC = S.UNSPEC;
    var Values = S.Values, Flo = S.Flo;
    var def = S.def, defCps = S.defCps;
    var slice = Array.prototype.slice;

    // --- Argument checks

    function fail(name, what, value) {
        throw S.error(name + ': not ' + what, [value]);
    }
    function pair(name, value) {
        if (!(value instanceof Pair))
            fail(name, 'a pair', value);
        return value;
    }
    function string(name, value) {
        if (!(value instanceof SString))
            fail(name, 'a string', value);
        return value;
    }
    function symbol(name, value) {
        if (!(value instanceof Sym))
            fail(name, 'a symbol', value);
        return value;
    }
    function character(name, value) {
        if (!(value instanceof Char))
            fail(name, 'a character', value);
        return value;
    }
    function vector(name, value) {
        if (!Array.isArray(value))
            fail(name, 'a vector', value);
        return value;
    }
    function bytevector(name, value) {
        if (!(value instanceof Uint8Array))
            fail(name, 'a bytevector', value);
        return value;
    }
    function procedure(name, value) {
        if (typeof value !== 'function')
            fail(name, 'a procedure', value);
        return value;
    }
    function list(name, value) {
        var items = S.listToArray(value);
        if (items === null)
            fail(name, 'a list', value);
        return items;
    }
    // A non-negative exact integer (an index, a length).
    function natural(name, value) {
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
            if (value instanceof S.Flo || (typeof value === 'number' && !Number.isInteger(value)))
                throw S.error(name + ': not an exact integer', [value]);
            fail(name, 'an exact nonnegative integer', value);
        }
        return value;
    }
    function index(name, value, length, container) {
        natural(name, value);
        if (value >= length)
            throw S.error(name + ': index out of range', [container, value]);
        return value;
    }
    // The start and the end of the part [start, end) of a sequence of length length.
    function range(name, start, end, length, container) {
        start = start === undefined ? 0 : natural(name, start);
        end = end === undefined ? length : natural(name, end);
        if (end > length || start > end)
            throw S.error(name + ': bad index range', [container, start, end]);
        return [start, end];
    }
    S.check = { pair: pair, string: string, symbol: symbol, character: character, vector: vector, bytevector: bytevector,
                procedure: procedure, list: list, natural: natural, index: index, range: range, fail: fail };

    function bool(value) {
        return value;
    }

    // --- Inlining helpers (J)

    var MAX = J.num(9007199254740991);
    // A literal integer below 2^31: it needs no type checks.
    function isSmallLiteral(node) {
        return node.k === 'num' && (node.value | 0) === node.value && !(node.value === 0 && 1 / node.value < 0);
    }
    function isNum(node) {
        if (isSmallLiteral(node))
            return J.bool(true);
        return J.bin('===', J.un('typeof', node), J.str('number'));
    }
    function int32(node) {
        if (isSmallLiteral(node))
            return J.bool(true);
        return J.bin('===', J.bin('|', node, J.num(0)), node);
    }
    // Simplifies && and || with true literals.
    function and(left, right) {
        if (left.k === 'bool' && left.value)
            return right;
        if (right.k === 'bool' && right.value)
            return left;
        return J.and(left, right);
    }
    function or(left, right) {
        if ((left.k === 'bool' && left.value) || (right.k === 'bool' && right.value))
            return J.bool(true);
        return J.or(left, right);
    }
    function slowN(name, args) {
        return J.call(J.mem(J.id('$N'), name), args);
    }
    function prepare(args, fn) {
        var setup = [];
        var values = args.map(function (arg) { return S.once(arg, fn, setup); });
        return { setup: setup, values: values };
    }

    // left op right with a fast branch: exact integers (below 2^31 at once, below
    // 2^53 with an integrality check) and floats with a float result as
    // numbers; everything else through $N.
    function arith(op, slowName, left, right, fn) {
        var prepared = prepare([left, right], fn);
        var first = prepared.values[0], second = prepared.values[1];
        var result = J.id(fn.temp());
        var inRange = J.and(J.bin('<=', result, MAX), J.bin('>=', result, J.un('-', MAX)));
        var exactOk = and(int32(first), int32(second));
        if (op === '*')
            exactOk = and(exactOk, J.and(J.bin('!==', result, J.num(0)), inRange));
        var integral = function (node) {
            return isSmallLiteral(node) ? J.bool(true) : J.bin('===', J.bin('%', node, J.num(1)), J.num(0));
        };
        var wide = and(and(integral(first), integral(second)),
                       op === '*' ? J.and(J.bin('!==', result, J.num(0)), inRange) : inRange);
        var test = and(and(isNum(first), isNum(second)),
                       J.seq([J.assign(result, J.bin(op, first, second)),
                              or(or(exactOk, J.bin('!==', J.bin('%', result, J.num(1)), J.num(0))), wide)]));
        return S.withSetup(prepared.setup, J.cond(test, result, slowN(slowName, [first, second])));
    }

    function foldInline(op, slowName, identity) {
        return function (args, fn) {
            if (args.length === 0)
                return identity === null ? null : J.num(identity);
            if (args.length === 1 || args.length > 4)
                return null;
            var acc = args[0];
            for (var index = 1; index < args.length; ++index)
                acc = arith(op, slowName, acc, args[index], fn);
            return acc;
        };
    }

    function compareInline(op, slowTest) {
        return function (args, fn) {
            if (args.length !== 2)
                return null;
            var prepared = prepare(args, fn);
            var first = prepared.values[0], second = prepared.values[1];
            var both = and(isNum(first), isNum(second));
            if (both.k === 'bool' && both.value)
                return S.withSetup(prepared.setup, J.bin(op, first, second));
            return S.withSetup(prepared.setup, J.cond(both, J.bin(op, first, second), slowTest(first, second)));
        };
    }

    // --- Equality

    function eqv(left, right) {
        if (left === right)
            return true;
        if (N.isNumber(left) && N.isNumber(right))
            return N.eqv(left, right);
        if (left instanceof SString && right instanceof SString)
            return false;
        return false;
    }

    // equal?: structures in depth, cycles do no harm (pairs that are being
    // compared with each other count as equal).
    function isEqual(left, right) {
        var stack = [[left, right]];
        var seen = null;
        var steps = 0;
        while (stack.length > 0) {
            var top = stack.pop();
            var first = top[0], second = top[1];
            for (;;) {
                if (eqv(first, second))
                    break;
                if (first instanceof Pair) {
                    if (!(second instanceof Pair))
                        return false;
                    if (++steps > 100000) {
                        if (seen === null)
                            seen = new Map();
                        var known = seen.get(first);
                        if (known !== undefined && known.has(second))
                            break;
                        if (known === undefined)
                            seen.set(first, known = new Set());
                        known.add(second);
                    }
                    stack.push([first.car, second.car]);
                    first = first.cdr;
                    second = second.cdr;
                    continue;
                }
                if (first instanceof SString)
                    return second instanceof SString && first.s === second.s;
                if (Array.isArray(first)) {
                    if (!Array.isArray(second) || first.length !== second.length)
                        return false;
                    for (var index = 0; index < first.length; ++index)
                        stack.push([first[index], second[index]]);
                    break;
                }
                if (first instanceof Uint8Array) {
                    if (!(second instanceof Uint8Array) || first.length !== second.length)
                        return false;
                    for (var position = 0; position < first.length; ++position) {
                        if (first[position] !== second[position])
                            return false;
                    }
                    break;
                }
                return false;
            }
        }
        return true;
    }
    S.eqv = eqv;
    S.isEqual = isEqual;

    def('eq?', 2, 2, function (left, right) { return left === right; }, {
        bool: true,
        inline: function (args) { return J.bin('===', args[0], args[1]); }
    });
    def('eqv?', 2, 2, eqv, {
        bool: true,
        inline: function (args, fn) {
            var prepared = prepare(args, fn);
            return S.withSetup(prepared.setup, J.or(J.bin('===', prepared.values[0], prepared.values[1]),
                                                    J.call(J.mem(J.id('$S'), 'eqv'), prepared.values)));
        }
    });
    def('equal?', 2, 2, isEqual, { bool: true });

    // --- Numbers

    def('number?', 1, 1, N.isNumber, { bool: true });
    def('complex?', 1, 1, N.isNumber, { bool: true });
    def('real?', 1, 1, N.isReal, { bool: true });
    def('rational?', 1, 1, function (value) { return N.isNumber(value) && N.isRational(value); }, { bool: true });
    def('integer?', 1, 1, function (value) { return N.isNumber(value) && N.isInteger(value); }, { bool: true });
    def('exact?', 1, 1, function (value) { N.checkNumber('exact?', value); return N.isExact(value); }, { bool: true });
    def('inexact?', 1, 1, function (value) { N.checkNumber('inexact?', value); return !N.isExact(value); },
        { bool: true });
    def('exact-integer?', 1, 1, N.isExactInteger, {
        bool: true,
        inline: function (args, fn) {
            var prepared = prepare(args, fn);
            var operand = prepared.values[0];
            return S.withSetup(prepared.setup, J.cond(isNum(operand), J.call(J.path('Number.isInteger'), [operand]),
                                                       J.call(J.mem(J.id('$N'), 'isExactInteger'), [operand])));
        }
    });
    def('exact-rational?', 1, 1, function (value) { var kind = N.kind(value); return kind === 0 || kind === 1; },
        { bool: true });
    def('exact-nonnegative-integer?', 1, 1, function (value) { return N.isExactInteger(value) && N.sign(value) >= 0; },
        { bool: true });
    def('nan?', 1, 1, function (value) {
        N.checkNumber('nan?', value);
        if (value instanceof S.Cpx)
            return N.fv(value.re) !== N.fv(value.re) || N.fv(value.im) !== N.fv(value.im);
        var floatValue = N.fv(value);
        return floatValue !== floatValue;
    }, { bool: true });
    def('infinite?', 1, 1, function (value) {
        N.checkNumber('infinite?', value);
        if (value instanceof S.Cpx)
            return Math.abs(N.fv(value.re)) === Infinity || Math.abs(N.fv(value.im)) === Infinity;
        return Math.abs(N.fv(value)) === Infinity;
    }, { bool: true });
    def('finite?', 1, 1, function (value) {
        N.checkNumber('finite?', value);
        if (value instanceof S.Cpx)
            return isFinite(N.fv(value.re)) && isFinite(N.fv(value.im));
        return N.kind(value) !== 2 || isFinite(N.fv(value));
    }, { bool: true });

    function compareChain(name, test) {
        return function () {
            for (var index = 0; index < arguments.length; ++index)
                N.checkReal(name, arguments[index]);
            for (var position = 0; position + 1 < arguments.length; ++position) {
                if (!test(N.cmp(arguments[position], arguments[position + 1], name)))
                    return false;
            }
            return true;
        };
    }
    def('=', 1, -1, function () {
        for (var index = 0; index < arguments.length; ++index)
            N.checkNumber('=', arguments[index]);
        for (var position = 0; position + 1 < arguments.length; ++position) {
            if (!N.numEq(arguments[position], arguments[position + 1]))
                return false;
        }
        return true;
    }, {
        bool: true,
        inline: compareInline('===', function (left, right) { return slowN('numEq', [left, right]); })
    });
    function cmpSlow(name, op) {
        return function (left, right) { return J.bin(op, slowN('cmp', [left, right, J.str(name)]), J.num(0)); };
    }
    def('<', 1, -1, compareChain('<', function (order) {
        return order < 0;
    }), { bool: true, inline: compareInline('<', cmpSlow('<', '<')) });
    def('>', 1, -1, compareChain('>', function (order) {
        return order > 0;
    }), { bool: true, inline: compareInline('>', cmpSlow('>', '>')) });
    def('<=', 1, -1, compareChain('<=', function (order) {
        return order <= 0;
    }), { bool: true, inline: compareInline('<=', cmpSlow('<=', '<=')) });
    def('>=', 1, -1, compareChain('>=', function (order) {
        return order >= 0;
    }), { bool: true, inline: compareInline('>=', cmpSlow('>=', '>=')) });

    def('zero?', 1, 1, N.isZero, {
        bool: true,
        inline: function (args, fn) {
            var prepared = prepare(args, fn);
            var operand = prepared.values[0];
            return S.withSetup(prepared.setup,
                               J.cond(isNum(operand), J.bin('===', operand, J.num(0)), slowN('isZero', [operand])));
        }
    });
    def('positive?', 1, 1, function (value) { return N.sign(value, 'positive?') > 0; }, {
        bool: true,
        inline: function (args, fn) {
            var prepared = prepare(args, fn);
            var operand = prepared.values[0];
            return S.withSetup(prepared.setup,
                               J.cond(isNum(operand), J.bin('>', operand, J.num(0)),
                                      J.bin('>', slowN('sign', [operand, J.str('positive?')]), J.num(0))));
        }
    });
    def('negative?', 1, 1, function (value) { return N.sign(value, 'negative?') < 0; }, {
        bool: true,
        inline: function (args, fn) {
            var prepared = prepare(args, fn);
            var operand = prepared.values[0];
            return S.withSetup(prepared.setup,
                               J.cond(isNum(operand), J.bin('<', operand, J.num(0)),
                                      J.bin('<', slowN('sign', [operand, J.str('negative?')]), J.num(0))));
        }
    });
    function parity(name, odd) {
        return function (value) {
            N.checkInteger(name, value);
            var remainder = N.intDiv(name, value, 2, 'floor', 'r');
            return odd ? !N.isZero(remainder) : N.isZero(remainder);
        };
    }
    def('odd?', 1, 1, parity('odd?', true), {
        bool: true,
        inline: function (args, fn) {
            var prepared = prepare(args, fn);
            var operand = prepared.values[0];
            return S.withSetup(prepared.setup,
                               J.cond(J.and(isNum(operand), int32(operand)),
                                      J.bin('!==', J.bin('&', operand, J.num(1)), J.num(0)),
                                      J.call(J.mem(J.id('$S'), 'odd'), [operand])));
        }
    });
    def('even?', 1, 1, parity('even?', false), {
        bool: true,
        inline: function (args, fn) {
            var prepared = prepare(args, fn);
            var operand = prepared.values[0];
            return S.withSetup(prepared.setup,
                               J.cond(J.and(isNum(operand), int32(operand)),
                                      J.bin('===', J.bin('&', operand, J.num(1)), J.num(0)),
                                      J.call(J.mem(J.id('$S'), 'even'), [operand])));
        }
    });
    S.Machine.prototype.odd = parity('odd?', true);
    S.Machine.prototype.even = parity('even?', false);
    S.Machine.prototype.eqv = eqv;

    function extremum(name, pick) {
        return function () {
            var result = N.checkReal(name, arguments[0]);
            var inexact = !N.isExact(result);
            for (var index = 1; index < arguments.length; ++index) {
                var value = N.checkReal(name, arguments[index]);
                if (!N.isExact(value))
                    inexact = true;
                var order = N.cmp(value, result, name);
                if (order !== order)
                    result = NaN;
                else if (pick(order))
                    result = value;
            }
            return inexact ? N.inexact(result) : result;
        };
    }
    def('max', 1, -1, extremum('max', function (order) { return order > 0; }));
    def('min', 1, -1, extremum('min', function (order) { return order < 0; }));

    def('+', 0, -1, function () {
        var acc = 0;
        for (var index = 0; index < arguments.length; ++index)
            acc = N.add(acc, arguments[index]);
        return acc;
    }, { inline: foldInline('+', 'add', 0) });
    def('*', 0, -1, function () {
        var acc = 1;
        for (var index = 0; index < arguments.length; ++index)
            acc = N.mul(acc, arguments[index]);
        return acc;
    }, { inline: foldInline('*', 'mul', 1) });
    def('-', 1, -1, function (first) {
        if (arguments.length === 1)
            return N.neg(first);
        var acc = first;
        for (var index = 1; index < arguments.length; ++index)
            acc = N.sub(acc, arguments[index]);
        return acc;
    }, { inline: foldInline('-', 'sub', null) });
    def('/', 1, -1, function (first) {
        if (arguments.length === 1)
            return N.div(1, first);
        var acc = first;
        for (var index = 1; index < arguments.length; ++index)
            acc = N.div(acc, arguments[index]);
        return acc;
    }, {
        inline: function (args, fn) {
            if (args.length !== 2)
                return null;
            var prepared = prepare(args, fn);
            var dividend = prepared.values[0], divisor = prepared.values[1];
            var result = J.id(fn.temp());
            var inexactOperand = J.or(J.bin('!==', J.bin('%', dividend, J.num(1)), J.num(0)),
                                      J.bin('!==', J.bin('%', divisor, J.num(1)), J.num(0)));
            var test = J.and(J.and(J.and(isNum(dividend), isNum(divisor)), inexactOperand),
                             J.bin('!==', J.bin('%', J.assign(result, J.bin('/', dividend, divisor)), J.num(1)),
                                   J.num(0)));
            return S.withSetup(prepared.setup, J.cond(test, result, slowN('div', [dividend, divisor])));
        }
    });

    def('abs', 1, 1, N.abs);
    def('magnitude', 1, 1, N.magnitude);
    function division(name, mode, part) {
        return function (dividend, divisor) { return N.intDiv(name, dividend, divisor, mode, part); };
    }
    def('quotient', 2, 2, division('quotient', 'truncate', 'q'));
    def('remainder', 2, 2, division('remainder', 'truncate', 'r'));
    def('modulo', 2, 2, division('modulo', 'floor', 'r'), {
        inline: function (args, fn) {
            var prepared = prepare(args, fn);
            var dividend = prepared.values[0], divisor = prepared.values[1];
            var result = J.id(fn.temp());
            // Integers below 2^31, a non-zero divisor: the remainder has the sign of the divisor.
            var fast = J.and(J.and(J.and(isNum(dividend), isNum(divisor)), J.and(int32(dividend), int32(divisor))),
                             J.bin('!==', divisor, J.num(0)));
            var signsDiffer = J.bin('!==', J.bin('<', result, J.num(0)), J.bin('<', divisor, J.num(0)));
            var value = J.seq([J.assign(result, J.bin('%', dividend, divisor)),
                               J.cond(J.and(J.bin('!==', result, J.num(0)), signsDiffer),
                                      J.bin('+', result, divisor), J.bin('+', result, J.num(0)))]);
            return S.withSetup(prepared.setup,
                               J.cond(fast, value, J.call(J.mem(J.id('$S'), 'modulo'), [dividend, divisor])));
        }
    });
    S.Machine.prototype.modulo = division('modulo', 'floor', 'r');
    def('floor-quotient', 2, 2, division('floor-quotient', 'floor', 'q'));
    def('floor-remainder', 2, 2, division('floor-remainder', 'floor', 'r'));
    def('truncate-quotient', 2, 2, division('truncate-quotient', 'truncate', 'q'));
    def('truncate-remainder', 2, 2, division('truncate-remainder', 'truncate', 'r'));
    def('floor/', 2, 2, function (dividend, divisor) {
        return new Values([N.intDiv('floor/', dividend, divisor, 'floor', 'q'),
                           N.intDiv('floor/', dividend, divisor, 'floor', 'r')]);
    });
    def('truncate/', 2, 2, function (dividend, divisor) {
        return new Values([N.intDiv('truncate/', dividend, divisor, 'truncate', 'q'),
                           N.intDiv('truncate/', dividend, divisor, 'truncate', 'r')]);
    });
    def('gcd', 0, -1, function () {
        var acc = 0;
        for (var index = 0; index < arguments.length; ++index)
            acc = N.gcd(acc, N.checkInteger('gcd', arguments[index]));
        return acc;
    });
    def('lcm', 0, -1, function () {
        var acc = 1;
        for (var index = 0; index < arguments.length; ++index) {
            var value = N.checkInteger('lcm', arguments[index]);
            if (N.isZero(value))
                return N.isExact(value) && N.isExact(acc) ? 0 : new Flo(0);
            var divisor = N.gcd(acc, value);
            acc = N.abs(N.mul(acc, N.intDiv('lcm', value, divisor, 'truncate', 'q')));
        }
        return acc;
    });
    def('numerator', 1, 1, N.numerator);
    def('denominator', 1, 1, N.denominator);
    ['floor', 'ceiling', 'round', 'truncate'].forEach(function (name) {
        def(name, 1, 1, function (value) { return N.rounding(name, value); });
    });
    def('floor->exact', 1, 1, function (value) { return N.exact(N.rounding('floor', value)); });
    def('round->exact', 1, 1, function (value) { return N.exact(N.rounding('round', value)); });
    def('exact-floor', 1, 1, function (value) { return N.exact(N.rounding('floor', value)); });
    def('exact-round', 1, 1, function (value) { return N.exact(N.rounding('round', value)); });

    // rationalize: the simplest fraction within value ± tolerance (Stern-Brocot).
    def('rationalize', 2, 2, function (value, tolerance) {
        N.checkReal('rationalize', value);
        N.checkReal('rationalize', tolerance);
        var inexact = !N.isExact(value) || !N.isExact(tolerance);
        if (inexact && (!isFinite(N.fv(value)) || !isFinite(N.fv(tolerance)))) {
            if (N.fv(tolerance) !== N.fv(tolerance) || N.fv(value) !== N.fv(value))
                return NaN;
            return isFinite(N.fv(value)) ? new Flo(0) : (Math.abs(N.fv(tolerance)) === Infinity ? NaN : value);
        }
        var exactValue = N.exact(value), exactTolerance = N.abs(N.exact(tolerance));
        var low = N.sub(exactValue, exactTolerance), high = N.add(exactValue, exactTolerance);
        var result;
        if (N.sign(low) > 0)
            result = simplest(low, high);
        else if (N.sign(high) < 0)
            result = N.neg(simplest(N.neg(high), N.neg(low)));
        else
            result = 0;
        return inexact ? N.inexact(result) : result;
    });
    function simplest(low, high) {
        var fl = N.rounding('floor', low);
        if (N.cmp(fl, low) === 0)
            return fl;
        if (N.cmp(fl, N.rounding('floor', high)) < 0)
            return N.add(fl, 1);
        var rest = simplest(N.div(1, N.sub(high, fl)), N.div(1, N.sub(low, fl)));
        return N.add(fl, N.div(1, rest));
    }

    def('exp', 1, 1, N.exp);
    def('log', 1, 2, N.log);
    ['sin', 'cos', 'tan', 'asin', 'acos'].forEach(function (name) {
        def(name, 1, 1, function (value) { return N.trig(name, value); });
    });
    def('atan', 1, 2, function (y, x) { return x === undefined ? N.trig('atan', y) : N.atan2(y, x); });
    def('square', 1, 1, function (value) { return N.mul(value, value); }, {
        inline: function (args, fn) {
            var prepared = prepare(args, fn);
            return S.withSetup(prepared.setup, arith('*', 'mul', prepared.values[0], prepared.values[0], fn));
        }
    });
    def('cube', 1, 1, function (value) { return N.mul(value, N.mul(value, value)); });
    def('sqrt', 1, 1, N.sqrt);
    def('exact-integer-sqrt', 1, 1, N.exactIntegerSqrt);
    def('expt', 2, 2, N.expt);
    def('make-rectangular', 2, 2, function (real, imaginary) {
        N.checkReal('make-rectangular', real);
        N.checkReal('make-rectangular', imaginary);
        return N.makeRect(real, imaginary);
    });
    def('make-polar', 2, 2, N.makePolar);
    def('real-part', 1, 1, N.realPart);
    def('imag-part', 1, 1, N.imagPart);
    def('angle', 1, 1, N.angle);
    def('exact', 1, 1, N.exact);
    def('inexact', 1, 1, N.inexact);
    S.alias('inexact->exact', 'exact');
    S.alias('exact->inexact', 'inexact');
    def('number->string', 1, 2, function (value, radix) {
        N.checkNumber('number->string', value);
        if (radix !== undefined && [2, 8, 10, 16].indexOf(radix) < 0)
            throw S.error('number->string: bad radix', [radix]);
        return S.str(N.numberToString(value, radix || 10));
    });
    def('string->number', 1, 2, function (text, radix) {
        string('string->number', text);
        if (radix !== undefined && [2, 8, 10, 16].indexOf(radix) < 0)
            throw S.error('string->number: bad radix', [radix]);
        var parsed = N.parse(text.s, radix || 10);
        return parsed === null ? false : parsed;
    });

    // Bitwise operations (SRFI 151, a part).
    function bitwise(name, op, identity) {
        return function () {
            var acc = identity;
            for (var index = 0; index < arguments.length; ++index) {
                var value = arguments[index];
                if (!N.isExactInteger(value))
                    fail(name, 'an exact integer', value);
                var small = typeof acc === 'number' && typeof value === 'number' && (acc | 0) === acc &&
                    (value | 0) === value;
                acc = small ? op.fast(acc, value) : T.big[op.slow](acc, value);
            }
            return acc;
        };
    }
    def('bitwise-and', 0, -1,
        bitwise('bitwise-and', { fast: function (left, right) { return left & right; }, slow: 'and' }, -1));
    def('bitwise-ior', 0, -1,
        bitwise('bitwise-ior', { fast: function (left, right) { return left | right; }, slow: 'or' }, 0));
    def('bitwise-xor', 0, -1,
        bitwise('bitwise-xor', { fast: function (left, right) { return left ^ right; }, slow: 'xor' }, 0));
    S.alias('bitwise-or', 'bitwise-ior');
    def('bitwise-not', 1, 1, function (value) {
        if (!N.isExactInteger(value))
            fail('bitwise-not', 'an exact integer', value);
        return T.big.not(value);
    });
    def('arithmetic-shift', 2, 2, function (value, shift) {
        if (!N.isExactInteger(value))
            fail('arithmetic-shift', 'an exact integer', value);
        if (typeof shift !== 'number' || !Number.isInteger(shift))
            fail('arithmetic-shift', 'a fixnum', shift);
        if (shift > 1e6)
            throw S.error('arithmetic-shift: shift too large', [shift]);
        return shift >= 0 ? T.big.shl(value, shift) : T.big.shr(value, -shift);
    });
    S.alias('shift-left', 'arithmetic-shift');
    def('bit-count', 1, 1, function (value) {
        if (!N.isExactInteger(value))
            fail('bit-count', 'an exact integer', value);
        var text = T.big.str(T.big.sign(value) < 0 ? T.big.not(value) : value, 2);
        return text.replace(/0/g, '').length;
    });
    def('integer-length', 1, 1, function (value) {
        if (!N.isExactInteger(value))
            fail('integer-length', 'an exact integer', value);
        return T.big.bitLength(value);
    });

    // --- Booleans

    def('not', 1, 1, function (value) { return value === false; }, {
        bool: true,
        inline: function (args) { return J.bin('===', args[0], J.bool(false)); }
    });
    def('boolean?', 1, 1, function (value) { return typeof value === 'boolean'; }, { bool: true });
    def('boolean=?', 2, -1, function () {
        for (var index = 0; index < arguments.length; ++index) {
            if (typeof arguments[index] !== 'boolean')
                fail('boolean=?', 'a boolean', arguments[index]);
        }
        for (var position = 0; position + 1 < arguments.length; ++position) {
            if (arguments[position] !== arguments[position + 1])
                return false;
        }
        return true;
    }, { bool: true });

    // --- Pairs and lists

    function pairInline(field, name) {
        return function (args, fn) {
            var prepared = prepare(args, fn);
            var operand = prepared.values[0];
            return S.withSetup(prepared.setup,
                               J.cond(J.bin('instanceof', operand, J.id('$Pair')), J.mem(operand, field),
                                      J.call(J.mem(J.id('$S'), name), [operand])));
        };
    }
    function car(value) { return pair('car', value).car; }
    function cdr(value) { return pair('cdr', value).cdr; }
    S.Machine.prototype.car = car;
    S.Machine.prototype.cdr = cdr;
    def('car', 1, 1, car, { inline: pairInline('car', 'car') });
    def('cdr', 1, 1, cdr, { inline: pairInline('cdr', 'cdr') });
    def('cons', 2, 2, function (head, tail) { return new Pair(head, tail); }, {
        inline: function (args) { return J.new_(J.id('$Pair'), args); }
    });
    def('pair?', 1, 1, function (value) { return value instanceof Pair; }, {
        bool: true,
        inline: function (args) { return J.bin('instanceof', args[0], J.id('$Pair')); }
    });
    def('null?', 1, 1, function (value) { return value === NIL; }, {
        bool: true,
        inline: function (args) { return J.bin('===', args[0], J.id('$NIL')); }
    });
    def('set-car!', 2, 2, function (target, value) { pair('set-car!', target).car = value; return UNSPEC; });
    def('set-cdr!', 2, 2, function (target, value) { pair('set-cdr!', target).cdr = value; return UNSPEC; });
    // c[ad]{2,4}r
    ['aa', 'ad', 'da', 'dd', 'aaa', 'aad', 'ada', 'add', 'daa', 'dad', 'dda', 'ddd', 'aaaa', 'aaad', 'aada', 'aadd', 'adaa',
     'adad', 'adda', 'addd', 'daaa', 'daad', 'dada', 'dadd', 'ddaa', 'ddad', 'ddda', 'dddd'].forEach(function (path) {
        var name = 'c' + path + 'r';
        def(name, 1, 1, function (value) {
            var original = value;
            for (var index = path.length - 1; index >= 0; --index) {
                if (!(value instanceof Pair))
                    throw S.error(name + ': bad argument', [original]);
                value = path.charAt(index) === 'a' ? value.car : value.cdr;
            }
            return value;
        });
    });
    def('list?', 1, 1, S.isList, { bool: true });
    def('list', 0, -1, function () {
        var result = NIL;
        for (var index = arguments.length - 1; index >= 0; --index)
            result = new Pair(arguments[index], result);
        return result;
    }, {
        inline: function (args) {
            if (args.length > 8)
                return null;
            var result = J.id('$NIL');
            for (var index = args.length - 1; index >= 0; --index)
                result = J.new_(J.id('$Pair'), [args[index], result]);
            return result;
        }
    });
    def('make-list', 1, 2, function (length, fill) {
        natural('make-list', length);
        var result = NIL;
        for (var index = 0; index < length; ++index)
            result = new Pair(fill === undefined ? UNSPEC : fill, result);
        return result;
    });
    def('length', 1, 1, function (tail) {
        var count = 0;
        var start = tail;
        var slow = tail;
        while (tail instanceof Pair) {
            tail = tail.cdr;
            ++count;
            if ((count & 1) === 0) {
                slow = slow.cdr;
                if (slow === tail && tail instanceof Pair)
                    throw S.error('length: not a list (circular)', []);
            }
        }
        if (tail !== NIL)
            throw S.error('length: not a list', [start]);
        return count;
    });
    def('append', 0, -1, function () {
        if (arguments.length === 0)
            return NIL;
        var result = arguments[arguments.length - 1];
        for (var index = arguments.length - 2; index >= 0; --index) {
            var items = list('append', arguments[index]);
            for (var position = items.length - 1; position >= 0; --position)
                result = new Pair(items[position], result);
        }
        return result;
    });
    def('reverse', 1, 1, function (tail) {
        var result = NIL;
        var start = tail;
        while (tail instanceof Pair) {
            result = new Pair(tail.car, result);
            tail = tail.cdr;
        }
        if (tail !== NIL)
            throw S.error('reverse: not a list', [start]);
        return result;
    });
    function listTail(name, tail, count) {
        natural(name, count);
        var start = tail;
        for (var index = 0; index < count; ++index) {
            if (!(tail instanceof Pair))
                throw S.error(name + ': index out of range', [start, count]);
            tail = tail.cdr;
        }
        return tail;
    }
    def('list-tail', 2, 2, function (tail, count) { return listTail('list-tail', tail, count); });
    def('list-ref', 2, 2, function (value, position) {
        var tail = listTail('list-ref', value, position);
        if (!(tail instanceof Pair))
            throw S.error('list-ref: index out of range', [value, position]);
        return tail.car;
    });
    def('list-set!', 3, 3, function (target, position, value) {
        var tail = listTail('list-set!', target, position);
        if (!(tail instanceof Pair))
            throw S.error('list-set!: index out of range', [target, position]);
        tail.car = value;
        return UNSPEC;
    });
    function member(name, test) {
        return function (item, tail) {
            var start = tail;
            while (tail instanceof Pair) {
                if (test(item, tail.car))
                    return tail;
                tail = tail.cdr;
            }
            if (tail !== NIL)
                throw S.error(name + ': not a list', [start]);
            return false;
        };
    }
    function assoc(name, test) {
        return function (item, tail) {
            var start = tail;
            while (tail instanceof Pair) {
                var entry = tail.car;
                if (!(entry instanceof Pair))
                    throw S.error(name + ': not an association list', [start]);
                if (test(item, entry.car))
                    return entry;
                tail = tail.cdr;
            }
            if (tail !== NIL)
                throw S.error(name + ': not a list', [start]);
            return false;
        };
    }
    def('memq', 2, 2, member('memq', function (left, right) { return left === right; }));
    def('memv', 2, 2, member('memv', eqv));
    def('%member', 2, 2, member('member', isEqual));
    def('assq', 2, 2, assoc('assq', function (left, right) { return left === right; }));
    def('assv', 2, 2, assoc('assv', eqv));
    def('%assoc', 2, 2, assoc('assoc', isEqual));
    def('list-copy', 1, 1, function (tail) {
        var items = [];
        while (tail instanceof Pair) {
            items.push(tail.car);
            tail = tail.cdr;
        }
        return S.arrayToList(items, tail);
    });
    def('last-pair', 1, 1, function (tail) {
        pair('last-pair', tail);
        while (tail.cdr instanceof Pair)
            tail = tail.cdr;
        return tail;
    });

    // --- Symbols

    def('symbol?', 1, 1, function (value) { return value instanceof Sym; }, { bool: true });
    def('symbol=?', 2, -1, function () {
        for (var index = 0; index < arguments.length; ++index)
            symbol('symbol=?', arguments[index]);
        for (var position = 0; position + 1 < arguments.length; ++position) {
            if (arguments[position] !== arguments[position + 1])
                return false;
        }
        return true;
    }, { bool: true });
    def('symbol->string', 1, 1, function (value) { return S.str(symbol('symbol->string', value).name); });
    def('string->symbol', 1, 1, function (value) { return S.intern(string('string->symbol', value).s); });
    def('string->uninterned-symbol', 1, 1, function (value) {
        return S.uninterned(string('string->uninterned-symbol', value).s);
    });
    var gensymCounter = 0;
    def('gensym', 0, 1, function (prefix) {
        var base = prefix === undefined ? 'g' : (prefix instanceof SString ? prefix.s : S.write(prefix, 'display'));
        return new Sym(base + (++gensymCounter));
    });
    def('symbol-append', 0, -1, function () {
        return S.intern(slice.call(arguments).map(function (item) {
            return symbol('symbol-append', item).name;
        }).join(''));
    });

    // --- Characters

    function charCompare(name, map, test) {
        return function () {
            for (var index = 0; index < arguments.length; ++index)
                character(name, arguments[index]);
            for (var position = 0; position + 1 < arguments.length; ++position) {
                if (!test(map(arguments[position].code), map(arguments[position + 1].code)))
                    return false;
            }
            return true;
        };
    }
    function same(code) { return code; }
    function fold(code) { return foldChar(code); }
    var compares = { '=': function (left, right) {
        return left === right;
    }, '<': function (left, right) { return left < right; },
                     '>': function (left, right) {
                         return left > right;
                     }, '<=': function (left, right) { return left <= right; },
                     '>=': function (left, right) { return left >= right; } };
    Object.keys(compares).forEach(function (op) {
        def('char' + op + '?', 1, -1, charCompare('char' + op + '?', same, compares[op]), { bool: true });
        def('char-ci' + op + '?', 1, -1, charCompare('char-ci' + op + '?', fold, compares[op]), { bool: true });
    });

    // The code of the only code point of a string or -1.
    function single(text) {
        var code = text.codePointAt(0);
        return text.length === (code > 0xFFFF ? 2 : 1) ? code : -1;
    }
    // The case changes only if the result is one character (ß -> SS does not).
    function upcase(code) {
        var result = single(String.fromCodePoint(code).toUpperCase());
        return result < 0 ? code : result;
    }
    function downcase(code) {
        var result = single(String.fromCodePoint(code).toLowerCase());
        return result < 0 ? code : result;
    }
    function foldChar(code) {
        if (code === 0x130 || code === 0x131)
            return code;
        return downcase(upcase(code));
    }
    // Unicode classes: \p{...} if the engine knows them; otherwise by the
    // case and the known digit ranges.
    function property(name) {
        try {
            return new RegExp('^\\p{' + name + '}$', 'u');
        } catch (error) {
            return null;
        }
    }
    var LETTER = property('L'), NUMERIC = property('Nd');
    var DIGIT_ZEROS = [0x30, 0x660, 0x6F0, 0x7C0, 0x966, 0x9E6, 0xA66, 0xAE6, 0xB66, 0xBE6, 0xC66, 0xCE6, 0xD66, 0xE50, 0xED0,
                       0xF20, 0x1040, 0x17E0, 0x1810, 0xFF10];
    function isNumeric(code) {
        if (NUMERIC !== null)
            return NUMERIC.test(String.fromCodePoint(code));
        for (var index = 0; index < DIGIT_ZEROS.length; ++index) {
            if (code >= DIGIT_ZEROS[index] && code < DIGIT_ZEROS[index] + 10)
                return true;
        }
        return false;
    }
    function isAlphabetic(code) {
        var text = String.fromCodePoint(code);
        if (LETTER !== null)
            return LETTER.test(text);
        return text.toUpperCase() !== text.toLowerCase() || (code >= 0x4E00 && code <= 0x9FFF) ||
            (code >= 0x3040 && code <= 0x30FF) || (code >= 0xAC00 && code <= 0xD7A3) || (code >= 0x5D0 && code <= 0x5EA) ||
            (code >= 0x620 && code <= 0x64A) || code === 0xAA || code === 0xBA;
    }
    function isUpper(code) {
        var text = String.fromCodePoint(code);
        return text.toLowerCase() !== text && text.toUpperCase() === text;
    }
    function isLower(code) {
        var text = String.fromCodePoint(code);
        return text.toUpperCase() !== text && text.toLowerCase() === text;
    }
    function isWhitespace(code) {
        return /\s/.test(String.fromCodePoint(code));
    }
    S.charClass = { alphabetic: isAlphabetic, upper: isUpper, lower: isLower, numeric: isNumeric, whitespace: isWhitespace,
                    upcase: upcase, downcase: downcase, fold: foldChar };

    def('char?', 1, 1, function (value) { return value instanceof Char; }, { bool: true });
    def('char-alphabetic?', 1, 1, function (value) { return isAlphabetic(character('char-alphabetic?', value).code); },
        { bool: true });
    def('char-numeric?', 1, 1, function (value) { return isNumeric(character('char-numeric?', value).code); },
        { bool: true });
    def('char-whitespace?', 1, 1, function (value) { return isWhitespace(character('char-whitespace?', value).code); },
        { bool: true });
    def('char-upper-case?', 1, 1, function (value) { return isUpper(character('char-upper-case?', value).code); },
        { bool: true });
    def('char-lower-case?', 1, 1, function (value) { return isLower(character('char-lower-case?', value).code); },
        { bool: true });
    def('digit-value', 1, 1, function (value) {
        var code = character('digit-value', value).code;
        if (!isNumeric(code))
            return false;
        // Unicode decimal digits go in a row from the zero of their system.
        var zero = code;
        while (zero > 0 && isNumeric(zero - 1) && code - (zero - 1) < 10)
            --zero;
        return code - zero;
    });
    def('char->integer', 1, 1, function (value) { return character('char->integer', value).code; });
    def('integer->char', 1, 1, function (code) {
        if (typeof code !== 'number' || !Number.isInteger(code) || code < 0 || code > 0x10FFFF ||
            (code >= 0xD800 && code <= 0xDFFF))
            throw S.error('integer->char: not a Unicode scalar value', [code]);
        return S.char(code);
    });
    def('char-upcase', 1, 1, function (value) { return S.char(upcase(character('char-upcase', value).code)); });
    def('char-downcase', 1, 1, function (value) { return S.char(downcase(character('char-downcase', value).code)); });
    def('char-foldcase', 1, 1, function (value) { return S.char(foldChar(character('char-foldcase', value).code)); });

    // --- Strings

    def('string?', 1, 1, function (value) { return value instanceof SString; }, { bool: true });
    def('make-string', 1, 2, function (length, fillCharacter) {
        natural('make-string', length);
        var fill = fillCharacter === undefined
            ? ' '
            : String.fromCodePoint(character('make-string', fillCharacter).code);
        return S.str(new Array(length + 1).join(fill));
    });
    def('string', 0, -1, function () {
        var parts = [];
        for (var index = 0; index < arguments.length; ++index) {
            var value = arguments[index];
            if (value instanceof Char)
                parts.push(String.fromCodePoint(value.code));
            else
                fail('string', 'a character', value);
        }
        return S.str(parts.join(''));
    });
    def('string-length', 1, 1, function (text) { return string('string-length', text).length(); });
    function stringRef(text, position) {
        string('string-ref', text);
        if (typeof position === 'number' && (position >>> 0) === position && text.a === 0 && position < text.s.length)
            return S.char(text.s.charCodeAt(position));
        index('string-ref', position, text.length(), text);
        return S.char(text.ref(position));
    }
    S.Machine.prototype.stringRef = stringRef;
    def('string-ref', 2, 2, stringRef);
    def('string-set!', 3, 3, function (text, position, value) {
        string('string-set!', text);
        index('string-set!', position, text.length(), text);
        character('string-set!', value);
        if (!text.astral() && value.code < 0x10000) {
            text.set(text.s.substring(0, position) + String.fromCharCode(value.code) + text.s.substring(position + 1));
        } else {
            var codes = text.codes();
            codes[position] = value.code;
            text.set(S.codesToString(codes));
        }
        return UNSPEC;
    });
    function stringCompare(name, map, test) {
        return function () {
            for (var index = 0; index < arguments.length; ++index)
                string(name, arguments[index]);
            for (var position = 0; position + 1 < arguments.length; ++position) {
                if (!test(compareText(map(arguments[position].s), map(arguments[position + 1].s)), 0))
                    return false;
            }
            return true;
        };
    }
    // Comparison by code points (not by UTF-16 units).
    function compareText(left, right) {
        if (left === right)
            return 0;
        var length = Math.min(left.length, right.length);
        for (var index = 0; index < length; ++index) {
            var leftCode = left.codePointAt(index), rightCode = right.codePointAt(index);
            if (leftCode !== rightCode)
                return leftCode < rightCode ? -1 : 1;
            if (leftCode > 0xFFFF)
                ++index;
        }
        return left.length < right.length ? -1 : (left.length > right.length ? 1 : 0);
    }
    S.compareText = compareText;
    function foldString(text) {
        return text.toUpperCase().toLowerCase();
    }
    S.foldString = foldString;
    Object.keys(compares).forEach(function (op) {
        def('string' + op + '?', 1, -1, stringCompare('string' + op + '?', same, compares[op]), { bool: true });
        def('string-ci' + op + '?', 1, -1, stringCompare('string-ci' + op + '?', foldString, compares[op]), { bool: true });
    });
    def('string-upcase', 1, 1, function (text) { return S.str(string('string-upcase', text).s.toUpperCase()); });
    def('string-downcase', 1, 1, function (text) { return S.str(string('string-downcase', text).s.toLowerCase()); });
    def('string-foldcase', 1, 1, function (text) { return S.str(foldString(string('string-foldcase', text).s)); });
    function substring(name, text, start, end) {
        string(name, text);
        var bounds = range(name, start, end, text.length(), text);
        return S.str(text.slice(bounds[0], bounds[1]));
    }
    S.substring = substring;
    def('substring', 2, 3, function (text, start, end) { return substring('substring', text, start, end); });
    def('string-copy', 1, 3, function (text, start, end) { return substring('string-copy', text, start, end); });
    def('string-append', 0, -1, function () {
        var parts = [];
        for (var index = 0; index < arguments.length; ++index)
            parts.push(string('string-append', arguments[index]).s);
        return S.str(parts.join(''));
    });
    def('string->list', 1, 3, function (text, start, end) {
        string('string->list', text);
        var bounds = range('string->list', start, end, text.length(), text);
        var codes = text.astral() ? text.codes() : null;
        var result = NIL;
        for (var index = bounds[1] - 1; index >= bounds[0]; --index)
            result = new Pair(S.char(codes === null ? text.s.charCodeAt(index) : codes[index]), result);
        return result;
    });
    def('list->string', 1, 1, function (value) {
        var items = list('list->string', value);
        return S.str(items.map(function (item) {
            return String.fromCodePoint(character('list->string', item).code);
        }).join(''));
    });
    def('string-copy!', 3, 5, function (to, at, from, start, end) {
        string('string-copy!', to);
        string('string-copy!', from);
        var bounds = range('string-copy!', start, end, from.length(), from);
        natural('string-copy!', at);
        if (at + bounds[1] - bounds[0] > to.length())
            throw S.error('string-copy!: destination too small', [to, at]);
        var piece = from.slice(bounds[0], bounds[1]);
        if (!to.astral() && !from.astral()) {
            to.set(to.s.substring(0, at) + piece + to.s.substring(at + piece.length));
        } else {
            var codes = to.codes();
            var pieceCodes = S.str(piece).codes();
            for (var index = 0; index < pieceCodes.length; ++index)
                codes[at + index] = pieceCodes[index];
            to.set(S.codesToString(codes));
        }
        return UNSPEC;
    });
    def('string-fill!', 2, 4, function (text, value, start, end) {
        string('string-fill!', text);
        character('string-fill!', value);
        var bounds = range('string-fill!', start, end, text.length(), text);
        var codes = text.codes();
        for (var index = bounds[0]; index < bounds[1]; ++index)
            codes[index] = value.code;
        text.set(S.codesToString(codes));
        return UNSPEC;
    });
    def('string->vector', 1, 3, function (text, start, end) {
        string('string->vector', text);
        var bounds = range('string->vector', start, end, text.length(), text);
        return text.codes().slice(bounds[0], bounds[1]).map(function (code) { return S.char(code); });
    });
    def('vector->string', 1, 3, function (items, start, end) {
        vector('vector->string', items);
        var bounds = range('vector->string', start, end, items.length, items);
        return S.str(items.slice(bounds[0], bounds[1]).map(function (item) {
            return String.fromCodePoint(character('vector->string', item).code);
        }).join(''));
    });
    def('string->utf8', 1, 3, function (text, start, end) {
        string('string->utf8', text);
        var bounds = range('string->utf8', start, end, text.length(), text);
        var bytes = T.utf8.encode(text.slice(bounds[0], bounds[1]));
        var result = new Uint8Array(bytes.length);
        for (var index = 0; index < bytes.length; ++index)
            result[index] = bytes.charCodeAt(index);
        return result;
    });
    def('utf8->string', 1, 3, function (bytes, start, end) {
        bytevector('utf8->string', bytes);
        var bounds = range('utf8->string', start, end, bytes.length, bytes);
        var text = '';
        for (var index = bounds[0]; index < bounds[1]; ++index)
            text += String.fromCharCode(bytes[index]);
        return S.str(T.utf8.decode(text));
    });

    // --- Vectors

    def('vector?', 1, 1, function (value) { return Array.isArray(value); }, { bool: true });
    def('make-vector', 1, 2, function (length, fill) {
        if (typeof length === 'number' && length < 0)
            throw S.error('make-vector: length must be non-negative', [length]);
        natural('make-vector', length);
        var result = new Array(length);
        var value = fill === undefined ? false : fill;
        for (var index = 0; index < length; ++index)
            result[index] = value;
        return result;
    });
    def('vector', 0, -1, function () { return slice.call(arguments); }, {
        inline: function (args) { return J.arr(args); }
    });
    function vectorLength(items) { return vector('vector-length', items).length; }
    function vectorRef(items, position) {
        vector('vector-ref', items);
        if (typeof position === 'number' && !Number.isInteger(position))
            throw S.error('vector-ref: not an exact integer', [position]);
        return items[index('vector-ref', position, items.length, items)];
    }
    function vectorSet(items, position, value) {
        vector('vector-set!', items);
        items[index('vector-set!', position, items.length, items)] = value;
        return UNSPEC;
    }
    S.Machine.prototype.vectorLength = vectorLength;
    S.Machine.prototype.vectorRef = vectorRef;
    S.Machine.prototype.vectorSet = vectorSet;
    function isIndex(position, items) {
        return J.and(J.bin('===', J.bin('>>>', position, J.num(0)), position),
                     J.bin('<', position, J.mem(items, 'length')));
    }
    def('vector-length', 1, 1, vectorLength, {
        inline: function (args, fn) {
            var prepared = prepare(args, fn);
            var items = prepared.values[0];
            return S.withSetup(prepared.setup, J.cond(J.bin('instanceof', items, J.id('Array')), J.mem(items, 'length'),
                                                       J.call(J.mem(J.id('$S'), 'vectorLength'), [items])));
        }
    });
    def('vector-ref', 2, 2, vectorRef, {
        inline: function (args, fn) {
            var prepared = prepare(args, fn);
            var items = prepared.values[0], position = prepared.values[1];
            return S.withSetup(prepared.setup,
                               J.cond(J.and(J.bin('instanceof', items, J.id('Array')), isIndex(position, items)),
                                      J.idx(items, position),
                                      J.call(J.mem(J.id('$S'), 'vectorRef'), [items, position])));
        }
    });
    def('vector-set!', 3, 3, vectorSet, {
        inline: function (args, fn) {
            var prepared = prepare(args, fn);
            var items = prepared.values[0], position = prepared.values[1], value = prepared.values[2];
            return S.withSetup(prepared.setup,
                               J.cond(J.and(J.bin('instanceof', items, J.id('Array')), isIndex(position, items)),
                                      J.seq([J.assign(J.idx(items, position), value), J.id('$U')]),
                                      J.call(J.mem(J.id('$S'), 'vectorSet'), [items, position, value])));
        }
    });
    def('vector->list', 1, 3, function (items, start, end) {
        vector('vector->list', items);
        var bounds = range('vector->list', start, end, items.length, items);
        return S.arrayToList(items.slice(bounds[0], bounds[1]));
    });
    def('list->vector', 1, 1, function (value) { return list('list->vector', value); });
    def('vector-copy', 1, 3, function (items, start, end) {
        vector('vector-copy', items);
        var bounds = range('vector-copy', start, end, items.length, items);
        return items.slice(bounds[0], bounds[1]);
    });
    def('vector-copy!', 3, 5, function (to, at, from, start, end) {
        vector('vector-copy!', to);
        vector('vector-copy!', from);
        natural('vector-copy!', at);
        var bounds = range('vector-copy!', start, end, from.length, from);
        if (at + bounds[1] - bounds[0] > to.length)
            throw S.error('vector-copy!: destination too small', [to, at]);
        var piece = from.slice(bounds[0], bounds[1]);
        for (var index = 0; index < piece.length; ++index)
            to[at + index] = piece[index];
        return UNSPEC;
    });
    def('vector-append', 0, -1, function () {
        var result = [];
        for (var index = 0; index < arguments.length; ++index)
            result = result.concat(vector('vector-append', arguments[index]));
        return result;
    });
    def('vector-fill!', 2, 4, function (items, value, start, end) {
        vector('vector-fill!', items);
        var bounds = range('vector-fill!', start, end, items.length, items);
        for (var index = bounds[0]; index < bounds[1]; ++index)
            items[index] = value;
        return UNSPEC;
    });

    // --- Bytevectors

    function byte(name, value) {
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 255)
            fail(name, 'a byte', value);
        return value;
    }
    def('bytevector?', 1, 1, function (value) { return value instanceof Uint8Array; }, { bool: true });
    def('make-bytevector', 1, 2, function (length, fill) {
        natural('make-bytevector', length);
        var result = new Uint8Array(length);
        if (fill !== undefined)
            result.fill(byte('make-bytevector', fill));
        return result;
    });
    def('bytevector', 0, -1, function () {
        var result = new Uint8Array(arguments.length);
        for (var index = 0; index < arguments.length; ++index)
            result[index] = byte('bytevector', arguments[index]);
        return result;
    });
    def('bytevector-length', 1, 1, function (bytes) { return bytevector('bytevector-length', bytes).length; });
    def('bytevector-u8-ref', 2, 2, function (bytes, position) {
        bytevector('bytevector-u8-ref', bytes);
        return bytes[index('bytevector-u8-ref', position, bytes.length, bytes)];
    });
    def('bytevector-u8-set!', 3, 3, function (bytes, position, value) {
        bytevector('bytevector-u8-set!', bytes);
        bytes[index('bytevector-u8-set!', position, bytes.length, bytes)] = byte('bytevector-u8-set!', value);
        return UNSPEC;
    });
    def('bytevector-copy', 1, 3, function (bytes, start, end) {
        bytevector('bytevector-copy', bytes);
        var bounds = range('bytevector-copy', start, end, bytes.length, bytes);
        return bytes.slice(bounds[0], bounds[1]);
    });
    def('bytevector-copy!', 3, 5, function (to, at, from, start, end) {
        bytevector('bytevector-copy!', to);
        bytevector('bytevector-copy!', from);
        natural('bytevector-copy!', at);
        var bounds = range('bytevector-copy!', start, end, from.length, from);
        if (at + bounds[1] - bounds[0] > to.length)
            throw S.error('bytevector-copy!: destination too small', [to, at]);
        to.set(from.slice(bounds[0], bounds[1]), at);
        return UNSPEC;
    });
    def('bytevector-append', 0, -1, function () {
        var total = 0;
        for (var index = 0; index < arguments.length; ++index)
            total += bytevector('bytevector-append', arguments[index]).length;
        var result = new Uint8Array(total);
        var at = 0;
        for (var position = 0; position < arguments.length; ++position) {
            result.set(arguments[position], at);
            at += arguments[position].length;
        }
        return result;
    });

    // --- Control

    def('procedure?', 1, 1, function (value) { return typeof value === 'function'; }, { bool: true });

    defCps('apply', 1, -1, function ($k, callee) {
        procedure('apply', callee);
        var args = slice.call(arguments, 2);
        if (args.length > 0) {
            var last = args.pop();
            var items = S.listToArray(last);
            if (items === null)
                throw S.error('apply: not a list', [last]);
            args = args.concat(items);
        }
        return callee.apply(null, [$k].concat(args));
    });

    defCps('call-with-current-continuation', 1, 1, function ($k, receiver) {
        procedure('call-with-current-continuation', receiver);
        return receiver($k, S.machine.capture($k));
    });
    S.alias('call/cc', 'call-with-current-continuation');

    def('values', 0, -1, function (value) {
        return arguments.length === 1 ? value : new Values(slice.call(arguments));
    }, {
        inline: function (args) { return args.length === 1 ? args[0] : null; }
    });
    defCps('call-with-values', 2, 2, function ($k, producer, consumer) {
        procedure('call-with-values', producer);
        procedure('call-with-values', consumer);
        return producer(function (value) {
            var args = value instanceof Values ? value.list : [value];
            return consumer.apply(null, [$k].concat(args));
        });
    });

    defCps('dynamic-wind', 3, 3, function ($k, before, thunk, after) {
        procedure('dynamic-wind', before);
        procedure('dynamic-wind', thunk);
        procedure('dynamic-wind', after);
        var machine = S.machine;
        return before(function () {
            var winder = new S.Winder(before, after, machine.winders);
            machine.winders = winder;
            return thunk(function (result) {
                machine.winders = winder.parent;
                return after(function () { return $k(result); });
            });
        });
    });

    // --- Exceptions

    defCps('raise', 1, 1, function ($k, obj) {
        return S.machine.raise($k, obj, false);
    });
    defCps('raise-continuable', 1, 1, function ($k, obj) {
        return S.machine.raise($k, obj, true);
    });
    defCps('with-exception-handler', 2, 2, function ($k, handler, thunk) {
        procedure('with-exception-handler', handler);
        procedure('with-exception-handler', thunk);
        return S.machine.withHandler($k, handler, thunk);
    });
    function makeError(message, irritants) {
        var text = message instanceof SString ? message.s : S.write(message, 'display');
        var made = new S.ErrorObject(text, S.arrayToList(irritants), '');
        made.stack = new Error(text).stack;
        made.messageValue = message;
        return made;
    }
    defCps('error', 1, -1, function ($k, message) {
        return S.machine.raise($k, makeError(message, slice.call(arguments, 2)), false);
    });
    defCps('%assertion-failed', 1, 1, function ($k, expression) {
        return S.machine.raise($k, makeError(S.str('assertion failed:'), [expression]), false);
    });
    def('error-object?', 1, 1, function (value) { return value instanceof S.ErrorObject; }, { bool: true });
    def('error-object-message', 1, 1, function (value) {
        if (!(value instanceof S.ErrorObject))
            fail('error-object-message', 'an error object', value);
        return value.messageValue !== undefined ? value.messageValue : S.str(value.message);
    });
    def('error-object-irritants', 1, 1, function (value) {
        if (!(value instanceof S.ErrorObject))
            fail('error-object-irritants', 'an error object', value);
        return value.irritants;
    });
    def('read-error?', 1, 1, function (value) { return value instanceof S.ErrorObject && value.kind === 'read'; },
        { bool: true });
    def('file-error?', 1, 1, function (value) { return value instanceof S.ErrorObject && value.kind === 'file'; },
        { bool: true });
    def('error-message', 1, 1, function (value) { return S.prims['error-object-message'].fn(value); });
    def('condition/report-string', 1, 1, function (value) { return S.str(S.describeCondition(value)); });

    // guard: the body runs with a handler that goes to the continuation of
    // guard and checks the clauses there; when none fits - raise-continuable
    // where the exception was (R7RS 4.2.7).
    defCps('%guard', 2, 2, function ($k, body, clauses) {
        var machine = S.machine;
        var guardWinders = machine.winders, guardHandlers = machine.handlers, guardParams = machine.params;
        var handler = function (raiseK, condition) {
            var raiseWinders = machine.winders, raiseHandlers = machine.handlers, raiseParams = machine.params;
            return machine.rewind(guardWinders, function () {
                machine.handlers = guardHandlers;
                machine.params = guardParams;
                return clauses(function (result) {
                    if (result !== S.NO_MATCH)
                        return $k(result);
                    return machine.rewind(raiseWinders, function () {
                        machine.handlers = raiseHandlers;
                        machine.params = raiseParams;
                        return machine.raise(raiseK, condition, true);
                    });
                }, condition);
            });
        };
        return machine.withHandler($k, handler, body);
    });

    // --- Promises (delay, delay-force, make-promise, force)

    // A promise is { box: { done, value } }; one not ready keeps a thunk that
    // returns a promise (delay wraps the value into a ready one).
    def('%delay', 2, 2, function (thunk, isForce) {
        if (isForce)
            return new S.Promise(false, thunk);
        return new S.Promise(false, function ($k) {
            return thunk(function (value) { return $k(new S.Promise(true, value)); });
        });
    });
    def('make-promise', 1, 1, function (value) {
        return value instanceof S.Promise ? value : new S.Promise(true, value);
    });
    def('promise?', 1, 1, function (value) { return value instanceof S.Promise; }, { bool: true });
    // force as in the R7RS sample: a chain of delay-force runs as a loop, in
    // constant space.
    defCps('force', 1, 1, function ($k, promise) {
        if (!(promise instanceof S.Promise))
            return $k(promise);
        function step() {
            var box = promise.box;
            if (box.done)
                return $k(box.value);
            return box.value(function (next) {
                if (!(next instanceof S.Promise))
                    throw S.error('force: delay-force body did not return a promise', [next]);
                if (!promise.box.done) {
                    promise.box.done = next.box.done;
                    promise.box.value = next.box.value;
                    next.box = promise.box;
                }
                return step();
            });
        }
        return step();
    });

    // --- Parameters

    function lookupParam(param) {
        for (var node = S.machine.params; node !== null; node = node.next) {
            if (node.param === param)
                return node;
        }
        return null;
    }
    function makeParameter(value, converter) {
        var param = function ($k, newValue) {
            if (newValue !== undefined) {
                // A call with an argument changes the current value (as in chibi).
                var bound = lookupParam(param);
                if (bound !== null)
                    bound.value = newValue;
                else
                    param.$param.value = newValue;
                return $k(UNSPEC);
            }
            var node = lookupParam(param);
            return $k(node !== null ? node.value : param.$param.value);
        };
        param.$param = { value: value, converter: converter };
        return param;
    }
    defCps('make-parameter', 1, 2, function ($k, value, converter) {
        if (converter === undefined)
            return $k(makeParameter(value, null));
        procedure('make-parameter', converter);
        return converter(function (converted) { return $k(makeParameter(converted, converter)); }, value);
    });
    defCps('%parameterize', 3, 3, function ($k, params, values, body) {
        var machine = S.machine;
        var paramList = S.listToArray(params), valueList = S.listToArray(values);
        var converted = [];
        function convert(index) {
            if (index === paramList.length) {
                var saved = machine.params;
                var node = saved;
                paramList.forEach(function (param, position) {
                    node = { param: param, value: converted[position], next: node };
                });
                machine.params = node;
                return body(function (result) {
                    machine.params = saved;
                    return $k(result);
                });
            }
            var param = paramList[index];
            if (typeof param !== 'function' || param.$param === undefined)
                throw S.error('parameterize: not a parameter', [param]);
            var converter = param.$param.converter;
            if (converter === null) {
                converted[index] = valueList[index];
                return convert(index + 1);
            }
            return converter(function (value) {
                converted[index] = value;
                return convert(index + 1);
            }, valueList[index]);
        }
        return convert(0);
    });

    // --- Records

    // (%record 'name '(fields) '((constructor (fields)) (predicate) (accessor
    // f) (modifier f) ...)) -> the Values of the procedures in the order of
    // the spec.
    def('%record', 3, 3, function (name, fields, spec) {
        var fieldNames = S.listToArray(fields).map(function (field) { return field.name; });
        var type = new S.RecordType(name.name, fieldNames);
        var results = [type];
        var typeName = name.name;
        S.listToArray(spec).forEach(function (entry) {
            var parts = S.listToArray(entry);
            var kind = parts[0].name;
            if (kind === 'constructor') {
                var order = S.listToArray(parts[1]).map(function (field) { return fieldNames.indexOf(field.name); });
                var count = order.length;
                var ctor = function ($k) {
                    if (arguments.length - 1 !== count)
                        throw arityError(ctor.$name, count, count, arguments.length - 1);
                    var values = new Array(fieldNames.length);
                    for (var index = 0; index < values.length; ++index)
                        values[index] = false;
                    for (var position = 0; position < count; ++position)
                        values[order[position]] = arguments[position + 1];
                    return $k(new S.Record(type, values));
                };
                ctor.$name = 'make-' + typeName;
                results.push(ctor);
            } else if (kind === 'predicate') {
                results.push(directProc(typeName + '?', 1, function (record) {
                    return record instanceof S.Record && record.type === type;
                }));
            } else if (kind === 'accessor') {
                var position = fieldNames.indexOf(parts[1].name);
                results.push(directProc(parts[1].name, 1, function (record) {
                    if (!(record instanceof S.Record) || record.type !== type)
                        throw S.error(parts[1].name + ': not a ' + typeName, [record]);
                    return record.v[position];
                }));
            } else {
                var at = fieldNames.indexOf(parts[1].name);
                results.push(directProc(parts[1].name, 2, function (record, value) {
                    if (!(record instanceof S.Record) || record.type !== type)
                        throw S.error('set ' + parts[1].name + ': not a ' + typeName, [record]);
                    record.v[at] = value;
                    return UNSPEC;
                }));
            }
        });
        return new Values(results);
    });
    var arityError = S.arityError;
    function directProc(name, count, fn) {
        var proc = count === 1
            ? function ($k, argument, $x) {
                if (argument === undefined || $x !== undefined)
                    throw arityError(name, 1, 1, argument === undefined ? 0 : 2);
                return $k(fn(argument));
            }
            : function ($k, first, second, $x) {
                if (second === undefined || $x !== undefined)
                    throw arityError(name, 2, 2, second === undefined ? (first === undefined ? 0 : 1) : 3);
                return $k(fn(first, second));
            };
        proc.$name = name;
        return proc;
    }
    S.directProc = directProc;
    def('record?', 1, 1, function (value) { return value instanceof S.Record; }, { bool: true });

    // --- Process environment and time

    def('command-line', 0, 0, function () { return S.list(S.str('scheme')); });
    def('get-environment-variable', 1, 1, function (name) { string('get-environment-variable', name); return false; });
    def('get-environment-variables', 0, 0, function () { return NIL; });
    defCps('exit', 0, 1, function ($k, value) {
        throw new S.ExitSignal(value === undefined ? true : value);
    });
    S.alias('emergency-exit', 'exit');
    def('current-second', 0, 0, function () { return N.flo(Date.now() / 1000); });
    var jiffyBase = Date.now();
    def('current-jiffy', 0, 0, function () { return (Date.now() - jiffyBase) * 1000; });
    def('jiffies-per-second', 0, 0, function () { return 1000000; });
    def('features', 0, 0, function () { return S.arrayToList(S.features.map(S.intern)); });
    def('void', 0, -1, function () { return UNSPEC; });
})(globalThis);
