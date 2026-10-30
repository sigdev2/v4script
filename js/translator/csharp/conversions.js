// C#: conversions between types - identity, numeric, nullable, reference,
// boxing and unboxing, enum, user-defined - and the rules of overload
// resolution that compare them. Conversions of expressions (constants,
// lambdas, null, method groups) are in checker-expressions.js.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    if (CS.Conversions)
        return;

    var big = T.big;

    // Implicit numeric conversions by keyword.
    var IMPLICIT_NUMERIC = {
        sbyte: ['short', 'int', 'long', 'float', 'double', 'decimal'],
        byte: ['short', 'ushort', 'int', 'uint', 'long', 'ulong', 'float', 'double', 'decimal'],
        short: ['int', 'long', 'float', 'double', 'decimal'],
        ushort: ['int', 'uint', 'long', 'ulong', 'float', 'double', 'decimal'],
        int: ['long', 'float', 'double', 'decimal'],
        uint: ['long', 'ulong', 'float', 'double', 'decimal'],
        long: ['float', 'double', 'decimal'],
        ulong: ['float', 'double', 'decimal'],
        char: ['ushort', 'int', 'uint', 'long', 'ulong', 'float', 'double', 'decimal'],
        float: ['double'],
        double: [],
        decimal: []
    };

    // A signed integral type is a better target than these unsigned ones.
    var BETTER_SIGNED = { sbyte: ['byte', 'ushort', 'uint', 'ulong'], short: ['ushort', 'uint', 'ulong'],
                          int: ['uint', 'ulong'], long: ['ulong'] };

    // The ranges of the integral types.
    var RANGES = {
        sbyte: [-128, 127], byte: [0, 255], short: [-32768, 32767], ushort: [0, 65535], char: [0, 65535],
        int: [-2147483648, 2147483647], uint: [0, 4294967295]
    };
    var LONG_MIN = big.neg(big.pow(2, 63)), LONG_MAX = big.sub(big.pow(2, 63), 1), ULONG_MAX = big.sub(big.pow(2, 64), 1);

    function rangeOf(keyword) {
        if (keyword === 'long')
            return [LONG_MIN, LONG_MAX];
        if (keyword === 'ulong')
            return [0, ULONG_MAX];
        return RANGES[keyword];
    }

    function conversion(kind, from, to, extra) {
        var result = { kind: kind, from: from, to: to };
        if (extra)
            Object.keys(extra).forEach(function (key) { result[key] = extra[key]; });
        return result;
    }

    var Conversions = {
        IMPLICIT_NUMERIC: IMPLICIT_NUMERIC,
        rangeOf: rangeOf,

        isImplicitNumeric: function (from, to) {
            var source = CS.keywordOf(from), target = CS.keywordOf(to);
            if (source === null || target === null || IMPLICIT_NUMERIC[source] === undefined)
                return false;
            return IMPLICIT_NUMERIC[source].indexOf(target) >= 0;
        },

        // An integral constant fits the type (implicit constant conversions).
        constantFits: function (value, type) {
            var keyword = CS.keywordOf(type);
            if (CS.isEnum(type))
                keyword = CS.keywordOf(type.sym.complete().enumUnderlying);
            var range = rangeOf(keyword);
            if (range === undefined)
                return false;
            return big.cmp(value, range[0]) >= 0 && big.cmp(value, range[1]) <= 0;
        },

        // An implicit conversion between types (no user-defined ones).
        implicit: function (from, to) {
            if (CS.sameType(from, to))
                return conversion('identity', from, to);
            if (from.kind === 'dynamic')
                return conversion('dynamic', from, to);
            if (to.kind === 'dynamic')
                return CS.isValueType(from) ? conversion('boxing', from, to) : conversion('reference', from, to);
            if (from.kind === 'null') {
                if (CS.isNullableValue(to))
                    return conversion('nullLiteral', from, to);
                if (CS.isReferenceType(to) || (to.kind === 'tparam' && CS.typeParamIsReference(to.sym)))
                    return conversion('nullLiteral', from, to);
                return null;
            }
            if (Conversions.isImplicitNumeric(from, to))
                return conversion('numeric', from, to);
            // Nullable: T -> T?, S? -> T?.
            if (CS.isNullableValue(to)) {
                var target = to.args[0];
                if (CS.isNullableValue(from)) {
                    var inner = Conversions.implicit(from.args[0], target);
                    if (inner !== null && (inner.kind === 'identity' || inner.kind === 'numeric'))
                        return conversion('nullable', from, to, { inner: inner, lifted: true });
                    return null;
                }
                var wrap = Conversions.implicit(from, target);
                if (wrap !== null && (wrap.kind === 'identity' || wrap.kind === 'numeric'))
                    return conversion('nullable', from, to, { inner: wrap, lifted: false });
            }
            if (Conversions.isImplicitReference(from, to))
                return conversion('reference', from, to);
            if (Conversions.isBoxing(from, to))
                return conversion('boxing', from, to);
            // A type parameter to its constraints (reference or boxing at run time).
            if (from.kind === 'tparam' && Conversions.typeParamTo(from, to))
                return conversion(CS.typeParamIsReference(from.sym) ? 'reference' : 'boxing', from, to);
            // Tuples element by element.
            if (CS.isTuple(from) && CS.isTuple(to)) {
                var sources = CS.tupleElements(from), targets = CS.tupleElements(to);
                if (sources.length === targets.length) {
                    var elements = [];
                    for (var index = 0; index < sources.length; ++index) {
                        var element = Conversions.implicit(sources[index], targets[index]);
                        if (element === null)
                            return null;
                        elements.push(element);
                    }
                    return conversion('tuple', from, to, { elements: elements });
                }
            }
            return null;
        },

        // Reference conversions that need no check at run time.
        isImplicitReference: function (from, to) {
            if (!CS.isReferenceType(from) || from.kind === 'null')
                return false;
            if (from.kind === 'tparam')
                return CS.typeParamIsReference(from.sym) && Conversions.typeParamTo(from, to);
            if (CS.isSpecial(to, 'object') || to.kind === 'dynamic')
                return true;
            if (from.kind === 'array') {
                if (to.kind === 'array')
                    return from.rank === to.rank && CS.isReferenceType(from.elem) && CS.isReferenceType(to.elem) &&
                        Conversions.isImplicitReference(from.elem, to.elem) || (from.rank === to.rank && CS.sameType(from.elem, to.elem));
                if (to.kind !== 'named')
                    return false;
                if (to.sym.qname === 'System.Array' || to.sym.qname === 'System.Collections.IEnumerable' ||
                    to.sym.qname === 'System.Collections.ICollection' || to.sym.qname === 'System.Collections.IList' ||
                    to.sym.qname === 'System.ICloneable' || to.sym.qname === 'System.Collections.IStructuralEquatable')
                    return true;
                if (from.rank === 1 && CS.isInterface(to) && to.args.length === 1 &&
                    /^System\.Collections\.Generic\.I(Enumerable|Collection|List|ReadOnlyCollection|ReadOnlyList)$/.test(to.sym.qname))
                    return CS.sameType(from.elem, to.args[0]) ||
                        (CS.isReferenceType(from.elem) && Conversions.isImplicitReference(from.elem, to.args[0]));
                return false;
            }
            if (from.kind !== 'named' || to.kind !== 'named')
                return false;
            if (CS.isDelegate(from) && (to.sym.qname === 'System.Delegate' || to.sym.qname === 'System.MulticastDelegate'))
                return true;
            if (to.sym.kind === 'interface')
                return Conversions.implementsInterface(from, to);
            if (to.sym.kind === 'class') {
                var base = CS.baseTypeOf(from);
                while (base !== null) {
                    if (CS.sameType(base, to))
                        return true;
                    base = CS.baseTypeOf(base);
                }
                if (CS.isDelegate(from) && CS.isDelegate(to))
                    return Conversions.isVariantConvertible(from, to);
            }
            if (CS.isDelegate(to) && CS.isDelegate(from) && from.sym === to.sym)
                return Conversions.isVariantConvertible(from, to);
            return false;
        },

        // The type implements the interface (with variance).
        implementsInterface: function (from, to) {
            if (from.kind === 'named' && from.sym === to.sym && Conversions.isVariantConvertible(from, to))
                return true;
            var ifaces = CS.interfacesOf(from);
            for (var index = 0; index < ifaces.length; ++index) {
                var iface = ifaces[index];
                if (CS.sameType(iface, to))
                    return true;
                if (iface.sym === to.sym && Conversions.isVariantConvertible(iface, to))
                    return true;
            }
            return false;
        },

        // Generic variance: IEnumerable<string> to IEnumerable<object>,
        // Action<object> to Action<string>.
        isVariantConvertible: function (from, to) {
            if (from.sym !== to.sym || from.args.length !== to.args.length)
                return false;
            var params = from.sym.allTypeParams;
            for (var index = 0; index < from.args.length; ++index) {
                var source = from.args[index], target = to.args[index];
                if (CS.sameType(source, target))
                    continue;
                var variance = params[index].variance;
                if (variance === 'out' && CS.isReferenceType(source) && Conversions.isImplicitReference(source, target))
                    continue;
                if (variance === 'in' && CS.isReferenceType(target) && Conversions.isImplicitReference(target, source))
                    continue;
                return false;
            }
            return true;
        },

        // Value types to object, ValueType, Enum and their interfaces.
        isBoxing: function (from, to) {
            if (!CS.isValueType(from) || from.kind === 'tparam')
                return false;
            if (CS.isNullableValue(from))
                return Conversions.isBoxing(from.args[0], to);
            if (CS.isSpecial(to, 'object') || to.kind === 'dynamic')
                return true;
            if (to.kind !== 'named')
                return false;
            if (to.sym.qname === 'System.ValueType')
                return true;
            if (to.sym.qname === 'System.Enum')
                return CS.isEnum(from);
            if (to.sym.kind === 'interface')
                return Conversions.implementsInterface(from, to);
            return false;
        },

        // A type parameter converts to its constraints and their bases.
        typeParamTo: function (from, to) {
            if (CS.isSpecial(to, 'object'))
                return true;
            if (to.kind === 'tparam' && from.sym === to.sym)
                return true;
            var constraints = from.sym.constraints.types;
            for (var index = 0; index < constraints.length; ++index) {
                var bound = constraints[index];
                if (CS.sameType(bound, to))
                    return true;
                if (bound.kind === 'tparam' && Conversions.typeParamTo(bound, to))
                    return true;
                if (bound.kind !== 'tparam' && Conversions.implicit(bound, to) !== null &&
                    Conversions.implicit(bound, to).kind !== 'numeric')
                    return true;
            }
            if (to.kind === 'named' && to.sym.kind === 'interface')
                return CS.interfacesOf(from).some(function (iface) {
                    return CS.sameType(iface, to) || (iface.sym === to.sym && Conversions.isVariantConvertible(iface, to));
                });
            var base = CS.effectiveBaseClass(from.sym);
            return !CS.isSpecial(base, 'object') && Conversions.isImplicitReference(base, to);
        },

        isImplicitReferenceOrBoxingOrIdentity: function (from, to) {
            return CS.sameType(from, to) || Conversions.isImplicitReference(from, to) || Conversions.isBoxing(from, to) ||
                (from.kind === 'tparam' && Conversions.typeParamTo(from, to)) || from.kind === 'null' && CS.isReferenceType(to);
        },

        // An explicit conversion (the implicit ones too); no user-defined ones.
        explicit: function (from, to) {
            var implicit = Conversions.implicit(from, to);
            if (implicit !== null)
                return implicit;
            if (from.kind === 'dynamic' || to.kind === 'dynamic')
                return conversion('dynamic', from, to);
            var fromEnum = CS.isEnum(from), toEnum = CS.isEnum(to);
            if ((CS.isNumeric(from) || fromEnum) && (CS.isNumeric(to) || toEnum)) {
                if (fromEnum || toEnum)
                    return conversion('enum', from, to);
                return conversion('numeric', from, to, { explicit: true });
            }
            // Nullable explicit: T? -> T, S? -> T?, S -> T?, S? -> T.
            if (CS.isNullableValue(from) || CS.isNullableValue(to)) {
                var source = CS.underlyingNullable(from), target = CS.underlyingNullable(to);
                var inner = Conversions.explicit(source, target);
                if (inner !== null && (inner.kind === 'identity' || inner.kind === 'numeric' || inner.kind === 'enum'))
                    return conversion('nullable', from, to, { inner: inner, explicit: true,
                                                              lifted: CS.isNullableValue(from) && CS.isNullableValue(to) });
                if (CS.isNullableValue(to) && !CS.isNullableValue(from) && CS.isReferenceType(from) && Conversions.isUnboxing(from, target))
                    return conversion('unboxing', from, to);
            }
            if (Conversions.isExplicitReference(from, to))
                return conversion('reference', from, to, { checked: true });
            if (Conversions.isUnboxing(from, to))
                return conversion('unboxing', from, to);
            // To and from type parameters.
            if (from.kind === 'tparam' || to.kind === 'tparam') {
                if (to.kind === 'tparam' && (CS.isReferenceType(from) || CS.isInterface(from)))
                    return conversion('unboxing', from, to, { toTypeParam: true });
                if (from.kind === 'tparam' && (CS.isInterface(to) || CS.isReferenceType(to)))
                    return conversion('reference', from, to, { checked: true, fromTypeParam: true });
            }
            if (CS.isTuple(from) && CS.isTuple(to)) {
                var sources = CS.tupleElements(from), targets = CS.tupleElements(to);
                if (sources.length === targets.length) {
                    var elements = [];
                    for (var index = 0; index < sources.length; ++index) {
                        var element = Conversions.explicit(sources[index], targets[index]);
                        if (element === null)
                            return null;
                        elements.push(element);
                    }
                    return conversion('tuple', from, to, { elements: elements, explicit: true });
                }
            }
            return null;
        },

        // Downcasts: object to a class, a class to a derived one, interfaces.
        isExplicitReference: function (from, to) {
            if (!CS.isReferenceType(from) || !CS.isReferenceType(to))
                return false;
            if (CS.isSpecial(from, 'object') || from.kind === 'dynamic')
                return true;
            if (to.kind === 'named' && from.kind === 'named') {
                if (to.sym.kind === 'class' && from.sym.kind === 'class')
                    return Conversions.isImplicitReference(to, from);
                if (to.sym.kind === 'interface' && from.sym.kind === 'class')
                    return !from.sym.mods.sealed || Conversions.implementsInterface(from, to);
                if (from.sym.kind === 'interface' && (to.sym.kind === 'class' || to.sym.kind === 'delegate'))
                    return !to.sym.mods.sealed || Conversions.implementsInterface(to, from);
                if (from.sym.kind === 'interface' && to.sym.kind === 'interface')
                    return true;
                if (to.sym.kind === 'delegate' && (from.sym.qname === 'System.Delegate' || from.sym.qname === 'System.MulticastDelegate'))
                    return true;
            }
            if (to.kind === 'array') {
                if (from.kind === 'named' && (from.sym.qname === 'System.Array' || from.sym.kind === 'interface'))
                    return true;
                if (from.kind === 'array')
                    return from.rank === to.rank && CS.isReferenceType(from.elem) && CS.isReferenceType(to.elem) &&
                        Conversions.explicit(from.elem, to.elem) !== null;
            }
            if (from.kind === 'array' && to.kind === 'named' && to.sym.kind === 'interface')
                return true;
            return false;
        },

        // object, ValueType, Enum and interfaces to a value type.
        isUnboxing: function (from, to) {
            if (!CS.isValueType(to) || to.kind === 'tparam')
                return false;
            var target = CS.underlyingNullable(to);
            if (CS.isSpecial(from, 'object') || from.kind === 'dynamic')
                return true;
            if (from.kind !== 'named')
                return false;
            if (from.sym.qname === 'System.ValueType')
                return true;
            if (from.sym.qname === 'System.Enum')
                return CS.isEnum(target);
            if (from.sym.kind === 'interface')
                return Conversions.implementsInterface(target, from);
            return false;
        },

        // --- Overload resolution

        // T1 is a better conversion target than T2 (C# 12.6.4.7).
        betterTarget: function (first, second) {
            if (CS.sameType(first, second))
                return 0;
            var firstToSecond = Conversions.implicit(first, second) !== null;
            var secondToFirst = Conversions.implicit(second, first) !== null;
            if (firstToSecond && !secondToFirst)
                return 1;
            if (secondToFirst && !firstToSecond)
                return 2;
            var a = CS.keywordOf(first), b = CS.keywordOf(second);
            if (BETTER_SIGNED[a] !== undefined && BETTER_SIGNED[a].indexOf(b) >= 0)
                return 1;
            if (BETTER_SIGNED[b] !== undefined && BETTER_SIGNED[b].indexOf(a) >= 0)
                return 2;
            // Task<X> and delegates: by their results.
            if (first.kind === 'named' && second.kind === 'named' && CS.isDelegate(first) && CS.isDelegate(second)) {
                var firstInvoke = CS.delegateInvoke(first), secondInvoke = CS.delegateInvoke(second);
                if (firstInvoke.returnType.kind !== 'void' && secondInvoke.returnType.kind === 'void')
                    return 1;
                if (secondInvoke.returnType.kind !== 'void' && firstInvoke.returnType.kind === 'void')
                    return 2;
            }
            return 0;
        }
    };

    CS.Conversions = Conversions;
})(globalThis);
